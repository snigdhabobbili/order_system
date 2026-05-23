const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, confirmOverlay, successOverlay, fmtDate } = require('../views/helpers');

const ALLOWED = ['admin','user1'];
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
  const pastFYs   = getPastFYs(db, 'inward_orders');
  const rows = db.prepare('SELECT * FROM inward_orders WHERE financial_year=? ORDER BY c_no ASC').all(fy);

  const tableRows = rows.map(row => `
    <tr>
      <td>${row.c_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.received_from}</td>
      <td><div class="desc-short">${row.subject}</div><div class="desc-full" style="display:none">${row.subject}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${row.file_no||'—'}</td>
      <td>${row.remarks||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${isArchive ? '<span class="badge badge-locked">Locked</span>' : statusBadge(row.created_at)}</td>
      <td>${actionButtons(row, user, isArchive, '/inward', r => `C.NO ${r.c_no} — ${r.received_from}`)}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('C.NO', req.query.saved) : ''}
    ${confirmOverlay('/inward')}

    <div class="page-header">
      <div>
        <div class="page-title">Inward orders</div>
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
          <a href="/download/inward/excel?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-spreadsheet"></i> Excel</a>
          <a href="/download/inward/pdf?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-type-pdf"></i> PDF</a>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>C.NO</th><th>Date</th><th>Received From</th>
              <th>Subject</th><th>File No.</th><th>Remarks</th>
              <th>Entered By</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${tableRows || `<tr><td colspan="9"><div class="empty-state"><i class="ti ti-inbox"></i><p>No entries yet.</p></div></td></tr>`}
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
          <span class="modal-title">Add new entry — Inward orders</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/inward" id="addForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required class="today-default"/>
              </div>
              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="received_from" required/>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="subject" required/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" autocomplete="off" name="file_no"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" autocomplete="off" name="remarks"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> C.NO assigned at the moment you save</span>
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
          <span class="modal-title">Edit entry — Inward orders</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/inward/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required/>
              </div>
              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="received_from" id="edit_received_from" required/>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="subject" id="edit_subject" required/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" autocomplete="off" name="file_no" id="edit_file_no"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" autocomplete="off" name="remarks" id="edit_remarks"/>
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

  res.send(layout(user, 'Inward Orders', body));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const fy   = currentFY();
  const { date, received_from, subject, file_no, remarks } = req.body;
  const c_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(c_no) as m FROM inward_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare(`INSERT INTO inward_orders (c_no,financial_year,date,received_from,subject,file_no,remarks,entered_by)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(n, fy, date, received_from, subject, file_no||'', remarks||'', user.username);
    return n;
  })();
  res.redirect(`/inward?saved=${c_no}`);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, received_from, subject, file_no, remarks } = req.body;
  const existing = db.prepare('SELECT * FROM inward_orders WHERE id=?').get(id);
  if (!existing) return res.redirect('/inward');
  if (user.role !== 'admin' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  db.prepare(`UPDATE inward_orders SET date=?,received_from=?,subject=?,file_no=?,remarks=? WHERE id=?`)
    .run(date, received_from, subject, file_no||'', remarks||'', id);
  res.redirect('/inward');
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM inward_orders WHERE id=?').run(req.params.id);
  res.redirect('/inward');
});

module.exports = router;
