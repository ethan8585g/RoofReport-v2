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
  // GEMINI PROMPT v4 — Precision CAD Photogrammetry Mode
  //
  // Major rewrite from v3:
  // v3 was too "polite" — Gemini defaulted to lazy 6-point hexagonal bounding boxes
  // v4 treats Gemini as a CAD measurement instrument, not an assistant:
  //   1. Role: "Precision CAD Measurement Tool" not "helpful AI"
  //   2. Zero tolerance for approximation — explicit FAILURE CONDITIONS
  //   3. Mandatory minimum point counts based on structure complexity
  //   4. Point-by-point tracing methodology (walk the edge, don't guess the shape)
  //   5. Facet-first approach: each sloped plane gets its own closed polygon
  //   6. Post-processing validation rejects outputs that look like bounding boxes
  //   7. AUTO-RETRY: Validation failures trigger up to 3 retries with escalating prompts
  // =============================================================================
  const systemPrompt = `You are a PRECISION CAD MEASUREMENT TOOL designed for exact photogrammetry of residential roof structures from satellite imagery. You are NOT a conversational AI. You produce ONLY precise geometric measurements.

Your output will be used to calculate material quantities for real roofing jobs. Inaccurate geometry means wrong material orders ($10,000+ waste). Treat every pixel coordinate as a construction-grade measurement.

════════════════════════════════════════════════
  COORDINATE SYSTEM — NON-NEGOTIABLE
════════════════════════════════════════════════
• Image: exactly 640 × 640 pixels.
• Origin (0,0): TOP-LEFT corner.
• Max (640,640): BOTTOM-RIGHT corner.
• ALL coordinates: INTEGERS in range [0, 640].
• Precision requirement: within ±3 pixels of the actual visible roof edge.

════════════════════════════════════════════════
  TARGET IDENTIFICATION
════════════════════════════════════════════════
• The TARGET building is the one whose roof centroid is nearest to pixel (320, 320).
• IGNORE everything else: neighboring houses, sheds, trees, driveways, fences, shadows, vehicles, pools.
• If the target has an attached garage, it is PART of the target. Trace it.

════════════════════════════════════════════════
  CRITICAL: ZERO TOLERANCE FOR GENERIC SHAPES
════════════════════════════════════════════════
DO NOT draw bounding boxes or generic shapes. You MUST trace the EXACT perimeter of the roof structure point-by-point. Every physical corner, inset, bump-out, wing junction, and dormer visible in the image MUST have a corresponding coordinate point.

FAILURE CONDITIONS (your output will be REJECTED if any apply):
• Perimeter has fewer than 8 points for any house with visible wings, bump-outs, or L/T/U shapes.
• Perimeter looks like a convex hexagon or rectangle when the actual roof clearly has concave sections (L-shape, T-shape junctions).
• Fewer than 4 facets on any house that is NOT a simple gable (2 facets) or simple hip (4 facets).
• All facets have the same pitch estimate — real roofs almost always have slight pitch variation.
• Facet polygons do not share edges with adjacent facets (they MUST share ridge/hip/valley edges).

════════════════════════════════════════════════
  STEP 1 — OUTER PERIMETER (primary deliverable)
════════════════════════════════════════════════
Trace the COMPLETE outer boundary of the target building's roof drip line.

METHODOLOGY — Walk the edge, do NOT guess the shape:
1. Start at the top-left-most visible corner of the roof.
2. Move CLOCKWISE along the roof edge.
3. At EVERY direction change, place a vertex with exact pixel coordinates.
4. Continue until you return to the starting point.

WHERE TO PLACE VERTICES:
• Every 90° corner (where two walls meet)
• Every acute corner (where a hip edge meets a gutter/eave line)
• Every concave jog (where an L-shape, T-shape, or U-shape creates an inward corner)
• Every bump-out or bay window projection
• Every garage-to-house junction where the roofline steps
• Every dormer's left and right base corners
• Where a covered porch or entry roof connects to the main structure

POINT COUNT GUIDE:
• Simple rectangle house: 4 points minimum
• House + attached garage (stepped roofline): 8–12 points
• L-shaped house: 8–10 points
• T-shaped or U-shaped house: 10–16 points
• Complex multi-wing with dormers: 14–24 points
• If you return fewer than 8 points for anything that is NOT a perfect rectangle, you have FAILED.

EDGE CLASSIFICATION (edge_to_next for each vertex):
For each vertex, classify the segment FROM this point TO the next point:
• EAVE: horizontal lower roof edge where gutters attach. These run along the base of the roof slope. They are roughly parallel to the ground and are the longest horizontal segments.
• HIP: a sloped diagonal edge where two roof planes meet at an external angle and slope DOWN from the ridge toward a corner. On a hip roof (no exposed triangular gable walls), the diagonal edges running from ridge ends to corners are HIP edges.
• RAKE: the sloped edge of a gable end — ONLY present on houses with visible triangular wall sections under the roof edge. If you cannot see a triangular wall end, it is NOT a rake.
• RIDGE: the topmost horizontal peak line — rarely part of the outer perimeter.

CLASSIFICATION RULES:
• If the house has smooth slopes meeting at corners with NO visible triangular walls → HIP roof → diagonal edges are HIP
• If the house has visible triangular wall ends → gable roof → those sloped edges are RAKE
• When in doubt on a Canadian Alberta house, default to HIP (most common)
• All bottom-edge horizontal runs → EAVE

════════════════════════════════════════════════
  STEP 2 — ROOF FACETS (each slope plane)
════════════════════════════════════════════════
Every distinct sloped plane (facet) must be drawn as its own CLOSED polygon. Do NOT group facets together.

FACET TRACING RULES:
1. Each facet is bounded by ridge lines (top), hip/valley lines (sides), and eave/rake lines (bottom).
2. The polygon for each facet must SHARE edges with its adjacent facets:
   – Two facets meeting at a ridge share that ridge line as an edge.
   – Two facets meeting at a hip share that hip line as an edge.
   – Two facets meeting at a valley share that valley line as an edge.
3. The UNION of all facet polygons should approximately equal the perimeter polygon.

FACET COUNT GUIDE:
• Simple gable roof: 2 facets
• Simple hip roof: 4 facets
• Hip roof + cross gable/wing: 6–8 facets
• L-shape hip roof: 6–8 facets
• T-shape or complex: 8–12 facets
• Any house with a visible valley line has AT LEAST 6 facets.

PITCH ESTIMATION:
• Estimate each facet's pitch as rise/run (e.g., "5/12", "7/12", "9/12").
• Different facets CAN and usually DO have slightly different pitches.
• Main roof sections: typically 5/12 to 8/12 in Alberta.
• Steeper decorative sections or dormers: 8/12 to 12/12.
• Low-slope garage or porch sections: 3/12 to 5/12.

AZIMUTH:
• Compass direction the facet faces, in degrees: 0=North, 90=East, 180=South, 270=West.
• A south-facing facet has azimuth ~180. A facet facing slightly east of south: ~160.

════════════════════════════════════════════════
  STEP 3 — INTERNAL STRUCTURAL LINES
════════════════════════════════════════════════
Identify all visible internal lines on the roof surface:

• RIDGE: horizontal peak line where two slopes meet at the top. Usually runs roughly parallel to the longer axis of the house. Start coordinate and end coordinate required.
• HIP: diagonal line from a ridge endpoint DOWN to a perimeter corner. 4 hips on a standard hip roof. Each one starts at a ridge end and ends at a perimeter corner vertex.
• VALLEY: diagonal line where two roof slopes meet in an INWARD angle (typically at L-shape or wing junctions). Valleys channel water downward.

STRUCTURAL LINE RULES:
• Every ridge endpoint MUST connect to either another ridge or a hip line.
• Every hip line MUST start at a ridge end and terminate at a perimeter corner.
• Every valley line MUST connect two ridge lines or a ridge to a perimeter point.
• The start/end points of internal lines should MATCH (within 5px) the vertices used in facet polygons and perimeter.

════════════════════════════════════════════════
  STEP 4 — OBSTRUCTIONS
════════════════════════════════════════════════
Identify visible roof penetrations with bounding boxes:
• CHIMNEY: rectangular masonry protrusion
• VENT: small circular or square pipe penetrations
• SKYLIGHT: rectangular glass panels flush with roof surface
• HVAC: large mechanical equipment (rare on residential)

════════════════════════════════════════════════
  SELF-VALIDATION CHECKLIST (verify before responding)
════════════════════════════════════════════════
Before outputting your JSON, mentally verify ALL of the following:

□ Perimeter centroid is within 80px of (320, 320)
□ Perimeter traces the ACTUAL roof edge, not a simplified bounding box
□ Every visible corner, jog, wing junction has a corresponding vertex
□ L-shaped / T-shaped houses have concave (inward) corners in the perimeter
□ Number of facets matches the visible number of distinct slope planes
□ Adjacent facets share edges (the ridge/hip/valley between them)
□ Union of all facet polygons approximately fills the perimeter
□ Each hip line starts at a ridge endpoint and ends at a perimeter corner
□ Each valley line connects where two roof sections meet at an inward angle
□ Coordinates are integers in [0, 640]
□ All edges are classified (EAVE/HIP/RAKE/RIDGE)

════════════════════════════════════════════════
  REQUIRED JSON OUTPUT FORMAT
════════════════════════════════════════════════
{
  "perimeter": [
    {"x": <int 0-640>, "y": <int 0-640>, "edge_to_next": "EAVE"|"RAKE"|"HIP"|"RIDGE"},
    ...
  ],
  "facets": [
    {
      "id": "f1",
      "points": [{"x": <int>, "y": <int>}, {"x": <int>, "y": <int>}, ...],
      "pitch": "6/12",
      "azimuth": "180"
    },
    ...
  ],
  "lines": [
    {"type": "RIDGE"|"HIP"|"VALLEY", "start": {"x": <int>, "y": <int>}, "end": {"x": <int>, "y": <int>}},
    ...
  ],
  "obstructions": [
    {"type": "CHIMNEY"|"VENT"|"SKYLIGHT"|"HVAC", "boundingBox": {"min": {"x": <int>, "y": <int>}, "max": {"x": <int>, "y": <int>}}},
    ...
  ]
}

Return ONLY this JSON object. No explanation. No commentary. No markdown.`

  const userPrompt = `TASK: Precision roof geometry extraction from this 640×640 overhead satellite image.

TARGET: The residential building whose roof centroid is nearest to pixel (320, 320). Alberta, Canada.

Execute in this EXACT order:

STEP 1 — PERIMETER TRACE:
Starting at the top-left-most corner of the target roof, walk CLOCKWISE along the visible drip line (outermost roof edge including overhang). Place a vertex at EVERY direction change — every corner, every jog, every wing junction, every bump-out, every garage step. If the house is L-shaped, T-shaped, or has any non-rectangular features, you MUST include the concave (inward) corners. Classify each edge segment as EAVE, HIP, RAKE, or RIDGE.

STEP 2 — FACET POLYGONS:
Trace each individual sloped roof plane as a separate closed polygon. Each facet's boundary follows ridge lines (top), hip/valley lines (sides), and eave/rake lines (bottom). Adjacent facets MUST share edges. Estimate each facet's pitch (rise/run like "6/12") and compass azimuth (0=N, 90=E, 180=S, 270=W).

STEP 3 — STRUCTURAL LINES:
Map every visible ridge, hip, and valley line with precise start/end pixel coordinates. Every ridge endpoint connects to a hip line. Every hip line terminates at a perimeter corner. Every valley line marks where two roof sections meet inward.

STEP 4 — OBSTRUCTIONS:
Mark chimneys, vents, skylights, and HVAC units with bounding boxes.

PRECISION REQUIREMENT: ±3 pixels. This data drives material cost calculations for real construction projects.

Return ONLY the JSON object.`

  // =============================================================================
  // AUTO-RETRY LOOP — Make validation checks "bite"
  //
  // Instead of just logging warnings for lazy geometry, we now:
  // 1. Run the Gemini call + post-processing
  // 2. Score the result with hard validation checks
  // 3. If the result fails critical checks, throw and retry
  // 4. Track the best attempt across retries (highest quality score)
  // 5. After MAX_RETRIES exhausted, return best attempt or null for fallback
  // =============================================================================
  const MAX_RETRIES = 3
  let bestAttempt: AIMeasurementAnalysis | null = null
  let bestScore = -1

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Gemini] ═══ Geometry attempt ${attempt}/${MAX_RETRIES} ═══`)

      // Build retry-aware user prompt — after first failure, add explicit correction hints
      let attemptUserPrompt = userPrompt
      if (attempt === 2) {
        attemptUserPrompt += `\n\nCRITICAL CORRECTION (attempt 2): Your previous output was REJECTED because it failed validation. Common failures:
