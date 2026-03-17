import { Hono } from 'hono'
import type { Bindings } from '../types'
import { resolveTeamOwner } from './team'
import { trackLeadCapture } from '../services/ga4-events'
import { sendGmailOAuth2 } from '../services/email'

export const agentsRoutes = new Hono<{ Bindings: Bindings }>()

// ── Auth helper ──
async function getCustomer(c: any): Promise<{ id: number; email: string; ownerId: number } | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const s = await c.env.DB.prepare(
    "SELECT cs.customer_id, cu.email FROM customer_sessions cs JOIN customers cu ON cu.id=cs.customer_id WHERE cs.session_token=? AND cs.expires_at>datetime('now')"
  ).bind(token).first<any>()
  if (!s) return null
  const t = await resolveTeamOwner(c.env.DB, s.customer_id)
  return { id: s.customer_id, email: s.email, ownerId: t.ownerId }
}

// ============================================================
// LEAD CAPTURE — Public endpoint, no auth
// ============================================================
agentsRoutes.post('/leads', async (c) => {
  try {
    const body = await c.req.json()
    const { first_name, last_name, company_name, phone, email, source_page, message } = body
    // Support both old (name) and new (first_name + last_name) format
    const fullName = body.name || [first_name, last_name].filter(Boolean).join(' ')
    if (!email || !fullName) return c.json({ error: 'Name and email are required' }, 400)
    const emailClean = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) return c.json({ error: 'Invalid email' }, 400)

    // Add first_name/last_name columns dynamically (safe idempotent)
    try {
      await c.env.DB.prepare("ALTER TABLE leads ADD COLUMN first_name TEXT DEFAULT ''").run()
    } catch {}
    try {
      await c.env.DB.prepare("ALTER TABLE leads ADD COLUMN last_name TEXT DEFAULT ''").run()
    } catch {}

    await c.env.DB.prepare(
      `INSERT INTO leads (name, first_name, last_name, company_name, phone, email, source_page, message) VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      String(fullName).trim().slice(0, 200),
      first_name ? String(first_name).trim().slice(0, 100) : '',
      last_name ? String(last_name).trim().slice(0, 100) : '',
      company_name ? String(company_name).trim().slice(0, 200) : '',
      phone ? String(phone).trim().slice(0, 30) : '',
      emailClean,
      source_page || 'unknown',
      message ? String(message).trim().slice(0, 2000) : ''
    ).run()

    // Track lead capture in GA4
    trackLeadCapture(c.env, source_page || 'unknown', {
      lead_name: String(fullName).trim().substring(0, 50),
      lead_company: company_name ? String(company_name).trim().substring(0, 50) : '',
      lead_email_domain: emailClean.split('@')[1] || 'unknown'
    }).catch(() => {})

    // Send email notification to HARDCODED admin (ethangourley17@gmail.com)
    // PLUS any ADMIN_NOTIFICATION_EMAIL from env — never expose the address publicly
    const SUPER_ADMIN_EMAIL = 'ethangourley17@gmail.com'
    try {
      const ci = (c.env as any).GOOGLE_CLIENT_ID
      const cs = (c.env as any).GOOGLE_CLIENT_SECRET
      const rt = (c.env as any).GMAIL_REFRESH_TOKEN
      const adminEmail = (c.env as any).ADMIN_NOTIFICATION_EMAIL || SUPER_ADMIN_EMAIL

      if (ci && cs && rt) {
        const firstNameDisplay = first_name ? String(first_name).trim() : String(fullName).trim().split(' ')[0]
        const lastNameDisplay = last_name ? String(last_name).trim() : (String(fullName).trim().split(' ').slice(1).join(' ') || '')
        const subject = `New Contact Form: ${firstNameDisplay} ${lastNameDisplay} — ${source_page || 'website'}`
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
            <div style="background:linear-gradient(135deg,#0891b2,#0ea5e9);padding:20px;border-radius:12px 12px 0 0;text-align:center;">
              <h2 style="color:#fff;margin:0;font-size:22px;">New Contact Form Submission</h2>
              <p style="color:#e0f2fe;margin:5px 0 0;font-size:13px;">RoofReporterAI — ${source_page || 'website'}</p>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:120px;">First Name</td><td style="padding:8px 0;font-weight:600;color:#1e293b;">${firstNameDisplay}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Last Name</td><td style="padding:8px 0;font-weight:600;color:#1e293b;">${lastNameDisplay || '<em style="color:#94a3b8">Not provided</em>'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Company</td><td style="padding:8px 0;color:#1e293b;">${company_name ? String(company_name).trim() : '<em style="color:#94a3b8">Not provided</em>'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Phone</td><td style="padding:8px 0;color:#1e293b;">${phone ? String(phone).trim() : '<em style="color:#94a3b8">Not provided</em>'}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 0;color:#1e293b;"><a href="mailto:${emailClean}" style="color:#0891b2;">${emailClean}</a></td></tr>
              </table>
              ${message ? `<div style="margin-top:16px;padding:16px;background:#f1f5f9;border-radius:8px;border-left:4px solid #0891b2;"><p style="margin:0 0 4px;font-size:12px;color:#64748b;font-weight:600;">MESSAGE</p><p style="margin:0;color:#334155;font-size:14px;line-height:1.5;">${String(message).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></div>` : ''}
              <p style="margin-top:20px;font-size:12px;color:#94a3b8;text-align:center;">View all leads in your <a href="https://roofreporterai.com/super-admin" style="color:#0891b2;">Super Admin Dashboard</a></p>
            </div>
          </div>
        `
        // Always send to the super admin email
        await sendGmailOAuth2(ci, cs, rt, SUPER_ADMIN_EMAIL, subject, emailHtml, (c.env as any).GMAIL_SENDER_EMAIL || adminEmail)
        console.log(`[Leads] Email notification sent to super admin for lead: ${emailClean}`)

        // Also send to ADMIN_NOTIFICATION_EMAIL if it's different
        if (adminEmail && adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
          await sendGmailOAuth2(ci, cs, rt, adminEmail, subject, emailHtml, (c.env as any).GMAIL_SENDER_EMAIL || adminEmail).catch(() => {})
        }
      }
    } catch (emailErr: any) {
      console.error('[Leads] Failed to send admin email notification:', emailErr.message)
      // Don't fail the lead submission if email fails
    }

    return c.json({ success: true, message: 'Thank you! We will be in touch shortly.' })
  } catch (e: any) {
    return c.json({ error: 'Failed to submit', details: e.message }, 500)
  }
})

