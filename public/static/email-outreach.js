// ============================================================
// EMAIL OUTREACH MODULE — Super Admin Cold Email System
// Lists, Contacts (CSV import/upload), Campaigns, Templates,
// Sending, De-duplication, Analytics, Scheduling
// ============================================================

const EO = {
  view: 'dashboard',
  lists: [],
  stats: {},
  campaigns: [],
  templates: [],
  currentList: null,
  currentContacts: [],
  currentContactsTotal: 0,
  currentCampaign: null,
  campaignStats: {},
  campaignSendLog: [],
  editCampaign: {},
  editContact: null,
  analytics: null,
  dedupPreview: null,
  search: '',
  contactPage: 0,
  contactStatusFilter: ''
};

function eoHeaders() {
  const token = localStorage.getItem('rc_token');
  return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function eoFetch(url, opts = {}) {
  const headers = { ...eoHeaders(), ...(opts.headers || {}) };
  // Don't set Content-Type for FormData (file uploads)
  if (opts.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('rc_user');
    localStorage.removeItem('rc_token');
    window.location.href = '/login';
    return null;
  }
  return res;
}

// ============================================================
// ENTRY POINT
// ============================================================
window.loadEmailOutreach = async function() {
  EO.view = 'dashboard';
  await loadEODashboard();
};

async function loadEODashboard() {
  const root = document.getElementById('sa-root');
  if (!root) return;
  root.innerHTML = eoSpinner();
  try {
    const [statsRes, listsRes, campsRes] = await Promise.all([
      eoFetch('/api/email-outreach/stats'),
      eoFetch('/api/email-outreach/lists'),
      eoFetch('/api/email-outreach/campaigns')
    ]);
    if (statsRes) EO.stats = await statsRes.json();
    if (listsRes) { const d = await listsRes.json(); EO.lists = d.lists || []; }
    if (campsRes) { const d = await campsRes.json(); EO.campaigns = d.campaigns || []; }
    EO.view = 'dashboard';
    renderEO();
  } catch (e) {
    root.innerHTML = `<div class="text-red-500 p-8">Error loading email outreach: ${e.message}</div>`;
  }
}

function eoSpinner(msg) {
  return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div><span class="ml-3 text-gray-500">${msg || 'Loading...'}</span></div>`;
}

function eoToast(message, type = 'success') {
  const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600', warning: 'bg-yellow-600' };
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 z-[9999] ${colors[type] || colors.info} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-semibold animate-fade-in`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ============================================================
// RENDER ROUTER
// ============================================================
function renderEO() {
  const root = document.getElementById('sa-root');
  if (!root) return;
  const views = {
    'dashboard': renderEODashboard,
    'lists': renderEOLists,
    'list-detail': renderEOListDetail,
    'campaigns': renderEOCampaigns,
    'campaign-detail': renderEOCampaignDetail,
    'campaign-editor': renderEOCampaignEditor,
    'templates': renderEOTemplates,
    'analytics': renderEOAnalytics,
    'dedup': renderEODedup
  };
  root.innerHTML = (views[EO.view] || renderEODashboard)();
}

// ============================================================
// UI HELPERS
// ============================================================
function eoCard(label, value, icon, color, sub) {
  return `<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">${label}</p>
        <p class="text-2xl font-black text-gray-900 mt-1">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-1">${sub}</p>` : ''}
      </div>
      <div class="w-10 h-10 bg-${color}-100 rounded-xl flex items-center justify-center"><i class="fas ${icon} text-${color}-500"></i></div>
    </div>
  </div>`;
}

function eoBtn(label, onclick, color = 'blue', icon = '', size = 'sm') {
  const sz = size === 'xs' ? 'px-2.5 py-1 text-xs' : size === 'sm' ? 'px-3.5 py-2 text-sm' : 'px-5 py-2.5 text-sm';
  return `<button onclick="${onclick}" class="bg-${color}-600 hover:bg-${color}-700 text-white ${sz} rounded-lg font-semibold transition-all shadow-sm inline-flex items-center gap-1.5">
    ${icon ? `<i class="fas ${icon}"></i>` : ''}${label}
  </button>`;
}

function eoBtnOutline(label, onclick, color = 'gray', icon = '') {
  return `<button onclick="${onclick}" class="border border-${color}-300 text-${color}-700 hover:bg-${color}-50 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all inline-flex items-center gap-1">
    ${icon ? `<i class="fas ${icon}"></i>` : ''}${label}
  </button>`;
}

function eoBadge(text, color) {
  const colors = {
    green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700', gray: 'bg-gray-100 text-gray-700', purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700', indigo: 'bg-indigo-100 text-indigo-700'
  };
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[color] || colors.gray}">${text}</span>`;
}

function eoStatusBadge(status) {
  const map = { active: 'green', bounced: 'red', unsubscribed: 'yellow', complained: 'red',
    draft: 'gray', sending: 'blue', scheduled: 'indigo', paused: 'yellow', completed: 'green', failed: 'red',
    queued: 'gray', sent: 'blue', delivered: 'green', opened: 'purple', clicked: 'green' };
  return eoBadge((status || 'unknown').toUpperCase(), map[status] || 'gray');
}

function eoBackBtn(view, label) {
  return `<button onclick="eoNav('${view}')" class="text-gray-400 hover:text-gray-600 transition-colors"><i class="fas fa-arrow-left text-sm"></i></button>`;
}

function eoEmptyState(icon, title, subtitle) {
  return `<div class="bg-white rounded-xl border border-gray-100 p-16 text-center">
    <i class="fas ${icon} text-gray-200 text-5xl mb-4"></i>
    <p class="text-gray-500 font-semibold">${title}</p>
    <p class="text-xs text-gray-300 mt-1">${subtitle || ''}</p>
  </div>`;
}

function eoFmtDate(d) { return d ? new Date(d).toLocaleDateString('en-CA') : '-'; }
function eoFmtDateTime(d) { return d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' }) : '-'; }
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// DASHBOARD VIEW
// ============================================================
function renderEODashboard() {
  const s = EO.stats;
  const recentLists = EO.lists.slice(0, 5);
  const recentCamps = EO.campaigns.slice(0, 5);
  const totalContacts = s.total_contacts || 0;
  const activeContacts = s.active_contacts || 0;
  const bounceRate = s.total_emails_sent > 0 ? ((s.total_bounces || 0) / s.total_emails_sent * 100).toFixed(1) : '0';

  return `
  <div class="slide-in">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-black text-gray-900"><i class="fas fa-envelope-open-text mr-2 text-blue-600"></i>Email Outreach</h1>
        <p class="text-sm text-gray-500 mt-1">Cold email marketing & campaign management for roofing companies</p>
      </div>
      <div class="flex gap-2 flex-wrap">
        ${eoBtn('Lists', "eoNav('lists')", 'blue', 'fa-list', 'xs')}
        ${eoBtn('Campaigns', "eoNav('campaigns')", 'green', 'fa-paper-plane', 'xs')}
        ${eoBtn('Templates', "eoNav('templates')", 'purple', 'fa-file-alt', 'xs')}
        ${eoBtn('Analytics', "eoNav('analytics')", 'indigo', 'fa-chart-bar', 'xs')}
        ${eoBtn('De-dup', "eoNav('dedup')", 'yellow', 'fa-filter', 'xs')}
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      ${eoCard('Email Lists', s.total_lists || 0, 'fa-list', 'blue', `${totalContacts} contacts`)}
      ${eoCard('Active Contacts', activeContacts, 'fa-user-check', 'green', `${s.unique_active_emails || 0} unique`)}
      ${eoCard('Campaigns', s.total_campaigns || 0, 'fa-paper-plane', 'purple', `${s.draft_campaigns || 0} drafts`)}
      ${eoCard('Emails Sent', s.total_emails_sent || 0, 'fa-envelope', 'yellow', `${s.total_opens || 0} opens`)}
      ${eoCard('Templates', s.total_templates || 0, 'fa-file-alt', 'indigo', 'Reusable templates')}
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <!-- Lists Panel -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900 text-sm"><i class="fas fa-list mr-2 text-blue-500"></i>Email Lists</h3>
          <div class="flex gap-2">
            ${eoBtn('New List', 'eoCreateList()', 'blue', 'fa-plus', 'xs')}
          </div>
        </div>
        <div class="divide-y divide-gray-50 max-h-64 overflow-auto">
          ${recentLists.length === 0 ? '<div class="p-6 text-center text-gray-400 text-sm">No lists yet. Create one to start.</div>' :
            recentLists.map(l => `
              <div class="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors" onclick="eoViewList(${l.id})">
                <div>
                  <span class="font-semibold text-gray-900 text-sm">${escHtml(l.name)}</span>
                  ${l.tags ? `<span class="ml-2 text-[10px] text-gray-400">${escHtml(l.tags)}</span>` : ''}
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-sm font-bold text-blue-600">${l.total_contacts || l.contact_count || 0}</span>
                  <span class="text-xs text-gray-400">contacts</span>
                  <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
                </div>
              </div>
            `).join('')}
        </div>
        ${EO.lists.length > 5 ? `<div class="p-2 text-center border-t border-gray-50"><button onclick="eoNav('lists')" class="text-blue-600 text-xs font-semibold hover:underline">View all ${EO.lists.length} lists &rarr;</button></div>` : ''}
      </div>

      <!-- Campaigns Panel -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-bold text-gray-900 text-sm"><i class="fas fa-paper-plane mr-2 text-green-500"></i>Campaigns</h3>
          ${eoBtn('New Campaign', 'eoCreateCampaign()', 'green', 'fa-plus', 'xs')}
        </div>
        <div class="divide-y divide-gray-50 max-h-64 overflow-auto">
          ${recentCamps.length === 0 ? '<div class="p-6 text-center text-gray-400 text-sm">No campaigns yet</div>' :
            recentCamps.map(c => `
              <div class="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors" onclick="eoViewCampaign(${c.id})">
                <div>
                  <span class="font-semibold text-gray-900 text-sm">${escHtml(c.name)}</span>
                  <p class="text-xs text-gray-400 mt-0.5">${escHtml(c.subject)}</p>
                </div>
                <div class="flex items-center gap-3">
                  ${eoStatusBadge(c.status)}
                  <span class="text-xs text-gray-400">${c.sent_count || 0}/${c.total_recipients || 0}</span>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <!-- CAN-SPAM Notice -->
    <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
      <i class="fas fa-shield-alt text-blue-500 mt-0.5"></i>
      <div>
        <p class="text-sm font-semibold text-blue-800">CAN-SPAM & CASL Compliance</p>
        <p class="text-xs text-blue-600 mt-1">All outbound emails include automatic unsubscribe links and Reuse Canada physical address. Unsubscribe requests are processed instantly. Bounced contacts are flagged for review.</p>
      </div>
    </div>
  </div>`;
}

// ============================================================
// LISTS VIEW
// ============================================================
function renderEOLists() {
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        ${eoBackBtn('dashboard')}
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-list mr-2 text-blue-600"></i>Email Lists</h1>
        <span class="text-xs text-gray-400">${EO.lists.length} lists</span>
      </div>
      <div class="flex gap-2">
        ${eoBtn('Create New List', 'eoCreateList()', 'blue', 'fa-plus')}
        ${eoBtnOutline('De-duplicate All', "eoNav('dedup')", 'yellow', 'fa-filter')}
      </div>
    </div>
    <div class="space-y-3">
      ${EO.lists.map(l => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-all group">
          <div class="flex-1 cursor-pointer" onclick="eoViewList(${l.id})">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors"><i class="fas fa-list text-blue-500"></i></div>
              <div>
                <span class="font-bold text-gray-900">${escHtml(l.name)}</span>
                ${l.tags ? `<span class="ml-2">${l.tags.split(',').map(t => eoBadge(t.trim(), 'blue')).join(' ')}</span>` : ''}
                ${l.description ? `<p class="text-xs text-gray-400 mt-0.5">${escHtml(l.description)}</p>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 ml-4">
            <div class="text-center"><div class="text-lg font-black text-blue-600">${l.total_contacts || l.contact_count || 0}</div><div class="text-[10px] text-gray-400">Total</div></div>
            <div class="text-center"><div class="text-lg font-black text-green-600">${l.active_contacts || 0}</div><div class="text-[10px] text-gray-400">Active</div></div>
            ${(l.bounced_contacts || 0) > 0 ? `<div class="text-center"><div class="text-sm font-bold text-red-500">${l.bounced_contacts}</div><div class="text-[10px] text-gray-400">Bounced</div></div>` : ''}
            ${(l.unsubscribed_contacts || 0) > 0 ? `<div class="text-center"><div class="text-sm font-bold text-yellow-500">${l.unsubscribed_contacts}</div><div class="text-[10px] text-gray-400">Unsub</div></div>` : ''}
            <div class="flex gap-1">
              ${eoBtnOutline('View', `eoViewList(${l.id})`, 'blue', 'fa-eye')}
              ${eoBtnOutline('Export', `eoExportList(${l.id})`, 'green', 'fa-download')}
              ${eoBtnOutline('Delete', `eoDeleteList(${l.id}, '${escHtml(l.name).replace(/'/g,"\\'")}')`, 'red', 'fa-trash')}
            </div>
          </div>
        </div>
      `).join('')}
      ${EO.lists.length === 0 ? eoEmptyState('fa-list', 'No email lists yet', 'Create a list and import your roofing company contacts via CSV') : ''}
    </div>
  </div>`;
}

// ============================================================
// LIST DETAIL — Contacts table + Import + File Upload
// ============================================================
function renderEOListDetail() {
  const l = EO.currentList;
  if (!l) return '<div class="p-8 text-red-500">List not found</div>';
  const contacts = EO.currentContacts || [];
  const statusOptions = ['', 'active', 'bounced', 'unsubscribed'];

  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        ${eoBackBtn('lists')}
        <div>
          <h1 class="text-xl font-black text-gray-900">${escHtml(l.name)}</h1>
          <p class="text-xs text-gray-400">${escHtml(l.description || '')} ${l.tags ? '&bull; Tags: ' + escHtml(l.tags) : ''}</p>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        ${eoBtn('Upload CSV', `document.getElementById('eoCsvFileInput').click()`, 'green', 'fa-file-upload')}
        ${eoBtn('Paste CSV', `eoShowImport(${l.id})`, 'green', 'fa-paste', 'xs')}
        ${eoBtn('Add Contact', `eoAddContactModal(${l.id})`, 'blue', 'fa-user-plus', 'xs')}
        ${eoBtnOutline('Export', `eoExportList(${l.id})`, 'green', 'fa-download')}
        ${eoBtnOutline('Clean Bounced', `eoCleanBounced(${l.id})`, 'red', 'fa-broom')}
      </div>
    </div>

    <!-- Hidden file input for CSV upload -->
    <input type="file" id="eoCsvFileInput" accept=".csv,.txt,.tsv" class="hidden" onchange="eoUploadCSVFile(${l.id}, this)">

    <!-- Search & Filter bar -->
    <div class="mb-4 flex gap-3 items-center">
      <div class="relative flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm"></i>
        <input type="text" id="eoContactSearch" placeholder="Search email, company, name, city..."
          class="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value="${escHtml(EO.search)}" onkeyup="if(event.key==='Enter') eoSearchContacts(${l.id})">
      </div>
      <select id="eoStatusFilter" onchange="EO.contactStatusFilter=this.value;eoSearchContacts(${l.id})"
        class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        <option value="">All Status</option>
        <option value="active" ${EO.contactStatusFilter==='active'?'selected':''}>Active</option>
        <option value="bounced" ${EO.contactStatusFilter==='bounced'?'selected':''}>Bounced</option>
        <option value="unsubscribed" ${EO.contactStatusFilter==='unsubscribed'?'selected':''}>Unsubscribed</option>
      </select>
      ${eoBtn('Search', `eoSearchContacts(${l.id})`, 'blue', 'fa-search', 'xs')}
      <span class="text-sm text-gray-400 whitespace-nowrap">${EO.currentContactsTotal} contacts</span>
    </div>

    <!-- Contacts Table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Company</th>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Contact</th>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Location</th>
              <th class="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
              <th class="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Sends</th>
              <th class="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Opens</th>
              <th class="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Source</th>
              <th class="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase w-20">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${contacts.length === 0 ? `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">No contacts. Import a CSV or add contacts manually.</td></tr>` :
              contacts.map(c => `
                <tr class="hover:bg-blue-50/50 transition-colors">
                  <td class="px-3 py-2 font-medium text-gray-900 text-xs">${escHtml(c.email)}</td>
                  <td class="px-3 py-2 text-xs text-gray-600">${escHtml(c.company_name || '-')}</td>
                  <td class="px-3 py-2 text-xs text-gray-600">${escHtml(c.contact_name || '-')}</td>
                  <td class="px-3 py-2 text-xs text-gray-600">${escHtml(c.city || '-')}${c.province ? ', ' + escHtml(c.province) : ''}</td>
                  <td class="px-3 py-2 text-center">${eoStatusBadge(c.status)}</td>
                  <td class="px-3 py-2 text-center text-xs text-gray-500">${c.sends_count || 0}</td>
                  <td class="px-3 py-2 text-center text-xs text-gray-500">${c.opens_count || 0}</td>
                  <td class="px-3 py-2 text-xs text-gray-400">${escHtml(c.source || '-')}</td>
                  <td class="px-3 py-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button onclick="eoEditContactModal(${c.id}, ${l.id})" class="text-blue-400 hover:text-blue-600 text-xs p-1" title="Edit"><i class="fas fa-edit"></i></button>
                      <button onclick="eoDeleteContact(${c.id}, ${l.id})" class="text-red-400 hover:text-red-600 text-xs p-1" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    ${EO.currentContactsTotal > 100 ? `
    <div class="flex items-center justify-between mt-4">
      <span class="text-xs text-gray-400">Showing ${EO.contactPage * 100 + 1}-${Math.min((EO.contactPage + 1) * 100, EO.currentContactsTotal)} of ${EO.currentContactsTotal}</span>
      <div class="flex gap-2">
        ${EO.contactPage > 0 ? eoBtn('Previous', `eoPageContacts(${l.id}, ${EO.contactPage - 1})`, 'gray', 'fa-chevron-left', 'xs') : ''}
        <span class="text-sm text-gray-400 self-center px-2">Page ${EO.contactPage + 1} of ${Math.ceil(EO.currentContactsTotal / 100)}</span>
        ${(EO.contactPage + 1) * 100 < EO.currentContactsTotal ? eoBtn('Next', `eoPageContacts(${l.id}, ${EO.contactPage + 1})`, 'gray', 'fa-chevron-right', 'xs') : ''}
      </div>
    </div>` : ''}

    <!-- CSV Paste Import Modal -->
    <div id="eoImportModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-black text-gray-900"><i class="fas fa-paste mr-2 text-green-500"></i>Paste CSV Data</h3>
          <button onclick="document.getElementById('eoImportModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-xs text-gray-500 mb-3">Paste CSV or tab-separated data. Expected columns: <strong>email</strong> (required), company_name, contact_name, phone, city, province, website.</p>
        <textarea id="eoCsvData" rows="14" class="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-green-500 outline-none"
          placeholder="email,company_name,contact_name,phone,city,province,website&#10;john@abcroofing.com,ABC Roofing,John Smith,780-555-1234,Edmonton,AB,www.abcroofing.com&#10;jane@xyzcontractors.ca,XYZ Contractors,Jane Doe,403-555-5678,Calgary,AB,"></textarea>
        <div class="flex items-center justify-between mt-4">
          <span class="text-xs text-gray-400" id="eoCsvPreview"></span>
          ${eoBtn('Import Contacts', `eoImportCSV(${l.id})`, 'green', 'fa-upload')}
        </div>
      </div>
    </div>

    <!-- Add/Edit Contact Modal -->
    <div id="eoContactModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-black text-gray-900" id="eoContactModalTitle"><i class="fas fa-user-plus mr-2 text-blue-500"></i>Add Contact</h3>
          <button onclick="document.getElementById('eoContactModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fas fa-times"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="text-xs font-bold text-gray-500 block mb-1">Email *</label><input id="eoMC_email" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="email@company.com"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">Company Name</label><input id="eoMC_company" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="ABC Roofing"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">Contact Name</label><input id="eoMC_name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Smith"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">Phone</label><input id="eoMC_phone" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="780-555-1234"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">City</label><input id="eoMC_city" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Edmonton"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">Province</label><input id="eoMC_province" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="AB"></div>
          <div><label class="text-xs font-bold text-gray-500 block mb-1">Website</label><input id="eoMC_website" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="www.company.com"></div>
        </div>
        <input type="hidden" id="eoMC_contactId" value="">
        <input type="hidden" id="eoMC_listId" value="${l.id}">
        <div class="flex gap-3 mt-4">
          ${eoBtn('Save Contact', 'eoSaveContactModal()', 'blue', 'fa-save')}
          ${eoBtnOutline('Cancel', "document.getElementById('eoContactModal').classList.add('hidden')", 'gray', 'fa-times')}
        </div>
      </div>
    </div>
  </div>`;
}

// ============================================================
// CAMPAIGNS VIEW
// ============================================================
function renderEOCampaigns() {
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        ${eoBackBtn('dashboard')}
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-paper-plane mr-2 text-green-600"></i>Email Campaigns</h1>
        <span class="text-xs text-gray-400">${EO.campaigns.length} campaigns</span>
      </div>
      ${eoBtn('Create Campaign', 'eoCreateCampaign()', 'green', 'fa-plus')}
    </div>
    <div class="space-y-3">
      ${EO.campaigns.map(c => {
        const openRate = c.sent_count > 0 ? ((c.open_count || 0) / c.sent_count * 100).toFixed(1) : '0';
        return `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer group" onclick="eoViewCampaign(${c.id})">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors"><i class="fas fa-paper-plane text-green-500"></i></div>
            <div>
              <span class="font-bold text-gray-900">${escHtml(c.name)}</span>
              <p class="text-xs text-gray-400 mt-0.5">Subject: ${escHtml(c.subject)}</p>
              <p class="text-[10px] text-gray-300 mt-0.5">${eoFmtDate(c.created_at)}${c.scheduled_at ? ' &bull; Scheduled: ' + eoFmtDateTime(c.scheduled_at) : ''}</p>
            </div>
          </div>
          <div class="flex items-center gap-5 ml-4">
            ${eoStatusBadge(c.status)}
            <div class="text-center"><div class="text-sm font-bold text-gray-900">${c.sent_count || 0}<span class="text-gray-300">/${c.total_recipients || 0}</span></div><div class="text-[10px] text-gray-400">Sent</div></div>
            ${c.open_count ? `<div class="text-center"><div class="text-sm font-bold text-purple-600">${openRate}%</div><div class="text-[10px] text-gray-400">Open Rate</div></div>` : ''}
            <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
          </div>
        </div>`;
      }).join('')}
      ${EO.campaigns.length === 0 ? eoEmptyState('fa-paper-plane', 'No campaigns yet', 'Create a campaign after building your email lists') : ''}
    </div>
  </div>`;
}

// ============================================================
// CAMPAIGN DETAIL
// ============================================================
function renderEOCampaignDetail() {
  const c = EO.currentCampaign;
  if (!c) return '<div class="p-8 text-red-500">Campaign not found</div>';
  const stats = EO.campaignStats || {};
  const log = EO.campaignSendLog || [];
  const openRate = (stats.delivered || 0) > 0 ? ((stats.opened || 0) / (stats.delivered || 1) * 100).toFixed(1) : '0';
  const clickRate = (stats.delivered || 0) > 0 ? ((stats.clicked || 0) / (stats.delivered || 1) * 100).toFixed(1) : '0';

  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        ${eoBackBtn('campaigns')}
        <div>
          <h1 class="text-xl font-black text-gray-900">${escHtml(c.name)}</h1>
          <p class="text-xs text-gray-400 mt-0.5">Subject: ${escHtml(c.subject)} &bull; ${eoStatusBadge(c.status)}</p>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        ${c.status === 'draft' ? eoBtn('Send Now', `eoSendCampaign(${c.id})`, 'green', 'fa-paper-plane') : ''}
        ${c.status === 'draft' ? eoBtn('Schedule', `eoScheduleCampaign(${c.id})`, 'indigo', 'fa-clock', 'xs') : ''}
        ${c.status === 'scheduled' ? eoBtn('Cancel Schedule', `eoCancelSchedule(${c.id})`, 'yellow', 'fa-times-circle', 'xs') : ''}
        ${c.status === 'draft' ? eoBtn('Test Email', `eoTestCampaign(${c.id})`, 'yellow', 'fa-flask', 'xs') : ''}
        ${c.status === 'draft' ? eoBtn('Edit', `eoEditCampaign(${c.id})`, 'blue', 'fa-edit', 'xs') : ''}
        ${eoBtn('Duplicate', `eoDuplicateCampaign(${c.id})`, 'purple', 'fa-copy', 'xs')}
        ${c.status === 'draft' || c.status === 'scheduled' ? eoBtnOutline('Delete', `eoDeleteCampaign(${c.id})`, 'red', 'fa-trash') : ''}
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
      ${eoCard('Recipients', c.total_recipients || 0, 'fa-users', 'blue')}
      ${eoCard('Delivered', stats.delivered || c.sent_count || 0, 'fa-check-circle', 'green')}
      ${eoCard('Opens', stats.opened || c.open_count || 0, 'fa-envelope-open', 'purple', `${openRate}% rate`)}
      ${eoCard('Clicks', stats.clicked || c.click_count || 0, 'fa-mouse-pointer', 'indigo', `${clickRate}% rate`)}
      ${eoCard('Bounced', stats.bounced || 0, 'fa-exclamation-triangle', 'yellow')}
      ${eoCard('Failed', stats.failed || c.failed_count || 0, 'fa-times-circle', 'red')}
    </div>

    <!-- Campaign Info -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-bold text-sm text-gray-900 mb-3"><i class="fas fa-info-circle mr-2 text-blue-500"></i>Campaign Details</h3>
        <div class="space-y-2 text-xs">
          <div><span class="text-gray-400 w-24 inline-block">From:</span><span class="text-gray-700">${escHtml(c.from_name || 'RoofReporterAI')} &lt;${escHtml(c.from_email || 'not set')}&gt;</span></div>
          <div><span class="text-gray-400 w-24 inline-block">Reply-To:</span><span class="text-gray-700">${escHtml(c.reply_to || 'not set')}</span></div>
          <div><span class="text-gray-400 w-24 inline-block">Lists:</span><span class="text-gray-700">${escHtml(c.list_ids)}</span></div>
          <div><span class="text-gray-400 w-24 inline-block">Created:</span><span class="text-gray-700">${eoFmtDateTime(c.created_at)}</span></div>
          ${c.scheduled_at ? `<div><span class="text-gray-400 w-24 inline-block">Scheduled:</span><span class="text-indigo-600 font-semibold">${eoFmtDateTime(c.scheduled_at)}</span></div>` : ''}
          ${c.completed_at ? `<div><span class="text-gray-400 w-24 inline-block">Completed:</span><span class="text-gray-700">${eoFmtDateTime(c.completed_at)}</span></div>` : ''}
          <div><span class="text-gray-400 w-24 inline-block">Rate Limit:</span><span class="text-gray-700">${c.send_rate_per_minute || 10}/min</span></div>
        </div>
      </div>

      <!-- Email Preview -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 class="font-bold text-sm text-gray-900 mb-3"><i class="fas fa-eye mr-2 text-purple-500"></i>Email Preview</h3>
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-48 overflow-auto text-xs">${c.body_html || '<em class="text-gray-400">No content</em>'}</div>
      </div>
    </div>

    <!-- Send Log -->
    ${log.length > 0 ? `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-sm text-gray-900"><i class="fas fa-list-alt mr-2 text-gray-500"></i>Send Log <span class="text-gray-400 font-normal">(${log.length} entries)</span></h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-gray-50"><tr>
            <th class="px-3 py-2 text-left font-bold text-gray-500 uppercase">Email</th>
            <th class="px-3 py-2 text-left font-bold text-gray-500 uppercase">Company</th>
            <th class="px-3 py-2 text-center font-bold text-gray-500 uppercase">Status</th>
            <th class="px-3 py-2 text-left font-bold text-gray-500 uppercase">Sent At</th>
            <th class="px-3 py-2 text-left font-bold text-gray-500 uppercase">Error</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${log.map(e => `<tr class="hover:bg-gray-50">
              <td class="px-3 py-1.5 font-medium">${escHtml(e.email)}</td>
              <td class="px-3 py-1.5 text-gray-500">${escHtml(e.company_name || '-')}</td>
              <td class="px-3 py-1.5 text-center">${eoStatusBadge(e.status)}</td>
              <td class="px-3 py-1.5 text-gray-400">${eoFmtDateTime(e.sent_at)}</td>
              <td class="px-3 py-1.5 text-red-400 max-w-xs truncate">${escHtml(e.error_message || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  </div>`;
}

// ============================================================
// CAMPAIGN EDITOR
// ============================================================
function renderEOCampaignEditor() {
  const c = EO.editCampaign || {};
  return `
  <div class="slide-in">
    <div class="flex items-center gap-3 mb-6">
      ${eoBackBtn('campaigns')}
      <h1 class="text-xl font-black text-gray-900">${c.id ? 'Edit Campaign' : 'New Campaign'}</h1>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-4xl">
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Campaign Name *</label>
          <input id="eoC_name" value="${escHtml(c.name || '')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="e.g. Alberta Roofers Q1 2026">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Email Subject *</label>
          <input id="eoC_subject" value="${escHtml(c.subject || '')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="Save time with AI roof measurements - {{company_name}}">
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">From Name</label>
          <input id="eoC_from_name" value="${escHtml(c.from_name || 'RoofReporterAI')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">From Email</label>
          <input id="eoC_from_email" value="${escHtml(c.from_email || '')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="reports@reusecanada.ca">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Reply-To</label>
          <input id="eoC_reply_to" value="${escHtml(c.reply_to || '')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="ethangourley17@gmail.com">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Target Lists *</label>
          <input id="eoC_list_ids" value="${escHtml(c.list_ids || '')}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="1,2,3">
          <p class="text-[10px] text-gray-400 mt-1">${EO.lists.map(l => `<span class="cursor-pointer hover:text-blue-500" onclick="eoInsertListId(${l.id})">${l.id}=${escHtml(l.name)} (${l.total_contacts || l.contact_count || 0})</span>`).join(', ') || 'No lists — create one first'}</p>
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Send Rate (per minute)</label>
          <input id="eoC_rate" type="number" value="${c.send_rate_per_minute || 10}" min="1" max="100" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
          <p class="text-[10px] text-gray-400 mt-1">Emails per minute. Keep under 20 for best deliverability.</p>
        </div>
      </div>
      <div class="mb-4">
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-bold text-gray-500 uppercase">Email Body (HTML) *</label>
          <div class="flex gap-2">
            <button onclick="eoInsertMergeTag('{{company_name}}')" class="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-mono transition-colors">{{company_name}}</button>
            <button onclick="eoInsertMergeTag('{{contact_name}}')" class="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-mono transition-colors">{{contact_name}}</button>
            <button onclick="eoInsertMergeTag('{{first_name}}')" class="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-mono transition-colors">{{first_name}}</button>
            <button onclick="eoInsertMergeTag('{{email}}')" class="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-mono transition-colors">{{email}}</button>
            ${EO.templates.length > 0 ? `<select onchange="eoLoadTemplateIntoEditor(this.value)" class="text-[10px] border border-gray-200 rounded px-2 py-0.5"><option value="">Load Template...</option>${EO.templates.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('')}</select>` : ''}
          </div>
        </div>
        <textarea id="eoC_body_html" rows="18" class="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-green-500 outline-none"
          placeholder="<h2>Hello {{contact_name}},</h2>&#10;<p>We noticed {{company_name}} is a roofing contractor in your area...</p>">${c.body_html || ''}</textarea>
        <p class="text-[10px] text-gray-400 mt-1"><i class="fas fa-shield-alt mr-1"></i>CAN-SPAM footer with unsubscribe link is automatically appended to all emails.</p>
      </div>
      <div class="flex gap-3 items-center">
        ${eoBtn(c.id ? 'Update Campaign' : 'Create Campaign', `eoSaveCampaign(${c.id || 0})`, 'green', 'fa-save')}
        ${c.id ? '' : eoBtn('Create & Schedule', `eoSaveAndSchedule()`, 'indigo', 'fa-clock', 'sm')}
        ${eoBtnOutline('Cancel', "eoNav('campaigns')", 'gray', 'fa-times')}
        <span class="text-[10px] text-gray-300 ml-auto">Tip: Click list IDs above to add them</span>
      </div>
    </div>
  </div>`;
}

// ============================================================
// TEMPLATES VIEW
// ============================================================
function renderEOTemplates() {
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        ${eoBackBtn('dashboard')}
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-file-alt mr-2 text-purple-600"></i>Email Templates</h1>
      </div>
      ${eoBtn('Create Template', 'eoShowTemplateEditor()', 'purple', 'fa-plus')}
    </div>
    <div class="space-y-3">
      ${(EO.templates || []).map(t => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-gray-900">${escHtml(t.name)}</span>
                ${eoBadge(t.category || 'marketing', 'purple')}
                ${t.is_default ? eoBadge('DEFAULT', 'green') : ''}
              </div>
              <p class="text-xs text-gray-400 mt-0.5">Subject: ${escHtml(t.subject)}</p>
              <div class="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50 max-h-24 overflow-auto text-xs">${t.body_html || '<em class="text-gray-400">No content</em>'}</div>
            </div>
            <div class="flex flex-col gap-2 ml-4">
              ${eoBtn('Use in Campaign', `eoUseTpl(${t.id})`, 'green', 'fa-copy', 'xs')}
              ${eoBtnOutline('Delete', `eoDeleteTemplate(${t.id})`, 'red', 'fa-trash')}
            </div>
          </div>
        </div>
      `).join('')}
      ${(EO.templates || []).length === 0 ? eoEmptyState('fa-file-alt', 'No templates yet', 'Create reusable email templates for your campaigns') : ''}
    </div>

    <!-- Template Editor Modal -->
    <div id="eoTemplateModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-black text-gray-900"><i class="fas fa-file-alt mr-2 text-purple-500"></i>Create Template</h3>
          <button onclick="document.getElementById('eoTemplateModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-xl"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Template Name *</label>
            <input id="eoTpl_name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500" placeholder="e.g. Roofing Intro Email">
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Subject Line *</label>
            <input id="eoTpl_subject" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500" placeholder="Save time with AI roof measurements - {{company_name}}">
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Category</label>
            <select id="eoTpl_category" class="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="marketing">Marketing</option>
              <option value="follow-up">Follow-up</option>
              <option value="introduction">Introduction</option>
              <option value="promotion">Promotion</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Email Body (HTML) *</label>
            <textarea id="eoTpl_body" rows="14" class="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="<h2>Hello {{contact_name}},</h2>&#10;<p>Your HTML email content here...</p>"></textarea>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          ${eoBtn('Save Template', 'eoSaveTemplate()', 'purple', 'fa-save')}
          ${eoBtnOutline('Cancel', "document.getElementById('eoTemplateModal').classList.add('hidden')", 'gray', 'fa-times')}
        </div>
      </div>
    </div>
  </div>`;
}

// ============================================================
// ANALYTICS VIEW
// ============================================================
function renderEOAnalytics() {
  const a = EO.analytics;
  if (!a) return eoSpinner('Loading analytics...');

  const o = a.overall || {};
  const campaigns = a.campaigns || [];
  const daily = a.daily_activity || [];
  const bounced = a.top_bounced || [];

  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        ${eoBackBtn('dashboard')}
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-chart-bar mr-2 text-indigo-600"></i>Deliverability Analytics</h1>
      </div>
      ${eoBtn('Refresh', "eoLoadAnalytics()", 'indigo', 'fa-sync-alt', 'xs')}
    </div>

    <!-- Overall Stats -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
      ${eoCard('Total Sent', o.total_sent || 0, 'fa-paper-plane', 'blue')}
      ${eoCard('Opens', o.total_opens || 0, 'fa-envelope-open', 'purple', `${o.avg_open_rate || 0}% avg`)}
      ${eoCard('Clicks', o.total_clicks || 0, 'fa-mouse-pointer', 'green', `${o.avg_click_rate || 0}% avg`)}
      ${eoCard('Bounces', o.total_bounces || 0, 'fa-exclamation-triangle', 'yellow', `${o.avg_bounce_rate || 0}% avg`)}
      ${eoCard('Unsubs', o.total_unsubs || 0, 'fa-user-minus', 'red')}
      ${eoCard('Deliverability', o.total_sent > 0 ? ((1 - (o.total_bounces || 0) / o.total_sent) * 100).toFixed(1) + '%' : 'N/A', 'fa-check-double', 'green')}
    </div>

    <!-- Campaign Performance Table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
      <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900"><i class="fas fa-table mr-2 text-indigo-500"></i>Campaign Performance</h3></div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-gray-50"><tr>
            <th class="px-3 py-2 text-left font-bold text-gray-500">Campaign</th>
            <th class="px-3 py-2 text-center font-bold text-gray-500">Status</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Sent</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Opens</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Open %</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Clicks</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Click %</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Bounced</th>
            <th class="px-3 py-2 text-right font-bold text-gray-500">Failed</th>
            <th class="px-3 py-2 text-left font-bold text-gray-500">Date</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${campaigns.length === 0 ? '<tr><td colspan="10" class="px-4 py-6 text-center text-gray-400">No completed campaigns yet</td></tr>' :
              campaigns.map(c => `<tr class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium text-gray-900">${escHtml(c.name)}</td>
                <td class="px-3 py-2 text-center">${eoStatusBadge(c.status)}</td>
                <td class="px-3 py-2 text-right">${c.sent_count || 0}</td>
                <td class="px-3 py-2 text-right">${c.open_count || 0}</td>
                <td class="px-3 py-2 text-right font-semibold ${parseFloat(c.open_rate) > 20 ? 'text-green-600' : 'text-gray-500'}">${c.open_rate || 0}%</td>
                <td class="px-3 py-2 text-right">${c.click_count || 0}</td>
                <td class="px-3 py-2 text-right font-semibold ${parseFloat(c.click_rate) > 3 ? 'text-green-600' : 'text-gray-500'}">${c.click_rate || 0}%</td>
                <td class="px-3 py-2 text-right text-yellow-600">${c.bounce_count || 0}</td>
                <td class="px-3 py-2 text-right text-red-500">${c.failed_count || 0}</td>
                <td class="px-3 py-2 text-gray-400">${eoFmtDate(c.completed_at || c.created_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Daily Activity & Bounced Contacts -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Daily Activity -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900"><i class="fas fa-calendar-alt mr-2 text-blue-500"></i>Daily Activity (30 days)</h3></div>
        <div class="p-4 max-h-64 overflow-auto">
          ${daily.length === 0 ? '<p class="text-center text-gray-400 text-xs py-4">No activity yet</p>' :
            daily.map(d => `
              <div class="flex items-center justify-between py-1.5 border-b border-gray-50 text-xs">
                <span class="text-gray-600 font-medium">${d.day}</span>
                <div class="flex gap-4">
                  <span class="text-blue-600">${d.sent} sent</span>
                  <span class="text-green-600">${d.delivered} delivered</span>
                  <span class="text-purple-600">${d.opened} opened</span>
                  ${d.failed > 0 ? `<span class="text-red-500">${d.failed} failed</span>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Top Bounced -->
      <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900"><i class="fas fa-exclamation-triangle mr-2 text-yellow-500"></i>Top Bounced Contacts</h3></div>
        <div class="p-4 max-h-64 overflow-auto">
          ${bounced.length === 0 ? '<p class="text-center text-gray-400 text-xs py-4">No bounced contacts</p>' :
            bounced.map(b => `
              <div class="flex items-center justify-between py-1.5 border-b border-gray-50 text-xs">
                <div>
                  <span class="font-medium text-gray-900">${escHtml(b.email)}</span>
                  <span class="text-gray-400 ml-2">${escHtml(b.company_name || '')}</span>
                </div>
                <div class="flex items-center gap-2">
                  ${eoStatusBadge(b.status)}
                  <span class="text-red-500 font-bold">${b.bounce_count}x</span>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

// ============================================================
// DE-DUPLICATION VIEW
// ============================================================
function renderEODedup() {
  const d = EO.dedupPreview;
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        ${eoBackBtn('dashboard')}
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-filter mr-2 text-yellow-600"></i>Contact De-duplication</h1>
      </div>
      <div class="flex gap-2">
        ${eoBtn('Scan for Duplicates', 'eoScanDuplicates()', 'yellow', 'fa-search', 'sm')}
        ${d && d.total_duplicate_entries > 0 ? eoBtn('Clean All Duplicates', 'eoCleanDuplicates()', 'red', 'fa-broom', 'sm') : ''}
      </div>
    </div>

    ${!d ? `
    <div class="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <i class="fas fa-filter text-gray-200 text-5xl mb-4"></i>
      <p class="text-gray-500 font-semibold">Scan for duplicate emails across all lists</p>
      <p class="text-xs text-gray-400 mt-2">De-duplication keeps the oldest entry for each email and removes duplicates.</p>
      <div class="mt-4">${eoBtn('Scan Now', 'eoScanDuplicates()', 'yellow', 'fa-search')}</div>
    </div>` : `
    <!-- Results -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      ${eoCard('Unique Duplicated Emails', d.unique_duplicate_emails || 0, 'fa-at', 'yellow')}
      ${eoCard('Extra Entries to Remove', d.total_duplicate_entries || 0, 'fa-trash', 'red')}
      ${eoCard('Status', d.total_duplicate_entries > 0 ? 'Action Needed' : 'Clean', d.total_duplicate_entries > 0 ? 'fa-exclamation-circle' : 'fa-check-circle', d.total_duplicate_entries > 0 ? 'yellow' : 'green')}
    </div>

    ${d.duplicates && d.duplicates.length > 0 ? `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900">Duplicate Emails Found</h3></div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-gray-50"><tr>
            <th class="px-4 py-2 text-left font-bold text-gray-500">Email</th>
            <th class="px-4 py-2 text-center font-bold text-gray-500">Occurrences</th>
            <th class="px-4 py-2 text-center font-bold text-gray-500">In Lists</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${d.duplicates.map(dup => `<tr class="hover:bg-yellow-50">
              <td class="px-4 py-2 font-medium">${escHtml(dup.email)}</td>
              <td class="px-4 py-2 text-center"><span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold">${dup.count}x</span></td>
              <td class="px-4 py-2 text-center text-gray-500">Lists: ${dup.list_ids}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '<div class="bg-green-50 border border-green-100 rounded-xl p-6 text-center"><i class="fas fa-check-circle text-green-500 text-3xl mb-2"></i><p class="text-green-700 font-semibold">No duplicates found! Your contact lists are clean.</p></div>'}
    `}
  </div>`;
}

// ============================================================
// NAVIGATION + DATA LOADING
// ============================================================
async function eoNav(view) {
  EO.view = view;
  const root = document.getElementById('sa-root');

  if (view === 'dashboard') return loadEODashboard();

  if (root) root.innerHTML = eoSpinner();

  if (view === 'lists') {
    const res = await eoFetch('/api/email-outreach/lists');
    if (res) { const d = await res.json(); EO.lists = d.lists || []; }
  }
  if (view === 'campaigns') {
    const [cRes, lRes, tRes] = await Promise.all([
      eoFetch('/api/email-outreach/campaigns'),
      eoFetch('/api/email-outreach/lists'),
      eoFetch('/api/email-outreach/templates')
    ]);
    if (cRes) { const d = await cRes.json(); EO.campaigns = d.campaigns || []; }
    if (lRes) { const d = await lRes.json(); EO.lists = d.lists || []; }
    if (tRes) { const d = await tRes.json(); EO.templates = d.templates || []; }
  }
  if (view === 'templates') {
    const res = await eoFetch('/api/email-outreach/templates');
    if (res) { const d = await res.json(); EO.templates = d.templates || []; }
  }
  if (view === 'analytics') {
    return eoLoadAnalytics();
  }
  if (view === 'dedup') {
    EO.dedupPreview = null;
  }
  renderEO();
}

async function eoLoadAnalytics() {
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = eoSpinner('Loading analytics...');
  try {
    const res = await eoFetch('/api/email-outreach/analytics');
    if (res) EO.analytics = await res.json();
  } catch {}
  EO.view = 'analytics';
  renderEO();
}

// ============================================================
// LIST ACTIONS
// ============================================================
async function eoViewList(id) {
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = eoSpinner();
  EO.contactPage = 0;
  EO.search = '';
  EO.contactStatusFilter = '';
  const res = await eoFetch(`/api/email-outreach/lists/${id}/contacts?limit=100&offset=0`);
  if (res) {
    const d = await res.json();
    EO.currentList = d.list;
    EO.currentContacts = d.contacts || [];
    EO.currentContactsTotal = d.total || 0;
  }
  EO.view = 'list-detail';
  renderEO();
}

async function eoSearchContacts(listId) {
  EO.search = document.getElementById('eoContactSearch')?.value || '';
  EO.contactPage = 0;
  const status = EO.contactStatusFilter || '';
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts?limit=100&offset=0&search=${encodeURIComponent(EO.search)}&status=${status}`);
  if (res) {
    const d = await res.json();
    EO.currentContacts = d.contacts || [];
    EO.currentContactsTotal = d.total || 0;
  }
  renderEO();
}

async function eoPageContacts(listId, page) {
  EO.contactPage = page;
  const status = EO.contactStatusFilter || '';
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts?limit=100&offset=${page * 100}&search=${encodeURIComponent(EO.search)}&status=${status}`);
  if (res) {
    const d = await res.json();
    EO.currentContacts = d.contacts || [];
    EO.currentContactsTotal = d.total || 0;
  }
  renderEO();
}

async function eoCreateList() {
  const name = prompt('List name (e.g. "Alberta Roofers 2026"):');
  if (!name) return;
  const desc = prompt('Description (optional):') || '';
  const tags = prompt('Tags, comma-separated (optional):') || '';
  const res = await eoFetch('/api/email-outreach/lists', {
    method: 'POST', body: JSON.stringify({ name, description: desc, tags })
  });
  if (res && res.ok) { eoToast('List created!'); eoNav('lists'); }
  else { const d = await res?.json(); eoToast(d?.error || 'Failed', 'error'); }
}

async function eoDeleteList(id, name) {
  if (!confirm(`Delete list "${name}" and ALL its contacts? This cannot be undone.`)) return;
  await eoFetch(`/api/email-outreach/lists/${id}`, { method: 'DELETE' });
  eoToast('List deleted');
  eoNav('lists');
}

async function eoExportList(listId) {
  const token = localStorage.getItem('rc_token');
  window.open(`/api/email-outreach/lists/${listId}/export?token=${token}`, '_blank');
  eoToast('Downloading CSV export...');
}

async function eoCleanBounced(listId) {
  if (!confirm('Delete all bounced contacts from this list?')) return;
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts/bulk?status=bounced`, { method: 'DELETE' });
  if (res && res.ok) { const d = await res.json(); eoToast(`Removed ${d.deleted} bounced contacts`); eoViewList(listId); }
}

// ============================================================
// CONTACT ACTIONS
// ============================================================
function eoAddContactModal(listId) {
  document.getElementById('eoContactModalTitle').innerHTML = '<i class="fas fa-user-plus mr-2 text-blue-500"></i>Add Contact';
  document.getElementById('eoMC_email').value = '';
  document.getElementById('eoMC_company').value = '';
  document.getElementById('eoMC_name').value = '';
  document.getElementById('eoMC_phone').value = '';
  document.getElementById('eoMC_city').value = '';
  document.getElementById('eoMC_province').value = '';
  document.getElementById('eoMC_website').value = '';
  document.getElementById('eoMC_contactId').value = '';
  document.getElementById('eoMC_listId').value = listId;
  document.getElementById('eoContactModal').classList.remove('hidden');
}

function eoEditContactModal(contactId, listId) {
  const contact = EO.currentContacts.find(c => c.id === contactId);
  if (!contact) return;
  document.getElementById('eoContactModalTitle').innerHTML = '<i class="fas fa-edit mr-2 text-blue-500"></i>Edit Contact';
  document.getElementById('eoMC_email').value = contact.email || '';
  document.getElementById('eoMC_company').value = contact.company_name || '';
  document.getElementById('eoMC_name').value = contact.contact_name || '';
  document.getElementById('eoMC_phone').value = contact.phone || '';
  document.getElementById('eoMC_city').value = contact.city || '';
  document.getElementById('eoMC_province').value = contact.province || '';
  document.getElementById('eoMC_website').value = contact.website || '';
  document.getElementById('eoMC_contactId').value = contactId;
  document.getElementById('eoMC_listId').value = listId;
  document.getElementById('eoContactModal').classList.remove('hidden');
}

async function eoSaveContactModal() {
  const contactId = document.getElementById('eoMC_contactId').value;
  const listId = parseInt(document.getElementById('eoMC_listId').value);
  const data = {
    email: document.getElementById('eoMC_email').value,
    company_name: document.getElementById('eoMC_company').value,
    contact_name: document.getElementById('eoMC_name').value,
    phone: document.getElementById('eoMC_phone').value,
    city: document.getElementById('eoMC_city').value,
    province: document.getElementById('eoMC_province').value,
    website: document.getElementById('eoMC_website').value
  };
  if (!data.email) { eoToast('Email is required', 'error'); return; }

  let res;
  if (contactId) {
    res = await eoFetch(`/api/email-outreach/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify(data) });
  } else {
    res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts`, { method: 'POST', body: JSON.stringify(data) });
  }

  if (res && res.ok) {
    eoToast(contactId ? 'Contact updated!' : 'Contact added!');
    document.getElementById('eoContactModal').classList.add('hidden');
    eoViewList(listId);
  } else {
    const d = await res?.json();
    eoToast(d?.error || 'Failed', 'error');
  }
}

async function eoDeleteContact(contactId, listId) {
  if (!confirm('Delete this contact?')) return;
  await eoFetch(`/api/email-outreach/contacts/${contactId}`, { method: 'DELETE' });
  eoToast('Contact deleted');
  eoViewList(listId);
}

// ============================================================
// CSV IMPORT (Paste & File Upload)
// ============================================================
function eoShowImport(listId) {
  document.getElementById('eoImportModal')?.classList.remove('hidden');
}

async function eoImportCSV(listId) {
  const raw = document.getElementById('eoCsvData')?.value || '';
  if (!raw.trim()) { eoToast('Paste CSV data first', 'error'); return; }

  const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) { eoToast('Need header row + at least 1 data row', 'error'); return; }

  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/"/g, ''));
  const emailIdx = header.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email_address');
  if (emailIdx === -1) { eoToast('CSV must have an "email" column', 'error'); return; }

  const fieldMap = {
    company_name: header.findIndex(h => h.includes('company') || h.includes('business')),
    contact_name: header.findIndex(h => h === 'name' || h === 'contact_name' || h === 'contact' || h === 'full_name'),
    phone: header.findIndex(h => h.includes('phone') || h.includes('tel')),
    city: header.findIndex(h => h === 'city' || h === 'town'),
    province: header.findIndex(h => h === 'province' || h === 'state' || h === 'prov'),
    website: header.findIndex(h => h.includes('website') || h.includes('url') || h.includes('web'))
  };

  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const email = cols[emailIdx];
    if (!email || !email.includes('@')) continue;
    const ct = { email };
    for (const [field, idx] of Object.entries(fieldMap)) {
      if (idx >= 0 && cols[idx]) ct[field] = cols[idx];
    }
    contacts.push(ct);
  }

  if (contacts.length === 0) { eoToast('No valid emails found in CSV', 'error'); return; }
  if (!confirm(`Import ${contacts.length} contacts?`)) return;

  const res = await eoFetch(`/api/email-outreach/lists/${listId}/import`, {
    method: 'POST', body: JSON.stringify({ contacts, source: 'csv_paste' })
  });
  if (res && res.ok) {
    const d = await res.json();
    eoToast(`Imported: ${d.imported}, Skipped: ${d.skipped}, Errors: ${d.errors}`);
    document.getElementById('eoImportModal')?.classList.add('hidden');
    eoViewList(listId);
  } else {
    const d = await res?.json();
    eoToast('Import error: ' + (d?.error || 'Failed'), 'error');
  }
}

async function eoUploadCSVFile(listId, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!confirm(`Upload "${file.name}" (${(file.size / 1024).toFixed(1)} KB)?`)) { input.value = ''; return; }

  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('rc_token');
  const res = await fetch(`/api/email-outreach/lists/${listId}/upload-csv`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  input.value = '';
  if (res && res.ok) {
    const d = await res.json();
    eoToast(`File "${d.filename}": ${d.imported} imported, ${d.skipped} skipped, ${d.errors} errors`);
    eoViewList(listId);
  } else {
    const d = await res?.json();
    eoToast('Upload error: ' + (d?.error || 'Failed'), 'error');
  }
}

// ============================================================
// CAMPAIGN ACTIONS
// ============================================================
function eoCreateCampaign() {
  EO.editCampaign = {};
  EO.view = 'campaign-editor';
  renderEO();
}

async function eoEditCampaign(id) {
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}`);
  if (res) {
    const d = await res.json();
    EO.editCampaign = d.campaign || {};
    // Also load lists and templates for the editor
    const [lRes, tRes] = await Promise.all([
      eoFetch('/api/email-outreach/lists'),
      eoFetch('/api/email-outreach/templates')
    ]);
    if (lRes) { const dl = await lRes.json(); EO.lists = dl.lists || []; }
    if (tRes) { const dt = await tRes.json(); EO.templates = dt.templates || []; }
  }
  EO.view = 'campaign-editor';
  renderEO();
}

async function eoSaveCampaign(id) {
  const data = {
    name: document.getElementById('eoC_name')?.value,
    subject: document.getElementById('eoC_subject')?.value,
    from_name: document.getElementById('eoC_from_name')?.value,
    from_email: document.getElementById('eoC_from_email')?.value,
    reply_to: document.getElementById('eoC_reply_to')?.value,
    body_html: document.getElementById('eoC_body_html')?.value,
    list_ids: document.getElementById('eoC_list_ids')?.value,
    send_rate_per_minute: parseInt(document.getElementById('eoC_rate')?.value) || 10
  };
  if (!data.name || !data.subject || !data.body_html || !data.list_ids) {
    eoToast('Name, Subject, Body HTML, and List IDs are required', 'error'); return;
  }

  const url = id ? `/api/email-outreach/campaigns/${id}` : '/api/email-outreach/campaigns';
  const method = id ? 'PUT' : 'POST';
  const res = await eoFetch(url, { method, body: JSON.stringify(data) });
  if (res && res.ok) {
    const d = await res.json();
    eoToast(id ? 'Campaign updated!' : 'Campaign created!');
    eoNav('campaigns');
    return d.id || id;
  } else {
    const d = await res?.json();
    eoToast(d?.error || 'Failed', 'error');
    return null;
  }
}

async function eoSaveAndSchedule() {
  const campaignId = await eoSaveCampaign(0);
  if (campaignId) {
    setTimeout(() => eoScheduleCampaign(campaignId), 500);
  }
}

async function eoViewCampaign(id) {
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = eoSpinner();
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}`);
  if (res) {
    const d = await res.json();
    EO.currentCampaign = d.campaign;
    EO.campaignStats = d.stats;
    EO.campaignSendLog = d.send_log || [];
  }
  EO.view = 'campaign-detail';
  renderEO();
}

async function eoSendCampaign(id) {
  if (!confirm('Send this campaign to ALL active contacts in the selected lists? This cannot be undone.')) return;
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = `<div class="flex flex-col items-center justify-center py-20">
    <div class="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
    <span class="text-gray-700 font-bold text-lg">Sending campaign...</span>
    <span class="text-xs text-gray-400 mt-2">This may take a while for large lists. Do not close this page.</span>
  </div>`;

  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/send`, { method: 'POST' });
  if (res && res.ok) {
    const d = await res.json();
    eoToast(`Campaign sent! ${d.sent} delivered, ${d.failed} failed via ${d.provider}`);
  } else {
    const d = await res?.json();
    eoToast('Send error: ' + (d?.error || 'Failed'), 'error');
  }
  eoViewCampaign(id);
}

async function eoScheduleCampaign(id) {
  const dateStr = prompt('Schedule send time (ISO format, e.g. 2026-03-15T09:00:00Z):');
  if (!dateStr) return;
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/schedule`, {
    method: 'PUT', body: JSON.stringify({ scheduled_at: dateStr })
  });
  if (res && res.ok) {
    eoToast('Campaign scheduled!');
    eoViewCampaign(id);
  } else {
    const d = await res?.json();
    eoToast(d?.error || 'Failed', 'error');
  }
}

async function eoCancelSchedule(id) {
  if (!confirm('Cancel scheduling and revert to draft?')) return;
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/schedule`, {
    method: 'PUT', body: JSON.stringify({ scheduled_at: null })
  });
  if (res && res.ok) { eoToast('Schedule cancelled'); eoViewCampaign(id); }
}

async function eoTestCampaign(id) {
  const email = prompt('Send test email to:', 'ethangourley17@gmail.com');
  if (!email) return;
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/test`, {
    method: 'POST', body: JSON.stringify({ test_email: email })
  });
  if (res && res.ok) { eoToast('Test email sent!'); }
  else { const d = await res?.json(); eoToast('Error: ' + (d?.error || 'Failed'), 'error'); }
}

async function eoDuplicateCampaign(id) {
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/duplicate`, { method: 'POST' });
  if (res && res.ok) { eoToast('Campaign duplicated!'); eoNav('campaigns'); }
  else { const d = await res?.json(); eoToast(d?.error || 'Failed', 'error'); }
}

async function eoDeleteCampaign(id) {
  if (!confirm('Delete this campaign and all its send logs?')) return;
  await eoFetch(`/api/email-outreach/campaigns/${id}`, { method: 'DELETE' });
  eoToast('Campaign deleted');
  eoNav('campaigns');
}

// ============================================================
// TEMPLATE ACTIONS
// ============================================================
function eoShowTemplateEditor() {
  document.getElementById('eoTpl_name').value = '';
  document.getElementById('eoTpl_subject').value = '';
  document.getElementById('eoTpl_body').value = '';
  document.getElementById('eoTpl_category').value = 'marketing';
  document.getElementById('eoTemplateModal')?.classList.remove('hidden');
}

async function eoSaveTemplate() {
  const name = document.getElementById('eoTpl_name')?.value;
  const subject = document.getElementById('eoTpl_subject')?.value;
  const body_html = document.getElementById('eoTpl_body')?.value;
  const category = document.getElementById('eoTpl_category')?.value;
  if (!name || !subject || !body_html) { eoToast('Name, subject, and body are required', 'error'); return; }

  const res = await eoFetch('/api/email-outreach/templates', {
    method: 'POST', body: JSON.stringify({ name, subject, body_html, category })
  });
  if (res && res.ok) {
    eoToast('Template created!');
    document.getElementById('eoTemplateModal')?.classList.add('hidden');
    eoNav('templates');
  } else {
    const d = await res?.json();
    eoToast(d?.error || 'Failed', 'error');
  }
}

async function eoDeleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await eoFetch(`/api/email-outreach/templates/${id}`, { method: 'DELETE' });
  eoToast('Template deleted');
  eoNav('templates');
}

async function eoUseTpl(id) {
  const tpl = EO.templates.find(t => t.id === id);
  if (!tpl) return;
  // Also load lists for the editor
  const lRes = await eoFetch('/api/email-outreach/lists');
  if (lRes) { const d = await lRes.json(); EO.lists = d.lists || []; }
  EO.editCampaign = {
    name: '', subject: tpl.subject, body_html: tpl.body_html,
    from_name: 'RoofReporterAI', from_email: '', reply_to: '', list_ids: ''
  };
  EO.view = 'campaign-editor';
  renderEO();
}

function eoLoadTemplateIntoEditor(tplId) {
  if (!tplId) return;
  const tpl = EO.templates.find(t => t.id === parseInt(tplId));
  if (tpl) {
    document.getElementById('eoC_body_html').value = tpl.body_html || '';
    if (!document.getElementById('eoC_subject').value) {
      document.getElementById('eoC_subject').value = tpl.subject || '';
    }
    eoToast('Template loaded into editor');
  }
}

// ============================================================
// DE-DUPLICATION ACTIONS
// ============================================================
async function eoScanDuplicates() {
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = eoSpinner('Scanning for duplicates...');
  try {
    const res = await eoFetch('/api/email-outreach/dedup/preview');
    if (res) EO.dedupPreview = await res.json();
  } catch {}
  EO.view = 'dedup';
  renderEO();
}

async function eoCleanDuplicates() {
  if (!confirm(`Remove ${EO.dedupPreview?.total_duplicate_entries || 0} duplicate entries? Oldest entry for each email will be kept.`)) return;
  const res = await eoFetch('/api/email-outreach/dedup/clean', { method: 'POST' });
  if (res && res.ok) {
    const d = await res.json();
    eoToast(`Removed ${d.removed} duplicate entries`);
    eoScanDuplicates();
  } else {
    eoToast('De-duplication failed', 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================
function eoInsertMergeTag(tag) {
  const el = document.getElementById('eoC_body_html');
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.substring(0, start) + tag + el.value.substring(end);
  el.focus();
  el.setSelectionRange(start + tag.length, start + tag.length);
}

function eoInsertListId(id) {
  const el = document.getElementById('eoC_list_ids');
  if (!el) return;
  const current = el.value.trim();
  const ids = current ? current.split(',').map(x => x.trim()) : [];
  if (!ids.includes(String(id))) {
    ids.push(String(id));
    el.value = ids.join(',');
    eoToast(`List ${id} added`);
  }
}
