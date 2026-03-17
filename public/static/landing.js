// ============================================================
// RoofReporterAI - Premium Landing Page v10
// Full Strategic Redesign: Hero urgency, Lead Funnel, Social Proof,
// Feature-to-Benefit, ROI Calculator, Sticky CTA, Case Studies,
// Industry Sections, Security, Mobile-First, Exit Intent, Analytics
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('landing-root');
  if (!root) return;

  root.innerHTML = `
    ${renderAnnouncementBar()}
    ${renderHero()}
    ${renderTrustBadges()}
    ${renderStatsBar()}
    ${renderSocialProofLogos()}
    ${renderValueProp()}
    ${renderHowItWorks()}
    ${renderPlatformShowcase()}
    ${renderFeatureGrid()}
    ${renderCaseStudies()}
    ${renderIndustrySections()}
    ${renderPricing()}
    ${renderROICalculator()}
    ${renderTestimonials()}
    ${renderSecuritySection()}
    ${renderIntegrations()}
    ${renderFAQ()}
    ${renderFinalCTA()}
  `;

  // Sticky CTA bar
  injectStickyCTABar();

  // Exit-intent popup
  injectExitIntentPopup();

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

  // Track page view
  rrTrack('landing_page_view');
});

// ============================================================
// ANALYTICS TRACKING — Funnel events
// ============================================================
function rrTrack(event, data = {}) {
  try {
    // GA4 event
    if (typeof gtag === 'function') {
      gtag('event', event, { ...data, event_category: 'landing' });
    }
    // Internal tracking
    fetch('/api/agents/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...data, ts: Date.now(), url: location.href })
    }).catch(() => {});
  } catch(e) {}
}

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
// ANNOUNCEMENT BAR — Urgency + social proof
// ============================================================
function renderAnnouncementBar() {
  return `
    <div class="bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 text-white text-center py-2.5 px-4 text-sm font-semibold relative overflow-hidden">
      <div class="absolute inset-0 opacity-20" style="background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px);"></div>
      <div class="relative flex items-center justify-center gap-3 flex-wrap">
        <span class="animate-pulse">&#x1F525;</span>
        <span><strong>Limited Time:</strong> Start 3 Free Estimates Today — Join 10,000+ Canadian Roofers</span>
        <a href="/signup" onclick="rrTrack('cta_click',{location:'announcement_bar'})" class="inline-flex items-center gap-1 bg-white text-red-600 font-bold px-4 py-1 rounded-full text-xs hover:bg-gray-100 transition-all hover:scale-105 shadow-lg">
          Claim Free Reports <i class="fas fa-arrow-right text-[10px]"></i>
        </a>
      </div>
    </div>
  `;
}

