import { Hono } from 'hono'
import type { Bindings } from '../types'

export const d2dRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Validate customer session token
// ============================================================
async function getUser(c: any): Promise<{ id: number; role?: string } | null> {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const session = await c.env.DB.prepare(
    "SELECT cs.customer_id, cu.name, cu.email FROM customer_sessions cs JOIN customers cu ON cu.id = cs.customer_id WHERE cs.session_token = ? AND cs.expires_at > datetime('now')"
  ).bind(token).first<any>()
  if (!session) return null

  // Check if user has a d2d_team_members entry for role
  const member = await c.env.DB.prepare(
    'SELECT role FROM d2d_team_members WHERE customer_id = ?'
  ).bind(session.customer_id).first<any>()

  return { id: session.customer_id, role: member?.role || 'member' }
}

// ============================================================
// DB SETUP — Create D2D tables on first request
// ============================================================
let d2dTablesCreated = false

async function ensureD2DTables(db: any) {
  if (d2dTablesCreated) return
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS d2d_team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        customer_id INTEGER,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        role TEXT DEFAULT 'salesperson',
        color TEXT DEFAULT '#3B82F6',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id)
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS d2d_turfs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        polygon_json TEXT NOT NULL,
        center_lat REAL,
        center_lng REAL,
        color TEXT DEFAULT '#3B82F6',
        assigned_to INTEGER,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id),
        FOREIGN KEY (assigned_to) REFERENCES d2d_team_members(id)
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS d2d_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        turf_id INTEGER,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        address TEXT,
        status TEXT DEFAULT 'not_knocked',
        notes TEXT,
        knocked_by INTEGER,
        knocked_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id),
        FOREIGN KEY (turf_id) REFERENCES d2d_turfs(id),
        FOREIGN KEY (knocked_by) REFERENCES d2d_team_members(id)
      )
    `).run()

    // Indexes
    try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_d2d_turfs_owner ON d2d_turfs(owner_id)').run() } catch(e) {}
    try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_d2d_pins_turf ON d2d_pins(turf_id)').run() } catch(e) {}
    try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_d2d_pins_owner ON d2d_pins(owner_id)').run() } catch(e) {}
    try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_d2d_team_owner ON d2d_team_members(owner_id)').run() } catch(e) {}

    d2dTablesCreated = true
  } catch (e: any) {
    console.log('[D2D] Table creation note:', e.message)
    d2dTablesCreated = true
  }
}

// ============================================================
// TEAM MEMBERS
// ============================================================

// LIST team members
d2dRoutes.get('/team', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const members = await c.env.DB.prepare(
    `SELECT tm.*, 
      (SELECT COUNT(*) FROM d2d_turfs t WHERE t.assigned_to = tm.id) as turf_count,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.knocked_by = tm.id) as knock_count,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.knocked_by = tm.id AND p.status = 'yes') as yes_count
     FROM d2d_team_members tm WHERE tm.owner_id = ? AND tm.is_active = 1 ORDER BY tm.name`
  ).bind(user.id).all()

  return c.json({ members: members.results })
})

// CREATE team member
d2dRoutes.post('/team', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const { name, email, phone, role, color } = await c.req.json()
  if (!name) return c.json({ error: 'Name is required' }, 400)

  // Check if this email matches an existing customer account
  let customerId = null
  if (email) {
    const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind(email).first<any>()
    if (existing) customerId = existing.id
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO d2d_team_members (owner_id, customer_id, name, email, phone, role, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(user.id, customerId, name, email || null, phone || null, role || 'salesperson', color || '#3B82F6').run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// UPDATE team member
d2dRoutes.put('/team/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const { name, email, phone, role, color, is_active } = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE d2d_team_members SET name = COALESCE(?, name), email = COALESCE(?, email),
     phone = COALESCE(?, phone), role = COALESCE(?, role), color = COALESCE(?, color),
     is_active = COALESCE(?, is_active) WHERE id = ? AND owner_id = ?`
  ).bind(name, email, phone, role, color, is_active, id, user.id).run()

  return c.json({ success: true })
})

// DELETE team member (soft)
d2dRoutes.delete('/team/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE d2d_team_members SET is_active = 0 WHERE id = ? AND owner_id = ?').bind(id, user.id).run()
  return c.json({ success: true })
})

// ============================================================
// TURFS
// ============================================================

// LIST turfs
d2dRoutes.get('/turfs', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const turfs = await c.env.DB.prepare(
    `SELECT t.*, tm.name as assigned_name, tm.color as member_color,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.turf_id = t.id) as total_pins,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.turf_id = t.id AND p.status = 'yes') as yes_count,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.turf_id = t.id AND p.status = 'no') as no_count,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.turf_id = t.id AND p.status = 'no_answer') as no_answer_count,
      (SELECT COUNT(*) FROM d2d_pins p WHERE p.turf_id = t.id AND p.status = 'not_knocked') as not_knocked_count
     FROM d2d_turfs t LEFT JOIN d2d_team_members tm ON tm.id = t.assigned_to
     WHERE t.owner_id = ? ORDER BY t.created_at DESC`
  ).bind(user.id).all()

  return c.json({ turfs: turfs.results })
})

