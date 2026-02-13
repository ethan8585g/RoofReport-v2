import { Hono } from 'hono'
import type { Bindings } from '../types'

export const stripeRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// STRIPE API HELPER — All calls go through Stripe REST API
// No SDK needed — Cloudflare Workers compatible
// ============================================================

async function stripeRequest(secretKey: string, method: string, path: string, body?: any) {
  const url = `https://api.stripe.com/v1${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  let formBody = ''
  if (body) {
    formBody = encodeStripeParams(body)
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? formBody : undefined,
  })

  const data: any = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${response.status}`)
  }
  return data
}

// Encode nested objects for Stripe's form-encoded format
function encodeStripeParams(obj: any, prefix?: string): string {
  const parts: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key
    const value = obj[key]
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(encodeStripeParams(value, fullKey))
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          parts.push(encodeStripeParams(item, `${fullKey}[${i}]`))
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(item)}`)
        }
      })
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`)
    }
  }
  return parts.filter(Boolean).join('&')
}

// ============================================================
// AUTH MIDDLEWARE — Extract customer from session token
// ============================================================
async function getCustomerFromToken(db: D1Database, token: string | undefined): Promise<any | null> {
  if (!token) return null
  const session = await db.prepare(`
    SELECT cs.customer_id, c.* FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id
    WHERE cs.session_token = ? AND cs.expires_at > datetime('now') AND c.is_active = 1
  `).bind(token).first<any>()
  return session
}

