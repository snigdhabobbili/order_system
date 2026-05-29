const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout } = require('../views/layout');
const { currentFY } = require('../db/fy');

router.get('/', (req, res) => {
  const db    = getDb();
  const user  = req.session.user;
  const curFY = currentFY();
  const fy    = req.query.fy;

  if (!fy || fy === curFY) return res.redirect('/dashboard');

  const isAdmin = user.role === 'admin';
  const isUser1 = user.role === 'user1';
  const isUser2 = user.role === 'user2';

  const poCount  = db.prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE financial_year=?').get(fy).c;
  const saCount  = db.prepare('SELECT COUNT(*) as c FROM sanctions WHERE financial_year=?').get(fy).c;
  const inCount  = db.prepare('SELECT COUNT(*) as c FROM inward_orders WHERE financial_year=?').get(fy).c;
  const outCount = db.prepare('SELECT COUNT(*) as c FROM outward_orders WHERE financial_year=?').get(fy).c;

  // Build list of all past FYs
  const [curStart] = curFY.split('-').map(Number);
  const pastFYs = [];
  for (let y = curStart - 1; y >= 2020; y--) {
    pastFYs.push(y + '-' + (y + 1));
  }

  const fyOptions = pastFYs.map(f =>
    `<option value="${f}" ${f === fy ? 'selected' : ''}>${f}</option>`
  ).join('');

  function archiveCard(href, name, desc, count, allowed) {
    if (!allowed) return '';
    return `
    <a href="${href}?fy=${encodeURIComponent(fy)}" class="module-card">
      <div class="module-name">${name}</div>
      <div class="module-desc">${desc}</div>
      <hr class="module-divider"/>
      <div class="module-count">${count}</div>
      <div class="module-count-label">Total Records</div>
    </a>`;
  }

  const body = `
    <div class="dash-hero">
      <img src="/img/logo.jpg" alt="TGTRANSCO" class="dash-logo"
           style="border-radius:0;object-fit:contain;width:110px;height:110px;"
           onerror="this.style.display='none'"/>
      <div class="dash-org">Transmission Corporation of Telangana Limited</div>
      <div class="dash-sub">(A Govt. of Telangana Owned Company)</div>
      <div class="tricolor-line"></div>
      <div class="dash-section-title">
        <span class="dash-section-line"></span>
        IT Wing Registers — Archive
        <span class="dash-section-line"></span>
      </div>
    </div>

    <div class="dash-fy-row">
      <div>
        <div class="dash-fy-info">Financial Year: <strong>${fy}</strong></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <select id="archiveFySelect" class="filter-select" style="font-size:12px;padding:6px 12px">
          ${fyOptions}
        </select>
        <a href="/dashboard" class="btn btn-outline btn-sm">
          <i class="ti ti-arrow-left"></i> Current year
        </a>
      </div>
    </div>

    <div class="modules-grid">
      ${archiveCard('/purchase-orders', 'Purchase Orders', 'SAP PO · Supplier · GST', poCount, isAdmin||isUser2)}
      ${archiveCard('/sanctions', 'Sanction Memos', 'Sanction · Amount · Reference', saCount, isAdmin||isUser2)}
      ${archiveCard('/inward', 'Inward', 'Currents Register — Received mail', inCount, isAdmin||isUser1)}
      ${archiveCard('/outward', 'Outward', 'Dispatch Register — Sent mail', outCount, isAdmin||isUser1)}
    </div>

    <script>
      document.getElementById('archiveFySelect').addEventListener('change', function() {
        window.location.href = '/archive?fy=' + encodeURIComponent(this.value);
      });
    </script>
  `;

  res.send(layout(user, 'Archive ' + fy, body));
});

module.exports = router;
