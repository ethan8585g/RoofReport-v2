import { Hono } from 'hono'
import type { Bindings } from '../types'

export const crmRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Validate customer session token
// ============================================================
async function getOwnerId(c: any): Promise<number | null> {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await c.env.DB.prepare(
    "SELECT customer_id FROM customer_sessions WHERE session_token = ? AND expires_at > datetime('now')"
  ).bind(token).first<any>()
  return session ? session.customer_id : null
}

// ============================================================
// CRM CUSTOMERS
// ============================================================

// LIST customers for this owner
crmRoutes.get('/customers', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const search = c.req.query('search') || ''
  const status = c.req.query('status') || ''

  let q = `SELECT cc.*, 
    (SELECT COALESCE(SUM(ci.total),0) FROM crm_invoices ci WHERE ci.crm_customer_id = cc.id AND ci.status = 'paid') as lifetime_value,
    (SELECT COUNT(*) FROM crm_invoices ci WHERE ci.crm_customer_id = cc.id) as invoice_count,
    (SELECT COUNT(*) FROM crm_proposals cp WHERE cp.crm_customer_id = cc.id) as proposal_count,
    (SELECT COUNT(*) FROM crm_jobs cj WHERE cj.crm_customer_id = cc.id) as job_count
    FROM crm_customers cc WHERE cc.owner_id = ?`
  const params: any[] = [ownerId]
  if (search) { q += ` AND (cc.name LIKE ? OR cc.email LIKE ? OR cc.phone LIKE ? OR cc.address LIKE ?)`; const s = `%${search}%`; params.push(s, s, s, s) }
  if (status) { q += ` AND cc.status = ?`; params.push(status) }
  q += ` ORDER BY cc.created_at DESC`
  const customers = await c.env.DB.prepare(q).bind(...params).all()

  // Stats
  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_count
    FROM crm_customers WHERE owner_id = ?
  `).bind(ownerId).first()

  return c.json({ customers: customers.results, stats })
})

// GET single customer + history
crmRoutes.get('/customers/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const customer = await c.env.DB.prepare(
    'SELECT * FROM crm_customers WHERE id = ? AND owner_id = ?'
  ).bind(id, ownerId).first()
  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  const invoices = await c.env.DB.prepare(
    'SELECT * FROM crm_invoices WHERE crm_customer_id = ? AND owner_id = ? ORDER BY created_at DESC'
  ).bind(id, ownerId).all()
  const proposals = await c.env.DB.prepare(
    'SELECT * FROM crm_proposals WHERE crm_customer_id = ? AND owner_id = ? ORDER BY created_at DESC'
  ).bind(id, ownerId).all()
  const jobs = await c.env.DB.prepare(
    'SELECT * FROM crm_jobs WHERE crm_customer_id = ? AND owner_id = ? ORDER BY scheduled_date DESC'
  ).bind(id, ownerId).all()

  return c.json({ customer, invoices: invoices.results, proposals: proposals.results, jobs: jobs.results })
})

// CREATE customer
crmRoutes.post('/customers', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const { name, email, phone, company, address, city, province, postal_code, notes, tags } = await c.req.json()
  if (!name) return c.json({ error: 'Customer name is required' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO crm_customers (owner_id, name, email, phone, company, address, city, province, postal_code, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(ownerId, name, email || null, phone || null, company || null, address || null, city || null, province || null, postal_code || null, notes || null, tags || null).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// UPDATE customer
crmRoutes.put('/customers/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const body = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE crm_customers SET name=?, email=?, phone=?, company=?, address=?, city=?, province=?, postal_code=?, notes=?, tags=?, status=?, updated_at=datetime('now')
    WHERE id = ? AND owner_id = ?
  `).bind(body.name, body.email || null, body.phone || null, body.company || null, body.address || null, body.city || null, body.province || null, body.postal_code || null, body.notes || null, body.tags || null, body.status || 'active', id, ownerId).run()
  return c.json({ success: true })
})

