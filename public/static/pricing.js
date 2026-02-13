// ============================================================
// Pricing Page — Public, fetches packages and renders cards
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
  // Per-report pricing
  const perReport = [
    { tier: 'standard', label: 'Standard', desc: 'Delivered in ~1 hour', price: 8, icon: 'fa-clock', color: 'green' },
    { tier: 'express', label: 'Express', desc: 'Delivered in ~10 minutes', price: 12, icon: 'fa-bolt', color: 'red', popular: true },
  ];

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
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">Start with 3 free reports, then pay per report or save with credit packs.</p>
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
          <p class="text-sm text-gray-500">3 free reports included, then buy credits or pay per report</p>
        </div>
        <div class="text-center">
          <div class="w-14 h-14 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-brand-700 font-bold text-lg">3</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Enter Address</h3>
          <p class="text-sm text-gray-500">Type the property address and choose speed</p>
        </div>
        <div class="text-center">
          <div class="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span class="text-green-700 font-bold text-lg">4</span>
          </div>
          <h3 class="font-semibold text-gray-800 mb-1">Get Your Report</h3>
          <p class="text-sm text-gray-500">AI analysis with full measurements delivered fast</p>
        </div>
      </div>
    </div>

    <!-- Per-Report Pricing -->
    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Per-Report Pricing</h2>
    <div class="grid md:grid-cols-2 gap-6 mb-16 max-w-3xl mx-auto">
      ${perReport.map(p => `
        <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-shadow ${p.popular ? 'ring-2 ring-brand-500 relative' : ''}">
          ${p.popular ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-4 py-1 rounded-full text-xs font-bold">POPULAR</div>' : ''}
          <div class="text-center mb-6">
            <div class="w-14 h-14 bg-${p.color}-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <i class="fas ${p.icon} text-${p.color}-500 text-xl"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-800">${p.label}</h3>
            <p class="text-sm text-gray-500 mt-1">${p.desc}</p>
          </div>
          <div class="text-center mb-6">
            <span class="text-4xl font-black text-gray-900">$${p.price}</span>
            <span class="text-gray-500 text-sm ml-1">CAD / report</span>
          </div>
          <ul class="space-y-3 mb-6 text-sm">
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Satellite-based roof area</li>
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Pitch & azimuth analysis</li>
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Material quantity takeoff</li>
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Edge breakdown (ridge, hip, valley)</li>
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>Solar potential data</li>
            <li class="flex items-center gap-2 text-gray-600"><i class="fas fa-check text-green-500"></i>AI complexity scoring</li>
          </ul>
          <a href="/customer/login" class="block w-full py-3 text-center font-bold rounded-xl transition-all hover:scale-[1.02] ${p.popular ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}">
            Get Started
          </a>
        </div>
      `).join('')}
    </div>

    <!-- Credit Packs -->
    <h2 class="text-2xl font-bold text-gray-800 mb-2 text-center">Credit Packs — Save More</h2>
    <p class="text-center text-gray-500 mb-8">Buy credits in bulk and use them anytime. Credits never expire.</p>
    <div class="grid md:grid-cols-5 gap-4 mb-16">
      ${packages.map((pkg, i) => {
        const priceEach = (pkg.price_cents / 100 / pkg.credits).toFixed(2);
        const savings = pkg.credits > 1 ? Math.round((1 - (pkg.price_cents / 100) / (pkg.credits * 15)) * 100) : 0;
        const isBest = i === packages.length - 1;
        return `
          <div class="bg-white rounded-xl border ${isBest ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'} p-5 text-center hover:shadow-md transition-shadow relative">
            ${isBest ? '<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-3 py-0.5 rounded-full text-[10px] font-bold">BEST VALUE</div>' : ''}
            <h3 class="font-bold text-gray-800 text-lg mb-1">${pkg.name}</h3>
            <p class="text-xs text-gray-500 mb-3">${pkg.description}</p>
            <div class="mb-2">
              <span class="text-3xl font-black text-gray-900">$${(pkg.price_cents / 100).toFixed(0)}</span>
              <span class="text-gray-400 text-xs ml-1">CAD</span>
            </div>
            <p class="text-xs text-gray-500 mb-1">$${priceEach} per report</p>
            ${savings > 0 ? `<span class="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold mb-3">Save ${savings}%</span>` : '<div class="mb-3"></div>'}
            <a href="/customer/login" class="block w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-sm transition-all hover:scale-[1.02]">
              Buy ${pkg.credits} Credit${pkg.credits > 1 ? 's' : ''}
            </a>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Report includes -->
    <div class="bg-gradient-to-br from-brand-800 to-brand-900 rounded-2xl p-12 text-center text-white mb-12">
      <h2 class="text-2xl font-bold mb-4">Every Report Includes</h2>
      <div class="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        <div>
          <i class="fas fa-satellite text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">Satellite Imagery</h3>
          <p class="text-brand-200 text-sm">High-res Google Earth imagery with AI analysis</p>
        </div>
        <div>
          <i class="fas fa-ruler-combined text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">Precise Measurements</h3>
          <p class="text-brand-200 text-sm">3D area, pitch, edges, segments — all calculated</p>
        </div>
        <div>
          <i class="fas fa-file-invoice-dollar text-accent-400 text-3xl mb-3"></i>
          <h3 class="font-semibold mb-1">Material Takeoff</h3>
          <p class="text-brand-200 text-sm">Full bill of materials with CAD pricing</p>
        </div>
      </div>
      <a href="/customer/login" class="inline-block mt-8 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-xl text-lg transition-all hover:scale-105 shadow-lg">
        <i class="fas fa-gift mr-2"></i>Sign Up — 3 Free Reports
      </a>
    </div>
  `;
}
