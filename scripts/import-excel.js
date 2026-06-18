const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'registers.db'));
db.pragma('journal_mode = WAL');

const ENTERED_BY = 'admin';

// ── FY helpers ────────────────────────────────────────────────
function getCurrentFY() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function normalizeFY(fy) {
  // '22-23' → '2022-2023'
  if (/^\d{2}-\d{2}$/.test(fy)) {
    return `20${fy.slice(0,2)}-20${fy.slice(3)}`;
  }
  // '2024-25' → '2024-2025'
  if (/^\d{4}-\d{2}$/.test(fy)) {
    const startYear = fy.slice(0, 4);
    return `${startYear}-${startYear.slice(0, 2)}${fy.slice(5)}`;
  }
  return fy; // already '2024-2025'
}

// ── Parse args ────────────────────────────────────────────────
const FY_PATTERN = /^\d{2,4}-\d{2,4}$/;
const args = process.argv.slice(2);

let FY, fileArgs;
if (args.length >= 3 && FY_PATTERN.test(args[1])) {
  FY = normalizeFY(args[1]);
  fileArgs = args.slice(2);
} else {
  FY = getCurrentFY();
  fileArgs = args.slice(1);
}

// ── Helper: find sheet by FY ──────────────────────────────────
function findSheet(wb, fy) {
  const [fyStart, fyEnd] = fy.split('-');
  const shortFY = `${fyStart.slice(2)}-${fyEnd.slice(2)}`; // '26-27'
  const shortStart = fyStart.slice(2);                      // '26'  (for PO tabs like '2026')

  const sheet = wb.SheetNames.find(n =>
    n.trim() === fyStart ||           // '2026'
    n.trim() === shortFY ||           // '26-27'
    n.includes(fyStart) ||            // '2026-27', '2026'
    n.includes(shortFY) ||            // '26-27'
    n.includes(`${fyStart}-${fyEnd.slice(2)}`) // '2026-27'
  );
  return sheet || null;
}

