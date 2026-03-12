// ============================================================
// RoofReporterAI — Reports Routes (Thin Controller Layer)
// ~400 lines — all logic delegated to services/repositories.
// ============================================================

import { Hono } from 'hono'
import type { Bindings, RoofReport } from '../types'
import { computeMaterialEstimate } from '../utils/geo-math'
import { validateAdminSession } from '../routes/auth'
import { resolveTeamOwner } from './team'

// Services
import { analyzeRoofGeometry } from '../services/gemini'
import { visionScan, computeHeatScore, filterFindings } from '../services/vision-analyzer'
import type { VisionFindings } from '../types'
import {
  callGoogleSolarAPI, generateMockRoofReport, generateGPTRoofEstimate,
  generateEnhancedImagery, generateEdgesFromSegments, computeEdgeSummary,
  fetchSolarPitchAndImagery, type SolarPitchAndImagery
} from '../services/solar-api'
import { buildDataLayersReport, generateSegmentsFromDLAnalysis, generateSegmentsFromAIGeometry } from '../services/report-engine'
import { executeRoofOrder, type DataLayersAnalysis } from '../services/solar-datalayers'
import { generateProfessionalReportHTML, buildVisionFindingsHTML, generateSimpleTwoPageReport } from '../templates/report-html'
import { generateTraceBasedDiagramSVG } from '../templates/svg-diagrams'
import { RoofMeasurementEngine, traceUiToEnginePayload, calculateRoofSpecs, ROOF_PITCH_MULTIPLIERS, HIP_VALLEY_MULTIPLIERS, type TraceReport } from '../services/roof-measurement-engine'
import { enhanceReportViaGemini } from '../services/gemini-enhance'
import { generateReportImagery, buildAIImageryHTML } from '../services/ai-image-generation'
import { buildEmailWrapper, sendGmailEmail, sendViaResend, sendGmailOAuth2 } from '../services/email'

// Cloud Run Custom AI (Colab-trained model)
import {
  buildCloudRunConfig, checkCloudRunHealth, analyzeViaCloudRun, batchAnalyzeViaCloudRun,
  convertToVisionFindings, convertToAIGeometry, mergeVisionFindings,
  type CloudRunAIConfig, type CloudRunHealthResponse
} from '../services/cloud-run-ai'

// Repository
import * as repo from '../repositories/reports'

// GA4 Server-Side Event Tracking
import { trackReportGenerated, trackReportEnhanced, trackEmailSent } from '../services/ga4-events'

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
  if (!session) return null
  // Resolve team membership — team members access owner's reports
  const teamInfo = await resolveTeamOwner(db, session.customer_id)
  return { id: teamInfo.ownerId, email: session.email, name: session.name, role: 'customer', isTeamMember: teamInfo.isTeamMember, realCustomerId: session.customer_id }
}

