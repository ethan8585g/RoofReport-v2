// ============================================================
// RoofReporterAI — Roof Measurement Engine v2.0
// TypeScript port of the Reuse Canada Python measurement engine.
//
// Processes GPS coordinate points traced by a roofer on aerial
// imagery to generate precise, installer-ready roof measurements.
//
// INPUT:  Trace JSON from customer-order.js tracing UI
// OUTPUT: Full measurement report — areas, lengths, squares, materials
// ============================================================

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS_M    = 6_371_000       // metres
const M_TO_FT           = 3.28084         // metres -> feet
const M2_TO_FT2         = 10.7639         // m^2 -> ft^2
const SQFT_PER_SQUARE   = 100             // 1 roofing square = 100 sq ft
const BUNDLES_PER_SQ    = 3               // standard architectural shingles
const SQ_PER_UNDERLAY   = 4               // 1 roll underlayment ~ 4 squares
const LF_PER_RIDGE_BUNDLE = 35            // ridge-cap linear feet per bundle
const ICE_SHIELD_WIDTH_FT = 3.0           // ice & water shield width up from eave
const NAIL_LBS_PER_SQ   = 2.5            // nails per square

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TracePt {
  lat: number
  lng: number
  elevation?: number | null
}

export interface TraceLine {
  id?: string
  pitch?: number | null   // rise:12 override
  pts: TracePt[]
}

export interface TraceFace {
  face_id: string
  poly: TracePt[]
  pitch: number           // rise:12
  label?: string
}

/** Input payload from the RoofReporterAI tracing UI */
export interface TracePayload {
  address?: string
  homeowner?: string
  order_id?: string
  default_pitch?: number       // rise:12 (e.g. 5.0)
  complexity?: 'simple' | 'medium' | 'complex'
  include_waste?: boolean

  eaves_outline: TracePt[]     // ordered polygon points
  ridges?: TraceLine[]
  hips?: TraceLine[]
  valleys?: TraceLine[]
  rakes?: TraceLine[]
  faces?: TraceFace[]
}

export interface EaveEdge {
  edge_num: number
  from_pt: number
  to_pt: number
  length_ft: number
  bearing_deg: number
}

export interface LineDetail {
  id: string
  type: string
  horiz_length_ft: number
  sloped_length_ft: number
  num_pts: number
}

export interface FaceDetail {
  face_id: string
  pitch_rise: number
  pitch_label: string
  pitch_angle_deg: number
  slope_factor: number
  projected_area_ft2: number
  sloped_area_ft2: number
  squares: number
}

export interface TraceMaterialEstimate {
  shingles_squares_net: number
  shingles_squares_gross: number
  shingles_bundles: number
  underlayment_rolls: number
  ice_water_shield_sqft: number
  ice_water_shield_rolls_2sq: number
  ridge_cap_lf: number
  ridge_cap_bundles: number
  starter_strip_lf: number
  drip_edge_eave_lf: number
  drip_edge_rake_lf: number
  drip_edge_total_lf: number
  valley_flashing_lf: number
  roofing_nails_lbs: number
  caulk_tubes: number
}

export interface TraceReport {
  report_meta: {
    address: string
    homeowner: string
    order_id: string
    generated: string
    engine_version: string
    powered_by: string
  }
  key_measurements: {
    total_roof_area_sloped_ft2: number
    total_projected_footprint_ft2: number
    total_squares_net: number
    total_squares_gross_w_waste: number
    waste_factor_pct: number
    num_roof_faces: number
    num_eave_points: number
    num_ridges: number
    num_hips: number
    num_valleys: number
    num_rakes: number
    dominant_pitch_label: string
    dominant_pitch_angle_deg: number
  }
  linear_measurements: {
    eaves_total_ft: number
    ridges_total_ft: number
    hips_total_ft: number
    valleys_total_ft: number
    rakes_total_ft: number
    perimeter_eave_rake_ft: number
    hip_plus_ridge_ft: number
  }
  eave_edge_breakdown: EaveEdge[]
  ridge_details: LineDetail[]
  hip_details: LineDetail[]
  valley_details: LineDetail[]
  rake_details: LineDetail[]
  face_details: FaceDetail[]
  materials_estimate: TraceMaterialEstimate
  advisory_notes: string[]
}

