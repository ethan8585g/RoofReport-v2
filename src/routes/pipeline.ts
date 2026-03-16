// ============================================================
// RoofReporterAI — Revenue Pipeline, Notifications, Follow-ups, Payments
// ============================================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession } from './auth'

export const pipelineRoutes = new Hono<{ Bindings: Bindings }>()

// Admin auth middleware
pipelineRoutes.use('/*', async (c, next) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin authentication required' }, 401)
  c.set('admin' as any, admin)
  return next()
})

// ============================================================
// NOTIFICATIONS — Bell icon + notification feed
// ============================================================
pipelineRoutes.get('/notifications', async (c) => {
  try {
    const admin = c.get('admin' as any) as any
    const unreadOnly = c.req.query('unread') === '1'
    let q = 'SELECT * FROM notifications WHERE owner_id = ?'
    if (unreadOnly) q += ' AND is_read = 0'
    q += ' ORDER BY created_at DESC LIMIT 50'
    const notifs = await c.env.DB.prepare(q).bind(admin.id).all()
    const unreadCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM notifications WHERE owner_id = ? AND is_read = 0'
    ).bind(admin.id).first<any>()
    return c.json({ notifications: notifs.results, unread_count: unreadCount?.cnt || 0 })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

pipelineRoutes.post('/notifications/:id/read', async (c) => {
  const id = c.req.param('id')
  const admin = c.get('admin' as any) as any
  if (id === 'all') {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE owner_id = ?").bind(admin.id).run()
  } else {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND owner_id = ?").bind(id, admin.id).run()
  }
  return c.json({ success: true })
})

// ============================================================
// REVENUE PIPELINE ANALYTICS
// ============================================================
pipelineRoutes.get('/revenue-analytics', async (c) => {
  try {
    const period = c.req.query('period') || '30d'
    let dateFilter = "datetime('now', '-30 days')"
    if (period === '7d') dateFilter = "datetime('now', '-7 days')"
    if (period === '90d') dateFilter = "datetime('now', '-90 days')"
    if (period === '365d') dateFilter = "datetime('now', '-365 days')"

    // Proposals stats
    const proposalStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_proposals,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'viewed' THEN 1 ELSE 0 END) as viewed,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as accepted_value,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total_amount ELSE 0 END) as pending_value,
        SUM(total_amount) as total_value,
        AVG(CASE WHEN status = 'accepted' THEN total_amount ELSE NULL END) as avg_deal_size
      FROM crm_proposals WHERE created_at >= ${dateFilter}
    `).first<any>()

    // Invoice stats
    const invoiceStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status IN ('sent','viewed') THEN 1 ELSE 0 END) as outstanding_count,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as collected,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total ELSE 0 END) as outstanding,
        SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as overdue_amount,
        SUM(total) as total_invoiced
      FROM invoices WHERE created_at >= ${dateFilter}
    `).first<any>()

    // Lead stats
    const leadStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
      FROM crm_customers WHERE created_at >= ${dateFilter}
    `).first<any>()

    // Conversion rate
    const totalProposals = proposalStats?.total_proposals || 1
    const acceptedProposals = proposalStats?.accepted || 0
    const conversionRate = Math.round((acceptedProposals / totalProposals) * 100)

    // Time-to-close (avg days from proposal sent → accepted)
    const ttc = await c.env.DB.prepare(`
      SELECT AVG(julianday(accepted_at) - julianday(sent_at)) as avg_days
      FROM crm_proposals WHERE status = 'accepted' AND accepted_at IS NOT NULL AND sent_at IS NOT NULL AND created_at >= ${dateFilter}
    `).first<any>()

    // Monthly revenue trend (last 6 months)
    const monthlyTrend = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as collected,
        SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as proposals_accepted,
        COUNT(*) as deal_count
      FROM (
        SELECT created_at, status, total, 0 as total_amount FROM invoices WHERE created_at >= datetime('now', '-6 months')
        UNION ALL
        SELECT created_at, status, 0 as total, total_amount FROM crm_proposals WHERE created_at >= datetime('now', '-6 months')
      ) combined
      GROUP BY month ORDER BY month
    `).all<any>()

    return c.json({
      period,
      proposals: proposalStats,
      invoices: invoiceStats,
      leads: leadStats,
      conversion_rate: conversionRate,
      avg_deal_size: proposalStats?.avg_deal_size || 0,
      avg_time_to_close_days: Math.round(ttc?.avg_days || 0),
      monthly_trend: monthlyTrend.results,
      pipeline_value: (proposalStats?.pending_value || 0) + (invoiceStats?.outstanding || 0),
    })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ============================================================
// WEBHOOKS — CRUD for webhook endpoints
// ============================================================
pipelineRoutes.get('/webhooks', async (c) => {
  const admin = c.get('admin' as any) as any
  const hooks = await c.env.DB.prepare('SELECT * FROM webhooks WHERE owner_id = ? ORDER BY created_at DESC').bind(admin.id).all()
  return c.json({ webhooks: hooks.results })
})

pipelineRoutes.post('/webhooks', async (c) => {
  const admin = c.get('admin' as any) as any
  const { event_type, url, secret } = await c.req.json()
  if (!event_type || !url) return c.json({ error: 'event_type and url required' }, 400)
  await c.env.DB.prepare(
    'INSERT INTO webhooks (owner_id, event_type, url, secret) VALUES (?, ?, ?, ?)'
  ).bind(admin.id, event_type, url, secret || '').run()
  return c.json({ success: true })
})

pipelineRoutes.delete('/webhooks/:id', async (c) => {
  const admin = c.get('admin' as any) as any
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), admin.id).run()
  return c.json({ success: true })
})

