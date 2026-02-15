import { Hono } from 'hono'
import type { Bindings } from '../types'

export const customerAuthRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// DEV / TEST ACCOUNT — Unlimited free reports, no payment required
// Login via /customer/login with these credentials
// ============================================================
const DEV_ACCOUNT = {
  email: 'dev@reusecanada.ca',
  password: 'DevTest2026!',
  name: 'Reuse Canada Dev',
  company_name: 'Reuse Canada (Dev Testing)',
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
      credits_remaining: totalRemaining,
      free_trial_remaining: isDev ? 999999 : Math.max(0, freeTrialRemaining),
      free_trial_total: isDev ? 999999 : (session.free_trial_total || 0),
      free_trial_used: isDev ? 0 : (session.free_trial_used || 0),
      paid_credits_remaining: isDev ? 999999 : Math.max(0, paidCreditsRemaining),
      paid_credits_total: isDev ? 999999 : (session.report_credits || 0),
      paid_credits_used: isDev ? 0 : (session.credits_used || 0),
      brand_logo_url: session.brand_logo_url || null,
      brand_business_name: session.brand_business_name || null
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

// ============================================================
// BRANDING API — Custom company branding for reports/proposals
// ============================================================

// Helper: get authenticated customer ID from token
async function getCustomerId(c: any): Promise<number | null> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()
  return session?.customer_id || null
}

// GET branding settings
customerAuthRoutes.get('/branding', async (c) => {
  const customerId = await getCustomerId(c)
  if (!customerId) return c.json({ error: 'Not authenticated' }, 401)

  const customer = await c.env.DB.prepare(`
    SELECT brand_business_name, brand_logo_url, brand_primary_color, brand_secondary_color,
           brand_tagline, brand_phone, brand_email, brand_website, brand_address,
           brand_license_number, brand_insurance_info,
           ad_facebook_connected, ad_facebook_page_id, ad_google_connected, ad_google_account_id,
           ad_meta_pixel_id, ad_google_analytics_id,
           company_name, name, email, phone
    FROM customers WHERE id = ?
  `).bind(customerId).first<any>()

  if (!customer) return c.json({ error: 'Customer not found' }, 404)

  return c.json({
    branding: {
      business_name: customer.brand_business_name || customer.company_name || '',
      logo_url: customer.brand_logo_url || '',
      primary_color: customer.brand_primary_color || '#1e3a5f',
      secondary_color: customer.brand_secondary_color || '#0ea5e9',
      tagline: customer.brand_tagline || '',
      phone: customer.brand_phone || customer.phone || '',
      email: customer.brand_email || customer.email || '',
      website: customer.brand_website || '',
      address: customer.brand_address || '',
      license_number: customer.brand_license_number || '',
      insurance_info: customer.brand_insurance_info || ''
    },
    ads: {
      facebook_connected: !!customer.ad_facebook_connected,
      facebook_page_id: customer.ad_facebook_page_id || '',
      google_connected: !!customer.ad_google_connected,
      google_account_id: customer.ad_google_account_id || '',
      meta_pixel_id: customer.ad_meta_pixel_id || '',
      google_analytics_id: customer.ad_google_analytics_id || ''
    }
  })
})

// PUT branding settings (auto-save)
customerAuthRoutes.put('/branding', async (c) => {
  const customerId = await getCustomerId(c)
  if (!customerId) return c.json({ error: 'Not authenticated' }, 401)

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE customers SET
      brand_business_name = ?,
      brand_logo_url = ?,
      brand_primary_color = ?,
      brand_secondary_color = ?,
      brand_tagline = ?,
      brand_phone = ?,
      brand_email = ?,
      brand_website = ?,
      brand_address = ?,
      brand_license_number = ?,
      brand_insurance_info = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.business_name || null,
    body.logo_url || null,
    body.primary_color || '#1e3a5f',
    body.secondary_color || '#0ea5e9',
    body.tagline || null,
    body.phone || null,
    body.email || null,
    body.website || null,
    body.address || null,
    body.license_number || null,
    body.insurance_info || null,
    customerId
  ).run()

  return c.json({ success: true, message: 'Branding saved' })
})

// PUT ad connections
customerAuthRoutes.put('/branding/ads', async (c) => {
  const customerId = await getCustomerId(c)
  if (!customerId) return c.json({ error: 'Not authenticated' }, 401)

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE customers SET
      ad_facebook_connected = ?,
      ad_facebook_page_id = ?,
      ad_google_connected = ?,
      ad_google_account_id = ?,
      ad_meta_pixel_id = ?,
      ad_google_analytics_id = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.facebook_connected ? 1 : 0,
    body.facebook_page_id || null,
    body.google_connected ? 1 : 0,
    body.google_account_id || null,
    body.meta_pixel_id || null,
    body.google_analytics_id || null,
    customerId
  ).run()

  return c.json({ success: true, message: 'Ad settings saved' })
})

// POST logo upload (base64 → stored as data URI)
customerAuthRoutes.post('/branding/logo', async (c) => {
  const customerId = await getCustomerId(c)
  if (!customerId) return c.json({ error: 'Not authenticated' }, 401)

  const body = await c.req.json()
  const logoData = body.logo_data // base64 data URI

  if (!logoData) return c.json({ error: 'No logo data provided' }, 400)

  // Validate it's a reasonable size (max ~500KB base64)
  if (logoData.length > 700000) {
    return c.json({ error: 'Logo too large. Max 500KB. Please use a smaller image.' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE customers SET brand_logo_url = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(logoData, customerId).run()

  return c.json({ success: true, logo_url: logoData })
})
