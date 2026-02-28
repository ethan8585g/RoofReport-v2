// ============================================================
// RoofReporterAI - Roofing Measurement Tool
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
  // GOOGLE_VERTEX_API_KEY: Standard Gemini REST API key (AIzaSy... format)
  //   Used with: https://generativelanguage.googleapis.com/v1beta/models/...
  // GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION: For Vertex AI platform calls
  //   Used with: https://aiplatform.googleapis.com/v1/publishers/google/models/...
  // GOOGLE_CLOUD_ACCESS_TOKEN: OAuth2 Bearer token for Vertex AI (from gcloud auth)
  //   Required when using the Vertex AI proxy endpoint
  GOOGLE_VERTEX_API_KEY: string
  GOOGLE_CLOUD_PROJECT: string   // e.g. "helpful-passage-486204-h9"
  GOOGLE_CLOUD_LOCATION: string  // e.g. "global" or "us-central1"
  GOOGLE_CLOUD_ACCESS_TOKEN: string // OAuth2 token from 'gcloud auth print-access-token'
  GCP_SERVICE_ACCOUNT_KEY: string   // Full JSON of GCP service account key file (auto-generates access tokens)

  // Stripe - stored as Cloudflare secrets, accessed server-side only
  STRIPE_SECRET_KEY: string
  STRIPE_PUBLISHABLE_KEY: string  // This one is safe for frontend (it's "publishable")

  // Email delivery
  GMAIL_SENDER_EMAIL: string // The Google Workspace user email to impersonate when sending via Gmail API
  RESEND_API_KEY: string     // Resend.com API key (recommended for personal Gmail users)

  // Gmail OAuth2 — Personal Gmail email delivery (preferred method)
  // Set up at: https://console.cloud.google.com/apis/credentials
  // Create OAuth 2.0 Client ID (Web application), add redirect URI: {domain}/api/auth/gmail/callback
  // Then visit /api/auth/gmail to authorize and obtain refresh token
  GMAIL_CLIENT_ID: string
  GMAIL_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string

  // Google Sign-In for customers
  // Uses the same OAuth 2.0 Client ID as Gmail OAuth2 (or a separate one)
  GOOGLE_OAUTH_CLIENT_ID: string

  // Stripe Webhook Secret — verifies webhook signatures
  STRIPE_WEBHOOK_SECRET: string

  // Admin Bootstrap — Used ONLY for initial admin account creation
  // Set these env vars, then remove after first login
  ADMIN_BOOTSTRAP_EMAIL: string
  ADMIN_BOOTSTRAP_PASSWORD: string
  ADMIN_BOOTSTRAP_NAME: string
}

// ============================================================
// AI MEASUREMENT ENGINE TYPES — Gemini Vision roof geometry
// ============================================================

/** A point in pixel coordinates on the 640x640 satellite image */
export interface MeasurementPoint {
  x: number  // 0-640 pixel coordinate
  y: number  // 0-640 pixel coordinate
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

/** A perimeter vertex — forms the closed outer boundary of the roof */
export interface PerimeterPoint {
  x: number  // 0-640 pixel coordinate
  y: number  // 0-640 pixel coordinate
  /** Edge type from THIS point to the NEXT point in the array */
  edge_to_next: 'EAVE' | 'RAKE' | 'HIP' | 'RIDGE'
}

/** Complete AI measurement analysis result */
export interface AIMeasurementAnalysis {
  /** Outer perimeter polygon of the roof — closed, clockwise, with edge labels per side */
  perimeter: PerimeterPoint[]
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
// RAS (Recycled Asphalt Shingle) YIELD ANALYSIS
// For RoofReporterAI's waste-to-value material recovery operations
// ============================================================

/** Classification of a roof segment for RAS material recovery */
export interface RASSegmentYield {
  segment_name: string
  pitch_degrees: number
  pitch_ratio: string
  area_sqft: number
  /** 'binder_oil' (<=4:12), 'granule' (>6:12), 'mixed' (4:12 to 6:12) */
  recovery_class: 'binder_oil' | 'granule' | 'mixed'
  /** Estimated material yield from this segment */
  estimated_yield: {
    binder_oil_gallons: number
    granules_lbs: number
    fiber_lbs: number
  }
}

/** Complete RAS yield analysis for the entire roof */
export interface RASYieldAnalysis {
  /** Total roof area analyzed */
  total_area_sqft: number
  /** Number of shingle squares on the roof */
  total_squares: number
  /** Weight of shingles (lbs) — ~250 lbs/square for architectural */
  estimated_weight_lbs: number

  /** Segments classified by recovery type */
  segments: RASSegmentYield[]

