// ============================================================
// RoofReporterAI — Roofer Secretary AI Phone Answering Service
// Powered by LiveKit.io
// ============================================================
// POST /api/secretary/subscribe        — Create $249/mo Square subscription
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
// POST /subscribe — Create Square Checkout for $249/mo subscription
// Square doesn't have native recurring billing via payment links,
// so we create a one-time $249 payment and manage renewal internally
// Currency: CAD for Canadian visitors, USD for American visitors (same $249 amount)
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

    // Detect country from Cloudflare headers for currency selection
    // Same $249 price — CAD for Canadians, USD for Americans
    const cfCountry = (c.req.header('cf-ipcountry') || 'CA').toUpperCase()
    const currency = cfCountry === 'US' ? 'USD' : 'CAD'
    const currencyLabel = currency === 'USD' ? 'USD' : 'CAD'

    // Create Square Payment Link for secretary subscription ($249/mo)
    const idempotencyKey = `secretary-${customerId}-${Date.now()}`
    const paymentLink = await squareAPI(accessToken, 'POST', '/online-checkout/payment-links', {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `Roofer Secretary — AI Phone Answering Service (Monthly, ${currencyLabel})`,
        price_money: {
          amount: 24900, // $249.00
          currency: currency,
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: `${origin}/customer/secretary?setup=true&session_id=square`,
        ask_for_shipping_address: false,
      },
      payment_note: `Roofer Secretary subscription for ${customer.email} (Customer #${customerId}) — $249/${currencyLabel}`,
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
    secretary_mode: config?.secretary_mode || 'directory',
  })
})

// ============================================================
// POST /config — Save/update phone answering configuration
// Supports 3 modes: directory | answering | full
// ============================================================
secretaryRoutes.post('/config', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const body = await c.req.json()
  const {
    business_phone, greeting_script, common_qa, general_notes,
    // Mode
    secretary_mode = 'directory',
    // Answering-mode fields
    answering_fallback_action, answering_forward_number, answering_sms_notify,
    answering_email_notify, answering_notify_email,
    // Full-secretary-mode fields
    full_can_book_appointments, full_can_send_email, full_can_schedule_callback,
    full_can_answer_faq, full_can_take_payment_info, full_business_hours,
    full_booking_link, full_services_offered, full_pricing_info,
    full_service_area, full_email_from_name, full_email_signature,
  } = body

  if (!business_phone) return c.json({ error: 'Business phone number is required' }, 400)
  if (!greeting_script) return c.json({ error: 'Greeting script is required' }, 400)
  if (general_notes && general_notes.length > 3000) return c.json({ error: 'General notes must be 3000 characters or less' }, 400)
  const validModes = ['directory', 'answering', 'full']
  if (!validModes.includes(secretary_mode)) return c.json({ error: 'secretary_mode must be directory, answering, or full' }, 400)

  try {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM secretary_config WHERE customer_id = ?`
    ).bind(customerId).first<any>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE secretary_config SET
          business_phone = ?, greeting_script = ?, common_qa = ?, general_notes = ?,
          secretary_mode = ?,
          answering_fallback_action = ?, answering_forward_number = ?,
          answering_sms_notify = ?, answering_email_notify = ?, answering_notify_email = ?,
          full_can_book_appointments = ?, full_can_send_email = ?, full_can_schedule_callback = ?,
          full_can_answer_faq = ?, full_can_take_payment_info = ?, full_business_hours = ?,
          full_booking_link = ?, full_services_offered = ?, full_pricing_info = ?,
          full_service_area = ?, full_email_from_name = ?, full_email_signature = ?,
          updated_at = datetime('now')
        WHERE customer_id = ?`
      ).bind(
        business_phone, greeting_script, common_qa || '', general_notes || '',
        secretary_mode,
        answering_fallback_action || 'take_message', answering_forward_number || '',
        answering_sms_notify ?? 1, answering_email_notify ?? 1, answering_notify_email || '',
        full_can_book_appointments ?? 1, full_can_send_email ?? 1, full_can_schedule_callback ?? 1,
        full_can_answer_faq ?? 1, full_can_take_payment_info ?? 0,
        typeof full_business_hours === 'string' ? full_business_hours : JSON.stringify(full_business_hours || {}),
        full_booking_link || '', full_services_offered || '', full_pricing_info || '',
        full_service_area || '', full_email_from_name || '', full_email_signature || '',
        customerId
      ).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO secretary_config (
          customer_id, business_phone, greeting_script, common_qa, general_notes,
          secretary_mode,
          answering_fallback_action, answering_forward_number,
          answering_sms_notify, answering_email_notify, answering_notify_email,
          full_can_book_appointments, full_can_send_email, full_can_schedule_callback,
          full_can_answer_faq, full_can_take_payment_info, full_business_hours,
          full_booking_link, full_services_offered, full_pricing_info,
          full_service_area, full_email_from_name, full_email_signature
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        customerId, business_phone, greeting_script, common_qa || '', general_notes || '',
        secretary_mode,
        answering_fallback_action || 'take_message', answering_forward_number || '',
        answering_sms_notify ?? 1, answering_email_notify ?? 1, answering_notify_email || '',
        full_can_book_appointments ?? 1, full_can_send_email ?? 1, full_can_schedule_callback ?? 1,
        full_can_answer_faq ?? 1, full_can_take_payment_info ?? 0,
        typeof full_business_hours === 'string' ? full_business_hours : JSON.stringify(full_business_hours || {}),
        full_booking_link || '', full_services_offered || '', full_pricing_info || '',
        full_service_area || '', full_email_from_name || '', full_email_signature || ''
      ).run()
    }

    return c.json({ success: true, message: `Configuration saved (mode: ${secretary_mode})` })
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

  // Build agent metadata with all config — mode-aware
  const mode = config.secretary_mode || 'directory'
  const baseMetadata: any = {
    customer_id: customerId,
    business_phone: config.business_phone,
    greeting_script: config.greeting_script,
    common_qa: config.common_qa,
    general_notes: config.general_notes,
    directories: dirs.results || [],
    secretary_mode: mode,
    agent_name: config.agent_name || 'Sarah',
    agent_voice: config.agent_voice || 'alloy',
  }

  // Add mode-specific data
  if (mode === 'answering') {
    baseMetadata.answering = {
      fallback_action: config.answering_fallback_action || 'take_message',
      forward_number: config.answering_forward_number || '',
      sms_notify: config.answering_sms_notify,
      email_notify: config.answering_email_notify,
      notify_email: config.answering_notify_email || '',
    }
    baseMetadata.system_prompt = buildAnsweringPrompt(config, dirs.results || [])
  } else if (mode === 'full') {
    let businessHours = {}
    try { businessHours = JSON.parse(config.full_business_hours || '{}') } catch {}
    baseMetadata.full = {
      can_book_appointments: config.full_can_book_appointments,
      can_send_email: config.full_can_send_email,
      can_schedule_callback: config.full_can_schedule_callback,
      can_answer_faq: config.full_can_answer_faq,
      can_take_payment_info: config.full_can_take_payment_info,
      business_hours: businessHours,
      booking_link: config.full_booking_link || '',
      services_offered: config.full_services_offered || '',
      pricing_info: config.full_pricing_info || '',
      service_area: config.full_service_area || '',
      email_from_name: config.full_email_from_name || '',
    }
    baseMetadata.system_prompt = buildFullSecretaryPrompt(config, dirs.results || [])
  } else {
    // directory mode
    baseMetadata.system_prompt = buildDirectoryPrompt(config, dirs.results || [])
  }

  const metadata = JSON.stringify(baseMetadata)

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
// SYSTEM PROMPT BUILDERS — Per-mode AI agent instructions
// ============================================================

