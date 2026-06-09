const express  = require('express');
const router   = express.Router();
const ExcelJS  = require('exceljs');
const PDFDoc   = require('pdfkit');
const getDb    = require('../db');
const { currentFY } = require('../db/fy');

function inr(n) {
  if (n == null) return '';
  return '₹' + parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function getRows(db, module, fy) {
  const tables = {
    'purchase-orders': 'purchase_orders',
    'sanctions':       'sanctions',
    'inward':          'inward_orders',
    'outward':         'outward_orders',
  };
  const tbl = tables[module];
  if (!tbl) return null;
  const allRows = db.prepare(`SELECT * FROM ${tbl} WHERE financial_year=? ORDER BY rowid ASC`).all(fy);
  // Sort by numeric serial with suffix support
  allRows.sort((a, b) => {
    let aStr, bStr;
    if (tbl === 'inward_orders')  { aStr = String(a.c_no_text||a.c_no); bStr = String(b.c_no_text||b.c_no); }
    else if (tbl === 'outward_orders') { aStr = String(a.d_no_text||a.d_no); bStr = String(b.d_no_text||b.d_no); }
    else if (tbl === 'purchase_orders') { aStr = String(a.sl_no_text||a.sl_no); bStr = String(b.sl_no_text||b.sl_no); }
    else if (tbl === 'sanctions') { aStr = String(a.sl_no_text||a.sl_no); bStr = String(b.sl_no_text||b.sl_no); }
    else return 0;
    const aNum = parseInt(aStr); const bNum = parseInt(bStr);
    if (aNum !== bNum) return aNum - bNum;
    return aStr.localeCompare(bStr);
  });
  return allRows;
}

function moduleConfig(module) {
  return {
    'purchase-orders': {
      title: 'Purchase Orders',
      headers: ['SL.NO','SAP PO No.','Date','Name & Supplier','Description','Qty','Rate (₹)','PO Cost (₹)','GST (%)','Total (₹)','F.NO','Sign'],
      row: r => [r.sl_no_text||r.sl_no, r.sap_po_no, r.date, r.name_supplier, r.description, r.qty, inr(r.rate), inr(r.po_cost), r.gst_percent+'%', inr(r.total), r.file_no||'', r.sign||''],
      colWidths: [0.05, 0.09, 0.08, 0.12, 0.24, 0.04, 0.08, 0.08, 0.05, 0.08, 0.05, 0.14],
    },
    'sanctions': {
      title: 'Sanctions',
      headers: ['SL.NO','Sanction No.','Date','Expenditure Details','Amount (₹)','Reference','Signature'],
      row: r => [r.sl_no_text||r.sl_no, r.sanction_no, r.date, r.expenditure_details, inr(r.amount), r.reference||'', r.signature||''],
      colWidths: [0.06, 0.08, 0.09, 0.38, 0.1, 0.17, 0.12],
    },
    'inward': {
      title: 'Inward Orders',
      headers: ['C.NO','Date','Received From','Subject','File No.','Remarks'],
      row: r => [r.c_no_text||r.c_no, r.date, r.received_from, r.subject, r.file_no||'', r.remarks||''],
      colWidths: [0.06, 0.1, 0.2, 0.4, 0.1, 0.14],
    },
    'outward': {
      title: 'Outward Orders',
      headers: ['D.NO','Date','To Whom Addressed','Description/Subject','File No.','Remarks'],
      row: r => [r.d_no_text||r.d_no, r.date, r.to_whom_addressed, r.description, r.file_no||'', r.remarks||''],
      colWidths: [0.06, 0.1, 0.2, 0.4, 0.1, 0.14],
    },
  }[module] || null;
}

router.get('/:module/excel', async (req, res) => {
  const db   = getDb();
  const fy   = req.query.fy || currentFY();
  const mod  = req.params.module;
  const cfg  = moduleConfig(mod);
  const rows = getRows(db, mod, fy);
  if (!cfg || !rows) return res.status(404).send('Not found');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TGTRANSCO IT Wing';
  const ws = wb.addWorksheet(cfg.title);

  ws.mergeCells(1, 1, 1, cfg.headers.length);
  ws.getCell('A1').value = `TGTRANSCO – ${cfg.title} – FY ${fy}`;
  ws.getCell('A1').font  = { bold:true, size:14 };
  ws.getCell('A1').alignment = { horizontal:'center' };

  const hdrRow = ws.addRow(cfg.headers);
  hdrRow.eachCell(cell => {
    cell.font      = { bold:true };
    cell.alignment = { horizontal:'center', wrapText:true };
    cell.border = {
      bottom: { style:'medium', color:{ argb:'FF000000' } }
    };
  });

  rows.forEach((r) => {
    const dr = ws.addRow(cfg.row(r));
    dr.eachCell(cell => { cell.alignment = { wrapText:true }; });
  });

  ws.columns.forEach(col => {
    let max = 12;
    col.eachCell({ includeEmpty:true }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 40);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="TGTRANSCO_${cfg.title.replace(/\s/g,'_')}_${fy}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/:module/pdf', (req, res) => {
  const db   = getDb();
  const fy   = req.query.fy || currentFY();
  const mod  = req.params.module;
  const cfg  = moduleConfig(mod);
  const rows = getRows(db, mod, fy);
  if (!cfg || !rows) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="TGTRANSCO_${cfg.title.replace(/\s/g,'_')}_${fy}.pdf"`);

  const doc = new PDFDoc({ margin:30, size:'A4', layout:'landscape' });
  doc.pipe(res);

  doc.fontSize(14).fillColor('#0f2a4a').text(`TGTRANSCO – ${cfg.title}`, { align:'center' });
  doc.fontSize(10).fillColor('#5a6278').text(`Financial Year: ${fy}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`, { align:'center' });
  doc.moveDown(0.5);

  const pageW = doc.page.width - 60;
  let y = doc.y;

  // Use custom column widths if defined, otherwise equal widths
  const colWidths = cfg.colWidths
    ? cfg.colWidths.map(w => w * pageW)
    : cfg.headers.map(() => pageW / cfg.headers.length);

  function drawRow(cells, isHeader) {
    const x = 30;
    const fontSize = isHeader ? 7.5 : 7;
    doc.fontSize(fontSize);

    // Calculate row height based on tallest cell
    let maxHeight = 16;
    if (!isHeader) {
      cells.forEach((cell, i) => {
        const cw = colWidths[i];
        const textHeight = doc.heightOfString(String(cell||''), { width: cw - 6 });
        if (textHeight + 8 > maxHeight) maxHeight = textHeight + 8;
      });
      maxHeight = Math.min(maxHeight, 120); // cap at 120px
    }

    doc.rect(x, y, pageW, maxHeight).fill(isHeader ? '#0f2a4a' : '#f4f6f9').stroke('#d8dce4');
    let cx = x;
    cells.forEach((cell, i) => {
      const cw = colWidths[i];
      doc.fillColor(isHeader ? '#ffffff' : '#1a1f2e')
         .fontSize(fontSize)
         .text(String(cell||''), cx + 3, y + 4, { width: cw - 6, height: maxHeight - 6, lineBreak: true });
      cx += cw;
    });
    y += maxHeight;
    if (y > doc.page.height - 50) { doc.addPage({ layout:'landscape', margin:30 }); y = 30; }
  }

  drawRow(cfg.headers, true);
  rows.forEach(r => drawRow(cfg.row(r), false));
  doc.fontSize(8).fillColor('#9ca3af').text(`Total: ${rows.length} entries`, 30, y + 10, { width: pageW - 30 });
  doc.end();
});

module.exports = router;