// DELETE customer
crmRoutes.delete('/customers/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  await c.env.DB.prepare('DELETE FROM crm_customers WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), ownerId).run()
  return c.json({ success: true })
})

// ============================================================
// CRM INVOICES
// ============================================================

function genInvoiceNum() { const d = new Date().toISOString().slice(0,10).replace(/-/g,''); return `INV-${d}-${Math.floor(Math.random()*9999).toString().padStart(4,'0')}` }

crmRoutes.get('/invoices', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const status = c.req.query('status') || ''

  let q = `SELECT ci.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone
    FROM crm_invoices ci LEFT JOIN crm_customers cc ON cc.id = ci.crm_customer_id WHERE ci.owner_id = ?`
  const params: any[] = [ownerId]
  if (status === 'owing') { q += ` AND ci.status IN ('draft','sent','viewed','overdue')`; }
  else if (status === 'paid') { q += ` AND ci.status = 'paid'`; }
  else if (status) { q += ` AND ci.status = ?`; params.push(status) }
  q += ` ORDER BY ci.created_at DESC`

  const invoices = await c.env.DB.prepare(q).bind(...params).all()
  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_paid,
      SUM(CASE WHEN status IN ('draft','sent','viewed','overdue') THEN total ELSE 0 END) as total_owing,
      SUM(CASE WHEN status='overdue' THEN total ELSE 0 END) as total_overdue
    FROM crm_invoices WHERE owner_id = ?
  `).bind(ownerId).first()
  return c.json({ invoices: invoices.results, stats })
})

crmRoutes.get('/invoices/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const inv = await c.env.DB.prepare(
    `SELECT ci.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone, cc.address as customer_address, cc.city as customer_city, cc.province as customer_province, cc.postal_code as customer_postal
     FROM crm_invoices ci LEFT JOIN crm_customers cc ON cc.id = ci.crm_customer_id WHERE ci.id = ? AND ci.owner_id = ?`
  ).bind(c.req.param('id'), ownerId).first()
  if (!inv) return c.json({ error: 'Invoice not found' }, 404)
  const items = await c.env.DB.prepare('SELECT * FROM crm_invoice_items WHERE invoice_id = ? ORDER BY sort_order').bind(c.req.param('id')).all()
  return c.json({ invoice: inv, items: items.results })
})

crmRoutes.post('/invoices', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const { crm_customer_id, items, due_date, notes, terms, tax_rate } = await c.req.json()
  if (!crm_customer_id) return c.json({ error: 'Customer is required' }, 400)

  const taxR = tax_rate || 5.0
  let subtotal = 0
  if (items && items.length > 0) { for (const it of items) subtotal += (it.quantity || 1) * (it.unit_price || 0) }
  const taxAmt = Math.round(subtotal * taxR) / 100
  const total = subtotal + taxAmt
  const invNum = genInvoiceNum()

  const result = await c.env.DB.prepare(`
    INSERT INTO crm_invoices (owner_id, crm_customer_id, invoice_number, subtotal, tax_rate, tax_amount, total, due_date, notes, terms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).bind(ownerId, crm_customer_id, invNum, subtotal, taxR, taxAmt, total, due_date || null, notes || null, terms || 'Payment due within 30 days.').run()

  const invoiceId = result.meta.last_row_id
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const amt = (it.quantity || 1) * (it.unit_price || 0)
      await c.env.DB.prepare(
        'INSERT INTO crm_invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES (?,?,?,?,?,?)'
      ).bind(invoiceId, it.description || '', it.quantity || 1, it.unit_price || 0, amt, i).run()
    }
  }
  return c.json({ success: true, id: invoiceId, invoice_number: invNum })
})

