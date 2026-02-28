// ============================================================
// Customer Order Page — Lat/Lng based ordering with interactive map
// ============================================================

const orderState = {
  billing: null,
  packages: [],
  selectedTier: 'standard',
  lat: '',
  lng: '',
  address: '',  // auto-filled via reverse geocode
  city: '',
  province: '',
  postalCode: '',
  mapReady: false,
  loading: true,
  ordering: false,
  marker: null,
  map: null,
};

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async () => {
  await loadOrderData();
  renderOrderPage();
  initMap();
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

function initMap() {
  // Wait for Google Maps to load
  if (typeof google === 'undefined' || !google.maps) {
    setTimeout(initMap, 300);
    return;
  }

  const mapEl = document.getElementById('orderMap');
  if (!mapEl) return;

  // Default center: Edmonton, Alberta
  const defaultCenter = { lat: 53.5461, lng: -113.4938 };

  orderState.map = new google.maps.Map(mapEl, {
    center: defaultCenter,
    zoom: 13,
    mapTypeId: 'hybrid',
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_RIGHT,
      mapTypeIds: ['roadmap', 'satellite', 'hybrid']
    },
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    styles: []
  });

  // Click on map to place pin
  orderState.map.addListener('click', (e) => {
    placeMarker(e.latLng.lat(), e.latLng.lng());
  });

  // Add search box
  const searchInput = document.getElementById('mapSearchInput');
  if (searchInput && google.maps.places) {
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      componentRestrictions: { country: 'ca' },
      fields: ['geometry', 'formatted_address', 'address_components']
    });
    autocomplete.bindTo('bounds', orderState.map);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        orderState.map.setCenter({ lat, lng });
        orderState.map.setZoom(19);
        placeMarker(lat, lng);
        // Parse address components
        if (place.address_components) {
          parseAddressComponents(place.address_components, place.formatted_address);
        }
      }
    });
  }

  orderState.mapReady = true;
}

function placeMarker(lat, lng) {
  // Round to 7 decimal places
  lat = Math.round(lat * 10000000) / 10000000;
  lng = Math.round(lng * 10000000) / 10000000;

  // Update state
  orderState.lat = lat;
  orderState.lng = lng;

  // Update input fields
  const latInput = document.getElementById('orderLat');
  const lngInput = document.getElementById('orderLng');
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;

  // Remove old marker
  if (orderState.marker) {
    orderState.marker.setMap(null);
  }

  // Place new marker
  orderState.marker = new google.maps.Marker({
    position: { lat, lng },
    map: orderState.map,
    draggable: true,
    animation: google.maps.Animation.DROP,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#EF4444',
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 3,
    }
  });

  // Allow dragging the marker
  orderState.marker.addListener('dragend', (e) => {
    placeMarker(e.latLng.lat(), e.latLng.lng());
  });

  // Center map on marker
  orderState.map.panTo({ lat, lng });
  if (orderState.map.getZoom() < 17) {
    orderState.map.setZoom(18);
  }

  // Reverse geocode to fill address
  reverseGeocode(lat, lng);

  // Update the coordinate display
  updateCoordDisplay(lat, lng);

  // Clear any error messages
  const msgEl = document.getElementById('orderMsg');
  if (msgEl) msgEl.classList.add('hidden');
}

function updateCoordDisplay(lat, lng) {
  const display = document.getElementById('coordDisplay');
  if (display) {
    display.innerHTML = `
      <div class="flex items-center gap-2 text-sm">
        <i class="fas fa-map-pin text-red-500"></i>
        <span class="font-mono font-semibold text-gray-800">${lat}, ${lng}</span>
        <span class="text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i>Pin placed</span>
      </div>
    `;
    display.classList.remove('hidden');
  }
  const addrDisplay = document.getElementById('resolvedAddress');
  if (addrDisplay) {
    addrDisplay.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400 mr-1"></i><span class="text-gray-400 text-sm">Looking up address...</span>';
    addrDisplay.classList.remove('hidden');
  }
}

async function reverseGeocode(lat, lng) {
  try {
    if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      const result = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === 'OK' && results[0]) resolve(results[0]);
          else reject(new Error(status));
        });
      });

      orderState.address = result.formatted_address || `${lat}, ${lng}`;
      parseAddressComponents(result.address_components, result.formatted_address);

      const addrDisplay = document.getElementById('resolvedAddress');
      if (addrDisplay) {
        addrDisplay.innerHTML = `
          <i class="fas fa-map-marker-alt text-brand-500 mr-1"></i>
          <span class="text-sm text-gray-700 font-medium">${orderState.address}</span>
        `;
      }
    }
  } catch (e) {
    console.warn('Reverse geocode failed:', e);
    orderState.address = `${lat}, ${lng}`;
    const addrDisplay = document.getElementById('resolvedAddress');
    if (addrDisplay) {
      addrDisplay.innerHTML = `
        <i class="fas fa-map-marker-alt text-gray-400 mr-1"></i>
        <span class="text-sm text-gray-500">Coordinates: ${lat}, ${lng}</span>
      `;
    }
  }
}

