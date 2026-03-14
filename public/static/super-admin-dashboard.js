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
  ga4Tab: 'overview'
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
      case 'livekit':
        try {
          const [lkTrunksRes, lkRulesRes] = await Promise.all([
            saFetch('/api/secretary/sip/trunks'),
            saFetch('/api/secretary/sip/dispatch-rules'),
          ]);
          if (lkTrunksRes) {
            const td = await lkTrunksRes.json();
            SA.data.livekit_trunks = td.error ? { error: td.error } : td;
          }
          if (lkRulesRes) {
            const rd = await lkRulesRes.json();
            SA.data.livekit_rules = rd.error ? { error: rd.error } : rd;
          }
        } catch(lkErr) {
          console.warn('LiveKit load error:', lkErr);
          SA.data.livekit_trunks = { error: lkErr.message };
          SA.data.livekit_rules = { error: lkErr.message };
        }
        break;
      case 'livekit-agents':
        // Uses same data as livekit call center
        if (!SA.data.livekit_trunks) {
          try {
            const [lkTRes, lkRRes] = await Promise.all([
              saFetch('/api/secretary/sip/trunks'),
              saFetch('/api/secretary/sip/dispatch-rules'),
            ]);
            if (lkTRes) { const td = await lkTRes.json(); SA.data.livekit_trunks = td.error ? { error: td.error } : td; }
            if (lkRRes) { const rd = await lkRRes.json(); SA.data.livekit_rules = rd.error ? { error: rd.error } : rd; }
          } catch(e) { SA.data.livekit_trunks = { error: e.message }; }
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
    case 'livekit': root.innerHTML = renderLiveKitView(); break;
    case 'livekit-agents': root.innerHTML = renderLiveKitAgentsView(); break;
    case 'heygen': break; // Handled by heygen.js
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
// VIEW: LIVEKIT AGENTS — SIP Trunks, Dispatch Rules & Agent Deployment
// ============================================================
function renderLiveKitView() {
  const trunksData = SA.data.livekit_trunks || {};
  const rulesData = SA.data.livekit_rules || {};

  // Handle configuration errors gracefully
  if (trunksData.error || rulesData.error) {
    return `<div class="slide-in space-y-6">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-phone-alt mr-2 text-green-600"></i>LiveKit Call Center</h2>
        <p class="text-sm text-gray-500 mt-1">Manage SIP trunks, dispatch rules, and deploy voice agents</p>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <i class="fas fa-exclamation-triangle text-amber-500 text-3xl mb-3"></i>
        <h3 class="font-bold text-amber-800 mb-2">LiveKit Configuration Required</h3>
        <p class="text-amber-700 text-sm mb-4">${trunksData.error || rulesData.error || 'LiveKit API keys need to be configured.'}</p>
        <code class="bg-white px-4 py-2 rounded-lg text-xs block max-w-xl mx-auto text-left">wrangler pages secret put LIVEKIT_API_KEY --project-name roofing-measurement-tool<br>wrangler pages secret put LIVEKIT_API_SECRET --project-name roofing-measurement-tool<br>wrangler pages secret put LIVEKIT_URL --project-name roofing-measurement-tool</code>
        <button onclick="loadView('livekit')" class="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"><i class="fas fa-sync-alt mr-1"></i>Retry</button>
      </div>
    </div>`;
  }

  const inboundTrunks = trunksData.inbound_trunks || [];
  const outboundTrunks = trunksData.outbound_trunks || [];
  const dispatchRules = rulesData.dispatch_rules || [];

  return `<div class="slide-in space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-phone-alt mr-2 text-green-600"></i>LiveKit Call Center</h2>
        <p class="text-sm text-gray-500 mt-1">Manage SIP trunks, dispatch rules, and deploy voice agents</p>
      </div>
      <div class="flex gap-2">
        <button onclick="lkShowDeployModal()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm">
          <i class="fas fa-rocket mr-1"></i>Deploy Agent
        </button>
        <button onclick="lkShowCreateRuleModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          <i class="fas fa-plus mr-1"></i>New Dispatch Rule
        </button>
        <button onclick="loadView('livekit')" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="grid grid-cols-4 gap-4">
      ${samc('Inbound Trunks', inboundTrunks.length, 'fa-phone-volume', 'green', 'Active SIP connections')}
      ${samc('Outbound Trunks', outboundTrunks.length, 'fa-phone', 'blue', 'Outgoing call routes')}
      ${samc('Dispatch Rules', dispatchRules.length, 'fa-random', 'purple', 'Call routing rules')}
      ${samc('Active Agents', dispatchRules.filter(r => r.agents && (r.agents.service || r.agents.agent_name)).length, 'fa-robot', 'yellow', 'Deployed AI agents')}
    </div>

    <!-- Dispatch Rules Table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-900"><i class="fas fa-random mr-2 text-purple-500"></i>Dispatch Rules</h3>
        <span class="text-xs text-gray-400">${dispatchRules.length} rule${dispatchRules.length !== 1 ? 's' : ''}</span>
      </div>
      ${dispatchRules.length === 0 ? `
        <div class="px-6 py-12 text-center text-gray-400">
          <i class="fas fa-random text-4xl mb-3 opacity-30"></i>
          <p>No dispatch rules configured</p>
          <p class="text-xs mt-1">Create a dispatch rule to route inbound calls to LiveKit rooms</p>
        </div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Dispatch Rule ID</th>
                <th class="px-4 py-3">Rule Name</th>
                <th class="px-4 py-3">Inbound Routing</th>
                <th class="px-4 py-3">Destination Room</th>
                <th class="px-4 py-3">Agents</th>
                <th class="px-4 py-3">Rule Type</th>
                <th class="px-4 py-3">Created</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${dispatchRules.map(rule => {
                const routing = (rule.inbound_routing || []).map(r =>
                  '<span class="inline-flex items-center gap-1"><i class="fas fa-phone text-green-500 text-[10px]"></i>' +
                  (r.numbers && r.numbers.length > 0 ? r.numbers.join(', ') : r.trunk_id) +
                  '</span>'
                ).join('<br>') || '<span class="text-gray-300">None</span>';

                const agents = rule.agents || {};
                let agentDisplay = '';
                if (agents.agent_name) {
                  agentDisplay = '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-[11px] font-medium"><i class="fas fa-robot"></i> ' + agents.agent_name + '</span>';
                } else if (agents.service) {
                  agentDisplay = '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium"><i class="fas fa-cog"></i> ' + agents.service + '</span>';
                } else if (agents.customer_id) {
                  agentDisplay = '<span class="text-gray-500 text-xs">Customer #' + agents.customer_id + '</span>';
                } else {
                  agentDisplay = '<span class="text-gray-300 text-xs">—</span>';
                }

                const typeColors = {
                  individual: 'bg-purple-100 text-purple-700',
                  direct: 'bg-blue-100 text-blue-700',
                  callee: 'bg-teal-100 text-teal-700',
                  unknown: 'bg-gray-100 text-gray-500'
                };
                const typeClass = typeColors[rule.rule_type] || typeColors.unknown;

                const createdStr = rule.created_at ? new Date(rule.created_at * 1000 || rule.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

                return '<tr class="hover:bg-gray-50 transition-colors">' +
                  '<td class="px-4 py-3"><code class="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">' + (rule.dispatch_rule_id || '—') + '</code></td>' +
                  '<td class="px-4 py-3 font-medium text-gray-900">' + (rule.name || '(unnamed)') + '</td>' +
                  '<td class="px-4 py-3 text-xs">' + routing + '</td>' +
                  '<td class="px-4 py-3"><code class="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">' + (rule.destination_room || '—') + '</code></td>' +
                  '<td class="px-4 py-3">' + agentDisplay + '</td>' +
                  '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ' + typeClass + '">' + (rule.rule_type || 'unknown') + '</span></td>' +
                  '<td class="px-4 py-3 text-xs text-gray-500">' + createdStr + '</td>' +
                  '<td class="px-4 py-3 text-right"><button onclick="lkDeleteRule(\'' + rule.dispatch_rule_id + '\')" class="text-red-400 hover:text-red-600 text-xs transition-colors"><i class="fas fa-trash"></i></button></td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Inbound Trunks Table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-900"><i class="fas fa-phone-volume mr-2 text-green-500"></i>Inbound SIP Trunks</h3>
        <span class="text-xs text-gray-400">${inboundTrunks.length} trunk${inboundTrunks.length !== 1 ? 's' : ''}</span>
      </div>
      ${inboundTrunks.length === 0 ? `
        <div class="px-6 py-8 text-center text-gray-400">
          <p class="text-sm">No inbound trunks configured</p>
        </div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Trunk ID</th>
                <th class="px-4 py-3">Name</th>
                <th class="px-4 py-3">Phone Numbers</th>
                <th class="px-4 py-3">Krisp</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${inboundTrunks.map(t => {
                const tid = t.sip_trunk_id || t.trunk?.sip_trunk_id || '';
                const name = t.name || t.trunk?.name || '(unnamed)';
                const nums = (t.numbers || t.trunk?.numbers || []).join(', ') || '—';
                const krisp = t.krisp_enabled ?? t.trunk?.krisp_enabled ?? false;
                return '<tr class="hover:bg-gray-50">' +
                  '<td class="px-4 py-3"><code class="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">' + tid + '</code></td>' +
                  '<td class="px-4 py-3 font-medium">' + name + '</td>' +
                  '<td class="px-4 py-3 text-xs">' + nums + '</td>' +
                  '<td class="px-4 py-3">' + (krisp ? '<span class="text-green-600"><i class="fas fa-check-circle"></i></span>' : '<span class="text-gray-300">—</span>') + '</td>' +
                  '<td class="px-4 py-3 text-right"><button onclick="lkDeleteTrunk(\'' + tid + '\')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button></td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Deploy Agent Modal (hidden) -->
    <div id="lk-deploy-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-rocket mr-2 text-green-500"></i>Deploy LiveKit Agent</h3>
          <button onclick="lkCloseModals()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Agent Name</label>
            <input id="lk-deploy-name" type="text" value="RoofReporterAI Secretary" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Phone Number (E.164)</label>
            <input id="lk-deploy-phone" type="text" placeholder="+17809833335" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Room Prefix</label>
            <input id="lk-deploy-prefix" type="text" value="secretary-" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Rule Type</label>
            <select id="lk-deploy-type" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
              <option value="individual">Individual (unique room per call)</option>
              <option value="direct">Direct (fixed room name)</option>
              <option value="callee">Callee (room by callee number)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Agent Voice</label>
            <select id="lk-deploy-voice" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
              <option value="alloy">Alloy (neutral)</option>
              <option value="echo">Echo (male)</option>
              <option value="fable">Fable (expressive)</option>
              <option value="onyx">Onyx (deep)</option>
              <option value="nova">Nova (female)</option>
              <option value="shimmer">Shimmer (warm)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Agent Persona / Notes (optional)</label>
            <textarea id="lk-deploy-persona" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" placeholder="e.g. Friendly roofing estimator assistant"></textarea>
          </div>
          <div class="flex items-center gap-2">
            <input id="lk-deploy-krisp" type="checkbox" checked class="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <label for="lk-deploy-krisp" class="text-sm text-gray-700">Enable Krisp noise cancellation</label>
          </div>
          <div id="lk-deploy-status" class="hidden text-sm"></div>
          <button onclick="lkDeployAgent()" id="lk-deploy-btn" class="w-full bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors">
            <i class="fas fa-rocket mr-1"></i>Deploy Agent
          </button>
        </div>
      </div>
    </div>

    <!-- Create Rule Modal (hidden) -->
    <div id="lk-rule-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-plus mr-2 text-blue-500"></i>Create Dispatch Rule</h3>
          <button onclick="lkCloseModals()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Rule Name</label>
            <input id="lk-rule-name" type="text" value="roofreporterai-dispatch" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Rule Type</label>
            <select id="lk-rule-type" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="individual">Individual (unique room per call)</option>
              <option value="direct">Direct (fixed room name)</option>
              <option value="callee">Callee (room by callee number)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Room Prefix / Room Name</label>
            <input id="lk-rule-room" type="text" value="secretary-" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <p class="text-xs text-gray-400 mt-1">For "individual" or "callee": prefix. For "direct": fixed room name.</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Trunk IDs (comma-separated, optional)</label>
            <input id="lk-rule-trunks" type="text" placeholder="ST_xxxx, ST_yyyy" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <p class="text-xs text-gray-400 mt-1">Leave empty to match all trunks, or specify specific trunk IDs</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">PIN (optional)</label>
            <input id="lk-rule-pin" type="text" placeholder="" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Metadata JSON (optional)</label>
            <textarea id="lk-rule-metadata" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" placeholder='{"service":"roofer_secretary"}'></textarea>
          </div>
          <div id="lk-rule-status" class="hidden text-sm"></div>
          <button onclick="lkCreateRule()" id="lk-rule-btn" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            <i class="fas fa-plus mr-1"></i>Create Dispatch Rule
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// LiveKit Modal Helpers
function lkShowDeployModal() {
  document.getElementById('lk-deploy-modal').classList.remove('hidden');
}
function lkShowCreateRuleModal() {
  document.getElementById('lk-rule-modal').classList.remove('hidden');
}
function lkCloseModals() {
  var m1 = document.getElementById('lk-deploy-modal');
  var m2 = document.getElementById('lk-rule-modal');
  if (m1) m1.classList.add('hidden');
  if (m2) m2.classList.add('hidden');
}
window.lkShowDeployModal = lkShowDeployModal;
window.lkShowCreateRuleModal = lkShowCreateRuleModal;
window.lkCloseModals = lkCloseModals;

// Deploy Agent
async function lkDeployAgent() {
  var btn = document.getElementById('lk-deploy-btn');
  var statusEl = document.getElementById('lk-deploy-status');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Deploying...';
  statusEl.classList.remove('hidden');
  statusEl.className = 'text-sm text-blue-600';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Creating SIP trunk and dispatch rule...';

  var payload = {
    name: document.getElementById('lk-deploy-name').value,
    phone_number: document.getElementById('lk-deploy-phone').value,
    room_prefix: document.getElementById('lk-deploy-prefix').value,
    rule_type: document.getElementById('lk-deploy-type').value,
    krisp_enabled: document.getElementById('lk-deploy-krisp').checked,
    agent_config: {
      agent_name: document.getElementById('lk-deploy-name').value,
      agent_voice: document.getElementById('lk-deploy-voice').value,
      persona: document.getElementById('lk-deploy-persona').value,
    }
  };

  try {
    var res = await fetch('/api/secretary/sip/deploy-agent', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, saHeaders()),
      body: JSON.stringify(payload)
    });
    var data = await res.json();
    if (data.success) {
      statusEl.className = 'text-sm text-green-600 bg-green-50 p-3 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i><strong>Deployed!</strong><br>' +
        '<span class="text-xs">Trunk: <code>' + data.deployment.sip_trunk_id + '</code></span><br>' +
        '<span class="text-xs">Dispatch: <code>' + data.deployment.dispatch_rule_id + '</code></span><br>' +
        '<span class="text-xs">' + data.message + '</span>';
      btn.innerHTML = '<i class="fas fa-check mr-1"></i>Deployed!';
      setTimeout(function() { lkCloseModals(); loadView('livekit'); }, 2500);
    } else {
      statusEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + (data.error || 'Unknown error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-rocket mr-1"></i>Deploy Agent';
    }
  } catch (err) {
    statusEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
    statusEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Network error: ' + err.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket mr-1"></i>Deploy Agent';
  }
}
window.lkDeployAgent = lkDeployAgent;

// Create Dispatch Rule
async function lkCreateRule() {
  var btn = document.getElementById('lk-rule-btn');
  var statusEl = document.getElementById('lk-rule-status');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Creating...';
  statusEl.classList.remove('hidden');
  statusEl.className = 'text-sm text-blue-600';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Creating dispatch rule...';

  var ruleType = document.getElementById('lk-rule-type').value;
  var roomVal = document.getElementById('lk-rule-room').value;
  var trunksStr = document.getElementById('lk-rule-trunks').value.trim();
  var trunkIds = trunksStr ? trunksStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];

  var payload = {
    name: document.getElementById('lk-rule-name').value,
    rule_type: ruleType,
    trunk_ids: trunkIds,
    pin: document.getElementById('lk-rule-pin').value,
    metadata: document.getElementById('lk-rule-metadata').value,
  };
  if (ruleType === 'direct') {
    payload.room_name = roomVal;
  } else {
    payload.room_prefix = roomVal;
  }

  try {
    var res = await fetch('/api/secretary/sip/dispatch-rule', {
      method: 'POST',
      headers: Object.assign({'Content-Type': 'application/json'}, saHeaders()),
      body: JSON.stringify(payload)
    });
    var data = await res.json();
    if (data.success) {
      statusEl.className = 'text-sm text-green-600 bg-green-50 p-3 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i><strong>Created!</strong> ID: <code>' + data.dispatch_rule_id + '</code>';
      btn.innerHTML = '<i class="fas fa-check mr-1"></i>Created!';
      setTimeout(function() { lkCloseModals(); loadView('livekit'); }, 2000);
    } else {
      statusEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + (data.error || 'Unknown error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-plus mr-1"></i>Create Dispatch Rule';
    }
  } catch (err) {
    statusEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
    statusEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Network error: ' + err.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus mr-1"></i>Create Dispatch Rule';
  }
}
window.lkCreateRule = lkCreateRule;

// Delete Dispatch Rule
async function lkDeleteRule(ruleId) {
  if (!confirm('Delete dispatch rule ' + ruleId + '? This will stop routing calls for this rule.')) return;
  try {
    var res = await fetch('/api/secretary/sip/dispatch-rule/' + ruleId, {
      method: 'DELETE',
      headers: saHeaders()
    });
    var data = await res.json();
    if (data.success) {
      loadView('livekit');
    } else {
      alert('Error: ' + (data.error || 'Failed to delete'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}
window.lkDeleteRule = lkDeleteRule;

// Delete Trunk
async function lkDeleteTrunk(trunkId) {
  if (!confirm('Delete SIP trunk ' + trunkId + '? This will disconnect the phone number.')) return;
  try {
    var res = await fetch('/api/secretary/sip/trunk/' + trunkId, {
      method: 'DELETE',
      headers: saHeaders()
    });
    var data = await res.json();
    if (data.success) {
      loadView('livekit');
    } else {
      alert('Error: ' + (data.error || 'Failed to delete'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}
window.lkDeleteTrunk = lkDeleteTrunk;

// ============================================================
// VIEW: LIVEKIT AGENTS — Create & manage custom LiveKit agents
// ============================================================
function renderLiveKitAgentsView() {
  const trunksData = SA.data.livekit_trunks || {};
  const rulesData = SA.data.livekit_rules || {};

  if (trunksData.error || rulesData.error) {
    return `
    <div class="mb-6">
      <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-robot mr-2 text-purple-600"></i>LiveKit Agents</h2>
      <p class="text-sm text-gray-500 mt-1">Create and manage custom AI agents for various tasks</p>
    </div>
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
      <i class="fas fa-exclamation-triangle text-amber-500 text-3xl mb-3"></i>
      <h3 class="font-bold text-amber-800 mb-2">LiveKit Configuration Required</h3>
      <p class="text-amber-700 text-sm mb-4">LiveKit API keys need to be configured to manage agents.</p>
      <code class="bg-white px-4 py-2 rounded-lg text-xs block max-w-xl mx-auto text-left">wrangler pages secret put LIVEKIT_API_KEY --project-name roofing-measurement-tool<br>wrangler pages secret put LIVEKIT_API_SECRET --project-name roofing-measurement-tool<br>wrangler pages secret put LIVEKIT_URL --project-name roofing-measurement-tool</code>
    </div>`;
  }

  const dispatchRules = rulesData.dispatch_rules || [];
  const agents = dispatchRules.filter(r => r.agents && (r.agents.service || r.agents.agent_name));

  return `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-black text-gray-900"><i class="fas fa-robot mr-2 text-purple-600"></i>LiveKit Agents</h2>
        <p class="text-sm text-gray-500 mt-1">Create and manage custom AI agents — voice bots, receptionists, outbound callers, and more</p>
      </div>
      <button onclick="lkShowCreateAgentModal()" class="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm">
        <i class="fas fa-plus mr-2"></i>Create Agent
      </button>
    </div>

    <!-- Agent Types -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100 rounded-xl p-5">
        <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3"><i class="fas fa-headset text-purple-500"></i></div>
        <h3 class="font-bold text-gray-900 text-sm">Voice Receptionist</h3>
        <p class="text-xs text-gray-500 mt-1">Answers inbound calls, takes messages, routes to departments. Best for after-hours coverage.</p>
        <button onclick="lkShowCreateAgentModal('receptionist')" class="mt-3 px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-semibold hover:bg-purple-600 transition-colors">Create</button>
      </div>
      <div class="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-100 rounded-xl p-5">
        <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3"><i class="fas fa-phone-volume text-blue-500"></i></div>
        <h3 class="font-bold text-gray-900 text-sm">Outbound Sales Caller</h3>
        <p class="text-xs text-gray-500 mt-1">Makes outbound calls to prospects, pitches services, books appointments. Great for lead follow-up.</p>
        <button onclick="lkShowCreateAgentModal('sales')" class="mt-3 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors">Create</button>
      </div>
      <div class="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 rounded-xl p-5">
        <div class="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3"><i class="fas fa-clipboard-check text-emerald-500"></i></div>
        <h3 class="font-bold text-gray-900 text-sm">Survey / Feedback Agent</h3>
        <p class="text-xs text-gray-500 mt-1">Calls customers for satisfaction surveys, collects feedback, and rates service quality.</p>
        <button onclick="lkShowCreateAgentModal('survey')" class="mt-3 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors">Create</button>
      </div>
    </div>

    <!-- Deployed Agents -->
    <div class="bg-white border border-gray-100 rounded-xl shadow-sm">
      <div class="p-5 border-b border-gray-100">
        <h3 class="font-bold text-gray-900"><i class="fas fa-rocket mr-2 text-purple-500"></i>Deployed Agents (${agents.length})</h3>
      </div>
      ${agents.length === 0 ? '<div class="p-8 text-center text-gray-400"><i class="fas fa-robot text-3xl mb-3 block text-gray-300"></i>No agents deployed yet. Create one above to get started.</div>' :
        '<div class="divide-y divide-gray-50">' + agents.map(function(r) {
          var agentName = (r.agents && r.agents.agent_name) || (r.agents && r.agents.service) || 'Unknown';
          var room = r.room || {};
          return '<div class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center"><i class="fas fa-robot text-purple-500 text-sm"></i></div>' +
              '<div>' +
                '<div class="font-semibold text-gray-900 text-sm">' + agentName + '</div>' +
                '<div class="text-xs text-gray-400">Room: ' + (room.room_prefix || room.room || 'default') + ' &bull; Rule: ' + (r.sip_dispatch_rule_id || 'N/A').substring(0, 12) + '...</div>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="px-2 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-bold">ACTIVE</span>' +
              '<button onclick="lkDeleteRule(\'' + r.sip_dispatch_rule_id + '\')" class="px-2 py-1.5 text-red-400 hover:text-red-600 text-xs" title="Delete"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'}
    </div>

    <!-- Create Agent Modal -->
    <div id="lkAgentModal" class="fixed inset-0 bg-black/50 z-50 items-center justify-center" style="display:none">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto mt-20 overflow-hidden">
        <div class="bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-4 flex items-center justify-between">
          <h3 class="text-white font-bold text-lg"><i class="fas fa-robot mr-2"></i>Create LiveKit Agent</h3>
          <button onclick="lkCloseAgentModal()" class="text-white/70 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Agent Type</label>
            <select id="lkAgentType" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="receptionist">Voice Receptionist</option>
              <option value="sales">Outbound Sales Caller</option>
              <option value="survey">Survey / Feedback Agent</option>
              <option value="custom">Custom Agent</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Agent Name</label>
            <input id="lkAgentName" type="text" placeholder="e.g. RoofReporter Sales Bot" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Voice</label>
            <select id="lkAgentVoice" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="alloy">Alloy (Neutral)</option>
              <option value="echo">Echo (Male)</option>
              <option value="fable">Fable (Warm)</option>
              <option value="onyx">Onyx (Deep Male)</option>
              <option value="nova">Nova (Female)</option>
              <option value="shimmer">Shimmer (Bright Female)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">System Prompt</label>
            <textarea id="lkAgentPrompt" rows="5" placeholder="Describe what this agent should do, how it should respond, and any specific instructions..." class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-vertical"></textarea>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Phone Number (for SIP routing)</label>
            <input id="lkAgentPhone" type="text" placeholder="+17801234567 (optional)" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </div>
          <div id="lkAgentModalStatus"></div>
          <button onclick="lkCreateAgent()" class="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors">
            <i class="fas fa-rocket mr-2"></i>Deploy Agent
          </button>
        </div>
      </div>
    </div>`;
}

function lkShowCreateAgentModal(type) {
  var modal = document.getElementById('lkAgentModal');
  if (modal) modal.style.display = 'flex';
  if (type) {
    var sel = document.getElementById('lkAgentType');
    if (sel) sel.value = type;
    // Auto-fill prompt based on type
    var prompt = document.getElementById('lkAgentPrompt');
    if (prompt && !prompt.value.trim()) {
      var prompts = {
        receptionist: 'You are a professional receptionist for a roofing company called RoofReporterAI. Answer inbound calls warmly, take messages for the team, answer basic questions about roof measurement reports, and route urgent calls. Be friendly, professional, and concise.',
        sales: 'You are an outbound sales agent for RoofReporterAI. Your goal is to call potential roofing contractors and offer them our AI-powered roof measurement report service. Highlight: instant satellite-based measurements, 95%+ accuracy, professional PDF reports, and competitive pricing. Book a demo when possible.',
        survey: 'You are a customer satisfaction survey agent for RoofReporterAI. Call customers who recently received a roof measurement report. Ask about their experience: accuracy, report quality, turnaround time, and likelihood to recommend. Rate satisfaction 1-10 and note any feedback.',
      };
      prompt.value = prompts[type] || '';
    }
  }
}
window.lkShowCreateAgentModal = lkShowCreateAgentModal;

function lkCloseAgentModal() {
  var modal = document.getElementById('lkAgentModal');
  if (modal) modal.style.display = 'none';
}
window.lkCloseAgentModal = lkCloseAgentModal;

async function lkCreateAgent() {
  var name = document.getElementById('lkAgentName')?.value?.trim();
  var agentType = document.getElementById('lkAgentType')?.value || 'custom';
  var voice = document.getElementById('lkAgentVoice')?.value || 'alloy';
  var prompt = document.getElementById('lkAgentPrompt')?.value?.trim();
  var phone = document.getElementById('lkAgentPhone')?.value?.trim();
  var status = document.getElementById('lkAgentModalStatus');

  if (!name) { if (status) status.innerHTML = '<p class="text-red-500 text-xs">Agent name is required</p>'; return; }
  if (!prompt) { if (status) status.innerHTML = '<p class="text-red-500 text-xs">System prompt is required</p>'; return; }

  if (status) status.innerHTML = '<p class="text-blue-500 text-xs"><i class="fas fa-spinner fa-spin mr-1"></i>Deploying agent...</p>';

  try {
    var res = await fetch('/api/secretary/sip/deploy-agent', {
      method: 'POST',
      headers: { ...saHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: name,
        agent_type: agentType,
        agent_voice: voice,
        system_prompt: prompt,
        phone_number: phone || undefined,
      })
    });
    var data = await res.json();
    if (data.success) {
      if (status) status.innerHTML = '<p class="text-green-500 text-xs"><i class="fas fa-check-circle mr-1"></i>Agent deployed successfully!</p>';
      setTimeout(function() { lkCloseAgentModal(); loadView('livekit-agents'); }, 2000);
    } else {
      if (status) status.innerHTML = '<p class="text-red-500 text-xs">Error: ' + (data.error || 'Deployment failed') + '</p>';
    }
  } catch(e) {
    if (status) status.innerHTML = '<p class="text-red-500 text-xs">Network error: ' + e.message + '</p>';
  }
}
window.lkCreateAgent = lkCreateAgent;
