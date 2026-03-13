// ============================================================
// HeyGen AI Video Generation — Marketing & Report Videos
// API proxy routes for HeyGen v2 API integration
// ============================================================

import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    HEYGEN_API_KEY: string
    ADMIN_BOOTSTRAP_EMAIL?: string
  }
}

const heygen = new Hono<Env>()

const HEYGEN_BASE = 'https://api.heygen.com'

// ── Middleware: require super-admin ─────────────────────────
heygen.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) return c.json({ error: 'Unauthorized' }, 403)
  const token = authHeader.replace('Bearer ', '')
  const session = await c.env.DB.prepare('SELECT u.email, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\'now\')').bind(token).first<{ email: string; role: string }>()
  if (!session) return c.json({ error: 'Invalid session' }, 403)
  const isAdmin = session.role === 'super_admin' || session.email === c.env.ADMIN_BOOTSTRAP_EMAIL
  if (!isAdmin) return c.json({ error: 'Super admin required' }, 403)
  await next()
})

// ── Helper: proxy to HeyGen API ─────────────────────────
async function heygenFetch(env: Env['Bindings'], path: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = env.HEYGEN_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'HEYGEN_API_KEY not configured. Add it via: wrangler pages secret put HEYGEN_API_KEY --project-name roofing-measurement-tool' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }
  const headers: Record<string, string> = {
    'X-Api-Key': apiKey,
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }
  return fetch(`${HEYGEN_BASE}${path}`, { ...options, headers })
}

// ============================================================
// DASHBOARD
// ============================================================

// GET /dashboard — video stats + recent videos
heygen.get('/dashboard', async (c) => {
  const db = c.env.DB
  const [total, completed, processing, failed, recent, templates] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM heygen_videos').first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM heygen_videos WHERE status = 'completed'").first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM heygen_videos WHERE status IN ('pending','processing')").first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM heygen_videos WHERE status = 'failed'").first<{ cnt: number }>(),
    db.prepare('SELECT id, video_id, title, category, status, avatar_name, duration_seconds, video_url, thumbnail_url, created_at, completed_at FROM heygen_videos ORDER BY created_at DESC LIMIT 10').all(),
    db.prepare('SELECT id, name, category, description, usage_count FROM heygen_templates WHERE is_active = 1 ORDER BY usage_count DESC').all(),
  ])
  return c.json({
    stats: {
      total: total?.cnt || 0,
      completed: completed?.cnt || 0,
      processing: processing?.cnt || 0,
      failed: failed?.cnt || 0,
    },
    recent_videos: recent?.results || [],
    templates: templates?.results || [],
    api_configured: !!c.env.HEYGEN_API_KEY,
  })
})

// ============================================================
// AVATARS & VOICES (proxy to HeyGen)
// ============================================================

// GET /avatars — list available avatars
heygen.get('/avatars', async (c) => {
  const resp = await heygenFetch(c.env, '/v2/avatars')
  if (!resp.ok) {
    const err = await resp.text()
    return c.json({ error: 'HeyGen API error', detail: err, status: resp.status }, 502)
  }
  const data: any = await resp.json()
  // Extract and simplify avatar list
  const avatars = (data.data?.avatars || []).map((a: any) => ({
    avatar_id: a.avatar_id,
    avatar_name: a.avatar_name,
    gender: a.gender,
    preview_image_url: a.preview_image_url,
    preview_video_url: a.preview_video_url,
  }))
  return c.json({ avatars, count: avatars.length })
})

// GET /voices — list available voices
heygen.get('/voices', async (c) => {
  const resp = await heygenFetch(c.env, '/v2/voices')
  if (!resp.ok) {
    const err = await resp.text()
    return c.json({ error: 'HeyGen API error', detail: err, status: resp.status }, 502)
  }
  const data: any = await resp.json()
  const voices = (data.data?.voices || []).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name || v.display_name,
    language: v.language,
    gender: v.gender,
    preview_audio: v.preview_audio,
    support_pause: v.support_pause,
  }))
  return c.json({ voices, count: voices.length })
})

