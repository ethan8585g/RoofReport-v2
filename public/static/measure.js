// ============================================================
// RoofStack AI - Quick Measure Tool
// Standalone Vertex AI Engine — MapCanvas + Gemini Vision
// Ported from roofstack-ai-2 (React → vanilla JS)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('measure-root');
  if (!root) return;

  const DEFAULT_LAT = 53.5461;
  const DEFAULT_LNG = -113.4938;

  let state = {
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    address: '',
    map: null,
    marker: null,
    isAnalyzing: false,
    analysisResult: null,
    error: null
  };

  render();

  function render() {
    root.innerHTML = `
      <!-- Phase 1: Location Search -->
      <div class="mb-8">
        <div class="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-map-marker-alt text-blue-400"></i>
            Project Location
          </h2>
          <div class="relative">
            <input
              id="measure-search"
              type="text"
              class="w-full bg-gray-900 border border-gray-700 rounded-lg pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-lg"
              placeholder="Enter client address (e.g. 123 Main St, Edmonton)..."
              value="${state.address}"
            />
            <i class="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"></i>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <div class="text-xs text-gray-500 flex items-center gap-2">
              <i class="fas fa-brain text-purple-400"></i>
              <span>Powered by <strong>Google Places</strong> & <strong>Vertex AI (Gemini)</strong></span>
            </div>
            <div class="text-xs text-gray-500">
              <span class="text-gray-400">Lat:</span> <span class="text-white font-mono">${state.lat.toFixed(4)}</span>
              <span class="text-gray-400 ml-2">Lng:</span> <span class="text-white font-mono">${state.lng.toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Workspace -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8" style="min-height:600px">
        <!-- Map / Overlay Viewport -->
        <div class="lg:col-span-8 flex flex-col gap-4">
          <div class="flex-1 relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800" style="min-height:500px">
            ${state.analysisResult ? renderOverlay() : '<div id="measure-map" class="w-full h-full" style="min-height:500px"></div>'}

            <!-- Controls -->
            <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 z-10">
              ${state.analysisResult ? `
                <button onclick="resetView()" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all flex items-center gap-2">
                  <i class="fas fa-undo"></i> Reset View
                </button>
              ` : `
                <button onclick="captureAndAnalyze()" ${state.isAnalyzing ? 'disabled' : ''} 
                  class="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
                  ${state.isAnalyzing ? '<i class="fas fa-spinner fa-spin"></i> Processing...' : '<i class="fas fa-ruler"></i> Capture & Measure'}
                </button>
              `}
            </div>

            <!-- Top Label -->
            <div class="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded text-xs text-white border border-white/10 pointer-events-none">
              ${state.analysisResult ? 'AI Measurement Overlay • Gemini Vision' : 'Satellite View • Max Zoom'}
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-4 space-y-4">
          <div class="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col" style="min-height:500px">
            <h3 class="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <i class="fas fa-file-alt text-gray-400"></i>
              Project Details
            </h3>

            <div class="space-y-4 flex-1 overflow-y-auto">
              <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <label class="text-xs text-gray-500 uppercase">Address</label>
                <p class="text-white font-medium truncate">${state.address || 'No address selected'}</p>
              </div>

              ${state.error ? `
                <div class="bg-red-900/20 p-4 rounded-lg border border-red-700/50 flex items-start gap-2">
                  <i class="fas fa-exclamation-circle text-red-400 mt-0.5"></i>
                  <p class="text-sm text-red-200">${state.error}</p>
                </div>
              ` : ''}

              ${state.analysisResult ? renderMeasurementPanel() : `
                <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex-1 flex flex-col justify-center items-center text-center">
                  <i class="fas fa-brain text-4xl text-gray-700 mb-3"></i>
                  <p class="text-gray-500 text-sm">
                    Ready to analyze.<br/>
                    Position the roof and click "Capture & Measure".
                  </p>
                </div>
              `}

              <!-- System Log -->
              <div class="bg-gray-900/50 p-4 rounded-lg border border-gray-700 mt-auto">
                <label class="text-xs text-gray-500 uppercase mb-2 block">System Log</label>
                <div class="text-xs font-mono text-gray-400 space-y-1">
                  <p>> System initialized.</p>
                  ${state.isAnalyzing ? '<p class="text-blue-400 animate-pulse">> Fetching Static Map...</p>' : ''}
                  ${state.isAnalyzing ? '<p class="text-purple-400 animate-pulse">> Sending to Vertex AI...</p>' : ''}
                  ${state.analysisResult ? '<p class="text-green-400">> Analysis Complete.</p>' : ''}
                  ${state.error ? '<p class="text-red-400">> Error: ' + state.error + '</p>' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row (only when analysis complete) -->
      ${state.analysisResult ? `
        <div class="mt-8 grid lg:grid-cols-2 gap-4">
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700" style="height:300px">
            <h4 class="text-sm font-semibold text-gray-300 mb-3"><i class="fas fa-chart-bar text-blue-400 mr-1"></i>Facet Areas</h4>
            <canvas id="measure-area-chart" height="220"></canvas>
          </div>
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700" style="height:300px">
            <h4 class="text-sm font-semibold text-gray-300 mb-3"><i class="fas fa-compass text-purple-400 mr-1"></i>Orientation</h4>
            <canvas id="measure-orientation-chart" height="220"></canvas>
          </div>
        </div>
      ` : ''}
    `;

    // Initialize components after render
    if (!state.analysisResult) {
      initAutocomplete();
      initMap();
    }
    if (state.analysisResult) {
      setTimeout(renderCharts, 100);
    }
  }

  // ============================================================
  // Google Maps + Places Autocomplete
  // ============================================================
  function initAutocomplete() {
    const input = document.getElementById('measure-search');
    if (!input || !window.google) return;

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ['address'],
      fields: ['geometry', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        state.lat = place.geometry.location.lat();
        state.lng = place.geometry.location.lng();
        state.address = place.formatted_address || '';
        state.analysisResult = null;
        state.error = null;
        render();
      }
    });
  }

  // Make initMeasureMap globally accessible for the Google Maps callback
  window.initMeasureMap = function() {
    if (!state.analysisResult) initMap();
  };

  function initMap() {
    const mapDiv = document.getElementById('measure-map');
    if (!mapDiv || !window.google) return;

    const center = { lat: state.lat, lng: state.lng };
    const map = new google.maps.Map(mapDiv, {
      center,
      zoom: 20,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      scaleControl: true,
    });

    const marker = new google.maps.Marker({
      position: center,
      map,
      draggable: true,
      icon: {
        url: 'https://fonts.gstatic.com/s/i/googlematerialicons/location_pin/v5/24px.svg',
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 40)
      }
    });

    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      if (pos) {
        state.lat = pos.lat();
        state.lng = pos.lng();
        // Update coordinate display without full re-render
        render();
      }
    });

    map.addListener('click', (e) => {
      if (e.latLng) {
        state.lat = e.latLng.lat();
        state.lng = e.latLng.lng();
        marker.setPosition(e.latLng);
        render();
      }
    });

    state.map = map;
    state.marker = marker;
  }

  // ============================================================
  // Capture & Analyze
  // ============================================================
  window.captureAndAnalyze = async function() {
    state.isAnalyzing = true;
    state.error = null;
    render();

    try {
      const response = await fetch('/api/ai/measure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: state.lat, lng: state.lng })
      });

      const data = await response.json();

      if (data.status === 'success' && data.analysis) {
        state.analysisResult = data.analysis;
        state.satelliteUrl = data.meta?.satellite_url;
        state.isAnalyzing = false;
        render();
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      state.isAnalyzing = false;
      state.error = err.message || 'Backend connection failed';
      render();
    }
  };

  window.resetView = function() {
    state.analysisResult = null;
    state.error = null;
    render();
  };

  // ============================================================
  // Satellite Overlay with SVG
  // ============================================================
  function renderOverlay() {
    const a = state.analysisResult;
    const imgUrl = state.satelliteUrl ||
      `https://maps.googleapis.com/maps/api/staticmap?center=${state.lat},${state.lng}&zoom=20&size=640x640&maptype=satellite`;

    const facetsSvg = (a.facets || []).map((f, idx) => {
      const pts = (f.points || []).map(p => p.x + ',' + p.y).join(' ');
      const cx = f.points?.length ? Math.round(f.points.reduce((acc, p) => acc + p.x, 0) / f.points.length) : 0;
      const cy = f.points?.length ? Math.round(f.points.reduce((acc, p) => acc + p.y, 0) / f.points.length) : 0;
      return `<g>
        <polygon points="${pts}" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.8)" stroke-width="2"/>
        <text x="${cx}" y="${cy}" fill="white" font-size="22" text-anchor="middle" font-weight="bold" style="text-shadow:0 1px 3px rgba(0,0,0,0.8)">${f.pitch || ''}</text>
      </g>`;
    }).join('');

    const linesSvg = (a.lines || []).map(line => {
      const colors = { RIDGE: '#F59E0B', HIP: '#F97316', VALLEY: '#3B82F6', EAVE: '#10B981', RAKE: '#EF4444' };
      const c = colors[line.type] || '#EF4444';
      return `<line x1="${line.start.x}" y1="${line.start.y}" x2="${line.end.x}" y2="${line.end.y}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
    }).join('');

    const obsSvg = (a.obstructions || []).map(obs => {
      const b = obs.boundingBox;
      return `<rect x="${b.min.x}" y="${b.min.y}" width="${b.max.x - b.min.x}" height="${b.max.y - b.min.y}" fill="rgba(239,68,68,0.25)" stroke="#EF4444" stroke-width="2" stroke-dasharray="5,3"/>`;
    }).join('');

    return `
      <div class="relative w-full h-full">
        <img src="${imgUrl}" alt="Satellite" class="w-full h-full object-cover" />
        <svg viewBox="0 0 1000 1000" class="absolute inset-0 w-full h-full" preserveAspectRatio="none" style="pointer-events:none">
          ${facetsSvg}
          ${linesSvg}
          ${obsSvg}
        </svg>
      </div>

      <!-- Legend -->
      <div class="absolute bottom-16 right-4 bg-gray-900/90 backdrop-blur border border-gray-700 p-3 rounded-lg z-20 text-xs space-y-2 shadow-xl">
        <div class="font-semibold text-gray-300 mb-1 border-b border-gray-700 pb-1">Legend</div>
        <div class="flex items-center gap-2"><div class="w-4 h-0.5 bg-amber-500 rounded"></div><span class="text-gray-400">Ridge</span></div>
        <div class="flex items-center gap-2"><div class="w-4 h-0.5 bg-blue-500 rounded"></div><span class="text-gray-400">Valley</span></div>
        <div class="flex items-center gap-2"><div class="w-4 h-0.5 bg-green-500 rounded"></div><span class="text-gray-400">Eave</span></div>
        <div class="flex items-center gap-2"><div class="w-4 h-0.5 bg-orange-500 rounded"></div><span class="text-gray-400">Hip</span></div>
        <div class="flex items-center gap-2"><div class="w-4 h-0.5 bg-red-500 rounded"></div><span class="text-gray-400">Rake</span></div>
        <div class="flex items-center gap-2"><div class="w-3 h-3 border border-red-500 bg-red-500/20 rounded-sm" style="border-style:dashed"></div><span class="text-gray-400">Obstruction</span></div>
      </div>

      <!-- Stats Bar -->
      <div class="absolute top-4 right-4 flex gap-2 z-20">
        <div class="bg-gray-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-700 text-xs">
          <span class="text-gray-400">Facets:</span> <span class="text-white font-bold">${(a.facets || []).length}</span>
        </div>
        <div class="bg-gray-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-700 text-xs">
          <span class="text-gray-400">Lines:</span> <span class="text-white font-bold">${(a.lines || []).length}</span>
        </div>
        <div class="bg-gray-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-700 text-xs">
          <span class="text-gray-400">Obstructions:</span> <span class="text-white font-bold">${(a.obstructions || []).length}</span>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Measurement Panel (sidebar)
  // ============================================================
  function renderMeasurementPanel() {
    const a = state.analysisResult;
    if (!a || !a.facets || a.facets.length === 0) {
      return '<div class="bg-gray-900/50 p-4 rounded-lg text-center text-gray-500 text-sm">No facet data</div>';
    }

    // Default ground area estimate (~150 sqm for typical residential)
    const realGroundArea = 150;
    const totalNormArea = a.facets.reduce((acc, f) => acc + calcPolygonArea(f.points || []), 0);
    const scaleFactor = Math.sqrt(realGroundArea) / Math.sqrt(totalNormArea || 1);

    let totalSqFt = 0;
    const facets = a.facets.map((f, idx) => {
      const rawArea = calcPolygonArea(f.points || []);
      const projAreaM2 = rawArea * scaleFactor * scaleFactor;
      const pitchDeg = parsePitch(f.pitch);
      const pitchMult = 1 / Math.cos((pitchDeg * Math.PI) / 180);
      const trueAreaM2 = projAreaM2 * pitchMult;
      const sqft = trueAreaM2 * 10.7639;
      totalSqFt += sqft;
      return { ...f, sqft, pitchDeg, idx };
    });

    // Lines
    let lineSummary = {};
    (a.lines || []).forEach(line => {
      const rawLen = calcDistance(line.start, line.end);
      const projLen = rawLen * scaleFactor;
      const isSloped = ['HIP', 'VALLEY', 'RAKE'].includes(line.type);
      const trueLenFt = projLen * (isSloped ? 1.15 : 1.0) * 3.28084;
      if (!lineSummary[line.type]) lineSummary[line.type] = { count: 0, totalFt: 0 };
      lineSummary[line.type].count++;
      lineSummary[line.type].totalFt += trueLenFt;
    });

    return `
      <div class="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
        <div class="p-3 border-b border-gray-700 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <i class="fas fa-calculator text-green-400 text-sm"></i>
            <span class="font-semibold text-gray-200 text-sm">Measurements</span>
          </div>
          <span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded font-bold">
            ${Math.round(totalSqFt).toLocaleString()} sq ft
          </span>
        </div>

        <!-- Lines -->
        <div class="p-3 border-b border-gray-700/50">
          <h5 class="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            <i class="fas fa-ruler text-xs mr-1"></i>Linear
          </h5>
          <div class="space-y-1">
            ${Object.entries(lineSummary).map(([type, s]) => {
              const dot = type === 'RIDGE' ? 'bg-amber-500' : type === 'VALLEY' ? 'bg-blue-500' : type === 'EAVE' ? 'bg-green-500' : type === 'HIP' ? 'bg-orange-500' : 'bg-red-500';
              return `<div class="flex justify-between items-center px-2 py-1 bg-gray-700/30 rounded text-xs">
                <div class="flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full ${dot}"></div><span class="text-gray-300 capitalize">${type.toLowerCase()}s</span><span class="text-[10px] text-gray-500">(${s.count})</span></div>
                <span class="font-mono text-white">${Math.round(s.totalFt)} ft</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Facets -->
        <div class="p-3">
          <h5 class="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            <i class="fas fa-th text-xs mr-1"></i>Facets
          </h5>
          <div class="max-h-32 overflow-y-auto">
            <table class="w-full text-xs text-left">
              <thead class="text-[10px] text-gray-500 uppercase sticky top-0 bg-gray-800">
                <tr><th class="px-1 py-1">ID</th><th class="px-1 py-1">Pitch</th><th class="px-1 py-1 text-right">Area</th></tr>
              </thead>
              <tbody class="divide-y divide-gray-700/30">
                ${facets.map(f => `<tr class="hover:bg-gray-700/20">
                  <td class="px-1 py-1 text-gray-400 font-mono">#${f.idx + 1}</td>
                  <td class="px-1 py-1 text-gray-300">${f.pitch || Math.round(f.pitchDeg) + '°'}</td>
                  <td class="px-1 py-1 text-right text-white font-mono">${Math.round(f.sqft)} ft²</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Charts
  // ============================================================
  function renderCharts() {
    const a = state.analysisResult;
    if (!a || typeof Chart === 'undefined') return;

    // Area chart
    const areaCanvas = document.getElementById('measure-area-chart');
    if (areaCanvas && a.facets?.length) {
      new Chart(areaCanvas, {
        type: 'bar',
        data: {
          labels: a.facets.map((f, i) => f.id || 'F' + (i + 1)),
          datasets: [{
            label: 'Facet Area (norm)',
            data: a.facets.map(f => Math.round(calcPolygonArea(f.points || []))),
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

    // Orientation chart
    const oriCanvas = document.getElementById('measure-orientation-chart');
    if (oriCanvas && a.facets?.length) {
      const dirs = [
        { name: 'North', min: 316, max: 45 },
        { name: 'East', min: 46, max: 135 },
        { name: 'South', min: 136, max: 225 },
        { name: 'West', min: 226, max: 315 }
      ];

      const counts = dirs.map(d => {
        return {
          name: d.name,
          value: a.facets.filter(f => {
            const az = parseFloat(f.azimuth) || 0;
            if (d.name === 'North') return az > 315 || az <= 45;
            return az > d.min && az <= d.max;
          }).length
        };
      }).filter(d => d.value > 0);

      const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

      new Chart(oriCanvas, {
        type: 'doughnut',
        data: {
          labels: counts.map(d => d.name),
          datasets: [{
            data: counts.map(d => d.value),
            backgroundColor: colors.slice(0, counts.length),
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
  // Geometry Utilities
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
    if (pitchStr.includes('/')) {
      const parts = pitchStr.split('/').map(Number);
      if (!isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
        return (Math.atan(parts[0] / parts[1]) * 180) / Math.PI;
      }
    }
    const deg = parseFloat(pitchStr);
    return isNaN(deg) ? 0 : deg;
  }
});
