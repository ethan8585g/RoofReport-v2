// ============================================================
// Reuse Canada - Professional Landing Page
// Customer-facing marketing funnel with conversion CTAs
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('landing-root');
  if (!root) return;

  root.innerHTML = `
    ${renderHero()}
    ${renderTrustBar()}
    ${renderHowItWorks()}
    ${renderFeatures()}
    ${renderPricing()}
    ${renderSampleReport()}
    ${renderTestimonials()}
    ${renderFAQ()}
    ${renderFinalCTA()}
  `;

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Animate elements on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.scroll-animate').forEach(el => observer.observe(el));
});

// ============================================================
// HERO SECTION
// ============================================================
function renderHero() {
  return `
    <section class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 text-white">
      <!-- Background pattern -->
      <div class="absolute inset-0 opacity-10">
        <div class="absolute inset-0" style="background-image: url('data:image/svg+xml,%3Csvg width=60 height=60 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M30 0L60 30L30 60L0 30z%22 fill=%22none%22 stroke=%22white%22 stroke-width=%220.5%22/%3E%3C/svg%3E'); background-size: 60px 60px;"></div>
      </div>

      <div class="relative max-w-7xl mx-auto px-4 py-20 lg:py-28">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <!-- Left: Copy -->
          <div>
            <div class="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-400/30 rounded-full px-4 py-1.5 mb-6">
              <span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
              <span class="text-sm font-medium text-brand-200">Satellite-Powered Roof Measurement Technology</span>
            </div>

            <h1 class="text-4xl lg:text-6xl font-extrabold leading-tight mb-6">
              Professional Roof<br/>
              <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">Measurement Reports</span><br/>
              In Minutes
            </h1>

            <p class="text-lg lg:text-xl text-gray-300 mb-8 max-w-xl leading-relaxed">
              Get accurate roof area, pitch analysis, edge breakdowns, material estimates, and solar potential — all from a satellite image. Delivered to your inbox starting at <strong class="text-white">$8 CAD</strong>.
            </p>

            <div class="flex flex-col sm:flex-row gap-4 mb-8">
              <a href="/login" class="inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-bold py-4 px-8 rounded-xl text-lg shadow-xl shadow-accent-500/25 transition-all hover:scale-105">
                <i class="fas fa-ruler-combined"></i>
                Order a Report Now
              </a>
              <a href="#how-it-works" class="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold py-4 px-8 rounded-xl text-lg border border-white/20 transition-all">
                <i class="fas fa-play-circle"></i>
                How It Works
              </a>
            </div>

            <!-- Quick stats -->
            <div class="flex items-center gap-8 text-sm">
              <div class="flex items-center gap-2">
                <i class="fas fa-check-circle text-green-400"></i>
                <span class="text-gray-300">Reports from <strong class="text-white">$8</strong></span>
              </div>
              <div class="flex items-center gap-2">
                <i class="fas fa-check-circle text-green-400"></i>
                <span class="text-gray-300">As fast as <strong class="text-white">10 min</strong> delivery</span>
              </div>
              <div class="flex items-center gap-2">
                <i class="fas fa-check-circle text-green-400"></i>
                <span class="text-gray-300"><strong class="text-white">Satellite</strong> accuracy</span>
              </div>
            </div>
          </div>

          <!-- Right: Report Preview Card -->
          <div class="hidden lg:block relative">
            <div class="bg-white rounded-2xl shadow-2xl p-6 transform rotate-1 hover:rotate-0 transition-transform duration-500">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-brand-600 rounded-lg flex items-center justify-center">
                    <i class="fas fa-home text-white"></i>
                  </div>
                  <div>
                    <p class="font-bold text-gray-800 text-sm">Roof Measurement Report</p>
                    <p class="text-xs text-gray-400">v2.0 — Google Solar API</p>
                  </div>
                </div>
                <span class="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-semibold">HIGH Quality</span>
              </div>

              <!-- Simulated report metrics -->
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-brand-50 rounded-lg p-3 text-center">
                  <p class="text-2xl font-bold text-brand-700">3,826</p>
                  <p class="text-[10px] text-gray-500 uppercase">True Area (ft²)</p>
                </div>
                <div class="bg-blue-50 rounded-lg p-3 text-center">
                  <p class="text-2xl font-bold text-blue-700">12</p>
                  <p class="text-[10px] text-gray-500 uppercase">Roof Segments</p>
                </div>
                <div class="bg-accent-50 rounded-lg p-3 text-center">
                  <p class="text-2xl font-bold text-accent-700">21.6°</p>
                  <p class="text-[10px] text-gray-500 uppercase">Avg Pitch</p>
                </div>
              </div>

              <div class="grid grid-cols-5 gap-1.5 mb-4">
                ${['Ridge: 85ft', 'Hip: 148ft', 'Valley: 36ft', 'Eave: 166ft', 'Total: 435ft'].map((e, i) => {
                  const colors = ['bg-green-100 text-green-700', 'bg-blue-100 text-blue-700', 'bg-red-100 text-red-700', 'bg-amber-100 text-amber-700', 'bg-brand-100 text-brand-700'];
                  return `<div class="text-center p-1.5 ${colors[i]} rounded text-[10px] font-semibold">${e}</div>`;
                }).join('')}
              </div>

              <div class="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-500">Material Estimate</span>
                  <span class="font-bold text-brand-700">$8,427 CAD</span>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-400 mt-1">
                  <span>132 bundles • 44 squares • 15% waste</span>
                  <span class="text-amber-600 font-medium">Very Complex</span>
                </div>
              </div>
            </div>

            <!-- Floating badge -->
            <div class="absolute -bottom-4 -left-4 bg-brand-600 text-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
              <i class="fas fa-satellite text-brand-200"></i>
              <span class="text-sm font-semibold">Real satellite data</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Wave divider -->
      <div class="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full h-16">
          <path d="M0 120L48 105C96 90 192 60 288 52.5C384 45 480 60 576 67.5C672 75 768 75 864 67.5C960 60 1056 45 1152 45C1248 45 1344 60 1392 67.5L1440 75V120H0Z" fill="#ffffff"/>
        </svg>
      </div>
    </section>
  `;
}

