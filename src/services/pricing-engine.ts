// ============================================================
// RoofReporterAI — Pricing Engine Service
// Port of Python RoofReporterPricingEngine to TypeScript/CF Workers
// Roofer preset costs → auto-calculate proposals from measurements
// ============================================================

export interface RoofPresetCosts {
  // Shingle costs
  shingles_per_square: number      // $/square (e.g. 145.00)
  underlayment_per_square: number  // $/square (e.g. 25.00)
  
  // Edge/flashing costs
  drip_edge_per_ft: number         // $/linear ft (e.g. 1.50)
  ridge_cap_per_ft: number         // $/linear ft (e.g. 3.25)
  valley_flashing_per_ft: number   // $/linear ft (e.g. 2.75)
  step_flashing_per_ft: number     // $/linear ft (e.g. 3.50)
  
  // Labor & overhead
  labor_per_square: number         // $/square (e.g. 180.00)
  tearoff_per_square: number       // $/square (e.g. 45.00)
  disposal_per_square: number      // $/square (e.g. 25.00)
  
  // Ice & water shield
  ice_shield_per_roll: number      // $/roll (e.g. 85.00)
  
  // Waste factor
  waste_factor: number             // decimal (e.g. 0.15 = 15%)
  
  // Tax
  tax_rate: number                 // decimal (e.g. 0.05 = 5% GST)
  
  // Optional: custom line items
  custom_items?: CustomLineItem[]
}

export interface CustomLineItem {
  description: string
  unit_price: number
  quantity: number
  unit: string
}

export interface ProposalLineItem {
  item: string
  description: string
  qty: number
  unit: string
  unit_price: number
  price: number
}

export interface ProposalResult {
  line_items: ProposalLineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_price: number
  waste_factor_pct: number
  gross_squares: number
  net_area_sqft: number
  metadata: {
    engine_version: string
    generated_at: string
    preset_name: string
  }
}

export interface RoofMeasurements {
  total_area_sqft: number
  perimeter_ft?: number
  ridge_ft?: number
  hip_ft?: number
  valley_ft?: number
  eave_ft?: number
  rake_ft?: number
  step_flashing_ft?: number
  wall_flashing_ft?: number
  drip_edge_ft?: number
  ice_shield_sqft?: number
  dominant_pitch?: string
  num_facets?: number
}

// ============================================================
// DEFAULT PRESETS — Industry-standard Alberta/Canada pricing
// ============================================================
export const DEFAULT_PRESETS: RoofPresetCosts = {
  shingles_per_square: 145.00,
  underlayment_per_square: 25.00,
  drip_edge_per_ft: 1.50,
  ridge_cap_per_ft: 3.25,
  valley_flashing_per_ft: 2.75,
  step_flashing_per_ft: 3.50,
  labor_per_square: 180.00,
  tearoff_per_square: 45.00,
  disposal_per_square: 25.00,
  ice_shield_per_roll: 85.00,
  waste_factor: 0.15,
  tax_rate: 0.05,
}

// Good / Better / Best tier presets — 3 shingle quality grades
export const TIER_PRESETS = {
  good: {
    name: 'Good — 25yr 3-Tab Shingles',
    description: 'Standard 3-tab shingles with 25-year manufacturer warranty. Economical, proven protection for budget-conscious homeowners.',
    shingles_per_square: 110.00,
    underlayment_per_square: 18.00,
    labor_per_square: 160.00,
    tearoff_per_square: 40.00,
  },
  better: {
    name: 'Better — 30yr Architectural',
    description: 'Dimensional architectural shingles with 30-year warranty. Enhanced wind resistance (130 km/h), thicker profile, superior curb appeal.',
    shingles_per_square: 145.00,
    underlayment_per_square: 25.00,
    labor_per_square: 180.00,
    tearoff_per_square: 45.00,
  },
  best: {
    name: 'Best — 50yr Luxury / Designer',
    description: 'Premium designer shingles with 50-year limited lifetime warranty. Impact-resistant (Class 4), best-in-class wind rating (210 km/h), ice & water shield included.',
    shingles_per_square: 225.00,
    underlayment_per_square: 35.00,
    labor_per_square: 210.00,
    tearoff_per_square: 50.00,
  },
}

