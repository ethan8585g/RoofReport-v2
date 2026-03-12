// ============================================================
// RoofReporterAI — Cloudflare Workers AI Enhancement Routes
// Edge-side AI for image classification, measurement validation,
// report quality checks, and imagery cleanup.
// Uses Cloudflare Workers AI binding (AI) — runs at the edge,
// no external API calls needed, included in Workers plan.
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession } from './auth'
import { resolveTeamOwner } from './team'

export const workersAiRoutes = new Hono<{ Bindings: Bindings }>()

// Auth helper — accepts both admin and customer tokens
async function getAuthUser(c: any): Promise<{ id: number; role: string } | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)

  // Try admin session first
  const admin = await validateAdminSession(c.env.DB, `Bearer ${token}`)
  if (admin) return { id: admin.id, role: 'admin' }

  // Try customer session
  const cust = await c.env.DB.prepare(
    "SELECT cs.customer_id FROM customer_sessions cs WHERE cs.session_token=? AND cs.expires_at>datetime('now')"
  ).bind(token).first<any>()
  if (cust) return { id: cust.customer_id, role: 'customer' }

  return null
}

// Middleware: require auth
workersAiRoutes.use('/*', async (c, next) => {
  const user = await getAuthUser(c)
  if (!user) return c.json({ error: 'Authentication required' }, 401)
  c.set('user' as any, user)
  return next()
})

// ============================================================
// POST /classify-roof — Classify roof type from satellite image
// Uses @cf/microsoft/resnet-50 for image classification
// ============================================================
workersAiRoutes.post('/classify-roof', async (c) => {
  try {
    const { image_url } = await c.req.json()
    if (!image_url) return c.json({ error: 'image_url is required' }, 400)

    const AI = (c.env as any).AI
    if (!AI) return c.json({ error: 'Workers AI binding not configured' }, 500)

    const startTime = Date.now()

    // Fetch the image
    const imgResp = await fetch(image_url)
    if (!imgResp.ok) return c.json({ error: `Failed to fetch image: ${imgResp.status}` }, 400)
    const imageBytes = await imgResp.arrayBuffer()

    // Run classification
    const result = await AI.run('@cf/microsoft/resnet-50', {
      image: [...new Uint8Array(imageBytes)]
    })

    const duration = Date.now() - startTime

    // Map to roofing-relevant categories
    const roofingCategories = categorizeForRoofing(result)

    return c.json({
      status: 'success',
      model: '@cf/microsoft/resnet-50',
      duration_ms: duration,
      classifications: result,
      roofing_analysis: roofingCategories,
      image_url
    })
  } catch (e: any) {
    console.error('[Workers AI] classify-roof error:', e.message)
    return c.json({ error: 'Classification failed', details: e.message }, 500)
  }
})

// ============================================================
// POST /analyze-image — Vision analysis of roof imagery
// Uses @cf/llava-hf/llava-1.5-7b-hf for multimodal understanding
// ============================================================
workersAiRoutes.post('/analyze-image', async (c) => {
  try {
    const { image_url, prompt } = await c.req.json()
    if (!image_url) return c.json({ error: 'image_url is required' }, 400)

    const AI = (c.env as any).AI
    if (!AI) return c.json({ error: 'Workers AI binding not configured' }, 500)

    const startTime = Date.now()

    // Fetch the image
    const imgResp = await fetch(image_url)
    if (!imgResp.ok) return c.json({ error: `Failed to fetch image: ${imgResp.status}` }, 400)
    const imageBytes = new Uint8Array(await imgResp.arrayBuffer())

    const analysisPrompt = prompt || `Analyze this satellite/aerial image of a residential roof. Identify:
1. Roof type (gable, hip, flat, mansard, gambrel, shed, combination)
2. Visible damage or wear (missing shingles, moss, staining, sagging)
3. Obstructions (chimneys, vents, skylights, HVAC units, satellite dishes)
4. Shingle material and approximate age
5. Any tree overhangs or debris
6. Overall condition rating (excellent, good, fair, poor, critical)
Provide a brief professional assessment suitable for a roofing report.`

    const result = await AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...imageBytes],
      prompt: analysisPrompt,
      max_tokens: 512
    })

    const duration = Date.now() - startTime

    return c.json({
      status: 'success',
      model: '@cf/llava-hf/llava-1.5-7b-hf',
      duration_ms: duration,
      analysis: result?.description || result?.response || result,
      image_url
    })
  } catch (e: any) {
    console.error('[Workers AI] analyze-image error:', e.message)
    return c.json({ error: 'Image analysis failed', details: e.message }, 500)
  }
})

