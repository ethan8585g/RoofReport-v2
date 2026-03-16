import { Hono } from 'hono'
import type { Bindings } from '../types'
import { resolveTeamOwner } from './team'

export const crmRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Validate customer session token
// Now supports team members: resolves to owner's account
// so team members see/manage the owner's CRM data.
// ============================================================
async function getOwnerId(c: any): Promise<number | null> {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await c.env.DB.prepare(
    "SELECT customer_id FROM customer_sessions WHERE session_token = ? AND expires_at > datetime('now')"
  ).bind(token).first<any>()
  if (!session) return null

  // Resolve team membership — if this user is a team member, return owner's ID
  const { ownerId } = await resolveTeamOwner(c.env.DB, session.customer_id)
  return ownerId
}

// ============================================================
// HELPER: Resolve customer ID — auto-create if new_customer provided
// ============================================================
async function resolveCustomerId(c: any, ownerId: number, body: any): Promise<{ id: number | null; error?: string }> {
  // If an existing customer ID is provided, use it
  if (body.crm_customer_id) {
    return { id: body.crm_customer_id }
  }
  // If new_customer payload is provided, auto-create a CRM customer
  if (body.new_customer) {
    const nc = body.new_customer
    if (!nc.name || !nc.name.trim()) {
      return { id: null, error: 'New customer name is required' }
    }
    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO crm_customers (owner_id, name, email, phone, company, address, city, province, postal_code, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).bind(
        ownerId, nc.name.trim(), nc.email || null, nc.phone || null,
        nc.company || null, nc.address || null, nc.city || null,
        nc.province || null, nc.postal_code || null
      ).run()
      if (!result.meta.last_row_id) {
        return { id: null, error: 'Failed to create customer' }
      }
      return { id: result.meta.last_row_id as number }
    } catch (err: any) {
      return { id: null, error: 'Failed to create customer: ' + err.message }
    }
  }
  return { id: null, error: 'Customer is required' }
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
  try {
    const { name, email, phone, company, address, city, province, postal_code, notes, tags } = await c.req.json()
    if (!name) return c.json({ error: 'Customer name is required' }, 400)

    const result = await c.env.DB.prepare(`
      INSERT INTO crm_customers (owner_id, name, email, phone, company, address, city, province, postal_code, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(ownerId, name, email || null, phone || null, company || null, address || null, city || null, province || null, postal_code || null, notes || null, tags || null).run()

    // Verify the insert succeeded by reading back
    if (!result.meta.last_row_id) {
      return c.json({ error: 'Database insert failed — no row created. Please try again.' }, 500)
    }

    const saved = await c.env.DB.prepare(
      'SELECT id, name, email FROM crm_customers WHERE id = ? AND owner_id = ?'
    ).bind(result.meta.last_row_id, ownerId).first()

    if (!saved) {
      return c.json({ error: 'Data was not persisted. Please contact support.' }, 500)
    }

    return c.json({ success: true, id: result.meta.last_row_id, verified: true })
  } catch (err: any) {
    console.error('[CRM] Customer create failed:', err.message)
    return c.json({ error: 'Failed to save customer: ' + err.message }, 500)
  }
})

// UPDATE customer
crmRoutes.put('/customers/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const result = await c.env.DB.prepare(`
      UPDATE crm_customers SET name=?, email=?, phone=?, company=?, address=?, city=?, province=?, postal_code=?, notes=?, tags=?, status=?, updated_at=datetime('now')
      WHERE id = ? AND owner_id = ?
    `).bind(body.name, body.email || null, body.phone || null, body.company || null, body.address || null, body.city || null, body.province || null, body.postal_code || null, body.notes || null, body.tags || null, body.status || 'active', id, ownerId).run()

    if (!result.meta.changes || result.meta.changes === 0) {
      return c.json({ error: 'No customer found or no changes made.' }, 404)
    }

    return c.json({ success: true, verified: true })
  } catch (err: any) {
    console.error('[CRM] Customer update failed:', err.message)
    return c.json({ error: 'Failed to update customer: ' + err.message }, 500)
  }
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
  try {
    const body = await c.req.json()
    const { items, due_date, notes, terms, tax_rate } = body

    // Resolve customer — either existing or auto-create new
    const custResult = await resolveCustomerId(c, ownerId, body)
    if (!custResult.id) return c.json({ error: custResult.error || 'Customer is required' }, 400)
    const customerId = custResult.id

    const taxR = tax_rate || 5.0
    let subtotal = 0
    if (items && items.length > 0) { for (const it of items) subtotal += (it.quantity || 1) * (it.unit_price || 0) }
    // taxR is a percentage (e.g. 5.0 = 5% GST) — proper rounding to cents
    const taxAmt = Math.round(subtotal * (taxR / 100) * 100) / 100
    const total = Math.round((subtotal + taxAmt) * 100) / 100
    const invNum = genInvoiceNum()

    const result = await c.env.DB.prepare(`
      INSERT INTO crm_invoices (owner_id, crm_customer_id, invoice_number, subtotal, tax_rate, tax_amount, total, due_date, notes, terms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).bind(ownerId, customerId, invNum, subtotal, taxR, taxAmt, total, due_date || null, notes || null, terms || 'Payment due within 30 days.').run()

    const invoiceId = result.meta.last_row_id
    if (!invoiceId) {
      return c.json({ error: 'Failed to create invoice — database write failed.' }, 500)
    }

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
  } catch (err: any) {
    console.error('[CRM] Invoice create failed:', err.message)
    return c.json({ error: 'Failed to save invoice: ' + err.message }, 500)
  }
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
  // taxR is a percentage (e.g. 5.0 = 5% GST) — proper rounding to cents
  const taxAmt = Math.round(subtotal * (taxR / 100) * 100) / 100
  const total = Math.round((subtotal + taxAmt) * 100) / 100

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
// CRM PROPOSALS — with line items, tax, warranty, Gmail send
// ============================================================

function genProposalNum() { const d = new Date().toISOString().slice(0,10).replace(/-/g,''); return `PROP-${d}-${Math.floor(Math.random()*9999).toString().padStart(4,'0')}` }

// LIST proposals
crmRoutes.get('/proposals', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const status = c.req.query('status') || ''
  let q = `SELECT cp.*, cc.name as customer_name, cc.email as customer_email, COALESCE(cp.view_count, 0) as view_count FROM crm_proposals cp LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id WHERE cp.owner_id = ?`
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

// GET single proposal with line items
crmRoutes.get('/proposals/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const proposal = await c.env.DB.prepare(`
    SELECT cp.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone,
           cc.address as customer_address, cc.city as customer_city, cc.province as customer_province
    FROM crm_proposals cp LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id
    WHERE cp.id = ? AND cp.owner_id = ?
  `).bind(id, ownerId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  const items = await c.env.DB.prepare('SELECT * FROM crm_proposal_items WHERE proposal_id = ? ORDER BY sort_order').bind(id).all()
  return c.json({ proposal, items: items.results })
})

// CREATE proposal with line items
crmRoutes.post('/proposals', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  try {
    const body = await c.req.json()
    if (!body.title) return c.json({ error: 'Title is required' }, 400)

    // Resolve customer — either existing or auto-create new
    const custResult = await resolveCustomerId(c, ownerId, body)
    if (!custResult.id) return c.json({ error: custResult.error || 'Customer is required' }, 400)
    const customerId = custResult.id

    const taxRate = body.tax_rate ?? 5.0
    let subtotal = 0

    // If line items provided, calculate from them
    if (body.items && body.items.length > 0) {
      for (const it of body.items) subtotal += (it.quantity || 1) * (it.unit_price || 0)
    } else {
      // Legacy: simple labor/material/other
      subtotal = (body.labor_cost || 0) + (body.material_cost || 0) + (body.other_cost || 0)
    }
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100
    const total = Math.round((subtotal + taxAmount) * 100) / 100
    const propNum = genProposalNum()

    const result = await c.env.DB.prepare(`
      INSERT INTO crm_proposals (owner_id, crm_customer_id, proposal_number, title, property_address, scope_of_work,
        materials_detail, labor_cost, material_cost, other_cost, subtotal, tax_rate, tax_amount, total_amount,
        valid_until, notes, warranty_terms, payment_terms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).bind(ownerId, customerId, propNum, body.title, body.property_address || null,
      body.scope_of_work || null, body.materials_detail || null,
      body.labor_cost || 0, body.material_cost || 0, body.other_cost || 0,
      subtotal, taxRate, taxAmount, total,
      body.valid_until || null, body.notes || null,
      body.warranty_terms || null, body.payment_terms || null).run()

    const proposalId = result.meta.last_row_id
    if (!proposalId) return c.json({ error: 'Failed to create proposal' }, 500)

    // Insert line items
    if (body.items && body.items.length > 0) {
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i]
        const amt = Math.round((it.quantity || 1) * (it.unit_price || 0) * 100) / 100
        await c.env.DB.prepare(
          'INSERT INTO crm_proposal_items (proposal_id, description, quantity, unit, unit_price, amount, sort_order) VALUES (?,?,?,?,?,?,?)'
        ).bind(proposalId, it.description || '', it.quantity || 1, it.unit || 'ea', it.unit_price || 0, amt, i).run()
      }
    }
    return c.json({ success: true, id: proposalId, proposal_number: propNum })
  } catch (err: any) {
    console.error('[CRM] Proposal create failed:', err.message)
    return c.json({ error: 'Failed to save proposal: ' + err.message }, 500)
  }
})

