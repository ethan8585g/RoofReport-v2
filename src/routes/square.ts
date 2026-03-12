import { Hono } from 'hono'
import type { Bindings } from '../types'
import { generateReportForOrder, enhanceReportInline, generateAIImageryForReport } from './reports'
import { isDevAccount } from './customer-auth'
import { trackPaymentCompleted, trackCreditPurchase } from '../services/ga4-events'
import { resolveTeamOwner } from './team'

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
// AUTO-GENERATE REPORT — Background Pipeline via waitUntil()
// Phase 1: generateReportForOrder (WELD + PAINT + POLISH) → saved as 'completed'
// Phase 2: enhanceReportInline (Gemini polish) → overwrites if successful
// Customer is redirected to dashboard IMMEDIATELY — report appears via polling.
// waitUntil() keeps the worker alive for background generation.
// Auto-recovery handles any edge-case failures (reports stuck >90s).
// ============================================================
// ============================================================
// PHASE 1 ONLY — Base report generation (NO enhancement, NO AI imagery)
// Stays well within Cloudflare Workers' 30s waitUntil() budget.
// Enhancement & AI imagery are triggered separately by the dashboard
// polling endpoint, each in their own HTTP request/timeout window.
// ============================================================
async function triggerReportGeneration(orderId: number, env: Bindings): Promise<boolean> {
  try {
    const startMs = Date.now()
    console.log(`[Auto-Generate] Phase 1: Base report for order ${orderId}`)
    const result = await generateReportForOrder(orderId, env)
    const elapsed = Date.now() - startMs
    console.log(`[Auto-Generate] Order ${orderId}: ${result.success ? 'SUCCESS' : result.error || 'FAILED'} — provider: ${result.provider || 'n/a'}, ${elapsed}ms`)

    // ⛔ Enhancement and AI Imagery are NO LONGER run here.
    // They caused Cloudflare Workers waitUntil() to exceed 30s.
    // The customer dashboard polls /enhancement-status and triggers
    // /enhance (or /ai-imagery) in separate HTTP requests instead.

    return result.success === true
  } catch (err: any) {
    console.error(`[Auto-Generate] Order ${orderId} failed:`, err.message)
    return false
  }
}

// ============================================================
// SQUARE API HELPER — All calls go through Square REST API
// No SDK needed — Cloudflare Workers compatible
// Square API v2 uses JSON bodies (not form-encoded like Stripe)
// ============================================================
const SQUARE_API_BASE = 'https://connect.squareup.com/v2'
const SQUARE_API_VERSION = '2025-01-23'

