// ============================================================
// HeyGen Video Studio — Super Admin Dashboard Module
// Marketing Video Generation + Report Video Walkthroughs + Tutorials
// ============================================================

(function() {
  'use strict';

  const API = '/api/heygen';
  const getToken = () => localStorage.getItem('rc_token') || '';
  const hdrs = () => ({ 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' });

  // State
  let currentTab = 'overview';
  let avatars = [];
  let voices = [];
  let templates = [];
  let pollingIntervals = {};

  // Safe fetch that handles auth errors gracefully
  async function hgFetch(url, opts) {
    try {
      const res = await fetch(url, { headers: hdrs(), ...(opts || {}) });
      if (!res.ok) {
        const text = await res.text();
        try { return { _error: true, ...(JSON.parse(text)) }; }
        catch(e) { return { _error: true, error: text || ('HTTP ' + res.status) }; }
      }
      return await res.json();
    } catch(e) {
      return { _error: true, error: e.message };
    }
  }

  // ── MAIN ENTRY ──
  window.loadHeyGen = function() {
    const container = document.getElementById('sa-root');
    if (!container) return;
    container.innerHTML = renderShell();
    switchTab('overview');
  };

  function renderShell() {
    return `
    <div style="max-width:1280px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(124,58,237,0.3)">
          <i class="fas fa-video" style="color:#fff;font-size:22px"></i>
        </div>
        <div>
          <h2 style="margin:0;font-size:24px;font-weight:900;color:#1a1a2e">HeyGen Video Studio</h2>
          <p style="margin:0;font-size:13px;color:#64748b">Create AI avatar marketing videos, tutorials, and report walkthroughs for RoofReporterAI</p>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:2px;margin-bottom:20px;border-bottom:2px solid #e2e8f0;padding-bottom:0;overflow-x:auto">
        ${['overview','create','agent','tutorials','report-video','videos','templates'].map(t => {
          const labels = { overview:'Dashboard', create:'Studio Create', agent:'Video Agent', tutorials:'Tutorials', 'report-video':'Report Videos', videos:'My Videos', templates:'Templates' };
          const icons = { overview:'fa-chart-bar', create:'fa-magic', agent:'fa-robot', tutorials:'fa-graduation-cap', 'report-video':'fa-file-video', videos:'fa-film', templates:'fa-clone' };
          return `<button onclick="window._hgTab('${t}')" id="hg-tab-${t}" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#64748b;transition:all .2s;white-space:nowrap">
            <i class="fas ${icons[t]}" style="margin-right:5px"></i>${labels[t]}
          </button>`;
        }).join('')}
      </div>

      <div id="hg-content"></div>
    </div>`;
  }

  window._hgTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('[id^="hg-tab-"]').forEach(el => {
      el.style.borderBottomColor = 'transparent';
      el.style.color = '#64748b';
    });
    const active = document.getElementById('hg-tab-' + tab);
    if (active) { active.style.borderBottomColor = '#7c3aed'; active.style.color = '#7c3aed'; }
    switchTab(tab);
  };

  async function switchTab(tab) {
    const el = document.getElementById('hg-content');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#7c3aed"></i><p style="color:#94a3b8;font-size:13px;margin-top:8px">Loading...</p></div>';
    try {
      if (tab === 'overview') await renderOverview(el);
      else if (tab === 'create') await renderStudioCreate(el);
      else if (tab === 'agent') await renderVideoAgent(el);
      else if (tab === 'tutorials') await renderTutorials(el);
      else if (tab === 'report-video') await renderReportVideo(el);
      else if (tab === 'videos') await renderVideosList(el);
      else if (tab === 'templates') await renderTemplates(el);
    } catch (e) {
      el.innerHTML = errBox('Failed to load: ' + e.message);
    }
  }

  // ============================================================
  // OVERVIEW TAB — Dashboard
  // ============================================================
  async function renderOverview(el) {
    const data = await hgFetch(API + '/dashboard');

    if (data._error) {
      el.innerHTML = errBox(data.error || 'Failed to load dashboard. Check API configuration.');
      return;
    }

    if (!data.api_configured) {
      el.innerHTML = `
      <div style="padding:40px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:16px;text-align:center;max-width:600px;margin:0 auto">
        <i class="fas fa-key" style="font-size:42px;color:#d97706;margin-bottom:16px"></i>
        <h3 style="color:#92400e;margin-bottom:8px;font-size:18px;font-weight:800">HeyGen API Key Required</h3>
        <p style="color:#a16207;font-size:14px;margin-bottom:20px">Add your HeyGen API key to start generating AI avatar videos for your marketing campaigns.</p>
        <code style="background:#fff;padding:12px 16px;border-radius:8px;font-size:12px;display:block;margin:0 auto;max-width:600px;text-align:left;line-height:1.8">
          wrangler pages secret put HEYGEN_API_KEY --project-name roofing-measurement-tool
        </code>
        <p style="color:#a16207;font-size:12px;margin-top:16px">Get your API key at: <a href="https://app.heygen.com/settings?nav=API" target="_blank" style="color:#7c3aed;font-weight:700;text-decoration:underline">app.heygen.com/settings</a></p>
      </div>`;
      return;
    }

    const s = data.stats || {};
    el.innerHTML = `
    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px">
      ${statCard('Total Videos', s.total || 0, 'fa-video', '#7c3aed', '#f5f3ff')}
      ${statCard('Completed', s.completed || 0, 'fa-check-circle', '#059669', '#ecfdf5')}
      ${statCard('Processing', s.processing || 0, 'fa-spinner', '#d97706', '#fffbeb')}
      ${statCard('Failed', s.failed || 0, 'fa-times-circle', '#dc2626', '#fef2f2')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <!-- Recent Videos -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-clock" style="color:#7c3aed;margin-right:6px"></i>Recent Videos</h3>
        ${(data.recent_videos || []).length === 0 ? '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0">No videos yet. Create your first one below!</p>' :
          (data.recent_videos || []).map(v => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <div style="width:48px;height:28px;background:#1a2332;border-radius:4px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
              ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-film" style="color:#475569;font-size:10px"></i>'}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
              <div style="font-size:10px;color:#94a3b8">${v.category || 'N/A'} &bull; ${new Date(v.created_at).toLocaleDateString()}</div>
            </div>
            <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;${statusStyle(v.status)}">${v.status}</span>
          </div>`).join('')}
      </div>

      <!-- Templates -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-clone" style="color:#a855f7;margin-right:6px"></i>Saved Templates</h3>
        ${(data.templates || []).length === 0 ? '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0">No templates yet. Create one in the Templates tab.</p>' :
          (data.templates || []).map(t => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <div>
              <div style="font-size:12px;font-weight:600;color:#1e293b">${t.name}</div>
              <div style="font-size:10px;color:#94a3b8">${t.category} &bull; Used ${t.usage_count || 0}x</div>
            </div>
            <button onclick="window._hgUseTemplate(${t.id})" style="padding:4px 10px;font-size:11px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer">Use</button>
          </div>`).join('')}
      </div>
    </div>

    <!-- Quick Actions -->
    <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-bolt" style="color:#f59e0b;margin-right:6px"></i>Quick Actions</h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      <button onclick="window._hgTab('create')" style="padding:16px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;text-align:center">
        <i class="fas fa-magic" style="font-size:20px;display:block;margin-bottom:6px"></i>Marketing Video
      </button>
      <button onclick="window._hgTab('agent')" style="padding:16px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;text-align:center">
        <i class="fas fa-robot" style="font-size:20px;display:block;margin-bottom:6px"></i>AI Video Agent
      </button>
      <button onclick="window._hgTab('tutorials')" style="padding:16px;background:linear-gradient(135deg,#d97706,#f59e0b);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;text-align:center">
        <i class="fas fa-graduation-cap" style="font-size:20px;display:block;margin-bottom:6px"></i>Tutorial Videos
      </button>
      <button onclick="window._hgTab('report-video')" style="padding:16px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;text-align:center">
        <i class="fas fa-file-video" style="font-size:20px;display:block;margin-bottom:6px"></i>Report Walkthrough
      </button>
    </div>`;
  }

  // ============================================================
  // STUDIO CREATE TAB — Full avatar+voice video creation
  // ============================================================
  async function renderStudioCreate(el) {
    el.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#7c3aed"></i><p style="color:#94a3b8;font-size:13px;margin-top:8px">Loading avatars & voices...</p></div>';

    try {
      const [aData, vData, tData] = await Promise.all([
        hgFetch(API + '/avatars'),
        hgFetch(API + '/voices'),
        hgFetch(API + '/templates'),
      ]);
      if (aData._error || vData._error) {
        el.innerHTML = errBox('Failed to load HeyGen data: ' + (aData.error || vData.error || 'Unknown error') + '. Ensure HEYGEN_API_KEY is configured.');
        return;
      }
      avatars = aData.avatars || [];
      voices = vData.voices || [];
      templates = tData.templates || [];
    } catch (e) {
      el.innerHTML = errBox('Failed to load HeyGen data: ' + e.message);
      return;
    }

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- LEFT: Form -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-magic" style="color:#7c3aed;margin-right:6px"></i>Create Video</h3>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Video Title</label>
        <input id="hg-title" type="text" placeholder="e.g. RoofReporterAI Product Demo" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Category</label>
        <select id="hg-category" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
          <option value="marketing">Marketing</option>
          <option value="social">Social Media Ad</option>
          <option value="training">How-To Tutorial</option>
          <option value="ad">Advertisement</option>
          <option value="testimonial">Customer Testimonial</option>
          <option value="report_walkthrough">Report Walkthrough</option>
        </select>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Template (optional)</label>
        <select id="hg-template" onchange="window._hgApplyTemplate()" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
          <option value="">— No Template —</option>
          ${templates.map(t => `<option value="${t.id}">${t.name} (${t.category})</option>`).join('')}
        </select>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Avatar</label>
        <select id="hg-avatar" onchange="window._hgPreviewAvatar()" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
          ${avatars.slice(0, 60).map(a => `<option value="${a.avatar_id}" data-name="${a.avatar_name}" data-img="${a.preview_image_url || ''}">${a.avatar_name} (${a.gender || 'N/A'})</option>`).join('')}
        </select>
        <div id="hg-avatar-preview" style="margin-bottom:12px"></div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Voice</label>
        <select id="hg-voice" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:4px;box-sizing:border-box">
          ${voices.filter(v => v.language && v.language.toLowerCase().includes('en')).slice(0, 60).map(v => `<option value="${v.voice_id}" data-name="${v.name}">${v.name} (${v.language || ''}, ${v.gender || ''})</option>`).join('')}
        </select>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:12px">${voices.length} voices available (showing English)</div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Script</label>
        <textarea id="hg-script" rows="8" placeholder="Enter the text the avatar will speak..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px;box-sizing:border-box"></textarea>

        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Aspect Ratio</label>
            <select id="hg-aspect" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
              <option value="16:9" selected>16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait / TikTok)</option>
              <option value="1:1">1:1 (Square / Instagram)</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Background</label>
            <input id="hg-bg-color" type="color" value="#ffffff" style="width:100%;height:36px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;box-sizing:border-box">
          </div>
        </div>

        <button onclick="window._hgGenerate()" id="hg-gen-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
          <i class="fas fa-video" style="margin-right:6px"></i>Generate Video
        </button>
        <div id="hg-gen-status" style="margin-top:10px"></div>
      </div>

      <!-- RIGHT: Preview & Tips -->
      <div>
        <div style="background:#1a2332;border-radius:12px;padding:24px;text-align:center;margin-bottom:16px;min-height:280px;display:flex;align-items:center;justify-content:center">
          <div id="hg-video-preview" style="color:#64748b;font-size:14px">
            <i class="fas fa-play-circle" style="font-size:48px;color:#475569;margin-bottom:12px;display:block"></i>
            Video preview appears here after generation
          </div>
        </div>

        <!-- Script Presets -->
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
          <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px"><i class="fas fa-lightbulb" style="color:#f59e0b;margin-right:4px"></i>Quick Script Presets</h4>
          <div style="display:grid;gap:6px">
            <button onclick="window._hgFillPreset('product_demo')" style="text-align:left;padding:8px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;cursor:pointer;font-size:11px;color:#6d28d9;font-weight:600;border:none">
              <i class="fas fa-rocket" style="margin-right:4px;width:14px"></i> Product Demo — Show off RoofReporterAI features
            </button>
            <button onclick="window._hgFillPreset('social_ad')" style="text-align:left;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;cursor:pointer;font-size:11px;color:#1d4ed8;font-weight:600;border:none">
              <i class="fas fa-bullhorn" style="margin-right:4px;width:14px"></i> Social Media Ad — 30-second attention grabber
            </button>
            <button onclick="window._hgFillPreset('contractor_pitch')" style="text-align:left;padding:8px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;cursor:pointer;font-size:11px;color:#047857;font-weight:600;border:none">
              <i class="fas fa-handshake" style="margin-right:4px;width:14px"></i> Contractor Pitch — Why roofers love our tool
            </button>
            <button onclick="window._hgFillPreset('homeowner_explainer')" style="text-align:left;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;cursor:pointer;font-size:11px;color:#92400e;font-weight:600;border:none">
              <i class="fas fa-home" style="margin-right:4px;width:14px"></i> Homeowner Explainer — Get your roof measured
            </button>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
          <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px"><i class="fas fa-info-circle" style="color:#3b82f6;margin-right:4px"></i>Tips</h4>
          <ul style="font-size:12px;color:#64748b;line-height:1.8;padding-left:16px;margin:0">
            <li>Keep scripts under 2 minutes for best quality</li>
            <li>Use clear, conversational language</li>
            <li>16:9 for YouTube/web, 9:16 for TikTok/Reels</li>
            <li>Videos typically take 2-5 minutes to generate</li>
          </ul>
        </div>
      </div>
    </div>`;

    // Auto-show avatar preview
    window._hgPreviewAvatar();
  }

  // ============================================================
  // VIDEO AGENT TAB — Prompt-to-video using HeyGen's AI agent
  // ============================================================
  async function renderVideoAgent(el) {
    el.innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;border-radius:12px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:6px"><i class="fas fa-robot" style="margin-right:6px"></i>Video Agent — Prompt to Video</h3>
        <p style="font-size:13px;color:#3b82f6">Describe the video you want and HeyGen's AI agent will select the best avatar, voice, and style automatically. Great for quick marketing videos.</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Video Title</label>
          <input id="hg-agent-title" type="text" placeholder="e.g. Roof Measurement Service Ad" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">

          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Prompt</label>
          <textarea id="hg-agent-prompt" rows="10" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px;box-sizing:border-box" placeholder="Describe the video you want..."></textarea>

          <div style="display:flex;gap:12px;margin-bottom:16px">
            <div style="flex:1">
              <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Aspect Ratio</label>
              <select id="hg-agent-aspect" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
                <option value="16:9" selected>16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>
            <div style="flex:1">
              <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Category</label>
              <select id="hg-agent-cat" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
                <option value="marketing">Marketing</option>
                <option value="social">Social Media</option>
                <option value="ad">Advertisement</option>
                <option value="training">Tutorial</option>
              </select>
            </div>
          </div>

          <button onclick="window._hgGenerateAgent()" id="hg-agent-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
            <i class="fas fa-robot" style="margin-right:6px"></i>Generate with AI Agent
          </button>
          <div id="hg-agent-status" style="margin-top:10px"></div>
        </div>

        <!-- Prompt Presets -->
        <div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px">
            <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px"><i class="fas fa-bolt" style="color:#f59e0b;margin-right:4px"></i>One-Click Prompt Presets</h4>
            <div style="display:grid;gap:8px">
              ${agentPresetBtn('product_overview', 'fa-rocket', 'purple', 'Product Overview', 'Full feature walkthrough of RoofReporterAI')}
              ${agentPresetBtn('social_30s', 'fa-tiktok fab', 'pink', '30s Social Ad', 'Quick social media ad for Instagram/TikTok')}
              ${agentPresetBtn('contractor_testimonial', 'fa-hard-hat', 'yellow', 'Contractor Testimonial', 'Why roofing contractors choose us')}
              ${agentPresetBtn('how_it_works', 'fa-cogs', 'blue', 'How It Works', 'Step-by-step process explanation')}
              ${agentPresetBtn('pricing_explainer', 'fa-dollar-sign', 'green', 'Pricing Explainer', 'Break down our pricing model')}
              ${agentPresetBtn('before_after', 'fa-exchange-alt', 'orange', 'Before & After', 'Manual vs AI roof measurement')}
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
            <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px"><i class="fas fa-info-circle" style="color:#3b82f6;margin-right:4px"></i>How Video Agent Works</h4>
            <ul style="font-size:12px;color:#64748b;line-height:1.8;padding-left:16px;margin:0">
              <li>AI auto-selects the best avatar & voice</li>
              <li>Generates scenes, transitions & text overlays</li>
              <li>Perfect for quick video creation from a description</li>
              <li>Results in 3-8 minutes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // TUTORIALS TAB — Pre-built tutorial video generator
  // ============================================================
  async function renderTutorials(el) {
    el.innerHTML = `
    <div style="max-width:1000px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fde68a;border-radius:12px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#92400e;margin-bottom:6px"><i class="fas fa-graduation-cap" style="margin-right:6px"></i>Tutorial Video Generator</h3>
        <p style="font-size:13px;color:#a16207">Generate professional how-to tutorial videos for RoofReporterAI features. These are ready-made scripts — just select, customize, and generate.</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:24px">
        ${tutorialCard('getting_started', 'fa-play-circle', '#7c3aed', 'Getting Started with RoofReporterAI',
          'Walk new users through account creation, their first roof measurement order, and reading the report.',
          'Welcome to RoofReporterAI! In this quick tutorial, I\'ll show you how to get started with Canada\'s most advanced AI-powered roof measurement platform. First, create your account at roofreporterai.com — it only takes 30 seconds. Once logged in, you\'ll see your dashboard. To order your first roof report, click "New Order" and enter the property address. Our AI will use satellite imagery to measure the roof automatically. Within minutes, you\'ll receive a professional PDF report with total area, pitch analysis, edge measurements, and a detailed diagram. It\'s that simple! Let\'s get started.')}

        ${tutorialCard('reading_report', 'fa-file-alt', '#059669', 'How to Read Your Roof Report',
          'Explain each section of the report: area, pitch, edges, diagrams, and waste factors.',
          'Let me walk you through your RoofReporterAI roof measurement report. Page one shows the property overview with the total roof area in square feet, predominant pitch, and waste factor calculation. The pitch analysis section classifies your roof slope and helps determine material requirements. Next, the edge summary breaks down every eave, ridge, hip, and valley line with precise measurements in linear feet. The architectural diagram gives you a bird\'s eye view of the roof planes with color-coded edges. Finally, the material estimation section calculates everything you need for your bid. Each section is designed to give you professional-grade data for accurate quoting.')}

        ${tutorialCard('ordering_process', 'fa-shopping-cart', '#2563eb', 'How to Order a Roof Report',
          'Step-by-step ordering: enter address, select package, pay, and receive report.',
          'Ordering a roof report on RoofReporterAI is fast and easy. Step one: Enter the property address — our system auto-completes and validates the location. Step two: Select your report package — we offer Standard and Professional tiers with different levels of detail. Step three: Review the pricing and complete payment through our secure checkout. Step four: Sit back! Our AI engine analyzes satellite imagery and generates your comprehensive roof measurement report. Most reports are ready within 5 to 10 minutes. You\'ll receive an email notification with a link to download your professional PDF report. It\'s that easy!')}

        ${tutorialCard('crm_features', 'fa-address-book', '#d97706', 'Using the Built-In CRM',
          'How to manage leads, send proposals, and track jobs using the CRM module.',
          'RoofReporterAI comes with a powerful built-in CRM designed specifically for roofing contractors. From your dashboard, navigate to the CRM tab to see all your contacts, leads, and projects in one place. Add new leads manually or import from a CSV file. Each contact card shows their property details, order history, and communication log. You can send professional proposals directly from the platform, track job status from estimate to completion, and set follow-up reminders. The CRM integrates directly with your roof reports, so all measurement data is automatically linked to each customer. It\'s your complete roofing business management hub.')}

        ${tutorialCard('d2d_sales', 'fa-door-open', '#dc2626', 'Door-to-Door Sales Module',
          'How to use the D2D module for field sales reps: territory mapping, quick orders, and follow-ups.',
          'The door-to-door sales module in RoofReporterAI is built for field sales reps. Open the D2D tab to access your territory map with color-coded pins for each lead status. When you\'re at a homeowner\'s door, pull up the property instantly by address. Show them a satellite image of their roof right on your phone. If they\'re interested, order an instant AI measurement report on the spot — it makes a powerful closing tool. Log your visit notes, set follow-up reminders, and track your daily stats. Managers can view team performance, assign territories, and monitor conversion rates. It turns every door knock into a data-driven sales opportunity.')}

        ${tutorialCard('secretary_setup', 'fa-phone-alt', '#0891b2', 'Setting Up Your AI Secretary',
          'Configure the AI receptionist: phone setup, greeting, call routing, and forwarding.',
          'Never miss a call again with the RoofReporterAI AI Secretary. Here\'s how to set it up. First, go to the Secretary tab in your dashboard. Enter your business phone number and choose your forwarding method — we support call forwarding, Twilio, and VoIP integration. Next, customize your greeting script. This is what the AI will say when answering calls. Then set up your call routing directories — for example, route sales calls to your sales team and service calls to your office. Configure your after-hours behavior: the AI can take messages, forward urgents, or schedule callbacks. Once configured, click Deploy and your AI secretary is live. It answers every call professionally, 24/7.')}
      </div>

      <!-- Custom Tutorial -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-pencil-alt" style="color:#7c3aed;margin-right:6px"></i>Custom Tutorial</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Tutorial Title</label>
            <input id="hg-tut-title" type="text" placeholder="e.g. How to Use the Proposal Builder" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Aspect Ratio</label>
            <select id="hg-tut-aspect" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">
              <option value="16:9" selected>16:9 (YouTube)</option>
              <option value="9:16">9:16 (TikTok/Shorts)</option>
            </select>
          </div>
        </div>
        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Script</label>
        <textarea id="hg-tut-script" rows="6" placeholder="Write your tutorial script here..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px;box-sizing:border-box"></textarea>
        <button onclick="window._hgGenerateTutorial()" id="hg-tut-btn" style="padding:10px 24px;background:linear-gradient(135deg,#d97706,#f59e0b);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
          <i class="fas fa-graduation-cap" style="margin-right:6px"></i>Generate Custom Tutorial
        </button>
        <div id="hg-tut-status" style="margin-top:10px"></div>
      </div>
    </div>`;
  }

  // ============================================================
  // REPORT VIDEO TAB
  // ============================================================
  async function renderReportVideo(el) {
    el.innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #a7f3d0;border-radius:12px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#065f46;margin-bottom:6px"><i class="fas fa-file-video" style="margin-right:6px"></i>Report Video Walkthrough</h3>
        <p style="font-size:13px;color:#047857">Generate a personalized AI avatar video that walks your client through their roof measurement report. Auto-includes property address, area, pitch, and key measurements.</p>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Order ID</label>
        <input id="hg-rv-order" type="number" placeholder="e.g. 67" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Avatar</label>
            <select id="hg-rv-avatar" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
              <option value="">Loading avatars...</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Voice</label>
            <select id="hg-rv-voice" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
              <option value="">Loading voices...</option>
            </select>
          </div>
        </div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Custom Script (optional — leave blank for auto-generated)</label>
        <textarea id="hg-rv-script" rows="6" placeholder="Leave empty to auto-generate based on report data. Or enter a custom script..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px;box-sizing:border-box"></textarea>

        <button onclick="window._hgGenerateReportVideo()" id="hg-rv-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
          <i class="fas fa-file-video" style="margin-right:6px"></i>Generate Report Walkthrough Video
        </button>
        <div id="hg-rv-status" style="margin-top:10px"></div>
      </div>
    </div>`;

    // Load avatars & voices for report tab
    try {
      if (avatars.length === 0) {
        const [aData, vData] = await Promise.all([
          hgFetch(API + '/avatars'),
          hgFetch(API + '/voices'),
        ]);
        avatars = (aData.avatars || []);
        voices = (vData.voices || []);
      }
      const avatarSel = document.getElementById('hg-rv-avatar');
      const voiceSel = document.getElementById('hg-rv-voice');
      if (avatarSel) avatarSel.innerHTML = avatars.slice(0, 60).map(a => `<option value="${a.avatar_id}" data-name="${a.avatar_name}">${a.avatar_name} (${a.gender || ''})</option>`).join('');
      if (voiceSel) voiceSel.innerHTML = voices.filter(v => v.language && v.language.toLowerCase().includes('en')).slice(0, 60).map(v => `<option value="${v.voice_id}" data-name="${v.name}">${v.name} (${v.language || ''})</option>`).join('');
    } catch (e) { console.warn('Failed to load avatars/voices for report tab', e); }
  }

  // ============================================================
  // VIDEOS LIST TAB
  // ============================================================
  async function renderVideosList(el) {
    const data = await hgFetch(API + '/videos?limit=50');
    if (data._error) { el.innerHTML = errBox(data.error); return; }
    const videos = data.videos || [];

    if (videos.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-film" style="font-size:48px;margin-bottom:16px;display:block;color:#d1d5db"></i><p style="font-size:16px;font-weight:600">No videos generated yet</p><p style="font-size:13px">Create your first video using Studio Create or Video Agent</p></div>';
      return;
    }

    el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b"><i class="fas fa-film" style="color:#7c3aed;margin-right:6px"></i>All Videos (${videos.length})</h3>
      <button onclick="window._hgTab('videos')" style="padding:6px 12px;font-size:12px;background:#f1f5f9;color:#475569;border:none;border-radius:6px;cursor:pointer"><i class="fas fa-sync-alt" style="margin-right:4px"></i>Refresh</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${videos.map(v => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="height:170px;background:#1a2332;display:flex;align-items:center;justify-content:center;position:relative">
          ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-film" style="font-size:36px;color:#475569"></i>'}
          ${v.video_url ? `<a href="${v.video_url}" target="_blank" style="position:absolute;width:48px;height:48px;background:rgba(124,58,237,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none"><i class="fas fa-play" style="color:#fff;font-size:18px;margin-left:2px"></i></a>` : ''}
          <span style="position:absolute;top:8px;right:8px;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;${statusStyle(v.status)}">${v.status}</span>
        </div>
        <div style="padding:12px">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">
            ${v.category || 'N/A'} &bull; ${v.avatar_name || 'AI Agent'} &bull; ${v.duration_seconds ? Math.round(v.duration_seconds) + 's' : 'N/A'}
          </div>
          <div style="display:flex;gap:6px">
            ${v.status === 'processing' ? `<button onclick="window._hgPollStatus('${v.video_id}')" style="flex:1;padding:6px;font-size:11px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer"><i class="fas fa-sync"></i> Check</button>` : ''}
            ${v.video_url ? `<a href="${v.video_url}" target="_blank" style="flex:1;padding:6px;font-size:11px;background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;border-radius:4px;text-align:center;text-decoration:none"><i class="fas fa-download"></i> Download</a>` : ''}
            <button onclick="window._hgDeleteVideo(${v.id})" style="padding:6px 10px;font-size:11px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;cursor:pointer"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  // ============================================================
  // TEMPLATES TAB
  // ============================================================
  async function renderTemplates(el) {
    const data = await hgFetch(API + '/templates');
    if (data._error) { el.innerHTML = errBox(data.error); return; }
    const tmpls = data.templates || [];

    el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b"><i class="fas fa-clone" style="color:#a855f7;margin-right:6px"></i>Video Templates</h3>
      <button onclick="window._hgShowNewTemplate()" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer"><i class="fas fa-plus" style="margin-right:4px"></i>New Template</button>
    </div>
    <div id="hg-new-template-form" style="display:none;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <input id="hg-tpl-name" placeholder="Template name" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
        <select id="hg-tpl-cat" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
          <option value="marketing">Marketing</option><option value="social">Social</option><option value="training">Tutorial</option><option value="ad">Ad</option><option value="report_walkthrough">Report</option>
        </select>
      </div>
      <textarea id="hg-tpl-script" rows="4" placeholder="Script template (use {{address}}, {{total_area}}, {{pitch}} as placeholders)" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px;box-sizing:border-box"></textarea>
      <button onclick="window._hgSaveTemplate()" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Save Template</button>
    </div>
    ${tmpls.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:30px;font-size:14px">No templates yet. Create one to reuse scripts across videos.</p>' :
      `<div style="display:grid;gap:12px">${tmpls.map(t => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:#1e293b">${t.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${t.category} &bull; Used ${t.usage_count || 0}x${t.description ? ' &bull; ' + t.description : ''}</div>
          ${t.script_template ? `<div style="font-size:11px;color:#475569;margin-top:6px;background:#f8fafc;padding:6px 10px;border-radius:4px;max-height:60px;overflow:hidden">${t.script_template.substring(0, 200)}...</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;margin-left:12px">
          <button onclick="window._hgUseTemplate(${t.id})" style="padding:6px 12px;font-size:11px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer">Use</button>
          <button onclick="window._hgDeleteTemplate(${t.id})" style="padding:6px 10px;font-size:11px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;cursor:pointer"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('')}</div>`}`;
  }

  // ============================================================
  // ACTION HANDLERS
  // ============================================================

  // Script presets for Studio Create
  const SCRIPT_PRESETS = {
    product_demo: {
      title: 'RoofReporterAI Product Demo',
      category: 'marketing',
      script: "Welcome to RoofReporterAI — Canada's leading AI-powered roof measurement platform! In just minutes, our advanced satellite imagery analysis delivers professional-grade roof reports that used to take hours of manual work. Here's what you get: precise area measurements in square feet, detailed pitch analysis for every roof plane, complete edge measurements — eave, ridge, hip, and valley — all with linear foot totals. Plus, a professional architectural diagram and waste factor calculations. Whether you're a roofing contractor, insurance adjuster, or property manager, RoofReporterAI saves you time and money while delivering accuracy you can trust. Try it today at roofreporterai.com!"
    },
    social_ad: {
      title: 'RoofReporterAI — 30 Second Ad',
      category: 'social',
      script: "Still climbing ladders to measure roofs? There's a better way. RoofReporterAI uses satellite imagery and artificial intelligence to measure any roof in minutes — not hours. Get precise area, pitch, edge measurements, and professional diagrams instantly. Trusted by hundreds of Canadian roofing contractors. Your first report is just 15 dollars. Try RoofReporterAI today!"
    },
    contractor_pitch: {
      title: 'Why Contractors Choose RoofReporterAI',
      category: 'marketing',
      script: "Hey there! If you're a roofing contractor, you know how time-consuming roof measurements can be. Climbing up, measuring by hand, doing the math — it eats into your profit margin. That's why leading contractors across Canada are switching to RoofReporterAI. Our AI analyzes satellite imagery to deliver accurate measurements in minutes. You get total area, pitch analysis, edge lengths, waste calculations, and a professional diagram — all in a beautiful PDF you can share with clients. Your team can order reports from anywhere, anytime. No ladders. No tape measures. No guesswork. Just accurate data that helps you quote faster and win more jobs."
    },
    homeowner_explainer: {
      title: 'Homeowners — Get Your Roof Measured',
      category: 'marketing',
      script: "Planning a roof repair or replacement? Getting an accurate measurement is the first step to a fair quote. With RoofReporterAI, you can get a professional roof measurement report without anyone climbing on your roof. We use advanced satellite imagery and AI technology to measure your roof precisely — total area, slope, and all the details a contractor needs. Simply enter your address, and within minutes you'll have a comprehensive report you can share with multiple contractors for competitive quotes. It's affordable, fast, and incredibly accurate. Visit roofreporterai.com to get started!"
    }
  };

  // Agent prompt presets
  const AGENT_PRESETS = {
    product_overview: "Create a professional 60-second marketing video for RoofReporterAI, Canada's #1 AI-powered roof measurement platform. The presenter should be a professional-looking person in business attire. They should explain how the platform uses satellite imagery and AI to generate accurate roof measurement reports in minutes. Highlight key features: precise area measurements, pitch analysis, edge measurements (eave, ridge, hip, valley), architectural diagrams, and waste factor calculations. The tone should be confident and modern. End with a call to action to visit roofreporterai.com. Use text overlays for key statistics.",
    social_30s: "Create a fast-paced 30-second social media ad for RoofReporterAI. Start with a hook question: 'Still measuring roofs by hand?' Then quickly show the benefits: AI-powered satellite measurements, instant PDF reports, save hours per job. The presenter should be energetic and engaging. Use quick text overlays with stats. Format: 9:16 portrait for TikTok and Instagram Reels. End with: 'Try RoofReporterAI today — first report just $15!'",
    contractor_testimonial: "Create a testimonial-style video where a professional roofing contractor explains why they switched to RoofReporterAI. They should mention: how they used to spend hours measuring by hand, discovered RoofReporterAI, and now save time and money. Key benefits to highlight: accuracy, speed, professional reports they can show clients, and the ability to order from anywhere. The tone should be authentic and conversational. 60 seconds, landscape format.",
    how_it_works: "Create a step-by-step 'How It Works' explainer video for RoofReporterAI. Step 1: Enter the property address. Step 2: Our AI analyzes satellite imagery. Step 3: Receive your professional roof measurement report in minutes. Explain what's included in the report: area in square feet, pitch analysis, edge measurements, architectural diagram, and waste calculations. The presenter should be professional and clear. Use text overlays for each step number. 90 seconds, landscape format.",
    pricing_explainer: "Create a friendly pricing explainer video for RoofReporterAI. Explain the credit-based system: buy credit packs at volume discounts, each report costs credits. Compare to manual measurement costs (hiring someone at $100-200+ per roof vs our $15-25 per report). Highlight the value proposition: instant delivery, professional quality, no site visit needed. Mention enterprise packages for high-volume users. The tone should be transparent and value-focused. 60 seconds.",
    before_after: "Create a compelling before-and-after comparison video for RoofReporterAI. 'Before' side: A contractor climbing a ladder with a tape measure, spending hours in the sun, doing manual calculations, risking mistakes. 'After' side: Same contractor at their desk, ordering a report on RoofReporterAI, receiving a professional PDF in minutes, accurately quoting the job. The message: Stop wasting time and risking safety — let AI do the measuring. 45 seconds, landscape.",
  };

  window._hgFillPreset = function(key) {
    const p = SCRIPT_PRESETS[key];
    if (!p) return;
    const t = document.getElementById('hg-title');
    const c = document.getElementById('hg-category');
    const s = document.getElementById('hg-script');
    if (t) t.value = p.title;
    if (c) c.value = p.category;
    if (s) s.value = p.script;
  };

  window._hgFillAgentPreset = function(key) {
    const p = AGENT_PRESETS[key];
    if (!p) return;
    const t = document.getElementById('hg-agent-title');
    const pr = document.getElementById('hg-agent-prompt');
    if (t) t.value = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' — RoofReporterAI';
    if (pr) pr.value = p;
  };

  window._hgPreviewAvatar = function() {
    const sel = document.getElementById('hg-avatar');
    const prev = document.getElementById('hg-avatar-preview');
    if (!sel || !prev) return;
    const opt = sel.options[sel.selectedIndex];
    const img = opt?.dataset?.img;
    if (img) {
      prev.innerHTML = `<img src="${img}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #7c3aed">`;
    } else {
      prev.innerHTML = '';
    }
  };

  window._hgApplyTemplate = function() {
    const sel = document.getElementById('hg-template');
    if (!sel) return;
    const id = parseInt(sel.value);
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const title = document.getElementById('hg-title');
    const script = document.getElementById('hg-script');
    const cat = document.getElementById('hg-category');
    if (title && tpl.name) title.value = tpl.name;
    if (script && tpl.script_template) script.value = tpl.script_template;
    if (cat && tpl.category) cat.value = tpl.category;
  };

  window._hgUseTemplate = function(id) {
    window._hgTab('create');
    setTimeout(() => {
      const sel = document.getElementById('hg-template');
      if (sel) { sel.value = id; window._hgApplyTemplate(); }
    }, 500);
  };

  // Generate video via Studio Create
  window._hgGenerate = async function() {
    const btn = document.getElementById('hg-gen-btn');
    const status = document.getElementById('hg-gen-status');
    const title = document.getElementById('hg-title')?.value?.trim();
    const script = document.getElementById('hg-script')?.value?.trim();
    const avatarSel = document.getElementById('hg-avatar');
    const voiceSel = document.getElementById('hg-voice');

    if (!title || !script) { status.innerHTML = msg('Title and script are required', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    status.innerHTML = msg('Submitting to HeyGen...', 'info');

    try {
      const aspectMap = { '16:9': '1920x1080', '9:16': '1080x1920', '1:1': '1080x1080' };
      const aspect = document.getElementById('hg-aspect')?.value || '16:9';
      const resp = await fetch(API + '/generate', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          title,
          category: document.getElementById('hg-category')?.value || 'marketing',
          avatar_id: avatarSel?.value,
          avatar_name: avatarSel?.options[avatarSel.selectedIndex]?.dataset?.name || '',
          voice_id: voiceSel?.value,
          voice_name: voiceSel?.options[voiceSel.selectedIndex]?.dataset?.name || '',
          script,
          dimension: aspectMap[aspect] || '1920x1080',
          aspect_ratio: aspect,
          background_color: document.getElementById('hg-bg-color')?.value || '#ffffff',
          template_id: parseInt(document.getElementById('hg-template')?.value) || null,
        })
      });
      const data = await resp.json();
      if (data.success) {
        status.innerHTML = msg('Video generation started! ID: <strong>' + data.video_id + '</strong>. Polling for status...', 'success');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail || data)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-video" style="margin-right:6px"></i>Generate Video';
  };

  // Generate video via Agent
  window._hgGenerateAgent = async function() {
    const btn = document.getElementById('hg-agent-btn');
    const status = document.getElementById('hg-agent-status');
    const title = document.getElementById('hg-agent-title')?.value?.trim();
    const prompt = document.getElementById('hg-agent-prompt')?.value?.trim();

    if (!title || !prompt) { status.innerHTML = msg('Title and prompt are required', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
      const resp = await fetch(API + '/generate-agent', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          title, prompt,
          category: document.getElementById('hg-agent-cat')?.value || 'marketing',
          aspect_ratio: document.getElementById('hg-agent-aspect')?.value || '16:9',
        })
      });
      const data = await resp.json();
      if (data.success) {
        status.innerHTML = msg('Video Agent started! ID: <strong>' + data.video_id + '</strong>. This typically takes 3-8 minutes.', 'success');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail || data)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot" style="margin-right:6px"></i>Generate with AI Agent';
  };

  // Generate tutorial video
  window._hgGenerateTutorial = async function() {
    const btn = document.getElementById('hg-tut-btn');
    const status = document.getElementById('hg-tut-status');
    const title = document.getElementById('hg-tut-title')?.value?.trim();
    const script = document.getElementById('hg-tut-script')?.value?.trim();

    if (!title || !script) { status.innerHTML = msg('Title and script are required', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
      // Use video agent for tutorials
      const resp = await fetch(API + '/generate-agent', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          title: title,
          prompt: 'Create a professional how-to tutorial video for RoofReporterAI. Use the following script exactly as written. Present it clearly with a friendly, professional tone. Add text overlays for key points. Script: ' + script,
          category: 'training',
          aspect_ratio: document.getElementById('hg-tut-aspect')?.value || '16:9',
        })
      });
      const data = await resp.json();
      if (data.success) {
        status.innerHTML = msg('Tutorial video started! ID: <strong>' + data.video_id + '</strong>', 'success');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail || data)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-graduation-cap" style="margin-right:6px"></i>Generate Custom Tutorial';
  };

  // Generate tutorial from preset card
  window._hgGeneratePresetTutorial = async function(key) {
    var scripts = {
      getting_started: { title: 'Getting Started with RoofReporterAI' },
      reading_report: { title: 'How to Read Your Roof Report' },
      ordering_process: { title: 'How to Order a Roof Report' },
      crm_features: { title: 'Using the Built-In CRM' },
      d2d_sales: { title: 'Door-to-Door Sales Module' },
      secretary_setup: { title: 'Setting Up Your AI Secretary' },
    };
    var info = scripts[key];
    if (!info) return;

    // Get the script from the card's data
    var card = document.querySelector('[data-tutorial="' + key + '"]');
    var script = card?.dataset?.script || '';
    if (!script) { alert('Script not found'); return; }

    var btn = card?.querySelector('.hg-tut-card-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'; }

    try {
      var resp = await fetch(API + '/generate-agent', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          title: info.title,
          prompt: 'Create a professional how-to tutorial video for RoofReporterAI. Present this script clearly with a friendly, professional presenter. Add text overlays for key points and steps. Script: ' + script,
          category: 'training',
          aspect_ratio: '16:9',
        })
      });
      var data = await resp.json();
      if (data.success) {
        showNotification('Tutorial Started!', info.title + ' — Video ID: ' + data.video_id, 'success');
        startPolling(data.video_id);
      } else {
        showNotification('Generation Failed', data.error || 'Unknown error', 'error');
      }
    } catch(e) {
      showNotification('Error', e.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-video" style="margin-right:4px"></i>Generate'; }
  };

  // Report video generation
  window._hgGenerateReportVideo = async function() {
    const btn = document.getElementById('hg-rv-btn');
    const status = document.getElementById('hg-rv-status');
    const orderId = document.getElementById('hg-rv-order')?.value?.trim();
    const avatarSel = document.getElementById('hg-rv-avatar');
    const voiceSel = document.getElementById('hg-rv-voice');

    if (!orderId) { status.innerHTML = msg('Order ID is required', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
      const resp = await fetch(API + '/report-video/' + orderId, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          avatar_id: avatarSel?.value,
          avatar_name: avatarSel?.options[avatarSel.selectedIndex]?.dataset?.name || '',
          voice_id: voiceSel?.value,
          voice_name: voiceSel?.options[voiceSel.selectedIndex]?.dataset?.name || '',
          custom_script: document.getElementById('hg-rv-script')?.value?.trim() || '',
        })
      });
      const data = await resp.json();
      if (data.success) {
        status.innerHTML = msg('Report video started! ID: <strong>' + data.video_id + '</strong>', 'success') +
          (data.script_used ? '<div style="margin-top:8px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534;max-height:100px;overflow-y:auto"><strong>Script:</strong> ' + data.script_used + '</div>' : '');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail || data)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-video" style="margin-right:6px"></i>Generate Report Walkthrough Video';
  };

  // Status polling
  window._hgPollStatus = async function(videoId) {
    try {
      const data = await hgFetch(API + '/status/' + videoId);
      if (data.status === 'completed' && data.video_url) {
        showNotification('Video Ready!', 'Your video is complete. Check the Videos tab.', 'success');
        switchTab(currentTab);
      } else if (data.status === 'failed') {
        showNotification('Video Failed', data.raw?.error || 'Unknown error', 'error');
        switchTab(currentTab);
      } else {
        showNotification('Processing', 'Status: ' + data.status + ' — still generating...', 'info');
      }
    } catch (e) { showNotification('Error', e.message, 'error'); }
  };

  window._hgDeleteVideo = async function(id) {
    if (!confirm('Delete this video record?')) return;
    await fetch(API + '/videos/' + id, { method: 'DELETE', headers: hdrs() });
    switchTab('videos');
  };

  window._hgShowNewTemplate = function() {
    const form = document.getElementById('hg-new-template-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window._hgSaveTemplate = async function() {
    const name = document.getElementById('hg-tpl-name')?.value?.trim();
    if (!name) return alert('Template name is required');
    await fetch(API + '/templates', {
      method: 'POST', headers: hdrs(),
      body: JSON.stringify({
        name,
        category: document.getElementById('hg-tpl-cat')?.value || 'marketing',
        script_template: document.getElementById('hg-tpl-script')?.value || '',
      })
    });
    switchTab('templates');
  };

  window._hgDeleteTemplate = async function(id) {
    if (!confirm('Delete this template?')) return;
    await fetch(API + '/templates/' + id, { method: 'DELETE', headers: hdrs() });
    switchTab('templates');
  };

  // ============================================================
  // POLLING — auto-check video status
  // ============================================================
  function startPolling(videoId) {
    if (pollingIntervals[videoId]) return;
    let attempts = 0;
    pollingIntervals[videoId] = setInterval(async () => {
      attempts++;
      if (attempts > 60) { clearInterval(pollingIntervals[videoId]); delete pollingIntervals[videoId]; return; }
      try {
        const data = await hgFetch(API + '/status/' + videoId);
        if (data.status === 'completed') {
          clearInterval(pollingIntervals[videoId]); delete pollingIntervals[videoId];
          const preview = document.getElementById('hg-video-preview');
          if (preview && data.video_url) {
            preview.innerHTML = '<video controls style="max-width:100%;border-radius:8px" src="' + data.video_url + '"></video>';
          }
          showNotification('Video Ready!', 'Your HeyGen video has been generated successfully.', 'success');
        } else if (data.status === 'failed') {
          clearInterval(pollingIntervals[videoId]); delete pollingIntervals[videoId];
          showNotification('Video Failed', 'Generation failed. Check the videos tab for details.', 'error');
        }
      } catch (e) { /* retry silently */ }
    }, 10000);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function statCard(label, value, icon, color, bg) {
    return `<div style="background:${bg};border:1px solid ${color}22;border-radius:12px;padding:18px;text-align:center">
      <i class="fas ${icon}" style="font-size:20px;color:${color};margin-bottom:6px;display:block"></i>
      <div style="font-size:26px;font-weight:900;color:${color}">${value}</div>
      <div style="font-size:11px;color:${color};font-weight:600;opacity:0.8">${label}</div>
    </div>`;
  }

  function statusStyle(status) {
    const m = {
      completed: 'background:#ecfdf5;color:#059669',
      processing: 'background:#fffbeb;color:#d97706',
      pending: 'background:#f1f5f9;color:#475569',
      failed: 'background:#fef2f2;color:#dc2626',
    };
    return m[status] || m.pending;
  }

  function msg(text, type) {
    const bg = { success: '#ecfdf5', error: '#fef2f2', info: '#eff6ff' };
    const clr = { success: '#059669', error: '#dc2626', info: '#2563eb' };
    const icon = { success: 'fa-check-circle', error: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    return '<div style="padding:10px 14px;background:' + bg[type] + ';color:' + clr[type] + ';border-radius:8px;font-size:12px"><i class="fas ' + icon[type] + '" style="margin-right:4px"></i>' + text + '</div>';
  }

  function errBox(message) {
    return '<div style="padding:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;color:#dc2626;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:24px;margin-bottom:8px;display:block"></i><p style="font-weight:600;margin-bottom:4px">Error</p><p style="font-size:13px">' + message + '</p></div>';
  }

  function tutorialCard(key, icon, color, title, desc, script) {
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:flex;flex-direction:column" data-tutorial="${key}" data-script="${script.replace(/"/g, '&quot;')}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;background:${color}20;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${icon}" style="color:${color};font-size:14px"></i></div>
        <h4 style="font-size:14px;font-weight:700;color:#1e293b;margin:0">${title}</h4>
      </div>
      <p style="font-size:12px;color:#64748b;margin:0 0 12px 0;flex:1">${desc}</p>
      <div style="display:flex;gap:8px">
        <button class="hg-tut-card-btn" onclick="window._hgGeneratePresetTutorial('${key}')" style="padding:6px 14px;background:${color};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;flex:1"><i class="fas fa-video" style="margin-right:4px"></i>Generate</button>
        <button onclick="document.getElementById('hg-tut-title').value='${title.replace(/'/g, "\\'")}';document.getElementById('hg-tut-script').value=this.closest('[data-tutorial]').dataset.script;document.getElementById('hg-tut-script').scrollIntoView({behavior:'smooth'})" style="padding:6px 14px;background:#f1f5f9;color:#475569;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer"><i class="fas fa-edit" style="margin-right:4px"></i>Edit</button>
      </div>
    </div>`;
  }

  function agentPresetBtn(key, icon, color, title, desc) {
    return `<button onclick="window._hgFillAgentPreset('${key}')" style="text-align:left;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all .15s" onmouseover="this.style.borderColor='#${color === 'purple' ? '7c3aed' : color === 'pink' ? 'ec4899' : color === 'yellow' ? 'f59e0b' : color === 'blue' ? '3b82f6' : color === 'green' ? '059669' : 'f97316'}'" onmouseout="this.style.borderColor='#e2e8f0'">
      <i class="${icon.includes('fab') ? icon : 'fas ' + icon}" style="font-size:14px;color:#64748b;width:18px;text-align:center"></i>
      <div>
        <div style="font-size:12px;font-weight:700;color:#1e293b">${title}</div>
        <div style="font-size:10px;color:#94a3b8">${desc}</div>
      </div>
    </button>`;
  }

  function showNotification(title, message, type) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 20px;border-radius:12px;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.15);max-width:360px;transition:all .3s ease;transform:translateX(100%)';
    div.style.background = type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#2563eb';
    div.style.color = '#fff';
    div.innerHTML = '<div style="font-weight:700;font-size:14px;margin-bottom:2px">' + title + '</div><div style="font-size:12px;opacity:0.9">' + message + '</div>';
    document.body.appendChild(div);
    requestAnimationFrame(() => { div.style.transform = 'translateX(0)'; });
    setTimeout(() => { div.style.transform = 'translateX(100%)'; setTimeout(() => div.remove(), 300); }, 5000);
  }

})();
