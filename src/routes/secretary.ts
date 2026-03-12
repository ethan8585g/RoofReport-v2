// ============================================================
// RoofReporterAI — Roofer Secretary AI Phone Answering Service
// Powered by LiveKit.io
// ============================================================
// POST /api/secretary/subscribe        — Create $149/mo Square subscription
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
import { resolveTeamOwner } from './team'
import { isDevAccount } from './customer-auth'

export const secretaryRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Customer must be logged in
// ============================================================
async function getCustomerInfo(c: any): Promise<{ id: number; email: string; effectiveOwnerId: number; isTeamMember: boolean } | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await c.env.DB.prepare(
    `SELECT cs.customer_id, cu.email FROM customer_sessions cs JOIN customers cu ON cu.id = cs.customer_id WHERE cs.session_token = ? AND cs.expires_at > datetime('now')`
  ).bind(token).first<any>()
  if (!session?.customer_id) return null
  // Resolve team membership — team members use the owner's secretary config
  const teamInfo = await resolveTeamOwner(c.env.DB, session.customer_id)
  return { id: session.customer_id, email: session.email || '', effectiveOwnerId: teamInfo.ownerId, isTeamMember: teamInfo.isTeamMember }
}

secretaryRoutes.use('/*', async (c, next) => {
  const info = await getCustomerInfo(c)
  if (!info) return c.json({ error: 'Authentication required' }, 401)
  // Team members access the owner's secretary subscription & config
  c.set('customerId' as any, info.effectiveOwnerId)
  c.set('realCustomerId' as any, info.id)
  c.set('customerEmail' as any, info.email)
  c.set('isDev' as any, isDevAccount(info.email))
  c.set('isTeamMember' as any, info.isTeamMember)
  return next()
})

// ============================================================
// Square API helper (replaces Stripe)
// ============================================================
const SQUARE_API_BASE = 'https://connect.squareup.com/v2'
const SQUARE_API_VERSION = '2025-01-23'

async function squareAPI(accessToken: string, method: string, path: string, body?: any) {
  const url = `${SQUARE_API_BASE}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_API_VERSION,
  }
  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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
// POST /subscribe — Create Square Checkout for $149/mo subscription
// Square doesn't have native recurring billing via payment links,
// so we create a one-time $149 payment and manage renewal internally
// ============================================================
secretaryRoutes.post('/subscribe', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const accessToken = c.env.SQUARE_ACCESS_TOKEN
  const locationId = c.env.SQUARE_LOCATION_ID
  if (!accessToken || !locationId) return c.json({ error: 'Square not configured' }, 500)

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
      `SELECT email, name, square_customer_id FROM customers WHERE id = ?`
    ).bind(customerId).first<any>()
    if (!customer) return c.json({ error: 'Customer not found' }, 404)

    // Get the origin for success/cancel URLs
    const origin = new URL(c.req.url).origin

    // Create Square Payment Link for secretary subscription ($149/mo)
    const idempotencyKey = `secretary-${customerId}-${Date.now()}`
    const paymentLink = await squareAPI(accessToken, 'POST', '/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: 'Roofer Secretary — AI Phone Answering Service (Monthly)',
        price_money: {
          amount: 14900, // $149.00 CAD
          currency: 'CAD',
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: `${origin}/customer/secretary?setup=true&session_id=square`,
        ask_for_shipping_address: false,
      },
      payment_note: `Roofer Secretary subscription for ${customer.email} (Customer #${customerId})`,
    })

    if (paymentLink.errors) {
      return c.json({ error: paymentLink.errors[0]?.detail || 'Square payment link failed' }, 400)
    }

    const link = paymentLink.payment_link

    // Record pending subscription
    await c.env.DB.prepare(
      `INSERT INTO secretary_subscriptions (customer_id, status, stripe_subscription_id) VALUES (?, 'pending', ?)`
    ).bind(customerId, link?.order_id || link?.id || '').run()

    return c.json({
      checkout_url: link?.url || link?.long_url,
      session_id: link?.id,
    })
  } catch (err: any) {
    console.error('[Secretary Subscribe]', err)
    return c.json({ error: 'Failed to create subscription', details: err.message }, 500)
  }
})

