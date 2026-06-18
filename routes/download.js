const express  = require('express');        // Import Express web framework to handle HTTP routes
const router   = express.Router();          // Create a mini-router just for export routes (excel/pdf)
const ExcelJS  = require('exceljs');        // Library to build and write .xlsx Excel files
const PDFDoc   = require('pdfkit');         // Library to build and write PDF files
const getDb    = require('../db');          // Our function that opens and returns the SQLite database
const { currentFY } = require('../db/fy'); // Helper that returns current financial year e.g. "2024-25"

// ── Helper: format a number as Indian Rupees ───────────────────────────────

function inr(n) {                           // Takes a number, returns a formatted rupee string
  if (n == null) return '';                 // If value is missing/null, return blank instead of crashing
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}                                           // e.g. 123456.5 → "₹1,23,456.50" (Indian number format)

// ── Helper: fetch all rows for a given module and financial year ───────────

function getRows(db, module, fy) {          // db = database, module = which register, fy = financial year
  const tables = {                          // Map URL-friendly module names to actual database table names
    'purchase-orders': 'purchase_orders',
    'sanctions':       'sanctions',
    'inward':          'inward_orders',
    'outward':         'outward_orders',
  };
  const tbl = tables[module];              // Look up which table to query based on the module name
  if (!tbl) return null;                   // If module name is unrecognised, return null (will 404 later)
  const allRows = db.prepare(`SELECT * FROM ${tbl} WHERE financial_year=? ORDER BY rowid ASC`).all(fy);
                                           // Fetch all records for this table and financial year from DB

  // Sort rows by their serial number, supporting suffixes like "5A", "5B"
  allRows.sort((a, b) => {
    let aStr, bStr;
    if (tbl === 'inward_orders')       { aStr = String(a.c_no_text||a.c_no); bStr = String(b.c_no_text||b.c_no); }
                                           // Inward uses c_no as serial; fall back to c_no if c_no_text missing
    else if (tbl === 'outward_orders') { aStr = String(a.d_no_text||a.d_no); bStr = String(b.d_no_text||b.d_no); }
                                           // Outward uses d_no as serial
    else if (tbl === 'purchase_orders') { aStr = String(a.sl_no_text||a.sl_no); bStr = String(b.sl_no_text||b.sl_no); }
                                           // Purchase orders use sl_no as serial
    else if (tbl === 'sanctions') { aStr = String(a.sl_no_text||a.sl_no); bStr = String(b.sl_no_text||b.sl_no); }
                                           // Sanctions also use sl_no as serial
    else return 0;                         // Unknown table — don't change order
    const aNum = parseInt(aStr);           // Extract the numeric part of the serial e.g. "5A" → 5
    const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum; // Sort by number first (5 before 10)
    return aStr.localeCompare(bStr);       // If numbers are equal (e.g. 5A vs 5B), sort alphabetically
  });
  return allRows;                          // Return the sorted array of database rows
}

function moduleConfig(module) {
  return {
    'purchase-orders': {
      title: 'Purchase Orders',
      headers: ['SL.NO','SAP PO No.','Date','Name & Supplier','Description','Qty','Rate (₹)','GST (%)','GST Value (₹)','Total (₹)','F.NO','Sign'],
      row: r => [r.sl_no_text||r.sl_no, r.sap_po_no, r.date, r.name_supplier, r.description, r.qty, inr(r.rate), r.gst_percent+'%', inr(r.po_cost), inr(r.total), r.file_no||'', r.sign||''],
      colWidths: [0.05, 0.09, 0.08, 0.12, 0.24, 0.04, 0.08, 0.05, 0.08, 0.08, 0.05, 0.14],
    },
    'sanctions': {
      title: 'Sanctions',
      headers: ['SL.NO','Sanction No.','Date','Expenditure Details','Amount (₹)','Reference','Signature'],
      row: r => [r.sl_no_text||r.sl_no, r.sanction_no, r.date, r.expenditure_details, inr(r.amount), r.reference||'', r.signature||''],
      colWidths: [0.06, 0.08, 0.09, 0.38, 0.1, 0.17, 0.12],
    },
    'inward': {
      title: 'Inward Orders',
      headers: ['C.NO','Date','Received From','Subject','File No.'],
      row: r => [r.c_no_text||r.c_no, r.date, r.received_from, r.subject, r.file_no||''],
      colWidths: [0.08, 0.12, 0.24, 0.42, 0.14],
    },
    'outward': {
      title: 'Outward Orders',
      headers: ['D.NO','Date','To Whom Addressed','Description/Subject','File No.'],
      row: r => [r.d_no_text||r.d_no, r.date, r.to_whom_addressed, r.description, r.file_no||''],
      colWidths: [0.08, 0.12, 0.24, 0.42, 0.14],
    },
  }[module] || null;
}

