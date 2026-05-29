const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { getFY, currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, confirmOverlay, successOverlay, fmtDate, canUserEdit, writeNotification } = require('../views/helpers');

// Search filter values — add more here when available
const RECEIVED_FROM_VALUES = [
  'CMD', 'Director (Grid and Transmission Management',
  'Director (Projects)','Director (Finance)','Director (Lift Irrigation & Schemes)','Director (Grid Operations)','ED/Comml/TGPCC	',
  'CGM/HRD	','CE/IT	','CE/Transmission	','CE/Construction-I	','CE/Construction-II	',
  'CE/ P& MM	','CE/400KV	','CE/Telecom' , 'CE/Comml & RAC', 'CE/ Civil', 'CE/SLDC ( FAC)', 'CE/LIS- Incharge', 'CE/PR/LIS', 'CE/Power System', 'Joint Secretary', 'FA&CCA(R&A & CFO)(I/C)', 'FA&CCA /TGPCC (I/C)', 'CE/Digitalization', 'CE/Training/CTI', 'CE/Metro', 'CE/Rural','CE/ Warangal', 'CE/400kV Wgl', 'CE/Karimnagar',
];

const ALLOWED = ['admin','user1'];
function checkAccess(req, res, next) {
  if (!ALLOWED.includes(req.session.user.role)) return res.status(403).send('Access denied.');
  next();
}

function getNextSuffix(db, baseNum, fy) {
  const rows = db.prepare(`SELECT c_no_text FROM inward_orders WHERE financial_year=? AND c_no_text LIKE ?`).all(fy, baseNum + '/%');
  const suffixes = rows
    .map(r => String(r.c_no_text).replace(baseNum + '/', ''))
    .filter(s => /^[A-Z]$/.test(s));
  if (suffixes.length === 0) return baseNum + '/A';
  const lastChar = suffixes.sort().pop();
  return baseNum + '/' + String.fromCharCode(lastChar.charCodeAt(0) + 1);
}

