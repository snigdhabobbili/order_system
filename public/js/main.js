// ── Search / filter ────────────────────────────────────────────────────────
function initSearch() {
  const searchInput  = document.getElementById('searchInput');
  const dateFrom     = document.getElementById('dateFrom');
  const dateTo       = document.getElementById('dateTo');
  const statusFilter = document.getElementById('statusFilter');
  const clearBtn     = document.getElementById('clearFilters');
  const tbody        = document.getElementById('tableBody');
  if (!searchInput || !tbody) return;

  function filterRows() {
    const q      = searchInput.value.toLowerCase();
    const from   = dateFrom   ? dateFrom.value   : '';
    const to     = dateTo     ? dateTo.value     : '';
    const status = statusFilter ? statusFilter.value : '';
    const rows   = tbody.querySelectorAll('tr');
    let visible  = 0;

    rows.forEach(row => {
      const text      = row.textContent.toLowerCase();
      const rowDate   = row.dataset.date   || '';
      const rowStatus = row.dataset.status || '';

      const matchQ      = !q      || text.includes(q);
      const matchFrom   = !from   || rowDate >= from;
      const matchTo     = !to     || rowDate <= to;
      const matchStatus = !status || rowStatus === status;

      const show = matchQ && matchFrom && matchTo && matchStatus;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    const countEl = document.getElementById('rowCount');
    if (countEl) countEl.textContent = `Showing ${visible} of ${rows.length} entries`;

    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  }

  searchInput.addEventListener('input', filterRows);
  if (dateFrom)     dateFrom.addEventListener('change', filterRows);
  if (dateTo)       dateTo.addEventListener('change', filterRows);
  if (statusFilter) statusFilter.addEventListener('change', filterRows);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      if (dateFrom)     dateFrom.value     = '';
      if (dateTo)       dateTo.value       = '';
      if (statusFilter) statusFilter.value = '';
      filterRows();
    });
  }
}

// ── Column sort ────────────────────────────────────────────────────────────
function initSort() {
  const headers = document.querySelectorAll('th[data-sort]');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const tbody = document.getElementById('tableBody');
      if (!tbody) return;
      const col = th.dataset.sort;
      const asc = th.dataset.asc !== 'true';
      th.dataset.asc = asc;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aVal = a.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || '';
        const bVal = b.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || '';
        const n = parseFloat(aVal.replace(/[^0-9.-]/g,''));
        const m = parseFloat(bVal.replace(/[^0-9.-]/g,''));
        if (!isNaN(n) && !isNaN(m)) return asc ? n - m : m - n;
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
      rows.forEach(r => tbody.appendChild(r));

      document.querySelectorAll('th[data-sort]').forEach(h => {
        h.querySelector('.sort-icon').className = 'sort-icon ti ti-selector';
      });
      th.querySelector('.sort-icon').className = `sort-icon ti ${asc ? 'ti-sort-ascending' : 'ti-sort-descending'}`;
    });
  });
}

// ── Auto-calculate PO fields ───────────────────────────────────────────────
// Total = Rate + (Rate × GST/100). Rate already covers the full quantity.

function initPOCalc() {
  const rate   = document.getElementById('rate');               // Rate input
  const gst    = document.getElementById('gst_percent');        // GST % input
  const total  = document.getElementById('total_display');      // Display label showing Total
  const totalH = document.getElementById('total_hidden');       // Hidden input that submits Total
  if (!rate || !gst) return;                                    // Not on a PO page, skip

  function calc() {
    const r   = parseFloat(rate.value) || 0;                   // Rate (0 if empty)
    const g   = parseFloat(gst.value)  || 0;                   // GST % (0 if empty)
    const tot = r + (r * g / 100);                             // Total = Rate + GST amount
    if (total)  total.textContent = '₹' + formatNum(tot);      // Update visible display
    if (totalH) totalH.value      = tot.toFixed(2);            // Update hidden input
  }

  rate.addEventListener('input', calc);                         // Recalculate whenever rate changes
  gst.addEventListener('input', calc);                          // Recalculate when GST % changes
}

// ── Auto-calculate Sanctions amount display ────────────────────────────────
function initSanctionCalc() {
  const amtInput   = document.getElementById('amount');
  const amtDisplay = document.getElementById('amount_display');
  if (!amtInput || !amtDisplay) return;
  amtInput.addEventListener('input', () => {
    const v = parseFloat(amtInput.value) || 0;
    amtDisplay.textContent = '₹' + formatNum(v);
  });
}

// Formats a number in Indian format e.g. 123456.5 → "1,23,456.50"
function formatNum(n) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Modal open/close ───────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// ── Add Entry button ───────────────────────────────────────────────────────
function initAddEntry() {
  const btn = document.getElementById('addEntryBtn');
  if (btn) btn.addEventListener('click', () => openModal('addModal'));
  const closeBtn = document.getElementById('closeAddModal');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('addModal'));
  const cancelBtn = document.getElementById('cancelAdd');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('addModal'));
}

