const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'registers.db');

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    // Lazy migration — create notifications table if missing
    _db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        module     TEXT NOT NULL,
        record_id  INTEGER NOT NULL,
        action     TEXT NOT NULL,
        done_by    TEXT NOT NULL,
        message    TEXT NOT NULL,
        is_read    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
  }
  return _db;
}

module.exports = getDb;