// UPDATE proposal with line items
crmRoutes.put('/proposals/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  try {
    const body = await c.req.json()
    const id = c.req.param('id')

    // Quick status-only update
    if (body.status && Object.keys(body).length <= 2) {
      await c.env.DB.prepare("UPDATE crm_proposals SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?").bind(body.status, id, ownerId).run()
      return c.json({ success: true })
    }

    // Resolve customer — either existing or auto-create new
    const custResult = await resolveCustomerId(c, ownerId, body)
    if (!custResult.id) return c.json({ error: custResult.error || 'Customer is required' }, 400)
    const customerId = custResult.id

    const taxRate = body.tax_rate ?? 5.0
    let subtotal = 0
    if (body.items && body.items.length > 0) {
      for (const it of body.items) subtotal += (it.quantity || 1) * (it.unit_price || 0)
    } else {
      subtotal = (body.labor_cost || 0) + (body.material_cost || 0) + (body.other_cost || 0)
    }
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100
    const total = Math.round((subtotal + taxAmount) * 100) / 100

    await c.env.DB.prepare(`
      UPDATE crm_proposals SET crm_customer_id=?, title=?, property_address=?, scope_of_work=?, materials_detail=?,
        labor_cost=?, material_cost=?, other_cost=?, subtotal=?, tax_rate=?, tax_amount=?, total_amount=?,
        valid_until=?, notes=?, warranty_terms=?, payment_terms=?, status=?, updated_at=datetime('now')
      WHERE id=? AND owner_id=?
    `).bind(customerId, body.title, body.property_address || null, body.scope_of_work || null,
      body.materials_detail || null, body.labor_cost || 0, body.material_cost || 0, body.other_cost || 0,
      subtotal, taxRate, taxAmount, total, body.valid_until || null, body.notes || null,
      body.warranty_terms || null, body.payment_terms || null,
      body.status || 'draft', id, ownerId).run()

    // Replace line items
    if (body.items) {
      await c.env.DB.prepare('DELETE FROM crm_proposal_items WHERE proposal_id = ?').bind(id).run()
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i]
        const amt = Math.round((it.quantity || 1) * (it.unit_price || 0) * 100) / 100
        await c.env.DB.prepare(
          'INSERT INTO crm_proposal_items (proposal_id, description, quantity, unit, unit_price, amount, sort_order) VALUES (?,?,?,?,?,?,?)'
        ).bind(id, it.description || '', it.quantity || 1, it.unit || 'ea', it.unit_price || 0, amt, i).run()
      }
    }
    return c.json({ success: true })
  } catch (err: any) {
    console.error('[CRM] Proposal update failed:', err.message)
    return c.json({ error: 'Failed to update proposal: ' + err.message }, 500)
  }
})

// DELETE proposal + its items
crmRoutes.delete('/proposals/:id', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM crm_proposal_items WHERE proposal_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM proposal_view_log WHERE proposal_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM crm_proposals WHERE id = ? AND owner_id = ?').bind(id, ownerId).run()
  return c.json({ success: true })
})

