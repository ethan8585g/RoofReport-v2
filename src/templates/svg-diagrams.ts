// ============================================================
// RoofReporterAI — SVG Diagram Generators (Consolidated)
// All architectural, overlay, blueprint, pitch, and fallback
// diagram functions in a single module.
//
// generateSatelliteOverlaySVG is STUBBED — returns '' always.
// Fallback SVG functions consolidated into configurable generators.
// ============================================================

import type { RoofSegment, EdgeMeasurement, AIMeasurementAnalysis } from '../types'
import {
  feetToFeetInches, lineAngleDeg, smartEdgeFootage,
  EDGE_COLORS, EDGE_WIDTHS, SEGMENT_COLORS
} from '../utils/geo-math'
import { computeFacetDisplayData } from '../services/report-engine'

export function generateArchitecturalDiagramSVG(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  segments: RoofSegment[],
  edges: EdgeMeasurement[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  predominantPitch: string,
  grossSquares: number
): string {
  const W = 700, H = 660
  const PAD = 55            // padding for dimension lines — reduced for better fit
  const FOOTER_H = 56       // dark navy footer bar height
  const DIM_OFFSET = 22     // how far dimension line sits from roof edge
  const DIM_EXTEND = 6      // extension line overshoot past dimension line
  const TICK_LEN = 5        // tick mark half-length at dimension endpoints
  const LEGEND_Y = 14       // top-left legend Y start
  const FONT = `font-family="Inter,system-ui,-apple-system,sans-serif"`

  // Edge-type color palette (construction standard)
  const EDGE_COLOR: Record<string, string> = {
    'EAVE':   '#0d9668', // Emerald green — gutterline/drip edge
    'HIP':    '#d97706', // Amber — hip edges
    'RAKE':   '#7c3aed', // Purple — gable rakes
    'RIDGE':  '#dc2626', // Red — ridge lines
    'VALLEY': '#2563eb', // Blue — valley lines
  }
  const DEFAULT_EDGE_CLR = '#333'

  // Format helper: decimal feet
  const fmtFt = (ft: number): string => {
    if (ft < 0.3) return ''
    return `${ft.toFixed(1)} ft`
  }

  // CHECK FOR AI GEOMETRY
  const hasAI = aiGeometry && (
    (aiGeometry.perimeter && aiGeometry.perimeter.length >= 3) ||
    (aiGeometry.facets && aiGeometry.facets.length >= 2)
  )
  const hasPerimeter = hasAI && aiGeometry!.perimeter && aiGeometry!.perimeter.length >= 3
  const hasFacets = hasAI && aiGeometry!.facets && aiGeometry!.facets.length >= 2

  if (!hasAI) {
    return generateFallbackArchitecturalSVG(segments, edges, edgeSummary, totalFootprintSqft, avgPitchDeg, predominantPitch, grossSquares, W, H)
  }

  // BOUNDING BOX & SCALE
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  if (hasPerimeter) aiGeometry!.perimeter.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) })
  if (hasFacets) aiGeometry!.facets.forEach(f => f.points?.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }))

  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const drawW = W - PAD * 2
  const drawH = H - PAD - 30 - FOOTER_H
  const sc = Math.min(drawW / geoW, drawH / geoH) * 0.82
  const oX = PAD + (drawW - geoW * sc) / 2
  const oY = 30 + (drawH - geoH * sc) / 2

  const tx = (x: number) => oX + (x - minX) * sc
  const ty = (y: number) => oY + (y - minY) * sc

  // PIXEL-TO-FOOT SCALE (from geometry bbox vs known footprint)
  let pxPerFt = 1
  if (hasPerimeter) {
    const bboxArea = geoW * geoH
    pxPerFt = Math.sqrt(Math.max(bboxArea, 1) / Math.max(totalFootprintSqft, 100))
  }
  const pxToFt = (px: number) => pxPerFt > 0.01 ? px / pxPerFt : 0

  // DISTRIBUTE MEASURED FOOTAGE to perimeter sides proportionally
  const measuredByType = smartEdgeFootage(edgeSummary)
  let perimSideFt: number[] = []
  let perimSideType: string[] = []
  if (hasPerimeter) {
    const perim = aiGeometry!.perimeter
    const n = perim.length
    const sidesByType: Record<string, { idx: number; pxLen: number }[]> = {}
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const pxLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
      const type = p1.edge_to_next || 'EAVE'
      perimSideType.push(type)
      if (!sidesByType[type]) sidesByType[type] = []
      sidesByType[type].push({ idx: i, pxLen })
    }
    perimSideFt = new Array(n).fill(0)
    for (const [type, sides] of Object.entries(sidesByType)) {
      const totalPx = sides.reduce((s, sd) => s + sd.pxLen, 0)
      const totalFt = measuredByType[type] || 0
      if (totalPx > 0 && totalFt > 0) {
        sides.forEach(sd => { perimSideFt[sd.idx] = (sd.pxLen / totalPx) * totalFt })
      }
    }
  }

  // DERIVE INTERNAL LINES from shared facet edges if missing
  let effectiveLines = aiGeometry!.lines || []
  if (effectiveLines.length === 0 && hasFacets) {
    const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      `${Math.round(Math.min(a.x, b.x))},${Math.round(Math.min(a.y, b.y))}-${Math.round(Math.max(a.x, b.x))},${Math.round(Math.max(a.y, b.y))}`
    const edgeMap: Record<string, { start: { x: number; y: number }; end: { x: number; y: number }; count: number }> = {}
    aiGeometry!.facets.forEach(facet => {
      if (!facet.points || facet.points.length < 3) return
      for (let j = 0; j < facet.points.length; j++) {
        const a = facet.points[j], b = facet.points[(j + 1) % facet.points.length]
        const key = edgeKey(a, b)
        if (!edgeMap[key]) edgeMap[key] = { start: a, end: b, count: 0 }
        edgeMap[key].count++
      }
    })
    const derived: typeof effectiveLines = []
    for (const [, edge] of Object.entries(edgeMap)) {
      if (edge.count >= 2) {
        const ddx = Math.abs(edge.end.x - edge.start.x)
        const ddy = Math.abs(edge.end.y - edge.start.y)
        derived.push({ type: (ddy < ddx * 0.3 ? 'RIDGE' : 'HIP') as any, start: edge.start, end: edge.end })
      }
    }
    effectiveLines = derived
  }

  // Compute internal line footage (distributed proportionally by type)
  const internalByType: Record<string, { line: typeof effectiveLines[0]; pxLen: number }[]> = {}
  effectiveLines.forEach(l => {
    if (l.type === 'EAVE' || l.type === 'RAKE') return
    if (!internalByType[l.type]) internalByType[l.type] = []
    const pxLen = Math.sqrt((l.end.x - l.start.x) ** 2 + (l.end.y - l.start.y) ** 2)
    internalByType[l.type].push({ line: l, pxLen })
  })
  const internalTotals: Record<string, number> = {
    'RIDGE': edgeSummary.total_ridge_ft,
    'HIP': edgeSummary.total_hip_ft,
    'VALLEY': edgeSummary.total_valley_ft,
  }

  // Collect present edge types for legend
  const presentEdgeTypes = new Set<string>()
  if (hasPerimeter) perimSideType.forEach(t => presentEdgeTypes.add(t))
  effectiveLines.forEach(l => { if (l.type !== 'EAVE' && l.type !== 'RAKE') presentEdgeTypes.add(l.type) })
  // Always show EAVE if eave footage exists
  if (edgeSummary.total_eave_ft > 0) presentEdgeTypes.add('EAVE')
  if (edgeSummary.total_ridge_ft > 0) presentEdgeTypes.add('RIDGE')
  if (edgeSummary.total_hip_ft > 0) presentEdgeTypes.add('HIP')
  if (edgeSummary.total_valley_ft > 0) presentEdgeTypes.add('VALLEY')
  if (edgeSummary.total_rake_ft > 0) presentEdgeTypes.add('RAKE')

  // BUILD SVG
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`
  svg += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`

  // DEFS: crosshatch patterns (alternating for adjacent facets) + clip rect to prevent overflow
  svg += `<defs>`
  svg += `<clipPath id="ev-viewport"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>`
  svg += `<pattern id="ev-xhatch" patternUnits="userSpaceOnUse" width="5.5" height="5.5">`
  svg += `<line x1="0" y1="0" x2="5.5" y2="5.5" stroke="#B0B0B0" stroke-width="0.35"/>`
  svg += `<line x1="5.5" y1="0" x2="0" y2="5.5" stroke="#B0B0B0" stroke-width="0.35"/>`
  svg += `</pattern>`
  svg += `<pattern id="ev-xhatch-2" patternUnits="userSpaceOnUse" width="6.5" height="6.5">`
  svg += `<line x1="0" y1="0" x2="6.5" y2="6.5" stroke="#BCBCBC" stroke-width="0.35"/>`
  svg += `<line x1="6.5" y1="0" x2="0" y2="6.5" stroke="#BCBCBC" stroke-width="0.35"/>`
  svg += `</pattern>`
  svg += `</defs>`

  // Wrap all drawing content in viewport clip to prevent dimension labels from overflowing
  svg += `<g clip-path="url(#ev-viewport)">`

  // FAINT PROPERTY CONTEXT (lot boundary, very light)
  if (hasPerimeter) {
    const perim = aiGeometry!.perimeter
    const lotPad = 48
    const lotMinX = Math.min(...perim.map(p => tx(p.x))) - lotPad
    const lotMaxX = Math.max(...perim.map(p => tx(p.x))) + lotPad
    const lotMinY = Math.min(...perim.map(p => ty(p.y))) - lotPad
    const lotMaxY = Math.max(...perim.map(p => ty(p.y))) + lotPad
    svg += `<rect x="${lotMinX.toFixed(1)}" y="${lotMinY.toFixed(1)}" width="${(lotMaxX - lotMinX).toFixed(1)}" height="${(lotMaxY - lotMinY).toFixed(1)}" fill="none" stroke="#D8DDE3" stroke-width="0.8" stroke-dasharray="4,3" rx="2"/>`
    const setback = 18
    svg += `<rect x="${(lotMinX + setback).toFixed(1)}" y="${(lotMinY + setback).toFixed(1)}" width="${(lotMaxX - lotMinX - setback * 2).toFixed(1)}" height="${(lotMaxY - lotMinY - setback * 2).toFixed(1)}" fill="none" stroke="#E8ECF0" stroke-width="0.5" stroke-dasharray="2,4"/>`
  }

  // FACET FILLS with diamond crosshatch
  if (hasFacets) {
    aiGeometry!.facets.forEach((facet, i) => {
      if (!facet.points || facet.points.length < 3) return
      const pts = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      const pat = i % 2 === 0 ? 'ev-xhatch' : 'ev-xhatch-2'
      svg += `<polygon points="${pts}" fill="url(#${pat})" stroke="none"/>`
    })
  }

  // COLOR-CODED PERIMETER OUTLINE (by edge type)
  if (hasPerimeter) {
    const perim = aiGeometry!.perimeter
    const n = perim.length
    // First draw bold black full perimeter for visual weight
    const perimPts = perim.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    svg += `<polygon points="${perimPts}" fill="none" stroke="#111" stroke-width="2.8" stroke-linejoin="miter"/>`
    // Then overlay color-coded segments on top
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const type = p1.edge_to_next || 'EAVE'
      const color = EDGE_COLOR[type] || DEFAULT_EDGE_CLR
      svg += `<line x1="${tx(p1.x).toFixed(1)}" y1="${ty(p1.y).toFixed(1)}" x2="${tx(p2.x).toFixed(1)}" y2="${ty(p2.y).toFixed(1)}" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`
    }
    // Corner dots
    perim.forEach(p => {
      svg += `<circle cx="${tx(p.x).toFixed(1)}" cy="${ty(p.y).toFixed(1)}" r="3" fill="#111"/>`
    })
  }

  // INTERNAL STRUCTURAL LINES (color-coded)
  effectiveLines.forEach(line => {
    if (line.type === 'EAVE' || line.type === 'RAKE') return
    const color = EDGE_COLOR[line.type] || '#222'
    const dash = line.type === 'VALLEY' ? ' stroke-dasharray="8,4"' : ''
    svg += `<line x1="${tx(line.start.x).toFixed(1)}" y1="${ty(line.start.y).toFixed(1)}" x2="${tx(line.end.x).toFixed(1)}" y2="${ty(line.end.y).toFixed(1)}" stroke="${color}" stroke-width="1.8"${dash} stroke-linecap="round"/>`
  })

  // ARCHITECTURAL DIMENSION LINES on perimeter edges
  if (hasPerimeter) {
    const perim = aiGeometry!.perimeter
    const n = perim.length

    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const sx = tx(p1.x), sy = ty(p1.y), ex = tx(p2.x), ey = ty(p2.y)
      const segPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
      if (segPx < 18) continue

      let ftVal = perimSideFt[i]
      if (ftVal < 0.5) ftVal = pxToFt(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2))
      if (ftVal < 0.3) continue

      const label = fmtFt(ftVal)
      if (!label) continue

      // Normal vector perpendicular outward
      const dx = ex - sx, dy = ey - sy
      const len = Math.sqrt(dx * dx + dy * dy)
      const nx = -dy / len, ny = dx / len

      // Extension lines from roof edge to dimension line and slightly beyond
      const extStart = 3
      const dimLine = DIM_OFFSET
      const extEnd = dimLine + DIM_EXTEND
      svg += `<line x1="${(sx + nx * extStart).toFixed(1)}" y1="${(sy + ny * extStart).toFixed(1)}" x2="${(sx + nx * extEnd).toFixed(1)}" y2="${(sy + ny * extEnd).toFixed(1)}" stroke="#888" stroke-width="0.5"/>`
      svg += `<line x1="${(ex + nx * extStart).toFixed(1)}" y1="${(ey + ny * extStart).toFixed(1)}" x2="${(ex + nx * extEnd).toFixed(1)}" y2="${(ey + ny * extEnd).toFixed(1)}" stroke="#888" stroke-width="0.5"/>`

      // Dimension line parallel to edge offset outward
      const dsx = sx + nx * dimLine, dsy = sy + ny * dimLine
      const dex = ex + nx * dimLine, dey = ey + ny * dimLine
      svg += `<line x1="${dsx.toFixed(1)}" y1="${dsy.toFixed(1)}" x2="${dex.toFixed(1)}" y2="${dey.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`

      // Tick marks at dimension line endpoints (perpendicular slash marks)
      const tNx = dx / len, tNy = dy / len // tangent direction for tick
      svg += `<line x1="${(dsx - tNx * TICK_LEN).toFixed(1)}" y1="${(dsy - tNy * TICK_LEN).toFixed(1)}" x2="${(dsx + tNx * TICK_LEN).toFixed(1)}" y2="${(dsy + tNy * TICK_LEN).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`
      svg += `<line x1="${(dex - tNx * TICK_LEN).toFixed(1)}" y1="${(dey - tNy * TICK_LEN).toFixed(1)}" x2="${(dex + tNx * TICK_LEN).toFixed(1)}" y2="${(dey + tNy * TICK_LEN).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`

      // Label at midpoint
      const mx = (dsx + dex) / 2, my = (dsy + dey) / 2
      let angle = Math.atan2(dey - dsy, dex - dsx) * 180 / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180

      const bgW = Math.max(label.length * 5.8 + 10, 44)
      svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
      svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7.5" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
      svg += `<text x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="500" fill="#222" ${FONT}>${label}</text>`
      svg += `</g>`
    }
  }

  // INTERNAL LINE DIMENSION LABELS (ridge/hip/valley footage)
  for (const [type, items] of Object.entries(internalByType)) {
    const totalPx = items.reduce((s, it) => s + it.pxLen, 0)
    const totalFt = internalTotals[type] || 0
    const color = EDGE_COLOR[type] || '#444'
    items.forEach(({ line: l, pxLen }) => {
      let lineFt = totalPx > 0 && totalFt > 0 ? (pxLen / totalPx) * totalFt : pxToFt(pxLen)
      if (lineFt < 0.5) return

      const sx = tx(l.start.x), sy = ty(l.start.y)
      const ex = tx(l.end.x), ey = ty(l.end.y)
      const mx = (sx + ex) / 2, my = (sy + ey) / 2
      let angle = Math.atan2(ey - sy, ex - sx) * 180 / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180

      const label = fmtFt(lineFt)
      if (!label) return
      const bgW = Math.max(label.length * 5.8 + 10, 44)
      const perpDx = -(ey - sy), perpDy = ex - sx
      const perpLen = Math.sqrt(perpDx * perpDx + perpDy * perpDy) || 1
      const labelOff = 9
      const lx = mx + (perpDx / perpLen) * labelOff
      const ly = my + (perpDy / perpLen) * labelOff

      svg += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${angle.toFixed(1)})">`
      svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7.5" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
      svg += `<text x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="500" fill="${color}" ${FONT}>${label}</text>`
      svg += `</g>`
    })
  }

  // FACET NUMBERS (plain, no circles — matching EagleView style)
  if (hasFacets) {
    aiGeometry!.facets.forEach((facet, i) => {
      if (!facet.points || facet.points.length < 3) return
      const fcx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
      const fcy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length
      svg += `<text x="${fcx.toFixed(1)}" y="${(fcy + 7).toFixed(1)}" text-anchor="middle" font-size="22" font-weight="700" fill="#3a3a3a" ${FONT} opacity="0.85">${i + 1}</text>`
    })
  }

  // EDGE-TYPE LEGEND (top-left corner)
  const legendTypes = ['RIDGE', 'EAVE', 'VALLEY', 'HIP', 'RAKE'].filter(t => presentEdgeTypes.has(t))
  const legendNames: Record<string, string> = { 'EAVE': 'Eave', 'HIP': 'Hip', 'RIDGE': 'Ridge', 'VALLEY': 'Valley', 'RAKE': 'Rake' }
  if (legendTypes.length > 0) {
    const lx = 12, ly = LEGEND_Y
    svg += `<rect x="${lx}" y="${ly}" width="68" height="${legendTypes.length * 13 + 8}" rx="2" fill="#fff" opacity="0.92" stroke="#ddd" stroke-width="0.5"/>`
    legendTypes.forEach((t, i) => {
      const iy = ly + 10 + i * 13
      const clr = EDGE_COLOR[t] || '#333'
      const dash = t === 'VALLEY' ? ' stroke-dasharray="3,2"' : ''
      svg += `<line x1="${lx + 5}" y1="${iy}" x2="${lx + 20}" y2="${iy}" stroke="${clr}" stroke-width="2.5"${dash} stroke-linecap="round"/>`
      svg += `<text x="${lx + 24}" y="${iy + 3}" font-size="7.5" font-weight="600" fill="#444" ${FONT}>${legendNames[t] || t}</text>`
    })
  }

  // COMPASS ROSE (top-right corner)
  const cX = W - 42, cY = 32
  svg += `<g transform="translate(${cX},${cY})">`
  svg += `<circle cx="0" cy="0" r="15" fill="#fff" fill-opacity="0.85" stroke="#999" stroke-width="0.7"/>`
  svg += `<line x1="0" y1="11" x2="0" y2="-11" stroke="#999" stroke-width="0.8"/>`
  svg += `<line x1="-11" y1="0" x2="11" y2="0" stroke="#999" stroke-width="0.5"/>`
  svg += `<polygon points="0,-13 -3.5,-4 3.5,-4" fill="#C62828"/>`
  svg += `<polygon points="0,13 -3.5,4 3.5,4" fill="#999"/>`
  svg += `<text x="0" y="-17" text-anchor="middle" font-size="8" font-weight="800" fill="#333" ${FONT}>N</text>`
  svg += `</g>`

  // FOOTER BAR: FACETS | PITCH | AREA | LINEAR FT
  const fY = H - FOOTER_H
  const barW = W * 0.94
  const barX = (W - barW) / 2
  const cols = 4
  const colW = barW / cols
  svg += `<rect x="${barX.toFixed(1)}" y="${fY}" width="${barW.toFixed(1)}" height="${FOOTER_H}" rx="0" fill="#002244"/>`
  for (let c = 1; c < cols; c++) {
    svg += `<line x1="${(barX + colW * c).toFixed(1)}" y1="${fY + 8}" x2="${(barX + colW * c).toFixed(1)}" y2="${fY + FOOTER_H - 8}" stroke="#0a3a5e" stroke-width="1"/>`
  }
  const facetCount = hasFacets ? aiGeometry!.facets.length : segments.length
  const totalLinFt = Math.round(edgeSummary.total_ridge_ft + edgeSummary.total_hip_ft + edgeSummary.total_valley_ft + edgeSummary.total_eave_ft + edgeSummary.total_rake_ft)
  const footerData = [
    { label: 'FACETS', value: `${facetCount}` },
    { label: 'PITCH', value: predominantPitch || `${avgPitchDeg.toFixed(0)}\u00B0` },
    { label: 'AREA (SF)', value: `${Math.round(grossSquares).toLocaleString()}` },
    { label: 'LINEAR FT', value: `${totalLinFt}` },
  ]
  footerData.forEach((d, i) => {
    const cx = barX + colW * i + colW / 2
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 15}" text-anchor="middle" font-size="7" font-weight="700" fill="#7eafd4" ${FONT} letter-spacing="1.5">${d.label}</text>`
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 38}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" ${FONT}>${d.value}</text>`
  })

  svg += `</g>` // close ev-viewport clip group
  svg += `</svg>`
  return svg
}

