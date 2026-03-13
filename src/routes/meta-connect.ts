// ============================================================
// RoofReporterAI — Meta Connect (Facebook/Instagram Integration)
// Super Admin only — mass group posting, Meta Ads, scheduling
// ALL operations chunked to avoid Cloudflare Workers timeout
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession, requireSuperadmin } from './auth'

export const metaConnectRoutes = new Hono<{ Bindings: Bindings }>()

const META_GRAPH_API = 'https://graph.facebook.com/v21.0'

// ── Superadmin auth guard ──
// Uses admin_sessions + admin_users.role (NOT customer_sessions)
// The customers table does not have a 'role' column — admin_users does.
async function requireSuperAdmin(c: any): Promise<boolean> {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  return requireSuperadmin(admin)
}

metaConnectRoutes.use('/*', async (c, next) => {
  const ok = await requireSuperAdmin(c)
  if (!ok) return c.json({ error: 'Superadmin access required' }, 403)
  return next()
})

// ── Helper: call Meta Graph API ──
async function graphAPI(accessToken: string, path: string, method = 'GET', body?: any): Promise<any> {
  const url = path.startsWith('http') ? path : `${META_GRAPH_API}${path}`
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?'
    const fetchUrl = `${url}${separator}access_token=${accessToken}`
    const res = await fetch(fetchUrl)
    return res.json()
  } else {
    if (body) {
      body.access_token = accessToken
      opts.body = JSON.stringify(body)
    }
    const res = await fetch(url, opts)
    return res.json()
  }
}