function parseAddressComponents(components, formattedAddress) {
  orderState.address = formattedAddress || orderState.address;
  for (const comp of components) {
    if (comp.types.includes('locality')) orderState.city = comp.long_name;
    if (comp.types.includes('administrative_area_level_1')) orderState.province = comp.short_name;
    if (comp.types.includes('postal_code')) orderState.postalCode = comp.long_name;
  }
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
                <p class="text-sm text-blue-600">Use your free trial reports on any property — no credit card needed</p>
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
        <div class="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-6">
          <h2 class="text-xl font-bold"><i class="fas fa-crosshairs mr-2"></i>Order a Roof Measurement Report</h2>
          <p class="text-brand-200 text-sm mt-1">Click the map or enter coordinates to select a roof location</p>
        </div>

        <div class="p-6 space-y-5">
          
          <!-- Search Bar -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-search mr-1"></i>Search Address (optional — or click the map)</label>
            <input type="text" id="mapSearchInput" placeholder="Search an address to jump to it on the map..."
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm">
          </div>

          <!-- Interactive Map -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-map mr-1"></i>Click Map to Place Roof Pin *</label>
            <div id="orderMap" class="w-full h-80 rounded-xl border-2 border-gray-300 overflow-hidden" style="min-height: 320px;"></div>
            <p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Click directly on the roof. You can drag the pin to adjust. Use satellite view for best accuracy.</p>
          </div>

          <!-- Coordinate Display + Resolved Address -->
          <div id="coordDisplay" class="hidden bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"></div>
          <div id="resolvedAddress" class="hidden bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5"></div>

          <!-- Latitude / Longitude Inputs -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-arrows-alt-v mr-1 text-brand-500"></i>Latitude *</label>
              <input type="number" step="any" id="orderLat" placeholder="e.g. 53.5461"
                value="${orderState.lat}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                oninput="handleManualCoordInput()">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-arrows-alt-h mr-1 text-brand-500"></i>Longitude *</label>
              <input type="number" step="any" id="orderLng" placeholder="e.g. -113.4938"
                value="${orderState.lng}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                oninput="handleManualCoordInput()">
            </div>
          </div>
          <p class="text-xs text-gray-400 -mt-3"><i class="fas fa-keyboard mr-1"></i>You can also paste coordinates directly. Press Enter or click "Go to Coords" to update the map.</p>
          <button onclick="goToManualCoords()" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors -mt-2">
            <i class="fas fa-location-arrow mr-1"></i>Go to Coords
          </button>

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

  // Re-init map after render
  setTimeout(initMap, 100);
}

// Handle manual coordinate entry
function handleManualCoordInput() {
  const latEl = document.getElementById('orderLat');
  const lngEl = document.getElementById('orderLng');
  if (latEl) orderState.lat = parseFloat(latEl.value) || '';
  if (lngEl) orderState.lng = parseFloat(lngEl.value) || '';
}

function goToManualCoords() {
  const lat = parseFloat(orderState.lat);
  const lng = parseFloat(orderState.lng);
  if (isNaN(lat) || isNaN(lng)) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Enter valid Latitude and Longitude values.');
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Latitude must be -90 to 90, Longitude must be -180 to 180.');
    return;
  }
  placeMarker(lat, lng);
}

function selectTier(tier) {
  orderState.selectedTier = tier;
  // Don't re-render the whole page (destroys map), just update the tier visuals
  document.querySelectorAll('[onclick^="selectTier"]').forEach(btn => {
    const id = btn.getAttribute('onclick').match(/'(\w+)'/)?.[1];
    if (id === tier) {
      btn.className = btn.className.replace('border-gray-200 hover:border-gray-300', 'border-brand-500 bg-brand-50 ring-1 ring-brand-200');
    } else {
      btn.className = btn.className.replace('border-brand-500 bg-brand-50 ring-1 ring-brand-200', 'border-gray-200 hover:border-gray-300');
    }
  });
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
  const lat = parseFloat(orderState.lat);
  const lng = parseFloat(orderState.lng);
  if (isNaN(lat) || isNaN(lng)) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Please place a pin on the map or enter Latitude and Longitude coordinates.');
    return false;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.');
    return false;
  }
  return true;
}

async function useCredit() {
  if (!validate()) return;
  const btn = document.getElementById('creditBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating Report...'; }

  try {
    const res = await fetch('/api/stripe/use-credit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        property_address: orderState.address || `${orderState.lat}, ${orderState.lng}`,
        property_city: orderState.city || '',
        property_province: orderState.province || '',
        property_postal_code: orderState.postalCode || '',
        service_tier: orderState.selectedTier,
        latitude: parseFloat(orderState.lat),
        longitude: parseFloat(orderState.lng),
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
        property_address: orderState.address || `${orderState.lat}, ${orderState.lng}`,
        property_city: orderState.city || '',
        property_province: orderState.province || '',
        property_postal_code: orderState.postalCode || '',
        service_tier: orderState.selectedTier,
        latitude: parseFloat(orderState.lat),
        longitude: parseFloat(orderState.lng),
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
