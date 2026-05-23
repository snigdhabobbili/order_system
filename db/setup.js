const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'registers.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Users ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    role      TEXT NOT NULL CHECK(role IN ('admin','user1','user2'))
  );
`);

// ── Purchase Orders ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sl_no          INTEGER NOT NULL,
    financial_year TEXT NOT NULL,
    date           TEXT NOT NULL,
    sap_po_no      TEXT NOT NULL,
    name_supplier  TEXT NOT NULL,
    description    TEXT NOT NULL,
    qty            REAL NOT NULL,
    rate           REAL NOT NULL,
    po_cost        REAL NOT NULL,
    gst_percent    REAL NOT NULL,
    total          REAL NOT NULL,
    file_no        TEXT DEFAULT '',
    sign           TEXT DEFAULT '',
    entered_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Sanctions ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sanctions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sl_no               INTEGER NOT NULL,
    financial_year      TEXT NOT NULL,
    sanction_no         TEXT NOT NULL,
    date                TEXT NOT NULL,
    expenditure_details TEXT NOT NULL,
    amount              REAL NOT NULL,
    reference           TEXT,
    signature           TEXT,
    entered_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Inward Orders ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS inward_orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    c_no           INTEGER NOT NULL,
    financial_year TEXT NOT NULL,
    date           TEXT NOT NULL,
    received_from  TEXT NOT NULL,
    subject        TEXT NOT NULL,
    file_no        TEXT,
    remarks        TEXT,
    entered_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Outward Orders ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS outward_orders (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    d_no              INTEGER NOT NULL,
    financial_year    TEXT NOT NULL,
    date              TEXT NOT NULL,
    to_whom_addressed TEXT NOT NULL,
    description       TEXT NOT NULL,
    file_no           TEXT,
    remarks           TEXT,
    entered_by        TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Audit Log ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    module     TEXT NOT NULL,
    record_id  INTEGER NOT NULL,
    action     TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    timestamp  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Seed default users ─────────────────────────────────────────────────────
const SALT_ROUNDS = 12;

function seedUser(username, password, role) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!exists) {
    const hash = bcrypt.hashSync(password, SALT_ROUNDS);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role);
    console.log(`  Created user: ${username} (${role})`);
  }
}

console.log('Setting up database...');
seedUser('admin',  'admin123',  'admin');
seedUser('user1',  'user123',  'user1');
seedUser('user2',  'user456',  'user2');

console.log('Database setup complete:', DB_PATH);
db.close();

// Migration: add file_no and sign columns if not exist
try {
  db2 = new Database(DB_PATH);
  db2.exec(`ALTER TABLE purchase_orders ADD COLUMN file_no TEXT DEFAULT ''`);
  db2.close();
} catch(e) {}
try {
  db2 = new Database(DB_PATH);
  db2.exec(`ALTER TABLE purchase_orders ADD COLUMN sign TEXT DEFAULT ''`);
  db2.close();
} catch(e) {}
