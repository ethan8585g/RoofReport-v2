import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession, requireSuperadmin } from './auth'

export const emailOutreachRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Superadmin only (skip for public /unsubscribe)
// ============================================================
emailOutreachRoutes.use('/*', async (c, next) => {
  // Public endpoints that don't require auth
  if (c.req.path.includes('/unsubscribe/')) {
    return next()
  }
  // Support token in query string (for download/export endpoints)
  const authHeader = c.req.header('Authorization') || (c.req.query('token') ? `Bearer ${c.req.query('token')}` : undefined)
  const admin = await validateAdminSession(c.env.DB, authHeader)
  if (!admin || !requireSuperadmin(admin)) {
    return c.json({ error: 'Superadmin access required' }, 403)
  }
  c.set('admin' as any, admin)
  return next()
})

// ============================================================
// ENSURE TABLES — Auto-creates tables if migration hasn't run
// ============================================================
async function ensureTables(db: D1Database) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS email_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
      contact_count INTEGER DEFAULT 0, tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, email TEXT NOT NULL,
      company_name TEXT, contact_name TEXT, phone TEXT, city TEXT, province TEXT, website TEXT,
      source TEXT, status TEXT DEFAULT 'active', bounce_count INTEGER DEFAULT 0,
      last_sent_at DATETIME, last_opened_at DATETIME, last_clicked_at DATETIME,
      sends_count INTEGER DEFAULT 0, opens_count INTEGER DEFAULT 0, clicks_count INTEGER DEFAULT 0,
      tags TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES email_lists(id) ON DELETE CASCADE, UNIQUE(list_id, email)
    )`,
    `CREATE TABLE IF NOT EXISTS email_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject TEXT NOT NULL,
      from_name TEXT DEFAULT 'RoofReporterAI', from_email TEXT, reply_to TEXT,
      body_html TEXT NOT NULL, body_text TEXT, list_ids TEXT NOT NULL,
      status TEXT DEFAULT 'draft', scheduled_at DATETIME, started_at DATETIME, completed_at DATETIME,
      total_recipients INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0, bounce_count INTEGER DEFAULT 0,
      unsubscribe_count INTEGER DEFAULT 0, send_rate_per_minute INTEGER DEFAULT 10,
      tags TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, contact_id INTEGER NOT NULL,
      email TEXT NOT NULL, status TEXT DEFAULT 'queued', sent_at DATETIME, opened_at DATETIME,
      clicked_at DATETIME, bounced_at DATETIME, error_message TEXT, resend_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject TEXT NOT NULL,
      body_html TEXT NOT NULL, body_text TEXT, category TEXT DEFAULT 'marketing',
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ]
  for (const sql of tables) {
    try { await db.prepare(sql).run() } catch (e) {}
  }
  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_email_contacts_list ON email_contacts(list_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_contacts_email ON email_contacts(email)',
    'CREATE INDEX IF NOT EXISTS idx_email_contacts_status ON email_contacts(status)',
    'CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status)',
    'CREATE INDEX IF NOT EXISTS idx_send_log_campaign ON email_send_log(campaign_id)',
    'CREATE INDEX IF NOT EXISTS idx_send_log_contact ON email_send_log(contact_id)',
    'CREATE INDEX IF NOT EXISTS idx_send_log_status ON email_send_log(status)'
  ]
  for (const idx of indexes) {
    try { await db.prepare(idx).run() } catch (e) {}
  }
}

// ============================================================
// EMAIL LISTS — CRUD
// ============================================================