reportsRoutes.use('/*', async (c, next) => {
  const path = c.req.path
  if (path.endsWith('/html') || path.endsWith('/simple') || path.endsWith('/pdf') || path.endsWith('/webhook-update') || path.endsWith('/enhancement-status') || path.endsWith('/calculate-from-trace') || path.endsWith('/pitch-multipliers') || path.endsWith('/calculate-roof-specs')) return next()
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
// GET /pitch-multipliers — PUBLIC reference table
// Returns the industry-standard pitch multiplier lookup table
// used by the measurement engine (1/12 through 24/12).
// ============================================================
reportsRoutes.get('/pitch-multipliers', async (c) => {
  const table = Object.entries(ROOF_PITCH_MULTIPLIERS).map(([rise, multiplier]) => ({
    pitch_rise: Number(rise),
    pitch_label: `${rise}:12`,
    pitch_angle_deg: Math.round(Math.atan(Number(rise) / 12) * 180 / Math.PI * 100) / 100,
    area_multiplier: multiplier,
    hip_valley_multiplier: HIP_VALLEY_MULTIPLIERS[Number(rise)] ?? null,
  }))
  return c.json({
    success: true,
    engine_version: 'RoofMeasurementEngine v5.0',
    source: 'Industry-standard Pythagorean: √(rise² + 12²) / 12',
    reference: 'GAF / CertainTeed / IKO / EagleView standards',
    coverage: '0/12 through 24/12 (residential + commercial)',
    table,
  })
})

// ============================================================
// POST /calculate-roof-specs — PUBLIC quick calculator
// Takes flat dimensions + pitch, returns true sloped area.
// ============================================================
reportsRoutes.post('/calculate-roof-specs', async (c) => {
  try {
    const body = await c.req.json()
    const flatLength = Number(body.flat_length_ft || body.length || 0)
    const flatWidth = Number(body.flat_width_ft || body.width || 0)
    const pitchRise = Number(body.pitch_rise || body.pitch || 5)

    if (flatLength <= 0 || flatWidth <= 0) {
      return c.json({ success: false, error: 'flat_length_ft and flat_width_ft must be > 0' }, 400)
    }
    if (pitchRise < 0 || pitchRise > 30) {
      return c.json({ success: false, error: 'pitch_rise must be 0-30' }, 400)
    }

    const specs = calculateRoofSpecs(flatLength, flatWidth, pitchRise)
    return c.json({
      success: true,
      engine_version: 'RoofMeasurementEngine v5.0',
      input: { flat_length_ft: flatLength, flat_width_ft: flatWidth, pitch_rise: pitchRise },
      results: specs,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

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
// GET /:orderId/simple — Simple Two-Page Measurement Report (no auth for sharing/iframes)
// Returns the clean 2-page report: Page 1 Roof Diagram + Tables, Page 2 Summary + Satellite
// ============================================================
reportsRoutes.get('/:orderId/simple', async (c) => {
  const orderId = c.req.param('orderId')
  const row = await repo.getReportRawData(c.env.DB, orderId)
  if (!row) return c.json({ error: 'Report not found' }, 404)
  try {
    const data = typeof row.api_response_raw === 'string' ? JSON.parse(row.api_response_raw) : row.api_response_raw
    if (!data || !data.segments) return c.json({ error: 'Report data incomplete — generate a full report first' }, 404)
    const html = generateSimpleTwoPageReport(data)
    return c.html(html)
  } catch (e: any) {
    return c.json({ error: 'Failed to render simple report: ' + (e.message || 'unknown error') }, 500)
  }
})

// ============================================================
// POST /:orderId/generate — Report pipeline
// Generates base report as 'completed', then tries inline enhancement.
// Report is ALWAYS immediately available — enhancement is a bonus.
// ============================================================
reportsRoutes.post('/:orderId/generate', async (c) => {
  const orderId = c.req.param('orderId')

  // Generate base report (WELD + PAINT + POLISH + quick AI scans)
  // This saves report as 'completed' immediately
  const result = await generateReportForOrder(orderId, c.env)
  if (!result.success) return c.json({ error: result.error }, result.error === 'Order not found' ? 404 : 500)

  // Try inline enhancement — base report already saved as 'completed'
  let finalVersion = result.version
  if (result.report && result.hasEnhanceKey && c.env.GEMINI_ENHANCE_API_KEY) {
    try {
      const enhanced = await enhanceReportInline(orderId, result.report, c.env)
      if (enhanced) finalVersion = enhanced
      console.log(`[Generate] Order ${orderId}: Enhancement ${enhanced ? '✅ v' + enhanced : '⚠️ skipped'}`)
    } catch (e: any) {
      console.error(`[Generate] Order ${orderId}: Enhancement error (base report stands):`, e.message)
    }
  }

  // Phase 3: AI Imagery Generation — create professional AI visuals
  if (result.report) {
    try {
      const imagerySuccess = await generateAIImageryForReport(orderId, result.report, c.env)
      console.log(`[Generate] Order ${orderId}: AI Imagery ${imagerySuccess ? '✅ generated' : '⚠️ skipped'}`)
    } catch (e: any) {
      console.error(`[Generate] Order ${orderId}: AI Imagery error (report stands):`, e.message)
    }
  }

  return c.json({
    success: true,
    message: 'Report generated',
    orderId,
    status: 'completed',
    provider: result.provider,
    version: finalVersion,
    report: result.report
  })
})

// ============================================================
// POST /:orderId/retry — Reset and re-generate
// ============================================================
reportsRoutes.post('/:orderId/retry', async (c) => {
  const orderId = c.req.param('orderId')
  const report = await repo.getReportStatus(c.env.DB, orderId)
  if (!report) return c.json({ error: 'No report record found' }, 404)
  await repo.resetReportForRetry(c.env.DB, orderId)

  // Generate base report (saved as 'completed' immediately)
  const result = await generateReportForOrder(orderId, c.env).catch(e => {
    console.error(`[Retry] ${orderId}:`, e.message)
    return { success: false, error: e.message } as any
  })

  // Enhancement inline — base report already saved
  let finalVersion = result?.version
  if (result?.success && result.report && result.hasEnhanceKey && c.env.GEMINI_ENHANCE_API_KEY) {
    try {
      const enhanced = await enhanceReportInline(orderId, result.report, c.env)
      if (enhanced) finalVersion = enhanced
    } catch (e: any) {
      console.error(`[Retry] Order ${orderId}: Enhancement error:`, e.message)
    }
  }

  // Phase 3: AI Imagery Generation
  if (result?.success && result.report) {
    try {
      await generateAIImageryForReport(orderId, result.report, c.env)
    } catch (e: any) {
      console.error(`[Retry] Order ${orderId}: AI Imagery error:`, e.message)
    }
  }

  return c.json({ success: true, message: 'Retry completed', previousStatus: report.status, status: 'completed', version: finalVersion })
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
// POST /:orderId/trace-remeasure — Re-measure roof using ONLY
// user-traced coordinates. Never trust Solar API blindly.
//
// Runs the RoofMeasurementEngine on the trace data, cross-checks
// against Solar API numbers, regenerates the SVG diagram from
// the actual eaves polygon, and updates the report.
// ============================================================
reportsRoutes.post('/:orderId/trace-remeasure', async (c) => {
  const orderId = c.req.param('orderId')
  const order = await repo.getOrderById(c.env.DB, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)

  if (!order.roof_trace_json) {
    return c.json({ error: 'No roof trace data. User must trace the roof outline first.' }, 400)
  }

  const trace = typeof order.roof_trace_json === 'string' ? JSON.parse(order.roof_trace_json) : order.roof_trace_json

  if (!trace.eaves || trace.eaves.length < 3) {
    return c.json({ error: 'Need at least 3 eave points. Trace every corner of the house.' }, 400)
  }

  // Get existing report for cross-check data
  const existingReport = await repo.getReportRawData(c.env.DB, orderId)
  let reportData: RoofReport | null = null
  if (existingReport?.api_response_raw) {
    try {
      reportData = typeof existingReport.api_response_raw === 'string'
        ? JSON.parse(existingReport.api_response_raw)
        : existingReport.api_response_raw
    } catch (e) { /* ignore */ }
  }

  // Build Solar API cross-check payload from existing report
  const solarApiData: any = {}
  if (reportData) {
    solarApiData.footprint_sqft = reportData.total_footprint_sqft || 0
    solarApiData.true_area_sqft = reportData.total_true_area_sqft || 0
    solarApiData.pitch_degrees = reportData.roof_pitch_degrees || 0
    if (reportData.edge_summary) {
      solarApiData.edge_summary = {
        total_ridge_ft: reportData.edge_summary.total_ridge_ft || 0,
        total_hip_ft: reportData.edge_summary.total_hip_ft || 0,
        total_valley_ft: reportData.edge_summary.total_valley_ft || 0,
        total_eave_ft: reportData.edge_summary.total_eave_ft || 0,
        total_rake_ft: reportData.edge_summary.total_rake_ft || 0,
      }
    }
  }

  // Determine default pitch from existing report or DSM data
  const defaultPitchDeg = reportData?.roof_pitch_degrees || 20
  const defaultPitchRise = Math.round(12 * Math.tan(defaultPitchDeg * Math.PI / 180) * 10) / 10

  // Convert trace UI format to engine payload and run measurement
  const enginePayload = traceUiToEnginePayload(
    trace,
    {
      property_address: order.property_address || '',
      homeowner_name: order.homeowner_name || '',
      order_number: order.order_number || '',
      latitude: order.latitude,
      longitude: order.longitude,
      price_per_bundle: order.price_per_bundle,
    },
    defaultPitchRise
  )

  const engine = new RoofMeasurementEngine(enginePayload)
  const traceReport = engine.run()

  console.log(`[TraceRemeasure] Order ${orderId}: Engine completed — ` +
    `footprint=${traceReport.key_measurements.total_projected_footprint_ft2}sqft, ` +
    `sloped=${traceReport.key_measurements.total_roof_area_sloped_ft2}sqft, ` +
    `eave_pts=${traceReport.key_measurements.num_eave_points}, ` +
    `pitch=${traceReport.key_measurements.dominant_pitch_label}`)

  // Cross-check against Solar API data
  const crossChecks: any[] = []
  if (solarApiData.footprint_sqft) {
    const diff = Math.abs(traceReport.key_measurements.total_projected_footprint_ft2 - solarApiData.footprint_sqft) / solarApiData.footprint_sqft * 100
    crossChecks.push({
      parameter: 'footprint_sqft',
      engine: traceReport.key_measurements.total_projected_footprint_ft2,
      solar_api: solarApiData.footprint_sqft,
      difference_pct: Math.round(diff * 10) / 10,
      verdict: diff <= 5 ? 'MATCH' : diff <= 15 ? 'MINOR_DIFF' : diff <= 30 ? 'SIGNIFICANT_DIFF' : 'CRITICAL'
    })
  }

  // Generate trace-based SVG diagram
  const traceSVG = generateTraceBasedDiagramSVG(
    trace,
    {
      total_ridge_ft: traceReport.linear_measurements.ridges_total_ft,
      total_hip_ft: traceReport.linear_measurements.hips_total_ft,
      total_valley_ft: traceReport.linear_measurements.valleys_total_ft,
      total_eave_ft: traceReport.linear_measurements.eaves_total_ft,
      total_rake_ft: traceReport.linear_measurements.rakes_total_ft,
    },
    traceReport.key_measurements.total_projected_footprint_ft2,
    traceReport.key_measurements.dominant_pitch_angle_deg,
    traceReport.key_measurements.dominant_pitch_label,
    traceReport.key_measurements.total_squares_gross_w_waste,
    traceReport.key_measurements.total_roof_area_sloped_ft2
  )

  // If we have a report, update it with trace-based measurements
  if (reportData) {
    // Inject trace measurements into report
    reportData.roof_trace = trace
    ;(reportData as any).trace_measurement = traceReport
    ;(reportData as any).trace_diagram_svg = traceSVG

    // Add cross-check notes to quality
    reportData.quality = reportData.quality || { notes: [] }
    reportData.quality.notes = reportData.quality.notes || []
    reportData.quality.notes.push(
      `Trace-based remeasurement: ${traceReport.key_measurements.num_eave_points} eave points, ${traceReport.key_measurements.num_ridges} ridges, ${traceReport.key_measurements.num_valleys} valleys.`,
      `Engine footprint: ${traceReport.key_measurements.total_projected_footprint_ft2} sqft (vs Solar API ${solarApiData.footprint_sqft || 'N/A'} sqft).`,
      `Engine sloped area: ${traceReport.key_measurements.total_roof_area_sloped_ft2} sqft (vs Solar API ${solarApiData.true_area_sqft || 'N/A'} sqft).`
    )

    // Regenerate HTML with the trace diagram injected
    const html = generateProfessionalReportHTML(reportData)

    // Save updated report
    await c.env.DB.prepare(`UPDATE reports SET 
      api_response_raw = ?,
      professional_report_html = ?,
      roof_area_sqft = ?,
      roof_footprint_sqft = ?,
      total_ridge_ft = ?,
      total_hip_ft = ?,
      total_valley_ft = ?,
      total_eave_ft = ?,
      total_rake_ft = ?,
      updated_at = datetime('now')
      WHERE order_id = ?`
    ).bind(
      JSON.stringify(reportData),
      html,
      traceReport.key_measurements.total_roof_area_sloped_ft2,
      traceReport.key_measurements.total_projected_footprint_ft2,
      traceReport.linear_measurements.ridges_total_ft,
      traceReport.linear_measurements.hips_total_ft,
      traceReport.linear_measurements.valleys_total_ft,
      traceReport.linear_measurements.eaves_total_ft,
      traceReport.linear_measurements.rakes_total_ft,
      orderId
    ).run()

    console.log(`[TraceRemeasure] Order ${orderId}: Report updated with trace measurements and new SVG diagram`)
  }

  return c.json({
    success: true,
    trace_report: traceReport,
    cross_checks: crossChecks,
    trace_svg_generated: true,
    advisory_notes: traceReport.advisory_notes,
    summary: {
      eave_points: traceReport.key_measurements.num_eave_points,
      footprint_sqft: traceReport.key_measurements.total_projected_footprint_ft2,
      sloped_area_sqft: traceReport.key_measurements.total_roof_area_sloped_ft2,
      net_squares: traceReport.key_measurements.total_squares_net,
      gross_squares: traceReport.key_measurements.total_squares_gross_w_waste,
      dominant_pitch: traceReport.key_measurements.dominant_pitch_label,
      eaves_ft: traceReport.linear_measurements.eaves_total_ft,
      ridges_ft: traceReport.linear_measurements.ridges_total_ft,
      valleys_ft: traceReport.linear_measurements.valleys_total_ft,
      solar_api_footprint: solarApiData.footprint_sqft || null,
      solar_api_area: solarApiData.true_area_sqft || null,
    }
  })
})
// ============================================================
// ============================================================
// POST /calculate-from-trace — PUBLIC pre-order measurement engine
// Runs BEFORE the user submits their order. No auth required.
// Takes raw trace coordinates and returns full measurements.
// This blocks report submission until the engine completes.
// ============================================================
reportsRoutes.post('/calculate-from-trace', async (c) => {
  const startTime = Date.now()
  try {
    const body = await c.req.json()
    const { trace, address, default_pitch } = body

    if (!trace || !trace.eaves || !Array.isArray(trace.eaves)) {
      return c.json({ error: 'Missing or invalid trace data. trace.eaves[] is required.' }, 400)
    }

    if (trace.eaves.length < 3) {
      return c.json({ error: `Need at least 3 eave points to form a polygon. You have ${trace.eaves.length}. Trace every corner of the roof.` }, 400)
    }

    // Validate that eave points have lat/lng
    for (let i = 0; i < trace.eaves.length; i++) {
      const pt = trace.eaves[i]
      if (pt.lat == null || pt.lng == null || isNaN(pt.lat) || isNaN(pt.lng)) {
        return c.json({ error: `Eave point ${i + 1} has invalid coordinates.` }, 400)
      }
    }

    // Use provided pitch or default to 5:12
    const pitchRise = default_pitch || 5.0

    // Convert trace UI format to engine payload
    const enginePayload = traceUiToEnginePayload(
      trace,
      {
        property_address: address || 'Pre-Order Measurement',
        homeowner_name: '',
        order_number: 'PRE-ORDER',
      },
      pitchRise
    )

    // Run the measurement engine
    const engine = new RoofMeasurementEngine(enginePayload)
    const report = engine.run()

    const elapsed = Date.now() - startTime
    console.log(`[CalculateFromTrace] Pre-order measurement completed in ${elapsed}ms — ` +
      `footprint=${report.key_measurements.total_projected_footprint_ft2}sqft, ` +
      `sloped=${report.key_measurements.total_roof_area_sloped_ft2}sqft, ` +
      `eave_pts=${report.key_measurements.num_eave_points}, ` +
      `pitch=${report.key_measurements.dominant_pitch_label}`)

    // Return structured response for the order form UI
    return c.json({
      success: true,
      calculation_ms: elapsed,
      engine_version: report.report_meta.engine_version,

      // Key numbers for the order form display
      measurements: {
        projected_footprint_sqft: report.key_measurements.total_projected_footprint_ft2,
        true_area_sqft: report.key_measurements.total_roof_area_sloped_ft2,
        net_squares: report.key_measurements.total_squares_net,
        gross_squares: report.key_measurements.total_squares_gross_w_waste,
        waste_pct: report.key_measurements.waste_factor_pct,
        dominant_pitch: report.key_measurements.dominant_pitch_label,
        dominant_pitch_deg: report.key_measurements.dominant_pitch_angle_deg,
        num_faces: report.key_measurements.num_roof_faces,
        num_eave_points: report.key_measurements.num_eave_points,
        num_ridges: report.key_measurements.num_ridges,
        num_hips: report.key_measurements.num_hips,
        num_valleys: report.key_measurements.num_valleys,
      },

      // Linear edge measurements
      edges: {
        eaves_ft: report.linear_measurements.eaves_total_ft,
        ridges_ft: report.linear_measurements.ridges_total_ft,
        hips_ft: report.linear_measurements.hips_total_ft,
        valleys_ft: report.linear_measurements.valleys_total_ft,
        rakes_ft: report.linear_measurements.rakes_total_ft,
        perimeter_ft: report.linear_measurements.perimeter_eave_rake_ft,
        total_linear_ft: report.linear_measurements.eaves_total_ft + report.linear_measurements.ridges_total_ft + report.linear_measurements.hips_total_ft + report.linear_measurements.valleys_total_ft + report.linear_measurements.rakes_total_ft,
      },

      // Material estimates
      materials: report.materials_estimate,

      // Eave edge breakdown (individual edge lengths)
      // Include length_ft alias for backward compat with frontend
      eave_edges: report.eave_edge_breakdown.map(e => ({
        ...e,
        length_ft: e.length_2d_ft,  // backward compat alias
      })),

      // Face details (area per roof face)
      face_details: report.face_details,

      // Advisory notes
      advisory_notes: report.advisory_notes,

      // Full engine report (for storage in order)
      full_report: report,
    })
  } catch (err: any) {
    console.error(`[CalculateFromTrace] Error:`, err.message)
    return c.json({ error: 'Measurement calculation failed', details: err.message }, 500)
  }
})

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

  // ── PHASE 1 COMPLETE: Save base report first, then attempt enhancement inline ──
  const baseHtml = generateProfessionalReportHTML(reportData)
  const baseVer = '3.0'
  
  // Track report generation event in GA4 (non-blocking)
  trackReportGenerated(c.env, orderId, {
    provider: reportData.metadata?.provider || 'google_solar',
    accuracy: reportData.metadata?.accuracy_benchmark || 'unknown',
    has_vision: !!reportData.vision_findings,
    roof_area: reportData.roof_area_sqft || 0,
    roof_pitch: reportData.roof_pitch_degrees || 0
  }).catch(() => {})

  // Always save base report as 'completed' first — customer can see it immediately
  await repo.saveCompletedReport(c.env.DB, orderId, reportData, baseHtml, baseVer)
  await repo.markOrderStatus(c.env.DB, orderId, 'completed')
  await repo.logApiRequest(c.env.DB, orderId, 'solar_datalayers', 'dataLayers:get + GeoTIFF', 200, dlAnalysis.durationMs)

  // Enhancement: attempt inline with tight timeout — if it fails, base report stands
  if (c.env.GEMINI_ENHANCE_API_KEY) {
    try {
      await repo.markEnhancementSent(c.env.DB, orderId)
      const satUrl = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url || null
      console.log(`[Enhanced-Inline] Order ${orderId}: Attempting Gemini enhancement...`)
      
      const enhanced = await enhanceReportViaGemini(reportData, c.env.GEMINI_ENHANCE_API_KEY, satUrl, {
        timeoutMs: 25000,
        focus: 'roofSegmentStats'
      })

      if (enhanced) {
        const enhHtml = generateProfessionalReportHTML(enhanced)
        const enhVer = enhanced.report_version || '3.1'
        await repo.saveEnhancedReport(c.env.DB, orderId, enhHtml, JSON.stringify(enhanced), enhVer, 0)
        await c.env.DB.prepare(`UPDATE reports SET status = 'completed', updated_at = datetime('now') WHERE order_id = ?`).bind(orderId).run()
        console.log(`[Enhanced-Inline] Order ${orderId}: ✅ Polished (v${enhVer})`)
        trackReportEnhanced(c.env, String(orderId), { version: enhVer, enhanced: true }).catch(() => {})

        // Send email with polished report
        if (email_report) {
          const recipient = to_email || order.homeowner_email || order.requester_email
          if (recipient) {
            try {
              const emailHtml = buildEmailWrapper(enhHtml, order.property_address, `RM-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(orderId).padStart(4,'0')}`, recipient)
              const rt = (c.env as any).GMAIL_REFRESH_TOKEN, ci = (c.env as any).GMAIL_CLIENT_ID, cs = (c.env as any).GMAIL_CLIENT_SECRET
              if (rt && ci && cs) await sendGmailOAuth2(ci, cs, rt, recipient, `Roof Report - ${order.property_address}`, emailHtml, c.env.GMAIL_SENDER_EMAIL)
            } catch {}
          }
        }

        return c.json({ success: true, message: 'Report generated and polished', status: 'completed', version: enhVer, report: enhanced })
      } else {
        console.warn(`[Enhanced-Inline] Order ${orderId}: Enhancement returned null — base report delivered`)
        await repo.markEnhancementFailed(c.env.DB, orderId, 'Gemini returned null')
      }
    } catch (enhErr: any) {
      console.warn(`[Enhanced-Inline] Order ${orderId}: Enhancement failed — base report stands: ${enhErr.message}`)
      await repo.markEnhancementFailed(c.env.DB, orderId, enhErr.message).catch(() => {})
    }
  }

  // Send email with base report (no enhancement or enhancement failed)
  if (email_report) {
    const recipient = to_email || order.homeowner_email || order.requester_email
    if (recipient) {
      try {
        const emailHtml = buildEmailWrapper(baseHtml, order.property_address, `RM-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(orderId).padStart(4,'0')}`, recipient)
        const rt = (c.env as any).GMAIL_REFRESH_TOKEN, ci = (c.env as any).GMAIL_CLIENT_ID, cs = (c.env as any).GMAIL_CLIENT_SECRET
        if (rt && ci && cs) await sendGmailOAuth2(ci, cs, rt, recipient, `Roof Report - ${order.property_address}`, emailHtml, c.env.GMAIL_SENDER_EMAIL)
      } catch {}
    }
  }

  return c.json({ success: true, message: `Report generated (v${baseVer})`, status: 'completed', report: reportData })
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
  // Track email event in GA4 (non-blocking)
  trackEmailSent(c.env as any, 'report_email', recipient, { order_id: orderId, method }).catch(() => {})
  return c.json({ success: true, to: recipient, method })
})

// ============================================================
// POST /:orderId/webhook-update — Receive enhanced report from Cloud Run
// ============================================================
// This endpoint is called by your Google AI Studio Cloud Run app
// after it finishes enhancing the report. Auth via REPORT_WEBHOOK_SECRET.
reportsRoutes.post('/:orderId/webhook-update', async (c) => {
  const orderId = c.req.param('orderId')
  
  // Validate webhook secret
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  const webhookSecret = c.env.REPORT_WEBHOOK_SECRET
  if (!webhookSecret || !token || token !== webhookSecret) {
    console.warn(`[Webhook] Order ${orderId}: Invalid or missing webhook token`)
    return c.json({ error: 'Unauthorized — invalid webhook token' }, 401)
  }

  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400)

  console.log(`[Webhook] Order ${orderId}: Received enhanced report callback`)
  console.log(`[Webhook] Order ${orderId}: Keys: ${Object.keys(body).join(', ')}`)

  // The Cloud Run engine sends back the enhanced report data
  const {
    enhanced_html,
    enhanced_report_data,       // Full RoofReport JSON (enhanced)
    enhancement_version = '1.0',
    processing_time_ms = 0,
    status = 'success',
    error_message
  } = body

  if (status === 'failed' || status === 'error') {
    console.error(`[Webhook] Order ${orderId}: Enhancement FAILED: ${error_message}`)
    await repo.markEnhancementFailed(c.env.DB, orderId, error_message || 'Unknown error from Cloud Run')
    return c.json({ success: false, message: 'Enhancement failure recorded', orderId })
  }

  // We need at least the enhanced report data JSON
  if (!enhanced_report_data && !enhanced_html) {
    return c.json({ error: 'Missing enhanced_report_data or enhanced_html' }, 400)
  }

  let finalHtml = enhanced_html || ''
  let finalRawJson = ''

  if (enhanced_report_data) {
    // If full report data is provided, re-generate HTML from it
    // This ensures our template is always used
    try {
      const reportData = typeof enhanced_report_data === 'string'
        ? JSON.parse(enhanced_report_data)
        : enhanced_report_data
      finalRawJson = JSON.stringify(reportData)
      // Re-generate HTML using our template for consistency
      try {
        finalHtml = generateProfessionalReportHTML(reportData)
        console.log(`[Webhook] Order ${orderId}: Re-generated HTML from enhanced data (${finalHtml.length} chars)`)
      } catch (htmlErr: any) {
        // If HTML generation fails, use the provided HTML if available
        console.warn(`[Webhook] Order ${orderId}: HTML re-gen failed, using provided HTML: ${htmlErr.message}`)
        if (!finalHtml) {
          finalHtml = `<html><body><h1>Enhanced Report</h1><p>HTML rendering failed</p></body></html>`
        }
      }
    } catch (parseErr: any) {
      console.error(`[Webhook] Order ${orderId}: Failed to parse enhanced_report_data: ${parseErr.message}`)
      return c.json({ error: 'Invalid enhanced_report_data JSON' }, 400)
    }
  }

  // Save the enhanced report — this overwrites the primary report HTML
  await repo.saveEnhancedReport(
    c.env.DB, orderId,
    finalHtml, finalRawJson,
    enhancement_version, processing_time_ms
  )

  // Log the enhancement
  await repo.logApiRequest(c.env.DB, orderId, 'webhook_enhancement',
    'cloud_run_callback', 200, processing_time_ms,
    JSON.stringify({ version: enhancement_version, html_length: finalHtml.length })
  )

  console.log(`[Webhook] Order ${orderId}: ✅ Enhanced report saved (v${enhancement_version}, ${processing_time_ms}ms, ${finalHtml.length} chars)`)

  return c.json({
    success: true,
    orderId,
    enhancement_version,
    html_length: finalHtml.length,
    message: 'Enhanced report saved and deployed to customer dashboard'
  })
})

// ============================================================
// GET /:orderId/enhancement-status — Check enhancement progress
// ============================================================
reportsRoutes.get('/:orderId/enhancement-status', async (c) => {
  const orderId = c.req.param('orderId')
  
  // Validate webhook secret for external polling (Cloud Run can check status)
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  const webhookSecret = c.env.REPORT_WEBHOOK_SECRET
  // Allow both webhook token and normal admin/customer auth
  const user = await validateAdminOrCustomer(c.env.DB, c.req.header('Authorization'))
  if (!user && (!webhookSecret || !token || token !== webhookSecret)) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const status = await repo.getEnhancementStatus(c.env.DB, orderId)
  if (!status) return c.json({ error: 'Report not found' }, 404)

  // Also fetch the report status to tell frontend if report is ready
  const reportStatus = await repo.getReportStatus(c.env.DB, orderId)
  const isReady = reportStatus?.status === 'completed'
  const isEnhancing = reportStatus?.status === 'enhancing' || (status as any).enhancement_status === 'sent' || (status as any).enhancement_status === 'pending'

  return c.json({
    success: true,
    orderId,
    ...status,
    report_status: reportStatus?.status || 'unknown',
    is_ready: isReady,
    is_enhancing: isEnhancing,
    message: isReady
      ? 'Report is ready — polished and complete'
      : isEnhancing
        ? 'Report is being polished by AI — please wait...'
        : `Report status: ${reportStatus?.status || 'unknown'}`
  })
})

// ============================================================
// GET /:orderId/ai-imagery-status — Check AI imagery generation status
// ============================================================
reportsRoutes.get('/:orderId/ai-imagery-status', async (c) => {
  const orderId = c.req.param('orderId')
  const user = await validateAdminOrCustomer(c.env.DB, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const imageryStatus = await repo.getAIImageryStatus(c.env.DB, orderId)
  if (!imageryStatus) return c.json({ error: 'Report not found' }, 404)

  const imageCount = imageryStatus.ai_generated_imagery_json
    ? (JSON.parse(imageryStatus.ai_generated_imagery_json)?.images?.length || 0)
    : 0

  return c.json({
    success: true,
    orderId,
    ai_imagery_status: imageryStatus.ai_imagery_status || 'not_started',
    ai_imagery_error: imageryStatus.ai_imagery_error,
    image_count: imageCount,
    is_generating: imageryStatus.ai_imagery_status === 'generating',
    is_complete: imageryStatus.ai_imagery_status === 'completed'
  })
})

// ============================================================
// POST /recovery/stuck — Auto-recover reports stuck in 'enhancing' or 'generating'
// Admin endpoint that finds and fixes reports stuck > 90s
// ============================================================
reportsRoutes.post('/recovery/stuck', async (c) => {
  // Find reports stuck in 'enhancing' for > 90s or 'generating' for > 120s
  const stuckEnhancing = await c.env.DB.prepare(`
    SELECT r.order_id, r.status, r.generation_started_at, r.enhancement_sent_at
    FROM reports r
    WHERE (r.status = 'enhancing' AND r.updated_at < datetime('now', '-90 seconds'))
       OR (r.status = 'generating' AND r.updated_at < datetime('now', '-120 seconds'))
  `).all()

  const recovered: number[] = []
  for (const row of (stuckEnhancing.results || []) as any[]) {
    try {
      await c.env.DB.prepare(`
        UPDATE reports SET status = 'completed',
          enhancement_status = CASE WHEN status = 'enhancing' THEN 'enhancement_failed' ELSE enhancement_status END,
          enhancement_error = CASE WHEN status = 'enhancing' THEN 'Auto-recovered: stuck report' ELSE enhancement_error END,
          updated_at = datetime('now')
        WHERE order_id = ?
      `).bind(row.order_id).run()
      await repo.markOrderStatus(c.env.DB, row.order_id, 'completed')
      recovered.push(row.order_id as number)
      console.log(`[Recovery] Auto-recovered stuck report: order ${row.order_id} (was ${row.status})`)
    } catch (e: any) {
      console.error(`[Recovery] Failed to recover order ${row.order_id}:`, e.message)
    }
  }

  return c.json({
    success: true,
    scanned: (stuckEnhancing.results || []).length,
    recovered: recovered.length,
    recovered_orders: recovered,
    message: recovered.length > 0 ? `Recovered ${recovered.length} stuck report(s)` : 'No stuck reports found'
  })
})

// ============================================================
// INLINE ENHANCEMENT: Gemini polish with strict timeout
// Report is ALREADY saved as 'completed' before this runs.
// On success: overwrites with polished version (stays 'completed').
// On failure: base report stands — customer never sees 'enhancing'.
// Returns the enhanced version string on success, null on failure.
// ============================================================
export async function enhanceReportInline(
  orderId: number | string,
  reportData: RoofReport,
  env: Bindings
): Promise<string | null> {
  const enhanceKey = env.GEMINI_ENHANCE_API_KEY
  if (!enhanceKey) return null

  try {
    await repo.markEnhancementSent(env.DB, orderId)
    const satUrl = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url || null
    console.log(`[Enhance-Inline] Order ${orderId}: 🚀 Starting Gemini enhancement...`)

    const enhanced = await enhanceReportViaGemini(reportData, enhanceKey, satUrl, {
      timeoutMs: 20000,  // 20s strict timeout — report already delivered
      focus: 'roofSegmentStats'
    })

    if (enhanced) {
      const html = generateProfessionalReportHTML(enhanced)
      const version = enhanced.report_version || '3.1'
      await repo.saveEnhancedReport(env.DB, orderId, html, JSON.stringify(enhanced), version, 0)
      // Report is already 'completed' — just ensure it stays that way
      await env.DB.prepare(`UPDATE reports SET status = 'completed', updated_at = datetime('now') WHERE order_id = ?`).bind(orderId).run()
      console.log(`[Enhance-Inline] Order ${orderId}: ✅ Polished (v${version}, ${html.length} chars)`)
      trackReportEnhanced(env, String(orderId), { version, enhanced: true }).catch(() => {})
      return version
    } else {
      console.warn(`[Enhance-Inline] Order ${orderId}: Gemini returned null — base report stands`)
      await repo.markEnhancementFailed(env.DB, orderId, 'Gemini returned null')
      return null
    }
  } catch (err: any) {
    console.warn(`[Enhance-Inline] Order ${orderId}: Failed — base report stands: ${err.message}`)
    await repo.markEnhancementFailed(env.DB, orderId, err.message).catch(() => {})
    return null
  }
}

// Legacy alias for backward compatibility
export const enhanceReportInBackground = enhanceReportInline

// ============================================================
// PHASE 3: Generate AI imagery for the "perfect" report
// Runs AFTER enhancement as a bonus background step.
// Uses Gemini image generation to create professional visuals.
// The report is already 'completed' — this just adds imagery.
// ============================================================
export async function generateAIImageryForReport(
  orderId: number | string,
  reportData: RoofReport,
  env: Bindings
): Promise<boolean> {
  // Use the Gemini enhance key for image generation too
  const apiKey = env.GEMINI_ENHANCE_API_KEY
  if (!apiKey) {
    console.log(`[AIImagery] Order ${orderId}: No API key — skipping imagery generation`)
    return false
  }

  try {
    await repo.markAIImageryGenerating(env.DB, orderId)
    console.log(`[AIImagery] Order ${orderId}: 🎨 Starting AI imagery generation...`)

    const imagery = await generateReportImagery(reportData, apiKey, {
      maxImages: 4,
      timeoutPerImage: 25000,
      includeSatellite: true
    })

    if (imagery && imagery.images.length > 0) {
      // Inject AI imagery into report data
      reportData.ai_generated_imagery = imagery

      // Build the AI imagery HTML section
      const imageryHtml = buildAIImageryHTML(imagery)

      // Get current report HTML and append the AI imagery page
      const currentReport = await repo.getReportHtml(env.DB, orderId)
      let currentHtml = currentReport?.professional_report_html || ''

      if (currentHtml && imageryHtml) {
        // Insert AI imagery page before the closing </body></html>
        const insertPoint = currentHtml.lastIndexOf('</body>')
        if (insertPoint > 0) {
          currentHtml = currentHtml.slice(0, insertPoint) + imageryHtml + currentHtml.slice(insertPoint)
        } else {
          currentHtml += imageryHtml
        }
      }

      // Save imagery JSON and updated HTML
      await repo.saveAIImagery(env.DB, orderId, JSON.stringify(imagery), currentHtml)
      console.log(`[AIImagery] Order ${orderId}: ✅ ${imagery.images.length} images generated in ${imagery.generation_time_ms}ms`)
      return true
    } else {
      console.warn(`[AIImagery] Order ${orderId}: No images generated — all attempts failed`)
      await repo.markAIImageryFailed(env.DB, orderId, 'No images generated')
      return false
    }
  } catch (err: any) {
    console.error(`[AIImagery] Order ${orderId}: Failed — ${err.message}`)
    await repo.markAIImageryFailed(env.DB, orderId, err.message).catch(() => {})
    return false
  }
}


// ============================================================
// REPORT GENERATION ENGINE v5.0
//
// ARCHITECTURE:
//   PRIMARY: User-traced coordinates → RoofMeasurementEngine
//            (ALL geometry, area, edges, perimeter, materials)
//   SECONDARY: Google Solar API → pitch + satellite imagery ONLY
//   BONUS: AI analysis (Cloud Run / Gemini) for visual inspection
//
// Google Solar buildingInsights is NEVER used for area, footprint,
// segments, or edge calculations. Only pitch (slope) and imagery.
// ============================================================
export async function generateReportForOrder(
  orderId: number | string, env: Bindings
): Promise<{ success: boolean; report?: RoofReport; error?: string; version?: string; provider?: string; hasEnhanceKey?: boolean }> {
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
    if (existing?.status === 'enhancing') {
      const staleMs = existing.generation_started_at ? Date.now() - new Date(existing.generation_started_at + 'Z').getTime() : Infinity
      if (staleMs > 90_000) {
        console.warn(`[Generate] Order ${orderId}: Auto-recovering stuck 'enhancing' report (${Math.round(staleMs/1000)}s old)`)
        await env.DB.prepare(`UPDATE reports SET status = 'completed', enhancement_status = 'enhancement_failed', enhancement_error = 'Auto-recovered: stuck >90s', updated_at = datetime('now') WHERE order_id = ?`).bind(orderId).run()
        await repo.markOrderStatus(env.DB, orderId, 'completed')
      }
    }
    if (attemptNum > 3) return { success: false, error: 'Max attempts exceeded' }
    await repo.upsertGeneratingState(env.DB, orderId, attemptNum, !!existing)
    await repo.markOrderStatus(env.DB, orderId, 'processing')

    const startTime = Date.now()
    const solarApiKey = env.GOOGLE_SOLAR_API_KEY
    const mapsApiKey = env.GOOGLE_MAPS_API_KEY || solarApiKey

    // ═══════════════════════════════════════════════════════════
    // STEP 1: PARSE TRACE DATA (required for measurements)
    // The user MUST have traced eaves/ridges/hips/valleys on the
    // map during ordering. This is the SOLE source of geometry.
    // ═══════════════════════════════════════════════════════════
    let traceData: any = null
    let traceResult: TraceReport | null = null

    if (order.roof_trace_json) {
      try {
        traceData = typeof order.roof_trace_json === 'string' ? JSON.parse(order.roof_trace_json) : order.roof_trace_json
      } catch (e: any) {
        console.warn(`[Generate] Order ${orderId}: Failed to parse roof_trace_json: ${e.message}`)
      }
    }

    // Check for pre-calculated trace measurement from the order form
    if ((order as any).trace_measurement_json) {
      try {
        traceResult = typeof (order as any).trace_measurement_json === 'string'
          ? JSON.parse((order as any).trace_measurement_json)
          : (order as any).trace_measurement_json
        console.log(`[Generate] Order ${orderId}: Using PRE-CALCULATED trace measurement — ` +
          `footprint=${traceResult?.key_measurements?.total_projected_footprint_ft2}sqft, ` +
          `sloped=${traceResult?.key_measurements?.total_roof_area_sloped_ft2}sqft`)
      } catch (e: any) {
        console.warn(`[Generate] Order ${orderId}: Failed to parse pre-calculated measurement: ${e.message}`)
        traceResult = null
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: FETCH SOLAR PITCH + IMAGERY (lightweight call)
    // Only extracts weighted pitch and satellite image URLs.
    // NO area, NO footprint, NO segments from Solar API.
    // ═══════════════════════════════════════════════════════════
    let solarPitch: SolarPitchAndImagery | null = null
    let solarPitchDeg = 20 // sensible default if Solar unavailable
    let solarPitchRise = 4.4 // ~20°

    if (solarApiKey && order.latitude && order.longitude) {
      try {
        const footprintHint = traceResult?.key_measurements?.total_projected_footprint_ft2 || 1500
        solarPitch = await fetchSolarPitchAndImagery(
          order.latitude, order.longitude, solarApiKey, mapsApiKey || solarApiKey, footprintHint
        )
        solarPitchDeg = solarPitch.pitch_degrees
        solarPitchRise = Math.round(12 * Math.tan(solarPitchDeg * Math.PI / 180) * 10) / 10
        await repo.logApiRequest(env.DB, orderId, 'google_solar_api', 'buildingInsights:findClosest (pitch+imagery only)', 200, solarPitch.api_duration_ms)
        console.log(`[Generate] Order ${orderId}: Solar pitch=${solarPitchDeg}° (${solarPitchRise}:12), quality=${solarPitch.imagery_quality}, ${solarPitch.api_duration_ms}ms`)
      } catch (e: any) {
        console.warn(`[Generate] Order ${orderId}: Solar API failed (non-critical, using default pitch): ${e.message}`)
        await repo.logApiRequest(env.DB, orderId, 'google_solar_api', 'buildingInsights:findClosest (pitch+imagery only)', 500, Date.now() - startTime, e.message.substring(0, 500))
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 3: RUN TRACE MEASUREMENT ENGINE
    // If we have trace data but no pre-calculated result,
    // run the engine now using Solar pitch as default_pitch.
    // This is the SOLE source of all measurements.
    // ═══════════════════════════════════════════════════════════
    if (!traceResult && traceData && traceData.eaves && traceData.eaves.length >= 3) {
      try {
        const enginePayload = traceUiToEnginePayload(
          traceData,
          {
            property_address: order.property_address,
            homeowner_name: order.homeowner_name,
            order_number: order.order_number,
          },
          solarPitchRise
        )
        const engine = new RoofMeasurementEngine(enginePayload)
        traceResult = engine.run()
        console.log(`[Generate] Order ${orderId}: Trace engine computed — ` +
          `footprint=${traceResult.key_measurements.total_projected_footprint_ft2}sqft, ` +
          `sloped=${traceResult.key_measurements.total_roof_area_sloped_ft2}sqft, ` +
          `eave_pts=${traceResult.key_measurements.num_eave_points}, ` +
          `pitch=${traceResult.key_measurements.dominant_pitch_label}`)
      } catch (tmErr: any) {
        console.error(`[Generate] Order ${orderId}: Trace measurement engine FAILED: ${tmErr.message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: BUILD REPORT DATA
    // PRIMARY: trace measurements for ALL geometry
    // SECONDARY: Solar for imagery + pitch
    // FALLBACK: if no trace, generate legacy Solar-based report
    // ═══════════════════════════════════════════════════════════
    let reportData: RoofReport

    if (traceResult) {
      // ─── PREFERRED PATH: Trace-Engine Report ───
      const km = traceResult.key_measurements
      const lm = traceResult.linear_measurements
      const mat = traceResult.materials_estimate

      // Build segments from trace face details (or single whole-roof)
      const segments: any[] = traceResult.face_details.length > 0
        ? traceResult.face_details.map((face, i) => ({
            name: face.face_id || `Face ${i + 1}`,
            footprint_area_sqft: Math.round(face.projected_area_ft2),
            true_area_sqft: Math.round(face.sloped_area_ft2),
            true_area_sqm: Math.round(face.sloped_area_ft2 * 0.0929 * 10) / 10,
            pitch_degrees: Math.round(face.pitch_angle_deg * 10) / 10,
            pitch_ratio: face.pitch_label,
            azimuth_degrees: 0,
            azimuth_direction: 'N/A',
          }))
        : [{
            name: 'Total Roof (Traced)',
            footprint_area_sqft: Math.round(km.total_projected_footprint_ft2),
            true_area_sqft: Math.round(km.total_roof_area_sloped_ft2),
            true_area_sqm: Math.round(km.total_roof_area_sloped_ft2 * 0.0929 * 10) / 10,
            pitch_degrees: Math.round(km.dominant_pitch_angle_deg * 10) / 10,
            pitch_ratio: km.dominant_pitch_label,
            azimuth_degrees: 0,
            azimuth_direction: 'N/A',
          }]

      // Build edges from trace line details
      const traceEdges: any[] = []
      for (const edge of traceResult.eave_edge_breakdown) {
        traceEdges.push({
          edge_type: 'eave', label: `Eave ${edge.edge_num}`,
          plan_length_ft: Math.round(edge.length_2d_ft),
          true_length_ft: Math.round(edge.length_2d_ft), pitch_factor: 1.0,
        })
      }
      for (const seg of traceResult.ridge_details) {
        traceEdges.push({
          edge_type: 'ridge', label: seg.id,
          plan_length_ft: Math.round(seg.horiz_length_ft),
          true_length_ft: Math.round(seg.sloped_length_ft), pitch_factor: seg.slope_factor,
        })
      }
      for (const seg of traceResult.hip_details) {
        traceEdges.push({
          edge_type: 'hip', label: seg.id,
          plan_length_ft: Math.round(seg.horiz_length_ft),
          true_length_ft: Math.round(seg.sloped_length_ft), pitch_factor: seg.slope_factor,
        })
      }
      for (const seg of traceResult.valley_details) {
        traceEdges.push({
          edge_type: 'valley', label: seg.id,
          plan_length_ft: Math.round(seg.horiz_length_ft),
          true_length_ft: Math.round(seg.sloped_length_ft), pitch_factor: seg.slope_factor,
        })
      }
      for (const seg of traceResult.rake_details) {
        traceEdges.push({
          edge_type: 'rake', label: seg.id,
          plan_length_ft: Math.round(seg.horiz_length_ft),
          true_length_ft: Math.round(seg.sloped_length_ft), pitch_factor: seg.slope_factor,
        })
      }

      const traceEdgeSummary = {
        total_ridge_ft: Math.round(lm.ridges_total_ft),
        total_hip_ft: Math.round(lm.hips_total_ft),
        total_valley_ft: Math.round(lm.valleys_total_ft),
        total_eave_ft: Math.round(lm.eaves_total_ft),
        total_rake_ft: Math.round(lm.rakes_total_ft),
        total_perimeter_ft: Math.round(lm.perimeter_eave_rake_ft),
        total_flashing_ft: 0,
      }

      const traceMaterials = {
        total_squares: km.total_squares_net,
        gross_squares: km.total_squares_gross_w_waste,
        waste_factor: km.waste_factor_pct / 100,
        bundles_3tab: mat.shingles_bundles,
        underlayment_rolls: mat.underlayment_rolls,
        ice_water_shield_lf: Math.round(mat.ice_water_shield_sqft / 3),
        ridge_cap_lf: Math.round(mat.ridge_cap_lf),
        drip_edge_lf: Math.round(mat.drip_edge_total_lf),
        starter_strip_lf: Math.round(mat.starter_strip_lf),
        valley_flashing_lf: Math.round(mat.valley_flashing_lf),
        nails_lbs: mat.roofing_nails_lbs,
        caulk_tubes: mat.caulk_tubes,
      }

      // Imagery: prefer Solar API, fallback to basic Maps Static
      const imagery = solarPitch
        ? { ...solarPitch.imagery, dsm_url: null, mask_url: null }
        : {
            ...generateEnhancedImagery(
              order.latitude || 0, order.longitude || 0,
              mapsApiKey || '', km.total_projected_footprint_ft2
            ),
            dsm_url: null, mask_url: null,
          }

      reportData = {
        order_id: typeof orderId === 'string' ? parseInt(orderId) : orderId as number,
        generated_at: new Date().toISOString(),
        report_version: '5.0',
        property: {
          address: order.property_address,
          city: order.property_city, province: order.property_province,
          postal_code: order.property_postal_code,
          homeowner_name: order.homeowner_name,
          requester_name: order.requester_name,
          requester_company: order.requester_company,
          latitude: order.latitude, longitude: order.longitude,
        },
        total_footprint_sqft: Math.round(km.total_projected_footprint_ft2),
        total_footprint_sqm: Math.round(km.total_projected_footprint_ft2 * 0.0929),
        total_true_area_sqft: Math.round(km.total_roof_area_sloped_ft2),
        total_true_area_sqm: Math.round(km.total_roof_area_sloped_ft2 * 0.0929 * 10) / 10,
        area_multiplier: km.total_projected_footprint_ft2 > 0
          ? Math.round(km.total_roof_area_sloped_ft2 / km.total_projected_footprint_ft2 * 1000) / 1000 : 1,
        roof_pitch_degrees: Math.round(km.dominant_pitch_angle_deg * 10) / 10,
        roof_pitch_ratio: km.dominant_pitch_label,
        roof_azimuth_degrees: 0,
        segments,
        edges: traceEdges,
        edge_summary: traceEdgeSummary,
        materials: traceMaterials,
        max_sunshine_hours: 0, num_panels_possible: 0, yearly_energy_kwh: 0,
        imagery: imagery as any,
        roof_trace: traceData,
        excluded_segments: [],
        quality: {
          imagery_quality: (solarPitch?.imagery_quality || 'N/A') as any,
          imagery_date: solarPitch?.imagery_date,
          field_verification_recommended: false,
          confidence_score: 95,
          notes: [
            `Measurement source: User-traced coordinate geometry (RoofMeasurementEngine v4.0).`,
            `${km.num_eave_points} eave points, ${km.num_ridges} ridges, ${km.num_hips} hips, ${km.num_valleys} valleys traced.`,
            `Footprint: ${km.total_projected_footprint_ft2} sqft (Shoelace formula on WGS84→Cartesian projection).`,
            `Sloped area: ${km.total_roof_area_sloped_ft2} sqft (pitch-corrected: ${km.dominant_pitch_label}).`,
            solarPitch ? `Solar API pitch: ${solarPitchDeg}° (${solarPitch.pitch_ratio}), imagery quality: ${solarPitch.imagery_quality}.` : 'Solar API: unavailable — using trace-derived pitch.',
            ...(traceResult.advisory_notes || []),
          ]
        },
        metadata: {
          provider: 'trace_engine_v4',
          api_duration_ms: Date.now() - startTime,
          coordinates: { lat: order.latitude, lng: order.longitude },
          solar_api_imagery_date: solarPitch?.imagery_date,
          building_insights_quality: solarPitch?.imagery_quality,
          accuracy_benchmark: 'GPS coordinate trace + Shoelace area + common-run hip/valley correction',
          cost_per_query: solarPitch ? '$0.075 CAD (Solar API for pitch+imagery only)' : '$0.00 (trace-only)',
        },
      } as RoofReport

      // Store trace measurement for reference
      ;(reportData as any).trace_measurement = traceResult

      // Generate trace-based SVG diagram
      try {
        const traceSVG = generateTraceBasedDiagramSVG(
          traceData,
          {
            total_ridge_ft: lm.ridges_total_ft,
            total_hip_ft: lm.hips_total_ft,
            total_valley_ft: lm.valleys_total_ft,
            total_eave_ft: lm.eaves_total_ft,
            total_rake_ft: lm.rakes_total_ft,
          },
          km.total_projected_footprint_ft2,
          km.dominant_pitch_angle_deg,
          km.dominant_pitch_label,
          km.total_squares_gross_w_waste,
          km.total_roof_area_sloped_ft2
        )
        ;(reportData as any).trace_diagram_svg = traceSVG
      } catch (svgErr: any) {
        console.warn(`[Generate] Order ${orderId}: Trace SVG generation failed: ${svgErr.message}`)
      }

      console.log(`[Generate] Order ${orderId}: ✅ TRACE-ENGINE report built — ` +
        `footprint=${km.total_projected_footprint_ft2}sqft, sloped=${km.total_roof_area_sloped_ft2}sqft, ` +
        `pitch=${km.dominant_pitch_label}, squares=${km.total_squares_gross_w_waste}, ` +
        `eave=${lm.eaves_total_ft}ft, ridge=${lm.ridges_total_ft}ft, hip=${lm.hips_total_ft}ft`)

    } else {
      // ─── FALLBACK PATH: No trace data — use legacy Solar API ───
      console.warn(`[Generate] Order ${orderId}: ⚠️ NO TRACE DATA — falling back to Solar API full report`)

      if (solarApiKey && order.latitude && order.longitude) {
        try {
          reportData = await callGoogleSolarAPI(order.latitude, order.longitude, solarApiKey, typeof orderId === 'string' ? parseInt(orderId) : orderId as number, order, mapsApiKey)
          reportData.metadata.api_duration_ms = Date.now() - startTime
          console.log(`[Generate] Order ${orderId}: Legacy Solar API report — ${reportData.total_footprint_sqft} sqft, pitch ${reportData.roof_pitch_degrees}°`)
        } catch (e: any) {
          const is404 = e.message.includes('404') || e.message.includes('NOT_FOUND')
          let gptEst = null
          if (is404 && order.latitude && order.longitude) gptEst = await generateGPTRoofEstimate(order.property_address || '', order.latitude, order.longitude, env)
          reportData = generateMockRoofReport(order, mapsApiKey, gptEst)
          reportData.metadata.provider = is404 ? (gptEst ? 'gpt-vision-estimate' : 'estimated (no coverage)') : 'estimated (error)'
        }
      } else {
        reportData = generateMockRoofReport(order, mapsApiKey)
      }

      reportData.quality.notes = reportData.quality.notes || []
      reportData.quality.notes.unshift('⚠️ NO ROOF TRACE DATA — measurements are Solar API estimates only. For accurate measurements, re-order with roof outline tracing.')
      reportData.quality.confidence_score = Math.min(reportData.quality.confidence_score, 75)
    }

    // ── DUAL-PATH AI ANALYSIS: Cloud Run Custom Model + Gemini Fallback ──
    const satUrl = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url
    let cloudRunVision: VisionFindings | null = null
    let cloudRunGeometry: any = null

    const crConfig = buildCloudRunConfig(env)
    if (crConfig && satUrl) {
      try {
        const crResult = await analyzeViaCloudRun(crConfig, {
          image_urls: [satUrl], analysis_type: 'full',
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

    if (!cloudRunGeometry && satUrl && (env.GCP_SERVICE_ACCOUNT_KEY || env.GOOGLE_VERTEX_API_KEY)) {
      try {
        const geo = await analyzeRoofGeometry(satUrl, { apiKey: env.GOOGLE_VERTEX_API_KEY, project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: env.GCP_SERVICE_ACCOUNT_KEY }, { maxRetries: 1, timeoutMs: 20000, acceptScore: 10, model: 'gemini-2.0-flash' })
        if (geo?.facets?.length) reportData.ai_geometry = geo
      } catch {}
    }

    let geminiVision: VisionFindings | null = null
    if (satUrl && (env.GCP_SERVICE_ACCOUNT_KEY || env.GOOGLE_VERTEX_API_KEY)) {
      try {
        geminiVision = await visionScan(satUrl, { apiKey: env.GOOGLE_VERTEX_API_KEY, project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION || 'us-central1', serviceAccountKey: env.GCP_SERVICE_ACCOUNT_KEY }, { model: 'gemini-2.0-flash', timeoutMs: 20000, sourceType: 'satellite_overhead' })
      } catch {}
    }

    const mergedVision = mergeVisionFindings(cloudRunVision, geminiVision)
    if (mergedVision) {
      reportData.vision_findings = mergedVision
      if (mergedVision.heat_score.total >= 60) { reportData.quality.confidence_score = Math.min(reportData.quality.confidence_score, 70); reportData.quality.field_verification_recommended = true }
    }

    // ── CUSTOMER PRICING ──
    if (order.price_per_bundle && order.price_per_bundle > 0) {
      const trueArea = reportData.total_true_area_sqft || 0
      const wasteMultiplier = 1.15
      const grossSquares = Math.ceil((trueArea * wasteMultiplier) / 100 * 10) / 10
      reportData.customer_price_per_bundle = parseFloat(order.price_per_bundle)
      reportData.customer_gross_squares = grossSquares
      reportData.customer_total_cost_estimate = Math.round(grossSquares * parseFloat(order.price_per_bundle) * 100) / 100
      console.log(`[Generate] Order ${orderId}: Customer pricing — $${order.price_per_bundle}/sq × ${grossSquares} squares = $${reportData.customer_total_cost_estimate} CAD`)
    }

    console.log(`[Generate] Order ${orderId}: generating HTML report...`)
    let html: string
    const finalReportData = reportData

    try {
      html = generateProfessionalReportHTML(finalReportData)
      console.log(`[Generate] Order ${orderId}: HTML generated (${html.length} chars)`)
    } catch (htmlErr: any) {
      console.error(`[Generate] Order ${orderId}: HTML generation FAILED:`, htmlErr.message)
      html = `<html><body><h1>Report Generated</h1><p>HTML rendering failed: ${htmlErr.message}</p><pre>${JSON.stringify(finalReportData.property, null, 2)}</pre></body></html>`
    }

    const baseVersion = '5.0'
    const hasEnhanceKey = !!env.GEMINI_ENHANCE_API_KEY

    await repo.saveCompletedReport(env.DB, orderId, finalReportData, html, baseVersion)
    await repo.markOrderStatus(env.DB, orderId, 'completed')
    console.log(`[Generate] Order ${orderId}: ✅ Report saved as COMPLETED (v${baseVersion}, provider=${finalReportData.metadata?.provider || 'unknown'})`)

    return {
      success: true,
      report: finalReportData,
      version: baseVersion,
      provider: finalReportData.metadata?.provider || 'unknown',
      hasEnhanceKey
    }
  } catch (err: any) {
    try { await repo.markReportFailed(env.DB, orderId, err.message); await repo.markOrderStatus(env.DB, orderId, 'failed') } catch {}
    return { success: false, error: err.message }
  }
}
