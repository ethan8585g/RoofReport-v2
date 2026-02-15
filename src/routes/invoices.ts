import { Hono } from 'hono'
import type { Bindings } from '../types'

export const invoiceRoutes = new Hono<{ Bindings: Bindings }>()

// Generate invoice number
function generateInvoiceNumber(): string {
  const date = new Date()
  const d = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  return `INV-${d}-${rand}`
}

// ============================================================
// LIST ALL INVOICES (admin)
// ============================================================
invoiceRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status')
    const customerId = c.req.query('customer_id')
    
    let query = `
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.company_name as customer_company,
             o.order_number, o.property_address
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE 1=1
    `
    const params: any[] = []

    if (status) { query += ' AND i.status = ?'; params.push(status) }
    if (customerId) { query += ' AND i.customer_id = ?'; params.push(customerId) }

    query += ' ORDER BY i.created_at DESC'

    const invoices = await c.env.DB.prepare(query).bind(...params).all()

    // Get summary stats
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_paid,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as total_overdue,
        SUM(CASE WHEN status = 'draft' THEN total ELSE 0 END) as total_draft
      FROM invoices
    `).first()

    return c.json({ invoices: invoices.results, stats })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch invoices', details: err.message }, 500)
  }
})

// ============================================================
// GET SINGLE INVOICE with items
// ============================================================
invoiceRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const invoice = await c.env.DB.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             c.company_name as customer_company, c.address as customer_address,
             c.city as customer_city, c.province as customer_province, c.postal_code as customer_postal,
             o.order_number, o.property_address
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.id = ?
    `).bind(id).first()

    if (!invoice) return c.json({ error: 'Invoice not found' }, 404)

    const items = await c.env.DB.prepare(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    return c.json({ invoice, items: items.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch invoice', details: err.message }, 500)
  }
})

// ============================================================
// CREATE INVOICE
// ============================================================
invoiceRoutes.post('/', async (c) => {
  try {
    const { customer_id, order_id, items, notes, terms, due_days, tax_rate, discount_amount } = await c.req.json()

    if (!customer_id) return c.json({ error: 'customer_id is required' }, 400)
    if (!items || !items.length) return c.json({ error: 'At least one line item is required' }, 400)

    // Verify customer exists
    const customer = await c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ?').bind(customer_id).first()
    if (!customer) return c.json({ error: 'Customer not found' }, 404)

    const invoiceNumber = generateInvoiceNumber()
    const taxRateVal = tax_rate != null ? tax_rate : 5.0 // GST
    const discountVal = discount_amount || 0

    // Calculate totals
    let subtotal = 0
    for (const item of items) {
      subtotal += (item.quantity || 1) * (item.unit_price || 0)
    }
    
    // taxRateVal is a percentage (e.g. 5.0 = 5% GST)
    const taxAmount = Math.round(subtotal * (taxRateVal / 100) * 100) / 100
    const total = Math.round((subtotal + taxAmount - discountVal) * 100) / 100

    // Due date
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (due_days || 30))

    const result = await c.env.DB.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, order_id, subtotal, tax_rate, tax_amount, 
                            discount_amount, total, status, due_date, notes, terms, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).bind(
      invoiceNumber, customer_id, order_id || null,
      Math.round(subtotal * 100) / 100, taxRateVal, Math.round(taxAmount * 100) / 100,
      discountVal, total, dueDate.toISOString().slice(0, 10),
      notes || null, terms || 'Payment due within 30 days of invoice date.',
      'admin'
    ).run()

    const invoiceId = result.meta.last_row_id

    // Insert line items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const qty = item.quantity || 1
      const price = item.unit_price || 0
      const amount = Math.round(qty * price * 100) / 100
      
      await c.env.DB.prepare(`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(invoiceId, item.description, qty, price, amount, i).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'invoice_created', ?)
    `).bind(`Invoice ${invoiceNumber} for $${total} CAD`).run()

    return c.json({
      success: true,
      invoice: { id: invoiceId, invoice_number: invoiceNumber, total, status: 'draft' }
    }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create invoice', details: err.message }, 500)
  }
})

