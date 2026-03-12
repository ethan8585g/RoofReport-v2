// ============================================================
// RoofReporterAI — Virtual Try-On Routes
//
// WELD: Dispatcher + Webhook for Replicate AI inpainting.
// PAINT: Status polling for frontend.
// POLISH: Error handling, retries, job history.
//
// Architecture:
//   POST /api/virtual-tryon/generate    → Dispatch to Replicate (async)
//   POST /api/virtual-tryon/webhook     → Replicate webhook callback
//   GET  /api/virtual-tryon/status/:id  → Poll job status
//   GET  /api/virtual-tryon/history     → Customer job history
//   POST /api/virtual-tryon/cancel/:id  → Cancel a pending job
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'

const virtualTryonRoutes = new Hono<{ Bindings: Bindings }>()

// ── CONSTANTS ──────────────────────────────────────────────

const REPLICATE_API_BASE = 'https://api.replicate.com/v1/predictions'

// Stable Diffusion inpainting model — production-grade for architectural exteriors
// Can swap to any Replicate model version as needed
const DEFAULT_MODEL_VERSION = 'stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3'

// Prompt templates by roof style
const ROOF_PROMPTS: Record<string, (color: string) => string> = {
  metal: (color) => `a high quality, photorealistic standing seam metal roof, ${color} color, architectural exterior, bright daylight, professional roofing, clean crisp lines, realistic shadows`,
  asphalt: (color) => `a high quality, photorealistic architectural asphalt shingle roof, ${color} color, dimensional shingles, residential exterior, bright daylight, realistic texture`,
  tile: (color) => `a high quality, photorealistic clay tile roof, ${color} color, Mediterranean style, architectural exterior, bright daylight, realistic shadows`,
  slate: (color) => `a high quality, photorealistic natural slate roof, ${color} color, premium residential exterior, bright daylight, realistic stone texture`,
  cedar: (color) => `a high quality, photorealistic cedar shake roof, ${color} color, natural wood texture, architectural exterior, bright daylight, realistic grain`,
}

const NEGATIVE_PROMPT = 'ugly, distorted, messy edges, low resolution, blurry, deformed, cartoon, painting, illustration, sketch, watermark, text, artifacts, oversaturated'

// ── HELPER: Get customer ID from auth token ────────────────

