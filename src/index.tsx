import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getAccessToken, getProjectId, getServiceAccountEmail } from './services/gcp-auth'
import { trackProposalViewed } from './services/ga4-events'
import { ordersRoutes } from './routes/orders'
import { companiesRoutes } from './routes/companies'
import { settingsRoutes } from './routes/settings'
import { reportsRoutes } from './routes/reports'
import { adminRoutes } from './routes/admin'
import { aiAnalysisRoutes } from './routes/ai-analysis'
import { authRoutes } from './routes/auth'
import { customerAuthRoutes } from './routes/customer-auth'
import { invoiceRoutes } from './routes/invoices'
import { squareRoutes } from './routes/square'
import { crmRoutes } from './routes/crm'
import { propertyImageryRoutes } from './routes/property-imagery'
import { blogRoutes } from './routes/blog'
import { d2dRoutes } from './routes/d2d'
import { secretaryRoutes } from './routes/secretary'
import { roverRoutes } from './routes/rover'
import { emailOutreachRoutes } from './routes/email-outreach'
import { analyticsRoutes } from './routes/analytics'
import { virtualTryonRoutes } from './routes/virtual-tryon'
import { teamRoutes } from './routes/team'
import { agentsRoutes } from './routes/agents'
import { workersAiRoutes } from './routes/workers-ai'
import { reportImagesRoutes } from './routes/report-images'
import { callCenterRoutes } from './routes/call-center'
import { metaConnectRoutes } from './routes/meta-connect'
import { heygenRoutes } from './routes/heygen'
import { aiAdminChatRoutes } from './routes/ai-admin-chat'
import { pipelineRoutes } from './routes/pipeline'
import { stripeRoutes } from './routes/stripe'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API routes
app.use('/api/*', cors())

// Cache control for static JS/CSS — prevent stale browser cache
app.use('/static/*', async (c, next) => {
  await next()
  // Short cache with must-revalidate so browsers check for fresh versions
  c.header('Cache-Control', 'public, max-age=300, must-revalidate')
})

// Analytics tracker injection middleware — auto-injects tracker.js + GA4 gtag.js into HTML pages
// Skips API routes, static files, and the tracker itself
// Enhanced for maximum tracking accuracy: consent mode, enhanced measurement, cross-domain, user ID linking
app.use('*', async (c, next) => {
  await next()
  
  // Only inject into HTML responses for non-API, non-static paths
  const contentType = c.res.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return
  
  const url = new URL(c.req.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/static/')) return
  
  try {
    const body = await c.res.text()
    if (body.includes('</body>') && !body.includes('tracker.js')) {
      // Build GA4 gtag.js snippet if measurement ID is configured
      const ga4Id = (c.env as any).GA4_MEASUREMENT_ID || ''
      const ga4Script = ga4Id ? `
<!-- Google Analytics 4 — Enhanced Configuration for Maximum Accuracy -->
<script>
// Consent Mode v2 — default grants (no cookie banner needed for analytics-only in Canada)
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  'analytics_storage':'granted',
  'ad_storage':'denied',
  'ad_user_data':'denied',
  'ad_personalization':'denied',
  'functionality_storage':'granted',
  'security_storage':'granted'
});
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script>
<script>
gtag('js',new Date());
gtag('config','${ga4Id}',{
  // Page view & session settings
  send_page_view: true,
  cookie_flags: 'SameSite=None;Secure',
  cookie_domain: 'auto',
  cookie_expires: 63072000, // 2 years
  
  // Enhanced measurement — GA4 auto-tracks these when enabled:
  // scrolls, outbound clicks, site search, video engagement, file downloads
  // We enable all for maximum data capture
  
  // Session settings for accuracy
  session_timeout: 1800, // 30 minutes (default)
  
  // Page metadata for better reports
  page_title: document.title,
  page_location: window.location.href,
  page_referrer: document.referrer,
  
  // Content grouping
  content_group: (function(){
    var p = location.pathname;
    if (p === '/') return 'Landing';
    if (p.startsWith('/customer/dashboard')) return 'Dashboard';
    if (p.startsWith('/customer/login')) return 'Auth';
    if (p.startsWith('/signup')) return 'Signup';
    if (p.startsWith('/customer/order')) return 'Order';
    if (p.startsWith('/customer/')) return 'CRM';
    if (p.startsWith('/portal')) return 'Portal';
    if (p.startsWith('/service-invoice')) return 'ServiceInvoice';
    if (p.startsWith('/blog')) return 'Blog';
    if (p.startsWith('/pricing')) return 'Pricing';
    if (p.startsWith('/lander')) return 'Lander';
    if (p.startsWith('/proposal/')) return 'Proposal';
    if (p.startsWith('/admin') || p.startsWith('/super-admin')) return 'Admin';
    if (p.startsWith('/login')) return 'Admin Auth';
    return 'Other';
  })(),
  
  // Custom dimensions
  custom_map: {
    'dimension1': 'user_type',
    'dimension2': 'content_group'
  }
});

// Link GA4 client_id to our internal visitor for cross-referencing
gtag('get','${ga4Id}','client_id',function(cid){
  if(cid) {
    window.__ga4ClientId = cid;
    sessionStorage.setItem('_rc_ga4_cid', cid);
  }
});

// Set user ID if logged in (links client-side & server-side events)
(function(){
  try {
    var c = localStorage.getItem('rc_customer');
    if (c) {
      var u = JSON.parse(c);
      if (u && u.id) {
        gtag('set', 'user_id', String(u.id));
        gtag('set', 'user_properties', {
          user_type: 'customer',
          account_tier: u.tier || 'free'
        });
      }
    }
    var a = localStorage.getItem('rc_user');
    if (a) {
      var au = JSON.parse(a);
      if (au && au.id) {
        gtag('set', 'user_id', 'admin_' + au.id);
        gtag('set', 'user_properties', { user_type: 'admin' });
      }
    }
  } catch(e) {}
})();
</script>` : ''
      
      const injected = body.replace('</body>', `${ga4Script}\n<script src="/static/tracker.js?v=${BUILD_VERSION}" defer></script>\n</body>`)
      c.res = new Response(injected, {
        status: c.res.status,
        headers: c.res.headers
      })
    }
  } catch(e) {
    // If body read fails, pass through original response
  }
})

// Mount API routes
app.route('/api/orders', ordersRoutes)
app.route('/api/companies', companiesRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/ai-admin', aiAdminChatRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/ai', aiAnalysisRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/customer', customerAuthRoutes)
app.route('/api/invoices', invoiceRoutes)
app.route('/api/pipeline', pipelineRoutes)
app.route('/api/stripe', stripeRoutes)
app.route('/api/square', squareRoutes)
app.route('/api/crm', crmRoutes)
app.route('/api/property-imagery', propertyImageryRoutes)
app.route('/api/blog', blogRoutes)
app.route('/api/d2d', d2dRoutes)
// Public agent-config endpoint — called by LiveKit agent worker (no auth)
app.get('/api/secretary/agent-config/:customerId', async (c) => {
  const customerId = parseInt(c.req.param('customerId'), 10)
  if (!customerId || isNaN(customerId)) {
    return c.json({ success: false, error: 'Invalid customer ID' }, 400)
  }
  try {
    const config = await c.env.DB.prepare(
      `SELECT customer_id, business_phone, greeting_script, common_qa, general_notes,
              agent_name, agent_voice, agent_language, secretary_mode,
              answering_fallback_action, answering_forward_number,
              full_can_book_appointments, full_can_send_email, full_can_schedule_callback,
              full_can_answer_faq, full_business_hours, full_services_offered,
              full_pricing_info, full_service_area, id as config_id
       FROM secretary_config WHERE customer_id = ?`
    ).bind(customerId).first<any>()
    if (!config) return c.json({ success: false, error: 'Not found' }, 404)

    let directories: any[] = []
    if (config.config_id) {
      const dirs = await c.env.DB.prepare(
        `SELECT name, phone_or_action, special_notes FROM secretary_directories WHERE config_id = ? ORDER BY sort_order`
      ).bind(config.config_id).all<any>()
      directories = dirs.results || []
    }
    return c.json({
      success: true,
      config: {
        customer_id: config.customer_id,
        business_phone: config.business_phone,
        greeting_script: config.greeting_script || '',
        common_qa: config.common_qa || '',
        general_notes: config.general_notes || '',
        agent_name: config.agent_name || 'Sarah',
        agent_voice: config.agent_voice || 'alloy',
        secretary_mode: config.secretary_mode || 'full',
        directories,
      }
    })
  } catch (err: any) {
    return c.json({ success: false, error: 'Server error' }, 500)
  }
})

// Secretary webhook endpoints — called by LiveKit agent (no auth required)
app.post('/api/secretary/webhook/message', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, caller_name, caller_phone, message, urgency } = body
    if (!customer_id) return c.json({ error: 'customer_id required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_messages (customer_id, caller_name, caller_phone, message_text, urgency, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
    ).bind(customer_id, caller_name || '', caller_phone || '', message || '', urgency || 'normal').run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/secretary/webhook/appointment', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, caller_name, caller_phone, property_address, service_type, notes } = body
    if (!customer_id) return c.json({ error: 'customer_id required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_appointments (customer_id, caller_name, caller_phone, property_address, service_type, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).bind(customer_id, caller_name || '', caller_phone || '', property_address || '', service_type || '', notes || '').run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/secretary/webhook/call-complete', async (c) => {
  try {
    const body = await c.req.json()
    const { customer_id, room_name, caller_name, caller_phone, messages_taken } = body
    if (!customer_id) return c.json({ error: 'customer_id required' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO secretary_call_logs (customer_id, room_name, caller_name, caller_phone, outcome, notes, created_at)
       VALUES (?, ?, ?, ?, 'completed', ?, datetime('now'))`
    ).bind(customer_id, room_name || '', caller_name || '', caller_phone || '', JSON.stringify(messages_taken || [])).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.route('/api/secretary', secretaryRoutes)
app.route('/api/rover', roverRoutes)
app.route('/api/email-outreach', emailOutreachRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/virtual-tryon', virtualTryonRoutes)
app.route('/api/team', teamRoutes)
app.route('/api/agents', agentsRoutes)
app.route('/api/workers-ai', workersAiRoutes)
app.route('/api/report-images', reportImagesRoutes)
app.route('/api/call-center', callCenterRoutes)
app.route('/api/meta', metaConnectRoutes)
app.route('/api/heygen', heygenRoutes)

// Health check
app.get('/api/health', (c) => {
  // Report which env vars are configured (true/false only — never expose values)
  return c.json({
    status: 'ok',
    service: 'RoofReporterAI - Business Management CRM',
    timestamp: new Date().toISOString(),
    env_configured: {
      GOOGLE_SOLAR_API_KEY: !!c.env.GOOGLE_SOLAR_API_KEY,
      GOOGLE_MAPS_API_KEY: !!c.env.GOOGLE_MAPS_API_KEY,
      GOOGLE_VERTEX_API_KEY: !!c.env.GOOGLE_VERTEX_API_KEY,
      GOOGLE_CLOUD_PROJECT: !!c.env.GOOGLE_CLOUD_PROJECT,
      GOOGLE_CLOUD_LOCATION: !!c.env.GOOGLE_CLOUD_LOCATION,
      GOOGLE_CLOUD_ACCESS_TOKEN: !!c.env.GOOGLE_CLOUD_ACCESS_TOKEN,
      GCP_SERVICE_ACCOUNT_KEY: !!c.env.GCP_SERVICE_ACCOUNT_KEY,
      SQUARE_ACCESS_TOKEN: !!c.env.SQUARE_ACCESS_TOKEN,
      SQUARE_APPLICATION_ID: !!c.env.SQUARE_APPLICATION_ID,
      SQUARE_LOCATION_ID: !!c.env.SQUARE_LOCATION_ID,
      GMAIL_SENDER_EMAIL: c.env.GMAIL_SENDER_EMAIL || '(not set)',
      GMAIL_CLIENT_ID: !!(c.env as any).GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET: !!(c.env as any).GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN: !!(c.env as any).GMAIL_REFRESH_TOKEN,
      RESEND_API_KEY: !!(c.env as any).RESEND_API_KEY,
      SQUARE_WEBHOOK_SIGNATURE_KEY: !!(c.env as any).SQUARE_WEBHOOK_SIGNATURE_KEY,
      LIVEKIT_API_KEY: !!(c.env as any).LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET: !!(c.env as any).LIVEKIT_API_SECRET,
      LIVEKIT_URL: !!(c.env as any).LIVEKIT_URL,
      LIVEKIT_SIP_URI: !!(c.env as any).LIVEKIT_SIP_URI,
      TWILIO_ACCOUNT_SID: !!(c.env as any).TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: !!(c.env as any).TWILIO_AUTH_TOKEN,
      OPENAI_API_KEY: !!(c.env as any).OPENAI_API_KEY,
      OPENAI_BASE_URL: !!(c.env as any).OPENAI_BASE_URL,
      CLOUD_RUN_AI_URL: (c.env as any).CLOUD_RUN_AI_URL || 'https://collab-581996238660.europe-west1.run.app',
      CLOUD_RUN_AI_TOKEN: !!(c.env as any).CLOUD_RUN_AI_TOKEN,
      REPORT_WEBHOOK_SECRET: !!(c.env as any).REPORT_WEBHOOK_SECRET,
      AI_STUDIO_ENHANCE_URL: (c.env as any).AI_STUDIO_ENHANCE_URL || false,
      GEMINI_ENHANCE_API_KEY: !!(c.env as any).GEMINI_ENHANCE_API_KEY,
      GA4_MEASUREMENT_ID: (c.env as any).GA4_MEASUREMENT_ID || false,
      GA4_API_SECRET: !!(c.env as any).GA4_API_SECRET,
      GA4_PROPERTY_ID: (c.env as any).GA4_PROPERTY_ID || false,
      DB: !!c.env.DB,
      AI: !!(c.env as any).AI
    },
    workers_ai: {
      available: !!(c.env as any).AI,
      endpoints: ['/api/workers-ai/classify-roof', '/api/workers-ai/analyze-image', '/api/workers-ai/verify-measurements', '/api/workers-ai/enhance-report-text', '/api/workers-ai/assess-condition']
    },
    analytics: {
      ga4_client_tracking: !!(c.env as any).GA4_MEASUREMENT_ID,
      ga4_server_events: !!((c.env as any).GA4_MEASUREMENT_ID && (c.env as any).GA4_API_SECRET),
      ga4_data_api: !!((c.env as any).GA4_PROPERTY_ID && c.env.GCP_SERVICE_ACCOUNT_KEY),
      ga4_realtime: !!((c.env as any).GA4_PROPERTY_ID && c.env.GCP_SERVICE_ACCOUNT_KEY),
      internal_d1_tracking: !!c.env.DB,
      tracker_js: true,
      tracked_events: ['pageview', 'click', 'scroll_milestone', 'engagement_milestone', 'form_start', 'form_submit', 'page_exit', 'web_vitals', 'cta_click', 'outbound_click', 'js_error'],
      server_events: ['sign_up', 'login', 'purchase', 'report_generated', 'report_enhanced', 'email_sent', 'generate_lead', 'proposal_viewed', 'proposal_response', 'workers_ai_inference', 'api_call', 'gmail_connected']
    },
    vertex_ai: {
      mode: c.env.GCP_SERVICE_ACCOUNT_KEY ? 'service_account_auto' :
            c.env.GOOGLE_CLOUD_ACCESS_TOKEN ? 'vertex_ai_platform' :
            (c.env.GOOGLE_VERTEX_API_KEY ? 'gemini_rest_api' : 'not_configured'),
      project: c.env.GOOGLE_CLOUD_PROJECT || getProjectId(c.env.GCP_SERVICE_ACCOUNT_KEY || '') || null,
      location: c.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      service_account: getServiceAccountEmail(c.env.GCP_SERVICE_ACCOUNT_KEY || '') || null
    }
  })
})

// Diagnostic: Test Google Solar API connectivity
app.get('/api/health/solar', async (c) => {
  try {
    const solarKey = c.env.GOOGLE_SOLAR_API_KEY
    const mapsKey = c.env.GOOGLE_MAPS_API_KEY
    const results: any = {
      timestamp: new Date().toISOString(),
      keys_configured: {
        solar_api_key: !!solarKey,
        solar_key_prefix: solarKey ? solarKey.substring(0, 8) + '...' : null,
        maps_api_key: !!mapsKey,
        maps_key_prefix: mapsKey ? mapsKey.substring(0, 8) + '...' : null
      },
      tests: {}
    }

    // Test 1: Solar buildingInsights API (Calgary downtown)
    if (solarKey) {
      try {
        const biUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=51.0447&location.longitude=-114.0719&requiredQuality=HIGH&key=${solarKey}`
        const biResp = await fetch(biUrl)
        if (biResp.ok) {
          const biData: any = await biResp.json()
          results.tests.building_insights = {
            status: 'ok',
            http_status: biResp.status,
            roof_area_m2: biData.solarPotential?.wholeRoofStats?.areaMeters2 || 0,
            segments: biData.solarPotential?.roofSegmentStats?.length || 0,
            imagery_quality: biData.imageryQuality || 'unknown'
          }
        } else {
          const errText = await biResp.text()
          results.tests.building_insights = {
            status: 'error',
            http_status: biResp.status,
            error: errText.substring(0, 500),
            fix: biResp.status === 403
              ? 'API key may have IP/referrer restrictions. Cloudflare Workers have no static IP — remove all restrictions from the key in Google Cloud Console.'
              : biResp.status === 400
              ? 'Bad request — check if Solar API is enabled in Google Cloud Console.'
              : 'Check API key and billing in Google Cloud Console.'
          }
        }
      } catch (e: any) {
        results.tests.building_insights = { status: 'network_error', error: e.message }
      }

      // Test 2: Solar DataLayers API
      try {
        const dlUrl = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=51.0447&location.longitude=-114.0719&radiusMeters=50&view=FULL_LAYERS&requiredQuality=HIGH&pixelSizeMeters=0.5&key=${solarKey}`
        const dlResp = await fetch(dlUrl)
        if (dlResp.ok) {
          const dlData: any = await dlResp.json()
          results.tests.data_layers = {
            status: 'ok',
            http_status: dlResp.status,
            has_dsm: !!dlData.dsmUrl,
            has_mask: !!dlData.maskUrl,
            has_rgb: !!dlData.rgbUrl,
            imagery_quality: dlData.imageryQuality || 'unknown'
          }
        } else {
          const errText = await dlResp.text()
          results.tests.data_layers = { status: 'error', http_status: dlResp.status, error: errText.substring(0, 500) }
        }
      } catch (e: any) {
        results.tests.data_layers = { status: 'network_error', error: e.message }
      }
    } else {
      results.tests.building_insights = { status: 'skipped', reason: 'GOOGLE_SOLAR_API_KEY not configured' }
      results.tests.data_layers = { status: 'skipped', reason: 'GOOGLE_SOLAR_API_KEY not configured' }
    }

    // Test 3: Maps Geocoding API
    if (mapsKey || solarKey) {
      try {
        const geoKey = mapsKey || solarKey
        const geoResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Calgary+AB+Canada&key=${geoKey}`)
        const geoData: any = await geoResp.json()
        results.tests.geocoding = {
          status: geoData.status === 'OK' ? 'ok' : 'error',
          api_status: geoData.status,
          error_message: geoData.error_message || null
        }
      } catch (e: any) {
        results.tests.geocoding = { status: 'network_error', error: e.message }
      }
    }

    const allOk = Object.values(results.tests).every((t: any) => t.status === 'ok')
    results.overall = allOk ? 'all_apis_working' : 'some_issues_detected'

    return c.json(results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Diagnostic: Test Gemini API connectivity (service account → access token → API key)
app.get('/api/health/gemini', async (c) => {
  try {
    let authHeader = ''
    let authMode = ''
    let url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

    // Priority 1: Service Account Key (auto-generates access token)
    if (c.env.GCP_SERVICE_ACCOUNT_KEY) {
      const token = await getAccessToken(c.env.GCP_SERVICE_ACCOUNT_KEY)
      authHeader = `Bearer ${token}`
      authMode = 'service_account_auto'
    }
    // Priority 2: Static access token
    else if (c.env.GOOGLE_CLOUD_ACCESS_TOKEN) {
      authHeader = `Bearer ${c.env.GOOGLE_CLOUD_ACCESS_TOKEN}`
      authMode = 'access_token'
    }
    // Priority 3: API key
    else if (c.env.GOOGLE_VERTEX_API_KEY) {
      authMode = 'api_key'
      url += `?key=${c.env.GOOGLE_VERTEX_API_KEY}`
    }
    else {
      return c.json({ status: 'error', message: 'No Gemini credentials configured', fix: 'Set GCP_SERVICE_ACCOUNT_KEY, GOOGLE_CLOUD_ACCESS_TOKEN, or GOOGLE_VERTEX_API_KEY' }, 400)
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authHeader) headers['Authorization'] = authHeader

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with exactly: OK' }] }] })
    })

    if (response.ok) {
      const data: any = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return c.json({
        status: 'ok',
        model: 'gemini-2.0-flash',
        auth_mode: authMode,
        response: text.trim(),
        project: getProjectId(c.env.GCP_SERVICE_ACCOUNT_KEY || '') || c.env.GOOGLE_CLOUD_PROJECT || null,
        service_account: getServiceAccountEmail(c.env.GCP_SERVICE_ACCOUNT_KEY || '') || null
      })
    }

    const errData: any = await response.json().catch(() => ({}))
    const errMsg = errData?.error?.message || `HTTP ${response.status}`
    return c.json({ status: 'error', auth_mode: authMode, http_status: response.status, message: errMsg }, response.status as any)

  } catch (err: any) {
    return c.json({ status: 'error', message: err.message, fix: 'Network or auth error' }, 500)
  }
})

// ============================================================
// SERVER-SIDE CONFIG ENDPOINT
// Returns ONLY publishable/safe values to the frontend.
// Secret keys (Google Solar, Square Access Token) stay server-side.
// ============================================================
app.get('/api/config/client', (c) => {
  // Only expose keys that are designed to be public (publishable keys)
  // Google Maps JS API key is loaded via script tag — that's how Google designed it
  // Square Application ID is safe for frontend use (like Stripe publishable key)
  return c.json({
    google_maps_key: c.env.GOOGLE_MAPS_API_KEY || '',
    square_application_id: c.env.SQUARE_APPLICATION_ID || '',
    square_location_id: c.env.SQUARE_LOCATION_ID || '',
    // Feature flags based on which keys are configured
    features: {
      google_maps: !!c.env.GOOGLE_MAPS_API_KEY,
      google_solar: !!c.env.GOOGLE_SOLAR_API_KEY,
      square_payments: !!c.env.SQUARE_ACCESS_TOKEN && !!c.env.SQUARE_APPLICATION_ID,
      self_service_orders: !!c.env.SQUARE_ACCESS_TOKEN
    }
  })
})

// ============================================================
// PAGES - Full HTML served from Hono (server-side rendering)
// Google Maps API key is injected server-side into the script tag.
// Secret keys (Solar API, Square Access Token) are NEVER in HTML.
// ============================================================

// Landing / Marketing page
app.get('/', (c) => {
  return c.html(getLandingPageHTML())
})

// /order redirect — users may type /order directly
app.get('/order', (c) => c.redirect('/customer/order'))

// Order Form page (new route)
app.get('/order/new', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getMainPageHTML(mapsKey))
})

// Super Admin Dashboard (post-login landing)
app.get('/super-admin', (c) => {
  return c.html(getSuperAdminDashboardHTML())
})

// Admin Dashboard (legacy + operational)
app.get('/admin', (c) => {
  return c.html(getAdminPageHTML())
})

// Order Confirmation Page
app.get('/order/:id', (c) => {
  return c.html(getOrderConfirmationHTML())
})

// Settings Page (API Keys)
app.get('/settings', (c) => {
  return c.html(getSettingsPageHTML())
})

// Login/Register Page (Admin)
app.get('/login', (c) => {
  return c.html(getLoginPageHTML())
})

// Customer Login/Register Page (email/password)
app.get('/customer/login', (c) => {
  return c.html(getCustomerLoginHTML())
})

// Signup Wizard — 3-step onboarding (Business Info → Plan → Activate)
app.get('/signup', (c) => {
  return c.html(getSignupWizardHTML())
})

// Customer Dashboard
app.get('/customer/dashboard', (c) => {
  return c.html(getCustomerDashboardHTML())
})

// Customer Invoice View
app.get('/customer/invoice/:id', (c) => {
  return c.html(getCustomerInvoiceHTML())
})

// Pricing Page (public)
app.get('/pricing', (c) => {
  return c.html(getPricingPageHTML())
})

// Blog Pages (public — SEO lead funnels)
app.get('/blog', (c) => {
  return c.html(getBlogListingHTML())
})
app.get('/blog/:slug', (c) => {
  return c.html(getBlogPostHTML())
})

// Landing Funnel — Social media & blog traffic funnels here
app.get('/lander', (c) => {
  return c.html(getLanderFunnelHTML())
})

// Customer Order & Pay page
app.get('/customer/order', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getCustomerOrderPageHTML(mapsKey))
})

// Property Imagery — Dev account only
app.get('/customer/property-imagery', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getPropertyImageryPageHTML(mapsKey))
})

