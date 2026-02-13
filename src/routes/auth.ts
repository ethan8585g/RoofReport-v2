import { Hono } from 'hono'
import type { Bindings } from '../types'

export const authRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// HARDCODED SUPERADMIN CREDENTIALS
// Only this account gets admin access — no public registration
// ============================================================
const SUPERADMIN_EMAIL = 'ethangourley17@gmail.com'
const SUPERADMIN_PASSWORD = 'Bean1234!'
const SUPERADMIN_NAME = 'Ethan Gourley'

// Simple password hashing using Web Crypto API (SHA-256 + salt)
async function hashPassword(password: string, salt?: string): Promise<{ hash: string, salt: string }> {
  const s = salt || crypto.randomUUID()
  const data = new TextEncoder().encode(password + s)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return { hash: hashHex, salt: s }
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 2) return false
  const [salt, hash] = parts
  const result = await hashPassword(password, salt)
  return result.hash === hash
}

// ============================================================
// ADMIN LOGIN — Only ethangourley17@gmail.com can access admin
// ============================================================
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    const cleanEmail = email.toLowerCase().trim()

    // ONLY allow the superadmin account
    if (cleanEmail !== SUPERADMIN_EMAIL) {
      return c.json({ error: 'Admin access is restricted. Use the customer portal at /customer/login' }, 403)
    }

    // Check plain-text password match first (for initial/reset)
    if (password === SUPERADMIN_PASSWORD) {
      // Ensure superadmin exists in DB (auto-create on first login)
      let user = await c.env.DB.prepare(
        'SELECT * FROM admin_users WHERE email = ?'
      ).bind(SUPERADMIN_EMAIL).first<any>()

      if (!user) {
        // Auto-create superadmin account
        const { hash, salt } = await hashPassword(SUPERADMIN_PASSWORD)
        const storedHash = `${salt}:${hash}`
        await c.env.DB.prepare(`
          INSERT INTO admin_users (email, password_hash, name, role, company_name, is_active)
          VALUES (?, ?, ?, 'superadmin', 'Reuse Canada', 1)
        `).bind(SUPERADMIN_EMAIL, storedHash, SUPERADMIN_NAME).run()

        user = await c.env.DB.prepare(
          'SELECT * FROM admin_users WHERE email = ?'
        ).bind(SUPERADMIN_EMAIL).first<any>()
      }

      // Update last login
      await c.env.DB.prepare(
        "UPDATE admin_users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).bind(user.id).run()

      // Ensure master company exists
      const masterExists = await c.env.DB.prepare('SELECT id FROM master_companies LIMIT 1').first()
      if (!masterExists) {
        await c.env.DB.prepare(`
          INSERT INTO master_companies (company_name, contact_name, email, phone)
          VALUES ('Reuse Canada', ?, ?, '')
        `).bind(SUPERADMIN_NAME, SUPERADMIN_EMAIL).run()
      }

      const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()

      return c.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || SUPERADMIN_NAME,
          role: 'superadmin',
          company_name: 'Reuse Canada',
          last_login: new Date().toISOString()
        },
        token: sessionToken
      })
    }

    // Also check hashed password in DB (if password was changed via hash)
    const user = await c.env.DB.prepare(
      'SELECT * FROM admin_users WHERE email = ? AND is_active = 1'
    ).bind(SUPERADMIN_EMAIL).first<any>()

    if (user && user.password_hash) {
      const valid = await verifyPassword(password, user.password_hash)
      if (valid) {
        await c.env.DB.prepare(
          "UPDATE admin_users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?"
        ).bind(user.id).run()

        const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()

        return c.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: 'superadmin',
            company_name: 'Reuse Canada',
            last_login: new Date().toISOString()
          },
          token: sessionToken
        })
      }
    }

    return c.json({ error: 'Invalid password' }, 401)
  } catch (err: any) {
    return c.json({ error: 'Login failed', details: err.message }, 500)
  }
})

// ============================================================
// REGISTER — Disabled for admin. Returns redirect to customer portal.
// ============================================================
authRoutes.post('/register', async (c) => {
  return c.json({
    error: 'Admin registration is disabled. Only the owner account has admin access.',
    redirect: '/customer/login',
    message: 'Please use the customer portal to create an account.'
  }, 403)
})

