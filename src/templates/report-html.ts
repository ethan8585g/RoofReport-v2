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
  // PRIORITY: Use trace-based diagram if user traced the roof (actual GPS shape)
  // FALLBACK: Use AI pixel-geometry diagram from Solar API / Gemini
  let architecturalDiagramSVG: string
  const hasTraceDiagram = !!(report as any).trace_diagram_svg
  if (hasTraceDiagram) {
    architecturalDiagramSVG = (report as any).trace_diagram_svg
  } else {
    architecturalDiagramSVG = generateArchitecturalDiagramSVG(
      report.ai_geometry, report.segments, report.edges, es,
      report.total_footprint_sqft, report.roof_pitch_degrees || predominantPitchDeg || 20,
      predominantPitch, grossSquares
    )
  }

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
  const TOTAL_PAGES = 3
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
        ['Satellite Imagery &amp; Roof Overlay', '2'],
        ['Measurement Diagram, Edges &amp; Materials', '3'],
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

<!-- ==================== PAGE 2: SATELLITE IMAGERY & ROOF OVERLAY ==================== -->
<div class="page">
  ${hdr('SATELLITE IMAGERY', 'Overhead View with AI Roof Overlay')}
  <div style="padding:12px 32px 50px">
    <!-- Large overhead satellite with overlay -->
    <div style="position:relative;border:1px solid #d5dae3;border-radius:4px;overflow:hidden;background:#e8ecf1;text-align:center">
      ${overheadUrl ? `<img src="${overheadUrl}" alt="Top View" style="width:100%;max-height:420px;object-fit:cover;display:block" onerror="this.style.display='none'">` : '<div style="height:420px;background:#e8ecf1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px">Satellite imagery not available</div>'}
      ${hasOverlay ? `<svg viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">${overlaySVG}</svg>` : ''}
    </div>
    <div style="font-size:8px;font-weight:700;color:#003366;padding:4px 0;text-transform:uppercase;letter-spacing:0.5px">${hasOverlay ? 'Measured Roof Overlay on Satellite' : 'Overhead Satellite View'}</div>
    ${overlayLegend ? `<div style="margin-top:2px">${overlayLegend}</div>` : ''}

    <!-- Quick measurement bar -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px">
      <div style="text-align:center;padding:6px 3px;background:#003366;border-radius:4px">
        <div style="font-size:6.5px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Total Area</div>
        <div style="font-size:14px;font-weight:900;color:#fff">${report.total_true_area_sqft.toLocaleString()}</div>
        <div style="font-size:6.5px;color:#7eafd4">sq ft</div>
      </div>
      <div style="text-align:center;padding:6px 3px;background:#003366;border-radius:4px">
        <div style="font-size:6.5px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Facets</div>
        <div style="font-size:14px;font-weight:900;color:#fff">${report.segments.length}</div>
        <div style="font-size:6.5px;color:#7eafd4">planes</div>
      </div>
      <div style="text-align:center;padding:6px 3px;background:#003366;border-radius:4px">
        <div style="font-size:6.5px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Pitch</div>
        <div style="font-size:14px;font-weight:900;color:#fff">${predominantPitch}</div>
        <div style="font-size:6.5px;color:#7eafd4">predominant</div>
      </div>
      <div style="text-align:center;padding:6px 3px;background:#003366;border-radius:4px">
        <div style="font-size:6.5px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Squares</div>
        <div style="font-size:14px;font-weight:900;color:#fff">${grossSquares}</div>
        <div style="font-size:6.5px;color:#7eafd4">gross</div>
      </div>
      <div style="text-align:center;padding:6px 3px;background:#003366;border-radius:4px">
        <div style="font-size:6.5px;color:#7eafd4;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Ridge+Hip</div>
        <div style="font-size:14px;font-weight:900;color:#fff">${ridgeHipFt}</div>
        <div style="font-size:6.5px;color:#7eafd4">ft</div>
      </div>
    </div>

    <!-- N/S/E/W side views in compact strip -->
    <div style="font-size:9px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:0.8px;margin:10px 0 5px">Rotated Side Views</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
      <div class="ic">${img(northUrl, 'North', '100px')}<div class="ic-label">North</div></div>
      <div class="ic">${img(southUrl, 'South', '100px')}<div class="ic-label">South</div></div>
      <div class="ic">${img(eastUrl, 'East', '100px')}<div class="ic-label">East</div></div>
      <div class="ic">${img(westUrl, 'West', '100px')}<div class="ic-label">West</div></div>
    </div>
  </div>
  ${ftr(2)}
</div>