// Customer CRM sub-pages
app.get('/customer/reports', (c) => c.html(getCrmSubPageHTML('reports', 'Roof Report History', 'fa-file-alt')))
app.get('/customer/customers', (c) => c.html(getCrmSubPageHTML('customers', 'My Customers', 'fa-users')))
app.get('/customer/invoices', (c) => c.html(getCrmSubPageHTML('invoices', 'Invoices', 'fa-file-invoice-dollar')))
app.get('/customer/proposals', (c) => c.html(getCrmSubPageHTML('proposals', 'Proposals & Estimates', 'fa-file-signature')))
app.get('/customer/jobs', (c) => c.html(getCrmSubPageHTML('jobs', 'Job Management', 'fa-hard-hat')))
app.get('/customer/pipeline', (c) => c.html(getCrmSubPageHTML('pipeline', 'Sales Pipeline', 'fa-funnel-dollar')))

// Virtual Try-On — AI Roof Visualization
app.get('/customer/virtual-tryon', (c) => c.html(getVirtualTryOnPageHTML()))

// Team Management — Add/manage sales team members ($50/user/month)
app.get('/customer/team', (c) => c.html(getTeamManagementPageHTML()))

// Join Team — Accept invitation (public landing with auth redirect)
app.get('/customer/join-team', (c) => c.html(getJoinTeamPageHTML()))

// ============================================================
// 3D ROOF VISUALIZER — Interactive roofing sales tool
// ============================================================
app.get('/visualizer/:orderId', async (c) => {
  const orderId = c.req.param('orderId')
  let address = 'Customer Property'
  let lat = '', lng = ''
  try {
    const order = await c.env.DB.prepare(
      'SELECT property_address, latitude, longitude FROM orders WHERE id = ?'
    ).bind(orderId).first<any>()
    if (order) {
      address = order.property_address || address
      lat = order.latitude || ''
      lng = order.longitude || ''
    }
  } catch {}
  const googleKey = (c.env as any).GOOGLE_MAPS_API_KEY || ''

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3D Roof Visualizer — ${address}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link href="/static/css/visualizer.css" rel="stylesheet">

<!-- Three.js + OrbitControls via CDN (ES5 UMD build for compatibility) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
  // OrbitControls inline (from Three.js r128 examples - UMD compatible)
  // This must come after THREE is loaded
</script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.min.js"></script>
</head>
<body class="bg-slate-900 text-white overflow-hidden">

<div id="vis-container">
  <!-- Header Bar -->
  <div id="vis-header" class="absolute top-0 left-0 right-0 z-20 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/customer/reports" class="text-gray-400 hover:text-white transition-colors">
        <i class="fas fa-arrow-left"></i>
      </a>
      <div>
        <h1 class="text-sm font-bold text-white"><i class="fas fa-cube mr-1 text-blue-400"></i>3D Roof Visualizer</h1>
        <p class="text-[10px] text-gray-400">${address}</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span id="vis-current-color" class="text-xs text-gray-400 hidden md:inline mr-2">Onyx Black (shingle)</span>
      <button onclick="toggleAutoRotate()" id="btn-auto-rotate" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-all"><i class="fas fa-pause mr-1"></i>Pause</button>
      <button onclick="resetCamera()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-all"><i class="fas fa-sync mr-1"></i>Reset</button>
      <button onclick="takeScreenshot()" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-all"><i class="fas fa-camera mr-1"></i>Screenshot</button>
      <button onclick="shareVisualization()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-all"><i class="fas fa-share mr-1"></i>Share</button>
    </div>
  </div>

  <!-- Main Canvas Area -->
  <div class="flex flex-1 pt-[52px]" style="height: calc(100vh - 52px)">
    <!-- 3D Canvas -->
    <div id="canvas-3d" class="flex-1 relative" style="display:flex">
      <div class="vis-loader" id="vis-3d-loader">
        <div class="vis-spinner"></div>
        <p style="color:#94a3b8;font-size:13px;margin-top:12px">Initializing 3D engine...</p>
      </div>
    </div>
    <!-- 2D Canvas (hidden by default) -->
    <div id="canvas-2d" class="flex-1 relative" style="display:none"></div>

    <!-- Right Panel: Color Swatches -->
    <div id="vis-panel">
      <!-- Mode Tabs -->
      <div class="flex border-b border-slate-700">
        <button class="vis-tab active" data-mode="3d" onclick="switchVisMode('3d')"><i class="fas fa-cube mr-1"></i>3D Model</button>
        <button class="vis-tab" data-mode="2d" onclick="switchVisMode('2d')"><i class="fas fa-image mr-1"></i>Street View</button>
      </div>

      <div class="p-4 space-y-5 overflow-y-auto flex-1">
        <!-- Shingles Section -->
        <div>
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            <i class="fas fa-layer-group mr-1 text-amber-400"></i>Asphalt Shingles
          </h3>
          <div class="swatch-grid" id="shingle-swatches"></div>
        </div>

        <div class="border-t border-slate-700"></div>

        <!-- Metal Section -->
        <div>
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            <i class="fas fa-shield-alt mr-1 text-blue-400"></i>Sheet Metal
          </h3>
          <div class="swatch-grid" id="metal-swatches"></div>
        </div>

        <div class="border-t border-slate-700"></div>

        <!-- Info Cards -->
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h4 class="text-xs font-bold text-gray-300 mb-2"><i class="fas fa-info-circle mr-1 text-blue-400"></i>How It Works</h4>
          <ul class="text-[10px] text-gray-500 space-y-1.5 leading-relaxed">
            <li><i class="fas fa-mouse-pointer mr-1 text-gray-600"></i>Click & drag to rotate the house</li>
            <li><i class="fas fa-search-plus mr-1 text-gray-600"></i>Scroll to zoom in/out</li>
            <li><i class="fas fa-palette mr-1 text-gray-600"></i>Click any color swatch to preview</li>
            <li><i class="fas fa-camera mr-1 text-gray-600"></i>Take screenshots to share with customers</li>
          </ul>
        </div>

        <div class="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-800/30">
          <p class="text-[10px] text-blue-300 font-medium">
            <i class="fas fa-magic mr-1"></i>Pro Tip: Use the screenshot tool to include color previews in your proposals. Customers love seeing their home with new roofing before committing!
          </p>
        </div>

        <p class="text-center text-[9px] text-gray-600 pb-2">Powered by RoofReporterAI</p>
      </div>
    </div>
  </div>
</div>

<script src="/static/js/3d_visualizer.js?v=${BUILD_VERSION}"></script>
<script>
  // Initialize with report data
  document.addEventListener('DOMContentLoaded', function() {
    initVisualizer({
      order_id: '${orderId}',
      address: '${address.replace(/'/g, "\\'")}',
      latitude: '${lat}',
      longitude: '${lng}',
      google_maps_key: '${googleKey}'
    });
  });