// ============================================================
// GET CURRENT USER (validate session)
// ============================================================
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const userEmail = c.req.header('X-User-Email')
  if (!userEmail) {
    return c.json({ error: 'No user context' }, 401)
  }

  // Only superadmin can use admin endpoints
  if (userEmail.toLowerCase().trim() !== SUPERADMIN_EMAIL) {
    return c.json({ error: 'Admin access denied' }, 403)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, company_name, phone, last_login, created_at FROM admin_users WHERE email = ? AND is_active = 1'
  ).bind(SUPERADMIN_EMAIL).first()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ user })
})

// ============================================================
// LIST USERS (admin only — returns customers, not admin users)
// ============================================================
authRoutes.get('/users', async (c) => {
  try {
    const users = await c.env.DB.prepare(
      'SELECT id, email, name, role, company_name, phone, is_active, last_login, created_at FROM admin_users ORDER BY created_at DESC'
    ).all()
    return c.json({ users: users.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to list users', details: err.message }, 500)
  }
})

// ============================================================
// ADMIN DASHBOARD API — Extended stats for all tabs
// ============================================================
authRoutes.get('/admin-stats', async (c) => {
  try {
    // All customers with order/invoice aggregates (revenue excludes trial orders)
    const customers = await c.env.DB.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
        (SELECT COALESCE(SUM(o.price), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid' AND (o.is_trial IS NULL OR o.is_trial = 0)) as total_spent,
        (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) as invoice_count,
        (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'paid') as invoices_paid,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) as last_order_date,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.is_trial = 1) as trial_orders
      FROM customers c
      ORDER BY c.created_at DESC
    `).all()

    // Earnings by month (last 12 months) — revenue EXCLUDES trial orders
    const monthlyEarnings = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as order_count,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as revenue,
        SUM(CASE WHEN is_trial IS NULL OR is_trial = 0 THEN price ELSE 0 END) as total_value,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_count
      FROM orders
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).all()

    // Earnings by week (last 8 weeks)
    const weeklyEarnings = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-W%W', created_at) as week,
        COUNT(*) as order_count,
        SUM(CASE WHEN payment_status = 'paid' THEN price ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= date('now', '-8 weeks')
      GROUP BY strftime('%Y-W%W', created_at)
      ORDER BY week DESC
    `).all()

    // Today's earnings (EXCLUDES trial orders from revenue)
    const todayStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as orders_today,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as revenue_today,
        SUM(CASE WHEN is_trial IS NULL OR is_trial = 0 THEN price ELSE 0 END) as value_today,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders_today
      FROM orders
      WHERE date(created_at) = date('now')
    `).first()

    // This week's earnings (EXCLUDES trial orders from revenue)
    const weekStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as orders_week,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as revenue_week,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders_week
      FROM orders
      WHERE created_at >= date('now', 'weekday 0', '-7 days')
    `).first()

    // This month's earnings (EXCLUDES trial orders from revenue)
    const monthStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as orders_month,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as revenue_month,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders_month
      FROM orders
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).first()

    // All-time revenue (EXCLUDES trial orders from revenue calculations)
    const allTimeStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(price) as total_value,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as total_collected,
        SUM(CASE WHEN payment_status NOT IN ('paid','trial') THEN price ELSE 0 END) as total_outstanding,
        AVG(CASE WHEN is_trial = 0 OR is_trial IS NULL THEN price ELSE NULL END) as avg_order_value,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders,
        SUM(CASE WHEN is_trial = 0 OR is_trial IS NULL THEN 1 ELSE 0 END) as paid_orders
      FROM orders
    `).first()

    // Free trial statistics
    let trialStats: any = {}
    try {
      trialStats = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as total_customers,
          SUM(CASE WHEN free_trial_total > 0 THEN 1 ELSE 0 END) as trial_eligible,
          SUM(free_trial_used) as total_trial_reports_used,
          SUM(free_trial_total) as total_trial_reports_available,
          SUM(CASE WHEN free_trial_used > 0 THEN 1 ELSE 0 END) as customers_who_used_trial,
          SUM(CASE WHEN free_trial_used >= free_trial_total AND free_trial_total > 0 THEN 1 ELSE 0 END) as exhausted_trial,
          SUM(CASE WHEN report_credits > 0 OR credits_used > 0 THEN 1 ELSE 0 END) as paying_customers,
          SUM(report_credits) as total_paid_credits_purchased,
          SUM(credits_used) as total_paid_credits_used
        FROM customers
      `).first() || {}
    } catch(e) {}

    // Payments received
    const payments = await c.env.DB.prepare(`
      SELECT p.*, o.order_number, o.property_address, o.homeowner_name
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all()

    // Invoice stats
    const invoiceStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_collected,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as total_overdue,
        SUM(CASE WHEN status = 'draft' THEN total ELSE 0 END) as total_draft
      FROM invoices
    `).first()

    // All invoices
    const invoices = await c.env.DB.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.company_name as customer_company,
        o.order_number, o.property_address
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN orders o ON i.order_id = o.id
      ORDER BY i.created_at DESC
    `).all()

    // Sales pipeline
    const salesPipeline = await c.env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(price) as total_value
      FROM orders
      GROUP BY status
    `).all()

    // Conversion rate: orders that became completed
    const conversionStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as converted
      FROM orders
    `).first()

    // Top customers by revenue (excludes trial orders from value)
    const topCustomers = await c.env.DB.prepare(`
      SELECT c.name, c.email, c.company_name,
        COUNT(o.id) as order_count,
        SUM(CASE WHEN o.is_trial IS NULL OR o.is_trial = 0 THEN o.price ELSE 0 END) as total_value,
        SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_trial IS NULL OR o.is_trial = 0) THEN o.price ELSE 0 END) as paid_value,
        SUM(CASE WHEN o.is_trial = 1 THEN 1 ELSE 0 END) as trial_orders
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id
      ORDER BY total_value DESC
      LIMIT 10
    `).all()

    // Tier breakdown
    const tierStats = await c.env.DB.prepare(`
      SELECT service_tier, COUNT(*) as count, SUM(price) as total_value,
        SUM(CASE WHEN payment_status = 'paid' THEN price ELSE 0 END) as paid_value
      FROM orders GROUP BY service_tier
    `).all()

    // Customer growth (signups by month)
    const customerGrowth = await c.env.DB.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as signups
      FROM customers
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).all()

    // Recent activity
    const recentActivity = await c.env.DB.prepare(`
      SELECT * FROM user_activity_log ORDER BY created_at DESC LIMIT 30
    `).all()

    // API usage
    const apiUsage = await c.env.DB.prepare(`
      SELECT request_type, COUNT(*) as count, 
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN response_status >= 200 AND response_status < 300 THEN 1 ELSE 0 END) as success_count
      FROM api_requests_log
      WHERE created_at >= date('now', '-30 days')
      GROUP BY request_type
    `).all()

    // Recent orders
    const recentOrders = await c.env.DB.prepare(`
      SELECT o.*, c.name as customer_name, c.email as customer_email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 50
    `).all()

    // Report stats
    let reportStats: any = {}
    try {
      reportStats = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as total_reports,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_reports,
          AVG(gross_squares) as avg_squares,
          AVG(total_material_cost_cad) as avg_material_cost,
          SUM(total_material_cost_cad) as total_material_value,
          AVG(confidence_score) as avg_confidence
        FROM reports
      `).first() || {}
    } catch (e) {}

    return c.json({
      customers: customers.results,
      monthly_earnings: monthlyEarnings.results,
      weekly_earnings: weeklyEarnings.results,
      today: todayStats,
      this_week: weekStats,
      this_month: monthStats,
      all_time: allTimeStats,
      trial_stats: trialStats,
      payments: payments.results,
      invoice_stats: invoiceStats,
      invoices: invoices.results,
      sales_pipeline: salesPipeline.results,
      conversion: conversionStats,
      top_customers: topCustomers.results,
      tier_stats: tierStats.results,
      customer_growth: customerGrowth.results,
      recent_activity: recentActivity.results,
      api_usage: apiUsage.results,
      recent_orders: recentOrders.results,
      report_stats: reportStats
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load admin stats', details: err.message }, 500)
  }
})

