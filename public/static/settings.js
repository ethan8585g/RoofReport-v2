// ============================================================
// Settings Page - API Keys & Company Configuration
// ============================================================

const settingsState = {
  loading: true,
  activeSection: 'company',
  masterCompany: null,
  settings: [],
  saving: false
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderSettings();
});

async function loadSettings() {
  settingsState.loading = true;
  try {
    const [compRes, settRes] = await Promise.all([
      fetch('/api/companies/master'),
      fetch('/api/settings')
    ]);
    const compData = await compRes.json();
    settingsState.masterCompany = compData.company;
    const settData = await settRes.json();
    settingsState.settings = settData.settings || [];
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
      if (el) { el.textContent = 'Saved!'; el.className = 'text-sm text-green-600'; }
      setTimeout(() => { if (el) el.textContent = ''; }, 3000);
    }
  } catch (e) {
    alert('Failed to save: ' + e.message);
  }
}

// ============================================================
// API KEYS
// ============================================================
function renderApiKeysSection() {
  const getVal = (key) => {
    const s = settingsState.settings.find(s => s.setting_key === key);
    return s ? s.setting_value : '';
  };
  const hasVal = (key) => {
    const s = settingsState.settings.find(s => s.setting_key === key);
    return s && s.setting_value && s.setting_value !== '****';
  };

  const keys = [
    {
      key: 'google_solar_api_key',
      label: 'Google Solar API Key',
      desc: 'Required for roof measurement data. Get from Google Cloud Console > Solar API.',
      icon: 'fa-sun',
      color: 'amber',
      link: 'https://console.cloud.google.com/apis/library/solar.googleapis.com'
    },
    {
      key: 'google_maps_api_key',
      label: 'Google Maps API Key',
      desc: 'Required for interactive map and geocoding. Enable Maps JavaScript API + Geocoding API.',
      icon: 'fa-map',
      color: 'blue',
      link: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com'
    },
    {
      key: 'stripe_secret_key',
      label: 'Stripe Secret Key',
      desc: 'For payment processing. Starts with sk_test_ (test) or sk_live_ (production).',
      icon: 'fa-credit-card',
      color: 'purple',
      link: 'https://dashboard.stripe.com/apikeys'
    },
    {
      key: 'stripe_publishable_key',
      label: 'Stripe Publishable Key',
      desc: 'Frontend payment key. Starts with pk_test_ or pk_live_.',
      icon: 'fa-credit-card',
      color: 'purple',
      link: 'https://dashboard.stripe.com/apikeys'
    }
  ];

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-1">
        <i class="fas fa-key mr-2 text-accent-500"></i>API Keys Configuration
      </h3>
      <p class="text-sm text-gray-500 mb-6">
        Configure the API keys that power the roof measurement and payment features.
        Keys are stored securely and masked after saving.
      </p>

      <div class="space-y-6">
        ${keys.map(k => `
          <div class="border border-gray-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center space-x-2">
                <div class="w-8 h-8 bg-${k.color}-100 rounded-lg flex items-center justify-center">
                  <i class="fas ${k.icon} text-${k.color}-500 text-sm"></i>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-gray-800">${k.label}</h4>
                  <p class="text-xs text-gray-500">${k.desc}</p>
                </div>
              </div>
              ${hasVal(k.key) ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><i class="fas fa-check mr-0.5"></i>Configured</span>' : '<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full"><i class="fas fa-exclamation-triangle mr-0.5"></i>Not Set</span>'}
            </div>
            <div class="flex gap-2 mt-3">
              <input type="password" id="key_${k.key}" placeholder="Enter your API key..."
                value="${getVal(k.key)}"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500" />
              <button onclick="toggleKeyVisibility('key_${k.key}')" class="px-3 py-2 bg-gray-100 rounded-lg text-gray-500 hover:bg-gray-200">
                <i class="fas fa-eye"></i>
              </button>
              <button onclick="saveApiKey('${k.key}')" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
                Save
              </button>
            </div>
            <a href="${k.link}" target="_blank" class="text-xs text-brand-600 hover:underline mt-2 inline-block">
              <i class="fas fa-external-link-alt mr-0.5"></i>Get this key
            </a>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

async function saveApiKey(key) {
  const input = document.getElementById(`key_${key}`);
  if (!input || !input.value) {
    alert('Please enter a value');
    return;
  }

  try {
    const res = await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: input.value, encrypted: true })
    });
    if (res.ok) {
      alert(`${key} saved successfully!`);
      await loadSettings();
      renderSettings();
    }
  } catch (e) {
    alert('Failed to save: ' + e.message);
  }
}

// ============================================================
// PRICING SETTINGS
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
      <p class="text-sm text-gray-500 mb-6">Configure pricing for each service tier</p>

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