</script>
</body>
</html>`)
})

// ============================================================
// PUBLIC TIERED PROPOSAL COMPARISON — Good/Better/Best side-by-side
// ============================================================
app.get('/proposal/compare/:groupId', async (c) => {
  try {
    const groupId = c.req.param('groupId')
    
    // Get all proposals in this group
    const proposalsResult = await c.env.DB.prepare(`
      SELECT cp.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone,
             cc.address as customer_address, cc.city as customer_city, cc.province as customer_province, cc.postal_code as customer_postal
      FROM crm_proposals cp
      LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id
      WHERE cp.proposal_group_id = ?
      ORDER BY cp.tier_order ASC
    `).bind(groupId).all<any>()

    const proposals = proposalsResult.results || []
    if (proposals.length === 0) {
      return c.html(`<!DOCTYPE html><html><head><title>Proposals Not Found</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="text-center"><div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i></div><h1 class="text-2xl font-bold text-gray-800 mb-2">Proposals Not Found</h1><p class="text-gray-500">This proposal link is invalid or has expired.</p></div></body></html>`)
    }

    // Increment view counts
    for (const p of proposals) {
      await c.env.DB.prepare(
        "UPDATE crm_proposals SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = datetime('now'), status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = ?"
      ).bind(p.id).run()
    }

    // Track view
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const ua = c.req.header('user-agent') || ''
    for (const p of proposals) {
      try { await c.env.DB.prepare('INSERT INTO proposal_view_log (proposal_id, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?)').bind(p.id, ip, ua.substring(0, 500), '').run() } catch {}
    }

    // Get owner branding
    const owner = await c.env.DB.prepare(
      'SELECT name, email, phone, brand_business_name, brand_logo_url, brand_primary_color, brand_secondary_color, brand_tagline, brand_phone, brand_email, brand_website, brand_address, brand_license_number, brand_insurance_info FROM customers WHERE id = ?'
    ).bind(proposals[0].owner_id).first<any>()

    const businessName = owner?.brand_business_name || owner?.name || 'RoofReporterAI'
    const primaryColor = owner?.brand_primary_color || '#0369a1'
    const secondaryColor = owner?.brand_secondary_color || '#0ea5e9'
    const brandPhone = owner?.brand_phone || owner?.phone || ''
    const brandEmail = owner?.brand_email || owner?.email || ''
    const brandWebsite = owner?.brand_website || ''
    const brandAddress = owner?.brand_address || ''
    const brandLicense = owner?.brand_license_number || ''
    const brandInsurance = owner?.brand_insurance_info || ''
    const brandTagline = owner?.brand_tagline || ''
    const logoUrl = owner?.brand_logo_url || ''
    const customerName = proposals[0].customer_name || 'Customer'
    const fullAddress = [proposals[0].property_address, proposals[0].customer_city, proposals[0].customer_province, proposals[0].customer_postal].filter(Boolean).join(', ')
    const proposalDate = proposals[0].created_at ? new Date(proposals[0].created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
    const validUntil = proposals[0].valid_until ? new Date(proposals[0].valid_until).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

    // Get line items for each
    const proposalsWithItems = []
    for (const p of proposals) {
      const itemsResult = await c.env.DB.prepare('SELECT * FROM crm_proposal_items WHERE proposal_id = ? ORDER BY sort_order').bind(p.id).all()
      proposalsWithItems.push({ ...p, items: itemsResult.results || [] })
    }

    const anyAccepted = proposals.some((p: any) => p.status === 'accepted')
    const anyDeclined = proposals.some((p: any) => p.status === 'declined')
    const isResponded = anyAccepted || anyDeclined

    // Tier badge config — 3 qualities of roofing shingles
    const tierConfig: Record<string, any> = {
      'Good': { icon: 'fa-star', color: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', gradient: 'from-blue-500 to-blue-600', desc: '25-Year 3-Tab Shingles — Standard flat-profile shingles. Proven, economical protection with manufacturer warranty.' },
      'Better': { icon: 'fa-medal', color: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', gradient: 'from-purple-500 to-purple-600', popular: true, desc: '30-Year Architectural — Dimensional laminate shingles with 130 km/h wind rating, thicker profile, and enhanced curb appeal.' },
      'Best': { icon: 'fa-crown', color: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', gradient: 'from-amber-500 to-amber-600', desc: '50-Year Designer / Luxury — Class 4 impact-resistant, 210 km/h wind rating, ice & water shield, limited lifetime warranty.' }
    }

    // Build tier cards HTML
    let tierCardsHtml = ''
    for (const p of proposalsWithItems) {
      const tier = tierConfig[p.tier_label] || tierConfig['Good']
      const isPopular = tier.popular
      const pAccepted = p.status === 'accepted'
      const pDeclined = p.status === 'declined'
      
      let itemsList = ''
      for (const it of p.items as any[]) {
        itemsList += `<li class="flex justify-between py-2 border-b border-gray-50 text-sm">
          <span class="text-gray-600">${it.description}</span>
          <span class="font-medium text-gray-800">$${parseFloat(it.amount).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </li>`
      }

      tierCardsHtml += `
      <div class="relative ${isPopular ? 'md:-mt-4 md:mb-4' : ''}" data-tier="${p.tier_label}">
        ${isPopular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 z-10"><span class="bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg uppercase tracking-wider"><i class="fas fa-fire mr-1"></i>Most Popular</span></div>' : ''}
        <div class="bg-white rounded-2xl shadow-lg ${isPopular ? 'ring-2 ring-purple-400 shadow-purple-100' : 'border border-gray-200'} overflow-hidden h-full flex flex-col ${pAccepted ? 'ring-2 ring-green-400' : ''} ${pDeclined ? 'opacity-60' : ''}">
          <!-- Tier Header -->
          <div class="bg-gradient-to-r ${tier.gradient} px-6 py-5 text-white text-center">
            <i class="fas ${tier.icon} text-2xl mb-2 opacity-80"></i>
            <h3 class="text-xl font-bold">${p.tier_label}</h3>
            <p class="text-white/70 text-xs mt-1">${tier.desc}</p>
          </div>
          
          <!-- Price -->
          <div class="px-6 py-5 text-center border-b border-gray-100">
            <p class="text-4xl font-black text-gray-800">$${parseFloat(p.total_amount).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p class="text-xs text-gray-400 mt-1">Total incl. ${p.tax_rate || 5}% GST</p>
          </div>

          <!-- Line Items -->
          <div class="px-6 py-4 flex-1">
            <ul class="space-y-0">${itemsList}</ul>
            <div class="mt-4 pt-3 border-t border-gray-200 space-y-1 text-sm">
              <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>$${parseFloat(p.subtotal || 0).toFixed(2)}</span></div>
              <div class="flex justify-between text-gray-500"><span>Tax (${p.tax_rate || 5}% GST)</span><span>$${parseFloat(p.tax_amount || 0).toFixed(2)}</span></div>
              <div class="flex justify-between font-bold text-gray-800 pt-1 border-t border-gray-200"><span>Total</span><span>$${parseFloat(p.total_amount).toFixed(2)} CAD</span></div>
            </div>
          </div>

          <!-- Action -->
          <div class="px-6 pb-6">
            ${pAccepted ? `
              <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <i class="fas fa-check-circle text-green-500 text-2xl mb-1"></i>
                <p class="font-bold text-green-700 text-sm">Accepted</p>
                ${p.accepted_at ? `<p class="text-green-500 text-xs mt-0.5">${new Date(p.accepted_at).toLocaleDateString('en-CA')}</p>` : ''}
              </div>
            ` : pDeclined ? `
              <div class="bg-gray-100 rounded-xl p-4 text-center">
                <p class="font-bold text-gray-500 text-sm">Declined</p>
              </div>
            ` : `
              <button onclick="selectTier('${p.share_token}', '${p.tier_label}', ${parseFloat(p.total_amount).toFixed(2)})" class="w-full bg-gradient-to-r ${tier.gradient} hover:opacity-90 text-white py-3.5 rounded-xl font-bold text-sm transition-all hover:shadow-lg select-btn" data-token="${p.share_token}">
                <i class="fas fa-check-circle mr-2"></i>Select ${p.tier_label} Package
              </button>
            `}
          </div>
        </div>
      </div>`
    }

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roofing Proposal — ${businessName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @media print { .no-print { display: none !important; } body { background: white; } }
    .brand-gradient { background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor}); }
    .brand-text { color: ${primaryColor}; }
    .signature-pad { border: 2px dashed #d1d5db; border-radius: 12px; height: 100px; cursor: crosshair; touch-action: none; }
    .signature-pad.active { border-color: ${primaryColor}; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Top bar -->
  <div class="no-print fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-200">
    <div class="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
      <span class="text-sm text-gray-500"><i class="fas fa-file-signature mr-1"></i>Roofing Proposal</span>
      <button onclick="window.print()" class="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"><i class="fas fa-print mr-1"></i>Print</button>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-4 pt-16 pb-12">
    <!-- Company Header -->
    <div class="brand-gradient rounded-2xl px-8 py-8 text-white relative overflow-hidden mb-8">
      <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32"></div>
      <div class="relative z-10 flex flex-col md:flex-row items-start justify-between gap-4">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" class="h-14 mb-3 rounded-lg bg-white/20 p-1">` : ''}
          <h1 class="text-2xl md:text-3xl font-bold">${businessName}</h1>
          ${brandTagline ? `<p class="text-white/70 text-sm mt-1">${brandTagline}</p>` : ''}
        </div>
        <div class="text-right text-sm space-y-0.5 text-white/80">
          ${brandPhone ? `<p><i class="fas fa-phone mr-1.5"></i>${brandPhone}</p>` : ''}
          ${brandEmail ? `<p><i class="fas fa-envelope mr-1.5"></i>${brandEmail}</p>` : ''}
          ${brandWebsite ? `<p><i class="fas fa-globe mr-1.5"></i>${brandWebsite}</p>` : ''}
          ${brandAddress ? `<p class="mt-2 text-white/60"><i class="fas fa-map-marker-alt mr-1.5"></i>${brandAddress}</p>` : ''}
        </div>
      </div>
    </div>

    <!-- Customer Info Bar -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-5 mb-8">
      <div class="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Prepared For</p>
          <p class="text-xl font-bold text-gray-800">${customerName}</p>
          ${fullAddress ? `<p class="text-sm text-gray-500 mt-1"><i class="fas fa-map-marker-alt mr-1 text-red-400"></i>${fullAddress}</p>` : ''}
        </div>
        <div class="text-right space-y-1">
          ${proposalDate ? `<p class="text-xs text-gray-400">Issued: ${proposalDate}</p>` : ''}
          ${validUntil ? `<p class="text-xs text-gray-400">Valid Until: ${validUntil}</p>` : ''}
        </div>
      </div>
    </div>

    <!-- Section Title -->
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-gray-800">Choose Your Roofing Package</h2>
      <p class="text-gray-500 mt-2 max-w-xl mx-auto">We've prepared three options to fit your budget and protection needs. All packages include professional installation, cleanup, and warranty.</p>
    </div>

    <!-- Tier Cards -->
    <div class="grid md:grid-cols-${proposals.length} gap-6 mb-8 items-start">
      ${tierCardsHtml}
    </div>

    <!-- Signature + Confirm Modal -->
    <div id="confirmModal" class="hidden fixed inset-0 bg-black/50 z-[100] flex items-center justify-center no-print">
      <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8">
        <h3 class="text-xl font-bold text-gray-800 mb-2 text-center">Confirm Your Selection</h3>
        <p class="text-center text-gray-500 text-sm mb-1">You selected the <strong id="selectedTierName" class="text-gray-800"></strong> package</p>
        <p class="text-center text-2xl font-black brand-text mb-6" id="selectedTierPrice"></p>
        
        <!-- Signature -->
        <div class="mb-5">
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Signature (optional)</label>
          <canvas id="signaturePad" class="signature-pad w-full bg-white" width="600" height="100"></canvas>
          <div class="flex justify-end mt-1">
            <button onclick="clearSignature()" class="text-xs text-gray-400 hover:text-gray-600"><i class="fas fa-eraser mr-1"></i>Clear</button>
          </div>
        </div>

        <div class="flex gap-3">
          <button onclick="confirmAccept()" id="confirmBtn" class="flex-1 brand-gradient text-white py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90">
            <i class="fas fa-check-circle mr-2"></i>Accept & Proceed
          </button>
          <button onclick="closeModal()" class="px-6 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm">Cancel</button>
        </div>
      </div>
    </div>

    ${isResponded ? '' : `
    <!-- Decline All -->
    <div class="text-center mb-8 no-print">
      <button onclick="declineAll()" class="text-sm text-gray-400 hover:text-gray-600 underline">Not interested? Decline all options</button>
    </div>`}

    <!-- Footer -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div class="grid md:grid-cols-3 gap-6 text-center">
        <div><i class="fas fa-shield-alt text-green-500 text-2xl mb-2"></i><h4 class="font-bold text-gray-700 text-sm">Fully Insured</h4><p class="text-xs text-gray-400">Licensed, bonded & insured</p></div>
        <div><i class="fas fa-certificate text-blue-500 text-2xl mb-2"></i><h4 class="font-bold text-gray-700 text-sm">Warranty Included</h4><p class="text-xs text-gray-400">Manufacturer + workmanship warranty</p></div>
        <div><i class="fas fa-broom text-purple-500 text-2xl mb-2"></i><h4 class="font-bold text-gray-700 text-sm">Full Cleanup</h4><p class="text-xs text-gray-400">Magnetic nail sweep + debris haul</p></div>
      </div>
    </div>

    ${brandLicense || brandInsurance ? `
    <div class="text-center text-xs text-gray-400 space-y-0.5">
      ${brandLicense ? `<p><i class="fas fa-id-card mr-1"></i>License: ${brandLicense}</p>` : ''}
      ${brandInsurance ? `<p><i class="fas fa-shield-alt mr-1"></i>${brandInsurance}</p>` : ''}
    </div>` : ''}
    <div class="text-center mt-4 text-xs text-gray-400"><p>Powered by <span class="font-semibold">RoofReporterAI</span></p></div>
  </div>

  <script>
    var selectedToken = null;
    var selectedTier = null;
    var selectedPrice = 0;

    // Signature pad
    var canvas, ctx, drawing = false, hasSignature = false;
    function initSignaturePad() {
      canvas = document.getElementById('signaturePad');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = 200;
      ctx.scale(2, 2);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      function getPos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - r.top }; }
      canvas.addEventListener('mousedown', function(e) { drawing = true; ctx.beginPath(); var p = getPos(e); ctx.moveTo(p.x, p.y); });
      canvas.addEventListener('mousemove', function(e) { if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSignature = true; });
      canvas.addEventListener('mouseup', function() { drawing = false; });
      canvas.addEventListener('mouseleave', function() { drawing = false; });
      canvas.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; ctx.beginPath(); var p = getPos(e); ctx.moveTo(p.x, p.y); });
      canvas.addEventListener('touchmove', function(e) { e.preventDefault(); if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSignature = true; });
      canvas.addEventListener('touchend', function() { drawing = false; });
    }

    function clearSignature() { if (ctx && canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); hasSignature = false; } }

    function selectTier(token, tierName, price) {
      selectedToken = token;
      selectedTier = tierName;
      selectedPrice = price;
      document.getElementById('selectedTierName').textContent = tierName;
      document.getElementById('selectedTierPrice').textContent = '$' + parseFloat(price).toLocaleString('en-CA', { minimumFractionDigits: 2 }) + ' CAD';
      document.getElementById('confirmModal').classList.remove('hidden');
      setTimeout(initSignaturePad, 100);
    }

    function closeModal() { document.getElementById('confirmModal').classList.add('hidden'); }

    function confirmAccept() {
      if (!selectedToken) return;
      var signature = null;
      if (hasSignature && canvas) { try { signature = canvas.toDataURL('image/png'); } catch(e) {} }
      var btn = document.getElementById('confirmBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

      fetch('/api/crm/proposals/respond/' + selectedToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', signature: signature })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) { if (data.success) { location.reload(); } else { alert(data.error || 'Error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Accept & Proceed'; } })
      .catch(function() { alert('Network error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Accept & Proceed'; });
    }

    function declineAll() {
      if (!confirm('Are you sure you want to decline all options?')) return;
      var tokens = ${JSON.stringify(proposals.filter((p: any) => !['accepted', 'declined'].includes(p.status)).map((p: any) => p.share_token))};
      var promises = tokens.map(function(t) {
        return fetch('/api/crm/proposals/respond/' + t, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decline' }) });
      });
      Promise.all(promises).then(function() { location.reload(); }).catch(function() { location.reload(); });
    }
  </script>
</body>
</html>`)
  } catch (err: any) {
    console.error('[Proposal Compare] Error:', err.message)
    return c.html(`<!DOCTYPE html><html><head><title>Error</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="text-center"><h1 class="text-xl font-bold text-red-600">Error Loading Proposals</h1><p class="text-gray-500 mt-2">Please try refreshing the page.</p></div></body></html>`, 500)
  }
})

// Public proposal view page — tracks views when customer opens shared link
app.get('/proposal/view/:token', async (c) => {
  try {
    const token = c.req.param('token')
    const proposal = await c.env.DB.prepare(`
      SELECT cp.*, cc.name as customer_name, cc.email as customer_email, cc.phone as customer_phone,
             cc.address as customer_address, cc.city as customer_city, cc.province as customer_province, cc.postal_code as customer_postal
      FROM crm_proposals cp
      LEFT JOIN crm_customers cc ON cc.id = cp.crm_customer_id
      WHERE cp.share_token = ?
    `).bind(token).first<any>()

    if (!proposal) {
      return c.html(`<!DOCTYPE html><html><head><title>Proposal Not Found</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="text-center"><div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><svg class="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg></div><h1 class="text-2xl font-bold text-gray-800 mb-2">Proposal Not Found</h1><p class="text-gray-500">This proposal link is invalid or has expired.</p></div></body></html>`)
    }

    // Increment view count & log the view
    await c.env.DB.prepare(`
      UPDATE crm_proposals SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = datetime('now'), status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = ?
    `).bind(proposal.id).run()

    // Track proposal view in GA4
    trackProposalViewed(c.env as any, String(proposal.id), {
      proposal_number: proposal.proposal_number || '',
      owner_id: String(proposal.owner_id || ''),
      total_amount: parseFloat(proposal.total_amount) || 0
    }).catch(() => {})

    // Log view details
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const ua = c.req.header('user-agent') || ''
    const ref = c.req.header('referer') || ''
    await c.env.DB.prepare(
      'INSERT INTO proposal_view_log (proposal_id, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?)'
    ).bind(proposal.id, ip, ua.substring(0, 500), ref.substring(0, 500)).run()

    // Get owner (business) info for branding
    const owner = await c.env.DB.prepare(
      'SELECT name, email, phone, brand_business_name, brand_logo_url, brand_primary_color, brand_secondary_color, brand_tagline, brand_phone, brand_email, brand_website, brand_address, brand_license_number, brand_insurance_info FROM customers WHERE id = ?'
    ).bind(proposal.owner_id).first<any>()

    // Get line items
    const itemsResult = await c.env.DB.prepare('SELECT * FROM crm_proposal_items WHERE proposal_id = ? ORDER BY sort_order').bind(proposal.id).all()
    const lineItems = itemsResult.results || []

    const businessName = owner?.brand_business_name || owner?.name || 'RoofReporterAI'
    const primaryColor = owner?.brand_primary_color || '#0369a1'
    const secondaryColor = owner?.brand_secondary_color || '#0ea5e9'
    const brandPhone = owner?.brand_phone || owner?.phone || ''
    const brandEmail = owner?.brand_email || owner?.email || ''
    const brandWebsite = owner?.brand_website || ''
    const brandAddress = owner?.brand_address || ''
    const brandLicense = owner?.brand_license_number || ''
    const brandInsurance = owner?.brand_insurance_info || ''
    const brandTagline = owner?.brand_tagline || ''
    const logoUrl = owner?.brand_logo_url || ''
    const fullAddress = [proposal.property_address, proposal.customer_city, proposal.customer_province, proposal.customer_postal].filter(Boolean).join(', ')

    const isAccepted = proposal.status === 'accepted'
    const isDeclined = proposal.status === 'declined'
    const isResponded = isAccepted || isDeclined
    const proposalDate = proposal.created_at ? new Date(proposal.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
    const validUntil = proposal.valid_until ? new Date(proposal.valid_until).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

    // Build line items HTML
    let itemsHtml = ''
    if (lineItems.length > 0) {
      itemsHtml = `<div class="overflow-x-auto"><table class="w-full text-sm">
        <thead><tr class="border-b-2 border-gray-200">
          <th class="text-left py-3 px-2 font-semibold text-gray-600">Description</th>
          <th class="text-center py-3 px-2 font-semibold text-gray-600">Qty</th>
          <th class="text-center py-3 px-2 font-semibold text-gray-600">Unit</th>
          <th class="text-right py-3 px-2 font-semibold text-gray-600">Unit Price</th>
          <th class="text-right py-3 px-2 font-semibold text-gray-600">Amount</th>
        </tr></thead><tbody>`
      for (const item of lineItems) {
        const it = item as any
        itemsHtml += `<tr class="border-b border-gray-100">
          <td class="py-3 px-2 text-gray-800">${it.description}</td>
          <td class="py-3 px-2 text-center text-gray-600">${it.quantity}</td>
          <td class="py-3 px-2 text-center text-gray-500">${it.unit || 'ea'}</td>
          <td class="py-3 px-2 text-right text-gray-700">$${parseFloat(it.unit_price).toFixed(2)}</td>
          <td class="py-3 px-2 text-right font-medium text-gray-800">$${parseFloat(it.amount).toFixed(2)}</td>
        </tr>`
      }
      itemsHtml += '</tbody></table></div>'
    } else {
      // Legacy: show labor/material/other
      itemsHtml = '<div class="space-y-2">'
      if (proposal.labor_cost > 0) itemsHtml += `<div class="flex justify-between text-sm"><span class="text-gray-600">Labor</span><span class="font-semibold text-gray-800">$${parseFloat(proposal.labor_cost).toFixed(2)}</span></div>`
      if (proposal.material_cost > 0) itemsHtml += `<div class="flex justify-between text-sm"><span class="text-gray-600">Materials</span><span class="font-semibold text-gray-800">$${parseFloat(proposal.material_cost).toFixed(2)}</span></div>`
      if (proposal.other_cost > 0) itemsHtml += `<div class="flex justify-between text-sm"><span class="text-gray-600">Other</span><span class="font-semibold text-gray-800">$${parseFloat(proposal.other_cost).toFixed(2)}</span></div>`
      itemsHtml += '</div>'
    }

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${proposal.title} — ${businessName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @media print { .no-print { display: none !important; } body { background: white; } }
    .brand-gradient { background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor}); }
    .brand-text { color: ${primaryColor}; }
    .brand-bg { background-color: ${primaryColor}; }
    .brand-bg-hover:hover { background-color: ${secondaryColor}; }
    .signature-pad { border: 2px dashed #d1d5db; border-radius: 12px; height: 100px; cursor: crosshair; touch-action: none; }
    .signature-pad.active { border-color: ${primaryColor}; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Print / Download bar -->
  <div class="no-print fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-200">
    <div class="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
      <span class="text-sm text-gray-500"><i class="fas fa-file-signature mr-1"></i>${proposal.proposal_number}</span>
      <div class="flex gap-2">
        <button onclick="window.print()" class="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"><i class="fas fa-print mr-1"></i>Print</button>
      </div>
    </div>
  </div>

  <div class="max-w-4xl mx-auto px-4 pt-16 pb-12">
    <!-- Company Header -->
    <div class="brand-gradient rounded-t-2xl px-8 py-8 text-white relative overflow-hidden">
      <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32"></div>
      <div class="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24"></div>
      <div class="relative z-10 flex items-start justify-between">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" class="h-14 mb-3 rounded-lg bg-white/20 p-1">` : ''}
          <h1 class="text-2xl md:text-3xl font-bold tracking-tight">${businessName}</h1>
          ${brandTagline ? `<p class="text-white/70 text-sm mt-1">${brandTagline}</p>` : ''}
        </div>
        <div class="text-right text-sm space-y-0.5 text-white/80">
          ${brandPhone ? `<p><i class="fas fa-phone mr-1.5"></i>${brandPhone}</p>` : ''}
          ${brandEmail ? `<p><i class="fas fa-envelope mr-1.5"></i>${brandEmail}</p>` : ''}
          ${brandWebsite ? `<p><i class="fas fa-globe mr-1.5"></i>${brandWebsite}</p>` : ''}
          ${brandAddress ? `<p class="mt-2 text-white/60"><i class="fas fa-map-marker-alt mr-1.5"></i>${brandAddress}</p>` : ''}
        </div>
      </div>
    </div>

    <!-- Main Body -->
    <div class="bg-white shadow-2xl rounded-b-2xl">
      <!-- Proposal Meta -->
      <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
        <div class="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Proposal For</p>
            <p class="text-xl font-bold text-gray-800">${proposal.customer_name || 'Customer'}</p>
            ${fullAddress ? `<p class="text-sm text-gray-500 mt-1"><i class="fas fa-map-marker-alt mr-1 text-red-400"></i>${fullAddress}</p>` : ''}
            ${proposal.customer_phone ? `<p class="text-sm text-gray-500"><i class="fas fa-phone mr-1 text-gray-400"></i>${proposal.customer_phone}</p>` : ''}
            ${proposal.customer_email ? `<p class="text-sm text-gray-500"><i class="fas fa-envelope mr-1 text-gray-400"></i>${proposal.customer_email}</p>` : ''}
          </div>
          <div class="text-right space-y-1">
            <div class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isAccepted ? 'bg-green-100 text-green-700' : isDeclined ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${isAccepted ? 'Accepted' : isDeclined ? 'Declined' : proposal.status === 'viewed' ? 'Under Review' : 'Proposal'}</div>
            <p class="text-sm text-gray-500"><span class="font-semibold text-gray-700">${proposal.proposal_number}</span></p>
            ${proposalDate ? `<p class="text-xs text-gray-400">Issued: ${proposalDate}</p>` : ''}
            ${validUntil ? `<p class="text-xs text-gray-400">Valid Until: ${validUntil}</p>` : ''}
          </div>
        </div>
      </div>

      <!-- Project Title -->
      <div class="px-8 py-5 border-b border-gray-100">
        <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-hard-hat mr-2 brand-text"></i>${proposal.title}</h2>
      </div>

      <!-- Scope of Work -->
      ${proposal.scope_of_work ? `
      <div class="px-8 py-5 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3"><i class="fas fa-clipboard-list mr-1.5"></i>Scope of Work</h3>
        <p class="text-gray-700 leading-relaxed whitespace-pre-line">${proposal.scope_of_work}</p>
      </div>` : ''}

      <!-- Materials Detail -->
      ${proposal.materials_detail ? `
      <div class="px-8 py-5 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3"><i class="fas fa-boxes-stacked mr-1.5"></i>Materials</h3>
        <p class="text-gray-700 leading-relaxed whitespace-pre-line">${proposal.materials_detail}</p>
      </div>` : ''}

      <!-- Pricing / Line Items -->
      <div class="px-8 py-6 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4"><i class="fas fa-dollar-sign mr-1.5"></i>Pricing</h3>
        ${itemsHtml}
        
        <!-- Totals -->
        <div class="mt-4 pt-4 border-t border-gray-200 flex justify-end">
          <div class="w-full max-w-xs space-y-1.5">
            ${proposal.subtotal ? `<div class="flex justify-between text-sm"><span class="text-gray-500">Subtotal</span><span class="text-gray-700 font-medium">$${parseFloat(proposal.subtotal).toFixed(2)}</span></div>` : ''}
            ${proposal.tax_amount && proposal.tax_amount > 0 ? `<div class="flex justify-between text-sm"><span class="text-gray-500">Tax (${proposal.tax_rate || 5}% GST)</span><span class="text-gray-700 font-medium">$${parseFloat(proposal.tax_amount).toFixed(2)}</span></div>` : ''}
            <div class="flex justify-between text-lg pt-2 border-t-2 border-gray-300">
              <span class="font-bold brand-text">Total</span>
              <span class="font-black brand-text">$${parseFloat(proposal.total_amount).toFixed(2)} CAD</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Warranty Terms -->
      ${proposal.warranty_terms ? `
      <div class="px-8 py-5 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3"><i class="fas fa-shield-halved mr-1.5"></i>Warranty</h3>
        <p class="text-gray-700 leading-relaxed whitespace-pre-line">${proposal.warranty_terms}</p>
      </div>` : ''}

      <!-- Payment Terms -->
      ${proposal.payment_terms ? `
      <div class="px-8 py-5 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3"><i class="fas fa-credit-card mr-1.5"></i>Payment Terms</h3>
        <p class="text-gray-700 leading-relaxed whitespace-pre-line">${proposal.payment_terms}</p>
      </div>` : ''}

      <!-- Notes -->
      ${proposal.notes ? `
      <div class="px-8 py-5 border-b border-gray-100">
        <h3 class="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3"><i class="fas fa-sticky-note mr-1.5"></i>Additional Notes</h3>
        <p class="text-gray-600 text-sm leading-relaxed whitespace-pre-line">${proposal.notes}</p>
      </div>` : ''}

      <!-- Valid Until Banner -->
      ${validUntil && !isResponded ? `
      <div class="mx-8 my-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700 flex items-center">
        <i class="fas fa-clock mr-2 text-amber-500"></i>
        This proposal is valid until <strong class="ml-1">${validUntil}</strong>
      </div>` : ''}

      <!-- Accept / Decline Actions -->
      ${!isResponded ? `
      <div class="px-8 py-8 no-print" id="actionSection">
        <div class="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h3 class="text-center text-lg font-bold text-gray-800 mb-2">Ready to proceed?</h3>
          <p class="text-center text-sm text-gray-500 mb-6">Accept this proposal to get your roofing project started</p>
          
          <!-- Signature Pad -->
          <div class="mb-5">
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Signature (optional)</label>
            <canvas id="signaturePad" class="signature-pad w-full bg-white" width="600" height="100"></canvas>
            <div class="flex justify-end mt-1">
              <button onclick="clearSignature()" class="text-xs text-gray-400 hover:text-gray-600"><i class="fas fa-eraser mr-1"></i>Clear</button>
            </div>
          </div>

          <div class="flex gap-3">
            <button onclick="respondProposal('accept')" class="flex-1 brand-bg brand-bg-hover text-white py-3.5 rounded-xl font-bold text-sm transition-all hover:shadow-lg">
              <i class="fas fa-check-circle mr-2"></i>Accept Proposal
            </button>
            <button onclick="respondProposal('decline')" class="px-6 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm transition-all">
              Decline
            </button>
          </div>
        </div>
      </div>` : `
      <div class="px-8 py-8">
        <div class="rounded-2xl p-6 text-center ${isAccepted ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
          <div class="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${isAccepted ? 'bg-green-100' : 'bg-red-100'}">
            <i class="fas ${isAccepted ? 'fa-check-circle text-green-600' : 'fa-times-circle text-red-600'} text-2xl"></i>
          </div>
          <h3 class="text-lg font-bold ${isAccepted ? 'text-green-800' : 'text-red-800'}">Proposal ${isAccepted ? 'Accepted' : 'Declined'}</h3>
          <p class="text-sm ${isAccepted ? 'text-green-600' : 'text-red-600'} mt-1">${isAccepted ? (proposal.accepted_at ? 'on ' + new Date(proposal.accepted_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '') : (proposal.declined_at ? 'on ' + new Date(proposal.declined_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '')}</p>
          ${proposal.customer_signature ? `<div class="mt-4"><p class="text-xs text-gray-400 mb-1">Signature</p><img src="${proposal.customer_signature}" alt="Signature" class="max-h-16 mx-auto"></div>` : ''}
        </div>
      </div>`}

      <!-- License & Insurance -->
      ${brandLicense || brandInsurance ? `
      <div class="px-8 py-4 bg-gray-50/50 text-xs text-gray-400 space-y-0.5">
        ${brandLicense ? `<p><i class="fas fa-id-card mr-1"></i>License: ${brandLicense}</p>` : ''}
        ${brandInsurance ? `<p><i class="fas fa-shield-alt mr-1"></i>${brandInsurance}</p>` : ''}
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div class="text-center mt-6 text-xs text-gray-400 space-y-1">
      <p>Powered by <span class="font-semibold">RoofReporterAI</span></p>
    </div>
  </div>

  <script>
    // Signature pad
    var canvas = document.getElementById('signaturePad');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var drawing = false;
    var hasSignature = false;

    if (canvas && ctx) {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = 200;
      ctx.scale(2, 2);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x: x, y: y };
      }

      canvas.addEventListener('mousedown', function(e) { drawing = true; ctx.beginPath(); var p = getPos(e); ctx.moveTo(p.x, p.y); canvas.classList.add('active'); });
      canvas.addEventListener('mousemove', function(e) { if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSignature = true; });
      canvas.addEventListener('mouseup', function() { drawing = false; canvas.classList.remove('active'); });
      canvas.addEventListener('mouseleave', function() { drawing = false; canvas.classList.remove('active'); });
      canvas.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; ctx.beginPath(); var p = getPos(e); ctx.moveTo(p.x, p.y); canvas.classList.add('active'); });
      canvas.addEventListener('touchmove', function(e) { e.preventDefault(); if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSignature = true; });
      canvas.addEventListener('touchend', function() { drawing = false; canvas.classList.remove('active'); });
    }

    function clearSignature() {
      if (ctx && canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); hasSignature = false; }
    }

    function respondProposal(action) {
      var confirmMsg = action === 'accept'
        ? 'Are you sure you want to accept this proposal?'
        : 'Are you sure you want to decline this proposal?';
      if (!confirm(confirmMsg)) return;

      var signature = null;
      if (hasSignature && canvas) {
        try { signature = canvas.toDataURL('image/png'); } catch(e) {}
      }

      var btn = event.target;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

      fetch('/api/crm/proposals/respond/${token}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, signature: signature })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          location.reload();
        } else {
          alert(data.error || 'Something went wrong. Please try again.');
          btn.disabled = false;
          btn.innerHTML = action === 'accept'
            ? '<i class="fas fa-check-circle mr-2"></i>Accept Proposal'
            : 'Decline';
        }
      })
      .catch(function() {
        alert('Network error. Please check your connection and try again.');
        btn.disabled = false;
        btn.innerHTML = action === 'accept'
          ? '<i class="fas fa-check-circle mr-2"></i>Accept Proposal'
          : 'Decline';
      });
    }
  </script>
</body>
</html>`)
  } catch (err: any) {
    console.error('[Proposal View] Error:', err.message)
    return c.html(`<!DOCTYPE html><html><head><title>Error</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="text-center"><h1 class="text-xl font-bold text-red-600">Error Loading Proposal</h1><p class="text-gray-500 mt-2">Please try refreshing the page.</p></div></body></html>`, 500)
  }
})

// ============================================================
// PUBLIC INVOICE PAY PAGE — Customer views & pays invoice
// ============================================================
app.get('/invoice/pay/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const status = c.req.query('status')
    const invoice = await c.env.DB.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email
      FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?
    `).bind(id).first<any>()

    if (!invoice) return c.html(`<!DOCTYPE html><html><head><title>Invoice Not Found</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 min-h-screen flex items-center justify-center"><div class="text-center"><h1 class="text-2xl font-bold text-gray-800">Invoice Not Found</h1></div></body></html>`)

    // Get line items
    const items = await c.env.DB.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order').bind(id).all()

    const isPaid = invoice.status === 'paid' || status === 'success'
    if (status === 'success' && invoice.status !== 'paid') {
      await c.env.DB.prepare("UPDATE invoices SET status = 'paid', paid_date = date('now'), updated_at = datetime('now') WHERE id = ?").bind(id).run()
    }

    let itemsHtml = ''
    for (const it of (items.results || []) as any[]) {
      itemsHtml += `<tr class="border-b border-gray-100"><td class="py-3 px-2 text-gray-700">${it.description}</td><td class="py-3 px-2 text-center">${it.quantity}</td><td class="py-3 px-2 text-right">$${parseFloat(it.unit_price).toFixed(2)}</td><td class="py-3 px-2 text-right font-medium">$${parseFloat(it.amount).toFixed(2)}</td></tr>`
    }

    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 min-h-screen py-8 px-4">
  <div class="max-w-3xl mx-auto">
    ${status === 'success' ? `<div class="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-center"><i class="fas fa-check-circle text-green-500 text-4xl mb-2"></i><h2 class="text-xl font-bold text-green-800">Payment Successful!</h2><p class="text-green-600 text-sm mt-1">Thank you. Your payment has been received.</p></div>` : ''}
    ${status === 'cancelled' ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6 text-center"><i class="fas fa-exclamation-circle text-amber-500 text-3xl mb-2"></i><h2 class="text-lg font-bold text-amber-800">Payment Cancelled</h2><p class="text-amber-600 text-sm mt-1">You can try again when ready.</p></div>` : ''}
    <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div class="bg-gradient-to-r from-sky-700 to-sky-600 px-8 py-6 text-white">
        <div class="flex justify-between items-start">
          <div><h1 class="text-2xl font-bold">INVOICE</h1><p class="text-sky-200 text-sm mt-1">#${invoice.invoice_number}</p></div>
          <div class="text-right"><span class="inline-block px-3 py-1 rounded-full text-xs font-bold ${isPaid ? 'bg-green-500' : 'bg-white/20'}">${isPaid ? 'PAID' : (invoice.status || 'DRAFT').toUpperCase()}</span><p class="text-sky-200 text-xs mt-2">Due: ${invoice.due_date || 'N/A'}</p></div>
        </div>
      </div>
      <div class="px-8 py-6">
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div><p class="text-xs text-gray-400 uppercase mb-1">Bill To</p><p class="font-bold text-gray-800">${invoice.customer_name || 'Customer'}</p><p class="text-sm text-gray-500">${invoice.customer_email || ''}</p></div>
          <div class="text-right"><p class="text-xs text-gray-400 uppercase mb-1">Total Due</p><p class="text-3xl font-black text-sky-700">$${parseFloat(invoice.total).toFixed(2)}</p><p class="text-xs text-gray-400">CAD</p></div>
        </div>
        ${itemsHtml ? `<table class="w-full text-sm mb-6"><thead><tr class="border-b-2 border-gray-200"><th class="text-left py-2 px-2 text-gray-500">Description</th><th class="text-center py-2 px-2 text-gray-500">Qty</th><th class="text-right py-2 px-2 text-gray-500">Price</th><th class="text-right py-2 px-2 text-gray-500">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ''}
        <div class="border-t-2 border-gray-200 pt-4 space-y-2">
          <div class="flex justify-between text-sm"><span class="text-gray-500">Subtotal</span><span>$${parseFloat(invoice.subtotal || 0).toFixed(2)}</span></div>
          <div class="flex justify-between text-sm"><span class="text-gray-500">Tax (${invoice.tax_rate || 5}% GST)</span><span>$${parseFloat(invoice.tax_amount || 0).toFixed(2)}</span></div>
          <div class="flex justify-between text-xl font-bold pt-2 border-t border-gray-200"><span class="text-sky-700">Total</span><span class="text-sky-700">$${parseFloat(invoice.total).toFixed(2)} CAD</span></div>
        </div>
        ${!isPaid ? `<div class="mt-8 text-center"><button onclick="payNow()" id="payBtn" class="bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-xl font-bold text-lg shadow-lg transition-all hover:shadow-xl"><i class="fas fa-credit-card mr-2"></i>Pay Now — $${parseFloat(invoice.total).toFixed(2)} CAD</button><p class="text-xs text-gray-400 mt-2"><i class="fas fa-lock mr-1"></i>Secured by Square</p></div>` : ''}
      </div>
      ${invoice.notes ? `<div class="px-8 py-4 bg-gray-50 border-t"><p class="text-xs text-gray-400 uppercase mb-1">Notes</p><p class="text-sm text-gray-600">${invoice.notes}</p></div>` : ''}
    </div>
    <p class="text-center text-xs text-gray-400 mt-6">Powered by RoofReporterAI</p>
  </div>
  <script>
    function payNow() {
      var btn = document.getElementById('payBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Redirecting to payment...';
      fetch('/api/invoices/${id}/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.payment_url) { window.location.href = data.payment_url; }
        else { alert(data.error || 'Payment not available'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-credit-card mr-2"></i>Pay Now'; }
      }).catch(function() { alert('Network error'); btn.disabled = false; });
    }
  </script>
</body>
</html>`)
  } catch { return c.html('<h1>Error</h1>', 500) }
})

// ============================================================
// TERMS OF SERVICE
// ============================================================
app.get('/terms', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — RoofReporterAI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="max-w-3xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
    <p class="text-sm text-gray-400 mb-8">Last updated: March 16, 2026</p>
    <div class="prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
      <h2 class="text-lg font-bold text-gray-800">1. Acceptance of Terms</h2>
      <p>By accessing or using RoofReporterAI ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service. The Service is operated by RoofReporterAI and is intended for roofing professionals and their customers in Canada and the United States.</p>

      <h2 class="text-lg font-bold text-gray-800">2. Description of Service</h2>
      <p>RoofReporterAI provides AI-powered roofing measurement reports, proposal generation, invoicing, CRM tools, and related services for roofing contractors. The Service uses Google Solar API, satellite imagery, and proprietary algorithms to generate roof measurements and material estimates.</p>

      <h2 class="text-lg font-bold text-gray-800">3. Account Registration</h2>
      <p>You must register an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must provide accurate and complete information during registration.</p>

      <h2 class="text-lg font-bold text-gray-800">4. Measurement Accuracy Disclaimer</h2>
      <p>Roof measurements provided by the Service are estimates based on satellite data and AI analysis. <strong>They are not a substitute for physical on-site measurements.</strong> RoofReporterAI does not guarantee the accuracy of measurements and shall not be liable for any discrepancies between estimated and actual measurements. Always verify measurements before ordering materials or committing to project costs.</p>

      <h2 class="text-lg font-bold text-gray-800">5. Payment Terms</h2>
      <p>Credit packs and subscriptions are charged at the time of purchase. Payments are processed securely via Square. All prices are in Canadian Dollars (CAD) unless otherwise stated. Credit packs are non-refundable once report generation has begun. Subscription renewals are automatic unless cancelled before the renewal date.</p>

      <h2 class="text-lg font-bold text-gray-800">6. Free Trial</h2>
      <p>New accounts receive complimentary report credits as indicated during signup. No payment is required for trial reports. Trial credits have no cash value and expire after 90 days.</p>

      <h2 class="text-lg font-bold text-gray-800">7. Intellectual Property</h2>
      <p>Reports, proposals, and documents generated through the Service are owned by the account holder. The underlying technology, algorithms, UI designs, and branding remain the property of RoofReporterAI. You may not reverse-engineer, copy, or redistribute the Service.</p>

      <h2 class="text-lg font-bold text-gray-800">8. Data & Privacy</h2>
      <p>Your use of the Service is also governed by our <a href="/privacy" class="text-blue-600 underline">Privacy Policy</a>. By using the Service, you consent to the collection and use of information as described therein.</p>

      <h2 class="text-lg font-bold text-gray-800">9. Limitation of Liability</h2>
      <p>RoofReporterAI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, whether in an action in contract, tort, or otherwise, arising from your use of the Service. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.</p>

      <h2 class="text-lg font-bold text-gray-800">10. Termination</h2>
      <p>We reserve the right to suspend or terminate your account at any time for violation of these terms. You may close your account at any time by contacting support. Upon termination, your access to reports and data will be revoked after a 30-day grace period.</p>

      <h2 class="text-lg font-bold text-gray-800">11. Governing Law</h2>
      <p>These Terms are governed by the laws of the Province of Alberta, Canada, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Alberta.</p>

      <h2 class="text-lg font-bold text-gray-800">12. Contact</h2>
      <p>For questions about these Terms, contact us at <strong>support@roofreporterai.com</strong></p>
    </div>
    <div class="mt-12 border-t pt-6 text-center text-xs text-gray-400">
      <a href="/" class="text-blue-600 hover:underline">Back to RoofReporterAI</a> · <a href="/privacy" class="text-blue-600 hover:underline">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`)
})

// ============================================================
// PRIVACY POLICY
// ============================================================
app.get('/privacy', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — RoofReporterAI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="max-w-3xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
    <p class="text-sm text-gray-400 mb-8">Last updated: March 16, 2026</p>
    <div class="prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
      <h2 class="text-lg font-bold text-gray-800">1. Information We Collect</h2>
      <p><strong>Account Information:</strong> Name, email address, phone number, company name, and business address provided during registration.</p>
      <p><strong>Property Data:</strong> Street addresses, GPS coordinates, and satellite imagery data used to generate roof measurement reports.</p>
      <p><strong>Payment Information:</strong> Credit card and billing details processed securely through Square. We do not store credit card numbers on our servers.</p>
      <p><strong>Usage Data:</strong> Pages visited, features used, report generation history, and device/browser information collected via Google Analytics 4.</p>

      <h2 class="text-lg font-bold text-gray-800">2. How We Use Your Information</h2>
      <p>We use your information to: (a) provide and improve the Service; (b) generate roof measurement reports and proposals; (c) process payments; (d) send transactional emails (invoices, proposals, receipts); (e) analyze usage patterns to improve the platform; (f) communicate service updates and new features.</p>

      <h2 class="text-lg font-bold text-gray-800">3. Third-Party Services</h2>
      <p>We share data with the following third-party services as necessary to operate the platform:</p>
      <ul class="list-disc list-inside space-y-1">
        <li><strong>Google Solar API / Maps:</strong> Property coordinates for satellite imagery and solar data</li>
        <li><strong>Square:</strong> Payment processing</li>
        <li><strong>Google Analytics 4:</strong> Anonymous usage analytics</li>
        <li><strong>Google Gmail API:</strong> Sending proposals and invoices on your behalf (when connected)</li>
        <li><strong>Cloudflare:</strong> Hosting, CDN, and security</li>
        <li><strong>LiveKit:</strong> AI phone call handling (when enabled)</li>
      </ul>

      <h2 class="text-lg font-bold text-gray-800">4. Data Retention</h2>
      <p>Account data is retained for the duration of your account. Roof measurement reports are retained for 2 years after generation. Payment records are retained for 7 years as required by Canadian tax law. You may request deletion of your data at any time by contacting support.</p>

      <h2 class="text-lg font-bold text-gray-800">5. Data Security</h2>
      <p>We implement industry-standard security measures including HTTPS encryption, secure password hashing, OAuth 2.0 authentication, and Cloudflare DDoS protection. All data is stored on Cloudflare's globally distributed infrastructure with automatic encryption at rest.</p>

      <h2 class="text-lg font-bold text-gray-800">6. Cookies</h2>
      <p>We use essential cookies for authentication and session management. Google Analytics uses cookies for usage tracking. You may disable non-essential cookies in your browser settings.</p>

      <h2 class="text-lg font-bold text-gray-800">7. Your Rights (PIPEDA Compliance)</h2>
      <p>Under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to: (a) access your personal information; (b) request correction of inaccurate data; (c) withdraw consent for data collection; (d) request deletion of your data. To exercise these rights, contact <strong>privacy@roofreporterai.com</strong>.</p>

      <h2 class="text-lg font-bold text-gray-800">8. Children's Privacy</h2>
      <p>The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors.</p>

      <h2 class="text-lg font-bold text-gray-800">9. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify registered users of material changes via email. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>

      <h2 class="text-lg font-bold text-gray-800">10. Contact</h2>
      <p>For privacy inquiries: <strong>privacy@roofreporterai.com</strong></p>
      <p>Data Protection Officer: RoofReporterAI, Alberta, Canada</p>
    </div>
    <div class="mt-12 border-t pt-6 text-center text-xs text-gray-400">
      <a href="/" class="text-blue-600 hover:underline">Back to RoofReporterAI</a> · <a href="/terms" class="text-blue-600 hover:underline">Terms of Service</a>
    </div>
  </div>
</body>
</html>`)
})

