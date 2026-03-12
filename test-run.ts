// test-run.ts
// Engine validation tests: covers the 3 silent-killer bugs
// Run with: npx ts-node test-run.ts (or npx tsx test-run.ts)

import { RoofMeasurementEngine, TracePayload, traceUiToEnginePayload } from './src/services/roof-measurement-engine';

// ═══════════════════════════════════════════════════════════
// TEST 1: Basic 10x10m square — validates coordinate projection + shoelace
// ═══════════════════════════════════════════════════════════

console.log("=".repeat(60));
console.log("TEST 1: Basic 10x10m square (direct TracePayload)");
console.log("=".repeat(60));

const mockPayload: TracePayload = {
  address: "123 Dealership Way, Sherwood Park, AB",
  homeowner: "Bean",
  order_id: "TEST-001",
  default_pitch: 6.0,
  complexity: "simple",
  include_waste: true,
  slope_map: {
    "default": "6:12"  // Testing the string parsing
  },
  eaves_outline: [
    { lat: 0.0, lng: 0.0, elevation: 0 },
    { lat: 0.00009, lng: 0.0, elevation: 0 },
    { lat: 0.00009, lng: 0.00009, elevation: 0 },
    { lat: 0.0, lng: 0.00009, elevation: 0 }
  ],
  ridges: [
    {
      id: "main_ridge",
      pitch: null,  // Let it fall back to default
      pts: [
        { lat: 0.000045, lng: 0.0, elevation: 2.5 },
        { lat: 0.000045, lng: 0.00009, elevation: 2.5 }
      ]
    }
  ],
  hips: [],
  valleys: [],
  rakes: [],
  faces: []
};

try {
  const engine = new RoofMeasurementEngine(mockPayload);
  const report = engine.run();

  console.log("\n--- KEY MEASUREMENTS ---");
  console.log(`Projected Area: ${report.key_measurements.total_projected_footprint_ft2} sqft`);
  console.log(`Sloped Area:    ${report.key_measurements.total_roof_area_sloped_ft2} sqft`);
  console.log(`Net Squares:    ${report.key_measurements.total_squares_net}`);
  console.log(`Gross Squares:  ${report.key_measurements.total_squares_gross_w_waste}`);
  console.log(`Dominant Pitch: ${report.key_measurements.dominant_pitch_label}`);
  console.log(`Waste %:        ${report.key_measurements.waste_factor_pct}%`);
  console.log(`Faces:          ${report.key_measurements.num_roof_faces}`);

  console.log("\n--- FACE DETAILS ---");
  for (const f of report.face_details) {
    console.log(`  ${f.face_id}: proj=${f.projected_area_ft2}sqft, sloped=${f.sloped_area_ft2}sqft, pitch=${f.pitch_label}, factor=${f.slope_factor}`);
  }

  console.log("\n--- EDGE LENGTHS ---");
  for (const e of report.eave_edge_breakdown) {
    console.log(`  Edge ${e.edge_num}: ${e.length_2d_ft} ft`);
  }

  console.log("\n--- MATERIALS ---");
  console.log(`  Bundles: ${report.materials_estimate.shingles_bundles}`);
  console.log(`  Underlay rolls: ${report.materials_estimate.underlayment_rolls}`);

  // VALIDATION: 10m x 10m = 100m² ≈ 1076.4 sqft
  const expectedFootprint = 100 * 10.7639;  // ~1076.4 sqft
  const tolerance = 0.15;  // 15% tolerance for projection at equator
  const projArea = report.key_measurements.total_projected_footprint_ft2;
  const diff = Math.abs(projArea - expectedFootprint) / expectedFootprint;
  console.log(`\n--- VALIDATION ---`);
  console.log(`Expected footprint: ~${Math.round(expectedFootprint)} sqft (10m x 10m)`);
  console.log(`Got: ${projArea} sqft (diff: ${(diff * 100).toFixed(1)}%)`);
  console.log(diff < tolerance ? "PASS: Footprint within tolerance" : `FAIL: Footprint off by ${(diff*100).toFixed(1)}%`);

  // Check for NaN anywhere
  const allNums = [
    projArea,
    report.key_measurements.total_roof_area_sloped_ft2,
    report.key_measurements.total_squares_net,
    ...report.face_details.map(f => f.sloped_area_ft2),
    ...report.face_details.map(f => f.slope_factor),
  ];
  const hasNaN = allNums.some(n => isNaN(n));
  console.log(hasNaN ? "FAIL: NaN detected in measurements!" : "PASS: No NaN values");

} catch (error) {
  console.error("\nENGINE CRASHED:", error);
}


// ═══════════════════════════════════════════════════════════
// TEST 2: String pitch "6:12" — verifies the Number() cast fix
// ═══════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(60));
console.log("TEST 2: String pitch values (testing Number() cast fix)");
console.log("=".repeat(60));

const stringPitchPayload: TracePayload = {
  address: "456 Test Ave",
  order_id: "TEST-002",
  default_pitch: 5.0,
  eaves_outline: [
    { lat: 53.5461, lng: -113.4938 },
    { lat: 53.5462, lng: -113.4938 },
    { lat: 53.5462, lng: -113.4936 },
    { lat: 53.5461, lng: -113.4936 }
  ],
  ridges: [
    {
      id: "ridge_with_string_pitch",
      pitch: "6:12" as any,  // This is the bug scenario — pitch as string
      pts: [
        { lat: 53.54615, lng: -113.4938 },
        { lat: 53.54615, lng: -113.4936 }
      ]
    }
  ],
  hips: [],
  valleys: [],
  rakes: [],
  faces: []
};