// Get proposal view stats + detailed log
crmRoutes.get('/proposals/:id/views', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')

  const proposal = await c.env.DB.prepare(
    'SELECT view_count, last_viewed_at, share_token, sent_at FROM crm_proposals WHERE id = ? AND owner_id = ?'
  ).bind(id, ownerId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  // Get detailed view log
  const viewLog = await c.env.DB.prepare(`
    SELECT viewed_at, ip_address, user_agent, referrer FROM proposal_view_log
    WHERE proposal_id = ? ORDER BY viewed_at DESC LIMIT 50
  `).bind(id).all()

  return c.json({
    view_count: proposal.view_count || 0,
    last_viewed_at: proposal.last_viewed_at,
    sent_at: proposal.sent_at,
    share_token: proposal.share_token,
    view_log: viewLog.results
  })
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

  // Resolve customer — either existing or auto-create new (optional for jobs)
  let customerId = body.crm_customer_id || null
  if (!customerId && body.new_customer && body.new_customer.name) {
    const custResult = await resolveCustomerId(c, ownerId, body)
    if (custResult.id) customerId = custResult.id
  }

  const jobNum = genJobNum()
  const result = await c.env.DB.prepare(`
    INSERT INTO crm_jobs (owner_id, crm_customer_id, proposal_id, job_number, title, property_address, job_type, scheduled_date, scheduled_time, estimated_duration, crew_size, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).bind(ownerId, customerId, body.proposal_id || null, jobNum, body.title, body.property_address || null, body.job_type || 'install', body.scheduled_date, body.scheduled_time || null, body.estimated_duration || null, body.crew_size || null, body.notes || null).run()

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

// Add custom checklist item
crmRoutes.post('/jobs/:jobId/checklist', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const jobId = c.req.param('jobId')
  const body = await c.req.json()
  if (!body.label || !body.label.trim()) return c.json({ error: 'Checklist item label is required' }, 400)

  // Verify job ownership
  const job = await c.env.DB.prepare('SELECT id FROM crm_jobs WHERE id = ? AND owner_id = ?').bind(jobId, ownerId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  // Get max sort_order for this job
  const maxOrder = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM crm_job_checklist WHERE job_id = ?').bind(jobId).first<any>()
  const nextOrder = (maxOrder?.max_order ?? -1) + 1

  const result = await c.env.DB.prepare(
    'INSERT INTO crm_job_checklist (job_id, item_type, label, sort_order) VALUES (?,?,?,?)'
  ).bind(jobId, body.item_type || 'custom', body.label.trim(), nextOrder).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// Delete checklist item
crmRoutes.delete('/jobs/:jobId/checklist/:itemId', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const { jobId, itemId } = c.req.param() as any

  // Verify job ownership
  const job = await c.env.DB.prepare('SELECT id FROM crm_jobs WHERE id = ? AND owner_id = ?').bind(jobId, ownerId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  await c.env.DB.prepare('DELETE FROM crm_job_checklist WHERE id = ? AND job_id = ?').bind(itemId, jobId).run()
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
// GMAIL OAUTH — Per-customer Gmail connection for sending proposals
// ============================================================

// Check Gmail connection status
crmRoutes.get('/gmail/status', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)

  const customer = await c.env.DB.prepare(
    'SELECT gmail_connected_email, gmail_connected_at FROM customers WHERE id = ?'
  ).bind(ownerId).first<any>()

  return c.json({
    connected: !!customer?.gmail_connected_email,
    email: customer?.gmail_connected_email || null,
    connected_at: customer?.gmail_connected_at || null
  })
})

// Start Gmail OAuth flow
crmRoutes.get('/gmail/connect', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)

  const clientId = (c.env as any).GMAIL_CLIENT_ID
  if (!clientId) {
    return c.json({ error: 'Gmail integration is not configured. Contact support.' }, 400)
  }

  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/api/crm/gmail/callback`

  const state = `${ownerId}:${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`
  
  // Store state in a temp session
  try {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (?, ?, ?)"
    ).bind(ownerId, 'gmail_oauth_state', state).run()
  } catch(e) {
    // If settings table doesn't have this key, create it
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS customer_gmail_state (id INTEGER PRIMARY KEY, customer_id INTEGER, state TEXT, created_at TEXT DEFAULT (datetime('now')))
    `).run().catch(() => {})
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  return c.json({ auth_url: authUrl.toString() })
})

// Gmail OAuth callback (browser redirect)
crmRoutes.get('/gmail/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')
  const state = c.req.query('state') || ''

  if (error || !code) {
    return c.html(`<!DOCTYPE html><html><head><title>Gmail Connection</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-times text-red-500 text-2xl"></i></div>
<h2 class="text-xl font-bold text-gray-800 mb-2">Connection Failed</h2>
<p class="text-gray-600 mb-4">${error || 'No authorization code received'}</p>
<button onclick="window.close()" class="bg-sky-600 text-white px-6 py-2 rounded-lg font-semibold">Close Window</button>
</div></body></html>`)
  }

  const customerId = parseInt(state.split(':')[0])
  if (!customerId) {
    return c.html(`<!DOCTYPE html><html><head><title>Gmail Connection</title></head><body><p>Invalid state. Please try again.</p></body></html>`)
  }

  const clientId = (c.env as any).GMAIL_CLIENT_ID
  // BUG FIX: Read client_secret from DB if not in env (admin may have stored it via /api/auth/gmail/setup)
  let clientSecret = (c.env as any).GMAIL_CLIENT_SECRET || ''
  if (!clientSecret) {
    try {
      const csRow = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'gmail_client_secret' AND master_company_id = 1"
      ).first<any>()
      if (csRow?.setting_value) clientSecret = csRow.setting_value
    } catch (e) { /* ignore */ }
  }

  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/api/crm/gmail/callback`

  if (!clientId || !clientSecret) {
    return c.html(`<!DOCTYPE html><html><head><title>Gmail Connection</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i></div>
<h2 class="text-xl font-bold text-gray-800 mb-2">Configuration Error</h2>
<p class="text-gray-600 mb-4">Gmail OAuth credentials are not configured. Ask your admin to set up GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.</p>
<button onclick="window.close()" class="bg-sky-600 text-white px-6 py-2 rounded-lg font-semibold">Close</button>
</div></body></html>`)
  }

  // Exchange code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    }).toString()
  })

  const tokenData: any = await tokenResp.json()
  if (!tokenResp.ok || !tokenData.refresh_token) {
    return c.html(`<!DOCTYPE html><html><head><title>Gmail Connection</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i></div>
<h2 class="text-xl font-bold text-gray-800 mb-2">Token Exchange Failed</h2>
<p class="text-gray-600 mb-4">${tokenData.error_description || 'Could not obtain refresh token'}</p>
<button onclick="window.close()" class="bg-sky-600 text-white px-6 py-2 rounded-lg font-semibold">Close</button>
</div></body></html>`)
  }

  // Get user email
  let gmailEmail = ''
  try {
    const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    })
    const profile: any = await profileResp.json()
    gmailEmail = profile.emailAddress || ''
  } catch(e) {}

  // Store tokens on the customer record
  await c.env.DB.prepare(`
    UPDATE customers SET gmail_refresh_token = ?, gmail_connected_email = ?, gmail_connected_at = datetime('now') WHERE id = ?
  `).bind(tokenData.refresh_token, gmailEmail, customerId).run()

  return c.html(`<!DOCTYPE html>
<html><head><title>Gmail Connected</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
<div class="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
  <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
    <i class="fas fa-check text-green-600 text-2xl"></i>
  </div>
  <h2 class="text-xl font-bold text-gray-800 mb-2">Gmail Connected!</h2>
  <p class="text-gray-600 mb-1">Successfully connected:</p>
  <p class="text-sky-600 font-semibold mb-4">${gmailEmail}</p>
  <p class="text-sm text-gray-500 mb-6">You can now send proposals directly from your Gmail. This window will close automatically.</p>
  <button onclick="window.close()" class="bg-sky-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-sky-700">Close Window</button>
</div>
<script>
  // Notify parent window
  if (window.opener) {
    window.opener.postMessage({ type: 'gmail_connected', email: '${gmailEmail}' }, '*');
    setTimeout(function() { window.close(); }, 3000);
  }
</script>
</body></html>`)
})

