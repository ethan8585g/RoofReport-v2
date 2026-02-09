import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  trueAreaFromFootprint, pitchToRatio, degreesToCardinal,
  hipValleyFactor, rakeFactor, computeMaterialEstimate,
  classifyComplexity
} from '../types'
import type {
  RoofReport, RoofSegment, EdgeMeasurement, EdgeType, MaterialEstimate
} from '../types'

export const reportsRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// GET report for an order
// ============================================================
reportsRoutes.get('/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const report = await c.env.DB.prepare(`
      SELECT r.*, o.order_number, o.property_address, o.property_city,
             o.property_province, o.property_postal_code,
             o.homeowner_name, o.requester_name, o.requester_company,
             o.service_tier, o.price, o.latitude, o.longitude
      FROM reports r
      JOIN orders o ON r.order_id = o.id
      WHERE r.order_id = ? OR o.order_number = ?
    `).bind(orderId, orderId).first()

    if (!report) return c.json({ error: 'Report not found' }, 404)

    return c.json({ report })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch report', details: err.message }, 500)
  }
})

// ============================================================
// GET professional report HTML (for PDF generation or iframe)
// ============================================================
reportsRoutes.get('/:orderId/html', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const report = await c.env.DB.prepare(`
      SELECT r.professional_report_html, r.api_response_raw
      FROM reports r
      JOIN orders o ON r.order_id = o.id
      WHERE r.order_id = ? OR o.order_number = ?
    `).bind(orderId, orderId).first<any>()

    if (!report) return c.json({ error: 'Report not found' }, 404)

    if (report.professional_report_html) {
      return c.html(report.professional_report_html)
    }

    // Generate from raw data if HTML not yet saved
    if (report.api_response_raw) {
      const data = JSON.parse(report.api_response_raw) as RoofReport
      const html = generateProfessionalReportHTML(data)
      return c.html(html)
    }

    return c.json({ error: 'Report data not available' }, 404)
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch report HTML', details: err.message }, 500)
  }
})

// ============================================================
// GENERATE report — Full pipeline:
// 1. Call Google Solar API (or mock)
// 2. Parse segments with 3D area math
// 3. Generate edge measurements with hip/valley 3D lengths
// 4. Compute material estimate (BOM)
// 5. Generate professional HTML report
// 6. Save everything to DB
// ============================================================
reportsRoutes.post('/:orderId/generate', async (c) => {
  try {
    const orderId = c.req.param('orderId')

    const order = await c.env.DB.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).bind(orderId).first<any>()
    if (!order) return c.json({ error: 'Order not found' }, 404)

    // Check existing
    const existing = await c.env.DB.prepare(
      'SELECT id, status FROM reports WHERE order_id = ?'
    ).bind(orderId).first<any>()

    let reportData: RoofReport
    let apiDuration = 0
    const startTime = Date.now()

    // Try real Google Solar API
    const solarApiKey = c.env.GOOGLE_SOLAR_API_KEY
    if (solarApiKey && order.latitude && order.longitude) {
      try {
        reportData = await callGoogleSolarAPI(
          order.latitude,
          order.longitude,
          solarApiKey,
          parseInt(orderId),
          order
        )
        apiDuration = Date.now() - startTime
        reportData.metadata.api_duration_ms = apiDuration

        await c.env.DB.prepare(`
          INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, duration_ms)
          VALUES (?, 'google_solar_api', 'buildingInsights:findClosest', 200, ?)
        `).bind(orderId, apiDuration).run()

      } catch (apiErr: any) {
        apiDuration = Date.now() - startTime
        await c.env.DB.prepare(`
          INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, response_payload, duration_ms)
          VALUES (?, 'google_solar_api', 'buildingInsights:findClosest', 500, ?, ?)
        `).bind(orderId, apiErr.message, apiDuration).run()

        reportData = generateMockRoofReport(order)
        reportData.metadata.provider = `mock (Solar API failed: ${apiErr.message})`
      }
    } else {
      reportData = generateMockRoofReport(order)
    }

    // Generate professional HTML report
    const professionalHtml = generateProfessionalReportHTML(reportData)

    // Save to database
    const edgeSummary = reportData.edge_summary
    const materials = reportData.materials

    if (existing) {
      await c.env.DB.prepare(`
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
          report_version = '2.0',
          api_response_raw = ?,
          status = 'completed', updated_at = datetime('now')
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
        edgeSummary.total_ridge_ft, edgeSummary.total_hip_ft, edgeSummary.total_valley_ft,
        edgeSummary.total_eave_ft, edgeSummary.total_rake_ft,
        JSON.stringify(materials),
        materials.gross_squares, materials.bundle_count,
        materials.total_material_cost_cad, materials.complexity_class,
        reportData.quality.imagery_quality || null, reportData.quality.imagery_date || null,
        reportData.quality.confidence_score, reportData.quality.field_verification_recommended ? 1 : 0,
        professionalHtml,
        JSON.stringify(reportData),
        orderId
      ).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO reports (
          order_id, roof_area_sqft, roof_area_sqm,
          roof_footprint_sqft, roof_footprint_sqm, area_multiplier,
          roof_pitch_degrees, roof_pitch_ratio, roof_azimuth_degrees,
          max_sunshine_hours, num_panels_possible, yearly_energy_kwh,
          roof_segments, edge_measurements,
          total_ridge_ft, total_hip_ft, total_valley_ft,
          total_eave_ft, total_rake_ft,
          material_estimate, gross_squares, bundle_count,
          total_material_cost_cad, complexity_class,
          imagery_quality, imagery_date,
          confidence_score, field_verification_recommended,
          professional_report_html, report_version,
          api_response_raw, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2.0', ?, 'completed')
      `).bind(
        orderId,
        reportData.total_true_area_sqft, reportData.total_true_area_sqm,
        reportData.total_footprint_sqft, reportData.total_footprint_sqm,
        reportData.area_multiplier,
        reportData.roof_pitch_degrees, reportData.roof_pitch_ratio,
        reportData.roof_azimuth_degrees,
        reportData.max_sunshine_hours, reportData.num_panels_possible,
        reportData.yearly_energy_kwh, JSON.stringify(reportData.segments),
        JSON.stringify(reportData.edges),
        edgeSummary.total_ridge_ft, edgeSummary.total_hip_ft, edgeSummary.total_valley_ft,
        edgeSummary.total_eave_ft, edgeSummary.total_rake_ft,
        JSON.stringify(materials),
        materials.gross_squares, materials.bundle_count,
        materials.total_material_cost_cad, materials.complexity_class,
        reportData.quality.imagery_quality || null, reportData.quality.imagery_date || null,
        reportData.quality.confidence_score, reportData.quality.field_verification_recommended ? 1 : 0,
        professionalHtml,
        JSON.stringify(reportData)
      ).run()
    }

    // Update order status
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'completed', delivered_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(orderId).run()

    return c.json({
      success: true,
      message: 'Report generated successfully (v2.0)',
      report: reportData
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to generate report', details: err.message }, 500)
  }
})

// ============================================================
// REAL Google Solar API Call — buildingInsights:findClosest
// ============================================================
async function callGoogleSolarAPI(
  lat: number, lng: number, apiKey: string,
  orderId: number, order: any
): Promise<RoofReport> {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${apiKey}`

  const response = await fetch(url)
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Google Solar API error ${response.status}: ${errText}`)
  }

  const data: any = await response.json()
  const solarPotential = data.solarPotential

  if (!solarPotential) {
    throw new Error('No solar potential data returned for this location')
  }

  // Parse roof segments from Google's roofSegmentStats
  const rawSegments = solarPotential.roofSegmentStats || []
  const segments: RoofSegment[] = rawSegments.map((seg: any, i: number) => {
    const pitchDeg = seg.pitchDegrees || 0
    const azimuthDeg = seg.azimuthDegrees || 0
    const footprintSqm = seg.stats?.areaMeters2 || 0
    const footprintSqft = footprintSqm * 10.7639
    const trueAreaSqft = trueAreaFromFootprint(footprintSqft, pitchDeg)
    const trueAreaSqm = trueAreaFromFootprint(footprintSqm, pitchDeg)

    return {
      name: `Segment ${i + 1}`,
      footprint_area_sqft: Math.round(footprintSqft),
      true_area_sqft: Math.round(trueAreaSqft),
      true_area_sqm: Math.round(trueAreaSqm * 10) / 10,
      pitch_degrees: Math.round(pitchDeg * 10) / 10,
      pitch_ratio: pitchToRatio(pitchDeg),
      azimuth_degrees: Math.round(azimuthDeg * 10) / 10,
      azimuth_direction: degreesToCardinal(azimuthDeg),
      plane_height_meters: seg.planeHeightAtCenterMeters || undefined
    }
  })

  // Area totals
  const totalFootprintSqft = segments.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
  const totalTrueAreaSqft = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalTrueAreaSqm = segments.reduce((s, seg) => s + seg.true_area_sqm, 0)
  const totalFootprintSqm = Math.round(totalFootprintSqft * 0.0929)

  // Weighted pitch
  const weightedPitch = totalTrueAreaSqft > 0
    ? segments.reduce((s, seg) => s + seg.pitch_degrees * seg.true_area_sqft, 0) / totalTrueAreaSqft
    : 0

  // Dominant azimuth (largest segment)
  const largestSegment = segments.length > 0
    ? segments.reduce((max, s) => s.true_area_sqft > max.true_area_sqft ? s : max, segments[0])
    : null

  // Solar data
  const maxPanels = solarPotential.maxArrayPanelsCount || 0
  const maxSunshine = solarPotential.maxSunshineHoursPerYear || 0
  const yearlyEnergy = solarPotential.solarPanelConfigs?.[0]?.yearlyEnergyDcKwh || (maxPanels * 400)

  // Imagery quality
  const imageryQuality = data.imageryQuality || 'BASE'
  const imageryDate = data.imageryDate
    ? `${data.imageryDate.year}-${String(data.imageryDate.month).padStart(2, '0')}-${String(data.imageryDate.day).padStart(2, '0')}`
    : undefined

  // Generate edges from segment data
  const edges = generateEdgesFromSegments(segments, totalFootprintSqft)
  const edgeSummary = computeEdgeSummary(edges)

  // Material estimate
  const materials = computeMaterialEstimate(totalTrueAreaSqft, edges, segments)

  // Quality assessment
  const qualityNotes: string[] = []
  if (imageryQuality !== 'HIGH') {
    qualityNotes.push(`Imagery quality is ${imageryQuality}. HIGH quality (0.1m/px) recommended for exact material orders.`)
  }
  if (segments.length < 2) {
    qualityNotes.push('Low segment count may indicate incomplete building model.')
  }

  return {
    order_id: orderId,
    generated_at: new Date().toISOString(),
    report_version: '2.0',
    property: {
      address: order.property_address,
      city: order.property_city,
      province: order.property_province,
      postal_code: order.property_postal_code,
      homeowner_name: order.homeowner_name,
      requester_name: order.requester_name,
      requester_company: order.requester_company,
      latitude: lat, longitude: lng
    },
    total_footprint_sqft: totalFootprintSqft,
    total_footprint_sqm: totalFootprintSqm,
    total_true_area_sqft: totalTrueAreaSqft,
    total_true_area_sqm: Math.round(totalTrueAreaSqm * 10) / 10,
    area_multiplier: Math.round((totalTrueAreaSqft / (totalFootprintSqft || 1)) * 1000) / 1000,
    roof_pitch_degrees: Math.round(weightedPitch * 10) / 10,
    roof_pitch_ratio: pitchToRatio(weightedPitch),
    roof_azimuth_degrees: largestSegment?.azimuth_degrees || 0,
    segments,
    edges,
    edge_summary: edgeSummary,
    materials,
    max_sunshine_hours: Math.round(maxSunshine * 10) / 10,
    num_panels_possible: maxPanels,
    yearly_energy_kwh: Math.round(yearlyEnergy),
    imagery: {
      satellite_url: `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite&key=${apiKey}`,
      dsm_url: null,
      mask_url: null,
      flux_url: null
    },
    quality: {
      imagery_quality: imageryQuality as any,
      imagery_date: imageryDate,
      field_verification_recommended: imageryQuality !== 'HIGH',
      confidence_score: imageryQuality === 'HIGH' ? 90 : imageryQuality === 'MEDIUM' ? 75 : 60,
      notes: qualityNotes
    },
    metadata: {
      provider: 'google_solar_api',
      api_duration_ms: 0,
      coordinates: { lat, lng },
      solar_api_imagery_date: imageryDate,
      building_insights_quality: imageryQuality
    }
  }
}

// ============================================================
// MOCK DATA GENERATOR — Full v2.0 report with edges + materials
// Generates realistic Alberta residential roof data
// ============================================================
function generateMockRoofReport(order: any): RoofReport {
  const lat = order.latitude
  const lng = order.longitude
  const orderId = order.id

  // Typical Alberta residential footprint: 1400-2800 sq ft
  const totalFootprintSqft = 1400 + Math.random() * 1400

  // Segment definitions — realistic Alberta residential
  const segmentDefs = [
    { name: 'Main South Face',  footprintPct: 0.35, pitchMin: 22, pitchMax: 32, azBase: 175 },
    { name: 'Main North Face',  footprintPct: 0.35, pitchMin: 22, pitchMax: 32, azBase: 355 },
    { name: 'East Wing',        footprintPct: 0.15, pitchMin: 18, pitchMax: 28, azBase: 85 },
    { name: 'West Wing',        footprintPct: 0.15, pitchMin: 18, pitchMax: 28, azBase: 265 },
  ]

  const segments: RoofSegment[] = segmentDefs.map(def => {
    const footprintSqft = totalFootprintSqft * def.footprintPct
    const pitchDeg = def.pitchMin + Math.random() * (def.pitchMax - def.pitchMin)
    const azimuthDeg = def.azBase + (Math.random() * 10 - 5)
    const trueAreaSqft = trueAreaFromFootprint(footprintSqft, pitchDeg)
    const trueAreaSqm = trueAreaSqft * 0.0929

    return {
      name: def.name,
      footprint_area_sqft: Math.round(footprintSqft),
      true_area_sqft: Math.round(trueAreaSqft),
      true_area_sqm: Math.round(trueAreaSqm * 10) / 10,
      pitch_degrees: Math.round(pitchDeg * 10) / 10,
      pitch_ratio: pitchToRatio(pitchDeg),
      azimuth_degrees: Math.round(azimuthDeg * 10) / 10,
      azimuth_direction: degreesToCardinal(azimuthDeg)
    }
  })

  const totalTrueAreaSqft = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalTrueAreaSqm = segments.reduce((s, seg) => s + seg.true_area_sqm, 0)
  const totalFootprintSqm = Math.round(totalFootprintSqft * 0.0929)

  const weightedPitch = segments.reduce((s, seg) => s + seg.pitch_degrees * seg.true_area_sqft, 0) / totalTrueAreaSqft
  const multiplier = totalTrueAreaSqft / totalFootprintSqft

  // Solar
  const usableSolarArea = totalTrueAreaSqft * 0.35
  const panelCount = Math.floor(usableSolarArea / 17.5)
  const edmontonSunHours = 1500 + Math.random() * 300

  // Generate edges
  const edges = generateEdgesFromSegments(segments, totalFootprintSqft)
  const edgeSummary = computeEdgeSummary(edges)

  // Materials
  const materials = computeMaterialEstimate(totalTrueAreaSqft, edges, segments)

  return {
    order_id: orderId || 0,
    generated_at: new Date().toISOString(),
    report_version: '2.0',
    property: {
      address: order.property_address || '',
      city: order.property_city,
      province: order.property_province,
      postal_code: order.property_postal_code,
      homeowner_name: order.homeowner_name,
      requester_name: order.requester_name,
      requester_company: order.requester_company,
      latitude: lat || null, longitude: lng || null
    },
    total_footprint_sqft: Math.round(totalFootprintSqft),
    total_footprint_sqm: totalFootprintSqm,
    total_true_area_sqft: Math.round(totalTrueAreaSqft),
    total_true_area_sqm: Math.round(totalTrueAreaSqm * 10) / 10,
    area_multiplier: Math.round(multiplier * 1000) / 1000,
    roof_pitch_degrees: Math.round(weightedPitch * 10) / 10,
    roof_pitch_ratio: pitchToRatio(weightedPitch),
    roof_azimuth_degrees: segments[0].azimuth_degrees,
    segments,
    edges,
    edge_summary: edgeSummary,
    materials,
    max_sunshine_hours: Math.round(edmontonSunHours * 10) / 10,
    num_panels_possible: panelCount,
    yearly_energy_kwh: Math.round(panelCount * 400),
    imagery: {
      satellite_url: lat && lng
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite`
        : null,
      dsm_url: null,
      mask_url: null,
      flux_url: null
    },
    quality: {
      imagery_quality: 'BASE',
      field_verification_recommended: true,
      confidence_score: 65,
      notes: [
        'Mock data — using simulated measurements for demonstration.',
        'Configure GOOGLE_SOLAR_API_KEY for real satellite-based measurements.',
        'Field verification recommended for material ordering.'
      ]
    },
    metadata: {
      provider: 'mock',
      api_duration_ms: Math.floor(Math.random() * 200) + 50,
      coordinates: { lat: lat || null, lng: lng || null }
    }
  }
}

