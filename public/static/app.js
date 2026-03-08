// ============================================================
// RoofReporterAI - Roofing Measurement Tool
// Main Order Form Application v2.1
// Two-Phase Address Selection + Satellite Roof Pinning
// ============================================================

const API = '';

// State
const state = {
  currentStep: 1,
  totalSteps: 5,
  // Step 2 has three phases: 'address' (autocomplete + form), 'pin' (satellite roof targeting), 'trace' (draw eaves/ridges)
  addressPhase: 'address',
  formData: {
    // Step 1: Service Tier
    service_tier: '',
    price: 0,
    // Step 2: Property
    property_address: '',
    property_city: '',
    property_province: 'Alberta',
    property_postal_code: '',
    property_country: 'Canada',
    latitude: null,
    longitude: null,
    pinPlaced: false,
    addressConfirmed: false,
    // Step 2 Phase C: Roof Tracing
    roof_trace_json: null,
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
    // Step 5: Review + Pricing
    notes: '',
    price_per_bundle: null
  },
  customerCompanies: [],
  // Map instances (separate for each phase)
  addressMap: null,
  addressMarker: null,
  autocomplete: null,
  pinMap: null,
  pinMarker: null,
  geocoder: null,
  // Tracing state
  traceMap: null,
  traceMode: 'eaves', // 'eaves', 'ridge', 'hip', 'valley'
  traceEavesPoints: [],
  traceRidgeLines: [],
  traceHipLines: [],
  traceValleyLines: [],
  traceCurrentLine: [],
  tracePolylines: [],
  traceEavesPolygon: null,
  traceMarkers: [],
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

  // Check for ?tier= query parameter (from landing page pricing CTA)
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedTier = urlParams.get('tier');
  if (preselectedTier) {
    const tierPrices = { express: 8, standard: 8 };
    if (tierPrices[preselectedTier]) {
      state.formData.service_tier = preselectedTier;
      state.formData.price = tierPrices[preselectedTier];
      // Auto-advance to step 2 since tier is already selected
      state.currentStep = 2;
    }
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
      ${renderNavButtons()}
    </div>
  `;

  // Initialize maps after DOM is rendered
  if (state.currentStep === 2) {
    setTimeout(() => {
      if (state.addressPhase === 'address') {
        initAddressMap();
      } else if (state.addressPhase === 'pin') {
        initPinMap();
      } else if (state.addressPhase === 'trace') {
        initTraceMap();
      }
    }, 100);
  }
}

function renderNavButtons() {
  // Step 2 has special back logic (pin→address, trace→pin)
  const showBack = state.currentStep > 1;
  let backAction = 'prevStep()';
  if (state.currentStep === 2 && state.addressPhase === 'pin') {
    backAction = 'backToAddressPhase()';
  } else if (state.currentStep === 2 && state.addressPhase === 'trace') {
    backAction = 'backToPinPhase()';
  }

  // Step 2 address phase: "Next" is replaced by "Confirm & Pin Roof" inside the step
  const hideNext = (state.currentStep === 2);

  return `
    ${showBack ? `
      <button onclick="${backAction}" class="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">
        <i class="fas fa-arrow-left mr-2"></i>Back
      </button>
    ` : '<div></div>'}
    ${state.currentStep < state.totalSteps && !hideNext ? `
      <button onclick="nextStep()" id="nextBtn" class="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors shadow-md">
        Next<i class="fas fa-arrow-right ml-2"></i>
      </button>
    ` : ''}
    ${state.currentStep === state.totalSteps ? `
      <button onclick="submitOrder()" id="submitBtn" class="px-8 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-bold text-lg transition-colors shadow-lg ${state.submitting ? 'opacity-50 cursor-not-allowed' : ''}">
        ${state.submitting ? '<span class="spinner mr-2"></span>Processing...' : '<i class="fas fa-check-circle mr-2"></i>Place Order & Pay'}
      </button>
    ` : ''}
  `;
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
      id: 'standard',
      name: 'Roof Measurement Report',
      price: 8,
      time: 'Instant',
      icon: 'fas fa-bolt',
      color: 'brand',
      bgGrad: 'from-brand-500 to-brand-600',
      desc: 'Professional 3-page report with satellite imagery, AI measurement overlay, and full material BOM. Delivered instantly.',
      features: ['Instant delivery', 'AI roof measurement overlay', 'Full material BOM', 'Email notification']
    }
  ];

  return `
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-gray-800">Roof Measurement Report</h2>
      <p class="text-gray-500 mt-2">Professional 3-page report with AI measurement overlay — delivered instantly</p>
    </div>
    <div class="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
      ${tiers.map(t => `
        <div class="tier-card bg-white rounded-xl border-2 ${state.formData.service_tier === t.id ? 'border-brand-500 selected' : 'border-gray-200'} p-6 relative overflow-hidden cursor-pointer"
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
// STEP 2: TWO-PHASE PROPERTY LOCATION
// Phase A: Address Selection (Google Places Autocomplete + form)
// Phase B: Satellite Roof Pin Confirmation
// ============================================================
function renderStep2() {
  if (state.addressPhase === 'trace') {
    return renderStep2TracePhase();
  }
  if (state.addressPhase === 'pin') {
    return renderStep2PinPhase();
  }
  return renderStep2AddressPhase();
}

// ---- PHASE A: Address Selection ----
function renderStep2AddressPhase() {
  const provinces = ['Alberta','British Columbia','Saskatchewan','Manitoba','Ontario','Quebec','New Brunswick','Nova Scotia','PEI','Newfoundland','Yukon','NWT','Nunavut'];

  return `
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">
          <i class="fas fa-search-location mr-2 text-brand-500"></i>Find the Property
        </h2>
        <p class="text-gray-500 mt-2">Search for the address or type it manually. We'll locate it on the map.</p>
      </div>

      <!-- Phase indicator -->
      <div class="flex items-center justify-center gap-3 mb-6">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold">
          <i class="fas fa-search"></i> Find Address
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-400 rounded-full text-xs">
          <i class="fas fa-crosshairs"></i> Pin Roof
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-400 rounded-full text-xs">
          <i class="fas fa-draw-polygon"></i> Trace Roof
        </div>
      </div>

      <!-- Split layout: Form + Map -->
      <div class="grid lg:grid-cols-5 gap-6">
        <!-- Left: Address Form (like the Google widget) -->
        <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex items-center gap-2 mb-5">
            <img src="https://fonts.gstatic.com/s/i/googlematerialicons/location_pin/v5/24px.svg" alt="" class="w-5 h-5">
            <span class="font-semibold text-gray-800">Address Selection</span>
          </div>

          <div class="space-y-4">
            <!-- Autocomplete Address Input -->
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Street Address</label>
              <input type="text" id="autocomplete-input" placeholder="Start typing an address..."
                class="w-full px-4 py-3 border-b-2 border-gray-300 focus:border-brand-500 outline-none text-sm font-medium transition-colors bg-gray-50 rounded-t-lg"
                value="${state.formData.property_address}" />
            </div>

            <!-- City -->
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">City</label>
              <input type="text" id="city-input" placeholder="City"
                class="w-full px-4 py-2.5 border-b-2 border-gray-200 focus:border-brand-500 outline-none text-sm transition-colors"
                value="${state.formData.property_city}"
                oninput="state.formData.property_city=this.value" />
            </div>

            <!-- Province + Postal -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Province</label>
                <select id="province-input" onchange="state.formData.property_province=this.value"
                  class="w-full px-3 py-2.5 border-b-2 border-gray-200 focus:border-brand-500 outline-none text-sm transition-colors bg-white">
                  ${provinces.map(p => `<option value="${p}" ${state.formData.property_province === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Postal Code</label>
                <input type="text" id="postal-input" placeholder="T5J 1A7"
                  class="w-full px-3 py-2.5 border-b-2 border-gray-200 focus:border-brand-500 outline-none text-sm transition-colors"
                  value="${state.formData.property_postal_code}"
                  oninput="state.formData.property_postal_code=this.value" />
              </div>
            </div>

            <!-- Country -->
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Country</label>
              <input type="text" id="country-input" placeholder="Country"
                class="w-full px-4 py-2.5 border-b-2 border-gray-200 focus:border-brand-500 outline-none text-sm transition-colors"
                value="${state.formData.property_country}"
                oninput="state.formData.property_country=this.value" />
            </div>

            <!-- Coordinates display -->
            <div class="pt-2 border-t border-gray-100">
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span><i class="fas fa-map-pin mr-1"></i>Coordinates</span>
                <span class="${state.formData.latitude ? 'text-brand-600 font-medium' : 'text-gray-400'}">
                  ${state.formData.latitude ? `${state.formData.latitude.toFixed(6)}, ${state.formData.longitude.toFixed(6)}` : 'Not located yet'}
                </span>
              </div>
            </div>

            <!-- Confirm & Proceed Button -->
            <button onclick="confirmAddressAndProceed()" id="confirm-address-btn"
              class="w-full mt-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2
                ${state.formData.latitude ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
              ${!state.formData.latitude ? 'disabled' : ''}>
              <i class="fas fa-crosshairs"></i>
              Confirm Address & Pin Exact Roof
              <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Right: Map Preview -->
        <div class="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">
              <i class="fas fa-map mr-1"></i> Map Preview
            </span>
            ${state.formData.latitude ? `
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                <i class="fas fa-check-circle mr-1"></i>Location Found
              </span>
            ` : `
              <span class="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                Search an address to preview
              </span>
            `}
          </div>
          <div id="address-map" style="height: 480px; background: #f3f4f6;">
            <div class="h-full flex items-center justify-center text-gray-400">
              <div class="text-center">
                <i class="fas fa-map-marked-alt text-5xl mb-3 text-gray-300"></i>
                <p class="text-sm font-medium">Type an address to see the map</p>
                <p class="text-xs mt-1">Google Maps will locate the property</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---- PHASE B: Satellite Roof Pinning ----
function renderStep2PinPhase() {
  return `
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">
          <i class="fas fa-crosshairs mr-2 text-red-500"></i>Pin the Exact Roof
        </h2>
        <p class="text-gray-500 mt-2">Click on the satellite image to place a pin on the <strong>exact roof</strong> to be measured</p>
      </div>

      <!-- Phase indicator -->
      <div class="flex items-center justify-center gap-3 mb-4">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">
          <i class="fas fa-check-circle"></i> Address
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
          <i class="fas fa-crosshairs"></i> Pin Roof
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-400 rounded-full text-xs">
          <i class="fas fa-draw-polygon"></i> Trace Roof
        </div>
      </div>

      <!-- Address summary bar -->
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
            <i class="fas fa-map-marker-alt text-brand-600 text-sm"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-800">${state.formData.property_address}</p>
            <p class="text-xs text-gray-500">${state.formData.property_city}${state.formData.property_province ? ', ' + state.formData.property_province : ''} ${state.formData.property_postal_code}</p>
          </div>
        </div>
        <button onclick="backToAddressPhase()" class="text-xs text-brand-600 hover:text-brand-700 font-medium">
          <i class="fas fa-edit mr-1"></i>Change Address
        </button>
      </div>

      <!-- Satellite Map for roof pinning -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full ${state.formData.pinPlaced ? 'bg-green-400' : 'bg-red-400 animate-pulse'}"></div>
            <span class="text-xs font-medium text-gray-300 uppercase tracking-wide">
              <i class="fas fa-satellite mr-1"></i> Satellite View — Roof Targeting
            </span>
          </div>
          <div class="flex items-center gap-3">
            ${state.formData.pinPlaced ? `
              <span class="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-medium">
                <i class="fas fa-check-circle mr-1"></i>Pin Placed — ${state.formData.latitude.toFixed(6)}, ${state.formData.longitude.toFixed(6)}
              </span>
            ` : `
              <span class="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full font-medium animate-pulse">
                <i class="fas fa-hand-pointer mr-1"></i>Click on the roof to place pin
              </span>
            `}
          </div>
        </div>
        <div id="pin-map" style="height: 500px; cursor: crosshair; background: #1a1a2e;"></div>
      </div>

      <!-- Instructions + Confirm -->
      <div class="mt-4 flex items-center justify-between">
        <div class="flex items-center gap-4 text-xs text-gray-500">
          <span><i class="fas fa-mouse-pointer mr-1"></i>Click = Place pin</span>
          <span><i class="fas fa-hand-rock mr-1"></i>Drag pin = Adjust</span>
          <span><i class="fas fa-search-plus mr-1"></i>Scroll = Zoom</span>
        </div>
        <button onclick="confirmPinAndProceed()" id="confirm-pin-btn"
          class="px-6 py-3 rounded-lg font-semibold text-sm transition-all shadow-md flex items-center gap-2
            ${state.formData.pinPlaced ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}"
          ${!state.formData.pinPlaced ? 'disabled' : ''}>
          <i class="fas fa-check-circle"></i>
          Confirm Roof Location
          <i class="fas fa-arrow-right"></i>
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// PHASE A: Address Map Initialization
// ============================================================
function initAddressMap() {
  const mapDiv = document.getElementById('address-map');
  if (!mapDiv || typeof google === 'undefined' || !google.maps) return;

  const center = state.formData.latitude
    ? { lat: state.formData.latitude, lng: state.formData.longitude }
    : { lat: 53.5461, lng: -113.4938 }; // Edmonton default

  state.addressMap = new google.maps.Map(mapDiv, {
    center,
    zoom: state.formData.latitude ? 17 : 11,
    mapTypeId: 'roadmap',
    fullscreenControl: true,
    streetViewControl: true,
    zoomControl: true,
    mapTypeControl: false,
  });

  state.geocoder = new google.maps.Geocoder();

  // Place marker if we already have coordinates
  if (state.formData.latitude) {
    placeAddressMarker({ lat: state.formData.latitude, lng: state.formData.longitude });
  }

  // Initialize Places Autocomplete
  initAutocomplete();
}

function initAutocomplete() {
  const input = document.getElementById('autocomplete-input');
  if (!input || typeof google === 'undefined') return;

  state.autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['address_components', 'geometry', 'name', 'formatted_address'],
    types: ['address'],
    componentRestrictions: { country: 'ca' }
  });

  state.autocomplete.addListener('place_changed', () => {
    const place = state.autocomplete.getPlace();
    if (!place.geometry) {
      showToast(`No details available for: '${place.name}'`, 'warning');
      return;
    }

    // Extract address components
    fillFormFromPlace(place);

    // Update map
    const loc = place.geometry.location;
    state.formData.latitude = loc.lat();
    state.formData.longitude = loc.lng();

    state.addressMap.setCenter(loc);
    state.addressMap.setZoom(17);
    placeAddressMarker({ lat: loc.lat(), lng: loc.lng() });

    // Update the button state
    updateConfirmButton();
  });

  // Also handle manual search on Enter
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualGeocode();
    }
  });
}

function fillFormFromPlace(place) {
  const SHORT_NAMES = new Set(['street_number', 'administrative_area_level_1', 'postal_code']);

  function getComponent(type) {
    for (const comp of place.address_components || []) {
      if (comp.types.includes(type)) {
        return SHORT_NAMES.has(type) ? comp.short_name : comp.long_name;
      }
    }
    return '';
  }

  // Build street address
  const streetNumber = getComponent('street_number');
  const route = getComponent('route');
  const streetAddress = `${streetNumber} ${route}`.trim();

  // Fill form fields
  state.formData.property_address = streetAddress || place.formatted_address || '';
  state.formData.property_city = getComponent('locality') || getComponent('sublocality_level_1') || '';
  state.formData.property_province = getComponent('administrative_area_level_1') || 'Alberta';
  state.formData.property_postal_code = getComponent('postal_code') || '';
  state.formData.property_country = getComponent('country') || 'Canada';

  // Update DOM inputs
  const cityInput = document.getElementById('city-input');
  const postalInput = document.getElementById('postal-input');
  const countryInput = document.getElementById('country-input');
  const provinceInput = document.getElementById('province-input');

  if (cityInput) cityInput.value = state.formData.property_city;
  if (postalInput) postalInput.value = state.formData.property_postal_code;
  if (countryInput) countryInput.value = state.formData.property_country;
  if (provinceInput) provinceInput.value = state.formData.property_province;
}

function manualGeocode() {
  const input = document.getElementById('autocomplete-input');
  const addr = input?.value;
  if (!addr || !state.geocoder) return;

  state.formData.property_address = addr;

  state.geocoder.geocode({ address: addr + ', Canada' }, (results, status) => {
    if (status === 'OK' && results[0]) {
      const loc = results[0].geometry.location;
      state.formData.latitude = loc.lat();
      state.formData.longitude = loc.lng();

      // Extract components
      const comps = results[0].address_components;
      comps.forEach(c => {
        if (c.types.includes('locality')) state.formData.property_city = c.long_name;
        if (c.types.includes('administrative_area_level_1')) state.formData.property_province = c.short_name;
        if (c.types.includes('postal_code')) state.formData.property_postal_code = c.short_name;
        if (c.types.includes('country')) state.formData.property_country = c.long_name;
      });

      state.addressMap.setCenter(loc);
      state.addressMap.setZoom(17);
      placeAddressMarker({ lat: loc.lat(), lng: loc.lng() });

      // Update form
      const cityInput = document.getElementById('city-input');
      const postalInput = document.getElementById('postal-input');
      const countryInput = document.getElementById('country-input');
      if (cityInput) cityInput.value = state.formData.property_city;
      if (postalInput) postalInput.value = state.formData.property_postal_code;
      if (countryInput) countryInput.value = state.formData.property_country;

      updateConfirmButton();
    } else {
      showToast('Could not find that address. Try being more specific.', 'warning');
    }
  });
}

function placeAddressMarker(pos) {
  if (state.addressMarker) state.addressMarker.setMap(null);
  state.addressMarker = new google.maps.Marker({
    position: pos,
    map: state.addressMap,
    animation: google.maps.Animation.DROP,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23059669" width="40" height="40"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'),
      scaledSize: new google.maps.Size(40, 40),
    }
  });
}

