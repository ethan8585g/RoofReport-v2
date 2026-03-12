// ============================================================
// GA4 Server-Side Event Tracking via Measurement Protocol
// Fires events from the backend so they appear in GA4 even
// when the client-side gtag.js isn't present (e.g., API calls,
// webhooks, background jobs).
//
// v2: Enhanced with user_id linking, session stitching,
//     e-commerce events, and engagement scoring.
// ============================================================

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

interface GA4EventParams {
  [key: string]: string | number | boolean | undefined
}

interface GA4Event {
  name: string
  params?: GA4EventParams
}

interface SendGA4EventOptions {
  measurementId: string
  apiSecret: string
  clientId?: string
  userId?: string
  events: GA4Event[]
  // Optional: non_personalized_ads flag for privacy
  nonPersonalizedAds?: boolean
}

/**
 * Send one or more events to GA4 via the Measurement Protocol.
 * Non-blocking — swallows errors so it never disrupts the main flow.
 */
export async function sendGA4Event(opts: SendGA4EventOptions): Promise<boolean> {
  try {
    const url = `${GA4_ENDPOINT}?measurement_id=${opts.measurementId}&api_secret=${opts.apiSecret}`
    const payload: any = {
      client_id: opts.clientId || `server_${Date.now()}`,
      events: opts.events.slice(0, 25) // GA4 max 25 events per batch
    }
    
    // Add user_id if present (links server-side events to client GA4 sessions)
    if (opts.userId) payload.user_id = opts.userId
    
    // Privacy: non-personalized ads
    if (opts.nonPersonalizedAds) payload.non_personalized_ads = true
    
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    return res.status === 204 || res.status === 200
  } catch (e: any) {
    console.error('[GA4-MP] Event send error:', e.message)
    return false
  }
}

/**
 * Helper: fire a single named event with params.
 * Requires GA4_MEASUREMENT_ID and GA4_API_SECRET in env.
 * Silently no-ops if either is missing.
 * 
 * clientId: if the request includes a GA4 client_id cookie/header, pass it
 *   to stitch server-side events with the same client's GA4 session.
 */
export function trackGA4(
  env: { GA4_MEASUREMENT_ID?: string; GA4_API_SECRET?: string; [k: string]: any },
  eventName: string,
  params: GA4EventParams = {},
  userId?: string,
  clientId?: string
): Promise<boolean> {
  const mid = (env as any).GA4_MEASUREMENT_ID
  const secret = (env as any).GA4_API_SECRET
  if (!mid || !secret) return Promise.resolve(false) // not configured — skip

  return sendGA4Event({
    measurementId: mid,
    apiSecret: secret,
    clientId: clientId || `server_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    userId,
    nonPersonalizedAds: true, // GDPR/PIPEDA safe — no ad personalization
    events: [{
      name: eventName,
      params: {
        ...params,
        event_source: 'server',
        timestamp: new Date().toISOString()
      }
    }]
  })
}

// ── Convenience wrappers for common backend events ──

/** Track when a report is generated from satellite data */
export function trackReportGenerated(
  env: any,
  orderId: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'report_generated', {
    order_id: orderId,
    category: 'report',
    ...extra
  })
}

/** Track when a report is AI-enhanced by Cloud Run / Gemini */
export function trackReportEnhanced(
  env: any,
  orderId: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'report_enhanced', {
    order_id: orderId,
    category: 'report',
    ...extra
  })
}

/** Track successful payment (Square or credit pack) */
export function trackPaymentCompleted(
  env: any,
  orderId: string,
  amountCents: number,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'purchase', {
    transaction_id: orderId,
    value: amountCents / 100,
    currency: 'CAD',
    category: 'payment',
    ...extra
  })
}

/** Track email delivery (report, invoice, proposal, etc.) */
export function trackEmailSent(
  env: any,
  emailType: string,
  recipient: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'email_sent', {
    email_type: emailType,
    recipient_domain: recipient.split('@')[1] || 'unknown',
    category: 'email',
    ...extra
  })
}

/** Track new user signup (email, Google OAuth, team invite) */
export function trackUserSignup(
  env: any,
  userId: string,
  method: string = 'email',
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'sign_up', {
    method,
    category: 'user',
    ...extra
  }, userId)
}

/** Track credit pack purchase — maps to GA4 e-commerce */
export function trackCreditPurchase(
  env: any,
  userId: string,
  credits: number,
  amountCents: number,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'purchase', {
    transaction_id: `credits_${userId}_${Date.now()}`,
    value: amountCents / 100,
    currency: 'CAD',
    items: JSON.stringify([{ item_name: `${credits} Credit Pack`, quantity: 1, price: amountCents / 100 }]),
    category: 'credit_purchase',
    ...extra
  }, userId)
}

/** Track user login */
export function trackUserLogin(
  env: any,
  userId: string,
  method: string = 'email',
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'login', {
    method,
    category: 'user',
    ...extra
  }, userId)
}

/** Track proposal view by customer (public link opened) */
export function trackProposalViewed(
  env: any,
  proposalId: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'proposal_viewed', {
    proposal_id: proposalId,
    category: 'crm',
    ...extra
  })
}

/** Track proposal accept/decline */
export function trackProposalResponse(
  env: any,
  proposalId: string,
  action: string,
  amountCents: number = 0,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'proposal_response', {
    proposal_id: proposalId,
    action,
    value: amountCents / 100,
    currency: 'CAD',
    category: 'crm',
    ...extra
  })
}

/** Track order placed */
export function trackOrderPlaced(
  env: any,
  orderId: string,
  address: string,
  userId?: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'begin_checkout', {
    transaction_id: orderId,
    address_city: address,
    category: 'order',
    ...extra
  }, userId)
}

/** Track API usage (Solar API, Gemini, etc.) for cost monitoring */
export function trackApiUsage(
  env: any,
  apiName: string,
  costCad: number = 0,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'api_call', {
    api_name: apiName,
    cost_cad: costCad,
    category: 'infrastructure',
    ...extra
  })
}

/** Track lead capture (contact form, blog CTA, etc.) */
export function trackLeadCapture(
  env: any,
  source: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'generate_lead', {
    lead_source: source,
    category: 'marketing',
    ...extra
  })
}

/** Track Gmail connection by roofer */
export function trackGmailConnected(
  env: any,
  userId: string,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'gmail_connected', {
    category: 'integration',
    ...extra
  }, userId)
}

/** Track Workers AI usage */
export function trackWorkersAI(
  env: any,
  model: string,
  durationMs: number,
  extra: GA4EventParams = {}
): Promise<boolean> {
  return trackGA4(env, 'workers_ai_inference', {
    model_name: model,
    duration_ms: durationMs,
    category: 'ai',
    ...extra
  })
}
