/**
 * TGTRANSCO IT Wing Registers — Weekly Excel Report
 * -------------------------------------------------
 * Runs every Monday via Windows Task Scheduler.
 * Exports all 4 registers (current financial year) to an Excel file
 * and emails it as an attachment via Gmail SMTP.
 *
 * Required env variables (set in Windows System Environment Variables):
 *   TGTRANSCO_GMAIL_USER      — sender Gmail address
 *   TGTRANSCO_GMAIL_APP_PASS  — Gmail App Password (not your login password)
 *   TGTRANSCO_REPORT_EMAIL    — recipient email address
 */

'use strict';

const path      = require('path');
const fs        = require('fs');
const Database  = require('better-sqlite3');
const ExcelJS   = require('exceljs');
const nodemailer = require('nodemailer');

// ── Config ─────────────────────────────────────────────────────────────────

const DB_PATH      = path.join(__dirname, '..', 'db', 'registers.db');
const REPORTS_DIR  = path.join(__dirname, '..', 'reports');
const LOG_FILE     = path.join(REPORTS_DIR, 'report-log.txt');

const GMAIL_USER   = process.env.TGTRANSCO_GMAIL_USER;
const GMAIL_PASS   = process.env.TGTRANSCO_GMAIL_APP_PASS;
const TO_EMAIL     = process.env.TGTRANSCO_REPORT_EMAIL;

// ── Financial year helper ──────────────────────────────────────────────────
// Returns e.g. "2024-25" based on today's date (April = new FY)

function getCurrentFinancialYear() {
  const now   = new Date();
  const month = now.getMonth() + 1; // 1-based
  const year  = now.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// ── Logging helper ─────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toLocaleString('en-IN')}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Column definitions per register ───────────────────────────────────────

const SHEETS = [
  {
    name:    'Purchase Orders',
    table:   'purchase_orders',
    columns: [
      { key: 'sl_no',         header: 'Sl. No.',        width: 8  },
      { key: 'date',          header: 'Date',            width: 14 },
      { key: 'sap_po_no',     header: 'SAP PO No.',      width: 16 },
      { key: 'name_supplier', header: 'Supplier',        width: 28 },
      { key: 'description',   header: 'Description',     width: 34 },
      { key: 'qty',           header: 'Qty',             width: 8  },
      { key: 'rate',          header: 'Rate (₹)',        width: 12 },
      { key: 'po_cost',       header: 'PO Cost (₹)',     width: 14 },
      { key: 'gst_percent',   header: 'GST %',           width: 8  },
      { key: 'total',         header: 'Total (₹)',       width: 14 },
      { key: 'file_no',       header: 'File No.',        width: 12 },
      { key: 'sign',          header: 'Sign',            width: 10 },
      
      { key: 'created_at',    header: 'Created At',      width: 18 },
    ],
  },
  {
    name:    'Sanctions',
    table:   'sanctions',
    columns: [
      { key: 'sl_no',               header: 'Sl. No.',             width: 8  },
      { key: 'sanction_no',         header: 'Sanction No.',        width: 16 },
      { key: 'date',                header: 'Date',                width: 14 },
      { key: 'expenditure_details', header: 'Expenditure Details', width: 38 },
      { key: 'amount',              header: 'Amount (₹)',          width: 14 },
      { key: 'reference',           header: 'Reference',           width: 20 },
      { key: 'signature',           header: 'Signature',           width: 12 },
      
      { key: 'created_at',          header: 'Created At',          width: 18 },
    ],
  },
  {
    name:    'Inward Orders',
    table:   'inward_orders',
    columns: [
      { key: 'c_no',          header: 'C. No.',         width: 8  },
      { key: 'date',          header: 'Date',           width: 14 },
      { key: 'received_from', header: 'Received From',  width: 28 },
      { key: 'subject',       header: 'Subject',        width: 38 },
      { key: 'file_no',       header: 'File No.',       width: 12 },
      { key: 'remarks',       header: 'Remarks',        width: 24 },
      
      { key: 'created_at',    header: 'Created At',     width: 18 },
    ],
  },
  {
    name:    'Outward Orders',
    table:   'outward_orders',
    columns: [
      { key: 'd_no',              header: 'D. No.',           width: 8  },
      { key: 'date',              header: 'Date',             width: 14 },
      { key: 'to_whom_addressed', header: 'To (Addressed)',   width: 28 },
      { key: 'description',       header: 'Description',      width: 38 },
      { key: 'file_no',           header: 'File No.',         width: 12 },
      { key: 'remarks',           header: 'Remarks',          width: 24 },
     
      { key: 'created_at',        header: 'Created At',       width: 18 },
    ],
  },
];

// ── Style helpers ──────────────────────────────────────────────────────────

const HEADER_FILL = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },   // dark navy
};
const ALT_FILL = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FFD6E4F0' },   // light blue
};
const BORDER = {
  top:    { style: 'thin', color: { argb: 'FFB0C4DE' } },
  left:   { style: 'thin', color: { argb: 'FFB0C4DE' } },
  bottom: { style: 'thin', color: { argb: 'FFB0C4DE' } },
  right:  { style: 'thin', color: { argb: 'FFB0C4DE' } },
};

