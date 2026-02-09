// ============================================================
// Reuse Canada - AI Measurement Engine API Routes
// Server-side Gemini Vision analysis for roof geometry
// ============================================================
// POST /api/ai/:orderId/analyze — Run full AI analysis
// GET  /api/ai/:orderId         — Retrieve stored AI results
// POST /api/ai/measure          — Quick measure by lat/lng (no order required)
// POST /api/ai/vertex-proxy     — Vertex AI proxy for frontend SDK calls
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { analyzeRoofGeometry, generateAIRoofingReport, quickMeasure } from '../services/gemini'

export const aiAnalysisRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// Helper: Build environment credentials from Hono context
// ============================================================
function getGeminiEnv(c: any) {
  return {
    apiKey: c.env.GOOGLE_VERTEX_API_KEY || undefined,
    accessToken: c.env.GOOGLE_CLOUD_ACCESS_TOKEN || undefined,
    project: c.env.GOOGLE_CLOUD_PROJECT || undefined,
    location: c.env.GOOGLE_CLOUD_LOCATION || undefined,
    mapsKey: c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY,
    serviceAccountKey: c.env.GCP_SERVICE_ACCOUNT_KEY || undefined
  }
}

// ============================================================
// GET — Retrieve stored AI analysis for an order
// ============================================================
aiAnalysisRoutes.get('/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')

    const result = await c.env.DB.prepare(`
      SELECT ai_measurement_json, ai_report_json, ai_satellite_url,
             ai_analyzed_at, ai_status, ai_error
      FROM reports
      WHERE order_id = ?
    `).bind(orderId).first<any>()

    if (!result) {
      return c.json({ error: 'Report not found for this order' }, 404)
    }

    return c.json({
      status: result.ai_status || 'not_run',
      measurement: result.ai_measurement_json ? JSON.parse(result.ai_measurement_json) : null,
      report: result.ai_report_json ? JSON.parse(result.ai_report_json) : null,
      satellite_image_url: result.ai_satellite_url || null,
      analyzed_at: result.ai_analyzed_at || null,
      error: result.ai_error || null
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve AI analysis', details: err.message }, 500)
  }
})

// ============================================================
// POST — Quick Measure by lat/lng (no order required)
// Port of Vertex Engine's /api/measure endpoint
// ============================================================
aiAnalysisRoutes.post('/measure', async (c) => {
  try {
    const { lat, lng } = await c.req.json()
    if (!lat || !lng) {
      return c.json({ error: 'lat and lng are required' }, 400)
    }

    const env = getGeminiEnv(c)
    if (!env.apiKey && !env.accessToken) {
      return c.json({ error: 'No AI API key configured' }, 400)
    }

    const startTime = Date.now()
    const { analysis, satelliteUrl } = await quickMeasure(lat, lng, env)
    const duration = Date.now() - startTime

    return c.json({
      status: 'success',
      analysis,
      meta: {
        lat,
        lng,
        image_source: 'Google Static Maps',
        duration_ms: duration,
        satellite_url: satelliteUrl
      }
    })
  } catch (e: any) {
    console.error('[/api/ai/measure]', e)
    const msg = e.message || 'Measurement failed'
    const isApiDisabled = msg.includes('SERVICE_DISABLED') || msg.includes('403')
    return c.json({
      error: msg,
      hint: isApiDisabled
        ? 'The Generative Language API is not enabled in your GCP project. Enable it here: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview'
        : 'Check that GOOGLE_VERTEX_API_KEY is set and the Generative Language API is enabled.',
      activation_url: isApiDisabled
        ? 'https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview'
        : null
    }, isApiDisabled ? 403 : 500)
  }
})

