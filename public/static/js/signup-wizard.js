// ============================================================
// SIGNUP WIZARD — 3-Step Onboarding Flow
// Step 1: Business Info (name, company, email, phone, city, province, password)
// Step 2: Plan Selection (Starter / Professional / Enterprise)
// Step 3: Confirmation & Activation (trial starts, redirect to dashboard)
// ============================================================

(function() {
  'use strict';

  // ---- STATE ----
  let wizardState = {
    step: 1,
    name: '',
    company_name: '',
    email: '',
    phone: '',
    city: '',
    province: '',
    password: '',
    selectedTier: 'professional', // default highlight
    verificationToken: null,
    codeSent: false,
    codeVerified: false,
    processing: false
  };

  // ---- TIER DEFINITIONS ----
  const TIERS = {
    starter: {
      name: 'Starter',
      price: 49,
      period: '/mo',
      icon: 'fa-seedling',
      color: 'emerald',
      gradient: 'from-emerald-500 to-teal-500',
      badge: '',
      reports: '10 reports/mo',
      features: [
        { text: '10 Roof Reports per month', included: true },
        { text: 'Basic CRM (Customers + Invoices)', included: true },
        { text: 'Professional PDF Reports', included: true },
        { text: 'Email Report Delivery', included: true },
        { text: '3D Roof Visualizer', included: true },
        { text: 'Secretary AI', included: false },
        { text: 'Tiered Proposals (Good/Better/Best)', included: false },
        { text: 'Team Management', included: false },
        { text: 'White-Label Branding', included: false },
        { text: 'API Access', included: false }
      ]
    },
    professional: {
      name: 'Professional',
      price: 149,
      period: '/mo',
      icon: 'fa-crown',
      color: 'blue',
      gradient: 'from-blue-500 to-indigo-600',
      badge: 'MOST POPULAR',
      reports: '50 reports/mo',
      features: [
        { text: '50 Roof Reports per month', included: true },
        { text: 'Full CRM Suite (Customers, Invoices, Jobs, Pipeline)', included: true },
        { text: 'Professional PDF Reports', included: true },
        { text: 'Email Report Delivery', included: true },
        { text: '3D Roof Visualizer', included: true },
        { text: 'Roofer Secretary AI (LiveKit)', included: true },
        { text: 'Tiered Proposals (Good/Better/Best)', included: true },
        { text: 'AI Damage Assessment (Gemini)', included: true },
        { text: 'Team Management (up to 5 users)', included: true },
        { text: 'White-Label Branding', included: false }
      ]
    },
    enterprise: {
      name: 'Enterprise',
      price: 499,
      period: '/mo',
      icon: 'fa-building',
      color: 'purple',
      gradient: 'from-purple-500 to-pink-500',
      badge: 'BEST VALUE',
      reports: 'Unlimited',
      features: [
        { text: 'Unlimited Roof Reports', included: true },
        { text: 'Full CRM Suite + Advanced Pipeline', included: true },
        { text: 'Professional PDF Reports', included: true },
        { text: 'Priority Email Delivery', included: true },
        { text: '3D Roof Visualizer + AR Mode', included: true },
        { text: 'Roofer Secretary AI (Priority)', included: true },
        { text: 'Tiered Proposals (Good/Better/Best)', included: true },
        { text: 'AI Damage Assessment (Gemini)', included: true },
        { text: 'Unlimited Team Members', included: true },
        { text: 'White-Label Branding + Custom Domain', included: true }
      ]
    }
  };

  const PROVINCES = [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland & Labrador', 'Northwest Territories', 'Nova Scotia',
    'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'
  ];

  // ---- INIT ----
  document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    const c = localStorage.getItem('rc_customer');
    if (c) { window.location.href = '/customer/dashboard'; return; }
    renderWizard();
  });

  // ---- RENDER ----
  function renderWizard() {
    const root = document.getElementById('wizard-root');
    if (!root) return;

    root.innerHTML = `
      <!-- Progress Bar -->
      ${renderProgressBar()}
      
      <!-- Step Content -->
      <div id="wizard-step-content" class="transition-all duration-300">
        ${wizardState.step === 1 ? renderStep1() : ''}
        ${wizardState.step === 2 ? renderStep2() : ''}
        ${wizardState.step === 3 ? renderStep3() : ''}
      </div>
    `;

    // Attach event listeners after render
    attachListeners();
  }

  function renderProgressBar() {
    const steps = [
      { num: 1, label: 'Business Info', icon: 'fa-building' },
      { num: 2, label: 'Choose Plan', icon: 'fa-crown' },
      { num: 3, label: 'Get Started', icon: 'fa-rocket' }
    ];

    return `
    <div class="mb-8">
      <div class="flex items-center justify-between max-w-lg mx-auto">
        ${steps.map((s, i) => `
          <div class="flex flex-col items-center relative ${i < steps.length - 1 ? 'flex-1' : ''}">
            <div class="flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300 ${
              wizardState.step > s.num ? 'bg-green-500 border-green-500 text-white' :
              wizardState.step === s.num ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110' :
              'bg-white border-gray-300 text-gray-400'
            }">
              ${wizardState.step > s.num ? '<i class="fas fa-check text-sm"></i>' : `<i class="fas ${s.icon} text-sm"></i>`}
            </div>
            <span class="text-xs mt-2 font-medium ${
              wizardState.step >= s.num ? 'text-gray-800' : 'text-gray-400'
            } hidden sm:block">${s.label}</span>
            ${i < steps.length - 1 ? `
              <div class="absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-0.5 ${
                wizardState.step > s.num ? 'bg-green-500' : 'bg-gray-200'
              }"></div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  // ---- STEP 1: Business Info ----
  function renderStep1() {
    return `
    <div class="bg-white rounded-2xl shadow-xl overflow-hidden max-w-lg mx-auto animate-fadeIn">
      <div class="bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-5">
        <h2 class="text-xl font-bold text-white"><i class="fas fa-building mr-2"></i>Tell Us About Your Business</h2>
        <p class="text-blue-100 text-sm mt-1">Start generating professional roof reports in minutes</p>
      </div>
      <div class="p-8">
        <!-- Email Verification Section -->
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Full Name <span class="text-red-500">*</span></label>
              <input type="text" id="wiz-name" value="${esc(wizardState.name)}" placeholder="John Smith" 
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
              <input type="text" id="wiz-company" value="${esc(wizardState.company_name)}" placeholder="Smith Roofing Ltd."
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Email <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
              <input type="email" id="wiz-email" value="${esc(wizardState.email)}" placeholder="you@company.com"
                class="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all ${wizardState.codeVerified ? 'bg-green-50 border-green-400' : ''}"
                ${wizardState.codeSent ? 'readonly' : ''}>
              ${!wizardState.codeVerified ? `
                <button id="wiz-send-code" onclick="window._wizSendCode()" 
                  class="px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-sm whitespace-nowrap transition-all shadow-sm">
                  <i class="fas fa-paper-plane mr-1"></i>${wizardState.codeSent ? 'Resend' : 'Verify'}
                </button>
              ` : `
                <span class="px-4 py-3 bg-green-100 text-green-700 font-semibold rounded-xl text-sm flex items-center">
                  <i class="fas fa-check-circle mr-1"></i>Verified
                </span>
              `}
            </div>
          </div>

          <!-- Verification Code (shown after sending) -->
          ${wizardState.codeSent && !wizardState.codeVerified ? `
          <div id="wiz-code-section" class="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p class="text-sm text-blue-800 mb-3"><i class="fas fa-envelope-open-text mr-1"></i> Enter the 6-digit code sent to <strong>${esc(wizardState.email)}</strong></p>
            <div class="flex gap-2 items-center">
              <input type="text" id="wiz-code" maxlength="6" placeholder="000000"
                class="w-36 px-4 py-3 border border-gray-300 rounded-xl text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-blue-500"
                oninput="this.value=this.value.replace(/[^0-9]/g,'')">
              <button id="wiz-verify-btn" onclick="window._wizVerifyCode()"
                class="px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm transition-all">
                <i class="fas fa-check mr-1"></i>Verify
              </button>
            </div>
            <div id="wiz-code-error" class="hidden mt-2 text-sm text-red-600"></div>
            <div id="wiz-code-fallback" class="hidden mt-2"></div>
          </div>
          ` : ''}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
              <input type="tel" id="wiz-phone" value="${esc(wizardState.phone)}" placeholder="(780) 555-1234"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Province</label>
              <select id="wiz-province" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all bg-white">
                <option value="">Select province...</option>
                ${PROVINCES.map(p => `<option value="${p}" ${wizardState.province === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">City</label>
            <input type="text" id="wiz-city" value="${esc(wizardState.city)}" placeholder="Edmonton"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Password <span class="text-red-500">*</span></label>
              <input type="password" id="wiz-password" placeholder="Min 8 characters"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">Confirm Password <span class="text-red-500">*</span></label>
              <input type="password" id="wiz-confirm" placeholder="Confirm password"
                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all">
            </div>
          </div>

          <!-- Password Strength -->
          <div id="wiz-pw-strength" class="hidden">
            <div class="flex gap-1">
              <div class="h-1 flex-1 rounded-full bg-gray-200" id="pw-bar-1"></div>
              <div class="h-1 flex-1 rounded-full bg-gray-200" id="pw-bar-2"></div>
              <div class="h-1 flex-1 rounded-full bg-gray-200" id="pw-bar-3"></div>
              <div class="h-1 flex-1 rounded-full bg-gray-200" id="pw-bar-4"></div>
            </div>
            <p class="text-xs mt-1" id="pw-label"></p>
          </div>
        </div>

        <div id="wiz-step1-error" class="hidden mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"></div>

        <button id="wiz-next-1" onclick="window._wizGoStep2()" 
          class="w-full mt-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all hover:scale-[1.01] shadow-lg shadow-blue-500/25 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          ${!wizardState.codeVerified ? 'disabled' : ''}>
          Continue to Plan Selection <i class="fas fa-arrow-right ml-2"></i>
        </button>

        <p class="text-center text-sm text-gray-500 mt-4">
          Already have an account? <a href="/customer/login" class="text-blue-600 font-semibold hover:underline">Sign in</a>
        </p>
      </div>
    </div>`;
  }

  // ---- STEP 2: Plan Selection ----
  function renderStep2() {
    return `
    <div class="max-w-5xl mx-auto animate-fadeIn">
      <div class="text-center mb-8">
        <h2 class="text-2xl sm:text-3xl font-bold text-gray-800">Choose Your Plan</h2>
        <p class="text-gray-500 mt-2">All plans include a <strong class="text-green-600">14-day free trial</strong> — no credit card required</p>
      </div>

      <!-- Tier Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        ${Object.entries(TIERS).map(([key, tier]) => renderTierCard(key, tier)).join('')}
      </div>

      <!-- Feature Comparison Table (collapsible) -->
      <div class="mb-8">
        <button onclick="window._wizToggleCompare()" class="text-sm text-blue-600 font-semibold hover:underline flex items-center gap-1 mx-auto">
          <i class="fas fa-table mr-1"></i>View Full Feature Comparison
          <i class="fas fa-chevron-down" id="compare-chevron"></i>
        </button>
        <div id="compare-table" class="hidden mt-4">
          ${renderComparisonTable()}
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between max-w-lg mx-auto">
        <button onclick="window._wizGoStep(1)" class="px-6 py-3 border border-gray-300 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-all text-sm">
          <i class="fas fa-arrow-left mr-2"></i>Back
        </button>
        <button id="wiz-next-2" onclick="window._wizGoStep3()"
          class="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all hover:scale-[1.01] shadow-lg shadow-blue-500/25 text-sm">
          Start Free Trial <i class="fas fa-arrow-right ml-2"></i>
        </button>
      </div>
    </div>`;
  }

  function renderTierCard(key, tier) {
    const isSelected = wizardState.selectedTier === key;
    const isPro = key === 'professional';

    return `
    <div onclick="window._wizSelectTier('${key}')" 
      class="relative cursor-pointer rounded-2xl border-2 transition-all duration-300 ${
        isSelected 
          ? `border-${tier.color}-500 shadow-xl shadow-${tier.color}-500/20 scale-[1.02] ring-2 ring-${tier.color}-500/30` 
          : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
      } bg-white overflow-hidden">
      
      ${tier.badge ? `
        <div class="absolute top-0 right-0 bg-gradient-to-r ${tier.gradient} text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
          ${tier.badge}
        </div>
      ` : ''}

      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${tier.gradient} flex items-center justify-center">
            <i class="fas ${tier.icon} text-white text-lg"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-gray-800">${tier.name}</h3>
            <p class="text-xs text-gray-500">${tier.reports}</p>
          </div>
        </div>

        <div class="mb-5">
          <span class="text-4xl font-extrabold text-gray-900">$${tier.price}</span>
          <span class="text-gray-500 text-sm">${tier.period}</span>
        </div>

        <ul class="space-y-2.5 mb-6">
          ${tier.features.map(f => `
            <li class="flex items-start gap-2 text-sm">
              <i class="fas ${f.included ? 'fa-check text-green-500' : 'fa-times text-gray-300'} mt-0.5 w-4 text-center"></i>
              <span class="${f.included ? 'text-gray-700' : 'text-gray-400'}">${f.text}</span>
            </li>
          `).join('')}
        </ul>

        <div class="w-full py-2.5 rounded-xl text-center font-semibold text-sm transition-all ${
          isSelected
            ? `bg-gradient-to-r ${tier.gradient} text-white`
            : 'bg-gray-100 text-gray-600'
        }">
          ${isSelected ? '<i class="fas fa-check-circle mr-1"></i>Selected' : 'Select Plan'}
        </div>
      </div>
    </div>`;
  }

  function renderComparisonTable() {
    const features = [
      { label: 'Monthly Reports', starter: '10', pro: '50', enterprise: 'Unlimited' },
      { label: 'CRM Suite', starter: 'Basic', pro: 'Full', enterprise: 'Full + API' },
      { label: '3D Visualizer', starter: true, pro: true, enterprise: true },
      { label: 'PDF Reports', starter: true, pro: true, enterprise: true },
      { label: 'Email Delivery', starter: true, pro: true, enterprise: 'Priority' },
      { label: 'Secretary AI', starter: false, pro: true, enterprise: 'Priority' },
      { label: 'Tiered Proposals', starter: false, pro: true, enterprise: true },
      { label: 'AI Damage Report', starter: false, pro: true, enterprise: true },
      { label: 'Team Management', starter: false, pro: 'Up to 5', enterprise: 'Unlimited' },
      { label: 'White-Label', starter: false, pro: false, enterprise: true },
      { label: 'Custom Domain', starter: false, pro: false, enterprise: true },
      { label: 'API Access', starter: false, pro: false, enterprise: true },
      { label: 'Priority Support', starter: false, pro: false, enterprise: true },
    ];

    return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-4 py-3 font-semibold text-gray-700">Feature</th>
            <th class="text-center px-4 py-3 font-semibold text-emerald-600">Starter</th>
            <th class="text-center px-4 py-3 font-semibold text-blue-600">Professional</th>
            <th class="text-center px-4 py-3 font-semibold text-purple-600">Enterprise</th>
          </tr>
        </thead>
        <tbody>
          ${features.map((f, i) => `
            <tr class="${i % 2 ? 'bg-gray-50/50' : 'bg-white'}">
              <td class="px-4 py-2.5 font-medium text-gray-700">${f.label}</td>
              <td class="text-center px-4 py-2.5">${cellVal(f.starter)}</td>
              <td class="text-center px-4 py-2.5">${cellVal(f.pro)}</td>
              <td class="text-center px-4 py-2.5">${cellVal(f.enterprise)}</td>
            </tr>
          `).join('')}
          <tr class="bg-gray-100 font-bold">
            <td class="px-4 py-3">Price</td>
            <td class="text-center px-4 py-3 text-emerald-600">$49/mo</td>
            <td class="text-center px-4 py-3 text-blue-600">$149/mo</td>
            <td class="text-center px-4 py-3 text-purple-600">$499/mo</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  function cellVal(v) {
    if (v === true) return '<i class="fas fa-check text-green-500"></i>';
    if (v === false) return '<i class="fas fa-times text-gray-300"></i>';
    return `<span class="text-gray-700">${v}</span>`;
  }

  // ---- STEP 3: Confirmation ----
  function renderStep3() {
    const tier = TIERS[wizardState.selectedTier];
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const trialEndStr = trialEnd.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

    return `
    <div class="max-w-lg mx-auto animate-fadeIn">
      <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
        <div class="bg-gradient-to-r ${tier.gradient} px-8 py-6 text-center">
          <div class="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <i class="fas ${tier.icon} text-white text-2xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-white">You're Almost There!</h2>
          <p class="text-white/80 text-sm mt-1">Review your plan and start your free trial</p>
        </div>

        <div class="p-8">
          <!-- Account Summary -->
          <div class="space-y-4 mb-6">
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-sm text-gray-600"><i class="fas fa-user mr-2 text-gray-400"></i>Account</span>
              <span class="text-sm font-semibold text-gray-800">${esc(wizardState.name)}</span>
            </div>
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-sm text-gray-600"><i class="fas fa-envelope mr-2 text-gray-400"></i>Email</span>
              <span class="text-sm font-semibold text-gray-800">${esc(wizardState.email)}</span>
            </div>
            ${wizardState.company_name ? `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-sm text-gray-600"><i class="fas fa-building mr-2 text-gray-400"></i>Company</span>
              <span class="text-sm font-semibold text-gray-800">${esc(wizardState.company_name)}</span>
            </div>
            ` : ''}
          </div>

          <!-- Plan Summary -->
          <div class="border-2 border-dashed border-gray-200 rounded-xl p-5 mb-6">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${tier.gradient} flex items-center justify-center">
                  <i class="fas ${tier.icon} text-white"></i>
                </div>
                <div>
                  <p class="font-bold text-gray-800">${tier.name} Plan</p>
                  <p class="text-xs text-gray-500">${tier.reports}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold text-gray-800">$${tier.price}</p>
                <p class="text-xs text-gray-500">per month</p>
              </div>
            </div>
            
            <div class="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
              <p class="text-sm text-green-800 font-semibold">
                <i class="fas fa-gift mr-1"></i> 14-Day Free Trial
              </p>
              <p class="text-xs text-green-600 mt-0.5">
                No charge until ${trialEndStr}. Cancel anytime.
              </p>
            </div>
          </div>

          <div id="wiz-step3-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"></div>

          <!-- CTA -->
          <button id="wiz-activate" onclick="window._wizActivate()"
            class="w-full py-4 bg-gradient-to-r ${tier.gradient} hover:opacity-90 text-white font-bold rounded-xl transition-all hover:scale-[1.01] shadow-lg text-base disabled:opacity-50 disabled:cursor-not-allowed">
            <i class="fas fa-rocket mr-2"></i>Start My Free Trial
          </button>

          <p class="text-center text-xs text-gray-400 mt-4">
            By creating an account, you agree to our <a href="/terms" class="text-blue-500 hover:underline">Terms of Service</a> 
            and <a href="/privacy" class="text-blue-500 hover:underline">Privacy Policy</a>
          </p>

          <button onclick="window._wizGoStep(2)" class="w-full mt-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium">
            <i class="fas fa-arrow-left mr-1"></i>Change plan
          </button>
        </div>
      </div>
    </div>`;
  }

  // ---- EVENT HANDLERS ----
  function attachListeners() {
    // Password strength indicator
    const pwInput = document.getElementById('wiz-password');
    if (pwInput) {
      pwInput.addEventListener('input', function() {
        updatePasswordStrength(this.value);
      });
    }
  }

  function updatePasswordStrength(pw) {
    const container = document.getElementById('wiz-pw-strength');
    if (!container) return;
    if (!pw) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');

    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
    const labelColors = ['text-red-600', 'text-orange-600', 'text-yellow-600', 'text-green-600'];

    for (let i = 1; i <= 4; i++) {
      const bar = document.getElementById('pw-bar-' + i);
      if (bar) {
        bar.className = 'h-1 flex-1 rounded-full transition-all ' + (i <= score ? colors[score - 1] : 'bg-gray-200');
      }
    }
    const label = document.getElementById('pw-label');
    if (label) {
      label.textContent = labels[score - 1] || '';
      label.className = 'text-xs mt-1 ' + (labelColors[score - 1] || 'text-gray-500');
    }
  }

  // ---- GLOBAL FUNCTIONS (exposed to window) ----

  // Send verification code
  window._wizSendCode = async function() {
    const name = document.getElementById('wiz-name')?.value?.trim();
    const email = document.getElementById('wiz-email')?.value?.trim();
    const errEl = document.getElementById('wiz-step1-error');

    if (!name) { showError(errEl, 'Please enter your name first.'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { 
      showError(errEl, 'Please enter a valid email address.'); return; 
    }

    wizardState.name = name;
    wizardState.email = email;

    const btn = document.getElementById('wiz-send-code');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Sending...'; }
    hideError(errEl);

    try {
      const res = await fetch('/api/customer/send-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        wizardState.codeSent = true;
        renderWizard();

        // Handle fallback code (email not configured)
        if (data.email_sent === false && data.fallback_code) {
          const fb = document.getElementById('wiz-code-fallback');
          if (fb) {
            fb.innerHTML = '<div class="p-2 bg-amber-50 border border-amber-200 rounded-lg">'
              + '<p class="text-xs text-amber-700"><i class="fas fa-info-circle mr-1"></i>Email delivery unavailable. Use this code:</p>'
              + '<p class="font-mono text-xl font-bold text-blue-700 tracking-widest mt-1">' + data.fallback_code + '</p></div>';
            fb.classList.remove('hidden');
          }
        }

        // Start cooldown on send button
        startCooldown();
      } else {
        showError(errEl, data.error || 'Failed to send verification code.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Verify'; }
      }
    } catch (e) {
      showError(errEl, 'Network error. Please try again.');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Verify'; }
    }
  };

  // Verify code
  window._wizVerifyCode = async function() {
    const code = document.getElementById('wiz-code')?.value?.trim();
    const errEl = document.getElementById('wiz-code-error');
    
    if (!code || code.length !== 6) { showError(errEl, 'Enter the 6-digit code.'); return; }

    const btn = document.getElementById('wiz-verify-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>...'; }
    hideError(errEl);

    try {
      const res = await fetch('/api/customer/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: wizardState.email, code })
      });
      const data = await res.json();
      
      if (res.ok && data.verified) {
        wizardState.verificationToken = data.verification_token;
        wizardState.codeVerified = true;
        renderWizard();
      } else {
        showError(errEl, data.error || 'Invalid code.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verify'; }
      }
    } catch (e) {
      showError(errEl, 'Network error.');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verify'; }
    }
  };

  // Go to Step 2
  window._wizGoStep2 = function() {
    const name = document.getElementById('wiz-name')?.value?.trim();
    const company = document.getElementById('wiz-company')?.value?.trim();
    const phone = document.getElementById('wiz-phone')?.value?.trim();
    const city = document.getElementById('wiz-city')?.value?.trim();
    const province = document.getElementById('wiz-province')?.value;
    const password = document.getElementById('wiz-password')?.value;
    const confirm = document.getElementById('wiz-confirm')?.value;
    const errEl = document.getElementById('wiz-step1-error');

    // Validate
    if (!name) { showError(errEl, 'Full name is required.'); return; }
    if (!wizardState.codeVerified) { showError(errEl, 'Please verify your email first.'); return; }
    if (!password || password.length < 8) { showError(errEl, 'Password must be at least 8 characters.'); return; }
    if (password !== confirm) { showError(errEl, 'Passwords do not match.'); return; }

    // Save state
    wizardState.name = name;
    wizardState.company_name = company || '';
    wizardState.phone = phone || '';
    wizardState.city = city || '';
    wizardState.province = province || '';
    wizardState.password = password;
    wizardState.step = 2;
    renderWizard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Select tier
  window._wizSelectTier = function(tier) {
    wizardState.selectedTier = tier;
    renderWizard();
  };

  // Toggle comparison table
  window._wizToggleCompare = function() {
    const table = document.getElementById('compare-table');
    const chevron = document.getElementById('compare-chevron');
    if (table) { 
      table.classList.toggle('hidden'); 
      if (chevron) chevron.classList.toggle('fa-chevron-up');
    }
  };

  // Go to Step 3
  window._wizGoStep3 = function() {
    wizardState.step = 3;
    renderWizard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Go to specific step
  window._wizGoStep = function(step) {
    wizardState.step = step;
    renderWizard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Activate account
  window._wizActivate = async function() {
    if (wizardState.processing) return;
    wizardState.processing = true;

    const btn = document.getElementById('wiz-activate');
    const errEl = document.getElementById('wiz-step3-error');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating your account...'; }
    hideError(errEl);

    const tierLimits = { starter: 10, professional: 50, enterprise: 9999 };

    try {
      // Step 1: Register the account
      const regRes = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: wizardState.email,
          password: wizardState.password,
          name: wizardState.name,
          phone: wizardState.phone,
          company_name: wizardState.company_name,
          verification_token: wizardState.verificationToken
        })
      });
      const regData = await regRes.json();

      if (!regRes.ok || !regData.success) {
        showError(errEl, regData.error || 'Account creation failed.');
        wizardState.processing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start My Free Trial'; }
        return;
      }

      // Save auth tokens
      localStorage.setItem('rc_customer', JSON.stringify(regData.customer));
      localStorage.setItem('rc_customer_token', regData.token);

      // Step 2: Set subscription tier
      try {
        await fetch('/api/customer/set-tier', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + regData.token
          },
          body: JSON.stringify({
            tier: wizardState.selectedTier,
            city: wizardState.city,
            province: wizardState.province
          })
        });
      } catch (e) {
        // Non-critical — tier defaults to starter
        console.warn('Tier set failed:', e);
      }

      // Step 3: Show success animation then redirect
      showSuccessAndRedirect();

    } catch (e) {
      showError(errEl, 'Network error. Please try again.');
      wizardState.processing = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start My Free Trial'; }
    }
  };

  function showSuccessAndRedirect() {
    const root = document.getElementById('wizard-root');
    if (!root) return;

    const tier = TIERS[wizardState.selectedTier];
    root.innerHTML = `
    <div class="max-w-lg mx-auto text-center animate-fadeIn">
      <div class="bg-white rounded-2xl shadow-xl p-10">
        <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <i class="fas fa-check text-green-600 text-3xl"></i>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Welcome to RoofReporterAI!</h2>
        <p class="text-gray-500 mb-6">Your ${tier.name} account is ready. Let's generate your first roof report.</p>
        
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
          <p class="text-sm font-semibold text-blue-800 mb-2"><i class="fas fa-gift mr-1"></i>Your Free Trial Includes:</p>
          <ul class="text-sm text-blue-700 space-y-1">
            <li><i class="fas fa-check mr-1 text-blue-500"></i>3 free roof reports to start</li>
            <li><i class="fas fa-check mr-1 text-blue-500"></i>Full CRM access</li>
            <li><i class="fas fa-check mr-1 text-blue-500"></i>14 days to explore all features</li>
          </ul>
        </div>

        <div class="w-full bg-gray-200 rounded-full h-1.5 mb-2">
          <div id="redirect-bar" class="bg-blue-600 h-1.5 rounded-full transition-all duration-100" style="width: 0%"></div>
        </div>
        <p class="text-xs text-gray-400">Redirecting to your dashboard...</p>
      </div>
    </div>`;

    // Animate progress bar, then redirect
    let pct = 0;
    const bar = document.getElementById('redirect-bar');
    const iv = setInterval(function() {
      pct += 4;
      if (bar) bar.style.width = pct + '%';
      if (pct >= 100) {
        clearInterval(iv);
        window.location.href = '/customer/dashboard';
      }
    }, 80);
  }

  // ---- HELPERS ----
  function showError(el, msg) { if (el) { el.textContent = msg; el.classList.remove('hidden'); } }
  function hideError(el) { if (el) el.classList.add('hidden'); }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function startCooldown() {
    const btn = document.getElementById('wiz-send-code');
    if (!btn) return;
    let cd = 60;
    btn.disabled = true;
    const iv = setInterval(function() {
      cd--;
      btn.innerHTML = '<i class="fas fa-clock mr-1"></i>' + cd + 's';
      if (cd <= 0) {
        clearInterval(iv);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Resend';
      }
    }, 1000);
  }

})();
