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

/** Header text -> lookup key: case, extra spaces and a trailing "*" (required marker) don't matter. */
export const normalizeHeader = (text) =>
  String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\*+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** RFC 4180 CSV reader (quoted fields, "" escapes, CRLF/LF). The delimiter is detected from the header line. */
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const isZip = (b) => b?.[0] === 0x50 && b?.[1] === 0x4b;
const isOle = (b) => b?.length >= 8 && b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
// buildCsv() prefixes formula-like text with ' so spreadsheets don't run it; undo that on the way back in.
const unescapeCell = (v) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

/**
 * Reads an uploaded .xlsx (first sheet) or .csv into objects keyed by header; row 1 is the header.
 * headerMap maps normalised header text -> object key (e.g. { 'full name': 'fullName' }); other
 * headers become camelCase keys. Every row carries its spreadsheet row number in `__row`.
 */
export async function parseWorkbook(buffer, headerMap = {}, { maxRows = 10000 } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) throw ApiError.badRequest('The file is empty');
  if (isOle(buf)) throw ApiError.badRequest('Old Excel 97-2003 (.xls) files are not supported. In Excel choose File > Save As > "Excel Workbook (.xlsx)" or "CSV UTF-8" and upload that file');
  const keyOf = (text) => {
    const h = normalizeHeader(text);
    return h ? headerMap[h] || h.replace(/[^a-z0-9]+(\w)?/g, (_, c) => (c ? c.toUpperCase() : '')) : undefined;
  };

  let header = [];
  let body = []; // [{ rowNumber, cells: [] }]
  if (isZip(buf)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch {
      throw ApiError.badRequest('This Excel file could not be read. Save it again as .xlsx (or CSV UTF-8) and retry');
    }
    const ws = wb.worksheets.find((w) => w.state !== 'hidden' && w.state !== 'veryHidden') || wb.worksheets[0];
    if (!ws) throw ApiError.badRequest('The Excel file has no sheets');
    if (ws.actualRowCount - 1 > maxRows) throw ApiError.badRequest(`The file has more than ${maxRows.toLocaleString('en-IN')} rows. Split it into smaller files`);
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col] = cell.text;
    });
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const v = cell.value;
        if (v instanceof Date) cells[col] = v;
        else if (v && typeof v === 'object' && 'richText' in v) cells[col] = v.richText.map((t) => t.text).join('').trim();
        else if (v && typeof v === 'object' && 'text' in v) cells[col] = String(v.text).trim(); // hyperlink
        else if (v && typeof v === 'object' && 'result' in v) cells[col] = String(v.result ?? '').trim(); // formula
        else cells[col] = String(cell.text ?? '').trim();
      });
      body.push({ rowNumber, cells });
    });
  } else {
    const text = buf.toString('utf8');
    if (text.includes('\u0000')) throw ApiError.badRequest('Unsupported file. Upload an .xlsx or .csv file');
    const rows = parseCsv(text);
    if (rows.length - 1 > maxRows) throw ApiError.badRequest(`The file has more than ${maxRows.toLocaleString('en-IN')} rows. Split it into smaller files`);
    header = rows[0] || [];
    body = rows.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells: cells.map((c) => unescapeCell(String(c).trim())) }));
  }

  const keys = header.map(keyOf);
  if (!keys.some(Boolean)) throw ApiError.badRequest('The first row must contain the column headings. Download the sample file to see them');
  const rows = [];
  for (const { rowNumber, cells } of body) {
    const obj = { __row: rowNumber };
    let filled = false;
    cells.forEach((v, col) => {
      const key = keys[col];
      if (!key || v === '' || v === undefined || v === null) return;
      if (obj[key] === undefined) obj[key] = v; // first matching column wins (e.g. "Name" and "Full Name")
      filled = true;
    });
    if (filled) rows.push(obj);
  }
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

/** A cell holding several values: "a, b, c" (or ";" / "|" / new lines when the values contain commas). */
export function cellList(v) {
  if (v === undefined || v === null || v === '') return [];
  const s = String(v);
  return s
    .split(/[;|\n]/.test(s) ? /[;|\n]/ : ',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Employment types contain a comma themselves ("Full Time, Permanent"), so a plain split would break them. */
export function employmentTypeList(v) {
  const s = String(v ?? '');
  if (/[;|\n]/.test(s)) return cellList(s);
  const out = [];
  for (const part of cellList(s)) {
    const last = out[out.length - 1];
    if (last && /^(full|part)\s*time$/i.test(last) && !/^(full|part)\s*time\b/i.test(part)) out[out.length - 1] = `${last}, ${part}`;
    else out.push(part);
  }
  return out;
}

/** A numeric cell; accepts "5,00,000", "₹ 25000" or "3.5". Empty -> undefined; anything else throws a row error. */
export function cellNumber(v, label) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s₹]|rs\.?|inr/gi, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number (got "${v}")`);
  return n;
}
