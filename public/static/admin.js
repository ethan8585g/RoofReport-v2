// ============================================================
// ADMIN CONTROL PANEL — Full Business Management Dashboard
// Tabs: Overview | Users | Earnings | Sales | Invoicing | Marketing
// Only accessible by superadmin (ethangourley17@gmail.com)
// ============================================================

const A = {
  loading: true,
  tab: 'overview',
  data: null,
  orders: [],
  gmailStatus: null
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  render();
});

// Admin auth helper — include Bearer token with every admin API call
function adminHeaders() {
  const token = localStorage.getItem('rc_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function adminFetch(url) {
  const res = await fetch(url, { headers: adminHeaders() });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('rc_user');
    localStorage.removeItem('rc_token');
    window.location.href = '/login';
    return null;
  }
  return res;
}

async function loadAll() {
  A.loading = true;
  try {
    const [statsRes, ordersRes, gmailRes] = await Promise.all([
      adminFetch('/api/auth/admin-stats'),
      adminFetch('/api/orders?limit=100'),
      fetch('/api/auth/gmail/status').catch(() => null)
    ]);
    if (statsRes) A.data = await statsRes.json();
    if (ordersRes) { const od = await ordersRes.json(); A.orders = od.orders || []; }
    if (gmailRes && gmailRes.ok) A.gmailStatus = await gmailRes.json();
  } catch (e) { console.error('Load error:', e); }
  A.loading = false;
}

function setTab(t) { A.tab = t; render(); }

