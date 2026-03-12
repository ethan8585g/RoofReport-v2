// ============================================================
// Customer Order Page — Roof Pin + Trace + Pricing
// 3-Step flow: Pin Roof → Trace Outline → Review & Pay
// ============================================================

const orderState = {
  step: 'pin', // 'pin' | 'trace' | 'review'
  billing: null,
  packages: [],
  selectedTier: 'standard',
  lat: '',
  lng: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  mapReady: false,
  loading: true,
  ordering: false,
  marker: null,
  map: null,
  pinPlaced: false,
  // Tracing state
  traceMap: null,
  traceMode: 'eaves',
  traceEavesPoints: [],
  traceRidgeLines: [],
  traceHipLines: [],
  traceValleyLines: [],
  traceCurrentLine: [],
  tracePolylines: [],
  traceEavesPolygon: null,
  traceMarkers: [],
  // Pricing
  pricePerBundle: null,
  roofTraceJson: null,
  // Measurement engine results (calculated before order submission)
  measurementResult: null,
  measurementLoading: false,
  measurementError: null,
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
      fetch('/api/square/billing', { headers: authHeaders() }),
      fetch('/api/square/packages')
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

// ============================================================
// MAP INITIALIZATION — STEP 1: PIN
// ============================================================
let _mapInitAttempts = 0;
let _placesInitialized = false;

function initMap() {
  if (typeof google === 'undefined' || !google.maps) {
    _mapInitAttempts++;
    if (_mapInitAttempts < 100) { // Up to ~30s of retries
      setTimeout(initMap, 300);
    } else {
      console.error('[Maps] Google Maps API failed to load after 30s');
      const mapEl = document.getElementById('orderMap');
      if (mapEl) mapEl.innerHTML = '<div class="flex items-center justify-center h-full bg-red-50 rounded-xl"><p class="text-red-600 text-sm"><i class="fas fa-exclamation-triangle mr-2"></i>Map failed to load. Please refresh the page.</p></div>';
    }
    return;
  }
  const mapEl = document.getElementById('orderMap');
  if (!mapEl) return;

  // Prevent reinitializing if map already exists and element is the same
  if (orderState.map && orderState.mapReady) {
    // Just restore marker if needed
    if (orderState.pinPlaced && orderState.lat && orderState.lng) {
      placeMarker(parseFloat(orderState.lat), parseFloat(orderState.lng));
    }
    return;
  }

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
  });

  orderState.map.addListener('click', (e) => {
    placeMarker(e.latLng.lat(), e.latLng.lng());
  });

  // Initialize Places autocomplete with retry
  initPlacesAutocomplete();

  // Restore marker if returning
  if (orderState.pinPlaced && orderState.lat && orderState.lng) {
    placeMarker(parseFloat(orderState.lat), parseFloat(orderState.lng));
  }

  orderState.mapReady = true;
  _mapInitAttempts = 0;
  console.log('[Maps] Map initialized successfully');
}

// Separate Places init with its own retry — Places library may load after google.maps
let _placesRetries = 0;
function initPlacesAutocomplete() {
  const searchInput = document.getElementById('mapSearchInput');
  if (!searchInput || _placesInitialized) return;

  if (!google.maps.places) {
    _placesRetries++;
    if (_placesRetries < 30) { // Up to ~9s of retries for Places
      setTimeout(initPlacesAutocomplete, 300);
    } else {
      console.error('[Maps] Places library failed to load');
    }
    return;
  }

  try {
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      componentRestrictions: { country: 'ca' },
      fields: ['geometry', 'formatted_address', 'address_components']
    });
    if (orderState.map) autocomplete.bindTo('bounds', orderState.map);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        if (orderState.map) {
          orderState.map.setCenter({ lat, lng });
          orderState.map.setZoom(19);
        }
        placeMarker(lat, lng);
        if (place.address_components) {
          parseAddressComponents(place.address_components, place.formatted_address);
        }
      }
    });
    _placesInitialized = true;
    _placesRetries = 0;
    console.log('[Maps] Places autocomplete initialized');
  } catch (e) {
    console.error('[Maps] Places autocomplete error:', e);
  }
}

