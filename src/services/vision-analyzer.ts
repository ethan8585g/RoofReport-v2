// ============================================================
// RoofReporterAI — Vision-Based Inspection Module
// The "Eyes" Layer — Multimodal AI Roof Condition Analysis
// ============================================================
// Feeds aerial imagery (satellite overhead or RGB GeoTIFF) into
// Gemini Vision to detect what raw Solar API data cannot:
//
//   VULNERABILITIES:
//     - Rusted / lifted flashing
//     - Missing / cracked / curling shingles
//     - Sagging ridge or fascia lines
//     - Ponding or water stain patterns
//     - Exposed decking or underlayment
//
//   OBSTRUCTIONS:
//     - Chimney clusters (single vs. double)
//     - Skylights (flat, bubble, custom shapes)
//     - Satellite dishes / antennas
//     - HVAC units / rooftop mechanicals
//     - Solar panel arrays (existing)
//
//   ENVIRONMENTAL:
//     - Heavy moss / lichen growth
//     - Tree overhang / canopy coverage
//     - Debris accumulation
//     - Snow/ice dam indicators (eave staining)
//
//   CONDITION INDICATORS:
//     - Shingle color uniformity (patching history)
//     - Granule loss patterns (dark streaks)
//     - Flashing condition at penetrations
//     - Gutter / downspout condition
//
// Output: VisionFindings with HeatScore for CRM lead prioritization.
// ============================================================

import type {
  VisionFindings,
  VisionFinding,
  HeatScore,
  VisionSeverity,
  VisionCategory
} from '../types'
import { getAccessToken, getProjectId } from './gcp-auth'