// ============================================================
// POST /verify-session — Verify Square Checkout completed
// ============================================================
secretaryRoutes.post('/verify-session', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { session_id } = await c.req.json()
  if (!session_id) return c.json({ error: 'Missing data' }, 400)

  try {
    // For Square, we activate the pending subscription on redirect
    // The webhook will confirm the payment separately
    await c.env.DB.prepare(
      `UPDATE secretary_subscriptions SET status = 'active', current_period_start = datetime('now'), current_period_end = datetime('now', '+30 days'), updated_at = datetime('now') WHERE customer_id = ? AND status = 'pending'`
    ).bind(customerId).run()

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

// ============================================================
// TELEPHONY INTEGRATION — Connect existing phone numbers
// ============================================================
// The core flow:
// 1. Customer enters their existing business phone + carrier
// 2. We assign a Twilio inbound number from our pool
// 3. We create a LiveKit inbound trunk + dispatch rule for that number
// 4. Customer sets up call forwarding from their carrier to our Twilio number
// 5. Calls come in → Twilio → SIP → LiveKit → AI Agent answers
// ============================================================

// ── Twilio API helper ──
async function twilioAPI(accountSid: string, authToken: string, method: string, path: string, body?: Record<string, string>) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}.json`
  const headers: Record<string, string> = {
    'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  let formBody = ''
  if (body) {
    formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }
  const resp = await fetch(url, { method, headers, body: formBody || undefined })
  return resp.json() as Promise<any>
}

// ── LiveKit SIP API helper (uses LiveKit server-side REST API) ──
async function livekitSipAPI(apiKey: string, apiSecret: string, livekitUrl: string, method: string, path: string, body?: any) {
  // LiveKit REST API uses JWT auth same as room tokens but with special grants
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    iss: apiKey,
    sub: 'server',
    iat: now,
    exp: now + 300, // 5 min
    nbf: now,
    video: { roomCreate: true, roomList: true, roomAdmin: true },
    sip: { admin: true, call: true }
  }
  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const sigB64 = base64urlEncode(new Uint8Array(signature))
  const jwt = `${headerB64}.${payloadB64}.${sigB64}`

  // LiveKit HTTP API endpoint (convert wss:// to https://)
  const httpUrl = livekitUrl.replace('wss://', 'https://').replace(/\/$/, '')
  const fullUrl = `${httpUrl}${path}`

  const resp = await fetch(fullUrl, {
    method,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json() as Promise<any>
}

// ── Canadian carrier forwarding instructions database ──
function getCarrierForwardingInfo(carrier: string, forwardToNumber: string) {
  const formatted = forwardToNumber.replace(/^\+1/, '').replace(/\D/g, '')
  const e164 = forwardToNumber.startsWith('+') ? forwardToNumber : `+1${formatted}`
  const ten = formatted.length === 10 ? formatted : formatted.slice(-10)

  const carriers: Record<string, {
    name: string
    activate_all: string
    activate_noanswer: string
    activate_busy: string
    deactivate: string
    notes: string
    supports_conditional: boolean
    estimated_setup_time: string
  }> = {
    rogers: {
      name: 'Rogers / Chatr',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `**61*${e164}*11*20#`,
      activate_busy: `**67*${e164}*11#`,
      deactivate: '*73',
      notes: 'After dialing *72, wait for confirmation tone, then dial the forwarding number. You\'ll hear a confirmation beep.',
      supports_conditional: true,
      estimated_setup_time: '30 seconds'
    },
    telus: {
      name: 'Telus / Koodo / Public Mobile',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `**61*${e164}*11*20#`,
      activate_busy: `**67*${e164}*11#`,
      deactivate: '*73',
      notes: 'Dial the code from your phone. Wait for the confirmation tone. Some Koodo plans may require enabling call forwarding in your account settings first.',
      supports_conditional: true,
      estimated_setup_time: '30 seconds'
    },
    bell: {
      name: 'Bell / Virgin Plus / Lucky Mobile',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `*92 ${ten}`,
      activate_busy: `*90 ${ten}`,
      deactivate: '*73',
      notes: 'Bell uses *92 for no-answer forwarding and *90 for busy forwarding. Some plans charge $3-5/mo for call forwarding — check your plan.',
      supports_conditional: true,
      estimated_setup_time: '1 minute'
    },
    shaw: {
      name: 'Shaw / Freedom Mobile',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `**61*${e164}*11*20#`,
      activate_busy: `**67*${e164}*11#`,
      deactivate: '*73',
      notes: 'Freedom Mobile uses standard GSM forwarding codes. Dial from your phone keypad.',
      supports_conditional: true,
      estimated_setup_time: '30 seconds'
    },
    sasktel: {
      name: 'SaskTel',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `*92 ${ten}`,
      activate_busy: `*90 ${ten}`,
      deactivate: '*73',
      notes: 'SaskTel follows Bell-style forwarding codes.',
      supports_conditional: true,
      estimated_setup_time: '30 seconds'
    },
    fido: {
      name: 'Fido',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `**61*${e164}*11*20#`,
      activate_busy: `**67*${e164}*11#`,
      deactivate: '*73',
      notes: 'Fido uses Rogers infrastructure — same forwarding codes apply.',
      supports_conditional: true,
      estimated_setup_time: '30 seconds'
    },
    voip: {
      name: 'VoIP / Business Phone System',
      activate_all: 'Configure in your VoIP admin panel',
      activate_noanswer: 'Set "No Answer" forwarding in admin panel',
      activate_busy: 'Set "Busy" forwarding in admin panel',
      deactivate: 'Remove forwarding rule in admin panel',
      notes: 'For VoIP systems (RingCentral, Vonage, 8x8, Ooma, etc.), log into your admin portal and set up a forwarding rule. Most VoIP systems also support direct SIP trunk connection — choose "SIP Trunk" method for better quality.',
      supports_conditional: true,
      estimated_setup_time: '5 minutes'
    },
    landline: {
      name: 'Business Landline',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `*92 ${ten}`,
      activate_busy: `*90 ${ten}`,
      deactivate: '*73',
      notes: 'Pick up the handset, dial the code, wait for dial tone, then dial the number. You\'ll hear a short confirmation tone. Call forwarding may incur a monthly fee from your provider — typically $5-10/mo.',
      supports_conditional: true,
      estimated_setup_time: '1 minute'
    },
    other: {
      name: 'Other Carrier',
      activate_all: `*72 ${ten}`,
      activate_noanswer: `Contact your carrier to set up conditional forwarding to ${ten}`,
      activate_busy: `Contact your carrier to set up busy forwarding to ${ten}`,
      deactivate: '*73',
      notes: 'Most Canadian carriers support *72 for call forwarding. If this doesn\'t work, contact your carrier directly and ask them to enable "Call Forwarding No Answer" to your AI secretary number.',
      supports_conditional: true,
      estimated_setup_time: '2-5 minutes'
    }
  }

  return carriers[carrier.toLowerCase()] || carriers['other']
}

