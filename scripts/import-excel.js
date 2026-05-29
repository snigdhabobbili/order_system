const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'registers.db'));
db.pragma('journal_mode = WAL');

const FY = '2026-2027';
const ENTERED_BY = 'admin';

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
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  // Find the 2026-27 sheet
  const sheetName = wb.SheetNames.find(n => n.includes('2026') || n.includes('26-27') || n.includes('2026-27'));
  if (!sheetName) {
    console.error('Could not find 2026-27 sheet. Available sheets:', wb.SheetNames);
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
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });

  const sheetName = wb.SheetNames.find(n => n.includes('2026') || n.includes('26-27') || n.includes('2026-27'));
  if (!sheetName) {
    console.error('Could not find 2026-27 sheet. Available sheets:', wb.SheetNames);
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
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage:');
  console.log('  node scripts/import-excel.js inward  <path-to-file.xlsx>');
  console.log('  node scripts/import-excel.js outward <path-to-file.xlsx>');
  console.log('  node scripts/import-excel.js both    <inward.xlsx> <outward.xlsx>');
  process.exit(0);
}

if (args[0] === 'inward')  importInward(args[1]);
if (args[0] === 'outward') importOutward(args[1]);
if (args[0] === 'both') {
  importInward(args[1]);
  importOutward(args[2]);
}

db.close();
console.log('\nDone.');
