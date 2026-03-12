// ============================================================
// Team Management — Add/manage sales team members ($50/user/month)
// Full CRUD: invite, view roster, change roles, suspend, remove
// ============================================================

var teamState = { loading: true, members: [], invitations: [], billing: null, canManage: true, isTeamMember: false };

function getToken() { return localStorage.getItem('rc_customer_token') || ''; }
function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

document.addEventListener('DOMContentLoaded', async function() {
  await loadTeamData();
  renderTeam();
});

async function loadTeamData() {
  teamState.loading = true;
  try {
    var res = await fetch('/api/team/members', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load team data');
    var data = await res.json();
    teamState.members = data.members || [];
    teamState.invitations = data.invitations || [];
    teamState.billing = data.billing || null;
    teamState.canManage = data.can_manage !== false;
    teamState.isTeamMember = data.is_team_member || false;
  } catch(e) {
    console.error('Team load error:', e);
  }
  teamState.loading = false;
}

function renderTeam() {
  var root = document.getElementById('team-root');
  if (!root) return;

  if (teamState.loading) {
    root.innerHTML = '<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div><span class="ml-4 text-gray-500 text-lg">Loading team...</span></div>';
    return;
  }

  var activeMembers = teamState.members.filter(function(m) { return m.status === 'active'; });
  var suspendedMembers = teamState.members.filter(function(m) { return m.status === 'suspended'; });
  var pendingInvites = teamState.invitations || [];
  var billing = teamState.billing;
  var monthlyCost = activeMembers.length * 50;

  // If user is a team member (not owner), show a different view
  if (teamState.isTeamMember && !teamState.canManage) {
    root.innerHTML = renderTeamMemberView(activeMembers);
    return;
  }

  var html = '';

  // ── Header + billing summary ──
  html += '<div class="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-6 text-white mb-6">';
  html += '  <div class="flex items-center justify-between">';
  html += '    <div>';
  html += '      <h2 class="text-2xl font-bold"><i class="fas fa-users-cog mr-2"></i>Sales Team</h2>';
  html += '      <p class="text-teal-100 mt-1">Add team members to your account — full CRM, reports, and AI access</p>';
  html += '    </div>';
  html += '    <div class="text-right">';
  html += '      <div class="text-3xl font-black">' + activeMembers.length + '</div>';
  html += '      <div class="text-teal-200 text-sm">active members</div>';
  html += '    </div>';
  html += '  </div>';
  if (activeMembers.length > 0) {
    html += '  <div class="mt-4 bg-white/10 rounded-lg px-4 py-2 flex items-center justify-between">';
    html += '    <span class="text-teal-100"><i class="fas fa-credit-card mr-2"></i>Monthly billing</span>';
    html += '    <span class="text-xl font-bold">$' + monthlyCost + '.00 <span class="text-sm font-normal text-teal-200">/month</span></span>';
    html += '  </div>';
  }
  html += '</div>';

  // ── Invite button ──
  html += '<div class="flex items-center justify-between mb-6">';
  html += '  <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-user-friends mr-2 text-teal-600"></i>Team Roster</h3>';
  html += '  <button onclick="showInviteModal()" class="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 px-5 rounded-lg text-sm transition-all hover:scale-105 shadow-lg shadow-teal-500/25">';
  html += '    <i class="fas fa-user-plus mr-2"></i>Invite Team Member';
  html += '  </button>';
  html += '</div>';

  // ── Active members table ──
  if (activeMembers.length > 0) {
    html += '<div class="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">';
    html += '<table class="w-full text-sm">';
    html += '<thead class="bg-gray-50 border-b"><tr>';
    html += '<th class="text-left px-4 py-3 font-semibold text-gray-600">Member</th>';
    html += '<th class="text-left px-4 py-3 font-semibold text-gray-600">Role</th>';
    html += '<th class="text-left px-4 py-3 font-semibold text-gray-600">Status</th>';
    html += '<th class="text-left px-4 py-3 font-semibold text-gray-600">Since</th>';
    html += '<th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>';
    html += '</tr></thead><tbody>';
    activeMembers.forEach(function(m) {
      html += '<tr class="border-b hover:bg-gray-50 transition-colors">';
      html += '<td class="px-4 py-3">';
      html += '  <div class="flex items-center gap-3">';
      html += '    <div class="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">';
      html += '      <span class="text-teal-700 font-bold text-sm">' + (m.name || 'U').charAt(0).toUpperCase() + '</span>';
      html += '    </div>';
      html += '    <div>';
      html += '      <div class="font-semibold text-gray-800">' + escHtml(m.name) + '</div>';
      html += '      <div class="text-xs text-gray-500">' + escHtml(m.email) + '</div>';
      html += '    </div>';
      html += '  </div>';
      html += '</td>';
      html += '<td class="px-4 py-3">';
      html += m.role === 'admin'
        ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700"><i class="fas fa-shield-alt mr-1"></i>Admin</span>'
        : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700"><i class="fas fa-user mr-1"></i>Member</span>';
      html += '</td>';
      html += '<td class="px-4 py-3"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-circle text-green-500 mr-1" style="font-size:6px"></i>Active</span></td>';
      html += '<td class="px-4 py-3 text-gray-500 text-xs">' + (m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '-') + '</td>';
      html += '<td class="px-4 py-3 text-right">';
      html += '  <div class="flex items-center justify-end gap-1">';
      html += '    <button onclick="toggleRole(' + m.id + ',\'' + (m.role === 'admin' ? 'member' : 'admin') + '\')" class="text-gray-400 hover:text-blue-600 p-1.5 rounded transition-colors" title="' + (m.role === 'admin' ? 'Demote to Member' : 'Promote to Admin') + '">';
      html += '      <i class="fas fa-' + (m.role === 'admin' ? 'user' : 'shield-alt') + '"></i>';
      html += '    </button>';
      html += '    <button onclick="suspendMember(' + m.id + ')" class="text-gray-400 hover:text-amber-600 p-1.5 rounded transition-colors" title="Suspend"><i class="fas fa-pause"></i></button>';
      html += '    <button onclick="removeMember(' + m.id + ',\'' + escHtml(m.name) + '\')" class="text-gray-400 hover:text-red-600 p-1.5 rounded transition-colors" title="Remove"><i class="fas fa-user-minus"></i></button>';
      html += '  </div>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<div class="bg-white rounded-xl shadow-sm border p-8 text-center mb-6">';
    html += '  <i class="fas fa-users text-gray-300 text-5xl mb-4"></i>';
    html += '  <h3 class="text-lg font-bold text-gray-700 mb-2">No team members yet</h3>';
    html += '  <p class="text-gray-500 mb-4 max-w-md mx-auto">Invite your sales team to access all platform features including roof reports, CRM, and AI Secretary.</p>';
    html += '  <button onclick="showInviteModal()" class="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 px-5 rounded-lg text-sm transition-all"><i class="fas fa-user-plus mr-2"></i>Invite Your First Member</button>';
    html += '</div>';
  }

  // ── Suspended members ──
  if (suspendedMembers.length > 0) {
    html += '<div class="mb-6">';
    html += '<h3 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3"><i class="fas fa-pause-circle mr-1"></i>Suspended (' + suspendedMembers.length + ')</h3>';
    html += '<div class="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">';
    suspendedMembers.forEach(function(m) {
      html += '<div class="flex items-center justify-between px-4 py-3 border-b border-amber-100 last:border-0">';
      html += '  <div class="flex items-center gap-3">';
      html += '    <div class="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center"><span class="text-amber-800 font-bold text-xs">' + (m.name || 'U').charAt(0) + '</span></div>';
      html += '    <div><span class="font-medium text-gray-700">' + escHtml(m.name) + '</span><span class="text-xs text-gray-400 ml-2">' + escHtml(m.email) + '</span></div>';
      html += '  </div>';
      html += '  <div class="flex gap-2">';
      html += '    <button onclick="reactivateMember(' + m.id + ')" class="text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-3 rounded font-semibold"><i class="fas fa-play mr-1"></i>Reactivate</button>';
      html += '    <button onclick="removeMember(' + m.id + ',\'' + escHtml(m.name) + '\')" class="text-xs bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded font-semibold"><i class="fas fa-trash mr-1"></i>Remove</button>';
      html += '  </div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Pending invitations ──
  if (pendingInvites.length > 0) {
    html += '<div class="mb-6">';
    html += '<h3 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3"><i class="fas fa-envelope-open-text mr-1"></i>Pending Invitations (' + pendingInvites.length + ')</h3>';
    html += '<div class="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">';
    pendingInvites.forEach(function(inv) {
      html += '<div class="flex items-center justify-between px-4 py-3 border-b border-blue-100 last:border-0">';
      html += '  <div>';
      html += '    <span class="font-medium text-gray-700">' + escHtml(inv.name) + '</span>';
      html += '    <span class="text-xs text-gray-400 ml-2">' + escHtml(inv.email) + '</span>';
      html += '    <span class="text-xs text-blue-500 ml-2">Expires ' + new Date(inv.expires_at).toLocaleDateString() + '</span>';
      html += '  </div>';
      html += '  <button onclick="cancelInvite(' + inv.id + ')" class="text-xs text-red-500 hover:text-red-700 font-semibold"><i class="fas fa-times mr-1"></i>Cancel</button>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Pricing info ──
  html += '<div class="bg-gray-50 rounded-xl border p-6">';
  html += '  <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-tag mr-2 text-teal-600"></i>Team Pricing</h3>';
  html += '  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">';
  html += '    <div class="bg-white rounded-lg p-4 border text-center">';
  html += '      <div class="text-3xl font-black text-teal-600">$50</div>';
  html += '      <div class="text-gray-500 text-sm">per user / month</div>';
  html += '    </div>';
  html += '    <div class="bg-white rounded-lg p-4 border">';
  html += '      <div class="font-semibold text-gray-700 mb-2">Each member gets:</div>';
  html += '      <ul class="text-sm text-gray-600 space-y-1">';
  html += '        <li><i class="fas fa-check text-teal-500 mr-1"></i>Order roof reports</li>';
  html += '        <li><i class="fas fa-check text-teal-500 mr-1"></i>Full CRM access</li>';
  html += '        <li><i class="fas fa-check text-teal-500 mr-1"></i>AI Roofer Secretary</li>';
  html += '        <li><i class="fas fa-check text-teal-500 mr-1"></i>Virtual Try-On</li>';
  html += '        <li><i class="fas fa-check text-teal-500 mr-1"></i>D2D Manager</li>';
  html += '      </ul>';
  html += '    </div>';
  html += '    <div class="bg-white rounded-lg p-4 border">';
  html += '      <div class="font-semibold text-gray-700 mb-2">Team billing:</div>';
  html += '      <ul class="text-sm text-gray-600 space-y-1">';
  html += '        <li><i class="fas fa-info-circle text-blue-400 mr-1"></i>Billed to account owner</li>';
  html += '        <li><i class="fas fa-info-circle text-blue-400 mr-1"></i>Suspend anytime to pause billing</li>';
  html += '        <li><i class="fas fa-info-circle text-blue-400 mr-1"></i>No contracts, cancel anytime</li>';
  html += '        <li><i class="fas fa-info-circle text-blue-400 mr-1"></i>Report credits shared with team</li>';
  html += '      </ul>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // ── Invite modal (hidden) ──
  html += renderInviteModal();

  root.innerHTML = html;
}

// ── Team Member View (read-only for regular team members) ──
function renderTeamMemberView(members) {
  var html = '<div class="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white mb-6">';
  html += '<h2 class="text-2xl font-bold"><i class="fas fa-users mr-2"></i>Your Team</h2>';
  html += '<p class="text-blue-200 mt-1">You are a member of this team</p>';
  html += '</div>';
  html += '<div class="bg-white rounded-xl shadow-sm border overflow-hidden">';
  members.forEach(function(m) {
    html += '<div class="flex items-center gap-3 px-4 py-3 border-b last:border-0">';
    html += '  <div class="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center"><span class="text-blue-700 font-bold">' + (m.name || 'U').charAt(0) + '</span></div>';
    html += '  <div><div class="font-semibold text-gray-800">' + escHtml(m.name) + '</div><div class="text-xs text-gray-500">' + escHtml(m.email) + ' · ' + m.role + '</div></div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="mt-6 text-center"><button onclick="leaveTeam()" class="text-red-500 hover:text-red-700 text-sm font-semibold"><i class="fas fa-sign-out-alt mr-1"></i>Leave Team</button></div>';
  return html;
}

// ── Invite Modal HTML ──
function renderInviteModal() {
  return '<div id="inviteModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">' +
    '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">' +
      '<div class="bg-gradient-to-r from-teal-500 to-emerald-600 px-6 py-4 text-white">' +
        '<h3 class="text-lg font-bold"><i class="fas fa-user-plus mr-2"></i>Invite Team Member</h3>' +
        '<p class="text-teal-100 text-sm">$50/month per user — full platform access</p>' +
      '</div>' +
      '<form onsubmit="sendInvite(event)" class="p-6 space-y-4">' +
        '<div>' +
          '<label class="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>' +
          '<input type="text" id="invName" required placeholder="e.g. John Smith" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500">' +
        '</div>' +
        '<div>' +
          '<label class="block text-sm font-semibold text-gray-700 mb-1">Email Address *</label>' +
          '<input type="email" id="invEmail" required placeholder="john@company.com" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500">' +
        '</div>' +
        '<div>' +
          '<label class="block text-sm font-semibold text-gray-700 mb-1">Role</label>' +
          '<select id="invRole" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500">' +
            '<option value="member">Team Member — Full access (no team management)</option>' +
            '<option value="admin">Team Admin — Full access + can manage team</option>' +
          '</select>' +
        '</div>' +
        '<div id="invMsg"></div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button type="button" onclick="hideInviteModal()" class="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>' +
          '<button type="submit" id="invBtn" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-all"><i class="fas fa-paper-plane mr-1"></i>Send Invite</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</div>';
}

// ── Modal controls ──
function showInviteModal() {
  document.getElementById('inviteModal').classList.remove('hidden');
  document.getElementById('invName').value = '';
  document.getElementById('invEmail').value = '';
  document.getElementById('invMsg').innerHTML = '';
}
function hideInviteModal() {
  document.getElementById('inviteModal').classList.add('hidden');
}

// ── Send Invite ──
async function sendInvite(e) {
  e.preventDefault();
  var btn = document.getElementById('invBtn');
  var msg = document.getElementById('invMsg');
  var name = document.getElementById('invName').value.trim();
  var email = document.getElementById('invEmail').value.trim();
  var role = document.getElementById('invRole').value;

  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Sending...';
  msg.innerHTML = '';

  try {
    var res = await fetch('/api/team/invite', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: name, email: email, role: role })
    });
    var data = await res.json();
    if (res.ok && data.success) {
      msg.innerHTML = '<div class="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm"><i class="fas fa-check-circle mr-1"></i>' + data.message + '</div>';
      setTimeout(async function() { hideInviteModal(); await loadTeamData(); renderTeam(); }, 1500);
    } else {
      msg.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">' + (data.error || 'Failed to send invite') + '</div>';
    }
  } catch(err) {
    msg.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">Network error</div>';
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Send Invite';
}

// ── Actions ──
async function toggleRole(memberId, newRole) {
  if (!confirm('Change role to ' + newRole + '?')) return;
  await fetch('/api/team/members/' + memberId, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ role: newRole }) });
  await loadTeamData(); renderTeam();
}

async function suspendMember(memberId) {
  if (!confirm('Suspend this team member? Their access and billing will be paused.')) return;
  await fetch('/api/team/members/' + memberId + '/suspend', { method: 'POST', headers: authHeaders() });
  await loadTeamData(); renderTeam();
}

async function reactivateMember(memberId) {
  if (!confirm('Reactivate this member? Billing will resume at $50/month.')) return;
  await fetch('/api/team/members/' + memberId + '/reactivate', { method: 'POST', headers: authHeaders() });
  await loadTeamData(); renderTeam();
}

async function removeMember(memberId, name) {
  if (!confirm('Remove ' + name + ' from your team? This will revoke their access immediately.')) return;
  await fetch('/api/team/members/' + memberId, { method: 'DELETE', headers: authHeaders() });
  await loadTeamData(); renderTeam();
}

async function cancelInvite(inviteId) {
  if (!confirm('Cancel this invitation?')) return;
  await fetch('/api/team/invite/' + inviteId, { method: 'DELETE', headers: authHeaders() });
  await loadTeamData(); renderTeam();
}

async function leaveTeam() {
  if (!confirm('Are you sure you want to leave this team? You will lose access to the team account.')) return;
  await fetch('/api/team/leave', { method: 'POST', headers: authHeaders() });
  window.location.href = '/customer/dashboard';
}

// ── Utility ──
function escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