function buildDirectoryPrompt(config: any, dirs: any[]): string {
  const dirList = dirs.map((d: any, i: number) => `${i + 1}. ${d.name}${d.phone_or_action ? ` → transfer to ${d.phone_or_action}` : ''}${d.special_notes ? ` (Notes: ${d.special_notes})` : ''}`).join('\n')
  return `You are an AI phone directory service for a roofing company. Your name is ${config.agent_name || 'Sarah'}.

GREETING: "${config.greeting_script}"

YOUR ROLE: You are a professional phone directory assistant. Your ONLY job is to greet callers, determine which department they need, and route them accordingly.

AVAILABLE DEPARTMENTS:
${dirList}

INSTRUCTIONS:
- Answer with the greeting script above
- Ask the caller which department they need
- If they're unsure, briefly describe each department
- Once they choose, transfer them to the correct number
- Be polite, professional, and brief
- Do NOT take messages, book appointments, or answer detailed questions
- If someone asks a question, direct them to the appropriate department

${config.common_qa ? `COMMON Q&A:\n${config.common_qa}` : ''}
${config.general_notes ? `BUSINESS NOTES:\n${config.general_notes}` : ''}`
}

function buildAnsweringPrompt(config: any, dirs: any[]): string {
  const fallback = config.answering_fallback_action || 'take_message'
  const forwardNum = config.answering_forward_number || ''
  return `You are an AI answering service for a roofing company. Your name is ${config.agent_name || 'Sarah'}. You NEVER let a call go to voicemail — every caller gets a live response.

GREETING: "${config.greeting_script}"

YOUR ROLE: Professional answering service. You answer every single call with warmth and professionalism. No caller should ever hear a voicemail tone or feel like they reached a machine.

CORE BEHAVIOR:
- ALWAYS answer calls — this is a "never go to voicemail" service
- Be warm, friendly, and reassuring
- Collect the caller's name, phone number, and reason for calling
- Take a detailed message including any urgency level
- Let the caller know their message will be passed along promptly
${fallback === 'forward_urgent' ? `- If the caller says it's URGENT or an EMERGENCY, transfer them immediately to ${forwardNum}` : ''}
${fallback === 'always_forward' ? `- After taking the message, offer to transfer the caller to ${forwardNum}` : ''}

MESSAGE TAKING:
- Always get: caller name, phone number, brief description of why they're calling
- Ask if it's urgent or can wait for a callback
- Reassure them that the business owner will get back to them promptly
- For emergencies (active roof leak, storm damage), flag as URGENT

${config.common_qa ? `COMMON Q&A (you can answer these):\n${config.common_qa}` : ''}
${config.general_notes ? `BUSINESS NOTES:\n${config.general_notes}` : ''}`
}

function buildFullSecretaryPrompt(config: any, dirs: any[]): string {
  let businessHours = ''
  try {
    const hrs = JSON.parse(config.full_business_hours || '{}')
    const dayNames: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
    businessHours = Object.entries(hrs).map(([k, v]) => `${dayNames[k] || k}: ${v}`).join('\n')
  } catch { businessHours = 'Monday-Friday 9am-5pm' }

  const capabilities = []
  if (config.full_can_book_appointments) capabilities.push('Book appointments and estimates')
  if (config.full_can_answer_faq) capabilities.push('Answer frequently asked questions')
  if (config.full_can_schedule_callback) capabilities.push('Schedule callback requests')
  if (config.full_can_send_email) capabilities.push('Send follow-up emails to callers')
  if (config.full_can_take_payment_info) capabilities.push('Collect payment information for deposits')

  const dirList = dirs.map((d: any, i: number) => `${i + 1}. ${d.name}${d.phone_or_action ? ` → ${d.phone_or_action}` : ''}${d.special_notes ? ` (${d.special_notes})` : ''}`).join('\n')

  return `You are a full AI secretary for a roofing company. Your name is ${config.agent_name || 'Sarah'}. You are the main answering line — professional, knowledgeable, and capable of handling almost anything a caller needs.

GREETING: "${config.greeting_script}"

YOUR ROLE: You are the primary secretary for this roofing business. You handle all incoming calls with the authority and capability of a real office secretary.

YOUR CAPABILITIES:
${capabilities.map(c => `• ${c}`).join('\n')}

${dirList ? `DEPARTMENTS (for transfers):\n${dirList}` : ''}

BUSINESS HOURS:
${businessHours}

${config.full_services_offered ? `SERVICES OFFERED:\n${config.full_services_offered}` : ''}
${config.full_pricing_info ? `PRICING INFO:\n${config.full_pricing_info}` : ''}
${config.full_service_area ? `SERVICE AREA:\n${config.full_service_area}` : ''}
${config.full_booking_link ? `ONLINE BOOKING: ${config.full_booking_link}` : ''}

APPOINTMENT BOOKING:
${config.full_can_book_appointments ? `- You CAN book appointments. Collect: caller name, phone, email (optional), property address, preferred date/time, type of service needed (estimate, repair, inspection, etc.)
- Confirm the appointment details before finalizing
- Let them know someone will confirm within 24 hours` : '- Appointment booking is not enabled. Take their info and schedule a callback instead.'}

CALLBACK SCHEDULING:
${config.full_can_schedule_callback ? `- You CAN schedule callbacks. Ask for: name, phone, preferred callback time, and reason for call
- Assure them someone will call back at their preferred time` : ''}

EMAIL FOLLOW-UP:
${config.full_can_send_email ? `- After calls, you can send a follow-up email summarizing the conversation
- Use "${config.full_email_from_name || 'the business'}" as the sender name` : ''}

FAQ & QUESTIONS:
${config.full_can_answer_faq ? `- Answer questions about services, pricing, business hours, service area confidently
- If you don't know something specific, offer to have someone call them back with details` : '- Direct detailed questions to the appropriate department or schedule a callback'}

${config.common_qa ? `COMMON Q&A:\n${config.common_qa}` : ''}
${config.general_notes ? `BUSINESS NOTES:\n${config.general_notes}` : ''}`
}

// ============================================================
// MODE-SPECIFIC ENDPOINTS: Messages, Appointments, Callbacks
// ============================================================

// ── GET /messages — List messages (answering mode) ──
secretaryRoutes.get('/messages', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const status = c.req.query('status') || ''
  const limit = parseInt(c.req.query('limit') || '50')
  let sql = 'SELECT * FROM secretary_messages WHERE customer_id = ?'
  const params: any[] = [customerId]
  if (status === 'unread') { sql += ' AND is_read = 0' }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)
  const msgs = await c.env.DB.prepare(sql).bind(...params).all()
  const unread = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM secretary_messages WHERE customer_id = ? AND is_read = 0').bind(customerId).first<any>()
  return c.json({ messages: msgs?.results || [], unread_count: unread?.cnt || 0 })
})

// ── POST /messages/:id/read — Mark message as read ──
secretaryRoutes.post('/messages/:id/read', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE secretary_messages SET is_read = 1 WHERE id = ? AND customer_id = ?').bind(id, customerId).run()
  return c.json({ success: true })
})

// ── POST /messages/read-all — Mark all messages as read ──
secretaryRoutes.post('/messages/read-all', async (c) => {
  const customerId = c.get('customerId' as any) as number
  await c.env.DB.prepare('UPDATE secretary_messages SET is_read = 1 WHERE customer_id = ? AND is_read = 0').bind(customerId).run()
  return c.json({ success: true })
})

// ── GET /appointments — List appointments (full mode) ──
secretaryRoutes.get('/appointments', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const status = c.req.query('status') || ''
  const limit = parseInt(c.req.query('limit') || '50')
  let sql = 'SELECT * FROM secretary_appointments WHERE customer_id = ?'
  const params: any[] = [customerId]
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY appointment_date DESC, appointment_time DESC LIMIT ?'
  params.push(limit)
  const appts = await c.env.DB.prepare(sql).bind(...params).all()
  const pending = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM secretary_appointments WHERE customer_id = ? AND status = 'pending'").bind(customerId).first<any>()
  return c.json({ appointments: appts?.results || [], pending_count: pending?.cnt || 0 })
})

// ── PATCH /appointments/:id — Update appointment status ──
secretaryRoutes.patch('/appointments/:id', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const id = c.req.param('id')
  const { status, notes } = await c.req.json()
  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed']
  if (status && !validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
  let sql = 'UPDATE secretary_appointments SET updated_at = datetime(\'now\')'
  const params: any[] = []
  if (status) { sql += ', status = ?'; params.push(status) }
  if (notes !== undefined) { sql += ', notes = ?'; params.push(notes) }
  sql += ' WHERE id = ? AND customer_id = ?'
  params.push(id, customerId)
  await c.env.DB.prepare(sql).bind(...params).run()
  return c.json({ success: true })
})

// ── GET /callbacks — List scheduled callbacks (full mode) ──
secretaryRoutes.get('/callbacks', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const status = c.req.query('status') || ''
  const limit = parseInt(c.req.query('limit') || '50')
  let sql = 'SELECT * FROM secretary_callbacks WHERE customer_id = ?'
  const params: any[] = [customerId]
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)
  const cbs = await c.env.DB.prepare(sql).bind(...params).all()
  const pending = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM secretary_callbacks WHERE customer_id = ? AND status = 'pending'").bind(customerId).first<any>()
  return c.json({ callbacks: cbs?.results || [], pending_count: pending?.cnt || 0 })
})

// ── PATCH /callbacks/:id — Update callback status ──
secretaryRoutes.patch('/callbacks/:id', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const id = c.req.param('id')
  const { status } = await c.req.json()
  if (status) {
    await c.env.DB.prepare('UPDATE secretary_callbacks SET status = ? WHERE id = ? AND customer_id = ?').bind(status, id, customerId).run()
  }
  return c.json({ success: true })
})

// ── POST /webhook/message — LiveKit agent posts a new message (answering mode) ──
secretaryRoutes.post('/webhook/message', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, caller_phone, caller_name, message_text, urgency, call_log_id } = body
    if (!customer_id || !message_text) return c.json({ error: 'customer_id and message_text required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_messages (customer_id, caller_phone, caller_name, message_text, urgency, call_log_id) VALUES (?,?,?,?,?,?)`
    ).bind(customer_id, caller_phone || '', caller_name || '', message_text, urgency || 'normal', call_log_id || null).run()
    return c.json({ success: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── POST /webhook/appointment — LiveKit agent creates an appointment (full mode) ──
secretaryRoutes.post('/webhook/appointment', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, caller_phone, caller_name, caller_email, appointment_date, appointment_time, appointment_type, property_address, notes, call_log_id } = body
    if (!customer_id) return c.json({ error: 'customer_id required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_appointments (customer_id, caller_phone, caller_name, caller_email, appointment_date, appointment_time, appointment_type, property_address, notes, call_log_id) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(customer_id, caller_phone || '', caller_name || '', caller_email || '', appointment_date || '', appointment_time || '', appointment_type || 'estimate', property_address || '', notes || '', call_log_id || null).run()
    return c.json({ success: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ── POST /webhook/callback — LiveKit agent schedules a callback (full mode) ──
secretaryRoutes.post('/webhook/callback', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, caller_phone, caller_name, preferred_time, reason, call_log_id } = body
    if (!customer_id || !caller_phone) return c.json({ error: 'customer_id and caller_phone required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_callbacks (customer_id, caller_phone, caller_name, preferred_time, reason, call_log_id) VALUES (?,?,?,?,?,?)`
    ).bind(customer_id, caller_phone, caller_name || '', preferred_time || '', reason || '', call_log_id || null).run()
    return c.json({ success: true })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ============================================================
// POST /webhook/call-complete — LiveKit calls this after each call
// Records call log entry + sends SMS transcript summary to owner
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

    // ── Send SMS transcript summary to the business owner (non-blocking) ──
    const twilioSid = (c.env as any).TWILIO_ACCOUNT_SID
    const twilioAuth = (c.env as any).TWILIO_AUTH_TOKEN
    if (twilioSid && twilioAuth) {
      sendCallSummaryViaSMS(
        c.env.DB, twilioSid, twilioAuth,
        customer_id, caller_phone || 'Unknown', caller_name || 'Unknown',
        duration_seconds || 0, directory_routed || '',
        summary || '', transcript || '', outcome || 'answered'
      ).catch(e => console.warn(`[Secretary SMS] Non-critical SMS error for customer ${customer_id}:`, e.message))
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error('[Secretary Webhook]', err)
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// SMS TRANSCRIPT SUMMARY — Sends post-call summary via Twilio
// Texts the business owner after every AI-handled call
// ============================================================
async function sendCallSummaryViaSMS(
  db: D1Database,
  twilioSid: string, twilioAuth: string,
  customerId: number, callerPhone: string, callerName: string,
  durationSec: number, directoryRouted: string,
  summary: string, transcript: string, outcome: string
) {
  // Get the owner's business phone from their secretary config
  const config = await db.prepare(
    `SELECT business_phone, assigned_phone_number, agent_name FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!config?.business_phone) {
    console.log(`[Secretary SMS] No business phone for customer ${customerId} — skipping SMS`)
    return
  }

  // Format the phone number for SMS delivery
  let ownerPhone = config.business_phone.replace(/[^\d+]/g, '')
  if (!ownerPhone.startsWith('+')) {
    ownerPhone = ownerPhone.length === 10 ? `+1${ownerPhone}` : `+${ownerPhone}`
  }

  // Use the assigned AI number as the "from" number
  let fromNumber = config.assigned_phone_number || ''
  if (!fromNumber) {
    const pool = await db.prepare(
      `SELECT phone_number FROM secretary_phone_pool WHERE status = 'assigned' AND assigned_to_customer_id = ? LIMIT 1`
    ).bind(customerId).first<any>()
    fromNumber = pool?.phone_number || ''
  }
  if (!fromNumber) {
    console.log(`[Secretary SMS] No "from" number available for customer ${customerId} — skipping SMS`)
    return
  }

  // Build the SMS message (keep under 1600 chars for multi-part SMS)
  const agentName = config.agent_name || 'AI Secretary'
  const mins = Math.floor(durationSec / 60)
  const secs = durationSec % 60
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  let smsBody = `\n` +
    `--- ${agentName} Call Summary ---\n` +
    `Caller: ${callerName}${callerPhone !== 'Unknown' ? ' (' + callerPhone + ')' : ''}\n` +
    `Duration: ${durationStr} | Outcome: ${outcome}\n`

  if (directoryRouted) {
    smsBody += `Routed to: ${directoryRouted}\n`
  }

  if (summary) {
    smsBody += `\nSummary: ${summary.substring(0, 400)}\n`
  }

  if (transcript) {
    const shortTranscript = transcript.length > 600
      ? transcript.substring(0, 600) + '...'
      : transcript
    smsBody += `\nTranscript:\n${shortTranscript}\n`
  }

  smsBody += `\n--- End of ${agentName} Report ---`

  // Send via Twilio SMS API
  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
  const formBody = [
    `To=${encodeURIComponent(ownerPhone)}`,
    `From=${encodeURIComponent(fromNumber)}`,
    `Body=${encodeURIComponent(smsBody.trim())}`,
  ].join('&')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  })

  const result: any = await resp.json()
  if (result.sid) {
    console.log(`[Secretary SMS] Transcript summary sent to ${ownerPhone} (SID: ${result.sid})`)
  } else {
    console.warn(`[Secretary SMS] Failed to send to ${ownerPhone}:`, result.message || result.code || 'unknown error')
  }
}

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

// ── Twilio API helper (supports both Basic auth and OAuth Bearer token) ──
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

// ── Twilio OAuth helper — get access token then call API with Bearer auth ──
let _twilioOAuthToken: { token: string; expires: number } | null = null

async function getTwilioOAuthToken(clientId: string, clientSecret: string): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (_twilioOAuthToken && Date.now() < _twilioOAuthToken.expires - 60000) {
    return _twilioOAuthToken.token
  }
  try {
    const resp = await fetch('https://oauth.twilio.com/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    })
    const data = await resp.json() as any
    if (data.access_token) {
      _twilioOAuthToken = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 }
      return data.access_token
    }
    console.error('[TwilioOAuth] Token request failed:', JSON.stringify(data))
    return null
  } catch (err: any) {
    console.error('[TwilioOAuth] Token request error:', err.message)
    return null
  }
}

async function twilioOAuthAPI(accountSid: string, clientId: string, clientSecret: string, method: string, path: string, body?: Record<string, string>) {
  const token = await getTwilioOAuthToken(clientId, clientSecret)
  if (!token) throw new Error('Failed to obtain Twilio OAuth token')
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}.json`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  let formBody = ''
  if (body) {
    formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }
  const resp = await fetch(url, { method, headers, body: formBody || undefined })
  return resp.json() as Promise<any>
}

// ── Unified Twilio helper — tries OAuth first, falls back to Basic auth ──
async function twilioSend(env: any, method: string, path: string, body?: Record<string, string>) {
  const sid = env.TWILIO_ACCOUNT_SID
  const auth = env.TWILIO_AUTH_TOKEN
  const oauthClientId = env.TWILIO_OAUTH_CLIENT_ID
  const oauthClientSecret = env.TWILIO_OAUTH_CLIENT_SECRET
  
  // Try OAuth first (if configured)
  if (sid && oauthClientId && oauthClientSecret) {
    try {
      return await twilioOAuthAPI(sid, oauthClientId, oauthClientSecret, method, path, body)
    } catch (err: any) {
      console.error('[TwilioSend] OAuth failed, trying Basic auth:', err.message)
    }
  }
  // Fall back to Basic auth
  if (sid && auth) {
    return await twilioAPI(sid, auth, method, path, body)
  }
  throw new Error('No Twilio credentials configured (need TWILIO_ACCOUNT_SID + either AUTH_TOKEN or OAUTH_CLIENT_ID/SECRET)')
}

// Helper to check if ANY Twilio sending is possible
function hasTwilioCredentials(env: any): boolean {
  const sid = env.TWILIO_ACCOUNT_SID
  return !!(sid && (env.TWILIO_AUTH_TOKEN || (env.TWILIO_OAUTH_CLIENT_ID && env.TWILIO_OAUTH_CLIENT_SECRET)))
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

    // If still no number available (no Twilio configured or no numbers)
    if (!number) {
      return c.json({
        error: 'No phone numbers available. Please purchase a number from Twilio, Vonage, or Telnyx and enter it manually in the Connect Phone tab.',
        needs_manual: true,
      }, 503)
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

// ============================================================
// DISPATCH RULE MANAGEMENT — Full CRUD for LiveKit SIP Dispatch Rules
// Deploy LiveKit agents directly from code with all configuration fields:
// dispatch_rule_id, name, inbound routing (trunk_ids), destination room,
// agents, rule_type, created_at
// ============================================================

// ── GET /sip/dispatch-rules — List all dispatch rules with full details ──
secretaryRoutes.get('/sip/dispatch-rules', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  try {
    // Fetch dispatch rules AND inbound trunks for cross-referencing
    const [rulesResponse, trunksResponse] = await Promise.all([
      livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/ListSIPDispatchRule', {}),
      livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST', '/twirp/livekit.SIP/ListSIPInboundTrunk', {}),
    ])

    const rules = rulesResponse?.items || []
    const trunks = trunksResponse?.items || []

    // Build trunk lookup by ID for enrichment
    const trunkMap: Record<string, any> = {}
    for (const t of trunks) {
      const id = t.sip_trunk_id || t.trunk?.sip_trunk_id || ''
      if (id) trunkMap[id] = t
    }

    // Enrich each dispatch rule with full details
    const enriched = rules.map((rule: any) => {
      const ruleId = rule.sip_dispatch_rule_id || ''
      const name = rule.name || ''
      const trunkIds = rule.trunk_ids || []
      const metadata = rule.metadata || ''
      const createdAt = rule.created_at || ''

      // Determine rule type and destination room
      let ruleType = 'unknown'
      let destinationRoom = ''
      let roomPrefix = ''
      let pin = ''

      if (rule.rule?.dispatchRuleIndividual) {
        ruleType = 'individual'
        roomPrefix = rule.rule.dispatchRuleIndividual.roomPrefix || ''
        pin = rule.rule.dispatchRuleIndividual.pin || ''
        destinationRoom = roomPrefix ? `${roomPrefix}{unique-id}` : '(auto-generated)'
      } else if (rule.rule?.dispatchRuleDirect) {
        ruleType = 'direct'
        destinationRoom = rule.rule.dispatchRuleDirect.roomName || ''
        pin = rule.rule.dispatchRuleDirect.pin || ''
      } else if (rule.rule?.dispatchRuleCallee) {
        ruleType = 'callee'
        roomPrefix = rule.rule.dispatchRuleCallee.roomPrefix || ''
        destinationRoom = roomPrefix ? `${roomPrefix}{callee-number}` : '(callee-based)'
        pin = rule.rule.dispatchRuleCallee.pin || ''
      }

      // Map trunk IDs to their names/numbers for inbound routing display
      const inboundRouting = trunkIds.map((tid: string) => {
        const trunk = trunkMap[tid]
        if (!trunk) return { trunk_id: tid, name: tid, numbers: [] }
        return {
          trunk_id: tid,
          name: trunk.name || trunk.trunk?.name || tid,
          numbers: trunk.numbers || trunk.trunk?.numbers || [],
          krisp_enabled: trunk.krisp_enabled ?? trunk.trunk?.krisp_enabled ?? false,
        }
      })

      // Parse metadata for agent info
      let agents: any = {}
      try { agents = metadata ? JSON.parse(metadata) : {} } catch (e) { agents = { raw: metadata } }

      return {
        dispatch_rule_id: ruleId,
        name,
        rule_type: ruleType,
        inbound_routing: inboundRouting,
        trunk_ids: trunkIds,
        destination_room: destinationRoom,
        room_prefix: roomPrefix,
        pin,
        agents,
        metadata,
        created_at: createdAt,
      }
    })

    return c.json({
      success: true,
      dispatch_rules: enriched,
      total: enriched.length,
    })
  } catch (err: any) {
    console.error('[SIP] List dispatch rules error:', err.message)
    return c.json({ error: 'Failed to list dispatch rules', details: err.message }, 500)
  }
})

// ── POST /sip/dispatch-rule — Create a new dispatch rule ──
// Supports individual (unique room per call), direct (fixed room), and callee (room by callee number)
secretaryRoutes.post('/sip/dispatch-rule', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const body = await c.req.json()
  const {
    name = 'roofreporterai-dispatch',
    trunk_ids = [],                   // Array of SIP trunk IDs for inbound routing
    rule_type = 'individual',         // 'individual' | 'direct' | 'callee'
    room_prefix = 'secretary-',       // For individual/callee types
    room_name = '',                   // For direct type (fixed room name)
    pin = '',                         // Optional PIN for access control
    metadata = '',                    // JSON string — agent config, customer_id, etc.
    agents = {},                      // Agent configuration (stored in metadata)
    hide_phone_number = false,        // Hide caller phone number from room
    krisp_enabled = true,             // Noise cancellation
    attributes = {},                  // Additional key-value attributes
  } = body

  // Validate rule type
  const validTypes = ['individual', 'direct', 'callee']
  if (!validTypes.includes(rule_type)) {
    return c.json({ error: `Invalid rule_type. Must be one of: ${validTypes.join(', ')}` }, 400)
  }
  if (rule_type === 'direct' && !room_name) {
    return c.json({ error: 'room_name is required for "direct" rule type' }, 400)
  }

  // Build the rule object based on type
  let ruleObj: any = {}
  if (rule_type === 'individual') {
    ruleObj = { dispatchRuleIndividual: { roomPrefix: room_prefix, pin } }
  } else if (rule_type === 'direct') {
    ruleObj = { dispatchRuleDirect: { roomName: room_name, pin } }
  } else if (rule_type === 'callee') {
    ruleObj = { dispatchRuleCallee: { roomPrefix: room_prefix, pin } }
  }

  // Build metadata — merge agents config into metadata JSON
  let finalMetadata = metadata
  if (!finalMetadata && Object.keys(agents).length > 0) {
    finalMetadata = JSON.stringify(agents)
  }

  try {
    const payload: any = {
      rule: ruleObj,
      name,
      metadata: finalMetadata,
    }
    if (trunk_ids.length > 0) payload.trunk_ids = trunk_ids
    if (hide_phone_number) payload.hide_phone_number = hide_phone_number
    if (krisp_enabled) payload.krisp_enabled = krisp_enabled
    if (Object.keys(attributes).length > 0) payload.attributes = attributes

    const result = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPDispatchRule', payload)

    const dispatchId = result?.sip_dispatch_rule_id || ''
    console.log(`[SIP] Created dispatch rule: ${dispatchId} (${name}, type=${rule_type})`)

    // Save to local DB for tracking
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO sip_dispatch_rules (dispatch_rule_id, name, rule_type, trunk_ids, room_prefix, room_name, pin, metadata, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).bind(dispatchId, name, rule_type, JSON.stringify(trunk_ids), room_prefix, room_name, pin, finalMetadata).run().catch(() => {})

    return c.json({
      success: true,
      dispatch_rule_id: dispatchId,
      name,
      rule_type,
      trunk_ids,
      destination_room: rule_type === 'direct' ? room_name : `${room_prefix}{id}`,
      metadata: finalMetadata,
      message: `Dispatch rule "${name}" created. Inbound calls will route to ${rule_type === 'direct' ? `room "${room_name}"` : `rooms prefixed "${room_prefix}"`}.`
    })
  } catch (err: any) {
    console.error('[SIP] Create dispatch rule error:', err)
    return c.json({ error: 'Failed to create dispatch rule', details: err.message }, 500)
  }
})

// ── DELETE /sip/dispatch-rule/:ruleId — Delete a dispatch rule ──
secretaryRoutes.delete('/sip/dispatch-rule/:ruleId', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const ruleId = c.req.param('ruleId')

  try {
    await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/DeleteSIPDispatchRule', { sip_dispatch_rule_id: ruleId })

    await c.env.DB.prepare(`DELETE FROM sip_dispatch_rules WHERE dispatch_rule_id = ?`).bind(ruleId).run().catch(() => {})
    console.log(`[SIP] Deleted dispatch rule: ${ruleId}`)

    return c.json({ success: true, deleted: ruleId })
  } catch (err: any) {
    console.error('[SIP] Delete dispatch rule error:', err)
    return c.json({ error: 'Failed to delete dispatch rule', details: err.message }, 500)
  }
})

// ── POST /sip/deploy-agent — One-click deploy: Create trunk + dispatch rule + agent config ──
// This is the all-in-one endpoint to deploy a LiveKit agent directly from code
secretaryRoutes.post('/sip/deploy-agent', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret || !livekitUrl) return c.json({ error: 'LiveKit not configured' }, 500)

  const body = await c.req.json()
  const {
    name = 'RoofReporterAI Agent',
    phone_number,                      // e.g. "+17809833335"
    room_prefix = 'secretary-',
    rule_type = 'individual',
    krisp_enabled = true,
    agent_config = {},                 // Agent metadata (voice, persona, directories, etc.)
    allowed_addresses = ['0.0.0.0/0'], // IP allowlist
  } = body

  if (!phone_number) return c.json({ error: 'phone_number required (e.g. +17809833335)' }, 400)

  try {
    // Step 1: Create inbound SIP trunk
    const trunkResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPInboundTrunk', {
        trunk: {
          name: `${name} - Trunk`,
          numbers: [phone_number],
          krisp_enabled,
          allowed_addresses,
          metadata: JSON.stringify({
            service: 'roofer_secretary',
            deployed_via: 'api',
            deployed_at: new Date().toISOString(),
            ...agent_config,
          }),
        }
      })

    const trunkId = trunkResult?.sip_trunk_id || trunkResult?.trunk?.sip_trunk_id || ''
    if (!trunkId) {
      return c.json({ error: 'Failed to create inbound trunk', details: trunkResult }, 500)
    }

    // Step 2: Create dispatch rule linked to the trunk
    let ruleObj: any = {}
    let destinationRoom = ''
    if (rule_type === 'individual') {
      ruleObj = { dispatchRuleIndividual: { roomPrefix: room_prefix, pin: '' } }
      destinationRoom = `${room_prefix}{unique-id}`
    } else if (rule_type === 'direct') {
      const roomName = body.room_name || `secretary-${phone_number.replace(/\D/g, '')}`
      ruleObj = { dispatchRuleDirect: { roomName, pin: '' } }
      destinationRoom = roomName
    } else {
      ruleObj = { dispatchRuleCallee: { roomPrefix: room_prefix, pin: '' } }
      destinationRoom = `${room_prefix}{callee}`
    }

    const agentMetadata = JSON.stringify({
      phone_number,
      service: 'roofer_secretary',
      agent_name: agent_config.agent_name || 'Secretary',
      agent_voice: agent_config.agent_voice || 'alloy',
      deployed_via: 'api',
      deployed_at: new Date().toISOString(),
      ...agent_config,
    })

    const dispatchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
      '/twirp/livekit.SIP/CreateSIPDispatchRule', {
        trunk_ids: [trunkId],
        rule: ruleObj,
        name: `${name} - Dispatch`,
        metadata: agentMetadata,
        krisp_enabled,
      })

    const dispatchId = dispatchResult?.sip_dispatch_rule_id || ''

    // Step 3: Save to local DB
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO sip_trunks (trunk_id, trunk_type, name, phone_number, address, country_code, dispatch_rule_id, status, created_at)
       VALUES (?, 'inbound', ?, ?, '', 'CA', ?, 'active', datetime('now'))`
    ).bind(trunkId, `${name} - Trunk`, phone_number, dispatchId).run().catch(() => {})

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO sip_dispatch_rules (dispatch_rule_id, name, rule_type, trunk_ids, room_prefix, room_name, pin, metadata, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, 'active', datetime('now'))`
    ).bind(dispatchId, `${name} - Dispatch`, rule_type, JSON.stringify([trunkId]), room_prefix, destinationRoom, agentMetadata).run().catch(() => {})

    console.log(`[SIP] Agent deployed: trunk=${trunkId}, dispatch=${dispatchId}, phone=${phone_number}`)

    return c.json({
      success: true,
      deployment: {
        sip_trunk_id: trunkId,
        dispatch_rule_id: dispatchId,
        name,
        phone_number,
        rule_type,
        destination_room: destinationRoom,
        inbound_routing: {
          trunk_id: trunkId,
          numbers: [phone_number],
          allowed_addresses,
          krisp_enabled,
        },
        agents: {
          agent_name: agent_config.agent_name || 'Secretary',
          agent_voice: agent_config.agent_voice || 'alloy',
          metadata: agentMetadata,
        },
        created_at: new Date().toISOString(),
      },
      message: `Agent "${name}" deployed! Calls to ${phone_number} → ${destinationRoom}. Connect your LiveKit agent worker to handle rooms prefixed "${room_prefix}".`
    })
  } catch (err: any) {
    console.error('[SIP] Deploy agent error:', err)
    return c.json({ error: 'Failed to deploy agent', details: err.message }, 500)
  }
})

// ============================================================
// VOICE TEST — Transcribe audio & chat with AI secretary
// Allows users to test the AI agent via browser microphone
// ============================================================

// POST /api/secretary/test/transcribe — Transcribe uploaded audio
secretaryRoutes.post('/test/transcribe', async (c) => {
  const { env } = c
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Auth required' }, 401)

  try {
    const formData = await c.req.formData()
    const audioFile = formData.get('audio') as File | null
    if (!audioFile) return c.json({ error: 'No audio file' }, 400)

    // Use Whisper API for transcription via proxy
    const apiKey = env.OPENAI_API_KEY
    const baseUrl = env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

    const whisperForm = new FormData()
    whisperForm.append('file', audioFile, 'recording.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'en')

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: whisperForm
    })

    if (!res.ok) {
      // Fallback: return empty text so frontend shows "couldn't understand"
      return c.json({ text: '' })
    }

    const data: any = await res.json()
    return c.json({ text: data.text || '' })
  } catch (err: any) {
    console.error('[SecTest] Transcribe error:', err)
    return c.json({ text: '' })
  }
})

// POST /api/secretary/test/chat — Chat with AI using secretary config
secretaryRoutes.post('/test/chat', async (c) => {
  const { env } = c
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Auth required' }, 401)

  try {
    const body = await c.req.json<{
      message: string
      history?: { role: string; content: string }[]
      greeting_script?: string
      common_qa?: string
      general_notes?: string
    }>()

    const { message, history = [], greeting_script = '', common_qa = '', general_notes = '' } = body
    if (!message) return c.json({ error: 'No message' }, 400)

    // Build system prompt from secretary config
    const systemPrompt = `You are a professional AI phone secretary for a roofing company. You are currently in TEST MODE — the user is testing you through their browser before deploying you on their phone system.

Respond exactly as you would on a real phone call. Be warm, professional, and helpful. Keep responses concise (1-3 sentences) as if speaking on the phone.

YOUR GREETING/SCRIPT:
${greeting_script || 'Thank you for calling! How can I help you today?'}

COMMON Q&A:
${common_qa || 'No specific Q&A provided.'}

GENERAL NOTES:
${general_notes || 'No additional notes.'}

IMPORTANT RULES:
- Respond naturally as a phone secretary would
- Keep answers brief and conversational (phone-appropriate length)
- If asked something not covered in Q&A, say you'll take a message and have someone call back
- Be friendly and professional
- This is a TEST call — behave exactly as you would on a real call`

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // Add conversation history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content })
    }
    messages.push({ role: 'user', content: message })

    const apiKey = env.OPENAI_API_KEY
    const baseUrl = env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages,
        max_tokens: 300,
        temperature: 0.7
      })
    })

    if (!aiRes.ok) {
      // Try fallback model
      const fallbackRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          messages,
          max_tokens: 300,
          temperature: 0.7
        })
      })
      if (!fallbackRes.ok) {
        return c.json({ response: 'Sorry, I had trouble processing that. Could you repeat yourself?' })
      }
      const fallbackData: any = await fallbackRes.json()
      return c.json({ response: fallbackData.choices?.[0]?.message?.content || 'Could you repeat that please?' })
    }

    const aiData: any = await aiRes.json()
    const responseText = aiData.choices?.[0]?.message?.content || 'Could you repeat that please?'

    return c.json({ response: responseText })
  } catch (err: any) {
    console.error('[SecTest] Chat error:', err)
    return c.json({ response: 'I apologize, I had a technical issue. Could you try again?' })
  }
})

