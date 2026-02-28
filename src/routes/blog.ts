import { Hono } from 'hono'
import type { Bindings } from '../types'

export const blogRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// PUBLIC: Get published blog posts (paginated)
// ============================================================
blogRoutes.get('/posts', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1')
    const limit = Math.min(parseInt(c.req.query('limit') || '12'), 50)
    const offset = (page - 1) * limit
    const category = c.req.query('category') || ''
    const search = c.req.query('search') || ''
    const featured = c.req.query('featured') || ''

    let query = `SELECT id, slug, title, excerpt, cover_image_url, category, tags, author_name, author_avatar_url, is_featured, read_time_minutes, view_count, published_at, created_at FROM blog_posts WHERE status = 'published'`
    const params: any[] = []

    if (category) {
      query += ` AND category = ?`
      params.push(category)
    }
    if (search) {
      query += ` AND (title LIKE ? OR excerpt LIKE ? OR tags LIKE ?)`
      const s = `%${search}%`
      params.push(s, s, s)
    }
    if (featured === '1') {
      query += ` AND is_featured = 1`
    }

    // Count total
    const countQuery = query.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM')
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>()
    const total = countResult?.total || 0

    query += ` ORDER BY is_featured DESC, published_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const posts = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      posts: posts.results || [],
      pagination: {
        page, limit, total,
        total_pages: Math.ceil(total / limit),
        has_more: offset + limit < total
      }
    })
  } catch (e: any) {
    // If table doesn't exist yet, return empty
    if (e.message?.includes('no such table')) {
      return c.json({ posts: [], pagination: { page: 1, limit: 12, total: 0, total_pages: 0, has_more: false } })
    }
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// PUBLIC: Get all categories with post counts
// ============================================================
blogRoutes.get('/categories', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT category, COUNT(*) as count FROM blog_posts WHERE status = 'published' GROUP BY category ORDER BY count DESC`
    ).all()
    return c.json({ categories: result.results || [] })
  } catch (e: any) {
    if (e.message?.includes('no such table')) {
      return c.json({ categories: [] })
    }
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// PUBLIC: Get single blog post by slug
// ============================================================
blogRoutes.get('/posts/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')
    const post = await c.env.DB.prepare(
      `SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'`
    ).bind(slug).first()

    if (!post) {
      return c.json({ error: 'Post not found' }, 404)
    }

    // Increment view count (non-blocking)
    c.executionCtx.waitUntil(
      c.env.DB.prepare(`UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?`).bind(post.id).run()
    )

    // Get related posts (same category, excluding current)
    const related = await c.env.DB.prepare(
      `SELECT id, slug, title, excerpt, cover_image_url, category, read_time_minutes, published_at 
       FROM blog_posts 
       WHERE status = 'published' AND id != ? AND category = ? 
       ORDER BY published_at DESC LIMIT 3`
    ).bind(post.id, post.category).all()

    return c.json({ post, related: related.results || [] })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN: Helper to validate admin session
// ============================================================
async function validateAdminSession(db: D1Database, authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const session = await db.prepare(
    `SELECT s.*, u.email, u.role FROM admin_sessions s JOIN admin_users u ON s.admin_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first()
  return session
}

// ============================================================
// ADMIN: List all blog posts (including drafts)
// ============================================================
blogRoutes.get('/admin/posts', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const posts = await c.env.DB.prepare(
      `SELECT * FROM blog_posts ORDER BY created_at DESC`
    ).all()
    return c.json({ posts: posts.results || [] })
  } catch (e: any) {
    if (e.message?.includes('no such table')) {
      return c.json({ posts: [] })
    }
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN: Create a new blog post
// ============================================================
blogRoutes.post('/admin/posts', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { title, slug, excerpt, content, cover_image_url, category, tags, author_name, status, is_featured, meta_title, meta_description, read_time_minutes } = body

    if (!title || !content) {
      return c.json({ error: 'Title and content are required' }, 400)
    }

    // Auto-generate slug if not provided
    const finalSlug = slug || title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100)

    // Auto-estimate read time (~200 words per minute)
    const wordCount = (content || '').split(/\s+/).length
    const estimatedReadTime = read_time_minutes || Math.max(1, Math.ceil(wordCount / 200))

    const publishedAt = status === 'published' ? new Date().toISOString() : null

    const result = await c.env.DB.prepare(
      `INSERT INTO blog_posts (slug, title, excerpt, content, cover_image_url, category, tags, author_name, status, is_featured, meta_title, meta_description, read_time_minutes, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      finalSlug,
      title,
      excerpt || '',
      content,
      cover_image_url || '',
      category || 'roofing',
      tags || '',
      author_name || 'RoofReporterAI Team',
      status || 'draft',
      is_featured ? 1 : 0,
      meta_title || title,
      meta_description || excerpt || '',
      estimatedReadTime,
      publishedAt
    ).run()

    return c.json({ success: true, id: result.meta.last_row_id, slug: finalSlug })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'A post with this slug already exists' }, 409)
    }
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN: Update a blog post
// ============================================================
blogRoutes.put('/admin/posts/:id', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { title, slug, excerpt, content, cover_image_url, category, tags, author_name, status, is_featured, meta_title, meta_description, read_time_minutes } = body

    // Check if transitioning to published
    const existing = await c.env.DB.prepare(`SELECT status, published_at FROM blog_posts WHERE id = ?`).bind(id).first()
    if (!existing) return c.json({ error: 'Post not found' }, 404)

    const publishedAt = (status === 'published' && existing.status !== 'published')
      ? new Date().toISOString()
      : existing.published_at

    // Auto-estimate read time
    const wordCount = (content || '').split(/\s+/).length
    const estimatedReadTime = read_time_minutes || Math.max(1, Math.ceil(wordCount / 200))

    await c.env.DB.prepare(
      `UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, cover_image_url=?, category=?, tags=?, author_name=?, status=?, is_featured=?, meta_title=?, meta_description=?, read_time_minutes=?, published_at=?, updated_at=datetime('now') WHERE id=?`
    ).bind(
      title, slug, excerpt || '', content, cover_image_url || '',
      category || 'roofing', tags || '', author_name || 'RoofReporterAI Team',
      status || 'draft', is_featured ? 1 : 0,
      meta_title || title, meta_description || excerpt || '',
      estimatedReadTime, publishedAt, id
    ).run()

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN: Delete a blog post
// ============================================================
blogRoutes.delete('/admin/posts/:id', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`DELETE FROM blog_posts WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN: Init blog table (fallback if migration not run)
// ============================================================
blogRoutes.post('/admin/init', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Unauthorized' }, 401)

  try {
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        cover_image_url TEXT,
        category TEXT DEFAULT 'roofing',
        tags TEXT,
        author_name TEXT DEFAULT 'RoofReporterAI Team',
        author_avatar_url TEXT,
        status TEXT DEFAULT 'draft',
        is_featured INTEGER DEFAULT 0,
        meta_title TEXT,
        meta_description TEXT,
        read_time_minutes INTEGER DEFAULT 5,
        view_count INTEGER DEFAULT 0,
        published_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run()
    return c.json({ success: true, message: 'Blog table created/verified' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})