// ============================================================
// FALLBACK ARCHITECTURAL DIAGRAM v5
// When AI geometry is NOT available — generates a proportional
// hip or gable roof shape using footprint + segment data.
// Now includes: color-coded edges, legend, improved dimension
// lines, and a 4-column footer matching the AI version.
// ============================================================
export function generateFallbackArchitecturalSVG(
  segments: RoofSegment[],
  edges: EdgeMeasurement[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  predominantPitch: string,
  grossSquares: number,
  W: number, H: number
): string {
  const FOOTER_H = 56
  const PAD = 55
  const FONT = `font-family="Inter,system-ui,-apple-system,sans-serif"`

  const EDGE_COLOR: Record<string, string> = {
    'RIDGE': '#DC2626', 'HIP': '#EA580C', 'VALLEY': '#2563EB',
    'EAVE': '#16A34A', 'RAKE': '#7C3AED',
  }

  const fmtFt = (ft: number): string => ft < 0.3 ? '' : `${ft.toFixed(1)} ft`

  // Determine roof dimensions from footprint
  const aspectRatio = 1.5
  const widthFt = Math.sqrt(Math.max(totalFootprintSqft, 400) / aspectRatio)
  const lengthFt = widthFt * aspectRatio
  const drawW = W - PAD * 2
  const drawH = H - PAD - 30 - FOOTER_H
  const scaleFactor = Math.min(drawW / lengthFt, drawH / widthFt) * 0.88

  const cx = W / 2, cy = 30 + drawH / 2
  const hw = (lengthFt * scaleFactor) / 2
  const hh = (widthFt * scaleFactor) / 2

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`
  svg += `<rect width="${W}" height="${H}" fill="#fff"/>`

  // Crosshatch patterns
  svg += `<defs>`
  svg += `<pattern id="fb-xhatch" patternUnits="userSpaceOnUse" width="5.5" height="5.5">`
  svg += `<line x1="0" y1="0" x2="5.5" y2="5.5" stroke="#B0B0B0" stroke-width="0.35"/>`
  svg += `<line x1="5.5" y1="0" x2="0" y2="5.5" stroke="#B0B0B0" stroke-width="0.35"/>`
  svg += `</pattern>`
  svg += `<pattern id="fb-xhatch-2" patternUnits="userSpaceOnUse" width="6.5" height="6.5">`
  svg += `<line x1="0" y1="0" x2="6.5" y2="6.5" stroke="#BCBCBC" stroke-width="0.35"/>`
  svg += `<line x1="6.5" y1="0" x2="0" y2="6.5" stroke="#BCBCBC" stroke-width="0.35"/>`
  svg += `</pattern>`
  svg += `</defs>`

  // Faint lot outline
  svg += `<rect x="${(cx - hw - 48).toFixed(1)}" y="${(cy - hh - 48).toFixed(1)}" width="${(hw * 2 + 96).toFixed(1)}" height="${(hh * 2 + 96).toFixed(1)}" fill="none" stroke="#D8DDE3" stroke-width="0.8" stroke-dasharray="4,3" rx="2"/>`

  const isHipRoof = segments.length >= 4 || (edgeSummary.total_hip_ft > 0)
  const ridgeShort = hw * 0.5
  const corners = [
    [cx - hw, cy - hh],  // top-left  (NW)
    [cx + hw, cy - hh],  // top-right (NE)
    [cx + hw, cy + hh],  // bot-right (SE)
    [cx - hw, cy + hh],  // bot-left  (SW)
  ]
  const ridgeL = [cx - ridgeShort, cy]
  const ridgeR = [cx + ridgeShort, cy]

  // Helper: dimension line between two points
  const drawDimLine = (s: number[], e: number[], ft: number, outward: [number, number] = [0, -1]) => {
    const sx = s[0], sy = s[1], ex = e[0], ey = e[1]
    const dx = ex - sx, dy = ey - sy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 20 || ft < 0.3) return
    const nx = -dy / len, ny = dx / len
    // Prefer the normal that goes in the `outward` direction
    const dot = nx * outward[0] + ny * outward[1]
    const dirNx = dot >= 0 ? nx : -nx
    const dirNy = dot >= 0 ? ny : -ny
    const off = 22, ext = off + 6
    // Extension lines
    svg += `<line x1="${(sx + dirNx * 3).toFixed(1)}" y1="${(sy + dirNy * 3).toFixed(1)}" x2="${(sx + dirNx * ext).toFixed(1)}" y2="${(sy + dirNy * ext).toFixed(1)}" stroke="#888" stroke-width="0.5"/>`
    svg += `<line x1="${(ex + dirNx * 3).toFixed(1)}" y1="${(ey + dirNy * 3).toFixed(1)}" x2="${(ex + dirNx * ext).toFixed(1)}" y2="${(ey + dirNy * ext).toFixed(1)}" stroke="#888" stroke-width="0.5"/>`
    // Dimension line
    const dsx = sx + dirNx * off, dsy = sy + dirNy * off
    const dex = ex + dirNx * off, dey = ey + dirNy * off
    svg += `<line x1="${dsx.toFixed(1)}" y1="${dsy.toFixed(1)}" x2="${dex.toFixed(1)}" y2="${dey.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`
    // Tick marks
    const tNx = dx / len, tNy = dy / len
    svg += `<line x1="${(dsx - tNx * 5).toFixed(1)}" y1="${(dsy - tNy * 5).toFixed(1)}" x2="${(dsx + tNx * 5).toFixed(1)}" y2="${(dsy + tNy * 5).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`
    svg += `<line x1="${(dex - tNx * 5).toFixed(1)}" y1="${(dey - tNy * 5).toFixed(1)}" x2="${(dex + tNx * 5).toFixed(1)}" y2="${(dey + tNy * 5).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`
    // Label
    const mx = (dsx + dex) / 2, my = (dsy + dey) / 2
    let angle = Math.atan2(dey - dsy, dex - dsx) * 180 / Math.PI
    if (angle > 90) angle -= 180; if (angle < -90) angle += 180
    const label = fmtFt(ft)
    if (!label) return
    const bgW = label.length * 5.8 + 10
    svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
    svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7.5" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
    svg += `<text x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="500" fill="#222" ${FONT}>${label}</text>`
    svg += `</g>`
  }

  if (isHipRoof) {
    // Draw 4 facets with alternating crosshatch
    const facets = [
      { pts: [corners[0], corners[1], ridgeR, ridgeL], pat: 'fb-xhatch' },     // top (N)
      { pts: [corners[1], corners[2], ridgeR], pat: 'fb-xhatch-2' },            // right (E)
      { pts: [corners[2], corners[3], ridgeL, ridgeR], pat: 'fb-xhatch' },     // bottom (S)
      { pts: [corners[3], corners[0], ridgeL], pat: 'fb-xhatch-2' },            // left (W)
    ]
    facets.forEach(f => {
      const pts = f.pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      svg += `<polygon points="${pts}" fill="url(#${f.pat})" stroke="none"/>`
    })

    // Color-coded perimeter edges
    // Top eave (N)
    svg += `<line x1="${corners[0][0]}" y1="${corners[0][1]}" x2="${corners[1][0]}" y2="${corners[1][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2" stroke-linecap="round"/>`
    // Bottom eave (S)
    svg += `<line x1="${corners[2][0]}" y1="${corners[2][1]}" x2="${corners[3][0]}" y2="${corners[3][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2" stroke-linecap="round"/>`
    // Right eave (E)
    svg += `<line x1="${corners[1][0]}" y1="${corners[1][1]}" x2="${corners[2][0]}" y2="${corners[2][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2" stroke-linecap="round"/>`
    // Left eave (W)
    svg += `<line x1="${corners[3][0]}" y1="${corners[3][1]}" x2="${corners[0][0]}" y2="${corners[0][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2" stroke-linecap="round"/>`
    // Bold perimeter outline (beneath colors for crisp corners)
    svg += `<polygon points="${corners.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="#111" stroke-width="1" stroke-linejoin="miter"/>`
    corners.forEach(p => { svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#111"/>` })

    // Ridge (red)
    svg += `<line x1="${ridgeL[0]}" y1="${ridgeL[1]}" x2="${ridgeR[0]}" y2="${ridgeR[1]}" stroke="${EDGE_COLOR['RIDGE']}" stroke-width="2"/>`
    // Hips (amber)
    svg += `<line x1="${corners[0][0]}" y1="${corners[0][1]}" x2="${ridgeL[0]}" y2="${ridgeL[1]}" stroke="${EDGE_COLOR['HIP']}" stroke-width="1.5"/>`
    svg += `<line x1="${corners[1][0]}" y1="${corners[1][1]}" x2="${ridgeR[0]}" y2="${ridgeR[1]}" stroke="${EDGE_COLOR['HIP']}" stroke-width="1.5"/>`
    svg += `<line x1="${corners[2][0]}" y1="${corners[2][1]}" x2="${ridgeR[0]}" y2="${ridgeR[1]}" stroke="${EDGE_COLOR['HIP']}" stroke-width="1.5"/>`
    svg += `<line x1="${corners[3][0]}" y1="${corners[3][1]}" x2="${ridgeL[0]}" y2="${ridgeL[1]}" stroke="${EDGE_COLOR['HIP']}" stroke-width="1.5"/>`

    // Facet numbers
    const facetCenters = [
      [(corners[0][0] + corners[1][0] + ridgeR[0] + ridgeL[0]) / 4, (corners[0][1] + corners[1][1] + ridgeR[1] + ridgeL[1]) / 4],
      [(corners[1][0] + corners[2][0] + ridgeR[0]) / 3, (corners[1][1] + corners[2][1] + ridgeR[1]) / 3],
      [(corners[2][0] + corners[3][0] + ridgeL[0] + ridgeR[0]) / 4, (corners[2][1] + corners[3][1] + ridgeL[1] + ridgeR[1]) / 4],
      [(corners[3][0] + corners[0][0] + ridgeL[0]) / 3, (corners[3][1] + corners[0][1] + ridgeL[1]) / 3],
    ]
    facetCenters.forEach((fc, i) => {
      if (i >= Math.max(segments.length, 4)) return
      svg += `<text x="${fc[0].toFixed(1)}" y="${(fc[1] + 7).toFixed(1)}" text-anchor="middle" font-size="22" font-weight="700" fill="#3a3a3a" ${FONT} opacity="0.85">${i + 1}</text>`
    })

    // Dimension lines on eave edges
    const eaveFtHalf = edgeSummary.total_eave_ft > 0 ? edgeSummary.total_eave_ft / 2 : lengthFt
    const sideFt = edgeSummary.total_eave_ft > 0 ? (edgeSummary.total_rake_ft > 0 ? edgeSummary.total_rake_ft / 2 : widthFt) : widthFt
    drawDimLine(corners[0], corners[1], eaveFtHalf, [0, -1])  // top eave outward=up
    drawDimLine(corners[3], corners[2], eaveFtHalf, [0, 1])   // bottom eave outward=down
    drawDimLine(corners[1], corners[2], sideFt, [1, 0])        // right side outward=right
    drawDimLine(corners[0], corners[3], sideFt, [-1, 0])       // left side outward=left

    // Ridge label
    const ridgeFt = edgeSummary.total_ridge_ft || 0
    if (ridgeFt > 0) {
      const rmx = (ridgeL[0] + ridgeR[0]) / 2, rmy = ridgeL[1] - 10
      const label = fmtFt(ridgeFt)
      if (label) {
        const bgW = label.length * 5.8 + 10
        svg += `<rect x="${(rmx - bgW / 2).toFixed(1)}" y="${(rmy - 7).toFixed(1)}" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
        svg += `<text x="${rmx.toFixed(1)}" y="${(rmy + 3.5).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="500" fill="${EDGE_COLOR['RIDGE']}" ${FONT}>${label}</text>`
      }
    }

    // Hip labels
    const hipFtTotal = edgeSummary.total_hip_ft || 0
    if (hipFtTotal > 0) {
      const hipFtEach = hipFtTotal / 4
      const hipLines = [
        { s: corners[0], e: ridgeL }, { s: corners[1], e: ridgeR },
        { s: corners[2], e: ridgeR }, { s: corners[3], e: ridgeL },
      ]
      hipLines.forEach(h => {
        const hmx = (h.s[0] + h.e[0]) / 2, hmy = (h.s[1] + h.e[1]) / 2
        const label = fmtFt(hipFtEach)
        if (!label) return
        let angle = Math.atan2(h.e[1] - h.s[1], h.e[0] - h.s[0]) * 180 / Math.PI
        if (angle > 90) angle -= 180; if (angle < -90) angle += 180
        const bgW = label.length * 5.8 + 10
        const perpDx = -(h.e[1] - h.s[1]), perpDy = h.e[0] - h.s[0]
        const perpLen = Math.sqrt(perpDx * perpDx + perpDy * perpDy) || 1
        const lx = hmx + (perpDx / perpLen) * 9
        const ly = hmy + (perpDy / perpLen) * 9
        svg += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${angle.toFixed(1)})">`
        svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7.5" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
        svg += `<text x="0" y="3" text-anchor="middle" font-size="8.5" font-weight="500" fill="${EDGE_COLOR['HIP']}" ${FONT}>${label}</text>`
        svg += `</g>`
      })
    }
  } else {
    // Simple gable roof (2 facets)
    svg += `<rect x="${corners[0][0]}" y="${corners[0][1]}" width="${hw * 2}" height="${hh}" fill="url(#fb-xhatch)" stroke="none"/>`
    svg += `<rect x="${corners[0][0]}" y="${cy}" width="${hw * 2}" height="${hh}" fill="url(#fb-xhatch-2)" stroke="none"/>`
    // Color-coded eave edges
    svg += `<line x1="${corners[0][0]}" y1="${corners[0][1]}" x2="${corners[1][0]}" y2="${corners[1][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2"/>`
    svg += `<line x1="${corners[2][0]}" y1="${corners[2][1]}" x2="${corners[3][0]}" y2="${corners[3][1]}" stroke="${EDGE_COLOR['EAVE']}" stroke-width="3.2"/>`
    // Rake edges
    svg += `<line x1="${corners[1][0]}" y1="${corners[1][1]}" x2="${corners[2][0]}" y2="${corners[2][1]}" stroke="${EDGE_COLOR['RAKE']}" stroke-width="3.2"/>`
    svg += `<line x1="${corners[3][0]}" y1="${corners[3][1]}" x2="${corners[0][0]}" y2="${corners[0][1]}" stroke="${EDGE_COLOR['RAKE']}" stroke-width="3.2"/>`
    svg += `<polygon points="${corners.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="#111" stroke-width="1" stroke-linejoin="miter"/>`
    // Ridge
    svg += `<line x1="${cx - hw}" y1="${cy}" x2="${cx + hw}" y2="${cy}" stroke="${EDGE_COLOR['RIDGE']}" stroke-width="2"/>`
    corners.forEach(p => { svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#111"/>` })
    svg += `<text x="${cx}" y="${cy - hh / 3 + 7}" text-anchor="middle" font-size="22" font-weight="700" fill="#3a3a3a" ${FONT} opacity="0.85">1</text>`
    svg += `<text x="${cx}" y="${cy + hh / 3 + 7}" text-anchor="middle" font-size="22" font-weight="700" fill="#3a3a3a" ${FONT} opacity="0.85">2</text>`

    // Dimension lines
    const eaveFtHalf = edgeSummary.total_eave_ft > 0 ? edgeSummary.total_eave_ft / 2 : lengthFt
    const rakeFtHalf = edgeSummary.total_rake_ft > 0 ? edgeSummary.total_rake_ft / 2 : widthFt
    drawDimLine(corners[0], corners[1], eaveFtHalf, [0, -1])
    drawDimLine(corners[3], corners[2], eaveFtHalf, [0, 1])
    drawDimLine(corners[1], corners[2], rakeFtHalf, [1, 0])
    drawDimLine(corners[0], corners[3], rakeFtHalf, [-1, 0])

    // Ridge label
    const ridgeFt = edgeSummary.total_ridge_ft || 0
    if (ridgeFt > 0) {
      const rmx = cx, rmy = cy - 10
      const label = fmtFt(ridgeFt)
      if (label) {
        const bgW = label.length * 5.8 + 10
        svg += `<rect x="${(rmx - bgW / 2).toFixed(1)}" y="${(rmy - 7).toFixed(1)}" width="${bgW.toFixed(1)}" height="14" rx="1.5" fill="#fff" opacity="0.94"/>`
        svg += `<text x="${rmx.toFixed(1)}" y="${(rmy + 3.5).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="500" fill="${EDGE_COLOR['RIDGE']}" ${FONT}>${label}</text>`
      }
    }
  }

  // EDGE-TYPE LEGEND (top-left corner)
  const legendTypes = isHipRoof ? ['EAVE', 'HIP', 'RIDGE'] : ['EAVE', 'RAKE', 'RIDGE']
  if (edgeSummary.total_valley_ft > 0) legendTypes.push('VALLEY')
  const legendNames: Record<string, string> = { 'EAVE': 'Eave', 'HIP': 'Hip', 'RIDGE': 'Ridge', 'VALLEY': 'Valley', 'RAKE': 'Rake' }
  const lx = 12, ly = 14
  svg += `<rect x="${lx}" y="${ly}" width="68" height="${legendTypes.length * 13 + 8}" rx="2" fill="#fff" opacity="0.92" stroke="#ddd" stroke-width="0.5"/>`
  legendTypes.forEach((t, i) => {
    const iy = ly + 10 + i * 13
    const clr = EDGE_COLOR[t] || '#333'
    const dash = t === 'VALLEY' ? ' stroke-dasharray="3,2"' : ''
    svg += `<line x1="${lx + 5}" y1="${iy}" x2="${lx + 20}" y2="${iy}" stroke="${clr}" stroke-width="2.5"${dash} stroke-linecap="round"/>`
    svg += `<text x="${lx + 24}" y="${iy + 3}" font-size="7.5" font-weight="600" fill="#444" ${FONT}>${legendNames[t] || t}</text>`
  })

  // Compass rose
  const crX = W - 42, crY = 32
  svg += `<g transform="translate(${crX},${crY})">`
  svg += `<circle cx="0" cy="0" r="15" fill="#fff" fill-opacity="0.85" stroke="#999" stroke-width="0.7"/>`
  svg += `<line x1="0" y1="11" x2="0" y2="-11" stroke="#999" stroke-width="0.8"/>`
  svg += `<line x1="-11" y1="0" x2="11" y2="0" stroke="#999" stroke-width="0.5"/>`
  svg += `<polygon points="0,-13 -3.5,-4 3.5,-4" fill="#C62828"/>`
  svg += `<polygon points="0,13 -3.5,4 3.5,4" fill="#999"/>`
  svg += `<text x="0" y="-17" text-anchor="middle" font-size="8" font-weight="800" fill="#333" ${FONT}>N</text>`
  svg += `</g>`

  // Note: "Estimated from Solar API data"
  svg += `<text x="${W / 2}" y="${H - FOOTER_H - 8}" text-anchor="middle" font-size="7" fill="#94a3b8" ${FONT} font-style="italic">Estimated from Solar API data &mdash; run AI Enhancement for precise geometry</text>`

  // Footer bar (4 columns)
  const fY = H - FOOTER_H
  const barW2 = W * 0.94, barX2 = (W - barW2) / 2, colW2 = barW2 / 4
  svg += `<rect x="${barX2.toFixed(1)}" y="${fY}" width="${barW2.toFixed(1)}" height="${FOOTER_H}" fill="#002244"/>`
  for (let c = 1; c < 4; c++) {
    svg += `<line x1="${(barX2 + colW2 * c).toFixed(1)}" y1="${fY + 8}" x2="${(barX2 + colW2 * c).toFixed(1)}" y2="${fY + FOOTER_H - 8}" stroke="#0a3a5e" stroke-width="1"/>`
  }
  const totalLinFt = Math.round(edgeSummary.total_ridge_ft + edgeSummary.total_hip_ft + edgeSummary.total_valley_ft + edgeSummary.total_eave_ft + edgeSummary.total_rake_ft)
  const fbData = [
    { label: 'FACETS', value: `${Math.max(segments.length, 2)}` },
    { label: 'PITCH', value: predominantPitch || `${avgPitchDeg.toFixed(0)}\u00B0` },
    { label: 'AREA (SF)', value: `${Math.round(grossSquares).toLocaleString()}` },
    { label: 'LINEAR FT', value: `${totalLinFt}` },
  ]
  fbData.forEach((d, i) => {
    const fcx = barX2 + colW2 * i + colW2 / 2
    svg += `<text x="${fcx.toFixed(1)}" y="${fY + 15}" text-anchor="middle" font-size="7" font-weight="700" fill="#7eafd4" ${FONT} letter-spacing="1.5">${d.label}</text>`
    svg += `<text x="${fcx.toFixed(1)}" y="${fY + 38}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" ${FONT}>${d.value}</text>`
  })

  svg += `</svg>`
  return svg
}


// ============================================================
// PRECISE AI OVERLAY SVG — v2.0 — GSD-Calibrated + Pitch-Corrected
//
// This function generates a TRANSPARENT SVG that is absolutely
// positioned on top of a 640×640 satellite <img> element.
//
// v2.0 improvements over v1.0:
//   1. GSD-calibrated pixel-to-foot: uses DSM pixelSizeMeters when available,
//      falls back to zoom-level formula, then bbox heuristic
//   2. Color-coded perimeter edges by type:
//      EAVE = #10b981 (green), HIP = #eab308 (yellow),
//      RAKE = #a855f7 (purple), RIDGE = #ef4444 (red)
//   3. Pitch-corrected true lengths on angled edges:
//      true_length = plan_length / cos(pitch_rad) for hips/valleys/rakes
//   4. Construction-grade labels: feet + inches (32' 4") not decimals
//   5. Enhanced internal line classification using facet shared-edge analysis
//   6. Visual legend mapping colors → edge types
// ============================================================
export function generatePreciseAIOverlaySVG(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  footprintSqft: number,
  predominantPitchDeg: number = 20,
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number } = { total_ridge_ft: 0, total_hip_ft: 0, total_valley_ft: 0, total_eave_ft: 0, total_rake_ft: 0 },
  dsmGsdMeters: number = 0
): string {
  const W = 640, H = 640

  // ── FALLBACK when no AI geometry — show edge summary data box ──
  if (!aiGeometry || (!aiGeometry.perimeter?.length && !aiGeometry.facets?.length)) {
    const font = 'font-family="Inter,system-ui,sans-serif"'
    const es = edgeSummary
    const hasEdgeData = es.total_eave_ft > 0 || es.total_ridge_ft > 0 || es.total_hip_ft > 0
    const totalLinFt = es.total_ridge_ft + es.total_hip_ft + es.total_valley_ft + es.total_eave_ft + es.total_rake_ft
    // Show a semi-transparent summary panel with edge measurements
    let fallback = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">`
    if (hasEdgeData) {
      const bx = 130, by = 220, bw = 380, lineH = 22
      const lines = [
        { label: 'Eave (Drip Edge)', value: `${es.total_eave_ft.toFixed(1)} ft`, color: '#10b981' },
        { label: 'Ridge', value: `${es.total_ridge_ft.toFixed(1)} ft`, color: '#ef4444' },
        { label: 'Hip', value: `${es.total_hip_ft.toFixed(1)} ft`, color: '#eab308' },
        { label: 'Valley', value: `${es.total_valley_ft.toFixed(1)} ft`, color: '#3b82f6' },
        { label: 'Rake', value: `${es.total_rake_ft.toFixed(1)} ft`, color: '#a855f7' },
      ].filter(l => parseFloat(l.value) > 0)
      const bh = lines.length * lineH + 65
      fallback += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="rgba(0,34,68,0.88)"/>`
      fallback += `<text x="${W / 2}" y="${by + 22}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" ${font}>EDGE MEASUREMENTS</text>`
      fallback += `<line x1="${bx + 15}" y1="${by + 32}" x2="${bx + bw - 15}" y2="${by + 32}" stroke="#0a3a5e" stroke-width="0.8"/>`
      lines.forEach((l, i) => {
        const ly = by + 50 + i * lineH
        fallback += `<line x1="${bx + 18}" y1="${ly}" x2="${bx + 33}" y2="${ly}" stroke="${l.color}" stroke-width="3" stroke-linecap="round"/>`
        fallback += `<text x="${bx + 40}" y="${ly + 4}" fill="#c8dae8" font-size="11" ${font}>${l.label}</text>`
        fallback += `<text x="${bx + bw - 20}" y="${ly + 4}" text-anchor="end" fill="#fff" font-size="11" font-weight="700" ${font}>${l.value}</text>`
      })
      const totalY = by + 50 + lines.length * lineH + 4
      fallback += `<line x1="${bx + 15}" y1="${totalY - 8}" x2="${bx + bw - 15}" y2="${totalY - 8}" stroke="#0a3a5e" stroke-width="0.8"/>`
      fallback += `<text x="${bx + 40}" y="${totalY + 8}" fill="#7eafd4" font-size="11" font-weight="700" ${font}>Total Linear</text>`
      fallback += `<text x="${bx + bw - 20}" y="${totalY + 8}" text-anchor="end" fill="#00e5ff" font-size="12" font-weight="800" ${font}>${totalLinFt.toFixed(0)} ft</text>`
    } else {
      fallback += `<rect x="160" y="280" width="320" height="80" rx="8" fill="rgba(0,0,0,0.75)"/>`
      fallback += `<text x="${W / 2}" y="310" text-anchor="middle" fill="#00e5ff" font-size="14" font-weight="700" ${font}>AI Geometry Pending</text>`
      fallback += `<text x="${W / 2}" y="335" text-anchor="middle" fill="#7eafd4" font-size="11" ${font}>Run AI Enhancement to generate point-by-point blueprint</text>`
    }
    fallback += `</svg>`
    return fallback
  }

  const hasPerimeter = aiGeometry.perimeter && aiGeometry.perimeter.length >= 3
  const hasFacets = aiGeometry.facets && aiGeometry.facets.length >= 2

  // ── COLOR PALETTE — Construction-standard edge type colors ──
  const EDGE_COLORS: Record<string, string> = {
    'EAVE':  '#10b981', // Emerald green — gutterline/drip edge
    'HIP':   '#eab308', // Amber yellow — hip edges
    'RAKE':  '#a855f7', // Purple — gable rakes
    'RIDGE': '#ef4444', // Red — ridge lines
    'VALLEY': '#3b82f6', // Blue — valley lines
  }
  const DEFAULT_EDGE_COLOR = '#00e5ff' // Cyan fallback

  // ── GSD-CALIBRATED PIXEL-TO-FOOT SCALE ──
  // Priority 1: Use DSM Ground Sample Distance from Google Solar API (most accurate)
  // Priority 2: Compute from perimeter bbox vs known footprint area (heuristic)
  let pxPerFt = 1
  let scaleSource = 'bbox'

  if (dsmGsdMeters > 0.01 && dsmGsdMeters < 5) {
    // DSM GSD: each pixel = dsmGsdMeters meters.
    // For the 640×640 satellite image, Google Maps zoom 20 ≈ 0.15 m/px.
    // The satellite image may be at different resolution than DSM, but
    // the DSM GSD gives us a ground-truth reference.
    // Convert: meters/px → feet/px → px/ft
    const ftPerPx = dsmGsdMeters * 3.28084  // 1 meter = 3.28084 feet
    pxPerFt = 1 / ftPerPx
    scaleSource = 'GSD'
  }

  // Fallback: compute from geometry bounding box vs known footprint
  if (scaleSource !== 'GSD') {
    if (hasPerimeter) {
      const xs = aiGeometry.perimeter.map(p => p.x)
      const ys = aiGeometry.perimeter.map(p => p.y)
      const bboxW = Math.max(...xs) - Math.min(...xs)
      const bboxH = Math.max(...ys) - Math.min(...ys)
      const bboxAreaPx = Math.max(bboxW * bboxH, 1)
      const realSqft = Math.max(footprintSqft, 100)
      pxPerFt = Math.sqrt(bboxAreaPx / realSqft)
    } else if (hasFacets) {
      const allPts = aiGeometry.facets.flatMap(f => f.points || [])
      if (allPts.length > 2) {
        const xs = allPts.map(p => p.x)
        const ys = allPts.map(p => p.y)
        const bboxW = Math.max(...xs) - Math.min(...xs)
        const bboxH = Math.max(...ys) - Math.min(...ys)
        const bboxAreaPx = Math.max(bboxW * bboxH, 1)
        pxPerFt = Math.sqrt(bboxAreaPx / Math.max(footprintSqft, 100))
      }
    }
  }

  // ── PITCH HELPERS ──
  const pitchRad = (predominantPitchDeg || 20) * Math.PI / 180
  // Parse facet-specific pitch when available
  const parsePitch = (pitchStr: string | undefined, defaultDeg: number): number => {
    if (!pitchStr) return defaultDeg
    // Handle "X/12" format
    const ratioMatch = pitchStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*12$/)
    if (ratioMatch) return Math.atan(parseFloat(ratioMatch[1]) / 12) * 180 / Math.PI
    // Handle "X deg" or "X°" format
    const degMatch = pitchStr.match(/^(\d+(?:\.\d+)?)\s*(?:deg|°)?$/)
    if (degMatch) {
      const v = parseFloat(degMatch[1])
      return v > 0 && v < 90 ? v : defaultDeg
    }
    return defaultDeg
  }

  // Pitch correction factor: plan_length × factor = true 3D length
  // For eaves (horizontal), factor = 1.0
  // For hips/valleys: factor = √(1 + tan²(pitch)/2) (diagonal slope)
  // For rakes: factor = 1/cos(pitch) (up the slope)
  const pitchFactorForType = (edgeType: string, pitchDeg?: number): number => {
    const pd = pitchDeg || predominantPitchDeg || 20
    const pr = pd * Math.PI / 180
    switch (edgeType) {
      case 'EAVE': return 1.0
      case 'RIDGE': return 1.0
      case 'HIP':
      case 'VALLEY':
        // Hip/valley run diagonally across the slope: √(1 + tan²(pitch)/2)
        return Math.sqrt(1 + Math.pow(Math.tan(pr), 2) / 2)
      case 'RAKE':
        // Rake runs up the slope: 1/cos(pitch)
        return 1 / Math.cos(pr)
      default: return 1.0
    }
  }

  // Coordinate clamping
  const tx = (x: number) => Math.max(0, Math.min(W, x))
  const ty = (y: number) => Math.max(0, Math.min(H, y))

  // Pixel distance to plan feet
  const pxToFt = (px: number) => pxPerFt > 0.01 ? px / pxPerFt : 0

  // Format feet as construction-grade: 32' 4" instead of 32.3'
  const fmtFtIn = (ft: number): string => {
    if (ft < 0.5) return `${Math.round(ft * 12)}"`
    const wholeFt = Math.floor(ft)
    const inches = Math.round((ft - wholeFt) * 12)
    if (inches === 0) return `${wholeFt}'`
    if (inches === 12) return `${wholeFt + 1}'`
    return `${wholeFt}' ${inches}"`
  }

  // ── BUILD SVG (transparent background — overlays the satellite <img>) ──
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">`

  // Defs for glow effects
  svg += `<defs>
    <filter id="ov-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="ov-glow-line" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="ov-label-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>`

  // ── FACET FILLS (semi-transparent polygons with per-facet tint) ──
  if (hasFacets) {
    const facetTints = ['rgba(0,229,255,0.08)', 'rgba(16,185,129,0.06)', 'rgba(234,179,8,0.06)', 'rgba(239,68,68,0.06)', 'rgba(168,85,247,0.06)', 'rgba(59,130,246,0.06)']
    aiGeometry.facets.forEach((facet, i) => {
      if (!facet.points || facet.points.length < 3) return
      const pts = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      const tint = facetTints[i % facetTints.length]
      svg += `<polygon points="${pts}" fill="${tint}" stroke="rgba(0,229,255,0.25)" stroke-width="0.5"/>`
    })
  }

  // ── PERIMETER: Color-coded edges by type (EAVE=green, HIP=yellow, RAKE=purple) ──
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length

    // Draw each perimeter segment in its edge-type color
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const edgeType = p1.edge_to_next || 'EAVE'
      const color = EDGE_COLORS[edgeType] || DEFAULT_EDGE_COLOR
      svg += `<line x1="${tx(p1.x).toFixed(1)}" y1="${ty(p1.y).toFixed(1)}" x2="${tx(p2.x).toFixed(1)}" y2="${ty(p2.y).toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round" filter="url(#ov-glow-cyan)"/>`
    }

    // Vertex dots at every corner (white with colored stroke)
    for (let i = 0; i < n; i++) {
      const edgeType = perim[i].edge_to_next || 'EAVE'
      const color = EDGE_COLORS[edgeType] || DEFAULT_EDGE_COLOR
      svg += `<circle cx="${tx(perim[i].x).toFixed(1)}" cy="${ty(perim[i].y).toFixed(1)}" r="4" fill="#fff" stroke="${color}" stroke-width="2" filter="url(#ov-glow-cyan)"/>`
    }

    // ── PERIMETER EDGE LENGTH LABELS with pitch correction ──
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const edgeType = p1.edge_to_next || 'EAVE'
      const color = EDGE_COLORS[edgeType] || DEFAULT_EDGE_COLOR
      const sx = tx(p1.x), sy = ty(p1.y)
      const ex = tx(p2.x), ey = ty(p2.y)
      const segPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
      if (segPx < 15) continue

      const planFt = pxToFt(segPx)
      if (planFt < 0.5) continue

      // Apply pitch correction: hips and rakes are longer in 3D than in plan view
      const trueFt = planFt * pitchFactorForType(edgeType)

      // Offset label outward from the perimeter
      const dx = ex - sx, dy = ey - sy
      const len = Math.sqrt(dx * dx + dy * dy)
      const nx = -dy / len, ny = dx / len
      const offset = 20
      const mx = (sx + ex) / 2 + nx * offset
      const my = (sy + ey) / 2 + ny * offset

      // Rotation so label follows the edge
      let angle = Math.atan2(ey - sy, ex - sx) * 180 / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180

      const label = fmtFtIn(trueFt)
      const bgW = Math.max(label.length * 6.5 + 14, 48)

      svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})" filter="url(#ov-label-shadow)">`
      svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-9" width="${bgW.toFixed(1)}" height="18" rx="3" fill="rgba(0,34,68,0.92)" stroke="${color}" stroke-width="0.8"/>`
      svg += `<text x="0" y="4" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="Inter,system-ui,sans-serif">${label}</text>`
      svg += `</g>`
    }
  }

  // ── INTERNAL STRUCTURAL LINES (ridges, hips, valleys) ──
  const internalColors: Record<string, string> = {
    'RIDGE': '#ef4444', // Red
    'HIP':   '#eab308', // Yellow
    'VALLEY': '#3b82f6', // Blue
  }

  // Derive internal lines from facet shared edges if geometry.lines is empty
  let effectiveLines = aiGeometry.lines || []
  if (effectiveLines.length === 0 && hasFacets) {
    const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      `${Math.round(Math.min(a.x, b.x))},${Math.round(Math.min(a.y, b.y))}-${Math.round(Math.max(a.x, b.x))},${Math.round(Math.max(a.y, b.y))}`
    const edgeMap: Record<string, { start: { x: number; y: number }; end: { x: number; y: number }; count: number }> = {}
    aiGeometry.facets.forEach(facet => {
      if (!facet.points || facet.points.length < 3) return
      for (let j = 0; j < facet.points.length; j++) {
        const a = facet.points[j], b = facet.points[(j + 1) % facet.points.length]
        const key = edgeKey(a, b)
        if (!edgeMap[key]) edgeMap[key] = { start: a, end: b, count: 0 }
        edgeMap[key].count++
      }
    })
    const derived: typeof effectiveLines = []
    for (const [, edge] of Object.entries(edgeMap)) {
      if (edge.count >= 2) {
        // Shared edge = internal line. Classify using geometry:
        // - Near-horizontal in plan view → RIDGE (runs along building length at top)
        // - Diagonal → HIP or VALLEY
        // Distinction: HIP edges slope DOWN from ridge to perimeter corner (external angle),
        //              VALLEY edges channel water inward (internal angle between wings).
        // Heuristic: if the midpoint of this edge is close to the perimeter,
        // it's likely a HIP; if it's interior, it's more likely a VALLEY.
        const dx = Math.abs(edge.end.x - edge.start.x)
        const dy = Math.abs(edge.end.y - edge.start.y)
        let lineType: string
        if (dy < dx * 0.3) {
          lineType = 'RIDGE' // Near-horizontal shared edge = ridge line
        } else {
          // Check proximity to perimeter to distinguish hip from valley
          if (hasPerimeter) {
            const mx = (edge.start.x + edge.end.x) / 2
            const my = (edge.start.y + edge.end.y) / 2
            const centroidX = aiGeometry.perimeter.reduce((s, p) => s + p.x, 0) / aiGeometry.perimeter.length
            const centroidY = aiGeometry.perimeter.reduce((s, p) => s + p.y, 0) / aiGeometry.perimeter.length
            const distFromCenter = Math.sqrt((mx - centroidX) ** 2 + (my - centroidY) ** 2)
            const avgPerimDist = aiGeometry.perimeter.reduce((s, p) => 
              s + Math.sqrt((p.x - centroidX) ** 2 + (p.y - centroidY) ** 2), 0) / aiGeometry.perimeter.length
            // If midpoint is closer to perimeter than center → HIP
            // If midpoint is more interior → VALLEY (where two wings meet inward)
            lineType = distFromCenter > avgPerimDist * 0.65 ? 'HIP' : 'VALLEY'
          } else {
            lineType = 'HIP' // Default to HIP when no perimeter for context
          }
        }
        derived.push({ type: lineType as any, start: edge.start, end: edge.end })
      }
    }
    effectiveLines = derived
  }

  // Draw internal lines
  effectiveLines.forEach(line => {
    if (line.type === 'EAVE' || line.type === 'RAKE') return
    const color = internalColors[line.type] || DEFAULT_EDGE_COLOR
    const dash = line.type === 'VALLEY' ? ' stroke-dasharray="8,4"' : ''
    svg += `<line x1="${tx(line.start.x).toFixed(1)}" y1="${ty(line.start.y).toFixed(1)}" x2="${tx(line.end.x).toFixed(1)}" y2="${ty(line.end.y).toFixed(1)}" stroke="${color}" stroke-width="2.5"${dash} stroke-linecap="round" filter="url(#ov-glow-line)"/>`
    svg += `<circle cx="${tx(line.start.x).toFixed(1)}" cy="${ty(line.start.y).toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="0.8"/>`
    svg += `<circle cx="${tx(line.end.x).toFixed(1)}" cy="${ty(line.end.y).toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="0.8"/>`
  })

  // Internal line length labels with pitch correction
  effectiveLines.forEach(line => {
    if (line.type === 'EAVE' || line.type === 'RAKE') return
    const color = internalColors[line.type] || DEFAULT_EDGE_COLOR
    const sx = tx(line.start.x), sy = ty(line.start.y)
    const ex = tx(line.end.x), ey = ty(line.end.y)
    const segPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
    const planFt = pxToFt(segPx)
    if (planFt < 0.5 || segPx < 20) return

    // Apply pitch correction for internal lines
    const trueFt = planFt * pitchFactorForType(line.type)

    const mx = (sx + ex) / 2, my = (sy + ey) / 2
    let angle = Math.atan2(ey - sy, ex - sx) * 180 / Math.PI
    if (angle > 90) angle -= 180
    if (angle < -90) angle += 180

    const label = fmtFtIn(trueFt)
    const bgW = Math.max(label.length * 6.5 + 14, 48)

    svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})" filter="url(#ov-label-shadow)">`
    svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-9" width="${bgW.toFixed(1)}" height="18" rx="3" fill="rgba(50,0,0,0.88)" stroke="${color}" stroke-width="0.8"/>`
    svg += `<text x="0" y="4" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="Inter,system-ui,sans-serif">${label}</text>`
    svg += `</g>`
  })

  // ── FACET NUMBER CIRCLES with area label ──
  if (hasFacets) {
    aiGeometry.facets.forEach((facet, i) => {
      if (!facet.points || facet.points.length < 3) return
      const cx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
      const cy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length

      // Compute facet pixel area using shoelace formula, convert to sqft
      let pxArea = 0
      for (let j = 0; j < facet.points.length; j++) {
        const a = facet.points[j], b = facet.points[(j + 1) % facet.points.length]
        pxArea += a.x * b.y - b.x * a.y
      }
      pxArea = Math.abs(pxArea) / 2
      const planSqft = pxPerFt > 0.01 ? pxArea / (pxPerFt * pxPerFt) : 0
      // Apply pitch correction for true area
      const facetPitchDeg = parsePitch(facet.pitch, predominantPitchDeg)
      const trueSqft = planSqft / Math.cos(facetPitchDeg * Math.PI / 180)

      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="rgba(0,34,68,0.88)" stroke="#00e5ff" stroke-width="1.5"/>`
      svg += `<text x="${cx.toFixed(1)}" y="${(cy + 1).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${i + 1}</text>`
      // Small area label below the number
      if (trueSqft > 10) {
        svg += `<text x="${cx.toFixed(1)}" y="${(cy + 24).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="600" fill="#7eafd4" font-family="Inter,system-ui,sans-serif" filter="url(#ov-label-shadow)">${Math.round(trueSqft)} ft²</text>`
      }
    })
  }

  // ── OBSTRUCTIONS ──
  if (aiGeometry.obstructions && aiGeometry.obstructions.length > 0) {
    aiGeometry.obstructions.forEach(obs => {
      const x1 = tx(obs.boundingBox.min.x), y1 = ty(obs.boundingBox.min.y)
      const x2 = tx(obs.boundingBox.max.x), y2 = ty(obs.boundingBox.max.y)
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1)
      svg += `<rect x="${Math.min(x1, x2).toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="#ff6e40" stroke-width="1.5" stroke-dasharray="4,2" rx="2"/>`
      const label = obs.type.charAt(0) + obs.type.slice(1).toLowerCase()
      svg += `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${(Math.min(y1, y2) - 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="600" fill="#ff6e40" font-family="Inter,system-ui,sans-serif">${label}</text>`
    })
  }

  // ── COMPASS ROSE (top-right) ──
  const compassX = W - 40, compassY = 40
  svg += `<circle cx="${compassX}" cy="${compassY}" r="22" fill="rgba(0,34,68,0.85)" stroke="#00e5ff" stroke-width="1"/>`
  svg += `<line x1="${compassX}" y1="${compassY + 14}" x2="${compassX}" y2="${compassY - 14}" stroke="#7eafd4" stroke-width="1.2"/>`
  svg += `<line x1="${compassX - 14}" y1="${compassY}" x2="${compassX + 14}" y2="${compassY}" stroke="#7eafd4" stroke-width="0.6"/>`
  svg += `<polygon points="${compassX},${compassY - 16} ${compassX - 4},${compassY - 8} ${compassX + 4},${compassY - 8}" fill="#ff1744"/>`
  svg += `<text x="${compassX}" y="${compassY - 20}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">N</text>`

  // ── SCALE BAR + INFO (bottom-left) ──
  const scaleBarFt = 10
  const scaleBarPx = scaleBarFt * pxPerFt
  if (scaleBarPx > 10 && scaleBarPx < W * 0.5) {
    const sbX = 16, sbY = H - 70
    svg += `<line x1="${sbX}" y1="${sbY}" x2="${sbX + scaleBarPx}" y2="${sbY}" stroke="#00e5ff" stroke-width="2"/>`
    svg += `<line x1="${sbX}" y1="${sbY - 4}" x2="${sbX}" y2="${sbY + 4}" stroke="#00e5ff" stroke-width="1.5"/>`
    svg += `<line x1="${sbX + scaleBarPx}" y1="${sbY - 4}" x2="${sbX + scaleBarPx}" y2="${sbY + 4}" stroke="#00e5ff" stroke-width="1.5"/>`
    svg += `<text x="${sbX + scaleBarPx / 2}" y="${sbY - 6}" text-anchor="middle" font-size="8" font-weight="700" fill="#00e5ff" font-family="Inter,system-ui,sans-serif">${scaleBarFt} ft</text>`
  }

  // ── LEGEND BOX (bottom-left, below scale bar) ──
  const legX = 10, legY = H - 56
  const legendItems = [
    { color: EDGE_COLORS['EAVE'], label: 'Eave', dash: false },
    { color: EDGE_COLORS['HIP'], label: 'Hip', dash: false },
    { color: EDGE_COLORS['RIDGE'], label: 'Ridge', dash: false },
    { color: EDGE_COLORS['VALLEY'], label: 'Valley', dash: true },
    { color: EDGE_COLORS['RAKE'], label: 'Rake', dash: false },
  ]
  const legW = 170, legH = 46
  svg += `<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" rx="4" fill="rgba(0,20,40,0.92)" stroke="rgba(0,229,255,0.4)" stroke-width="0.5"/>`
  // Two rows of legend items
  const row1 = legendItems.slice(0, 3)
  const row2 = legendItems.slice(3)
  row1.forEach((item, idx) => {
    const lx = legX + 8 + idx * 54
    const ly = legY + 14
    if (item.dash) {
      svg += `<line x1="${lx}" y1="${ly}" x2="${lx + 14}" y2="${ly}" stroke="${item.color}" stroke-width="2.5" stroke-dasharray="4,2"/>`
    } else {
      svg += `<line x1="${lx}" y1="${ly}" x2="${lx + 14}" y2="${ly}" stroke="${item.color}" stroke-width="2.5"/>`
    }
    svg += `<text x="${lx + 18}" y="${ly + 3.5}" font-size="8" font-weight="600" fill="${item.color}" font-family="Inter,system-ui,sans-serif">${item.label}</text>`
  })
  row2.forEach((item, idx) => {
    const lx = legX + 8 + idx * 54
    const ly = legY + 32
    if (item.dash) {
      svg += `<line x1="${lx}" y1="${ly}" x2="${lx + 14}" y2="${ly}" stroke="${item.color}" stroke-width="2.5" stroke-dasharray="4,2"/>`
    } else {
      svg += `<line x1="${lx}" y1="${ly}" x2="${lx + 14}" y2="${ly}" stroke="${item.color}" stroke-width="2.5"/>`
    }
    svg += `<text x="${lx + 18}" y="${ly + 3.5}" font-size="8" font-weight="600" fill="${item.color}" font-family="Inter,system-ui,sans-serif">${item.label}</text>`
  })

  // ── INFO BADGE (bottom-right) ──
  const ibW = 190, ibH = 36
  svg += `<rect x="${W - ibW - 10}" y="${H - ibH - 10}" width="${ibW}" height="${ibH}" rx="4" fill="rgba(0,34,68,0.92)" stroke="#00e5ff" stroke-width="0.5"/>`
  svg += `<text x="${W - ibW / 2 - 10}" y="${H - ibH + 3}" font-size="9" font-weight="700" fill="#00e5ff" font-family="Inter,system-ui,sans-serif" text-anchor="middle">FOOTPRINT: ${footprintSqft.toLocaleString()} ft²</text>`
  const facetCount = aiGeometry.facets?.length || 0
  const perimCount = aiGeometry.perimeter?.length || 0
  const scaleLabel = scaleSource === 'GSD' ? `GSD ${dsmGsdMeters.toFixed(2)} m/px` : `1 px ≈ ${(1 / pxPerFt).toFixed(2)} ft`
  svg += `<text x="${W - ibW / 2 - 10}" y="${H - ibH + 16}" font-size="7.5" font-weight="500" fill="#7eafd4" font-family="Inter,system-ui,sans-serif" text-anchor="middle">${facetCount} facets · ${perimCount} pts · ${scaleLabel}</text>`

  svg += `</svg>`
  return svg
}

