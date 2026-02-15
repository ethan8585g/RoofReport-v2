// ============================================================
// Custom Branding Setup — Company branding for reports & proposals
// Upload logo, set business name, colors, ad connections
// Auto-saves all changes
// ============================================================

var brandState = { loading: true, saving: false, branding: {}, ads: {}, saveTimer: null };

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async function() {
  await loadBranding();
  renderBranding();
});

async function loadBranding() {
  brandState.loading = true;
  try {
    var res = await fetch('/api/customer/branding', { headers: authHeaders() });
    if (res.ok) {
      var data = await res.json();
      brandState.branding = data.branding || {};
      brandState.ads = data.ads || {};
    } else if (res.status === 401) {
      window.location.href = '/customer/login';
      return;
    }
  } catch(e) { console.error('Load branding error:', e); }
  brandState.loading = false;
}

// Auto-save with 1-second debounce
function autoSaveBranding() {
  if (brandState.saveTimer) clearTimeout(brandState.saveTimer);
  brandState.saveTimer = setTimeout(async function() {
    var b = brandState.branding;
    brandState.saving = true;
    updateSaveIndicator('saving');
    try {
      var res = await fetch('/api/customer/branding', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          business_name: b.business_name,
          logo_url: b.logo_url,
          primary_color: b.primary_color,
          secondary_color: b.secondary_color,
          tagline: b.tagline,
          phone: b.phone,
          email: b.email,
          website: b.website,
          address: b.address,
          license_number: b.license_number,
          insurance_info: b.insurance_info
        })
      });
      if (res.ok) {
        updateSaveIndicator('saved');
      } else {
        updateSaveIndicator('error');
      }
    } catch(e) {
      updateSaveIndicator('error');
    }
    brandState.saving = false;
  }, 1000);
}

function autoSaveAds() {
  if (brandState.saveTimer) clearTimeout(brandState.saveTimer);
  brandState.saveTimer = setTimeout(async function() {
    brandState.saving = true;
    updateSaveIndicator('saving');
    try {
      var res = await fetch('/api/customer/branding/ads', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(brandState.ads)
      });
      if (res.ok) {
        updateSaveIndicator('saved');
      } else {
        updateSaveIndicator('error');
      }
    } catch(e) {
      updateSaveIndicator('error');
    }
    brandState.saving = false;
  }, 1000);
}

function updateSaveIndicator(status) {
  var el = document.getElementById('save-indicator');
  if (!el) return;
  if (status === 'saving') {
    el.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
    el.className = 'text-xs text-blue-500 font-medium';
  } else if (status === 'saved') {
    el.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Auto-saved';
    el.className = 'text-xs text-green-500 font-medium';
    setTimeout(function() { if (el) el.innerHTML = ''; }, 3000);
  } else if (status === 'error') {
    el.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Save failed';
    el.className = 'text-xs text-red-500 font-medium';
  }
}

function updateField(field, value) {
  brandState.branding[field] = value;
  autoSaveBranding();
}

function updateAdField(field, value) {
  brandState.ads[field] = value;
  autoSaveAds();
}

// Logo upload handler
function handleLogoUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 500000) {
    alert('Logo file too large. Maximum 500KB. Please use a smaller or compressed image.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file (PNG, JPG, SVG).');
    return;
  }
  var reader = new FileReader();
  reader.onload = async function(e) {
    var dataUri = e.target.result;
    brandState.branding.logo_url = dataUri;
    updateSaveIndicator('saving');
    try {
      var res = await fetch('/api/customer/branding/logo', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ logo_data: dataUri })
      });
      if (res.ok) {
        updateSaveIndicator('saved');
        renderBranding(); // Re-render to show preview
      } else {
        var err = await res.json();
        alert(err.error || 'Upload failed');
        updateSaveIndicator('error');
      }
    } catch(ex) {
      updateSaveIndicator('error');
    }
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  brandState.branding.logo_url = '';
  autoSaveBranding();
  renderBranding();
}

