// ============================================================
// Admin Dashboard
// ============================================================

const adminState = {
  dashboard: null,
  loading: true,
  activeTab: 'overview',
  orders: [],
  companies: []
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadDashboard();
  renderAdmin();
});

async function loadDashboard() {
  adminState.loading = true;
  try {
    const [dashRes, ordersRes, companiesRes] = await Promise.all([
      fetch('/api/admin/dashboard'),
      fetch('/api/orders?limit=50'),
      fetch('/api/companies/customers')
    ]);
    adminState.dashboard = await dashRes.json();
    const ordersData = await ordersRes.json();
    adminState.orders = ordersData.orders || [];
    const companiesData = await companiesRes.json();
    adminState.companies = companiesData.companies || [];
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
  adminState.loading = false;
}

function renderAdmin() {
  const root = document.getElementById('admin-root');
  if (!root) return;

  if (adminState.loading) {
    root.innerHTML = `
      <div class="flex items-center justify-center py-12">
        <div class="spinner" style="border-color: rgba(16,185,129,0.3); border-top-color: #10b981; width: 40px; height: 40px;"></div>
        <span class="ml-3 text-gray-500">Loading dashboard...</span>
      </div>
    `;
    return;
  }

  const d = adminState.dashboard;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
    { id: 'orders', label: 'Orders', icon: 'fa-clipboard-list' },
    { id: 'companies', label: 'Companies', icon: 'fa-building' },
    { id: 'activity', label: 'Activity', icon: 'fa-history' }
  ];

  root.innerHTML = `
    <!-- Tab Navigation -->
    <div class="flex space-x-1 bg-white rounded-xl border border-gray-200 p-1 mb-8 overflow-x-auto">
      ${tabs.map(t => `
        <button onclick="switchTab('${t.id}')"
          class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
          ${adminState.activeTab === t.id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}">
          <i class="fas ${t.icon} mr-1"></i>${t.label}
        </button>
      `).join('')}
    </div>

    <!-- Tab Content -->
    <div class="step-panel">
      ${adminState.activeTab === 'overview' ? renderOverview(d) : ''}
      ${adminState.activeTab === 'orders' ? renderOrdersTab() : ''}
      ${adminState.activeTab === 'companies' ? renderCompaniesTab() : ''}
      ${adminState.activeTab === 'activity' ? renderActivityTab(d) : ''}
    </div>
  `;
}

