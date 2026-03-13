// ============================================================
// RoofReporterAI — Geospatial & Roof Math Utilities
// Pure geometric/pixel computation functions + roofing math.
// No external dependencies — fully testable.
// ============================================================

import type {
  AIMeasurementAnalysis, RoofSegment, EdgeMeasurement,
  MaterialEstimate, MaterialLineItem, WasteRow,
  RASYieldAnalysis, RASSegmentYield
} from '../types'

/** Convert decimal feet to feet-inches string (e.g., 12.5 → "12' 6\"") */
export function feetToFeetInches(ft: number): string {
  const wholeFeet = Math.floor(ft)
  const inches = Math.round((ft - wholeFeet) * 12)
  if (inches === 0 || inches === 12) {
    return `${inches === 12 ? wholeFeet + 1 : wholeFeet}'`
  }
  return `${wholeFeet}' ${inches}"`
}

/**
 * Convert lat/lng to pixel coordinates on a Google Maps Static image.
 * Uses Web Mercator projection (EPSG:3857).
 */
export function latLngToPixels(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  zoom: number,
  imgWidth: number = 640, imgHeight: number = 640
): { x: number; y: number } {
  const toWorld = (latDeg: number, lngDeg: number) => {
    const latRad = (latDeg * Math.PI) / 180
    return {
      wx: ((lngDeg + 180) / 360) * 256,
      wy: (0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI)) * 256
    }
  }
  const scale = Math.pow(2, zoom)
  const center = toWorld(centerLat, centerLng)
  const point = toWorld(lat, lng)
  const centerPx = { x: center.wx * scale, y: center.wy * scale }
  const pointPx = { x: point.wx * scale, y: point.wy * scale }
  return {
    x: imgWidth / 2 + (pointPx.x - centerPx.x),
    y: imgHeight / 2 + (pointPx.y - centerPx.y)
  }
}

/** Pixel distance between two points on the 640px canvas */
export function pixelDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

/**
 * Shoelace formula: compute the absolute area of a polygon from its vertices.
 * Returns area in pixel² (on the 640x640 coordinate space).
 */
export function polygonPixelArea(points: { x: number; y: number }[]): number {
  if (!points || points.length < 3) return 0
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

/**
 * Compute scale factor: sqft per pixel² on the 640x640 satellite image.
 * Uses AI geometry facet areas or perimeter polygon, falls back to zoom-based estimate.
 */
export function computePixelToSqftScale(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  totalFootprintSqft: number,
  latitude?: number | null,
  zoom?: number
): number {
  if (!totalFootprintSqft || totalFootprintSqft <= 0) return 0

  if (aiGeometry?.facets && aiGeometry.facets.length >= 2) {
    const totalFacetPx = aiGeometry.facets.reduce((sum, f) => {
      return sum + polygonPixelArea(f.points || [])
    }, 0)
    if (totalFacetPx > 100) return totalFootprintSqft / totalFacetPx
  }

  if (aiGeometry?.perimeter && aiGeometry.perimeter.length >= 3) {
    const perimPx = polygonPixelArea(aiGeometry.perimeter)
    if (perimPx > 100) return totalFootprintSqft / perimPx
  }

  if (latitude && zoom) {
    const metersPerPx640 = (156543.03392 * Math.cos((latitude || 53) * Math.PI / 180)) / Math.pow(2, zoom) * 2
    const sqftPerPx2 = (metersPerPx640 * metersPerPx640) * 10.7639
    return sqftPerPx2
  }

  return 0
}

/** Parse pitch from AI facet's pitch string (e.g. "25 deg", "6/12", "22.5°") */
export function parseFacetPitch(pitchStr: string | undefined, defaultDeg: number): number {
  if (!pitchStr) return defaultDeg
  const ratioMatch = pitchStr.match(/(\d+(?:\.\d+)?)\s*\/\s*12/)
  if (ratioMatch) return Math.atan(parseFloat(ratioMatch[1]) / 12) * 180 / Math.PI
  const degMatch = pitchStr.match(/(\d+(?:\.\d+)?)\s*(?:deg|°)/)
  if (degMatch) return parseFloat(degMatch[1])
  const num = parseFloat(pitchStr)
  if (!isNaN(num) && num > 0 && num < 90) return num
  return defaultDeg
}

/** Parse azimuth from AI facet's azimuth string (e.g. "180 deg", "South", "SW") */
export function parseFacetAzimuth(azStr: string | undefined): number {
  if (!azStr) return 180
  const degMatch = azStr.match(/(\d+(?:\.\d+)?)\s*(?:deg|°)?/)
  if (degMatch) return parseFloat(degMatch[1])
  const cardinals: Record<string, number> = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5,
    'SE': 135, 'SSE': 157.5, 'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
    'NORTH': 0, 'SOUTH': 180, 'EAST': 90, 'WEST': 270
  }
  const upper = azStr.trim().toUpperCase()
  if (cardinals[upper] !== undefined) return cardinals[upper]
  return 180
}

