// ============================================================
// RoofReporterAI — Roofer Secretary AI Phone Answering Service
// Powered by LiveKit.io
// ============================================================
// POST /api/secretary/subscribe        — Create $149/mo Stripe subscription
// GET  /api/secretary/status           — Get subscription + config status
// POST /api/secretary/config           — Save/update phone config
// GET  /api/secretary/config           — Get current config
// PUT  /api/secretary/directories      — Save directories (2-4)
// GET  /api/secretary/directories      — Get directories
// GET  /api/secretary/calls            — Get call log history
// POST /api/secretary/toggle           — Activate/deactivate service
// POST /api/secretary/livekit-token    — Generate LiveKit agent token
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { isDevAccount } from './customer-auth'

export const secretaryRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Customer must be logged in
// ============================================================
async function getCustomerInfo(c: any): Promise<{ id: number; email: string } | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await c.env.DB.prepare(
    `SELECT cs.customer_id, cu.email FROM customer_sessions cs JOIN customers cu ON cu.id = cs.customer_id WHERE cs.session_token = ? AND cs.expires_at > datetime('now')`
  ).bind(token).first<any>()
  if (!session?.customer_id) return null
  return { id: session.customer_id, email: session.email || '' }
}

secretaryRoutes.use('/*', async (c, next) => {
  const info = await getCustomerInfo(c)
  if (!info) return c.json({ error: 'Authentication required' }, 401)
  c.set('customerId' as any, info.id)
  c.set('customerEmail' as any, info.email)
  c.set('isDev' as any, isDevAccount(info.email))
  return next()
})

