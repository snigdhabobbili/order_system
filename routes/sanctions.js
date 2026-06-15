const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { getFY, currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, inr, confirmOverlay, successOverlay, fmtDate, canUserEdit, writeNotification } = require('../views/helpers');

const ALLOWED = ['admin','user2'];

function getNextSuffixSanction(db, baseNum, fy) {
  const rows = db.prepare(
    `SELECT sl_no_text FROM sanctions WHERE financial_year=? AND sl_no_text LIKE ?`
  ).all(fy, baseNum + '%');
  const suffixes = rows
    .map(r => String(r.sl_no_text).replace(String(baseNum), ''))
    .filter(s => /^[A-Z]$/.test(s));
  if (suffixes.length === 0) return baseNum + 'A';
  const last = suffixes.sort().pop();
  return baseNum + String.fromCharCode(last.charCodeAt(0) + 1);
}

function checkAccess(req, res, next) {
  if (!ALLOWED.includes(req.session.user.role)) return res.status(403).send('Access denied.');
  next();
}

router.get('/', checkAccess, (req, res) => {
  const db    = getDb();
  const user  = req.session.user;
  const curFY = currentFY();
  const fy    = req.query.fy || curFY;
  const isArchive = fy !== curFY;
  const pastFYs   = getPastFYs(db, 'sanctions');
  const rows = db.prepare('SELECT * FROM sanctions WHERE financial_year=? ORDER BY rowid ASC').all(fy);
  rows.sort((a, b) => {
    const aStr = String(a.sl_no_text || a.sl_no);
    const bStr = String(b.sl_no_text || b.sl_no);
    const aNum = parseInt(aStr); const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum;
    return aStr.localeCompare(bStr);
  });

  const tableRows = rows.map(row => `
    <tr>
      <td>${row.sl_no_text || row.sl_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td><div class="desc-short">${row.expenditure_details}</div><div class="desc-full" style="display:none">${row.expenditure_details}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${inr(row.amount)}</td>
      <td>${row.reference||'—'}</td>
      <td>${row.signature||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${actionButtons(row, user, isArchive && user.role !== 'admin', '/sanctions', r => 'Sanction No. ' + (r.sl_no_text||r.sl_no))}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('Sanction No.', req.query.saved) : ''}
    ${confirmOverlay('/sanctions')}

    <div class="page-header">
      <div>
        <div class="page-title">Sanction Memos</div>
        <div class="page-sub">${rows.length} entries · FY ${fy}</div>
      </div>
      <div class="header-actions">
        <select id="fySelect" class="filter-select">${fyOptions}</select>
        ${!isArchive ? `
          <button class="btn btn-primary" id="addEntryBtn"><i class="ti ti-plus"></i> Add entry</button>
          ${user.role === 'admin' ? `<button class="btn btn-outline" id="forgottenEntryBtn"><i class="ti ti-history"></i> Forgotten entry</button>` : ''}
        ` : ''}
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <span class="table-count">${rows.length} entries</span>
        <div class="download-group">
          <a href="/download/sanctions/excel?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-spreadsheet"></i> Excel</a>
          <a href="/download/sanctions/pdf?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-type-pdf"></i> PDF</a>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Sanction No.</th>
              <th>Date</th>
              <th>Expenditure Details</th>
              <th>Amount (₹)</th>
              <th>Reference</th>
              <th>Signature</th>
              <th>Entered By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${tableRows || '<tr><td colspan="8"><div class="empty-state"><i class="ti ti-inbox"></i><p>No entries yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span class="footer-total">${rows.length} entries</span>
      </div>
    </div>

    <!-- Add Modal -->
    <div class="modal-overlay" id="addModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Add new entry — Sanction Memos</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/sanctions" id="addForm">
            <div class="form-grid">
              <div class="form-group full">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off" class="today-default"/>
              </div>
              <div class="form-group full">
                <label>Expenditure Details <span class="req">*</span></label>
                <textarea name="expenditure_details" required autocomplete="off"></textarea>
              </div>
              <div class="form-group">
                <label>Amount (₹) <span class="req">*</span></label>
                <input type="number" name="amount" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Reference</label>
                <input type="text" name="reference" autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Signature</label>
                <input type="text" name="signature" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Sanction No. assigned at the moment you save</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelAdd">Cancel</button>
            <button type="submit" form="addForm" class="btn btn-primary">
              <i class="ti ti-device-floppy"></i> Save entry
            </button>
          </div>
        </div>
      </div>
    </div>


    <!-- Forgotten Entry Modal -->
    ${user.role === 'admin' ? `
    <div class="modal-overlay" id="forgottenModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Insert forgotten entry — Sanction Memos</span>
          <button class="modal-close" id="closeForgottenModal">×</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger" style="margin-bottom:16px"><i class="ti ti-alert-circle"></i> Inserts a forgotten entry with suffix e.g. 4A, 4B.</div>
          <form method="POST" action="/sanctions/forgotten" id="forgottenForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Insert after SL.NO <span class="req">*</span></label>
                <input type="number" name="after_sl_no" required min="1" step="1" autocomplete="off" placeholder="e.g. 4"/>
                <span class="field-hint">Entry will be inserted as 4A, 4B etc.</span>
              </div>
              <div class="form-group full">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Expenditure Details <span class="req">*</span></label>
                <textarea name="expenditure_details" required autocomplete="off"></textarea>
              </div>
              <div class="form-group">
                <label>Amount (₹) <span class="req">*</span></label>
                <input type="number" name="amount" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Reference</label>
                <input type="text" name="reference" autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Signature</label>
                <input type="text" name="signature" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix SL.NO assigned automatically e.g. 4A</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelForgotten">Cancel</button>
            <button type="submit" form="forgottenForm" class="btn btn-primary">
              <i class="ti ti-device-floppy"></i> Save forgotten entry
            </button>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Edit Modal -->
    <div class="modal-overlay" id="editModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Edit entry — Sanction Memos</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/sanctions/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-group full">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Expenditure Details <span class="req">*</span></label>
                <textarea name="expenditure_details" id="edit_expenditure_details" required autocomplete="off"></textarea>
              </div>
              <div class="form-group">
                <label>Amount (₹) <span class="req">*</span></label>
                <input type="number" name="amount" id="edit_amount" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Reference</label>
                <input type="text" name="reference" id="edit_reference" autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Signature</label>
                <input type="text" name="signature" id="edit_signature" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelEdit">Cancel</button>
            <button type="submit" form="editForm" class="btn btn-primary">
              <i class="ti ti-device-floppy"></i> Save changes
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const saScript = `<script>
  document.getElementById('fySelect').addEventListener('change', function() {
    window.location.href = '/sanctions?fy=' + encodeURIComponent(this.value);
  });
  const forgottenBtn = document.getElementById('forgottenEntryBtn');
  if (forgottenBtn) {
    forgottenBtn.addEventListener('click', () => document.getElementById('forgottenModal').classList.add('active'));
  }
  const cancelForgotten = document.getElementById('cancelForgotten');
  if (cancelForgotten) cancelForgotten.addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
  const closeForgotten = document.getElementById('closeForgottenModal');
  if (closeForgotten) closeForgotten.addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
  </script>`;
  res.send(layout(user, 'Sanction Memos', body + saScript));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { date, expenditure_details, amount, reference, signature } = req.body;
  const fy   = getFY(date);
  const sl_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(sl_no) as m FROM sanctions WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare(`INSERT INTO sanctions (sl_no,sl_no_text,financial_year,sanction_no,date,expenditure_details,amount,reference,signature,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(n, String(n), fy, String(n), date, expenditure_details, parseFloat(amount), reference||'', signature||'', user.username);
    return n;
  })();
  res.redirect('/sanctions?saved=' + sl_no);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, expenditure_details, amount, reference, signature } = req.body;
  const existing = db.prepare('SELECT * FROM sanctions WHERE id=?').get(id);
  if (!existing) return res.redirect('/sanctions');
  if (user.role !== 'admin' && user.role !== 'user1' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  db.prepare(`UPDATE sanctions SET date=?,expenditure_details=?,amount=?,reference=?,signature=? WHERE id=?`)
    .run(date, expenditure_details, parseFloat(amount), reference||'', signature||'', id);
  if (user.role !== 'admin') {
    writeNotification(db, 'Sanctions', id, 'edit', user.username,
      'Edited SL.NO ' + (existing.sl_no_text||existing.sl_no));
  }
  res.redirect('/sanctions');
});

router.post('/forgotten', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { after_sl_no, date, expenditure_details, amount, reference, signature } = req.body;
  const fy   = getFY(date);
  const sl_text = db.transaction(() => {
    const suffix = getNextSuffixSanction(db, after_sl_no, fy);
    db.prepare(`INSERT INTO sanctions (sl_no,sl_no_text,financial_year,sanction_no,date,expenditure_details,amount,reference,signature,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(parseInt(after_sl_no), suffix, fy, suffix, date, expenditure_details, parseFloat(amount), reference||'', signature||'', user.username);
    return suffix;
  })();
  res.redirect('/sanctions?saved=' + sl_text);
});

router.post('/forgotten', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { after_sl_no, date, expenditure_details, amount, reference, signature } = req.body;
  const fy   = getFY(date);
  const sl_text = db.transaction(() => {
    const suffix = getNextSuffixSanction(db, after_sl_no, fy);
    db.prepare(`INSERT INTO sanctions (sl_no,sl_no_text,financial_year,sanction_no,date,expenditure_details,amount,reference,signature,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(parseInt(after_sl_no), suffix, fy, suffix, date, expenditure_details, parseFloat(amount), reference||'', signature||'', user.username);
    return suffix;
  })();
  res.redirect('/sanctions?saved=' + sl_text);
});

router.post('/:id/delete', (req, res) => {
  if (!['admin','user1'].includes(req.session.user.role)) return res.status(403).send('Access denied.');
  getDb().prepare('DELETE FROM sanctions WHERE id=?').run(req.params.id);
  res.redirect('/sanctions');
});

module.exports = router;