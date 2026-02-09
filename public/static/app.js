// ============================================================
// Reuse Canada - Roofing Measurement Tool
// Main Order Form Application
// ============================================================

const API = '';

// State
const state = {
  currentStep: 1,
  totalSteps: 5,
  formData: {
    // Step 1: Service Tier
    service_tier: '',
    price: 0,
    // Step 2: Property
    property_address: '',
    property_city: '',
    property_province: 'Alberta',
    property_postal_code: '',
    latitude: null,
    longitude: null,
    pinPlaced: false,
    // Step 3: Homeowner
    homeowner_name: '',
    homeowner_phone: '',
    homeowner_email: '',
    // Step 4: Requester / Company
    requester_name: '',
    requester_company: '',
    requester_email: '',
    requester_phone: '',
    customer_company_id: null,
    // Step 5: Review
    notes: ''
  },
  customerCompanies: [],
  map: null,
  marker: null,
  geocoder: null,
  dbInitialized: false,
  submitting: false
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Init DB on first load
  try {
    await fetch(API + '/api/admin/init-db', { method: 'POST' });
    state.dbInitialized = true;
  } catch (e) {
    console.warn('DB init:', e);
  }

  // Load customer companies
  try {
    const res = await fetch(API + '/api/companies/customers');
    const data = await res.json();
    state.customerCompanies = data.companies || [];
  } catch (e) {
    console.warn('Could not load companies:', e);
  }

  render();
});

