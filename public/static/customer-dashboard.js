// ============================================================
// Customer Dashboard — 8-Module Navigation Hub
// Central hub after login: quick access to all BMS modules
// ============================================================

var custState = { loading: true, orders: [], billing: null, customer: null, crmStats: null };

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async function() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    var sid = params.get('session_id');
    if (sid) { try { await fetch('/api/square/verify-payment', { headers: authHeaders() }); } catch(e) {} }
    window.history.replaceState({}, '', '/customer/dashboard');
  }
  await loadDashData();
  renderDashboard();
  // Auto-refresh when reports are being polished (every 5s)
  startEnhancementPolling();

  // Auto-trigger enhancement for any completed orders that haven't been enhanced yet
  setTimeout(function() {
    (custState.orders || []).forEach(function(o) {
      if (o.status === 'completed' && o.report_status === 'completed' &&
          (!o.enhancement_status || o.enhancement_status === 'none' || o.enhancement_status === null)) {
        triggerAsyncEnhancement(o.id);
      }
    });
  }, 2000);
});

async function loadDashData() {
  custState.loading = true;
  try {
    var [profileRes, ordersRes, billingRes, crmCustRes, crmInvRes, crmPropRes, crmJobRes, secRes, teamRes] = await Promise.all([
      fetch('/api/customer/me', { headers: authHeaders() }),
      fetch('/api/customer/orders', { headers: authHeaders() }),
      fetch('/api/square/billing', { headers: authHeaders() }),
      fetch('/api/crm/customers', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/invoices', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/proposals', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/jobs', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/secretary/status', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/team/members', { headers: authHeaders() }).catch(function() { return { ok: false }; })
    ]);
    if (profileRes.ok) {
      var pd = await profileRes.json();
      custState.customer = pd.customer;
      localStorage.setItem('rc_customer', JSON.stringify(pd.customer));
    } else {
      localStorage.removeItem('rc_customer'); localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login'; return;
    }
    if (ordersRes.ok) custState.orders = (await ordersRes.json()).orders || [];
    if (billingRes.ok) custState.billing = (await billingRes.json()).billing || null;

    var stats = { customers: 0, invoices_owing: 0, invoices_paid: 0, proposals_open: 0, proposals_sold: 0, jobs_total: 0, jobs_scheduled: 0, jobs_in_progress: 0 };
    if (crmCustRes.ok) { var d = await crmCustRes.json(); stats.customers = (d.stats && d.stats.total) || 0; }
    if (crmInvRes.ok) { var d2 = await crmInvRes.json(); stats.invoices_owing = (d2.stats && d2.stats.total_owing) || 0; stats.invoices_paid = (d2.stats && d2.stats.total_paid) || 0; }
    if (crmPropRes.ok) { var d3 = await crmPropRes.json(); stats.proposals_open = (d3.stats && d3.stats.open_count) || 0; stats.proposals_sold = (d3.stats && d3.stats.sold_count) || 0; }
    if (crmJobRes.ok) { var d4 = await crmJobRes.json(); stats.jobs_total = (d4.stats && d4.stats.total) || 0; stats.jobs_scheduled = (d4.stats && d4.stats.scheduled) || 0; stats.jobs_in_progress = (d4.stats && d4.stats.in_progress) || 0; }
    custState.crmStats = stats;
    // Secretary status
    custState.secretaryActive = false;
    custState.secretaryCalls = 0;
    if (secRes.ok) { var secData = await secRes.json(); custState.secretaryActive = secData.has_active_subscription; custState.secretaryCalls = secData.total_calls || 0; }
    // Team members data
    custState.teamMembers = 0;
    custState.isTeamMember = false;
    custState.teamOwnerName = '';
    custState.teamOwnerCompany = '';
    custState.teamRole = '';
    if (teamRes.ok) { var teamData = await teamRes.json(); custState.teamMembers = (teamData.billing && teamData.billing.active_seats) || (teamData.members || []).length; custState.isTeamMember = teamData.is_team_member || false; }
    // Also pull team info from customer profile
    if (custState.customer) {
      custState.isTeamMember = custState.customer.is_team_member || false;
      custState.teamOwnerName = custState.customer.team_owner_name || '';
      custState.teamOwnerCompany = custState.customer.team_owner_company || '';
      custState.teamRole = custState.customer.team_role || '';
    }
  } catch(e) { console.error('Dashboard load error:', e); }
  custState.loading = false;
}

function renderDashboard() {
  var root = document.getElementById('customer-root');
  if (!root) return;
  if (custState.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div><span class="ml-4 text-gray-500 text-lg">Loading dashboard...</span></div>';
    return;
  }

  var c = custState.customer || {};
  var b = custState.billing || {};
  var s = custState.crmStats || {};
  var credits = b.credits_remaining || c.credits_remaining || 0;
  var freeTrialRemaining = c.free_trial_remaining || 0;
  var paidCredits = c.paid_credits_remaining || 0;
  var completedReports = custState.orders.filter(function(o) { return o.status === 'completed'; }).length;
  var processingReports = custState.orders.filter(function(o) { return o.status === 'processing'; }).length;
  var enhancingReports = custState.orders.filter(function(o) { return o.enhancement_status === 'sent' || o.enhancement_status === 'pending' || o.report_status === 'enhancing'; }).length;

  // Determine trial/credits exhausted state
  var trialsExhausted = freeTrialRemaining <= 0 && paidCredits <= 0;

  // Build the nav modules
  var modules = [
    { id: 'order', href: '/customer/order', icon: 'fa-plus-circle', label: 'Order New Report', desc: 'Get a roof measurement', color: 'from-blue-600 to-blue-700', badge: (freeTrialRemaining > 0 ? freeTrialRemaining + ' free' : (paidCredits > 0 ? paidCredits + ' credits' : 'Buy Credits')), badgeColor: freeTrialRemaining > 0 ? 'bg-green-500' : (paidCredits > 0 ? 'bg-blue-500' : 'bg-amber-500'), primary: true },
    { id: 'reports', href: '/customer/reports', icon: 'fa-file-alt', label: 'Roof Report History', desc: 'View past measurements', color: 'from-indigo-500 to-indigo-600', badge: completedReports > 0 ? completedReports.toString() : '', badgeColor: 'bg-indigo-500' },
    { id: 'virtual-tryon', href: '/customer/virtual-tryon', icon: 'fa-magic', label: 'Virtual Roof Try-On', desc: 'AI roof visualization', color: 'from-violet-500 to-purple-600', badge: 'New', badgeColor: 'bg-violet-500' },
    { id: 'customers', href: '/customer/customers', icon: 'fa-users', label: 'Customers', desc: 'CRM & contacts', color: 'from-emerald-500 to-emerald-600', badge: s.customers > 0 ? s.customers.toString() : '', badgeColor: 'bg-emerald-500' },
    { id: 'invoices', href: '/customer/invoices', icon: 'fa-file-invoice-dollar', label: 'Invoices', desc: 'Billing & payments', color: 'from-amber-500 to-amber-600', badge: s.invoices_owing > 0 ? '$' + Number(s.invoices_owing).toFixed(0) + ' owing' : '', badgeColor: 'bg-amber-500' },
    { id: 'proposals', href: '/customer/proposals', icon: 'fa-file-signature', label: 'Estimates / Proposals', desc: 'Sales documents', color: 'from-purple-500 to-purple-600', badge: s.proposals_open > 0 ? s.proposals_open + ' open' : '', badgeColor: 'bg-purple-500' },
    { id: 'jobs', href: '/customer/jobs', icon: 'fa-hard-hat', label: 'Job Management', desc: 'Calendar & scheduling', color: 'from-rose-500 to-rose-600', badge: s.jobs_total > 0 ? s.jobs_total + (s.jobs_in_progress > 0 ? ' (' + s.jobs_in_progress + ' active)' : '') : '', badgeColor: 'bg-rose-500' },
    { id: 'pipeline', href: '/customer/pipeline', icon: 'fa-funnel-dollar', label: 'Sales Pipeline', desc: 'Leads & to-do\'s', color: 'from-cyan-500 to-cyan-600', badge: 'Coming Soon', badgeColor: 'bg-gray-400' },
    { id: 'd2d', href: '/customer/d2d', icon: 'fa-door-open', label: 'D2D Manager', desc: 'Door-to-door teams', color: 'from-orange-500 to-orange-600', badge: '', badgeColor: '' },
    { id: 'team', href: '/customer/team', icon: 'fa-users-cog', label: 'Sales Team', desc: 'Add team members', color: 'from-teal-500 to-emerald-600', badge: custState.teamMembers > 0 ? custState.teamMembers + ' members' : '$50/user/mo', badgeColor: custState.teamMembers > 0 ? 'bg-teal-500' : 'bg-gray-400' },
    { id: 'secretary', href: '/customer/secretary', icon: 'fa-headset', label: 'Roofer Secretary', desc: 'AI phone answering service', color: 'from-violet-500 to-purple-700', badge: custState.secretaryActive ? (custState.secretaryCalls > 0 ? custState.secretaryCalls + ' calls' : 'Active') : '$149/mo', badgeColor: custState.secretaryActive ? 'bg-green-500' : 'bg-violet-500' }
  ];

  // DEV-ONLY: Add Property Imagery tile for dev account
  if (c.is_dev) {
    modules.push({ id: 'property-imagery', href: '/customer/property-imagery', icon: 'fa-satellite', label: 'Property Imagery', desc: 'Satellite PDF — 4 zoom views', color: 'from-emerald-500 to-teal-600', badge: 'Dev Tool', badgeColor: 'bg-amber-500' });
  }

  root.innerHTML =
    // ── Welcome + Quick Stats ──
    '<div class="mb-6">' +
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 md:p-6">' +
        '<div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">' +
          '<div class="flex items-center gap-4">' +
            (c.google_avatar ? '<img src="' + c.google_avatar + '" class="w-14 h-14 rounded-full border-2 border-brand-200 shadow" alt="">' :
              '<div class="w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 rounded-full flex items-center justify-center shadow"><i class="fas fa-user text-white text-xl"></i></div>') +
            '<div>' +
              '<h2 class="text-xl font-bold text-gray-900">Welcome back, ' + (c.name || 'User') + '</h2>' +
              '<p class="text-sm text-gray-500">' + (c.company_name ? c.company_name + ' &middot; ' : '') + (c.email || '') + '</p>' +
            '</div>' +
          '</div>' +
          // Quick stats row
          '<div class="flex items-center gap-2 flex-wrap">' +
            (freeTrialRemaining > 0 ? '<div class="px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-xs font-bold text-green-700"><i class="fas fa-gift mr-1"></i>' + freeTrialRemaining + ' Free Trial</div>' : '') +
            (paidCredits > 0 ? '<div class="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-xs font-bold text-blue-700"><i class="fas fa-coins mr-1"></i>' + paidCredits + ' Credits</div>' : '') +
            '<div class="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-bold text-indigo-700"><i class="fas fa-file-alt mr-1"></i>' + completedReports + ' Reports</div>' +
            (processingReports > 0 ? '<div class="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700 animate-pulse"><i class="fas fa-spinner fa-spin mr-1"></i>' + processingReports + ' Generating</div>' : '') +
            (enhancingReports > 0 ? '<div class="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-xs font-bold text-purple-700 animate-pulse"><i class="fas fa-magic mr-1"></i>' + enhancingReports + ' AI Enhancing</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── Trial Exhausted Upsell Banner (shows when 3 free trials used and no paid credits) ──
    (trialsExhausted ? 
      '<div class="bg-gradient-to-r from-brand-800 to-brand-900 rounded-2xl p-6 mb-6 shadow-xl border border-brand-700">' +
        '<div class="flex flex-col md:flex-row items-center gap-4">' +
          '<div class="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"><i class="fas fa-crown text-white text-2xl"></i></div>' +
          '<div class="flex-1 text-center md:text-left">' +
            '<h3 class="text-white font-black text-lg">Your 3 Free Trial Reports Are Used Up!</h3>' +
            '<p class="text-brand-200 text-sm mt-1">Upgrade to a credit pack to keep ordering reports. Packs start at just <strong class="text-amber-400">$5.00/report</strong> — save up to 38%!</p>' +
          '</div>' +
          '<div class="flex gap-3 flex-shrink-0">' +
            '<a href="/pricing" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black rounded-xl shadow-lg transition-all hover:scale-105 text-sm"><i class="fas fa-tags mr-2"></i>View Credit Packs</a>' +
            '<a href="/customer/order" class="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all text-sm border border-white/20"><i class="fas fa-credit-card mr-2"></i>Pay Per Report</a>' +
          '</div>' +
        '</div>' +
      '</div>' : '') +

    // ── Team Context Banner (shows when logged in as team member) ──
    (custState.isTeamMember ? 
      '<div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 mb-6 shadow-lg border border-blue-500/30">' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur">' +
            '<i class="fas fa-users text-white text-xl"></i>' +
          '</div>' +
          '<div class="flex-1">' +
            '<div class="flex items-center gap-2">' +
              '<h3 class="text-white font-bold text-sm">Team Account Access</h3>' +
              '<span class="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold text-blue-100 uppercase">' + (custState.teamRole || 'member') + '</span>' +
            '</div>' +
            '<p class="text-blue-200 text-xs mt-0.5">You are accessing <strong class="text-white">' + (custState.teamOwnerCompany || custState.teamOwnerName || 'Team') + '</strong>\u2019s account. All reports, CRM, and features are shared.</p>' +
          '</div>' +
          '<a href="/customer/team" class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/20 flex-shrink-0">' +
            '<i class="fas fa-users-cog mr-1"></i>View Team' +
          '</a>' +
        '</div>' +
      '</div>' : '') +

    // ── Navigation Grid ──
    '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">' +
      modules.map(function(m) {
        var isPrimary = m.primary;
        return '<a href="' + m.href + '" class="group relative bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 hover:border-brand-300 ' + (isPrimary ? 'col-span-2 md:col-span-2 ring-2 ring-brand-200' : '') + '">' +
          '<div class="p-5 ' + (isPrimary ? 'md:p-6' : '') + '">' +
            // Icon
            '<div class="w-12 h-12 ' + (isPrimary ? 'w-14 h-14' : '') + ' bg-gradient-to-br ' + m.color + ' rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform">' +
              '<i class="fas ' + m.icon + ' text-white ' + (isPrimary ? 'text-xl' : 'text-lg') + '"></i>' +
            '</div>' +
            // Text
            '<h3 class="font-bold text-gray-900 ' + (isPrimary ? 'text-lg' : 'text-sm') + ' mb-0.5">' + m.label + '</h3>' +
            '<p class="text-xs text-gray-500">' + m.desc + '</p>' +
            // Badge
            (m.badge ? '<div class="mt-2"><span class="inline-block px-2 py-0.5 ' + m.badgeColor + ' text-white rounded-full text-[10px] font-bold">' + m.badge + '</span></div>' : '') +
          '</div>' +
          // Arrow indicator
          '<div class="absolute top-4 right-4 text-gray-300 group-hover:text-brand-500 transition-colors"><i class="fas fa-arrow-right text-sm"></i></div>' +
        '</a>';
      }).join('') +
    '</div>' +

    // ── Recent Activity ──
    '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">' +
      // Recent Orders
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">' +
        '<div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">' +
          '<h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-clock text-brand-500 mr-2"></i>Recent Reports</h3>' +
          '<a href="/customer/reports" class="text-xs text-brand-600 hover:text-brand-700 font-medium">View All <i class="fas fa-arrow-right ml-1"></i></a>' +
        '</div>' +
        '<div class="p-4">' + renderRecentOrders() + '</div>' +
      '</div>' +

      // Quick Actions & Billing
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">' +
        '<div class="px-5 py-4 border-b border-gray-100">' +
          '<h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-bolt text-amber-500 mr-2"></i>Quick Actions & Billing</h3>' +
        '</div>' +
        '<div class="p-4 space-y-3">' +
          '<a href="/customer/order" class="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">' +
            '<div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center"><i class="fas fa-plus text-white"></i></div>' +
            '<div><p class="font-semibold text-gray-800 text-sm">Order New Roof Report</p><p class="text-xs text-gray-500">' + (freeTrialRemaining > 0 ? freeTrialRemaining + ' free trial reports remaining' : (paidCredits > 0 ? paidCredits + ' credits available' : 'Pay per report or buy credit packs')) + '</p></div>' +
          '</a>' +
          '<a href="/customer/customers" class="flex items-center gap-3 p-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors">' +
            '<div class="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center"><i class="fas fa-user-plus text-white"></i></div>' +
            '<div><p class="font-semibold text-gray-800 text-sm">Add New Customer</p><p class="text-xs text-gray-500">Build your CRM database</p></div>' +
          '</a>' +
          '<a href="/customer/invoices" class="flex items-center gap-3 p-3 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors">' +
            '<div class="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center"><i class="fas fa-file-invoice-dollar text-white"></i></div>' +
            '<div><p class="font-semibold text-gray-800 text-sm">Create Invoice</p><p class="text-xs text-gray-500">' + (s.invoices_owing > 0 ? '$' + Number(s.invoices_owing).toFixed(2) + ' outstanding' : 'Bill your customers') + '</p></div>' +
          '</a>' +
          '<a href="/pricing" class="flex items-center gap-3 p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors">' +
            '<div class="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center"><i class="fas fa-coins text-white"></i></div>' +
            '<div><p class="font-semibold text-gray-800 text-sm">Buy Report Credits</p><p class="text-xs text-gray-500">Save up to 52% — packs from $4.75/report</p></div>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── Auto-Email Settings ──
    '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">' +
      '<div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-envelope text-cyan-500 mr-2"></i>Report Delivery Settings</h3>' +
      '</div>' +
      '<div class="p-5 flex items-center justify-between">' +
        '<div>' +
          '<p class="font-medium text-gray-800 text-sm">Auto-email reports when ready</p>' +
          '<p class="text-xs text-gray-500 mt-0.5">Automatically send every completed roof report to your email address (' + (c.email || '') + ')</p>' +
        '</div>' +
        '<label class="relative inline-flex items-center cursor-pointer">' +
          '<input type="checkbox" id="auto-email-toggle" class="sr-only peer" onchange="toggleAutoEmail(this.checked)">' +
          '<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\\'\\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>' +
        '</label>' +
      '</div>' +
    '</div>' +

    // Footer
    '<div class="text-center py-6 text-xs text-gray-400">' +
      '<p>Powered by <strong>RoofReporterAI</strong> &middot; Antigravity Gemini Roof Measurement Suite</p>' +
    '</div>';
}

function renderRecentOrders() {
  var orders = custState.orders.slice(0, 5);
  if (orders.length === 0) {
    return '<div class="text-center py-8">' +
      '<div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fas fa-clipboard-list text-gray-400 text-lg"></i></div>' +
      '<p class="text-sm text-gray-500 mb-3">No reports yet</p>' +
      '<a href="/customer/order" class="text-sm font-semibold text-brand-600 hover:text-brand-700"><i class="fas fa-plus mr-1"></i>Order your first report</a></div>';
  }

  // Check for any actively generating reports — show them first as a vivid progress card
  var generatingOrders = custState.orders.filter(function(o) {
    return o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending' ||
           o.report_status === 'enhancing' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending' ||
           o.ai_imagery_status === 'generating';
  });

  var html = '';

  // Vivid generating banner for actively processing reports
  if (generatingOrders.length > 0) {
    html += '<div class="mb-4">';
    for (var g = 0; g < generatingOrders.length; g++) {
      var go = generatingOrders[g];
      var isEnhancing = go.report_status === 'enhancing' || go.enhancement_status === 'sent' || go.enhancement_status === 'pending';
      var isGenerating = !isEnhancing && (go.status === 'processing' || go.report_status === 'generating' || go.report_status === 'pending');
      var isGeneratingImagery = go.ai_imagery_status === 'generating';
      var cardTitle = isGeneratingImagery && !isGenerating && !isEnhancing ? 'Creating AI Report Imagery' : (isEnhancing ? 'AI Enhancing Report' : 'Generating Roof Report');
      var createdAt = new Date(go.created_at).getTime();
      var elapsed = Math.round((Date.now() - createdAt) / 1000);
      var progressPercent = Math.min(95, Math.round((elapsed / 90) * 100)); // ~90s expected with AI imagery
      var stepLabel = 'Initializing...';
      if (elapsed < 5) stepLabel = 'Placing order...';
      else if (elapsed < 12) stepLabel = 'Analyzing satellite imagery...';
      else if (elapsed < 20) stepLabel = 'Measuring roof segments...';
      else if (elapsed < 30) stepLabel = 'Computing materials & edges...';
      else if (elapsed < 40) stepLabel = 'Building professional report...';
      else if (isEnhancing) stepLabel = 'AI polishing report...';
      else if (elapsed < 55) stepLabel = 'Enhancing with AI insights...';
      else if (elapsed < 75) stepLabel = 'Generating AI report imagery...';
      else if (elapsed < 85) stepLabel = 'Creating professional visuals...';
      else stepLabel = 'Finalizing perfect report...';

      if (isEnhancing) {
        progressPercent = Math.min(95, 70 + Math.round((elapsed - 30) / 60 * 25));
        stepLabel = 'AI polishing your report...';
      }

      html += '<div class="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 shadow-lg border border-blue-500/30">' +
        '<div class="absolute inset-0 opacity-10"><div style="background:repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0.1) 40px);width:200%;height:100%;animation:slideStripes 2s linear infinite"></div></div>' +
        '<div class="relative z-10">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">' +
                '<div style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite"></div>' +
              '</div>' +
              '<div>' +
                '<h4 class="text-white font-bold text-sm">' + cardTitle + '</h4>' +
                '<p class="text-blue-200 text-xs truncate" style="max-width:220px">' +
                  '<i class="fas fa-map-marker-alt mr-1"></i>' + (go.property_address || 'Processing...') +
                '</p>' +
              '</div>' +
            '</div>' +
            '<div class="text-right">' +
              '<div class="text-white font-bold text-lg">' + progressPercent + '%</div>' +
              '<div class="text-blue-200 text-xs">' + elapsed + 's elapsed</div>' +
            '</div>' +
          '</div>' +
          // Progress bar
          '<div class="w-full bg-white/20 rounded-full h-2 mb-2">' +
            '<div class="h-2 rounded-full transition-all duration-1000 ease-out" style="width:' + progressPercent + '%;background:linear-gradient(90deg,#60a5fa,#818cf8,#a78bfa)"></div>' +
          '</div>' +
          '<div class="flex items-center justify-between">' +
            '<p class="text-blue-100 text-xs font-medium"><i class="fas fa-cog fa-spin mr-1"></i>' + stepLabel + '</p>' +
            '<p class="text-blue-200 text-xs">~45-90 seconds total</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    html += '</div>';
  }

  // CSS for stripe animation (inject once)
  if (generatingOrders.length > 0 && !document.getElementById('genAnimStyles')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'genAnimStyles';
    styleEl.textContent = '@keyframes slideStripes{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes celebrateIn{0%{transform:scale(0.8);opacity:0}50%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}';
    document.head.appendChild(styleEl);
  }

  html += '<div class="space-y-2">';
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var isEnhancing = o.report_status === 'enhancing' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending';
    var isProcessing = o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending';
    var statusClass = o.status === 'completed' ? 'bg-green-100 text-green-700' : (isEnhancing ? 'bg-purple-100 text-purple-700' : (isProcessing ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'));
    var enhanceBadge = o.enhancement_status === 'enhanced' ? '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold"><i class="fas fa-magic mr-1"></i>AI Enhanced</span>' : (isEnhancing ? '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold animate-pulse"><i class="fas fa-wand-magic-sparkles fa-spin mr-1"></i>Polishing...</span>' : '');
    var imageryBadge = o.ai_imagery_status === 'completed' ? '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold"><i class="fas fa-images mr-1"></i>AI Imagery</span>' : (o.ai_imagery_status === 'generating' ? '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold animate-pulse"><i class="fas fa-palette fa-spin mr-1"></i>Creating...</span>' : '');
    var statusLabel = isEnhancing ? 'polishing' : (isProcessing ? 'generating' : o.status);
    var reportReady = (o.report_status === 'completed' || o.status === 'completed') && !isEnhancing && !isProcessing;
    html += '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-medium text-gray-800 truncate"><i class="fas fa-map-marker-alt text-red-400 mr-1.5 text-xs"></i>' + (o.property_address || 'Unknown') + '</p>' +
        '<p class="text-xs text-gray-500 mt-0.5">' + new Date(o.created_at).toLocaleDateString() + (o.roof_area_sqft ? ' &middot; ' + Math.round(o.roof_area_sqft) + ' sq ft' : '') + '</p>' +
      '</div>' +
      '<div class="flex items-center gap-2 ml-3">' +
        '<span class="px-2 py-0.5 ' + statusClass + ' rounded-full text-[10px] font-bold capitalize">' + (isEnhancing ? '<i class="fas fa-wand-magic-sparkles fa-spin mr-1"></i>' : (isProcessing ? '<i class="fas fa-spinner fa-spin mr-1"></i>' : '')) + statusLabel + '</span>' +
        enhanceBadge +
        imageryBadge +
        (reportReady ? '<a href="/api/reports/' + o.id + '/html" target="_blank" class="px-2.5 py-1 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700"><i class="fas fa-eye mr-1"></i>View</a>' : '') +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

// ============================================================
// AUTO-POLLING: Refresh dashboard when reports are generating
// Polls every 3s for fast feedback. When a report completes, 
// shows a celebration toast and re-renders the dashboard.
// ============================================================
var _enhancePollTimer = null;
var _prevProcessingIds = [];
function startEnhancementPolling() {
  if (_enhancePollTimer) clearInterval(_enhancePollTimer);
  var hasActive = custState.orders.some(function(o) {
    return o.report_status === 'enhancing' || o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending' || o.ai_imagery_status === 'generating';
  });
  // Track which orders are processing so we can detect completions
  _prevProcessingIds = custState.orders.filter(function(o) {
    return o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending' || o.report_status === 'enhancing' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending' || o.ai_imagery_status === 'generating';
  }).map(function(o) { return o.id; });

  if (!hasActive) return;
  console.log('[Dashboard] Reports generating — auto-refreshing every 3s');
  _enhancePollTimer = setInterval(async function() {
    try {
      var ordersRes = await fetch('/api/customer/orders', { headers: authHeaders() });
      if (ordersRes.ok) {
        var data = await ordersRes.json();
        custState.orders = data.orders || [];
        
        // Check if any previously-processing order is now complete
        var nowProcessingIds = custState.orders.filter(function(o) {
          return o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending' || o.report_status === 'enhancing' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending' || o.ai_imagery_status === 'generating';
        }).map(function(o) { return o.id; });
        
        var newlyCompleted = _prevProcessingIds.filter(function(id) { return nowProcessingIds.indexOf(id) === -1; });
        _prevProcessingIds = nowProcessingIds;

        // Show celebration toast for each newly completed report
        // AND trigger async enhancement + imagery in separate requests
        if (newlyCompleted.length > 0) {
          newlyCompleted.forEach(function(orderId) {
            var order = custState.orders.find(function(o) { return o.id === orderId; });
            showReportReadyToast(order);
            // Fire-and-forget: trigger enhancement in its own HTTP request
            triggerAsyncEnhancement(orderId);
          });
        }
        
        renderDashboard();
        
        // Stop polling when all reports are done
        var stillActive = custState.orders.some(function(o) {
          return o.report_status === 'enhancing' || o.status === 'processing' || o.report_status === 'generating' || o.report_status === 'pending' || o.enhancement_status === 'sent' || o.enhancement_status === 'pending' || o.ai_imagery_status === 'generating';
        });
        if (!stillActive) {
          console.log('[Dashboard] All reports complete — stopping auto-refresh');
          clearInterval(_enhancePollTimer);
          _enhancePollTimer = null;
        }
      }
    } catch(e) { /* silent */ }
  }, 3000);
}

// ============================================================
// CELEBRATION TOAST — Slides in when a report completes
// ============================================================
function showReportReadyToast(order) {
  var address = (order && order.property_address) || 'Your property';
  var orderId = order ? order.id : '';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:380px;animation:slideInRight 0.4s ease-out';
  toast.innerHTML = 
    '<div style="background:linear-gradient(135deg,#059669,#10b981);border-radius:16px;padding:16px 20px;box-shadow:0 10px 30px rgba(5,150,105,0.4);border:1px solid rgba(255,255,255,0.2)">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i class="fas fa-check-circle" style="color:white;font-size:20px"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<p style="color:white;font-weight:700;font-size:14px;margin:0">Report Ready!</p>' +
          '<p style="color:rgba(255,255,255,0.8);font-size:12px;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + address + '</p>' +
        '</div>' +
        (orderId ? '<a href="/api/reports/' + orderId + '/html" target="_blank" style="background:white;color:#059669;padding:6px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap">View <i class="fas fa-arrow-right ml-1"></i></a>' : '') +
      '</div>' +
    '</div>';
  
  // Add animation styles if not already present
  if (!document.getElementById('toastAnimStyles')) {
    var s = document.createElement('style');
    s.id = 'toastAnimStyles';
    s.textContent = '@keyframes slideInRight{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}';
    document.head.appendChild(s);
  }
  
  document.body.appendChild(toast);
  
  // Remove after 8 seconds
  setTimeout(function() {
    toast.style.animation = 'slideOutRight 0.4s ease-in forwards';
    setTimeout(function() { toast.remove(); }, 500);
  }, 8000);
}

// ============================================================
// Auto-Email Toggle
// ============================================================
async function loadAutoEmailPref() {
  try {
    var res = await fetch('/api/agents/auto-email', { headers: authHeaders() });
    if (res.ok) {
      var data = await res.json();
      var toggle = document.getElementById('auto-email-toggle');
      if (toggle) toggle.checked = !!data.auto_email_reports;
    }
  } catch(e) {}
}

async function toggleAutoEmail(enabled) {
  try {
    await fetch('/api/agents/auto-email', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ enabled: enabled })
    });
  } catch(e) {}
}

// ============================================================
// ASYNC ENHANCEMENT & IMAGERY — Triggered after base report completes
// Each runs in its own HTTP request to stay within Cloudflare's
// 30-second timeout. Enhancement first, then imagery.
// ============================================================
var _enhancedOrderIds = {};
async function triggerAsyncEnhancement(orderId) {
  if (_enhancedOrderIds[orderId]) return;
  _enhancedOrderIds[orderId] = true;
  try {
    console.log('[Dashboard] Triggering async enhancement for order', orderId);
    var res = await fetch('/api/reports/' + orderId + '/enhance-async', {
      method: 'POST', headers: authHeaders()
    });
    var data = await res.json();
    console.log('[Dashboard] Enhancement result:', data);
    // After enhancement, trigger AI imagery in a separate request
    if (data.success || data.already_enhanced) {
      triggerAsyncImagery(orderId);
    }
  } catch(e) {
    console.warn('[Dashboard] Enhancement trigger failed:', e.message);
  }
}

async function triggerAsyncImagery(orderId) {
  try {
    console.log('[Dashboard] Triggering AI imagery for order', orderId);
    var res = await fetch('/api/reports/' + orderId + '/generate-imagery', {
      method: 'POST', headers: authHeaders()
    });
    var data = await res.json();
    console.log('[Dashboard] Imagery result:', data);
  } catch(e) {
    console.warn('[Dashboard] Imagery trigger failed:', e.message);
  }
}

// Load auto-email preference after dashboard renders
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadAutoEmailPref, 500);
});