// ============================================================
// PROFESSIONAL ROOF MEASUREMENT DIAGRAM — Matches Image 1 reference
// Clean architectural blueprint: solid black perimeter, crosshatch fills,
// numbered facets, dimension lines with ft labels, dark navy bars.
// This is the "money shot" diagram that goes on page 3.
// ============================================================
export function generateProfessionalDiagramSVG(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  segments: RoofSegment[],
  edges: EdgeMeasurement[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  predominantPitch: string,
  grossSquares: number
): string {
  const W = 700, H = 540
  const PAD = 60
  const HEADER_H = 0  // header handled by HTML, SVG is just the diagram
  const FOOTER_H = 0

  // If no AI geometry, return a placeholder SVG
  if (!aiGeometry || (!aiGeometry.perimeter?.length && !aiGeometry.facets?.length)) {
    return generateFallbackDiagramSVG(segments, edgeSummary, totalFootprintSqft, avgPitchDeg, predominantPitch, grossSquares)
  }

  const hasPerimeter = aiGeometry.perimeter && aiGeometry.perimeter.length >= 3
  const hasFacets = aiGeometry.facets && aiGeometry.facets.length >= 2

  if (!hasPerimeter && !hasFacets) {
    return generateFallbackDiagramSVG(segments, edgeSummary, totalFootprintSqft, avgPitchDeg, predominantPitch, grossSquares)
  }

  // ── 1. BOUNDING BOX & SCALE ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  if (hasPerimeter) {
    aiGeometry.perimeter.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) })
  }
  if (hasFacets) {
    aiGeometry.facets.forEach(f => f.points?.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }))
  }

  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const drawW = W - PAD * 2
  const drawH = H - PAD * 2
  const scale = Math.min(drawW / geoW, drawH / geoH) * 0.88
  const offsetX = PAD + (drawW - geoW * scale) / 2
  const offsetY = PAD + (drawH - geoH * scale) / 2

  const tx = (x: number) => offsetX + (x - minX) * scale
  const ty = (y: number) => offsetY + (y - minY) * scale

  // ── 2. FACET DISPLAY DATA ──
  const facetData = computeFacetDisplayData(aiGeometry!, totalFootprintSqft, avgPitchDeg)

  // ── 3. DISTRIBUTE FOOTAGE ──
  const measuredByType = smartEdgeFootage(edgeSummary)
  let perimSideFt: number[] = []
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length
    const sidesByType: Record<string, { idx: number; pxLen: number }[]> = {}
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const pxLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
      const type = p1.edge_to_next || 'EAVE'
      if (!sidesByType[type]) sidesByType[type] = []
      sidesByType[type].push({ idx: i, pxLen })
    }
    perimSideFt = new Array(n).fill(0)
    for (const [type, sides] of Object.entries(sidesByType)) {
      const totalPx = sides.reduce((s, sd) => s + sd.pxLen, 0)
      const totalFt = measuredByType[type] || 0
      if (totalPx > 0 && totalFt > 0) {
        sides.forEach(sd => { perimSideFt[sd.idx] = (sd.pxLen / totalPx) * totalFt })
      }
    }
  }

  // Internal line footage
  const internalLinesByType: Record<string, { line: typeof aiGeometry.lines[0]; pxLen: number }[]> = {}
  if (aiGeometry.lines) {
    aiGeometry.lines.forEach(l => {
      if (l.type === 'EAVE' || l.type === 'RAKE') return
      if (!internalLinesByType[l.type]) internalLinesByType[l.type] = []
      const pxLen = Math.sqrt((l.end.x - l.start.x) ** 2 + (l.end.y - l.start.y) ** 2)
      internalLinesByType[l.type].push({ line: l, pxLen })
    })
  }
  const internalMeasured: Record<string, number> = {
    'RIDGE': edgeSummary.total_ridge_ft,
    'HIP': edgeSummary.total_hip_ft,
    'VALLEY': edgeSummary.total_valley_ft,
  }

  // Derive internal lines from facets if missing
  if ((!aiGeometry.lines || aiGeometry.lines.length === 0) && hasFacets) {
    const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      `${Math.round(Math.min(a.x, b.x))},${Math.round(Math.min(a.y, b.y))}-${Math.round(Math.max(a.x, b.x))},${Math.round(Math.max(a.y, b.y))}`
    const edgeMap: Record<string, { start: { x: number; y: number }; end: { x: number; y: number }; count: number }> = {}
    aiGeometry.facets.forEach(facet => {
      if (!facet.points || facet.points.length < 3) return
      for (let j = 0; j < facet.points.length; j++) {
        const a = facet.points[j]
        const b = facet.points[(j + 1) % facet.points.length]
        const key = edgeKey(a, b)
        if (!edgeMap[key]) edgeMap[key] = { start: a, end: b, count: 0 }
        edgeMap[key].count++
      }
    })
    const derivedLines: typeof aiGeometry.lines = []
    for (const [, edge] of Object.entries(edgeMap)) {
      if (edge.count >= 2) {
        const dx = Math.abs(edge.end.x - edge.start.x)
        const dy = Math.abs(edge.end.y - edge.start.y)
        const lineType = dy < dx * 0.3 ? 'RIDGE' : 'HIP'
        derivedLines.push({ type: lineType as any, start: edge.start, end: edge.end })
      }
    }
    aiGeometry.lines = derivedLines
  }

  // ── BUILD SVG ──
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`

  // Crosshatch pattern — diamond grid matching EagleView professional style
  svg += `<defs>
    <pattern id="crosshatch" width="7" height="7" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="7" y2="7" stroke="#B0B0B0" stroke-width="0.45"/>
      <line x1="7" y1="0" x2="0" y2="7" stroke="#B0B0B0" stroke-width="0.45"/>
    </pattern>
  </defs>`

  // White background
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`

  // ── FACET FILLS with crosshatch ──
  if (hasFacets) {
    aiGeometry.facets.forEach((facet) => {
      if (!facet.points || facet.points.length < 3) return
      const points = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      svg += `<polygon points="${points}" fill="url(#crosshatch)" stroke="none"/>`
    })
  }

  // ── PERIMETER: Solid black lines ──
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length

    // Thick black perimeter outline
    const perimPoints = perim.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    svg += `<polygon points="${perimPoints}" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round"/>`

    // Corner dots
    for (let i = 0; i < n; i++) {
      svg += `<circle cx="${tx(perim[i].x).toFixed(1)}" cy="${ty(perim[i].y).toFixed(1)}" r="3" fill="#1a1a1a"/>`
    }
  }

  // ── INTERNAL STRUCTURAL LINES (ridge, hip, valley) ──
  if (aiGeometry.lines && aiGeometry.lines.length > 0) {
    aiGeometry.lines.forEach(line => {
      if (line.type === 'EAVE' || line.type === 'RAKE') return
      const dash = line.type === 'VALLEY' ? ' stroke-dasharray="6,3"' : ''
      svg += `<line x1="${tx(line.start.x).toFixed(1)}" y1="${ty(line.start.y).toFixed(1)}" x2="${tx(line.end.x).toFixed(1)}" y2="${ty(line.end.y).toFixed(1)}" stroke="#1a1a1a" stroke-width="1.8"${dash} stroke-linecap="round"/>`
    })
  }

  // ── FACET NUMBERS (circled) ──
  if (hasFacets) {
    aiGeometry.facets.forEach((facet, i) => {
      if (!facet.points || facet.points.length < 3) return
      const cx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
      const cy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="#fff" stroke="#333" stroke-width="1"/>`
      svg += `<text x="${cx.toFixed(1)}" y="${(cy + 4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#333" font-family="Inter,system-ui,sans-serif">${i + 1}</text>`
    })
  }

  // ── DIMENSION LINES with ft labels on EVERY perimeter edge ──
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length
    for (let i = 0; i < n; i++) {
      const ft = perimSideFt[i]
      if (ft < 0.3) continue

      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const sx = tx(p1.x), sy = ty(p1.y)
      const ex = tx(p2.x), ey = ty(p2.y)

      // Offset dimension line outward from perimeter
      const dx = ex - sx, dy = ey - sy
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 5) continue
      const nx = -dy / len, ny = dx / len  // normal perpendicular
      const offset = 16  // px outward
      const osx = sx + nx * offset, osy = sy + ny * offset
      const oex = ex + nx * offset, oey = ey + ny * offset

      // Dimension line
      svg += `<line x1="${osx.toFixed(1)}" y1="${osy.toFixed(1)}" x2="${oex.toFixed(1)}" y2="${oey.toFixed(1)}" stroke="#555" stroke-width="0.6"/>`
      // Tick marks at ends
      const tickLen = 5
      svg += `<line x1="${(osx - nx * tickLen).toFixed(1)}" y1="${(osy - ny * tickLen).toFixed(1)}" x2="${(osx + nx * tickLen).toFixed(1)}" y2="${(osy + ny * tickLen).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`
      svg += `<line x1="${(oex - nx * tickLen).toFixed(1)}" y1="${(oey - ny * tickLen).toFixed(1)}" x2="${(oex + nx * tickLen).toFixed(1)}" y2="${(oey + ny * tickLen).toFixed(1)}" stroke="#555" stroke-width="0.7"/>`

      // Label at midpoint
      const mx = (osx + oex) / 2, my = (osy + oey) / 2
      const angle = lineAngleDeg(osx, osy, oex, oey)
      const label = `${ft.toFixed(1)} ft`
      const bgW = Math.max(label.length * 5.5 + 6, 38)

      svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
      svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7" width="${bgW.toFixed(1)}" height="13" rx="1.5" fill="#fff" stroke="none"/>`
      svg += `<text x="0" y="3.5" text-anchor="middle" font-size="8.5" font-weight="600" fill="#333" font-family="Inter,system-ui,sans-serif">${label}</text>`
      svg += `</g>`
    }
  }

  // ── INTERNAL LINE LABELS ──
  for (const [type, items] of Object.entries(internalLinesByType)) {
    const totalPx = items.reduce((s, it) => s + it.pxLen, 0)
    const totalFt = internalMeasured[type] || 0
    items.forEach(({ line: l, pxLen }) => {
      const lineFt = totalPx > 0 && totalFt > 0 ? (pxLen / totalPx) * totalFt : 0
      if (lineFt < 0.5) return
      const mx = (tx(l.start.x) + tx(l.end.x)) / 2
      const my = (ty(l.start.y) + ty(l.end.y)) / 2
      const angle = lineAngleDeg(tx(l.start.x), ty(l.start.y), tx(l.end.x), ty(l.end.y))
      const label = `${lineFt.toFixed(1)} ft`
      const bgW = Math.max(label.length * 5.5 + 6, 38)
      svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
      svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-7" width="${bgW.toFixed(1)}" height="13" rx="1.5" fill="#fff" stroke="none"/>`
      svg += `<text x="0" y="3.5" text-anchor="middle" font-size="8.5" font-weight="600" fill="#555" font-family="Inter,system-ui,sans-serif">${label}</text>`
      svg += `</g>`
    })
  }

  // ── COMPASS ROSE (top-right) ──
  const compassX = W - 35, compassY = 35
  svg += `<circle cx="${compassX}" cy="${compassY}" r="16" fill="#fff" stroke="#333" stroke-width="1"/>`
  svg += `<line x1="${compassX}" y1="${compassY + 12}" x2="${compassX}" y2="${compassY - 12}" stroke="#333" stroke-width="1.2"/>`
  svg += `<line x1="${compassX - 12}" y1="${compassY}" x2="${compassX + 12}" y2="${compassY}" stroke="#333" stroke-width="0.6"/>`
  svg += `<polygon points="${compassX},${compassY - 14} ${compassX - 3.5},${compassY - 7} ${compassX + 3.5},${compassY - 7}" fill="#C62828"/>`
  svg += `<text x="${compassX}" y="${compassY - 18}" text-anchor="middle" font-size="10" font-weight="800" fill="#333" font-family="Inter,system-ui,sans-serif">N</text>`

  svg += `</svg>`
  return svg
}