// ── Edit Entry ─────────────────────────────────────────────────────────────
function initEditEntry() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id    = btn.dataset.id;
      const data  = JSON.parse(btn.dataset.record || '{}');
      const modal = document.getElementById('editModal');
      if (!modal) return;

      Object.entries(data).forEach(([k, v]) => {
        const el = modal.querySelector(`[name="${k}"]`);
        if (el) el.value = v;
      });

      // Trigger recalculation for edit modal fields
      const calcEvent = new Event('input');
      ['rate', 'gst_percent'].forEach(f => {
        const el = modal.querySelector(`[name="${f}"]`);
        if (el) el.dispatchEvent(calcEvent);
      });

      openModal('editModal');
    });
  });
  const closeBtn = document.getElementById('closeEditModal');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('editModal'));
  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('editModal'));
}

// ── Delete confirm ─────────────────────────────────────────────────────────
function initDelete() {
  const savedScroll = sessionStorage.getItem('deleteScrollY');
  if (savedScroll) {
    window.scrollTo(0, parseInt(savedScroll));
    sessionStorage.removeItem('deleteScrollY');
  }

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.id;
      const label   = btn.dataset.label || 'this entry';
      const overlay = document.getElementById('confirmOverlay');
      const detail  = document.getElementById('confirmDetail');
      const form    = document.getElementById('deleteForm');
      if (!overlay) return;
      if (detail) detail.textContent = label;
      if (form)   form.action = form.dataset.base + '/' + id + '/delete';
      overlay.classList.add('active');
    });
  });

  const cancelDel = document.getElementById('cancelDelete');
  if (cancelDel) cancelDel.addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.remove('active');
  });

  const deleteForm = document.getElementById('deleteForm');
  if (deleteForm) {
    deleteForm.addEventListener('submit', () => {
      sessionStorage.setItem('deleteScrollY', window.scrollY);
    });
  }
}

// ── Success dialog auto-show ───────────────────────────────────────────────
function initSuccess() {
  const overlay = document.getElementById('successOverlay');
  if (overlay) {
    overlay.classList.add('active');
    const doneBtn = document.getElementById('successDone');
    if (doneBtn) doneBtn.addEventListener('click', () => overlay.classList.remove('active'));
  }
}

// ── Captcha ────────────────────────────────────────────────────────────────
function initCaptcha() {
  const refreshBtn = document.getElementById('refreshCaptcha');
  if (!refreshBtn) return;
  refreshBtn.addEventListener('click', async () => {
    const res  = await fetch('/captcha/new');
    const data = await res.json();
    document.getElementById('captchaDisplay').textContent = data.text;
    document.getElementById('captchaToken').value = data.token;
    document.getElementById('captchaInput').value = '';
  });
}

// ── Form validation ────────────────────────────────────────────────────────
function initFormValidation() {
  document.querySelectorAll('form.validated').forEach(form => {
    form.addEventListener('submit', e => {
      let valid = true;
      form.querySelectorAll('[required]').forEach(field => {
        const errEl = field.parentElement.querySelector('.field-error');
        if (!field.value.trim()) {
          field.classList.add('error');
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'This field is required'; }
          valid = false;
        } else {
          field.classList.remove('error');
          if (errEl) errEl.style.display = 'none';
        }
      });
      if (!valid) e.preventDefault();
    });
  });
}

// ── Date default to today ──────────────────────────────────────────────────
function initDateDefaults() {
  document.querySelectorAll('input[type=date].today-default').forEach(el => {
    if (!el.value) {
      const now = new Date();
      el.value = now.toISOString().split('T')[0];
    }
  });
}

// ── FY archive selector ────────────────────────────────────────────────────
function initFYSelector() {
  const sel = document.getElementById('fySelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const fy  = sel.value;
    const url = new URL(window.location.href);
    url.searchParams.set('fy', fy);
    window.location.href = url.toString();
  });
}

// ── Init all ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initSort();
  initPOCalc();
  initSanctionCalc();
  initAddEntry();
  initEditEntry();
  initDelete();
  initSuccess();
  initCaptcha();
  initFormValidation();
  initDateDefaults();
  initFYSelector();
});

// ── Show more / show less for description cells ────────────────────────────
function toggleDesc(btn) {
  const td        = btn.parentElement;
  const short     = td.querySelector('.desc-short');
  const full      = td.querySelector('.desc-full');
  const isShowing = full.style.display === 'none';

  if (isShowing) {
    short.style.display = 'none';
    full.style.display  = 'block';
    btn.textContent     = 'show less';
  } else {
    short.style.display = 'block';
    full.style.display  = 'none';
    btn.textContent     = 'show more';
  }
}