async function getCustomerId(c: any): Promise<number | null> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await c.env.DB.prepare(`
    SELECT customer_id FROM customer_sessions
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(token).first<any>()
  return session?.customer_id || null
}

// ============================================================
// POST /generate — WELD: Dispatch to Replicate
//
// Receives photo + mask from frontend, fires async prediction.
// Returns immediately with jobId for polling.
// ============================================================

virtualTryonRoutes.post('/generate', async (c) => {
  const startTime = Date.now()
  const customerId = await getCustomerId(c)

  try {
    const body = await c.req.json()
    const {
      original_image,     // base64 data URI or URL
      mask_image,         // base64 data URI or URL
      roof_style = 'metal',
      roof_color = 'charcoal grey',
      order_id = null,
      custom_prompt = null,
    } = body

    // Validation
    if (!original_image) {
      return c.json({ success: false, error: 'original_image is required' }, 400)
    }
    if (!mask_image) {
      return c.json({ success: false, error: 'mask_image is required (draw over the roof area)' }, 400)
    }

    // Check for API key
    const apiKey = c.env.REPLICATE_API_KEY
    if (!apiKey) {
      return c.json({
        success: false,
        error: 'Virtual Try-On not configured. REPLICATE_API_KEY required.',
        setup_hint: 'Add REPLICATE_API_KEY via: npx wrangler pages secret put REPLICATE_API_KEY'
      }, 503)
    }

    // Build prompt
    const promptFn = ROOF_PROMPTS[roof_style] || ROOF_PROMPTS.metal
    const prompt = custom_prompt || promptFn(roof_color)

    // Build webhook URL — use the request's own host
    const requestUrl = new URL(c.req.url)
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.host}/api/virtual-tryon/webhook`

    // ── Fire prediction to Replicate ──
    const replicatePayload = {
      version: DEFAULT_MODEL_VERSION.split(':')[1],
      input: {
        image: original_image,
        mask: mask_image,
        prompt: prompt,
        negative_prompt: NEGATIVE_PROMPT,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        scheduler: 'K_EULER_ANCESTRAL',
      },
      webhook: webhookUrl,
      webhook_events_filter: ['completed'],
    }

    console.log(`[VirtualTryOn] Dispatching to Replicate — style=${roof_style}, color=${roof_color}, webhook=${webhookUrl}`)

    const replicateResponse = await fetch(REPLICATE_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'respond-async',
      },
      body: JSON.stringify(replicatePayload),
    })

    if (!replicateResponse.ok) {
      const errText = await replicateResponse.text()
      console.error(`[VirtualTryOn] Replicate API error: ${replicateResponse.status} — ${errText}`)
      return c.json({
        success: false,
        error: `Replicate API error: ${replicateResponse.status}`,
        detail: errText.slice(0, 500),
      }, 502)
    }

    const prediction = await replicateResponse.json() as any
    const jobId = prediction.id

    if (!jobId) {
      return c.json({ success: false, error: 'No prediction ID returned from Replicate' }, 502)
    }

    // ── Write to D1 — initial job record ──
    await c.env.DB.prepare(`
      INSERT INTO roof_jobs (job_id, customer_id, order_id, status, prompt, roof_style, roof_color,
                              original_image_url, mask_image_url, replicate_model, created_at, updated_at)
      VALUES (?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      jobId,
      customerId,
      order_id,
      prompt,
      roof_style,
      roof_color,
      // Store a truncated reference (not the full base64 for DB size)
      original_image.length > 500 ? '[base64_uploaded]' : original_image,
      mask_image.length > 500 ? '[base64_uploaded]' : mask_image,
      DEFAULT_MODEL_VERSION,
    ).run()

    const elapsed = Date.now() - startTime
    console.log(`[VirtualTryOn] Job ${jobId} dispatched in ${elapsed}ms — customer=${customerId || 'anon'}`)

    // ── Return immediately — don't wait for generation ──
    return c.json({
      success: true,
      status: 'processing',
      job_id: jobId,
      message: 'Your virtual roof preview is being generated. Poll /api/virtual-tryon/status/' + jobId + ' for updates.',
      estimated_time_seconds: 15,
      poll_url: `/api/virtual-tryon/status/${jobId}`,
      dispatched_ms: elapsed,
    })

  } catch (err: any) {
    console.error(`[VirtualTryOn] Generate error:`, err.message)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ============================================================
// POST /webhook — WELD: Replicate webhook callback
//
// Called by Replicate when prediction completes (or fails).
// Updates the roof_jobs row with final_image_url or error.
// Always returns 200 to acknowledge receipt.
// ============================================================

virtualTryonRoutes.post('/webhook', async (c) => {
  try {
    const payload = await c.req.json() as any
    const jobId = payload.id
    const status = payload.status  // 'succeeded' | 'failed' | 'canceled'
    const output = payload.output  // Array of image URLs on success

    if (!jobId) {
      console.warn('[VirtualTryOn Webhook] No prediction ID in payload')
      return c.json({ received: true }, 200)
    }

    console.log(`[VirtualTryOn Webhook] Job ${jobId} — status=${status}`)

    if (status === 'succeeded' && output && output.length > 0) {
      const finalImageUrl = Array.isArray(output) ? output[0] : output
      const processingTime = payload.metrics?.predict_time
        ? Math.round(payload.metrics.predict_time * 1000)
        : null

      await c.env.DB.prepare(`
        UPDATE roof_jobs
        SET status = 'succeeded',
            final_image_url = ?,
            processing_time_ms = ?,
            updated_at = datetime('now')
        WHERE job_id = ?
      `).bind(finalImageUrl, processingTime, jobId).run()

      console.log(`[VirtualTryOn Webhook] Job ${jobId} SUCCEEDED — image: ${finalImageUrl.slice(0, 80)}...`)

    } else if (status === 'failed') {
      const errorMsg = payload.error || 'Generation failed (no details from Replicate)'

      await c.env.DB.prepare(`
        UPDATE roof_jobs
        SET status = 'failed',
            error_message = ?,
            updated_at = datetime('now')
        WHERE job_id = ?
      `).bind(String(errorMsg).slice(0, 1000), jobId).run()

      console.error(`[VirtualTryOn Webhook] Job ${jobId} FAILED — ${errorMsg}`)

    } else if (status === 'canceled') {
      await c.env.DB.prepare(`
        UPDATE roof_jobs
        SET status = 'cancelled',
            updated_at = datetime('now')
        WHERE job_id = ?
      `).bind(jobId).run()

      console.log(`[VirtualTryOn Webhook] Job ${jobId} CANCELLED`)

    } else {
      console.log(`[VirtualTryOn Webhook] Job ${jobId} — unhandled status: ${status}`)
    }

    // Always return 200 to Replicate
    return c.json({ received: true, job_id: jobId, status }, 200)

  } catch (err: any) {
    console.error(`[VirtualTryOn Webhook] Error processing webhook:`, err.message)
    // Still return 200 — we don't want Replicate to retry
    return c.json({ received: true, error: err.message }, 200)
  }
})

// ============================================================
// GET /status/:jobId — PAINT: Frontend polls this for updates
// ============================================================

virtualTryonRoutes.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId')

  const job = await c.env.DB.prepare(`
    SELECT job_id, status, final_image_url, error_message, roof_style, roof_color,
           processing_time_ms, created_at, updated_at
    FROM roof_jobs WHERE job_id = ?
  `).bind(jobId).first<any>()

  if (!job) {
    return c.json({ success: false, error: 'Job not found', job_id: jobId }, 404)
  }

  // Calculate elapsed time if still processing
  const elapsedMs = job.status === 'processing'
    ? Date.now() - new Date(job.created_at + 'Z').getTime()
    : job.processing_time_ms || 0

  return c.json({
    success: true,
    job_id: job.job_id,
    status: job.status,
    final_image_url: job.final_image_url || null,
    error_message: job.error_message || null,
    roof_style: job.roof_style,
    roof_color: job.roof_color,
    processing_time_ms: job.processing_time_ms || null,
    elapsed_ms: elapsedMs,
    created_at: job.created_at,
    updated_at: job.updated_at,
  })
})

// ============================================================
// GET /history — Customer's past virtual try-on jobs
// ============================================================

virtualTryonRoutes.get('/history', async (c) => {
  const customerId = await getCustomerId(c)
  if (!customerId) return c.json({ error: 'Not authenticated' }, 401)

  const { results } = await c.env.DB.prepare(`
    SELECT job_id, status, final_image_url, roof_style, roof_color,
           processing_time_ms, created_at, updated_at
    FROM roof_jobs
    WHERE customer_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(customerId).all<any>()

  return c.json({
    success: true,
    jobs: results || [],
    count: (results || []).length,
  })
})

