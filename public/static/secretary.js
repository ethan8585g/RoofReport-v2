// ============================================================
// Roofer Secretary — AI Phone Answering Service Frontend
// v2.0: Full telephony integration with phone connection wizard
// Flow: Subscribe → Configure → Connect Phone → Activate
// ============================================================
(function() {
  'use strict';
  var root = document.getElementById('secretary-root');
  if (!root) return;

  function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
  function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }
  function authOnly() { return { 'Authorization': 'Bearer ' + getToken() }; }

  var state = {
    loading: true,
    subscription: null,
    hasActive: false,
    config: null,
    directories: [],
    totalCalls: 0,
    isConfigured: false,
    isActive: false,
    calls: [],
    activeTab: 'setup',
    saving: false,
    // Mode
    secretaryMode: 'directory',
    // Messages (answering mode)
    messages: [],
    unreadCount: 0,
    // Appointments (full mode)
    appointments: [],
    pendingAppts: 0,
    // Callbacks (full mode)
    callbacks: [],
    pendingCallbacks: 0,
    // Phone connection state
    phoneSetup: null,
    carriers: [],
    selectedCarrier: '',
    connectStep: 1,
    // Quick Connect state
    quickConnect: {},
  };

  // ── On load: check for Square redirect, then fetch status ──
  async function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'true' && params.get('session_id')) {
      try {
        await fetch('/api/secretary/verify-session', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ session_id: params.get('session_id') })
        });
      } catch(e) {}
      window.history.replaceState({}, '', '/customer/secretary');
    }
    await loadStatus();
    await loadCarriers();
  }

  async function loadStatus() {
    state.loading = true;
    render();
    try {
      var res = await fetch('/api/secretary/status', { headers: authOnly() });
      if (res.ok) {
        var data = await res.json();
        state.subscription = data.subscription;
        state.hasActive = data.has_active_subscription;
        state.config = data.config;
        state.directories = data.directories || [];
        state.totalCalls = data.total_calls;
        state.isConfigured = data.is_configured;
        state.isActive = data.is_active;
        state.secretaryMode = data.secretary_mode || (data.config && data.config.secretary_mode) || 'directory';
      }
    } catch(e) { console.error('Failed to load status', e); }

    // Load phone setup status
    try {
      var res2 = await fetch('/api/secretary/phone-setup', { headers: authOnly() });
      if (res2.ok) {
        var data2 = await res2.json();
        state.phoneSetup = data2.setup;
        if (data2.setup) {
          state.selectedCarrier = data2.setup.carrier_name || '';
        }
      }
    } catch(e) {}

    // Load quick-connect status for the new simplified flow
    try {
      var res3 = await fetch('/api/secretary/quick-connect/status', { headers: authOnly() });
      if (res3.ok) {
        var qcData = await res3.json();
        if (qcData.ai_phone_number) {
          state.quickConnect = state.quickConnect || {};
          state.quickConnect.ai_phone_number = qcData.ai_phone_number;
          state.quickConnect.ai_phone_display = qcData.ai_phone_display;
          state.quickConnect.business_phone = qcData.business_phone;
          state.quickConnect.business_phone_display = qcData.business_phone_display;
          state.quickConnect.connected = qcData.status === 'connected';
        }
      }
    } catch(e) {}

    state.loading = false;
    render();
  }

  async function loadCarriers() {
    try {
      var res = await fetch('/api/secretary/carriers', { headers: authOnly() });
      if (res.ok) {
        var data = await res.json();
        state.carriers = data.carriers || [];
      }
    } catch(e) {}
  }

  // ── RENDER ──
  function render() {
    if (state.loading) {
      root.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-3xl text-sky-500"></i></div>';
      return;
    }
    if (!state.hasActive) { renderSubscriptionPage(); return; }

    root.innerHTML =
      '<div class="flex flex-wrap gap-2 mb-6">' +
        tabBtn('setup', 'fa-cog', 'Setup & Config') +
        tabBtn('connect', 'fa-phone-alt', 'Connect Phone') +
        (state.secretaryMode === 'answering' ? tabBtn('messages', 'fa-envelope', 'Messages' + (state.unreadCount > 0 ? ' (' + state.unreadCount + ')' : '')) : '') +
        (state.secretaryMode === 'full' ? tabBtn('appointments', 'fa-calendar-check', 'Appointments' + (state.pendingAppts > 0 ? ' (' + state.pendingAppts + ')' : '')) : '') +
        (state.secretaryMode === 'full' ? tabBtn('callbacks', 'fa-phone-volume', 'Callbacks' + (state.pendingCallbacks > 0 ? ' (' + state.pendingCallbacks + ')' : '')) : '') +
        tabBtn('calls', 'fa-history', 'Call Log' + (state.totalCalls > 0 ? ' (' + state.totalCalls + ')' : '')) +
      '</div>' +
      '<div id="secContent"></div>';

    if (state.activeTab === 'setup') renderSetupTab();
    else if (state.activeTab === 'connect') renderConnectTab();
    else if (state.activeTab === 'messages') loadAndRenderMessages();
    else if (state.activeTab === 'appointments') loadAndRenderAppointments();
    else if (state.activeTab === 'callbacks') loadAndRenderCallbacks();
    else if (state.activeTab === 'calls') renderCallsTab();
  }

  function tabBtn(id, icon, label) {
    var active = state.activeTab === id;
    var isConnect = id === 'connect';
    var needsAttention = isConnect && state.phoneSetup && state.phoneSetup.connection_status !== 'connected';
    return '<button onclick="secSetTab(\'' + id + '\')" class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ' +
      (active ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg' :
       needsAttention ? 'bg-amber-50 text-amber-700 border-2 border-amber-300 animate-pulse' :
       'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200') +
      '"><i class="fas ' + icon + ' text-xs"></i>' + label +
      (needsAttention ? ' <span class="w-2 h-2 bg-amber-500 rounded-full"></span>' : '') +
      '</button>';
  }
  window.secSetTab = function(t) { state.activeTab = t; render(); if (t === 'calls') loadCalls(); if (t === 'messages') loadAndRenderMessages(); if (t === 'appointments') loadAndRenderAppointments(); if (t === 'callbacks') loadAndRenderCallbacks(); };

  // ============================================================
  // SUBSCRIPTION PAGE
  // ============================================================
  function renderSubscriptionPage() {
    root.innerHTML =
      '<div class="max-w-2xl mx-auto">' +
        '<div class="bg-gradient-to-br from-sky-500 to-blue-700 rounded-2xl p-8 text-white text-center mb-8 shadow-xl">' +
          '<div class="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4"><i class="fas fa-headset text-4xl"></i></div>' +
          '<h2 class="text-3xl font-extrabold mb-2">Roofer Secretary</h2>' +
          '<p class="text-sky-100 text-lg">AI-Powered Phone Answering Service</p>' +
          '<p class="text-sky-200 text-sm mt-2">Never miss a customer call again. AI answers <strong>only when you can\'t</strong> — your phone rings first. Works with your existing business number.</p>' +
        '</div>' +

        '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
          '<h3 class="font-bold text-gray-800 text-lg mb-4"><i class="fas fa-check-circle text-green-500 mr-2"></i>What You Get</h3>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
            feature('fa-phone-alt', 'Keep Your Number', 'Connects to your existing business phone — no new number needed') +
            feature('fa-user-clock', 'Answers Only If You Can\'t', 'Your phone rings first. AI only picks up when you miss or are busy — like a real secretary') +
            feature('fa-sms', 'SMS Call Summary', 'Get a text with a full transcript and summary after every AI-handled call') +
            feature('fa-route', 'Smart Routing', 'Route callers to Parts, Sales, Service, etc.') +
            feature('fa-comment-dots', 'Custom Greeting', 'Your business, your script, your personality') +
            feature('fa-question-circle', 'FAQ Handling', 'AI answers common questions automatically') +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
          '<h3 class="font-bold text-gray-800 text-lg mb-4"><i class="fas fa-plug text-sky-500 mr-2"></i>How It Works</h3>' +
          '<div class="space-y-4">' +
            howStep(1, 'Subscribe & Configure', 'Set up your AI secretary with your greeting script, FAQ answers, and call routing departments.') +
            howStep(2, 'Connect Via Text', 'Enter your business phone number and verify with a text message. That\'s it — your AI secretary goes live instantly.') +
            howStep(3, 'AI Answers When You Can\'t', 'Your phone rings first. If you don\'t answer or you\'re on another call, the AI picks up. It greets the caller, answers questions, routes to departments, and takes messages.') +
            howStep(4, 'Get SMS Summary + Call Log', 'After every AI-handled call, you receive a text message with the caller info, transcript summary, and which department was selected. Full logs always in your dashboard.') +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded-2xl border-2 border-sky-500 shadow-lg p-6 mb-6">' +
          '<div class="flex items-center justify-between mb-4">' +
            '<div><h3 class="font-bold text-gray-800 text-xl">Monthly Subscription</h3><p class="text-gray-500 text-sm">Cancel anytime. No contracts.</p></div>' +
            '<div class="text-right"><div class="text-4xl font-extrabold text-gray-900">$249<span class="text-lg font-normal text-gray-500">/mo</span></div><p class="text-xs text-gray-400">CAD or USD + applicable taxes</p></div>' +
          '</div>' +
          '<div class="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-4">' +
            '<p class="text-sm text-sky-700"><i class="fas fa-info-circle mr-1"></i>Includes unlimited AI-answered calls, SMS transcript summaries after every call, smart routing, and no-answer coverage. Works with any Canadian carrier.</p>' +
          '</div>' +
          '<button onclick="secSubscribe()" id="subscribeBtn" class="w-full py-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-bold text-lg hover:from-sky-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl">' +
            '<i class="fas fa-lock mr-2"></i>Subscribe & Setup — $249/month</button>' +
        '</div>' +
        '<p class="text-center text-xs text-gray-400 mb-8"><i class="fas fa-shield-alt mr-1"></i>Secure payment via Square &bull; Powered by LiveKit AI</p>' +
      '</div>';
  }

  function feature(icon, title, desc) {
    return '<div class="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">' +
      '<div class="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><i class="fas ' + icon + ' text-sky-600 text-sm"></i></div>' +
      '<div><p class="font-semibold text-gray-800 text-sm">' + title + '</p><p class="text-gray-500 text-xs">' + desc + '</p></div></div>';
  }

  function howStep(num, title, desc) {
    return '<div class="flex items-start gap-4">' +
      '<div class="w-10 h-10 bg-sky-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-lg">' + num + '</div>' +
      '<div><p class="font-semibold text-gray-800">' + title + '</p><p class="text-gray-500 text-sm">' + desc + '</p></div></div>';
  }

  window.secSubscribe = async function() {
    var btn = document.getElementById('subscribeBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Redirecting to Square...'; }
    try {
      var res = await fetch('/api/secretary/subscribe', { method: 'POST', headers: authHeaders() });
      var data = await res.json();
      if (data.checkout_url) { window.location.href = data.checkout_url; }
      else { alert(data.error || 'Failed to create subscription'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-lock mr-2"></i>Subscribe & Setup — $249/month'; } }
    } catch(e) { alert('Network error. Please try again.'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-lock mr-2"></i>Subscribe & Setup — $249/month'; } }
  };

  // ============================================================
  // SETUP TAB — Config form + Directories (existing, streamlined)
  // ============================================================
  function renderSetupTab() {
    var c = state.config || {};
    var dirs = state.directories.length > 0 ? state.directories : [
      { name: 'Sales / Estimates', phone_or_action: '(780) 555-0101', special_notes: 'Free estimates, new roof quotes, storm damage assessments. Available Mon-Fri 8am-5pm.' },
      { name: 'Service / Repairs', phone_or_action: '(780) 555-0102', special_notes: 'Emergency leak repairs, shingle replacement, flashing repairs. 24/7 emergency line.' },
      { name: 'Office / Billing', phone_or_action: 'Take a message', special_notes: 'Invoice questions, payment arrangements, warranty claims. Office hours Mon-Fri 9am-4pm.' },
    ];

    var content = document.getElementById('secContent');
    if (!content) return;

    // Status bar
    var statusHtml = '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">' +
      '<div class="flex items-center justify-between flex-wrap gap-3">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-full flex items-center justify-center ' + (state.isActive ? 'bg-green-100' : 'bg-gray-100') + '">' +
            '<i class="fas ' + (state.isActive ? 'fa-check-circle text-green-600' : 'fa-pause-circle text-gray-400') + ' text-lg"></i></div>' +
          '<div><p class="font-bold text-gray-800">' + (state.isActive ? 'Service ACTIVE' : 'Service PAUSED') + '</p>' +
            '<p class="text-xs text-gray-500">' +
              (state.phoneSetup?.connection_status === 'connected' ? '<span class="text-green-600"><i class="fas fa-link mr-1"></i>Phone Connected</span>' :
               state.phoneSetup?.assigned_phone_number ? '<span class="text-amber-600"><i class="fas fa-exclamation-triangle mr-1"></i>Phone Setup Incomplete</span>' :
               '<span class="text-gray-400"><i class="fas fa-phone-slash mr-1"></i>No Phone Connected</span>') +
              ' &bull; ' + (state.subscription?.status || 'unknown') + '</p></div></div>' +
        '<div class="flex gap-2">' +
          (state.phoneSetup?.connection_status !== 'connected' ? '<button onclick="secSetTab(\'connect\')" class="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"><i class="fas fa-phone-alt mr-1"></i>Connect Phone</button>' : '') +
          '<button onclick="secToggle()" class="px-4 py-2 rounded-xl text-sm font-semibold transition-all ' +
            (state.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200') + '">' +
            '<i class="fas ' + (state.isActive ? 'fa-pause' : 'fa-play') + ' mr-1"></i>' + (state.isActive ? 'Pause' : 'Activate') + '</button>' +
        '</div></div></div>';

    content.innerHTML = statusHtml +

      // MODE SELECTOR — 3 Secretary Modes
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
        '<h3 class="font-bold text-gray-800 text-lg mb-1"><i class="fas fa-sliders-h text-sky-500 mr-2"></i>Secretary Mode</h3>' +
        '<p class="text-gray-500 text-sm mb-4">Choose how your AI secretary operates</p>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
          modeCard('directory', 'fa-sitemap', 'Directory Service',
            'Routes callers to departments. "Press 1 for Sales, 2 for Service…" Clean, professional call routing.',
            '#0ea5e9', '#f0f9ff') +
          modeCard('answering', 'fa-phone-volume', 'Never-Voicemail Answering',
            'Every call gets a live response. Takes messages, flags urgents, forwards emergencies. No voicemail ever.',
            '#8b5cf6', '#f5f3ff') +
          modeCard('full', 'fa-user-tie', 'Full AI Secretary',
            'Your main office line. Books appointments, answers FAQs, schedules callbacks, sends emails. Does it all.',
            '#059669', '#ecfdf5') +
        '</div>' +
      '</div>' +

      // STEP 1: Phone & Greeting
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
        '<h3 class="font-bold text-gray-800 text-lg mb-1"><span class="inline-flex items-center justify-center w-7 h-7 bg-sky-500 text-white rounded-full text-sm font-bold mr-2">1</span>Phone & Greeting Setup</h3>' +
        '<p class="text-gray-500 text-sm mb-4 ml-9">How should your AI secretary answer the phone?</p>' +
        '<div class="space-y-4 ml-9">' +
          '<div>' +
            '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-phone mr-1 text-sky-500"></i>Your Business Phone Number</label>' +
            '<input type="tel" id="secPhone" value="' + esc(c.business_phone || '') + '" placeholder="(780) 983-3335" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">' +
            '<p class="text-xs text-gray-400 mt-1">Your existing business line — the AI only answers when you don\'t pick up. SMS summaries sent to this number after each call.</p></div>' +
          '<div>' +
            '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-comment-dots mr-1 text-sky-500"></i>How Should We Answer?</label>' +
            '<textarea id="secGreeting" rows="4" maxlength="3000" placeholder="Thank you for calling Reuse Canada Roofing! My name is Sarah. Sorry we missed your call — I\'m the AI assistant and I can help you right away. We offer free roof estimates, emergency leak repairs, shingle replacements, and full roof installations across Edmonton, Sherwood Park, St. Albert, and all surrounding areas. How can I help you today?" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400 resize-none">' + esc(c.greeting_script || '') + '</textarea></div>' +
          '<div>' +
            '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-question-circle mr-1 text-sky-500"></i>Common Q&A\'s</label>' +
            '<textarea id="secQA" rows="5" maxlength="3000" placeholder="Q: What areas do you serve?\nA: We serve Edmonton, Sherwood Park, St. Albert, Spruce Grove, Leduc, Fort Saskatchewan, Beaumont, and all surrounding areas within 100km of Edmonton.\n\nQ: Do you offer free estimates?\nA: Absolutely! We provide free no-obligation on-site estimates. We can usually get someone out within 1-2 business days.\n\nQ: Do you handle insurance claims?\nA: Yes, we work directly with all major insurance companies on storm damage and hail claims. We\'ll help you through the entire claims process.\n\nQ: What types of roofing do you do?\nA: We do asphalt shingles, metal roofing, flat roofs (TPO/EPDM), cedar shakes, and rubber roofing. Residential and commercial.\n\nQ: Are you licensed and insured?\nA: Yes, fully licensed, insured, and WCB covered. We\'re also a certified CertainTeed and GAF installer." class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400 resize-none font-mono text-xs">' + esc(c.common_qa || '') + '</textarea></div>' +
          '<div>' +
            '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-sticky-note mr-1 text-sky-500"></i>General Notes</label>' +
            '<textarea id="secNotes" rows="3" maxlength="3000" placeholder="Spring Special: 10% off all full roof replacements booked before June 30th. Mention this offer!\n\nWe\'re currently booking estimates 3-5 business days out due to high demand from recent hail storms.\n\nEmergency repairs (active leaks) — tell callers we offer same-day emergency service, have them press 2 for Service/Repairs.\n\nAfter hours: Take a detailed message with their name, phone, address, and description of the issue. Let them know we\'ll call back first thing next business day." class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400 resize-none">' + esc(c.general_notes || '') + '</textarea></div>' +
          '<div class="flex gap-3 flex-wrap">' +
          '<button onclick="secSaveConfig()" id="saveConfigBtn" class="px-6 py-3 bg-sky-500 text-white rounded-xl font-semibold text-sm hover:bg-sky-600 transition-all shadow"><i class="fas fa-save mr-2"></i>Save Configuration</button>' +
          '<button onclick="secTestAgent()" class="px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 transition-all shadow"><i class="fas fa-microphone mr-2"></i>Test Agent</button>' +
          '</div>' +
        '</div></div>' +

      // STEP 2: Directories
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
        '<h3 class="font-bold text-gray-800 text-lg mb-1"><span class="inline-flex items-center justify-center w-7 h-7 bg-sky-500 text-white rounded-full text-sm font-bold mr-2">2</span>Call Routing Directories</h3>' +
        '<p class="text-gray-500 text-sm mb-4 ml-9">Set up 2-4 departments the AI can route callers to</p>' +
        '<div id="directoriesList" class="space-y-3 ml-9">' +
          dirs.map(function(d, i) { return dirCard(d, i); }).join('') +
        '</div>' +
        '<div class="ml-9 mt-4 flex gap-3">' +
          '<button onclick="secAddDir()" id="addDirBtn" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all ' + (dirs.length >= 4 ? 'opacity-50 cursor-not-allowed' : '') + '" ' + (dirs.length >= 4 ? 'disabled' : '') + '><i class="fas fa-plus mr-1"></i>Add Directory</button>' +
          '<button onclick="secSaveDirs()" id="saveDirsBtn" class="px-6 py-2 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 transition-all shadow"><i class="fas fa-save mr-2"></i>Save Directories</button>' +
        '</div></div>' +

      // MODE-SPECIFIC CONFIG
      renderModeSpecificConfig(c);
  }

  // ── Mode-specific config sections ──
  function renderModeSpecificConfig(c) {
    var mode = state.secretaryMode;
    var el = document.getElementById('secContent');
    if (!el) return;

    if (mode === 'answering') {
      el.innerHTML += renderAnsweringConfig(c);
    } else if (mode === 'full') {
      el.innerHTML += renderFullSecretaryConfig(c);
    }
  }

  function renderAnsweringConfig(c) {
    var fallback = c.answering_fallback_action || 'take_message';
    var fwdNum = c.answering_forward_number || '';
    var notifyEmail = c.answering_notify_email || '';
    return '<div class="bg-white rounded-2xl border-2 border-purple-200 shadow-sm p-6 mb-6">' +
      '<h3 class="font-bold text-gray-800 text-lg mb-1"><span class="inline-flex items-center justify-center w-7 h-7 bg-purple-500 text-white rounded-full text-sm font-bold mr-2"><i class="fas fa-phone-volume text-xs"></i></span>Never-Voicemail Answering Settings</h3>' +
      '<p class="text-gray-500 text-sm mb-4 ml-9">Configure how the AI handles calls when you can\'t answer</p>' +
      '<div class="space-y-4 ml-9">' +
        '<div>' +
          '<label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-route mr-1 text-purple-500"></i>When a caller reaches the AI:</label>' +
          '<div class="space-y-2">' +
            radioOpt('answering_fallback', 'take_message', 'Take a detailed message', fallback) +
            radioOpt('answering_fallback', 'forward_urgent', 'Take message — forward URGENT calls to a number', fallback) +
            radioOpt('answering_fallback', 'always_forward', 'Take message then offer to transfer caller', fallback) +
          '</div>' +
        '</div>' +
        '<div id="answeringFwdWrap" class="' + (fallback === 'take_message' ? 'hidden' : '') + '">' +
          '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-phone mr-1 text-purple-500"></i>Forward-to Number</label>' +
          '<input type="tel" id="answeringFwdNum" value="' + esc(fwdNum) + '" placeholder="(780) 555-0199" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400">' +
          '<p class="text-xs text-gray-400 mt-1">For urgent/emergency calls that need to be forwarded immediately</p>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          '<label class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl cursor-pointer"><input type="checkbox" id="answeringSms" ' + (c.answering_sms_notify !== 0 ? 'checked' : '') + ' class="w-4 h-4 text-purple-500 rounded"><span class="text-sm text-gray-700"><i class="fas fa-sms text-purple-400 mr-1"></i>SMS notify after each call</span></label>' +
          '<label class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl cursor-pointer"><input type="checkbox" id="answeringEmail" ' + (c.answering_email_notify !== 0 ? 'checked' : '') + ' class="w-4 h-4 text-purple-500 rounded"><span class="text-sm text-gray-700"><i class="fas fa-envelope text-purple-400 mr-1"></i>Email notify after each call</span></label>' +
        '</div>' +
        '<div>' +
          '<label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-at mr-1 text-purple-500"></i>Notification Email</label>' +
          '<input type="email" id="answeringNotifyEmail" value="' + esc(notifyEmail) + '" placeholder="owner@yourroofing.ca" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400">' +
        '</div>' +
        '<button onclick="secSaveConfig()" class="px-6 py-3 bg-purple-500 text-white rounded-xl font-semibold text-sm hover:bg-purple-600 transition-all shadow"><i class="fas fa-save mr-2"></i>Save Answering Settings</button>' +
      '</div></div>';
  }

  function renderFullSecretaryConfig(c) {
    var hrs = {};
    try { hrs = JSON.parse(c.full_business_hours || '{}'); } catch(e) {}
    var days = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];

    return '<div class="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-6 mb-6">' +
      '<h3 class="font-bold text-gray-800 text-lg mb-1"><span class="inline-flex items-center justify-center w-7 h-7 bg-emerald-500 text-white rounded-full text-sm font-bold mr-2"><i class="fas fa-user-tie text-xs"></i></span>Full AI Secretary Settings</h3>' +
      '<p class="text-gray-500 text-sm mb-4 ml-9">Your AI secretary\'s full capabilities — it can do everything a real secretary does</p>' +
      '<div class="space-y-4 ml-9">' +

        // Capabilities toggles
        '<div><label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-tasks mr-1 text-emerald-500"></i>Capabilities</label>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">' +
          capToggle('fullBookAppts', 'fa-calendar-check', 'Book appointments & estimates', c.full_can_book_appointments !== 0) +
          capToggle('fullAnswerFaq', 'fa-question-circle', 'Answer FAQs about your business', c.full_can_answer_faq !== 0) +
          capToggle('fullScheduleCallback', 'fa-phone-volume', 'Schedule callback requests', c.full_can_schedule_callback !== 0) +
          capToggle('fullSendEmail', 'fa-envelope', 'Send follow-up emails', c.full_can_send_email !== 0) +
          capToggle('fullTakePayment', 'fa-credit-card', 'Collect payment/deposit info', c.full_can_take_payment_info === 1) +
        '</div></div>' +

        // Business hours
        '<div><label class="block text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-clock mr-1 text-emerald-500"></i>Business Hours</label>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2">' +
          days.map(function(d) {
            return '<div class="bg-gray-50 rounded-lg p-2">' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">' + d[1] + '</label>' +
              '<input type="text" id="fullHrs_' + d[0] + '" value="' + esc(hrs[d[0]] || (d[0] === 'sat' || d[0] === 'sun' ? 'closed' : '9:00-17:00')) + '" placeholder="9:00-17:00 or closed" class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-400">' +
            '</div>';
          }).join('') +
        '</div></div>' +

        // Services & info
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-tools mr-1 text-emerald-500"></i>Services Offered</label>' +
            '<textarea id="fullServices" rows="4" placeholder="Free roof estimates and inspections\nShingle repair and replacement\nFlat roof systems (TPO, EPDM)\nMetal roofing installation\nEmergency leak repairs (same-day)\nGutter installation and repair\nStorm damage assessment\nInsurance claim assistance" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400 resize-none">' + esc(c.full_services_offered || '') + '</textarea></div>' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-dollar-sign mr-1 text-emerald-500"></i>Pricing Info (what AI can share)</label>' +
            '<textarea id="fullPricing" rows="4" placeholder="Free estimates — we come to you\nRoof inspections: Free\nMinor repairs: Starting from $250\nFull replacements: Starting from $5,000\nWe match any written quote\nFinancing available OAC" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400 resize-none">' + esc(c.full_pricing_info || '') + '</textarea></div>' +
        '</div>' +

        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-map-marker-alt mr-1 text-emerald-500"></i>Service Area</label>' +
            '<input type="text" id="fullServiceArea" value="' + esc(c.full_service_area || '') + '" placeholder="Edmonton, Sherwood Park, St. Albert, Spruce Grove, Leduc + 100km" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400"></div>' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-link mr-1 text-emerald-500"></i>Online Booking Link (optional)</label>' +
            '<input type="text" id="fullBookingLink" value="' + esc(c.full_booking_link || '') + '" placeholder="https://calendly.com/yourbusiness" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400"></div>' +
        '</div>' +

        // Email settings
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-signature mr-1 text-emerald-500"></i>Email From Name</label>' +
            '<input type="text" id="fullEmailFromName" value="' + esc(c.full_email_from_name || '') + '" placeholder="Reuse Canada Roofing" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400"></div>' +
          '<div><label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-file-signature mr-1 text-emerald-500"></i>Email Signature</label>' +
            '<input type="text" id="fullEmailSig" value="' + esc(c.full_email_signature || '') + '" placeholder="Best regards, The Reuse Canada Roofing Team" class="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-400"></div>' +
        '</div>' +

        '<button onclick="secSaveConfig()" class="px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 transition-all shadow"><i class="fas fa-save mr-2"></i>Save Full Secretary Settings</button>' +
      '</div></div>';
  }

  function radioOpt(name, value, label, current) {
    return '<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">' +
      '<input type="radio" name="' + name + '" value="' + value + '" ' + (current === value ? 'checked' : '') + ' onchange="document.getElementById(\'answeringFwdWrap\').classList.toggle(\'hidden\', this.value===\'take_message\')" class="w-4 h-4 text-purple-500">' +
      '<span class="text-sm text-gray-700">' + label + '</span></label>';
  }

  function capToggle(id, icon, label, checked) {
    return '<label class="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl cursor-pointer">' +
      '<input type="checkbox" id="' + id + '" ' + (checked ? 'checked' : '') + ' class="w-4 h-4 text-emerald-500 rounded">' +
      '<span class="text-sm text-gray-700"><i class="fas ' + icon + ' text-emerald-400 mr-1"></i>' + label + '</span></label>';
  }

  function dirCard(d, i) {
    return '<div class="border border-gray-200 rounded-xl p-4 bg-gray-50" data-dir="' + i + '">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<span class="font-semibold text-gray-700 text-sm"><i class="fas fa-folder text-amber-500 mr-1"></i>Directory ' + (i+1) + '</span>' +
        (i >= 2 ? '<button onclick="secRemoveDir(' + i + ')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash mr-1"></i>Remove</button>' : '') +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
        '<div><label class="block text-xs font-medium text-gray-600 mb-1">Department Name</label>' +
          '<input type="text" id="dirName' + i + '" value="' + esc(d.name || '') + '" placeholder="e.g. Sales / Estimates" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"></div>' +
        '<div><label class="block text-xs font-medium text-gray-600 mb-1">Transfer To</label>' +
          '<input type="text" id="dirAction' + i + '" value="' + esc(d.phone_or_action || '') + '" placeholder="(780) 555-0101 or Take a message" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"></div>' +
        '<div><label class="block text-xs font-medium text-gray-600 mb-1">Special Notes</label>' +
          '<input type="text" id="dirNotes' + i + '" value="' + esc(d.special_notes || '') + '" placeholder="Hours, key info, special instructions..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"></div>' +
      '</div></div>';
  }

  function modeCard(mode, icon, title, desc, color, bg) {
    var selected = state.secretaryMode === mode;
    return '<div onclick="secSetMode(\'' + mode + '\')" class="cursor-pointer border-2 rounded-xl p-4 transition-all hover:shadow-md ' +
      (selected ? 'border-[' + color + '] shadow-lg ring-2 ring-[' + color + ']/30' : 'border-gray-200 hover:border-gray-300') + '" ' +
      'style="' + (selected ? 'border-color:' + color + ';background:' + bg : '') + '">' +
      '<div class="flex items-center gap-3 mb-2">' +
        '<div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:' + color + '20"><i class="fas ' + icon + '" style="color:' + color + ';font-size:16px"></i></div>' +
        '<div class="flex-1"><p class="font-bold text-gray-800 text-sm">' + title + '</p></div>' +
        (selected ? '<span class="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"><i class="fas fa-check text-white text-[10px]"></i></span>' : '<span class="w-5 h-5 border-2 border-gray-300 rounded-full"></span>') +
      '</div>' +
      '<p class="text-xs text-gray-500 leading-relaxed">' + desc + '</p>' +
    '</div>';
  }

  window.secSetMode = function(mode) {
    state.secretaryMode = mode;
    render();
  };

  // ============================================================
  // CONNECT PHONE TAB — Quick Connect (SMS Verification)
  // Enter number → verify via text → DONE — AI is live!
  // No more manual *72 forwarding codes.
  // ============================================================
  function renderConnectTab() {
    var content = document.getElementById('secContent');
    if (!content) return;
    var ps = state.phoneSetup || {};
    var qc = state.quickConnect || {};
    var isConnected = ps.connection_status === 'connected';

    // Determine current step
    var step = 1; // Enter phone
    if (isConnected || qc.connected) step = 3; // Done!
    else if (qc.codeSent) step = 2; // Enter code

    // Progress bar — 3 simple steps (no forwarding step!)
    var steps = [
      { num: 1, label: 'Your Number', icon: 'fa-phone', done: step > 1 },
      { num: 2, label: 'Verify', icon: 'fa-shield-alt', done: step > 2 },
      { num: 3, label: 'Live!', icon: 'fa-bolt', done: step >= 3 },
    ];

    var html = '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-phone-alt text-sky-500 mr-2"></i>Connect Your Phone</h3>' +
        (isConnected ? '<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold"><i class="fas fa-check-circle mr-1"></i>Connected</span>' :
         '<span class="px-3 py-1 bg-sky-50 text-sky-600 rounded-full text-sm font-medium">~30 seconds</span>') +
      '</div>' +
      '<p class="text-gray-500 text-sm mb-4">Enter your business phone, verify via text, and your AI secretary is live. We\'ll text you all the setup details.</p>' +
      '<div class="flex items-center gap-1">';
    for (var si = 0; si < steps.length; si++) {
      var s = steps[si];
      var isCurrent = step === s.num;
      html += '<div class="flex-1">' +
        '<div class="flex items-center gap-2 mb-1">' +
          '<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ' +
            (s.done ? 'bg-green-500 text-white' : isCurrent ? 'bg-sky-500 text-white ring-4 ring-sky-100' : 'bg-gray-200 text-gray-400') + '">' +
            (s.done ? '<i class="fas fa-check text-xs"></i>' : '<i class="fas ' + s.icon + ' text-xs"></i>') + '</div>' +
          '<span class="text-xs font-semibold ' + (s.done ? 'text-green-600' : isCurrent ? 'text-sky-600' : 'text-gray-400') + '">' + s.label + '</span>' +
        '</div>' +
        '<div class="h-1.5 rounded-full ' + (s.done ? 'bg-green-400' : isCurrent ? 'bg-sky-400' : 'bg-gray-200') + '"></div>' +
      '</div>';
      if (si < steps.length - 1) html += '<div class="w-4"></div>';
    }
    html += '</div></div><div id="qcStepContent"></div>';
    content.innerHTML = html;

    // Render the current step
    if (step === 3) renderQCComplete();
    else if (step === 2) renderQCVerify();
    else renderQCEnterPhone();
  }

  // ── Step 1: Enter your phone number ──
  function renderQCEnterPhone() {
    var el = document.getElementById('qcStepContent');
    if (!el) return;
    var existingPhone = (state.phoneSetup || {}).business_phone || '';

    el.innerHTML =
      '<div class="bg-white rounded-2xl border-2 border-sky-100 shadow-sm p-8">' +
        '<div class="max-w-md mx-auto text-center">' +
          '<div class="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
            '<i class="fas fa-mobile-alt text-sky-500 text-2xl"></i></div>' +
          '<h4 class="text-xl font-extrabold text-gray-800 mb-2">What\'s your business phone number?</h4>' +
          '<p class="text-gray-500 text-sm mb-6">We\'ll send a quick verification text to confirm it\'s yours. Then your AI secretary will be live in under a minute.</p>' +

          '<div class="relative mb-4">' +
            '<div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">' +
              '<span class="text-gray-400 font-mono text-lg">+1</span></div>' +
            '<input type="tel" id="qcPhoneInput" value="' + esc(existingPhone.replace(/^\+1/, '')) + '" placeholder="(780) 983-3335" ' +
              'class="w-full pl-14 pr-4 py-4 text-lg font-mono border-2 border-gray-300 rounded-2xl focus:ring-4 focus:ring-sky-200 focus:border-sky-500 transition-all text-center" ' +
              'maxlength="14" autocomplete="tel">' +
          '</div>' +

          '<button onclick="qcSendCode()" id="qcSendBtn" class="w-full py-4 bg-sky-500 text-white rounded-2xl font-bold text-base hover:bg-sky-600 transition-all shadow-lg hover:shadow-xl">' +
            '<i class="fas fa-paper-plane mr-2"></i>Send Verification Code</button>' +

          '<p class="text-xs text-gray-400 mt-4"><i class="fas fa-lock mr-1"></i>We\'ll send a 6-digit code via SMS. Standard messaging rates may apply.</p>' +
        '</div>' +
      '</div>';

    // Auto-format phone number as they type
    var phoneInput = document.getElementById('qcPhoneInput');
    if (phoneInput) {
      phoneInput.addEventListener('input', function() {
        var v = this.value.replace(/\D/g, '').slice(0, 10);
        if (v.length >= 7) this.value = '(' + v.slice(0,3) + ') ' + v.slice(3,6) + '-' + v.slice(6);
        else if (v.length >= 4) this.value = '(' + v.slice(0,3) + ') ' + v.slice(3);
        else if (v.length > 0) this.value = '(' + v;
      });
      phoneInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); qcSendCode(); }
      });
    }
  }

  // Send verification code
  window.qcSendCode = async function() {
    var input = document.getElementById('qcPhoneInput');
    var rawPhone = input ? input.value.replace(/\D/g, '') : '';
    if (rawPhone.length < 10) { showToast('Please enter a valid 10-digit phone number', 'error'); return; }

    var btn = document.getElementById('qcSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending code...'; }

    try {
      var res = await fetch('/api/secretary/quick-connect/send-code', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ phone_number: rawPhone })
      });
      var data = await res.json();
      if (data.success) {
        state.quickConnect = state.quickConnect || {};
        state.quickConnect.codeSent = true;
        state.quickConnect.phone = data.phone_number;
        if (data.dev_code) state.quickConnect.devCode = data.dev_code;
        showToast(data.message, 'success');
        renderConnectTab();
      } else {
        showToast(data.error || 'Failed to send code', 'error');
      }
    } catch(e) { showToast('Network error — check your connection', 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send Verification Code'; }
  };

  // ── Step 2: Enter verification code ──
  function renderQCVerify() {
    var el = document.getElementById('qcStepContent');
    if (!el) return;
    var qc = state.quickConnect || {};
    var codeHint = qc.devCode ? '<div class="bg-gradient-to-r from-sky-50 to-indigo-50 border-2 border-sky-300 rounded-xl p-4 mt-3 mb-2 cursor-pointer" onclick="qcAutoFillDevCode()">' +
      '<div class="flex items-center gap-2 mb-1"><i class="fas fa-key text-sky-600"></i><span class="text-sm font-bold text-sky-700">Your Verification Code</span></div>' +
      '<p class="text-xs text-sky-600 mb-2">Enter this code below or tap to auto-fill</p>' +
      '<div class="flex items-center justify-center gap-1">' +
        qc.devCode.split('').map(function(d) { return '<span class="inline-block w-10 h-12 bg-white border-2 border-sky-400 rounded-lg flex items-center justify-center text-xl font-black text-sky-700">' + d + '</span>'; }).join('') +
      '</div>' +
      '<p class="text-xs text-sky-500 mt-2 text-center"><i class="fas fa-hand-pointer mr-1"></i>Tap here to auto-fill</p>' +
    '</div>' : '';

    var headerText = qc.devCode 
      ? '<h4 class="text-xl font-extrabold text-gray-800 mb-2">Enter Your Verification Code</h4>'
      : '<h4 class="text-xl font-extrabold text-gray-800 mb-2">Check your phone!</h4>';
    var subText = qc.devCode
      ? '<p class="text-gray-500 text-sm mb-2">Your verification code for <strong class="text-gray-700">' + formatPhone(qc.phone || '') + '</strong> is shown below</p>'
      : '<p class="text-gray-500 text-sm mb-2">We sent a 6-digit code to <strong class="text-gray-700">' + formatPhone(qc.phone || '') + '</strong></p>';

    el.innerHTML =
      '<div class="bg-white rounded-2xl border-2 border-sky-100 shadow-sm p-8">' +
        '<div class="max-w-md mx-auto text-center">' +
          '<div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
            '<i class="fas fa-shield-alt text-green-500 text-2xl"></i></div>' +
          headerText +
          subText +
          codeHint +

          '<div class="flex justify-center gap-2 my-6" id="qcCodeInputs">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="0">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="1">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="2">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="3">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="4">' +
            '<input type="text" maxlength="1" class="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all" data-idx="5">' +
          '</div>' +

          '<button onclick="qcVerifyCode()" id="qcVerifyBtn" class="w-full py-4 bg-green-500 text-white rounded-2xl font-bold text-base hover:bg-green-600 transition-all shadow-lg hover:shadow-xl">' +
            '<i class="fas fa-check-circle mr-2"></i>Verify & Go Live</button>' +

          '<div class="flex justify-center gap-4 mt-4">' +
            '<button onclick="qcSendCode()" class="text-sm text-sky-600 hover:text-sky-700 font-semibold"><i class="fas fa-redo mr-1"></i>Resend Code</button>' +
            '<button onclick="state.quickConnect={};renderConnectTab()" class="text-sm text-gray-500 hover:text-gray-600 font-semibold"><i class="fas fa-arrow-left mr-1"></i>Change Number</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Auto-advance code inputs
    var inputs = document.querySelectorAll('#qcCodeInputs input');
    inputs.forEach(function(inp, i) {
      inp.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 1);
        if (this.value && i < 5) inputs[i + 1].focus();
        // Auto-verify when all 6 digits entered
        var full = '';
        inputs.forEach(function(x) { full += x.value; });
        if (full.length === 6) setTimeout(function() { qcVerifyCode(); }, 300);
      });
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !this.value && i > 0) { inputs[i - 1].focus(); inputs[i - 1].value = ''; }
      });
      inp.addEventListener('paste', function(e) {
        e.preventDefault();
        var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        for (var j = 0; j < paste.length && j < 6; j++) inputs[j].value = paste[j];
        if (paste.length >= 6) setTimeout(function() { qcVerifyCode(); }, 300);
      });
    });
    if (inputs[0]) inputs[0].focus();

    // In dev mode, auto-fill after a brief delay so user sees what happened
    if (qc.devCode) {
      setTimeout(function() { qcAutoFillDevCode(); }, 800);
    }
  }

  // Auto-fill dev mode code into input fields
  window.qcAutoFillDevCode = function() {
    var qc = state.quickConnect || {};
    if (!qc.devCode) return;
    var inputs = document.querySelectorAll('#qcCodeInputs input');
    var digits = qc.devCode.toString().split('');
    for (var i = 0; i < digits.length && i < 6; i++) inputs[i].value = digits[i];
    showToast('Dev code auto-filled! Click "Verify & Go Live"', 'success');
  };

  // Verify the code — after this, the user is CONNECTED (no manual forwarding needed)
  window.qcVerifyCode = async function() {
    var inputs = document.querySelectorAll('#qcCodeInputs input');
    var code = '';
    inputs.forEach(function(inp) { code += inp.value; });
    if (code.length < 6) { showToast('Enter all 6 digits', 'error'); return; }

    var btn = document.getElementById('qcVerifyBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verifying & activating your AI secretary...'; }

    try {
      var qc = state.quickConnect || {};
      var res = await fetch('/api/secretary/quick-connect/verify', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ phone_number: qc.phone, code: code })
      });
      var data = await res.json();
      if (data.success) {
        state.quickConnect = Object.assign(state.quickConnect || {}, data);
        state.quickConnect.connected = true;
        if (state.phoneSetup) {
          state.phoneSetup.connection_status = 'connected';
          state.phoneSetup.assigned_phone_number = data.ai_phone_number;
          state.phoneSetup.business_phone = data.business_phone;
        } else {
          state.phoneSetup = {
            connection_status: 'connected',
            assigned_phone_number: data.ai_phone_number,
            business_phone: data.business_phone,
          };
        }
        state.isActive = true;
        showToast(data.message || 'Your AI secretary is now LIVE!', 'success');
        renderConnectTab(); // Goes straight to Connected screen
      } else {
        showToast(data.error || 'Invalid code', 'error');
        inputs.forEach(function(inp) { inp.value = ''; inp.style.borderColor = '#ef4444'; });
        if (inputs[0]) inputs[0].focus();
      }
    } catch(e) { showToast('Network error', 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Verify & Go Live'; }
  };

  // ── Step 3: CONNECTED! (No more manual forwarding step) ──
  // After SMS verification, the system auto-activates and sends setup details via text
  function renderQCComplete() {
    var el = document.getElementById('qcStepContent');
    if (!el) return;
    var ps = state.phoneSetup || {};
    var qc = state.quickConnect || {};
    var bizPhone = qc.business_phone_display || formatPhone(qc.business_phone || ps.business_phone || '');
    var aiPhone = qc.ai_phone_display || formatPhone(qc.ai_phone_number || ps.assigned_phone_number || '');
    var smsSent = qc.sms_sent;

    el.innerHTML =
      '<div class="bg-white rounded-2xl border-2 border-green-200 shadow-sm p-8 text-center">' +
        '<div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
          '<i class="fas fa-check-circle text-green-500 text-4xl"></i></div>' +
        '<h3 class="text-2xl font-extrabold text-gray-800 mb-2">Your AI Secretary is LIVE!</h3>' +
        '<p class="text-gray-500 mb-6">Every call to your business number is now backed by AI. Never miss a lead again.</p>' +

        // SMS confirmation banner
        (smsSent ?
          '<div class="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6 text-left max-w-lg mx-auto">' +
            '<p class="text-sm text-sky-800 font-semibold"><i class="fas fa-sms text-sky-500 mr-2"></i>Setup details texted to your phone</p>' +
            '<p class="text-xs text-sky-600 mt-1">We\'ve sent your AI secretary number and forwarding instructions via text message to ' + bizPhone + '. Check your texts!</p>' +
          '</div>'
        : '') +

        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto mb-6">' +
          '<div class="bg-gray-50 rounded-xl p-4">' +
            '<p class="text-xs text-gray-500 uppercase tracking-wide">Your Business Number</p>' +
            '<div class="flex items-center gap-2 mt-1">' +
              '<input type="tel" id="connectedBizPhone" value="' + esc(ps.business_phone || qc.business_phone || '') + '" class="flex-1 font-mono font-bold text-gray-800 text-lg bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sky-400 focus:border-sky-400">' +
              '<button onclick="qcUpdateBizPhone()" class="px-3 py-2 bg-sky-100 text-sky-600 rounded-lg text-sm font-semibold hover:bg-sky-200 transition-all" title="Save"><i class="fas fa-save"></i></button>' +
            '</div>' +
            '<p class="text-xs text-gray-400 mt-1">Edit to update your number</p></div>' +
          '<div class="bg-sky-50 rounded-xl p-4">' +
            '<p class="text-xs text-sky-600 uppercase tracking-wide">AI Secretary Number</p>' +
            '<p class="font-mono font-bold text-sky-800 text-lg mt-1">' + aiPhone + '</p>' +
            '<button onclick="copyToClipboard(\'' + esc(qc.ai_phone_number || ps.assigned_phone_number || '') + '\')" class="text-xs text-sky-500 hover:text-sky-700 mt-1"><i class="fas fa-copy mr-1"></i>Copy</button></div>' +
        '</div>' +

        // How it works — the call flow explanation
        '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6 text-left max-w-lg mx-auto">' +
          '<p class="text-sm font-bold text-emerald-800 mb-3"><i class="fas fa-route mr-1"></i>How calls are handled:</p>' +
          '<div class="space-y-2">' +
            '<div class="flex items-start gap-3">' +
              '<span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">1</span>' +
              '<p class="text-sm text-emerald-700">Customer calls your business number <strong>' + bizPhone + '</strong></p></div>' +
            '<div class="flex items-start gap-3">' +
              '<span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">2</span>' +
              '<p class="text-sm text-emerald-700"><strong>Your phone rings first</strong> — you always get first priority</p></div>' +
            '<div class="flex items-start gap-3">' +
              '<span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">3</span>' +
              '<p class="text-sm text-emerald-700">If you don\'t answer, the AI secretary picks up automatically</p></div>' +
            '<div class="flex items-start gap-3">' +
              '<span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">4</span>' +
              '<p class="text-sm text-emerald-700"><strong>You get an SMS summary</strong> of every AI-handled call</p></div>' +
          '</div>' +
        '</div>' +

        '<div class="flex justify-center gap-3 mb-6">' +
          '<button onclick="secSetTab(\'setup\')" class="px-6 py-3 bg-sky-500 text-white rounded-xl font-semibold text-sm hover:bg-sky-600 transition-all shadow"><i class="fas fa-cog mr-2"></i>Edit Configuration</button>' +
          '<button onclick="secSetTab(\'calls\')" class="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all"><i class="fas fa-phone-volume mr-2"></i>View Call Log</button>' +
          '<button onclick="qcResendSetupSMS()" id="qcResendBtn" class="px-6 py-3 bg-purple-50 text-purple-700 rounded-xl font-semibold text-sm hover:bg-purple-100 transition-all border border-purple-200"><i class="fas fa-sms mr-2"></i>Resend Setup Text</button>' +
        '</div>' +

        '<p class="text-xs text-gray-400 text-center">Need help? Contact support or check the text message we sent to your phone for setup details.</p>' +
      '</div>';
  }

  window.qcUpdateBizPhone = async function() {
    var input = document.getElementById('connectedBizPhone');
    if (!input || !input.value.trim()) { showToast('Enter a phone number', 'error'); return; }
    try {
      var res = await fetch('/api/secretary/config', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ business_phone: input.value.trim() })
      });
      if (res.ok) {
        if (state.config) state.config.business_phone = input.value.trim();
        if (state.phoneSetup) state.phoneSetup.business_phone = input.value.trim();
        showToast('Business phone updated!', 'success');
      } else { showToast('Failed to update', 'error'); }
    } catch(e) { showToast('Network error', 'error'); }
  };

  // Resend setup SMS with AI secretary details
  window.qcResendSetupSMS = async function() {
    var btn = document.getElementById('qcResendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...'; }
    try {
      var res = await fetch('/api/secretary/quick-connect/resend-sms', { method: 'POST', headers: authHeaders() });
      var data = await res.json();
      if (data.success) {
        showToast(data.message || 'Setup details sent to your phone!', 'success');
      } else {
        showToast(data.error || 'Failed to send', 'error');
      }
    } catch(e) { showToast('Network error', 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sms mr-2"></i>Resend Setup Text'; }
  };

  // LEGACY PLACEHOLDERS (kept for backward compat)
  window.secTestConnection = function() { showToast('Your phone is connected via text verification', 'info'); };
  window.secUpdateBizPhone = window.qcUpdateBizPhone;
  window.secConfirmConnection = function() { showToast('Your phone is connected via text verification', 'info'); };

  // ============================================================
  // CALLS TAB
  // ============================================================
  async function loadCalls() {
    try {
      var res = await fetch('/api/secretary/calls?limit=50', { headers: authOnly() });
      if (res.ok) { var data = await res.json(); state.calls = data.calls || []; renderCallsTab(); }
    } catch(e) {}
  }

  function renderCallsTab() {
    var content = document.getElementById('secContent');
    if (!content) return;

    if (state.calls.length === 0) {
      content.innerHTML =
        '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">' +
          '<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-phone-slash text-gray-400 text-2xl"></i></div>' +
          '<h3 class="font-bold text-gray-800 text-lg mb-1">No Calls Yet</h3>' +
          '<p class="text-gray-500 text-sm">When your AI secretary handles calls, they\'ll appear here with full transcripts and summaries.</p>' +
          (state.phoneSetup?.connection_status !== 'connected' ? '<button onclick="secSetTab(\'connect\')" class="mt-4 px-6 py-3 bg-sky-500 text-white rounded-xl font-semibold text-sm hover:bg-sky-600 transition-all"><i class="fas fa-phone-alt mr-2"></i>Connect Your Phone First</button>' : '') +
        '</div>';
      return;
    }

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">' +
        '<div class="px-6 py-4 border-b border-gray-100"><h3 class="font-bold text-gray-800">Recent Calls <span class="text-gray-400 font-normal text-sm">(' + state.calls.length + ')</span></h3></div>' +
        '<div class="divide-y divide-gray-100">' +
          state.calls.map(function(call) {
            var oc = call.call_outcome === 'answered' ? 'text-green-600 bg-green-50' :
              call.call_outcome === 'transferred' ? 'text-blue-600 bg-blue-50' :
              call.call_outcome === 'voicemail' ? 'text-amber-600 bg-amber-50' : 'text-gray-600 bg-gray-50';
            return '<div class="px-6 py-4 hover:bg-gray-50 transition-colors">' +
              '<div class="flex items-center justify-between mb-2">' +
                '<div class="flex items-center gap-3">' +
                  '<div class="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center"><i class="fas fa-phone text-sky-600"></i></div>' +
                  '<div><p class="font-semibold text-gray-800 text-sm">' + esc(call.caller_name || 'Unknown Caller') + '</p>' +
                    '<p class="text-xs text-gray-500">' + esc(call.caller_phone || '') + '</p></div></div>' +
                '<div class="text-right">' +
                  '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + oc + '">' + (call.call_outcome || 'unknown') + '</span>' +
                  '<p class="text-xs text-gray-400 mt-1">' + formatDuration(call.call_duration_seconds) + '</p></div></div>' +
              (call.call_summary ? '<p class="text-sm text-gray-600 ml-13 bg-gray-50 rounded-lg p-3"><i class="fas fa-robot text-gray-400 mr-1"></i>' + esc(call.call_summary) + '</p>' : '') +
              (call.directory_routed ? '<p class="text-xs text-gray-400 ml-13 mt-1"><i class="fas fa-arrow-right mr-1"></i>Routed to: <strong>' + esc(call.directory_routed) + '</strong></p>' : '') +
              '<p class="text-xs text-gray-400 ml-13 mt-1">' + new Date(call.created_at).toLocaleString() + '</p>' +
            '</div>';
          }).join('') +
        '</div></div>';
  }

  // ── Shared functions ──
  window.secAddDir = function() {
    var list = document.getElementById('directoriesList');
    if (!list || list.children.length >= 4) return;
    var count = list.children.length;
    var div = document.createElement('div');
    div.innerHTML = dirCard({ name: '', phone_or_action: '', special_notes: '' }, count);
    list.appendChild(div.firstChild);
    if (count + 1 >= 4) { var btn = document.getElementById('addDirBtn'); if (btn) { btn.disabled = true; btn.classList.add('opacity-50','cursor-not-allowed'); } }
  };

  window.secRemoveDir = function(idx) {
    var list = document.getElementById('directoriesList');
    if (!list || list.children.length <= 2) { alert('Minimum 2 directories required'); return; }
    list.children[idx].remove();
    Array.from(list.children).forEach(function(el, i) { el.setAttribute('data-dir', i); });
  };

  window.secSaveConfig = async function() {
    var btn = document.getElementById('saveConfigBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...'; }

    // Build business hours object for full mode
    var businessHours = {};
    ['mon','tue','wed','thu','fri','sat','sun'].forEach(function(d) {
      var el = document.getElementById('fullHrs_' + d);
      if (el) businessHours[d] = el.value || 'closed';
    });

    // Gather answering fallback radio
    var fallbackRadio = document.querySelector('input[name="answering_fallback"]:checked');

    try {
      var res = await fetch('/api/secretary/config', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          business_phone: document.getElementById('secPhone')?.value || '',
          greeting_script: document.getElementById('secGreeting')?.value || '',
          common_qa: document.getElementById('secQA')?.value || '',
          general_notes: document.getElementById('secNotes')?.value || '',
          secretary_mode: state.secretaryMode,
          // Answering mode
          answering_fallback_action: fallbackRadio ? fallbackRadio.value : 'take_message',
          answering_forward_number: document.getElementById('answeringFwdNum')?.value || '',
          answering_sms_notify: document.getElementById('answeringSms')?.checked ? 1 : 0,
          answering_email_notify: document.getElementById('answeringEmail')?.checked ? 1 : 0,
          answering_notify_email: document.getElementById('answeringNotifyEmail')?.value || '',
          // Full mode
          full_can_book_appointments: document.getElementById('fullBookAppts')?.checked ? 1 : 0,
          full_can_send_email: document.getElementById('fullSendEmail')?.checked ? 1 : 0,
          full_can_schedule_callback: document.getElementById('fullScheduleCallback')?.checked ? 1 : 0,
          full_can_answer_faq: document.getElementById('fullAnswerFaq')?.checked ? 1 : 0,
          full_can_take_payment_info: document.getElementById('fullTakePayment')?.checked ? 1 : 0,
          full_business_hours: JSON.stringify(businessHours),
          full_booking_link: document.getElementById('fullBookingLink')?.value || '',
          full_services_offered: document.getElementById('fullServices')?.value || '',
          full_pricing_info: document.getElementById('fullPricing')?.value || '',
          full_service_area: document.getElementById('fullServiceArea')?.value || '',
          full_email_from_name: document.getElementById('fullEmailFromName')?.value || '',
          full_email_signature: document.getElementById('fullEmailSig')?.value || '',
        })
      });
      var data = await res.json();
      if (data.success) { showToast('Configuration saved! Mode: ' + state.secretaryMode, 'success'); await loadStatus(); }
      else alert(data.error || 'Save failed');
    } catch(e) { alert('Network error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-2"></i>Save Configuration'; }
  };

  window.secSaveDirs = async function() {
    var list = document.getElementById('directoriesList');
    if (!list) return;
    var dirs = [];
    for (var i = 0; i < list.children.length; i++) {
      dirs.push({
        name: document.getElementById('dirName' + i)?.value || '',
        phone_or_action: document.getElementById('dirAction' + i)?.value || '',
        special_notes: document.getElementById('dirNotes' + i)?.value || '',
      });
    }
    if (dirs.length < 2) { alert('Minimum 2 directories required'); return; }
    var btn = document.getElementById('saveDirsBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...'; }
    try {
      var res = await fetch('/api/secretary/directories', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ directories: dirs }) });
      var data = await res.json();
      if (data.success) { showToast('Directories saved!', 'success'); await loadStatus(); }
      else alert(data.error || 'Save failed');
    } catch(e) { alert('Network error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-2"></i>Save Directories'; }
  };

  window.secToggle = async function() {
    try {
      var res = await fetch('/api/secretary/toggle', { method: 'POST', headers: authHeaders() });
      var data = await res.json();
      if (data.message) { showToast(data.message, data.is_active ? 'success' : 'info'); await loadStatus(); }
      else alert(data.error || 'Toggle failed');
    } catch(e) { alert('Network error'); }
  };

  // ── Helpers ──
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function formatDuration(s) { if (!s) return '0s'; var m = Math.floor(s/60); var sec = s%60; return m > 0 ? m + 'm ' + sec + 's' : sec + 's'; }

  function formatPhone(num) {
    if (!num) return '';
    var clean = num.replace(/\D/g, '');
    if (clean.length === 11 && clean[0] === '1') clean = clean.slice(1);
    if (clean.length === 10) return '(' + clean.slice(0,3) + ') ' + clean.slice(3,6) + '-' + clean.slice(6);
    return num;
  }

  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard!', 'success');
    }).catch(function() {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied!', 'success');
    });
  };

  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold z-50 transition-all ' +
      (type === 'success' ? 'bg-green-500 text-white' : 'bg-sky-500 text-white');
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : 'fa-info-circle') + ' mr-2"></i>' + msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
  }

  // ============================================================
  // MESSAGES TAB (Answering Mode)
  // ============================================================
  async function loadAndRenderMessages() {
    var content = document.getElementById('secContent');
    if (!content) return;
    content.innerHTML = '<div class="flex items-center justify-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-purple-500"></i></div>';
    try {
      var res = await fetch('/api/secretary/messages?limit=50', { headers: authOnly() });
      var data = await res.json();
      state.messages = data.messages || [];
      state.unreadCount = data.unread_count || 0;
    } catch(e) {}
    renderMessagesTab();
  }

  function renderMessagesTab() {
    var content = document.getElementById('secContent');
    if (!content) return;
    var msgs = state.messages;

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-envelope text-purple-500 mr-2"></i>Messages' +
            (state.unreadCount > 0 ? ' <span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">' + state.unreadCount + ' unread</span>' : '') + '</h3>' +
          (state.unreadCount > 0 ? '<button onclick="secMarkAllRead()" class="text-xs text-purple-600 hover:text-purple-800 font-semibold"><i class="fas fa-check-double mr-1"></i>Mark All Read</button>' : '') +
        '</div>' +
        (msgs.length === 0 ? '<p class="text-gray-400 text-center py-8"><i class="fas fa-inbox text-3xl block mb-2"></i>No messages yet. When callers leave messages, they\'ll appear here.</p>' :
          '<div class="space-y-3">' +
            msgs.map(function(m) {
              var unread = !m.is_read;
              var urgentBadge = m.urgency === 'urgent' ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">URGENT</span>' :
                m.urgency === 'emergency' ? '<span class="px-2 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-bold">EMERGENCY</span>' : '';
              return '<div class="border ' + (unread ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50') + ' rounded-xl p-4 ' + (unread ? 'ring-1 ring-purple-300' : '') + '">' +
                '<div class="flex items-start justify-between mb-2">' +
                  '<div class="flex items-center gap-2">' +
                    (unread ? '<span class="w-2 h-2 bg-purple-500 rounded-full"></span>' : '') +
                    '<span class="font-semibold text-gray-800 text-sm">' + esc(m.caller_name || 'Unknown Caller') + '</span>' +
                    '<span class="text-gray-400 text-xs">' + esc(m.caller_phone || '') + '</span>' +
                    urgentBadge +
                  '</div>' +
                  '<span class="text-gray-400 text-xs">' + new Date(m.created_at).toLocaleString() + '</span>' +
                '</div>' +
                '<p class="text-sm text-gray-700 leading-relaxed">' + esc(m.message_text) + '</p>' +
                (unread ? '<button onclick="secMarkRead(' + m.id + ')" class="mt-2 text-xs text-purple-600 hover:text-purple-800 font-semibold"><i class="fas fa-check mr-1"></i>Mark Read</button>' : '') +
              '</div>';
            }).join('') +
          '</div>') +
      '</div>';
  }

  window.secMarkRead = async function(id) {
    await fetch('/api/secretary/messages/' + id + '/read', { method: 'POST', headers: authHeaders() });
    loadAndRenderMessages();
  };
  window.secMarkAllRead = async function() {
    await fetch('/api/secretary/messages/read-all', { method: 'POST', headers: authHeaders() });
    loadAndRenderMessages();
  };

  // ============================================================
  // APPOINTMENTS TAB (Full Mode)
  // ============================================================
  async function loadAndRenderAppointments() {
    var content = document.getElementById('secContent');
    if (!content) return;
    content.innerHTML = '<div class="flex items-center justify-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-emerald-500"></i></div>';
    try {
      var res = await fetch('/api/secretary/appointments?limit=50', { headers: authOnly() });
      var data = await res.json();
      state.appointments = data.appointments || [];
      state.pendingAppts = data.pending_count || 0;
    } catch(e) {}
    renderAppointmentsTab();
  }

  function renderAppointmentsTab() {
    var content = document.getElementById('secContent');
    if (!content) return;
    var appts = state.appointments;

    var statusColors = {
      pending: 'bg-amber-100 text-amber-700',
      confirmed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      completed: 'bg-blue-100 text-blue-700'
    };

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-calendar-check text-emerald-500 mr-2"></i>Appointments' +
            (state.pendingAppts > 0 ? ' <span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">' + state.pendingAppts + ' pending</span>' : '') + '</h3>' +
        '</div>' +
        (appts.length === 0 ? '<p class="text-gray-400 text-center py-8"><i class="fas fa-calendar text-3xl block mb-2"></i>No appointments yet. When the AI books appointments, they\'ll appear here.</p>' :
          '<div class="overflow-x-auto"><table class="w-full text-sm">' +
            '<thead><tr class="border-b border-gray-200"><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Caller</th><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Date/Time</th><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Type</th><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Address</th><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th><th class="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Actions</th></tr></thead>' +
            '<tbody>' + appts.map(function(a) {
              return '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
                '<td class="py-3 px-3"><div class="font-semibold text-gray-800">' + esc(a.caller_name || 'Unknown') + '</div><div class="text-xs text-gray-400">' + esc(a.caller_phone || '') + '</div></td>' +
                '<td class="py-3 px-3 text-gray-700">' + esc(a.appointment_date || '—') + ' ' + esc(a.appointment_time || '') + '</td>' +
                '<td class="py-3 px-3"><span class="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-xs">' + esc(a.appointment_type || 'estimate') + '</span></td>' +
                '<td class="py-3 px-3 text-gray-600 text-xs">' + esc(a.property_address || '—') + '</td>' +
                '<td class="py-3 px-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ' + (statusColors[a.status] || 'bg-gray-100 text-gray-600') + '">' + esc(a.status) + '</span></td>' +
                '<td class="py-3 px-3">' +
                  (a.status === 'pending' ? '<button onclick="secUpdateAppt(' + a.id + ',\'confirmed\')" class="text-xs text-green-600 hover:text-green-800 font-semibold mr-2"><i class="fas fa-check mr-1"></i>Confirm</button>' +
                    '<button onclick="secUpdateAppt(' + a.id + ',\'cancelled\')" class="text-xs text-red-500 hover:text-red-700 font-semibold"><i class="fas fa-times mr-1"></i>Cancel</button>' :
                   a.status === 'confirmed' ? '<button onclick="secUpdateAppt(' + a.id + ',\'completed\')" class="text-xs text-blue-600 hover:text-blue-800 font-semibold"><i class="fas fa-check-double mr-1"></i>Complete</button>' : '—') +
                '</td></tr>';
            }).join('') + '</tbody></table></div>') +
      '</div>';
  }

  window.secUpdateAppt = async function(id, status) {
    await fetch('/api/secretary/appointments/' + id, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: status }) });
    loadAndRenderAppointments();
  };

  // ============================================================
  // CALLBACKS TAB (Full Mode)
  // ============================================================
  async function loadAndRenderCallbacks() {
    var content = document.getElementById('secContent');
    if (!content) return;
    content.innerHTML = '<div class="flex items-center justify-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-sky-500"></i></div>';
    try {
      var res = await fetch('/api/secretary/callbacks?limit=50', { headers: authOnly() });
      var data = await res.json();
      state.callbacks = data.callbacks || [];
      state.pendingCallbacks = data.pending_count || 0;
    } catch(e) {}
    renderCallbacksTab();
  }

  function renderCallbacksTab() {
    var content = document.getElementById('secContent');
    if (!content) return;
    var cbs = state.callbacks;

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-phone-volume text-sky-500 mr-2"></i>Scheduled Callbacks' +
            (state.pendingCallbacks > 0 ? ' <span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">' + state.pendingCallbacks + ' pending</span>' : '') + '</h3>' +
        '</div>' +
        (cbs.length === 0 ? '<p class="text-gray-400 text-center py-8"><i class="fas fa-phone text-3xl block mb-2"></i>No callbacks yet. When the AI schedules callbacks, they\'ll appear here.</p>' :
          '<div class="space-y-3">' + cbs.map(function(cb) {
            var isPending = cb.status === 'pending';
            return '<div class="border ' + (isPending ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50') + ' rounded-xl p-4">' +
              '<div class="flex items-start justify-between">' +
                '<div>' +
                  '<div class="font-semibold text-gray-800 text-sm">' + esc(cb.caller_name || 'Unknown') + ' — <a href="tel:' + esc(cb.caller_phone) + '" class="text-sky-600 hover:underline">' + formatPhone(cb.caller_phone) + '</a></div>' +
                  (cb.preferred_time ? '<div class="text-xs text-gray-500 mt-1"><i class="fas fa-clock mr-1"></i>Preferred: ' + esc(cb.preferred_time) + '</div>' : '') +
                  (cb.reason ? '<div class="text-sm text-gray-600 mt-1">' + esc(cb.reason) + '</div>' : '') +
                  '<div class="text-xs text-gray-400 mt-1">' + new Date(cb.created_at).toLocaleString() + '</div>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                  '<span class="px-2 py-0.5 rounded text-xs font-semibold ' + (isPending ? 'bg-amber-100 text-amber-700' : cb.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600') + '">' + esc(cb.status) + '</span>' +
                  (isPending ? '<button onclick="secUpdateCallback(' + cb.id + ',\'completed\')" class="text-xs text-green-600 hover:text-green-800 font-semibold px-2 py-1 bg-green-50 rounded"><i class="fas fa-check mr-1"></i>Done</button>' : '') +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>') +
      '</div>';
  }

  window.secUpdateCallback = async function(id, status) {
    await fetch('/api/secretary/callbacks/' + id, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: status }) });
    loadAndRenderCallbacks();
  };

  // ============================================================
  // VOICE TEST AGENT — Browser microphone test
  // Uses Web Speech API for transcription (works in Chrome, Edge, Safari)
  // Then sends text to AI chat endpoint for response
  // ============================================================
  var testState = { active: false, recognition: null, conversationHistory: [], processing: false };

  window.secTestAgent = function() {
    // Build the test modal
    var existing = document.getElementById('voiceTestModal');
    if (existing) existing.remove();

    // Check for Web Speech API support
    var hasSpeechAPI = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    var modal = document.createElement('div');
    modal.id = 'voiceTestModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">' +
        '<div class="bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white">' +
          '<div class="flex items-center justify-between">' +
            '<div><h2 class="text-lg font-bold"><i class="fas fa-microphone-alt mr-2"></i>Test Your AI Secretary</h2>' +
            '<p class="text-emerald-100 text-xs mt-1">Speak into your microphone to test how the AI will answer calls</p></div>' +
            '<button onclick="secCloseTestModal()" class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"><i class="fas fa-times text-sm"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="p-5">' +
          '<div id="vtConversation" class="h-64 overflow-y-auto mb-4 space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">' +
            '<div class="text-center text-gray-400 text-sm py-8"><i class="fas fa-robot text-3xl block mb-2 text-emerald-300"></i>' +
            (hasSpeechAPI
              ? 'Press the microphone button and speak to test your AI secretary.<br><span class="text-xs">The AI will respond based on your saved configuration.</span>'
              : '<span class="text-amber-600 font-semibold">Speech recognition not supported in this browser.</span><br><span class="text-xs">Use the text input below to type your message, or try Chrome/Edge.</span>') +
            '</div>' +
          '</div>' +
          '<div id="vtStatus" class="text-center text-xs text-gray-400 mb-3 h-4"></div>' +
          // Text input fallback (always available)
          '<div class="flex items-center gap-2 mb-3">' +
            '<input type="text" id="vtTextInput" placeholder="Or type a message here..." class="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400" onkeydown="if(event.key===\'Enter\')secSendText()">' +
            '<button onclick="secSendText()" class="px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all"><i class="fas fa-paper-plane"></i></button>' +
          '</div>' +
          '<div class="flex items-center justify-center gap-4">' +
            (hasSpeechAPI ?
              '<button onclick="secStartRecording()" id="vtRecordBtn" class="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl active:scale-95">' +
                '<i class="fas fa-microphone text-2xl"></i>' +
              '</button>' +
              '<button onclick="secStopRecording()" id="vtStopBtn" class="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg hidden animate-pulse">' +
                '<i class="fas fa-stop text-2xl"></i>' +
              '</button>'
              : '') +
            '<button onclick="secResetTest()" class="w-10 h-10 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 transition-all" title="Reset conversation">' +
              '<i class="fas fa-redo text-sm"></i>' +
            '</button>' +
          '</div>' +
          '<p class="text-center text-xs text-gray-400 mt-3">Speak or type to test your AI secretary. No audio is stored.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    testState.conversationHistory = [];
    modal.addEventListener('click', function(e) { if (e.target === modal) secCloseTestModal(); });
  };

  window.secCloseTestModal = function() {
    if (testState.recognition) {
      try { testState.recognition.stop(); } catch(e) {}
      testState.recognition = null;
    }
    testState.active = false;
    testState.conversationHistory = [];
    var m = document.getElementById('voiceTestModal');
    if (m) m.remove();
  };

  window.secResetTest = function() {
    testState.conversationHistory = [];
    var conv = document.getElementById('vtConversation');
    if (conv) conv.innerHTML = '<div class="text-center text-gray-400 text-sm py-8"><i class="fas fa-robot text-3xl block mb-2 text-emerald-300"></i>Conversation reset. Press the microphone or type to start again.</div>';
  };

  // Text input method (always works)
  window.secSendText = function() {
    if (testState.processing) return;
    var input = document.getElementById('vtTextInput');
    if (!input || !input.value.trim()) return;
    var text = input.value.trim();
    input.value = '';
    processAIChat(text);
  };

  // Speech recognition using Web Speech API
  window.secStartRecording = function() {
    if (testState.processing) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported. Please use the text input or try Chrome/Edge.');
      return;
    }

    testState.recognition = new SpeechRecognition();
    testState.recognition.continuous = false;
    testState.recognition.interimResults = true;
    testState.recognition.lang = 'en-US';
    testState.recognition.maxAlternatives = 1;

    var recordBtn = document.getElementById('vtRecordBtn');
    var stopBtn = document.getElementById('vtStopBtn');
    var statusEl = document.getElementById('vtStatus');

    testState.recognition.onstart = function() {
      testState.active = true;
      if (recordBtn) recordBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (statusEl) { statusEl.textContent = 'Listening... speak now'; statusEl.className = 'text-center text-xs text-red-500 mb-3 h-4 font-semibold'; }
    };

    testState.recognition.onresult = function(event) {
      var transcript = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (statusEl && transcript) statusEl.textContent = 'Heard: "' + transcript.substring(0, 60) + (transcript.length > 60 ? '...' : '') + '"';
    };

    testState.recognition.onend = function() {
      testState.active = false;
      if (recordBtn) recordBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');

      // Get final transcript
      if (testState._lastTranscript && testState._lastTranscript.trim()) {
        processAIChat(testState._lastTranscript.trim());
        testState._lastTranscript = '';
      } else {
        if (statusEl) { statusEl.textContent = 'No speech detected. Try again or type your message.'; statusEl.className = 'text-center text-xs text-amber-500 mb-3 h-4'; }
      }
    };

    testState.recognition.onerror = function(event) {
      testState.active = false;
      if (recordBtn) recordBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        if (statusEl) { statusEl.textContent = 'Error: ' + event.error + '. Try typing instead.'; statusEl.className = 'text-center text-xs text-red-500 mb-3 h-4'; }
      }
    };

    testState._lastTranscript = '';
    // Override onresult to capture final transcript
    var origOnResult = testState.recognition.onresult;
    testState.recognition.onresult = function(event) {
      var transcript = '';
      var isFinal = false;
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      testState._lastTranscript = transcript;
      if (statusEl && transcript) statusEl.textContent = 'Heard: "' + transcript.substring(0, 60) + '"';
      if (isFinal) {
        // Auto-process on final result
        try { testState.recognition.stop(); } catch(e) {}
      }
    };

    try {
      testState.recognition.start();
    } catch(e) {
      alert('Could not start microphone. Please check your browser permissions.');
    }
  };

  window.secStopRecording = function() {
    if (testState.recognition) {
      try { testState.recognition.stop(); } catch(e) {}
    }
    testState.active = false;
    var recordBtn = document.getElementById('vtRecordBtn');
    var stopBtn = document.getElementById('vtStopBtn');
    if (recordBtn) recordBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
  };

  async function processAIChat(userText) {
    if (testState.processing || !userText) return;
    testState.processing = true;
    var conv = document.getElementById('vtConversation');
    var statusEl = document.getElementById('vtStatus');

    // Show user message
    conv.innerHTML += '<div class="flex justify-end"><div class="bg-sky-500 text-white rounded-xl rounded-tr-sm px-3 py-2 max-w-xs text-sm">' + esc(userText) + '</div></div>';
    testState.conversationHistory.push({ role: 'user', content: userText });

    // Show AI thinking
    conv.innerHTML += '<div class="flex justify-start" id="vtThinking"><div class="bg-emerald-50 text-emerald-800 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-robot mr-1"></i><i class="fas fa-spinner fa-spin ml-1 text-xs"></i> Thinking...</div></div>';
    conv.scrollTop = conv.scrollHeight;
    if (statusEl) { statusEl.textContent = 'AI is responding...'; statusEl.className = 'text-center text-xs text-amber-500 mb-3 h-4 font-semibold'; }

    try {
      // Get AI response
      var greeting = document.getElementById('secGreeting') ? document.getElementById('secGreeting').value : (state.config?.greeting_script || '');
      var qa = document.getElementById('secQA') ? document.getElementById('secQA').value : (state.config?.common_qa || '');
      var notes = document.getElementById('secNotes') ? document.getElementById('secNotes').value : (state.config?.general_notes || '');

      var aiRes = await fetch('/api/secretary/test/chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: userText,
          history: testState.conversationHistory.slice(0, -1),
          greeting_script: greeting,
          common_qa: qa,
          general_notes: notes
        })
      });
      var aiData = await aiRes.json();

      // Replace thinking with response
      var thinking = document.getElementById('vtThinking');
      if (thinking) thinking.remove();
      var aiText = aiData.response || 'Sorry, I had trouble responding. Please try again.';
      conv.innerHTML += '<div class="flex justify-start"><div class="bg-emerald-50 text-emerald-800 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-robot text-emerald-500 mr-1"></i>' + esc(aiText) + '</div></div>';
      testState.conversationHistory.push({ role: 'assistant', content: aiText });
      conv.scrollTop = conv.scrollHeight;

      // TTS playback if available
      if (aiData.audio_url) {
        var audio = new Audio(aiData.audio_url);
        audio.play().catch(function() {});
      } else if (window.speechSynthesis) {
        // Use browser TTS as fallback
        var utterance = new SpeechSynthesisUtterance(aiText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        // Try to use a female voice
        var voices = window.speechSynthesis.getVoices();
        var femaleVoice = voices.find(function(v) { return v.name.includes('female') || v.name.includes('Samantha') || v.name.includes('Google US English'); });
        if (femaleVoice) utterance.voice = femaleVoice;
        window.speechSynthesis.speak(utterance);
      }

      if (statusEl) { statusEl.textContent = 'Press mic or type to continue'; statusEl.className = 'text-center text-xs text-emerald-500 mb-3 h-4'; }
    } catch(e) {
      var thinking2 = document.getElementById('vtThinking');
      if (thinking2) thinking2.remove();
      conv.innerHTML += '<div class="flex justify-start"><div class="bg-red-50 text-red-600 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-exclamation-triangle mr-1"></i>Error: ' + (e.message || 'Network error') + '</div></div>';
      conv.scrollTop = conv.scrollHeight;
      if (statusEl) { statusEl.textContent = 'Error occurred. Try again.'; statusEl.className = 'text-center text-xs text-red-500 mb-3 h-4'; }
    }
    testState.processing = false;
  }

  init();
})();
