// ============================================================
// SUPER ADMIN COMMAND CENTER — Post-Login Dashboard
// Views: Active Users | Credit Pack Sales | Order History | Sign-ups | Sales & Marketing
// Only accessible by superadmin
// ============================================================

const SA = {
  view: 'users',
  loading: true,
  data: {},
  salesPeriod: 'monthly',
  signupsPeriod: 'monthly',
  ordersFilter: '',
  analyticsPeriod: '7d',
  ga4Period: '7d',
  ga4Tab: 'overview',
  secRevPeriod: 'monthly',
  secCallsCustomerId: ''
};

document.addEventListener('DOMContentLoaded', () => {
  loadView('users');
});

window.saDashboardSetView = function(v) {
  SA.view = v;
  loadView(v);
};

// Admin auth headers — send Bearer token with every admin API call
function saHeaders() {
  const token = localStorage.getItem('rc_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function saFetch(url, opts) {
  const res = await fetch(url, { headers: saHeaders(), ...(opts || {}) });
  if (res.status === 401 || res.status === 403) {
    // Check if this is a service-level auth error (not session expiry)
    // Don't logout for API endpoints that may return 403 for missing config
    try {
      const clone = res.clone();
      const body = await clone.json();
      if (body.error && (body.error.includes('not configured') || body.error.includes('Admin access') || body.error.includes('Super admin'))) {
        // Service-level issue, not session expiry — return error response without logout
        return res;
      }
    } catch(e) { /* not JSON, treat as session error */ }
    // True session expiry — redirect to login
    localStorage.removeItem('rc_user');
    localStorage.removeItem('rc_token');
    window.location.href = '/login';
    return null;
  }
  return res;
}

async function loadView(view) {
  SA.loading = true;
  renderContent();
  try {
    switch (view) {
      case 'users':
        const usersRes = await saFetch('/api/admin/superadmin/users');
        if (usersRes) SA.data.users = await usersRes.json();
        break;
      case 'sales':
        const salesRes = await saFetch(`/api/admin/superadmin/sales?period=${SA.salesPeriod}`);
        if (salesRes) SA.data.sales = await salesRes.json();
        break;
      case 'orders':
        const ordersRes = await saFetch(`/api/admin/superadmin/orders?limit=100&status=${SA.ordersFilter}`);
        if (ordersRes) SA.data.orders = await ordersRes.json();
        break;
      case 'signups':
        const signupsRes = await saFetch(`/api/admin/superadmin/signups?period=${SA.signupsPeriod}`);
        if (signupsRes) SA.data.signups = await signupsRes.json();
        break;
      case 'marketing':
        const mktRes = await saFetch('/api/admin/superadmin/marketing');
        if (mktRes) SA.data.marketing = await mktRes.json();
        break;
      case 'email-outreach':
        // Handled by email-outreach.js module
        if (typeof window.loadEmailOutreach === 'function') {
          SA.loading = false;
          window.loadEmailOutreach();
          return;
        }
        break;
      case 'email-setup':
        const gmailStatusRes = await saFetch('/api/auth/gmail/status');
        if (gmailStatusRes) SA.data.emailSetup = await gmailStatusRes.json();
        break;
      case 'analytics':
        const analyticsRes = await saFetch(`/api/analytics/dashboard?period=${SA.analyticsPeriod}`);
        if (analyticsRes) SA.data.analytics = await analyticsRes.json();
        break;
      case 'ga4':
        const [ga4StatusRes, ga4ReportRes, ga4RealtimeRes] = await Promise.all([
          saFetch('/api/analytics/ga4/status'),
          saFetch(`/api/analytics/ga4/report?period=${SA.ga4Period}`),
          saFetch('/api/analytics/ga4/realtime')
        ]);
        if (ga4StatusRes) SA.data.ga4_status = await ga4StatusRes.json();
        if (ga4ReportRes) { const r = await ga4ReportRes.json(); SA.data.ga4_report = r.success ? r : null; }
        if (ga4RealtimeRes) { const r = await ga4RealtimeRes.json(); SA.data.ga4_realtime = r.success ? r : null; }
        break;
      case 'pricing':
        const pricingRes = await saFetch('/api/settings/pricing/config');
        if (pricingRes) SA.data.pricing = await pricingRes.json();
        const squareRes = await saFetch('/api/settings/square/status');
        if (squareRes) SA.data.square = await squareRes.json();
        break;
      case 'call-center':
        // Handled by call-center.js module
        if (typeof window.loadCallCenter === 'function') {
          SA.loading = false;
          window.loadCallCenter();
          return;
        }
        break;
      case 'meta-connect':
        // Handled by meta-connect.js module
        if (typeof window.loadMetaConnect === 'function') {
          SA.loading = false;
          window.loadMetaConnect();
          return;
        }
        break;
      case 'secretary-admin':
        try {
          const [secOverviewRes, secSubsRes] = await Promise.all([
            saFetch('/api/admin/superadmin/secretary/overview'),
            saFetch('/api/admin/superadmin/secretary/subscribers'),
          ]);
          if (secOverviewRes) SA.data.secretary_overview = await secOverviewRes.json();
          if (secSubsRes) SA.data.secretary_subscribers = await secSubsRes.json();
        } catch(secErr) {
          console.warn('Secretary admin load error:', secErr);
        }
        break;
      case 'secretary-revenue':
        try {
          const secRevRes = await saFetch(`/api/admin/superadmin/secretary/revenue?period=${SA.secRevPeriod || 'monthly'}`);
          if (secRevRes) SA.data.secretary_revenue = await secRevRes.json();
        } catch(e) {
          console.warn('Secretary revenue load error:', e);
        }
        break;
      case 'heygen':
        // Handled by heygen.js module
        if (typeof window.loadHeyGen === 'function') {
          SA.loading = false;
          window.loadHeyGen();
          return;
        }
        break;
      case 'ai-chat':
        // Handled by ai-admin-chat.js — renderAIChat() is a global function
        // No data to load, just render the chat UI
        break;
      case 'invoices':
        try {
          const [invListRes, invStatsRes, invCustRes] = await Promise.all([
            saFetch('/api/invoices'),
            saFetch('/api/invoices/stats/summary'),
            saFetch('/api/invoices/customers/list')
          ]);
          if (invListRes) SA.data.invoices = await invListRes.json();
          if (invStatsRes) SA.data.invoice_stats = await invStatsRes.json();
          if (invCustRes) SA.data.invoice_customers = await invCustRes.json();
        } catch(e) { console.warn('Invoice load error:', e); }
        break;
      case 'telephony':
        // Load telephony/LiveKit status
        try {
          const telRes = await saFetch('/api/admin/superadmin/telephony-status');
          if (telRes) SA.data.telephony = await telRes.json();
        } catch(e) { SA.data.telephony = {}; }
        break;
      case 'customer-onboarding':
        try {
          const obRes = await saFetch('/api/admin/superadmin/onboarding/list');
          if (obRes) SA.data.onboarding = await obRes.json();
        } catch(e) { SA.data.onboarding = { customers: [] }; }
        break;
      case 'service-invoices':
        try {
          const siRes = await saFetch('/api/admin/superadmin/service-invoices');
          if (siRes) SA.data.service_invoices = await siRes.json();
        } catch(e) { SA.data.service_invoices = { invoices: [] }; }
        break;
      case 'call-center-manage':
        try {
          const [ccStatsRes, ccScriptsRes] = await Promise.all([
            saFetch('/api/admin/superadmin/call-center/stats'),
            saFetch('/api/admin/superadmin/sales-scripts')
          ]);
          if (ccStatsRes) SA.data.cc_stats = await ccStatsRes.json();
          if (ccScriptsRes) SA.data.cc_scripts = await ccScriptsRes.json();
        } catch(e) { SA.data.cc_stats = {}; SA.data.cc_scripts = { scripts: [] }; }
        break;
    }
  } catch (e) {
    console.error('Load error:', e);
  }
  SA.loading = false;
  renderContent();
}

// ============================================================
// HELPERS
// ============================================================
function samc(label, value, icon, color, sub) {
  return `<div class="metric-card bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">${label}</p>
        <p class="text-2xl font-black text-gray-900 mt-1">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-1">${sub}</p>` : ''}
      </div>
      <div class="w-10 h-10 bg-${color}-100 rounded-xl flex items-center justify-center"><i class="fas ${icon} text-${color}-500"></i></div>
    </div>
  </div>`;
}

function $$(v) { return '$' + (v || 0).toFixed(2); }
function centsToD(c) { return '$' + ((c || 0) / 100).toFixed(2); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-CA') : '-'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; }
function fmtSeconds(s) {
  if (!s || s <= 0) return '-';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function statusBadge(s) {
  const m = { pending:'bg-yellow-100 text-yellow-800', processing:'bg-indigo-100 text-indigo-800', completed:'bg-green-100 text-green-800', failed:'bg-red-100 text-red-800', cancelled:'bg-gray-100 text-gray-500' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s}</span>`;
}

