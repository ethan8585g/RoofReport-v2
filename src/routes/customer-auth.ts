import { Hono } from 'hono'
import type { Bindings } from '../types'

export const customerAuthRoutes = new Hono<{ Bindings: Bindings }>()

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
// CUSTOMER REGISTER (email/password)
// ============================================================
customerAuthRoutes.post('/register', async (c) => {
  try {
    const { email, password, name, phone, company_name } = await c.req.json()

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400)
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM customers WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first()

    if (existing) {
      return c.json({ error: 'An account with this email already exists' }, 409)
    }

    const { hash, salt } = await hashPassword(password)
    const storedHash = `${salt}:${hash}`

    // Insert with 3 free trial reports (NOT paid credits)
    const result = await c.env.DB.prepare(`
      INSERT INTO customers (email, name, phone, company_name, password_hash, report_credits, credits_used, free_trial_total, free_trial_used)
      VALUES (?, ?, ?, ?, ?, 0, 0, 3, 0)
    `).bind(email.toLowerCase().trim(), name, phone || null, company_name || null, storedHash).run()

    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO customer_sessions (customer_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(result.meta.last_row_id, token, expiresAt).run()

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'customer_registered', ?)
    `).bind(`New customer: ${name} (${email}) — 3 free trial reports granted`).run()

    return c.json({
      success: true,
      customer: {
        id: result.meta.last_row_id,
        email: email.toLowerCase().trim(),
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

    const customer = await c.env.DB.prepare(
      'SELECT * FROM customers WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase().trim()).first<any>()

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

  const paidCreditsRemaining = (session.report_credits || 0) - (session.credits_used || 0)
  const freeTrialRemaining = (session.free_trial_total || 0) - (session.free_trial_used || 0)
  const totalRemaining = Math.max(0, freeTrialRemaining) + Math.max(0, paidCreditsRemaining)

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
      credits_remaining: totalRemaining,
      free_trial_remaining: Math.max(0, freeTrialRemaining),
      free_trial_total: session.free_trial_total || 0,
      free_trial_used: session.free_trial_used || 0,
      paid_credits_remaining: Math.max(0, paidCreditsRemaining),
      paid_credits_total: session.report_credits || 0,
      paid_credits_used: session.credits_used || 0
    }
  })
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

  const orders = await c.env.DB.prepare(`
    SELECT o.*, r.status as report_status, r.roof_area_sqft, r.total_material_cost_cad,
           r.complexity_class, r.confidence_score
    FROM orders o
    LEFT JOIN reports r ON r.order_id = o.id
    WHERE o.customer_id = ?
    ORDER BY o.created_at DESC
  `).bind(session.customer_id).all()

  return c.json({ orders: orders.results })
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