// ============================================================
// SERVICE INVOICE — Public payment page for cold-call invoices
// ============================================================
app.get('/service-invoice/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const status = c.req.query('status') || ''
    const invoice = await c.env.DB.prepare(
      'SELECT * FROM service_invoices WHERE id = ?'
    ).bind(id).first<any>()
    if (!invoice) return c.html('<html><body><h1>Invoice Not Found</h1></body></html>', 404)
    const isPaid = invoice.status === 'paid'
    const items = JSON.parse(invoice.items || '[]')
    const itemsHtml = items.map((it: any) => `<tr class="border-b border-gray-100"><td class="py-2 px-2 text-gray-700 text-sm">${it.description}</td><td class="py-2 px-2 text-right text-gray-700 text-sm">$${parseFloat(it.price || it.amount || 0).toFixed(2)}</td></tr>`).join('')
    return c.html(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Service Invoice ${invoice.invoice_number}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head><body class="bg-gray-100 min-h-screen py-8 px-4">
<div class="max-w-3xl mx-auto">
  ${status === 'success' ? '<div class="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-center"><i class="fas fa-check-circle text-green-500 text-4xl mb-2"></i><h2 class="text-xl font-bold text-green-800">Payment Successful!</h2><p class="text-green-600 text-sm mt-1">Thank you for your payment.</p></div>' : ''}
  <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
    <div class="bg-gradient-to-r from-amber-600 to-amber-500 px-8 py-6 text-white">
      <div class="flex justify-between items-start">
        <div><h1 class="text-2xl font-bold">SERVICE INVOICE</h1><p class="text-amber-100 text-sm mt-1">#${invoice.invoice_number}</p></div>
        <div class="text-right"><span class="inline-block px-3 py-1 rounded-full text-xs font-bold ${isPaid ? 'bg-green-500' : 'bg-white/20'}">${isPaid ? 'PAID' : (invoice.status || 'DRAFT').toUpperCase()}</span><p class="text-amber-100 text-xs mt-2">Due: ${invoice.due_date || 'N/A'}</p></div>
      </div>
    </div>
    <div class="px-8 py-6">
      <div class="grid md:grid-cols-2 gap-4 mb-6">
        <div><p class="text-xs text-gray-400 uppercase mb-1">Bill To</p><p class="font-bold text-gray-800">${invoice.customer_name || 'Customer'}</p><p class="text-sm text-gray-500">${invoice.customer_email || ''}</p></div>
        <div class="text-right"><p class="text-xs text-gray-400 uppercase mb-1">Total Due</p><p class="text-3xl font-black text-amber-600">$${parseFloat(invoice.total).toFixed(2)}</p><p class="text-xs text-gray-400">CAD</p></div>
      </div>
      ${itemsHtml ? `<table class="w-full text-sm mb-6"><thead><tr class="border-b-2 border-gray-200"><th class="text-left py-2 px-2 text-gray-500">Description</th><th class="text-right py-2 px-2 text-gray-500">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ''}
      <div class="border-t-2 border-gray-200 pt-4 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-gray-500">Subtotal</span><span>$${parseFloat(invoice.subtotal || 0).toFixed(2)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-500">GST (${invoice.tax_rate || 5}%)</span><span>$${parseFloat(invoice.tax_amount || 0).toFixed(2)}</span></div>
        <div class="flex justify-between text-xl font-bold pt-2 border-t border-gray-200"><span class="text-amber-600">Total</span><span class="text-amber-600">$${parseFloat(invoice.total).toFixed(2)} CAD</span></div>
      </div>
      ${!isPaid && invoice.payment_link ? `<div class="mt-8 text-center"><a href="${invoice.payment_link}" class="inline-block bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-xl font-bold text-lg shadow-lg transition-all hover:shadow-xl"><i class="fas fa-credit-card mr-2"></i>Pay Now — $${parseFloat(invoice.total).toFixed(2)} CAD</a><p class="text-xs text-gray-400 mt-2"><i class="fas fa-lock mr-1"></i>Secured by Square</p></div>` : ''}
    </div>
    ${invoice.notes ? `<div class="px-8 py-4 bg-gray-50 border-t"><p class="text-xs text-gray-400 uppercase mb-1">Notes</p><p class="text-sm text-gray-600">${invoice.notes}</p></div>` : ''}
  </div>
  <p class="text-center text-xs text-gray-400 mt-6"><a href="/">RoofReporterAI</a> · Roofer Secretary AI Service</p>
</div>
</body></html>`)
  } catch { return c.html('<h1>Error</h1>', 500) }
})

// ============================================================
// CUSTOMER PORTAL — Homeowner views their proposal & invoice history
// ============================================================
app.get('/portal/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email'))
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Projects — RoofReporterAI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-700 to-sky-600 text-white shadow">
    <div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <i class="fas fa-hard-hat text-2xl"></i>
        <div><h1 class="text-lg font-bold">My Roofing Projects</h1><p class="text-sky-200 text-xs">${email}</p></div>
      </div>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8" id="portal-root">
    <div class="flex items-center justify-center py-12"><div class="animate-spin w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full"></div><span class="ml-3 text-gray-500">Loading your projects...</span></div>
  </main>
  <script>
    (async function() {
      const root = document.getElementById('portal-root');
      try {
        const res = await fetch('/api/crm/customer-portal/${encodeURIComponent(email)}');
        const data = await res.json();
        
        let html = '<div class="space-y-8">';
        
        // Proposals
        html += '<section><h2 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-file-signature mr-2 text-sky-600"></i>Proposals</h2>';
        if (data.proposals && data.proposals.length > 0) {
          html += '<div class="grid gap-4">';
          data.proposals.forEach(function(p) {
            var statusColor = { accepted: 'green', declined: 'red', sent: 'blue', viewed: 'yellow', draft: 'gray' }[p.status] || 'gray';
            html += '<div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">' +
              '<div class="flex justify-between items-start">' +
              '<div><h3 class="font-bold text-gray-800">' + p.title + '</h3>' +
              '<p class="text-sm text-gray-500 mt-0.5">' + p.proposal_number + (p.tier_label ? ' · ' + p.tier_label : '') + '</p></div>' +
              '<div class="text-right"><span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-' + statusColor + '-100 text-' + statusColor + '-700">' + (p.status || 'draft').toUpperCase() + '</span>' +
              '<p class="text-lg font-bold text-gray-800 mt-1">$' + parseFloat(p.total_amount || 0).toLocaleString('en-CA', {minimumFractionDigits: 2}) + '</p></div></div>' +
              (p.share_token ? '<div class="mt-3"><a href="/proposal/view/' + p.share_token + '" class="text-sm text-sky-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>View Proposal</a></div>' : '') +
              '</div>';
          });
          html += '</div>';
        } else { html += '<p class="text-gray-400 text-sm">No proposals yet.</p>'; }
        html += '</section>';
        
        // Invoices
        html += '<section><h2 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-file-invoice-dollar mr-2 text-green-600"></i>Invoices</h2>';
        if (data.invoices && data.invoices.length > 0) {
          html += '<div class="grid gap-4">';
          data.invoices.forEach(function(inv) {
            var statusColor = { paid: 'green', sent: 'blue', viewed: 'yellow', overdue: 'red', draft: 'gray' }[inv.status] || 'gray';
            html += '<div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">' +
              '<div class="flex justify-between items-start">' +
              '<div><h3 class="font-bold text-gray-800">' + inv.invoice_number + '</h3>' +
              (inv.due_date ? '<p class="text-sm text-gray-500 mt-0.5">Due: ' + inv.due_date + '</p>' : '') + '</div>' +
              '<div class="text-right"><span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-' + statusColor + '-100 text-' + statusColor + '-700">' + (inv.status || 'draft').toUpperCase() + '</span>' +
              '<p class="text-lg font-bold text-gray-800 mt-1">$' + parseFloat(inv.total || 0).toLocaleString('en-CA', {minimumFractionDigits: 2}) + '</p></div></div>' +
              '<div class="mt-3 flex gap-3"><a href="/invoice/pay/' + inv.id + '" class="text-sm text-sky-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>View Invoice</a>' +
              (inv.status !== 'paid' ? '<a href="/invoice/pay/' + inv.id + '" class="text-sm text-green-600 hover:underline"><i class="fas fa-credit-card mr-1"></i>Pay Now</a>' : '<span class="text-sm text-green-600"><i class="fas fa-check-circle mr-1"></i>Paid' + (inv.paid_date ? ' ' + inv.paid_date : '') + '</span>') +
              '</div></div>';
          });
          html += '</div>';
        } else { html += '<p class="text-gray-400 text-sm">No invoices yet.</p>'; }
        html += '</section></div>';
        
        root.innerHTML = html;
      } catch(e) {
        root.innerHTML = '<div class="text-center py-12"><i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3"></i><p class="text-gray-600">Error loading your projects. Please try again.</p></div>';
      }
    })();
  </script>
</body>
</html>`)
})

app.get('/customer/d2d', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getD2DPageHTML(mapsKey))
})

// Roofer Secretary — AI Phone Answering Service
app.get('/customer/secretary', (c) => {
  const stripeKey = '' // No longer needed — Square uses server-side only
  return c.html(getSecretaryPageHTML())
})

// Model Cards — Public reference pages for AI models
app.get('/model-card/gemma-3', (c) => {
  return c.html(getGemma3ModelCardHTML())
})

export default app

// ============================================================
// HTML Templates
// ============================================================

function getTailwindConfig() {
  return `<script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e' },
            accent: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' }
          },
          animation: {
            'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
            'fade-in': 'fadeIn 0.5s ease-out forwards',
          },
          keyframes: {
            fadeInUp: {
              '0%': { opacity: 0, transform: 'translateY(20px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' }
            },
            fadeIn: {
              '0%': { opacity: 0 },
              '100%': { opacity: 1 }
            }
          }
        }
      }
    }
  </script>`
}

// Build-time version stamp for cache busting all static assets
const BUILD_VERSION = Date.now().toString(36)

function getHeadTags() {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  ${getTailwindConfig()}
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link rel="stylesheet" href="/static/style.css?v=${BUILD_VERSION}">`
}

// Rover chatbot widget script tag — inject on public pages only
function getRoverWidget() {
  return `<script src="/static/rover-widget.js?v=${BUILD_VERSION}" defer></script>`
}

// Rover AI Assistant — inject on authenticated customer pages
function getRoverAssistant() {
  return `<script src="/static/rover-assistant.js?v=${Date.now()}" defer></script>`
}

// ============================================================
// CONTACT US LEAD CAPTURE — Reusable form for all public pages
// ============================================================
function getContactFormHTML(sourcePage: string = 'unknown') {
  return `
  <section id="contact-section" class="py-16 bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900">
    <div class="max-w-3xl mx-auto px-4">
      <div class="text-center mb-10">
        <span class="inline-block bg-cyan-500/20 text-cyan-300 text-xs font-bold px-3 py-1 rounded-full mb-4">GET IN TOUCH</span>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-3">Ready to Transform Your Roofing Business?</h2>
        <p class="text-gray-300 max-w-xl mx-auto">Fill out the form below and our team will reach out within 24 hours to get you set up with AI-powered roof measurement reports.</p>
      </div>
      <form id="lead-capture-form" onsubmit="return submitLeadForm(event, '${sourcePage}')" class="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 space-y-5">
        <div class="grid md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-200 mb-1.5">First Name <span class="text-red-400">*</span></label>
            <input type="text" id="lead-first-name" required placeholder="John" class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-200 mb-1.5">Last Name <span class="text-red-400">*</span></label>
            <input type="text" id="lead-last-name" required placeholder="Smith" class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none">
          </div>
        </div>
        <div class="grid md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm font-medium text-gray-200 mb-1.5">Company Name</label>
            <input type="text" id="lead-company" placeholder="ABC Roofing Ltd." class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-200 mb-1.5">Phone Number</label>
            <input type="tel" id="lead-phone" placeholder="(780) 555-1234" class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-200 mb-1.5">Email Address <span class="text-red-400">*</span></label>
          <input type="email" id="lead-email" required placeholder="john@abcroofing.com" class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-200 mb-1.5">How can we help?</label>
          <textarea id="lead-message" rows="3" placeholder="Tell us about your roofing business and what you're looking for..." class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none resize-none"></textarea>
        </div>
        <div id="lead-form-msg" class="hidden text-sm font-medium px-4 py-3 rounded-lg"></div>
        <button type="submit" id="lead-submit-btn" class="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.01] text-lg">
          <i class="fas fa-paper-plane mr-2"></i>Get Started — It's Free
        </button>
        <p class="text-center text-gray-400 text-xs">No credit card required. 3 free reports included.</p>
      </form>
    </div>
  </section>
  <script>
  async function submitLeadForm(e, source) {
    e.preventDefault();
    var btn = document.getElementById('lead-submit-btn');
    var msg = document.getElementById('lead-form-msg');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
    msg.className = 'hidden';
    try {
      var firstName = document.getElementById('lead-first-name').value.trim();
      var lastName = document.getElementById('lead-last-name').value.trim();
      var res = await fetch('/api/agents/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: firstName + ' ' + lastName,
          first_name: firstName,
          last_name: lastName,
          company_name: document.getElementById('lead-company').value.trim(),
          phone: document.getElementById('lead-phone').value.trim(),
          email: document.getElementById('lead-email').value.trim(),
          source_page: source,
          message: document.getElementById('lead-message').value.trim()
        })
      });
      var data = await res.json();
      if (data.success) {
        msg.className = 'text-sm font-medium px-4 py-3 rounded-lg bg-green-500/20 text-green-300 border border-green-500/30';
        msg.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Thank you! We\\'ll be in touch within 24 hours.';
        document.getElementById('lead-capture-form').reset();
      } else {
        msg.className = 'text-sm font-medium px-4 py-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30';
        msg.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>' + (data.error || 'Something went wrong');
      }
    } catch(err) {
      msg.className = 'text-sm font-medium px-4 py-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30';
      msg.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>Network error. Please try again.';
    }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Get Started — It\\'s Free';
  }
  </script>`
}

function getMainPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? `<script>
      var googleMapsReady = false;
      function onGoogleMapsReady() {
        googleMapsReady = true;
        console.log('[Maps] Google Maps API loaded successfully');
        if (typeof initMap === 'function' && document.getElementById('map')) {
          initMap();
        }
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&callback=onGoogleMapsReady" async defer></script>`
    : '<!-- Google Maps: No API key configured. -->'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Order a Roof Report - RoofReporterAI</title>
  ${mapsScript}
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/" class="flex items-center space-x-3 hover:opacity-90 transition-opacity">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-xl font-bold">Order a Report</h1>
            <p class="text-brand-200 text-xs">RoofReporterAI</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-arrow-left mr-1"></i>Home</a>
        <a href="/admin" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-tachometer-alt mr-1"></i>Admin</a>
      </nav>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-4 py-8">
    <div id="app-root"></div>
  </main>
  <footer class="bg-gray-800 text-gray-400 text-center py-6 mt-12">
    <p class="text-sm">&copy; 2026 RoofReporterAI. All rights reserved.</p>
    <p class="text-xs mt-1">Professional Roof Measurement Reports & Business Management CRM</p>
  </footer>
  <script src="/static/app.js?v=${Date.now()}"></script>
</body>
</html>`
}

function getSuperAdminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Super Admin Dashboard - RoofReporterAI</title>
  <style>
    .sa-sidebar { transition: width 0.3s ease; }
    .sa-sidebar .label { transition: opacity 0.2s ease; }
    .sa-nav-item { transition: all 0.2s ease; cursor: pointer; }
    .sa-nav-item:hover { background: rgba(255,255,255,0.08); }
    .sa-nav-item.active { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; box-shadow: 0 4px 12px rgba(220,38,38,0.3); }
    .metric-card { transition: all 0.3s ease; }
    .metric-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
    @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
    .slide-in { animation: slideIn 0.4s ease-out; }
    .sa-kpi { background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.1); }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Super Admin Top Bar -->
  <header class="bg-slate-700 text-white shadow-xl sticky top-0 z-50">
    <div class="max-w-full mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button onclick="document.getElementById('sa-sidebar').classList.toggle('hidden');document.getElementById('sa-sidebar').classList.toggle('fixed');document.getElementById('sa-sidebar').classList.toggle('inset-0');document.getElementById('sa-sidebar').classList.toggle('z-40');" class="md:hidden text-gray-300 hover:text-white">
          <i class="fas fa-bars text-lg"></i>
        </button>
        <div class="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
          <i class="fas fa-crown text-white text-sm"></i>
        </div>
        <div class="leading-tight">
          <span class="text-white font-bold text-sm">ROOFREPORTERAI</span>
          <span class="text-gray-400 text-[10px] block -mt-0.5">Super Admin Command Center</span>
        </div>
      </div>
      <div class="flex items-center gap-2 md:gap-4">
        <span id="saUserGreeting" class="text-gray-300 text-xs hidden">
          <i class="fas fa-crown mr-1 text-yellow-400"></i><span id="saUserName"></span>
          <span class="ml-1 px-1.5 py-0.5 bg-red-600/30 text-red-300 rounded text-[10px] font-bold">SUPER ADMIN</span>
        </span>
        <a href="/admin" class="text-gray-400 hover:text-white text-xs transition-colors"><i class="fas fa-tachometer-alt mr-1"></i>Ops Panel</a>
        <a href="/" target="_blank" class="text-gray-400 hover:text-white text-xs transition-colors"><i class="fas fa-external-link-alt mr-1"></i>View Site</a>
        <a href="/settings" class="text-gray-400 hover:text-white text-xs transition-colors"><i class="fas fa-cog mr-1"></i>Settings</a>
        <button onclick="saLogout()" class="text-gray-400 hover:text-red-400 text-xs transition-colors"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </div>
    </div>
  </header>

  <div class="flex min-h-[calc(100vh-56px)]">
    <!-- Sidebar Navigation -->
    <aside id="sa-sidebar" class="sa-sidebar w-64 bg-slate-800 border-r border-slate-700 flex-shrink-0 hidden md:block overflow-y-auto max-h-[calc(100vh-56px)]">
      <div class="p-4 space-y-1" id="sa-nav">
        <div class="sa-nav-item active rounded-xl px-4 py-3 flex items-center gap-3" onclick="saSetView('users', this)">
          <i class="fas fa-users w-5 text-center"></i>
          <span class="label text-sm font-medium">All Active Users</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('sales', this)">
          <i class="fas fa-credit-card w-5 text-center"></i>
          <span class="label text-sm font-medium">Credit Pack Sales</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('orders', this)">
          <i class="fas fa-clipboard-list w-5 text-center"></i>
          <span class="label text-sm font-medium">Order History</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('signups', this)">
          <i class="fas fa-user-plus w-5 text-center"></i>
          <span class="label text-sm font-medium">New Sign-ups</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('marketing', this)">
          <i class="fas fa-bullhorn w-5 text-center"></i>
          <span class="label text-sm font-medium">Sales & Marketing</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('email-outreach', this)">
          <i class="fas fa-envelope-open-text w-5 text-center"></i>
          <span class="label text-sm font-medium">Email Outreach</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('email-setup', this)">
          <i class="fas fa-cog w-5 text-center"></i>
          <span class="label text-sm font-medium">Email Setup</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('analytics', this)">
          <i class="fas fa-chart-line w-5 text-center"></i>
          <span class="label text-sm font-medium">Site Analytics</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('ga4', this)">
          <i class="fab fa-google w-5 text-center"></i>
          <span class="label text-sm font-medium">Google Analytics</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('call-center', this)">
          <i class="fas fa-headset w-5 text-center"></i>
          <span class="label text-sm font-medium">AI Call Center</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('meta-connect', this)">
          <i class="fab fa-meta w-5 text-center"></i>
          <span class="label text-sm font-medium">Meta Connect</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('secretary-admin', this)">
          <i class="fas fa-phone-volume w-5 text-center"></i>
          <span class="label text-sm font-medium">Roofer Secretary AI</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('heygen', this)">
          <i class="fas fa-video w-5 text-center"></i>
          <span class="label text-sm font-medium">HeyGen Videos</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('pricing', this)">
          <i class="fas fa-dollar-sign w-5 text-center"></i>
          <span class="label text-sm font-medium">Pricing & Billing</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('contact-forms', this)">
          <i class="fas fa-inbox w-5 text-center"></i>
          <span class="label text-sm font-medium">Contact Forms</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('seo-manager', this)">
          <i class="fas fa-search-plus w-5 text-center"></i>
          <span class="label text-sm font-medium">SEO Manager</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('canva', this)">
          <i class="fas fa-palette w-5 text-center"></i>
          <span class="label text-sm font-medium">Canva Designs</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('pricing-engine', this)">
          <i class="fas fa-calculator w-5 text-center"></i>
          <span class="label text-sm font-medium">Pricing Engine</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('invoices', this)">
          <i class="fas fa-file-invoice-dollar w-5 text-center"></i>
          <span class="label text-sm font-medium">Invoices</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('telephony', this)">
          <i class="fas fa-phone-alt w-5 text-center"></i>
          <span class="label text-sm font-medium">Telephony / LiveKit</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <p class="px-4 py-1 text-[10px] text-gray-600 uppercase tracking-wider font-bold">Customer Ops</p>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('customer-onboarding', this)">
          <i class="fas fa-user-cog w-5 text-center"></i>
          <span class="label text-sm font-medium">Customer Onboarding</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('service-invoices', this)">
          <i class="fas fa-file-invoice w-5 text-center"></i>
          <span class="label text-sm font-medium">Cold Call Invoices</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('call-center-manage', this)">
          <i class="fas fa-headset w-5 text-center"></i>
          <span class="label text-sm font-medium">Call Center Mgmt</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('revenue-pipeline', this)">
          <i class="fas fa-funnel-dollar w-5 text-center"></i>
          <span class="label text-sm font-medium">Revenue Pipeline</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('notifications-admin', this)">
          <i class="fas fa-bell w-5 text-center"></i>
          <span class="label text-sm font-medium">Notifications</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('webhooks', this)">
          <i class="fas fa-plug w-5 text-center"></i>
          <span class="label text-sm font-medium">Webhooks</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('paywall', this)">
          <i class="fas fa-shield-alt w-5 text-center"></i>
          <span class="label text-sm font-medium">Paywall / App Store</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('ai-chat', this)">
          <i class="fas fa-brain w-5 text-center"></i>
          <span class="label text-sm font-medium">AI Site Manager</span>
        </div>
        <a href="/admin" class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400 no-underline">
          <i class="fas fa-tachometer-alt w-5 text-center"></i>
          <span class="label text-sm font-medium">Operations Panel</span>
        </a>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 p-3 md:p-6 overflow-y-auto">
      <div id="sa-root"></div>
    </main>
  </div>

  <script>
    // Auth guard — ONLY superadmin allowed
    (function() {
      const user = localStorage.getItem('rc_user');
      if (!user) { window.location.href = '/login'; return; }
      try {
        const u = JSON.parse(user);
        if (u.role !== 'superadmin') {
          localStorage.removeItem('rc_user');
          localStorage.removeItem('rc_token');
          window.location.href = '/login';
          return;
        }
        const greeting = document.getElementById('saUserGreeting');
        const nameEl = document.getElementById('saUserName');
        if (greeting && nameEl) {
          nameEl.textContent = u.name || u.email;
          greeting.classList.remove('hidden');
        }
      } catch(e) { window.location.href = '/login'; }
    })();
    function saLogout() {
      localStorage.removeItem('rc_user');
      localStorage.removeItem('rc_token');
      window.location.href = '/login';
    }
    function saSetView(v, el) {
      // Update sidebar active state
      document.querySelectorAll('.sa-nav-item').forEach(function(n) {
        n.classList.remove('active');
        n.classList.add('text-gray-400');
      });
      if (el) {
        el.classList.add('active');
        el.classList.remove('text-gray-400');
      }
      // Delegate to JS module
      if (typeof window.saDashboardSetView === 'function') window.saDashboardSetView(v);
    }
  </script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
  <script src="/static/ai-admin-chat.js?v=${BUILD_VERSION}"></script>
  <script src="/static/super-admin-dashboard.js?v=${BUILD_VERSION}"></script>
  <script src="/static/call-center.js?v=${BUILD_VERSION}"></script>
  <script src="/static/meta-connect.js?v=${BUILD_VERSION}"></script>
  <script src="/static/heygen.js?v=${BUILD_VERSION}"></script>
  <script src="/static/email-outreach.js?v=${BUILD_VERSION}"></script>
</body>
</html>`
}

function getAdminPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Admin Control Panel - RoofReporterAI</title>
  <style>
    .admin-sidebar { transition: width 0.3s ease; }
    .admin-sidebar .label { transition: opacity 0.2s ease; }
    .tab-active { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; box-shadow: 0 4px 12px rgba(59,130,246,0.3); }
    .metric-card { transition: all 0.3s ease; }
    .metric-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
    @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
    .slide-in { animation: slideIn 0.4s ease-out; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <!-- Admin Top Bar -->
  <header class="bg-slate-700 text-white shadow-xl sticky top-0 z-50">
    <div class="max-w-full mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
          <i class="fas fa-shield-alt text-white text-sm"></i>
        </div>
        <div class="leading-tight">
          <span class="text-white font-bold text-sm">ROOFREPORTERAI</span>
          <span class="text-gray-400 text-[10px] block -mt-0.5">Admin Control Panel</span>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span id="userGreeting" class="text-gray-300 text-xs hidden">
          <i class="fas fa-user-shield mr-1 text-red-400"></i><span id="userName"></span>
          <span class="ml-1 px-1.5 py-0.5 bg-red-600/20 text-red-300 rounded text-[10px] font-bold">ADMIN</span>
        </span>
        <a href="/super-admin" class="text-yellow-400 hover:text-yellow-300 text-xs transition-colors font-semibold"><i class="fas fa-crown mr-1"></i>Super Admin</a>
        <a href="/" class="text-gray-400 hover:text-white text-xs transition-colors"><i class="fas fa-external-link-alt mr-1"></i>View Site</a>
        <a href="/settings" class="text-gray-400 hover:text-white text-xs transition-colors"><i class="fas fa-cog mr-1"></i>Settings</a>
        <button onclick="doLogout()" class="text-gray-400 hover:text-red-400 text-xs transition-colors"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </div>
    </div>
  </header>

  <div class="max-w-[1600px] mx-auto px-6 py-6">
    <div id="admin-root"></div>
  </div>

  <script>
    // Auth guard — ONLY superadmin allowed
    (function() {
      const user = localStorage.getItem('rc_user');
      if (!user) { window.location.href = '/login'; return; }
      try {
        const u = JSON.parse(user);
        if (u.role !== 'superadmin') {
          localStorage.removeItem('rc_user');
          localStorage.removeItem('rc_token');
          window.location.href = '/login';
          return;
        }
        const greeting = document.getElementById('userGreeting');
        const nameEl = document.getElementById('userName');
        if (greeting && nameEl) {
          nameEl.textContent = u.name || u.email;
          greeting.classList.remove('hidden');
        }
      } catch(e) { window.location.href = '/login'; }
    })();
    function doLogout() {
      localStorage.removeItem('rc_user');
      localStorage.removeItem('rc_token');
      window.location.href = '/login';
    }
  </script>
  <script src="/static/ai-admin-chat.js?v=${BUILD_VERSION}"></script>
  <script src="/static/admin.js?v=${BUILD_VERSION}"></script>
</body>
</html>`
}

function getOrderConfirmationHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Order Confirmation - Roof Measurement Tool</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div>
          <h1 class="text-xl font-bold">Order Confirmation</h1>
          <p class="text-brand-200 text-xs">Powered by RoofReporterAI</p>
        </div>
      </div>
      <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-arrow-left mr-1"></i>Home</a>
      <a href="/order/new" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-plus mr-1"></i>New Order</a>
    </div>
  </header>
  <main class="max-w-5xl mx-auto px-4 py-8">
    <div id="confirmation-root"></div>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
  <script src="/static/confirmation.js?v=${BUILD_VERSION}"></script>
</body>
</html>`
}

function getLoginPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Admin Login - RoofReporterAI</title>
</head>
<body class="bg-gradient-to-br from-sky-100 via-blue-50 to-white min-h-screen flex items-center justify-center">
  <div class="w-full max-w-md mx-auto px-4">
    <!-- Logo -->
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-3">
        <span class="logo-mark logo-mark-light w-12 h-12"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div class="text-left">
          <span class="text-gray-800 font-bold text-2xl block">RoofReporterAI</span>
          <span class="text-gray-500 text-xs">Admin Access - Authorized Personnel Only</span>
        </div>
      </a>
    </div>

    <!-- Admin Login Card -->
    <div class="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
      <div class="bg-gradient-to-r from-sky-600 to-blue-700 px-8 py-4">
        <div class="flex items-center gap-2">
          <i class="fas fa-lock text-red-400"></i>
          <span class="text-white font-semibold text-sm">Admin Control Panel</span>
        </div>
      </div>

      <div class="p-8">
        <h2 class="text-xl font-bold text-gray-800 mb-1">Administrator Sign In</h2>
        <p class="text-sm text-gray-500 mb-6">This area is restricted to authorized administrators only.</p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
            <input type="email" id="loginEmail" placeholder="admin@reusecanada.ca" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" id="loginPassword" placeholder="Enter admin password" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors text-sm" onkeyup="if(event.key==='Enter')doLogin()">
          </div>
        </div>

        <div id="loginError" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>

        <button onclick="doLogin()" class="w-full mt-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg">
          <i class="fas fa-sign-in-alt mr-2"></i>Access Admin Panel
        </button>

        <div class="mt-6 pt-4 border-t border-gray-100 text-center">
          <p class="text-xs text-gray-400 mb-2">Not an administrator?</p>
          <a href="/customer/login" class="text-brand-600 font-semibold text-sm hover:underline"><i class="fas fa-user mr-1"></i>Go to Customer Portal</a>
        </div>
      </div>
    </div>

    <!-- Back link -->
    <div class="text-center mt-6">
      <a href="/" class="text-gray-400 hover:text-white text-sm transition-colors"><i class="fas fa-arrow-left mr-1"></i>Back to homepage</a>
    </div>
  </div>

  <script>
    (function() {
      const user = localStorage.getItem('rc_user');
      if (user) {
        try {
          const u = JSON.parse(user);
          if (u.role === 'superadmin') { window.location.href = '/super-admin'; return; }
        } catch(e) {}
      }
    })();

    async function doLogin() {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errDiv = document.getElementById('loginError');
      errDiv.classList.add('hidden');

      if (!email || !password) {
        errDiv.textContent = 'Please enter your email and password.';
        errDiv.classList.remove('hidden');
        return;
      }

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('rc_user', JSON.stringify(data.user));
          localStorage.setItem('rc_token', data.token);
          window.location.href = '/super-admin';
        } else {
          errDiv.textContent = data.error || 'Login failed.';
          if (data.redirect) {
            errDiv.innerHTML += ' <a href="' + data.redirect + '" class="underline font-bold">Go to Customer Portal</a>';
          }
          errDiv.classList.remove('hidden');
        }
      } catch (e) {
        errDiv.textContent = 'Network error. Please try again.';
        errDiv.classList.remove('hidden');
      }
    }
  </script>
</body>
</html>`
}

function getLandingPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>RoofReporterAI — Professional Roof Measurement Reports & CRM for Roofing Companies</title>
  <meta name="description" content="Get accurate roof area, pitch analysis, edge breakdowns, material estimates, and solar potential from satellite imagery in under 60 seconds. Full CRM, AI Secretary, team management. Start with 3 free reports.">
  <meta property="og:title" content="RoofReporterAI — Precision Roof Measurement Reports">
  <meta property="og:description" content="Professional satellite-powered roof measurement reports in under 60 seconds. Full CRM, AI phone secretary, and team management for roofing businesses.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://roofreporterai.com">
  <link rel="canonical" href="https://roofreporterai.com/">
  <!-- JSON-LD Structured Data for SEO -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "RoofReporterAI",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "AI-powered roof measurement reports from satellite imagery. Full CRM, invoicing, proposals, and team management for roofing companies.",
    "offers": {
      "@type": "Offer",
      "price": "8.00",
      "priceCurrency": "CAD",
      "description": "Per report after 3 free reports"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "127"
    },
    "provider": {
      "@type": "Organization",
      "name": "RoofReporterAI",
      "url": "https://roofreporterai.com",
      "address": {
        "@type": "PostalAddress",
        "addressRegion": "Alberta",
        "addressCountry": "CA"
      }
    }
  }
  </script>
  <style>
    /* Landing page scroll animations */
    .scroll-animate {
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .scroll-animate.animate-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    html { scroll-behavior: smooth; }
    /* Navbar: starts transparent, turns dark on scroll */
    .landing-nav {
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      background: transparent;
    }
    .landing-nav.scrolled {
      background: rgba(15, 23, 42, 0.97);
      backdrop-filter: blur(16px);
      box-shadow: 0 4px 30px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body class="bg-white min-h-screen">
  <!-- Sticky Navigation — Starts fully transparent over hero image -->
  <nav id="landing-nav" class="landing-nav fixed top-0 left-0 right-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="logo-mark w-9 h-9"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div class="leading-tight">
          <span class="text-white font-bold text-lg tracking-tight">RoofReporterAI</span>
          <span class="hidden sm:block text-gray-400 text-[10px] -mt-0.5">Measurement Reports & Business CRM</span>
        </div>
      </a>

      <!-- Desktop nav -->
      <div class="hidden md:flex items-center gap-6">
        <a href="#how-it-works" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">How It Works</a>
        <a href="#features" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">Platform</a>
        <a href="#pricing" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">Pricing</a>
        <a href="/blog" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">Blog</a>
        <a href="/lander" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">Get Started</a>
        <a href="#faq" class="text-gray-300 hover:text-white text-sm font-medium transition-colors">FAQ</a>
        <a href="/signup" class="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-all hover:scale-105 shadow-lg shadow-cyan-500/25">
          <i class="fas fa-sign-in-alt mr-1"></i>Login
        </a>
      </div>

      <!-- Mobile menu button -->
      <button id="mobile-menu-btn" class="md:hidden text-white text-xl p-2" onclick="document.getElementById('mobile-menu').classList.toggle('hidden')">
        <i class="fas fa-bars"></i>
      </button>
    </div>

    <!-- Mobile menu -->
    <div id="mobile-menu" class="hidden md:hidden bg-slate-900/98 backdrop-blur-xl border-t border-white/10">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
        <a href="#how-it-works" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">How It Works</a>
        <a href="#features" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Platform</a>
        <a href="#pricing" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Pricing</a>
        <a href="/blog" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Blog</a>
        <a href="/lander" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Get Started</a>
        <a href="#faq" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all" onclick="document.getElementById('mobile-menu').classList.add('hidden')">FAQ</a>
        <a href="/signup" class="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Login / Sign Up</a>
      </div>
    </div>
  </nav>

  <!-- Landing page content -->
  <div id="landing-root"></div>

  <!-- Contact Us Lead Capture -->
  ${getContactFormHTML('homepage')}

  <!-- Footer — Dark premium style -->
  <footer class="bg-slate-900 text-gray-400">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div class="grid md:grid-cols-4 gap-8">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <span class="logo-mark w-9 h-9"><img src="/static/logo.png" alt="RoofReporterAI"></span>
            <span class="text-white font-bold text-lg tracking-tight">RoofReporterAI</span>
          </div>
          <p class="text-sm leading-relaxed text-gray-500">Professional AI-powered roof measurement reports, CRM, and business management for roofing companies across Canada.</p>
          <div class="flex items-center gap-4 mt-6">
            <a href="#" class="text-gray-500 hover:text-cyan-400 transition-colors"><i class="fab fa-facebook text-lg"></i></a>
            <a href="#" class="text-gray-500 hover:text-cyan-400 transition-colors"><i class="fab fa-instagram text-lg"></i></a>
            <a href="#" class="text-gray-500 hover:text-cyan-400 transition-colors"><i class="fab fa-linkedin text-lg"></i></a>
          </div>
        </div>
        <div>
          <h4 class="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Product</h4>
          <ul class="space-y-2.5 text-sm">
            <li><a href="#features" class="hover:text-cyan-400 transition-colors">Measurement Reports</a></li>
            <li><a href="#features" class="hover:text-cyan-400 transition-colors">AI Roofer Secretary</a></li>
            <li><a href="#features" class="hover:text-cyan-400 transition-colors">CRM & Invoicing</a></li>
            <li><a href="#features" class="hover:text-cyan-400 transition-colors">Virtual Roof Try-On</a></li>
            <li><a href="#pricing" class="hover:text-cyan-400 transition-colors">Pricing</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Resources</h4>
          <ul class="space-y-2.5 text-sm">
            <li><a href="/blog" class="hover:text-cyan-400 transition-colors">Blog</a></li>
            <li><a href="#how-it-works" class="hover:text-cyan-400 transition-colors">How It Works</a></li>
            <li><a href="#faq" class="hover:text-cyan-400 transition-colors">FAQ</a></li>
            <li><a href="/lander" class="hover:text-cyan-400 transition-colors">Get Started Guide</a></li>
            <li><a href="mailto:reports@reusecanada.ca" class="hover:text-cyan-400 transition-colors">Contact</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Get Started</h4>
          <p class="text-sm text-gray-500 mb-4">Start with 3 free reports. No credit card required.</p>
          <a href="/signup" class="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-all shadow-lg">
            Sign Up Free
          </a>
        </div>
      </div>
      <div class="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-sm text-gray-500">&copy; 2026 RoofReporterAI. All rights reserved.</p>
        <div class="flex items-center gap-6 text-sm text-gray-500">
          <span class="flex items-center gap-1.5"><i class="fas fa-map-marker-alt text-cyan-500"></i> Alberta, Canada</span>
          <a href="mailto:reports@reusecanada.ca" class="flex items-center gap-1.5 hover:text-cyan-400 transition-colors"><i class="fas fa-envelope text-cyan-500"></i> reports@reusecanada.ca</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Navbar scroll effect -->
  <script>
    window.addEventListener('scroll', () => {
      const nav = document.getElementById('landing-nav');
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    });
  </script>
  <script src="/static/landing.js?v=${BUILD_VERSION}"></script>
  ${getRoverWidget()}
</body>
</html>`
}

function getSettingsPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Settings - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div>
          <h1 class="text-xl font-bold">Settings</h1>
          <p class="text-brand-200 text-xs">Company Profile, API Keys & Pricing</p>
        </div>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-home mr-1"></i>Home</a>
        <a href="/order/new" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-plus mr-1"></i>New Order</a>
        <a href="/admin" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-tachometer-alt mr-1"></i>Admin</a>
        <a href="/super-admin" class="text-yellow-300 hover:text-white text-sm font-semibold"><i class="fas fa-crown mr-1"></i>Super Admin</a>
      </nav>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8">
    <div id="settings-root"></div>
  </main>
  <script src="/static/settings.js?v=${BUILD_VERSION}"></script>
</body>
</html>`
}

// ============================================================
// CUSTOMER PAGES
// ============================================================

function getCustomerLoginHTML() {

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Customer Login - RoofReporterAI</title>
</head>
<body class="bg-gradient-to-br from-sky-100 via-blue-50 to-white min-h-screen flex items-center justify-center">
  <div class="w-full max-w-md mx-auto px-4">
    <!-- Logo -->
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-3">
        <span class="logo-mark logo-mark-light w-12 h-12"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div class="text-left">
          <span class="text-gray-800 font-bold text-2xl block">RoofReporterAI</span>
          <span class="text-sky-600 text-xs">Customer Portal - Roof Reports & CRM</span>
        </div>
      </a>
    </div>

    <!-- Auth Card -->
    <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div class="p-8">
        <h2 class="text-xl font-bold text-gray-800 mb-1">Welcome</h2>
        <p class="text-sm text-gray-500 mb-6">Sign in to view your roof reports, invoices, and order history</p>

        <!-- Tabs -->
        <div class="flex border border-gray-200 rounded-lg overflow-hidden mb-5">
          <button id="custLoginTab" onclick="showCustTab('login')" class="flex-1 py-2.5 text-center text-sm font-medium bg-brand-50 text-brand-700 border-b-2 border-brand-500">Sign In</button>
          <button id="custRegTab" onclick="showCustTab('register')" class="flex-1 py-2.5 text-center text-sm font-medium text-gray-500 hover:text-gray-700">Register</button>
        </div>

        <!-- Login Form -->
        <div id="custLoginForm">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" id="custLoginEmail" placeholder="you@company.com" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" id="custLoginPassword" placeholder="Enter your password" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm" onkeyup="if(event.key==='Enter')doCustLogin()">
            </div>
          </div>
          <div id="custLoginError" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
          <button onclick="doCustLogin()" class="w-full mt-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-brand-500/25">
            <i class="fas fa-sign-in-alt mr-2"></i>Sign In
          </button>
        </div>

        <!-- Register Form - Step 1: Email Verification -->
        <div id="custRegForm" class="hidden">
          <!-- Step 1: Verify Email -->
          <div id="regStep1">
            <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <p class="text-sm text-blue-800"><i class="fas fa-shield-alt mr-1"></i> <strong>Email verification required.</strong> We'll send a 6-digit code to confirm your email.</p>
            </div>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input type="text" id="custRegName" placeholder="John Smith" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input type="text" id="custRegCompany" placeholder="Smith Roofing" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <div class="flex gap-2">
                  <input type="email" id="custRegEmail" placeholder="you@company.com" class="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
                  <button onclick="sendVerifyCode()" id="sendCodeBtn" class="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-sm whitespace-nowrap transition-all">
                    <i class="fas fa-paper-plane mr-1"></i>Send Code
                  </button>
                </div>
              </div>
            </div>
            <div id="regStep1Error" class="hidden mt-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
            <div id="regStep1Success" class="hidden mt-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm"></div>
          </div>

          <!-- Step 2: Enter Code + Complete Registration (shown after code sent) -->
          <div id="regStep2" class="hidden">
            <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p class="text-sm text-green-800"><i class="fas fa-envelope-open-text mr-1"></i> Code sent to <strong id="regSentEmail"></strong>. Enter it below.</p>
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Verification Code *</label>
                <div class="flex gap-2 items-center">
                  <input type="text" id="custRegCode" placeholder="123456" maxlength="6" class="w-40 px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-brand-500" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                  <button onclick="verifyCodeStep()" id="verifyCodeBtn" class="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm transition-all">
                    <i class="fas fa-check mr-1"></i>Verify
                  </button>
                  <button onclick="sendVerifyCode()" class="px-3 py-2.5 text-sky-600 hover:text-sky-800 text-sm font-medium">Resend</button>
                </div>
              </div>
              <div id="regCodeVerified" class="hidden p-3 bg-green-100 border border-green-300 rounded-xl">
                <p class="text-sm text-green-800 font-semibold"><i class="fas fa-check-circle mr-1"></i> Email verified! Complete your details below.</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" id="custRegPhone" placeholder="(780) 555-1234" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" id="custRegPassword" placeholder="Min 6 characters" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input type="password" id="custRegConfirm" placeholder="Confirm password" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500" onkeyup="if(event.key==='Enter')doCustRegister()">
            </div>
          </div>
          <div id="custRegError" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
          <div id="regStep2Fields" class="hidden">
          <button onclick="doCustRegister()" id="regSubmitBtn" class="w-full mt-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
            <i class="fas fa-user-plus mr-2"></i>Create Account
          </button>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Links -->
    <div class="text-center mt-6 space-y-3">
      <div class="bg-white/80 backdrop-blur rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-sm text-gray-600 mb-2">New to RoofReporterAI?</p>
        <a href="/signup" class="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold py-2.5 px-6 rounded-xl text-sm transition-all hover:scale-[1.02] shadow-lg shadow-green-500/25">
          <i class="fas fa-rocket"></i>Start Free Trial — No Credit Card
        </a>
      </div>
      <div class="space-x-4">
        <a href="/login" class="text-gray-400 hover:text-gray-600 text-sm transition-colors"><i class="fas fa-shield-alt mr-1"></i>Admin Login</a>
        <a href="/" class="text-gray-400 hover:text-gray-600 text-sm transition-colors"><i class="fas fa-arrow-left mr-1"></i>Back to homepage</a>
      </div>
    </div>
  </div>

  <script>
    // Check if already logged in
    (function() {
      const c = localStorage.getItem('rc_customer');
      if (c) window.location.href = '/customer/dashboard';
    })();

    function showCustTab(tab) {
      document.getElementById('custLoginForm').classList.toggle('hidden', tab !== 'login');
      document.getElementById('custRegForm').classList.toggle('hidden', tab !== 'register');
      const lt = document.getElementById('custLoginTab');
      const rt = document.getElementById('custRegTab');
      if (tab === 'login') {
        lt.classList.add('bg-brand-50','text-brand-700','border-b-2','border-brand-500');
        lt.classList.remove('text-gray-500');
        rt.classList.remove('bg-brand-50','text-brand-700','border-b-2','border-brand-500');
        rt.classList.add('text-gray-500');
      } else {
        rt.classList.add('bg-brand-50','text-brand-700','border-b-2','border-brand-500');
        rt.classList.remove('text-gray-500');
        lt.classList.remove('bg-brand-50','text-brand-700','border-b-2','border-brand-500');
        lt.classList.add('text-gray-500');
      }
    }

    async function doCustLogin() {
      const email = document.getElementById('custLoginEmail').value.trim();
      const password = document.getElementById('custLoginPassword').value;
      const err = document.getElementById('custLoginError');
      err.classList.add('hidden');
      if (!email || !password) { err.textContent = 'Email and password required.'; err.classList.remove('hidden'); return; }
      try {
        const res = await fetch('/api/customer/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('rc_customer', JSON.stringify(data.customer));
          localStorage.setItem('rc_customer_token', data.token);
          window.location.href = '/customer/dashboard';
        } else {
          err.textContent = data.error || 'Login failed.';
          err.classList.remove('hidden');
        }
      } catch(e) { err.textContent = 'Network error.'; err.classList.remove('hidden'); }
    }

    var _regVerificationToken = null;

    async function sendVerifyCode() {
      const email = document.getElementById('custRegEmail').value.trim();
      const name = document.getElementById('custRegName').value.trim();
      const err = document.getElementById('regStep1Error');
      const suc = document.getElementById('regStep1Success');
      const btn = document.getElementById('sendCodeBtn');
      err.classList.add('hidden'); suc.classList.add('hidden');

      if (!name) { err.textContent = 'Please enter your name first.'; err.classList.remove('hidden'); return; }
      if (!email) { err.textContent = 'Please enter your email address.'; err.classList.remove('hidden'); return; }
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; err.classList.remove('hidden'); return; }

      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Sending...';
      try {
        const res = await fetch('/api/customer/send-verification', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // Show the verification code step
          document.getElementById('regStep2').classList.remove('hidden');
          document.getElementById('regSentEmail').textContent = email;
          document.getElementById('custRegCode').focus();
          // Disable email field after sending
          document.getElementById('custRegEmail').readOnly = true;
          document.getElementById('custRegEmail').classList.add('bg-gray-100');

          // Check if email was actually sent or if we got a fallback code
          if (data.email_sent === false && data.fallback_code) {
            // Email delivery unavailable — show the code directly
            suc.innerHTML = '<i class="fas fa-exclamation-triangle text-amber-600 mr-1"></i> Email delivery is temporarily unavailable.<br>'
              + '<span class="font-mono text-2xl font-bold tracking-widest text-blue-700 block my-2">' + data.fallback_code + '</span>'
              + '<span class="text-xs text-gray-500">Enter this code below to verify your email and continue registration.</span>';
            suc.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'border-green-200');
            suc.classList.add('bg-amber-50', 'text-amber-900', 'border', 'border-amber-200');
          } else {
            suc.textContent = data.message || 'Code sent! Check your inbox.';
            suc.classList.remove('hidden');
          }

          // Start 60s cooldown
          var cd = 60;
          btn.disabled = true;
          var iv = setInterval(function() { cd--; btn.innerHTML = '<i class="fas fa-clock mr-1"></i>' + cd + 's'; if (cd <= 0) { clearInterval(iv); btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Resend'; } }, 1000);
        } else {
          err.textContent = data.error || 'Failed to send code.';
          err.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Send Code';
        }
      } catch(e) { err.textContent = 'Network error. Please try again.'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Send Code'; }
    }

    async function verifyCodeStep() {
      const email = document.getElementById('custRegEmail').value.trim();
      const code = document.getElementById('custRegCode').value.trim();
      const err = document.getElementById('custRegError');
      const btn = document.getElementById('verifyCodeBtn');
      err.classList.add('hidden');

      if (!code || code.length !== 6) { err.textContent = 'Please enter the 6-digit code.'; err.classList.remove('hidden'); return; }

      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Verifying...';
      try {
        const res = await fetch('/api/customer/verify-code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code })
        });
        const data = await res.json();
        if (res.ok && data.verified) {
          _regVerificationToken = data.verification_token;
          document.getElementById('regCodeVerified').classList.remove('hidden');
          document.getElementById('regStep2Fields').classList.remove('hidden');
          document.getElementById('regSubmitBtn').disabled = false;
          document.getElementById('custRegCode').readOnly = true;
          document.getElementById('custRegCode').classList.add('bg-green-50', 'border-green-400');
          btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verified'; btn.disabled = true;
          btn.classList.remove('bg-green-600', 'hover:bg-green-700');
          btn.classList.add('bg-green-400', 'cursor-default');
        } else {
          err.textContent = data.error || 'Invalid code. Please try again.';
          err.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verify';
        }
      } catch(e) { err.textContent = 'Network error.'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verify'; }
    }

    async function doCustRegister() {
      const name = document.getElementById('custRegName').value.trim();
      const company = document.getElementById('custRegCompany').value.trim();
      const email = document.getElementById('custRegEmail').value.trim();
      const phone = document.getElementById('custRegPhone').value.trim();
      const password = document.getElementById('custRegPassword').value;
      const confirm = document.getElementById('custRegConfirm').value;
      const err = document.getElementById('custRegError');
      err.classList.add('hidden');
      if (!name || !email || !password) { err.textContent = 'Name, email, and password required.'; err.classList.remove('hidden'); return; }
      if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.classList.remove('hidden'); return; }
      if (password !== confirm) { err.textContent = 'Passwords do not match.'; err.classList.remove('hidden'); return; }
      if (!_regVerificationToken) { err.textContent = 'Please verify your email first.'; err.classList.remove('hidden'); return; }
      try {
        const res = await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, phone, company_name: company, verification_token: _regVerificationToken })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('rc_customer', JSON.stringify(data.customer));
          localStorage.setItem('rc_customer_token', data.token);
          window.location.href = '/customer/dashboard';
        } else {
          err.textContent = data.error || 'Registration failed.';
          err.classList.remove('hidden');
        }
      } catch(e) { err.textContent = 'Network error.'; err.classList.remove('hidden'); }
    }
  </script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// SIGNUP WIZARD — 3-Step Onboarding (Business Info → Plan → Activate)
// ============================================================
function getSignupWizardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Get Started - RoofReporterAI</title>
  <meta name="description" content="Sign up for RoofReporterAI — AI-powered satellite roof measurement reports for Canadian roofing contractors. 14-day free trial.">
  <style>
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn { animation: fadeIn 0.35s ease-out; }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 via-blue-50/30 to-white min-h-screen">
  <!-- Minimal Top Bar -->
  <div class="bg-white/80 backdrop-blur border-b border-gray-200/60">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span class="logo-mark logo-mark-light w-8 h-8"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-gray-800 font-bold text-lg">RoofReporterAI</span>
      </a>
      <a href="/customer/login" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Already have an account? <span class="font-semibold text-blue-600">Sign in</span>
      </a>
    </div>
  </div>

  <!-- Wizard Container -->
  <main class="max-w-5xl mx-auto px-4 py-8 sm:py-12">
    <div id="wizard-root"></div>
  </main>

  <!-- Footer -->
  <footer class="py-6 text-center text-xs text-gray-400 border-t border-gray-100">
    <div class="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
      <a href="/terms" class="hover:text-gray-600">Terms</a>
      <a href="/privacy" class="hover:text-gray-600">Privacy</a>
      <span>&copy; ${new Date().getFullYear()} RoofReporterAI — Alberta, Canada</span>
    </div>
  </footer>

  <script src="/static/js/signup-wizard.js?v=${BUILD_VERSION}"></script>
  ${getRoverWidget()}
</body>
</html>`
}

function getCustomerDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>My Dashboard - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/" class="flex items-center space-x-3 hover:opacity-90 transition-opacity">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-xl font-bold">My Dashboard</h1>
            <p class="text-brand-200 text-xs">RoofReporterAI - Roof Reports & CRM</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-4">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-home mr-1"></i>Home</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-4 py-8">
    <div id="customer-root"></div>
  </main>
  <script>
    // Auth guard
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/customer-dashboard.js?v=${Date.now()}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

function getCustomerInvoiceHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Invoice - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-xl font-bold">Invoice</h1>
            <p class="text-brand-200 text-xs">RoofReporterAI</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-arrow-left mr-1"></i>Back to Dashboard</a>
      </nav>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8">
    <div id="invoice-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
    })();
  </script>
  <script src="/static/customer-invoice.js?v=${BUILD_VERSION}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// PRICING PAGE — Public, shows credit packs & per-report pricing
// ============================================================
function getPricingPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Pricing - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="logo-mark w-9 h-9"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-white font-bold text-lg">RoofReporterAI</span>
      </a>
      <div class="flex items-center gap-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm">Home</a>
        <a href="/signup" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
    </div>
  </nav>
  <main class="max-w-6xl mx-auto px-4 py-16">
    <div id="pricing-root">
      <div class="text-center mb-12">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h1>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">Professional AI-powered roof measurement reports. Pay per report or save with credit packs.</p>
      </div>
      <div class="text-center animate-pulse text-gray-400 py-8">Loading pricing...</div>
    </div>
  </main>
  ${getContactFormHTML('pricing')}
  <script src="/static/pricing.js?v=${BUILD_VERSION}"></script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// BLOG LISTING PAGE — Public SEO lead funnel
// ============================================================
function getBlogListingHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Blog - RoofReporterAI | Roofing Industry Insights & Tips</title>
  <meta name="description" content="Expert roofing industry insights, measurement technology tips, contractor business guides, and more from RoofReporterAI.">
  <meta property="og:title" content="RoofReporterAI Blog - Roofing Industry Insights">
  <meta property="og:description" content="Expert roofing industry insights, measurement technology tips, contractor business guides, and more.">
  <meta property="og:type" content="website">
  <link rel="canonical" href="/blog">
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Navigation — Matches new homepage style -->
  <nav class="bg-slate-900 text-white sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="logo-mark w-9 h-9"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-white font-bold text-lg tracking-tight">RoofReporterAI</span>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/" class="text-gray-400 hover:text-white text-sm font-medium">Home</a>
        <a href="/#pricing" class="text-gray-400 hover:text-white text-sm font-medium">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm border-b-2 border-cyan-400 pb-0.5">Blog</a>
        <a href="/lander" class="text-gray-400 hover:text-white text-sm font-medium">Get Started</a>
        <a href="/customer/login" class="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Login</a>
      </div>
      <button class="md:hidden text-white text-xl" onclick="document.getElementById('blog-mobile-menu').classList.toggle('hidden')"><i class="fas fa-bars"></i></button>
    </div>
    <div id="blog-mobile-menu" class="hidden md:hidden bg-slate-800/98 backdrop-blur-xl border-t border-white/10">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
        <a href="/" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5">Home</a>
        <a href="/#pricing" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm py-2.5 px-3 rounded-lg bg-white/5">Blog</a>
        <a href="/lander" class="text-gray-300 hover:text-white text-sm py-2.5 px-3 rounded-lg hover:bg-white/5">Get Started</a>
        <a href="/customer/login" class="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Login</a>
      </div>
    </div>
  </nav>

  <!-- Hero Section — Dark theme matching new brand -->
  <div class="bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white py-16 md:py-20">
    <div class="max-w-4xl mx-auto px-4 text-center">
      <div class="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-4 py-1.5 mb-6">
        <i class="fas fa-newspaper text-cyan-400 text-sm"></i>
        <span class="text-sm font-medium text-cyan-200">Industry Insights</span>
      </div>
      <h1 class="text-4xl md:text-5xl font-black mb-4 tracking-tight">The RoofReporterAI Blog</h1>
      <p class="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">Roofing industry insights, AI measurement technology, contractor business tips, and everything you need to grow your roofing business.</p>
      <div class="mt-8 flex flex-wrap justify-center gap-3" id="blog-categories-hero"></div>
    </div>
  </div>

  <!-- Search + Filter Bar -->
  <div class="max-w-6xl mx-auto px-4 -mt-6 relative z-10 mb-8">
    <div class="bg-white rounded-xl shadow-lg p-4 flex flex-col md:flex-row items-center gap-4">
      <div class="flex-1 relative w-full">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input type="text" id="blog-search" placeholder="Search articles..." class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none">
      </div>
      <div class="flex items-center gap-2 flex-wrap" id="blog-category-filters"></div>
    </div>
  </div>

  <!-- Blog Grid -->
  <main class="max-w-6xl mx-auto px-4 pb-20">
    <!-- Featured Post -->
    <div id="blog-featured" class="mb-12"></div>
    
    <!-- All Posts Grid -->
    <div id="blog-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      <div class="col-span-full text-center py-16">
        <div class="animate-pulse text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-4"></i><p class="text-sm">Loading articles...</p></div>
      </div>
    </div>
    
    <!-- Load More -->
    <div id="blog-load-more" class="text-center mt-12 hidden">
      <button onclick="loadMorePosts()" class="bg-white border-2 border-cyan-500 text-cyan-600 hover:bg-cyan-50 font-semibold py-3 px-8 rounded-lg text-sm transition-all">
        Load More Articles
      </button>
    </div>
    
    <!-- Empty State -->
    <div id="blog-empty" class="hidden text-center py-20">
      <i class="fas fa-newspaper text-6xl text-gray-200 mb-6"></i>
      <h3 class="text-xl font-bold text-gray-600 mb-2">No articles yet</h3>
      <p class="text-gray-400 text-sm">Check back soon — we're writing great content for roofing professionals!</p>
    </div>

    <!-- Funnel CTA — Every blog reader gets pushed to lander -->
    <div class="mt-16 bg-gradient-to-r from-slate-900 via-cyan-900 to-slate-900 rounded-2xl p-8 md:p-12 text-center text-white">
      <h3 class="text-2xl md:text-3xl font-black mb-3 tracking-tight">Ready to Try It Yourself?</h3>
      <p class="text-gray-300 mb-6 max-w-xl mx-auto">Get 3 free professional roof measurement reports. No credit card required. Full CRM included.</p>
      <a href="/lander" class="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.02]">
        <i class="fas fa-gift"></i>
        Claim Your 3 Free Reports
        <i class="fas fa-arrow-right text-sm ml-1"></i>
      </a>
    </div>
  </main>

  <!-- Contact Us Lead Capture -->
  ${getContactFormHTML('blog')}

  <!-- Footer — Dark style matching new brand -->
  <footer class="bg-slate-900 text-gray-500 border-t border-gray-800">
    <div class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="logo-mark w-8 h-8"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <span class="text-gray-300 font-bold">RoofReporterAI</span>
        </div>
        <div class="flex items-center gap-6 text-sm">
          <a href="/" class="hover:text-cyan-400 transition-colors">Home</a>
          <a href="/#pricing" class="hover:text-cyan-400 transition-colors">Pricing</a>
          <a href="/blog" class="text-cyan-400 font-semibold">Blog</a>
          <a href="/lander" class="hover:text-cyan-400 transition-colors">Get Started</a>
          <a href="/customer/login" class="hover:text-cyan-400 transition-colors">Login</a>
        </div>
        <p class="text-xs text-gray-600">&copy; 2026 RoofReporterAI. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="/static/blog.js?v=${BUILD_VERSION}"></script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// BLOG POST PAGE — Individual article view with SEO
