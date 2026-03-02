// ============================================================
// ROVER AI CHATBOT — Backend API Routes
// Live AI chat assistant for RoofReporterAI visitors
// Uses OpenAI-compatible API (via GenSpark proxy) for responses
// Stores every conversation in D1 for admin review
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession } from './auth'

export const roverRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// ROVER SYSTEM PROMPT — Defines Rover's personality & knowledge
// ============================================================
const ROVER_SYSTEM_PROMPT = `You are Rover, the friendly AI assistant for RoofReporterAI — a professional roof measurement report platform for roofing contractors, estimators, and home inspectors across Canada.

IMPORTANT RULES:
1. Start EVERY new conversation with: "Hey! My name is Rover! Your RoofReporterAI expert helper! How can I help you today?"
2. Be friendly, professional, and helpful. Use casual but professional language.
3. Keep responses concise (2-4 sentences max unless the question requires detail).
4. You are a SALES assistant — your goal is to help visitors understand the product and get them to sign up or order a report.
5. NEVER make up pricing, features, or capabilities. Only state what's listed below.
6. If someone asks something you don't know, say "That's a great question! I'd recommend reaching out to our team at reports@reusecanada.ca for that specific info."
7. If a visitor seems interested, encourage them to sign up at /customer/login — they get 3 FREE reports!
8. Try to collect the visitor's name and email naturally during conversation (for lead tracking).

ABOUT ROOFREPORTERAI:
- Professional AI-powered roof measurement reports from satellite imagery
- Powered by Google's Solar API — real satellite data, not estimates
- Reports include: true 3D roof area, pitch analysis, segment breakdown, edge measurements (ridge, hip, valley, eave, rake), full material Bill of Materials (BOM) with Alberta pricing, solar potential analysis
- Reports arrive in less than 1 minute, guaranteed
- Based in Alberta, Canada — serving roofing professionals across Canada

PRICING:
- 3 FREE reports when you sign up (no credit card required)
- After free trial: $8 CAD per Roof Measurement Report (instant delivery)
- Credit packs available for volume discounts
- All payments via secure Stripe checkout

KEY FEATURES:
- Customer Portal: Order reports, view history, download PDFs
- Custom Branding: Add your company logo and colors to reports
- CRM Tools: Manage customers, proposals, invoices, jobs, sales pipeline
- D2D Manager: Door-to-door sales management with map-based territory tracking
- Roofer Secretary: AI phone answering service ($149/month) — answers calls, routes to departments, provides call transcripts
- Blog: Roofing industry insights and tips

WHO IT'S FOR:
- Roofing contractors and estimators
- Home inspectors
- Insurance adjusters
- Real estate professionals
- Solar installers
- Property managers

COMMON QUESTIONS TO HANDLE:
- "How accurate is it?" → Google Solar API with HIGH quality imagery, typically within 2-5% of manual measurements
- "What areas do you cover?" → Most Canadian addresses with Google Solar API coverage. Best coverage in urban Alberta, BC, Ontario, Quebec
- "How fast?" → Reports arrive in less than 1 minute, guaranteed
- "Can I try it free?" → YES! 3 free reports on signup, no credit card needed
- "What's in the report?" → True 3D area, pitch, segments, edge breakdown, material BOM, solar potential, satellite imagery
- "How much?" → $8 CAD per report after free trial. Volume discounts available.

CONTACT INFO:
- Email: reports@reusecanada.ca
- Website: roofing-measurement-tool.pages.dev
- Location: Alberta, Canada

LEAD QUALIFICATION:
- If they mention a company name, number of estimates they do, or specific needs → they're a qualified lead
- If they ask about pricing or volume discounts → they're interested
- If they want to know about API access or white-labeling → they're a high-value lead
- Always try to understand what brought them to the site`

// ============================================================
// PUBLIC ENDPOINTS — No auth required (visitor-facing)
// ============================================================