// ============================================================
// Stripe helper (same pattern as stripe.ts)
// ============================================================
async function stripeAPI(secretKey: string, method: string, path: string, body?: Record<string, string>) {
  const url = `https://api.stripe.com/v1${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  let formBody = ''
  if (body) {
    formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }
  const resp = await fetch(url, {
    method,
    headers,
    body: formBody || undefined,
  })
  return resp.json() as Promise<any>
}

// ============================================================
// LiveKit JWT Token Generator (HMAC-SHA256, Web Crypto API)
// ============================================================
function base64urlEncode(data: Uint8Array | string): string {
  let str: string
  if (typeof data === 'string') {
    str = btoa(data)
  } else {
    let binary = ''
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
    str = btoa(binary)
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateLiveKitToken(apiKey: string, apiSecret: string, identity: string, roomName: string, metadata?: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload: any = {
    iss: apiKey,
    sub: identity,
    iat: now,
    exp: now + 86400, // 24 hours
    nbf: now,
    jti: `${identity}-${now}`,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    }
  }
  if (metadata) payload.metadata = metadata

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const sigB64 = base64urlEncode(new Uint8Array(signature))

  return `${headerB64}.${payloadB64}.${sigB64}`
}

// ============================================================
// POST /subscribe — Create Stripe Checkout for $149/mo subscription
// ============================================================
secretaryRoutes.post('/subscribe', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const stripeKey = c.env.STRIPE_SECRET_KEY
  if (!stripeKey) return c.json({ error: 'Stripe not configured' }, 500)

  try {
    // Check if already subscribed
    const existing = await c.env.DB.prepare(
      `SELECT id, status, stripe_subscription_id FROM secretary_subscriptions WHERE customer_id = ? AND status IN ('active', 'pending') ORDER BY id DESC LIMIT 1`
    ).bind(customerId).first<any>()

    if (existing?.status === 'active') {
      return c.json({ error: 'You already have an active Roofer Secretary subscription', subscription: existing }, 400)
    }

    // Get customer info
    const customer = await c.env.DB.prepare(
      `SELECT email, name, stripe_customer_id FROM customers WHERE id = ?`
    ).bind(customerId).first<any>()
    if (!customer) return c.json({ error: 'Customer not found' }, 404)

    // Create or get Stripe customer
    let stripeCustomerId = customer.stripe_customer_id
    if (!stripeCustomerId) {
      const sc = await stripeAPI(stripeKey, 'POST', '/customers', {
        email: customer.email,
        name: customer.name || '',
        'metadata[platform]': 'roofreporterai',
        'metadata[customer_id]': String(customerId),
      })
      stripeCustomerId = sc.id
      await c.env.DB.prepare(
        `UPDATE customers SET stripe_customer_id = ? WHERE id = ?`
      ).bind(stripeCustomerId, customerId).run()
    }

    // Get the origin for success/cancel URLs
    const origin = new URL(c.req.url).origin

    // Create Stripe Checkout Session for subscription
    const session = await stripeAPI(stripeKey, 'POST', '/checkout/sessions', {
      'customer': stripeCustomerId,
      'mode': 'subscription',
      'line_items[0][price_data][currency]': 'cad',
      'line_items[0][price_data][unit_amount]': '14900',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': 'Roofer Secretary — AI Phone Answering Service',
      'line_items[0][price_data][product_data][description]': '24/7 AI phone answering, call routing, message taking & transcript logging for your roofing business.',
      'line_items[0][quantity]': '1',
      'success_url': `${origin}/customer/secretary?setup=true&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${origin}/customer/secretary?cancelled=true`,
      'metadata[customer_id]': String(customerId),
      'metadata[service]': 'roofer_secretary',
      'subscription_data[metadata][customer_id]': String(customerId),
      'subscription_data[metadata][service]': 'roofer_secretary',
    })

    if (session.error) {
      return c.json({ error: session.error.message || 'Stripe session failed' }, 400)
    }

    // Record pending subscription
    await c.env.DB.prepare(
      `INSERT INTO secretary_subscriptions (customer_id, status, stripe_subscription_id) VALUES (?, 'pending', ?)`
    ).bind(customerId, session.id).run()

    return c.json({
      checkout_url: session.url,
      session_id: session.id,
    })
  } catch (err: any) {
    console.error('[Secretary Subscribe]', err)
    return c.json({ error: 'Failed to create subscription', details: err.message }, 500)
  }
})

// ============================================================
// POST /verify-session — Verify Stripe Checkout completed
// ============================================================
secretaryRoutes.post('/verify-session', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { session_id } = await c.req.json()
  const stripeKey = c.env.STRIPE_SECRET_KEY
  if (!stripeKey || !session_id) return c.json({ error: 'Missing data' }, 400)

  try {
    const session = await stripeAPI(stripeKey, 'GET', `/checkout/sessions/${session_id}`, undefined)

    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Activate subscription
      await c.env.DB.prepare(
        `UPDATE secretary_subscriptions SET status = 'active', stripe_subscription_id = ?, current_period_start = datetime('now'), current_period_end = datetime('now', '+30 days'), updated_at = datetime('now') WHERE customer_id = ? AND status = 'pending'`
      ).bind(session.subscription || session.id, customerId).run()

      // Create default config if none exists
      const existingConfig = await c.env.DB.prepare(
        `SELECT id FROM secretary_config WHERE customer_id = ?`
      ).bind(customerId).first<any>()

      if (!existingConfig) {
        await c.env.DB.prepare(
          `INSERT INTO secretary_config (customer_id, business_phone, greeting_script) VALUES (?, '', '')`
        ).bind(customerId).run()
      }

      return c.json({ status: 'active', message: 'Subscription activated!' })
    }

    return c.json({ status: 'pending', message: 'Payment not yet confirmed' })
  } catch (err: any) {
    console.error('[Secretary Verify]', err)
    return c.json({ error: 'Verification failed', details: err.message }, 500)
  }
})

// ============================================================
// GET /status — Full service status for the customer
// ============================================================
secretaryRoutes.get('/status', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const isDev = c.get('isDev' as any) as boolean

  const sub = await c.env.DB.prepare(
    `SELECT * FROM secretary_subscriptions WHERE customer_id = ? AND status IN ('active', 'pending', 'past_due') ORDER BY id DESC LIMIT 1`
  ).bind(customerId).first<any>()

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  const dirs = config ? await c.env.DB.prepare(
    `SELECT * FROM secretary_directories WHERE config_id = ? ORDER BY sort_order`
  ).bind(config.id).all<any>() : { results: [] }

  const callCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM secretary_call_logs WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  // Dev account gets free access — treat as active subscription
  const hasActive = isDev ? true : sub?.status === 'active'

  return c.json({
    subscription: isDev ? { status: 'active', is_dev_grant: true } : (sub || null),
    has_active_subscription: hasActive,
    config: config || null,
    directories: dirs.results || [],
    total_calls: callCount?.total || 0,
    is_configured: !!(config?.business_phone && config?.greeting_script),
    is_active: config?.is_active === 1,
    is_dev: isDev,
  })
})

// ============================================================
// POST /config — Save/update phone answering configuration
// ============================================================
secretaryRoutes.post('/config', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { business_phone, greeting_script, common_qa, general_notes } = await c.req.json()

  if (!business_phone) return c.json({ error: 'Business phone number is required' }, 400)
  if (!greeting_script) return c.json({ error: 'Greeting script is required' }, 400)
  if (general_notes && general_notes.length > 3000) return c.json({ error: 'General notes must be 3000 characters or less' }, 400)

  try {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM secretary_config WHERE customer_id = ?`
    ).bind(customerId).first<any>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE secretary_config SET business_phone = ?, greeting_script = ?, common_qa = ?, general_notes = ?, updated_at = datetime('now') WHERE customer_id = ?`
      ).bind(business_phone, greeting_script, common_qa || '', general_notes || '', customerId).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO secretary_config (customer_id, business_phone, greeting_script, common_qa, general_notes) VALUES (?, ?, ?, ?, ?)`
      ).bind(customerId, business_phone, greeting_script, common_qa || '', general_notes || '').run()
    }

    return c.json({ success: true, message: 'Configuration saved' })
  } catch (err: any) {
    return c.json({ error: 'Failed to save config', details: err.message }, 500)
  }
})

