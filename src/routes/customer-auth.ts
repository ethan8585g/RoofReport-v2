import { Hono } from 'hono'
import type { Bindings } from '../types'
import { trackUserSignup, trackUserLogin } from '../services/ga4-events'
import { resolveTeamOwner } from './team'

export const customerAuthRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// DEV / TEST ACCOUNT — Unlimited free reports, no payment required
// Login via /customer/login with these credentials
// ============================================================
const DEV_ACCOUNT = {
  email: 'dev@reusecanada.ca',
  password: 'DevTest2026!',
  name: 'RoofReporterAI Dev',
  company_name: 'RoofReporterAI (Dev Testing)',
  phone: '780-000-0000'
}

export function isDevAccount(email: string): boolean {
  return email.toLowerCase().trim() === DEV_ACCOUNT.email
}

// ============================================================
// PASSWORD HELPERS (same as admin auth)
// ============================================================
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

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomUUID()
}

// ============================================================
// EMAIL VERIFICATION — 6-digit code sent to email before registration
// ============================================================

function generateVerificationCode(): string {
  // 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send email using best available provider
// Priority: 1) Resend API  2) Gmail OAuth2 (env or DB token)  3) GCP service account
async function sendVerificationEmail(env: any, toEmail: string, code: string, db?: any): Promise<boolean> {
  const senderEmail = (env as any).GMAIL_SENDER_EMAIL || 'noreply@reusecanada.ca'
  const emailSubject = `Your RoofReporterAI Verification Code: ${code}`
  const emailHtml = getVerificationEmailHTML(code)

  // ---- METHOD 1: Resend API (simplest) ----
  const resendKey = (env as any).RESEND_API_KEY
  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `RoofReporterAI <onboarding@resend.dev>`,
          to: [toEmail],
          subject: emailSubject,
          html: emailHtml
        })
      })
      if (resp.ok) {
        console.log(`[Verification Email] Sent to ${toEmail} via Resend`)
        return true
      }
      console.error('[Verification Email] Resend failed:', await resp.text())
    } catch (e: any) {
      console.error('[Verification Email] Resend error:', e.message)
    }
  }

  // ---- METHOD 2: Gmail OAuth2 (check env vars first, then DB for stored credentials) ----
  let gmailRefreshToken = (env as any).GMAIL_REFRESH_TOKEN || ''
  const gmailClientId = (env as any).GMAIL_CLIENT_ID || ''
  let gmailClientSecret = (env as any).GMAIL_CLIENT_SECRET || ''

  // Check DB for stored credentials (from /api/auth/gmail/callback and /api/auth/gmail/setup)
  if (db) {
    if (!gmailRefreshToken) {
      try {
        const row = await db.prepare(
          "SELECT setting_value FROM settings WHERE setting_key = 'gmail_refresh_token' AND master_company_id = 1"
        ).first()
        if (row?.setting_value) {
          gmailRefreshToken = row.setting_value
          console.log('[Verification Email] Using Gmail refresh token from database')
        }
      } catch (e) { /* settings table might not exist yet */ }
    }
    if (!gmailClientSecret) {
      try {
        const row = await db.prepare(
          "SELECT setting_value FROM settings WHERE setting_key = 'gmail_client_secret' AND master_company_id = 1"
        ).first()
        if (row?.setting_value) {
          gmailClientSecret = row.setting_value
          console.log('[Verification Email] Using Gmail client secret from database')
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (gmailRefreshToken && gmailClientId && gmailClientSecret) {
    try {
      // Get fresh access token
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: gmailRefreshToken,
          client_id: gmailClientId,
          client_secret: gmailClientSecret
        }).toString()
      })
      const tokenData: any = await tokenResp.json()
      if (tokenData.access_token) {
        const rawEmail = [
          `From: RoofReporterAI <${senderEmail}>`,
          `To: ${toEmail}`,
          `Subject: ${emailSubject}`,
          'Content-Type: text/html; charset=UTF-8',
          '',
          emailHtml
        ].join('\r\n')

        // Base64url encode
        const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

        const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded })
        })
        if (sendResp.ok) {
          console.log(`[Verification Email] Sent to ${toEmail} via Gmail OAuth2`)
          return true
        }
        console.error('[Verification Email] Gmail send failed:', await sendResp.text())
      } else {
        console.error('[Verification Email] Gmail token exchange failed:', JSON.stringify(tokenData))
      }
    } catch (e: any) {
      console.error('[Verification Email] Gmail error:', e.message)
    }
  }

  // ---- METHOD 3: Gmail via GCP service account (requires Workspace domain-wide delegation) ----
  try {
    const gcpKeyStr = (env as any).GCP_SERVICE_ACCOUNT_KEY
    if (gcpKeyStr) {
      const gcpKey = typeof gcpKeyStr === 'string' ? JSON.parse(gcpKeyStr) : gcpKeyStr
      const saEmail = gcpKey.client_email
      const impersonateEmail = senderEmail

      // Create JWT for service account
      const header = { alg: 'RS256', typ: 'JWT' }
      const now = Math.floor(Date.now() / 1000)
      const claim = {
        iss: saEmail,
        sub: impersonateEmail,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
      }

      // Import private key
      const pemContents = gcpKey.private_key
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\n/g, '')
      const keyData = Uint8Array.from(atob(pemContents), (c: string) => c.charCodeAt(0))
      const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])

      const toBase64Url = (data: string) => btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const headerB64 = toBase64Url(JSON.stringify(header))
      const claimB64 = toBase64Url(JSON.stringify(claim))
      const signInput = `${headerB64}.${claimB64}`
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signInput))
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const jwt = `${signInput}.${sigB64}`

      // Exchange JWT for access token
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      })
      const tokenData: any = await tokenResp.json()

      if (tokenData.access_token) {
        const rawEmail = [
          `From: RoofReporterAI <${impersonateEmail}>`,
          `To: ${toEmail}`,
          `Subject: ${emailSubject}`,
          'Content-Type: text/html; charset=UTF-8',
          '',
          emailHtml
        ].join('\r\n')

        const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

        const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded })
        })
        if (sendResp.ok) {
          console.log(`[Verification Email] Sent to ${toEmail} via GCP service account`)
          return true
        }
        console.error('[Verification Email] GCP Gmail send failed:', await sendResp.text())
      } else {
        console.error('[Verification Email] GCP token exchange failed:', JSON.stringify(tokenData))
      }
    }
  } catch (e: any) {
    console.error('[Verification Email] GCP service account error:', e.message)
  }

  console.error('[Verification Email] ALL methods failed for:', toEmail, '| Resend:', !!resendKey, '| Gmail OAuth2:', !!(gmailRefreshToken && gmailClientId), '| GCP:', !!(env as any).GCP_SERVICE_ACCOUNT_KEY)
  return false
}