crmRoutes.put('/invoices/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const body = await c.req.json()
  const id = c.req.param('id')
  
  // If updating status
  if (body.status) {
    let extra = ''
    if (body.status === 'paid') extra = ", paid_date = date('now')"
    if (body.status === 'sent') extra = ", sent_date = date('now')"
    await c.env.DB.prepare(`UPDATE crm_invoices SET status = ?${extra}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`).bind(body.status, id, ownerId).run()
    return c.json({ success: true })
  }

  // Full update with items
  const taxR = body.tax_rate || 5.0
  let subtotal = 0
  if (body.items) { for (const it of body.items) subtotal += (it.quantity || 1) * (it.unit_price || 0) }
  const taxAmt = Math.round(subtotal * taxR) / 100
  const total = subtotal + taxAmt

  await c.env.DB.prepare(`
    UPDATE crm_invoices SET crm_customer_id=?, subtotal=?, tax_rate=?, tax_amount=?, total=?, due_date=?, notes=?, terms=?, updated_at=datetime('now')
    WHERE id=? AND owner_id=?
  `).bind(body.crm_customer_id, subtotal, taxR, taxAmt, total, body.due_date || null, body.notes || null, body.terms || null, id, ownerId).run()

  // Replace items
  await c.env.DB.prepare('DELETE FROM crm_invoice_items WHERE invoice_id = ?').bind(id).run()
  if (body.items && body.items.length > 0) {
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i]
      await c.env.DB.prepare(
        'INSERT INTO crm_invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES (?,?,?,?,?,?)'
      ).bind(id, it.description || '', it.quantity || 1, it.unit_price || 0, (it.quantity || 1) * (it.unit_price || 0), i).run()
    }
  }
  return c.json({ success: true })
})

crmRoutes.delete('/invoices/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  await c.env.DB.prepare('DELETE FROM crm_invoice_items WHERE invoice_id = ?').bind(c.req.param('id')).run()
  await c.env.DB.prepare('DELETE FROM crm_invoices WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), ownerId).run()
  return c.json({ success: true })
})

// ============================================================
// CRM PROPOSALS
// ============================================================

function genProposalNum() { const d = new Date().toISOString().slice(0,10).replace(/-/g,''); return `PROP-${d}-${Math.floor(Math.random()*9999).toString().padStart(4,'0')}` }

crmRoutes.get('/proposals', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const status = c.req.query('status') || ''
  let q = `SELECT cp.*, cc.name as customer_name FROM crm_proposals cp LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id WHERE cp.owner_id = ?`
  const params: any[] = [ownerId]
  if (status === 'open') q += ` AND cp.status IN ('draft','sent','viewed')`
  else if (status === 'sold') q += ` AND cp.status = 'accepted'`
  else if (status) { q += ` AND cp.status = ?`; params.push(status) }
  q += ` ORDER BY cp.created_at DESC`
  const proposals = await c.env.DB.prepare(q).bind(...params).all()

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status IN ('draft','sent','viewed') THEN total_amount ELSE 0 END) as open_value,
      SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as sold_value,
      SUM(CASE WHEN status IN ('draft','sent','viewed') THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as sold_count
    FROM crm_proposals WHERE owner_id = ?
  `).bind(ownerId).first()
  return c.json({ proposals: proposals.results, stats })
})

crmRoutes.post('/proposals', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const body = await c.req.json()
  if (!body.crm_customer_id || !body.title) return c.json({ error: 'Customer and title required' }, 400)
  const total = (body.labor_cost || 0) + (body.material_cost || 0) + (body.other_cost || 0)
  const propNum = genProposalNum()

  const result = await c.env.DB.prepare(`
    INSERT INTO crm_proposals (owner_id, crm_customer_id, proposal_number, title, property_address, scope_of_work, materials_detail, labor_cost, material_cost, other_cost, total_amount, valid_until, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).bind(ownerId, body.crm_customer_id, propNum, body.title, body.property_address || null, body.scope_of_work || null, body.materials_detail || null, body.labor_cost || 0, body.material_cost || 0, body.other_cost || 0, total, body.valid_until || null, body.notes || null).run()
  return c.json({ success: true, id: result.meta.last_row_id, proposal_number: propNum })
})

