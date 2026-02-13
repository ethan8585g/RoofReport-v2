// ============================================================
// Customer Dashboard — My Orders, Reports, Invoices
// ============================================================

const custState = {
  loading: true,
  activeTab: 'orders',
  orders: [],
  invoices: [],
  customer: null
};

function getToken() {
  return localStorage.getItem('rc_customer_token') || '';
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCustomerData();
  renderCustomerDashboard();
});

async function loadCustomerData() {
  custState.loading = true;
  try {
    const [profileRes, ordersRes, invoicesRes] = await Promise.all([
      fetch('/api/customer/me', { headers: authHeaders() }),
      fetch('/api/customer/orders', { headers: authHeaders() }),
      fetch('/api/customer/invoices', { headers: authHeaders() })
    ]);

    if (profileRes.ok) {
      const profileData = await profileRes.json();
      custState.customer = profileData.customer;
      // Update localStorage with fresh data
      localStorage.setItem('rc_customer', JSON.stringify(profileData.customer));
    } else {
      // Session expired
      localStorage.removeItem('rc_customer');
      localStorage.removeItem('rc_customer_token');
      window.location.href = '/customer/login';
      return;
    }

    if (ordersRes.ok) {
      const ordersData = await ordersRes.json();
      custState.orders = ordersData.orders || [];
    }
    if (invoicesRes.ok) {
      const invoicesData = await invoicesRes.json();
      custState.invoices = invoicesData.invoices || [];
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
  custState.loading = false;
}

function renderCustomerDashboard() {
  const root = document.getElementById('customer-root');
  if (!root) return;

  if (custState.loading) {
    root.innerHTML = `
      <div class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div>
        <span class="ml-3 text-gray-500">Loading your dashboard...</span>
      </div>`;
    return;
  }

  const c = custState.customer;
  const tabs = [
    { id: 'orders', label: 'My Orders', icon: 'fa-clipboard-list', count: custState.orders.length },
    { id: 'invoices', label: 'Invoices', icon: 'fa-file-invoice-dollar', count: custState.invoices.length },
    { id: 'profile', label: 'My Profile', icon: 'fa-user-cog', count: null }
  ];

  root.innerHTML = `
    <!-- Welcome Banner -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          ${c?.google_avatar ? `<img src="${c.google_avatar}" class="w-14 h-14 rounded-full border-2 border-brand-200" alt="">` :
            `<div class="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center">
              <i class="fas fa-user text-brand-500 text-2xl"></i>
            </div>`}
          <div>
            <h2 class="text-xl font-bold text-gray-800">Welcome back, ${c?.name || 'Customer'}!</h2>
            <p class="text-sm text-gray-500">${c?.company_name ? c.company_name + ' &middot; ' : ''}${c?.email || ''}</p>
          </div>
        </div>
        <div class="flex gap-3">
          <div class="text-center px-4 py-2 bg-brand-50 rounded-lg">
            <p class="text-lg font-bold text-brand-700">${custState.orders.length}</p>
            <p class="text-xs text-gray-500">Orders</p>
          </div>
          <div class="text-center px-4 py-2 bg-green-50 rounded-lg">
            <p class="text-lg font-bold text-green-700">${custState.orders.filter(o => o.status === 'completed').length}</p>
            <p class="text-xs text-gray-500">Reports Ready</p>
          </div>
          <div class="text-center px-4 py-2 bg-amber-50 rounded-lg">
            <p class="text-lg font-bold text-amber-700">${custState.invoices.filter(i => i.status === 'sent' || i.status === 'viewed').length}</p>
            <p class="text-xs text-gray-500">Invoices Due</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex space-x-1 bg-white rounded-xl border border-gray-200 p-1 mb-8 overflow-x-auto">
      ${tabs.map(t => `
        <button onclick="switchCustTab('${t.id}')"
          class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
          ${custState.activeTab === t.id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}">
          <i class="fas ${t.icon} mr-1"></i>${t.label}
          ${t.count !== null ? `<span class="ml-1 px-1.5 py-0.5 rounded-full text-xs ${custState.activeTab === t.id ? 'bg-white/20' : 'bg-gray-200'}">${t.count}</span>` : ''}
        </button>
      `).join('')}
    </div>

    <!-- Tab Content -->
    <div>
      ${custState.activeTab === 'orders' ? renderCustOrders() : ''}
      ${custState.activeTab === 'invoices' ? renderCustInvoices() : ''}
      ${custState.activeTab === 'profile' ? renderCustProfile() : ''}
    </div>
  `;
}

function switchCustTab(tab) {
  custState.activeTab = tab;
  renderCustomerDashboard();
}

// ============================================================
// ORDERS TAB
// ============================================================
function renderCustOrders() {
  const orders = custState.orders;
  
  if (orders.length === 0) {
    return `
      <div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-clipboard-list text-gray-400 text-2xl"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-700 mb-2">No Orders Yet</h3>
        <p class="text-gray-500 mb-6">Your roof measurement report orders will appear here.</p>
        <p class="text-sm text-gray-400">Contact us to order a roof measurement report.</p>
      </div>`;
  }

  return `
    <div class="space-y-4">
      ${orders.map(o => `
        <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span class="font-mono text-sm font-bold text-brand-600">${o.order_number}</span>
                ${getStatusBadge(o.status)}
              </div>
              <p class="text-gray-700 font-medium"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>${o.property_address}</p>
              <p class="text-sm text-gray-500 mt-1">
                ${o.property_city ? o.property_city + ', ' : ''}${o.property_province || ''} ${o.property_postal_code || ''}
              </p>
              <div class="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span><i class="fas fa-calendar mr-1"></i>${new Date(o.created_at).toLocaleDateString()}</span>
                <span>${getTierLabel(o.service_tier)}</span>
                <span><i class="fas fa-dollar-sign mr-1"></i>$${o.price} CAD</span>
                ${o.roof_area_sqft ? `<span><i class="fas fa-ruler-combined mr-1"></i>${Math.round(o.roof_area_sqft)} sq ft</span>` : ''}
              </div>
            </div>
            <div class="flex flex-col items-end gap-2">
              ${o.report_status === 'completed' ? `
                <a href="/api/reports/${o.id}/html" target="_blank" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
                  <i class="fas fa-file-alt mr-1"></i>View Report
                </a>
              ` : o.status === 'processing' ? `
                <span class="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium">
                  <i class="fas fa-spinner fa-spin mr-1"></i>Generating...
                </span>
              ` : `
                <span class="px-4 py-2 bg-gray-50 text-gray-500 rounded-lg text-sm font-medium">
                  <i class="fas fa-clock mr-1"></i>Pending
                </span>
              `}
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ============================================================
// INVOICES TAB
// ============================================================
function renderCustInvoices() {
  const invoices = custState.invoices;

  if (invoices.length === 0) {
    return `
      <div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-file-invoice-dollar text-gray-400 text-2xl"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-700 mb-2">No Invoices</h3>
        <p class="text-gray-500">Your invoices from Reuse Canada will appear here.</p>
      </div>`;
  }

  // Summary
  const totalDue = invoices.filter(i => ['sent','viewed','overdue'].includes(i.status)).reduce((s,i) => s + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s,i) => s + (i.total || 0), 0);

  return `
    <!-- Invoice Summary -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p class="text-2xl font-bold text-amber-600">$${totalDue.toFixed(2)}</p>
        <p class="text-xs text-gray-500 mt-1">Amount Due</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p class="text-2xl font-bold text-green-600">$${totalPaid.toFixed(2)}</p>
        <p class="text-xs text-gray-500 mt-1">Total Paid</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p class="text-2xl font-bold text-gray-700">${invoices.length}</p>
        <p class="text-xs text-gray-500 mt-1">Total Invoices</p>
      </div>
    </div>

    <!-- Invoice List -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Invoice #</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Description</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Due</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500">Amount</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${invoices.map(inv => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-xs font-bold text-brand-600">${inv.invoice_number}</td>
              <td class="px-4 py-3 text-gray-600">${inv.property_address || inv.order_number || 'Roof Report'}</td>
              <td class="px-4 py-3 text-gray-500 text-xs">${inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : '-'}</td>
              <td class="px-4 py-3 text-gray-500 text-xs">${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
              <td class="px-4 py-3 text-right font-bold text-gray-800">$${(inv.total || 0).toFixed(2)}</td>
              <td class="px-4 py-3">${getInvoiceStatusBadge(inv.status)}</td>
              <td class="px-4 py-3">
                <a href="/customer/invoice/${inv.id}" class="text-brand-600 hover:text-brand-700 text-sm font-medium">
                  <i class="fas fa-eye mr-1"></i>View
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// ============================================================
// PROFILE TAB
// ============================================================
function renderCustProfile() {
  const c = custState.customer || {};
  return `
    <div class="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl mx-auto">
      <div class="flex items-center gap-4 mb-6">
        ${c.google_avatar ? `<img src="${c.google_avatar}" class="w-16 h-16 rounded-full border-2 border-brand-200">` :
          `<div class="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center">
            <i class="fas fa-user text-brand-500 text-2xl"></i>
          </div>`}
        <div>
          <h3 class="text-xl font-bold text-gray-800">${c.name || ''}</h3>
          <p class="text-sm text-gray-500">${c.email || ''}</p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" id="profName" value="${c.name || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input type="text" id="profCompany" value="${c.company_name || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" id="profPhone" value="${c.phone || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" disabled value="${c.email || ''}" class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input type="text" id="profAddress" value="${c.address || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input type="text" id="profCity" value="${c.city || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
            <input type="text" id="profProvince" value="${c.province || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input type="text" id="profPostal" value="${c.postal_code || ''}" class="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500">
          </div>
        </div>
      </div>

      <div id="profMsg" class="hidden mt-4 p-3 rounded-lg text-sm"></div>

      <button onclick="saveProfile()" class="w-full mt-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg">
        <i class="fas fa-save mr-2"></i>Save Profile
      </button>
    </div>`;
}

async function saveProfile() {
  const msg = document.getElementById('profMsg');
  msg.classList.add('hidden');
  try {
    const res = await fetch('/api/customer/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        name: document.getElementById('profName').value.trim(),
        company_name: document.getElementById('profCompany').value.trim(),
        phone: document.getElementById('profPhone').value.trim(),
        address: document.getElementById('profAddress').value.trim(),
        city: document.getElementById('profCity').value.trim(),
        province: document.getElementById('profProvince').value.trim(),
        postal_code: document.getElementById('profPostal').value.trim()
      })
    });
    if (res.ok) {
      msg.className = 'mt-4 p-3 rounded-lg text-sm bg-green-50 text-green-700';
      msg.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Profile updated successfully!';
      msg.classList.remove('hidden');
      await loadCustomerData();
    } else {
      const data = await res.json();
      msg.className = 'mt-4 p-3 rounded-lg text-sm bg-red-50 text-red-700';
      msg.textContent = data.error || 'Failed to update profile';
      msg.classList.remove('hidden');
    }
  } catch(e) {
    msg.className = 'mt-4 p-3 rounded-lg text-sm bg-red-50 text-red-700';
    msg.textContent = 'Network error. Please try again.';
    msg.classList.remove('hidden');
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getStatusBadge(status) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-blue-100 text-blue-700',
    processing: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600'
  };
  return `<span class="px-2.5 py-1 ${map[status] || 'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${status}</span>`;
}

function getTierLabel(tier) {
  const map = {
    immediate: '<i class="fas fa-rocket text-red-400 mr-1"></i>Immediate',
    urgent: '<i class="fas fa-bolt text-amber-400 mr-1"></i>Urgent',
    regular: '<i class="fas fa-clock text-green-400 mr-1"></i>Regular'
  };
  return map[tier] || tier;
}

function getInvoiceStatusBadge(status) {
  const map = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-indigo-100 text-indigo-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    refunded: 'bg-purple-100 text-purple-700'
  };
  return `<span class="px-2.5 py-1 ${map[status] || 'bg-gray-100 text-gray-600'} rounded-full text-xs font-medium capitalize">${status}</span>`;
}
