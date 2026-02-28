// ============================================================
// Property Imagery — Dev-Only Tool
// Enter an address → get 4 satellite images → download 1-page PDF
// ============================================================

function piGetToken() { return localStorage.getItem('rc_customer_token') || ''; }
function piAuthHeaders() { return { 'Authorization': 'Bearer ' + piGetToken(), 'Content-Type': 'application/json' }; }

var piState = { loading: false, images: null, address: '', coordinates: null, error: '' };

document.addEventListener('DOMContentLoaded', function() {
  renderPropertyImagery();
  // Init Google Places autocomplete if available
  waitForGoogleMaps();
});

function waitForGoogleMaps() {
  if (typeof google !== 'undefined' && google.maps && google.maps.places) {
    initAutocomplete();
  } else {
    setTimeout(waitForGoogleMaps, 300);
  }
}

function initAutocomplete() {
  var input = document.getElementById('pi-address');
  if (!input) return;
  try {
    var autocomplete = new google.maps.places.Autocomplete(input, {
      types: ['address'],
      componentRestrictions: { country: 'ca' }
    });
    autocomplete.addListener('place_changed', function() {
      var place = autocomplete.getPlace();
      if (!place.address_components) return;
      // Parse address components
      var streetNum = '', streetName = '', city = '', prov = '', postal = '';
      place.address_components.forEach(function(comp) {
        if (comp.types.includes('street_number')) streetNum = comp.long_name;
        if (comp.types.includes('route')) streetName = comp.long_name;
        if (comp.types.includes('locality')) city = comp.long_name;
        if (comp.types.includes('administrative_area_level_1')) prov = comp.short_name;
        if (comp.types.includes('postal_code')) postal = comp.long_name;
      });
      document.getElementById('pi-address').value = (streetNum + ' ' + streetName).trim();
      document.getElementById('pi-city').value = city;
      document.getElementById('pi-province').value = prov;
      document.getElementById('pi-postal').value = postal;
    });
  } catch(e) {
    console.warn('[PropertyImagery] Autocomplete init failed:', e);
  }
}

function renderPropertyImagery() {
  var root = document.getElementById('pi-root');
  if (!root) return;

  root.innerHTML =
    // Header section
    '<div class="mb-8">' +
      '<div class="flex items-center gap-3 mb-2">' +
        '<div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">' +
          '<i class="fas fa-satellite text-white text-xl"></i>' +
        '</div>' +
        '<div>' +
          '<h2 class="text-2xl font-black text-gray-900">Property Imagery</h2>' +
          '<p class="text-sm text-gray-500">Generate satellite imagery PDF — 4 zoom views per property</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">' +
        '<p class="text-xs text-amber-700"><i class="fas fa-lock mr-1"></i><strong>Dev-Only Tool</strong> — This feature is exclusively available for the RoofReporterAI development account. Images show structures, equipment, sheds, shops, and property layout.</p>' +
      '</div>' +
    '</div>' +

    // Address Input Form
    '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">' +
      '<h3 class="font-bold text-gray-800 mb-4"><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>Enter Property Address</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        '<div class="md:col-span-2">' +
          '<label class="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>' +
          '<input type="text" id="pi-address" placeholder="123 Main Street" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">' +
        '</div>' +
        '<div>' +
          '<label class="block text-sm font-medium text-gray-700 mb-1">City</label>' +
          '<input type="text" id="pi-city" placeholder="Edmonton" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div>' +
            '<label class="block text-sm font-medium text-gray-700 mb-1">Province</label>' +
            '<input type="text" id="pi-province" placeholder="AB" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>' +
            '<input type="text" id="pi-postal" placeholder="T5A 0A1" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="pi-error" class="hidden mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"></div>' +
      '<button onclick="generateImagery()" id="pi-generate-btn" class="mt-5 w-full md:w-auto px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-emerald-500/25">' +
        '<i class="fas fa-satellite-dish mr-2"></i>Generate Property Imagery' +
      '</button>' +
    '</div>' +

    // Results area
    '<div id="pi-results"></div>';
}

