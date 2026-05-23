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
  return db.prepare(`SELECT * FROM ${tbl} WHERE financial_year=? ORDER BY rowid ASC`).all(fy);
}

function moduleConfig(module) {
  return {
    'purchase-orders': {
      title: 'Purchase Orders',
      headers: ['SL.NO','SAP PO No.','Date','Name & Supplier','Description','Qty','Rate (₹)','PO Cost (₹)','GST (%)','Total (₹)','F.NO','Sign','Entered By'],
      row: r => [r.sl_no, r.sap_po_no, r.date, r.name_supplier, r.description, r.qty, inr(r.rate), inr(r.po_cost), r.gst_percent+'%', inr(r.total), r.file_no||'', r.sign||'', r.entered_by],
    },
    'sanctions': {
      title: 'Sanctions',
      headers: ['SL.NO','Sanction No.','Date','Expenditure Details','Amount (₹)','Reference','Signature','Entered By'],
      row: r => [r.sl_no, r.sanction_no, r.date, r.expenditure_details, inr(r.amount), r.reference||'', r.signature||'', r.entered_by],
    },
    'inward': {
      title: 'Inward Orders',
      headers: ['C.NO','Date','Received From','Subject','File No.','Remarks','Entered By'],
      row: r => [r.c_no, r.date, r.received_from, r.subject, r.file_no||'', r.remarks||'', r.entered_by],
    },
    'outward': {
      title: 'Outward Orders',
      headers: ['D.NO','Date','To Whom Addressed','Description/Subject','File No.','Remarks','Entered By'],
      row: r => [r.d_no, r.date, r.to_whom_addressed, r.description, r.file_no||'', r.remarks||'', r.entered_by],
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
    cell.font      = { bold:true, color:{ argb:'FFFFFFFF' } };
    cell.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F2A4A' } };
    cell.alignment = { horizontal:'center', wrapText:true };
  });

  rows.forEach((r, i) => {
    const dr = ws.addRow(cfg.row(r));
    if (i % 2 === 0) dr.eachCell(cell => {
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF4F6F9' } };
    });
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
  const colW  = pageW / cfg.headers.length;
  const rowH  = 20;
  let y = doc.y;

  function drawRow(cells, isHeader) {
    const x = 30;
    doc.rect(x, y, pageW, rowH).fill(isHeader ? '#0f2a4a' : '#f4f6f9').stroke('#d8dce4');
    cells.forEach((cell, i) => {
      doc.fillColor(isHeader ? '#ffffff' : '#1a1f2e')
         .fontSize(isHeader ? 7.5 : 7)
         .text(String(cell||''), x + i*colW + 3, y + 5, { width:colW-6, height:rowH-4, ellipsis:true, lineBreak:false });
    });
    y += rowH;
    if (y > doc.page.height - 50) { doc.addPage({ layout:'landscape', margin:30 }); y = 30; }
  }

  drawRow(cfg.headers, true);
  rows.forEach(r => drawRow(cfg.row(r), false));
  doc.fontSize(8).fillColor('#9ca3af').text(`Total: ${rows.length} entries`, { align:'right' });
  doc.end();
});

module.exports = router;
