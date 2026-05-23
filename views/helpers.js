const { isEditable } = require('../views/layout');

/** Format date stored as yyyy-mm-dd → dd-mm-yyyy for display */
function fmtDate(d) {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
}

function actionButtons(row, user, isArchive, deleteBase, labelFn) {
  if (isArchive) return '<span style="color:var(--text3);font-size:12px">—</span>';
  const editable  = isEditable(row.created_at);
  const canEdit   = user.role === 'admin' || editable;
  const canDelete = user.role === 'admin';
  const recordData = JSON.stringify(row).replace(/"/g,'&quot;');
  const label = labelFn(row);
  let btns = '';
  if (canEdit)   btns += `<button class="btn-edit-sm edit-btn" data-id="${row.id}" data-record="${recordData}"><i class="ti ti-pencil"></i> Edit</button>`;
  if (canDelete) btns += `<button class="btn-delete-sm delete-btn" data-id="${row.id}" data-label="${label}"><i class="ti ti-trash"></i> Delete</button>`;
  return btns ? `<div class="actions">${btns}</div>` : '—';
}

function statusBadge(createdAt) {
  return isEditable(createdAt)
    ? '<span class="badge badge-editable">Editable</span>'
    : '<span class="badge badge-locked">Locked</span>';
}

function inr(n) {
  if (n == null || n === '') return '—';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function confirmOverlay(deleteBase) {
  return `
  <div class="confirm-overlay" id="confirmOverlay">
    <div class="confirm-dialog">
      <div class="confirm-body">
        <div class="confirm-icon"><i class="ti ti-trash"></i></div>
        <div class="confirm-title">Delete this entry?</div>
        <div class="confirm-text">This action is permanent and cannot be undone.</div>
        <div class="confirm-detail"><strong id="confirmDetail"></strong></div>
      </div>
      <div class="confirm-footer">
        <button class="btn btn-outline btn-sm" id="cancelDelete">Cancel</button>
        <form method="POST" id="deleteForm" data-base="${deleteBase}" style="margin:0">
          <button type="submit" class="btn btn-danger btn-sm"><i class="ti ti-trash"></i> Yes, delete</button>
        </form>
      </div>
    </div>
  </div>`;
}

function successOverlay(serialLabel, serialValue) {
  return `
  <div class="success-overlay active" id="successOverlay">
    <div class="success-dialog">
      <div class="success-body">
        <div class="success-icon"><i class="ti ti-check"></i></div>
        <div class="success-title">Entry saved successfully</div>
        <div class="success-text">Your entry has been recorded. ${serialLabel} assigned:</div>
        <div class="serial-badge">${serialValue}</div>
        <div class="success-text" style="margin-top:8px">Entry is editable for the next 24 hours.</div>
      </div>
      <div class="success-footer">
        <button class="btn btn-success" id="successDone">Done</button>
      </div>
    </div>
  </div>`;
}

module.exports = { actionButtons, statusBadge, inr, confirmOverlay, successOverlay, fmtDate };