// ============================================================
// GET CREDIT PACKAGES — Public pricing info
// ============================================================
stripeRoutes.get('/packages', async (c) => {
  try {
    const packages = await c.env.DB.prepare(
      'SELECT id, name, description, credits, price_cents, sort_order FROM credit_packages WHERE is_active = 1 ORDER BY sort_order'
    ).all()
    return c.json({ packages: packages.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch packages', details: err.message }, 500)
  }
})

// ============================================================
// GET CUSTOMER BILLING STATUS
// ============================================================
stripeRoutes.get('/billing', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const customer = await getCustomerFromToken(c.env.DB, token)
  if (!customer) return c.json({ error: 'Not authenticated' }, 401)

  // Get payment history
  const payments = await c.env.DB.prepare(`
    SELECT sp.*, o.order_number, o.property_address 
    FROM stripe_payments sp 
    LEFT JOIN orders o ON o.id = sp.order_id
    WHERE sp.customer_id = ? 
    ORDER BY sp.created_at DESC LIMIT 20
  `).bind(customer.customer_id).all()

  return c.json({
    billing: {
      plan: customer.subscription_plan || 'free',
      status: customer.subscription_status || 'none',
      credits_remaining: (customer.report_credits || 0) - (customer.credits_used || 0),
      credits_total: customer.report_credits || 0,
      credits_used: customer.credits_used || 0,
      subscription_start: customer.subscription_start,
      subscription_end: customer.subscription_end,
      stripe_customer_id: customer.stripe_customer_id || null,
    },
    payments: payments.results
  })
})

// ============================================================
// CREATE STRIPE CHECKOUT SESSION — Buy credits or one-time report
// ============================================================
stripeRoutes.post('/checkout', async (c) => {
  try {
    const stripeKey = c.env.STRIPE_SECRET_KEY
    if (!stripeKey) return c.json({ error: 'Stripe is not configured. Contact admin.' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const { package_id, order_id, success_url, cancel_url } = await c.req.json()

    // Look up package
    const pkg = await c.env.DB.prepare(
      'SELECT * FROM credit_packages WHERE id = ? AND is_active = 1'
    ).bind(package_id || 1).first<any>()

    if (!pkg) return c.json({ error: 'Package not found' }, 404)

    // Ensure Stripe customer exists
    let stripeCustomerId = customer.stripe_customer_id
    if (!stripeCustomerId) {
      const stripeCustomer = await stripeRequest(stripeKey, 'POST', '/customers', {
        email: customer.email,
        name: customer.name,
        metadata: {
          rc_customer_id: String(customer.customer_id),
          company: customer.company_name || '',
        }
      })
      stripeCustomerId = stripeCustomer.id
      await c.env.DB.prepare(
        'UPDATE customers SET stripe_customer_id = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(stripeCustomerId, customer.customer_id).run()
    }

    // Determine URLs
    const origin = new URL(c.req.url).origin
    const successUrl = success_url || `${origin}/customer/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = cancel_url || `${origin}/customer/dashboard?payment=cancelled`

    // Create Checkout Session
    const session = await stripeRequest(stripeKey, 'POST', '/checkout/sessions', {
      customer: stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'cad',
          unit_amount: String(pkg.price_cents),
          product_data: {
            name: `${pkg.name} — Roof Report Credits`,
            description: pkg.description,
          }
        },
        quantity: '1',
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        rc_customer_id: String(customer.customer_id),
        package_id: String(pkg.id),
        credits: String(pkg.credits),
        order_id: order_id ? String(order_id) : '',
      },
      payment_intent_data: {
        metadata: {
          rc_customer_id: String(customer.customer_id),
          package_id: String(pkg.id),
          credits: String(pkg.credits),
        }
      }
    })

    // Record the pending payment
    await c.env.DB.prepare(`
      INSERT INTO stripe_payments (customer_id, stripe_checkout_session_id, amount, currency, status, payment_type, description, order_id)
      VALUES (?, ?, ?, 'cad', 'pending', 'credit_pack', ?, ?)
    `).bind(
      customer.customer_id, session.id, pkg.price_cents,
      `${pkg.name} (${pkg.credits} credits)`,
      order_id || null
    ).run()

    return c.json({
      checkout_url: session.url,
      session_id: session.id
    })
  } catch (err: any) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

// ============================================================
// CREATE CHECKOUT FOR SINGLE REPORT (quick pay)
// Customer places order + pays in one step
// ============================================================
stripeRoutes.post('/checkout/report', async (c) => {
  try {
    const stripeKey = c.env.STRIPE_SECRET_KEY
    if (!stripeKey) return c.json({ error: 'Stripe is not configured. Contact admin.' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const { property_address, property_city, property_province, property_postal_code,
            service_tier, latitude, longitude, success_url, cancel_url } = await c.req.json()

    if (!property_address) return c.json({ error: 'Property address is required' }, 400)

    const tier = service_tier || 'regular'
    const prices: Record<string, number> = { immediate: 2500, urgent: 1500, regular: 1000 }
    const priceCents = prices[tier] || 1000
    const tierLabels: Record<string, string> = { immediate: 'Immediate (5 min)', urgent: 'Urgent (30 min)', regular: 'Regular (1.5 hr)' }

    // Ensure Stripe customer
    let stripeCustomerId = customer.stripe_customer_id
    if (!stripeCustomerId) {
      const sc = await stripeRequest(stripeKey, 'POST', '/customers', {
        email: customer.email,
        name: customer.name,
        metadata: { rc_customer_id: String(customer.customer_id) }
      })
      stripeCustomerId = sc.id
      await c.env.DB.prepare(
        'UPDATE customers SET stripe_customer_id = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(stripeCustomerId, customer.customer_id).run()
    }

    const origin = new URL(c.req.url).origin
    const successUrlFinal = success_url || `${origin}/customer/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrlFinal = cancel_url || `${origin}/customer/dashboard?payment=cancelled`

    const session = await stripeRequest(stripeKey, 'POST', '/checkout/sessions', {
      customer: stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'cad',
          unit_amount: String(priceCents),
          product_data: {
            name: `Roof Measurement Report — ${tierLabels[tier] || tier}`,
            description: `Professional AI roof report for: ${property_address}`,
          }
        },
        quantity: '1',
      }],
      success_url: successUrlFinal,
      cancel_url: cancelUrlFinal,
      metadata: {
        rc_customer_id: String(customer.customer_id),
        payment_type: 'one_time_report',
        service_tier: tier,
        property_address,
        property_city: property_city || '',
        property_province: property_province || '',
        property_postal_code: property_postal_code || '',
        latitude: latitude ? String(latitude) : '',
        longitude: longitude ? String(longitude) : '',
      },
      payment_intent_data: {
        metadata: {
          rc_customer_id: String(customer.customer_id),
          payment_type: 'one_time_report',
          service_tier: tier,
          property_address,
        }
      }
    })

    return c.json({
      checkout_url: session.url,
      session_id: session.id
    })
  } catch (err: any) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

// ============================================================
// USE CREDITS — Deduct a credit and create order
// For customers who pre-bought credit packs
// ============================================================
stripeRoutes.post('/use-credit', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const remaining = (customer.report_credits || 0) - (customer.credits_used || 0)
    if (remaining <= 0) {
      return c.json({ error: 'No credits remaining. Please purchase a credit pack.', credits_remaining: 0 }, 402)
    }

    const { property_address, property_city, property_province, property_postal_code,
            service_tier, latitude, longitude } = await c.req.json()

    if (!property_address) return c.json({ error: 'Property address is required' }, 400)

    const tier = service_tier || 'regular'
    const tierPrices: Record<string, number> = { immediate: 25, urgent: 15, regular: 10 }
    const price = tierPrices[tier] || 10

    // Ensure master company exists
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email) VALUES (1, 'Reuse Canada', 'Admin', 'reports@reusecanada.ca')"
    ).run()

    // Generate order number
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const orderNumber = `RM-${d}-${rand}`

    // Delivery estimate
    const now = Date.now()
    const deliveryMs: Record<string, number> = { immediate: 5 * 60000, urgent: 30 * 60000, regular: 90 * 60000 }
    const estimatedDelivery = new Date(now + (deliveryMs[tier] || 60 * 60000)).toISOString()

    // Create order (already paid via credits)
    const result = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, master_company_id, customer_id,
        property_address, property_city, property_province, property_postal_code,
        latitude, longitude,
        homeowner_name, homeowner_email,
        requester_name, requester_email,
        service_tier, price, status, payment_status, estimated_delivery,
        notes
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', 'paid', ?, ?)
    `).bind(
      orderNumber, customer.customer_id,
      property_address, property_city || null, property_province || null, property_postal_code || null,
      latitude || null, longitude || null,
      customer.name, customer.email,
      customer.name, customer.email,
      tier, price, estimatedDelivery,
      'Paid via credit balance'
    ).run()

    // Deduct credit
    await c.env.DB.prepare(
      'UPDATE customers SET credits_used = credits_used + 1, updated_at = datetime("now") WHERE id = ?'
    ).bind(customer.customer_id).run()

    // Create placeholder report
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
    ).bind(result.meta.last_row_id).run()

    // Log activity
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'credit_used', ?)
    `).bind(`${customer.email} used 1 credit for ${property_address} (${orderNumber})`).run()

    return c.json({
      success: true,
      order: {
        id: result.meta.last_row_id,
        order_number: orderNumber,
        property_address,
        service_tier: tier,
        price,
        status: 'processing',
        payment_status: 'paid'
      },
      credits_remaining: remaining - 1
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to use credit', details: err.message }, 500)
  }
})

