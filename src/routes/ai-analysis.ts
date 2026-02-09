// ============================================================
// Reuse Canada - AI Measurement Engine API Routes
// Server-side Gemini Vision analysis for roof geometry
// ============================================================
// POST /api/ai/:orderId/analyze — Run full AI analysis
// GET  /api/ai/:orderId         — Retrieve stored AI results
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { analyzeRoofGeometry, generateAIRoofingReport } from '../services/gemini'

export const aiAnalysisRoutes = new Hono<{ Bindings: Bindings }>()

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
// POST — Run AI analysis (Gemini Vision + Report)
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
    const geminiKey = c.env.GOOGLE_VERTEX_API_KEY
    const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY

    if (!geminiKey) {
      return c.json({
        error: 'Gemini API key not configured',
        hint: 'Set GOOGLE_VERTEX_API_KEY in .dev.vars or wrangler secrets'
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

    // Build satellite image URL (zoom 20 = ~0.15m/px, ideal for roof analysis)
    const satelliteUrl = mapsKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${order.latitude},${order.longitude}&zoom=20&size=640x640&maptype=satellite&key=${mapsKey}`
      : null

    // Try Gemini API with available keys
    // Priority: GOOGLE_VERTEX_API_KEY (dedicated), then GOOGLE_MAPS_API_KEY as fallback
    const keysToTry = [geminiKey, c.env.GOOGLE_MAPS_API_KEY].filter(Boolean)

    let geometryResult = null
    let aiReportResult = null
    let lastError = ''

    for (const key of keysToTry) {
      try {
        // Run both analyses in parallel
        const [geoRes, reportRes] = await Promise.allSettled([
          // 1. Vision analysis — extract roof geometry from satellite image
          satelliteUrl
            ? analyzeRoofGeometry(satelliteUrl, key)
            : Promise.resolve(null),

          // 2. AI report — generate assessment from Solar API data
          report?.api_response_raw
            ? generateAIRoofingReport(
                buildSolarSummary(report.api_response_raw),
                key
              )
            : generateAIRoofingReport(
                buildFallbackSummary(order, report),
                key
              )
        ])

        geometryResult = geoRes.status === 'fulfilled' ? geoRes.value : null
        aiReportResult = reportRes.status === 'fulfilled' ? reportRes.value : null

        if (geometryResult || aiReportResult) break // Success with this key
        lastError = (geoRes.status === 'rejected' ? geoRes.reason?.message : '') +
                    (reportRes.status === 'rejected' ? ' | ' + reportRes.reason?.message : '')

      } catch (e: any) {
        lastError = e.message
        continue // Try next key
      }
    }

    if (!geometryResult && !aiReportResult && lastError) {
      // Store error but still return partial success
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
            ? 'The API key format is not compatible with Gemini API. Use an AIzaSy... format key and enable the Generative Language API.'
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
      VALUES (?, 'gemini_vision_analysis', 'generativelanguage.googleapis.com', 200, ?)
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
    // Store error in DB
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