function getVerificationEmailHTML(code: string): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 48px; height: 48px; background: #0ea5e9; border-radius: 12px; line-height: 48px; text-align: center;">
        <span style="color: white; font-size: 24px;">&#127968;</span>
      </div>
      <h1 style="color: #1e3a5f; font-size: 24px; margin: 16px 0 4px;">RoofReporterAI</h1>
      <p style="color: #6b7280; font-size: 14px; margin: 0;">Email Verification</p>
    </div>
    <div style="background: #f8fafc; border-radius: 16px; padding: 32px; text-align: center;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">Enter this code to verify your email and complete registration:</p>
      <div style="background: white; border: 2px solid #0ea5e9; border-radius: 12px; padding: 16px; display: inline-block; min-width: 200px;">
        <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e3a5f;">${code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0;">This code expires in 10 minutes.<br>If you didn't request this, please ignore this email.</p>
    </div>
    <p style="color: #d1d5db; font-size: 11px; text-align: center; margin-top: 24px;">&copy; 2026 RoofReporterAI &middot; Alberta, Canada</p>
  </div>`
}

// ============================================================
// SEND VERIFICATION CODE — Step 1 of registration
// ============================================================
customerAuthRoutes.post('/send-verification', async (c) => {
  try {
    const { email } = await c.req.json()
    if (!email) return c.json({ error: 'Email is required' }, 400)

    const cleanEmail = email.toLowerCase().trim()

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return c.json({ error: 'Invalid email format' }, 400)
    }

    // Check if account already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM customers WHERE email = ?'
    ).bind(cleanEmail).first()
    if (existing) {
      return c.json({ error: 'An account with this email already exists. Please sign in instead.' }, 409)
    }

    // Rate limit: max 3 codes per email per hour
    const recentCodes = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM email_verification_codes WHERE email = ? AND created_at > datetime('now', '-1 hour')"
    ).bind(cleanEmail).first<any>()
    if (recentCodes && recentCodes.cnt >= 3) {
      return c.json({ error: 'Too many verification requests. Please wait before trying again.' }, 429)
    }

    // Generate code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes

    // Invalidate previous codes for this email
    await c.env.DB.prepare(
      "UPDATE email_verification_codes SET used = 1 WHERE email = ? AND used = 0"
    ).bind(cleanEmail).run()

    // Store the new code
    await c.env.DB.prepare(
      'INSERT INTO email_verification_codes (email, code, expires_at) VALUES (?, ?, ?)'
    ).bind(cleanEmail, code, expiresAt).run()

    // Send email — pass DB so it can look up stored Gmail OAuth tokens
    const sent = await sendVerificationEmail(c.env, cleanEmail, code, c.env.DB)

    if (!sent) {
      // Email delivery failed — return the code directly so registration can proceed
      // This is a graceful degradation: registration still works even without email configured
      console.error(`[Verification] Email send failed for ${cleanEmail}, code: ${code}`)
      return c.json({
        success: true,
        email_sent: false,
        fallback_code: code,
        message: 'Email delivery is temporarily unavailable. Your verification code is shown below.',
        setup_hint: 'Admin: Set up email at /api/auth/gmail or configure RESEND_API_KEY for production email delivery.'
      })
    }

    return c.json({
      success: true,
      email_sent: true,
      message: `Verification code sent to ${cleanEmail}. Check your inbox (and spam folder).`
    })
  } catch (err: any) {
    console.error('[Verification] Error:', err.message)
    return c.json({ error: 'Failed to send verification code', details: err.message }, 500)
  }
})

// ============================================================
// VERIFY CODE — Step 2 of registration
// ============================================================
customerAuthRoutes.post('/verify-code', async (c) => {
  try {
    const { email, code } = await c.req.json()
    if (!email || !code) return c.json({ error: 'Email and verification code are required' }, 400)

    const cleanEmail = email.toLowerCase().trim()

    const record = await c.env.DB.prepare(
      "SELECT * FROM email_verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
    ).bind(cleanEmail, code.trim()).first<any>()

    if (!record) {
      return c.json({ error: 'Invalid or expired verification code. Please request a new one.' }, 400)
    }

    // Mark code as used
    await c.env.DB.prepare(
      'UPDATE email_verification_codes SET used = 1, verified_at = datetime(\'now\') WHERE id = ?'
    ).bind(record.id).run()

    // Generate a verification token (short-lived, used to complete registration)
    const verificationToken = crypto.randomUUID()
    await c.env.DB.prepare(
      'UPDATE email_verification_codes SET verification_token = ? WHERE id = ?'
    ).bind(verificationToken, record.id).run()

    return c.json({
      success: true,
      verified: true,
      verification_token: verificationToken,
      message: 'Email verified! You can now complete your registration.'
    })
  } catch (err: any) {
    return c.json({ error: 'Verification failed', details: err.message }, 500)
  }
})

// ============================================================
// GOOGLE SIGN-IN — Verify Google ID token and create/login customer
// ============================================================
customerAuthRoutes.post('/google', async (c) => {
  try {
    const { credential } = await c.req.json()
    
    if (!credential) {
      return c.json({ error: 'Google credential token required' }, 400)
    }

    // Decode Google ID token (JWT) — verify with Google's tokeninfo endpoint
    const verifyResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`)
    
    if (!verifyResp.ok) {
      return c.json({ error: 'Invalid Google token' }, 401)
    }

    const googleUser: any = await verifyResp.json()

    // Verify the token audience matches our client ID
    const clientId = (c.env as any).GOOGLE_OAUTH_CLIENT_ID || (c.env as any).GMAIL_CLIENT_ID
    if (clientId && googleUser.aud !== clientId) {
      return c.json({ error: 'Token audience mismatch' }, 401)
    }

    const email = googleUser.email?.toLowerCase().trim()
    const name = googleUser.name || email.split('@')[0]
    const googleId = googleUser.sub
    const avatar = googleUser.picture || ''

    if (!email || !googleId) {
      return c.json({ error: 'Invalid Google profile data' }, 400)
    }

    // Check if customer exists by google_id or email
    let customer = await c.env.DB.prepare(
      'SELECT * FROM customers WHERE google_id = ? OR email = ?'
    ).bind(googleId, email).first<any>()

    if (customer) {
      // Update existing customer with Google info
      await c.env.DB.prepare(`
        UPDATE customers SET 
          google_id = ?, google_avatar = ?, name = COALESCE(name, ?), 
          email_verified = 1, last_login = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(googleId, avatar, name, customer.id).run()
    } else {
      // Create new customer with 3 free trial reports (NOT paid credits)
      const result = await c.env.DB.prepare(`
        INSERT INTO customers (email, name, google_id, google_avatar, email_verified, report_credits, credits_used, free_trial_total, free_trial_used)
        VALUES (?, ?, ?, ?, 1, 0, 0, 3, 0)
      `).bind(email, name, googleId, avatar).run()
      
      customer = {
        id: result.meta.last_row_id,
        email, name, google_id: googleId, google_avatar: avatar,
        report_credits: 0, credits_used: 0,
        free_trial_total: 3, free_trial_used: 0,
        is_new_signup: true
      }

      // Log the free trial
      await c.env.DB.prepare(`
        INSERT INTO user_activity_log (company_id, action, details)
        VALUES (1, 'free_trial_granted', ?)
      `).bind(`3 free trial reports granted to ${email} (Google sign-in)`).run()

      // Track Google signup in GA4 (non-blocking)
      trackUserSignup(c.env as any, String(customer.id), 'google', { email_domain: email.split('@')[1] || 'unknown' }).catch(() => {})
    }

    // Create session
    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    
    await c.env.DB.prepare(`
      INSERT INTO customer_sessions (customer_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(customer.id, token, expiresAt).run()

    // Log activity
    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'customer_google_login', ?)
    `).bind(`Customer ${email} signed in via Google`).run()

    const isNew = customer.is_new_signup || false
    const paidCreditsRemaining = (customer.report_credits || 0) - (customer.credits_used || 0)
    const freeTrialRemaining = (customer.free_trial_total || 3) - (customer.free_trial_used || 0)
    const totalRemaining = Math.max(0, freeTrialRemaining) + Math.max(0, paidCreditsRemaining)

    return c.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email || email,
        name: customer.name || name,
        company_name: customer.company_name,
        phone: customer.phone,
        google_avatar: customer.google_avatar || avatar,
        role: 'customer',
        credits_remaining: totalRemaining,
        free_trial_remaining: Math.max(0, freeTrialRemaining),
        free_trial_total: customer.free_trial_total || 3,
        paid_credits_remaining: Math.max(0, paidCreditsRemaining)
      },
      token,
      ...(isNew ? { welcome: true, message: 'Welcome! You have 3 free trial roof reports to get started.' } : {})
    })
  } catch (err: any) {
    return c.json({ error: 'Google sign-in failed', details: err.message }, 500)
  }
})

// ============================================================
// CUSTOMER REGISTER (email/password) — Requires verified email
// ============================================================
customerAuthRoutes.post('/register', async (c) => {
  try {
    const { email, password, name, phone, company_name, verification_token } = await c.req.json()

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400)
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    const cleanEmail = email.toLowerCase().trim()

    // Verify the email verification token (unless email config is not set up)
    if (verification_token) {
      const verified = await c.env.DB.prepare(
        "SELECT * FROM email_verification_codes WHERE email = ? AND verification_token = ? AND verified_at IS NOT NULL AND created_at > datetime('now', '-30 minutes')"
      ).bind(cleanEmail, verification_token).first<any>()

      if (!verified) {
        return c.json({ error: 'Email verification expired or invalid. Please verify your email again.' }, 400)
      }
    } else {
      // Check if email verification is configured — if ANY email service is available, require verification
      const hasResend = !!(c.env as any).RESEND_API_KEY
      const hasGmail = !!((c.env as any).GMAIL_REFRESH_TOKEN && (c.env as any).GMAIL_CLIENT_ID)
      const hasGCP = !!(c.env as any).GCP_SERVICE_ACCOUNT_KEY
      if (hasResend || hasGmail || hasGCP) {
        return c.json({ error: 'Email verification is required. Please verify your email first.' }, 400)
      }
      // If no email service configured, allow registration without verification (graceful degradation)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM customers WHERE email = ?'
    ).bind(cleanEmail).first()

    if (existing) {
      return c.json({ error: 'An account with this email already exists' }, 409)
    }

    const { hash, salt } = await hashPassword(password)
    const storedHash = `${salt}:${hash}`

    // Insert with 3 free trial reports (NOT paid credits) — email_verified = 1 since we verified
    const result = await c.env.DB.prepare(`
      INSERT INTO customers (email, name, phone, company_name, password_hash, email_verified, report_credits, credits_used, free_trial_total, free_trial_used)
      VALUES (?, ?, ?, ?, ?, 1, 0, 0, 3, 0)
    `).bind(cleanEmail, name, phone || null, company_name || null, storedHash).run()

    if (!result.meta.last_row_id) {
      return c.json({ error: 'Failed to create account. Please try again.' }, 500)
    }

    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO customer_sessions (customer_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(result.meta.last_row_id, token, expiresAt).run()

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'customer_registered', ?)
    `).bind(`New customer: ${name} (${cleanEmail}) — 3 free trial reports granted — email verified`).run()

    // Track signup in GA4 (non-blocking)
    trackUserSignup(c.env as any, String(result.meta.last_row_id), 'email', { email_domain: cleanEmail.split('@')[1] || 'unknown' }).catch(() => {})

    return c.json({
      success: true,
      customer: {
        id: result.meta.last_row_id,
        email: cleanEmail,
        name,
        company_name,
        phone,
        role: 'customer',
        credits_remaining: 3,
        free_trial_remaining: 3,
        free_trial_total: 3,
        paid_credits_remaining: 0
      },
      token,
      welcome: true,
      message: 'Welcome! You have 3 free trial roof reports to get started.'
    })
  } catch (err: any) {
    return c.json({ error: 'Registration failed', details: err.message }, 500)
  }
})

