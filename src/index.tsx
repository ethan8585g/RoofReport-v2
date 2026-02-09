import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ordersRoutes } from './routes/orders'
import { companiesRoutes } from './routes/companies'
import { settingsRoutes } from './routes/settings'
import { reportsRoutes } from './routes/reports'
import { adminRoutes } from './routes/admin'

type Bindings = {
  DB: D1Database
}

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
  return c.json({ status: 'ok', service: 'Reuse Canada Roofing Measurement Tool', timestamp: new Date().toISOString() })
})

// ============================================================
// PAGES - Full HTML served from Hono
// ============================================================

// Landing / Order Form page
app.get('/', (c) => {
  return c.html(getMainPageHTML())
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

function getMainPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roof Measurement Tool - Reuse Canada</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script>
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
  </script>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Header -->
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

  <!-- Main Content -->
  <main class="max-w-5xl mx-auto px-4 py-8">
    <div id="app-root"></div>
  </main>

  <!-- Footer -->
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - Roof Measurement Tool</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script>
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
  </script>
  <link rel="stylesheet" href="/static/style.css">
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - Roof Measurement Tool</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="/static/style.css">
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - Roof Measurement Tool</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script>
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
  </script>
  <link rel="stylesheet" href="/static/style.css">
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