// ============================================================
// GET /phone-setup — Get full phone connection status & instructions
// ============================================================
secretaryRoutes.get('/phone-setup', async (c) => {
  const customerId = c.get('customerId' as any) as number

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!config) return c.json({ setup: null, message: 'Configure your secretary first' })

  const result: any = {
    business_phone: config.business_phone || '',
    forwarding_method: config.forwarding_method || 'call_forwarding',
    assigned_phone_number: config.assigned_phone_number || '',
    connection_status: config.connection_status || 'not_connected',
    carrier_name: config.carrier_name || '',
    agent_voice: config.agent_voice || 'alloy',
    agent_name: config.agent_name || 'Sarah',
    livekit_inbound_trunk_id: config.livekit_inbound_trunk_id || '',
    livekit_dispatch_rule_id: config.livekit_dispatch_rule_id || '',
    last_test_at: config.last_test_at || null,
    last_test_result: config.last_test_result || '',
    last_test_details: config.last_test_details || '',
  }

  // If they have a carrier selected and an assigned number, include forwarding instructions
  if (config.carrier_name && config.assigned_phone_number) {
    result.forwarding_instructions = getCarrierForwardingInfo(config.carrier_name, config.assigned_phone_number)
  }

  return c.json({ setup: result })
})

// ============================================================
// POST /phone-setup — Save phone connection preferences
// ============================================================
secretaryRoutes.post('/phone-setup', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { forwarding_method, carrier_name, agent_voice, agent_name } = await c.req.json()

  if (!forwarding_method || !['call_forwarding', 'sip_trunk', 'livekit_number'].includes(forwarding_method)) {
    return c.json({ error: 'Invalid forwarding method. Choose: call_forwarding, sip_trunk, or livekit_number' }, 400)
  }

  try {
    await c.env.DB.prepare(
      `UPDATE secretary_config SET forwarding_method = ?, carrier_name = ?, agent_voice = ?, agent_name = ?, updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(
      forwarding_method,
      carrier_name || '',
      agent_voice || 'alloy',
      agent_name || 'Sarah',
      customerId
    ).run()

    return c.json({ success: true, message: 'Phone setup preferences saved' })
  } catch (err: any) {
    return c.json({ error: 'Failed to save phone setup', details: err.message }, 500)
  }
})

// ============================================================
// POST /assign-number — Assign a Twilio inbound number from pool
// ============================================================
secretaryRoutes.post('/assign-number', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const isDev = c.get('isDev' as any) as boolean

  // Check subscription
  if (!isDev) {
    const sub = await c.env.DB.prepare(
      `SELECT status FROM secretary_subscriptions WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`
    ).bind(customerId).first<any>()
    if (!sub) return c.json({ error: 'Active subscription required' }, 403)
  }

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ error: 'Configure your secretary first' }, 400)

  // Already have a number assigned?
  if (config.assigned_phone_number) {
    const info = config.carrier_name
      ? getCarrierForwardingInfo(config.carrier_name, config.assigned_phone_number)
      : null
    return c.json({
      already_assigned: true,
      assigned_phone_number: config.assigned_phone_number,
      forwarding_instructions: info,
      message: 'You already have an AI answering number assigned'
    })
  }

  try {
    // Try to find an available number from the pool
    let number = await c.env.DB.prepare(
      `SELECT * FROM secretary_phone_pool WHERE status = 'available' ORDER BY RANDOM() LIMIT 1`
    ).first<any>()

    // If no number in pool, try to buy one from Twilio
    const twilioSid = (c.env as any).TWILIO_ACCOUNT_SID
    const twilioAuth = (c.env as any).TWILIO_AUTH_TOKEN

    if (!number && twilioSid && twilioAuth) {
      // Search for available Canadian local numbers (Alberta preferred)
      const search = await twilioAPI(twilioSid, twilioAuth, 'GET',
        `/AvailablePhoneNumbers/CA/Local?AreaCode=780&SmsEnabled=false&VoiceEnabled=true&PageSize=1`, undefined)

      let phoneToCreate: any = null
      if (search.available_phone_numbers?.length > 0) {
        phoneToCreate = search.available_phone_numbers[0]
      } else {
        // Fallback: try any Canadian number
        const searchAny = await twilioAPI(twilioSid, twilioAuth, 'GET',
          `/AvailablePhoneNumbers/CA/Local?SmsEnabled=false&VoiceEnabled=true&PageSize=1`, undefined)
        if (searchAny.available_phone_numbers?.length > 0) {
          phoneToCreate = searchAny.available_phone_numbers[0]
        }
      }

      if (phoneToCreate) {
        // Purchase the number
        const purchased = await twilioAPI(twilioSid, twilioAuth, 'POST', '/IncomingPhoneNumbers', {
          PhoneNumber: phoneToCreate.phone_number,
          FriendlyName: `RoofReporterAI Secretary - Customer ${customerId}`,
        })

        if (purchased.sid) {
          // Add to our pool
          await c.env.DB.prepare(
            `INSERT INTO secretary_phone_pool (phone_number, phone_sid, region, status, assigned_to_customer_id, assigned_at) VALUES (?, ?, ?, 'assigned', ?, datetime('now'))`
          ).bind(purchased.phone_number, purchased.sid, 'CA', customerId).run()

          number = {
            id: null, // just purchased
            phone_number: purchased.phone_number,
            phone_sid: purchased.sid,
          }
        }
      }
    }

    // If still no number available (no Twilio configured or no numbers), use a placeholder
    if (!number) {
      // For dev/testing: assign a placeholder number
      if (isDev) {
        const placeholderNumber = '+17800000001'
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO secretary_phone_pool (phone_number, region, status, assigned_to_customer_id, assigned_at) VALUES (?, 'AB', 'assigned', ?, datetime('now'))`
        ).bind(placeholderNumber, customerId).run()
        number = { phone_number: placeholderNumber }
      } else {
        return c.json({
          error: 'No phone numbers available. Please contact support.',
          needs_twilio: !twilioSid,
        }, 503)
      }
    }

    // If from pool (not just purchased), mark as assigned
    if (number.id) {
      await c.env.DB.prepare(
        `UPDATE secretary_phone_pool SET status = 'assigned', assigned_to_customer_id = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).bind(customerId, number.id).run()
    }

    // Save to config
    await c.env.DB.prepare(
      `UPDATE secretary_config SET assigned_phone_number = ?, connection_status = 'pending_forwarding', updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(number.phone_number, customerId).run()

    const info = config.carrier_name
      ? getCarrierForwardingInfo(config.carrier_name, number.phone_number)
      : null

    return c.json({
      success: true,
      assigned_phone_number: number.phone_number,
      forwarding_instructions: info,
      message: 'AI answering number assigned! Follow the forwarding instructions to connect your existing number.'
    })
  } catch (err: any) {
    console.error('[Secretary Assign Number]', err)
    return c.json({ error: 'Failed to assign number', details: err.message }, 500)
  }
})