// GET /lists — All lists with stats
emailOutreachRoutes.get('/lists', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const lists = await c.env.DB.prepare(`
      SELECT el.*,
        (SELECT COUNT(*) FROM email_contacts ec WHERE ec.list_id = el.id) as total_contacts,
        (SELECT COUNT(*) FROM email_contacts ec WHERE ec.list_id = el.id AND ec.status = 'active') as active_contacts,
        (SELECT COUNT(*) FROM email_contacts ec WHERE ec.list_id = el.id AND ec.status = 'bounced') as bounced_contacts,
        (SELECT COUNT(*) FROM email_contacts ec WHERE ec.list_id = el.id AND ec.status = 'unsubscribed') as unsubscribed_contacts
      FROM email_lists el
      ORDER BY el.created_at DESC
    `).all()

    const globalStats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM email_lists) as total_lists,
        (SELECT COUNT(*) FROM email_contacts) as total_contacts,
        (SELECT COUNT(*) FROM email_contacts WHERE status = 'active') as active_contacts,
        (SELECT COUNT(*) FROM email_campaigns) as total_campaigns,
        (SELECT COUNT(*) FROM email_campaigns WHERE status = 'completed') as completed_campaigns,
        (SELECT COUNT(DISTINCT email) FROM email_contacts WHERE status = 'active') as unique_emails
    `).first()

    return c.json({ lists: lists.results, stats: globalStats })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /lists — Create list
emailOutreachRoutes.post('/lists', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const { name, description, tags } = await c.req.json()
    if (!name) return c.json({ error: 'List name is required' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO email_lists (name, description, tags) VALUES (?, ?, ?)'
    ).bind(name, description || '', tags || '').run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// PUT /lists/:id — Update list
emailOutreachRoutes.put('/lists/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const { name, description, tags } = await c.req.json()
    await c.env.DB.prepare(
      "UPDATE email_lists SET name = ?, description = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(name, description || '', tags || '', id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /lists/:id — Delete list and all its contacts
emailOutreachRoutes.delete('/lists/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    await c.env.DB.prepare('DELETE FROM email_contacts WHERE list_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM email_lists WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// CONTACTS — CRUD + Bulk Import
// ============================================================

// GET /lists/:id/contacts — Contacts in a list with pagination & search
emailOutreachRoutes.get('/lists/:id/contacts', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const search = c.req.query('search') || ''
    const status = c.req.query('status') || ''
    const limit = parseInt(c.req.query('limit') || '100')
    const offset = parseInt(c.req.query('offset') || '0')

    let where = 'WHERE ec.list_id = ?'
    const binds: any[] = [listId]
    if (search) {
      where += ' AND (ec.email LIKE ? OR ec.company_name LIKE ? OR ec.contact_name LIKE ? OR ec.city LIKE ?)'
      const s = `%${search}%`
      binds.push(s, s, s, s)
    }
    if (status) {
      where += ' AND ec.status = ?'
      binds.push(status)
    }

    const contacts = await c.env.DB.prepare(`
      SELECT ec.* FROM email_contacts ec ${where}
      ORDER BY ec.created_at DESC LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all()

    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM email_contacts ec ${where}
    `).bind(...binds).first<any>()

    const list = await c.env.DB.prepare('SELECT * FROM email_lists WHERE id = ?').bind(listId).first()

    return c.json({ contacts: contacts.results, total: countResult?.total || 0, list })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /lists/:id/contacts — Add single contact
emailOutreachRoutes.post('/lists/:id/contacts', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const { email, company_name, contact_name, phone, city, province, website, source, notes } = await c.req.json()
    if (!email) return c.json({ error: 'Email is required' }, 400)

    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO email_contacts (list_id, email, company_name, contact_name, phone, city, province, website, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(listId, email.toLowerCase().trim(), company_name || '', contact_name || '', phone || '', city || '', province || '', website || '', source || 'manual', notes || '').run()

    // Update list count
    await c.env.DB.prepare("UPDATE email_lists SET contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = ?), updated_at = datetime('now') WHERE id = ?").bind(listId, listId).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /lists/:id/import — Bulk import contacts from CSV/paste data
emailOutreachRoutes.post('/lists/:id/import', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const { contacts, source } = await c.req.json()

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return c.json({ error: 'contacts array is required' }, 400)
    }

    let imported = 0
    let skipped = 0
    let errors = 0

    // Process in batches of 50
    for (let i = 0; i < contacts.length; i++) {
      const ct = contacts[i]
      const email = (ct.email || '').toLowerCase().trim()
      if (!email || !email.includes('@')) { skipped++; continue }

      try {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO email_contacts (list_id, email, company_name, contact_name, phone, city, province, website, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          listId, email,
          ct.company_name || ct.company || '',
          ct.contact_name || ct.name || '',
          ct.phone || '',
          ct.city || '',
          ct.province || ct.state || '',
          ct.website || '',
          source || 'csv_import'
        ).run()
        imported++
      } catch {
        errors++
      }
    }

    // Update list count
    await c.env.DB.prepare("UPDATE email_lists SET contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = ?), updated_at = datetime('now') WHERE id = ?").bind(listId, listId).run()

    return c.json({ success: true, imported, skipped, errors, total: contacts.length })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /contacts/:id — Delete single contact
emailOutreachRoutes.delete('/contacts/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const contact = await c.env.DB.prepare('SELECT list_id FROM email_contacts WHERE id = ?').bind(id).first<any>()
    await c.env.DB.prepare('DELETE FROM email_contacts WHERE id = ?').bind(id).run()
    if (contact) {
      await c.env.DB.prepare("UPDATE email_lists SET contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = ?), updated_at = datetime('now') WHERE id = ?").bind(contact.list_id, contact.list_id).run()
    }
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /lists/:id/contacts/bulk — Bulk delete contacts by status
emailOutreachRoutes.delete('/lists/:id/contacts/bulk', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const status = c.req.query('status') || 'bounced'
    const result = await c.env.DB.prepare('DELETE FROM email_contacts WHERE list_id = ? AND status = ?').bind(listId, status).run()
    await c.env.DB.prepare("UPDATE email_lists SET contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = ?), updated_at = datetime('now') WHERE id = ?").bind(listId, listId).run()
    return c.json({ success: true, deleted: result.meta.changes })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// CAMPAIGNS — CRUD + Send
// ============================================================

// GET /campaigns — All campaigns
emailOutreachRoutes.get('/campaigns', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const campaigns = await c.env.DB.prepare(`
      SELECT ec.* FROM email_campaigns ec ORDER BY ec.created_at DESC
    `).all()
    return c.json({ campaigns: campaigns.results })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// GET /campaigns/:id — Single campaign with send log summary
emailOutreachRoutes.get('/campaigns/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const campaign = await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(id).first()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' OR status = 'delivered' OR status = 'opened' OR status = 'clicked' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'opened' OR status = 'clicked' THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
      FROM email_send_log WHERE campaign_id = ?
    `).bind(id).first()

    const recentLog = await c.env.DB.prepare(`
      SELECT esl.*, ec.company_name, ec.contact_name
      FROM email_send_log esl
      LEFT JOIN email_contacts ec ON esl.contact_id = ec.id
      WHERE esl.campaign_id = ?
      ORDER BY esl.created_at DESC LIMIT 100
    `).bind(id).all()

    return c.json({ campaign, stats, send_log: recentLog.results })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /campaigns — Create campaign