// ============================================================
function getBlogPostHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title id="page-title">Blog Post - RoofReporterAI</title>
  <meta name="description" id="meta-desc" content="">
  <meta property="og:type" content="article">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tailwindcss/typography@0.5.0/dist/typography.min.css">
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Navigation -->
  <nav class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="logo-mark w-9 h-9"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-white font-bold text-lg">RoofReporterAI</span>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/" class="text-brand-200 hover:text-white text-sm">Home</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm">Blog</a>
        <a href="/signup" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
      <button class="md:hidden text-white text-xl" onclick="document.getElementById('bp-mobile').classList.toggle('hidden')"><i class="fas fa-bars"></i></button>
    </div>
    <div id="bp-mobile" class="hidden md:hidden bg-sky-600/95 backdrop-blur-md border-t border-sky-400">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3">
        <a href="/" class="text-brand-200 hover:text-white text-sm py-2">Home</a>
        <a href="/blog" class="text-white font-semibold text-sm py-2">Blog</a>
        <a href="/signup" class="bg-accent-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
    </div>
  </nav>

  <!-- Breadcrumb -->
  <div class="max-w-4xl mx-auto px-4 py-4">
    <nav class="text-sm text-gray-500">
      <a href="/" class="hover:text-sky-600">Home</a>
      <span class="mx-2">/</span>
      <a href="/blog" class="hover:text-sky-600">Blog</a>
      <span class="mx-2">/</span>
      <span id="breadcrumb-title" class="text-gray-700 font-medium">Loading...</span>
    </nav>
  </div>

  <!-- Article Content -->
  <main class="max-w-4xl mx-auto px-4 pb-20">
    <article id="blog-post-content">
      <div class="text-center py-16 animate-pulse text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-4"></i><p>Loading article...</p></div>
    </article>

    <!-- Author / CTA Box -->
    <div id="blog-cta" class="hidden mt-12 bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-2xl p-8 text-center">
      <h3 class="text-xl font-bold text-gray-900 mb-2">Ready to streamline your roof measurements?</h3>
      <p class="text-gray-600 mb-6 max-w-lg mx-auto">Join hundreds of roofing professionals who save hours on every estimate with AI-powered measurement reports.</p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a href="/signup" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-3 px-8 rounded-lg transition-all hover:scale-105 shadow-lg shadow-accent-500/25"><i class="fas fa-rocket mr-2"></i>Start Free Trial</a>
        <a href="/pricing" class="text-sky-600 hover:text-sky-700 font-semibold text-sm"><i class="fas fa-tag mr-1"></i>View Pricing</a>
      </div>
    </div>

    <!-- Related Posts -->
    <div id="blog-related" class="mt-16 hidden">
      <h3 class="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
      <div id="blog-related-grid" class="grid md:grid-cols-3 gap-6"></div>
    </div>
  </main>

  <!-- Contact Us Lead Capture -->
  ${getContactFormHTML('blog-post')}

  <!-- Footer -->
  <footer class="bg-slate-100 text-gray-600 border-t border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <span class="logo-mark w-8 h-8"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <span class="text-gray-800 font-bold">RoofReporterAI</span>
        </div>
        <div class="flex items-center gap-6 text-sm">
          <a href="/" class="hover:text-sky-600">Home</a>
          <a href="/blog" class="hover:text-sky-600 font-semibold text-sky-600">Blog</a>
          <a href="/customer/login" class="hover:text-sky-600">Login</a>
        </div>
        <p class="text-xs text-gray-400">&copy; 2026 RoofReporterAI. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="/static/blog.js?v=${BUILD_VERSION}"></script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// LANDING FUNNEL — Social media, blog, FB/IG traffic
// All social posts and blog links redirect here
// ============================================================
function getLanderFunnelHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Get Your Free Roof Measurement Report - RoofReporterAI</title>
  <meta name="description" content="Professional satellite-powered roof measurement reports in under 60 seconds. Start with 3 FREE reports. No credit card required. Used by roofing contractors across Canada.">
  <meta property="og:title" content="Free Roof Measurement Reports - RoofReporterAI">
  <meta property="og:description" content="Get accurate roof area, pitch, material BOM, and more in 60 seconds. 3 free reports. No credit card.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://roofreporterai.com/lander">
  <style>
    html { scroll-behavior: smooth; }
    .scroll-animate { opacity: 0; transform: translateY(20px); transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1); }
    .scroll-animate.animate-in { opacity: 1 !important; transform: translateY(0) !important; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
    .float-anim { animation: float 3s ease-in-out infinite; }
  </style>
</head>
<body class="bg-white min-h-screen">
  <!-- Minimal top bar -->
  <nav class="bg-slate-900 text-white">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="logo-mark w-7 h-7"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-white font-bold text-sm">RoofReporterAI</span>
      </a>
      <a href="/signup" class="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold py-1.5 px-4 rounded-lg hover:opacity-90 transition-opacity">Sign Up Free</a>
    </div>
  </nav>

  <!-- HERO — High-impact conversion section -->
  <section class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white py-20 lg:py-28">
    <div class="absolute inset-0 opacity-10">
      <div class="absolute inset-0" style="background-image: radial-gradient(circle, rgba(34,211,238,0.3) 1px, transparent 1px); background-size: 30px 30px;"></div>
    </div>

    <div class="relative max-w-6xl mx-auto px-4">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div class="inline-flex items-center gap-2 bg-green-500/10 border border-green-400/30 rounded-full px-4 py-1.5 mb-6">
            <i class="fas fa-gift text-green-400 text-sm"></i>
            <span class="text-sm font-medium text-green-300">3 FREE Reports on Signup — No Credit Card</span>
          </div>

          <h1 class="text-4xl lg:text-6xl font-black leading-tight mb-6 tracking-tight">
            Stop Climbing Roofs.<br/>
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-300">Start Measuring Smarter.</span>
          </h1>

          <p class="text-lg text-gray-300 mb-8 leading-relaxed max-w-xl">
            Get a <strong class="text-white">professional roof measurement report</strong> from satellite imagery in under 60 seconds. Accurate area, pitch, edge breakdowns, and a full material BOM — everything you need to quote a job.
          </p>

          <a href="/signup" class="group inline-flex items-center gap-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-2xl shadow-green-500/25 transition-all hover:scale-[1.02] mb-6">
            <i class="fas fa-rocket"></i>
            Claim Your 3 Free Reports
            <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </a>

          <div class="flex items-center gap-6 text-sm text-gray-400">
            <span class="flex items-center gap-1.5"><i class="fas fa-check text-green-400"></i> No credit card</span>
            <span class="flex items-center gap-1.5"><i class="fas fa-check text-green-400"></i> 60-second delivery</span>
            <span class="flex items-center gap-1.5"><i class="fas fa-check text-green-400"></i> Full CRM free</span>
          </div>
        </div>

        <!-- Floating report preview -->
        <div class="hidden lg:block">
          <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 float-anim">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-file-alt text-cyan-400"></i>
              </div>
              <div>
                <p class="font-bold text-white text-sm">Roof Measurement Report</p>
                <p class="text-xs text-gray-400">Generated in 42 seconds</p>
              </div>
              <span class="ml-auto bg-green-500/20 text-green-300 text-xs px-2.5 py-1 rounded-full font-medium">HIGH Quality</span>
            </div>
            <div class="grid grid-cols-3 gap-3 mb-4">
              <div class="bg-white/5 rounded-lg p-3 text-center">
                <p class="text-xl font-bold text-cyan-300">3,826</p>
                <p class="text-[10px] text-gray-500 uppercase">Area (ft²)</p>
              </div>
              <div class="bg-white/5 rounded-lg p-3 text-center">
                <p class="text-xl font-bold text-blue-300">12</p>
                <p class="text-[10px] text-gray-500 uppercase">Segments</p>
              </div>
              <div class="bg-white/5 rounded-lg p-3 text-center">
                <p class="text-xl font-bold text-amber-300">21.6°</p>
                <p class="text-[10px] text-gray-500 uppercase">Avg Pitch</p>
              </div>
            </div>
            <div class="bg-white/5 rounded-lg p-3">
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Material Estimate</span>
                <span class="font-bold text-white">$8,427 CAD</span>
              </div>
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>132 bundles | 44 squares | 15% waste</span>
                <span class="text-amber-400">Very Complex</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- WHAT YOU GET — Quick feature list -->
  <section class="py-16 bg-gray-50">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-12 scroll-animate">
        <h2 class="text-3xl font-black text-gray-900 mb-3 tracking-tight">What's in Every $8 Report</h2>
        <p class="text-gray-500">Your first 3 are FREE. Full professional report, no restrictions.</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${[
          { icon: 'fas fa-ruler-combined', title: 'True 3D Area', desc: 'Pitch-adjusted surface area, not footprint' },
          { icon: 'fas fa-draw-polygon', title: 'Edge Breakdown', desc: 'Ridge, hip, valley, eave — plan & 3D' },
          { icon: 'fas fa-boxes-stacked', title: 'Full Material BOM', desc: 'Shingles, underlayment, flashing, nails' },
          { icon: 'fas fa-layer-group', title: 'Segment Analysis', desc: 'Pitch, azimuth, direction per plane' },
          { icon: 'fas fa-solar-panel', title: 'Solar Potential', desc: 'Panel count & yearly energy — free' },
          { icon: 'fas fa-chart-pie', title: 'Complexity Rating', desc: 'Waste factor & difficulty score' },
        ].map(f => '<div class="scroll-animate bg-white rounded-xl p-5 border border-gray-200 hover:border-cyan-200 hover:shadow-lg transition-all"><div class="flex items-start gap-4"><div class="w-10 h-10 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0"><i class="' + f.icon + ' text-cyan-600"></i></div><div><h3 class="font-bold text-gray-900 text-sm mb-1">' + f.title + '</h3><p class="text-xs text-gray-500">' + f.desc + '</p></div></div></div>').join('')}
      </div>
    </div>
  </section>

  <!-- SOCIAL PROOF — Quick testimonials -->
  <section class="py-16 bg-white">
    <div class="max-w-4xl mx-auto px-4">
      <div class="text-center mb-10 scroll-animate">
        <h2 class="text-2xl font-black text-gray-900 tracking-tight">Trusted by Roofers Across Canada</h2>
      </div>
      <div class="grid md:grid-cols-3 gap-6">
        ${[
          { quote: 'Saves me 2 hours per estimate. I quote jobs from my truck now.', name: 'Mike D.', title: 'Calgary', avatar: 'MD' },
          { quote: 'The BOM alone is worth $8. Supplier orders are dead accurate.', name: 'Sarah K.', title: 'Edmonton', avatar: 'SK' },
          { quote: '15-20 estimates a week at $8 each. Way cheaper than drones.', name: 'James R.', title: 'Prairie Roofing', avatar: 'JR' }
        ].map(t => '<div class="scroll-animate bg-gray-50 rounded-xl p-5 border border-gray-100"><div class="flex gap-1 mb-3">' + [1,2,3,4,5].map(() => '<i class="fas fa-star text-amber-400 text-xs"></i>').join('') + '</div><p class="text-sm text-gray-600 mb-4">"' + t.quote + '"</p><div class="flex items-center gap-2"><div class="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">' + t.avatar + '</div><div><p class="text-sm font-semibold text-gray-800">' + t.name + '</p><p class="text-xs text-gray-400">' + t.title + '</p></div></div></div>').join('')}
      </div>
    </div>
  </section>

  <!-- PLATFORM PREVIEW — More than reports -->
  <section class="py-16 bg-gradient-to-b from-gray-50 to-white">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-12 scroll-animate">
        <h2 class="text-3xl font-black text-gray-900 mb-3 tracking-tight">More Than Just Reports</h2>
        <p class="text-gray-500">A full business management platform for roofing companies.</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        ${[
          { icon: 'fas fa-phone-alt', title: 'AI Phone Secretary', desc: '24/7 AI answers calls, books leads. $149/mo.', color: 'from-indigo-500 to-purple-500' },
          { icon: 'fas fa-th-large', title: 'Full CRM', desc: 'Customers, invoices, proposals, jobs. FREE.', color: 'from-cyan-500 to-blue-500' },
          { icon: 'fas fa-palette', title: 'Virtual Try-On', desc: 'AI roof visualization for homeowners.', color: 'from-pink-500 to-rose-500' },
          { icon: 'fas fa-door-open', title: 'D2D Manager', desc: 'Door-to-door sales tracking & maps.', color: 'from-emerald-500 to-teal-500' },
        ].map(f => '<div class="scroll-animate bg-white rounded-xl p-6 border border-gray-200 hover:shadow-xl transition-all text-center"><div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br ' + f.color + ' flex items-center justify-center"><i class="' + f.icon + ' text-white"></i></div><h3 class="font-bold text-gray-900 text-sm mb-1">' + f.title + '</h3><p class="text-xs text-gray-500">' + f.desc + '</p></div>').join('')}
      </div>
    </div>
  </section>

  <!-- FINAL CTA — Strong conversion -->
  <section class="py-20 bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white relative overflow-hidden">
    <div class="absolute inset-0 opacity-5">
      <div class="absolute inset-0" style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 24px 24px;"></div>
    </div>
    <div class="relative max-w-3xl mx-auto px-4 text-center scroll-animate">
      <h2 class="text-3xl lg:text-5xl font-black mb-6 tracking-tight leading-tight">
        Your Next 3 Reports<br/>Are On Us
      </h2>
      <p class="text-lg text-gray-300 mb-10 max-w-xl mx-auto">
        Sign up in 30 seconds, get 3 free professional roof measurement reports, and access the full CRM — no credit card required.
      </p>
      <a href="/signup" class="group inline-flex items-center gap-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold py-4 px-12 rounded-xl text-lg shadow-2xl shadow-green-500/25 transition-all hover:scale-[1.02]">
        <i class="fas fa-rocket"></i>
        Start Free Now
        <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
      </a>
      <p class="text-sm text-gray-400 mt-6">Then $8 CAD per report. No subscriptions. Cancel anytime.</p>
    </div>
  </section>

  <!-- Contact Us Lead Capture -->
  ${getContactFormHTML('lander')}

  <!-- Mini footer -->
  <footer class="bg-slate-900 text-gray-500 py-8 border-t border-gray-800">
    <div class="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <span class="logo-mark w-6 h-6"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <span class="text-sm font-semibold text-gray-400">RoofReporterAI</span>
      </div>
      <div class="flex items-center gap-6 text-sm">
        <a href="/" class="hover:text-cyan-400 transition-colors">Home</a>
        <a href="/blog" class="hover:text-cyan-400 transition-colors">Blog</a>
        <a href="/customer/login" class="hover:text-cyan-400 transition-colors">Login</a>
        <a href="mailto:reports@reusecanada.ca" class="hover:text-cyan-400 transition-colors">Contact</a>
      </div>
      <p class="text-xs">&copy; 2026 RoofReporterAI</p>
    </div>
  </footer>

  <script>
    // Scroll animation
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('animate-in'); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.scroll-animate').forEach(el => obs.observe(el));
  </script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// CUSTOMER ORDER PAGE — Address entry + pay or use credit
// ============================================================
function getCustomerOrderPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? `<script>
      var googleMapsReady = false;
      function onCustomerMapsReady() {
        googleMapsReady = true;
        console.log('[Maps] Google Maps API loaded with Places library');
        if (typeof initMap === 'function') initMap();
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&callback=onCustomerMapsReady" async defer></script>`
    : '<!-- Google Maps: No API key configured -->'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Order a Report - RoofReporterAI</title>
  ${mapsScript}
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
        <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div>
          <h1 class="text-xl font-bold">Order a Report</h1>
          <p class="text-brand-200 text-xs">RoofReporterAI</p>
        </div>
      </a>
      <nav class="flex items-center space-x-4">
        <span id="creditsBadge" class="hidden bg-green-500/20 text-green-300 px-3 py-1.5 rounded-full text-sm font-medium"><i class="fas fa-coins mr-1"></i><span id="creditsCount">0</span> credits</span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-arrow-left mr-1"></i>Dashboard</a>
      </nav>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8">
    <div id="order-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
    })();
  </script>
  <script src="/static/customer-order.js?v=${Date.now()}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// VIRTUAL TRY-ON PAGE — AI Roof Visualization
// ============================================================
function getVirtualTryOnPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Virtual Try-On - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-lg font-bold">Virtual Roof Try-On</h1>
            <p class="text-brand-200 text-xs">AI-Powered Roof Visualization</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-3">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-4 py-6">
    <div id="tryon-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/virtual-tryon.js?v=${BUILD_VERSION}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// TEAM MANAGEMENT PAGE — Add/manage sales team members
// ============================================================
function getTeamManagementPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Team Management - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-lg font-bold">Team Management</h1>
            <p class="text-brand-200 text-xs">Add sales team members - $50/user/month</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-3">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-5xl mx-auto px-4 py-6">
    <div id="team-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/team-management.js?v=${BUILD_VERSION}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// JOIN TEAM PAGE — Accept invitation landing page
// ============================================================
function getJoinTeamPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Join Team - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center space-x-3">
        <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
        <div>
          <h1 class="text-xl font-bold">Team Invitation</h1>
          <p class="text-brand-200 text-xs">RoofReporterAI</p>
        </div>
      </a>
    </div>
  </header>
  <main class="max-w-lg mx-auto px-4 py-12">
    <div id="join-root">
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div>
        <span class="ml-3 text-gray-500">Validating invitation...</span>
      </div>
    </div>
  </main>
  <script>
    function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
    (async function() {
      var root = document.getElementById('join-root');
      var params = new URLSearchParams(window.location.search);
      var inviteToken = params.get('token');
      if (!inviteToken) { root.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><i class="fas fa-exclamation-circle text-red-500 text-4xl mb-3"></i><p class="text-red-700 font-semibold text-lg">No invitation token provided</p><a href="/" class="mt-4 inline-block text-blue-600 hover:underline">Go to homepage</a></div>'; return; }

      // Validate the invite
      try {
        var res = await fetch('/api/team/invite/' + inviteToken);
        var data = await res.json();
        if (!res.ok || !data.valid) {
          root.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><i class="fas fa-times-circle text-red-500 text-4xl mb-3"></i><p class="text-red-700 font-semibold text-lg">' + (data.error || 'Invalid invitation') + '</p><a href="/" class="mt-4 inline-block text-blue-600 hover:underline">Go to homepage</a></div>';
          return;
        }

        var inv = data.invite;
        var isLoggedIn = !!getToken();

        root.innerHTML = '<div class="bg-white rounded-2xl shadow-xl border overflow-hidden">' +
          '<div class="bg-gradient-to-r from-teal-500 to-emerald-600 px-8 py-6 text-center text-white">' +
            '<i class="fas fa-user-plus text-4xl mb-2"></i>' +
            '<h2 class="text-2xl font-bold">You\\\'re Invited!</h2>' +
            '<p class="text-teal-100 mt-1">' + (inv.owner_name || '') + ' from <strong>' + (inv.owner_company || 'a roofing team') + '</strong></p>' +
          '</div>' +
          '<div class="px-8 py-6">' +
            '<div class="bg-gray-50 rounded-lg p-4 mb-4">' +
              '<p class="text-gray-700"><strong>Name:</strong> ' + inv.name + '</p>' +
              '<p class="text-gray-700"><strong>Role:</strong> ' + (inv.role === 'admin' ? 'Team Admin' : 'Team Member') + '</p>' +
              '<p class="text-gray-700"><strong>Email:</strong> ' + inv.email + '</p>' +
            '</div>' +
            '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">' +
              '<p class="text-blue-800 font-semibold text-sm mb-2"><i class="fas fa-check-circle mr-1"></i> Full access included:</p>' +
              '<ul class="text-blue-700 text-sm space-y-1 ml-5 list-disc">' +
                '<li>Order roof measurement reports</li>' +
                '<li>Full CRM (customers, invoices, proposals, jobs)</li>' +
                '<li>AI Roofer Secretary</li>' +
                '<li>Virtual Roof Try-On</li>' +
              '</ul>' +
            '</div>' +
            (isLoggedIn ?
              '<button id="btnAccept" onclick="acceptInvite(\\'' + inviteToken + '\\')" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all"><i class="fas fa-check mr-2"></i>Accept & Join Team</button>' :
              '<p class="text-gray-600 text-center mb-3">Please log in or create an account first:</p>' +
              '<a href="/customer/login?redirect=' + encodeURIComponent('/customer/join-team?token=' + inviteToken) + '" class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg text-center transition-all"><i class="fas fa-sign-in-alt mr-2"></i>Log In to Accept</a>'
            ) +
            '<div id="acceptMsg" class="mt-3 text-center"></div>' +
          '</div>' +
        '</div>';
      } catch(err) {
        root.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><p class="text-red-700">Failed to load invitation</p></div>';
      }
    })();

    async function acceptInvite(token) {
      var btn = document.getElementById('btnAccept');
      var msg = document.getElementById('acceptMsg');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Joining...';
      try {
        var res = await fetch('/api/team/accept', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_token: token })
        });
        var data = await res.json();
        if (res.ok && data.success) {
          msg.innerHTML = '<div class="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700"><i class="fas fa-check-circle mr-1"></i> ' + data.message + '</div>';
          btn.innerHTML = '<i class="fas fa-check mr-2"></i>Joined!';
          setTimeout(function() { window.location.href = '/customer/dashboard'; }, 1500);
        } else {
          msg.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">' + (data.error || 'Failed to accept') + '</div>';
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-2"></i>Accept & Join Team';
        }
      } catch(err) {
        msg.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">Network error</div>';
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-2"></i>Accept & Join Team';
      }
    }
  </script>