// ============================================================
// QUICK CONNECT — Phone setup for AI Secretary
// Two paths:
//   A) LiveKit auto-purchase: if LIVEKIT keys configured, auto-buy a number
//   B) Manual entry: user enters their OWN purchased number (Twilio/Vonage/Telnyx/LiveKit)
// Flow:
//   1. Enter business phone + AI phone number (or auto-purchase)
//   2. Save → get carrier forwarding instructions
//   3. Set up call forwarding → press Confirm → deploy agent to LiveKit
// ============================================================

// Helper: normalize phone to E.164
function normalizePhone(raw: string): string {
  let n = raw.replace(/[\s\-\(\)\.]/g, '')
  if (n.startsWith('1') && n.length === 11) n = '+' + n
  else if (!n.startsWith('+') && n.length === 10) n = '+1' + n
  else if (!n.startsWith('+')) n = '+' + n
  return n
}

// Helper: format phone for display
function formatPhoneDisplay(n: string): string {
  if (!n) return ''
  const d = n.replace(/^\+1/, '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return n
}

// POST /quick-connect/save-phones — Save business phone + manually entered AI phone number
// This is the primary path: user enters both phone numbers themselves
secretaryRoutes.post('/quick-connect/save-phones', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { business_phone, ai_phone_number } = await c.req.json()

  if (!business_phone) return c.json({ error: 'Your business phone number is required' }, 400)
  if (!ai_phone_number) return c.json({ error: 'Your AI phone number (purchased from Twilio/Vonage/Telnyx) is required' }, 400)

  const normalizedBiz = normalizePhone(business_phone)
  const normalizedAi = normalizePhone(ai_phone_number)

  // Validate both are proper phone numbers (10+ digits after normalization)
  const bizDigits = normalizedBiz.replace(/\D/g, '')
  const aiDigits = normalizedAi.replace(/\D/g, '')
  if (bizDigits.length < 10) return c.json({ error: 'Business phone number must be at least 10 digits' }, 400)
  if (aiDigits.length < 10) return c.json({ error: 'AI phone number must be at least 10 digits' }, 400)
  if (normalizedBiz === normalizedAi) return c.json({ error: 'Business phone and AI phone cannot be the same number' }, 400)

  // Ensure config row exists
  const existing = await c.env.DB.prepare(
    `SELECT id FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO secretary_config (customer_id, business_phone, assigned_phone_number, connection_status, forwarding_method, phone_verified, created_at, updated_at) VALUES (?, ?, ?, 'pending_forwarding', 'manual_entry', 1, datetime('now'), datetime('now'))`
    ).bind(customerId, normalizedBiz, normalizedAi).run()
  } else {
    await c.env.DB.prepare(`
      UPDATE secretary_config SET
        business_phone = ?,
        assigned_phone_number = ?,
        connection_status = 'pending_forwarding',
        forwarding_method = 'manual_entry',
        phone_verified = 1,
        updated_at = datetime('now')
      WHERE customer_id = ?
    `).bind(normalizedBiz, normalizedAi, customerId).run()
  }

  console.log(`[QuickConnect] Phones saved — Customer ${customerId}: biz=${normalizedBiz}, ai=${normalizedAi}`)

  return c.json({
    success: true,
    business_phone: normalizedBiz,
    business_phone_display: formatPhoneDisplay(normalizedBiz),
    ai_phone_number: normalizedAi,
    ai_phone_display: formatPhoneDisplay(normalizedAi),
    message: `Phone numbers saved! Now set up call forwarding from ${formatPhoneDisplay(normalizedBiz)} to ${formatPhoneDisplay(normalizedAi)}, then press Confirm.`,
  })
})