// ============================================================
// OAUTH — Save Facebook access token (client-side FB Login SDK)
// The frontend uses FB.login() and sends us the token
// ============================================================
metaConnectRoutes.post('/auth/save-token', async (c) => {
  const { access_token, fb_user_id } = await c.req.json()
  if (!access_token) return c.json({ error: 'access_token required' }, 400)

  try {
    // Exchange short-lived token for long-lived token
    const appId = (c.env as any).META_APP_ID || ''
    const appSecret = (c.env as any).META_APP_SECRET || ''

    let longToken = access_token
    let expiresAt = null

    if (appId && appSecret) {
      const exchangeRes = await fetch(
        `${META_GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${access_token}`
      )
      const exchangeData = await exchangeRes.json() as any
      if (exchangeData.access_token) {
        longToken = exchangeData.access_token
        if (exchangeData.expires_in) {
          const exp = new Date(Date.now() + exchangeData.expires_in * 1000)
          expiresAt = exp.toISOString()
        }
      }
    }

    // Get user profile
    const me = await graphAPI(longToken, '/me?fields=id,name,picture.width(200)')
    const userId = me.id || fb_user_id || 'unknown'
    const userName = me.name || ''
    const pictureUrl = me.picture?.data?.url || ''

    // Check for granted permissions
    const permsRes = await graphAPI(longToken, '/me/permissions')
    const scopes = (permsRes.data || [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission)
      .join(',')

    // Upsert account
    const existing = await c.env.DB.prepare(
      'SELECT id FROM meta_accounts WHERE fb_user_id = ?'
    ).bind(userId).first<any>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE meta_accounts SET access_token=?, fb_user_name=?, profile_picture_url=?, scopes=?, token_expires_at=?, status='active', updated_at=datetime('now') WHERE id=?`
      ).bind(longToken, userName, pictureUrl, scopes, expiresAt, existing.id).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO meta_accounts (fb_user_id, fb_user_name, access_token, scopes, token_expires_at, profile_picture_url) VALUES (?,?,?,?,?,?)`
      ).bind(userId, userName, longToken, scopes, expiresAt, pictureUrl).run()
    }

    return c.json({ success: true, user_id: userId, name: userName, scopes, picture: pictureUrl })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ACCOUNT STATUS
// ============================================================
metaConnectRoutes.get('/account', async (c) => {
  const acct = await c.env.DB.prepare(
    "SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1"
  ).first<any>()
  if (!acct) return c.json({ connected: false })

  // Quick validation — test if token still works
  let valid = true
  try {
    const me = await graphAPI(acct.access_token, '/me?fields=id,name')
    if (me.error) valid = false
  } catch { valid = false }

  if (!valid) {
    await c.env.DB.prepare("UPDATE meta_accounts SET status='expired' WHERE id=?").bind(acct.id).run()
    return c.json({ connected: false, expired: true })
  }

  return c.json({
    connected: true,
    account: {
      id: acct.id, fb_user_id: acct.fb_user_id, name: acct.fb_user_name,
      picture: acct.profile_picture_url, scopes: acct.scopes,
      expires_at: acct.token_expires_at, connected_at: acct.created_at,
    }
  })
})

metaConnectRoutes.post('/disconnect', async (c) => {
  await c.env.DB.prepare("UPDATE meta_accounts SET status='revoked', updated_at=datetime('now')").run()
  return c.json({ success: true })
})

// ============================================================
// SYNC GROUPS — Fetch user's groups from Graph API (chunked)
// ============================================================
metaConnectRoutes.post('/sync-groups', async (c) => {
  const acct = await c.env.DB.prepare("SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  try {
    const res = await graphAPI(acct.access_token, '/me/groups?fields=id,name,member_count,privacy,administrator&limit=100')
    const groups = res.data || []

    let synced = 0
    for (const g of groups) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM meta_groups WHERE meta_account_id=? AND fb_group_id=?'
      ).bind(acct.id, g.id).first<any>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE meta_groups SET group_name=?, member_count=?, privacy=?, is_admin=?, last_synced_at=datetime('now') WHERE id=?`
        ).bind(g.name, g.member_count || 0, g.privacy || 'CLOSED', g.administrator ? 1 : 0, existing.id).run()
      } else {
        await c.env.DB.prepare(
          `INSERT INTO meta_groups (meta_account_id, fb_group_id, group_name, member_count, privacy, is_admin, last_synced_at) VALUES (?,?,?,?,?,?,datetime('now'))`
        ).bind(acct.id, g.id, g.name, g.member_count || 0, g.privacy || 'CLOSED', g.administrator ? 1 : 0).run()
      }
      synced++
    }

    return c.json({ success: true, synced, total: groups.length, has_next: !!res.paging?.next })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

metaConnectRoutes.get('/groups', async (c) => {
  const acct = await c.env.DB.prepare("SELECT id FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ groups: [] })
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM meta_groups WHERE meta_account_id=? ORDER BY member_count DESC'
  ).bind(acct.id).all<any>()
  return c.json({ groups: results })
})

metaConnectRoutes.put('/groups/:id/toggle', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { enabled } = await c.req.json()
  await c.env.DB.prepare('UPDATE meta_groups SET enabled=? WHERE id=?').bind(enabled ? 1 : 0, id).run()
  return c.json({ success: true })
})

// ============================================================
// SYNC PAGES — Fetch user's managed pages
// ============================================================
metaConnectRoutes.post('/sync-pages', async (c) => {
  const acct = await c.env.DB.prepare("SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  try {
    const res = await graphAPI(acct.access_token, '/me/accounts?fields=id,name,access_token,category,followers_count,is_published&limit=100')
    const pages = res.data || []

    let synced = 0
    for (const p of pages) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM meta_pages WHERE meta_account_id=? AND fb_page_id=?'
      ).bind(acct.id, p.id).first<any>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE meta_pages SET page_name=?, page_access_token=?, category=?, followers_count=?, is_published=?, last_synced_at=datetime('now') WHERE id=?`
        ).bind(p.name, p.access_token || '', p.category || '', p.followers_count || 0, p.is_published ? 1 : 0, existing.id).run()
      } else {
        await c.env.DB.prepare(
          `INSERT INTO meta_pages (meta_account_id, fb_page_id, page_name, page_access_token, category, followers_count, is_published, last_synced_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`
        ).bind(acct.id, p.id, p.name, p.access_token || '', p.category || '', p.followers_count || 0, p.is_published ? 1 : 0).run()
      }
      synced++
    }

    return c.json({ success: true, synced })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

metaConnectRoutes.get('/pages', async (c) => {
  const acct = await c.env.DB.prepare("SELECT id FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ pages: [] })
  const { results } = await c.env.DB.prepare('SELECT * FROM meta_pages WHERE meta_account_id=? ORDER BY followers_count DESC').bind(acct.id).all<any>()
  return c.json({ pages: results })
})

// ============================================================
// POST CAMPAIGNS — Mass group posting (CHUNKED!)
// Frontend calls /post-chunk repeatedly to post in batches
// ============================================================
metaConnectRoutes.get('/post-campaigns', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM meta_post_campaigns ORDER BY created_at DESC').all<any>()
  return c.json({ campaigns: results })
})

metaConnectRoutes.post('/post-campaigns', async (c) => {
  const { name, message_template, image_url, link_url, group_ids } = await c.req.json()
  if (!name || !message_template) return c.json({ error: 'name and message required' }, 400)

  const targetGroups = group_ids || []
  const res = await c.env.DB.prepare(
    `INSERT INTO meta_post_campaigns (name, message_template, image_url, link_url, target_groups, total_groups, status) VALUES (?,?,?,?,?,?,?)`
  ).bind(name, message_template, image_url || '', link_url || '', JSON.stringify(targetGroups), targetGroups.length, 'draft').run()

  const campaignId = res.meta.last_row_id as number

  // Pre-create log entries for each group
  for (const gid of targetGroups) {
    const group = await c.env.DB.prepare('SELECT group_name FROM meta_groups WHERE fb_group_id=?').bind(gid).first<any>()
    await c.env.DB.prepare(
      `INSERT INTO meta_post_logs (campaign_id, fb_group_id, group_name, status) VALUES (?,?,?,?)`
    ).bind(campaignId, gid, group?.group_name || '', 'pending').run()
  }

  return c.json({ success: true, id: campaignId, total_groups: targetGroups.length })
})

// CHUNKED POSTING — Post to N groups per request (default 3)
// Frontend keeps calling this until done. Avoids Worker timeout.
metaConnectRoutes.post('/post-chunk', async (c) => {
  const { campaign_id, batch_size } = await c.req.json()
  if (!campaign_id) return c.json({ error: 'campaign_id required' }, 400)

  const campaign = await c.env.DB.prepare('SELECT * FROM meta_post_campaigns WHERE id=?').bind(campaign_id).first<any>()
  if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

  const acct = await c.env.DB.prepare("SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected Meta account' }, 400)

  // Get next batch of pending posts
  const limit = Math.min(batch_size || 3, 5) // Max 5 per chunk to stay under timeout
  const { results: pendingPosts } = await c.env.DB.prepare(
    `SELECT * FROM meta_post_logs WHERE campaign_id=? AND status='pending' ORDER BY id ASC LIMIT ?`
  ).bind(campaign_id, limit).all<any>()

  if (!pendingPosts || pendingPosts.length === 0) {
    // All done — mark campaign complete
    await c.env.DB.prepare(
      `UPDATE meta_post_campaigns SET status='completed', updated_at=datetime('now') WHERE id=?`
    ).bind(campaign_id).run()
    return c.json({ done: true, posted: campaign.posted_count, failed: campaign.failed_count })
  }

  // Update campaign to running
  if (campaign.status !== 'running') {
    await c.env.DB.prepare("UPDATE meta_post_campaigns SET status='running', updated_at=datetime('now') WHERE id=?").bind(campaign_id).run()
  }

  let posted = 0
  let failed = 0
  const results: any[] = []

  for (const log of pendingPosts) {
    try {
      const postData: any = { message: campaign.message_template }
      if (campaign.link_url) postData.link = campaign.link_url

      const res = await graphAPI(acct.access_token, `/${log.fb_group_id}/feed`, 'POST', postData)

      if (res.id) {
        await c.env.DB.prepare(
          `UPDATE meta_post_logs SET status='posted', fb_post_id=?, posted_at=datetime('now') WHERE id=?`
        ).bind(res.id, log.id).run()
        posted++
        results.push({ group: log.group_name, status: 'posted', post_id: res.id })
      } else {
        const errMsg = res.error?.message || 'Unknown error'
        await c.env.DB.prepare(
          `UPDATE meta_post_logs SET status='failed', error_message=? WHERE id=?`
        ).bind(errMsg, log.id).run()
        failed++
        results.push({ group: log.group_name, status: 'failed', error: errMsg })
      }
    } catch (e: any) {
      await c.env.DB.prepare(
        `UPDATE meta_post_logs SET status='failed', error_message=? WHERE id=?`
      ).bind(e.message, log.id).run()
      failed++
      results.push({ group: log.group_name, status: 'failed', error: e.message })
    }
  }

  // Update campaign counters
  await c.env.DB.prepare(
    `UPDATE meta_post_campaigns SET posted_count=posted_count+?, failed_count=failed_count+?, current_index=current_index+?, updated_at=datetime('now') WHERE id=?`
  ).bind(posted, failed, pendingPosts.length, campaign_id).run()

  // Check if more remain
  const remaining = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM meta_post_logs WHERE campaign_id=? AND status='pending'`
  ).bind(campaign_id).first<any>()

  return c.json({
    done: (remaining?.cnt || 0) === 0,
    batch_posted: posted,
    batch_failed: failed,
    remaining: remaining?.cnt || 0,
    results,
  })
})

metaConnectRoutes.get('/post-campaigns/:id/logs', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM meta_post_logs WHERE campaign_id=? ORDER BY id ASC'
  ).bind(id).all<any>()
  return c.json({ logs: results })
})

metaConnectRoutes.delete('/post-campaigns/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM meta_post_logs WHERE campaign_id=?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM meta_post_campaigns WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// META ADS — Campaign management (CRUD + sync from Meta)
// ============================================================
metaConnectRoutes.get('/ads', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM meta_ad_campaigns ORDER BY created_at DESC').all<any>()
  return c.json({ campaigns: results })
})

metaConnectRoutes.post('/ads', async (c) => {
  const body = await c.req.json()
  const { name, objective, daily_budget, lifetime_budget, currency, target_audience, ad_creative, start_date, end_date } = body
  if (!name) return c.json({ error: 'Campaign name required' }, 400)

  const acct = await c.env.DB.prepare("SELECT id FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected Meta account' }, 400)

  const res = await c.env.DB.prepare(
    `INSERT INTO meta_ad_campaigns (meta_account_id, name, objective, daily_budget_cents, lifetime_budget_cents, currency, target_audience, ad_creative, start_date, end_date) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    acct.id, name, objective || 'OUTCOME_LEADS',
    Math.round((daily_budget || 0) * 100), Math.round((lifetime_budget || 0) * 100),
    currency || 'CAD', JSON.stringify(target_audience || {}), JSON.stringify(ad_creative || {}),
    start_date || null, end_date || null
  ).run()

  return c.json({ success: true, id: res.meta.last_row_id })
})

metaConnectRoutes.put('/ads/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const allowed = ['name', 'objective', 'status', 'start_date', 'end_date', 'currency']
  const fields: string[] = []
  const values: any[] = []

  for (const [key, val] of Object.entries(body)) {
    if (allowed.includes(key)) { fields.push(`${key}=?`); values.push(val) }
    if (key === 'daily_budget') { fields.push('daily_budget_cents=?'); values.push(Math.round((val as number) * 100)) }
    if (key === 'lifetime_budget') { fields.push('lifetime_budget_cents=?'); values.push(Math.round((val as number) * 100)) }
    if (key === 'target_audience') { fields.push('target_audience=?'); values.push(JSON.stringify(val)) }
    if (key === 'ad_creative') { fields.push('ad_creative=?'); values.push(JSON.stringify(val)) }
  }
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400)
  fields.push("updated_at=datetime('now')")
  values.push(id)

  await c.env.DB.prepare(`UPDATE meta_ad_campaigns SET ${fields.join(',')} WHERE id=?`).bind(...values).run()
  return c.json({ success: true })
})