// ============================================================
// POST — Vertex AI Proxy (for frontend SDK calls)
// Mirrors the Node.js proxy from roofstack-ai-2/backend/server.js
// but adapted for Cloudflare Workers (no google-auth-library)
// ============================================================
aiAnalysisRoutes.post('/vertex-proxy', async (c) => {
  // Validate proxy header (same as original server.js)
  const proxyHeader = c.req.header('x-app-proxy')
  if (proxyHeader !== 'local-vertex-ai-app') {
    return c.json({ error: 'Forbidden: Request must include X-App-Proxy header' }, 403)
  }

  const accessToken = c.env.GOOGLE_CLOUD_ACCESS_TOKEN
  const project = c.env.GOOGLE_CLOUD_PROJECT
  const location = c.env.GOOGLE_CLOUD_LOCATION

  if (!accessToken || !project) {
    return c.json({
      error: 'Vertex AI proxy not configured',
      hint: 'Set GOOGLE_CLOUD_ACCESS_TOKEN, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION in .dev.vars'
    }, 400)
  }

  try {
    const body = await c.req.json()
    const { originalUrl, method, headers: reqHeaders, body: reqBody } = body

    if (!originalUrl) {
      return c.json({ error: 'originalUrl is required' }, 400)
    }

    // Map the aiplatform.googleapis.com URL to the clients6 version with project/location
    const loc = location === 'global' ? 'us-central1' : location
    let apiUrl = originalUrl
      .replace(
        /https:\/\/aiplatform\.googleapis\.com\/(v\w+)\/publishers\/google\/models\/([^:]+):(\w+)/,
        `https://${loc}-aiplatform.clients6.google.com/$1/projects/${project}/locations/${loc}/publishers/google/models/$2:$3`
      )

    // Handle ReasoningEngine URLs
    if (originalUrl.includes('reasoningEngines')) {
      apiUrl = originalUrl.replace(
        /https:\/\/([^-]+)-aiplatform\.googleapis\.com/,
        'https://$1-aiplatform.clients6.google.com'
      )
    }

    console.log(`[Vertex Proxy] ${originalUrl} → ${apiUrl}`)

    const apiHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'X-Goog-User-Project': project,
      'Content-Type': 'application/json'
    }

    const response = await fetch(apiUrl, {
      method: method || 'POST',
      headers: { ...apiHeaders, ...(reqHeaders || {}) },
      body: reqBody ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : undefined
    })

    const data = await response.json()
    return c.json(data, response.status as any)

  } catch (e: any) {
    console.error('[Vertex Proxy]', e)
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// POST — Run AI analysis for an order (full pipeline)
// Pipeline:
// 1. Fetch order + report data
// 2. Build satellite image URL from coordinates
// 3. Call Gemini Vision for geometry extraction
// 4. Call Gemini for AI assessment report
// 5. Store results in DB
// ============================================================
aiAnalysisRoutes.post('/:orderId/analyze', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const env = getGeminiEnv(c)

    if (!env.apiKey && !env.accessToken) {
      return c.json({
        error: 'No AI API key configured',
        hint: 'Set GOOGLE_VERTEX_API_KEY in .dev.vars or wrangler secrets. Or set GOOGLE_CLOUD_ACCESS_TOKEN + GOOGLE_CLOUD_PROJECT for Vertex AI.'
      }, 400)
    }

    // Fetch order details
    const order = await c.env.DB.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).bind(orderId).first<any>()

    if (!order) {
      return c.json({ error: 'Order not found' }, 404)
    }

    if (!order.latitude || !order.longitude) {
      return c.json({ error: 'Order missing coordinates — cannot analyze' }, 400)
    }

    // Fetch report (for Solar API data if available)
    const report = await c.env.DB.prepare(`
      SELECT api_response_raw, roof_segments FROM reports WHERE order_id = ?
    `).bind(orderId).first<any>()

    // Mark as analyzing
    await c.env.DB.prepare(`
      UPDATE reports SET ai_status = 'analyzing' WHERE order_id = ?
    `).bind(orderId).run()

    const startTime = Date.now()

    // Build satellite image URL
    const satelliteUrl = env.mapsKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${order.latitude},${order.longitude}&zoom=20&size=640x640&maptype=satellite&key=${env.mapsKey}`
      : null

    let geometryResult = null
    let aiReportResult = null
    let lastError = ''

    try {
      // Run both analyses in parallel
      const [geoRes, reportRes] = await Promise.allSettled([
        // 1. Vision analysis — extract roof geometry from satellite image
        satelliteUrl
          ? analyzeRoofGeometry(satelliteUrl, env)
          : Promise.resolve(null),

        // 2. AI report — generate assessment from Solar API data
        report?.api_response_raw
          ? generateAIRoofingReport(buildSolarSummary(report.api_response_raw), env)
          : generateAIRoofingReport(buildFallbackSummary(order, report), env)
      ])

      geometryResult = geoRes.status === 'fulfilled' ? geoRes.value : null
      aiReportResult = reportRes.status === 'fulfilled' ? reportRes.value : null

      if (!geometryResult && geoRes.status === 'rejected') {
        lastError = geoRes.reason?.message || 'Vision analysis failed'
      }
      if (!aiReportResult && reportRes.status === 'rejected') {
        lastError += (lastError ? ' | ' : '') + (reportRes.reason?.message || 'Report generation failed')
      }
    } catch (e: any) {
      lastError = e.message
    }

    if (!geometryResult && !aiReportResult && lastError) {
      await c.env.DB.prepare(`
        UPDATE reports SET ai_status = 'failed', ai_error = ? WHERE order_id = ?
      `).bind(lastError, orderId).run()

      return c.json({
        success: false,
        status: 'failed',
        error: lastError,
        hint: lastError.includes('SERVICE_DISABLED')
          ? 'Enable the Generative Language API at: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview'
          : lastError.includes('UNAUTHENTICATED')
            ? 'Use an AIzaSy... format key and enable the Generative Language API. Or configure GOOGLE_CLOUD_ACCESS_TOKEN for Vertex AI.'
            : 'Check API key configuration and Gemini API access.'
      }, 400)
    }

    const duration = Date.now() - startTime

    // Store results in DB
    await c.env.DB.prepare(`
      UPDATE reports SET
        ai_measurement_json = ?,
        ai_report_json = ?,
        ai_satellite_url = ?,
        ai_analyzed_at = datetime('now'),
        ai_status = 'completed',
        ai_error = NULL
      WHERE order_id = ?
    `).bind(
      geometryResult ? JSON.stringify(geometryResult) : null,
      aiReportResult ? JSON.stringify(aiReportResult) : null,
      satelliteUrl,
      orderId
    ).run()

    // Log the API call
    await c.env.DB.prepare(`
      INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, duration_ms)
      VALUES (?, 'gemini_vertex_analysis', 'vertex-ai-engine', 200, ?)
    `).bind(orderId, duration).run()

    return c.json({
      success: true,
      status: 'completed',
      duration_ms: duration,
      measurement: geometryResult,
      report: aiReportResult,
      satellite_image_url: satelliteUrl,
      stats: {
        facets: geometryResult?.facets?.length || 0,
        lines: geometryResult?.lines?.length || 0,
        obstructions: geometryResult?.obstructions?.length || 0,
        has_ai_report: !!aiReportResult
      }
    })

  } catch (err: any) {
    const orderId = c.req.param('orderId')
    try {
      await c.env.DB.prepare(`
        UPDATE reports SET ai_status = 'failed', ai_error = ? WHERE order_id = ?
      `).bind(err.message, orderId).run()
    } catch (e) { /* ignore DB error during error handling */ }

    return c.json({
      error: 'AI analysis failed',
      details: err.message,
      status: 'failed'
    }, 500)
  }
})

// ============================================================
// Helper: Build solar summary from stored API response
// ============================================================
function buildSolarSummary(apiResponseRaw: string) {
  try {
    const data = JSON.parse(apiResponseRaw)
    const segments = data.segments || []
    return {
      totalAreaSqm: data.total_true_area_sqm || 0,
      maxSunshineHours: data.max_sunshine_hours || 0,
      segmentCount: segments.length,
      segments: segments.map((s: any) => ({
        pitchDegrees: s.pitch_degrees || 0,
        azimuthDegrees: s.azimuth_degrees || 0,
        areaSqm: s.true_area_sqm || 0
      }))
    }
  } catch {
    return { totalAreaSqm: 0, maxSunshineHours: 0, segmentCount: 0, segments: [] }
  }
}

function buildFallbackSummary(order: any, report: any) {
  const segments = report?.roof_segments ? JSON.parse(report.roof_segments) : []
  return {
    totalAreaSqm: report?.roof_area_sqm || 0,
    maxSunshineHours: report?.max_sunshine_hours || 0,
    segmentCount: segments.length || 0,
    segments: segments.map((s: any) => ({
      pitchDegrees: s.pitch_degrees || 0,
      azimuthDegrees: s.azimuth_degrees || 0,
      areaSqm: s.true_area_sqm || 0
    }))
  }
}