/** Calculate rotation angle for SVG label along a line (never upside-down) */
export function lineAngleDeg(x1: number, y1: number, x2: number, y2: number): number {
  let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180
  return angle
}

/**
 * Smart edge footage redistribution.
 * Handles RAKE↔HIP mismatch where Gemini labels hip-roof diagonal edges as RAKE.
 */
export function smartEdgeFootage(
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number }
): Record<string, number> {
  const result: Record<string, number> = {
    'EAVE': edgeSummary.total_eave_ft,
    'RAKE': edgeSummary.total_rake_ft,
    'HIP': edgeSummary.total_hip_ft,
    'RIDGE': edgeSummary.total_ridge_ft,
    'VALLEY': edgeSummary.total_valley_ft,
  }

  if (result['RAKE'] === 0 && result['HIP'] > 0) {
    result['RAKE'] = result['HIP']
  } else if (result['HIP'] === 0 && result['RAKE'] > 0) {
    result['HIP'] = result['RAKE']
  }

  const totalPerim = result['EAVE'] + result['RAKE'] + result['HIP']
  if (totalPerim === 0) {
    const totalLinear = edgeSummary.total_eave_ft + edgeSummary.total_rake_ft + edgeSummary.total_hip_ft + edgeSummary.total_ridge_ft + edgeSummary.total_valley_ft
    result['EAVE'] = totalLinear * 0.5
    result['RAKE'] = totalLinear * 0.25
    result['HIP'] = totalLinear * 0.25
  }

  return result
}

/**
 * Edge type color map for SVG diagrams — Industry Standard
 * Red = Ridge, Green = Eave, Blue = Valley, Orange = Hip, Purple = Rake
 * Matches EagleView / RoofScope / GAF conventions
 */
export const EDGE_COLORS: Record<string, string> = {
  'RIDGE': '#DC2626',   // Red — ridge lines
  'HIP':   '#EA580C',   // Orange — hip edges
  'VALLEY':'#2563EB',   // Blue — valley lines
  'EAVE':  '#16A34A',   // Green — eave / gutterline / drip edge
  'RAKE':  '#7C3AED',   // Purple — rake / gable edges
  'STEP_FLASHING': '#F59E0B', // Amber — step flashing
  'WALL_FLASHING': '#8B5CF6', // Violet — wall flashing
  'TRANSITION': '#0891B2',    // Cyan — slope change
  'PARAPET': '#78716C',       // Stone — parapet
}

/** Edge type stroke widths */
export const EDGE_WIDTHS: Record<string, number> = {
  'RIDGE': 3.5, 'HIP': 3, 'VALLEY': 3, 'EAVE': 2.5, 'RAKE': 2.5,
  'STEP_FLASHING': 2, 'WALL_FLASHING': 2, 'TRANSITION': 2.5, 'PARAPET': 2,
}

/** Standard segment colors palette */
export const SEGMENT_COLORS = [
  '#4A90D9', '#5BA55B', '#CC7832', '#9876AA', '#D4A017',
  '#6897BB', '#A8A852', '#D98880', '#76B5C5', '#B39DDB'
]

// ============================================================
// Roofing Math Functions
// Previously in types.ts — moved here to avoid bundler
// tree-shaking issues with mixed type/runtime exports.
// ============================================================

/** Convert degrees to cardinal direction */
export function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16
  return dirs[index]
}