async function generateImagery() {
  var address = document.getElementById('pi-address').value.trim();
  var city = document.getElementById('pi-city').value.trim();
  var province = document.getElementById('pi-province').value.trim();
  var postal = document.getElementById('pi-postal').value.trim();
  var errDiv = document.getElementById('pi-error');
  var resultsDiv = document.getElementById('pi-results');
  var btn = document.getElementById('pi-generate-btn');

  errDiv.classList.add('hidden');

  if (!address) {
    errDiv.textContent = 'Please enter a street address.';
    errDiv.classList.remove('hidden');
    return;
  }

  // Loading state
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating imagery...';
  resultsDiv.innerHTML =
    '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">' +
      '<div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-emerald-500 mx-auto mb-4"></div>' +
      '<p class="text-gray-600 font-medium">Fetching satellite imagery for this property...</p>' +
      '<p class="text-xs text-gray-400 mt-2">Geocoding address → Downloading 4 zoom levels → Preparing results</p>' +
    '</div>';

  try {
    var res = await fetch('/api/property-imagery/generate', {
      method: 'POST',
      headers: piAuthHeaders(),
      body: JSON.stringify({ address: address, city: city, province: province, postal_code: postal })
    });
    var data = await res.json();

    if (!res.ok || !data.success) {
      errDiv.textContent = data.error || 'Failed to generate imagery.';
      errDiv.classList.remove('hidden');
      resultsDiv.innerHTML = '';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-satellite-dish mr-2"></i>Generate Property Imagery';
      return;
    }

    piState.images = data.images;
    piState.address = data.address;
    piState.coordinates = data.coordinates;

    renderResults(data);
  } catch(e) {
    errDiv.textContent = 'Network error: ' + e.message;
    errDiv.classList.remove('hidden');
    resultsDiv.innerHTML = '';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-satellite-dish mr-2"></i>Generate Property Imagery';
}

function renderResults(data) {
  var resultsDiv = document.getElementById('pi-results');
  if (!resultsDiv) return;

  var html =
    // Metadata bar
    '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">' +
      '<div>' +
        '<h3 class="font-bold text-gray-900"><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>' + escHtml(data.address) + '</h3>' +
        '<p class="text-xs text-gray-500 mt-1"><i class="fas fa-crosshairs mr-1"></i>Lat: ' + data.coordinates.lat.toFixed(6) + ' &middot; Lng: ' + data.coordinates.lng.toFixed(6) + ' &middot; Generated: ' + new Date(data.generated_at).toLocaleString() + '</p>' +
      '</div>' +
      '<button onclick="downloadPDF()" class="flex-shrink-0 px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-red-500/25">' +
        '<i class="fas fa-file-pdf mr-2"></i>Download PDF' +
      '</button>' +
    '</div>' +

    // Image Grid (2x2)
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">';

  for (var i = 0; i < data.images.length; i++) {
    var img = data.images[i];
    html +=
      '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">' +
        '<div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">' +
          '<div>' +
            '<h4 class="font-bold text-gray-800 text-sm">' + escHtml(img.label) + '</h4>' +
            '<p class="text-xs text-gray-500">' + escHtml(img.desc) + '</p>' +
          '</div>' +
          '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">ZOOM ' + img.zoom + '</span>' +
        '</div>' +
        '<img src="' + img.data_url + '" alt="' + escHtml(img.label) + '" class="w-full aspect-square object-cover" loading="lazy">' +
      '</div>';
  }

  html += '</div>';

  resultsDiv.innerHTML = html;
}

// ============================================================
// PDF GENERATION — Using jsPDF (loaded from CDN)
// Creates a clean 1-page PDF with 4 satellite images
// ============================================================
async function downloadPDF() {
  if (!piState.images || piState.images.length === 0) {
    alert('No images to export. Generate imagery first.');
    return;
  }

  // Dynamically load jsPDF if not loaded
  if (typeof window.jspdf === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js');
  }

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  var pageW = doc.internal.pageSize.getWidth();   // 215.9mm
  var pageH = doc.internal.pageSize.getHeight();  // 279.4mm
  var margin = 12;
  var contentW = pageW - margin * 2;

  // ── Header ──
  doc.setFillColor(30, 58, 95);  // brand-800
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Property Imagery Report', margin, 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(piState.address, margin, 18);
  doc.text('Lat: ' + piState.coordinates.lat.toFixed(6) + '  |  Lng: ' + piState.coordinates.lng.toFixed(6) + '  |  ' + new Date().toLocaleDateString('en-CA'), margin, 23);

  // RoofReporterAI branding on right
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('REUSE CANADA', pageW - margin, 12, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Satellite Property Analysis', pageW - margin, 17, { align: 'right' });

  // ── Image Grid (2x2) ──
  var gridTop = 32;
  var gap = 4;
  var labelH = 8;
  var imgW = (contentW - gap) / 2;
  // Calculate available height for 2 rows of images + labels + footer
  var footerH = 12;
  var availH = pageH - gridTop - footerH - margin;
  var rowH = (availH - gap) / 2;
  var imgH = rowH - labelH;

  var positions = [
    { x: margin,              y: gridTop },
    { x: margin + imgW + gap, y: gridTop },
    { x: margin,              y: gridTop + rowH + gap },
    { x: margin + imgW + gap, y: gridTop + rowH + gap }
  ];

  for (var i = 0; i < Math.min(piState.images.length, 4); i++) {
    var img = piState.images[i];
    var pos = positions[i];

    // Label background
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(pos.x, pos.y, imgW, labelH, 1.5, 1.5, 'F');

    // Label text
    doc.setTextColor(30, 58, 95);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(img.label, pos.x + 2, pos.y + 3.8);

    doc.setTextColor(120, 120, 120);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(img.desc, pos.x + 2, pos.y + 6.8);

    // Image
    try {
      doc.addImage(img.data_url, 'PNG', pos.x, pos.y + labelH, imgW, imgH);
    } catch(e) {
      // If image fails, draw placeholder
      doc.setFillColor(230, 230, 230);
      doc.rect(pos.x, pos.y + labelH, imgW, imgH, 'F');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(10);
      doc.text('Image unavailable', pos.x + imgW / 2, pos.y + labelH + imgH / 2, { align: 'center' });
    }

    // Border around image
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(pos.x, pos.y + labelH, imgW, imgH);
  }

  // ── Footer ──
  var footerY = pageH - margin - 4;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY - 3, pageW - margin, footerY - 3);

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Property Imagery Report — Generated by RoofReporterAI  |  reusecanada.ca  |  For development & assessment use only', margin, footerY);
  doc.text('Google Maps Satellite Imagery  |  ' + new Date().toISOString().slice(0, 10), pageW - margin, footerY, { align: 'right' });

  // ── Save ──
  var safeName = piState.address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  doc.save('Property_Imagery_' + safeName + '.pdf');
}

function loadScript(src) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