function updateConfirmButton() {
  const btn = document.getElementById('confirm-address-btn');
  if (btn && state.formData.latitude) {
    btn.disabled = false;
    btn.className = 'w-full mt-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white';
  }
  // Update coordinates display
  const coordDisplay = document.querySelector('[data-coord-display]');
  if (coordDisplay) {
    coordDisplay.textContent = `${state.formData.latitude.toFixed(6)}, ${state.formData.longitude.toFixed(6)}`;
    coordDisplay.className = 'text-brand-600 font-medium';
  }
}

// ============================================================
// PHASE B: Satellite Pin Map
// ============================================================
function initPinMap() {
  const mapDiv = document.getElementById('pin-map');
  if (!mapDiv || typeof google === 'undefined' || !google.maps) return;

  const center = { lat: state.formData.latitude, lng: state.formData.longitude };

  state.pinMap = new google.maps.Map(mapDiv, {
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

  // Place existing pin if returning to this phase
  if (state.formData.pinPlaced) {
    placePinMarker({ lat: state.formData.latitude, lng: state.formData.longitude });
  }

  // Click to place/move roof pin
  state.pinMap.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    state.formData.latitude = lat;
    state.formData.longitude = lng;
    state.formData.pinPlaced = true;
    placePinMarker({ lat, lng });

    // Update UI without full re-render (avoid destroying the map)
    updatePinUI();
  });
}