// ============================================================
// POST /setup-livekit — Create LiveKit inbound trunk + dispatch rule
// This configures LiveKit to accept calls on the assigned number
// ============================================================
secretaryRoutes.post('/setup-livekit', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  const livekitSipUri = (c.env as any).LIVEKIT_SIP_URI

  if (!apiKey || !apiSecret || !livekitUrl) {
    return c.json({ error: 'LiveKit not configured on server' }, 500)
  }

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ error: 'Secretary not configured' }, 400)
  if (!config.assigned_phone_number) return c.json({ error: 'No phone number assigned yet. Assign a number first.' }, 400)

  // Already have LiveKit trunk set up?
  if (config.livekit_inbound_trunk_id && config.livekit_dispatch_rule_id) {
    return c.json({
      already_configured: true,
      trunk_id: config.livekit_inbound_trunk_id,
      dispatch_rule_id: config.livekit_dispatch_rule_id,
      sip_uri: livekitSipUri || '',
      message: 'LiveKit telephony already configured for this customer'
    })
  }

  try {
    // Step 1: Create inbound trunk
    // This tells LiveKit to accept calls to this phone number
    const trunkResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/CreateSIPInboundTrunk', {
      trunk: {
        name: `secretary-${customerId}`,
        numbers: [config.assigned_phone_number],
        krisp_enabled: true,
        metadata: JSON.stringify({
          customer_id: customerId,
          service: 'roofer_secretary',
          business_phone: config.business_phone,
        }),
      }
    })

    const trunkId = trunkResult?.sip_trunk_id || trunkResult?.trunk?.sip_trunk_id || ''

    // Step 2: Create dispatch rule
    // Routes inbound calls to a unique room with agent dispatch
    const dispatchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/CreateSIPDispatchRule', {
      trunk_ids: trunkId ? [trunkId] : [],
      rule: {
        dispatchRuleIndividual: {
          roomPrefix: `secretary-${customerId}-`,
          pin: '',
        }
      },
      name: `secretary-dispatch-${customerId}`,
      metadata: JSON.stringify({ customer_id: customerId }),
    })

    const dispatchId = dispatchResult?.sip_dispatch_rule_id || ''

    // Save to config
    await c.env.DB.prepare(
      `UPDATE secretary_config SET livekit_inbound_trunk_id = ?, livekit_dispatch_rule_id = ?, livekit_sip_uri = ?, updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(trunkId, dispatchId, livekitSipUri || '', customerId).run()

    // Update phone pool with trunk/dispatch IDs
    if (trunkId) {
      await c.env.DB.prepare(
        `UPDATE secretary_phone_pool SET sip_trunk_id = ?, dispatch_rule_id = ?, updated_at = datetime('now') WHERE assigned_to_customer_id = ?`
      ).bind(trunkId, dispatchId, customerId).run()
    }

    return c.json({
      success: true,
      trunk_id: trunkId,
      dispatch_rule_id: dispatchId,
      sip_uri: livekitSipUri || '',
      message: 'LiveKit telephony configured! Inbound calls will now route to your AI secretary.'
    })
  } catch (err: any) {
    console.error('[Secretary LiveKit Setup]', err)
    return c.json({
      error: 'Failed to configure LiveKit telephony',
      details: err.message,
      note: 'This may require manual setup in the LiveKit Cloud dashboard.'
    }, 500)
  }
})

// ============================================================
// POST /configure-twilio-trunk — Configure Twilio SIP trunk to forward to LiveKit
// ============================================================
secretaryRoutes.post('/configure-twilio-trunk', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const twilioSid = (c.env as any).TWILIO_ACCOUNT_SID
  const twilioAuth = (c.env as any).TWILIO_AUTH_TOKEN
  const livekitSipUri = (c.env as any).LIVEKIT_SIP_URI

  if (!twilioSid || !twilioAuth) {
    return c.json({
      error: 'Twilio not configured',
      manual_setup: true,
      instructions: 'Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN as Cloudflare secrets, or set up the SIP trunk manually in the Twilio console.',
      livekit_sip_uri: livekitSipUri || 'Check your LiveKit project settings for SIP URI',
    }, 500)
  }

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config?.assigned_phone_number) return c.json({ error: 'No phone number assigned' }, 400)

  try {
    // Already have a Twilio trunk?
    if (config.twilio_trunk_sid) {
      return c.json({
        already_configured: true,
        trunk_sid: config.twilio_trunk_sid,
        message: 'Twilio SIP trunk already configured'
      })
    }

    // Step 1: Create SIP Trunk on Twilio
    const trunk = await twilioAPI(twilioSid, twilioAuth, 'POST', '/SIPTrunking/Trunks', {
      FriendlyName: `RoofReporterAI Secretary - ${customerId}`,
    })

    if (!trunk.sid) {
      // Twilio Elastic SIP Trunking might use different API path
      return c.json({
        error: 'Failed to create Twilio SIP trunk',
        manual_setup: true,
        instructions: `Go to Twilio Console → Elastic SIP Trunking → Create Trunk. Set origination URI to: ${livekitSipUri || 'your LiveKit SIP URI'}`,
        details: trunk.message || 'API error',
      }, 500)
    }

    // Step 2: Set Origination URI (where Twilio sends calls → LiveKit)
    if (livekitSipUri) {
      const sipEndpoint = livekitSipUri.replace('sip:', '')
      await twilioAPI(twilioSid, twilioAuth, 'POST', `/SIPTrunking/Trunks/${trunk.sid}/OriginationUrls`, {
        FriendlyName: 'LiveKit SIP',
        SipUrl: `sip:${sipEndpoint}`,
        Weight: '1',
        Priority: '1',
        Enabled: 'true',
      })
    }

    // Step 3: Associate phone number with trunk
    const poolEntry = await c.env.DB.prepare(
      `SELECT phone_sid FROM secretary_phone_pool WHERE assigned_to_customer_id = ? AND phone_sid IS NOT NULL LIMIT 1`
    ).bind(customerId).first<any>()

    if (poolEntry?.phone_sid) {
      await twilioAPI(twilioSid, twilioAuth, 'POST', `/SIPTrunking/Trunks/${trunk.sid}/PhoneNumbers`, {
        PhoneNumberSid: poolEntry.phone_sid,
      })
    }

    // Save trunk SID
    await c.env.DB.prepare(
      `UPDATE secretary_config SET twilio_trunk_sid = ?, updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(trunk.sid, customerId).run()

    return c.json({
      success: true,
      trunk_sid: trunk.sid,
      message: 'Twilio SIP trunk created and configured to route calls to LiveKit'
    })
  } catch (err: any) {
    console.error('[Secretary Twilio Trunk]', err)
    return c.json({
      error: 'Failed to configure Twilio trunk',
      details: err.message,
      manual_setup: true,
      instructions: `Set up manually: Twilio Console → Elastic SIP Trunking → Create trunk → Set origination to ${livekitSipUri || 'your LiveKit SIP URI'}`,
    }, 500)
  }
})

