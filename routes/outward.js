const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { getFY, currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, confirmOverlay, successOverlay, fmtDate, writeNotification } = require('../views/helpers');

// Search filter values — add more here when available
const TO_WHOM_VALUES = [
  'CMD', 'Director (Grid and Transmission Management',
  'Director (Projects)','Director (Finance)','Director (Lift Irrigation & Schemes)','Director (Grid Operations)','ED/Comml/TGPCC\t',
  'CGM/HRD\t','CE/IT\t','CE/Transmission\t','CE/Construction-I\t','CE/Construction-II\t',
  'CE/ P& MM\t','CE/400KV\t','CE/Telecom' , 'CE/Comml & RAC', 'CE/ Civil', 'CE/SLDC ( FAC)', 'CE/LIS- Incharge', 'CE/PR/LIS', 'CE/Power System', 'Joint Secretary', 'FA&CCA(R&A & CFO)(I/C)', 'FA&CCA /TGPCC (I/C)', 'CE/Digitalization', 'CE/Training/CTI', 'CE/Metro', 'CE/Rural','CE/ Warangal', 'CE/400kV Wgl', 'CE/Karimnagar',
];

const ALLOWED = ['admin','user1'];

function getNextSuffixOutward(db, baseNum, fy) {
  const rows = db.prepare(
    `SELECT d_no_text FROM outward_orders WHERE financial_year=? AND d_no_text LIKE ?`
  ).all(fy, baseNum + '/%');
  const suffixes = rows
    .map(r => String(r.d_no_text).replace(baseNum + '/', ''))
    .filter(s => /^[A-Z]$/.test(s));
  if (suffixes.length === 0) return baseNum + '/A';
  const last = suffixes.sort().pop();
  return baseNum + '/' + String.fromCharCode(last.charCodeAt(0) + 1);
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
  const pastFYs   = getPastFYs(db, 'outward_orders');
  const rows = db.prepare('SELECT * FROM outward_orders WHERE financial_year=? ORDER BY rowid ASC').all(fy);
  rows.sort((a, b) => {
    const aStr = String(a.d_no_text || a.d_no);
    const bStr = String(b.d_no_text || b.d_no);
    const aNum = parseInt(aStr); const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum;
    return aStr.localeCompare(bStr);
  });

  const checkboxes = TO_WHOM_VALUES.map(v =>
    `<label class="search-check-item"><input type="checkbox" class="to-check" value="${v.toLowerCase()}"/> ${v}</label>`
  ).join('') + `
    <label class="search-check-item" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px">
      <input type="checkbox" class="to-check" id="toOtherCheck" value="__other__"/> Other
    </label>
    <div id="toOtherInput" style="display:none;margin-top:6px;padding-left:22px">
      <input type="text" id="toOtherText" placeholder="Type recipient name…"
             style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px"
             autocomplete="off" oninput="filterTable()"/>
    </div>`;

  const tableRows = rows.map(row => `
    <tr data-search="${[row.d_no, row.to_whom_addressed, row.description, row.file_no, row.remarks, row.entered_by].join(' ').toLowerCase()}" data-to="${(row.to_whom_addressed||'').toLowerCase()}">
      <td>${row.d_no_text || row.d_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.to_whom_addressed}</td>
      <td>${row.description}</td>
      
      <td>${row.file_no||'—'}</td>
      <td>${row.remarks||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${actionButtons(row, user, isArchive && user.role !== 'admin', '/outward', r => 'D.NO ' + (r.d_no_text||r.d_no) + ' — ' + r.to_whom_addressed)}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    '<option value="' + f + '" ' + (f===fy?'selected':'') + '>' + f + (f===curFY?' (current)':' – Archive') + '</option>'
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('D.NO', req.query.saved) : ''}
    ${req.query.error ? `<div class="alert alert-danger" style="margin:16px 0"><i class="ti ti-alert-circle"></i> ${req.query.error}</div>` : ''}
    ${confirmOverlay('/outward')}

    <div class="page-header">
      <div>
        <div class="page-title">Outward orders</div>
        <div class="page-sub">${rows.length} entries · FY ${fy}${isArchive ? '' : ' · Entries editable within 24 hours'}</div>
      </div>
      <div class="header-actions">
        <select id="fySelect" class="filter-select">${fyOptions}</select>
        ${!isArchive ? `
          <button class="btn btn-primary" id="addEntryBtn"><i class="ti ti-plus"></i> Add entry</button>
          ${user.role === 'admin' ? `
            <button
    class="btn btn-outline"
    id="insertEntryBtn"
    style="height:50px;"
>
    <i class="ti ti-list-numbers"></i> Insert
</button>
            <button class="btn btn-outline" id="forgottenEntryBtn"><i class="ti ti-history"></i> Forgotten entry</button>
          ` : ''}
        ` : ''}
      </div>
    </div>

    <!-- Search bar with checkboxes -->
    <div class="search-bar-wrap">
      <div class="search-dropdown-wrap">
        <button type="button" class="search-dropdown-btn" id="toDropdownBtn">
          <i class="ti ti-filter"></i> Filter by recipient <i class="ti ti-chevron-down" style="font-size:12px"></i>
        </button>
        <div class="search-dropdown-panel" id="toDropdownPanel">
          <label class="search-check-item" style="font-weight:600;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:4px">
            <input type="checkbox" id="toSelectAll"/> Select all
          </label>
          ${checkboxes}
        </div>
      </div>
      <div class="search-main">
        <i class="ti ti-search"></i>
        <input type="text" id="tableSearch" placeholder="Search by description, file no, remarks…" oninput="filterTable()" autocomplete="off"/>
      </div>
      <button class="btn btn-outline btn-sm" onclick="clearSearch()"><i class="ti ti-x"></i> Clear</button>
    </div>

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
              <th>D.NO</th>
              <th>Date</th>
              <th>To Whom Addressed</th>
              <th>Description / Subject</th>
              <th>File No.</th>
              <th>Remarks</th>
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
          <span class="modal-title">Add new entry — Outward orders</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/outward" id="addForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off" class="today-default"/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" name="to_whom_addressed" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" name="description" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> D.NO assigned at the moment you save</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelAdd">Cancel</button>
            <button class="btn btn-primary" type="submit" form="addForm">
              <i class="ti ti-device-floppy"></i> Save entry
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Insert Modal (Admin only) -->
    ${user.role === 'admin' ? `
    <div class="modal-overlay" id="insertModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Insert entry — Outward orders</span>
          <button class="modal-close" id="closeInsertModal">×</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger" style="margin-bottom:16px"><i class="ti ti-alert-circle"></i> Insert a record at any exact D.NO. Existing records are never renumbered.</div>
          <form method="POST" action="/outward/insert" id="insertForm">
            <div class="form-grid">
              <div class="form-group">
                <label>D.NO <span class="req">*</span></label>
                <input type="number" name="d_no_insert" required min="1" step="1" autocomplete="off" placeholder="e.g. 5"/>
                <span class="field-hint">Must not already exist in this FY.</span>
              </div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" name="to_whom_addressed" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" name="description" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Record will appear in correct sorted position</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelInsert">Cancel</button>
            <button class="btn btn-primary" type="submit" form="insertForm">
              <i class="ti ti-device-floppy"></i> Save entry
            </button>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Forgotten Entry Modal -->
    ${user.role === 'admin' ? `
    <div class="modal-overlay" id="forgottenModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Insert forgotten entry — Outward orders</span>
          <button class="modal-close" id="closeForgottenModal">×</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger" style="margin-bottom:16px"><i class="ti ti-alert-circle"></i> Inserts a forgotten entry with suffix D.NO e.g. 4/A, 4/B.</div>
          <form method="POST" action="/outward/forgotten" id="forgottenForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Insert after D.NO <span class="req">*</span></label>
                <input type="number" name="after_d_no" required min="1" step="1" autocomplete="off" placeholder="e.g. 4"/>
                <span class="field-hint">Entry will be inserted as 4/A, 4/B etc.</span>
              </div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" name="to_whom_addressed" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" name="description" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix D.NO assigned automatically e.g. 4/A</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelForgotten">Cancel</button>
            <button class="btn btn-primary" type="submit" form="forgottenForm">
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
          <span class="modal-title">Edit entry — Outward orders</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/outward/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              ${user.role === 'admin' ? `
              <div class="form-group">
                <label>D.NO <span class="req">*</span></label>
                <input type="text" name="d_no_text" id="edit_d_no_text" required autocomplete="off"/>
                <span class="field-hint">Admin only. Must be unique within this FY.</span>
              </div>` : ''}
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>To Whom Addressed <span class="req">*</span></label>
                <input type="text" name="to_whom_addressed" id="edit_to_whom_addressed" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Subject <span class="req">*</span></label>
                <input type="text" name="description" id="edit_description" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>File No.</label>
                <input type="text" name="file_no" id="edit_file_no" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Remarks</label>
                <input type="text" name="remarks" id="edit_remarks" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span></span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelEdit">Cancel</button>
            <button class="btn btn-primary" type="submit" form="editForm">
              <i class="ti ti-device-floppy"></i> Save changes
            </button>
          </div>
        </div>
      </div>
    </div>`;

  // Inject search JS
  const searchScript = `
    <script>
    function filterTable() {
      const q = document.getElementById('tableSearch').value.toLowerCase();
      const checks = document.querySelectorAll('.to-check:checked');
      const otherText = (document.getElementById('toOtherText').value || '').toLowerCase().trim();
      const selectedTo = Array.from(checks)
        .filter(c => c.value !== '__other__')
        .map(c => c.value);
      const otherChecked = document.getElementById('toOtherCheck').checked;
      const rows = document.querySelectorAll('#tableBody tr[data-search]');
      let visible = 0;
      rows.forEach(row => {
        const textMatch = !q || row.dataset.search.includes(q);
        const rowTo = (row.dataset.to || '');
        let toMatch = true;
        if (selectedTo.length > 0 || otherChecked) {
          const namedMatch = selectedTo.some(v => rowTo.includes(v));
          const otherMatch = otherChecked && otherText && rowTo.includes(otherText);
          toMatch = namedMatch || otherMatch;
        }
        const show = textMatch && toMatch;
        row.style.display = show ? '' : 'none';
        if (show) visible++;

        // Highlight matching text
        row.querySelectorAll('td').forEach(td => {
          const original = td.dataset.original || td.innerText;
          td.dataset.original = original;
          if (show && q) {
            const escaped = q.replace(/[.+?^$()|[\\]\\\\*{}]/g, '\\x24&'.replace('x24','')); const regex = new RegExp('(' + escaped + ')', 'gi');
            td.innerHTML = original.replace(regex, '<mark style="background:#fef08a;border-radius:2px;padding:0 1px">$1</mark>');
          } else {
            td.innerText = original;
          }
        });
      });
      const countEl = document.querySelector('.table-count');
      if (countEl) countEl.textContent = visible + ' entries';
    }
    function clearSearch() {
      document.getElementById('tableSearch').value = '';
      document.querySelectorAll('.to-check').forEach(c => c.checked = false);
      document.getElementById('toOtherText').value = '';
      document.getElementById('toOtherInput').style.display = 'none';
      const all = document.getElementById('toSelectAll');
      if (all) all.checked = false;
      filterTable();
    }
    // Dropdown toggle
    document.getElementById('toDropdownBtn').addEventListener('click', function() {
      const panel = document.getElementById('toDropdownPanel');
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', function(e) {
      const wrap = document.querySelector('.search-dropdown-wrap');
      if (wrap && !wrap.contains(e.target)) {
        document.getElementById('toDropdownPanel').style.display = 'none';
      }
    });
    // Select all
    const selAll = document.getElementById('toSelectAll');
    if (selAll) selAll.addEventListener('change', function() {
      document.querySelectorAll('.to-check').forEach(c => { c.checked = this.checked; });
      filterTable();
    });
    document.querySelectorAll('.to-check').forEach(c => c.addEventListener('change', function() {
      if (this.id === 'toOtherCheck') {
        document.getElementById('toOtherInput').style.display = this.checked ? 'block' : 'none';
        if (!this.checked) document.getElementById('toOtherText').value = '';
      }
      filterTable();
    }));
    </script>`;

  const owScript = `<script>
  const forgottenBtn = document.getElementById('forgottenEntryBtn');
  if (forgottenBtn) {
    forgottenBtn.addEventListener('click', () => document.getElementById('forgottenModal').classList.add('active'));
    document.getElementById('cancelForgotten').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
    document.getElementById('closeForgottenModal').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
  }
  const insertBtn = document.getElementById('insertEntryBtn');
  if (insertBtn) {
    insertBtn.addEventListener('click', () => document.getElementById('insertModal').classList.add('active'));
    document.getElementById('cancelInsert').addEventListener('click', () => document.getElementById('insertModal').classList.remove('active'));
    document.getElementById('closeInsertModal').addEventListener('click', () => document.getElementById('insertModal').classList.remove('active'));
  }
  </script>`;
  res.send(layout(user, 'Outward Orders', body + searchScript + owScript));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { date, to_whom_addressed, description, file_no, remarks } = req.body;
  const fy   = getFY(date);
  const d_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(d_no) as m FROM outward_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare('INSERT INTO outward_orders (d_no,d_no_text,financial_year,date,to_whom_addressed,description,file_no,remarks,entered_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(n, String(n), fy, date, to_whom_addressed, description, file_no||'', remarks||'', user.username);
    return n;
  })();
  res.redirect('/outward?saved=' + d_no);
});