try {
  const engine2 = new RoofMeasurementEngine(stringPitchPayload);
  const report2 = engine2.run();

  console.log(`Projected: ${report2.key_measurements.total_projected_footprint_ft2} sqft`);
  console.log(`Sloped:    ${report2.key_measurements.total_roof_area_sloped_ft2} sqft`);
  console.log(`Pitch:     ${report2.key_measurements.dominant_pitch_label}`);

  for (const f of report2.face_details) {
    console.log(`  Face ${f.face_id}: pitch=${f.pitch_label}, factor=${f.slope_factor}, sloped=${f.sloped_area_ft2}`);
  }

  const hasNaN2 = isNaN(report2.key_measurements.total_roof_area_sloped_ft2) ||
                  report2.face_details.some(f => isNaN(f.slope_factor));
  console.log(hasNaN2 ? "FAIL: NaN from string pitch!" : "PASS: String pitch '6:12' parsed correctly");
} catch (error) {
  console.error("ENGINE CRASHED on string pitch:", error);
}


// ═══════════════════════════════════════════════════════════
// TEST 3: traceUiToEnginePayload — simulates the actual frontend flow
// ═══════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(60));
console.log("TEST 3: traceUiToEnginePayload (frontend simulation)");
console.log("=".repeat(60));

const uiTrace = {
  eaves: [
    { lat: 53.5461, lng: -113.4938 },
    { lat: 53.5463, lng: -113.4938 },
    { lat: 53.5463, lng: -113.4934 },
    { lat: 53.5461, lng: -113.4934 }
  ],
  ridges: [
    [
      { lat: 53.5462, lng: -113.4938 },
      { lat: 53.5462, lng: -113.4934 }
    ]
  ],
  hips: [
    [
      { lat: 53.5461, lng: -113.4938 },
      { lat: 53.5462, lng: -113.49375 }
    ],
    [
      { lat: 53.5463, lng: -113.4938 },
      { lat: 53.5462, lng: -113.49375 }
    ]
  ],
  valleys: [],
  traced_at: "2026-03-12T00:00:00Z"
};

const payload3 = traceUiToEnginePayload(
  uiTrace,
  { property_address: "789 Real Property, Edmonton AB", order_number: "R-0042" },
  5.0
);

try {
  const engine3 = new RoofMeasurementEngine(payload3);
  const report3 = engine3.run();

  console.log(`Projected: ${report3.key_measurements.total_projected_footprint_ft2} sqft`);
  console.log(`Sloped:    ${report3.key_measurements.total_roof_area_sloped_ft2} sqft`);
  console.log(`Net Sq:    ${report3.key_measurements.total_squares_net}`);
  console.log(`Gross Sq:  ${report3.key_measurements.total_squares_gross_w_waste}`);
  console.log(`Pitch:     ${report3.key_measurements.dominant_pitch_label}`);
  console.log(`Eave pts:  ${report3.key_measurements.num_eave_points}`);
  console.log(`Ridges:    ${report3.key_measurements.num_ridges}`);
  console.log(`Hips:      ${report3.key_measurements.num_hips}`);
  console.log(`Faces:     ${report3.key_measurements.num_roof_faces}`);

  console.log("\n--- FACES ---");
  for (const f of report3.face_details) {
    console.log(`  ${f.face_id}: proj=${f.projected_area_ft2}sqft, sloped=${f.sloped_area_ft2}sqft, pitch=${f.pitch_label}`);
  }

  console.log("\n--- EDGES ---");
  console.log(`  Eaves:   ${report3.linear_measurements.eaves_total_ft} ft`);
  console.log(`  Ridges:  ${report3.linear_measurements.ridges_total_ft} ft`);
  console.log(`  Hips:    ${report3.linear_measurements.hips_total_ft} ft`);
  console.log(`  Valleys: ${report3.linear_measurements.valleys_total_ft} ft`);
  console.log(`  Rakes:   ${report3.linear_measurements.rakes_total_ft} ft`);

  console.log("\n--- MATERIALS ---");
  const mat = report3.materials_estimate;
  console.log(`  Shingle bundles: ${mat.shingles_bundles}`);
  console.log(`  Underlay rolls:  ${mat.underlayment_rolls}`);
  console.log(`  Ridge cap:       ${mat.ridge_cap_lf} lf`);
  console.log(`  Starter strip:   ${mat.starter_strip_lf} lf`);
  console.log(`  Drip edge:       ${mat.drip_edge_total_lf} lf`);

  // Final NaN check
  const allVals = [
    report3.key_measurements.total_projected_footprint_ft2,
    report3.key_measurements.total_roof_area_sloped_ft2,
    report3.key_measurements.total_squares_net,
    ...report3.face_details.flatMap(f => [f.projected_area_ft2, f.sloped_area_ft2, f.slope_factor]),
    ...report3.eave_edge_breakdown.map(e => e.length_2d_ft),
  ];
  const anyNaN = allVals.some(v => isNaN(v));
  const anyZero = report3.key_measurements.total_projected_footprint_ft2 === 0;
  console.log(`\n--- VALIDATION ---`);
  console.log(anyNaN ? "FAIL: NaN detected!" : "PASS: No NaN values");
  console.log(anyZero ? "FAIL: Zero footprint!" : "PASS: Non-zero footprint");
  console.log(report3.key_measurements.total_roof_area_sloped_ft2 > report3.key_measurements.total_projected_footprint_ft2
    ? "PASS: Sloped > Projected (pitch applied)"
    : "FAIL: Sloped <= Projected (pitch NOT applied)");

} catch (error) {
  console.error("ENGINE CRASHED on UI trace:", error);
}

console.log("\n" + "=".repeat(60));
console.log("ALL TESTS COMPLETE");
console.log("=".repeat(60));