// POST /api/rover/chat — Send a message to Rover
roverRoutes.post('/chat', async (c) => {
  try {
    const body = await c.req.json()
    const { session_id, message, page_url } = body

    if (!session_id || !message) {
      return c.json({ error: 'session_id and message are required' }, 400)
    }

    // Get or create conversation
    let conversation = await c.env.DB.prepare(
      'SELECT * FROM rover_conversations WHERE session_id = ?'
    ).bind(session_id).first()

    if (!conversation) {
      // Create new conversation
      const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
      const ua = c.req.header('user-agent') || 'unknown'

      await c.env.DB.prepare(`
        INSERT INTO rover_conversations (session_id, visitor_ip, visitor_user_agent, page_url, status, first_message_at, last_message_at)
        VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(session_id, ip, ua, page_url || null).run()

      conversation = await c.env.DB.prepare(
        'SELECT * FROM rover_conversations WHERE session_id = ?'
      ).bind(session_id).first()
    }

    if (!conversation) {
      return c.json({ error: 'Failed to create conversation' }, 500)
    }

    const conversationId = conversation.id as number

    // Store user message
    await c.env.DB.prepare(`
      INSERT INTO rover_messages (conversation_id, role, content)
      VALUES (?, 'user', ?)
    `).bind(conversationId, message).run()

    // Get conversation history (last 20 messages for context)
    const history = await c.env.DB.prepare(`
      SELECT role, content FROM rover_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC 
      LIMIT 20
    `).bind(conversationId).all()

    // Build messages array for OpenAI
    const messages: any[] = [
      { role: 'system', content: ROVER_SYSTEM_PROMPT }
    ]

    // Check if this is the first user message (conversation just started)
    const isFirstMessage = (history.results || []).filter((m: any) => m.role === 'user').length <= 1

    if (isFirstMessage) {
      // Add the greeting as assistant context so Rover knows to greet
      messages.push({
        role: 'assistant',
        content: "Hey! My name is Rover! Your RoofReporterAI expert helper! How can I help you today?"
      })
    }

    // Add conversation history
    for (const msg of (history.results || [])) {
      messages.push({ role: msg.role, content: msg.content })
    }

    // Call OpenAI-compatible API
    const apiKey = c.env.OPENAI_API_KEY
    const baseUrl = c.env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

    if (!apiKey) {
      // Fallback response if no API key
      const fallback = "I appreciate your interest! I'm having a slight technical issue right now. Please visit our website at /customer/login to sign up for 3 free roof measurement reports, or email us at reports@reusecanada.ca. We'll get back to you right away!"
      
      await c.env.DB.prepare(`
        INSERT INTO rover_messages (conversation_id, role, content, model)
        VALUES (?, 'assistant', ?, 'fallback')
      `).bind(conversationId, fallback).run()

      await c.env.DB.prepare(`
        UPDATE rover_conversations SET message_count = message_count + 2, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(conversationId).run()

      return c.json({ reply: fallback, session_id })
    }

    const startTime = Date.now()

    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages,
        max_tokens: 500,
        temperature: 0.7
      })
    })

    const responseTimeMs = Date.now() - startTime

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error('Rover AI error:', aiResponse.status, errText)
      
      const fallback = "I'm having a quick technical hiccup! In the meantime, you can sign up at /customer/login for 3 free reports, or email reports@reusecanada.ca. I'll be back in a moment!"
      
      await c.env.DB.prepare(`
        INSERT INTO rover_messages (conversation_id, role, content, model)
        VALUES (?, 'assistant', ?, 'fallback')
      `).bind(conversationId, fallback).run()

      await c.env.DB.prepare(`
        UPDATE rover_conversations SET message_count = message_count + 2, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(conversationId).run()

      return c.json({ reply: fallback, session_id })
    }

    const aiData: any = await aiResponse.json()
    const reply = aiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that. Can you try again?"
    const tokensUsed = aiData.usage?.total_tokens || 0

    // Store assistant reply
    await c.env.DB.prepare(`
      INSERT INTO rover_messages (conversation_id, role, content, tokens_used, model, response_time_ms)
      VALUES (?, 'assistant', ?, ?, 'gpt-5-mini', ?)
    `).bind(conversationId, reply, tokensUsed, responseTimeMs).run()

    // Update conversation
    await c.env.DB.prepare(`
      UPDATE rover_conversations 
      SET message_count = message_count + 2, 
          last_message_at = CURRENT_TIMESTAMP, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(conversationId).run()

    // Try to extract lead info from the message (simple pattern matching)
    await extractLeadInfo(c.env.DB, conversationId, message)

    return c.json({ reply, session_id })

  } catch (err: any) {
    console.error('Rover chat error:', err)
    return c.json({ error: 'Chat service temporarily unavailable', details: err.message }, 500)
  }
})