  /** Aggregate yield estimates */
  total_yield: {
    /** Binder oil from low-pitch segments (gallons) */
    binder_oil_gallons: number
    /** Granule recovery from steep segments (lbs) */
    granules_lbs: number
    /** Fiber content recovery (lbs) */
    fiber_lbs: number
    /** Total recoverable material weight (lbs) */
    total_recoverable_lbs: number
    /** Recovery rate as percentage of input weight */
    recovery_rate_pct: number
  }

  /** Market value estimates (CAD) */
  market_value: {
    binder_oil_cad: number
    granules_cad: number
    fiber_cad: number
    total_cad: number
  }

  /** Optimal processing recommendation */
  processing_recommendation: string

  /** Slope distribution summary */
  slope_distribution: {
    low_pitch_pct: number     // <=4:12 (18.4°) — optimal for binder oil
    medium_pitch_pct: number  // 4:12 to 6:12 — mixed recovery
    high_pitch_pct: number    // >6:12 (26.6°) — optimal for granules
  }
}

// ============================================================
// COMPLETE ROOF MEASUREMENT REPORT — v2.1 (with RAS yield)
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
    /** 640x640 square overhead satellite image for roof measurement (smart zoom based on building size) */
    satellite_overhead_url: string | null
    /** 640x640 wider context satellite image (zoom-2 from overhead) */
    satellite_context_url: string | null
    dsm_url: string | null
    mask_url: string | null
    flux_url: string | null

    // Directional aerial satellite views — offset from center to show each side of roof
    north_url: string | null
    south_url: string | null
    east_url: string | null
    west_url: string | null

    // Quadrant close-ups — max zoom (22) at NW/NE/SW/SE corners for shingle detail
    closeup_nw_url: string | null
    closeup_ne_url: string | null
    closeup_sw_url: string | null
    closeup_se_url: string | null

    // Street View — single front-facing reference for curb appeal / front elevation
    street_view_url: string | null

    // Medium-zoom bridge view (between overhead and context)
    satellite_medium_url: string | null
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

  // ---- AI GEOMETRY OVERLAY — Gemini Vision facet polygons for satellite image overlay ----
  ai_geometry?: AIMeasurementAnalysis | null