// GET /leads — Admin only
agentsRoutes.get('/leads', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const page = parseInt(c.req.query('page') || '1')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
  const offset = (page - 1) * limit
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all<any>()
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM leads').first<any>()
  return c.json({ leads: results, total: countRow?.cnt || 0, page, limit })
})

// POST /track — Public analytics event tracker (no auth required)
agentsRoutes.post('/track', async (c) => {
  try {
    const body = await c.req.json()
    const { event, ...data } = body
    if (!event) return c.json({ ok: true }) // silently ignore
    
    // Ensure analytics_events table exists
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event TEXT NOT NULL,
          data TEXT,
          url TEXT,
          user_agent TEXT,
          ip TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
    } catch(e) {}
    
    await c.env.DB.prepare(
      'INSERT INTO analytics_events (event, data, url, user_agent) VALUES (?,?,?,?)'
    ).bind(
      event,
      JSON.stringify(data),
      data.url || '',
      c.req.header('user-agent') || ''
    ).run()
    
    return c.json({ ok: true })
  } catch(e) {
    return c.json({ ok: true }) // silently fail
  }
})

// ============================================================
// AUTO-EMAIL PREFERENCE
// ============================================================
agentsRoutes.get('/auto-email', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const row = await c.env.DB.prepare('SELECT auto_email_reports FROM customers WHERE id=?').bind(cust.ownerId).first<any>()
  return c.json({ auto_email_reports: row?.auto_email_reports === 1 })
})

agentsRoutes.post('/auto-email', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { enabled } = await c.req.json()
  await c.env.DB.prepare(
    "UPDATE customers SET auto_email_reports=?, updated_at=datetime('now') WHERE id=?"
  ).bind(enabled ? 1 : 0, cust.ownerId).run()
  return c.json({ success: true, auto_email_reports: !!enabled })
})

// ============================================================
// AGENT CONFIG — Serve config to LiveKit agents (public, keyed by customer_id)
// ============================================================
agentsRoutes.get('/agent-config/:customerId', async (c) => {
  const customerId = parseInt(c.req.param('customerId'))
  if (!customerId) return c.json({ error: 'Invalid customer ID' }, 400)
  try {
    const config = await c.env.DB.prepare(
      'SELECT * FROM secretary_config WHERE customer_id=?'
    ).bind(customerId).first<any>()
    if (!config) return c.json({ error: 'No config' }, 404)
    const dirs = await c.env.DB.prepare(
      'SELECT name, phone_or_action, special_notes FROM secretary_directories WHERE config_id=? ORDER BY sort_order'
    ).bind(config.id).all<any>()
    const customer = await c.env.DB.prepare('SELECT name, email, company FROM customers WHERE id=?').bind(customerId).first<any>()
    return c.json({
      customer_id: customerId,
      business_phone: config.business_phone || '',
      greeting_script: config.greeting_script || '',
      common_qa: config.common_qa || '',
      general_notes: config.general_notes || '',
      agent_name: config.agent_name || 'Sarah',
      directories: dirs.results || [],
      company_name: customer?.company || customer?.name || '',
    })
  } catch { return c.json({ error: 'Config not available' }, 500) }
})

