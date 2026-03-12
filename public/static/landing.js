// ============================================================
// RoofReporterAI - Premium Landing Page (Redesigned)
// Inspired by EagleView + Loveland Innovations
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('landing-root');
  if (!root) return;

  root.innerHTML = `
    ${renderHero()}
    ${renderStatsBar()}
    ${renderValueProp()}
    ${renderHowItWorks()}
    ${renderPlatformShowcase()}
    ${renderFeatureGrid()}
    ${renderPricing()}
    ${renderTestimonials()}
    ${renderIntegrations()}
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

  // Counter animation for stats
  document.querySelectorAll('[data-count]').forEach(el => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(el);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    obs.observe(el);
  });
});

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-count'));
  const suffix = el.getAttribute('data-suffix') || '';
  const prefix = el.getAttribute('data-prefix') || '';
  const duration = 2000;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ============================================================
// HERO — Full-bleed aerial image background (Loveland style)
// ============================================================
function renderHero() {
  return `
    <section class="relative min-h-[90vh] flex items-center overflow-hidden">
      <!-- Background: aerial roof with measurement overlay -->
      <div class="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1920&q=80&auto=format&fit=crop"
             alt="Aerial view of residential house" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40"></div>
        <!-- Subtle grid overlay for tech feel -->
        <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px); background-size: 40px 40px;"></div>
      </div>

      <!-- Animated measurement lines SVG overlay -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <svg class="absolute right-[10%] top-[20%] w-[400px] h-[300px] opacity-30" viewBox="0 0 400 300">
          <line x1="20" y1="40" x2="380" y2="40" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="8 4">
            <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="2s" repeatCount="indefinite"/>
          </line>
          <line x1="200" y1="40" x2="350" y2="260" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="8 4">
            <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="2.5s" repeatCount="indefinite"/>
          </line>
          <line x1="200" y1="40" x2="50" y2="260" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="8 4">
            <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="2.5s" repeatCount="indefinite"/>
          </line>
          <line x1="50" y1="260" x2="350" y2="260" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="8 4">
            <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="2s" repeatCount="indefinite"/>
          </line>
          <!-- Measurement labels -->
          <rect x="160" y="20" width="80" height="22" rx="4" fill="rgba(6,182,212,0.15)" stroke="#22d3ee" stroke-width="0.5"/>
          <text x="200" y="35" fill="#22d3ee" font-size="11" text-anchor="middle" font-family="monospace">85.2 ft</text>
          <rect x="290" y="140" width="72" height="22" rx="4" fill="rgba(6,182,212,0.15)" stroke="#22d3ee" stroke-width="0.5"/>
          <text x="326" y="155" fill="#22d3ee" font-size="11" text-anchor="middle" font-family="monospace">148 ft</text>
          <!-- Corner dots -->
          <circle cx="20" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/></circle>
          <circle cx="380" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" begin="0.3s"/></circle>
          <circle cx="200" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" begin="0.6s"/></circle>
          <circle cx="50" cy="260" r="4" fill="#22d3ee" opacity="0.7"/>
          <circle cx="350" cy="260" r="4" fill="#22d3ee" opacity="0.7"/>
        </svg>
      </div>

      <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-32 lg:py-40">
        <div class="max-w-3xl">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-5 py-2 mb-8 backdrop-blur-sm">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
            </span>
            <span class="text-sm font-medium text-cyan-200 tracking-wide">Satellite-Powered Roof Intelligence</span>
          </div>

          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] text-white mb-6 tracking-tight">
            Precision Roof<br/>
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-400">Measurement</span><br/>
            Reports
          </h1>

          <p class="text-xl lg:text-2xl text-gray-300 mb-10 max-w-2xl leading-relaxed font-light">
            From satellite imagery to professional PDF in under 60 seconds. Accurate area, pitch, edges, materials, and solar analysis for every roof in Canada.
          </p>

          <div class="flex flex-col sm:flex-row gap-4 mb-12">
            <a href="/customer/login" class="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-2xl shadow-cyan-500/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-cyan-500/40">
              <i class="fas fa-gift"></i>
              Get 3 Free Reports
              <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
            </a>
            <a href="#how-it-works" class="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur-md text-white font-semibold py-4 px-8 rounded-xl text-lg border border-white/10 hover:border-white/25 transition-all duration-300">
              <i class="fas fa-play-circle text-cyan-400"></i>
              See How It Works
            </a>
          </div>

          <!-- Quick proof points -->
          <div class="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div class="flex items-center gap-2 text-gray-300">
              <div class="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <i class="fas fa-check text-green-400 text-[10px]"></i>
              </div>
              <span><strong class="text-white">3 free reports</strong> on signup</span>
            </div>
            <div class="flex items-center gap-2 text-gray-300">
              <div class="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <i class="fas fa-check text-green-400 text-[10px]"></i>
              </div>
              <span>Reports in <strong class="text-white">under 60 seconds</strong></span>
            </div>
            <div class="flex items-center gap-2 text-gray-300">
              <div class="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <i class="fas fa-check text-green-400 text-[10px]"></i>
              </div>
              <span><strong class="text-white">Full CRM</strong> included free</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Scroll indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div class="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center pt-2">
          <div class="w-1 h-3 bg-white/40 rounded-full animate-bounce"></div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// STATS BAR — EagleView "Proof in Performance" style