// ============================================================
// STRIPE WEBHOOK — Process payment confirmations
// ============================================================
stripeRoutes.post('/webhook', async (c) => {
  try {
    const rawBody = await c.req.text()
    
    // Parse the event (in production, verify signature with STRIPE_WEBHOOK_SECRET)
    let event: any
    try {
      event = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // Idempotency check
    const existing = await c.env.DB.prepare(
      'SELECT id FROM stripe_webhook_events WHERE stripe_event_id = ?'
    ).bind(event.id).first()

    if (existing) {
      return c.json({ received: true, duplicate: true })
    }

    // Store event
    await c.env.DB.prepare(`
      INSERT INTO stripe_webhook_events (stripe_event_id, event_type, payload)
      VALUES (?, ?, ?)
    `).bind(event.id, event.type, rawBody).run()

    // Process based on event type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = session.metadata || {}
        const customerId = parseInt(meta.rc_customer_id)

        if (!customerId) break

        // Update payment record
        await c.env.DB.prepare(`
          UPDATE stripe_payments SET 
            stripe_payment_intent_id = ?, status = 'succeeded', updated_at = datetime('now')
          WHERE stripe_checkout_session_id = ?
        `).bind(session.payment_intent, session.id).run()

        if (meta.payment_type === 'one_time_report') {
          // Single report purchase — create order automatically
          const tier = meta.service_tier || 'regular'
          const address = meta.property_address || 'Unknown address'
          const tierPrices: Record<string, number> = { immediate: 25, urgent: 15, regular: 10 }
          const price = tierPrices[tier] || 10

          const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
          const orderNumber = `RM-${d}-${rand}`
          const deliveryMs: Record<string, number> = { immediate: 5 * 60000, urgent: 30 * 60000, regular: 90 * 60000 }
          const estimatedDelivery = new Date(Date.now() + (deliveryMs[tier] || 60 * 60000)).toISOString()

          // Ensure master company exists
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email) VALUES (1, 'Reuse Canada', 'Admin', 'reports@reusecanada.ca')"
          ).run()

          const custData = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customerId).first<any>()

          const orderResult = await c.env.DB.prepare(`
            INSERT INTO orders (
              order_number, master_company_id, customer_id,
              property_address, property_city, property_province, property_postal_code,
              latitude, longitude,
              homeowner_name, homeowner_email,
              requester_name, requester_email,
              service_tier, price, status, payment_status, estimated_delivery,
              notes
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', 'paid', ?, ?)
          `).bind(
            orderNumber, customerId,
            address, meta.property_city || null, meta.property_province || null, meta.property_postal_code || null,
            meta.latitude ? parseFloat(meta.latitude) : null, meta.longitude ? parseFloat(meta.longitude) : null,
            custData?.name || '', custData?.email || '',
            custData?.name || '', custData?.email || '',
            tier, price, estimatedDelivery,
            `Paid via Stripe (${session.payment_intent})`
          ).run()

          // Update stripe payment with order_id
          await c.env.DB.prepare(
            'UPDATE stripe_payments SET order_id = ? WHERE stripe_checkout_session_id = ?'
          ).bind(orderResult.meta.last_row_id, session.id).run()

          // Create placeholder report
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
          ).bind(orderResult.meta.last_row_id).run()

          await c.env.DB.prepare(`
            INSERT INTO user_activity_log (company_id, action, details)
            VALUES (1, 'stripe_report_purchased', ?)
          `).bind(`${custData?.email || 'Customer'} purchased report for ${address} via Stripe ($${price})`).run()

        } else {
          // Credit pack purchase — add credits
          const credits = parseInt(meta.credits) || 0
          if (credits > 0) {
            await c.env.DB.prepare(
              'UPDATE customers SET report_credits = report_credits + ?, subscription_plan = CASE WHEN subscription_plan = "free" THEN "credits" ELSE subscription_plan END, updated_at = datetime("now") WHERE id = ?'
            ).bind(credits, customerId).run()

            await c.env.DB.prepare(`
              INSERT INTO user_activity_log (company_id, action, details)
              VALUES (1, 'credits_purchased', ?)
            `).bind(`Customer #${customerId} purchased ${credits} credits via Stripe`).run()
          }
        }

        // Mark webhook as processed
        await c.env.DB.prepare(
          'UPDATE stripe_webhook_events SET processed = 1 WHERE stripe_event_id = ?'
        ).bind(event.id).run()
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        await c.env.DB.prepare(`
          UPDATE stripe_payments SET status = 'failed', updated_at = datetime('now')
          WHERE stripe_payment_intent_id = ?
        `).bind(pi.id).run()
        
        await c.env.DB.prepare(
          'UPDATE stripe_webhook_events SET processed = 1 WHERE stripe_event_id = ?'
        ).bind(event.id).run()
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        await c.env.DB.prepare(`
          UPDATE stripe_payments SET status = 'refunded', updated_at = datetime('now')
          WHERE stripe_payment_intent_id = ?
        `).bind(charge.payment_intent).run()
        
        await c.env.DB.prepare(
          'UPDATE stripe_webhook_events SET processed = 1 WHERE stripe_event_id = ?'
        ).bind(event.id).run()
        break
      }
    }

    return c.json({ received: true })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