/** Pitch degrees to rise:12 ratio string */
export function pitchToRatio(degrees: number): string {
  if (degrees <= 0 || degrees >= 90) return '0:12'
  const rise = 12 * Math.tan(degrees * Math.PI / 180)
  return `${Math.round(rise * 10) / 10}:12`
}

/** TRUE 3D surface area from flat footprint + pitch. Formula: true_area = footprint / cos(pitch) */
export function trueAreaFromFootprint(footprintSqft: number, pitchDegrees: number): number {
  if (pitchDegrees <= 0 || pitchDegrees >= 90) return footprintSqft
  const cosAngle = Math.cos(pitchDegrees * Math.PI / 180)
  if (cosAngle <= 0) return footprintSqft
  return footprintSqft / cosAngle
}

/**
 * 3D hip/valley length factor from plan-view (2D) length.
 * Hip/valley edges run diagonally across the roof surface.
 * For a hip/valley at 45-degree plan angle between two equal-pitch faces:
 *   true_length = plan_length * sqrt(1 + (rise/12)^2 + (rise/12)^2) / sqrt(2)
 * Simplified: true_length = plan_length * hipValleyFactor(pitch)
 */
export function hipValleyFactor(pitchDegrees: number): number {
  const rise = 12 * Math.tan(pitchDegrees * Math.PI / 180)
  return Math.sqrt(2 * rise * rise + 288) / (12 * Math.SQRT2)
}

/** 3D rake/common rafter length factor. true_length = plan_length / cos(pitch) */
export function rakeFactor(pitchDegrees: number): number {
  if (pitchDegrees <= 0 || pitchDegrees >= 90) return 1
  return 1 / Math.cos(pitchDegrees * Math.PI / 180)
}

/** Classify roof complexity based on segment count, hip/valley count, and pitch variation */
export function classifyComplexity(
  segmentCount: number,
  hipCount: number,
  valleyCount: number,
  pitchVariation: number
): { factor: number, classification: 'simple' | 'moderate' | 'complex' | 'very_complex' } {
  let score = 0
  if (segmentCount <= 2) score += 0
  else if (segmentCount <= 4) score += 1
  else if (segmentCount <= 6) score += 2
  else score += 3
  score += Math.min(hipCount, 4)
  score += Math.min(valleyCount * 2, 6)
  if (pitchVariation > 10) score += 2
  else if (pitchVariation > 5) score += 1
  if (score <= 2) return { factor: 1.0, classification: 'simple' }
  if (score <= 5) return { factor: 1.05, classification: 'moderate' }
  if (score <= 8) return { factor: 1.10, classification: 'complex' }
  return { factor: 1.15, classification: 'very_complex' }
}