// ═══════════════════════════════════════════════════════════════
// GEODESIC GEOMETRY PRIMITIVES
// ═══════════════════════════════════════════════════════════════

/** Great-circle distance between two GPS points -> FEET. Accurate < 0.1 ft for roof-scale. */
function haversineFt(a: TracePt, b: TracePt): number {
  const phi1 = a.lat * Math.PI / 180
  const phi2 = b.lat * Math.PI / 180
  const dPhi = (b.lat - a.lat) * Math.PI / 180
  const dLam = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)) * M_TO_FT
}

/** Sum of consecutive Haversine distances along a polyline -> feet. */
function polylineLengthFt(pts: TracePt[]): number {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineFt(pts[i], pts[i + 1])
  }
  return total
}

/**
 * Horizontal (projected) area of a GPS polygon -> sq ft.
 * Converts to local flat-Earth metres, then applies Shoelace theorem.
 * Accurate to < 0.5% for any residential roof footprint.
 */
function polygonProjectedAreaFt2(pts: TracePt[]): number {
  if (pts.length < 3) return 0
  const o = pts[0]
  const cosLat = Math.cos(o.lat * Math.PI / 180)

  const coords = pts.map(p => ({
    x: (p.lng - o.lng) * Math.PI / 180 * EARTH_RADIUS_M * cosLat,
    y: (p.lat - o.lat) * Math.PI / 180 * EARTH_RADIUS_M
  }))

  let area = 0
  const n = coords.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += coords[i].x * coords[j].y
    area -= coords[j].x * coords[i].y
  }
  return Math.abs(area) / 2 * M2_TO_FT2
}

/** Derive rise:12 pitch from two GPS points with known elevation. */
function pitchFromElevation(low: TracePt, high: TracePt, runFt?: number): number | null {
  if (low.elevation == null || high.elevation == null) return null
  const riseFt = Math.abs(high.elevation - low.elevation) * M_TO_FT
  const run = runFt ?? haversineFt(low, high)
  if (run < 0.1) return null
  return (riseFt / run) * 12
}

// ═══════════════════════════════════════════════════════════════
// PITCH / SLOPE MATHS
// ═══════════════════════════════════════════════════════════════

/** slope_factor = sqrt(rise^2 + 12^2) / 12. Converts projected -> sloped. */
function slopeFactor(rise: number): number {
  return Math.sqrt(rise * rise + 144) / 12
}

/** Hip/valley rafter slope factor (diagonal at 45-degree plan angle). */
function hipSlopeFactor(rise: number): number {
  return Math.sqrt(rise * rise + 288) / Math.sqrt(288)
}

/** Rise:12 -> angle in degrees. */
function pitchAngleDeg(rise: number): number {
  return Math.atan(rise / 12) * 180 / Math.PI
}

/** Projected area -> actual sloped surface area (sq ft). */
function slopedFromProjected(projFt2: number, rise: number): number {
  return projFt2 * slopeFactor(rise)
}

// ═══════════════════════════════════════════════════════════════
// WASTE & MATERIAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Recommended shingle waste % based on pitch + complexity. Returns fraction (0.15 = 15%). */
function wastePct(rise: number, complexity: string = 'medium'): number {
  const bases: Record<string, number> = { simple: 0.10, medium: 0.15, complex: 0.20 }
  let base = bases[complexity] ?? 0.15
  if (rise >= 9) base += 0.05
  else if (rise >= 7) base += 0.02
  return base
}