router.get('/:module/excel', async (req, res) => {
  const db   = getDb();                    // Open database connection
  const fy   = req.query.fy || currentFY(); // Use ?fy= from URL, or default to current financial year
  const mod  = req.params.module;          // e.g. "purchase-orders" from the URL
  const cfg  = moduleConfig(mod);          // Get column/header config for this module
  const rows = getRows(db, mod, fy);       // Fetch sorted rows from DB
  if (!cfg || !rows) return res.status(404).send('Not found'); // Unknown module → 404 error

  const wb = new ExcelJS.Workbook();       // Create a new empty Excel workbook
  wb.creator = 'TGTRANSCO IT Wing';        // Set the "author" metadata inside the Excel file
  const ws = wb.addWorksheet(cfg.title);   // Add one worksheet (tab) named after the register

  ws.mergeCells(1, 1, 1, cfg.headers.length); // Merge all cells in row 1 into one wide title cell
  ws.getCell('A1').value = `TGTRANSCO – ${cfg.title} – FY ${fy}`; // Set the title text
  ws.getCell('A1').font  = { bold:true, size:14 };                 // Make title bold and large
  ws.getCell('A1').alignment = { horizontal:'center' };            // Centre-align the title

  const hdrRow = ws.addRow(cfg.headers);   // Add row 2 with all the column header labels
  hdrRow.eachCell(cell => {                // Loop through every cell in the header row
    cell.font      = { bold:true };        // Make header text bold
    cell.alignment = { horizontal:'center', wrapText:true }; // Centre and wrap long headers
    cell.border = {
      bottom: { style:'medium', color:{ argb:'FF000000' } }  // Add a thick black bottom border
    };
  });

  rows.forEach((r) => {                    // Loop through every database record
    const dr = ws.addRow(cfg.row(r));      // Convert the record to an array of values and add as a row
    dr.eachCell(cell => { cell.alignment = { wrapText:true }; }); // Allow text to wrap in cells
  });

  ws.columns.forEach(col => {              // Auto-size each column based on content length
    let max = 12;                          // Start with a minimum width of 12 characters
    col.eachCell({ includeEmpty:true }, cell => {
      const len = cell.value ? String(cell.value).length : 0; // Measure the text length of each cell
      if (len > max) max = len;            // Keep track of the longest value in this column
    });
    col.width = Math.min(max + 2, 40);     // Set column width = longest content + padding, capped at 40
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                                           // Tell the browser this response is an Excel file
  res.setHeader('Content-Disposition', `attachment; filename="TGTRANSCO_${cfg.title.replace(/\s/g,'_')}_${fy}.xlsx"`);
                                           // Tell the browser to download it with this filename
  await wb.xlsx.write(res);               // Stream the Excel file directly into the HTTP response
  res.end();                               // Close the response once writing is done
});

// ── Route: GET /export/:module/pdf ────────────────────────────────────────
// e.g. GET /export/sanctions/pdf?fy=2024-25

router.get('/:module/pdf', (req, res) => {
  const db   = getDb();                    // Open database connection
  const fy   = req.query.fy || currentFY(); // Use ?fy= from URL or default to current FY
  const mod  = req.params.module;          // Module name from URL
  const cfg  = moduleConfig(mod);          // Get config (headers, row mapper, column widths)
  const rows = getRows(db, mod, fy);       // Fetch sorted rows from DB
  if (!cfg || !rows) return res.status(404).send('Not found'); // Unknown module → 404

  res.setHeader('Content-Type', 'application/pdf'); // Tell browser this is a PDF
  res.setHeader('Content-Disposition', `attachment; filename="TGTRANSCO_${cfg.title.replace(/\s/g,'_')}_${fy}.pdf"`);
                                           // Tell browser to download with this filename

  const doc = new PDFDoc({ margin:30, size:'A4', layout:'landscape' }); // Create A4 landscape PDF
  doc.pipe(res);                           // Stream PDF output directly into the HTTP response

  doc.fontSize(14).fillColor('#0f2a4a').text(`TGTRANSCO – ${cfg.title}`, { align:'center' });
                                           // Print large dark-navy title centred at top of page
  doc.fontSize(10).fillColor('#5a6278').text(`Financial Year: ${fy}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`, { align:'center' });
                                           // Print subtitle with FY and today's date below the title
  doc.moveDown(0.5);                       // Add a small vertical gap before the table

  const pageW = doc.page.width - 60;      // Usable page width = total width minus left+right margins (30 each)
  let y = doc.y;                           // Track current vertical drawing position on the page

  const colWidths = cfg.colWidths
    ? cfg.colWidths.map(w => w * pageW)    // Convert fractional widths (e.g. 0.1) to actual pixel widths
    : cfg.headers.map(() => pageW / cfg.headers.length); // If no widths defined, split equally

  function drawRow(cells, isHeader) {      // Draws one row of the table (header or data)
    const x = 30;                          // Left margin where drawing starts
    const fontSize = isHeader ? 7.5 : 7;  // Header text slightly larger than data text
    doc.fontSize(fontSize);

    let maxHeight =
  (mod === 'inward' || mod === 'outward')
    ? 22
    : 16;
    if (!isHeader) {                       // For data rows, calculate height based on content
      cells.forEach((cell, i) => {
        const cw = colWidths[i];           // Width of this column
        const textHeight = doc.heightOfString(String(cell||''), { width: cw - 6 }); // How tall will this text be?
        if (textHeight + 8 > maxHeight) maxHeight = textHeight + 8; // Expand row if text is tall
      });
      maxHeight = Math.min(maxHeight, 120); // Cap row height at 120px to prevent runaway rows
    }

    doc.rect(x, y, pageW, maxHeight).fill(isHeader ? '#0f2a4a' : '#f4f6f9').stroke('#d8dce4');
                                           // Draw the row background: dark navy for header, light grey for data
    let cx = x;                            // Start drawing text from the left edge
    cells.forEach((cell, i) => {
      const cw = colWidths[i];             // Width of this specific column
      doc.fillColor(isHeader ? '#ffffff' : '#1a1f2e') // White text on header, dark text on data rows
         .fontSize(fontSize)
         .text(String(cell||''), cx + 3, y + 4, { width: cw - 6, height: maxHeight - 6, lineBreak: true });
                                           // Draw the cell text with padding (3px left, 4px top)
      cx += cw;                            // Move cursor right to the next column
    });
    y += maxHeight;                        // Move cursor down past this row
    if (
  mod !== 'inward' &&
  mod !== 'outward' &&
  y > doc.page.height - 50
) {
  doc.addPage({ layout:'landscape', margin:30 });
  y = 30;
}
                                           // If near bottom of page, add a new page and reset y position
  }

  drawRow(cfg.headers, true);

const enforce20Rows =
  mod === 'inward' ||
  mod === 'outward';

let rowsOnPage = 0;

rows.forEach(r => {

  if (enforce20Rows && rowsOnPage >= 20) {

    doc.addPage({
      layout: 'landscape',
      margin: 30
    });

    y = 30;

    drawRow(cfg.headers, true);

    rowsOnPage = 0;
  }

  drawRow(cfg.row(r), false);

  rowsOnPage++;
});

  doc.fontSize(8).fillColor('#9ca3af').text(`Total: ${rows.length} entries`, 30, y + 10, { width: pageW - 30 });
                                           // Print record count in small grey text below the table
  doc.end();                               // Finalise and close the PDF stream
});

module.exports = router;                   // Export this router so server.js can mount it