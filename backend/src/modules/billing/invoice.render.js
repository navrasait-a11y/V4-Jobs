import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

/** GST tax invoice output: HTML for the in-app preview and print, PDF for download. */
const LOGO = fs.readFileSync(fileURLToPath(new URL('../../shared/assets/freejobwala-logo.png', import.meta.url)));
const BLUE = '#0b5fa5';
const ORANGE = '#f28c1e';
const INK = '#101828';
const MUTED = '#667085';
const LINE = '#e4e7ec';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]} ${ONES[rest % 10]}`.trim();
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', tail].filter(Boolean).join(' ');
}

function wholeInWords(n) {
  if (!n) return 'Zero';
  const parts = [];
  for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
    const count = Math.floor(n / size);
    if (count) parts.push(`${size === 10000000 ? wholeInWords(count) : belowThousand(count)} ${label}`);
    n %= size;
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

export function amountInWords(amount) {
  const paise = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Rupees ${wholeInWords(rupees)}${rest ? ` and ${belowThousand(rest)} Paise` : ''} Only`;
}

const lines = (...values) => values.map((v) => String(v ?? '').trim()).filter(Boolean);
const place = (b) => lines(b?.city, b?.state, b?.pincode).join(', ');

function view(inv) {
  const { seller = {}, billing = {} } = inv;
  const rate = (tax) => (inv.taxable ? `${Math.round((tax / inv.taxable) * 10000) / 100}%` : '');
  const taxes = inv.igst ? [[`IGST (${rate(inv.igst)})`, inv.igst]] : [[`CGST (${rate(inv.cgst)})`, inv.cgst], [`SGST (${rate(inv.sgst)})`, inv.sgst]];
  const totals = [
    ['Subtotal', inv.subtotal],
    ...(inv.discount ? [['Discount', -inv.discount]] : []),
    ['Taxable value', inv.taxable],
    ...taxes,
  ];
  return {
    number: inv.number,
    date: dateOf(inv.issuedAt),
    seller: { name: seller.name, details: lines(seller.address, seller.gstin && `GSTIN: ${seller.gstin}`, seller.stateCode && `State code: ${seller.stateCode}`) },
    buyer: { name: billing.name, details: lines(billing.address, place(billing), billing.gstin && `GSTIN: ${billing.gstin}`, billing.email, billing.phone) },
    items: inv.lines || [],
    totals,
    total: inv.total,
    walletUsed: inv.walletUsed,
    words: amountInWords(inv.total),
  };
}

const NOTE = 'Tax is not payable on reverse charge. This is a computer generated invoice and needs no signature.';