// ============================================================
// CUSTOMER LOGIN (email/password)
// ============================================================
customerAuthRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    const cleanEmail = email.toLowerCase().trim()

    // ============================================================
    // DEV ACCOUNT — auto-create on first login, unlimited free reports
    // ============================================================
    if (cleanEmail === DEV_ACCOUNT.email && password === DEV_ACCOUNT.password) {
      let devCustomer = await c.env.DB.prepare(
        'SELECT * FROM customers WHERE email = ?'
      ).bind(DEV_ACCOUNT.email).first<any>()

      if (!devCustomer) {
        // Auto-create dev account with massive trial allocation
        const { hash, salt } = await hashPassword(DEV_ACCOUNT.password)
        const storedHash = `${salt}:${hash}`
        const result = await c.env.DB.prepare(`
          INSERT INTO customers (email, name, phone, company_name, password_hash, report_credits, credits_used, free_trial_total, free_trial_used, is_active)
          VALUES (?, ?, ?, ?, ?, 999999, 0, 999999, 0, 1)
        `).bind(DEV_ACCOUNT.email, DEV_ACCOUNT.name, DEV_ACCOUNT.phone, DEV_ACCOUNT.company_name, storedHash).run()

        devCustomer = await c.env.DB.prepare(
          'SELECT * FROM customers WHERE email = ?'
        ).bind(DEV_ACCOUNT.email).first<any>()
      } else {
        // Ensure dev account always has unlimited credits (reset every login)
        await c.env.DB.prepare(`
          UPDATE customers SET 
            free_trial_total = 999999, report_credits = 999999,
            is_active = 1, last_login = datetime('now'), updated_at = datetime('now')
          WHERE email = ?
        `).bind(DEV_ACCOUNT.email).run()
      }

      await c.env.DB.prepare(
        "UPDATE customers SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).bind(devCustomer.id).run()

      const token = generateSessionToken()
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
      await c.env.DB.prepare(`
        INSERT INTO customer_sessions (customer_id, session_token, expires_at)
        VALUES (?, ?, ?)
      `).bind(devCustomer.id, token, expiresAt).run()

      return c.json({
        success: true,
        customer: {
          id: devCustomer.id,
          email: DEV_ACCOUNT.email,
          name: DEV_ACCOUNT.name,
          company_name: DEV_ACCOUNT.company_name,
          phone: DEV_ACCOUNT.phone,
          role: 'customer',
          is_dev: true,
          credits_remaining: 999999,
          free_trial_remaining: 999999,
          free_trial_total: 999999,
          paid_credits_remaining: 999999
        },
        token
      })
    }

    // ============================================================
    // NORMAL CUSTOMER LOGIN
    // ============================================================
    const customer = await c.env.DB.prepare(
      'SELECT * FROM customers WHERE email = ? AND is_active = 1'
    ).bind(cleanEmail).first<any>()

    if (!customer) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    if (!customer.password_hash) {
      return c.json({ error: 'This account was created via Google. Please register with email/password to set your credentials.' }, 401)
    }

    const valid = await verifyPassword(password, customer.password_hash)
    if (!valid) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    await c.env.DB.prepare(
      "UPDATE customers SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).bind(customer.id).run()

    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO customer_sessions (customer_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(customer.id, token, expiresAt).run()

    // Track login event in GA4
    trackUserLogin(c.env as any, String(customer.id), 'email', { email_domain: customer.email.split('@')[1] || 'unknown' }).catch(() => {})

    return c.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        company_name: customer.company_name,
        phone: customer.phone,
        google_avatar: customer.google_avatar,
        role: 'customer'
      },
      token
    })
  } catch (err: any) {
    return c.json({ error: 'Login failed', details: err.message }, 500)
  }
})

