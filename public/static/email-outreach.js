// ============================================================
// EMAIL OUTREACH MODULE — Super Admin Cold Email System
// Lists, Contacts (CSV import), Campaigns, Templates, Sending
// ============================================================

const EO = {
  view: 'dashboard', // dashboard | lists | list-detail | campaigns | campaign-detail | campaign-editor | templates
  lists: [],
  stats: {},
  campaigns: [],
  templates: [],
  currentList: null,
  currentContacts: [],
  currentContactsTotal: 0,
  currentCampaign: null,
  campaignSendLog: [],
  search: '',
  contactPage: 0
};

function eoHeaders() {
  const token = localStorage.getItem('rc_token');
  return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function eoFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...eoHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('rc_user');
    localStorage.removeItem('rc_token');
    window.location.href = '/login';
    return null;
  }
  return res;
}

// ============================================================
// ENTRY POINT — called by super-admin-dashboard.js
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

function eoSpinner() {
  return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div><span class="ml-3 text-gray-500">Loading email outreach...</span></div>`;
}

// ============================================================
// RENDER ROUTER
// ============================================================
function renderEO() {
  const root = document.getElementById('sa-root');
  if (!root) return;
  switch (EO.view) {
    case 'dashboard': root.innerHTML = renderEODashboard(); break;
    case 'lists': root.innerHTML = renderEOLists(); break;
    case 'list-detail': root.innerHTML = renderEOListDetail(); break;
    case 'campaigns': root.innerHTML = renderEOCampaigns(); break;
    case 'campaign-detail': root.innerHTML = renderEOCampaignDetail(); break;
    case 'campaign-editor': root.innerHTML = renderEOCampaignEditor(); break;
    case 'templates': root.innerHTML = renderEOTemplates(); break;
    default: root.innerHTML = renderEODashboard();
  }
}

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
  return `<button onclick="${onclick}" class="bg-${color}-600 hover:bg-${color}-700 text-white ${sz} rounded-lg font-semibold transition-all shadow-sm">
    ${icon ? `<i class="fas ${icon} mr-1.5"></i>` : ''}${label}
  </button>`;
}

function eoBtnOutline(label, onclick, color = 'gray', icon = '') {
  return `<button onclick="${onclick}" class="border border-${color}-300 text-${color}-700 hover:bg-${color}-50 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all">
    ${icon ? `<i class="fas ${icon} mr-1"></i>` : ''}${label}
  </button>`;
}

function eoBadge(text, color) {
  const colors = {
    green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700', gray: 'bg-gray-100 text-gray-700', purple: 'bg-purple-100 text-purple-700'
  };
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[color] || colors.gray}">${text}</span>`;
}

function statusBadge(status) {
  const map = { active: 'green', bounced: 'red', unsubscribed: 'yellow', complained: 'red',
    draft: 'gray', sending: 'blue', paused: 'yellow', completed: 'green', failed: 'red', queued: 'gray', sent: 'blue', delivered: 'green', opened: 'purple', clicked: 'green' };
  return eoBadge(status?.toUpperCase() || 'UNKNOWN', map[status] || 'gray');
}