// ============================================================
// Gemini API caller (reuses auth logic from gemini.ts)
// ============================================================
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getVertexAIUrl(project: string, location: string, model: string): string {
  const loc = location === 'global' ? 'us-central1' : location
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${model}:generateContent`
}

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

interface VisionEnv {
  apiKey?: string
  accessToken?: string
  project?: string
  location?: string
  serviceAccountKey?: string
}

async function callGeminiVision(
  env: VisionEnv,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string,
  timeoutMs: number = 60000
): Promise<string> {
  // Auto-generate access token from service account key
  if (!env.accessToken && env.serviceAccountKey) {
    try {
      env.accessToken = await getAccessToken(env.serviceAccountKey)
      if (!env.project) env.project = getProjectId(env.serviceAccountKey) || undefined
      if (!env.location) env.location = 'us-central1'
    } catch (e: any) {
      console.warn('[VisionAnalyzer] Service account token generation failed:', e.message)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const requestBody: any = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        { text: userPrompt }
      ]
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.15,
      topP: 0.9
    }
  }

  try {
    // Priority 1: Vertex AI Platform (Bearer token)
    if (env.accessToken && env.project && env.location) {
      try {
        const url = getVertexAIUrl(env.project, env.location, model)
        console.log(`[VisionAnalyzer] Calling Vertex AI: ${model} via ${env.location}`)
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': env.project
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        if (resp.ok) {
          const data: any = await resp.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return text
        }
        const errText = await resp.text()
        console.warn(`[VisionAnalyzer] Vertex AI failed (${resp.status}): ${errText.substring(0, 200)}`)
      } catch (e: any) {
        if (controller.signal.aborted) throw new Error(`Vision timeout after ${timeoutMs}ms`)
        console.warn(`[VisionAnalyzer] Vertex AI error: ${e.message}`)
      }
    }

    // Priority 2: Bearer token via REST API
    if (env.accessToken && !controller.signal.aborted) {
      try {
        const url = `${GEMINI_REST_BASE}/${model}:generateContent`
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        if (resp.ok) {
          const data: any = await resp.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return text
        }
      } catch (e: any) {
        if (controller.signal.aborted) throw new Error(`Vision timeout after ${timeoutMs}ms`)
        console.warn(`[VisionAnalyzer] Bearer REST error: ${e.message}`)
      }
    }

    // Priority 3: API key
    if (env.apiKey && !controller.signal.aborted) {
      const url = `${GEMINI_REST_BASE}/${model}:generateContent?key=${env.apiKey}`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`Vision API error ${resp.status}: ${errText.substring(0, 200)}`)
      }
      const data: any = await resp.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text
    }

    throw new Error('No Gemini credentials available for vision inspection')
  } finally {
    clearTimeout(timer)
  }
}

// ============================================================
// VISION SCAN — The core inspection function
// ============================================================
// Prompts Gemini to perform a detailed visual inspection of
// the aerial image, looking for roof vulnerabilities, obstructions,
// environmental threats, and condition indicators.
// ============================================================

const VISION_SYSTEM_PROMPT = `You are a PRECISION ROOF CONDITION INSPECTOR powered by advanced multimodal AI. You analyze aerial/satellite imagery of residential roofs to identify visual indicators that affect roofing job planning, pricing, and urgency.

You are looking at a top-down satellite image (640x640 pixels) centered on a residential building in Alberta, Canada.

YOUR MISSION: Identify EVERYTHING visible that a roofing contractor needs to know before quoting or starting a job. You are the "eyes" that supplement numerical API data.

════════════════════════════════════════════════
  DETECTION CATEGORIES
════════════════════════════════════════════════

1. VULNERABILITIES (things that indicate roof damage or wear):
   - rusted_flashing: Rust-colored staining around penetrations, chimney base, or wall junctions
   - missing_shingles: Visible gaps, exposed decking, or underlayment showing through
   - curling_shingles: Shingle tabs lifting/curling (visible as irregular shadow patterns)
   - cracked_shingles: Visible fracture lines or broken tab patterns
   - granule_loss: Dark streaks or bare patches where protective granules are gone
   - sagging_ridge: Ridge line or fascia board showing visible deflection/bow
   - ponding_evidence: Dark water stain patterns or discoloration on flat/low-slope sections
   - exposed_decking: Raw wood or underlayment visible (missing/blown-off shingles)
   - patched_areas: Mismatched shingle colors indicating previous spot repairs

2. OBSTRUCTIONS (things that complicate the roofing job):
   - chimney: Masonry chimney penetrating the roof — note single vs. double/multiple
   - skylight: Glass/plastic panels flush or protruding — note cluster arrangements
   - satellite_dish: Dish antenna mounted on roof surface
   - hvac_unit: Rooftop mechanical equipment (heating/cooling units)
   - solar_panels: Existing photovoltaic panel array (must be removed/reinstalled)
   - antenna: TV antenna, radio mast, or similar vertical structure
   - plumbing_vents: Pipe penetrations (count them — each needs flashing)
   - dormer: Dormer structure with its own mini-roof (adds complexity)
   - roof_turret: Decorative turret or cupola structure

3. ENVIRONMENTAL (external threats from surroundings):
   - heavy_moss: Green/dark growth covering shingle surfaces
   - lichen_growth: Light-colored crusty organic growth on roof
   - tree_overhang: Branches extending over the roof (shade, debris, scraping risk)
   - tree_canopy_coverage: Percentage of roof shaded by tree canopy (estimate %)
   - debris_accumulation: Leaves, needles, twigs accumulated in valleys or gutters
   - ice_dam_indicators: Eave-line staining or damage from freeze-thaw cycles
   - adjacent_construction: Nearby construction that may affect access or timing

4. CONDITION INDICATORS (overall age/state signals):
   - color_uniformity: Are all shingles consistent color, or patchy/faded in zones?
   - age_indicators: General aging signs — fading, weathering, overall worn appearance
   - gutter_condition: Visible sag, overflow staining, or detachment of gutters
   - flashing_condition: Overall state of visible flashing at valleys, walls, penetrations
   - ventilation_visible: Ridge vents, box vents, or turbines visible (note type and count)

════════════════════════════════════════════════
  SEVERITY CLASSIFICATION
════════════════════════════════════════════════
For each finding, assign severity:
- "low": Cosmetic or minor — no immediate action needed
- "moderate": Should be addressed within 1-2 years — affects longevity
- "high": Needs attention soon — active water infiltration risk
- "critical": Immediate attention — safety hazard or active failure

════════════════════════════════════════════════
  CONFIDENCE SCORING
════════════════════════════════════════════════
Rate your confidence 0-100 for each finding:
- 90-100: Clearly visible, high certainty
- 70-89: Likely present, some ambiguity from image resolution
- 50-69: Possible — image suggests but doesn't confirm
- Below 50: Do not report — too uncertain

ONLY report findings with confidence >= 50.

════════════════════════════════════════════════
  BOUNDING BOX FORMAT
════════════════════════════════════════════════
For each finding, provide an approximate bounding box on the 640x640 image:
[minX, minY, maxX, maxY] — pixel coordinates, integers in [0, 640].

If the finding is diffuse (e.g., overall moss coverage), use the roof outline bounds.

════════════════════════════════════════════════
  OUTPUT — JSON ONLY
════════════════════════════════════════════════
Return a JSON object with exactly this structure:

{
  "findings": [
    {
      "id": "VF-001",
      "category": "vulnerability" | "obstruction" | "condition" | "environmental",
      "type": "<specific_type_from_list_above>",
      "label": "<short human-readable name>",
      "description": "<detailed 1-2 sentence description of what you see>",
      "severity": "low" | "moderate" | "high" | "critical",
      "confidence": <int 50-100>,
      "bounding_box": [minX, minY, maxX, maxY],
      "impact": "<how this affects the roofing job: cost/labor/timeline/safety>",
      "recommendation": "<what the roofer should do about this>"
    }
  ],
  "overall_condition": "excellent" | "good" | "fair" | "poor" | "critical",
  "summary": "<one-line overall assessment, max 120 chars>"
}

IMPORTANT:
- Report EVERY visible finding with confidence >= 50
- Do NOT hallucinate findings that aren't visible in the image
- Be specific about locations ("north-facing section", "near chimney base")
- Count plumbing vents and report the total
- Note tree overhang percentage if applicable
- Alberta climate context: freeze-thaw cycles, chinook wind damage, heavy snow loads

Return ONLY the JSON object. No explanation. No markdown.`

const VISION_USER_PROMPT = `TASK: Comprehensive visual roof condition inspection from this 640×640 overhead satellite image.

TARGET: The residential building whose roof is centered in the image. Location: Alberta, Canada.

Carefully examine the ENTIRE roof surface and surrounding environment. Identify:

1. ALL visible vulnerabilities (damage, wear, deterioration)
2. ALL obstructions that complicate roofing work (chimneys, skylights, vents, dishes, etc.)
3. ALL environmental factors (trees, moss, debris, ice damage)
4. Overall condition indicators (age, uniformity, maintenance history)

For each finding, provide:
- Precise type from the approved list
- Severity (low/moderate/high/critical)
- Confidence (50-100, only report if >=50)
- Approximate bounding box on the image
- Impact on the roofing job
- Recommended action

Also assess overall roof condition and provide a one-line summary.

This data will be used to:
- Prioritize leads in a CRM (Heat Score)
- Adjust material estimates
- Flag properties for field verification
- Help roofers quote accurately before site visits

Be thorough but honest — do NOT invent findings that aren't visible.

Return ONLY the JSON object.`

// ============================================================
// vision_scan() — Main entry point
// ============================================================
export async function visionScan(
  imageUrl: string,
  env: VisionEnv,
  options?: {
    model?: string
    timeoutMs?: number
    sourceType?: 'satellite_overhead' | 'rgb_geotiff' | 'street_view'
  }
): Promise<VisionFindings> {
  const startMs = Date.now()
  const model = options?.model || 'gemini-2.0-flash'
  const timeoutMs = options?.timeoutMs || 60000
  const sourceType = options?.sourceType || 'satellite_overhead'

  console.log(`[VisionAnalyzer] ═══ Starting vision scan ═══`)
  console.log(`[VisionAnalyzer] Model: ${model}, Timeout: ${timeoutMs}ms, Source: ${sourceType}`)

  // Fetch and encode the image
  const imageStartMs = Date.now()
  const base64Image = await fetchImageAsBase64(imageUrl)
  console.log(`[VisionAnalyzer] Image fetched in ${Date.now() - imageStartMs}ms (${Math.round(base64Image.length / 1024)}KB)`)

  // Call Gemini Vision
  const text = await callGeminiVision(
    env, model,
    VISION_SYSTEM_PROMPT,
    VISION_USER_PROMPT,
    base64Image,
    timeoutMs
  )

  console.log(`[VisionAnalyzer] Raw response (first 500 chars): ${text.substring(0, 500)}`)

  // Parse response
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```json?\s*\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1])
    } else {
      throw new Error(`Failed to parse vision response as JSON: ${text.substring(0, 200)}`)
    }
  }

  // Normalize findings
  const rawFindings: any[] = Array.isArray(parsed.findings) ? parsed.findings : []
  const findings: VisionFinding[] = rawFindings
    .filter((f: any) => f.confidence >= 50)
    .map((f: any, i: number) => ({
      id: f.id || `VF-${String(i + 1).padStart(3, '0')}`,
      category: validateCategory(f.category),
      type: String(f.type || 'unknown'),
      label: String(f.label || f.type || 'Unknown finding'),
      description: String(f.description || ''),
      severity: validateSeverity(f.severity),
      confidence: Math.max(0, Math.min(100, Math.round(Number(f.confidence) || 50))),
      bounding_box: Array.isArray(f.bounding_box) && f.bounding_box.length === 4
        ? f.bounding_box.map((v: number) => Math.max(0, Math.min(640, Math.round(v))))
        : undefined,
      impact: String(f.impact || 'No specific impact noted'),
      recommendation: String(f.recommendation || 'Monitor during field inspection')
    }))

  // Compute Heat Score from findings
  const heatScore = computeHeatScore(findings)

  const duration = Date.now() - startMs

  // Determine overall condition
  const overallCondition = validateCondition(parsed.overall_condition) ||
    deriveCondition(heatScore.total)

  const result: VisionFindings = {
    inspected_at: new Date().toISOString(),
    model,
    finding_count: findings.length,
    findings,
    heat_score: heatScore,
    overall_condition: overallCondition,
    summary: String(parsed.summary || `${findings.length} findings detected — ${heatScore.classification} lead`).substring(0, 200),
    duration_ms: duration,
    source_image: sourceType
  }

  console.log(`[VisionAnalyzer] ✅ Scan complete in ${duration}ms: ${findings.length} findings, Heat Score ${heatScore.total}/100 (${heatScore.classification}), condition: ${overallCondition}`)
  return result
}