// ============================================================
// POST /test-connection — Test if call forwarding is working
// Places a test call via Twilio to verify the connection
// ============================================================
secretaryRoutes.post('/test-connection', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const twilioSid = (c.env as any).TWILIO_ACCOUNT_SID
  const twilioAuth = (c.env as any).TWILIO_AUTH_TOKEN

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()
  if (!config) return c.json({ error: 'Secretary not configured' }, 400)
  if (!config.assigned_phone_number) return c.json({ error: 'No AI answering number assigned' }, 400)

  try {
    let testResult = 'pending'
    let testDetails = ''

    if (twilioSid && twilioAuth) {
      // Make a test call from Twilio to the roofer's business number
      // If forwarding is set up, it should ring through to our LiveKit number
      const call = await twilioAPI(twilioSid, twilioAuth, 'POST', '/Calls', {
        To: config.business_phone,
        From: config.assigned_phone_number,
        Url: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient', // simple test TwiML
        Timeout: '15',
        StatusCallback: `${new URL(c.req.url).origin}/api/secretary/webhook/test-result`,
        StatusCallbackEvent: 'completed',
        StatusCallbackMethod: 'POST',
      })

      if (call.sid) {
        testResult = 'in_progress'
        testDetails = `Test call initiated (SID: ${call.sid}). The AI will attempt to call your business number. If forwarding is configured correctly, the call will route to the AI secretary.`
      } else {
        testResult = 'failed'
        testDetails = call.message || 'Failed to initiate test call'
      }
    } else {
      // No Twilio — provide manual test instructions
      testResult = 'manual'
      testDetails = `Twilio not configured for automated testing. To test manually: 1) Call your business number (${config.business_phone}) from a different phone. 2) If forwarding is set up, you should hear the AI secretary answer. 3) Come back here and mark the test as passed or failed.`
    }

    // Record test result
    await c.env.DB.prepare(
      `UPDATE secretary_config SET last_test_at = datetime('now'), last_test_result = ?, last_test_details = ?, updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(testResult, testDetails, customerId).run()

    return c.json({
      test_result: testResult,
      details: testDetails,
      business_phone: config.business_phone,
      assigned_number: config.assigned_phone_number,
    })
  } catch (err: any) {
    console.error('[Secretary Test]', err)
    return c.json({ error: 'Test failed', details: err.message }, 500)
  }
})

// ============================================================
// POST /confirm-connection — Customer manually confirms forwarding works
// ============================================================
secretaryRoutes.post('/confirm-connection', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { connected } = await c.req.json()

  const newStatus = connected ? 'connected' : 'failed'
  const details = connected
    ? 'Customer confirmed call forwarding is working'
    : 'Customer reported call forwarding is not working'

  await c.env.DB.prepare(
    `UPDATE secretary_config SET connection_status = ?, last_test_at = datetime('now'), last_test_result = ?, last_test_details = ?, updated_at = datetime('now') WHERE customer_id = ?`
  ).bind(newStatus, connected ? 'success' : 'failed', details, customerId).run()

  return c.json({
    success: true,
    connection_status: newStatus,
    message: connected
      ? 'Connection confirmed! Your AI secretary is ready to answer calls.'
      : 'Connection marked as failed. Check your forwarding setup and try again.'
  })
})

// ============================================================
// GET /carriers — List available carriers with forwarding codes
// ============================================================
secretaryRoutes.get('/carriers', async (c) => {
  const carriers = [
    { id: 'rogers', name: 'Rogers', subbrands: 'Chatr' },
    { id: 'telus', name: 'Telus', subbrands: 'Koodo, Public Mobile' },
    { id: 'bell', name: 'Bell', subbrands: 'Virgin Plus, Lucky Mobile' },
    { id: 'shaw', name: 'Freedom Mobile', subbrands: 'Shaw' },
    { id: 'fido', name: 'Fido', subbrands: '' },
    { id: 'sasktel', name: 'SaskTel', subbrands: '' },
    { id: 'voip', name: 'VoIP / Business Phone System', subbrands: 'RingCentral, Vonage, 8x8, Ooma, Grasshopper' },
    { id: 'landline', name: 'Business Landline', subbrands: 'Telus, Bell, Rogers landline service' },
    { id: 'other', name: 'Other Carrier', subbrands: '' },
  ]
  return c.json({ carriers })
})

// ============================================================
// GET /forwarding-instructions/:carrier — Get specific carrier instructions
// ============================================================
secretaryRoutes.get('/forwarding-instructions/:carrier', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const carrier = c.req.param('carrier')

  const config = await c.env.DB.prepare(
    `SELECT assigned_phone_number FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  const forwardTo = config?.assigned_phone_number || '+1XXXXXXXXXX'
  const info = getCarrierForwardingInfo(carrier, forwardTo)

  return c.json({
    carrier: carrier,
    forward_to_number: forwardTo,
    instructions: info,
    has_assigned_number: !!config?.assigned_phone_number,
  })
})

// ============================================================
// POST /webhook/test-result — Twilio callback for test call results
// (No auth required — Twilio posts here)
// ============================================================
secretaryRoutes.post('/webhook/test-result', async (c) => {
  try {
    const body = await c.req.parseBody()
    const callStatus = body.CallStatus as string || ''
    const to = body.To as string || ''

    // Find customer by their business phone
    const config = await c.env.DB.prepare(
      `SELECT customer_id FROM secretary_config WHERE business_phone LIKE ? OR business_phone LIKE ?`
    ).bind(`%${to.replace('+1', '')}%`, `%${to}%`).first<any>()

    if (config) {
      const success = ['completed', 'in-progress'].includes(callStatus)
      await c.env.DB.prepare(
        `UPDATE secretary_config SET last_test_result = ?, last_test_details = ?, connection_status = ?, updated_at = datetime('now') WHERE customer_id = ?`
      ).bind(
        success ? 'success' : 'failed',
        `Twilio test call status: ${callStatus}`,
        success ? 'connected' : 'failed',
        config.customer_id
      ).run()
    }

    return c.text('OK')
  } catch (err: any) {
    console.error('[Secretary Test Webhook]', err)
    return c.text('Error', 500)
  }
})

// ============================================================
// ADMIN: POST /admin/seed-numbers — Bulk add numbers to the pool
// ============================================================
secretaryRoutes.post('/admin/seed-numbers', async (c) => {
  // Verify admin (check for admin session or special header)
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Auth required' }, 401)
  const token = auth.slice(7)
  const admin = await c.env.DB.prepare(
    `SELECT id FROM admin_sessions WHERE session_token = ? AND expires_at > datetime('now')`
  ).bind(token).first<any>()
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const { numbers } = await c.req.json()
  if (!numbers || !Array.isArray(numbers)) return c.json({ error: 'numbers array required' }, 400)

  let added = 0
  for (const num of numbers) {
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO secretary_phone_pool (phone_number, phone_sid, region, status) VALUES (?, ?, ?, 'available')`
      ).bind(num.phone_number, num.phone_sid || '', num.region || 'AB').run()
      added++
    } catch (e) { /* duplicate, skip */ }
  }

  return c.json({ success: true, added, total_submitted: numbers.length })
})

// ============================================================
// GET /admin/phone-pool — View phone pool status
// ============================================================
secretaryRoutes.get('/admin/phone-pool', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Auth required' }, 401)
  const token = auth.slice(7)
  const admin = await c.env.DB.prepare(
    `SELECT id FROM admin_sessions WHERE session_token = ? AND expires_at > datetime('now')`
  ).bind(token).first<any>()
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const pool = await c.env.DB.prepare(
    `SELECT sp.*, c.email as assigned_email, c.name as assigned_name FROM secretary_phone_pool sp LEFT JOIN customers c ON c.id = sp.assigned_to_customer_id ORDER BY sp.status, sp.created_at`
  ).all<any>()

  const stats = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM secretary_phone_pool GROUP BY status`
  ).all<any>()

  return c.json({
    numbers: pool.results || [],
    stats: stats.results || [],
  })
})

// ============================================================
// SIP BRIDGE MANAGEMENT — Admin endpoints for LiveKit SIP trunks
// Simplest path: LiveKit Cloud PSTN gateway (no Twilio/Telus needed)
// ============================================================

// ── Admin auth helper ──
async function requireAdmin(c: any) {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return c.env.DB.prepare(
    `SELECT id FROM admin_sessions WHERE session_token = ? AND expires_at > datetime('now')`
  ).bind(auth.slice(7)).first<any>()
}

// ============================================================
// GET /sip/trunks — List all SIP trunks (inbound + outbound)
// ============================================================
secretaryRoutes.get('/sip/trunks', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  try {
    const [inbound, outbound, rules] = await Promise.all([
      livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/ListSIPInboundTrunk', {}),
      livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/ListSIPOutboundTrunk', {}),
      livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/ListSIPDispatchRule', {}),
    ])

    return c.json({
      success: true,
      inbound_trunks: inbound?.items || [],
      outbound_trunks: outbound?.items || [],
      dispatch_rules: rules?.items || [],
    })
  } catch (err: any) {
    console.error('[SIP] List trunks error:', err.message)
    return c.json({ error: 'Failed to list SIP trunks', details: err.message }, 500)
  }
})