// ============================================================
// EDGE GENERATION — Derive roof edges from segment data
// ============================================================
function generateEdgesFromSegments(
  segments: RoofSegment[],
  totalFootprintSqft: number
): EdgeMeasurement[] {
  const edges: EdgeMeasurement[] = []

  if (segments.length === 0) return edges

  // Estimate building dimensions from footprint
  // Assume roughly 1.5:1 length-to-width ratio
  const buildingWidthFt = Math.sqrt(totalFootprintSqft / 1.5)
  const buildingLengthFt = buildingWidthFt * 1.5

  // Average pitch for factor calculations
  const avgPitch = segments.reduce((s, seg) => s + seg.pitch_degrees, 0) / segments.length

  // ---- RIDGE LINES ----
  // Main ridge runs along the length of the building
  const mainRidgePlanFt = buildingLengthFt * 0.85 // ridge is slightly shorter than building
  edges.push({
    edge_type: 'ridge',
    label: 'Main Ridge Line',
    plan_length_ft: Math.round(mainRidgePlanFt),
    true_length_ft: Math.round(mainRidgePlanFt), // Ridges are horizontal
    adjacent_segments: [0, 1],
    pitch_factor: 1.0
  })

  // If 4+ segments, add a secondary ridge for the wing
  if (segments.length >= 4) {
    const wingRidgePlanFt = buildingWidthFt * 0.5
    edges.push({
      edge_type: 'ridge',
      label: 'Wing Ridge Line',
      plan_length_ft: Math.round(wingRidgePlanFt),
      true_length_ft: Math.round(wingRidgePlanFt),
      adjacent_segments: [2, 3],
      pitch_factor: 1.0
    })
  }

  // ---- HIP LINES ----
  // Hips run from ridge ends down to building corners at 45-degree plan angle
  if (segments.length >= 4) {
    const hipPlanFt = buildingWidthFt / 2 * Math.SQRT2 // diagonal from ridge end to corner
    const hipFactor = hipValleyFactor(avgPitch)
    const hipTrueFt = hipPlanFt * hipFactor

    const hipLabels = ['NE Hip', 'NW Hip', 'SE Hip', 'SW Hip']
    for (let i = 0; i < 4; i++) {
      edges.push({
        edge_type: 'hip',
        label: hipLabels[i] || `Hip ${i + 1}`,
        plan_length_ft: Math.round(hipPlanFt),
        true_length_ft: Math.round(hipTrueFt),
        pitch_factor: Math.round(hipFactor * 1000) / 1000
      })
    }
  }

  // ---- VALLEY LINES ----
  // If building has intersecting wings, valleys form where they meet
  if (segments.length >= 4) {
    const valleyPlanFt = buildingWidthFt * 0.35
    const valleyFactor = hipValleyFactor(avgPitch)
    const valleyTrueFt = valleyPlanFt * valleyFactor

    edges.push({
      edge_type: 'valley',
      label: 'East Valley',
      plan_length_ft: Math.round(valleyPlanFt),
      true_length_ft: Math.round(valleyTrueFt),
      pitch_factor: Math.round(valleyFactor * 1000) / 1000
    })
    edges.push({
      edge_type: 'valley',
      label: 'West Valley',
      plan_length_ft: Math.round(valleyPlanFt),
      true_length_ft: Math.round(valleyTrueFt),
      pitch_factor: Math.round(valleyFactor * 1000) / 1000
    })
  }

  // ---- EAVE LINES ----
  // Eaves run along the bottom perimeter of the roof
  const eavePerimeter = (buildingLengthFt + buildingWidthFt) * 2 * 0.9
  const eaveSections = segments.length >= 4
    ? [
        { label: 'South Eave', length: buildingLengthFt * 0.9 },
        { label: 'North Eave', length: buildingLengthFt * 0.9 },
        { label: 'East Eave', length: buildingWidthFt * 0.4 },
        { label: 'West Eave', length: buildingWidthFt * 0.4 }
      ]
    : [
        { label: 'South Eave', length: buildingLengthFt * 0.95 },
        { label: 'North Eave', length: buildingLengthFt * 0.95 }
      ]

  for (const eave of eaveSections) {
    edges.push({
      edge_type: 'eave',
      label: eave.label,
      plan_length_ft: Math.round(eave.length),
      true_length_ft: Math.round(eave.length), // Eaves are horizontal
      pitch_factor: 1.0
    })
  }

  // ---- RAKE EDGES ----
  // Rakes are the sloped edges at gable ends
  if (segments.length <= 3) {
    // Gable roof — has rakes at each end
    const rakeRiseFt = (buildingWidthFt / 2) * Math.tan(avgPitch * Math.PI / 180)
    const rakePlanFt = buildingWidthFt / 2
    const rakeRealFt = rakePlanFt * rakeFactor(avgPitch)

    for (const label of ['East Rake (Left)', 'East Rake (Right)', 'West Rake (Left)', 'West Rake (Right)']) {
      edges.push({
        edge_type: 'rake',
        label,
        plan_length_ft: Math.round(rakePlanFt),
        true_length_ft: Math.round(rakeRealFt),
        pitch_factor: Math.round(rakeFactor(avgPitch) * 1000) / 1000
      })
    }
  }

  return edges
}