// ============================================================
// HEAT SCORE COMPUTATION — CRM Lead Prioritization Engine
// ============================================================
// Higher score = more urgent roof job = hotter lead.
// Score 0-100 composed of 5 weighted components.
//
// Scoring philosophy:
//   - Actual damage (vulnerabilities) scores highest
//   - Environmental threats add urgency
//   - Obstructions increase job complexity (roofer wants the work)
//   - Critical findings get a bonus multiplier
// ============================================================

export function computeHeatScore(findings: VisionFinding[]): HeatScore {
  let ageWear = 0          // 0-30
  let structural = 0       // 0-25
  let environmental = 0    // 0-20
  let obstructionComplexity = 0  // 0-15
  let urgencyBonus = 0     // 0-10

  // Severity multipliers
  const severityWeight: Record<VisionSeverity, number> = {
    low: 1,
    moderate: 2,
    high: 3.5,
    critical: 5
  }

  for (const finding of findings) {
    const weight = severityWeight[finding.severity] * (finding.confidence / 100)

    switch (finding.category) {
      case 'vulnerability':
        // Age/wear types
        if (['granule_loss', 'curling_shingles', 'patched_areas', 'age_indicators', 'color_uniformity'].includes(finding.type)) {
          ageWear += weight * 4
        }
        // Structural damage types
        if (['missing_shingles', 'cracked_shingles', 'rusted_flashing', 'sagging_ridge', 'exposed_decking', 'ponding_evidence'].includes(finding.type)) {
          structural += weight * 5
        }
        break

      case 'environmental':
        if (['tree_overhang', 'tree_canopy_coverage'].includes(finding.type)) {
          environmental += weight * 3
        }
        if (['heavy_moss', 'lichen_growth', 'debris_accumulation'].includes(finding.type)) {
          environmental += weight * 3.5
        }
        if (['ice_dam_indicators'].includes(finding.type)) {
          environmental += weight * 4
        }
        break

      case 'obstruction':
        // Each obstruction adds complexity — more work = roofer wants the lead
        if (['chimney', 'skylight', 'dormer', 'roof_turret'].includes(finding.type)) {
          obstructionComplexity += weight * 2.5
        } else if (['solar_panels', 'hvac_unit'].includes(finding.type)) {
          obstructionComplexity += weight * 3
        } else {
          obstructionComplexity += weight * 1.5
        }
        break

      case 'condition':
        if (['flashing_condition', 'gutter_condition'].includes(finding.type)) {
          ageWear += weight * 3
        }
        break
    }

    // Critical findings get urgency bonus
    if (finding.severity === 'critical') {
      urgencyBonus += 3
    } else if (finding.severity === 'high') {
      urgencyBonus += 1.5
    }
  }

  // Clamp each component to its max
  ageWear = Math.min(30, Math.round(ageWear * 10) / 10)
  structural = Math.min(25, Math.round(structural * 10) / 10)
  environmental = Math.min(20, Math.round(environmental * 10) / 10)
  obstructionComplexity = Math.min(15, Math.round(obstructionComplexity * 10) / 10)
  urgencyBonus = Math.min(10, Math.round(urgencyBonus * 10) / 10)

  const total = Math.min(100, Math.round(ageWear + structural + environmental + obstructionComplexity + urgencyBonus))

  // Classify
  let classification: HeatScore['classification']
  if (total >= 75) classification = 'on_fire'
  else if (total >= 50) classification = 'hot'
  else if (total >= 25) classification = 'warm'
  else classification = 'cold'

  // Summary
  const summaryParts: string[] = []
  if (structural > 15) summaryParts.push('active damage detected')
  else if (structural > 5) summaryParts.push('wear indicators present')
  if (environmental > 10) summaryParts.push('environmental threats')
  if (obstructionComplexity > 8) summaryParts.push('complex roof layout')
  if (urgencyBonus >= 5) summaryParts.push('urgent attention needed')
  if (summaryParts.length === 0) summaryParts.push('roof appears to be in acceptable condition')

  const summary = `Heat ${total}/100 (${classification}) — ${summaryParts.join(', ')}`

  return {
    total,
    components: {
      age_wear: ageWear,
      structural,
      environmental,
      obstruction_complexity: obstructionComplexity,
      urgency_bonus: urgencyBonus
    },
    classification,
    summary
  }
}

