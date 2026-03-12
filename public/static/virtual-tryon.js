// ============================================================
// RoofReporterAI — Virtual Try-On Frontend
//
// Full interactive UI: upload photo → draw roof mask on canvas
// → select style/color → dispatch to AI → poll → display result.
//
// Uses HTML5 Canvas for mask drawing (no dependencies).
// ============================================================

(function () {
  'use strict';

  var root = document.getElementById('tryon-root');
  var token = localStorage.getItem('rc_customer_token') || '';

  // ── State ──
  var state = {
    step: 1,               // 1=upload, 2=mask, 3=style, 4=processing, 5=result
    originalImage: null,    // Image element
    originalBase64: null,   // base64 data URI
    maskBase64: null,       // base64 data URI (white mask on black)
    roofStyle: 'metal',
    roofColor: 'charcoal grey',
    jobId: null,
    pollTimer: null,
    resultUrl: null,
    errorMsg: null,
    history: [],
    brushSize: 30,
    isErasing: false,
  };

  // ── Canvas refs (set during mask step) ──
  var imgCanvas, imgCtx, maskCanvas, maskCtx, overlayCanvas, overlayCtx;

  // ── API helper ──
  function api(method, path, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    return fetch('/api/virtual-tryon' + path, opts).then(function (r) { return r.json(); });
  }

  // ── Render Router ──
  function render() {
    switch (state.step) {
      case 1: renderUpload(); break;
      case 2: renderMaskEditor(); break;
      case 3: renderStylePicker(); break;
      case 4: renderProcessing(); break;
      case 5: renderResult(); break;
    }
  }

  // ════════════════════════════════════════════════════════
  // STEP 1: Upload Photo
  // ════════════════════════════════════════════════════════

  function renderUpload() {
    root.innerHTML =
      '<div class="max-w-2xl mx-auto">' +
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">' +
          '<div class="text-center mb-8">' +
            '<div class="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">' +
              '<i class="fas fa-magic text-white text-2xl"></i>' +
            '</div>' +
            '<h2 class="text-2xl font-bold text-gray-900 mb-2">Virtual Roof Try-On</h2>' +
            '<p class="text-gray-500 max-w-md mx-auto">Upload a photo of any house, paint over the roof area, choose a new style, and our AI will generate a photorealistic preview of the new roof.</p>' +
          '</div>' +

          // Upload area
          '<div id="uploadZone" class="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all group" onclick="document.getElementById(\'fileInput\').click()">' +
            '<input type="file" id="fileInput" accept="image/*" class="hidden" onchange="window._tryonHandleFile(this)">' +
            '<div class="flex flex-col items-center">' +
              '<div class="w-14 h-14 bg-gray-100 group-hover:bg-violet-100 rounded-full flex items-center justify-center mb-4 transition-colors">' +
                '<i class="fas fa-cloud-upload-alt text-2xl text-gray-400 group-hover:text-violet-500 transition-colors"></i>' +
              '</div>' +
              '<p class="text-lg font-semibold text-gray-700 mb-1">Drop a photo here or click to browse</p>' +
              '<p class="text-sm text-gray-400">JPG, PNG — max 10MB — exterior house photo works best</p>' +
            '</div>' +
          '</div>' +

          // Tips
          '<div class="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">' +
            '<h4 class="font-semibold text-amber-800 text-sm mb-2"><i class="fas fa-lightbulb mr-1"></i>Tips for Best Results</h4>' +
            '<ul class="text-sm text-amber-700 space-y-1">' +
              '<li><i class="fas fa-check text-amber-500 mr-1"></i>Use a front-facing photo with clear roof visibility</li>' +
              '<li><i class="fas fa-check text-amber-500 mr-1"></i>Daylight photos produce more realistic results</li>' +
              '<li><i class="fas fa-check text-amber-500 mr-1"></i>Avoid heavily obstructed roofs (trees covering &gt;50%)</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +

        // History section
        '<div id="historySection" class="mt-6"></div>' +
      '</div>';

    // Load history
    loadHistory();

    // Drag-and-drop
    var zone = document.getElementById('uploadZone');
    if (zone) {
      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('border-violet-400', 'bg-violet-50'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('border-violet-400', 'bg-violet-50'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('border-violet-400', 'bg-violet-50');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
      });
    }
  }

  // ── File handling ──
  window._tryonHandleFile = function (input) {
    if (input.files && input.files[0]) handleFile(input.files[0]);
  };

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Max 10MB.');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        state.originalImage = img;
        state.originalBase64 = e.target.result;
        state.step = 2;
        render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ════════════════════════════════════════════════════════
  // STEP 2: Mask Editor — Draw over the roof
  // ════════════════════════════════════════════════════════

  function renderMaskEditor() {
    var img = state.originalImage;
    // Scale image to fit (max 800px wide)
    var scale = Math.min(1, 800 / img.width);
    var w = Math.round(img.width * scale);
    var h = Math.round(img.height * scale);

    root.innerHTML =
      '<div class="max-w-4xl mx-auto">' +
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">' +

          // Header
          '<div class="flex items-center justify-between mb-4">' +
            '<div>' +
              '<h3 class="text-lg font-bold text-gray-900"><i class="fas fa-paint-brush text-violet-500 mr-2"></i>Paint the Roof Area</h3>' +
              '<p class="text-sm text-gray-500">Paint over the entire roof surface. The AI will replace only the painted area.</p>' +
            '</div>' +
            '<button onclick="window._tryonBack(1)" class="text-sm text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left mr-1"></i>Back</button>' +
          '</div>' +

          // Toolbar
          '<div class="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">' +
            '<div class="flex items-center gap-2">' +
              '<button id="brushBtn" onclick="window._tryonSetBrush(false)" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white"><i class="fas fa-paint-brush mr-1"></i>Brush</button>' +
              '<button id="eraserBtn" onclick="window._tryonSetBrush(true)" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"><i class="fas fa-eraser mr-1"></i>Eraser</button>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="text-xs text-gray-500">Size:</span>' +
              '<input type="range" id="brushSlider" min="5" max="80" value="' + state.brushSize + '" class="w-24 accent-violet-500" oninput="window._tryonBrushSize(this.value)">' +
              '<span id="brushSizeLabel" class="text-xs font-mono text-gray-500 w-6">' + state.brushSize + '</span>' +
            '</div>' +
            '<button onclick="window._tryonClearMask()" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200"><i class="fas fa-trash-alt mr-1"></i>Clear</button>' +
            '<div class="flex-1"></div>' +
            '<button onclick="window._tryonConfirmMask()" class="px-5 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 shadow"><i class="fas fa-check mr-1"></i>Done — Choose Style</button>' +
          '</div>' +

          // Canvas stack
          '<div id="canvasContainer" class="relative mx-auto border border-gray-300 rounded-lg overflow-hidden cursor-crosshair" style="width:' + w + 'px;height:' + h + 'px;">' +
            '<canvas id="imgCanvas" width="' + w + '" height="' + h + '" class="absolute inset-0"></canvas>' +
            '<canvas id="maskCanvas" width="' + w + '" height="' + h + '" class="absolute inset-0" style="opacity:0"></canvas>' +
            '<canvas id="overlayCanvas" width="' + w + '" height="' + h + '" class="absolute inset-0"></canvas>' +
          '</div>' +

          '<p class="text-xs text-gray-400 text-center mt-2"><i class="fas fa-info-circle mr-1"></i>The pink overlay shows the area that will be replaced by the AI.</p>' +
        '</div>' +
      '</div>';

    // Initialize canvases
    imgCanvas = document.getElementById('imgCanvas');
    imgCtx = imgCanvas.getContext('2d');
    maskCanvas = document.getElementById('maskCanvas');
    maskCtx = maskCanvas.getContext('2d');
    overlayCanvas = document.getElementById('overlayCanvas');
    overlayCtx = overlayCanvas.getContext('2d');

    // Draw original image
    imgCtx.drawImage(img, 0, 0, w, h);

    // Mask starts as all black (no mask)
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, w, h);

    // Setup drawing
    var drawing = false;
    var lastX, lastY;

    function drawAt(x, y) {
      var radius = state.brushSize / 2;

      // Draw on mask (white = masked area, black = keep)
      maskCtx.globalCompositeOperation = state.isErasing ? 'destination-out' : 'source-over';
      maskCtx.fillStyle = '#ffffff';
      maskCtx.beginPath();
      maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      maskCtx.fill();

      // Draw overlay (semi-transparent pink)
      overlayCtx.globalCompositeOperation = state.isErasing ? 'destination-out' : 'source-over';
      overlayCtx.fillStyle = 'rgba(168, 85, 247, 0.35)';
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, radius, 0, Math.PI * 2);
      overlayCtx.fill();
    }

    function drawLine(x1, y1, x2, y2) {
      var dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
      var steps = Math.max(1, Math.floor(dist / 3));
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        drawAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      }
    }

    function getPos(e) {
      var rect = overlayCanvas.getBoundingClientRect();
      var scaleX = overlayCanvas.width / rect.width;
      var scaleY = overlayCanvas.height / rect.height;
      var clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      var pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      drawAt(pos.x, pos.y);
    }

    function moveDraw(e) {
      e.preventDefault();
      if (!drawing) return;
      var pos = getPos(e);
      drawLine(lastX, lastY, pos.x, pos.y);
      lastX = pos.x;
      lastY = pos.y;
    }

    function stopDraw(e) {
      if (e) e.preventDefault();
      drawing = false;
    }

    overlayCanvas.addEventListener('mousedown', startDraw);
    overlayCanvas.addEventListener('mousemove', moveDraw);
    overlayCanvas.addEventListener('mouseup', stopDraw);
    overlayCanvas.addEventListener('mouseleave', stopDraw);
    overlayCanvas.addEventListener('touchstart', startDraw, { passive: false });
    overlayCanvas.addEventListener('touchmove', moveDraw, { passive: false });
    overlayCanvas.addEventListener('touchend', stopDraw);
  }

  // Toolbar actions
  window._tryonSetBrush = function (erasing) {
    state.isErasing = erasing;
    var brushBtn = document.getElementById('brushBtn');
    var eraserBtn = document.getElementById('eraserBtn');
    if (brushBtn && eraserBtn) {
      brushBtn.className = erasing
        ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300'
        : 'px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white';
      eraserBtn.className = erasing
        ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white'
        : 'px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300';
    }
  };

  window._tryonBrushSize = function (val) {
    state.brushSize = parseInt(val);
    var label = document.getElementById('brushSizeLabel');
    if (label) label.textContent = val;
  };

  window._tryonClearMask = function () {
    if (maskCtx && overlayCtx) {
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  };

  window._tryonConfirmMask = function () {
    // Check if mask has any painted area
    var data = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    var whitePx = 0;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i] > 128) whitePx++;
    }
    var coverage = whitePx / (maskCanvas.width * maskCanvas.height);

    if (coverage < 0.01) {
      alert('Please paint over the roof area first. The painted area (shown in purple) is what the AI will replace.');
      return;
    }
    if (coverage > 0.90) {
      if (!confirm('You\'ve painted over 90% of the image. The AI works best when only the roof is masked. Continue anyway?')) return;
    }

    // Export mask as base64 PNG
    state.maskBase64 = maskCanvas.toDataURL('image/png');
    state.step = 3;
    render();
  };

  window._tryonBack = function (step) {
    state.step = step;
    render();
  };

  // ════════════════════════════════════════════════════════
  // STEP 3: Style & Color Picker
  // ════════════════════════════════════════════════════════

  function renderStylePicker() {
    var styles = [
      { id: 'metal', label: 'Standing Seam Metal', icon: 'fa-industry', popular: true },
      { id: 'asphalt', label: 'Architectural Shingles', icon: 'fa-home', popular: true },
      { id: 'tile', label: 'Clay / Concrete Tile', icon: 'fa-building', popular: false },
      { id: 'slate', label: 'Natural Slate', icon: 'fa-gem', popular: false },
      { id: 'cedar', label: 'Cedar Shake', icon: 'fa-tree', popular: false },
    ];

    var colors = [
      { id: 'charcoal grey', label: 'Charcoal Grey', hex: '#36454F', popular: true },
      { id: 'matte black', label: 'Matte Black', hex: '#1a1a1a', popular: true },
      { id: 'dark bronze', label: 'Dark Bronze', hex: '#4a3728', popular: true },
      { id: 'forest green', label: 'Forest Green', hex: '#228B22' },
      { id: 'barn red', label: 'Barn Red', hex: '#7C0A02' },
      { id: 'slate blue', label: 'Slate Blue', hex: '#6A7B8B' },
      { id: 'weathered copper', label: 'Weathered Copper', hex: '#6D8B74' },
      { id: 'galvalume silver', label: 'Galvalume Silver', hex: '#C0C0C0' },
      { id: 'sandstone tan', label: 'Sandstone Tan', hex: '#C2B280' },
      { id: 'colonial red', label: 'Colonial Red', hex: '#9B1B30' },
    ];

    root.innerHTML =
      '<div class="max-w-3xl mx-auto">' +
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">' +

          '<div class="flex items-center justify-between mb-6">' +
            '<div>' +
              '<h3 class="text-lg font-bold text-gray-900"><i class="fas fa-swatchbook text-violet-500 mr-2"></i>Choose Roof Style</h3>' +
              '<p class="text-sm text-gray-500">Select the material and color for your virtual roof preview.</p>' +
            '</div>' +
            '<button onclick="window._tryonBack(2)" class="text-sm text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left mr-1"></i>Edit Mask</button>' +
          '</div>' +

          // Preview thumbnail
          '<div class="flex items-start gap-4 mb-6 p-3 bg-gray-50 rounded-xl">' +
            '<img src="' + state.originalBase64 + '" class="w-32 h-24 object-cover rounded-lg border border-gray-200">' +
            '<div>' +
              '<p class="text-sm font-medium text-gray-700">Your Photo</p>' +
              '<p class="text-xs text-gray-400">Mask applied — roof area selected</p>' +
              '<span class="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium"><i class="fas fa-check mr-1"></i>Ready</span>' +
            '</div>' +
          '</div>' +

          // Roof Style
          '<h4 class="font-semibold text-gray-800 text-sm mb-3">Roof Material</h4>' +
          '<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">' +
            styles.map(function (s) {
              var sel = s.id === state.roofStyle;
              return '<button onclick="window._tryonSetStyle(\'' + s.id + '\')" class="relative p-3 rounded-xl border-2 text-left transition-all ' +
                (sel ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-gray-200 hover:border-gray-300') + '">' +
                '<i class="fas ' + s.icon + ' text-lg ' + (sel ? 'text-violet-600' : 'text-gray-400') + '"></i>' +
                '<p class="text-sm font-medium mt-1 ' + (sel ? 'text-violet-700' : 'text-gray-700') + '">' + s.label + '</p>' +
                (s.popular ? '<span class="absolute top-1 right-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-medium">Popular</span>' : '') +
                (sel ? '<i class="fas fa-check-circle text-violet-500 absolute bottom-2 right-2"></i>' : '') +
              '</button>';
            }).join('') +
          '</div>' +

          // Roof Color
          '<h4 class="font-semibold text-gray-800 text-sm mb-3">Roof Color</h4>' +
          '<div class="grid grid-cols-3 md:grid-cols-5 gap-2 mb-6">' +
            colors.map(function (col) {
              var sel = col.id === state.roofColor;
              return '<button onclick="window._tryonSetColor(\'' + col.id + '\')" class="p-2 rounded-xl border-2 text-center transition-all ' +
                (sel ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200 hover:border-gray-300') + '">' +
                '<div class="w-8 h-8 rounded-full mx-auto mb-1 border border-gray-300 shadow-inner" style="background:' + col.hex + '"></div>' +
                '<p class="text-[11px] font-medium ' + (sel ? 'text-violet-700' : 'text-gray-600') + '">' + col.label + '</p>' +
              '</button>';
            }).join('') +
          '</div>' +

          // Generate button
          '<button onclick="window._tryonGenerate()" class="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl hover:from-violet-700 hover:to-purple-700 shadow-lg transition-all text-base">' +
            '<i class="fas fa-magic mr-2"></i>Generate Virtual Roof Preview' +
          '</button>' +

          '<p class="text-xs text-gray-400 text-center mt-3">AI generation typically takes 10-20 seconds</p>' +
        '</div>' +
      '</div>';
  }

  window._tryonSetStyle = function (id) {
    state.roofStyle = id;
    renderStylePicker();
  };

  window._tryonSetColor = function (id) {
    state.roofColor = id;
    renderStylePicker();
  };

  // ════════════════════════════════════════════════════════
  // Dispatch Generation
  // ════════════════════════════════════════════════════════

  window._tryonGenerate = function () {
    state.step = 4;
    state.errorMsg = null;
    state.resultUrl = null;
    render();

    api('POST', '/generate', {
      original_image: state.originalBase64,
      mask_image: state.maskBase64,
      roof_style: state.roofStyle,
      roof_color: state.roofColor,
    }).then(function (res) {
      if (res.success && res.job_id) {
        state.jobId = res.job_id;
        startPolling();
      } else {
        state.errorMsg = res.error || 'Failed to start generation';
        state.step = 5;
        render();
      }
    }).catch(function (err) {
      state.errorMsg = 'Network error: ' + err.message;
      state.step = 5;
      render();
    });
  };

  // ════════════════════════════════════════════════════════
  // STEP 4: Processing / Polling
  // ════════════════════════════════════════════════════════

  function renderProcessing() {
    var elapsed = state.jobId ? '...' : '';

    root.innerHTML =
      '<div class="max-w-xl mx-auto">' +
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">' +
          '<div class="relative w-24 h-24 mx-auto mb-6">' +
            '<div class="absolute inset-0 rounded-full border-4 border-gray-200"></div>' +
            '<div class="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin"></div>' +
            '<div class="absolute inset-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center">' +
              '<i class="fas fa-magic text-white text-2xl"></i>' +
            '</div>' +
          '</div>' +
          '<h3 class="text-xl font-bold text-gray-900 mb-2">Generating Your Virtual Roof</h3>' +
          '<p class="text-gray-500 mb-4">Our AI is creating a photorealistic preview of your ' + state.roofColor + ' ' + state.roofStyle + ' roof...</p>' +
          '<div id="pollStatus" class="text-sm text-gray-400"><i class="fas fa-clock mr-1"></i>This usually takes 10-20 seconds</div>' +
          '<div class="mt-6">' +
            '<div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">' +
              '<div id="progressBar" class="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all duration-500" style="width: 10%"></div>' +
            '</div>' +
          '</div>' +
          '<button onclick="window._tryonCancel()" class="mt-6 text-sm text-gray-400 hover:text-red-500"><i class="fas fa-times mr-1"></i>Cancel</button>' +
        '</div>' +
      '</div>';

    // Animate progress bar
    animateProgress();
  }

  var progressVal = 10;
  function animateProgress() {
    var bar = document.getElementById('progressBar');
    if (!bar || state.step !== 4) return;
    progressVal = Math.min(progressVal + Math.random() * 5, 90);
    bar.style.width = progressVal + '%';
    setTimeout(animateProgress, 1000);
  }

  function startPolling() {
    progressVal = 10;
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollStatus, 2000);
  }

  function pollStatus() {
    if (!state.jobId) return;
    api('GET', '/status/' + state.jobId).then(function (res) {
      var statusEl = document.getElementById('pollStatus');

      if (res.status === 'succeeded') {
        clearInterval(state.pollTimer);
        state.resultUrl = res.final_image_url;
        state.step = 5;
        // Set progress to 100% briefly before transition
        var bar = document.getElementById('progressBar');
        if (bar) bar.style.width = '100%';
        setTimeout(render, 500);
      } else if (res.status === 'failed') {
        clearInterval(state.pollTimer);
        state.errorMsg = res.error_message || 'AI generation failed. Please try again.';
        state.step = 5;
        render();
      } else if (res.status === 'cancelled') {
        clearInterval(state.pollTimer);
        state.step = 3;
        render();
      } else {
        // Still processing
        if (statusEl) {
          var sec = Math.round((res.elapsed_ms || 0) / 1000);
          statusEl.innerHTML = '<i class="fas fa-cog fa-spin mr-1"></i>Processing... ' + sec + 's elapsed';
        }
      }
    }).catch(function () {
      // Network hiccup — keep polling
    });
  }

  window._tryonCancel = function () {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.jobId) {
      api('POST', '/cancel/' + state.jobId).catch(function () { });
    }
    state.step = 3;
    render();
  };

  // ════════════════════════════════════════════════════════
  // STEP 5: Result Display
  // ════════════════════════════════════════════════════════

  function renderResult() {
    var hasResult = !!state.resultUrl;
    var hasError = !!state.errorMsg;

    root.innerHTML =
      '<div class="max-w-4xl mx-auto">' +
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">' +

          (hasError && !hasResult ?
            // Error state
            '<div class="text-center py-8">' +
              '<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
                '<i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>' +
              '</div>' +
              '<h3 class="text-xl font-bold text-gray-900 mb-2">Generation Failed</h3>' +
              '<p class="text-gray-500 mb-4">' + state.errorMsg + '</p>' +
              '<div class="flex justify-center gap-3">' +
                '<button onclick="window._tryonGenerate()" class="px-6 py-2 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700"><i class="fas fa-redo mr-1"></i>Try Again</button>' +
                '<button onclick="window._tryonBack(2)" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"><i class="fas fa-paint-brush mr-1"></i>Edit Mask</button>' +
                '<button onclick="window._tryonBack(1)" class="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200"><i class="fas fa-upload mr-1"></i>New Photo</button>' +
              '</div>' +
            '</div>'
          :
            // Success state — side-by-side comparison
            '<div>' +
              '<div class="flex items-center justify-between mb-4">' +
                '<div>' +
                  '<h3 class="text-lg font-bold text-gray-900"><i class="fas fa-check-circle text-green-500 mr-2"></i>Your Virtual Roof Preview</h3>' +
                  '<p class="text-sm text-gray-500">' + state.roofColor + ' ' + state.roofStyle + ' roof — AI generated</p>' +
                '</div>' +
                '<div class="flex gap-2">' +
                  '<button onclick="window._tryonDownload()" class="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700"><i class="fas fa-download mr-1"></i>Download</button>' +
                  '<button onclick="window._tryonBack(3)" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300"><i class="fas fa-palette mr-1"></i>Try Another Style</button>' +
                  '<button onclick="window._tryonBack(1)" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200"><i class="fas fa-camera mr-1"></i>New Photo</button>' +
                '</div>' +
              '</div>' +

              // Before / After comparison
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
                '<div>' +
                  '<p class="text-sm font-medium text-gray-500 mb-2 text-center"><i class="fas fa-clock mr-1"></i>Before</p>' +
                  '<img src="' + state.originalBase64 + '" class="w-full rounded-xl border border-gray-200 shadow-sm">' +
                '</div>' +
                '<div>' +
                  '<p class="text-sm font-medium text-violet-600 mb-2 text-center"><i class="fas fa-magic mr-1"></i>After — AI Preview</p>' +
                  '<img id="resultImage" src="' + (state.resultUrl || '') + '" class="w-full rounded-xl border-2 border-violet-300 shadow-lg" onerror="this.parentElement.innerHTML=\'<div class=\\\'p-8 text-center text-gray-400 bg-gray-50 rounded-xl border\\\'><i class=\\\'fas fa-image text-3xl mb-2\\\'></i><p>Image loading...</p></div>\'">' +
                '</div>' +
              '</div>' +

              // Disclaimer
              '<div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">' +
                '<p class="text-xs text-amber-700"><i class="fas fa-info-circle mr-1"></i><strong>Disclaimer:</strong> This AI-generated preview is an approximation. Actual installed roofs will vary based on material, installation technique, lighting conditions, and architectural details. Use for visualization purposes only.</p>' +
              '</div>' +
            '</div>'
          ) +
        '</div>' +
      '</div>';
  }

  window._tryonDownload = function () {
    if (!state.resultUrl) return;
    var a = document.createElement('a');
    a.href = state.resultUrl;
    a.download = 'virtual-roof-preview-' + state.roofStyle + '-' + state.roofColor.replace(/\s/g, '-') + '.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ════════════════════════════════════════════════════════
  // History
  // ════════════════════════════════════════════════════════

  function loadHistory() {
    var section = document.getElementById('historySection');
    if (!section || !token) return;

    api('GET', '/history').then(function (res) {
      if (!res.success || !res.jobs || res.jobs.length === 0) return;

      var html =
        '<div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">' +
          '<h3 class="font-bold text-gray-800 text-sm mb-3"><i class="fas fa-history text-violet-500 mr-2"></i>Recent Generations</h3>' +
          '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">';

      res.jobs.forEach(function (job) {
        var statusBadge = job.status === 'succeeded'
          ? '<span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Done</span>'
          : job.status === 'processing'
            ? '<span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Processing</span>'
            : '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Failed</span>';

        html += '<div class="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">';
        if (job.final_image_url) {
          html += '<img src="' + job.final_image_url + '" class="w-full h-28 object-cover">';
        } else {
          html += '<div class="w-full h-28 bg-gray-100 flex items-center justify-center"><i class="fas fa-image text-gray-300 text-xl"></i></div>';
        }
        html += '<div class="p-2">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-[11px] font-medium text-gray-600">' + (job.roof_style || 'metal') + '</span>' +
            statusBadge +
          '</div>' +
          '<p class="text-[10px] text-gray-400 mt-0.5">' + (job.created_at || '').split('T')[0] + '</p>' +
        '</div></div>';
      });

      html += '</div></div>';
      section.innerHTML = html;
    }).catch(function () { });
  }

  // ── Initialize ──
  render();
})();