async function squareRequest(accessToken: string, method: string, path: string, body?: any) {
  const url = `${SQUARE_API_BASE}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_API_VERSION,
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
// SQUARE WEBHOOK SIGNATURE VERIFICATION (Web Crypto API)
// Square uses HMAC-SHA256 over: notificationUrl + body
// Header: x-square-hmacsha256-signature (base64)
// ============================================================
async function verifySquareSignature(body: string, signature: string, signatureKey: string, notificationUrl: string): Promise<boolean> {
  try {
    if (!signature || !signatureKey) return false

    // Square signature = HMAC-SHA256(signatureKey, notificationUrl + body)
    const payload = notificationUrl + body
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(signatureKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    // Convert to base64
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))

    return signature === expectedSig
  } catch (err: any) {
    console.error('[Square Webhook] Signature verification error:', err.message)
    return false
  }
}

// ============================================================
// AUTH MIDDLEWARE — Extract customer from session token
// Team members resolve to owner's billing & credits
// ============================================================
async function getCustomerFromToken(db: D1Database, token: string | undefined): Promise<any | null> {
  if (!token) return null
  const session = await db.prepare(`
    SELECT cs.customer_id, c.* FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id
    WHERE cs.session_token = ? AND cs.expires_at > datetime('now') AND c.is_active = 1
  `).bind(token).first<any>()
  if (!session) return null

  // Resolve team membership — team members use the owner's credits & billing
  const teamInfo = await resolveTeamOwner(db, session.customer_id)
  if (teamInfo.isTeamMember) {
    // Fetch the owner's customer record for credits/billing
    const owner = await db.prepare(`
      SELECT c.*, ? as real_customer_id FROM customers c WHERE c.id = ? AND c.is_active = 1
    `).bind(session.customer_id, teamInfo.ownerId).first<any>()
    if (owner) {
      owner.customer_id = teamInfo.ownerId
      owner.is_team_member = true
      owner.real_customer_id = session.customer_id
      owner.team_member_role = teamInfo.teamMemberRole
      return owner
    }
  }
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

  // Get payment history (table renamed from stripe_payments → square_payments, but we query both for backwards compat)
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
// CREATE SQUARE PAYMENT LINK — Buy credits (credit pack checkout)
// Uses Square Checkout API → CreatePaymentLink (Quick Pay)
// ============================================================
squareRoutes.post('/checkout', async (c) => {
  try {
    const accessToken = c.env.SQUARE_ACCESS_TOKEN
    const locationId = c.env.SQUARE_LOCATION_ID
    if (!accessToken || !locationId) return c.json({ error: 'Square is not configured. Contact admin.' }, 503)

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

    // Create Square Payment Link (Quick Pay Checkout)
    const idempotencyKey = `checkout-${customer.customer_id}-${pkg.id}-${Date.now()}`
    const paymentLink = await squareRequest(accessToken, 'POST', '/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `${pkg.name} — Roof Report Credits`,
        price_money: {
          amount: pkg.price_cents, // Square uses cents (same as our DB)
          currency: 'CAD',
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: successUrl,
        ask_for_shipping_address: false,
      },
      payment_note: `${pkg.credits} roof report credits for ${customer.email}`,
    })

    const link = paymentLink.payment_link
    const squareOrderId = link?.order_id || ''

    // Record the pending payment
    await c.env.DB.prepare(`
      INSERT INTO square_payments (customer_id, square_order_id, square_payment_link_id, amount, currency, status, payment_type, description, order_id)
      VALUES (?, ?, ?, ?, 'cad', 'pending', 'credit_pack', ?, ?)
    `).bind(
      customer.customer_id, squareOrderId, link?.id || '', pkg.price_cents,
      `${pkg.name} (${pkg.credits} credits)`,
      order_id || null
    ).run()

    return c.json({
      checkout_url: link?.url || link?.long_url,
      payment_link_id: link?.id,
      order_id: squareOrderId,
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
    const accessToken = c.env.SQUARE_ACCESS_TOKEN
    const locationId = c.env.SQUARE_LOCATION_ID
    if (!accessToken || !locationId) return c.json({ error: 'Square is not configured. Contact admin.' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    const { property_address, property_city, property_province, property_postal_code,
            service_tier, latitude, longitude, success_url, cancel_url } = await c.req.json()

    if (!property_address) return c.json({ error: 'Property address is required' }, 400)

    const tier = service_tier || 'standard'
    // Single report = $10 CAD flat (1000 cents)
    const priceCents = 1000
    const tierLabels: Record<string, string> = { express: 'Express', standard: 'Standard' }

    const origin = new URL(c.req.url).origin
    const successUrlFinal = success_url || `${origin}/customer/dashboard?payment=success`
    const cancelUrlFinal = cancel_url || `${origin}/customer/dashboard?payment=cancelled`

    // Create Square Payment Link for single report
    const idempotencyKey = `report-${customer.customer_id}-${Date.now()}`
    const paymentLink = await squareRequest(accessToken, 'POST', '/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `Roof Measurement Report — ${tierLabels[tier] || tier}`,
        price_money: {
          amount: priceCents,
          currency: 'CAD',
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: successUrlFinal,
        ask_for_shipping_address: false,
      },
      payment_note: `AI roof report for: ${property_address} | Customer: ${customer.email} | Tier: ${tier}` +
        (latitude ? ` | Lat: ${latitude}` : '') +
        (longitude ? ` | Lng: ${longitude}` : '') +
        (property_city ? ` | City: ${property_city}` : '') +
        (property_province ? ` | Prov: ${property_province}` : ''),
    })

    const link = paymentLink.payment_link
    const squareOrderId = link?.order_id || ''

    // Store metadata in our DB for webhook processing
    await c.env.DB.prepare(`
      INSERT INTO square_payments (customer_id, square_order_id, square_payment_link_id, amount, currency, status, payment_type, description, metadata_json)
      VALUES (?, ?, ?, ?, 'cad', 'pending', 'one_time_report', ?, ?)
    `).bind(
      customer.customer_id, squareOrderId, link?.id || '', priceCents,
      `Roof report: ${property_address}`,
      JSON.stringify({
        payment_type: 'one_time_report',
        service_tier: tier,
        property_address,
        property_city: property_city || '',
        property_province: property_province || '',
        property_postal_code: property_postal_code || '',
        latitude: latitude || '',
        longitude: longitude || '',
      })
    ).run()

    return c.json({
      checkout_url: link?.url || link?.long_url,
      payment_link_id: link?.id,
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
            service_tier, latitude, longitude, roof_trace_json, price_per_bundle, trace_measurement_json } = await c.req.json()

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
        notes, is_trial, roof_trace_json, price_per_bundle, trace_measurement_json
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderNumber, customer.customer_id,
      property_address, property_city || null, property_province || null, property_postal_code || null,
      latitude || null, longitude || null,
      customer.name, customer.email,
      customer.name, customer.email,
      tier, price, paymentStatus, estimatedDelivery,
      notes, isTrial ? 1 : 0,
      roof_trace_json ? (typeof roof_trace_json === 'string' ? roof_trace_json : JSON.stringify(roof_trace_json)) : null,
      price_per_bundle || null,
      trace_measurement_json ? (typeof trace_measurement_json === 'string' ? trace_measurement_json : JSON.stringify(trace_measurement_json)) : null
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
    // AUTO-GENERATE REPORT — Fire-and-forget via waitUntil()
    // Customer is redirected to dashboard IMMEDIATELY (~1s response).
    // Report generates in background (~20-40s) and appears via polling.
    // waitUntil() keeps the worker alive for the generation pipeline.
    // Auto-recovery handles edge-case failures (stuck >90s).
    // ============================================================
    try {
      const generatePromise = triggerReportGeneration(newOrderId, c.env)
      if ((c as any).executionCtx?.waitUntil) {
        // Cloudflare Workers/Pages: background generation
        ;(c as any).executionCtx.waitUntil(generatePromise)
        console.log(`[Use-Credit] Order ${newOrderId}: Generation dispatched via waitUntil — responding immediately`)
      } else {
        // Local dev: await inline (no waitUntil available)
        await generatePromise
      }
    } catch (e: any) {
      console.warn(`[Use-Credit] Auto-generate dispatch error (non-fatal): ${e.message}`)
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
// Verifies x-square-hmacsha256-signature header when SQUARE_WEBHOOK_SIGNATURE_KEY is set
// Subscribe to: payment.completed, order.updated
// ============================================================
squareRoutes.post('/webhook', async (c) => {
  try {
    const rawBody = await c.req.text()
    const signatureKey = (c.env as any).SQUARE_WEBHOOK_SIGNATURE_KEY
    const webhookUrl = (c.env as any).SQUARE_WEBHOOK_URL

    // Verify Square webhook signature if key is configured
    if (signatureKey && webhookUrl) {
      const sigHeader = c.req.header('x-square-hmacsha256-signature')
      if (!sigHeader) {
        console.warn('[Square Webhook] Missing x-square-hmacsha256-signature header')
        return c.json({ error: 'Missing signature header' }, 400)
      }

      const isValid = await verifySquareSignature(rawBody, sigHeader, signatureKey, webhookUrl)
      if (!isValid) {
        console.warn('[Square Webhook] Invalid signature')
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

    const eventId = event.event_id || event.id || `sq_${Date.now()}`
    const eventType = event.type || ''

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

        const squareOrderId = payment.order_id
        if (!squareOrderId) break

        // Find our pending payment record by square_order_id
        const pendingPayment = await c.env.DB.prepare(
          'SELECT * FROM square_payments WHERE square_order_id = ? AND status = ?'
        ).bind(squareOrderId, 'pending').first<any>()

        if (!pendingPayment) {
          console.warn(`[Square Webhook] No pending payment found for order ${squareOrderId}`)
          break
        }

        // Update payment record
        await c.env.DB.prepare(`
          UPDATE square_payments SET 
            square_payment_id = ?, status = 'succeeded', updated_at = datetime('now')
          WHERE square_order_id = ? AND status = 'pending'
        `).bind(payment.id, squareOrderId).run()

        const customerId = pendingPayment.customer_id

        if (pendingPayment.payment_type === 'one_time_report') {
          // Single report purchase — create order automatically
          let meta: any = {}
          try { meta = JSON.parse(pendingPayment.metadata_json || '{}') } catch {}

          const tier = meta.service_tier || 'standard'
          const address = meta.property_address || 'Unknown address'
          const price = 10

          const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
          const orderNumber = `RM-${d}-${rand}`
          const estimatedDelivery = new Date(Date.now() + 30000).toISOString()

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
            `Paid via Square (${payment.id})`
          ).run()

          const webhookOrderId = orderResult.meta.last_row_id as number

          // Update square payment with order_id
          await c.env.DB.prepare(
            'UPDATE square_payments SET order_id = ? WHERE square_order_id = ?'
          ).bind(webhookOrderId, squareOrderId).run()

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
            }
          }

          // Create placeholder report
          await c.env.DB.prepare(
            "INSERT OR IGNORE INTO reports (order_id, status) VALUES (?, 'pending')"
          ).bind(webhookOrderId).run()

          // Auto-trigger report generation (background via waitUntil)
          try {
            const generatePromise = triggerReportGeneration(webhookOrderId, c.env)
            if ((c as any).executionCtx?.waitUntil) {
              ;(c as any).executionCtx.waitUntil(generatePromise)
              console.log(`[Square Webhook] Order ${webhookOrderId}: Generation dispatched via waitUntil`)
            } else {
              await generatePromise
            }
          } catch (e: any) {
            console.warn(`[Square Webhook] Auto-generate dispatch error (non-fatal): ${e.message}`)
          }

          await c.env.DB.prepare(`
            INSERT INTO user_activity_log (company_id, action, details)
            VALUES (1, 'square_report_purchased', ?)
          `).bind(`${custData?.email || 'Customer'} purchased report for ${address} via Square ($${price})`).run()

        } else {
          // Credit pack purchase — add credits
          // Parse credits from description (format: "Pack Name (X credits)")
          const descMatch = pendingPayment.description?.match(/\((\d+) credits?\)/)
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

      case 'refund.created':
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
    console.error('Square Webhook error:', err)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

// ============================================================
// VERIFY PAYMENT — After redirect back from Square checkout
// Square redirects include the order_id in the URL automatically
// This endpoint checks payment status via Square Orders API
// ============================================================
squareRoutes.get('/verify-payment', async (c) => {
  try {
    const accessToken = c.env.SQUARE_ACCESS_TOKEN
    if (!accessToken) return c.json({ error: 'Square not configured' }, 503)

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const customer = await getCustomerFromToken(c.env.DB, token)
    if (!customer) return c.json({ error: 'Not authenticated' }, 401)

    // Find the most recent pending payment for this customer and process it
    const pendingPayment = await c.env.DB.prepare(`
      SELECT * FROM square_payments 
      WHERE customer_id = ? AND status = 'pending' 
      ORDER BY created_at DESC LIMIT 1
    `).bind(customer.customer_id).first<any>()

    if (!pendingPayment || !pendingPayment.square_order_id) {
      return c.json({ success: false, payment_status: 'no_pending' })
    }

    // Check order status via Square API
    const order = await squareRequest(accessToken, 'GET', `/orders/${pendingPayment.square_order_id}`)
    const orderState = order.order?.state

    if (orderState === 'COMPLETED' || orderState === 'OPEN') {
      // Payment succeeded — process inline if webhook hasn't fired yet
      const alreadyProcessed = await c.env.DB.prepare(
        'SELECT id FROM square_payments WHERE square_order_id = ? AND status = ?'
      ).bind(pendingPayment.square_order_id, 'succeeded').first()

      if (!alreadyProcessed) {
        // Mark as succeeded
        await c.env.DB.prepare(`
          UPDATE square_payments SET status = 'succeeded', updated_at = datetime('now')
          WHERE square_order_id = ? AND status = 'pending'
        `).bind(pendingPayment.square_order_id).run()

        // If it's a credit pack, add credits
        if (pendingPayment.payment_type === 'credit_pack') {
          const descMatch = pendingPayment.description?.match(/\((\d+) credits?\)/)
          const credits = descMatch ? parseInt(descMatch[1]) : 0
          if (credits > 0) {
            await c.env.DB.prepare(
              'UPDATE customers SET report_credits = report_credits + ?, subscription_plan = CASE WHEN subscription_plan = "free" THEN "credits" ELSE subscription_plan END, updated_at = datetime("now") WHERE id = ?'
            ).bind(credits, customer.customer_id).run()
            // Track credit purchase in GA4
            trackCreditPurchase(c.env as any, String(customer.customer_id), credits, pendingPayment.amount || 0).catch(() => {})
          }
        }

        // Track payment completion in GA4 (non-blocking)
        trackPaymentCompleted(c.env as any, pendingPayment.square_order_id || '', pendingPayment.amount || 0, {
          payment_type: pendingPayment.payment_type || 'unknown',
          customer_id: String(customer.customer_id)
        }).catch(() => {})
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
      payment_status: orderState || 'unknown',
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