// ============================================================
// FALLBACK PROFESSIONAL DIAGRAM — When no AI geometry
// Creates a schematic roof shape from segment data
// ============================================================
export function generateFallbackDiagramSVG(
  segments: RoofSegment[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  predominantPitch: string,
  grossSquares: number
): string {
  const W = 700, H = 540
  const n = segments.length || 4

  if (n === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#999" font-size="14" font-family="Inter,system-ui,sans-serif">AI geometry not yet generated — run AI Enhancement to produce diagram</text>
    </svg>`
  }

  // Build a proportional roof shape from footprint
  const goldenRatio = 1.618
  const totalFp = totalFootprintSqft || 1500
  const bW = Math.sqrt(totalFp * goldenRatio)
  const bH = totalFp / bW
  const PAD = 80

  const drawW = W - PAD * 2
  const drawH = H - PAD * 2
  const sc = Math.min(drawW / bW, drawH / bH) * 0.85
  const ox = PAD + (drawW - bW * sc) / 2
  const oy = PAD + (drawH - bH * sc) / 2

  const rW = bW * sc, rH = bH * sc
  const ridgeInset = Math.min(rW * 0.18, rH * 0.25)

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`

  // Crosshatch pattern
  svg += `<defs><pattern id="xhatch-fb" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="8" y2="8" stroke="#C5C5C5" stroke-width="0.5"/><line x1="8" y1="0" x2="0" y2="8" stroke="#C5C5C5" stroke-width="0.5"/></pattern></defs>`

  svg += `<rect width="${W}" height="${H}" fill="#fff"/>`

  // 4-facet hip roof
  const corners = [
    { x: ox, y: oy },
    { x: ox + rW, y: oy },
    { x: ox + rW, y: oy + rH },
    { x: ox, y: oy + rH }
  ]
  const ridgeL = { x: ox + ridgeInset, y: oy + rH / 2 }
  const ridgeR = { x: ox + rW - ridgeInset, y: oy + rH / 2 }

  // Front facet (bottom trapezoid)
  svg += `<polygon points="${corners[3].x},${corners[3].y} ${corners[2].x},${corners[2].y} ${ridgeR.x},${ridgeR.y} ${ridgeL.x},${ridgeL.y}" fill="url(#xhatch-fb)" stroke="#1a1a1a" stroke-width="2"/>`
  // Back facet (top trapezoid)
  svg += `<polygon points="${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y} ${ridgeR.x},${ridgeR.y} ${ridgeL.x},${ridgeL.y}" fill="url(#xhatch-fb)" stroke="#1a1a1a" stroke-width="2"/>`
  // Left facet (triangle)
  svg += `<polygon points="${corners[0].x},${corners[0].y} ${corners[3].x},${corners[3].y} ${ridgeL.x},${ridgeL.y}" fill="url(#xhatch-fb)" stroke="#1a1a1a" stroke-width="2"/>`
  // Right facet (triangle)
  svg += `<polygon points="${corners[1].x},${corners[1].y} ${corners[2].x},${corners[2].y} ${ridgeR.x},${ridgeR.y}" fill="url(#xhatch-fb)" stroke="#1a1a1a" stroke-width="2"/>`

  // Ridge line
  svg += `<line x1="${ridgeL.x}" y1="${ridgeL.y}" x2="${ridgeR.x}" y2="${ridgeR.y}" stroke="#1a1a1a" stroke-width="2"/>`

  // Facet numbers
  const facetCenters = [
    { x: (corners[0].x + corners[1].x + ridgeR.x + ridgeL.x) / 4, y: (corners[0].y + corners[1].y + ridgeR.y + ridgeL.y) / 4 },
    { x: (corners[3].x + corners[2].x + ridgeR.x + ridgeL.x) / 4, y: (corners[3].y + corners[2].y + ridgeR.y + ridgeL.y) / 4 },
    { x: (corners[0].x + corners[3].x + ridgeL.x) / 3, y: (corners[0].y + corners[3].y + ridgeL.y) / 3 },
    { x: (corners[1].x + corners[2].x + ridgeR.x) / 3, y: (corners[1].y + corners[2].y + ridgeR.y) / 3 }
  ]
  facetCenters.forEach((c, i) => {
    if (i >= n) return
    svg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="12" fill="#fff" stroke="#333" stroke-width="1"/>`
    svg += `<text x="${c.x.toFixed(1)}" y="${(c.y + 4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#333" font-family="Inter,system-ui,sans-serif">${i + 1}</text>`
  })

  // Edge labels based on known footage
  const eavePerSide = edgeSummary.total_eave_ft / 2 || 0
  const hipPerSide = edgeSummary.total_hip_ft / 4 || 0
  const ridgeFt = edgeSummary.total_ridge_ft || 0

  // Top eave
  if (eavePerSide > 0) {
    const mx = (corners[0].x + corners[1].x) / 2, my = corners[0].y - 20
    svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#333" font-family="Inter,system-ui,sans-serif">${eavePerSide.toFixed(1)} ft</text>`
  }
  // Bottom eave
  if (eavePerSide > 0) {
    const mx = (corners[2].x + corners[3].x) / 2, my = corners[2].y + 20
    svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#333" font-family="Inter,system-ui,sans-serif">${eavePerSide.toFixed(1)} ft</text>`
  }
  // Ridge
  if (ridgeFt > 0) {
    const mx = (ridgeL.x + ridgeR.x) / 2, my = ridgeL.y - 10
    svg += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#333" font-family="Inter,system-ui,sans-serif">${ridgeFt.toFixed(1)} ft</text>`
  }

  // Compass
  const compassX = W - 35, compassY = 35
  svg += `<circle cx="${compassX}" cy="${compassY}" r="16" fill="#fff" stroke="#333" stroke-width="1"/>`
  svg += `<line x1="${compassX}" y1="${compassY + 12}" x2="${compassX}" y2="${compassY - 12}" stroke="#333" stroke-width="1.2"/>`
  svg += `<polygon points="${compassX},${compassY - 14} ${compassX - 3.5},${compassY - 7} ${compassX + 3.5},${compassY - 7}" fill="#C62828"/>`
  svg += `<text x="${compassX}" y="${compassY - 18}" text-anchor="middle" font-size="10" font-weight="800" fill="#333" font-family="Inter,system-ui,sans-serif">N</text>`

  svg += `</svg>`
  return svg
}

type BlueprintMode = 'LENGTH' | 'AREA' | 'PITCH'

export function generateBlueprintSVG(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  segments: RoofSegment[],
  edges: EdgeMeasurement[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number; total_step_flashing_ft?: number; total_wall_flashing_ft?: number; total_transition_ft?: number; total_parapet_ft?: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  mode: BlueprintMode = 'LENGTH'
): string {
  const SVG_SIZE = 500
  const PAD = 45

  // ====================================================================
  // FALLBACK: If no AI geometry, generate a proportional wireframe from segments
  // ====================================================================
  if (!aiGeometry || (!aiGeometry.perimeter?.length && !aiGeometry.facets?.length)) {
    return generateFallbackBlueprintSVG(segments, edges, edgeSummary, mode)
  }

  const hasPerimeter = aiGeometry.perimeter && aiGeometry.perimeter.length >= 3
  const hasFacets = aiGeometry.facets && aiGeometry.facets.length >= 2

  if (!hasPerimeter && !hasFacets) {
    return generateFallbackBlueprintSVG(segments, edges, edgeSummary, mode)
  }

  // ====================================================================
  // 1. COMPUTE BOUNDING BOX & SCALE to fit 500x500 canvas
  // ====================================================================
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  if (hasPerimeter) {
    aiGeometry.perimeter.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) })
  }
  if (hasFacets) {
    aiGeometry.facets.forEach(f => f.points?.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }))
  }

  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const drawSize = SVG_SIZE - PAD * 2
  const scale = Math.min(drawSize / geoW, drawSize / geoH) * 0.95
  const offsetX = PAD + (drawSize - geoW * scale) / 2
  const offsetY = PAD + (drawSize - geoH * scale) / 2

  const tx = (x: number) => offsetX + (x - minX) * scale
  const ty = (y: number) => offsetY + (y - minY) * scale

  // ====================================================================
  // EDGE COLORS for wireframe lines
  // ====================================================================
  const edgeLineColors: Record<string, string> = {
    'RIDGE': '#C62828', 'HIP': '#E8A317', 'VALLEY': '#1565C0',
    'EAVE': '#1B2838', 'RAKE': '#2E7D32',
  }
  const edgeLineWidths: Record<string, number> = {
    'RIDGE': 2.5, 'HIP': 2, 'VALLEY': 2, 'EAVE': 1.8, 'RAKE': 1.8,
  }

  // ====================================================================
  // DERIVE INTERNAL LINES if not provided by AI
  // ====================================================================
  if ((!aiGeometry.lines || aiGeometry.lines.length === 0) && hasFacets) {
    const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      `${Math.round(Math.min(a.x, b.x))},${Math.round(Math.min(a.y, b.y))}-${Math.round(Math.max(a.x, b.x))},${Math.round(Math.max(a.y, b.y))}`
    const edgeMap: Record<string, { start: { x: number; y: number }; end: { x: number; y: number }; count: number }> = {}
    aiGeometry.facets.forEach(facet => {
      if (!facet.points || facet.points.length < 3) return
      for (let j = 0; j < facet.points.length; j++) {
        const a = facet.points[j]
        const b = facet.points[(j + 1) % facet.points.length]
        const key = edgeKey(a, b)
        if (!edgeMap[key]) edgeMap[key] = { start: a, end: b, count: 0 }
        edgeMap[key].count++
      }
    })
    const derivedLines: typeof aiGeometry.lines = []
    for (const [, edge] of Object.entries(edgeMap)) {
      if (edge.count >= 2) {
        const dx = Math.abs(edge.end.x - edge.start.x)
        const dy = Math.abs(edge.end.y - edge.start.y)
        const lineType = dy < dx * 0.3 ? 'RIDGE' : 'HIP'
        derivedLines.push({ type: lineType as any, start: edge.start, end: edge.end })
      }
    }
    aiGeometry.lines = derivedLines
  }

  // ====================================================================
  // 2. COMPUTE FACET DISPLAY DATA (real polygon area → sqft)
  // ====================================================================
  const facetData = computeFacetDisplayData(aiGeometry!, totalFootprintSqft, avgPitchDeg)

  // Distribute measured footage to perimeter sides
  const measuredByType = smartEdgeFootage(edgeSummary)

  // Build perimeter side footage
  let perimSideFt: number[] = []
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length
    const sidesByType: Record<string, { idx: number; pxLen: number }[]> = {}
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const pxLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
      const type = p1.edge_to_next || 'EAVE'
      if (!sidesByType[type]) sidesByType[type] = []
      sidesByType[type].push({ idx: i, pxLen })
    }
    perimSideFt = new Array(n).fill(0)
    for (const [type, sides] of Object.entries(sidesByType)) {
      const totalPx = sides.reduce((s, sd) => s + sd.pxLen, 0)
      const totalFt = measuredByType[type] || 0
      if (totalPx > 0 && totalFt > 0) {
        sides.forEach(sd => { perimSideFt[sd.idx] = (sd.pxLen / totalPx) * totalFt })
      }
    }
  }

  // Distribute internal line footage
  const internalLinesByType: Record<string, { line: typeof aiGeometry.lines[0]; pxLen: number }[]> = {}
  if (aiGeometry.lines) {
    aiGeometry.lines.forEach(l => {
      if (l.type === 'EAVE' || l.type === 'RAKE') return
      if (!internalLinesByType[l.type]) internalLinesByType[l.type] = []
      const pxLen = Math.sqrt((l.end.x - l.start.x) ** 2 + (l.end.y - l.start.y) ** 2)
      internalLinesByType[l.type].push({ line: l, pxLen })
    })
  }
  const internalMeasured: Record<string, number> = {
    'RIDGE': edgeSummary.total_ridge_ft,
    'HIP': edgeSummary.total_hip_ft,
    'VALLEY': edgeSummary.total_valley_ft,
  }

  // ====================================================================
  // 3. BUILD THE SVG
  // ====================================================================
  let svg = ''

  // White background
  svg += `<rect x="0" y="0" width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#FFFFFF"/>`

  // Thin border
  svg += `<rect x="1" y="1" width="${SVG_SIZE - 2}" height="${SVG_SIZE - 2}" fill="none" stroke="#D5DAE3" stroke-width="0.5" rx="2"/>`

  // ====================================================================
  // 3a. DRAW FACET FILLS — very light blue
  // ====================================================================
  if (hasFacets) {
    aiGeometry.facets.forEach((facet) => {
      if (!facet.points || facet.points.length < 3) return
      const points = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      svg += `<polygon points="${points}" fill="#E8F2FC" stroke="#003366" stroke-width="1" stroke-linejoin="round"/>`
    })
  }

  // ====================================================================
  // 3b. DRAW PERIMETER — crisp dark lines, point-by-point
  // ====================================================================
  if (hasPerimeter) {
    const perim = aiGeometry.perimeter
    const n = perim.length

    // Perimeter outline
    const perimPoints = perim.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    svg += `<polygon points="${perimPoints}" fill="none" stroke="#1B2838" stroke-width="2" stroke-linejoin="round"/>`

    // Color-coded perimeter sides
    for (let i = 0; i < n; i++) {
      const p1 = perim[i], p2 = perim[(i + 1) % n]
      const type = p1.edge_to_next || 'EAVE'
      const color = edgeLineColors[type] || '#1B2838'
      const width = edgeLineWidths[type] || 1.8
      svg += `<line x1="${tx(p1.x).toFixed(1)}" y1="${ty(p1.y).toFixed(1)}" x2="${tx(p2.x).toFixed(1)}" y2="${ty(p2.y).toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`

      // Vertex dots
      svg += `<circle cx="${tx(p1.x).toFixed(1)}" cy="${ty(p1.y).toFixed(1)}" r="2.5" fill="${color}" stroke="#fff" stroke-width="0.8"/>`
    }
  }

  // ====================================================================
  // 3c. DRAW INTERNAL STRUCTURAL LINES (ridge, hip, valley)
  // ====================================================================
  if (aiGeometry.lines && aiGeometry.lines.length > 0) {
    aiGeometry.lines.forEach(line => {
      if (line.type === 'EAVE' || line.type === 'RAKE') return
      const color = edgeLineColors[line.type] || '#003366'
      const width = edgeLineWidths[line.type] || 1.5
      const dash = line.type === 'VALLEY' ? ' stroke-dasharray="6,3"' : ''
      svg += `<line x1="${tx(line.start.x).toFixed(1)}" y1="${ty(line.start.y).toFixed(1)}" x2="${tx(line.end.x).toFixed(1)}" y2="${ty(line.end.y).toFixed(1)}" stroke="${color}" stroke-width="${width}"${dash} stroke-linecap="round"/>`
    })
  }

  // ====================================================================
  // 4. MODE-SPECIFIC LABELS
  // ====================================================================
  if (mode === 'LENGTH') {
    // ---- LENGTH MODE: Label every perimeter + internal line with footage ----
    if (hasPerimeter) {
      const perim = aiGeometry.perimeter
      const n = perim.length
      for (let i = 0; i < n; i++) {
        if (perimSideFt[i] < 0.5) continue
        const p1 = perim[i], p2 = perim[(i + 1) % n]
        const mx = (tx(p1.x) + tx(p2.x)) / 2
        const my = (ty(p1.y) + ty(p2.y)) / 2
        const angle = lineAngleDeg(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y))
        const label = feetToFeetInches(perimSideFt[i])
        const type = p1.edge_to_next || 'EAVE'
        const color = edgeLineColors[type] || '#1B2838'

        const pillW = Math.max(label.length * 6.5 + 10, 40)
        svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
        svg += `<rect x="${(-pillW / 2).toFixed(1)}" y="-9" width="${pillW.toFixed(1)}" height="16" rx="2" fill="#fff" stroke="${color}" stroke-width="0.8"/>`
        svg += `<text x="0" y="3" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="Inter,system-ui,sans-serif">${label}</text>`
        svg += `</g>`
      }
    }

    // Internal line labels
    for (const [type, items] of Object.entries(internalLinesByType)) {
      const totalPx = items.reduce((s, it) => s + it.pxLen, 0)
      const totalFt = internalMeasured[type] || 0
      const color = edgeLineColors[type] || '#C62828'

      items.forEach(({ line: l, pxLen }) => {
        const lineFt = totalPx > 0 && totalFt > 0 ? (pxLen / totalPx) * totalFt : 0
        if (lineFt < 0.5) return
        const mx = (tx(l.start.x) + tx(l.end.x)) / 2
        const my = (ty(l.start.y) + ty(l.end.y)) / 2
        const angle = lineAngleDeg(tx(l.start.x), ty(l.start.y), tx(l.end.x), ty(l.end.y))
        const label = feetToFeetInches(lineFt)
        const pillW = Math.max(label.length * 6.5 + 10, 40)

        svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
        svg += `<rect x="${(-pillW / 2).toFixed(1)}" y="-9" width="${pillW.toFixed(1)}" height="16" rx="2" fill="#fff" stroke="${color}" stroke-width="0.8"/>`
        svg += `<text x="0" y="3" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="Inter,system-ui,sans-serif">${label}</text>`
        svg += `</g>`
      })
    }
  }

  else if (mode === 'AREA') {
    // ---- AREA MODE: True area (sq ft) at centroid of each facet ----
    if (hasFacets) {
      aiGeometry.facets.forEach((facet, i) => {
        if (!facet.points || facet.points.length < 3) return
        const cx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
        const cy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length

        // Get area from polygon computation or segment fallback
        let areaText: string
        if (facetData[i] && facetData[i].true_area_sqft > 0) {
          areaText = `${facetData[i].true_area_sqft.toLocaleString()}`
        } else {
          const seg = segments[i] || segments[segments.length - 1] || segments[0]
          areaText = seg ? `${seg.true_area_sqft.toLocaleString()}` : '—'
        }

        const pillW = Math.max(areaText.length * 7.5 + 14, 55)
        svg += `<rect x="${(cx - pillW / 2).toFixed(1)}" y="${(cy - 10).toFixed(1)}" width="${pillW.toFixed(1)}" height="20" rx="3" fill="#003366" fill-opacity="0.9"/>`
        svg += `<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${areaText} ft&sup2;</text>`
      })
    }
  }

  else if (mode === 'PITCH') {
    // ---- PITCH MODE: Pitch number + directional arrow at centroid ----
    if (hasFacets) {
      aiGeometry.facets.forEach((facet, i) => {
        if (!facet.points || facet.points.length < 3) return
        const cx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
        const cy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length

        const seg = segments[i] || segments[segments.length - 1] || segments[0]
        if (!seg) return

        // Extract pitch number (e.g., "5" from "5:12")
        const pitchNum = seg.pitch_ratio.split(':')[0] || seg.pitch_ratio.split('/')[0] || '?'
        const pitchDeg = seg.pitch_degrees

        // Determine if this is a "pitched" (>= 3/12) or flat facet
        const isFlat = pitchDeg < 14 // < 3:12
        const bgColor = isFlat ? '#EEEEEE' : '#D6E8F7'
        const textColor = isFlat ? '#666666' : '#003366'

        // Background circle with pitch number
        const r = 18
        svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${bgColor}" stroke="#003366" stroke-width="1"/>`
        svg += `<text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="900" fill="${textColor}" font-family="Inter,system-ui,sans-serif">${pitchNum}</text>`

        // Directional arrow below the circle
        const azDeg = seg.azimuth_degrees || 0
        const arrowLen = 14
        const arrowRad = (azDeg - 90) * Math.PI / 180 // SVG: 0=right, 90=down
        const ax = cx + Math.cos(arrowRad) * (r + 4)
        const ay = cy + Math.sin(arrowRad) * (r + 4)
        const aex = ax + Math.cos(arrowRad) * arrowLen
        const aey = ay + Math.sin(arrowRad) * arrowLen
        svg += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${aex.toFixed(1)}" y2="${aey.toFixed(1)}" stroke="${textColor}" stroke-width="1.5" marker-end="url(#arrowhead)"/>`
      })

      // Arrow marker definition
      svg = `<defs><marker id="arrowhead" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0,6 2.5,0 5" fill="#003366"/></marker></defs>` + svg
    }
  }

  // ====================================================================
  // 5. COMPASS ROSE (top-right)
  // ====================================================================
  const compassX = SVG_SIZE - 30, compassY = 30
  svg += `<circle cx="${compassX}" cy="${compassY}" r="14" fill="#fff" stroke="#003366" stroke-width="1"/>`
  svg += `<line x1="${compassX}" y1="${compassY + 10}" x2="${compassX}" y2="${compassY - 10}" stroke="#003366" stroke-width="1.5"/>`
  svg += `<line x1="${compassX - 10}" y1="${compassY}" x2="${compassX + 10}" y2="${compassY}" stroke="#003366" stroke-width="0.8"/>`
  svg += `<polygon points="${compassX},${compassY - 12} ${compassX - 3},${compassY - 6} ${compassX + 3},${compassY - 6}" fill="#C62828"/>`
  svg += `<text x="${compassX}" y="${compassY - 16}" text-anchor="middle" font-size="9" font-weight="800" fill="#003366" font-family="Inter,system-ui,sans-serif">N</text>`

  // ====================================================================
  // 6. SUMMARY BAR (bottom)
  // ====================================================================
  const totalArea = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalFootprint = segments.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
  const modeLabel = mode === 'LENGTH' ? 'LENGTH MEASUREMENT' : mode === 'AREA' ? 'AREA MEASUREMENT' : 'PITCH DIAGRAM'
  svg += `<rect x="0" y="${SVG_SIZE - 24}" width="${SVG_SIZE}" height="24" fill="#003366" rx="0"/>`
  svg += `<text x="10" y="${SVG_SIZE - 8}" font-size="8" font-weight="700" fill="#7EAFD4" font-family="Inter,system-ui,sans-serif">${modeLabel}</text>`
  svg += `<text x="${SVG_SIZE - 10}" y="${SVG_SIZE - 8}" text-anchor="end" font-size="8" font-weight="600" fill="#fff" font-family="Inter,system-ui,sans-serif">${totalArea.toLocaleString()} ft&sup2; &middot; ${segments.length} facets &middot; ${totalFootprint.toLocaleString()} ft&sup2; footprint</text>`

  return svg
}