// Disconnect Gmail
crmRoutes.post('/gmail/disconnect', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)

  await c.env.DB.prepare(
    "UPDATE customers SET gmail_refresh_token = NULL, gmail_connected_email = NULL, gmail_connected_at = NULL WHERE id = ?"
  ).bind(ownerId).run()

  return c.json({ success: true })
})

// ============================================================
// ENHANCED PROPOSAL SEND — Email via customer's connected Gmail
// ============================================================
crmRoutes.post('/proposals/:id/send', async (c) => {
  const ownerId = await getOwnerId(c)
  if (!ownerId) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')

  const proposal = await c.env.DB.prepare(`
    SELECT cp.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone,
           cc.address as customer_address, cc.city as customer_city, cc.province as customer_province
    FROM crm_proposals cp LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id
    WHERE cp.id = ? AND cp.owner_id = ?
  `).bind(id, ownerId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  // Get line items for the email
  const itemsResult = await c.env.DB.prepare(
    'SELECT * FROM crm_proposal_items WHERE proposal_id = ? ORDER BY sort_order'
  ).bind(id).all()
  const lineItems = itemsResult.results || []

  // Generate share token if needed
  let shareToken = proposal.share_token
  if (!shareToken) {
    shareToken = crypto.randomUUID().replace(/-/g, '').substring(0, 16)
  }

  await c.env.DB.prepare(`
    UPDATE crm_proposals SET status = 'sent', share_token = ?, sent_at = datetime('now'), view_count = COALESCE(view_count, 0), updated_at = datetime('now')
    WHERE id = ? AND owner_id = ?
  `).bind(shareToken, id, ownerId).run()

  const baseUrl = new URL(c.req.url).origin
  const publicLink = `${baseUrl}/proposal/view/${shareToken}`

  // Try sending via customer's connected Gmail
  let emailSent = false
  let emailError = ''
  const customer = await c.env.DB.prepare(
    'SELECT gmail_refresh_token, gmail_connected_email, name, email, phone, brand_business_name, brand_logo_url, brand_primary_color FROM customers WHERE id = ?'
  ).bind(ownerId).first<any>()

  if (customer?.gmail_refresh_token && proposal.customer_email) {
    const clientId = (c.env as any).GMAIL_CLIENT_ID
    // Read client_secret from env or DB
    let clientSecret = (c.env as any).GMAIL_CLIENT_SECRET || ''
    if (!clientSecret) {
      try {
        const csRow = await c.env.DB.prepare(
          "SELECT setting_value FROM settings WHERE setting_key = 'gmail_client_secret' AND master_company_id = 1"
        ).first<any>()
        if (csRow?.setting_value) clientSecret = csRow.setting_value
      } catch (e) { /* ignore */ }
    }

    if (clientId && clientSecret) {
      try {
        // Refresh access token
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: customer.gmail_refresh_token,
            client_id: clientId,
            client_secret: clientSecret
          }).toString()
        })
        const tokenData: any = await tokenResp.json()

        if (tokenData.access_token) {
          const businessName = customer.brand_business_name || customer.name || 'Your Roofer'
          const fromEmail = customer.gmail_connected_email || customer.email
          const primaryColor = customer.brand_primary_color || '#0369a1'
          const fullAddress = [proposal.property_address, proposal.customer_city, proposal.customer_province].filter(Boolean).join(', ')

          // Build line items HTML for email
          let itemsHtml = ''
          if (lineItems.length > 0) {
            itemsHtml = '<table style="width:100%;border-collapse:collapse;margin:0 0 12px;">'
            itemsHtml += '<tr style="background:#f1f5f9;"><td style="color:#475569;font-size:11px;font-weight:600;padding:6px 8px;text-align:left;">Item</td><td style="color:#475569;font-size:11px;font-weight:600;padding:6px 8px;text-align:center;">Qty</td><td style="color:#475569;font-size:11px;font-weight:600;padding:6px 8px;text-align:right;">Price</td><td style="color:#475569;font-size:11px;font-weight:600;padding:6px 8px;text-align:right;">Amount</td></tr>'
            for (const item of lineItems) {
              itemsHtml += `<tr><td style="color:#374151;font-size:12px;padding:6px 8px;border-bottom:1px solid #f1f5f9;">${(item as any).description}</td><td style="color:#374151;font-size:12px;padding:6px 8px;text-align:center;border-bottom:1px solid #f1f5f9;">${(item as any).quantity} ${(item as any).unit || ''}</td><td style="color:#374151;font-size:12px;padding:6px 8px;text-align:right;border-bottom:1px solid #f1f5f9;">$${parseFloat((item as any).unit_price).toFixed(2)}</td><td style="color:#374151;font-size:12px;padding:6px 8px;text-align:right;border-bottom:1px solid #f1f5f9;">$${parseFloat((item as any).amount).toFixed(2)}</td></tr>`
            }
            itemsHtml += '</table>'
          }

          const emailHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:${primaryColor};padding:32px;border-radius:12px 12px 0 0;">
    ${customer.brand_logo_url ? `<img src="${customer.brand_logo_url}" alt="${businessName}" style="max-height:48px;margin-bottom:8px;">` : ''}
    <h1 style="color:#ffffff;margin:0;font-size:22px;">${businessName}</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">Roofing Proposal &middot; ${proposal.proposal_number}</p>
  </div>
  <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${proposal.customer_name || 'there'},</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Thank you for the opportunity to provide you with a roofing estimate. Please review your personalized proposal below.
    </p>
    
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Project</td><td style="color:#1e293b;font-size:13px;font-weight:600;text-align:right;">${proposal.title}</td></tr>
        ${fullAddress ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Property</td><td style="color:#1e293b;font-size:13px;text-align:right;">${fullAddress}</td></tr>` : ''}
      </table>
      ${itemsHtml}
      <table style="width:100%;border-collapse:collapse;">
        ${proposal.subtotal ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Subtotal</td><td style="color:#1e293b;font-size:13px;text-align:right;">$${parseFloat(proposal.subtotal).toFixed(2)}</td></tr>` : ''}
        ${proposal.tax_amount ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Tax (${proposal.tax_rate || 5}%)</td><td style="color:#1e293b;font-size:13px;text-align:right;">$${parseFloat(proposal.tax_amount).toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px;"></td></tr>
        <tr><td style="color:${primaryColor};font-size:18px;font-weight:700;padding:4px 0;">Total</td><td style="color:${primaryColor};font-size:18px;font-weight:700;text-align:right;">$${parseFloat(proposal.total_amount).toFixed(2)} CAD</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="${publicLink}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:15px;">
        View Full Proposal
      </a>
    </div>

    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
      ${proposal.valid_until ? 'This proposal is valid until ' + new Date(proposal.valid_until).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) + '.' : ''}
    </p>
  </div>
  <p style="color:#9ca3af;font-size:11px;text-align:center;margin:16px 0 0;padding:0;">
    Sent via RoofReporterAI &middot; ${fromEmail}
  </p>
</div>`

          // Build RFC 2822 MIME message
          const subject = `Roofing Proposal: ${proposal.title} — ${proposal.proposal_number}`
          const boundary = 'boundary_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16)
          const rawMessage = [
            `From: ${businessName} <${fromEmail}>`,
            `To: ${proposal.customer_email}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            '',
            `Hi ${proposal.customer_name || 'there'},\n\nPlease find your roofing proposal:\n\nProject: ${proposal.title}\nTotal: $${parseFloat(proposal.total_amount).toFixed(2)} CAD\n\nView your proposal: ${publicLink}\n\nBest regards,\n${businessName}`,
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            '',
            emailHtml,
            '',
            `--${boundary}--`
          ].join('\r\n')

          // Base64url encode
          const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

          const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encoded })
          })

          if (sendResp.ok) {
            emailSent = true
          } else {
            const errData: any = await sendResp.json().catch(() => ({}))
            emailError = errData?.error?.message || `Gmail API error (${sendResp.status})`
          }
        } else {
          emailError = 'Could not refresh Gmail token. Please reconnect Gmail.'
        }
      } catch(e: any) {
        emailError = e.message || 'Gmail send failed'
      }
    }
  } else if (!customer?.gmail_refresh_token) {
    emailError = 'Gmail not connected. Connect Gmail in settings to send proposals by email.'
  } else if (!proposal.customer_email) {
    emailError = 'Customer has no email address on file.'
  }

  // Schedule follow-up reminders before returning
  try {
    const followup48h = new Date(Date.now() + 48 * 3600000).toISOString()
    const followup7d = new Date(Date.now() + 7 * 24 * 3600000).toISOString()
    await c.env.DB.prepare(
      "INSERT INTO scheduled_tasks (owner_id, task_type, target_type, target_id, scheduled_for, metadata) VALUES (?, 'proposal_followup', 'proposal', ?, ?, '{\"reminder\": \"48h\"}')"
    ).bind(ownerId, parseInt(id), followup48h).run()
    await c.env.DB.prepare(
      "INSERT INTO scheduled_tasks (owner_id, task_type, target_type, target_id, scheduled_for, metadata) VALUES (?, 'proposal_followup', 'proposal', ?, ?, '{\"reminder\": \"7d\"}')"
    ).bind(ownerId, parseInt(id), followup7d).run()
  } catch {}

  // Track in revenue pipeline
  try {
    await c.env.DB.prepare(
      "INSERT INTO revenue_pipeline (owner_id, stage, amount, entity_type, entity_id, customer_name, property_address) VALUES (?, 'proposal_sent', ?, 'proposal', ?, ?, ?)"
    ).bind(ownerId, parseFloat(proposal.total_amount || 0), proposal.id, proposal.customer_name || '', proposal.property_address || '').run()
  } catch {}

  return c.json({
    success: true,
    share_token: shareToken,
    public_link: publicLink,
    email_sent: emailSent,
    email_error: emailError || null,
    sent_to: emailSent ? proposal.customer_email : null
  })
})

