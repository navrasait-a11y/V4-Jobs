import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let render;
const invoice = {
  number: 'INV-31102026000002',
  issuedAt: new Date('2026-10-31T10:00:00Z'),
  seller: { name: 'Freejobwala', gstin: '08ABCDE1234F1Z5', address: 'Jaipur, Rajasthan', stateCode: '08' },
  billing: { name: 'Riya <b>Sharma</b>', city: 'Jaipur', state: 'Rajasthan', email: 'riya@example.com', phone: '9000000001' },
  lines: [{ description: 'Profile Booster (30 days)', sac: '998365', quantity: 1, rate: 299, amount: 299 }],
  subtotal: 299,
  discount: 0,
  taxable: 299,
  cgst: 26.91,
  sgst: 26.91,
  total: 352.82,
};

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', STORAGE_DRIVER: 'local', MONGODB_URI: 'mongodb://127.0.0.1:1/x', JWT_ACCESS_SECRET: 'x'.repeat(48), ENCRYPTION_KEY: 'b'.repeat(64) });
  render = await import('../src/modules/billing/invoice.render.js');
});

test('amount in words uses Indian numbering and paise', () => {
  assert.equal(render.amountInWords(352.82), 'Rupees Three Hundred Fifty Two and Eighty Two Paise Only');
  assert.equal(render.amountInWords(1250000), 'Rupees Twelve Lakh Fifty Thousand Only');
  assert.equal(render.amountInWords(29), 'Rupees Twenty Nine Only');
  assert.equal(render.amountInWords(0), 'Rupees Zero Only');
});

test('HTML invoice shows tax split, hides empty rows and escapes buyer data', () => {
  const html = render.renderInvoiceHtml(invoice);
  assert.match(html, /CGST \(9%\)/);
  assert.match(html, /SGST \(9%\)/);
  assert.match(html, /₹352\.82/);
  assert.ok(!html.includes('Discount'), 'zero discount is hidden');
  assert.ok(!html.includes('<b>Sharma</b>'));
  assert.ok(html.includes('&lt;b&gt;Sharma'));
  assert.match(render.renderInvoiceHtml({ ...invoice, igst: 53.82, cgst: 0, sgst: 0 }), /IGST \(18%\)/);
});

test('PDF invoice is a real one-page PDF, even with a Hindi name', async () => {
  const pdf = await render.renderInvoicePdf({ ...invoice, billing: { ...invoice.billing, name: 'रिया शर्मा' }, discount: 10, walletUsed: 50 });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
});
