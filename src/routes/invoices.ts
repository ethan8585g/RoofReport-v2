import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession } from './auth'
import {
  calculateProposal, calculateTieredProposals, extractMeasurementsFromReport,
  DEFAULT_PRESETS, TIER_PRESETS,
  type RoofPresetCosts, type RoofMeasurements, type ProposalResult
} from '../services/pricing-engine'

export const invoiceRoutes = new Hono<{ Bindings: Bindings }>()

// Admin auth middleware
invoiceRoutes.use('/*', async (c, next) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin authentication required' }, 401)
  c.set('admin' as any, admin)
  return next()
})

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

// ============================================================
// PRICING ENGINE — Get default presets
// ============================================================
invoiceRoutes.get('/pricing/presets', async (c) => {
  try {
    // Try to load custom presets from DB settings
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'roofing_cost_presets' AND master_company_id = 1"
    ).first<any>()

    let presets = DEFAULT_PRESETS
    if (row?.setting_value) {
      try { presets = { ...DEFAULT_PRESETS, ...JSON.parse(row.setting_value) } } catch {}
    }

    return c.json({
      presets,
      tiers: TIER_PRESETS,
      defaults: DEFAULT_PRESETS
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch presets', details: err.message }, 500)
  }
})

// ============================================================
// PRICING ENGINE — Save custom presets
// ============================================================
invoiceRoutes.put('/pricing/presets', async (c) => {
  try {
    const body = await c.req.json()
    const presets = body.presets || body

    // Validate required fields
    const requiredFields = ['shingles_per_square', 'labor_per_square', 'waste_factor', 'tax_rate']
    for (const field of requiredFields) {
      if (presets[field] == null) return c.json({ error: `Missing required field: ${field}` }, 400)
    }

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value)
      VALUES (1, 'roofing_cost_presets', ?)
    `).bind(JSON.stringify(presets)).run()

    return c.json({ success: true, presets })
  } catch (err: any) {
    return c.json({ error: 'Failed to save presets', details: err.message }, 500)
  }
})

// ============================================================
// PRICING ENGINE — Calculate proposal from measurements
// ============================================================
invoiceRoutes.post('/pricing/calculate', async (c) => {
  try {
    const body = await c.req.json()
    const measurements: RoofMeasurements = body.measurements

    if (!measurements?.total_area_sqft) {
      return c.json({ error: 'measurements.total_area_sqft is required' }, 400)
    }

    // Load presets from DB or use provided
    let presets: RoofPresetCosts = DEFAULT_PRESETS
    if (body.presets) {
      presets = { ...DEFAULT_PRESETS, ...body.presets }
    } else {
      const row = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'roofing_cost_presets' AND master_company_id = 1"
      ).first<any>()
      if (row?.setting_value) {
        try { presets = { ...DEFAULT_PRESETS, ...JSON.parse(row.setting_value) } } catch {}
      }
    }

    if (body.tiered) {
      // Return good/better/best proposals
      const tiered = calculateTieredProposals(measurements, presets)
      return c.json({ success: true, tiered, measurements })
    }

    const proposal = calculateProposal(measurements, presets, body.preset_name || 'Custom')
    return c.json({ success: true, proposal, measurements })
  } catch (err: any) {
    return c.json({ error: 'Failed to calculate proposal', details: err.message }, 500)
  }
})

// ============================================================
// PRICING ENGINE — Auto-generate from report order
// ============================================================
invoiceRoutes.post('/pricing/from-report/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const body = await c.req.json().catch(() => ({}))

    // Fetch the report data
    const report = await c.env.DB.prepare(
      'SELECT api_response_raw FROM reports WHERE order_id = ?'
    ).bind(orderId).first<any>()

    if (!report?.api_response_raw) {
      return c.json({ error: 'Report not found for this order' }, 404)
    }

    let reportData: any
    try { reportData = JSON.parse(report.api_response_raw) } catch {
      return c.json({ error: 'Report data is corrupted' }, 500)
    }

    // Extract measurements from report
    const measurements = extractMeasurementsFromReport(reportData)

    if (measurements.total_area_sqft <= 0) {
      return c.json({ error: 'Report has no roof area measurements' }, 400)
    }

    // Load presets
    let presets: RoofPresetCosts = DEFAULT_PRESETS
    if (body.presets) {
      presets = { ...DEFAULT_PRESETS, ...body.presets }
    } else {
      const row = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'roofing_cost_presets' AND master_company_id = 1"
      ).first<any>()
      if (row?.setting_value) {
        try { presets = { ...DEFAULT_PRESETS, ...JSON.parse(row.setting_value) } } catch {}
      }
    }

    if (body.tiered) {
      const tiered = calculateTieredProposals(measurements, presets)
      return c.json({ success: true, tiered, measurements, report_source: 'trace_measurement' })
    }

    const proposal = calculateProposal(measurements, presets, body.preset_name || 'From Roof Report')
    return c.json({ success: true, proposal, measurements, report_source: 'trace_measurement' })
  } catch (err: any) {
    return c.json({ error: 'Failed to generate proposal from report', details: err.message }, 500)
  }
})

// ============================================================
// SEND INVOICE VIA GMAIL — Uses roofer's connected Gmail OAuth
// ============================================================
invoiceRoutes.post('/:id/send-gmail', async (c) => {
  try {
    const id = c.req.param('id')
    const admin = c.get('admin' as any) as any

    // Fetch invoice with customer data
    const invoice = await c.env.DB.prepare(`
      SELECT i.*, c.email as customer_email, c.name as customer_name, c.company_name as customer_company,
             c.address as customer_address, c.phone as customer_phone
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.id = ?
    `).bind(id).first<any>()

    if (!invoice) return c.json({ error: 'Invoice not found' }, 404)
    if (!invoice.customer_email) return c.json({ error: 'Customer has no email address' }, 400)

    // Get invoice line items
    const items = await c.env.DB.prepare(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order'
    ).bind(id).all()

    // Fetch roofer's Gmail OAuth tokens
    const customer = await c.env.DB.prepare(
      'SELECT gmail_refresh_token, gmail_connected_email, name, brand_business_name, brand_logo_url, brand_primary_color FROM customers WHERE id = ?'
    ).bind(admin.id).first<any>()

    if (!customer?.gmail_refresh_token) {
      return c.json({ error: 'Gmail not connected. Go to CRM Settings → Connect Gmail to send invoices via email.' }, 400)
    }

    const clientId = (c.env as any).GMAIL_CLIENT_ID
    let clientSecret = (c.env as any).GMAIL_CLIENT_SECRET || ''
    if (!clientSecret) {
      const csRow = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'gmail_client_secret' AND master_company_id = 1"
      ).first<any>()
      if (csRow?.setting_value) clientSecret = csRow.setting_value
    }

    if (!clientId || !clientSecret) {
      return c.json({ error: 'Gmail OAuth not configured. Contact admin.' }, 400)
    }

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

    if (!tokenData.access_token) {
      return c.json({ error: 'Gmail token expired. Please reconnect Gmail in CRM settings.' }, 400)
    }

    const businessName = customer.brand_business_name || customer.name || 'Your Roofer'
    const fromEmail = customer.gmail_connected_email || admin.email
    const primaryColor = customer.brand_primary_color || '#0369a1'

    // Build line items HTML
    let itemsHtml = ''
    if (items.results?.length) {
      itemsHtml = '<table style="width:100%;border-collapse:collapse;margin:0 0 16px;">'
      itemsHtml += '<tr style="background:#f1f5f9;"><td style="color:#475569;font-size:11px;font-weight:600;padding:8px;text-align:left;">Item</td><td style="color:#475569;font-size:11px;font-weight:600;padding:8px;text-align:center;">Qty</td><td style="color:#475569;font-size:11px;font-weight:600;padding:8px;text-align:right;">Unit Price</td><td style="color:#475569;font-size:11px;font-weight:600;padding:8px;text-align:right;">Amount</td></tr>'
      for (const item of items.results as any[]) {
        itemsHtml += `<tr><td style="color:#374151;font-size:12px;padding:8px;border-bottom:1px solid #f1f5f9;">${item.description}</td><td style="color:#374151;font-size:12px;padding:8px;text-align:center;border-bottom:1px solid #f1f5f9;">${item.quantity}</td><td style="color:#374151;font-size:12px;padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">$${parseFloat(item.unit_price).toFixed(2)}</td><td style="color:#374151;font-size:12px;padding:8px;text-align:right;border-bottom:1px solid #f1f5f9;">$${parseFloat(item.amount).toFixed(2)}</td></tr>`
      }
      itemsHtml += '</table>'
    }

    // Build branded HTML email
    const emailHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:${primaryColor};padding:32px;border-radius:12px 12px 0 0;">
    ${customer.brand_logo_url ? `<img src="${customer.brand_logo_url}" alt="${businessName}" style="max-height:48px;margin-bottom:8px;">` : ''}
    <h1 style="color:#ffffff;margin:0;font-size:22px;">${businessName}</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">Invoice #${invoice.invoice_number}</p>
  </div>
  <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${invoice.customer_name || 'there'},</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Please find your invoice details below. Payment is due by ${invoice.due_date || '30 days from receipt'}.
    </p>
    
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
      ${itemsHtml}
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Subtotal</td><td style="color:#1e293b;font-size:13px;text-align:right;">$${parseFloat(invoice.subtotal || 0).toFixed(2)}</td></tr>
        <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Tax (${invoice.tax_rate || 5}%)</td><td style="color:#1e293b;font-size:13px;text-align:right;">$${parseFloat(invoice.tax_amount || 0).toFixed(2)}</td></tr>
        ${invoice.discount_amount ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Discount</td><td style="color:#16a34a;font-size:13px;text-align:right;">-$${parseFloat(invoice.discount_amount).toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="border-top:2px solid #e2e8f0;padding-top:8px;"></td></tr>
        <tr><td style="color:${primaryColor};font-size:20px;font-weight:700;padding:4px 0;">Total Due</td><td style="color:${primaryColor};font-size:20px;font-weight:700;text-align:right;">$${parseFloat(invoice.total).toFixed(2)} CAD</td></tr>
      </table>
    </div>

    <p style="color:#6b7280;font-size:13px;line-height:1.6;">
      ${invoice.notes || 'Thank you for your business. Please remit payment at your earliest convenience.'}
    </p>
  </div>
  <p style="color:#9ca3af;font-size:11px;text-align:center;margin:16px 0 0;">Sent via RoofReporterAI &middot; ${fromEmail}</p>
</div>`

    // Build RFC 2822 MIME message
    const subject = `Invoice #${invoice.invoice_number} — $${parseFloat(invoice.total).toFixed(2)} CAD — ${businessName}`
    const boundary = 'boundary_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16)
    const rawMessage = [
      `From: ${businessName} <${fromEmail}>`,
      `To: ${invoice.customer_email}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      `Hi ${invoice.customer_name || 'there'},\n\nPlease find your invoice #${invoice.invoice_number}.\n\nTotal: $${parseFloat(invoice.total).toFixed(2)} CAD\nDue: ${invoice.due_date || '30 days'}\n\nThank you,\n${businessName}`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      emailHtml,
      '',
      `--${boundary}--`
    ].join('\r\n')

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

    if (!sendResp.ok) {
      const errData: any = await sendResp.json().catch(() => ({}))
      return c.json({ error: 'Gmail send failed', details: errData?.error?.message || `Status ${sendResp.status}` }, 500)
    }

    // Update invoice status to sent
    await c.env.DB.prepare(`
      UPDATE invoices SET status = 'sent', sent_date = date('now'), updated_at = datetime('now') WHERE id = ?
    `).bind(id).run()

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'invoice_sent_gmail', ?)
    `).bind(`Invoice ${invoice.invoice_number} sent to ${invoice.customer_email} via Gmail`).run()

    return c.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} sent to ${invoice.customer_email} via Gmail`,
      email_sent: true
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to send invoice via Gmail', details: err.message }, 500)
  }
})

