
const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'db', 'registers.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const migrations = [
  { table: 'purchase_orders', col: 'sl_no_text',  src: 'sl_no' },
  { table: 'sanctions',       col: 'sl_no_text',  src: 'sl_no' },
  { table: 'outward_orders',  col: 'd_no_text',   src: 'd_no'  },
  // inward_orders already has c_no_text from prior work
];

for (const { table, col, src } of migrations) {
  const cols = db.pragma(`table_info(${table})`);
  if (!cols.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
    db.prepare(`UPDATE ${table} SET ${col} = CAST(${src} AS TEXT) WHERE ${col} IS NULL`).run();
    console.log(`✓ Added ${col} to ${table} and backfilled`);
  } else {
    // Backfill any NULLs in existing col
    db.prepare(`UPDATE ${table} SET ${col} = CAST(${src} AS TEXT) WHERE ${col} IS NULL OR ${col} = ''`).run();
    console.log(`✓ ${col} already exists in ${table} — backfilled NULLs`);
  }
}

db.close();
console.log('Migration complete.');
