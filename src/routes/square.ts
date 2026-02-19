import { Hono } from 'hono'
import type { Bindings } from '../types'
import { generateReportForOrder } from './reports'
import { isDevAccount } from './customer-auth'

export const squareRoutes = new Hono<{ Bindings: Bindings }>()

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
// SQUARE API HELPER — All calls go through Square REST API
// No SDK needed — Cloudflare Workers compatible
// Sandbox: https://connect.squareupsandbox.com
// Production: https://connect.squareup.com
// ============================================================

function getSquareBaseUrl(accessToken: string): string {
  // Sandbox tokens start with "EAAA" (sandbox access tokens)
  // Production tokens start with "EAAAECx" or similar longer prefixes
  // Sandbox application IDs start with "sandbox-sq0idb-"
  // Simple heuristic: if the token is a sandbox token, use sandbox URL
  // The SQUARE_ENVIRONMENT env var takes precedence if set
  // For now, using sandbox URL for the provided sandbox keys
  if (accessToken && !accessToken.startsWith('EAAA')) {
    return 'https://connect.squareup.com'
  }
  return 'https://connect.squareupsandbox.com'
}

async function squareRequest(accessToken: string, method: string, path: string, body?: any) {
  const baseUrl = getSquareBaseUrl(accessToken)
  const url = `${baseUrl}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-12-18',
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data: any = await response.json()
  if (!response.ok) {
    const errMsg = data.errors?.[0]?.detail || data.errors?.[0]?.code || `Square API error: ${response.status}`
    throw new Error(errMsg)
  }
  return data
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
squareRoutes.get('/packages', async (c) => {
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
squareRoutes.get('/billing', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const customer = await getCustomerFromToken(c.env.DB, token)
  if (!customer) return c.json({ error: 'Not authenticated' }, 401)

  // Get payment history
  const payments = await c.env.DB.prepare(`
    SELECT sp.*, o.order_number, o.property_address 
    FROM square_payments sp 
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
      square_customer_id: customer.square_customer_id || null,
      is_dev: isDev || undefined,
    },
    payments: payments.results
  })
})

// ============================================================
// CREATE SQUARE CHECKOUT — Buy credits (payment link)
// Uses Square Checkout API CreatePaymentLink for hosted checkout
// ============================================================
squareRoutes.post('/checkout', async (c) => {
  try {
    const squareToken = c.env.SQUARE_ACCESS_TOKEN
    if (!squareToken) return c.json({ error: 'Square payments are not configured. Contact admin.' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const { package_id, order_id, success_url, cancel_url } = await c.req.json()

    // Look up package
    const pkg = await c.env.DB.prepare(
      'SELECT * FROM credit_packages WHERE id = ? AND is_active = 1'
    ).bind(package_id || 1).first<any>()

    if (!pkg) return c.json({ error: 'Package not found' }, 404)

    // Determine URLs
    const origin = new URL(c.req.url).origin
    const successUrl = success_url || `${origin}/customer/dashboard?payment=success`
    const cancelUrl = cancel_url || `${origin}/customer/dashboard?payment=cancelled`

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID()

    // Create Square Payment Link (hosted checkout)
    const linkData = await squareRequest(squareToken, 'POST', '/v2/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `${pkg.name} — Roof Report Credits`,
        price_money: {
          amount: pkg.price_cents, // Square uses smallest currency unit (cents)
          currency: 'CAD',
        },
        location_id: c.env.SQUARE_LOCATION_ID,
      },
      checkout_options: {
        redirect_url: successUrl,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        buyer_email: customer.email || undefined,
      },
    })

    const paymentLink = linkData.payment_link
    const checkoutUrl = paymentLink?.url || paymentLink?.long_url

    // Record the pending payment
    await c.env.DB.prepare(`
      INSERT INTO square_payments (customer_id, square_payment_link_id, square_order_id, amount, currency, status, payment_type, description, order_id)
      VALUES (?, ?, ?, ?, 'cad', 'pending', 'credit_pack', ?, ?)
    `).bind(
      customer.customer_id,
      paymentLink?.id || null,
      paymentLink?.order_id || null,
      pkg.price_cents,
      `${pkg.name} (${pkg.credits} credits)`,
      order_id || null
    ).run()

    return c.json({
      checkout_url: checkoutUrl,
      payment_link_id: paymentLink?.id,
    })
  } catch (err: any) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

// ============================================================
// CREATE CHECKOUT FOR SINGLE REPORT (quick pay)
// Customer places order + pays in one step
// ============================================================
squareRoutes.post('/checkout/report', async (c) => {
  try {
    const squareToken = c.env.SQUARE_ACCESS_TOKEN
    if (!squareToken) return c.json({ error: 'Square payments are not configured. Contact admin.' }, 503)

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

    const origin = new URL(c.req.url).origin
    const successUrlFinal = success_url || `${origin}/customer/dashboard?payment=success`
    const cancelUrlFinal = cancel_url || `${origin}/customer/dashboard?payment=cancelled`

    const idempotencyKey = crypto.randomUUID()

    const linkData = await squareRequest(squareToken, 'POST', '/v2/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `Roof Measurement Report — ${tierLabels[tier] || tier}`,
        price_money: {
          amount: priceCents,
          currency: 'CAD',
        },
        location_id: c.env.SQUARE_LOCATION_ID,
      },
      checkout_options: {
        redirect_url: successUrlFinal,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        buyer_email: customer.email || undefined,
      },
    })

    const paymentLink = linkData.payment_link
    const checkoutUrl = paymentLink?.url || paymentLink?.long_url

    // Store metadata locally since Square payment links don't have custom metadata
    await c.env.DB.prepare(`
      INSERT INTO square_payments (customer_id, square_payment_link_id, square_order_id, amount, currency, status, payment_type, description, metadata_json)
      VALUES (?, ?, ?, ?, 'cad', 'pending', 'one_time_report', ?, ?)
    `).bind(
      customer.customer_id,
      paymentLink?.id || null,
      paymentLink?.order_id || null,
      priceCents,
      `${tierLabels[tier] || tier} report for: ${property_address}`,
      JSON.stringify({
        rc_customer_id: customer.customer_id,
        payment_type: 'one_time_report',
        service_tier: tier,
        property_address,
        property_city: property_city || '',
        property_province: property_province || '',
        property_postal_code: property_postal_code || '',
        latitude: latitude || null,
        longitude: longitude || null,
      })
    ).run()

    return c.json({
      checkout_url: checkoutUrl,
      payment_link_id: paymentLink?.id,
    })
  } catch (err: any) {
    return c.json({ error: 'Checkout failed', details: err.message }, 500)
  }
})