emailOutreachRoutes.post('/campaigns', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const { name, subject, from_name, from_email, reply_to, body_html, body_text, list_ids, send_rate_per_minute, notes } = await c.req.json()
    if (!name || !subject || !body_html || !list_ids) {
      return c.json({ error: 'name, subject, body_html, and list_ids are required' }, 400)
    }

    const listIdsStr = Array.isArray(list_ids) ? list_ids.join(',') : String(list_ids)

    const result = await c.env.DB.prepare(`
      INSERT INTO email_campaigns (name, subject, from_name, from_email, reply_to, body_html, body_text, list_ids, send_rate_per_minute, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name, subject, from_name || 'RoofReporterAI', from_email || '', reply_to || '',
      body_html, body_text || '', listIdsStr, send_rate_per_minute || 10, notes || ''
    ).run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// PUT /campaigns/:id — Update campaign (only if draft)
emailOutreachRoutes.put('/campaigns/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const campaign = await c.env.DB.prepare('SELECT status FROM email_campaigns WHERE id = ?').bind(id).first<any>()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)
    if (campaign.status !== 'draft') return c.json({ error: 'Can only edit draft campaigns' }, 400)

    const { name, subject, from_name, from_email, reply_to, body_html, body_text, list_ids, send_rate_per_minute, notes } = await c.req.json()
    const listIdsStr = Array.isArray(list_ids) ? list_ids.join(',') : String(list_ids || '')

    await c.env.DB.prepare(`
      UPDATE email_campaigns SET name=?, subject=?, from_name=?, from_email=?, reply_to=?,
        body_html=?, body_text=?, list_ids=?, send_rate_per_minute=?, notes=?, updated_at=datetime('now')
      WHERE id = ?
    `).bind(name, subject, from_name || 'RoofReporterAI', from_email || '', reply_to || '', body_html, body_text || '', listIdsStr, send_rate_per_minute || 10, notes || '', id).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /campaigns/:id
emailOutreachRoutes.delete('/campaigns/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    await c.env.DB.prepare('DELETE FROM email_send_log WHERE campaign_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM email_campaigns WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// SEND CAMPAIGN — Queues all recipients, then sends in batches
// Uses Resend API (primary) or Gmail OAuth2 (fallback)
// ============================================================
emailOutreachRoutes.post('/campaigns/:id/send', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const campaign = await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(id).first<any>()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)
    if (campaign.status === 'sending') return c.json({ error: 'Campaign is already sending' }, 400)
    if (campaign.status === 'completed') return c.json({ error: 'Campaign already completed. Duplicate to send again.' }, 400)

    // Gather recipients from all lists
    const listIds = campaign.list_ids.split(',').map((x: string) => parseInt(x.trim())).filter((x: number) => !isNaN(x))
    if (listIds.length === 0) return c.json({ error: 'No lists selected' }, 400)

    const placeholders = listIds.map(() => '?').join(',')
    const recipients = await c.env.DB.prepare(`
      SELECT DISTINCT ec.id, ec.email, ec.company_name, ec.contact_name
      FROM email_contacts ec
      WHERE ec.list_id IN (${placeholders}) AND ec.status = 'active'
      ORDER BY ec.email
    `).bind(...listIds).all()

    const contacts = recipients.results as any[]
    if (contacts.length === 0) return c.json({ error: 'No active contacts in selected lists' }, 400)

    // Clear previous send log for this campaign (if re-sending a draft)
    await c.env.DB.prepare('DELETE FROM email_send_log WHERE campaign_id = ?').bind(id).run()

    // Update campaign status
    await c.env.DB.prepare(`
      UPDATE email_campaigns SET status = 'sending', started_at = datetime('now'),
        total_recipients = ?, sent_count = 0, failed_count = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(contacts.length, id).run()

    // Queue all recipients in send_log
    for (const ct of contacts) {
      await c.env.DB.prepare(`
        INSERT INTO email_send_log (campaign_id, contact_id, email, status)
        VALUES (?, ?, ?, 'queued')
      `).bind(id, ct.id, ct.email).run()
    }

    // Now send emails — Resend API (preferred), Gmail OAuth2 (fallback)
    const resendKey = (c.env as any).RESEND_API_KEY
    const gmailRefreshToken = (c.env as any).GMAIL_REFRESH_TOKEN
    let dbRefreshToken = ''
    try {
      const row = await c.env.DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'gmail_refresh_token' AND master_company_id = 1").first<any>()
      dbRefreshToken = row?.setting_value || ''
    } catch {}

    const senderEmail = campaign.from_email || (c.env as any).GMAIL_SENDER_EMAIL || 'reports@reusecanada.ca'
    const senderName = campaign.from_name || 'RoofReporterAI'

    let sentCount = 0
    let failedCount = 0

    for (const ct of contacts) {
      try {
        // Personalise email — replace merge tags
        let html = campaign.body_html
          .replace(/\{\{company_name\}\}/g, ct.company_name || '')
          .replace(/\{\{contact_name\}\}/g, ct.contact_name || '')
          .replace(/\{\{email\}\}/g, ct.email)
          .replace(/\{\{first_name\}\}/g, (ct.contact_name || '').split(' ')[0] || '')

        // Append CAN-SPAM compliant footer with unsubscribe link
        const unsubUrl = `https://roofreporterai.com/api/email-outreach/unsubscribe/${encodeURIComponent(ct.email)}`
        html += `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <p style="margin:4px 0">Reuse Canada Ltd. &bull; Alberta, Canada</p>
  <p style="margin:4px 0">You are receiving this because you are listed as a roofing industry contact.</p>
  <p style="margin:4px 0"><a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a> from future emails</p>
</div>`

        let sent = false

        // Method 1: Resend API
        if (resendKey && !sent) {
          try {
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${senderName} <${senderEmail}>`,
                to: [ct.email],
                subject: campaign.subject
                  .replace(/\{\{company_name\}\}/g, ct.company_name || '')
                  .replace(/\{\{contact_name\}\}/g, ct.contact_name || ''),
                html: html,
                reply_to: campaign.reply_to || senderEmail
              })
            })
            if (resp.ok) {
              const data: any = await resp.json()
              await c.env.DB.prepare(`
                UPDATE email_send_log SET status = 'sent', sent_at = datetime('now'), resend_message_id = ?
                WHERE campaign_id = ? AND contact_id = ?
              `).bind(data.id || '', id, ct.id).run()
              sent = true
              sentCount++
            } else {
              const errText = await resp.text()
              throw new Error(`Resend ${resp.status}: ${errText.substring(0, 200)}`)
            }
          } catch (e: any) {
            // Fall through to Gmail
            if (!gmailRefreshToken && !dbRefreshToken) {
              await c.env.DB.prepare(`
                UPDATE email_send_log SET status = 'failed', error_message = ?
                WHERE campaign_id = ? AND contact_id = ?
              `).bind(e.message?.substring(0, 500) || 'Send failed', id, ct.id).run()
              failedCount++
              continue
            }
          }
        }

        // Method 2: Gmail OAuth2
        if (!sent && (gmailRefreshToken || dbRefreshToken)) {
          try {
            const refreshToken = gmailRefreshToken || dbRefreshToken
            const clientId = (c.env as any).GMAIL_CLIENT_ID
            const clientSecret = (c.env as any).GMAIL_CLIENT_SECRET
            if (!clientId || !clientSecret) throw new Error('Gmail OAuth not configured')

            // Get access token
            const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret
              }).toString()
            })
            const tokenData: any = await tokenResp.json()
            if (!tokenData.access_token) throw new Error('Failed to get Gmail access token')

            const subject = campaign.subject
              .replace(/\{\{company_name\}\}/g, ct.company_name || '')
              .replace(/\{\{contact_name\}\}/g, ct.contact_name || '')

            const rawEmail = [
              `From: ${senderName} <${senderEmail}>`,
              `To: ${ct.email}`,
              `Subject: ${subject}`,
              `Reply-To: ${campaign.reply_to || senderEmail}`,
              'MIME-Version: 1.0',
              'Content-Type: text/html; charset=utf-8',
              '',
              html
            ].join('\r\n')

            const base64Url = btoa(unescape(encodeURIComponent(rawEmail)))
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

            const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ raw: base64Url })
            })

            if (sendResp.ok) {
              await c.env.DB.prepare(`
                UPDATE email_send_log SET status = 'sent', sent_at = datetime('now')
                WHERE campaign_id = ? AND contact_id = ?
              `).bind(id, ct.id).run()
              sentCount++
            } else {
              const errText = await sendResp.text()
              throw new Error(`Gmail ${sendResp.status}: ${errText.substring(0, 200)}`)
            }
          } catch (e: any) {
            await c.env.DB.prepare(`
              UPDATE email_send_log SET status = 'failed', error_message = ?
              WHERE campaign_id = ? AND contact_id = ?
            `).bind(e.message?.substring(0, 500) || 'Gmail send failed', id, ct.id).run()
            failedCount++
          }
        }

        if (!sent && !resendKey && !gmailRefreshToken && !dbRefreshToken) {
          await c.env.DB.prepare(`
            UPDATE email_send_log SET status = 'failed', error_message = 'No email provider configured'
            WHERE campaign_id = ? AND contact_id = ?
          `).bind(id, ct.id).run()
          failedCount++
        }

        // Update campaign running totals
        await c.env.DB.prepare(`
          UPDATE email_contacts SET sends_count = sends_count + 1, last_sent_at = datetime('now')
          WHERE id = ?
        `).bind(ct.id).run()

      } catch (e: any) {
        failedCount++
      }
    }

    // Finalise campaign
    await c.env.DB.prepare(`
      UPDATE email_campaigns SET status = 'completed', completed_at = datetime('now'),
        sent_count = ?, failed_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(sentCount, failedCount, id).run()

    return c.json({
      success: true,
      total_recipients: contacts.length,
      sent: sentCount,
      failed: failedCount,
      provider: resendKey ? 'resend' : (gmailRefreshToken || dbRefreshToken ? 'gmail' : 'none')
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /campaigns/:id/test — Send test email to a single address
emailOutreachRoutes.post('/campaigns/:id/test', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const { test_email } = await c.req.json()
    if (!test_email) return c.json({ error: 'test_email is required' }, 400)

    const campaign = await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(id).first<any>()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

    const resendKey = (c.env as any).RESEND_API_KEY
    const senderEmail = campaign.from_email || (c.env as any).GMAIL_SENDER_EMAIL || 'reports@reusecanada.ca'
    const senderName = campaign.from_name || 'RoofReporterAI'

    // Replace merge tags with test data
    const html = campaign.body_html
      .replace(/\{\{company_name\}\}/g, 'Test Company')
      .replace(/\{\{contact_name\}\}/g, 'Test Contact')
      .replace(/\{\{email\}\}/g, test_email)
      .replace(/\{\{first_name\}\}/g, 'Test')

    const subject = `[TEST] ${campaign.subject}`
      .replace(/\{\{company_name\}\}/g, 'Test Company')
      .replace(/\{\{contact_name\}\}/g, 'Test Contact')

    if (resendKey) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${senderName} <${senderEmail}>`,
          to: [test_email],
          subject,
          html,
          reply_to: campaign.reply_to || senderEmail
        })
      })
      if (resp.ok) {
        return c.json({ success: true, provider: 'resend' })
      }
      const err = await resp.text()
      return c.json({ error: `Resend error: ${err.substring(0, 300)}` }, 500)
    }

    return c.json({ error: 'No email provider configured. Set RESEND_API_KEY or connect Gmail OAuth.' }, 400)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /campaigns/:id/duplicate — Clone a campaign
emailOutreachRoutes.post('/campaigns/:id/duplicate', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const campaign = await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(id).first<any>()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

    const result = await c.env.DB.prepare(`
      INSERT INTO email_campaigns (name, subject, from_name, from_email, reply_to, body_html, body_text, list_ids, send_rate_per_minute, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      campaign.name + ' (Copy)', campaign.subject, campaign.from_name, campaign.from_email,
      campaign.reply_to, campaign.body_html, campaign.body_text, campaign.list_ids,
      campaign.send_rate_per_minute, campaign.notes
    ).run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// TEMPLATES — CRUD
// ============================================================
emailOutreachRoutes.get('/templates', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const templates = await c.env.DB.prepare('SELECT * FROM email_templates ORDER BY created_at DESC').all()
    return c.json({ templates: templates.results })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

emailOutreachRoutes.post('/templates', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const { name, subject, body_html, body_text, category } = await c.req.json()
    if (!name || !subject || !body_html) return c.json({ error: 'name, subject, and body_html required' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO email_templates (name, subject, body_html, body_text, category) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, subject, body_html, body_text || '', category || 'marketing').run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

emailOutreachRoutes.delete('/templates/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    await c.env.DB.prepare('DELETE FROM email_templates WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// GLOBAL STATS — Overview for dashboard
// ============================================================
emailOutreachRoutes.get('/stats', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM email_lists) as total_lists,
        (SELECT COUNT(*) FROM email_contacts) as total_contacts,
        (SELECT COUNT(*) FROM email_contacts WHERE status = 'active') as active_contacts,
        (SELECT COUNT(DISTINCT email) FROM email_contacts WHERE status = 'active') as unique_active_emails,
        (SELECT COUNT(*) FROM email_campaigns) as total_campaigns,
        (SELECT COUNT(*) FROM email_campaigns WHERE status = 'completed') as completed_campaigns,
        (SELECT COUNT(*) FROM email_campaigns WHERE status = 'draft') as draft_campaigns,
        (SELECT COALESCE(SUM(sent_count), 0) FROM email_campaigns) as total_emails_sent,
        (SELECT COALESCE(SUM(open_count), 0) FROM email_campaigns) as total_opens,
        (SELECT COALESCE(SUM(click_count), 0) FROM email_campaigns) as total_clicks,
        (SELECT COUNT(*) FROM email_templates) as total_templates
    `).first()

    return c.json(stats)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// DE-DUPLICATION — Find & remove duplicate emails across lists
// ============================================================
emailOutreachRoutes.get('/dedup/preview', async (c) => {
  await ensureTables(c.env.DB)
  try {
    const dupes = await c.env.DB.prepare(`
      SELECT email, COUNT(*) as count,
        GROUP_CONCAT(DISTINCT list_id) as list_ids,
        GROUP_CONCAT(id) as contact_ids
      FROM email_contacts
      WHERE status = 'active'
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 500
    `).all()

    const totalDupes = dupes.results?.reduce((sum: number, d: any) => sum + (d.count - 1), 0) || 0

    return c.json({
      duplicates: dupes.results,
      total_duplicate_entries: totalDupes,
      unique_duplicate_emails: dupes.results?.length || 0
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

emailOutreachRoutes.post('/dedup/clean', async (c) => {
  await ensureTables(c.env.DB)
  try {
    // Keep oldest entry for each email, delete duplicates
    const result = await c.env.DB.prepare(`
      DELETE FROM email_contacts
      WHERE id NOT IN (
        SELECT MIN(id) FROM email_contacts
        GROUP BY LOWER(email)
      )
    `).run()

    // Refresh all list counts
    await c.env.DB.prepare(`
      UPDATE email_lists SET
        contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = email_lists.id),
        updated_at = datetime('now')
    `).run()

    return c.json({ success: true, removed: result.meta.changes || 0 })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// CSV FILE UPLOAD — Parse uploaded CSV file
// ============================================================
emailOutreachRoutes.post('/lists/:id/upload-csv', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const formData = await c.req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'CSV file is required' }, 400)
    }

    const text = await file.text()
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l)
    if (lines.length < 2) return c.json({ error: 'CSV must have header + at least 1 row' }, 400)

    // Parse header — support common separators
    const sep = lines[0].includes('\t') ? '\t' : ','
    const header = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/^"|"$/g, ''))

    const emailIdx = header.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email_address')
    if (emailIdx === -1) return c.json({ error: 'CSV must have an "email" column' }, 400)

    const fieldMap: Record<string, number> = {
      company_name: header.findIndex(h => h.includes('company') || h.includes('business')),
      contact_name: header.findIndex(h => h === 'name' || h === 'contact_name' || h === 'contact' || h === 'full_name'),
      phone: header.findIndex(h => h.includes('phone') || h.includes('tel')),
      city: header.findIndex(h => h === 'city' || h === 'town'),
      province: header.findIndex(h => h === 'province' || h === 'state' || h === 'prov'),
      website: header.findIndex(h => h.includes('website') || h.includes('url') || h.includes('web'))
    }

    let imported = 0, skipped = 0, errors = 0

    for (let i = 1; i < lines.length; i++) {
      // Handle quoted CSV fields
      const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
      const email = (cols[emailIdx] || '').toLowerCase().trim()
      if (!email || !email.includes('@')) { skipped++; continue }

      try {
        const params: any[] = [
          listId, email,
          fieldMap.company_name >= 0 ? cols[fieldMap.company_name] || '' : '',
          fieldMap.contact_name >= 0 ? cols[fieldMap.contact_name] || '' : '',
          fieldMap.phone >= 0 ? cols[fieldMap.phone] || '' : '',
          fieldMap.city >= 0 ? cols[fieldMap.city] || '' : '',
          fieldMap.province >= 0 ? cols[fieldMap.province] || '' : '',
          fieldMap.website >= 0 ? cols[fieldMap.website] || '' : '',
          'csv_upload'
        ]
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO email_contacts (list_id, email, company_name, contact_name, phone, city, province, website, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(...params).run()
        imported++
      } catch { errors++ }
    }

    await c.env.DB.prepare("UPDATE email_lists SET contact_count = (SELECT COUNT(*) FROM email_contacts WHERE list_id = ?), updated_at = datetime('now') WHERE id = ?").bind(listId, listId).run()

    return c.json({ success: true, imported, skipped, errors, total: lines.length - 1, filename: file.name })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// UNSUBSCRIBE — Public endpoint (no auth required)
// ============================================================
emailOutreachRoutes.get('/unsubscribe/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase().trim()
  try {
    await ensureTables(c.env.DB)
    await c.env.DB.prepare(
      "UPDATE email_contacts SET status = 'unsubscribed', updated_at = datetime('now') WHERE LOWER(email) = ?"
    ).bind(email).run()
  } catch {}

  return c.html(`<!DOCTYPE html>
<html><head><title>Unsubscribed</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f9fafb;margin:0}
.card{background:#fff;border-radius:16px;padding:48px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
h1{color:#111;font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:14px;line-height:1.6}
.check{width:64px;height:64px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px}</style>
</head><body><div class="card"><div class="check">✓</div><h1>You've been unsubscribed</h1>
<p><strong>${email}</strong> has been removed from our mailing list.</p>
<p>You will no longer receive marketing emails from RoofReporterAI.</p>
<p style="color:#9ca3af;font-size:12px;margin-top:24px">If this was a mistake, contact reports@reusecanada.ca</p>
</div></body></html>`)
})

// ============================================================
// CAMPAIGN ANALYTICS — Detailed deliverability stats
// ============================================================
emailOutreachRoutes.get('/analytics', async (c) => {
  await ensureTables(c.env.DB)
  try {
    // Campaign performance summary
    const campaigns = await c.env.DB.prepare(`
      SELECT
        ec.id, ec.name, ec.subject, ec.status, ec.created_at, ec.completed_at,
        ec.total_recipients, ec.sent_count, ec.failed_count, ec.open_count, ec.click_count,
        ec.bounce_count, ec.unsubscribe_count,
        CASE WHEN ec.sent_count > 0 THEN ROUND(CAST(ec.open_count AS REAL) / ec.sent_count * 100, 1) ELSE 0 END as open_rate,
        CASE WHEN ec.sent_count > 0 THEN ROUND(CAST(ec.click_count AS REAL) / ec.sent_count * 100, 1) ELSE 0 END as click_rate,
        CASE WHEN ec.sent_count > 0 THEN ROUND(CAST(ec.bounce_count AS REAL) / ec.sent_count * 100, 1) ELSE 0 END as bounce_rate
      FROM email_campaigns ec
      WHERE ec.status IN ('completed', 'sending')
      ORDER BY ec.completed_at DESC
      LIMIT 20
    `).all()

    // Overall metrics
    const overall = await c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(open_count), 0) as total_opens,
        COALESCE(SUM(click_count), 0) as total_clicks,
        COALESCE(SUM(bounce_count), 0) as total_bounces,
        COALESCE(SUM(unsubscribe_count), 0) as total_unsubs,
        CASE WHEN SUM(sent_count) > 0 THEN ROUND(CAST(SUM(open_count) AS REAL) / SUM(sent_count) * 100, 1) ELSE 0 END as avg_open_rate,
        CASE WHEN SUM(sent_count) > 0 THEN ROUND(CAST(SUM(click_count) AS REAL) / SUM(sent_count) * 100, 1) ELSE 0 END as avg_click_rate,
        CASE WHEN SUM(sent_count) > 0 THEN ROUND(CAST(SUM(bounce_count) AS REAL) / SUM(sent_count) * 100, 1) ELSE 0 END as avg_bounce_rate
      FROM email_campaigns WHERE status IN ('completed', 'sending')
    `).first()

    // Recent send activity (last 30 days grouped by date)
    const dailyActivity = await c.env.DB.prepare(`
      SELECT DATE(sent_at) as day,
        COUNT(*) as sent,
        SUM(CASE WHEN status IN ('sent','delivered','opened','clicked') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status IN ('opened','clicked') THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM email_send_log
      WHERE sent_at >= datetime('now', '-30 days')
      GROUP BY DATE(sent_at)
      ORDER BY day DESC
    `).all()

    // Top bounced contacts
    const topBounced = await c.env.DB.prepare(`
      SELECT email, company_name, bounce_count, sends_count, status
      FROM email_contacts
      WHERE bounce_count > 0
      ORDER BY bounce_count DESC
      LIMIT 20
    `).all()

    return c.json({
      campaigns: campaigns.results,
      overall,
      daily_activity: dailyActivity.results,
      top_bounced: topBounced.results
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// SCHEDULE CAMPAIGN — Set future send time
// ============================================================
emailOutreachRoutes.put('/campaigns/:id/schedule', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const { scheduled_at } = await c.req.json()

    const campaign = await c.env.DB.prepare('SELECT status FROM email_campaigns WHERE id = ?').bind(id).first<any>()
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404)
    if (!['draft', 'scheduled'].includes(campaign.status)) return c.json({ error: 'Can only schedule draft or scheduled campaigns' }, 400)

    if (scheduled_at) {
      await c.env.DB.prepare(`
        UPDATE email_campaigns SET status = 'scheduled', scheduled_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(scheduled_at, id).run()
      return c.json({ success: true, status: 'scheduled', scheduled_at })
    } else {
      // Cancel scheduling — revert to draft
      await c.env.DB.prepare(`
        UPDATE email_campaigns SET status = 'draft', scheduled_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run()
      return c.json({ success: true, status: 'draft' })
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// EDIT CONTACT — Update contact details
// ============================================================
emailOutreachRoutes.put('/contacts/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const { email, company_name, contact_name, phone, city, province, website, status, notes, tags } = await c.req.json()

    const fields: string[] = []
    const values: any[] = []
    if (email !== undefined) { fields.push('email = ?'); values.push(email.toLowerCase().trim()) }
    if (company_name !== undefined) { fields.push('company_name = ?'); values.push(company_name) }
    if (contact_name !== undefined) { fields.push('contact_name = ?'); values.push(contact_name) }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone) }
    if (city !== undefined) { fields.push('city = ?'); values.push(city) }
    if (province !== undefined) { fields.push('province = ?'); values.push(province) }
    if (website !== undefined) { fields.push('website = ?'); values.push(website) }
    if (status !== undefined) { fields.push('status = ?'); values.push(status) }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(tags) }

    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

    fields.push("updated_at = datetime('now')")
    values.push(id)

    await c.env.DB.prepare(`UPDATE email_contacts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// EXPORT CONTACTS — Download contacts as CSV
// ============================================================
emailOutreachRoutes.get('/lists/:id/export', async (c) => {
  try {
    const listId = parseInt(c.req.param('id'))
    const list = await c.env.DB.prepare('SELECT name FROM email_lists WHERE id = ?').bind(listId).first<any>()
    const contacts = await c.env.DB.prepare(`
      SELECT email, company_name, contact_name, phone, city, province, website, status, sends_count, opens_count, clicks_count, source, created_at
      FROM email_contacts WHERE list_id = ? ORDER BY email
    `).bind(listId).all()

    const header = 'email,company_name,contact_name,phone,city,province,website,status,sends,opens,clicks,source,created_at'
    const rows = (contacts.results || []).map((c: any) =>
      [c.email, c.company_name, c.contact_name, c.phone, c.city, c.province, c.website, c.status, c.sends_count, c.opens_count, c.clicks_count, c.source, c.created_at]
        .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [header, ...rows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${(list?.name || 'contacts').replace(/[^a-zA-Z0-9]/g, '_')}_export.csv"`
      }
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})