// POST /quick-connect/purchase-number — Enter phone + auto-purchase LiveKit number
// Fallback: if LiveKit purchase fails, returns needs_manual=true so frontend shows manual entry
secretaryRoutes.post('/quick-connect/purchase-number', async (c) => {
  const customerId = c.get('customerId' as any) as number
  const { phone_number } = await c.req.json()

  if (!phone_number) return c.json({ error: 'Phone number is required' }, 400)

  const normalized = normalizePhone(phone_number)

  // Ensure config row exists
  const existing = await c.env.DB.prepare(
    `SELECT id, assigned_phone_number, livekit_inbound_trunk_id, livekit_dispatch_rule_id FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO secretary_config (customer_id, business_phone, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`
    ).bind(customerId, normalized).run()
  } else {
    await c.env.DB.prepare(
      `UPDATE secretary_config SET business_phone = ?, updated_at = datetime('now') WHERE customer_id = ?`
    ).bind(normalized, customerId).run()
  }

  // Check if customer already has a real number (not a placeholder)
  if (existing?.assigned_phone_number && !existing.assigned_phone_number.includes('0000') && existing?.livekit_dispatch_rule_id) {
    console.log(`[QuickConnect] Reusing existing number ${existing.assigned_phone_number} for customer ${customerId}`)
    return c.json({
      success: true,
      ai_phone_number: existing.assigned_phone_number,
      ai_phone_display: formatPhoneDisplay(existing.assigned_phone_number),
      business_phone: normalized,
      business_phone_display: formatPhoneDisplay(normalized),
      dispatch_rule_id: existing.livekit_dispatch_rule_id || '',
      message: 'Your AI number is already set up! Proceed to call forwarding.',
    })
  }

  // --- AUTO PURCHASE A LIVEKIT PHONE NUMBER ---
  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL

  let aiPhoneNumber = ''
  let dispatchId = ''
  let connectionMethod = 'livekit_number'

  if (apiKey && apiSecret && livekitUrl) {
    try {
      console.log(`[QuickConnect] Purchasing LiveKit phone number for customer ${customerId}`)

      const searchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
        '/twirp/livekit.PhoneNumberService/SearchPhoneNumbers',
        { country_code: 'US', limit: 5 })

      console.log(`[QuickConnect] Search result:`, JSON.stringify(searchResult))

      if (searchResult?.items?.length > 0) {
        const numberToBuy = searchResult.items[0].e164_format
        console.log(`[QuickConnect] Purchasing number: ${numberToBuy}`)

        const dispatchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
          '/twirp/livekit.SIP/CreateSIPDispatchRule', {
            rule: { dispatchRuleIndividual: { roomPrefix: `secretary-${customerId}-` } },
            name: `secretary-dispatch-${customerId}`,
            metadata: JSON.stringify({ customer_id: customerId, service: 'roofer_secretary' }),
          })
        dispatchId = dispatchResult?.sip_dispatch_rule_id || ''

        const purchaseResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
          '/twirp/livekit.PhoneNumberService/PurchasePhoneNumber',
          { phone_numbers: [numberToBuy], sip_dispatch_rule_id: dispatchId || undefined })

        if (purchaseResult?.phone_numbers?.length > 0) {
          aiPhoneNumber = purchaseResult.phone_numbers[0].e164_format
          connectionMethod = 'livekit_direct'
          console.log(`[QuickConnect] Purchased number: ${aiPhoneNumber}, dispatch: ${dispatchId}`)

          if (dispatchId && !purchaseResult.phone_numbers[0].sip_dispatch_rule_id) {
            try {
              await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
                '/twirp/livekit.PhoneNumberService/UpdatePhoneNumber',
                { phone_number: aiPhoneNumber, sip_dispatch_rule_id: dispatchId })
            } catch (e: any) {
              console.error(`[QuickConnect] Failed to update dispatch link:`, e.message)
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[QuickConnect] LiveKit Phone Numbers failed:', err.message)
    }
  }

  // If auto-purchase failed, tell frontend to show manual entry form instead
  if (!aiPhoneNumber) {
    console.log(`[QuickConnect] Auto-purchase failed — prompting manual entry for customer ${customerId}`)
    return c.json({
      success: false,
      needs_manual: true,
      business_phone: normalized,
      business_phone_display: formatPhoneDisplay(normalized),
      message: 'Auto-purchase not available. Please enter the phone number you purchased from Twilio, Vonage, or Telnyx.',
    })
  }

  // Save the purchased number
  await c.env.DB.prepare(`
    UPDATE secretary_config SET
      business_phone = ?,
      assigned_phone_number = ?,
      connection_status = 'pending_forwarding',
      forwarding_method = ?,
      livekit_dispatch_rule_id = ?,
      phone_verified = 1,
      updated_at = datetime('now')
    WHERE customer_id = ?
  `).bind(normalized, aiPhoneNumber, connectionMethod, dispatchId || '', customerId).run()

  console.log(`[QuickConnect] Number purchased — Customer ${customerId}: business=${normalized}, ai=${aiPhoneNumber}`)

  return c.json({
    success: true,
    ai_phone_number: aiPhoneNumber,
    ai_phone_display: formatPhoneDisplay(aiPhoneNumber),
    business_phone: normalized,
    business_phone_display: formatPhoneDisplay(normalized),
    dispatch_rule_id: dispatchId,
    connection_method: connectionMethod,
    message: `Your AI secretary number is ${formatPhoneDisplay(aiPhoneNumber)}. Now set up call forwarding from your carrier.`,
  })
})

