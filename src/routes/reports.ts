// ============================================================
// RoofReporterAI — Reports Routes (Thin Controller Layer)
// ~400 lines — all logic delegated to services/repositories.
// ============================================================

import { Hono } from 'hono'
import type { Bindings, RoofReport } from '../types'
import { computeMaterialEstimate } from '../utils/geo-math'
import { validateAdminSession } from '../routes/auth'

// Services
import { analyzeRoofGeometry } from '../services/gemini'
import { visionScan, computeHeatScore, filterFindings } from '../services/vision-analyzer'
import type { VisionFindings } from '../types'
import {
  callGoogleSolarAPI, generateMockRoofReport, generateGPTRoofEstimate,
  generateEnhancedImagery, generateEdgesFromSegments, computeEdgeSummary
} from '../services/solar-api'
import { buildDataLayersReport, generateSegmentsFromDLAnalysis, generateSegmentsFromAIGeometry } from '../services/report-engine'
import { executeRoofOrder, type DataLayersAnalysis } from '../services/solar-datalayers'
import { generateProfessionalReportHTML, buildVisionFindingsHTML } from '../templates/report-html'
import { buildEmailWrapper, sendGmailEmail, sendViaResend, sendGmailOAuth2 } from '../services/email'

// Cloud Run Custom AI (Colab-trained model)
import {
  buildCloudRunConfig, checkCloudRunHealth, analyzeViaCloudRun, batchAnalyzeViaCloudRun,
  convertToVisionFindings, convertToAIGeometry, mergeVisionFindings,
  type CloudRunAIConfig, type CloudRunHealthResponse
} from '../services/cloud-run-ai'

// Repository
import * as repo from '../repositories/reports'

// Validation
import { parseBody, ValidationError, toggleSegmentsBody, visionFilterQuery, datalayersAnalyzeBody, emailBody } from '../utils/validation'

export const reportsRoutes = new Hono<{ Bindings: Bindings }>()

// ── GLOBAL ERROR HANDLER ──
reportsRoutes.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
  console.error(`[Reports] Unhandled error: ${err.message}`)
  return c.json({ error: 'Internal server error', details: err.message }, 500)
})

// ── AUTH MIDDLEWARE ──
async function validateAdminOrCustomer(db: D1Database, authHeader: string | undefined) {
  const admin = await validateAdminSession(db, authHeader)
  if (admin) return { ...admin, role: 'admin' }
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.prepare(`
    SELECT cs.customer_id, c.email, c.name FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id
    WHERE cs.session_token = ? AND cs.expires_at > datetime('now')
  `).bind(token).first<any>()
  if (session) return { id: session.customer_id, email: session.email, name: session.name, role: 'customer' }
  return null
}