router.get('/', checkAccess, (req, res) => {
  const db    = getDb();
  const user  = req.session.user;
  const curFY = currentFY();
  const fy    = req.query.fy || curFY;
  const isArchive = fy !== curFY;
  const pastFYs   = getPastFYs(db, 'inward_orders');
  const rows = db.prepare('SELECT * FROM inward_orders WHERE financial_year=? ORDER BY rowid ASC').all(fy);

  // Sort by c_no_text
  rows.sort((a, b) => {
    const aStr = String(a.c_no_text || a.c_no);
    const bStr = String(b.c_no_text || b.c_no);
    const aNum = parseInt(aStr); const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum;
    return aStr.localeCompare(bStr);
  });

  const showStatus = false;

  const tableRows = rows.map(row => {
    const displayNo = row.c_no_text || String(row.c_no);
    return `
    <tr data-search="${[displayNo,row.received_from,row.subject,row.file_no,row.remarks,row.entered_by].join(' ').toLowerCase()}" data-from="${(row.received_from||'').toLowerCase()}">
      <td>${displayNo}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.received_from}</td>
      <td><div class="desc-short">${row.subject}</div><div class="desc-full" style="display:none">${row.subject}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${row.file_no||'—'}</td>
      <td>${row.remarks||'—'}</td>
      <td>${row.entered_by}</td>
      ${showStatus ? `<td>${isArchive ? '<span class="badge badge-locked">Locked</span>' : statusBadge(row.created_at)}</td>` : ''}
      <td>${actionButtons(row, user, isArchive && user.role !== 'admin', '/inward', r => 'C.NO ' + (r.c_no_text||r.c_no) + ' — ' + r.received_from)}</td>
    </tr>`;
  }).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const checkboxes = RECEIVED_FROM_VALUES.map(v =>
    `<label class="search-check-item"><input type="checkbox" class="from-check" value="${v.toLowerCase()}"/> ${v}</label>`
  ).join('') + `
    <label class="search-check-item" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px">
      <input type="checkbox" class="from-check" id="fromOtherCheck" value="__other__"/> Other
    </label>
    <div id="fromOtherInput" style="display:none;margin-top:6px;padding-left:22px">
      <input type="text" id="fromOtherText" placeholder="Type sender name…"
             style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px"
             autocomplete="off" oninput="filterTable()"/>
    </div>`;

  const statusColHeader = showStatus ? '<th>Status</th>' : '';
  const colSpan = showStatus ? '9' : '8';

  const body = `
    ${req.query.saved ? successOverlay('C.NO', req.query.saved) : ''}
    ${confirmOverlay('/inward')}

    <div class="page-header">
      <div>
        <div class="page-title">Inward orders</div>
        <div class="page-sub">${rows.length} entries · FY ${fy}''</div>
      </div>
      <div class="header-actions">
        <select id="fySelect" class="filter-select">${fyOptions}</select>
        ${(!isArchive || user.role === 'admin') ? `
          <button class="btn btn-primary" id="addEntryBtn"><i class="ti ti-plus"></i> Add entry</button>
          ${user.role === 'admin' ? `<button class="btn btn-outline" id="forgottenEntryBtn"><i class="ti ti-history"></i> Forgotten entry</button>` : ''}
        ` : ''}
      </div>
    </div>

    <!-- Search bar with checkboxes -->
    <div class="search-bar-wrap">
      <div class="search-dropdown-wrap">
        <button type="button" class="search-dropdown-btn" id="fromDropdownBtn">
          <i class="ti ti-filter"></i> Filter by sender <i class="ti ti-chevron-down" style="font-size:12px"></i>
        </button>
        <div class="search-dropdown-panel" id="fromDropdownPanel">
          <label class="search-check-item" style="font-weight:600;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:4px">
            <input type="checkbox" id="checkAll"/> Select all
          </label>
          ${checkboxes}
        </div>
      </div>
      <div class="search-main">
        <i class="ti ti-search"></i>
        <input type="text" id="tableSearch" placeholder="Search by subject, file no, remarks…" oninput="filterTable()"/>
      </div>
      <button class="btn btn-outline btn-sm" onclick="clearSearch()"><i class="ti ti-x"></i> Clear</button>
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <span class="table-count" id="tableCount">${rows.length} entries</span>
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
              <th>Entered By</th>${statusColHeader}<th>Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${tableRows || `<tr><td colspan="${colSpan}"><div class="empty-state"><i class="ti ti-inbox"></i><p>No entries yet.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span class="footer-total" id="tableFooter">${rows.length} entries</span>
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
                <input type="date" name="date" required autocomplete="off" class="today-default"/>
              </div>
              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" name="received_from" required autocomplete="off" list="from-list"/>
                <datalist id="from-list">
                  ${RECEIVED_FROM_VALUES.map(v => `<option value="${v}"/>`).join('')}
                </datalist>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" name="subject" required autocomplete="off"/>
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

    <!-- Forgotten Entry Modal -->
    ${user.role === 'admin' ? `
    <div class="modal-overlay" id="forgottenModal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Insert forgotten entry — Inward orders</span>
          <button class="modal-close" id="closeForgottenModal">×</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger" style="margin-bottom:16px"><i class="ti ti-alert-circle"></i> Inserts a forgotten entry with suffix C.NO e.g. 4/A, 4/B.</div>
          <form method="POST" action="/inward/forgotten" id="forgottenForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Insert after C.NO <span class="req">*</span></label>
                <input type="number" name="after_c_no" required min="1" step="1" autocomplete="off" placeholder="e.g. 4"/>
                <span class="field-hint">Entry will be inserted as 4/A, 4/B etc.</span>
              </div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" name="received_from" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" name="subject" required autocomplete="off"/>
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
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix C.NO assigned automatically e.g. 4/A</span>
          <div class="modal-footer-actions">
            <button class="btn btn-outline" id="cancelForgotten">Cancel</button>
            <button class="btn btn-primary" onclick="document.getElementById('forgottenForm').submit()">
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
          <span class="modal-title">Edit entry — Inward orders</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/inward/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Received From <span class="req">*</span></label>
                <input type="text" name="received_from" id="edit_received_from" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Subject <span class="req">*</span></label>
                <input type="text" name="subject" id="edit_subject" required autocomplete="off"/>
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
            <button class="btn btn-primary" onclick="document.getElementById('editForm').submit()">
              <i class="ti ti-device-floppy"></i> Save changes
            </button>
          </div>
        </div>
      </div>
    </div>

    <script>
    document.getElementById('fySelect').addEventListener('change', function() {
      window.location.href = '/inward?fy=' + encodeURIComponent(this.value);
    });

    // Forgotten modal
    const forgottenBtn = document.getElementById('forgottenEntryBtn');
    if (forgottenBtn) {
      forgottenBtn.addEventListener('click', () => document.getElementById('forgottenModal').classList.add('active'));
      document.getElementById('cancelForgotten').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
      document.getElementById('closeForgottenModal').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
    }

    // Dropdown toggle
    document.getElementById('fromDropdownBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('fromDropdownPanel').classList.toggle('open');
    });
    document.addEventListener('click', () => document.getElementById('fromDropdownPanel').classList.remove('open'));
    document.getElementById('fromDropdownPanel').addEventListener('click', e => e.stopPropagation());

    // Select all
    document.getElementById('checkAll').addEventListener('change', function() {
      document.querySelectorAll('.from-check').forEach(cb => { cb.checked = this.checked; });
      filterTable();
    });
    document.querySelectorAll('.from-check').forEach(cb => cb.addEventListener('change', function() {
      if (this.id === 'fromOtherCheck') {
        document.getElementById('fromOtherInput').style.display = this.checked ? 'block' : 'none';
        if (!this.checked) document.getElementById('fromOtherText').value = '';
      }
      filterTable();
    }));

    function filterTable() {
      const q = document.getElementById('tableSearch').value.toLowerCase();
      const allChecked = Array.from(document.querySelectorAll('.from-check:checked'));
      const namedValues = allChecked.filter(c => c.value !== '__other__').map(c => c.value);
      const otherChecked = !!document.getElementById('fromOtherCheck').checked;
      const otherText = (document.getElementById('fromOtherText').value || '').toLowerCase().trim();
      const rows = document.querySelectorAll('#tableBody tr[data-search]');
      let visible = 0;
      rows.forEach(row => {
        const textMatch = !q || row.dataset.search.includes(q);
        const rowFrom = (row.dataset.from || '');
        let fromMatch = true;
        if (namedValues.length > 0 || otherChecked) {
          const namedMatch = namedValues.some(v => rowFrom.includes(v));
          const otherMatch = otherChecked && otherText !== '' && rowFrom.includes(otherText);
          fromMatch = namedMatch || otherMatch;
        }
        const show = textMatch && fromMatch;
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      document.getElementById('tableCount').textContent = visible + ' entries';
    }

    function clearSearch() {
      document.getElementById('tableSearch').value = '';
      document.querySelectorAll('.from-check').forEach(cb => cb.checked = false);
      document.getElementById('checkAll').checked = false;
      filterTable();
    }
    </script>
  `;

  res.send(layout(user, 'Inward Orders', body));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { date, received_from, subject, file_no, remarks } = req.body;
  const fy   = getFY(date);
  const c_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(CAST(c_no AS INTEGER)) as m FROM inward_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare('INSERT INTO inward_orders (c_no,c_no_text,financial_year,date,received_from,subject,file_no,remarks,entered_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(n, String(n), fy, date, received_from, subject, file_no||'', remarks||'', user.username);
    return n;
  })();
  res.redirect('/inward?saved=' + c_no);
});