// ============================================================
// GENERATE PAYMENT LINK — Create Stripe checkout for invoice
// ============================================================
invoiceRoutes.post('/:id/payment-link', async (c) => {
  try {
    const id = c.req.param('id')
    const invoice = await c.env.DB.prepare(`
      SELECT i.*, c.email as customer_email, c.name as customer_name, c.stripe_customer_id
      FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?
    `).bind(id).first<any>()

    if (!invoice) return c.json({ error: 'Invoice not found' }, 404)

    const stripeKey = (c.env as any).STRIPE_SECRET_KEY
    const squareToken = (c.env as any).SQUARE_ACCESS_TOKEN

    if (stripeKey) {
      // Create Stripe checkout session
      const baseUrl = new URL(c.req.url).origin
      const params = new URLSearchParams()
      params.append('mode', 'payment')
      params.append('success_url', `${baseUrl}/invoice/pay/${id}?status=success`)
      params.append('cancel_url', `${baseUrl}/invoice/pay/${id}?status=cancelled`)
      params.append('line_items[0][price_data][currency]', 'cad')
      params.append('line_items[0][price_data][product_data][name]', `Invoice ${invoice.invoice_number}`)
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(parseFloat(invoice.total) * 100)))
      params.append('line_items[0][quantity]', '1')
      if (invoice.customer_email) params.append('customer_email', invoice.customer_email)
      params.append('metadata[invoice_id]', String(id))
      params.append('metadata[invoice_number]', invoice.invoice_number)

      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(stripeKey + ':')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })
      const session: any = await resp.json()

      if (session.error) {
        return c.json({ error: session.error.message || 'Stripe error' }, 500)
      }

      // Save payment link
      const paymentUrl = session.url
      await c.env.DB.prepare(
        "UPDATE invoices SET payment_link = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(paymentUrl, id).run()

      return c.json({ success: true, payment_url: paymentUrl, provider: 'stripe' })
    } else if (squareToken) {
      // Square payment link would go here
      return c.json({ error: 'Square payment links coming soon. Use Stripe for now.' }, 501)
    } else {
      return c.json({ error: 'No payment gateway configured. Add STRIPE_SECRET_KEY in settings.' }, 400)
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to create payment link', details: err.message }, 500)
  }
})
