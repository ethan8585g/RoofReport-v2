// ============================================================
// HeyGen AI Video Studio — Super Admin Dashboard Module
// Marketing Video Generation + Report Video Walkthroughs
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
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:10px;display:flex;align-items:center;justify-content:center">
          <i class="fas fa-video" style="color:#fff;font-size:20px"></i>
        </div>
        <div>
          <h2 style="margin:0;font-size:22px;font-weight:800;color:#1a1a2e">HeyGen Video Studio</h2>
          <p style="margin:0;font-size:13px;color:#64748b">AI Avatar Marketing Videos & Report Walkthroughs</p>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid #e2e8f0;padding-bottom:0">
        ${['overview','create','agent','report-video','videos','templates'].map(t => {
          const labels = { overview:'Overview', create:'Studio Create', agent:'Video Agent', 'report-video':'Report Videos', videos:'My Videos', templates:'Templates' };
          const icons = { overview:'fa-chart-bar', create:'fa-magic', agent:'fa-robot', 'report-video':'fa-file-video', videos:'fa-film', templates:'fa-clone' };
          return `<button onclick="window._hgTab('${t}')" id="hg-tab-${t}" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#64748b;transition:all .2s">
            <i class="fas ${icons[t]} " style="margin-right:6px"></i>${labels[t]}
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
    el.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#7c3aed"></i></div>';
    try {
      if (tab === 'overview') await renderOverview(el);
      else if (tab === 'create') await renderStudioCreate(el);
      else if (tab === 'agent') await renderVideoAgent(el);
      else if (tab === 'report-video') await renderReportVideo(el);
      else if (tab === 'videos') await renderVideosList(el);
      else if (tab === 'templates') await renderTemplates(el);
    } catch (e) {
      el.innerHTML = `<div style="padding:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626"><i class="fas fa-exclamation-triangle"></i> Error: ${e.message}</div>`;
    }
  }

  // ============================================================
  // OVERVIEW TAB
  // ============================================================
  async function renderOverview(el) {
    const resp = await fetch(API + '/dashboard', { headers: hdrs() });
    const data = await resp.json();

    if (!data.api_configured) {
      el.innerHTML = `
      <div style="padding:30px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:12px;text-align:center">
        <i class="fas fa-key" style="font-size:36px;color:#d97706;margin-bottom:12px"></i>
        <h3 style="color:#92400e;margin-bottom:8px">HeyGen API Key Required</h3>
        <p style="color:#a16207;font-size:14px;margin-bottom:16px">Add your HeyGen API key to start generating AI avatar videos.</p>
        <code style="background:#fff;padding:8px 16px;border-radius:6px;font-size:12px;display:block;margin:0 auto;max-width:600px;text-align:left">
          wrangler pages secret put HEYGEN_API_KEY --project-name roofing-measurement-tool
        </code>
        <p style="color:#a16207;font-size:12px;margin-top:12px">Get your API key at: <a href="https://app.heygen.com/settings?nav=API" target="_blank" style="color:#7c3aed;font-weight:600">app.heygen.com/settings</a></p>
      </div>`;
      return;
    }

    const s = data.stats;
    el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      ${statCard('Total Videos', s.total, 'fa-video', '#7c3aed', '#f5f3ff')}
      ${statCard('Completed', s.completed, 'fa-check-circle', '#059669', '#ecfdf5')}
      ${statCard('Processing', s.processing, 'fa-spinner fa-spin', '#d97706', '#fffbeb')}
      ${statCard('Failed', s.failed, 'fa-times-circle', '#dc2626', '#fef2f2')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- Recent Videos -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-clock" style="color:#7c3aed;margin-right:6px"></i>Recent Videos</h3>
        ${data.recent_videos.length === 0 ? '<p style="color:#94a3b8;font-size:13px">No videos yet. Create your first video!</p>' :
          data.recent_videos.map(v => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <div style="width:48px;height:28px;background:#1a2332;border-radius:4px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
              ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-film" style="color:#475569;font-size:10px"></i>'}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
              <div style="font-size:10px;color:#94a3b8">${v.category} &bull; ${new Date(v.created_at).toLocaleDateString()}</div>
            </div>
            <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;${statusStyle(v.status)}">${v.status}</span>
          </div>`).join('')}
      </div>

      <!-- Saved Templates -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px"><i class="fas fa-clone" style="color:#a855f7;margin-right:6px"></i>Templates</h3>
        ${data.templates.length === 0 ? '<p style="color:#94a3b8;font-size:13px">No templates yet.</p>' :
          data.templates.map(t => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <div>
              <div style="font-size:12px;font-weight:600;color:#1e293b">${t.name}</div>
              <div style="font-size:10px;color:#94a3b8">${t.category} &bull; Used ${t.usage_count}x</div>
            </div>
            <button onclick="window._hgUseTemplate(${t.id})" style="padding:4px 10px;font-size:11px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer">Use</button>
          </div>`).join('')}
      </div>
    </div>

    <!-- Quick Actions -->
    <div style="margin-top:20px;display:flex;gap:12px">
      <button onclick="window._hgTab('create')" style="padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;flex:1">
        <i class="fas fa-magic" style="margin-right:6px"></i>Create Marketing Video
      </button>
      <button onclick="window._hgTab('agent')" style="padding:12px 24px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;flex:1">
        <i class="fas fa-robot" style="margin-right:6px"></i>Video Agent (Prompt)
      </button>
      <button onclick="window._hgTab('report-video')" style="padding:12px 24px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;flex:1">
        <i class="fas fa-file-video" style="margin-right:6px"></i>Report Walkthrough
      </button>
    </div>`;
  }

  // ============================================================
  // STUDIO CREATE TAB — Full avatar+voice video creation
  // ============================================================
  async function renderStudioCreate(el) {
    el.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#7c3aed"></i> Loading avatars & voices...</div>';

    // Load avatars & voices in parallel
    try {
      const [aResp, vResp, tResp] = await Promise.all([
        fetch(API + '/avatars', { headers: hdrs() }),
        fetch(API + '/voices', { headers: hdrs() }),
        fetch(API + '/templates', { headers: hdrs() }),
      ]);
      const aData = await aResp.json();
      const vData = await vResp.json();
      const tData = await tResp.json();
      avatars = aData.avatars || [];
      voices = vData.voices || [];
      templates = tData.templates || [];
    } catch (e) {
      el.innerHTML = `<div style="padding:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626"><i class="fas fa-exclamation-triangle"></i> Failed to load HeyGen data: ${e.message}. Make sure HEYGEN_API_KEY is configured.</div>`;
      return;
    }

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- LEFT: Form -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-magic" style="color:#7c3aed;margin-right:6px"></i>Create Video</h3>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Video Title</label>
        <input id="hg-title" type="text" placeholder="e.g. RoofReporterAI Product Demo" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Category</label>
        <select id="hg-category" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">
          <option value="marketing">Marketing</option>
          <option value="social">Social Media Ad</option>
          <option value="training">Training</option>
          <option value="ad">Advertisement</option>
          <option value="report_walkthrough">Report Walkthrough</option>
        </select>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Template (optional)</label>
        <select id="hg-template" onchange="window._hgApplyTemplate()" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">
          <option value="">— No Template —</option>
          ${templates.map(t => `<option value="${t.id}">${t.name} (${t.category})</option>`).join('')}
        </select>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Avatar</label>
        <select id="hg-avatar" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">
          ${avatars.slice(0, 50).map(a => `<option value="${a.avatar_id}" data-name="${a.avatar_name}">${a.avatar_name} (${a.gender || 'N/A'})</option>`).join('')}
        </select>
        <div id="hg-avatar-preview" style="margin-bottom:12px"></div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Voice</label>
        <select id="hg-voice" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:4px">
          ${voices.filter(v => v.language && v.language.toLowerCase().includes('en')).slice(0, 50).map(v => `<option value="${v.voice_id}" data-name="${v.name}">${v.name} (${v.language || ''}, ${v.gender || ''})</option>`).join('')}
        </select>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:12px">${voices.length} voices available (showing English)</div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Script</label>
        <textarea id="hg-script" rows="8" placeholder="Enter the text the avatar will speak..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px"></textarea>

        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Aspect Ratio</label>
            <select id="hg-aspect" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="16:9" selected>16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait / TikTok)</option>
              <option value="1:1">1:1 (Square / Instagram)</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Background</label>
            <input id="hg-bg-color" type="color" value="#ffffff" style="width:100%;height:36px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">
          </div>
        </div>

        <button onclick="window._hgGenerate()" id="hg-gen-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
          <i class="fas fa-video" style="margin-right:6px"></i>Generate Video
        </button>
        <div id="hg-gen-status" style="margin-top:10px"></div>
      </div>

      <!-- RIGHT: Preview & Info -->
      <div>
        <div style="background:#1a2332;border-radius:10px;padding:24px;text-align:center;margin-bottom:16px;min-height:300px;display:flex;align-items:center;justify-content:center">
          <div id="hg-video-preview" style="color:#64748b;font-size:14px">
            <i class="fas fa-play-circle" style="font-size:48px;color:#475569;margin-bottom:12px;display:block"></i>
            Video preview will appear here after generation
          </div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px">
          <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px"><i class="fas fa-info-circle" style="color:#3b82f6;margin-right:4px"></i>Tips</h4>
          <ul style="font-size:12px;color:#64748b;line-height:1.8;padding-left:16px;margin:0">
            <li>Keep scripts under 2 minutes for best quality</li>
            <li>Use clear, conversational language</li>
            <li>Pick a voice that matches your brand</li>
            <li>16:9 for YouTube/web, 9:16 for TikTok/Reels</li>
            <li>Videos typically take 2-5 minutes to generate</li>
          </ul>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // VIDEO AGENT TAB — Prompt-to-video
  // ============================================================
  async function renderVideoAgent(el) {
    el.innerHTML = `
    <div style="max-width:700px;margin:0 auto">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:24px">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px"><i class="fas fa-robot" style="color:#2563eb;margin-right:6px"></i>Video Agent — Prompt to Video</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:16px">Describe the video you want and HeyGen's AI agent will select the best avatar, voice, and style automatically.</p>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Video Title</label>
        <input id="hg-agent-title" type="text" placeholder="e.g. Roof Measurement Service Ad" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Prompt</label>
        <textarea id="hg-agent-prompt" rows="8" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px" placeholder="Example: Create a professional 30-second marketing video for Roof Reporter AI, a Canadian AI-powered roof measurement tool. The presenter should be a professional-looking person in business attire. They should explain how homeowners can get instant, accurate roof measurements using satellite imagery and AI. Include text overlays showing key features. End with a call to action to visit roofreporterai.com."></textarea>

        <div style="display:flex;gap:12px;margin-bottom:16px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Aspect Ratio</label>
            <select id="hg-agent-aspect" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="16:9" selected>16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Category</label>
            <select id="hg-agent-cat" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="marketing">Marketing</option>
              <option value="social">Social Media</option>
              <option value="ad">Advertisement</option>
              <option value="training">Training</option>
            </select>
          </div>
        </div>

        <button onclick="window._hgGenerateAgent()" id="hg-agent-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
          <i class="fas fa-robot" style="margin-right:6px"></i>Generate with AI Agent
        </button>
        <div id="hg-agent-status" style="margin-top:10px"></div>
      </div>
    </div>`;
  }

  // ============================================================
  // REPORT VIDEO TAB
  // ============================================================
  async function renderReportVideo(el) {
    el.innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #a7f3d0;border-radius:10px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#065f46;margin-bottom:6px"><i class="fas fa-file-video" style="margin-right:6px"></i>Report Video Walkthrough</h3>
        <p style="font-size:13px;color:#047857">Generate a personalized AI avatar video that walks your client through their roof measurement report. The video automatically includes their property address, total squares, pitch, and key measurements.</p>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px">
        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Order ID</label>
        <input id="hg-rv-order" type="number" placeholder="e.g. 67" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">

        <div id="hg-rv-avatars" style="margin-bottom:12px">
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Avatar</label>
          <select id="hg-rv-avatar" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            <option value="">Loading avatars...</option>
          </select>
        </div>

        <div id="hg-rv-voices" style="margin-bottom:12px">
          <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Voice</label>
          <select id="hg-rv-voice" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            <option value="">Loading voices...</option>
          </select>
        </div>

        <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Custom Script (optional — leave blank for auto-generated)</label>
        <textarea id="hg-rv-script" rows="6" placeholder="Leave empty to auto-generate based on report data. Or enter a custom script..." style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:12px"></textarea>

        <button onclick="window._hgGenerateReportVideo()" id="hg-rv-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
          <i class="fas fa-file-video" style="margin-right:6px"></i>Generate Report Walkthrough Video
        </button>
        <div id="hg-rv-status" style="margin-top:10px"></div>
      </div>
    </div>`;

    // Load avatars & voices for report tab
    try {
      if (avatars.length === 0) {
        const [aResp, vResp] = await Promise.all([
          fetch(API + '/avatars', { headers: hdrs() }),
          fetch(API + '/voices', { headers: hdrs() }),
        ]);
        avatars = (await aResp.json()).avatars || [];
        voices = (await vResp.json()).voices || [];
      }
      const avatarSel = document.getElementById('hg-rv-avatar');
      const voiceSel = document.getElementById('hg-rv-voice');
      if (avatarSel) avatarSel.innerHTML = avatars.slice(0, 50).map(a => `<option value="${a.avatar_id}" data-name="${a.avatar_name}">${a.avatar_name} (${a.gender || ''})</option>`).join('');
      if (voiceSel) voiceSel.innerHTML = voices.filter(v => v.language && v.language.toLowerCase().includes('en')).slice(0, 50).map(v => `<option value="${v.voice_id}" data-name="${v.name}">${v.name} (${v.language || ''})</option>`).join('');
    } catch (e) { console.warn('Failed to load avatars/voices for report tab', e); }
  }

  // ============================================================
  // VIDEOS LIST TAB
  // ============================================================
  async function renderVideosList(el) {
    const resp = await fetch(API + '/videos?limit=50', { headers: hdrs() });
    const data = await resp.json();
    const videos = data.videos || [];

    if (videos.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-film" style="font-size:36px;margin-bottom:12px;display:block"></i>No videos generated yet</div>';
      return;
    }

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
      ${videos.map(v => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <div style="height:180px;background:#1a2332;display:flex;align-items:center;justify-content:center;position:relative">
          ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-film" style="font-size:36px;color:#475569"></i>'}
          ${v.video_url ? `<a href="${v.video_url}" target="_blank" style="position:absolute;width:48px;height:48px;background:rgba(124,58,237,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none"><i class="fas fa-play" style="color:#fff;font-size:18px;margin-left:2px"></i></a>` : ''}
          <span style="position:absolute;top:8px;right:8px;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;${statusStyle(v.status)}">${v.status}</span>
        </div>
        <div style="padding:12px">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">
            ${v.category} &bull; ${v.avatar_name || 'N/A'} &bull; ${v.duration_seconds ? Math.round(v.duration_seconds) + 's' : 'N/A'}
          </div>
          <div style="display:flex;gap:6px">
            ${v.status === 'processing' ? `<button onclick="window._hgPollStatus('${v.video_id}')" style="flex:1;padding:6px;font-size:11px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;cursor:pointer"><i class="fas fa-sync"></i> Check Status</button>` : ''}
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
    const resp = await fetch(API + '/templates', { headers: hdrs() });
    const data = await resp.json();
    const tmpls = data.templates || [];

    el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700;color:#1e293b">Video Templates</h3>
      <button onclick="window._hgShowNewTemplate()" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer"><i class="fas fa-plus" style="margin-right:4px"></i>New Template</button>
    </div>
    <div id="hg-new-template-form" style="display:none;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <input id="hg-tpl-name" placeholder="Template name" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        <select id="hg-tpl-cat" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="marketing">Marketing</option><option value="social">Social</option><option value="training">Training</option><option value="ad">Ad</option><option value="report_walkthrough">Report</option>
        </select>
      </div>
      <textarea id="hg-tpl-script" rows="4" placeholder="Script template (use {{address}}, {{total_squares}}, {{pitch}} as placeholders)" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px"></textarea>
      <button onclick="window._hgSaveTemplate()" style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Save Template</button>
    </div>
    ${tmpls.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:20px">No templates yet.</p>' :
      `<div style="display:grid;gap:12px">${tmpls.map(t => `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:#1e293b">${t.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${t.category} &bull; Used ${t.usage_count}x${t.description ? ' &bull; ' + t.description : ''}</div>
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
        status.innerHTML = msg(`Video generation started! ID: <strong>${data.video_id}</strong>. Polling for status...`, 'success');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-video" style="margin-right:6px"></i>Generate Video';
  };

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
        status.innerHTML = msg(`Video Agent started! ID: <strong>${data.video_id}</strong>. Polling...`, 'success');
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot" style="margin-right:6px"></i>Generate with AI Agent';
  };

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
        status.innerHTML = msg(`Report video started! ID: <strong>${data.video_id}</strong>`, 'success') +
          `<div style="margin-top:8px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534"><strong>Script used:</strong><br>${data.script_used}</div>`;
        startPolling(data.video_id);
      } else {
        status.innerHTML = msg('Failed: ' + (data.error || JSON.stringify(data.detail)), 'error');
      }
    } catch (e) {
      status.innerHTML = msg('Error: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-video" style="margin-right:6px"></i>Generate Report Walkthrough Video';
  };

  window._hgPollStatus = async function(videoId) {
    try {
      const resp = await fetch(API + '/status/' + videoId, { headers: hdrs() });
      const data = await resp.json();
      if (data.status === 'completed' && data.video_url) {
        alert('Video completed! URL: ' + data.video_url);
        switchTab(currentTab);
      } else if (data.status === 'failed') {
        alert('Video failed: ' + (data.raw?.error || 'Unknown error'));
        switchTab(currentTab);
      } else {
        alert('Status: ' + data.status + ' (still processing)');
      }
    } catch (e) { alert('Error checking status: ' + e.message); }
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
        const resp = await fetch(API + '/status/' + videoId, { headers: hdrs() });
        const data = await resp.json();
        if (data.status === 'completed') {
          clearInterval(pollingIntervals[videoId]); delete pollingIntervals[videoId];
          const preview = document.getElementById('hg-video-preview');
          if (preview && data.video_url) {
            preview.innerHTML = `<video controls style="max-width:100%;border-radius:8px" src="${data.video_url}"></video>`;
          }
          // Show notification
          showNotification('Video Ready!', 'Your HeyGen video has been generated successfully.', 'success');
        } else if (data.status === 'failed') {
          clearInterval(pollingIntervals[videoId]); delete pollingIntervals[videoId];
          showNotification('Video Failed', 'Generation failed. Check the videos tab for details.', 'error');
        }
      } catch (e) { /* retry */ }
    }, 10000); // poll every 10s
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function statCard(label, value, icon, color, bg) {
    return `<div style="background:${bg};border:1px solid ${color}22;border-radius:10px;padding:16px;text-align:center">
      <i class="fas ${icon}" style="font-size:20px;color:${color};margin-bottom:6px;display:block"></i>
      <div style="font-size:24px;font-weight:900;color:${color}">${value}</div>
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
    return `<div style="padding:8px 12px;background:${bg[type]};color:${clr[type]};border-radius:6px;font-size:12px"><i class="fas ${icon[type]}" style="margin-right:4px"></i>${text}</div>`;
  }

  function showNotification(title, message, type) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 20px;border-radius:10px;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.15);max-width:360px;animation:slideIn .3s ease';
    div.style.background = type === 'success' ? '#059669' : '#dc2626';
    div.style.color = '#fff';
    div.innerHTML = `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${title}</div><div style="font-size:12px;opacity:0.9">${message}</div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 6000);
  }

})();