// ============================================================
// FALLBACK BLUEPRINT: When no AI geometry, build proportional wireframe
// Uses segment areas + directions to create a geometrically-correct
// schematic roof shape (gable, hip, or complex)
// ============================================================
export function generateFallbackBlueprintSVG(
  segments: RoofSegment[],
  edges: EdgeMeasurement[],
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  mode: BlueprintMode
): string {
  const SVG_SIZE = 500
  const PAD = 50
  const n = segments.length

  if (n === 0) return `<rect x="0" y="0" width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#fff"/><text x="250" y="250" text-anchor="middle" fill="#999" font-size="14" font-family="Inter,system-ui,sans-serif">No segment data available</text>`

  const totalArea = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalFootprint = segments.reduce((s, seg) => s + seg.footprint_area_sqft, 0)

  // Derive building dimensions
  const ratio = 1.618
  const bw = Math.sqrt(totalFootprint / ratio)
  const bl = bw * ratio

  const drawW = SVG_SIZE - PAD * 2, drawH = SVG_SIZE - PAD * 2 - 30
  const sf = Math.min(drawW / bl, drawH / bw) * 0.85
  const w = Math.round(bl * sf), h = Math.round(bw * sf)
  const cx = SVG_SIZE / 2, cy = (SVG_SIZE - 24) / 2
  const left = cx - w / 2, top = cy - h / 2, right = cx + w / 2, bottom = cy + h / 2

  const avgPitch = segments.reduce((s, seg) => s + seg.pitch_degrees * seg.true_area_sqft, 0) / totalArea
  const ridgeInset = Math.round(w * Math.min(0.3, avgPitch / 90))

  let svg = ''
  svg += `<rect x="0" y="0" width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#FFFFFF"/>`
  svg += `<rect x="1" y="1" width="${SVG_SIZE - 2}" height="${SVG_SIZE - 2}" fill="none" stroke="#D5DAE3" stroke-width="0.5" rx="2"/>`

  interface FallbackFacet { points: { x: number; y: number }[]; seg: RoofSegment }
  const fallbackFacets: FallbackFacet[] = []

  if (n <= 2) {
    // Gable
    const ridgeY = cy
    fallbackFacets.push({ points: [{ x: left, y: ridgeY }, { x: cx, y: top }, { x: right, y: ridgeY }], seg: segments[0] })
    fallbackFacets.push({ points: [{ x: left, y: ridgeY }, { x: cx, y: bottom }, { x: right, y: ridgeY }], seg: segments[1] || segments[0] })
    // Ridge
    svg += `<line x1="${left}" y1="${ridgeY}" x2="${right}" y2="${ridgeY}" stroke="#C62828" stroke-width="2.5"/>`
  } else if (n <= 4) {
    // Hip
    const rl = left + ridgeInset, rr = right - ridgeInset
    fallbackFacets.push({ points: [{ x: left, y: top }, { x: right, y: top }, { x: rr, y: cy }, { x: rl, y: cy }], seg: segments[0] })
    fallbackFacets.push({ points: [{ x: left, y: bottom }, { x: right, y: bottom }, { x: rr, y: cy }, { x: rl, y: cy }], seg: segments[1] })
    fallbackFacets.push({ points: [{ x: left, y: top }, { x: left, y: bottom }, { x: rl, y: cy }], seg: segments[2] })
    fallbackFacets.push({ points: [{ x: right, y: top }, { x: right, y: bottom }, { x: rr, y: cy }], seg: segments[3] || segments[2] })
    svg += `<line x1="${rl}" y1="${cy}" x2="${rr}" y2="${cy}" stroke="#C62828" stroke-width="2.5"/>`
    svg += `<line x1="${left}" y1="${top}" x2="${rl}" y2="${cy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${right}" y1="${top}" x2="${rr}" y2="${cy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${left}" y1="${bottom}" x2="${rl}" y2="${cy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${right}" y1="${bottom}" x2="${rr}" y2="${cy}" stroke="#E8A317" stroke-width="2"/>`
  } else {
    // Complex: main body + wing
    const mainW = Math.round(w * 0.72), mainH = Math.round(h * 0.85)
    const ml = cx - mainW / 2 + 20, mt = cy - mainH / 2 - 10, mr = ml + mainW, mb = mt + mainH
    const mrl = ml + ridgeInset, mrr = mr - ridgeInset, mcy = (mt + mb) / 2

    fallbackFacets.push({ points: [{ x: ml, y: mt }, { x: mr, y: mt }, { x: mrr, y: mcy }, { x: mrl, y: mcy }], seg: segments[0] })
    fallbackFacets.push({ points: [{ x: ml, y: mb }, { x: mr, y: mb }, { x: mrr, y: mcy }, { x: mrl, y: mcy }], seg: segments[1] })
    fallbackFacets.push({ points: [{ x: ml, y: mt }, { x: ml, y: mb }, { x: mrl, y: mcy }], seg: segments[2] })
    fallbackFacets.push({ points: [{ x: mr, y: mt }, { x: mr, y: mb }, { x: mrr, y: mcy }], seg: segments[3] || segments[2] })

    svg += `<line x1="${mrl}" y1="${mcy}" x2="${mrr}" y2="${mcy}" stroke="#C62828" stroke-width="2.5"/>`
    svg += `<line x1="${ml}" y1="${mt}" x2="${mrl}" y2="${mcy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${mr}" y1="${mt}" x2="${mrr}" y2="${mcy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${ml}" y1="${mb}" x2="${mrl}" y2="${mcy}" stroke="#E8A317" stroke-width="2"/>`
    svg += `<line x1="${mr}" y1="${mb}" x2="${mrr}" y2="${mcy}" stroke="#E8A317" stroke-width="2"/>`

    // Wing
    if (segments.length > 4) {
      const ww = Math.round(w * 0.4), wh = Math.round(h * 0.45)
      const wl = ml - ww + 10, wt = mcy - 5, wr = wl + ww, wb = wt + wh
      const wcy = (wt + wb) / 2, wri = Math.round(ww * 0.25)
      fallbackFacets.push({ points: [{ x: wl, y: wt }, { x: wr, y: wt }, { x: wr - wri, y: wcy }, { x: wl + wri, y: wcy }], seg: segments[4] })
      if (segments[5]) fallbackFacets.push({ points: [{ x: wl, y: wb }, { x: wr, y: wb }, { x: wr - wri, y: wcy }, { x: wl + wri, y: wcy }], seg: segments[5] })
      svg += `<line x1="${wl + wri}" y1="${wcy}" x2="${wr - wri}" y2="${wcy}" stroke="#C62828" stroke-width="2"/>`
    }

    // Extra segments: overlay as sub-labels
    for (let i = Math.min(6, segments.length); i < segments.length; i++) {
      // These are small facets, we skip geometry but show in labels
    }
  }

  // Draw all facets
  fallbackFacets.forEach(f => {
    const points = f.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    svg += `<polygon points="${points}" fill="#E8F2FC" stroke="#003366" stroke-width="1.5" stroke-linejoin="round"/>`
  })

  // Mode-specific labels
  fallbackFacets.forEach((f, i) => {
    const pcx = f.points.reduce((s, p) => s + p.x, 0) / f.points.length
    const pcy = f.points.reduce((s, p) => s + p.y, 0) / f.points.length

    if (mode === 'AREA') {
      const areaText = `${f.seg.true_area_sqft.toLocaleString()}`
      const pw = Math.max(areaText.length * 7.5 + 14, 55)
      svg += `<rect x="${(pcx - pw / 2).toFixed(1)}" y="${(pcy - 10).toFixed(1)}" width="${pw.toFixed(1)}" height="20" rx="3" fill="#003366" fill-opacity="0.9"/>`
      svg += `<text x="${pcx.toFixed(1)}" y="${(pcy + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${areaText} ft&sup2;</text>`
    } else if (mode === 'PITCH') {
      const pitchNum = f.seg.pitch_ratio.split(':')[0] || '?'
      const isFlat = f.seg.pitch_degrees < 14
      svg += `<circle cx="${pcx.toFixed(1)}" cy="${pcy.toFixed(1)}" r="18" fill="${isFlat ? '#EEE' : '#D6E8F7'}" stroke="#003366" stroke-width="1"/>`
      svg += `<text x="${pcx.toFixed(1)}" y="${(pcy + 5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="900" fill="${isFlat ? '#666' : '#003366'}" font-family="Inter,system-ui,sans-serif">${pitchNum}</text>`
    } else {
      // LENGTH: label edge lengths on the perimeter lines
      for (let j = 0; j < f.points.length; j++) {
        const p1 = f.points[j], p2 = f.points[(j + 1) % f.points.length]
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
        if (dist < 30) continue
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
        const ftEst = Math.round(dist / sf)
        const label = `${ftEst}'`
        const angle = lineAngleDeg(p1.x, p1.y, p2.x, p2.y)
        svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
        svg += `<rect x="-18" y="-8" width="36" height="15" rx="2" fill="#fff" stroke="#003366" stroke-width="0.6"/>`
        svg += `<text x="0" y="3" text-anchor="middle" font-size="8" font-weight="700" fill="#003366" font-family="Inter,system-ui,sans-serif">${label}</text>`
        svg += `</g>`
      }
    }
  })

  // Compass
  const compX = SVG_SIZE - 30, compY = 30
  svg += `<circle cx="${compX}" cy="${compY}" r="14" fill="#fff" stroke="#003366" stroke-width="1"/>`
  svg += `<line x1="${compX}" y1="${compY + 10}" x2="${compX}" y2="${compY - 10}" stroke="#003366" stroke-width="1.5"/>`
  svg += `<polygon points="${compX},${compY - 12} ${compX - 3},${compY - 6} ${compX + 3},${compY - 6}" fill="#C62828"/>`
  svg += `<text x="${compX}" y="${compY - 16}" text-anchor="middle" font-size="9" font-weight="800" fill="#003366" font-family="Inter,system-ui,sans-serif">N</text>`

  // Summary bar
  const modeLabel = mode === 'LENGTH' ? 'LENGTH MEASUREMENT' : mode === 'AREA' ? 'AREA MEASUREMENT' : 'PITCH DIAGRAM'
  svg += `<rect x="0" y="${SVG_SIZE - 24}" width="${SVG_SIZE}" height="24" fill="#003366"/>`
  svg += `<text x="10" y="${SVG_SIZE - 8}" font-size="8" font-weight="700" fill="#7EAFD4" font-family="Inter,system-ui,sans-serif">${modeLabel}</text>`
  svg += `<text x="${SVG_SIZE - 10}" y="${SVG_SIZE - 8}" text-anchor="end" font-size="8" font-weight="600" fill="#fff" font-family="Inter,system-ui,sans-serif">${totalArea.toLocaleString()} ft&sup2; &middot; ${n} facets</text>`

  return svg
}