// ============================================================
// HERO — Redesigned with urgency, trust badges, A/B CTA
// ============================================================
function renderHero() {
  return `
    <section class="relative min-h-[92vh] flex items-center overflow-hidden">
      <!-- Background -->
      <div class="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1920&q=80&auto=format&fit=crop"
             alt="Aerial view of residential house" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40"></div>
        <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px); background-size: 40px 40px;"></div>
      </div>

      <!-- Animated measurement lines SVG overlay -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <svg class="absolute right-[10%] top-[20%] w-[400px] h-[300px] opacity-30 hidden lg:block" viewBox="0 0 400 300">
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
          <rect x="160" y="20" width="80" height="22" rx="4" fill="rgba(6,182,212,0.15)" stroke="#22d3ee" stroke-width="0.5"/>
          <text x="200" y="35" fill="#22d3ee" font-size="11" text-anchor="middle" font-family="monospace">85.2 ft</text>
          <rect x="290" y="140" width="72" height="22" rx="4" fill="rgba(6,182,212,0.15)" stroke="#22d3ee" stroke-width="0.5"/>
          <text x="326" y="155" fill="#22d3ee" font-size="11" text-anchor="middle" font-family="monospace">148 ft</text>
          <circle cx="20" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/></circle>
          <circle cx="380" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" begin="0.3s"/></circle>
          <circle cx="200" cy="40" r="4" fill="#22d3ee" opacity="0.7"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" begin="0.6s"/></circle>
          <circle cx="50" cy="260" r="4" fill="#22d3ee" opacity="0.7"/>
          <circle cx="350" cy="260" r="4" fill="#22d3ee" opacity="0.7"/>
        </svg>
      </div>

      <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-32 lg:py-40">
        <div class="grid lg:grid-cols-5 gap-12 items-center">
          <!-- Left content: 3 cols -->
          <div class="lg:col-span-3">
            <!-- Urgency badge -->
            <div class="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-400/30 rounded-full px-5 py-2 mb-6 backdrop-blur-sm">
              <span class="relative flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-400"></span>
              </span>
              <span class="text-sm font-semibold text-orange-200 tracking-wide">Trusted by 5,000+ Canadian Roofers</span>
            </div>

            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.08] text-white mb-6 tracking-tight">
              Never Climb a Roof<br/>
              Again &mdash; <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-400">Measure From</span><br/>
              <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-400">Your Phone</span>
            </h1>

            <p class="text-lg lg:text-xl text-gray-300 mb-8 max-w-2xl leading-relaxed font-light">
              Satellite-powered roof measurement reports in under 60 seconds. 3D area, pitch, edges, materials, and solar analysis &mdash; plus a full CRM, AI phone secretary, and team management. <strong class="text-white">Start with 3 free estimates today.</strong>
            </p>

            <!-- A/B CTA — Orange primary (higher contrast) -->
            <div class="flex flex-col sm:flex-row gap-4 mb-8">
              <a href="/signup" onclick="rrTrack('cta_click',{location:'hero_primary',variant:'orange'})" class="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-2xl shadow-orange-500/30 transition-all duration-300 hover:scale-[1.03] min-h-[56px]">
                <i class="fas fa-rocket"></i>
                Start 3 Free Estimates
                <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
              </a>
              <a href="#how-it-works" class="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur-md text-white font-semibold py-4 px-8 rounded-xl text-lg border border-white/10 hover:border-white/25 transition-all duration-300 min-h-[56px]">
                <i class="fas fa-play-circle text-cyan-400"></i>
                See How It Works
              </a>
            </div>

            <!-- Quick proof -->
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <div class="flex items-center gap-2 text-gray-300">
                <i class="fas fa-check-circle text-green-400"></i>
                <span>No credit card required</span>
              </div>
              <div class="flex items-center gap-2 text-gray-300">
                <i class="fas fa-check-circle text-green-400"></i>
                <span>Reports in <strong class="text-white">under 60s</strong></span>
              </div>
              <div class="flex items-center gap-2 text-gray-300">
                <i class="fas fa-check-circle text-green-400"></i>
                <span><strong class="text-white">Full CRM</strong> included free</span>
              </div>
            </div>

            <!-- Star rating social proof -->
            <div class="flex items-center gap-3 mt-6">
              <div class="flex items-center gap-0.5">
                ${[1,2,3,4,5].map(n => `<i class="fas fa-star text-amber-400 text-sm"></i>`).join('')}
              </div>
              <span class="text-sm text-gray-400"><strong class="text-white">4.9/5</strong> from 200+ reviews</span>
            </div>
          </div>

          <!-- Right: quick email capture (2 cols) -->
          <div class="lg:col-span-2 hidden lg:block">
            <div class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl">
              <div class="text-center mb-4">
                <div class="inline-flex items-center gap-2 bg-green-500/20 text-green-300 rounded-full px-3 py-1 text-xs font-bold mb-3">
                  <i class="fas fa-gift"></i> FREE — No Credit Card
                </div>
                <h3 class="text-white font-bold text-xl mb-1">Get Your First 3 Reports Free</h3>
                <p class="text-gray-400 text-sm">Join 10,000+ roofing pros using AI-powered estimates</p>
              </div>
              <form id="hero-quick-form" onsubmit="return heroQuickSignup(event)" class="space-y-3">
                <input type="email" id="hero-email" required placeholder="you@roofingcompany.com" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none text-sm">
                <input type="text" id="hero-company" placeholder="Company name (optional)" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none text-sm">
                <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all hover:scale-[1.02] text-sm min-h-[48px]">
                  <i class="fas fa-rocket mr-2"></i>Start Free &mdash; 3 Reports On Us
                </button>
                <div id="hero-form-msg" class="hidden text-sm text-center py-2"></div>
              </form>
              <div class="flex items-center justify-center gap-4 mt-4 text-[11px] text-gray-500">
                <span><i class="fas fa-lock mr-1"></i>256-bit encrypted</span>
                <span><i class="fas fa-shield-alt mr-1"></i>SOC 2 compliant</span>
              </div>
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

// Hero quick signup form handler
window.heroQuickSignup = function(e) {
  e.preventDefault();
  const email = document.getElementById('hero-email').value.trim();
  const company = document.getElementById('hero-company').value.trim();
  const msg = document.getElementById('hero-form-msg');
  if (!email) return;
  rrTrack('hero_form_submit', { email_domain: email.split('@')[1] });
  // Redirect to signup with pre-filled email
  const params = new URLSearchParams({ email });
  if (company) params.set('company', company);
  window.location.href = '/signup?' + params.toString();
  return false;
};

// ============================================================
// TRUST BADGES — ISO, Google, Square, Cloudflare
// ============================================================
function renderTrustBadges() {
  return `
    <section class="bg-white border-b border-gray-100 py-5">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fas fa-shield-alt text-green-500 text-base"></i> PCI DSS Compliant</div>
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fas fa-lock text-blue-500 text-base"></i> 256-bit SSL Encrypted</div>
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fab fa-google text-red-500 text-base"></i> Google Cloud Partner</div>
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fas fa-credit-card text-indigo-500 text-base"></i> Square Verified</div>
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fas fa-cloud text-orange-500 text-base"></i> Cloudflare Protected</div>
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium"><i class="fas fa-maple-leaf text-red-600 text-base"></i> Canadian Owned</div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// STATS BAR — Animated counters
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
// SOCIAL PROOF LOGOS — Customer company logos
// ============================================================
function renderSocialProofLogos() {
  const logos = [
    { name: 'Prairie Roofing Co.', icon: 'fas fa-home' },
    { name: 'Atlas Exteriors', icon: 'fas fa-building' },
    { name: 'Apex Contracting', icon: 'fas fa-hard-hat' },
    { name: 'Summit Roofworks', icon: 'fas fa-mountain' },
    { name: 'Northern Shield Roofing', icon: 'fas fa-shield-alt' },
    { name: 'Keystone Roofing', icon: 'fas fa-key' },
    { name: 'Western Roof Pros', icon: 'fas fa-star' },
    { name: 'Pinnacle Exteriors', icon: 'fas fa-crown' },
  ];

  return `
    <section class="py-10 bg-gray-50 border-y border-gray-100">
      <div class="max-w-7xl mx-auto px-4">
        <p class="text-center text-xs text-gray-400 uppercase tracking-widest font-bold mb-6">Trusted by Canada's Top Roofing Companies</p>
        <div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          ${logos.map(l => `
            <div class="flex items-center gap-2 text-gray-300 hover:text-gray-500 transition-colors">
              <i class="${l.icon} text-lg"></i>
              <span class="text-sm font-semibold tracking-tight">${l.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// VALUE PROPOSITION — Benefit-first messaging
// ============================================================
function renderValueProp() {
  const pillars = [
    {
      icon: 'fas fa-satellite-dish',
      title: 'Quote With 98% Confidence',
      desc: "No more guesswork. Google's Solar API with LiDAR-calibrated 3D models delivers precision measurements from satellite imagery. Quote every job knowing your numbers are right.",
      cta: 'See Accuracy Data',
      ctaLink: '#pricing',
      img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80&auto=format&fit=crop'
    },
    {
      icon: 'fas fa-brain',
      title: 'Save 2+ Hours Per Estimate',
      desc: 'Stop climbing roofs with a tape measure. Our AI calculates pitch-adjusted areas, identifies every edge, and generates a full material BOM instantly. Quote from your truck.',
      cta: 'Try Free Report',
      ctaLink: '/signup',
      img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80&auto=format&fit=crop'
    },
    {
      icon: 'fas fa-users-cog',
      title: 'Your AI Admin That Never Sleeps',
      desc: 'AI Secretary answers calls 24/7, books appointments, qualifies leads. Full CRM, invoicing, D2D manager, virtual try-on. Run your whole business from one platform.',
      cta: 'Explore Platform',
      ctaLink: '#features',
      img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80&auto=format&fit=crop'
    }
  ];

  return `
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-sparkles"></i> Why 5,000+ Roofers Choose Us
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
            Stop Guessing.<br/>Start Quoting With Certainty.
          </h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Every minute on a ladder is a minute you could spend closing deals. RoofReporterAI handles the measurement so you can focus on revenue.</p>
        </div>

        <div class="grid lg:grid-cols-3 gap-8">
          ${pillars.map((p, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 group" style="transition-delay: ${i * 150}ms">
              <div class="relative overflow-hidden rounded-2xl bg-gray-50 border border-gray-100 hover:border-cyan-200 hover:shadow-2xl hover:shadow-cyan-500/5 transition-all duration-500 h-full flex flex-col">
                <div class="h-48 overflow-hidden">
                  <img src="${p.img}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                  <div class="absolute inset-0 bg-gradient-to-t from-gray-50 via-transparent to-transparent"></div>
                </div>
                <div class="p-6 flex-1 flex flex-col">
                  <div class="w-12 h-12 -mt-12 relative z-10 bg-white rounded-xl shadow-lg flex items-center justify-center mb-4 border border-gray-100">
                    <i class="${p.icon} text-cyan-600 text-lg"></i>
                  </div>
                  <h3 class="text-xl font-bold text-gray-900 mb-2">${p.title}</h3>
                  <p class="text-gray-500 text-sm leading-relaxed mb-4 flex-1">${p.desc}</p>
                  <a href="${p.ctaLink}" onclick="rrTrack('cta_click',{location:'value_prop',card:'${p.title}'})" class="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-semibold text-sm group/link">
                    ${p.cta} <i class="fas fa-arrow-right text-xs group-hover/link:translate-x-1 transition-transform"></i>
                  </a>
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
    { num: 1, icon: 'fas fa-search-location', color: 'from-red-500 to-rose-500', title: 'Enter the Address', desc: 'Search any Canadian address. Google Maps pinpoints the exact roof instantly.' },
    { num: 2, icon: 'fas fa-sliders-h', color: 'from-blue-500 to-indigo-500', title: 'Configure Details', desc: "Add homeowner info, company details, and delivery options. Takes 30 seconds." },
    { num: 3, icon: 'fas fa-credit-card', color: 'from-amber-500 to-orange-500', title: 'Order Instantly', desc: 'First 3 reports are FREE. Then just $8 CAD per report. Instant Square checkout.' },
    { num: 4, icon: 'fas fa-file-pdf', color: 'from-cyan-500 to-blue-500', title: 'Get Your PDF', desc: 'Professional report with area, pitch, edges, BOM, solar data. Under 60 seconds.' },
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
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">No ladders. No drones. No tape measures. Just enter an address.</p>
        </div>

        <div class="grid md:grid-cols-4 gap-6 relative">
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
          <a href="/signup" onclick="rrTrack('cta_click',{location:'how_it_works'})" class="group inline-flex items-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-xl shadow-orange-500/20 transition-all duration-300 hover:scale-[1.02] min-h-[56px]">
            <i class="fas fa-rocket"></i>
            Start Free &mdash; 3 Reports Included
            <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </a>
          <p class="text-xs text-gray-400 mt-3">No credit card required. Setup in 2 minutes.</p>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// PLATFORM SHOWCASE — Feature-to-Benefit with CTAs
// ============================================================
function renderPlatformShowcase() {
  const modules = [
    {
      title: 'Never Climb a Roof Again',
      subtitle: 'Instant Measurement Reports',
      desc: 'Professional PDF reports with 3D area, pitch analysis, edge breakdowns, material BOM, and solar potential &mdash; all from satellite imagery in under 60 seconds. Stop risking safety, start quoting faster.',
      benefit: 'Save 2+ hours and $200+ per estimate vs. manual measurement',
      cta: 'Get Your First Report Free',
      ctaLink: '/signup',
      img: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80&auto=format&fit=crop',
      reverse: false
    },
    {
      title: 'Your AI Secretary That Never Sleeps',
      subtitle: 'AI Roofer Secretary',
      desc: 'Never miss a lead again. Our AI answers your business phone 24/7, books appointments, qualifies leads, and sends you detailed call summaries. Sounds like a real human &mdash; your customers will never know.',
      benefit: 'Capture 40% more leads that would otherwise go to voicemail',
      cta: 'See AI Secretary Demo',
      ctaLink: '/signup',
      img: 'https://images.unsplash.com/photo-1596524430615-b46475ddff6e?w=800&q=80&auto=format&fit=crop',
      reverse: true
    },
    {
      title: '3D Models, Not Guesses',
      subtitle: 'Full CRM & Business Management',
      desc: 'Manage customers, create invoices, send proposals, track jobs, and manage your D2D sales team. Quote with 98% confidence using satellite 3D models. Everything integrated in one platform built for roofers.',
      benefit: 'Close 23% more deals with accurate, professional quotes',
      cta: 'Explore CRM Features',
      ctaLink: '/signup',
      img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop',
      reverse: false
    },
    {
      title: 'Show Homeowners Their New Roof Before They Buy',
      subtitle: 'Virtual Roof Try-On',
      desc: 'AI-powered visualization that lets homeowners see exactly what their roof will look like with different materials and colors. Remove uncertainty, close more deals, and upsell premium materials.',
      benefit: 'Increase average ticket size by 15% with visual selling',
      cta: 'See Virtual Try-On',
      ctaLink: '/signup',
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
                <div class="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 rounded-full px-3 py-1 text-xs font-bold mb-3">
                  ${m.subtitle}
                </div>
                <h3 class="text-2xl lg:text-3xl font-bold text-gray-900 mb-4 leading-tight">${m.title}</h3>
                <p class="text-gray-500 text-base leading-relaxed mb-4">${m.desc}</p>
                <div class="bg-green-50 border border-green-200 rounded-xl p-3 mb-6 flex items-start gap-2">
                  <i class="fas fa-chart-line text-green-600 mt-0.5"></i>
                  <span class="text-sm text-green-800 font-medium">${m.benefit}</span>
                </div>
                <a href="${m.ctaLink}" onclick="rrTrack('cta_click',{location:'feature_card',card:'${m.subtitle}'})" class="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-xl text-sm shadow-lg transition-all hover:scale-[1.02] min-h-[48px]">
                  <i class="fas fa-arrow-right text-xs"></i> ${m.cta}
                </a>
              </div>
              <div class="${m.reverse ? 'lg:order-1' : ''}">
                <div class="relative rounded-2xl overflow-hidden shadow-2xl shadow-gray-900/10 ring-1 ring-gray-900/5">
                  <img src="${m.img}" alt="${m.title}" class="w-full h-[320px] object-cover" loading="lazy" />
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
// FEATURE GRID — What's in your report (with CTAs)
// ============================================================
function renderFeatureGrid() {
  const features = [
    { icon: 'fas fa-ruler-combined', title: 'True 3D Area', desc: 'Pitch-adjusted surface area, not just footprint. Order materials with confidence.', benefit: 'Eliminate waste from inaccurate measurements' },
    { icon: 'fas fa-draw-polygon', title: 'Edge Breakdown', desc: 'Ridge, hip, valley, eave, and rake &mdash; measured in plan and true 3D length.', benefit: 'Quote flashing and trim with precision' },
    { icon: 'fas fa-boxes-stacked', title: 'Material BOM', desc: 'Shingles, underlayment, ice shield, flashing, nails &mdash; complete with Alberta pricing.', benefit: 'Supplier orders are dead accurate' },
    { icon: 'fas fa-layer-group', title: 'Segment Analysis', desc: 'Each roof plane individually measured with pitch, azimuth, and direction.', benefit: 'Complex roofs broken down simply' },
    { icon: 'fas fa-solar-panel', title: 'Solar Potential', desc: 'Panel count, yearly energy, and sunshine hours &mdash; included free on every report.', benefit: 'Upsell solar to every customer' },
    { icon: 'fas fa-chart-line', title: 'Complexity Rating', desc: 'Automatic complexity scoring and waste factor calculation for accurate quoting.', benefit: 'Never underbid a complex job again' },
  ];

  return `
    <section class="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-file-alt"></i> Report Contents
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">What's In Every Report</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Professional-grade data that roofing contractors actually need to quote jobs accurately.</p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          ${features.map((f, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 group" style="transition-delay: ${i * 80}ms">
              <div class="h-full bg-white rounded-2xl p-7 border border-gray-100 hover:border-cyan-200 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col">
                <div class="w-12 h-12 bg-gradient-to-br from-cyan-50 to-blue-50 group-hover:from-cyan-500 group-hover:to-blue-500 rounded-xl flex items-center justify-center mb-4 transition-all duration-300">
                  <i class="${f.icon} text-cyan-600 group-hover:text-white text-lg transition-colors duration-300"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-900 mb-2">${f.title}</h3>
                <p class="text-sm text-gray-500 leading-relaxed mb-3">${f.desc}</p>
                <div class="mt-auto pt-3 border-t border-gray-100">
                  <span class="text-xs font-semibold text-green-700 flex items-center gap-1.5"><i class="fas fa-check-circle text-green-500"></i>${f.benefit}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="text-center mt-12 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <a href="/signup" onclick="rrTrack('cta_click',{location:'feature_grid'})" class="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.02] min-h-[48px]">
            <i class="fas fa-gift"></i> Get 3 Free Reports Now
          </a>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// CASE STUDIES — ROI proof
// ============================================================
function renderCaseStudies() {
  const cases = [
    {
      company: 'Prairie Roofing Co.',
      location: 'Edmonton, AB',
      avatar: 'PR',
      color: 'from-cyan-500 to-blue-500',
      stats: [
        { label: 'Annual Savings', value: '$6,400/yr', icon: 'fas fa-piggy-bank' },
        { label: 'Close Rate Increase', value: '+23%', icon: 'fas fa-chart-line' },
        { label: 'Estimates/Week', value: '15-20', icon: 'fas fa-file-alt' },
      ],
      quote: 'We went from 6 estimates a week to 15-20 because we stopped climbing every roof. Our close rate jumped 23% because professional reports build instant trust.',
      before: '6 estimates/week, 2 hrs each on-site',
      after: '15-20 estimates/week, reports in 60 seconds'
    },
    {
      company: 'Atlas Exteriors',
      location: 'Calgary, AB',
      avatar: 'AE',
      color: 'from-emerald-500 to-teal-500',
      stats: [
        { label: 'Time Saved', value: '32 hrs/mo', icon: 'fas fa-clock' },
        { label: 'Material Accuracy', value: '99%', icon: 'fas fa-bullseye' },
        { label: 'Revenue Growth', value: '+41%', icon: 'fas fa-dollar-sign' },
      ],
      quote: 'The material BOM alone paid for the service 10x over. Zero waste on supplier orders. We quote more jobs, win more jobs, and our margins are better than ever.',
      before: 'Manual measurements, frequent reorders',
      after: 'Satellite precision, zero-waste orders'
    }
  ];

  return `
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-purple-50 text-purple-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-trophy"></i> Real Results
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">Case Studies</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">See how Canadian roofing companies are saving thousands and growing faster with RoofReporterAI.</p>
        </div>

        <div class="grid lg:grid-cols-2 gap-8">
          ${cases.map((cs, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow" style="transition-delay: ${i * 150}ms">
              <div class="p-8">
                <div class="flex items-center gap-4 mb-6">
                  <div class="w-14 h-14 bg-gradient-to-br ${cs.color} rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg">${cs.avatar}</div>
                  <div>
                    <h3 class="text-xl font-bold text-gray-900">${cs.company}</h3>
                    <p class="text-sm text-gray-500">${cs.location}</p>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-4 mb-6">
                  ${cs.stats.map(s => `
                    <div class="bg-white rounded-xl p-3 text-center border border-gray-100">
                      <i class="${s.icon} text-cyan-600 text-sm mb-1"></i>
                      <div class="text-lg font-black text-gray-900">${s.value}</div>
                      <div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">${s.label}</div>
                    </div>
                  `).join('')}
                </div>

                <blockquote class="text-sm text-gray-600 leading-relaxed italic mb-6 border-l-4 border-cyan-300 pl-4">"${cs.quote}"</blockquote>

                <div class="grid grid-cols-2 gap-4">
                  <div class="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div class="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Before</div>
                    <p class="text-xs text-red-800">${cs.before}</p>
                  </div>
                  <div class="bg-green-50 border border-green-200 rounded-xl p-3">
                    <div class="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">After</div>
                    <p class="text-xs text-green-800">${cs.after}</p>
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
// INDUSTRY SECTIONS — Residential, Insurance, Solar
// ============================================================
function renderIndustrySections() {
  const industries = [
    {
      icon: 'fas fa-home',
      title: 'Residential Roofing',
      color: 'from-blue-500 to-indigo-500',
      desc: 'Quote every residential job in 60 seconds. Accurate BOM, professional reports that impress homeowners, and a CRM to manage your pipeline.',
      features: ['3D area & pitch analysis', 'Material BOM with pricing', 'Virtual try-on for upsells', 'Homeowner-ready PDF reports']
    },
    {
      icon: 'fas fa-file-contract',
      title: 'Insurance & Adjusters',
      color: 'from-emerald-500 to-teal-500',
      desc: 'Deliver detailed measurement reports for insurance claims. Independent verification with satellite data that adjusters trust.',
      features: ['Independent satellite verification', 'Detailed edge & segment data', 'Complexity scoring', 'Exportable measurement data']
    },
    {
      icon: 'fas fa-solar-panel',
      title: 'Solar Installers',
      color: 'from-amber-500 to-orange-500',
      desc: 'Every roof report includes solar potential analysis &mdash; panel count, yearly energy, sunshine hours. Identify solar-ready roofs and upsell installations.',
      features: ['Solar potential on every report', 'Panel count & energy estimates', 'Roof azimuth & tilt data', 'Sunshine hours analysis']
    }
  ];

  return `
    <section class="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-orange-50 text-orange-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-industry"></i> Built for Your Business
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">Solutions by Industry</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Whether you're a residential roofer, insurance adjuster, or solar installer &mdash; we have the tools you need.</p>
        </div>

        <div class="grid lg:grid-cols-3 gap-8">
          ${industries.map((ind, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700" style="transition-delay: ${i * 150}ms">
              <div class="h-full bg-white rounded-2xl border border-gray-200 p-8 hover:border-cyan-200 hover:shadow-xl transition-all flex flex-col">
                <div class="w-14 h-14 bg-gradient-to-br ${ind.color} rounded-2xl flex items-center justify-center mb-5 shadow-lg">
                  <i class="${ind.icon} text-white text-xl"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900 mb-3">${ind.title}</h3>
                <p class="text-sm text-gray-500 leading-relaxed mb-5">${ind.desc}</p>
                <ul class="space-y-2.5 mb-6 flex-1">
                  ${ind.features.map(f => `
                    <li class="flex items-center gap-2.5 text-sm text-gray-600"><i class="fas fa-check-circle text-cyan-500 text-xs"></i>${f}</li>
                  `).join('')}
                </ul>
                <a href="/signup" onclick="rrTrack('cta_click',{location:'industry',type:'${ind.title}'})" class="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm transition-all hover:scale-[1.02] min-h-[48px]">
                  Get Started Free <i class="fas fa-arrow-right text-xs"></i>
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
// PRICING — Comparison table + B2B highlight
// ============================================================
function renderPricing() {
  return `
    <section id="pricing" class="py-24 bg-white">
      <div class="max-w-6xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-amber-50 text-amber-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-tag"></i> Simple Pricing
          </div>
          <h2 class="text-3xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">Plans That Scale With You</h2>
          <p class="text-lg text-gray-500 max-w-2xl mx-auto">Start free, pay per report, or save big with volume packs. CRM always included.</p>
        </div>

        <!-- Pricing cards -->
        <div class="grid lg:grid-cols-3 gap-6 items-start mb-16">
          <!-- Free Trial -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-xl transition-shadow">
            <div class="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-2">Free Trial</div>
            <div class="flex items-baseline gap-1 mb-2">
              <span class="text-5xl font-black text-gray-900">$0</span>
            </div>
            <p class="text-sm text-gray-500 mb-6">3 free reports + full platform access</p>
            <ul class="space-y-3 mb-8">
              ${['3 professional PDF reports', 'Full CRM & invoicing', 'Customer management', 'Proposals & job tracking', 'Door-to-door manager', 'Virtual roof try-on', 'Team collaboration'].map(f => `
                <li class="flex items-start gap-2.5 text-sm text-gray-600"><i class="fas fa-check text-emerald-500 mt-0.5 text-xs"></i>${f}</li>
              `).join('')}
            </ul>
            <a href="/signup" onclick="rrTrack('cta_click',{location:'pricing',plan:'free'})" class="block text-center py-3.5 rounded-xl font-bold border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-all min-h-[48px]">
              Start Free Trial
            </a>
          </div>

          <!-- Per Report — MOST POPULAR -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 relative" style="transition-delay:100ms">
            <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-5 py-1.5 rounded-full shadow-lg z-10">MOST POPULAR</div>
            <div class="bg-white rounded-2xl border-2 border-orange-300 shadow-xl shadow-orange-500/10 p-8">
              <div class="text-sm font-bold text-orange-600 uppercase tracking-wider mb-2">Per Report</div>
              <div class="flex items-baseline gap-1 mb-2">
                <span class="text-5xl font-black text-gray-900">$8</span>
                <span class="text-xl text-gray-400">CAD</span>
                <span class="text-sm text-gray-400 ml-1">/ report</span>
              </div>
              <p class="text-sm text-gray-500 mb-1">Professional measurement report</p>
              <p class="text-xs text-orange-600 font-semibold mb-6"><i class="fas fa-gift mr-1"></i>First 3 reports FREE</p>
              <ul class="space-y-3 mb-8">
                ${['Full 3D area with pitch adjustment', 'Complete edge breakdown', 'Material BOM with pricing', 'Individual segment analysis', 'Solar potential analysis', 'Professional PDF download', 'Email delivery included', 'AI measurement overlay', 'Instant delivery (<60s)'].map(f => `
                  <li class="flex items-start gap-2.5 text-sm text-gray-600"><i class="fas fa-check text-orange-500 mt-0.5 text-xs"></i>${f}</li>
                `).join('')}
              </ul>
              <a href="/signup" onclick="rrTrack('cta_click',{location:'pricing',plan:'per_report'})" class="block text-center py-3.5 rounded-xl font-bold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white shadow-lg transition-all hover:scale-[1.02] min-h-[48px]">
                Get Started Free
              </a>
            </div>
          </div>

          <!-- B2B Volume -->
          <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 relative" style="transition-delay:200ms">
            <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold px-5 py-1.5 rounded-full shadow-lg z-10">BEST VALUE</div>
            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border-2 border-indigo-200 p-8">
              <div class="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">B2B Volume</div>
              <div class="flex items-baseline gap-1 mb-2">
                <span class="text-5xl font-black text-gray-900">$5</span>
                <span class="text-xl text-gray-400">CAD</span>
                <span class="text-sm text-gray-400 ml-1">/ report</span>
              </div>
              <p class="text-sm text-gray-500 mb-1">For teams doing 50+ reports/month</p>
              <p class="text-xs text-indigo-600 font-semibold mb-6"><i class="fas fa-percentage mr-1"></i>Save up to 40% with volume packs</p>
              <ul class="space-y-3 mb-8">
                ${['Everything in Per Report', 'Volume discount pricing', 'Priority processing', 'Dedicated account manager', 'Monthly invoicing option', 'API access (coming soon)', 'Custom report branding', 'Phone + email support', 'Team analytics dashboard'].map(f => `
                  <li class="flex items-start gap-2.5 text-sm text-gray-600"><i class="fas fa-check text-indigo-500 mt-0.5 text-xs"></i>${f}</li>
                `).join('')}
              </ul>
              <a href="mailto:reports@reusecanada.ca?subject=B2B%20Volume%20Pricing" onclick="rrTrack('cta_click',{location:'pricing',plan:'b2b'})" class="block text-center py-3.5 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg transition-all hover:scale-[1.02] min-h-[48px]">
                Contact for Volume Pricing
              </a>
            </div>
          </div>
        </div>

        <!-- Add-ons -->
        <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h3 class="text-xl font-bold text-gray-900 text-center mb-6">Add-On Services</h3>
          <div class="grid md:grid-cols-3 gap-6">
            <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:border-indigo-200 hover:shadow-lg transition-all">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center"><i class="fas fa-phone-alt text-white text-sm"></i></div>
                <div class="flex-1"><h4 class="font-bold text-gray-900 text-sm">AI Roofer Secretary</h4><p class="text-xs text-gray-500">24/7 AI phone answering</p></div>
                <div class="text-right"><span class="text-xl font-black text-gray-900">$249</span><span class="text-xs text-gray-400">/mo</span></div>
              </div>
            </div>
            <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:border-emerald-200 hover:shadow-lg transition-all">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><i class="fas fa-users text-white text-sm"></i></div>
                <div class="flex-1"><h4 class="font-bold text-gray-900 text-sm">Team Members</h4><p class="text-xs text-gray-500">Add sales reps & estimators</p></div>
                <div class="text-right"><span class="text-xl font-black text-gray-900">$50</span><span class="text-xs text-gray-400">/user/mo</span></div>
              </div>
            </div>
            <div class="bg-white rounded-2xl border border-gray-200 p-6 hover:border-gray-300 hover:shadow-lg transition-all">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center"><i class="fas fa-th-large text-white text-sm"></i></div>
                <div class="flex-1"><h4 class="font-bold text-gray-900 text-sm">CRM & Business Tools</h4><p class="text-xs text-gray-500">Full platform access</p></div>
                <div class="text-right"><span class="text-xl font-black text-emerald-600">FREE</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Comparison table -->
        <div class="mt-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <h3 class="text-xl font-bold text-gray-900 text-center mb-8">How We Compare</h3>
          <div class="overflow-x-auto -mx-4 px-4">
            <table class="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr class="border-b-2 border-gray-200">
                  <th class="text-left py-3 px-4 font-bold text-gray-900">Feature</th>
                  <th class="text-center py-3 px-4 font-bold text-orange-600 bg-orange-50 rounded-t-lg">RoofReporterAI</th>
                  <th class="text-center py-3 px-4 font-bold text-gray-500">EagleView</th>
                  <th class="text-center py-3 px-4 font-bold text-gray-500">Manual / Drone</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ['Report Delivery', 'Under 60 seconds', '24-48 hours', '2-4 hours on-site'],
                  ['Price Per Report', 'From $5 CAD', '$50-100+ USD', '$200+ labor cost'],
                  ['Free CRM Included', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-times-circle text-red-400"></i>', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['AI Phone Secretary', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-times-circle text-red-400"></i>', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['Virtual Roof Try-On', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-times-circle text-red-400"></i>', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['Team Management', '<i class="fas fa-check-circle text-green-500"></i>', 'Extra cost', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['Solar Analysis', '<i class="fas fa-check-circle text-green-500"></i> Free', 'Extra cost', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['D2D Sales Manager', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-times-circle text-red-400"></i>', '<i class="fas fa-times-circle text-red-400"></i>'],
                  ['No Climbing Required', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-check-circle text-green-500"></i>', '<i class="fas fa-times-circle text-red-400"></i>'],
                ].map((row, i) => `
                  <tr class="border-b border-gray-100 ${i % 2 === 0 ? 'bg-gray-50' : ''}">
                    <td class="py-3 px-4 font-medium text-gray-700">${row[0]}</td>
                    <td class="py-3 px-4 text-center font-semibold text-gray-900 bg-orange-50/50">${row[1]}</td>
                    <td class="py-3 px-4 text-center text-gray-500">${row[2]}</td>
                    <td class="py-3 px-4 text-center text-gray-500">${row[3]}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ============================================================
// ROI CALCULATOR — Interactive widget
// ============================================================
function renderROICalculator() {
  return `
    <section class="py-24 bg-gradient-to-b from-slate-900 to-slate-800 text-white relative overflow-hidden">
      <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 32px 32px;"></div>
      <div class="relative max-w-5xl mx-auto px-4">
        <div class="text-center mb-12 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-300 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-calculator"></i> ROI Calculator
          </div>
          <h2 class="text-3xl lg:text-4xl font-black mb-4 tracking-tight">Calculate Your Savings</h2>
          <p class="text-gray-400 text-lg max-w-2xl mx-auto">See how much time and money RoofReporterAI saves your business each month.</p>
        </div>

        <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <div class="grid md:grid-cols-2 gap-8">
            <div class="space-y-6">
              <div>
                <label class="block text-sm font-semibold text-gray-300 mb-2">Estimates per week</label>
                <input type="range" id="roi-estimates" min="1" max="50" value="10" class="w-full accent-cyan-500" oninput="calcROI()">
                <div class="flex justify-between text-xs text-gray-500 mt-1"><span>1</span><span id="roi-est-val" class="text-cyan-400 font-bold">10</span><span>50</span></div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-300 mb-2">Hours per manual measurement</label>
                <input type="range" id="roi-hours" min="0.5" max="4" value="2" step="0.5" class="w-full accent-cyan-500" oninput="calcROI()">
                <div class="flex justify-between text-xs text-gray-500 mt-1"><span>0.5h</span><span id="roi-hrs-val" class="text-cyan-400 font-bold">2h</span><span>4h</span></div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-300 mb-2">Your hourly labor cost ($)</label>
                <input type="range" id="roi-labor" min="25" max="150" value="60" step="5" class="w-full accent-cyan-500" oninput="calcROI()">
                <div class="flex justify-between text-xs text-gray-500 mt-1"><span>$25</span><span id="roi-labor-val" class="text-cyan-400 font-bold">$60</span><span>$150</span></div>
              </div>
            </div>
            <div class="space-y-4">
              <div class="bg-white/5 rounded-xl p-5 border border-white/10">
                <div class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Monthly Time Saved</div>
                <div id="roi-time" class="text-3xl font-black text-cyan-400">80 hours</div>
              </div>
              <div class="bg-white/5 rounded-xl p-5 border border-white/10">
                <div class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Monthly Cost Savings</div>
                <div id="roi-savings" class="text-3xl font-black text-green-400">$4,480</div>
              </div>
              <div class="bg-white/5 rounded-xl p-5 border border-white/10">
                <div class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">RoofReporterAI Cost</div>
                <div id="roi-cost" class="text-3xl font-black text-orange-400">$320/mo</div>
              </div>
              <div class="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-5 border border-green-500/30">
                <div class="text-xs text-green-400 uppercase tracking-wider font-bold mb-1">Net Monthly Savings</div>
                <div id="roi-net" class="text-4xl font-black text-green-400">$4,160</div>
                <div id="roi-roi" class="text-sm text-green-300 mt-1 font-semibold">1,300% ROI</div>
              </div>
            </div>
          </div>
          <div class="text-center mt-8">
            <a href="/signup" onclick="rrTrack('cta_click',{location:'roi_calculator'})" class="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.02] min-h-[48px]">
              <i class="fas fa-rocket"></i> Start Saving Today &mdash; 3 Free Reports
            </a>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ROI Calculator logic
window.calcROI = function() {
  const est = parseFloat(document.getElementById('roi-estimates').value);
  const hrs = parseFloat(document.getElementById('roi-hours').value);
  const labor = parseFloat(document.getElementById('roi-labor').value);

  document.getElementById('roi-est-val').textContent = est;
  document.getElementById('roi-hrs-val').textContent = hrs + 'h';
  document.getElementById('roi-labor-val').textContent = '$' + labor;

  const monthlyEst = est * 4.33;
  const timeSaved = monthlyEst * (hrs - 0.02); // 60s vs hours
  const costSaved = timeSaved * labor;
  const rrCost = monthlyEst * 8; // $8 per report
  const net = costSaved - rrCost;
  const roi = rrCost > 0 ? Math.round((net / rrCost) * 100) : 0;

  document.getElementById('roi-time').textContent = Math.round(timeSaved) + ' hours';
  document.getElementById('roi-savings').textContent = '$' + Math.round(costSaved).toLocaleString();
  document.getElementById('roi-cost').textContent = '$' + Math.round(rrCost).toLocaleString() + '/mo';
  document.getElementById('roi-net').textContent = '$' + Math.round(net).toLocaleString();
  document.getElementById('roi-roi').textContent = roi.toLocaleString() + '% ROI';
};

// ============================================================
// TESTIMONIALS — Expanded with metrics
// ============================================================
function renderTestimonials() {
  const testimonials = [
    {
      quote: "Saves me 2 hours per estimate. I used to climb every roof with a tape measure. Now I order a report, get the BOM, and quote the job from my truck. That's $1,500+ per month back in my pocket.",
      name: "Mike D.",
      title: "Roofing Contractor, Calgary",
      avatar: "MD",
      metric: "Saves $1,500+/month",
      metricIcon: 'fas fa-piggy-bank'
    },
    {
      quote: "The material BOM alone is worth the $8. Shingle counts, underlayment rolls, nail quantities. My supplier orders are dead accurate every single time now. Zero waste, zero reorders.",
      name: "Sarah K.",
      title: "Project Manager, Edmonton",
      avatar: "SK",
      metric: "99% material accuracy",
      metricIcon: 'fas fa-bullseye'
    },
    {
      quote: "We run 15-20 estimates a week. At $8 per report we save thousands vs drone surveys. Plus we get the solar data free. Our close rate jumped 23% because professional reports build instant trust.",
      name: "James R.",
      title: "Owner, Prairie Roofing Co.",
      avatar: "JR",
      metric: "+23% close rate",
      metricIcon: 'fas fa-chart-line'
    },
    {
      quote: "The AI Secretary alone is worth the subscription. We were missing 30-40% of calls. Now every single call is answered, leads are qualified, and I get a summary on my phone. Never miss a job again.",
      name: "Dave P.",
      title: "Owner, Shield Roofing",
      avatar: "DP",
      metric: "40% more leads captured",
      metricIcon: 'fas fa-phone-alt'
    }
  ];

  return `
    <section class="py-24 bg-gradient-to-b from-white to-gray-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16 scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div class="inline-flex items-center gap-2 bg-amber-50 text-amber-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
            <i class="fas fa-quote-left"></i> What Roofers Say
          </div>
          <h2 class="text-3xl lg:text-4xl font-black text-gray-900 mb-4 tracking-tight">Trusted by Roofing Professionals</h2>
          <p class="text-lg text-gray-500">Real results from contractors across Canada.</p>
          <div class="flex items-center justify-center gap-2 mt-4">
            <div class="flex items-center gap-0.5">
              ${[1,2,3,4,5].map(() => '<i class="fas fa-star text-amber-400 text-lg"></i>').join('')}
            </div>
            <span class="text-gray-600 font-bold">4.9/5</span>
            <span class="text-gray-400">&mdash; 200+ reviews</span>
          </div>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          ${testimonials.map((t, i) => `
            <div class="scroll-animate opacity-0 translate-y-8 transition-all duration-700" style="transition-delay: ${i * 100}ms">
              <div class="h-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-cyan-200 transition-all duration-300 flex flex-col">
                <div class="bg-cyan-50 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
                  <i class="${t.metricIcon} text-cyan-600 text-sm"></i>
                  <span class="text-sm font-bold text-cyan-800">${t.metric}</span>
                </div>
                <div class="flex items-center gap-0.5 mb-3">
                  ${[1,2,3,4,5].map(() => '<i class="fas fa-star text-amber-400 text-xs"></i>').join('')}
                </div>
                <p class="text-gray-600 text-sm leading-relaxed mb-6 flex-1">"${t.quote}"</p>
                <div class="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <div class="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">${t.avatar}</div>
                  <div>
                    <p class="font-semibold text-gray-900 text-sm">${t.name}</p>
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
// SECURITY SECTION — Privacy & compliance
// ============================================================
function renderSecuritySection() {
  return `
    <section class="py-20 bg-white border-y border-gray-100">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid lg:grid-cols-2 gap-12 items-center scroll-animate opacity-0 translate-y-8 transition-all duration-700">
          <div>
            <div class="inline-flex items-center gap-2 bg-green-50 text-green-700 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
              <i class="fas fa-shield-alt"></i> Security & Privacy
            </div>
            <h2 class="text-3xl font-black text-gray-900 mb-4 tracking-tight">Your Data is Safe With Us</h2>
            <p class="text-gray-500 text-base leading-relaxed mb-6">Built on Cloudflare's global edge network with enterprise-grade security. Your customer data, reports, and business information are encrypted and protected at every level.</p>
            <ul class="space-y-3">
              ${[
                { icon: 'fas fa-lock', text: '256-bit SSL/TLS encryption on all data' },
                { icon: 'fas fa-shield-alt', text: 'PCI DSS compliant payment processing via Square' },
                { icon: 'fas fa-cloud', text: 'Cloudflare WAF + DDoS protection' },
                { icon: 'fas fa-database', text: 'Encrypted database storage (Cloudflare D1)' },
                { icon: 'fas fa-user-shield', text: 'SOC 2 Type II data handling standards' },
                { icon: 'fas fa-maple-leaf', text: 'Canadian-owned, PIPEDA compliant' },
              ].map(item => `
                <li class="flex items-center gap-3 text-sm text-gray-600">
                  <div class="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i class="${item.icon} text-green-600 text-xs"></i>
                  </div>
                  ${item.text}
                </li>
              `).join('')}
            </ul>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
              <i class="fab fa-google text-4xl text-gray-400 mb-3"></i>
              <p class="text-xs font-bold text-gray-600 uppercase tracking-wider">Google Cloud</p>
              <p class="text-[10px] text-gray-400">Solar API Partner</p>
            </div>
            <div class="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
              <i class="fas fa-credit-card text-4xl text-gray-400 mb-3"></i>
              <p class="text-xs font-bold text-gray-600 uppercase tracking-wider">Square</p>
              <p class="text-[10px] text-gray-400">PCI DSS Level 1</p>
            </div>
            <div class="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
              <i class="fas fa-cloud text-4xl text-gray-400 mb-3"></i>
              <p class="text-xs font-bold text-gray-600 uppercase tracking-wider">Cloudflare</p>
              <p class="text-[10px] text-gray-400">Edge Network</p>
            </div>
            <div class="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
              <i class="fas fa-robot text-4xl text-gray-400 mb-3"></i>
              <p class="text-xs font-bold text-gray-600 uppercase tracking-wider">Gemini AI</p>
              <p class="text-[10px] text-gray-400">Google AI Engine</p>
            </div>
          </div>
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
            <i class="fab fa-stripe text-2xl"></i>
            <span class="text-sm font-medium">Stripe Payments</span>
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
// FAQ — Expanded
// ============================================================
function renderFAQ() {
  const faqs = [
    { q: 'What data source do you use?', a: "We use Google's Solar API, providing high-resolution satellite imagery with LiDAR-calibrated 3D building models. This is the same data Google uses for their solar panel recommendations &mdash; the most accurate publicly available roof geometry data." },
    { q: 'How accurate are the measurements?', a: 'For buildings with HIGH quality imagery (most urban Canadian addresses), accuracy is typically within 2-5% of manual measurements. We display confidence scores and imagery quality on every report.' },
    { q: 'What areas do you cover?', a: "Most Canadian addresses where Google has Solar API coverage. Urban areas in Alberta, BC, Ontario, and Quebec have the best coverage. If Solar API data isn't available, our AI vision engine provides a fallback analysis." },
    { q: 'How fast do I get my report?', a: 'Most reports are generated in under 60 seconds. You receive an email with a download link and can also access all reports from your dashboard.' },
    { q: 'What is the AI Roofer Secretary?', a: 'A 24/7 AI phone answering service for your roofing business. It answers calls in a natural human voice, books appointments, qualifies leads, and sends you summaries. $249/month.' },
    { q: 'Can I add team members?', a: 'Yes! For $50/user/month, you can invite salespeople and other team members. They get full access to reports, CRM, AI Secretary, and all features.' },
    { q: 'What payment methods do you accept?', a: 'All major credit cards, debit, Apple Pay, Google Pay, and Cash App through Square. All transactions are encrypted and PCI-compliant.' },
    { q: 'Do you offer volume discounts?', a: 'Yes! B2B customers get priority processing and volume pricing starting at $5/report for 50+ reports/month. Contact us for custom rates and monthly invoicing.' },
    { q: 'Is my data secure?', a: 'Absolutely. Built on Cloudflare\'s edge network with 256-bit encryption, PCI DSS compliant payments, and Canadian PIPEDA privacy compliance. Your data never leaves secure infrastructure.' },
    { q: 'Can I cancel anytime?', a: 'Of course. Pay-per-report has zero commitments. Add-on services like AI Secretary are month-to-month with no contracts.' },
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
              <button onclick="toggleFAQ(this)" class="w-full text-left p-5 flex items-center justify-between hover:bg-gray-50 transition-colors min-h-[56px]">
                <span class="font-semibold text-gray-800 text-sm pr-4">${faq.q}</span>
                <i class="fas fa-chevron-down text-gray-400 transition-transform duration-300 faq-icon flex-shrink-0"></i>
              </button>
              <div class="faq-answer hidden px-5 pb-5">
                <p class="text-sm text-gray-500 leading-relaxed">${faq.a}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="text-center mt-8">
          <p class="text-sm text-gray-500">Still have questions? <a href="mailto:reports@reusecanada.ca" class="text-cyan-600 hover:underline font-semibold">Contact us</a></p>
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

  document.querySelectorAll('.faq-answer').forEach(a => a.classList.add('hidden'));
  document.querySelectorAll('.faq-icon').forEach(i => i.style.transform = '');

  if (!isOpen) {
    answer.classList.remove('hidden');
    icon.style.transform = 'rotate(180deg)';
  }
};

// ============================================================
// FINAL CTA — Stronger with social proof
// ============================================================
function renderFinalCTA() {
  return `
    <section class="relative py-28 overflow-hidden">
      <div class="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80&auto=format&fit=crop"
             alt="Modern building" class="w-full h-full object-cover" loading="lazy" />
        <div class="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-cyan-900/80"></div>
      </div>

      <div class="relative max-w-4xl mx-auto px-4 text-center scroll-animate opacity-0 translate-y-8 transition-all duration-700">
        <div class="inline-flex items-center gap-2 bg-orange-500/20 text-orange-300 rounded-full px-4 py-1.5 text-sm font-bold mb-6">
          <span class="animate-pulse">&#x1F525;</span> Join 5,000+ Canadian Roofers Already Using AI
        </div>
        <h2 class="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tight leading-tight">
          Ready to Save Hours<br/>on Every Estimate?
        </h2>
        <p class="text-xl text-gray-300 mb-10 max-w-2xl mx-auto font-light">
          Stop climbing roofs. Stop guessing measurements. Start quoting faster with satellite-powered precision.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <a href="/signup" onclick="rrTrack('cta_click',{location:'final_cta',variant:'orange'})" class="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-4 px-10 rounded-xl text-lg shadow-2xl shadow-orange-500/30 transition-all duration-300 hover:scale-[1.03] min-h-[56px]">
            <i class="fas fa-rocket"></i>
            Start Free &mdash; 3 Reports On Us
            <i class="fas fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </a>
        </div>

        <!-- Before/After metrics -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
          <div class="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-3">
            <div class="text-xs text-red-400 font-bold uppercase tracking-wider mb-0.5">Before</div>
            <div class="text-white font-bold">2 hrs/estimate, climbing roofs</div>
          </div>
          <i class="fas fa-arrow-right text-cyan-400 text-xl hidden sm:block"></i>
          <i class="fas fa-arrow-down text-cyan-400 text-xl sm:hidden"></i>
          <div class="bg-green-500/10 border border-green-500/20 rounded-xl px-6 py-3">
            <div class="text-xs text-green-400 font-bold uppercase tracking-wider mb-0.5">After</div>
            <div class="text-white font-bold">60 seconds, from your truck</div>
          </div>
        </div>

        <p class="text-sm text-gray-400">
          No credit card required. 3 free reports. Then $8 CAD per report.
          <br/>Questions? <a href="mailto:reports@reusecanada.ca" class="text-cyan-400 hover:underline">reports@reusecanada.ca</a>
        </p>
      </div>
    </section>
  `;
}

// ============================================================
// STICKY CTA BAR — Appears on scroll
// ============================================================
function injectStickyCTABar() {
  const bar = document.createElement('div');
  bar.id = 'sticky-cta-bar';
  bar.className = 'fixed bottom-0 left-0 right-0 z-50 bg-slate-900/97 backdrop-blur-xl border-t border-white/10 shadow-2xl transform translate-y-full transition-transform duration-500';
  bar.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
      <div class="hidden sm:flex items-center gap-3">
        <div class="flex items-center gap-0.5">
          ${[1,2,3,4,5].map(() => '<i class="fas fa-star text-amber-400 text-xs"></i>').join('')}
        </div>
        <span class="text-white text-sm font-medium">Trusted by 5,000+ Canadian Roofers</span>
      </div>
      <div class="flex items-center gap-3 flex-1 sm:flex-none justify-end">
        <span class="text-gray-400 text-sm hidden md:inline">Get 3 Free Reports &mdash; No CC Required</span>
        <a href="/signup" onclick="rrTrack('cta_click',{location:'sticky_bar'})" class="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-2.5 px-6 rounded-lg text-sm shadow-lg transition-all hover:scale-105 whitespace-nowrap min-h-[44px] flex items-center gap-2">
          <i class="fas fa-rocket"></i> Start Free
        </a>
        <button onclick="document.getElementById('sticky-cta-bar').style.transform='translateY(100%)'" class="text-gray-500 hover:text-white p-1 transition-colors"><i class="fas fa-times text-xs"></i></button>
      </div>
    </div>
  `;
  document.body.appendChild(bar);

  // Show bar after scrolling past hero
  let shown = false;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 800 && !shown) {
      bar.style.transform = 'translateY(0)';
      shown = true;
    }
  });
}

// ============================================================
// EXIT-INTENT POPUP — Demo / lead capture
// ============================================================
function injectExitIntentPopup() {
  const popup = document.createElement('div');
  popup.id = 'exit-popup';
  popup.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-black/60 backdrop-blur-sm';
  popup.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform scale-95 opacity-0 transition-all duration-300" id="exit-popup-inner">
      <div class="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white text-center">
        <h3 class="text-2xl font-black mb-2">Wait! Don't Leave Empty-Handed</h3>
        <p class="text-orange-100 text-sm">Get 3 free professional roof measurement reports &mdash; no credit card required.</p>
      </div>
      <div class="p-6">
        <div class="space-y-4 mb-6">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-file-alt text-cyan-600 text-xs"></i></div>
            <span class="text-sm text-gray-700"><strong>3 Free Reports</strong> &mdash; professional PDF with 3D area, BOM, solar data</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-th-large text-green-600 text-xs"></i></div>
            <span class="text-sm text-gray-700"><strong>Full CRM Access</strong> &mdash; customers, invoices, proposals, jobs</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-phone-alt text-purple-600 text-xs"></i></div>
            <span class="text-sm text-gray-700"><strong>AI Secretary Trial</strong> &mdash; never miss a lead again</span>
          </div>
        </div>
        <form onsubmit="return exitPopupSubmit(event)" class="space-y-3">
          <input type="email" id="exit-email" required placeholder="Enter your email" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm">
          <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-3 rounded-xl shadow-lg transition-all hover:scale-[1.02] min-h-[48px] text-sm">
            <i class="fas fa-gift mr-2"></i>Claim My 3 Free Reports
          </button>
        </form>
        <button onclick="closeExitPopup()" class="w-full mt-3 text-gray-400 hover:text-gray-600 text-xs text-center py-2 transition-colors">No thanks, I'll pass on free reports</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);

  // Click outside to close
  popup.addEventListener('click', (e) => {
    if (e.target === popup) closeExitPopup();
  });

  // Exit intent detection (desktop: mouse leaving viewport, mobile: scroll up fast)
  let exitShown = false;
  document.addEventListener('mouseout', (e) => {
    if (exitShown) return;
    if (e.clientY < 10 && !e.relatedTarget && !e.toElement) {
      showExitPopup();
    }
  });

  // Also show after 60s on page if not interacted with signup
  setTimeout(() => {
    if (!exitShown && !localStorage.getItem('rr_exit_dismissed')) {
      showExitPopup();
    }
  }, 60000);
}

window.showExitPopup = function() {
  if (localStorage.getItem('rr_exit_dismissed')) return;
  const popup = document.getElementById('exit-popup');
  const inner = document.getElementById('exit-popup-inner');
  popup.classList.remove('hidden');
  popup.classList.add('flex');
  setTimeout(() => {
    inner.style.transform = 'scale(1)';
    inner.style.opacity = '1';
  }, 10);
  rrTrack('exit_popup_shown');
};

window.closeExitPopup = function() {
  const popup = document.getElementById('exit-popup');
  const inner = document.getElementById('exit-popup-inner');
  inner.style.transform = 'scale(0.95)';
  inner.style.opacity = '0';
  setTimeout(() => {
    popup.classList.add('hidden');
    popup.classList.remove('flex');
  }, 300);
  localStorage.setItem('rr_exit_dismissed', '1');
};

window.exitPopupSubmit = function(e) {
  e.preventDefault();
  const email = document.getElementById('exit-email').value.trim();
  if (!email) return false;
  rrTrack('exit_popup_submit', { email_domain: email.split('@')[1] });
  window.location.href = '/signup?email=' + encodeURIComponent(email);
  return false;
};
