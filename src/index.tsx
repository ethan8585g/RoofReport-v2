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
import { stripeRoutes } from './routes/stripe'
import { crmRoutes } from './routes/crm'
import { propertyImageryRoutes } from './routes/property-imagery'
import { blogRoutes } from './routes/blog'
import { d2dRoutes } from './routes/d2d'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// CORS for API routes
app.use('/api/*', cors())

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
app.route('/api/stripe', stripeRoutes)
app.route('/api/crm', crmRoutes)
app.route('/api/property-imagery', propertyImageryRoutes)
app.route('/api/blog', blogRoutes)
app.route('/api/d2d', d2dRoutes)

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
      STRIPE_SECRET_KEY: !!c.env.STRIPE_SECRET_KEY,
      STRIPE_PUBLISHABLE_KEY: !!c.env.STRIPE_PUBLISHABLE_KEY,
      GMAIL_SENDER_EMAIL: c.env.GMAIL_SENDER_EMAIL || '(not set)',
      GMAIL_CLIENT_ID: !!(c.env as any).GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET: !!(c.env as any).GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN: !!(c.env as any).GMAIL_REFRESH_TOKEN,
      RESEND_API_KEY: !!(c.env as any).RESEND_API_KEY,
      STRIPE_WEBHOOK_SECRET: !!(c.env as any).STRIPE_WEBHOOK_SECRET,
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
// Secret keys (Google Solar, Stripe Secret) stay server-side.
// ============================================================
app.get('/api/config/client', (c) => {
  // Only expose keys that are designed to be public (publishable keys)
  // Google Maps JS API key is loaded via script tag — that's how Google designed it
  // Stripe publishable key is designed for frontend use
  return c.json({
    google_maps_key: c.env.GOOGLE_MAPS_API_KEY || '',
    stripe_publishable_key: c.env.STRIPE_PUBLISHABLE_KEY || '',
    // Feature flags based on which keys are configured
    features: {
      google_maps: !!c.env.GOOGLE_MAPS_API_KEY,
      google_solar: !!c.env.GOOGLE_SOLAR_API_KEY,
      stripe_payments: !!c.env.STRIPE_SECRET_KEY && !!c.env.STRIPE_PUBLISHABLE_KEY,
      self_service_orders: !!c.env.STRIPE_SECRET_KEY
    }
  })
})

// ============================================================
// PAGES - Full HTML served from Hono (server-side rendering)
// Google Maps API key is injected server-side into the script tag.
// Secret keys (Solar API, Stripe Secret) are NEVER in HTML.
// ============================================================

// Landing / Marketing page
app.get('/', (c) => {
  return c.html(getLandingPageHTML())
})

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
app.get('/customer/d2d', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getD2DPageHTML(mapsKey))
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
  <script src="/static/app.js"></script>
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
      background: rgba(14, 165, 233, 0.97);
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Sticky Navigation -->
  <nav id="landing-nav" class="landing-nav fixed top-0 left-0 right-0 z-50 bg-transparent">
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
          <p class="text-brand-200 text-xs">API Keys & Company Configuration</p>
        </div>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-home mr-1"></i>Home</a>
        <a href="/order/new" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-plus mr-1"></i>New Order</a>
        <a href="/admin" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-tachometer-alt mr-1"></i>Admin</a>
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

        <!-- Register Form -->
        <div id="custRegForm" class="hidden">
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
              <input type="email" id="custRegEmail" placeholder="you@company.com" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
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
          <button onclick="doCustRegister()" class="w-full mt-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-brand-500/25">
            <i class="fas fa-user-plus mr-2"></i>Create Account
          </button>
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
      try {
        const res = await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, phone, company_name: company })
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
  <script src="/static/customer-dashboard.js"></script>
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
  <script src="/static/customer-order.js"></script>
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
  <link rel="stylesheet" href="/static/d2d-module.css">
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
  <script src="/static/d2d-module.js"></script>
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
  <script src="/static/crm-module.js"></script>
</body>
</html>`
}