export function renderInvoiceHtml(inv) {
  const v = view(inv);
  const party = (label, p) => `<div class="party"><h3>${label}</h3><strong>${esc(p.name) || '&mdash;'}</strong>${p.details.map((d) => `<p>${esc(d)}</p>`).join('')}</div>`;
  const items = v.items
    .map((l, i) => `<tr><td>${i + 1}</td><td class="desc">${esc(l.description)}</td><td>${esc(l.sac)}</td><td class="r">${l.quantity}</td><td class="r">₹${money(l.rate)}</td><td class="r">₹${money(l.amount)}</td></tr>`)
    .join('');
  const totals = v.totals
    .map(([label, n]) => `<tr><td>${esc(label)}</td><td class="r">${n < 0 ? '- ' : ''}₹${money(Math.abs(n))}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice ${esc(v.number)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#fff;color:${INK};font:14px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:794px;margin:0 auto;padding:36px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;border-bottom:3px solid ${BLUE}}
header img{height:38px;width:auto;max-width:100%}
.title{text-align:right}
h1{margin:0;font-size:22px;letter-spacing:.04em;color:${BLUE}}
.title p{margin:4px 0 0;font-size:13px;color:${MUTED}}
.title b{color:${INK}}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
.party{min-width:0;padding:14px 16px;border:1px solid ${LINE};border-radius:8px;overflow-wrap:anywhere}
.party h3{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}}
.party p{margin:2px 0 0;font-size:13px;color:#475467}
.scroll{overflow-x:auto;margin-top:24px}
table{width:100%;border-collapse:collapse}
.items{min-width:520px}
.items th{padding:10px 12px;background:${BLUE};color:#fff;font-size:12px;font-weight:600;text-align:left}
.items td{padding:12px;border-bottom:1px solid ${LINE};font-size:13px;vertical-align:top}
.items .desc{font-weight:600}
.r,.items th.r{text-align:right;white-space:nowrap}
.summary{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:20px}
.words{flex:1;min-width:0;font-size:13px;color:#475467}
.words b{display:block;margin-bottom:2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}}
.totals{width:300px;flex:none}
.totals td{padding:7px 12px;font-size:13px}
.totals .grand td{padding:11px 12px;background:#fff4e8;border-top:2px solid ${ORANGE};font-size:15px;font-weight:700}
footer{margin-top:32px;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}}
@media (max-width:600px){.page{padding:20px 16px}header{flex-direction:column;gap:12px}.title{text-align:left}.parties{grid-template-columns:1fr}.summary{flex-direction:column-reverse}.totals{width:100%}}
@media print{@page{size:A4;margin:12mm}.page{max-width:none;padding:0}}
</style></head><body><div class="page">
<header><img src="data:image/png;base64,${LOGO.toString('base64')}" alt="Freejobwala"><div class="title"><h1>TAX INVOICE</h1><p>Invoice no: <b>${esc(v.number)}</b></p><p>Date: <b>${esc(v.date)}</b></p></div></header>
<section class="parties">${party('Sold by', v.seller)}${party('Billed to', v.buyer)}</section>
<div class="scroll"><table class="items"><thead><tr><th>#</th><th>Description</th><th>SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${items}</tbody></table></div>
<section class="summary"><div class="words"><b>Amount in words</b>${esc(v.words)}</div><table class="totals">${totals}<tr class="grand"><td>Total</td><td class="r">₹${money(v.total)}</td></tr>${v.walletUsed ? `<tr><td>Paid from wallet</td><td class="r">₹${money(v.walletUsed)}</td></tr>` : ''}</table></section>
<footer>${esc(NOTE)}</footer>
</div></body></html>`;
}

/** The built-in PDF font has no ₹ or Indian scripts, so amounts use "Rs." and other scripts become "?". */
const pdfText = (s) => String(s ?? '').replace(/[^\x20-\xFF]+/g, '?');
const rs = (n) => `Rs. ${money(n)}`;

export function renderInvoicePdf(inv) {
  const v = view(inv);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${v.number}`, Author: 'Freejobwala' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40;
    const width = doc.page.width - 80;
    const right = left + width;

    doc.image(LOGO, left, 40, { height: 34 });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(BLUE).text('TAX INVOICE', left, 40, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`Invoice no: ${pdfText(v.number)}`, left, 66, { width, align: 'right' });
    doc.text(`Date: ${v.date}`, { width, align: 'right' });
    doc.moveTo(left, 96).lineTo(right, 96).lineWidth(2).strokeColor(BLUE).stroke();

    const boxWidth = (width - 14) / 2;
    const party = (x, label, p) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x + 12, 122, { width: boxWidth - 24, characterSpacing: 0.6 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(pdfText(p.name) || '-', x + 12, doc.y + 4, { width: boxWidth - 24 });
      doc.font('Helvetica').fontSize(9.5).fillColor('#475467');
      p.details.forEach((d) => doc.text(pdfText(d), x + 12, doc.y + 2, { width: boxWidth - 24 }));
      return doc.y;
    };
    const boxBottom = Math.max(party(left, 'Sold by', v.seller), party(left + boxWidth + 14, 'Billed to', v.buyer), 170) + 12;
    for (const x of [left, left + boxWidth + 14]) doc.roundedRect(x, 110, boxWidth, boxBottom - 110, 6).lineWidth(0.75).strokeColor(LINE).stroke();

    const cols = [
      ['#', left, 24, 'left'],
      ['Description', left + 24, 225, 'left'],
      ['SAC', left + 249, 55, 'left'],
      ['Qty', left + 304, 30, 'right'],
      ['Rate', left + 334, 90, 'right'],
      ['Amount', left + 424, width - 424, 'right'],
    ];
    const cells = (row, y, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
      cols.forEach(([, x, w, align], i) => doc.text(pdfText(row[i]), x + 6, y, { width: w - 12, align, lineBreak: true }));
    };
    let y = boxBottom + 22;
    doc.rect(left, y, width, 24).fill(BLUE);
    doc.fillColor('#ffffff');
    cells(cols.map(([label]) => label), y + 8, true);
    y += 24;
    v.items.forEach((l, i) => {
      doc.fillColor(INK);
      const rowHeight = Math.max(30, doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(pdfText(l.description), { width: 213 }) + 18);
      cells([i + 1, l.description, l.sac, l.quantity, rs(l.rate), rs(l.amount)], y + 9);
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(LINE).stroke();
    });

    y += 16;
    const summaryTop = y;
    const totalsX = right - 230;
    const row = (label, value, opts = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11.5 : 9.5).fillColor(INK);
      doc.text(pdfText(label), totalsX + 10, y + 6, { width: 110 });
      doc.text(value, totalsX + 110, y + 6, { width: 110, align: 'right' });
      y += opts.bold ? 30 : 22;
    };
    v.totals.forEach(([label, n]) => row(label, `${n < 0 ? '- ' : ''}${rs(Math.abs(n))}`));
    doc.rect(totalsX, y, 230, 28).fill('#fff4e8');
    doc.rect(totalsX, y, 230, 2).fill(ORANGE);
    y += 2;
    row('Total', rs(v.total), { bold: true });
    if (v.walletUsed) row('Paid from wallet', rs(v.walletUsed));

    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('AMOUNT IN WORDS', left, summaryTop + 6, { width: 260, characterSpacing: 0.6 });
    doc.font('Helvetica').fontSize(10).fillColor('#475467').text(v.words, left, doc.y + 4, { width: 260 });

    const foot = Math.max(y, doc.y) + 24;
    doc.moveTo(left, foot).lineTo(right, foot).lineWidth(0.75).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(NOTE, left, foot + 10, { width });
    doc.end();
  });
}
