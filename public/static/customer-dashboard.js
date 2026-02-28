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
    if (sid) { try { await fetch('/api/stripe/verify-session/' + sid, { headers: authHeaders() }); } catch(e) {} }
    window.history.replaceState({}, '', '/customer/dashboard');
  }
  await loadDashData();
  renderDashboard();
});

async function loadDashData() {
  custState.loading = true;
  try {
    var [profileRes, ordersRes, billingRes, crmCustRes, crmInvRes, crmPropRes, crmJobRes] = await Promise.all([
      fetch('/api/customer/me', { headers: authHeaders() }),
      fetch('/api/customer/orders', { headers: authHeaders() }),
      fetch('/api/stripe/billing', { headers: authHeaders() }),
      fetch('/api/crm/customers', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/invoices', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/proposals', { headers: authHeaders() }).catch(function() { return { ok: false }; }),
      fetch('/api/crm/jobs', { headers: authHeaders() }).catch(function() { return { ok: false }; })
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

    var stats = { customers: 0, invoices_owing: 0, invoices_paid: 0, proposals_open: 0, proposals_sold: 0, jobs_scheduled: 0 };
    if (crmCustRes.ok) { var d = await crmCustRes.json(); stats.customers = (d.stats && d.stats.total) || 0; }
    if (crmInvRes.ok) { var d2 = await crmInvRes.json(); stats.invoices_owing = (d2.stats && d2.stats.total_owing) || 0; stats.invoices_paid = (d2.stats && d2.stats.total_paid) || 0; }
    if (crmPropRes.ok) { var d3 = await crmPropRes.json(); stats.proposals_open = (d3.stats && d3.stats.open_count) || 0; stats.proposals_sold = (d3.stats && d3.stats.sold_count) || 0; }
    if (crmJobRes.ok) { var d4 = await crmJobRes.json(); stats.jobs_scheduled = (d4.stats && d4.stats.scheduled) || 0; }
    custState.crmStats = stats;
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

  // Determine branding setup completion status
  var brandingComplete = !!(c.brand_logo_url && c.brand_business_name);
  var brandingPartial = !!(c.brand_logo_url || c.brand_business_name);
  var brandingBadge = brandingComplete ? 'Active' : (brandingPartial ? 'Incomplete' : 'Set Up');
  var brandingBadgeColor = brandingComplete ? 'bg-green-500' : (brandingPartial ? 'bg-amber-500' : 'bg-pink-500');

  // Determine trial/credits exhausted state
  var trialsExhausted = freeTrialRemaining <= 0 && paidCredits <= 0;

  // Build the nav modules — Custom Branding is placed right after Invoicing per user request
  var modules = [
    { id: 'order', href: '/customer/order', icon: 'fa-plus-circle', label: 'Order New Report', desc: 'Get a roof measurement', color: 'from-blue-600 to-blue-700', badge: (freeTrialRemaining > 0 ? freeTrialRemaining + ' free' : (paidCredits > 0 ? paidCredits + ' credits' : 'Buy Credits')), badgeColor: freeTrialRemaining > 0 ? 'bg-green-500' : (paidCredits > 0 ? 'bg-blue-500' : 'bg-amber-500'), primary: true },
    { id: 'reports', href: '/customer/reports', icon: 'fa-file-alt', label: 'Roof Report History', desc: 'View past measurements', color: 'from-indigo-500 to-indigo-600', badge: completedReports > 0 ? completedReports.toString() : '', badgeColor: 'bg-indigo-500' },
    { id: 'customers', href: '/customer/customers', icon: 'fa-users', label: 'Customers', desc: 'CRM & contacts', color: 'from-emerald-500 to-emerald-600', badge: s.customers > 0 ? s.customers.toString() : '', badgeColor: 'bg-emerald-500' },
    { id: 'invoices', href: '/customer/invoices', icon: 'fa-file-invoice-dollar', label: 'Invoices', desc: 'Billing & payments', color: 'from-amber-500 to-amber-600', badge: s.invoices_owing > 0 ? '$' + Number(s.invoices_owing).toFixed(0) + ' owing' : '', badgeColor: 'bg-amber-500' },
    { id: 'branding', href: '/customer/branding', icon: 'fa-palette', label: 'Custom Branding Setup', desc: 'Logo, colors, ads & identity', color: 'from-pink-500 to-fuchsia-600', badge: brandingBadge, badgeColor: brandingBadgeColor },
    { id: 'proposals', href: '/customer/proposals', icon: 'fa-file-signature', label: 'Estimates / Proposals', desc: 'Sales documents', color: 'from-purple-500 to-purple-600', badge: s.proposals_open > 0 ? s.proposals_open + ' open' : '', badgeColor: 'bg-purple-500' },
    { id: 'jobs', href: '/customer/jobs', icon: 'fa-hard-hat', label: 'Job Management', desc: 'Calendar & scheduling', color: 'from-rose-500 to-rose-600', badge: s.jobs_scheduled > 0 ? s.jobs_scheduled + ' scheduled' : '', badgeColor: 'bg-rose-500' },
    { id: 'pipeline', href: '/customer/pipeline', icon: 'fa-funnel-dollar', label: 'Sales Pipeline', desc: 'Leads & to-do\'s', color: 'from-cyan-500 to-cyan-600', badge: 'Coming Soon', badgeColor: 'bg-gray-400' },
    { id: 'd2d', href: '/customer/d2d', icon: 'fa-door-open', label: 'D2D Manager', desc: 'Door-to-door teams', color: 'from-orange-500 to-orange-600', badge: 'Coming Soon', badgeColor: 'bg-gray-400' }
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
            '<a href="/customer/order" class="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all text-sm border border-white/20"><i class="fab fa-stripe mr-2"></i>Pay Per Report</a>' +
          '</div>' +
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
  var html = '<div class="space-y-2">';
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var statusClass = o.status === 'completed' ? 'bg-green-100 text-green-700' : (o.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600');
    html += '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-medium text-gray-800 truncate"><i class="fas fa-map-marker-alt text-red-400 mr-1.5 text-xs"></i>' + (o.property_address || 'Unknown') + '</p>' +
        '<p class="text-xs text-gray-500 mt-0.5">' + new Date(o.created_at).toLocaleDateString() + (o.roof_area_sqft ? ' &middot; ' + Math.round(o.roof_area_sqft) + ' sq ft' : '') + '</p>' +
      '</div>' +
      '<div class="flex items-center gap-2 ml-3">' +
        '<span class="px-2 py-0.5 ' + statusClass + ' rounded-full text-[10px] font-bold capitalize">' + (o.status === 'processing' ? '<i class="fas fa-spinner fa-spin mr-1"></i>' : '') + o.status + '</span>' +
        (o.report_status === 'completed' ? '<a href="/api/reports/' + o.id + '/html" target="_blank" class="px-2.5 py-1 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700"><i class="fas fa-eye mr-1"></i>View</a>' : '') +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}