// ============================================================
// POST /sip/outbound-trunk — Create outbound SIP trunk
// For LiveKit Cloud PSTN: address = LiveKit's PSTN gateway
// For Twilio: address = {your-trunk}.pstn.twilio.com
// For Telus: address = proxy1.dynsipt.broadconnect.ca
// ============================================================
secretaryRoutes.post('/sip/outbound-trunk', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const body = await c.req.json()
  const {
    name = 'RoofReporterAI Outbound',
    phone_number,           // e.g. "+17805551234"
    address = '',           // SIP trunk host (empty = LiveKit Cloud PSTN)
    auth_username = '',     // SIP auth user (Telus pilot number, etc.)
    auth_password = '',     // SIP auth password
    transport = 0,          // 0=auto, 1=UDP, 2=TCP, 3=TLS
    country_code = 'CA',    // ISO 3166 two-letter
  } = body

  if (!phone_number) return c.json({ error: 'phone_number required (e.g. +17805551234)' }, 400)

  try {
    const trunkPayload: any = {
      trunk: {
        name,
        numbers: [phone_number],
        destination_country: country_code,
        transport: transport,
        media_encryption: 0, // Disabled (RTP) — safest for Telus/most carriers
      }
    }

    // If address provided (Twilio/Telus/custom SIP), add it
    if (address) {
      trunkPayload.trunk.address = address
    }
    // If auth credentials provided (Telus etc.), add them
    if (auth_username) trunkPayload.trunk.auth_username = auth_username
    if (auth_password) trunkPayload.trunk.auth_password = auth_password

    const result = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPOutboundTrunk', trunkPayload)

    const trunkId = result?.sip_trunk_id || result?.trunk?.sip_trunk_id || ''
    console.log(`[SIP] Created outbound trunk: ${trunkId} for ${phone_number}`)

    // Save to DB for tracking
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO sip_trunks (trunk_id, trunk_type, name, phone_number, address, country_code, status, created_at)
       VALUES (?, 'outbound', ?, ?, ?, ?, 'active', datetime('now'))`
    ).bind(trunkId, name, phone_number, address, country_code).run().catch(() => {})

    return c.json({
      success: true,
      trunk_id: trunkId,
      phone_number,
      address: address || '(LiveKit Cloud PSTN)',
      message: `Outbound SIP trunk created. You can now dial out from ${phone_number}.`
    })
  } catch (err: any) {
    console.error('[SIP] Create outbound trunk error:', err)
    return c.json({ error: 'Failed to create outbound trunk', details: err.message }, 500)
  }
})

// ============================================================
// POST /sip/inbound-trunk — Create inbound SIP trunk
// ============================================================
secretaryRoutes.post('/sip/inbound-trunk', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const body = await c.req.json()
  const {
    name = 'RoofReporterAI Inbound',
    phone_number,
    auth_username = '',
    auth_password = '',
    krisp_enabled = true,
  } = body

  if (!phone_number) return c.json({ error: 'phone_number required' }, 400)

  try {
    const trunkPayload: any = {
      trunk: {
        name,
        numbers: [phone_number],
        krisp_enabled,
        media_encryption: 0,
      }
    }
    if (auth_username) trunkPayload.trunk.auth_username = auth_username
    if (auth_password) trunkPayload.trunk.auth_password = auth_password

    const trunkResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPInboundTrunk', trunkPayload)

    const trunkId = trunkResult?.sip_trunk_id || trunkResult?.trunk?.sip_trunk_id || ''

    // Create dispatch rule to route calls to AI secretary room
    const dispatchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPDispatchRule', {
        trunk_ids: trunkId ? [trunkId] : [],
        rule: {
          dispatchRuleIndividual: {
            roomPrefix: 'secretary-call-',
            pin: '',
          }
        },
        name: `dispatch-${phone_number}`,
        metadata: JSON.stringify({ phone: phone_number, service: 'roofer_secretary' }),
      })

    const dispatchId = dispatchResult?.sip_dispatch_rule_id || ''
    console.log(`[SIP] Created inbound trunk: ${trunkId}, dispatch: ${dispatchId}`)

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO sip_trunks (trunk_id, trunk_type, name, phone_number, address, country_code, dispatch_rule_id, status, created_at)
       VALUES (?, 'inbound', ?, ?, '', 'CA', ?, 'active', datetime('now'))`
    ).bind(trunkId, name, phone_number, dispatchId).run().catch(() => {})

    return c.json({
      success: true,
      trunk_id: trunkId,
      dispatch_rule_id: dispatchId,
      phone_number,
      message: `Inbound trunk created. Calls to ${phone_number} will route to AI secretary.`
    })
  } catch (err: any) {
    console.error('[SIP] Create inbound trunk error:', err)
    return c.json({ error: 'Failed to create inbound trunk', details: err.message }, 500)
  }
})

