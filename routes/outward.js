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
  const pastFYs   = getPastFYs(db, 'outward_orders');
  const rows = db.prepare('SELECT * FROM outward_orders WHERE financial_year=? ORDER BY d_no ASC').all(fy);

  const tableRows = rows.map(row => `
    <tr>
      <td>${row.d_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.to_whom_addressed}</td>
      <td><div class="desc-short">${row.description}</div><div class="desc-full" style="display:none">${row.description}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${row.file_no||'—'}</td>
      <td>${row.remarks||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${isArchive ? '<span class="badge badge-locked">Locked</span>' : statusBadge(row.created_at)}</td>
      <td>${actionButtons(row, user, isArchive, '/outward', r => `D.NO ${r.d_no} — ${r.to_whom_addressed}`)}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('D.NO', req.query.saved) : ''}
    ${confirmOverlay('/outward')}

    <div class="page-header">
      <div>
        <div class="page-title">Outward orders</div>
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
          <a href="/download/outward/excel?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-spreadsheet"></i> Excel</a>
          <a href="/download/outward/pdf?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-type-pdf"></i> PDF</a>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>D.NO</th><th>Date</th><th>To Whom Addressed</th>
              <th>Description / Subject</th><th>File No.</th><th>Remarks</th>
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
          <span class="modal-title">Add new entry — Outward orders</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/outward" id="addForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required class="today-default"/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="to_whom_addressed" required/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="description" required/>
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
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> D.NO assigned at the moment you save</span>
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
          <span class="modal-title">Edit entry — Outward orders</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/outward/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="to_whom_addressed" id="edit_to_whom_addressed" required/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="description" id="edit_description" required/>
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

  res.send(layout(user, 'Outward Orders', body));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const fy   = currentFY();
  const { date, to_whom_addressed, description, file_no, remarks } = req.body;
  const d_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(d_no) as m FROM outward_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare(`INSERT INTO outward_orders (d_no,financial_year,date,to_whom_addressed,description,file_no,remarks,entered_by)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(n, fy, date, to_whom_addressed, description, file_no||'', remarks||'', user.username);
    return n;
  })();
  res.redirect(`/outward?saved=${d_no}`);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, to_whom_addressed, description, file_no, remarks } = req.body;
  const existing = db.prepare('SELECT * FROM outward_orders WHERE id=?').get(id);
  if (!existing) return res.redirect('/outward');
  if (user.role !== 'admin' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  db.prepare(`UPDATE outward_orders SET date=?,to_whom_addressed=?,description=?,file_no=?,remarks=? WHERE id=?`)
    .run(date, to_whom_addressed, description, file_no||'', remarks||'', id);
  res.redirect('/outward');
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM outward_orders WHERE id=?').run(req.params.id);
  res.redirect('/outward');
});

module.exports = router;
