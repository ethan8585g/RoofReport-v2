// ============================================================
// Order Confirmation Page - v2.0
// Full professional report: 3D area, edge breakdown,
// material estimates, quality badges, and professional report link
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
    const [orderRes, reportRes] = await Promise.all([
      fetch('/api/orders/' + orderId),
      fetch('/api/reports/' + orderId).catch(() => null)
    ]);
    const orderData = await orderRes.json();
    if (!orderData.order) throw new Error('Order not found');

    let reportData = null;
    if (reportRes && reportRes.ok) {
      const rData = await reportRes.json();
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

      <!-- Order Progress -->
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

      <!-- FULL MEASUREMENT REPORT (v2.0) -->
      ${reportData ? renderFullReport(reportData, orderId) : ''}

      <!-- AI MEASUREMENT ENGINE SECTION -->
      <div id="ai-engine-root" class="mt-8"></div>

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 justify-center mt-8">
        <a href="/" class="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium">
          <i class="fas fa-plus mr-2"></i>New Order
        </a>
        <a href="/api/reports/${orderId}/html" target="_blank" class="px-6 py-3 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors font-medium">
          <i class="fas fa-file-alt mr-2"></i>Professional Report
        </a>
        <button onclick="window.print()" class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium no-print">
          <i class="fas fa-print mr-2"></i>Print
        </button>
        <a href="/admin" class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
          <i class="fas fa-tachometer-alt mr-2"></i>Admin Dashboard
        </a>
      </div>
    `;

    // ============================================================
    // AUTO-TRIGGER AI ANALYSIS
    // After rendering, check for existing AI data or trigger new analysis
    // ============================================================
    loadAIAnalysis(orderId, reportData);


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
// FULL REPORT RENDERER — v2.0 with all 6 sections
// ============================================================
function renderFullReport(r, orderId) {
  const trueArea = r.total_true_area_sqft || r.roof_area_sqft || 0;
  const footprint = r.total_footprint_sqft || Math.round(trueArea * 0.88) || 0;
  const trueAreaSqm = r.total_true_area_sqm || Math.round(trueArea * 0.0929);
  const multiplier = r.area_multiplier || (footprint > 0 ? (trueArea / footprint) : 1);
  const pitchRatio = r.roof_pitch_ratio || '';
  const pitchDeg = r.roof_pitch_degrees || 0;
  const segments = r.segments || [];
  const edges = r.edges || [];
  const edgeSummary = r.edge_summary || {};
  const materials = r.materials || {};
  const quality = r.quality || {};
  const provider = r.metadata?.provider || 'unknown';
  const lineItems = materials.line_items || [];

  return `
    <!-- Report Header with Quality Badge -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-800 flex items-center">
          <i class="fas fa-ruler-combined text-brand-500 mr-2"></i>Roof Measurement Report
          <span class="ml-2 text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full">v2.0</span>
        </h3>
        <div class="flex items-center space-x-2">
          ${renderQualityBadge(quality)}
          <span class="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
            ${provider === 'mock' ? 'Simulated' : 'Google Solar API'}
          </span>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- SECTION 2: Area Measurements — Footprint vs True 3D          -->
      <!-- ============================================================ -->
      <div class="bg-gradient-to-r from-brand-50 to-blue-50 border border-brand-200 rounded-xl p-6 mb-6">
        <h4 class="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">
          <i class="fas fa-ruler mr-1 text-brand-500"></i>Measurement Summary
        </h4>
        <div class="grid md:grid-cols-3 gap-6">
          <div class="text-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
              <i class="fas fa-vector-square text-blue-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase">Flat Footprint</p>
            <p class="text-2xl font-bold text-blue-700 mt-1">${footprint.toLocaleString()}</p>
            <p class="text-sm text-gray-500">sq ft</p>
          </div>
          <div class="text-center flex flex-col items-center justify-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-accent-100 rounded-full flex items-center justify-center">
              <i class="fas fa-times text-accent-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase">Pitch Multiplier</p>
            <p class="text-2xl font-bold text-accent-700 mt-1">${multiplier.toFixed(3)}x</p>
            <p class="text-xs text-gray-500">Roof is <strong>${Math.round((multiplier - 1) * 100)}% larger</strong></p>
          </div>
          <div class="text-center">
            <div class="w-12 h-12 mx-auto mb-2 bg-brand-100 rounded-full flex items-center justify-center">
              <i class="fas fa-cube text-brand-600"></i>
            </div>
            <p class="text-xs text-gray-500 uppercase">True Surface Area</p>
            <p class="text-3xl font-bold text-brand-700 mt-1">${Math.round(trueArea).toLocaleString()}</p>
            <p class="text-sm text-gray-500">sq ft <span class="text-xs text-gray-400">(${trueAreaSqm} m&sup2;)</span></p>
          </div>
        </div>
        <div class="mt-4 bg-white/60 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600">
            <i class="fas fa-info-circle text-brand-500 mr-1"></i>
            At ${pitchDeg}&deg; pitch${pitchRatio ? ` (${pitchRatio})` : ''},
            the actual surface is <strong>${Math.round(trueArea).toLocaleString()} sq ft</strong> — use this for material ordering.
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

      <!-- ============================================================ -->
      <!-- SECTION 3: Edge Breakdown                                    -->
      <!-- ============================================================ -->
      ${edges.length > 0 ? `
        <div class="mb-6">
          <h4 class="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
            <i class="fas fa-draw-polygon mr-1 text-brand-500"></i>Edge Breakdown
          </h4>
          <!-- Edge summary cards -->
          <div class="grid grid-cols-5 gap-2 mb-3">
            ${renderEdgeSummaryCard('Ridge', edgeSummary.total_ridge_ft, 'text-green-600', 'bg-green-50')}
            ${renderEdgeSummaryCard('Hip', edgeSummary.total_hip_ft, 'text-blue-600', 'bg-blue-50')}
            ${renderEdgeSummaryCard('Valley', edgeSummary.total_valley_ft, 'text-red-600', 'bg-red-50')}
            ${renderEdgeSummaryCard('Eave', edgeSummary.total_eave_ft, 'text-amber-600', 'bg-amber-50')}
            ${renderEdgeSummaryCard('Rake', edgeSummary.total_rake_ft, 'text-purple-600', 'bg-purple-50')}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Edge</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Plan (2D)</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-brand-50">True 3D</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Factor</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${edges.map(e => `
                  <tr>
                    <td class="px-3 py-2 font-medium text-gray-700">${e.label}</td>
                    <td class="px-3 py-2 text-gray-500 capitalize">${e.edge_type.replace('_', ' ')}</td>
                    <td class="px-3 py-2 text-right text-gray-500">${e.plan_length_ft} ft</td>
                    <td class="px-3 py-2 text-right font-semibold text-brand-700 bg-brand-50">${e.true_length_ft} ft</td>
                    <td class="px-3 py-2 text-right text-gray-500">${(e.pitch_factor || 1).toFixed(3)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot class="bg-gray-50 font-semibold">
                <tr>
                  <td class="px-3 py-2" colspan="2">Total</td>
                  <td class="px-3 py-2 text-right">${edges.reduce((s, e) => s + e.plan_length_ft, 0)} ft</td>
                  <td class="px-3 py-2 text-right text-brand-700 bg-brand-50">${edgeSummary.total_linear_ft || 0} ft</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- ============================================================ -->
      <!-- SECTION 4: Facet (Segment) Breakdown                         -->
      <!-- ============================================================ -->
      ${segments.length > 0 ? `
        <div class="mb-6">
          <h4 class="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
            <i class="fas fa-layer-group mr-1 text-brand-500"></i>Facet Analysis
          </h4>
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
                    <td class="px-3 py-2 text-right text-gray-500">${(s.footprint_area_sqft || 0).toLocaleString()} ft&sup2;</td>
                    <td class="px-3 py-2 text-right font-semibold text-brand-700 bg-brand-50">${(s.true_area_sqft || 0).toLocaleString()} ft&sup2;</td>
                    <td class="px-3 py-2 text-center text-gray-600">${s.pitch_degrees || 0}&deg; ${s.pitch_ratio ? `(${s.pitch_ratio})` : ''}</td>
                    <td class="px-3 py-2 text-center text-gray-600">${s.azimuth_direction || ''} ${(s.azimuth_degrees || 0)}&deg;</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- ============================================================ -->
      <!-- SECTION 5: Material Estimate — Bill of Materials              -->
      <!-- ============================================================ -->
      ${lineItems.length > 0 ? `
        <div class="mb-6">
          <h4 class="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
            <i class="fas fa-boxes mr-1 text-brand-500"></i>Material Estimate
          </h4>

          <!-- Material summary cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="bg-brand-50 rounded-lg p-3 text-center border border-brand-200">
              <p class="text-xs text-gray-500 uppercase">Gross Squares</p>
              <p class="text-2xl font-bold text-brand-700">${materials.gross_squares || 0}</p>
            </div>
            <div class="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
              <p class="text-xs text-gray-500 uppercase">Bundles</p>
              <p class="text-2xl font-bold text-blue-700">${materials.bundle_count || 0}</p>
            </div>
            <div class="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
              <p class="text-xs text-gray-500 uppercase">Waste Factor</p>
              <p class="text-2xl font-bold text-amber-700">${materials.waste_pct || 0}%</p>
            </div>
            <div class="bg-green-50 rounded-lg p-3 text-center border border-green-200">
              <p class="text-xs text-gray-500 uppercase">Est. Cost</p>
              <p class="text-xl font-bold text-green-700">$${(materials.total_material_cost_cad || 0).toLocaleString()}</p>
              <p class="text-xs text-gray-400">CAD</p>
            </div>
          </div>

          <!-- Complexity badge -->
          <div class="mb-3">
            <span class="inline-block px-3 py-1 rounded-full text-xs font-medium ${getComplexityColor(materials.complexity_class)}">
              Complexity: ${(materials.complexity_class || 'unknown').replace('_', ' ').toUpperCase()}
            </span>
            <span class="text-xs text-gray-400 ml-2">
              Factor: ${(materials.complexity_factor || 1).toFixed(2)}x | Shingle: ${(materials.shingle_type || 'architectural')}
            </span>
          </div>

          <!-- Line items table -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Net Qty</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Waste</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-brand-50">Order Qty</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Price</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${lineItems.map(item => `
                  <tr>
                    <td class="px-3 py-2 text-gray-700">${item.description}</td>
                    <td class="px-3 py-2 text-right text-gray-500">${item.net_quantity}</td>
                    <td class="px-3 py-2 text-right text-gray-500">${item.waste_pct}%</td>
                    <td class="px-3 py-2 text-right font-semibold text-brand-700 bg-brand-50">${item.order_quantity}</td>
                    <td class="px-3 py-2 text-gray-500">${item.order_unit}</td>
                    <td class="px-3 py-2 text-right text-gray-500">$${(item.unit_price_cad || 0).toFixed(2)}</td>
                    <td class="px-3 py-2 text-right font-medium">$${(item.line_total_cad || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot class="bg-gray-50 font-bold">
                <tr>
                  <td class="px-3 py-3" colspan="5">Estimated Material Total</td>
                  <td></td>
                  <td class="px-3 py-3 text-right text-brand-700 text-base">$${(materials.total_material_cost_cad || 0).toLocaleString()} CAD</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <i class="fas fa-info-circle mr-1"></i>
            <strong>Note:</strong> Material costs are estimates based on typical Alberta retail pricing.
            Actual costs vary by supplier. Contact your distributor for exact quotes.
            ${materials.complexity_class !== 'simple' ? ` Roof rated "${(materials.complexity_class || '').replace('_', ' ')}" — expect additional waste and labour.` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Solar Potential -->
      ${r.num_panels_possible ? `
        <div class="bg-accent-50 rounded-lg p-4 mb-4 border border-accent-200">
          <h4 class="text-sm font-bold text-accent-800 mb-2"><i class="fas fa-solar-panel mr-1"></i>Solar Potential</h4>
          <div class="grid md:grid-cols-3 gap-2 text-sm">
            <p class="text-gray-600">Max Sunshine: <span class="font-bold text-accent-700">${(r.max_sunshine_hours || 0).toLocaleString()} hrs/yr</span></p>
            <p class="text-gray-600">Panels Possible: <span class="font-bold text-accent-700">${r.num_panels_possible}</span></p>
            <p class="text-gray-600">Yearly Energy: <span class="font-bold text-accent-700">${Math.round(r.yearly_energy_kwh || 0).toLocaleString()} kWh</span></p>
          </div>
        </div>
      ` : ''}

      <!-- Quality Notes -->
      ${quality.notes && quality.notes.length > 0 ? `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 class="text-xs font-bold text-gray-600 mb-2 uppercase">Data Quality Notes</h4>
          <ul class="text-xs text-gray-500 space-y-1 list-disc list-inside">
            ${quality.notes.map(n => `<li>${n}</li>`).join('')}
          </ul>
          ${quality.field_verification_recommended ? `
            <p class="mt-2 text-xs font-semibold text-amber-700">
              <i class="fas fa-exclamation-triangle mr-1"></i>Field verification recommended before ordering materials.
            </p>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

function renderQualityBadge(quality) {
  const q = quality.imagery_quality || 'BASE';
  const colors = {
    HIGH: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    BASE: 'bg-gray-100 text-gray-600',
    LOW: 'bg-red-100 text-red-700'
  };
  return `
    <span class="text-xs px-2 py-1 ${colors[q] || colors.BASE} rounded-full font-medium">
      ${q} Quality &middot; ${quality.confidence_score || 0}%
    </span>
  `;
}

function renderEdgeSummaryCard(label, value, textColor, bgColor) {
  return `
    <div class="${bgColor} rounded-lg p-2 text-center border border-gray-200">
      <p class="text-xs text-gray-500">${label}</p>
      <p class="text-lg font-bold ${textColor}">${value || 0}<span class="text-xs font-normal text-gray-400"> ft</span></p>
    </div>
  `;
}

function getComplexityColor(cls) {
  const map = {
    simple: 'bg-green-100 text-green-700',
    moderate: 'bg-blue-100 text-blue-700',
    complex: 'bg-amber-100 text-amber-700',
    very_complex: 'bg-red-100 text-red-700'
  };
  return map[cls] || 'bg-gray-100 text-gray-600';
}

// ============================================================
// AI MEASUREMENT ENGINE — Gemini Vision Integration
// ============================================================

async function loadAIAnalysis(orderId, reportData) {
  const root = document.getElementById('ai-engine-root');
  if (!root) return;

  // Show loading state
  root.innerHTML = renderAILoadingState();

  try {
    // Check for existing AI analysis
    const existingRes = await fetch('/api/ai/' + orderId);
    const existing = await existingRes.json();

    if (existing.status === 'completed' && existing.measurement) {
      renderAIEngine(root, existing, reportData);
      return;
    }

    // Trigger new analysis
    const analyzeRes = await fetch('/api/ai/' + orderId + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await analyzeRes.json();

    if (result.success || result.status === 'completed') {
      renderAIEngine(root, result, reportData);
    } else {
      root.innerHTML = renderAIError(result.error || result.details || 'Analysis failed');
    }
  } catch (err) {
    root.innerHTML = renderAIError(err.message);
  }
}

function renderAILoadingState() {
  return `
    <div class="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden shadow-xl">
      <div class="p-4 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <i class="fas fa-brain text-white text-sm"></i>
          </div>
          <div>
            <h3 class="font-bold text-white text-sm">AI Measurement Engine</h3>
            <p class="text-xs text-gray-400">Powered by Gemini Vision</p>
          </div>
        </div>
        <span class="text-xs bg-blue-900/30 text-blue-300 px-3 py-1 rounded-full border border-blue-700/50 animate-pulse">
          <i class="fas fa-spinner fa-spin mr-1"></i>Analyzing...
        </span>
      </div>
      <div class="p-12 flex flex-col items-center justify-center">
        <div class="relative w-20 h-20 mb-6">
          <div class="absolute inset-0 border-4 border-blue-500/30 rounded-full animate-ping"></div>
          <div class="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
        <p class="text-blue-400 font-mono text-sm animate-pulse">AI MEASUREMENT ENGINE RUNNING...</p>
        <p class="text-gray-500 text-xs mt-2">Extracting Roof Geometry, Lines & Obstructions from Satellite Imagery</p>
        <p class="text-gray-600 text-xs mt-1">This typically takes 5-15 seconds</p>
      </div>
    </div>
  `;
}

function renderAIError(message) {
  return `
    <div class="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
      <div class="p-4 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
        <div class="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
          <i class="fas fa-brain text-white text-sm"></i>
        </div>
        <div>
          <h3 class="font-bold text-white text-sm">AI Measurement Engine</h3>
          <p class="text-xs text-red-400">${message}</p>
        </div>
      </div>
      <div class="p-8 text-center">
        <i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i>
        <p class="text-gray-400 text-sm">AI analysis could not be completed.</p>
        <p class="text-gray-500 text-xs mt-1">The standard Solar API report above is still valid.</p>
        <p class="text-gray-600 text-xs mt-3">Check that GOOGLE_VERTEX_API_KEY is configured.</p>
      </div>
    </div>
  `;
}

// ============================================================
// MAIN AI ENGINE RENDERER
// ============================================================
function renderAIEngine(root, aiData, reportData) {
  const measurement = aiData.measurement;
  const aiReport = aiData.report;
  const satelliteUrl = aiData.satellite_image_url;
  const facetCount = measurement?.facets?.length || 0;
  const lineCount = measurement?.lines?.length || 0;
  const obstructionCount = measurement?.obstructions?.length || 0;

  root.innerHTML = `
    <div class="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden shadow-xl">
      <!-- Header -->
      <div class="p-4 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <i class="fas fa-brain text-white"></i>
          </div>
          <div>
            <h3 class="font-bold text-white">AI Measurement Engine</h3>
            <p class="text-xs text-gray-400">Gemini Vision Roof Geometry Analysis</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full border border-green-700/50">
            <i class="fas fa-check-circle mr-1"></i>Analysis Complete
          </span>
        </div>
      </div>

      <!-- Two Column Layout -->
      <div class="grid lg:grid-cols-2 gap-0 divide-x divide-gray-700">

        <!-- LEFT: Satellite Image with SVG Overlay -->
        <div class="p-4">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fas fa-ruler text-blue-400 text-sm"></i>
              <span class="text-sm font-semibold text-gray-200">Vision Analysis</span>
            </div>
            <span class="text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50">
              Satellite + AI Overlay
            </span>
          </div>

          <!-- Image + SVG Overlay Container -->
          <div class="relative w-full aspect-square bg-gray-800 rounded-xl overflow-hidden border border-gray-700" id="ai-overlay-container">
            ${satelliteUrl ? `<img src="${satelliteUrl}" alt="Satellite" class="w-full h-full object-cover" crossorigin="anonymous" />` : '<div class="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500">No satellite image</div>'}

            ${measurement ? `
              <svg viewBox="0 0 1000 1000" class="absolute inset-0 w-full h-full" preserveAspectRatio="none" style="pointer-events:none">
                <!-- Facets -->
                ${(measurement.facets || []).map((facet, idx) => {
                  const pts = (facet.points || []).map(p => p.x + ',' + p.y).join(' ');
                  const cx = facet.points?.length ? Math.round(facet.points.reduce((a, p) => a + p.x, 0) / facet.points.length) : 0;
                  const cy = facet.points?.length ? Math.round(facet.points.reduce((a, p) => a + p.y, 0) / facet.points.length) : 0;
                  return '<g>' +
                    '<polygon points="' + pts + '" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.8)" stroke-width="2"/>' +
                    '<text x="' + cx + '" y="' + cy + '" fill="white" font-size="22" text-anchor="middle" font-weight="bold" style="text-shadow:0 1px 3px rgba(0,0,0,0.8)">' + (facet.pitch || '') + '</text>' +
                    '</g>';
                }).join('')}

                <!-- Lines -->
                ${(measurement.lines || []).map((line, idx) => {
                  const colors = { RIDGE: '#F59E0B', HIP: '#F97316', VALLEY: '#3B82F6', EAVE: '#10B981', RAKE: '#EF4444' };
                  const c = colors[line.type] || '#EF4444';
                  return '<line x1="' + line.start.x + '" y1="' + line.start.y + '" x2="' + line.end.x + '" y2="' + line.end.y + '" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>';
                }).join('')}

                <!-- Obstructions -->
                ${(measurement.obstructions || []).map((obs, idx) => {
                  const b = obs.boundingBox;
                  return '<rect x="' + b.min.x + '" y="' + b.min.y + '" width="' + (b.max.x - b.min.x) + '" height="' + (b.max.y - b.min.y) + '" fill="rgba(239,68,68,0.25)" stroke="#EF4444" stroke-width="2" stroke-dasharray="5,3"/>';
                }).join('')}
              </svg>
            ` : ''}
          </div>

          <!-- Stats Bar -->
          <div class="mt-3 grid grid-cols-3 gap-2">
            <div class="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
              <div class="text-2xl font-bold text-white">${facetCount}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wide">Facets</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
              <div class="text-2xl font-bold text-white">${lineCount}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wide">Lines</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
              <div class="text-2xl font-bold text-white">${obstructionCount}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wide">Obstructions</div>
            </div>
          </div>

          <!-- Legend -->
          <div class="mt-3 bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div class="text-xs font-semibold text-gray-400 mb-2">Legend</div>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-amber-500 rounded"></div><span class="text-gray-400">Ridge</span></div>
              <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-blue-500 rounded"></div><span class="text-gray-400">Valley</span></div>
              <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-green-500 rounded"></div><span class="text-gray-400">Eave</span></div>
              <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-orange-500 rounded"></div><span class="text-gray-400">Hip</span></div>
              <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-red-500 rounded"></div><span class="text-gray-400">Rake</span></div>
              <div class="flex items-center gap-1.5"><div class="w-3 h-3 border border-red-500 bg-red-500/20 rounded-sm" style="border-style:dashed"></div><span class="text-gray-400">Obstruction</span></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Measurement Data + AI Report + Charts -->
        <div class="p-4 space-y-4">

          ${renderAIMeasurementPanel(measurement, reportData)}

          ${aiReport ? renderAIReportCard(aiReport) : ''}

          ${renderAILineSummary(measurement)}

          ${renderAIFacetTable(measurement)}

        </div>
      </div>

      <!-- Charts Row -->
      <div class="border-t border-gray-700 p-4">
        <div class="grid lg:grid-cols-2 gap-4">
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 class="text-sm font-semibold text-gray-300 mb-3"><i class="fas fa-chart-bar text-blue-400 mr-1"></i>Segment Areas</h4>
            <canvas id="ai-segment-chart" height="200"></canvas>
          </div>
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 class="text-sm font-semibold text-gray-300 mb-3"><i class="fas fa-compass text-purple-400 mr-1"></i>Orientation Distribution</h4>
            <canvas id="ai-orientation-chart" height="200"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render charts after DOM is ready
  setTimeout(() => renderAICharts(reportData), 100);
}

// ============================================================
// MEASUREMENT PANEL — Scale factor + area calculations
// ============================================================
function renderAIMeasurementPanel(measurement, reportData) {
  if (!measurement || !measurement.facets || measurement.facets.length === 0) {
    return '<div class="bg-gray-800 rounded-lg p-4 text-center text-gray-500 text-sm">No facet data available</div>';
  }

  // Calculate scale factor from Solar API ground area vs AI polygon area
  const realGroundArea = reportData?.total_footprint_sqm || reportData?.total_footprint_sqft * 0.0929 || 100;
  const totalNormalizedArea = measurement.facets.reduce((acc, f) => acc + calcPolygonArea(f.points || []), 0);
  const scaleFactor = Math.sqrt(realGroundArea) / Math.sqrt(totalNormalizedArea || 1);

  // Process facets
  let totalSqFt = 0;
  const facets = measurement.facets.map((f, idx) => {
    const rawArea = calcPolygonArea(f.points || []);
    const projectedAreaM2 = rawArea * (scaleFactor * scaleFactor);
    const pitchDeg = parsePitch(f.pitch);
    const pitchMult = 1 / Math.cos((pitchDeg * Math.PI) / 180);
    const trueAreaM2 = projectedAreaM2 * pitchMult;
    const trueAreaSqFt = trueAreaM2 * 10.7639;
    totalSqFt += trueAreaSqFt;
    return { ...f, trueAreaSqFt, pitchDeg, idx };
  });

  // Process lines
  let lineSummary = {};
  (measurement.lines || []).forEach(line => {
    const rawLen = calcDistance(line.start, line.end);
    const projLen = rawLen * scaleFactor;
    const isSloped = ['HIP', 'VALLEY', 'RAKE'].includes(line.type);
    const trueLen = projLen * (isSloped ? 1.15 : 1.0) * 3.28084; // Convert to feet
    if (!lineSummary[line.type]) lineSummary[line.type] = { count: 0, totalFt: 0 };
    lineSummary[line.type].count++;
    lineSummary[line.type].totalFt += trueLen;
  });

  return `
    <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div class="p-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/50">
        <div class="flex items-center gap-2">
          <i class="fas fa-calculator text-green-400 text-sm"></i>
          <span class="font-semibold text-gray-200 text-sm">AI Measurement Report</span>
        </div>
        <span class="text-xs text-white font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
          ${Math.round(totalSqFt).toLocaleString()} sq ft
        </span>
      </div>

      <div class="grid grid-cols-2 gap-0 divide-x divide-gray-700">
        <!-- Line Measurements -->
        <div class="p-3">
          <h5 class="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <i class="fas fa-ruler text-xs"></i> Linear Measurements
          </h5>
          <div class="space-y-1.5">
            ${Object.entries(lineSummary).map(([type, stats]) => {
              const dotColor = type === 'RIDGE' ? 'bg-amber-500' : type === 'VALLEY' ? 'bg-blue-500' : type === 'EAVE' ? 'bg-green-500' : type === 'HIP' ? 'bg-orange-500' : 'bg-red-500';
              return `
                <div class="flex justify-between items-center px-2 py-1.5 bg-gray-700/30 rounded border border-gray-700/50">
                  <div class="flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full ${dotColor}"></div>
                    <span class="text-gray-300 text-xs capitalize">${type.toLowerCase()}s</span>
                    <span class="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">${stats.count}</span>
                  </div>
                  <span class="font-mono text-white text-xs">${Math.round(stats.totalFt)} ft</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Facet Measurements -->
        <div class="p-3">
          <h5 class="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <i class="fas fa-th text-xs"></i> Facet Details
          </h5>
          <div class="max-h-48 overflow-y-auto pr-1" style="-webkit-overflow-scrolling:touch">
            <table class="w-full text-xs text-left">
              <thead class="text-[10px] text-gray-500 uppercase sticky top-0 bg-gray-800">
                <tr>
                  <th class="px-1 py-1">ID</th>
                  <th class="px-1 py-1">Pitch</th>
                  <th class="px-1 py-1 text-right">Area</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700/30">
                ${facets.map(f => `
                  <tr class="hover:bg-gray-700/20">
                    <td class="px-1 py-1 text-gray-400 font-mono">#${f.idx + 1}</td>
                    <td class="px-1 py-1 text-gray-300">${Math.round(f.pitchDeg)}&deg;</td>
                    <td class="px-1 py-1 text-right text-white font-mono">${Math.round(f.trueAreaSqFt)} ft&sup2;</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// AI REPORT CARD
// ============================================================
function renderAIReportCard(report) {
  return `
    <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div class="bg-gradient-to-r from-blue-600 to-purple-600 p-3">
        <h4 class="text-sm font-bold text-white flex items-center gap-2">
          <i class="fas fa-file-alt"></i>AI Assessment Report
        </h4>
      </div>
      <div class="p-4 space-y-3">
        <div>
          <p class="text-[10px] font-medium text-gray-400 uppercase mb-1">Executive Summary</p>
          <p class="text-gray-200 text-xs leading-relaxed">${report.summary || 'N/A'}</p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-gray-700/50 p-2.5 rounded-lg border border-gray-600">
            <div class="flex items-center gap-1 mb-1 text-blue-400">
              <i class="fas fa-hammer text-xs"></i>
              <span class="font-semibold text-[10px]">Material</span>
            </div>
            <p class="text-white text-xs">${report.materialSuggestion || 'N/A'}</p>
          </div>
          <div class="bg-gray-700/50 p-2.5 rounded-lg border border-gray-600">
            <div class="flex items-center gap-1 mb-1 text-amber-400">
              <i class="fas fa-exclamation-triangle text-xs"></i>
              <span class="font-semibold text-[10px]">Difficulty</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-xl font-bold text-white">${report.difficultyScore || 0}</span>
              <span class="text-gray-400 text-xs">/10</span>
            </div>
            <div class="w-full bg-gray-600 h-1 rounded-full mt-1">
              <div class="bg-amber-400 h-1 rounded-full" style="width:${(report.difficultyScore || 0) * 10}%"></div>
            </div>
          </div>
          <div class="bg-gray-700/50 p-2.5 rounded-lg border border-gray-600">
            <div class="flex items-center gap-1 mb-1 text-green-400">
              <i class="fas fa-dollar-sign text-xs"></i>
              <span class="font-semibold text-[10px]">Est. Cost</span>
            </div>
            <p class="text-white font-mono text-xs">${report.estimatedCostRange || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// AI LINE SUMMARY (compact)
// ============================================================
function renderAILineSummary(measurement) {
  if (!measurement?.lines?.length) return '';

  const groups = {};
  (measurement.lines || []).forEach(l => {
    if (!groups[l.type]) groups[l.type] = 0;
    groups[l.type]++;
  });

  return `
    <div class="flex flex-wrap gap-2">
      ${Object.entries(groups).map(([type, count]) => {
        const colors = { RIDGE: 'bg-amber-500/20 text-amber-400 border-amber-700/50', HIP: 'bg-orange-500/20 text-orange-400 border-orange-700/50', VALLEY: 'bg-blue-500/20 text-blue-400 border-blue-700/50', EAVE: 'bg-green-500/20 text-green-400 border-green-700/50', RAKE: 'bg-red-500/20 text-red-400 border-red-700/50' };
        return '<span class="text-xs px-2 py-1 rounded-full border ' + (colors[type] || 'bg-gray-700 text-gray-400') + '">' + type + ': ' + count + '</span>';
      }).join('')}
    </div>
  `;
}

// ============================================================
// AI FACET TABLE
// ============================================================
function renderAIFacetTable(measurement) {
  if (!measurement?.facets?.length) return '';

  return `
    <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div class="p-3 border-b border-gray-700">
        <h4 class="text-xs font-semibold text-gray-300">AI-Detected Facet Details</h4>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left text-gray-400">
          <thead class="text-[10px] text-gray-500 uppercase bg-gray-900/50">
            <tr>
              <th class="px-3 py-2">Facet</th>
              <th class="px-3 py-2">Pitch</th>
              <th class="px-3 py-2">Azimuth</th>
              <th class="px-3 py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700/30">
            ${measurement.facets.map((f, idx) => `
              <tr class="hover:bg-gray-700/30">
                <td class="px-3 py-2 font-medium text-white">#${idx + 1}</td>
                <td class="px-3 py-2">${f.pitch || 'N/A'}</td>
                <td class="px-3 py-2">${f.azimuth || 'N/A'}</td>
                <td class="px-3 py-2 text-right">${f.points?.length || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// CHARTS — Segment Areas + Orientation Distribution
// Uses Chart.js loaded from CDN
// ============================================================
function renderAICharts(reportData) {
  if (typeof Chart === 'undefined') {
    // Load Chart.js dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
    script.onload = () => renderAICharts(reportData);
    document.head.appendChild(script);
    return;
  }

  const segments = reportData?.segments || [];
  if (segments.length === 0) return;

  // Segment Area Bar Chart
  const segCanvas = document.getElementById('ai-segment-chart');
  if (segCanvas) {
    new Chart(segCanvas, {
      type: 'bar',
      data: {
        labels: segments.map((s, i) => s.name || ('Seg ' + (i + 1))),
        datasets: [{
          label: 'True Area (sq ft)',
          data: segments.map(s => s.true_area_sqft || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9CA3AF', font: { size: 10 } }, grid: { color: '#374151' } },
          y: { ticks: { color: '#9CA3AF', font: { size: 10 } }, grid: { color: '#374151' } }
        }
      }
    });
  }

  // Orientation Pie Chart
  const oriCanvas = document.getElementById('ai-orientation-chart');
  if (oriCanvas) {
    const dirs = [
      { name: 'North', filter: s => s.azimuth_degrees > 315 || s.azimuth_degrees <= 45 },
      { name: 'East', filter: s => s.azimuth_degrees > 45 && s.azimuth_degrees <= 135 },
      { name: 'South', filter: s => s.azimuth_degrees > 135 && s.azimuth_degrees <= 225 },
      { name: 'West', filter: s => s.azimuth_degrees > 225 && s.azimuth_degrees <= 315 }
    ];

    const azData = dirs.map(d => ({
      name: d.name,
      value: segments.filter(d.filter).length
    })).filter(d => d.value > 0);

    const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    new Chart(oriCanvas, {
      type: 'doughnut',
      data: {
        labels: azData.map(d => d.name),
        datasets: [{
          data: azData.map(d => d.value),
          backgroundColor: colors.slice(0, azData.length),
          borderColor: '#1F2937',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9CA3AF', font: { size: 11 }, padding: 12 }
          }
        }
      }
    });
  }
}

// ============================================================
// GEOMETRY UTILITIES (mirrored from roofmetric-ai)
// ============================================================
function calcDistance(p1, p2) {
  return Math.sqrt(Math.pow((p2.x || 0) - (p1.x || 0), 2) + Math.pow((p2.y || 0) - (p1.y || 0), 2));
}

function calcPolygonArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (points[i].x || 0) * (points[j].y || 0);
    area -= (points[j].x || 0) * (points[i].y || 0);
  }
  return Math.abs(area) / 2;
}

function parsePitch(pitchStr) {
  if (!pitchStr) return 0;
  if (typeof pitchStr === 'number') return pitchStr;
  // Handle "X/12" format
  if (pitchStr.includes('/')) {
    const parts = pitchStr.split('/').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
      return (Math.atan(parts[0] / parts[1]) * 180) / Math.PI;
    }
  }
  // Handle "X deg" or raw number
  const deg = parseFloat(pitchStr);
  return isNaN(deg) ? 0 : deg;
}
