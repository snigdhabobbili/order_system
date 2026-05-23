
const Database = require('better-sqlite3');

const bcrypt   = require('bcrypt');

const path     = require('path');

// ── CHANGE PASSWORDS HERE ─────────────────────────────────────────────

const PASSWORDS = {

  admin: 'admin1234',

  user1: 'user123',

  user2: 'user456',

};

// ─────────────────────────────────────────────────────────────────────

const db = new Database(path.join(__dirname, 'db', 'registers.db'));

Object.entries(PASSWORDS).forEach(([username, password]) => {

  const hash = bcrypt.hashSync(password, 12);

  db.prepare('UPDATE users SET password=? WHERE username=?').run(hash, username);

  console.log(`✓ Password updated for: ${username}`);

});

db.close();

console.log('\nDone. Restart the server for changes to take effect.');

