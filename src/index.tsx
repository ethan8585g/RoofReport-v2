import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getAccessToken, getProjectId, getServiceAccountEmail } from './services/gcp-auth'
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
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API routes
app.use('/api/*', cors())

// Analytics tracker injection middleware — auto-injects tracker.js + GA4 gtag.js into HTML pages
// Skips API routes, static files, and the tracker itself
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
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${ga4Id}',{send_page_view:true,cookie_flags:'SameSite=None;Secure'});
</script>` : ''
      
      const injected = body.replace('</body>', `${ga4Script}\n<script src="/static/tracker.js" defer></script>\n</body>`)
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
app.route('/api/admin', adminRoutes)
app.route('/api/ai', aiAnalysisRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/customer', customerAuthRoutes)
app.route('/api/invoices', invoiceRoutes)
app.route('/api/square', squareRoutes)
app.route('/api/crm', crmRoutes)
app.route('/api/property-imagery', propertyImageryRoutes)
app.route('/api/blog', blogRoutes)
app.route('/api/d2d', d2dRoutes)
app.route('/api/secretary', secretaryRoutes)
app.route('/api/rover', roverRoutes)
app.route('/api/email-outreach', emailOutreachRoutes)
app.route('/api/analytics', analyticsRoutes)

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
      DB: !!c.env.DB
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

// Customer Order & Pay page
app.get('/customer/order', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getCustomerOrderPageHTML(mapsKey))
})

// Customer Branding Setup
app.get('/customer/branding', (c) => c.html(getBrandingSetupHTML()))

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

function getHeadTags() {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  ${getTailwindConfig()}
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link rel="stylesheet" href="/static/style.css">`
}

