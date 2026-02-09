// ============================================================
// Reuse Canada - Roofing Measurement Tool
// Core Type Definitions
// ============================================================

/**
 * Cloudflare Worker Bindings
 * - DB: Cloudflare D1 database
 * - API keys: Pulled from environment variables (.dev.vars local, wrangler secret for prod)
 * - NEVER hardcoded, NEVER exposed to frontend JavaScript
 */
export type Bindings = {
  DB: D1Database

  // Google APIs - stored as Cloudflare secrets, accessed server-side only
  GOOGLE_SOLAR_API_KEY: string
  GOOGLE_MAPS_API_KEY: string

  // Stripe - stored as Cloudflare secrets, accessed server-side only
  STRIPE_SECRET_KEY: string
  STRIPE_PUBLISHABLE_KEY: string  // This one is safe for frontend (it's "publishable")
}

// ============================================================
// REPORT DATA MODEL - Locked Down Definition
// ============================================================
// This is the canonical definition of what a "Report" contains.
// Every field has explicit units and purpose documented.
// Mock data and real Google Solar data must both conform to this.
// ============================================================

/**
 * A single roof segment (face/plane of the roof)
 */
export interface RoofSegment {
  /** Human-readable segment name, e.g. "Main South Face" */
  name: string

  /** Flat 2D footprint area measured from directly above (sq ft) */
  footprint_area_sqft: number

  /** TRUE 3D surface area accounting for pitch angle (sq ft)
   *  Formula: footprint_area / cos(pitch_degrees * PI/180)
   *  This is what a roofer actually needs to buy shingles for. */
  true_area_sqft: number

  /** TRUE 3D surface area in metric (sq meters) */
  true_area_sqm: number

  /** Pitch angle of this segment in degrees from horizontal (0 = flat, 90 = vertical) */
  pitch_degrees: number

  /** Pitch expressed as rise:12 ratio (standard roofing notation)
   *  Formula: 12 * tan(pitch_degrees * PI/180)
   *  e.g. pitch_degrees=26.57 -> pitch_ratio="6:12" */
  pitch_ratio: string

  /** Compass direction the segment faces (0=N, 90=E, 180=S, 270=W) */
  azimuth_degrees: number

  /** Cardinal direction label, e.g. "South", "NNW" */
  azimuth_direction: string
}

/**
 * Complete Roof Measurement Report
 */
export interface RoofReport {
  // ---- Identification ----
  order_id: number
  generated_at: string  // ISO 8601 timestamp

  // ---- AREA MEASUREMENTS (the critical distinction) ----

  /** Total FLAT footprint area - what you see from a drone looking straight down (sq ft) */
  total_footprint_sqft: number

  /** Total FLAT footprint area (sq meters) */
  total_footprint_sqm: number

  /** Total TRUE 3D surface area - what a roofer needs to cover with shingles (sq ft)
   *  ALWAYS larger than footprint for any pitched roof.
   *  This is the number that matters for material estimation. */
  total_true_area_sqft: number

  /** Total TRUE 3D surface area (sq meters) */
  total_true_area_sqm: number

  /** Area multiplier: true_area / footprint. Shows how much bigger the real roof is.
   *  e.g. 1.12 means roof is 12% larger than the flat footprint
   *  Typical values: 1.03 (low pitch) to 1.41 (steep 45-degree) */
  area_multiplier: number

  // ---- PITCH (dominant/average) ----

  /** Dominant pitch angle in degrees */
  roof_pitch_degrees: number

  /** Dominant pitch as rise:12 ratio string */
  roof_pitch_ratio: string

  // ---- ORIENTATION ----

  /** Dominant azimuth in degrees (compass bearing of largest face) */
  roof_azimuth_degrees: number

  // ---- SEGMENTS (individual roof planes) ----
  segments: RoofSegment[]

  // ---- SOLAR DATA (bonus from Google Solar API) ----

  /** Maximum annual sunshine hours at this location */
  max_sunshine_hours: number

  /** How many standard solar panels (17.5 sq ft each) could fit */
  num_panels_possible: number

  /** Estimated annual energy production in kWh */
  yearly_energy_kwh: number

  // ---- IMAGERY ----
  imagery: {
    /** Satellite view URL (if available) */
    satellite_url: string | null
    /** Digital Surface Model URL (if available) */
    dsm_url: string | null
    /** Roof mask overlay URL (if available) */
    mask_url: string | null
  }

  // ---- METADATA ----
  metadata: {
    /** 'google_solar_api' or 'mock' */
    provider: string
    /** API response time in ms */
    api_duration_ms: number
    /** Coordinates used for the lookup */
    coordinates: { lat: number | null, lng: number | null }
  }
}

// ============================================================
// Helper: Convert degrees to cardinal direction
// ============================================================
export function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16
  return dirs[index]
}

// ============================================================
// Helper: Pitch degrees to rise:12 ratio string
// ============================================================
export function pitchToRatio(degrees: number): string {
  const rise = 12 * Math.tan(degrees * Math.PI / 180)
  return `${Math.round(rise * 10) / 10}:12`
}

// ============================================================
// Helper: Calculate TRUE 3D surface area from flat footprint + pitch
// The fundamental formula: true_area = footprint / cos(pitch)
// ============================================================
export function trueAreaFromFootprint(footprintSqft: number, pitchDegrees: number): number {
  if (pitchDegrees <= 0 || pitchDegrees >= 90) return footprintSqft
  const cosAngle = Math.cos(pitchDegrees * Math.PI / 180)
  if (cosAngle <= 0) return footprintSqft
  return footprintSqft / cosAngle
}