// ============================================================
// Compute edge summary totals
// ============================================================
function computeEdgeSummary(edges: EdgeMeasurement[]) {
  return {
    total_ridge_ft: Math.round(edges.filter(e => e.edge_type === 'ridge').reduce((s, e) => s + e.true_length_ft, 0)),
    total_hip_ft: Math.round(edges.filter(e => e.edge_type === 'hip').reduce((s, e) => s + e.true_length_ft, 0)),
    total_valley_ft: Math.round(edges.filter(e => e.edge_type === 'valley').reduce((s, e) => s + e.true_length_ft, 0)),
    total_eave_ft: Math.round(edges.filter(e => e.edge_type === 'eave').reduce((s, e) => s + e.true_length_ft, 0)),
    total_rake_ft: Math.round(edges.filter(e => e.edge_type === 'rake').reduce((s, e) => s + e.true_length_ft, 0)),
    total_linear_ft: Math.round(edges.reduce((s, e) => s + e.true_length_ft, 0))
  }
}

// ============================================================
// PROFESSIONAL REPORT HTML GENERATOR
// 6-section branded report, high-DPI ready, PDF-convertible
// ============================================================
function generateProfessionalReportHTML(report: RoofReport): string {
  const now = new Date().toISOString()
  const prop = report.property
  const mat = report.materials
  const es = report.edge_summary
  const quality = report.quality

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roof Measurement Report - ${prop.address}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a2e; background: #fff; font-size: 11pt; line-height: 1.5; }
    .page { max-width: 8.5in; margin: 0 auto; padding: 0.5in 0.6in; }
    @media print {
      .page { padding: 0.3in 0.5in; }
      .page-break { page-break-before: always; }
    }

    /* Header */
    .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 16px; margin-bottom: 24px; }
    .report-header .logo { font-size: 18pt; font-weight: 800; color: #059669; }
    .report-header .logo small { display: block; font-size: 9pt; font-weight: 400; color: #666; }
    .report-header .meta { text-align: right; font-size: 9pt; color: #555; }
    .report-header .meta .order-num { font-size: 11pt; font-weight: 700; color: #1a1a2e; }

    /* Section headers */
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13pt; font-weight: 700; color: #059669; border-bottom: 1px solid #d1fae5; padding-bottom: 4px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
    .section-num { background: #059669; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10pt; font-weight: 700; }

    /* Data grid */
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .data-grid.three { grid-template-columns: 1fr 1fr 1fr; }
    .data-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
    .data-item .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 2px; }
    .data-item .value { font-size: 14pt; font-weight: 700; color: #1e293b; }
    .data-item .unit { font-size: 9pt; color: #64748b; margin-left: 4px; }
    .data-item.highlight { background: #ecfdf5; border-color: #a7f3d0; }
    .data-item.highlight .value { color: #059669; }
    .data-item.warn { background: #fffbeb; border-color: #fde68a; }
    .data-item.warn .value { color: #d97706; }

    /* Tables */
    .report-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 8px; }
    .report-table th { background: #f1f5f9; text-align: left; padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    .report-table td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; }
    .report-table tr:nth-child(even) td { background: #fafbfc; }
    .report-table .total-row td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }
    .report-table .right { text-align: right; }

    /* Footer */
    .report-footer { border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 24px; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; }

    /* Quality badge */
    .quality-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; }
    .quality-high { background: #d1fae5; color: #065f46; }
    .quality-medium { background: #fef3c7; color: #92400e; }
    .quality-low { background: #fee2e2; color: #991b1b; }

    /* Disclaimer */
    .disclaimer { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 8pt; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="page">
    <!-- HEADER -->
    <div class="report-header">
      <div class="logo">
        REUSE CANADA
        <small>Professional Roof Measurement Report</small>
      </div>
      <div class="meta">
        <div class="order-num">Report #${report.order_id}</div>
        <div>Generated: ${new Date(report.generated_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div>Version ${report.report_version || '2.0'}</div>
        <div>
          <span class="quality-badge ${quality.imagery_quality === 'HIGH' ? 'quality-high' : quality.imagery_quality === 'MEDIUM' ? 'quality-medium' : 'quality-low'}">
            ${quality.imagery_quality || 'BASE'} Quality
          </span>
          Confidence: ${quality.confidence_score}%
        </div>
      </div>
    </div>

    <!-- SECTION 1: PROPERTY CONTEXT -->
    <div class="section">
      <div class="section-title"><span class="section-num">1</span>Property Context</div>
      <div class="data-grid">
        <div class="data-item">
          <div class="label">Property Address</div>
          <div class="value" style="font-size:11pt">${prop.address}</div>
          <div style="font-size:9pt;color:#64748b">${[prop.city, prop.province, prop.postal_code].filter(Boolean).join(', ')}</div>
        </div>
        <div class="data-item">
          <div class="label">Coordinates</div>
          <div class="value" style="font-size:11pt">${prop.latitude?.toFixed(6) || 'N/A'}, ${prop.longitude?.toFixed(6) || 'N/A'}</div>
          <div style="font-size:9pt;color:#64748b">Data Source: ${report.metadata.provider === 'mock' ? 'Simulated' : 'Google Solar API'}</div>
        </div>
        <div class="data-item">
          <div class="label">Homeowner</div>
          <div class="value" style="font-size:11pt">${prop.homeowner_name || 'N/A'}</div>
        </div>
        <div class="data-item">
          <div class="label">Requested By</div>
          <div class="value" style="font-size:11pt">${prop.requester_name || 'N/A'}</div>
          <div style="font-size:9pt;color:#64748b">${prop.requester_company || ''}</div>
        </div>
      </div>
    </div>

    <!-- SECTION 2: MEASUREMENT SUMMARY -->
    <div class="section">
      <div class="section-title"><span class="section-num">2</span>Measurement Summary</div>
      <div class="data-grid three">
        <div class="data-item">
          <div class="label">Flat Footprint</div>
          <div class="value">${report.total_footprint_sqft.toLocaleString()}<span class="unit">sq ft</span></div>
          <div style="font-size:8pt;color:#94a3b8">${report.total_footprint_sqm} m&sup2; (from above)</div>
        </div>
        <div class="data-item warn">
          <div class="label">Pitch Multiplier</div>
          <div class="value">${report.area_multiplier.toFixed(3)}x</div>
          <div style="font-size:8pt;color:#94a3b8">Roof is ${Math.round((report.area_multiplier - 1) * 100)}% larger than footprint</div>
        </div>
        <div class="data-item highlight">
          <div class="label">True Surface Area</div>
          <div class="value">${report.total_true_area_sqft.toLocaleString()}<span class="unit">sq ft</span></div>
          <div style="font-size:8pt;color:#94a3b8">${report.total_true_area_sqm} m&sup2; (actual shingleable)</div>
        </div>
      </div>
      <div class="data-grid three" style="margin-top:8px">
        <div class="data-item">
          <div class="label">Dominant Pitch</div>
          <div class="value">${report.roof_pitch_degrees}&deg;<span class="unit">(${report.roof_pitch_ratio})</span></div>
        </div>
        <div class="data-item">
          <div class="label">Primary Orientation</div>
          <div class="value">${report.roof_azimuth_degrees}&deg;<span class="unit">${report.segments[0]?.azimuth_direction || ''}</span></div>
        </div>
        <div class="data-item">
          <div class="label">Roof Segments</div>
          <div class="value">${report.segments.length}<span class="unit">faces</span></div>
        </div>
      </div>
    </div>

    <!-- SECTION 3: EDGE BREAKDOWN -->
    <div class="section">
      <div class="section-title"><span class="section-num">3</span>Edge Breakdown</div>
      <div class="data-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:10px">
        <div class="data-item"><div class="label">Ridge</div><div class="value" style="font-size:12pt">${es.total_ridge_ft}<span class="unit">ft</span></div></div>
        <div class="data-item"><div class="label">Hip</div><div class="value" style="font-size:12pt">${es.total_hip_ft}<span class="unit">ft</span></div></div>
        <div class="data-item"><div class="label">Valley</div><div class="value" style="font-size:12pt">${es.total_valley_ft}<span class="unit">ft</span></div></div>
        <div class="data-item"><div class="label">Eave</div><div class="value" style="font-size:12pt">${es.total_eave_ft}<span class="unit">ft</span></div></div>
        <div class="data-item"><div class="label">Rake</div><div class="value" style="font-size:12pt">${es.total_rake_ft}<span class="unit">ft</span></div></div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Edge</th>
            <th>Type</th>
            <th class="right">Plan Length (ft)</th>
            <th class="right">3D Length (ft)</th>
            <th class="right">Pitch Factor</th>
          </tr>
        </thead>
        <tbody>
          ${report.edges.map(e => `
            <tr>
              <td>${e.label}</td>
              <td style="text-transform:capitalize">${e.edge_type.replace('_', ' ')}</td>
              <td class="right">${e.plan_length_ft}</td>
              <td class="right" style="font-weight:600">${e.true_length_ft}</td>
              <td class="right">${e.pitch_factor?.toFixed(3) || '1.000'}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="2">Total</td>
            <td class="right">${report.edges.reduce((s, e) => s + e.plan_length_ft, 0)}</td>
            <td class="right">${es.total_linear_ft}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SECTION 4: FACET ANALYSIS -->
    <div class="section">
      <div class="section-title"><span class="section-num">4</span>Facet Analysis</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th class="right">Footprint (ft&sup2;)</th>
            <th class="right">True Area (ft&sup2;)</th>
            <th class="right">True Area (m&sup2;)</th>
            <th>Pitch</th>
            <th>Direction</th>
          </tr>
        </thead>
        <tbody>
          ${report.segments.map(s => `
            <tr>
              <td>${s.name}</td>
              <td class="right">${s.footprint_area_sqft.toLocaleString()}</td>
              <td class="right" style="font-weight:600">${s.true_area_sqft.toLocaleString()}</td>
              <td class="right">${s.true_area_sqm}</td>
              <td>${s.pitch_degrees}&deg; (${s.pitch_ratio})</td>
              <td>${s.azimuth_direction} ${s.azimuth_degrees}&deg;</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td>
            <td class="right">${report.total_footprint_sqft.toLocaleString()}</td>
            <td class="right">${report.total_true_area_sqft.toLocaleString()}</td>
            <td class="right">${report.total_true_area_sqm}</td>
            <td colspan="2">${report.roof_pitch_degrees}&deg; avg (${report.roof_pitch_ratio})</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SECTION 5: MATERIAL ESTIMATES -->
    <div class="section">
      <div class="section-title"><span class="section-num">5</span>Material Estimates</div>
      <div class="data-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
        <div class="data-item highlight">
          <div class="label">Gross Squares</div>
          <div class="value">${mat.gross_squares}</div>
        </div>
        <div class="data-item">
          <div class="label">Bundles Needed</div>
          <div class="value">${mat.bundle_count}</div>
        </div>
        <div class="data-item">
          <div class="label">Waste Factor</div>
          <div class="value">${mat.waste_pct}%</div>
        </div>
        <div class="data-item ${mat.complexity_class === 'complex' || mat.complexity_class === 'very_complex' ? 'warn' : ''}">
          <div class="label">Complexity</div>
          <div class="value" style="font-size:11pt;text-transform:capitalize">${mat.complexity_class.replace('_', ' ')}</div>
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Material</th>
            <th class="right">Net Qty</th>
            <th class="right">Waste</th>
            <th class="right">Order Qty</th>
            <th>Unit</th>
            <th class="right">Unit Price</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${mat.line_items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="right">${typeof item.net_quantity === 'number' ? item.net_quantity.toLocaleString() : item.net_quantity}</td>
              <td class="right">${item.waste_pct}%</td>
              <td class="right" style="font-weight:600">${item.order_quantity}</td>
              <td>${item.order_unit}</td>
              <td class="right">$${(item.unit_price_cad || 0).toFixed(2)}</td>
              <td class="right" style="font-weight:600">$${(item.line_total_cad || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="5">Estimated Material Total</td>
            <td></td>
            <td class="right" style="font-size:11pt">$${mat.total_material_cost_cad.toFixed(2)} CAD</td>
          </tr>
        </tbody>
      </table>
      <div class="disclaimer" style="margin-top:10px">
        <strong>Note:</strong> Material costs are estimates based on typical Alberta retail pricing (${mat.shingle_type} shingles).
        Actual costs vary by supplier, brand, and current market conditions. ${mat.complexity_class !== 'simple' ? `Roof complexity rated "${mat.complexity_class.replace('_', ' ')}" — additional labour and waste expected.` : ''}
        Contact your supplier for exact pricing. Prices shown in Canadian Dollars.
      </div>
    </div>

    <!-- SECTION 6: SOLAR POTENTIAL (bonus) -->
    ${report.num_panels_possible > 0 ? `
    <div class="section">
      <div class="section-title"><span class="section-num">6</span>Solar Potential</div>
      <div class="data-grid three">
        <div class="data-item">
          <div class="label">Max Sunshine Hours</div>
          <div class="value">${report.max_sunshine_hours.toLocaleString()}<span class="unit">hrs/yr</span></div>
        </div>
        <div class="data-item">
          <div class="label">Panels Possible</div>
          <div class="value">${report.num_panels_possible}</div>
        </div>
        <div class="data-item highlight">
          <div class="label">Yearly Energy</div>
          <div class="value">${report.yearly_energy_kwh.toLocaleString()}<span class="unit">kWh</span></div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- QUALITY NOTES -->
    ${quality.notes && quality.notes.length > 0 ? `
    <div class="disclaimer">
      <strong>Data Quality Notes:</strong>
      <ul style="margin-top:4px;padding-left:16px">
        ${quality.notes.map(n => `<li>${n}</li>`).join('')}
      </ul>
      ${quality.field_verification_recommended ? '<div style="margin-top:6px;font-weight:600;color:#d97706">Field verification recommended before ordering materials.</div>' : ''}
    </div>
    ` : ''}

    <!-- FOOTER -->
    <div class="report-footer">
      <div>&copy; ${new Date().getFullYear()} Reuse Canada &middot; Professional Roof Measurement Services</div>
      <div>Report generated ${new Date(report.generated_at).toLocaleString('en-CA')} &middot; v${report.report_version || '2.0'}</div>
    </div>
  </div>
</body>
</html>`
}
