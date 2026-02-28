// ============================================================
// RoofReporterAI - AI Measurement Engine (Vertex AI + Gemini)
// Server-side integration for roof geometry extraction
// ============================================================
// This runs on Cloudflare Workers — uses Web APIs only (no Node.js fs/path)
//
// DUAL MODE SUPPORT:
// 1. Gemini REST API: Uses GOOGLE_VERTEX_API_KEY (AIzaSy... format)
//    Endpoint: https://generativelanguage.googleapis.com/v1beta/models/...
// 2. Vertex AI Platform: Uses GOOGLE_CLOUD_ACCESS_TOKEN + project/location
//    Endpoint: https://{location}-aiplatform.googleapis.com/v1/publishers/google/models/...
//
// The system tries Vertex AI first (production), falls back to Gemini REST (development).
// ============================================================

import type { AIMeasurementAnalysis, AIReportData, PerimeterPoint } from '../types'
import { getAccessToken, getProjectId } from './gcp-auth'

// ============================================================
// API Endpoint Configuration
// ============================================================
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getVertexAIUrl(project: string, location: string, model: string, action: string): string {
  const loc = location === 'global' ? 'us-central1' : location
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:${action}`
}

// ============================================================
// Fetch satellite image and convert to base64
// ============================================================
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch satellite image: ${response.status} ${response.statusText}`)
  }
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  
  // Convert to base64 using Web API (Cloudflare Workers compatible)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ============================================================
// Generic Gemini API caller — dual mode (Vertex AI + REST)
// ============================================================
interface GeminiCallOptions {
  apiKey?: string          // For Gemini REST API
  accessToken?: string     // For Vertex AI Platform
  project?: string         // GCP project ID
  location?: string        // GCP region
  model?: string           // Model name (default: gemini-2.0-flash)
  contents: any[]          // Gemini contents array
  systemInstruction?: any  // System instruction
  generationConfig?: any   // Generation config
}