// ============================================================
// VIDEO GENERATION
// ============================================================

// POST /generate — create a new video via HeyGen v2 API
heygen.post('/generate', async (c) => {
  const body = await c.req.json<{
    title: string
    category?: string
    avatar_id: string
    avatar_name?: string
    voice_id: string
    voice_name?: string
    script: string
    dimension?: string
    aspect_ratio?: string
    background_color?: string
    background_image_url?: string
    order_id?: number
    report_id?: number
    template_id?: number
  }>()

  if (!body.title || !body.avatar_id || !body.voice_id || !body.script) {
    return c.json({ error: 'title, avatar_id, voice_id, and script are required' }, 400)
  }

  // Build HeyGen v2 video generation request
  const dimension = body.dimension || '1920x1080'
  const [w, h] = dimension.split('x').map(Number)

  const heygenPayload: any = {
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: body.avatar_id,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: body.script,
        voice_id: body.voice_id,
        speed: 1.0,
      },
      background: body.background_image_url
        ? { type: 'image', url: body.background_image_url }
        : { type: 'color', value: body.background_color || '#ffffff' },
    }],
    dimension: { width: w || 1920, height: h || 1080 },
    test: false,
  }

  // Call HeyGen API
  const resp = await heygenFetch(c.env, '/v2/video/generate', {
    method: 'POST',
    body: JSON.stringify(heygenPayload),
  })

  const result: any = await resp.json()

  if (!resp.ok || result.error) {
    // Save failed attempt
    await c.env.DB.prepare(`INSERT INTO heygen_videos (title, category, status, avatar_id, avatar_name, voice_id, voice_name, script, dimension, aspect_ratio, error_message, order_id, report_id, heygen_response_raw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(body.title, body.category || 'marketing', 'failed', body.avatar_id, body.avatar_name || '', body.voice_id, body.voice_name || '', body.script, dimension, body.aspect_ratio || '16:9', result.error?.message || JSON.stringify(result), body.order_id || null, body.report_id || null, JSON.stringify(result))
      .run()
    return c.json({ error: 'Video generation failed', detail: result }, 502)
  }

  const videoId = result.data?.video_id
  if (!videoId) {
    return c.json({ error: 'No video_id in response', detail: result }, 502)
  }

  // Save to DB
  await c.env.DB.prepare(`INSERT INTO heygen_videos (video_id, title, category, status, avatar_id, avatar_name, voice_id, voice_name, script, dimension, aspect_ratio, order_id, report_id, heygen_response_raw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(videoId, body.title, body.category || 'marketing', 'processing', body.avatar_id, body.avatar_name || '', body.voice_id, body.voice_name || '', body.script, dimension, body.aspect_ratio || '16:9', body.order_id || null, body.report_id || null, JSON.stringify(result))
    .run()

  // Update template usage count if template was used
  if (body.template_id) {
    await c.env.DB.prepare('UPDATE heygen_templates SET usage_count = usage_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(body.template_id).run()
  }

  return c.json({ success: true, video_id: videoId, status: 'processing', message: 'Video generation started. Poll /status/:video_id for updates.' })
})

// POST /generate-agent — use HeyGen Video Agent (prompt-to-video)
heygen.post('/generate-agent', async (c) => {
  const body = await c.req.json<{
    title: string
    category?: string
    prompt: string
    aspect_ratio?: string
    order_id?: number
    report_id?: number
  }>()

  if (!body.title || !body.prompt) {
    return c.json({ error: 'title and prompt are required' }, 400)
  }

  const resp = await heygenFetch(c.env, '/v1/video_agent/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio || '16:9',
    }),
  })

  const result: any = await resp.json()

  if (!resp.ok || result.error) {
    await c.env.DB.prepare(`INSERT INTO heygen_videos (title, category, status, prompt, aspect_ratio, error_message, order_id, report_id, heygen_response_raw) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(body.title, body.category || 'marketing', 'failed', body.prompt, body.aspect_ratio || '16:9', result.error?.message || JSON.stringify(result), body.order_id || null, body.report_id || null, JSON.stringify(result))
      .run()
    return c.json({ error: 'Video Agent generation failed', detail: result }, 502)
  }

  const videoId = result.data?.video_id
  if (!videoId) {
    return c.json({ error: 'No video_id in response', detail: result }, 502)
  }

  await c.env.DB.prepare(`INSERT INTO heygen_videos (video_id, title, category, status, prompt, aspect_ratio, order_id, report_id, heygen_response_raw) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(videoId, body.title, body.category || 'marketing', 'processing', body.prompt, body.aspect_ratio || '16:9', body.order_id || null, body.report_id || null, JSON.stringify(result))
    .run()

  return c.json({ success: true, video_id: videoId, status: 'processing' })
})

// ============================================================
// VIDEO STATUS & MANAGEMENT
// ============================================================

// GET /status/:video_id — check video status + sync to DB
heygen.get('/status/:video_id', async (c) => {
  const videoId = c.req.param('video_id')
  const resp = await heygenFetch(c.env, `/v1/video_status.get?video_id=${videoId}`)
  const result: any = await resp.json()

  if (!resp.ok) {
    return c.json({ error: 'Failed to check status', detail: result }, 502)
  }

  const status = result.data?.status
  const videoUrl = result.data?.video_url
  const thumbUrl = result.data?.thumbnail_url
  const captionUrl = result.data?.caption_url
  const duration = result.data?.duration

  // Sync status to DB
  if (status === 'completed' && videoUrl) {
    await c.env.DB.prepare(`UPDATE heygen_videos SET status = 'completed', video_url = ?, thumbnail_url = ?, caption_url = ?, duration_seconds = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE video_id = ?`)
      .bind(videoUrl, thumbUrl || '', captionUrl || '', duration || 0, videoId)
      .run()
  } else if (status === 'failed') {
    await c.env.DB.prepare(`UPDATE heygen_videos SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE video_id = ?`)
      .bind(result.data?.error || 'Unknown error', videoId)
      .run()
  } else if (status === 'processing' || status === 'pending') {
    await c.env.DB.prepare(`UPDATE heygen_videos SET status = ?, updated_at = datetime('now') WHERE video_id = ?`)
      .bind(status, videoId)
      .run()
  }

  return c.json({
    video_id: videoId,
    status,
    video_url: videoUrl,
    thumbnail_url: thumbUrl,
    caption_url: captionUrl,
    duration,
    raw: result.data,
  })
})

// GET /videos — list all videos from DB
heygen.get('/videos', async (c) => {
  const category = c.req.query('category')
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let sql = 'SELECT * FROM heygen_videos WHERE 1=1'
  const params: any[] = []

  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const videos = await c.env.DB.prepare(sql).bind(...params).all()
  const total = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM heygen_videos').first<{ cnt: number }>()

  return c.json({ videos: videos?.results || [], total: total?.cnt || 0 })
})

// DELETE /videos/:id — delete a video record
heygen.delete('/videos/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM heygen_videos WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// TEMPLATES
// ============================================================

// GET /templates
heygen.get('/templates', async (c) => {
  const templates = await c.env.DB.prepare('SELECT * FROM heygen_templates WHERE is_active = 1 ORDER BY usage_count DESC').all()
  return c.json({ templates: templates?.results || [] })
})

// POST /templates — create a new template
heygen.post('/templates', async (c) => {
  const body = await c.req.json<{
    name: string; category: string; description?: string
    avatar_id?: string; voice_id?: string; script_template?: string
    prompt_template?: string; dimension?: string; aspect_ratio?: string
    background_color?: string; background_image_url?: string
  }>()

  if (!body.name) return c.json({ error: 'name is required' }, 400)

  await c.env.DB.prepare(`INSERT INTO heygen_templates (name, category, description, avatar_id, voice_id, script_template, prompt_template, dimension, aspect_ratio, background_color, background_image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(body.name, body.category || 'marketing', body.description || '', body.avatar_id || '', body.voice_id || '', body.script_template || '', body.prompt_template || '', body.dimension || '1920x1080', body.aspect_ratio || '16:9', body.background_color || '', body.background_image_url || '')
    .run()

  return c.json({ success: true })
})

// DELETE /templates/:id
heygen.delete('/templates/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE heygen_templates SET is_active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// REPORT VIDEO GENERATION — Personalized report walkthrough
// ============================================================

// POST /report-video/:orderId — generate a video walkthrough of a roof report
heygen.post('/report-video/:orderId', async (c) => {
  const orderId = parseInt(c.req.param('orderId'))
  const body = await c.req.json<{
    avatar_id: string; avatar_name?: string
    voice_id: string; voice_name?: string
    custom_script?: string
  }>()

  // Fetch report data
  const report = await c.env.DB.prepare(`SELECT r.*, o.address, o.city, o.province, o.postal_code FROM reports r JOIN orders o ON r.order_id = o.id WHERE r.order_id = ?`).bind(orderId).first<any>()

  if (!report) return c.json({ error: 'Report not found' }, 404)

  // Parse report data
  let reportData: any = {}
  try { reportData = JSON.parse(report.api_response_raw || '{}') } catch {}

  const address = [report.address, report.city, report.province].filter(Boolean).join(', ')
  const totalSquares = (report.roof_area_sqft / 100).toFixed(1)
  const pitch = reportData.roof_pitch_ratio || '5:12'
  const segments = reportData.segments?.length || 4
  const eave = report.total_eave_ft || 0
  const ridge = report.total_ridge_ft || 0

  // Build script from template or custom
  const script = body.custom_script || `Hi there! I have your Roof Reporter AI measurement report ready for the property at ${address}. ` +
    `Your roof has a total measured area of ${totalSquares} squares with a predominant pitch of ${pitch}. ` +
    `We identified ${segments} roof planes in total. ` +
    `Key edge measurements include ${Math.round(eave)} linear feet of eave and ${Math.round(ridge)} linear feet of ridge. ` +
    `The report includes a full diagram, waste factor analysis, and material estimation. ` +
    `All measurements are generated using our AI-powered satellite imagery analysis engine. ` +
    `If you have any questions about your report, our team is here to help. Thank you for using Roof Reporter AI!`

  // Generate via HeyGen
  const heygenPayload = {
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: body.avatar_id,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: script,
        voice_id: body.voice_id,
        speed: 1.0,
      },
      background: { type: 'color', value: '#1a2332' },
    }],
    dimension: { width: 1920, height: 1080 },
    test: false,
  }

  const resp = await heygenFetch(c.env, '/v2/video/generate', {
    method: 'POST',
    body: JSON.stringify(heygenPayload),
  })

  const result: any = await resp.json()
  const videoId = result.data?.video_id

  if (!videoId) {
    return c.json({ error: 'Video generation failed', detail: result }, 502)
  }

  // Save with report link
  await c.env.DB.prepare(`INSERT INTO heygen_videos (video_id, title, category, status, avatar_id, avatar_name, voice_id, voice_name, script, dimension, aspect_ratio, order_id, report_id, heygen_response_raw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(videoId, `Report Walkthrough — ${address}`, 'report_walkthrough', 'processing', body.avatar_id, body.avatar_name || '', body.voice_id, body.voice_name || '', script, '1920x1080', '16:9', orderId, report.id, JSON.stringify(result))
    .run()

  return c.json({ success: true, video_id: videoId, status: 'processing', script_used: script })
})

// GET /remaining-quota — check HeyGen credit balance
heygen.get('/remaining-quota', async (c) => {
  const resp = await heygenFetch(c.env, '/v1/video/remaining_quota.get')
  if (!resp.ok) {
    return c.json({ error: 'Failed to check quota' }, 502)
  }
  const data: any = await resp.json()
  return c.json(data.data || data)
})

export { heygen as heygenRoutes }
