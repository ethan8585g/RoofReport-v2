// ============================================================
// RoofReporterAI — AI Image Generation Service
// Uses Gemini 2.5 Flash Image (native image generation)
// to create professional report imagery from satellite data
// and measurement results.
//
// Pipeline: satellite image + report data → Gemini → AI visuals
// Images are stored as base64 data URLs in the report JSON.
// ============================================================

import type { RoofReport } from '../types'

const GEMINI_IMAGE_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'

interface AIGeneratedImage {
  type: string          // e.g., 'annotated_overhead', '3d_perspective', 'condition_visual', 'cover'
  label: string         // Human-readable label for the report
  description: string   // What this image shows
  data_url: string      // base64 data URL (data:image/png;base64,...)
  generated_at: string  // ISO timestamp
}

interface AIImageryResult {
  images: AIGeneratedImage[]
  generation_time_ms: number
  model: string
  generated_at: string
}

/**
 * Generate a single AI image from a text prompt, optionally with a reference satellite image.
 * Returns base64 image data or null on failure.
 */
async function generateSingleImage(
  apiKey: string,
  prompt: string,
  satelliteBase64?: string | null,
  timeoutMs: number = 30000
): Promise<string | null> {
  try {
    const parts: any[] = [{ text: prompt }]

    // Include satellite image as reference if available
    if (satelliteBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: satelliteBase64
        }
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(`${GEMINI_IMAGE_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.8
        }
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.warn(`[AIImageGen] API error ${response.status}: ${errText.substring(0, 200)}`)
      return null
    }

    const data: any = await response.json()
    const candidates = data?.candidates
    if (!candidates || candidates.length === 0) {
      console.warn('[AIImageGen] No candidates in response')
      return null
    }

    // Find the image part in the response
    for (const part of candidates[0]?.content?.parts || []) {
      if (part.inline_data?.data) {
        return part.inline_data.data  // base64 image data
      }
    }

    console.warn('[AIImageGen] No image data in response parts')
    return null
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[AIImageGen] Image generation timed out (${timeoutMs}ms)`)
    } else {
      console.warn(`[AIImageGen] Error: ${err.message}`)
    }
    return null
  }
}

/**
 * Fetch a satellite image and return its base64 data.
 * Used to feed the satellite image as context to Gemini for image generation.
 */
async function fetchImageAsBase64(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!resp.ok) return null
    const buffer = await resp.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  } catch {
    return null
  }
}

/**
 * Build a rich context summary from the report for image generation prompts.
 */
function buildReportContext(report: RoofReport): string {
  const prop = report.property || {} as any
  const segments = report.segments || []
  const es = report.edge_summary || {} as any
  const mat = report.materials || {} as any

  const segList = segments.map((s, i) =>
    `Segment ${i + 1} "${s.name}": ${s.true_area_sqft} sqft, pitch ${s.pitch_degrees}°, facing ${s.azimuth_direction || 'unknown'}`
  ).join('; ')

  return `
Property: ${prop.address || 'Unknown'}, ${prop.city || ''}, ${prop.province || 'AB'}
Total Roof Area: ${report.total_true_area_sqft?.toLocaleString()} sqft (${report.total_true_area_sqm} sqm)
Footprint: ${report.total_footprint_sqft?.toLocaleString()} sqft
Pitch: ${report.roof_pitch_degrees}° (${report.roof_pitch_ratio})
Segments: ${segments.length} facets — ${segList}
Edges: Ridge ${es.total_ridge_ft || 0}ft, Hip ${es.total_hip_ft || 0}ft, Valley ${es.total_valley_ft || 0}ft, Eave ${es.total_eave_ft || 0}ft, Rake ${es.total_rake_ft || 0}ft
Material Estimate: ${mat.gross_squares || 0} squares, ${mat.bundle_count || 0} bundles, ${mat.complexity_class || 'standard'} complexity
${report.vision_findings ? `Condition: Heat Score ${report.vision_findings.heat_score?.total || 0}/100, ${report.vision_findings.finding_count || 0} findings, Overall: ${report.vision_findings.overall_condition}` : ''}
`.trim()
}