// ============================================================
// FILTERING LOGIC — Remove low-confidence or duplicate findings
// ============================================================
export function filterFindings(
  findings: VisionFinding[],
  options?: {
    minConfidence?: number
    categories?: VisionCategory[]
    severities?: VisionSeverity[]
  }
): VisionFinding[] {
  let filtered = [...findings]

  if (options?.minConfidence) {
    filtered = filtered.filter(f => f.confidence >= options.minConfidence!)
  }
  if (options?.categories?.length) {
    filtered = filtered.filter(f => options.categories!.includes(f.category))
  }
  if (options?.severities?.length) {
    filtered = filtered.filter(f => options.severities!.includes(f.severity))
  }

  // Remove spatially overlapping findings of the same type
  // (de-duplicate detections within 50px of each other)
  const deduped: VisionFinding[] = []
  for (const f of filtered) {
    const isDuplicate = deduped.some(existing =>
      existing.type === f.type &&
      existing.bounding_box && f.bounding_box &&
      boxOverlap(existing.bounding_box, f.bounding_box) > 0.5
    )
    if (!isDuplicate) {
      deduped.push(f)
    }
  }

  return deduped
}

// ============================================================
// HELPERS
// ============================================================

function boxOverlap(a: number[], b: number[]): number {
  const overlapX = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const overlapY = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const overlapArea = overlapX * overlapY
  const areaA = (a[2] - a[0]) * (a[3] - a[1])
  const areaB = (b[2] - b[0]) * (b[3] - b[1])
  const unionArea = areaA + areaB - overlapArea
  return unionArea > 0 ? overlapArea / unionArea : 0
}

function validateSeverity(s: any): VisionSeverity {
  if (['low', 'moderate', 'high', 'critical'].includes(s)) return s
  return 'moderate'
}

function validateCategory(c: any): VisionCategory {
  if (['vulnerability', 'obstruction', 'condition', 'environmental'].includes(c)) return c
  return 'condition'
}

function validateCondition(c: any): VisionFindings['overall_condition'] | null {
  if (['excellent', 'good', 'fair', 'poor', 'critical'].includes(c)) return c
  return null
}

function deriveCondition(heatScore: number): VisionFindings['overall_condition'] {
  if (heatScore >= 75) return 'critical'
  if (heatScore >= 55) return 'poor'
  if (heatScore >= 35) return 'fair'
  if (heatScore >= 15) return 'good'
  return 'excellent'
}
