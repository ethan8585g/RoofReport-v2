// ============================================================
// CRM Module — Unified frontend for all CRM sub-pages
// Detects which module to render via data-module attribute
// ============================================================

(function() {
  'use strict';

  const root = document.getElementById('crm-root');
  if (!root) return;
  const MODULE = root.getAttribute('data-module') || 'reports';

  function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
  function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }
  function authHeadersOnly() { return { 'Authorization': 'Bearer ' + getToken() }; }

  // ============================================================
  // ROUTER — Render the correct module
  // ============================================================
  const modules = {
    reports: { init: initReports, title: 'Roof Report History' },
    customers: { init: initCustomers, title: 'My Customers' },
    invoices: { init: initInvoices, title: 'Invoices' },
    proposals: { init: initProposals, title: 'Proposals & Estimates' },
    jobs: { init: initJobs, title: 'Job Management' },
    pipeline: { init: initPipeline, title: 'Sales Pipeline' },
    d2d: { init: initD2D, title: 'D2D Manager' }
  };

  const mod = modules[MODULE];
  if (mod) { mod.init(); } else { root.innerHTML = '<p class="text-red-500">Unknown module: ' + MODULE + '</p>'; }

  // ============================================================
  // HELPER: Status badge
  // ============================================================
  function badge(status, map) {
    var m = map || { active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-600', lead: 'bg-blue-100 text-blue-700', draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', viewed: 'bg-indigo-100 text-indigo-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500', accepted: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700', expired: 'bg-yellow-100 text-yellow-700', scheduled: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700', postponed: 'bg-gray-100 text-gray-600' };
    return '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ' + (m[status] || 'bg-gray-100 text-gray-600') + '">' + (status || 'unknown').replace(/_/g, ' ') + '</span>';
  }

  function money(v) { return '$' + (parseFloat(v) || 0).toFixed(2); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '-'; }

  // ============================================================
  // MODAL HELPER
  // ============================================================
  function showModal(title, bodyHtml, onSave, saveLabel) {
    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'crmModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">' +
      '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h3 class="font-bold text-gray-800">' + title + '</h3><button onclick="document.getElementById(\'crmModal\').remove()" class="text-gray-400 hover:text-gray-600 text-lg">&times;</button></div>' +
      '<div class="p-6" id="modalBody">' + bodyHtml + '</div>' +
      (onSave ? '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2"><button onclick="document.getElementById(\'crmModal\').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button><button id="modalSaveBtn" class="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700">' + (saveLabel || 'Save') + '</button></div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    if (onSave) { document.getElementById('modalSaveBtn').addEventListener('click', function() { onSave(); }); }
    return overlay;
  }

  function closeModal() { var m = document.getElementById('crmModal'); if (m) m.remove(); }

  // ============================================================
  // TOAST HELPER
  // ============================================================
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'fixed bottom-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ' + (type === 'error' ? 'bg-red-600' : 'bg-green-600');
    t.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle') + ' mr-2"></i>' + msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 3000);
  }

  // ============================================================
  // SELECT: Customer picker dropdown HTML
  // ============================================================
  function customerSelectHTML(customers, selectedId, fieldId) {
    var html = '<select id="' + (fieldId || 'selCustomer') + '" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500"><option value="">Select a customer...</option>';
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      html += '<option value="' + c.id + '"' + (c.id == selectedId ? ' selected' : '') + '>' + c.name + (c.company ? ' (' + c.company + ')' : '') + '</option>';
    }
    html += '</select>';
    return html;
  }

  // ============================================================
  // MODULE: REPORTS
  // ============================================================
  function initReports() {
    root.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500 mx-auto mb-3"></div><p class="text-gray-500 text-sm">Loading reports...</p></div>';
    fetch('/api/customer/orders', { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var orders = (data.orders || []).filter(function(o) { return o.report_status === 'completed' || o.status === 'completed'; });
        renderReports(orders);
      })
      .catch(function() { root.innerHTML = '<p class="text-red-500">Failed to load reports.</p>'; });
  }

  function renderReports(orders) {
    if (orders.length === 0) {
      root.innerHTML = '<div class="bg-white rounded-xl border p-12 text-center"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-file-alt text-gray-400 text-2xl"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">No Reports Yet</h3><p class="text-gray-500 mb-6">Order your first roof measurement to see reports here.</p><a href="/customer/order" class="inline-block bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-8 rounded-xl"><i class="fas fa-plus mr-2"></i>Order a Report</a></div>';
      return;
    }
    var html = '<div class="flex items-center justify-between mb-4"><h2 class="text-lg font-bold text-gray-800"><i class="fas fa-file-alt text-brand-500 mr-2"></i>Roof Report History (' + orders.length + ')</h2><a href="/customer/order" class="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700"><i class="fas fa-plus mr-1"></i>New Report</a></div><div class="space-y-3">';
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      html += '<div class="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"><div class="flex items-start justify-between"><div class="min-w-0"><div class="flex items-center gap-2 mb-1"><span class="font-mono text-xs font-bold text-brand-600">' + o.order_number + '</span>' + badge(o.status) + '</div><p class="text-gray-700 font-medium text-sm"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i>' + o.property_address + '</p><div class="flex items-center gap-3 mt-2 text-xs text-gray-400"><span><i class="fas fa-calendar mr-1"></i>' + fmtDate(o.created_at) + '</span>' + (o.roof_area_sqft ? '<span><i class="fas fa-ruler-combined mr-1"></i>' + Math.round(o.roof_area_sqft) + ' sq ft</span>' : '') + '</div></div><div class="flex flex-col items-end gap-2 flex-shrink-0 ml-4"><a href="/api/reports/' + o.id + '/html" target="_blank" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"><i class="fas fa-file-alt mr-1"></i>View Report</a><a href="/api/reports/' + o.id + '/pdf" target="_blank" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"><i class="fas fa-download mr-1"></i>PDF</a></div></div></div>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  // ============================================================
  // MODULE: CUSTOMERS
  // ============================================================
  var customersData = [];
  function initCustomers() {
    root.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500 mx-auto mb-3"></div></div>';
    loadCustomers();
  }

  function loadCustomers(search) {
    var url = '/api/crm/customers';
    if (search) url += '?search=' + encodeURIComponent(search);
    fetch(url, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) { customersData = data.customers || []; renderCustomers(data); })
      .catch(function() { root.innerHTML = '<p class="text-red-500">Failed to load customers.</p>'; });
  }

  function renderCustomers(data) {
    var customers = data.customers || [];
    var stats = data.stats || {};
    var html = '<div class="flex items-center justify-between mb-5 flex-wrap gap-3"><div><h2 class="text-lg font-bold text-gray-800"><i class="fas fa-users text-violet-500 mr-2"></i>My Customers (' + (stats.total || 0) + ')</h2><p class="text-xs text-gray-500 mt-0.5">' + (stats.active_count || 0) + ' active</p></div><div class="flex items-center gap-2"><input type="text" id="custSearch" placeholder="Search customers..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-brand-500" onkeyup="if(event.key===\'Enter\')window._crmSearchCustomers()"><button onclick="window._crmAddCustomer()" class="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700"><i class="fas fa-plus mr-1"></i>Add Customer</button></div></div>';

    if (customers.length === 0) {
      html += '<div class="bg-white rounded-xl border p-12 text-center"><div class="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-users text-violet-400 text-2xl"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">No Customers Yet</h3><p class="text-gray-500 mb-4">Add your first client to start managing leads & invoices.</p><button onclick="window._crmAddCustomer()" class="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-violet-700"><i class="fas fa-plus mr-2"></i>Add First Customer</button></div>';
    } else {
      html += '<div class="bg-white rounded-xl border overflow-hidden"><table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Name</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Company</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Phone</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Email</th><th class="px-4 py-3 text-center text-xs font-semibold text-gray-500">Status</th><th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Revenue</th><th class="px-4 py-3"></th></tr></thead><tbody class="divide-y divide-gray-50">';
      for (var i = 0; i < customers.length; i++) {
        var c = customers[i];
        html += '<tr class="hover:bg-gray-50 cursor-pointer" onclick="window._crmViewCustomer(' + c.id + ')"><td class="px-4 py-3 font-medium text-gray-800">' + c.name + '</td><td class="px-4 py-3 text-gray-500 hidden md:table-cell">' + (c.company || '-') + '</td><td class="px-4 py-3 text-gray-500 hidden lg:table-cell">' + (c.phone || '-') + '</td><td class="px-4 py-3 text-gray-500 hidden lg:table-cell">' + (c.email || '-') + '</td><td class="px-4 py-3 text-center">' + badge(c.status) + '</td><td class="px-4 py-3 text-right font-semibold text-gray-700">' + money(c.lifetime_value) + '</td><td class="px-4 py-3 text-right"><button onclick="event.stopPropagation();window._crmEditCustomer(' + c.id + ')" class="text-gray-400 hover:text-brand-600"><i class="fas fa-pencil-alt"></i></button></td></tr>';
      }
      html += '</tbody></table></div>';
    }
    root.innerHTML = html;
  }

  // Customer form HTML
  function customerFormHTML(c) {
    c = c || {};
    return '<div class="space-y-3">' +
      '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Name *</label><input type="text" id="cfName" value="' + (c.name || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Company</label><input type="text" id="cfCompany" value="' + (c.company || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"></div></div>' +
      '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Email</label><input type="email" id="cfEmail" value="' + (c.email || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Phone</label><input type="tel" id="cfPhone" value="' + (c.phone || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"></div></div>' +
      '<div><label class="block text-xs font-medium text-gray-600 mb-1">Address</label><input type="text" id="cfAddress" value="' + (c.address || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"></div>' +
      '<div class="grid grid-cols-3 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">City</label><input type="text" id="cfCity" value="' + (c.city || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Province</label><input type="text" id="cfProvince" value="' + (c.province || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Postal Code</label><input type="text" id="cfPostal" value="' + (c.postal_code || '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div></div>' +
      '<div><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea id="cfNotes" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">' + (c.notes || '') + '</textarea></div>' +
      '<div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label><select id="cfStatus" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="active"' + (c.status === 'active' ? ' selected' : '') + '>Active</option><option value="lead"' + (c.status === 'lead' ? ' selected' : '') + '>Lead</option><option value="inactive"' + (c.status === 'inactive' ? ' selected' : '') + '>Inactive</option></select></div>' +
      '</div>';
  }

  function getCustomerFormData() {
    return {
      name: document.getElementById('cfName').value.trim(),
      company: document.getElementById('cfCompany').value.trim(),
      email: document.getElementById('cfEmail').value.trim(),
      phone: document.getElementById('cfPhone').value.trim(),
      address: document.getElementById('cfAddress').value.trim(),
      city: document.getElementById('cfCity').value.trim(),
      province: document.getElementById('cfProvince').value.trim(),
      postal_code: document.getElementById('cfPostal').value.trim(),
      notes: document.getElementById('cfNotes').value.trim(),
      status: document.getElementById('cfStatus').value
    };
  }

  window._crmSearchCustomers = function() {
    var s = document.getElementById('custSearch');
    loadCustomers(s ? s.value.trim() : '');
  };

  window._crmAddCustomer = function() {
    showModal('Add New Customer', customerFormHTML(), function() {
      var data = getCustomerFormData();
      if (!data.name) { toast('Customer name is required.', 'error'); return; }
      fetch('/api/crm/customers', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) })
        .then(function(r) { return r.json(); })
        .then(function(res) { if (res.success) { closeModal(); toast('Customer added!'); loadCustomers(); } else { toast(res.error || 'Failed', 'error'); } })
        .catch(function() { toast('Network error', 'error'); });
    }, 'Add Customer');
  };

  window._crmEditCustomer = function(id) {
    fetch('/api/crm/customers/' + id, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var c = data.customer;
        showModal('Edit Customer', customerFormHTML(c), function() {
          var fd = getCustomerFormData();
          if (!fd.name) { toast('Name required', 'error'); return; }
          fetch('/api/crm/customers/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(fd) })
            .then(function(r) { return r.json(); })
            .then(function(res) { if (res.success) { closeModal(); toast('Customer updated!'); loadCustomers(); } else { toast(res.error || 'Failed', 'error'); } });
        }, 'Save Changes');
      });
  };

  window._crmViewCustomer = function(id) {
    fetch('/api/crm/customers/' + id, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var c = data.customer;
        var invs = data.invoices || [];
        var props = data.proposals || [];
        var jobs = data.jobs || [];
        var body = '<div class="space-y-4">' +
          '<div class="flex items-center gap-3 mb-2"><div class="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-violet-500 text-lg"></i></div><div><h3 class="font-bold text-gray-800">' + c.name + '</h3><p class="text-xs text-gray-500">' + (c.company || '') + (c.email ? ' &middot; ' + c.email : '') + '</p></div></div>' +
          (c.phone ? '<p class="text-sm text-gray-600"><i class="fas fa-phone mr-2 text-gray-400"></i>' + c.phone + '</p>' : '') +
          (c.address ? '<p class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-2 text-gray-400"></i>' + c.address + (c.city ? ', ' + c.city : '') + (c.province ? ', ' + c.province : '') + (c.postal_code ? ' ' + c.postal_code : '') + '</p>' : '') +
          (c.notes ? '<p class="text-sm text-gray-500 italic">' + c.notes + '</p>' : '');

        if (invs.length > 0) {
          body += '<div class="pt-3 border-t"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Invoices (' + invs.length + ')</h4><div class="space-y-1">';
          for (var i = 0; i < Math.min(invs.length, 5); i++) {
            body += '<div class="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2"><span class="font-mono font-bold">' + invs[i].invoice_number + '</span><span>' + money(invs[i].total) + '</span>' + badge(invs[i].status) + '</div>';
          }
          body += '</div></div>';
        }
        if (props.length > 0) {
          body += '<div class="pt-3 border-t"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Proposals (' + props.length + ')</h4><div class="space-y-1">';
          for (var j = 0; j < Math.min(props.length, 5); j++) {
            body += '<div class="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2"><span class="font-medium">' + props[j].title + '</span><span>' + money(props[j].total_amount) + '</span>' + badge(props[j].status) + '</div>';
          }
          body += '</div></div>';
        }
        body += '</div>';
        showModal(c.name, body);
      });
  };

  window._crmDeleteCustomer = function(id) {
    if (!confirm('Delete this customer?')) return;
    fetch('/api/crm/customers/' + id, { method: 'DELETE', headers: authHeadersOnly() })
      .then(function() { toast('Customer deleted'); loadCustomers(); });
  };

  // ============================================================
  // MODULE: INVOICES
  // ============================================================
  var invoicesData = [];
  function initInvoices() {
    root.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500 mx-auto mb-3"></div></div>';
    loadInvoices();
  }

  function loadInvoices(statusFilter) {
    var url = '/api/crm/invoices';
    if (statusFilter) url += '?status=' + statusFilter;
    fetch(url, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) { invoicesData = data.invoices || []; renderInvoices(data); })
      .catch(function() { root.innerHTML = '<p class="text-red-500">Failed to load invoices.</p>'; });
  }

  function renderInvoices(data) {
    var invoices = data.invoices || [];
    var stats = data.stats || {};
    var html = '<div class="flex items-center justify-between mb-5 flex-wrap gap-3"><div><h2 class="text-lg font-bold text-gray-800"><i class="fas fa-file-invoice-dollar text-emerald-500 mr-2"></i>Invoices</h2></div><button onclick="window._crmNewInvoice()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700"><i class="fas fa-plus mr-1"></i>New Invoice</button></div>';

    // Stats cards
    html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-gray-800">' + (stats.total || 0) + '</p><p class="text-[10px] text-gray-500">Total</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-green-600">' + money(stats.total_paid) + '</p><p class="text-[10px] text-gray-500">Collected</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-amber-600">' + money(stats.total_owing) + '</p><p class="text-[10px] text-gray-500">Outstanding</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-red-600">' + money(stats.total_overdue) + '</p><p class="text-[10px] text-gray-500">Overdue</p></div></div>';

    // Filter tabs
    html += '<div class="flex gap-1 mb-4 bg-white rounded-lg border p-1 overflow-x-auto">';
    var filters = [['','All'],['owing','Owing'],['paid','Paid']];
    for (var f = 0; f < filters.length; f++) {
      html += '<button onclick="window._crmFilterInvoices(\'' + filters[f][0] + '\')" class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100 ' + (((!window._invFilter && !filters[f][0]) || window._invFilter === filters[f][0]) ? 'bg-brand-600 text-white' : 'text-gray-600') + '">' + filters[f][1] + '</button>';
    }
    html += '</div>';

    if (invoices.length === 0) {
      html += '<div class="bg-white rounded-xl border p-12 text-center"><div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-file-invoice-dollar text-emerald-400 text-2xl"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">No Invoices Yet</h3><p class="text-gray-500 mb-4">Create your first invoice to start tracking payments.</p><button onclick="window._crmNewInvoice()" class="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-700"><i class="fas fa-plus mr-2"></i>Create Invoice</button></div>';
    } else {
      html += '<div class="bg-white rounded-xl border overflow-hidden"><table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Invoice #</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500">Customer</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Date</th><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Due</th><th class="px-4 py-3 text-center text-xs font-semibold text-gray-500">Status</th><th class="px-4 py-3 text-right text-xs font-semibold text-gray-500">Amount</th><th class="px-4 py-3"></th></tr></thead><tbody class="divide-y divide-gray-50">';
      for (var i = 0; i < invoices.length; i++) {
        var inv = invoices[i];
        html += '<tr class="hover:bg-gray-50"><td class="px-4 py-3 font-mono text-xs font-bold text-brand-600">' + inv.invoice_number + '</td><td class="px-4 py-3 text-gray-700">' + (inv.customer_name || 'N/A') + '</td><td class="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">' + fmtDate(inv.created_at) + '</td><td class="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">' + fmtDate(inv.due_date) + '</td><td class="px-4 py-3 text-center">' + badge(inv.status) + '</td><td class="px-4 py-3 text-right font-semibold">' + money(inv.total) + '</td><td class="px-4 py-3 text-right"><div class="flex items-center gap-1 justify-end">';
        if (inv.status === 'draft') html += '<button onclick="window._crmMarkInvoice(' + inv.id + ',\'sent\')" class="text-xs text-blue-600 hover:underline">Send</button>';
        if (inv.status !== 'paid' && inv.status !== 'cancelled') html += '<button onclick="window._crmMarkInvoice(' + inv.id + ',\'paid\')" class="text-xs text-green-600 hover:underline ml-2">Mark Paid</button>';
        html += '<button onclick="window._crmDeleteInvoice(' + inv.id + ')" class="text-gray-400 hover:text-red-500 ml-2"><i class="fas fa-trash text-xs"></i></button>';
        html += '</div></td></tr>';
      }
      html += '</tbody></table></div>';
    }
    root.innerHTML = html;
  }

  window._invFilter = '';
  window._crmFilterInvoices = function(status) { window._invFilter = status; loadInvoices(status); };

  window._crmNewInvoice = function() {
    // First load customers for the dropdown
    fetch('/api/crm/customers', { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var custs = data.customers || [];
        var body = '<div class="space-y-3">' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Customer *</label>' + customerSelectHTML(custs, '', 'invCustomer') + '</div>' +
          '<div id="invItems"><div class="invItemRow grid grid-cols-12 gap-2 items-end"><div class="col-span-6"><label class="block text-xs font-medium text-gray-600 mb-1">Description</label><input type="text" class="invDesc w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Roof installation"></div><div class="col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">Qty</label><input type="number" class="invQty w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" value="1"></div><div class="col-span-3"><label class="block text-xs font-medium text-gray-600 mb-1">Unit Price</label><input type="number" class="invPrice w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" placeholder="0.00"></div><div class="col-span-1"><button onclick="this.closest(\'.invItemRow\').remove()" class="text-red-400 hover:text-red-600 py-2"><i class="fas fa-times"></i></button></div></div></div>' +
          '<button onclick="window._crmAddInvItem()" class="text-brand-600 text-xs font-medium hover:underline"><i class="fas fa-plus mr-1"></i>Add Line Item</button>' +
          '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Due Date</label><input type="date" id="invDue" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Tax Rate (%)</label><input type="number" id="invTax" value="5" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.1"></div></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea id="invNotes" rows="2" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Optional notes..."></textarea></div></div>';

        showModal('Create Invoice', body, function() {
          var custId = document.getElementById('invCustomer').value;
          if (!custId) { toast('Select a customer', 'error'); return; }
          var rows = document.querySelectorAll('.invItemRow');
          var items = [];
          rows.forEach(function(r) {
            var desc = r.querySelector('.invDesc').value.trim();
            var qty = parseFloat(r.querySelector('.invQty').value) || 1;
            var price = parseFloat(r.querySelector('.invPrice').value) || 0;
            if (desc && price > 0) items.push({ description: desc, quantity: qty, unit_price: price });
          });
          if (items.length === 0) { toast('Add at least one line item', 'error'); return; }
          var payload = {
            crm_customer_id: parseInt(custId), items: items,
            due_date: document.getElementById('invDue').value || null,
            tax_rate: parseFloat(document.getElementById('invTax').value) || 5,
            notes: document.getElementById('invNotes').value.trim()
          };
          fetch('/api/crm/invoices', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(function(r) { return r.json(); })
            .then(function(res) { if (res.success) { closeModal(); toast('Invoice created!'); loadInvoices(); } else { toast(res.error || 'Failed', 'error'); } });
        }, 'Create Invoice');
      });
  };

  window._crmAddInvItem = function() {
    var container = document.getElementById('invItems');
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'invItemRow grid grid-cols-12 gap-2 items-end mt-2';
    row.innerHTML = '<div class="col-span-6"><input type="text" class="invDesc w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Description"></div><div class="col-span-2"><input type="number" class="invQty w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" value="1"></div><div class="col-span-3"><input type="number" class="invPrice w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" placeholder="0.00"></div><div class="col-span-1"><button onclick="this.closest(\'.invItemRow\').remove()" class="text-red-400 hover:text-red-600 py-2"><i class="fas fa-times"></i></button></div>';
    container.appendChild(row);
  };

  window._crmMarkInvoice = function(id, status) {
    fetch('/api/crm/invoices/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }) })
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res.success) { toast('Invoice marked as ' + status); loadInvoices(window._invFilter); } });
  };

  window._crmDeleteInvoice = function(id) {
    if (!confirm('Delete this invoice?')) return;
    fetch('/api/crm/invoices/' + id, { method: 'DELETE', headers: authHeadersOnly() })
      .then(function() { toast('Invoice deleted'); loadInvoices(window._invFilter); });
  };

  // ============================================================
  // MODULE: PROPOSALS
  // ============================================================
  function initProposals() {
    root.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500 mx-auto mb-3"></div></div>';
    loadProposals();
  }

  function loadProposals(statusFilter) {
    var url = '/api/crm/proposals';
    if (statusFilter) url += '?status=' + statusFilter;
    fetch(url, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) { renderProposals(data); })
      .catch(function() { root.innerHTML = '<p class="text-red-500">Failed to load proposals.</p>'; });
  }

  function renderProposals(data) {
    var proposals = data.proposals || [];
    var stats = data.stats || {};
    var html = '<div class="flex items-center justify-between mb-5 flex-wrap gap-3"><div><h2 class="text-lg font-bold text-gray-800"><i class="fas fa-file-signature text-amber-500 mr-2"></i>Proposals & Estimates</h2></div><button onclick="window._crmNewProposal()" class="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700"><i class="fas fa-plus mr-1"></i>New Proposal</button></div>';

    html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-gray-800">' + (stats.total || 0) + '</p><p class="text-[10px] text-gray-500">Total</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-amber-600">' + (stats.open_count || 0) + '</p><p class="text-[10px] text-gray-500">Open</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-green-600">' + money(stats.sold_value) + '</p><p class="text-[10px] text-gray-500">Sold Value</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-blue-600">' + money(stats.open_value) + '</p><p class="text-[10px] text-gray-500">Open Value</p></div></div>';

    // Filter
    html += '<div class="flex gap-1 mb-4 bg-white rounded-lg border p-1 overflow-x-auto">';
    var filters = [['','All'],['open','Open'],['sold','Sold']];
    for (var f = 0; f < filters.length; f++) {
      html += '<button onclick="window._crmFilterProposals(\'' + filters[f][0] + '\')" class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100 ' + (((!window._propFilter && !filters[f][0]) || window._propFilter === filters[f][0]) ? 'bg-brand-600 text-white' : 'text-gray-600') + '">' + filters[f][1] + '</button>';
    }
    html += '</div>';

    if (proposals.length === 0) {
      html += '<div class="bg-white rounded-xl border p-12 text-center"><div class="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-file-signature text-amber-400 text-2xl"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">No Proposals Yet</h3><p class="text-gray-500 mb-4">Create your first roof estimate or proposal.</p><button onclick="window._crmNewProposal()" class="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-amber-700"><i class="fas fa-plus mr-2"></i>Create Proposal</button></div>';
    } else {
      html += '<div class="space-y-3">';
      for (var i = 0; i < proposals.length; i++) {
        var p = proposals[i];
        html += '<div class="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"><div class="flex items-start justify-between"><div class="min-w-0"><div class="flex items-center gap-2 mb-1"><span class="font-mono text-xs font-bold text-amber-600">' + p.proposal_number + '</span>' + badge(p.status) + '</div><p class="text-gray-800 font-medium text-sm">' + p.title + '</p><p class="text-xs text-gray-500 mt-1"><i class="fas fa-user mr-1"></i>' + (p.customer_name || 'N/A') + (p.property_address ? ' &middot; <i class="fas fa-map-marker-alt mr-1"></i>' + p.property_address : '') + '</p></div><div class="flex flex-col items-end gap-1 flex-shrink-0 ml-4"><span class="text-lg font-black text-gray-800">' + money(p.total_amount) + '</span><div class="flex items-center gap-1">';
        if (p.status === 'draft') html += '<button onclick="window._crmMarkProposal(' + p.id + ',\'sent\')" class="text-xs text-blue-600 hover:underline">Send</button>';
        if (p.status !== 'accepted' && p.status !== 'declined') html += '<button onclick="window._crmMarkProposal(' + p.id + ',\'accepted\')" class="text-xs text-green-600 hover:underline">Won</button>';
        html += '<button onclick="window._crmDeleteProposal(' + p.id + ')" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash text-xs"></i></button>';
        html += '</div></div></div></div>';
      }
      html += '</div>';
    }
    root.innerHTML = html;
  }

  window._propFilter = '';
  window._crmFilterProposals = function(s) { window._propFilter = s; loadProposals(s); };

  window._crmNewProposal = function() {
    fetch('/api/crm/customers', { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var custs = data.customers || [];
        var body = '<div class="space-y-3">' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Customer *</label>' + customerSelectHTML(custs, '', 'propCustomer') + '</div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Title *</label><input type="text" id="propTitle" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. Full Roof Replacement"></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Property Address</label><input type="text" id="propAddress" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Scope of Work</label><textarea id="propScope" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Describe the work to be performed..."></textarea></div>' +
          '<div class="grid grid-cols-3 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Labor $</label><input type="number" id="propLabor" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" value="0"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Material $</label><input type="number" id="propMaterial" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" value="0"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Other $</label><input type="number" id="propOther" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" value="0"></div></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Valid Until</label><input type="date" id="propValid" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea id="propNotes" rows="2" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></textarea></div></div>';

        showModal('Create Proposal', body, function() {
          var custId = document.getElementById('propCustomer').value;
          var title = document.getElementById('propTitle').value.trim();
          if (!custId || !title) { toast('Customer and title required', 'error'); return; }
          var payload = {
            crm_customer_id: parseInt(custId), title: title,
            property_address: document.getElementById('propAddress').value.trim(),
            scope_of_work: document.getElementById('propScope').value.trim(),
            labor_cost: parseFloat(document.getElementById('propLabor').value) || 0,
            material_cost: parseFloat(document.getElementById('propMaterial').value) || 0,
            other_cost: parseFloat(document.getElementById('propOther').value) || 0,
            valid_until: document.getElementById('propValid').value || null,
            notes: document.getElementById('propNotes').value.trim()
          };
          fetch('/api/crm/proposals', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(function(r) { return r.json(); })
            .then(function(res) { if (res.success) { closeModal(); toast('Proposal created!'); loadProposals(); } else { toast(res.error || 'Failed', 'error'); } });
        }, 'Create Proposal');
      });
  };

  window._crmMarkProposal = function(id, status) {
    fetch('/api/crm/proposals/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }) })
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res.success) { toast('Proposal updated'); loadProposals(window._propFilter); } });
  };

  window._crmDeleteProposal = function(id) {
    if (!confirm('Delete this proposal?')) return;
    fetch('/api/crm/proposals/' + id, { method: 'DELETE', headers: authHeadersOnly() })
      .then(function() { toast('Proposal deleted'); loadProposals(window._propFilter); });
  };

  // ============================================================
  // MODULE: JOBS
  // ============================================================
  function initJobs() {
    root.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500 mx-auto mb-3"></div></div>';
    loadJobs();
  }

  function loadJobs(statusFilter) {
    var url = '/api/crm/jobs';
    if (statusFilter) url += '?status=' + statusFilter;
    fetch(url, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) { renderJobs(data); })
      .catch(function() { root.innerHTML = '<p class="text-red-500">Failed to load jobs.</p>'; });
  }

  function renderJobs(data) {
    var jobs = data.jobs || [];
    var stats = data.stats || {};
    var html = '<div class="flex items-center justify-between mb-5 flex-wrap gap-3"><div><h2 class="text-lg font-bold text-gray-800"><i class="fas fa-hard-hat text-orange-500 mr-2"></i>Job Management</h2></div><button onclick="window._crmNewJob()" class="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-700"><i class="fas fa-plus mr-1"></i>New Job</button></div>';

    html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-gray-800">' + (stats.total || 0) + '</p><p class="text-[10px] text-gray-500">Total Jobs</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-blue-600">' + (stats.scheduled || 0) + '</p><p class="text-[10px] text-gray-500">Scheduled</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-amber-600">' + (stats.in_progress || 0) + '</p><p class="text-[10px] text-gray-500">In Progress</p></div>' +
      '<div class="bg-white rounded-xl border p-4 text-center"><p class="text-2xl font-black text-green-600">' + (stats.completed || 0) + '</p><p class="text-[10px] text-gray-500">Completed</p></div></div>';

    // Filter tabs
    html += '<div class="flex gap-1 mb-4 bg-white rounded-lg border p-1 overflow-x-auto">';
    var filters = [['','All'],['scheduled','Scheduled'],['in_progress','In Progress'],['completed','Completed']];
    for (var f = 0; f < filters.length; f++) {
      html += '<button onclick="window._crmFilterJobs(\'' + filters[f][0] + '\')" class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100 ' + (((!window._jobFilter && !filters[f][0]) || window._jobFilter === filters[f][0]) ? 'bg-brand-600 text-white' : 'text-gray-600') + '">' + filters[f][1] + '</button>';
    }
    html += '</div>';

    if (jobs.length === 0) {
      html += '<div class="bg-white rounded-xl border p-12 text-center"><div class="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-hard-hat text-orange-400 text-2xl"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">No Jobs Scheduled</h3><p class="text-gray-500 mb-4">Schedule your first roofing job.</p><button onclick="window._crmNewJob()" class="bg-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-700"><i class="fas fa-plus mr-2"></i>Schedule Job</button></div>';
    } else {
      html += '<div class="space-y-3">';
      for (var i = 0; i < jobs.length; i++) {
        var j = jobs[i];
        var jobIcon = j.status === 'completed' ? 'fa-check-circle text-green-500' : j.status === 'in_progress' ? 'fa-spinner fa-spin text-amber-500' : 'fa-calendar-day text-blue-500';
        html += '<div class="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"><div class="flex items-start justify-between"><div class="flex items-start gap-3 min-w-0"><div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50"><i class="fas ' + jobIcon + '"></i></div><div class="min-w-0"><div class="flex items-center gap-2 mb-1"><span class="font-mono text-xs font-bold text-orange-600">' + j.job_number + '</span>' + badge(j.status) + '</div><p class="text-gray-800 font-medium text-sm">' + j.title + '</p><div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500"><span><i class="fas fa-calendar mr-1"></i>' + fmtDate(j.scheduled_date) + (j.scheduled_time ? ' ' + j.scheduled_time : '') + '</span>' + (j.customer_name ? '<span><i class="fas fa-user mr-1"></i>' + j.customer_name + '</span>' : '') + (j.property_address ? '<span><i class="fas fa-map-marker-alt mr-1"></i>' + j.property_address + '</span>' : '') + (j.crew_size ? '<span><i class="fas fa-users mr-1"></i>' + j.crew_size + ' crew</span>' : '') + '</div></div></div><div class="flex flex-col items-end gap-1 flex-shrink-0 ml-4">';
        if (j.status === 'scheduled') html += '<button onclick="window._crmMarkJob(' + j.id + ',\'in_progress\')" class="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-200">Start</button>';
        if (j.status === 'in_progress') html += '<button onclick="window._crmMarkJob(' + j.id + ',\'completed\')" class="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200">Complete</button>';
        html += '<button onclick="window._crmViewJob(' + j.id + ')" class="text-xs text-brand-600 hover:underline">Details</button>';
        html += '<button onclick="window._crmDeleteJob(' + j.id + ')" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash text-xs"></i></button>';
        html += '</div></div></div>';
      }
      html += '</div>';
    }
    root.innerHTML = html;
  }

  window._jobFilter = '';
  window._crmFilterJobs = function(s) { window._jobFilter = s; loadJobs(s); };

  window._crmNewJob = function() {
    fetch('/api/crm/customers', { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var custs = data.customers || [];
        var body = '<div class="space-y-3">' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Customer</label>' + customerSelectHTML(custs, '', 'jobCustomer') + '</div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Job Title *</label><input type="text" id="jobTitle" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. Roof Replacement - 123 Main St"></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Property Address</label><input type="text" id="jobAddress" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>' +
          '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Scheduled Date *</label><input type="date" id="jobDate" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Time</label><input type="time" id="jobTime" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></div></div>' +
          '<div class="grid grid-cols-3 gap-3"><div><label class="block text-xs font-medium text-gray-600 mb-1">Job Type</label><select id="jobType" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"><option value="install">Install</option><option value="repair">Repair</option><option value="inspection">Inspection</option><option value="maintenance">Maintenance</option></select></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Duration</label><input type="text" id="jobDuration" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. 2 days"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">Crew Size</label><input type="number" id="jobCrew" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" value="4"></div></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea id="jobNotes" rows="2" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"></textarea></div></div>';

        showModal('Schedule New Job', body, function() {
          var title = document.getElementById('jobTitle').value.trim();
          var date = document.getElementById('jobDate').value;
          if (!title || !date) { toast('Title and date required', 'error'); return; }
          var payload = {
            crm_customer_id: document.getElementById('jobCustomer').value ? parseInt(document.getElementById('jobCustomer').value) : null,
            title: title, property_address: document.getElementById('jobAddress').value.trim(),
            scheduled_date: date, scheduled_time: document.getElementById('jobTime').value || null,
            job_type: document.getElementById('jobType').value,
            estimated_duration: document.getElementById('jobDuration').value.trim() || null,
            crew_size: parseInt(document.getElementById('jobCrew').value) || null,
            notes: document.getElementById('jobNotes').value.trim()
          };
          fetch('/api/crm/jobs', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(function(r) { return r.json(); })
            .then(function(res) { if (res.success) { closeModal(); toast('Job scheduled!'); loadJobs(); } else { toast(res.error || 'Failed', 'error'); } });
        }, 'Schedule Job');
      });
  };

  window._crmMarkJob = function(id, status) {
    fetch('/api/crm/jobs/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }) })
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res.success) { toast('Job updated'); loadJobs(window._jobFilter); } });
  };

  window._crmViewJob = function(id) {
    fetch('/api/crm/jobs/' + id, { headers: authHeadersOnly() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var j = data.job;
        var checklist = data.checklist || [];
        var body = '<div class="space-y-4">' +
          '<div class="flex items-center gap-2 mb-2"><span class="font-mono text-xs font-bold text-orange-600">' + j.job_number + '</span>' + badge(j.status) + '</div>' +
          '<h3 class="text-lg font-bold text-gray-800">' + j.title + '</h3>' +
          '<div class="grid grid-cols-2 gap-2 text-sm text-gray-600">' +
          '<div><i class="fas fa-calendar mr-2 text-gray-400"></i>' + fmtDate(j.scheduled_date) + (j.scheduled_time ? ' ' + j.scheduled_time : '') + '</div>' +
          (j.customer_name ? '<div><i class="fas fa-user mr-2 text-gray-400"></i>' + j.customer_name + '</div>' : '') +
          (j.property_address ? '<div><i class="fas fa-map-marker-alt mr-2 text-gray-400"></i>' + j.property_address + '</div>' : '') +
          (j.crew_size ? '<div><i class="fas fa-users mr-2 text-gray-400"></i>' + j.crew_size + ' crew</div>' : '') +
          '</div>';

        if (checklist.length > 0) {
          body += '<div class="pt-3 border-t"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Checklist</h4><div class="space-y-2">';
          for (var k = 0; k < checklist.length; k++) {
            var item = checklist[k];
            body += '<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"><input type="checkbox" ' + (item.is_completed ? 'checked' : '') + ' onchange="window._crmToggleChecklist(' + j.id + ',' + item.id + ',this.checked)" class="w-4 h-4 text-brand-600 rounded border-gray-300"><span class="text-sm ' + (item.is_completed ? 'line-through text-gray-400' : 'text-gray-700') + '">' + item.label + '</span></div>';
          }
          body += '</div></div>';
        }

        if (j.notes) body += '<div class="pt-3 border-t"><p class="text-sm text-gray-500 italic">' + j.notes + '</p></div>';
        body += '</div>';
        showModal(j.title, body);
      });
  };

  window._crmToggleChecklist = function(jobId, itemId, checked) {
    fetch('/api/crm/jobs/' + jobId + '/checklist/' + itemId, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ is_completed: checked }) });
  };

  window._crmDeleteJob = function(id) {
    if (!confirm('Delete this job?')) return;
    fetch('/api/crm/jobs/' + id, { method: 'DELETE', headers: authHeadersOnly() })
      .then(function() { toast('Job deleted'); loadJobs(window._jobFilter); });
  };

  // ============================================================
  // MODULE: PIPELINE
  // ============================================================
  function initPipeline() {
    root.innerHTML = '<div class="bg-white rounded-2xl border p-12 text-center">' +
      '<div class="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6"><i class="fas fa-funnel-dollar text-gray-400 text-3xl"></i></div>' +
      '<h2 class="text-2xl font-bold text-gray-800 mb-3">Sales Pipeline</h2>' +
      '<p class="text-gray-500 mb-2 max-w-md mx-auto">Track your leads through every stage of the sales process — from first contact to signed contract.</p>' +
      '<div class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mt-4"><i class="fas fa-code-branch mr-1"></i>Coming Soon</div>' +
      '<div class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-bullseye text-blue-500"></i></div><p class="text-xs font-semibold text-gray-700">Lead Capture</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-phone-alt text-amber-500"></i></div><p class="text-xs font-semibold text-gray-700">Contact Made</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-file-signature text-purple-500"></i></div><p class="text-xs font-semibold text-gray-700">Proposal Sent</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-handshake text-green-500"></i></div><p class="text-xs font-semibold text-gray-700">Won / Closed</p></div>' +
      '</div></div>';
  }

  // ============================================================
  // MODULE: D2D (Door-to-Door)
  // ============================================================
  function initD2D() {
    root.innerHTML = '<div class="bg-white rounded-2xl border p-12 text-center">' +
      '<div class="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6"><i class="fas fa-door-open text-gray-400 text-3xl"></i></div>' +
      '<h2 class="text-2xl font-bold text-gray-800 mb-3">D2D Manager</h2>' +
      '<p class="text-gray-500 mb-2 max-w-md mx-auto">Manage your door-to-door sales teams, territories, and canvassing routes — track knocks, appointments, and conversion rates.</p>' +
      '<div class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mt-4"><i class="fas fa-code-branch mr-1"></i>Coming Soon</div>' +
      '<div class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-map-marked-alt text-orange-500"></i></div><p class="text-xs font-semibold text-gray-700">Territory Maps</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-clipboard-check text-blue-500"></i></div><p class="text-xs font-semibold text-gray-700">Knock Tracking</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-chart-line text-green-500"></i></div><p class="text-xs font-semibold text-gray-700">Conversion Stats</p></div>' +
      '<div class="bg-gray-50 rounded-xl p-4 text-center"><div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2"><i class="fas fa-users-cog text-purple-500"></i></div><p class="text-xs font-semibold text-gray-700">Team Management</p></div>' +
      '</div></div>';
  }

})();
