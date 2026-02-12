import { Hono } from 'hono'
import type { Bindings } from '../types'

export const authRoutes = new Hono<{ Bindings: Bindings }>()

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
  // storedHash format: salt:hash
  const parts = storedHash.split(':')
  if (parts.length !== 2) return false
  const [salt, hash] = parts
  const result = await hashPassword(password, salt)
  return result.hash === hash
}

// ============================================================
// REGISTER
// ============================================================
authRoutes.post('/register', async (c) => {
  try {
    const { email, password, name, company_name, phone } = await c.req.json()

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400)
    }

    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    // Check if email already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM admin_users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first()

    if (existing) {
      return c.json({ error: 'An account with this email already exists' }, 409)
    }

    // Hash password
    const { hash, salt } = await hashPassword(password)
    const storedHash = `${salt}:${hash}`

    // Determine role - first user gets superadmin
    const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first<{ count: number }>()
    const role = (userCount?.count || 0) === 0 ? 'superadmin' : 'admin'

    // Create user
    const result = await c.env.DB.prepare(`
      INSERT INTO admin_users (email, password_hash, name, role, company_name, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      email.toLowerCase().trim(),
      storedHash,
      name,
      role,
      company_name || null,
      phone || null
    ).run()

    // Also ensure master company exists
    const masterExists = await c.env.DB.prepare('SELECT id FROM master_companies LIMIT 1').first()
    if (!masterExists) {
      await c.env.DB.prepare(`
        INSERT INTO master_companies (company_name, contact_name, email, phone)
        VALUES (?, ?, ?, ?)
      `).bind(
        company_name || 'Reuse Canada',
        name,
        email.toLowerCase().trim(),
        phone || ''
      ).run()
    }

    // Generate session token
    const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()

    return c.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: result.meta.last_row_id,
        email: email.toLowerCase().trim(),
        name,
        role,
        company_name
      },
      token: sessionToken
    })
  } catch (err: any) {
    return c.json({ error: 'Registration failed', details: err.message }, 500)
  }
})

// ============================================================
// LOGIN
// ============================================================
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    // Find user
    const user = await c.env.DB.prepare(
      'SELECT * FROM admin_users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase().trim()).first<any>()

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    // Update last login
    await c.env.DB.prepare(
      'UPDATE admin_users SET last_login = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(user.id).run()

    // Generate session token
    const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_name: user.company_name,
        last_login: new Date().toISOString()
      },
      token: sessionToken
    })
  } catch (err: any) {
    return c.json({ error: 'Login failed', details: err.message }, 500)
  }
})

// ============================================================
// GET CURRENT USER (validate session)
// ============================================================
authRoutes.get('/me', async (c) => {
  // For now, check via a simple auth header token pattern
  // In production, use JWT or session-based auth
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  // Simple: extract email from X-User-Email header (set by frontend from localStorage)
  const userEmail = c.req.header('X-User-Email')
  if (!userEmail) {
    return c.json({ error: 'No user context' }, 401)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, company_name, phone, last_login, created_at FROM admin_users WHERE email = ? AND is_active = 1'
  ).bind(userEmail).first()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ user })
})

// ============================================================
// LIST USERS (admin only)
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
// GMAIL OAUTH2 — One-time authorization for personal Gmail
// Step 1: Visit /api/auth/gmail → redirects to Google consent screen
// Step 2: After consent → /api/auth/gmail/callback → gets refresh token
// Step 3: Store refresh token in GMAIL_REFRESH_TOKEN env var
// ============================================================

// Step 1: Generate Google OAuth2 consent URL
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

  // Determine the callback URL based on the current request
  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/api/auth/gmail/callback`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send')
  authUrl.searchParams.set('access_type', 'offline')  // Required to get refresh token
  authUrl.searchParams.set('prompt', 'consent')        // Force consent to always get refresh token

  return c.redirect(authUrl.toString())
})

// Step 2: OAuth2 callback — exchange code for tokens
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
      <p>No authorization code received from Google.</p>
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

  // Exchange authorization code for tokens
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

  // Get the user's email to confirm
  let userEmail = ''
  try {
    const profileResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    const profile: any = await profileResp.json()
    userEmail = profile.emailAddress || ''
  } catch (e) {}

  // Store refresh token in the database settings table for persistence
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
    } catch (e) { /* settings table might not exist yet */ }
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
    <div class="bg-white border border-gray-200 rounded-lg p-3 font-mono text-xs break-all select-all" id="token">${refreshToken}</div>
    <p class="text-xs text-gray-500 mt-2">Add to your <code>.dev.vars</code> file:<br>
    <code class="bg-gray-100 px-1 py-0.5 rounded">GMAIL_REFRESH_TOKEN=${refreshToken}</code></p>
  </div>
  ` : '<p class="text-yellow-600 text-sm mb-4">No refresh token received. The token may already be stored from a previous authorization.</p>'}

  <div class="flex gap-3">
    <a href="/admin" class="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
      Go to Admin Dashboard
    </a>
  </div>
</div>
</body></html>`)
})

// Check Gmail OAuth2 status
authRoutes.get('/gmail/status', async (c) => {
  const hasClientId = !!(c.env as any).GMAIL_CLIENT_ID
  const hasClientSecret = !!(c.env as any).GMAIL_CLIENT_SECRET
  const hasRefreshToken = !!(c.env as any).GMAIL_REFRESH_TOKEN

  // Also check DB for stored refresh token
  let dbRefreshToken = false
  let dbSenderEmail = ''
  try {
    const row = await c.env.DB.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'gmail_refresh_token' AND master_company_id = 1"
    ).first<any>()
    if (row?.setting_value) {
      dbRefreshToken = true
    }
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
    },
    setup_needed: !hasClientId ? {
      step1: 'Go to https://console.cloud.google.com/apis/credentials',
      step2: 'Create OAuth 2.0 Client ID (Web application)',
      step3: 'Add redirect URI: {your_domain}/api/auth/gmail/callback',
      step4: 'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .dev.vars',
      step5: 'Visit /api/auth/gmail to authorize'
    } : null
  })
})