crmRoutes.put('/proposals/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const body = await c.req.json()
  const id = c.req.param('id')

  if (body.status && Object.keys(body).length <= 2) {
    await c.env.DB.prepare("UPDATE crm_proposals SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?").bind(body.status, id, ownerId).run()
    return c.json({ success: true })
  }

  const total = (body.labor_cost || 0) + (body.material_cost || 0) + (body.other_cost || 0)
  await c.env.DB.prepare(`
    UPDATE crm_proposals SET crm_customer_id=?, title=?, property_address=?, scope_of_work=?, materials_detail=?, labor_cost=?, material_cost=?, other_cost=?, total_amount=?, valid_until=?, notes=?, status=?, updated_at=datetime('now')
    WHERE id=? AND owner_id=?
  `).bind(body.crm_customer_id, body.title, body.property_address || null, body.scope_of_work || null, body.materials_detail || null, body.labor_cost || 0, body.material_cost || 0, body.other_cost || 0, total, body.valid_until || null, body.notes || null, body.status || 'draft', id, ownerId).run()
  return c.json({ success: true })
})

crmRoutes.delete('/proposals/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  await c.env.DB.prepare('DELETE FROM crm_proposals WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), ownerId).run()
  return c.json({ success: true })
})

// ============================================================
// CRM JOBS
// ============================================================

function genJobNum() { const d = new Date().toISOString().slice(0,10).replace(/-/g,''); return `JOB-${d}-${Math.floor(Math.random()*9999).toString().padStart(4,'0')}` }

const DEFAULT_CHECKLIST = [
  { item_type: 'permit', label: 'Building Permit', sort_order: 0 },
  { item_type: 'material', label: 'Material Delivery', sort_order: 1 },
  { item_type: 'dumpster', label: 'Dumpster Ordered', sort_order: 2 },
  { item_type: 'inspection', label: 'Final Inspection', sort_order: 3 },
]

crmRoutes.get('/jobs', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const month = c.req.query('month') || ''
  const status = c.req.query('status') || ''

  let q = `SELECT cj.*, cc.name as customer_name, cc.phone as customer_phone
    FROM crm_jobs cj LEFT JOIN crm_customers cc ON cc.id = cj.crm_customer_id WHERE cj.owner_id = ?`
  const params: any[] = [ownerId]
  if (month) { q += ` AND cj.scheduled_date LIKE ?`; params.push(`${month}%`) }
  if (status) { q += ` AND cj.status = ?`; params.push(status) }
  q += ` ORDER BY cj.scheduled_date ASC`
  const jobs = await c.env.DB.prepare(q).bind(...params).all()

  const stats = await c.env.DB.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
    FROM crm_jobs WHERE owner_id = ?
  `).bind(ownerId).first()
  return c.json({ jobs: jobs.results, stats })
})

crmRoutes.get('/jobs/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const job = await c.env.DB.prepare(
    `SELECT cj.*, cc.name as customer_name, cc.phone as customer_phone, cc.address as customer_address
     FROM crm_jobs cj LEFT JOIN crm_customers cc ON cc.id = cj.crm_customer_id WHERE cj.id = ? AND cj.owner_id = ?`
  ).bind(id, ownerId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  const checklist = await c.env.DB.prepare('SELECT * FROM crm_job_checklist WHERE job_id = ? ORDER BY sort_order').bind(id).all()
  return c.json({ job, checklist: checklist.results })
})

crmRoutes.post('/jobs', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const body = await c.req.json()
  if (!body.title || !body.scheduled_date) return c.json({ error: 'Title and date required' }, 400)

  const jobNum = genJobNum()
  const result = await c.env.DB.prepare(`
    INSERT INTO crm_jobs (owner_id, crm_customer_id, proposal_id, job_number, title, property_address, job_type, scheduled_date, scheduled_time, estimated_duration, crew_size, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).bind(ownerId, body.crm_customer_id || null, body.proposal_id || null, jobNum, body.title, body.property_address || null, body.job_type || 'install', body.scheduled_date, body.scheduled_time || null, body.estimated_duration || null, body.crew_size || null, body.notes || null).run()

  const jobId = result.meta.last_row_id
  // Seed default checklist
  for (const item of DEFAULT_CHECKLIST) {
    await c.env.DB.prepare(
      'INSERT INTO crm_job_checklist (job_id, item_type, label, sort_order) VALUES (?,?,?,?)'
    ).bind(jobId, item.item_type, item.label, item.sort_order).run()
  }
  return c.json({ success: true, id: jobId, job_number: jobNum })
})