// ============================================================
// RENDER
// ============================================================
function render() {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <!-- Step Progress Bar -->
    <div class="mb-8">
      <div class="flex items-center justify-between max-w-2xl mx-auto">
        ${renderStepIndicators()}
      </div>
    </div>

    <!-- Step Content -->
    <div class="step-panel">
      ${renderCurrentStep()}
    </div>

    <!-- Navigation -->
    <div class="flex justify-between items-center max-w-2xl mx-auto mt-8">
      ${state.currentStep > 1 ? `
        <button onclick="prevStep()" class="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">
          <i class="fas fa-arrow-left mr-2"></i>Back
        </button>
      ` : '<div></div>'}
      ${state.currentStep < state.totalSteps ? `
        <button onclick="nextStep()" id="nextBtn" class="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors shadow-md">
          Next<i class="fas fa-arrow-right ml-2"></i>
        </button>
      ` : `
        <button onclick="submitOrder()" id="submitBtn" class="px-8 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-bold text-lg transition-colors shadow-lg ${state.submitting ? 'opacity-50 cursor-not-allowed' : ''}">
          ${state.submitting ? '<span class="spinner mr-2"></span>Processing...' : '<i class="fas fa-check-circle mr-2"></i>Place Order & Pay'}
        </button>
      `}
    </div>
  `;

  // Initialize map if on step 2
  if (state.currentStep === 2) {
    setTimeout(() => initMap(), 100);
  }
}

// ============================================================
// STEP INDICATORS
// ============================================================
function renderStepIndicators() {
  const steps = [
    { num: 1, label: 'Service', icon: 'fas fa-bolt' },
    { num: 2, label: 'Property', icon: 'fas fa-map-marker-alt' },
    { num: 3, label: 'Homeowner', icon: 'fas fa-user' },
    { num: 4, label: 'Requester', icon: 'fas fa-building' },
    { num: 5, label: 'Review', icon: 'fas fa-clipboard-check' },
  ];

  return steps.map((s, i) => {
    const isActive = s.num === state.currentStep;
    const isDone = s.num < state.currentStep;
    const circleClass = isDone ? 'bg-brand-500 text-white' : isActive ? 'bg-brand-600 text-white step-active' : 'bg-gray-200 text-gray-500';
    const lineClass = isDone ? 'bg-brand-500' : 'bg-gray-200';

    return `
      <div class="flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}">
        <div class="flex flex-col items-center">
          <div class="w-10 h-10 rounded-full ${circleClass} flex items-center justify-center text-sm font-bold shadow-sm">
            ${isDone ? '<i class="fas fa-check"></i>' : `<i class="${s.icon}"></i>`}
          </div>
          <span class="text-xs mt-1 ${isActive ? 'text-brand-700 font-semibold' : 'text-gray-400'}">${s.label}</span>
        </div>
        ${i < steps.length - 1 ? `<div class="flex-1 h-1 ${lineClass} mx-2 rounded mt-[-12px]"></div>` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================
// STEP 1: SERVICE TIER SELECTION
// ============================================================
function renderStep1() {
  const tiers = [
    {
      id: 'immediate',
      name: 'Immediate',
      price: 25,
      time: 'Under 5 minutes',
      icon: 'fas fa-rocket',
      color: 'red',
      bgGrad: 'from-red-500 to-red-600',
      desc: 'Priority processing. Report delivered instantly after payment.',
      features: ['Instant delivery', 'Priority queue', 'Dedicated processing']
    },
    {
      id: 'urgent',
      name: 'Urgent',
      price: 15,
      time: '15 - 30 minutes',
      icon: 'fas fa-bolt',
      color: 'amber',
      bgGrad: 'from-amber-500 to-amber-600',
      desc: 'Fast-tracked report. Perfect for same-day quotes.',
      features: ['15-30 min delivery', 'Fast-track queue', 'Email notification']
    },
    {
      id: 'regular',
      name: 'Regular',
      price: 10,
      time: '45 min - 1.5 hours',
      icon: 'fas fa-clock',
      color: 'brand',
      bgGrad: 'from-brand-500 to-brand-600',
      desc: 'Standard processing. Great value for planning purposes.',
      features: ['45min-1.5hr delivery', 'Standard queue', 'Email notification']
    }
  ];

  return `
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-gray-800">Choose Your Report Speed</h2>
      <p class="text-gray-500 mt-2">Select how quickly you need the roof measurement report</p>
    </div>
    <div class="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
      ${tiers.map(t => `
        <div class="tier-card bg-white rounded-xl border-2 ${state.formData.service_tier === t.id ? 'border-brand-500 selected' : 'border-gray-200'} p-6 relative overflow-hidden"
             onclick="selectTier('${t.id}', ${t.price})">
          ${state.formData.service_tier === t.id ? '<div class="absolute top-3 right-3"><i class="fas fa-check-circle text-brand-500 text-xl"></i></div>' : ''}
          <div class="w-14 h-14 rounded-xl bg-gradient-to-br ${t.bgGrad} flex items-center justify-center mb-4">
            <i class="${t.icon} text-white text-xl"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-800">${t.name}</h3>
          <div class="mt-2">
            <span class="price-badge text-lg">$${t.price} CAD</span>
          </div>
          <p class="text-sm text-gray-500 mt-3 flex items-center">
            <i class="fas fa-clock mr-2 text-${t.color}-500"></i>${t.time}
          </p>
          <p class="text-sm text-gray-600 mt-3">${t.desc}</p>
          <ul class="mt-4 space-y-2">
            ${t.features.map(f => `
              <li class="text-sm text-gray-600 flex items-center">
                <i class="fas fa-check text-brand-500 mr-2 text-xs"></i>${f}
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
}

function selectTier(tier, price) {
  state.formData.service_tier = tier;
  state.formData.price = price;
  render();
}

// ============================================================
// STEP 2: PROPERTY ADDRESS + MAP PIN
// ============================================================
function renderStep2() {
  return `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Property Location</h2>
        <p class="text-gray-500 mt-2">Enter the address and pin the exact roof on the map</p>
      </div>

      <!-- Address Search -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">
              <i class="fas fa-search mr-1 text-brand-500"></i>Search Address
            </label>
            <div class="flex gap-2">
              <input type="text" id="addressSearch" placeholder="Start typing an address..."
                class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                value="${state.formData.property_address}" onkeypress="if(event.key==='Enter'){searchAddress()}" />
              <button onclick="searchAddress()" class="px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" id="propCity" value="${state.formData.property_city}"
              oninput="state.formData.property_city=this.value"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
            <select id="propProvince" onchange="state.formData.property_province=this.value"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              ${['Alberta','British Columbia','Saskatchewan','Manitoba','Ontario','Quebec','New Brunswick','Nova Scotia','PEI','Newfoundland','Yukon','NWT','Nunavut']
                .map(p => `<option value="${p}" ${state.formData.property_province === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input type="text" id="propPostal" value="${state.formData.property_postal_code}"
              oninput="state.formData.property_postal_code=this.value"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="T5J 1A7" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Coordinates</label>
            <div class="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              ${state.formData.latitude ? `${state.formData.latitude.toFixed(6)}, ${state.formData.longitude.toFixed(6)}` : '<span class="text-gray-400">Pin not placed yet</span>'}
            </div>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-gray-700">
            <i class="fas fa-map-pin text-red-500 mr-1"></i>
            Click on the map to pin the exact roof
          </p>
          ${state.formData.pinPlaced ? '<span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full"><i class="fas fa-check mr-1"></i>Pin Placed</span>' : '<span class="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full"><i class="fas fa-exclamation-triangle mr-1"></i>Pin Required</span>'}
        </div>
        <div id="map" class="map-container w-full" style="height: 400px; background: #e5e7eb; display: flex; align-items: center; justify-content: center;">
          <div class="text-center text-gray-400">
            <i class="fas fa-map text-4xl mb-2"></i>
            <p class="text-sm">Google Maps loads here</p>
            <p class="text-xs mt-1">Configure your Google Maps API key in Settings</p>
            <button onclick="loadMapFallback()" class="mt-3 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
              Use Interactive Pin Selector
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Map initialization (works with or without Google Maps API key)
function initMap() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  // Check if Google Maps is available (loaded via callback or already ready)
  if (typeof google !== 'undefined' && google.maps) {
    initGoogleMap(mapDiv);
  } else if (typeof googleMapsReady !== 'undefined' && !googleMapsReady) {
    // Maps script is loading but not ready yet — wait for the callback
    console.log('[Maps] Waiting for Google Maps API to load...');
  }
  // Otherwise show fallback (already rendered in HTML)
}

function initGoogleMap(mapDiv) {
  const center = state.formData.latitude
    ? { lat: state.formData.latitude, lng: state.formData.longitude }
    : { lat: 53.5461, lng: -113.4938 }; // Edmonton default

  state.map = new google.maps.Map(mapDiv, {
    center,
    zoom: 18,
    mapTypeId: 'satellite',
    tilt: 0,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
  });

  state.geocoder = new google.maps.Geocoder();

  // Place existing marker
  if (state.formData.latitude) {
    placeGoogleMarker({ lat: state.formData.latitude, lng: state.formData.longitude });
  }

  // Click to place pin
  state.map.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    state.formData.latitude = lat;
    state.formData.longitude = lng;
    state.formData.pinPlaced = true;
    placeGoogleMarker({ lat, lng });
    render();
  });
}

function placeGoogleMarker(pos) {
  if (state.marker) state.marker.setMap(null);
  state.marker = new google.maps.Marker({
    position: pos,
    map: state.map,
    draggable: true,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444" width="36" height="36"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'),
      scaledSize: new google.maps.Size(36, 36),
    }
  });
  state.marker.addListener('dragend', (e) => {
    state.formData.latitude = e.latLng.lat();
    state.formData.longitude = e.latLng.lng();
    render();
  });
}

function searchAddress() {
  const addr = document.getElementById('addressSearch')?.value;
  if (!addr) return;
  state.formData.property_address = addr;

  if (state.geocoder) {
    state.geocoder.geocode({ address: addr }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        state.formData.latitude = loc.lat();
        state.formData.longitude = loc.lng();
        state.formData.pinPlaced = true;
        state.map.setCenter(loc);
        state.map.setZoom(20);
        placeGoogleMarker({ lat: loc.lat(), lng: loc.lng() });

        // Try to extract city/province from geocoded result
        const comps = results[0].address_components;
        comps.forEach(c => {
          if (c.types.includes('locality')) state.formData.property_city = c.long_name;
          if (c.types.includes('administrative_area_level_1')) state.formData.property_province = c.long_name;
          if (c.types.includes('postal_code')) state.formData.property_postal_code = c.long_name;
        });
        render();
      }
    });
  } else {
    showToast('Google Maps not configured. Enter coordinates manually or use the pin selector.', 'warning');
  }
}

// Fallback interactive pin selector (no Google Maps needed)
function loadMapFallback() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;

  const defaultLat = state.formData.latitude || 53.5461;
  const defaultLng = state.formData.longitude || -113.4938;

  mapDiv.innerHTML = `
    <div class="w-full h-full relative bg-gray-800" id="fallbackMap" style="cursor: crosshair;">
      <div class="absolute top-3 left-3 bg-white rounded-lg shadow-md p-3 z-10 max-w-xs">
        <p class="text-xs font-medium text-gray-700 mb-2">Manual Coordinates</p>
        <div class="flex gap-2 mb-2">
          <input type="number" step="0.000001" id="manLat" value="${defaultLat}" placeholder="Latitude"
            class="w-full px-2 py-1 text-xs border rounded" oninput="updateManualPin()" />
          <input type="number" step="0.000001" id="manLng" value="${defaultLng}" placeholder="Longitude"
            class="w-full px-2 py-1 text-xs border rounded" oninput="updateManualPin()" />
        </div>
        <button onclick="confirmManualPin()" class="w-full px-3 py-1.5 bg-brand-600 text-white rounded text-xs font-medium hover:bg-brand-700">
          <i class="fas fa-map-pin mr-1"></i>Confirm Pin Location
        </button>
      </div>
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${defaultLng-0.005}%2C${defaultLat-0.003}%2C${defaultLng+0.005}%2C${defaultLat+0.003}&amp;layer=mapnik&amp;marker=${defaultLat}%2C${defaultLng}"
            style="width: 100%; height: 400px; border: 0;" loading="lazy"></iframe>
        </div>
      </div>
    </div>
  `;
}

function updateManualPin() {
  const lat = parseFloat(document.getElementById('manLat')?.value);
  const lng = parseFloat(document.getElementById('manLng')?.value);
  if (!isNaN(lat) && !isNaN(lng)) {
    state.formData.latitude = lat;
    state.formData.longitude = lng;
  }
}

function confirmManualPin() {
  const lat = parseFloat(document.getElementById('manLat')?.value);
  const lng = parseFloat(document.getElementById('manLng')?.value);
  if (!isNaN(lat) && !isNaN(lng)) {
    state.formData.latitude = lat;
    state.formData.longitude = lng;
    state.formData.pinPlaced = true;
    showToast('Pin location confirmed!', 'success');
    render();
  }
}

// ============================================================
// STEP 3: HOMEOWNER INFO
// ============================================================
function renderStep3() {
  return `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Homeowner Information</h2>
        <p class="text-gray-500 mt-2">Who owns the property being measured?</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              <i class="fas fa-user mr-1 text-brand-500"></i>Homeowner Full Name <span class="text-red-500">*</span>
            </label>
            <input type="text" value="${state.formData.homeowner_name}"
              oninput="state.formData.homeowner_name=this.value"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="John Smith" />
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <i class="fas fa-phone mr-1 text-brand-500"></i>Phone Number
              </label>
              <input type="tel" value="${state.formData.homeowner_phone}"
                oninput="state.formData.homeowner_phone=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="(780) 555-1234" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <i class="fas fa-envelope mr-1 text-brand-500"></i>Email Address
              </label>
              <input type="email" value="${state.formData.homeowner_email}"
                oninput="state.formData.homeowner_email=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="john@example.com" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// STEP 4: REQUESTER / COMPANY
// ============================================================
function renderStep4() {
  const companyOptions = state.customerCompanies.map(c =>
    `<option value="${c.id}" ${state.formData.customer_company_id == c.id ? 'selected' : ''}>${c.company_name} - ${c.contact_name}</option>`
  ).join('');

  return `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Your Information</h2>
        <p class="text-gray-500 mt-2">Who is requesting this measurement report?</p>
      </div>

      <!-- Existing Customer Selector -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          <i class="fas fa-building mr-1 text-brand-500"></i>Select Existing Customer Company (Optional)
        </label>
        <select onchange="selectCustomerCompany(this.value)"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">-- New / Walk-in Customer --</option>
          ${companyOptions}
        </select>
        <p class="text-xs text-gray-400 mt-1">Select if this order is from a registered B2B customer</p>
      </div>

      <!-- Requester Details -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-700 mb-4"><i class="fas fa-id-card mr-2 text-brand-500"></i>Requester Details</h3>
        <div class="space-y-4">
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Your Full Name <span class="text-red-500">*</span>
              </label>
              <input type="text" value="${state.formData.requester_name}"
                oninput="state.formData.requester_name=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Your name" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input type="text" value="${state.formData.requester_company}"
                oninput="state.formData.requester_company=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Your company (optional)" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <i class="fas fa-envelope mr-1 text-brand-500"></i>Email <span class="text-red-500">*</span>
              </label>
              <input type="email" value="${state.formData.requester_email}"
                oninput="state.formData.requester_email=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="you@company.com" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                <i class="fas fa-phone mr-1 text-brand-500"></i>Phone
              </label>
              <input type="tel" value="${state.formData.requester_phone}"
                oninput="state.formData.requester_phone=this.value"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="(780) 555-4567" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function selectCustomerCompany(id) {
  state.formData.customer_company_id = id || null;
  if (id) {
    const company = state.customerCompanies.find(c => c.id == id);
    if (company) {
      state.formData.requester_name = company.contact_name || '';
      state.formData.requester_company = company.company_name || '';
      state.formData.requester_email = company.email || '';
      state.formData.requester_phone = company.phone || '';
      render();
    }
  }
}

// ============================================================
// STEP 5: REVIEW & SUBMIT
// ============================================================
function renderStep5() {
  const tierInfo = {
    immediate: { name: 'Immediate', time: 'Under 5 minutes', color: 'red', icon: 'fa-rocket' },
    urgent: { name: 'Urgent', time: '15-30 minutes', color: 'amber', icon: 'fa-bolt' },
    regular: { name: 'Regular', time: '45 min - 1.5 hours', color: 'brand', icon: 'fa-clock' },
  };
  const tier = tierInfo[state.formData.service_tier] || tierInfo.regular;

  return `
    <div class="max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Review Your Order</h2>
        <p class="text-gray-500 mt-2">Please confirm all details before placing your order</p>
      </div>

      <!-- Service Tier Summary -->
      <div class="bg-gradient-to-r from-brand-700 to-brand-800 rounded-xl p-6 text-white mb-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-brand-200 text-sm">Selected Service</p>
            <h3 class="text-2xl font-bold mt-1"><i class="fas ${tier.icon} mr-2"></i>${tier.name} Report</h3>
            <p class="text-brand-200 text-sm mt-1"><i class="fas fa-clock mr-1"></i>${tier.time}</p>
          </div>
          <div class="text-right">
            <p class="text-brand-200 text-sm">Total</p>
            <p class="text-4xl font-bold">$${state.formData.price}</p>
            <p class="text-brand-200 text-xs">CAD</p>
          </div>
        </div>
      </div>

      <!-- Details Cards -->
      <div class="space-y-4">
        <!-- Property -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
            <i class="fas fa-map-marker-alt text-red-500 mr-2"></i>Property Details
          </h4>
          <div class="grid md:grid-cols-2 gap-2 text-sm">
            <div><span class="text-gray-500">Address:</span> <span class="font-medium">${state.formData.property_address || 'Not entered'}</span></div>
            <div><span class="text-gray-500">City:</span> <span class="font-medium">${state.formData.property_city || '-'}</span></div>
            <div><span class="text-gray-500">Province:</span> <span class="font-medium">${state.formData.property_province}</span></div>
            <div><span class="text-gray-500">Postal:</span> <span class="font-medium">${state.formData.property_postal_code || '-'}</span></div>
            <div class="md:col-span-2">
              <span class="text-gray-500">Coordinates:</span>
              <span class="font-medium ${state.formData.pinPlaced ? 'text-brand-600' : 'text-red-500'}">
                ${state.formData.pinPlaced ? `${state.formData.latitude?.toFixed(6)}, ${state.formData.longitude?.toFixed(6)}` : 'Pin not placed!'}
              </span>
            </div>
          </div>
        </div>

        <!-- Homeowner -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
            <i class="fas fa-user text-brand-500 mr-2"></i>Homeowner
          </h4>
          <div class="grid md:grid-cols-2 gap-2 text-sm">
            <div><span class="text-gray-500">Name:</span> <span class="font-medium">${state.formData.homeowner_name || 'Not entered'}</span></div>
            <div><span class="text-gray-500">Phone:</span> <span class="font-medium">${state.formData.homeowner_phone || '-'}</span></div>
            <div><span class="text-gray-500">Email:</span> <span class="font-medium">${state.formData.homeowner_email || '-'}</span></div>
          </div>
        </div>

        <!-- Requester -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
            <i class="fas fa-building text-accent-500 mr-2"></i>Requester
          </h4>
          <div class="grid md:grid-cols-2 gap-2 text-sm">
            <div><span class="text-gray-500">Name:</span> <span class="font-medium">${state.formData.requester_name || 'Not entered'}</span></div>
            <div><span class="text-gray-500">Company:</span> <span class="font-medium">${state.formData.requester_company || '-'}</span></div>
            <div><span class="text-gray-500">Email:</span> <span class="font-medium">${state.formData.requester_email || '-'}</span></div>
            <div><span class="text-gray-500">Phone:</span> <span class="font-medium">${state.formData.requester_phone || '-'}</span></div>
          </div>
        </div>

        <!-- Notes -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            <i class="fas fa-sticky-note text-accent-500 mr-1"></i>Additional Notes (Optional)
          </label>
          <textarea oninput="state.formData.notes=this.value" rows="3"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
            placeholder="Any special instructions or details about the property...">${state.formData.notes}</textarea>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// STEP ROUTER
// ============================================================
function renderCurrentStep() {
  switch (state.currentStep) {
    case 1: return renderStep1();
    case 2: return renderStep2();
    case 3: return renderStep3();
    case 4: return renderStep4();
    case 5: return renderStep5();
    default: return '';
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function nextStep() {
  // Validate current step
  const error = validateStep(state.currentStep);
  if (error) {
    showToast(error, 'error');
    return;
  }
  if (state.currentStep < state.totalSteps) {
    state.currentStep++;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function prevStep() {
  if (state.currentStep > 1) {
    state.currentStep--;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function validateStep(step) {
  switch (step) {
    case 1:
      if (!state.formData.service_tier) return 'Please select a service tier';
      break;
    case 2:
      if (!state.formData.property_address) return 'Please enter the property address';
      break;
    case 3:
      if (!state.formData.homeowner_name) return 'Please enter the homeowner name';
      break;
    case 4:
      if (!state.formData.requester_name) return 'Please enter your name';
      break;
  }
  return null;
}

// ============================================================
// SUBMIT ORDER
// ============================================================
async function submitOrder() {
  if (state.submitting) return;

  // Final validation
  const errors = [];
  if (!state.formData.service_tier) errors.push('Service tier not selected');
  if (!state.formData.property_address) errors.push('Property address required');
  if (!state.formData.homeowner_name) errors.push('Homeowner name required');
  if (!state.formData.requester_name) errors.push('Requester name required');

  if (errors.length > 0) {
    showToast(errors.join('. '), 'error');
    return;
  }

  state.submitting = true;
  render();

  try {
    // 1. Create the order
    const orderRes = await fetch(API + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.formData)
    });
    const orderData = await orderRes.json();

    if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create order');

    // 2. Process payment (simulated)
    const payRes = await fetch(API + `/api/orders/${orderData.order.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const payData = await payRes.json();

    if (!payRes.ok) throw new Error(payData.error || 'Payment failed');

    // 3. Generate report (mock)
    const reportRes = await fetch(API + `/api/reports/${orderData.order.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    showToast('Order placed successfully!', 'success');

    // Redirect to confirmation page
    setTimeout(() => {
      window.location.href = `/order/${orderData.order.id}`;
    }, 1000);

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    state.submitting = false;
    render();
  }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info') {
  const colors = {
    success: 'bg-brand-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500'
  };
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-4 right-4 z-50 space-y-2';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${colors[type]} text-white px-5 py-3 rounded-lg shadow-lg flex items-center space-x-2 min-w-[300px]`;
  toast.innerHTML = `<i class="${icons[type]}"></i><span class="text-sm font-medium">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