router.post('/forgotten', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { after_c_no, date, received_from, subject, file_no, remarks } = req.body;
  const fy   = getFY(date);
  const c_no = db.transaction(() => {
    const suffix = getNextSuffix(db, after_c_no, fy);
    db.prepare('INSERT INTO inward_orders (c_no,c_no_text,financial_year,date,received_from,subject,file_no,remarks,entered_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(parseInt(after_c_no), suffix, fy, date, received_from, subject, file_no||'', remarks||'', user.username);
    return suffix;
  })();
  res.redirect('/inward?saved=' + c_no);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, received_from, subject, file_no, remarks } = req.body;
  const existing = db.prepare('SELECT * FROM inward_orders WHERE id=?').get(id);
  if (!existing) return res.redirect('/inward');
  if (user.role !== 'admin' && !canUserEdit(existing, user)) return res.status(403).send('You cannot edit this entry.');
  db.prepare('UPDATE inward_orders SET date=?,received_from=?,subject=?,file_no=?,remarks=? WHERE id=?')
    .run(date, received_from, subject, file_no||'', remarks||'', id);
  if (user.role !== 'admin') {
    writeNotification(db, 'Inward Orders', id, 'edit', user.username,
      'Edited C.NO ' + (existing.c_no_text||existing.c_no) + ' — ' + existing.received_from);
  }
  res.redirect('/inward');
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM inward_orders WHERE id=?').run(req.params.id);
  res.redirect('/inward');
});

module.exports = router;