// ============================================================
// PROPOSAL ACCEPT/DECLINE — Public endpoint (no auth, uses share_token)
// Auto-creates invoice on acceptance + notifications + webhook
// ============================================================
crmRoutes.post('/proposals/respond/:token', async (c) => {
  const token = c.req.param('token')
  const { action, signature } = await c.req.json()

  if (!['accept', 'decline'].includes(action)) {
    return c.json({ error: 'Invalid action' }, 400)
  }

  const proposal = await c.env.DB.prepare(
    `SELECT cp.*, cc.name as customer_name, cc.email as customer_email
     FROM crm_proposals cp LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id
     WHERE cp.share_token = ?`
  ).bind(token).first<any>()

  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  if (proposal.status === 'accepted' || proposal.status === 'declined') {
    return c.json({ error: 'This proposal has already been ' + proposal.status }, 400)
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined'
  const dateCol = action === 'accept' ? 'accepted_at' : 'declined_at'

  await c.env.DB.prepare(`
    UPDATE crm_proposals SET status = ?, ${dateCol} = datetime('now'), customer_signature = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(newStatus, signature || null, proposal.id).run()

  // Cancel pending follow-ups for this proposal
  try {
    await c.env.DB.prepare(
      "UPDATE scheduled_tasks SET status = 'cancelled' WHERE target_type = 'proposal' AND target_id = ? AND status = 'pending'"
    ).bind(proposal.id).run()
  } catch {}

  // Create notification for the roofer
  try {
    const notifType = action === 'accept' ? 'proposal_accepted' : 'proposal_declined'
    const notifTitle = action === 'accept'
      ? `Proposal Accepted! ${proposal.customer_name} accepted ${proposal.proposal_number}`
      : `Proposal Declined — ${proposal.customer_name} declined ${proposal.proposal_number}`
    const notifMsg = action === 'accept'
      ? `${proposal.customer_name} accepted your $${parseFloat(proposal.total_amount || 0).toFixed(2)} proposal for ${proposal.title}. An invoice has been auto-created.`
      : `${proposal.customer_name} declined your proposal for ${proposal.title}. Consider following up with an alternative offer.`
    await c.env.DB.prepare(
      "INSERT INTO notifications (owner_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)"
    ).bind(proposal.owner_id, notifType, notifTitle, notifMsg, `/proposal/view/${token}`).run()
  } catch {}

  // Auto-create invoice on acceptance
  let autoInvoiceId = null
  if (action === 'accept') {
    try {
      // Get line items from proposal
      const propItems = await c.env.DB.prepare(
        'SELECT * FROM crm_proposal_items WHERE proposal_id = ? ORDER BY sort_order'
      ).bind(proposal.id).all<any>()

      const invoiceNumber = 'INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9999).toString().padStart(4, '0')
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)

      const subtotal = parseFloat(proposal.subtotal || proposal.total_amount || 0)
      const taxRate = parseFloat(proposal.tax_rate || 5)
      const taxAmount = parseFloat(proposal.tax_amount || (subtotal * taxRate / 100))
      const total = parseFloat(proposal.total_amount || (subtotal + taxAmount))

      // Find or create the customer in the main customers table
      let mainCustomerId = null
      if (proposal.customer_email) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM customers WHERE email = ?'
        ).bind(proposal.customer_email).first<any>()
        mainCustomerId = existing?.id
      }

      const invResult = await c.env.DB.prepare(`
        INSERT INTO invoices (invoice_number, customer_id, subtotal, tax_rate, tax_amount, total, status, due_date, notes, terms, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 'Payment due within 30 days.', 'auto-from-proposal')
      `).bind(
        invoiceNumber, mainCustomerId,
        Math.round(subtotal * 100) / 100, taxRate, Math.round(taxAmount * 100) / 100,
        Math.round(total * 100) / 100, dueDate.toISOString().slice(0, 10),
        `Auto-generated from accepted proposal ${proposal.proposal_number}`
      ).run()

      autoInvoiceId = invResult.meta.last_row_id

      // Copy line items to invoice
      if (propItems.results?.length && autoInvoiceId) {
        for (let i = 0; i < propItems.results.length; i++) {
          const it = propItems.results[i]
          const amt = Math.round((it.quantity || 1) * (it.unit_price || 0) * 100) / 100
          await c.env.DB.prepare(
            'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(autoInvoiceId, it.description, it.quantity || 1, it.unit_price || 0, amt, i).run()
        }
      }

      // Link invoice back to proposal
      await c.env.DB.prepare(
        "UPDATE crm_proposals SET auto_invoice_id = ? WHERE id = ?"
      ).bind(autoInvoiceId, proposal.id).run()
    } catch (invErr: any) {
      console.error('[Auto-Invoice] Error:', invErr.message)
    }
  }

  // Fire webhooks
  try {
    const hooks = await c.env.DB.prepare(
      "SELECT * FROM webhooks WHERE owner_id = ? AND event_type = ? AND is_active = 1"
    ).bind(proposal.owner_id, action === 'accept' ? 'proposal_accepted' : 'proposal_declined').all<any>()
    for (const hook of hooks.results || []) {
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': hook.secret || '' },
        body: JSON.stringify({ event: newStatus, proposal_id: proposal.id, proposal_number: proposal.proposal_number, customer: proposal.customer_name, total: proposal.total_amount, auto_invoice_id: autoInvoiceId })
      }).catch(() => {})
    }
  } catch {}

  // Track in revenue pipeline
  try {
    await c.env.DB.prepare(
      "INSERT INTO revenue_pipeline (owner_id, stage, amount, entity_type, entity_id, customer_name, property_address) VALUES (?, ?, ?, 'proposal', ?, ?, ?)"
    ).bind(proposal.owner_id, action === 'accept' ? 'proposal_accepted' : 'proposal_declined', parseFloat(proposal.total_amount || 0), proposal.id, proposal.customer_name || '', proposal.property_address || '').run()
  } catch {}

  return c.json({ success: true, status: newStatus, auto_invoice_id: autoInvoiceId })
})

// ============================================================
// TIERED PROPOSAL CREATION — Create Good/Better/Best proposals from pricing engine
// ============================================================
crmRoutes.post('/proposals/create-tiered', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)

  const body = await c.req.json()
  const { customer_id, property_address, scope_of_work, measurements, report_id, tiers } = body

  if (!customer_id || !tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return c.json({ error: 'customer_id and tiers array required' }, 400)
  }

  const groupId = 'GRP-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
  const proposalIds: number[] = []
  const shareTokens: string[] = []
  const tierLabels = ['Good', 'Better', 'Best']

  try {
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i]
      const label = tier.label || tierLabels[i] || `Tier ${i + 1}`
      const proposalNumber = 'PRP-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9999).toString().padStart(4, '0')
      const shareToken = [...Array(16)].map(() => Math.random().toString(36)[2]).join('')
      
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + 30)

      const result = await c.env.DB.prepare(`
        INSERT INTO crm_proposals (
          owner_id, crm_customer_id, proposal_number, title, property_address,
          scope_of_work, materials_detail, subtotal, tax_rate, tax_amount, total_amount,
          status, valid_until, share_token, proposal_group_id, tier_label, tier_order,
          source_report_id, source_type, pricing_engine_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        cust.ownerId, customer_id, proposalNumber,
        `${label} Roofing Package — ${property_address || 'Roof Project'}`,
        property_address || '',
        scope_of_work || tier.scope || `Complete ${label.toLowerCase()} roofing package with professional installation.`,
        tier.materials_detail || '',
        Math.round((tier.subtotal || 0) * 100) / 100,
        tier.tax_rate || 5,
        Math.round((tier.tax_amount || 0) * 100) / 100,
        Math.round((tier.total || 0) * 100) / 100,
        validUntil.toISOString().slice(0, 10),
        shareToken, groupId, label, i + 1,
        report_id || null,
        report_id ? 'report_auto' : 'pricing_engine',
        JSON.stringify(tier.engine_data || {})
      ).run()

      const propId = result.meta.last_row_id as number
      proposalIds.push(propId)
      shareTokens.push(shareToken)

      // Insert line items
      if (tier.items && Array.isArray(tier.items)) {
        for (let j = 0; j < tier.items.length; j++) {
          const item = tier.items[j]
          await c.env.DB.prepare(
            'INSERT INTO crm_proposal_items (proposal_id, description, quantity, unit, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(propId, item.description, item.quantity || 1, item.unit || 'ea', item.unitPrice || 0, item.amount || 0, j).run()
        }
      }

      // Track in revenue pipeline
      await c.env.DB.prepare(
        "INSERT INTO revenue_pipeline (owner_id, stage, amount, entity_type, entity_id, customer_name, property_address) VALUES (?, 'lead', ?, 'proposal', ?, ?, ?)"
      ).bind(cust.ownerId, tier.total || 0, propId, body.customer_name || '', property_address || '').run()
    }

    return c.json({
      success: true,
      group_id: groupId,
      proposal_ids: proposalIds,
      share_tokens: shareTokens,
      public_link: `/proposal/compare/${groupId}`
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to create tiered proposals: ' + err.message }, 500)
  }
})

// ============================================================
// REPORT → PROPOSAL PIPELINE — Generate proposals from a roof report
// ============================================================
crmRoutes.post('/proposals/from-report', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)

  const { report_id, customer_id, customer_name, property_address } = await c.req.json()
  if (!report_id) return c.json({ error: 'report_id required' }, 400)

  try {
    // Fetch the report raw data
    const report = await c.env.DB.prepare(
      'SELECT * FROM reports WHERE id = ? AND customer_id = ?'
    ).bind(report_id, cust.ownerId).first<any>()

    if (!report) return c.json({ error: 'Report not found' }, 404)

    // Parse measurements from report
    let rawData: any = {}
    try { rawData = JSON.parse(report.api_response_raw || '{}') } catch {}

    const trace = rawData.trace_measurement || rawData
    const edgeSummary = trace.edge_summary || rawData.edge_summary || {}

    const measurements = {
      total_area: parseFloat(trace.total_area_sqft || trace.total_area || report.total_area || 0),
      perimeter: parseFloat(edgeSummary.total_perimeter || trace.perimeter || 0),
      ridge_length: parseFloat(edgeSummary.ridge || trace.ridge_length || 0),
      hip_length: parseFloat(edgeSummary.hip || trace.hip_length || 0),
      valley_length: parseFloat(edgeSummary.valley || trace.valley_length || 0),
      eave_length: parseFloat(edgeSummary.eave || trace.eave_length || 0),
      rake_length: parseFloat(edgeSummary.rake || trace.rake_length || 0),
      step_flashing: parseFloat(edgeSummary.step_flashing || trace.step_flashing || 0),
      drip_edge: parseFloat(edgeSummary.drip_edge || trace.drip_edge || edgeSummary.eave || 0) + parseFloat(edgeSummary.rake || 0),
      ice_shield: parseFloat(edgeSummary.eave || trace.eave_length || 0),
      pitch: trace.predominant_pitch || trace.pitch || '6/12',
      facets: parseInt(trace.facet_count || trace.facets || 0)
    }

    // Get pricing presets
    let presets: any = null
    try {
      const ps = await c.env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'pricing_presets' AND customer_id = ?"
      ).bind(cust.ownerId).first<any>()
      if (ps?.value) presets = JSON.parse(ps.value)
    } catch {}

    // Forward to pricing engine
    const pricingResp = await fetch(new URL('/api/invoices/pricing/calculate', c.req.url).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': c.req.header('cookie') || '' },
      body: JSON.stringify({ measurements, presets, tiered: true })
    })

    if (!pricingResp.ok) {
      // Fallback: calculate locally with simple estimates
      const area = measurements.total_area || 1500
      const squares = area / 100
      const wasteMultiplier = 1.15

      const buildTier = (shingleCost: number, laborCost: number, label: string) => {
        const materialSubtotal = (squares * wasteMultiplier * shingleCost) + 
          (squares * wasteMultiplier * 25) +
          (measurements.drip_edge * 1.5) +
          (measurements.ridge_length * 3.25) +
          (measurements.valley_length * 2.75)
        const laborTotal = squares * laborCost
        const tearOff = squares * 45
        const disposal = squares * 25
        const subtotal = materialSubtotal + laborTotal + tearOff + disposal
        const tax = subtotal * 0.05
        return {
          label,
          subtotal: Math.round(subtotal * 100) / 100,
          tax_rate: 5,
          tax_amount: Math.round(tax * 100) / 100,
          total: Math.round((subtotal + tax) * 100) / 100,
          items: [
            { description: `${label} Shingles (${(squares * wasteMultiplier).toFixed(1)} sq)`, quantity: Math.ceil(squares * wasteMultiplier), unit: 'sq', unitPrice: shingleCost, amount: Math.round(squares * wasteMultiplier * shingleCost * 100) / 100 },
            { description: 'Underlayment', quantity: Math.ceil(squares * wasteMultiplier), unit: 'sq', unitPrice: 25, amount: Math.round(squares * wasteMultiplier * 25 * 100) / 100 },
            { description: 'Drip Edge', quantity: Math.round(measurements.drip_edge), unit: 'ft', unitPrice: 1.50, amount: Math.round(measurements.drip_edge * 1.50 * 100) / 100 },
            { description: 'Ridge Caps', quantity: Math.round(measurements.ridge_length), unit: 'ft', unitPrice: 3.25, amount: Math.round(measurements.ridge_length * 3.25 * 100) / 100 },
            { description: 'Valley Flashing', quantity: Math.round(measurements.valley_length), unit: 'ft', unitPrice: 2.75, amount: Math.round(measurements.valley_length * 2.75 * 100) / 100 },
            { description: 'Labor', quantity: Math.ceil(squares), unit: 'sq', unitPrice: laborCost, amount: Math.round(squares * laborCost * 100) / 100 },
            { description: 'Tear-Off & Disposal', quantity: Math.ceil(squares), unit: 'sq', unitPrice: 70, amount: Math.round(squares * 70 * 100) / 100 }
          ]
        }
      }

      const tieredData = [
        buildTier(125, 160, 'Good'),
        buildTier(145, 180, 'Better'),
        buildTier(185, 220, 'Best')
      ]

      return c.json({
        success: true,
        measurements,
        tiers: tieredData,
        report_id,
        source: 'local_fallback'
      })
    }

    const pricingData = await pricingResp.json() as any
    
    // Format as tiers for the frontend
    if (pricingData.tiered) {
      const tiers = Object.entries(pricingData.tiered).map(([key, value]: [string, any]) => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        subtotal: value.subtotal,
        tax_rate: value.taxRate || 5,
        tax_amount: value.taxAmount,
        total: value.total,
        items: value.lineItems || [],
        engine_data: value
      }))
      return c.json({ success: true, measurements, tiers, report_id, source: 'pricing_engine' })
    }

    return c.json({ success: true, measurements, single_proposal: pricingData, report_id })
  } catch (err: any) {
    return c.json({ error: 'Pipeline error: ' + err.message }, 500)
  }
})