function placePinMarker(pos) {
  if (state.pinMarker) state.pinMarker.setMap(null);

  state.pinMarker = new google.maps.Marker({
    position: pos,
    map: state.pinMap,
    draggable: true,
    animation: google.maps.Animation.DROP,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">' +
        '<circle cx="24" cy="24" r="22" fill="none" stroke="%23ef4444" stroke-width="3" stroke-dasharray="6,3"/>' +
        '<circle cx="24" cy="24" r="4" fill="%23ef4444"/>' +
        '<line x1="24" y1="2" x2="24" y2="14" stroke="%23ef4444" stroke-width="2"/>' +
        '<line x1="24" y1="34" x2="24" y2="46" stroke="%23ef4444" stroke-width="2"/>' +
        '<line x1="2" y1="24" x2="14" y2="24" stroke="%23ef4444" stroke-width="2"/>' +
        '<line x1="34" y1="24" x2="46" y2="24" stroke="%23ef4444" stroke-width="2"/>' +
        '</svg>'
      ),
      scaledSize: new google.maps.Size(48, 48),
      anchor: new google.maps.Point(24, 24),
    }
  });

  state.pinMarker.addListener('dragend', (e) => {
    state.formData.latitude = e.latLng.lat();
    state.formData.longitude = e.latLng.lng();
    updatePinUI();
  });
}

