const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, inr, confirmOverlay, successOverlay, fmtDate } = require('../views/helpers');

const ALLOWED = ['admin','user2'];
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
  const rows = db.prepare('SELECT * FROM sanctions WHERE financial_year=? ORDER BY sl_no ASC').all(fy);
  const totalVal = rows.reduce((s,r) => s + (r.amount||0), 0);

  const tableRows = rows.map(row => `
    <tr>
      <td>${Math.round(row.sanction_no)}</td>
      <td>${fmtDate(row.date)}</td>
      <td><div class="desc-short">${row.expenditure_details}</div><div class="desc-full" style="display:none">${row.expenditure_details}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${inr(row.amount)}</td>
      <td>${row.reference||'—'}</td>
      <td>${row.signature||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${isArchive ? '<span class="badge badge-locked">Locked</span>' : statusBadge(row.created_at)}</td>
      <td>${actionButtons(row, user, isArchive, '/sanctions', r => `SL.NO ${r.sl_no} — ${r.sanction_no}`)}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('SL.NO', req.query.saved) : ''}
    ${confirmOverlay('/sanctions')}

    <div class="page-header">
      <div>
        <div class="page-title">Sanction Memos</div>
        <div class="page-sub">${rows.length} entries · FY ${fy}${isArchive ? ' · <span class="badge badge-archive">Archive – Read only</span>' : ' · Entries editable within 24 hours'}</div>
      </div>
      <div class="header-actions">
        <select id="fySelect" class="filter-select">${fyOptions}</select>
        ${!isArchive ? `<button class="btn btn-primary" id="addEntryBtn"><i class="ti ti-plus"></i> Add entry</button>` : ''}
      </div>
    </div>

    ${isArchive ? `<div class="archive-banner"><i class="ti ti-lock"></i> Read-only archive for FY ${fy}.</div>` : ''}

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
              <th>Sanction No.</th><th>Date</th>
              <th>Expenditure Details</th><th>Amount (₹)</th>
              <th>Reference</th><th>Signature</th>
              <th>Entered By</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${tableRows || `<tr><td colspan="10"><div class="empty-state"><i class="ti ti-inbox"></i><p>No entries yet.</p></div></td></tr>`}
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
          <span class="modal-title">Add new entry — Sanctions</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/sanctions" id="addForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required class="today-default"/>
              </div>
              
              <div class="form-group full">
                <label>Expenditure Details <span class="req">*</span></label>
                <textarea autocomplete="off" name="expenditure_details" required></textarea>
              </div>
              <div class="form-group">
                <label>Amount (₹) <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="amount" id="san_amount" required min="0" step="any"/>
              </div>
              <div class="form-group">
                <label>Reference</label>
                <input type="text" autocomplete="off" name="reference"/>
              </div>
              <div class="form-group">
                <label>Signature</label>
                <input type="text" autocomplete="off" name="signature"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Sanction No. assigned at the moment you save</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelAdd">Cancel</button>
            <button class="btn btn-primary" onclick="document.getElementById('addForm').submit()">
              <i class="ti ti-device-floppy"></i> Save entry
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div class="modal-overlay" id="editModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Edit entry — Sanctions</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/sanctions/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required/>
              </div>
              
              <div class="form-group full">
                <label>Expenditure Details <span class="req">*</span></label>
                <textarea autocomplete="off" name="expenditure_details" id="edit_expenditure_details" required></textarea>
              </div>
              <div class="form-group">
                <label>Amount (₹) <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="amount" id="edit_amount" required min="0" step="any"/>
              </div>
              <div class="form-group">
                <label>Reference</label>
                <input type="text" autocomplete="off" name="reference" id="edit_reference"/>
              </div>
              <div class="form-group">
                <label>Signature</label>
                <input type="text" autocomplete="off" name="signature" id="edit_signature"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelEdit">Cancel</button>
            <button class="btn btn-primary" onclick="document.getElementById('editForm').submit()">
              <i class="ti ti-device-floppy"></i> Save changes
            </button>
          </div>
        </div>
      </div>
    </div>`;

  res.send(layout(user, 'Sanctions', body));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const fy   = currentFY();
  const { date, expenditure_details, amount, reference, signature } = req.body;
  const sl_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(sl_no) as m FROM sanctions WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare(`INSERT INTO sanctions (sl_no,financial_year,sanction_no,date,expenditure_details,amount,reference,signature,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(n, fy, String(n), date, expenditure_details, parseFloat(amount), reference||'', signature||'', user.username);
    return n;
  })();
  res.redirect(`/sanctions?saved=${sl_no}`);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, expenditure_details, amount, reference, signature } = req.body;
  const existing = db.prepare('SELECT * FROM sanctions WHERE id=?').get(id);
  if (!existing) return res.redirect('/sanctions');
  if (user.role !== 'admin' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  db.prepare(`UPDATE sanctions SET date=?,sanction_no=?,expenditure_details=?,amount=?,reference=?,signature=? WHERE id=?`)
    .run(date, sanction_no, expenditure_details, parseFloat(amount), reference||'', signature||'', id);
  res.redirect('/sanctions');
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM sanctions WHERE id=?').run(req.params.id);
  res.redirect('/sanctions');
});

module.exports = router;