// ============================================================
// NOTIFICATIONS — In-app notification endpoints
// ============================================================
crmRoutes.get('/notifications', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)

  const limit = parseInt(c.req.query('limit') || '20')
  const unread_only = c.req.query('unread') === '1'
  
  try {
    const query = unread_only
      ? 'SELECT * FROM notifications WHERE owner_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?'
    
    const { results } = await c.env.DB.prepare(query).bind(cust.ownerId, limit).all<any>()
    
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM notifications WHERE owner_id = ? AND is_read = 0'
    ).bind(cust.ownerId).first<any>()

    return c.json({ notifications: results || [], unread_count: countResult?.cnt || 0 })
  } catch {
    return c.json({ notifications: [], unread_count: 0 })
  }
})

crmRoutes.post('/notifications/:id/read', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const id = c.req.param('id')
  
  if (id === 'all') {
    await c.env.DB.prepare(
      "UPDATE notifications SET is_read = 1 WHERE owner_id = ? AND is_read = 0"
    ).bind(cust.ownerId).run()
  } else {
    await c.env.DB.prepare(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND owner_id = ?"
    ).bind(parseInt(id), cust.ownerId).run()
  }
  return c.json({ success: true })
})

// ============================================================
// WEBHOOKS MANAGEMENT — CRUD for webhook endpoints
// ============================================================
crmRoutes.get('/webhooks', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE owner_id = ? ORDER BY created_at DESC'
  ).bind(cust.ownerId).all<any>()
  return c.json({ webhooks: results || [] })
})

