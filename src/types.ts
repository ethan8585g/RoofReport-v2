// ============================================================
// Reuse Canada - Roofing Measurement Tool
// Core Type Definitions - v2.0
// ============================================================
// This is the canonical data contract for the entire system.
// Every field has explicit units, purpose, and calculation method.
// Mock data and real Google Solar data must both conform.
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

  // Google Vertex AI / Gemini API - for AI roof geometry analysis
  GOOGLE_VERTEX_API_KEY: string

  // Stripe - stored as Cloudflare secrets, accessed server-side only
  STRIPE_SECRET_KEY: string
  STRIPE_PUBLISHABLE_KEY: string  // This one is safe for frontend (it's "publishable")
}

// ============================================================
// AI MEASUREMENT ENGINE TYPES — Gemini Vision roof geometry
// ============================================================

/** A point in normalized coordinates (0-1000 based on image boundaries) */
export interface MeasurementPoint {
  x: number  // 0-1000
  y: number  // 0-1000
}

/** A roof facet (plane) detected by AI vision analysis */
export interface AIRoofFacet {
  id: string
  points: MeasurementPoint[]
  pitch: string   // e.g. "25 deg" or "6/12"
  azimuth: string // e.g. "180 deg" or "South"
}

/** A roof line (edge) detected by AI vision analysis */
export interface AIRoofLine {
  type: 'RIDGE' | 'HIP' | 'VALLEY' | 'EAVE' | 'RAKE'
  start: MeasurementPoint
  end: MeasurementPoint
}

/** A roof obstruction detected by AI vision analysis */
export interface AIObstruction {
  type: 'CHIMNEY' | 'VENT' | 'SKYLIGHT' | 'HVAC'
  boundingBox: {
    min: MeasurementPoint
    max: MeasurementPoint
  }
}

/** Complete AI measurement analysis result */
export interface AIMeasurementAnalysis {
  facets: AIRoofFacet[]
  lines: AIRoofLine[]
  obstructions: AIObstruction[]
}

/** AI-generated roofing assessment report */
export interface AIReportData {
  summary: string
  materialSuggestion: string
  difficultyScore: number
  estimatedCostRange: string
}

/** Combined AI analysis result stored in DB */
export interface AIAnalysisResult {
  measurement: AIMeasurementAnalysis | null
  report: AIReportData | null
  satellite_image_url: string
  analyzed_at: string
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  error?: string
}

// ============================================================
// ROOF SEGMENT — A single plane/face of the roof
// ============================================================

export interface RoofSegment {
  /** Human-readable segment name, e.g. "Main South Face" */
  name: string

  /** Flat 2D footprint area measured from directly above (sq ft) */
  footprint_area_sqft: number

  /** TRUE 3D surface area accounting for pitch angle (sq ft)
   *  Formula: footprint_area / cos(pitch_degrees * PI/180) */
  true_area_sqft: number

  /** TRUE 3D surface area in metric (sq meters) */
  true_area_sqm: number

  /** Pitch angle of this segment in degrees from horizontal */
  pitch_degrees: number

  /** Pitch as rise:12 ratio (e.g. "6:12") */
  pitch_ratio: string

  /** Compass direction the segment faces (0=N, 90=E, 180=S, 270=W) */
  azimuth_degrees: number

  /** Cardinal direction label, e.g. "South", "NNW" */
  azimuth_direction: string

  /** Height at center of this segment plane (meters, from Solar API) */
  plane_height_meters?: number

  /** Bounding box of this segment [minLat, minLng, maxLat, maxLng] */
  bounding_box?: number[]
}

// ============================================================
// EDGE MEASUREMENT — 3D linear measurements of roof edges
// ============================================================

/** Types of roof edges */
export type EdgeType = 'ridge' | 'hip' | 'valley' | 'eave' | 'rake' | 'gable' | 'flashing' | 'step_flashing'

export interface EdgeMeasurement {
  /** Type of roof edge */
  edge_type: EdgeType

  /** Human-readable label, e.g. "Main Ridge Line" */
  label: string

  /** 2D horizontal length as seen from above (ft) */
  plan_length_ft: number

  /** TRUE 3D length accounting for slope (ft)
   *  For hip/valley: plan_length / cos(effective_angle)
   *  The effective angle depends on the pitch of adjacent segments */
  true_length_ft: number