metaConnectRoutes.delete('/ads/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM meta_ad_campaigns WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// Push ad campaign to Meta Ads API (chunked — create campaign first, then ad set, then ad)
metaConnectRoutes.post('/ads/:id/publish', async (c) => {
  const id = parseInt(c.req.param('id'))
  const campaign = await c.env.DB.prepare('SELECT * FROM meta_ad_campaigns WHERE id=?').bind(id).first<any>()
  if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

  const acct = await c.env.DB.prepare('SELECT * FROM meta_accounts WHERE id=?').bind(campaign.meta_account_id).first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  const adAccountId = (c.env as any).META_AD_ACCOUNT_ID
  if (!adAccountId) return c.json({ error: 'META_AD_ACCOUNT_ID not configured' }, 500)

  try {
    // Step 1: Create campaign on Meta
    const campRes = await graphAPI(acct.access_token, `/act_${adAccountId}/campaigns`, 'POST', {
      name: campaign.name,
      objective: campaign.objective,
      status: 'PAUSED',
      special_ad_categories: [],
    })

    if (campRes.error) return c.json({ error: campRes.error.message }, 400)

    await c.env.DB.prepare(
      `UPDATE meta_ad_campaigns SET fb_campaign_id=?, fb_ad_account_id=?, status='active', updated_at=datetime('now') WHERE id=?`
    ).bind(campRes.id, adAccountId, id).run()

    return c.json({ success: true, fb_campaign_id: campRes.id, message: 'Campaign created on Meta (paused). Configure ad set and creative in Meta Ads Manager.' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Sync ad performance metrics from Meta
metaConnectRoutes.post('/ads/:id/sync', async (c) => {
  const id = parseInt(c.req.param('id'))
  const campaign = await c.env.DB.prepare('SELECT * FROM meta_ad_campaigns WHERE id=?').bind(id).first<any>()
  if (!campaign?.fb_campaign_id) return c.json({ error: 'Not published to Meta yet' }, 400)

  const acct = await c.env.DB.prepare('SELECT * FROM meta_accounts WHERE id=?').bind(campaign.meta_account_id).first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  try {
    const insights = await graphAPI(acct.access_token, `/${campaign.fb_campaign_id}/insights?fields=impressions,clicks,spend,actions,ctr&date_preset=maximum`)
    const data = insights.data?.[0] || {}

    const leads = (data.actions || []).find((a: any) => a.action_type === 'lead')?.value || 0
    const spend = Math.round(parseFloat(data.spend || '0') * 100)

    await c.env.DB.prepare(
      `UPDATE meta_ad_campaigns SET impressions=?, clicks=?, spend_cents=?, leads=?, ctr=?, cpl_cents=?, last_synced_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(
      parseInt(data.impressions || '0'), parseInt(data.clicks || '0'),
      spend, parseInt(leads), parseFloat(data.ctr || '0'),
      leads > 0 ? Math.round(spend / parseInt(leads)) : 0, id
    ).run()

    return c.json({ success: true, impressions: data.impressions, clicks: data.clicks, spend: data.spend })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// SCHEDULED POSTS
// ============================================================
metaConnectRoutes.get('/scheduled', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM meta_scheduled_posts ORDER BY schedule_at ASC"
  ).all<any>()
  return c.json({ posts: results })
})

metaConnectRoutes.post('/scheduled', async (c) => {
  const { target_type, target_id, target_name, message, image_url, link_url, schedule_at, recurrence } = await c.req.json()
  if (!target_id || !message || !schedule_at) return c.json({ error: 'target_id, message, schedule_at required' }, 400)

  const acct = await c.env.DB.prepare("SELECT id FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  const res = await c.env.DB.prepare(
    `INSERT INTO meta_scheduled_posts (meta_account_id, target_type, target_id, target_name, message, image_url, link_url, schedule_at, recurrence) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(acct.id, target_type || 'group', target_id, target_name || '', message, image_url || '', link_url || '', schedule_at, recurrence || 'once').run()

  return c.json({ success: true, id: res.meta.last_row_id })
})

metaConnectRoutes.delete('/scheduled/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare("UPDATE meta_scheduled_posts SET status='cancelled' WHERE id=?").bind(id).run()
  return c.json({ success: true })
})

// Execute due scheduled posts (called by cron or manually)
metaConnectRoutes.post('/scheduled/execute', async (c) => {
  const acct = await c.env.DB.prepare("SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>()
  if (!acct) return c.json({ error: 'No connected account' }, 400)

  const { results: duePosts } = await c.env.DB.prepare(
    `SELECT * FROM meta_scheduled_posts WHERE status='scheduled' AND schedule_at <= datetime('now') ORDER BY schedule_at ASC LIMIT 3`
  ).all<any>()

  let posted = 0
  let failed = 0

  for (const post of (duePosts || [])) {
    try {
      const endpoint = post.target_type === 'page' ? `/${post.target_id}/feed` : `/${post.target_id}/feed`
      const postData: any = { message: post.message }
      if (post.link_url) postData.link = post.link_url

      const token = post.target_type === 'page'
        ? ((await c.env.DB.prepare('SELECT page_access_token FROM meta_pages WHERE fb_page_id=?').bind(post.target_id).first<any>())?.page_access_token || acct.access_token)
        : acct.access_token

      const res = await graphAPI(token, endpoint, 'POST', postData)

      if (res.id) {
        await c.env.DB.prepare(
          `UPDATE meta_scheduled_posts SET status='posted', fb_post_id=?, posted_at=datetime('now') WHERE id=?`
        ).bind(res.id, post.id).run()
        posted++

        // Handle recurrence
        if (post.recurrence !== 'once') {
          const nextDate = new Date(post.schedule_at)
          if (post.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1)
          else if (post.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
          else if (post.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1)

          await c.env.DB.prepare(
            `INSERT INTO meta_scheduled_posts (meta_account_id, target_type, target_id, target_name, message, image_url, link_url, schedule_at, recurrence) VALUES (?,?,?,?,?,?,?,?,?)`
          ).bind(acct.id, post.target_type, post.target_id, post.target_name, post.message, post.image_url, post.link_url, nextDate.toISOString(), post.recurrence).run()
        }
      } else {
        await c.env.DB.prepare(
          `UPDATE meta_scheduled_posts SET status='failed', error_message=? WHERE id=?`
        ).bind(res.error?.message || 'Unknown error', post.id).run()
        failed++
      }
    } catch (e: any) {
      await c.env.DB.prepare(
        `UPDATE meta_scheduled_posts SET status='failed', error_message=? WHERE id=?`
      ).bind(e.message, post.id).run()
      failed++
    }
  }

  return c.json({ success: true, posted, failed, processed: duePosts?.length || 0 })
})

// ============================================================
// DASHBOARD STATS
// ============================================================
metaConnectRoutes.get('/dashboard', async (c) => {
  const [acct, groups, pages, postCampaigns, adCampaigns, scheduled] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM meta_accounts WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) as enabled FROM meta_groups").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM meta_pages").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt, SUM(posted_count) as posted, SUM(failed_count) as failed FROM meta_post_campaigns").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt, SUM(impressions) as impr, SUM(clicks) as clicks, SUM(spend_cents) as spend, SUM(leads) as leads FROM meta_ad_campaigns").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt, SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) as pending FROM meta_scheduled_posts").first<any>(),
  ])

  return c.json({
    connected: !!acct,
    account: acct ? { name: acct.fb_user_name, picture: acct.profile_picture_url } : null,
    groups: { total: groups?.cnt || 0, enabled: groups?.enabled || 0 },
    pages: { total: pages?.cnt || 0 },
    post_campaigns: { total: postCampaigns?.cnt || 0, total_posted: postCampaigns?.posted || 0, total_failed: postCampaigns?.failed || 0 },
    ads: { total: adCampaigns?.cnt || 0, impressions: adCampaigns?.impr || 0, clicks: adCampaigns?.clicks || 0, spend_cents: adCampaigns?.spend || 0, leads: adCampaigns?.leads || 0 },
    scheduled: { total: scheduled?.cnt || 0, pending: scheduled?.pending || 0 },
  })
})
