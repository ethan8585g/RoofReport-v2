// ============================================================
// Settings Page - Company Configuration & API Key Status
// ============================================================
// SECURITY MODEL:
// - API keys are stored in Cloudflare environment variables
//   (.dev.vars for local dev, wrangler secrets for production)
// - Keys are NEVER stored in the database
// - Keys are NEVER exposed to frontend JavaScript
// - This page shows configuration STATUS only (set/not set)
// - Pricing and company profile are stored in DB (non-sensitive)
// ============================================================

const settingsState = {
  loading: true,
  activeSection: 'company',
  masterCompany: null,
  settings: [],
  envStatus: null,
  saving: false
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderSettings();
});

async function loadSettings() {
  settingsState.loading = true;
  try {
    const [compRes, settRes, envRes] = await Promise.all([
      fetch('/api/companies/master'),
      fetch('/api/settings'),
      fetch('/api/health')
    ]);
    const compData = await compRes.json();
    settingsState.masterCompany = compData.company;
    const settData = await settRes.json();
    settingsState.settings = settData.settings || [];
    const envData = await envRes.json();
    settingsState.envStatus = envData.env_configured || {};
  } catch (e) {
    console.error('Settings load error:', e);
  }
  settingsState.loading = false;
}

function renderSettings() {
  const root = document.getElementById('settings-root');
  if (!root) return;

  if (settingsState.loading) {
    root.innerHTML = `
      <div class="flex items-center justify-center py-12">
        <div class="spinner" style="border-color: rgba(16,185,129,0.3); border-top-color: #10b981; width: 40px; height: 40px;"></div>
        <span class="ml-3 text-gray-500">Loading settings...</span>
      </div>
    `;
    return;
  }

  const sections = [
    { id: 'company', label: 'Company Profile', icon: 'fa-building' },
    { id: 'apikeys', label: 'API Keys', icon: 'fa-key' },
    { id: 'pricing', label: 'Pricing', icon: 'fa-dollar-sign' },
  ];

  root.innerHTML = `
    <div class="grid md:grid-cols-4 gap-6">
      <!-- Sidebar -->
      <div class="md:col-span-1">
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          ${sections.map(s => `
            <button onclick="switchSection('${s.id}')"
              class="w-full px-4 py-3 text-left text-sm font-medium flex items-center space-x-2 transition-colors
              ${settingsState.activeSection === s.id ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-500' : 'text-gray-600 hover:bg-gray-50 border-l-4 border-transparent'}">
              <i class="fas ${s.icon} w-5"></i>
              <span>${s.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Content -->
      <div class="md:col-span-3">
        ${settingsState.activeSection === 'company' ? renderCompanySection() : ''}
        ${settingsState.activeSection === 'apikeys' ? renderApiKeysSection() : ''}
        ${settingsState.activeSection === 'pricing' ? renderPricingSection() : ''}
      </div>
    </div>
  `;
}

function switchSection(section) {
  settingsState.activeSection = section;
  renderSettings();
}

// ============================================================
// COMPANY PROFILE
// ============================================================
function renderCompanySection() {
  const c = settingsState.masterCompany || {};
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-1">
        <i class="fas fa-building mr-2 text-brand-500"></i>Master Company Profile
      </h3>
      <p class="text-sm text-gray-500 mb-6">This identifies your business on all reports and API requests</p>

      <div class="space-y-4">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Company Name <span class="text-red-500">*</span></label>
            <input type="text" id="mcName" value="${c.company_name || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" placeholder="Reuse Canada" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Name <span class="text-red-500">*</span></label>
            <input type="text" id="mcContact" value="${c.contact_name || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email <span class="text-red-500">*</span></label>
            <input type="email" id="mcEmail" value="${c.email || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" id="mcPhone" value="${c.phone || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
          <input type="text" id="mcAddress" value="${c.address || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
        </div>
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" id="mcCity" value="${c.city || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
            <input type="text" id="mcProvince" value="${c.province || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input type="text" id="mcPostal" value="${c.postal_code || ''}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      </div>

      <div class="mt-6 flex items-center space-x-3">
        <button onclick="saveMasterCompany()" class="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium text-sm">
          <i class="fas fa-save mr-1"></i>Save Company Profile
        </button>
        <span id="compSaveStatus" class="text-sm text-gray-400"></span>
      </div>
    </div>
  `;
}

async function saveMasterCompany() {
  const data = {
    company_name: document.getElementById('mcName')?.value,
    contact_name: document.getElementById('mcContact')?.value,
    email: document.getElementById('mcEmail')?.value,
    phone: document.getElementById('mcPhone')?.value,
    address: document.getElementById('mcAddress')?.value,
    city: document.getElementById('mcCity')?.value,
    province: document.getElementById('mcProvince')?.value,
    postal_code: document.getElementById('mcPostal')?.value
  };

  if (!data.company_name || !data.contact_name || !data.email) {
    alert('Company name, contact name, and email are required');
    return;
  }

  try {
    const res = await fetch('/api/companies/master', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      const el = document.getElementById('compSaveStatus');
      if (el) { el.textContent = 'Saved successfully!'; el.className = 'text-sm text-green-600'; }
      setTimeout(() => { if (el) el.textContent = ''; }, 3000);
    }
  } catch (e) {
    alert('Failed to save: ' + e.message);
  }
}

// ============================================================
// API KEYS — Environment Variable Status (Read-Only)
// Keys are NEVER stored in the database.
// Keys are NEVER entered through the web UI.
// This section shows whether each key is configured server-side.
// ============================================================
function renderApiKeysSection() {
  const env = settingsState.envStatus || {};

  const keys = [
    {
      envVar: 'GOOGLE_SOLAR_API_KEY',
      label: 'Google Solar API Key',
      desc: 'Required for real roof measurement data from Google. Powers the core measurement engine.',
      icon: 'fa-sun',
      color: 'amber',
      configured: env.GOOGLE_SOLAR_API_KEY,
      setupCmd: 'npx wrangler pages secret put GOOGLE_SOLAR_API_KEY',
      localFile: '.dev.vars',
      getUrl: 'https://console.cloud.google.com/apis/library/solar.googleapis.com'
    },
    {
      envVar: 'GOOGLE_MAPS_API_KEY',
      label: 'Google Maps API Key',
      desc: 'Required for interactive satellite map and address geocoding. Loaded server-side into the page.',
      icon: 'fa-map',
      color: 'blue',
      configured: env.GOOGLE_MAPS_API_KEY,
      setupCmd: 'npx wrangler pages secret put GOOGLE_MAPS_API_KEY',
      localFile: '.dev.vars',
      getUrl: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com'
    },
    {
      envVar: 'STRIPE_SECRET_KEY',
      label: 'Stripe Secret Key',
      desc: 'Server-side only. Used for creating payment intents and processing charges. NEVER exposed to frontend.',
      icon: 'fa-lock',
      color: 'purple',
      configured: env.STRIPE_SECRET_KEY,
      setupCmd: 'npx wrangler pages secret put STRIPE_SECRET_KEY',
      localFile: '.dev.vars',
      getUrl: 'https://dashboard.stripe.com/apikeys'
    },
    {
      envVar: 'STRIPE_PUBLISHABLE_KEY',
      label: 'Stripe Publishable Key',
      desc: 'Safe for frontend use. Used by Stripe.js to tokenize card details (never touches your server).',
      icon: 'fa-credit-card',
      color: 'purple',
      configured: env.STRIPE_PUBLISHABLE_KEY,
      setupCmd: 'npx wrangler pages secret put STRIPE_PUBLISHABLE_KEY',
      localFile: '.dev.vars',
      getUrl: 'https://dashboard.stripe.com/apikeys'
    }
  ];

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-1">
        <i class="fas fa-shield-alt mr-2 text-brand-500"></i>API Key Configuration
      </h3>
      <p class="text-sm text-gray-500 mb-2">
        API keys are stored as <strong>environment variables</strong> for security.
        They are never stored in the database or exposed to frontend code.
      </p>

      <!-- Security Notice -->
      <div class="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
        <h4 class="text-sm font-semibold text-brand-800 flex items-center">
          <i class="fas fa-shield-alt mr-2"></i>Security Architecture
        </h4>
        <ul class="mt-2 text-xs text-brand-700 space-y-1">
          <li><i class="fas fa-check mr-1"></i> API keys live in environment variables, not in code or database</li>
          <li><i class="fas fa-check mr-1"></i> Secret keys (Solar API, Stripe Secret) are server-side only</li>
          <li><i class="fas fa-check mr-1"></i> Google Maps key is injected server-side into the HTML (referrer-restricted)</li>
          <li><i class="fas fa-check mr-1"></i> Frontend JavaScript never has access to secret keys</li>
          <li><i class="fas fa-check mr-1"></i> For production, use <code class="bg-brand-100 px-1 rounded">wrangler pages secret put</code></li>
        </ul>
      </div>

      <!-- Key Status Cards -->
      <div class="space-y-4">
        ${keys.map(k => `
          <div class="border ${k.configured ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'} rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-${k.color}-100 rounded-lg flex items-center justify-center">
                  <i class="fas ${k.icon} text-${k.color}-500"></i>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-gray-800">${k.label}</h4>
                  <p class="text-xs text-gray-500">${k.desc}</p>
                </div>
              </div>
              ${k.configured
                ? '<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Active</span>'
                : '<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium"><i class="fas fa-exclamation-triangle mr-1"></i>Not Set</span>'
              }
            </div>

            ${!k.configured ? `
              <div class="mt-3 bg-white rounded border border-gray-200 p-3">
                <p class="text-xs font-medium text-gray-700 mb-2">How to configure:</p>
                <div class="space-y-2 text-xs text-gray-600">
                  <div>
                    <span class="font-medium">Local development:</span>
                    <code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs ml-1">Add to <strong>${k.localFile}</strong></code>
                    <pre class="mt-1 bg-gray-800 text-green-400 p-2 rounded text-xs overflow-x-auto">${k.envVar}=your_key_here</pre>
                  </div>
                  <div>
                    <span class="font-medium">Production:</span>
                    <pre class="mt-1 bg-gray-800 text-green-400 p-2 rounded text-xs overflow-x-auto">${k.setupCmd}</pre>
                  </div>
                  <a href="${k.getUrl}" target="_blank" class="inline-block text-brand-600 hover:underline mt-1">
                    <i class="fas fa-external-link-alt mr-0.5"></i>Get this API key
                  </a>
                </div>
              </div>
            ` : `
              <div class="mt-2 text-xs text-green-600">
                <i class="fas fa-info-circle mr-1"></i>
                Environment variable <code class="bg-green-100 px-1 rounded">${k.envVar}</code> is configured and active.
              </div>
            `}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// PRICING SETTINGS (stored in DB — these are not secrets)
// ============================================================
function renderPricingSection() {
  const getVal = (key) => {
    const s = settingsState.settings.find(s => s.setting_key === key);
    return s ? s.setting_value : '';
  };

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-1">
        <i class="fas fa-dollar-sign mr-2 text-green-500"></i>Pricing Configuration
      </h3>
      <p class="text-sm text-gray-500 mb-6">Configure pricing for each service tier (stored in database, not sensitive)</p>

      <div class="space-y-4">
        <div class="grid md:grid-cols-3 gap-4">
          <div class="border border-red-200 rounded-lg p-4 bg-red-50">
            <div class="flex items-center space-x-2 mb-3">
              <i class="fas fa-rocket text-red-500"></i>
              <h4 class="font-semibold text-gray-800">Immediate</h4>
            </div>
            <label class="block text-xs text-gray-500 mb-1">Price (CAD)</label>
            <input type="number" id="price_immediate" value="${getVal('price_immediate') || '25'}" step="0.01"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-center" />
            <p class="text-xs text-gray-500 mt-2">Delivery: Under 5 min</p>
          </div>
          <div class="border border-amber-200 rounded-lg p-4 bg-amber-50">
            <div class="flex items-center space-x-2 mb-3">
              <i class="fas fa-bolt text-amber-500"></i>
              <h4 class="font-semibold text-gray-800">Urgent</h4>
            </div>
            <label class="block text-xs text-gray-500 mb-1">Price (CAD)</label>
            <input type="number" id="price_urgent" value="${getVal('price_urgent') || '15'}" step="0.01"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-center" />
            <p class="text-xs text-gray-500 mt-2">Delivery: 15-30 min</p>
          </div>
          <div class="border border-green-200 rounded-lg p-4 bg-green-50">
            <div class="flex items-center space-x-2 mb-3">
              <i class="fas fa-clock text-green-500"></i>
              <h4 class="font-semibold text-gray-800">Regular</h4>
            </div>
            <label class="block text-xs text-gray-500 mb-1">Price (CAD)</label>
            <input type="number" id="price_regular" value="${getVal('price_regular') || '10'}" step="0.01"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-center" />
            <p class="text-xs text-gray-500 mt-2">Delivery: 45min - 1.5hr</p>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <button onclick="savePricing()" class="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium text-sm">
          <i class="fas fa-save mr-1"></i>Save Pricing
        </button>
      </div>
    </div>
  `;
}

async function savePricing() {
  const settings = [
    { key: 'price_immediate', value: document.getElementById('price_immediate')?.value || '25', encrypted: false },
    { key: 'price_urgent', value: document.getElementById('price_urgent')?.value || '15', encrypted: false },
    { key: 'price_regular', value: document.getElementById('price_regular')?.value || '10', encrypted: false }
  ];

  try {
    const res = await fetch('/api/settings/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    if (res.ok) {
      alert('Pricing saved successfully!');
    }
  } catch (e) {
    alert('Failed to save: ' + e.message);
  }
}