// ============================================================
// POST /sip/dial — Dial out to a phone number (AI → Phone)
// Creates a SIP participant in a LiveKit room connected to PSTN
// ============================================================
secretaryRoutes.post('/sip/dial', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const body = await c.req.json()
  const {
    trunk_id,               // outbound trunk to use
    phone_number,           // number to dial (e.g. "+17805551234")
    room_name,              // LiveKit room name (auto-generated if blank)
    participant_name = 'Phone Call',
    play_dialtone = true,
    krisp_enabled = true,
  } = body

  if (!phone_number) return c.json({ error: 'phone_number required (e.g. +17805551234)' }, 400)

  // If no trunk_id provided, try to find one from our DB
  let resolvedTrunkId = trunk_id
  if (!resolvedTrunkId) {
    const trunk = await c.env.DB.prepare(
      `SELECT trunk_id FROM sip_trunks WHERE trunk_type = 'outbound' AND status = 'active' ORDER BY created_at DESC LIMIT 1`
    ).first<any>()
    resolvedTrunkId = trunk?.trunk_id
  }
  if (!resolvedTrunkId) {
    return c.json({
      error: 'No outbound SIP trunk configured. Create one first via POST /api/secretary/sip/outbound-trunk',
      hint: 'You need an outbound trunk before you can dial out.'
    }, 400)
  }

  const finalRoom = room_name || `dial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  try {
    const result = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPParticipant', {
        sip_trunk_id: resolvedTrunkId,
        sip_call_to: phone_number,
        room_name: finalRoom,
        participant_identity: `phone-${phone_number.replace(/\D/g, '')}`,
        participant_name,
        participant_metadata: JSON.stringify({
          type: 'outbound_call',
          dialed_at: new Date().toISOString(),
          initiated_by: 'admin',
        }),
        play_dialtone,
        krisp_enabled,
        media_encryption: 0,
      })

    const participantId = result?.participant_id || result?.sip_call_id || ''
    console.log(`[SIP] Dial out: ${phone_number} → room ${finalRoom} (participant: ${participantId})`)

    return c.json({
      success: true,
      participant_id: participantId,
      sip_call_id: result?.sip_call_id || '',
      room_name: finalRoom,
      phone_number,
      trunk_id: resolvedTrunkId,
      message: `Dialing ${phone_number}... Call connected to room ${finalRoom}`
    })
  } catch (err: any) {
    console.error('[SIP] Dial error:', err)
    return c.json({ error: 'Failed to dial', details: err.message }, 500)
  }
})

// ============================================================
// DELETE /sip/trunk/:trunkId — Delete a SIP trunk
// ============================================================
secretaryRoutes.delete('/sip/trunk/:trunkId', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const trunkId = c.req.param('trunkId')

  try {
    await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/DeleteSIPTrunk', { sip_trunk_id: trunkId })

    await c.env.DB.prepare(`DELETE FROM sip_trunks WHERE trunk_id = ?`).bind(trunkId).run().catch(() => {})
    console.log(`[SIP] Deleted trunk: ${trunkId}`)

    return c.json({ success: true, deleted: trunkId })
  } catch (err: any) {
    console.error('[SIP] Delete trunk error:', err)
    return c.json({ error: 'Failed to delete trunk', details: err.message }, 500)
  }
})