// ============================================================
// SCHEDULED FOLLOW-UPS — Check and trigger
// ============================================================
pipelineRoutes.get('/followups', async (c) => {
  const admin = c.get('admin' as any) as any
  const tasks = await c.env.DB.prepare(
    "SELECT * FROM scheduled_tasks WHERE owner_id = ? AND status = 'pending' ORDER BY scheduled_for ASC LIMIT 50"
  ).bind(admin.id).all()
  return c.json({ followups: tasks.results })
})

pipelineRoutes.post('/followups/check', async (c) => {
  // Check for due follow-ups and execute them
  try {
    const dueTasks = await c.env.DB.prepare(
      "SELECT st.*, cp.share_token, cp.proposal_number, cp.title as proposal_title, cp.total_amount, cc.name as customer_name, cc.email as customer_email FROM scheduled_tasks st LEFT JOIN crm_proposals cp ON st.target_type = 'proposal' AND cp.id = st.target_id LEFT JOIN crm_customers cc ON cp.crm_customer_id = cc.id WHERE st.status = 'pending' AND st.scheduled_for <= datetime('now') LIMIT 20"
    ).all<any>()

    let executed = 0
    for (const task of dueTasks.results || []) {
      if (task.task_type === 'proposal_followup') {
        // Create notification
        await c.env.DB.prepare(
          "INSERT INTO notifications (owner_id, type, title, message, link) VALUES (?, 'followup_due', ?, ?, ?)"
        ).bind(
          task.owner_id,
          `Follow-up due: ${task.proposal_title || 'Proposal'}`,
          `${task.customer_name} hasn't responded to proposal ${task.proposal_number} ($${task.total_amount}). Time to follow up!`,
          task.share_token ? `/proposal/view/${task.share_token}` : ''
        ).run()

        // Update follow-up count on proposal
        if (task.target_id) {
          await c.env.DB.prepare(
            "UPDATE crm_proposals SET followup_count = COALESCE(followup_count, 0) + 1, last_followup_at = datetime('now') WHERE id = ?"
          ).bind(task.target_id).run()
        }
      } else if (task.task_type === 'invoice_overdue_reminder') {
        await c.env.DB.prepare(
          "INSERT INTO notifications (owner_id, type, title, message) VALUES (?, 'invoice_overdue', 'Invoice overdue reminder', ?)"
        ).bind(task.owner_id, `Invoice is overdue. Consider sending a reminder.`).run()
      }

      // Mark as executed
      await c.env.DB.prepare(
        "UPDATE scheduled_tasks SET status = 'executed', attempt_count = attempt_count + 1, last_attempt_at = datetime('now') WHERE id = ?"
      ).bind(task.id).run()
      executed++
    }

    return c.json({ success: true, executed, total_due: (dueTasks.results || []).length })
  } catch (err: any) { return c.json({ error: err.message }, 500) }
})

// ============================================================
// HELPER: Fire webhook for an event
// ============================================================
export async function fireWebhooks(db: D1Database, ownerId: number, eventType: string, payload: any) {
  try {
    const hooks = await db.prepare(
      "SELECT * FROM webhooks WHERE owner_id = ? AND event_type = ? AND is_active = 1"
    ).bind(ownerId, eventType).all<any>()

    for (const hook of hooks.results || []) {
      try {
        await fetch(hook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': hook.secret || '' },
          body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() })
        })
        await db.prepare("UPDATE webhooks SET last_triggered_at = datetime('now') WHERE id = ?").bind(hook.id).run()
      } catch {
        await db.prepare("UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?").bind(hook.id).run()
      }
    }
  } catch {}
}

// ============================================================
// HELPER: Create notification
// ============================================================
export async function createNotification(db: D1Database, ownerId: number, type: string, title: string, message: string, link: string = '') {
  try {
    await db.prepare(
      "INSERT INTO notifications (owner_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)"
    ).bind(ownerId, type, title, message, link).run()
  } catch {}
}

// ============================================================
// HELPER: Schedule follow-up
// ============================================================
export async function scheduleFollowUp(db: D1Database, ownerId: number, taskType: string, targetType: string, targetId: number, hoursFromNow: number = 48) {
  try {
    const scheduledFor = new Date(Date.now() + hoursFromNow * 3600000).toISOString()
    await db.prepare(
      "INSERT INTO scheduled_tasks (owner_id, task_type, target_type, target_id, scheduled_for) VALUES (?, ?, ?, ?, ?)"
    ).bind(ownerId, taskType, targetType, targetId, scheduledFor).run()
  } catch {}
}
