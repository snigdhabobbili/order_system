const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'registers.db');
const db = new Database(DB_PATH);

const migrations = [
  `ALTER TABLE purchase_orders ADD COLUMN file_no TEXT DEFAULT ''`,
  `ALTER TABLE purchase_orders ADD COLUMN sign TEXT DEFAULT ''`,
];

migrations.forEach(sql => {
  try { db.exec(sql); console.log('OK:', sql.slice(0,50)); }
  catch(e) { console.log('Skip (already exists):', sql.slice(0,50)); }
});

db.close();
console.log('Migration complete.');
