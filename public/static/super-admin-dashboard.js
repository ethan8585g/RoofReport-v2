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
  ordersFilter: ''
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

async function saFetch(url) {
  const res = await fetch(url, { headers: saHeaders() });
  if (res.status === 401 || res.status === 403) {
    // Session expired or invalid — redirect to login
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