/** Compute material estimate from roof data */
export function computeMaterialEstimate(
  trueAreaSqft: number,
  edges: EdgeMeasurement[],
  segments: RoofSegment[],
  shingleType: string = 'architectural'
): MaterialEstimate {
  const hipEdges = edges.filter(e => e.edge_type === 'hip')
  const valleyEdges = edges.filter(e => e.edge_type === 'valley')
  const ridgeEdges = edges.filter(e => e.edge_type === 'ridge')
  const eaveEdges = edges.filter(e => e.edge_type === 'eave')
  const rakeEdges = edges.filter(e => e.edge_type === 'rake')

  const pitchMin = Math.min(...segments.map(s => s.pitch_degrees), 90)
  const pitchMax = Math.max(...segments.map(s => s.pitch_degrees), 0)
  const pitchVariation = pitchMax - pitchMin

  const { factor: complexityFactor, classification: complexityClass } = classifyComplexity(
    segments.length, hipEdges.length, valleyEdges.length, pitchVariation
  )

  // Base waste includes +5% safety margin per Reuse Canada standard
  const baseWaste = complexityClass === 'simple' ? 15 :
    complexityClass === 'moderate' ? 17 :
    complexityClass === 'complex' ? 19 : 20

  const netArea = trueAreaSqft
  const grossArea = netArea * (1 + baseWaste / 100)
  const grossSquares = Math.ceil(grossArea / 100 * 10) / 10
  const bundlesPerSquare = shingleType === '3-tab' ? 3 : 3
  const bundleCount = Math.ceil(grossSquares * bundlesPerSquare)

  const totalRidgeFt = ridgeEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalHipFt = hipEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalValleyFt = valleyEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalEaveFt = eaveEdges.reduce((s, e) => s + e.true_length_ft, 0)
  const totalRakeFt = rakeEdges.reduce((s, e) => s + e.true_length_ft, 0)

  const lineItems: MaterialLineItem[] = []

  const shinglePricePerBundle = shingleType === 'architectural' ? 42.00 : 32.00
  lineItems.push({
    category: 'shingles',
    description: `${shingleType === 'architectural' ? 'Architectural (Laminate)' : '3-Tab Standard'} Shingles`,
    unit: 'squares', net_quantity: Math.round(netArea / 100 * 10) / 10, waste_pct: baseWaste,
    gross_quantity: grossSquares, order_quantity: bundleCount, order_unit: 'bundles',
    unit_price_cad: shinglePricePerBundle,
    line_total_cad: Math.round(bundleCount * shinglePricePerBundle * 100) / 100
  })

  const underlaymentRolls = Math.ceil(grossArea / 1000)
  lineItems.push({
    category: 'underlayment', description: 'Synthetic Underlayment', unit: 'rolls',
    net_quantity: Math.ceil(netArea / 1000), waste_pct: 10, gross_quantity: underlaymentRolls,
    order_quantity: underlaymentRolls, order_unit: 'rolls', unit_price_cad: 85.00,
    line_total_cad: Math.round(underlaymentRolls * 85.00 * 100) / 100
  })

  const iceShieldLinearFt = totalEaveFt + totalValleyFt
  const iceShieldSqft = iceShieldLinearFt * 3
  const iceShieldRolls = Math.ceil(iceShieldSqft / 75)
  lineItems.push({
    category: 'ice_shield', description: 'Ice & Water Shield Membrane', unit: 'rolls',
    net_quantity: Math.ceil(iceShieldSqft / 75), waste_pct: 5, gross_quantity: iceShieldRolls,
    order_quantity: iceShieldRolls, order_unit: 'rolls', unit_price_cad: 125.00,
    line_total_cad: Math.round(iceShieldRolls * 125.00 * 100) / 100
  })

  const starterLinearFt = totalEaveFt + totalRakeFt
  const starterBundles = Math.ceil(starterLinearFt / 105)
  lineItems.push({
    category: 'starter_strip', description: 'Starter Strip Shingles', unit: 'linear_ft',
    net_quantity: Math.round(starterLinearFt), waste_pct: 5,
    gross_quantity: Math.round(starterLinearFt * 1.05), order_quantity: starterBundles,
    order_unit: 'bundles', unit_price_cad: 35.00,
    line_total_cad: Math.round(starterBundles * 35.00 * 100) / 100
  })

  const ridgeHipLinearFt = totalRidgeFt + totalHipFt
  const ridgeCapBundles = Math.ceil(ridgeHipLinearFt / 33)
  lineItems.push({
    category: 'ridge_cap', description: 'Ridge/Hip Cap Shingles', unit: 'linear_ft',
    net_quantity: Math.round(ridgeHipLinearFt), waste_pct: 5,
    gross_quantity: Math.round(ridgeHipLinearFt * 1.05), order_quantity: ridgeCapBundles,
    order_unit: 'bundles', unit_price_cad: 55.00,
    line_total_cad: Math.round(ridgeCapBundles * 55.00 * 100) / 100
  })

  const dripEdgeLinearFt = totalEaveFt + totalRakeFt
  const dripEdgePieces = Math.ceil(dripEdgeLinearFt / 10)
  lineItems.push({
    category: 'drip_edge', description: 'Aluminum Drip Edge (10 ft sections)', unit: 'pieces',
    net_quantity: Math.ceil(dripEdgeLinearFt / 10), waste_pct: 5, gross_quantity: dripEdgePieces,
    order_quantity: dripEdgePieces, order_unit: 'pieces', unit_price_cad: 8.50,
    line_total_cad: Math.round(dripEdgePieces * 8.50 * 100) / 100
  })

  if (totalValleyFt > 0) {
    const valleyPieces = Math.ceil(totalValleyFt / 10)
    lineItems.push({
      category: 'valley_metal', description: 'Pre-bent Valley Flashing (W-valley, 10 ft)', unit: 'pieces',
      net_quantity: Math.ceil(totalValleyFt / 10), waste_pct: 10, gross_quantity: valleyPieces,
      order_quantity: valleyPieces, order_unit: 'pieces', unit_price_cad: 22.00,
      line_total_cad: Math.round(valleyPieces * 22.00 * 100) / 100
    })
  }

  const nailLbs = Math.ceil(grossSquares * 1.5)
  const nailBoxes = Math.ceil(nailLbs / 30)

  const stepFlashEdges = edges.filter(e => e.edge_type === 'step_flashing')
  const totalStepFlashFt = stepFlashEdges.reduce((s, e) => s + e.true_length_ft, 0)
  if (totalStepFlashFt > 0) {
    const stepPieces = Math.ceil(totalStepFlashFt * 1.5)
    lineItems.push({
      category: 'step_flashing', description: 'Step Flashing (4×4 in, galvanized)', unit: 'pieces',
      net_quantity: Math.ceil(totalStepFlashFt * 1.5), waste_pct: 10,
      gross_quantity: Math.ceil(stepPieces * 1.1), order_quantity: Math.ceil(stepPieces * 1.1),
      order_unit: 'pieces', unit_price_cad: 0.85,
      line_total_cad: Math.round(Math.ceil(stepPieces * 1.1) * 0.85 * 100) / 100
    })
  }

  const wallFlashEdges = edges.filter(e => e.edge_type === 'wall_flashing')
  const totalWallFlashFt = wallFlashEdges.reduce((s, e) => s + e.true_length_ft, 0)
  if (totalWallFlashFt > 0) {
    const wallFlashPieces = Math.ceil(totalWallFlashFt / 10)
    lineItems.push({
      category: 'wall_flashing', description: 'Wall/Headwall Flashing (10 ft sections)', unit: 'pieces',
      net_quantity: wallFlashPieces, waste_pct: 10,
      gross_quantity: Math.ceil(wallFlashPieces * 1.1), order_quantity: Math.ceil(wallFlashPieces * 1.1),
      order_unit: 'pieces', unit_price_cad: 14.00,
      line_total_cad: Math.round(Math.ceil(wallFlashPieces * 1.1) * 14.00 * 100) / 100
    })
  }

  lineItems.push({
    category: 'nails', description: '1-1/4" Galvanized Roofing Nails (30 lb box)', unit: 'lbs',
    net_quantity: Math.round(grossSquares * 1.5), waste_pct: 0, gross_quantity: nailLbs,
    order_quantity: nailBoxes, order_unit: 'boxes', unit_price_cad: 65.00,
    line_total_cad: Math.round(nailBoxes * 65.00 * 100) / 100
  })

  if (totalRidgeFt > 0) {
    const ventPieces = Math.ceil(totalRidgeFt / 4)
    lineItems.push({
      category: 'ventilation', description: 'Ridge Vent (4 ft sections)', unit: 'pieces',
      net_quantity: Math.ceil(totalRidgeFt / 4), waste_pct: 5, gross_quantity: ventPieces,
      order_quantity: ventPieces, order_unit: 'pieces', unit_price_cad: 18.00,
      line_total_cad: Math.round(ventPieces * 18.00 * 100) / 100
    })
  }

  const totalCost = lineItems.reduce((sum, item) => sum + (item.line_total_cad || 0), 0)

  const wastePercentages = [0, 10, 12, 15, 17, 20]
  const waste_table: WasteRow[] = wastePercentages.map(pct => {
    const area = Math.round(netArea * (1 + pct / 100))
    const sq = Math.ceil(area / 100 * 10) / 10
    const bundles = Math.ceil(sq * 3)
    const label = pct === 0 ? 'Measured' : pct === baseWaste ? 'Suggested' : ''
    return { waste_pct: pct, area_sqft: area, squares: sq, bundles, label, is_suggested: pct === baseWaste }
  })

  return {
    net_area_sqft: Math.round(netArea), waste_pct: baseWaste,
    gross_area_sqft: Math.round(grossArea), gross_squares: Math.round(grossSquares * 10) / 10,
    bundle_count: bundleCount, line_items: lineItems,
    total_material_cost_cad: Math.round(totalCost * 100) / 100,
    complexity_factor: complexityFactor, complexity_class: complexityClass,
    shingle_type: shingleType, waste_table
  }
}