// ============================================================
// CUSTOMER PROFILE (get current customer)
// ============================================================
customerAuthRoutes.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const session = await c.env.DB.prepare(`
    SELECT cs.*, c.* FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id
    WHERE cs.session_token = ? AND cs.expires_at > datetime('now') AND c.is_active = 1
  `).bind(token).first<any>()

  if (!session) {
    return c.json({ error: 'Session expired or invalid' }, 401)
  }

  // DEV ACCOUNT: always unlimited
  const isDev = isDevAccount(session.email || '')
  const paidCreditsRemaining = isDev ? 999999 : ((session.report_credits || 0) - (session.credits_used || 0))
  const freeTrialRemaining = isDev ? 999999 : ((session.free_trial_total || 0) - (session.free_trial_used || 0))
  const totalRemaining = isDev ? 999999 : (Math.max(0, freeTrialRemaining) + Math.max(0, paidCreditsRemaining))

  // Check team membership
  const teamInfo = await resolveTeamOwner(c.env.DB, session.customer_id)

  // If team member, fetch owner's credit balances so team member sees shared credits
  let creditSource = session
  let ownerName = ''
  let ownerCompany = ''
  if (teamInfo.isTeamMember) {
    const owner = await c.env.DB.prepare(`
      SELECT report_credits, credits_used, free_trial_total, free_trial_used, name, company_name FROM customers WHERE id = ?
    `).bind(teamInfo.ownerId).first<any>()
    if (owner) {
      creditSource = owner
      ownerName = owner.name || ''
      ownerCompany = owner.company_name || ''
    }
  }

  const ownerIsDev = teamInfo.isTeamMember ? false : isDev
  const paidCreditsRemainingCalc = ownerIsDev ? 999999 : ((creditSource.report_credits || 0) - (creditSource.credits_used || 0))
  const freeTrialRemainingCalc = ownerIsDev ? 999999 : ((creditSource.free_trial_total || 0) - (creditSource.free_trial_used || 0))
  const totalRemainingCalc = ownerIsDev ? 999999 : (Math.max(0, freeTrialRemainingCalc) + Math.max(0, paidCreditsRemainingCalc))

  return c.json({
    customer: {
      id: session.customer_id,
      email: session.email,
      name: session.name,
      phone: session.phone,
      company_name: session.company_name,
      google_avatar: session.google_avatar,
      address: session.address,
      city: session.city,
      province: session.province,
      postal_code: session.postal_code,
      role: 'customer',
      is_dev: isDev || undefined,
      credits_remaining: totalRemainingCalc,
      free_trial_remaining: ownerIsDev ? 999999 : Math.max(0, freeTrialRemainingCalc),
      free_trial_total: ownerIsDev ? 999999 : (creditSource.free_trial_total || 0),
      free_trial_used: ownerIsDev ? 0 : (creditSource.free_trial_used || 0),
      paid_credits_remaining: ownerIsDev ? 999999 : Math.max(0, paidCreditsRemainingCalc),
      paid_credits_total: ownerIsDev ? 999999 : (creditSource.report_credits || 0),
      paid_credits_used: ownerIsDev ? 0 : (creditSource.credits_used || 0),
      brand_logo_url: session.brand_logo_url || null,
      brand_business_name: session.brand_business_name || null,
      // Team membership info
      is_team_member: teamInfo.isTeamMember,
      team_owner_id: teamInfo.isTeamMember ? teamInfo.ownerId : undefined,
      team_role: teamInfo.teamMemberRole || undefined,
      team_owner_name: teamInfo.isTeamMember ? ownerName : undefined,
      team_owner_company: teamInfo.isTeamMember ? ownerCompany : undefined
    }
  })
})

