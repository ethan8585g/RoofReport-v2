// ============================================================
// RoofReporterAI — Sales Call Center Dashboard
// Super Admin only — AI outbound dialer for selling RoofReporterAI
// to roofing companies across North America
// ============================================================

(function() {
  'use strict';

  const CC = {
    tab: 'overview',
    data: {},
    loading: false,
    dialerRunning: false,
    selectedCampaign: null,
    prospectPage: 1,
    callLogPage: 1,
  };

  // Expose to super-admin-dashboard.js
  window.loadCallCenter = function() {
    const root = document.getElementById('sa-root');
    if (!root) return;
    root.innerHTML = renderCallCenterShell();
    ccLoadTab('overview');
  };

  function ccHeaders() {
    const token = localStorage.getItem('rc_token');
    return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  async function ccFetch(url, opts) {
    try {
      const res = await fetch(url, Object.assign({ headers: ccHeaders() }, opts || {}));
      if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return null; }
      return await res.json();
    } catch (e) { console.error('CC fetch error:', e); return null; }
  }

  // ============================================================
  // SHELL & TABS
  // ============================================================
  function renderCallCenterShell() {
    return `<div class="slide-in" id="cc-root">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-black text-gray-900 flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
              <i class="fas fa-headset text-white"></i>
            </div>
            AI Sales Call Center
          </h2>
          <p class="text-sm text-gray-500 mt-1">Outbound AI dialer — selling RoofReporterAI to roofing companies across North America</p>
        </div>
        <div class="flex gap-2">
          <span id="cc-dialer-status" class="px-3 py-1.5 rounded-full text-xs font-bold ${CC.dialerRunning ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-500'}">
            <i class="fas fa-${CC.dialerRunning ? 'phone-volume' : 'pause'} mr-1"></i>${CC.dialerRunning ? 'DIALING' : 'IDLE'}
          </span>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        ${['overview','agents','contact-lists','campaigns','prospects','call-logs','deploy'].map(t => 
          `<button onclick="window.ccSetTab('${t}')" id="cc-tab-${t}" class="cc-tab px-4 py-2 rounded-lg text-sm font-medium transition-all ${CC.tab===t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
            <i class="fas fa-${t==='overview'?'chart-pie':t==='agents'?'robot':t==='contact-lists'?'address-book':t==='campaigns'?'bullhorn':t==='prospects'?'building':t==='call-logs'?'list-alt':t==='deploy'?'rocket':'circle'} mr-1.5"></i>
            ${t==='overview'?'Overview':t==='agents'?'AI Agents':t==='contact-lists'?'Contact Lists':t==='campaigns'?'Campaigns':t==='prospects'?'Prospects':t==='call-logs'?'Call Logs':t==='deploy'?'Deploy':''}  
          </button>`
        ).join('')}
      </div>

      <div id="cc-content">
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
        </div>
      </div>
    </div>`;
  }

  window.ccSetTab = function(tab) {
    CC.tab = tab;
    document.querySelectorAll('.cc-tab').forEach(el => {
      el.classList.remove('bg-white', 'text-gray-900', 'shadow-sm');
      el.classList.add('text-gray-500');
    });
    const active = document.getElementById('cc-tab-' + tab);
    if (active) { active.classList.add('bg-white', 'text-gray-900', 'shadow-sm'); active.classList.remove('text-gray-500'); }
    ccLoadTab(tab);
  };

  async function ccLoadTab(tab) {
    CC.loading = true;
    const content = document.getElementById('cc-content');
    if (content) content.innerHTML = '<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div></div>';

    switch (tab) {
      case 'overview':
        CC.data.dashboard = await ccFetch('/api/call-center/dashboard');
        break;
      case 'agents':
        CC.data.agents = await ccFetch('/api/call-center/agents');
        break;
      case 'campaigns':
        CC.data.campaigns = await ccFetch('/api/call-center/campaigns');
        break;
      case 'prospects':
        CC.data.prospects = await ccFetch('/api/call-center/prospects?page=' + CC.prospectPage + '&limit=50');
        break;
      case 'call-logs':
        CC.data.callLogs = await ccFetch('/api/call-center/call-logs?page=' + CC.callLogPage + '&limit=50');
        break;
      case 'contact-lists':
        CC.data.contactLists = await ccFetch('/api/call-center/contact-lists');
        break;
      case 'deploy':
        const [dAgents, dLists, dCamps] = await Promise.all([
          ccFetch('/api/call-center/agents'),
          ccFetch('/api/call-center/contact-lists'),
          ccFetch('/api/call-center/campaigns'),
        ]);
        CC.data.agents = dAgents;
        CC.data.contactLists = dLists;
        CC.data.campaigns = dCamps;
        break;
    }
    CC.loading = false;
    renderTab(tab);
  }

  function renderTab(tab) {
    const content = document.getElementById('cc-content');
    if (!content) return;
    switch (tab) {
      case 'overview': content.innerHTML = renderOverview(); break;
      case 'agents': content.innerHTML = renderAgents(); break;
      case 'campaigns': content.innerHTML = renderCampaigns(); break;
      case 'prospects': content.innerHTML = renderProspects(); break;
      case 'call-logs': content.innerHTML = renderCallLogs(); break;
      case 'contact-lists': content.innerHTML = renderContactLists(); break;
      case 'deploy': content.innerHTML = renderDeploy(); break;
    }
  }

  // ============================================================
  // OVERVIEW TAB
  // ============================================================
  function renderOverview() {
    const d = CC.data.dashboard || {};
    const t = d.today || {};
    const p = d.prospects || {};
    const ag = d.agents || {};
    const camp = d.campaigns || {};
    const recent = d.recent_calls || [];

    return `<div class="space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-5 text-white shadow-lg">
          <p class="text-orange-100 text-xs font-medium uppercase tracking-wider">Today's Calls</p>
          <p class="text-3xl font-black mt-1">${t.calls||0}</p>
          <p class="text-orange-200 text-xs mt-1">${t.connected||0} connected (${t.connect_rate||0}%)</p>
        </div>
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white shadow-lg">
          <p class="text-green-100 text-xs font-medium uppercase tracking-wider">Hot Leads Today</p>
          <p class="text-3xl font-black mt-1">${t.hot_leads||0}</p>
          <p class="text-green-200 text-xs mt-1">Interested + Demos</p>
        </div>
        <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-white shadow-lg">
          <p class="text-blue-100 text-xs font-medium uppercase tracking-wider">Active Agents</p>
          <p class="text-3xl font-black mt-1">${ag.active||0}<span class="text-lg font-normal">/${ag.total||0}</span></p>
          <p class="text-blue-200 text-xs mt-1">${camp.active||0} active campaign${camp.active!==1?'s':''}</p>
        </div>
        <div class="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl p-5 text-white shadow-lg">
          <p class="text-purple-100 text-xs font-medium uppercase tracking-wider">Prospect Pipeline</p>
          <p class="text-3xl font-black mt-1">${p.available||0}</p>
          <p class="text-purple-200 text-xs mt-1">${p.total||0} total / ${p.interested||0} interested / ${p.demos||0} demos</p>
        </div>
      </div>

      <!-- Pipeline Funnel -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 class="font-bold text-gray-900 mb-4"><i class="fas fa-filter mr-2 text-orange-500"></i>Sales Pipeline</h3>
        <div class="grid grid-cols-6 gap-2">
          ${[
            {label:'Available', val:p.available||0, color:'blue'},
            {label:'Contacted', val:(p.total||0)-(p.available||0)-(p.interested||0)-(p.demos||0)-(p.converted||0)-(p.exhausted||0), color:'yellow'},
            {label:'Interested', val:p.interested||0, color:'orange'},
            {label:'Demo Scheduled', val:p.demos||0, color:'purple'},
            {label:'Converted', val:p.converted||0, color:'green'},
            {label:'Exhausted', val:p.exhausted||0, color:'gray'},
          ].map(s => `
            <div class="text-center">
              <div class="text-2xl font-black text-${s.color}-600">${s.val}</div>
              <div class="text-[10px] text-gray-500 uppercase font-semibold mt-1">${s.label}</div>
              <div class="mt-2 h-2 bg-${s.color}-100 rounded-full overflow-hidden">
                <div class="h-full bg-${s.color}-500 rounded-full" style="width:${p.total ? Math.max(2, s.val/p.total*100) : 2}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Calls -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100">
          <h3 class="font-bold text-gray-900"><i class="fas fa-clock mr-2 text-orange-500"></i>Recent Calls</h3>
        </div>
        ${recent.length === 0 ? '<div class="px-6 py-12 text-center text-gray-400"><i class="fas fa-phone-slash text-4xl mb-3 opacity-30"></i><p>No calls yet — create agents and campaigns to start dialing</p></div>' : `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Time</th>
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Phone</th>
                <th class="px-4 py-3">Agent</th>
                <th class="px-4 py-3">Duration</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Outcome</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-50">${recent.map(cl => `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-xs text-gray-500">${cl.started_at ? new Date(cl.started_at).toLocaleString('en-CA', {dateStyle:'short',timeStyle:'short'}) : '-'}</td>
                  <td class="px-4 py-3 font-medium text-gray-900">${cl.company_name||'—'}<br><span class="text-xs text-gray-400">${cl.contact_name||''}</span></td>
                  <td class="px-4 py-3 text-xs font-mono">${cl.phone_dialed||'—'}</td>
                  <td class="px-4 py-3 text-xs">${cl.agent_name||'—'}</td>
                  <td class="px-4 py-3 text-xs">${fmtDuration(cl.call_duration_seconds)}</td>
                  <td class="px-4 py-3">${statusPill(cl.call_status)}</td>
                  <td class="px-4 py-3">${outcomePill(cl.call_outcome)}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        `}
      </div>
    </div>`;
  }

  // ============================================================
  // AGENTS TAB
  // ============================================================
  function renderAgents() {
    const agents = (CC.data.agents || {}).agents || [];
    return `<div class="space-y-6">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500">${agents.length} agent${agents.length!==1?'s':''} configured</p>
        <button onclick="window.ccShowCreateAgent()" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors shadow-sm">
          <i class="fas fa-plus mr-1"></i>New AI Agent
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${agents.length === 0 ? `
          <div class="col-span-3 bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <i class="fas fa-robot text-5xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 font-medium">No AI agents yet</p>
            <p class="text-gray-400 text-sm mt-1">Create your first sales agent to start cold-calling roofing companies</p>
            <button onclick="window.ccShowCreateAgent()" class="mt-4 px-5 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700">
              <i class="fas fa-plus mr-1"></i>Create First Agent
            </button>
          </div>
        ` : agents.map(a => `
          <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div class="p-5">
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 bg-gradient-to-br ${a.status==='calling'?'from-green-400 to-emerald-600':'from-gray-300 to-gray-400'} rounded-xl flex items-center justify-center shadow-sm ${a.status==='calling'?'animate-pulse':''}">
                    <i class="fas fa-robot text-white text-lg"></i>
                  </div>
                  <div>
                    <h4 class="font-bold text-gray-900">${a.name}</h4>
                    <p class="text-xs text-gray-400">Voice: ${a.voice_id || 'alloy'}</p>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${a.status==='calling'?'bg-green-100 text-green-700 animate-pulse':a.status==='paused'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-500'}">${a.status||'idle'}</span>
              </div>
              ${a.persona ? `<p class="text-xs text-gray-500 mt-3 line-clamp-2">${a.persona}</p>` : ''}
              <div class="grid grid-cols-3 gap-2 mt-4">
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-lg font-bold text-gray-900">${a.total_calls||0}</div>
                  <div class="text-[10px] text-gray-400 uppercase">Calls</div>
                </div>
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-lg font-bold text-green-600">${a.total_connects||0}</div>
                  <div class="text-[10px] text-gray-400 uppercase">Connects</div>
                </div>
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-lg font-bold text-orange-600">${a.total_interested||0}</div>
                  <div class="text-[10px] text-gray-400 uppercase">Interested</div>
                </div>
              </div>
            </div>
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              ${a.status === 'calling' ?
                `<button onclick="window.ccStopAgent(${a.id})" class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"><i class="fas fa-stop mr-1"></i>Stop</button>` :
                `<button onclick="window.ccStartAgent(${a.id})" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"><i class="fas fa-play mr-1"></i>Start Dialing</button>`
              }
              <div class="flex gap-1">
                <button onclick="window.ccTestAgent(${a.id})" class="px-2 py-1.5 text-emerald-500 hover:text-emerald-700 text-xs" title="Test Agent"><i class="fas fa-microphone"></i></button>
                <button onclick="window.ccEditAgent(${a.id})" class="px-2 py-1.5 text-gray-400 hover:text-blue-600 text-xs"><i class="fas fa-edit"></i></button>
                <button onclick="window.ccDeleteAgent(${a.id})" class="px-2 py-1.5 text-gray-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Create Agent Modal -->
    <div id="cc-agent-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-robot mr-2 text-orange-500"></i>Create AI Sales Agent</h3>
          <button onclick="document.getElementById('cc-agent-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Agent Name *</label>
            <input id="cc-agent-name" type="text" placeholder="e.g. Alex" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Voice</label>
            <select id="cc-agent-voice" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
              <option value="alloy">Alloy — neutral, professional</option>
              <option value="echo">Echo — male, authoritative</option>
              <option value="nova">Nova — female, warm</option>
              <option value="onyx">Onyx — deep, confident</option>
              <option value="fable">Fable — expressive, engaging</option>
              <option value="shimmer">Shimmer — warm, friendly</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Persona / Full System Prompt</label>
            <p class="text-xs text-gray-400 mb-1">Detailed instructions for how the agent should behave, respond, handle objections, and close</p>
            <textarea id="cc-agent-persona" rows="5" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" placeholder="e.g. You are Alex, a friendly and consultative sales representative for RoofReporterAI. Your goal is to connect with roofing company owners and estimators, understand their current estimating workflow, and show how our AI-powered instant roof measurement reports can save them time and money.&#10;&#10;Opening: Ask about their business and current estimating process.&#10;Value prop: Highlight 60-second reports, 95%+ accuracy, no ladders or drones needed.&#10;Objection handling: For price concerns, emphasize ROI — each $15-30 report replaces an hour of manual work.&#10;Close: Offer a free demo report on one of their recent job sites."></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Room Prefix</label>
            <input id="cc-agent-prefix" type="text" value="sales-" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" />
          </div>
          <div id="cc-agent-status-msg" class="hidden text-sm"></div>
          <button onclick="window.ccCreateAgent()" class="w-full bg-orange-600 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-700 transition-colors">
            <i class="fas fa-plus mr-1"></i>Create Agent
          </button>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // CAMPAIGNS TAB
  // ============================================================
  function renderCampaigns() {
    const campaigns = (CC.data.campaigns || {}).campaigns || [];
    return `<div class="space-y-6">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500">${campaigns.length} campaign${campaigns.length!==1?'s':''}</p>
        <button onclick="window.ccShowCreateCampaign()" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors shadow-sm">
          <i class="fas fa-plus mr-1"></i>New Campaign
        </button>
      </div>

      ${campaigns.length === 0 ? `
        <div class="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <i class="fas fa-bullhorn text-5xl text-gray-300 mb-4"></i>
          <p class="text-gray-500 font-medium">No campaigns yet</p>
          <p class="text-gray-400 text-sm mt-1">Create a campaign with a sales script to start organizing your outreach</p>
          <button onclick="window.ccShowCreateCampaign()" class="mt-4 px-5 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700"><i class="fas fa-plus mr-1"></i>Create First Campaign</button>
        </div>
      ` : campaigns.map(c => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-5">
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-bold text-gray-900 text-lg">${c.name}</h4>
                <p class="text-xs text-gray-400 mt-0.5">${c.description || 'No description'} &middot; ${c.target_region || 'All regions'}</p>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase ${c.status==='active'?'bg-green-100 text-green-700':c.status==='paused'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-500'}">${c.status||'draft'}</span>
            </div>
            <div class="grid grid-cols-6 gap-3 mt-4">
              ${[
                {label:'Prospects', val:c.total_prospects||0, color:'blue'},
                {label:'Calls', val:c.total_calls||0, color:'gray'},
                {label:'Connects', val:c.total_connects||0, color:'green'},
                {label:'Interested', val:c.total_interested||0, color:'orange'},
                {label:'Demos', val:c.total_demos||0, color:'purple'},
                {label:'Converted', val:c.total_converted||0, color:'emerald'},
              ].map(s => `
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-lg font-bold text-${s.color}-600">${s.val}</div>
                  <div class="text-[10px] text-gray-400 uppercase">${s.label}</div>
                </div>
              `).join('')}
            </div>
            ${c.script_intro ? `<div class="mt-3 p-3 bg-orange-50 rounded-lg"><p class="text-xs text-orange-700"><strong>Intro:</strong> ${c.script_intro.substring(0,150)}${c.script_intro.length>150?'...':''}</p></div>` : ''}
          </div>
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <div class="flex gap-2">
              <span class="text-xs text-gray-400"><i class="fas fa-clock mr-1"></i>${c.call_hours_start||'09:00'} - ${c.call_hours_end||'17:00'} ${c.timezone||''}</span>
              <span class="text-xs text-gray-400"><i class="fas fa-redo mr-1"></i>Max ${c.max_attempts||3} attempts</span>
            </div>
            <div class="flex gap-1">
              ${c.status !== 'active' ? `<button onclick="window.ccUpdateCampaign(${c.id},'active')" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"><i class="fas fa-play mr-1"></i>Activate</button>` : `<button onclick="window.ccUpdateCampaign(${c.id},'paused')" class="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-semibold hover:bg-yellow-600"><i class="fas fa-pause mr-1"></i>Pause</button>`}
              <button onclick="window.ccDeleteCampaign(${c.id})" class="px-2 py-1.5 text-gray-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Create Campaign Modal -->
    <div id="cc-campaign-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-bullhorn mr-2 text-orange-500"></i>Create Sales Campaign</h3>
          <button onclick="document.getElementById('cc-campaign-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">Campaign Name</label>
              <input id="cc-camp-name" type="text" placeholder="e.g. Alberta Roofers Q1" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">Target Region</label>
              <input id="cc-camp-region" type="text" placeholder="e.g. Alberta, Ontario, All Canada" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <input id="cc-camp-desc" type="text" placeholder="Campaign description" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" />
          </div>
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-bold text-gray-700 uppercase mb-3"><i class="fas fa-scroll mr-1"></i>Sales Script</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Opening Intro</label>
            <textarea id="cc-camp-intro" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" placeholder="Hi, this is {agent_name} calling from RoofReporterAI. I'm reaching out to roofing companies in your area because we've built an AI-powered tool that generates instant roof measurement reports..."></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Value Proposition</label>
            <textarea id="cc-camp-value" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" placeholder="Our platform lets you get a complete roof report — measurements, pitch, materials estimate — in under 60 seconds, just from an address. No climbing ladders, no drone flights..."></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Objection Handling</label>
            <textarea id="cc-camp-objections" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" placeholder="Price objection: 'Each report costs about $15-30 which pays for itself on the first estimate. Compare that to spending an hour driving out to measure each roof manually.'&#10;Already have a tool: 'That's great — what tool are you using? We can often complement or improve on existing workflows...'"></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Closing / Call-to-Action</label>
            <textarea id="cc-camp-closing" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" placeholder="I'd love to show you a quick demo — I can run a report on one of your recent job sites right now. Can I get an email to send you a free sample report?"></textarea>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">Call Hours Start</label>
              <input id="cc-camp-start" type="time" value="09:00" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">Call Hours End</label>
              <input id="cc-camp-end" type="time" value="17:00" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">Max Attempts</label>
              <input id="cc-camp-attempts" type="number" value="3" min="1" max="10" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div id="cc-camp-status-msg" class="hidden text-sm"></div>
          <button onclick="window.ccCreateCampaign()" class="w-full bg-orange-600 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-700 transition-colors">
            <i class="fas fa-bullhorn mr-1"></i>Create Campaign
          </button>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // PROSPECTS TAB
  // ============================================================
  function renderProspects() {
    const data = CC.data.prospects || {};
    const prospects = data.prospects || [];
    const total = data.total || 0;

    return `<div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <input id="cc-prospect-search" type="text" placeholder="Search companies, contacts, cities..." class="border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:ring-2 focus:ring-orange-500" onkeydown="if(event.key==='Enter')window.ccSearchProspects()" />
          <button onclick="window.ccSearchProspects()" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"><i class="fas fa-search"></i></button>
          <span class="text-xs text-gray-400">${total} total</span>
        </div>
        <div class="flex gap-2">
          <button onclick="window.ccShowImportCSV()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"><i class="fas fa-file-csv mr-1"></i>Import CSV</button>
          <button onclick="window.ccShowAddProspect()" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700"><i class="fas fa-plus mr-1"></i>Add Prospect</button>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        ${prospects.length === 0 ? '<div class="px-6 py-12 text-center text-gray-400"><i class="fas fa-building text-4xl mb-3 opacity-30"></i><p>No prospects yet</p><p class="text-xs mt-1">Add prospects manually or import a CSV list</p></div>' : `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Contact</th>
                <th class="px-4 py-3">Phone</th>
                <th class="px-4 py-3">Location</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Calls</th>
                <th class="px-4 py-3">Last Called</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-50">${prospects.map(p => `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 font-medium text-gray-900">${p.company_name}<br><span class="text-[10px] text-gray-400">${p.lead_source||''} ${p.tags ? '&middot; '+p.tags : ''}</span></td>
                  <td class="px-4 py-3 text-xs">${p.contact_name||'—'}<br><span class="text-gray-400">${p.email||''}</span></td>
                  <td class="px-4 py-3 text-xs font-mono">${p.phone}</td>
                  <td class="px-4 py-3 text-xs">${[p.city,p.province_state].filter(Boolean).join(', ')}</td>
                  <td class="px-4 py-3">${prospectStatusPill(p.status)}</td>
                  <td class="px-4 py-3 text-center text-xs">${p.total_calls||0}</td>
                  <td class="px-4 py-3 text-xs text-gray-400">${p.last_called_at ? new Date(p.last_called_at).toLocaleDateString('en-CA') : '—'}</td>
                  <td class="px-4 py-3 text-right">
                    <button onclick="window.ccDialProspect(${p.id})" class="text-green-600 hover:text-green-800 text-xs mr-2" title="Dial"><i class="fas fa-phone"></i></button>
                    <button onclick="window.ccDeleteProspect(${p.id})" class="text-red-400 hover:text-red-600 text-xs" title="Delete"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
          <div class="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <span class="text-xs text-gray-400">Page ${data.page||1} of ${Math.ceil(total/50)||1}</span>
            <div class="flex gap-2">
              ${data.page > 1 ? `<button onclick="CC.prospectPage--;window.ccSetTab('prospects')" class="px-3 py-1 bg-gray-100 rounded text-xs"><i class="fas fa-chevron-left"></i></button>` : ''}
              ${total > data.page*50 ? `<button onclick="CC.prospectPage++;window.ccSetTab('prospects')" class="px-3 py-1 bg-gray-100 rounded text-xs"><i class="fas fa-chevron-right"></i></button>` : ''}
            </div>
          </div>
        `}
      </div>
    </div>

    <!-- Add Prospect Modal -->
    <div id="cc-prospect-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-building mr-2 text-orange-500"></i>Add Prospect</h3>
          <button onclick="document.getElementById('cc-prospect-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Company Name *</label><input id="cc-p-company" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Contact Name</label><input id="cc-p-contact" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Phone *</label><input id="cc-p-phone" type="tel" placeholder="+14035551234" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Email</label><input id="cc-p-email" type="email" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">City</label><input id="cc-p-city" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Province/State</label><input id="cc-p-prov" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Country</label><select id="cc-p-country" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"><option value="CA">Canada</option><option value="US">United States</option></select></div>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Notes</label><textarea id="cc-p-notes" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"></textarea></div>
          <button onclick="window.ccAddProspect()" class="w-full bg-orange-600 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-700"><i class="fas fa-plus mr-1"></i>Add Prospect</button>
        </div>
      </div>
    </div>

    <!-- CSV Import Modal -->
    <div id="cc-csv-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-file-csv mr-2 text-blue-500"></i>Import Prospects from CSV</h3>
          <button onclick="document.getElementById('cc-csv-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div class="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>CSV Format:</strong> company_name, contact_name, phone, email, website, city, province_state, country<br>
            First row must be headers. Phone and company_name are required.
          </div>
          <textarea id="cc-csv-data" rows="10" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono" placeholder="company_name,contact_name,phone,email,city,province_state&#10;ABC Roofing,John Smith,+14035551234,john@abc.com,Calgary,AB&#10;XYZ Contractors,Jane Doe,+17805559876,jane@xyz.com,Edmonton,AB"></textarea>
          <div id="cc-csv-result" class="hidden text-sm"></div>
          <button onclick="window.ccImportCSV()" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700"><i class="fas fa-upload mr-1"></i>Import</button>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // CALL LOGS TAB
  // ============================================================
  function renderCallLogs() {
    const data = CC.data.callLogs || {};
    const logs = data.call_logs || [];
    const total = data.total || 0;

    return `<div class="space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500">${total} total call${total!==1?'s':''}</span>
        <button onclick="window.ccSetTab('call-logs')" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"><i class="fas fa-sync-alt"></i></button>
      </div>

      <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        ${logs.length === 0 ? '<div class="px-6 py-12 text-center text-gray-400"><i class="fas fa-list-alt text-4xl mb-3 opacity-30"></i><p>No call logs yet</p></div>' : `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-4 py-3">Time</th>
                <th class="px-4 py-3">Company</th>
                <th class="px-4 py-3">Phone</th>
                <th class="px-4 py-3">Agent</th>
                <th class="px-4 py-3">Duration</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Outcome</th>
                <th class="px-4 py-3">Sentiment</th>
                <th class="px-4 py-3">Summary</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-50">${logs.map(cl => `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${cl.started_at ? new Date(cl.started_at).toLocaleString('en-CA', {dateStyle:'short',timeStyle:'short'}) : '-'}</td>
                  <td class="px-4 py-3 font-medium text-gray-900">${cl.company_name||'—'}<br><span class="text-xs text-gray-400">${cl.contact_name||''}</span></td>
                  <td class="px-4 py-3 text-xs font-mono">${cl.phone_dialed||'—'}</td>
                  <td class="px-4 py-3 text-xs">${cl.agent_name||'—'}</td>
                  <td class="px-4 py-3 text-xs">${fmtDuration(cl.call_duration_seconds)}</td>
                  <td class="px-4 py-3">${statusPill(cl.call_status)}</td>
                  <td class="px-4 py-3">${outcomePill(cl.call_outcome)}</td>
                  <td class="px-4 py-3">${sentimentPill(cl.caller_sentiment)}</td>
                  <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">${cl.call_summary||'—'}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        `}
      </div>
    </div>`;
  }

  // ============================================================
  // CONTACT LISTS TAB
  // ============================================================
  function renderContactLists() {
    const lists = (CC.data.contactLists || {}).lists || [];
    return `<div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-500">${lists.length} contact list${lists.length!==1?'s':''}</p>
          <p class="text-xs text-gray-400 mt-0.5">Organize prospects by area/region for targeted campaigns</p>
        </div>
        <button onclick="window.ccShowCreateList()" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors shadow-sm">
          <i class="fas fa-plus mr-1"></i>New Contact List
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${lists.length === 0 ? `
          <div class="col-span-3 bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <i class="fas fa-address-book text-5xl text-gray-300 mb-4"></i>
            <p class="text-gray-500 font-medium">No contact lists yet</p>
            <p class="text-gray-400 text-sm mt-1">Create a list for each area/region to organize your outbound prospects</p>
            <button onclick="window.ccShowCreateList()" class="mt-4 px-5 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700">
              <i class="fas fa-plus mr-1"></i>Create First List
            </button>
          </div>
        ` : lists.map(l => `
          <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div class="p-5">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="font-bold text-gray-900">${l.name}</h4>
                  <p class="text-xs text-gray-400 mt-0.5">${[l.area, l.province_state, l.country].filter(Boolean).join(', ') || 'No area set'}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${l.status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}">${l.status||'active'}</span>
              </div>
              ${l.description ? '<p class="text-xs text-gray-500 mt-2 line-clamp-2">' + l.description + '</p>' : ''}
              ${l.tags ? '<div class="flex flex-wrap gap-1 mt-2">' + l.tags.split(',').filter(Boolean).map(t => '<span class="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">' + t.trim() + '</span>').join('') + '</div>' : ''}
              <div class="mt-3 flex items-center gap-2">
                <div class="flex-1 p-3 bg-orange-50 rounded-lg text-center">
                  <div class="text-xl font-black text-orange-700">${l.member_count || l.total_contacts || 0}</div>
                  <div class="text-[10px] text-orange-500 uppercase font-semibold">Contacts</div>
                </div>
              </div>
            </div>
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <div class="flex gap-1">
                <button onclick="window.ccViewList(${l.id})" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"><i class="fas fa-eye mr-1"></i>View</button>
                <button onclick="window.ccImportToList(${l.id})" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"><i class="fas fa-file-csv mr-1"></i>Import CSV</button>
              </div>
              <button onclick="window.ccDeleteList(${l.id})" class="px-2 py-1.5 text-gray-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Create List Modal -->
    <div id="cc-list-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-address-book mr-2 text-orange-500"></i>Create Contact List</h3>
          <button onclick="document.getElementById('cc-list-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">List Name *</label><input id="cc-list-name" type="text" placeholder="e.g. Edmonton Roofers Q1 2026" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Description</label><input id="cc-list-desc" type="text" placeholder="e.g. Roofing companies in the Edmonton metro area" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Area/City</label><input id="cc-list-area" type="text" placeholder="e.g. Edmonton" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Province/State</label><input id="cc-list-prov" type="text" placeholder="e.g. AB" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
            <div><label class="block text-xs font-semibold text-gray-600 mb-1">Country</label><input id="cc-list-country" type="text" value="CA" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Tags (comma-separated)</label><input id="cc-list-tags" type="text" placeholder="e.g. residential, commercial, high-value" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500" /></div>
          <button onclick="window.ccCreateList()" class="w-full bg-orange-600 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-700 transition-colors"><i class="fas fa-plus mr-1"></i>Create List</button>
        </div>
      </div>
    </div>

    <!-- Import to List Modal -->
    <div id="cc-list-import-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-file-csv mr-2 text-emerald-500"></i>Import CSV to Contact List</h3>
          <button onclick="document.getElementById('cc-list-import-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-6 space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <p class="font-semibold mb-1"><i class="fas fa-info-circle mr-1"></i>CSV Format</p>
            <p>Required columns: <code class="bg-white px-1 rounded">company_name</code>, <code class="bg-white px-1 rounded">phone</code></p>
            <p class="mt-1">Optional: <code class="bg-white px-1 rounded">contact_name</code>, <code class="bg-white px-1 rounded">email</code>, <code class="bg-white px-1 rounded">city</code>, <code class="bg-white px-1 rounded">province_state</code></p>
          </div>
          <textarea id="cc-list-csv-data" rows="10" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono" placeholder="company_name,contact_name,phone,email,city,province_state&#10;ABC Roofing,John Smith,+14035551234,john@abc.com,Calgary,AB&#10;XYZ Contractors,Jane Doe,+17805559876,jane@xyz.com,Edmonton,AB"></textarea>
          <input type="hidden" id="cc-list-import-id" />
          <div id="cc-list-import-result" class="hidden text-sm"></div>
          <button onclick="window.ccImportToListExec()" class="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition-colors"><i class="fas fa-upload mr-1"></i>Import Contacts</button>
        </div>
      </div>
    </div>

    <!-- View List Members Modal -->
    <div id="cc-list-view-modal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900"><i class="fas fa-users mr-2 text-blue-500"></i><span id="cc-list-view-title">Contact List</span></h3>
          <button onclick="document.getElementById('cc-list-view-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div id="cc-list-view-content" class="p-6">
          <div class="py-12 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-xl"></i></div>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // DEPLOY TAB — Link agent + contact list and launch
  // ============================================================
  function renderDeploy() {
    const agents = (CC.data.agents || {}).agents || [];
    const lists = (CC.data.contactLists || {}).lists || [];
    const campaigns = (CC.data.campaigns || {}).campaigns || [];

    return `<div class="space-y-6">
      <div class="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-6 text-white shadow-lg">
        <h3 class="text-xl font-black flex items-center gap-2"><i class="fas fa-rocket"></i>Deploy Marketing Call Center</h3>
        <p class="text-orange-100 text-sm mt-1">Select an AI agent, connect a contact list, and launch your outbound calling campaign</p>
      </div>

      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
        <!-- Step 1: Select Agent -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center"><span class="text-orange-600 font-black text-sm">1</span></div>
            <h4 class="font-bold text-gray-900">Select AI Agent</h4>
          </div>
          ${agents.length === 0 ? '<p class="text-sm text-gray-400 ml-9">No agents created yet. <a href="#" onclick="window.ccSetTab(\'agents\'); return false;" class="text-orange-600 underline">Create one first</a>.</p>' : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 ml-9">
              ${agents.map(a => `
                <label class="cursor-pointer">
                  <input type="radio" name="deploy-agent" value="${a.id}" class="hidden peer">
                  <div class="p-4 border-2 border-gray-100 rounded-xl peer-checked:border-orange-500 peer-checked:bg-orange-50 hover:border-gray-200 transition-all">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 bg-gradient-to-br ${a.status==='calling'?'from-green-400 to-emerald-600':'from-gray-300 to-gray-400'} rounded-xl flex items-center justify-center">
                        <i class="fas fa-robot text-white"></i>
                      </div>
                      <div>
                        <div class="font-bold text-gray-900 text-sm">${a.name}</div>
                        <div class="text-xs text-gray-400">Voice: ${a.voice_id} &middot; ${a.total_calls||0} calls</div>
                      </div>
                    </div>
                    ${a.persona ? '<p class="text-xs text-gray-500 mt-2 line-clamp-1">' + a.persona + '</p>' : ''}
                  </div>
                </label>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Step 2: Select Contact List -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center"><span class="text-orange-600 font-black text-sm">2</span></div>
            <h4 class="font-bold text-gray-900">Select Contact List</h4>
          </div>
          ${lists.length === 0 ? '<p class="text-sm text-gray-400 ml-9">No contact lists created yet. <a href="#" onclick="window.ccSetTab(\'contact-lists\'); return false;" class="text-orange-600 underline">Create one first</a>.</p>' : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 ml-9">
              ${lists.map(l => `
                <label class="cursor-pointer">
                  <input type="radio" name="deploy-list" value="${l.id}" class="hidden peer">
                  <div class="p-4 border-2 border-gray-100 rounded-xl peer-checked:border-orange-500 peer-checked:bg-orange-50 hover:border-gray-200 transition-all">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-bold text-gray-900 text-sm">${l.name}</div>
                        <div class="text-xs text-gray-400">${[l.area, l.province_state].filter(Boolean).join(', ') || 'No area'}</div>
                      </div>
                      <div class="text-right">
                        <div class="text-lg font-black text-orange-600">${l.member_count || l.total_contacts || 0}</div>
                        <div class="text-[10px] text-gray-400 uppercase">contacts</div>
                      </div>
                    </div>
                  </div>
                </label>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Step 3: Campaign (optional) -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center"><span class="text-orange-600 font-black text-sm">3</span></div>
            <h4 class="font-bold text-gray-900">Link to Campaign <span class="text-xs text-gray-400 font-normal">(optional — auto-creates if blank)</span></h4>
          </div>
          <div class="ml-9">
            <select id="deploy-campaign" class="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
              <option value="">Auto-create new campaign</option>
              ${campaigns.map(c => '<option value="' + c.id + '">' + c.name + ' (' + (c.status||'draft') + ')</option>').join('')}
            </select>
          </div>
        </div>

        <!-- Deploy Button -->
        <div class="pt-4 border-t border-gray-100">
          <div id="cc-deploy-status" class="hidden text-sm mb-3"></div>
          <button onclick="window.ccDeployCampaign()" class="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm hover:from-orange-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl">
            <i class="fas fa-rocket mr-2"></i>Deploy & Start Calling
          </button>
        </div>
      </div>
    </div>`;
  }

  // ============================================================
  // HELPER PILLS
  // ============================================================
  function statusPill(s) {
    const m = {initiated:'bg-gray-100 text-gray-600',ringing:'bg-blue-100 text-blue-700',connected:'bg-green-100 text-green-700',completed:'bg-green-100 text-green-700',voicemail:'bg-yellow-100 text-yellow-700',no_answer:'bg-gray-100 text-gray-500',busy:'bg-red-100 text-red-600',failed:'bg-red-100 text-red-600'};
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${m[s]||'bg-gray-100 text-gray-500'}">${(s||'—').replace(/_/g,' ')}</span>`;
  }
  function outcomePill(s) {
    if (!s) return '<span class="text-gray-300 text-xs">—</span>';
    const m = {interested:'bg-orange-100 text-orange-700',demo_scheduled:'bg-purple-100 text-purple-700',callback_requested:'bg-blue-100 text-blue-700',not_interested:'bg-gray-100 text-gray-500',wrong_number:'bg-red-100 text-red-600',voicemail_left:'bg-yellow-100 text-yellow-700',converted:'bg-green-100 text-green-700',hung_up:'bg-red-100 text-red-500'};
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${m[s]||'bg-gray-100 text-gray-500'}">${(s||'').replace(/_/g,' ')}</span>`;
  }
  function sentimentPill(s) {
    if (!s) return '<span class="text-gray-300 text-xs">—</span>';
    const m = {positive:'text-green-600',neutral:'text-gray-500',negative:'text-red-500',hostile:'text-red-700'};
    return `<span class="text-xs font-medium ${m[s]||'text-gray-400'}">${s}</span>`;
  }
  function prospectStatusPill(s) {
    const m = {'new':'bg-blue-100 text-blue-700',queued:'bg-blue-50 text-blue-600',calling:'bg-yellow-100 text-yellow-700 animate-pulse',contacted:'bg-gray-100 text-gray-600',interested:'bg-orange-100 text-orange-700',demo_scheduled:'bg-purple-100 text-purple-700',converted:'bg-green-100 text-green-700',not_interested:'bg-gray-100 text-gray-400',do_not_call:'bg-red-100 text-red-600',bad_number:'bg-red-50 text-red-500'};
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${m[s]||'bg-gray-100 text-gray-500'}">${(s||'new').replace(/_/g,' ')}</span>`;
  }
  function fmtDuration(sec) {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return sec + 's';
    return Math.floor(sec/60) + 'm ' + (sec%60) + 's';
  }

  // ============================================================
  // ACTIONS
  // ============================================================
  // Agents
  window.ccShowCreateAgent = function() { document.getElementById('cc-agent-modal').classList.remove('hidden'); };
  window.ccCreateAgent = async function() {
    const name = document.getElementById('cc-agent-name').value.trim();
    if (!name) return alert('Agent name required');
    const data = await ccFetch('/api/call-center/agents', { method: 'POST', body: JSON.stringify({
      name, voice_id: document.getElementById('cc-agent-voice').value,
      persona: document.getElementById('cc-agent-persona').value,
      livekit_room_prefix: document.getElementById('cc-agent-prefix').value,
    }) });
    if (data?.success) { document.getElementById('cc-agent-modal').classList.add('hidden'); ccLoadTab('agents'); }
    else alert(data?.error || 'Failed');
  };
  window.ccStartAgent = async function(id) {
    const data = await ccFetch('/api/call-center/agents/' + id + '/start', { method: 'POST', body: '{}' });
    if (data?.success) ccLoadTab('agents');
    else alert(data?.error || 'Failed to start');
  };
  window.ccStopAgent = async function(id) {
    const data = await ccFetch('/api/call-center/agents/' + id + '/stop', { method: 'POST', body: '{}' });
    if (data?.success) ccLoadTab('agents');
  };
  window.ccEditAgent = function(id) { alert('Edit agent ' + id + ' — coming soon'); };
  window.ccDeleteAgent = async function(id) {
    if (!confirm('Delete this AI agent?')) return;
    await ccFetch('/api/call-center/agents/' + id, { method: 'DELETE' });
    ccLoadTab('agents');
  };

  // Campaigns
  window.ccShowCreateCampaign = function() { document.getElementById('cc-campaign-modal').classList.remove('hidden'); };
  window.ccCreateCampaign = async function() {
    const name = document.getElementById('cc-camp-name').value.trim();
    if (!name) return alert('Campaign name required');
    const data = await ccFetch('/api/call-center/campaigns', { method: 'POST', body: JSON.stringify({
      name, description: document.getElementById('cc-camp-desc').value,
      target_region: document.getElementById('cc-camp-region').value,
      script_intro: document.getElementById('cc-camp-intro').value,
      script_value_prop: document.getElementById('cc-camp-value').value,
      script_objections: document.getElementById('cc-camp-objections').value,
      script_closing: document.getElementById('cc-camp-closing').value,
      call_hours_start: document.getElementById('cc-camp-start').value,
      call_hours_end: document.getElementById('cc-camp-end').value,
      max_attempts: parseInt(document.getElementById('cc-camp-attempts').value) || 3,
    }) });
    if (data?.success) { document.getElementById('cc-campaign-modal').classList.add('hidden'); ccLoadTab('campaigns'); }
    else alert(data?.error || 'Failed');
  };
  window.ccUpdateCampaign = async function(id, status) {
    await ccFetch('/api/call-center/campaigns/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
    ccLoadTab('campaigns');
  };
  window.ccDeleteCampaign = async function(id) {
    if (!confirm('Delete this campaign?')) return;
    await ccFetch('/api/call-center/campaigns/' + id, { method: 'DELETE' });
    ccLoadTab('campaigns');
  };

  // Prospects
  window.ccShowAddProspect = function() { document.getElementById('cc-prospect-modal').classList.remove('hidden'); };
  window.ccAddProspect = async function() {
    const company = document.getElementById('cc-p-company').value.trim();
    const phone = document.getElementById('cc-p-phone').value.trim();
    if (!company || !phone) return alert('Company name and phone required');
    const data = await ccFetch('/api/call-center/prospects', { method: 'POST', body: JSON.stringify({
      company_name: company, contact_name: document.getElementById('cc-p-contact').value,
      phone, email: document.getElementById('cc-p-email').value,
      city: document.getElementById('cc-p-city').value, province_state: document.getElementById('cc-p-prov').value,
      country: document.getElementById('cc-p-country').value, notes: document.getElementById('cc-p-notes').value,
    }) });
    if (data?.success) { document.getElementById('cc-prospect-modal').classList.add('hidden'); ccLoadTab('prospects'); }
    else alert(data?.error || 'Failed');
  };
  window.ccShowImportCSV = function() { document.getElementById('cc-csv-modal').classList.remove('hidden'); };
  window.ccImportCSV = async function() {
    const csv = document.getElementById('cc-csv-data').value.trim();
    if (!csv) return alert('Paste CSV data');
    const resultEl = document.getElementById('cc-csv-result');
    resultEl.classList.remove('hidden');
    resultEl.className = 'text-sm text-blue-600';
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Importing...';
    const data = await ccFetch('/api/call-center/prospects/import', { method: 'POST', body: JSON.stringify({ csv_data: csv }) });
    if (data?.success) {
      resultEl.className = 'text-sm text-green-600 bg-green-50 p-3 rounded-lg';
      resultEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Imported ' + data.imported + ' prospects (' + data.skipped + ' skipped)';
      setTimeout(function() { document.getElementById('cc-csv-modal').classList.add('hidden'); ccLoadTab('prospects'); }, 2000);
    } else {
      resultEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
      resultEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + (data?.error || 'Import failed');
    }
  };
  window.ccSearchProspects = async function() {
    const q = document.getElementById('cc-prospect-search').value.trim();
    CC.prospectPage = 1;
    CC.data.prospects = await ccFetch('/api/call-center/prospects?page=1&limit=50' + (q ? '&search=' + encodeURIComponent(q) : ''));
    renderTab('prospects');
  };
  window.ccDeleteProspect = async function(id) {
    if (!confirm('Delete this prospect?')) return;
    await ccFetch('/api/call-center/prospects/' + id, { method: 'DELETE' });
    ccLoadTab('prospects');
  };
  window.ccDialProspect = async function(id) {
    const agents = (CC.data.agents || {}).agents || [];
    if (agents.length === 0) {
      CC.data.agents = await ccFetch('/api/call-center/agents');
    }
    const agentList = ((CC.data.agents || {}).agents || []);
    if (agentList.length === 0) return alert('Create an AI agent first before dialing');
    const agentId = agentList[0].id;
    if (!confirm('Dial this prospect using agent "' + agentList[0].name + '"?')) return;
    const data = await ccFetch('/api/call-center/dial', { method: 'POST', body: JSON.stringify({ prospect_id: id, agent_id: agentId }) });
    if (data?.success) {
      alert('Call initiated! Room: ' + data.room_name);
      ccLoadTab('prospects');
    } else alert(data?.error || 'Dial failed');
  };

  // Contact Lists
  window.ccShowCreateList = function() { document.getElementById('cc-list-modal').classList.remove('hidden'); };
  window.ccCreateList = async function() {
    const name = document.getElementById('cc-list-name').value.trim();
    if (!name) return alert('List name required');
    const data = await ccFetch('/api/call-center/contact-lists', { method: 'POST', body: JSON.stringify({
      name,
      description: document.getElementById('cc-list-desc').value,
      area: document.getElementById('cc-list-area').value,
      province_state: document.getElementById('cc-list-prov').value,
      country: document.getElementById('cc-list-country').value || 'CA',
      tags: document.getElementById('cc-list-tags').value,
    }) });
    if (data?.success) { document.getElementById('cc-list-modal').classList.add('hidden'); ccLoadTab('contact-lists'); }
    else alert(data?.error || 'Failed');
  };
  window.ccDeleteList = async function(id) {
    if (!confirm('Archive this contact list?')) return;
    await ccFetch('/api/call-center/contact-lists/' + id, { method: 'DELETE' });
    ccLoadTab('contact-lists');
  };
  window.ccImportToList = function(listId) {
    document.getElementById('cc-list-import-id').value = listId;
    document.getElementById('cc-list-csv-data').value = '';
    const resultEl = document.getElementById('cc-list-import-result');
    if (resultEl) { resultEl.classList.add('hidden'); resultEl.innerHTML = ''; }
    document.getElementById('cc-list-import-modal').classList.remove('hidden');
  };
  window.ccImportToListExec = async function() {
    const listId = document.getElementById('cc-list-import-id').value;
    const csv = document.getElementById('cc-list-csv-data').value.trim();
    if (!csv) return alert('Paste CSV data');
    const resultEl = document.getElementById('cc-list-import-result');
    resultEl.classList.remove('hidden');
    resultEl.className = 'text-sm text-blue-600';
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Importing...';
    const data = await ccFetch('/api/call-center/contact-lists/' + listId + '/import', { method: 'POST', body: JSON.stringify({ csv_data: csv }) });
    if (data?.success) {
      resultEl.className = 'text-sm text-green-600 bg-green-50 p-3 rounded-lg';
      resultEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Imported ' + data.imported + ' contacts (' + data.skipped + ' skipped)';
      setTimeout(function() { document.getElementById('cc-list-import-modal').classList.add('hidden'); ccLoadTab('contact-lists'); }, 2000);
    } else {
      resultEl.className = 'text-sm text-red-600 bg-red-50 p-3 rounded-lg';
      resultEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + (data?.error || 'Import failed');
    }
  };
  window.ccViewList = async function(listId) {
    document.getElementById('cc-list-view-modal').classList.remove('hidden');
    const content = document.getElementById('cc-list-view-content');
    content.innerHTML = '<div class="py-12 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-xl"></i></div>';
    const data = await ccFetch('/api/call-center/contact-lists/' + listId + '/members?limit=200');
    if (!data || !data.list) {
      content.innerHTML = '<p class="text-red-500">Failed to load list</p>';
      return;
    }
    document.getElementById('cc-list-view-title').textContent = data.list.name + ' (' + data.total + ' contacts)';
    const members = data.members || [];
    if (members.length === 0) {
      content.innerHTML = '<div class="py-12 text-center text-gray-400"><i class="fas fa-users text-4xl mb-3 opacity-30"></i><p>No contacts in this list yet</p><p class="text-xs mt-1">Import a CSV or add prospects manually</p></div>';
      return;
    }
    content.innerHTML = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase"><th class="px-3 py-2 text-left">Company</th><th class="px-3 py-2 text-left">Contact</th><th class="px-3 py-2 text-left">Phone</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">City</th><th class="px-3 py-2 text-left">Status</th></tr></thead><tbody class="divide-y divide-gray-50">' + members.map(function(m) {
      return '<tr class="hover:bg-gray-50"><td class="px-3 py-2 font-medium text-gray-900">' + (m.company_name||'—') + '</td><td class="px-3 py-2 text-gray-600">' + (m.contact_name||'—') + '</td><td class="px-3 py-2 font-mono text-xs">' + (m.phone||'—') + '</td><td class="px-3 py-2 text-xs text-gray-500">' + (m.email||'—') + '</td><td class="px-3 py-2 text-xs text-gray-500">' + (m.city||'—') + '</td><td class="px-3 py-2">' + prospectStatusPill(m.status) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  };

  // Deploy Campaign
  window.ccDeployCampaign = async function() {
    const agentRadio = document.querySelector('input[name="deploy-agent"]:checked');
    const listRadio = document.querySelector('input[name="deploy-list"]:checked');
    if (!agentRadio) return alert('Please select an AI agent');
    if (!listRadio) return alert('Please select a contact list');
    const campaignId = document.getElementById('deploy-campaign')?.value || '';
    const statusEl = document.getElementById('cc-deploy-status');
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-sm text-blue-600';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Deploying campaign...';

    const data = await ccFetch('/api/call-center/deploy', { method: 'POST', body: JSON.stringify({
      agent_id: parseInt(agentRadio.value),
      contact_list_id: parseInt(listRadio.value),
      campaign_id: campaignId ? parseInt(campaignId) : undefined,
    }) });

    if (data?.success) {
      statusEl.className = 'text-sm text-green-600 bg-green-50 p-4 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i><strong>Deployed!</strong> ' + data.message + '<br>' +
        '<span class="text-xs">Campaign ID: ' + data.deployment.campaign_id + ' &middot; ' + data.deployment.queued_prospects + ' prospects queued</span>';
    } else {
      statusEl.className = 'text-sm text-red-600 bg-red-50 p-4 rounded-lg';
      statusEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + (data?.error || 'Deployment failed');
    }
  };

  // ============================================================
  // VOICE TEST AGENT — Browser microphone test for Call Center
  // ============================================================
  let ccTestState = { active: false, mediaRecorder: null, audioChunks: [], conversationHistory: [], processing: false, agentId: null };

  window.ccTestAgent = function(agentId) {
    const agents = ((CC.data.agents || {}).agents || []);
    const agent = agents.find(a => a.id === agentId);
    const agentName = agent ? agent.name : 'Agent';
    const agentPersona = agent ? (agent.persona || '') : '';

    const existing = document.getElementById('ccVoiceTestModal');
    if (existing) existing.remove();
    ccTestState.agentId = agentId;
    ccTestState.conversationHistory = [];

    const modal = document.createElement('div');
    modal.id = 'ccVoiceTestModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div class="bg-gradient-to-r from-orange-500 to-amber-600 p-5 text-white">
          <div class="flex items-center justify-between">
            <div><h2 class="text-lg font-bold"><i class="fas fa-microphone-alt mr-2"></i>Test Agent: ${agentName}</h2>
            <p class="text-orange-100 text-xs mt-1">Speak into your mic — test the agent before deploying</p></div>
            <button onclick="ccCloseTestModal()" class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"><i class="fas fa-times text-sm"></i></button>
          </div>
        </div>
        <div class="p-5">
          <div id="ccVtConversation" class="h-64 overflow-y-auto mb-4 space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div class="text-center text-gray-400 text-sm py-8"><i class="fas fa-robot text-3xl block mb-2 text-orange-300"></i>Press the microphone button and speak to test <strong>${agentName}</strong>.<br><span class="text-xs">The agent will respond using its configured persona.</span></div>
          </div>
          <div id="ccVtStatus" class="text-center text-xs text-gray-400 mb-3 h-4"></div>
          <div class="flex items-center justify-center gap-4">
            <button onclick="ccStartTestRecording()" id="ccVtRecordBtn" class="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-all shadow-lg hover:shadow-xl active:scale-95">
              <i class="fas fa-microphone text-2xl"></i>
            </button>
            <button onclick="ccStopTestRecording()" id="ccVtStopBtn" class="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg hidden animate-pulse">
              <i class="fas fa-stop text-2xl"></i>
            </button>
            <button onclick="ccResetTest()" class="w-10 h-10 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 transition-all" title="Reset conversation">
              <i class="fas fa-redo text-sm"></i>
            </button>
          </div>
          <p class="text-center text-xs text-gray-400 mt-3">Audio is transcribed and sent to the AI. No audio is stored.</p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) ccCloseTestModal(); });
  };

  window.ccCloseTestModal = function() {
    if (ccTestState.mediaRecorder && ccTestState.mediaRecorder.state !== 'inactive') ccTestState.mediaRecorder.stop();
    ccTestState.active = false;
    ccTestState.conversationHistory = [];
    const m = document.getElementById('ccVoiceTestModal');
    if (m) m.remove();
  };

  window.ccResetTest = function() {
    ccTestState.conversationHistory = [];
    const conv = document.getElementById('ccVtConversation');
    if (conv) conv.innerHTML = '<div class="text-center text-gray-400 text-sm py-8"><i class="fas fa-robot text-3xl block mb-2 text-orange-300"></i>Conversation reset. Press mic to start again.</div>';
  };

  window.ccStartTestRecording = async function() {
    if (ccTestState.processing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ccTestState.audioChunks = [];
      let options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};
      ccTestState.mediaRecorder = new MediaRecorder(stream, options);
      ccTestState.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) ccTestState.audioChunks.push(e.data); };
      ccTestState.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (ccTestState.audioChunks.length > 0) ccProcessVoiceTest();
      };
      ccTestState.mediaRecorder.start();
      ccTestState.active = true;
      document.getElementById('ccVtRecordBtn').classList.add('hidden');
      document.getElementById('ccVtStopBtn').classList.remove('hidden');
      document.getElementById('ccVtStatus').textContent = 'Listening... speak now';
      document.getElementById('ccVtStatus').className = 'text-center text-xs text-red-500 mb-3 h-4 font-semibold';
    } catch(e) {
      alert('Microphone access denied. Please allow microphone access.');
    }
  };

  window.ccStopTestRecording = function() {
    if (ccTestState.mediaRecorder && ccTestState.mediaRecorder.state !== 'inactive') ccTestState.mediaRecorder.stop();
    ccTestState.active = false;
    document.getElementById('ccVtRecordBtn').classList.remove('hidden');
    document.getElementById('ccVtStopBtn').classList.add('hidden');
    document.getElementById('ccVtStatus').textContent = 'Processing...';
    document.getElementById('ccVtStatus').className = 'text-center text-xs text-amber-500 mb-3 h-4 font-semibold';
  };

  async function ccProcessVoiceTest() {
    ccTestState.processing = true;
    const conv = document.getElementById('ccVtConversation');
    const statusEl = document.getElementById('ccVtStatus');
    const audioBlob = new Blob(ccTestState.audioChunks, { type: ccTestState.mediaRecorder.mimeType || 'audio/webm' });

    conv.innerHTML += '<div class="flex justify-end"><div class="bg-blue-100 text-blue-800 rounded-xl rounded-tr-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-spinner fa-spin mr-1 text-xs"></i>Transcribing...</div></div>';
    conv.scrollTop = conv.scrollHeight;

    try {
      // Transcribe via secretary test endpoint (shared)
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const transcribeRes = await fetch('/api/secretary/test/transcribe', { method: 'POST', headers: { 'Authorization': 'Bearer ' + CC.adminKey }, body: formData });
      const transcribeData = await transcribeRes.json();

      if (!transcribeData.text || transcribeData.text.trim() === '') {
        conv.lastChild.remove();
        conv.innerHTML += '<div class="flex justify-end"><div class="bg-red-50 text-red-600 rounded-xl rounded-tr-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-exclamation-circle mr-1"></i>Could not understand. Try speaking louder.</div></div>';
        conv.scrollTop = conv.scrollHeight;
        ccTestState.processing = false;
        if (statusEl) { statusEl.textContent = 'Ready'; statusEl.className = 'text-center text-xs text-gray-400 mb-3 h-4'; }
        return;
      }

      conv.lastChild.remove();
      const userText = transcribeData.text.trim();
      conv.innerHTML += '<div class="flex justify-end"><div class="bg-orange-500 text-white rounded-xl rounded-tr-sm px-3 py-2 max-w-xs text-sm">' + userText + '</div></div>';
      ccTestState.conversationHistory.push({ role: 'user', content: userText });

      conv.innerHTML += '<div class="flex justify-start"><div class="bg-orange-50 text-orange-800 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-robot mr-1"></i><i class="fas fa-spinner fa-spin ml-1 text-xs"></i> Thinking...</div></div>';
      conv.scrollTop = conv.scrollHeight;

      // Get agent info
      const agents = ((CC.data.agents || {}).agents || []);
      const agent = agents.find(a => a.id === ccTestState.agentId);
      const persona = agent ? (agent.persona || 'Professional sales agent for RoofReporterAI') : 'Professional sales agent';

      // Chat via call-center test endpoint
      const aiRes = await ccFetch('/api/call-center/test/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userText,
          history: ccTestState.conversationHistory.slice(0, -1),
          persona: persona,
          agent_name: agent ? agent.name : 'Agent'
        })
      });

      conv.lastChild.remove();
      const aiText = (aiRes && aiRes.response) || 'Sorry, I had trouble responding. Please try again.';
      conv.innerHTML += '<div class="flex justify-start"><div class="bg-orange-50 text-orange-800 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-robot text-orange-500 mr-1"></i>' + aiText + '</div></div>';
      ccTestState.conversationHistory.push({ role: 'assistant', content: aiText });
      conv.scrollTop = conv.scrollHeight;

      if (statusEl) { statusEl.textContent = 'Press mic to continue'; statusEl.className = 'text-center text-xs text-orange-500 mb-3 h-4'; }
    } catch(e) {
      conv.lastChild.remove();
      conv.innerHTML += '<div class="flex justify-start"><div class="bg-red-50 text-red-600 rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-sm"><i class="fas fa-exclamation-triangle mr-1"></i>Error: ' + (e.message || 'Network error') + '</div></div>';
      conv.scrollTop = conv.scrollHeight;
      if (statusEl) { statusEl.textContent = 'Error. Try again.'; statusEl.className = 'text-center text-xs text-red-500 mb-3 h-4'; }
    }
    ccTestState.processing = false;
  }

})();