function placeMarker(lat, lng) {
  lat = Math.round(lat * 10000000) / 10000000;
  lng = Math.round(lng * 10000000) / 10000000;
  orderState.lat = lat;
  orderState.lng = lng;
  orderState.pinPlaced = true;

  const latInput = document.getElementById('orderLat');
  const lngInput = document.getElementById('orderLng');
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;

  if (orderState.marker) orderState.marker.setMap(null);
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

  orderState.marker.addListener('dragend', (e) => {
    placeMarker(e.latLng.lat(), e.latLng.lng());
  });

  orderState.map.panTo({ lat, lng });
  if (orderState.map.getZoom() < 17) orderState.map.setZoom(18);
  reverseGeocode(lat, lng);
  updateCoordDisplay(lat, lng);

  // Enable next button
  const nextBtn = document.getElementById('pinNextBtn');
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.className = 'flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all shadow-lg text-base';
  }

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
      </div>`;
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
        addrDisplay.innerHTML = `<i class="fas fa-map-marker-alt text-brand-500 mr-1"></i><span class="text-sm text-gray-700 font-medium">${orderState.address}</span>`;
      }
    }
  } catch (e) {
    orderState.address = `${lat}, ${lng}`;
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

function handleManualCoordInput() {
  const latEl = document.getElementById('orderLat');
  const lngEl = document.getElementById('orderLng');
  if (latEl) orderState.lat = parseFloat(latEl.value) || '';
  if (lngEl) orderState.lng = parseFloat(lngEl.value) || '';
}

function goToManualCoords() {
  const lat = parseFloat(orderState.lat);
  const lng = parseFloat(orderState.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Enter valid coordinates.');
    return;
  }
  placeMarker(lat, lng);
}

// ============================================================
// RENDER — Routes to current step
// ============================================================
function renderOrderPage() {
  const root = document.getElementById('order-root');
  if (!root) return;

  if (orderState.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-12"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div><span class="ml-3 text-gray-500">Loading...</span></div>';
    return;
  }

  // Step progress bar
  const steps = [
    { id: 'pin', label: 'Pin Roof', icon: 'fa-crosshairs' },
    { id: 'trace', label: 'Trace Outline', icon: 'fa-draw-polygon' },
    { id: 'review', label: 'Review & Pay', icon: 'fa-credit-card' },
  ];
  const stepIdx = steps.findIndex(s => s.id === orderState.step);

  const progressBar = `
    <div class="flex items-center justify-center gap-2 mb-6">
      ${steps.map((s, i) => {
        const done = i < stepIdx;
        const active = i === stepIdx;
        const cls = done ? 'bg-brand-100 text-brand-700' : active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400';
        return `
          <div class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}">
            <i class="fas ${done ? 'fa-check-circle' : s.icon}"></i> ${s.label}
          </div>
          ${i < steps.length - 1 ? '<i class="fas fa-arrow-right text-gray-300 text-xs"></i>' : ''}
        `;
      }).join('')}
    </div>
  `;

  if (orderState.step === 'pin') {
    renderPinStep(root, progressBar);
  } else if (orderState.step === 'trace') {
    renderTraceStep(root, progressBar);
  } else if (orderState.step === 'review') {
    renderReviewStep(root, progressBar);
  }
}

// ============================================================
// STEP 1: PIN THE ROOF
// ============================================================
function renderPinStep(root, progressBar) {
  const b = orderState.billing || {};
  const freeTrialRemaining = b.free_trial_remaining || 0;
  const paidCredits = b.paid_credits_remaining || 0;
  const isTrialAvailable = freeTrialRemaining > 0;
  const credits = b.credits_remaining || 0;

  root.innerHTML = `
    <div class="max-w-3xl mx-auto">
      ${progressBar}

      <!-- Credits Banner -->
      ${isTrialAvailable ? `
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-gift text-blue-600"></i></div>
              <div>
                <p class="font-semibold text-blue-800"><i class="fas fa-star text-yellow-500 mr-1"></i>Free Trial: ${freeTrialRemaining} reports remaining!</p>
                <p class="text-sm text-blue-600">No credit card needed</p>
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
                <p class="text-sm text-brand-200 mt-0.5">Credit packs start at <strong class="text-amber-400">$5.00/report</strong></p>
              </div>
            </div>
            <a href="/pricing" class="bg-amber-500 hover:bg-amber-400 text-gray-900 px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-lg"><i class="fas fa-tags mr-1.5"></i>Buy Credits</a>
          </div>
        </div>
      `}

      <!-- Order Form -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-6">
          <h2 class="text-xl font-bold"><i class="fas fa-crosshairs mr-2"></i>Step 1: Pin the Roof</h2>
          <p class="text-brand-200 text-sm mt-1">Click the map or search an address to place a pin on the exact roof</p>
        </div>

        <div class="p-6 space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-search mr-1"></i>Search Address</label>
            <input type="text" id="mapSearchInput" placeholder="Search an address..."
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm">
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-map mr-1"></i>Click Map to Place Roof Pin *</label>
            <div id="orderMap" class="w-full h-80 rounded-xl border-2 border-gray-300 overflow-hidden" style="min-height: 320px;"></div>
            <p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Click directly on the roof. Drag the pin to adjust.</p>
          </div>

          <div id="coordDisplay" class="hidden bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"></div>
          <div id="resolvedAddress" class="hidden bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5"></div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-arrows-alt-v mr-1 text-brand-500"></i>Latitude *</label>
              <input type="number" step="any" id="orderLat" placeholder="e.g. 53.5461" value="${orderState.lat}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                oninput="handleManualCoordInput()">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-arrows-alt-h mr-1 text-brand-500"></i>Longitude *</label>
              <input type="number" step="any" id="orderLng" placeholder="e.g. -113.4938" value="${orderState.lng}"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                oninput="handleManualCoordInput()">
            </div>
          </div>
          <button onclick="goToManualCoords()" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors -mt-2">
            <i class="fas fa-location-arrow mr-1"></i>Go to Coords
          </button>

          <div id="orderMsg" class="hidden p-4 rounded-xl text-sm"></div>

          <button onclick="goToTrace()" id="pinNextBtn"
            class="w-full py-3 ${orderState.pinPlaced ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'} font-bold rounded-xl transition-all shadow-lg text-base"
            ${!orderState.pinPlaced ? 'disabled' : ''}>
            <i class="fas fa-arrow-right mr-2"></i>Next: Trace Roof Outline
          </button>
        </div>
      </div>
    </div>
  `;

  // Re-init map — if map already created, reuse; otherwise init fresh
  if (orderState.map && orderState.mapReady) {
    // Map was already created — need to re-attach to new DOM element
    const mapEl = document.getElementById('orderMap');
    if (mapEl && mapEl.children.length === 0) {
      // DOM was re-rendered, need fresh map instance
      orderState.map = null;
      orderState.mapReady = false;
      _placesInitialized = false;
    }
  }
  setTimeout(initMap, 100);
}

// ============================================================
// STEP 2: TRACE THE ROOF
// ============================================================
function renderTraceStep(root, progressBar) {
  const modeInfo = {
    eaves:  { color: '#22c55e', icon: 'fa-draw-polygon', label: 'Eaves Outline', desc: 'Click around the full eave perimeter. Click first point to close.' },
    ridge:  { color: '#3b82f6', icon: 'fa-grip-lines', label: 'Ridges', desc: 'Click start and end of each ridge line.' },
    hip:    { color: '#f59e0b', icon: 'fa-slash', label: 'Hips', desc: 'Click start and end of each hip line.' },
    valley: { color: '#ef4444', icon: 'fa-angle-down', label: 'Valleys', desc: 'Click start and end of each valley.' }
  };
  const m = modeInfo[orderState.traceMode] || modeInfo.eaves;
  const eavesCount = orderState.traceEavesPoints.length;
  const ridgeCount = orderState.traceRidgeLines.length;
  const hipCount = orderState.traceHipLines.length;
  const valleyCount = orderState.traceValleyLines.length;
  const eavesClosed = eavesCount >= 3 && orderState.traceEavesPolygon;

  root.innerHTML = `
    <div class="max-w-5xl mx-auto">
      ${progressBar}

      <!-- Address bar -->
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-2 mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-map-marker-alt text-brand-600 text-sm"></i>
          <span class="text-sm font-medium text-gray-800">${orderState.address || orderState.lat + ', ' + orderState.lng}</span>
        </div>
        <button onclick="backToPin()" class="text-xs text-brand-600 hover:text-brand-700 font-medium"><i class="fas fa-edit mr-1"></i>Change</button>
      </div>

      <div class="grid lg:grid-cols-4 gap-4">
        <!-- Left: Mode selector -->
        <div class="lg:col-span-1 space-y-3">
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Drawing Mode</h4>
            <div class="space-y-2">
              ${Object.entries(modeInfo).map(([key, info]) => `
                <button onclick="setTraceMode('${key}')"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${orderState.traceMode === key ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}">
                  <div class="w-3 h-3 rounded-full" style="background:${info.color}"></div>
                  <i class="fas ${info.icon} text-xs"></i>
                  <span>${info.label}</span>
                  <span class="ml-auto text-xs opacity-70">
                    ${key === 'eaves' ? eavesCount + ' pts' : key === 'ridge' ? ridgeCount : key === 'hip' ? hipCount : valleyCount}
                  </span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Summary</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Eaves</span><span class="font-semibold ${eavesClosed ? 'text-green-600' : 'text-gray-400'}">${eavesClosed ? 'Closed' : eavesCount + ' pts'}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Ridges</span><span class="font-semibold">${ridgeCount}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Hips</span><span class="font-semibold">${hipCount}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Valleys</span><span class="font-semibold">${valleyCount}</span></div>
            </div>
          </div>

          <div class="space-y-2">
            <button onclick="undoLastTrace()" class="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium"><i class="fas fa-undo mr-1"></i>Undo</button>
            <button onclick="clearAllTraces()" class="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium"><i class="fas fa-trash mr-1"></i>Clear All</button>
          </div>
        </div>

        <!-- Right: Trace Map -->
        <div class="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full" style="background:${m.color}"></div>
              <span class="text-xs font-medium text-gray-300 uppercase">${m.label} Mode</span>
            </div>
            <span class="text-xs text-gray-400">${m.desc}</span>
          </div>
          <div id="traceMap" style="height: 480px; cursor: crosshair; background: #1a1a2e;"></div>
        </div>
      </div>

      <!-- Bottom nav -->
      <div class="mt-4 flex items-center justify-between">
        <div class="flex items-center gap-4 text-xs text-gray-500">
          <span><i class="fas fa-mouse-pointer mr-1"></i>Click = Add point</span>
          <span><i class="fas fa-draw-polygon mr-1" style="color:#22c55e"></i>Click 1st point to close eaves</span>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="skipTrace()" class="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium">
            Skip Tracing <i class="fas fa-forward ml-1"></i>
          </button>
          <button onclick="confirmTrace()" id="traceNextBtn"
            class="px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2
              ${eavesClosed ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
            ${!eavesClosed ? 'disabled' : ''}>
            <i class="fas fa-check-circle"></i>
            Confirm Trace & Continue
            <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  setTimeout(initTraceMap, 100);
}

// ============================================================
// STEP 3: REVIEW + PRICING + PAY
// ============================================================
function renderReviewStep(root, progressBar) {
  const b = orderState.billing || {};
  const freeTrialRemaining = b.free_trial_remaining || 0;
  const paidCredits = b.paid_credits_remaining || 0;
  const isTrialAvailable = freeTrialRemaining > 0;
  const credits = b.credits_remaining || 0;
  const hasTrace = orderState.roofTraceJson !== null;
  const mLoading = orderState.measurementLoading;
  const mResult = orderState.measurementResult;
  const mError = orderState.measurementError;
  const m = mResult?.measurements || {};
  const edges = mResult?.edges || {};
  const mats = mResult?.materials || {};
  const notes = mResult?.advisory_notes || [];
  const canSubmit = !mLoading && (mResult || !hasTrace); // Block Send while engine is running

  // Compute price estimate if user entered price_per_bundle and we have gross squares
  const grossSquares = m.gross_squares || 0;
  const pricePerSq = orderState.pricePerBundle;
  const priceEstimate = pricePerSq && grossSquares ? (grossSquares * pricePerSq) : null;

  root.innerHTML = `
    <div class="max-w-3xl mx-auto">
      ${progressBar}

      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-6">
          <h2 class="text-xl font-bold"><i class="fas fa-clipboard-check mr-2"></i>Step 3: Review & Pay</h2>
          <p class="text-brand-200 text-sm mt-1">Confirm details, review your roof measurements, and order your report</p>
        </div>

        <div class="p-6 space-y-5">
          <!-- Location summary -->
          <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-map-marker-alt text-red-500 mr-1"></i>Property</h4>
            <p class="text-sm text-gray-800 font-medium">${orderState.address || orderState.lat + ', ' + orderState.lng}</p>
            <p class="text-xs text-gray-500 mt-1">Pin: ${orderState.lat}, ${orderState.lng}</p>
          </div>

          ${hasTrace ? `
          <!-- ═══════════════════════════════════════════════════ -->
          <!-- ROOF MEASUREMENT RESULTS — The core of the engine -->
          <!-- ═══════════════════════════════════════════════════ -->
          ${mLoading ? `
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6">
            <div class="flex items-center justify-center gap-3">
              <div class="animate-spin rounded-full h-8 w-8 border-t-3 border-b-3 border-blue-600"></div>
              <div>
                <h4 class="font-bold text-blue-800">Calculating Roof Measurements...</h4>
                <p class="text-sm text-blue-600 mt-0.5">Running measurement engine on ${orderState.roofTraceJson?.eaves?.length || 0} eave points, ${orderState.roofTraceJson?.ridges?.length || 0} ridges, ${orderState.roofTraceJson?.hips?.length || 0} hips, ${orderState.roofTraceJson?.valleys?.length || 0} valleys</p>
              </div>
            </div>
            <div class="mt-4 w-full bg-blue-200 rounded-full h-1.5">
              <div class="h-1.5 rounded-full bg-blue-600 animate-pulse" style="width: 60%"></div>
            </div>
          </div>
          ` : mError ? `
          <div class="bg-red-50 rounded-xl border border-red-200 p-5">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-exclamation-triangle text-red-500"></i>
              <h4 class="font-bold text-red-700">Measurement Error</h4>
            </div>
            <p class="text-sm text-red-600">${mError}</p>
            <button onclick="retryMeasurement()" class="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold">
              <i class="fas fa-redo mr-1"></i>Retry Measurement
            </button>
          </div>
          ` : mResult ? `
          <!-- Measurement Results Panel -->
          <div class="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 rounded-xl border-2 border-green-300 shadow-sm overflow-hidden">
            <div class="bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i class="fas fa-ruler-combined text-white text-lg"></i>
                <h4 class="font-bold text-white text-sm">Roof Measurements — Calculated from Your Trace</h4>
              </div>
              <span class="bg-white/20 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">${mResult.engine_version || 'v2.0'}</span>
            </div>

            <div class="p-5 space-y-4">
              <!-- Big numbers: Footprint + True Area -->
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-xl p-4 border border-green-200 text-center shadow-sm">
                  <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Projected Footprint</div>
                  <div class="text-3xl font-black text-gray-900">${Math.round(m.projected_footprint_sqft || 0).toLocaleString()}</div>
                  <div class="text-sm text-gray-500 font-medium">sq ft</div>
                </div>
                <div class="bg-white rounded-xl p-4 border border-green-200 text-center shadow-sm">
                  <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">True Area (Sloped)</div>
                  <div class="text-3xl font-black text-emerald-700">${Math.round(m.true_area_sqft || 0).toLocaleString()}</div>
                  <div class="text-sm text-gray-500 font-medium">sq ft</div>
                </div>
              </div>

              <!-- Squares + Pitch + Waste -->
              <div class="grid grid-cols-4 gap-3">
                <div class="bg-white rounded-lg p-3 border border-gray-200 text-center">
                  <div class="text-xs text-gray-500 font-medium">Net Squares</div>
                  <div class="text-xl font-bold text-gray-800">${(m.net_squares || 0).toFixed(1)}</div>
                </div>
                <div class="bg-white rounded-lg p-3 border border-gray-200 text-center">
                  <div class="text-xs text-gray-500 font-medium">Gross (w/ waste)</div>
                  <div class="text-xl font-bold text-amber-600">${(m.gross_squares || 0).toFixed(1)}</div>
                </div>
                <div class="bg-white rounded-lg p-3 border border-gray-200 text-center">
                  <div class="text-xs text-gray-500 font-medium">Pitch</div>
                  <div class="text-xl font-bold text-blue-600">${m.dominant_pitch || '?'}</div>
                </div>
                <div class="bg-white rounded-lg p-3 border border-gray-200 text-center">
                  <div class="text-xs text-gray-500 font-medium">Waste</div>
                  <div class="text-xl font-bold text-orange-500">${m.waste_pct || 15}%</div>
                </div>
              </div>

              <!-- Edge Lengths -->
              <div>
                <h5 class="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2"><i class="fas fa-ruler mr-1"></i>Linear Edge Measurements</h5>
                <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <div class="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
                    <div class="w-5 h-0.5 bg-green-500 rounded mx-auto mb-1"></div>
                    <div class="text-xs text-gray-500">Eaves</div>
                    <div class="font-bold text-sm text-gray-800">${Math.round(edges.eaves_ft || 0)} ft</div>
                  </div>
                  <div class="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
                    <div class="w-5 h-0.5 bg-blue-500 rounded mx-auto mb-1"></div>
                    <div class="text-xs text-gray-500">Ridges</div>
                    <div class="font-bold text-sm text-gray-800">${Math.round(edges.ridges_ft || 0)} ft</div>
                  </div>
                  <div class="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
                    <div class="w-5 h-0.5 bg-amber-500 rounded mx-auto mb-1"></div>
                    <div class="text-xs text-gray-500">Hips</div>
                    <div class="font-bold text-sm text-gray-800">${Math.round(edges.hips_ft || 0)} ft</div>
                  </div>
                  <div class="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
                    <div class="w-5 h-0.5 bg-red-500 rounded mx-auto mb-1"></div>
                    <div class="text-xs text-gray-500">Valleys</div>
                    <div class="font-bold text-sm text-gray-800">${Math.round(edges.valleys_ft || 0)} ft</div>
                  </div>
                  <div class="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
                    <div class="w-5 h-0.5 bg-purple-500 rounded mx-auto mb-1"></div>
                    <div class="text-xs text-gray-500">Rakes</div>
                    <div class="font-bold text-sm text-gray-800">${Math.round(edges.rakes_ft || 0)} ft</div>
                  </div>
                </div>
              </div>

              <!-- Individual Eave Edges -->
              ${(mResult.eave_edges && mResult.eave_edges.length > 0) ? `
              <div>
                <h5 class="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2"><i class="fas fa-draw-polygon mr-1"></i>Eave Edge Breakdown</h5>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  ${mResult.eave_edges.map((e, i) => `
                    <div class="bg-white rounded-lg p-2 border border-gray-100 flex items-center justify-between text-sm">
                      <span class="text-gray-500">Edge ${i + 1}</span>
                      <span class="font-bold text-gray-800">${(e.length_2d_ft || e.length_ft || 0).toFixed(1)} ft</span>
                    </div>
                  `).join('')}
                </div>
              </div>
              ` : ''}

              <!-- Material Estimates -->
              <div class="bg-amber-50 rounded-lg border border-amber-200 p-4">
                <h5 class="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2"><i class="fas fa-box-open mr-1"></i>Material Estimate</h5>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  <div class="flex justify-between"><span class="text-gray-600">Shingle Bundles</span><span class="font-bold">${mats.shingles_bundles || 0}</span></div>
                  <div class="flex justify-between"><span class="text-gray-600">Underlayment Rolls</span><span class="font-bold">${mats.underlayment_rolls || 0}</span></div>
                  <div class="flex justify-between"><span class="text-gray-600">Ridge Cap</span><span class="font-bold">${Math.round(mats.ridge_cap_lf || 0)} lf</span></div>
                  <div class="flex justify-between"><span class="text-gray-600">Starter Strip</span><span class="font-bold">${Math.round(mats.starter_strip_lf || 0)} lf</span></div>
                  <div class="flex justify-between"><span class="text-gray-600">Drip Edge</span><span class="font-bold">${Math.round(mats.drip_edge_total_lf || 0)} lf</span></div>
                  <div class="flex justify-between"><span class="text-gray-600">Valley Flashing</span><span class="font-bold">${Math.round(mats.valley_flashing_lf || 0)} lf</span></div>
                </div>
              </div>

              <!-- Advisory Notes -->
              ${notes.length > 0 ? `
              <div class="bg-blue-50 rounded-lg border border-blue-200 p-3">
                <h5 class="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1"><i class="fas fa-lightbulb mr-1"></i>Advisory Notes</h5>
                <ul class="text-xs text-blue-800 space-y-1">
                  ${notes.map(n => `<li><i class="fas fa-info-circle text-blue-400 mr-1"></i>${n}</li>`).join('')}
                </ul>
              </div>
              ` : ''}

              <!-- Traced geometry summary -->
              <div class="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-green-200">
                <span><i class="fas fa-draw-polygon text-green-500 mr-1"></i>${m.num_eave_points || 0} eave points</span>
                <span><i class="fas fa-grip-lines text-blue-500 mr-1"></i>${m.num_ridges || 0} ridges</span>
                <span><i class="fas fa-slash text-amber-500 mr-1"></i>${m.num_hips || 0} hips</span>
                <span><i class="fas fa-angle-down text-red-500 mr-1"></i>${m.num_valleys || 0} valleys</span>
                <span class="ml-auto text-green-600 font-medium"><i class="fas fa-check-circle mr-0.5"></i>Calculated in ${mResult.calculation_ms || '?'}ms</span>
              </div>
            </div>
          </div>
          ` : ''}
          ` : `
          <div class="bg-gray-50 rounded-xl border border-gray-200 p-3">
            <p class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i>No trace — standard satellite analysis will be used</p>
          </div>
          `}

          <!-- Price per bundle input + live estimate -->
          <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
            <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
              <i class="fas fa-dollar-sign text-amber-500 mr-2"></i>Your Price Per Square (Optional)
            </h4>
            <p class="text-xs text-gray-500 mb-3">Enter your rate per roofing square to include a cost estimate in your report. The report calculates total squares with ${m.waste_pct || 15}% waste.</p>
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Price Per Square (CAD)</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input type="number" step="0.01" min="0" max="9999" id="pricePerBundleInput"
                    value="${orderState.pricePerBundle || ''}"
                    oninput="orderState.pricePerBundle = parseFloat(this.value) || null; updatePriceEstimate();"
                    class="w-full pl-8 pr-4 py-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
                    placeholder="e.g. 350" />
                </div>
                <p class="text-xs text-gray-400 mt-1">Cost per roofing square (100 sq ft)</p>
              </div>
              <div class="flex items-center justify-center">
                <div class="text-center p-3 bg-white rounded-lg border border-amber-200 w-full" id="priceEstimateBox">
                  <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Estimated Job Cost</p>
                  <p class="text-2xl font-black mt-1 ${priceEstimate ? 'text-amber-600' : 'text-gray-300'}" id="priceEstimateValue">${priceEstimate ? '$' + priceEstimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}</p>
                  <p class="text-xs text-gray-400 mt-1">${grossSquares ? grossSquares.toFixed(1) + ' gross sq' + (pricePerSq ? ' x $' + pricePerSq : '') : 'Roof area + waste x your rate'}</p>
                </div>
              </div>
            </div>
          </div>

          <div id="orderMsg" class="hidden p-4 rounded-xl text-sm"></div>

          <!-- Action Buttons -->
          <div class="flex gap-3">
            <button onclick="backToTrace()" class="py-3 px-5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all text-sm">
              <i class="fas fa-arrow-left mr-1"></i>Back
            </button>
            ${!canSubmit ? `
              <button disabled class="flex-1 py-3 bg-gray-300 text-gray-500 font-bold rounded-xl cursor-not-allowed text-base">
                <i class="fas fa-spinner fa-spin mr-2"></i>Measuring Roof...
              </button>
            ` : isTrialAvailable ? `
              <button onclick="useCredit()" id="creditBtn" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg text-base">
                <i class="fas fa-gift mr-2"></i>Use Free Trial (${freeTrialRemaining} left)
              </button>
            ` : paidCredits > 0 ? `
              <button onclick="useCredit()" id="creditBtn" class="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-lg text-base">
                <i class="fas fa-coins mr-2"></i>Use Credit (${paidCredits} left)
              </button>
            ` : `
              <button onclick="payWithSquare()" id="squareBtn" class="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all shadow-lg text-base">
                <i class="fas fa-credit-card mr-2"></i>Pay $10 with Square
              </button>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TRACE MAP — Drawing logic
// ============================================================
function initTraceMap() {
  const mapDiv = document.getElementById('traceMap');
  if (!mapDiv || typeof google === 'undefined' || !google.maps) return;

  const center = { lat: parseFloat(orderState.lat), lng: parseFloat(orderState.lng) };

  orderState.traceMap = new google.maps.Map(mapDiv, {
    center,
    zoom: 20,
    mapTypeId: 'satellite',
    tilt: 0,
    fullscreenControl: true,
    streetViewControl: false,
    zoomControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      mapTypeIds: ['satellite', 'hybrid']
    }
  });

  // Pin marker
  new google.maps.Marker({
    position: center,
    map: orderState.traceMap,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="4" fill="%23ef4444" stroke="white" stroke-width="2"/></svg>'
      ),
      scaledSize: new google.maps.Size(20, 20),
      anchor: new google.maps.Point(10, 10),
    }
  });

  restoreTraceOverlays();

  orderState.traceMap.addListener('click', (e) => {
    handleTraceClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  });

  orderState.traceMap.addListener('dblclick', (e) => {
    e.stop();
    finishCurrentLine();
  });
}

function handleTraceClick(pt) {
  const mode = orderState.traceMode;
  if (mode === 'eaves') {
    if (orderState.traceEavesPoints.length >= 3) {
      const first = orderState.traceEavesPoints[0];
      if (getDistanceM(pt, first) < 3) {
        closeEavesPolygon();
        return;
      }
    }
    orderState.traceEavesPoints.push(pt);
    addTraceMarker(pt, '#22c55e', orderState.traceEavesPoints.length);
    if (orderState.traceEavesPoints.length > 1) {
      drawPolyline(orderState.traceEavesPoints, '#22c55e', 3, false);
    }
  } else {
    orderState.traceCurrentLine.push(pt);
    const colors = { ridge: '#3b82f6', hip: '#f59e0b', valley: '#ef4444' };
    addTraceMarker(pt, colors[mode], null);
    if (orderState.traceCurrentLine.length === 2) {
      finishCurrentLine();
    }
  }
  updateTraceUI();
}

function closeEavesPolygon() {
  if (orderState.traceEavesPoints.length < 3) return;
  clearTraceOverlays();

  orderState.traceEavesPolygon = new google.maps.Polygon({
    paths: orderState.traceEavesPoints.map(p => new google.maps.LatLng(p.lat, p.lng)),
    map: orderState.traceMap,
    strokeColor: '#22c55e',
    strokeWeight: 3,
    strokeOpacity: 0.9,
    fillColor: '#22c55e',
    fillOpacity: 0.15,
    editable: true,
    draggable: false
  });

  const path = orderState.traceEavesPolygon.getPath();
  google.maps.event.addListener(path, 'set_at', () => updateEavesFromPolygon());
  google.maps.event.addListener(path, 'insert_at', () => updateEavesFromPolygon());

  orderState.traceEavesPoints.forEach((p, i) => addTraceMarker(p, '#22c55e', i + 1));
  restoreLineOverlays();

  showMsg('success', '<i class="fas fa-check-circle mr-1"></i>Eaves outline closed! Now add ridges and hips.');
  orderState.traceMode = 'ridge';
  updateTraceUI();
}

function updateEavesFromPolygon() {
  if (!orderState.traceEavesPolygon) return;
  const path = orderState.traceEavesPolygon.getPath();
  orderState.traceEavesPoints = [];
  for (let i = 0; i < path.getLength(); i++) {
    const pt = path.getAt(i);
    orderState.traceEavesPoints.push({ lat: pt.lat(), lng: pt.lng() });
  }
}

function finishCurrentLine() {
  if (orderState.traceCurrentLine.length < 2) {
    orderState.traceCurrentLine = [];
    return;
  }
  const line = [...orderState.traceCurrentLine];
  const mode = orderState.traceMode;
  const colors = { ridge: '#3b82f6', hip: '#f59e0b', valley: '#ef4444' };
  if (mode === 'ridge') orderState.traceRidgeLines.push(line);
  else if (mode === 'hip') orderState.traceHipLines.push(line);
  else if (mode === 'valley') orderState.traceValleyLines.push(line);
  drawPolyline(line, colors[mode], 2.5, false);
  orderState.traceCurrentLine = [];
  updateTraceUI();
}

function addTraceMarker(pt, color, label) {
  const marker = new google.maps.Marker({
    position: { lat: pt.lat, lng: pt.lng },
    map: orderState.traceMap,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="16" height="16">
          <circle cx="10" cy="10" r="8" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
          ${label ? `<text x="10" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">${label}</text>` : ''}
        </svg>`
      ),
      scaledSize: new google.maps.Size(16, 16),
      anchor: new google.maps.Point(8, 8),
    }
  });
  orderState.traceMarkers.push(marker);
}

function drawPolyline(points, color, weight, dashed) {
  const polyline = new google.maps.Polyline({
    path: points.map(p => new google.maps.LatLng(p.lat, p.lng)),
    map: orderState.traceMap,
    strokeColor: color,
    strokeWeight: weight,
    strokeOpacity: dashed ? 0.6 : 0.9,
  });
  orderState.tracePolylines.push(polyline);
}

function clearTraceOverlays() {
  orderState.traceMarkers.forEach(m => m.setMap(null));
  orderState.traceMarkers = [];
  orderState.tracePolylines.forEach(p => p.setMap(null));
  orderState.tracePolylines = [];
  if (orderState.traceEavesPolygon) {
    orderState.traceEavesPolygon.setMap(null);
    orderState.traceEavesPolygon = null;
  }
}

function restoreTraceOverlays() {
  if (orderState.traceEavesPoints.length >= 3 && !orderState.traceEavesPolygon) {
    closeEavesPolygon();
  } else if (orderState.traceEavesPoints.length > 0) {
    orderState.traceEavesPoints.forEach((p, i) => addTraceMarker(p, '#22c55e', i + 1));
    if (orderState.traceEavesPoints.length > 1) drawPolyline(orderState.traceEavesPoints, '#22c55e', 3, false);
  }
  restoreLineOverlays();
}

function restoreLineOverlays() {
  orderState.traceRidgeLines.forEach(l => drawPolyline(l, '#3b82f6', 2.5, false));
  orderState.traceHipLines.forEach(l => drawPolyline(l, '#f59e0b', 2.5, false));
  orderState.traceValleyLines.forEach(l => drawPolyline(l, '#ef4444', 2.5, false));
}

function setTraceMode(mode) {
  if (orderState.traceCurrentLine.length > 0) finishCurrentLine();
  orderState.traceMode = mode;
  updateTraceUI();
}

function undoLastTrace() {
  const mode = orderState.traceMode;
  if (mode === 'eaves') {
    if (orderState.traceEavesPolygon) { orderState.traceEavesPolygon.setMap(null); orderState.traceEavesPolygon = null; }
    if (orderState.traceEavesPoints.length > 0) orderState.traceEavesPoints.pop();
  } else if (mode === 'ridge' && orderState.traceRidgeLines.length > 0) orderState.traceRidgeLines.pop();
  else if (mode === 'hip' && orderState.traceHipLines.length > 0) orderState.traceHipLines.pop();
  else if (mode === 'valley' && orderState.traceValleyLines.length > 0) orderState.traceValleyLines.pop();
  orderState.traceCurrentLine = [];
  clearTraceOverlays();
  restoreTraceOverlays();
  updateTraceUI();
}

function clearAllTraces() {
  if (!confirm('Clear all traces?')) return;
  orderState.traceEavesPoints = [];
  orderState.traceRidgeLines = [];
  orderState.traceHipLines = [];
  orderState.traceValleyLines = [];
  orderState.traceCurrentLine = [];
  clearTraceOverlays();
  orderState.roofTraceJson = null;
  updateTraceUI();
}

function updateTraceUI() {
  // Re-render the whole trace step (map will re-init)
  renderOrderPage();
}

function getDistanceM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// ============================================================
// NAVIGATION
// ============================================================
function goToTrace() {
  if (!orderState.pinPlaced) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Please place a pin on the map first.');
    return;
  }
  orderState.step = 'trace';
  renderOrderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function skipTrace() {
  orderState.roofTraceJson = null;
  orderState.measurementResult = null;
  orderState.measurementError = null;
  orderState.measurementLoading = false;
  orderState.step = 'review';
  renderOrderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function confirmTrace() {
  const eavesClosed = orderState.traceEavesPoints.length >= 3 && orderState.traceEavesPolygon;
  if (!eavesClosed) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Close the eaves polygon by clicking the first point.');
    return;
  }
  updateEavesFromPolygon();
  orderState.roofTraceJson = {
    eaves: orderState.traceEavesPoints,
    ridges: orderState.traceRidgeLines,
    hips: orderState.traceHipLines,
    valleys: orderState.traceValleyLines,
    traced_at: new Date().toISOString()
  };

  // ── Run the measurement engine BEFORE going to review ──
  orderState.measurementLoading = true;
  orderState.measurementResult = null;
  orderState.measurementError = null;
  orderState.step = 'review';
  renderOrderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const res = await fetch('/api/reports/calculate-from-trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trace: orderState.roofTraceJson,
        address: orderState.address || `${orderState.lat}, ${orderState.lng}`,
        default_pitch: 5.0
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      orderState.measurementResult = data;
      orderState.measurementError = null;
      console.log('[Measurement] Engine completed:', data.measurements.true_area_sqft, 'sqft true area');
    } else {
      orderState.measurementError = data.error || 'Measurement calculation failed';
      console.error('[Measurement] Error:', data.error);
    }
  } catch (e) {
    orderState.measurementError = 'Network error during measurement calculation';
    console.error('[Measurement] Network error:', e);
  }

  orderState.measurementLoading = false;
  renderOrderPage();
}

function backToPin() {
  orderState.step = 'pin';
  renderOrderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToTrace() {
  // Clear measurement results since trace may change
  orderState.measurementResult = null;
  orderState.measurementError = null;
  orderState.measurementLoading = false;
  orderState.step = 'trace';
  renderOrderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// PAYMENT
// ============================================================
function showMsg(type, msg) {
  const el = document.getElementById('orderMsg');
  if (!el) return;
  el.className = type === 'error'
    ? 'p-4 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200'
    : 'p-4 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200';
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function buildOrderPayload() {
  const payload = {
    property_address: orderState.address || `${orderState.lat}, ${orderState.lng}`,
    property_city: orderState.city || '',
    property_province: orderState.province || '',
    property_postal_code: orderState.postalCode || '',
    service_tier: orderState.selectedTier,
    latitude: parseFloat(orderState.lat),
    longitude: parseFloat(orderState.lng),
    roof_trace_json: orderState.roofTraceJson ? JSON.stringify(orderState.roofTraceJson) : null,
    price_per_bundle: orderState.pricePerBundle || null,
  };
  // Attach pre-calculated measurement data so the report engine can use it
  if (orderState.measurementResult) {
    payload.trace_measurement_json = JSON.stringify(orderState.measurementResult.full_report);
  }
  return payload;
}

// Live price estimate update when user types price per square
function updatePriceEstimate() {
  const m = orderState.measurementResult?.measurements || {};
  const grossSquares = m.gross_squares || 0;
  const pricePerSq = orderState.pricePerBundle;
  const valueEl = document.getElementById('priceEstimateValue');
  const boxEl = document.getElementById('priceEstimateBox');
  if (!valueEl) return;
  if (pricePerSq && grossSquares) {
    const estimate = grossSquares * pricePerSq;
    valueEl.textContent = '$' + estimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    valueEl.className = 'text-2xl font-black mt-1 text-amber-600';
    if (boxEl) {
      const subEl = boxEl.querySelector('p:last-child');
      if (subEl) subEl.textContent = grossSquares.toFixed(1) + ' gross sq x $' + pricePerSq;
    }
  } else {
    valueEl.textContent = '--';
    valueEl.className = 'text-2xl font-black mt-1 text-gray-300';
  }
}

// Retry measurement calculation if it failed
async function retryMeasurement() {
  if (!orderState.roofTraceJson) return;
  orderState.measurementLoading = true;
  orderState.measurementError = null;
  renderOrderPage();

  try {
    const res = await fetch('/api/reports/calculate-from-trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trace: orderState.roofTraceJson,
        address: orderState.address || `${orderState.lat}, ${orderState.lng}`,
        default_pitch: 5.0
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      orderState.measurementResult = data;
      orderState.measurementError = null;
    } else {
      orderState.measurementError = data.error || 'Measurement calculation failed';
    }
  } catch (e) {
    orderState.measurementError = 'Network error during measurement calculation';
  }

  orderState.measurementLoading = false;
  renderOrderPage();
}

function selectTier(tier) {
  orderState.selectedTier = tier;
}

async function useCredit() {
  const lat = parseFloat(orderState.lat);
  const lng = parseFloat(orderState.lng);
  if (isNaN(lat) || isNaN(lng)) { showMsg('error', 'No coordinates.'); return; }

  const btn = document.getElementById('creditBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Placing Order...'; }

  try {
    const res = await fetch('/api/square/use-credit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(buildOrderPayload())
    });
    const data = await res.json();
    if (res.ok && data.success) {
      // Order placed! Backend generates report in background via waitUntil.
      // Redirect to dashboard IMMEDIATELY — polling will show the report when ready.
      showOrderSuccessOverlay(data.order);
    } else {
      showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>' + (data.error || 'Failed to use credit'));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins mr-2"></i>Use Credit'; }
    }
  } catch (e) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Network error.');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins mr-2"></i>Use Credit'; }
  }
}

// ============================================================
// SUCCESS OVERLAY — Show animated confirmation then redirect
// User sees a polished success screen for 1.5s, then goes to dashboard
// ============================================================
function showOrderSuccessOverlay(order) {
  const address = order?.property_address || orderState.address || 'your property';
  const orderNum = order?.order_number || '';
  
  // Create full-screen overlay
  const overlay = document.createElement('div');
  overlay.id = 'orderSuccessOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);animation:fadeIn 0.3s ease-out';
  overlay.innerHTML = `
    <div style="background:white;border-radius:24px;padding:48px 40px;max-width:440px;width:90%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.3);animation:scaleIn 0.4s ease-out">
      <div style="width:80px;height:80px;margin:0 auto 20px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:50%;display:flex;align-items:center;justify-content:center;animation:popIn 0.5s ease-out 0.2s both">
        <i class="fas fa-check" style="color:white;font-size:36px"></i>
      </div>
      <h2 style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px">Order Placed!</h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:4px">${orderNum ? '<span style="font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:6px;font-size:12px">' + orderNum + '</span><br>' : ''}
        ${address}</p>
      <div style="margin:20px auto;padding:16px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:16px;border:1px solid #bfdbfe">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <div class="animate-spin" style="width:20px;height:20px;border:3px solid #93c5fd;border-top-color:#2563eb;border-radius:50%"></div>
          <span style="font-size:14px;font-weight:600;color:#1d4ed8">Generating your roof report...</span>
        </div>
        <p style="color:#3b82f6;font-size:12px;margin-top:6px">This takes 20-40 seconds. You'll see it on your dashboard.</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:12px"><i class="fas fa-arrow-right mr-1"></i>Redirecting to dashboard...</p>
    </div>
    <style>
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes scaleIn { from { transform: scale(0.8); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      @keyframes popIn { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
    </style>
  `;
  document.body.appendChild(overlay);

  // Redirect to dashboard after 1.5 seconds
  setTimeout(() => { window.location.href = '/customer/dashboard'; }, 1500);
}

async function payWithSquare() {
  const lat = parseFloat(orderState.lat);
  const lng = parseFloat(orderState.lng);
  if (isNaN(lat) || isNaN(lng)) { showMsg('error', 'No coordinates.'); return; }

  const btn = document.getElementById('squareBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Redirecting to Square...'; }

  try {
    const res = await fetch('/api/square/checkout/report', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(buildOrderPayload())
    });
    const data = await res.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>' + (data.error || 'Checkout failed'));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-credit-card mr-2"></i>Pay with Square'; }
    }
  } catch (e) {
    showMsg('error', '<i class="fas fa-exclamation-triangle mr-1"></i>Network error.');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-credit-card mr-2"></i>Pay with Square'; }
  }
}

async function buyPackage(pkgId) {
  try {
    const res = await fetch('/api/square/checkout', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ package_id: pkgId })
    });
    const data = await res.json();
    if (data.checkout_url) window.location.href = data.checkout_url;
    else alert(data.error || 'Checkout failed');
  } catch (e) {
    alert('Network error.');
  }
}
