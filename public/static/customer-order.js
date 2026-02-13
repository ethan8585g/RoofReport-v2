// ============================================================
// Customer Order Page — Enter address, choose tier, pay or use credit
// ============================================================

const orderState = {
  billing: null,
  packages: [],
  selectedTier: 'regular',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  lat: null,
  lng: null,
  loading: true,
  ordering: false,
};

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async () => {
  await loadOrderData();
  renderOrderPage();
});

async function loadOrderData() {
  orderState.loading = true;
  try {
    const [billingRes, pkgRes] = await Promise.all([
      fetch('/api/stripe/billing', { headers: authHeaders() }),
      fetch('/api/stripe/packages')
    ]);
    if (billingRes.ok) {
      const bd = await billingRes.json();
      orderState.billing = bd.billing;
      // Update header credits badge
      const remaining = bd.billing.credits_remaining || 0;
      const badge = document.getElementById('creditsBadge');
      const countEl = document.getElementById('creditsCount');
      if (badge && countEl && remaining > 0) {
        countEl.textContent = remaining;
        badge.classList.remove('hidden');
      }
    }
    if (pkgRes.ok) {
      const pd = await pkgRes.json();
      orderState.packages = pd.packages || [];
    }
  } catch (e) {
    console.error('Failed to load order data:', e);
  }
  orderState.loading = false;
}