// ============================================================
// UPDATE INVOICE STATUS
// ============================================================
invoiceRoutes.patch('/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()

    const validStatuses = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'refunded']
    if (!validStatuses.includes(status)) {
      return c.json({ error: 'Invalid status' }, 400)
    }

    const updates: string[] = [`status = '${status}'`, "updated_at = datetime('now')"]
    
    if (status === 'sent') updates.push("sent_date = date('now')")
    if (status === 'paid') updates.push("paid_date = date('now')")

    await c.env.DB.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).bind(id).run()

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'invoice_status_updated', ?)
    `).bind(`Invoice #${id} marked as ${status}`).run()

    return c.json({ success: true, status })
  } catch (err: any) {
    return c.json({ error: 'Failed to update invoice', details: err.message }, 500)
  }
})

// ============================================================
// SEND INVOICE (mark as sent + email)
// ============================================================
invoiceRoutes.post('/:id/send', async (c) => {
  try {
    const id = c.req.param('id')
    const invoice = await c.env.DB.prepare(`
      SELECT i.*, c.email as customer_email, c.name as customer_name
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.id = ?
    `).bind(id).first<any>()

    if (!invoice) return c.json({ error: 'Invoice not found' }, 404)

    // Mark as sent
    await c.env.DB.prepare(`
      UPDATE invoices SET status = 'sent', sent_date = date('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run()

    // TODO: Email the invoice to customer
    // For now, just return success
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'invoice_sent', ?)
    `).bind(`Invoice ${invoice.invoice_number} sent to ${invoice.customer_email}`).run()

    return c.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} marked as sent`,
      customer_email: invoice.customer_email
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to send invoice', details: err.message }, 500)
  }
})

// ============================================================
// DELETE INVOICE (only drafts)
// ============================================================
invoiceRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const invoice = await c.env.DB.prepare("SELECT id, status FROM invoices WHERE id = ?").bind(id).first<any>()
    
    if (!invoice) return c.json({ error: 'Invoice not found' }, 404)
    if (invoice.status !== 'draft') return c.json({ error: 'Only draft invoices can be deleted' }, 400)

    await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to delete invoice', details: err.message }, 500)
  }
})

// ============================================================
// INVOICE STATS (for admin dashboard)
// ============================================================
invoiceRoutes.get('/stats/summary', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status IN ('sent','viewed') THEN 1 ELSE 0 END) as outstanding_count,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_collected,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as total_overdue,
        SUM(total) as grand_total
      FROM invoices
    `).first()

    return c.json({ stats })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch invoice stats', details: err.message }, 500)
  }
})

// ============================================================
// LIST ALL CUSTOMERS (admin)
// ============================================================
invoiceRoutes.get('/customers/list', async (c) => {
  try {
    const customers = await c.env.DB.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count,
        (SELECT SUM(price) FROM orders WHERE customer_id = c.id AND payment_status = 'paid') as total_spent,
        (SELECT COUNT(*) FROM invoices WHERE customer_id = c.id) as invoice_count,
        (SELECT SUM(total) FROM invoices WHERE customer_id = c.id AND status = 'paid') as invoices_paid
      FROM customers c
      WHERE c.is_active = 1
      ORDER BY c.created_at DESC
    `).all()

    return c.json({ customers: customers.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch customers', details: err.message }, 500)
  }
})

// ============================================================
// GET SINGLE CUSTOMER DETAIL (admin)
// ============================================================
invoiceRoutes.get('/customers/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
    if (!customer) return c.json({ error: 'Customer not found' }, 404)

    const orders = await c.env.DB.prepare(`
      SELECT o.*, r.status as report_status, r.total_material_cost_cad
      FROM orders o LEFT JOIN reports r ON r.order_id = o.id
      WHERE o.customer_id = ? ORDER BY o.created_at DESC
    `).bind(id).all()

    const invoices = await c.env.DB.prepare(
      'SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC'
    ).bind(id).all()

    return c.json({ customer, orders: orders.results, invoices: invoices.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch customer', details: err.message }, 500)
  }
})