// ============================================================
// LEGACY WRAPPER — keeps backward compatibility for any code
// that still references generateSatelliteOverlaySVG
// Returns empty string since we no longer overlay on satellite
// ============================================================
export function generateSatelliteOverlaySVG(
  _aiGeometry: AIMeasurementAnalysis | null | undefined,
  _segments: RoofSegment[],
  _edges: EdgeMeasurement[],
  _edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  _colors: string[],
  _totalFootprintSqft: number = 0,
  _avgPitchDeg: number = 25
): string {
  // STUBBED — satellite overlay removed, use generatePreciseAIOverlaySVG instead
  return ''
}

export function generateOverlayLegend(
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  hasObstructions: boolean
): string {
  const items = [
    { color: '#C62828', label: 'Ridge', value: `${edgeSummary.total_ridge_ft} ft`, style: '' },
    { color: '#C62828', label: 'Hip', value: `${edgeSummary.total_hip_ft} ft`, style: '' },
    { color: '#1565C0', label: 'Valley', value: `${edgeSummary.total_valley_ft} ft`, style: 'stroke-dasharray="4,2"' },
    { color: '#1B2838', label: 'Eave', value: `${edgeSummary.total_eave_ft} ft`, style: '' },
    { color: '#E91E63', label: 'Rake', value: `${edgeSummary.total_rake_ft} ft`, style: '' },
    { color: '#FFD600', label: 'Perimeter', value: '', style: '' },
  ]

  let html = '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;padding:6px 10px;background:rgba(0,43,92,0.90);border-radius:4px;margin-top:6px">'
  items.forEach(item => {
    const val = parseInt(item.value) || 0
    if (val > 0 || item.label === 'Perimeter') {
      html += `<div style="display:flex;align-items:center;gap:4px">`
      if (item.label === 'Perimeter') {
        html += `<svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="${item.color}" stroke-width="3"/></svg>`
        html += `<span style="color:#FFD600;font-size:8px;font-weight:600">Perimeter</span>`
      } else {
        html += `<svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="${item.color}" stroke-width="2.5" ${item.style}/></svg>`
        html += `<span style="color:#fff;font-size:8px;font-weight:600">${item.label}: ${item.value}</span>`
      }
      html += `</div>`
    }
  })
  if (hasObstructions) {
    html += `<div style="display:flex;align-items:center;gap:4px">`
    html += `<svg width="12" height="12"><rect x="1" y="1" width="10" height="10" fill="none" stroke="#FFD600" stroke-width="1.5" stroke-dasharray="3,1" rx="1"/></svg>`
    html += `<span style="color:#FFD600;font-size:8px;font-weight:600">Obstruction</span>`
    html += `</div>`
  }
  html += '</div>'
  return html
}

// ============================================================
// Generate PITCH DIAGRAM SVG — uses actual AI geometry (perimeter + facets)
// Falls back to generic diagram if no AI geometry available
// ============================================================
export function generatePitchDiagramSVG(
  aiGeometry: AIMeasurementAnalysis | null | undefined,
  segments: RoofSegment[],
  colors: string[]
): string {
  if (segments.length === 0) return '<text x="250" y="175" text-anchor="middle" fill="#999" font-size="14">No segment data</text>'

  // If we have AI geometry with facets, use the REAL roof shape
  if (aiGeometry?.facets && aiGeometry.facets.length >= 2) {
    return generatePitchDiagramFromAI(aiGeometry, segments, colors)
  }

  // Fallback to generic proportional diagram
  return generateRoofDiagramSVG(segments, colors)
}

export function generatePitchDiagramFromAI(
  aiGeometry: AIMeasurementAnalysis,
  segments: RoofSegment[],
  colors: string[]
): string {
  const facets = aiGeometry.facets
  const perimeter = aiGeometry.perimeter || []

  // Find bounding box of all geometry (from facets + perimeter)
  let minX = 640, maxX = 0, minY = 640, maxY = 0
  const allPoints: { x: number; y: number }[] = []

  if (perimeter.length >= 3) {
    perimeter.forEach(p => { allPoints.push(p); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) })
  }
  facets.forEach(f => f.points?.forEach(p => { allPoints.push(p); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }))

  if (allPoints.length < 3) return '<text x="250" y="175" text-anchor="middle" fill="#999" font-size="14">Insufficient geometry data</text>'

  // Map 640x640 pixel coordinates to SVG viewBox (500x350) with padding
  const pad = 40
  const svgW = 500, svgH = 350
  const drawW = svgW - pad * 2
  const drawH = svgH - pad * 2 - 30 // leave room for bottom label
  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const scale = Math.min(drawW / geoW, drawH / geoH)
  const offsetX = pad + (drawW - geoW * scale) / 2
  const offsetY = pad + (drawH - geoH * scale) / 2

  function tx(x: number) { return offsetX + (x - minX) * scale }
  function ty(y: number) { return offsetY + (y - minY) * scale }

  let svg = ''

  // Pitch color function: blue if >= 3/12 (14°), grey if flat
  function pitchColor(pitchDeg: number, baseColor: string): string {
    if (pitchDeg >= 14) return baseColor  // >= 3/12 gets the assigned color
    return '#e0e0e0'  // flat/low pitch gets grey
  }

  // Match facets to segments by index (Gemini facets correspond to Solar API segments)
  facets.forEach((facet, i) => {
    if (!facet.points || facet.points.length < 3) return
    const seg = segments[i] || segments[segments.length - 1] // fallback to last if overflow

    const points = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    const fillColor = pitchColor(seg.pitch_degrees, colors[i % colors.length])

    // Facet fill
    svg += `<polygon points="${points}" fill="${fillColor}" fill-opacity="0.55" stroke="#002F6C" stroke-width="1.5"/>`

    // Label at centroid
    const cx = facet.points.reduce((s, p) => s + tx(p.x), 0) / facet.points.length
    const cy = facet.points.reduce((s, p) => s + ty(p.y), 0) / facet.points.length

    svg += `<text x="${cx.toFixed(1)}" y="${(cy - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#002F6C">${seg.true_area_sqft.toLocaleString()} sq ft</text>`
    svg += `<text x="${cx.toFixed(1)}" y="${(cy + 6).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#335C8A" font-weight="600">${seg.pitch_ratio} &middot; ${seg.azimuth_direction}</text>`
  })

  // Draw perimeter outline if available
  if (perimeter.length >= 3) {
    const perimPoints = perimeter.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    svg += `<polygon points="${perimPoints}" fill="none" stroke="#002F6C" stroke-width="2"/>`
  }

  // Draw internal lines (ridge, hip, valley) from AI geometry
  if (aiGeometry.lines && aiGeometry.lines.length > 0) {
    const lineColors: Record<string, string> = { 'RIDGE': '#E53935', 'HIP': '#F9A825', 'VALLEY': '#1565C0' }
    const lineWidths: Record<string, number> = { 'RIDGE': 3, 'HIP': 2, 'VALLEY': 2 }
    aiGeometry.lines.forEach(line => {
      if (line.type === 'EAVE' || line.type === 'RAKE') return // perimeter-only
      const color = lineColors[line.type] || '#002F6C'
      const width = lineWidths[line.type] || 1.5
      const dash = line.type === 'VALLEY' ? ' stroke-dasharray="6,3"' : ''
      svg += `<line x1="${tx(line.start.x).toFixed(1)}" y1="${ty(line.start.y).toFixed(1)}" x2="${tx(line.end.x).toFixed(1)}" y2="${ty(line.end.y).toFixed(1)}" stroke="${color}" stroke-width="${width}"${dash}/>`
    })
  }

  // Direction compass
  svg += `<text x="250" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#002F6C">N</text>`
  svg += `<polygon points="250,23 246,30 254,30" fill="#002F6C"/>`

  // Total area label at bottom
  const totalArea = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalFootprint = segments.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
  svg += `<text x="250" y="${svgH - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#003366">Total: ${totalArea.toLocaleString()} sq ft &middot; ${segments.length} facets &middot; Footprint: ${totalFootprint.toLocaleString()} sq ft</text>`

  return svg
}

// Generate SVG roof diagram from segments — proportional to actual measurements
export function generateRoofDiagramSVG(segments: RoofSegment[], colors: string[]): string {
  if (segments.length === 0) return '<text x="250" y="140" text-anchor="middle" fill="#999" font-size="14">No segment data</text>'
  
  const n = segments.length
  const cx = 250, cy = 130
  const totalArea = segments.reduce((s, seg) => s + seg.true_area_sqft, 0)
  const totalFootprint = segments.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
  
  // Derive building dimensions from actual footprint area
  // Use golden ratio (1.618:1) for a more realistic residential shape
  const ratio = 1.618
  const buildingWidthFt = Math.sqrt(totalFootprint / ratio)
  const buildingLengthFt = buildingWidthFt * ratio
  
  // Scale to fit SVG viewBox (500x280) with padding
  const maxW = 400, maxH = 200
  const scaleFactor = Math.min(maxW / buildingLengthFt, maxH / buildingWidthFt)
  const w = Math.round(buildingLengthFt * scaleFactor)
  const h = Math.round(buildingWidthFt * scaleFactor)
  const left = cx - w/2, top = cy - h/2, right = cx + w/2, bottom = cy + h/2
  const ridgeY = cy
  
  let svg = ''
  
  // Group segments by cardinal direction for intelligent placement
  const segsByDir: Record<string, RoofSegment[]> = { N: [], S: [], E: [], W: [], other: [] }
  segments.forEach(seg => {
    const dir = seg.azimuth_direction
    if (dir === 'N' || dir === 'NNE' || dir === 'NNW') segsByDir.N.push(seg)
    else if (dir === 'S' || dir === 'SSE' || dir === 'SSW') segsByDir.S.push(seg)
    else if (dir === 'E' || dir === 'ENE' || dir === 'ESE') segsByDir.E.push(seg)
    else if (dir === 'W' || dir === 'WNW' || dir === 'WSW') segsByDir.W.push(seg)
    else segsByDir.other.push(seg)
  })
  
  // Calculate area-weighted pitch for ridge offset
  const avgPitch = segments.reduce((s, seg) => s + seg.pitch_degrees * seg.true_area_sqft, 0) / totalArea
  // Ridge inset proportional to pitch (steeper pitch = narrower ridge)
  const ridgeInsetPct = Math.min(0.35, avgPitch / 90)
  const ridgeInset = Math.round(w * ridgeInsetPct)
  
  if (n <= 2) {
    // Simple gable: two facets with proportional sizing
    const s0 = segments[0], s1 = segments[1] || segments[0]
    const pct0 = s0.true_area_sqft / totalArea
    const pct1 = (s1.true_area_sqft) / totalArea
    // Ridge height based on dominant facet proportion
    const ridgeOffset = Math.round(h * (pct0 - 0.5) * 0.5) // slight asymmetry if facets differ
    const actualRidgeY = ridgeY + ridgeOffset
    
    svg += `<polygon points="${left},${actualRidgeY} ${cx},${top} ${right},${actualRidgeY}" fill="${colors[0]}80" stroke="#002F6C" stroke-width="1.5"/>`
    svg += `<polygon points="${left},${actualRidgeY} ${cx},${bottom} ${right},${actualRidgeY}" fill="${colors[1] || colors[0]}80" stroke="#002F6C" stroke-width="1.5"/>`
    svg += `<line x1="${left}" y1="${actualRidgeY}" x2="${right}" y2="${actualRidgeY}" stroke="#E53935" stroke-width="3"/>`
    // Labels with actual measurements
    svg += `<text x="${cx}" y="${actualRidgeY-30}" text-anchor="middle" font-size="10" font-weight="700" fill="#002F6C">${s0.true_area_sqft.toLocaleString()} sq ft</text>`
    svg += `<text x="${cx}" y="${actualRidgeY-18}" text-anchor="middle" font-size="9" fill="#335C8A">${s0.pitch_ratio} &middot; ${s0.azimuth_direction}</text>`
    svg += `<text x="${cx}" y="${actualRidgeY+38}" text-anchor="middle" font-size="10" font-weight="700" fill="#002F6C">${s1.true_area_sqft.toLocaleString()} sq ft</text>`
    svg += `<text x="${cx}" y="${actualRidgeY+50}" text-anchor="middle" font-size="9" fill="#335C8A">${s1.pitch_ratio} &middot; ${s1.azimuth_direction}</text>`
  } else if (n <= 4) {
    // Hip roof: 4 facets sized proportionally to their area
    const areaPcts = segments.map(s => s.true_area_sqft / totalArea)
    
    // Ridge line endpoints based on hip geometry
    const ridgeLeft = left + ridgeInset
    const ridgeRight = right - ridgeInset
    const ridgeTop = ridgeY - Math.round(h * 0.08)
    const ridgeBot = ridgeY + Math.round(h * 0.08)
    
    // 4 facets: North (top), South (bottom), East (right), West (left)
    const facetPts = [
      // North face (top trapezoid)
      `${left},${top} ${right},${top} ${ridgeRight},${ridgeTop} ${ridgeLeft},${ridgeTop}`,
      // South face (bottom trapezoid)
      `${left},${bottom} ${right},${bottom} ${ridgeRight},${ridgeBot} ${ridgeLeft},${ridgeBot}`,
      // West face (left triangle)
      `${left},${top} ${left},${bottom} ${ridgeLeft},${ridgeBot} ${ridgeLeft},${ridgeTop}`,
      // East face (right triangle)
      `${right},${top} ${right},${bottom} ${ridgeRight},${ridgeBot} ${ridgeRight},${ridgeTop}`
    ]
    const labelPos = [
      { x: cx, y: top + Math.round((ridgeTop - top) * 0.5) },          // N
      { x: cx, y: bottom - Math.round((bottom - ridgeBot) * 0.5) },     // S
      { x: left + Math.round(ridgeInset * 0.45), y: ridgeY },            // W
      { x: right - Math.round(ridgeInset * 0.45), y: ridgeY }            // E
    ]
    
    for (let i = 0; i < Math.min(n, 4); i++) {
      svg += `<polygon points="${facetPts[i]}" fill="${colors[i]}60" stroke="#002F6C" stroke-width="1.5"/>`
      const s = segments[i]
      svg += `<text x="${labelPos[i].x}" y="${labelPos[i].y - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="#002F6C">${s.true_area_sqft.toLocaleString()} sq ft</text>`
      svg += `<text x="${labelPos[i].x}" y="${labelPos[i].y + 6}" text-anchor="middle" font-size="8" fill="#335C8A">${s.pitch_ratio} &middot; ${s.azimuth_direction}</text>`
    }
    // Ridge line
    svg += `<line x1="${ridgeLeft}" y1="${ridgeY}" x2="${ridgeRight}" y2="${ridgeY}" stroke="#E53935" stroke-width="3"/>`
    // Hip lines from corners to ridge endpoints
    svg += `<line x1="${left}" y1="${top}" x2="${ridgeLeft}" y2="${ridgeTop}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${right}" y1="${top}" x2="${ridgeRight}" y2="${ridgeTop}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${left}" y1="${bottom}" x2="${ridgeLeft}" y2="${ridgeBot}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${right}" y1="${bottom}" x2="${ridgeRight}" y2="${ridgeBot}" stroke="#F9A825" stroke-width="2"/>`
  } else {
    // Complex roof: main body + wing extension
    // Split segments into main body (~60%) and wing (~40%) based on area
    const mainCount = Math.ceil(n * 0.6)
    const mainFacets = segments.slice(0, mainCount)
    const wingFacets = segments.slice(mainCount)
    
    const mainArea = mainFacets.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
    const wingArea = wingFacets.reduce((s, seg) => s + seg.footprint_area_sqft, 0)
    const mainPct = mainArea / totalFootprint
    const wingPct = wingArea / totalFootprint
    
    // Size main body and wing proportionally
    const mw = Math.round(w * 0.75)
    const mh = Math.round(h * Math.sqrt(mainPct) * 1.2)
    const ml = cx - mw/2, mt = cy - mh/2 - 5, mr = cx + mw/2, mb = cy + mh/2 - 5
    const mainRidgeY = (mt + mb) / 2
    const mainRidgeInset = Math.round(mw * ridgeInsetPct)
    
    // Wing dimensions proportional to wing area
    const ew = Math.round(w * Math.sqrt(wingPct) * 0.7)
    const eh = Math.round(h * Math.sqrt(wingPct) * 0.8)
    const el = ml - 8, et = cy - 5, er = el + ew, eb = et + eh
    
    // Main body facets
    svg += `<polygon points="${ml},${mt} ${mr},${mt} ${mr-mainRidgeInset},${mainRidgeY} ${ml+mainRidgeInset},${mainRidgeY}" fill="${colors[0]}60" stroke="#002F6C" stroke-width="1.5"/>`
    if (mainFacets[0]) {
      svg += `<text x="${cx}" y="${mt+Math.round(mh*0.2)}" text-anchor="middle" font-size="9" font-weight="700" fill="#002F6C">${mainFacets[0].true_area_sqft.toLocaleString()} sq ft</text>`
      svg += `<text x="${cx}" y="${mt+Math.round(mh*0.2)+12}" text-anchor="middle" font-size="8" fill="#335C8A">${mainFacets[0].pitch_ratio} &middot; ${mainFacets[0].azimuth_direction}</text>`
    }
    
    svg += `<polygon points="${ml},${mb} ${mr},${mb} ${mr-mainRidgeInset},${mainRidgeY} ${ml+mainRidgeInset},${mainRidgeY}" fill="${colors[1]}60" stroke="#002F6C" stroke-width="1.5"/>`
    if (mainFacets[1]) {
      svg += `<text x="${cx}" y="${mb-Math.round(mh*0.15)}" text-anchor="middle" font-size="9" font-weight="700" fill="#002F6C">${mainFacets[1].true_area_sqft.toLocaleString()} sq ft</text>`
      svg += `<text x="${cx}" y="${mb-Math.round(mh*0.15)+12}" text-anchor="middle" font-size="8" fill="#335C8A">${mainFacets[1].pitch_ratio} &middot; ${mainFacets[1].azimuth_direction}</text>`
    }
    
    // Main side facets
    svg += `<polygon points="${ml},${mt} ${ml},${mb} ${ml+mainRidgeInset},${mainRidgeY}" fill="${colors[2]}60" stroke="#002F6C" stroke-width="1.5"/>`
    svg += `<polygon points="${mr},${mt} ${mr},${mb} ${mr-mainRidgeInset},${mainRidgeY}" fill="${colors[3]}60" stroke="#002F6C" stroke-width="1.5"/>`
    
    // Main ridge
    svg += `<line x1="${ml+mainRidgeInset}" y1="${mainRidgeY}" x2="${mr-mainRidgeInset}" y2="${mainRidgeY}" stroke="#E53935" stroke-width="3"/>`
    
    // Wing
    if (wingFacets.length > 0) {
      const wingRidgeY = (et + eb) / 2
      svg += `<polygon points="${el},${et} ${er},${et} ${(el+er)/2},${wingRidgeY}" fill="${colors[4] || colors[0]}60" stroke="#002F6C" stroke-width="1.5"/>`
      svg += `<polygon points="${el},${eb} ${er},${eb} ${(el+er)/2},${wingRidgeY}" fill="${colors[5] || colors[1]}60" stroke="#002F6C" stroke-width="1.5"/>`
      if (wingFacets[0]) {
        svg += `<text x="${(el+er)/2}" y="${et+18}" text-anchor="middle" font-size="8" font-weight="700" fill="#002F6C">${wingFacets[0].true_area_sqft.toLocaleString()} sq ft</text>`
      }
      svg += `<line x1="${el}" y1="${wingRidgeY}" x2="${er}" y2="${wingRidgeY}" stroke="#E53935" stroke-width="2"/>`
      // Valley lines where wing meets main body
      svg += `<line x1="${er}" y1="${et}" x2="${ml+15}" y2="${mainRidgeY-15}" stroke="#1565C0" stroke-width="2" stroke-dasharray="4,2"/>`
      svg += `<line x1="${er}" y1="${eb}" x2="${ml+15}" y2="${mainRidgeY+15}" stroke="#1565C0" stroke-width="2" stroke-dasharray="4,2"/>`
    }
    
    // Hip lines
    svg += `<line x1="${ml}" y1="${mt}" x2="${ml+mainRidgeInset}" y2="${mainRidgeY}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${mr}" y1="${mt}" x2="${mr-mainRidgeInset}" y2="${mainRidgeY}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${ml}" y1="${mb}" x2="${ml+mainRidgeInset}" y2="${mainRidgeY}" stroke="#F9A825" stroke-width="2"/>`
    svg += `<line x1="${mr}" y1="${mb}" x2="${mr-mainRidgeInset}" y2="${mainRidgeY}" stroke="#F9A825" stroke-width="2"/>`
  }
  
  // Direction compass
  svg += `<text x="250" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="#002F6C">N</text>`
  svg += `<polygon points="250,18 246,25 254,25" fill="#002F6C"/>`
  
  // Total area label at bottom
  svg += `<text x="250" y="270" text-anchor="middle" font-size="9" font-weight="700" fill="#003366">Total: ${totalArea.toLocaleString()} sq ft &middot; ${segments.length} facets &middot; Footprint: ${totalFootprint.toLocaleString()} sq ft</text>`
  
  return svg
}


