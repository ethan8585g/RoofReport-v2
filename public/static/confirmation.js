// ============================================================
// Order Confirmation Page - with 3D Roof Area Display
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('confirmation-root');
  if (!root) return;

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
    // Load order + report data
    const [orderRes, reportRes] = await Promise.all([
      fetch('/api/orders/' + orderId),
      fetch('/api/reports/' + orderId).catch(() => null)
    ]);
    const orderData = await orderRes.json();
    if (!orderData.order) throw new Error('Order not found');

    let reportData = null;
    if (reportRes && reportRes.ok) {
      const rData = await reportRes.json();
      // Parse the full report from api_response_raw if available
      if (rData.report?.api_response_raw) {
        try { reportData = JSON.parse(rData.report.api_response_raw); } catch(e) {}
      }
      if (!reportData) reportData = rData.report;
    }

    const order = orderData.order;
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

      <!-- ============================================================ -->
      <!-- ROOF MEASUREMENT REPORT — 3D Area Display                    -->
      <!-- Shows both flat footprint AND true surface area              -->
      <!-- ============================================================ -->
      ${reportData ? renderRoofReport(reportData) : ''}

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 justify-center mt-8">
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

// ============================================================
// ROOF REPORT RENDERER — Key distinction: Footprint vs True Area
// ============================================================
function renderRoofReport(r) {
  // Support both old format (roof_area_sqft) and new format (total_true_area_sqft)
  const trueArea = r.total_true_area_sqft || r.roof_area_sqft || 0;
  const footprint = r.total_footprint_sqft || Math.round(trueArea * 0.88) || 0; // estimate if not available
  const trueAreaSqm = r.total_true_area_sqm || r.roof_area_sqm || Math.round(trueArea * 0.0929);
  const multiplier = r.area_multiplier || (footprint > 0 ? (trueArea / footprint) : 1);
  const pitchRatio = r.roof_pitch_ratio || '';
  const pitchDeg = r.roof_pitch_degrees || 0;
  const segments = r.segments || [];
  const provider = r.metadata?.provider || 'unknown';

  return `
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-6">
        <h3 class="font-semibold text-gray-700 flex items-center">
          <i class="fas fa-ruler-combined text-brand-500 mr-2"></i>Roof Measurement Report
        </h3>
        <span class="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
          Source: ${provider === 'mock' ? 'Simulated Data' : 'Google Solar API'}
        </span>
      </div>

      <!-- ============================================================ -->
      <!-- THE CRITICAL DISTINCTION: Footprint vs True 3D Area          -->
      <!-- This is what separates a professional report from a bad one   -->
      <!-- ============================================================ -->
      <div class="bg-gradient-to-r from-brand-50 to-blue-50 border border-brand-200 rounded-xl p-6 mb-6">
        <div class="grid md:grid-cols-3 gap-6">
          <!-- Flat Footprint -->
          <div class="text-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
              <i class="fas fa-vector-square text-blue-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase tracking-wider">Flat Footprint</p>
            <p class="text-xs text-gray-400">(view from above)</p>
            <p class="text-2xl font-bold text-blue-700 mt-1">${footprint.toLocaleString()}</p>
            <p class="text-sm text-gray-500">sq ft</p>
          </div>

          <!-- Arrow / Multiplier -->
          <div class="text-center flex flex-col items-center justify-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-accent-100 rounded-full flex items-center justify-center">
              <i class="fas fa-times text-accent-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase tracking-wider">Pitch Multiplier</p>
            <p class="text-2xl font-bold text-accent-700 mt-1">${multiplier.toFixed(3)}x</p>
            <p class="text-xs text-gray-500">
              Roof is <strong>${Math.round((multiplier - 1) * 100)}% larger</strong> than footprint
            </p>
          </div>

          <!-- True 3D Surface Area -->
          <div class="text-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-brand-100 rounded-full flex items-center justify-center">
              <i class="fas fa-cube text-brand-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase tracking-wider">True Surface Area</p>
            <p class="text-xs text-gray-400">(what you actually shingle)</p>
            <p class="text-3xl font-bold text-brand-700 mt-1">${Math.round(trueArea).toLocaleString()}</p>
            <p class="text-sm text-gray-500">sq ft <span class="text-xs text-gray-400">(${trueAreaSqm} m&sup2;)</span></p>
          </div>
        </div>

        <div class="mt-4 bg-white/60 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600">
            <i class="fas fa-info-circle text-brand-500 mr-1"></i>
            <strong>Why the difference?</strong> A flat satellite view shows ${footprint.toLocaleString()} sq ft.
            But roofs are slanted — at ${pitchDeg}&deg; pitch${pitchRatio ? ` (${pitchRatio})` : ''},
            the actual surface area is <strong>${Math.round(trueArea).toLocaleString()} sq ft</strong>.
            Use the true surface area for material estimates, shingle orders, and contractor quotes.
          </p>
        </div>
      </div>

      <!-- Pitch & Orientation -->
      <div class="grid md:grid-cols-4 gap-4 mb-6">
        <div class="bg-gray-50 rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-brand-600">${pitchDeg}&deg;</p>
          <p class="text-xs text-gray-500 mt-1">Pitch (degrees)</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-brand-600">${pitchRatio || 'N/A'}</p>
          <p class="text-xs text-gray-500 mt-1">Pitch (rise:run)</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-brand-600">${r.roof_azimuth_degrees || 0}&deg;</p>
          <p class="text-xs text-gray-500 mt-1">Azimuth</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-accent-600">${(r.max_sunshine_hours || 0).toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">Sun Hours/Year</p>
        </div>
      </div>

      <!-- Segment Breakdown -->
      ${segments.length > 0 ? `
        <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-layer-group mr-1 text-brand-500"></i>Roof Segments</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Segment</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Footprint</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-brand-50">True Area</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">Pitch</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">Direction</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${segments.map(s => `
                <tr>
                  <td class="px-3 py-2 font-medium text-gray-700">${s.name}</td>
                  <td class="px-3 py-2 text-right text-gray-500">${(s.footprint_area_sqft || s.area_sqft || 0).toLocaleString()} ft&sup2;</td>
                  <td class="px-3 py-2 text-right font-semibold text-brand-700 bg-brand-50">${(s.true_area_sqft || s.area_sqft || 0).toLocaleString()} ft&sup2;</td>
                  <td class="px-3 py-2 text-center text-gray-600">${s.pitch_degrees || s.pitch || 0}&deg; ${s.pitch_ratio ? `(${s.pitch_ratio})` : ''}</td>
                  <td class="px-3 py-2 text-center text-gray-600">${s.azimuth_direction || ''} ${(s.azimuth_degrees || s.azimuth || 0)}&deg;</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Solar Potential -->
      ${r.num_panels_possible ? `
        <div class="mt-6 bg-accent-50 rounded-lg p-4">
          <h4 class="text-sm font-semibold text-accent-800 mb-2"><i class="fas fa-solar-panel mr-1"></i>Solar Potential</h4>
          <div class="grid md:grid-cols-2 gap-2 text-sm">
            <p class="text-gray-600">Panels Possible: <span class="font-bold text-accent-700">${r.num_panels_possible}</span></p>
            <p class="text-gray-600">Yearly Energy: <span class="font-bold text-accent-700">${Math.round(r.yearly_energy_kwh || 0).toLocaleString()} kWh</span></p>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

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
