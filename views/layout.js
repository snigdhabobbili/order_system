function layout(user, title, body, extraHead = '') {
  const initials = user.username.slice(0, 1).toUpperCase();
  const roleLabel = user.role === 'admin' ? 'Administrator' : user.role === 'user1' ? 'User 1' : 'User 2';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} – TGTRANSCO IT Wing</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.10.0/dist/tabler-icons.min.css"/>
  <link rel="stylesheet" href="/css/main.css"/>
  ${extraHead}
</head>
<body>
  <nav class="navbar">
    <div class="navbar-left">
      <div class="navbar-brand">
        
        <span class="nav-title">TGTRANSCO</span>
      </div>
      
    </div>
    <div class="navbar-right">
      <div class="nav-user-btn">
        <div class="nav-avatar">${initials}</div>
        <span class="nav-username">${roleLabel}</span>
        
      </div>
      ${user.role === 'admin' ? `
      <div class="notif-wrap" id="notifWrap">
        <button class="notif-bell" id="notifBell" title="Notifications">
          <i class="ti ti-bell"></i>
          <span class="notif-badge" id="notifBadge" style="display:none">0</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-panel-header">
            <span class="notif-panel-title">Notifications</span>
            <div style="display:flex;gap:8px">
              <button class="notif-mark-read" id="markAllRead">Mark all read</button>
              <button class="notif-mark-read" id="clearAllNotif" style="color:#e53e3e">Clear all</button>
            </div>
          </div>
          <div class="notif-list" id="notifList">
            <div class="notif-empty">Loading…</div>
          </div>
        </div>
      </div>` : ''}
      <form action="/logout" method="POST" style="margin:0">
        <button class="btn-signout" type="submit">
          <i class="ti ti-logout"></i> Sign Out
        </button>
      </form>
    </div>
  </nav>
  <nav class="breadcrumb-bar">
    <i class="ti ti-home bc-home"></i>
    <a href="/dashboard" class="bc-link">Dashboard</a>
    ${title !== 'Dashboard' ? `<i class="ti ti-chevron-right bc-sep"></i><span class="bc-current">${title}</span>` : ''}
  </nav>
  <main class="main-content">
    ${body}
  </main>
  <footer class="footer">© 2026 All rights reserved by TGTRANSCO</footer>
  <script src="/js/main.js"></script>
  ${user.role === 'admin' ? `
  <style>
    .notif-wrap { position:relative; }
    .notif-bell {
      background: none; border: none; cursor: pointer;
      color: var(--text2, #5a6278); font-size: 20px;
      padding: 6px 8px; border-radius: var(--radius-sm, 6px);
      position: relative; display: flex; align-items: center;
      transition: background 0.15s;
    }
    .notif-bell:hover { background: var(--bg2, #f4f6f9); color: var(--primary, #1a4fa0); }
    .notif-badge {
      position: absolute; top: 2px; right: 2px;
      background: #e53e3e; color: #fff;
      font-size: 10px; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 99px;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px; pointer-events: none;
    }
    .notif-panel {
      display: none; position: absolute; right: 0; top: calc(100% + 8px);
      width: 360px; background: var(--surface, #fff);
      border: 1px solid var(--border, #e2e5ed);
      border-radius: var(--radius, 10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.13);
      z-index: 9999;
    }
    .notif-panel.open { display: flex; flex-direction: column; }
    .notif-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e5ed);
    }
    .notif-panel-title { font-weight: 700; font-size: 14px; color: var(--text1, #1a1f2e); }
    .notif-mark-read {
      background: none; border: none; cursor: pointer;
      font-size: 12px; color: var(--primary, #1a4fa0); padding: 0;
    }
    .notif-mark-read:hover { text-decoration: underline; }
    .notif-list { max-height: 360px; overflow-y: auto; }
    .notif-item {
      padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e5ed);
      display: flex; flex-direction: column; gap: 3px;
    }
    .notif-item.unread { background: #f0f5ff; }
    .notif-item-top { display: flex; align-items: center; justify-content: space-between; }
    .notif-module { font-size: 11px; font-weight: 600; color: var(--primary, #1a4fa0);
      background: #e8eeff; padding: 2px 7px; border-radius: 99px; }
    .notif-time { font-size: 11px; color: var(--text3, #9ca3af); }
    .notif-msg { font-size: 13px; color: var(--text1, #1a1f2e); }
    .notif-by { font-size: 11px; color: var(--text3, #9ca3af); }
    .notif-empty { padding: 24px 16px; text-align: center; color: var(--text3, #9ca3af); font-size: 13px; }
  </style>
  <script>
  (function() {
    const bell  = document.getElementById('notifBell');
    const panel = document.getElementById('notifPanel');
    const badge = document.getElementById('notifBadge');
    const list  = document.getElementById('notifList');
    if (!bell) return;

    function fmtTime(s) {
      const d = new Date(s);
      return d.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    }

    function loadNotifs() {
      fetch('/notifications/list')
        .then(r => r.json())
        .then(rows => {
          if (!rows.length) {
            list.innerHTML = '<div class="notif-empty"><i class="ti ti-bell-off"></i><br>No notifications yet</div>';
            return;
          }
          list.innerHTML = rows.map(n => \`
            <div class="notif-item \${n.is_read ? '' : 'unread'}">
              <div class="notif-item-top">
                <span class="notif-module">\${n.module}</span>
                <span class="notif-time">\${fmtTime(n.created_at)}</span>
              </div>
              <div class="notif-msg">\${n.message}</div>
              <div class="notif-by">by \${n.done_by}</div>
            </div>
          \`).join('');
        })
        .catch(() => { list.innerHTML = '<div class="notif-empty">Failed to load</div>'; });
    }

    function loadCount() {
      fetch('/notifications/unread-count')
        .then(r => r.json())
        .then(data => {
          if (data.count > 0) {
            badge.textContent = data.count > 99 ? '99+' : data.count;
            badge.style.display = 'flex';
          } else {
            badge.style.display = 'none';
          }
        });
    }

    // Poll every 30 seconds
    loadCount();
    setInterval(loadCount, 30000);

    bell.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      if (!isOpen) { loadNotifs(); panel.classList.add('open'); }
      else panel.classList.remove('open');
    });

    document.addEventListener('click', function(e) {
      if (!document.getElementById('notifWrap').contains(e.target)) {
        panel.classList.remove('open');
      }
    });

    document.getElementById('markAllRead').addEventListener('click', function() {
      fetch('/notifications/mark-all-read', { method:'POST' })
        .then(() => { badge.style.display = 'none'; loadNotifs(); });
    });

    document.getElementById('clearAllNotif').addEventListener('click', function() {
      fetch('/notifications/clear-all', { method:'POST' })
        .then(() => { badge.style.display = 'none'; loadNotifs(); });
    });
  })();
  </script>` : ''}
</body>
</html>`;
}

function isEditable(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  return (now - created) / 36e5 <= 24;
}

module.exports = { layout, isEditable };
