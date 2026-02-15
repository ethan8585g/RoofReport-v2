import { Hono } from 'hono'
import type { Bindings } from '../types'
import { isDevAccount } from './customer-auth'

export const propertyImageryRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// AUTH MIDDLEWARE — Dev account only
// ============================================================
async function getDevCustomer(db: D1Database, token: string | undefined): Promise<any | null> {
  if (!token) return null
  const session = await db.prepare(`
    SELECT cs.customer_id, c.* FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id
    WHERE cs.session_token = ? AND cs.expires_at > datetime('now') AND c.is_active = 1
  `).bind(token).first<any>()
  if (!session) return null
  if (!isDevAccount(session.email || '')) return null
  return session
}

// ============================================================
// POST /generate — Geocode address, fetch 4 satellite images, build PDF
// ============================================================
propertyImageryRoutes.post('/generate', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const customer = await getDevCustomer(c.env.DB, token)
  if (!customer) {
    return c.json({ error: 'Unauthorized. This feature is only available for dev/test accounts.' }, 403)
  }

  const { address, city, province, postal_code } = await c.req.json()
  if (!address) return c.json({ error: 'Address is required' }, 400)

  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || c.env.GOOGLE_SOLAR_API_KEY
  if (!mapsKey) return c.json({ error: 'Google Maps API key is not configured' }, 503)

  // Build full address string
  const fullAddress = [address, city, province, postal_code].filter(Boolean).join(', ')

  // ── Step 1: Geocode the address ──
  let lat: number, lng: number
  try {
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${mapsKey}`
    const geoResp = await fetch(geoUrl)
    const geoData: any = await geoResp.json()
    if (geoData.status !== 'OK' || !geoData.results?.[0]?.geometry?.location) {
      return c.json({ error: 'Could not geocode address. Please check the address and try again.', geocode_status: geoData.status }, 400)
    }
    lat = geoData.results[0].geometry.location.lat
    lng = geoData.results[0].geometry.location.lng
  } catch (err: any) {
    return c.json({ error: 'Geocoding failed', details: err.message }, 500)
  }

  // ── Step 2: Fetch 4 satellite images at different zoom levels ──
  // Zoom levels chosen to show property structures (shops, sheds, equipment, outbuildings)
  // Zoom 20 = close-up, Zoom 19 = property detail, Zoom 18 = property + yard, Zoom 17 = neighbourhood context
  const imageConfigs = [
    { zoom: 20, size: '640x640', label: 'Close-Up View (Zoom 20)', desc: 'Structures, equipment, rooftop detail' },
    { zoom: 19, size: '640x640', label: 'Property Detail (Zoom 19)', desc: 'Buildings, sheds, outbuildings, driveways' },
    { zoom: 18, size: '640x640', label: 'Full Property (Zoom 18)', desc: 'Lot boundaries, garages, shops, yards' },
    { zoom: 17, size: '640x640', label: 'Neighbourhood Context (Zoom 17)', desc: 'Surrounding area, access roads, adjacent lots' },
  ]

  const images: { label: string; desc: string; base64: string; zoom: number }[] = []

  for (const cfg of imageConfigs) {
    try {
      const imgUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${cfg.zoom}&size=${cfg.size}&maptype=satellite&key=${mapsKey}`
      const imgResp = await fetch(imgUrl)
      if (!imgResp.ok) {
        console.warn(`[PropertyImagery] Failed to fetch zoom ${cfg.zoom}: HTTP ${imgResp.status}`)
        continue
      }
      const imgBuffer = await imgResp.arrayBuffer()
      const base64 = arrayBufferToBase64(imgBuffer)
      images.push({ label: cfg.label, desc: cfg.desc, base64, zoom: cfg.zoom })
    } catch (err: any) {
      console.warn(`[PropertyImagery] Error fetching zoom ${cfg.zoom}:`, err.message)
    }
  }

  if (images.length === 0) {
    return c.json({ error: 'Failed to fetch any satellite images for this location.' }, 500)
  }

  // ── Step 3: Return images + metadata (PDF built client-side with jsPDF) ──
  return c.json({
    success: true,
    address: fullAddress,
    coordinates: { lat, lng },
    generated_at: new Date().toISOString(),
    images: images.map(img => ({
      label: img.label,
      desc: img.desc,
      zoom: img.zoom,
      data_url: `data:image/png;base64,${img.base64}`
    }))
  })
})

// ============================================================
// GET /check — Verify dev account has access
// ============================================================
propertyImageryRoutes.get('/check', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const customer = await getDevCustomer(c.env.DB, token)
  if (!customer) {
    return c.json({ access: false })
  }
  return c.json({ access: true, email: customer.email })
})

// ============================================================
// HELPERS
// ============================================================
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