function switchTab(tab) {
  adminState.activeTab = tab;
  renderAdmin();
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function renderOverview(d) {
  const o = d?.orders || {};
  const r = d?.revenue || {};

  return `
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${statCard('Total Orders', o.total_orders || 0, 'fa-clipboard-list', 'brand')}
      ${statCard('Pending', o.pending || 0, 'fa-hourglass-half', 'amber')}
      ${statCard('Processing', o.processing || 0, 'fa-cog fa-spin', 'blue')}
      ${statCard('Completed', o.completed || 0, 'fa-check-circle', 'green')}
    </div>

    <!-- Revenue -->
    <div class="grid md:grid-cols-2 gap-6 mb-8">
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-700 mb-4"><i class="fas fa-dollar-sign mr-2 text-green-500"></i>Revenue</h3>
        <p class="text-3xl font-bold text-green-600">$${(r.total_revenue || 0).toFixed(2)} <span class="text-sm font-normal text-gray-400">CAD</span></p>
        <div class="mt-4 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500"><i class="fas fa-rocket mr-1 text-red-400"></i>Immediate</span>
            <span class="font-medium">$${(r.immediate_revenue || 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500"><i class="fas fa-bolt mr-1 text-amber-400"></i>Urgent</span>
            <span class="font-medium">$${(r.urgent_revenue || 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500"><i class="fas fa-clock mr-1 text-green-400"></i>Regular</span>
            <span class="font-medium">$${(r.regular_revenue || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-700 mb-4"><i class="fas fa-chart-bar mr-2 text-brand-500"></i>Tier Breakdown</h3>
        ${(d?.tiers || []).map(t => {
          const colors = { immediate: 'red', urgent: 'amber', regular: 'green' };
          const c = colors[t.service_tier] || 'gray';
          const pct = o.total_orders > 0 ? Math.round((t.count / o.total_orders) * 100) : 0;
          return `
            <div class="mb-3">
              <div class="flex justify-between text-sm mb-1">
                <span class="capitalize text-gray-600">${t.service_tier}</span>
                <span class="font-medium">${t.count} orders (${pct}%)</span>
              </div>
              <div class="w-full bg-gray-100 rounded-full h-2">
                <div class="bg-${c}-500 h-2 rounded-full" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('')}
        <div class="mt-4 text-sm text-gray-500">
          <i class="fas fa-users mr-1"></i>${d?.customer_count || 0} Registered Customer Companies
        </div>
      </div>
    </div>

    <!-- Recent Orders -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-semibold text-gray-700"><i class="fas fa-clock mr-2 text-brand-500"></i>Recent Orders</h3>
        <button onclick="switchTab('orders')" class="text-sm text-brand-600 hover:text-brand-700">View All <i class="fas fa-arrow-right ml-1"></i></button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Order #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Property</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Tier</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Price</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${(d?.recent_orders || []).map(o => renderOrderRow(o)).join('')}
            ${(d?.recent_orders || []).length === 0 ? '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">No orders yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function statCard(label, value, icon, color) {
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-500">${label}</p>
          <p class="text-2xl font-bold text-gray-800 mt-1">${value}</p>
        </div>
        <div class="w-10 h-10 bg-${color}-100 rounded-lg flex items-center justify-center">
          <i class="fas ${icon} text-${color}-500"></i>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// ORDERS TAB
// ============================================================
function renderOrdersTab() {
  return `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-semibold text-gray-700"><i class="fas fa-clipboard-list mr-2 text-brand-500"></i>All Orders (${adminState.orders.length})</h3>
        <a href="/" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <i class="fas fa-plus mr-1"></i>New Order
        </a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Order #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Property</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Homeowner</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Requester</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Tier</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Price</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Payment</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${adminState.orders.map(o => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-mono text-xs font-medium text-brand-600">
                  <a href="/order/${o.id}" class="hover:underline">${o.order_number}</a>
                </td>
                <td class="px-4 py-3 text-gray-600 max-w-[200px] truncate">${o.property_address}</td>
                <td class="px-4 py-3 text-gray-600">${o.homeowner_name}</td>
                <td class="px-4 py-3 text-gray-600">${o.requester_name}${o.requester_company ? `<br><span class="text-xs text-gray-400">${o.requester_company}</span>` : ''}</td>
                <td class="px-4 py-3">${tierBadge(o.service_tier)}</td>
                <td class="px-4 py-3 font-medium">$${o.price}</td>
                <td class="px-4 py-3">${statusBadge(o.status)}</td>
                <td class="px-4 py-3">${paymentBadge(o.payment_status)}</td>
                <td class="px-4 py-3">
                  <div class="flex space-x-1">
                    <a href="/order/${o.id}" class="p-1.5 text-gray-400 hover:text-brand-600" title="View">
                      <i class="fas fa-eye"></i>
                    </a>
                    ${o.status === 'processing' ? `
                      <button onclick="generateReport(${o.id})" class="p-1.5 text-gray-400 hover:text-green-600" title="Generate Report">
                        <i class="fas fa-file-alt"></i>
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
            ${adminState.orders.length === 0 ? '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">No orders yet. <a href="/" class="text-brand-600 hover:underline">Create one</a></td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderRow(o) {
  return `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="window.location='/order/${o.id}'">
      <td class="px-4 py-3 font-mono text-xs font-medium text-brand-600">${o.order_number}</td>
      <td class="px-4 py-3 text-gray-600 max-w-[200px] truncate">${o.property_address}</td>
      <td class="px-4 py-3">${tierBadge(o.service_tier)}</td>
      <td class="px-4 py-3 font-medium">$${o.price}</td>
      <td class="px-4 py-3">${statusBadge(o.status)}</td>
      <td class="px-4 py-3 text-gray-500 text-xs">${new Date(o.created_at).toLocaleDateString()}</td>
    </tr>
  `;
}

// ============================================================
// COMPANIES TAB
// ============================================================
function renderCompaniesTab() {
  return `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-semibold text-gray-700"><i class="fas fa-building mr-2 text-brand-500"></i>Customer Companies (${adminState.companies.length})</h3>
        <button onclick="showAddCompanyForm()" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <i class="fas fa-plus mr-1"></i>Add Company
        </button>
      </div>

      <!-- Add Company Form (hidden by default) -->
      <div id="addCompanyForm" class="hidden px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div class="grid md:grid-cols-2 gap-3">
          <input type="text" id="newCompName" placeholder="Company Name *" class="px-3 py-2 border rounded-lg text-sm" />
          <input type="text" id="newCompContact" placeholder="Contact Name *" class="px-3 py-2 border rounded-lg text-sm" />
          <input type="email" id="newCompEmail" placeholder="Email *" class="px-3 py-2 border rounded-lg text-sm" />
          <input type="tel" id="newCompPhone" placeholder="Phone" class="px-3 py-2 border rounded-lg text-sm" />
          <input type="text" id="newCompCity" placeholder="City" class="px-3 py-2 border rounded-lg text-sm" />
          <input type="text" id="newCompProvince" placeholder="Province" class="px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div class="mt-3 flex space-x-2">
          <button onclick="addCompany()" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm">Save</button>
          <button onclick="hideAddCompanyForm()" class="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Company</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Contact</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Email</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Location</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${adminState.companies.map(c => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-800">${c.company_name}</td>
                <td class="px-4 py-3 text-gray-600">${c.contact_name}</td>
                <td class="px-4 py-3 text-gray-600">${c.email}</td>
                <td class="px-4 py-3 text-gray-600">${c.phone || '-'}</td>
                <td class="px-4 py-3 text-gray-600">${[c.city, c.province].filter(Boolean).join(', ') || '-'}</td>
              </tr>
            `).join('')}
            ${adminState.companies.length === 0 ? '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No customer companies registered yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function showAddCompanyForm() {
  document.getElementById('addCompanyForm')?.classList.remove('hidden');
}
function hideAddCompanyForm() {
  document.getElementById('addCompanyForm')?.classList.add('hidden');
}

async function addCompany() {
  const name = document.getElementById('newCompName')?.value;
  const contact = document.getElementById('newCompContact')?.value;
  const email = document.getElementById('newCompEmail')?.value;
  const phone = document.getElementById('newCompPhone')?.value;
  const city = document.getElementById('newCompCity')?.value;
  const province = document.getElementById('newCompProvince')?.value;

  if (!name || !contact || !email) {
    alert('Company name, contact name, and email are required');
    return;
  }

  try {
    const res = await fetch('/api/companies/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: name, contact_name: contact, email, phone, city, province })
    });
    if (res.ok) {
      await loadDashboard();
      renderAdmin();
    }
  } catch (e) {
    alert('Failed to add company: ' + e.message);
  }
}

// ============================================================
// ACTIVITY TAB
// ============================================================
function renderActivityTab(d) {
  const activities = d?.recent_activity || [];
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="font-semibold text-gray-700 mb-4"><i class="fas fa-history mr-2 text-brand-500"></i>Recent Activity</h3>
      <div class="space-y-3">
        ${activities.map(a => `
          <div class="flex items-start space-x-3 py-2 border-b border-gray-100 last:border-0">
            <div class="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <i class="fas ${getActivityIcon(a.action)} text-brand-600 text-xs"></i>
            </div>
            <div>
              <p class="text-sm text-gray-700 font-medium">${formatAction(a.action)}</p>
              <p class="text-xs text-gray-500">${a.details || ''}</p>
              <p class="text-xs text-gray-400 mt-0.5">${new Date(a.created_at).toLocaleString()}</p>
            </div>
          </div>
        `).join('')}
        ${activities.length === 0 ? '<p class="text-center text-gray-400 py-4">No activity recorded yet</p>' : ''}
      </div>
    </div>
  `;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function tierBadge(tier) {
  const map = {
    immediate: '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium"><i class="fas fa-rocket mr-0.5"></i>Immediate</span>',
    urgent: '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium"><i class="fas fa-bolt mr-0.5"></i>Urgent</span>',
    regular: '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium"><i class="fas fa-clock mr-0.5"></i>Regular</span>'
  };
  return map[tier] || tier;
}

function statusBadge(status) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-blue-100 text-blue-800',
    processing: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-purple-100 text-purple-800',
    cancelled: 'bg-gray-100 text-gray-600'
  };
  return `<span class="px-2 py-0.5 ${map[status] || 'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${status}</span>`;
}

function paymentBadge(status) {
  const map = {
    unpaid: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    refunded: 'bg-purple-100 text-purple-800'
  };
  return `<span class="px-2 py-0.5 ${map[status] || 'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${status}</span>`;
}

function getActivityIcon(action) {
  const map = {
    order_created: 'fa-plus-circle',
    payment_received: 'fa-dollar-sign',
    report_generated: 'fa-file-alt',
    setting_updated: 'fa-cog',
    company_added: 'fa-building'
  };
  return map[action] || 'fa-circle';
}

function formatAction(action) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function generateReport(orderId) {
  try {
    const res = await fetch(`/api/reports/${orderId}/generate`, { method: 'POST' });
    if (res.ok) {
      alert('Report generated successfully!');
      await loadDashboard();
      renderAdmin();
    }
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}