function updatePinUI() {
  // Update the pin status bar without re-rendering the whole page
  const statusBar = document.querySelector('[data-pin-status]');
  if (statusBar) {
    statusBar.innerHTML = state.formData.pinPlaced
      ? `<span class="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-medium">
           <i class="fas fa-check-circle mr-1"></i>Pin Placed — ${state.formData.latitude.toFixed(6)}, ${state.formData.longitude.toFixed(6)}
         </span>`
      : `<span class="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full font-medium animate-pulse">
           <i class="fas fa-hand-pointer mr-1"></i>Click on the roof to place pin
         </span>`;
  }

  // Update confirm button
  const btn = document.getElementById('confirm-pin-btn');
  if (btn && state.formData.pinPlaced) {
    btn.disabled = false;
    btn.className = 'px-6 py-3 rounded-lg font-semibold text-sm transition-all shadow-md flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white';
  }

  // Update the status dot
  const dot = document.querySelector('[data-pin-dot]');
  if (dot) {
    dot.className = state.formData.pinPlaced ? 'w-2 h-2 rounded-full bg-green-400' : 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
  }
}

// ============================================================
// PHASE C: Roof Tracing — Draw eaves, ridges, hips, valleys
// ============================================================
function renderStep2TracePhase() {
  const modeInfo = {
    eaves:  { color: '#22c55e', icon: 'fa-draw-polygon', label: 'Eaves Outline', desc: 'Click around the full eave perimeter of the roof. Close the polygon by clicking the first point.' },
    ridge:  { color: '#3b82f6', icon: 'fa-grip-lines', label: 'Ridges', desc: 'Click start and end of each ridge line. Double-click to finish each line.' },
    hip:    { color: '#f59e0b', icon: 'fa-slash', label: 'Hips', desc: 'Click start and end of each hip line. Double-click to finish each line.' },
    valley: { color: '#ef4444', icon: 'fa-angle-down', label: 'Valleys', desc: 'Click start and end of each valley line. Double-click to finish each line.' }
  };
  const m = modeInfo[state.traceMode] || modeInfo.eaves;
  const eavesCount = state.traceEavesPoints.length;
  const ridgeCount = state.traceRidgeLines.length;
  const hipCount = state.traceHipLines.length;
  const valleyCount = state.traceValleyLines.length;
  const eavesClosed = eavesCount >= 3 && state.traceEavesPolygon;

  return `
    <div class="max-w-5xl mx-auto">
      <div class="text-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">
          <i class="fas fa-draw-polygon mr-2 text-green-500"></i>Trace the Roof
        </h2>
        <p class="text-gray-500 mt-1 text-sm">Draw the eaves outline, then mark ridges and hips for accurate measurement</p>
      </div>

      <!-- Phase indicator -->
      <div class="flex items-center justify-center gap-3 mb-4">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">
          <i class="fas fa-check-circle"></i> Address
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">
          <i class="fas fa-check-circle"></i> Pinned
        </div>
        <i class="fas fa-arrow-right text-gray-300 text-xs"></i>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
          <i class="fas fa-draw-polygon"></i> Trace Roof
        </div>
      </div>

      <!-- Address summary -->
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-2 mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-map-marker-alt text-brand-600 text-sm"></i>
          <span class="text-sm font-medium text-gray-800">${state.formData.property_address}</span>
          <span class="text-xs text-gray-400">|</span>
          <span class="text-xs text-gray-500">${state.formData.latitude?.toFixed(6)}, ${state.formData.longitude?.toFixed(6)}</span>
        </div>
      </div>

      <div class="grid lg:grid-cols-4 gap-4">
        <!-- Left: Mode selector + stats -->
        <div class="lg:col-span-1 space-y-3">
          <!-- Drawing Mode Selector -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Drawing Mode</h4>
            <div class="space-y-2">
              ${Object.entries(modeInfo).map(([key, info]) => `
                <button onclick="setTraceMode('${key}')"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${state.traceMode === key ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}"
                  style="${state.traceMode === key ? '' : ''}">
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

          <!-- Quick Stats -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Trace Summary</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between items-center">
                <span class="text-gray-500"><i class="fas fa-draw-polygon mr-1" style="color:#22c55e"></i>Eaves</span>
                <span class="font-semibold ${eavesClosed ? 'text-green-600' : 'text-gray-400'}">
                  ${eavesClosed ? '<i class="fas fa-check-circle mr-1"></i>Closed' : eavesCount + ' points'}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-500"><i class="fas fa-grip-lines mr-1" style="color:#3b82f6"></i>Ridges</span>
                <span class="font-semibold">${ridgeCount} lines</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-500"><i class="fas fa-slash mr-1" style="color:#f59e0b"></i>Hips</span>
                <span class="font-semibold">${hipCount} lines</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-500"><i class="fas fa-angle-down mr-1" style="color:#ef4444"></i>Valleys</span>
                <span class="font-semibold">${valleyCount} lines</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-2">
            <button onclick="undoLastTrace()" class="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-all">
              <i class="fas fa-undo mr-1"></i>Undo Last
            </button>
            <button onclick="clearAllTraces()" class="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-all">
              <i class="fas fa-trash mr-1"></i>Clear All
            </button>
          </div>
        </div>

        <!-- Right: Trace Map -->
        <div class="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full" style="background:${m.color}"></div>
              <span class="text-xs font-medium text-gray-300 uppercase tracking-wide">
                <i class="fas ${m.icon} mr-1"></i>${m.label} Mode
              </span>
            </div>
            <span class="text-xs text-gray-400">${m.desc}</span>
          </div>
          <div id="trace-map" style="height: 520px; cursor: crosshair; background: #1a1a2e;"></div>
        </div>
      </div>

      <!-- Confirm + Skip -->
      <div class="mt-4 flex items-center justify-between">
        <div class="flex items-center gap-4 text-xs text-gray-500">
          <span><i class="fas fa-mouse-pointer mr-1"></i>Click = Add point</span>
          <span><i class="fas fa-mouse mr-1"></i>Double-click = Finish line</span>
          <span><i class="fas fa-draw-polygon mr-1" style="color:#22c55e"></i>Eaves: click first point to close</span>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="skipTracing()" class="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-all">
            Skip Tracing <i class="fas fa-forward ml-1"></i>
          </button>
          <button onclick="confirmTraceAndProceed()" id="confirm-trace-btn"
            class="px-6 py-3 rounded-lg font-semibold text-sm transition-all shadow-md flex items-center gap-2
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
}