reportsRoutes.use('/*', async (c, next) => {
  const path = c.req.path
  if (path.endsWith('/html') || path.endsWith('/pdf')) return next()
  const user = await validateAdminOrCustomer(c.env.DB, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Authentication required' }, 401)
  c.set('user' as any, user)
  return next()
})

// ── HELPER: regenerate HTML from stored JSON ──
function tryRegenHtml(jsonStr: string): string | null {
  try {
    const d = JSON.parse(jsonStr)
    if (d?.property?.address && Array.isArray(d.segments) && d.segments.length > 0) {
      return generateProfessionalReportHTML(d as RoofReport)
    }
  } catch {}
  return null
}

function resolveHtml(stored: string | null, raw: string | null): string | null {
  if (stored) {
    if (stored.trimStart().startsWith('<!DOCTYPE') || stored.trimStart().startsWith('<html')) return stored
    const h = tryRegenHtml(stored)
    if (h) return h
    return stored
  }
  if (raw) {
    const h = tryRegenHtml(raw)
    if (h && (h.startsWith('<!DOCTYPE') || h.startsWith('<html'))) return h
  }
  return null
}

// ============================================================
// GET /:orderId — Report data
// ============================================================
reportsRoutes.get('/:orderId', async (c) => {
  const report = await repo.getReportWithOrder(c.env.DB, c.req.param('orderId'))
  if (!report) return c.json({ error: 'Report not found' }, 404)
  return c.json({ report })
})

// ============================================================
// GET /:orderId/segments — Segment toggle UI
// ============================================================
reportsRoutes.get('/:orderId/segments', async (c) => {
  const row = await repo.getReportRawData(c.env.DB, c.req.param('orderId'))
  if (!row?.api_response_raw) return c.json({ error: 'Report not found' }, 404)
  const data: RoofReport = JSON.parse(row.api_response_raw)
  const excludedSet = new Set(data.excluded_segments || [])
  const segments = data.segments.map((seg, i) => ({
    index: i, ...seg, excluded: excludedSet.has(i)
  }))
  return c.json({
    order_id: parseInt(c.req.param('orderId')),
    total_segments: segments.length,
    excluded_count: excludedSet.size,
    active_count: segments.length - excludedSet.size,
    property_overlap_flag: data.property_overlap_flag || false,
    segments,
    active_totals: {
      footprint_sqft: data.total_footprint_sqft,
      true_area_sqft: data.total_true_area_sqft,
      gross_squares: data.materials?.gross_squares || 0,
      pitch_degrees: data.roof_pitch_degrees
    }
  })
})

// ============================================================
// GET /:orderId/html — Rendered report HTML (no auth for iframes)
// ============================================================
reportsRoutes.get('/:orderId/html', async (c) => {
  const row = await repo.getReportHtml(c.env.DB, c.req.param('orderId'))
  if (!row) return c.json({ error: 'Report not found' }, 404)
  const html = resolveHtml(row.professional_report_html, row.api_response_raw)
  if (!html) return c.json({ error: 'Report data not available' }, 404)
  return c.html(html)
})

// ============================================================
// POST /:orderId/generate — Main report pipeline
// ============================================================
reportsRoutes.post('/:orderId/generate', async (c) => {
  const orderId = c.req.param('orderId')
  const generatePromise = generateReportForOrder(orderId, c.env)
    .then(r => console.log(`[Generate] Order ${orderId}: ${r.success ? 'OK' : r.error}`))
    .catch(e => console.error(`[Generate] Order ${orderId} error:`, e.message))
  if ((c as any).executionCtx?.waitUntil) {
    ;(c as any).executionCtx.waitUntil(generatePromise)
    return c.json({ success: true, message: 'Report generation started', orderId })
  }
  const result = await generateReportForOrder(orderId, c.env)
  if (!result.success) return c.json({ error: result.error }, result.error === 'Order not found' ? 404 : 500)
  return c.json({ success: true, report: result.report, provider: result.provider, version: result.version })
})

// ============================================================
// POST /:orderId/retry — Reset and re-generate
// ============================================================
reportsRoutes.post('/:orderId/retry', async (c) => {
  const orderId = c.req.param('orderId')
  const report = await repo.getReportStatus(c.env.DB, orderId)
  if (!report) return c.json({ error: 'No report record found' }, 404)
  await repo.resetReportForRetry(c.env.DB, orderId)
  const gen = generateReportForOrder(orderId, c.env).catch(e => console.error(`[Retry] ${orderId}:`, e.message))
  if ((c as any).executionCtx?.waitUntil) (c as any).executionCtx.waitUntil(gen); else await gen
  return c.json({ success: true, message: 'Retry started', previousStatus: report.status })
})

// ============================================================
// POST /:orderId/toggle-segments — Exclude/include segments
// ============================================================
reportsRoutes.post('/:orderId/toggle-segments', async (c) => {
  const orderId = c.req.param('orderId')
  const body = parseBody(toggleSegmentsBody, await c.req.json())
  const row = await repo.getReportRawData(c.env.DB, orderId)
  if (!row?.api_response_raw) return c.json({ error: 'Report not found' }, 404)
  const data: RoofReport = JSON.parse(row.api_response_raw)
  const maxIdx = data.segments.length - 1
  data.excluded_segments = body.excluded_segments.filter(i => i >= 0 && i <= maxIdx)
  const active = data.segments.filter((_, i) => !data.excluded_segments!.includes(i))
  const totalFp = active.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
  const totalTrue = active.reduce((s, seg) => s + seg.true_area_sqft, 0)
  data.total_footprint_sqft = totalFp
  data.total_true_area_sqft = totalTrue
  data.edges = generateEdgesFromSegments(active, totalFp)
  data.edge_summary = computeEdgeSummary(data.edges)
  data.materials = computeMaterialEstimate(totalTrue, data.edges, active)
  const html = generateProfessionalReportHTML(data)
  await repo.updateReportHtml(c.env.DB, orderId, html, JSON.stringify(data))
  return c.json({ success: true, excluded: data.excluded_segments, active_count: active.length })
})

// ============================================================
// POST /:orderId/vision-inspect — Trigger vision scan
// ============================================================
reportsRoutes.post('/:orderId/vision-inspect', async (c) => {
  const orderId = c.req.param('orderId')
  const report = await repo.getReportForVision(c.env.DB, orderId)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  let imgUrl = report.satellite_image_url as string | null
  if (!imgUrl && report.api_response_raw) {
    try { const d = JSON.parse(report.api_response_raw); imgUrl = d.imagery?.satellite_overhead_url || d.imagery?.satellite_url } catch {}
  }
  if (!imgUrl) return c.json({ error: 'No satellite image available' }, 400)
  if (!c.env.GCP_SERVICE_ACCOUNT_KEY && !c.env.GOOGLE_VERTEX_API_KEY) return c.json({ error: 'No GCP credentials' }, 400)
  const vf = await visionScan(imgUrl, {
    apiKey: c.env.GOOGLE_VERTEX_API_KEY, project: c.env.GOOGLE_CLOUD_PROJECT,
    location: c.env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: c.env.GCP_SERVICE_ACCOUNT_KEY
  }, { model: 'gemini-2.0-flash', timeoutMs: 45000, sourceType: 'satellite_overhead' })
  await repo.updateVisionFindings(c.env.DB, orderId, JSON.stringify(vf))
  return c.json({ success: true, ...vf })
})

// ============================================================
// GET /:orderId/vision — Retrieve vision findings
// ============================================================
reportsRoutes.get('/:orderId/vision', async (c) => {
  const row = await repo.getVisionFindings(c.env.DB, c.req.param('orderId'))
  if (!row?.vision_findings_json) return c.json({ error: 'No vision inspection run yet' }, 404)
  const vf: VisionFindings = JSON.parse(row.vision_findings_json)
  const q = parseBody(visionFilterQuery, c.req.query())
  const filtered = filterFindings(vf.findings, { minConfidence: q.min_confidence, category: q.category as any, severity: q.severity as any })
  return c.json({ ...vf, findings: filtered, finding_count: filtered.length })
})

// ============================================================
// POST /:orderId/enhance — Gemini Pro geometry upgrade
// ============================================================
reportsRoutes.post('/:orderId/enhance', async (c) => {
  const orderId = c.req.param('orderId')
  const report = await repo.getReportForEnhance(c.env.DB, orderId)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  const order = await repo.getOrderById(c.env.DB, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)

  let reportData: any = null
  try { reportData = report.api_response_raw ? JSON.parse(report.api_response_raw) : null } catch {}
  let imgUrl = reportData?.imagery?.satellite_overhead_url || reportData?.imagery?.satellite_url
  if (!imgUrl && order.latitude && order.longitude && c.env.GOOGLE_MAPS_API_KEY) {
    imgUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${order.latitude},${order.longitude}&zoom=20&size=640x640&scale=2&maptype=satellite&key=${c.env.GOOGLE_MAPS_API_KEY}`
  }
  if (!imgUrl) return c.json({ error: 'No satellite image' }, 400)
  if (!c.env.GOOGLE_VERTEX_API_KEY && !c.env.GCP_SERVICE_ACCOUNT_KEY) return c.json({ error: 'No Gemini credentials' }, 400)

  await repo.updateAiStatus(c.env.DB, orderId, 'processing')
  const geminiEnv = { apiKey: c.env.GOOGLE_VERTEX_API_KEY, project: c.env.GOOGLE_CLOUD_PROJECT, location: c.env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: c.env.GCP_SERVICE_ACCOUNT_KEY }
  const aiGeometry = await analyzeRoofGeometry(imgUrl, geminiEnv, { maxRetries: 2, timeoutMs: 180000, acceptScore: 15, model: 'gemini-2.5-pro' })
  if (!aiGeometry?.facets?.length) {
    await c.env.DB.prepare(`UPDATE reports SET ai_status='failed', ai_error='No facets', ai_analyzed_at=datetime('now'), updated_at=datetime('now') WHERE order_id=?`).bind(orderId).run()
    return c.json({ success: false, error: 'No usable geometry detected' }, 400)
  }

  // Re-generate segments/edges/materials from AI geometry
  const fp = report.roof_footprint_sqft || reportData?.total_footprint_sqft || 1500
  const pitch = report.roof_pitch_degrees || reportData?.roof_pitch_degrees || 20
  const aiSegments = generateSegmentsFromAIGeometry(aiGeometry, fp, pitch)
  if (reportData) {
    reportData.ai_geometry = aiGeometry
    if (aiSegments.length >= 2) {
      reportData.segments = aiSegments
      reportData.edges = generateEdgesFromSegments(aiSegments, fp)
      reportData.edge_summary = computeEdgeSummary(reportData.edges)
      reportData.materials = computeMaterialEstimate(reportData.total_true_area_sqft || fp * 1.1, reportData.edges, aiSegments)
    }
  }
  const html = reportData ? generateProfessionalReportHTML(reportData) : null
  const pairs: [string, any][] = [['ai_measurement_json = ?', JSON.stringify(aiGeometry)], ['api_response_raw = ?', JSON.stringify(reportData)]]
  if (aiSegments.length >= 2) { pairs.push(['roof_segments = ?', JSON.stringify(aiSegments)], ['edge_measurements = ?', JSON.stringify(reportData?.edges)]) }
  if (reportData?.edge_summary) { const es = reportData.edge_summary; pairs.push(['total_ridge_ft=?', es.total_ridge_ft], ['total_hip_ft=?', es.total_hip_ft], ['total_valley_ft=?', es.total_valley_ft], ['total_eave_ft=?', es.total_eave_ft], ['total_rake_ft=?', es.total_rake_ft]) }
  if (reportData?.materials) { const m = reportData.materials; pairs.push(['material_estimate=?', JSON.stringify(m)], ['gross_squares=?', m.gross_squares], ['bundle_count=?', m.bundle_count], ['total_material_cost_cad=?', m.total_material_cost_cad], ['complexity_class=?', m.complexity_class]) }
  if (html) pairs.push(['professional_report_html=?', html])
  const fields = pairs.map(p => p[0]); fields.push("ai_status='completed'", "ai_analyzed_at=datetime('now')", "updated_at=datetime('now')")
  await c.env.DB.prepare(`UPDATE reports SET ${fields.join(', ')} WHERE order_id=?`).bind(...pairs.map(p => p[1]), orderId).run()
  return c.json({ success: true, facets: aiGeometry.facets.length, lines: aiGeometry.lines.length })
})

// ============================================================
// POST /:orderId/trace-insights — Compile traced coordinates for
// Solar API roofSegmentStats-focused analysis
// ============================================================
reportsRoutes.post('/:orderId/trace-insights', async (c) => {
  const orderId = c.req.param('orderId')
  const order = await repo.getOrderById(c.env.DB, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)

  if (!order.roof_trace_json) {
    return c.json({ error: 'No roof trace data found for this order. User must trace the roof outline first.' }, 400)
  }

  const trace = typeof order.roof_trace_json === 'string' ? JSON.parse(order.roof_trace_json) : order.roof_trace_json

  if (!trace.eaves || trace.eaves.length < 3) {
    return c.json({ error: 'Invalid trace data — eaves polygon requires at least 3 points' }, 400)
  }

  // Compute polygon area from eaves outline
  const eavePoints = trace.eaves as { lat: number; lng: number }[]
  const cLat = eavePoints.reduce((s: number, p: { lat: number }) => s + p.lat, 0) / eavePoints.length
  const cLng = eavePoints.reduce((s: number, p: { lng: number }) => s + p.lng, 0) / eavePoints.length
  const cosLat = Math.cos(cLat * Math.PI / 180)
  const M_PER_DEG_LAT = 111320
  const M_PER_DEG_LNG = 111320 * cosLat

  const projected = eavePoints.map(p => ({
    x: (p.lng - cLng) * M_PER_DEG_LNG,
    y: (p.lat - cLat) * M_PER_DEG_LAT
  }))

  let areaM2 = 0
  const n = projected.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    areaM2 += projected[i].x * projected[j].y
    areaM2 -= projected[j].x * projected[i].y
  }
  areaM2 = Math.abs(areaM2) / 2
  const areaSqft = Math.round(areaM2 * 10.7639)

  // Compute perimeter from eaves outline
  let perimeterM = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = projected[j].x - projected[i].x
    const dy = projected[j].y - projected[i].y
    perimeterM += Math.sqrt(dx * dx + dy * dy)
  }
  const perimeterFt = Math.round(perimeterM * 3.28084)

  // Count ridge/hip/valley lines and compute their total lengths
  const computeLineLength = (line: { lat: number; lng: number }[]) => {
    if (line.length < 2) return 0
    let len = 0
    for (let i = 0; i < line.length - 1; i++) {
      const dx = (line[i + 1].lng - line[i].lng) * M_PER_DEG_LNG
      const dy = (line[i + 1].lat - line[i].lat) * M_PER_DEG_LAT
      len += Math.sqrt(dx * dx + dy * dy)
    }
    return len
  }

  const ridgeLengthFt = Math.round((trace.ridges || []).reduce((s: number, l: any) => s + computeLineLength(l), 0) * 3.28084)
  const hipLengthFt = Math.round((trace.hips || []).reduce((s: number, l: any) => s + computeLineLength(l), 0) * 3.28084)
  const valleyLengthFt = Math.round((trace.valleys || []).reduce((s: number, l: any) => s + computeLineLength(l), 0) * 3.28084)

  // Build structured roof insights from traced geometry
  const insights = {
    order_id: orderId,
    source: 'user_traced',
    traced_at: trace.traced_at,
    eaves_polygon: {
      vertices: eavePoints.length,
      area_m2: Math.round(areaM2 * 100) / 100,
      area_sqft: areaSqft,
      perimeter_m: Math.round(perimeterM * 100) / 100,
      perimeter_ft: perimeterFt,
      center: { lat: cLat, lng: cLng }
    },
    edge_summary: {
      ridge_count: (trace.ridges || []).length,
      ridge_total_ft: ridgeLengthFt,
      hip_count: (trace.hips || []).length,
      hip_total_ft: hipLengthFt,
      valley_count: (trace.valleys || []).length,
      valley_total_ft: valleyLengthFt,
      eave_total_ft: perimeterFt,
      total_linear_ft: ridgeLengthFt + hipLengthFt + valleyLengthFt + perimeterFt
    },
    // Estimate segment count from traced geometry
    estimated_segment_count: Math.max(2, (trace.ridges?.length || 0) * 2 + (trace.hips?.length || 0)),
    // This data is designed to enhance or override Google Solar API buildingInsights
    solar_api_override: {
      use_traced_footprint: true,
      footprint_area_sqft: areaSqft,
      footprint_area_m2: Math.round(areaM2 * 100) / 100,
      coordinates: { lat: order.latitude, lng: order.longitude }
    }
  }

  return c.json({ success: true, insights })
})

// ============================================================
// POST /:orderId/generate-enhanced — DataLayers + GeoTIFF pipeline
// ============================================================
reportsRoutes.post('/:orderId/generate-enhanced', async (c) => {
  const orderId = c.req.param('orderId')
  const pipelineStart = Date.now()
  const { email_report, to_email } = await c.req.json().catch(() => ({} as any))
  const order = await repo.getOrderById(c.env.DB, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)
  const solarApiKey = c.env.GOOGLE_SOLAR_API_KEY
  const mapsApiKey = c.env.GOOGLE_MAPS_API_KEY || solarApiKey
  if (!solarApiKey) return c.json({ error: 'GOOGLE_SOLAR_API_KEY required' }, 400)

  const address = [order.property_address, order.property_city, order.property_province, order.property_postal_code].filter(Boolean).join(', ')
  let dlAnalysis: DataLayersAnalysis
  try {
    dlAnalysis = await executeRoofOrder(address, solarApiKey, mapsApiKey, { radiusMeters: 50, lat: order.latitude || undefined, lng: order.longitude || undefined })
  } catch (e: any) {
    await repo.logApiRequest(c.env.DB, orderId, 'solar_datalayers', 'dataLayers:get', 500, 0, e.message.substring(0, 500))
    return c.json({ success: false, fallback: true, error: e.message }, 400)
  }

  if (!order.latitude && dlAnalysis.latitude) {
    await c.env.DB.prepare('UPDATE orders SET latitude=?, longitude=?, updated_at=datetime(\'now\') WHERE id=?').bind(dlAnalysis.latitude, dlAnalysis.longitude, orderId).run()
  }

  const segments = generateSegmentsFromDLAnalysis(dlAnalysis)
  const edges = generateEdgesFromSegments(segments, dlAnalysis.area.flatAreaSqft)
  const edgeSummary = computeEdgeSummary(edges)
  const materials = computeMaterialEstimate(dlAnalysis.area.trueAreaSqft, edges, segments)
  const reportData = buildDataLayersReport(orderId, order, dlAnalysis, segments, edges, edgeSummary, materials, mapsApiKey)

  // ── DUAL-PATH AI: Cloud Run Custom Model + Gemini Fallback ──
  const enhanceImg = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url
  let crEnhanceVision: VisionFindings | null = null

  // PATH 1: Cloud Run custom model (your Colab-trained weights)
  const crCfg = buildCloudRunConfig(c.env)
  if (crCfg && enhanceImg) {
    try {
      const crRes = await analyzeViaCloudRun(crCfg, {
        image_urls: [enhanceImg], analysis_type: 'full',
        coordinates: dlAnalysis.latitude ? { lat: dlAnalysis.latitude, lng: dlAnalysis.longitude } : undefined,
        address: address,
        known_footprint_sqft: dlAnalysis.area.flatAreaSqft,
        known_pitch_deg: dlAnalysis.area.avgPitchDeg,
        image_meta: { source: 'google_maps_satellite', zoom_level: 20, resolution_px: 640 }
      })
      if (crRes?.success) {
        const crGeo = convertToAIGeometry(crRes)
        if (crGeo?.facets?.length) {
          reportData.ai_geometry = crGeo
          const aiSeg = generateSegmentsFromAIGeometry(crGeo, reportData.total_footprint_sqft, reportData.roof_pitch_degrees)
          if (aiSeg.length >= 2) { reportData.segments = aiSeg; reportData.edges = generateEdgesFromSegments(aiSeg, reportData.total_footprint_sqft); reportData.edge_summary = computeEdgeSummary(reportData.edges); reportData.materials = computeMaterialEstimate(reportData.total_true_area_sqft, reportData.edges, aiSeg) }
        }
        crEnhanceVision = convertToVisionFindings(crRes)
      }
    } catch (e: any) { console.warn(`[Enhanced] Cloud Run AI failed:`, e.message) }
  }

  // PATH 2: Gemini fallback — geometry (only if Cloud Run didn't provide)
  if (!reportData.ai_geometry) {
    const remaining = 28_000 - (Date.now() - pipelineStart)
    if (remaining >= 15_000 && enhanceImg && (c.env.GCP_SERVICE_ACCOUNT_KEY || c.env.GOOGLE_VERTEX_API_KEY)) {
      try {
        const geo = await analyzeRoofGeometry(enhanceImg, { apiKey: c.env.GOOGLE_VERTEX_API_KEY, project: c.env.GOOGLE_CLOUD_PROJECT, location: c.env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: c.env.GCP_SERVICE_ACCOUNT_KEY }, { maxRetries: 1, timeoutMs: Math.min(Math.floor(remaining * 0.85), 180000), acceptScore: 15, model: 'gemini-2.5-pro' })
        if (geo?.facets?.length) {
          reportData.ai_geometry = geo
          const aiSeg = generateSegmentsFromAIGeometry(geo, reportData.total_footprint_sqft, reportData.roof_pitch_degrees)
          if (aiSeg.length >= 2) { reportData.segments = aiSeg; reportData.edges = generateEdgesFromSegments(aiSeg, reportData.total_footprint_sqft); reportData.edge_summary = computeEdgeSummary(reportData.edges); reportData.materials = computeMaterialEstimate(reportData.total_true_area_sqft, reportData.edges, aiSeg) }
        }
      } catch (e: any) { console.warn(`[Enhanced] Gemini geometry failed:`, e.message) }
    }
  }

  // PATH 2: Gemini fallback — vision scan
  let geminiEnhVision: VisionFindings | null = null
  const visionRemaining = 28_000 - (Date.now() - pipelineStart)
  if (visionRemaining >= 10_000 && enhanceImg && (c.env.GCP_SERVICE_ACCOUNT_KEY || c.env.GOOGLE_VERTEX_API_KEY)) {
    try {
      geminiEnhVision = await visionScan(enhanceImg, { apiKey: c.env.GOOGLE_VERTEX_API_KEY, project: c.env.GOOGLE_CLOUD_PROJECT, location: c.env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: c.env.GCP_SERVICE_ACCOUNT_KEY }, { model: 'gemini-2.0-flash', timeoutMs: Math.min(Math.floor(visionRemaining * 0.8), 25000), sourceType: 'satellite_overhead' })
    } catch (e: any) { console.warn(`[Enhanced] Gemini vision failed:`, e.message) }
  }

  // MERGE: Combine Cloud Run + Gemini vision for best coverage
  const mergedEnhVision = mergeVisionFindings(crEnhanceVision, geminiEnhVision)
  if (mergedEnhVision) reportData.vision_findings = mergedEnhVision

  const html = generateProfessionalReportHTML(reportData)
  const existing = await repo.getReportExistence(c.env.DB, orderId)
  if (existing) { await repo.saveCompletedReport(c.env.DB, orderId, reportData, html, '3.0') }
  else { await repo.saveCompletedReport(c.env.DB, orderId, reportData, html, '3.0') }
  await repo.markOrderStatus(c.env.DB, orderId, 'completed')
  await repo.logApiRequest(c.env.DB, orderId, 'solar_datalayers', 'dataLayers:get + GeoTIFF', 200, dlAnalysis.durationMs)

  // Optional email
  if (email_report) {
    const recipient = to_email || order.homeowner_email || order.requester_email
    if (recipient) {
      try {
        const emailHtml = buildEmailWrapper(html, order.property_address, `RM-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(orderId).padStart(4,'0')}`, recipient)
        const rt = (c.env as any).GMAIL_REFRESH_TOKEN, ci = (c.env as any).GMAIL_CLIENT_ID, cs = (c.env as any).GMAIL_CLIENT_SECRET
        if (rt && ci && cs) await sendGmailOAuth2(ci, cs, rt, recipient, `Roof Report - ${order.property_address}`, emailHtml, c.env.GMAIL_SENDER_EMAIL)
      } catch {}
    }
  }

  return c.json({ success: true, message: 'Enhanced report generated (v3.0)', report: reportData })
})

// ============================================================
// GET /:orderId/pdf — Print-ready HTML wrapper
// ============================================================
reportsRoutes.get('/:orderId/pdf', async (c) => {
  const report = await repo.getReportForPdf(c.env.DB, c.req.param('orderId'))
  if (!report) return c.json({ error: 'Report not found' }, 404)
  const html = resolveHtml(report.professional_report_html, report.api_response_raw)
  if (!html) return c.json({ error: 'Report HTML not available' }, 404)
  const addr = [report.property_address, report.property_city, report.property_province].filter(Boolean).join(', ')
  const safe = addr.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50)
  const pdfHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Roof_Report_${safe}.pdf</title>
<style>@media print{body{margin:0;padding:0}.page{page-break-after:always}.page:last-child{page-break-after:auto}.print-controls{display:none!important}}
.print-controls{position:fixed;top:0;left:0;right:0;z-index:9999;background:#1E3A5F;color:#fff;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Inter,system-ui,sans-serif}
.print-controls button{background:#00E5FF;color:#0B1E2F;border:none;padding:8px 24px;border-radius:6px;font-weight:700;cursor:pointer}body{padding-top:50px}@media print{body{padding-top:0}}</style></head>
<body><div class="print-controls"><span>RoofReporterAI | ${addr}</span><button onclick="window.print()">Download PDF</button></div>
${html}<script>if(new URLSearchParams(location.search).get('print')==='1')setTimeout(()=>window.print(),500)</script></body></html>`
  return new Response(pdfHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `inline; filename="Roof_Report_${safe}.pdf"` } })
})