// POST /api/rover/end — End a conversation
roverRoutes.post('/end', async (c) => {
  try {
    const { session_id } = await c.req.json()
    if (!session_id) return c.json({ error: 'session_id required' }, 400)

    // Generate summary using AI if conversation has enough messages
    const conversation = await c.env.DB.prepare(
      'SELECT id, message_count FROM rover_conversations WHERE session_id = ?'
    ).bind(session_id).first()

    if (conversation && (conversation.message_count as number) >= 4) {
      // Get all messages for summary
      const msgs = await c.env.DB.prepare(
        'SELECT role, content FROM rover_messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).bind(conversation.id).all()

      const transcript = (msgs.results || [])
        .map((m: any) => `${m.role === 'user' ? 'Visitor' : 'Rover'}: ${m.content}`)
        .join('\n')

      // Generate summary via AI
      const apiKey = c.env.OPENAI_API_KEY
      const baseUrl = c.env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

      if (apiKey) {
        try {
          const summaryRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-5-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Summarize this customer chat conversation in 1-2 sentences. Focus on: what the visitor wanted, whether they seem like a qualified lead, and any contact info they shared. Be concise.'
                },
                { role: 'user', content: transcript }
              ],
              max_tokens: 150,
              temperature: 0.3
            })
          })

          if (summaryRes.ok) {
            const summaryData: any = await summaryRes.json()
            const summary = summaryData.choices?.[0]?.message?.content || null
            if (summary) {
              await c.env.DB.prepare(
                'UPDATE rover_conversations SET summary = ? WHERE session_id = ?'
              ).bind(summary, session_id).run()
            }
          }
        } catch (e) { /* summary generation is best-effort */ }
      }
    }

    await c.env.DB.prepare(`
      UPDATE rover_conversations 
      SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE session_id = ?
    `).bind(session_id).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /api/rover/lead — Visitor voluntarily submits contact info
