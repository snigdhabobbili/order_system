/**
 * TGTRANSCO Weekly Report Script
 * Run every Monday at 9:00 AM via Windows Task Scheduler
 * Command: node C:\path\to\tgtransco\scripts\weekly-report.js
 */

const path      = require('path');
const fs        = require('fs');
const ExcelJS   = require('exceljs');
const nodemailer= require('nodemailer');
const Database  = require('better-sqlite3');

const DB_PATH      = path.join(__dirname, '..', 'db', 'registers.db');
const REPORTS_DIR  = path.join(__dirname, '..', 'reports');
const LOG_FILE     = path.join(REPORTS_DIR, 'report-log.txt');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Date range: previous Monday 00:00 → Sunday 23:59 ──────────────────────
function getLastWeekRange() {
  const now    = new Date();
  const day    = now.getDay(); // 0=Sun, 1=Mon…
  const diffToMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);

  return {
    from: lastMonday.toISOString().slice(0, 10),
    to:   lastSunday.toISOString().slice(0, 10),
  };
}

function inr(n) {
  if (!n) return '';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function generateReport() {
  const db  = new Database(DB_PATH);
  const { from, to } = getLastWeekRange();
  log(`Generating weekly report for ${from} to ${to}`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TGTRANSCO IT Wing';
  wb.created = new Date();

  const modules = [
    {
      name: 'Purchase Orders',
      query: `SELECT * FROM purchase_orders WHERE date BETWEEN ? AND ? ORDER BY sl_no`,
      headers: ['SL.NO','SAP PO No.','Date','Name & Supplier','Description','Qty','Rate (₹)','PO Cost (₹)','GST (%)','Total (₹)','Final Sign','Entered By'],
      row: r => [r.sl_no, r.sap_po_no, r.date, r.name_supplier, r.description, r.qty, inr(r.rate), inr(r.po_cost), r.gst_percent+'%', inr(r.total), r.final_sign||'', r.entered_by],
    },
    {
      name: 'Sanctions',
      query: `SELECT * FROM sanctions WHERE date BETWEEN ? AND ? ORDER BY sl_no`,
      headers: ['SL.NO','Sanction No.','Date','Expenditure Details','Amount (₹)','Reference','Signature','Entered By'],
      row: r => [r.sl_no, r.sanction_no, r.date, r.expenditure_details, inr(r.amount), r.reference||'', r.signature||'', r.entered_by],
    },
    {
      name: 'Inward Orders',
      query: `SELECT * FROM inward_orders WHERE date BETWEEN ? AND ? ORDER BY c_no`,
      headers: ['C.NO','Date','Received From','Subject','File No.','Remarks','Entered By'],
      row: r => [r.c_no, r.date, r.received_from, r.subject, r.file_no||'', r.remarks||'', r.entered_by],
    },
    {
      name: 'Outward Orders',
      query: `SELECT * FROM outward_orders WHERE date BETWEEN ? AND ? ORDER BY d_no`,
      headers: ['D.NO','Date','To Whom Addressed','Description/Subject','File No.','Remarks','Entered By'],
      row: r => [r.d_no, r.date, r.to_whom_addressed, r.description, r.file_no||'', r.remarks||'', r.entered_by],
    },
  ];

  for (const mod of modules) {
    const rows = db.prepare(mod.query).all(from, to);
    const ws   = wb.addWorksheet(mod.name);

    ws.mergeCells(1, 1, 1, mod.headers.length);
    ws.getCell('A1').value = `TGTRANSCO – ${mod.name} – Week of ${from} to ${to}`;
    ws.getCell('A1').font  = { bold: true, size: 13 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    const hdr = ws.addRow(mod.headers);
    hdr.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A4A' } };
      c.alignment = { horizontal: 'center' };
    });

    rows.forEach((r, i) => {
      const dr = ws.addRow(mod.row(r));
      if (i % 2 === 0) dr.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
      });
    });

    ws.columns.forEach(col => {
      let max = 12;
      col.eachCell({ includeEmpty: true }, c => {
        const l = c.value ? String(c.value).length : 0;
        if (l > max) max = l;
      });
      col.width = Math.min(max + 2, 40);
    });

    const summary = ws.addRow([`Total: ${rows.length} entries`]);
    summary.getCell(1).font = { italic: true, color: { argb: 'FF5a6278' } };

    log(`  ${mod.name}: ${rows.length} entries`);
  }

  db.close();

  // Save file
  const filename = `TGTRANSCO_Weekly_Report_${from}_to_${to}.xlsx`;
  const filepath = path.join(REPORTS_DIR, filename);
  await wb.xlsx.writeFile(filepath);
  log(`Report saved: ${filepath}`);

  return { filepath, filename, from, to };
}

async function sendEmail(filepath, filename, from, to) {
  const gmailUser = process.env.TGTRANSCO_GMAIL_USER;
  const gmailPass = process.env.TGTRANSCO_GMAIL_APP_PASS;
  const recipient = process.env.TGTRANSCO_REPORT_EMAIL;

  if (!gmailUser || !gmailPass || !recipient) {
    log('WARNING: Email env vars not set. Skipping email send.');
    log('  Set TGTRANSCO_GMAIL_USER, TGTRANSCO_GMAIL_APP_PASS, TGTRANSCO_REPORT_EMAIL');
    return;
  }

  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: `TGTRANSCO IT Wing <${gmailUser}>`,
    to:   recipient,
    subject: `TGTRANSCO Weekly Register Report – ${from} to ${to}`,
    text: `Please find attached the weekly register report for TGTRANSCO IT Wing.\n\nPeriod: ${from} to ${to}\n\nThis is an automated email.`,
    attachments: [{ filename, path: filepath }],
  });

  log(`Email sent to ${recipient}`);
}

async function main() {
  log('=== Weekly Report Job Started ===');
  try {
    const { filepath, filename, from, to } = await generateReport();
    try {
      await sendEmail(filepath, filename, from, to);
    } catch (emailErr) {
      log(`ERROR sending email: ${emailErr.message}`);
      log('Report file is saved locally. Email failed.');
    }
    log('=== Weekly Report Job Completed ===');
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    log(err.stack);
    process.exit(1);
  }
}

main();