// ============================================================
// GET /config — Get current config
// ============================================================
secretaryRoutes.get('/config', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  return c.json({ config: config || null })
})

// ============================================================
// PUT /directories — Save/replace directories (2-4)
// ============================================================
secretaryRoutes.put('/directories', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { directories } = await c.req.json()

  if (!directories || !Array.isArray(directories)) return c.json({ error: 'directories array required' }, 400)
  if (directories.length < 2 || directories.length > 4) return c.json({ error: 'Must provide 2-4 directories' }, 400)

  for (const d of directories) {
    if (!d.name || !d.name.trim()) return c.json({ error: 'Each directory needs a name' }, 400)
    if (d.special_notes && d.special_notes.length > 3000) return c.json({ error: `Notes for "${d.name}" must be 3000 characters or less` }, 400)
  }

  try {
    const config = await c.env.DB.prepare(
      `SELECT id FROM secretary_config WHERE customer_id = ?`
    ).bind(customerId).first<any>()
    if (!config) return c.json({ error: 'Save your phone configuration first' }, 400)

    // Delete old directories and insert new ones
    await c.env.DB.prepare(
      `DELETE FROM secretary_directories WHERE config_id = ? AND customer_id = ?`
    ).bind(config.id, customerId).run()

    for (let i = 0; i < directories.length; i++) {
      const d = directories[i]
      await c.env.DB.prepare(
        `INSERT INTO secretary_directories (customer_id, config_id, name, phone_or_action, special_notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(customerId, config.id, d.name.trim(), d.phone_or_action || '', d.special_notes || '', i).run()
    }

    return c.json({ success: true, message: `${directories.length} directories saved` })
  } catch (err: any) {
    return c.json({ error: 'Failed to save directories', details: err.message }, 500)
  }
})

// ============================================================
// GET /directories — Get current directories
// ============================================================
secretaryRoutes.get('/directories', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const config = await c.env.DB.prepare(
    `SELECT id FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ directories: [] })

  const dirs = await c.env.DB.prepare(
    `SELECT * FROM secretary_directories WHERE config_id = ? ORDER BY sort_order`
  ).bind(config.id).all<any>()

  return c.json({ directories: dirs.results || [] })
})