// CREATE turf
d2dRoutes.post('/turfs', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const { name, description, polygon, center_lat, center_lng, color, assigned_to } = await c.req.json()
  if (!name || !polygon || !Array.isArray(polygon) || polygon.length < 3) {
    return c.json({ error: 'Name and at least 3 polygon points required' }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO d2d_turfs (owner_id, name, description, polygon_json, center_lat, center_lng, color, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, name, description || null, JSON.stringify(polygon),
    center_lat || null, center_lng || null, color || '#3B82F6', assigned_to || null
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// UPDATE turf
d2dRoutes.put('/turfs/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const { name, description, polygon, color, assigned_to, status } = await c.req.json()

  let q = 'UPDATE d2d_turfs SET updated_at = datetime(\'now\')'
  const params: any[] = []
  if (name !== undefined) { q += ', name = ?'; params.push(name) }
  if (description !== undefined) { q += ', description = ?'; params.push(description) }
  if (polygon !== undefined) { q += ', polygon_json = ?'; params.push(JSON.stringify(polygon)) }
  if (color !== undefined) { q += ', color = ?'; params.push(color) }
  if (assigned_to !== undefined) { q += ', assigned_to = ?'; params.push(assigned_to || null) }
  if (status !== undefined) { q += ', status = ?'; params.push(status) }
  q += ' WHERE id = ? AND owner_id = ?'
  params.push(id, user.id)

  await c.env.DB.prepare(q).bind(...params).run()
  return c.json({ success: true })
})

// DELETE turf
d2dRoutes.delete('/turfs/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  // Delete pins first, then the turf
  await c.env.DB.prepare('DELETE FROM d2d_pins WHERE turf_id = ? AND owner_id = ?').bind(id, user.id).run()
  await c.env.DB.prepare('DELETE FROM d2d_turfs WHERE id = ? AND owner_id = ?').bind(id, user.id).run()
  return c.json({ success: true })
})

// ============================================================
// PINS (Door Knocks)
// ============================================================

// LIST pins for a turf (or all)
d2dRoutes.get('/pins', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const turfId = c.req.query('turf_id')
  const status = c.req.query('status')

  let q = `SELECT p.*, tm.name as knocked_by_name, t.name as turf_name
     FROM d2d_pins p
     LEFT JOIN d2d_team_members tm ON tm.id = p.knocked_by
     LEFT JOIN d2d_turfs t ON t.id = p.turf_id
     WHERE p.owner_id = ?`
  const params: any[] = [user.id]
  if (turfId) { q += ' AND p.turf_id = ?'; params.push(turfId) }
  if (status) { q += ' AND p.status = ?'; params.push(status) }
  q += ' ORDER BY p.updated_at DESC'

  const pins = await c.env.DB.prepare(q).bind(...params).all()
  return c.json({ pins: pins.results })
})

// CREATE pin
d2dRoutes.post('/pins', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const { lat, lng, address, turf_id, status, notes, knocked_by } = await c.req.json()
  if (lat === undefined || lat === null || lng === undefined || lng === null) return c.json({ error: 'lat and lng are required' }, 400)

  const result = await c.env.DB.prepare(
    `INSERT INTO d2d_pins (owner_id, turf_id, lat, lng, address, status, notes, knocked_by, knocked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status && status !== 'not_knocked' ? "datetime('now')" : 'NULL'})`
  ).bind(
    user.id, turf_id || null, lat, lng, address || null,
    status || 'not_knocked', notes || null, knocked_by || null
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// UPDATE pin (change status)
d2dRoutes.put('/pins/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  const { status, notes, knocked_by } = await c.req.json()

  const knockedAt = status && status !== 'not_knocked' ? "datetime('now')" : 'NULL'

  await c.env.DB.prepare(
    `UPDATE d2d_pins SET status = COALESCE(?, status), notes = COALESCE(?, notes),
     knocked_by = COALESCE(?, knocked_by), knocked_at = ${knockedAt},
     updated_at = datetime('now') WHERE id = ? AND owner_id = ?`
  ).bind(status, notes, knocked_by, id, user.id).run()

  return c.json({ success: true })
})

// DELETE pin
d2dRoutes.delete('/pins/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM d2d_pins WHERE id = ? AND owner_id = ?').bind(id, user.id).run()
  return c.json({ success: true })
})

// ============================================================
// STATS — Dashboard summary
// ============================================================
d2dRoutes.get('/stats', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  await ensureD2DTables(c.env.DB)

  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM d2d_turfs WHERE owner_id = ?) as total_turfs,
      (SELECT COUNT(*) FROM d2d_team_members WHERE owner_id = ? AND is_active = 1) as total_members,
      (SELECT COUNT(*) FROM d2d_pins WHERE owner_id = ?) as total_pins,
      (SELECT COUNT(*) FROM d2d_pins WHERE owner_id = ? AND status = 'yes') as total_yes,
      (SELECT COUNT(*) FROM d2d_pins WHERE owner_id = ? AND status = 'no') as total_no,
      (SELECT COUNT(*) FROM d2d_pins WHERE owner_id = ? AND status = 'no_answer') as total_no_answer,
      (SELECT COUNT(*) FROM d2d_pins WHERE owner_id = ? AND status = 'not_knocked') as total_not_knocked
  `).bind(user.id, user.id, user.id, user.id, user.id, user.id, user.id).first()

  return c.json({ stats })
})