// ============================================================
// TRACE MAP INITIALIZATION & DRAWING LOGIC
// ============================================================
function initTraceMap() {
  const mapDiv = document.getElementById('trace-map');
  if (!mapDiv || typeof google === 'undefined' || !google.maps) return;

  const center = { lat: state.formData.latitude, lng: state.formData.longitude };

  state.traceMap = new google.maps.Map(mapDiv, {
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

  // Place pin marker
  new google.maps.Marker({
    position: center,
    map: state.traceMap,
    icon: {
      url: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="4" fill="%23ef4444" stroke="white" stroke-width="2"/></svg>'
      ),
      scaledSize: new google.maps.Size(20, 20),
      anchor: new google.maps.Point(10, 10),
    }
  });

  // Restore existing traces if user comes back
  restoreTraceOverlays();

  // Map click handler
  state.traceMap.addListener('click', (e) => {
    const pt = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    handleTraceClick(pt);
  });

  // Double-click to finish line segments (ridge, hip, valley)
  state.traceMap.addListener('dblclick', (e) => {
    e.stop();
    finishCurrentLine();
  });
}

function handleTraceClick(pt) {
  const mode = state.traceMode;

  if (mode === 'eaves') {
    // Check if clicking near the first point to close the polygon
    if (state.traceEavesPoints.length >= 3) {
      const first = state.traceEavesPoints[0];
      const dist = getLatLngDistance(pt, first);
      if (dist < 3) { // ~3 meters threshold
        closeEavesPolygon();
        return;
      }
    }

    state.traceEavesPoints.push(pt);
    addTraceMarker(pt, '#22c55e', state.traceEavesPoints.length);

    // Draw polyline as user traces
    if (state.traceEavesPoints.length > 1) {
      drawTracePolyline(state.traceEavesPoints, '#22c55e', 3, false);
    }
  } else {
    // Ridge, Hip, Valley: collecting points for current line
    state.traceCurrentLine.push(pt);
    const colors = { ridge: '#3b82f6', hip: '#f59e0b', valley: '#ef4444' };
    addTraceMarker(pt, colors[mode], null);

    if (state.traceCurrentLine.length === 2) {
      // Auto-finish when 2 points are placed for a line
      finishCurrentLine();
    } else if (state.traceCurrentLine.length > 1) {
      drawTracePolyline(state.traceCurrentLine, colors[mode], 2, true);
    }
  }

  updateTraceSummaryUI();
}

function closeEavesPolygon() {
  if (state.traceEavesPoints.length < 3) return;

  // Remove old eaves polyline
  clearTraceOverlays();

  // Draw filled polygon
  state.traceEavesPolygon = new google.maps.Polygon({
    paths: state.traceEavesPoints.map(p => new google.maps.LatLng(p.lat, p.lng)),
    map: state.traceMap,
    strokeColor: '#22c55e',
    strokeWeight: 3,
    strokeOpacity: 0.9,
    fillColor: '#22c55e',
    fillOpacity: 0.15,
    editable: true,
    draggable: false
  });

  // Listen for polygon edits
  const path = state.traceEavesPolygon.getPath();
  google.maps.event.addListener(path, 'set_at', () => updateEavesFromPolygon());
  google.maps.event.addListener(path, 'insert_at', () => updateEavesFromPolygon());

  // Redraw markers
  state.traceEavesPoints.forEach((p, i) => {
    addTraceMarker(p, '#22c55e', i + 1);
  });

  // Redraw other lines
  restoreLineOverlays();

  showToast('Eaves outline closed! Now add ridges and hips.', 'success');
  state.traceMode = 'ridge';
  updateTraceSummaryUI();
}

function updateEavesFromPolygon() {
  if (!state.traceEavesPolygon) return;
  const path = state.traceEavesPolygon.getPath();
  state.traceEavesPoints = [];
  for (let i = 0; i < path.getLength(); i++) {
    const pt = path.getAt(i);
    state.traceEavesPoints.push({ lat: pt.lat(), lng: pt.lng() });
  }
}

function finishCurrentLine() {
  if (state.traceCurrentLine.length < 2) {
    state.traceCurrentLine = [];
    return;
  }

  const line = [...state.traceCurrentLine];
  const mode = state.traceMode;
  const colors = { ridge: '#3b82f6', hip: '#f59e0b', valley: '#ef4444' };

  if (mode === 'ridge') {
    state.traceRidgeLines.push(line);
  } else if (mode === 'hip') {
    state.traceHipLines.push(line);
  } else if (mode === 'valley') {
    state.traceValleyLines.push(line);
  }

  // Draw permanent line
  drawTracePolyline(line, colors[mode], 2.5, false);

  state.traceCurrentLine = [];
  showToast(`${mode.charAt(0).toUpperCase() + mode.slice(1)} line added`, 'success');
  updateTraceSummaryUI();
}

function addTraceMarker(pt, color, label) {
  const marker = new google.maps.Marker({
    position: { lat: pt.lat, lng: pt.lng },
    map: state.traceMap,
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
  state.traceMarkers.push(marker);
}

function drawTracePolyline(points, color, weight, isDashed) {
  const polyline = new google.maps.Polyline({
    path: points.map(p => new google.maps.LatLng(p.lat, p.lng)),
    map: state.traceMap,
    strokeColor: color,
    strokeWeight: weight,
    strokeOpacity: isDashed ? 0.6 : 0.9,
    icons: isDashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 }, offset: '0', repeat: '15px' }] : []
  });
  state.tracePolylines.push(polyline);
}

