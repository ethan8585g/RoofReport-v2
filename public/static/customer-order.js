// ============================================================
// Customer Order Page — Enter address, choose tier, pay or use credit
// ============================================================

const orderState = {
  billing: null,
  packages: [],
  selectedTier: 'standard',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  lat: null,
  lng: null,
  loading: true,
  ordering: false,
  map: null,
  marker: null,
  geocoder: null
};

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async () => {
  await loadOrderData();
  renderOrderPage();
  renderOrderPage();

  // Check for Google Maps API load status
  setTimeout(() => {
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
      const errEl = document.getElementById('mapError');
      if (errEl) {
        errEl.textContent = 'Google Maps API failed to load. Please check your network connection or API configuration.';
        errEl.classList.remove('hidden');
      }
    }
  }, 3000);

  // Try initializing map if Google script is already loaded
  if (window.googleMapsReady && typeof initOrderMap === 'function') {
    initOrderMap();
  }
});

// Global callback for Google Maps
window.initOrderMap = function () {
  if (!document.getElementById('orderMap')) return;

  orderState.geocoder = new google.maps.Geocoder();
  const defaultLoc = { lat: 53.5461, lng: -113.4938 }; // Edmonton default

  orderState.map = new google.maps.Map(document.getElementById('orderMap'), {
    zoom: 11,
    center: defaultLoc,
    mapTypeId: 'hybrid',
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false
  });

  orderState.marker = new google.maps.Marker({
    map: orderState.map,
    position: defaultLoc,
    draggable: true,
    animation: google.maps.Animation.DROP,
    title: "Drag to center of roof"
  });

  // Drag listener
  orderState.marker.addListener('dragend', () => {
    const pos = orderState.marker.getPosition();
    orderState.lat = pos.lat();
    orderState.lng = pos.lng();
    document.getElementById('locationMsg').classList.remove('hidden');
    document.getElementById('locationMsgText').textContent = `Pin location updated: ${pos.lat().toFixed(6)}, ${pos.lng().toFixed(6)}`;
  });

  // Map click listener (move pin to click)
  orderState.map.addListener('click', (e) => {
    orderState.marker.setPosition(e.latLng);
    orderState.lat = e.latLng.lat();
    orderState.lng = e.latLng.lng();
    document.getElementById('locationMsg').classList.remove('hidden');
    document.getElementById('locationMsgText').textContent = `Pin location updated: ${e.latLng.lat().toFixed(6)}, ${e.latLng.lng().toFixed(6)}`;
  });
};

function geocodeAndCenter() {
  if (!orderState.geocoder || !orderState.map) return;

  const fullAddress = [
    document.getElementById('orderAddress').value,
    document.getElementById('orderCity').value,
    document.getElementById('orderProvince').value
  ].filter(Boolean).join(', ');

  if (!fullAddress) return;

  orderState.geocoder.geocode({ 'address': fullAddress }, (results, status) => {
    if (status === 'OK' && results[0]) {
      const loc = results[0].geometry.location;
      orderState.map.setCenter(loc);
      orderState.map.setZoom(21); // High zoom for roof selection
      orderState.marker.setPosition(loc);
      orderState.lat = loc.lat();
      orderState.lng = loc.lng();
      document.getElementById('mapError').classList.add('hidden');
    } else {
      document.getElementById('mapError').classList.remove('hidden');
      document.getElementById('mapError').textContent = 'Could not find location: ' + status;
    }
  });
}

