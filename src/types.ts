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

  // Square Payment Processing — stored as Cloudflare secrets, accessed server-side only
  SQUARE_ACCESS_TOKEN: string        // Production access token (server-side only)
  SQUARE_APPLICATION_ID: string      // Application ID (safe for frontend — equivalent of Stripe publishable key)
  SQUARE_LOCATION_ID: string         // Square location ID for payment processing

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

  // Square Webhook — verifies webhook signatures
  SQUARE_WEBHOOK_SIGNATURE_KEY: string  // From Square Developer Dashboard > Webhooks
  SQUARE_WEBHOOK_URL: string            // Your webhook notification URL

  // Admin Bootstrap — Used ONLY for initial admin account creation
  // Set these env vars, then remove after first login
  ADMIN_BOOTSTRAP_EMAIL: string
  ADMIN_BOOTSTRAP_PASSWORD: string
  ADMIN_BOOTSTRAP_NAME: string

  // LiveKit — AI Voice Agent platform (Roofer Secretary)
  // Get from: cloud.livekit.io → Project Settings → Keys
  LIVEKIT_API_KEY: string       // e.g. "APIsvVZsCCaboLY"
  LIVEKIT_API_SECRET: string    // The secret paired with the API key
  LIVEKIT_URL: string           // e.g. "wss://roofreporterai-btkwkiwh.livekit.cloud"
  LIVEKIT_SIP_URI: string       // e.g. "sip:xxxxx.sip.livekit.cloud" (from Project Settings)

  // Twilio — SIP trunking + phone number pool for Roofer Secretary
  // Get from: console.twilio.com → Account Info
  TWILIO_ACCOUNT_SID: string    // e.g. "AC..."
  TWILIO_AUTH_TOKEN: string     // Account auth token

  // Cloud Run Custom AI — Your Colab-trained roof analysis model
  // Hosted on: collab-581996238660.europe-west1.run.app
  // Falls back to Gemini when unavailable
  CLOUD_RUN_AI_URL: string         // e.g. "https://collab-581996238660.europe-west1.run.app"
  CLOUD_RUN_AI_TOKEN: string       // Optional: Cloud Run IAM auth token
  CLOUD_RUN_TIMEOUT_MS: string     // Optional: override default 90s timeout

  // OpenAI-compatible API — Rover AI Chatbot
  // Used via GenSpark proxy for AI-powered chat responses
  OPENAI_API_KEY: string        // GenSpark LLM proxy key
  OPENAI_BASE_URL: string       // e.g. "https://www.genspark.ai/api/llm_proxy/v1"

  // Report Enhancement Webhook — Async AI Pipeline
  // Shared secret for webhook authentication between Cloud Run → Cloudflare
  REPORT_WEBHOOK_SECRET: string    // e.g. "whk_ffd6b6fff1f7a681f7bd518c8885789e00a8747d67379454d33e227e86e0fa5e"
  // Google AI Studio / Cloud Run enhancement engine URL
  AI_STUDIO_ENHANCE_URL: string    // e.g. "https://your-cloud-run-service.run.app/enhance"

  // Gemini Enhancement Engine — Dedicated API key from airoofreports GCP project
  // Used to call Gemini 2.5 Pro for post-generation report quality upgrade
  GEMINI_ENHANCE_API_KEY: string   // e.g. "AIzaSy..." — separate from GOOGLE_SOLAR_API_KEY

  // Replicate — AI Image Generation (Virtual Try-On roof visualization)
  // Get from: replicate.com → Account Settings → API Tokens
  REPLICATE_API_KEY: string        // e.g. "r8_..." — used for inpainting model calls

  // Google Analytics 4 — Frontend tracking + Data API for admin analytics
  GA4_MEASUREMENT_ID: string       // e.g. "G-XXXXXXXXXX" — GA4 Measurement ID for gtag.js
  GA4_API_SECRET: string           // Measurement Protocol API secret for server-side events
  GA4_PROPERTY_ID: string          // e.g. "properties/123456789" — for Analytics Data API queries
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
export type EdgeType = 'ridge' | 'hip' | 'valley' | 'eave' | 'rake' | 'gable' | 'flashing' | 'step_flashing' | 'wall_flashing' | 'transition' | 'parapet'

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

  /** Multi-row waste calculation table (0%, 10%, 12%, 15%, 17%, 20%) */
  waste_table: WasteRow[]
}