router.post('/insert', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { d_no_insert, date, to_whom_addressed, description, file_no, remarks } = req.body;
  if (!d_no_insert || isNaN(parseInt(d_no_insert))) return res.redirect('/outward');
  if (!date || !to_whom_addressed || !description) return res.redirect('/outward');
  const fy = getFY(date);
  const n  = parseInt(d_no_insert);
  const existing = db.prepare('SELECT id FROM outward_orders WHERE financial_year=? AND d_no_text=?').get(fy, String(n));
  if (existing) return res.redirect('/outward?error=Record+with+this+number+already+exists.');
  db.prepare('INSERT INTO outward_orders (d_no,d_no_text,financial_year,date,to_whom_addressed,description,file_no,remarks,entered_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(n, String(n), fy, date, to_whom_addressed, description, file_no||'', remarks||'', user.username);
  res.redirect('/outward?saved=' + n);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, d_no_text, date, to_whom_addressed, description, file_no, remarks } = req.body;
  const existing = db.prepare('SELECT * FROM outward_orders WHERE id=?').get(id);
  if (!existing) return res.redirect('/outward');
  if (user.role !== 'admin' && user.role !== 'user1' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  if (user.role === 'admin' && d_no_text && d_no_text !== (existing.d_no_text || String(existing.d_no))) {
    const dup = db.prepare('SELECT id FROM outward_orders WHERE financial_year=? AND d_no_text=? AND id!=?').get(existing.financial_year, d_no_text, id);
    if (dup) return res.redirect('/outward?error=Record+with+this+number+already+exists.');
    const newNum = parseInt(d_no_text);
    db.prepare('UPDATE outward_orders SET d_no=?,d_no_text=?,date=?,to_whom_addressed=?,description=?,file_no=?,remarks=? WHERE id=?')
      .run(isNaN(newNum) ? existing.d_no : newNum, d_no_text, date, to_whom_addressed, description, file_no||'', remarks||'', id);
  } else {
    db.prepare('UPDATE outward_orders SET date=?,to_whom_addressed=?,description=?,file_no=?,remarks=? WHERE id=?')
      .run(date, to_whom_addressed, description, file_no||'', remarks||'', id);
  }
  if (user.role !== 'admin') {
    writeNotification(db, 'Outward Orders', id, 'edit', user.username,
      'Edited D.NO ' + (existing.d_no_text||existing.d_no) + ' — ' + existing.to_whom_addressed);
  }
  res.redirect('/outward');
});

router.post('/forgotten', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { after_d_no, date, to_whom_addressed, description, file_no, remarks } = req.body;
  if (!after_d_no || isNaN(parseInt(after_d_no)) || !date || !to_whom_addressed || !description) return res.redirect('/outward');
  const fy   = getFY(date);
  const d_text = db.transaction(() => {
    const suffix = getNextSuffixOutward(db, after_d_no, fy);
    db.prepare('INSERT INTO outward_orders (d_no,d_no_text,financial_year,date,to_whom_addressed,description,file_no,remarks,entered_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(parseInt(after_d_no), suffix, fy, date, to_whom_addressed, description, file_no||'', remarks||'', user.username);
    return suffix;
  })();
  res.redirect('/outward?saved=' + d_text);
});

router.post('/:id/delete', (req, res) => {
  if (!['admin','user1'].includes(req.session.user.role)) return res.status(403).send('Access denied.');
  getDb().prepare('DELETE FROM outward_orders WHERE id=?').run(req.params.id);
  res.redirect('/outward');
});

module.exports = router;