// ============================================================
// POST /datalayers/analyze — Quick standalone analysis
// ============================================================
reportsRoutes.post('/datalayers/analyze', async (c) => {
  const body = parseBody(datalayersAnalyzeBody, await c.req.json())
  const key = c.env.GOOGLE_SOLAR_API_KEY
  if (!key) return c.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, 400)
  const result = await executeRoofOrder(body.address || `${body.lat},${body.lng}`, key, c.env.GOOGLE_MAPS_API_KEY || key, { lat: body.lat, lng: body.lng, radiusMeters: 50 })
  return c.json({ success: true, analysis: result, summary: { flat_area_sqft: result.area.flatAreaSqft, true_area_sqft: result.area.trueAreaSqft, avg_pitch_deg: result.area.avgPitchDeg, imagery_quality: result.imageryQuality } })
})

// ============================================================
// POST /:orderId/cloud-ai-analyze — On-demand Cloud Run AI analysis
// ============================================================
reportsRoutes.post('/:orderId/cloud-ai-analyze', async (c) => {
  const orderId = c.req.param('orderId')
  const crConfig = buildCloudRunConfig(c.env)
  if (!crConfig) return c.json({ error: 'CLOUD_RUN_AI_URL not configured', hint: 'Set CLOUD_RUN_AI_URL env var to your Cloud Run service URL' }, 400)

  const report = await repo.getReportForVision(c.env.DB, orderId)
  if (!report) return c.json({ error: 'Report not found' }, 404)
  const order = await repo.getOrderById(c.env.DB, orderId)

  let imgUrl = report.satellite_image_url as string | null
  if (!imgUrl && report.api_response_raw) {
    try { const d = JSON.parse(report.api_response_raw); imgUrl = d.imagery?.satellite_overhead_url || d.imagery?.satellite_url } catch {}
  }
  if (!imgUrl) return c.json({ error: 'No satellite image available' }, 400)

  // Collect all available images for batch analysis
  const imageUrls = [imgUrl]
  if (report.api_response_raw) {
    try {
      const d = JSON.parse(report.api_response_raw)
      if (d.imagery?.satellite_close_url) imageUrls.push(d.imagery.satellite_close_url)
      if (d.imagery?.context_url) imageUrls.push(d.imagery.context_url)
    } catch {}
  }

  const crResult = await analyzeViaCloudRun(crConfig, {
    image_urls: imageUrls,
    analysis_type: 'full',
    coordinates: order?.latitude && order?.longitude ? { lat: order.latitude, lng: order.longitude } : undefined,
    address: order?.property_address || undefined,
    image_meta: { source: 'google_maps_satellite', zoom_level: 20, resolution_px: 640 }
  })

  if (!crResult) return c.json({ error: 'Cloud Run AI unavailable — service may not be deployed yet', cloud_run_url: crConfig.baseUrl, hint: 'Deploy your Colab model to Cloud Run, then retry' }, 503)
  if (!crResult.success) return c.json({ error: crResult.error || 'Analysis failed', model: crResult.model_version }, 400)

  // Convert and store results
  const visionFindings = convertToVisionFindings(crResult)
  const geometry = convertToAIGeometry(crResult)

  if (visionFindings) {
    await repo.updateVisionFindings(c.env.DB, orderId, JSON.stringify(visionFindings))
  }
  if (geometry) {
    await c.env.DB.prepare(`UPDATE reports SET ai_measurement_json=?, ai_status='completed', ai_analyzed_at=datetime('now'), updated_at=datetime('now') WHERE order_id=?`)
      .bind(JSON.stringify(geometry), orderId).run()
  }

  await repo.logApiRequest(c.env.DB, orderId, 'cloud_run_ai', crConfig.baseUrl, 200, crResult.inference_time_ms)

  return c.json({
    success: true,
    source: 'cloud_run_custom_ai',
    model: crResult.model_version,
    inference_ms: crResult.inference_time_ms,
    vision: visionFindings ? { finding_count: visionFindings.finding_count, heat_score: visionFindings.heat_score, condition: visionFindings.overall_condition } : null,
    geometry: geometry ? { facets: geometry.facets.length, lines: geometry.lines.length, quality: geometry.overall_quality_score } : null,
    images_analyzed: imageUrls.length
  })
})