function renderOrderPage() {
  const root = document.getElementById('order-root');
  if (!root) return;

  if (orderState.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-12"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div><span class="ml-3 text-gray-500">Loading...</span></div>';
    return;
  }

  const b = orderState.billing || {};
  const credits = b.credits_remaining || 0;
  const tiers = [
    { id: 'regular', label: 'Regular', desc: '~1.5 hours', price: 10, icon: 'fa-clock', color: 'green' },
    { id: 'urgent', label: 'Urgent', desc: '~30 min', price: 15, icon: 'fa-bolt', color: 'amber' },
    { id: 'immediate', label: 'Immediate', desc: '~5 min', price: 25, icon: 'fa-rocket', color: 'red' },
  ];

  const selectedTierInfo = tiers.find(t => t.id === orderState.selectedTier) || tiers[0];

  root.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <!-- Credits Banner -->
      ${credits > 0 ? `
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><i class="fas fa-coins text-green-600"></i></div>
            <div>
              <p class="font-semibold text-green-800">You have ${credits} credit${credits !== 1 ? 's' : ''} available</p>
              <p class="text-sm text-green-600">Each credit = 1 roof measurement report, any tier</p>
            </div>
          </div>
          <span class="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">${credits}</span>
        </div>
      ` : `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><i class="fas fa-credit-card text-amber-600"></i></div>
            <div>
              <p class="font-semibold text-amber-800">No credits — pay per report</p>
              <p class="text-sm text-amber-600">You'll be redirected to Stripe to pay securely</p>
            </div>
          </div>
          <a href="/pricing" class="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700">Buy Credits</a>
        </div>
      `}

      <!-- Order Form -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <!-- Header -->
        <div class="bg-brand-800 text-white p-6">
          <h2 class="text-xl font-bold"><i class="fas fa-map-marker-alt mr-2"></i>Order a Roof Measurement Report</h2>
          <p class="text-brand-200 text-sm mt-1">Enter the property address and select delivery speed</p>
        </div>

        <div class="p-6 space-y-6">
          <!-- Property Address -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">Property Address *</label>
            <input type="text" id="orderAddress" placeholder="123 Main St, Edmonton, AB"
              value="${orderState.address}"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
              oninput="orderState.address = this.value">
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" id="orderCity" placeholder="Edmonton" value="${orderState.city}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="orderState.city = this.value">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input type="text" id="orderProvince" placeholder="AB" value="${orderState.province}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="orderState.province = this.value">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input type="text" id="orderPostal" placeholder="T5A 1A1" value="${orderState.postalCode}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="orderState.postalCode = this.value">
            </div>
          </div>

          <!-- Service Tier -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-3">Delivery Speed</label>
            <div class="grid grid-cols-3 gap-3">
              ${tiers.map(t => `
                <button onclick="selectTier('${t.id}')"
                  class="p-4 rounded-xl border-2 text-center transition-all hover:shadow-md
                    ${orderState.selectedTier === t.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-gray-200 hover:border-gray-300'}">
                  <i class="fas ${t.icon} text-${t.color}-500 text-xl mb-2"></i>
                  <h4 class="font-bold text-gray-800">${t.label}</h4>
                  <p class="text-xs text-gray-500 mb-2">${t.desc}</p>
                  <p class="text-lg font-black text-gray-900">$${t.price}<span class="text-xs font-normal text-gray-500"> CAD</span></p>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Error/Success Messages -->
          <div id="orderMsg" class="hidden p-4 rounded-xl text-sm"></div>

          <!-- Action Buttons -->
          <div class="flex gap-4">
            ${credits > 0 ? `
              <button onclick="useCredit()" id="creditBtn" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg text-lg">
                <i class="fas fa-coins mr-2"></i>Use 1 Credit
              </button>
            ` : ''}
            <button onclick="payWithStripe()" id="stripeBtn" class="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg text-lg">
              <i class="fab fa-stripe mr-2"></i>Pay $${selectedTierInfo.price} with Stripe
            </button>
          </div>

          ${credits > 0 ? '<p class="text-center text-xs text-gray-400">Using a credit works for any tier at no additional cost</p>' : ''}
        </div>
      </div>

      <!-- Credit Packs Upsell -->
      ${credits <= 2 ? `
        <div class="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-tags text-brand-500 mr-2"></i>Save with Credit Packs</h3>
          <div class="grid grid-cols-5 gap-3">
            ${orderState.packages.map(pkg => {
              const priceEach = (pkg.price_cents / 100 / pkg.credits).toFixed(2);
              return `
                <button onclick="buyPackage(${pkg.id})" class="p-3 border border-gray-200 rounded-xl text-center hover:border-brand-300 hover:shadow-md transition-all">
                  <p class="font-bold text-gray-800">${pkg.name}</p>
                  <p class="text-xs text-gray-500 mb-1">${pkg.credits} credit${pkg.credits > 1 ? 's' : ''}</p>
                  <p class="text-lg font-black text-brand-600">$${(pkg.price_cents / 100).toFixed(0)}</p>
                  <p class="text-[10px] text-gray-400">$${priceEach}/ea</p>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function selectTier(tier) {
  orderState.selectedTier = tier;
  renderOrderPage();
}

function showMsg(type, msg) {
  const el = document.getElementById('orderMsg');
  if (!el) return;
  el.className = type === 'error'
    ? 'p-4 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200'
    : 'p-4 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200';
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function validate() {
  const addr = (document.getElementById('orderAddress') || {}).value || '';
  if (!addr.trim()) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Please enter a property address.');
    return false;
  }
  return true;
}

async function useCredit() {
  if (!validate()) return;
  const btn = document.getElementById('creditBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...'; }

  try {
    const res = await fetch('/api/stripe/use-credit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        property_address: document.getElementById('orderAddress').value.trim(),
        property_city: document.getElementById('orderCity').value.trim(),
        property_province: document.getElementById('orderProvince').value.trim(),
        property_postal_code: document.getElementById('orderPostal').value.trim(),
        service_tier: orderState.selectedTier,
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showMsg('success', '<i class="fas fa-check-circle mr-2"></i>Order placed! Report is being generated. Redirecting to dashboard...');
      setTimeout(() => { window.location.href = '/customer/dashboard'; }, 2000);
    } else {
      showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>' + (data.error || 'Failed to use credit'));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins mr-2"></i>Use 1 Credit'; }
    }
  } catch (e) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Network error. Please try again.');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins mr-2"></i>Use 1 Credit'; }
  }
}

async function payWithStripe() {
  if (!validate()) return;
  const btn = document.getElementById('stripeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Redirecting to Stripe...'; }

  try {
    const res = await fetch('/api/stripe/checkout/report', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        property_address: document.getElementById('orderAddress').value.trim(),
        property_city: document.getElementById('orderCity').value.trim(),
        property_province: document.getElementById('orderProvince').value.trim(),
        property_postal_code: document.getElementById('orderPostal').value.trim(),
        service_tier: orderState.selectedTier,
      })
    });
    const data = await res.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>' + (data.error || 'Checkout failed'));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-stripe mr-2"></i>Pay with Stripe'; }
    }
  } catch (e) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Network error. Please try again.');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-stripe mr-2"></i>Pay with Stripe'; }
  }
}

async function buyPackage(pkgId) {
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ package_id: pkgId })
    });
    const data = await res.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      alert(data.error || 'Checkout failed');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  }
}
