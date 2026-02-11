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