/**
 * Main entry point: Generate a suite of AI images for the "perfect" report.
 * This runs as a background phase after the base report + enhancement are complete.
 *
 * Generates up to 4 professional images:
 * 1. Annotated Overhead — AI-enhanced satellite view with measurements annotated
 * 2. 3D Perspective Render — Isometric/perspective visualization of the roof structure
 * 3. Condition Assessment — Visual report card showing roof condition
 * 4. Professional Cover — Branded cover image for the report
 */
export async function generateReportImagery(
  report: RoofReport,
  apiKey: string,
  options?: {
    maxImages?: number
    timeoutPerImage?: number
    includeSatellite?: boolean
  }
): Promise<AIImageryResult | null> {
  const startTime = Date.now()
  const maxImages = options?.maxImages || 4
  const timeoutPerImage = options?.timeoutPerImage || 25000
  const includeSatellite = options?.includeSatellite !== false

  const context = buildReportContext(report)
  const images: AIGeneratedImage[] = []

  // Fetch satellite image as base64 for reference
  let satBase64: string | null = null
  if (includeSatellite) {
    const satUrl = report.imagery?.satellite_overhead_url || report.imagery?.satellite_url
    if (satUrl) {
      satBase64 = await fetchImageAsBase64(satUrl)
      if (satBase64) {
        console.log(`[AIImageGen] Satellite image fetched (${Math.round(satBase64.length / 1024)}KB base64)`)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE 1: Annotated Professional Overhead View
  // ═══════════════════════════════════════════════════════════
  if (images.length < maxImages) {
    const prompt1 = `You are a professional architectural visualization artist creating imagery for a roof measurement report.

Based on this satellite image of a residential property, create a clean, professional annotated overhead view of the roof.

Requirements:
- Show the roof from directly overhead (bird's eye view)
- Draw clean, precise measurement lines along the roof edges (ridges, hips, valleys, eaves) in bright contrasting colors
- Use RED lines for ridges, BLUE for hips, GREEN for valleys, YELLOW for eaves
- Add small measurement labels showing footage where visible
- Color-code each roof facet/segment with a semi-transparent overlay (different color per segment)
- Include a clean legend in the bottom-right corner showing the edge types and colors
- Professional quality, suitable for a formal measurement report
- Dark navy blue border around the image
- Text "RoofReporterAI" watermark in top-left, small and professional

Roof measurements context:
${context}

Style: Professional architectural diagram, clean lines, high contrast, measurement-focused. Similar to EagleView or GAF QuickMeasure report imagery.`

    console.log(`[AIImageGen] Generating Image 1: Annotated Overhead...`)
    const img1 = await generateSingleImage(apiKey, prompt1, satBase64, timeoutPerImage)
    if (img1) {
      images.push({
        type: 'annotated_overhead',
        label: 'AI-Enhanced Measurement View',
        description: 'AI-generated annotated overhead view with color-coded edges and measurement lines.',
        data_url: `data:image/png;base64,${img1}`,
        generated_at: new Date().toISOString()
      })
      console.log(`[AIImageGen] ✅ Image 1 generated (${Math.round(img1.length / 1024)}KB)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE 2: 3D Isometric Roof Perspective
  // ═══════════════════════════════════════════════════════════
  if (images.length < maxImages) {
    const segments = report.segments || []
    const segmentDescriptions = segments.map((s, i) =>
      `Segment ${i + 1}: ${s.name}, ${s.true_area_sqft} sqft at ${s.pitch_degrees}° pitch, facing ${s.azimuth_direction || 'unknown'}`
    ).join('\n')

    const prompt2 = `Create a professional 3D isometric architectural rendering of a residential roof structure.

The rendering should show:
- A clean, accurate 3D representation of the roof from a 45-degree isometric angle
- Each roof segment/facet clearly visible with different subtle colors
- Clean white/light gray walls of the house visible below the roofline
- Roof pitch accurately depicted (main pitch: ${report.roof_pitch_degrees}°)
- ${segments.length} distinct roof planes/facets
- Ridge lines, hip lines, and valleys clearly visible as architectural detail
- Soft shadows for depth and realism
- Clean, professional architectural illustration style
- Light blue sky background with subtle gradient
- Small professional compass indicator showing North direction
- Total area label: "${report.total_true_area_sqft?.toLocaleString()} sq ft" in a clean badge

Roof structure details:
${segmentDescriptions}
Total footprint: ${report.total_footprint_sqft?.toLocaleString()} sqft
Ridge: ${report.edge_summary?.total_ridge_ft || 0}ft, Hip: ${report.edge_summary?.total_hip_ft || 0}ft

Style: Clean architectural 3D rendering, professional quality, suitable for a measurement report. Think architectural CAD visualization with soft materials.`

    console.log(`[AIImageGen] Generating Image 2: 3D Perspective...`)
    const img2 = await generateSingleImage(apiKey, prompt2, null, timeoutPerImage)
    if (img2) {
      images.push({
        type: '3d_perspective',
        label: '3D Roof Perspective',
        description: 'AI-generated 3D isometric visualization of the roof structure showing all facets and pitch angles.',
        data_url: `data:image/png;base64,${img2}`,
        generated_at: new Date().toISOString()
      })
      console.log(`[AIImageGen] ✅ Image 2 generated (${Math.round(img2.length / 1024)}KB)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE 3: Roof Condition Assessment Visual
  // ═══════════════════════════════════════════════════════════
  if (images.length < maxImages && report.vision_findings) {
    const vf = report.vision_findings
    const heatScore = vf.heat_score?.total || 0
    const condition = vf.overall_condition || 'unknown'
    const findings = vf.findings || []

    // Pick top 5 most important findings
    const topFindings = findings
      .sort((a: any, b: any) => (b.severity === 'high' ? 3 : b.severity === 'medium' ? 2 : 1) - (a.severity === 'high' ? 3 : a.severity === 'medium' ? 2 : 1))
      .slice(0, 5)
      .map((f: any) => `${f.label}: ${f.description}`)
      .join('\n')

    const conditionColor = heatScore >= 60 ? 'red/orange (needs attention)' : heatScore >= 30 ? 'yellow/amber (monitor)' : 'green (good condition)'

    const prompt3 = `Create a professional "Roof Condition Report Card" infographic.

Design a clean, professional single-page visual report card showing:

TOP SECTION:
- Large circular gauge/meter showing condition score: ${heatScore}/100
- Color: ${conditionColor}
- Overall condition label: "${condition.toUpperCase()}"
- Subtitle: "AI Vision Inspection Results"

MIDDLE SECTION:
- 4 small icons with scores for: Age & Wear (${vf.heat_score?.components?.age_wear || 0}/30), Structural (${vf.heat_score?.components?.structural || 0}/25), Environmental (${vf.heat_score?.components?.environmental || 0}/20), Obstructions (${vf.heat_score?.components?.obstruction_complexity || 0}/15)

BOTTOM SECTION:
- Brief list of key findings:
${topFindings || 'No significant findings detected'}

Style requirements:
- Professional navy blue (#003366) and white color scheme
- Clean, modern infographic design
- Clear hierarchy of information
- Suitable for a formal roof assessment report
- "RoofReporterAI" branding in corner
- Property: ${report.property?.address || 'Residential Property'}

Style: Clean modern infographic, professional report quality, data visualization.`

    console.log(`[AIImageGen] Generating Image 3: Condition Assessment...`)
    const img3 = await generateSingleImage(apiKey, prompt3, null, timeoutPerImage)
    if (img3) {
      images.push({
        type: 'condition_visual',
        label: 'AI Condition Assessment',
        description: `AI-generated visual condition report card showing heat score ${heatScore}/100 and key findings.`,
        data_url: `data:image/png;base64,${img3}`,
        generated_at: new Date().toISOString()
      })
      console.log(`[AIImageGen] ✅ Image 3 generated (${Math.round(img3.length / 1024)}KB)`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // IMAGE 4: Professional Report Cover
  // ═══════════════════════════════════════════════════════════
  if (images.length < maxImages) {
    const prop = report.property || {} as any
    const dateStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

    const prompt4 = `Create a professional cover page image for a "Precision Aerial Roof Measurement Report".

The image should be a sophisticated, modern cover design:

TOP AREA:
- Clean dark navy gradient background (#001a33 to #003366)
- Bold white text: "Precision Aerial Roof Measurement Report"
- Subtitle: "Prepared by RoofReporterAI"

CENTER AREA:
- A beautiful, photorealistic aerial view of a typical Canadian residential home with a visible shingled roof
- The home should look like a well-maintained Alberta suburban residence
- Soft golden hour lighting
- Show the roof clearly from a slight angle (30-40 degrees from overhead)

BOTTOM AREA:
- Clean info bar with:
  - Property: ${prop.address || '123 Residential Ave'}, ${prop.city || 'Calgary'}, ${prop.province || 'AB'}
  - Date: ${dateStr}
  - Total Area: ${report.total_true_area_sqft?.toLocaleString() || '0'} sq ft
  - Roof Facets: ${report.segments?.length || 0}

Design requirements:
- Professional, premium quality feel
- Navy blue and gold accent color scheme
- Clean typography
- 4:3 aspect ratio
- Suitable for PDF report cover page
- Small "Powered by Google Solar API" badge in bottom corner

Style: Premium professional document cover, architectural quality, clean modern design.`

    console.log(`[AIImageGen] Generating Image 4: Report Cover...`)
    const img4 = await generateSingleImage(apiKey, prompt4, satBase64, timeoutPerImage)
    if (img4) {
      images.push({
        type: 'cover',
        label: 'Professional Report Cover',
        description: 'AI-generated professional cover image for the measurement report.',
        data_url: `data:image/png;base64,${img4}`,
        generated_at: new Date().toISOString()
      })
      console.log(`[AIImageGen] ✅ Image 4 generated (${Math.round(img4.length / 1024)}KB)`)
    }
  }

  if (images.length === 0) {
    console.warn('[AIImageGen] No images generated — all attempts failed')
    return null
  }

  const result: AIImageryResult = {
    images,
    generation_time_ms: Date.now() - startTime,
    model: 'gemini-2.0-flash-exp',
    generated_at: new Date().toISOString()
  }

  console.log(`[AIImageGen] ✅ Generated ${images.length}/${maxImages} images in ${result.generation_time_ms}ms`)
  return result
}

/**
 * Build HTML section for AI-generated imagery to inject into the report.
 */
export function buildAIImageryHTML(imagery: AIImageryResult): string {
  if (!imagery || !imagery.images || imagery.images.length === 0) return ''

  const imageCards = imagery.images.map(img => `
    <div style="break-inside:avoid;margin-bottom:16px">
      <div style="border:1px solid #d5dae3;border-radius:4px;overflow:hidden;background:#f0f3f7">
        <img src="${img.data_url}" alt="${img.label}" style="width:100%;display:block;object-fit:contain;max-height:500px" onerror="this.parentElement.style.display='none'">
        <div style="padding:8px 12px;background:#f7f8fa;border-top:1px solid #e5e8ed">
          <div style="font-size:9px;font-weight:700;color:#003366;text-transform:uppercase;letter-spacing:0.5px">${img.label}</div>
          <div style="font-size:8px;color:#64748b;margin-top:2px">${img.description}</div>
        </div>
      </div>
    </div>
  `).join('')

  return `
<!-- ==================== AI-GENERATED IMAGERY PAGE ==================== -->
<div class="page" style="page-break-before:always">
  <div style="background:#002244;padding:10px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:1px">&#10024; AI-GENERATED REPORT IMAGERY</div>
    <div style="color:#7eafd4;font-size:9px;text-align:right">Powered by Gemini AI &bull; ${imagery.model}</div>
  </div>
  <div style="background:#003366;padding:6px 32px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#fff;font-size:10px;font-weight:600">AI-Enhanced Visuals for This Property</div>
    <div style="color:#8eb8db;font-size:9px">Generated: ${new Date(imagery.generated_at).toLocaleDateString('en-CA')} &bull; ${imagery.images.length} images</div>
  </div>

  <div style="padding:12px 32px 50px">
    <div style="font-size:8.5px;color:#4a5568;font-style:italic;margin-bottom:12px">
      The following images were generated by AI based on satellite imagery, measurement data, and inspection findings from this report. 
      They are intended as professional visual supplements and should be used alongside the precise measurement data on previous pages.
    </div>
    ${imageCards}
    <div style="margin-top:8px;padding:6px 10px;background:#f0f4f8;border-radius:4px;font-size:7px;color:#64748b;text-align:center">
      AI imagery generated by ${imagery.model} in ${(imagery.generation_time_ms / 1000).toFixed(1)}s &bull; Images are AI-generated visualizations, not photographs &bull; &copy; ${new Date().getFullYear()} RoofReporterAI
    </div>
  </div>
</div>`
}