// ============================================================
// GET /cloud-ai/health — Cloud Run AI service health check
// ============================================================
reportsRoutes.get('/cloud-ai/health', async (c) => {
  const crConfig = buildCloudRunConfig(c.env)
  if (!crConfig) return c.json({ status: 'not_configured', cloud_run_url: null, message: 'Set CLOUD_RUN_AI_URL environment variable' })

  const health = await checkCloudRunHealth(crConfig)
  return c.json({
    status: health ? 'connected' : 'unavailable',
    cloud_run_url: crConfig.baseUrl,
    deployed: !!health,
    health: health || null,
    message: health
      ? `Cloud Run AI online — model ${health.model_version} (${health.model_type}), GPU: ${health.gpu_available}`
      : 'Cloud Run service is reachable but custom AI model not yet deployed. Deploy your Colab model to activate.',
    fallback: 'Gemini API (active — will handle all requests until Cloud Run is ready)'
  })
})

// ============================================================
// POST /:orderId/email — Send report via email
// ============================================================
reportsRoutes.post('/:orderId/email', async (c) => {
  const orderId = c.req.param('orderId')
  const body = parseBody(emailBody, await c.req.json().catch(() => ({})))
  const order = await repo.getOrderWithReport(c.env.DB, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)
  const recipient = body?.to_email || order.homeowner_email || order.requester_email
  if (!recipient) return c.json({ error: 'No recipient email' }, 400)
  const reportHtml = resolveHtml(order.professional_report_html, order.api_response_raw)
  if (!reportHtml) return c.json({ error: 'Report not yet generated' }, 400)

  const reportNum = `RM-${orderId}`
  const subject = body?.subject_override || `Roof Measurement Report - ${order.property_address} [${reportNum}]`
  const emailHtml = buildEmailWrapper(reportHtml, order.property_address || 'Property', reportNum, recipient)

  let rt = (c.env as any).GMAIL_REFRESH_TOKEN || await repo.getSettingValue(c.env.DB, 'gmail_refresh_token')
  const ci = (c.env as any).GMAIL_CLIENT_ID
  let cs = (c.env as any).GMAIL_CLIENT_SECRET || await repo.getSettingValue(c.env.DB, 'gmail_client_secret')
  const resendKey = (c.env as any).RESEND_API_KEY
  const sender = body?.from_email || c.env.GMAIL_SENDER_EMAIL || null

  let method = 'none'
  if (rt && ci && cs) { await sendGmailOAuth2(ci, cs, rt, recipient, subject, emailHtml, sender); method = 'gmail_oauth2' }
  else if (resendKey) { await sendViaResend(resendKey, recipient, subject, emailHtml, sender); method = 'resend' }
  else return c.json({ error: 'No email provider configured', fallback_url: `/api/reports/${orderId}/html` }, 400)

  await repo.logApiRequest(c.env.DB, orderId, 'email_sent', method, 200, 0, JSON.stringify({ to: recipient }))
  return c.json({ success: true, to: recipient, method })
})

