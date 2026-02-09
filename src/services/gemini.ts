// ============================================================
// Reuse Canada - AI Measurement Engine (Vertex AI + Gemini)
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

import type { AIMeasurementAnalysis, AIReportData } from '../types'

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

  // Try Vertex AI Platform first (production mode)
  if (opts.accessToken && opts.project && opts.location) {
    try {
      const url = getVertexAIUrl(opts.project, opts.location, model, 'generateContent')
      console.log(`[Gemini] Calling Vertex AI: ${model} via ${opts.location}`)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.accessToken}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': opts.project
        },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        const data: any = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return text
        throw new Error('Empty response from Vertex AI')
      }

      const errText = await response.text()
      console.warn(`[Gemini] Vertex AI failed (${response.status}), falling back to REST: ${errText.substring(0, 200)}`)
    } catch (e: any) {
      console.warn(`[Gemini] Vertex AI error, falling back to REST: ${e.message}`)
    }
  }

  // Fallback: Gemini REST API with API key
  if (opts.apiKey) {
    const url = `${GEMINI_REST_BASE}/${model}:generateContent?key=${opts.apiKey}`
    console.log(`[Gemini] Calling REST API: ${model}`)
    
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

  throw new Error('No Gemini API credentials available (need either API key or Vertex AI token)')
}

// ============================================================
// AI Roof Geometry Analysis — Gemini Vision
// Enhanced prompt from Vertex Engine (roofstack-ai-2)
// Analyzes satellite imagery to extract:
// - Facets (roof planes with pitch/azimuth)
// - Lines (ridges, hips, valleys, eaves, rakes)
// - Obstructions (chimneys, vents, skylights, HVAC)
// ============================================================
export async function analyzeRoofGeometry(
  satelliteImageUrl: string,
  env: {
    apiKey?: string
    accessToken?: string
    project?: string
    location?: string
  }
): Promise<AIMeasurementAnalysis | null> {
  if (!env.apiKey && !env.accessToken) {
    console.warn('[Gemini] No credentials — skipping geometry analysis')
    return null
  }

  const base64Image = await fetchImageAsBase64(satelliteImageUrl)

  // Enhanced system prompt from Vertex Engine
  const systemPrompt = `You are a Professional Geospatial AI specialized in Roof Geometry Extraction.
Your goal is to analyze high-resolution aerial/satellite imagery and perform precise instance segmentation of roof structures.

Your Task:
1. Identify Facets: Outline every individual roof plane (facet). Each facet is a flat section of the roof.
2. Identify Lines: Map all structural lines:
   - RIDGE: The top horizontal line where two roof planes meet
   - HIP: Sloped outer edges where two roof planes meet at an angle
   - VALLEY: Sloped inner edges where two roof planes create a V shape
   - EAVE: The lower horizontal edges of the roof (drip edge)
   - RAKE: The sloped edges at gable ends
3. Identify Obstructions: Locate chimneys, skylights, vents, and HVAC units on the roof.
4. Calculate Attributes: Estimate the Pitch (in X/12 format like "6/12") and Azimuth (compass degrees) for each facet based on visual shadowing and perspective.

Output Constraints:
- Return ONLY a valid JSON object matching the exact schema below.
- Coordinates should be normalized (0-1000) based on the 640x640 image boundaries.
- Be thorough — identify ALL visible facets, lines, and obstructions.
- For residential homes, expect 2-8 facets typically.
- Assign meaningful IDs like "f1", "f2" etc.
- Pitch should be in "X/12" format (e.g., "6/12", "8/12")
- Azimuth should be a string of compass degrees (e.g., "180", "270")`

  const userPrompt = `Analyze this satellite/aerial roof image and extract complete roof geometry.

Return JSON: {
  "facets": [{ "id": "f1", "points": [{"x": 10, "y": 10}, ...], "pitch": "6/12", "azimuth": "180" }],
  "lines": [{ "type": "RIDGE", "start": {"x":0,"y":0}, "end": {"x":10,"y":10} }],
  "obstructions": [{ "type": "CHIMNEY", "boundingBox": { "min": {"x":0,"y":0}, "max": {"x":10,"y":10} } }]
}`

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

  const analysis = JSON.parse(text) as AIMeasurementAnalysis

  // Validate basic structure
  if (!analysis.facets) analysis.facets = []
  if (!analysis.lines) analysis.lines = []
  if (!analysis.obstructions) analysis.obstructions = []

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
  }
): Promise<AIReportData | null> {
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

  return JSON.parse(text) as AIReportData
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
  }
): Promise<{ analysis: AIMeasurementAnalysis; satelliteUrl: string }> {
  const mapsKey = env.mapsKey || env.apiKey
  if (!mapsKey) throw new Error('No Maps API key available')

  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&key=${mapsKey}`

  const analysis = await analyzeRoofGeometry(satelliteUrl, env)
  if (!analysis) throw new Error('AI analysis returned empty result')

  return { analysis, satelliteUrl }
}