// ============================================================
// VERIFY CHECKOUT SESSION — After redirect back from Stripe
// ============================================================
stripeRoutes.get('/verify-session/:sessionId', async (c) => {
  try {
    const stripeKey = c.env.STRIPE_SECRET_KEY
    if (!stripeKey) return c.json({ error: 'Stripe not configured' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const sessionId = c.req.param('sessionId')
    const session = await stripeRequest(stripeKey, 'GET', `/checkout/sessions/${sessionId}`)

    if (session.payment_status === 'paid') {
      // If webhook hasn't processed yet, do it now
      const meta = session.metadata || {}
      const credits = parseInt(meta.credits) || 0

      if (credits > 0 && meta.rc_customer_id === String(customer.customer_id)) {
        // Check if credits were already added
        const payment = await c.env.DB.prepare(
          'SELECT * FROM stripe_payments WHERE stripe_checkout_session_id = ? AND status = ?'
        ).bind(sessionId, 'succeeded').first()

        if (!payment) {
          // Webhook hasn't fired yet — process inline
          await c.env.DB.prepare(
            'UPDATE customers SET report_credits = report_credits + ?, subscription_plan = CASE WHEN subscription_plan = "free" THEN "credits" ELSE subscription_plan END, updated_at = datetime("now") WHERE id = ?'
          ).bind(credits, customer.customer_id).run()

          await c.env.DB.prepare(`
            UPDATE stripe_payments SET status = 'succeeded', stripe_payment_intent_id = ?, updated_at = datetime('now')
            WHERE stripe_checkout_session_id = ?
          `).bind(session.payment_intent, sessionId).run()
        }
      }

      // Get updated customer data
      const updatedCustomer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.customer_id).first<any>()

      return c.json({
        success: true,
        payment_status: 'paid',
        credits_remaining: (updatedCustomer?.report_credits || 0) - (updatedCustomer?.credits_used || 0),
        credits_total: updatedCustomer?.report_credits || 0,
      })
    }

    return c.json({
      success: false,
      payment_status: session.payment_status,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to verify session', details: err.message }, 500)
  }
})

// ============================================================
// ADMIN: Revenue & Payment Stats
// ============================================================
stripeRoutes.get('/admin/stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue_cents,
        SUM(CASE WHEN status = 'succeeded' AND payment_type = 'one_time_report' THEN amount ELSE 0 END) as report_revenue_cents,
        SUM(CASE WHEN status = 'succeeded' AND payment_type = 'credit_pack' THEN amount ELSE 0 END) as credit_revenue_cents,
        SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as refunded_cents
      FROM stripe_payments
    `).first()

    const recentPayments = await c.env.DB.prepare(`
      SELECT sp.*, c.name as customer_name, c.email as customer_email, c.company_name as customer_company,
             o.order_number, o.property_address
      FROM stripe_payments sp
      LEFT JOIN customers c ON c.id = sp.customer_id
      LEFT JOIN orders o ON o.id = sp.order_id
      ORDER BY sp.created_at DESC LIMIT 50
    `).all()

    // Monthly breakdown
    const monthly = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as transactions,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as revenue_cents
      FROM stripe_payments 
      GROUP BY strftime('%Y-%m', created_at) 
      ORDER BY month DESC LIMIT 12
    `).all()

    return c.json({ stats, payments: recentPayments.results, monthly: monthly.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch stats', details: err.message }, 500)
  }
})

// ============================================================
// ADMIN: Customer credit management
// ============================================================
stripeRoutes.post('/admin/add-credits', async (c) => {
  try {
    const { customer_id, credits, reason } = await c.req.json()
    if (!customer_id || !credits) return c.json({ error: 'customer_id and credits required' }, 400)

    await c.env.DB.prepare(
      'UPDATE customers SET report_credits = report_credits + ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(credits, customer_id).run()

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'admin_credits_added', ?)
    `).bind(`Added ${credits} credits to customer #${customer_id}: ${reason || 'manual'}`).run()

    return c.json({ success: true, credits_added: credits })
  } catch (err: any) {
    return c.json({ error: 'Failed to add credits', details: err.message }, 500)
  }
})
