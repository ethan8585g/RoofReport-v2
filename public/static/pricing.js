// ============================================================
// Pricing Page — Public, fetches packages and renders cards
// Updated pricing: 3 free → $10/ea individual → packs (10/$90, 25/$200, 50/$350, 100/$600)
// Subscription: $49.99/mo for CRM & business tools
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('pricing-root');
  if (!root) return;

  try {
    const res = await fetch('/api/stripe/packages');
    const data = await res.json();
    const packages = data.packages || [];
    renderPricing(root, packages);
  } catch (e) {
    root.innerHTML = '<div class="text-center text-red-500 py-8">Failed to load pricing. Please try again.</div>';
  }
});

function renderPricing(root, packages) {
  root.innerHTML = `
    <!-- Free Reports Banner -->
    <div class="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 mb-12 text-white text-center shadow-lg">
      <div class="flex items-center justify-center gap-3 mb-3">
        <i class="fas fa-gift text-3xl"></i>
        <h2 class="text-3xl font-extrabold">3 Free Reports When You Sign Up</h2>
      </div>
      <p class="text-green-100 text-lg mb-6">No credit card required. Create an account and get 3 professional roof measurement reports — completely free.</p>
      <a href="/customer/login" class="inline-flex items-center gap-2 bg-white text-green-700 font-bold py-3 px-8 rounded-xl text-lg shadow-lg transition-all hover:scale-105 hover:bg-green-50">
        <i class="fas fa-user-plus"></i>
        Sign Up Free
      </a>
    </div>

    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">Start with 3 free reports. After that, buy individual reports or save with credit packs.</p>
    </div>

    <!-- How it works -->
    <div class="bg-white rounded-2xl border border-gray-200 p-8 mb-12">
      <h2 class="text-xl font-bold text-gray-800 mb-6 text-center"><i class="fas fa-route text-brand-500 mr-2"></i>How It Works</h2>
      <div class="grid md:grid-cols-4 gap-6">
        <div class="text-center">
          <div class="w-14 h-14 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-brand-700 font-bold text-lg">1</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Create Account</h3>
          <p class="text-sm text-gray-500">Sign up free — get 3 reports instantly</p>
        </div>
        <div class="text-center">
          <div class="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-green-700 font-bold text-lg">2</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Use Free Reports</h3>
          <p class="text-sm text-gray-500">3 free reports included with every account</p>
        </div>
        <div class="text-center">
          <div class="w-14 h-14 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-brand-700 font-bold text-lg">3</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Enter Address</h3>
          <p class="text-sm text-gray-500">Type the property address and submit</p>
        </div>
        <div class="text-center">
          <div class="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-green-700 font-bold text-lg">4</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Get Your Report</h3>
          <p class="text-sm text-gray-500">AI-powered analysis with full measurements in seconds</p>
        </div>
      </div>
    </div>

    <!-- Per-Report Pricing -->
    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Individual Report</h2>
    <div class="max-w-lg mx-auto mb-16">
      <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-shadow ring-2 ring-brand-500 relative">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-4 py-1 rounded-full text-xs font-bold">PAY PER REPORT</div>
        <div class="text-center mb-6">
          <div class="w-14 h-14 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <i class="fas fa-bolt text-brand-500 text-xl"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-800">Roof Measurement Report</h3>
          <p class="text-sm text-gray-500 mt-1">Delivered instantly — no subscription required</p>
        </div>
        <div class="text-center mb-6">
          <span class="text-5xl font-black text-gray-900">$10</span>
          <span class="text-gray-500 text-sm ml-1">CAD / report</span>
        </div>
        <ul class="space-y-3 mb-6 text-sm">
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Satellite-based roof area & perimeter</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Pitch & azimuth analysis per facet</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Complete material takeoff with CAD pricing</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Edge breakdown (ridge, hip, valley, eave, rake)</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>AI roof geometry overlay with SVG diagram</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>14-image gallery (overhead, aerial, street-view)</li>
          <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Perimeter side-by-side measurements in ft & in</li>
        </ul>
        <a href="/customer/login" class="block w-full py-3 text-center font-bold rounded-xl transition-all hover:scale-[1.02] bg-brand-600 hover:bg-brand-700 text-white shadow-lg">
          Get Started
        </a>
      </div>
    </div>

    <!-- Credit Packs -->
    <h2 class="text-2xl font-bold text-gray-800 mb-2 text-center">Credit Packs — Save More</h2>
    <p class="text-center text-gray-500 mb-8">Buy credits in bulk and use them anytime. Credits never expire.</p>
    <div class="grid md:grid-cols-4 gap-5 mb-16 max-w-5xl mx-auto">
      ${packages.map((pkg, i) => {
        const priceEach = (pkg.price_cents / 100 / pkg.credits).toFixed(0);
        const savings = Math.round((1 - (pkg.price_cents / 100) / (pkg.credits * 10)) * 100);
        const isBest = i === packages.length - 1;
        const isPopular = i === 1; // 25-pack
        return `
          <div class="bg-white rounded-xl border ${isBest ? 'border-brand-500 ring-2 ring-brand-200' : isPopular ? 'border-accent-400 ring-2 ring-accent-200' : 'border-gray-200'} p-5 text-center hover:shadow-md transition-shadow relative">
            ${isBest ? '<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-3 py-0.5 rounded-full text-[10px] font-bold">BEST VALUE</div>' : ''}
            ${isPopular ? '<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent-500 text-white px-3 py-0.5 rounded-full text-[10px] font-bold">POPULAR</div>' : ''}
            <h3 class="font-bold text-gray-800 text-lg mb-1">${pkg.name}</h3>
            <div class="text-xs text-gray-500 mb-3">${pkg.credits} reports</div>
            <div class="mb-2">
              <span class="text-3xl font-black text-gray-900">$${(pkg.price_cents / 100).toFixed(0)}</span>
              <span class="text-gray-400 text-xs ml-1">CAD</span>
            </div>
            <p class="text-sm font-semibold text-brand-600 mb-1">$${priceEach}/report</p>
            ${savings > 0 ? `<span class="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold mb-3">Save ${savings}%</span>` : '<div class="mb-3"></div>'}
            <a href="/customer/login" class="block w-full py-2.5 ${isBest || isPopular ? 'bg-brand-600 hover:bg-brand-700' : 'bg-gray-800 hover:bg-gray-900'} text-white font-bold rounded-lg text-sm transition-all hover:scale-[1.02]">
              Buy ${pkg.credits} Credits
            </a>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Subscription Plan -->
    <div class="max-w-4xl mx-auto mb-16">
      <h2 class="text-2xl font-bold text-gray-800 mb-2 text-center">Pro Subscription</h2>
      <p class="text-center text-gray-500 mb-8">Get access to CRM, invoicing, proposals, job scheduling, and business tools.</p>
      <div class="bg-gradient-to-br from-brand-800 to-brand-900 rounded-2xl p-8 text-white shadow-xl">
        <div class="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div class="flex items-center gap-2 mb-4">
              <span class="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-bold"><i class="fas fa-crown mr-1"></i>PRO</span>
            </div>
            <h3 class="text-3xl font-black mb-2">$49.99 <span class="text-lg font-normal text-brand-200">/month</span></h3>
            <p class="text-brand-200 mb-6">Everything you need to run your roofing business — CRM, invoicing, proposals, scheduling, and more.</p>
            <a href="/customer/login" class="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-bold py-3 px-8 rounded-xl transition-all hover:scale-105 shadow-lg">
              <i class="fas fa-rocket"></i>
              Start Pro Trial
            </a>
          </div>
          <div>
            <ul class="space-y-3 text-sm">
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Customer Relationship Manager (CRM)</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Professional Invoicing</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Proposals & Estimates</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Job Scheduling & Crew Management</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Sales Pipeline Tracking</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Door-to-Door Manager</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Custom Branding on Reports</li>
              <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i>Priority Support</li>
            </ul>
            <p class="text-brand-300 text-xs mt-4"><i class="fas fa-info-circle mr-1"></i>Roof measurement reports are billed separately ($10/each or credit packs).</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Every Report Includes -->
    <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-12 text-center text-white mb-12">
      <h2 class="text-2xl font-bold mb-4">Every Report Includes</h2>
      <div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        <div>
          <i class="fas fa-satellite text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">14 Satellite Images</h3>
          <p class="text-gray-300 text-sm">Overhead, aerial, street-view, close-up quadrants</p>
        </div>
        <div>
          <i class="fas fa-ruler-combined text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">Precise Measurements</h3>
          <p class="text-gray-300 text-sm">3D roof area, perimeter side-by-side, pitch per facet</p>
        </div>
        <div>
          <i class="fas fa-file-invoice-dollar text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">Material Takeoff</h3>
          <p class="text-gray-300 text-sm">Full bill of materials with Canadian pricing</p>
        </div>
      </div>
      <a href="/customer/login" class="inline-block mt-8 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-xl text-lg transition-all hover:scale-105 shadow-lg">
        <i class="fas fa-gift mr-2"></i>Sign Up — 3 Free Reports
      </a>
    </div>

    <!-- Pricing Comparison Table -->
    <div class="max-w-4xl mx-auto mb-12">
      <h2 class="text-xl font-bold text-gray-800 mb-6 text-center">Pricing Comparison</h2>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-6 py-3 font-semibold text-gray-700">Package</th>
              <th class="text-center px-4 py-3 font-semibold text-gray-700">Reports</th>
              <th class="text-center px-4 py-3 font-semibold text-gray-700">Price/Report</th>
              <th class="text-center px-4 py-3 font-semibold text-gray-700">Total</th>
              <th class="text-center px-4 py-3 font-semibold text-gray-700">Savings</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr>
              <td class="px-6 py-3 font-medium text-gray-800">Individual</td>
              <td class="text-center px-4 py-3">1</td>
              <td class="text-center px-4 py-3">$10</td>
              <td class="text-center px-4 py-3 font-semibold">$10</td>
              <td class="text-center px-4 py-3 text-gray-400">—</td>
            </tr>
            <tr class="bg-gray-50/50">
              <td class="px-6 py-3 font-medium text-gray-800">10 Pack</td>
              <td class="text-center px-4 py-3">10</td>
              <td class="text-center px-4 py-3">$9</td>
              <td class="text-center px-4 py-3 font-semibold">$90</td>
              <td class="text-center px-4 py-3"><span class="text-green-600 font-semibold">Save 10%</span></td>
            </tr>
            <tr>
              <td class="px-6 py-3 font-medium text-gray-800">25 Pack <span class="text-xs bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded font-bold ml-1">POPULAR</span></td>
              <td class="text-center px-4 py-3">25</td>
              <td class="text-center px-4 py-3">$8</td>
              <td class="text-center px-4 py-3 font-semibold">$200</td>
              <td class="text-center px-4 py-3"><span class="text-green-600 font-semibold">Save 20%</span></td>
            </tr>
            <tr class="bg-gray-50/50">
              <td class="px-6 py-3 font-medium text-gray-800">50 Pack</td>
              <td class="text-center px-4 py-3">50</td>
              <td class="text-center px-4 py-3">$7</td>
              <td class="text-center px-4 py-3 font-semibold">$350</td>
              <td class="text-center px-4 py-3"><span class="text-green-600 font-semibold">Save 30%</span></td>
            </tr>
            <tr>
              <td class="px-6 py-3 font-medium text-gray-800">100 Pack <span class="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold ml-1">BEST VALUE</span></td>
              <td class="text-center px-4 py-3">100</td>
              <td class="text-center px-4 py-3">$6</td>
              <td class="text-center px-4 py-3 font-semibold">$600</td>
              <td class="text-center px-4 py-3"><span class="text-green-600 font-semibold">Save 40%</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-center text-gray-400 text-xs mt-4">All prices in Canadian Dollars (CAD). Credits never expire. GST/HST may apply.</p>
    </div>
  `;
}