// ============================================================
// POST /toggle — Activate or deactivate the service
// ============================================================
secretaryRoutes.post('/toggle', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const isDev = c.get('isDev' as any) as boolean

  // Verify active subscription (dev accounts bypass)
  if (!isDev) {
    const sub = await c.env.DB.prepare(
      `SELECT status FROM secretary_subscriptions WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`
    ).bind(customerId).first<any>()
    if (!sub) return c.json({ error: 'Active subscription required' }, 403)
  }

  const config = await c.env.DB.prepare(
    `SELECT id, is_active, business_phone, greeting_script FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ error: 'Configuration required before activation' }, 400)
  if (!config.business_phone || !config.greeting_script) return c.json({ error: 'Complete your phone setup before activating' }, 400)

  // Check directories
  const dirCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM secretary_directories WHERE config_id = ?`
  ).bind(config.id).first<any>()
  if (!dirCount || dirCount.cnt < 2) return c.json({ error: 'At least 2 directories are required' }, 400)

  const newState = config.is_active === 1 ? 0 : 1
  await c.env.DB.prepare(
    `UPDATE secretary_config SET is_active = ?, updated_at = datetime('now') WHERE customer_id = ?`
  ).bind(newState, customerId).run()

  return c.json({ is_active: newState === 1, message: newState === 1 ? 'Roofer Secretary is now ACTIVE' : 'Roofer Secretary has been PAUSED' })
})

// ============================================================
// GET /calls — Call log history
// ============================================================
secretaryRoutes.get('/calls', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  const calls = await c.env.DB.prepare(
    `SELECT * FROM secretary_call_logs WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(customerId, limit, offset).all<any>()

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM secretary_call_logs WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  return c.json({
    calls: calls.results || [],
    total: total?.cnt || 0,
    limit,
    offset,
  })
})

// ============================================================
// POST /livekit-token — Generate LiveKit agent token for this customer's room
// Used by LiveKit agent to connect and handle inbound calls
// ============================================================
secretaryRoutes.post('/livekit-token', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL

  if (!apiKey || !apiSecret) return c.json({ error: 'LiveKit not configured' }, 500)

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ error: 'Secretary not configured' }, 400)

  // Load directories for agent context
  const dirs = await c.env.DB.prepare(
    `SELECT name, phone_or_action, special_notes FROM secretary_directories WHERE config_id = ? ORDER BY sort_order`
  ).bind(config.id).all<any>()

  // Build agent metadata with all config
  const metadata = JSON.stringify({
    customer_id: customerId,
    business_phone: config.business_phone,
    greeting_script: config.greeting_script,
    common_qa: config.common_qa,
    general_notes: config.general_notes,
    directories: dirs.results || [],
  })

  const roomName = `secretary-${customerId}`
  const identity = `agent-${customerId}`
  const token = await generateLiveKitToken(apiKey, apiSecret, identity, roomName, metadata)

  return c.json({
    token,
    url: livekitUrl,
    room: roomName,
    identity,
  })
})

// ============================================================
// POST /webhook/call-complete — LiveKit calls this after each call
// Records call log entry
// ============================================================
secretaryRoutes.post('/webhook/call-complete', async (c) => {
  try {
    const body = await c.req.json()
    const {
      customer_id, caller_phone, caller_name,
      duration_seconds, directory_routed,
      summary, transcript, outcome, room_id
    } = body

    if (!customer_id) return c.json({ error: 'customer_id required' }, 400)

    await c.env.DB.prepare(
      `INSERT INTO secretary_call_logs (customer_id, caller_phone, caller_name, call_duration_seconds, directory_routed, call_summary, call_transcript, call_outcome, livekit_room_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      customer_id,
      caller_phone || 'Unknown',
      caller_name || 'Unknown',
      duration_seconds || 0,
      directory_routed || '',
      summary || '',
      transcript || '',
      outcome || 'answered',
      room_id || ''
    ).run()

    return c.json({ success: true })
  } catch (err: any) {
    console.error('[Secretary Webhook]', err)
    return c.json({ error: err.message }, 500)
  }
})