// ============================================================
// GET CUSTOMER PROFILE — Returns current user profile data
// ============================================================
customerAuthRoutes.get('/profile', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  const customer = await c.env.DB.prepare(`
    SELECT id, email, name, phone, company_name, address, city, province, postal_code,
           google_avatar, report_credits, credits_used, free_trial_total, free_trial_used,
           subscription_plan, subscription_status, stripe_customer_id, square_customer_id,
           brand_business_name, brand_logo_url, brand_primary_color, brand_secondary_color,
           brand_tagline, brand_phone, brand_email, brand_website, brand_address,
           brand_license_number, brand_insurance_info,
           created_at, last_login
    FROM customers WHERE id = ?
  `).bind(session.customer_id).first()

  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  return c.json({ customer })
})

// ============================================================
// UPDATE CUSTOMER PROFILE
// ============================================================
customerAuthRoutes.put('/profile', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  const { name, phone, company_name, address, city, province, postal_code } = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE customers SET
      name = COALESCE(?, name), phone = ?, company_name = ?,
      address = ?, city = ?, province = ?, postal_code = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(name, phone || null, company_name || null, address || null, city || null, province || null, postal_code || null, session.customer_id).run()

  return c.json({ success: true })
})

// ============================================================
// CUSTOMER LOGOUT
// ============================================================
customerAuthRoutes.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (token) {
    await c.env.DB.prepare('DELETE FROM customer_sessions WHERE session_token = ?').bind(token).run()
  }
  return c.json({ success: true })
})

