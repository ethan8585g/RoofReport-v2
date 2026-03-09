// ============================================================
// RoofReporterAI — Reports Repository (D1 Database Layer)
// Typed query functions replacing raw SQL in route handlers.
// ============================================================

import type { RoofReport, MaterialEstimate } from '../types'

/** Minimal row types for SELECT results */
export type ReportRow = {
  id: number
  order_id: number
  status: string | null
  generation_attempts: number
  generation_started_at: string | null
  api_response_raw: string | null
  professional_report_html: string | null
  satellite_image_url: string | null
  vision_findings_json: string | null
  roof_footprint_sqft: number | null
  roof_pitch_degrees: number | null
  ai_status: string | null
  error_message: string | null
  [key: string]: unknown
}

export type OrderRow = {
  id: number
  order_number: string
  property_address: string
  property_city: string
  property_province: string
  property_postal_code: string
  homeowner_name: string | null
  homeowner_email: string | null
  requester_name: string | null
  requester_email: string | null
  requester_company: string | null
  service_tier: string
  price: number
  latitude: number | null
  longitude: number | null
  status: string
  [key: string]: unknown
}

// ── READ ──

export async function getReportByOrderId(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT * FROM reports WHERE order_id = ?'
  ).bind(orderId).first<ReportRow>()
}

export async function getReportRawData(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT api_response_raw FROM reports WHERE order_id = ?'
  ).bind(orderId).first<{ api_response_raw: string | null }>()
}

export async function getReportHtml(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT r.professional_report_html, r.api_response_raw
    FROM reports r JOIN orders o ON r.order_id = o.id
    WHERE r.order_id = ? OR o.order_number = ?
  `).bind(orderId, orderId).first<{ professional_report_html: string | null; api_response_raw: string | null }>()
}

export async function getReportWithOrder(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT r.*, o.order_number, o.property_address, o.property_city,
           o.property_province, o.property_postal_code,
           o.homeowner_name, o.requester_name, o.requester_company,
           o.service_tier, o.price, o.latitude, o.longitude
    FROM reports r JOIN orders o ON r.order_id = o.id
    WHERE r.order_id = ? OR o.order_number = ?
  `).bind(orderId, orderId).first()
}

export async function getReportForEnhance(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT id, status, api_response_raw, professional_report_html, roof_footprint_sqft, roof_pitch_degrees FROM reports WHERE order_id = ?'
  ).bind(orderId).first<ReportRow>()
}

export async function getReportForVision(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT id, order_id, api_response_raw, satellite_image_url, vision_findings_json, status FROM reports WHERE order_id = ?'
  ).bind(orderId).first<ReportRow>()
}

export async function getReportStatus(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT id, status, generation_attempts, generation_started_at FROM reports WHERE order_id = ?'
  ).bind(orderId).first<ReportRow>()
}

export async function getVisionFindings(db: D1Database, orderId: number | string) {
  return db.prepare(
    'SELECT vision_findings_json FROM reports WHERE order_id = ?'
  ).bind(orderId).first<{ vision_findings_json: string | null }>()
}

export async function getReportForPdf(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT r.professional_report_html, r.api_response_raw,
           o.property_address, o.property_city, o.property_province
    FROM reports r JOIN orders o ON r.order_id = o.id
    WHERE r.order_id = ? OR o.order_number = ?
  `).bind(orderId, orderId).first<any>()
}

export async function getOrderById(db: D1Database, orderId: number | string) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>()
}

export async function getOrderWithReport(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT o.*, r.professional_report_html, r.api_response_raw, r.roof_area_sqft
    FROM orders o LEFT JOIN reports r ON r.order_id = o.id
    WHERE o.id = ? OR o.order_number = ?
  `).bind(orderId, orderId).first<any>()
}

export async function getReportExistence(db: D1Database, orderId: number | string) {
  return db.prepare('SELECT id FROM reports WHERE order_id = ?').bind(orderId).first<{ id: number }>()
}

// ── WRITE ──

export async function upsertGeneratingState(db: D1Database, orderId: number | string, attemptNum: number, exists: boolean) {
  if (exists) {
    return db.prepare(`
      UPDATE reports SET status = 'generating', generation_attempts = ?,
        generation_started_at = datetime('now'), error_message = NULL, updated_at = datetime('now')
      WHERE order_id = ?
    `).bind(attemptNum, orderId).run()
  }
  return db.prepare(`
    INSERT OR REPLACE INTO reports (order_id, status, generation_attempts, generation_started_at)
    VALUES (?, 'generating', ?, datetime('now'))
  `).bind(orderId, attemptNum).run()
}