// ============================================================
// TRUST BAR
// ============================================================
function renderTrustBar() {
  return `
    <section class="bg-white py-8 border-b border-gray-100">
      <div class="max-w-6xl mx-auto px-4">
        <div class="flex flex-wrap items-center justify-center gap-8 lg:gap-16 text-gray-400">
          <div class="flex items-center gap-2">
            <i class="fas fa-satellite text-xl text-brand-400"></i>
            <span class="text-xs font-medium">Satellite Imagery</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-drafting-compass text-xl text-brand-400"></i>
            <span class="text-xs font-medium">Precision Measurements</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-file-invoice text-xl text-brand-400"></i>
            <span class="text-xs font-medium">Material BOM</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-shield-alt text-xl text-brand-400"></i>
            <span class="text-xs font-medium">Secure & Private</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="fas fa-maple-leaf text-xl text-brand-400"></i>
            <span class="text-xs font-medium">Canadian Pricing</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// HOW IT WORKS
// ============================================================
function renderHowItWorks() {
  const steps = [
    {
      num: 1,
      icon: 'fas fa-map-marker-alt',
      color: 'bg-red-500',
      title: 'Enter the Address',
      desc: 'Search for the property and drop a pin on the exact roof you need measured. Our Google Maps integration pinpoints it instantly.'
    },
    {
      num: 2,
      icon: 'fas fa-user-edit',
      color: 'bg-blue-500',
      title: 'Fill Out Details',
      desc: "Enter the homeowner's name, your company info, and choose your delivery speed. Takes under 60 seconds."
    },
    {
      num: 3,
      icon: 'fas fa-credit-card',
      color: 'bg-accent-500',
      title: 'Pay & Order',
      desc: 'Secure checkout. From $8 CAD. Payment processes instantly and your report starts generating immediately.'
    },
    {
      num: 4,
      icon: 'fas fa-file-pdf',
      color: 'bg-brand-500',
      title: 'Receive Your Report',
      desc: 'Get a professional PDF with roof area, pitch, segments, edge breakdown, material BOM, solar potential — everything you need to quote.'
    }
  ];

  return `
    <section id="how-it-works" class="py-20 bg-white">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4">How It Works</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">From address to professional report in 4 simple steps. No climbing ladders, no measuring tapes, no drones.</p>
        </div>

        <div class="grid md:grid-cols-4 gap-8">
          ${steps.map((s, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700" style="transition-delay: ${i * 150}ms">
              <div class="relative">
                <div class="w-16 h-16 ${s.color} rounded-2xl flex items-center justify-center mb-5 shadow-lg">
                  <i class="${s.icon} text-white text-2xl"></i>
                </div>
                ${i < 3 ? '<div class="hidden md:block absolute top-8 left-20 w-full border-t-2 border-dashed border-gray-300"></div>' : ''}
              </div>
              <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Step ${s.num}</div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">${s.title}</h3>
              <p class="text-sm text-gray-500 leading-relaxed">${s.desc}</p>
            </div>
          `).join('')}
        </div>

        <div class="text-center mt-12 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <a href="/login" class="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all hover:scale-105">
            <i class="fas fa-arrow-right"></i>
            Start Your First Report
          </a>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// FEATURES
// ============================================================
function renderFeatures() {
  const features = [
    { icon: 'fas fa-ruler-combined', title: 'True 3D Area', desc: 'Not just footprint — we calculate actual surface area using pitch multipliers. Order materials with confidence.' },
    { icon: 'fas fa-draw-polygon', title: 'Edge Breakdown', desc: 'Every ridge, hip, valley, eave, and rake measured in both 2D plan length and true 3D length.' },
    { icon: 'fas fa-boxes', title: 'Material BOM', desc: 'Shingles, underlayment, ice shield, flashing, nails, vents — complete bill of materials with Alberta pricing.' },
    { icon: 'fas fa-layer-group', title: 'Segment Analysis', desc: 'Each roof plane individually measured with pitch, azimuth, direction, and area.' },
    { icon: 'fas fa-solar-panel', title: 'Solar Potential', desc: 'Bonus: maximum panel count, yearly energy production, and sunshine hours included free.' },
    { icon: 'fas fa-envelope', title: 'Email Delivery', desc: 'Reports delivered directly to your inbox as professional PDFs. Share with your team instantly.' },
  ];

  return `
    <section id="features" class="py-20 bg-gray-50">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4">What's in Your Report</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Every report includes professional-grade data that roofing contractors and estimators actually need.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          ${features.map((f, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 group bg-gray-50 hover:bg-white rounded-2xl p-6 border border-gray-200 hover:border-brand-300 hover:shadow-xl transition-all" style="transition-delay: ${i * 100}ms">
              <div class="w-12 h-12 bg-brand-100 group-hover:bg-brand-500 rounded-xl flex items-center justify-center mb-4 transition-colors">
                <i class="${f.icon} text-brand-600 group-hover:text-white text-lg transition-colors"></i>
              </div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">${f.title}</h3>
              <p class="text-sm text-gray-500 leading-relaxed">${f.desc}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// PRICING
// ============================================================
function renderPricing() {
  const plans = [
    {
      id: 'standard',
      name: 'Standard',
      price: 8,
      time: '1 hour',
      icon: 'fas fa-clock',
      color: 'brand',
      gradient: 'from-brand-500 to-brand-600',
      popular: false,
      features: ['Full measurement report', 'Edge breakdown', 'Material BOM', 'Solar potential analysis', 'PDF download', 'Email delivery']
    },
    {
      id: 'express',
      name: 'Express',
      price: 12,
      time: '10 minutes',
      icon: 'fas fa-bolt',
      color: 'accent',
      gradient: 'from-accent-500 to-accent-600',
      popular: true,
      features: ['Everything in Standard', 'Priority processing', 'Faster satellite fetch', 'Rush queue placement', 'Email notification', 'Instant PDF + Email']
    }
  ];

  return `
    <section id="pricing" class="py-20 bg-white">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Every plan includes the full professional report. The only difference is how fast you get it.</p>
        </div>

        <div class="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          ${plans.map((p, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 relative ${p.popular ? 'md:-mt-4 md:mb-[-16px]' : ''}" style="transition-delay: ${i * 150}ms">
              ${p.popular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">MOST POPULAR</div>' : ''}
              <div class="bg-white rounded-2xl border-2 ${p.popular ? 'border-accent-400 shadow-xl shadow-accent-500/10' : 'border-gray-200'} p-8 h-full flex flex-col hover:shadow-xl transition-shadow">
                <div class="w-14 h-14 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-4 shadow-lg">
                  <i class="${p.icon} text-white text-xl"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-800">${p.name}</h3>
                <p class="text-sm text-gray-500 mb-4 flex items-center gap-1">
                  <i class="fas fa-clock text-xs"></i> ${p.time}
                </p>
                <div class="mb-6">
                  <span class="text-5xl font-extrabold text-gray-900">$${p.price}</span>
                  <span class="text-gray-400 ml-1">CAD</span>
                </div>
                <ul class="space-y-3 mb-8 flex-1">
                  ${p.features.map(f => `
                    <li class="flex items-start gap-2 text-sm text-gray-600">
                      <i class="fas fa-check-circle text-brand-500 mt-0.5 flex-shrink-0"></i>
                      <span>${f}</span>
                    </li>
                  `).join('')}
                </ul>
                <a href="/login" class="block text-center py-3 px-6 rounded-xl font-bold transition-all ${p.popular ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg hover:scale-105' : 'bg-gray-100 hover:bg-brand-600 text-gray-700 hover:text-white'}">
                  Order ${p.name} Report
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// SAMPLE REPORT PREVIEW
// ============================================================
function renderSampleReport() {
  return `
    <section class="py-20 bg-gray-50">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <!-- Left: Report Preview -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700">
            <div class="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              <!-- Report header -->
              <div class="bg-gradient-to-r from-brand-700 to-brand-800 p-6 text-white">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-brand-200 text-xs uppercase tracking-wider">Professional Roof Measurement Report</p>
                    <p class="text-xl font-bold mt-1">11004 97 Avenue NW, Edmonton</p>
                    <p class="text-brand-200 text-sm">Order RM-20260209-2814 • v2.0</p>
                  </div>
                  <div class="text-right">
                    <span class="bg-green-400/20 text-green-300 text-xs px-3 py-1 rounded-full font-semibold">HIGH Quality</span>
                    <p class="text-brand-200 text-xs mt-2">90% Confidence</p>
                  </div>
                </div>
              </div>

              <!-- Key metrics -->
              <div class="p-6">
                <div class="grid grid-cols-4 gap-3 mb-6">
                  <div class="text-center p-3 bg-brand-50 rounded-lg">
                    <p class="text-xl font-bold text-brand-700">3,826</p>
                    <p class="text-[10px] text-gray-500 uppercase">Area (ft²)</p>
                  </div>
                  <div class="text-center p-3 bg-blue-50 rounded-lg">
                    <p class="text-xl font-bold text-blue-700">12</p>
                    <p class="text-[10px] text-gray-500 uppercase">Segments</p>
                  </div>
                  <div class="text-center p-3 bg-amber-50 rounded-lg">
                    <p class="text-xl font-bold text-amber-700">21.6°</p>
                    <p class="text-[10px] text-gray-500 uppercase">Pitch</p>
                  </div>
                  <div class="text-center p-3 bg-green-50 rounded-lg">
                    <p class="text-xl font-bold text-green-700">$8,427</p>
                    <p class="text-[10px] text-gray-500 uppercase">Materials</p>
                  </div>
                </div>

                <!-- Mini edge table -->
                <div class="text-xs">
                  <div class="grid grid-cols-5 gap-1">
                    ${[
                      { label: 'Ridge', val: '85 ft', color: 'text-green-600 bg-green-50' },
                      { label: 'Hip', val: '148 ft', color: 'text-blue-600 bg-blue-50' },
                      { label: 'Valley', val: '36 ft', color: 'text-red-600 bg-red-50' },
                      { label: 'Eave', val: '166 ft', color: 'text-amber-600 bg-amber-50' },
                      { label: 'Total', val: '435 ft', color: 'text-brand-600 bg-brand-50 font-bold' },
                    ].map(e => `<div class="p-2 ${e.color} rounded text-center"><div class="text-gray-400">${e.label}</div><div class="font-semibold">${e.val}</div></div>`).join('')}
                  </div>
                </div>

                <!-- Blurred preview -->
                <div class="mt-4 bg-gray-50 rounded-lg p-4 relative overflow-hidden">
                  <div class="filter blur-[2px]">
                    <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Architectural Shingles</span><span>132 bundles</span></div>
                    <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Synthetic Underlayment</span><span>5 rolls</span></div>
                    <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Ice & Water Shield</span><span>9 rolls</span></div>
                    <div class="flex justify-between text-xs text-gray-500"><span>Ridge Cap + Flashing</span><span>8 bundles</span></div>
                  </div>
                  <div class="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50 flex items-end justify-center pb-3">
                    <span class="text-xs text-gray-400 font-medium">Full BOM available in report</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Description -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700" style="transition-delay: 200ms">
            <div class="inline-flex items-center gap-2 bg-brand-100 text-brand-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
              <i class="fas fa-file-alt"></i> Sample Report
            </div>
            <h2 class="text-3xl font-extrabold text-gray-900 mb-4">Everything a Contractor Needs to Quote</h2>
            <p class="text-gray-500 mb-6 leading-relaxed">
              Every report includes professional-grade measurements sourced directly from Google's Solar API satellite data. 
              Real pitch angles, real segment areas, real edge lengths — not estimates.
            </p>

            <div class="space-y-4 mb-8">
              ${[
                { icon: 'fas fa-cube', text: 'True 3D surface area with pitch-adjusted multiplier' },
                { icon: 'fas fa-draw-polygon', text: '12+ edge types measured in plan and true 3D length' },
                { icon: 'fas fa-boxes', text: 'Full material BOM with Alberta retail pricing' },
                { icon: 'fas fa-th', text: 'Individual segment analysis (pitch, azimuth, direction)' },
                { icon: 'fas fa-chart-bar', text: 'Complexity rating and waste factor calculation' },
                { icon: 'fas fa-solar-panel', text: 'Free solar potential analysis included' },
              ].map(item => `
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="${item.icon} text-brand-600 text-sm"></i>
                  </div>
                  <p class="text-gray-600 text-sm">${item.text}</p>
                </div>
              `).join('')}
            </div>

            <a href="/login" class="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all hover:scale-105">
              <i class="fas fa-ruler-combined"></i>
              Get Your Report Now
            </a>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// TESTIMONIALS
// ============================================================
function renderTestimonials() {
  const testimonials = [
    {
      quote: "Saves me 2 hours per estimate. I used to climb every roof with a tape measure. Now I order a report, get the BOM, and quote the job from my truck.",
      name: "Mike D.",
      title: "Roofing Contractor, Calgary",
      avatar: "MD"
    },
    {
      quote: "The material BOM alone is worth the $8. I get shingle counts, underlayment rolls, even nail quantities. My supplier orders are accurate every time.",
      name: "Sarah K.",
      title: "Project Manager, Edmonton",
      avatar: "SK"
    },
    {
      quote: "We run 15-20 estimates a week. At $8 per report, we save thousands compared to drone surveys. Plus we get the solar data for free — our customers love it.",
      name: "James R.",
      title: "Owner, Prairie Roofing Co.",
      avatar: "JR"
    }
  ];

  return `
    <section class="py-20 bg-gray-50">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4">Trusted by Roofing Professionals</h2>
          <p class="text-lg text-gray-500">Contractors across Alberta are already using our reports to win more jobs.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          ${testimonials.map((t, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-lg transition-shadow" style="transition-delay: ${i * 150}ms">
              <div class="flex items-center gap-1 mb-4">
                ${[1,2,3,4,5].map(() => '<i class="fas fa-star text-accent-400 text-sm"></i>').join('')}
              </div>
              <p class="text-gray-600 text-sm leading-relaxed mb-6 italic">"${t.quote}"</p>
              <div class="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div class="w-10 h-10 bg-brand-600 rounded-full flex items-center justify-center text-white font-bold text-sm">${t.avatar}</div>
                <div>
                  <p class="font-semibold text-gray-800 text-sm">${t.name}</p>
                  <p class="text-xs text-gray-400">${t.title}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// FAQ
// ============================================================
function renderFAQ() {
  const faqs = [
    { q: 'What data source do you use for measurements?', a: "We use Google's Solar API, which provides high-resolution satellite imagery and 3D building models. The data includes precise roof segment geometry, pitch angles, azimuth orientation, and area calculations. This is the same data Google uses for their solar panel recommendations." },
    { q: 'How accurate are the measurements?', a: 'Google Solar API data is sourced from high-resolution aerial and satellite imagery with LiDAR-calibrated 3D models. For buildings with HIGH quality imagery, accuracy is typically within 2-5% of manual measurements. We display the confidence score and imagery quality on every report.' },
    { q: 'What areas do you cover?', a: "Currently available for most Canadian addresses where Google has Solar API coverage. Urban areas in Alberta, BC, Ontario, and Quebec have the best coverage. If we can't find Solar API data for your address, we'll use our AI vision engine as a fallback." },
    { q: 'Can I use this for insurance claims?', a: 'Our reports provide professional-grade measurements suitable for preliminary estimates and contractor quotes. For formal insurance claims, we recommend our reports as a starting reference alongside a physical inspection. The data comes from Google — a trusted, auditable source.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major credit cards (Visa, Mastercard, Amex) and debit cards through our secure Stripe payment processor. All transactions are encrypted and PCI-compliant.' },
    { q: 'Do you offer volume discounts?', a: 'Yes! Registered B2B customer companies get priority processing and volume pricing. Contact us to set up a business account with custom rates and monthly invoicing.' },
  ];

  return `
    <section id="faq" class="py-20 bg-white">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center mb-12 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-4">Frequently Asked Questions</h2>
        </div>

        <div class="space-y-4">
          ${faqs.map((faq, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden" style="transition-delay: ${i * 80}ms">
              <button onclick="toggleFAQ(this)" class="w-full text-left p-5 flex items-center justify-between hover:bg-gray-100 transition-colors">
                <span class="font-semibold text-gray-800 text-sm pr-4">${faq.q}</span>
                <i class="fas fa-chevron-down text-gray-400 transition-transform faq-icon flex-shrink-0"></i>
              </button>
              <div class="faq-answer hidden px-5 pb-5">
                <p class="text-sm text-gray-500 leading-relaxed">${faq.a}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// FAQ toggle
window.toggleFAQ = function(btn) {
  const answer = btn.nextElementSibling;
  const icon = btn.querySelector('.faq-icon');
  const isOpen = !answer.classList.contains('hidden');

  // Close all others
  document.querySelectorAll('.faq-answer').forEach(a => a.classList.add('hidden'));
  document.querySelectorAll('.faq-icon').forEach(i => i.style.transform = '');

  if (!isOpen) {
    answer.classList.remove('hidden');
    icon.style.transform = 'rotate(180deg)';
  }
};

// ============================================================
// FINAL CTA
// ============================================================
function renderFinalCTA() {
  return `
    <section class="py-20 bg-gradient-to-br from-brand-800 via-slate-900 to-brand-900 text-white relative overflow-hidden">
      <div class="absolute inset-0 opacity-5">
        <div class="absolute inset-0" style="background-image: url('data:image/svg+xml,%3Csvg width=40 height=40 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Ccircle cx=20 cy=20 r=1 fill=%22white%22/%3E%3C/svg%3E'); background-size: 40px 40px;"></div>
      </div>

      <div class="relative max-w-4xl mx-auto px-4 text-center scroll-animate opacity-0 translate-y-8 transition-all duration-700">
        <h2 class="text-3xl lg:text-5xl font-extrabold mb-6">
          Ready to Save Hours<br/>on Every Estimate?
        </h2>
        <p class="text-xl text-brand-200 mb-10 max-w-2xl mx-auto">
          Join roofing professionals across Canada who are quoting faster and more accurately with satellite-powered measurement reports.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <a href="/login" class="inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-xl shadow-accent-500/25 transition-all hover:scale-105">
            <i class="fas fa-ruler-combined"></i>
            Order Your First Report — $8
          </a>
        </div>

        <p class="text-sm text-brand-300">
          No subscription. No commitment. Pay per report.
          <br/>Questions? Email <strong>reports@reusecanada.ca</strong>
        </p>
      </div>
    </section>
  `;
}
