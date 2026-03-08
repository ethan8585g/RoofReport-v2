// ============================================================
// RoofReporterAI — Professional Report HTML Templates
// generateProfessionalReportHTML, buildVisionFindingsHTML,
// generatePerimeterSideData
// ============================================================

import type {
  RoofReport, RoofSegment, EdgeMeasurement, AIMeasurementAnalysis,
  PerimeterPoint, VisionFindings
} from '../types'
import {
  pitchToRatio, feetToFeetInches, smartEdgeFootage, SEGMENT_COLORS
} from '../utils/geo-math'
import {
  generateSatelliteOverlaySVG, generateOverlayLegend, generateBlueprintSVG,
  generateArchitecturalDiagramSVG, generatePreciseAIOverlaySVG
} from './svg-diagrams'

export function generateProfessionalReportHTML(report: RoofReport): string {
  const prop = report.property || { address: 'Unknown' } as any
  const mat = report.materials || { net_area_sqft: 0, gross_squares: 0, bundle_count: 0, line_items: [], waste_table: [], waste_pct: 15, gross_area_sqft: 0, total_material_cost_cad: 0, complexity_class: 'simple', complexity_factor: 1, shingle_type: 'architectural' } as any
  const es = report.edge_summary || { total_ridge_ft: 0, total_hip_ft: 0, total_valley_ft: 0, total_eave_ft: 0, total_rake_ft: 0, total_linear_ft: 0, total_step_flashing_ft: 0, total_wall_flashing_ft: 0, total_transition_ft: 0, total_parapet_ft: 0 } as any
  const quality = report.quality || { imagery_quality: 'BASE', confidence_score: 50 } as any
  // Ensure critical numeric fields have safe defaults
  if (!report.total_true_area_sqft) report.total_true_area_sqft = report.total_footprint_sqft || 1
  if (!report.total_footprint_sqft) report.total_footprint_sqft = report.total_true_area_sqft || 1
  if (!report.area_multiplier) report.area_multiplier = report.total_true_area_sqft / (report.total_footprint_sqft || 1)
  if (!report.generated_at) report.generated_at = new Date().toISOString() as any
  const reportNum = `${String(report.order_id).padStart(8,'0')}`
  const reportDate = new Date(report.generated_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  const reportDateShort = new Date(report.generated_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const fullAddress = [prop.address, prop.city, prop.province, prop.postal_code].filter(Boolean).join(', ')
  const netSquares = Math.round(report.total_true_area_sqft / 100 * 10) / 10
  const grossSquares = mat.gross_squares
  const totalDripEdge = es.total_eave_ft + es.total_rake_ft
  const starterStripFt = es.total_eave_ft
  const ridgeHipFt = es.total_ridge_ft + es.total_hip_ft
  const pipeBoots = Math.max(2, Math.floor(report.segments.length / 2))
  const chimneys = report.segments.length >= 6 ? 1 : 0
  const exhaustVents = Math.max(1, Math.floor(report.segments.length / 3))
  const nailLbs = Math.ceil(grossSquares * 1.5) // kept for potential future use
  const satelliteUrl = report.imagery?.satellite_url || ''
  const overheadUrl = report.imagery?.satellite_overhead_url || satelliteUrl
  const mediumUrl = (report.imagery as any)?.satellite_medium_url || report.imagery?.medium_url || ''
  const contextUrl = (report.imagery as any)?.satellite_context_url || report.imagery?.context_url || ''
  const northUrl = report.imagery?.north_url || ''
  const southUrl = report.imagery?.south_url || ''
  const eastUrl = report.imagery?.east_url || ''
  const westUrl = report.imagery?.west_url || ''
  // Street view removed per user request
  const rgbAerialUrl = (report.imagery as any)?.rgb_aerial_url || ''
  const maskOverlayUrl = (report.imagery as any)?.mask_overlay_url || ''
  const fluxHeatmapUrl = (report.imagery as any)?.flux_heatmap_url || ''
  const fluxData = (report as any).flux_analysis || null
  const nwUrl = (report.imagery as any)?.closeup_nw_url || (report.imagery as any)?.nw_closeup_url || ''
  const neUrl = (report.imagery as any)?.closeup_ne_url || (report.imagery as any)?.ne_closeup_url || ''
  const swUrl = (report.imagery as any)?.closeup_sw_url || (report.imagery as any)?.sw_closeup_url || ''
  const seUrl = (report.imagery as any)?.closeup_se_url || (report.imagery as any)?.se_closeup_url || ''
  const facetColors = ['#4A90D9','#E8634A','#5CB85C','#F5A623','#9B59B6','#E84393','#2ECC71','#F39C12','#3498DB','#8E44AD','#E67E22','#27AE60']

  // Predominant pitch from the largest segment (must be computed before SVG generators)  
  const largestSeg = [...report.segments].sort((a, b) => b.true_area_sqft - a.true_area_sqft)[0]
  const predominantPitch = largestSeg?.pitch_ratio || report.roof_pitch_ratio
  const predominantPitchDeg = largestSeg?.pitch_degrees || report.roof_pitch_degrees

  // Computed values
  const totalLinearFt = es.total_ridge_ft + es.total_hip_ft + es.total_valley_ft + es.total_eave_ft + es.total_rake_ft
  const providerLabel = report.metadata?.provider === 'mock' ? 'Simulated'
    : report.metadata?.provider === 'google_solar_datalayers' ? 'Google Solar DataLayers'
    : 'Google Solar API'

  // Generate satellite overlay SVG from AI geometry (kept for Page 2 top view only)
  const overlaySVG = generateSatelliteOverlaySVG(report.ai_geometry, report.segments, report.edges, es, facetColors, report.total_footprint_sqft, report.roof_pitch_degrees)
  const hasOverlay = overlaySVG.length > 0
  const overlayLegend = hasOverlay ? generateOverlayLegend(es, !!(report.ai_geometry?.obstructions?.length)) : ''

  // ── Professional CAD-style Blueprint SVG (white background, no satellite) ──
  const blueprintLengthSVG = generateBlueprintSVG(report.ai_geometry, report.segments, report.edges, es, report.total_footprint_sqft, report.roof_pitch_degrees, 'LENGTH')

  // ── Architectural Measurement Diagram (Image 1 / EagleView style) for Page 3 ──
  const architecturalDiagramSVG = generateArchitecturalDiagramSVG(
    report.ai_geometry, report.segments, report.edges, es,
    report.total_footprint_sqft, report.roof_pitch_degrees || predominantPitchDeg || 20,
    predominantPitch, grossSquares
  )

  // ── Precise AI Overlay SVG for Page 3 satellite thumbnail ──
  // Pass pitch info + edge summary + GSD for accurate measurement labels
  const dsmGsdMeters = (report.metadata as any)?.datalayers_analysis?.dsm_resolution_m || 0
  const preciseOverlaySVG = generatePreciseAIOverlaySVG(
    report.ai_geometry,
    report.total_footprint_sqft,
    predominantPitchDeg || 20,
    es,
    dsmGsdMeters
  )

  // Generate perimeter side data
  const perimeterData = generatePerimeterSideData(report.ai_geometry, es)

  // Structure complexity
  const numEdgeTypes = [es.total_ridge_ft, es.total_hip_ft, es.total_valley_ft].filter(v => v > 0).length
  const complexity = numEdgeTypes <= 1 ? 'Simple' : numEdgeTypes === 2 ? 'Normal' : 'Complex'

  // Penetration counts
  const penetrations = {
    pipes: pipeBoots,
    chimneys: chimneys,
    exhaustVents: exhaustVents,
    skylights: 0
  }

  // Flashing estimates — from edge summary (AI geometry-derived)
  const stepFlashingFt = es.total_step_flashing_ft || (chimneys > 0 ? Math.round(chimneys * 28) : 0)
  const wallFlashingFt = es.total_wall_flashing_ft || (chimneys > 0 ? Math.round(chimneys * 24) : 0)
  const transitionFt = es.total_transition_ft || 0
  const parapetFt = es.total_parapet_ft || 0

  // ========== Helper: img with fallback ==========
  const img = (url: string, alt: string, h: string) => url
    ? `<img src="${url}" alt="${alt}" style="width:100%;height:${h};object-fit:cover;display:block" onerror="this.style.display='none'">`
    : `<div style="height:${h};background:#e8ecf1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px">Image Not Available</div>`

  // ========== Helper: page header ==========
  const hdr = (title: string, sub: string) => `
  <div style="background:#002244;padding:10px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:1px">${title}</div>
    <div style="color:#7eafd4;font-size:9px;text-align:right">${sub}</div>
  </div>
  <div style="background:#003366;padding:6px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:10px;font-weight:600">${fullAddress}</div>
    <div style="color:#8eb8db;font-size:9px">Report: ${reportNum} &bull; ${reportDateShort}</div>
  </div>`

  // ========== Helper: page footer ==========
  const TOTAL_PAGES = 6
  const ftr = (pageNum: number) => `
  <div style="position:absolute;bottom:0;left:0;right:0;background:#f7f8fa;border-top:1px solid #dde;padding:5px 32px;display:flex;justify-content:space-between;font-size:7.5px;color:#888">
    <span style="font-weight:600;color:#003366">RoofReporterAI</span>
    <span>Report: ${reportNum} &bull; Page ${pageNum} of ${TOTAL_PAGES} &bull; &copy; ${new Date().getFullYear()} RoofReporterAI. All imagery &copy; Google.</span>
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RoofReporterAI Roof Report | ${fullAddress}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a2e;font-size:9.5pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;margin:0 auto;background:#fff;position:relative;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
@media print{.page{page-break-after:always;min-height:auto;box-shadow:none;margin:0}body{background:#fff}}
@media screen{.page{box-shadow:0 2px 16px rgba(0,0,0,0.10);margin:20px auto}}

/* ===== EagleView-style Tables ===== */
.ev-tbl{width:100%;border-collapse:collapse;font-size:9px}
.ev-tbl th{background:#003366;color:#fff;padding:6px 10px;text-align:left;font-weight:700;font-size:8.5px;text-transform:uppercase;letter-spacing:0.5px}
.ev-tbl th:last-child{text-align:right}
.ev-tbl td{padding:5px 10px;border-bottom:1px solid #e5e8ed;font-size:9.5px}
.ev-tbl td:last-child{text-align:right;font-weight:700;color:#003366}
.ev-tbl tr:nth-child(even) td{background:#f8f9fb}
.ev-tbl .row-hl td{background:#e6f0fa !important;font-weight:700}
.ev-tbl .row-total td{border-top:2px solid #003366;font-weight:800;background:#edf2f7}

/* ===== Key-value rows ===== */
.kv{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eef0f4;font-size:9.5px}
.kv-l{color:#4a5568;font-weight:500}
.kv-r{font-weight:700;color:#1a1a2e}

/* ===== Complexity bar ===== */
.cx-bar{display:flex;gap:0}
.cx-bar span{flex:1;text-align:center;padding:5px 0;font-size:8.5px;font-weight:700;border:1px solid #c5cdd9;color:#666}
.cx-bar .cx-active{background:#003366;color:#fff;border-color:#003366}

/* ===== Image card ===== */
.ic{border:1px solid #d5dae3;border-radius:3px;overflow:hidden;background:#f0f3f7}
.ic img{width:100%;display:block;object-fit:cover}
.ic-label{font-size:8.5px;font-weight:700;color:#003366;padding:4px 8px;text-transform:uppercase;letter-spacing:0.4px;background:#f7f8fa;border-top:1px solid #e5e8ed}
</style>
</head>
<body>

<!-- ==================== PAGE 1: COVER ==================== -->
<div class="page">
  <!-- Navy branded header -->
  <div style="background:linear-gradient(135deg,#001a33 0%,#003366 100%);padding:48px 40px 28px">
    <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:1px">Precise Aerial Roof Measurement Report</div>
    <div style="font-size:11px;color:#7eafd4;margin-top:4px;font-weight:500;letter-spacing:0.5px">Prepared by RoofReporterAI &bull; Powered by Google Solar API</div>
  </div>
  <!-- Address bar -->
  <div style="background:#002244;padding:16px 40px;border-bottom:2px solid #f0c040">
    <div style="font-size:17px;font-weight:800;color:#fff">${fullAddress}</div>
    <div style="font-size:10px;color:#7eafd4;margin-top:3px">${[prop.homeowner_name ? 'Homeowner: ' + prop.homeowner_name : '', prop.requester_name ? 'Prepared for: ' + prop.requester_name : '', prop.requester_company || ''].filter(Boolean).join(' &bull; ') || 'Residential Property'}</div>
  </div>

  <div style="padding:24px 40px 50px">
    <!-- Key Measurements Grid -->
    <div style="font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #003366;padding-bottom:5px;margin-bottom:14px">Key Measurements</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">
      <div style="background:#f4f7fb;border:1px solid #d5dae3;border-radius:5px;padding:10px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8d;font-weight:700">Total Roof Area</div>
        <div style="font-size:20px;font-weight:900;color:#003366;margin-top:2px">${report.total_true_area_sqft.toLocaleString()}</div>
        <div style="font-size:8px;color:#6b7a8d;font-weight:600">sq ft</div>
      </div>
      <div style="background:#f4f7fb;border:1px solid #d5dae3;border-radius:5px;padding:10px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8d;font-weight:700">Total Facets</div>
        <div style="font-size:20px;font-weight:900;color:#003366;margin-top:2px">${report.segments.length}</div>
        <div style="font-size:8px;color:#6b7a8d;font-weight:600">roof planes</div>
      </div>
      <div style="background:#f4f7fb;border:1px solid #d5dae3;border-radius:5px;padding:10px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8d;font-weight:700">Predominant Pitch</div>
        <div style="font-size:20px;font-weight:900;color:#003366;margin-top:2px">${predominantPitch}</div>
        <div style="font-size:8px;color:#6b7a8d;font-weight:600">${predominantPitchDeg.toFixed(1)}&deg;</div>
      </div>
      <div style="background:#f4f7fb;border:1px solid #d5dae3;border-radius:5px;padding:10px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8d;font-weight:700">Total Squares</div>
        <div style="font-size:20px;font-weight:900;color:#003366;margin-top:2px">${grossSquares}</div>
        <div style="font-size:8px;color:#6b7a8d;font-weight:600">gross (inc. waste)</div>
      </div>
    </div>

    <!-- Second row measurements -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
      <div style="background:#fff;border:1px solid #d5dae3;border-radius:5px;padding:8px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7a8d;font-weight:700">Ridges / Hips</div>
        <div style="font-size:15px;font-weight:800;color:#003366;margin-top:2px">${ridgeHipFt} <span style="font-size:9px;font-weight:600">ft</span></div>
      </div>
      <div style="background:#fff;border:1px solid #d5dae3;border-radius:5px;padding:8px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7a8d;font-weight:700">Valleys</div>
        <div style="font-size:15px;font-weight:800;color:#003366;margin-top:2px">${es.total_valley_ft} <span style="font-size:9px;font-weight:600">ft</span></div>
      </div>
      <div style="background:#fff;border:1px solid #d5dae3;border-radius:5px;padding:8px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7a8d;font-weight:700">Rakes</div>
        <div style="font-size:15px;font-weight:800;color:#003366;margin-top:2px">${es.total_rake_ft} <span style="font-size:9px;font-weight:600">ft</span></div>
      </div>
      <div style="background:#fff;border:1px solid #d5dae3;border-radius:5px;padding:8px 12px">
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7a8d;font-weight:700">Eaves / Starter</div>
        <div style="font-size:15px;font-weight:800;color:#003366;margin-top:2px">${es.total_eave_ft} <span style="font-size:9px;font-weight:600">ft</span></div>
      </div>
    </div>

    <!-- Table of Contents -->
    <div style="font-size:12px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Table of Contents</div>
    <div style="border:1px solid #d5dae3;border-radius:5px;overflow:hidden">
      ${[
        ['Images &mdash; Top View', '2'],
        ['AI Point-by-Point Blueprint', '3'],
        ['Images &mdash; Rotated Side Views (N/S/E/W)', '4'],
        ['Close-Up Detail &amp; Property Context', '5'],
        ['Length Blueprint &amp; Edge Summary', '6'],
      ].map(([title, pg], i) => `<div style="display:flex;justify-content:space-between;padding:6px 14px;font-size:10px;${i % 2 === 0 ? 'background:#f8f9fb' : 'background:#fff'};border-bottom:1px solid #eef0f4"><span style="font-weight:600;color:#1a1a2e">${title}</span><span style="color:#003366;font-weight:700">${pg}</span></div>`).join('')}
    </div>

    <!-- Data quality badges -->
    <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">
      <span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:#e6f0fa;color:#003366;border:1px solid #003366">${quality.imagery_quality || 'BASE'} QUALITY</span>
      <span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:#f1f5f9;color:#475569;border:1px solid #c5cdd9">${providerLabel}</span>
      <span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:${quality.confidence_score >= 90 ? '#ecfdf5' : quality.confidence_score >= 75 ? '#fffbeb' : '#fef2f2'};color:${quality.confidence_score >= 90 ? '#059669' : quality.confidence_score >= 75 ? '#d97706' : '#dc2626'};border:1px solid ${quality.confidence_score >= 90 ? '#6ee7b7' : quality.confidence_score >= 75 ? '#fcd34d' : '#fca5a5'}">CONFIDENCE: ${quality.confidence_score}%</span>
      ${report.ai_geometry?.facets?.length ? `<span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:#ecfdf5;color:#059669;border:1px solid #6ee7b7">AI OVERLAY: ${report.ai_geometry.facets.length} FACETS</span>` : ''}
      ${report.property_overlap_flag ? `<span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:#fffbeb;color:#b45309;border:1px solid #fbbf24">&#9888; POTENTIAL OVERLAP</span>` : ''}
      ${(report.excluded_segments?.length || 0) > 0 ? `<span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:#f0f9ff;color:#0369a1;border:1px solid #7dd3fc">${report.excluded_segments!.length} SEGMENTS EXCLUDED</span>` : ''}
      ${report.vision_findings ? `<span style="padding:3px 10px;border-radius:3px;font-size:8px;font-weight:700;background:${report.vision_findings.heat_score.total >= 50 ? '#fef2f2' : '#ecfdf5'};color:${report.vision_findings.heat_score.total >= 50 ? '#dc2626' : '#059669'};border:1px solid ${report.vision_findings.heat_score.total >= 50 ? '#fca5a5' : '#6ee7b7'}">&#128065; HEAT: ${report.vision_findings.heat_score.total}/100</span>` : ''}
    </div>
  </div>

  <!-- Cover footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;background:#003366;padding:12px 40px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:9px;font-weight:700">RoofReporterAI &bull; Professional Roof Measurement</div>
    <div style="color:#7eafd4;font-size:8px">Report: ${reportNum} &bull; Generated: ${reportDate}</div>
  </div>
</div>

<!-- ==================== PAGE 2: TOP VIEW IMAGE ==================== -->
<div class="page">
  ${hdr('IMAGES', 'Top View &mdash; Aerial Photograph')}
  <div style="padding:16px 32px 50px">
    <div style="font-size:10px;color:#4a5568;font-style:italic;margin-bottom:10px">The following aerial image shows the overhead view of the structure for your reference.</div>

    <!-- Large overhead satellite with overlay -->
    <div style="position:relative;border:1px solid #d5dae3;border-radius:4px;overflow:hidden;background:#e8ecf1;text-align:center">
      ${overheadUrl ? `<img src="${overheadUrl}" alt="Top View" style="width:100%;max-height:540px;object-fit:cover;display:block" onerror="this.style.display='none'">` : '<div style="height:540px;background:#e8ecf1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px">Satellite imagery not available</div>'}
      ${hasOverlay ? `<svg viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">${overlaySVG}</svg>` : ''}
    </div>
    <div style="font-size:9px;font-weight:700;color:#003366;padding:6px 0;text-transform:uppercase;letter-spacing:0.5px">Top View &mdash; ${hasOverlay ? 'Measured Roof Overlay' : 'Overhead Satellite'}</div>
    ${overlayLegend ? `<div style="margin-top:2px">${overlayLegend}</div>` : ''}

    <!-- Quick measurement summary bar -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px">
      <div style="text-align:center;padding:8px 4px;background:#003366;border-radius:4px">
        <div style="font-size:7px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Area</div>
        <div style="font-size:16px;font-weight:900;color:#fff">${report.total_true_area_sqft.toLocaleString()}</div>
        <div style="font-size:7px;color:#7eafd4">sq ft</div>
      </div>
      <div style="text-align:center;padding:8px 4px;background:#003366;border-radius:4px">
        <div style="font-size:7px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Facets</div>
        <div style="font-size:16px;font-weight:900;color:#fff">${report.segments.length}</div>
        <div style="font-size:7px;color:#7eafd4">planes</div>
      </div>
      <div style="text-align:center;padding:8px 4px;background:#003366;border-radius:4px">
        <div style="font-size:7px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Pitch</div>
        <div style="font-size:16px;font-weight:900;color:#fff">${predominantPitch}</div>
        <div style="font-size:7px;color:#7eafd4">predominant</div>
      </div>
      <div style="text-align:center;padding:8px 4px;background:#003366;border-radius:4px">
        <div style="font-size:7px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Squares</div>
        <div style="font-size:16px;font-weight:900;color:#fff">${grossSquares}</div>
        <div style="font-size:7px;color:#7eafd4">gross</div>
      </div>
      <div style="text-align:center;padding:8px 4px;background:#003366;border-radius:4px">
        <div style="font-size:7px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Ridges</div>
        <div style="font-size:16px;font-weight:900;color:#fff">${ridgeHipFt}</div>
        <div style="font-size:7px;color:#7eafd4">ft</div>
      </div>
    </div>
  </div>
  ${ftr(2)}
</div>

<!-- ==================== PAGE 3: PROFESSIONAL ROOF MEASUREMENT DIAGRAM ==================== -->
<div class="page">
  <div style="background:#002244;padding:10px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:1px">PROFESSIONAL ROOF MEASUREMENT REPORT</div>
    <div style="color:#7eafd4;font-size:9px;text-align:right">Overhead view of the structure for your reference</div>
  </div>
  <div style="background:#003366;padding:6px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:10px;font-weight:600">${fullAddress}</div>
    <div style="color:#8eb8db;font-size:9px">Report: ${reportNum} &bull; ${reportDateShort}</div>
  </div>

  <!-- Architectural Measurement Diagram -->
  <div style="padding:6px 12px 0">
    <div style="max-width:700px;margin:0 auto">
      ${architecturalDiagramSVG}
    </div>
    ${report.ai_geometry ? '<div style="text-align:center;margin-top:2px"><span style="font-size:6.5px;color:#94a3b8;font-style:italic">AI-Generated Roof Diagram &mdash; traced from satellite imagery by Gemini Vision</span></div>' : ''}
  </div>

  <!-- Bottom info row: satellite thumbnail + measurement notes -->
  <div style="padding:3px 20px 0;display:flex;gap:12px;align-items:flex-start">
    ${overheadUrl ? `<div style="flex:0 0 160px;position:relative;border:1px solid #ccc;border-radius:3px;overflow:hidden"><img src="${overheadUrl}" alt="Satellite" style="width:160px;height:160px;display:block;object-fit:cover" onerror="this.parentElement.style.display='none'"><div style="position:absolute;top:0;left:0;width:160px;height:160px">${preciseOverlaySVG}</div><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,34,68,0.88);padding:2px 6px;text-align:center"><span style="font-size:6.5px;color:#7eafd4;font-weight:600">AI SATELLITE OVERLAY</span></div></div>` : ''}
    <div style="flex:1;font-size:8px;color:#4a5568;line-height:1.45">
      <div style="font-weight:700;margin-bottom:3px;color:#002244;font-size:8.5px">Measurement Notes</div>
      <div>All dimensions shown in decimal feet. Crosshatch fills indicate individual roof facets (slope planes). Bold perimeter outline traces the complete drip line / gutter edge. Interior lines indicate ridges, hips, and valleys. Facets are numbered for reference.</div>
      <div style="margin-top:4px;padding-top:3px;border-top:1px solid #e5e8ed;font-style:italic;color:#64748b">Pitch: ${predominantPitch} &bull; True Area: ${Math.round(report.total_true_area_sqft).toLocaleString()} ft&sup2; &bull; Footprint: ${Math.round(report.total_footprint_sqft).toLocaleString()} ft&sup2; &bull; Eaves: ${es.total_eave_ft} ft &bull; Ridge+Hip: ${ridgeHipFt} ft</div>
    </div>
  </div>

  ${ftr(3)}
</div>

<!-- ==================== PAGE 4: ROTATED SIDE VIEWS ==================== -->
<div class="page">
  ${hdr('IMAGES', 'Rotated Side Views &mdash; N / S / E / W')}
  <div style="padding:16px 32px 50px">
    <div style="font-size:10px;color:#4a5568;font-style:italic;margin-bottom:10px">The same house viewed from four compass directions &mdash; North, South, East, and West &mdash; providing a rotated perspective of each side of the structure.</div>

    <!-- N / S row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="ic">
        ${img(northUrl, 'North Side View', '200px')}
        <div class="ic-label"><i class="fas fa-compass" style="margin-right:4px"></i>North Side &mdash; Facing South</div>
      </div>
      <div class="ic">
        ${img(southUrl, 'South Side View', '200px')}
        <div class="ic-label"><i class="fas fa-compass" style="margin-right:4px"></i>South Side &mdash; Facing North</div>
      </div>
    </div>

    <!-- E / W row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="ic">
        ${img(eastUrl, 'East Side View', '200px')}
        <div class="ic-label"><i class="fas fa-compass" style="margin-right:4px"></i>East Side &mdash; Facing West</div>
      </div>
      <div class="ic">
        ${img(westUrl, 'West Side View', '200px')}
        <div class="ic-label"><i class="fas fa-compass" style="margin-right:4px"></i>West Side &mdash; Facing East</div>
      </div>
    </div>
  </div>
  ${ftr(4)}
</div>

<!-- ==================== PAGE 5: CLOSE-UP DETAIL & PROPERTY CONTEXT ==================== -->
<div class="page">
  ${hdr('CLOSE-UP DETAIL', 'Roof Quadrant Views &amp; Property Context')}
  <div style="padding:14px 32px 50px">
    <div style="font-size:10px;color:#4a5568;font-style:italic;margin-bottom:10px">Close-up quadrant satellite views for detailed inspection of roof sections, plus wider property context imagery.</div>

    <!-- Quadrant close-ups: NW / NE -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="ic">
        ${img(nwUrl, 'Northwest Quadrant', '180px')}
        <div class="ic-label">Northwest Quadrant</div>
      </div>
      <div class="ic">
        ${img(neUrl, 'Northeast Quadrant', '180px')}
        <div class="ic-label">Northeast Quadrant</div>
      </div>
    </div>

    <!-- Quadrant close-ups: SW / SE -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="ic">
        ${img(swUrl, 'Southwest Quadrant', '180px')}
        <div class="ic-label">Southwest Quadrant</div>
      </div>
      <div class="ic">
        ${img(seUrl, 'Southeast Quadrant', '180px')}
        <div class="ic-label">Southeast Quadrant</div>
      </div>
    </div>

    <!-- Property Context & Medium Views -->
    <div style="font-size:10px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Property Context</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="ic">
        ${img(mediumUrl, 'Property View', '195px')}
        <div class="ic-label">Property &amp; Lot View</div>
      </div>
      <div class="ic">
        ${img(contextUrl, 'Neighborhood Context', '195px')}
        <div class="ic-label">Neighborhood Context</div>
      </div>
    </div>

    <!-- Quick reference bar -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">
      <div style="text-align:center;padding:6px 4px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:4px">
        <div style="font-size:7px;color:#6b7a8d;font-weight:700;text-transform:uppercase">Total Area</div>
        <div style="font-size:14px;font-weight:900;color:#003366">${report.total_true_area_sqft.toLocaleString()}</div>
        <div style="font-size:7px;color:#6b7a8d">sq ft</div>
      </div>
      <div style="text-align:center;padding:6px 4px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:4px">
        <div style="font-size:7px;color:#6b7a8d;font-weight:700;text-transform:uppercase">Facets</div>
        <div style="font-size:14px;font-weight:900;color:#003366">${report.segments.length}</div>
        <div style="font-size:7px;color:#6b7a8d">planes</div>
      </div>
      <div style="text-align:center;padding:6px 4px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:4px">
        <div style="font-size:7px;color:#6b7a8d;font-weight:700;text-transform:uppercase">Pitch</div>
        <div style="font-size:14px;font-weight:900;color:#003366">${predominantPitch}</div>
        <div style="font-size:7px;color:#6b7a8d">predominant</div>
      </div>
      <div style="text-align:center;padding:6px 4px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:4px">
        <div style="font-size:7px;color:#6b7a8d;font-weight:700;text-transform:uppercase">Squares</div>
        <div style="font-size:14px;font-weight:900;color:#003366">${grossSquares}</div>
        <div style="font-size:7px;color:#6b7a8d">gross</div>
      </div>
    </div>
  </div>
  ${ftr(5)}
</div>

<!-- ==================== PAGE 6: LENGTH DIAGRAM ==================== -->
<div class="page">
  ${hdr('LENGTH BLUEPRINT', 'Edge Lengths &amp; Flashing Summary')}
  <div style="padding:14px 32px 50px">
    <div style="font-size:10px;color:#4a5568;font-style:italic;margin-bottom:8px">Diagram shows segment lengths rounded to the nearest whole number. Line colors indicate edge type per the legend below.</div>

    <!-- Color Legend — EagleView style -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px 12px;background:#f4f6f9;border:1px solid #d5dae3;border-radius:4px;margin-bottom:10px;font-size:8.5px;font-weight:600">
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#C62828;display:inline-block;border-radius:1px"></span>Ridge</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#F9A825;display:inline-block;border-radius:1px"></span>Hip</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#1565C0;display:inline-block;border-radius:1px"></span>Valley</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#2E7D32;display:inline-block;border-radius:1px"></span>Rake</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#212121;display:inline-block;border-radius:1px"></span>Eave</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#E65100;display:inline-block;border-radius:1px"></span>Step Flash</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#6A1B9A;display:inline-block;border-radius:1px"></span>Wall Flash</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#00838F;display:inline-block;border-radius:1px"></span>Transition</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:20px;height:3px;background:#4E342E;display:inline-block;border-radius:1px"></span>Parapet</div>
    </div>

    <!-- CAD-style Blueprint: LENGTH MODE (white background, no satellite) -->
    <div style="text-align:center;border:1px solid #d5dae3;border-radius:4px;overflow:hidden;background:#fff">
      <svg viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:380px">${blueprintLengthSVG}</svg>
    </div>

    <!-- Total Line Lengths summary -->
    <div style="font-size:10px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 6px">Total Line Lengths</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;font-size:9px;font-weight:600;margin-bottom:4px">
      <div style="text-align:center;padding:5px 3px;border:2px solid #C62828;border-radius:4px"><div style="color:#C62828;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Ridges</div><div style="font-size:15px;font-weight:900;color:#C62828">${es.total_ridge_ft}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #F9A825;border-radius:4px"><div style="color:#F9A825;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Hips</div><div style="font-size:15px;font-weight:900;color:#F9A825">${es.total_hip_ft}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #1565C0;border-radius:4px"><div style="color:#1565C0;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Valleys</div><div style="font-size:15px;font-weight:900;color:#1565C0">${es.total_valley_ft}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #2E7D32;border-radius:4px"><div style="color:#2E7D32;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Rakes</div><div style="font-size:15px;font-weight:900;color:#2E7D32">${es.total_rake_ft}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #212121;border-radius:4px"><div style="color:#212121;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Eaves</div><div style="font-size:15px;font-weight:900;color:#212121">${es.total_eave_ft}</div><div style="font-size:7px;color:#888">ft</div></div>
    </div>
    <!-- Flashing & Transition row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;font-size:9px;font-weight:600">
      <div style="text-align:center;padding:5px 3px;border:2px solid #E65100;border-radius:4px"><div style="color:#E65100;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Step Flash</div><div style="font-size:15px;font-weight:900;color:#E65100">${stepFlashingFt}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #6A1B9A;border-radius:4px"><div style="color:#6A1B9A;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Wall Flash</div><div style="font-size:15px;font-weight:900;color:#6A1B9A">${wallFlashingFt}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #00838F;border-radius:4px"><div style="color:#00838F;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Transitions</div><div style="font-size:15px;font-weight:900;color:#00838F">${transitionFt}</div><div style="font-size:7px;color:#888">ft</div></div>
      <div style="text-align:center;padding:5px 3px;border:2px solid #4E342E;border-radius:4px"><div style="color:#4E342E;font-size:7px;text-transform:uppercase;letter-spacing:0.5px">Parapet</div><div style="font-size:15px;font-weight:900;color:#4E342E">${parapetFt}</div><div style="font-size:7px;color:#888">ft</div></div>
    </div>

    <!-- Edge Details Table -->
    <div style="margin-top:8px;max-height:260px;overflow:hidden">
      <table class="ev-tbl">
        <thead><tr><th>Edge Type</th><th>Label</th><th style="text-align:center">Plan Length (ft)</th><th>True Length (ft)</th></tr></thead>
        <tbody>
          ${report.edges.slice(0, 16).map(e => {
            const typeColors: Record<string, string> = { ridge: '#C62828', hip: '#F9A825', valley: '#1565C0', rake: '#2E7D32', eave: '#212121', step_flashing: '#E65100', wall_flashing: '#6A1B9A', transition: '#00838F', parapet: '#4E342E' }
            const edgeColor = typeColors[e.edge_type] || '#003366'
            return `<tr><td><span style="display:inline-block;width:10px;height:3px;background:${edgeColor};border-radius:1px;margin-right:4px;vertical-align:middle"></span><span style="text-transform:capitalize;font-weight:600">${e.edge_type.replace('_', ' ')}</span></td><td>${e.label}</td><td style="text-align:center">${e.plan_length_ft}</td><td>${e.true_length_ft}</td></tr>`
          }).join('')}
          <tr class="row-total"><td colspan="2">Total (${report.edges.length} edges)</td><td style="text-align:center">${Math.round(report.edges.reduce((s, e) => s + e.plan_length_ft, 0))}</td><td>${Math.round(report.edges.reduce((s, e) => s + e.true_length_ft, 0))}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  ${ftr(6)}
</div>

<!-- Pages 7-10 and Legal Disclaimer removed — report truncated to 6 pages -->

${report.customer_price_per_bundle ? buildCustomerPricingHTML(report) : ''}

${report.vision_findings ? buildVisionFindingsHTML(report.vision_findings) : ''}

<script>
// Street View grey-detection: if image is mostly grey, it's a Google placeholder
document.querySelectorAll('img[alt="Street View"]').forEach(function(img){
  try {
    img.addEventListener('load', function(){
      try {
        var c = document.createElement('canvas');
        c.width = 20; c.height = 20;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 20, 20);
        var d = ctx.getImageData(0,0,20,20).data;
        var grey = 0;
        for(var i=0; i<d.length; i+=4){
          if(Math.abs(d[i]-d[i+1])<8 && Math.abs(d[i+1]-d[i+2])<8 && d[i]>180 && d[i]<240) grey++;
        }
        if(grey >= 12){
          img.outerHTML = '<div style="height:190px;background:#e8ecf1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;border-radius:3px">Street View not available for this location</div>';
        }
      } catch(e){}
    });
  } catch(e){}
});
</script>
</body>
</html>`
}

// ============================================================
// HELPER: Build Vision Findings HTML section for professional report
// Renders the multimodal AI inspection results as a styled page
// ============================================================

// ============================================================
// HELPER: Build Vision Findings HTML section for professional report
// ============================================================
export function buildVisionFindingsHTML(vf: VisionFindings): string {
  if (!vf || !vf.findings || vf.findings.length === 0) return ''

  const hs = vf.heat_score
  const heatColor = hs.total >= 75 ? '#dc2626' : hs.total >= 50 ? '#ea580c' : hs.total >= 25 ? '#d97706' : '#059669'
  const heatBg = hs.total >= 75 ? '#fef2f2' : hs.total >= 50 ? '#fff7ed' : hs.total >= 25 ? '#fffbeb' : '#ecfdf5'
  const condColor: Record<string, string> = { excellent: '#059669', good: '#16a34a', fair: '#d97706', poor: '#ea580c', critical: '#dc2626' }

  const severityBadge = (sev: string) => {
    const c: Record<string, [string, string]> = { low: ['#ecfdf5', '#059669'], moderate: ['#fffbeb', '#d97706'], high: ['#fff7ed', '#ea580c'], critical: ['#fef2f2', '#dc2626'] }
    const [bg, fg] = c[sev] || ['#f1f5f9', '#475569']
    return `<span style="padding:2px 6px;border-radius:2px;font-size:7px;font-weight:700;background:${bg};color:${fg};text-transform:uppercase">${sev}</span>`
  }

  const catIcon: Record<string, string> = { vulnerability: '&#9888;', obstruction: '&#9899;', environmental: '&#127795;', condition: '&#128269;' }

  const findingsRows = vf.findings.slice(0, 12).map(f =>
    `<tr>
      <td style="padding:4px 6px;font-size:8px">${catIcon[f.category] || '&#8226;'} ${f.label}</td>
      <td style="padding:4px 6px;font-size:8px;text-align:center">${severityBadge(f.severity)}</td>
      <td style="padding:4px 6px;font-size:8px;text-align:center">${f.confidence}%</td>
      <td style="padding:4px 6px;font-size:7.5px;color:#475569">${f.description.substring(0, 80)}${f.description.length > 80 ? '...' : ''}</td>
    </tr>`
  ).join('')

  const gaugeWidth = Math.max(5, hs.total)

  return `
<!-- ==================== VISION INSPECTION PAGE ==================== -->
<div class="page" style="page-break-before:always">
  <div style="background:#002244;padding:10px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:1px">&#128065; AI VISION INSPECTION</div>
    <div style="color:#7eafd4;font-size:9px;text-align:right">Multimodal Roof Condition Analysis &bull; ${vf.model}</div>
  </div>
  <div style="padding:16px 32px 50px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div style="background:${heatBg};border:1px solid ${heatColor}33;border-radius:6px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:${heatColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">&#128293; CRM Heat Score</div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:32px;font-weight:900;color:${heatColor}">${hs.total}</span>
          <span style="font-size:14px;color:${heatColor};font-weight:600">/100</span>
          <span style="padding:3px 10px;border-radius:3px;font-size:9px;font-weight:700;background:${heatColor};color:#fff;text-transform:uppercase;margin-left:8px">${hs.classification.replace('_', ' ')}</span>
        </div>
        <div style="background:#e2e8f0;border-radius:4px;height:8px;margin:8px 0;overflow:hidden">
          <div style="width:${gaugeWidth}%;height:100%;background:${heatColor};border-radius:4px"></div>
        </div>
        <div style="font-size:7.5px;color:#64748b">${hs.summary}</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Score Components</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:8px">
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Age & Wear</span><span style="font-weight:700">${hs.components.age_wear}/30</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Structural</span><span style="font-weight:700">${hs.components.structural}/25</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Environmental</span><span style="font-weight:700">${hs.components.environmental}/20</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Obstructions</span><span style="font-weight:700">${hs.components.obstruction_complexity}/15</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Urgency</span><span style="font-weight:700">${hs.components.urgency_bonus}/10</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b">Condition</span><span style="font-weight:700;color:${condColor[vf.overall_condition] || '#475569'};text-transform:uppercase">${vf.overall_condition}</span></div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <div style="flex:1;text-align:center;padding:6px;background:#fef2f2;border-radius:4px;border:1px solid #fecaca">
        <div style="font-size:18px;font-weight:900;color:#dc2626">${vf.findings.filter(f => f.category === 'vulnerability').length}</div>
        <div style="font-size:7px;color:#991b1b;font-weight:600">Vulnerabilities</div>
      </div>
      <div style="flex:1;text-align:center;padding:6px;background:#f0f9ff;border-radius:4px;border:1px solid #bae6fd">
        <div style="font-size:18px;font-weight:900;color:#0369a1">${vf.findings.filter(f => f.category === 'obstruction').length}</div>
        <div style="font-size:7px;color:#0c4a6e;font-weight:600">Obstructions</div>
      </div>
      <div style="flex:1;text-align:center;padding:6px;background:#ecfdf5;border-radius:4px;border:1px solid #a7f3d0">
        <div style="font-size:18px;font-weight:900;color:#059669">${vf.findings.filter(f => f.category === 'environmental').length}</div>
        <div style="font-size:7px;color:#065f46;font-weight:600">Environmental</div>
      </div>
      <div style="flex:1;text-align:center;padding:6px;background:#f5f3ff;border-radius:4px;border:1px solid #c4b5fd">
        <div style="font-size:18px;font-weight:900;color:#7c3aed">${vf.findings.filter(f => f.category === 'condition').length}</div>
        <div style="font-size:7px;color:#5b21b6;font-weight:600">Condition</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-top:4px">
      <thead>
        <tr style="background:#003366;color:#fff">
          <th style="padding:5px 6px;text-align:left;font-size:7.5px;font-weight:700">Finding</th>
          <th style="padding:5px 6px;text-align:center;font-size:7.5px;font-weight:700;width:70px">Severity</th>
          <th style="padding:5px 6px;text-align:center;font-size:7.5px;font-weight:700;width:45px">Conf.</th>
          <th style="padding:5px 6px;text-align:left;font-size:7.5px;font-weight:700">Description</th>
        </tr>
      </thead>
      <tbody>${findingsRows}</tbody>
    </table>
    ${vf.findings.length > 12 ? `<div style="font-size:7px;color:#94a3b8;text-align:center;margin-top:4px">... and ${vf.findings.length - 12} more findings</div>` : ''}
    <div style="margin-top:12px;padding:8px 12px;background:#eff6ff;border-radius:4px;border-left:3px solid #3b82f6;font-size:7.5px;color:#1e40af">
      <strong>AI Vision Note:</strong> ${vf.summary} &mdash; Inspected ${new Date(vf.inspected_at).toLocaleDateString('en-CA')} using ${vf.model}. Duration: ${vf.duration_ms}ms.
      ${vf.heat_score.total >= 50 ? '<br><strong>&#9888; Field verification strongly recommended.</strong>' : ''}
    </div>
  </div>
</div>`
}

// ============================================================
// HELPER: Generate perimeter side data for HTML table
// ============================================================
interface PerimeterSide { type: string; ft: number; ftInches: string }

export function generatePerimeterSideData(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number }
): { sides: PerimeterSide[]; totalFt: number } {
  if (!aiGeometry?.perimeter || aiGeometry.perimeter.length < 3) {
    return { sides: [], totalFt: 0 }
  }

  const perim = aiGeometry.perimeter
  const n = perim.length
  const measuredByType = smartEdgeFootage(edgeSummary)

  interface SideInfo { pxLen: number; type: string }
  const sideInfos: SideInfo[] = []
  for (let i = 0; i < n; i++) {
    const p1 = perim[i]
    const p2 = perim[(i + 1) % n]
    const pxLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    sideInfos.push({ pxLen, type: p1.edge_to_next || 'EAVE' })
  }

  const byType: Record<string, number[]> = {}
  sideInfos.forEach((s, i) => {
    if (!byType[s.type]) byType[s.type] = []
    byType[s.type].push(i)
  })

  const sideFt = new Array(n).fill(0)
  for (const [type, indices] of Object.entries(byType)) {
    const totalPxLen = indices.reduce((s, i) => s + sideInfos[i].pxLen, 0)
    const totalFt = measuredByType[type] || 0
    if (totalPxLen > 0 && totalFt > 0) {
      indices.forEach(i => { sideFt[i] = (sideInfos[i].pxLen / totalPxLen) * totalFt })
    }
  }

  const sides: PerimeterSide[] = sideInfos.map((s, i) => ({
    type: s.type,
    ft: Math.round(sideFt[i] * 10) / 10,
    ftInches: feetToFeetInches(sideFt[i])
  }))

  const totalFt = Math.round(sides.reduce((s, side) => s + side.ft, 0) * 10) / 10
  return { sides, totalFt }
}

// ============================================================
// Customer Pricing Estimate — Page Section
// Shows cost estimate based on customer-provided price per bundle
// ============================================================
function buildCustomerPricingHTML(report: RoofReport): string {
  const pricePerBundle = report.customer_price_per_bundle || 0
  const grossSquares = report.customer_gross_squares || 0
  const totalCost = report.customer_total_cost_estimate || 0
  const trueArea = report.total_true_area_sqft || 0
  const netSquares = Math.round(trueArea / 100 * 10) / 10
  const wasteArea = Math.round(trueArea * 0.15)

  return `
<div style="page-break-before:always;max-width:1050px;margin:0 auto;padding:35px 40px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#fff">
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #f59e0b">
    <div>
      <div style="font-size:18px;font-weight:900;color:#92400e;letter-spacing:0.3px">
        <span style="display:inline-block;width:28px;height:28px;background:#f59e0b;color:white;text-align:center;line-height:28px;border-radius:4px;font-size:14px;margin-right:8px">$</span>
        CUSTOMER COST ESTIMATE
      </div>
      <div style="font-size:10px;color:#92400e;margin-top:4px;font-weight:500">Roof Replacement Pricing — Based on Client-Provided Rate</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.5px">Property</div>
      <div style="font-size:11px;font-weight:700;color:#003366">${report.property?.address || ''}</div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div style="display:flex;gap:16px;margin-bottom:24px">
    <!-- Net Roof Area -->
    <div style="flex:1;background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:10px;padding:18px;text-align:center;border:1px solid #f59e0b30">
      <div style="font-size:9px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Net Roof Area</div>
      <div style="font-size:26px;font-weight:900;color:#92400e;margin:6px 0">${trueArea.toLocaleString()}</div>
      <div style="font-size:10px;color:#b45309">sq ft</div>
    </div>
    <!-- Waste Allowance -->
    <div style="flex:1;background:linear-gradient(135deg,#fff7ed,#fed7aa);border-radius:10px;padding:18px;text-align:center;border:1px solid #f59e0b30">
      <div style="font-size:9px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:0.8px">15% Waste Allowance</div>
      <div style="font-size:26px;font-weight:900;color:#ea580c;margin:6px 0">+${wasteArea.toLocaleString()}</div>
      <div style="font-size:10px;color:#b45309">sq ft</div>
    </div>
    <!-- Gross Squares -->
    <div style="flex:1;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;padding:18px;text-align:center;color:white">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;opacity:0.85">Total Squares</div>
      <div style="font-size:26px;font-weight:900;margin:6px 0">${grossSquares}</div>
      <div style="font-size:10px;opacity:0.85">(with 15% waste)</div>
    </div>
    <!-- Price Per Square -->
    <div style="flex:1;background:linear-gradient(135deg,#eef2ff,#c7d2fe);border-radius:10px;padding:18px;text-align:center;border:1px solid #818cf830">
      <div style="font-size:9px;color:#3730a3;font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Rate Per Square</div>
      <div style="font-size:26px;font-weight:900;color:#4338ca;margin:6px 0">$${pricePerBundle.toLocaleString()}</div>
      <div style="font-size:10px;color:#6366f1">CAD</div>
    </div>
  </div>

  <!-- Total Cost Estimate -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);border-radius:12px;padding:28px 32px;color:white;text-align:center;margin-bottom:24px;position:relative;overflow:hidden">
    <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:rgba(245,158,11,0.15);border-radius:50%"></div>
    <div style="position:absolute;bottom:-30px;left:-10px;width:80px;height:80px;background:rgba(245,158,11,0.1);border-radius:50%"></div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;opacity:0.7;margin-bottom:8px">Estimated Roof Replacement Cost</div>
    <div style="font-size:48px;font-weight:900;color:#fbbf24;text-shadow:0 2px 8px rgba(0,0,0,0.3)">$${totalCost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    <div style="font-size:12px;margin-top:6px;opacity:0.6">Canadian Dollars (CAD)</div>
  </div>

  <!-- Calculation Breakdown -->
  <div style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:20px;margin-bottom:20px">
    <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:12px">
      <span style="display:inline-block;width:18px;height:18px;background:#f59e0b;color:white;text-align:center;line-height:18px;border-radius:3px;font-size:10px;margin-right:6px">&#8614;</span>
      Calculation Breakdown
    </div>
    <table style="width:100%;font-size:11px;border-collapse:collapse">
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 0;color:#64748b">Net Roof Area (3D true area)</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#334155">${trueArea.toLocaleString()} sq ft</td>
      </tr>
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 0;color:#64748b">Net Squares (area \u00F7 100)</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#334155">${netSquares}</td>
      </tr>
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 0;color:#64748b">Waste Factor</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#ea580c">+15%</td>
      </tr>
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 0;color:#64748b">Gross Squares (with waste)</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#334155">${grossSquares}</td>
      </tr>
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 0;color:#64748b">Price Per Square (client rate)</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:#4338ca">$${pricePerBundle.toLocaleString()} CAD</td>
      </tr>
      <tr style="background:#f1f5f9">
        <td style="padding:10px 0;font-weight:800;color:#0f172a;font-size:12px">TOTAL ESTIMATED COST</td>
        <td style="padding:10px 0;text-align:right;font-weight:900;color:#d97706;font-size:14px">$${totalCost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD</td>
      </tr>
    </table>
  </div>

  <!-- Disclaimer -->
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;font-size:9px;color:#92400e;line-height:1.6">
    <strong style="font-size:10px">ESTIMATE DISCLAIMER:</strong> This cost estimate is based on the client-provided rate of $${pricePerBundle}/square and AI-measured roof area with 15% waste factor. Actual costs may vary depending on: roof complexity, existing material removal, structural repairs, flashing details, code requirements, and regional pricing. This estimate does not include additional materials (underlayment, flashing, vents, etc.). A professional on-site assessment is recommended for a final quote.
  </div>
</div>`
}