/** A single row in the multi-row waste calculation table */
export interface WasteRow {
  /** Waste percentage */
  waste_pct: number
  /** Total area at this waste % (sq ft) */
  area_sqft: number
  /** Roofing squares at this waste % */
  squares: number
  /** Bundle count at this waste % (3 bundles per square) */
  bundles: number
  /** Label: 'Measured' for 0%, 'Suggested' for the auto-calculated waste */
  label: string
  /** Whether this is the suggested/auto-selected row */
  is_suggested: boolean
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

  // ---- CUSTOMER PRICING (Section 6 — optional) ----
  /** Price per roofing square (bundle) in CAD, as input by the customer/roofer */
  customer_price_per_bundle?: number | null
  /** Computed: total squares with 15% waste */
  customer_gross_squares?: number
  /** Computed: customer_price_per_bundle × customer_gross_squares */
  customer_total_cost_estimate?: number

  // ---- USER-DRAWN ROOF TRACE (optional — enhances Solar API accuracy) ----
  roof_trace?: {
    eaves: { lat: number; lng: number }[]
    ridges: { lat: number; lng: number }[][]
    hips: { lat: number; lng: number }[][]
    valleys: { lat: number; lng: number }[][]
    traced_at: string
  } | null

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
    /** Base64 BMP data URL: high-res RGB aerial cropped to roof footprint via mask */
    rgb_aerial_url?: string
    /** Base64 BMP data URL: mask overlay visualization (roof pixels highlighted in blue) */
    mask_overlay_url?: string
    /** Base64 BMP data URL: annual flux heatmap (solar exposure per roof pixel) */
    flux_heatmap_url?: string

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

  // ---- SOLAR FLUX ANALYSIS (Annual kWh/m² exposure) ----
  flux_analysis?: {
    mean_kwh_m2: number
    max_kwh_m2: number
    min_kwh_m2: number
    total_annual_kwh: number
    valid_pixels: number
    high_sun_pct: number
    shaded_pct: number
    peak_sun_hours_per_day: number
  } | null

  // ---- RAS YIELD ANALYSIS (RoofReporterAI value-add) ----
  ras_yield?: RASYieldAnalysis

  // ---- SEGMENT EXCLUSION (Property Overlap Control) ----
  /** Indices of segments excluded by the user (0-based, matching roofSegmentStats order).
   *  When segments are excluded, area/material calculations are re-derived from remaining segments.
   *  This is the "kill switch" for merged buildings — users toggle off neighbor's roof sections. */
  excluded_segments?: number[]

  /** True if Google Solar's building bounding box exceeds 60 ft (≈18m) in width or depth.
   *  Indicates the API may have merged two adjacent buildings into one model.
   *  When true, the UI should highlight segments for manual review. */
  property_overlap_flag?: boolean

  /** Human-readable details about why the overlap flag was raised */
  property_overlap_details?: string[]

  // ---- AI-GENERATED IMAGERY (Gemini Image Generation Layer) ----
  /** AI-generated professional report images created from satellite data and measurements.
   *  Generated as a background phase after base report + enhancement complete.
   *  Images are stored as base64 data URLs. */
  ai_generated_imagery?: {
    images: {
      type: string         // e.g., 'annotated_overhead', '3d_perspective', 'condition_visual', 'cover'
      label: string        // Human-readable label
      description: string  // What this image shows
      data_url: string     // base64 data URL (data:image/png;base64,...)
      generated_at: string // ISO timestamp
    }[]
    generation_time_ms: number
    model: string
    generated_at: string
  } | null