// ============================================================
// TRACE-BASED ROOF DIAGRAM — Professional EagleView-style
// Uses GPS eave coordinates + ridge/hip/valley lines to generate
// a clean architectural roof diagram with:
//   - Geometric roof facets with subtle shading
//   - Color-coded edge lines (ridge=red, hip=amber, valley=blue, eave=black)
//   - Clean dimension labels on each segment
//   - Facet identification letters (A, B, C, D...)
//   - Professional compass rose and legend
// ============================================================
export function generateTraceBasedDiagramSVG(
  roofTrace: {
    eaves?: { lat: number; lng: number }[]
    ridges?: { lat: number; lng: number }[][]
    hips?: { lat: number; lng: number }[][]
    valleys?: { lat: number; lng: number }[][]
  },
  edgeSummary: { total_ridge_ft: number; total_hip_ft: number; total_valley_ft: number; total_eave_ft: number; total_rake_ft: number },
  totalFootprintSqft: number,
  avgPitchDeg: number,
  predominantPitch: string,
  grossSquares: number,
  trueAreaSqft: number
): string {
  const W = 700, H = 700
  const PAD = 55
  const FOOTER_H = 56
  const LABEL_MARGIN = 45
  const FONT = `font-family="Inter,system-ui,-apple-system,sans-serif"`

  const eaves = roofTrace.eaves || []
  if (eaves.length < 3) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#999" font-size="14" ${FONT}>Insufficient eave points — trace at least 4 points</text>
    </svg>`
  }

  // Professional edge colors (EagleView standard)
  const EDGE_COLOR: Record<string, string> = {
    'RIDGE': '#C62828', 'HIP': '#C62828', 'VALLEY': '#1565C0',
    'EAVE': '#1a1a1a', 'RAKE': '#1a1a1a',
  }

  // Facet fill colors (subtle pastels for professional look)
  const FACET_FILLS = [
    'rgba(220,38,38,0.06)', 'rgba(37,99,235,0.06)', 'rgba(22,163,74,0.06)', 'rgba(234,88,12,0.06)',
    'rgba(124,58,237,0.06)', 'rgba(219,39,119,0.06)', 'rgba(13,148,136,0.06)', 'rgba(245,158,11,0.06)',
    'rgba(220,38,38,0.04)', 'rgba(37,99,235,0.04)', 'rgba(22,163,74,0.04)', 'rgba(234,88,12,0.04)',
  ]

  const fmtFt = (ft: number): string => ft < 0.5 ? '' : Math.round(ft).toString()
  const fmtFtUnit = (ft: number): string => ft < 0.5 ? '' : `${Math.round(ft)} ft`

  // ── Convert lat/lng to local X/Y (metres from centroid) ──
  const centLat = eaves.reduce((s, p) => s + p.lat, 0) / eaves.length
  const centLng = eaves.reduce((s, p) => s + p.lng, 0) / eaves.length
  const cosLat = Math.cos(centLat * Math.PI / 180)
  const M_PER_DEG_LAT = 111320
  const M_PER_DEG_LNG = 111320 * cosLat
  const M_TO_FT = 3.28084

  const toXY = (p: { lat: number; lng: number }) => ({
    x: (p.lng - centLng) * M_PER_DEG_LNG,
    y: -(p.lat - centLat) * M_PER_DEG_LAT
  })

  const eavesXY = eaves.map(toXY)

  // Collect ALL points for bounding box
  const allPts = [...eavesXY]
  const ridgesXY = (roofTrace.ridges || []).map(line => line.map(toXY))
  const hipsXY = (roofTrace.hips || []).map(line => line.map(toXY))
  const valleysXY = (roofTrace.valleys || []).map(line => line.map(toXY))
  ridgesXY.forEach(line => allPts.push(...line))
  hipsXY.forEach(line => allPts.push(...line))
  valleysXY.forEach(line => allPts.push(...line))

  // Bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  allPts.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  })

  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const totalSidePad = PAD + LABEL_MARGIN
  const TOP_RESERVE = totalSidePad
  const BOTTOM_RESERVE = totalSidePad + FOOTER_H
  const drawW = W - totalSidePad * 2
  const drawH = H - TOP_RESERVE - BOTTOM_RESERVE
  const rawScale = Math.min(drawW / geoW, drawH / geoH)
  const sc = rawScale * 0.88
  const oX = totalSidePad + (drawW - geoW * sc) / 2
  const oY = TOP_RESERVE + (drawH - geoH * sc) / 2

  const tx = (x: number) => oX + (x - minX) * sc
  const ty = (y: number) => oY + (y - minY) * sc

  // Haversine helper for edge lengths
  const haversineFt = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLng = (b.lng - a.lng) * Math.PI / 180
    const lat1 = a.lat * Math.PI / 180
    const lat2 = b.lat * Math.PI / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return 2 * 6371000 * Math.asin(Math.sqrt(h)) * M_TO_FT
  }

  // Helper: distance between two XY points in metres
  const distXY = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)

  // Helper: find nearest point on polygon edge to a given point
  const snapToPolygon = (pt: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let bestDist = Infinity, bestPt = pt
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const ab = { x: b.x - a.x, y: b.y - a.y }
      const abLen2 = ab.x * ab.x + ab.y * ab.y
      if (abLen2 < 0.001) continue
      let t = ((pt.x - a.x) * ab.x + (pt.y - a.y) * ab.y) / abLen2
      t = Math.max(0, Math.min(1, t))
      const closest = { x: a.x + t * ab.x, y: a.y + t * ab.y }
      const d = distXY(pt, closest)
      if (d < bestDist) { bestDist = d; bestPt = closest }
    }
    return bestPt
  }

  // ── COMPUTE FACETS from eave polygon + internal lines ──
  // Strategy: collect all internal line endpoints (ridges, hips, valleys),
  // snap them to eave polygon or other line endpoints, then build facet
  // polygons using the polygon subdivision approach.
  interface InternalLine { start: { x: number; y: number }; end: { x: number; y: number }; type: string; ftLen: number }
  const internalLines: InternalLine[] = []

  ridgesXY.forEach((line, i) => {
    if (line.length < 2) return
    const ridgePts = roofTrace.ridges![i]
    const ftLen = haversineFt(ridgePts[0], ridgePts[ridgePts.length - 1])
    internalLines.push({ start: line[0], end: line[line.length - 1], type: 'RIDGE', ftLen })
  })
  hipsXY.forEach((line, i) => {
    if (line.length < 2) return
    const hipPts = roofTrace.hips![i]
    const ftLen = haversineFt(hipPts[0], hipPts[hipPts.length - 1])
    internalLines.push({ start: line[0], end: line[line.length - 1], type: 'HIP', ftLen })
  })
  valleysXY.forEach((line, i) => {
    if (line.length < 2) return
    const valPts = roofTrace.valleys![i]
    const ftLen = haversineFt(valPts[0], valPts[valPts.length - 1])
    internalLines.push({ start: line[0], end: line[line.length - 1], type: 'VALLEY', ftLen })
  })

  // Build facets by polygon decomposition:
  // For each pair of adjacent eave edges that share a common internal vertex (ridge/hip endpoint),
  // create a triangular or quadrilateral facet
  const n = eaves.length

  // Collect all unique vertices: eave corners + internal line endpoints
  const allVertices: { x: number; y: number; label: string }[] = []
  eavesXY.forEach((p, i) => allVertices.push({ ...p, label: `E${i}` }))
  const internalVertices: { x: number; y: number }[] = []
  internalLines.forEach(l => {
    // Check if endpoints are near the polygon edge (eave connection) or interior
    const snapDist1 = Math.min(...eavesXY.map(e => distXY(e, l.start)))
    const snapDist2 = Math.min(...eavesXY.map(e => distXY(e, l.end)))
    // Interior points are those not snapped to eave corners
    const threshold = geoW * 0.08 // 8% of width as threshold
    if (snapDist1 > threshold) {
      const exists = internalVertices.some(v => distXY(v, l.start) < threshold * 0.5)
      if (!exists) internalVertices.push(l.start)
    }
    if (snapDist2 > threshold) {
      const exists = internalVertices.some(v => distXY(v, l.end) < threshold * 0.5)
      if (!exists) internalVertices.push(l.end)
    }
  })

  // Simple facet generation: if we have ridge(s), create facets by connecting
  // eave segments to ridge endpoints via hip lines. If no internal lines,
  // just show the whole polygon as one facet.
  interface Facet {
    points: { x: number; y: number }[]
    label: string
    areaSqft: number
    centerX: number
    centerY: number
  }
  const facets: Facet[] = []

  if (internalLines.length === 0) {
    // Single facet (flat roof or simple)
    const centerX = eavesXY.reduce((s, p) => s + p.x, 0) / n
    const centerY = eavesXY.reduce((s, p) => s + p.y, 0) / n
    facets.push({
      points: eavesXY,
      label: 'A',
      areaSqft: Math.round(trueAreaSqft),
      centerX, centerY
    })
  } else {
    // Multiple facets: Use internal lines (ridges/hips) to split the polygon
    // Strategy: For each internal line endpoint that's "interior" (a ridge peak),
    // connect it to nearby eave corners to form triangular/quad facets.
    //
    // Simplified approach: draw lines from ridge endpoints to nearest eave corners
    // and build facets from those subdivisions.

    // Gather all internal-line points
    const ridgeEndpoints: { x: number; y: number }[] = []
    internalLines.filter(l => l.type === 'RIDGE').forEach(l => {
      ridgeEndpoints.push(l.start, l.end)
    })

    // If ridges exist, build facets by connecting eave corners to ridge line
    if (ridgeEndpoints.length >= 2) {
      // Find the main ridge line (longest)
      const mainRidge = internalLines.filter(l => l.type === 'RIDGE').sort((a, b) => b.ftLen - a.ftLen)[0]
      if (mainRidge) {
        const rStart = mainRidge.start
        const rEnd = mainRidge.end

        // Determine which eave corners are "above" vs "below" the ridge line
        const ridgeDx = rEnd.x - rStart.x
        const ridgeDy = rEnd.y - rStart.y

        const aboveEaves: number[] = []
        const belowEaves: number[] = []
        eavesXY.forEach((p, i) => {
          const cross = ridgeDx * (p.y - rStart.y) - ridgeDy * (p.x - rStart.x)
          if (cross >= 0) aboveEaves.push(i)
          else belowEaves.push(i)
        })

        // Snap ridge endpoints to nearest eave corners
        const snapToEave = (pt: { x: number; y: number }) => {
          let bestIdx = 0, bestDist = Infinity
          eavesXY.forEach((e, i) => {
            const d = distXY(e, pt)
            if (d < bestDist) { bestDist = d; bestIdx = i }
          })
          return { idx: bestIdx, dist: bestDist }
        }

        const rStartSnap = snapToEave(rStart)
        const rEndSnap = snapToEave(rEnd)

        // Build two main facets (one each side of the ridge)
        const buildFacetFromSide = (sideIndices: number[], label: string): Facet | null => {
          if (sideIndices.length < 1) return null

          // Sort indices by their position around the polygon
          const sorted = [...sideIndices].sort((a, b) => a - b)

          // Build facet polygon: eave corners on this side + ridge endpoints
          const pts: { x: number; y: number }[] = []

          // Add the eave corners in order
          sorted.forEach(i => pts.push(eavesXY[i]))

          // Add the ridge endpoints (if not already at an eave corner)
          const ridgeEndPt1 = rStartSnap.dist < geoW * 0.15 ? eavesXY[rStartSnap.idx] : rStart
          const ridgeEndPt2 = rEndSnap.dist < geoW * 0.15 ? eavesXY[rEndSnap.idx] : rEnd

          // Check if ridge endpoints are already in pts
          const alreadyHas1 = pts.some(p => distXY(p, ridgeEndPt1) < geoW * 0.05)
          const alreadyHas2 = pts.some(p => distXY(p, ridgeEndPt2) < geoW * 0.05)

          if (!alreadyHas2) pts.push(ridgeEndPt2)
          if (!alreadyHas1) pts.push(ridgeEndPt1)

          if (pts.length < 3) return null

          // Sort by angle from centroid for proper polygon winding
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
          pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))

          // Compute area using Shoelace
          let area2 = 0
          for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length
            area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y
          }
          const areaM2 = Math.abs(area2) / 2
          const areaSqft = Math.round(areaM2 * 10.7639 * (1 / Math.cos(avgPitchDeg * Math.PI / 180)))

          return { points: pts, label, areaSqft, centerX: cx, centerY: cy }
        }

        const facetA = buildFacetFromSide(aboveEaves, 'A')
        const facetB = buildFacetFromSide(belowEaves, 'B')
        if (facetA) facets.push(facetA)
        if (facetB) facets.push(facetB)

        // If we have hip lines, try to further subdivide facets
        const hipLines = internalLines.filter(l => l.type === 'HIP')
        if (hipLines.length > 0 && facets.length >= 2) {
          // For each hip line, it typically splits a main facet into sub-facets
          // For now, add additional facets at hip-created sub-regions
          // This is a simplified approach — the facets already cover the whole polygon
          // The hip lines will be drawn on top for visual subdivision
        }
      }
    }

    // If no ridge found, try hip-only subdivision or fall back to single facet
    if (facets.length === 0) {
      const centerX = eavesXY.reduce((s, p) => s + p.x, 0) / n
      const centerY = eavesXY.reduce((s, p) => s + p.y, 0) / n
      facets.push({
        points: eavesXY,
        label: 'A',
        areaSqft: Math.round(trueAreaSqft),
        centerX, centerY
      })
    }

    // Normalize facet areas to match total
    const totalFacetArea = facets.reduce((s, f) => s + f.areaSqft, 0)
    if (totalFacetArea > 0 && Math.abs(totalFacetArea - trueAreaSqft) > 50) {
      const scale = trueAreaSqft / totalFacetArea
      facets.forEach(f => { f.areaSqft = Math.round(f.areaSqft * scale) })
    }

    // Re-letter facets
    facets.forEach((f, i) => { f.label = String.fromCharCode(65 + i) })
  }

  // ── BUILD SVG ──
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`
  svg += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`

  // Defs: subtle diagonal hatch for facets
  svg += `<defs>`
  svg += `<pattern id="tr-hatch-a" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#C62828" stroke-width="0.3" stroke-opacity="0.12"/></pattern>`
  svg += `<pattern id="tr-hatch-b" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#1565C0" stroke-width="0.3" stroke-opacity="0.12"/></pattern>`
  svg += `<pattern id="tr-hatch-c" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="8" stroke="#2E7D32" stroke-width="0.3" stroke-opacity="0.12"/></pattern>`
  svg += `<pattern id="tr-hatch-d" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-30)"><line x1="0" y1="0" x2="0" y2="8" stroke="#E65100" stroke-width="0.3" stroke-opacity="0.12"/></pattern>`
  svg += `</defs>`

  // ── FACET FILLS (subtle shading per facet) ──
  const hatchIds = ['tr-hatch-a', 'tr-hatch-b', 'tr-hatch-c', 'tr-hatch-d']
  facets.forEach((facet, fi) => {
    const pts = facet.points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    // Light fill + directional hatch
    svg += `<polygon points="${pts}" fill="${FACET_FILLS[fi % FACET_FILLS.length]}" stroke="none"/>`
    svg += `<polygon points="${pts}" fill="url(#${hatchIds[fi % hatchIds.length]})" stroke="none"/>`
  })

  // ── EAVE PERIMETER (clean black outline) ──
  const eavePts = eavesXY.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
  svg += `<polygon points="${eavePts}" fill="none" stroke="#1a1a1a" stroke-width="2.2" stroke-linejoin="miter"/>`

  // ── RIDGE LINES (red, solid, prominent) ──
  internalLines.filter(l => l.type === 'RIDGE').forEach(l => {
    svg += `<line x1="${tx(l.start.x).toFixed(1)}" y1="${ty(l.start.y).toFixed(1)}" x2="${tx(l.end.x).toFixed(1)}" y2="${ty(l.end.y).toFixed(1)}" stroke="${EDGE_COLOR['RIDGE']}" stroke-width="2.2" stroke-linecap="round"/>`
  })

  // ── HIP LINES (red, thinner) ──
  internalLines.filter(l => l.type === 'HIP').forEach(l => {
    svg += `<line x1="${tx(l.start.x).toFixed(1)}" y1="${ty(l.start.y).toFixed(1)}" x2="${tx(l.end.x).toFixed(1)}" y2="${ty(l.end.y).toFixed(1)}" stroke="${EDGE_COLOR['HIP']}" stroke-width="1.6" stroke-linecap="round"/>`
  })

  // ── VALLEY LINES (blue, dashed) ──
  internalLines.filter(l => l.type === 'VALLEY').forEach(l => {
    svg += `<line x1="${tx(l.start.x).toFixed(1)}" y1="${ty(l.start.y).toFixed(1)}" x2="${tx(l.end.x).toFixed(1)}" y2="${ty(l.end.y).toFixed(1)}" stroke="${EDGE_COLOR['VALLEY']}" stroke-width="1.6" stroke-dasharray="6,3" stroke-linecap="round"/>`
  })

  // ── EAVE EDGE DIMENSION LABELS (professional architectural style) ──
  for (let i = 0; i < n; i++) {
    const a = eaves[i], b = eaves[(i + 1) % n]
    const p1 = eavesXY[i], p2 = eavesXY[(i + 1) % n]
    const sx = tx(p1.x), sy = ty(p1.y), ex = tx(p2.x), ey = ty(p2.y)
    const segPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
    if (segPx < 20) continue

    const ftVal = haversineFt(a, b)
    if (ftVal < 0.5) continue
    const label = fmtFtUnit(ftVal)
    if (!label) continue

    const dx = ex - sx, dy = ey - sy
    const len = Math.sqrt(dx * dx + dy * dy)
    const nx = -dy / len, ny = dx / len

    // Dimension line offset from edge
    const dimOffset = 22
    const extEnd = dimOffset + 8

    // Extension lines
    svg += `<line x1="${(sx + nx * 4).toFixed(1)}" y1="${(sy + ny * 4).toFixed(1)}" x2="${(sx + nx * extEnd).toFixed(1)}" y2="${(sy + ny * extEnd).toFixed(1)}" stroke="#999" stroke-width="0.4"/>`
    svg += `<line x1="${(ex + nx * 4).toFixed(1)}" y1="${(ey + ny * 4).toFixed(1)}" x2="${(ex + nx * extEnd).toFixed(1)}" y2="${(ey + ny * extEnd).toFixed(1)}" stroke="#999" stroke-width="0.4"/>`

    // Dimension line with arrowheads
    const dsx = sx + nx * dimOffset, dsy = sy + ny * dimOffset
    const dex = ex + nx * dimOffset, dey = ey + ny * dimOffset
    svg += `<line x1="${dsx.toFixed(1)}" y1="${dsy.toFixed(1)}" x2="${dex.toFixed(1)}" y2="${dey.toFixed(1)}" stroke="#1a1a1a" stroke-width="0.6"/>`

    // Arrow heads at each end
    const arrowLen = 4.5
    const ux = dx / len, uy = dy / len
    svg += `<polygon points="${dsx.toFixed(1)},${dsy.toFixed(1)} ${(dsx + ux * arrowLen + nx * 1.8).toFixed(1)},${(dsy + uy * arrowLen + ny * 1.8).toFixed(1)} ${(dsx + ux * arrowLen - nx * 1.8).toFixed(1)},${(dsy + uy * arrowLen - ny * 1.8).toFixed(1)}" fill="#1a1a1a"/>`
    svg += `<polygon points="${dex.toFixed(1)},${dey.toFixed(1)} ${(dex - ux * arrowLen + nx * 1.8).toFixed(1)},${(dey - uy * arrowLen + ny * 1.8).toFixed(1)} ${(dex - ux * arrowLen - nx * 1.8).toFixed(1)},${(dey - uy * arrowLen - ny * 1.8).toFixed(1)}" fill="#1a1a1a"/>`

    // Measurement label with "ft" suffix
    const mx = (dsx + dex) / 2, my = (dsy + dey) / 2
    let angle = Math.atan2(dey - dsy, dex - dsx) * 180 / Math.PI
    if (angle > 90) angle -= 180
    if (angle < -90) angle += 180
    const bgW = Math.max(label.length * 5.5 + 10, 36)
    svg += `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${angle.toFixed(1)})">`
    svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-8" width="${bgW.toFixed(1)}" height="14" rx="2" fill="#fff" stroke="#ddd" stroke-width="0.3" opacity="0.97"/>`
    svg += `<text x="0" y="3" text-anchor="middle" font-size="8" font-weight="700" fill="#1a1a1a" ${FONT}>${label}</text>`
    svg += `</g>`
  }

  // ── INTERNAL LINE DIMENSION LABELS (Ridge/Hip/Valley with ft and color) ──
  internalLines.forEach(l => {
    if (l.ftLen < 1) return
    const sx = tx(l.start.x), sy = ty(l.start.y), ex = tx(l.end.x), ey = ty(l.end.y)
    const segPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
    if (segPx < 25) return

    const ftLabel = fmtFtUnit(l.ftLen)
    if (!ftLabel) return

    const mx = (sx + ex) / 2, my = (sy + ey) / 2
    const dx = ex - sx, dy = ey - sy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const perpDx = -dy / len, perpDy = dx / len

    // Offset label from the line
    const lx = mx + perpDx * 12, ly = my + perpDy * 12
    let ang = Math.atan2(dy, dx) * 180 / Math.PI
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180

    const clr = EDGE_COLOR[l.type] || '#333'
    const bgW = Math.max(ftLabel.length * 5.5 + 10, 36)
    svg += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${ang.toFixed(1)})">`
    svg += `<rect x="${(-bgW / 2).toFixed(1)}" y="-8" width="${bgW.toFixed(1)}" height="14" rx="2" fill="#fff" stroke="${clr}" stroke-width="0.4" opacity="0.97"/>`
    svg += `<text x="0" y="3" text-anchor="middle" font-size="8" font-weight="700" fill="${clr}" ${FONT}>${ftLabel}</text>`
    svg += `</g>`
  })

  // ── FACET LABELS (A, B, C... with area) ──
  facets.forEach((facet, fi) => {
    const cx = tx(facet.centerX), cy = ty(facet.centerY)
    // Facet letter (large)
    svg += `<text x="${cx.toFixed(1)}" y="${(cy - 2).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="800" fill="#C62828" fill-opacity="0.55" ${FONT}>${facet.label}</text>`
    // Facet area (small)
    svg += `<text x="${cx.toFixed(1)}" y="${(cy + 12).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="600" fill="#555" fill-opacity="0.7" ${FONT}>${facet.areaSqft.toLocaleString()} SF</text>`
  })

  // ── VERTEX DOTS (clean small circles at intersections) ──
  eavesXY.forEach(p => {
    svg += `<circle cx="${tx(p.x).toFixed(1)}" cy="${ty(p.y).toFixed(1)}" r="2.5" fill="#1a1a1a"/>`
  })
  // Interior vertices (ridge/hip endpoints)
  internalLines.forEach(l => {
    svg += `<circle cx="${tx(l.start.x).toFixed(1)}" cy="${ty(l.start.y).toFixed(1)}" r="2" fill="#C62828"/>`
    svg += `<circle cx="${tx(l.end.x).toFixed(1)}" cy="${ty(l.end.y).toFixed(1)}" r="2" fill="#C62828"/>`
  })

  // ── LEGEND (top-left, professional box with edge totals) ──
  const legendItems: { label: string; color: string; dash?: boolean; totalFt?: number }[] = [
    { label: 'Eave', color: '#1a1a1a', totalFt: Math.round(edgeSummary.total_eave_ft) },
  ]
  if (roofTrace.ridges?.length) legendItems.push({ label: 'Ridge', color: '#C62828', totalFt: Math.round(edgeSummary.total_ridge_ft) })
  if (roofTrace.hips?.length) legendItems.push({ label: 'Hip', color: '#C62828', totalFt: Math.round(edgeSummary.total_hip_ft) })
  if (roofTrace.valleys?.length) legendItems.push({ label: 'Valley', color: '#1565C0', dash: true, totalFt: Math.round(edgeSummary.total_valley_ft) })
  if (edgeSummary.total_rake_ft > 0) legendItems.push({ label: 'Rake', color: '#1565C0', totalFt: Math.round(edgeSummary.total_rake_ft) })

  const lgX = 8, lgY = 8
  const lgW = 120
  const lgH = legendItems.length * 14 + 12
  svg += `<rect x="${lgX}" y="${lgY}" width="${lgW}" height="${lgH}" rx="3" fill="#fff" fill-opacity="0.96" stroke="#ddd" stroke-width="0.5"/>`
  legendItems.forEach((item, i) => {
    const iy = lgY + 13 + i * 14
    const dashAttr = item.dash ? ' stroke-dasharray="4,2"' : ''
    svg += `<line x1="${lgX + 6}" y1="${iy}" x2="${lgX + 22}" y2="${iy}" stroke="${item.color}" stroke-width="2"${dashAttr} stroke-linecap="round"/>`
    svg += `<text x="${lgX + 26}" y="${iy + 3.5}" font-size="7.5" font-weight="600" fill="#333" ${FONT}>${item.label}</text>`
    if (item.totalFt) {
      svg += `<text x="${lgX + lgW - 6}" y="${iy + 3.5}" text-anchor="end" font-size="7" font-weight="700" fill="${item.color}" ${FONT}>${item.totalFt} ft</text>`
    }
  })

  // ── SOURCE BADGE ──
  svg += `<text x="${W / 2}" y="${H - FOOTER_H - 6}" text-anchor="middle" font-size="6.5" fill="#666" ${FONT} font-weight="500" letter-spacing="0.5">AI-GENERATED ROOF DIAGRAM \u2014 TRACED FROM GPS COORDINATES \u2014 All dimensions in feet. Pitch multiplier applied for true 3D area.</text>`

  // ── COMPASS ROSE (professional style) ──
  const cX = W - 38, cY = 34
  svg += `<g transform="translate(${cX},${cY})">`
  svg += `<circle cx="0" cy="0" r="16" fill="#fff" fill-opacity="0.9" stroke="#ccc" stroke-width="0.6"/>`
  svg += `<line x1="0" y1="12" x2="0" y2="-12" stroke="#bbb" stroke-width="0.6"/>`
  svg += `<line x1="-12" y1="0" x2="12" y2="0" stroke="#bbb" stroke-width="0.4"/>`
  svg += `<polygon points="0,-14 -3,-5 3,-5" fill="#C62828"/>`
  svg += `<polygon points="0,14 -3,5 3,5" fill="#bbb"/>`
  svg += `<text x="0" y="-18" text-anchor="middle" font-size="7.5" font-weight="800" fill="#333" ${FONT}>N</text>`
  svg += `<text x="0" y="24" text-anchor="middle" font-size="5.5" font-weight="600" fill="#999" ${FONT}>S</text>`
  svg += `<text x="20" y="2.5" text-anchor="middle" font-size="5.5" font-weight="600" fill="#999" ${FONT}>E</text>`
  svg += `<text x="-20" y="2.5" text-anchor="middle" font-size="5.5" font-weight="600" fill="#999" ${FONT}>W</text>`
  svg += `</g>`

  // ── FOOTER BAR ──
  // Single authoritative TOTAL ROOF AREA + waste calculations at 5%, 10%, 15%
  const fY = H - FOOTER_H
  const barW = W * 0.94, barX = (W - barW) / 2
  const cols = 6
  const colW = barW / cols
  svg += `<rect x="${barX.toFixed(1)}" y="${fY}" width="${barW.toFixed(1)}" height="${FOOTER_H}" rx="0" fill="#002244"/>`
  for (let c = 1; c < cols; c++) {
    svg += `<line x1="${(barX + colW * c).toFixed(1)}" y1="${fY + 8}" x2="${(barX + colW * c).toFixed(1)}" y2="${fY + FOOTER_H - 8}" stroke="#0a3a5e" stroke-width="1"/>`
  }
  const totalLinFt = Math.round(edgeSummary.total_ridge_ft + edgeSummary.total_hip_ft + edgeSummary.total_valley_ft + edgeSummary.total_eave_ft + edgeSummary.total_rake_ft)
  const waste5 = Math.round(trueAreaSqft * 1.05)
  const waste10 = Math.round(trueAreaSqft * 1.10)
  const waste15 = Math.round(trueAreaSqft * 1.15)
  const footerData = [
    { label: 'PITCH', value: predominantPitch || `${avgPitchDeg.toFixed(0)}\u00B0`, small: false },
    { label: 'TOTAL ROOF AREA', value: `${Math.round(trueAreaSqft).toLocaleString()} ft\u00B2`, small: true },
    { label: '+5% WASTE', value: `${waste5.toLocaleString()} ft\u00B2`, small: true },
    { label: '+10% WASTE', value: `${waste10.toLocaleString()} ft\u00B2`, small: true },
    { label: '+15% WASTE', value: `${waste15.toLocaleString()} ft\u00B2`, small: true },
    { label: 'LINEAR FT', value: `${totalLinFt}`, small: false },
  ]
  footerData.forEach((d, i) => {
    const cx = barX + colW * i + colW / 2
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 15}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${d.label === 'TOTAL ROOF AREA' ? '#fbbf24' : '#7eafd4'}" ${FONT} letter-spacing="1">${d.label}</text>`
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 38}" text-anchor="middle" font-size="${d.small ? '11' : '16'}" font-weight="800" fill="${d.label === 'TOTAL ROOF AREA' ? '#fbbf24' : '#fff'}" ${FONT}>${d.value}</text>`
  })

  svg += `</svg>`
  return svg
}


