// ============================================================
// D2D Manager — Full-featured door-to-door sales management
// Features: Turf drawing on map, pin placement, team management
// ============================================================
(function() {
  'use strict';

  var root = document.getElementById('d2d-app');
  if (!root) return;

  // --- State ---
  var map, drawingManager, geocoder;
  var turfs = [], pins = [], team = [], stats = {};
  var selectedTurfId = null;
  var activeTool = 'pointer'; // pointer | pin | turf
  var turfPolygons = {};  // id → google.maps.Polygon
  var pinMarkers = {};    // id → google.maps.marker.AdvancedMarkerElement or Marker
  var currentDrawingPolygon = null;
  var infoWindow = null;

  var COLORS = ['#0ea5e9','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316',
                '#6366f1','#84cc16','#06b6d4','#e11d48','#a855f7','#10b981','#f43f5e','#3b82f6'];

  var PIN_COLORS = {
    yes: '#22c55e', no: '#ef4444', no_answer: '#f59e0b', not_knocked: '#9ca3af'
  };
  var PIN_ICONS = {
    yes: 'fa-check-circle', no: 'fa-times-circle', no_answer: 'fa-question-circle', not_knocked: 'fa-circle'
  };
  var PIN_LABELS = {
    yes: 'Yes / Interested', no: 'No / Not Interested', no_answer: 'No Answer', not_knocked: 'Not Knocked'
  };

  function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
  function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

  // --- API ---
  function api(method, path, body) {
    var opts = { method: method, headers: authHeaders() };
    if (body) opts.body = JSON.stringify(body);
    return fetch('/api/d2d' + path, opts).then(function(r) { return r.json(); });
  }

  // --- Toast ---
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'fixed bottom-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ' + (type === 'error' ? 'bg-red-600' : 'bg-green-600');
    t.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle') + ' mr-2"></i>' + msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 3000);
  }

  // ============================================================
  // RENDER LAYOUT
  // ============================================================
  function renderLayout() {
    root.innerHTML = '<div class="d2d-container">' +
      '<div class="d2d-sidebar">' +
        // Stats
        '<div class="d2d-stats" id="d2dStats"></div>' +
        // Tabs
        '<div class="d2d-tabs">' +
          '<div class="d2d-tab active" data-tab="turfs"><i class="fas fa-map"></i>Turfs</div>' +
          '<div class="d2d-tab" data-tab="pins"><i class="fas fa-map-pin"></i>Pins</div>' +
          '<div class="d2d-tab" data-tab="team"><i class="fas fa-users"></i>Team</div>' +
        '</div>' +
        // Panels
        '<div class="d2d-panel active" id="panelTurfs"></div>' +
        '<div class="d2d-panel" id="panelPins"></div>' +
        '<div class="d2d-panel" id="panelTeam"></div>' +
      '</div>' +
      '<div class="d2d-map-area">' +
        '<div id="d2dMap" style="width:100%;height:100%"></div>' +
        // Toolbar
        '<div class="d2d-toolbar" id="d2dToolbar">' +
          '<div class="d2d-tool active" data-tool="pointer" title="Select"><i class="fas fa-mouse-pointer"></i></div>' +
          '<div class="d2d-tool" data-tool="turf" title="Draw Turf"><i class="fas fa-draw-polygon"></i></div>' +
          '<div class="d2d-tool" data-tool="pin" title="Place Pin"><i class="fas fa-map-pin"></i></div>' +
        '</div>' +
        // Legend
        '<div class="d2d-legend">' +
          '<div class="d2d-legend-row"><div class="d2d-legend-dot" style="background:#22c55e"></div>Yes / Interested</div>' +
          '<div class="d2d-legend-row"><div class="d2d-legend-dot" style="background:#ef4444"></div>No / Not Interested</div>' +
          '<div class="d2d-legend-row"><div class="d2d-legend-dot" style="background:#f59e0b"></div>No Answer</div>' +
          '<div class="d2d-legend-row"><div class="d2d-legend-dot" style="background:#9ca3af"></div>Not Knocked</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Tab switching
    document.querySelectorAll('.d2d-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.d2d-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.d2d-panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('panel' + capitalize(tab.getAttribute('data-tab'))).classList.add('active');
      });
    });

    // Tool switching
    document.querySelectorAll('.d2d-tool').forEach(function(tool) {
      tool.addEventListener('click', function() {
        setActiveTool(tool.getAttribute('data-tool'));
      });
    });
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function setActiveTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.d2d-tool').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-tool') === tool);
    });
    if (map) {
      map.setOptions({ draggableCursor: tool === 'pin' ? 'crosshair' : (tool === 'turf' ? 'crosshair' : '') });
    }
    // Cancel any ongoing polygon drawing
    if (tool !== 'turf' && currentDrawingPolygon) {
      currentDrawingPolygon.setMap(null);
      currentDrawingPolygon = null;
    }
  }

  // ============================================================
  // STATS
  // ============================================================
  function renderStats() {
    var el = document.getElementById('d2dStats');
    if (!el) return;
    el.innerHTML =
      '<div class="d2d-stat"><div class="d2d-stat-val text-sky-600">' + (stats.total_turfs || 0) + '</div><div class="d2d-stat-label">Turfs</div></div>' +
      '<div class="d2d-stat"><div class="d2d-stat-val text-green-600">' + (stats.total_yes || 0) + '</div><div class="d2d-stat-label">Yes</div></div>' +
      '<div class="d2d-stat"><div class="d2d-stat-val text-red-600">' + (stats.total_no || 0) + '</div><div class="d2d-stat-label">No</div></div>' +
      '<div class="d2d-stat"><div class="d2d-stat-val text-amber-500">' + (stats.total_no_answer || 0) + '</div><div class="d2d-stat-label">No Ans</div></div>';
  }

  // ============================================================
  // TURFS PANEL
  // ============================================================
  function renderTurfsPanel() {
    var panel = document.getElementById('panelTurfs');
    if (!panel) return;

    var html = '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="font-bold text-gray-800 text-sm">Turfs <span class="text-gray-400 font-normal">(' + turfs.length + ')</span></h3>' +
      '<button class="d2d-btn d2d-btn-primary d2d-btn-sm" onclick="window.d2d.startDrawTurf()"><i class="fas fa-plus mr-1"></i>New Turf</button>' +
    '</div>';

    if (turfs.length === 0) {
      html += '<div class="d2d-empty"><i class="fas fa-map-marked-alt"></i><p>No turfs yet.<br>Click "New Turf" or use the draw tool on the map.</p></div>';
    } else {
      for (var i = 0; i < turfs.length; i++) {
        var t = turfs[i];
        var total = (t.yes_count || 0) + (t.no_count || 0) + (t.no_answer_count || 0) + (t.not_knocked_count || 0);
        var knocked = (t.yes_count || 0) + (t.no_count || 0) + (t.no_answer_count || 0);
        var pct = total > 0 ? Math.round((knocked / total) * 100) : 0;
        html += '<div class="d2d-card' + (selectedTurfId == t.id ? ' selected' : '') + '" onclick="window.d2d.selectTurf(' + t.id + ')">' +
          '<div class="flex items-start justify-between">' +
            '<div class="flex items-center gap-2">' +
              '<div style="width:14px;height:14px;border-radius:4px;background:' + (t.color || '#0ea5e9') + '"></div>' +
              '<div><div class="font-semibold text-gray-800 text-sm">' + escH(t.name) + '</div>' +
                (t.assigned_name ? '<div class="text-xs text-gray-500"><i class="fas fa-user mr-1"></i>' + escH(t.assigned_name) + '</div>' : '<div class="text-xs text-gray-400">Unassigned</div>') +
              '</div>' +
            '</div>' +
            '<div class="flex gap-1">' +
              '<button class="text-gray-400 hover:text-sky-500 text-xs" onclick="event.stopPropagation();window.d2d.editTurf(' + t.id + ')" title="Edit"><i class="fas fa-pen"></i></button>' +
              '<button class="text-gray-400 hover:text-red-500 text-xs" onclick="event.stopPropagation();window.d2d.deleteTurf(' + t.id + ')" title="Delete"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">' +
            '<div class="pin-yes rounded px-1 py-0.5"><b>' + (t.yes_count || 0) + '</b> Yes</div>' +
            '<div class="pin-no rounded px-1 py-0.5"><b>' + (t.no_count || 0) + '</b> No</div>' +
            '<div class="pin-no-answer rounded px-1 py-0.5"><b>' + (t.no_answer_count || 0) + '</b> N/A</div>' +
            '<div class="pin-not-knocked rounded px-1 py-0.5"><b>' + (t.not_knocked_count || 0) + '</b> TBD</div>' +
          '</div>' +
          '<div class="mt-2">' +
            '<div class="flex justify-between text-[10px] mb-1"><span class="text-gray-500">Progress</span><span class="font-semibold">' + pct + '%</span></div>' +
            '<div class="w-full bg-gray-200 rounded-full h-1.5"><div class="h-1.5 rounded-full" style="width:' + pct + '%;background:' + (t.color || '#0ea5e9') + '"></div></div>' +
          '</div>' +
        '</div>';
      }
    }

    panel.innerHTML = html;
  }

  // ============================================================
  // PINS PANEL
  // ============================================================
  function renderPinsPanel() {
    var panel = document.getElementById('panelPins');
    if (!panel) return;

    // Filter bar
    var html = '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="font-bold text-gray-800 text-sm">Door Pins <span class="text-gray-400 font-normal">(' + pins.length + ')</span></h3>' +
      '<select id="pinFilter" class="d2d-select" style="width:auto;font-size:11px;padding:4px 8px" onchange="window.d2d.filterPins(this.value)">' +
        '<option value="">All Statuses</option>' +
        '<option value="yes">Yes</option>' +
        '<option value="no">No</option>' +
        '<option value="no_answer">No Answer</option>' +
        '<option value="not_knocked">Not Knocked</option>' +
      '</select>' +
    '</div>';

    if (pins.length === 0) {
      html += '<div class="d2d-empty"><i class="fas fa-map-pin"></i><p>No pins yet.<br>Use the pin tool to drop pins on houses.</p></div>';
    } else {
      // Group by turf
      var byTurf = {};
      var noTurf = [];
      for (var i = 0; i < pins.length; i++) {
        var p = pins[i];
        if (p.turf_id) {
          if (!byTurf[p.turf_id]) byTurf[p.turf_id] = { name: p.turf_name || 'Turf #' + p.turf_id, pins: [] };
          byTurf[p.turf_id].pins.push(p);
        } else {
          noTurf.push(p);
        }
      }

      for (var tid in byTurf) {
        html += '<div class="text-xs font-semibold text-gray-500 mb-1 mt-2"><i class="fas fa-map mr-1"></i>' + escH(byTurf[tid].name) + ' (' + byTurf[tid].pins.length + ')</div>';
        for (var j = 0; j < byTurf[tid].pins.length; j++) {
          html += renderPinCard(byTurf[tid].pins[j]);
        }
      }
      if (noTurf.length > 0) {
        html += '<div class="text-xs font-semibold text-gray-500 mb-1 mt-2">Unassigned (' + noTurf.length + ')</div>';
        for (var k = 0; k < noTurf.length; k++) {
          html += renderPinCard(noTurf[k]);
        }
      }
    }

    panel.innerHTML = html;
  }

  function renderPinCard(p) {
    var statusClass = 'pin-' + (p.status || 'not_knocked').replace('_', '-');
    return '<div class="d2d-card" onclick="window.d2d.focusPin(' + p.id + ')" style="padding:8px 10px">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
          '<i class="fas ' + (PIN_ICONS[p.status] || 'fa-circle') + '" style="color:' + (PIN_COLORS[p.status] || '#9ca3af') + '"></i>' +
          '<div>' +
            '<div class="text-xs font-semibold text-gray-800">' + escH(p.address || 'Pin #' + p.id) + '</div>' +
            '<div class="text-[10px] text-gray-400">' + (p.knocked_by_name ? 'by ' + escH(p.knocked_by_name) : '') +
              (p.knocked_at ? ' · ' + fmtDate(p.knocked_at) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<span class="' + statusClass + ' text-[10px] px-2 py-0.5 rounded-full font-semibold">' + (PIN_LABELS[p.status] || p.status) + '</span>' +
          '<button class="text-gray-400 hover:text-red-500 text-[10px] ml-1" onclick="event.stopPropagation();window.d2d.deletePin(' + p.id + ')"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ============================================================
  // TEAM PANEL
  // ============================================================
  function renderTeamPanel() {
    var panel = document.getElementById('panelTeam');
    if (!panel) return;

    var html = '<div class="flex items-center justify-between mb-3">' +
      '<h3 class="font-bold text-gray-800 text-sm">Team Members <span class="text-gray-400 font-normal">(' + team.length + ')</span></h3>' +
      '<button class="d2d-btn d2d-btn-primary d2d-btn-sm" onclick="window.d2d.addMember()"><i class="fas fa-plus mr-1"></i>Add Member</button>' +
    '</div>';

    if (team.length === 0) {
      html += '<div class="d2d-empty"><i class="fas fa-users"></i><p>No team members yet.<br>Add your sales team to assign turfs.</p></div>';
    } else {
      for (var i = 0; i < team.length; i++) {
        var m = team[i];
        html += '<div class="d2d-card">' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2">' +
              '<div style="width:32px;height:32px;border-radius:50%;background:' + (m.color || '#3B82F6') + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">' + (m.name || '?').charAt(0).toUpperCase() + '</div>' +
              '<div>' +
                '<div class="font-semibold text-gray-800 text-sm">' + escH(m.name) + '</div>' +
                '<div class="text-[10px] text-gray-400 capitalize"><i class="fas ' + (m.role === 'manager' ? 'fa-user-tie' : 'fa-user') + ' mr-1"></i>' + (m.role || 'salesperson') +
                  (m.email ? ' · ' + escH(m.email) : '') + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="flex gap-1">' +
              '<button class="text-gray-400 hover:text-sky-500 text-xs" onclick="window.d2d.editMember(' + m.id + ')" title="Edit"><i class="fas fa-pen"></i></button>' +
              '<button class="text-gray-400 hover:text-red-500 text-xs" onclick="window.d2d.deleteMember(' + m.id + ')" title="Remove"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">' +
            '<div class="bg-sky-50 text-sky-700 rounded px-1 py-0.5"><b>' + (m.turf_count || 0) + '</b> Turfs</div>' +
            '<div class="bg-gray-50 text-gray-700 rounded px-1 py-0.5"><b>' + (m.knock_count || 0) + '</b> Knocks</div>' +
            '<div class="bg-green-50 text-green-700 rounded px-1 py-0.5"><b>' + (m.yes_count || 0) + '</b> Yes</div>' +
          '</div>' +
        '</div>';
      }
    }

    panel.innerHTML = html;
  }

  // ============================================================
  // MAP INITIALIZATION
  // ============================================================
  function initMap() {
    if (typeof google === 'undefined' || !google.maps) {
      // Retry after a short delay
      setTimeout(initMap, 500);
      return;
    }

    var defaultCenter = { lat: 51.0447, lng: -114.0719 }; // Calgary, AB
    map = new google.maps.Map(document.getElementById('d2dMap'), {
      center: defaultCenter,
      zoom: 13,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] }
      ]
    });

    geocoder = new google.maps.Geocoder();
    infoWindow = new google.maps.InfoWindow();

    // Click handler for pin placement
    map.addListener('click', function(e) {
      if (activeTool === 'pin') {
        placePinAtLocation(e.latLng);
      }
    });

    // Load initial data
    loadAll();
  }

  // ============================================================
  // DATA LOADING
  // ============================================================
  function loadAll() {
    Promise.all([
      api('GET', '/turfs'),
      api('GET', '/pins'),
      api('GET', '/team'),
      api('GET', '/stats')
    ]).then(function(results) {
      turfs = (results[0].turfs || []);
      pins = (results[1].pins || []);
      team = (results[2].members || []);
      stats = results[3].stats || {};
      renderAll();
      renderMapObjects();
    }).catch(function(err) {
      console.error('[D2D] Load error:', err);
    });
  }

  function renderAll() {
    renderStats();
    renderTurfsPanel();
    renderPinsPanel();
    renderTeamPanel();
  }

  // ============================================================
  // MAP RENDERING
  // ============================================================
  function renderMapObjects() {
    // Clear old
    for (var pid in pinMarkers) {
      pinMarkers[pid].setMap(null);
    }
    pinMarkers = {};
    for (var tid in turfPolygons) {
      turfPolygons[tid].setMap(null);
    }
    turfPolygons = {};

    // Draw turfs
    for (var i = 0; i < turfs.length; i++) {
      drawTurfOnMap(turfs[i]);
    }

    // Draw pins
    for (var j = 0; j < pins.length; j++) {
      drawPinOnMap(pins[j]);
    }

    // Auto-zoom to fit
    if (turfs.length > 0 || pins.length > 0) {
      var bounds = new google.maps.LatLngBounds();
      for (var ti = 0; ti < turfs.length; ti++) {
        try {
          var poly = JSON.parse(turfs[ti].polygon_json || '[]');
          for (var pi = 0; pi < poly.length; pi++) {
            bounds.extend(new google.maps.LatLng(poly[pi].lat, poly[pi].lng));
          }
        } catch(e) {}
      }
      for (var pk = 0; pk < pins.length; pk++) {
        bounds.extend(new google.maps.LatLng(pins[pk].lat, pins[pk].lng));
      }
      map.fitBounds(bounds, 60);
    }
  }

  function drawTurfOnMap(turf) {
    try {
      var coords = JSON.parse(turf.polygon_json || '[]');
      if (coords.length < 3) return;

      var color = turf.color || '#0ea5e9';
      var polygon = new google.maps.Polygon({
        paths: coords,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        map: map,
        zIndex: 1
      });

      polygon.addListener('click', function(e) {
        selectTurf(turf.id);
        showTurfInfo(turf, e.latLng);
      });

      turfPolygons[turf.id] = polygon;
    } catch(e) {
      console.error('[D2D] Invalid turf polygon:', e);
    }
  }

  function drawPinOnMap(pin) {
    var color = PIN_COLORS[pin.status] || '#9ca3af';

    // Create custom marker element
    var el = document.createElement('div');
    el.style.cssText = 'width:28px;height:28px;background:' + color + ';border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;';
    
    var icon = document.createElement('i');
    icon.className = 'fas ' + (PIN_ICONS[pin.status] || 'fa-circle');
    icon.style.cssText = 'color:#fff;font-size:10px;';
    el.appendChild(icon);

    var marker;
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
      marker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: { lat: pin.lat, lng: pin.lng },
        content: el,
        zIndex: 10
      });
      marker.addListener('click', function() {
        showPinInfo(pin, marker);
      });
    } else {
      // Fallback to classic marker
      marker = new google.maps.Marker({
        map: map,
        position: { lat: pin.lat, lng: pin.lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2
        },
        zIndex: 10
      });
      marker.addListener('click', function() {
        showPinInfo(pin, marker);
      });
    }

    pinMarkers[pin.id] = marker;
  }

  // ============================================================
  // INFO WINDOWS
  // ============================================================
  function showTurfInfo(turf, latLng) {
    var total = (turf.yes_count||0) + (turf.no_count||0) + (turf.no_answer_count||0) + (turf.not_knocked_count||0);
    var html = '<div class="d2d-info">' +
      '<h4><i class="fas fa-map mr-1" style="color:' + (turf.color||'#0ea5e9') + '"></i>' + escH(turf.name) + '</h4>' +
      '<div class="d2d-info-row"><span class="d2d-info-label">Assigned to</span><span class="d2d-info-value">' + escH(turf.assigned_name || 'Unassigned') + '</span></div>' +
      '<div class="d2d-info-row"><span class="d2d-info-label">Total pins</span><span class="d2d-info-value">' + total + '</span></div>' +
      '<div class="d2d-info-row"><span class="d2d-info-label">Yes</span><span class="d2d-info-value" style="color:#22c55e">' + (turf.yes_count||0) + '</span></div>' +
      '<div class="d2d-info-row"><span class="d2d-info-label">No</span><span class="d2d-info-value" style="color:#ef4444">' + (turf.no_count||0) + '</span></div>' +
      '<div class="d2d-info-row"><span class="d2d-info-label">No Answer</span><span class="d2d-info-value" style="color:#f59e0b">' + (turf.no_answer_count||0) + '</span></div>' +
      '<div style="margin-top:8px;display:flex;gap:4px">' +
        '<button onclick="window.d2d.editTurf(' + turf.id + ')" class="d2d-btn d2d-btn-outline d2d-btn-sm"><i class="fas fa-pen mr-1"></i>Edit</button>' +
        '<button onclick="window.d2d.deleteTurf(' + turf.id + ')" class="d2d-btn d2d-btn-danger d2d-btn-sm"><i class="fas fa-trash mr-1"></i>Delete</button>' +
      '</div>' +
    '</div>';
    infoWindow.setContent(html);
    infoWindow.setPosition(latLng);
    infoWindow.open(map);
  }

  function showPinInfo(pin, marker) {
    var memberOpts = '<option value="">Not assigned</option>';
    for (var i = 0; i < team.length; i++) {
      memberOpts += '<option value="' + team[i].id + '"' + (pin.knocked_by == team[i].id ? ' selected' : '') + '>' + escH(team[i].name) + '</option>';
    }

    var html = '<div class="d2d-info">' +
      '<h4><i class="fas fa-map-pin mr-1" style="color:' + (PIN_COLORS[pin.status]||'#9ca3af') + '"></i>' + escH(pin.address || 'Pin #' + pin.id) + '</h4>' +
      (pin.turf_name ? '<div class="text-xs text-gray-500 mb-2"><i class="fas fa-map mr-1"></i>' + escH(pin.turf_name) + '</div>' : '') +
      '<div class="d2d-info-row"><span class="d2d-info-label">Status</span><span class="d2d-info-value">' + (PIN_LABELS[pin.status]||pin.status) + '</span></div>' +
      (pin.knocked_by_name ? '<div class="d2d-info-row"><span class="d2d-info-label">Knocked by</span><span class="d2d-info-value">' + escH(pin.knocked_by_name) + '</span></div>' : '') +
      (pin.knocked_at ? '<div class="d2d-info-row"><span class="d2d-info-label">Date</span><span class="d2d-info-value">' + fmtDate(pin.knocked_at) + '</span></div>' : '') +
      (pin.notes ? '<div class="d2d-info-row"><span class="d2d-info-label">Notes</span><span class="d2d-info-value">' + escH(pin.notes) + '</span></div>' : '') +
      '<div style="margin-top:10px">' +
        '<div class="text-xs text-gray-500 mb-1">Update Status:</div>' +
        '<div class="d2d-pin-actions">' +
          '<button onclick="window.d2d.updatePinStatus(' + pin.id + ',\'yes\')" class="d2d-pin-btn" style="background:#dcfce7;border-color:#86efac;color:#166534">Yes</button>' +
          '<button onclick="window.d2d.updatePinStatus(' + pin.id + ',\'no\')" class="d2d-pin-btn" style="background:#fee2e2;border-color:#fca5a5;color:#991b1b">No</button>' +
          '<button onclick="window.d2d.updatePinStatus(' + pin.id + ',\'no_answer\')" class="d2d-pin-btn" style="background:#fef3c7;border-color:#fcd34d;color:#92400e">N/A</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px">' +
        '<label class="text-xs text-gray-500">Assign to:</label>' +
        '<select onchange="window.d2d.assignPin(' + pin.id + ',this.value)" style="width:100%;font-size:11px;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;margin-top:2px">' + memberOpts + '</select>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:4px">' +
        '<button onclick="window.d2d.addPinNotes(' + pin.id + ')" class="d2d-btn d2d-btn-outline d2d-btn-sm"><i class="fas fa-sticky-note mr-1"></i>Notes</button>' +
        '<button onclick="window.d2d.deletePin(' + pin.id + ')" class="d2d-btn d2d-btn-danger d2d-btn-sm"><i class="fas fa-trash mr-1"></i>Delete</button>' +
      '</div>' +
    '</div>';

    infoWindow.setContent(html);
    if (marker.position) {
      infoWindow.setPosition(marker.position instanceof google.maps.LatLng ? marker.position : new google.maps.LatLng(marker.position.lat, marker.position.lng));
    }
    infoWindow.open(map);
  }

  // ============================================================
  // TURF DRAWING (Polygon)
  // ============================================================
  var drawingPoints = [];
  var drawingMarkers = [];
  var drawingPolyline = null;

  function startDrawTurf() {
    setActiveTool('turf');
    drawingPoints = [];
    clearDrawingUI();
    toast('Click on the map to place turf boundary points. Double-click to finish.', 'info');

    // Use map click for polygon drawing
    var clickListener = map.addListener('click', function(e) {
      drawingPoints.push({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      // Draw marker at point
      var marker = new google.maps.Marker({
        position: e.latLng,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#0ea5e9',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2
        },
        zIndex: 100
      });
      drawingMarkers.push(marker);

      // Draw polyline
      if (drawingPolyline) drawingPolyline.setMap(null);
      drawingPolyline = new google.maps.Polyline({
        path: drawingPoints,
        strokeColor: '#0ea5e9',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        map: map
      });
    });

    var dblClickListener = map.addListener('dblclick', function(e) {
      google.maps.event.removeListener(clickListener);
      google.maps.event.removeListener(dblClickListener);
      clearDrawingUI();

      if (drawingPoints.length < 3) {
        toast('Need at least 3 points to create a turf.', 'error');
        setActiveTool('pointer');
        return;
      }

      // Show save dialog
      showSaveTurfModal(drawingPoints);
    });
  }

  function clearDrawingUI() {
    for (var i = 0; i < drawingMarkers.length; i++) drawingMarkers[i].setMap(null);
    drawingMarkers = [];
    if (drawingPolyline) { drawingPolyline.setMap(null); drawingPolyline = null; }
  }

  function showSaveTurfModal(polygon) {
    // Calculate center
    var cLat = 0, cLng = 0;
    for (var i = 0; i < polygon.length; i++) { cLat += polygon[i].lat; cLng += polygon[i].lng; }
    cLat /= polygon.length; cLng /= polygon.length;

    var colorGrid = '';
    for (var ci = 0; ci < COLORS.length; ci++) {
      colorGrid += '<div class="d2d-color-swatch' + (ci === 0 ? ' selected' : '') + '" style="background:' + COLORS[ci] + '" data-color="' + COLORS[ci] + '"></div>';
    }

    var teamOpts = '<option value="">Unassigned</option>';
    for (var ti = 0; ti < team.length; ti++) {
      teamOpts += '<option value="' + team[ti].id + '">' + escH(team[ti].name) + '</option>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'd2dModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h3 class="font-bold text-gray-800"><i class="fas fa-draw-polygon mr-2 text-sky-500"></i>Create New Turf</h3><button onclick="document.getElementById(\'d2dModal\').remove()" class="text-gray-400 hover:text-gray-600 text-lg">&times;</button></div>' +
      '<div class="p-6 space-y-4">' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Turf Name *</label><input id="turfName" class="d2d-input" placeholder="e.g., North Hill Crescent" autofocus></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Description</label><input id="turfDesc" class="d2d-input" placeholder="Optional description..."></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Assign To</label><select id="turfAssign" class="d2d-select">' + teamOpts + '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Color</label><div class="d2d-color-grid" id="colorGrid">' + colorGrid + '</div></div>' +
        '<div class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i>' + polygon.length + ' points drawn</div>' +
      '</div>' +
      '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'d2dModal\').remove()" class="d2d-btn d2d-btn-outline">Cancel</button>' +
        '<button id="saveTurfBtn" class="d2d-btn d2d-btn-primary"><i class="fas fa-save mr-1"></i>Save Turf</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    // Color selection
    var selectedColor = COLORS[0];
    document.querySelectorAll('#colorGrid .d2d-color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        document.querySelectorAll('#colorGrid .d2d-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
        sw.classList.add('selected');
        selectedColor = sw.getAttribute('data-color');
      });
    });

    // Save
    document.getElementById('saveTurfBtn').addEventListener('click', function() {
      var name = document.getElementById('turfName').value.trim();
      if (!name) { toast('Please enter a turf name.', 'error'); return; }

      api('POST', '/turfs', {
        name: name,
        description: document.getElementById('turfDesc').value.trim(),
        polygon: polygon,
        center_lat: cLat,
        center_lng: cLng,
        color: selectedColor,
        assigned_to: document.getElementById('turfAssign').value || null
      }).then(function(r) {
        if (r.success) {
          toast('Turf "' + name + '" created!');
          overlay.remove();
          setActiveTool('pointer');
          loadAll();
        } else {
          toast(r.error || 'Failed to create turf', 'error');
        }
      });
    });
  }

  // ============================================================
  // PIN PLACEMENT
  // ============================================================
  function placePinAtLocation(latLng) {
    var lat = latLng.lat();
    var lng = latLng.lng();

    // Reverse geocode to get address
    if (geocoder) {
      geocoder.geocode({ location: latLng }, function(results, status) {
        var address = (status === 'OK' && results && results[0]) ? results[0].formatted_address : '';
        showPlacePinModal(lat, lng, address);
      });
    } else {
      showPlacePinModal(lat, lng, '');
    }
  }

  function showPlacePinModal(lat, lng, address) {
    // Find which turf this point is in
    var inTurf = null;
    for (var i = 0; i < turfs.length; i++) {
      try {
        var poly = JSON.parse(turfs[i].polygon_json || '[]');
        if (poly.length >= 3) {
          var gPoly = new google.maps.Polygon({ paths: poly });
          if (google.maps.geometry && google.maps.geometry.poly.containsLocation(new google.maps.LatLng(lat, lng), gPoly)) {
            inTurf = turfs[i];
            break;
          }
        }
      } catch(e) {}
    }

    var memberOpts = '<option value="">Not assigned</option>';
    for (var ti = 0; ti < team.length; ti++) {
      memberOpts += '<option value="' + team[ti].id + '">' + escH(team[ti].name) + '</option>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'd2dModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h3 class="font-bold text-gray-800"><i class="fas fa-map-pin mr-2 text-sky-500"></i>Place Door Pin</h3><button onclick="document.getElementById(\'d2dModal\').remove()" class="text-gray-400 hover:text-gray-600 text-lg">&times;</button></div>' +
      '<div class="p-6 space-y-4">' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Address</label><input id="pinAddress" class="d2d-input" value="' + escAttr(address) + '"></div>' +
        (inTurf ? '<div class="text-xs text-sky-600 bg-sky-50 rounded-lg p-2"><i class="fas fa-map mr-1"></i>Inside turf: <b>' + escH(inTurf.name) + '</b></div>' : '<div class="text-xs text-gray-400 bg-gray-50 rounded-lg p-2"><i class="fas fa-exclamation-triangle mr-1 text-amber-500"></i>Not inside any turf</div>') +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Initial Status</label>' +
          '<div class="grid grid-cols-2 gap-2" id="pinStatusGrid">' +
            '<div class="border rounded-lg p-2 cursor-pointer text-center text-xs font-semibold hover:border-gray-400 selected" data-status="not_knocked" style="border-color:#9ca3af"><i class="fas fa-circle mr-1" style="color:#9ca3af"></i>Not Knocked</div>' +
            '<div class="border rounded-lg p-2 cursor-pointer text-center text-xs font-semibold hover:border-green-400" data-status="yes"><i class="fas fa-check-circle mr-1" style="color:#22c55e"></i>Yes</div>' +
            '<div class="border rounded-lg p-2 cursor-pointer text-center text-xs font-semibold hover:border-red-400" data-status="no"><i class="fas fa-times-circle mr-1" style="color:#ef4444"></i>No</div>' +
            '<div class="border rounded-lg p-2 cursor-pointer text-center text-xs font-semibold hover:border-amber-400" data-status="no_answer"><i class="fas fa-question-circle mr-1" style="color:#f59e0b"></i>No Answer</div>' +
          '</div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Knocked By</label><select id="pinKnockedBy" class="d2d-select">' + memberOpts + '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Notes</label><textarea id="pinNotes" class="d2d-input" rows="2" placeholder="Optional notes..."></textarea></div>' +
      '</div>' +
      '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'d2dModal\').remove()" class="d2d-btn d2d-btn-outline">Cancel</button>' +
        '<button id="savePinBtn" class="d2d-btn d2d-btn-primary"><i class="fas fa-map-pin mr-1"></i>Save Pin</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    // Status selection
    var selectedStatus = 'not_knocked';
    document.querySelectorAll('#pinStatusGrid > div').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('#pinStatusGrid > div').forEach(function(d) { d.classList.remove('selected'); d.style.borderColor = ''; });
        el.classList.add('selected');
        selectedStatus = el.getAttribute('data-status');
        el.style.borderColor = PIN_COLORS[selectedStatus] || '#9ca3af';
      });
    });

    // Save
    document.getElementById('savePinBtn').addEventListener('click', function() {
      api('POST', '/pins', {
        lat: lat,
        lng: lng,
        address: document.getElementById('pinAddress').value.trim(),
        turf_id: inTurf ? inTurf.id : null,
        status: selectedStatus,
        notes: document.getElementById('pinNotes').value.trim(),
        knocked_by: document.getElementById('pinKnockedBy').value || null
      }).then(function(r) {
        if (r.success) {
          toast('Pin placed!');
          overlay.remove();
          loadAll();
        } else {
          toast(r.error || 'Failed to place pin', 'error');
        }
      });
    });
  }

  // ============================================================
  // TURF ACTIONS
  // ============================================================
  function selectTurf(id) {
    selectedTurfId = (selectedTurfId == id) ? null : id;
    renderTurfsPanel();

    // Zoom to turf
    if (selectedTurfId) {
      var turf = turfs.find(function(t) { return t.id == id; });
      if (turf) {
        try {
          var coords = JSON.parse(turf.polygon_json || '[]');
          var bounds = new google.maps.LatLngBounds();
          for (var i = 0; i < coords.length; i++) {
            bounds.extend(new google.maps.LatLng(coords[i].lat, coords[i].lng));
          }
          map.fitBounds(bounds, 80);
        } catch(e) {}
      }

      // Highlight
      for (var tid in turfPolygons) {
        turfPolygons[tid].setOptions({ fillOpacity: tid == id ? 0.25 : 0.08, strokeOpacity: tid == id ? 1 : 0.4 });
      }
    } else {
      for (var tid2 in turfPolygons) {
        turfPolygons[tid2].setOptions({ fillOpacity: 0.15, strokeOpacity: 0.9 });
      }
    }
  }

  function editTurf(id) {
    var turf = turfs.find(function(t) { return t.id == id; });
    if (!turf) return;

    var teamOpts = '<option value="">Unassigned</option>';
    for (var ti = 0; ti < team.length; ti++) {
      teamOpts += '<option value="' + team[ti].id + '"' + (turf.assigned_to == team[ti].id ? ' selected' : '') + '>' + escH(team[ti].name) + '</option>';
    }

    var colorGrid = '';
    for (var ci = 0; ci < COLORS.length; ci++) {
      colorGrid += '<div class="d2d-color-swatch' + (COLORS[ci] === turf.color ? ' selected' : '') + '" style="background:' + COLORS[ci] + '" data-color="' + COLORS[ci] + '"></div>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'd2dModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-gray-100"><h3 class="font-bold text-gray-800"><i class="fas fa-pen mr-2 text-sky-500"></i>Edit Turf</h3></div>' +
      '<div class="p-6 space-y-4">' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Name</label><input id="editTurfName" class="d2d-input" value="' + escAttr(turf.name) + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Description</label><input id="editTurfDesc" class="d2d-input" value="' + escAttr(turf.description || '') + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Assign To</label><select id="editTurfAssign" class="d2d-select">' + teamOpts + '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Color</label><div class="d2d-color-grid" id="editColorGrid">' + colorGrid + '</div></div>' +
      '</div>' +
      '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'d2dModal\').remove()" class="d2d-btn d2d-btn-outline">Cancel</button>' +
        '<button id="updateTurfBtn" class="d2d-btn d2d-btn-primary"><i class="fas fa-save mr-1"></i>Update</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var selectedColor = turf.color || COLORS[0];
    document.querySelectorAll('#editColorGrid .d2d-color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        document.querySelectorAll('#editColorGrid .d2d-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
        sw.classList.add('selected');
        selectedColor = sw.getAttribute('data-color');
      });
    });

    document.getElementById('updateTurfBtn').addEventListener('click', function() {
      api('PUT', '/turfs/' + id, {
        name: document.getElementById('editTurfName').value.trim(),
        description: document.getElementById('editTurfDesc').value.trim(),
        assigned_to: document.getElementById('editTurfAssign').value || null,
        color: selectedColor
      }).then(function(r) {
        if (r.success) {
          toast('Turf updated!');
          overlay.remove();
          loadAll();
        } else {
          toast(r.error || 'Failed to update', 'error');
        }
      });
    });
  }

  function deleteTurf(id) {
    if (!confirm('Delete this turf and all its pins?')) return;
    api('DELETE', '/turfs/' + id).then(function(r) {
      if (r.success) {
        toast('Turf deleted');
        infoWindow.close();
        loadAll();
      }
    });
  }

  // ============================================================
  // PIN ACTIONS
  // ============================================================
  function updatePinStatus(id, status) {
    api('PUT', '/pins/' + id, { status: status }).then(function(r) {
      if (r.success) {
        toast('Pin updated to ' + PIN_LABELS[status]);
        infoWindow.close();
        loadAll();
      }
    });
  }

  function assignPin(id, memberId) {
    api('PUT', '/pins/' + id, { knocked_by: memberId || null }).then(function(r) {
      if (r.success) {
        toast('Pin assigned');
        loadAll();
      }
    });
  }

  function addPinNotes(id) {
    var pin = pins.find(function(p) { return p.id == id; });
    var note = prompt('Enter notes for this pin:', pin ? (pin.notes || '') : '');
    if (note !== null) {
      api('PUT', '/pins/' + id, { notes: note }).then(function(r) {
        if (r.success) {
          toast('Notes saved');
          loadAll();
        }
      });
    }
  }

  function deletePin(id) {
    if (!confirm('Delete this pin?')) return;
    api('DELETE', '/pins/' + id).then(function(r) {
      if (r.success) {
        toast('Pin deleted');
        infoWindow.close();
        loadAll();
      }
    });
  }

  function focusPin(id) {
    var pin = pins.find(function(p) { return p.id == id; });
    if (pin && map) {
      map.panTo({ lat: pin.lat, lng: pin.lng });
      map.setZoom(18);
      if (pinMarkers[id]) {
        showPinInfo(pin, pinMarkers[id]);
      }
    }
  }

  function filterPins(status) {
    // Reload with filter
    var url = '/pins' + (status ? '?status=' + status : '');
    api('GET', url).then(function(r) {
      pins = r.pins || [];
      renderPinsPanel();
      // Show/hide markers
      for (var pid in pinMarkers) {
        var show = !status || pins.some(function(p) { return p.id == pid; });
        pinMarkers[pid].setMap(show ? map : null);
      }
    });
  }

  // ============================================================
  // TEAM MEMBER ACTIONS
  // ============================================================
  function addMember() {
    var colorGrid = '';
    for (var ci = 0; ci < COLORS.length; ci++) {
      colorGrid += '<div class="d2d-color-swatch' + (ci === 0 ? ' selected' : '') + '" style="background:' + COLORS[ci] + '" data-color="' + COLORS[ci] + '"></div>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'd2dModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-gray-100"><h3 class="font-bold text-gray-800"><i class="fas fa-user-plus mr-2 text-sky-500"></i>Add Team Member</h3></div>' +
      '<div class="p-6 space-y-4">' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Name *</label><input id="memberName" class="d2d-input" placeholder="Full name" autofocus></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Email</label><input id="memberEmail" class="d2d-input" type="email" placeholder="email@example.com"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Phone</label><input id="memberPhone" class="d2d-input" type="tel" placeholder="(555) 123-4567"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Role</label><select id="memberRole" class="d2d-select"><option value="salesperson">Salesperson</option><option value="manager">Manager</option></select></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Color</label><div class="d2d-color-grid" id="memberColorGrid">' + colorGrid + '</div></div>' +
      '</div>' +
      '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'d2dModal\').remove()" class="d2d-btn d2d-btn-outline">Cancel</button>' +
        '<button id="saveMemberBtn" class="d2d-btn d2d-btn-primary"><i class="fas fa-save mr-1"></i>Save</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var selectedColor = COLORS[0];
    document.querySelectorAll('#memberColorGrid .d2d-color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        document.querySelectorAll('#memberColorGrid .d2d-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
        sw.classList.add('selected');
        selectedColor = sw.getAttribute('data-color');
      });
    });

    document.getElementById('saveMemberBtn').addEventListener('click', function() {
      var name = document.getElementById('memberName').value.trim();
      if (!name) { toast('Name is required', 'error'); return; }

      api('POST', '/team', {
        name: name,
        email: document.getElementById('memberEmail').value.trim(),
        phone: document.getElementById('memberPhone').value.trim(),
        role: document.getElementById('memberRole').value,
        color: selectedColor
      }).then(function(r) {
        if (r.success) {
          toast('Team member added!');
          overlay.remove();
          loadAll();
        } else {
          toast(r.error || 'Failed to add member', 'error');
        }
      });
    });
  }

  function editMember(id) {
    var m = team.find(function(t) { return t.id == id; });
    if (!m) return;

    var colorGrid = '';
    for (var ci = 0; ci < COLORS.length; ci++) {
      colorGrid += '<div class="d2d-color-swatch' + (COLORS[ci] === m.color ? ' selected' : '') + '" style="background:' + COLORS[ci] + '" data-color="' + COLORS[ci] + '"></div>';
    }

    var overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    overlay.id = 'd2dModal';
    overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-gray-100"><h3 class="font-bold text-gray-800"><i class="fas fa-user-edit mr-2 text-sky-500"></i>Edit Team Member</h3></div>' +
      '<div class="p-6 space-y-4">' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Name</label><input id="editMemberName" class="d2d-input" value="' + escAttr(m.name) + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Email</label><input id="editMemberEmail" class="d2d-input" type="email" value="' + escAttr(m.email || '') + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Phone</label><input id="editMemberPhone" class="d2d-input" type="tel" value="' + escAttr(m.phone || '') + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Role</label><select id="editMemberRole" class="d2d-select"><option value="salesperson"' + (m.role !== 'manager' ? ' selected' : '') + '>Salesperson</option><option value="manager"' + (m.role === 'manager' ? ' selected' : '') + '>Manager</option></select></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 mb-1 block">Color</label><div class="d2d-color-grid" id="editMemberColorGrid">' + colorGrid + '</div></div>' +
      '</div>' +
      '<div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">' +
        '<button onclick="document.getElementById(\'d2dModal\').remove()" class="d2d-btn d2d-btn-outline">Cancel</button>' +
        '<button id="updateMemberBtn" class="d2d-btn d2d-btn-primary"><i class="fas fa-save mr-1"></i>Update</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var selectedColor = m.color || COLORS[0];
    document.querySelectorAll('#editMemberColorGrid .d2d-color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        document.querySelectorAll('#editMemberColorGrid .d2d-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
        sw.classList.add('selected');
        selectedColor = sw.getAttribute('data-color');
      });
    });

    document.getElementById('updateMemberBtn').addEventListener('click', function() {
      api('PUT', '/team/' + id, {
        name: document.getElementById('editMemberName').value.trim(),
        email: document.getElementById('editMemberEmail').value.trim(),
        phone: document.getElementById('editMemberPhone').value.trim(),
        role: document.getElementById('editMemberRole').value,
        color: selectedColor
      }).then(function(r) {
        if (r.success) {
          toast('Team member updated!');
          overlay.remove();
          loadAll();
        } else {
          toast(r.error || 'Failed to update', 'error');
        }
      });
    });
  }

  function deleteMember(id) {
    if (!confirm('Remove this team member?')) return;
    api('DELETE', '/team/' + id).then(function(r) {
      if (r.success) {
        toast('Team member removed');
        loadAll();
      }
    });
  }

  // ============================================================
  // UTILITIES
  // ============================================================
  function escH(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : ''; }

  // ============================================================
  // GLOBAL API
  // ============================================================
  window.d2d = {
    startDrawTurf: startDrawTurf,
    selectTurf: selectTurf,
    editTurf: editTurf,
    deleteTurf: deleteTurf,
    focusPin: focusPin,
    filterPins: filterPins,
    updatePinStatus: updatePinStatus,
    assignPin: assignPin,
    addPinNotes: addPinNotes,
    deletePin: deletePin,
    addMember: addMember,
    editMember: editMember,
    deleteMember: deleteMember
  };

  // ============================================================
  // INIT
  // ============================================================
  renderLayout();

  // Wait for Google Maps
  function waitForMaps() {
    if (typeof google !== 'undefined' && google.maps) {
      initMap();
    } else {
      setTimeout(waitForMaps, 300);
    }
  }
  waitForMaps();

})();