// ============================================================
// USE CREDITS — Free trial first, then paid credits
// New users get 3 free trial reports. After that, paid credits.
// ============================================================
squareRoutes.post('/use-credit', async (c) => {
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
      "INSERT OR IGNORE INTO master_companies (id, company_name, contact_name, email) VALUES (1, 'Reuse Canada', 'Admin', 'reports@reusecanada.ca')"
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
    // GEOCODE ADDRESS — Convert to lat/lng for Solar API
    // ============================================================
    const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY
    let geocodedLat: number | null = null
    let geocodedLng: number | null = null

    if (mapsKey) {
      const fullAddress = [property_address, property_city, property_province, property_postal_code]
        .filter(Boolean).join(', ')
      const geo = await geocodeAddress(fullAddress, mapsKey)
      if (geo) {
        geocodedLat = geo.lat
        geocodedLng = geo.lng
        // Update order with coordinates
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
    // ============================================================
    try {
      const generatePromise = triggerReportGeneration(newOrderId, c.env)
      if ((c as any).executionCtx?.waitUntil) {
        ;(c as any).executionCtx.waitUntil(generatePromise)
      } else {
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
// SQUARE WEBHOOK — Process payment confirmations
// Square sends webhook notifications for payment.completed etc.
// ============================================================
squareRoutes.post('/webhook', async (c) => {
  try {
    const rawBody = await c.req.text()
    const webhookSigKey = (c.env as any).SQUARE_WEBHOOK_SIGNATURE_KEY

    // Verify Square webhook signature if key is configured
    if (webhookSigKey) {
      const sigHeader = c.req.header('x-square-hmacsha256-signature')
      if (!sigHeader) {
        console.warn('[Square Webhook] Missing x-square-hmacsha256-signature header')
        return c.json({ error: 'Missing signature header' }, 400)
      }

      // Square webhook signature: HMAC-SHA256(webhookSigKey, webhookUrl + rawBody)
      const notificationUrl = c.req.url
      const payload = notificationUrl + rawBody
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(webhookSigKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
      const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))

      if (expectedSig !== sigHeader) {
        console.warn('[Square Webhook] Invalid signature')
        return c.json({ error: 'Invalid signature' }, 400)
      }
    }

    let event: any
    try {
      event = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const eventId = event.event_id || event.id || crypto.randomUUID()
    const eventType = event.type || 'unknown'

    // Idempotency check
    const existing = await c.env.DB.prepare(
      'SELECT id FROM square_webhook_events WHERE square_event_id = ?'
    ).bind(eventId).first()

    if (existing) {
      return c.json({ received: true, duplicate: true })
    }

    // Store event
    await c.env.DB.prepare(`
      INSERT INTO square_webhook_events (square_event_id, event_type, payload)
      VALUES (?, ?, ?)
    `).bind(eventId, eventType, rawBody).run()

    // Process based on event type
    switch (eventType) {
      case 'payment.completed': {
        const payment = event.data?.object?.payment
        if (!payment) break

        const orderId = payment.order_id
        if (!orderId) break

        // Look up our local payment record by Square order_id
        const localPayment = await c.env.DB.prepare(
          'SELECT * FROM square_payments WHERE square_order_id = ? AND status = ?'
        ).bind(orderId, 'pending').first<any>()

        if (localPayment) {
          // Update payment to succeeded
          await c.env.DB.prepare(`
            UPDATE square_payments SET 
              square_payment_id = ?, status = 'succeeded', updated_at = datetime('now')
            WHERE id = ?
          `).bind(payment.id, localPayment.id).run()

          const customerId = localPayment.customer_id

          if (localPayment.payment_type === 'one_time_report') {
            // Parse stored metadata
            let meta: any = {}
            try { meta = JSON.parse(localPayment.metadata_json || '{}') } catch {}

            const tier = meta.service_tier || 'standard'
            const address = meta.property_address || 'Unknown address'
            const reportPrice = 10

            const d2 = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            const rand2 = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
            const orderNumber = `RM-${d2}-${rand2}`
            const estimatedDelivery = new Date(Date.now() + 30000).toISOString()

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
              meta.latitude || null, meta.longitude || null,
              custData?.name || '', custData?.email || '',
              custData?.name || '', custData?.email || '',
              tier, reportPrice, estimatedDelivery,
              `Paid via Square (${payment.id})`
            ).run()

            const webhookOrderId = orderResult.meta.last_row_id as number

            // Update square payment with order_id
            await c.env.DB.prepare(
              'UPDATE square_payments SET order_id = ? WHERE id = ?'
            ).bind(webhookOrderId, localPayment.id).run()

            // Geocode if needed
            const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY
            if (mapsKey && !meta.latitude) {
              const fullAddr = [address, meta.property_city, meta.property_province, meta.property_postal_code]
                .filter(Boolean).join(', ')
              const geo = await geocodeAddress(fullAddr, mapsKey)
              if (geo) {
                await c.env.DB.prepare(
                  'UPDATE orders SET latitude = ?, longitude = ?, updated_at = datetime("now") WHERE id = ?'
                ).bind(geo.lat, geo.lng, webhookOrderId).run()
              }
            }

            // Create placeholder report
            await c.env.DB.prepare(
              "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
            ).bind(webhookOrderId).run()

            // Auto-trigger report generation
            try {
              const generatePromise = triggerReportGeneration(webhookOrderId, c.env)
              if ((c as any).executionCtx?.waitUntil) {
                ;(c as any).executionCtx.waitUntil(generatePromise)
              } else {
                await generatePromise
              }
            } catch (e: any) {
              console.warn(`[Square Webhook] Auto-generate error (non-fatal): ${e.message}`)
            }

            await c.env.DB.prepare(`
              INSERT INTO user_activity_log (company_id, action, details)
              VALUES (1, 'square_report_purchased', ?)
            `).bind(`${custData?.email || 'Customer'} purchased report for ${address} via Square ($${reportPrice})`).run()

          } else {
            // Credit pack purchase — add credits
            // Parse description to extract credits count
            const descMatch = localPayment.description?.match(/\((\d+)\s+credits?\)/i)
            const credits = descMatch ? parseInt(descMatch[1]) : 0

            if (credits > 0) {
              await c.env.DB.prepare(
                'UPDATE customers SET report_credits = report_credits + ?, subscription_plan = CASE WHEN subscription_plan = "free" THEN "credits" ELSE subscription_plan END, updated_at = datetime("now") WHERE id = ?'
              ).bind(credits, customerId).run()

              await c.env.DB.prepare(`
                INSERT INTO user_activity_log (company_id, action, details)
                VALUES (1, 'credits_purchased', ?)
              `).bind(`Customer #${customerId} purchased ${credits} credits via Square`).run()
            }
          }
        }

        // Mark webhook as processed
        await c.env.DB.prepare(
          'UPDATE square_webhook_events SET processed = 1 WHERE square_event_id = ?'
        ).bind(eventId).run()
        break
      }

      case 'payment.failed': {
        const payment = event.data?.object?.payment
        if (payment?.order_id) {
          await c.env.DB.prepare(`
            UPDATE square_payments SET status = 'failed', updated_at = datetime('now')
            WHERE square_order_id = ?
          `).bind(payment.order_id).run()
        }

        await c.env.DB.prepare(
          'UPDATE square_webhook_events SET processed = 1 WHERE square_event_id = ?'
        ).bind(eventId).run()
        break
      }

      case 'refund.completed':
      case 'refund.updated': {
        const refund = event.data?.object?.refund
        if (refund?.payment_id) {
          await c.env.DB.prepare(`
            UPDATE square_payments SET status = 'refunded', updated_at = datetime('now')
            WHERE square_payment_id = ?
          `).bind(refund.payment_id).run()
        }

        await c.env.DB.prepare(
          'UPDATE square_webhook_events SET processed = 1 WHERE square_event_id = ?'
        ).bind(eventId).run()
        break
      }
    }

    return c.json({ received: true })
  } catch (err: any) {
    console.error('Square webhook error:', err)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

// ============================================================
// VERIFY PAYMENT — After redirect back from Square checkout
// Polls Square Orders API to check payment status
// ============================================================
squareRoutes.get('/verify-payment/:paymentLinkId', async (c) => {
  try {
    const squareToken = c.env.SQUARE_ACCESS_TOKEN
    if (!squareToken) return c.json({ error: 'Square not configured' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const paymentLinkId = c.req.param('paymentLinkId')

    // Look up local payment record
    const localPayment = await c.env.DB.prepare(
      'SELECT * FROM square_payments WHERE square_payment_link_id = ? AND customer_id = ?'
    ).bind(paymentLinkId, customer.customer_id).first<any>()

    if (!localPayment) {
      return c.json({ success: false, payment_status: 'not_found' })
    }

    // If already succeeded, return current state
    if (localPayment.status === 'succeeded') {
      const updatedCustomer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.customer_id).first<any>()
      return c.json({
        success: true,
        payment_status: 'paid',
        credits_remaining: (updatedCustomer?.report_credits || 0) - (updatedCustomer?.credits_used || 0),
        credits_total: updatedCustomer?.report_credits || 0,
      })
    }

    // Check Square order status if we have an order_id
    if (localPayment.square_order_id) {
      try {
        const orderData = await squareRequest(squareToken, 'GET', `/v2/orders/${localPayment.square_order_id}`)
        const order = orderData.order

        if (order?.state === 'COMPLETED') {
          // Payment completed — process inline if webhook hasn't fired
          if (localPayment.payment_type === 'credit_pack') {
            const descMatch = localPayment.description?.match(/\((\d+)\s+credits?\)/i)
            const credits = descMatch ? parseInt(descMatch[1]) : 0

            if (credits > 0) {
              await c.env.DB.prepare(
                'UPDATE customers SET report_credits = report_credits + ?, subscription_plan = CASE WHEN subscription_plan = "free" THEN "credits" ELSE subscription_plan END, updated_at = datetime("now") WHERE id = ?'
              ).bind(credits, customer.customer_id).run()
            }
          }

          await c.env.DB.prepare(`
            UPDATE square_payments SET status = 'succeeded', updated_at = datetime('now')
            WHERE id = ?
          `).bind(localPayment.id).run()

          const updatedCustomer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.customer_id).first<any>()
          return c.json({
            success: true,
            payment_status: 'paid',
            credits_remaining: (updatedCustomer?.report_credits || 0) - (updatedCustomer?.credits_used || 0),
            credits_total: updatedCustomer?.report_credits || 0,
          })
        }
      } catch (e: any) {
        console.warn(`[Verify] Failed to check Square order: ${e.message}`)
      }
    }

    return c.json({
      success: false,
      payment_status: localPayment.status,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to verify payment', details: err.message }, 500)
  }
})

// ============================================================
// ADMIN: Revenue & Payment Stats
// ============================================================
squareRoutes.get('/admin/stats', async (c) => {
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
      FROM square_payments
    `).first()

    const recentPayments = await c.env.DB.prepare(`
      SELECT sp.*, c.name as customer_name, c.email as customer_email, c.company_name as customer_company,
             o.order_number, o.property_address
      FROM square_payments sp
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
      FROM square_payments 
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
squareRoutes.post('/admin/add-credits', async (c) => {
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