// POST /quick-connect/activate — User confirms forwarding is set up, deploy agent to LiveKit + activate
secretaryRoutes.post('/quick-connect/activate', async (c) => {
  const customerId = c.get('customerId' as any) as number

  const config = await c.env.DB.prepare(
    `SELECT * FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!config?.assigned_phone_number) {
    return c.json({ error: 'No AI phone number saved yet. Please enter your business phone and AI phone number first.' }, 400)
  }
  if (!config?.business_phone) {
    return c.json({ error: 'No business phone number saved. Please enter your business phone number first.' }, 400)
  }

  // --- DEPLOY LIVEKIT AGENT ---
  // Create inbound trunk + dispatch rule if not already configured
  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  let trunkId = config.livekit_inbound_trunk_id || ''
  let dispatchId = config.livekit_dispatch_rule_id || ''
  let livekitDeployed = false
  let livekitError = ''

  if (apiKey && apiSecret && livekitUrl) {
    try {
      // Create inbound trunk if not exists
      if (!trunkId) {
        console.log(`[QuickConnect] Creating LiveKit inbound trunk for customer ${customerId}`)
        const trunkResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
          '/twirp/livekit.SIP/CreateSIPInboundTrunk', {
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
        trunkId = trunkResult?.sip_trunk_id || trunkResult?.trunk?.sip_trunk_id || ''
        console.log(`[QuickConnect] Created inbound trunk: ${trunkId}`)
      }

      // Create dispatch rule if not exists
      if (!dispatchId) {
        console.log(`[QuickConnect] Creating LiveKit dispatch rule for customer ${customerId}`)
        const dispatchResult = await livekitSipAPI(apiKey, apiSecret, livekitUrl, 'POST',
          '/twirp/livekit.SIP/CreateSIPDispatchRule', {
            trunk_ids: trunkId ? [trunkId] : [],
            rule: { dispatchRuleIndividual: { roomPrefix: `secretary-${customerId}-` } },
            name: `secretary-dispatch-${customerId}`,
            metadata: JSON.stringify({ customer_id: customerId }),
          })
        dispatchId = dispatchResult?.sip_dispatch_rule_id || ''
        console.log(`[QuickConnect] Created dispatch rule: ${dispatchId}`)
      }

      livekitDeployed = !!(trunkId || dispatchId)
    } catch (err: any) {
      console.error('[QuickConnect] LiveKit deployment error:', err.message)
      livekitError = err.message
    }
  } else {
    console.log(`[QuickConnect] LiveKit API keys not configured — agent deployment skipped. Customer ${customerId} phones saved for manual LiveKit setup.`)
  }

  // Update config with connection status + LiveKit IDs
  await c.env.DB.prepare(`
    UPDATE secretary_config SET
      connection_status = 'connected',
      is_active = 1,
      livekit_inbound_trunk_id = COALESCE(?, livekit_inbound_trunk_id),
      livekit_dispatch_rule_id = COALESCE(?, livekit_dispatch_rule_id),
      updated_at = datetime('now')
    WHERE customer_id = ?
  `).bind(trunkId || null, dispatchId || null, customerId).run()

  console.log(`[QuickConnect] ACTIVATED — Customer ${customerId}, trunk=${trunkId}, dispatch=${dispatchId}, livekit_deployed=${livekitDeployed}`)

  return c.json({
    success: true,
    livekit_deployed: livekitDeployed,
    trunk_id: trunkId,
    dispatch_rule_id: dispatchId,
    livekit_error: livekitError || undefined,
    business_phone: config.business_phone,
    ai_phone_number: config.assigned_phone_number,
    message: livekitDeployed
      ? 'Your AI secretary is now LIVE and connected to LiveKit! Calls forwarded to your AI number will be answered by your AI agent.'
      : 'Your AI secretary configuration is saved and activated! LiveKit agent deployment will complete when API keys are configured. Your forwarding setup is ready.',
  })
})

// POST /quick-connect/disconnect — Disconnect the AI secretary
secretaryRoutes.post('/quick-connect/disconnect', async (c) => {
  const customerId = c.get('customerId' as any) as number

  await c.env.DB.prepare(`
    UPDATE secretary_config SET
      connection_status = 'disconnected',
      is_active = 0,
      updated_at = datetime('now')
    WHERE customer_id = ?
  `).bind(customerId).run()

  console.log(`[QuickConnect] DISCONNECTED — Customer ${customerId}`)
  return c.json({ success: true, message: 'AI secretary disconnected. Remember to disable call forwarding on your carrier.' })
})

// GET /quick-connect/status — Get current quick-connect setup status
secretaryRoutes.get('/quick-connect/status', async (c) => {
  const customerId = c.get('customerId' as any) as number

  const config = await c.env.DB.prepare(
    `SELECT business_phone, assigned_phone_number, connection_status, phone_verified, forwarding_method, livekit_inbound_trunk_id, livekit_dispatch_rule_id, is_active FROM secretary_config WHERE customer_id = ?`
  ).bind(customerId).first<any>()

  if (!config) return c.json({ status: 'not_started' })

  const formatPhone = (n: string) => {
    if (!n) return ''
    const d = n.replace(/^\+1/, '').replace(/\D/g, '')
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
    return n
  }

  return c.json({
    status: config.connection_status || 'not_started',
    business_phone: config.business_phone || '',
    business_phone_display: formatPhone(config.business_phone || ''),
    ai_phone_number: config.assigned_phone_number || '',
    ai_phone_display: formatPhone(config.assigned_phone_number || ''),
    phone_verified: !!config.phone_verified,
    is_active: !!config.is_active,
    has_trunk: !!config.livekit_inbound_trunk_id,
    has_dispatch: !!config.livekit_dispatch_rule_id,
  })
})

// ============================================================
// GET /agent-config/:customerId — Public endpoint for LiveKit agent
// Returns the secretary configuration for a specific customer.
// Used by the Python LiveKit agent to load greeting, Q&A, etc.
// No auth required — called by the agent server, not by users.
// ============================================================
secretaryRoutes.get('/agent-config/:customerId', async (c) => {
  const customerId = parseInt(c.req.param('customerId'), 10)
  if (!customerId || isNaN(customerId)) {
    return c.json({ success: false, error: 'Invalid customer ID' }, 400)
  }

  try {
    const config = await c.env.DB.prepare(
      `SELECT customer_id, business_phone, greeting_script, common_qa, general_notes,
              agent_name, agent_voice, agent_language, secretary_mode,
              answering_fallback_action, answering_forward_number,
              full_can_book_appointments, full_can_send_email, full_can_schedule_callback,
              full_can_answer_faq, full_business_hours, full_services_offered,
              full_pricing_info, full_service_area
       FROM secretary_config WHERE customer_id = ?`
    ).bind(customerId).first<any>()

    if (!config) {
      return c.json({ success: false, error: 'Secretary not configured for this customer' }, 404)
    }

    // Load directories
    const dirResult = await c.env.DB.prepare(
      `SELECT sc.id as config_id FROM secretary_config sc WHERE sc.customer_id = ?`
    ).bind(customerId).first<any>()

    let directories: any[] = []
    if (dirResult?.config_id) {
      const dirs = await c.env.DB.prepare(
        `SELECT name, phone_or_action, special_notes FROM secretary_directories WHERE config_id = ? ORDER BY sort_order`
      ).bind(dirResult.config_id).all<any>()
      directories = dirs.results || []
    }

    return c.json({
      success: true,
      config: {
        customer_id: config.customer_id,
        business_phone: config.business_phone,
        greeting_script: config.greeting_script || '',
        common_qa: config.common_qa || '',
        general_notes: config.general_notes || '',
        agent_name: config.agent_name || 'Sarah',
        agent_voice: config.agent_voice || 'alloy',
        agent_language: config.agent_language || 'en',
        secretary_mode: config.secretary_mode || 'full',
        directories,
      }
    })
  } catch (err: any) {
    console.error('[AgentConfig] Error:', err.message)
    return c.json({ success: false, error: 'Failed to load agent config' }, 500)
  }
})