// ============================================================
// REPORT DATA — Serve report data to Interactive Report Agent
// ============================================================
agentsRoutes.get('/report-data/:orderId', async (c) => {
  const orderId = c.req.param('orderId')
  try {
    const report = await c.env.DB.prepare(
      `SELECT r.api_response_raw, r.roof_segments, r.edge_measurements, r.material_estimate,
              r.gross_squares, r.total_area_sqft, r.waste_factor_pct, r.bundle_count,
              o.property_address, o.property_city, o.property_province
       FROM reports r JOIN orders o ON o.id=r.order_id WHERE r.order_id=?`
    ).bind(orderId).first<any>()
    if (!report) return c.json({ error: 'Report not found' }, 404)

    let parsed: any = {}
    try { parsed = typeof report.api_response_raw === 'string' ? JSON.parse(report.api_response_raw) : report.api_response_raw } catch {}

    return c.json({
      order_id: orderId,
      address: [report.property_address, report.property_city, report.property_province].filter(Boolean).join(', '),
      roof_area_sqft: report.total_area_sqft || parsed?.roof_area_sqft,
      gross_squares: report.gross_squares,
      waste_factor_pct: report.waste_factor_pct,
      bundle_count: report.bundle_count,
      segments: report.roof_segments ? JSON.parse(report.roof_segments) : parsed?.segments || [],
      edges: report.edge_measurements ? JSON.parse(report.edge_measurements) : {},
      materials: report.material_estimate ? JSON.parse(report.material_estimate) : parsed?.material_estimate || {},
      pitch: parsed?.roof_pitch || parsed?.roof_pitch_degrees,
      summary: parsed?.executive_summary || parsed?.summary || '',
    })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ============================================================
// SUPPLIER DIRECTORY — CRUD for procurement agent
// ============================================================
agentsRoutes.get('/suppliers', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM supplier_directory WHERE owner_id=? ORDER BY preferred DESC, name'
  ).bind(cust.ownerId).all<any>()
  return c.json({ suppliers: results })
})

agentsRoutes.post('/suppliers', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { name, phone, email, address, city, province, supplier_type, preferred, notes } = await c.req.json()
  if (!name) return c.json({ error: 'Supplier name required' }, 400)
  const res = await c.env.DB.prepare(
    `INSERT INTO supplier_directory (owner_id, name, phone, email, address, city, province, supplier_type, preferred, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(cust.ownerId, name, phone||'', email||'', address||'', city||'', province||'', supplier_type||'general', preferred?1:0, notes||'').run()
  return c.json({ success: true, id: res.meta.last_row_id })
})

// ============================================================
// QA FOLLOW-UPS — Schedule + manage post-install calls
// ============================================================
agentsRoutes.get('/qa-followups', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM qa_followups WHERE owner_id=? ORDER BY scheduled_at DESC'
  ).bind(cust.ownerId).all<any>()
  return c.json({ followups: results })
})

agentsRoutes.post('/qa-followups', async (c) => {
  const cust = await getCustomer(c)
  if (!cust) return c.json({ error: 'Auth required' }, 401)
  const { job_id, crm_customer_id, homeowner_name, homeowner_phone, scheduled_at } = await c.req.json()
  if (!homeowner_phone) return c.json({ error: 'Phone required' }, 400)
  const res = await c.env.DB.prepare(
    `INSERT INTO qa_followups (owner_id, job_id, crm_customer_id, homeowner_name, homeowner_phone, scheduled_at) VALUES (?,?,?,?,?,?)`
  ).bind(cust.ownerId, job_id||null, crm_customer_id||null, homeowner_name||'', homeowner_phone, scheduled_at||null).run()
  return c.json({ success: true, id: res.meta.last_row_id })
})

// ============================================================
// AGENT INTERACTION LOG
// ============================================================
agentsRoutes.post('/interactions', async (c) => {
  const { agent_type, customer_id, reference_id, room_name, caller_phone, summary, transcript, outcome, duration_seconds, metadata } = await c.req.json()
  if (!agent_type) return c.json({ error: 'agent_type required' }, 400)
  await c.env.DB.prepare(
    `INSERT INTO agent_interactions (agent_type, customer_id, reference_id, room_name, caller_phone, summary, transcript, outcome, duration_seconds, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(agent_type, customer_id||null, reference_id||'', room_name||'', caller_phone||'', summary||'', transcript||'', outcome||'completed', duration_seconds||0, metadata ? JSON.stringify(metadata) : '').run()
  return c.json({ success: true })
})

// ============================================================
// LIVEKIT TOKEN — Generate token for web voice widget
// ============================================================
agentsRoutes.post('/livekit-token', async (c) => {
  const apiKey = (c.env as any).LIVEKIT_API_KEY
  const apiSecret = (c.env as any).LIVEKIT_API_SECRET
  const livekitUrl = (c.env as any).LIVEKIT_URL
  if (!apiKey || !apiSecret) return c.json({ error: 'LiveKit not configured' }, 500)

  const { room_name, identity, metadata } = await c.req.json()
  if (!room_name || !identity) return c.json({ error: 'room_name and identity required' }, 400)

  // Build JWT token
  function b64url(data: any): string {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    let binary = ''
    bytes.forEach((b: number) => binary += String.fromCharCode(b))
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: apiKey, sub: identity, iat: now, exp: now + 3600, nbf: now,
    video: { room: room_name, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    metadata: metadata || '',
  }))
  const sigInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput))
  const token = `${header}.${payload}.${b64url(sig)}`

  return c.json({ token, url: livekitUrl, room: room_name, identity })
})
