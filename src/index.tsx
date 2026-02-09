import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ordersRoutes } from './routes/orders'
import { companiesRoutes } from './routes/companies'
import { settingsRoutes } from './routes/settings'
import { reportsRoutes } from './routes/reports'
import { adminRoutes } from './routes/admin'
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

// Health check
app.get('/api/health', (c) => {
  // Report which env vars are configured (true/false only — never expose values)
  return c.json({
    status: 'ok',
    service: 'Reuse Canada Roofing Measurement Tool',
    timestamp: new Date().toISOString(),
    env_configured: {
      GOOGLE_SOLAR_API_KEY: !!c.env.GOOGLE_SOLAR_API_KEY,
      GOOGLE_MAPS_API_KEY: !!c.env.GOOGLE_MAPS_API_KEY,
      STRIPE_SECRET_KEY: !!c.env.STRIPE_SECRET_KEY,
      STRIPE_PUBLISHABLE_KEY: !!c.env.STRIPE_PUBLISHABLE_KEY,
      DB: !!c.env.DB
    }
  })
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
      stripe_payments: !!c.env.STRIPE_SECRET_KEY && !!c.env.STRIPE_PUBLISHABLE_KEY
    }
  })
})

// ============================================================
// PAGES - Full HTML served from Hono (server-side rendering)
// Google Maps API key is injected server-side into the script tag.
// Secret keys (Solar API, Stripe Secret) are NEVER in HTML.
// ============================================================

// Landing / Order Form page
app.get('/', (c) => {
  const mapsKey = c.env.GOOGLE_MAPS_API_KEY || ''
  return c.html(getMainPageHTML(mapsKey))
})

// Admin Dashboard
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
            brand: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b' },
            accent: { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f' }
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
  // Google Maps script tag — only included if key is configured server-side.
  // The key appears in the HTML <script src> which is how Google designed Maps JS API.
  // This is NOT a secret key. Google Maps JS API keys are restricted by HTTP referrer.
  const mapsScript = mapsApiKey
    ? `<script>
      // Global flag set when Google Maps JS API finishes loading.
      // Defined here (before the Maps <script>) so the callback exists when it fires.
      var googleMapsReady = false;
      function onGoogleMapsReady() {
        googleMapsReady = true;
        console.log('[Maps] Google Maps API loaded successfully');
        // If app.js already rendered step 2, initialize the map now
        if (typeof initMap === 'function' && document.getElementById('map')) {
          initMap();
        }
      }
    </script>
    <script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&callback=onGoogleMapsReady" async defer></script>`
    : '<!-- Google Maps: No API key configured. Using fallback map. Configure in .dev.vars or wrangler secrets. -->'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Roof Measurement Tool - Reuse Canada</title>
  ${mapsScript}
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-brand-800 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-home text-white text-lg"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold">Roof Measurement Tool</h1>
          <p class="text-brand-200 text-xs">Powered by Reuse Canada</p>
        </div>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/admin" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-tachometer-alt mr-1"></i>Admin</a>
        <a href="/settings" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-cog mr-1"></i>Settings</a>
      </nav>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-4 py-8">
    <div id="app-root"></div>
  </main>
  <footer class="bg-gray-800 text-gray-400 text-center py-6 mt-12">
    <p class="text-sm">&copy; 2026 Reuse Canada. All rights reserved.</p>
    <p class="text-xs mt-1">Professional Roof Measurement Reports</p>
  </footer>
  <script src="/static/app.js"></script>
</body>
</html>`
}

function getAdminPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Admin Dashboard - Roof Measurement Tool</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-brand-800 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-home text-white text-lg"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold">Admin Dashboard</h1>
          <p class="text-brand-200 text-xs">Order Management & Analytics</p>
        </div>
      </div>
      <nav class="flex items-center space-x-4">
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-plus mr-1"></i>New Order</a>
        <a href="/settings" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-cog mr-1"></i>Settings</a>
      </nav>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-4 py-8">
    <div id="admin-root"></div>
  </main>
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
  <header class="bg-brand-800 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
          <i class="fas fa-home text-white text-lg"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold">Order Confirmation</h1>
          <p class="text-brand-200 text-xs">Powered by Reuse Canada</p>
        </div>
      </div>
      <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-arrow-left mr-1"></i>New Order</a>
    </div>
  </header>
  <main class="max-w-3xl mx-auto px-4 py-8">
    <div id="confirmation-root"></div>
  </main>
  <script src="/static/confirmation.js"></script>
</body>
</html>`
}

function getSettingsPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getHeadTags()}
  <title>Settings - Roof Measurement Tool</title>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-brand-800 text-white shadow-lg">
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
        <a href="/" class="text-brand-200 hover:text-white text-sm"><i class="fas fa-plus mr-1"></i>New Order</a>
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