async function callGemini(opts: GeminiCallOptions): Promise<any> {
  const model = opts.model || 'gemini-2.0-flash'
  
  // Build request body
  const requestBody: any = {
    contents: opts.contents,
    generationConfig: opts.generationConfig || {}
  }
  if (opts.systemInstruction) {
    requestBody.systemInstruction = opts.systemInstruction
  }

  // Priority 1: Bearer token auth (from service account or static token)
  // Uses Generative Language API which works better with service accounts
  if (opts.accessToken) {
    const url = `${GEMINI_REST_BASE}/${model}:generateContent`
    console.log(`[Gemini] Calling Generative Language API with Bearer token: ${model}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (response.ok) {
      const data: any = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text
      throw new Error('Empty response from Gemini (Bearer auth)')
    }

    const errText = await response.text()
    console.warn(`[Gemini] Bearer auth failed (${response.status}): ${errText.substring(0, 200)}`)
    
    // If Bearer fails, try Vertex AI Platform endpoint as fallback
    if (opts.project && opts.location) {
      try {
        const vertexUrl = getVertexAIUrl(opts.project, opts.location, model, 'generateContent')
        console.log(`[Gemini] Trying Vertex AI Platform fallback: ${model} via ${opts.location}`)
        
        const vertexResponse = await fetch(vertexUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${opts.accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': opts.project
          },
          body: JSON.stringify(requestBody)
        })

        if (vertexResponse.ok) {
          const data: any = await vertexResponse.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return text
        }
        console.warn(`[Gemini] Vertex AI Platform also failed (${vertexResponse.status})`)
      } catch (e: any) {
        console.warn(`[Gemini] Vertex AI Platform error: ${e.message}`)
      }
    }
  }

  // Priority 2: API key auth
  if (opts.apiKey) {
    const url = `${GEMINI_REST_BASE}/${model}:generateContent?key=${opts.apiKey}`
    console.log(`[Gemini] Calling REST API with API key: ${model}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errText}`)
    }

    const data: any = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty response from Gemini')
    return text
  }

  throw new Error('No Gemini API credentials available (need service account key, access token, or API key)')
}

// ============================================================
// AI Roof Geometry Analysis — Gemini Vision
// Enhanced prompt for precise roof perimeter tracing
// Analyzes satellite imagery to extract:
// - Perimeter polygon (outer boundary of the TARGET roof)
// - Internal lines (ridges, hips, valleys)
// - Obstructions (chimneys, vents, skylights)
// ============================================================
export async function analyzeRoofGeometry(
  satelliteImageUrl: string,
  env: {
    apiKey?: string
    accessToken?: string
    project?: string
    location?: string
    serviceAccountKey?: string
  }
): Promise<AIMeasurementAnalysis | null> {
  // Auto-generate access token from service account key if available
  if (!env.accessToken && env.serviceAccountKey) {
    try {
      env.accessToken = await getAccessToken(env.serviceAccountKey)
      if (!env.project) env.project = getProjectId(env.serviceAccountKey) || undefined
      if (!env.location) env.location = 'us-central1'
      console.log('[Gemini] Auto-generated access token from service account key')
    } catch (e: any) {
      console.warn('[Gemini] Service account token generation failed:', e.message)
    }
  }

  if (!env.apiKey && !env.accessToken) {
    console.warn('[Gemini] No credentials — skipping geometry analysis')
    return null
  }

  const base64Image = await fetchImageAsBase64(satelliteImageUrl)

  // =============================================================================
  // ENHANCED GEMINI PROMPT v3 — Precise roof perimeter tracing
  // 
  // Key improvements over v2:
  // 1. Focus instruction: "the building whose roof is dead-center in the image"
  // 2. Pixel coordinates 0–640 (matches the 640x640 satellite image exactly)
  // 3. Perimeter polygon requested FIRST — the primary deliverable
  // 4. Each perimeter edge is labelled (EAVE / RAKE / HIP / RIDGE)
  // 5. Explicit guidance: trace every jog, bump, wing, and garage — not a rectangle
  // 6. Internal structural lines are secondary (ridge, hip, valley)
  // =============================================================================
  const systemPrompt = `You are a precision roof measurement AI used by professional roofing contractors.
Your ONLY task is to trace the EXACT roof outline of the one building whose roof is DEAD CENTER in this 640×640 pixel overhead satellite image.

==== COORDINATE SYSTEM ====
• The image is exactly 640 × 640 pixels.
• (0, 0) is the TOP-LEFT corner; (640, 640) is the BOTTOM-RIGHT corner.
• All coordinates you return MUST be integers in the range 0–640.

==== STEP 1 — OUTER PERIMETER (most important) ====
Trace the COMPLETE outer boundary of the center building's roof.
• Walk around the roof outline CLOCKWISE, starting from the top-left-most corner.
• Place a vertex at EVERY corner, jog, bump, offset, wing junction, or direction change.
  – Typical Alberta house: L-shape, T-shape, or rectangular + attached garage. The perimeter
    must follow the ENTIRE structure including every bump-out, garage wing, front porch overhang.
• Do NOT simplify to a rectangle. If the roof has 10 corners, return 10 points.
• For each vertex, label "edge_to_next" — the type of the edge FROM this point TO the next:
  – EAVE: a lower roof edge (horizontal-ish, where gutters go, typically the longest edges along the base of the roof plane)
  – RAKE: a sloped gable edge that follows the roof pitch upward to the peak (diagonal, found on gable ends)
  – HIP: a diagonal edge where two sloped planes meet (runs from ridge end down to a corner, NOT along the gutter line)
  – RIDGE: a peak line along the very top where two slopes meet (only if part of the outer perimeter, which is rare)

==== STEP 2 — INTERNAL STRUCTURAL LINES ====
Identify the major internal lines visible on the roof:
• RIDGE: the topmost horizontal peak line where two slope planes meet.
• HIP: lines running diagonally from the end of a ridge down to a perimeter corner.
• VALLEY: inward-angled lines where two roof planes slope toward each other (often at wing junctions).

==== STEP 3 — ROOF FACETS ====
Each roof plane/face visible from above is a facet.
• Outline each facet as a polygon (its corners in pixel coords).
• Estimate pitch as rise/run (e.g. "6/12") and compass azimuth in degrees.

==== STEP 4 — OBSTRUCTIONS ====
Mark visible obstructions: CHIMNEY, VENT, SKYLIGHT, HVAC (bounding box in pixels).

==== CRITICAL RULES ====
1. ONLY the CENTER building's roof. Ignore all neighbors, trees, driveways, fences.
2. The perimeter must be TIGHT to the actual visible roof edge — not offset outward into the yard.
3. If the building has an attached garage, covered porch, or bump-out, the perimeter INCLUDES those.
4. Use INTEGERS for coordinates (no decimals).
5. The perimeter array must form a CLOSED polygon (last point connects back to first).

==== REQUIRED JSON OUTPUT ====
{
  "perimeter": [
    {"x": <int 0-640>, "y": <int 0-640>, "edge_to_next": "EAVE"|"RAKE"|"HIP"|"RIDGE"}
  ],
  "facets": [
    {"id": "f1", "points": [{"x": <int>, "y": <int>}, ...], "pitch": "6/12", "azimuth": "180"}
  ],
  "lines": [
    {"type": "RIDGE"|"HIP"|"VALLEY", "start": {"x": <int>, "y": <int>}, "end": {"x": <int>, "y": <int>}}
  ],
  "obstructions": [
    {"type": "CHIMNEY"|"VENT"|"SKYLIGHT"|"HVAC", "boundingBox": {"min": {"x": <int>, "y": <int>}, "max": {"x": <int>, "y": <int>}}}
  ]
}`

  const userPrompt = `Analyze this 640×640 pixel overhead satellite image. The building in the DEAD CENTER of the image is the target. Trace its COMPLETE roof perimeter (every corner, wing, bump-out, garage) as a tight polygon in pixel coordinates. Then identify internal roof lines (ridges, hips, valleys), facets, and obstructions. Return ONLY the JSON.`

  const text = await callGemini({
    apiKey: env.apiKey,
    accessToken: env.accessToken,
    project: env.project,
    location: env.location,
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Image
          }
        },
        { text: userPrompt }
      ]
    }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  })

  console.log(`[Gemini] Raw response (first 800 chars): ${text.substring(0, 800)}`)
  const raw = JSON.parse(text) as any

  // Normalize: Gemini may return coordinates in 0-1000 if it ignores our instruction.
  // Detect and rescale to 0-640 if needed.
  const needsRescale = detectCoordScale(raw)
  if (needsRescale) {
    console.log('[Gemini] Detected 0-1000 coordinate scale — rescaling to 0-640')
    rescaleAnalysis(raw, 640 / 1000)
  }

  const analysis = raw as AIMeasurementAnalysis

  // Validate and ensure perimeter exists
  if (!analysis.perimeter) analysis.perimeter = []
  if (!analysis.facets) analysis.facets = []
  if (!analysis.lines) analysis.lines = []
  if (!analysis.obstructions) analysis.obstructions = []

  // If Gemini returned facets but no perimeter, derive perimeter from facet edges
  if (analysis.perimeter.length === 0 && analysis.facets.length > 0) {
    analysis.perimeter = derivePerimeterFromFacets(analysis.facets)
    console.log(`[Gemini] Derived perimeter (${analysis.perimeter.length} points) from ${analysis.facets.length} facets`)
  }

  // Clamp all coordinates to 0-640
  clampCoordinates(analysis)

  console.log(`[Gemini] Final: ${analysis.perimeter.length} perimeter pts, ${analysis.facets.length} facets, ${analysis.lines.length} lines, ${analysis.obstructions.length} obstructions`)

  return analysis
}

// ============================================================
// AI Roofing Assessment Report — Gemini Text
// Enhanced prompt for Canadian market (Alberta)
// ============================================================
export async function generateAIRoofingReport(
  solarData: {
    totalAreaSqm: number
    maxSunshineHours: number
    segmentCount: number
    segments: Array<{ pitchDegrees: number, azimuthDegrees: number, areaSqm: number }>
  },
  env: {
    apiKey?: string
    accessToken?: string
    project?: string
    location?: string
    serviceAccountKey?: string
  }
): Promise<AIReportData | null> {
  // Auto-generate access token from service account key if available
  if (!env.accessToken && env.serviceAccountKey) {
    try {
      env.accessToken = await getAccessToken(env.serviceAccountKey)
      if (!env.project) env.project = getProjectId(env.serviceAccountKey) || undefined
      if (!env.location) env.location = 'us-central1'
    } catch (e: any) {
      console.warn('[Gemini] Service account token generation failed:', e.message)
    }
  }

  if (!env.apiKey && !env.accessToken) {
    console.warn('[Gemini] No credentials — skipping AI report')
    return null
  }

  const prompt = `Act as a professional roofing engineer and estimator for the Canadian market (Alberta).
Analyze the following roof data derived from Google Solar API:

Total Roof Area: ${solarData.totalAreaSqm.toFixed(2)} sq meters (${Math.round(solarData.totalAreaSqm * 10.7639)} sq ft)
Max Sun Hours/Year: ${solarData.maxSunshineHours}
Number of Segments: ${solarData.segmentCount}

Segment Details:
${solarData.segments.map((s, i) =>
  `- Segment ${i+1}: Pitch ${s.pitchDegrees.toFixed(1)}°, Azimuth ${s.azimuthDegrees.toFixed(1)}°, Area ${s.areaSqm.toFixed(1)}m²`
).join('\n')}

Provide a JSON response with EXACTLY these fields:
1. "summary": A professional assessment paragraph (max 80 words) about the roof condition, complexity, and recommendations. Reference Canadian building codes where relevant.
2. "materialSuggestion": Recommended roofing materials based on pitch, climate (Alberta), and solar potential. Be specific about product types.
3. "difficultyScore": An integer from 1-10 (10 being hardest) based on complexity, pitch steepness, number of cuts, and valley/hip work.
4. "estimatedCostRange": A rough estimate string in CAD (e.g. "$15,000 - $22,000 CAD") including labour and materials for Alberta market rates.`

  const text = await callGemini({
    apiKey: env.apiKey,
    accessToken: env.accessToken,
    project: env.project,
    location: env.location,
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3
    }
  })

  const parsed = JSON.parse(text)
  // Gemini sometimes returns an array with a single object — unwrap it
  const report = Array.isArray(parsed) ? parsed[0] : parsed
  return report as AIReportData
}

// ============================================================
// Quick Measure — Standalone Gemini Vision call for /api/measure
// Takes lat/lng, fetches satellite image, returns geometry analysis.
// This is the direct port of the Vertex Engine's /api/measure endpoint.
// ============================================================
export async function quickMeasure(
  lat: number,
  lng: number,
  env: {
    apiKey?: string
    accessToken?: string
    project?: string
    location?: string
    mapsKey?: string
    serviceAccountKey?: string
  }
): Promise<{ analysis: AIMeasurementAnalysis; satelliteUrl: string }> {
  const mapsKey = env.mapsKey || env.apiKey
  if (!mapsKey) throw new Error('No Maps API key available')

  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&key=${mapsKey}`

  const analysis = await analyzeRoofGeometry(satelliteUrl, env)
  if (!analysis) throw new Error('AI analysis returned empty result')

  return { analysis, satelliteUrl }
}

// ============================================================
// HELPER: Detect if Gemini returned 0-1000 coords instead of 0-640
// ============================================================
function detectCoordScale(raw: any): boolean {
  const pts: number[] = []
  if (raw.perimeter) {
    for (const p of raw.perimeter) {
      pts.push(p.x, p.y)
    }
  }
  if (raw.facets) {
    for (const f of raw.facets) {
      if (f.points) {
        for (const p of f.points) {
          pts.push(p.x, p.y)
        }
      }
    }
  }
  if (raw.lines) {
    for (const l of raw.lines) {
      pts.push(l.start.x, l.start.y, l.end.x, l.end.y)
    }
  }
  if (pts.length === 0) return false
  const maxCoord = Math.max(...pts)
  // If any coordinate exceeds 700, Gemini likely used 0-1000 scale
  return maxCoord > 700
}

// ============================================================
// HELPER: Rescale all coordinates by a factor
// ============================================================
function rescaleAnalysis(raw: any, factor: number): void {
  const scale = (p: any) => { p.x = Math.round(p.x * factor); p.y = Math.round(p.y * factor) }
  if (raw.perimeter) raw.perimeter.forEach(scale)
  if (raw.facets) raw.facets.forEach((f: any) => { if (f.points) f.points.forEach(scale) })
  if (raw.lines) raw.lines.forEach((l: any) => { scale(l.start); scale(l.end) })
  if (raw.obstructions) raw.obstructions.forEach((o: any) => { scale(o.boundingBox.min); scale(o.boundingBox.max) })
}

// ============================================================
// HELPER: Clamp all coordinates to 0-640
// ============================================================
function clampCoordinates(analysis: AIMeasurementAnalysis): void {
  const clamp = (v: number) => Math.max(0, Math.min(640, Math.round(v)))
  const clampPt = (p: any) => { p.x = clamp(p.x); p.y = clamp(p.y) }
  if (analysis.perimeter) analysis.perimeter.forEach(clampPt)
  if (analysis.facets) analysis.facets.forEach(f => { if (f.points) f.points.forEach(clampPt) })
  if (analysis.lines) analysis.lines.forEach(l => { clampPt(l.start); clampPt(l.end) })
  if (analysis.obstructions) analysis.obstructions.forEach(o => { clampPt(o.boundingBox.min); clampPt(o.boundingBox.max) })
}

// ============================================================
// HELPER: Derive perimeter from facets when Gemini doesn't return one
// Uses outer-edge detection: edges that belong to only ONE facet
// ============================================================
function derivePerimeterFromFacets(facets: AIMeasurementAnalysis['facets']): PerimeterPoint[] {
  // Build edge map
  const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y)
    const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y)
    return `${minX},${minY}-${maxX},${maxY}`
  }

  const edgeMap: Record<string, { start: { x: number; y: number }; end: { x: number; y: number }; count: number }> = {}

  for (const facet of facets) {
    if (!facet.points || facet.points.length < 3) continue
    for (let j = 0; j < facet.points.length; j++) {
      const a = facet.points[j]
      const b = facet.points[(j + 1) % facet.points.length]
      const key = edgeKey(a, b)
      if (!edgeMap[key]) {
        edgeMap[key] = { start: { ...a }, end: { ...b }, count: 0 }
      }
      edgeMap[key].count++
    }
  }

  // Outer edges = count === 1
  const outerEdges = Object.values(edgeMap).filter(e => e.count === 1)
  if (outerEdges.length === 0) return []

  // Chain outer edges into a polygon
  const chain: PerimeterPoint[] = []
  const used = new Set<number>()
  
  // Start with first edge
  let current = outerEdges[0]
  chain.push({
    x: Math.round(current.start.x),
    y: Math.round(current.start.y),
    edge_to_next: classifyEdge(current.start, current.end)
  })
  used.add(0)

  for (let iter = 0; iter < outerEdges.length; iter++) {
    const lastPt = chain.length > 0 ? { x: chain[chain.length - 1].x, y: chain[chain.length - 1].y } : current.start
    const target = pointsClose(lastPt, current.start) ? current.end : current.start
    
    // Find next edge that connects to target
    let found = false
    for (let i = 0; i < outerEdges.length; i++) {
      if (used.has(i)) continue
      const e = outerEdges[i]
      if (pointsClose(target, e.start) || pointsClose(target, e.end)) {
        chain.push({
          x: Math.round(target.x),
          y: Math.round(target.y),
          edge_to_next: classifyEdge(target, pointsClose(target, e.start) ? e.end : e.start)
        })
        current = e
        used.add(i)
        found = true
        break
      }
    }
    if (!found) break
  }

  return chain
}

function pointsClose(a: { x: number; y: number }, b: { x: number; y: number }, threshold = 8): boolean {
  return Math.abs(a.x - b.x) <= threshold && Math.abs(a.y - b.y) <= threshold
}

function classifyEdge(a: { x: number; y: number }, b: { x: number; y: number }): 'EAVE' | 'RAKE' | 'HIP' | 'RIDGE' {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  // Mostly horizontal = EAVE, mostly vertical = RAKE, diagonal = HIP
  if (dx > dy * 2) return 'EAVE'
  if (dy > dx * 2) return 'RAKE'
  return 'HIP'
}