// ============================================================
// EXPORTED: Direct report generation (called by square.ts etc.)
// ============================================================
export async function generateReportForOrder(
  orderId: number | string, env: Bindings
): Promise<{ success: boolean; report?: RoofReport; error?: string; version?: string; provider?: string }> {
  try {
    const order = await repo.getOrderById(env.DB, orderId)
    if (!order) return { success: false, error: 'Order not found' }
    const existing = await repo.getReportStatus(env.DB, orderId)
    const attemptNum = (existing?.generation_attempts || 0) + 1
    if (existing?.status === 'generating') {
      const staleMs = existing.generation_started_at ? Date.now() - new Date(existing.generation_started_at + 'Z').getTime() : Infinity
      if (staleMs > 120_000) { await repo.markReportFailed(env.DB, orderId, `Timed out (${Math.round(staleMs/1000)}s)`) }
      else if (staleMs < Infinity) return { success: false, error: 'Already in progress' }
      else { await repo.markReportFailed(env.DB, orderId, 'Stuck (no start time)') }
    }
    if (attemptNum > 3) return { success: false, error: 'Max attempts exceeded' }
    await repo.upsertGeneratingState(env.DB, orderId, attemptNum, !!existing)
    await repo.markOrderStatus(env.DB, orderId, 'processing')

    let reportData: RoofReport
    const startTime = Date.now()
    const solarApiKey = env.GOOGLE_SOLAR_API_KEY
    const mapsApiKey = env.GOOGLE_MAPS_API_KEY || solarApiKey
    let usedDL = false

    if (solarApiKey && order.latitude && order.longitude) {
      try {
        reportData = await callGoogleSolarAPI(order.latitude, order.longitude, solarApiKey, typeof orderId === 'string' ? parseInt(orderId) : orderId as number, order, mapsApiKey)
        reportData.metadata.api_duration_ms = Date.now() - startTime
        await repo.logApiRequest(env.DB, orderId, 'google_solar_api', 'buildingInsights:findClosest', 200, Date.now() - startTime)
      } catch (e: any) {
        const is404 = e.message.includes('404') || e.message.includes('NOT_FOUND')
        await repo.logApiRequest(env.DB, orderId, 'google_solar_api', 'buildingInsights:findClosest', is404 ? 404 : 500, Date.now() - startTime, e.message.substring(0, 500))
        let gptEst = null
        if (is404 && order.latitude && order.longitude) gptEst = await generateGPTRoofEstimate(order.property_address || '', order.latitude, order.longitude, env)
        reportData = generateMockRoofReport(order, mapsApiKey, gptEst)
        reportData.metadata.provider = is404 ? (gptEst ? `gpt-vision-estimate` : 'estimated (no coverage)') : `estimated (error)`
      }
    } else {
      reportData = generateMockRoofReport(order, mapsApiKey)
    }

    // ── DUAL-PATH AI ANALYSIS: Cloud Run Custom Model + Gemini Fallback ──
    const satUrl = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url
    let cloudRunVision: VisionFindings | null = null
    let cloudRunGeometry: any = null

    // PATH 1: Try Cloud Run custom AI model first (your Colab-trained weights)
    const crConfig = buildCloudRunConfig(env)
    if (crConfig && satUrl) {
      try {
        const crResult = await analyzeViaCloudRun(crConfig, {
          image_urls: [satUrl],
          analysis_type: 'full',
          coordinates: order.latitude && order.longitude ? { lat: order.latitude, lng: order.longitude } : undefined,
          address: order.property_address || undefined,
          known_footprint_sqft: reportData.total_footprint_sqft,
          known_pitch_deg: reportData.roof_pitch_degrees,
          image_meta: { source: 'google_maps_satellite', zoom_level: 20, resolution_px: 640 }
        })
        if (crResult?.success) {
          cloudRunVision = convertToVisionFindings(crResult)
          cloudRunGeometry = convertToAIGeometry(crResult)
          if (cloudRunGeometry?.facets?.length) {
            reportData.ai_geometry = cloudRunGeometry
            console.log(`[Generate] Cloud Run geometry: ${cloudRunGeometry.facets.length} facets`)
          }
          console.log(`[Generate] Cloud Run vision: ${cloudRunVision?.finding_count || 0} findings`)
        }
      } catch (e: any) { console.warn(`[Generate] Cloud Run AI failed (graceful fallback):`, e.message) }
    }

    // PATH 2: Gemini fallback — geometry upgrade (skip if Cloud Run already succeeded)
    if (!cloudRunGeometry && satUrl && (env.GCP_SERVICE_ACCOUNT_KEY || env.GOOGLE_VERTEX_API_KEY)) {
      try {
        const geo = await analyzeRoofGeometry(satUrl, { apiKey: env.GOOGLE_VERTEX_API_KEY, project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: env.GCP_SERVICE_ACCOUNT_KEY }, { maxRetries: 1, timeoutMs: 20000, acceptScore: 10, model: 'gemini-2.0-flash' })
        if (geo?.facets?.length) reportData.ai_geometry = geo
      } catch {}
    }

    // PATH 2: Gemini fallback — vision scan
    let geminiVision: VisionFindings | null = null
    if (satUrl && (env.GCP_SERVICE_ACCOUNT_KEY || env.GOOGLE_VERTEX_API_KEY)) {
      try {
        geminiVision = await visionScan(satUrl, { apiKey: env.GOOGLE_VERTEX_API_KEY, project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: env.GCP_SERVICE_ACCOUNT_KEY }, { model: 'gemini-2.0-flash', timeoutMs: 20000, sourceType: 'satellite_overhead' })
      } catch {}
    }

    // MERGE: Combine Cloud Run + Gemini findings for best coverage
    const mergedVision = mergeVisionFindings(cloudRunVision, geminiVision)
    if (mergedVision) {
      reportData.vision_findings = mergedVision
      if (mergedVision.heat_score.total >= 60) { reportData.quality.confidence_score = Math.min(reportData.quality.confidence_score, 70); reportData.quality.field_verification_recommended = true }
    }

    // ── CUSTOMER PRICING & ROOF TRACE INJECTION ──
    // Parse roof_trace_json from order (if user traced the roof outline)
    if (order.roof_trace_json) {
      try {
        const traceData = typeof order.roof_trace_json === 'string' ? JSON.parse(order.roof_trace_json) : order.roof_trace_json
        reportData.roof_trace = traceData
        console.log(`[Generate] Order ${orderId}: roof trace included (${traceData.eaves?.length || 0} eave pts, ${traceData.ridges?.length || 0} ridges, ${traceData.hips?.length || 0} hips)`)
      } catch (e: any) {
        console.warn(`[Generate] Order ${orderId}: Failed to parse roof_trace_json:`, e.message)
      }
    }

    // Compute customer cost estimate: total squares with 15% waste × price per bundle
    if (order.price_per_bundle && order.price_per_bundle > 0) {
      const trueArea = reportData.total_true_area_sqft || 0
      const wasteMultiplier = 1.15  // 15% waste
      const grossSquares = Math.ceil((trueArea * wasteMultiplier) / 100 * 10) / 10
      reportData.customer_price_per_bundle = parseFloat(order.price_per_bundle)
      reportData.customer_gross_squares = grossSquares
      reportData.customer_total_cost_estimate = Math.round(grossSquares * parseFloat(order.price_per_bundle) * 100) / 100
      console.log(`[Generate] Order ${orderId}: Customer pricing — $${order.price_per_bundle}/sq × ${grossSquares} squares = $${reportData.customer_total_cost_estimate} CAD`)
    }

    console.log(`[Generate] Order ${orderId}: generating HTML report...`)
    let html: string
    try {
      html = generateProfessionalReportHTML(reportData)
      console.log(`[Generate] Order ${orderId}: HTML generated (${html.length} chars)`)
    } catch (htmlErr: any) {
      console.error(`[Generate] Order ${orderId}: HTML generation FAILED:`, htmlErr.message)
      // Save report data even if HTML fails
      html = `<html><body><h1>Report Generated</h1><p>HTML rendering failed: ${htmlErr.message}</p><pre>${JSON.stringify(reportData.property, null, 2)}</pre></body></html>`
    }
    await repo.saveCompletedReport(env.DB, orderId, reportData, html, usedDL ? '3.0' : '2.0')
    await repo.markOrderStatus(env.DB, orderId, 'completed')
    console.log(`[Generate] Order ${orderId}: ✅ COMPLETED (${reportData.segments?.length} segments, ${reportData.total_true_area_sqft} sqft)`)
    return { success: true, report: reportData, version: usedDL ? '3.0' : '2.0', provider: reportData.metadata?.provider || 'unknown' }
  } catch (err: any) {
    try { await repo.markReportFailed(env.DB, orderId, err.message); await repo.markOrderStatus(env.DB, orderId, 'failed') } catch {}
    return { success: false, error: err.message }
  }
}