<!-- ==================== PAGE 3: MEASUREMENT DIAGRAM, EDGES & MATERIALS ==================== -->
<div class="page">
  ${hdr('ROOF MEASUREMENTS', 'Diagram, Edge Lengths &amp; Materials')}
  <div style="padding:10px 24px 50px">
    <div style="display:grid;grid-template-columns:55% 45%;gap:10px">
      <!-- LEFT: Architectural diagram -->
      <div>
        <div style="text-align:center;border:1px solid #d5dae3;border-radius:4px;overflow:hidden;background:#fff;max-height:280px">
          ${architecturalDiagramSVG}
        </div>
        <div style="text-align:center;font-size:6px;color:#94a3b8;margin-top:2px">AI-Generated Roof Diagram &mdash; Measurements in feet</div>
      </div>
      <!-- RIGHT: Edge summary + waste table -->
      <div>
        <!-- Color legend -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:5px 8px;background:#f4f6f9;border:1px solid #d5dae3;border-radius:4px;margin-bottom:6px;font-size:7.5px;font-weight:600">
          <div style="display:flex;align-items:center;gap:3px"><span style="width:14px;height:2.5px;background:#C62828;display:inline-block;border-radius:1px"></span>Ridge</div>
          <div style="display:flex;align-items:center;gap:3px"><span style="width:14px;height:2.5px;background:#F9A825;display:inline-block;border-radius:1px"></span>Hip</div>
          <div style="display:flex;align-items:center;gap:3px"><span style="width:14px;height:2.5px;background:#1565C0;display:inline-block;border-radius:1px"></span>Valley</div>
          <div style="display:flex;align-items:center;gap:3px"><span style="width:14px;height:2.5px;background:#2E7D32;display:inline-block;border-radius:1px"></span>Rake</div>
          <div style="display:flex;align-items:center;gap:3px"><span style="width:14px;height:2.5px;background:#212121;display:inline-block;border-radius:1px"></span>Eave</div>
        </div>

        <!-- Total line lengths -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #C62828;border-radius:3px"><div style="color:#C62828;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Ridges</div><div style="font-size:13px;font-weight:900;color:#C62828">${es.total_ridge_ft}<span style="font-size:7px"> ft</span></div></div>
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #F9A825;border-radius:3px"><div style="color:#F9A825;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Hips</div><div style="font-size:13px;font-weight:900;color:#F9A825">${es.total_hip_ft}<span style="font-size:7px"> ft</span></div></div>
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #1565C0;border-radius:3px"><div style="color:#1565C0;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Valleys</div><div style="font-size:13px;font-weight:900;color:#1565C0">${es.total_valley_ft}<span style="font-size:7px"> ft</span></div></div>
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #212121;border-radius:3px"><div style="color:#212121;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Eaves</div><div style="font-size:13px;font-weight:900;color:#212121">${es.total_eave_ft}<span style="font-size:7px"> ft</span></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #2E7D32;border-radius:3px"><div style="color:#2E7D32;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Rakes</div><div style="font-size:13px;font-weight:900;color:#2E7D32">${es.total_rake_ft}<span style="font-size:7px"> ft</span></div></div>
          <div style="text-align:center;padding:4px 2px;border:1.5px solid #003366;border-radius:3px"><div style="color:#003366;font-size:6px;text-transform:uppercase;letter-spacing:0.3px">Total Perimeter</div><div style="font-size:13px;font-weight:900;color:#003366">${totalDripEdge}<span style="font-size:7px"> ft</span></div></div>
        </div>

        <!-- Flashing summary -->
        ${(stepFlashingFt > 0 || wallFlashingFt > 0) ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
          <div style="text-align:center;padding:3px 2px;background:#fff7ed;border:1px solid #fed7aa;border-radius:3px"><div style="font-size:6px;color:#92400e;text-transform:uppercase">Step Flash</div><div style="font-size:11px;font-weight:800;color:#92400e">${stepFlashingFt} ft</div></div>
          <div style="text-align:center;padding:3px 2px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:3px"><div style="font-size:6px;color:#6b21a8;text-transform:uppercase">Wall Flash</div><div style="font-size:11px;font-weight:800;color:#6b21a8">${wallFlashingFt} ft</div></div>
        </div>
        ` : ''}

        <!-- Waste factor table -->
        ${mat.waste_table && mat.waste_table.length > 0 ? `
        <div style="font-size:7px;font-weight:700;color:#003366;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px">Waste Factor Table</div>
        <table style="width:100%;border-collapse:collapse;font-size:7.5px">
          <thead><tr style="background:#003366;color:#fff"><th style="padding:3px 5px;text-align:left;font-size:6.5px">Waste %</th><th style="padding:3px 5px;text-align:right;font-size:6.5px">Area (ft²)</th><th style="padding:3px 5px;text-align:right;font-size:6.5px">SQ</th></tr></thead>
          <tbody>${mat.waste_table.slice(0, 5).map((w: any) => `<tr style="${w.is_suggested ? 'background:#e6f0fa;font-weight:700' : ''}"><td style="padding:2px 5px;border-bottom:1px solid #eee">${w.waste_pct}%${w.label ? ' (' + w.label + ')' : ''}</td><td style="padding:2px 5px;border-bottom:1px solid #eee;text-align:right">${w.area_sqft.toLocaleString()}</td><td style="padding:2px 5px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${w.squares}</td></tr>`).join('')}</tbody>
        </table>
        ` : ''}
      </div>
    </div>

    <!-- Edge Details Table (compact) -->
    <div style="margin-top:6px">
      <div style="font-size:8px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Edge Details</div>
      <table class="ev-tbl">
        <thead><tr><th>Edge Type</th><th>Label</th><th style="text-align:center">Plan (ft)</th><th>True (ft)</th></tr></thead>
        <tbody>
          ${report.edges.slice(0, 12).map(e => {
            const typeColors: Record<string, string> = { ridge: '#C62828', hip: '#F9A825', valley: '#1565C0', rake: '#2E7D32', eave: '#212121', step_flashing: '#E65100', wall_flashing: '#6A1B9A', transition: '#00838F', parapet: '#4E342E' }
            const edgeColor = typeColors[e.edge_type] || '#003366'
            return `<tr><td><span style="display:inline-block;width:8px;height:2.5px;background:${edgeColor};border-radius:1px;margin-right:3px;vertical-align:middle"></span><span style="text-transform:capitalize;font-weight:600;font-size:8px">${e.edge_type.replace('_', ' ')}</span></td><td style="font-size:8px">${e.label}</td><td style="text-align:center;font-size:8px">${e.plan_length_ft}</td><td style="font-size:8px;font-weight:700">${e.true_length_ft}</td></tr>`
          }).join('')}
          <tr class="row-total"><td colspan="2" style="font-size:8px">Total (${report.edges.length} edges)</td><td style="text-align:center;font-size:8px">${Math.round(report.edges.reduce((s, e) => s + e.plan_length_ft, 0))}</td><td style="font-size:8px">${Math.round(report.edges.reduce((s, e) => s + e.true_length_ft, 0))}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Compact materials summary -->
    <div style="margin-top:6px">
      <div style="font-size:8px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Material Estimate (Architectural Shingles)</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;font-size:7.5px">
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Shingles</div><div style="font-size:12px;font-weight:900;color:#003366">${mat.bundle_count || Math.ceil((grossSquares || 0) * 3)}</div><div style="font-size:6px;color:#6b7a8d">bundles</div></div>
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Underlay</div><div style="font-size:12px;font-weight:900;color:#003366">${mat.line_items?.find((i: any) => i.category === 'underlayment')?.order_quantity || Math.ceil((grossSquares || 0) / 4)}</div><div style="font-size:6px;color:#6b7a8d">rolls</div></div>
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Ice Shield</div><div style="font-size:12px;font-weight:900;color:#003366">${mat.line_items?.find((i: any) => i.category === 'ice_shield')?.order_quantity || Math.ceil((es.total_eave_ft * 3) / 75)}</div><div style="font-size:6px;color:#6b7a8d">rolls</div></div>
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Ridge Cap</div><div style="font-size:12px;font-weight:900;color:#003366">${mat.line_items?.find((i: any) => i.category === 'ridge_cap')?.order_quantity || Math.ceil(ridgeHipFt / 33)}</div><div style="font-size:6px;color:#6b7a8d">bundles</div></div>
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Starter</div><div style="font-size:12px;font-weight:900;color:#003366">${mat.line_items?.find((i: any) => i.category === 'starter_strip')?.order_quantity || Math.ceil(starterStripFt / 105)}</div><div style="font-size:6px;color:#6b7a8d">bundles</div></div>
        <div style="text-align:center;padding:4px 2px;background:#f4f7fb;border:1px solid #d5dae3;border-radius:3px"><div style="font-size:6px;color:#6b7a8d;font-weight:700">Drip Edge</div><div style="font-size:12px;font-weight:900;color:#003366">${Math.ceil(totalDripEdge / 10)}</div><div style="font-size:6px;color:#6b7a8d">10ft pcs</div></div>
      </div>
    </div>

    <!-- Measurement methodology note -->
    <div style="margin-top:6px;padding:5px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;font-size:6.5px;color:#0369a1;line-height:1.4">
      <strong>Measurement Methodology:</strong> Primary measurements from user-drawn GPS trace coordinates using UTM projection &amp; Shoelace formula. Pitch multiplier applied for true 3D surface area. Google Solar API provides satellite imagery &amp; optional DSM elevation cross-check. Engine v3.0.
    </div>
  </div>
  ${ftr(3)}
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
// SIMPLE TWO-PAGE MEASUREMENT REPORT
// Page 1: Roof Area Analysis — diagram + measurement tables (Portrait)
// Page 2: Project Totals Summary — slope breakdown, measurements,
//         satellite image, waste factor table (Landscape)
// Matches the RoofReporterAI / RoofScope template style
// ============================================================
export function generateSimpleTwoPageReport(report: RoofReport): string {
  const prop = report.property || { address: 'Unknown' } as any
  const mat = report.materials || { net_area_sqft: 0, gross_squares: 0, bundle_count: 0, line_items: [], waste_table: [], waste_pct: 15, gross_area_sqft: 0, total_material_cost_cad: 0, complexity_class: 'simple', complexity_factor: 1, shingle_type: 'architectural' } as any
  const es = report.edge_summary || { total_ridge_ft: 0, total_hip_ft: 0, total_valley_ft: 0, total_eave_ft: 0, total_rake_ft: 0, total_linear_ft: 0 } as any

  // Safe defaults
  if (!report.total_true_area_sqft) report.total_true_area_sqft = report.total_footprint_sqft || 1
  if (!report.total_footprint_sqft) report.total_footprint_sqft = report.total_true_area_sqft || 1
  if (!report.area_multiplier) report.area_multiplier = report.total_true_area_sqft / (report.total_footprint_sqft || 1)
  if (!report.generated_at) report.generated_at = new Date().toISOString()

  const fullAddress = [prop.address, prop.city, prop.province, prop.postal_code].filter(Boolean).join(', ')
  const reportDate = new Date(report.generated_at).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const netSquares = Math.round(report.total_true_area_sqft / 100 * 100) / 100
  const grossSquares = mat.gross_squares || Math.round(netSquares * 1.15 * 100) / 100

  // Predominant pitch from largest segment
  const largestSeg = [...report.segments].sort((a, b) => b.true_area_sqft - a.true_area_sqft)[0]
  const predominantPitch = largestSeg?.pitch_ratio || report.roof_pitch_ratio || '5:12'
  const predominantPitchDeg = largestSeg?.pitch_degrees || report.roof_pitch_degrees || 22.6

  // Total linear
  const totalLinearFt = Math.round(es.total_ridge_ft + es.total_hip_ft + es.total_valley_ft + es.total_eave_ft + es.total_rake_ft)
  const totalPerimeter = Math.round(es.total_eave_ft + es.total_rake_ft)

  // Satellite imagery
  const overheadUrl = report.imagery?.satellite_overhead_url || report.imagery?.satellite_url || ''

  // Slope breakdown (classify segments)
  let standardSlopeArea = 0, flatSlopeArea = 0, lowSlopeArea = 0, steepSlopeArea = 0, highRoofArea = 0
  report.segments.forEach(seg => {
    const pitchRise = Math.round(Math.tan(seg.pitch_degrees * Math.PI / 180) * 12)
    if (pitchRise >= 4 && pitchRise <= 6) standardSlopeArea += seg.true_area_sqft
    else if (pitchRise <= 1) flatSlopeArea += seg.true_area_sqft
    else if (pitchRise <= 3) lowSlopeArea += seg.true_area_sqft
    else if (pitchRise >= 7) steepSlopeArea += seg.true_area_sqft
    // high roof heuristic: plane height > 1 story (~3.5m)
    if (seg.plane_height_meters && seg.plane_height_meters > 3.5) highRoofArea += seg.true_area_sqft
  })

  // IWB (Ice & Water Barrier) — 3ft up from eave on each side
  const iwbSqft = Math.round(es.total_eave_ft * 3)

  // Facet colors for diagram
  const facetColors = ['#4A90D9','#E8634A','#5CB85C','#F5A623','#9B59B6','#E84393','#2ECC71','#F39C12','#3498DB','#8E44AD','#E67E22','#27AE60']

  // Generate diagram SVG (reuse architectural diagram)
  let diagramSVG: string
  const hasTraceDiagram = !!(report as any).trace_diagram_svg
  if (hasTraceDiagram) {
    diagramSVG = (report as any).trace_diagram_svg
  } else {
    diagramSVG = generateArchitecturalDiagramSVG(
      report.ai_geometry, report.segments, report.edges, es,
      report.total_footprint_sqft, predominantPitchDeg,
      predominantPitch, grossSquares
    )
  }

  // Edge summary for the measurement table
  const edgeRows: { type: string; color: string; count: number; totalFt: number }[] = []
  const edgeTypeMap: Record<string, { color: string; count: number; totalFt: number }> = {}
  report.edges.forEach(e => {
    const key = e.edge_type
    if (!edgeTypeMap[key]) edgeTypeMap[key] = { color: '#333', count: 0, totalFt: 0 }
    edgeTypeMap[key].count++
    edgeTypeMap[key].totalFt += e.true_length_ft
  })
  const edgeColorMap: Record<string, string> = {
    eave: '#D40000', ridge: '#FFB800', hip: '#00BCD4', valley: '#00CC00',
    rake: '#7C3AED', step_flashing: '#E65100', wall_flashing: '#9C27B0',
    transition: '#607D8B', parapet: '#795548', gable: '#7C3AED', flashing: '#E65100'
  }
  Object.entries(edgeTypeMap).forEach(([type, data]) => {
    edgeRows.push({ type, color: edgeColorMap[type] || '#555', count: data.count, totalFt: Math.round(data.totalFt * 10) / 10 })
  })

  // Segment area table rows
  const segAreaRows = report.segments.map((seg, i) => ({
    label: String.fromCharCode(65 + i), // A, B, C...
    area: Math.round(seg.true_area_sqft * 10) / 10,
    pitch: seg.pitch_ratio,
    multiplier: Math.round(report.area_multiplier * 10000) / 10000
  }))

  // Waste factor table: 4%-15%
  const wasteTableEntries = []
  for (let pct = 4; pct <= 15; pct++) {
    const sq = Math.round(netSquares * (1 + pct / 100) * 100) / 100
    wasteTableEntries.push({ pct, sq })
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Roof Measurement Report | ${fullAddress}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fff;color:#1a1a2e;font-size:9pt;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.page{page-break-after:always;min-height:auto;box-shadow:none;margin:0}body{background:#fff}}
@media screen{.page{box-shadow:0 2px 16px rgba(0,0,0,0.10);margin:20px auto}}
.page{background:#fff;position:relative;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
.page-portrait{width:8.5in;min-height:11in}
.page-landscape{width:11in;min-height:8.5in}
</style>
</head>
<body>

<!-- ==================== PAGE 1: ROOF AREA ANALYSIS (Portrait 8.5×11) ==================== -->
<div class="page page-portrait">
  <!-- Red top accent bar -->
  <div style="height:6px;background:linear-gradient(90deg,#CC0000,#E60000)"></div>

  <!-- Title + Address -->
  <div style="padding:14px 28px 8px">
    <div style="font-size:17px;font-weight:800;color:#1a1a1a;letter-spacing:0.3px">Roof Area Analysis<span style="font-weight:400;color:#555"> &mdash; Structure 1</span></div>
    <div style="font-size:10px;color:#444;margin-top:2px;font-weight:500">${fullAddress}</div>
  </div>

  <!-- Main Diagram Section (~58% of page) -->
  <div style="padding:0 22px">
    <div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#fff;max-height:460px">
      ${diagramSVG}
    </div>
  </div>

  <!-- ESTIMATED ROOFER MEASUREMENTS header -->
  <div style="text-align:center;padding:8px 28px 4px">
    <div style="font-size:10px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:1.5px;border-top:1.5px solid #ccc;border-bottom:1.5px solid #ccc;padding:5px 0">Estimated Roofer Measurements</div>
  </div>

  <!-- Two-column tables -->
  <div style="padding:0 22px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <!-- LEFT TABLE: Measurement Totals by Material & Section -->
    <div>
      <table style="width:100%;border-collapse:collapse;font-size:7.5px">
        <thead>
          <tr style="background:#001a44;color:#fff">
            <th style="padding:4px 6px;text-align:left;font-size:7px;font-weight:700">Section</th>
            <th style="padding:4px 6px;text-align:left;font-size:7px;font-weight:700">Line Type</th>
            <th style="padding:4px 6px;text-align:center;font-size:7px;font-weight:700">Count</th>
            <th style="padding:4px 6px;text-align:right;font-size:7px;font-weight:700">Length (LF)</th>
          </tr>
        </thead>
        <tbody>
          ${edgeRows.map((r, i) => `
          <tr style="border-bottom:1px solid #eee;${i % 2 === 0 ? '' : 'background:#f9fafb'}">
            <td style="padding:3px 6px;font-weight:600;font-size:7.5px">${String.fromCharCode(65 + i)}</td>
            <td style="padding:3px 6px;font-size:7.5px"><span style="display:inline-block;width:10px;height:3px;background:${r.color};border-radius:1px;margin-right:4px;vertical-align:middle"></span><span style="text-transform:capitalize">${r.type.replace(/_/g, ' ')}</span></td>
            <td style="padding:3px 6px;text-align:center;font-size:7.5px">${r.count}</td>
            <td style="padding:3px 6px;text-align:right;font-weight:700;font-size:7.5px">${r.totalFt}</td>
          </tr>`).join('')}
          <tr style="border-top:2px solid #001a44;background:#f0f3f7">
            <td colspan="3" style="padding:4px 6px;font-weight:800;font-size:7.5px">Total Linear</td>
            <td style="padding:4px 6px;text-align:right;font-weight:900;font-size:8px;color:#001a44">${totalLinearFt} ft</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- RIGHT TABLE: Area Calculation & Scope Data -->
    <div>
      <table style="width:100%;border-collapse:collapse;font-size:7.5px">
        <thead>
          <tr style="background:#001a44;color:#fff">
            <th style="padding:4px 6px;text-align:left;font-size:7px;font-weight:700">Section</th>
            <th style="padding:4px 6px;text-align:right;font-size:7px;font-weight:700">Area (Sq Ft)</th>
            <th style="padding:4px 6px;text-align:center;font-size:7px;font-weight:700">Pitch</th>
            <th style="padding:4px 6px;text-align:right;font-size:7px;font-weight:700">Multiplier</th>
          </tr>
        </thead>
        <tbody>
          ${segAreaRows.map((r, i) => `
          <tr style="border-bottom:1px solid #eee;${i % 2 === 0 ? '' : 'background:#f9fafb'}">
            <td style="padding:3px 6px;font-weight:600;font-size:7.5px">${r.label}</td>
            <td style="padding:3px 6px;text-align:right;font-size:7.5px">${r.area.toLocaleString()}</td>
            <td style="padding:3px 6px;text-align:center;font-size:7.5px">${r.pitch}</td>
            <td style="padding:3px 6px;text-align:right;font-size:7.5px">${r.multiplier}</td>
          </tr>`).join('')}
          <tr style="border-top:1px solid #ccc;background:#f0f3f7">
            <td style="padding:3px 6px;font-weight:700;font-size:7.5px">Total Field Surface Area</td>
            <td colspan="3" style="padding:3px 6px;text-align:right;font-weight:800;font-size:8px;color:#001a44">${report.total_true_area_sqft.toLocaleString()} ft&sup2;</td>
          </tr>
          <tr style="background:#f0f3f7">
            <td style="padding:3px 6px;font-size:7px;color:#666">Estimated Waste Factor (${mat.waste_pct || 15}%)</td>
            <td colspan="3" style="padding:3px 6px;text-align:right;font-size:7.5px;color:#666">${mat.waste_pct || 15}%</td>
          </tr>
          <tr style="border-top:2px solid #001a44;background:#e6edf5">
            <td style="padding:4px 6px;font-weight:800;font-size:8px;color:#001a44">Total Sq Ft Required</td>
            <td colspan="3" style="padding:4px 6px;text-align:right;font-weight:900;font-size:9px;color:#001a44">${Math.round(report.total_true_area_sqft * (1 + (mat.waste_pct || 15) / 100)).toLocaleString()} ft&sup2;</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- All Project Totals row -->
  <div style="padding:6px 22px">
    <div style="display:flex;gap:12px;font-size:7px;color:#555;font-weight:600;justify-content:flex-end;flex-wrap:wrap">
      <span>Total Eave Length = ${es.total_eave_ft} ft</span>
      <span>Total Ridge Length = ${es.total_ridge_ft} ft</span>
      ${es.total_valley_ft > 0 ? `<span>Total Valley Length = ${es.total_valley_ft} ft</span>` : ''}
      ${es.total_hip_ft > 0 ? `<span>Total Hip Length = ${es.total_hip_ft} ft</span>` : ''}
      <span style="font-weight:800;color:#001a44;font-size:7.5px">Total Sq Ft = ${report.total_true_area_sqft.toLocaleString()}</span>
    </div>
  </div>

  <!-- Drawing Key -->
  <div style="padding:4px 22px 6px">
    <div style="font-size:8px;font-weight:700;color:#333;margin-bottom:3px">Drawing Key</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:7.5px;color:#444">
      <div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#D40000;display:inline-block;border-radius:1px"></span>Eave</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#FFB800;display:inline-block;border-radius:1px"></span>Hip</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#dc2626;display:inline-block;border-radius:1px"></span>Ridge</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#7C3AED;display:inline-block;border-radius:1px"></span>Rake Edge</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#00BCD4;border-radius:1px;display:inline-block;border-bottom:1px dashed #00BCD4"></span>Valley</div>
      ${es.total_parapet_ft ? `<div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#795548;display:inline-block;border-radius:1px"></span>Parapet</div>` : ''}
      ${(es.total_step_flashing_ft || 0) > 0 ? `<div style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:#E65100;display:inline-block;border-radius:1px"></span>Step Flashing</div>` : ''}
    </div>
  </div>

  <!-- Page 1 Footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;padding:6px 22px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eee;background:#fff">
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:16px;height:16px;background:#00838F;border-radius:3px;display:flex;align-items:center;justify-content:center">
        <div style="width:8px;height:8px;border:1.5px solid #fff;border-radius:1px"></div>
      </div>
      <span style="font-size:9px;font-weight:800;color:#00838F">ROOF REPORTER AI</span>
    </div>
    <div style="font-size:6.5px;color:#999">&copy; Roof Reporter AI &bull; ${reportDate} &bull; p.1/2</div>
  </div>
</div>

<!-- ==================== PAGE 2: PROJECT TOTALS SUMMARY (Landscape 11×8.5) ==================== -->
<div class="page page-landscape">
  <!-- Top teal accent bar -->
  <div style="height:5px;background:linear-gradient(90deg,#00838F,#00BCD4,#00838F)"></div>

  <!-- Logo + Address -->
  <div style="padding:10px 28px 6px;display:flex;justify-content:space-between;align-items:flex-start">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:48px;height:48px;background:linear-gradient(135deg,#00838F,#00BCD4);border-radius:8px;display:flex;align-items:center;justify-content:center;position:relative">
        <div style="width:20px;height:16px;border:2.5px solid #fff;border-radius:2px;position:relative">
          <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:8px solid #fff"></div>
        </div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:#00838F;letter-spacing:0.5px;line-height:1.1">ROOF</div>
        <div style="font-size:12px;font-weight:600;color:#00838F;letter-spacing:2px">REPORTER AI</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a">${fullAddress}</div>
      <div style="font-size:9px;color:#777;margin-top:2px">${prop.homeowner_name ? 'Homeowner: ' + prop.homeowner_name + ' &bull; ' : ''}Report Date: ${reportDate}</div>
    </div>
  </div>

  <!-- Two-column layout: Left=data, Right=satellite -->
  <div style="padding:0 22px;display:grid;grid-template-columns:42% 56%;gap:16px">
    <!-- LEFT COLUMN: Project Totals -->
    <div>
      <div style="font-size:12px;font-weight:800;color:#00696B;margin-bottom:6px;letter-spacing:0.5px">Project Totals</div>

      <!-- Total Roof Area highlight box -->
      <div style="background:linear-gradient(135deg,#00838F,#00ACC1);border-radius:5px;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:#fff">Total Roof Area</span>
        <span style="font-size:16px;font-weight:900;color:#fff">${netSquares} SQ</span>
      </div>

      <!-- Slope breakdown -->
      <div style="font-size:8px;color:#666;margin-bottom:2px;font-weight:600">Slope Breakdown</div>
      <div style="border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;margin-bottom:6px">
        ${standardSlopeArea > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Standard Slope (4:12-6:12)</span><span style="font-weight:700;color:#1a1a1a">${(standardSlopeArea / 100).toFixed(2)} SQ</span></div>` : ''}
        ${flatSlopeArea > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Flat Slope (0:12-1:12)</span><span style="font-weight:700;color:#1a1a1a">${(flatSlopeArea / 100).toFixed(2)} SQ</span></div>` : ''}
        ${lowSlopeArea > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Low Slope (2:12-3:12)</span><span style="font-weight:700;color:#1a1a1a">${(lowSlopeArea / 100).toFixed(2)} SQ</span></div>` : ''}
        ${steepSlopeArea > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee;background:#e0f7fa"><span style="color:#00695C;font-weight:600">Steep Slope (7:12 or greater)</span><span style="font-weight:800;color:#00695C">${(steepSlopeArea / 100).toFixed(2)} SQ</span></div>` : ''}
        ${highRoofArea > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">High Roof (over 1 story)</span><span style="font-weight:700;color:#1a1a1a">${(highRoofArea / 100).toFixed(2)} SQ</span></div>` : ''}
        ${iwbSqft > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px"><span style="color:#555">IWB (Ice &amp; Water Barrier)</span><span style="font-weight:700;color:#1a1a1a">${iwbSqft.toLocaleString()} SF</span></div>` : ''}
      </div>

      <!-- Roof Planes & Structures -->
      <div style="border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Roof Planes</span><span style="font-weight:700">${report.segments.length}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px"><span style="color:#555">Structures</span><span style="font-weight:700">1</span></div>
      </div>

      <!-- Perimeter measurements -->
      <div style="font-size:8px;color:#666;margin-bottom:2px;font-weight:600">Perimeter</div>
      <div style="border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Eave</span><span style="font-weight:700">${es.total_eave_ft} LF</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Rake Edge</span><span style="font-weight:700">${es.total_rake_ft} LF</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;background:#e0f7fa"><span style="color:#00695C;font-weight:600">Total Perimeter</span><span style="font-weight:800;color:#00695C">${totalPerimeter} LF</span></div>
      </div>

      <!-- Linear measurements -->
      <div style="font-size:8px;color:#666;margin-bottom:2px;font-weight:600">Linear Measurements</div>
      <div style="border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Ridge</span><span style="font-weight:700">${es.total_ridge_ft} LF</span></div>
        ${es.total_hip_ft > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Hip</span><span style="font-weight:700">${es.total_hip_ft} LF</span></div>` : ''}
        ${es.total_valley_ft > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Valley</span><span style="font-weight:700">${es.total_valley_ft} LF</span></div>` : ''}
        ${(es.total_transition_ft || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Slope Change</span><span style="font-weight:700">${es.total_transition_ft} LF</span></div>` : ''}
        ${(es.total_step_flashing_ft || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px;border-bottom:1px solid #eee"><span style="color:#555">Step Flashing</span><span style="font-weight:700">${es.total_step_flashing_ft} LF</span></div>` : ''}
        ${(es.total_wall_flashing_ft || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-size:8px"><span style="color:#555">Headwall Flashing</span><span style="font-weight:700">${es.total_wall_flashing_ft} LF</span></div>` : ''}
      </div>
    </div>

    <!-- RIGHT COLUMN: Satellite Image -->
    <div>
      <div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#e8ecf1">
        ${overheadUrl
          ? `<img src="${overheadUrl}" alt="Aerial View" style="width:100%;height:340px;object-fit:cover;display:block" onerror="this.style.display='none'">`
          : `<div style="height:340px;background:#e8ecf1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px">Satellite imagery not available</div>`
        }
      </div>
      <div style="font-size:7px;color:#999;text-align:right;margin-top:2px">Aerial satellite imagery &copy; Google Maps</div>
    </div>
  </div>

  <!-- Waste Factor Table (full width) -->
  <div style="padding:8px 22px 0">
    <div style="font-size:9px;font-weight:800;color:#333;text-align:center;margin-bottom:4px">Waste Factor (Total Roof Area)</div>
    <table style="width:100%;border-collapse:collapse;font-size:7.5px;border:1px solid #ddd">
      <tbody>
        <tr>
          ${wasteTableEntries.slice(0, 6).map(w => `
          <td style="padding:4px 6px;border:1px solid #ddd;text-align:center;${w.pct === (mat.waste_pct || 15) ? 'background:#e0f7fa;font-weight:800' : ''}">
            <div style="font-weight:700;color:#555">${w.pct}%</div>
            <div style="font-weight:600;color:#1a1a1a;margin-top:1px">${w.sq} SQ</div>
          </td>`).join('')}
        </tr>
        <tr>
          ${wasteTableEntries.slice(6).map(w => `
          <td style="padding:4px 6px;border:1px solid #ddd;text-align:center;${w.pct === (mat.waste_pct || 15) ? 'background:#e0f7fa;font-weight:800' : ''}">
            <div style="font-weight:700;color:#555">${w.pct}%</div>
            <div style="font-weight:600;color:#1a1a1a;margin-top:1px">${w.sq} SQ</div>
          </td>`).join('')}
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Disclaimer bar -->
  <div style="margin:8px 22px 0;background:#FFC107;border-radius:3px;padding:5px 12px">
    <div style="font-size:6.5px;font-weight:700;color:#333;text-align:center;text-transform:uppercase;line-height:1.5">
      THIS REPORT IS FOR ESTIMATION PURPOSES ONLY. VERIFY ALL DIMENSIONS AND TOTALS BEFORE PURCHASING MATERIALS.<br>
      THIS REPORT IS THE PROPERTY OF ROOF REPORTER AI AND MAY NOT BE REPRODUCED WITHOUT WRITTEN CONSENT.
    </div>
  </div>

  <!-- Page 2 Footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(135deg,#00696B,#00838F);padding:8px 22px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:9px;font-weight:700;color:#fff">Roof Reporter AI</span>
    <span style="font-size:7px;color:rgba(255,255,255,0.7)">&copy; Roof Reporter AI &bull; ${fullAddress} &bull; ${reportDate} &bull; p.2/2</span>
  </div>
</div>

</body>
</html>`
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