// ============================================================
// DASHBOARD VIEW
// ============================================================
function renderEODashboard() {
  const s = EO.stats;
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-black text-gray-900"><i class="fas fa-envelope-open-text mr-2 text-blue-600"></i>Email Outreach</h1>
        <p class="text-sm text-gray-500 mt-1">Cold email marketing for roofing companies</p>
      </div>
      <div class="flex gap-2">
        ${eoBtn('Manage Lists', "eoNav('lists')", 'blue', 'fa-list')}
        ${eoBtn('Campaigns', "eoNav('campaigns')", 'green', 'fa-paper-plane')}
        ${eoBtn('Templates', "eoNav('templates')", 'purple', 'fa-file-alt')}
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${eoCard('Email Lists', s.total_lists || 0, 'fa-list', 'blue', `${s.total_contacts || 0} total contacts`)}
      ${eoCard('Active Contacts', s.active_contacts || 0, 'fa-user-check', 'green', `${s.unique_active_emails || 0} unique emails`)}
      ${eoCard('Campaigns', s.total_campaigns || 0, 'fa-paper-plane', 'purple', `${s.completed_campaigns || 0} completed`)}
      ${eoCard('Emails Sent', s.total_emails_sent || 0, 'fa-envelope', 'yellow', `${s.total_opens || 0} opens, ${s.total_clicks || 0} clicks`)}
    </div>

    <!-- Recent Lists -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-900"><i class="fas fa-list mr-2 text-blue-500"></i>Email Lists</h3>
        ${eoBtn('New List', 'eoCreateList()', 'blue', 'fa-plus', 'xs')}
      </div>
      <div class="divide-y divide-gray-50">
        ${EO.lists.length === 0 ? '<div class="p-6 text-center text-gray-400">No email lists yet. Create one to start importing contacts.</div>' :
          EO.lists.slice(0, 5).map(l => `
            <div class="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onclick="eoViewList(${l.id})">
              <div>
                <span class="font-semibold text-gray-900 text-sm">${l.name}</span>
                ${l.tags ? `<span class="ml-2 text-[10px] text-gray-400">${l.tags}</span>` : ''}
                ${l.description ? `<p class="text-xs text-gray-400 mt-0.5">${l.description}</p>` : ''}
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-blue-600">${l.total_contacts || l.contact_count || 0}</span>
                <span class="text-xs text-gray-400">contacts</span>
                <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
              </div>
            </div>
          `).join('')}
      </div>
      ${EO.lists.length > 5 ? `<div class="p-3 text-center border-t border-gray-50"><button onclick="eoNav('lists')" class="text-blue-600 text-xs font-semibold hover:underline">View all ${EO.lists.length} lists</button></div>` : ''}
    </div>

    <!-- Recent Campaigns -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-900"><i class="fas fa-paper-plane mr-2 text-green-500"></i>Campaigns</h3>
        ${eoBtn('New Campaign', 'eoCreateCampaign()', 'green', 'fa-plus', 'xs')}
      </div>
      <div class="divide-y divide-gray-50">
        ${EO.campaigns.length === 0 ? '<div class="p-6 text-center text-gray-400">No campaigns yet. Create one after building your email lists.</div>' :
          EO.campaigns.slice(0, 5).map(c => `
            <div class="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onclick="eoViewCampaign(${c.id})">
              <div>
                <span class="font-semibold text-gray-900 text-sm">${c.name}</span>
                <p class="text-xs text-gray-400 mt-0.5">${c.subject}</p>
              </div>
              <div class="flex items-center gap-3">
                ${statusBadge(c.status)}
                <span class="text-xs text-gray-400">${c.sent_count || 0}/${c.total_recipients || 0} sent</span>
              </div>
            </div>
          `).join('')}
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
        <button onclick="eoNav('dashboard')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-list mr-2 text-blue-600"></i>Email Lists</h1>
      </div>
      ${eoBtn('Create New List', 'eoCreateList()', 'blue', 'fa-plus')}
    </div>
    <div class="space-y-3">
      ${EO.lists.map(l => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-all">
          <div class="flex-1 cursor-pointer" onclick="eoViewList(${l.id})">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><i class="fas fa-list text-blue-500"></i></div>
              <div>
                <span class="font-bold text-gray-900">${l.name}</span>
                ${l.tags ? `<span class="ml-2">${l.tags.split(',').map(t => eoBadge(t.trim(), 'blue')).join(' ')}</span>` : ''}
                ${l.description ? `<p class="text-xs text-gray-400 mt-0.5">${l.description}</p>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 ml-4">
            <div class="text-center">
              <div class="text-lg font-black text-blue-600">${l.total_contacts || l.contact_count || 0}</div>
              <div class="text-[10px] text-gray-400">Total</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-green-600">${l.active_contacts || 0}</div>
              <div class="text-[10px] text-gray-400">Active</div>
            </div>
            ${l.bounced_contacts > 0 ? `<div class="text-center"><div class="text-sm font-bold text-red-500">${l.bounced_contacts}</div><div class="text-[10px] text-gray-400">Bounced</div></div>` : ''}
            <div class="flex gap-1">
              ${eoBtnOutline('View', `eoViewList(${l.id})`, 'blue', 'fa-eye')}
              ${eoBtnOutline('Delete', `eoDeleteList(${l.id}, '${l.name.replace(/'/g,"\\'")}')`, 'red', 'fa-trash')}
            </div>
          </div>
        </div>
      `).join('')}
      ${EO.lists.length === 0 ? '<div class="bg-white rounded-xl border border-gray-100 p-12 text-center"><i class="fas fa-list text-gray-200 text-4xl mb-3"></i><p class="text-gray-400">No email lists yet</p><p class="text-xs text-gray-300 mt-1">Create a list, then import your roofing company contacts</p></div>' : ''}
    </div>
  </div>`;
}

// ============================================================
// LIST DETAIL — Contacts table + Import
// ============================================================
function renderEOListDetail() {
  const l = EO.currentList;
  if (!l) return '<div class="p-8 text-red-500">List not found</div>';
  const contacts = EO.currentContacts || [];
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <button onclick="eoNav('lists')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div>
          <h1 class="text-xl font-black text-gray-900">${l.name}</h1>
          <p class="text-xs text-gray-400">${l.description || ''} ${l.tags ? '&bull; Tags: ' + l.tags : ''}</p>
        </div>
      </div>
      <div class="flex gap-2">
        ${eoBtn('Import CSV', `eoShowImport(${l.id})`, 'green', 'fa-file-csv')}
        ${eoBtn('Add Contact', `eoAddContact(${l.id})`, 'blue', 'fa-user-plus', 'xs')}
        ${eoBtnOutline('Clean Bounced', `eoCleanBounced(${l.id})`, 'red', 'fa-broom')}
      </div>
    </div>

    <!-- Search bar -->
    <div class="mb-4 flex gap-3">
      <input type="text" id="eoContactSearch" placeholder="Search by email, company, name, city..."
        class="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        value="${EO.search}" onkeyup="if(event.key==='Enter') eoSearchContacts(${l.id})">
      ${eoBtn('Search', `eoSearchContacts(${l.id})`, 'blue', 'fa-search', 'xs')}
      <span class="text-sm text-gray-400 self-center">${EO.currentContactsTotal} contacts</span>
    </div>

    <!-- Contacts Table -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
            <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Company</th>
            <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Contact</th>
            <th class="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">City</th>
            <th class="px-4 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
            <th class="px-4 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Sends</th>
            <th class="px-4 py-2.5 text-center text-xs font-bold text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${contacts.length === 0 ? `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">No contacts yet. Import a CSV or add contacts manually.</td></tr>` :
            contacts.map(c => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-2 font-medium text-gray-900 text-xs">${c.email}</td>
                <td class="px-4 py-2 text-xs text-gray-600">${c.company_name || '-'}</td>
                <td class="px-4 py-2 text-xs text-gray-600">${c.contact_name || '-'}</td>
                <td class="px-4 py-2 text-xs text-gray-600">${c.city || '-'}${c.province ? ', ' + c.province : ''}</td>
                <td class="px-4 py-2 text-center">${statusBadge(c.status)}</td>
                <td class="px-4 py-2 text-center text-xs text-gray-500">${c.sends_count || 0}</td>
                <td class="px-4 py-2 text-center">
                  <button onclick="eoDeleteContact(${c.id}, ${l.id})" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    ${EO.currentContactsTotal > 100 ? `
    <div class="flex items-center justify-between mt-4">
      <span class="text-xs text-gray-400">Showing ${EO.contactPage * 100 + 1}-${Math.min((EO.contactPage + 1) * 100, EO.currentContactsTotal)} of ${EO.currentContactsTotal}</span>
      <div class="flex gap-2">
        ${EO.contactPage > 0 ? eoBtn('Previous', `eoPageContacts(${l.id}, ${EO.contactPage - 1})`, 'gray', 'fa-chevron-left', 'xs') : ''}
        ${(EO.contactPage + 1) * 100 < EO.currentContactsTotal ? eoBtn('Next', `eoPageContacts(${l.id}, ${EO.contactPage + 1})`, 'gray', 'fa-chevron-right', 'xs') : ''}
      </div>
    </div>` : ''}

    <!-- CSV Import Modal (hidden by default) -->
    <div id="eoImportModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-black text-gray-900"><i class="fas fa-file-csv mr-2 text-green-500"></i>Import Contacts from CSV</h3>
          <button onclick="document.getElementById('eoImportModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-xs text-gray-500 mb-3">Paste CSV data or comma/tab-separated data. Expected columns: <strong>email, company_name, contact_name, phone, city, province, website</strong>. Only email is required.</p>
        <textarea id="eoCsvData" rows="12" class="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-green-500 outline-none"
          placeholder="email,company_name,contact_name,phone,city,province,website&#10;john@example.com,ABC Roofing,John Smith,780-555-1234,Edmonton,AB,www.abcroofing.com&#10;jane@example.com,XYZ Contractors,Jane Doe,403-555-5678,Calgary,AB,"></textarea>
        <div class="flex items-center justify-between mt-4">
          <span class="text-xs text-gray-400" id="eoCsvPreview"></span>
          ${eoBtn('Import Contacts', `eoImportCSV(${l.id})`, 'green', 'fa-upload')}
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
        <button onclick="eoNav('dashboard')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-paper-plane mr-2 text-green-600"></i>Email Campaigns</h1>
      </div>
      ${eoBtn('Create Campaign', 'eoCreateCampaign()', 'green', 'fa-plus')}
    </div>
    <div class="space-y-3">
      ${EO.campaigns.map(c => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-all cursor-pointer" onclick="eoViewCampaign(${c.id})">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><i class="fas fa-paper-plane text-green-500"></i></div>
            <div>
              <span class="font-bold text-gray-900">${c.name}</span>
              <p class="text-xs text-gray-400 mt-0.5">Subject: ${c.subject}</p>
            </div>
          </div>
          <div class="flex items-center gap-4 ml-4">
            ${statusBadge(c.status)}
            <div class="text-center">
              <div class="text-sm font-bold text-gray-900">${c.sent_count || 0}<span class="text-gray-300">/${c.total_recipients || 0}</span></div>
              <div class="text-[10px] text-gray-400">Sent</div>
            </div>
            ${c.open_count ? `<div class="text-center"><div class="text-sm font-bold text-purple-600">${c.open_count}</div><div class="text-[10px] text-gray-400">Opens</div></div>` : ''}
            <i class="fas fa-chevron-right text-gray-300 text-xs"></i>
          </div>
        </div>
      `).join('')}
      ${EO.campaigns.length === 0 ? '<div class="bg-white rounded-xl border border-gray-100 p-12 text-center"><i class="fas fa-paper-plane text-gray-200 text-4xl mb-3"></i><p class="text-gray-400">No campaigns yet</p></div>' : ''}
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
  return `
  <div class="slide-in">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <button onclick="eoNav('campaigns')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <div>
          <h1 class="text-xl font-black text-gray-900">${c.name}</h1>
          <p class="text-xs text-gray-400">Subject: ${c.subject} &bull; ${statusBadge(c.status)}</p>
        </div>
      </div>
      <div class="flex gap-2">
        ${c.status === 'draft' ? eoBtn('Send Campaign', `eoSendCampaign(${c.id})`, 'green', 'fa-paper-plane') : ''}
        ${c.status === 'draft' ? eoBtn('Send Test', `eoTestCampaign(${c.id})`, 'yellow', 'fa-flask', 'xs') : ''}
        ${eoBtn('Duplicate', `eoDuplicateCampaign(${c.id})`, 'purple', 'fa-copy', 'xs')}
        ${c.status === 'draft' ? eoBtnOutline('Delete', `eoDeleteCampaign(${c.id})`, 'red', 'fa-trash') : ''}
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${eoCard('Total Recipients', c.total_recipients || 0, 'fa-users', 'blue')}
      ${eoCard('Sent', stats.delivered || c.sent_count || 0, 'fa-check-circle', 'green')}
      ${eoCard('Opens', stats.opened || c.open_count || 0, 'fa-envelope-open', 'purple')}
      ${eoCard('Failed', stats.failed || c.failed_count || 0, 'fa-exclamation-circle', 'red')}
    </div>

    <!-- Email Preview -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
      <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900">Email Preview</h3></div>
      <div class="p-4">
        <div class="text-xs text-gray-500 mb-1"><strong>From:</strong> ${c.from_name || 'RoofReporterAI'} &lt;${c.from_email || 'not set'}&gt;</div>
        <div class="text-xs text-gray-500 mb-1"><strong>Subject:</strong> ${c.subject}</div>
        <div class="text-xs text-gray-500 mb-3"><strong>Lists:</strong> ${c.list_ids}</div>
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-64 overflow-auto text-xs">${c.body_html || '<em>No content</em>'}</div>
      </div>
    </div>

    <!-- Send Log -->
    ${log.length > 0 ? `
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div class="p-4 border-b border-gray-100"><h3 class="font-bold text-sm text-gray-900">Send Log (${log.length})</h3></div>
      <table class="w-full text-xs">
        <thead class="bg-gray-50"><tr>
          <th class="px-4 py-2 text-left font-bold text-gray-500 uppercase">Email</th>
          <th class="px-4 py-2 text-left font-bold text-gray-500 uppercase">Company</th>
          <th class="px-4 py-2 text-center font-bold text-gray-500 uppercase">Status</th>
          <th class="px-4 py-2 text-left font-bold text-gray-500 uppercase">Sent At</th>
          <th class="px-4 py-2 text-left font-bold text-gray-500 uppercase">Error</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
          ${log.map(e => `<tr class="hover:bg-gray-50">
            <td class="px-4 py-1.5 font-medium">${e.email}</td>
            <td class="px-4 py-1.5 text-gray-500">${e.company_name || '-'}</td>
            <td class="px-4 py-1.5 text-center">${statusBadge(e.status)}</td>
            <td class="px-4 py-1.5 text-gray-400">${e.sent_at || '-'}</td>
            <td class="px-4 py-1.5 text-red-400 max-w-xs truncate">${e.error_message || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
  </div>`;
}

// ============================================================
// CAMPAIGN EDITOR (Create/Edit)
// ============================================================
function renderEOCampaignEditor() {
  const c = EO.editCampaign || {};
  return `
  <div class="slide-in">
    <div class="flex items-center gap-3 mb-6">
      <button onclick="eoNav('campaigns')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-black text-gray-900">${c.id ? 'Edit Campaign' : 'New Campaign'}</h1>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-3xl">
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Campaign Name *</label>
          <input id="eoC_name" value="${c.name || ''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="e.g. Alberta Roofers Q1 2026">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Email Subject *</label>
          <input id="eoC_subject" value="${c.subject || ''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none" placeholder="e.g. Save time with AI roof measurements - {{company_name}}">
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">From Name</label>
          <input id="eoC_from_name" value="${c.from_name || 'RoofReporterAI'}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">From Email</label>
          <input id="eoC_from_email" value="${c.from_email || ''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="reports@reusecanada.ca">
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Reply-To</label>
          <input id="eoC_reply_to" value="${c.reply_to || ''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="ethangourley17@gmail.com">
        </div>
      </div>
      <div class="mb-4">
        <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Target Lists (IDs) *</label>
        <input id="eoC_list_ids" value="${c.list_ids || ''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" placeholder="1,2,3">
        <p class="text-[10px] text-gray-400 mt-1">Available lists: ${EO.lists.map(l => `${l.id} = ${l.name} (${l.total_contacts || l.contact_count || 0})`).join(', ') || 'None — create lists first'}</p>
      </div>
      <div class="mb-4">
        <label class="text-xs font-bold text-gray-500 uppercase block mb-1">Email Body (HTML) *</label>
        <textarea id="eoC_body_html" rows="16" class="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-green-500 outline-none"
          placeholder="<h2>Hello {{contact_name}},</h2>&#10;<p>We noticed {{company_name}} is a roofing contractor in your area...</p>">${c.body_html || ''}</textarea>
        <p class="text-[10px] text-gray-400 mt-1">Merge tags: <code>{{company_name}}</code> <code>{{contact_name}}</code> <code>{{first_name}}</code> <code>{{email}}</code></p>
      </div>
      <div class="flex gap-3">
        ${eoBtn(c.id ? 'Update Campaign' : 'Create Campaign', `eoSaveCampaign(${c.id || 0})`, 'green', 'fa-save')}
        ${eoBtnOutline('Cancel', "eoNav('campaigns')", 'gray', 'fa-times')}
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
        <button onclick="eoNav('dashboard')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></button>
        <h1 class="text-xl font-black text-gray-900"><i class="fas fa-file-alt mr-2 text-purple-600"></i>Email Templates</h1>
      </div>
      ${eoBtn('Create Template', 'eoCreateTemplate()', 'purple', 'fa-plus')}
    </div>
    <div class="space-y-3">
      ${(EO.templates || []).map(t => `
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
          <div>
            <span class="font-bold text-gray-900">${t.name}</span>
            ${eoBadge(t.category || 'marketing', 'purple')}
            <p class="text-xs text-gray-400 mt-0.5">Subject: ${t.subject}</p>
          </div>
          <div class="flex gap-2">
            ${eoBtnOutline('Use in Campaign', `eoUseTpl(${t.id})`, 'green', 'fa-copy')}
            ${eoBtnOutline('Delete', `eoDeleteTemplate(${t.id})`, 'red', 'fa-trash')}
          </div>
        </div>
      `).join('')}
      ${(EO.templates || []).length === 0 ? '<div class="bg-white rounded-xl border p-12 text-center text-gray-400"><i class="fas fa-file-alt text-gray-200 text-4xl mb-3"></i><p>No templates yet</p></div>' : ''}
    </div>
  </div>`;
}

// ============================================================
// NAVIGATION + ACTIONS
// ============================================================
async function eoNav(view) {
  EO.view = view;
  if (view === 'dashboard') return loadEODashboard();
  if (view === 'lists') {
    const res = await eoFetch('/api/email-outreach/lists');
    if (res) { const d = await res.json(); EO.lists = d.lists || []; }
  }
  if (view === 'campaigns') {
    const [cRes, lRes] = await Promise.all([
      eoFetch('/api/email-outreach/campaigns'),
      eoFetch('/api/email-outreach/lists')
    ]);
    if (cRes) { const d = await cRes.json(); EO.campaigns = d.campaigns || []; }
    if (lRes) { const d = await lRes.json(); EO.lists = d.lists || []; }
  }
  if (view === 'templates') {
    const res = await eoFetch('/api/email-outreach/templates');
    if (res) { const d = await res.json(); EO.templates = d.templates || []; }
  }
  renderEO();
}

async function eoViewList(id) {
  const root = document.getElementById('sa-root');
  if (root) root.innerHTML = eoSpinner();
  EO.contactPage = 0;
  EO.search = '';
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
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts?limit=100&offset=0&search=${encodeURIComponent(EO.search)}`);
  if (res) {
    const d = await res.json();
    EO.currentContacts = d.contacts || [];
    EO.currentContactsTotal = d.total || 0;
  }
  renderEO();
}

async function eoPageContacts(listId, page) {
  EO.contactPage = page;
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts?limit=100&offset=${page * 100}&search=${encodeURIComponent(EO.search)}`);
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
  if (res && res.ok) {
    alert('List created!');
    eoNav('lists');
  } else {
    const d = await res?.json(); alert('Error: ' + (d?.error || 'Failed'));
  }
}

async function eoDeleteList(id, name) {
  if (!confirm(`Delete list "${name}" and ALL its contacts?`)) return;
  await eoFetch(`/api/email-outreach/lists/${id}`, { method: 'DELETE' });
  eoNav('lists');
}

async function eoAddContact(listId) {
  const email = prompt('Email address:');
  if (!email) return;
  const company = prompt('Company name (optional):') || '';
  const name = prompt('Contact name (optional):') || '';
  const city = prompt('City (optional):') || '';
  const province = prompt('Province (optional):') || '';
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts`, {
    method: 'POST', body: JSON.stringify({ email, company_name: company, contact_name: name, city, province })
  });
  if (res && res.ok) { eoViewList(listId); } else { const d = await res?.json(); alert('Error: ' + (d?.error || 'Failed')); }
}

async function eoDeleteContact(contactId, listId) {
  if (!confirm('Delete this contact?')) return;
  await eoFetch(`/api/email-outreach/contacts/${contactId}`, { method: 'DELETE' });
  eoViewList(listId);
}

async function eoCleanBounced(listId) {
  if (!confirm('Delete all bounced contacts from this list?')) return;
  const res = await eoFetch(`/api/email-outreach/lists/${listId}/contacts/bulk?status=bounced`, { method: 'DELETE' });
  if (res && res.ok) { const d = await res.json(); alert(`Deleted ${d.deleted} bounced contacts`); eoViewList(listId); }
}

function eoShowImport(listId) {
  document.getElementById('eoImportModal')?.classList.remove('hidden');
}

async function eoImportCSV(listId) {
  const raw = document.getElementById('eoCsvData')?.value || '';
  if (!raw.trim()) { alert('Paste CSV data first'); return; }

  // Parse CSV
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) { alert('Need at least a header row and one data row'); return; }

  const header = lines[0].toLowerCase().split(/[,\t]/).map(h => h.trim().replace(/"/g, ''));
  const emailIdx = header.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email_address');
  if (emailIdx === -1) { alert('CSV must have an "email" column'); return; }

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
    const cols = lines[i].split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
    const email = cols[emailIdx];
    if (!email || !email.includes('@')) continue;
    const ct = { email };
    for (const [field, idx] of Object.entries(fieldMap)) {
      if (idx >= 0 && cols[idx]) ct[field] = cols[idx];
    }
    contacts.push(ct);
  }

  if (contacts.length === 0) { alert('No valid email addresses found in CSV'); return; }
  if (!confirm(`Import ${contacts.length} contacts?`)) return;

  const res = await eoFetch(`/api/email-outreach/lists/${listId}/import`, {
    method: 'POST', body: JSON.stringify({ contacts, source: 'csv_import' })
  });
  if (res && res.ok) {
    const d = await res.json();
    alert(`Imported: ${d.imported}, Skipped: ${d.skipped}, Errors: ${d.errors}`);
    document.getElementById('eoImportModal')?.classList.add('hidden');
    eoViewList(listId);
  } else {
    const d = await res?.json(); alert('Import error: ' + (d?.error || 'Failed'));
  }
}

function eoCreateCampaign() {
  EO.editCampaign = {};
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
    list_ids: document.getElementById('eoC_list_ids')?.value
  };
  if (!data.name || !data.subject || !data.body_html || !data.list_ids) {
    alert('Name, Subject, Body HTML, and List IDs are required'); return;
  }

  const url = id ? `/api/email-outreach/campaigns/${id}` : '/api/email-outreach/campaigns';
  const method = id ? 'PUT' : 'POST';
  const res = await eoFetch(url, { method, body: JSON.stringify(data) });
  if (res && res.ok) { alert(id ? 'Campaign updated!' : 'Campaign created!'); eoNav('campaigns'); }
  else { const d = await res?.json(); alert('Error: ' + (d?.error || 'Failed')); }
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
    <div class="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
    <span class="text-gray-600 font-bold">Sending campaign...</span>
    <span class="text-xs text-gray-400 mt-1">This may take a while for large lists</span>
  </div>`;

  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/send`, { method: 'POST' });
  if (res && res.ok) {
    const d = await res.json();
    alert(`Campaign sent!\nTotal: ${d.total_recipients}\nSent: ${d.sent}\nFailed: ${d.failed}\nProvider: ${d.provider}`);
  } else {
    const d = await res?.json(); alert('Send error: ' + (d?.error || 'Failed'));
  }
  eoViewCampaign(id);
}

async function eoTestCampaign(id) {
  const email = prompt('Send test email to:', 'ethangourley17@gmail.com');
  if (!email) return;
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/test`, {
    method: 'POST', body: JSON.stringify({ test_email: email })
  });
  if (res && res.ok) { alert('Test email sent!'); } else { const d = await res?.json(); alert('Error: ' + (d?.error || 'Failed')); }
}