// ============================================================
// PRICING ENGINE — Calculate proposal from measurements + presets
// ============================================================
export function calculateProposal(
  measurements: RoofMeasurements,
  presets: RoofPresetCosts,
  presetName: string = 'Custom'
): ProposalResult {
  const wasteMultiplier = 1 + presets.waste_factor
  const grossArea = measurements.total_area_sqft * wasteMultiplier
  const grossSquares = grossArea / 100

  const lineItems: ProposalLineItem[] = []

  // 1. Shingles (with waste)
  const shingleCost = grossSquares * presets.shingles_per_square
  lineItems.push({
    item: 'Architectural Shingles',
    description: `${round2(grossSquares)} squares @ $${presets.shingles_per_square.toFixed(2)}/sq (includes ${Math.round(presets.waste_factor * 100)}% waste)`,
    qty: round2(grossSquares),
    unit: 'Squares',
    unit_price: presets.shingles_per_square,
    price: round2(shingleCost)
  })

  // 2. Underlayment System
  const underlaymentCost = grossSquares * presets.underlayment_per_square
  lineItems.push({
    item: 'Underlayment System',
    description: `Synthetic underlayment + ice/water shield`,
    qty: round2(grossSquares),
    unit: 'Squares',
    unit_price: presets.underlayment_per_square,
    price: round2(underlaymentCost)
  })

  // 3. Drip Edge (eaves + rakes)
  const dripEdgeFt = measurements.drip_edge_ft || 
    (measurements.eave_ft || 0) + (measurements.rake_ft || 0) ||
    measurements.perimeter_ft || 0
  if (dripEdgeFt > 0) {
    const dripEdgeCost = dripEdgeFt * presets.drip_edge_per_ft
    lineItems.push({
      item: 'Drip Edge Flashing',
      description: `Eaves + rakes perimeter`,
      qty: Math.round(dripEdgeFt),
      unit: 'Linear Ft',
      unit_price: presets.drip_edge_per_ft,
      price: round2(dripEdgeCost)
    })
  }

  // 4. Ridge Caps (ridges + hips)
  const ridgeFt = (measurements.ridge_ft || 0) + (measurements.hip_ft || 0)
  if (ridgeFt > 0) {
    const ridgeCost = ridgeFt * presets.ridge_cap_per_ft
    lineItems.push({
      item: 'Ridge Cap Shingles',
      description: `Ridge & hip caps`,
      qty: Math.round(ridgeFt),
      unit: 'Linear Ft',
      unit_price: presets.ridge_cap_per_ft,
      price: round2(ridgeCost)
    })
  }

  // 5. Valley Flashing
  const valleyFt = measurements.valley_ft || 0
  if (valleyFt > 0) {
    const valleyCost = valleyFt * presets.valley_flashing_per_ft
    lineItems.push({
      item: 'Valley Flashing',
      description: `Galvanized valley metal`,
      qty: Math.round(valleyFt),
      unit: 'Linear Ft',
      unit_price: presets.valley_flashing_per_ft,
      price: round2(valleyCost)
    })
  }

  // 6. Step Flashing
  const stepFlashFt = measurements.step_flashing_ft || 0
  if (stepFlashFt > 0) {
    const stepFlashCost = stepFlashFt * presets.step_flashing_per_ft
    lineItems.push({
      item: 'Step Flashing',
      description: `Wall-to-roof intersection flashing`,
      qty: Math.round(stepFlashFt),
      unit: 'Linear Ft',
      unit_price: presets.step_flashing_per_ft,
      price: round2(stepFlashCost)
    })
  }

  // 7. Ice & Water Shield (if applicable)
  const iceShieldSqft = measurements.ice_shield_sqft || 0
  if (iceShieldSqft > 0 && presets.ice_shield_per_roll > 0) {
    const rolls = Math.ceil(iceShieldSqft / 200) // 200 sqft per roll
    const iceShieldCost = rolls * presets.ice_shield_per_roll
    lineItems.push({
      item: 'Ice & Water Shield',
      description: `Self-adhered membrane (${rolls} rolls)`,
      qty: rolls,
      unit: 'Rolls',
      unit_price: presets.ice_shield_per_roll,
      price: round2(iceShieldCost)
    })
  }

  // 8. Labor
  const laborCost = grossSquares * presets.labor_per_square
  lineItems.push({
    item: 'Installation Labor',
    description: `Professional installation`,
    qty: round2(grossSquares),
    unit: 'Squares',
    unit_price: presets.labor_per_square,
    price: round2(laborCost)
  })

  // 9. Tear-off & Disposal
  const tearoffCost = grossSquares * (presets.tearoff_per_square + presets.disposal_per_square)
  lineItems.push({
    item: 'Tear-off & Disposal',
    description: `Remove existing roofing + dumpster/disposal`,
    qty: round2(grossSquares),
    unit: 'Squares',
    unit_price: presets.tearoff_per_square + presets.disposal_per_square,
    price: round2(tearoffCost)
  })

  // 10. Custom items
  if (presets.custom_items) {
    for (const ci of presets.custom_items) {
      lineItems.push({
        item: ci.description,
        description: ci.description,
        qty: ci.quantity,
        unit: ci.unit,
        unit_price: ci.unit_price,
        price: round2(ci.quantity * ci.unit_price)
      })
    }
  }

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.price, 0)
  const taxAmount = round2(subtotal * presets.tax_rate)
  const totalPrice = round2(subtotal + taxAmount)

  return {
    line_items: lineItems,
    subtotal: round2(subtotal),
    tax_rate: presets.tax_rate,
    tax_amount: taxAmount,
    total_price: totalPrice,
    waste_factor_pct: Math.round(presets.waste_factor * 100),
    gross_squares: round2(grossSquares),
    net_area_sqft: measurements.total_area_sqft,
    metadata: {
      engine_version: 'RoofReporterAI PricingEngine v1.0',
      generated_at: new Date().toISOString(),
      preset_name: presetName,
    }
  }
}

