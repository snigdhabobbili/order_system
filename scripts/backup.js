/**
 * TGTRANSCO Nightly Backup Script
 * Run every night at midnight via Windows Task Scheduler
 * Command: node C:\path\to\tgtransco\scripts\backup.js
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH    = path.join(__dirname, '..', 'db', 'registers.db');
const BACKUP_DIR = path.join(__dirname, '..', 'db', 'backups');
const LOG_FILE   = path.join(BACKUP_DIR, 'backup-log.txt');
const KEEP_DAYS  = 30;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function main() {
  log('=== Backup Job Started ===');

  if (!fs.existsSync(DB_PATH)) {
    log('ERROR: Database file not found: ' + DB_PATH);
    process.exit(1);
  }

  const now      = new Date();
  const stamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destFile = path.join(BACKUP_DIR, `registers_${stamp}.db`);

  fs.copyFileSync(DB_PATH, destFile);
  log(`Backup created: ${destFile}`);

  // Purge backups older than KEEP_DAYS
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files  = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
  let deleted  = 0;
  files.forEach(f => {
    const fp   = path.join(BACKUP_DIR, f);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(fp);
      deleted++;
    }
  });

  if (deleted > 0) log(`Purged ${deleted} old backup(s) (older than ${KEEP_DAYS} days)`);
  log('=== Backup Job Completed ===');
}

main();
