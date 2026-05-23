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
  const pastFYs   = getPastFYs(db, 'purchase_orders');
  const rows = db.prepare('SELECT * FROM purchase_orders WHERE financial_year=? ORDER BY sl_no ASC').all(fy);
  const totalVal = rows.reduce((s,r) => s + (r.total||0), 0);

  const tableRows = rows.map(row => `
    <tr>
      <td>${row.sl_no}</td>
      <td>${row.sap_po_no}</td>
      <td>${fmtDate(row.date)}</td>
      <td>${row.name_supplier}</td>
      <td><div class="desc-short">${row.description}</div><div class="desc-full" style="display:none">${row.description}</div><span class="show-more-btn" onclick="toggleDesc(this)">show more</span></td>
      <td>${row.qty}</td>
      <td>${inr(row.rate)}</td>
      <td>${inr(row.po_cost)}</td>
      <td>${row.gst_percent}%</td>
      <td>${inr(row.total)}</td>
      <td>${row.file_no||'—'}</td>
      <td>${row.sign||'—'}</td>
      <td>${row.entered_by}</td>
      <td>${isArchive ? '<span class="badge badge-locked">Locked</span>' : statusBadge(row.created_at)}</td>
      <td>${actionButtons(row, user, isArchive, '/purchase-orders', r => `SL.NO ${r.sl_no} — ${r.name_supplier}`)}</td>
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
        <div class="page-sub">${rows.length} entries · FY ${fy}${isArchive ? ' · <span class="badge badge-archive">Archive – Read only</span>' : ' · Entries editable within 24 hours'}</div>
      </div>
      <div class="header-actions">
        <select id="fySelect" class="filter-select">${fyOptions}</select>
        ${!isArchive ? `<button class="btn btn-primary" id="addEntryBtn"><i class="ti ti-plus"></i> Add entry</button>` : ''}
      </div>
    </div>

    ${isArchive ? `<div class="archive-banner"><i class="ti ti-lock"></i> Read-only archive for FY ${fy}. No edits or deletions allowed.</div>` : ''}

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
              <th>Total (₹)</th>
              <th>F.NO</th>
              <th>Sign</th>
              <th>Entered By</th>
              <th>Status</th>
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
                <input type="date" name="date" required class="today-default"/>
              </div>
              <div class="form-group">
                <label>SAP PO Number <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="sap_po_no" required/>
              </div>
              <div class="form-group full">
                <label>Name &amp; Supplier <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="name_supplier" required/>
              </div>
              <div class="form-group full">
                <label>Description / Particulars <span class="req">*</span></label>
                <textarea autocomplete="off" name="description" required></textarea>
              </div>
              <div class="form-section-label">Pricing</div>
              <div class="form-group">
                <label>Quantity <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="qty" id="qty" required min="0.01" step="any"/>
              </div>
              <div class="form-group">
                <label>Rate (₹) <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="rate" id="rate" required min="0" step="any"/>
              </div>
              <div class="form-group">
                <label>PO Cost (₹)</label>
                <div class="calc-display" id="po_cost_display">₹ —</div>
                <span class="field-hint">Auto: Qty × Rate</span>
                <input type="hidden" name="po_cost" id="po_cost_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>GST (%) <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="gst_percent" id="gst_percent" required/>
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
                <input type="text" autocomplete="off" name="file_no"/>
              </div>
              <div class="form-group">
                <label>Sign</label>
                <input type="text" autocomplete="off" name="sign"/>
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
                <input type="date" name="date" id="edit_date" required/>
              </div>
              <div class="form-group">
                <label>SAP PO Number <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="sap_po_no" id="edit_sap_po_no" required/>
              </div>
              <div class="form-group full">
                <label>Name &amp; Supplier <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="name_supplier" id="edit_name_supplier" required/>
              </div>
              <div class="form-group full">
                <label>Description / Particulars <span class="req">*</span></label>
                <textarea autocomplete="off" name="description" id="edit_description" required></textarea>
              </div>
              <div class="form-section-label">Pricing</div>
              <div class="form-group">
                <label>Quantity <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="qty" id="edit_qty" required min="0.01" step="any"/>
              </div>
              <div class="form-group">
                <label>Rate (₹) <span class="req">*</span></label>
                <input type="number" autocomplete="off" name="rate" id="edit_rate" required min="0" step="any"/>
              </div>
              <div class="form-group">
                <label>PO Cost (₹)</label>
                <div class="calc-display" id="edit_po_cost_display">₹ —</div>
                <input type="hidden" name="po_cost" id="edit_po_cost_hidden" value="0"/>
              </div>
              <div class="form-group">
                <label>GST (%) <span class="req">*</span></label>
                <input type="text" autocomplete="off" name="gst_percent" id="edit_gst_percent" required/>
              </div>
              <div class="form-group full">
                <label>Total Amount (₹)</label>
                <div class="calc-display" id="edit_total_display" style="font-size:15px;font-weight:700">₹ —</div>
                <input type="hidden" name="total" id="edit_total_hidden" value="0"/>
              </div>
              <div class="form-section-label">Reference &amp; Approval</div>
              <div class="form-group">
                <label>F.NO</label>
                <input type="text" autocomplete="off" name="file_no" id="edit_file_no"/>
              </div>
              <div class="form-group">
                <label>Sign</label>
                <input type="text" autocomplete="off" name="sign" id="edit_sign"/>
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

  res.send(layout(user, 'Purchase Orders', body));
});

router.post('/', checkAccess, (req, res) => {
  const db   = getDb();
  const user = req.session.user;
  const fy   = currentFY();
  const { date, sap_po_no, name_supplier, description, qty, rate, po_cost, gst_percent, total, file_no, sign } = req.body;
  const sl_no = db.transaction(() => {
    const max = db.prepare('SELECT MAX(sl_no) as m FROM purchase_orders WHERE financial_year=?').get(fy);
    const n   = (max.m || 0) + 1;
    db.prepare(`INSERT INTO purchase_orders
      (sl_no,financial_year,date,sap_po_no,name_supplier,description,qty,rate,po_cost,gst_percent,total,file_no,sign,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(n, fy, date, sap_po_no, name_supplier, description,
           parseFloat(qty), parseFloat(rate), parseFloat(po_cost),
           gst_percent, parseFloat(total), file_no||'', sign||'', user.username);
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
  res.redirect('/purchase-orders');
});

router.post('/:id/delete', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Only Admin can delete.');
  getDb().prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.redirect('/purchase-orders');
});

module.exports = router;