function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.fill      = HEADER_FILL;
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = BORDER;
  });
  row.height = 28;
}

function styleDataRow(row, isAlt) {
  row.eachCell({ includeEmpty: true }, cell => {
    if (isAlt) cell.fill = ALT_FILL;
    cell.border    = BORDER;
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.font      = { size: 10 };
  });
  row.height = 18;
}

// ── Build Excel workbook ───────────────────────────────────────────────────

async function buildWorkbook(db, financialYear) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'TGTRANSCO IT Wing';
  wb.created  = new Date();

  for (const sheet of SHEETS) {
    const rows = db
      .prepare(`SELECT * FROM ${sheet.table} WHERE financial_year = ? ORDER BY id ASC`)
      .all(financialYear);

    const ws = wb.addWorksheet(sheet.name, {
      views: [{ state: 'frozen', ySplit: 2 }],  // freeze first 2 rows
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    // ── Title row ──────────────────────────────────────────────────────────
    ws.mergeCells(1, 1, 1, sheet.columns.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value     = `TGTRANSCO IT Wing — ${sheet.name}   |   FY ${financialYear}`;
    titleCell.font      = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FB' } };
    ws.getRow(1).height = 24;

    // ── Header row ─────────────────────────────────────────────────────────
    ws.columns = sheet.columns.map(c => ({ key: c.key, width: c.width }));
    const headerRow = ws.addRow(sheet.columns.map(c => c.header));
    styleHeaderRow(headerRow);

    // ── Data rows ──────────────────────────────────────────────────────────
    if (rows.length === 0) {
      const emptyRow = ws.addRow(['No entries for this financial year.']);
      emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
    } else {
      rows.forEach((record, i) => {
        const values = sheet.columns.map(c => record[c.key] ?? '');
        const dataRow = ws.addRow(values);
        styleDataRow(dataRow, i % 2 === 1);
      });
    }

    // ── Summary row ────────────────────────────────────────────────────────
    ws.addRow([]);  // blank spacer
    const summaryRow = ws.addRow([`Total records: ${rows.length}`]);
    summaryRow.getCell(1).font = { bold: true, italic: true, size: 10 };

    // ── Auto-filter on header ──────────────────────────────────────────────
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to:   { row: 2, column: sheet.columns.length },
    };
  }

  return wb;
}

// ── Send email ─────────────────────────────────────────────────────────────

async function sendEmail(filePath, financialYear, recordCounts) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  const today      = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
  const countLines = Object.entries(recordCounts)
    .map(([name, count]) => `  • ${name}: ${count} records`)
    .join('\n');

  await transporter.sendMail({
    from:    `"TGTRANSCO IT Wing" <${GMAIL_USER}>`,
    to:      TO_EMAIL,
    subject: `IT Wing Weekly Report — FY ${financialYear} — ${today}`,
    text:
`Dear Sir/Madam,

Please find attached the weekly register report for TGTRANSCO IT Wing.

Financial Year : ${financialYear}
Report Date    : ${today}

Summary:
${countLines}

This is an automated email generated by the IT Wing Registers system.

Regards,
TGTRANSCO IT Wing`,
    attachments: [{
      filename: path.basename(filePath),
      path:     filePath,
    }],
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Validate env vars
  if (!GMAIL_USER || !GMAIL_PASS || !TO_EMAIL) {
    log('ERROR: Missing environment variables. Set TGTRANSCO_GMAIL_USER, TGTRANSCO_GMAIL_APP_PASS, TGTRANSCO_REPORT_EMAIL.');
    process.exit(1);
  }

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const financialYear = getCurrentFinancialYear();
  log(`Starting weekly report — FY ${financialYear}`);

  // Open DB (read-only)
  const db = new Database(DB_PATH, { readonly: true });

  // Count records per register for email summary
  const recordCounts = {};
  for (const sheet of SHEETS) {
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM ${sheet.table} WHERE financial_year = ?`)
      .get(financialYear);
    recordCounts[sheet.name] = row.cnt;
  }

  // Build workbook
  log('Building Excel workbook...');
  const wb = await buildWorkbook(db, financialYear);
  db.close();

  // Save file
  const dateStamp = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const fileName  = `IT_Wing_Report_FY${financialYear}_${dateStamp}.xlsx`;
  const filePath  = path.join(REPORTS_DIR, fileName);
  await wb.xlsx.writeFile(filePath);
  log(`Excel saved: ${filePath}`);

  // Send email
  log(`Sending email to ${TO_EMAIL}...`);
  await sendEmail(filePath, financialYear, recordCounts);
  log('Email sent successfully.');
  log('─'.repeat(60));
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  process.exit(1);
});