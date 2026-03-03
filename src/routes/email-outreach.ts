import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession, requireSuperadmin } from './auth'

export const emailOutreachRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Superadmin only
// ============================================================
emailOutreachRoutes.use('/*', async (c, next) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
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