// ============================================================
// GOOD / BETTER / BEST — 3-tier proposal generator
// ============================================================
export function calculateTieredProposals(
  measurements: RoofMeasurements,
  basePresets: Partial<RoofPresetCosts> = {}
): { good: ProposalResult; better: ProposalResult; best: ProposalResult } {
  const base: RoofPresetCosts = { ...DEFAULT_PRESETS, ...basePresets }

  return {
    good: calculateProposal(
      measurements,
      { ...base, ...TIER_PRESETS.good },
      TIER_PRESETS.good.name
    ),
    better: calculateProposal(
      measurements,
      { ...base, ...TIER_PRESETS.better },
      TIER_PRESETS.better.name
    ),
    best: calculateProposal(
      measurements,
      { ...base, ...TIER_PRESETS.best },
      TIER_PRESETS.best.name
    ),
  }
}

// ============================================================
// EXTRACT MEASUREMENTS FROM REPORT DATA
// Convert stored report JSON → RoofMeasurements for pricing
// ============================================================
export function extractMeasurementsFromReport(reportData: any): RoofMeasurements {
  // Try trace_measurement first (most accurate)
  const trace = reportData?.trace_measurement
  if (trace?.key_measurements) {
    return {
      total_area_sqft: trace.key_measurements.total_roof_area_sloped_ft2 || 0,
      ridge_ft: trace.linear_measurements?.ridges_total_ft || 0,
      hip_ft: trace.linear_measurements?.hips_total_ft || 0,
      valley_ft: trace.linear_measurements?.valleys_total_ft || 0,
      eave_ft: trace.linear_measurements?.eaves_total_ft || 0,
      rake_ft: trace.linear_measurements?.rakes_total_ft || 0,
      perimeter_ft: trace.linear_measurements?.perimeter_eave_rake_ft || 0,
      drip_edge_ft: trace.linear_measurements?.drip_edge_total_ft ||
        (trace.linear_measurements?.eaves_total_ft || 0) + (trace.linear_measurements?.rakes_total_ft || 0),
      step_flashing_ft: trace.linear_measurements?.step_flashing_ft || 0,
      wall_flashing_ft: trace.linear_measurements?.wall_flashing_ft || 0,
      ice_shield_sqft: trace.materials_estimate?.ice_water_shield_sqft || 0,
      dominant_pitch: trace.key_measurements?.dominant_pitch_label || '',
      num_facets: trace.key_measurements?.num_roof_faces || 0,
    }
  }

  // Fallback to edge_summary + basic report data
  const es = reportData?.edge_summary || {}
  return {
    total_area_sqft: reportData?.total_true_area_sqft || reportData?.roof_area_sqft || 0,
    ridge_ft: es.total_ridge_ft || 0,
    hip_ft: es.total_hip_ft || 0,
    valley_ft: es.total_valley_ft || 0,
    eave_ft: es.total_eave_ft || 0,
    rake_ft: es.total_rake_ft || 0,
    perimeter_ft: (es.total_eave_ft || 0) + (es.total_rake_ft || 0),
    drip_edge_ft: es.total_drip_edge_ft || (es.total_eave_ft || 0) + (es.total_rake_ft || 0),
    step_flashing_ft: es.total_step_flashing_ft || 0,
    wall_flashing_ft: es.total_wall_flashing_ft || 0,
    dominant_pitch: reportData?.roof_pitch_ratio || '',
    num_facets: (reportData?.segments || []).length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