// ============================================================
// SQUARES GRID OVERLAY DIAGRAM
// Shows the roof outline with a grid of 10ft × 10ft squares
// (each square = 1 roofing square = 100 sqft) overlaid.
// ============================================================

export function generateSquaresGridDiagramSVG(
  roofTrace: {
    eaves?: { lat: number; lng: number }[]
    ridges?: { lat: number; lng: number }[][]
    hips?: { lat: number; lng: number }[][]
    valleys?: { lat: number; lng: number }[][]
  },
  totalTrueAreaSqft: number,
  totalFootprintSqft: number,
  grossSquares: number,
  predominantPitch: string,
  wastePct: number
): string {
  const W = 700, H = 600
  const PAD = 50
  const FOOTER_H = 50
  const FONT = `font-family="Inter,system-ui,-apple-system,sans-serif"`

  const eaves = roofTrace.eaves || []
  if (eaves.length < 3) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#999" font-size="14" ${FONT}>Insufficient data for squares grid</text>
    </svg>`
  }

  const centLat = eaves.reduce((s, p) => s + p.lat, 0) / eaves.length
  const centLng = eaves.reduce((s, p) => s + p.lng, 0) / eaves.length
  const cosLat = Math.cos(centLat * Math.PI / 180)
  const M_PER_DEG_LAT = 111320
  const M_PER_DEG_LNG = 111320 * cosLat
  const M_TO_FT = 3.28084
  const FT_TO_M = 1 / M_TO_FT

  const toXY = (p: { lat: number; lng: number }) => ({
    x: (p.lng - centLng) * M_PER_DEG_LNG,
    y: -(p.lat - centLat) * M_PER_DEG_LAT
  })

  const eavesXY = eaves.map(toXY)
  const allPts = [...eavesXY]
  const ridgesXY = (roofTrace.ridges || []).map(line => line.map(toXY))
  const hipsXY = (roofTrace.hips || []).map(line => line.map(toXY))
  ridgesXY.forEach(line => allPts.push(...line))
  hipsXY.forEach(line => allPts.push(...line))

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  allPts.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  })

  const geoW = maxX - minX || 1
  const geoH = maxY - minY || 1
  const drawW = W - PAD * 2
  const drawH = H - PAD - FOOTER_H - 36
  const sc = Math.min(drawW / geoW, drawH / geoH) * 0.80
  const oX = PAD + (drawW - geoW * sc) / 2
  const oY = 36 + (drawH - geoH * sc) / 2

  const tx = (x: number) => oX + (x - minX) * sc
  const ty = (y: number) => oY + (y - minY) * sc

  function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y
      const xj = poly[j].x, yj = poly[j].y
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  const gridSizeM = 10 * FT_TO_M
  let fullSquares = 0, partialSquares = 0
  const squareCells: { cx: number; cy: number; coverage: number }[] = []

  for (let gx = minX; gx < maxX; gx += gridSizeM) {
    for (let gy = minY; gy < maxY; gy += gridSizeM) {
      let hits = 0
      for (let sx = 0; sx < 3; sx++) {
        for (let sy = 0; sy < 3; sy++) {
          if (pointInPolygon(gx + gridSizeM * (sx + 0.5) / 3, gy + gridSizeM * (sy + 0.5) / 3, eavesXY)) hits++
        }
      }
      if (hits > 0) {
        const coverage = hits / 9
        if (coverage > 0.85) fullSquares++; else partialSquares++
        squareCells.push({ cx: gx + gridSizeM / 2, cy: gy + gridSizeM / 2, coverage })
      }
    }
  }

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`
  svg += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`

  const clipPts = eavesXY.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
  svg += `<defs><clipPath id="sq-clip"><polygon points="${clipPts}"/></clipPath></defs>`

  svg += `<g clip-path="url(#sq-clip)">`
  const sqSize = gridSizeM * sc
  let sqNum = 0
  squareCells.forEach(cell => {
    const x = tx(cell.cx - gridSizeM / 2), y = ty(cell.cy - gridSizeM / 2)
    const op = cell.coverage > 0.85 ? 0.32 : cell.coverage * 0.25
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sqSize.toFixed(1)}" height="${sqSize.toFixed(1)}" fill="#0d9668" fill-opacity="${op.toFixed(2)}" stroke="#0d9668" stroke-width="0.5" stroke-opacity="0.4"/>`
    if (cell.coverage > 0.5) {
      sqNum++
      if (sqSize > 12) {
        svg += `<text x="${tx(cell.cx).toFixed(1)}" y="${(ty(cell.cy) + 3).toFixed(1)}" text-anchor="middle" font-size="${Math.min(sqSize * 0.32, 8.5).toFixed(1)}" font-weight="600" fill="#0d9668" fill-opacity="0.65" ${FONT}>${sqNum}</text>`
      }
    }
  })
  svg += `</g>`

  svg += `<polygon points="${clipPts}" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>`
  ridgesXY.forEach(line => { if (line.length >= 2) svg += `<line x1="${tx(line[0].x).toFixed(1)}" y1="${ty(line[0].y).toFixed(1)}" x2="${tx(line[line.length-1].x).toFixed(1)}" y2="${ty(line[line.length-1].y).toFixed(1)}" stroke="#dc2626" stroke-width="2"/>` })
  hipsXY.forEach(line => { if (line.length >= 2) svg += `<line x1="${tx(line[0].x).toFixed(1)}" y1="${ty(line[0].y).toFixed(1)}" x2="${tx(line[line.length-1].x).toFixed(1)}" y2="${ty(line[line.length-1].y).toFixed(1)}" stroke="#d97706" stroke-width="1.5"/>` })
  eavesXY.forEach(p => svg += `<circle cx="${tx(p.x).toFixed(1)}" cy="${ty(p.y).toFixed(1)}" r="2.5" fill="#1a1a1a"/>`)

  svg += `<text x="${W / 2}" y="16" text-anchor="middle" font-size="11" font-weight="800" fill="#333" ${FONT}>ROOFING SQUARES GRID</text>`
  svg += `<text x="${W / 2}" y="29" text-anchor="middle" font-size="7.5" fill="#888" ${FONT}>Each cell = 1 roofing square (10\u2032 \u00D7 10\u2032 = 100 ft\u00B2) \u2014 Numbered squares show coverage</text>`

  svg += `<rect x="12" y="${H - FOOTER_H - 42}" width="112" height="34" rx="3" fill="#fff" stroke="#ddd" stroke-width="0.5" opacity="0.95"/>`
  svg += `<rect x="17" y="${H - FOOTER_H - 35}" width="9" height="9" fill="#0d9668" fill-opacity="0.32" stroke="#0d9668" stroke-width="0.5"/>`
  svg += `<text x="30" y="${H - FOOTER_H - 28}" font-size="7" fill="#333" ${FONT} font-weight="600">Full square (100 ft\u00B2)</text>`
  svg += `<rect x="17" y="${H - FOOTER_H - 22}" width="9" height="9" fill="#0d9668" fill-opacity="0.1" stroke="#0d9668" stroke-width="0.5"/>`
  svg += `<text x="30" y="${H - FOOTER_H - 15}" font-size="7" fill="#333" ${FONT} font-weight="600">Partial square</text>`

  const cX = W - 36, cY = 34
  svg += `<g transform="translate(${cX},${cY})"><circle cx="0" cy="0" r="13" fill="#fff" fill-opacity="0.85" stroke="#999" stroke-width="0.7"/><polygon points="0,-11 -3,-3 3,-3" fill="#C62828"/><polygon points="0,11 -3,3 3,3" fill="#999"/><text x="0" y="-15" text-anchor="middle" font-size="7" font-weight="800" fill="#333" ${FONT}>N</text></g>`

  const fY = H - FOOTER_H
  const barW = W * 0.94, barX2 = (W - barW) / 2, cols = 5, colW2 = barW / cols
  svg += `<rect x="${barX2.toFixed(1)}" y="${fY}" width="${barW.toFixed(1)}" height="${FOOTER_H}" fill="#002244"/>`
  for (let c2 = 1; c2 < cols; c2++) svg += `<line x1="${(barX2 + colW2 * c2).toFixed(1)}" y1="${fY + 6}" x2="${(barX2 + colW2 * c2).toFixed(1)}" y2="${fY + FOOTER_H - 6}" stroke="#0a3a5e" stroke-width="1"/>`

  const netSq = Math.round(totalTrueAreaSqft / 100 * 10) / 10
  const fd = [
    { l: 'FOOTPRINT', v: `${Math.round(totalFootprintSqft).toLocaleString()} ft\u00B2` },
    { l: 'SLOPED AREA', v: `${Math.round(totalTrueAreaSqft).toLocaleString()} ft\u00B2` },
    { l: 'NET SQUARES', v: `${netSq}` },
    { l: `+ ${wastePct}% WASTE`, v: `${grossSquares} SQ` },
    { l: 'GRID CELLS', v: `${fullSquares} + ${partialSquares}` },
  ]
  fd.forEach((d, i) => {
    const cx = barX2 + colW2 * i + colW2 / 2
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 13}" text-anchor="middle" font-size="6.5" font-weight="700" fill="#7eafd4" ${FONT} letter-spacing="1">${d.l}</text>`
    svg += `<text x="${cx.toFixed(1)}" y="${fY + 34}" text-anchor="middle" font-size="${i <= 1 ? '11' : '14'}" font-weight="800" fill="#fff" ${FONT}>${d.v}</text>`
  })

  svg += `</svg>`
  return svg
}
