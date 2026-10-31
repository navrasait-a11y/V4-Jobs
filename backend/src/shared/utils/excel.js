import ExcelJS from 'exceljs';
import ApiError from '../errors/ApiError.js';

/**
 * columns: [{ header: 'Full Name', key: 'fullName', width?: 25, get?: (row) => value }]
 * Returns an xlsx Buffer.
 */
export async function buildWorkbook(sheetName, columns, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Freejobwala';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    const values = {};
    for (const c of columns) {
      let v = c.get ? c.get(row) : c.key.split('.').reduce((o, k) => (o === null || o === undefined ? o : o[k]), row);
      if (Array.isArray(v)) v = v.join(', ');
      if (v && typeof v === 'object' && !(v instanceof Date)) v = String(v);
      values[c.key] = v ?? '';
    }
    ws.addRow(values);
  }
  return wb.xlsx.writeBuffer();
}

export function buildCsv(columns, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => esc(c.get ? c.get(row) : c.key.split('.').reduce((o, k) => (o === null || o === undefined ? o : o[k]), row))).join(','));
  }
  const BOM = '\uFEFF'; // lets Excel detect UTF-8
  return Buffer.from(BOM + lines.join('\n'), 'utf8');
}

/**
 * Parses the first sheet of an uploaded xlsx into objects keyed by header.
 * headerMap maps lower-cased header text -> object key (e.g. { 'full name': 'fullName' }).
 */
export async function parseWorkbook(buffer, headerMap = {}, { maxRows = 10000 } = {}) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest('Invalid Excel file. Please upload a valid .xlsx file');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw ApiError.badRequest('Excel file has no sheets');
  if (ws.rowCount - 1 > maxRows) throw ApiError.badRequest(`Excel file exceeds the maximum of ${maxRows} rows`);

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const text = String(cell.text || '')
      .trim()
      .toLowerCase();
    headers[col] = headerMap[text] || text.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
  });

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = { __row: rowNumber };
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      const v = cell.value;
      obj[key] = v && typeof v === 'object' && 'text' in v ? v.text : v instanceof Date ? v : cell.text?.trim();
    });
    rows.push(obj);
  });
  return rows;
}

export function sendFile(res, buffer, filename, type = 'xlsx') {
  const mime =
    type === 'csv' ? 'text/csv; charset=utf-8' : type === 'zip' ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send(Buffer.from(buffer));
}

/** Exports rows as xlsx (default) or csv depending on ?format= */
export async function exportRows(res, { format = 'xlsx', filename, sheet = 'Data', columns, rows }) {
  if (format === 'csv') return sendFile(res, buildCsv(columns, rows), `${filename}.csv`, 'csv');
  return sendFile(res, await buildWorkbook(sheet, columns, rows), `${filename}.xlsx`);
}