// ============================================================
function renderStatsBar() {
  const stats = [
    { value: 10000, suffix: '+', label: 'Reports Generated', icon: 'fas fa-file-alt' },
    { value: 98, suffix: '%', label: 'Measurement Accuracy', icon: 'fas fa-bullseye' },
    { value: 60, suffix: 's', label: 'Average Delivery', prefix: '<', icon: 'fas fa-bolt' },
    { value: 8, suffix: '', label: 'Per Report (CAD)', prefix: '$', icon: 'fas fa-dollar-sign' },
  ];

  return `
    <section class="relative z-20 -mt-1">
      <div class="max-w-7xl mx-auto px-4">
        <div class="bg-white rounded-2xl shadow-xl border border-gray-100 grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100">
          ${stats.map((s, i) => `
            <div class="p-6 lg:p-8 text-center group hover:bg-gradient-to-b hover:from-cyan-50/50 hover:to-transparent transition-colors duration-300 ${i === 0 ? 'rounded-l-2xl' : ''} ${i === 3 ? 'rounded-r-2xl' : ''}">
              <div class="w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center group-hover:from-cyan-100 group-hover:to-blue-100 transition-colors">
                <i class="${s.icon} text-cyan-600 text-sm"></i>
              </div>
              <div class="text-3xl lg:text-4xl font-black text-gray-900 mb-1" data-count="${s.value}" data-suffix="${s.suffix || ''}" data-prefix="${s.prefix || ''}">${s.prefix || ''}0${s.suffix || ''}</div>
              <div class="text-xs text-gray-500 font-medium uppercase tracking-wider">${s.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// VALUE PROPOSITION — EagleView "Distinctive Blend" style
// ============================================================
function renderValueProp() {
  const pillars = [
    {
      icon: 'fas fa-satellite-dish',
      title: 'Satellite Intelligence',
      desc: "Powered by Google's Solar API with high-resolution aerial imagery and LiDAR-calibrated 3D building models. Industry-leading data accuracy.",
      img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80&auto=format&fit=crop'
    },
    {
      icon: 'fas fa-brain',
      title: 'AI-Powered Analysis',
      desc: 'Our AI engine processes roof geometry, calculates pitch-adjusted areas, identifies every edge type, and generates material BOMs instantly.',
      img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80&auto=format&fit=crop'
    },
    {
      icon: 'fas fa-users-cog',
      title: 'Built for Roofing Teams',
      desc: 'Full CRM, team management, AI Secretary for calls, Door-to-Door manager, virtual try-on, and integrated invoicing. Everything in one platform.',
      img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80&auto=format&fit=crop'
    }
  ];

  return `
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-sparkles"></i> Why RoofReporterAI
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
            A Complete Roofing<br/>Business Platform
          </h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Precision measurements, AI-powered tools, and a full CRM — everything you need to run and grow your roofing business.</p>
        </div>

        <div class="grid lg:grid-cols-3 gap-8">
          ${pillars.map((p, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 group" style="transition-delay: ${i * 150}ms">
              <div class="relative overflow-hidden rounded-2xl bg-gray-50 border border-gray-100 hover:border-cyan-200 hover:shadow-2xl hover:shadow-cyan-500/5 transition-all duration-500">
                <div class="h-48 overflow-hidden">
                  <img src="${p.img}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div class="absolute inset-0 bg-gradient-to-t from-gray-50 via-transparent to-transparent"></div>
                </div>
                <div class="p-6">
                  <div class="w-12 h-12 -mt-12 relative z-10 bg-white rounded-xl shadow-lg flex items-center justify-center mb-4 border border-gray-100">
                    <i class="${p.icon} text-cyan-600 text-lg"></i>
                  </div>
                  <h3 class="text-xl font-bold text-gray-900 mb-2">${p.title}</h3>
                  <p class="text-gray-500 text-sm leading-relaxed">${p.desc}</p>
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
// HOW IT WORKS — 4-step process
// ============================================================
function renderHowItWorks() {
  const steps = [
    { num: 1, icon: 'fas fa-search-location', color: 'from-red-500 to-rose-500', title: 'Enter the Address', desc: 'Search any Canadian address. Our Google Maps integration pinpoints the exact roof instantly.' },
    { num: 2, icon: 'fas fa-sliders-h', color: 'from-blue-500 to-indigo-500', title: 'Configure Details', desc: "Add homeowner info, your company details, and choose delivery options. Takes 30 seconds." },
    { num: 3, icon: 'fas fa-credit-card', color: 'from-amber-500 to-orange-500', title: 'Order Instantly', desc: 'First 3 reports are FREE. Then just $8 CAD per report. Instant Square checkout.' },
    { num: 4, icon: 'fas fa-file-pdf', color: 'from-cyan-500 to-blue-500', title: 'Get Your PDF', desc: 'Professional report with area, pitch, edges, BOM, solar data — delivered in under 60 seconds.' },
  ];

  return `
    <section id="how-it-works" class="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-route"></i> Simple Process
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
            Address to Report<br/>in 4 Steps
          </h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">No ladders. No drones. No tape measures. Just enter an address and get a professional measurement report.</p>
        </div>

        <div class="grid md:grid-cols-4 gap-6 relative">
          <!-- Connecting line -->
          <div class="hidden md:block absolute top-12 left-[calc(12.5%+24px)] right-[calc(12.5%+24px)] h-0.5 bg-gradient-to-r from-red-200 via-blue-200 to-cyan-200"></div>

          ${steps.map((s, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 relative" style="transition-delay: ${i * 150}ms">
              <div class="relative z-10">
                <div class="w-14 h-14 mx-auto bg-gradient-to-br ${s.color} rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-gray-900/10 ring-4 ring-white">
                  <i class="${s.icon} text-white text-xl"></i>
                </div>
              </div>
              <div class="text-center">
                <div class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Step ${s.num}</div>
                <h3 class="text-lg font-bold text-gray-900 mb-2">${s.title}</h3>
                <p class="text-sm text-gray-500 leading-relaxed">${s.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="text-center mt-14 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <a href="/customer/login" class="group inline-flex items-center gap-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-xl shadow-blue-500/20 transition-all duration-300 hover:scale-[1.02]">
            <i class="fas fa-gift"></i>
            Start Free — 3 Reports Included
            <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </a>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// PLATFORM SHOWCASE — EagleView "Industry Applications" style
// ============================================================
function renderPlatformShowcase() {
  const modules = [
    {
      title: 'Instant Roof Measurement Reports',
      desc: 'Professional PDF reports with 3D area, pitch analysis, edge breakdowns, material BOM, and solar potential — all from satellite imagery in under 60 seconds.',
      cta: 'Order a Report',
      ctaLink: '/customer/login',
      img: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80&auto=format&fit=crop',
      reverse: false
    },
    {
      title: 'AI Roofer Secretary',
      desc: 'Never miss a lead again. Our AI answers your business phone 24/7, books appointments, qualifies leads, and sends you detailed call summaries. Sounds like a real human.',
      cta: 'Learn More',
      ctaLink: '/customer/login',
      img: 'https://images.unsplash.com/photo-1596524430615-b46475ddff6e?w=800&q=80&auto=format&fit=crop',
      reverse: true
    },
    {
      title: 'Full CRM & Business Management',
      desc: 'Manage customers, create invoices, send proposals, track jobs, and manage your door-to-door sales team — all in one integrated platform built for roofers.',
      cta: 'Explore CRM',
      ctaLink: '/customer/login',
      img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop',
      reverse: false
    },
    {
      title: 'Virtual Roof Try-On',
      desc: 'Show homeowners what their roof will look like with different materials before they buy. AI-powered visualization that closes more deals.',
      cta: 'See Demo',
      ctaLink: '/customer/login',
      img: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80&auto=format&fit=crop',
      reverse: true
    }
  ];

  return `
    <section id="features" class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-20 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-th-large"></i> Complete Platform
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
            Everything a Roofing<br/>Business Needs
          </h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">From measurement to close. One platform for reports, CRM, AI phone answering, sales management, and more.</p>
        </div>

        <div class="space-y-24">
          ${modules.map((m, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center" style="transition-delay: ${i * 100}ms">
              <div class="${m.reverse ? 'lg:order-2' : ''}">
                <h3 class="text-2xl lg:text-3xl font-bold text-gray-900 mb-4 leading-tight">${m.title}</h3>
                <p class="text-gray-500 text-lg leading-relaxed mb-6">${m.desc}</p>
                <a href="${m.ctaLink}" class="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-semibold group">
                  ${m.cta}
                  <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
                </a>
              </div>
              <div class="${m.reverse ? 'lg:order-1' : ''}">
                <div class="relative rounded-2xl overflow-hidden shadow-2xl shadow-gray-900/10 ring-1 ring-gray-900/5">
                  <img src="${m.img}" alt="${m.title}" class="w-full h-[320px] object-cover" />
                  <div class="absolute inset-0 bg-gradient-to-t from-gray-900/20 to-transparent"></div>
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
// FEATURE GRID — What's in your report
// ============================================================
function renderFeatureGrid() {
  const features = [
    { icon: 'fas fa-ruler-combined', title: 'True 3D Area', desc: 'Pitch-adjusted surface area, not just footprint. Order materials with confidence.' },
    { icon: 'fas fa-draw-polygon', title: 'Edge Breakdown', desc: 'Ridge, hip, valley, eave, and rake — measured in plan and true 3D length.' },
    { icon: 'fas fa-boxes-stacked', title: 'Material BOM', desc: 'Shingles, underlayment, ice shield, flashing, nails — complete with Alberta pricing.' },
    { icon: 'fas fa-layer-group', title: 'Segment Analysis', desc: 'Each roof plane individually measured with pitch, azimuth, and direction.' },
    { icon: 'fas fa-solar-panel', title: 'Solar Potential', desc: 'Panel count, yearly energy, and sunshine hours — included free on every report.' },
    { icon: 'fas fa-chart-line', title: 'Complexity Rating', desc: 'Automatic complexity scoring and waste factor calculation for accurate quoting.' },
  ];

  return `
    <section class="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-file-alt"></i> Report Contents
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">What's In Every Report</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Professional-grade data that roofing contractors and estimators actually need to quote jobs accurately.</p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          ${features.map((f, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 group" style="transition-delay: ${i * 80}ms">
              <div class="h-full bg-white rounded-2xl p-7 border border-gray-100 hover:border-cyan-200 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300">
                <div class="w-12 h-12 bg-gradient-to-br from-cyan-50 to-blue-50 group-hover:from-cyan-500 group-hover:to-blue-500 rounded-xl flex items-center justify-center mb-4 transition-all duration-300">
                  <i class="${f.icon} text-cyan-600 group-hover:text-white text-lg transition-colors duration-300"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-900 mb-2">${f.title}</h3>
                <p class="text-sm text-gray-500 leading-relaxed">${f.desc}</p>
              </div>
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
  return `
    <section id="pricing" class="py-24 bg-white">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-amber-50 text-amber-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-tag"></i> Simple Pricing
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">Transparent, Per-Report Pricing</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">No subscriptions. No commitments. Pay per report, starting at $8 CAD. Your first 3 are free.</p>
        </div>

        <div class="grid lg:grid-cols-2 gap-8 items-start">
          <!-- Report pricing card -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 relative">
            <div class="absolute -top-4 left-8 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">MOST POPULAR</div>
            <div class="bg-white rounded-2xl border-2 border-cyan-200 shadow-xl shadow-cyan-500/5 p-8">
              <div class="flex items-center gap-4 mb-6">
                <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <i class="fas fa-file-alt text-white text-xl"></i>
                </div>
                <div>
                  <h3 class="text-xl font-bold text-gray-900">Roof Measurement Report</h3>
                  <p class="text-sm text-gray-500">Full professional report</p>
                </div>
              </div>
              <div class="mb-8">
                <div class="flex items-baseline gap-1">
                  <span class="text-5xl font-black text-gray-900">$8</span>
                  <span class="text-xl text-gray-400">CAD</span>
                  <span class="text-sm text-gray-400 ml-1">per report</span>
                </div>
                <p class="text-sm text-cyan-600 font-medium mt-2">
                  <i class="fas fa-gift mr-1"></i>First 3 reports are FREE on signup
                </p>
              </div>
              <ul class="space-y-3 mb-8">
                ${['Full 3D area with pitch adjustment', 'Complete edge breakdown (ridge, hip, valley, eave)', 'Material BOM with Alberta pricing', 'Individual segment analysis', 'Solar potential analysis', 'Professional PDF download', 'Email delivery included', 'AI measurement overlay'].map(f => `
                  <li class="flex items-start gap-3 text-sm text-gray-600">
                    <i class="fas fa-check-circle text-cyan-500 mt-0.5 flex-shrink-0"></i>
                    <span>${f}</span>
                  </li>
                `).join('')}
              </ul>
              <a href="/customer/login" class="block text-center py-4 px-6 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg transition-all hover:scale-[1.02]">
                Get Started Free
              </a>
            </div>
          </div>

          <!-- Add-ons card -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 space-y-6" style="transition-delay: 150ms">
            <!-- Secretary -->
            <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:border-indigo-200 hover:shadow-lg transition-all">
              <div class="flex items-center gap-4 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <i class="fas fa-phone-alt text-white text-sm"></i>
                </div>
                <div>
                  <h4 class="font-bold text-gray-900">AI Roofer Secretary</h4>
                  <p class="text-sm text-gray-500">24/7 AI phone answering</p>
                </div>
                <div class="ml-auto text-right">
                  <span class="text-2xl font-black text-gray-900">$149</span>
                  <span class="text-sm text-gray-400">/mo</span>
                </div>
              </div>
              <p class="text-sm text-gray-500">AI answers your calls, books appointments, qualifies leads, and sends summaries. Never miss a lead.</p>
            </div>

            <!-- Team Members -->
            <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:border-emerald-200 hover:shadow-lg transition-all">
              <div class="flex items-center gap-4 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                  <i class="fas fa-users text-white text-sm"></i>
                </div>
                <div>
                  <h4 class="font-bold text-gray-900">Team Members</h4>
                  <p class="text-sm text-gray-500">Add salespeople to your account</p>
                </div>
                <div class="ml-auto text-right">
                  <span class="text-2xl font-black text-gray-900">$50</span>
                  <span class="text-sm text-gray-400">/user/mo</span>
                </div>
              </div>
              <p class="text-sm text-gray-500">Each member gets full access: reports, CRM, AI Secretary, Virtual Try-On, and D2D Manager.</p>
            </div>

            <!-- Free CRM -->
            <div class="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200 p-6">
              <div class="flex items-center gap-4 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                  <i class="fas fa-th-large text-white text-sm"></i>
                </div>
                <div>
                  <h4 class="font-bold text-gray-900">CRM & Business Tools</h4>
                  <p class="text-sm text-gray-500">Included with every account</p>
                </div>
                <div class="ml-auto">
                  <span class="text-lg font-bold text-emerald-600">FREE</span>
                </div>
              </div>
              <p class="text-sm text-gray-500">Customers, invoices, proposals, jobs, door-to-door manager, virtual try-on, and team management — all included.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// TESTIMONIALS — EagleView style
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
      quote: "The material BOM alone is worth the $8. Shingle counts, underlayment rolls, nail quantities. My supplier orders are dead accurate every single time now.",
      name: "Sarah K.",
      title: "Project Manager, Edmonton",
      avatar: "SK"
    },
    {
      quote: "We run 15-20 estimates a week. At $8 per report we save thousands vs drone surveys. Plus we get the solar data free — customers love seeing that.",
      name: "James R.",
      title: "Owner, Prairie Roofing Co.",
      avatar: "JR"
    }
  ];

  return `
    <section class="py-24 bg-gradient-to-b from-slate-900 to-slate-800 text-white relative overflow-hidden">
      <!-- Background pattern -->
      <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 32px 32px;"></div>

      <div class="relative max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h2 class="text-3xl lg:text-4xl font-black mb-4 tracking-tight">Trusted by Roofing Professionals</h2>
          <p class="text-gray-400 text-lg">Contractors across Canada are saving time and winning more jobs.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          ${testimonials.map((t, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700" style="transition-delay: ${i * 150}ms">
              <div class="h-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
                <div class="flex items-center gap-1 mb-4">
                  ${[1,2,3,4,5].map(() => '<i class="fas fa-star text-amber-400 text-sm"></i>').join('')}
                </div>
                <p class="text-gray-300 text-sm leading-relaxed mb-6">"${t.quote}"</p>
                <div class="flex items-center gap-3 pt-4 border-t border-white/10">
                  <div class="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">${t.avatar}</div>
                  <div>
                    <p class="font-semibold text-white text-sm">${t.name}</p>
                    <p class="text-xs text-gray-400">${t.title}</p>
                  </div>
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
// INTEGRATIONS / TRUST BAR
// ============================================================
function renderIntegrations() {
  return `
    <section class="py-16 bg-white border-b border-gray-100">
      <div class="max-w-6xl mx-auto px-4">
        <p class="text-center text-sm text-gray-400 uppercase tracking-wider font-semibold mb-8">Powered By & Integrated With</p>
        <div class="flex flex-wrap items-center justify-center gap-x-14 gap-y-6 text-gray-300">
          <div class="flex items-center gap-2.5 text-gray-500 hover:text-gray-700 transition-colors">
            <i class="fab fa-google text-2xl"></i>
            <span class="text-sm font-medium">Google Solar API</span>
          </div>
          <div class="flex items-center gap-2.5 text-gray-500 hover:text-gray-700 transition-colors">
            <i class="fab fa-square-full text-2xl"></i>
            <span class="text-sm font-medium">Square Payments</span>
          </div>
          <div class="flex items-center gap-2.5 text-gray-500 hover:text-gray-700 transition-colors">
            <i class="fas fa-robot text-2xl"></i>
            <span class="text-sm font-medium">Google Gemini AI</span>
          </div>
          <div class="flex items-center gap-2.5 text-gray-500 hover:text-gray-700 transition-colors">
            <i class="fas fa-satellite text-2xl"></i>
            <span class="text-sm font-medium">Satellite Imagery</span>
          </div>
          <div class="flex items-center gap-2.5 text-gray-500 hover:text-gray-700 transition-colors">
            <i class="fas fa-maple-leaf text-2xl"></i>
            <span class="text-sm font-medium">Canadian Markets</span>
          </div>
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
    { q: 'What data source do you use?', a: "We use Google's Solar API, providing high-resolution satellite imagery with LiDAR-calibrated 3D building models. This is the same data Google uses for their solar panel recommendations — the most accurate publicly available roof geometry data." },
    { q: 'How accurate are the measurements?', a: 'For buildings with HIGH quality imagery (most urban Canadian addresses), accuracy is typically within 2-5% of manual measurements. We display confidence scores and imagery quality on every report so you know exactly what you are getting.' },
    { q: 'What areas do you cover?', a: "Most Canadian addresses where Google has Solar API coverage. Urban areas in Alberta, BC, Ontario, and Quebec have the best coverage. If Solar API data isn't available, our AI vision engine provides a fallback analysis." },
    { q: 'How fast do I get my report?', a: 'Most reports are generated in under 60 seconds. You receive an email with a download link and can also access all reports from your dashboard. Reports are professional-grade PDFs ready to share with clients.' },
    { q: 'What is the AI Roofer Secretary?', a: 'It is a 24/7 AI-powered phone answering service for your roofing business. It answers calls in a natural human voice, books appointments, qualifies leads, and sends you summaries. $149/month subscription through Square.' },
    { q: 'Can I add team members?', a: 'Yes! For $50/user/month, you can invite salespeople and other team members. They get full access to order reports, use the CRM, AI Secretary, Virtual Try-On, and Door-to-Door manager under your account.' },
    { q: 'What payment methods do you accept?', a: 'All major credit cards (Visa, Mastercard, Amex), debit cards, Apple Pay, Google Pay, and Cash App through our secure Square payment processor. All transactions are encrypted and PCI-compliant.' },
    { q: 'Do you offer volume discounts?', a: 'Yes! B2B customer companies get priority processing and volume pricing. Contact us to set up a business account with custom rates and monthly invoicing.' },
  ];

  return `
    <section id="faq" class="py-24 bg-gray-50">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center mb-12 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-gray-200 text-gray-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-question-circle"></i> FAQ
          </div>
          <h2 class="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">Frequently Asked Questions</h2>
        </div>

        <div class="space-y-3">
          ${faqs.map((faq, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow" style="transition-delay: ${i * 50}ms">
              <button onclick="toggleFAQ(this)" class="w-full text-left p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <span class="font-semibold text-gray-800 text-sm pr-4">${faq.q}</span>
                <i class="fas fa-chevron-down text-gray-400 transition-transform duration-300 faq-icon flex-shrink-0"></i>
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
    <section class="relative py-28 overflow-hidden">
      <!-- Background image -->
      <div class="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80&auto=format&fit=crop"
             alt="Modern building" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-cyan-900/80"></div>
      </div>

      <div class="relative max-w-4xl mx-auto px-4 text-center scroll-animate opacity-0 translate-y-8 transition-all duration-700">
        <h2 class="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tight leading-tight">
          Ready to Save Hours<br/>on Every Estimate?
        </h2>
        <p class="text-xl text-gray-300 mb-10 max-w-2xl mx-auto font-light">
          Join hundreds of roofing professionals across Canada who are quoting faster and more accurately with satellite-powered measurement reports.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <a href="/customer/login" class="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-2xl shadow-cyan-500/30 transition-all duration-300 hover:scale-[1.02]">
            <i class="fas fa-gift"></i>
            Sign Up Free — 3 Reports On Us
            <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </a>
        </div>

        <p class="text-sm text-gray-400">
          No credit card required. 3 free reports. Then $8 CAD per report.
          <br/>Questions? <a href="mailto:reports@reusecanada.ca" class="text-cyan-400 hover:underline">reports@reusecanada.ca</a>
        </p>
      </div>
    </section>
  `;
}
