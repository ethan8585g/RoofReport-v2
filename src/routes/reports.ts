import { Hono } from 'hono'
import type { Bindings } from '../types'
import { trueAreaFromFootprint, pitchToRatio, degreesToCardinal } from '../types'
import type { RoofReport, RoofSegment } from '../types'

export const reportsRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// GET report for an order
// ============================================================
reportsRoutes.get('/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const report = await c.env.DB.prepare(`
      SELECT r.*, o.order_number, o.property_address, o.homeowner_name,
             o.requester_name, o.requester_company, o.service_tier, o.price,
             o.latitude, o.longitude
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
// GENERATE report
// Uses GOOGLE_SOLAR_API_KEY from environment variables if configured.
// Falls back to realistic mock data if key is not set.
// API key is NEVER exposed to the frontend — this is server-side only.
// ============================================================
reportsRoutes.post('/:orderId/generate', async (c) => {
  try {
    const orderId = c.req.param('orderId')

    // Get the order
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>()
    if (!order) return c.json({ error: 'Order not found' }, 404)

    // Check if report already exists
    const existing = await c.env.DB.prepare('SELECT id, status FROM reports WHERE order_id = ?').bind(orderId).first<any>()

    let reportData: RoofReport
    let apiDuration = 0

    // Try real Google Solar API if key is configured in environment
    const solarApiKey = c.env.GOOGLE_SOLAR_API_KEY
    if (solarApiKey && order.latitude && order.longitude) {
      try {
        const startTime = Date.now()
        reportData = await callGoogleSolarAPI(
          order.latitude,
          order.longitude,
          solarApiKey,
          parseInt(orderId)
        )
        apiDuration = Date.now() - startTime

        // Log real API request
        await c.env.DB.prepare(`
          INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, duration_ms)
          VALUES (?, 'google_solar_api', 'buildingInsights:findClosest', 200, ?)
        `).bind(orderId, apiDuration).run()

      } catch (apiErr: any) {
        // Log failed API request
        await c.env.DB.prepare(`
          INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, response_payload, duration_ms)
          VALUES (?, 'google_solar_api', 'buildingInsights:findClosest', 500, ?, ?)
        `).bind(orderId, apiErr.message, Date.now() - apiDuration).run()

        // Fall back to mock data
        reportData = generateMockRoofReport(order.latitude, order.longitude, parseInt(orderId))
        reportData.metadata.provider = `mock (Solar API failed: ${apiErr.message})`
      }
    } else {
      // No API key configured — generate mock data with correct 3D math
      reportData = generateMockRoofReport(order.latitude, order.longitude, parseInt(orderId))
    }

    // Save to database
    if (existing) {
      await c.env.DB.prepare(`
        UPDATE reports SET
          roof_area_sqft = ?, roof_area_sqm = ?,
          roof_pitch_degrees = ?, roof_azimuth_degrees = ?,
          max_sunshine_hours = ?, num_panels_possible = ?,
          yearly_energy_kwh = ?, roof_segments = ?, api_response_raw = ?,
          status = 'completed', updated_at = datetime('now')
        WHERE order_id = ?
      `).bind(
        reportData.total_true_area_sqft, reportData.total_true_area_sqm,
        reportData.roof_pitch_degrees, reportData.roof_azimuth_degrees,
        reportData.max_sunshine_hours, reportData.num_panels_possible,
        reportData.yearly_energy_kwh, JSON.stringify(reportData.segments),
        JSON.stringify(reportData),
        orderId
      ).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO reports (
          order_id, roof_area_sqft, roof_area_sqm,
          roof_pitch_degrees, roof_azimuth_degrees,
          max_sunshine_hours, num_panels_possible,
          yearly_energy_kwh, roof_segments, api_response_raw, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).bind(
        orderId,
        reportData.total_true_area_sqft, reportData.total_true_area_sqm,
        reportData.roof_pitch_degrees, reportData.roof_azimuth_degrees,
        reportData.max_sunshine_hours, reportData.num_panels_possible,
        reportData.yearly_energy_kwh, JSON.stringify(reportData.segments),
        JSON.stringify(reportData)
      ).run()
    }

    // Update order status to completed
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'completed', delivered_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(orderId).run()

    return c.json({
      success: true,
      message: 'Report generated successfully',
      report: reportData
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to generate report', details: err.message }, 500)
  }
})

// ============================================================
// REAL Google Solar API Call
// Key comes from c.env.GOOGLE_SOLAR_API_KEY (environment variable)
// NEVER from the database, NEVER from frontend.
// ============================================================
async function callGoogleSolarAPI(
  lat: number,
  lng: number,
  apiKey: string,
  orderId: number
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

  // Parse roof segments from Google's response
  // Google returns flat footprint areas — we must calculate true 3D areas
  const rawSegments = solarPotential.roofSegmentStats || []
  const segments: RoofSegment[] = rawSegments.map((seg: any, i: number) => {
    const pitchDeg = seg.pitchDegrees || 0
    const azimuthDeg = seg.azimuthDegrees || 0
    // Google reports stats.areaMeters2 as the FLAT footprint
    const footprintSqm = seg.stats?.areaMeters2 || 0
    const footprintSqft = footprintSqm * 10.7639

    // *** THE CRITICAL 3D MATH ***
    // True surface area = footprint / cos(pitch)
    // A 30-degree pitched roof is 15.5% larger than its footprint
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
      azimuth_direction: degreesToCardinal(azimuthDeg)
    }
  })

  const totalFootprintSqft = segments.reduce((sum, s) => sum + s.footprint_area_sqft, 0)
  const totalTrueAreaSqft = segments.reduce((sum, s) => sum + s.true_area_sqft, 0)
  const totalTrueAreaSqm = segments.reduce((sum, s) => sum + s.true_area_sqm, 0)
  const totalFootprintSqm = totalFootprintSqft * 0.0929

  // Dominant pitch (area-weighted average)
  const weightedPitch = segments.reduce((sum, s) => sum + s.pitch_degrees * s.true_area_sqft, 0) / (totalTrueAreaSqft || 1)
  // Dominant azimuth (from largest segment)
  const largestSegment = segments.reduce((max, s) => s.true_area_sqft > max.true_area_sqft ? s : max, segments[0])

  const maxPanels = solarPotential.maxArrayPanelsCount || 0
  const maxSunshine = solarPotential.maxSunshineHoursPerYear || 0
  const yearlyEnergy = solarPotential.solarPanelConfigs?.[0]?.yearlyEnergyDcKwh || (maxPanels * 400)

  return {
    order_id: orderId,
    generated_at: new Date().toISOString(),
    total_footprint_sqft: totalFootprintSqft,
    total_footprint_sqm: Math.round(totalFootprintSqm),
    total_true_area_sqft: totalTrueAreaSqft,
    total_true_area_sqm: Math.round(totalTrueAreaSqm * 10) / 10,
    area_multiplier: Math.round((totalTrueAreaSqft / (totalFootprintSqft || 1)) * 1000) / 1000,
    roof_pitch_degrees: Math.round(weightedPitch * 10) / 10,
    roof_pitch_ratio: pitchToRatio(weightedPitch),
    roof_azimuth_degrees: largestSegment?.azimuth_degrees || 0,
    segments,
    max_sunshine_hours: Math.round(maxSunshine * 10) / 10,
    num_panels_possible: maxPanels,
    yearly_energy_kwh: Math.round(yearlyEnergy),
    imagery: {
      satellite_url: data.imageryDate ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite&key=${apiKey}` : null,
      dsm_url: null,
      mask_url: null
    },
    metadata: {
      provider: 'google_solar_api',
      api_duration_ms: 0,
      coordinates: { lat, lng }
    }
  }
}

// ============================================================
// MOCK DATA GENERATOR — with correct 3D surface area math
// Used when GOOGLE_SOLAR_API_KEY is not yet configured.
// Generates realistic Alberta residential roof data.
// ============================================================
function generateMockRoofReport(lat?: number, lng?: number, orderId?: number): RoofReport {
  // Typical Alberta residential footprint: 1400-2800 sq ft flat
  const totalFootprintSqft = 1400 + Math.random() * 1400

  // Generate 4 roof segments with realistic pitches
  // Alberta residential: typically 4:12 to 8:12 pitch (18-34 degrees)
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

    // *** THE CRITICAL 3D MATH ***
    // true_area = footprint / cos(pitch_in_radians)
    // Example: 1000 sqft footprint at 30 degrees pitch
    //   = 1000 / cos(30deg) = 1000 / 0.866 = 1155 sqft true area
    //   That's 15.5% MORE material needed than the flat footprint suggests
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

  const totalTrueAreaSqft = segments.reduce((sum, s) => sum + s.true_area_sqft, 0)
  const totalTrueAreaSqm = segments.reduce((sum, s) => sum + s.true_area_sqm, 0)
  const totalFootprintSqm = totalFootprintSqft * 0.0929

  // Weighted average pitch
  const weightedPitch = segments.reduce((sum, s) => sum + s.pitch_degrees * s.true_area_sqft, 0) / totalTrueAreaSqft
  const multiplier = totalTrueAreaSqft / totalFootprintSqft

  // Solar calculation based on true area
  const usableSolarArea = totalTrueAreaSqft * 0.35 // ~35% of roof is usable for solar
  const panelCount = Math.floor(usableSolarArea / 17.5) // 17.5 sqft per panel
  const edmontonSunHours = 1500 + Math.random() * 300 // Edmonton: ~1500-1800 hr/yr

  return {
    order_id: orderId || 0,
    generated_at: new Date().toISOString(),
    total_footprint_sqft: Math.round(totalFootprintSqft),
    total_footprint_sqm: Math.round(totalFootprintSqm),
    total_true_area_sqft: Math.round(totalTrueAreaSqft),
    total_true_area_sqm: Math.round(totalTrueAreaSqm * 10) / 10,
    area_multiplier: Math.round(multiplier * 1000) / 1000,
    roof_pitch_degrees: Math.round(weightedPitch * 10) / 10,
    roof_pitch_ratio: pitchToRatio(weightedPitch),
    roof_azimuth_degrees: segments[0].azimuth_degrees,
    segments,
    max_sunshine_hours: Math.round(edmontonSunHours * 10) / 10,
    num_panels_possible: panelCount,
    yearly_energy_kwh: Math.round(panelCount * 400),
    imagery: {
      satellite_url: lat && lng
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite`
        : null,
      dsm_url: null,
      mask_url: null
    },
    metadata: {
      provider: 'mock',
      api_duration_ms: Math.floor(Math.random() * 200) + 50,
      coordinates: { lat: lat || null, lng: lng || null }
    }
  }
}