// Rover chatbot widget script tag — inject on public pages only
function getRoverWidget() {
  return `<script src="/static/rover-widget.js" defer></script>`
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-home text-white text-lg"></i>
          </div>
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
    <div class="max-w-full mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
          <i class="fas fa-crown text-white text-sm"></i>
        </div>
        <div class="leading-tight">
          <span class="text-white font-bold text-sm">ROOFREPORTERAI</span>
          <span class="text-gray-400 text-[10px] block -mt-0.5">Super Admin Command Center</span>
        </div>
      </div>
      <div class="flex items-center gap-4">
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
    <aside class="sa-sidebar w-64 bg-slate-800 border-r border-slate-700 flex-shrink-0">
      <div class="p-4 space-y-1" id="sa-nav">
        <div class="sa-nav-item active rounded-xl px-4 py-3 flex items-center gap-3" onclick="saSetView('users')">
          <i class="fas fa-users w-5 text-center"></i>
          <span class="label text-sm font-medium">All Active Users</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('sales')">
          <i class="fas fa-credit-card w-5 text-center"></i>
          <span class="label text-sm font-medium">Credit Pack Sales</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('orders')">
          <i class="fas fa-clipboard-list w-5 text-center"></i>
          <span class="label text-sm font-medium">Order History</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('signups')">
          <i class="fas fa-user-plus w-5 text-center"></i>
          <span class="label text-sm font-medium">New Sign-ups</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('marketing')">
          <i class="fas fa-bullhorn w-5 text-center"></i>
          <span class="label text-sm font-medium">Sales & Marketing</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('email-outreach')">
          <i class="fas fa-envelope-open-text w-5 text-center"></i>
          <span class="label text-sm font-medium">Email Outreach</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('email-setup')">
          <i class="fas fa-cog w-5 text-center"></i>
          <span class="label text-sm font-medium">Email Setup</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('analytics')">
          <i class="fas fa-chart-line w-5 text-center"></i>
          <span class="label text-sm font-medium">Site Analytics</span>
        </div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('ga4')">
          <i class="fab fa-google w-5 text-center"></i>
          <span class="label text-sm font-medium">Google Analytics</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <div class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400" onclick="saSetView('pricing')">
          <i class="fas fa-dollar-sign w-5 text-center"></i>
          <span class="label text-sm font-medium">Pricing & Billing</span>
        </div>
        <div class="border-t border-gray-800 my-3"></div>
        <a href="/admin" class="sa-nav-item rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400 no-underline">
          <i class="fas fa-tachometer-alt w-5 text-center"></i>
          <span class="label text-sm font-medium">Operations Panel</span>
        </a>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 p-6 overflow-y-auto">
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
    function saSetView(v) {
      // Update sidebar active state
      document.querySelectorAll('.sa-nav-item').forEach(el => {
        el.classList.remove('active');
        el.classList.add('text-gray-400');
      });
      event.currentTarget.classList.add('active');
      event.currentTarget.classList.remove('text-gray-400');
      // Delegate to JS module
      if (typeof window.saDashboardSetView === 'function') window.saDashboardSetView(v);
    }
  </script>
  <script src="/static/super-admin-dashboard.js"></script>
  <script src="/static/email-outreach.js"></script>
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
  <script src="/static/admin.js"></script>
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
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-home text-white text-lg"></i>
        </div>
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
  <script src="/static/confirmation.js"></script>
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
        <div class="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/30">
          <i class="fas fa-shield-alt text-white text-xl"></i>
        </div>
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
  <title>Professional Roof Measurement Reports - RoofReporterAI</title>
  <meta name="description" content="Get accurate roof area, pitch analysis, edge breakdowns, material estimates, and solar potential from satellite imagery. Sign up and get 3 free reports instantly. Powered by RoofReporterAI Business Management CRM.">
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
    /* Smooth scrolling */
    html { scroll-behavior: smooth; }
    /* Navbar transparency transition */
    .landing-nav { transition: all 0.3s ease; }
    .landing-nav.scrolled {
      background: rgba(30, 58, 138, 0.97);
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Sticky Navigation -->
  <nav id="landing-nav" class="landing-nav fixed top-0 left-0 right-0 z-50 bg-blue-800/80 backdrop-blur-sm">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-home text-white"></i>
        </div>
        <div class="leading-tight">
          <span class="text-white font-bold text-lg">RoofReporterAI</span>
          <span class="hidden sm:block text-brand-200 text-[10px] -mt-0.5">Roof Measurement Reports & Business Management CRM</span>
        </div>
      </a>

      <!-- Desktop nav -->
      <div class="hidden md:flex items-center gap-6">
        <a href="#how-it-works" class="text-brand-200 hover:text-white text-sm transition-colors">How It Works</a>
        <a href="#features" class="text-brand-200 hover:text-white text-sm transition-colors">Features</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm transition-colors">Pricing</a>
        <a href="/blog" class="text-brand-200 hover:text-white text-sm transition-colors">Blog</a>
        <a href="#faq" class="text-brand-200 hover:text-white text-sm transition-colors">FAQ</a>
        <a href="/customer/login" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-all hover:scale-105 shadow-lg shadow-accent-500/25">
          <i class="fas fa-sign-in-alt mr-1"></i>Customer Login
        </a>
      </div>

      <!-- Mobile menu button -->
      <button id="mobile-menu-btn" class="md:hidden text-white text-xl" onclick="document.getElementById('mobile-menu').classList.toggle('hidden')">
        <i class="fas fa-bars"></i>
      </button>
    </div>

    <!-- Mobile menu -->
    <div id="mobile-menu" class="hidden md:hidden bg-sky-600/95 backdrop-blur-md border-t border-sky-400">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3">
        <a href="#how-it-works" class="text-brand-200 hover:text-white text-sm py-2" onclick="document.getElementById('mobile-menu').classList.add('hidden')">How It Works</a>
        <a href="#features" class="text-brand-200 hover:text-white text-sm py-2" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Features</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm py-2" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Pricing</a>
        <a href="/blog" class="text-brand-200 hover:text-white text-sm py-2" onclick="document.getElementById('mobile-menu').classList.add('hidden')">Blog</a>
        <a href="#faq" class="text-brand-200 hover:text-white text-sm py-2" onclick="document.getElementById('mobile-menu').classList.add('hidden')">FAQ</a>
        <a href="/customer/login" class="bg-accent-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Customer Login</a>
      </div>
    </div>
  </nav>

  <!-- Landing page content -->
  <div id="landing-root"></div>

  <!-- Footer -->
  <footer class="bg-slate-100 text-gray-600 border-t border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-16">
      <div class="grid md:grid-cols-4 gap-8">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center">
              <i class="fas fa-home text-white"></i>
            </div>
            <span class="text-gray-800 font-bold text-lg">RoofReporterAI</span>
          </div>
          <p class="text-sm leading-relaxed">Professional AI-powered roof measurement reports for contractors, estimators, and roofing professionals across Canada.</p>
        </div>
        <div>
          <h4 class="text-gray-800 font-semibold mb-4 text-sm uppercase tracking-wider">Product</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="#features" class="hover:text-sky-600 transition-colors">Features</a></li>
            <li><a href="#pricing" class="hover:text-sky-600 transition-colors">Pricing</a></li>
            <li><a href="#how-it-works" class="hover:text-sky-600 transition-colors">How It Works</a></li>
            <li><a href="/blog" class="hover:text-sky-600 transition-colors">Blog</a></li>
            <li><a href="/customer/login" class="hover:text-sky-600 transition-colors">Customer Login</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-gray-800 font-semibold mb-4 text-sm uppercase tracking-wider">Company</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="https://reusecanada.ca" class="hover:text-sky-600 transition-colors">RoofReporterAI</a></li>
            <li><a href="#faq" class="hover:text-sky-600 transition-colors">FAQ</a></li>
            <li><a href="mailto:reports@reusecanada.ca" class="hover:text-sky-600 transition-colors">Contact</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-gray-800 font-semibold mb-4 text-sm uppercase tracking-wider">Get Started</h4>
          <p class="text-sm mb-4">Ready to save hours on every estimate?</p>
          <a href="/customer/login" class="inline-block bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-all">
            Customer Login
          </a>
        </div>
      </div>
      <div class="border-t border-slate-300 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-sm">&copy; 2026 RoofReporterAI. All rights reserved.</p>
        <div class="flex items-center gap-6 text-sm">
          <span class="flex items-center gap-1.5"><i class="fas fa-map-marker-alt text-sky-500"></i> Alberta, Canada</span>
          <span class="flex items-center gap-1.5"><i class="fas fa-envelope text-sky-500"></i> reports@reusecanada.ca</span>
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
  <script src="/static/landing.js"></script>
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
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-cog text-white text-lg"></i>
        </div>
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
  <script src="/static/settings.js"></script>
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
        <div class="w-12 h-12 bg-accent-500 rounded-xl flex items-center justify-center shadow-lg">
          <i class="fas fa-home text-white text-xl"></i>
        </div>
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
    <div class="text-center mt-6 space-y-2">
      <a href="/login" class="text-brand-300 hover:text-white text-sm transition-colors"><i class="fas fa-shield-alt mr-1"></i>Admin Login</a>
      <span class="text-brand-700 mx-2">|</span>
      <a href="/" class="text-brand-300 hover:text-white text-sm transition-colors"><i class="fas fa-arrow-left mr-1"></i>Back to homepage</a>
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-home text-white text-lg"></i>
          </div>
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
  ${getRoverWidget()}
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-file-invoice-dollar text-white text-lg"></i>
          </div>
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
  <script src="/static/customer-invoice.js"></script>
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
        <div class="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white"></i></div>
        <span class="text-white font-bold text-lg">RoofReporterAI</span>
      </a>
      <div class="flex items-center gap-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm">Home</a>
        <a href="/customer/login" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
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
  <script src="/static/pricing.js"></script>
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
  <!-- Navigation -->
  <nav class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white"></i></div>
        <span class="text-white font-bold text-lg">RoofReporterAI</span>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/" class="text-brand-200 hover:text-white text-sm">Home</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm border-b-2 border-white pb-0.5">Blog</a>
        <a href="/customer/login" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
      <button class="md:hidden text-white text-xl" onclick="document.getElementById('blog-mobile-menu').classList.toggle('hidden')"><i class="fas fa-bars"></i></button>
    </div>
    <div id="blog-mobile-menu" class="hidden md:hidden bg-sky-600/95 backdrop-blur-md border-t border-sky-400">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3">
        <a href="/" class="text-brand-200 hover:text-white text-sm py-2">Home</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm py-2">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm py-2">Blog</a>
        <a href="/customer/login" class="bg-accent-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <div class="bg-gradient-to-br from-sky-500 via-blue-600 to-blue-700 text-white py-16 md:py-20">
    <div class="max-w-4xl mx-auto px-4 text-center">
      <h1 class="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">The RoofReporterAI Blog</h1>
      <p class="text-lg md:text-xl text-sky-100 max-w-2xl mx-auto leading-relaxed">Roofing industry insights, AI measurement technology, contractor business tips, and everything you need to grow your roofing business.</p>
      <div class="mt-8 flex flex-wrap justify-center gap-3" id="blog-categories-hero"></div>
    </div>
  </div>

  <!-- Search + Filter Bar -->
  <div class="max-w-6xl mx-auto px-4 -mt-6 relative z-10 mb-8">
    <div class="bg-white rounded-xl shadow-lg p-4 flex flex-col md:flex-row items-center gap-4">
      <div class="flex-1 relative w-full">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input type="text" id="blog-search" placeholder="Search articles..." class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400 outline-none">
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
      <button onclick="loadMorePosts()" class="bg-white border-2 border-sky-500 text-sky-600 hover:bg-sky-50 font-semibold py-3 px-8 rounded-lg text-sm transition-all">
        Load More Articles
      </button>
    </div>
    
    <!-- Empty State -->
    <div id="blog-empty" class="hidden text-center py-20">
      <i class="fas fa-newspaper text-6xl text-gray-200 mb-6"></i>
      <h3 class="text-xl font-bold text-gray-600 mb-2">No articles yet</h3>
      <p class="text-gray-400 text-sm">Check back soon — we're writing great content for roofing professionals!</p>
    </div>
  </main>

  <!-- Footer -->
  <footer class="bg-slate-100 text-gray-600 border-t border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white text-sm"></i></div>
          <span class="text-gray-800 font-bold">RoofReporterAI</span>
        </div>
        <div class="flex items-center gap-6 text-sm">
          <a href="/" class="hover:text-sky-600">Home</a>
          <a href="/pricing" class="hover:text-sky-600">Pricing</a>
          <a href="/blog" class="hover:text-sky-600 font-semibold text-sky-600">Blog</a>
          <a href="/customer/login" class="hover:text-sky-600">Login</a>
        </div>
        <p class="text-xs text-gray-400">&copy; 2026 RoofReporterAI. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="/static/blog.js"></script>
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
        <div class="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white"></i></div>
        <span class="text-white font-bold text-lg">RoofReporterAI</span>
      </a>
      <div class="hidden md:flex items-center gap-5">
        <a href="/" class="text-brand-200 hover:text-white text-sm">Home</a>
        <a href="/pricing" class="text-brand-200 hover:text-white text-sm">Pricing</a>
        <a href="/blog" class="text-white font-semibold text-sm">Blog</a>
        <a href="/customer/login" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-5 rounded-lg text-sm"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
      </div>
      <button class="md:hidden text-white text-xl" onclick="document.getElementById('bp-mobile').classList.toggle('hidden')"><i class="fas fa-bars"></i></button>
    </div>
    <div id="bp-mobile" class="hidden md:hidden bg-sky-600/95 backdrop-blur-md border-t border-sky-400">
      <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3">
        <a href="/" class="text-brand-200 hover:text-white text-sm py-2">Home</a>
        <a href="/blog" class="text-white font-semibold text-sm py-2">Blog</a>
        <a href="/customer/login" class="bg-accent-500 text-white font-semibold py-2.5 px-5 rounded-lg text-sm text-center mt-2"><i class="fas fa-sign-in-alt mr-1"></i>Get Started</a>
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
        <a href="/customer/login" class="bg-accent-500 hover:bg-accent-600 text-white font-semibold py-3 px-8 rounded-lg transition-all hover:scale-105 shadow-lg shadow-accent-500/25"><i class="fas fa-rocket mr-2"></i>Start Free Trial</a>
        <a href="/pricing" class="text-sky-600 hover:text-sky-700 font-semibold text-sm"><i class="fas fa-tag mr-1"></i>View Pricing</a>
      </div>
    </div>

    <!-- Related Posts -->
    <div id="blog-related" class="mt-16 hidden">
      <h3 class="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
      <div id="blog-related-grid" class="grid md:grid-cols-3 gap-6"></div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="bg-slate-100 text-gray-600 border-t border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white text-sm"></i></div>
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

  <script src="/static/blog.js"></script>
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// CUSTOMER ORDER PAGE — Address entry + pay or use credit
// ============================================================
function getCustomerOrderPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? '<script src="https://maps.googleapis.com/maps/api/js?key=' + mapsApiKey + '&libraries=places" async defer></script>'
    : ''

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
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center"><i class="fas fa-home text-white text-lg"></i></div>
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
  ${getRoverWidget()}
</body>
</html>`
}

// ============================================================
// CUSTOM BRANDING SETUP PAGE
// ============================================================
function getBrandingSetupHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Custom Branding Setup - RoofReporterAI</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <a href="/customer/dashboard" class="flex items-center space-x-3 hover:opacity-90">
          <div class="w-10 h-10 bg-gradient-to-br from-pink-500 to-fuchsia-600 rounded-lg flex items-center justify-center">
            <i class="fas fa-palette text-white text-lg"></i>
          </div>
          <div>
            <h1 class="text-lg font-bold">Custom Branding Setup</h1>
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
  <main class="max-w-5xl mx-auto px-4 py-6">
    <div id="branding-root"></div>
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
  <script src="/static/branding.js"></script>
</body>
</html>`
}

// ============================================================
// D2D MANAGER PAGE — Dedicated page with Google Maps
// ============================================================
function getD2DPageHTML(mapsApiKey: string) {
  const mapsScript = mapsApiKey
    ? `<script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,drawing,geometry" async defer></script>`
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-door-open text-white text-lg"></i>
          </div>
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
    ? '<script src="https://maps.googleapis.com/maps/api/js?key=' + mapsApiKey + '&libraries=places" async defer></script>'
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
          <div class="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg">
            <i class="fas fa-satellite text-white text-lg"></i>
          </div>
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
  <script src="/static/property-imagery.js"></script>
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas ${icon} text-white text-lg"></i>
          </div>
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
          <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
            <i class="fas fa-phone-alt text-white text-lg"></i>
          </div>
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
  <script src="/static/secretary.js"></script>
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