function clearTraceOverlays() {
  state.traceMarkers.forEach(m => m.setMap(null));
  state.traceMarkers = [];
  state.tracePolylines.forEach(p => p.setMap(null));
  state.tracePolylines = [];
  if (state.traceEavesPolygon) {
    state.traceEavesPolygon.setMap(null);
    state.traceEavesPolygon = null;
  }
}

function restoreTraceOverlays() {
  // Restore eaves
  if (state.traceEavesPoints.length >= 3 && state.traceEavesPolygon === null) {
    // Check if we have a closed polygon
    closeEavesPolygon();
  } else if (state.traceEavesPoints.length > 0) {
    state.traceEavesPoints.forEach((p, i) => addTraceMarker(p, '#22c55e', i + 1));
    if (state.traceEavesPoints.length > 1) {
      drawTracePolyline(state.traceEavesPoints, '#22c55e', 3, false);
    }
  }
  restoreLineOverlays();
}

function restoreLineOverlays() {
  state.traceRidgeLines.forEach(line => drawTracePolyline(line, '#3b82f6', 2.5, false));
  state.traceHipLines.forEach(line => drawTracePolyline(line, '#f59e0b', 2.5, false));
  state.traceValleyLines.forEach(line => drawTracePolyline(line, '#ef4444', 2.5, false));
}

