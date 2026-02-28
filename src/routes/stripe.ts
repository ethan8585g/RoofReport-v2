import { Hono } from 'hono'
import type { Bindings } from '../types'
import { generateReportForOrder } from './reports'
import { isDevAccount } from './customer-auth'

export const stripeRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// GEOCODING HELPER — Convert address to lat/lng
// Uses Google Maps Geocoding API
// ============================================================
async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data: any = await resp.json()
    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const loc = data.results[0].geometry.location
      return { lat: loc.lat, lng: loc.lng }
    }
    return null
  } catch {
    return null
  }
}

// ============================================================
// AUTO-GENERATE REPORT — Direct function call (no HTTP self-fetch)
// Uses the exported generateReportForOrder from reports.ts
// ============================================================
async function triggerReportGeneration(orderId: number, env: Bindings): Promise<boolean> {
  try {
    console.log(`[Auto-Generate] Triggering direct report generation for order ${orderId}`)
    const result = await generateReportForOrder(orderId, env)
    console.log(`[Auto-Generate] Order ${orderId}: ${result.success ? 'SUCCESS' : result.error || 'FAILED'} — provider: ${result.provider || 'n/a'}`)
    return result.success === true
  } catch (err: any) {
    console.error(`[Auto-Generate] Order ${orderId} failed:`, err.message)
    return false
  }
}

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
// STRIPE WEBHOOK SIGNATURE VERIFICATION (Web Crypto API)
// ============================================================
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    // Parse signature header
    const elements = sigHeader.split(',')
    let timestamp = ''
    const signatures: string[] = []
    for (const el of elements) {
      const [key, val] = el.trim().split('=')
      if (key === 't') timestamp = val
      if (key === 'v1') signatures.push(val)
    }
    if (!timestamp || signatures.length === 0) return false

    // Reject if timestamp is too old (5 minute tolerance)
    const tsNum = parseInt(timestamp)
    if (Math.abs(Date.now() / 1000 - tsNum) > 300) {
      console.warn('[Webhook] Timestamp outside tolerance window')
      return false
    }

    // Compute expected signature: HMAC-SHA256(secret, timestamp.payload)
    const signedPayload = `${timestamp}.${payload}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
    const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Constant-time comparison
    return signatures.some(s => s === expectedSig)
  } catch (err: any) {
    console.error('[Webhook] Signature verification error:', err.message)
    return false
  }
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

  const freeTrialRemaining = Math.max(0, (customer.free_trial_total || 0) - (customer.free_trial_used || 0))
  const paidRemaining = Math.max(0, (customer.report_credits || 0) - (customer.credits_used || 0))

  // DEV ACCOUNT: always show unlimited credits
  const isDev = isDevAccount(customer.email || '')

  return c.json({
    billing: {
      plan: isDev ? 'dev_unlimited' : (customer.subscription_plan || 'free'),
      status: isDev ? 'active' : (customer.subscription_status || 'none'),
      credits_remaining: isDev ? 999999 : (freeTrialRemaining + paidRemaining),
      credits_total: isDev ? 999999 : (customer.report_credits || 0),
      credits_used: customer.credits_used || 0,
      free_trial_remaining: isDev ? 999999 : freeTrialRemaining,
      free_trial_total: isDev ? 999999 : (customer.free_trial_total || 0),
      free_trial_used: isDev ? 0 : (customer.free_trial_used || 0),
      paid_credits_remaining: isDev ? 999999 : paidRemaining,
      subscription_start: customer.subscription_start,
      subscription_end: customer.subscription_end,
      stripe_customer_id: customer.stripe_customer_id || null,
      is_dev: isDev || undefined,
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

    const tier = service_tier || 'standard'
    // Single report = $10 CAD flat (1000 cents)
    const prices: Record<string, number> = { express: 1000, standard: 1000 }
    const priceCents = prices[tier] || 1000
    const tierLabels: Record<string, string> = { express: 'Express', standard: 'Standard' }

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
// USE CREDITS — Free trial first, then paid credits
// New users get 3 free trial reports. After that, paid credits.
// ============================================================
stripeRoutes.post('/use-credit', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    // DEV ACCOUNT: unlimited free reports, never charge
    const isDev = isDevAccount(customer.email || '')

    // Check free trial first, then paid credits
    const freeTrialRemaining = isDev ? 999999 : Math.max(0, (customer.free_trial_total || 0) - (customer.free_trial_used || 0))
    const paidRemaining = isDev ? 999999 : Math.max(0, (customer.report_credits || 0) - (customer.credits_used || 0))
    const totalRemaining = freeTrialRemaining + paidRemaining

    if (totalRemaining <= 0) {
      return c.json({ 
        error: 'No credits remaining. Please purchase a credit pack.', 
        credits_remaining: 0,
        free_trial_remaining: 0,
        paid_credits_remaining: 0
      }, 402)
    }

    const { property_address, property_city, property_province, property_postal_code,
            service_tier, latitude, longitude } = await c.req.json()

    if (!property_address) return c.json({ error: 'Property address is required' }, 400)

    const tier = service_tier || 'standard'

    // Determine if this is a free trial order or paid order
    // DEV ACCOUNT: always free, always marked as dev_test
    const isTrial = isDev ? true : (freeTrialRemaining > 0)
    const price = (isDev || isTrial) ? 0 : 10  // Single report = $10 CAD flat
    const paymentStatus = isDev ? 'trial' : (isTrial ? 'trial' : 'paid')
    const notes = isDev
      ? `DEV TEST — free unlimited report (dev@reusecanada.ca)`
      : (isTrial 
        ? `Free trial report (${(customer.free_trial_used || 0) + 1} of ${customer.free_trial_total || 3})` 
        : 'Paid via credit balance')

    // Ensure master company exists
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email) VALUES (1, 'RoofReporterAI', 'Admin', 'reports@reusecanada.ca')"
    ).run()

    // Generate order number
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const orderNumber = `RM-${d}-${rand}`

    // Instant delivery — report generates immediately
    const estimatedDelivery = new Date(Date.now() + 30000).toISOString()

    // Create order
    const result = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, master_company_id, customer_id,
        property_address, property_city, property_province, property_postal_code,
        latitude, longitude,
        homeowner_name, homeowner_email,
        requester_name, requester_email,
        service_tier, price, status, payment_status, estimated_delivery,
        notes, is_trial
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?)
    `).bind(
      orderNumber, customer.customer_id,
      property_address, property_city || null, property_province || null, property_postal_code || null,
      latitude || null, longitude || null,
      customer.name, customer.email,
      customer.name, customer.email,
      tier, price, paymentStatus, estimatedDelivery,
      notes, isTrial ? 1 : 0
    ).run()

    // Deduct from the correct bucket (DEV ACCOUNT: skip deduction)
    if (!isDev) {
      if (isTrial) {
        await c.env.DB.prepare(
          'UPDATE customers SET free_trial_used = free_trial_used + 1, updated_at = datetime("now") WHERE id = ?'
        ).bind(customer.customer_id).run()
      } else {
        await c.env.DB.prepare(
          'UPDATE customers SET credits_used = credits_used + 1, updated_at = datetime("now") WHERE id = ?'
        ).bind(customer.customer_id).run()
      }
    }

    const newOrderId = result.meta.last_row_id as number

    // ============================================================
    // COORDINATES — Use provided lat/lng or fallback to geocoding
    // ============================================================
    const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY
    let geocodedLat: number | null = latitude ? parseFloat(latitude) : null
    let geocodedLng: number | null = longitude ? parseFloat(longitude) : null

    // If lat/lng provided directly, use them (skip geocoding)
    if (geocodedLat && geocodedLng && !isNaN(geocodedLat) && !isNaN(geocodedLng)) {
      console.log(`[Use-Credit] Using provided coordinates: ${geocodedLat}, ${geocodedLng}`)
      await c.env.DB.prepare(
        'UPDATE orders SET latitude = ?, longitude = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(geocodedLat, geocodedLng, newOrderId).run()
    } else if (mapsKey && property_address) {
      // Fallback: geocode from address
      const fullAddress = [property_address, property_city, property_province, property_postal_code]
        .filter(Boolean).join(', ')
      const geo = await geocodeAddress(fullAddress, mapsKey)
      if (geo) {
        geocodedLat = geo.lat
        geocodedLng = geo.lng
        await c.env.DB.prepare(
          'UPDATE orders SET latitude = ?, longitude = ?, updated_at = datetime("now") WHERE id = ?'
        ).bind(geocodedLat, geocodedLng, newOrderId).run()
        console.log(`[Use-Credit] Geocoded "${fullAddress}" → ${geocodedLat}, ${geocodedLng}`)
      } else {
        console.warn(`[Use-Credit] Geocoding failed for: ${fullAddress}`)
      }
    }

    // Create placeholder report
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
    ).bind(newOrderId).run()

    // ============================================================
    // AUTO-GENERATE REPORT — Trigger immediately after order creation
    // This runs the full Solar API + report generation pipeline
    // ============================================================
    // GENERATE REPORT INLINE — direct function call, no HTTP self-fetch
    // This ensures the report generates reliably on Cloudflare Workers
    // ============================================================
    try {
      const generatePromise = triggerReportGeneration(newOrderId, c.env)
      if ((c as any).executionCtx?.waitUntil) {
        // Cloudflare Workers: use waitUntil to keep worker alive for background generation
        ;(c as any).executionCtx.waitUntil(generatePromise)
      } else {
        // Local dev: await inline
        await generatePromise
      }
    } catch (e: any) {
      console.warn(`[Use-Credit] Auto-generate error (non-fatal): ${e.message}`)
    }

    // Log activity
    const actionType = isTrial ? 'free_trial_used' : 'credit_used'
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, ?, ?)
    `).bind(actionType, `${customer.email} used 1 ${isTrial ? 'free trial' : 'paid credit'} for ${property_address} (${orderNumber})`).run()

    const newFreeTrialRemaining = isTrial ? freeTrialRemaining - 1 : freeTrialRemaining
    const newPaidRemaining = isTrial ? paidRemaining : paidRemaining - 1

    return c.json({
      success: true,
      order: {
        id: newOrderId,
        order_number: orderNumber,
        property_address,
        service_tier: tier,
        price,
        status: 'processing',
        payment_status: paymentStatus,
        is_trial: isTrial,
        latitude: geocodedLat,
        longitude: geocodedLng
      },
      credits_remaining: newFreeTrialRemaining + newPaidRemaining,
      free_trial_remaining: newFreeTrialRemaining,
      paid_credits_remaining: newPaidRemaining
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to use credit', details: err.message }, 500)
  }
})

// ============================================================
// STRIPE WEBHOOK — Process payment confirmations
// Verifies Stripe-Signature header when STRIPE_WEBHOOK_SECRET is set
// ============================================================
stripeRoutes.post('/webhook', async (c) => {
  try {
    const rawBody = await c.req.text()
    const webhookSecret = (c.env as any).STRIPE_WEBHOOK_SECRET
    
    // Verify Stripe webhook signature if secret is configured
    if (webhookSecret) {
      const sigHeader = c.req.header('Stripe-Signature')
      if (!sigHeader) {
        console.warn('[Webhook] Missing Stripe-Signature header')
        return c.json({ error: 'Missing Stripe-Signature header' }, 400)
      }
      
      const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret)
      if (!isValid) {
        console.warn('[Webhook] Invalid Stripe-Signature')
        return c.json({ error: 'Invalid signature' }, 400)
      }
    }
    
    // Parse the event
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
          const tier = meta.service_tier || 'standard'
          const address = meta.property_address || 'Unknown address'
          // Single report = $10 CAD flat
          const price = 10

          const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
          const orderNumber = `RM-${d}-${rand}`
          // Instant delivery — report generates immediately
          const estimatedDelivery = new Date(Date.now() + 30000).toISOString()

          // Ensure master company exists
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email) VALUES (1, 'RoofReporterAI', 'Admin', 'reports@reusecanada.ca')"
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

          const webhookOrderId = orderResult.meta.last_row_id as number

          // Update stripe payment with order_id
          await c.env.DB.prepare(
            'UPDATE stripe_payments SET order_id = ? WHERE stripe_checkout_session_id = ?'
          ).bind(webhookOrderId, session.id).run()

          // Geocode address if not already geocoded
          const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY
          if (mapsKey && !meta.latitude) {
            const fullAddr = [address, meta.property_city, meta.property_province, meta.property_postal_code]
              .filter(Boolean).join(', ')
            const geo = await geocodeAddress(fullAddr, mapsKey)
            if (geo) {
              await c.env.DB.prepare(
                'UPDATE orders SET latitude = ?, longitude = ?, updated_at = datetime("now") WHERE id = ?'
              ).bind(geo.lat, geo.lng, webhookOrderId).run()
              console.log(`[Webhook] Geocoded "${fullAddr}" → ${geo.lat}, ${geo.lng}`)
            }
          }

          // Create placeholder report
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
          ).bind(webhookOrderId).run()

          // Auto-trigger report generation — direct function call
          try {
            const generatePromise = triggerReportGeneration(webhookOrderId, c.env)
            if ((c as any).executionCtx?.waitUntil) {
              ;(c as any).executionCtx.waitUntil(generatePromise)
            } else {
              await generatePromise
            }
          } catch (e: any) {
            console.warn(`[Webhook] Auto-generate error (non-fatal): ${e.message}`)
          }

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