function render() {
  const root = document.getElementById('admin-root');
  if (!root) return;
  if (A.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div><span class="ml-3 text-gray-500">Loading admin panel...</span></div>';
    return;
  }

  const tabs = [
    { id:'overview', label:'Overview', icon:'fa-tachometer-alt' },
    { id:'users', label:'Users', icon:'fa-users' },
    { id:'earnings', label:'Earnings', icon:'fa-dollar-sign' },
    { id:'sales', label:'Sales & Orders', icon:'fa-chart-line' },
    { id:'invoicing', label:'Invoicing', icon:'fa-file-invoice-dollar' },
    { id:'marketing', label:'Marketing', icon:'fa-bullhorn' },
    { id:'rover', label:'Rover Chat', icon:'fa-robot' },
    { id:'neworder', label:'New Order', icon:'fa-plus-circle' },
    { id:'blog', label:'Blog', icon:'fa-blog' },
    { id:'activity', label:'Activity Log', icon:'fa-history' },
    { id:'sip', label:'SIP Bridge', icon:'fa-phone-volume' }
  ];

  root.innerHTML = `
    <!-- Tab Navigation -->
    <div class="flex gap-1.5 mb-6 overflow-x-auto pb-1">
      ${tabs.map(t => `
        <button onclick="setTab('${t.id}')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${A.tab === t.id ? 'tab-active' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}">
          <i class="fas ${t.icon} text-xs"></i>${t.label}
        </button>
      `).join('')}
    </div>

    <!-- Content -->
    <div class="slide-in">
      ${A.tab === 'overview' ? renderOverview() : ''}
      ${A.tab === 'users' ? renderUsers() : ''}
      ${A.tab === 'earnings' ? renderEarnings() : ''}
      ${A.tab === 'sales' ? renderSales() : ''}
      ${A.tab === 'invoicing' ? renderInvoicing() : ''}
      ${A.tab === 'marketing' ? renderMarketing() : ''}
      ${A.tab === 'rover' ? renderRover() : ''}
      ${A.tab === 'neworder' ? renderNewOrder() : ''}
      ${A.tab === 'blog' ? renderBlog() : ''}
      ${A.tab === 'activity' ? renderActivity() : ''}
      ${A.tab === 'sip' ? renderSipBridge() : ''}
    </div>
  `;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function mc(label, value, icon, color, sub) {
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

function $(v, d=0) { return (v || 0).toFixed(d); }
function $$(v) { return '$' + (v || 0).toFixed(2); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-CA') : '-'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-CA') : '-'; }

function statusBadge(s) {
  const m = { pending:'bg-yellow-100 text-yellow-800', paid:'bg-blue-100 text-blue-800', processing:'bg-indigo-100 text-indigo-800', enhancing:'bg-purple-100 text-purple-800', completed:'bg-green-100 text-green-800', failed:'bg-red-100 text-red-800', cancelled:'bg-gray-100 text-gray-500' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s}</span>`;
}

function tierBadge(t) {
  const m = { express:'bg-brand-100 text-brand-700', standard:'bg-brand-100 text-brand-700', immediate:'bg-brand-100 text-brand-700', urgent:'bg-brand-100 text-brand-700', regular:'bg-brand-100 text-brand-700' };
  const i = { express:'fa-bolt', standard:'fa-bolt', immediate:'fa-bolt', urgent:'fa-bolt', regular:'fa-bolt' };
  return `<span class="px-2 py-0.5 ${m[t]||'bg-gray-100'} rounded-full text-xs font-medium"><i class="fas ${i[t]||''} mr-0.5"></i>Instant</span>`;
}

function payBadge(s) {
  const m = { unpaid:'bg-yellow-100 text-yellow-800', paid:'bg-green-100 text-green-800', refunded:'bg-purple-100 text-purple-800', trial:'bg-blue-100 text-blue-800' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s === 'trial' ? 'Free Trial' : s}</span>`;
}

function invBadge(s) {
  const m = { draft:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700', viewed:'bg-indigo-100 text-indigo-700', paid:'bg-green-100 text-green-700', overdue:'bg-red-100 text-red-700', cancelled:'bg-gray-100 text-gray-500' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s}</span>`;
}

function section(title, icon, content) {
  return `<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
    <div class="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
      <i class="fas ${icon} text-blue-500"></i>
      <h3 class="font-bold text-gray-800 text-sm">${title}</h3>
    </div>
    <div class="p-6">${content}</div>
  </div>`;
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function renderOverview() {
  const d = A.data;
  const at = d.all_time || {};
  const td = d.today || {};
  const tw = d.this_week || {};
  const tm = d.this_month || {};
  const custs = d.customers || [];
  const ts = d.trial_stats || {};

  return `
    <!-- Free Trial Banner -->
    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-6">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center"><i class="fas fa-gift text-white"></i></div>
        <div>
          <h3 class="font-bold text-blue-900 text-sm">Free Trial Program</h3>
          <p class="text-xs text-blue-600">Every new user gets 3 free reports. Trial orders are $0 and excluded from revenue.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-white/80 rounded-xl p-3 text-center">
          <p class="text-[10px] font-semibold text-gray-500 uppercase">Total Users</p>
          <p class="text-xl font-black text-blue-700">${ts.total_customers || custs.length}</p>
        </div>
        <div class="bg-white/80 rounded-xl p-3 text-center">
          <p class="text-[10px] font-semibold text-gray-500 uppercase">Trial Reports Used</p>
          <p class="text-xl font-black text-indigo-700">${ts.total_trial_reports_used || 0} <span class="text-xs font-normal text-gray-400">/ ${ts.total_trial_reports_available || 0}</span></p>
        </div>
        <div class="bg-white/80 rounded-xl p-3 text-center">
          <p class="text-[10px] font-semibold text-gray-500 uppercase">Used a Trial</p>
          <p class="text-xl font-black text-green-700">${ts.customers_who_used_trial || 0}</p>
        </div>
        <div class="bg-white/80 rounded-xl p-3 text-center">
          <p class="text-[10px] font-semibold text-gray-500 uppercase">Trial Exhausted</p>
          <p class="text-xl font-black text-amber-700">${ts.exhausted_trial || 0}</p>
        </div>
        <div class="bg-white/80 rounded-xl p-3 text-center">
          <p class="text-[10px] font-semibold text-gray-500 uppercase">Converted to Paid</p>
          <p class="text-xl font-black text-green-600">${ts.paying_customers || 0}</p>
        </div>
      </div>
    </div>

    <!-- Revenue Stats Row (REAL revenue only — excludes trial) -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('Today Revenue', $$(td.revenue_today), 'fa-calendar-day', 'green', (td.orders_today||0)+' orders'+(td.trial_orders_today > 0 ? ' ('+td.trial_orders_today+' trial)':''))}
      ${mc('This Week', $$(tw.revenue_week), 'fa-calendar-week', 'blue', (tw.orders_week||0)+' orders'+(tw.trial_orders_week > 0 ? ' ('+tw.trial_orders_week+' trial)':''))}
      ${mc('This Month', $$(tm.revenue_month), 'fa-calendar-alt', 'indigo', (tm.orders_month||0)+' orders'+(tm.trial_orders_month > 0 ? ' ('+tm.trial_orders_month+' trial)':''))}
      ${mc('All-Time Revenue', $$(at.total_collected), 'fa-coins', 'amber', (at.paid_orders||0)+' paid orders')}
      ${mc('Total Customers', custs.length, 'fa-users', 'purple', custs.filter(c=>c.order_count>0).length+' with orders')}
    </div>

    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <!-- Pipeline -->
      ${section('Order Pipeline', 'fa-funnel-dollar', `
        <div class="space-y-3">
          ${(d.sales_pipeline||[]).map(p => {
            const pct = at.total_orders > 0 ? Math.round(p.count / at.total_orders * 100) : 0;
            const colors = { pending:'yellow', processing:'blue', completed:'green', failed:'red', cancelled:'gray' };
            return `<div>
              <div class="flex justify-between text-sm mb-1"><span class="capitalize text-gray-600">${p.status}</span><span class="font-bold">${p.count} (${$$(p.total_value)})</span></div>
              <div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-${colors[p.status]||'gray'}-500 h-2 rounded-full" style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      `)}

      <!-- Top Customers -->
      ${section('Top Customers', 'fa-trophy', `
        ${(d.top_customers||[]).length === 0 ? '<p class="text-gray-400 text-sm">No customer data yet</p>' : `
        <div class="space-y-2">
          ${(d.top_customers||[]).slice(0,5).map((c,i) => `
            <div class="flex items-center justify-between py-2 ${i<4?'border-b border-gray-50':''}">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">${i+1}</span>
                <div><p class="text-sm font-medium text-gray-800">${c.name}</p><p class="text-xs text-gray-400">${c.company_name||c.email}</p></div>
              </div>
              <div class="text-right"><p class="text-sm font-bold text-gray-800">${$$(c.total_value)}</p><p class="text-xs text-gray-400">${c.order_count} orders</p></div>
            </div>
          `).join('')}
        </div>`}
      `)}

      <!-- Gmail Status + Quick Actions -->
      ${section('Quick Actions', 'fa-bolt', `
        ${renderGmailCard()}
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button onclick="setTab('neworder')" class="p-3 bg-blue-50 hover:bg-blue-100 rounded-xl text-sm font-medium text-blue-700 transition-colors"><i class="fas fa-plus mr-1"></i>New Order</button>
          <button onclick="setTab('invoicing')" class="p-3 bg-green-50 hover:bg-green-100 rounded-xl text-sm font-medium text-green-700 transition-colors"><i class="fas fa-file-invoice mr-1"></i>Invoices</button>
          <a href="/settings" class="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition-colors text-center"><i class="fas fa-cog mr-1"></i>Settings</a>
          <a href="/" target="_blank" class="p-3 bg-purple-50 hover:bg-purple-100 rounded-xl text-sm font-medium text-purple-700 transition-colors text-center"><i class="fas fa-globe mr-1"></i>View Site</a>
        </div>
      `)}
    </div>

    <!-- Recent Orders -->
    ${section('Recent Orders', 'fa-clock', renderOrdersTable((d.recent_orders||[]).slice(0,10)))}
  `;
}

function renderGmailCard() {
  const gs = A.gmailStatus?.gmail_oauth2;
  if (!gs) return '<p class="text-xs text-gray-400">Gmail status unavailable</p>';
  if (gs.ready) {
    return `<div class="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
      <i class="fas fa-envelope-circle-check text-green-600"></i>
      <div><p class="text-sm font-semibold text-green-800">Gmail Connected</p><p class="text-xs text-green-600">${gs.sender_email}</p></div>
    </div>`;
  }
  return `<div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
    <i class="fas fa-exclamation-triangle text-amber-600"></i>
    <div><p class="text-sm font-semibold text-amber-800">Gmail Not Connected</p>
      ${gs.client_id_configured ? `<a href="/api/auth/gmail" class="text-xs text-blue-600 hover:underline">Connect now</a>` : '<p class="text-xs text-amber-600">Set up OAuth credentials first</p>'}
    </div>
  </div>`;
}

// ============================================================
// USERS TAB
// ============================================================
function renderUsers() {
  const custs = A.data?.customers || [];
  const ts = A.data?.trial_stats || {};
  const withOrders = custs.filter(c => c.order_count > 0);
  const totalSpent = custs.reduce((s, c) => s + (c.total_spent || 0), 0);
  const googleUsers = custs.filter(c => c.google_id);

  return `
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      ${mc('Total Users', custs.length, 'fa-users', 'blue')}
      ${mc('Active (With Orders)', withOrders.length, 'fa-user-check', 'green')}
      ${mc('On Free Trial', (ts.trial_eligible||0) - (ts.exhausted_trial||0), 'fa-gift', 'indigo', (ts.total_trial_reports_used||0)+'/'+((ts.total_trial_reports_available||0))+' used')}
      ${mc('Converted to Paid', ts.paying_customers || 0, 'fa-star', 'amber')}
      ${mc('Google Sign-In', googleUsers.length, 'fa-google', 'red')}
      ${mc('Total Paid Revenue', $$(totalSpent), 'fa-dollar-sign', 'green')}
    </div>

    ${section('All Registered Users (' + custs.length + ')', 'fa-users', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 rounded-lg">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Trial</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Orders</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid Revenue</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Invoices</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Order</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Joined</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${custs.map(c => `
              <tr class="hover:bg-blue-50/50 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    ${c.google_avatar ? `<img src="${c.google_avatar}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm">` : `<div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">${(c.name||'?')[0].toUpperCase()}</div>`}
                    <div>
                      <p class="font-semibold text-gray-800 text-sm">${c.name}</p>
                      ${c.google_id ? '<span class="text-[10px] text-gray-400"><i class="fab fa-google mr-0.5"></i>Google</span>' : '<span class="text-[10px] text-gray-400"><i class="fas fa-envelope mr-0.5"></i>Email</span>'}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-600 text-xs">${c.company_name || '<span class="text-gray-300">-</span>'}</td>
                <td class="px-4 py-3 text-gray-600 text-xs">${c.email}</td>
                <td class="px-4 py-3 text-gray-600 text-xs">${c.phone || '-'}</td>
                <td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center px-2 py-0.5 ${(c.free_trial_used||0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'} rounded-full text-xs font-bold">${c.free_trial_used||0}/${c.free_trial_total||3}</span></td>
                <td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center w-7 h-7 ${c.order_count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'} rounded-full text-xs font-bold">${c.order_count||0}</span></td>
                <td class="px-4 py-3 text-right font-bold text-sm ${c.total_spent > 0 ? 'text-green-600' : 'text-gray-300'}">${$$(c.total_spent)}</td>
                <td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center w-7 h-7 bg-green-100 text-green-700 rounded-full text-xs font-bold">${c.invoice_count||0}</span></td>
                <td class="px-4 py-3 text-gray-500 text-xs">${fmtDate(c.last_order_date)}</td>
                <td class="px-4 py-3 text-gray-500 text-xs">${fmtDate(c.created_at)}</td>
                <td class="px-4 py-3">
                  <div class="flex gap-1">
                    <button onclick="createInvoiceFor(${c.id},'${c.name.replace(/'/g,"\\'")}')" class="p-1.5 text-gray-400 hover:text-green-600 transition-colors" title="Create Invoice"><i class="fas fa-file-invoice-dollar"></i></button>
                    <button onclick="emailUser('${c.email}')" class="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="Email"><i class="fas fa-envelope"></i></button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${custs.length === 0 ? '<tr><td colspan="11" class="px-4 py-12 text-center text-gray-400"><i class="fas fa-users text-3xl mb-3 block"></i>No users registered yet.<br><span class="text-xs">Share <a href="/customer/login" class="text-blue-600 underline">/customer/login</a> with your clients.</span></td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `)}
  `;
}

// ============================================================
// EARNINGS TAB
// ============================================================
function renderEarnings() {
  const d = A.data;
  const at = d.all_time || {};
  const td = d.today || {};
  const tw = d.this_week || {};
  const tm = d.this_month || {};
  const monthly = d.monthly_earnings || [];
  const payments = d.payments || [];
  const is = d.invoice_stats || {};

  const convRate = (d.conversion||{}).total > 0 ? Math.round((d.conversion.converted / d.conversion.total) * 100) : 0;

  return `
    <!-- Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      ${mc('Today', $$(td.revenue_today), 'fa-calendar-day', 'green', td.orders_today+' orders')}
      ${mc('This Week', $$(tw.revenue_week), 'fa-calendar-week', 'blue', tw.orders_week+' orders')}
      ${mc('This Month', $$(tm.revenue_month), 'fa-calendar-alt', 'indigo', tm.orders_month+' orders')}
      ${mc('All-Time Collected', $$(at.total_collected), 'fa-check-circle', 'green')}
      ${mc('Outstanding', $$(at.total_outstanding), 'fa-exclamation-circle', 'amber')}
      ${mc('Avg Order Value', $$(at.avg_order_value), 'fa-chart-line', 'purple')}
    </div>

    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <!-- Monthly Revenue Breakdown -->
      ${section('Monthly Revenue (Last 12 Months)', 'fa-chart-bar', `
        <div class="space-y-2">
          ${monthly.length === 0 ? '<p class="text-gray-400 text-sm">No revenue data yet</p>' : monthly.map(m => {
            const maxRev = Math.max(...monthly.map(x => x.revenue || 0), 1);
            const pct = Math.round((m.revenue || 0) / maxRev * 100);
            return `<div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600 font-medium">${m.month}</span>
                <span class="font-bold text-gray-800">${$$(m.revenue)} <span class="text-gray-400 font-normal text-xs">(${m.order_count} orders)</span></span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-3"><div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all" style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      `)}

      <!-- Tier Breakdown -->
      ${section('Revenue by Service Tier', 'fa-layer-group', `
        <div class="space-y-4">
          ${(d.tier_stats||[]).map(t => {
            const colors = { express:'red', standard:'green', immediate:'red', urgent:'amber', regular:'green' };
            const icons = { express:'fa-bolt', standard:'fa-clock', immediate:'fa-rocket', urgent:'fa-bolt', regular:'fa-clock' };
            return `<div class="flex items-center gap-4 p-3 bg-${colors[t.service_tier]||'gray'}-50 rounded-xl">
              <div class="w-10 h-10 bg-${colors[t.service_tier]||'gray'}-200 rounded-xl flex items-center justify-center"><i class="fas ${icons[t.service_tier]||'fa-tag'} text-${colors[t.service_tier]||'gray'}-600"></i></div>
              <div class="flex-1">
                <p class="text-sm font-bold capitalize text-gray-800">${t.service_tier}</p>
                <p class="text-xs text-gray-500">${t.count} orders</p>
              </div>
              <div class="text-right">
                <p class="font-bold text-gray-800">${$$(t.total_value)}</p>
                <p class="text-xs text-green-600">Paid: ${$$(t.paid_value)}</p>
              </div>
            </div>`;
          }).join('')}
          ${(d.tier_stats||[]).length === 0 ? '<p class="text-gray-400 text-sm">No tier data yet</p>' : ''}
        </div>
      `)}
    </div>

    <!-- Invoice Revenue -->
    ${section('Invoice Revenue Summary', 'fa-file-invoice-dollar', `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-green-50 rounded-xl text-center"><p class="text-xs text-gray-500 uppercase font-semibold">Collected</p><p class="text-2xl font-black text-green-600">${$$(is.total_collected)}</p></div>
        <div class="p-4 bg-blue-50 rounded-xl text-center"><p class="text-xs text-gray-500 uppercase font-semibold">Outstanding</p><p class="text-2xl font-black text-blue-600">${$$(is.total_outstanding)}</p></div>
        <div class="p-4 bg-red-50 rounded-xl text-center"><p class="text-xs text-gray-500 uppercase font-semibold">Overdue</p><p class="text-2xl font-black text-red-600">${$$(is.total_overdue)}</p></div>
        <div class="p-4 bg-gray-50 rounded-xl text-center"><p class="text-xs text-gray-500 uppercase font-semibold">Draft</p><p class="text-2xl font-black text-gray-600">${$$(is.total_draft)}</p></div>
      </div>
    `)}

    <!-- Payment History -->
    ${section('Recent Payments (' + payments.length + ')', 'fa-credit-card', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50"><tr>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Order</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Property</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Amount</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Method</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${payments.slice(0,20).map(p => `<tr class="hover:bg-gray-50">
              <td class="px-4 py-2 text-xs text-gray-500">${fmtDate(p.created_at)}</td>
              <td class="px-4 py-2 text-xs font-mono text-blue-600">${p.order_number||'-'}</td>
              <td class="px-4 py-2 text-xs text-gray-600">${p.property_address||'-'}</td>
              <td class="px-4 py-2 text-right font-bold">${$$(p.amount)}</td>
              <td class="px-4 py-2 text-xs text-gray-500 capitalize">${p.payment_method||'square'}</td>
              <td class="px-4 py-2">${statusBadge(p.status)}</td>
            </tr>`).join('')}
            ${payments.length === 0 ? '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">No payments recorded</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `)}
  `;
}

// ============================================================
// SALES TAB
// ============================================================
function renderSales() {
  const d = A.data;
  const at = d.all_time || {};
  const conv = d.conversion || {};
  const convRate = conv.total > 0 ? Math.round(conv.converted / conv.total * 100) : 0;
  const rs = d.report_stats || {};

  return `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('Total Orders', at.total_orders || 0, 'fa-clipboard-list', 'blue')}
      ${mc('Completed', at.completed_orders || 0, 'fa-check-circle', 'green')}
      ${mc('Pending', at.pending_orders || 0, 'fa-hourglass-half', 'amber')}
      ${mc('Conversion Rate', convRate + '%', 'fa-percentage', 'indigo')}
      ${mc('Reports Generated', rs.total_reports || 0, 'fa-file-alt', 'purple')}
    </div>

    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <!-- Sales Pipeline -->
      ${section('Sales Pipeline', 'fa-funnel-dollar', `
        <div class="space-y-3">
          ${(d.sales_pipeline||[]).map(p => {
            const total = at.total_orders || 1;
            const pct = Math.round(p.count / total * 100);
            const colors = { pending:'yellow', processing:'blue', completed:'green', failed:'red', cancelled:'gray' };
            const icons = { pending:'fa-clock', processing:'fa-spinner', completed:'fa-check', failed:'fa-times', cancelled:'fa-ban' };
            return `<div class="flex items-center gap-3 p-3 rounded-xl bg-${colors[p.status]||'gray'}-50">
              <div class="w-8 h-8 bg-${colors[p.status]||'gray'}-200 rounded-lg flex items-center justify-center"><i class="fas ${icons[p.status]||'fa-circle'} text-${colors[p.status]||'gray'}-600 text-xs"></i></div>
              <div class="flex-1">
                <div class="flex justify-between mb-1"><span class="text-sm font-medium capitalize">${p.status}</span><span class="text-sm font-bold">${p.count} orders</span></div>
                <div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-${colors[p.status]||'gray'}-500 h-1.5 rounded-full" style="width:${pct}%"></div></div>
              </div>
              <span class="text-sm font-bold text-gray-600">${$$(p.total_value)}</span>
            </div>`;
          }).join('')}
        </div>
      `)}

      <!-- Report Stats -->
      ${section('Report Statistics', 'fa-chart-pie', `
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-blue-50 rounded-xl text-center"><p class="text-xs text-gray-500">Total Reports</p><p class="text-xl font-black text-blue-600">${rs.total_reports||0}</p></div>
          <div class="p-3 bg-green-50 rounded-xl text-center"><p class="text-xs text-gray-500">Completed</p><p class="text-xl font-black text-green-600">${rs.completed_reports||0}</p></div>
          <div class="p-3 bg-indigo-50 rounded-xl text-center"><p class="text-xs text-gray-500">Avg Squares</p><p class="text-xl font-black text-indigo-600">${$(rs.avg_squares,1)}</p></div>
          <div class="p-3 bg-amber-50 rounded-xl text-center"><p class="text-xs text-gray-500">Avg Material $</p><p class="text-xl font-black text-amber-600">${$$(rs.avg_material_cost)}</p></div>
          <div class="p-3 bg-purple-50 rounded-xl text-center"><p class="text-xs text-gray-500">Total Material Value</p><p class="text-xl font-black text-purple-600">${$$(rs.total_material_value)}</p></div>
          <div class="p-3 bg-cyan-50 rounded-xl text-center"><p class="text-xs text-gray-500">Avg Confidence</p><p class="text-xl font-black text-cyan-600">${$(rs.avg_confidence,0)}%</p></div>
        </div>
      `)}
    </div>

    <!-- All Orders Table -->
    ${section('All Orders (' + A.orders.length + ')', 'fa-clipboard-list', renderOrdersTable(A.orders))}
  `;
}

function renderOrdersTable(orders) {
  return `<div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-gray-50"><tr>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Order #</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Property</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tier</th>
        <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Price</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Payment</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
        <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Actions</th>
      </tr></thead>
      <tbody class="divide-y divide-gray-50">
        ${orders.map(o => `<tr class="hover:bg-blue-50/40 transition-colors">
          <td class="px-3 py-2 font-mono text-xs font-bold text-blue-600"><a href="/order/${o.id}" class="hover:underline">${o.order_number}</a></td>
          <td class="px-3 py-2 text-gray-600 text-xs max-w-[180px] truncate">${o.property_address}</td>
          <td class="px-3 py-2 text-gray-600 text-xs">${o.customer_name || o.homeowner_name || '-'}</td>
          <td class="px-3 py-2">${tierBadge(o.service_tier)}</td>
          <td class="px-3 py-2 text-right font-bold text-sm ${o.is_trial ? 'text-blue-500' : ''}">${o.is_trial ? '<span class="text-blue-500">$0 <span class="text-[10px] font-normal">(trial)</span></span>' : '$'+o.price}</td>
          <td class="px-3 py-2">${statusBadge(o.status)}</td>
          <td class="px-3 py-2">${payBadge(o.payment_status)}</td>
          <td class="px-3 py-2 text-gray-500 text-xs">${fmtDate(o.created_at)}</td>
          <td class="px-3 py-2">
            <div class="flex gap-0.5">
              ${o.status === 'completed' ? `<a href="/api/reports/${o.id}/html" target="_blank" class="p-1 text-gray-400 hover:text-blue-600" title="View Report"><i class="fas fa-file-alt"></i></a><button onclick="emailReport(${o.id})" class="p-1 text-gray-400 hover:text-green-600" title="Email"><i class="fas fa-envelope"></i></button><button onclick="openSegmentToggle(${o.id})" class="p-1 text-gray-400 hover:text-orange-600" title="Toggle Segments"><i class="fas fa-layer-group"></i></button>` : `<button onclick="generateReport(${o.id})" class="p-1 text-gray-400 hover:text-indigo-600" title="Generate"><i class="fas fa-cog"></i></button>`}
            </div>
          </td>
        </tr>`).join('')}
        ${orders.length === 0 ? '<tr><td colspan="9" class="px-3 py-8 text-center text-gray-400">No orders</td></tr>' : ''}
      </tbody>
    </table>
  </div>`;
}

// ============================================================
// INVOICING TAB
// ============================================================
function renderInvoicing() {
  const d = A.data;
  const is = d.invoice_stats || {};
  const invoices = d.invoices || [];
  const custs = d.customers || [];

  return `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('Total Invoices', is.total_invoices || 0, 'fa-file-invoice-dollar', 'blue')}
      ${mc('Collected', $$(is.total_collected), 'fa-check-circle', 'green')}
      ${mc('Outstanding', $$(is.total_outstanding), 'fa-clock', 'amber')}
      ${mc('Overdue', $$(is.total_overdue), 'fa-exclamation-circle', 'red')}
      ${mc('Draft', $$(is.total_draft), 'fa-edit', 'gray')}
    </div>

    <!-- Create Invoice Form -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
      <div class="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
        <div class="flex items-center gap-2"><i class="fas fa-plus-circle text-green-500"></i><h3 class="font-bold text-gray-800 text-sm">Create Invoice</h3></div>
        <button onclick="toggleInvForm()" id="invToggle" class="text-sm text-blue-600 hover:text-blue-700"><i class="fas fa-chevron-down mr-1"></i>Show Form</button>
      </div>
      <div id="invFormWrap" class="hidden p-6">
        <div class="grid md:grid-cols-2 gap-4 mb-4">
          <div><label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Customer *</label>
            <select id="invCust" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Select customer...</option>
              ${custs.map(c => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('')}
            </select>
          </div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Related Order</label>
            <select id="invOrder" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <option value="">None</option>
              ${A.orders.map(o => `<option value="${o.id}">${o.order_number} - ${o.property_address}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs font-semibold text-gray-500 mb-2 uppercase">Line Items</label>
          <div id="invLines">
            <div class="flex gap-2 mb-2 inv-line"><input type="text" placeholder="Description" class="flex-1 px-3 py-2 border rounded-lg text-sm inv-desc"><input type="number" placeholder="Qty" value="1" class="w-16 px-2 py-2 border rounded-lg text-sm inv-qty"><input type="number" placeholder="$" step="0.01" class="w-24 px-2 py-2 border rounded-lg text-sm inv-price"><button onclick="addInvLine()" class="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"><i class="fas fa-plus"></i></button></div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">GST %</label><input type="number" id="invTax" value="5" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Discount $</label><input type="number" id="invDisc" value="0" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">Due (days)</label><input type="number" id="invDue" value="30" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        </div>
        <div id="invErr" class="hidden mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
        <button onclick="createInvoice()" class="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"><i class="fas fa-save mr-1"></i>Create Invoice</button>
      </div>
    </div>

    <!-- Invoices Table -->
    ${section('All Invoices (' + invoices.length + ')', 'fa-file-invoice-dollar', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50"><tr>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Invoice #</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Order</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Issued</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Due</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Actions</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${invoices.map(inv => `<tr class="hover:bg-blue-50/40">
              <td class="px-4 py-2 font-mono text-xs font-bold text-blue-600">${inv.invoice_number}</td>
              <td class="px-4 py-2 text-sm text-gray-700">${inv.customer_name||'-'} ${inv.customer_company ? '<span class="text-xs text-gray-400">('+inv.customer_company+')</span>' : ''}</td>
              <td class="px-4 py-2 text-xs font-mono text-gray-500">${inv.order_number||'-'}</td>
              <td class="px-4 py-2 text-xs text-gray-500">${fmtDate(inv.issue_date)}</td>
              <td class="px-4 py-2 text-xs text-gray-500">${fmtDate(inv.due_date)}</td>
              <td class="px-4 py-2 text-right font-bold">${$$(inv.total)}</td>
              <td class="px-4 py-2">${invBadge(inv.status)}</td>
              <td class="px-4 py-2">
                <div class="flex gap-1">
                  ${inv.status==='draft' ? `<button onclick="sendInvoice(${inv.id})" class="p-1 text-gray-400 hover:text-blue-600" title="Send"><i class="fas fa-paper-plane"></i></button>` : ''}
                  ${['sent','viewed','overdue'].includes(inv.status) ? `<button onclick="markPaid(${inv.id})" class="p-1 text-gray-400 hover:text-green-600" title="Mark Paid"><i class="fas fa-check-circle"></i></button>` : ''}
                  ${inv.status==='draft' ? `<button onclick="delInvoice(${inv.id})" class="p-1 text-gray-400 hover:text-red-600" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
            ${invoices.length === 0 ? '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">No invoices created yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `)}
  `;
}

// ============================================================
// MARKETING TAB
// ============================================================
function renderMarketing() {
  const d = A.data;
  const custs = d.customers || [];
  const growth = d.customer_growth || [];
  const apiUsage = d.api_usage || [];
  const at = d.all_time || {};
  const conv = d.conversion || {};
  const convRate = conv.total > 0 ? Math.round(conv.converted / conv.total * 100) : 0;

  // Calculate metrics
  const newThisMonth = custs.filter(c => {
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const repeatCustomers = custs.filter(c => (c.order_count||0) > 1).length;
  const avgOrdersPerCustomer = custs.length > 0 ? (custs.reduce((s,c) => s + (c.order_count||0), 0) / custs.length).toFixed(1) : '0';
  const ltv = custs.length > 0 ? (custs.reduce((s,c) => s + (c.total_spent||0), 0) / custs.length) : 0;

  return `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('New This Month', newThisMonth, 'fa-user-plus', 'green')}
      ${mc('Total Users', custs.length, 'fa-users', 'blue')}
      ${mc('Repeat Customers', repeatCustomers, 'fa-redo', 'purple')}
      ${mc('Avg Orders/User', avgOrdersPerCustomer, 'fa-chart-line', 'indigo')}
      ${mc('Avg LTV', $$(ltv), 'fa-gem', 'amber')}
    </div>

    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <!-- Customer Growth -->
      ${section('Customer Growth (Last 12 Months)', 'fa-chart-area', `
        <div class="space-y-2">
          ${growth.length === 0 ? '<p class="text-gray-400 text-sm">No growth data yet</p>' : growth.map(g => {
            const maxSignups = Math.max(...growth.map(x => x.signups), 1);
            const pct = Math.round(g.signups / maxSignups * 100);
            return `<div>
              <div class="flex justify-between text-sm mb-1"><span class="text-gray-600">${g.month}</span><span class="font-bold">${g.signups} signups</span></div>
              <div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full" style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      `)}

      <!-- Conversion & Engagement -->
      ${section('Conversion & Engagement', 'fa-funnel-dollar', `
        <div class="space-y-4">
          <div class="p-4 bg-indigo-50 rounded-xl">
            <div class="flex justify-between items-center mb-2"><span class="text-sm font-medium text-indigo-800">Order Conversion Rate</span><span class="text-2xl font-black text-indigo-600">${convRate}%</span></div>
            <div class="w-full bg-indigo-200 rounded-full h-3"><div class="bg-indigo-600 h-3 rounded-full" style="width:${convRate}%"></div></div>
            <p class="text-xs text-indigo-400 mt-1">${conv.converted||0} completed / ${conv.total||0} total orders</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-blue-50 rounded-xl text-center"><p class="text-xs text-gray-500">Google Users</p><p class="text-xl font-black text-blue-600">${custs.filter(c=>c.google_id).length}</p></div>
            <div class="p-3 bg-gray-50 rounded-xl text-center"><p class="text-xs text-gray-500">Email Users</p><p class="text-xl font-black text-gray-600">${custs.filter(c=>!c.google_id).length}</p></div>
          </div>
        </div>
      `)}
    </div>

    <!-- API Usage -->
    ${section('API Usage (Last 30 Days)', 'fa-server', `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50"><tr>
            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">API Endpoint</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Calls</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Avg Time</th>
            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500">Success</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${apiUsage.map(u => `<tr class="hover:bg-gray-50">
              <td class="px-4 py-2 text-sm font-medium text-gray-700">${u.request_type}</td>
              <td class="px-4 py-2 text-right font-bold">${u.count}</td>
              <td class="px-4 py-2 text-right text-gray-500">${Math.round(u.avg_duration||0)}ms</td>
              <td class="px-4 py-2 text-right"><span class="text-green-600 font-medium">${u.success_count}/${u.count}</span></td>
            </tr>`).join('')}
            ${apiUsage.length === 0 ? '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No API usage data</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `)}

    <!-- Marketing Links -->
    ${section('Share Your Platform', 'fa-share-alt', `
      <div class="grid md:grid-cols-2 gap-4">
        <div class="p-4 border border-gray-200 rounded-xl">
          <p class="text-sm font-bold text-gray-800 mb-2"><i class="fas fa-link mr-1 text-blue-500"></i>Customer Portal</p>
          <code class="block bg-gray-50 px-3 py-2 rounded-lg text-xs text-blue-600 select-all">${window.location.origin}/customer/login</code>
          <p class="text-xs text-gray-400 mt-2">Share this with contractors to sign up and order reports</p>
        </div>
        <div class="p-4 border border-gray-200 rounded-xl">
          <p class="text-sm font-bold text-gray-800 mb-2"><i class="fas fa-tag mr-1 text-green-500"></i>Pricing Page</p>
          <code class="block bg-gray-50 px-3 py-2 rounded-lg text-xs text-green-600 select-all">${window.location.origin}/pricing</code>
          <p class="text-xs text-gray-400 mt-2">Public pricing page for prospects</p>
        </div>
        <div class="p-4 border border-gray-200 rounded-xl">
          <p class="text-sm font-bold text-gray-800 mb-2"><i class="fas fa-home mr-1 text-indigo-500"></i>Landing Page</p>
          <code class="block bg-gray-50 px-3 py-2 rounded-lg text-xs text-indigo-600 select-all">${window.location.origin}/</code>
          <p class="text-xs text-gray-400 mt-2">Main marketing homepage</p>
        </div>
        <div class="p-4 border border-gray-200 rounded-xl">
          <p class="text-sm font-bold text-gray-800 mb-2"><i class="fas fa-clipboard-list mr-1 text-amber-500"></i>Direct Order</p>
          <code class="block bg-gray-50 px-3 py-2 rounded-lg text-xs text-amber-600 select-all">${window.location.origin}/customer/order</code>
          <p class="text-xs text-gray-400 mt-2">Direct link for customers to place an order</p>
        </div>
      </div>
    `)}
  `;
}

// ============================================================
// ACTIVITY TAB
// ============================================================
function renderActivity() {
  const activities = A.data?.recent_activity || [];
  return section('Activity Log (Last 30)', 'fa-history', `
    <div class="space-y-2">
      ${activities.map(a => {
        const icons = { order_created:'fa-plus-circle text-green-500', payment_received:'fa-dollar-sign text-green-600', report_generated:'fa-file-alt text-blue-500', setting_updated:'fa-cog text-gray-500', company_added:'fa-building text-indigo-500', email_sent:'fa-envelope text-blue-500' };
        return `<div class="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
          <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas ${icons[a.action]||'fa-circle text-gray-400'} text-xs"></i></div>
          <div class="flex-1"><p class="text-sm font-medium text-gray-700">${(a.action||'').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</p><p class="text-xs text-gray-500">${a.details||''}</p></div>
          <span class="text-xs text-gray-400 whitespace-nowrap">${fmtDateTime(a.created_at)}</span>
        </div>`;
      }).join('')}
      ${activities.length === 0 ? '<p class="text-center text-gray-400 py-8">No activity recorded</p>' : ''}
    </div>
  `);
}

// ============================================================
// NEW ORDER TAB
// ============================================================
function renderNewOrder() {
  return `<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-8 max-w-2xl mx-auto">
    <h3 class="text-xl font-bold text-gray-800 mb-6"><i class="fas fa-plus-circle mr-2 text-blue-500"></i>Create Order & Generate Report</h3>
    <div class="space-y-4">
      <div><label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Property Address *</label><input type="text" id="noAddr" placeholder="123 Main Street" class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">City</label><input type="text" id="noCity" placeholder="Edmonton" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Province</label><input type="text" id="noProv" value="AB" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Postal Code</label><input type="text" id="noPost" placeholder="T5A 1A1" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Latitude</label><input type="number" step="any" id="noLat" placeholder="53.5461" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Longitude</label><input type="number" step="any" id="noLng" placeholder="-113.4938" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Homeowner *</label><input type="text" id="noHome" placeholder="John Smith" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Homeowner Email</label><input type="email" id="noEmail" placeholder="john@example.com" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Your Name *</label><input type="text" id="noReq" value="Ethan Gourley" class="w-full px-3 py-2.5 border rounded-xl text-sm"></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">Service Tier</label>
          <select id="noTier" class="w-full px-3 py-2.5 border rounded-xl text-sm">
            <option value="standard" selected>Roof Report ($8) - Instant</option>
          </select>
        </div>
      </div>
      <div id="noErr" class="hidden p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
      <div id="noOk" class="hidden p-3 bg-green-50 text-green-700 rounded-lg text-sm"></div>
      <button onclick="submitOrder()" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all hover:scale-[1.01] shadow-lg"><i class="fas fa-paper-plane mr-2"></i>Create Order & Generate Report</button>
    </div>
  </div>`;
}

// ============================================================
// ACTION FUNCTIONS
// ============================================================
async function submitOrder() {
  const addr = document.getElementById('noAddr').value.trim();
  const home = document.getElementById('noHome').value.trim();
  const req = document.getElementById('noReq').value.trim();
  const err = document.getElementById('noErr');
  const ok = document.getElementById('noOk');
  err.classList.add('hidden'); ok.classList.add('hidden');

  if (!addr || !home || !req) { err.textContent = 'Address, homeowner, and your name are required.'; err.classList.remove('hidden'); return; }

  try {
    const res = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      property_address: addr, property_city: document.getElementById('noCity').value.trim(),
      property_province: document.getElementById('noProv').value.trim(),
      property_postal_code: document.getElementById('noPost').value.trim(),
      latitude: parseFloat(document.getElementById('noLat').value) || null,
      longitude: parseFloat(document.getElementById('noLng').value) || null,
      homeowner_name: home, homeowner_email: document.getElementById('noEmail').value.trim(),
      requester_name: req, requester_company: 'RoofReporterAI',
      service_tier: document.getElementById('noTier').value
    })});
    const d = await res.json();
    if (!res.ok) { err.textContent = d.error || 'Failed'; err.classList.remove('hidden'); return; }
    ok.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Order ' + d.order?.order_number + ' created. Generating report...';
    ok.classList.remove('hidden');
    const rr = await fetch('/api/reports/' + d.order?.id + '/generate', { method:'POST' });
    if (rr.ok) {
      ok.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Report generated! <a href="/api/reports/' + d.order?.id + '/html" target="_blank" class="underline font-bold">View Report</a>';
    } else { ok.innerHTML += ' (report generation had an issue)'; }
    await loadAll();
  } catch(e) { err.textContent = 'Error: ' + e.message; err.classList.remove('hidden'); }
}

async function generateReport(id) {
  try {
    const r = await fetch('/api/reports/' + id + '/generate', { method:'POST' });
    if (r.ok) { alert('Report generated!'); await loadAll(); render(); }
    else { const d = await r.json(); alert('Failed: ' + (d.error||'')); }
  } catch(e) { alert('Error: ' + e.message); }
}

async function emailReport(id) {
  const to = prompt('Send report to email:');
  if (!to) return;
  try {
    const r = await fetch('/api/reports/' + id + '/email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({to_email:to}) });
    const d = await r.json();
    if (r.ok && d.success) alert('Sent to ' + to + ' via ' + d.email_method);
    else alert('Failed: ' + (d.error||''));
  } catch(e) { alert('Error: ' + e.message); }
}

// ============================================================
// SEGMENT TOGGLE — Property Overlap Kill Switch
// ============================================================
// Opens a modal showing all roof segments with toggle checkboxes.
// When Google Solar returns merged buildings (bounding box > 60ft),
// users can uncheck neighbor's segments and recalculate.

async function openSegmentToggle(orderId) {
  try {
    const r = await fetch('/api/reports/' + orderId + '/segments');
    if (!r.ok) { const d = await r.json(); alert('Error: ' + (d.error||'')); return; }
    const data = await r.json();

    // Build modal HTML
    const overlapBanner = data.property_overlap_flag
      ? `<div class="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r">
           <div class="flex items-center gap-2 text-amber-800 font-bold text-sm"><i class="fas fa-exclamation-triangle"></i> Potential Property Overlap Detected</div>
           <p class="text-amber-700 text-xs mt-1">${(data.property_overlap_details||[]).join('. ')}. The Google Solar model may include a neighbor's roof. Toggle off any segments that don't belong to this property.</p>
         </div>`
      : '';

    const segRows = data.segments.map(s => {
      const checked = !s.excluded ? 'checked' : '';
      const excludedClass = s.excluded ? 'opacity-50 bg-red-50' : '';
      const dir = s.azimuth_direction || '';
      return `<tr class="hover:bg-gray-50 transition-colors ${excludedClass}" id="seg-row-${s.index}">
        <td class="px-3 py-2 text-center">
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" ${checked} onchange="toggleSegmentRow(${s.index}, this.checked)" class="sr-only peer seg-toggle" data-seg-idx="${s.index}">
            <div class="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </td>
        <td class="px-3 py-2 text-xs font-mono">${s.index}</td>
        <td class="px-3 py-2 text-sm font-medium text-gray-800">${s.name}</td>
        <td class="px-3 py-2 text-sm text-right">${s.footprint_area_sqft.toLocaleString()} ft&sup2;</td>
        <td class="px-3 py-2 text-sm text-right">${s.true_area_sqft.toLocaleString()} ft&sup2;</td>
        <td class="px-3 py-2 text-sm text-center">${s.pitch_degrees}&deg; (${s.pitch_ratio})</td>
        <td class="px-3 py-2 text-sm text-center">${Math.round(s.azimuth_degrees)}&deg; ${dir}</td>
      </tr>`;
    }).join('');

    const modalHtml = `
    <div id="segToggleModal" class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onclick="if(event.target===this)closeSegToggle()">
      <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onclick="event.stopPropagation()">
        <div class="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-800 text-white flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold"><i class="fas fa-layer-group mr-2"></i>Roof Segment Toggle</h2>
            <p class="text-blue-200 text-xs mt-0.5">Order #${orderId} &mdash; ${data.total_segments} segments (${data.active_count} active, ${data.excluded_count} excluded)</p>
          </div>
          <button onclick="closeSegToggle()" class="text-white/80 hover:text-white text-xl"><i class="fas fa-times"></i></button>
        </div>
        <div class="overflow-auto flex-1 px-6 py-4">
          ${overlapBanner}
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm text-gray-600"><i class="fas fa-info-circle mr-1 text-blue-500"></i>Toggle off segments from neighboring roofs. Area and materials will be recalculated.</span>
            <div id="seg-summary" class="text-xs text-gray-500">
              Footprint: <strong>${data.active_totals.footprint_sqft.toLocaleString()} ft&sup2;</strong> |
              True Area: <strong>${data.active_totals.true_area_sqft.toLocaleString()} ft&sup2;</strong> |
              Squares: <strong>${data.active_totals.gross_squares}</strong>
            </div>
          </div>
          <table class="w-full text-left">
            <thead><tr class="bg-gray-100 border-b">
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 text-center w-16">Active</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 w-10">#</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500">Name</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Footprint</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 text-right">True Area</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Pitch</th>
              <th class="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Azimuth</th>
            </tr></thead>
            <tbody>${segRows}</tbody>
          </table>
        </div>
        <div class="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button onclick="closeSegToggle()" class="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">Cancel</button>
          <button onclick="applySegmentToggle(${orderId})" id="seg-apply-btn"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-all shadow">
            <i class="fas fa-check mr-1"></i>Apply & Recalculate
          </button>
        </div>
      </div>
    </div>`;

    // Remove any existing modal
    const existing = document.getElementById('segToggleModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    window._segToggleOrderId = orderId;
  } catch(e) {
    alert('Error loading segments: ' + e.message);
  }
}

function toggleSegmentRow(idx, checked) {
  const row = document.getElementById('seg-row-' + idx);
  if (row) {
    row.classList.toggle('opacity-50', !checked);
    row.classList.toggle('bg-red-50', !checked);
  }
}

function closeSegToggle() {
  const m = document.getElementById('segToggleModal');
  if (m) m.remove();
}

async function applySegmentToggle(orderId) {
  const btn = document.getElementById('seg-apply-btn');
  const checkboxes = document.querySelectorAll('.seg-toggle');
  const excluded = [];
  checkboxes.forEach(cb => {
    if (!cb.checked) excluded.push(parseInt(cb.dataset.segIdx));
  });

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Recalculating...'; }

  try {
    const r = await fetch('/api/reports/' + orderId + '/toggle-segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excluded_segments: excluded })
    });
    const d = await r.json();
    if (r.ok && d.success) {
      closeSegToggle();
      alert('Report recalculated! ' + d.active_segments + ' of ' + d.total_segments + ' segments active.\nNew footprint: ' + d.updated_metrics.total_footprint_sqft.toLocaleString() + ' sqft\nNew squares: ' + d.updated_metrics.gross_squares);
      await loadAll(); render();
    } else {
      alert('Failed: ' + (d.error||'Unknown error'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>Apply & Recalculate'; }
  }
}

function emailUser(email) {
  window.open('mailto:' + email, '_blank');
}

function toggleInvForm() {
  const w = document.getElementById('invFormWrap');
  const b = document.getElementById('invToggle');
  w.classList.toggle('hidden');
  b.innerHTML = w.classList.contains('hidden') ? '<i class="fas fa-chevron-down mr-1"></i>Show Form' : '<i class="fas fa-chevron-up mr-1"></i>Hide Form';
}

function addInvLine() {
  const c = document.getElementById('invLines');
  const d = document.createElement('div');
  d.className = 'flex gap-2 mb-2 inv-line';
  d.innerHTML = '<input type="text" placeholder="Description" class="flex-1 px-3 py-2 border rounded-lg text-sm inv-desc"><input type="number" placeholder="Qty" value="1" class="w-16 px-2 py-2 border rounded-lg text-sm inv-qty"><input type="number" placeholder="$" step="0.01" class="w-24 px-2 py-2 border rounded-lg text-sm inv-price"><button onclick="this.parentElement.remove()" class="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"><i class="fas fa-minus"></i></button>';
  c.appendChild(d);
}

function createInvoiceFor(id, name) {
  setTab('invoicing');
  setTimeout(() => {
    document.getElementById('invFormWrap')?.classList.remove('hidden');
    const sel = document.getElementById('invCust');
    if (sel) sel.value = id;
  }, 100);
}

async function createInvoice() {
  const cid = document.getElementById('invCust').value;
  const oid = document.getElementById('invOrder').value;
  const err = document.getElementById('invErr');
  err.classList.add('hidden');
  if (!cid) { err.textContent = 'Select a customer.'; err.classList.remove('hidden'); return; }
  const rows = document.querySelectorAll('.inv-line');
  const items = [];
  rows.forEach(r => {
    const d = r.querySelector('.inv-desc').value.trim();
    const q = parseFloat(r.querySelector('.inv-qty').value) || 1;
    const p = parseFloat(r.querySelector('.inv-price').value) || 0;
    if (d && p > 0) items.push({ description:d, quantity:q, unit_price:p });
  });
  if (!items.length) { err.textContent = 'Add at least one line item.'; err.classList.remove('hidden'); return; }
  try {
    const r = await fetch('/api/invoices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      customer_id: parseInt(cid), order_id: oid ? parseInt(oid) : null, items,
      tax_rate: parseFloat(document.getElementById('invTax').value)||5,
      discount_amount: parseFloat(document.getElementById('invDisc').value)||0,
      due_days: parseInt(document.getElementById('invDue').value)||30
    })});
    const d = await r.json();
    if (r.ok && d.success) { await loadAll(); render(); setTab('invoicing'); }
    else { err.textContent = d.error || 'Failed'; err.classList.remove('hidden'); }
  } catch(e) { err.textContent = 'Error: ' + e.message; err.classList.remove('hidden'); }
}

async function sendInvoice(id) {
  if (!confirm('Send invoice to customer?')) return;
  try {
    const r = await fetch('/api/invoices/' + id + '/send', { method:'POST' });
    const d = await r.json();
    if (r.ok) { alert('Invoice sent to ' + (d.customer_email||'customer')); await loadAll(); render(); }
    else alert('Failed: ' + (d.error||''));
  } catch(e) { alert('Error: ' + e.message); }
}

async function markPaid(id) {
  if (!confirm('Mark invoice as paid?')) return;
  try {
    const r = await fetch('/api/invoices/' + id + '/status', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status:'paid'}) });
    if (r.ok) { await loadAll(); render(); } else alert('Failed');
  } catch(e) { alert('Error: ' + e.message); }
}

async function delInvoice(id) {
  if (!confirm('Delete this draft invoice?')) return;
  try {
    const r = await fetch('/api/invoices/' + id, { method:'DELETE' });
    if (r.ok) { await loadAll(); render(); } else alert('Failed');
  } catch(e) { alert('Error: ' + e.message); }
}

// ============================================================
// BLOG MANAGEMENT
// ============================================================
let blogPosts = [];
let blogView = 'list'; // 'list' | 'editor'
let editingPost = null;

async function loadBlogPosts() {
  try {
    const r = await adminFetch('/api/blog/admin/posts');
    if (!r) return;
    const d = await r.json();
    blogPosts = d.posts || [];
  } catch(e) {
    // Table may not exist yet — try init
    try {
      await adminFetch('/api/blog/admin/init', { method: 'POST' });
      const r2 = await adminFetch('/api/blog/admin/posts');
      if (r2) { const d2 = await r2.json(); blogPosts = d2.posts || []; }
    } catch(e2) { blogPosts = []; }
  }
}

function renderBlog() {
  if (blogPosts.length === 0 && blogView === 'list') {
    loadBlogPosts().then(() => render());
  }
  if (blogView === 'editor') return renderBlogEditor();
  return renderBlogList();
}

function renderBlogList() {
  const published = blogPosts.filter(p => p.status === 'published');
  const drafts = blogPosts.filter(p => p.status === 'draft');

  return section('Blog Management', 'fa-blog', `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-500">${published.length} published · ${drafts.length} drafts</span>
        <a href="/blog" target="_blank" class="text-sky-500 hover:text-sky-600 text-sm font-medium"><i class="fas fa-external-link-alt mr-1"></i>View Blog</a>
      </div>
      <button onclick="openBlogEditor(null)" class="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-all">
        <i class="fas fa-plus mr-1"></i>New Post
      </button>
    </div>
    ${blogPosts.length === 0 ? '<div class="text-center py-12 text-gray-400"><i class="fas fa-blog text-4xl mb-3"></i><p>No blog posts yet. Create your first post to boost SEO.</p></div>' : ''}
    <div class="space-y-3">
      ${blogPosts.map(p => `
        <div class="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
          ${p.cover_image_url
            ? '<img src="' + p.cover_image_url + '" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" onerror="this.style.display=\'none\'">'
            : '<div class="w-16 h-16 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0"><i class="fas fa-newspaper text-sky-300 text-xl"></i></div>'
          }
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h4 class="font-semibold text-gray-900 truncate">${p.title}</h4>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.status === 'published' ? 'bg-green-100 text-green-700' : p.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}">${p.status}</span>
              ${p.is_featured ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700"><i class="fas fa-star mr-0.5"></i>Featured</span>' : ''}
            </div>
            <div class="text-xs text-gray-400 flex items-center gap-3">
              <span><i class="fas fa-tag mr-1"></i>${p.category || 'roofing'}</span>
              <span><i class="far fa-eye mr-1"></i>${p.view_count || 0} views</span>
              <span><i class="far fa-clock mr-1"></i>${p.read_time_minutes || 5} min</span>
              <span>${p.published_at ? new Date(p.published_at).toLocaleDateString() : 'Not published'}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openBlogEditor(${p.id})" class="text-sky-500 hover:text-sky-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-sky-50"><i class="fas fa-edit mr-1"></i>Edit</button>
            ${p.status === 'published' ? '<a href="/blog/' + p.slug + '" target="_blank" class="text-gray-400 hover:text-gray-600 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50"><i class="fas fa-external-link-alt"></i></a>' : ''}
            <button onclick="deleteBlogPost(${p.id})" class="text-red-400 hover:text-red-600 text-sm px-2 py-1.5 rounded-lg hover:bg-red-50"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

function openBlogEditor(postId) {
  if (postId) {
    editingPost = blogPosts.find(p => p.id === postId) || null;
  } else {
    editingPost = null;
  }
  blogView = 'editor';
  render();
}

function renderBlogEditor() {
  const p = editingPost || {};
  const isEdit = !!editingPost;

  return section(isEdit ? 'Edit Post' : 'Create New Post', 'fa-edit', `
    <div class="mb-4">
      <button onclick="blogView='list';render()" class="text-sky-500 hover:text-sky-600 text-sm font-medium"><i class="fas fa-arrow-left mr-1"></i>Back to Posts</button>
    </div>
    <div class="space-y-4 max-w-4xl">
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
          <input type="text" id="bp-title" value="${(p.title||'').replace(/"/g,'&quot;')}" placeholder="Your article title..." class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">URL Slug</label>
          <input type="text" id="bp-slug" value="${(p.slug||'').replace(/"/g,'&quot;')}" placeholder="auto-generated-from-title" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Excerpt (short description for listing cards)</label>
        <textarea id="bp-excerpt" rows="2" placeholder="Brief summary shown on the blog listing page..." class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">${p.excerpt||''}</textarea>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Content * (HTML supported)</label>
        <textarea id="bp-content" rows="18" placeholder="Write your article content here... HTML tags are supported for rich formatting." class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-sky-400 focus:border-sky-400">${(p.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
        <p class="text-xs text-gray-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Use HTML for formatting: &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;blockquote&gt;, &lt;img&gt;, etc.</p>
      </div>
      <div class="grid md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Category</label>
          <select id="bp-category" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
            <option value="roofing" ${p.category==='roofing'?'selected':''}>Roofing</option>
            <option value="technology" ${p.category==='technology'?'selected':''}>Technology</option>
            <option value="business" ${p.category==='business'?'selected':''}>Business</option>
            <option value="guides" ${p.category==='guides'?'selected':''}>Guides</option>
            <option value="industry" ${p.category==='industry'?'selected':''}>Industry News</option>
            <option value="tips" ${p.category==='tips'?'selected':''}>Tips & Tricks</option>
            <option value="case-studies" ${p.category==='case-studies'?'selected':''}>Case Studies</option>
            <option value="product" ${p.category==='product'?'selected':''}>Product Updates</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Cover Image URL</label>
          <input type="text" id="bp-cover" value="${(p.cover_image_url||'').replace(/"/g,'&quot;')}" placeholder="https://..." class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Tags (comma-separated)</label>
          <input type="text" id="bp-tags" value="${(p.tags||'').replace(/"/g,'&quot;')}" placeholder="roofing, measurement, AI" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
      </div>
      <div class="grid md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">Author Name</label>
          <input type="text" id="bp-author" value="${(p.author_name||'RoofReporterAI Team').replace(/"/g,'&quot;')}" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">SEO Meta Title</label>
          <input type="text" id="bp-meta-title" value="${(p.meta_title||'').replace(/"/g,'&quot;')}" placeholder="Optional SEO title override" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">SEO Meta Description</label>
          <input type="text" id="bp-meta-desc" value="${(p.meta_description||'').replace(/"/g,'&quot;')}" placeholder="Optional SEO description" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 focus:border-sky-400">
        </div>
      </div>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="bp-featured" ${p.is_featured ? 'checked' : ''} class="w-4 h-4 text-sky-500 rounded">
          <span class="text-sm text-gray-700"><i class="fas fa-star text-yellow-400 mr-1"></i>Featured Post</span>
        </label>
      </div>
      <div class="flex items-center gap-3 pt-4 border-t">
        <button onclick="saveBlogPost('draft')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2.5 px-6 rounded-lg text-sm transition-all"><i class="fas fa-save mr-1"></i>Save as Draft</button>
        <button onclick="saveBlogPost('published')" class="bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-all"><i class="fas fa-paper-plane mr-1"></i>Publish</button>
        <button onclick="blogView='list';render()" class="text-gray-500 hover:text-gray-700 text-sm ml-auto">Cancel</button>
      </div>
    </div>
  `);
}

async function saveBlogPost(status) {
  const data = {
    title: document.getElementById('bp-title')?.value?.trim(),
    slug: document.getElementById('bp-slug')?.value?.trim(),
    excerpt: document.getElementById('bp-excerpt')?.value?.trim(),
    content: document.getElementById('bp-content')?.value?.trim(),
    cover_image_url: document.getElementById('bp-cover')?.value?.trim(),
    category: document.getElementById('bp-category')?.value,
    tags: document.getElementById('bp-tags')?.value?.trim(),
    author_name: document.getElementById('bp-author')?.value?.trim(),
    meta_title: document.getElementById('bp-meta-title')?.value?.trim(),
    meta_description: document.getElementById('bp-meta-desc')?.value?.trim(),
    is_featured: document.getElementById('bp-featured')?.checked,
    status: status
  };

  if (!data.title || !data.content) {
    alert('Title and content are required.');
    return;
  }

  try {
    const isEdit = !!editingPost;
    const url = isEdit ? '/api/blog/admin/posts/' + editingPost.id : '/api/blog/admin/posts';
    const method = isEdit ? 'PUT' : 'POST';

    const r = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', ...Object.fromEntries(Object.entries(adminHeaders())) },
      body: JSON.stringify(data)
    });
    const d = await r.json();

    if (r.ok) {
      alert(isEdit ? 'Post updated!' : 'Post created!');
      blogView = 'list';
      editingPost = null;
      await loadBlogPosts();
      render();
    } else {
      alert('Error: ' + (d.error || 'Failed to save'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// adminHeaders already defined at top of file

async function deleteBlogPost(id) {
  if (!confirm('Delete this blog post permanently?')) return;
  try {
    const r = await fetch('/api/blog/admin/posts/' + id, {
      method: 'DELETE',
      headers: adminHeaders()
    });
    if (r.ok) {
      await loadBlogPosts();
      render();
    } else {
      alert('Failed to delete post');
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// ============================================================
// ROVER AI CHATBOT — Admin Review Panel
// ============================================================
let roverStats = null;
let roverConversations = [];
let roverPage = 1;
let roverTotal = 0;
let roverFilter = '';
let roverLeadFilter = '';
let roverSearch = '';
let roverViewingConvo = null;
let roverViewingMessages = [];

async function loadRoverData() {
  try {
    const [statsRes, convosRes] = await Promise.all([
      adminFetch('/api/rover/admin/stats'),
      adminFetch('/api/rover/admin/conversations?page=' + roverPage + '&limit=15' +
        (roverFilter ? '&status=' + roverFilter : '') +
        (roverLeadFilter ? '&lead_status=' + roverLeadFilter : '') +
        (roverSearch ? '&search=' + encodeURIComponent(roverSearch) : ''))
    ]);
    if (statsRes) roverStats = await statsRes.json();
    if (convosRes) {
      const cd = await convosRes.json();
      roverConversations = cd.conversations || [];
      roverTotal = cd.total || 0;
    }
  } catch(e) {
    console.error('Rover load error:', e);
    roverStats = { stats: {}, token_stats: {}, recent: [] };
    roverConversations = [];
  }
}

function renderRover() {
  if (!roverStats) {
    loadRoverData().then(() => render());
    return '<div class="text-center py-12"><div class="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div><p class="text-gray-400 mt-3 text-sm">Loading Rover data...</p></div>';
  }

  if (roverViewingConvo) return renderRoverConvoDetail();

  const s = roverStats.stats || {};
  const ts = roverStats.token_stats || {};

  return `
    <!-- Rover Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      ${mc('Total Chats', s.total_conversations || 0, 'fa-comments', 'blue')}
      ${mc('Active Now', s.active_conversations || 0, 'fa-circle text-green-500', 'green')}
      ${mc('Today', s.today_conversations || 0, 'fa-calendar-day', 'indigo')}
      ${mc('This Week', s.week_conversations || 0, 'fa-calendar-week', 'purple')}
      ${mc('Qualified Leads', s.qualified_leads || 0, 'fa-star', 'amber')}
      ${mc('Emails Collected', s.emails_collected || 0, 'fa-envelope', 'red')}
    </div>

    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <!-- Performance -->
      ${section('Chat Performance', 'fa-chart-bar', `
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-blue-50 rounded-xl text-center">
            <p class="text-xs text-gray-500">Total Messages</p>
            <p class="text-xl font-black text-blue-600">${s.total_messages || 0}</p>
          </div>
          <div class="p-3 bg-green-50 rounded-xl text-center">
            <p class="text-xs text-gray-500">Avg Messages/Chat</p>
            <p class="text-xl font-black text-green-600">${(s.avg_messages_per_conversation || 0).toFixed(1)}</p>
          </div>
          <div class="p-3 bg-amber-50 rounded-xl text-center">
            <p class="text-xs text-gray-500">Total Tokens</p>
            <p class="text-xl font-black text-amber-600">${((ts.total_tokens || 0) / 1000).toFixed(1)}K</p>
          </div>
          <div class="p-3 bg-purple-50 rounded-xl text-center">
            <p class="text-xs text-gray-500">Avg Response</p>
            <p class="text-xl font-black text-purple-600">${Math.round(ts.avg_response_time || 0)}ms</p>
          </div>
        </div>
      `)}

      <!-- Lead Funnel -->
      ${section('Lead Funnel', 'fa-funnel-dollar', `
        <div class="space-y-3">
          ${[
            { label: 'Total Visitors', val: s.total_conversations || 0, color: 'blue', pct: 100 },
            { label: 'Qualified Leads', val: s.qualified_leads || 0, color: 'amber', pct: s.total_conversations > 0 ? Math.round((s.qualified_leads || 0) / s.total_conversations * 100) : 0 },
            { label: 'Converted', val: s.converted_leads || 0, color: 'green', pct: s.total_conversations > 0 ? Math.round((s.converted_leads || 0) / s.total_conversations * 100) : 0 },
            { label: 'Emails Captured', val: s.emails_collected || 0, color: 'red', pct: s.total_conversations > 0 ? Math.round((s.emails_collected || 0) / s.total_conversations * 100) : 0 },
            { label: 'Phones Captured', val: s.phones_collected || 0, color: 'indigo', pct: s.total_conversations > 0 ? Math.round((s.phones_collected || 0) / s.total_conversations * 100) : 0 }
          ].map(f => `
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">${f.label}</span>
                <span class="font-bold">${f.val} <span class="text-gray-400 font-normal">(${f.pct}%)</span></span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-${f.color}-500 h-2 rounded-full" style="width:${f.pct}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `)}

      <!-- Quick View Recent -->
      ${section('Recent Conversations', 'fa-clock', `
        <div class="space-y-2">
          ${(roverStats.recent || []).slice(0, 5).map(r => `
            <div class="flex items-center justify-between py-2 border-b border-gray-50 cursor-pointer hover:bg-blue-50 rounded-lg px-2 -mx-2 transition-colors" onclick="viewRoverConvo(${r.id})">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">
                  ${r.visitor_name ? r.visitor_name[0].toUpperCase() : '?'}
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-800">${r.visitor_name || r.visitor_email || 'Anonymous Visitor'}</p>
                  <p class="text-xs text-gray-400">${r.message_count} msgs · ${r.summary ? r.summary.substring(0, 50) + '...' : 'No summary'}</p>
                </div>
              </div>
              <div class="text-right">
                ${roverLeadBadge(r.lead_status)}
                <p class="text-xs text-gray-400 mt-1">${fmtDateTime(r.last_message_at)}</p>
              </div>
            </div>
          `).join('')}
          ${(roverStats.recent || []).length === 0 ? '<p class="text-gray-400 text-sm text-center py-4">No conversations yet. Rover is ready to chat!</p>' : ''}
        </div>
      `)}
    </div>

    <!-- Filters + Full Conversation List -->
    ${section('All Conversations (' + roverTotal + ')', 'fa-comments', `
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex items-center gap-2">
          <select onchange="roverFilter=this.value;roverPage=1;loadRoverData().then(()=>render())" class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="" ${roverFilter===''?'selected':''}>All Status</option>
            <option value="active" ${roverFilter==='active'?'selected':''}>Active</option>
            <option value="ended" ${roverFilter==='ended'?'selected':''}>Ended</option>
            <option value="flagged" ${roverFilter==='flagged'?'selected':''}>Flagged</option>
          </select>
          <select onchange="roverLeadFilter=this.value;roverPage=1;loadRoverData().then(()=>render())" class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="" ${roverLeadFilter===''?'selected':''}>All Leads</option>
            <option value="new" ${roverLeadFilter==='new'?'selected':''}>New</option>
            <option value="qualified" ${roverLeadFilter==='qualified'?'selected':''}>Qualified</option>
            <option value="contacted" ${roverLeadFilter==='contacted'?'selected':''}>Contacted</option>
            <option value="converted" ${roverLeadFilter==='converted'?'selected':''}>Converted</option>
          </select>
        </div>
        <div class="flex-1 relative">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input type="text" value="${roverSearch}" placeholder="Search by name, email, or summary..." 
            onkeyup="if(event.key==='Enter'){roverSearch=this.value;roverPage=1;loadRoverData().then(()=>render())}"
            class="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400">
        </div>
        <button onclick="roverSearch='';roverFilter='';roverLeadFilter='';roverPage=1;loadRoverData().then(()=>render())" class="text-gray-400 hover:text-gray-600 text-sm px-3 py-2">
          <i class="fas fa-times mr-1"></i>Clear
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Visitor</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Contact</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Messages</th>
              <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500">Lead</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Summary</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Page</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Time</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${roverConversations.map(c => `
              <tr class="hover:bg-blue-50/40 transition-colors cursor-pointer" onclick="viewRoverConvo(${c.id})">
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} rounded-full flex items-center justify-center text-xs font-bold">
                      ${c.visitor_name ? c.visitor_name[0].toUpperCase() : (c.status === 'active' ? '●' : '?')}
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-800">${c.visitor_name || 'Anonymous'}</p>
                      ${c.visitor_company ? '<p class="text-xs text-gray-400">' + c.visitor_company + '</p>' : ''}
                    </div>
                  </div>
                </td>
                <td class="px-3 py-2 text-xs text-gray-500">
                  ${c.visitor_email ? '<i class="fas fa-envelope text-blue-400 mr-1"></i>' + c.visitor_email : ''}
                  ${c.visitor_phone ? '<br><i class="fas fa-phone text-green-400 mr-1"></i>' + c.visitor_phone : ''}
                  ${!c.visitor_email && !c.visitor_phone ? '<span class="text-gray-300">No contact</span>' : ''}
                </td>
                <td class="px-3 py-2 text-center">
                  <span class="inline-flex items-center justify-center w-7 h-7 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">${c.message_count || 0}</span>
                </td>
                <td class="px-3 py-2 text-center">
                  ${roverLeadBadge(c.lead_status)}
                  ${c.lead_score > 0 ? '<span class="block text-[10px] text-gray-400 mt-0.5">' + c.lead_score + '/100</span>' : ''}
                </td>
                <td class="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">${c.summary || c.first_user_message || '<span class="text-gray-300">-</span>'}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${c.page_url || '/'}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmtDateTime(c.last_message_at || c.created_at)}</td>
                <td class="px-3 py-2">
                  <div class="flex gap-1" onclick="event.stopPropagation()">
                    <button onclick="viewRoverConvo(${c.id})" class="p-1 text-gray-400 hover:text-blue-600" title="View"><i class="fas fa-eye"></i></button>
                    <button onclick="deleteRoverConvo(${c.id})" class="p-1 text-gray-400 hover:text-red-600" title="Delete"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${roverConversations.length === 0 ? '<tr><td colspan="8" class="px-3 py-12 text-center text-gray-400"><i class="fas fa-robot text-4xl mb-3 block"></i>No conversations yet.<br><span class="text-xs">Rover is live and ready to chat with visitors!</span></td></tr>' : ''}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      ${roverTotal > 15 ? `
        <div class="flex items-center justify-between mt-4 pt-4 border-t">
          <span class="text-xs text-gray-400">Page ${roverPage} of ${Math.ceil(roverTotal / 15)}</span>
          <div class="flex gap-2">
            <button ${roverPage <= 1 ? 'disabled' : ''} onclick="roverPage--;loadRoverData().then(()=>render())" class="px-3 py-1.5 border rounded-lg text-sm ${roverPage <= 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-50'}">Prev</button>
            <button ${roverPage >= Math.ceil(roverTotal / 15) ? 'disabled' : ''} onclick="roverPage++;loadRoverData().then(()=>render())" class="px-3 py-1.5 border rounded-lg text-sm ${roverPage >= Math.ceil(roverTotal / 15) ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-50'}">Next</button>
          </div>
        </div>
      ` : ''}
    `)}
  `;
}

