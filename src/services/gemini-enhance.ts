// ============================================================
// RoofReporterAI — Gemini 2.5 Pro Report Enhancement Engine
// Uses dedicated airoofreports API key for post-generation
// quality upgrade. Enhances report data with AI-powered
// analysis commentary, professional insights, and refined
// recommendations before delivering to the customer.
// ============================================================

import type { RoofReport } from '../types'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/**
 * Enhance a completed RoofReport via Gemini 2.5 Pro.
 * 
 * This is the final "polish" step — the report already has:
 *   - WELD: buildingInsights segments, pitch, footprint
 *   - PAINT: DataLayers DSM-refined pitch and true area
 *   - POLISH: Merged measurements
 * 
 * The enhancement adds:
 *   - Professional roof condition commentary
 *   - Segment-by-segment analysis notes
 *   - Material recommendation refinements
 *   - Risk assessment and maintenance suggestions
 *   - Enhanced quality narrative
 * 
 * Returns the enhanced RoofReport (same structure, enriched fields)
 * or null if enhancement fails (non-blocking, original report stands).
 */
export async function enhanceReportViaGemini(
  report: RoofReport,
  apiKey: string,
  satelliteImageUrl?: string | null,
  options?: {
    timeoutMs?: number
    focus?: string
  }
): Promise<RoofReport | null> {
  const startTime = Date.now()
  const timeout = options?.timeoutMs || 25000

  try {
    // Build a focused summary of the report for the prompt
    const segments = report.segments || []
    const segSummary = segments.map((s, i) => 
      `  Segment ${i + 1} "${s.name}": ${s.footprint_area_sqft} sqft footprint, ${s.true_area_sqft} sqft true area, pitch ${s.pitch_degrees}° (${s.pitch_ratio}), facing ${s.cardinal_direction || 'unknown'}`
    ).join('\n')

    const es = report.edge_summary || {} as any
    const mat = report.materials || {} as any
    const quality = report.quality || {} as any

    const systemPrompt = `You are a senior Canadian roofing measurement analyst for RoofReporterAI. You enhance automated roof measurement reports with professional commentary, quality insights, and actionable recommendations.

Your output must be valid JSON — no markdown, no code fences, no explanation outside the JSON object.`

    const userPrompt = `Enhance this roof measurement report with professional analysis. The measurements are already precise (Google Solar API buildingInsights + DataLayers DSM hybrid).

PROPERTY:
  Address: ${report.property?.address || 'N/A'}
  City: ${report.property?.city || 'N/A'}, ${report.property?.province || 'AB'}
  Coordinates: ${report.property?.latitude}, ${report.property?.longitude}

MEASUREMENTS:
  Footprint: ${report.total_footprint_sqft} sqft (${report.total_footprint_sqm} sqm)
  True 3D Area: ${report.total_true_area_sqft} sqft (${report.total_true_area_sqm} sqm)
  Area Multiplier: ${report.area_multiplier}x
  Pitch: ${report.roof_pitch_degrees}° (${report.roof_pitch_ratio})
  Azimuth: ${report.roof_azimuth_degrees}°

SEGMENTS (${segments.length} facets):
${segSummary || '  No segment data'}

EDGES:
  Ridge: ${es.total_ridge_ft || 0} ft
  Hip: ${es.total_hip_ft || 0} ft
  Valley: ${es.total_valley_ft || 0} ft
  Eave: ${es.total_eave_ft || 0} ft
  Rake: ${es.total_rake_ft || 0} ft
  Total Linear: ${es.total_linear_ft || 0} ft

MATERIALS:
  Gross Squares: ${mat.gross_squares || 0}
  Bundle Count: ${mat.bundle_count || 0}
  Complexity: ${mat.complexity_class || 'unknown'}
  Shingle Type: ${mat.shingle_type || 'architectural'}

QUALITY:
  Imagery: ${quality.imagery_quality || 'N/A'}
  Confidence: ${quality.confidence_score || 0}%
  Provider: ${report.metadata?.provider || 'unknown'}

${report.vision_findings ? `VISION FINDINGS: Heat score ${report.vision_findings.heat_score?.total || 0}/100, ${report.vision_findings.finding_count || 0} findings detected` : ''}
${report.customer_price_per_bundle ? `CUSTOMER PRICING: $${report.customer_price_per_bundle}/sq × ${report.customer_gross_squares} sq = $${report.customer_total_cost_estimate} CAD` : ''}

Return a JSON object with these fields:
{
  "executive_summary": "2-3 sentence professional summary of the roof for a homeowner or contractor",
  "roof_condition_assessment": "Professional assessment based on measurements — complexity, drainage patterns, maintenance considerations",
  "segment_insights": [
    {"segment_index": 0, "note": "Professional insight about this specific facet — pitch suitability, drainage, sun exposure"}
  ],
  "material_recommendations": "Specific material recommendations based on pitch, complexity, and Alberta climate",
  "risk_factors": ["List of specific risk factors based on the geometry — valleys, low-pitch areas, complex transitions"],
  "maintenance_priorities": ["Prioritized maintenance recommendations based on roof geometry"],
  "enhanced_quality_notes": ["Additional quality observations to append to report"],
  "confidence_adjustment": 0,
  "contractor_notes": "Brief notes a contractor would find useful for quoting this job"
}`

    // Build the request — include satellite image if available for visual analysis
    const parts: any[] = [{ text: userPrompt }]
    
    if (satelliteImageUrl && !satelliteImageUrl.startsWith('data:')) {
      // For Google Maps URLs, we can't send them as image parts (auth required)
      // Instead, mention it in the prompt context
      parts[0].text += `\n\nNote: Satellite imagery is available at zoom level 20 for this property.`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Understood. I will analyze the roof report and return only valid JSON.' }] },
          { role: 'user', parts }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[GeminiEnhance] API error ${response.status}: ${errText.substring(0, 300)}`)
      return null
    }

    const data: any = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      console.warn('[GeminiEnhance] No text in response')
      return null
    }

    // Parse the JSON response
    let enhancement: any
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      enhancement = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error(`[GeminiEnhance] JSON parse failed: ${text.substring(0, 200)}`)
      return null
    }

    // ── Apply enhancements to the report ──
    const enhanced = { ...report }

    // Executive summary
    if (enhancement.executive_summary) {
      (enhanced as any).executive_summary = enhancement.executive_summary
    }

    // Roof condition assessment
    if (enhancement.roof_condition_assessment) {
      (enhanced as any).roof_condition_assessment = enhancement.roof_condition_assessment
    }

    // Segment insights — attach notes to each segment
    if (enhancement.segment_insights && Array.isArray(enhancement.segment_insights)) {
      enhanced.segments = [...(enhanced.segments || [])]
      for (const insight of enhancement.segment_insights) {
        const idx = insight.segment_index
        if (idx >= 0 && idx < enhanced.segments.length) {
          enhanced.segments[idx] = {
            ...enhanced.segments[idx],
            ai_insight: insight.note
          } as any
        }
      }
    }

    // Material recommendations
    if (enhancement.material_recommendations) {
      (enhanced as any).material_recommendations = enhancement.material_recommendations
    }

    // Risk factors
    if (enhancement.risk_factors && Array.isArray(enhancement.risk_factors)) {
      (enhanced as any).risk_factors = enhancement.risk_factors
    }

    // Maintenance priorities
    if (enhancement.maintenance_priorities && Array.isArray(enhancement.maintenance_priorities)) {
      (enhanced as any).maintenance_priorities = enhancement.maintenance_priorities
    }

    // Contractor notes
    if (enhancement.contractor_notes) {
      (enhanced as any).contractor_notes = enhancement.contractor_notes
    }

    // Append quality notes
    if (enhancement.enhanced_quality_notes && Array.isArray(enhancement.enhanced_quality_notes)) {
      enhanced.quality = { ...enhanced.quality }
      enhanced.quality.notes = [
        ...(enhanced.quality.notes || []),
        ...enhancement.enhanced_quality_notes
      ]
    }

    // Confidence adjustment
    if (typeof enhancement.confidence_adjustment === 'number' && enhancement.confidence_adjustment !== 0) {
      enhanced.quality = { ...enhanced.quality }
      enhanced.quality.confidence_score = Math.max(0, Math.min(100,
        enhanced.quality.confidence_score + enhancement.confidence_adjustment
      ))
    }

    // Mark enhancement metadata
    ;(enhanced as any).enhancement = {
      version: '1.0',
      model: 'gemini-2.5-flash',
      project: 'airoofreports',
      enhanced_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
      fields_enhanced: Object.keys(enhancement).filter(k => enhancement[k] != null && enhancement[k] !== '')
    }

    enhanced.report_version = (parseFloat(enhanced.report_version || '2.0') >= 3 ? '3.1' : '2.1')

    console.log(`[GeminiEnhance] ✅ Enhanced in ${Date.now() - startTime}ms — ${Object.keys(enhancement).length} fields, summary: ${(enhancement.executive_summary || '').substring(0, 80)}...`)

    return enhanced

  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[GeminiEnhance] Timed out after ${timeout}ms`)
    } else {
      console.error(`[GeminiEnhance] Error: ${err.message}`)
    }
    return null
  }
}