/** RAS Yield Analysis — compute material recovery from roof tear-off shingles */
export function computeRASYieldAnalysis(
  segments: RoofSegment[],
  trueAreaSqft: number,
  shingleType: string = 'architectural'
): RASYieldAnalysis {
  const totalSquares = trueAreaSqft / 100
  const weightPerSquare = shingleType === 'architectural' ? 250 : 230
  const totalWeight = totalSquares * weightPerSquare

  const rasSegments: RASSegmentYield[] = segments.map(seg => {
    const pitchRise = 12 * Math.tan(seg.pitch_degrees * Math.PI / 180)
    let recoveryClass: 'binder_oil' | 'granule' | 'mixed'
    if (pitchRise <= 4) recoveryClass = 'binder_oil'
    else if (pitchRise > 6) recoveryClass = 'granule'
    else recoveryClass = 'mixed'

    const segSquares = seg.true_area_sqft / 100
    const segWeight = segSquares * weightPerSquare
    const binderOilRate = recoveryClass === 'binder_oil' ? 0.32 : recoveryClass === 'mixed' ? 0.28 : 0.25
    const granuleRate = recoveryClass === 'granule' ? 0.40 : recoveryClass === 'mixed' ? 0.36 : 0.33
    const fiberRate = recoveryClass === 'binder_oil' ? 0.08 : recoveryClass === 'mixed' ? 0.07 : 0.06
    const binderOilLbs = segWeight * binderOilRate
    const binderOilGallons = binderOilLbs / 8

    return {
      segment_name: seg.name, pitch_degrees: seg.pitch_degrees, pitch_ratio: seg.pitch_ratio,
      area_sqft: seg.true_area_sqft, recovery_class: recoveryClass,
      estimated_yield: {
        binder_oil_gallons: Math.round(binderOilGallons * 10) / 10,
        granules_lbs: Math.round(segWeight * granuleRate),
        fiber_lbs: Math.round(segWeight * fiberRate)
      }
    }
  })

  const totalBinderOil = rasSegments.reduce((s, seg) => s + seg.estimated_yield.binder_oil_gallons, 0)
  const totalGranules = rasSegments.reduce((s, seg) => s + seg.estimated_yield.granules_lbs, 0)
  const totalFiber = rasSegments.reduce((s, seg) => s + seg.estimated_yield.fiber_lbs, 0)
  const totalRecoverable = (totalBinderOil * 8) + totalGranules + totalFiber

  const oilPricePerGallon = 3.50
  const granulePricePerLb = 0.08
  const fiberPricePerLb = 0.12
  const oilValue = totalBinderOil * oilPricePerGallon
  const granuleValue = totalGranules * granulePricePerLb
  const fiberValue = totalFiber * fiberPricePerLb

  const lowPitchArea = rasSegments.filter(s => s.recovery_class === 'binder_oil').reduce((sum, s) => sum + s.area_sqft, 0)
  const medPitchArea = rasSegments.filter(s => s.recovery_class === 'mixed').reduce((sum, s) => sum + s.area_sqft, 0)
  const highPitchArea = rasSegments.filter(s => s.recovery_class === 'granule').reduce((sum, s) => sum + s.area_sqft, 0)
  const totalArea = lowPitchArea + medPitchArea + highPitchArea || 1

  const lowPitchPct = (lowPitchArea / totalArea) * 100
  const highPitchPct = (highPitchArea / totalArea) * 100

  let recommendation: string
  if (lowPitchPct > 60) recommendation = 'Prioritize binder oil extraction — low-pitch dominant roof. Route to Rotto Chopper for optimal oil recovery. Ideal for cold patch and sealant production.'
  else if (highPitchPct > 60) recommendation = 'Prioritize granule separation — steep-pitch dominant roof. Run through screener line for clean granule recovery. High-grade output for resale.'
  else recommendation = 'Mixed recovery stream — process through full RAS line. Extract binder oil first, then screen for granules and fiber. Blend output suitable for cold patch formulation.'

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
