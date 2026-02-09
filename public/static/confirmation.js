// ============================================================
// Order Confirmation Page
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('confirmation-root');
  if (!root) return;

  // Get order ID from URL
  const pathParts = window.location.pathname.split('/');
  const orderId = pathParts[pathParts.length - 1];

  if (!orderId) {
    root.innerHTML = '<p class="text-red-500 text-center py-8">Order ID not found</p>';
    return;
  }

  root.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="spinner" style="border-color: rgba(16,185,129,0.3); border-top-color: #10b981; width: 40px; height: 40px;"></div>
      <span class="ml-3 text-gray-500">Loading order details...</span>
    </div>
  `;

  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();

    if (!data.order) throw new Error('Order not found');

    const order = data.order;
    const tierInfo = {
      immediate: { name: 'Immediate', time: 'Under 5 minutes', color: 'red', icon: 'fa-rocket', bg: 'from-red-500 to-red-600' },
      urgent: { name: 'Urgent', time: '15-30 minutes', color: 'amber', icon: 'fa-bolt', bg: 'from-amber-500 to-amber-600' },
      regular: { name: 'Regular', time: '45 min - 1.5 hours', color: 'green', icon: 'fa-clock', bg: 'from-green-500 to-green-600' },
    };
    const tier = tierInfo[order.service_tier] || tierInfo.regular;

    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-blue-100 text-blue-800',
      processing: 'bg-indigo-100 text-indigo-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800'
    };

    root.innerHTML = `
      <!-- Success Banner -->
      <div class="bg-gradient-to-r ${tier.bg} rounded-2xl p-8 text-white text-center mb-8 shadow-xl">
        <div class="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
          <i class="fas fa-check text-3xl"></i>
        </div>
        <h1 class="text-3xl font-bold mb-2">Order Confirmed!</h1>
        <p class="text-white/80 text-lg">Your roof measurement report is being prepared</p>
        <div class="mt-4 inline-block bg-white/20 rounded-lg px-6 py-3">
          <p class="text-sm text-white/70">Order Number</p>
          <p class="text-2xl font-mono font-bold">${order.order_number}</p>
        </div>
      </div>

      <!-- Status & Timing -->
      <div class="grid md:grid-cols-3 gap-4 mb-8">
        <div class="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <i class="fas ${tier.icon} text-2xl text-${tier.color}-500 mb-2"></i>
          <p class="text-sm text-gray-500">Service Tier</p>
          <p class="font-bold text-gray-800">${tier.name}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <i class="fas fa-clock text-2xl text-blue-500 mb-2"></i>
          <p class="text-sm text-gray-500">Expected Delivery</p>
          <p class="font-bold text-gray-800">${tier.time}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <i class="fas fa-dollar-sign text-2xl text-green-500 mb-2"></i>
          <p class="text-sm text-gray-500">Amount Paid</p>
          <p class="font-bold text-gray-800">$${order.price} CAD</p>
        </div>
      </div>

      <!-- Order Status -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 class="font-semibold text-gray-700 mb-4 flex items-center">
          <i class="fas fa-tasks text-brand-500 mr-2"></i>Order Status
        </h3>
        <div class="flex items-center mb-4">
          <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}">
            ${order.status.toUpperCase()}
          </span>
          <span class="ml-3 px-3 py-1 rounded-full text-sm font-medium ${order.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
            Payment: ${order.payment_status.toUpperCase()}
          </span>
        </div>

        <!-- Progress Steps -->
        <div class="flex items-center space-x-2 mt-4">
          ${renderProgressStep('Order Placed', true)}
          <div class="flex-1 h-0.5 ${['paid','processing','completed'].includes(order.status) ? 'bg-green-500' : 'bg-gray-200'}"></div>
          ${renderProgressStep('Payment Received', ['paid','processing','completed'].includes(order.status))}
          <div class="flex-1 h-0.5 ${['processing','completed'].includes(order.status) ? 'bg-green-500' : 'bg-gray-200'}"></div>
          ${renderProgressStep('Processing', ['processing','completed'].includes(order.status))}
          <div class="flex-1 h-0.5 ${order.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'}"></div>
          ${renderProgressStep('Delivered', order.status === 'completed')}
        </div>
      </div>

      <!-- Order Details -->
      <div class="grid md:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3"><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>Property</h4>
          <p class="text-sm text-gray-600">${order.property_address}</p>
          <p class="text-sm text-gray-600">${[order.property_city, order.property_province, order.property_postal_code].filter(Boolean).join(', ')}</p>
          ${order.latitude ? `<p class="text-xs text-gray-400 mt-1">Coords: ${order.latitude}, ${order.longitude}</p>` : ''}
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h4 class="font-semibold text-gray-700 mb-3"><i class="fas fa-user text-brand-500 mr-2"></i>Homeowner</h4>
          <p class="text-sm text-gray-600 font-medium">${order.homeowner_name}</p>
          ${order.homeowner_phone ? `<p class="text-sm text-gray-500">${order.homeowner_phone}</p>` : ''}
          ${order.homeowner_email ? `<p class="text-sm text-gray-500">${order.homeowner_email}</p>` : ''}
        </div>
      </div>

      <!-- Report Data (if available) -->
      ${order.roof_area_sqft ? `
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 class="font-semibold text-gray-700 mb-4 flex items-center">
            <i class="fas fa-chart-bar text-brand-500 mr-2"></i>Roof Measurement Report
          </h3>
          <div class="grid md:grid-cols-4 gap-4">
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-brand-600">${Math.round(order.roof_area_sqft).toLocaleString()}</p>
              <p class="text-xs text-gray-500 mt-1">Total Area (sq ft)</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-brand-600">${order.roof_pitch_degrees || '-'}&deg;</p>
              <p class="text-xs text-gray-500 mt-1">Roof Pitch</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-brand-600">${order.roof_azimuth_degrees || '-'}&deg;</p>
              <p class="text-xs text-gray-500 mt-1">Azimuth</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-accent-600">${Math.round(order.max_sunshine_hours || 0).toLocaleString()}</p>
              <p class="text-xs text-gray-500 mt-1">Sun Hours/Year</p>
            </div>
          </div>
          ${order.num_panels_possible ? `
            <div class="mt-4 bg-brand-50 rounded-lg p-4">
              <h4 class="text-sm font-semibold text-brand-700 mb-2"><i class="fas fa-solar-panel mr-1"></i>Solar Potential</h4>
              <div class="grid md:grid-cols-2 gap-2 text-sm">
                <p class="text-gray-600">Panels Possible: <span class="font-bold text-brand-700">${order.num_panels_possible}</span></p>
                <p class="text-gray-600">Yearly Energy: <span class="font-bold text-brand-700">${Math.round(order.yearly_energy_kwh || 0).toLocaleString()} kWh</span></p>
              </div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 justify-center">
        <a href="/" class="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium">
          <i class="fas fa-plus mr-2"></i>New Order
        </a>
        <button onclick="window.print()" class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium no-print">
          <i class="fas fa-print mr-2"></i>Print
        </button>
        <a href="/admin" class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
          <i class="fas fa-tachometer-alt mr-2"></i>Admin Dashboard
        </a>
      </div>
    `;

  } catch (err) {
    root.innerHTML = `
      <div class="text-center py-12">
        <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
        <h2 class="text-xl font-bold text-gray-700 mb-2">Order Not Found</h2>
        <p class="text-gray-500 mb-4">${err.message}</p>
        <a href="/" class="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
          <i class="fas fa-home mr-2"></i>Back to Home
        </a>
      </div>
    `;
  }
});

function renderProgressStep(label, done) {
  return `
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full ${done ? 'bg-green-500' : 'bg-gray-200'} flex items-center justify-center">
        ${done ? '<i class="fas fa-check text-white text-xs"></i>' : '<div class="w-2 h-2 bg-gray-400 rounded-full"></div>'}
      </div>
      <span class="text-[10px] mt-1 ${done ? 'text-green-600 font-medium' : 'text-gray-400'}">${label}</span>
    </div>
  `;
}