// ============================================================
// POST /verify-measurements — AI double-check of measurements
// Uses @cf/meta/llama-3-8b-instruct for mathematical verification
// ============================================================
workersAiRoutes.post('/verify-measurements', async (c) => {
  try {
    const { report_data } = await c.req.json()
    if (!report_data) return c.json({ error: 'report_data is required' }, 400)

    const AI = (c.env as any).AI
    if (!AI) return c.json({ error: 'Workers AI binding not configured' }, 500)

    const startTime = Date.now()

    // Build verification prompt
    const r = report_data
    const prompt = `You are a professional roofing measurement auditor. Verify these roof measurements for mathematical consistency:

ROOF MEASUREMENTS:
- Total footprint area: ${r.total_footprint_sqft || 'N/A'} sq ft
- Total true (sloped) area: ${r.total_true_area_sqft || 'N/A'} sq ft
- Area multiplier: ${r.area_multiplier || 'N/A'}
- Roof pitch: ${r.roof_pitch_degrees || 'N/A'} degrees (${r.roof_pitch_ratio || 'N/A'})
- Number of segments: ${r.segments?.length || 0}
${r.segments ? r.segments.map((s: any, i: number) =>
  `  Segment ${i+1}: ${s.name} — footprint ${s.footprint_area_sqft} sqft, true area ${s.true_area_sqft} sqft, pitch ${s.pitch_degrees}°`
).join('\n') : ''}

EDGE SUMMARY:
- Ridge: ${r.edge_summary?.total_ridge_ft || 'N/A'} ft
- Hip: ${r.edge_summary?.total_hip_ft || 'N/A'} ft
- Valley: ${r.edge_summary?.total_valley_ft || 'N/A'} ft
- Eave: ${r.edge_summary?.total_eave_ft || 'N/A'} ft
- Rake: ${r.edge_summary?.total_rake_ft || 'N/A'} ft

MATERIALS:
- Gross squares: ${r.materials?.gross_squares || 'N/A'}
- Bundle count: ${r.materials?.bundle_count || 'N/A'}
- Waste %: ${r.materials?.waste_pct || 'N/A'}%

Please verify:
1. Is area_multiplier correct for the given pitch? (multiplier = 1/cos(pitch_radians))
2. Do segment areas sum to total?
3. Is bundle count correct? (3 bundles per square)
4. Is waste factor reasonable for this complexity?
5. Are edge totals reasonable for this building size?

Respond in JSON format:
{
  "overall_valid": true/false,
  "confidence": 0-100,
  "issues": [{"field": "...", "expected": "...", "actual": "...", "severity": "low/medium/high"}],
  "recommendations": ["..."],
  "summary": "Brief assessment"
}`

    const result = await AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a roofing measurement verification expert. Always respond in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.1
    })

    const duration = Date.now() - startTime

    // Try to parse the JSON response
    let verification: any = null
    try {
      const responseText = result?.response || ''
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        verification = JSON.parse(jsonMatch[0])
      }
    } catch (parseErr) {
      verification = { raw_response: result?.response, parse_error: 'Could not parse JSON from AI response' }
    }

    return c.json({
      status: 'success',
      model: '@cf/meta/llama-3-8b-instruct',
      duration_ms: duration,
      verification: verification || { raw_response: result?.response },
      report_summary: {
        address: r.property?.address || 'Unknown',
        total_area_sqft: r.total_true_area_sqft,
        pitch: r.roof_pitch_ratio,
        segments: r.segments?.length || 0
      }
    })
  } catch (e: any) {
    console.error('[Workers AI] verify-measurements error:', e.message)
    return c.json({ error: 'Measurement verification failed', details: e.message }, 500)
  }
})

// ============================================================
// POST /enhance-report-text — AI polish for report narratives
// Uses @cf/meta/llama-3-8b-instruct to improve text quality
// ============================================================
workersAiRoutes.post('/enhance-report-text', async (c) => {
  try {
    const { text, context, tone } = await c.req.json()
    if (!text) return c.json({ error: 'text is required' }, 400)

    const AI = (c.env as any).AI
    if (!AI) return c.json({ error: 'Workers AI binding not configured' }, 500)

    const startTime = Date.now()

    const toneGuide = tone || 'professional, concise, technical'
    const prompt = `Improve this roofing report text to be more ${toneGuide}. Keep all measurements and facts exactly as stated. Do not add information that isn't present. Just improve clarity, grammar, and professionalism.

${context ? `Context: ${context}\n` : ''}
Original text:
${text}

Provide only the improved text, no explanations.`

    const result = await AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a professional technical writer specializing in roofing reports. Improve text quality while preserving all technical details and measurements exactly.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })

    const duration = Date.now() - startTime

    return c.json({
      status: 'success',
      model: '@cf/meta/llama-3-8b-instruct',
      duration_ms: duration,
      original: text,
      enhanced: result?.response?.trim() || text
    })
  } catch (e: any) {
    console.error('[Workers AI] enhance-text error:', e.message)
    return c.json({ error: 'Text enhancement failed', details: e.message }, 500)
  }
})