function payBadge(s) {
  const m = { unpaid:'bg-yellow-100 text-yellow-800', paid:'bg-green-100 text-green-800', refunded:'bg-purple-100 text-purple-800', trial:'bg-blue-100 text-blue-800' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s === 'trial' ? 'Free Trial' : s}</span>`;
}

function saSection(title, icon, content, actions) {
  return `<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
    <div class="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="fas ${icon} text-red-500"></i>
        <h3 class="font-bold text-gray-800 text-sm">${title}</h3>
      </div>
      ${actions || ''}
    </div>
    <div class="p-6">${content}</div>
  </div>`;
}

function periodDropdown(current, onchangeFn) {
  return `<select onchange="${onchangeFn}(this.value)" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500">
    <option value="daily" ${current === 'daily' ? 'selected' : ''}>Daily (Last 30 Days)</option>
    <option value="weekly" ${current === 'weekly' ? 'selected' : ''}>Weekly (Last 12 Weeks)</option>
    <option value="monthly" ${current === 'monthly' ? 'selected' : ''}>Monthly (Last 12 Months)</option>
  </select>`;
}

// ============================================================
// MAIN RENDER
// ============================================================
function renderContent() {
  const root = document.getElementById('sa-root');
  if (!root) return;

  if (SA.loading) {
    root.innerHTML = `<div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
      <span class="ml-3 text-gray-500">Loading dashboard...</span>
    </div>`;
    return;
  }

  switch (SA.view) {
    case 'users': root.innerHTML = renderUsersView(); break;
    case 'sales': root.innerHTML = renderSalesView(); break;
    case 'orders': root.innerHTML = renderOrdersView(); break;
    case 'signups': root.innerHTML = renderSignupsView(); break;
    case 'marketing': root.innerHTML = renderMarketingView(); break;
    case 'email-outreach': break; // Handled by email-outreach.js
    case 'email-setup': root.innerHTML = renderEmailSetupView(); break;
    case 'analytics': root.innerHTML = renderAnalyticsView(); break;
    case 'ga4': root.innerHTML = renderGA4View(); break;
    case 'pricing': root.innerHTML = renderPricingView(); break;
    case 'call-center': break; // Handled by call-center.js
    case 'meta-connect': break; // Handled by meta-connect.js
    case 'secretary-admin': root.innerHTML = renderSecretaryAdminView(); break;
    case 'secretary-revenue': root.innerHTML = renderSecretaryRevenueView(); break;
    case 'heygen': break; // Handled by heygen.js
    case 'ai-chat': root.innerHTML = (typeof renderAIChat === 'function') ? renderAIChat() : '<div class="p-8 text-gray-500">AI Chat module not loaded.</div>'; break;
    case 'contact-forms': root.innerHTML = renderContactFormsView(); loadContactForms(); break;
    case 'seo-manager': root.innerHTML = renderSEOManagerView(); break;
    case 'canva': root.innerHTML = renderCanvaView(); loadCanvaStatus(); break;
    case 'pricing-engine': root.innerHTML = renderPricingEngineView(); loadPricingPresets(); break;
    case 'invoices': root.innerHTML = renderInvoicesView(); break;
    case 'telephony': root.innerHTML = renderTelephonyView(); break;
    case 'revenue-pipeline': root.innerHTML = renderRevenuePipelineView(); loadRevenuePipeline(); break;
    case 'notifications-admin': root.innerHTML = renderNotificationsAdminView(); loadNotifications(); break;
    case 'webhooks': root.innerHTML = renderWebhooksView(); loadWebhooks(); break;
    case 'paywall': root.innerHTML = renderPaywallView(); loadPaywallStatus(); break;
    case 'customer-onboarding': root.innerHTML = renderCustomerOnboardingView(); break;
    case 'service-invoices': root.innerHTML = renderServiceInvoicesView(); break;
    case 'call-center-manage': root.innerHTML = renderCallCenterManageView(); break;
    default: root.innerHTML = renderUsersView();
  }
}

// ============================================================
// VIEW 1: ALL ACTIVE USERS
// ============================================================
function renderUsersView() {
  const d = SA.data.users || {};
  const users = d.users || [];
  const s = d.summary || {};

  return `
    <div class="mb-6">
      <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-users mr-2 text-red-500"></i>All Active Users</h2>
      <p class="text-sm text-gray-500 mt-1">Complete user registry with account details, credits, and order history</p>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${samc('Total Users', s.total_users || users.length, 'fa-users', 'blue')}
      ${samc('Active Users', s.active_users || 0, 'fa-user-check', 'green')}
      ${samc('Google Sign-In', s.google_users || 0, 'fa-google', 'red')}
      ${samc('Paying Customers', s.paying_users || 0, 'fa-credit-card', 'amber')}
      ${samc('Credits Available', s.total_credits_available || 0, 'fa-coins', 'indigo', (s.total_credits_used || 0) + ' used')}
    </div>

    ${saSection('User Registry (' + users.length + ')', 'fa-table', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Auth</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Free Trial</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Credits</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Orders</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Completed</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Order</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${users.length === 0 ? '<tr><td colspan="11" class="px-4 py-8 text-center text-gray-400">No registered users yet</td></tr>' : ''}
            ${users.map(u => `
              <tr class="hover:bg-red-50/30 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    ${u.google_avatar ? `<img src="${u.google_avatar}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm">` : `<div class="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center text-white text-xs font-bold">${(u.name||'?')[0].toUpperCase()}</div>`}
                    <div>
                      <p class="font-semibold text-gray-800 text-sm">${u.name || '-'}</p>
                      <p class="text-[10px] text-gray-400">${u.email}</p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">${u.company_name || '-'}</td>
                <td class="px-4 py-3 text-xs text-gray-500">${u.phone || '-'}</td>
                <td class="px-4 py-3 text-center">
                  ${u.google_id ? '<span class="text-xs text-red-500"><i class="fab fa-google"></i></span>' : '<span class="text-xs text-gray-400"><i class="fas fa-envelope"></i></span>'}
                </td>
                <td class="px-4 py-3 text-center">
                  <span class="text-xs ${(u.free_trial_used || 0) >= (u.free_trial_total || 3) ? 'text-red-500 font-bold' : 'text-gray-600'}">${u.free_trial_used || 0}/${u.free_trial_total || 3}</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span class="text-xs font-medium ${(u.report_credits || 0) > 0 ? 'text-green-600' : 'text-gray-400'}">${u.report_credits || 0}</span>
                  ${(u.credits_used || 0) > 0 ? `<span class="text-[10px] text-gray-400 block">${u.credits_used} used</span>` : ''}
                </td>
                <td class="px-4 py-3 text-center font-medium text-gray-700">${u.order_count || 0}</td>
                <td class="px-4 py-3 text-center font-medium text-green-600">${u.completed_reports || 0}</td>
                <td class="px-4 py-3 text-right font-bold text-gray-800">${$$(u.total_spent)}</td>
                <td class="px-4 py-3 text-xs text-gray-500">${fmtDate(u.last_order_date)}</td>
                <td class="px-4 py-3 text-xs text-gray-500">${fmtDate(u.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `)}
  `;
}

// ============================================================
// VIEW 2: INDIVIDUAL / CREDIT PACK SALES
// ============================================================
window.saChangeSalesPeriod = function(p) {
  SA.salesPeriod = p;
  loadView('sales');
};

function renderSalesView() {
  const d = SA.data.sales || {};
  const creditSales = d.credit_sales_by_period || [];
  const orderSales = d.order_sales_by_period || [];
  const packages = d.packages || [];
  const recent = d.recent_sales || [];
  const ct = d.credit_totals || {};
  const ot = d.order_totals || {};

  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-credit-card mr-2 text-red-500"></i>Credit Pack & Report Sales</h2>
        <p class="text-sm text-gray-500 mt-1">Revenue tracking from individual reports and credit pack purchases</p>
      </div>
      ${periodDropdown(SA.salesPeriod, 'saChangeSalesPeriod')}
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${samc('Total Orders', ot.total_orders || 0, 'fa-shopping-cart', 'blue', (ot.trial_orders || 0) + ' trial')}
      ${samc('Paid Revenue', $$(ot.paid_value), 'fa-dollar-sign', 'green')}
      ${samc('Credit Purchases', ct.total_transactions || 0, 'fa-credit-card', 'indigo')}
      ${samc('Credit Revenue', centsToD(ct.paid_cents), 'fa-coins', 'amber')}
      ${samc('Trial Orders', ot.trial_orders || 0, 'fa-gift', 'purple', '$0 revenue')}
    </div>

    <!-- Credit Packages -->
    ${saSection('Credit Packages Available', 'fa-box-open', `
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        ${packages.map(p => `
          <div class="border border-gray-200 rounded-xl p-4 text-center hover:border-red-300 hover:shadow-md transition-all">
            <p class="text-2xl font-black text-gray-900">${p.credits}</p>
            <p class="text-xs font-semibold text-gray-500 uppercase">${p.name}</p>
            <p class="text-lg font-bold text-red-600 mt-1">$${(p.price_cents / 100).toFixed(2)}</p>
            <p class="text-[10px] text-gray-400">${p.description}</p>
          </div>
        `).join('')}
      </div>
    `)}

    <!-- Sales by Period -->
    <div class="grid lg:grid-cols-2 gap-6">
      ${saSection('Report Sales by Period', 'fa-chart-bar', `
        ${orderSales.length === 0 ? '<p class="text-gray-400 text-sm">No sales data yet</p>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Period</th>
                <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500">Orders</th>
                <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500">Trial</th>
                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Paid Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${orderSales.map(s => `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 font-medium text-gray-700">${s.period}</td>
                  <td class="px-4 py-2 text-center text-gray-600">${s.orders}</td>
                  <td class="px-4 py-2 text-center text-blue-600">${s.trial_count || 0}</td>
                  <td class="px-4 py-2 text-right font-bold text-green-700">${$$(s.paid_value)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      `)}

      ${saSection('Credit Pack Sales by Period', 'fa-wallet', `
        ${creditSales.length === 0 ? '<p class="text-gray-400 text-sm">No credit pack sales yet</p>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Period</th>
                <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500">Transactions</th>
                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${creditSales.map(s => `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 font-medium text-gray-700">${s.period}</td>
                  <td class="px-4 py-2 text-center text-gray-600">${s.transactions}</td>
                  <td class="px-4 py-2 text-right font-bold text-green-700">${centsToD(s.paid_cents)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      `)}
    </div>

    <!-- Recent Transactions -->
    ${saSection('Recent Credit Pack Purchases', 'fa-receipt', `
      ${recent.length === 0 ? '<p class="text-gray-400 text-sm">No credit pack purchases yet</p>' : `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
              <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
              <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Amount</th>
              <th class="px-4 py-2 text-center text-xs font-semibold text-gray-500">Status</th>
              <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${recent.map(s => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-2">
                  <p class="font-medium text-gray-800">${s.customer_name || '-'}</p>
                  <p class="text-[10px] text-gray-400">${s.customer_email || ''}</p>
                </td>
                <td class="px-4 py-2 text-xs text-gray-600 capitalize">${s.payment_type || s.description || '-'}</td>
                <td class="px-4 py-2 text-right font-bold text-gray-800">${centsToD(s.amount)}</td>
                <td class="px-4 py-2 text-center">${statusBadge(s.status)}</td>
                <td class="px-4 py-2 text-xs text-gray-500">${fmtDateTime(s.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}
    `)}
  `;
}

// ============================================================
// VIEW 3: ORDER HISTORY & LOGISTICS
// ============================================================
window.saFilterOrders = function(s) {
  SA.ordersFilter = s;
  loadView('orders');
};

function renderOrdersView() {
  const d = SA.data.orders || {};
  const orders = d.orders || [];
  const counts = d.counts || {};
  const avgSec = d.avg_processing_seconds || 0;

  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-clipboard-list mr-2 text-red-500"></i>Order History & Logistics</h2>
        <p class="text-sm text-gray-500 mt-1">Report address, order date, pricing, and software completion time</p>
      </div>
      <select onchange="saFilterOrders(this.value)" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-red-500">
        <option value="" ${SA.ordersFilter === '' ? 'selected' : ''}>All Statuses</option>
        <option value="pending" ${SA.ordersFilter === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="processing" ${SA.ordersFilter === 'processing' ? 'selected' : ''}>Processing</option>
        <option value="completed" ${SA.ordersFilter === 'completed' ? 'selected' : ''}>Completed</option>
        <option value="failed" ${SA.ordersFilter === 'failed' ? 'selected' : ''}>Failed</option>
        <option value="cancelled" ${SA.ordersFilter === 'cancelled' ? 'selected' : ''}>Cancelled</option>
      </select>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      ${samc('Total Orders', counts.total || 0, 'fa-clipboard-list', 'blue')}
      ${samc('Completed', counts.completed || 0, 'fa-check-circle', 'green')}
      ${samc('Pending', counts.pending || 0, 'fa-clock', 'yellow')}
      ${samc('Processing', counts.processing || 0, 'fa-spinner', 'indigo')}
      ${samc('Avg Price', $$(counts.avg_price), 'fa-tag', 'purple')}
      ${samc('Avg Completion', fmtSeconds(avgSec), 'fa-stopwatch', 'red', 'software time')}
    </div>

    ${saSection('Order Log (' + orders.length + ')', 'fa-table', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Order #</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Report Address</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Order Date</th>
              <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Price</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Status</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Payment</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Squares</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Confidence</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Complexity</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Processing Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${orders.length === 0 ? '<tr><td colspan="11" class="px-4 py-8 text-center text-gray-400">No orders found</td></tr>' : ''}
            ${orders.map(o => {
              const procTime = o.processing_seconds;
              return `
              <tr class="hover:bg-red-50/30 transition-colors">
                <td class="px-3 py-2">
                  <span class="font-mono text-xs font-bold text-gray-700">${o.order_number || '-'}</span>
                  ${o.is_trial ? '<span class="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1 rounded">TRIAL</span>' : ''}
                </td>
                <td class="px-3 py-2">
                  <p class="text-xs font-medium text-gray-800">${o.customer_name || o.requester_name || '-'}</p>
                  <p class="text-[10px] text-gray-400">${o.customer_company || o.customer_email || ''}</p>
                </td>
                <td class="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title="${o.property_address || ''}">${o.property_address || '-'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${fmtDateTime(o.created_at)}</td>
                <td class="px-3 py-2 text-right font-bold text-gray-800">${o.is_trial ? '<span class="text-blue-600">$0 Trial</span>' : $$(o.price)}</td>
                <td class="px-3 py-2 text-center">${statusBadge(o.status)}</td>
                <td class="px-3 py-2 text-center">${payBadge(o.payment_status)}</td>
                <td class="px-3 py-2 text-center text-xs font-medium text-gray-700">${o.gross_squares ? o.gross_squares.toFixed(1) : '-'}</td>
                <td class="px-3 py-2 text-center">
                  ${o.confidence_score ? `<span class="text-xs font-bold ${o.confidence_score >= 80 ? 'text-green-600' : o.confidence_score >= 60 ? 'text-yellow-600' : 'text-red-600'}">${o.confidence_score}%</span>` : '-'}
                </td>
                <td class="px-3 py-2 text-center">
                  ${o.complexity_class ? `<span class="px-1.5 py-0.5 text-[10px] rounded-full font-medium ${o.complexity_class === 'simple' ? 'bg-green-100 text-green-700' : o.complexity_class === 'moderate' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'} capitalize">${o.complexity_class}</span>` : '-'}
                </td>
                <td class="px-3 py-2 text-center">
                  ${procTime ? `<span class="text-xs font-medium ${procTime < 30 ? 'text-green-600' : procTime < 120 ? 'text-yellow-600' : 'text-red-600'}">${fmtSeconds(procTime)}</span>` : '<span class="text-gray-300">-</span>'}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `)}
  `;
}

// ============================================================
// VIEW 4: NEW USER SIGN-UPS
// ============================================================
window.saChangeSignupsPeriod = function(p) {
  SA.signupsPeriod = p;
  loadView('signups');
};

function renderSignupsView() {
  const d = SA.data.signups || {};
  const byPeriod = d.signups_by_period || [];
  const recent = d.recent_signups || [];
  const s = d.summary || {};

  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-user-plus mr-2 text-red-500"></i>New User Sign-ups</h2>
        <p class="text-sm text-gray-500 mt-1">Registration trends, sign-up method breakdown, and conversion tracking</p>
      </div>
      ${periodDropdown(SA.signupsPeriod, 'saChangeSignupsPeriod')}
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      ${samc('All-Time Users', s.total_all_time || 0, 'fa-users', 'blue')}
      ${samc('Today', s.today || 0, 'fa-calendar-day', 'green')}
      ${samc('This Week', s.this_week || 0, 'fa-calendar-week', 'indigo')}
      ${samc('This Month', s.this_month || 0, 'fa-calendar-alt', 'purple')}
      ${samc('Google Sign-In', s.google_total || 0, 'fa-google', 'red')}
      ${samc('Email Sign-Up', s.email_total || 0, 'fa-envelope', 'amber')}
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Sign-ups by Period -->
      ${saSection('Sign-ups by Period', 'fa-chart-line', `
        ${byPeriod.length === 0 ? '<p class="text-gray-400 text-sm">No sign-up data yet</p>' : `
        <div class="space-y-2">
          ${byPeriod.map(p => {
            const maxSignups = Math.max(...byPeriod.map(x => x.signups), 1);
            const pct = Math.round((p.signups / maxSignups) * 100);
            return `<div class="flex items-center gap-3">
              <span class="text-xs font-mono text-gray-600 w-24 flex-shrink-0">${p.period}</span>
              <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 to-rose-400 rounded-full transition-all" style="width:${pct}%"></div>
                <div class="absolute inset-0 flex items-center px-3">
                  <span class="text-xs font-bold text-white drop-shadow-sm">${p.signups}</span>
                  <span class="text-[10px] text-white/80 ml-2">(${p.google_signups || 0} Google, ${p.email_signups || 0} Email)</span>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`}
      `)}

      <!-- Recent Sign-ups -->
      ${saSection('Recent Sign-ups', 'fa-user-clock', `
        <div class="space-y-2 max-h-96 overflow-y-auto">
          ${recent.length === 0 ? '<p class="text-gray-400 text-sm">No recent sign-ups</p>' : ''}
          ${recent.map(u => `
            <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div class="flex items-center gap-3">
                ${u.google_avatar ? `<img src="${u.google_avatar}" class="w-8 h-8 rounded-full">` : `<div class="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center text-white text-xs font-bold">${(u.name||'?')[0].toUpperCase()}</div>`}
                <div>
                  <p class="text-sm font-medium text-gray-800">${u.name}</p>
                  <p class="text-[10px] text-gray-400">${u.email} ${u.company_name ? '· ' + u.company_name : ''}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs text-gray-500">${fmtDate(u.created_at)}</p>
                <p class="text-[10px] ${u.order_count > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}">${u.order_count || 0} orders ${u.trial_orders > 0 ? `(${u.trial_orders} trial)` : ''}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `)}
    </div>
  `;
}

// ============================================================
// VIEW 5: INTERNAL SALES & MARKETING MANAGEMENT
// ============================================================
function renderMarketingView() {
  const d = SA.data.marketing || {};
  const crm = d.crm_stats || {};
  const pi = d.platform_invoices || {};
  const funnel = d.funnel || {};
  const proposals = d.recent_proposals || [];
  const invoices = d.recent_invoices || [];

  const funnelTotal = funnel.total_signups || 1;
  const trialPct = Math.round(((funnel.used_trial || 0) / funnelTotal) * 100);
  const paidPct = Math.round(((funnel.became_paid || 0) / funnelTotal) * 100);

  return `
    <div class="mb-6">
      <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-bullhorn mr-2 text-red-500"></i>Internal Sales & Marketing</h2>
      <p class="text-sm text-gray-500 mt-1">CRM overview, proposals, invoices, leads, and conversion funnel</p>
    </div>

    <!-- Conversion Funnel -->
    <div class="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 mb-6 text-white">
      <h3 class="font-bold text-lg mb-4"><i class="fas fa-funnel-dollar mr-2 text-red-400"></i>Conversion Funnel</h3>
      <div class="grid grid-cols-5 gap-4">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto bg-blue-500/20 rounded-2xl flex items-center justify-center mb-2">
            <i class="fas fa-user-plus text-blue-400 text-xl"></i>
          </div>
          <p class="text-2xl font-black">${funnel.total_signups || 0}</p>
          <p class="text-xs text-gray-400">Sign-ups</p>
        </div>
        <div class="text-center flex flex-col items-center justify-center">
          <i class="fas fa-arrow-right text-gray-600 text-lg"></i>
          <p class="text-[10px] text-gray-500 mt-1">${trialPct}%</p>
        </div>
        <div class="text-center">
          <div class="w-16 h-16 mx-auto bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-2">
            <i class="fas fa-gift text-indigo-400 text-xl"></i>
          </div>
          <p class="text-2xl font-black">${funnel.used_trial || 0}</p>
          <p class="text-xs text-gray-400">Used Trial</p>
          <p class="text-[10px] text-indigo-400">${funnel.trial_reports || 0} reports</p>
        </div>
        <div class="text-center flex flex-col items-center justify-center">
          <i class="fas fa-arrow-right text-gray-600 text-lg"></i>
          <p class="text-[10px] text-gray-500 mt-1">${paidPct}%</p>
        </div>
        <div class="text-center">
          <div class="w-16 h-16 mx-auto bg-green-500/20 rounded-2xl flex items-center justify-center mb-2">
            <i class="fas fa-credit-card text-green-400 text-xl"></i>
          </div>
          <p class="text-2xl font-black">${funnel.became_paid || 0}</p>
          <p class="text-xs text-gray-400">Paid Users</p>
          <p class="text-[10px] text-green-400">${funnel.paid_reports || 0} reports</p>
        </div>
      </div>
    </div>

    <!-- CRM Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${samc('Total Leads', crm.total_leads || 0, 'fa-address-book', 'blue', (crm.active_leads || 0) + ' active')}
      ${samc('Proposals', crm.total_proposals || 0, 'fa-file-signature', 'indigo', (crm.sold_proposals || 0) + ' sold (' + $$(crm.sold_value) + ')')}
      ${samc('CRM Invoices', crm.total_invoices || 0, 'fa-file-invoice-dollar', 'green', (crm.paid_invoices || 0) + ' paid (' + $$(crm.paid_invoice_value) + ')')}
      ${samc('Jobs', crm.total_jobs || 0, 'fa-hard-hat', 'amber', (crm.completed_jobs || 0) + ' done, ' + (crm.scheduled_jobs || 0) + ' scheduled')}
    </div>

    <!-- Platform Invoices -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${samc('Platform Invoices', pi.total || 0, 'fa-receipt', 'purple')}
      ${samc('Paid', $$(pi.paid_value), 'fa-check-circle', 'green')}
      ${samc('Outstanding', $$(pi.outstanding_value), 'fa-clock', 'yellow')}
      ${samc('Overdue', $$(pi.overdue_value), 'fa-exclamation-triangle', 'red')}
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Recent Proposals -->
      ${saSection('Recent Proposals', 'fa-file-signature', `
        ${proposals.length === 0 ? '<p class="text-gray-400 text-sm">No proposals yet</p>' : `
        <div class="space-y-2">
          ${proposals.map(p => `
            <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 border border-gray-100">
              <div>
                <p class="text-sm font-medium text-gray-800">${p.title || p.proposal_number}</p>
                <p class="text-[10px] text-gray-400">To: ${p.customer_name || '-'} · By: ${p.owner_name || '-'}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold text-gray-800">${$$(p.total_amount)}</p>
                <span class="px-2 py-0.5 text-[10px] rounded-full font-medium capitalize ${p.status === 'sold' ? 'bg-green-100 text-green-700' : p.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">${p.status}</span>
              </div>
            </div>
          `).join('')}
        </div>`}
      `)}

      <!-- Recent CRM Invoices -->
      ${saSection('Recent CRM Invoices', 'fa-file-invoice', `
        ${invoices.length === 0 ? '<p class="text-gray-400 text-sm">No CRM invoices yet</p>' : `
        <div class="space-y-2">
          ${invoices.map(i => `
            <div class="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 border border-gray-100">
              <div>
                <p class="text-sm font-medium text-gray-800">${i.invoice_number}</p>
                <p class="text-[10px] text-gray-400">To: ${i.customer_name || '-'} · By: ${i.owner_name || '-'}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold text-gray-800">${$$(i.total)}</p>
                <span class="px-2 py-0.5 text-[10px] rounded-full font-medium capitalize ${i.status === 'paid' ? 'bg-green-100 text-green-700' : i.status === 'sent' ? 'bg-blue-100 text-blue-700' : i.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}">${i.status}</span>
              </div>
            </div>
          `).join('')}
        </div>`}
      `)}
    </div>

    <!-- Ad Campaign Management Placeholder -->
    ${saSection('Ad Campaign Management', 'fa-ad', `
      <div class="text-center py-8">
        <div class="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-ad text-gray-400 text-2xl"></i>
        </div>
        <h4 class="font-bold text-gray-700 mb-1">Campaign Manager Coming Soon</h4>
        <p class="text-sm text-gray-400 max-w-md mx-auto">Track Google Ads, Facebook Ads, and other marketing campaigns. Monitor spend, impressions, clicks, and conversions all from one dashboard.</p>
        <div class="mt-4 grid grid-cols-3 gap-3 max-w-lg mx-auto">
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <i class="fab fa-google text-red-400 text-lg mb-1"></i>
            <p class="text-[10px] text-gray-500">Google Ads</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <i class="fab fa-facebook text-blue-500 text-lg mb-1"></i>
            <p class="text-[10px] text-gray-500">Facebook Ads</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 text-center">
            <i class="fas fa-envelope-open-text text-green-500 text-lg mb-1"></i>
            <p class="text-[10px] text-gray-500">Email Campaigns</p>
          </div>
        </div>
      </div>
    `)}
  `;
}

// ============================================================
// VIEW 7: EMAIL SETUP — Gmail OAuth Configuration
// ============================================================
function renderEmailSetupView() {
  const d = SA.data.emailSetup || {};
  const g = d.gmail_oauth2 || {};

  const isReady = g.ready;
  const hasClientId = g.client_id_configured;
  const hasClientSecret = g.client_secret_configured;
  const csSource = g.client_secret_source || 'missing';
  const hasRefreshToken = g.refresh_token_configured;
  const rtSource = g.refresh_token_source || 'missing';
  const senderEmail = g.sender_email || 'Not configured';

  const statusDot = (ok) => ok
    ? '<span class="w-3 h-3 bg-green-400 rounded-full inline-block mr-2"></span>'
    : '<span class="w-3 h-3 bg-red-400 rounded-full inline-block mr-2"></span>';

  return `
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900">Email Delivery Setup</h2>
        <p class="text-sm text-gray-500 mt-1">Configure Gmail OAuth2 so your app can send verification codes, reports, and outreach emails.</p>
      </div>
      <button onclick="loadView('email-setup')" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors">
        <i class="fas fa-sync-alt mr-1"></i> Refresh
      </button>
    </div>

    <!-- Overall Status -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center ${isReady ? 'bg-green-100' : 'bg-red-100'}">
          <i class="fas ${isReady ? 'fa-check-circle text-green-600' : 'fa-exclamation-triangle text-red-600'} text-2xl"></i>
        </div>
        <div>
          <h3 class="text-lg font-bold ${isReady ? 'text-green-800' : 'text-red-800'}">${isReady ? 'Email Delivery Active' : 'Email Delivery Not Configured'}</h3>
          <p class="text-sm text-gray-500">${isReady ? 'Emails are being sent from ' + senderEmail : 'Complete the steps below to enable email sending'}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center mb-2">${statusDot(hasClientId)}<span class="font-semibold text-sm">Gmail Client ID</span></div>
          <p class="text-xs text-gray-500">${hasClientId ? 'Configured in environment' : 'Missing — set GMAIL_CLIENT_ID'}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center mb-2">${statusDot(hasClientSecret)}<span class="font-semibold text-sm">Gmail Client Secret</span></div>
          <p class="text-xs text-gray-500">${hasClientSecret ? 'Source: ' + csSource : 'Missing — paste below'}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center mb-2">${statusDot(hasRefreshToken)}<span class="font-semibold text-sm">Gmail Refresh Token</span></div>
          <p class="text-xs text-gray-500">${hasRefreshToken ? 'Source: ' + rtSource : 'Missing — authorize below'}</p>
        </div>
      </div>
    </div>

    <!-- Step 1: Client Secret -->
    <div class="bg-white rounded-2xl border ${hasClientSecret ? 'border-green-200' : 'border-amber-200'} p-6 shadow-sm">
      <div class="flex items-start gap-3 mb-4">
        <div class="w-8 h-8 rounded-full ${hasClientSecret ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
        <div class="flex-1">
          <h4 class="font-bold text-gray-800">${hasClientSecret ? 'Client Secret Configured' : 'Paste Your Gmail OAuth Client Secret'}</h4>
          <p class="text-sm text-gray-500 mt-1">Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-blue-600 underline">GCP Console &rarr; Credentials</a>, click your OAuth 2.0 Client ID, copy the <strong>Client Secret</strong>, and paste it below.</p>
        </div>
      </div>
      <div class="flex gap-3">
        <input type="password" id="gmailClientSecret" placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxx"
               class="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        <button onclick="saveGmailClientSecret()" id="saveSecretBtn"
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors whitespace-nowrap">
          <i class="fas fa-save mr-1"></i> ${hasClientSecret ? 'Update Secret' : 'Save Secret'}
        </button>
      </div>
      <p class="text-xs text-gray-400 mt-2"><i class="fas fa-lock mr-1"></i> Stored securely in your database. Never exposed to frontend.</p>
    </div>

    <!-- Step 2: Authorize Gmail -->
    <div class="bg-white rounded-2xl border ${hasRefreshToken ? 'border-green-200' : (hasClientSecret ? 'border-blue-200' : 'border-gray-200')} p-6 shadow-sm ${!hasClientSecret ? 'opacity-50 pointer-events-none' : ''}">
      <div class="flex items-start gap-3 mb-4">
        <div class="w-8 h-8 rounded-full ${hasRefreshToken ? 'bg-green-100 text-green-700' : (hasClientSecret ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400')} flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
        <div class="flex-1">
          <h4 class="font-bold text-gray-800">${hasRefreshToken ? 'Gmail Authorized' : 'Authorize Gmail Access'}</h4>
          <p class="text-sm text-gray-500 mt-1">${hasRefreshToken ? 'Gmail is authorized to send emails from <strong>' + senderEmail + '</strong>.' : 'Click the button below to sign in with Google and grant email sending permission.'}</p>
        </div>
      </div>
      ${hasClientSecret ? '<a href="/api/auth/gmail" class="inline-flex items-center gap-2 px-6 py-3 ' + (hasRefreshToken ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-600 hover:bg-red-700 text-white') + ' rounded-xl font-semibold text-sm transition-colors"><svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' + (hasRefreshToken ? 'Re-authorize Gmail' : 'Sign in with Google') + '</a>' : '<p class="text-sm text-gray-400"><i class="fas fa-arrow-up mr-1"></i> Complete Step 1 first.</p>'}
    </div>

    <!-- Step 3: Test -->
    <div class="bg-white rounded-2xl border ${isReady ? 'border-green-200' : 'border-gray-200'} p-6 shadow-sm ${!isReady ? 'opacity-50 pointer-events-none' : ''}">
      <div class="flex items-start gap-3 mb-4">
        <div class="w-8 h-8 rounded-full ${isReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'} flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
        <div class="flex-1">
          <h4 class="font-bold text-gray-800">Test Email Delivery</h4>
          <p class="text-sm text-gray-500 mt-1">Send a test verification code to any email address to confirm everything works.</p>
        </div>
      </div>
      ${isReady ? '<div class="flex gap-3"><input type="email" id="testEmailAddr" placeholder="your@email.com" class="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"><button onclick="testEmailDelivery()" id="testEmailBtn" class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"><i class="fas fa-paper-plane mr-1"></i> Send Test</button></div><div id="testEmailResult" class="hidden mt-3 p-3 rounded-xl text-sm"></div>' : '<p class="text-sm text-gray-400"><i class="fas fa-arrow-up mr-1"></i> Complete Steps 1 and 2 first.</p>'}
    </div>

    <!-- Important Notes -->
    <div class="bg-blue-50 border border-blue-100 rounded-2xl p-5">
      <h4 class="font-bold text-blue-800 mb-2"><i class="fas fa-info-circle mr-1"></i> Important Notes</h4>
      <ul class="text-sm text-blue-700 space-y-1 list-disc list-inside">
        <li>Make sure <code class="bg-blue-100 px-1 rounded">https://roofreporterai.com/api/auth/gmail/callback</code> is listed as an authorized redirect URI in your GCP OAuth Client.</li>
        <li>The Gmail API scope <code class="bg-blue-100 px-1 rounded">gmail.send</code> only allows sending — it cannot read your inbox.</li>
        <li>Credentials are stored in your D1 database, not in environment variables.</li>
        <li>This same Gmail connection is used for verification codes, report delivery, and email outreach.</li>
      </ul>
    </div>
  </div>`;
}

// Email Setup action: save client secret
async function saveGmailClientSecret() {
  const input = document.getElementById('gmailClientSecret');
  const btn = document.getElementById('saveSecretBtn');
  const secret = input.value.trim();
  if (!secret || secret.length < 10) { alert('Please paste a valid Gmail OAuth client secret.'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
  try {
    const res = await saFetch('/api/auth/gmail/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_secret: secret })
    });
    if (!res) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Secret'; return; }
    const data = await res.json();
    if (res.ok && data.success) {
      btn.innerHTML = '<i class="fas fa-check mr-1"></i> Saved!';
      btn.classList.replace('bg-blue-600', 'bg-green-600');
      input.value = ''; input.placeholder = 'Secret saved successfully';
      setTimeout(() => loadView('email-setup'), 1200);
    } else {
      alert(data.error || 'Failed to save.'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Secret';
    }
  } catch (e) { alert('Network error.'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Secret'; }
}

// Email Setup action: test email delivery
async function testEmailDelivery() {
  const input = document.getElementById('testEmailAddr');
  const btn = document.getElementById('testEmailBtn');
  const result = document.getElementById('testEmailResult');
  const email = input.value.trim();
  if (!email || !email.includes('@')) { alert('Please enter a valid email address.'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Sending...';
  result.classList.add('hidden');
  try {
    const res = await fetch('/api/customer/send-verification', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    result.classList.remove('hidden');
    if (data.email_sent) {
      result.className = 'mt-3 p-3 rounded-xl text-sm bg-green-50 text-green-800 border border-green-200';
      result.innerHTML = '<i class="fas fa-check-circle mr-1"></i> <strong>Email sent!</strong> Check ' + email + ' inbox (and spam).';
    } else if (data.fallback_code) {
      result.className = 'mt-3 p-3 rounded-xl text-sm bg-amber-50 text-amber-800 border border-amber-200';
      result.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> Email delivery failed. Fallback code: <strong class="font-mono text-lg">' + data.fallback_code + '</strong><br><span class="text-xs">Complete Gmail OAuth setup above to fix.</span>';
    } else {
      result.className = 'mt-3 p-3 rounded-xl text-sm bg-red-50 text-red-800 border border-red-200';
      result.innerHTML = '<i class="fas fa-times-circle mr-1"></i> ' + (data.error || 'Failed.');
    }
  } catch (e) {
    result.classList.remove('hidden');
    result.className = 'mt-3 p-3 rounded-xl text-sm bg-red-50 text-red-800 border border-red-200';
    result.innerHTML = '<i class="fas fa-times-circle mr-1"></i> Network error.';
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> Send Test';
}

// ============================================================
// VIEW: SITE ANALYTICS — Every click tracked
// ============================================================
window.saChangeAnalyticsPeriod = function(p) {
  SA.analyticsPeriod = p;
  loadView('analytics');
};

function renderAnalyticsView() {
  const d = SA.data.analytics || {};
  const o = d.overview || {};
  const pages = d.top_pages || [];
  const countries = d.top_countries || [];
  const referrers = d.top_referrers || [];
  const visitors = d.recent_visitors || [];
  const hourly = d.hourly_traffic || [];
  const devices = d.device_breakdown || [];

  // Country flag emoji helper
  function countryFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    const offset = 127397;
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
  }

  // Event type badge
  function eventBadge(type) {
    const m = {
      pageview: 'bg-blue-100 text-blue-700',
      click: 'bg-amber-100 text-amber-700',
      page_exit: 'bg-gray-100 text-gray-500',
      scroll: 'bg-indigo-100 text-indigo-700',
      session_start: 'bg-green-100 text-green-700'
    };
    return '<span class="px-1.5 py-0.5 rounded-full text-[10px] font-medium ' + (m[type] || 'bg-gray-100 text-gray-600') + '">' + type + '</span>';
  }

  // Device icon
  function deviceIcon(type) {
    if (type === 'mobile') return '<i class="fas fa-mobile-alt text-blue-500"></i>';
    if (type === 'tablet') return '<i class="fas fa-tablet-alt text-indigo-500"></i>';
    if (type === 'bot') return '<i class="fas fa-robot text-gray-400"></i>';
    return '<i class="fas fa-desktop text-gray-700"></i>';
  }

  // Sparkline-style hourly bar chart
  const maxHourly = Math.max(...hourly.map(h => h.pageviews || 0), 1);
  const hourlyBars = hourly.slice(-24).map(h => {
    const pct = Math.round(((h.pageviews || 0) / maxHourly) * 100);
    const hour = (h.hour || '').split(' ')[1] || '';
    return '<div class="flex flex-col items-center gap-1" title="' + h.hour + ': ' + h.pageviews + ' views, ' + h.visitors + ' visitors">' +
      '<div class="w-3 bg-red-200 rounded-t relative" style="height:40px">' +
        '<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-600 to-red-400 rounded-t" style="height:' + pct + '%"></div>' +
      '</div>' +
      '<span class="text-[8px] text-gray-400">' + hour.replace(':00','') + '</span>' +
    '</div>';
  }).join('');

  // Device totals
  const totalDeviceHits = devices.reduce((s, d) => s + (d.count || 0), 0) || 1;

  const periodLabels = { '24h': 'Last 24 Hours', '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days' };

  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-chart-line mr-2 text-red-500"></i>Site Analytics</h2>
        <p class="text-sm text-gray-500 mt-1">Every click, pageview, and visitor tracked in real time</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400">${periodLabels[d.period] || d.period}</span>
        <select onchange="saChangeAnalyticsPeriod(this.value)" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500">
          <option value="24h" ${SA.analyticsPeriod === '24h' ? 'selected' : ''}>Last 24 Hours</option>
          <option value="7d" ${SA.analyticsPeriod === '7d' ? 'selected' : ''}>Last 7 Days</option>
          <option value="30d" ${SA.analyticsPeriod === '30d' ? 'selected' : ''}>Last 30 Days</option>
          <option value="90d" ${SA.analyticsPeriod === '90d' ? 'selected' : ''}>Last 90 Days</option>
        </select>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${samc('Total Pageviews', (o.pageviews || 0).toLocaleString(), 'fa-eye', 'blue', (o.total_events || 0).toLocaleString() + ' total events')}
      ${samc('Unique Visitors', (o.unique_visitors || 0).toLocaleString(), 'fa-users', 'green', (o.sessions || 0).toLocaleString() + ' sessions')}
      ${samc('Total Clicks', (o.clicks || 0).toLocaleString(), 'fa-mouse-pointer', 'amber', (o.unique_ips || 0).toLocaleString() + ' unique IPs')}
      ${samc('Avg Time on Page', (o.avg_time_on_page || 0) + 's', 'fa-clock', 'purple', 'Avg scroll: ' + (o.avg_scroll_depth || 0) + '%')}
    </div>

    <!-- Hourly Traffic -->
    ${saSection('Traffic (Last 24 Hours)', 'fa-chart-bar', hourly.length === 0 
      ? '<p class="text-gray-400 text-sm text-center py-4">No traffic data yet. Events will appear here once visitors interact with your site.</p>'
      : '<div class="flex items-end gap-0.5 justify-between h-16">' + hourlyBars + '</div>'
    )}

    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <!-- Top Pages -->
      ${saSection('Top Pages', 'fa-file-alt', pages.length === 0 
        ? '<p class="text-gray-400 text-sm">No page data yet</p>' 
        : '<div class="space-y-1.5 max-h-80 overflow-y-auto">' + pages.map(function(p) {
            const maxViews = pages[0]?.views || 1;
            const pct = Math.round((p.views / maxViews) * 100);
            return '<div class="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50">' +
              '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center gap-2">' +
                  '<span class="text-xs font-mono text-gray-700 truncate max-w-[200px]" title="' + p.page_url + '">' + p.page_url + '</span>' +
                '</div>' +
                '<div class="w-full bg-gray-100 rounded-full h-1.5 mt-1"><div class="bg-red-500 h-1.5 rounded-full" style="width:' + pct + '%"></div></div>' +
              '</div>' +
              '<div class="text-right flex-shrink-0">' +
                '<span class="text-sm font-bold text-gray-800">' + p.views + '</span>' +
                '<span class="text-[10px] text-gray-400 block">' + (p.unique_visitors || 0) + ' uniq</span>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
      )}

      <!-- Top Countries -->
      ${saSection('Visitors by Country', 'fa-globe', countries.length === 0 
        ? '<p class="text-gray-400 text-sm">No country data yet</p>' 
        : '<div class="space-y-1.5 max-h-80 overflow-y-auto">' + countries.map(function(c) {
            return '<div class="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">' +
              '<div class="flex items-center gap-2">' +
                '<span class="text-lg">' + countryFlag(c.country) + '</span>' +
                '<span class="text-sm font-medium text-gray-700">' + (c.country || 'Unknown') + '</span>' +
              '</div>' +
              '<div class="text-right">' +
                '<span class="text-sm font-bold text-gray-800">' + c.hits + '</span>' +
                '<span class="text-[10px] text-gray-400 block">' + (c.visitors || 0) + ' visitors</span>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
      )}
    </div>

    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <!-- Top Referrers -->
      ${saSection('Top Referrers', 'fa-external-link-alt', referrers.length === 0 
        ? '<p class="text-gray-400 text-sm">No referrer data yet — visitors are arriving directly</p>'
        : '<div class="space-y-1.5 max-h-60 overflow-y-auto">' + referrers.map(function(r) {
            let domain = r.referrer;
            try { domain = new URL(r.referrer).hostname; } catch(e) {}
            return '<div class="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">' +
              '<span class="text-xs text-gray-600 truncate max-w-[250px]" title="' + r.referrer + '">' +
                '<i class="fas fa-link mr-1 text-gray-400"></i>' + domain +
              '</span>' +
              '<div class="text-right flex-shrink-0">' +
                '<span class="text-sm font-bold text-gray-800">' + r.hits + '</span>' +
                '<span class="text-[10px] text-gray-400 block">' + (r.visitors || 0) + ' visitors</span>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
      )}

      <!-- Device Breakdown -->
      ${saSection('Devices & Browsers', 'fa-laptop', devices.length === 0 
        ? '<p class="text-gray-400 text-sm">No device data yet</p>'
        : '<div class="space-y-3">' + devices.map(function(d) {
            const pct = Math.round((d.count / totalDeviceHits) * 100);
            return '<div class="flex items-center gap-3">' +
              '<div class="w-8 text-center">' + deviceIcon(d.device_type) + '</div>' +
              '<div class="flex-1">' +
                '<div class="flex justify-between mb-0.5">' +
                  '<span class="text-sm font-medium text-gray-700 capitalize">' + (d.device_type || 'unknown') + '</span>' +
                  '<span class="text-xs text-gray-500">' + d.count + ' (' + pct + '%)</span>' +
                '</div>' +
                '<div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-gradient-to-r from-red-500 to-rose-400 h-2 rounded-full" style="width:' + pct + '%"></div></div>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
      )}
    </div>

    <!-- Live Event Feed -->
    ${saSection('Live Event Feed (Last 50)', 'fa-stream', visitors.length === 0
      ? '<p class="text-gray-400 text-sm text-center py-4">No events recorded yet. The tracker will capture every click and pageview automatically.</p>'
      : '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50"><tr>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Time</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Event</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Page</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Detail</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Location</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Device</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">IP</th>' +
        '</tr></thead><tbody class="divide-y divide-gray-50">' +
        visitors.map(function(v) {
          const detail = v.event_type === 'click' 
            ? '<span class="text-[10px] text-amber-700" title="' + (v.click_element||'') + '">' + (v.click_text || v.click_element || '-').substring(0,40) + '</span>'
            : v.event_type === 'page_exit' 
              ? '<span class="text-[10px] text-gray-500">' + (v.time_on_page || 0) + 's / ' + (v.scroll_depth || 0) + '% scroll</span>'
              : '<span class="text-[10px] text-gray-400">' + (v.referrer ? 'from ' + v.referrer.substring(0,30) : '-') + '</span>';
          return '<tr class="hover:bg-red-50/30 transition-colors">' +
            '<td class="px-3 py-1.5 text-[10px] text-gray-500 whitespace-nowrap">' + fmtDateTime(v.created_at) + '</td>' +
            '<td class="px-3 py-1.5">' + eventBadge(v.event_type) + '</td>' +
            '<td class="px-3 py-1.5 text-xs font-mono text-gray-700 max-w-[150px] truncate" title="' + v.page_url + '">' + (v.page_url || '/') + '</td>' +
            '<td class="px-3 py-1.5">' + detail + '</td>' +
            '<td class="px-3 py-1.5 text-[10px] text-gray-600">' + 
              (v.country ? countryFlag(v.country) + ' ' : '') + (v.city || '') + (v.region ? ', ' + v.region : '') +
            '</td>' +
            '<td class="px-3 py-1.5 text-[10px] text-gray-500">' + deviceIcon(v.device_type) + ' ' + (v.browser || '') + ' / ' + (v.os || '') + '</td>' +
            '<td class="px-3 py-1.5 text-[10px] font-mono text-gray-400">' + (v.ip_address || '-') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>',
      '<button onclick="saRefreshAnalytics()" class="text-xs text-red-600 hover:text-red-800 font-medium"><i class="fas fa-sync-alt mr-1"></i>Refresh</button>'
    )}
  `;
}

window.saRefreshAnalytics = function() {
  loadView('analytics');
};

// ============================================================
// VIEW: GOOGLE ANALYTICS 4 — GA4 Data API + Realtime + Measurement Protocol
// Full GA4 integration for super-admin monitoring
// ============================================================

window.saChangeGA4Period = function(p) {
  SA.ga4Period = p;
  loadView('ga4');
};

window.saSetGA4Tab = function(tab) {
  SA.ga4Tab = tab;
  renderContent();
};

window.saRefreshGA4 = function() {
  loadView('ga4');
};

window.saTestGA4Event = function() {
  saFetch('/api/analytics/ga4/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...saHeaders() },
    body: JSON.stringify({
      client_id: 'superadmin_test_' + Date.now(),
      events: [{ name: 'admin_test_ping', params: { source: 'super_admin_dashboard', timestamp: new Date().toISOString() } }]
    })
  }).then(async r => {
    if (!r) return;
    const d = await r.json();
    alert(d.success ? 'Test event sent successfully to GA4!' : 'Event send failed: ' + JSON.stringify(d));
  });
};

function renderGA4View() {
  const status = SA.data.ga4_status || {};
  const report = SA.data.ga4_report || {};
  const realtime = SA.data.ga4_realtime || {};
  const tab = SA.ga4Tab || 'overview';

  const periodLabels = { '24h': 'Last 24h', '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', '365d': '1 Year' };

  // Check if GA4 is configured at all
  const ga4Configured = status.ga4_measurement_id || status.ga4_property_id;

  // Helper: extract GA4 row data into readable format
  function ga4Rows(dataset) {
    if (!dataset || !dataset.rows) return [];
    return dataset.rows;
  }
  function ga4Headers(dataset) {
    if (!dataset || !dataset.headers) return [];
    return dataset.headers;
  }
  function ga4Totals(dataset) {
    if (!dataset || !dataset.totals) return {};
    return dataset.totals;
  }

  // ── Tab navigation ──
  const tabItems = [
    { id: 'overview', label: 'Overview', icon: 'fa-tachometer-alt' },
    { id: 'pages', label: 'Pages', icon: 'fa-file-alt' },
    { id: 'sources', label: 'Traffic Sources', icon: 'fa-route' },
    { id: 'geo', label: 'Geography', icon: 'fa-globe-americas' },
    { id: 'realtime', label: 'Realtime', icon: 'fa-bolt' },
    { id: 'config', label: 'Configuration', icon: 'fa-cog' }
  ];

  const tabNav = '<div class="flex gap-1 overflow-x-auto pb-2 mb-4">' +
    tabItems.map(t => '<button onclick="saSetGA4Tab(\'' + t.id + '\')" class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ' +
      (tab === t.id ? 'bg-red-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200') +
      '"><i class="fas ' + t.icon + '"></i> ' + t.label + '</button>'
    ).join('') + '</div>';

  // ── Header ──
  const header = '<div class="mb-4 flex items-center justify-between">' +
    '<div>' +
      '<h2 class="text-2xl font-black text-gray-900"><i class="fab fa-google mr-2 text-red-500"></i>Google Analytics 4</h2>' +
      '<p class="text-sm text-gray-500 mt-1">GA4 Data API, Real-Time Reporting & Measurement Protocol</p>' +
    '</div>' +
    '<div class="flex items-center gap-3">' +
      '<select onchange="saChangeGA4Period(this.value)" class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-red-500">' +
        ['24h','7d','30d','90d','365d'].map(p => '<option value="' + p + '"' + (SA.ga4Period === p ? ' selected' : '') + '>' + periodLabels[p] + '</option>').join('') +
      '</select>' +
      '<button onclick="saRefreshGA4()" class="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>Refresh</button>' +
    '</div>' +
  '</div>';

  // ── Not configured banner ──
  if (!ga4Configured && tab !== 'config') {
    return header + tabNav +
      '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">' +
        '<div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fab fa-google text-amber-600 text-2xl"></i></div>' +
        '<h3 class="text-lg font-bold text-amber-800 mb-2">Google Analytics 4 Not Configured</h3>' +
        '<p class="text-sm text-amber-700 mb-4">Set up GA4 environment variables to enable traffic monitoring via Google Analytics.</p>' +
        '<button onclick="saSetGA4Tab(\'config\')" class="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700"><i class="fas fa-cog mr-1"></i>Configure GA4</button>' +
      '</div>';
  }

  // ── OVERVIEW TAB ──
  if (tab === 'overview') {
    const summary = report.summary || {};
    const totals = ga4Totals(summary);
    const acq = report.acquisition || {};

    const kpiCards = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">' +
      samc('Pageviews', (totals.screenPageViews || 0).toLocaleString(), 'fa-eye', 'blue', 'GA4 Data API') +
      samc('Total Users', (totals.totalUsers || 0).toLocaleString(), 'fa-users', 'green', (totals.newUsers || 0).toLocaleString() + ' new users') +
      samc('Sessions', (totals.sessions || 0).toLocaleString(), 'fa-clock', 'indigo', 'Avg duration: ' + fmtSeconds(totals.averageSessionDuration || 0)) +
      samc('Bounce Rate', ((totals.bounceRate || 0) * 100).toFixed(1) + '%', 'fa-sign-out-alt', 'amber', (totals.engagedSessions || 0).toLocaleString() + ' engaged') +
    '</div>';

    // Acquisition source/medium table
    const acqRows = ga4Rows(acq);
    const acqTable = acqRows.length === 0 ? '<p class="text-gray-400 text-sm py-4">No acquisition data available.</p>'
      : '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50"><tr>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Source</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Medium</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Sessions</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Users</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Engaged</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Conversions</th>' +
        '</tr></thead><tbody class="divide-y divide-gray-50">' +
        acqRows.slice(0, 15).map(r => '<tr class="hover:bg-red-50/30">' +
          '<td class="px-3 py-2 text-xs font-medium text-gray-700">' + (r[0] || '(direct)') + '</td>' +
          '<td class="px-3 py-2 text-xs text-gray-500">' + (r[1] || '(none)') + '</td>' +
          '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[2] || 0) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[3] || 0) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[4] || 0) + '</td>' +
          '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[5] || 0) + '</td>' +
        '</tr>').join('') +
        '</tbody></table></div>';

    // Device breakdown from GA4
    const devData = report.devices || {};
    const devRows = ga4Rows(devData);
    const totalDevUsers = devRows.reduce((s, r) => s + (r[1] || 0), 0) || 1;
    const deviceBars = devRows.length === 0 ? '<p class="text-gray-400 text-sm">No device data</p>'
      : '<div class="space-y-3">' + devRows.map(r => {
          const cat = r[0] || 'unknown';
          const users = r[1] || 0;
          const pct = Math.round((users / totalDevUsers) * 100);
          const icons = { desktop: 'fa-desktop', mobile: 'fa-mobile-alt', tablet: 'fa-tablet-alt' };
          return '<div class="flex items-center gap-3">' +
            '<div class="w-8 text-center"><i class="fas ' + (icons[cat] || 'fa-question') + ' text-gray-700"></i></div>' +
            '<div class="flex-1">' +
              '<div class="flex justify-between mb-0.5"><span class="text-sm font-medium text-gray-700 capitalize">' + cat + '</span><span class="text-xs text-gray-500">' + users + ' users (' + pct + '%)</span></div>' +
              '<div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-gradient-to-r from-red-500 to-rose-400 h-2 rounded-full" style="width:' + pct + '%"></div></div>' +
            '</div></div>';
        }).join('') + '</div>';

    return header + tabNav + kpiCards +
      '<div class="grid lg:grid-cols-2 gap-6 mb-6">' +
        saSection('User Acquisition (Source/Medium)', 'fa-route', acqTable) +
        saSection('Devices (GA4)', 'fa-laptop', deviceBars) +
      '</div>';
  }

  // ── PAGES TAB ──
  if (tab === 'pages') {
    const topPages = report.top_pages || {};
    const pgRows = ga4Rows(topPages);
    const maxPV = pgRows.length > 0 ? Math.max(...pgRows.map(r => r[1] || 0), 1) : 1;

    const pagesContent = pgRows.length === 0 ? '<p class="text-gray-400 text-sm py-4">No page data from GA4 for this period.</p>'
      : '<div class="space-y-1.5 max-h-[500px] overflow-y-auto">' + pgRows.map(r => {
          const path = r[0] || '/';
          const views = r[1] || 0;
          const users = r[2] || 0;
          const avgDur = r[3] || 0;
          const bounce = r[4] || 0;
          const pct = Math.round((views / maxPV) * 100);
          return '<div class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-2">' +
                '<span class="text-xs font-mono text-gray-700 truncate max-w-[300px]" title="' + path + '">' + path + '</span>' +
              '</div>' +
              '<div class="w-full bg-gray-100 rounded-full h-1.5 mt-1"><div class="bg-red-500 h-1.5 rounded-full" style="width:' + pct + '%"></div></div>' +
            '</div>' +
            '<div class="text-right flex-shrink-0 flex gap-4">' +
              '<div><span class="text-sm font-bold text-gray-800">' + views + '</span><span class="text-[10px] text-gray-400 block">views</span></div>' +
              '<div><span class="text-sm font-bold text-gray-600">' + users + '</span><span class="text-[10px] text-gray-400 block">users</span></div>' +
              '<div><span class="text-sm font-bold text-gray-600">' + fmtSeconds(avgDur) + '</span><span class="text-[10px] text-gray-400 block">avg time</span></div>' +
              '<div><span class="text-sm font-bold ' + (bounce > 0.7 ? 'text-red-600' : bounce > 0.5 ? 'text-amber-600' : 'text-green-600') + '">' + (bounce * 100).toFixed(0) + '%</span><span class="text-[10px] text-gray-400 block">bounce</span></div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';

    return header + tabNav + saSection('Top Pages (GA4 Data API)', 'fa-file-alt', pagesContent);
  }

  // ── TRAFFIC SOURCES TAB ──
  if (tab === 'sources') {
    const srcData = report.traffic_sources || {};
    const srcRows = ga4Rows(srcData);

    const channelContent = srcRows.length === 0 ? '<p class="text-gray-400 text-sm py-4">No traffic source data.</p>'
      : '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50"><tr>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Channel Group</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Sessions</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Users</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Conversions</th>' +
        '</tr></thead><tbody class="divide-y divide-gray-50">' +
        srcRows.map(r => {
          const channelIcons = {
            'Organic Search': 'fa-search text-green-500', 'Direct': 'fa-link text-blue-500',
            'Referral': 'fa-external-link-alt text-purple-500', 'Organic Social': 'fa-share-alt text-pink-500',
            'Paid Search': 'fa-ad text-amber-500', 'Email': 'fa-envelope text-red-500',
            'Paid Social': 'fa-bullhorn text-indigo-500', 'Display': 'fa-image text-teal-500'
          };
          const icon = channelIcons[r[0]] || 'fa-globe text-gray-400';
          return '<tr class="hover:bg-red-50/30">' +
            '<td class="px-3 py-2 text-xs font-medium text-gray-700"><i class="fas ' + icon + ' mr-2"></i>' + (r[0] || 'Unknown') + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono font-bold">' + (r[1] || 0) + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[2] || 0) + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[3] || 0) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';

    // Acquisition detail
    const acqRows2 = ga4Rows(report.acquisition || {});
    const acqContent = acqRows2.length === 0 ? ''
      : saSection('Acquisition Detail (Source / Medium)', 'fa-route',
          '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50"><tr>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Source</th>' +
          '<th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Medium</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Sessions</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Users</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Engaged</th>' +
          '<th class="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Conversions</th>' +
          '</tr></thead><tbody class="divide-y divide-gray-50">' +
          acqRows2.map(r => '<tr class="hover:bg-red-50/30">' +
            '<td class="px-3 py-2 text-xs font-medium text-gray-700">' + (r[0] || '(direct)') + '</td>' +
            '<td class="px-3 py-2 text-xs text-gray-500">' + (r[1] || '(none)') + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[2] || 0) + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[3] || 0) + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[4] || 0) + '</td>' +
            '<td class="px-3 py-2 text-xs text-right font-mono">' + (r[5] || 0) + '</td>' +
          '</tr>').join('') +
          '</tbody></table></div>');

    return header + tabNav + saSection('Traffic Channels (GA4)', 'fa-route', channelContent) + acqContent;
  }

  // ── GEOGRAPHY TAB ──
  if (tab === 'geo') {
    const geoData = report.geography || {};
    const geoRows = ga4Rows(geoData);
    const maxGeoUsers = geoRows.length > 0 ? Math.max(...geoRows.map(r => r[2] || 0), 1) : 1;

    function countryFlag(code) {
      if (!code || code.length < 2) return '';
      // GA4 returns full country names, not ISO codes, so we skip emoji
      return '';
    }

    const geoContent = geoRows.length === 0 ? '<p class="text-gray-400 text-sm py-4">No geography data from GA4.</p>'
      : '<div class="space-y-1.5 max-h-[500px] overflow-y-auto">' + geoRows.map(r => {
          const country = r[0] || 'Unknown';
          const city = r[1] || '';
          const users = r[2] || 0;
          const sessions = r[3] || 0;
          const views = r[4] || 0;
          const pct = Math.round((users / maxGeoUsers) * 100);
          return '<div class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-2">' +
                '<i class="fas fa-map-marker-alt text-red-400 text-xs"></i>' +
                '<span class="text-sm font-medium text-gray-700">' + country + (city ? ' <span class="text-gray-400">/ ' + city + '</span>' : '') + '</span>' +
              '</div>' +
              '<div class="w-full bg-gray-100 rounded-full h-1.5 mt-1"><div class="bg-gradient-to-r from-red-500 to-rose-400 h-1.5 rounded-full" style="width:' + pct + '%"></div></div>' +
            '</div>' +
            '<div class="text-right flex-shrink-0 flex gap-4">' +
              '<div><span class="text-sm font-bold text-gray-800">' + users + '</span><span class="text-[10px] text-gray-400 block">users</span></div>' +
              '<div><span class="text-sm font-bold text-gray-600">' + sessions + '</span><span class="text-[10px] text-gray-400 block">sessions</span></div>' +
              '<div><span class="text-sm font-bold text-gray-600">' + views + '</span><span class="text-[10px] text-gray-400 block">views</span></div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';

    return header + tabNav + saSection('Geography (GA4 Data API)', 'fa-globe-americas', geoContent);
  }

  // ── REALTIME TAB ──
  if (tab === 'realtime') {
    const rtPages = realtime.pages || {};
    const rtGeo = realtime.geography || {};
    const rtSources = realtime.sources || {};
    const rtDevices = realtime.devices || {};

    const rtPgRows = ga4Rows(rtPages);
    const rtGeoRows = ga4Rows(rtGeo);
    const rtSrcRows = ga4Rows(rtSources);
    const rtDevRows = ga4Rows(rtDevices);

    const totalActiveUsers = rtPgRows.reduce((s, r) => s + (r[1] || 0), 0);

    const activeUsersBanner = '<div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 mb-6 flex items-center gap-6">' +
      '<div class="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center"><i class="fas fa-users text-green-600 text-3xl"></i></div>' +
      '<div>' +
        '<p class="text-xs font-semibold text-green-600 uppercase tracking-wider">Active Users Right Now</p>' +
        '<p class="text-5xl font-black text-green-800">' + totalActiveUsers + '</p>' +
        '<p class="text-sm text-green-600 mt-1">Live via GA4 Realtime API</p>' +
      '</div>' +
      '<div class="ml-auto">' +
        '<button onclick="saRefreshGA4()" class="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 shadow-sm"><i class="fas fa-sync-alt mr-1 fa-spin"></i>Refresh</button>' +
      '</div>' +
    '</div>';

    const rtPagesContent = rtPgRows.length === 0 ? '<p class="text-gray-400 text-sm">No active pages</p>'
      : '<div class="space-y-1">' + rtPgRows.slice(0, 20).map(r => '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">' +
          '<span class="text-xs font-mono text-gray-700 truncate max-w-[300px]">' + (r[0] || '/') + '</span>' +
          '<span class="text-sm font-bold text-green-700">' + (r[1] || 0) + ' <span class="text-[10px] text-gray-400">active</span></span>' +
        '</div>').join('') + '</div>';

    const rtGeoContent = rtGeoRows.length === 0 ? '<p class="text-gray-400 text-sm">No geo data</p>'
      : '<div class="space-y-1">' + rtGeoRows.slice(0, 15).map(r => '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">' +
          '<span class="text-sm text-gray-700"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>' + (r[0] || 'Unknown') + '</span>' +
          '<span class="text-sm font-bold text-green-700">' + (r[1] || 0) + '</span>' +
        '</div>').join('') + '</div>';

    const rtSrcContent = rtSrcRows.length === 0 ? '<p class="text-gray-400 text-sm">No source data</p>'
      : '<div class="space-y-1">' + rtSrcRows.map(r => '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">' +
          '<span class="text-sm text-gray-700">' + (r[0] || 'Unknown') + '</span>' +
          '<span class="text-sm font-bold text-green-700">' + (r[1] || 0) + '</span>' +
        '</div>').join('') + '</div>';

    const rtDevContent = rtDevRows.length === 0 ? '<p class="text-gray-400 text-sm">No device data</p>'
      : '<div class="space-y-1">' + rtDevRows.map(r => {
          const icons = { desktop: 'fa-desktop', mobile: 'fa-mobile-alt', tablet: 'fa-tablet-alt' };
          return '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">' +
            '<span class="text-sm text-gray-700"><i class="fas ' + (icons[r[0]] || 'fa-question') + ' mr-2 text-gray-500"></i>' + (r[0] || 'Unknown') + '</span>' +
            '<span class="text-sm font-bold text-green-700">' + (r[1] || 0) + '</span>' +
          '</div>';
        }).join('') + '</div>';

    return header + tabNav + activeUsersBanner +
      '<div class="grid lg:grid-cols-2 gap-6">' +
        saSection('Active Pages', 'fa-file-alt', rtPagesContent) +
        saSection('Active Countries', 'fa-globe', rtGeoContent) +
        saSection('Active Sources', 'fa-route', rtSrcContent) +
        saSection('Active Devices', 'fa-laptop', rtDevContent) +
      '</div>';
  }

  // ── CONFIGURATION TAB ──
  if (tab === 'config') {
    const envItems = [
      { key: 'GA4_MEASUREMENT_ID', value: status.ga4_measurement_id || '(not set)', ok: !!status.ga4_measurement_id, desc: 'GA4 Measurement ID (e.g. G-XXXXXXXXXX). Required for frontend tracking via gtag.js and server-side Measurement Protocol events.' },
      { key: 'GA4_API_SECRET', value: status.ga4_api_secret ? 'Set' : '(not set)', ok: status.ga4_api_secret, desc: 'Measurement Protocol API Secret from GA4 Admin > Data Streams > Measurement Protocol. Required for server-side event tracking.' },
      { key: 'GA4_PROPERTY_ID', value: status.ga4_property_id || '(not set)', ok: !!status.ga4_property_id, desc: 'GA4 Property ID (numeric or "properties/123456789"). Required for Data API report queries and Realtime API.' },
      { key: 'GCP_SERVICE_ACCOUNT_KEY', value: status.gcp_service_account ? 'Set' : '(not set)', ok: status.gcp_service_account, desc: 'GCP Service Account JSON key with Analytics Viewer role. Used for OAuth2 authentication to the GA4 Data API.' }
    ];

    const capabilities = [
      { label: 'Frontend GA4 Tracking (gtag.js)', ok: status.frontend_tracking, desc: 'Auto-injects GA4 gtag.js into all HTML pages' },
      { label: 'Server-Side Event Tracking (Measurement Protocol)', ok: status.server_side_events, desc: 'Send backend events (report_generated, payment_completed) to GA4' },
      { label: 'GA4 Data API (Reports)', ok: status.data_api, desc: 'Query pageviews, users, sessions, acquisition, geography data' },
      { label: 'GA4 Realtime API', ok: status.realtime_api, desc: 'See active users, pages, and sources in real-time' }
    ];

    const envContent = '<div class="space-y-3">' + envItems.map(e =>
      '<div class="flex items-start gap-3 p-3 rounded-xl ' + (e.ok ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200') + '">' +
        '<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ' + (e.ok ? 'bg-green-100' : 'bg-gray-200') + '"><i class="fas ' + (e.ok ? 'fa-check text-green-600' : 'fa-times text-gray-400') + '"></i></div>' +
        '<div class="flex-1">' +
          '<div class="flex items-center gap-2"><code class="text-xs font-mono font-bold text-gray-800">' + e.key + '</code>' +
            '<span class="text-xs px-2 py-0.5 rounded-full font-medium ' + (e.ok ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500') + '">' + e.value + '</span>' +
          '</div>' +
          '<p class="text-[11px] text-gray-500 mt-1">' + e.desc + '</p>' +
        '</div>' +
      '</div>'
    ).join('') + '</div>';

    const capContent = '<div class="space-y-2 mt-4">' + capabilities.map(c =>
      '<div class="flex items-center gap-3 p-2 rounded-lg">' +
        '<div class="w-6 h-6 rounded-full flex items-center justify-center ' + (c.ok ? 'bg-green-100' : 'bg-red-100') + '"><i class="fas ' + (c.ok ? 'fa-check text-green-600 text-xs' : 'fa-times text-red-500 text-xs') + '"></i></div>' +
        '<div class="flex-1"><span class="text-sm font-medium ' + (c.ok ? 'text-green-800' : 'text-gray-500') + '">' + c.label + '</span>' +
          '<p class="text-[10px] text-gray-400">' + c.desc + '</p>' +
        '</div>' +
      '</div>'
    ).join('') + '</div>';

    const setupGuide = '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">' +
      '<h4 class="font-bold text-blue-800 text-sm mb-2"><i class="fas fa-info-circle mr-1"></i>Setup Guide</h4>' +
      '<ol class="text-xs text-blue-700 space-y-2 list-decimal list-inside">' +
        '<li>Go to <a href="https://analytics.google.com" target="_blank" class="underline">Google Analytics</a> &rarr; create a GA4 property for your website</li>' +
        '<li>Copy the <strong>Measurement ID</strong> (G-XXXXXXXXXX) from Admin &rarr; Data Streams</li>' +
        '<li>Create a <strong>Measurement Protocol API Secret</strong> under the same Data Stream</li>' +
        '<li>Note the <strong>Property ID</strong> (numeric) from Admin &rarr; Property Settings</li>' +
        '<li>Ensure your GCP service account has <strong>Analytics Viewer</strong> role on the GA4 property</li>' +
        '<li>Set all env vars in Cloudflare Pages: <code>GA4_MEASUREMENT_ID</code>, <code>GA4_API_SECRET</code>, <code>GA4_PROPERTY_ID</code></li>' +
      '</ol>' +
    '</div>';

    const testSection = status.server_side_events
      ? '<div class="mt-4"><button onclick="saTestGA4Event()" class="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700"><i class="fas fa-paper-plane mr-1"></i>Send Test Event to GA4</button><span class="text-xs text-gray-400 ml-2">Sends an admin_test_ping event via Measurement Protocol</span></div>'
      : '';

    return header + tabNav +
      saSection('Environment Variables', 'fa-key', envContent) +
      saSection('GA4 Capabilities', 'fa-check-double', capContent + testSection) +
      '<div class="mb-6">' + setupGuide + '</div>';
  }

  return header + tabNav + '<p class="text-gray-400">Unknown tab</p>';
}

// Fix saTestGA4Event to use POST properly
window.saTestGA4Event = async function() {
  try {
    const res = await fetch('/api/analytics/ga4/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...saHeaders() },
      body: JSON.stringify({
        client_id: 'superadmin_test_' + Date.now(),
        events: [{ name: 'admin_test_ping', params: { source: 'super_admin_dashboard', timestamp: new Date().toISOString() } }]
      })
    });
    const d = await res.json();
    alert(d.success ? 'Test event sent successfully to GA4!' : 'Event send failed: ' + JSON.stringify(d));
  } catch(e) {
    alert('Error: ' + e.message);
  }
};

// ============================================================
// VIEW: PRICING & BILLING — Full control over all pricing
// ============================================================

function renderPricingView() {
  const d = SA.data.pricing || {};
  const p = d.pricing || {};
  const packages = d.packages || [];
  const sq = SA.data.square || {};

  const activePackages = packages.filter(x => x.is_active);
  const inactivePackages = packages.filter(x => !x.is_active);

  return `
    <div class="mb-6">
      <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-dollar-sign mr-2 text-red-500"></i>Pricing & Billing</h2>
      <p class="text-sm text-gray-500 mt-1">Manage report pricing, credit packages, subscriptions, and Square payment terminal</p>
    </div>

    <!-- Square Status Banner -->
    <div class="mb-6 rounded-2xl p-5 ${sq.connected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center ${sq.connected ? 'bg-green-100' : 'bg-red-100'}">
            <i class="fas ${sq.connected ? 'fa-check-circle text-green-600' : 'fa-exclamation-triangle text-red-600'} text-xl"></i>
          </div>
          <div>
            <h3 class="font-bold ${sq.connected ? 'text-green-800' : 'text-red-800'}">${sq.connected ? 'Square Payment Terminal Connected' : 'Square Not Connected'}</h3>
            <p class="text-sm ${sq.connected ? 'text-green-600' : 'text-red-600'}">
              ${sq.connected
                ? (sq.merchant?.business_name || 'Connected') + (sq.location?.name ? ' — Location: ' + sq.location.name : '') + (sq.location?.currency ? ' (' + sq.location.currency + ')' : '')
                : (sq.error || 'Configure SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Cloudflare Pages secrets')}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          ${sq.stats ? `
            <div class="text-right">
              <p class="text-xs text-gray-500">${sq.stats.total_payments || 0} payments</p>
              <p class="text-xs text-gray-500">${sq.stats.total_webhooks || 0} webhooks</p>
            </div>
          ` : ''}
          <button onclick="loadView('pricing')" class="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors">
            <i class="fas fa-sync-alt mr-1"></i> Refresh
          </button>
        </div>
      </div>
    </div>

    <!-- Core Pricing Section -->
    ${saSection('Core Pricing', 'fa-tag', `
      <form id="pricingForm" onsubmit="savePricingSettings(event)">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          <!-- Price Per Report -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-file-alt mr-1 text-blue-500"></i> Price Per Report (CAD)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" id="pricePerReport"
                value="${(p.price_per_report_cents / 100).toFixed(2)}"
                class="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <p class="text-[10px] text-gray-400">Default charge for a single roof measurement report</p>
          </div>

          <!-- Free Trial Reports -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-gift mr-1 text-purple-500"></i> Free Trial Reports</label>
            <input type="number" min="0" max="50" id="freeTrialReports"
              value="${p.free_trial_reports || 3}"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            <p class="text-[10px] text-gray-400">Number of free reports for new users</p>
          </div>

          <!-- Monthly Subscription -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-calendar-alt mr-1 text-green-500"></i> Monthly Subscription (CAD)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" id="subscriptionMonthly"
                value="${(p.subscription_monthly_price_cents / 100).toFixed(2)}"
                class="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <p class="text-[10px] text-gray-400">Monthly fee for full CRM + unlimited reports (after free trial)</p>
          </div>

          <!-- Annual Subscription -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-calendar-check mr-1 text-indigo-500"></i> Annual Subscription (CAD)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" id="subscriptionAnnual"
                value="${(p.subscription_annual_price_cents / 100).toFixed(2)}"
                class="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <p class="text-[10px] text-gray-400">Annual fee (discounted) for full CRM + unlimited reports</p>
          </div>

          <!-- Roofer Secretary Monthly -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-headset mr-1 text-amber-500"></i> Roofer Secretary — Monthly (CAD)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" id="secretaryMonthly"
                value="${(p.secretary_monthly_price_cents / 100).toFixed(2)}"
                class="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <p class="text-[10px] text-gray-400">Monthly subscription for AI receptionist / call answering</p>
          </div>

          <!-- Roofer Secretary Per-Call -->
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-phone-alt mr-1 text-teal-500"></i> Roofer Secretary — Per Call (CAD)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" id="secretaryPerCall"
                value="${(p.secretary_per_call_price_cents / 100).toFixed(2)}"
                class="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <p class="text-[10px] text-gray-400">Per-call fee if using pay-as-you-go model</p>
          </div>
        </div>

        <!-- Subscription Features -->
        <div class="mt-6 space-y-2">
          <label class="block text-sm font-semibold text-gray-700"><i class="fas fa-list-check mr-1 text-sky-500"></i> Subscription Features (comma-separated)</label>
          <textarea id="subscriptionFeatures" rows="3"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Unlimited reports, Full CRM access, AI Secretary, Custom branding, Priority support">${p.subscription_features || ''}</textarea>
          <p class="text-[10px] text-gray-400">Features shown on public pricing page for the subscription plan</p>
        </div>

        <div class="mt-6 flex items-center justify-between">
          <p class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i> Changes take effect immediately for new transactions</p>
          <button type="submit" id="savePricingBtn" class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors">
            <i class="fas fa-save mr-1"></i> Save Pricing
          </button>
        </div>
      </form>
    `)}

    <!-- Credit Packages Section -->
    ${saSection('Credit Report Packages', 'fa-box-open', `
      <p class="text-sm text-gray-500 mb-4">Bulk credit packs customers purchase through Square checkout. Each credit = 1 roof report.</p>

      <!-- Active Packages -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="packageGrid">
        ${activePackages.map(pkg => renderPackageCard(pkg, true)).join('')}

        <!-- Add New Package Card -->
        <div onclick="showAddPackageModal()" class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/30 transition-all group">
          <div class="w-12 h-12 bg-gray-100 group-hover:bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
            <i class="fas fa-plus text-gray-400 group-hover:text-red-500 text-lg transition-colors"></i>
          </div>
          <p class="text-sm font-semibold text-gray-500 group-hover:text-red-600 transition-colors">Add Package</p>
          <p class="text-[10px] text-gray-400">Create a new credit pack</p>
        </div>
      </div>

      ${inactivePackages.length > 0 ? `
        <div class="border-t border-gray-100 pt-4">
          <p class="text-xs text-gray-400 mb-3"><i class="fas fa-eye-slash mr-1"></i> Inactive Packages (hidden from customers)</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            ${inactivePackages.map(pkg => renderPackageCard(pkg, false)).join('')}
          </div>
        </div>
      ` : ''}
    `)}

    <!-- Package Edit Modal (hidden) -->
    <div id="pkgModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 backdrop-blur-sm" style="display:none">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-800" id="pkgModalTitle">Edit Package</h3>
          <button onclick="closePkgModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        <form onsubmit="savePackage(event)">
          <input type="hidden" id="pkgId" value="">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Package Name</label>
              <input type="text" id="pkgName" placeholder="e.g. 10 Pack" required
                class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" id="pkgDesc" placeholder="e.g. 10 reports, $9 each"
                class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Credits (Reports)</label>
                <input type="number" id="pkgCredits" min="1" required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Total Price (CAD)</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input type="number" step="0.01" min="0.01" id="pkgPrice" required
                    class="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" id="pkgSort" min="0" value="0"
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500">
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 cursor-pointer py-2.5">
                  <input type="checkbox" id="pkgActive" checked class="w-4 h-4 text-red-600 rounded focus:ring-red-500">
                  <span class="text-sm font-medium text-gray-700">Active (visible)</span>
                </label>
              </div>
            </div>
            <div id="pkgPricePreview" class="text-center py-3 bg-gray-50 rounded-xl">
              <p class="text-xs text-gray-500">Price per report will show here</p>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button type="button" onclick="closePkgModal()" class="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" id="pkgSaveBtn" class="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
              <i class="fas fa-save mr-1"></i> Save
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderPackageCard(pkg, isActive) {
  const pricePerReport = pkg.credits > 0 ? (pkg.price_cents / 100 / pkg.credits).toFixed(2) : '0.00';
  return `
    <div class="border ${isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'} rounded-xl p-5 relative hover:shadow-md transition-all ${isActive ? 'bg-white' : 'bg-gray-50'}">
      ${!isActive ? '<span class="absolute top-2 right-2 text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">INACTIVE</span>' : ''}
      <div class="text-center mb-3">
        <p class="text-3xl font-black text-gray-900">${pkg.credits}</p>
        <p class="text-xs font-semibold text-gray-500 uppercase">${pkg.name}</p>
      </div>
      <div class="text-center mb-3">
        <p class="text-xl font-bold text-red-600">$${(pkg.price_cents / 100).toFixed(2)}</p>
        <p class="text-[10px] text-gray-400">$${pricePerReport} / report</p>
      </div>
      <p class="text-[10px] text-gray-400 text-center mb-4 min-h-[16px]">${pkg.description || ''}</p>
      <div class="flex gap-2">
        <button onclick="editPackage(${pkg.id}, '${(pkg.name || '').replace(/'/g, "\\'")}', '${(pkg.description || '').replace(/'/g, "\\'")}', ${pkg.credits}, ${pkg.price_cents}, ${pkg.sort_order || 0}, ${pkg.is_active})"
          class="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors">
          <i class="fas fa-edit mr-1"></i> Edit
        </button>
        ${isActive
          ? `<button onclick="deactivatePackage(${pkg.id})" class="px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-medium text-red-600 transition-colors" title="Deactivate"><i class="fas fa-eye-slash"></i></button>`
          : `<button onclick="activatePackage(${pkg.id})" class="px-3 py-2 bg-green-50 hover:bg-green-100 rounded-lg text-xs font-medium text-green-600 transition-colors" title="Reactivate"><i class="fas fa-eye"></i></button>`
        }
      </div>
    </div>`;
}

// ============================================================
// PRICING ACTIONS
// ============================================================

// Save core pricing settings
async function savePricingSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('savePricingBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';

  try {
    const body = {
      price_per_report_cents: Math.round(parseFloat(document.getElementById('pricePerReport').value) * 100),
      free_trial_reports: parseInt(document.getElementById('freeTrialReports').value) || 3,
      subscription_monthly_price_cents: Math.round(parseFloat(document.getElementById('subscriptionMonthly').value) * 100),
      subscription_annual_price_cents: Math.round(parseFloat(document.getElementById('subscriptionAnnual').value) * 100),
      secretary_monthly_price_cents: Math.round(parseFloat(document.getElementById('secretaryMonthly').value) * 100),
      secretary_per_call_price_cents: Math.round(parseFloat(document.getElementById('secretaryPerCall').value) * 100),
      subscription_features: document.getElementById('subscriptionFeatures').value.trim(),
    };

    const res = await fetch('/api/settings/pricing/config', {
      method: 'PUT',
      headers: { ...saHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save');
    }

    btn.innerHTML = '<i class="fas fa-check mr-1"></i> Saved!';
    btn.classList.replace('bg-red-600', 'bg-green-600');
    // Reload pricing data from DB to show updated values
    setTimeout(() => { loadView('pricing'); }, 1500);
  } catch (err) {
    alert('Error saving pricing: ' + err.message);
    btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save Pricing';
    btn.disabled = false;
  }
}
window.savePricingSettings = savePricingSettings;

// Show add-package modal
function showAddPackageModal() {
  document.getElementById('pkgModalTitle').textContent = 'Add New Package';
  document.getElementById('pkgId').value = '';
  document.getElementById('pkgName').value = '';
  document.getElementById('pkgDesc').value = '';
  document.getElementById('pkgCredits').value = '';
  document.getElementById('pkgPrice').value = '';
  document.getElementById('pkgSort').value = '0';
  document.getElementById('pkgActive').checked = true;
  document.getElementById('pkgPricePreview').innerHTML = '<p class="text-xs text-gray-500">Enter credits and price to see per-report cost</p>';
  const modal = document.getElementById('pkgModal');
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}
window.showAddPackageModal = showAddPackageModal;

// Edit existing package
function editPackage(id, name, desc, credits, priceCents, sortOrder, isActive) {
  document.getElementById('pkgModalTitle').textContent = 'Edit Package';
  document.getElementById('pkgId').value = id;
  document.getElementById('pkgName').value = name;
  document.getElementById('pkgDesc').value = desc;
  document.getElementById('pkgCredits').value = credits;
  document.getElementById('pkgPrice').value = (priceCents / 100).toFixed(2);
  document.getElementById('pkgSort').value = sortOrder;
  document.getElementById('pkgActive').checked = !!isActive;
  updatePkgPreview();
  const modal = document.getElementById('pkgModal');
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}
window.editPackage = editPackage;

function closePkgModal() {
  const modal = document.getElementById('pkgModal');
  modal.style.display = 'none';
  modal.classList.add('hidden');
}
window.closePkgModal = closePkgModal;

// Update price preview in modal
function updatePkgPreview() {
  const credits = parseInt(document.getElementById('pkgCredits')?.value) || 0;
  const price = parseFloat(document.getElementById('pkgPrice')?.value) || 0;
  const preview = document.getElementById('pkgPricePreview');
  if (!preview) return;
  if (credits > 0 && price > 0) {
    const perReport = (price / credits).toFixed(2);
    preview.innerHTML = `<p class="text-sm font-bold text-green-700">$${perReport} per report</p><p class="text-[10px] text-gray-400">${credits} credits for $${price.toFixed(2)} CAD</p>`;
  } else {
    preview.innerHTML = '<p class="text-xs text-gray-500">Enter credits and price to see per-report cost</p>';
  }
}

// Attach preview updaters after render
document.addEventListener('input', function(e) {
  if (e.target && (e.target.id === 'pkgCredits' || e.target.id === 'pkgPrice')) {
    updatePkgPreview();
  }
});

// Save (create or update) a package
async function savePackage(e) {
  e.preventDefault();
  const btn = document.getElementById('pkgSaveBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';

  const id = document.getElementById('pkgId').value;
  const body = {
    name: document.getElementById('pkgName').value.trim(),
    description: document.getElementById('pkgDesc').value.trim(),
    credits: parseInt(document.getElementById('pkgCredits').value),
    price_cents: Math.round(parseFloat(document.getElementById('pkgPrice').value) * 100),
    sort_order: parseInt(document.getElementById('pkgSort').value) || 0,
    is_active: document.getElementById('pkgActive').checked,
  };

  if (!body.name || !body.credits || !body.price_cents) {
    alert('Name, credits, and price are required.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save';
    return;
  }

  try {
    const url = id ? `/api/settings/packages/${id}` : '/api/settings/packages';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { ...saHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save package');
    }

    closePkgModal();
    loadView('pricing');
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save mr-1"></i> Save';
  }
}
window.savePackage = savePackage;

// Deactivate a package
async function deactivatePackage(id) {
  if (!confirm('Deactivate this package? It will be hidden from customers but not deleted.')) return;
  try {
    const res = await fetch(`/api/settings/packages/${id}`, {
      method: 'DELETE',
      headers: saHeaders()
    });
    if (!res.ok) throw new Error('Failed');
    loadView('pricing');
  } catch (err) {
    alert('Error deactivating package: ' + err.message);
  }
}
window.deactivatePackage = deactivatePackage;

// Reactivate a package
async function activatePackage(id) {
  try {
    const res = await fetch(`/api/settings/packages/${id}/activate`, {
      method: 'PUT',
      headers: saHeaders()
    });
    if (!res.ok) throw new Error('Failed');
    loadView('pricing');
  } catch (err) {
    alert('Error activating package: ' + err.message);
  }
}
window.activatePackage = activatePackage;

// ============================================================
// VIEW: ROOFER SECRETARY AI — Admin Management Dashboard
// ============================================================
function renderSecretaryAdminView() {
  const ov = SA.data.secretary_overview || {};
  const subs = ov.subscriptions || {};
  const calls = ov.calls || {};
  const recent = ov.recent_calls || {};
  const week = ov.week_calls || {};
  const configs = ov.configs || {};
  const msgs = ov.messages || {};
  const subsList = (SA.data.secretary_subscribers || {}).subscribers || [];
  const mrrDollars = ((subs.monthly_mrr_cents || 0) / 100).toFixed(2);

  return `<div class="slide-in space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-phone-volume mr-2 text-emerald-600"></i>Roofer Secretary AI</h2>
        <p class="text-sm text-gray-500 mt-1">Monitor subscribers, call usage, and service health across all customers</p>
      </div>
      <div class="flex gap-2">
        <button onclick="SA.view='secretary-revenue'; loadView('secretary-revenue')" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
          <i class="fas fa-chart-line mr-1"></i>Revenue & Billing
        </button>
        <button onclick="loadView('secretary-admin')" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    </div>

    <!-- Key Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${samc('Active Subscribers', subs.active_count || 0, 'fa-users', 'emerald', 'Paying $249/mo')}
      ${samc('Monthly MRR', '$' + mrrDollars, 'fa-dollar-sign', 'green', (subs.active_count || 0) + ' active subs')}
      ${samc('Total Calls (All Time)', calls.total_calls || 0, 'fa-phone', 'blue', fmtSeconds(calls.total_seconds || 0) + ' total')}
      ${samc('Calls (30d)', recent.calls_30d || 0, 'fa-chart-bar', 'purple', (recent.active_users_30d || 0) + ' active users')}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${samc('Calls (7d)', week.calls_7d || 0, 'fa-calendar-week', 'sky', fmtSeconds(week.seconds_7d || 0))}
      ${samc('Avg Call Duration', fmtSeconds(calls.avg_duration || 0), 'fa-clock', 'amber', 'Across all calls')}
      ${samc('Active Services', configs.active_services || 0, 'fa-toggle-on', 'teal', 'of ' + (configs.total_configs || 0) + ' configured')}
      ${samc('Pending/Past Due', (subs.pending_count || 0) + (subs.past_due_count || 0), 'fa-exclamation-triangle', 'red', (subs.cancelled_count || 0) + ' cancelled')}
    </div>

    <!-- Call Outcomes Breakdown -->
    ${saSection('Call Outcomes', 'fa-chart-pie', `
      <div class="grid grid-cols-4 gap-4">
        <div class="text-center p-4 bg-green-50 rounded-xl">
          <div class="text-2xl font-black text-green-700">${calls.answered || 0}</div>
          <div class="text-xs text-green-600 font-semibold mt-1"><i class="fas fa-check-circle mr-1"></i>Answered</div>
        </div>
        <div class="text-center p-4 bg-blue-50 rounded-xl">
          <div class="text-2xl font-black text-blue-700">${calls.transferred || 0}</div>
          <div class="text-xs text-blue-600 font-semibold mt-1"><i class="fas fa-exchange-alt mr-1"></i>Transferred</div>
        </div>
        <div class="text-center p-4 bg-yellow-50 rounded-xl">
          <div class="text-2xl font-black text-yellow-700">${calls.voicemail || 0}</div>
          <div class="text-xs text-yellow-600 font-semibold mt-1"><i class="fas fa-voicemail mr-1"></i>Voicemail</div>
        </div>
        <div class="text-center p-4 bg-red-50 rounded-xl">
          <div class="text-2xl font-black text-red-700">${calls.missed || 0}</div>
          <div class="text-xs text-red-600 font-semibold mt-1"><i class="fas fa-phone-slash mr-1"></i>Missed</div>
        </div>
      </div>
    `)}

    <!-- Messages & Appointments -->
    ${saSection('Messages & Appointments', 'fa-envelope', `
      <div class="grid grid-cols-3 gap-4">
        <div class="text-center p-4 bg-indigo-50 rounded-xl">
          <div class="text-2xl font-black text-indigo-700">${msgs.total_messages || 0}</div>
          <div class="text-xs text-indigo-600 font-semibold mt-1"><i class="fas fa-envelope mr-1"></i>Messages (${msgs.unread_messages || 0} unread)</div>
        </div>
        <div class="text-center p-4 bg-purple-50 rounded-xl">
          <div class="text-2xl font-black text-purple-700">${msgs.total_appointments || 0}</div>
          <div class="text-xs text-purple-600 font-semibold mt-1"><i class="fas fa-calendar mr-1"></i>Appointments (${msgs.pending_appointments || 0} pending)</div>
        </div>
        <div class="text-center p-4 bg-orange-50 rounded-xl">
          <div class="text-2xl font-black text-orange-700">${msgs.total_callbacks || 0}</div>
          <div class="text-xs text-orange-600 font-semibold mt-1"><i class="fas fa-phone-alt mr-1"></i>Callbacks (${msgs.pending_callbacks || 0} pending)</div>
        </div>
      </div>
    `)}

    <!-- Subscribers Table -->
    ${saSection('All Subscribers', 'fa-list', `
      ${subsList.length === 0 ? '<div class="py-8 text-center text-gray-400"><i class="fas fa-users text-4xl mb-3 block opacity-30"></i><p>No subscribers yet</p></div>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Customer</th>
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Service</th>
                <th class="px-4 py-3">Calls (30d)</th>
                <th class="px-4 py-3">Minutes (30d)</th>
                <th class="px-4 py-3">Total Calls</th>
                <th class="px-4 py-3">Price</th>
                <th class="px-4 py-3">Period End</th>
                <th class="px-4 py-3">Subscribed</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${subsList.map(s => {
                const subColor = s.status === 'active' ? 'green' : s.status === 'past_due' ? 'red' : s.status === 'pending' ? 'yellow' : 'gray';
                const serviceColor = s.service_active ? 'green' : 'gray';
                return '<tr class="hover:bg-gray-50 transition-colors">' +
                  '<td class="px-4 py-3"><div class="font-medium text-gray-900">' + (s.customer_name || 'Unknown') + '</div><div class="text-xs text-gray-400">' + (s.customer_email || '') + '</div></td>' +
                  '<td class="px-4 py-3 text-xs text-gray-600">' + (s.customer_company || '—') + '</td>' +
                  '<td class="px-4 py-3"><span class="px-2 py-0.5 bg-' + subColor + '-100 text-' + subColor + '-700 rounded-full text-xs font-semibold capitalize">' + s.status + '</span></td>' +
                  '<td class="px-4 py-3"><span class="px-2 py-0.5 bg-' + serviceColor + '-100 text-' + serviceColor + '-700 rounded-full text-xs font-semibold">' + (s.service_active ? 'Active' : 'Inactive') + '</span></td>' +
                  '<td class="px-4 py-3 font-medium text-gray-900">' + (s.calls_30d || 0) + '</td>' +
                  '<td class="px-4 py-3 text-gray-600">' + fmtSeconds(s.seconds_30d || 0) + '</td>' +
                  '<td class="px-4 py-3 text-gray-600">' + (s.total_calls || 0) + ' <span class="text-xs text-gray-400">(' + fmtSeconds(s.total_call_seconds || 0) + ')</span></td>' +
                  '<td class="px-4 py-3 font-semibold text-gray-900">$' + ((s.monthly_price_cents || 0) / 100).toFixed(0) + '/mo</td>' +
                  '<td class="px-4 py-3 text-xs text-gray-500">' + fmtDate(s.current_period_end) + '</td>' +
                  '<td class="px-4 py-3 text-xs text-gray-400">' + fmtDate(s.created_at) + '</td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `, '<span class="text-xs text-gray-400">' + subsList.length + ' subscriber' + (subsList.length !== 1 ? 's' : '') + '</span>')}
  </div>`;
}

// ============================================================
// VIEW: SECRETARY REVENUE — Financial tracking & subscription lifecycle
// ============================================================
function renderSecretaryRevenueView() {
  const rev = SA.data.secretary_revenue || {};
  const mrr = rev.mrr || {};
  const lifetime = rev.lifetime || {};
  const periods = rev.revenue_by_period || [];
  const renewals = rev.upcoming_renewals || [];
  const expired = rev.expired || [];
  const activeMrrDollars = ((mrr.active_mrr_cents || 0) / 100).toFixed(2);
  const atRiskMrrDollars = ((mrr.at_risk_mrr_cents || 0) / 100).toFixed(2);
  const lifetimeDollars = ((lifetime.total_lifetime_cents || 0) / 100).toFixed(2);
  const currentPeriod = rev.period || SA.secRevPeriod || 'monthly';

  return `<div class="slide-in space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-chart-line mr-2 text-emerald-600"></i>Secretary AI Revenue & Billing</h2>
        <p class="text-sm text-gray-500 mt-1">Track sales, MRR, renewals, and subscription lifecycle</p>
      </div>
      <div class="flex gap-2">
        <button onclick="SA.view='secretary-admin'; loadView('secretary-admin')" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
          <i class="fas fa-arrow-left mr-1"></i>Back to Overview
        </button>
        <button onclick="loadView('secretary-revenue')" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    </div>

    <!-- Revenue Key Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${samc('Active MRR', '$' + activeMrrDollars, 'fa-dollar-sign', 'green', (mrr.active_count || 0) + ' active subs')}
      ${samc('At-Risk MRR', '$' + atRiskMrrDollars, 'fa-exclamation-triangle', 'red', (mrr.at_risk_count || 0) + ' past due')}
      ${samc('Lifetime Revenue', '$' + lifetimeDollars, 'fa-coins', 'amber', (lifetime.total_subscriptions_ever || 0) + ' total subs')}
      ${samc('Churned', mrr.churned_count || 0, 'fa-user-minus', 'gray', 'Cancelled subs')}
    </div>

    <!-- Revenue Trend -->
    ${saSection('Revenue Trend', 'fa-chart-area', `
      <div class="flex gap-2 mb-4">
        ${['daily', 'weekly', 'monthly'].map(p => 
          '<button onclick="SA.secRevPeriod=&quot;'+p+'&quot;; loadView(&quot;secretary-revenue&quot;)" class="px-3 py-1.5 rounded-lg text-xs font-semibold ' + (currentPeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + ' transition-colors">' + p.charAt(0).toUpperCase() + p.slice(1) + '</button>'
        ).join('')}
      </div>
      ${periods.length === 0 ? '<div class="py-8 text-center text-gray-400">No revenue data yet</div>' : `
        <div class="space-y-2">
          ${periods.map(p => {
            const dollars = ((p.revenue_cents || 0) / 100).toFixed(0);
            const maxRevenue = Math.max(...periods.map(x => x.revenue_cents || 0), 1);
            const pct = Math.round(((p.revenue_cents || 0) / maxRevenue) * 100);
            return '<div class="flex items-center gap-3">' +
              '<div class="w-20 text-xs text-gray-500 font-mono shrink-0">' + p.period + '</div>' +
              '<div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">' +
                '<div class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full flex items-center px-2" style="width:' + Math.max(pct, 5) + '%">' +
                  '<span class="text-[10px] font-bold text-white whitespace-nowrap">$' + dollars + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="w-16 text-right text-xs font-semibold text-gray-700">' + (p.new_subs || 0) + ' new</div>' +
            '</div>';
          }).join('')}
        </div>
      `}
    `)}

    <!-- Upcoming Renewals -->
    ${saSection('Upcoming Renewals (Next 30 Days)', 'fa-calendar-alt', `
      ${renewals.length === 0 ? '<div class="py-6 text-center text-gray-400"><i class="fas fa-check-circle text-green-400 text-xl mr-2"></i>No imminent renewals</div>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Customer</th>
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Amount</th>
                <th class="px-4 py-3">Renewal Date</th>
                <th class="px-4 py-3">Days Left</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${renewals.map(r => {
                const daysLeft = r.current_period_end ? Math.ceil((new Date(r.current_period_end) - new Date()) / 86400000) : 0;
                const urgency = daysLeft <= 7 ? 'red' : daysLeft <= 14 ? 'amber' : 'green';
                return '<tr class="hover:bg-gray-50 transition-colors">' +
                  '<td class="px-4 py-3"><div class="font-medium text-gray-900">' + (r.customer_name || 'Unknown') + '</div><div class="text-xs text-gray-400">' + (r.customer_email || '') + '</div></td>' +
                  '<td class="px-4 py-3 text-xs text-gray-600">' + (r.customer_company || '—') + '</td>' +
                  '<td class="px-4 py-3 font-semibold text-gray-900">$' + ((r.monthly_price_cents || 0) / 100).toFixed(0) + '</td>' +
                  '<td class="px-4 py-3 text-xs text-gray-500">' + fmtDate(r.current_period_end) + '</td>' +
                  '<td class="px-4 py-3"><span class="px-2 py-0.5 bg-' + urgency + '-100 text-' + urgency + '-700 rounded-full text-xs font-bold">' + daysLeft + ' days</span></td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `, '<span class="text-xs text-gray-400">' + renewals.length + ' renewal' + (renewals.length !== 1 ? 's' : '') + '</span>')}

    <!-- Expired / Past Due -->
    ${saSection('Past Due & Cancelled', 'fa-user-minus', `
      ${expired.length === 0 ? '<div class="py-6 text-center text-gray-400"><i class="fas fa-smile text-green-400 text-xl mr-2"></i>No churned subscribers</div>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Customer</th>
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Amount Lost</th>
                <th class="px-4 py-3">Period End</th>
                <th class="px-4 py-3">Cancelled</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${expired.map(e => {
                const statusColor = e.status === 'past_due' ? 'red' : 'gray';
                return '<tr class="hover:bg-gray-50 transition-colors">' +
                  '<td class="px-4 py-3"><div class="font-medium text-gray-900">' + (e.customer_name || 'Unknown') + '</div><div class="text-xs text-gray-400">' + (e.customer_email || '') + '</div></td>' +
                  '<td class="px-4 py-3 text-xs text-gray-600">' + (e.customer_company || '—') + '</td>' +
                  '<td class="px-4 py-3"><span class="px-2 py-0.5 bg-' + statusColor + '-100 text-' + statusColor + '-700 rounded-full text-xs font-semibold capitalize">' + e.status + '</span></td>' +
                  '<td class="px-4 py-3 font-semibold text-red-600">-$' + ((e.monthly_price_cents || 0) / 100).toFixed(0) + '/mo</td>' +
                  '<td class="px-4 py-3 text-xs text-gray-500">' + fmtDate(e.current_period_end) + '</td>' +
                  '<td class="px-4 py-3 text-xs text-gray-400">' + fmtDate(e.cancelled_at) + '</td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `, '<span class="text-xs text-gray-400">' + expired.length + ' record' + (expired.length !== 1 ? 's' : '') + '</span>')}

    <!-- First Subscription Date -->
    ${lifetime.first_subscription ? '<div class="text-center text-xs text-gray-400 mt-4"><i class="fas fa-calendar mr-1"></i>Secretary AI service since ' + fmtDate(lifetime.first_subscription) + '</div>' : ''}
  </div>`;
}

// ============================================================
// CONTACT FORMS — View all website contact form submissions
// ============================================================
function renderContactFormsView() {
  return `<div class="mb-6">
    <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-3"><i class="fas fa-inbox text-cyan-500"></i>Contact Form Submissions</h2>
    <p class="text-sm text-gray-500 mt-1">All inquiries from roofreporterai.com contact forms — also forwarded to admin email</p>
  </div>
  <div id="contactFormsContent"><div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-3"></i><p>Loading submissions...</p></div></div>`;
}

async function loadContactForms() {
  try {
    const res = await saFetch('/api/agents/leads?limit=100');
    if (!res) return;
    const data = await res.json();
    const leads = data.leads || [];
    const el = document.getElementById('contactFormsContent');
    if (!el) return;

    if (leads.length === 0) {
      el.innerHTML = '<div class="bg-white rounded-2xl border border-gray-200 p-12 text-center"><i class="fas fa-inbox text-gray-300 text-4xl mb-4"></i><h3 class="font-bold text-gray-600 text-lg">No submissions yet</h3><p class="text-gray-400 text-sm mt-1">Contact form submissions from roofreporterai.com will appear here.</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span class="font-bold text-gray-800"><i class="fas fa-envelope text-cyan-500 mr-2"></i>${leads.length} Submissions</span>
          <span class="text-xs text-gray-400">Notifications also sent to admin Gmail</span>
        </div>
        <div class="divide-y divide-gray-100">
          ${leads.map(function(l) {
            const date = l.created_at ? new Date(l.created_at + 'Z').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '—';
            return '<div class="px-5 py-4 hover:bg-gray-50 transition-colors">' +
              '<div class="flex items-start justify-between gap-4">' +
                '<div class="flex-1 min-w-0">' +
                  '<div class="flex items-center gap-2 mb-1">' +
                    '<span class="font-semibold text-gray-900">' + (l.name || 'Unknown') + '</span>' +
                    (l.company_name ? '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">' + l.company_name + '</span>' : '') +
                    '<span class="text-xs bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full">' + (l.source_page || 'website') + '</span>' +
                  '</div>' +
                  '<div class="flex items-center gap-4 text-xs text-gray-500 mb-2">' +
                    (l.email ? '<span><i class="fas fa-envelope mr-1"></i><a href="mailto:' + l.email + '" class="text-cyan-600 hover:underline">' + l.email + '</a></span>' : '') +
                    (l.phone ? '<span><i class="fas fa-phone mr-1"></i>' + l.phone + '</span>' : '') +
                  '</div>' +
                  (l.message ? '<p class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border-l-3 border-cyan-400">' + l.message.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '<p class="text-xs text-gray-400 italic">No message</p>') +
                '</div>' +
                '<div class="text-xs text-gray-400 whitespace-nowrap">' + date + '</div>' +
              '</div>' +
            '</div>';
          }).join('')}
        </div>
      </div>`;
  } catch (e) {
    const el = document.getElementById('contactFormsContent');
    if (el) el.innerHTML = '<div class="bg-red-50 rounded-xl p-6 text-center text-red-600"><i class="fas fa-exclamation-circle mr-2"></i>Failed to load contact forms</div>';
  }
}

// ============================================================
// SEO MANAGER — Manage backlinks and meta tags for pages/blogs
// ============================================================
function renderSEOManagerView() {
  return `<div class="mb-6">
    <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-3"><i class="fas fa-search-plus text-purple-500"></i>SEO Manager</h2>
    <p class="text-sm text-gray-500 mt-1">Manage meta tags, backlinks, and SEO settings for all webpages and blog posts</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <!-- Page Meta Tags -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 class="font-bold text-gray-800 mb-4"><i class="fas fa-file-code text-purple-400 mr-2"></i>Page Meta Tags</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Select Page</label>
          <select id="seo-page-select" onchange="seoLoadPageMeta()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400">
            <option value="homepage">Homepage (/)</option>
            <option value="pricing">Pricing (/pricing)</option>
            <option value="blog">Blog Index (/blog)</option>
            <option value="lander">Landing Page (/lander)</option>
            <option value="customer-login">Customer Login (/customer/login)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Meta Title</label>
          <input type="text" id="seo-meta-title" placeholder="RoofReporterAI — AI Roof Measurement Reports" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400" maxlength="70">
          <p class="text-xs text-gray-400 mt-1"><span id="seo-title-count">0</span>/70 chars</p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Meta Description</label>
          <textarea id="seo-meta-desc" rows="3" placeholder="AI-powered roof measurement reports in under 60 seconds..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 resize-none" maxlength="160"></textarea>
          <p class="text-xs text-gray-400 mt-1"><span id="seo-desc-count">0</span>/160 chars</p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Canonical URL</label>
          <input type="url" id="seo-canonical" placeholder="https://roofreporterai.com/" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Keywords (comma-separated)</label>
          <input type="text" id="seo-keywords" placeholder="roof measurement, AI roofing, roof report" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">OG Image URL</label>
          <input type="url" id="seo-og-image" placeholder="https://roofreporterai.com/og-image.jpg" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400">
        </div>
        <button onclick="seoSavePageMeta()" class="px-5 py-2.5 bg-purple-500 text-white rounded-lg font-semibold text-sm hover:bg-purple-600 transition-all"><i class="fas fa-save mr-2"></i>Save Meta Tags</button>
      </div>
    </div>

    <!-- Backlink Manager -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 class="font-bold text-gray-800 mb-4"><i class="fas fa-link text-blue-400 mr-2"></i>Backlink Manager</h3>
      <p class="text-sm text-gray-500 mb-4">Add external backlinks to inject into page footers, headers, or structured data for SEO juice.</p>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Target Page</label>
          <select id="seo-backlink-page" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400">
            <option value="all">All Pages (sitewide)</option>
            <option value="homepage">Homepage</option>
            <option value="blog">Blog Posts</option>
            <option value="pricing">Pricing Page</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Backlink URL</label>
          <input type="url" id="seo-backlink-url" placeholder="https://example.com/partner-page" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Anchor Text</label>
          <input type="text" id="seo-backlink-anchor" placeholder="Professional Roofing Solutions" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400">
        </div>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="seo-backlink-nofollow" class="rounded text-blue-500"> nofollow</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="seo-backlink-newwindow" checked class="rounded text-blue-500"> Open in new window</label>
        </div>
        <button onclick="seoAddBacklink()" class="px-5 py-2.5 bg-blue-500 text-white rounded-lg font-semibold text-sm hover:bg-blue-600 transition-all"><i class="fas fa-plus mr-2"></i>Add Backlink</button>
      </div>

      <div class="mt-6 border-t border-gray-100 pt-4">
        <h4 class="font-semibold text-gray-700 text-sm mb-3">Active Backlinks</h4>
        <div id="seo-backlinks-list" class="text-xs text-gray-400">Loading...</div>
      </div>
    </div>
  </div>

  <!-- Blog Post SEO -->
  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
    <h3 class="font-bold text-gray-800 mb-2"><i class="fas fa-blog text-green-400 mr-2"></i>Blog Post SEO</h3>
    <p class="text-sm text-gray-500 mb-4">SEO settings are managed per-post in the Blog Editor. Edit any blog post to set custom title, description, and schema markup.</p>
    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
      <p class="text-sm text-green-700"><i class="fas fa-check-circle mr-1"></i><strong>Auto-SEO Active:</strong> All blog posts automatically get structured data (Article schema), Open Graph tags, Twitter cards, and canonical URLs. Customize per-post in the blog editor.</p>
    </div>
    <button onclick="saSetView('marketing')" class="mt-4 px-5 py-2.5 bg-green-500 text-white rounded-lg font-semibold text-sm hover:bg-green-600 transition-all"><i class="fas fa-edit mr-2"></i>Go to Blog Editor</button>
  </div>`;
}

// SEO Manager helper functions
window.seoSavePageMeta = async function() {
  const page = document.getElementById('seo-page-select').value;
  const data = {
    page: page,
    meta_title: document.getElementById('seo-meta-title').value.trim(),
    meta_description: document.getElementById('seo-meta-desc').value.trim(),
    canonical_url: document.getElementById('seo-canonical').value.trim(),
    keywords: document.getElementById('seo-keywords').value.trim(),
    og_image: document.getElementById('seo-og-image').value.trim()
  };
  try {
    const res = await saFetch('/api/admin/superadmin/seo/page-meta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res && res.ok) alert('SEO settings saved for ' + page);
    else alert('Failed to save — API endpoint may need configuration');
  } catch(e) { alert('Error saving SEO settings'); }
};

window.seoAddBacklink = async function() {
  const data = {
    target_page: document.getElementById('seo-backlink-page').value,
    url: document.getElementById('seo-backlink-url').value.trim(),
    anchor_text: document.getElementById('seo-backlink-anchor').value.trim(),
    nofollow: document.getElementById('seo-backlink-nofollow').checked,
    new_window: document.getElementById('seo-backlink-newwindow').checked
  };
  if (!data.url) { alert('Backlink URL is required'); return; }
  try {
    const res = await saFetch('/api/admin/superadmin/seo/backlinks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res && res.ok) { alert('Backlink added!'); seoLoadBacklinks(); }
    else alert('Failed to add backlink');
  } catch(e) { alert('Error adding backlink'); }
};

window.seoLoadBacklinks = async function() {
  try {
    const res = await saFetch('/api/admin/superadmin/seo/backlinks');
    if (!res) return;
    const data = await res.json();
    const el = document.getElementById('seo-backlinks-list');
    if (!el) return;
    const links = data.backlinks || [];
    if (links.length === 0) { el.innerHTML = '<p class="text-gray-400 text-xs">No backlinks added yet.</p>'; return; }
    el.innerHTML = links.map(function(l) {
      return '<div class="flex items-center justify-between py-2 border-b border-gray-50">' +
        '<div><a href="' + l.url + '" target="_blank" class="text-blue-600 hover:underline text-xs">' + (l.anchor_text || l.url) + '</a>' +
        '<span class="text-gray-400 ml-2">→ ' + l.target_page + '</span>' +
        (l.nofollow ? ' <span class="bg-gray-100 text-gray-500 px-1 rounded text-[10px]">nofollow</span>' : '') +
        '</div><button onclick="seoDeleteBacklink(' + l.id + ')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button></div>';
    }).join('');
  } catch(e) {}
};

window.seoDeleteBacklink = async function(id) {
  if (!confirm('Delete this backlink?')) return;
  await saFetch('/api/admin/superadmin/seo/backlinks/' + id, { method: 'DELETE' });
  seoLoadBacklinks();
};

window.seoLoadPageMeta = function() {
  // Placeholder — will load saved meta from DB when API is ready
  document.getElementById('seo-meta-title').value = '';
  document.getElementById('seo-meta-desc').value = '';
  document.getElementById('seo-canonical').value = '';
  document.getElementById('seo-keywords').value = '';
  document.getElementById('seo-og-image').value = '';
};

// ============================================================
// VIEW: CANVA INTEGRATION
// ============================================================
function renderCanvaView() {
  return `
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-palette mr-2 text-purple-500"></i>Canva Design Integration</h2>
      <span id="canva-status-badge" class="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500">Loading...</span>
    </div>

    <div class="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-2"><i class="fas fa-info-circle mr-1 text-purple-500"></i>How Canva Integration Works</h3>
      <ol class="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
        <li>Create your invoice/proposal/estimate templates in <a href="https://www.canva.com/design" target="_blank" class="text-purple-600 underline font-medium">Canva</a></li>
        <li>Save each design URL below — organize by type (Invoice, Proposal, Estimate)</li>
        <li>When generating customer documents, click "Edit in Canva" to open the template</li>
        <li>Customize with customer details, save as PDF, and send via Gmail</li>
      </ol>
      <p class="text-xs text-gray-400 mt-3"><i class="fas fa-lock mr-1"></i>For full API automation (auto-fill customer data), a Canva for Teams subscription is required.</p>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">Add Design Template</h3>
      <div class="grid md:grid-cols-3 gap-4 mb-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Template Name</label>
          <input id="canva-tpl-name" type="text" placeholder="e.g. Professional Invoice" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select id="canva-tpl-type" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent">
            <option value="invoice">Invoice</option>
            <option value="proposal">Proposal</option>
            <option value="estimate">Estimate</option>
            <option value="receipt">Receipt</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Canva Design URL</label>
          <input id="canva-tpl-url" type="url" placeholder="https://www.canva.com/design/..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent">
        </div>
      </div>
      <button onclick="canvaAddTemplate()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"><i class="fas fa-plus mr-1"></i>Add Template</button>
    </div>

    <div id="canva-templates-list" class="space-y-3"></div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-3">Canva API Key (Optional — for auto-fill)</h3>
      <p class="text-xs text-gray-500 mb-3">Required only if you want Canva to auto-fill customer name, address, and amounts. Most users can skip this.</p>
      <div class="flex gap-3">
        <input id="canva-api-key" type="password" placeholder="Enter Canva API key..." class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <button onclick="canvaSaveApiKey()" class="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800">Save Key</button>
      </div>
    </div>
  </div>`;
}

var canvaTemplates = [];

async function loadCanvaStatus() {
  try {
    var resp = await saFetch('/api/admin/canva/status');
    var data = await resp.json();
    var badge = document.getElementById('canva-status-badge');
    if (data.connected) {
      badge.className = 'text-xs px-3 py-1 rounded-full bg-green-100 text-green-700';
      badge.textContent = 'API Connected';
    } else {
      badge.className = 'text-xs px-3 py-1 rounded-full bg-yellow-100 text-yellow-700';
      badge.textContent = 'URL-only Mode';
    }
    canvaTemplates = data.templates || [];
    renderCanvaTemplatesList();
  } catch (e) {}
}

function renderCanvaTemplatesList() {
  var el = document.getElementById('canva-templates-list');
  if (!el) return;
  if (canvaTemplates.length === 0) {
    el.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-palette text-3xl mb-2"></i><p>No templates yet. Add your first Canva design above.</p></div>';
    return;
  }
  el.innerHTML = canvaTemplates.map(function(t, i) {
    var typeColor = {invoice:'blue',proposal:'green',estimate:'amber',receipt:'purple'}[t.type] || 'gray';
    return '<div class="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">' +
      '<div class="flex items-center gap-3">' +
        '<span class="text-xs px-2 py-0.5 rounded-full bg-' + typeColor + '-100 text-' + typeColor + '-700 font-medium uppercase">' + t.type + '</span>' +
        '<div><p class="font-medium text-gray-800">' + t.name + '</p><p class="text-xs text-gray-400">' + (t.canva_url || '').substring(0, 50) + '...</p></div>' +
      '</div>' +
      '<div class="flex gap-2">' +
        '<a href="' + t.canva_url + '" target="_blank" class="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-100"><i class="fas fa-external-link-alt mr-1"></i>Open in Canva</a>' +
        '<button onclick="canvaRemoveTemplate(' + i + ')" class="text-xs bg-red-50 text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-100"><i class="fas fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

window.canvaAddTemplate = async function() {
  var name = document.getElementById('canva-tpl-name').value.trim();
  var type = document.getElementById('canva-tpl-type').value;
  var url = document.getElementById('canva-tpl-url').value.trim();
  if (!name || !url) return alert('Name and URL are required');
  canvaTemplates.push({ name: name, type: type, canva_url: url });
  await saFetch('/api/admin/canva/templates', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ templates: canvaTemplates })
  });
  document.getElementById('canva-tpl-name').value = '';
  document.getElementById('canva-tpl-url').value = '';
  renderCanvaTemplatesList();
};

window.canvaRemoveTemplate = async function(index) {
  canvaTemplates.splice(index, 1);
  await saFetch('/api/admin/canva/templates', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ templates: canvaTemplates })
  });
  renderCanvaTemplatesList();
};

window.canvaSaveApiKey = async function() {
  var key = document.getElementById('canva-api-key').value.trim();
  if (!key) return alert('Enter a Canva API key');
  await saFetch('/api/admin/canva/connect', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ canva_api_key: key })
  });
  alert('Canva API key saved!');
  loadCanvaStatus();
};

// ============================================================
// VIEW: PRICING ENGINE PRESETS
// ============================================================
function renderPricingEngineView() {
  return `
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-calculator mr-2 text-green-500"></i>Roofing Pricing Engine</h2>
      <span class="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700">From EagleView Analysis</span>
    </div>

    <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
      <p class="text-sm text-gray-600">Configure your material & labor costs. These presets are used to auto-generate proposals from roof measurement reports. You can also test the calculator with sample measurements and download PDF proposals.</p>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">Material Costs (per square = 100 sq ft)</h3>
      <div class="grid md:grid-cols-3 gap-4">
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Shingles ($/sq)</label><input id="pe-shingles" type="number" step="0.01" value="145.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Underlayment ($/sq)</label><input id="pe-underlay" type="number" step="0.01" value="25.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Ice Shield ($/roll)</label><input id="pe-iceshield" type="number" step="0.01" value="85.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
      </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">Edge & Flashing Costs (per linear ft)</h3>
      <div class="grid md:grid-cols-4 gap-4">
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Drip Edge ($/ft)</label><input id="pe-drip" type="number" step="0.01" value="1.50" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Ridge Cap ($/ft)</label><input id="pe-ridge" type="number" step="0.01" value="3.25" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Valley Flash ($/ft)</label><input id="pe-valley" type="number" step="0.01" value="2.75" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Step Flash ($/ft)</label><input id="pe-step" type="number" step="0.01" value="3.50" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
      </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">Labor & Overhead</h3>
      <div class="grid md:grid-cols-4 gap-4">
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Labor ($/sq)</label><input id="pe-labor" type="number" step="0.01" value="180.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Tear-off ($/sq)</label><input id="pe-tearoff" type="number" step="0.01" value="45.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Disposal ($/sq)</label><input id="pe-disposal" type="number" step="0.01" value="25.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Waste Factor (%)</label><input id="pe-waste" type="number" step="1" value="15" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
      </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">Tax Rate</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div><label class="block text-xs font-medium text-gray-500 mb-1">Tax Rate (%)</label><input id="pe-tax" type="number" step="0.01" value="5.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
      </div>
    </div>

    <div class="flex gap-3">
      <button onclick="savePricingPresets()" class="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700"><i class="fas fa-save mr-2"></i>Save Presets</button>
      <button onclick="resetPricingPresets()" class="bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-300">Reset to Defaults</button>
    </div>

    <div id="pe-save-msg" class="hidden text-sm px-4 py-3 rounded-lg"></div>

    <!-- TEST CALCULATOR -->
    <div class="border-t border-gray-200 pt-6">
      <h3 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-flask mr-2 text-blue-500"></i>Test Calculator — Good / Better / Best</h3>
      <p class="text-sm text-gray-500 mb-4">Enter sample roof measurements to preview pricing across all three tiers.</p>
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <div class="grid md:grid-cols-4 gap-4 mb-4">
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Total Roof Area (sq ft) *</label><input id="pe-test-area" type="number" value="3200" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Ridge (ft)</label><input id="pe-test-ridge" type="number" value="60" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Hip (ft)</label><input id="pe-test-hip" type="number" value="40" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Valley (ft)</label><input id="pe-test-valley" type="number" value="30" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        </div>
        <div class="grid md:grid-cols-4 gap-4 mb-4">
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Eave (ft)</label><input id="pe-test-eave" type="number" value="120" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Rake (ft)</label><input id="pe-test-rake" type="number" value="80" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Step Flash (ft)</label><input id="pe-test-step" type="number" value="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-medium text-gray-500 mb-1">Dominant Pitch</label><input id="pe-test-pitch" type="text" value="7/12" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>
        </div>
        <div class="flex gap-3">
          <button onclick="runTestCalculation()" class="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><i class="fas fa-calculator mr-2"></i>Calculate Good / Better / Best</button>
          <button onclick="runTestCalculation(true)" class="bg-gray-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700"><i class="fas fa-calculator mr-2"></i>Custom Preset Only</button>
        </div>
      </div>
      <div id="pe-test-results" class="mt-4"></div>
    </div>
  </div>`;
}

async function loadPricingPresets() {
  try {
    var resp = await saFetch('/api/invoices/pricing/presets');
    var data = await resp.json();
    var p = data.presets || {};
    if (p.shingles_per_square) document.getElementById('pe-shingles').value = p.shingles_per_square;
    if (p.underlayment_per_square) document.getElementById('pe-underlay').value = p.underlayment_per_square;
    if (p.ice_shield_per_roll) document.getElementById('pe-iceshield').value = p.ice_shield_per_roll;
    if (p.drip_edge_per_ft) document.getElementById('pe-drip').value = p.drip_edge_per_ft;
    if (p.ridge_cap_per_ft) document.getElementById('pe-ridge').value = p.ridge_cap_per_ft;
    if (p.valley_flashing_per_ft) document.getElementById('pe-valley').value = p.valley_flashing_per_ft;
    if (p.step_flashing_per_ft) document.getElementById('pe-step').value = p.step_flashing_per_ft;
    if (p.labor_per_square) document.getElementById('pe-labor').value = p.labor_per_square;
    if (p.tearoff_per_square) document.getElementById('pe-tearoff').value = p.tearoff_per_square;
    if (p.disposal_per_square) document.getElementById('pe-disposal').value = p.disposal_per_square;
    if (p.waste_factor != null) document.getElementById('pe-waste').value = Math.round(p.waste_factor * 100);
    if (p.tax_rate != null) document.getElementById('pe-tax').value = (p.tax_rate * 100).toFixed(2);
  } catch (e) {}
}

window.savePricingPresets = async function() {
  var presets = {
    shingles_per_square: parseFloat(document.getElementById('pe-shingles').value) || 145,
    underlayment_per_square: parseFloat(document.getElementById('pe-underlay').value) || 25,
    ice_shield_per_roll: parseFloat(document.getElementById('pe-iceshield').value) || 85,
    drip_edge_per_ft: parseFloat(document.getElementById('pe-drip').value) || 1.50,
    ridge_cap_per_ft: parseFloat(document.getElementById('pe-ridge').value) || 3.25,
    valley_flashing_per_ft: parseFloat(document.getElementById('pe-valley').value) || 2.75,
    step_flashing_per_ft: parseFloat(document.getElementById('pe-step').value) || 3.50,
    labor_per_square: parseFloat(document.getElementById('pe-labor').value) || 180,
    tearoff_per_square: parseFloat(document.getElementById('pe-tearoff').value) || 45,
    disposal_per_square: parseFloat(document.getElementById('pe-disposal').value) || 25,
    waste_factor: (parseFloat(document.getElementById('pe-waste').value) || 15) / 100,
    tax_rate: (parseFloat(document.getElementById('pe-tax').value) || 5) / 100
  };
  var resp = await saFetch('/api/invoices/pricing/presets', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ presets: presets })
  });
  var data = await resp.json();
  var msg = document.getElementById('pe-save-msg');
  if (data.success) {
    msg.className = 'text-sm px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200';
    msg.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Presets saved! These will be used when generating proposals from roof reports.';
  } else {
    msg.className = 'text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200';
    msg.innerHTML = '<i class="fas fa-times-circle mr-2"></i>' + (data.error || 'Save failed');
  }
};

window.resetPricingPresets = function() {
  document.getElementById('pe-shingles').value = '145.00';
  document.getElementById('pe-underlay').value = '25.00';
  document.getElementById('pe-iceshield').value = '85.00';
  document.getElementById('pe-drip').value = '1.50';
  document.getElementById('pe-ridge').value = '3.25';
  document.getElementById('pe-valley').value = '2.75';
  document.getElementById('pe-step').value = '3.50';
  document.getElementById('pe-labor').value = '180.00';
  document.getElementById('pe-tearoff').value = '45.00';
  document.getElementById('pe-disposal').value = '25.00';
  document.getElementById('pe-waste').value = '15';
  document.getElementById('pe-tax').value = '5.00';
};

// ---- Test Calculator ----
window.runTestCalculation = async function(customOnly) {
  var resultsEl = document.getElementById('pe-test-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Calculating...</div>';

  var measurements = {
    total_area_sqft: parseFloat(document.getElementById('pe-test-area').value) || 3200,
    ridge_ft: parseFloat(document.getElementById('pe-test-ridge').value) || 0,
    hip_ft: parseFloat(document.getElementById('pe-test-hip').value) || 0,
    valley_ft: parseFloat(document.getElementById('pe-test-valley').value) || 0,
    eave_ft: parseFloat(document.getElementById('pe-test-eave').value) || 0,
    rake_ft: parseFloat(document.getElementById('pe-test-rake').value) || 0,
    step_flashing_ft: parseFloat(document.getElementById('pe-test-step').value) || 0,
    dominant_pitch: document.getElementById('pe-test-pitch').value || '7/12'
  };

  try {
    var resp = await saFetch('/api/invoices/pricing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ measurements: measurements, tiered: !customOnly })
    });
    var data = await resp.json();
    if (!data.success) { resultsEl.innerHTML = '<div class="text-red-500">' + (data.error || 'Calculation failed') + '</div>'; return; }

    if (data.tiered) {
      var tiers = data.tiered;
      resultsEl.innerHTML = '<div class="grid md:grid-cols-3 gap-4">' +
        renderTierCard('Good', tiers.good, 'gray', 'fa-thumbs-up') +
        renderTierCard('Better', tiers.better, 'blue', 'fa-star') +
        renderTierCard('Best', tiers.best, 'green', 'fa-crown') +
      '</div>';
    } else {
      var p = data.proposal;
      resultsEl.innerHTML = renderTierCard('Custom Estimate', p, 'indigo', 'fa-calculator');
    }

    // Store for PDF generation
    SA.data._lastTestCalc = data;
    SA.data._lastTestMeasurements = measurements;
  } catch(e) { resultsEl.innerHTML = '<div class="text-red-500">Error: ' + e.message + '</div>'; }
};

function renderTierCard(title, proposal, color, icon) {
  if (!proposal) return '';
  var items = proposal.line_items || [];
  return '<div class="bg-white border-2 border-' + color + '-200 rounded-xl overflow-hidden">' +
    '<div class="bg-' + color + '-50 px-4 py-3 border-b border-' + color + '-200">' +
      '<div class="flex items-center justify-between">' +
        '<h4 class="font-bold text-' + color + '-800"><i class="fas ' + icon + ' mr-2"></i>' + title + '</h4>' +
        '<span class="text-xl font-black text-' + color + '-700">$' + proposal.total_price.toFixed(2) + '</span>' +
      '</div>' +
      '<p class="text-xs text-' + color + '-600 mt-1">' + (proposal.metadata.preset_name || 'Custom') + '</p>' +
    '</div>' +
    '<div class="p-4">' +
      '<table class="w-full text-xs">' +
        '<tbody class="divide-y divide-gray-50">' +
        items.map(function(li) {
          return '<tr><td class="py-1 text-gray-600">' + li.item + '</td><td class="py-1 text-right font-medium text-gray-800">$' + li.price.toFixed(2) + '</td></tr>';
        }).join('') +
        '</tbody>' +
      '</table>' +
      '<div class="border-t border-gray-200 mt-3 pt-3 space-y-1">' +
        '<div class="flex justify-between text-xs"><span class="text-gray-500">Subtotal</span><span>$' + proposal.subtotal.toFixed(2) + '</span></div>' +
        '<div class="flex justify-between text-xs"><span class="text-gray-500">Tax (' + (proposal.tax_rate * 100).toFixed(1) + '%)</span><span>$' + proposal.tax_amount.toFixed(2) + '</span></div>' +
        '<div class="flex justify-between text-sm font-bold border-t pt-1 mt-1"><span>Total</span><span class="text-' + color + '-700">$' + proposal.total_price.toFixed(2) + ' CAD</span></div>' +
      '</div>' +
      '<div class="mt-3 flex gap-2">' +
        '<button onclick="downloadTierPdf(\'' + title + '\')" class="text-xs bg-' + color + '-100 text-' + color + '-700 px-3 py-1.5 rounded-lg hover:bg-' + color + '-200 font-medium"><i class="fas fa-file-pdf mr-1"></i>Download PDF</button>' +
        '<button onclick="createInvoiceFromTier(\'' + title + '\')" class="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 font-medium"><i class="fas fa-file-invoice mr-1"></i>Create Invoice</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

window.downloadTierPdf = function(tierName) {
  var data = SA.data._lastTestCalc;
  var measurements = SA.data._lastTestMeasurements;
  if (!data) { alert('Run a calculation first'); return; }
  var proposal;
  if (data.tiered) {
    var key = tierName.toLowerCase();
    proposal = data.tiered[key];
  } else {
    proposal = data.proposal;
  }
  if (!proposal) { alert('Proposal data not found'); return; }
  if (typeof window.generateProposalPdf === 'function') {
    window.generateProposalPdf(proposal, measurements, 'Homeowner', 'Property Address');
  } else {
    alert('PDF library not loaded');
  }
};

window.createInvoiceFromTier = function(tierName) {
  var data = SA.data._lastTestCalc;
  if (!data) { alert('Run a calculation first'); return; }
  var proposal;
  if (data.tiered) {
    var key = tierName.toLowerCase();
    proposal = data.tiered[key];
  } else {
    proposal = data.proposal;
  }
  if (!proposal) return;
  // Switch to invoices view and pre-populate
  SA.data._pendingInvoiceItems = proposal.line_items;
  loadView('invoices');
  setTimeout(function() { showCreateInvoiceModal(); populateInvoiceFromProposal(); }, 500);
};

window.populateInvoiceFromProposal = function() {
  var items = SA.data._pendingInvoiceItems;
  if (!items || !items.length) return;
  var container = document.getElementById('inv-line-items');
  if (!container) return;
  container.innerHTML = '';
  items.forEach(function(li) {
    var row = document.createElement('div');
    row.className = 'inv-line-item grid grid-cols-12 gap-2 mb-2';
    row.innerHTML = '<input type="text" value="' + li.item + ' — ' + li.description + '" class="col-span-6 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-desc">' +
      '<input type="number" value="' + li.qty + '" class="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-qty">' +
      '<input type="number" step="0.01" value="' + li.unit_price + '" class="col-span-3 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-price">' +
      '<button onclick="this.closest(\'.inv-line-item\').remove()" class="col-span-1 text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button>';
    container.appendChild(row);
  });
  SA.data._pendingInvoiceItems = null;
};

// ============================================================
// VIEW: INVOICES DASHBOARD — Full CRUD + PDF + Gmail Send
// ============================================================
function invStatusBadge(s) {
  var m = {
    draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-indigo-100 text-indigo-700', paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-200 text-gray-500',
    refunded: 'bg-purple-100 text-purple-700'
  };
  return '<span class="px-2 py-0.5 ' + (m[s] || 'bg-gray-100 text-gray-600') + ' rounded-full text-xs font-semibold capitalize">' + (s || 'draft') + '</span>';
}

function renderInvoicesView() {
  var d = SA.data.invoices || {};
  var stats = (SA.data.invoice_stats || {}).stats || {};
  var invoices = d.invoices || [];
  var customers = (SA.data.invoice_customers || {}).customers || [];

  return '<div class="space-y-6">' +
    '<div class="flex items-center justify-between">' +
      '<div><h2 class="text-2xl font-black text-gray-900"><i class="fas fa-file-invoice-dollar mr-2 text-green-500"></i>Invoice Manager</h2>' +
      '<p class="text-sm text-gray-500 mt-1">Create, send, and track invoices for roofing jobs</p></div>' +
      '<button onclick="showCreateInvoiceModal()" class="bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-green-700 shadow-sm"><i class="fas fa-plus mr-2"></i>New Invoice</button>' +
    '</div>' +

    // Stats row
    '<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">' +
      samc('Total Invoices', stats.total_invoices || 0, 'fa-file-invoice', 'blue') +
      samc('Paid', stats.paid_count || 0, 'fa-check-circle', 'green', '$' + ((stats.total_collected || 0)).toFixed(2) + ' collected') +
      samc('Outstanding', stats.outstanding_count || 0, 'fa-clock', 'amber', '$' + ((stats.total_outstanding || 0)).toFixed(2)) +
      samc('Overdue', stats.overdue_count || 0, 'fa-exclamation-triangle', 'red', '$' + ((stats.total_overdue || 0)).toFixed(2)) +
      samc('Grand Total', '$' + ((stats.grand_total || 0)).toFixed(2), 'fa-dollar-sign', 'indigo') +
    '</div>' +

    // Invoice Table
    saSection('Invoices (' + invoices.length + ')', 'fa-table', 
      '<div class="overflow-x-auto"><table class="w-full text-sm">' +
      '<thead class="bg-gray-50"><tr>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice #</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Property</th>' +
        '<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>' +
        '<th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>' +
        '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Due Date</th>' +
        '<th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>' +
      '</tr></thead><tbody class="divide-y divide-gray-50">' +
      (invoices.length === 0 ? '<tr><td colspan="7" class="px-4 py-12 text-center text-gray-400"><i class="fas fa-file-invoice text-4xl mb-3 block"></i>No invoices yet. Create your first one!</td></tr>' : '') +
      invoices.map(function(inv) {
        return '<tr class="hover:bg-green-50/30 transition-colors">' +
          '<td class="px-4 py-3 font-mono font-bold text-gray-800 text-sm">' + (inv.invoice_number || '-') + '</td>' +
          '<td class="px-4 py-3"><div class="font-medium text-gray-800">' + (inv.customer_name || '-') + '</div><div class="text-xs text-gray-400">' + (inv.customer_email || '') + '</div></td>' +
          '<td class="px-4 py-3 text-gray-600 text-xs">' + (inv.property_address || '-') + '</td>' +
          '<td class="px-4 py-3 text-right font-bold text-gray-900">$' + parseFloat(inv.total || 0).toFixed(2) + '</td>' +
          '<td class="px-4 py-3 text-center">' + invStatusBadge(inv.status) + '</td>' +
          '<td class="px-4 py-3 text-gray-600 text-xs">' + fmtDate(inv.due_date) + '</td>' +
          '<td class="px-4 py-3 text-center">' +
            '<div class="flex items-center justify-center gap-1">' +
              '<button onclick="viewInvoiceDetail(' + inv.id + ')" class="text-blue-500 hover:text-blue-700 p-1" title="View"><i class="fas fa-eye"></i></button>' +
              '<button onclick="downloadInvoicePdf(' + inv.id + ')" class="text-green-500 hover:text-green-700 p-1" title="Download PDF"><i class="fas fa-file-pdf"></i></button>' +
              (inv.status === 'draft' ? '<button onclick="sendInvoiceGmail(' + inv.id + ')" class="text-indigo-500 hover:text-indigo-700 p-1" title="Send via Gmail"><i class="fas fa-paper-plane"></i></button>' : '') +
              (inv.status === 'sent' || inv.status === 'viewed' ? '<button onclick="markInvoicePaid(' + inv.id + ')" class="text-green-600 hover:text-green-800 p-1" title="Mark Paid"><i class="fas fa-check-double"></i></button>' : '') +
              (inv.status === 'draft' ? '<button onclick="deleteInvoice(' + inv.id + ')" class="text-red-400 hover:text-red-600 p-1" title="Delete"><i class="fas fa-trash"></i></button>' : '') +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>'
    ) +

    // Hidden modals container
    '<div id="inv-modal-container"></div>' +
    '<div id="inv-detail-container"></div>' +
  '</div>';
}

// ---- Create Invoice Modal ----
window.showCreateInvoiceModal = function() {
  var customers = ((SA.data.invoice_customers || {}).customers || []);
  var modal = document.getElementById('inv-modal-container');
  if (!modal) return;
  modal.innerHTML = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this)closeInvModal()">' +
    '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">' +
      '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-plus-circle mr-2 text-green-500"></i>Create New Invoice</h3>' +
        '<button onclick="closeInvModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="p-6 space-y-4">' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Customer *</label>' +
            '<select id="inv-customer" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
              '<option value="">Select customer...</option>' +
              customers.map(function(c) { return '<option value="' + c.id + '">' + (c.name || c.email) + (c.company_name ? ' (' + c.company_name + ')' : '') + '</option>'; }).join('') +
            '</select></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Due (days)</label>' +
            '<input id="inv-due-days" type="number" value="30" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>' +
        '</div>' +
        '<div><label class="block text-xs font-medium text-gray-500 mb-1">Tax Rate (%)</label>' +
          '<input id="inv-tax-rate" type="number" step="0.01" value="5.00" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm max-w-[200px]"></div>' +

        // Line items
        '<div class="border border-gray-200 rounded-xl p-4">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<h4 class="font-semibold text-gray-700 text-sm">Line Items</h4>' +
            '<button onclick="addInvLineItem()" class="text-xs text-green-600 hover:text-green-800 font-medium"><i class="fas fa-plus mr-1"></i>Add Item</button>' +
          '</div>' +
          '<div id="inv-line-items">' +
            '<div class="inv-line-item grid grid-cols-12 gap-2 mb-2">' +
              '<input type="text" placeholder="Description" class="col-span-6 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-desc">' +
              '<input type="number" placeholder="Qty" value="1" class="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-qty">' +
              '<input type="number" step="0.01" placeholder="Unit Price" class="col-span-3 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-price">' +
              '<button onclick="this.closest(\'.inv-line-item\').remove()" class="col-span-1 text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div><label class="block text-xs font-medium text-gray-500 mb-1">Notes</label>' +
          '<textarea id="inv-notes" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Thank you for your business..."></textarea></div>' +

        '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">' +
          '<p class="text-xs text-amber-700"><i class="fas fa-lightbulb mr-1"></i><strong>Tip:</strong> Use the Pricing Engine to auto-calculate line items from a roof report, then create an invoice from those results.</p>' +
        '</div>' +

        '<div id="inv-create-msg" class="hidden"></div>' +
        '<div class="flex justify-end gap-3 pt-2">' +
          '<button onclick="closeInvModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">Cancel</button>' +
          '<button onclick="createInvoice()" class="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700"><i class="fas fa-save mr-2"></i>Create Invoice</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
};

window.addInvLineItem = function() {
  var container = document.getElementById('inv-line-items');
  if (!container) return;
  var row = document.createElement('div');
  row.className = 'inv-line-item grid grid-cols-12 gap-2 mb-2';
  row.innerHTML = '<input type="text" placeholder="Description" class="col-span-6 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-desc">' +
    '<input type="number" placeholder="Qty" value="1" class="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-qty">' +
    '<input type="number" step="0.01" placeholder="Unit Price" class="col-span-3 border border-gray-300 rounded-lg px-3 py-2 text-sm inv-price">' +
    '<button onclick="this.closest(\'.inv-line-item\').remove()" class="col-span-1 text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button>';
  container.appendChild(row);
};

window.closeInvModal = function() {
  var modal = document.getElementById('inv-modal-container');
  if (modal) modal.innerHTML = '';
  var detail = document.getElementById('inv-detail-container');
  if (detail) detail.innerHTML = '';
};

window.createInvoice = async function() {
  var customerId = document.getElementById('inv-customer').value;
  if (!customerId) { alert('Please select a customer'); return; }
  var rows = document.querySelectorAll('.inv-line-item');
  var items = [];
  rows.forEach(function(r) {
    var desc = r.querySelector('.inv-desc').value.trim();
    var qty = parseFloat(r.querySelector('.inv-qty').value) || 1;
    var price = parseFloat(r.querySelector('.inv-price').value) || 0;
    if (desc && price > 0) items.push({ description: desc, quantity: qty, unit_price: price });
  });
  if (items.length === 0) { alert('Add at least one line item'); return; }
  var taxRate = parseFloat(document.getElementById('inv-tax-rate').value) || 5;
  var dueDays = parseInt(document.getElementById('inv-due-days').value) || 30;
  var notes = document.getElementById('inv-notes').value;

  try {
    var resp = await saFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: parseInt(customerId), items: items, tax_rate: taxRate, due_days: dueDays, notes: notes })
    });
    var data = await resp.json();
    if (data.success) {
      closeInvModal();
      loadView('invoices');
    } else {
      alert(data.error || 'Failed to create invoice');
    }
  } catch(e) { alert('Error: ' + e.message); }
};

window.viewInvoiceDetail = async function(id) {
  try {
    var resp = await saFetch('/api/invoices/' + id);
    var data = await resp.json();
    var inv = data.invoice;
    var items = data.items || [];
    if (!inv) { alert('Invoice not found'); return; }

    var container = document.getElementById('inv-detail-container');
    if (!container) return;
    container.innerHTML = '<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="if(event.target===this)closeInvModal()">' +
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">' +
        '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">' +
          '<h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-file-invoice mr-2 text-green-500"></i>Invoice ' + inv.invoice_number + '</h3>' +
          '<div class="flex items-center gap-2">' +
            '<button onclick="downloadInvoicePdf(' + id + ')" class="text-green-600 hover:text-green-800 text-sm font-medium"><i class="fas fa-file-pdf mr-1"></i>PDF</button>' +
            '<button onclick="closeInvModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="p-6 space-y-6">' +
          // Header info
          '<div class="grid md:grid-cols-3 gap-4">' +
            '<div><p class="text-xs text-gray-400 uppercase">Customer</p><p class="font-semibold text-gray-800">' + (inv.customer_name || '-') + '</p><p class="text-xs text-gray-500">' + (inv.customer_email || '') + '</p></div>' +
            '<div><p class="text-xs text-gray-400 uppercase">Status</p><div class="mt-1">' + invStatusBadge(inv.status) + '</div></div>' +
            '<div><p class="text-xs text-gray-400 uppercase">Due Date</p><p class="font-semibold text-gray-800">' + fmtDate(inv.due_date) + '</p></div>' +
          '</div>' +
          // Line items table
          '<div class="border border-gray-200 rounded-xl overflow-hidden">' +
            '<table class="w-full text-sm">' +
              '<thead class="bg-gray-50"><tr>' +
                '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Description</th>' +
                '<th class="px-4 py-3 text-center text-xs font-semibold text-gray-500">Qty</th>' +
                '<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Unit Price</th>' +
                '<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Amount</th>' +
              '</tr></thead><tbody class="divide-y divide-gray-50">' +
              items.map(function(it) {
                return '<tr><td class="px-4 py-3 text-gray-700">' + (it.description || '-') + '</td>' +
                  '<td class="px-4 py-3 text-center text-gray-600">' + (it.quantity || 1) + '</td>' +
                  '<td class="px-4 py-3 text-right text-gray-600">$' + parseFloat(it.unit_price || 0).toFixed(2) + '</td>' +
                  '<td class="px-4 py-3 text-right font-medium text-gray-800">$' + parseFloat(it.amount || 0).toFixed(2) + '</td></tr>';
              }).join('') +
              '</tbody>' +
            '</table>' +
            '<div class="bg-gray-50 px-4 py-3 space-y-1">' +
              '<div class="flex justify-between text-sm"><span class="text-gray-500">Subtotal</span><span class="text-gray-800">$' + parseFloat(inv.subtotal || 0).toFixed(2) + '</span></div>' +
              '<div class="flex justify-between text-sm"><span class="text-gray-500">Tax (' + (inv.tax_rate || 5) + '%)</span><span class="text-gray-800">$' + parseFloat(inv.tax_amount || 0).toFixed(2) + '</span></div>' +
              (inv.discount_amount ? '<div class="flex justify-between text-sm"><span class="text-gray-500">Discount</span><span class="text-green-600">-$' + parseFloat(inv.discount_amount).toFixed(2) + '</span></div>' : '') +
              '<div class="flex justify-between text-lg font-bold border-t border-gray-200 pt-2 mt-2"><span class="text-gray-900">Total</span><span class="text-green-700">$' + parseFloat(inv.total || 0).toFixed(2) + ' CAD</span></div>' +
            '</div>' +
          '</div>' +
          (inv.notes ? '<div class="bg-gray-50 rounded-lg p-4"><p class="text-xs text-gray-400 uppercase mb-1">Notes</p><p class="text-sm text-gray-600">' + inv.notes + '</p></div>' : '') +
          // Action buttons
          '<div class="flex gap-3 justify-end">' +
            (inv.status === 'draft' ? '<button onclick="sendInvoiceGmail(' + id + ')" class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-paper-plane mr-2"></i>Send via Gmail</button>' : '') +
            (inv.status === 'sent' || inv.status === 'viewed' ? '<button onclick="markInvoicePaid(' + id + ')" class="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700"><i class="fas fa-check-double mr-2"></i>Mark as Paid</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
    // Store items for PDF generation
    SA.data._currentInvoice = inv;
    SA.data._currentInvoiceItems = items;
  } catch(e) { alert('Failed to load invoice: ' + e.message); }
};

window.sendInvoiceGmail = async function(id) {
  if (!confirm('Send this invoice to the customer via Gmail?')) return;
  try {
    var resp = await saFetch('/api/invoices/' + id + '/send-gmail', { method: 'POST' });
    var data = await resp.json();
    if (data.success) {
      alert('Invoice sent successfully to ' + (data.message || 'customer'));
      closeInvModal();
      loadView('invoices');
    } else {
      alert(data.error || 'Failed to send invoice');
    }
  } catch(e) { alert('Error: ' + e.message); }
};

window.markInvoicePaid = async function(id) {
  if (!confirm('Mark this invoice as paid?')) return;
  try {
    var resp = await saFetch('/api/invoices/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' })
    });
    var data = await resp.json();
    if (data.success) {
      closeInvModal();
      loadView('invoices');
    } else {
      alert(data.error || 'Failed to update status');
    }
  } catch(e) { alert('Error: ' + e.message); }
};

window.deleteInvoice = async function(id) {
  if (!confirm('Delete this draft invoice?')) return;
  try {
    var resp = await saFetch('/api/invoices/' + id, { method: 'DELETE' });
    var data = await resp.json();
    if (data.success) {
      loadView('invoices');
    } else {
      alert(data.error || 'Failed to delete');
    }
  } catch(e) { alert('Error: ' + e.message); }
};

// ============================================================
// CLIENT-SIDE PDF GENERATION — jsPDF + autoTable
// ============================================================
window.downloadInvoicePdf = async function(id) {
  try {
    // Fetch invoice data if not cached
    var resp = await saFetch('/api/invoices/' + id);
    var data = await resp.json();
    var inv = data.invoice;
    var items = data.items || [];
    if (!inv) { alert('Invoice not found'); return; }

    // Check jsPDF is loaded
    if (typeof window.jspdf === 'undefined') { alert('PDF library not loaded. Please refresh the page.'); return; }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();

    // Colors
    var primary = [3, 105, 161]; // sky-700
    var dark = [30, 41, 59]; // slate-800
    var gray = [100, 116, 139]; // slate-500
    var lightBg = [248, 250, 252]; // slate-50

    // Header bar
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(0, 0, 210, 38, 'F');

    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 15, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('#' + (inv.invoice_number || 'N/A'), 15, 26);
    doc.text('Generated by RoofReporterAI', 15, 32);

    // Status badge on right
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    var statusText = (inv.status || 'draft').toUpperCase();
    doc.text(statusText, 195, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Due: ' + (inv.due_date || 'N/A'), 195, 28, { align: 'right' });

    // Bill To / From section
    var y = 50;
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.setFontSize(8);
    doc.text('BILL TO', 15, y);
    doc.text('INVOICE DETAILS', 120, y);
    y += 6;
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(inv.customer_name || 'Customer', 15, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (inv.customer_email) { doc.text(inv.customer_email, 15, y); y += 4; }
    if (inv.customer_phone) { doc.text(inv.customer_phone, 15, y); y += 4; }
    if (inv.customer_address) { doc.text(inv.customer_address, 15, y); y += 4; }
    if (inv.customer_city) { doc.text(inv.customer_city + ', ' + (inv.customer_province || '') + ' ' + (inv.customer_postal || ''), 15, y); }

    // Invoice details on right
    var dy = 56;
    doc.setFontSize(9);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Invoice Date:', 120, dy); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(fmtDate(inv.created_at), 155, dy); dy += 5;
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Due Date:', 120, dy); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(fmtDate(inv.due_date), 155, dy); dy += 5;
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Tax Rate:', 120, dy); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text((inv.tax_rate || 5) + '%', 155, dy); dy += 5;
    if (inv.property_address) {
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('Property:', 120, dy); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text(inv.property_address, 155, dy);
    }

    // Line items table using autoTable
    var tableBody = items.map(function(it) {
      return [
        it.description || '-',
        (it.quantity || 1).toString(),
        '$' + parseFloat(it.unit_price || 0).toFixed(2),
        '$' + parseFloat(it.amount || 0).toFixed(2)
      ];
    });

    doc.autoTable({
      startY: 90,
      head: [['Description', 'Qty', 'Unit Price', 'Amount']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: dark },
      alternateRowStyles: { fillColor: lightBg },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 }
      },
      margin: { left: 15, right: 15 }
    });

    // Totals section below table
    var finalY = doc.lastAutoTable.finalY + 10;
    var totalsX = 130;
    doc.setFontSize(10);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Subtotal:', totalsX, finalY);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('$' + parseFloat(inv.subtotal || 0).toFixed(2), 195, finalY, { align: 'right' });
    finalY += 6;

    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Tax (' + (inv.tax_rate || 5) + '% GST):', totalsX, finalY);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('$' + parseFloat(inv.tax_amount || 0).toFixed(2), 195, finalY, { align: 'right' });
    finalY += 6;

    if (inv.discount_amount) {
      doc.setTextColor(22, 163, 74);
      doc.text('Discount:', totalsX, finalY);
      doc.text('-$' + parseFloat(inv.discount_amount).toFixed(2), 195, finalY, { align: 'right' });
      finalY += 6;
    }

    // Total line
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.5);
    doc.line(totalsX, finalY - 2, 195, finalY - 2);
    finalY += 3;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text('Total Due:', totalsX, finalY);
    doc.text('$' + parseFloat(inv.total || 0).toFixed(2) + ' CAD', 195, finalY, { align: 'right' });

    // Notes
    if (inv.notes) {
      finalY += 15;
      doc.setFontSize(8);
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('NOTES', 15, finalY);
      finalY += 5;
      doc.setFontSize(9);
      doc.setTextColor(dark[0], dark[1], dark[2]);
      var noteLines = doc.splitTextToSize(inv.notes, 180);
      doc.text(noteLines, 15, finalY);
    }

    // Terms
    finalY += 15;
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(15, finalY - 3, 180, 18, 'F');
    doc.setFontSize(8);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('TERMS & CONDITIONS', 20, finalY + 2);
    doc.setFontSize(8);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(inv.terms || 'Payment due within 30 days of invoice date. All amounts in Canadian Dollars (CAD).', 20, finalY + 8);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Powered by RoofReporterAI — www.roofreporterai.com', 105, 285, { align: 'center' });

    // Save
    doc.save('Invoice_' + (inv.invoice_number || id) + '.pdf');
  } catch(e) {
    alert('PDF generation failed: ' + e.message);
    console.error('PDF Error:', e);
  }
};

// ============================================================
// PROPOSAL PDF — Generate from pricing engine results
// ============================================================
window.generateProposalPdf = function(proposal, measurements, customerName, propertyAddress) {
  if (typeof window.jspdf === 'undefined') { alert('PDF library not loaded'); return; }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF();

  var primary = [3, 105, 161];
  var dark = [30, 41, 59];
  var gray = [100, 116, 139];

  // Header
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ROOFING PROPOSAL', 15, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(proposal.metadata.preset_name || 'Custom Estimate', 15, 26);
  doc.text(new Date().toLocaleDateString('en-CA'), 15, 32);

  // Customer info
  var y = 50;
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.setFontSize(8);
  doc.text('PREPARED FOR', 15, y);
  y += 6;
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(customerName || 'Homeowner', 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (propertyAddress) doc.text(propertyAddress, 15, y);

  // Measurements summary
  y = 50;
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.setFontSize(8);
  doc.text('ROOF MEASUREMENTS', 120, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text('Total Area: ' + (measurements.total_area_sqft || 0).toLocaleString() + ' sq ft', 120, y); y += 5;
  doc.text('Waste Factor: ' + (proposal.waste_factor_pct || 15) + '%', 120, y); y += 5;
  doc.text('Gross Squares: ' + (proposal.gross_squares || 0).toFixed(1), 120, y); y += 5;
  if (measurements.dominant_pitch) doc.text('Dominant Pitch: ' + measurements.dominant_pitch, 120, y);

  // Line items
  var tableBody = proposal.line_items.map(function(li) {
    return [li.item, li.description, li.qty.toString() + ' ' + li.unit, '$' + li.unit_price.toFixed(2), '$' + li.price.toFixed(2)];
  });

  doc.autoTable({
    startY: 85,
    head: [['Item', 'Description', 'Qty', 'Unit Price', 'Total']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: dark },
    columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' }, 1: { cellWidth: 55 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 15, right: 15 }
  });

  // Totals
  var finalY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('Subtotal:', 135, finalY); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text('$' + proposal.subtotal.toFixed(2), 195, finalY, { align: 'right' }); finalY += 6;
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('Tax (' + (proposal.tax_rate * 100).toFixed(1) + '%):', 135, finalY); doc.setTextColor(dark[0], dark[1], dark[2]); doc.text('$' + proposal.tax_amount.toFixed(2), 195, finalY, { align: 'right' }); finalY += 8;

  doc.setDrawColor(primary[0], primary[1], primary[2]);
  doc.line(135, finalY - 3, 195, finalY - 3);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('Total Estimate:', 135, finalY + 2);
  doc.text('$' + proposal.total_price.toFixed(2) + ' CAD', 195, finalY + 2, { align: 'right' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('This is an estimate only. Final costs may vary. Valid for 30 days.', 105, 275, { align: 'center' });
  doc.text('Powered by RoofReporterAI — ' + proposal.metadata.engine_version, 105, 280, { align: 'center' });

  doc.save('Proposal_' + (proposal.metadata.preset_name || 'Custom').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf');
};

// ============================================================
// VIEW: TELEPHONY / LIVEKIT — Call Forwarding + Number Purchase
// ============================================================
function renderTelephonyView() {
  var d = SA.data.telephony || {};

  return '<div class="space-y-6">' +
    '<div class="flex items-center justify-between">' +
      '<div><h2 class="text-2xl font-black text-gray-900"><i class="fas fa-phone-alt mr-2 text-indigo-500"></i>Telephony & LiveKit</h2>' +
      '<p class="text-sm text-gray-500 mt-1">Number management, call forwarding, and LiveKit SIP integration</p></div>' +
    '</div>' +

    // Status cards
    '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' +
      samc('LiveKit Status', d.livekit_configured ? 'Connected' : 'Not Set', 'fa-plug', d.livekit_configured ? 'green' : 'red') +
      samc('SIP Trunks', d.sip_trunk_count || 0, 'fa-phone-volume', 'blue') +
      samc('Phone Numbers', d.phone_numbers_count || 0, 'fa-hashtag', 'indigo') +
      samc('Active Forwards', d.active_forwards || 0, 'fa-exchange-alt', 'amber') +
    '</div>' +

    // LiveKit Configuration
    saSection('LiveKit Configuration', 'fa-cog',
      '<div class="space-y-4">' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">LiveKit Server URL</label>' +
            '<input id="tel-lk-url" type="text" value="' + (d.livekit_url || '') + '" placeholder="wss://your-livekit.livekit.cloud" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">LiveKit API Key</label>' +
            '<input id="tel-lk-key" type="text" value="' + (d.livekit_api_key ? '••••••••' : '') + '" placeholder="APIxxxxxxxxxx" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
        '</div>' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">LiveKit API Secret</label>' +
            '<input id="tel-lk-secret" type="password" value="' + (d.livekit_api_secret ? '••••••••' : '') + '" placeholder="Secret key" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">SIP Trunk Provider</label>' +
            '<select id="tel-sip-provider" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
              '<option value="twilio"' + (d.sip_provider === 'twilio' ? ' selected' : '') + '>Twilio</option>' +
              '<option value="telnyx"' + (d.sip_provider === 'telnyx' ? ' selected' : '') + '>Telnyx</option>' +
              '<option value="vonage"' + (d.sip_provider === 'vonage' ? ' selected' : '') + '>Vonage</option>' +
              '<option value="telus"' + (d.sip_provider === 'telus' ? ' selected' : '') + '>TELUS Mobility</option>' +
            '</select></div>' +
        '</div>' +
        '<div id="tel-lk-msg" class="hidden"></div>' +
        '<button onclick="saveLivekitConfig()" class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-save mr-2"></i>Save LiveKit Config</button>' +
      '</div>'
    ) +

    // Phone Number Management
    saSection('Phone Number Management', 'fa-phone',
      '<div class="space-y-4">' +
        '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">' +
          '<p class="text-sm text-blue-800"><i class="fas fa-info-circle mr-2"></i><strong>How it works:</strong> Purchase a phone number through your SIP provider (Twilio/Telnyx), then configure call forwarding to route calls through LiveKit AI agents.</p>' +
        '</div>' +
        '<div class="grid md:grid-cols-3 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Area Code / Region</label>' +
            '<input id="tel-area-code" type="text" placeholder="403, 587, 780..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Number Type</label>' +
            '<select id="tel-num-type" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
              '<option value="local">Local</option>' +
              '<option value="toll-free">Toll-Free</option>' +
            '</select></div>' +
          '<div class="flex items-end"><button onclick="searchAvailableNumbers()" class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><i class="fas fa-search mr-2"></i>Search Numbers</button></div>' +
        '</div>' +
        '<div id="tel-search-results" class="hidden"></div>' +
        // Existing numbers
        '<div id="tel-existing-numbers" class="border-t border-gray-200 pt-4 mt-4">' +
          '<h4 class="font-semibold text-gray-700 text-sm mb-3">Your Phone Numbers</h4>' +
          (d.phone_numbers && d.phone_numbers.length > 0 ?
            '<div class="space-y-2">' +
              d.phone_numbers.map(function(pn) {
                return '<div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">' +
                  '<div class="flex items-center gap-3">' +
                    '<i class="fas fa-phone text-indigo-500"></i>' +
                    '<div><p class="font-mono font-bold text-gray-800">' + pn.number + '</p><p class="text-xs text-gray-400">' + (pn.label || pn.type || 'Local') + '</p></div>' +
                  '</div>' +
                  '<div class="flex items-center gap-2">' +
                    '<span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (pn.forwarding_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + (pn.forwarding_active ? 'Forwarding Active' : 'No Forward') + '</span>' +
                    '<button onclick="configureForwarding(\'' + pn.number + '\')" class="text-indigo-500 hover:text-indigo-700 text-sm"><i class="fas fa-cog"></i></button>' +
                  '</div>' +
                '</div>';
              }).join('') +
            '</div>'
          : '<p class="text-gray-400 text-sm">No phone numbers configured yet. Search and purchase one above, or enter your existing number below.</p>') +
        '</div>' +
      '</div>'
    ) +

    // Call Forwarding Setup
    saSection('Call Forwarding Configuration', 'fa-exchange-alt',
      '<div class="space-y-4">' +
        '<p class="text-sm text-gray-600">Route incoming calls from your business number to the LiveKit AI agent. The AI will answer, qualify leads, and book appointments.</p>' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Your Business Number</label>' +
            '<input id="tel-biz-number" type="tel" value="' + (d.business_number || '') + '" placeholder="+1 (403) 555-1234" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Forward To (LiveKit SIP)</label>' +
            '<input id="tel-fwd-number" type="tel" value="' + (d.forward_to_number || '') + '" placeholder="SIP number from LiveKit" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
        '</div>' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Forwarding Mode</label>' +
            '<select id="tel-fwd-mode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
              '<option value="always"' + (d.forwarding_mode === 'always' ? ' selected' : '') + '>Always Forward</option>' +
              '<option value="no-answer"' + (d.forwarding_mode === 'no-answer' ? ' selected' : '') + '>Forward on No Answer (after 15s)</option>' +
              '<option value="busy"' + (d.forwarding_mode === 'busy' ? ' selected' : '') + '>Forward When Busy</option>' +
              '<option value="after-hours"' + (d.forwarding_mode === 'after-hours' ? ' selected' : '') + '>After Hours Only</option>' +
            '</select></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">After-Hours Window</label>' +
            '<div class="flex gap-2">' +
              '<input id="tel-hrs-start" type="time" value="' + (d.business_hours_start || '08:00') + '" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
              '<span class="self-center text-gray-400 text-sm">to</span>' +
              '<input id="tel-hrs-end" type="time" value="' + (d.business_hours_end || '17:00') + '" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
            '</div></div>' +
        '</div>' +

        // Provider-specific instructions
        '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4">' +
          '<h4 class="font-semibold text-amber-800 text-sm mb-2"><i class="fas fa-lightbulb mr-2"></i>Setup Instructions by Provider</h4>' +
          '<div class="grid md:grid-cols-2 gap-4 text-xs text-amber-900">' +
            '<div><p class="font-bold mb-1">TELUS Mobility:</p>' +
              '<p>1. Dial *73 to enable call forwarding</p>' +
              '<p>2. Enter the SIP number shown above</p>' +
              '<p>3. Hang up — forwarding is now active</p>' +
              '<p>4. To cancel: Dial *73 again</p></div>' +
            '<div><p class="font-bold mb-1">Twilio / Telnyx (API-based):</p>' +
              '<p>1. Click "Save Forwarding Config" below</p>' +
              '<p>2. We\'ll auto-configure via API</p>' +
              '<p>3. Test with a call to your number</p>' +
              '<p>4. Calls route to LiveKit → AI answers</p></div>' +
          '</div>' +
        '</div>' +

        '<div id="tel-fwd-msg" class="hidden"></div>' +
        '<div class="flex gap-3">' +
          '<button onclick="saveForwardingConfig()" class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-save mr-2"></i>Save Forwarding Config</button>' +
          '<button onclick="testForwarding()" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300"><i class="fas fa-phone mr-2"></i>Test Call</button>' +
        '</div>' +
      '</div>'
    ) +

    // LiveKit SIP Trunk Setup
    saSection('LiveKit SIP Trunk Configuration', 'fa-server',
      '<div class="space-y-4">' +
        '<p class="text-sm text-gray-600">Configure the SIP trunk that connects your phone numbers to LiveKit rooms for AI-powered call handling.</p>' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">SIP Trunk Name</label>' +
            '<input id="tel-trunk-name" type="text" value="' + (d.sip_trunk_name || 'RoofReporter-Inbound') + '" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">Inbound Number (E.164)</label>' +
            '<input id="tel-trunk-number" type="text" value="' + (d.sip_trunk_number || '') + '" placeholder="+14035551234" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
        '</div>' +
        '<div class="grid md:grid-cols-2 gap-4">' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">SIP Server Host (from provider)</label>' +
            '<input id="tel-sip-host" type="text" value="' + (d.sip_server_host || '') + '" placeholder="sip.twilio.com" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
          '<div><label class="block text-xs font-medium text-gray-500 mb-1">SIP Username (optional)</label>' +
            '<input id="tel-sip-user" type="text" value="' + (d.sip_username || '') + '" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"></div>' +
        '</div>' +
        '<div><label class="block text-xs font-medium text-gray-500 mb-1">SIP Password (optional)</label>' +
          '<input id="tel-sip-pass" type="password" value="' + (d.sip_password ? '••••••••' : '') + '" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono max-w-md"></div>' +
        '<div id="tel-trunk-msg" class="hidden"></div>' +
        '<div class="flex gap-3">' +
          '<button onclick="saveSipTrunkConfig()" class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-save mr-2"></i>Save SIP Trunk</button>' +
          '<button onclick="testSipConnection()" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300"><i class="fas fa-plug mr-2"></i>Test Connection</button>' +
        '</div>' +
      '</div>'
    ) +

  '</div>';
}

// ---- Telephony Functions ----
window.saveLivekitConfig = async function() {
  var msg = document.getElementById('tel-lk-msg');
  var url = document.getElementById('tel-lk-url').value.trim();
  var key = document.getElementById('tel-lk-key').value.trim();
  var secret = document.getElementById('tel-lk-secret').value.trim();
  var provider = document.getElementById('tel-sip-provider').value;

  if (!url) { showTelMsg(msg, 'error', 'LiveKit URL is required'); return; }

  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        livekit_url: url,
        livekit_api_key: key.includes('•') ? undefined : key,
        livekit_api_secret: secret.includes('•') ? undefined : secret,
        sip_provider: provider
      })
    });
    var data = await resp.json();
    showTelMsg(msg, data.success ? 'success' : 'error', data.success ? 'LiveKit config saved!' : (data.error || 'Save failed'));
  } catch(e) { showTelMsg(msg, 'error', 'Error: ' + e.message); }
};

window.saveForwardingConfig = async function() {
  var msg = document.getElementById('tel-fwd-msg');
  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-forwarding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_number: document.getElementById('tel-biz-number').value.trim(),
        forward_to_number: document.getElementById('tel-fwd-number').value.trim(),
        forwarding_mode: document.getElementById('tel-fwd-mode').value,
        business_hours_start: document.getElementById('tel-hrs-start').value,
        business_hours_end: document.getElementById('tel-hrs-end').value
      })
    });
    var data = await resp.json();
    showTelMsg(msg, data.success ? 'success' : 'error', data.success ? 'Forwarding config saved! ' + (data.api_configured ? 'API-based forwarding is now active.' : 'Manual setup required — see provider instructions above.') : (data.error || 'Save failed'));
  } catch(e) { showTelMsg(msg, 'error', 'Error: ' + e.message); }
};

window.saveSipTrunkConfig = async function() {
  var msg = document.getElementById('tel-trunk-msg');
  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-sip-trunk', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sip_trunk_name: document.getElementById('tel-trunk-name').value.trim(),
        sip_trunk_number: document.getElementById('tel-trunk-number').value.trim(),
        sip_server_host: document.getElementById('tel-sip-host').value.trim(),
        sip_username: document.getElementById('tel-sip-user').value.trim(),
        sip_password: document.getElementById('tel-sip-pass').value.includes('•') ? undefined : document.getElementById('tel-sip-pass').value.trim()
      })
    });
    var data = await resp.json();
    showTelMsg(msg, data.success ? 'success' : 'error', data.success ? 'SIP trunk config saved!' : (data.error || 'Save failed'));
  } catch(e) { showTelMsg(msg, 'error', 'Error: ' + e.message); }
};

window.searchAvailableNumbers = async function() {
  var container = document.getElementById('tel-search-results');
  if (!container) return;
  container.className = '';
  container.innerHTML = '<div class="py-4 text-center text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Searching available numbers...</div>';
  var areaCode = document.getElementById('tel-area-code').value.trim();
  var numType = document.getElementById('tel-num-type').value;
  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-search-numbers?area_code=' + encodeURIComponent(areaCode) + '&type=' + numType);
    var data = await resp.json();
    var numbers = data.numbers || [];
    if (numbers.length === 0) {
      container.innerHTML = '<div class="py-4 text-center text-gray-400">No numbers found for area code ' + areaCode + '. Try a different code.</div>';
      return;
    }
    container.innerHTML = '<div class="space-y-2 mt-3">' +
      numbers.map(function(n) {
        return '<div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2">' +
          '<span class="font-mono font-bold text-gray-800">' + n.number + '</span>' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-xs text-gray-500">' + (n.monthly_cost ? '$' + n.monthly_cost + '/mo' : '') + '</span>' +
            '<button onclick="purchaseNumber(\'' + n.number + '\')" class="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-green-700"><i class="fas fa-cart-plus mr-1"></i>Purchase</button>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  } catch(e) { container.innerHTML = '<div class="text-red-500 text-sm">Search failed: ' + e.message + '</div>'; }
};

window.purchaseNumber = async function(number) {
  if (!confirm('Purchase ' + number + '? Monthly charges will apply from your SIP provider.')) return;
  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-purchase-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: number })
    });
    var data = await resp.json();
    if (data.success) {
      alert('Number ' + number + ' purchased! It will appear in your phone numbers list.');
      loadView('telephony');
    } else {
      alert(data.error || 'Purchase failed');
    }
  } catch(e) { alert('Error: ' + e.message); }
};

window.configureForwarding = function(number) {
  document.getElementById('tel-biz-number').value = number;
  document.getElementById('tel-biz-number').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.testForwarding = async function() {
  alert('Test call initiated. Your LiveKit AI agent should answer within 5 seconds. Check the Call Center logs for results.');
};

window.testSipConnection = async function() {
  try {
    var resp = await saFetch('/api/admin/superadmin/telephony-sip-test', { method: 'POST' });
    var data = await resp.json();
    var msg = document.getElementById('tel-trunk-msg');
    showTelMsg(msg, data.success ? 'success' : 'error', data.success ? 'SIP connection test passed!' : (data.error || 'Connection test failed'));
  } catch(e) { alert('Test failed: ' + e.message); }
};

function showTelMsg(el, type, text) {
  if (!el) return;
  el.className = 'text-sm px-4 py-3 rounded-lg ' + (type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200');
  el.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : 'fa-times-circle') + ' mr-2"></i>' + text;
}

// ============================================================
// VIEW: PAYWALL / APP STORE READINESS
// ============================================================
function renderPaywallView() {
  return `
  <div class="space-y-6">
    <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-shield-alt mr-2 text-indigo-500"></i>Paywall & App Store Readiness</h2>
    <div id="paywall-content" class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">Checking readiness...</p></div>
  </div>`;
}

async function loadPaywallStatus() {
  try {
    var resp = await saFetch('/api/admin/superadmin/paywall-status');
    var d = await resp.json();
    var el = document.getElementById('paywall-content');
    if (!el) return;

    var checkIcon = function(ok) { return ok ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-times-circle text-red-400"></i>'; };

    el.innerHTML = `
    <div class="grid md:grid-cols-3 gap-6 mb-6">
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-credit-card mr-2 text-blue-500"></i>Payment Gateway</h3>
        <ul class="space-y-2 text-sm">
          <li class="flex items-center gap-2">${checkIcon(d.payment_gateway.square_configured)} Square</li>
          <li class="flex items-center gap-2">${checkIcon(d.payment_gateway.stripe_configured)} Stripe</li>
        </ul>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-tags mr-2 text-green-500"></i>Subscription Model</h3>
        <ul class="space-y-2 text-sm">
          <li class="flex items-center gap-2">${checkIcon(d.subscription_model.has_pricing)} Pricing Set${d.subscription_model.monthly_price_cents ? ' ($' + (d.subscription_model.monthly_price_cents / 100).toFixed(2) + '/mo)' : ''}</li>
          <li class="flex items-center gap-2">${checkIcon(d.subscription_model.has_credit_packages)} Credit Packages</li>
        </ul>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-mobile-alt mr-2 text-indigo-500"></i>App Store</h3>
        <ul class="space-y-2 text-sm">
          <li class="flex items-center gap-2">${checkIcon(d.app_store_requirements.user_auth_system)} User Auth</li>
          <li class="flex items-center gap-2">${checkIcon(d.app_store_requirements.free_trial_enabled)} Free Trial</li>
          <li class="flex items-center gap-2">${checkIcon(d.app_store_requirements.terms_of_service)} Terms of Service</li>
          <li class="flex items-center gap-2">${checkIcon(d.app_store_requirements.privacy_policy)} Privacy Policy</li>
          <li class="flex items-center gap-2">${checkIcon(d.app_store_requirements.app_store_listing)} App Store Listing</li>
        </ul>
      </div>
    </div>
    <div class="bg-${d.overall_ready ? 'green' : 'amber'}-50 border border-${d.overall_ready ? 'green' : 'amber'}-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-2">${d.overall_ready ? '<i class="fas fa-rocket mr-2 text-green-600"></i>Ready for Launch!' : '<i class="fas fa-exclamation-triangle mr-2 text-amber-600"></i>Missing Requirements'}</h3>
      ${d.missing_for_launch.length > 0 ? '<ul class="text-sm text-gray-600 space-y-1 list-disc list-inside">' + d.missing_for_launch.map(function(m) { return '<li>' + m + '</li>'; }).join('') + '</ul>' : '<p class="text-sm text-green-700">All checks passed. You are ready to submit to the App Store.</p>'}
    </div>`;
  } catch (e) {
    var el = document.getElementById('paywall-content');
    if (el) el.innerHTML = '<div class="text-red-500">Failed to load paywall status</div>';
  }
}

// ============================================================
// REVENUE PIPELINE — Conversion funnel & deal analytics
// ============================================================
function renderRevenuePipelineView() {
  return `
    <div class="mb-6">
      <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-funnel-dollar mr-2 text-green-500"></i>Revenue Pipeline</h2>
      <p class="text-sm text-gray-500 mt-1">Track proposals through acceptance, invoicing, and payment</p>
    </div>
    <div id="pipeline-content">
      <div class="flex items-center justify-center py-12">
        <div class="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
        <span class="ml-3 text-gray-500">Loading pipeline data...</span>
      </div>
    </div>`;
}

async function loadRevenuePipeline() {
  try {
    const res = await saFetch('/api/crm/analytics/pipeline');
    if (!res) return;
    const d = await res.json();
    const el = document.getElementById('pipeline-content');
    if (!el) return;

    const stages = d.stages || [];
    const p = d.proposals || {};
    const inv = d.invoices || {};
    const convRate = d.conversion_rate || 0;
    const avgDeal = d.avg_deal_size || 0;

    // Funnel visualization
    const stageNames = { lead: 'Leads', proposal_sent: 'Sent', proposal_viewed: 'Viewed', proposal_accepted: 'Accepted', invoice_sent: 'Invoiced', invoice_paid: 'Paid' };
    const stageColors = { lead: 'blue', proposal_sent: 'sky', proposal_viewed: 'yellow', proposal_accepted: 'green', invoice_sent: 'purple', invoice_paid: 'emerald' };
    const stageIcons = { lead: 'fa-user-plus', proposal_sent: 'fa-paper-plane', proposal_viewed: 'fa-eye', proposal_accepted: 'fa-check-circle', invoice_sent: 'fa-file-invoice', invoice_paid: 'fa-money-bill-wave' };

    let funnelHtml = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">';
    const allStages = ['lead', 'proposal_sent', 'proposal_viewed', 'proposal_accepted', 'invoice_sent', 'invoice_paid'];
    for (const stg of allStages) {
      const data = stages.find(function(s) { return s.stage === stg; }) || { count: 0, total_amount: 0 };
      const col = stageColors[stg] || 'gray';
      funnelHtml += '<div class="bg-white border border-gray-200 rounded-xl p-4 text-center hover:shadow-md transition-shadow">' +
        '<i class="fas ' + (stageIcons[stg] || 'fa-circle') + ' text-2xl text-' + col + '-500 mb-2"></i>' +
        '<p class="text-2xl font-black text-gray-800">' + (data.count || 0) + '</p>' +
        '<p class="text-xs text-gray-500">' + (stageNames[stg] || stg) + '</p>' +
        '<p class="text-xs font-bold text-' + col + '-600 mt-1">$' + parseFloat(data.total_amount || 0).toLocaleString('en-CA', {minimumFractionDigits: 0, maximumFractionDigits: 0}) + '</p>' +
        '</div>';
    }
    funnelHtml += '</div>';

    // KPI cards
    let kpiHtml = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">' +
      samc('Conversion Rate', convRate + '%', 'fa-percentage', 'green') +
      samc('Avg Deal Size', '$' + avgDeal.toLocaleString('en-CA', {minimumFractionDigits: 0}), 'fa-dollar-sign', 'blue') +
      samc('Revenue (30d)', '$' + parseFloat(inv.paid_amount || 0).toLocaleString('en-CA', {minimumFractionDigits: 0}), 'fa-money-bill-wave', 'emerald') +
      samc('Outstanding', '$' + parseFloat(inv.outstanding_amount || 0).toLocaleString('en-CA', {minimumFractionDigits: 0}), 'fa-clock', 'amber') +
      '</div>';

    // Proposal stats
    let proposalHtml = saSection('Proposal Performance (Last 30 Days)', 'fa-chart-pie', '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">' +
      '<div class="text-center p-4 bg-blue-50 rounded-xl"><p class="text-2xl font-bold text-blue-700">' + (p.total || 0) + '</p><p class="text-xs text-gray-500">Total Sent</p></div>' +
      '<div class="text-center p-4 bg-green-50 rounded-xl"><p class="text-2xl font-bold text-green-700">' + (p.accepted || 0) + '</p><p class="text-xs text-gray-500">Accepted</p></div>' +
      '<div class="text-center p-4 bg-red-50 rounded-xl"><p class="text-2xl font-bold text-red-700">' + (p.declined || 0) + '</p><p class="text-xs text-gray-500">Declined</p></div>' +
      '<div class="text-center p-4 bg-yellow-50 rounded-xl"><p class="text-2xl font-bold text-yellow-700">' + (p.pending || 0) + '</p><p class="text-xs text-gray-500">Pending</p></div>' +
      '</div>' +
      '<div class="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-center">' +
      '<p class="text-sm text-gray-600">Accepted Revenue</p>' +
      '<p class="text-3xl font-black text-green-700">$' + parseFloat(p.accepted_amount || 0).toLocaleString('en-CA', {minimumFractionDigits: 2}) + ' CAD</p>' +
      '</div>');

    el.innerHTML = funnelHtml + kpiHtml + proposalHtml;
  } catch (e) {
    var el = document.getElementById('pipeline-content');
    if (el) el.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-info-circle mr-1"></i>No pipeline data yet. Send your first proposal to start tracking.</div>';
  }
}

// ============================================================
// NOTIFICATIONS ADMIN — View & manage notifications
// ============================================================
function renderNotificationsAdminView() {
  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-bell mr-2 text-amber-500"></i>Notifications</h2>
        <p class="text-sm text-gray-500 mt-1">System alerts, proposal activity, and payment notifications</p>
      </div>
      <button onclick="markAllNotificationsRead()" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700">
        <i class="fas fa-check-double mr-1"></i>Mark All Read
      </button>
    </div>
    <div id="notifications-content">
      <div class="flex items-center justify-center py-12">
        <div class="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
        <span class="ml-3 text-gray-500">Loading notifications...</span>
      </div>
    </div>`;
}

async function loadNotifications() {
  try {
    const res = await saFetch('/api/crm/notifications');
    if (!res) return;
    const d = await res.json();
    const el = document.getElementById('notifications-content');
    if (!el) return;

    const notifs = d.notifications || [];
    const unread = d.unread_count || 0;

    if (notifs.length === 0) {
      el.innerHTML = '<div class="text-center py-12 bg-white rounded-xl border border-gray-200"><i class="fas fa-bell-slash text-gray-300 text-4xl mb-3"></i><p class="text-gray-500">No notifications yet</p></div>';
      return;
    }

    const typeIcons = {
      proposal_accepted: 'fa-check-circle text-green-500',
      proposal_declined: 'fa-times-circle text-red-500',
      invoice_paid: 'fa-money-bill-wave text-emerald-500',
      lead_captured: 'fa-user-plus text-blue-500',
      call_answered: 'fa-phone text-teal-500',
      followup_due: 'fa-clock text-amber-500'
    };

    let html = '<div class="mb-4">' + samc('Unread', unread, 'fa-bell', 'amber') + '</div>';
    html += '<div class="space-y-2">';
    for (const n of notifs) {
      const icon = typeIcons[n.type] || 'fa-info-circle text-gray-400';
      const timeAgo = getTimeAgo(n.created_at);
      html += '<div class="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4 ' + (n.is_read ? 'opacity-60' : '') + ' hover:shadow-sm transition-shadow">' +
        '<div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0"><i class="fas ' + icon + '"></i></div>' +
        '<div class="flex-1 min-w-0">' +
        '<p class="font-semibold text-gray-800 text-sm">' + (n.title || '') + '</p>' +
        '<p class="text-gray-500 text-xs mt-0.5">' + (n.message || '') + '</p>' +
        '<p class="text-gray-400 text-[10px] mt-1">' + timeAgo + '</p>' +
        '</div>' +
        (!n.is_read ? '<button onclick="markNotificationRead(' + n.id + ')" class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"><i class="fas fa-check"></i></button>' : '') +
        '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    var el = document.getElementById('notifications-content');
    if (el) el.innerHTML = '<div class="text-red-500">Failed to load notifications</div>';
  }
}

async function markNotificationRead(id) {
  await saFetch('/api/crm/notifications/' + id + '/read', { method: 'POST' });
  loadNotifications();
}

async function markAllNotificationsRead() {
  await saFetch('/api/crm/notifications/all/read', { method: 'POST' });
  loadNotifications();
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString('en-CA');
}

// ============================================================
// WEBHOOKS MANAGEMENT — Configure webhook endpoints
// ============================================================
function renderWebhooksView() {
  return `
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-plug mr-2 text-purple-500"></i>Webhooks</h2>
        <p class="text-sm text-gray-500 mt-1">Send real-time event notifications to external services (Slack, Zapier, etc.)</p>
      </div>
      <button onclick="showAddWebhookForm()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">
        <i class="fas fa-plus mr-1"></i>Add Webhook
      </button>
    </div>
    <div id="webhook-form" class="hidden mb-6 bg-white border border-gray-200 rounded-xl p-6">
      <h3 class="font-bold text-gray-800 mb-4">New Webhook</h3>
      <div class="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1">Event Type</label>
          <select id="webhook-event" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="proposal_accepted">Proposal Accepted</option>
            <option value="proposal_declined">Proposal Declined</option>
            <option value="invoice_paid">Invoice Paid</option>
            <option value="lead_captured">Lead Captured</option>
            <option value="call_answered">Call Answered</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1">URL</label>
          <input type="url" id="webhook-url" placeholder="https://hooks.slack.com/services/..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
        </div>
      </div>
      <div class="mb-4">
        <label class="block text-xs font-semibold text-gray-500 mb-1">Secret (optional)</label>
        <input type="text" id="webhook-secret" placeholder="Signing secret for verification" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex gap-2">
        <button onclick="saveWebhook()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">Save Webhook</button>
        <button onclick="document.getElementById('webhook-form').classList.add('hidden')" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
      </div>
    </div>
    <div id="webhooks-content">
      <div class="flex items-center justify-center py-12">
        <div class="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
        <span class="ml-3 text-gray-500">Loading webhooks...</span>
      </div>
    </div>`;
}

function showAddWebhookForm() {
  document.getElementById('webhook-form').classList.remove('hidden');
}

async function loadWebhooks() {
  try {
    const res = await saFetch('/api/crm/webhooks');
    if (!res) return;
    const d = await res.json();
    const el = document.getElementById('webhooks-content');
    if (!el) return;

    const hooks = d.webhooks || [];
    if (hooks.length === 0) {
      el.innerHTML = '<div class="text-center py-12 bg-white rounded-xl border border-gray-200"><i class="fas fa-plug text-gray-300 text-4xl mb-3"></i><p class="text-gray-500">No webhooks configured</p><p class="text-gray-400 text-xs mt-1">Add a webhook to receive real-time notifications</p></div>';
      return;
    }

    var html = '<div class="space-y-3">';
    for (var h of hooks) {
      var eventLabel = { proposal_accepted: 'Proposal Accepted', proposal_declined: 'Proposal Declined', invoice_paid: 'Invoice Paid', lead_captured: 'Lead Captured', call_answered: 'Call Answered' }[h.event_type] || h.event_type;
      html += '<div class="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center"><i class="fas fa-plug text-purple-500"></i></div>' +
        '<div><p class="font-semibold text-gray-800 text-sm">' + eventLabel + '</p><p class="text-gray-400 text-xs truncate max-w-xs">' + h.url + '</p></div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
        '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + (h.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + (h.is_active ? 'ACTIVE' : 'INACTIVE') + '</span>' +
        '<button onclick="deleteWebhook(' + h.id + ')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>' +
        '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    var el = document.getElementById('webhooks-content');
    if (el) el.innerHTML = '<div class="text-red-500">Failed to load webhooks</div>';
  }
}

async function saveWebhook() {
  var event_type = document.getElementById('webhook-event').value;
  var url = document.getElementById('webhook-url').value;
  var secret = document.getElementById('webhook-secret').value;
  if (!url) { alert('URL is required'); return; }

  try {
    var res = await saFetch('/api/crm/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: event_type, url: url, secret: secret })
    });
    var data = await res.json();
    if (data.success) {
      document.getElementById('webhook-form').classList.add('hidden');
      document.getElementById('webhook-url').value = '';
      document.getElementById('webhook-secret').value = '';
      loadWebhooks();
    } else {
      alert(data.error || 'Failed to save');
    }
  } catch (e) { alert('Error saving webhook'); }
}

async function deleteWebhook(id) {
  if (!confirm('Delete this webhook?')) return;
  await saFetch('/api/crm/webhooks/' + id, { method: 'DELETE' });
  loadWebhooks();
}

// ============================================================
// CUSTOMER ONBOARDING — Provision accounts + Secretary AI
// ============================================================
function renderCustomerOnboardingView() {
  var d = SA.data.onboarding || {};
  var customers = d.customers || [];
  var rows = customers.map(function(c) {
    var secBadge = c.secretary_enabled ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>' : '<span class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">Off</span>';
    var modeBadge = c.secretary_mode === 'always_on' ? '<span class="text-xs text-blue-600 font-medium">Always On</span>' : c.secretary_mode === 'answering_service' ? '<span class="text-xs text-purple-600 font-medium">Answering</span>' : '<span class="text-xs text-sky-600 font-medium">Receptionist</span>';
    return '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="px-4 py-3"><div class="font-bold text-gray-800 text-sm">' + (c.business_name || c.contact_name || 'N/A') + '</div><div class="text-xs text-gray-500">' + (c.email || '') + '</div></td>' +
      '<td class="px-4 py-3 text-sm text-gray-600">' + (c.phone || '-') + '</td>' +
      '<td class="px-4 py-3 text-center">' + secBadge + '</td>' +
      '<td class="px-4 py-3 text-center">' + modeBadge + '</td>' +
      '<td class="px-4 py-3 text-sm text-gray-500">' + (c.secretary_phone_number || '-') + '</td>' +
      '<td class="px-4 py-3 text-sm text-gray-500">' + (c.call_forwarding_number || '-') + '</td>' +
      '<td class="px-4 py-3 text-xs text-gray-400">' + fmtDate(c.created_at) + '</td>' +
      '<td class="px-4 py-3"><button onclick="toggleSecretaryMode(' + c.id + ', ' + (c.secretary_enabled ? 0 : 1) + ')" class="text-xs ' + (c.secretary_enabled ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800') + ' font-medium">' + (c.secretary_enabled ? '<i class="fas fa-power-off mr-1"></i>Disable' : '<i class="fas fa-play mr-1"></i>Enable') + '</button></td>' +
      '</tr>';
  }).join('');

  return '<div class="mb-6"><h2 class="text-2xl font-black text-gray-900"><i class="fas fa-user-cog mr-2 text-indigo-500"></i>Customer Onboarding</h2><p class="text-sm text-gray-500 mt-1">Provision new customer accounts, set up Secretary AI, manage call forwarding</p></div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">' +
    '<div class="flex items-center justify-between mb-4"><h3 class="font-bold text-gray-800 text-lg">Create New Customer</h3></div>' +
    '<div id="onboard-form" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Business Name</label><input id="ob-business" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ABC Roofing Ltd"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Contact Name</label><input id="ob-name" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="John Smith"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Email *</label><input id="ob-email" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="john@abcroofing.ca" type="email"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Phone</label><input id="ob-phone" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+1 403 555 1234"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Password *</label><input id="ob-password" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Secure password" type="text"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Secretary AI Mode</label><select id="ob-sec-mode" class="w-full border rounded-lg px-3 py-2 text-sm"><option value="receptionist">Receptionist</option><option value="answering_service">Answering Service</option><option value="always_on">Always On</option></select></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">LiveKit Phone # (Secretary AI)</label><input id="ob-sec-phone" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+1 403 555 9999"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Call Forwarding # (Customer Cell)</label><input id="ob-fwd-phone" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+1 403 555 8888"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Notes</label><input id="ob-notes" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional notes"></div>' +
    '</div>' +
    '<div class="flex items-center gap-3"><label class="flex items-center gap-2 text-sm"><input type="checkbox" id="ob-enable-sec" checked> Enable Secretary AI on creation</label></div>' +
    '<button onclick="createOnboardingCustomer()" class="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md"><i class="fas fa-user-plus mr-2"></i>Create Account & Setup Secretary AI</button>' +
    '</div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">' +
    '<div class="p-4 border-b bg-gray-50"><h3 class="font-bold text-gray-800">Onboarded Customers (' + customers.length + ')</h3></div>' +
    (customers.length === 0 ? '<div class="p-8 text-center text-gray-400"><i class="fas fa-users text-3xl mb-3 opacity-30"></i><p>No customers onboarded yet</p></div>' :
    '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-50 text-xs text-gray-500 uppercase"><th class="px-4 py-3 text-left">Customer</th><th class="px-4 py-3 text-left">Phone</th><th class="px-4 py-3 text-center">Secretary</th><th class="px-4 py-3 text-center">Mode</th><th class="px-4 py-3 text-left">AI Phone #</th><th class="px-4 py-3 text-left">Fwd To</th><th class="px-4 py-3 text-left">Onboarded</th><th class="px-4 py-3 text-left">Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>') +
    '</div>';
}

async function createOnboardingCustomer() {
  var email = document.getElementById('ob-email').value;
  var password = document.getElementById('ob-password').value;
  if (!email || !password) { alert('Email and Password are required'); return; }

  var body = {
    business_name: document.getElementById('ob-business').value,
    contact_name: document.getElementById('ob-name').value,
    email: email,
    phone: document.getElementById('ob-phone').value,
    password: password,
    secretary_mode: document.getElementById('ob-sec-mode').value,
    secretary_phone_number: document.getElementById('ob-sec-phone').value,
    call_forwarding_number: document.getElementById('ob-fwd-phone').value,
    notes: document.getElementById('ob-notes').value,
    enable_secretary: document.getElementById('ob-enable-sec').checked
  };

  try {
    var res = await saFetch('/api/admin/superadmin/onboarding/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.success) {
      alert('Customer account created successfully! Secretary AI ' + (body.enable_secretary ? 'enabled' : 'disabled') + '.');
      loadView('customer-onboarding');
    } else {
      alert(data.error || 'Failed to create customer');
    }
  } catch(e) { alert('Error creating customer: ' + e.message); }
}

async function toggleSecretaryMode(id, enable) {
  try {
    await saFetch('/api/admin/superadmin/onboarding/' + id + '/toggle-secretary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable })
    });
    loadView('customer-onboarding');
  } catch(e) { alert('Error toggling secretary'); }
}

// ============================================================
// SERVICE INVOICES — Cold-call customer invoicing
// ============================================================
function renderServiceInvoicesView() {
  var d = SA.data.service_invoices || {};
  var invoices = d.invoices || [];
  var rows = invoices.map(function(inv) {
    var sBadge = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', viewed: 'bg-purple-100 text-purple-700', paid: 'bg-green-100 text-green-800', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400' };
    return '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="px-4 py-3 text-sm font-mono font-bold text-gray-800">' + (inv.invoice_number || '-') + '</td>' +
      '<td class="px-4 py-3"><div class="font-medium text-gray-800 text-sm">' + (inv.customer_name || 'N/A') + '</div><div class="text-xs text-gray-500">' + (inv.customer_email || '') + '</div></td>' +
      '<td class="px-4 py-3 text-sm font-bold text-gray-800">$' + parseFloat(inv.total || 0).toFixed(2) + '</td>' +
      '<td class="px-4 py-3 text-center"><span class="px-2 py-0.5 ' + (sBadge[inv.status] || 'bg-gray-100 text-gray-600') + ' rounded-full text-xs font-medium capitalize">' + (inv.status || 'draft') + '</span></td>' +
      '<td class="px-4 py-3 text-xs text-gray-400">' + fmtDate(inv.created_at) + '</td>' +
      '<td class="px-4 py-3">' +
        (inv.status === 'draft' ? '<button onclick="sendServiceInvoice(' + inv.id + ')" class="text-xs text-blue-600 hover:text-blue-800 font-medium mr-2"><i class="fas fa-paper-plane mr-1"></i>Send</button>' : '') +
        (inv.payment_link ? '<a href="' + inv.payment_link + '" target="_blank" class="text-xs text-green-600 hover:text-green-800 font-medium"><i class="fas fa-external-link-alt mr-1"></i>Payment Link</a>' : '') +
      '</td></tr>';
  }).join('');

  return '<div class="mb-6"><h2 class="text-2xl font-black text-gray-900"><i class="fas fa-file-invoice mr-2 text-amber-500"></i>Cold Call Invoices</h2><p class="text-sm text-gray-500 mt-1">Send invoices for Roofer Secretary AI subscriptions and setup fees to cold-call customers</p></div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">' +
    '<h3 class="font-bold text-gray-800 text-lg mb-4">Create Service Invoice</h3>' +
    '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Customer Name</label><input id="si-name" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="John Smith"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Customer Email *</label><input id="si-email" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="john@company.ca" type="email"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Customer Phone</label><input id="si-phone" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+1 403 555 1234"></div>' +
    '</div>' +
    '<div class="mb-4"><label class="text-xs text-gray-500 font-medium block mb-1">Line Items</label>' +
    '<div id="si-items">' +
    '<div class="flex gap-2 mb-2 si-item"><input class="flex-1 border rounded-lg px-3 py-2 text-sm si-desc" placeholder="Description" value="Roofer Secretary AI — Monthly Subscription"><input class="w-24 border rounded-lg px-3 py-2 text-sm text-right si-price" placeholder="Price" value="149.00" type="number" step="0.01"><button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-sm px-2"><i class="fas fa-trash"></i></button></div>' +
    '<div class="flex gap-2 mb-2 si-item"><input class="flex-1 border rounded-lg px-3 py-2 text-sm si-desc" placeholder="Description" value="Secretary AI Setup Fee (One-Time)"><input class="w-24 border rounded-lg px-3 py-2 text-sm text-right si-price" placeholder="Price" value="299.00" type="number" step="0.01"><button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-sm px-2"><i class="fas fa-trash"></i></button></div>' +
    '</div>' +
    '<button onclick="addServiceInvoiceItem()" class="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"><i class="fas fa-plus mr-1"></i>Add Line Item</button></div>' +
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Due Date</label><input id="si-due" class="w-full border rounded-lg px-3 py-2 text-sm" type="date"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Notes</label><input id="si-notes" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional invoice notes"></div>' +
    '</div>' +
    '<button onclick="createServiceInvoice()" class="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md"><i class="fas fa-file-invoice mr-2"></i>Create Invoice</button>' +
    '</div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">' +
    '<div class="p-4 border-b bg-gray-50"><h3 class="font-bold text-gray-800">Service Invoices (' + invoices.length + ')</h3></div>' +
    (invoices.length === 0 ? '<div class="p-8 text-center text-gray-400"><i class="fas fa-file-invoice text-3xl mb-3 opacity-30"></i><p>No service invoices yet</p></div>' :
    '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-50 text-xs text-gray-500 uppercase"><th class="px-4 py-3 text-left">Invoice #</th><th class="px-4 py-3 text-left">Customer</th><th class="px-4 py-3 text-left">Total</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-left">Created</th><th class="px-4 py-3 text-left">Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>') +
    '</div>';
}

function addServiceInvoiceItem() {
  var container = document.getElementById('si-items');
  var row = document.createElement('div');
  row.className = 'flex gap-2 mb-2 si-item';
  row.innerHTML = '<input class="flex-1 border rounded-lg px-3 py-2 text-sm si-desc" placeholder="Description"><input class="w-24 border rounded-lg px-3 py-2 text-sm text-right si-price" placeholder="Price" type="number" step="0.01"><button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-sm px-2"><i class="fas fa-trash"></i></button>';
  container.appendChild(row);
}

async function createServiceInvoice() {
  var email = document.getElementById('si-email').value;
  if (!email) { alert('Customer email is required'); return; }

  var items = [];
  document.querySelectorAll('.si-item').forEach(function(row) {
    var desc = row.querySelector('.si-desc').value;
    var price = parseFloat(row.querySelector('.si-price').value) || 0;
    if (desc && price > 0) items.push({ description: desc, price: price });
  });
  if (items.length === 0) { alert('At least one line item is required'); return; }

  var body = {
    customer_name: document.getElementById('si-name').value,
    customer_email: email,
    customer_phone: document.getElementById('si-phone').value,
    items: items,
    due_date: document.getElementById('si-due').value,
    notes: document.getElementById('si-notes').value
  };

  try {
    var res = await saFetch('/api/admin/superadmin/service-invoices/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.success) {
      alert('Invoice ' + data.invoice_number + ' created! Total: $' + parseFloat(data.total).toFixed(2));
      loadView('service-invoices');
    } else {
      alert(data.error || 'Failed to create invoice');
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function sendServiceInvoice(id) {
  if (!confirm('Send this invoice to the customer via email with Square payment link?')) return;
  try {
    var res = await saFetch('/api/admin/superadmin/service-invoices/' + id + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    var data = await res.json();
    if (data.success) {
      alert('Invoice sent with payment link!');
      loadView('service-invoices');
    } else {
      alert(data.error || 'Failed to send invoice');
    }
  } catch(e) { alert('Error sending: ' + e.message); }
}

// ============================================================
// CALL CENTER MANAGEMENT — Track calls, manage sales scripts
// ============================================================
function renderCallCenterManageView() {
  var stats = SA.data.cc_stats || {};
  var scripts = (SA.data.cc_scripts || {}).scripts || [];
  var today = stats.today || {};
  var week = stats.week || {};
  var recentCalls = stats.recent_calls || [];
  var agents = stats.agent_performance || [];

  var callRows = recentCalls.slice(0, 30).map(function(c) {
    var outcome = c.call_outcome || 'unknown';
    var oColor = { interested: 'text-green-600', demo_scheduled: 'text-blue-600', converted: 'text-emerald-700', not_interested: 'text-red-500', voicemail: 'text-gray-500', no_answer: 'text-gray-400', callback: 'text-purple-600' };
    return '<tr class="border-b border-gray-100 hover:bg-gray-50 text-sm">' +
      '<td class="px-3 py-2 text-gray-800 font-medium">' + (c.company_name || c.contact_name || 'Unknown') + '</td>' +
      '<td class="px-3 py-2 text-gray-500">' + (c.agent_name || '-') + '</td>' +
      '<td class="px-3 py-2 text-center"><span class="' + (oColor[outcome] || 'text-gray-500') + ' font-medium text-xs capitalize">' + outcome.replace('_', ' ') + '</span></td>' +
      '<td class="px-3 py-2 text-gray-500 text-center">' + fmtSeconds(c.call_duration_seconds || 0) + '</td>' +
      '<td class="px-3 py-2 text-gray-400 text-xs">' + fmtDateTime(c.started_at) + '</td>' +
      '</tr>';
  }).join('');

  var agentRows = agents.map(function(a) {
    return '<tr class="border-b border-gray-100">' +
      '<td class="px-4 py-3 font-bold text-gray-800 text-sm">' + (a.agent_name || 'Unknown') + '</td>' +
      '<td class="px-4 py-3 text-center text-sm">' + (a.total_calls || 0) + '</td>' +
      '<td class="px-4 py-3 text-center text-sm text-green-600 font-medium">' + (a.connects || 0) + '</td>' +
      '<td class="px-4 py-3 text-center text-sm text-blue-600 font-medium">' + (a.demos || 0) + '</td>' +
      '<td class="px-4 py-3 text-center text-sm text-gray-500">' + fmtSeconds(a.avg_duration || 0) + '</td>' +
      '</tr>';
  }).join('');

  var scriptsList = scripts.map(function(s) {
    return '<div class="bg-gray-50 rounded-xl p-4 mb-3 border border-gray-100">' +
      '<div class="flex items-center justify-between mb-2">' +
      '<div><span class="font-bold text-gray-800 text-sm">' + s.name + '</span>' +
      '<span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs capitalize">' + (s.category || 'cold_call').replace('_', ' ') + '</span>' +
      (s.is_active ? '' : '<span class="ml-2 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">Inactive</span>') +
      '</div>' +
      '<div class="flex gap-2">' +
      '<button onclick="toggleScript(' + s.id + ', ' + (s.is_active ? 0 : 1) + ')" class="text-xs ' + (s.is_active ? 'text-red-500' : 'text-green-500') + '">' + (s.is_active ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>') + '</button>' +
      '<button onclick="deleteScript(' + s.id + ')" class="text-xs text-gray-400 hover:text-red-500"><i class="fas fa-trash"></i></button>' +
      '</div></div>' +
      '<pre class="text-xs text-gray-600 whitespace-pre-wrap bg-white rounded-lg p-3 border max-h-40 overflow-y-auto">' + (s.script_body || '') + '</pre>' +
      (s.notes ? '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-sticky-note mr-1"></i>' + s.notes + '</p>' : '') +
      '</div>';
  }).join('');

  return '<div class="mb-6"><h2 class="text-2xl font-black text-gray-900"><i class="fas fa-headset mr-2 text-cyan-500"></i>Call Center Management</h2><p class="text-sm text-gray-500 mt-1">Track all calls, agent performance, and manage sales scripts</p></div>' +
    '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">' +
    samc('Today Calls', today.total_calls || 0, 'fa-phone', 'cyan', 'Connected: ' + (today.connected || 0)) +
    samc('Hot Leads', today.hot_leads || 0, 'fa-fire', 'orange', 'Today') +
    samc('Week Calls', week.total_calls || 0, 'fa-chart-bar', 'blue', 'Connected: ' + (week.connected || 0)) +
    samc('Week Demos', week.demos || 0, 'fa-calendar-check', 'green', 'Converted: ' + (week.converted || 0)) +
    '</div>' +
    '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">' +
    '<div class="p-4 border-b bg-gray-50 flex items-center justify-between"><h3 class="font-bold text-gray-800">Recent Calls</h3><button onclick="loadView(\'call-center-manage\')" class="text-xs text-blue-600"><i class="fas fa-sync mr-1"></i>Refresh</button></div>' +
    (recentCalls.length === 0 ? '<div class="p-6 text-center text-gray-400">No call logs yet</div>' :
    '<div class="overflow-x-auto max-h-96 overflow-y-auto"><table class="w-full"><thead class="sticky top-0 bg-gray-50"><tr class="text-xs text-gray-500 uppercase"><th class="px-3 py-2 text-left">Prospect</th><th class="px-3 py-2 text-left">Agent</th><th class="px-3 py-2 text-center">Outcome</th><th class="px-3 py-2 text-center">Duration</th><th class="px-3 py-2 text-left">Time</th></tr></thead><tbody>' + callRows + '</tbody></table></div>') +
    '</div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">' +
    '<div class="p-4 border-b bg-gray-50"><h3 class="font-bold text-gray-800">Agent Performance (7 Days)</h3></div>' +
    (agents.length === 0 ? '<div class="p-6 text-center text-gray-400">No agent data</div>' :
    '<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-50 text-xs text-gray-500 uppercase"><th class="px-4 py-3 text-left">Agent</th><th class="px-4 py-3 text-center">Calls</th><th class="px-4 py-3 text-center">Connects</th><th class="px-4 py-3 text-center">Demos</th><th class="px-4 py-3 text-center">Avg Duration</th></tr></thead><tbody>' + agentRows + '</tbody></table></div>') +
    '</div></div>' +
    '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">' +
    '<div class="flex items-center justify-between mb-4"><h3 class="font-bold text-gray-800 text-lg"><i class="fas fa-scroll mr-2 text-blue-500"></i>Sales Scripts</h3>' +
    '<button onclick="document.getElementById(\'new-script-form\').classList.toggle(\'hidden\')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium"><i class="fas fa-plus mr-1"></i>New Script</button></div>' +
    '<div id="new-script-form" class="hidden bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">' +
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Script Name *</label><input id="ns-name" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Cold Call - Intro Pitch"></div>' +
    '<div><label class="text-xs text-gray-500 font-medium block mb-1">Category</label><select id="ns-category" class="w-full border rounded-lg px-3 py-2 text-sm"><option value="cold_call">Cold Call</option><option value="follow_up">Follow Up</option><option value="demo">Demo</option><option value="close">Close</option><option value="objection_handler">Objection Handler</option></select></div>' +
    '</div>' +
    '<div class="mb-3"><label class="text-xs text-gray-500 font-medium block mb-1">Script Body *</label><textarea id="ns-body" class="w-full border rounded-lg px-3 py-2 text-sm h-32" placeholder="Hi [Name], this is [Agent] from RoofReporterAI..."></textarea></div>' +
    '<div class="mb-3"><label class="text-xs text-gray-500 font-medium block mb-1">Notes</label><input id="ns-notes" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional notes about when to use"></div>' +
    '<button onclick="createScript()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i class="fas fa-save mr-1"></i>Save Script</button>' +
    '</div>' +
    (scripts.length === 0 ? '<div class="text-center text-gray-400 py-6"><i class="fas fa-scroll text-3xl mb-3 opacity-30"></i><p>No sales scripts yet. Create one above.</p></div>' : scriptsList) +
    '</div>';
}

async function createScript() {
  var name = document.getElementById('ns-name').value;
  var body = document.getElementById('ns-body').value;
  if (!name || !body) { alert('Name and script body are required'); return; }

  try {
    var res = await saFetch('/api/admin/superadmin/sales-scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        category: document.getElementById('ns-category').value,
        script_body: body,
        notes: document.getElementById('ns-notes').value
      })
    });
    var data = await res.json();
    if (data.success) {
      loadView('call-center-manage');
    } else {
      alert(data.error || 'Failed to create script');
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function toggleScript(id, active) {
  try {
    await saFetch('/api/admin/superadmin/sales-scripts/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active })
    });
    loadView('call-center-manage');
  } catch(e) { alert('Error toggling script'); }
}

async function deleteScript(id) {
  if (!confirm('Delete this sales script?')) return;
  try {
    await saFetch('/api/admin/superadmin/sales-scripts/' + id, { method: 'DELETE' });
    loadView('call-center-manage');
  } catch(e) { alert('Error deleting script'); }
}
