// ============================================================
// RoofReporterAI — Site Analytics Tracker v2
// Dual tracking: Internal D1 analytics + GA4 event bridging
// Tracks: pageviews, clicks, scroll depth, time on page,
//   engagement milestones, form interactions, CTA clicks,
//   navigation patterns, performance metrics, and errors.
// No cookies — uses localStorage UUID for visitor persistence.
// ============================================================
(function() {
  'use strict';
  
  // Don't track bots
  var ua = navigator.userAgent || '';
  if (/bot|crawl|spider|slurp|mediapartners|lighthouse|pagespeed|GTmetrix/i.test(ua)) return;
  
  var path = location.pathname;
  
  // ── Visitor & Session IDs ──
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  
  // Persistent visitor ID (survives browser close)
  var visitorId = localStorage.getItem('_rc_vid');
  if (!visitorId) {
    visitorId = uuid();
    localStorage.setItem('_rc_vid', visitorId);
  }
  
  // Session ID (survives page navigation, expires on tab close)
  var sessionId = sessionStorage.getItem('_rc_sid');
  var isNewSession = false;
  if (!sessionId) {
    sessionId = uuid();
    sessionStorage.setItem('_rc_sid', sessionId);
    isNewSession = true;
  }
  
  // Session page count
  var pageCount = parseInt(sessionStorage.getItem('_rc_pc') || '0') + 1;
  sessionStorage.setItem('_rc_pc', String(pageCount));
  
  // ── UTM parameters (persist for session) ──
  var params = new URLSearchParams(location.search);
  var utm = {
    source: params.get('utm_source') || sessionStorage.getItem('_rc_utm_s') || null,
    medium: params.get('utm_medium') || sessionStorage.getItem('_rc_utm_m') || null,
    campaign: params.get('utm_campaign') || sessionStorage.getItem('_rc_utm_c') || null,
    term: params.get('utm_term') || sessionStorage.getItem('_rc_utm_t') || null,
    content: params.get('utm_content') || sessionStorage.getItem('_rc_utm_co') || null
  };
  if (utm.source) sessionStorage.setItem('_rc_utm_s', utm.source);
  if (utm.medium) sessionStorage.setItem('_rc_utm_m', utm.medium);
  if (utm.campaign) sessionStorage.setItem('_rc_utm_c', utm.campaign);
  if (utm.term) sessionStorage.setItem('_rc_utm_t', utm.term);
  if (utm.content) sessionStorage.setItem('_rc_utm_co', utm.content);
  
  // ── Get logged-in user ID if available ──
  function getUserId() {
    try {
      var u = JSON.parse(localStorage.getItem('rc_customer') || '{}');
      return u.id ? String(u.id) : null;
    } catch(e) {
      try {
        var a = JSON.parse(localStorage.getItem('rc_user') || '{}');
        return a.id ? 'admin_' + a.id : null;
      } catch(e2) { return null; }
    }
  }
  
  // ── GA4 gtag helper — bridges events to Google Analytics ──
  function sendToGA4(eventName, eventParams) {
    if (typeof gtag !== 'function') return;
    try {
      // Merge our visitor data into GA4 event params
      var p = eventParams || {};
      p.visitor_id = visitorId;
      p.session_page_count = pageCount;
      
      // Map UTM if present
      if (utm.source) p.campaign_source = utm.source;
      if (utm.medium) p.campaign_medium = utm.medium;
      if (utm.campaign) p.campaign_name = utm.campaign;
      
      gtag('event', eventName, p);
    } catch(e) {}
  }
  
  // ── Event queue + batch sender (internal D1 analytics) ──
  var queue = [];
  var sendTimer = null;
  
  function enqueue(event) {
    event.session_id = sessionId;
    event.visitor_id = visitorId;
    event.user_id = getUserId();
    event.page_url = location.pathname + location.search;
    event.page_title = document.title;
    event.referrer = document.referrer || null;
    event.screen_width = screen.width;
    event.screen_height = screen.height;
    event.language = navigator.language;
    event.utm_source = utm.source;
    event.utm_medium = utm.medium;
    event.utm_campaign = utm.campaign;
    event.utm_term = utm.term;
    event.utm_content = utm.content;
    
    queue.push(event);
    
    // Batch send: wait 2s for more events, then flush
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(flush, 2000);
  }
  
  function flush() {
    if (queue.length === 0) return;
    var batch = queue.splice(0, 20);
    
    // Use sendBeacon for reliability (works even during page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', JSON.stringify(batch));
    } else {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true
      }).catch(function() {});
    }
  }
  
  // ── 1. PAGEVIEW — fires immediately on load ──
  enqueue({ event_type: 'pageview' });
  
  // Also send to GA4 with enriched page data
  sendToGA4('page_view_enriched', {
    page_path: path,
    page_title: document.title,
    page_referrer: document.referrer,
    is_new_session: isNewSession,
    session_page_count: pageCount,
    screen_resolution: screen.width + 'x' + screen.height,
    viewport_size: window.innerWidth + 'x' + window.innerHeight,
    content_group: getContentGroup(path)
  });
  
  // Track new sessions as a separate GA4 event
  if (isNewSession) {
    sendToGA4('session_start_enriched', {
      landing_page: path,
      referrer: document.referrer || '(direct)',
      referrer_domain: document.referrer ? (new URL(document.referrer).hostname) : '(direct)',
      device_type: /Mobile|Android|iPhone/.test(ua) ? 'mobile' : /iPad|Tablet/.test(ua) ? 'tablet' : 'desktop'
    });
  }
  
  function getContentGroup(p) {
    if (p === '/') return 'Landing';
    if (p.startsWith('/customer/dashboard')) return 'Dashboard';
    if (p.startsWith('/customer/login')) return 'Auth';
    if (p.startsWith('/customer/order')) return 'Order';
    if (p.startsWith('/customer/')) return 'CRM';
    if (p.startsWith('/blog')) return 'Blog';
    if (p.startsWith('/pricing')) return 'Pricing';
    if (p.startsWith('/lander')) return 'Lander';
    if (p.startsWith('/proposal/')) return 'Proposal';
    if (p.startsWith('/admin') || p.startsWith('/super-admin')) return 'Admin';
    if (p.startsWith('/login')) return 'Admin Auth';
    return 'Other';
  }
  
  // ── 2. CLICK TRACKING — every click on the page ──
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a, button, [onclick], input[type="submit"], .sa-nav-item, [role="button"]') || e.target;
    var tag = el.tagName || 'UNKNOWN';
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : '';
    var text = (el.innerText || el.value || el.alt || el.title || '').substring(0, 100).trim();
    var href = el.href || el.getAttribute('href') || '';
    
    // Internal D1 tracking
    enqueue({
      event_type: 'click',
      click_element: tag + id + cls,
      click_text: text,
      click_x: Math.round(e.pageX),
      click_y: Math.round(e.pageY)
    });
    
    // Classify click type for GA4
    var clickType = 'general';
    if (tag === 'A') {
      if (href.startsWith('http') && !href.includes(location.hostname)) clickType = 'outbound';
      else if (href.includes('/customer/login') || href.includes('/lander')) clickType = 'cta';
      else clickType = 'navigation';
    } else if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
      if (text.match(/sign|login|register|start|claim|order|buy|pay|submit/i)) clickType = 'cta';
      else clickType = 'action';
    }
    
    // Send CTA and outbound clicks to GA4 for conversion tracking
    if (clickType === 'cta') {
      sendToGA4('cta_click', {
        click_text: text,
        click_element: tag + id,
        click_url: href || path,
        page_path: path
      });
    } else if (clickType === 'outbound') {
      sendToGA4('outbound_click', {
        click_text: text,
        click_url: href,
        page_path: path
      });
    }
  }, { passive: true, capture: true });
  
  // ── 3. SCROLL DEPTH — track max scroll + milestone events ──
  var maxScroll = 0;
  var scrollMilestones = { 25: false, 50: false, 75: false, 90: false, 100: false };
  var scrollTimer = null;
  
  function trackScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    var winHeight = window.innerHeight;
    if (docHeight <= winHeight) return; // No scrollable content
    var pct = Math.round((scrollTop + winHeight) / docHeight * 100);
    if (pct > maxScroll) maxScroll = Math.min(pct, 100);
    
    // Fire GA4 milestone events (only once per milestone per page)
    for (var threshold in scrollMilestones) {
      if (!scrollMilestones[threshold] && maxScroll >= parseInt(threshold)) {
        scrollMilestones[threshold] = true;
        sendToGA4('scroll_milestone', {
          scroll_depth: parseInt(threshold),
          page_path: path,
          time_to_milestone: Math.round((Date.now() - pageLoadTime) / 1000)
        });
      }
    }
  }
  
  window.addEventListener('scroll', function() {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(trackScroll, 200);
  }, { passive: true });
  
  // ── 4. TIME ON PAGE + ENGAGEMENT ──
  var pageLoadTime = Date.now();
  var engagementMilestones = { 10: false, 30: false, 60: false, 120: false, 300: false };
  var engagementTimer = null;
  var isVisible = true;
  var activeTime = 0;
  var lastActive = Date.now();
  
  // Track visibility changes for accurate active time
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      isVisible = false;
      activeTime += (Date.now() - lastActive);
    } else {
      isVisible = true;
      lastActive = Date.now();
    }
  });
  
  // Check engagement milestones every 5 seconds
  function checkEngagement() {
    if (!isVisible) return;
    var currentActive = activeTime + (Date.now() - lastActive);
    var seconds = Math.round(currentActive / 1000);
    
    for (var threshold in engagementMilestones) {
      if (!engagementMilestones[threshold] && seconds >= parseInt(threshold)) {
        engagementMilestones[threshold] = true;
        sendToGA4('engagement_milestone', {
          engagement_time_seconds: parseInt(threshold),
          page_path: path,
          scroll_depth: maxScroll
        });
      }
    }
  }
  engagementTimer = setInterval(checkEngagement, 5000);
  
  // ── 5. FORM INTERACTION TRACKING ──
  // Track form starts and completions for conversion funnel analysis
  var formStarted = {};
  
  document.addEventListener('focusin', function(e) {
    var form = e.target.closest('form');
    if (!form) return;
    var formId = form.id || form.getAttribute('name') || 'form_' + Array.from(document.forms).indexOf(form);
    if (!formStarted[formId]) {
      formStarted[formId] = true;
      sendToGA4('form_start', {
        form_id: formId,
        form_destination: form.action || path,
        page_path: path
      });
      enqueue({
        event_type: 'form_start',
        click_element: 'FORM#' + formId,
        click_text: formId
      });
    }
  }, { passive: true });
  
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var formId = form.id || form.getAttribute('name') || 'form_' + Array.from(document.forms).indexOf(form);
    sendToGA4('form_submit', {
      form_id: formId,
      form_destination: form.action || path,
      page_path: path,
      time_to_submit: Math.round((Date.now() - pageLoadTime) / 1000)
    });
    enqueue({
      event_type: 'form_submit',
      click_element: 'FORM#' + formId,
      click_text: formId
    });
  }, { passive: true, capture: true });
  
  // ── 6. PERFORMANCE METRICS — Web Vitals via PerformanceObserver ──
  // Sends Core Web Vitals to GA4 for site speed analysis
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      // Largest Contentful Paint (LCP)
      var lcpObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        if (entries.length > 0) {
          var lcp = entries[entries.length - 1];
          sendToGA4('web_vitals', {
            metric_name: 'LCP',
            metric_value: Math.round(lcp.startTime),
            metric_rating: lcp.startTime < 2500 ? 'good' : lcp.startTime < 4000 ? 'needs_improvement' : 'poor',
            page_path: path
          });
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      
      // First Input Delay (FID) / Interaction to Next Paint (INP)
      var fidObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        if (entries.length > 0) {
          var fid = entries[0];
          sendToGA4('web_vitals', {
            metric_name: 'FID',
            metric_value: Math.round(fid.processingStart - fid.startTime),
            metric_rating: (fid.processingStart - fid.startTime) < 100 ? 'good' : (fid.processingStart - fid.startTime) < 300 ? 'needs_improvement' : 'poor',
            page_path: path
          });
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      
      // Cumulative Layout Shift (CLS)
      var clsValue = 0;
      var clsObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].hadRecentInput) clsValue += entries[i].value;
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      
      // Send CLS on page unload
      window.addEventListener('pagehide', function() {
        sendToGA4('web_vitals', {
          metric_name: 'CLS',
          metric_value: Math.round(clsValue * 1000) / 1000,
          metric_rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs_improvement' : 'poor',
          page_path: path
        });
      });
    } catch(e) {}
    
    // Navigation timing (page load speed)
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          var nav = performance.getEntriesByType('navigation')[0];
          if (nav) {
            var loadTime = Math.round(nav.loadEventEnd - nav.startTime);
            var domReady = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
            var ttfb = Math.round(nav.responseStart - nav.requestStart);
            
            sendToGA4('page_timing', {
              page_load_time: loadTime,
              dom_ready_time: domReady,
              ttfb: ttfb,
              transfer_size: nav.transferSize || 0,
              page_path: path,
              connection_type: (navigator.connection && navigator.connection.effectiveType) || 'unknown'
            });
          }
        } catch(e) {}
      }, 100);
    });
  }
  
  // ── 7. ERROR TRACKING — JavaScript errors ──
  window.addEventListener('error', function(e) {
    sendToGA4('js_error', {
      error_message: (e.message || '').substring(0, 150),
      error_source: (e.filename || '').substring(0, 100),
      error_line: e.lineno || 0,
      page_path: path
    });
    enqueue({
      event_type: 'js_error',
      click_element: 'ERROR',
      click_text: (e.message || '').substring(0, 200)
    });
  });
  
  // ── 8. BUSINESS-SPECIFIC EVENT TRACKING ──
  // Listen for custom events from app scripts (report generation, payments, etc.)
  window.addEventListener('rc:track', function(e) {
    var detail = e.detail || {};
    if (detail.event_name) {
      // Send to both GA4 and internal analytics
      sendToGA4(detail.event_name, detail.params || {});
      enqueue({
        event_type: detail.event_name,
        click_element: detail.element || '',
        click_text: detail.label || ''
      });
    }
  });
  
  // Expose global tracking function for inline scripts
  window.rcTrack = function(eventName, eventParams) {
    sendToGA4(eventName, eventParams || {});
    enqueue({
      event_type: eventName,
      click_element: (eventParams && eventParams.element) || '',
      click_text: (eventParams && eventParams.label) || ''
    });
  };
  
  // ── 9. PAGE EXIT — send everything on unload ──
  function sendExitEvent() {
    var currentActive = activeTime;
    if (isVisible) currentActive += (Date.now() - lastActive);
    var timeOnPage = Math.round(currentActive / 1000);
    
    // Send detailed exit event to internal analytics
    var exitEvent = [{
      event_type: 'page_exit',
      session_id: sessionId,
      visitor_id: visitorId,
      user_id: getUserId(),
      page_url: location.pathname + location.search,
      page_title: document.title,
      scroll_depth: maxScroll,
      time_on_page: timeOnPage,
      screen_width: screen.width,
      screen_height: screen.height,
      language: navigator.language
    }];
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', JSON.stringify(exitEvent));
    }
    
    // Send exit event to GA4 with full engagement data
    sendToGA4('page_exit', {
      page_path: path,
      scroll_depth: maxScroll,
      time_on_page: timeOnPage,
      session_page_count: pageCount,
      engaged: timeOnPage > 10 && maxScroll > 25 // Was visitor engaged?
    });
    
    // Clean up
    if (engagementTimer) clearInterval(engagementTimer);
  }
  
  // Use multiple exit handlers for maximum reliability
  window.addEventListener('pagehide', sendExitEvent);
  window.addEventListener('beforeunload', sendExitEvent);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') sendExitEvent();
  });
  
  // Flush any remaining events before page close
  window.addEventListener('pagehide', flush);
  
})();