crmRoutes.post('/webhooks', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { event_type, url, secret } = await c.req.json()
  if (!event_type || !url) return c.json({ error: 'event_type and url required' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO webhooks (owner_id, event_type, url, secret) VALUES (?, ?, ?, ?)'
  ).bind(cust.ownerId, event_type, url, secret || '').run()
  return c.json({ success: true, id: result.meta.last_row_id })
})

crmRoutes.delete('/webhooks/:id', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  await c.env.DB.prepare(
    'DELETE FROM webhooks WHERE id = ? AND owner_id = ?'
  ).bind(parseInt(c.req.param('id')), cust.ownerId).run()
  return c.json({ success: true })
})

// ============================================================
// REVENUE PIPELINE ANALYTICS — Funnel data for dashboard
// ============================================================
crmRoutes.get('/analytics/pipeline', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)

  try {
    // Stage counts and amounts
    const stages = await c.env.DB.prepare(`
      SELECT stage, COUNT(*) as count, SUM(amount) as total_amount
      FROM revenue_pipeline WHERE owner_id = ?
      GROUP BY stage ORDER BY 
        CASE stage 
          WHEN 'lead' THEN 1 WHEN 'proposal_sent' THEN 2 WHEN 'proposal_viewed' THEN 3
          WHEN 'proposal_accepted' THEN 4 WHEN 'invoice_sent' THEN 5 WHEN 'invoice_paid' THEN 6
        END
    `).bind(cust.ownerId).all<any>()

    // Recent 30 days proposals
    const proposalStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN status IN ('sent','viewed') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'accepted' THEN CAST(total_amount AS REAL) ELSE 0 END) as accepted_amount,
        AVG(CASE WHEN status = 'accepted' THEN CAST(total_amount AS REAL) ELSE NULL END) as avg_deal_size
      FROM crm_proposals WHERE owner_id = ? AND created_at >= date('now', '-30 days')
    `).bind(cust.ownerId).first<any>()

    // Invoice stats
    const invoiceStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'paid' THEN CAST(total AS REAL) ELSE 0 END) as paid_amount,
        SUM(CASE WHEN status IN ('sent','viewed','overdue') THEN CAST(total AS REAL) ELSE 0 END) as outstanding_amount
      FROM invoices WHERE created_by IS NOT NULL AND created_at >= date('now', '-30 days')
    `).first<any>()

    // Conversion rate
    const totalProposals = proposalStats?.total || 0
    const acceptedProposals = proposalStats?.accepted || 0
    const conversionRate = totalProposals > 0 ? Math.round((acceptedProposals / totalProposals) * 100) : 0

    return c.json({
      stages: stages.results || [],
      proposals: proposalStats || {},
      invoices: invoiceStats || {},
      conversion_rate: conversionRate,
      avg_deal_size: Math.round((proposalStats?.avg_deal_size || 0) * 100) / 100
    })
  } catch (err: any) {
    return c.json({ stages: [], proposals: {}, invoices: {}, conversion_rate: 0, avg_deal_size: 0 })
  }
})