function setTraceMode(mode) {
  // Finish any pending line
  if (state.traceCurrentLine.length > 0) finishCurrentLine();
  state.traceMode = mode;
  // Partial re-render of mode selector only
  updateTraceSummaryUI();
}

function undoLastTrace() {
  const mode = state.traceMode;
  if (mode === 'eaves') {
    if (state.traceEavesPolygon) {
      state.traceEavesPolygon.setMap(null);
      state.traceEavesPolygon = null;
    }
    if (state.traceEavesPoints.length > 0) {
      state.traceEavesPoints.pop();
    }
  } else if (mode === 'ridge' && state.traceRidgeLines.length > 0) {
    state.traceRidgeLines.pop();
  } else if (mode === 'hip' && state.traceHipLines.length > 0) {
    state.traceHipLines.pop();
  } else if (mode === 'valley' && state.traceValleyLines.length > 0) {
    state.traceValleyLines.pop();
  }
  state.traceCurrentLine = [];

  // Redraw everything
  clearTraceOverlays();
  restoreTraceOverlays();
  updateTraceSummaryUI();
  showToast('Undo complete', 'info');
}

function clearAllTraces() {
  if (!confirm('Clear all traced lines? This cannot be undone.')) return;
  state.traceEavesPoints = [];
  state.traceRidgeLines = [];
  state.traceHipLines = [];
  state.traceValleyLines = [];
  state.traceCurrentLine = [];
  clearTraceOverlays();
  state.formData.roof_trace_json = null;
  updateTraceSummaryUI();
  showToast('All traces cleared', 'info');
}

function updateTraceSummaryUI() {
  // Do a soft re-render of the left panel + confirm button
  render();
}