/** Full material take-off for standard architectural shingle re-roof. */
function materialsEstimate(
  netSquares: number, wasteFrac: number,
  eaveFt: number, ridgeFt: number, hipFt: number, valleyFt: number, rakeFt: number
): TraceMaterialEstimate {
  const gross = netSquares * (1 + wasteFrac)
  return {
    shingles_squares_net:       round(netSquares, 2),
    shingles_squares_gross:     round(gross, 2),
    shingles_bundles:           Math.ceil(gross * BUNDLES_PER_SQ),
    underlayment_rolls:         Math.ceil(gross / SQ_PER_UNDERLAY),
    ice_water_shield_sqft:      round(eaveFt * ICE_SHIELD_WIDTH_FT, 1),
    ice_water_shield_rolls_2sq: Math.ceil((eaveFt * ICE_SHIELD_WIDTH_FT) / 200),
    ridge_cap_lf:               round(ridgeFt + hipFt, 1),
    ridge_cap_bundles:          Math.ceil((ridgeFt + hipFt) / LF_PER_RIDGE_BUNDLE),
    starter_strip_lf:           round(eaveFt + rakeFt, 1),
    drip_edge_eave_lf:          round(eaveFt, 1),
    drip_edge_rake_lf:          round(rakeFt, 1),
    drip_edge_total_lf:         round(eaveFt + rakeFt, 1),
    valley_flashing_lf:         round(valleyFt * 1.10, 1),  // +10% overlap
    roofing_nails_lbs:          Math.ceil(gross * NAIL_LBS_PER_SQ),
    caulk_tubes:                Math.max(1, Math.ceil(gross / 5)),
  }
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENGINE CLASS
// ═══════════════════════════════════════════════════════════════

export class RoofMeasurementEngine {
  private address: string
  private homeowner: string
  private orderId: string
  private defPitch: number       // rise:12
  private complexity: string
  private incWaste: boolean
  private timestamp: string

  private eavesPoly: TracePt[]
  private ridges: TraceLine[]
  private hips: TraceLine[]
  private valleys: TraceLine[]
  private rakes: TraceLine[]
  private faces: TraceFace[]

  constructor(payload: TracePayload) {
    this.address    = payload.address || 'Unknown Address'
    this.homeowner  = payload.homeowner || 'Unknown'
    this.orderId    = payload.order_id || ''
    this.defPitch   = payload.default_pitch ?? 5.0
    this.complexity = payload.complexity || 'medium'
    this.incWaste   = payload.include_waste !== false
    this.timestamp  = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

    // Parse geometry
    this.eavesPoly = (payload.eaves_outline || []).map(p => ({
      lat: p.lat, lng: p.lng, elevation: p.elevation ?? null
    }))
    this.ridges  = this.parseLines(payload.ridges || [])
    this.hips    = this.parseLines(payload.hips || [])
    this.valleys = this.parseLines(payload.valleys || [])
    this.rakes   = this.parseLines(payload.rakes || [])
    this.faces   = this.parseFaces(payload.faces || [])

    // Auto-close eaves polygon if not already closed
    if (this.eavesPoly.length >= 3) {
      const first = this.eavesPoly[0]
      const last  = this.eavesPoly[this.eavesPoly.length - 1]
      if (first.lat !== last.lat || first.lng !== last.lng) {
        this.eavesPoly.push({ ...first })
      }
    }
  }

  private parseLines(raw: any[]): TraceLine[] {
    return raw.map(seg => ({
      id:    seg.id || '',
      pitch: seg.pitch != null ? Number(seg.pitch) : null,
      pts:   (seg.pts || []).map((p: any) => ({
        lat: Number(p.lat), lng: Number(p.lng),
        elevation: p.elevation != null ? Number(p.elevation) : null
      }))
    }))
  }

  private parseFaces(raw: any[]): TraceFace[] {
    return raw.map(f => ({
      face_id: f.face_id || 'face',
      poly: (f.poly || []).map((p: any) => ({
        lat: Number(p.lat), lng: Number(p.lng),
        elevation: p.elevation != null ? Number(p.elevation) : null
      })),
      pitch: Number(f.pitch ?? this.defPitch),
      label: f.label || 'face'
    }))
  }

  // ── Segment length helpers ──────────────────────────────────

  private segLength(seg: TraceLine): number {
    return polylineLengthFt(seg.pts)
  }

  private segSlopedLength(seg: TraceLine, hipMode: boolean = false): number {
    const horiz = polylineLengthFt(seg.pts)
    let elevPitch: number | null = null
    if (seg.pts.length >= 2) {
      elevPitch = pitchFromElevation(seg.pts[0], seg.pts[seg.pts.length - 1], horiz)
    }
    const rise = elevPitch ?? seg.pitch ?? this.defPitch
    const sf = hipMode ? hipSlopeFactor(rise) : slopeFactor(rise)
    return horiz * sf
  }

  // ── Eave edge breakdown ──────────────────────────────────────

  eaveEdges(): EaveEdge[] {
    const edges: EaveEdge[] = []
    const pts = this.eavesPoly
    const n = pts.length - 1  // last pt == first (closed)
    if (n < 1) return edges
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1]
      const length = haversineFt(a, b)
      const dLng = b.lng - a.lng
      const dLat = b.lat - a.lat
      const bearing = ((Math.atan2(dLng, dLat) * 180 / Math.PI) % 360 + 360) % 360
      edges.push({
        edge_num:    i + 1,
        from_pt:     i + 1,
        to_pt:       (i % n) + 2,
        length_ft:   round(length, 2),
        bearing_deg: round(bearing, 1),
      })
    }
    return edges
  }

  // ── Face area calculation ────────────────────────────────────

  faceAreas(): FaceDetail[] {
    const results: FaceDetail[] = []

    if (this.faces.length > 0) {
      // STRATEGY A: explicit face polygons
      for (const face of this.faces) {
        const proj = polygonProjectedAreaFt2(face.poly)
        const sloped = slopedFromProjected(proj, face.pitch)
        results.push({
          face_id:            face.face_id,
          pitch_rise:         face.pitch,
          pitch_label:        `${face.pitch}:12`,
          pitch_angle_deg:    round(pitchAngleDeg(face.pitch), 1),
          slope_factor:       round(slopeFactor(face.pitch), 4),
          projected_area_ft2: round(proj, 1),
          sloped_area_ft2:    round(sloped, 1),
          squares:            round(sloped / SQFT_PER_SQUARE, 3),
        })
      }
    } else if (this.eavesPoly.length >= 4) {
      const totalProj = polygonProjectedAreaFt2(this.eavesPoly)

      if (this.ridges.length > 0) {
        // STRATEGY B: partition by ridge segments
        const numFaces = this.ridges.length + 1
        const faceProj = totalProj / numFaces
        for (let i = 0; i < this.ridges.length; i++) {
          const ridge = this.ridges[i]
          const rise = ridge.pitch ?? this.defPitch
          const sloped = slopedFromProjected(faceProj, rise)
          results.push({
            face_id:            ridge.id || `face_${i + 1}`,
            pitch_rise:         rise,
            pitch_label:        `${rise}:12`,
            pitch_angle_deg:    round(pitchAngleDeg(rise), 1),
            slope_factor:       round(slopeFactor(rise), 4),
            projected_area_ft2: round(faceProj, 1),
            sloped_area_ft2:    round(sloped, 1),
            squares:            round(sloped / SQFT_PER_SQUARE, 3),
          })
        }
        // Add one extra face for the last partition
        const lastRise = this.ridges[this.ridges.length - 1].pitch ?? this.defPitch
        const lastSloped = slopedFromProjected(faceProj, lastRise)
        results.push({
          face_id:            `face_${this.ridges.length + 1}`,
          pitch_rise:         lastRise,
          pitch_label:        `${lastRise}:12`,
          pitch_angle_deg:    round(pitchAngleDeg(lastRise), 1),
          slope_factor:       round(slopeFactor(lastRise), 4),
          projected_area_ft2: round(faceProj, 1),
          sloped_area_ft2:    round(lastSloped, 1),
          squares:            round(lastSloped / SQFT_PER_SQUARE, 3),
        })
      } else {
        // STRATEGY C: single face fallback
        const rise = this.defPitch
        const sloped = slopedFromProjected(totalProj, rise)
        results.push({
          face_id:            'total_roof',
          pitch_rise:         rise,
          pitch_label:        `${rise}:12`,
          pitch_angle_deg:    round(pitchAngleDeg(rise), 1),
          slope_factor:       round(slopeFactor(rise), 4),
          projected_area_ft2: round(totalProj, 1),
          sloped_area_ft2:    round(sloped, 1),
          squares:            round(sloped / SQFT_PER_SQUARE, 3),
        })
      }
    }

    return results
  }

  // ── Line detail breakdown ────────────────────────────────────

  lineDetails(segs: TraceLine[], kind: string, hipMode: boolean = false): LineDetail[] {
    return segs.map((seg, i) => ({
      id:               seg.id || `${kind}_${i + 1}`,
      type:             kind,
      horiz_length_ft:  round(this.segLength(seg), 2),
      sloped_length_ft: round(this.segSlopedLength(seg, hipMode), 2),
      num_pts:          seg.pts.length,
    }))
  }

  // ═══════════════════════════════════════════════════════════════
  // FULL CALCULATION RUN
  // ═══════════════════════════════════════════════════════════════

  run(): TraceReport {
    // 1. Eave edge breakdown
    const edges = this.eaveEdges()
    const totalEaveFt = edges.reduce((s, e) => s + e.length_ft, 0)

    // 2. Linear measurements
    const ridgeSegs  = this.lineDetails(this.ridges,  'ridge',  false)
    const hipSegs    = this.lineDetails(this.hips,    'hip',    true)
    const valleySegs = this.lineDetails(this.valleys, 'valley', true)
    const rakeSegs   = this.lineDetails(this.rakes,   'rake',   false)

    const totalRidgeFt  = ridgeSegs.reduce((s, seg) => s + seg.sloped_length_ft, 0)
    const totalHipFt    = hipSegs.reduce((s, seg) => s + seg.sloped_length_ft, 0)
    const totalValleyFt = valleySegs.reduce((s, seg) => s + seg.sloped_length_ft, 0)
    const totalRakeFt   = rakeSegs.reduce((s, seg) => s + seg.sloped_length_ft, 0)

    // 3. Face areas
    const facesData   = this.faceAreas()
    const totalSloped = facesData.reduce((s, f) => s + f.sloped_area_ft2, 0)
    const totalProj   = facesData.reduce((s, f) => s + f.projected_area_ft2, 0)
    const netSquares  = totalSloped / SQFT_PER_SQUARE

    // 4. Dominant pitch
    const allPitches = facesData.map(f => f.pitch_rise)
    let domPitch = this.defPitch
    if (allPitches.length > 0) {
      // Most frequent pitch value
      const freq = new Map<number, number>()
      allPitches.forEach(p => freq.set(p, (freq.get(p) || 0) + 1))
      let maxCount = 0
      freq.forEach((count, pitch) => {
        if (count > maxCount) { maxCount = count; domPitch = pitch }
      })
    }

    // 5. Waste & gross squares
    const wFrac = this.incWaste ? wastePct(domPitch, this.complexity) : 0
    const grossSquares = netSquares * (1 + wFrac)

    // 6. Materials
    const mat = materialsEstimate(
      netSquares, wFrac,
      totalEaveFt, totalRidgeFt, totalHipFt, totalValleyFt, totalRakeFt
    )

    // 7. Perimeter
    const perimeterFt = totalEaveFt + totalRakeFt

    // 8. Advisory notes
    const notes: string[] = []
    if (domPitch >= 9)
      notes.push('STEEP PITCH >= 9:12 - Steep-slope labour & safety gear required.')
    if (domPitch < 4)
      notes.push('LOW SLOPE < 4:12 - Verify manufacturer min-pitch. Extra underlayment layers recommended.')
    if (totalValleyFt > 0)
      notes.push(`Valleys present (${round(totalValleyFt, 1)} ft) - Recommend closed-cut or self-adhered valley install.`)
    if (totalHipFt > 0)
      notes.push(`Hip roof confirmed (${round(totalHipFt, 1)} ft total hip length).`)
    if (this.eavesPoly.length > 10)
      notes.push('Complex perimeter (>10 eave points) - Allow extra cut waste.')

    // 9. Assemble report
    return {
      report_meta: {
        address:        this.address,
        homeowner:      this.homeowner,
        order_id:       this.orderId,
        generated:      this.timestamp,
        engine_version: 'RoofMeasurementEngine v2.0',
        powered_by:     'Reuse Canada / RoofReporterAI',
      },
      key_measurements: {
        total_roof_area_sloped_ft2:    round(totalSloped, 1),
        total_projected_footprint_ft2: round(totalProj, 1),
        total_squares_net:             round(netSquares, 2),
        total_squares_gross_w_waste:   round(grossSquares, 2),
        waste_factor_pct:              round(wFrac * 100, 1),
        num_roof_faces:                facesData.length,
        num_eave_points:               Math.max(0, this.eavesPoly.length - 1),
        num_ridges:                    this.ridges.length,
        num_hips:                      this.hips.length,
        num_valleys:                   this.valleys.length,
        num_rakes:                     this.rakes.length,
        dominant_pitch_label:          `${domPitch}:12`,
        dominant_pitch_angle_deg:      round(pitchAngleDeg(domPitch), 1),
      },
      linear_measurements: {
        eaves_total_ft:         round(totalEaveFt, 1),
        ridges_total_ft:        round(totalRidgeFt, 1),
        hips_total_ft:          round(totalHipFt, 1),
        valleys_total_ft:       round(totalValleyFt, 1),
        rakes_total_ft:         round(totalRakeFt, 1),
        perimeter_eave_rake_ft: round(perimeterFt, 1),
        hip_plus_ridge_ft:      round(totalHipFt + totalRidgeFt, 1),
      },
      eave_edge_breakdown: edges,
      ridge_details:       ridgeSegs,
      hip_details:         hipSegs,
      valley_details:      valleySegs,
      rake_details:        rakeSegs,
      face_details:        facesData,
      materials_estimate:  mat,
      advisory_notes:      notes,
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Convert existing trace UI format to engine payload
// The customer-order.js tracing UI stores data as:
//   { eaves: [{lat,lng},...], ridges: [[{lat,lng},{lat,lng}],...], ... }
// This converts it into the engine's TracePayload format.
// ═══════════════════════════════════════════════════════════════

export function traceUiToEnginePayload(
  traceJson: {
    eaves?: { lat: number; lng: number }[]
    ridges?: { lat: number; lng: number }[][]
    hips?: { lat: number; lng: number }[][]
    valleys?: { lat: number; lng: number }[][]
    traced_at?: string
  },
  order: {
    property_address?: string
    homeowner_name?: string
    order_number?: string
    latitude?: number
    longitude?: number
    price_per_bundle?: number
  },
  defaultPitch: number = 5.0
): TracePayload {
  // Convert eaves array of {lat,lng} to TracePt[]
  const eavesOutline: TracePt[] = (traceJson.eaves || []).map(p => ({
    lat: p.lat, lng: p.lng, elevation: null
  }))

  // Convert ridges array of arrays to TraceLine[]
  const ridges: TraceLine[] = (traceJson.ridges || []).map((line, i) => ({
    id: `ridge_${i + 1}`,
    pitch: null,
    pts: line.map(p => ({ lat: p.lat, lng: p.lng, elevation: null }))
  }))

  // Convert hips
  const hips: TraceLine[] = (traceJson.hips || []).map((line, i) => ({
    id: `hip_${i + 1}`,
    pitch: null,
    pts: line.map(p => ({ lat: p.lat, lng: p.lng, elevation: null }))
  }))

  // Convert valleys
  const valleys: TraceLine[] = (traceJson.valleys || []).map((line, i) => ({
    id: `valley_${i + 1}`,
    pitch: null,
    pts: line.map(p => ({ lat: p.lat, lng: p.lng, elevation: null }))
  }))

  return {
    address:        order.property_address || 'Unknown Address',
    homeowner:      order.homeowner_name || 'Unknown',
    order_id:       order.order_number || '',
    default_pitch:  defaultPitch,
    complexity:     'medium',
    include_waste:  true,
    eaves_outline:  eavesOutline,
    ridges,
    hips,
    valleys,
    rakes:          [],   // rakes not traced in current UI
    faces:          [],   // faces not traced in current UI
  }
}