crmRoutes.put('/jobs/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const body = await c.req.json()
  const id = c.req.param('id')

  if (body.status && Object.keys(body).length <= 2) {
    let extra = ''
    if (body.status === 'completed') extra = ", completed_date = date('now')"
    await c.env.DB.prepare(`UPDATE crm_jobs SET status = ?${extra}, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`).bind(body.status, id, ownerId).run()
    return c.json({ success: true })
  }

  await c.env.DB.prepare(`
    UPDATE crm_jobs SET crm_customer_id=?, title=?, property_address=?, job_type=?, scheduled_date=?, scheduled_time=?, estimated_duration=?, crew_size=?, notes=?, status=?, updated_at=datetime('now')
    WHERE id=? AND owner_id=?
  `).bind(body.crm_customer_id || null, body.title, body.property_address || null, body.job_type || 'install', body.scheduled_date, body.scheduled_time || null, body.estimated_duration || null, body.crew_size || null, body.notes || null, body.status || 'scheduled', id, ownerId).run()
  return c.json({ success: true })
})

// Toggle checklist item
crmRoutes.put('/jobs/:jobId/checklist/:itemId', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const { jobId, itemId } = c.req.param() as any
  const body = await c.req.json()

  // Verify job ownership
  const job = await c.env.DB.prepare('SELECT id FROM crm_jobs WHERE id = ? AND owner_id = ?').bind(jobId, ownerId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE crm_job_checklist SET is_completed = ?, completed_at = ?, notes = ? WHERE id = ? AND job_id = ?
  `).bind(body.is_completed ? 1 : 0, body.is_completed ? new Date().toISOString() : null, body.notes || null, itemId, jobId).run()
  return c.json({ success: true })
})

crmRoutes.delete('/jobs/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM crm_job_checklist WHERE job_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM crm_jobs WHERE id = ? AND owner_id = ?').bind(id, ownerId).run()
  return c.json({ success: true })
})

// ============================================================
// CRM DASHBOARD STATS — Aggregated counts for the dashboard tiles
// ============================================================
crmRoutes.get('/stats', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ customers: 0, invoices_owing: 0, proposals_open: 0, jobs_upcoming: 0 })

  try {
    const customerCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM crm_customers WHERE owner_id = ?"
    ).bind(ownerId).first<any>()

    const invoicesOwing = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM crm_invoices WHERE owner_id = ? AND status IN ('draft','sent','viewed','overdue')"
    ).bind(ownerId).first<any>()

    const proposalsOpen = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM crm_proposals WHERE owner_id = ? AND status IN ('draft','sent','viewed')"
    ).bind(ownerId).first<any>()

    const jobsUpcoming = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM crm_jobs WHERE owner_id = ? AND status IN ('scheduled','in_progress')"
    ).bind(ownerId).first<any>()

    return c.json({
      customers: customerCount?.cnt || 0,
      invoices_owing: invoicesOwing?.cnt || 0,
      proposals_open: proposalsOpen?.cnt || 0,
      jobs_upcoming: jobsUpcoming?.cnt || 0
    })
  } catch (e) {
    // Tables might not exist yet — return zeroes
    return c.json({ customers: 0, invoices_owing: 0, proposals_open: 0, jobs_upcoming: 0 })
  }
})
