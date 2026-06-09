const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout } = require('../views/layout');
const { currentFY, getPastFYs } = require('../db/fy');

router.get('/', (req, res) => { //When someone visits /dashboard, run this function
   //req — the incoming request (who is logged in, what they're asking for)
   //res — what to send back to the browser
  const db   = getDb(); // open database connection
  const fy   = currentFY(); //current financial year e.g. "2026-2027"
  const user = req.session.user; //who is logged in (from their session) e.g. { username: 'admin', role: 'admin' }

  const poCount  = db.prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE financial_year=?').get(fy).c;
  const saCount  = db.prepare('SELECT COUNT(*) as c FROM sanctions WHERE financial_year=?').get(fy).c;
  const inCount  = db.prepare('SELECT COUNT(*) as c FROM inward_orders WHERE financial_year=?').get(fy).c;
  const outCount = db.prepare('SELECT COUNT(*) as c FROM outward_orders WHERE financial_year=?').get(fy).c;

  // Generate all FYs from 2020-2021 up to (but not including) current
  const pastFYs = [];
  const [curStart] = fy.split('-').map(Number);
  for (let y = curStart - 1; y >= 2020; y--) {
    pastFYs.push(y + '-' + (y + 1));
  }

  const isAdmin = user.role === 'admin';
  const isUser1 = user.role === 'user1';
  const isUser2 = user.role === 'user2';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  function moduleCard(href, name, desc, count, allowed) {
    if (!allowed) return '';
    return `
    <a href="${href}" class="module-card">
      <div class="module-name">${name}</div>
      <div class="module-desc">${desc}</div>
      <hr class="module-divider"/>
      <div class="module-count">${count}</div>
      <div class="module-count-label">Total Records</div>
    </a>`;
  }

  const archiveSelect = pastFYs.length ? `
    <div class="archive-btn-row">
      <select id="fyArchiveSelect" class="filter-select" style="font-size:12px;padding:6px 12px">
        <option value="">View past financial year archives…</option>
        ${pastFYs.map(f => `<option value="${f}">${f} Archives</option>`).join('')}
      </select>
    </div>` : '';

  const body = `
    <div class="dash-hero">
      <img src="/img/logo.jpg" alt="TGTRANSCO" class="dash-logo" style="border-radius:0;object-fit:contain;width:110px;height:110px;"
           onerror="this.style.display='none'"/>
      <div class="dash-org">Transmission Corporation of Telangana Limited</div>
      <div class="dash-sub">(A Govt. of Telangana Owned Company)</div>
      <div class="tricolor-line"></div>
      <div class="dash-section-title">
        <span class="dash-section-line"></span>
        IT Wing Registers
        <span class="dash-section-line"></span>
      </div>
    </div>

    <div class="dash-fy-row">
      <div>
        <div class="dash-fy-info">Financial Year: <strong>${fy}</strong></div>
        <div class="dash-fy-date">${dateStr}</div>
      </div>
      ${archiveSelect}
    </div>

    <div class="modules-grid">
      ${moduleCard('/purchase-orders','Purchase Orders','SAP PO · Supplier · GST', poCount, isAdmin||isUser2)}
      ${moduleCard('/sanctions','Sanction Memos','Sanction · Amount · Reference', saCount, isAdmin||isUser2)}
      ${moduleCard('/inward','Inward','Currents Register — Received mail', inCount, isAdmin||isUser1)}
      ${moduleCard('/outward','Outward','Dispatch Register — Sent mail', outCount, isAdmin||isUser1)}
    </div>

    <script>
      const sel = document.getElementById('fyArchiveSelect');
      if (sel) sel.addEventListener('change', function() {
        if (this.value) window.location.href = '/archive?fy=' + encodeURIComponent(this.value);
      });
    </script>
  `;

  res.send(layout(user, 'Dashboard', body));
});

module.exports = router;