function updateAddressFromFields() {
  orderState.address = document.getElementById('orderAddress').value;
  orderState.city = document.getElementById('orderCity').value;
  orderState.province = document.getElementById('orderProvince').value;
  orderState.postalCode = document.getElementById('orderPostal').value;

  // Debounce geocoding
  if (orderState.debounceTimer) clearTimeout(orderState.debounceTimer);
  orderState.debounceTimer = setTimeout(() => {
    geocodeAndCenter();
  }, 1000);
}


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
  const freeTrialRemaining = b.free_trial_remaining || 0;
  const paidCredits = b.paid_credits_remaining || 0;
  const isTrialAvailable = freeTrialRemaining > 0;
  const tiers = [
    { id: 'standard', label: 'Roof Report', desc: 'Instant AI-Powered', price: 10, icon: 'fa-bolt', color: 'brand' },
  ];

  const selectedTierInfo = tiers.find(t => t.id === orderState.selectedTier) || tiers[0];

  root.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <!-- Credits Banner -->
      ${isTrialAvailable ? `
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-gift text-blue-600"></i></div>
              <div>
                <p class="font-semibold text-blue-800"><i class="fas fa-star text-yellow-500 mr-1"></i>Free Trial: ${freeTrialRemaining} of ${b.free_trial_total || 3} reports remaining!</p>
                <p class="text-sm text-blue-600">Use your free trial reports on any address — no credit card needed</p>
              </div>
            </div>
            <span class="bg-blue-600 text-white px-3 py-1.5 rounded-full text-lg font-bold">${freeTrialRemaining}</span>
          </div>
        </div>
      ` : paidCredits > 0 ? `
        <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><i class="fas fa-coins text-green-600"></i></div>
              <div>
                <p class="font-semibold text-green-800">You have ${paidCredits} paid credit${paidCredits !== 1 ? 's' : ''} remaining</p>
                <p class="text-sm text-green-600">Use your credits on any report</p>
              </div>
            </div>
            <span class="bg-green-600 text-white px-3 py-1.5 rounded-full text-lg font-bold">${paidCredits}</span>
          </div>
        </div>
      ` : `
        <div class="bg-gradient-to-r from-brand-800 to-brand-900 rounded-xl p-5 mb-6 shadow-lg">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shadow"><i class="fas fa-crown text-white text-xl"></i></div>
              <div>
                <p class="font-bold text-white text-base">Your 3 Free Trials Are Used Up!</p>
                <p class="text-sm text-brand-200 mt-0.5">Credit packs start at <strong class="text-amber-400">$5.00/report</strong> — save up to 50% vs single purchase</p>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <a href="/pricing" class="bg-amber-500 hover:bg-amber-400 text-gray-900 px-5 py-2.5 rounded-xl text-sm font-black transition-all hover:scale-105 shadow-lg"><i class="fas fa-tags mr-1.5"></i>Buy Credits</a>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <div class="bg-white/10 rounded-lg px-3 py-2 text-center"><p class="text-amber-400 font-black text-sm">$7/ea</p><p class="text-white/60 text-[10px]">5 Pack</p></div>
            <div class="bg-white/10 rounded-lg px-3 py-2 text-center"><p class="text-amber-400 font-black text-sm">$6/ea</p><p class="text-white/60 text-[10px]">10 Pack</p></div>
            <div class="bg-white/10 rounded-lg px-3 py-2 text-center"><p class="text-amber-400 font-black text-sm">$5/ea</p><p class="text-white/60 text-[10px]">50 Pack</p></div>
          </div>
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
              oninput="updateAddressFromFields()">
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" id="orderCity" placeholder="Edmonton" value="${orderState.city}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="updateAddressFromFields()">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input type="text" id="orderProvince" placeholder="AB" value="${orderState.province}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="updateAddressFromFields()">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input type="text" id="orderPostal" placeholder="T5A 1A1" value="${orderState.postalCode}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"
                oninput="updateAddressFromFields()">
            </div>
          </div>
          
           <!-- Location Map -->
          <div class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-1 relative">
             <div class="absolute top-3 left-3 right-3 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-gray-200 shadow-sm flex items-start gap-3">
               <div class="text-brand-600 mt-1"><i class="fas fa-info-circle"></i></div>
               <div>
                 <p class="text-sm font-bold text-gray-800">Confirm Location Accuracy</p>
                 <p class="text-xs text-gray-600">Drag the <span class="text-red-600 font-bold">RED PIN</span> to the center of the roof structure to ensure maximum report accuracy.</p>
                 <div id="locationMsg" class="hidden mt-1 text-xs text-green-700 font-mono bg-green-50 px-2 py-1 rounded border border-green-100"><i class="fas fa-crosshairs mr-1"></i><span id="locationMsgText"></span></div>
               </div>
             </div>
             
             <!-- Error overlay -->
             <div id="mapError" class="hidden absolute inset-0 z-20 bg-gray-100/90 flex items-center justify-center text-red-600 font-semibold p-4 text-center"></div>

             <div id="orderMap" class="w-full h-80 rounded-lg bg-gray-200"></div>
          </div>

          <!-- Confirm Location Checkbox -->
          <div class="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div class="flex items-center h-5">
              <input type="checkbox" id="confirmLocation" class="w-5 h-5 text-brand-600 border-gray-300 rounded focus:ring-brand-500 cursor-pointer">
            </div>
            <label for="confirmLocation" class="text-sm text-gray-700 font-medium cursor-pointer select-none">
              I have verified that the <span class="text-red-600 font-bold">RED PIN</span> is on the roof structure. <span class="text-gray-500 font-normal">(Required to proceed)</span>
            </label>
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
            ${isTrialAvailable ? `
              <button onclick="useCredit()" id="creditBtn" class="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg text-lg">
                <i class="fas fa-gift mr-2"></i>Use Free Trial Report (${freeTrialRemaining} left)
              </button>
              <button onclick="payWithStripe()" id="stripeBtn" class="py-4 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all text-sm">
                <i class="fab fa-stripe mr-1"></i>Pay $${selectedTierInfo.price} instead
              </button>
            ` : paidCredits > 0 ? `
              <button onclick="useCredit()" id="creditBtn" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg text-lg">
                <i class="fas fa-coins mr-2"></i>Use Paid Credit (${paidCredits} left)
              </button>
              <button onclick="payWithStripe()" id="stripeBtn" class="py-4 px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all text-sm">
                <i class="fab fa-stripe mr-1"></i>Pay $${selectedTierInfo.price} instead
              </button>
            ` : `
              <button onclick="payWithStripe()" id="stripeBtn" class="flex-1 py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg text-lg">
                <i class="fab fa-stripe mr-2"></i>Pay $${selectedTierInfo.price} with Stripe
              </button>
            `}
          </div>

          ${isTrialAvailable ? '<p class="text-center text-xs text-gray-400"><i class="fas fa-check-circle text-blue-500 mr-1"></i>Free trial reports work for any delivery speed at no cost</p>' : paidCredits > 0 ? '<p class="text-center text-xs text-gray-400"><i class="fas fa-check-circle text-green-500 mr-1"></i>Your credits work for any delivery speed</p>' : ''}
        </div>
      </div>

      <!-- Credit Packs Upsell -->
      ${credits <= 3 ? `
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

  // Re-init map if it was already loaded (when switching tiers or re-rendering)
  if (window.googleMapsReady && typeof initOrderMap === 'function') {
    setTimeout(initOrderMap, 100);
  }
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

  // STRICT VALIDATION: Must have coordinates (Pin on Map)
  if (!orderState.lat || !orderState.lng) {
    showMsg('error', '<i class="fas fa-map-marker-alt mr-1"></i>Please wait for the map to load or drag the pin to the roof location.');
    // Scroll to map
    const mapEl = document.getElementById('orderMap');
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  // STRICT VALIDATION: Must check the box
  const confirmBox = document.getElementById('confirmLocation');
  if (!confirmBox || !confirmBox.checked) {
    showMsg('error', '<i class="fas fa-check-square mr-1"></i>Please check the box to confirm the pin is on the roof.');
    // Scroll to checkbox
    if (confirmBox) confirmBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight it
    if (confirmBox) confirmBox.parentElement.parentElement.classList.add('ring-2', 'ring-red-500');
    return false;
  } else {
    if (confirmBox) confirmBox.parentElement.parentElement.classList.remove('ring-2', 'ring-red-500');
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
        latitude: orderState.lat,
        longitude: orderState.lng
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
        latitude: orderState.lat,
        longitude: orderState.lng
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