// ============================================================
// CUSTOMER ORDERS (orders belonging to this customer)
// ============================================================
customerAuthRoutes.get('/orders', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  // Resolve team membership — show owner's orders if team member
  const { ownerId } = await resolveTeamOwner(c.env.DB, session.customer_id)

  const orders = await c.env.DB.prepare(`
    SELECT o.*, r.status as report_status, r.roof_area_sqft, r.total_material_cost_cad,
           r.complexity_class, r.confidence_score,
           r.enhancement_status, r.enhancement_version, r.enhancement_sent_at,
           r.ai_imagery_status
    FROM orders o
    LEFT JOIN reports r ON r.order_id = o.id
    WHERE o.customer_id = ?
    ORDER BY o.created_at DESC
  `).bind(ownerId).all()

  return c.json({ orders: orders.results })
})

// ============================================================
// ORDER PROGRESS TRACKER — Real-time status for report generation
// Returns a timeline of generation steps with current status
// ============================================================
customerAuthRoutes.get('/orders/:orderId/progress', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  const orderId = c.req.param('orderId')

  // Get order + report status
  const order = await c.env.DB.prepare(`
    SELECT o.*, r.status as report_status, r.generation_attempts, 
           r.generation_started_at, r.generation_completed_at,
           r.error_message as report_error, r.confidence_score,
           r.imagery_quality, r.report_version,
           r.roof_area_sqft, r.total_material_cost_cad, r.complexity_class
    FROM orders o
    LEFT JOIN reports r ON r.order_id = o.id
    WHERE o.id = ? AND o.customer_id = ?
  `).bind(orderId, session.customer_id).first<any>()

  if (!order) return c.json({ error: 'Order not found' }, 404)

  // Build progress timeline
  const steps = [
    {
      id: 'payment',
      label: 'Payment Received',
      icon: 'fa-credit-card',
      status: order.payment_status === 'paid' || order.payment_status === 'trial' ? 'completed' : 'pending',
      completed_at: order.created_at,
      detail: order.is_trial ? 'Free trial report' : (order.payment_status === 'paid' ? `$${order.price} CAD` : 'Awaiting payment')
    },
    {
      id: 'geocoding',
      label: 'Property Located',
      icon: 'fa-map-marker-alt',
      status: order.latitude && order.longitude ? 'completed' : (order.status === 'failed' ? 'failed' : 'pending'),
      completed_at: order.latitude ? order.created_at : null,
      detail: order.latitude ? `${order.latitude.toFixed(6)}, ${order.longitude.toFixed(6)}` : 'Geocoding address...'
    },
    {
      id: 'imagery',
      label: 'Satellite Imagery',
      icon: 'fa-satellite',
      status: order.report_status === 'running' ? 'running' :
             (order.report_status === 'completed' ? 'completed' :
              order.report_status === 'failed' ? 'failed' : 'pending'),
      completed_at: order.generation_started_at || null,
      detail: order.report_status === 'running' ? 'Fetching satellite & DSM data...' :
              (order.imagery_quality ? `Quality: ${order.imagery_quality}` : 'Queued')
    },
    {
      id: 'measurement',
      label: 'Roof Measurement',
      icon: 'fa-ruler-combined',
      status: order.report_status === 'completed' ? 'completed' :
             (order.report_status === 'running' ? 'running' : 
              order.report_status === 'failed' ? 'failed' : 'pending'),
      completed_at: order.report_status === 'completed' ? order.generation_completed_at : null,
      detail: order.roof_area_sqft ? `${Math.round(order.roof_area_sqft)} sq ft` : 'Analyzing roof geometry...'
    },
    {
      id: 'materials',
      label: 'Material Estimate',
      icon: 'fa-calculator',
      status: order.report_status === 'completed' ? 'completed' : 'pending',
      completed_at: order.report_status === 'completed' ? order.generation_completed_at : null,
      detail: order.total_material_cost_cad ? `$${order.total_material_cost_cad.toFixed(2)} CAD` : 'Calculating materials...'
    },
    {
      id: 'report',
      label: 'Report Generated',
      icon: 'fa-file-pdf',
      status: order.report_status === 'completed' ? 'completed' :
             (order.report_status === 'failed' ? 'failed' : 'pending'),
      completed_at: order.report_status === 'completed' ? (order.delivered_at || order.generation_completed_at) : null,
      detail: order.report_status === 'completed' ? `v${order.report_version || '2.0'} — Confidence: ${order.confidence_score || 'N/A'}%` :
              (order.report_status === 'failed' ? (order.report_error || 'Generation failed') : 'Assembling PDF...')
    }
  ]

  // Determine overall progress percentage
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const progressPct = Math.round((completedSteps / steps.length) * 100)

  return c.json({
    order_id: order.id,
    order_number: order.order_number,
    property_address: order.property_address,
    order_status: order.status,
    report_status: order.report_status || 'queued',
    generation_attempts: order.generation_attempts || 0,
    progress_pct: progressPct,
    steps,
    error: order.report_status === 'failed' ? order.report_error : null,
    can_retry: order.report_status === 'failed' && (order.generation_attempts || 0) < 3
  })
})