  // ---- VISION-BASED INSPECTION (Gemma 3 / Gemini Multimodal "Eyes" Layer) ----
  /** Visual findings from multimodal AI inspection of aerial imagery.
   *  Detects vulnerabilities and obstructions that raw API data misses. */
  vision_findings?: VisionFindings | null

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
// VISION-BASED INSPECTION — Multimodal AI "Eyes" Layer
// ============================================================
// Gemma 3 / Gemini Vision analyzes aerial imagery to detect
// roof vulnerabilities, obstructions, and condition indicators
// that numeric API data alone cannot capture.
//
// The findings feed into:
//   1. Heat Score — CRM lead prioritization (higher = more urgent)
//   2. Report quality notes — flagged for field verification
//   3. Material estimate adjustments — extra flashing, sealant, etc.
// ============================================================

/** Severity of a visual finding */
export type VisionSeverity = 'low' | 'moderate' | 'high' | 'critical'

/** Category of visual finding */
export type VisionCategory = 'vulnerability' | 'obstruction' | 'condition' | 'environmental'

/** A single visual finding detected from aerial imagery */
export interface VisionFinding {
  /** Unique finding ID, e.g. "VF-001" */
  id: string
  /** Category: vulnerability, obstruction, condition, environmental */
  category: VisionCategory
  /** Specific type, e.g. "rusted_flashing", "chimney", "heavy_moss", "tree_overhang" */
  type: string
  /** Human-readable label */
  label: string
  /** Detailed description of the finding */
  description: string
  /** Severity: low, moderate, high, critical */
  severity: VisionSeverity
  /** Confidence 0-100 of this detection */
  confidence: number
  /** Approximate bounding box on satellite image [minX, minY, maxX, maxY] pixel coords (0-640) */
  bounding_box?: number[]
  /** Impact on roofing job: cost, labor, timeline, safety */
  impact: string
  /** Recommended action for the roofer */
  recommendation: string
}

/** Heat Score breakdown — used for CRM lead prioritization */
export interface HeatScore {
  /** Overall heat score 0-100 (higher = more urgent roof job) */
  total: number
  /** Score components that contribute to the total */
  components: {
    /** Age/wear indicators detected visually (0-30) */
    age_wear: number
    /** Structural vulnerabilities: flashing, shingle damage (0-25) */
    structural: number
    /** Environmental threats: moss, tree overhang, debris (0-20) */
    environmental: number
    /** Obstruction complexity: chimneys, skylights, HVAC (0-15) */
    obstruction_complexity: number
    /** Urgency multiplier from critical findings (0-10) */
    urgency_bonus: number
  }
  /** Qualitative classification */
  classification: 'cold' | 'warm' | 'hot' | 'on_fire'
  /** Human-readable summary for CRM display */
  summary: string
}

/** Complete vision inspection result */
export interface VisionFindings {
  /** ISO 8601 timestamp of the inspection */
  inspected_at: string
  /** Model used for inspection */
  model: string
  /** Total number of findings */
  finding_count: number
  /** Array of individual findings */
  findings: VisionFinding[]
  /** CRM Heat Score derived from findings */
  heat_score: HeatScore
  /** Overall roof condition assessment */
  overall_condition: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  /** One-line summary for quick CRM view */
  summary: string
  /** Processing duration in ms */
  duration_ms: number
  /** Source image analyzed */
  source_image: 'satellite_overhead' | 'rgb_geotiff' | 'street_view'
}

// ============================================================
// Runtime utility functions — re-exported from utils/geo-math.ts
// The actual implementations live in utils/geo-math.ts to avoid
// bundler tree-shaking issues with mixed type/runtime exports.
// ============================================================
export {
  degreesToCardinal, pitchToRatio, trueAreaFromFootprint,
  hipValleyFactor, rakeFactor, classifyComplexity,
  computeMaterialEstimate, computeRASYieldAnalysis
} from './utils/geo-math'