  // ---- RAS YIELD ANALYSIS (RoofReporterAI value-add) ----
  ras_yield?: RASYieldAnalysis

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
    /** Research-validated accuracy: 98.77% with HIGH quality imagery */
    accuracy_benchmark?: string
    /** Cost per query: ~$0.075 (vs $50-200 EagleView) */
    cost_per_query?: string
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

// ============================================================
// RAS YIELD ANALYSIS — RoofReporterAI's Waste-to-Value Engine
// ============================================================
// Computes material recovery potential from roof tear-off shingles.
// Based on slope classification from deep research:
//   - Low pitch (<=4:12 / 18.4°): Optimal binder oil extraction
//   - Medium pitch (4:12 to 6:12): Mixed recovery — oil + granules
//   - High pitch (>6:12 / 26.6°): Optimal granule recovery
//
// Yield rates validated against industry data:
//   - Binder oil: ~25-35% of shingle weight (low pitch = better extraction)
//   - Granules: ~35-40% of shingle weight (high pitch = cleaner granules)
//   - Fiber: ~5-8% of shingle weight
//   - Architectural shingles: ~250 lbs/square, 3-tab: ~230 lbs/square
// ============================================================
export function computeRASYieldAnalysis(
  segments: RoofSegment[],
  trueAreaSqft: number,
  shingleType: string = 'architectural'
): RASYieldAnalysis {
  const totalSquares = trueAreaSqft / 100
  const weightPerSquare = shingleType === 'architectural' ? 250 : 230 // lbs
  const totalWeight = totalSquares * weightPerSquare

  // Classify each segment by pitch for recovery optimization
  const rasSegments: RASSegmentYield[] = segments.map(seg => {
    const pitchRise = 12 * Math.tan(seg.pitch_degrees * Math.PI / 180)
    let recoveryClass: 'binder_oil' | 'granule' | 'mixed'

    // Low pitch (<=4:12 = <=18.4°): Best for binder oil extraction
    // High pitch (>6:12 = >26.6°): Best for granule recovery
    if (pitchRise <= 4) {
      recoveryClass = 'binder_oil'
    } else if (pitchRise > 6) {
      recoveryClass = 'granule'
    } else {
      recoveryClass = 'mixed'
    }

    const segSquares = seg.true_area_sqft / 100
    const segWeight = segSquares * weightPerSquare

    // Yield rates vary by pitch/recovery class
    const binderOilRate = recoveryClass === 'binder_oil' ? 0.32 :
                          recoveryClass === 'mixed' ? 0.28 : 0.25
    const granuleRate = recoveryClass === 'granule' ? 0.40 :
                        recoveryClass === 'mixed' ? 0.36 : 0.33
    const fiberRate = recoveryClass === 'binder_oil' ? 0.08 :
                      recoveryClass === 'mixed' ? 0.07 : 0.06

    // Binder oil: ~8 lbs/gallon
    const binderOilLbs = segWeight * binderOilRate
    const binderOilGallons = binderOilLbs / 8

    return {
      segment_name: seg.name,
      pitch_degrees: seg.pitch_degrees,
      pitch_ratio: seg.pitch_ratio,
      area_sqft: seg.true_area_sqft,
      recovery_class: recoveryClass,
      estimated_yield: {
        binder_oil_gallons: Math.round(binderOilGallons * 10) / 10,
        granules_lbs: Math.round(segWeight * granuleRate),
        fiber_lbs: Math.round(segWeight * fiberRate)
      }
    }
  })

  // Aggregate totals
  const totalBinderOil = rasSegments.reduce((s, seg) => s + seg.estimated_yield.binder_oil_gallons, 0)
  const totalGranules = rasSegments.reduce((s, seg) => s + seg.estimated_yield.granules_lbs, 0)
  const totalFiber = rasSegments.reduce((s, seg) => s + seg.estimated_yield.fiber_lbs, 0)
  const totalRecoverable = (totalBinderOil * 8) + totalGranules + totalFiber // convert oil back to lbs

  // Market values (CAD, Alberta pricing)
  const oilPricePerGallon = 3.50       // RAS binder oil ~$3.50/gallon
  const granulePricePerLb = 0.08       // Granules ~$0.08/lb
  const fiberPricePerLb = 0.12         // Fiber ~$0.12/lb

  const oilValue = totalBinderOil * oilPricePerGallon
  const granuleValue = totalGranules * granulePricePerLb
  const fiberValue = totalFiber * fiberPricePerLb

  // Slope distribution
  const lowPitchArea = rasSegments.filter(s => s.recovery_class === 'binder_oil').reduce((sum, s) => sum + s.area_sqft, 0)
  const medPitchArea = rasSegments.filter(s => s.recovery_class === 'mixed').reduce((sum, s) => sum + s.area_sqft, 0)
  const highPitchArea = rasSegments.filter(s => s.recovery_class === 'granule').reduce((sum, s) => sum + s.area_sqft, 0)
  const totalArea = lowPitchArea + medPitchArea + highPitchArea || 1

  // Processing recommendation based on dominant slope
  let recommendation: string
  const lowPitchPct = (lowPitchArea / totalArea) * 100
  const highPitchPct = (highPitchArea / totalArea) * 100

  if (lowPitchPct > 60) {
    recommendation = 'Prioritize binder oil extraction — low-pitch dominant roof. Route to Rotto Chopper for optimal oil recovery. Ideal for cold patch and sealant production.'
  } else if (highPitchPct > 60) {
    recommendation = 'Prioritize granule separation — steep-pitch dominant roof. Run through screener line for clean granule recovery. High-grade output for resale.'
  } else {
    recommendation = 'Mixed recovery stream — process through full RAS line. Extract binder oil first, then screen for granules and fiber. Blend output suitable for cold patch formulation.'
  }

  return {
    total_area_sqft: Math.round(trueAreaSqft),
    total_squares: Math.round(totalSquares * 10) / 10,
    estimated_weight_lbs: Math.round(totalWeight),
    segments: rasSegments,
    total_yield: {
      binder_oil_gallons: Math.round(totalBinderOil * 10) / 10,
      granules_lbs: Math.round(totalGranules),
      fiber_lbs: Math.round(totalFiber),
      total_recoverable_lbs: Math.round(totalRecoverable),
      recovery_rate_pct: Math.round((totalRecoverable / (totalWeight || 1)) * 1000) / 10
    },
    market_value: {
      binder_oil_cad: Math.round(oilValue * 100) / 100,
      granules_cad: Math.round(granuleValue * 100) / 100,
      fiber_cad: Math.round(fiberValue * 100) / 100,
      total_cad: Math.round((oilValue + granuleValue + fiberValue) * 100) / 100
    },
    processing_recommendation: recommendation,
    slope_distribution: {
      low_pitch_pct: Math.round(lowPitchPct * 10) / 10,
      medium_pitch_pct: Math.round(((medPitchArea / totalArea) * 100) * 10) / 10,
      high_pitch_pct: Math.round(highPitchPct * 10) / 10
    }
  }
}