// ============================================================
// RENDER
// ============================================================
function renderBranding() {
  var root = document.getElementById('branding-root');
  if (!root) return;

  if (brandState.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div><span class="ml-4 text-gray-500">Loading branding settings...</span></div>';
    return;
  }

  var b = brandState.branding;
  var a = brandState.ads;

  root.innerHTML =
    // Header
    '<div class="flex items-center justify-between mb-6">' +
      '<div>' +
        '<h2 class="text-2xl font-black text-gray-900"><i class="fas fa-palette mr-2 text-pink-500"></i>Custom Branding Setup</h2>' +
        '<p class="text-sm text-gray-500 mt-1">Brand your roof measurement reports, sales proposals, and invoices with your company identity</p>' +
      '</div>' +
      '<div id="save-indicator"></div>' +
    '</div>' +

    // Live Preview Card
    '<div class="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 mb-6 shadow-xl">' +
      '<h3 class="text-white font-bold text-sm mb-4"><i class="fas fa-eye mr-2 text-pink-400"></i>Live Report Preview</h3>' +
      '<div class="bg-white rounded-xl p-5 flex items-center gap-5">' +
        (b.logo_url ?
          '<img src="' + b.logo_url + '" class="w-20 h-20 object-contain rounded-lg border border-gray-200 shadow-sm" alt="Logo">' :
          '<div class="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300"><i class="fas fa-image text-gray-400 text-2xl"></i></div>'
        ) +
        '<div class="flex-1">' +
          '<h4 class="text-xl font-black" style="color:' + (b.primary_color || '#1e3a5f') + '">' + (b.business_name || 'Your Company Name') + '</h4>' +
          (b.tagline ? '<p class="text-sm text-gray-500 mt-0.5">' + b.tagline + '</p>' : '') +
          '<div class="flex items-center gap-4 mt-2 text-xs text-gray-500">' +
            (b.phone ? '<span><i class="fas fa-phone mr-1" style="color:' + (b.secondary_color || '#0ea5e9') + '"></i>' + b.phone + '</span>' : '') +
            (b.email ? '<span><i class="fas fa-envelope mr-1" style="color:' + (b.secondary_color || '#0ea5e9') + '"></i>' + b.email + '</span>' : '') +
            (b.website ? '<span><i class="fas fa-globe mr-1" style="color:' + (b.secondary_color || '#0ea5e9') + '"></i>' + b.website + '</span>' : '') +
          '</div>' +
          (b.license_number ? '<p class="text-[10px] text-gray-400 mt-1">License: ' + b.license_number + '</p>' : '') +
        '</div>' +
        '<div class="w-2 h-16 rounded-full" style="background:linear-gradient(180deg, ' + (b.primary_color || '#1e3a5f') + ', ' + (b.secondary_color || '#0ea5e9') + ')"></div>' +
      '</div>' +
    '</div>' +

    '<div class="grid lg:grid-cols-2 gap-6">' +

    // ── Left Column: Company Identity ──
    '<div class="space-y-6">' +

      // Logo Upload
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-4"><i class="fas fa-image text-pink-500 mr-2"></i>Company Logo</h3>' +
        '<p class="text-xs text-gray-500 mb-4">Upload your company logo for branded reports, proposals, and invoices. Max 500KB. PNG, JPG, or SVG.</p>' +
        '<div class="flex items-center gap-4">' +
          (b.logo_url ?
            '<div class="relative">' +
              '<img src="' + b.logo_url + '" class="w-24 h-24 object-contain rounded-xl border border-gray-200 shadow-sm bg-gray-50" alt="Logo">' +
              '<button onclick="removeLogo()" class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 shadow"><i class="fas fa-times"></i></button>' +
            '</div>' :
            '<div class="w-24 h-24 bg-gray-50 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300">' +
              '<i class="fas fa-cloud-upload-alt text-gray-400 text-xl mb-1"></i>' +
              '<span class="text-[10px] text-gray-400">No logo</span>' +
            '</div>'
          ) +
          '<div class="flex-1">' +
            '<label class="block">' +
              '<span class="inline-block px-4 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 font-semibold text-sm rounded-xl cursor-pointer transition-colors border border-pink-200"><i class="fas fa-upload mr-2"></i>Upload Logo</span>' +
              '<input type="file" accept="image/*" onchange="handleLogoUpload(this)" class="hidden">' +
            '</label>' +
            '<p class="text-[10px] text-gray-400 mt-2">Appears on all generated reports & proposals</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Business Identity
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-4"><i class="fas fa-building text-pink-500 mr-2"></i>Business Identity</h3>' +
        '<div class="space-y-3">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Business Name *</label>' +
            '<input type="text" value="' + esc(b.business_name) + '" oninput="updateField(\'business_name\', this.value)" placeholder="Acme Roofing Ltd." class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Tagline / Slogan</label>' +
            '<input type="text" value="' + esc(b.tagline) + '" oninput="updateField(\'tagline\', this.value)" placeholder="Your trusted local roofing experts since 2005" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">Phone</label>' +
              '<input type="tel" value="' + esc(b.phone) + '" oninput="updateField(\'phone\', this.value)" placeholder="(780) 555-1234" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">Email</label>' +
              '<input type="email" value="' + esc(b.email) + '" oninput="updateField(\'email\', this.value)" placeholder="info@acmeroofing.ca" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">Website</label>' +
              '<input type="url" value="' + esc(b.website) + '" oninput="updateField(\'website\', this.value)" placeholder="https://acmeroofing.ca" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">Business Address</label>' +
              '<input type="text" value="' + esc(b.address) + '" oninput="updateField(\'address\', this.value)" placeholder="123 Main St, Edmonton, AB" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">License / COR Number</label>' +
              '<input type="text" value="' + esc(b.license_number) + '" oninput="updateField(\'license_number\', this.value)" placeholder="AB-12345" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-medium text-gray-600 mb-1">Insurance Info</label>' +
              '<input type="text" value="' + esc(b.insurance_info) + '" oninput="updateField(\'insurance_info\', this.value)" placeholder="$2M general liability" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500">' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Brand Colors
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-4"><i class="fas fa-swatchbook text-pink-500 mr-2"></i>Brand Colors</h3>' +
        '<p class="text-xs text-gray-500 mb-4">Customize colors used in your reports and proposals.</p>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Primary Color</label>' +
            '<div class="flex items-center gap-2">' +
              '<input type="color" value="' + (b.primary_color || '#1e3a5f') + '" oninput="updateField(\'primary_color\', this.value); renderBranding();" class="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer">' +
              '<input type="text" value="' + (b.primary_color || '#1e3a5f') + '" oninput="updateField(\'primary_color\', this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono">' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Accent Color</label>' +
            '<div class="flex items-center gap-2">' +
              '<input type="color" value="' + (b.secondary_color || '#0ea5e9') + '" oninput="updateField(\'secondary_color\', this.value); renderBranding();" class="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer">' +
              '<input type="text" value="' + (b.secondary_color || '#0ea5e9') + '" oninput="updateField(\'secondary_color\', this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono">' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>' +

    // ── Right Column: Ads & Marketing ──
    '<div class="space-y-6">' +

      // Branding applies to
      '<div class="bg-gradient-to-br from-pink-50 to-fuchsia-50 rounded-xl border border-pink-200 p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-3"><i class="fas fa-check-double text-pink-500 mr-2"></i>Your Branding Applies To</h3>' +
        '<div class="space-y-2">' +
          '<div class="flex items-center gap-3 p-2.5 bg-white rounded-lg"><i class="fas fa-file-alt text-blue-500 w-5 text-center"></i><span class="text-sm text-gray-700">Roof Measurement Reports</span><i class="fas fa-check-circle text-green-500 ml-auto"></i></div>' +
          '<div class="flex items-center gap-3 p-2.5 bg-white rounded-lg"><i class="fas fa-file-signature text-purple-500 w-5 text-center"></i><span class="text-sm text-gray-700">Sales Proposals & Estimates</span><i class="fas fa-check-circle text-green-500 ml-auto"></i></div>' +
          '<div class="flex items-center gap-3 p-2.5 bg-white rounded-lg"><i class="fas fa-file-invoice-dollar text-amber-500 w-5 text-center"></i><span class="text-sm text-gray-700">Customer Invoices</span><i class="fas fa-check-circle text-green-500 ml-auto"></i></div>' +
          '<div class="flex items-center gap-3 p-2.5 bg-white rounded-lg"><i class="fas fa-envelope text-green-500 w-5 text-center"></i><span class="text-sm text-gray-700">Email Report Delivery</span><i class="fas fa-check-circle text-green-500 ml-auto"></i></div>' +
          '<div class="flex items-center gap-3 p-2.5 bg-white rounded-lg opacity-60"><i class="fas fa-file-pdf text-red-400 w-5 text-center"></i><span class="text-sm text-gray-500">PDF Downloads</span><span class="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full ml-auto">Coming Soon</span></div>' +
        '</div>' +
      '</div>' +

      // Facebook / Meta Ads
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-2"><i class="fab fa-facebook text-blue-600 mr-2"></i>Facebook / Meta Ads</h3>' +
        '<p class="text-xs text-gray-500 mb-4">Connect your Facebook Business Page to track ad performance and generate leads directly in-app.</p>' +
        '<div class="space-y-3">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Meta Pixel ID</label>' +
            '<input type="text" value="' + esc(a.meta_pixel_id) + '" oninput="updateAdField(\'meta_pixel_id\', this.value)" placeholder="Enter your Meta Pixel ID" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Facebook Page ID</label>' +
            '<input type="text" value="' + esc(a.facebook_page_id) + '" oninput="updateAdField(\'facebook_page_id\', this.value)" placeholder="Your Facebook Business Page ID" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">' +
          '</div>' +
          '<div class="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">' +
            '<i class="fab fa-instagram text-pink-500 text-lg"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Instagram Connected via Meta</p><p class="text-[10px] text-gray-500">Linked through your Meta Business Suite</p></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Google Ads
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-2"><i class="fab fa-google text-red-500 mr-2"></i>Google Ads & Analytics</h3>' +
        '<p class="text-xs text-gray-500 mb-4">Connect Google Ads to track pay-per-click campaigns and measure ROI directly in your dashboard.</p>' +
        '<div class="space-y-3">' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Google Ads Account ID</label>' +
            '<input type="text" value="' + esc(a.google_account_id) + '" oninput="updateAdField(\'google_account_id\', this.value)" placeholder="123-456-7890" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-medium text-gray-600 mb-1">Google Analytics Measurement ID</label>' +
            '<input type="text" value="' + esc(a.google_analytics_id) + '" oninput="updateAdField(\'google_analytics_id\', this.value)" placeholder="G-XXXXXXXXXX" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500">' +
          '</div>' +
          '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3">' +
            '<p class="text-xs text-amber-700"><i class="fas fa-info-circle mr-1"></i>Google PPC campaign metrics will display here once connected. Track cost-per-lead, conversions, and ROI from your roofing campaigns.</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Roofer Quick Setup Tips
      '<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">' +
        '<h3 class="font-bold text-gray-800 text-sm mb-3"><i class="fas fa-lightbulb text-amber-500 mr-2"></i>Pro Tips for Roofers</h3>' +
        '<div class="space-y-2.5">' +
          '<div class="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">' +
            '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Upload a professional logo</p><p class="text-[10px] text-gray-500">Branded reports close 32% more deals than unbranded ones</p></div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">' +
            '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Add your license number</p><p class="text-[10px] text-gray-500">Builds trust and meets Alberta contractor requirements</p></div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">' +
            '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Set your brand colors</p><p class="text-[10px] text-gray-500">Match your truck wrap, door hangers, and business cards</p></div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">' +
            '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Connect Google Ads</p><p class="text-[10px] text-gray-500">Track which PPC keywords bring the most roofing leads</p></div>' +
          '</div>' +
          '<div class="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">' +
            '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>' +
            '<div><p class="text-xs font-semibold text-gray-700">Include insurance info</p><p class="text-[10px] text-gray-500">Homeowners check this — put it on every proposal automatically</p></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>' +
    '</div>' +

    // Footer
    '<div class="text-center py-6 text-xs text-gray-400 mt-4">' +
      '<p><i class="fas fa-info-circle mr-1"></i>All branding changes auto-save instantly. Your branding will appear on all future reports and documents.</p>' +
    '</div>';
}

// HTML escape helper
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