function getLatLngDistance(a, b) {
  // Approximate distance in meters between two lat/lng points
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function compileTraceData() {
  return {
    eaves: state.traceEavesPoints,
    ridges: state.traceRidgeLines,
    hips: state.traceHipLines,
    valleys: state.traceValleyLines,
    traced_at: new Date().toISOString()
  };
}

function confirmTraceAndProceed() {
  const eavesClosed = state.traceEavesPoints.length >= 3 && state.traceEavesPolygon;
  if (!eavesClosed) {
    showToast('Please draw the complete eaves outline (close the polygon by clicking the first point)', 'error');
    return;
  }

  // Update polygon vertices in case user edited them
  updateEavesFromPolygon();

  // Compile and save trace data
  state.formData.roof_trace_json = compileTraceData();

  showToast('Roof trace saved!', 'success');
  state.currentStep = 3;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function skipTracing() {
  state.formData.roof_trace_json = null;
  state.currentStep = 3;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// PHASE TRANSITIONS
// ============================================================
function confirmAddressAndProceed() {
  // Validate address is filled
  const addr = document.getElementById('autocomplete-input')?.value;
  if (addr) state.formData.property_address = addr;

  if (!state.formData.property_address) {
    showToast('Please enter a property address', 'error');
    return;
  }

  if (!state.formData.latitude) {
    showToast('Please search for an address to locate it on the map', 'error');
    return;
  }

  state.formData.addressConfirmed = true;
  state.addressPhase = 'pin';
  render();
}

function backToAddressPhase() {
  state.addressPhase = 'address';
  render();
}

function confirmPinAndProceed() {
  if (!state.formData.pinPlaced) {
    showToast('Please click on the satellite map to pin the exact roof', 'error');
    return;
  }

  // Proceed to trace phase
  state.addressPhase = 'trace';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToPinPhase() {
  state.addressPhase = 'pin';
  render();
}

// Fallback for non-Google Maps environments
function initMap() {
  // Called by the global onGoogleMapsReady callback
  // Determine which sub-map to initialize
  if (state.currentStep === 2) {
    if (state.addressPhase === 'address') {
      initAddressMap();
    } else {
      initPinMap();
    }
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

function updatePricePerBundle(val) {
  const num = parseFloat(val);
  state.formData.price_per_bundle = isNaN(num) || num <= 0 ? null : num;
}

// ============================================================
// STEP 5: REVIEW & SUBMIT
// ============================================================
function renderStep5() {
  const tierInfo = {
    express: { name: 'Roof Measurement', time: 'Instant delivery', color: 'brand', icon: 'fa-bolt' },
    standard: { name: 'Roof Measurement', time: 'Instant delivery', color: 'brand', icon: 'fa-bolt' },
  };
  const tier = tierInfo[state.formData.service_tier] || tierInfo.standard;

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
              <span class="text-gray-500">Roof Pin:</span>
              <span class="font-medium ${state.formData.pinPlaced ? 'text-brand-600' : 'text-red-500'}">
                ${state.formData.pinPlaced ? `${state.formData.latitude?.toFixed(6)}, ${state.formData.longitude?.toFixed(6)}` : 'Pin not placed!'}
              </span>
              ${state.formData.pinPlaced ? ' <i class="fas fa-check-circle text-brand-500 text-xs"></i>' : ''}
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

        <!-- Price Per Bundle (Square) for Customer Cost Estimate -->
        <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
            <i class="fas fa-dollar-sign text-amber-500 mr-2"></i>Customer Price Estimate (Optional)
          </h4>
          <p class="text-xs text-gray-500 mb-3">Enter your price per square (per bundle) to include a cost estimate in the report. The report will calculate total squares with 15% waste.</p>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Price Per Square (CAD)</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input type="number" step="0.01" min="0" max="9999"
                  value="${state.formData.price_per_bundle || ''}"
                  oninput="updatePricePerBundle(this.value)"
                  class="w-full pl-8 pr-4 py-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
                  placeholder="e.g. 350" />
              </div>
              <p class="text-xs text-gray-400 mt-1">Cost per roofing square (100 sq ft)</p>
            </div>
            <div class="flex items-center justify-center">
              <div class="text-center p-3 bg-white rounded-lg border border-amber-200 w-full">
                <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Estimated Customer Cost</p>
                <p class="text-2xl font-bold ${state.formData.price_per_bundle ? 'text-amber-600' : 'text-gray-300'} mt-1" id="price-estimate-display">
                  ${state.formData.price_per_bundle ? '(calculated in report)' : '--'}
                </p>
                <p class="text-xs text-gray-400 mt-1">Based on roof area + 15% waste</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Roof Trace Summary (if traced) -->
        ${state.formData.roof_trace_json ? `
        <div class="bg-green-50 rounded-xl border border-green-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
            <i class="fas fa-draw-polygon text-green-500 mr-2"></i>Roof Trace Data
          </h4>
          <div class="grid grid-cols-4 gap-3 text-sm">
            <div class="text-center p-2 bg-white rounded-lg">
              <div class="font-bold text-green-600">${state.formData.roof_trace_json.eaves?.length || 0}</div>
              <div class="text-xs text-gray-500">Eave Points</div>
            </div>
            <div class="text-center p-2 bg-white rounded-lg">
              <div class="font-bold text-blue-600">${state.formData.roof_trace_json.ridges?.length || 0}</div>
              <div class="text-xs text-gray-500">Ridges</div>
            </div>
            <div class="text-center p-2 bg-white rounded-lg">
              <div class="font-bold text-amber-600">${state.formData.roof_trace_json.hips?.length || 0}</div>
              <div class="text-xs text-gray-500">Hips</div>
            </div>
            <div class="text-center p-2 bg-white rounded-lg">
              <div class="font-bold text-red-600">${state.formData.roof_trace_json.valleys?.length || 0}</div>
              <div class="text-xs text-gray-500">Valleys</div>
            </div>
          </div>
          <p class="text-xs text-green-600 mt-2"><i class="fas fa-check-circle mr-1"></i>Roof trace will be used for enhanced accuracy</p>
        </div>
        ` : `
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <p class="text-xs text-gray-400 flex items-center"><i class="fas fa-info-circle mr-1"></i>No roof trace provided — standard satellite analysis will be used</p>
        </div>
        `}
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

  // Step 2 is handled by its own confirm buttons
  if (state.currentStep === 2) return;

  if (state.currentStep < state.totalSteps) {
    state.currentStep++;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function prevStep() {
  if (state.currentStep === 2 && state.addressPhase === 'pin') {
    backToAddressPhase();
    return;
  }

  if (state.currentStep > 1) {
    // When going back to step 2, return to the trace phase (last phase completed)
    if (state.currentStep === 3) {
      state.currentStep = 2;
      state.addressPhase = 'trace';
    } else {
      state.currentStep--;
    }
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
      if (!state.formData.pinPlaced) return 'Please pin the exact roof on the satellite map';
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
  if (!state.formData.pinPlaced) errors.push('Roof pin not placed');
  if (!state.formData.homeowner_name) errors.push('Homeowner name required');
  if (!state.formData.requester_name) errors.push('Requester name required');

  if (errors.length > 0) {
    showToast(errors.join('. '), 'error');
    return;
  }

  state.submitting = true;
  render();

  try {
    // 1. Create the order (serialize trace data)
    const submitData = { ...state.formData };
    if (submitData.roof_trace_json && typeof submitData.roof_trace_json === 'object') {
      submitData.roof_trace_json = JSON.stringify(submitData.roof_trace_json);
    }
    const orderRes = await fetch(API + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitData)
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

    // 3. Generate report (real Solar API or mock)
    const reportRes = await fetch(API + `/api/reports/${orderData.order.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    showToast('Order placed successfully! Generating roof report...', 'success');

    // Redirect to confirmation page
    setTimeout(() => {
      window.location.href = `/order/${orderData.order.id}`;
    }, 1200);

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