  /** The two segments this edge borders (indices into segments array) */
  adjacent_segments?: [number, number]

  /** Pitch factor used to compute true 3D length */
  pitch_factor?: number
}

// ============================================================
// MATERIAL ESTIMATE — Bill of Materials for roofing
// ============================================================

/** Product-level line item on a material estimate */
export interface MaterialLineItem {
  /** Material category: shingles, underlayment, starter_strip, ridge_cap, drip_edge,
   *  ice_shield, hip_ridge, valley_metal, flashing, nails, ventilation, waste_allowance */
  category: string

  /** Product description */
  description: string

  /** Unit of measure: squares, rolls, linear_ft, pieces, lbs, sheets */
  unit: string

  /** Net quantity required (before waste) */
  net_quantity: number

  /** Waste allowance percentage applied */
  waste_pct: number

  /** Gross quantity after waste (what you actually order) */
  gross_quantity: number

  /** Ordering quantity rounded up to purchase units (e.g., 3 bundles per square) */
  order_quantity: number

  /** Purchase unit name (bundles, boxes, rolls, pieces) */
  order_unit: string

  /** Estimated unit price in CAD */
  unit_price_cad?: number

  /** Estimated line total in CAD */
  line_total_cad?: number
}

export interface MaterialEstimate {
  /** True surface area used for calculation (sq ft) */
  net_area_sqft: number

  /** Waste allowance percentage (typically 10-15% for residential) */
  waste_pct: number

  /** Gross area after waste (net_area * (1 + waste_pct/100)) */
  gross_area_sqft: number

  /** Roofing squares (gross_area / 100). 1 square = 100 sq ft */
  gross_squares: number

  /** Standard shingle bundles needed (3 bundles per square) */
  bundle_count: number

  /** Line items for all materials */
  line_items: MaterialLineItem[]

  /** Total estimated material cost (CAD) */
  total_material_cost_cad: number

  /** Complexity factor: 1.0 = simple gable, 1.1+ = hips/valleys add waste */
  complexity_factor: number

  /** Roof complexity classification */
  complexity_class: 'simple' | 'moderate' | 'complex' | 'very_complex'

  /** Shingle product assumed (default 3-tab vs architectural) */
  shingle_type: string
}

// ============================================================
// COMPLETE ROOF MEASUREMENT REPORT — v2.0
// ============================================================

export interface RoofReport {
  // ---- Identification ----
  order_id: number
  generated_at: string  // ISO 8601 timestamp
  report_version: string  // "2.0"

  // ---- PROPERTY CONTEXT (Section 1 of professional report) ----
  property: {
    address: string
    city?: string
    province?: string
    postal_code?: string
    homeowner_name?: string
    requester_name?: string
    requester_company?: string
    latitude: number | null
    longitude: number | null
  }

  // ---- AREA MEASUREMENTS (Section 2) ----

  /** Total FLAT footprint area (sq ft) */
  total_footprint_sqft: number
  total_footprint_sqm: number

  /** Total TRUE 3D surface area (sq ft) */
  total_true_area_sqft: number
  total_true_area_sqm: number

  /** Multiplier: true_area / footprint */
  area_multiplier: number

  // ---- PITCH ----
  roof_pitch_degrees: number
  roof_pitch_ratio: string

  // ---- ORIENTATION ----
  roof_azimuth_degrees: number

  // ---- SEGMENTS (Section 4: Facet Analysis) ----
  segments: RoofSegment[]

  // ---- EDGE BREAKDOWN (Section 3: Edge Breakdown) ----
  edges: EdgeMeasurement[]

  /** Summary edge totals */
  edge_summary: {
    total_ridge_ft: number
    total_hip_ft: number
    total_valley_ft: number
    total_eave_ft: number
    total_rake_ft: number
    total_linear_ft: number
  }

  // ---- MATERIAL ESTIMATE (Section 5) ----
  materials: MaterialEstimate

  // ---- SOLAR DATA ----
  max_sunshine_hours: number
  num_panels_possible: number
  yearly_energy_kwh: number

  // ---- IMAGERY ----
  imagery: {
    satellite_url: string | null
    dsm_url: string | null
    mask_url: string | null
    flux_url: string | null
  }