roverRoutes.post('/lead', async (c) => {
  try {
    const { session_id, name, email, phone, company } = await c.req.json()
    if (!session_id) return c.json({ error: 'session_id required' }, 400)

    const updates: string[] = []
    const values: any[] = []

    if (name) { updates.push('visitor_name = ?'); values.push(name) }
    if (email) { updates.push('visitor_email = ?'); values.push(email) }
    if (phone) { updates.push('visitor_phone = ?'); values.push(phone) }
    if (company) { updates.push('visitor_company = ?'); values.push(company) }

    if (updates.length > 0) {
      updates.push("lead_status = 'qualified'")
      updates.push("lead_score = MAX(lead_score, 60)")
      updates.push('updated_at = CURRENT_TIMESTAMP')
      values.push(session_id)

      await c.env.DB.prepare(
        `UPDATE rover_conversations SET ${updates.join(', ')} WHERE session_id = ?`
      ).bind(...values).run()
    }

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// GET /api/rover/history — Get conversation history for a session (visitor reconnecting)
roverRoutes.get('/history', async (c) => {
  try {
    const sessionId = c.req.query('session_id')
    if (!sessionId) return c.json({ error: 'session_id required' }, 400)

    const conversation = await c.env.DB.prepare(
      'SELECT id, status FROM rover_conversations WHERE session_id = ?'
    ).bind(sessionId).first()

    if (!conversation) return c.json({ messages: [] })

    const msgs = await c.env.DB.prepare(
      'SELECT role, content, created_at FROM rover_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(conversation.id).all()

    return c.json({ 
      messages: msgs.results || [],
      status: conversation.status
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// ADMIN ENDPOINTS — Require admin auth
// ============================================================

// GET /api/rover/admin/conversations — List all conversations
roverRoutes.get('/admin/conversations', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin auth required' }, 401)

  try {
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '25')
    const status = c.req.query('status')
    const leadStatus = c.req.query('lead_status')
    const search = c.req.query('search')
    const offset = (page - 1) * limit

    let where = 'WHERE 1=1'
    const params: any[] = []

    if (status) { where += ' AND rc.status = ?'; params.push(status) }
    if (leadStatus) { where += ' AND rc.lead_status = ?'; params.push(leadStatus) }
    if (search) {
      where += ` AND (rc.visitor_name LIKE ? OR rc.visitor_email LIKE ? OR rc.summary LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    // Get total count
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM rover_conversations rc ${where}`
    ).bind(...params).first()

    // Get conversations
    const conversations = await c.env.DB.prepare(`
      SELECT rc.*, 
        (SELECT content FROM rover_messages WHERE conversation_id = rc.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_user_message
      FROM rover_conversations rc
      ${where}
      ORDER BY rc.last_message_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      conversations: conversations.results || [],
      total: (countResult as any)?.total || 0,
      page,
      limit,
      pages: Math.ceil(((countResult as any)?.total || 0) / limit)
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// GET /api/rover/admin/conversations/:id — Get full conversation with messages
roverRoutes.get('/admin/conversations/:id', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin auth required' }, 401)

  try {
    const id = c.req.param('id')

    const conversation = await c.env.DB.prepare(
      'SELECT * FROM rover_conversations WHERE id = ?'
    ).bind(id).first()

    if (!conversation) return c.json({ error: 'Conversation not found' }, 404)

    const messages = await c.env.DB.prepare(
      'SELECT * FROM rover_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(id).all()

    return c.json({
      conversation,
      messages: messages.results || []
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// PATCH /api/rover/admin/conversations/:id — Update conversation (notes, status, lead_status)
roverRoutes.patch('/admin/conversations/:id', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin auth required' }, 401)

  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { admin_notes, lead_status, tags, status } = body

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const values: any[] = []

    if (admin_notes !== undefined) { updates.push('admin_notes = ?'); values.push(admin_notes) }
    if (lead_status) { updates.push('lead_status = ?'); values.push(lead_status) }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(tags) }
    if (status) { updates.push('status = ?'); values.push(status) }

    values.push(id)

    await c.env.DB.prepare(
      `UPDATE rover_conversations SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// DELETE /api/rover/admin/conversations/:id — Delete a conversation
roverRoutes.delete('/admin/conversations/:id', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin auth required' }, 401)

  try {
    const id = c.req.param('id')

    // Delete messages first, then conversation
    await c.env.DB.prepare('DELETE FROM rover_messages WHERE conversation_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM rover_conversations WHERE id = ?').bind(id).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// GET /api/rover/admin/stats — Dashboard stats for Rover
roverRoutes.get('/admin/stats', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin auth required' }, 401)

  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_conversations,
        SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) as ended_conversations,
        SUM(message_count) as total_messages,
        AVG(message_count) as avg_messages_per_conversation,
        SUM(CASE WHEN lead_status = 'qualified' THEN 1 ELSE 0 END) as qualified_leads,
        SUM(CASE WHEN lead_status = 'converted' THEN 1 ELSE 0 END) as converted_leads,
        SUM(CASE WHEN visitor_email IS NOT NULL THEN 1 ELSE 0 END) as emails_collected,
        SUM(CASE WHEN visitor_phone IS NOT NULL THEN 1 ELSE 0 END) as phones_collected,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as today_conversations,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as week_conversations,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as month_conversations
      FROM rover_conversations
    `).first()

    const tokenStats = await c.env.DB.prepare(`
      SELECT 
        SUM(tokens_used) as total_tokens,
        AVG(response_time_ms) as avg_response_time
      FROM rover_messages 
      WHERE role = 'assistant' AND model != 'fallback'
    `).first()

    // Recent conversations
    const recent = await c.env.DB.prepare(`
      SELECT id, session_id, visitor_name, visitor_email, status, lead_status, 
             message_count, summary, lead_score, created_at, last_message_at
      FROM rover_conversations 
      ORDER BY last_message_at DESC 
      LIMIT 10
    `).all()

    return c.json({
      stats: stats || {},
      token_stats: tokenStats || {},
      recent: recent.results || []
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// HELPER: Extract lead info from user messages
// ============================================================
async function extractLeadInfo(db: D1Database, conversationId: number, message: string) {
  try {
    // Simple email extraction
    const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w{2,}/i)
    if (emailMatch) {
      await db.prepare(
        'UPDATE rover_conversations SET visitor_email = ?, lead_status = ?, lead_score = MAX(lead_score, 70), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND visitor_email IS NULL'
      ).bind(emailMatch[0], 'qualified', conversationId).run()
    }

    // Simple phone extraction (North American format)
    const phoneMatch = message.match(/(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)?[2-9]\d{2}[-.\s]?\d{4}/)
    if (phoneMatch) {
      await db.prepare(
        'UPDATE rover_conversations SET visitor_phone = ?, lead_score = MAX(lead_score, 60), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND visitor_phone IS NULL'
      ).bind(phoneMatch[0], conversationId).run()
    }

    // Detect company mentions (simple heuristic)
    const companyKeywords = /(?:my company|our company|i work (?:for|at)|we are|our business|our firm)\s+(?:is\s+)?([A-Z][\w\s&.-]+)/i
    const companyMatch = message.match(companyKeywords)
    if (companyMatch) {
      await db.prepare(
        'UPDATE rover_conversations SET visitor_company = ?, lead_score = MAX(lead_score, 65), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND visitor_company IS NULL'
      ).bind(companyMatch[1].trim(), conversationId).run()
    }

    // Boost lead score for buying signals
    const buyingSignals = /(?:pricing|cost|price|discount|volume|bulk|how much|sign up|trial|free|estimate|quote|order)/i
    if (buyingSignals.test(message)) {
      await db.prepare(
        'UPDATE rover_conversations SET lead_score = MIN(lead_score + 10, 100), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(conversationId).run()
    }
  } catch (e) {
    // Lead extraction is best-effort, don't break the chat
  }
}
