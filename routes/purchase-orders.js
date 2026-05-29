const express = require('express');
const router  = express.Router();
const getDb   = require('../db');
const { layout, isEditable } = require('../views/layout');
const { getFY, currentFY, getPastFYs } = require('../db/fy');
const { actionButtons, statusBadge, inr, confirmOverlay, successOverlay, fmtDate, writeNotification } = require('../views/helpers');

const ALLOWED = ['admin','user2'];

const FILE_NO_PREFIXES = ['33', '73', '74', '75'];

function getNextSuffixPO(db, baseNum, fy) {
  const rows = db.prepare(
    `SELECT sl_no_text FROM purchase_orders WHERE financial_year=? AND sl_no_text LIKE ?`
  ).all(fy, baseNum + '%');
  const suffixes = rows
    .map(r => String(r.sl_no_text).replace(String(baseNum), ''))
    .filter(s => /^[A-Z]$/.test(s));
  if (suffixes.length === 0) return baseNum + 'A';
  const last = suffixes.sort().pop();
  return baseNum + String.fromCharCode(last.charCodeAt(0) + 1);
}

function assignFileNo(db, prefix, fy) {
  const rows = db.prepare(
    `SELECT file_no FROM purchase_orders WHERE financial_year=? AND file_no LIKE ?`
  ).all(fy, `${prefix}-%`);
  let max = 0;
  for (const r of rows) {
    const parts = r.file_no.split('-');
    const n = parseInt(parts[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${max + 1}`;
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
  const isAdminArchive = isArchive && user.role === 'admin';
  const pastFYs   = getPastFYs(db, 'purchase_orders');
  const rows = db.prepare('SELECT * FROM purchase_orders WHERE financial_year=? ORDER BY rowid ASC').all(fy);
  rows.sort((a, b) => {
    const aStr = String(a.sl_no_text || a.sl_no);
    const bStr = String(b.sl_no_text || b.sl_no);
    const aNum = parseInt(aStr); const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum;
    return aStr.localeCompare(bStr);
  });
  const totalVal = rows.reduce((s,r) => s + (r.total||0), 0);

  const tableRows = rows.map(row => `
    <tr>
      <td>${row.sl_no_text || row.sl_no}</td>
      <td>${row.sap_po_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.name_supplier}</td>
      <td><div class="desc-short">${row.description}</div><div class="desc-full" style="display:none">${row.description}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${row.qty}</td>
      <td>${inr(row.rate)}</td>
      <td>${inr(row.po_cost)}</td>
      <td>${row.gst_percent}%</td>
      <td>${inr((row.total||0) - (row.po_cost||0))}</td>
      <td>${inr(row.total)}</td>
      <td>${row.file_no||'—'}</td>
      <td>${row.sign||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${actionButtons(row, user, isArchive && user.role !== 'admin', '/purchase-orders', r => `SL.NO ${r.sl_no} — ${r.name_supplier}`)}</td>
    </tr>`).join('');

  const fyOptions = [curFY, ...pastFYs].map(f =>
    `<option value="${f}" ${f===fy?'selected':''}>${f}${f===curFY?' (current)':' – Archive'}</option>`
  ).join('');

  const body = `
    ${req.query.saved ? successOverlay('SL.NO', req.query.saved) : ''}
    ${confirmOverlay('/purchase-orders')}

    <div class="page-header">
      <div>
        <div class="page-title">Purchase orders</div>
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

    <div class="table-wrap">
      <div class="table-toolbar">
        <span class="table-count">${rows.length} entries</span>
        <div class="download-group">
          <a href="/download/purchase-orders/excel?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-spreadsheet"></i> Excel</a>
          <a href="/download/purchase-orders/pdf?fy=${fy}" class="btn btn-outline btn-sm"><i class="ti ti-file-type-pdf"></i> PDF</a>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>SL.NO</th>
              <th>SAP PO No.</th>
              <th>Date</th>
              <th>Name &amp; Supplier</th>
              <th>Description / Particulars</th>
              <th>Qty</th>
              <th>Rate (₹)</th>
              <th>PO Cost (₹)</th>
              <th>GST (%)</th>
               <th>GST Value (₹)</th>
              <th>Total (₹)</th>
              <th>F.NO</th>
              <th>Sign</th>
              <th>Entered By</th>
              
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${tableRows || `<tr><td colspan="15"><div class="empty-state"><i class="ti ti-inbox"></i><p>No entries yet. Click <strong>Add entry</strong> to get started.</p></div></td></tr>`}
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
          <span class="modal-title">Add new entry — Purchase orders</span>
          <button class="modal-close" id="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/purchase-orders" id="addForm">
            <div class="form-grid">
              <div class="form-section-label">Order details</div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off" class="today-default"/>
              </div>
              <div class="form-group">
                <label>SAP PO Number <span class="req">*</span></label>
                <input type="text" name="sap_po_no" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Name &amp; Supplier <span class="req">*</span></label>
                <input type="text" name="name_supplier" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Particulars <span class="req">*</span></label>
                <textarea name="description" required autocomplete="off"></textarea>
              </div>
              <div class="form-section-label">Pricing</div>
              <div class="form-group">
                <label>Quantity <span class="req">*</span></label>
                <input type="number" name="qty" id="qty" required min="0.01" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Rate (₹) <span class="req">*</span></label>
                <input type="number" name="rate" id="rate" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>PO Cost (₹)</label>
                <div class="calc-display" id="po_cost_display">₹ —</div>
                <span class="field-hint">Auto: Qty × Rate</span>
                <input type="hidden" name="po_cost" id="po_cost_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>GST (%) <span class="req">*</span></label>
                <input type="text" name="gst_percent" id="gst_percent" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Total Amount (₹)</label>
                <div class="calc-display" id="total_display" style="font-size:15px;font-weight:700">₹ —</div>
                <span class="field-hint">Auto: PO Cost + GST amount</span>
                <input type="hidden" name="total" id="total_hidden" value="0"/>
              </div>
              <div class="form-section-label">Reference &amp; Approval</div>
              <div class="form-group">
                <label>F.NO</label>
                <select name="file_no_prefix" class="filter-select" style="width:100%">
                  <option value="">— None —</option>
                  <option value="33">33</option>
                  <option value="73">73</option>
                  <option value="74">74</option>
                  <option value="75">75</option>
                </select>
                <span class="field-hint">System assigns the suffix (e.g. 74-2) automatically</span>
              </div>
              <div class="form-group">
                <label>Sign</label>
                <input type="text" name="sign" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> SL.NO assigned at the moment you save</span>
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
          <span class="modal-title">Insert forgotten entry — Purchase orders</span>
          <button class="modal-close" id="closeForgottenModal">×</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-danger" style="margin-bottom:16px"><i class="ti ti-alert-circle"></i> Inserts a forgotten entry with suffix SL.NO e.g. 4A, 4B.</div>
          <form method="POST" action="/purchase-orders/forgotten" id="forgottenForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Insert after SL.NO <span class="req">*</span></label>
                <input type="number" name="after_sl_no" required min="1" step="1" autocomplete="off" placeholder="e.g. 4"/>
                <span class="field-hint">Entry will be inserted as 4A, 4B etc.</span>
              </div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>SAP PO Number <span class="req">*</span></label>
                <input type="text" name="sap_po_no" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Name &amp; Supplier <span class="req">*</span></label>
                <input type="text" name="name_supplier" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Particulars <span class="req">*</span></label>
                <textarea name="description" required autocomplete="off"></textarea>
              </div>
              <div class="form-group">
                <label>Quantity <span class="req">*</span></label>
                <input type="number" name="qty" id="f_qty" required min="0.01" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Rate (₹) <span class="req">*</span></label>
                <input type="number" name="rate" id="f_rate" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>PO Cost (₹)</label>
                <div class="calc-display" id="f_po_cost_display">₹ —</div>
                <span class="field-hint">Auto: Qty × Rate</span>
                <input type="hidden" name="po_cost" id="f_po_cost_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>GST (%)</label>
                <input type="text" name="gst_percent" id="f_gst_percent" autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Total (₹)</label>
                <div class="calc-display" id="f_total_display" style="font-size:15px;font-weight:700">₹ —</div>
                <span class="field-hint">Auto: PO Cost + GST amount</span>
                <input type="hidden" name="total" id="f_total_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>F.NO</label>
                <select name="file_no_prefix" class="filter-select" style="width:100%">
                  <option value="">— None —</option>
                  <option value="33">33</option>
                  <option value="73">73</option>
                  <option value="74">74</option>
                  <option value="75">75</option>
                </select>
                <span class="field-hint">System assigns the suffix (e.g. 74-2) automatically</span>
              </div>
              <div class="form-group">
                <label>Sign</label>
                <input type="text" name="sign" autocomplete="off"/>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <span class="modal-footer-note"><i class="ti ti-info-circle"></i> Suffix SL.NO assigned automatically e.g. 4A</span>
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
          <span class="modal-title">Edit entry — Purchase orders</span>
          <button class="modal-close" id="closeEditModal">×</button>
        </div>
        <div class="modal-body">
          <form method="POST" action="/purchase-orders/edit" id="editForm">
            <input type="hidden" name="id" id="edit_id"/>
            <div class="form-grid">
              <div class="form-section-label">Order details</div>
              <div class="form-group">
                <label>Date <span class="req">*</span></label>
                <input type="date" name="date" id="edit_date" required autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>SAP PO Number <span class="req">*</span></label>
                <input type="text" name="sap_po_no" id="edit_sap_po_no" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Name &amp; Supplier <span class="req">*</span></label>
                <input type="text" name="name_supplier" id="edit_name_supplier" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Description / Particulars <span class="req">*</span></label>
                <textarea name="description" id="edit_description" required autocomplete="off"></textarea>
              </div>
              <div class="form-section-label">Pricing</div>
              <div class="form-group">
                <label>Quantity <span class="req">*</span></label>
                <input type="number" name="qty" id="edit_qty" required min="0.01" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>Rate (₹) <span class="req">*</span></label>
                <input type="number" name="rate" id="edit_rate" required min="0" step="any" autocomplete="off"/>
              </div>
              <div class="form-group">
                <label>PO Cost (₹)</label>
                <div class="calc-display" id="edit_po_cost_display">₹ —</div>
                <input type="hidden" name="po_cost" id="edit_po_cost_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>GST (%) <span class="req">*</span></label>
                <input type="text" name="gst_percent" id="edit_gst_percent" required autocomplete="off"/>
              </div>
              <div class="form-group full">
                <label>Total Amount (₹)</label>
                <div class="calc-display" id="edit_total_display" style="font-size:15px;font-weight:700">₹ —</div>
                <input type="hidden" name="total" id="edit_total_hidden" value="0"/>
              </div>
              <div class="form-section-label">Reference &amp; Approval</div>
              <div class="form-group">
                <label>F.NO</label>
                <input type="text" name="file_no" id="edit_file_no" autocomplete="off" placeholder="e.g. 74-2"/>
                <span class="field-hint">Auto-assigned on add. Edit only if correction needed.</span>
              </div>
              <div class="form-group">
                <label>Sign</label>
                <input type="text" name="sign" id="edit_sign" autocomplete="off"/>
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

  const poScript = `<script>
  document.getElementById('fySelect').addEventListener('change', function() {
    window.location.href = '/purchase-orders?fy=' + encodeURIComponent(this.value);
  });
  const forgottenBtn = document.getElementById('forgottenEntryBtn');
  if (forgottenBtn) {
    forgottenBtn.addEventListener('click', () => document.getElementById('forgottenModal').classList.add('active'));
    document.getElementById('cancelForgotten').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
    document.getElementById('closeForgottenModal').addEventListener('click', () => document.getElementById('forgottenModal').classList.remove('active'));
  }

  function formatInr(n) {
    return '\u20b9' + n.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function calcForgotten() {
    const q = parseFloat(document.getElementById('f_qty')?.value) || 0;
    const r = parseFloat(document.getElementById('f_rate')?.value) || 0;
    const g = parseFloat(document.getElementById('f_gst_percent')?.value) || 0;
    const po  = q * r;
    const tot = po + (po * g / 100);
    const poDisp = document.getElementById('f_po_cost_display');
    const totDisp = document.getElementById('f_total_display');
    const poHid = document.getElementById('f_po_cost_hidden');
    const totHid = document.getElementById('f_total_hidden');
    if (poDisp)  poDisp.textContent  = formatInr(po);
    if (totDisp) totDisp.textContent = formatInr(tot);
    if (poHid)   poHid.value  = po.toFixed(2);
    if (totHid)  totHid.value = tot.toFixed(2);
  }
  ['f_qty','f_rate','f_gst_percent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcForgotten);
  });
  </script>`;
  res.send(layout(user, 'Purchase Orders', body + poScript));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { date, sap_po_no, name_supplier, description, qty, rate, po_cost, gst_percent, total, file_no_prefix, sign } = req.body;
  const fy   = getFY(date);
  const sl_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(sl_no) as m FROM purchase_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    const file_no = file_no_prefix ? assignFileNo(db, file_no_prefix, fy) : '';
    db.prepare(`INSERT INTO purchase_orders
      (sl_no,sl_no_text,financial_year,date,sap_po_no,name_supplier,description,qty,rate,po_cost,gst_percent,total,file_no,sign,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(n, String(n), fy, date, sap_po_no, name_supplier, description,
           parseFloat(qty), parseFloat(rate), parseFloat(po_cost),
           gst_percent, parseFloat(total), file_no, sign||'', user.username);
    return n;
  })();
  res.redirect(`/purchase-orders?saved=${sl_no}`);
});

router.post('/edit', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const { id, date, sap_po_no, name_supplier, description, qty, rate, po_cost, gst_percent, total, file_no, sign } = req.body;
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id);
  if (!existing) return res.redirect('/purchase-orders');
  if (user.role !== 'admin' && !isEditable(existing.created_at)) return res.status(403).send('Entry is locked.');
  db.prepare(`UPDATE purchase_orders SET date=?,sap_po_no=?,name_supplier=?,description=?,qty=?,rate=?,po_cost=?,gst_percent=?,total=?,file_no=?,sign=? WHERE id=?`)
    .run(date, sap_po_no, name_supplier, description, parseFloat(qty), parseFloat(rate),
         parseFloat(po_cost), gst_percent, parseFloat(total), file_no||'', sign||'', id);
  if (user.role !== 'admin') {
    writeNotification(db, 'Purchase Orders', id, 'edit', user.username,
      'Edited SL.NO ' + (existing.sl_no_text||existing.sl_no) + ' — ' + existing.name_supplier);
  }
  res.redirect('/purchase-orders');
});

router.post('/forgotten', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Admin only.');
  const db   = getDb();
  const user = req.session.user;
  const { after_sl_no, date, sap_po_no, name_supplier, description, qty, rate, gst_percent, total, file_no_prefix, sign } = req.body;
  const fy   = getFY(date);
  const po_cost = (parseFloat(qty)||0) * (parseFloat(rate)||0);
  const sl_text = db.transaction(() => {
    const suffix = getNextSuffixPO(db, after_sl_no, fy);
    const file_no = file_no_prefix ? assignFileNo(db, file_no_prefix, fy) : '';
    db.prepare(`INSERT INTO purchase_orders
      (sl_no,sl_no_text,financial_year,date,sap_po_no,name_supplier,description,qty,rate,po_cost,gst_percent,total,file_no,sign,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(parseInt(after_sl_no), suffix, fy, date, sap_po_no, name_supplier, description,
           parseFloat(qty)||0, parseFloat(rate)||0, po_cost,
           gst_percent||'0', parseFloat(total)||0, file_no, sign||'', user.username);
    return suffix;
  })();
  res.redirect('/purchase-orders?saved=' + sl_text);
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.redirect('/purchase-orders');
});

module.exports = router;