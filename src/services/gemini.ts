// ============================================================
// Reuse Canada - AI Measurement Engine
// Server-side Gemini Vision integration for roof geometry
// ============================================================
// This runs on Cloudflare Workers — uses Web APIs only (no Node.js fs/path)
// Gemini API key stored as GOOGLE_VERTEX_API_KEY in env
// ============================================================

import type { AIMeasurementAnalysis, AIReportData } from '../types'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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
// AI Roof Geometry Analysis — Gemini Vision
// Analyzes satellite imagery to extract:
// - Facets (roof planes with pitch/azimuth)
// - Lines (ridges, hips, valleys, eaves, rakes)
// - Obstructions (chimneys, vents, skylights, HVAC)
// ============================================================
export async function analyzeRoofGeometry(
  satelliteImageUrl: string,
  apiKey: string
): Promise<AIMeasurementAnalysis | null> {
  if (!apiKey) {
    console.warn('[Gemini] No API key — skipping geometry analysis')
    return null
  }

  try {
    const base64Image = await fetchImageAsBase64(satelliteImageUrl)

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
4. Calculate Attributes: Estimate the Pitch (in degrees) and Azimuth (compass direction) for each facet based on visual shadowing and perspective.

Output Constraints:
- Return ONLY a valid JSON object matching the exact schema below.
- Coordinates should be normalized (0-1000) based on the image boundaries.
- Be thorough — identify ALL visible facets, lines, and obstructions.
- For residential homes, expect 2-8 facets typically.
- Assign meaningful IDs like "facet-1", "facet-2" etc.`

    const url = `${GEMINI_API_BASE}/gemini-2.0-flash:generateContent?key=${apiKey}`

    const requestBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: 'Analyze this satellite/aerial roof image and extract complete roof geometry. Return a JSON object with facets (array of {id, points [{x,y}], pitch, azimuth}), lines (array of {type, start {x,y}, end {x,y}}), and obstructions (array of {type, boundingBox {min {x,y}, max {x,y}}}). Use normalized coordinates 0-1000.'
          }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    }

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

    if (!text) {
      throw new Error('Empty response from Gemini Vision')
    }

    const analysis = JSON.parse(text) as AIMeasurementAnalysis

    // Validate basic structure
    if (!analysis.facets) analysis.facets = []
    if (!analysis.lines) analysis.lines = []
    if (!analysis.obstructions) analysis.obstructions = []

    return analysis

  } catch (error: any) {
    console.error('[Gemini] Vision analysis failed:', error.message)
    throw error // Propagate so caller can store the error message
  }
}

// ============================================================
// AI Roofing Assessment Report — Gemini Text
// Generates professional assessment from Solar API data
// ============================================================
export async function generateAIRoofingReport(
  solarData: {
    totalAreaSqm: number
    maxSunshineHours: number
    segmentCount: number
    segments: Array<{ pitchDegrees: number, azimuthDegrees: number, areaSqm: number }>
  },
  apiKey: string
): Promise<AIReportData | null> {
  if (!apiKey) {
    console.warn('[Gemini] No API key — skipping AI report')
    return null
  }

  try {
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

    const url = `${GEMINI_API_BASE}/gemini-2.0-flash:generateContent?key=${apiKey}`

    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    }

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

    if (!text) {
      throw new Error('Empty response from Gemini')
    }

    return JSON.parse(text) as AIReportData

  } catch (error: any) {
    console.error('[Gemini] Report generation failed:', error.message)
    throw error // Propagate so caller can store the error message
  }
}
