import { Hono } from 'hono'
import type { Bindings } from '../types'

export const ordersRoutes = new Hono<{ Bindings: Bindings }>()

// Generate order number
function generateOrderNumber(): string {
  const date = new Date()
  const d = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  return `RM-${d}-${rand}`
}

// Get delivery estimate based on tier
function getDeliveryEstimate(tier: string): string {
  const now = new Date()
  switch (tier) {
    case 'express':
      return new Date(now.getTime() + 10 * 60000).toISOString() // 10 min
    case 'standard':
      return new Date(now.getTime() + 60 * 60000).toISOString() // 1 hour
    default:
      return new Date(now.getTime() + 60 * 60000).toISOString()
  }
}

// Get price by tier
function getTierPrice(tier: string): number {
  switch (tier) {
    case 'express': return 12.00
    case 'standard': return 8.00
    default: return 8.00
  }
}

// CREATE order
ordersRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const {
      property_address, property_city, property_province, property_postal_code,
      latitude, longitude,
      homeowner_name, homeowner_phone, homeowner_email,
      requester_name, requester_company, requester_email, requester_phone,
      service_tier, customer_company_id, notes
    } = body

    // Validate required fields
    if (!property_address || !homeowner_name || !requester_name || !service_tier) {
      return c.json({ error: 'Missing required fields: property_address, homeowner_name, requester_name, service_tier' }, 400)
    }

    if (!['express', 'standard'].includes(service_tier)) {
      return c.json({ error: 'Invalid service_tier. Must be: express or standard' }, 400)
    }

    const orderNumber = generateOrderNumber()
    const price = getTierPrice(service_tier)
    const estimatedDelivery = getDeliveryEstimate(service_tier)
    const masterCompanyId = 1 // Reuse Canada

    const result = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, master_company_id, customer_company_id,
        property_address, property_city, property_province, property_postal_code,
        latitude, longitude,
        homeowner_name, homeowner_phone, homeowner_email,
        requester_name, requester_company, requester_email, requester_phone,
        service_tier, price, status, payment_status, estimated_delivery, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?, ?)
    `).bind(
      orderNumber, masterCompanyId, customer_company_id || null,
      property_address, property_city || null, property_province || null, property_postal_code || null,
      latitude || null, longitude || null,
      homeowner_name, homeowner_phone || null, homeowner_email || null,
      requester_name, requester_company || null, requester_email || null, requester_phone || null,
      service_tier, price, estimatedDelivery, notes || null
    ).run()

    // Log the activity
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (?, 'order_created', ?)
    `).bind(masterCompanyId, `Order ${orderNumber} created - ${service_tier} tier - $${price}`).run()

    return c.json({
      success: true,
      order: {
        id: result.meta.last_row_id,
        order_number: orderNumber,
        service_tier,
        price,
        estimated_delivery: estimatedDelivery,
        status: 'pending',
        payment_status: 'unpaid'
      }
    }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create order', details: err.message }, 500)
  }
})

// GET all orders (with optional filters)
ordersRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status')
    const tier = c.req.query('tier')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')

    let query = 'SELECT o.*, cc.company_name as customer_company_name FROM orders o LEFT JOIN customer_companies cc ON o.customer_company_id = cc.id WHERE 1=1'
    const params: any[] = []

    if (status) {
      query += ' AND o.status = ?'
      params.push(status)
    }
    if (tier) {
      query += ' AND o.service_tier = ?'
      params.push(tier)
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const orders = await c.env.DB.prepare(query).bind(...params).all()

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE 1=1'
    const countParams: any[] = []
    if (status) { countQuery += ' AND status = ?'; countParams.push(status) }
    if (tier) { countQuery += ' AND service_tier = ?'; countParams.push(tier) }
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>()

    return c.json({
      orders: orders.results,
      total: countResult?.total || 0,
      limit,
      offset
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch orders', details: err.message }, 500)
  }
})

// GET single order
ordersRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const order = await c.env.DB.prepare(`
      SELECT o.*, cc.company_name as customer_company_name,
             r.roof_area_sqft, r.roof_pitch_degrees, r.roof_azimuth_degrees,
             r.max_sunshine_hours, r.num_panels_possible, r.yearly_energy_kwh,
             r.roof_footprint_sqft, r.area_multiplier, r.roof_pitch_ratio,
             r.gross_squares, r.bundle_count, r.total_material_cost_cad,
             r.complexity_class, r.confidence_score, r.imagery_quality,
             r.report_version,
             r.report_pdf_url, r.status as report_status
      FROM orders o
      LEFT JOIN customer_companies cc ON o.customer_company_id = cc.id
      LEFT JOIN reports r ON r.order_id = o.id
      WHERE o.id = ? OR o.order_number = ?
    `).bind(id, id).first()

    if (!order) {
      return c.json({ error: 'Order not found' }, 404)
    }

    return c.json({ order })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch order', details: err.message }, 500)
  }
})

// UPDATE order status
ordersRoutes.patch('/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()

    if (!['pending', 'paid', 'processing', 'completed', 'failed', 'refunded', 'cancelled'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400)
    }

    await c.env.DB.prepare('UPDATE orders SET status = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(status, id).run()

    return c.json({ success: true, status })
  } catch (err: any) {
    return c.json({ error: 'Failed to update order', details: err.message }, 500)
  }
})

// Simulate payment (mark as paid)
ordersRoutes.post('/:id/pay', async (c) => {
  try {
    const id = c.req.param('id')
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<any>()

    if (!order) return c.json({ error: 'Order not found' }, 404)
    if (order.payment_status === 'paid') return c.json({ error: 'Order already paid' }, 400)

    // Update order
    await c.env.DB.prepare(`
      UPDATE orders SET payment_status = 'paid', status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run()

    // Create payment record
    await c.env.DB.prepare(`
      INSERT INTO payments (order_id, amount, currency, status, payment_method)
      VALUES (?, ?, 'CAD', 'succeeded', 'card_simulated')
    `).bind(id, order.price).run()

    // Create placeholder report
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')
    `).bind(id).run()

    // Log activity
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'payment_received', ?)
    `).bind(`Payment of $${order.price} for order ${order.order_number}`).run()

    return c.json({
      success: true,
      message: 'Payment processed successfully',
      order_number: order.order_number,
      amount: order.price,
      status: 'processing'
    })
  } catch (err: any) {
    return c.json({ error: 'Payment failed', details: err.message }, 500)
  }
})

// GET order stats (for admin dashboard)
ordersRoutes.get('/stats/summary', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN price ELSE 0 END) as total_revenue,
        SUM(CASE WHEN service_tier = 'express' THEN 1 ELSE 0 END) as express_orders,
        SUM(CASE WHEN service_tier = 'standard' THEN 1 ELSE 0 END) as standard_orders
      FROM orders
    `).first()

    return c.json({ stats })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch stats', details: err.message }, 500)
  }
})