// ============================================================
// POST /assess-condition — Quick roof condition from single image
// Combines classification + vision for a rapid assessment
// ============================================================
workersAiRoutes.post('/assess-condition', async (c) => {
  try {
    const { image_url, order_id } = await c.req.json()
    if (!image_url) return c.json({ error: 'image_url is required' }, 400)

    const AI = (c.env as any).AI
    if (!AI) return c.json({ error: 'Workers AI binding not configured' }, 500)

    const startTime = Date.now()

    // Fetch image once
    const imgResp = await fetch(image_url)
    if (!imgResp.ok) return c.json({ error: `Failed to fetch image: ${imgResp.status}` }, 400)
    const imageBytes = new Uint8Array(await imgResp.arrayBuffer())
    const imageArray = [...imageBytes]

    // Run classification and vision in parallel
    const [classResult, visionResult] = await Promise.allSettled([
      AI.run('@cf/microsoft/resnet-50', { image: imageArray }),
      AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        image: imageArray,
        prompt: 'Describe this roof image briefly. Note: roof type, approximate condition (1-10), visible damage, material type, and any concerns. Be concise.',
        max_tokens: 256
      })
    ])

    const duration = Date.now() - startTime

    const classification = classResult.status === 'fulfilled' ? classResult.value : null
    const vision = visionResult.status === 'fulfilled' ? visionResult.value : null

    // Store assessment if order_id provided
    if (order_id) {
      try {
        await c.env.DB.prepare(`
          UPDATE reports SET ai_status = 'assessed', updated_at = datetime('now') WHERE order_id = ?
        `).bind(order_id).run()
      } catch (e) { /* ignore */ }
    }

    return c.json({
      status: 'success',
      duration_ms: duration,
      classification: classification ? categorizeForRoofing(classification) : null,
      vision_assessment: vision?.description || vision?.response || null,
      image_url,
      order_id: order_id || null
    })
  } catch (e: any) {
    console.error('[Workers AI] assess-condition error:', e.message)
    return c.json({ error: 'Condition assessment failed', details: e.message }, 500)
  }
})

// ============================================================
// GET /status — Check Workers AI binding availability
// ============================================================
workersAiRoutes.get('/status', async (c) => {
  const AI = (c.env as any).AI
  return c.json({
    available: !!AI,
    binding: 'AI',
    models: {
      classification: '@cf/microsoft/resnet-50',
      vision: '@cf/llava-hf/llava-1.5-7b-hf',
      text: '@cf/meta/llama-3-8b-instruct'
    },
    capabilities: [
      'classify-roof — Image classification for roof type detection',
      'analyze-image — Vision-based damage/obstruction detection',
      'verify-measurements — AI double-check of roof math',
      'enhance-report-text — Polish report narratives',
      'assess-condition — Quick combined assessment'
    ]
  })
})

// ============================================================
// Helper: Map ResNet-50 classifications to roofing categories
// ============================================================
function categorizeForRoofing(classifications: any[]): any {
  if (!Array.isArray(classifications)) return { raw: classifications }

  const roofTypes = ['roof', 'tile', 'shingle', 'slate', 'metal', 'house', 'building', 'dome', 'thatch']
  const damageIndicators = ['rust', 'crack', 'broken', 'damaged', 'decay', 'moss', 'mold', 'stain']
  const obstructions = ['chimney', 'antenna', 'satellite', 'solar', 'panel', 'vent', 'pipe']

  const topLabels = classifications.slice(0, 10).map((c: any) => ({
    label: c.label || c.name || '',
    score: c.score || c.confidence || 0
  }))

  const roofRelevant = topLabels.filter((l: any) =>
    roofTypes.some(t => l.label.toLowerCase().includes(t))
  )

  const damageRelevant = topLabels.filter((l: any) =>
    damageIndicators.some(d => l.label.toLowerCase().includes(d))
  )

  const obstructionRelevant = topLabels.filter((l: any) =>
    obstructions.some(o => l.label.toLowerCase().includes(o))
  )

  return {
    top_predictions: topLabels.slice(0, 5),
    roof_type_indicators: roofRelevant,
    damage_indicators: damageRelevant,
    obstruction_indicators: obstructionRelevant,
    is_roof_image: roofRelevant.length > 0 || topLabels.some((l: any) =>
      ['house', 'building', 'church', 'barn', 'palace', 'castle'].some(t => l.label.toLowerCase().includes(t))
    )
  }
}