async function eoDuplicateCampaign(id) {
  const res = await eoFetch(`/api/email-outreach/campaigns/${id}/duplicate`, { method: 'POST' });
  if (res && res.ok) { alert('Campaign duplicated!'); eoNav('campaigns'); } else { const d = await res?.json(); alert('Error: ' + (d?.error || 'Failed')); }
}

async function eoDeleteCampaign(id) {
  if (!confirm('Delete this campaign and all its send logs?')) return;
  await eoFetch(`/api/email-outreach/campaigns/${id}`, { method: 'DELETE' });
  eoNav('campaigns');
}

async function eoCreateTemplate() {
  const name = prompt('Template name:');
  if (!name) return;
  const subject = prompt('Subject line:') || '';
  const body = prompt('Paste HTML body (or simple text):') || '';
  const res = await eoFetch('/api/email-outreach/templates', {
    method: 'POST', body: JSON.stringify({ name, subject, body_html: body, category: 'marketing' })
  });
  if (res && res.ok) { alert('Template created!'); eoNav('templates'); }
}

async function eoDeleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await eoFetch(`/api/email-outreach/templates/${id}`, { method: 'DELETE' });
  eoNav('templates');
}

async function eoUseTpl(id) {
  const tpl = EO.templates.find(t => t.id === id);
  if (!tpl) return;
  EO.editCampaign = {
    name: '', subject: tpl.subject, body_html: tpl.body_html,
    from_name: 'RoofReporterAI', from_email: '', reply_to: '', list_ids: ''
  };
  EO.view = 'campaign-editor';
  renderEO();
}