function roverLeadBadge(status) {
  const m = {
    'new': 'bg-gray-100 text-gray-600',
    'qualified': 'bg-amber-100 text-amber-700',
    'contacted': 'bg-blue-100 text-blue-700',
    'converted': 'bg-green-100 text-green-700',
    'spam': 'bg-red-100 text-red-600'
  };
  return '<span class="px-2 py-0.5 ' + (m[status] || m['new']) + ' rounded-full text-[10px] font-bold uppercase">' + (status || 'new') + '</span>';
}

async function viewRoverConvo(id) {
  try {
    const res = await adminFetch('/api/rover/admin/conversations/' + id);
    if (!res) return;
    const data = await res.json();
    roverViewingConvo = data.conversation;
    roverViewingMessages = data.messages || [];
    render();
  } catch(e) { alert('Error: ' + e.message); }
}

function renderRoverConvoDetail() {
  const c = roverViewingConvo;
  if (!c) return '';

  return `
    <div class="mb-4">
      <button onclick="roverViewingConvo=null;render()" class="text-sky-500 hover:text-sky-600 text-sm font-medium"><i class="fas fa-arrow-left mr-1"></i>Back to All Conversations</button>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Left: Conversation Messages -->
      <div class="lg:col-span-2">
        ${section('Conversation #' + c.id, 'fa-comments', `
          <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            ${roverViewingMessages.map(m => `
              <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                <div class="${m.role === 'user' ? 'bg-blue-500 text-white rounded-t-xl rounded-bl-xl' : 'bg-gray-100 text-gray-800 rounded-t-xl rounded-br-xl'} px-4 py-3 max-w-[80%]">
                  <p class="text-sm leading-relaxed">${(m.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>')}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] ${m.role === 'user' ? 'text-blue-200' : 'text-gray-400'}">${fmtDateTime(m.created_at)}</span>
                    ${m.tokens_used > 0 ? '<span class="text-[10px] ' + (m.role === 'user' ? 'text-blue-200' : 'text-gray-400') + '">' + m.tokens_used + ' tokens</span>' : ''}
                    ${m.response_time_ms > 0 ? '<span class="text-[10px] ' + (m.role === 'user' ? 'text-blue-200' : 'text-gray-400') + '">' + m.response_time_ms + 'ms</span>' : ''}
                  </div>
                </div>
              </div>
            `).join('')}
            ${roverViewingMessages.length === 0 ? '<p class="text-center text-gray-400 py-8">No messages in this conversation</p>' : ''}
          </div>
        `)}
      </div>

      <!-- Right: Visitor Details & Actions -->
      <div>
        ${section('Visitor Info', 'fa-user', `
          <div class="space-y-3">
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Name</p>
              <p class="text-sm font-medium text-gray-800">${c.visitor_name || '<span class="text-gray-300">Not provided</span>'}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Email</p>
              <p class="text-sm font-medium text-gray-800">${c.visitor_email ? '<a href="mailto:' + c.visitor_email + '" class="text-blue-600 hover:underline">' + c.visitor_email + '</a>' : '<span class="text-gray-300">Not provided</span>'}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Phone</p>
              <p class="text-sm font-medium text-gray-800">${c.visitor_phone || '<span class="text-gray-300">Not provided</span>'}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Company</p>
              <p class="text-sm font-medium text-gray-800">${c.visitor_company || '<span class="text-gray-300">Not provided</span>'}</p>
            </div>
            <div class="pt-2 border-t">
              <p class="text-xs text-gray-400 uppercase font-semibold">Page</p>
              <p class="text-sm text-gray-600">${c.page_url || '/'}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Status</p>
              <p class="text-sm">${roverLeadBadge(c.lead_status)} <span class="text-gray-400 text-xs ml-1">Score: ${c.lead_score || 0}/100</span></p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Started</p>
              <p class="text-sm text-gray-600">${fmtDateTime(c.created_at)}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase font-semibold">Last Message</p>
              <p class="text-sm text-gray-600">${fmtDateTime(c.last_message_at)}</p>
            </div>
            ${c.summary ? '<div class="pt-2 border-t"><p class="text-xs text-gray-400 uppercase font-semibold">AI Summary</p><p class="text-sm text-gray-600 italic">' + c.summary + '</p></div>' : ''}
          </div>
        `)}

        ${section('Admin Actions', 'fa-cog', `
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Lead Status</label>
              <select id="rover-lead-status" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="new" ${c.lead_status==='new'?'selected':''}>New</option>
                <option value="qualified" ${c.lead_status==='qualified'?'selected':''}>Qualified</option>
                <option value="contacted" ${c.lead_status==='contacted'?'selected':''}>Contacted</option>
                <option value="converted" ${c.lead_status==='converted'?'selected':''}>Converted</option>
                <option value="spam" ${c.lead_status==='spam'?'selected':''}>Spam</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Tags</label>
              <input type="text" id="rover-tags" value="${(c.tags||'').replace(/"/g,'&quot;')}" placeholder="pricing, estimate, urgent" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Admin Notes</label>
              <textarea id="rover-notes" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Add your notes...">${(c.admin_notes||'').replace(/</g,'&lt;')}</textarea>
            </div>
            <button onclick="saveRoverConvoUpdate(${c.id})" class="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
              <i class="fas fa-save mr-1"></i>Save Changes
            </button>
          </div>
        `)}
      </div>
    </div>
  `;
}

