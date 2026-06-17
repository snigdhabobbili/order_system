const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'registers.db'));
db.pragma('journal_mode = WAL');

const ENTERED_BY = 'admin';

// ── FY helper ─────────────────────────────────────────────────
function getCurrentFY() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function normalizeFY(fy) {
  // '2024-25' → '2024-2025'
  if (/^\d{4}-\d{2}$/.test(fy)) {
    const startYear = fy.slice(0, 4);
    return `${startYear}-${startYear.slice(0, 2)}${fy.slice(5)}`;
  }
  return fy; // already '2024-2025'
}

// ── Parse args: detect optional FY between register and file ──
const FY_PATTERN = /^\d{4}-\d{2,4}$/;
const args = process.argv.slice(2);

let FY, fileArgs;
if (args.length >= 3 && FY_PATTERN.test(args[1])) {
  FY = normalizeFY(args[1]);
  fileArgs = args.slice(2);
} else {
  FY = getCurrentFY();
  fileArgs = args.slice(1);
}

// ── Helper: parse date from Excel ─────────────────────────────
function parseDate(val) {
  if (!val) return null;
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
  }
  // String like 01.04.2026 or 01/04/2026 or 01-04-2026
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ── INWARD ────────────────────────────────────────────────────
function importInward(filePath) {
  console.log('\nImporting Inward from:', filePath);
  console.log('Financial Year:', FY);
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const [fyStart, fyEnd] = FY.split('-');
  const shortFY = `${fyStart.slice(2)}-${fyEnd.slice(2)}`;
  const sheetName = wb.SheetNames.find(n =>
    n.includes(fyStart) || n.includes(shortFY) || n.includes(`${fyStart}-${fyEnd.slice(2)}`)
  );
  if (!sheetName) {
    console.error(`Could not find sheet for FY ${FY}. Available sheets:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Ensure c_no_text column exists
  try { db.exec(`ALTER TABLE inward_orders ADD COLUMN c_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO inward_orders (c_no, c_no_text, financial_year, date, received_from, subject, file_no, remarks, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  let skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    // Col B=1, C=2, D=3, E=4, F=5, G=6 (0-indexed)
    const cno      = String(row[1] || '').trim();
    const dateRaw  = row[2];
    const from     = String(row[3] || '').trim();
    const subject  = String(row[4] || '').trim();
    const fileNo   = String(row[5] || '').trim();
    const remarks  = String(row[6] || '').trim();

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

  const [fyStart, fyEnd] = FY.split('-');
  const shortFY = `${fyStart.slice(2)}-${fyEnd.slice(2)}`;
  const sheetName = wb.SheetNames.find(n =>
    n.includes(fyStart) || n.includes(shortFY) || n.includes(`${fyStart}-${fyEnd.slice(2)}`)
  );
  if (!sheetName) {
    console.error(`Could not find sheet for FY ${FY}. Available sheets:`, wb.SheetNames);
    return;
  }
  console.log('Using sheet:', sheetName);

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Ensure d_no_text column exists
  try { db.exec(`ALTER TABLE outward_orders ADD COLUMN d_no_text TEXT`); } catch(e) {}

  const insert = db.prepare(`
    INSERT INTO outward_orders (d_no, d_no_text, financial_year, date, to_whom_addressed, description, file_no, remarks, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  let skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    // Col A=0, B=1, D=3, E=4, F=5
    const dno      = String(row[0] || '').trim();
    const dateRaw  = row[1];
    const toWhom   = String(row[3] || '').trim();
    const desc     = String(row[4] || '').trim();
    const fileNo   = String(row[5] || '').trim();

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

// ── MAIN ──────────────────────────────────────────────────────
if (args.length === 0) {
  console.log('Usage:');
  console.log('  node scripts/import-excel.js inward  [FY] <path-to-file.xlsx>');
  console.log('  node scripts/import-excel.js outward [FY] <path-to-file.xlsx>');
  console.log('  node scripts/import-excel.js both    [FY] <inward.xlsx> <outward.xlsx>');
  console.log('  FY examples: 2024-25 or 2024-2025 (optional, defaults to current FY)');
  process.exit(0);
}

if (args[0] === 'inward')  importInward(fileArgs[0]);
if (args[0] === 'outward') importOutward(fileArgs[0]);
if (args[0] === 'both') {
  importInward(fileArgs[0]);
  importOutward(fileArgs[1]);
}

db.close();
console.log('\nDone.');