// ============================================================
// POST /cancel/:jobId — Cancel a pending job
// ============================================================

virtualTryonRoutes.post('/cancel/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const customerId = await getCustomerId(c)

  // Verify ownership
  const job = await c.env.DB.prepare(`
    SELECT job_id, status, customer_id FROM roof_jobs WHERE job_id = ?
  `).bind(jobId).first<any>()

  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.customer_id && job.customer_id !== customerId) {
    return c.json({ error: 'Not authorized' }, 403)
  }
  if (job.status !== 'processing') {
    return c.json({ error: `Job already ${job.status}` }, 400)
  }

  // Try to cancel on Replicate
  const apiKey = c.env.REPLICATE_API_KEY
  if (apiKey) {
    try {
      await fetch(`${REPLICATE_API_BASE}/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
    } catch (e) {
      console.warn(`[VirtualTryOn] Failed to cancel on Replicate: ${e}`)
    }
  }

  await c.env.DB.prepare(`
    UPDATE roof_jobs SET status = 'cancelled', updated_at = datetime('now') WHERE job_id = ?
  `).bind(jobId).run()

  return c.json({ success: true, status: 'cancelled' })
})

// ============================================================
// GET /styles — Available roof styles and colors for the UI
// ============================================================

virtualTryonRoutes.get('/styles', async (c) => {
  return c.json({
    success: true,
    styles: [
      { id: 'metal', label: 'Standing Seam Metal', icon: 'fa-industry', popular: true },
      { id: 'asphalt', label: 'Architectural Shingles', icon: 'fa-home', popular: true },
      { id: 'tile', label: 'Clay / Concrete Tile', icon: 'fa-building', popular: false },
      { id: 'slate', label: 'Natural Slate', icon: 'fa-gem', popular: false },
      { id: 'cedar', label: 'Cedar Shake', icon: 'fa-tree', popular: false },
    ],
    colors: [
      { id: 'charcoal grey', label: 'Charcoal Grey', hex: '#36454F', popular: true },
      { id: 'matte black', label: 'Matte Black', hex: '#1a1a1a', popular: true },
      { id: 'dark bronze', label: 'Dark Bronze', hex: '#4a3728', popular: true },
      { id: 'forest green', label: 'Forest Green', hex: '#228B22', popular: false },
      { id: 'barn red', label: 'Barn Red', hex: '#7C0A02', popular: false },
      { id: 'slate blue', label: 'Slate Blue', hex: '#6A7B8B', popular: false },
      { id: 'weathered copper', label: 'Weathered Copper', hex: '#6D8B74', popular: false },
      { id: 'galvalume silver', label: 'Galvalume Silver', hex: '#C0C0C0', popular: false },
      { id: 'sandstone tan', label: 'Sandstone Tan', hex: '#C2B280', popular: false },
      { id: 'colonial red', label: 'Colonial Red', hex: '#9B1B30', popular: false },
    ],
  })
})

export { virtualTryonRoutes }