async function saveRoverConvoUpdate(id) {
  try {
    const res = await fetch('/api/rover/admin/conversations/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({
        lead_status: document.getElementById('rover-lead-status')?.value,
        tags: document.getElementById('rover-tags')?.value,
        admin_notes: document.getElementById('rover-notes')?.value
      })
    });
    if (res.ok) {
      alert('Saved!');
      // Refresh
      roverStats = null;
      viewRoverConvo(id);
    } else {
      alert('Failed to save');
    }
  } catch(e) { alert('Error: ' + e.message); }
}

async function deleteRoverConvo(id) {
  if (!confirm('Delete this conversation permanently?')) return;
  try {
    const res = await fetch('/api/rover/admin/conversations/' + id, {
      method: 'DELETE',
      headers: adminHeaders()
    });
    if (res.ok) {
      roverStats = null;
      roverViewingConvo = null;
      await loadRoverData();
      render();
    } else {
      alert('Failed to delete');
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// ============================================================
// SIP BRIDGE TAB — LiveKit Telephony Management
// Manage inbound/outbound SIP trunks, dispatch rules, dial out
// ============================================================
let sipData = null;
let sipLoading = false;
let sipDialing = false;
let sipCreating = false;
let sipCreateMode = null; // 'inbound' | 'outbound' | null

async function loadSipData() {
  sipLoading = true;
  render();
  try {
    const res = await fetch('/api/secretary/sip/trunks', { headers: { ...adminHeaders(), 'Content-Type': 'application/json' } });
    if (res.ok) {
      sipData = await res.json();
    } else {
      sipData = { error: 'Failed to load SIP trunks (HTTP ' + res.status + ')' };
    }
  } catch(e) {
    sipData = { error: e.message };
  }
  sipLoading = false;
  render();
}

function renderSipBridge() {
  // Auto-load on first visit
  if (!sipData && !sipLoading) { loadSipData(); }

  if (sipLoading) {
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div><span class="ml-3 text-gray-500">Loading SIP trunks from LiveKit...</span></div>`;
  }

  if (sipData?.error) {
    return section('SIP Bridge Error', 'fa-exclamation-triangle', `
      <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <p class="font-semibold">Failed to connect to LiveKit SIP API</p>
        <p class="text-sm mt-1">${sipData.error}</p>
        <button onclick="sipData=null;loadSipData()" class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"><i class="fas fa-redo mr-1"></i>Retry</button>
      </div>
    `);
  }

  const inbound = sipData?.inbound_trunks || [];
  const outbound = sipData?.outbound_trunks || [];
  const rules = sipData?.dispatch_rules || [];

  return `
    <!-- Header + Stats -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
      ${mc('Inbound Trunks', inbound.length, 'fa-phone-alt', 'green')}
      ${mc('Outbound Trunks', outbound.length, 'fa-phone-volume', 'blue')}
      ${mc('Dispatch Rules', rules.length, 'fa-route', 'purple')}
      ${mc('Total Trunks', inbound.length + outbound.length, 'fa-network-wired', 'indigo')}
    </div>

    <!-- Quick Actions -->
    ${section('Quick Actions', 'fa-bolt', `
      <div class="flex flex-wrap gap-3">
        <button onclick="sipCreateMode='outbound';render()" class="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl">
          <i class="fas fa-plus mr-2"></i>New Outbound Trunk
        </button>
        <button onclick="sipCreateMode='inbound';render()" class="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-all shadow-lg hover:shadow-xl">
          <i class="fas fa-plus mr-2"></i>New Inbound Trunk
        </button>
        <button onclick="showDialModal()" class="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all shadow-lg hover:shadow-xl">
          <i class="fas fa-phone mr-2"></i>Dial a Number
        </button>
        <button onclick="sipData=null;loadSipData()" class="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all border border-gray-200">
          <i class="fas fa-sync mr-2"></i>Refresh
        </button>
      </div>
    `)}

    <!-- Create Trunk Form -->
    ${sipCreateMode ? renderCreateTrunkForm() : ''}

    <!-- Dial Modal -->
    <div id="sip-dial-modal" class="hidden mb-6"></div>

    <!-- Outbound Trunks -->
    ${section('Outbound Trunks <span class=\"text-sm font-normal text-gray-400\">(AI → Phone)</span>', 'fa-phone-volume', `
      ${outbound.length === 0 ? `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-phone-slash text-4xl mb-3"></i>
          <p>No outbound trunks configured</p>
          <p class="text-sm mt-1">Create one to enable AI-to-phone dialing</p>
        </div>
      ` : `
        <div class="space-y-3">
          ${outbound.map(t => renderTrunkCard(t, 'outbound')).join('')}
        </div>
      `}
    `)}

    <!-- Inbound Trunks -->
    ${section('Inbound Trunks <span class=\"text-sm font-normal text-gray-400\">(Phone → AI)</span>', 'fa-phone-alt', `
      ${inbound.length === 0 ? `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-phone-slash text-4xl mb-3"></i>
          <p>No inbound trunks configured</p>
          <p class="text-sm mt-1">Create one to route incoming calls to AI</p>
        </div>
      ` : `
        <div class="space-y-3">
          ${inbound.map(t => renderTrunkCard(t, 'inbound')).join('')}
        </div>
      `}
    `)}

    <!-- Dispatch Rules -->
    ${section('Dispatch Rules', 'fa-route', `
      ${rules.length === 0 ? `
        <p class="text-center py-4 text-gray-400">No dispatch rules configured</p>
      ` : `
        <div class="space-y-2">
          ${rules.map(r => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center"><i class="fas fa-route text-purple-600 text-xs"></i></div>
                <div>
                  <p class="text-sm font-semibold text-gray-800">${r.name || r.sip_dispatch_rule_id || 'Unnamed Rule'}</p>
                  <p class="text-xs text-gray-400">ID: ${r.sip_dispatch_rule_id || 'N/A'}</p>
                  ${r.trunk_ids?.length ? `<p class="text-xs text-gray-500">Trunks: ${r.trunk_ids.join(', ')}</p>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${r.rule?.dispatchRuleIndividual?.roomPrefix ? `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs">Room: ${r.rule.dispatchRuleIndividual.roomPrefix}*</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `)}

    <!-- Handshake Reference -->
    ${section('SIP Handshake Reference', 'fa-info-circle', `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h4 class="font-bold text-blue-800 mb-2"><i class="fas fa-arrow-right mr-1"></i>Outbound (AI → Phone)</h4>
          <ol class="text-sm text-blue-700 space-y-1 list-decimal ml-4">
            <li>Create outbound trunk with carrier details</li>
            <li>LiveKit sends SIP INVITE to carrier proxy</li>
            <li>Carrier returns 401 challenge</li>
            <li>LiveKit resends with auth credentials</li>
            <li>Call connected — AI joins LiveKit room</li>
          </ol>
        </div>
        <div class="p-4 bg-green-50 border border-green-200 rounded-xl">
          <h4 class="font-bold text-green-800 mb-2"><i class="fas fa-arrow-left mr-1"></i>Inbound (Phone → AI)</h4>
          <ol class="text-sm text-green-700 space-y-1 list-decimal ml-4">
            <li>Create inbound trunk + dispatch rule</li>
            <li>Carrier forwards call to LiveKit SIP gateway</li>
            <li>LiveKit validates trunk & routes to room</li>
            <li>AI agent auto-joins room and answers</li>
            <li>Call logged in secretary_call_logs</li>
          </ol>
        </div>
      </div>
      <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <h4 class="font-bold text-amber-800 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>Telus SIP Requirements</h4>
        <ul class="text-sm text-amber-700 space-y-1">
          <li>• <strong>Proxy:</strong> proxy1.dynsipt.broadconnect.ca (or proxy2)</li>
          <li>• <strong>Transport:</strong> UDP (no encryption)</li>
          <li>• <strong>Auth Username:</strong> Your 10-digit Telus Pilot number</li>
          <li>• <strong>From Header:</strong> Must match primary billing number</li>
          <li>• <strong>Media Encryption:</strong> Disabled (RTP/UDP only)</li>
        </ul>
      </div>
    `)}
  `;
}

function renderTrunkCard(t, type) {
  const id = t.sip_trunk_id || t.trunk?.sip_trunk_id || 'N/A';
  const name = t.name || t.trunk?.name || 'Unnamed';
  const numbers = t.numbers || t.trunk?.numbers || [];
  const address = t.address || t.trunk?.address || '';
  const authUser = t.auth_username || t.trunk?.auth_username || '';
  const transport = t.transport || t.trunk?.transport || 0;
  const transportLabel = ['Auto','UDP','TCP','TLS'][transport] || 'Auto';
  const encryption = t.media_encryption || t.trunk?.media_encryption || 0;
  const encLabel = encryption === 0 ? 'Disabled' : 'Enabled';
  const krisp = t.krisp_enabled || t.trunk?.krisp_enabled;

  return `
    <div class="p-4 bg-white border border-gray-200 rounded-xl hover:border-${type==='outbound'?'blue':'green'}-300 transition-colors">
      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-${type==='outbound'?'blue':'green'}-100 rounded-full flex items-center justify-center flex-shrink-0">
            <i class="fas fa-${type==='outbound'?'phone-volume':'phone-alt'} text-${type==='outbound'?'blue':'green'}-600"></i>
          </div>
          <div>
            <p class="font-semibold text-gray-800">${name}</p>
            <p class="text-xs text-gray-400 font-mono">${id}</p>
            ${numbers.length ? `<p class="text-sm text-gray-600 mt-1"><i class="fas fa-hashtag mr-1 text-gray-400"></i>${numbers.join(', ')}</p>` : ''}
            ${address ? `<p class="text-sm text-gray-600"><i class="fas fa-server mr-1 text-gray-400"></i>${address}</p>` : `<p class="text-sm text-gray-500"><i class="fas fa-cloud mr-1"></i>LiveKit Cloud PSTN</p>`}
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${type === 'outbound' ? `<button onclick="quickDial('${id}')" class="p-2 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors" title="Dial out using this trunk"><i class="fas fa-phone text-purple-600 text-sm"></i></button>` : ''}
          <button onclick="deleteSipTrunk('${id}','${name}')" class="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors" title="Delete trunk"><i class="fas fa-trash text-red-600 text-sm"></i></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <span class="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600"><i class="fas fa-exchange-alt mr-1"></i>${transportLabel}</span>
        <span class="px-2 py-1 rounded-lg text-xs font-medium ${encryption===0?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}"><i class="fas fa-lock${encryption===0?'-open':''} mr-1"></i>Encryption: ${encLabel}</span>
        ${krisp ? '<span class="px-2 py-1 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700"><i class="fas fa-microphone mr-1"></i>Krisp Noise Filter</span>' : ''}
        ${authUser ? `<span class="px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700"><i class="fas fa-user mr-1"></i>Auth: ${authUser}</span>` : ''}
      </div>
    </div>
  `;
}

function renderCreateTrunkForm() {
  const isOutbound = sipCreateMode === 'outbound';
  const color = isOutbound ? 'blue' : 'green';
  const icon = isOutbound ? 'fa-phone-volume' : 'fa-phone-alt';

  return `
    <div class="bg-white rounded-xl border border-${color}-200 shadow-lg p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-800"><i class="fas ${icon} mr-2 text-${color}-600"></i>Create ${isOutbound ? 'Outbound' : 'Inbound'} SIP Trunk</h3>
        <button onclick="sipCreateMode=null;render()" class="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg"><i class="fas fa-times text-gray-500"></i></button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Trunk Name</label>
          <input id="sip-name" type="text" value="${isOutbound ? 'Reuse Canada Outbound' : 'Reuse Canada Inbound'}" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-${color}-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Phone Number (E.164) *</label>
          <input id="sip-phone" type="text" placeholder="+17805551234" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-${color}-500">
        </div>
        ${isOutbound ? `
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">SIP Proxy Address</label>
            <input id="sip-address" type="text" placeholder="proxy1.dynsipt.broadconnect.ca (leave blank for LiveKit Cloud)" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
            <p class="text-xs text-gray-400 mt-1">Leave blank to use LiveKit Cloud PSTN gateway</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Transport</label>
            <select id="sip-transport" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <option value="0">Auto</option>
              <option value="1" selected>UDP (recommended for Telus)</option>
              <option value="2">TCP</option>
              <option value="3">TLS</option>
            </select>
          </div>
        ` : ''}
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Auth Username</label>
          <input id="sip-auth-user" type="text" placeholder="10-digit Telus Pilot number (optional)" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Auth Password</label>
          <input id="sip-auth-pass" type="password" placeholder="SIP password (optional)" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
        </div>
        ${isOutbound ? `
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Country Code</label>
            <select id="sip-country" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <option value="CA" selected>Canada (CA)</option>
              <option value="US">United States (US)</option>
            </select>
          </div>
        ` : `
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Krisp Noise Filter</label>
            <select id="sip-krisp" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <option value="true" selected>Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        `}
      </div>

      <div id="sip-create-error" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
      <div id="sip-create-success" class="hidden mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm"></div>

      <div class="flex gap-3 mt-6">
        <button onclick="createSipTrunk('${sipCreateMode}')" id="sip-create-btn" class="px-6 py-3 bg-${color}-600 text-white font-bold rounded-xl hover:bg-${color}-700 transition-all shadow-lg">
          <i class="fas fa-plus mr-2"></i>Create ${isOutbound ? 'Outbound' : 'Inbound'} Trunk
        </button>
        <button onclick="sipCreateMode=null;render()" class="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 border border-gray-200">Cancel</button>
      </div>
    </div>
  `;
}

async function createSipTrunk(type) {
  const errEl = document.getElementById('sip-create-error');
  const okEl = document.getElementById('sip-create-success');
  const btn = document.getElementById('sip-create-btn');
  if (errEl) errEl.classList.add('hidden');
  if (okEl) okEl.classList.add('hidden');

  const phone = document.getElementById('sip-phone')?.value?.trim();
  if (!phone) { if (errEl) { errEl.textContent = 'Phone number is required (E.164 format, e.g. +17805551234)'; errEl.classList.remove('hidden'); } return; }

  const payload = {
    name: document.getElementById('sip-name')?.value?.trim() || '',
    phone_number: phone,
    auth_username: document.getElementById('sip-auth-user')?.value?.trim() || '',
    auth_password: document.getElementById('sip-auth-pass')?.value?.trim() || '',
  };

  if (type === 'outbound') {
    payload.address = document.getElementById('sip-address')?.value?.trim() || '';
    payload.transport = parseInt(document.getElementById('sip-transport')?.value || '0');
    payload.country_code = document.getElementById('sip-country')?.value || 'CA';
  } else {
    payload.krisp_enabled = document.getElementById('sip-krisp')?.value === 'true';
  }

  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';

  try {
    const endpoint = type === 'outbound' ? '/api/secretary/sip/outbound-trunk' : '/api/secretary/sip/inbound-trunk';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      if (okEl) {
        okEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>' + (data.message || 'Trunk created!') + '<br><span class="font-mono text-xs">Trunk ID: ' + (data.trunk_id || 'N/A') + '</span>';
        okEl.classList.remove('hidden');
      }
      // Reload trunks after 1.5s
      setTimeout(() => { sipData = null; sipCreateMode = null; loadSipData(); }, 1500);
    } else {
      if (errEl) { errEl.textContent = data.error || 'Failed to create trunk'; errEl.classList.remove('hidden'); }
    }
  } catch(e) {
    if (errEl) { errEl.textContent = 'Network error: ' + e.message; errEl.classList.remove('hidden'); }
  }
  if (btn) btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Create ' + (type === 'outbound' ? 'Outbound' : 'Inbound') + ' Trunk';
}

function showDialModal() {
  const modal = document.getElementById('sip-dial-modal');
  if (!modal) return;
  const outbound = sipData?.outbound_trunks || [];
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="bg-white rounded-xl border border-purple-200 shadow-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-phone mr-2 text-purple-600"></i>Dial a Phone Number</h3>
        <button onclick="document.getElementById('sip-dial-modal').classList.add('hidden')" class="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg"><i class="fas fa-times text-gray-500"></i></button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Phone Number to Dial *</label>
          <input id="dial-phone" type="text" placeholder="+17805551234" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Outbound Trunk</label>
          <select id="dial-trunk" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
            <option value="">Auto-select (newest)</option>
            ${outbound.map(t => `<option value="${t.sip_trunk_id || ''}">${t.name || t.sip_trunk_id} — ${(t.numbers||[]).join(', ')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Room Name (optional)</label>
          <input id="dial-room" type="text" placeholder="auto-generated if blank" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase">Caller Display Name</label>
          <input id="dial-name" type="text" value="RoofReporterAI" class="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
        </div>
      </div>
      <div id="dial-error" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>
      <div id="dial-success" class="hidden mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm"></div>
      <div class="flex gap-3 mt-6">
        <button onclick="dialNumber()" id="dial-btn" class="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg"><i class="fas fa-phone mr-2"></i>Dial Now</button>
        <button onclick="document.getElementById('sip-dial-modal').classList.add('hidden')" class="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 border border-gray-200">Cancel</button>
      </div>
    </div>
  `;
}

function quickDial(trunkId) {
  showDialModal();
  setTimeout(() => {
    const sel = document.getElementById('dial-trunk');
    if (sel) sel.value = trunkId;
  }, 100);
}

async function dialNumber() {
  const errEl = document.getElementById('dial-error');
  const okEl = document.getElementById('dial-success');
  const btn = document.getElementById('dial-btn');
  if (errEl) errEl.classList.add('hidden');
  if (okEl) okEl.classList.add('hidden');

  const phone = document.getElementById('dial-phone')?.value?.trim();
  if (!phone) { if (errEl) { errEl.textContent = 'Enter a phone number to dial'; errEl.classList.remove('hidden'); } return; }

  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Dialing...';

  try {
    const res = await fetch('/api/secretary/sip/dial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({
        phone_number: phone,
        trunk_id: document.getElementById('dial-trunk')?.value || '',
        room_name: document.getElementById('dial-room')?.value?.trim() || '',
        participant_name: document.getElementById('dial-name')?.value?.trim() || 'RoofReporterAI',
      }),
    });
    const data = await res.json();
    if (data.success) {
      if (okEl) {
        okEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>' + (data.message || 'Call initiated!') + '<br><span class="font-mono text-xs">Room: ' + (data.room_name || '') + ' | Participant: ' + (data.participant_id || '') + '</span>';
        okEl.classList.remove('hidden');
      }
    } else {
      if (errEl) { errEl.textContent = data.error || 'Failed to dial'; errEl.classList.remove('hidden'); }
    }
  } catch(e) {
    if (errEl) { errEl.textContent = 'Network error: ' + e.message; errEl.classList.remove('hidden'); }
  }
  if (btn) btn.innerHTML = '<i class="fas fa-phone mr-2"></i>Dial Now';
}

async function deleteSipTrunk(trunkId, name) {
  if (!confirm('Delete SIP trunk "' + name + '"?\\n\\nThis will disconnect any phone numbers using this trunk.')) return;
  try {
    const res = await fetch('/api/secretary/sip/trunk/' + trunkId, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      sipData = null;
      loadSipData();
    } else {
      alert('Failed to delete: ' + (data.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}
