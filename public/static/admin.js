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

async function loadAll() {
  A.loading = true;
  try {
    const [statsRes, ordersRes, gmailRes] = await Promise.all([
      fetch('/api/auth/admin-stats'),
      fetch('/api/orders?limit=100'),
      fetch('/api/auth/gmail/status').catch(() => null)
    ]);
    A.data = await statsRes.json();
    const od = await ordersRes.json();
    A.orders = od.orders || [];
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
    { id:'neworder', label:'New Order', icon:'fa-plus-circle' },
    { id:'activity', label:'Activity Log', icon:'fa-history' }
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
      ${A.tab === 'neworder' ? renderNewOrder() : ''}
      ${A.tab === 'activity' ? renderActivity() : ''}
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
  const m = { pending:'bg-yellow-100 text-yellow-800', paid:'bg-blue-100 text-blue-800', processing:'bg-indigo-100 text-indigo-800', completed:'bg-green-100 text-green-800', failed:'bg-red-100 text-red-800', cancelled:'bg-gray-100 text-gray-500' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s}</span>`;
}

function tierBadge(t) {
  const m = { express:'bg-red-100 text-red-700', standard:'bg-green-100 text-green-700', immediate:'bg-red-100 text-red-700', urgent:'bg-amber-100 text-amber-700', regular:'bg-green-100 text-green-700' };
  const i = { express:'fa-bolt', standard:'fa-clock', immediate:'fa-rocket', urgent:'fa-bolt', regular:'fa-clock' };
  return `<span class="px-2 py-0.5 ${m[t]||'bg-gray-100'} rounded-full text-xs font-medium capitalize"><i class="fas ${i[t]||''} mr-0.5"></i>${t}</span>`;
}

function payBadge(s) {
  const m = { unpaid:'bg-yellow-100 text-yellow-800', paid:'bg-green-100 text-green-800', refunded:'bg-purple-100 text-purple-800' };
  return `<span class="px-2 py-0.5 ${m[s]||'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${s}</span>`;
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

  return `
    <!-- Quick Stats Row -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('Today Revenue', $$(td.revenue_today), 'fa-calendar-day', 'green', td.orders_today+' orders')}
      ${mc('This Week', $$(tw.revenue_week), 'fa-calendar-week', 'blue', tw.orders_week+' orders')}
      ${mc('This Month', $$(tm.revenue_month), 'fa-calendar-alt', 'indigo', tm.orders_month+' orders')}
      ${mc('All-Time Revenue', $$(at.total_collected), 'fa-coins', 'amber', at.total_orders+' total orders')}
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
  const withOrders = custs.filter(c => c.order_count > 0);
  const totalSpent = custs.reduce((s, c) => s + (c.total_spent || 0), 0);
  const googleUsers = custs.filter(c => c.google_id);

  return `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      ${mc('Total Users', custs.length, 'fa-users', 'blue')}
      ${mc('Active (With Orders)', withOrders.length, 'fa-user-check', 'green')}
      ${mc('Google Sign-In', googleUsers.length, 'fa-google', 'red')}
      ${mc('Email/Password', custs.length - googleUsers.length, 'fa-envelope', 'indigo')}
      ${mc('Total Spent', $$(totalSpent), 'fa-dollar-sign', 'amber')}
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
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Orders</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Spent</th>
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
            ${custs.length === 0 ? '<tr><td colspan="10" class="px-4 py-12 text-center text-gray-400"><i class="fas fa-users text-3xl mb-3 block"></i>No users registered yet.<br><span class="text-xs">Share <a href="/customer/login" class="text-blue-600 underline">/customer/login</a> with your clients.</span></td></tr>' : ''}
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
              <td class="px-4 py-2 text-xs text-gray-500 capitalize">${p.payment_method||'stripe'}</td>
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
          <td class="px-3 py-2 text-right font-bold text-sm">$${o.price}</td>
          <td class="px-3 py-2">${statusBadge(o.status)}</td>
          <td class="px-3 py-2">${payBadge(o.payment_status)}</td>
          <td class="px-3 py-2 text-gray-500 text-xs">${fmtDate(o.created_at)}</td>
          <td class="px-3 py-2">
            <div class="flex gap-0.5">
              ${o.status === 'completed' ? `<a href="/api/reports/${o.id}/html" target="_blank" class="p-1 text-gray-400 hover:text-blue-600" title="View Report"><i class="fas fa-file-alt"></i></a><button onclick="emailReport(${o.id})" class="p-1 text-gray-400 hover:text-green-600" title="Email"><i class="fas fa-envelope"></i></button>` : `<button onclick="generateReport(${o.id})" class="p-1 text-gray-400 hover:text-indigo-600" title="Generate"><i class="fas fa-cog"></i></button>`}
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
            <option value="express">Express ($12) - 10 minutes</option>
            <option value="standard">Standard ($8) - 1 hour</option>
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
      requester_name: req, requester_company: 'Reuse Canada',
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