// ============================================================
// CUSTOMER PORTAL — Public proposal/invoice history for homeowners
// ============================================================
crmRoutes.get('/customer-portal/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email'))
  
  try {
    // Get all proposals for this customer email
    const proposals = await c.env.DB.prepare(`
      SELECT cp.id, cp.proposal_number, cp.title, cp.total_amount, cp.status, cp.share_token,
             cp.created_at, cp.tier_label, cp.proposal_group_id
      FROM crm_proposals cp
      JOIN crm_customers cc ON cc.id = cp.crm_customer_id
      WHERE cc.email = ?
      ORDER BY cp.created_at DESC LIMIT 50
    `).bind(email).all<any>()

    // Get invoices
    const invoices = await c.env.DB.prepare(`
      SELECT i.id, i.invoice_number, i.total, i.status, i.due_date, i.created_at, i.paid_date
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE c.email = ?
      ORDER BY i.created_at DESC LIMIT 50
    `).bind(email).all<any>()

    return c.json({
      proposals: proposals.results || [],
      invoices: invoices.results || []
    })
  } catch {
    return c.json({ proposals: [], invoices: [] })
  }
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

// ============================================================
// CRM MODULE TOGGLES — Admin can enable/disable CRM modules for team
// ============================================================
crmRoutes.get('/module-toggles', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS crm_module_toggles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      module_key TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      UNIQUE(owner_id, module_key)
    )`).run()

    const { results } = await c.env.DB.prepare(
      'SELECT module_key, enabled FROM crm_module_toggles WHERE owner_id = ?'
    ).bind(cust.ownerId).all<any>()

    const toggles: Record<string, boolean> = {
      customers: true, proposals: true, invoices: true, jobs: true,
      d2d: true, call_center: true, secretary: true, reports: true,
      email_outreach: true, calendar: true
    }
    for (const r of (results || [])) {
      toggles[r.module_key] = !!r.enabled
    }
    return c.json({ toggles })
  } catch(e) {
    return c.json({ toggles: {} })
  }
})

crmRoutes.post('/module-toggles', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { module_key, enabled } = await c.req.json()
  if (!module_key) return c.json({ error: 'module_key required' }, 400)

  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS crm_module_toggles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      module_key TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      UNIQUE(owner_id, module_key)
    )`).run()

    await c.env.DB.prepare(
      `INSERT INTO crm_module_toggles (owner_id, module_key, enabled) VALUES (?, ?, ?)
       ON CONFLICT(owner_id, module_key) DO UPDATE SET enabled = excluded.enabled`
    ).bind(cust.ownerId, module_key, enabled ? 1 : 0).run()

    return c.json({ success: true, module_key, enabled: !!enabled })
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})
