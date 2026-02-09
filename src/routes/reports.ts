import { Hono } from 'hono'

type Bindings = { DB: D1Database }

export const reportsRoutes = new Hono<{ Bindings: Bindings }>()

// GET report for an order
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

// Simulate report generation (mock Google Solar API)
reportsRoutes.post('/:orderId/generate', async (c) => {
  try {
    const orderId = c.req.param('orderId')

    // Get the order
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>()
    if (!order) return c.json({ error: 'Order not found' }, 404)

    // Check if report already exists
    const existing = await c.env.DB.prepare('SELECT id, status FROM reports WHERE order_id = ?').bind(orderId).first<any>()

    // Generate mock roof data (simulating Google Solar API response)
    const mockRoofData = generateMockRoofData(order.latitude, order.longitude)

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE reports SET
          roof_area_sqft = ?, roof_area_sqm = ?, roof_pitch_degrees = ?,
          roof_azimuth_degrees = ?, max_sunshine_hours = ?, num_panels_possible = ?,
          yearly_energy_kwh = ?, roof_segments = ?, api_response_raw = ?,
          status = 'completed', updated_at = datetime('now')
        WHERE order_id = ?
      `).bind(
        mockRoofData.roof_area_sqft, mockRoofData.roof_area_sqm, mockRoofData.roof_pitch_degrees,
        mockRoofData.roof_azimuth_degrees, mockRoofData.max_sunshine_hours, mockRoofData.num_panels_possible,
        mockRoofData.yearly_energy_kwh, JSON.stringify(mockRoofData.segments), JSON.stringify(mockRoofData),
        orderId
      ).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO reports (
          order_id, roof_area_sqft, roof_area_sqm, roof_pitch_degrees,
          roof_azimuth_degrees, max_sunshine_hours, num_panels_possible,
          yearly_energy_kwh, roof_segments, api_response_raw, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).bind(
        orderId,
        mockRoofData.roof_area_sqft, mockRoofData.roof_area_sqm, mockRoofData.roof_pitch_degrees,
        mockRoofData.roof_azimuth_degrees, mockRoofData.max_sunshine_hours, mockRoofData.num_panels_possible,
        mockRoofData.yearly_energy_kwh, JSON.stringify(mockRoofData.segments), JSON.stringify(mockRoofData)
      ).run()
    }

    // Update order status to completed
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'completed', delivered_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(orderId).run()

    // Log API request
    await c.env.DB.prepare(`
      INSERT INTO api_requests_log (order_id, request_type, endpoint, response_status, duration_ms)
      VALUES (?, 'google_solar_api', 'buildingInsights:findClosest', 200, ?)
    `).bind(orderId, Math.floor(Math.random() * 2000) + 500).run()

    return c.json({
      success: true,
      message: 'Report generated successfully',
      report: {
        order_id: orderId,
        ...mockRoofData,
        status: 'completed'
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to generate report', details: err.message }, 500)
  }
})

// Generate mock roof data simulating Google Solar API
function generateMockRoofData(lat?: number, lng?: number) {
  const baseArea = 1800 + Math.random() * 1200 // 1800-3000 sqft
  const sqm = baseArea * 0.0929

  const segments = [
    { name: 'Main South Face', area_sqft: baseArea * 0.35, pitch: 22 + Math.random() * 8, azimuth: 170 + Math.random() * 20 },
    { name: 'Main North Face', area_sqft: baseArea * 0.35, pitch: 22 + Math.random() * 8, azimuth: 350 + Math.random() * 20 },
    { name: 'East Wing', area_sqft: baseArea * 0.15, pitch: 18 + Math.random() * 10, azimuth: 80 + Math.random() * 20 },
    { name: 'West Wing', area_sqft: baseArea * 0.15, pitch: 18 + Math.random() * 10, azimuth: 260 + Math.random() * 20 },
  ]

  return {
    roof_area_sqft: Math.round(baseArea),
    roof_area_sqm: Math.round(sqm),
    roof_pitch_degrees: Math.round((25 + Math.random() * 10) * 10) / 10,
    roof_azimuth_degrees: Math.round((170 + Math.random() * 20) * 10) / 10,
    max_sunshine_hours: Math.round((1400 + Math.random() * 400) * 10) / 10,
    num_panels_possible: Math.floor(baseArea * 0.35 / 17.5),
    yearly_energy_kwh: Math.round(baseArea * 0.35 / 17.5 * 400),
    segments: segments.map(s => ({
      ...s,
      area_sqft: Math.round(s.area_sqft),
      pitch: Math.round(s.pitch * 10) / 10,
      azimuth: Math.round(s.azimuth * 10) / 10,
    })),
    imagery: {
      satellite: lat && lng ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite` : null,
    },
    metadata: {
      provider: 'Google Solar API (Mock)',
      generated_at: new Date().toISOString(),
      coordinates: { lat, lng }
    }
  }
}