// ============================================================
// CUSTOMER INVOICES
// ============================================================
customerAuthRoutes.get('/invoices', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  const invoices = await c.env.DB.prepare(`
    SELECT i.*, o.property_address, o.order_number
    FROM invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE i.customer_id = ?
    ORDER BY i.created_at DESC
  `).bind(session.customer_id).all()

  return c.json({ invoices: invoices.results })
})

// Get single invoice with items
customerAuthRoutes.get('/invoices/:id', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()

  if (!session) return c.json({ error: 'Session expired' }, 401)

  const id = c.req.param('id')
  const invoice = await c.env.DB.prepare(`
    SELECT i.*, o.property_address, o.order_number, c.name as customer_name, c.email as customer_email,
           c.phone as customer_phone, c.company_name as customer_company, c.address as customer_address,
           c.city as customer_city, c.province as customer_province, c.postal_code as customer_postal
    FROM invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ? AND i.customer_id = ?
  `).bind(id, session.customer_id).first<any>()

  if (!invoice) return c.json({ error: 'Invoice not found' }, 404)

  // Mark as viewed if it was just sent
  if (invoice.status === 'sent') {
    await c.env.DB.prepare("UPDATE invoices SET status = 'viewed', updated_at = datetime('now') WHERE id = ?").bind(id).run()
    invoice.status = 'viewed'
  }

  const items = await c.env.DB.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order'
  ).bind(id).all()

  return c.json({ invoice, items: items.results })
})
