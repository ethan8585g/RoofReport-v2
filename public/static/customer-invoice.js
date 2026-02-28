// ============================================================
// Customer Invoice Viewer
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const invoiceId = window.location.pathname.split('/').pop();
  await loadInvoice(invoiceId);
});

async function loadInvoice(id) {
  const root = document.getElementById('invoice-root');
  const token = localStorage.getItem('rc_customer_token') || '';

  root.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-brand-500"></div>
      <span class="ml-3 text-gray-500">Loading invoice...</span>
    </div>`;

  try {
    const res = await fetch(`/api/customer/invoices/${id}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      root.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <i class="fas fa-exclamation-triangle text-red-500 text-3xl mb-3"></i>
        <p class="text-red-700 font-medium">Invoice not found or access denied.</p>
        <a href="/customer/dashboard" class="text-brand-600 hover:underline text-sm mt-2 inline-block">Back to Dashboard</a>
      </div>`;
      return;
    }

    const data = await res.json();
    const inv = data.invoice;
    const items = data.items || [];

    root.innerHTML = renderInvoiceView(inv, items);
  } catch (e) {
    root.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
      <p class="text-red-700 font-medium">Failed to load invoice: ${e.message}</p>
    </div>`;
  }
}

function renderInvoiceView(inv, items) {
  const isPaid = inv.status === 'paid';
  const statusColor = {
    draft: 'gray', sent: 'blue', viewed: 'indigo', paid: 'green', overdue: 'red', cancelled: 'gray', refunded: 'purple'
  }[inv.status] || 'gray';

  return `
    <!-- Print Actions -->
    <div class="flex justify-between items-center mb-6 print:hidden">
      <a href="/customer/dashboard" class="text-brand-600 hover:text-brand-700 text-sm font-medium">
        <i class="fas fa-arrow-left mr-1"></i>Back to Dashboard
      </a>
      <div class="flex gap-2">
        <button onclick="window.print()" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
          <i class="fas fa-print mr-1"></i>Print
        </button>
      </div>
    </div>

    <!-- Invoice Document -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-none">
      <!-- Header -->
      <div class="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-8">
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
                <i class="fas fa-home text-white text-lg"></i>
              </div>
              <div>
                <h1 class="text-xl font-bold">RoofReporterAI</h1>
                <p class="text-brand-200 text-xs">Professional Roof Measurement Reports</p>
              </div>
            </div>
            <p class="text-brand-200 text-sm">Alberta, Canada</p>
            <p class="text-brand-200 text-sm">reports@reusecanada.ca</p>
          </div>
          <div class="text-right">
            <h2 class="text-3xl font-bold mb-2">INVOICE</h2>
            <p class="font-mono text-lg text-brand-200">${inv.invoice_number}</p>
            <div class="mt-3 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase bg-${statusColor}-500/20 text-${statusColor}-200">
              ${inv.status}
            </div>
          </div>
        </div>
      </div>

      <!-- Bill To / Details -->
      <div class="grid grid-cols-2 gap-8 p-8 border-b border-gray-100">
        <div>
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bill To</h3>
          <p class="font-semibold text-gray-800">${inv.customer_name || ''}</p>
          ${inv.customer_company ? `<p class="text-sm text-gray-600">${inv.customer_company}</p>` : ''}
          ${inv.customer_email ? `<p class="text-sm text-gray-500">${inv.customer_email}</p>` : ''}
          ${inv.customer_phone ? `<p class="text-sm text-gray-500">${inv.customer_phone}</p>` : ''}
          ${inv.customer_address ? `<p class="text-sm text-gray-500 mt-1">${inv.customer_address}</p>` : ''}
          ${inv.customer_city ? `<p class="text-sm text-gray-500">${inv.customer_city}, ${inv.customer_province || ''} ${inv.customer_postal || ''}</p>` : ''}
        </div>
        <div class="text-right">
          <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Invoice Details</h3>
          <div class="space-y-1 text-sm">
            <p><span class="text-gray-500">Issue Date:</span> <span class="font-medium">${inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : '-'}</span></p>
            <p><span class="text-gray-500">Due Date:</span> <span class="font-medium ${!isPaid && inv.status === 'overdue' ? 'text-red-600' : ''}">${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</span></p>
            ${inv.paid_date ? `<p><span class="text-gray-500">Paid Date:</span> <span class="font-medium text-green-600">${new Date(inv.paid_date).toLocaleDateString()}</span></p>` : ''}
            ${inv.order_number ? `<p><span class="text-gray-500">Order #:</span> <span class="font-mono">${inv.order_number}</span></p>` : ''}
            ${inv.property_address ? `<p><span class="text-gray-500">Property:</span> ${inv.property_address}</p>` : ''}
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <div class="p-8">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-2 border-gray-200">
              <th class="pb-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
              <th class="pb-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-20">Qty</th>
              <th class="pb-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Unit Price</th>
              <th class="pb-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Amount</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${items.map(item => `
              <tr>
                <td class="py-4 text-gray-700">${item.description}</td>
                <td class="py-4 text-center text-gray-600">${item.quantity}</td>
                <td class="py-4 text-right text-gray-600">$${(item.unit_price || 0).toFixed(2)}</td>
                <td class="py-4 text-right font-medium text-gray-800">$${(item.amount || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="border-t-2 border-gray-200 mt-4 pt-4">
          <div class="flex justify-end">
            <div class="w-64 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">Subtotal</span>
                <span class="font-medium">$${(inv.subtotal || 0).toFixed(2)}</span>
              </div>
              ${inv.tax_rate > 0 ? `
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">GST (${inv.tax_rate}%)</span>
                <span class="font-medium">$${(inv.tax_amount || 0).toFixed(2)}</span>
              </div>` : ''}
              ${inv.discount_amount > 0 ? `
              <div class="flex justify-between text-sm">
                <span class="text-gray-500">Discount</span>
                <span class="font-medium text-green-600">-$${(inv.discount_amount || 0).toFixed(2)}</span>
              </div>` : ''}
              <div class="flex justify-between text-lg font-bold border-t border-gray-200 pt-2 mt-2">
                <span>Total (${inv.currency || 'CAD'})</span>
                <span class="text-brand-700">$${(inv.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Notes / Terms -->
      ${inv.notes || inv.terms ? `
      <div class="bg-gray-50 p-8 border-t border-gray-100">
        ${inv.notes ? `<div class="mb-4"><h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</h4><p class="text-sm text-gray-600">${inv.notes}</p></div>` : ''}
        ${inv.terms ? `<div><h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Terms & Conditions</h4><p class="text-sm text-gray-500">${inv.terms}</p></div>` : ''}
      </div>` : ''}

      <!-- Footer -->
      <div class="text-center py-4 bg-gray-50 border-t border-gray-100">
        <p class="text-xs text-gray-400">Thank you for your business! &middot; RoofReporterAI &middot; reports@reusecanada.ca</p>
      </div>
    </div>
  `;
}