  // ---- DATA QUALITY ----
  quality: {
    /** IMAGERYQUALITY from Solar API: HIGH (0.1m/px), MEDIUM (0.25m/px), BASE */
    imagery_quality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'BASE'
    /** Date of imagery capture */
    imagery_date?: string
    /** Whether field verification is recommended */
    field_verification_recommended: boolean
    /** Confidence score 0-100 */
    confidence_score: number
    /** Notes about data quality */
    notes: string[]
  }

  // ---- METADATA ----
  metadata: {
    /** 'google_solar_api' or 'mock' */
    provider: string
    api_duration_ms: number
    coordinates: { lat: number | null, lng: number | null }
    /** Solar API imagery date if available */
    solar_api_imagery_date?: string
    /** Building insights quality level */
    building_insights_quality?: string
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
  if (degrees <= 0 || degrees >= 90) return '0:12'
  const rise = 12 * Math.tan(degrees * Math.PI / 180)
  return `${Math.round(rise * 10) / 10}:12`
}

// ============================================================
// Helper: TRUE 3D surface area from flat footprint + pitch
// Formula: true_area = footprint / cos(pitch)
// ============================================================
export function trueAreaFromFootprint(footprintSqft: number, pitchDegrees: number): number {
  if (pitchDegrees <= 0 || pitchDegrees >= 90) return footprintSqft
  const cosAngle = Math.cos(pitchDegrees * Math.PI / 180)
  if (cosAngle <= 0) return footprintSqft
  return footprintSqft / cosAngle
}

// ============================================================
// Helper: 3D hip/valley length from plan-view (2D) length
// Hip/valley edges run diagonally across the roof surface.
// The 3D length depends on the pitch of both adjacent faces.
//
// For a hip/valley at 45-degree plan angle between two equal-pitch faces:
//   true_length = plan_length * sqrt(1 + (rise/12)^2 + (rise/12)^2) / sqrt(2)
// Simplified: true_length = plan_length * hip_valley_factor(pitch)
//
// For unequal pitches (average the factor):
//   effective_pitch = average of adjacent pitches
// ============================================================
export function hipValleyFactor(pitchDegrees: number): number {
  // rise:12 ratio
  const rise = 12 * Math.tan(pitchDegrees * Math.PI / 180)
  // Hip/valley factor = sqrt(rise^2 + rise^2 + 12^2 * 2) / (12 * sqrt(2))
  // Simplified: sqrt(2 * rise^2 + 288) / (12 * sqrt(2))
  return Math.sqrt(2 * rise * rise + 288) / (12 * Math.SQRT2)
}

// ============================================================
// Helper: 3D rake/common rafter length factor
// true_length = plan_length / cos(pitch)
// Same as area factor
// ============================================================
export function rakeFactor(pitchDegrees: number): number {
  if (pitchDegrees <= 0 || pitchDegrees >= 90) return 1
  return 1 / Math.cos(pitchDegrees * Math.PI / 180)
}

// ============================================================
// Helper: Classify roof complexity based on segment count,
// hip/valley count, and pitch variation
// ============================================================
export function classifyComplexity(
  segmentCount: number,
  hipCount: number,
  valleyCount: number,
  pitchVariation: number
): { factor: number, classification: 'simple' | 'moderate' | 'complex' | 'very_complex' } {
  let score = 0

  // Segment count: more faces = more complex
  if (segmentCount <= 2) score += 0
  else if (segmentCount <= 4) score += 1
  else if (segmentCount <= 6) score += 2
  else score += 3

  // Hip/valley edges: each adds complexity
  score += Math.min(hipCount, 4)
  score += Math.min(valleyCount * 2, 6) // valleys are trickier

  // Pitch variation: multiple different pitches adds complexity
  if (pitchVariation > 10) score += 2
  else if (pitchVariation > 5) score += 1

  if (score <= 2) return { factor: 1.0, classification: 'simple' }
  if (score <= 5) return { factor: 1.05, classification: 'moderate' }
  if (score <= 8) return { factor: 1.10, classification: 'complex' }
  return { factor: 1.15, classification: 'very_complex' }
}

// ============================================================
// Helper: Compute material estimate from roof data
// ============================================================
export function computeMaterialEstimate(
  trueAreaSqft: number,
  edges: EdgeMeasurement[],
  segments: RoofSegment[],
  shingleType: string = 'architectural'
): MaterialEstimate {
  // Complexity
  const hipEdges = edges.filter(e => e.edge_type === 'hip')
  const valleyEdges = edges.filter(e => e.edge_type === 'valley')
  const ridgeEdges = edges.filter(e => e.edge_type === 'ridge')
  const eaveEdges = edges.filter(e => e.edge_type === 'eave')
  const rakeEdges = edges.filter(e => e.edge_type === 'rake')

  const pitchMin = Math.min(...segments.map(s => s.pitch_degrees), 90)
  const pitchMax = Math.max(...segments.map(s => s.pitch_degrees), 0)
  const pitchVariation = pitchMax - pitchMin

  const { factor: complexityFactor, classification: complexityClass } = classifyComplexity(
    segments.length,
    hipEdges.length,
    valleyEdges.length,
    pitchVariation
  )

  // Base waste: 10% for simple, up to 15% for complex, plus valley waste
  const baseWaste = complexityClass === 'simple' ? 10 :
    complexityClass === 'moderate' ? 12 :
    complexityClass === 'complex' ? 14 : 15

  // Net area = true surface area
  const netArea = trueAreaSqft

  // Gross area = net * (1 + waste%)
  const grossArea = netArea * (1 + baseWaste / 100)

  // Squares (100 sq ft per square)
  const grossSquares = Math.ceil(grossArea / 100 * 10) / 10 // round to 0.1

  // Bundles: 3 per square for standard shingles
  const bundlesPerSquare = shingleType === '3-tab' ? 3 : 3
  const bundleCount = Math.ceil(grossSquares * bundlesPerSquare)

  // Edge totals
  const totalRidgeFt = ridgeEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalHipFt = hipEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalValleyFt = valleyEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalEaveFt = eaveEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalRakeFt = rakeEdges.reduce((s, e) => s + e.true_length_ft, 0)

  // Build line items
  const lineItems: MaterialLineItem[] = []

  // 1. Shingles
  const shinglePricePerBundle = shingleType === 'architectural' ? 42.00 : 32.00
  lineItems.push({
    category: 'shingles',
    description: `${shingleType === 'architectural' ? 'Architectural (Laminate)' : '3-Tab Standard'} Shingles`,
    unit: 'squares',
    net_quantity: Math.round(netArea / 100 * 10) / 10,
    waste_pct: baseWaste,
    gross_quantity: grossSquares,
    order_quantity: bundleCount,
    order_unit: 'bundles',
    unit_price_cad: shinglePricePerBundle,
    line_total_cad: Math.round(bundleCount * shinglePricePerBundle * 100) / 100
  })

  // 2. Underlayment (synthetic, 1000 sqft per roll)
  const underlaymentRolls = Math.ceil(grossArea / 1000)
  lineItems.push({
    category: 'underlayment',
    description: 'Synthetic Underlayment',
    unit: 'rolls',
    net_quantity: Math.ceil(netArea / 1000),
    waste_pct: 10,
    gross_quantity: underlaymentRolls,
    order_quantity: underlaymentRolls,
    order_unit: 'rolls',
    unit_price_cad: 85.00,
    line_total_cad: Math.round(underlaymentRolls * 85.00 * 100) / 100
  })

  // 3. Ice & Water Shield (first 3 ft from eave, plus valleys)
  // Alberta code requires ice shield on eaves
  const iceShieldLinearFt = totalEaveFt + totalValleyFt
  const iceShieldSqft = iceShieldLinearFt * 3  // 3 ft wide coverage
  const iceShieldRolls = Math.ceil(iceShieldSqft / 75) // 75 sqft per roll typical
  lineItems.push({
    category: 'ice_shield',
    description: 'Ice & Water Shield Membrane',
    unit: 'rolls',
    net_quantity: Math.ceil(iceShieldSqft / 75),
    waste_pct: 5,
    gross_quantity: iceShieldRolls,
    order_quantity: iceShieldRolls,
    order_unit: 'rolls',
    unit_price_cad: 125.00,
    line_total_cad: Math.round(iceShieldRolls * 125.00 * 100) / 100
  })

  // 4. Starter Strip (along eaves + rakes)
  const starterLinearFt = totalEaveFt + totalRakeFt
  const starterBundles = Math.ceil(starterLinearFt / 105) // ~105 linear ft per bundle
  lineItems.push({
    category: 'starter_strip',
    description: 'Starter Strip Shingles',
    unit: 'linear_ft',
    net_quantity: Math.round(starterLinearFt),
    waste_pct: 5,
    gross_quantity: Math.round(starterLinearFt * 1.05),
    order_quantity: starterBundles,
    order_unit: 'bundles',
    unit_price_cad: 35.00,
    line_total_cad: Math.round(starterBundles * 35.00 * 100) / 100
  })

  // 5. Ridge/Hip Cap shingles
  const ridgeHipLinearFt = totalRidgeFt + totalHipFt
  const ridgeCapBundles = Math.ceil(ridgeHipLinearFt / 33) // ~33 linear ft per bundle
  lineItems.push({
    category: 'ridge_cap',
    description: 'Ridge/Hip Cap Shingles',
    unit: 'linear_ft',
    net_quantity: Math.round(ridgeHipLinearFt),
    waste_pct: 5,
    gross_quantity: Math.round(ridgeHipLinearFt * 1.05),
    order_quantity: ridgeCapBundles,
    order_unit: 'bundles',
    unit_price_cad: 55.00,
    line_total_cad: Math.round(ridgeCapBundles * 55.00 * 100) / 100
  })

  // 6. Drip Edge (eaves + rakes)
  const dripEdgeLinearFt = totalEaveFt + totalRakeFt
  const dripEdgePieces = Math.ceil(dripEdgeLinearFt / 10) // 10 ft pieces
  lineItems.push({
    category: 'drip_edge',
    description: 'Aluminum Drip Edge (10 ft sections)',
    unit: 'pieces',
    net_quantity: Math.ceil(dripEdgeLinearFt / 10),
    waste_pct: 5,
    gross_quantity: dripEdgePieces,
    order_quantity: dripEdgePieces,
    order_unit: 'pieces',
    unit_price_cad: 8.50,
    line_total_cad: Math.round(dripEdgePieces * 8.50 * 100) / 100
  })

  // 7. Valley Flashing (if valleys exist)
  if (totalValleyFt > 0) {
    const valleyPieces = Math.ceil(totalValleyFt / 10)
    lineItems.push({
      category: 'valley_metal',
      description: 'Pre-bent Valley Flashing (W-valley, 10 ft)',
      unit: 'pieces',
      net_quantity: Math.ceil(totalValleyFt / 10),
      waste_pct: 10,
      gross_quantity: valleyPieces,
      order_quantity: valleyPieces,
      order_unit: 'pieces',
      unit_price_cad: 22.00,
      line_total_cad: Math.round(valleyPieces * 22.00 * 100) / 100
    })
  }

  // 8. Roofing Nails (1.5 lbs per square for architectural)
  const nailLbs = Math.ceil(grossSquares * 1.5)
  const nailBoxes = Math.ceil(nailLbs / 30) // 30 lb box
  lineItems.push({
    category: 'nails',
    description: '1-1/4" Galvanized Roofing Nails (30 lb box)',
    unit: 'lbs',
    net_quantity: Math.round(grossSquares * 1.5),
    waste_pct: 0,
    gross_quantity: nailLbs,
    order_quantity: nailBoxes,
    order_unit: 'boxes',
    unit_price_cad: 65.00,
    line_total_cad: Math.round(nailBoxes * 65.00 * 100) / 100
  })

  // 9. Ridge Vent (along ridge lines, if applicable)
  if (totalRidgeFt > 0) {
    const ventPieces = Math.ceil(totalRidgeFt / 4) // 4 ft sections
    lineItems.push({
      category: 'ventilation',
      description: 'Ridge Vent (4 ft sections)',
      unit: 'pieces',
      net_quantity: Math.ceil(totalRidgeFt / 4),
      waste_pct: 5,
      gross_quantity: ventPieces,
      order_quantity: ventPieces,
      order_unit: 'pieces',
      unit_price_cad: 18.00,
      line_total_cad: Math.round(ventPieces * 18.00 * 100) / 100
    })
  }

  const totalCost = lineItems.reduce((sum, item) => sum + (item.line_total_cad || 0), 0)

  return {
    net_area_sqft: Math.round(netArea),
    waste_pct: baseWaste,
    gross_area_sqft: Math.round(grossArea),
    gross_squares: Math.round(grossSquares * 10) / 10,
    bundle_count: bundleCount,
    line_items: lineItems,
    total_material_cost_cad: Math.round(totalCost * 100) / 100,
    complexity_factor: complexityFactor,
    complexity_class: complexityClass,
    shingle_type: shingleType
  }
}
