const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'db', 'registers.db'));
db.pragma('journal_mode = WAL');

// ── Parse args ────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage:');
  console.log('  node scripts/delete-fy.js inward    <FY>');
  console.log('  node scripts/delete-fy.js outward   <FY>');
  console.log('  node scripts/delete-fy.js sanctions <FY>');
  console.log('  node scripts/delete-fy.js po        <FY>');
  console.log('  node scripts/delete-fy.js all       <FY>');
  console.log('');
  console.log('  FY examples: 2024-25 or 2024-2025');
  process.exit(0);
}

const register = args[0];
const fyRaw    = args[1];

// Normalize FY: '2024-25' → '2024-2025'
function normalizeFY(fy) {
  if (/^\d{4}-\d{2}$/.test(fy)) {
    const startYear = fy.slice(0, 4);
    return `${startYear}-${startYear.slice(0, 2)}${fy.slice(5)}`;
  }
  return fy;
}

const FY = normalizeFY(fyRaw);

const TABLE_MAP = {
  inward:    'inward_orders',
  outward:   'outward_orders',
  sanctions: 'sanctions',
  po:        'purchase_orders',
};

function deleteFromTable(tableName, fy) {
  const existing = db.prepare(`SELECT COUNT(*) as c FROM ${tableName} WHERE financial_year=?`).get(fy);
  if (existing.c === 0) {
    console.log(`  No records found in ${tableName} for FY ${fy} — nothing deleted.`);
    return;
  }
  const result = db.prepare(`DELETE FROM ${tableName} WHERE financial_year=?`).run(fy);
  console.log(`✓ Deleted ${result.changes} records from ${tableName} for FY ${fy}`);
}

// ── Safety confirmation ───────────────────────────────────────
const tables = register === 'all'
  ? Object.values(TABLE_MAP)
  : [TABLE_MAP[register]];

if (!tables[0]) {
  console.error(`❌ Unknown register: "${register}". Use: inward, outward, sanctions, po, all`);
  process.exit(1);
}

// Show what will be deleted
console.log(`\n⚠️  About to delete ALL records for FY ${FY} from:`);
tables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE financial_year=?`).get(FY);
  console.log(`   ${t}: ${count.c} records`);
});

// Require --confirm flag for safety
if (!args.includes('--confirm')) {
  console.log('\n  Run again with --confirm to actually delete:');
  if (register === 'all') {
    console.log(`  node scripts/delete-fy.js all ${fyRaw} --confirm`); //node scripts/delete-fy.js po 2024-25 --confirm
  } else {
    console.log(`  node scripts/delete-fy.js ${register} ${fyRaw} --confirm`);
  }
  console.log('');
  process.exit(0);
}

// Execute deletion
console.log('');
tables.forEach(t => deleteFromTable(t, FY));

db.close();
console.log('\nDone.');
// Delete the entries
//node scripts/delete-fy.js po 2026-2027 --confirm