// ============================================================
// GMAIL OAUTH2 — One-time authorization for personal Gmail
// ============================================================

authRoutes.get('/gmail', async (c) => {
  const clientId = (c.env as any).GMAIL_CLIENT_ID
  if (!clientId) {
    return c.json({
      error: 'GMAIL_CLIENT_ID not configured',
      setup: {
        step1: 'Go to https://console.cloud.google.com/apis/credentials',
        step2: 'Create OAuth 2.0 Client ID (Web application type)',
        step3: 'Add authorized redirect URI: {your_domain}/api/auth/gmail/callback',
        step4: 'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .dev.vars',
        step5: 'Visit this endpoint again to start authorization'
      }
    }, 400)
  }

  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/api/auth/gmail/callback`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  return c.redirect(authUrl.toString())
})

authRoutes.get('/gmail/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')

  if (error) {
    return c.html(`<html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto">
      <h2 style="color:#dc2626">Authorization Failed</h2>
      <p>Google returned error: <strong>${error}</strong></p>
      <a href="/api/auth/gmail" style="color:#2563eb">Try again</a>
    </body></html>`)
  }

  if (!code) {
    return c.html(`<html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto">
      <h2 style="color:#dc2626">No Authorization Code</h2>
      <a href="/api/auth/gmail" style="color:#2563eb">Try again</a>
    </body></html>`)
  }

  const clientId = (c.env as any).GMAIL_CLIENT_ID
  const clientSecret = (c.env as any).GMAIL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return c.json({ error: 'GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET not configured' }, 400)
  }

  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/api/auth/gmail/callback`

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    }).toString()
  })

  const tokenData: any = await tokenResp.json()

  if (!tokenResp.ok) {
    return c.html(`<html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto">
      <h2 style="color:#dc2626">Token Exchange Failed</h2>
      <p>Error: ${tokenData.error_description || tokenData.error || 'Unknown error'}</p>
      <a href="/api/auth/gmail" style="color:#2563eb">Try again</a>
    </body></html>`)
  }

  const refreshToken = tokenData.refresh_token
  const accessToken = tokenData.access_token

  let userEmail = ''
  try {
    const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const profile: any = await profileResp.json()
    userEmail = profile.emailAddress || ''
  } catch (e) {}

  if (refreshToken) {
    try {
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value, is_encrypted)
        VALUES (1, 'gmail_refresh_token', ?, 0)
      `).bind(refreshToken).run()

      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value, is_encrypted)
        VALUES (1, 'gmail_sender_email', ?, 0)
      `).bind(userEmail).run()
    } catch (e) {}
  }

  return c.html(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
<div class="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full mx-4">
  <div class="text-center mb-6">
    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    <h2 class="text-2xl font-bold text-gray-800">Gmail Connected!</h2>
    <p class="text-gray-500 mt-2">Reports will now be sent from <strong>${userEmail}</strong></p>
  </div>
  ${refreshToken ? `
  <div class="bg-gray-50 rounded-xl p-4 mb-6">
    <p class="text-sm font-semibold text-gray-700 mb-2">Refresh Token (save to .dev.vars):</p>
    <div class="bg-white border border-gray-200 rounded-lg p-3 font-mono text-xs break-all select-all">${refreshToken}</div>
    <p class="text-xs text-gray-500 mt-2">Add to .dev.vars: <code class="bg-gray-100 px-1 rounded">GMAIL_REFRESH_TOKEN=${refreshToken}</code></p>
  </div>
  ` : ''}
  <a href="/admin" class="block text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">Go to Admin Dashboard</a>
</div>
</body></html>`)
})

authRoutes.get('/gmail/status', async (c) => {
  const hasClientId = !!(c.env as any).GMAIL_CLIENT_ID
  const hasClientSecret = !!(c.env as any).GMAIL_CLIENT_SECRET
  const hasRefreshToken = !!(c.env as any).GMAIL_REFRESH_TOKEN

  let dbRefreshToken = false
  let dbSenderEmail = ''
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'gmail_refresh_token' AND master_company_id = 1"
    ).first<any>()
    if (row?.setting_value) dbRefreshToken = true
    const emailRow = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'gmail_sender_email' AND master_company_id = 1"
    ).first<any>()
    dbSenderEmail = emailRow?.setting_value || ''
  } catch (e) {}

  return c.json({
    gmail_oauth2: {
      client_id_configured: hasClientId,
      client_secret_configured: hasClientSecret,
      refresh_token_in_env: hasRefreshToken,
      refresh_token_in_db: dbRefreshToken,
      sender_email: dbSenderEmail || (c.env as any).GMAIL_SENDER_EMAIL || '',
      ready: hasClientId && hasClientSecret && (hasRefreshToken || dbRefreshToken),
      authorize_url: hasClientId ? '/api/auth/gmail' : null
    }
  })
})