// ── Helper: parse date from Excel ─────────────────────────────
function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ── Helper: safe number ───────────────────────────────────────
function toNum(val) {
  const n = parseFloat(String(val).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

// ── INWARD ────────────────────────────────────────────────────
function importInward(filePath) {
  console.log('\nImporting Inward from:', filePath);
  console.log('Financial Year:', FY);
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const sheetName = findSheet(wb, FY);
  if (!sheetName) {
    console.error(`❌ No sheet found for FY ${FY}. Available:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  try { db.exec(`ALTER TABLE inward_orders ADD COLUMN c_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO inward_orders
      (c_no, c_no_text, financial_year, date, received_from, subject, file_no, remarks, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0, skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row     = rows[i];
    const cno     = String(row[1] || '').trim();
    const dateRaw = row[2];
    const from    = String(row[3] || '').trim();
    const subject = String(row[4] || '').trim();
    const fileNo  = String(row[5] || '').trim();
    const remarks = String(row[6] || '').trim();

    if (!cno || !from || !subject) { skipped++; continue; }
    const cnoNum = parseInt(cno);
    if (isNaN(cnoNum)) { skipped++; continue; }

    const date = parseDate(dateRaw);
    if (!date) { console.warn(`  Row ${i+1}: bad date "${dateRaw}", skipping`); skipped++; continue; }

    try {
      insert.run(cnoNum, String(cnoNum), FY, date, from, subject, fileNo, remarks, ENTERED_BY);
      count++;
    } catch(e) {
      console.warn(`  Row ${i+1}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`✓ Inward: ${count} inserted, ${skipped} skipped`);
}

// ── OUTWARD ───────────────────────────────────────────────────
function importOutward(filePath) {
  console.log('\nImporting Outward from:', filePath);
  console.log('Financial Year:', FY);
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const sheetName = findSheet(wb, FY);
  if (!sheetName) {
    console.error(`❌ No sheet found for FY ${FY}. Available:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  try { db.exec(`ALTER TABLE outward_orders ADD COLUMN d_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO outward_orders
      (d_no, d_no_text, financial_year, date, to_whom_addressed, description, file_no, remarks, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0, skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row     = rows[i];
    const dno     = String(row[0] || '').trim();
    const dateRaw = row[1];
    const toWhom  = String(row[3] || '').trim();
    const desc    = String(row[4] || '').trim();
    const fileNo  = String(row[5] || '').trim();

    if (!dno || !toWhom || !desc) { skipped++; continue; }
    const dnoNum = parseInt(dno);
    if (isNaN(dnoNum)) { skipped++; continue; }

    const date = parseDate(dateRaw);
    if (!date) { console.warn(`  Row ${i+1}: bad date "${dateRaw}", skipping`); skipped++; continue; }

    try {
      insert.run(dnoNum, String(dnoNum), FY, date, toWhom, desc, fileNo, '', ENTERED_BY);
      count++;
    } catch(e) {
      console.warn(`  Row ${i+1}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`✓ Outward: ${count} inserted, ${skipped} skipped`);
}

// ── SANCTIONS ─────────────────────────────────────────────────
// Excel columns (0-indexed), data starts row 3 (i=2):
//   A=0  Sl.No
//   B=1  Sanction No.
//   C=2  Date
//   D=3  Reference
//   E=4  Description
//   F=5  Division         (no DB column — stored in description suffix if needed, skipped)
//   G=6  Amount without GST  → amount
//   H=7  % GST in Rs.       → (ignored, not in schema)
//   I=8  Total               → (ignored, not in schema)
//
// DB columns: sl_no, sl_no_text, financial_year, sanction_no, date,
//             expenditure_details, amount, reference, entered_by
function importSanctions(filePath) {
  console.log('\nImporting Sanctions from:', filePath);
  console.log('Financial Year:', FY);
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const sheetName = findSheet(wb, FY);
  if (!sheetName) {
    console.error(`❌ No sheet found for FY ${FY}. Available:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  try { db.exec(`ALTER TABLE sanctions ADD COLUMN sl_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO sanctions
      (sl_no, sl_no_text, financial_year, sanction_no, date,
       expenditure_details, amount, reference, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0, skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row        = rows[i];
    const slno       = String(row[0] || '').trim();
    const sanctionNo = String(row[1] || '').trim();
    const dateRaw    = row[2];
    const reference  = String(row[3] || '').trim();
    const desc       = String(row[4] || '').trim();
    const amount     = toNum(row[6]);

    // Skip empty rows — need at least sl_no and description
    if (!slno || !desc) { skipped++; continue; }
    const slnoNum = parseInt(slno);
    if (isNaN(slnoNum)) { skipped++; continue; }

    const date = parseDate(dateRaw);
    if (!date) { console.warn(`  Row ${i+1}: bad date "${dateRaw}", skipping`); skipped++; continue; }

    try {
      insert.run(slnoNum, String(slnoNum), FY, sanctionNo, date, desc, amount, reference, ENTERED_BY);
      count++;
    } catch(e) {
      console.warn(`  Row ${i+1}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`✓ Sanctions: ${count} inserted, ${skipped} skipped`);
}

// ── PURCHASE ORDERS ───────────────────────────────────────────
// Excel columns (0-indexed), data starts row 3 (i=2):
//   A=0  Sl.No
//   B=1  Financial yr      (ignored — we use FY arg)
//   C=2  SAP PO Number
//   D=3  Date
//   E=4  Name of Supplier
//   F=5  Description
//   G=6  Quantity
//   H=7  Rate
//   I=8  Total (po_cost)
//   J=9  GST @
//   K=10 Total Amount
//
// DB columns: sl_no, sl_no_text, financial_year, date, sap_po_no,
//             name_supplier, description, qty, rate, po_cost,
//             gst_percent, total, entered_by
//
// NOTE: PO sheet tabs use short start year only e.g. '2026', '2024-25'
function importPurchaseOrders(filePath) {
  console.log('\nImporting Purchase Orders from:', filePath);
  console.log('Financial Year:', FY);
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const sheetName = findSheet(wb, FY);
  if (!sheetName) {
    console.error(`❌ No sheet found for FY ${FY}. Available:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN sl_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO purchase_orders
      (sl_no, sl_no_text, financial_year, date, sap_po_no,
       name_supplier, description, qty, rate, po_cost, gst_percent, total, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0, skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row      = rows[i];
    const slno     = String(row[0] || '').trim();
    const sapPoNo  = String(row[2] || '').trim();
    const dateRaw  = row[3];
    const supplier = String(row[4] || '').trim();
    const desc     = String(row[5] || '').trim();
    const qty      = toNum(row[6]);
    const rate     = toNum(row[7]);
    const poCost   = toNum(row[8]);
    const gstPct   = toNum(row[9]);
    const total    = toNum(row[10]);

    // Skip empty rows
    if (!slno || !supplier || !desc) { skipped++; continue; }
    const slnoNum = parseInt(slno);
    if (isNaN(slnoNum)) { skipped++; continue; }

    const date = parseDate(dateRaw);
    if (!date) { console.warn(`  Row ${i+1}: bad date "${dateRaw}", skipping`); skipped++; continue; }

    try {
      insert.run(slnoNum, String(slnoNum), FY, date, sapPoNo, supplier, desc,
                 qty, rate, poCost, gstPct, total, ENTERED_BY);
      count++;
    } catch(e) {
      console.warn(`  Row ${i+1}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`✓ Purchase Orders: ${count} inserted, ${skipped} skipped`);
}

// ── MAIN ──────────────────────────────────────────────────────
if (args.length === 0) {
  console.log('Usage:');
  console.log('  node scripts/import-excel.js inward    [FY] <file.xlsx>');
  console.log('  node scripts/import-excel.js outward   [FY] <file.xlsx>');
  console.log('  node scripts/import-excel.js sanctions [FY] <file.xlsx>');
  console.log('  node scripts/import-excel.js po        [FY] <file.xlsx>');
  console.log('  node scripts/import-excel.js both      [FY] <inward.xlsx> <outward.xlsx>');
  console.log('');
  console.log('  FY examples: 2024-25 or 2024-2025 (optional, defaults to current FY)');
  process.exit(0);
}
//# Purchase Orders - current FY
//node scripts/import-excel.js po /Users/bobbilisnigdha/Desktop/purchase_order_register.xlsx
//Purchase Orders
//node scripts/import-excel.js po 2024-25 /Users/bobbilisnigdha/Desktop/purchase_order_register.xlsx
if (args[0] === 'inward')    importInward(fileArgs[0]);
if (args[0] === 'outward')   importOutward(fileArgs[0]);
if (args[0] === 'sanctions') importSanctions(fileArgs[0]);
if (args[0] === 'po')        importPurchaseOrders(fileArgs[0]);
if (args[0] === 'both') {
  importInward(fileArgs[0]);
  importOutward(fileArgs[1]);
}

db.close();
console.log('\nDone.');