export async function saveCompletedReport(
  db: D1Database, orderId: number | string,
  reportData: RoofReport, html: string, version: string
) {
  const es = reportData.edge_summary
  const m = reportData.materials
  const satUrl = reportData.imagery?.satellite_overhead_url || reportData.imagery?.satellite_url || null

  await db.prepare(`
    UPDATE reports SET
      roof_area_sqft = ?, roof_area_sqm = ?,
      roof_footprint_sqft = ?, roof_footprint_sqm = ?,
      area_multiplier = ?,
      roof_pitch_degrees = ?, roof_pitch_ratio = ?,
      roof_azimuth_degrees = ?,
      max_sunshine_hours = ?, num_panels_possible = ?,
      yearly_energy_kwh = ?, roof_segments = ?,
      edge_measurements = ?,
      total_ridge_ft = ?, total_hip_ft = ?, total_valley_ft = ?,
      total_eave_ft = ?, total_rake_ft = ?,
      material_estimate = ?,
      gross_squares = ?, bundle_count = ?,
      total_material_cost_cad = ?, complexity_class = ?,
      imagery_quality = ?, imagery_date = ?,
      confidence_score = ?, field_verification_recommended = ?,
      professional_report_html = ?,
      report_version = ?,
      api_response_raw = ?,
      satellite_image_url = ?,
      vision_findings_json = ?,
      status = 'completed', generation_completed_at = datetime('now'), updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(
    reportData.total_true_area_sqft, reportData.total_true_area_sqm,
    reportData.total_footprint_sqft, reportData.total_footprint_sqm,
    reportData.area_multiplier,
    reportData.roof_pitch_degrees, reportData.roof_pitch_ratio,
    reportData.roof_azimuth_degrees,
    reportData.max_sunshine_hours, reportData.num_panels_possible,
    reportData.yearly_energy_kwh, JSON.stringify(reportData.segments),
    JSON.stringify(reportData.edges),
    es.total_ridge_ft, es.total_hip_ft, es.total_valley_ft,
    es.total_eave_ft, es.total_rake_ft,
    JSON.stringify(m),
    m.gross_squares, m.bundle_count,
    m.total_material_cost_cad, m.complexity_class,
    reportData.quality.imagery_quality || null, reportData.quality.imagery_date || null,
    reportData.quality.confidence_score, reportData.quality.field_verification_recommended ? 1 : 0,
    html, version, JSON.stringify(reportData),
    satUrl,
    reportData.vision_findings ? JSON.stringify(reportData.vision_findings) : null,
    orderId
  ).run()
}

export async function markReportFailed(db: D1Database, orderId: number | string, errorMsg: string) {
  await db.prepare(`
    UPDATE reports SET status = 'failed', error_message = ?,
      generation_completed_at = datetime('now'), updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(errorMsg.substring(0, 1000), orderId).run()
}

export async function markOrderStatus(db: D1Database, orderId: number | string, status: string) {
  const extra = status === 'completed' ? ", delivered_at = datetime('now')" : ''
  await db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now')${extra} WHERE id = ?`)
    .bind(status, orderId).run()
}

export async function resetReportForRetry(db: D1Database, orderId: number | string) {
  await db.prepare(`
    UPDATE reports SET status = NULL, generation_attempts = 0, error_message = NULL, updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderId).run()
  await db.prepare(`UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?`).bind(orderId).run()
}

export async function updateVisionFindings(db: D1Database, orderId: number | string, json: string) {
  await db.prepare(`UPDATE reports SET vision_findings_json = ?, updated_at = datetime('now') WHERE order_id = ?`)
    .bind(json, orderId).run()
}

export async function updateReportHtml(db: D1Database, orderId: number | string, html: string, rawJson?: string) {
  if (rawJson) {
    await db.prepare(`UPDATE reports SET professional_report_html = ?, api_response_raw = ? WHERE order_id = ?`)
      .bind(html, rawJson, parseInt(String(orderId))).run()
  } else {
    await db.prepare(`UPDATE reports SET professional_report_html = ? WHERE order_id = ?`)
      .bind(html, parseInt(String(orderId))).run()
  }
}

export async function updateAiStatus(db: D1Database, orderId: number | string, status: string) {
  await db.prepare(`UPDATE reports SET ai_status = ?, updated_at = datetime('now') WHERE order_id = ?`)
    .bind(status, orderId).run()
}

export async function logApiRequest(
  db: D1Database, orderId: number | string,
  type: string, endpoint: string, status: number, durationMs: number, payload?: string
) {
  await db.prepare(`
    INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, response_payload, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(orderId, type, endpoint, status, payload || null, durationMs).run()
}

export async function getSettingValue(db: D1Database, key: string, companyId: number = 1) {
  const row = await db.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = ? AND master_company_id = ?"
  ).bind(key, companyId).first<{ setting_value: string }>()
  return row?.setting_value || null
}

// ============================================================
// REPORT ENHANCEMENT WEBHOOK PIPELINE
// ============================================================

/** Mark report as sent to Cloud Run for enhancement */
export async function markEnhancementSent(db: D1Database, orderId: number | string) {
  await db.prepare(`
    UPDATE reports SET
      enhancement_status = 'sent',
      enhancement_sent_at = datetime('now'),
      enhancement_error = NULL,
      updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderId).run()
}

/** Mark enhancement as actively processing (Cloud Run acknowledged) */
export async function markEnhancementProcessing(db: D1Database, orderId: number | string) {
  await db.prepare(`
    UPDATE reports SET enhancement_status = 'enhancing', updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderId).run()
}

/** Save the enhanced report from Cloud Run webhook callback */
export async function saveEnhancedReport(
  db: D1Database, orderId: number | string,
  enhancedHtml: string, enhancedRawJson: string,
  version: string, processingTimeMs: number
) {
  // Save enhanced report and ALSO overwrite the primary report HTML
  // so the user sees the enhanced version immediately
  await db.prepare(`
    UPDATE reports SET
      enhanced_report_html = ?,
      enhanced_api_response_raw = ?,
      enhancement_version = ?,
      enhancement_processing_time_ms = ?,
      enhancement_status = 'enhanced',
      enhancement_completed_at = datetime('now'),
      professional_report_html = ?,
      api_response_raw = ?,
      report_version = ?,
      updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(
    enhancedHtml, enhancedRawJson, version, processingTimeMs,
    enhancedHtml, enhancedRawJson, 'enhanced-' + version,
    orderId
  ).run()
}

/** Mark enhancement as failed (original report remains valid) */
export async function markEnhancementFailed(db: D1Database, orderId: number | string, error: string) {
  await db.prepare(`
    UPDATE reports SET
      enhancement_status = 'enhancement_failed',
      enhancement_error = ?,
      enhancement_completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(error.substring(0, 1000), orderId).run()
}

/** Get report data needed for the enhancement payload */
export async function getReportForEnhancement(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT r.order_id, r.api_response_raw, r.professional_report_html,
           r.satellite_image_url, r.enhancement_status, r.status,
           o.latitude, o.longitude, o.property_address,
           o.property_city, o.property_province, o.property_postal_code,
           o.roof_trace_json, o.price_per_bundle,
           o.homeowner_name, o.requester_name, o.requester_company
    FROM reports r
    JOIN orders o ON r.order_id = o.id
    WHERE r.order_id = ?
  `).bind(orderId).first()
}

/** Get enhancement status for a report */
export async function getEnhancementStatus(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT enhancement_status, enhancement_sent_at, enhancement_completed_at,
           enhancement_error, enhancement_processing_time_ms, enhancement_version
    FROM reports WHERE order_id = ?
  `).bind(orderId).first()
}

// ============================================================
// AI-GENERATED IMAGERY PIPELINE
// ============================================================

/** Mark AI imagery generation as started */
export async function markAIImageryGenerating(db: D1Database, orderId: number | string) {
  await db.prepare(`
    UPDATE reports SET ai_imagery_status = 'generating', ai_imagery_error = NULL, updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderId).run()
}

/** Save AI-generated imagery JSON and update report HTML */
export async function saveAIImagery(
  db: D1Database, orderId: number | string,
  imageryJson: string, updatedHtml: string
) {
  await db.prepare(`
    UPDATE reports SET
      ai_generated_imagery_json = ?,
      ai_imagery_status = 'completed',
      professional_report_html = ?,
      updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(imageryJson, updatedHtml, orderId).run()
}

/** Mark AI imagery generation as failed */
export async function markAIImageryFailed(db: D1Database, orderId: number | string, error: string) {
  await db.prepare(`
    UPDATE reports SET
      ai_imagery_status = 'failed',
      ai_imagery_error = ?,
      updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(error.substring(0, 1000), orderId).run()
}

/** Get AI imagery status for a report */
export async function getAIImageryStatus(db: D1Database, orderId: number | string) {
  return db.prepare(`
    SELECT ai_imagery_status, ai_imagery_error, ai_generated_imagery_json
    FROM reports WHERE order_id = ?
  `).bind(orderId).first<{ ai_imagery_status: string | null; ai_imagery_error: string | null; ai_generated_imagery_json: string | null }>()
}
