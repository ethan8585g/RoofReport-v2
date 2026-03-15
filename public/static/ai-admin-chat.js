// ═══════════════════════════════════════════════════════════════════
// AI Admin Chat — Intelligent Admin Assistant
// ═══════════════════════════════════════════════════════════════════

var AIChat = {
  messages: [],
  loading: false,
  capabilities: null
};

function aiChatHeaders() {
  var token = localStorage.getItem('rc_token');
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// ── Quick action prompts ──────────────────────────────────────────
var AI_QUICK_ACTIONS = [
  { icon: 'fa-chart-bar', label: 'Dashboard Stats', prompt: 'Show me todays dashboard stats - orders, revenue, new customers' },
  { icon: 'fa-blog', label: 'Write Blog Post', prompt: 'Write a professional blog post about the benefits of AI-powered roof inspections for commercial properties' },
  { icon: 'fa-dollar-sign', label: 'View Pricing', prompt: 'Show me all current pricing packages and settings' },
  { icon: 'fa-bullhorn', label: 'Create Banner', prompt: 'Create a promotional announcement banner: Spring Special - 25% off all roof reports this month!' },
  { icon: 'fa-users', label: 'Recent Customers', prompt: 'Show me the 10 most recent customers with their order counts and credits' },
  { icon: 'fa-file-alt', label: 'Recent Orders', prompt: 'Show me the 10 most recent orders with their status and addresses' },
  { icon: 'fa-edit', label: 'Update Landing', prompt: 'Update the landing page hero section with compelling new copy for our AI-powered roofing reports service' },
  { icon: 'fa-cog', label: 'Site Settings', prompt: 'Show me all current site settings and configurations' }
];

// ── Main render ───────────────────────────────────────────────────
function renderAIChat() {
  var quickBtns = '';
  for (var i = 0; i < AI_QUICK_ACTIONS.length; i++) {
    var a = AI_QUICK_ACTIONS[i];
    quickBtns += '<button onclick="aiChatQuickAction(' + i + ')" class="bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300 rounded-xl p-3 text-left transition-all group shadow-sm">' +
      '<i class="fas ' + a.icon + ' text-purple-500 group-hover:text-purple-600 mb-1 text-lg"></i>' +
      '<div class="text-xs font-semibold text-gray-700 group-hover:text-purple-700">' + a.label + '</div>' +
      '</button>';
  }

  var messagesHtml = '';
  if (AIChat.messages.length === 0) {
    messagesHtml = '<div class="text-center py-16">' +
      '<div class="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">' +
      '<i class="fas fa-robot text-3xl text-purple-500"></i></div>' +
      '<h3 class="text-lg font-bold text-gray-700 mb-2">Hi! I\'m your AI Site Manager</h3>' +
      '<p class="text-gray-500 text-sm max-w-md mx-auto mb-4">I can make real changes to your site — update content, manage orders, write blog posts, change pricing, view analytics, and more. Just ask!</p>' +
      '<div class="flex flex-wrap gap-2 justify-center">' +
      '<button onclick="aiChatQuickAction(0)" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-all">Show me stats</button>' +
      '<button onclick="aiChatQuickAction(1)" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-all">Create a blog post</button>' +
      '<button onclick="aiChatQuickAction(2)" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-all">Update pricing</button>' +
      '<button onclick="aiChatQuickAction(4)" class="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-all">View recent orders</button>' +
      '</div></div>';
  } else {
    for (var j = 0; j < AIChat.messages.length; j++) {
      messagesHtml += renderChatMessage(AIChat.messages[j]);
    }
  }

  var sendBtnClass = AIChat.loading
    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white';
  var sendBtnText = AIChat.loading
    ? '<i class="fas fa-spinner fa-spin mr-1"></i>Thinking...'
    : '<i class="fas fa-paper-plane mr-1"></i>Send';

  return '<div class="max-w-5xl mx-auto">' +

    // Header
    '<div class="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 rounded-2xl p-6 mb-6 shadow-xl text-white relative overflow-hidden">' +
      '<div class="absolute inset-0 opacity-10"><div class="absolute top-4 right-4 w-32 h-32 bg-white rounded-full blur-3xl"></div></div>' +
      '<div class="relative z-10 flex items-center justify-between">' +
        '<div class="flex items-center gap-3 mb-2">' +
          '<div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center"><i class="fas fa-brain text-2xl text-purple-200"></i></div>' +
          '<div><h2 class="text-2xl font-bold">AI Site Manager</h2><p class="text-purple-200 text-sm">Your intelligent admin assistant — ask me to do anything</p></div>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<span class="px-3 py-1 bg-green-500/20 border border-green-400/30 text-green-300 rounded-full text-xs font-semibold"><i class="fas fa-circle text-[8px] mr-1 animate-pulse"></i>Online</span>' +
          '<button onclick="aiChatLoadCapabilities()" class="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-all"><i class="fas fa-info-circle mr-1"></i>What can I do?</button>' +
          '<button onclick="aiChatClear()" class="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-all"><i class="fas fa-trash mr-1"></i>Clear</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Capabilities panel
    '<div id="ai-capabilities-panel" class="hidden mb-6">' +
      '<div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-gray-800"><i class="fas fa-tools mr-2 text-purple-600"></i>AI Capabilities</h3>' +
          '<button onclick="document.getElementById(\'ai-capabilities-panel\').classList.add(\'hidden\')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div id="ai-capabilities-list" class="grid grid-cols-1 md:grid-cols-2 gap-3"><div class="text-gray-500 text-sm">Loading capabilities...</div></div>' +
      '</div>' +
    '</div>' +

    // Quick actions
    '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">' + quickBtns + '</div>' +

    // Chat container
    '<div class="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden flex flex-col" style="height: 600px;">' +
      '<div id="ai-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4" style="scroll-behavior: smooth;">' + messagesHtml + '</div>' +
      '<div class="border-t border-gray-200 bg-gray-50 p-4">' +
        '<div class="flex gap-3">' +
          '<div class="flex-1"><textarea id="ai-chat-input" rows="2" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none text-sm" placeholder="Ask me anything — update content, check stats, write blog posts, manage orders..." onkeydown="if(event.key===\'Enter\' && !event.shiftKey){event.preventDefault(); aiChatSend()}" ' + (AIChat.loading ? 'disabled' : '') + '></textarea></div>' +
          '<button onclick="aiChatSend()" class="px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm ' + sendBtnClass + '" ' + (AIChat.loading ? 'disabled' : '') + '>' + sendBtnText + '</button>' +
        '</div>' +
        '<div class="flex items-center justify-between mt-2"><span class="text-[10px] text-gray-400">Press Enter to send, Shift+Enter for new line</span><span class="text-[10px] text-gray-400">' + AIChat.messages.length + ' messages</span></div>' +
      '</div>' +
    '</div>' +

  '</div>';
}

// ── Render a single chat message ──────────────────────────────────
function renderChatMessage(msg) {
  if (msg.role === 'user') {
    return '<div class="flex justify-end">' +
      '<div class="max-w-[75%] bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl rounded-br-md px-5 py-3 shadow-sm">' +
      '<div class="text-sm whitespace-pre-wrap">' + aiEscapeHtml(msg.content) + '</div>' +
      '<div class="text-[10px] text-purple-200 mt-1 text-right">' + aiFormatTime(msg.timestamp) + '</div>' +
      '</div></div>';
  }

  var actionsHtml = '';
  if (msg.actions && msg.actions.length > 0) {
    actionsHtml = '<div class="mt-3 space-y-2"><div class="text-xs font-semibold text-gray-500 flex items-center gap-1"><i class="fas fa-bolt text-amber-500"></i>Actions Taken:</div>';
    for (var i = 0; i < msg.actions.length; i++) {
      var a = msg.actions[i];
      var icon = a.success ? 'fa-check-circle' : 'fa-times-circle';
      var color = a.success ? 'text-green-500' : 'text-red-500';
      actionsHtml += '<div class="bg-gray-50 rounded-lg p-2.5 border border-gray-100">' +
        '<div class="flex items-center gap-2"><span class="' + color + '"><i class="fas ' + icon + '"></i></span>' +
        '<span class="text-xs font-mono font-semibold text-gray-700">' + a.tool + '</span>' +
        '<span class="text-[10px] text-gray-400">' + aiEscapeHtml(a.message) + '</span></div>';
      if (a.result) {
        actionsHtml += '<details class="mt-1"><summary class="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">View details</summary>' +
          '<pre class="mt-1 text-[10px] text-gray-500 bg-white rounded p-2 overflow-x-auto max-h-40">' + aiEscapeHtml(JSON.stringify(a.result, null, 2)) + '</pre></details>';
      }
      actionsHtml += '</div>';
    }
    actionsHtml += '</div>';
  }

  return '<div class="flex justify-start"><div class="max-w-[80%]">' +
    '<div class="flex items-center gap-2 mb-1">' +
    '<div class="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center"><i class="fas fa-brain text-white text-xs"></i></div>' +
    '<span class="text-xs font-semibold text-gray-600">AI Site Manager</span>' +
    '<span class="text-[10px] text-gray-400">' + aiFormatTime(msg.timestamp) + '</span></div>' +
    '<div class="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-5 py-3 shadow-sm">' +
    '<div class="text-sm text-gray-800 ai-response-content">' + aiFormatResponse(msg.content) + '</div>' +
    actionsHtml + '</div></div></div>';
}

// ── Send message ──────────────────────────────────────────────────
function aiChatSend() {
  var input = document.getElementById('ai-chat-input');
  var message = (input ? input.value : '').trim();
  if (!message || AIChat.loading) return;

  AIChat.messages.push({ role: 'user', content: message, timestamp: new Date() });
  input.value = '';
  AIChat.loading = true;
  aiChatRefresh();

  var apiMessages = [];
  for (var i = 0; i < AIChat.messages.length; i++) {
    var m = AIChat.messages[i];
    if (m.role === 'user' || m.role === 'assistant') {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  fetch('/api/ai-admin/chat', {
    method: 'POST',
    headers: aiChatHeaders(),
    body: JSON.stringify({ messages: apiMessages })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.error) {
      AIChat.messages.push({ role: 'assistant', content: 'Error: ' + data.error, timestamp: new Date(), actions: [] });
    } else {
      AIChat.messages.push({ role: 'assistant', content: data.reply || 'Done!', timestamp: new Date(), actions: data.actions || [] });
    }
    AIChat.loading = false;
    aiChatRefresh();
  })
  .catch(function(err) {
    AIChat.messages.push({ role: 'assistant', content: 'Connection error: ' + err.message, timestamp: new Date(), actions: [] });
    AIChat.loading = false;
    aiChatRefresh();
  });
}

// ── Quick action (by index) ───────────────────────────────────────
function aiChatQuickAction(index) {
  var input = document.getElementById('ai-chat-input');
  if (input && AI_QUICK_ACTIONS[index]) {
    input.value = AI_QUICK_ACTIONS[index].prompt;
    aiChatSend();
  }
}

// ── Refresh chat display ──────────────────────────────────────────
function aiChatRefresh() {
  var container = document.getElementById('ai-chat-messages');
  if (!container) {
    // Full re-render needed (e.g. from super admin)
    if (typeof renderContent === 'function') renderContent();
    else if (typeof render === 'function') render();
    return;
  }

  var html = '';
  for (var i = 0; i < AIChat.messages.length; i++) {
    html += renderChatMessage(AIChat.messages[i]);
  }

  if (AIChat.loading) {
    html += '<div class="flex justify-start"><div class="flex items-center gap-2">' +
      '<div class="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center"><i class="fas fa-brain text-white text-xs"></i></div>' +
      '<div class="bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm">' +
      '<div class="flex items-center gap-2">' +
      '<span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0s"></span>' +
      '<span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.15s"></span>' +
      '<span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.3s"></span>' +
      '<span class="text-xs text-gray-500">Thinking & executing...</span>' +
      '</div></div></div></div>';
  }

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;

  // Update button states
  var sendBtn = document.querySelector('button[onclick="aiChatSend()"]');
  if (sendBtn) {
    sendBtn.disabled = AIChat.loading;
    sendBtn.innerHTML = AIChat.loading ? '<i class="fas fa-spinner fa-spin mr-1"></i>Thinking...' : '<i class="fas fa-paper-plane mr-1"></i>Send';
    sendBtn.className = 'px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm ' +
      (AIChat.loading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white');
  }
  var textarea = document.getElementById('ai-chat-input');
  if (textarea) textarea.disabled = AIChat.loading;
}

// ── Load capabilities ─────────────────────────────────────────────
function aiChatLoadCapabilities() {
  var panel = document.getElementById('ai-capabilities-panel');
  var list = document.getElementById('ai-capabilities-list');
  if (!panel || !list) return;

  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden') && !AIChat.capabilities) {
    list.innerHTML = '<div class="text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i>Loading...</div>';
    fetch('/api/ai-admin/capabilities', { headers: aiChatHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        AIChat.capabilities = data;
        var icons = {
          query_database: 'fa-database', update_setting: 'fa-cog', create_blog_post: 'fa-blog',
          update_blog_post: 'fa-edit', update_order_status: 'fa-shopping-cart', update_site_content: 'fa-palette',
          manage_credit_package: 'fa-tag', send_announcement: 'fa-bullhorn', manage_customer: 'fa-users',
          generate_report_content: 'fa-file-alt', get_dashboard_stats: 'fa-chart-bar'
        };
        var html = '';
        for (var i = 0; i < data.tools.length; i++) {
          var t = data.tools[i];
          var ic = icons[t.name] || 'fa-wrench';
          var label = t.name.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
          var desc = t.description.length > 150 ? t.description.slice(0, 150) + '...' : t.description;
          html += '<div class="bg-gray-50 rounded-lg p-3 border border-gray-100">' +
            '<div class="flex items-center gap-2 mb-1"><i class="fas ' + ic + ' text-purple-500 text-sm"></i>' +
            '<span class="text-xs font-bold text-gray-700">' + label + '</span></div>' +
            '<p class="text-[11px] text-gray-500 leading-snug">' + aiEscapeHtml(desc) + '</p></div>';
        }
        list.innerHTML = html;
      })
      .catch(function(err) {
        list.innerHTML = '<div class="text-red-500 text-sm">Failed to load: ' + err.message + '</div>';
      });
  }
}

// ── Clear chat ────────────────────────────────────────────────────
function aiChatClear() {
  AIChat.messages = [];
  if (typeof renderContent === 'function') renderContent();
  else if (typeof render === 'function') render();
}

// ── Helpers ───────────────────────────────────────────────────────
function aiEscapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function aiFormatTime(date) {
  if (!date) return '';
  var d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function aiFormatResponse(content) {
  if (!content) return '';
  var html = aiEscapeHtml(content);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto my-2 border border-gray-200">$1</pre>');
  html = html.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-purple-700">$1</code>');
  html = html.replace(/^### (.*?)$/gm, '<h4 class="font-bold text-gray-800 mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3 class="font-bold text-gray-800 text-lg mt-3 mb-1">$1</h3>');
  html = html.replace(/\n/g, '<br>');
  return html;
}