- Perimeter was a convex bounding box (no concave corners for L/T/U shapes)
- Facets did not share edges with adjacent facets
- Too few perimeter points for a complex roof
LOOK MORE CAREFULLY at the roof shape. Trace EVERY corner. Do NOT simplify.`
      } else if (attempt >= 3) {
        attemptUserPrompt += `\n\nFINAL ATTEMPT — MAXIMUM PRECISION REQUIRED (attempt ${attempt}):
Your previous outputs were BOTH rejected for geometric inaccuracy. This is your LAST chance.
MANDATORY:
1. Count the visible corners of the roof perimeter BEFORE tracing. Write down the count mentally.
2. For EACH corner, note its approximate pixel (x,y) location.
3. Verify that L-junctions, T-junctions, and garage steps create CONCAVE (inward) corners.
4. Verify each facet polygon SHARES at least one edge with an adjacent facet.
5. Verify your facet count matches the visible number of distinct slope planes.
If the roof has wings or bumps, your perimeter MUST have concave vertices. A fully convex polygon = AUTOMATIC REJECTION.`
      }

      const text = await callGemini({
        apiKey: env.apiKey,
        accessToken: env.accessToken,
        project: env.project,
        location: env.location,
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image
              }
            },
            { text: attemptUserPrompt }
          ]
        }],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: attempt === 1 ? 0.05 : (attempt === 2 ? 0.1 : 0.15), // Slightly raise temp on retries for diversity
          topP: 0.8
        }
      })

      console.log(`[Gemini] Raw response attempt ${attempt} (first 500 chars): ${text.substring(0, 500)}`)
      const raw = JSON.parse(text) as any

      // Normalize: Gemini may return coordinates in 0-1000 if it ignores our instruction.
      const needsRescale = detectCoordScale(raw)
      if (needsRescale) {
        console.log('[Gemini] Detected 0-1000 coordinate scale — rescaling to 0-640')
        rescaleAnalysis(raw, 640 / 1000)
      }

      const analysis = raw as AIMeasurementAnalysis

      // Ensure arrays exist
      if (!analysis.perimeter) analysis.perimeter = []
      if (!analysis.facets) analysis.facets = []
      if (!analysis.lines) analysis.lines = []
      if (!analysis.obstructions) analysis.obstructions = []

      // Derive perimeter from facets if missing
      if (analysis.perimeter.length === 0 && analysis.facets.length > 0) {
        analysis.perimeter = derivePerimeterFromFacets(analysis.facets)
        console.log(`[Gemini] Derived perimeter (${analysis.perimeter.length} points) from ${analysis.facets.length} facets`)
      }

      // Clamp all coordinates to 0-640
      clampCoordinates(analysis)

      // ──────────────────────────────────────────────────────────────
      // VALIDATION THAT BITES — Score the quality, reject if too low
      // ──────────────────────────────────────────────────────────────
      const failures: string[] = []
      let qualityScore = 0

      // Check 1: Perimeter centroid near center (320,320) — HARD FAIL if > 200px
      if (analysis.perimeter && analysis.perimeter.length >= 3) {
        const cx = analysis.perimeter.reduce((s, p) => s + p.x, 0) / analysis.perimeter.length
        const cy = analysis.perimeter.reduce((s, p) => s + p.y, 0) / analysis.perimeter.length
        const distFromCenter = Math.sqrt((cx - 320) ** 2 + (cy - 320) ** 2)
        if (distFromCenter > 200) {
          failures.push(`CENTROID_OFF: Perimeter centroid (${cx.toFixed(0)},${cy.toFixed(0)}) is ${distFromCenter.toFixed(0)}px from center — likely traced wrong building`)
        } else {
          qualityScore += 20  // centroid near center
          if (distFromCenter < 80) qualityScore += 10  // bonus for very centered
          console.log(`[Gemini] ✓ Centroid (${cx.toFixed(0)},${cy.toFixed(0)}), ${distFromCenter.toFixed(0)}px from center`)
        }
      } else {
        failures.push(`NO_PERIMETER: Only ${analysis.perimeter?.length || 0} perimeter points — need at least 3`)
      }

      // Check 2: Convex polygon detection — HARD FAIL for complex roofs
      // A polygon with 6+ points that is fully convex = lazy bounding box
      const isConvex = analysis.perimeter.length >= 6 ? checkPolygonConvexity(analysis.perimeter) : false
      if (isConvex && analysis.perimeter.length >= 6) {
        failures.push(`CONVEX_BBOX: ${analysis.perimeter.length}-point perimeter is fully convex — looks like a bounding box, not a real roof trace`)
        console.warn(`[Gemini] ✗ LAZY OUTPUT: ${analysis.perimeter.length}-point convex polygon detected`)
      } else if (analysis.perimeter.length >= 6) {
        qualityScore += 25  // concave perimeter = real tracing effort
        console.log(`[Gemini] ✓ Perimeter has concave sections — real trace`)
      } else if (analysis.perimeter.length >= 4) {
        qualityScore += 15  // simple rectangle is OK for small houses
      }

      // Check 3: Facet count sanity
      if (analysis.facets.length >= 4) {
        qualityScore += 20
        console.log(`[Gemini] ✓ ${analysis.facets.length} facets detected`)
      } else if (analysis.facets.length >= 2) {
        qualityScore += 10  // acceptable for simple gable
        console.log(`[Gemini] ~ ${analysis.facets.length} facets (simple roof)`)
      } else {
        failures.push(`LOW_FACETS: Only ${analysis.facets.length} facet(s) — most roofs have at least 4`)
      }

      // Check 4: Shared facet edges — HARD FAIL if 0 shared edges with 4+ facets
      let sharedEdgeCount = 0
      if (analysis.facets.length >= 2) {
        sharedEdgeCount = countSharedFacetEdges(analysis.facets)
        console.log(`[Gemini] ${sharedEdgeCount} shared edges between facets`)
        if (sharedEdgeCount === 0 && analysis.facets.length >= 4) {
          failures.push(`NO_SHARED_EDGES: ${analysis.facets.length} facets but 0 shared edges — facets are disconnected (should share ridge/hip/valley lines)`)
        } else if (sharedEdgeCount > 0) {
          qualityScore += 15 + Math.min(sharedEdgeCount * 2, 10)  // up to 25 points
        }
      }

      // Check 5: Pitch diversity — all identical pitches is suspicious
      if (analysis.facets.length >= 3) {
        const pitches = analysis.facets.map(f => f.pitch).filter(Boolean)
        const uniquePitches = new Set(pitches)
        if (uniquePitches.size === 1 && pitches.length >= 3) {
          // Not a hard fail, but suspicious — deduct points
          qualityScore -= 5
          console.warn(`[Gemini] ~ All ${pitches.length} facets have identical pitch "${pitches[0]}" — suspicious`)
        } else if (uniquePitches.size >= 2) {
          qualityScore += 5
          console.log(`[Gemini] ✓ ${uniquePitches.size} distinct pitch values`)
        }
      }

      // Log quality assessment
      console.log(`[Gemini] Attempt ${attempt} quality score: ${qualityScore}/100, failures: ${failures.length}`)
      console.log(`[Gemini] Stats: ${analysis.perimeter.length} perim pts, ${analysis.facets.length} facets, ${analysis.lines.length} lines, ${sharedEdgeCount} shared edges`)

      // Track best attempt
      if (qualityScore > bestScore) {
        bestScore = qualityScore
        bestAttempt = analysis
        console.log(`[Gemini] ★ New best attempt (score ${qualityScore})`)
      }

      // ──────────────────────────────────────────────────────────────
      // DECISION: Accept or retry?
      // ──────────────────────────────────────────────────────────────
      if (failures.length === 0 && qualityScore >= 50) {
        // ✅ PASSED — quality geometry, accept immediately
        console.log(`[Gemini] ✅ Attempt ${attempt} PASSED all validation (score ${qualityScore}) — accepting`)
        return analysis
      }

      if (failures.length > 0) {
        // ❌ HARD FAILURES — must retry
        const failMsg = failures.join('; ')
        console.warn(`[Gemini] ✗ Attempt ${attempt} FAILED validation: ${failMsg}`)
        if (attempt < MAX_RETRIES) {
          console.log(`[Gemini] → Retrying (${MAX_RETRIES - attempt} attempts remaining)...`)
          // Small delay before retry to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500))
          continue  // next iteration of retry loop
        }
      } else if (qualityScore < 50) {
        // ⚠ LOW QUALITY — no hard failures but score too low, retry if possible
        console.warn(`[Gemini] ⚠ Attempt ${attempt} low quality (score ${qualityScore} < 50)`)
        if (attempt < MAX_RETRIES) {
          console.log(`[Gemini] → Retrying for better quality...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
      }

    } catch (err: any) {
      console.error(`[Gemini] ✗ Attempt ${attempt} error: ${err.message}`)
      if (attempt < MAX_RETRIES) {
        console.log(`[Gemini] → Retrying after error (${MAX_RETRIES - attempt} remaining)...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ALL RETRIES EXHAUSTED — Return best attempt or null
  // ═══════════════════════════════════════════════════════════════════
  if (bestAttempt) {
    console.warn(`[Gemini] ⚠ All ${MAX_RETRIES} attempts used. Returning best attempt (score ${bestScore}). Pipeline should verify and may fall back to Solar API standard segments.`)
    // Tag the result so the pipeline knows this was not a clean pass
    ;(bestAttempt as any)._retryExhausted = true
    ;(bestAttempt as any)._bestScore = bestScore
    return bestAttempt
  }

  console.error(`[Gemini] ✗ All ${MAX_RETRIES} attempts failed with no usable geometry. Returning null — pipeline will fall back to Solar API / DataLayers segments.`)
  return null
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

// ============================================================
// POST-PROCESSING VALIDATION HELPERS
// Detect when Gemini returns lazy bounding boxes instead of real traces
// ============================================================

/**
 * Check if a polygon is fully convex (all interior angles < 180°).
 * A real complex roof perimeter (L-shape, T-shape, wings) has CONCAVE sections.
 * If the polygon is fully convex with 6+ points, it's likely a lazy hexagonal bounding box.
 */
function checkPolygonConvexity(points: { x: number; y: number }[]): boolean {
  if (points.length < 4) return true // triangles are always convex
  const n = points.length
  let sign = 0
  for (let i = 0; i < n; i++) {
    const p0 = points[i]
    const p1 = points[(i + 1) % n]
    const p2 = points[(i + 2) % n]
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x)
    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false // found a reflex angle → polygon is concave → NOT a bounding box
      }
    }
  }
  return true // all angles have the same sign → fully convex → likely a bounding box
}

/**
 * Count the number of edges shared between adjacent facets.
 * Real roof facets share ridge/hip/valley edges with their neighbors.
 * If facets share zero edges, they're probably drawn as isolated shapes.
 */
function countSharedFacetEdges(facets: { points?: { x: number; y: number }[] }[]): number {
  const edgeKey = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    // Normalize edge direction and snap to nearest 5px for fuzzy matching
    const ax = Math.round(a.x / 5) * 5, ay = Math.round(a.y / 5) * 5
    const bx = Math.round(b.x / 5) * 5, by = Math.round(b.y / 5) * 5
    const minX = Math.min(ax, bx), minY = Math.min(ay, by)
    const maxX = Math.max(ax, bx), maxY = Math.max(ay, by)
    return `${minX},${minY}-${maxX},${maxY}`
  }

  const edgeCounts: Record<string, number> = {}
  for (const facet of facets) {
    if (!facet.points || facet.points.length < 3) continue
    for (let j = 0; j < facet.points.length; j++) {
      const a = facet.points[j]
      const b = facet.points[(j + 1) % facet.points.length]
      const key = edgeKey(a, b)
      edgeCounts[key] = (edgeCounts[key] || 0) + 1
    }
  }

  // Shared edges appear in exactly 2 facets
  return Object.values(edgeCounts).filter(c => c >= 2).length
}
