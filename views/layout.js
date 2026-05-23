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
        <i class="ti ti-chevron-down nav-chevron"></i>
      </div>
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
</body>
</html>`;
}

function isEditable(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  return (now - created) / 36e5 <= 24;
}

module.exports = { layout, isEditable };