</body>
</html>`
}

// ============================================================
// D2D MANAGER PAGE — Dedicated page with Google Maps
// ============================================================
function getD2DPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? `<script>
      var googleMapsReady = false;
      function onD2DMapsReady() {
        googleMapsReady = true;
        console.log('[Maps] D2D Maps loaded');
        if (typeof initD2DMap === 'function') initD2DMap();
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,drawing,geometry&callback=onD2DMapsReady" async defer></script>`
    : '<!-- Google Maps: No API key configured. -->'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>D2D Manager - RoofReporterAI</title>
  ${mapsScript}
  <link rel="stylesheet" href="/static/d2d-module.css?v=${Date.now()}">
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-full mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-lg font-bold">D2D Manager</h1>
            <p class="text-brand-200 text-xs">RoofReporterAI</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-3">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <div id="d2d-app"></div>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/d2d-module.js?v=${Date.now()}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// CRM SUB-PAGES — Customers, Invoices, Proposals, Jobs, Pipeline
// ============================================================
// ============================================================
// PROPERTY IMAGERY PAGE — Dev-only satellite imagery PDF tool
// ============================================================
function getPropertyImageryPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? `<script>
      var googleMapsReady = false;
      function onImageryMapsReady() {
        googleMapsReady = true;
        console.log('[Maps] Property Imagery Maps loaded');
        if (typeof initImageryMap === 'function') initImageryMap();
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&callback=onImageryMapsReady" async defer></script>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Property Imagery - RoofReporterAI (Dev Tool)</title>
  ${mapsScript}
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-emerald-700 to-teal-800 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90 transition-opacity">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-xl font-bold">Property Imagery</h1>
            <p class="text-emerald-200 text-xs">Dev Tool — RoofReporterAI</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-4">
        <span class="px-2 py-1 bg-amber-500/20 text-amber-200 rounded text-xs font-bold"><i class="fas fa-flask mr-1"></i>DEV ONLY</span>
        <a href="/customer/dashboard" class="text-emerald-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-emerald-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-5xl mx-auto px-4 py-8">
    <div id="pi-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        if (!u.is_dev) { window.location.href = '/customer/dashboard'; return; }
      } catch(e) { window.location.href = '/customer/login'; }
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/property-imagery.js?v=${BUILD_VERSION}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

function getCrmSubPageHTML(module: string, title: string, icon: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>${title} - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-lg font-bold">${title}</h1>
            <p class="text-brand-200 text-xs">RoofReporterAI</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-3">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-4 py-6">
    <div id="crm-root" data-module="${module}"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/crm-module.js?v=${Date.now()}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// ROOFER SECRETARY PAGE — AI Phone Answering Service
// ============================================================
function getSecretaryPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Roofer Secretary - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <span class="logo-mark w-10 h-10"><img src="/static/logo.png" alt="RoofReporterAI"></span>
          <div>
            <h1 class="text-lg font-bold">Roofer Secretary</h1>
            <p class="text-brand-200 text-xs">AI Phone Answering Service</p>
          </div>
        </a>
      </div>
      <nav class="flex items-center space-x-3">
        <span id="custGreeting" class="text-brand-200 text-sm hidden"><i class="fas fa-user-circle mr-1"></i><span id="custName"></span></span>
        <a href="/customer/dashboard" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-th-large mr-1"></i>Dashboard</a>
        <button onclick="custLogout()" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-sign-out-alt mr-1"></i>Logout</button>
      </nav>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-6">
    <div id="secretary-root"></div>
  </main>
  <script>
    (function() {
      var c = localStorage.getItem('rc_customer');
      if (!c) { window.location.href = '/customer/login'; return; }
      try {
        var u = JSON.parse(c);
        var g = document.getElementById('custGreeting');
        var n = document.getElementById('custName');
        if (g && n) { n.textContent = u.name || u.email; g.classList.remove('hidden'); }
      } catch(e) {}
    })();
    function custLogout() {
      var token = localStorage.getItem('rc_customer_token');
      if (token) fetch('/api/customer/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })['catch'](function(){});
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
    }
  </script>
  <script src="/static/secretary.js?v=${BUILD_VERSION}"></script>
  ${getRoverAssistant()}
</body>
</html>`
}

// ============================================================
// GEMMA 3 MODEL CARD — Public reference page
// ============================================================
function getGemma3ModelCardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemma 3 Model Card - Google DeepMind</title>
  <meta name="description" content="Gemma 3 — lightweight, open, multimodal models by Google DeepMind. Text + image understanding, 128K context, 140+ languages.">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bash.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bibtex.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'gemma': { 50:'#eff6ff', 100:'#dbeafe', 200:'#bfdbfe', 300:'#93c5fd', 400:'#60a5fa', 500:'#4285F4', 600:'#2563eb', 700:'#1d4ed8', 800:'#1e40af', 900:'#1e3a8a' },
            'google-blue':'#4285F4', 'google-red':'#EA4335', 'google-yellow':'#FBBC05', 'google-green':'#34A853'
          }
        }
      }
    }
  </script>
  <style>
    .code-block { position: relative; }
    .code-block .copy-btn { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity 0.2s; }
    .code-block:hover .copy-btn { opacity: 1; }
    .toc-link { transition: all 0.2s; border-left: 3px solid transparent; }
    .toc-link:hover, .toc-link.active { border-left-color: #4285F4; background: #eff6ff; color: #1d4ed8; }
    .size-badge { transition: all 0.3s; cursor: pointer; }
    .size-badge:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(66,133,244,0.3); }
    .size-badge.selected { ring: 2px; ring-color: #4285F4; background: #eff6ff; }
    .section-card { transition: all 0.2s; }
    .section-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .animate-section { animation: fadeIn 0.5s ease-out; }
    pre code { font-size: 0.85rem !important; line-height: 1.5 !important; }
    .hljs { border-radius: 0.5rem; padding: 1.25rem !important; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- Header -->
  <header class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <div class="flex items-center space-x-2">
          <div class="w-10 h-10 bg-gradient-to-br from-google-blue to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" class="w-6 h-6 text-white" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Gemma 3</h1>
            <p class="text-xs text-gray-500">Model Card &middot; Google DeepMind</p>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-3">
        <a href="https://ai.google.dev/gemma" target="_blank" class="px-4 py-2 bg-google-blue text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition shadow-sm">
          <i class="fas fa-external-link-alt mr-1"></i> Model Page
        </a>
        <a href="/" class="text-gray-500 hover:text-gray-700 text-sm">
          <i class="fas fa-home mr-1"></i> Home
        </a>
      </div>
    </div>
  </header>

  <div class="max-w-7xl mx-auto px-4 py-8 flex gap-8">

    <!-- Sidebar TOC -->
    <aside class="hidden lg:block w-56 flex-shrink-0">
      <nav class="sticky top-20 space-y-1 text-sm" id="toc-nav">
        <a href="#overview" class="toc-link block px-3 py-2 rounded-r text-gray-600">Overview</a>
        <a href="#description" class="toc-link block px-3 py-2 rounded-r text-gray-600">Description</a>
        <a href="#model-sizes" class="toc-link block px-3 py-2 rounded-r text-gray-600">Model Sizes</a>
        <a href="#inputs-outputs" class="toc-link block px-3 py-2 rounded-r text-gray-600">Inputs & Outputs</a>
        <a href="#usage" class="toc-link block px-3 py-2 rounded-r text-gray-600">Usage</a>
        <a href="#multi-gpu" class="toc-link block px-3 py-2 rounded-r text-gray-600">Multi-GPU Example</a>
        <a href="#resources" class="toc-link block px-3 py-2 rounded-r text-gray-600">Resources</a>
        <a href="#citation" class="toc-link block px-3 py-2 rounded-r text-gray-600">Citation</a>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 min-w-0 space-y-8">

      <!-- Overview Hero -->
      <section id="overview" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-section">
        <div class="bg-gradient-to-r from-google-blue via-blue-500 to-indigo-600 px-8 py-10 text-white">
          <div class="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div class="flex items-center space-x-3 mb-3">
                <span class="px-3 py-1 bg-white/20 rounded-full text-sm font-medium backdrop-blur-sm">Open Model</span>
                <span class="px-3 py-1 bg-white/20 rounded-full text-sm font-medium backdrop-blur-sm">Multimodal</span>
                <span class="px-3 py-1 bg-white/20 rounded-full text-sm font-medium backdrop-blur-sm">128K Context</span>
              </div>
              <h2 class="text-4xl font-extrabold mb-2">Gemma 3</h2>
              <p class="text-blue-100 text-lg max-w-2xl">Lightweight, state-of-the-art open models built from the same research and technology used to create the Gemini models.</p>
            </div>
            <div class="text-right space-y-1">
              <div class="text-blue-100 text-sm">Authors</div>
              <div class="font-bold text-lg">Google DeepMind</div>
              <div class="text-blue-200 text-sm">Model Page: <a href="https://ai.google.dev/gemma" class="underline hover:text-white">Gemma</a></div>
            </div>
          </div>
        </div>
        <div class="px-8 py-5 bg-blue-50/50 border-t border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          <div><div class="font-bold text-2xl text-google-blue">4</div><div class="text-gray-500">Model Sizes</div></div>
          <div><div class="font-bold text-2xl text-google-blue">140+</div><div class="text-gray-500">Languages</div></div>
          <div><div class="font-bold text-2xl text-google-blue">128K</div><div class="text-gray-500">Context Window</div></div>
          <div><div class="font-bold text-2xl text-google-blue">8,192</div><div class="text-gray-500">Output Tokens</div></div>
        </div>
      </section>

      <!-- Description -->
      <section id="description" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <i class="fas fa-info-circle text-google-blue mr-3"></i> Description
        </h3>
        <p class="text-gray-700 leading-relaxed mb-4">
          Gemma is a family of lightweight, state-of-the-art open models from Google, built from the same research and technology used to create the Gemini models.
          Gemma 3 models are <strong>multimodal</strong> &mdash; they take both <strong>text</strong> and <strong>images</strong> as input and generate <strong>text</strong> output, with
          a <strong>128K token context window</strong>, <strong>multilingual support in over 140 languages</strong>, and available in multiple sizes.
        </p>
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
          <h4 class="font-semibold text-gray-800 mb-3"><i class="fas fa-tasks text-google-blue mr-2"></i>Well-suited for:</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Text generation</span></div>
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Image understanding</span></div>
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Question answering</span></div>
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Summarization</span></div>
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Reasoning</span></div>
            <div class="flex items-center space-x-2 text-sm text-gray-700"><i class="fas fa-check-circle text-google-green"></i><span>Multilingual tasks</span></div>
          </div>
        </div>
      </section>

      <!-- Model Sizes -->
      <section id="model-sizes" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i class="fas fa-cubes text-google-blue mr-3"></i> Model Sizes
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="size-badge bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-google-blue" onclick="selectSize(this, '1B')">
            <div class="text-3xl font-extrabold text-google-blue mb-1">1B</div>
            <div class="text-gray-500 text-sm font-medium">Parameters</div>
            <div class="mt-3 text-xs text-gray-400">32K context</div>
            <div class="text-xs text-gray-400">Text only</div>
          </div>
          <div class="size-badge bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-google-blue selected border-google-blue bg-blue-50/50" onclick="selectSize(this, '4B')">
            <div class="text-3xl font-extrabold text-google-blue mb-1">4B</div>
            <div class="text-gray-500 text-sm font-medium">Parameters</div>
            <div class="mt-3 text-xs text-gray-400">128K context</div>
            <div class="text-xs text-google-green font-medium">Text + Image</div>
          </div>
          <div class="size-badge bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-google-blue" onclick="selectSize(this, '12B')">
            <div class="text-3xl font-extrabold text-google-blue mb-1">12B</div>
            <div class="text-gray-500 text-sm font-medium">Parameters</div>
            <div class="mt-3 text-xs text-gray-400">128K context</div>
            <div class="text-xs text-google-green font-medium">Text + Image</div>
          </div>
          <div class="size-badge bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-google-blue" onclick="selectSize(this, '27B')">
            <div class="text-3xl font-extrabold text-google-blue mb-1">27B</div>
            <div class="text-gray-500 text-sm font-medium">Parameters</div>
            <div class="mt-3 text-xs text-gray-400">128K context</div>
            <div class="text-xs text-google-green font-medium">Text + Image</div>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-4 text-center">Click a model size to highlight &mdash; the 1B variant uses a 32K context window; all others support 128K tokens.</p>
      </section>

      <!-- Inputs & Outputs -->
      <section id="inputs-outputs" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i class="fas fa-exchange-alt text-google-blue mr-3"></i> Inputs & Outputs
        </h3>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-green-50 rounded-xl p-6 border border-green-200">
            <h4 class="font-bold text-green-800 mb-3 flex items-center"><i class="fas fa-sign-in-alt mr-2"></i>Inputs</h4>
            <ul class="space-y-2 text-sm text-gray-700">
              <li class="flex items-start space-x-2"><i class="fas fa-font text-green-600 mt-1"></i><span><strong>Text:</strong> String data (prompts, questions, instructions)</span></li>
              <li class="flex items-start space-x-2"><i class="fas fa-image text-green-600 mt-1"></i><span><strong>Images:</strong> Normalized to <code class="bg-green-100 px-1 rounded">896 &times; 896</code> pixels (256 tokens each)</span></li>
              <li class="flex items-start space-x-2"><i class="fas fa-ruler-horizontal text-green-600 mt-1"></i><span><strong>Total context:</strong> <code class="bg-green-100 px-1 rounded">128K</code> tokens (32K for 1B)</span></li>
            </ul>
          </div>
          <div class="bg-amber-50 rounded-xl p-6 border border-amber-200">
            <h4 class="font-bold text-amber-800 mb-3 flex items-center"><i class="fas fa-sign-out-alt mr-2"></i>Outputs</h4>
            <ul class="space-y-2 text-sm text-gray-700">
              <li class="flex items-start space-x-2"><i class="fas fa-font text-amber-600 mt-1"></i><span><strong>Text:</strong> Generated text (responses, answers, summaries)</span></li>
              <li class="flex items-start space-x-2"><i class="fas fa-ruler-horizontal text-amber-600 mt-1"></i><span><strong>Max output:</strong> <code class="bg-amber-100 px-1 rounded">8,192</code> tokens</span></li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Usage — Pipeline API -->
      <section id="usage" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i class="fas fa-code text-google-blue mr-3"></i> Usage
        </h3>

        <!-- Install -->
        <h4 class="font-semibold text-gray-800 mb-3">1. Install Transformers &ge; 4.50.0</h4>
        <div class="code-block mb-6">
          <button class="copy-btn px-3 py-1 bg-gray-700 text-gray-200 text-xs rounded hover:bg-gray-600 transition" onclick="copyCode(this)">
            <i class="fas fa-copy mr-1"></i>Copy
          </button>
          <pre><code class="language-bash">pip install -U transformers</code></pre>
        </div>

        <!-- Pipeline Example -->
        <h4 class="font-semibold text-gray-800 mb-3">2. Pipeline API Example</h4>
        <p class="text-sm text-gray-600 mb-3">Using <code class="bg-gray-100 px-1 rounded">google/gemma-3-4b-it</code> with system/user messages and an image URL:</p>
        <div class="code-block mb-6">
          <button class="copy-btn px-3 py-1 bg-gray-700 text-gray-200 text-xs rounded hover:bg-gray-600 transition" onclick="copyCode(this)">
            <i class="fas fa-copy mr-1"></i>Copy
          </button>
          <pre><code class="language-python">from transformers import pipeline
import torch

pipe = pipeline(
    "image-text-to-text",
    model="google/gemma-3-4b-it",
    device="cuda",
    torch_dtype=torch.bfloat16,
)

messages = [
    {
        "role": "system",
        "content": [{"type": "text", "text": "You are a helpful assistant."}],
    },
    {
        "role": "user",
        "content": [
            {"type": "image", "url": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/p-blog/candy.JPG"},
            {"type": "text", "text": "What animal is in the image?"},
        ],
    },
]

output = pipe(text=messages, max_new_tokens=200)
print(output[0]["generated_text"][-1]["content"])</code></pre>
        </div>
      </section>

      <!-- Multi-GPU Example -->
      <section id="multi-gpu" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i class="fas fa-server text-google-blue mr-3"></i> Multi-GPU Example
        </h3>
        <p class="text-sm text-gray-600 mb-4">Using <code class="bg-gray-100 px-1 rounded">accelerate</code>, <code class="bg-gray-100 px-1 rounded">AutoProcessor</code>, and <code class="bg-gray-100 px-1 rounded">Gemma3ForConditionalGeneration</code> for larger models across multiple GPUs:</p>
        <div class="code-block mb-4">
          <button class="copy-btn px-3 py-1 bg-gray-700 text-gray-200 text-xs rounded hover:bg-gray-600 transition" onclick="copyCode(this)">
            <i class="fas fa-copy mr-1"></i>Copy
          </button>
          <pre><code class="language-python">from transformers import AutoProcessor, Gemma3ForConditionalGeneration
from PIL import Image
import requests
import torch

model_id = "google/gemma-3-27b-it"
model = Gemma3ForConditionalGeneration.from_pretrained(
    model_id, device_map="auto", torch_dtype=torch.bfloat16
)
processor = AutoProcessor.from_pretrained(model_id)

# Load an image
url = "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/p-blog/candy.JPG"
image = Image.open(requests.get(url, stream=True).raw)

messages = [
    {
        "role": "system",
        "content": [{"type": "text", "text": "You are a helpful assistant."}],
    },
    {
        "role": "user",
        "content": [
            {"type": "image"},
            {"type": "text", "text": "What do you see in this image? Describe in detail."},
        ],
    },
]

inputs = processor.apply_chat_template(
    messages,
    tokenize=True,
    add_generation_prompt=True,
    return_dict=True,
    return_tensors="pt",
    images=[image],
).to(model.device)

input_len = inputs["input_ids"].shape[-1]

with torch.inference_mode():
    generation = model.generate(**inputs, max_new_tokens=500, do_sample=False)
    generation = generation[0][input_len:]

decoded = processor.decode(generation, skip_special_tokens=True)
print(decoded)
# Sample output:
# "The image shows a selection of colorful lollipops
#  arranged in neat rows. The swirled patterns feature
#  shades of pink, purple, yellow, blue, and green,
#  creating a vibrant, candy-shop display."</code></pre>
        </div>
      </section>

      <!-- Resources -->
      <section id="resources" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i class="fas fa-book text-google-blue mr-3"></i> Resources
        </h3>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a href="https://goo.gle/Gemma3Report" target="_blank" class="flex items-center space-x-3 p-4 bg-blue-50 rounded-xl border border-blue-100 hover:border-google-blue hover:shadow-md transition group">
            <div class="w-10 h-10 bg-google-blue/10 rounded-lg flex items-center justify-center group-hover:bg-google-blue/20 transition">
              <i class="fas fa-file-alt text-google-blue"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Technical Report</div>
              <div class="text-xs text-gray-500">Gemma 3 Technical Report</div>
            </div>
          </a>
          <a href="https://ai.google.dev/responsible" target="_blank" class="flex items-center space-x-3 p-4 bg-green-50 rounded-xl border border-green-100 hover:border-google-green hover:shadow-md transition group">
            <div class="w-10 h-10 bg-google-green/10 rounded-lg flex items-center justify-center group-hover:bg-google-green/20 transition">
              <i class="fas fa-shield-alt text-google-green"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Responsible AI Toolkit</div>
              <div class="text-xs text-gray-500">Safety & responsible use</div>
            </div>
          </a>
          <a href="https://www.kaggle.com/models/google/gemma-3" target="_blank" class="flex items-center space-x-3 p-4 bg-purple-50 rounded-xl border border-purple-100 hover:border-purple-500 hover:shadow-md transition group">
            <div class="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition">
              <i class="fas fa-database text-purple-500"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Gemma on Kaggle</div>
              <div class="text-xs text-gray-500">Models, notebooks & datasets</div>
            </div>
          </a>
          <a href="https://console.cloud.google.com/vertex-ai/publishers/google/model-garden/gemma3" target="_blank" class="flex items-center space-x-3 p-4 bg-amber-50 rounded-xl border border-amber-100 hover:border-google-yellow hover:shadow-md transition group">
            <div class="w-10 h-10 bg-google-yellow/10 rounded-lg flex items-center justify-center group-hover:bg-google-yellow/20 transition">
              <i class="fas fa-cloud text-google-yellow"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Vertex Model Garden</div>
              <div class="text-xs text-gray-500">Deploy on Google Cloud</div>
            </div>
          </a>
          <a href="https://ai.google.dev/gemma/terms" target="_blank" class="flex items-center space-x-3 p-4 bg-red-50 rounded-xl border border-red-100 hover:border-google-red hover:shadow-md transition group">
            <div class="w-10 h-10 bg-google-red/10 rounded-lg flex items-center justify-center group-hover:bg-google-red/20 transition">
              <i class="fas fa-gavel text-google-red"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Terms of Use</div>
              <div class="text-xs text-gray-500">License & usage terms</div>
            </div>
          </a>
          <a href="https://ai.google.dev/gemma" target="_blank" class="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-google-blue hover:shadow-md transition group">
            <div class="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center group-hover:bg-gray-300 transition">
              <i class="fas fa-home text-gray-600"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">Gemma Model Page</div>
              <div class="text-xs text-gray-500">Official landing page</div>
            </div>
          </a>
        </div>
      </section>

      <!-- Citation -->
      <section id="citation" class="section-card bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-section">
        <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <i class="fas fa-quote-left text-google-blue mr-3"></i> Citation
        </h3>
        <div class="code-block">
          <button class="copy-btn px-3 py-1 bg-gray-700 text-gray-200 text-xs rounded hover:bg-gray-600 transition" onclick="copyCode(this)">
            <i class="fas fa-copy mr-1"></i>Copy
          </button>
          <pre><code class="language-bibtex">@article{gemma_2025,
    title   = {Gemma 3},
    url     = {https://goo.gle/Gemma3Report},
    publisher = {Kaggle},
    author  = {Gemma Team},
    year    = {2025}
}</code></pre>
        </div>
      </section>

      <!-- Footer -->
      <footer class="text-center text-xs text-gray-400 py-8 border-t border-gray-200 mt-8">
        <p>Gemma 3 Model Card &mdash; Data compiled from public Google DeepMind documentation.</p>
        <p class="mt-1">Served by <a href="/" class="text-google-blue hover:underline">RoofReporterAI</a> on Cloudflare Pages.</p>
      </footer>

    </main>
  </div>

  <script>
    // Highlight.js init
    hljs.highlightAll();

    // Copy button
    function copyCode(btn) {
      var code = btn.parentElement.querySelector('code');
      navigator.clipboard.writeText(code.textContent).then(function() {
        btn.innerHTML = '<i class="fas fa-check mr-1"></i>Copied!';
        setTimeout(function() { btn.innerHTML = '<i class="fas fa-copy mr-1"></i>Copy'; }, 2000);
      });
    }

    // Size badge selection
    function selectSize(el, size) {
      document.querySelectorAll('.size-badge').forEach(function(b) {
        b.classList.remove('selected', 'border-google-blue', 'bg-blue-50/50');
        b.classList.add('border-gray-200');
      });
      el.classList.add('selected', 'border-google-blue', 'bg-blue-50/50');
      el.classList.remove('border-gray-200');
    }

    // TOC active tracking
    var sections = document.querySelectorAll('section[id]');
    var tocLinks = document.querySelectorAll('.toc-link');
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function(l) { l.classList.remove('active'); });
          var activeLink = document.querySelector('.toc-link[href="#' + entry.target.id + '"]');
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0% -70% 0%' });
    sections.forEach(function(s) { observer.observe(s); });
  </script>

</body>
</html>`
}
