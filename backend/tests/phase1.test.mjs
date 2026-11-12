/**
 * Wallet top-up (credit once, refund reversal, limits), admin switches that used to do nothing
 * (maintenance mode, ads on/off, payment methods) and the "download my data" export.
 * In-memory MongoDB; Razorpay is never called.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let app;
let billing;
let settings;
let m;
const ctx = {};
const RZP_SECRET = 'rzp-test-secret';

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: `${mongo.getUri()}freejobwala_phase1`,
    JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
    ENCRYPTION_KEY: 'c'.repeat(64),
    REDIS_URL: '',
    STORAGE_DRIVER: 'local',
    EMAIL_PROVIDER: 'console',
    SMS_PROVIDER: 'console',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: RZP_SECRET,
  });
  mongoose = (await import('mongoose')).default;
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();
  app = (await import('../src/app.js')).createApp();
  billing = await import('../src/modules/billing/billing.service.js');
  settings = await import('../src/modules/settings/settings.service.js');
  m = {
    User: (await import('../src/modules/users/user.model.js')).default,
    Candidate: (await import('../src/modules/candidates/candidate.model.js')).default,
    ...(await import('../src/modules/billing/billing.models.js')),
    Ad: (await import('../src/modules/cms/cms.models.js')).Ad,
  };
  ctx.user = await m.User.create({ role: 'candidate', fullName: 'Tina Roy', email: 'tina@p1.test', mobile: '9811100077', password: 'Secret#12345', status: 'active' });
  await m.Candidate.create({ user: ctx.user._id, resume: { key: 'private/resumes/tina.pdf', name: 'tina.pdf' } });
});

after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const topupOrder = (amount, extra = {}) =>
  m.Order.create({ orderNumber: `T-${crypto.randomUUID()}`, kind: 'wallet_topup', buyer: ctx.user._id, planName: 'Wallet top-up', amount, total: amount, ...extra });
const balance = async () => (await m.Wallet.findOne({ ownerKey: `user:${ctx.user._id}` }).lean())?.balance || 0;

test('a top-up order needs no plan and credits the wallet exactly once', async () => {
  const order = await topupOrder(500);
  const [a, b] = await Promise.all([billing.fulfilOrder(order._id, { paymentId: 'pay_1' }), billing.fulfilOrder(order._id, { paymentId: 'pay_1' })]);
  assert.equal(a.status, 'paid');
  assert.equal(b.status, 'paid');
  assert.equal(await balance(), 500, 'webhook + client confirmation together must not credit twice');
  const txns = await m.WalletTransaction.find({ order: order._id }).lean();
  assert.equal(txns.length, 1);
  assert.equal(txns[0].reason, 'topup');
  assert.equal(await m.Subscription.countDocuments({ order: order._id }), 0, 'a top-up is not a plan purchase');
  assert.equal(await m.Invoice.countDocuments({ order: order._id }), 0, 'no tax invoice for a wallet deposit');
});

test('a plan order still requires a plan', async () => {
  await assert.rejects(() => m.Order.create({ orderNumber: 'P-1', buyer: ctx.user._id, amount: 10, total: 10 }), /plan/i);
});

test('client verification accepts only a correctly signed payment', async () => {
  const order = await topupOrder(200, { gatewayOrderId: 'order_abc' });
  const args = { orderId: order._id, razorpayOrderId: 'order_abc', razorpayPaymentId: 'pay_abc' };
  await assert.rejects(() => billing.verifyPayment(ctx.user, { ...args, razorpaySignature: 'f'.repeat(64) }), /verification failed/i);
  assert.equal(await balance(), 500);
  const good = crypto.createHmac('sha256', RZP_SECRET).update('order_abc|pay_abc').digest('hex');
  const paid = await billing.verifyPayment(ctx.user, { ...args, razorpaySignature: good });
  assert.equal(paid.status, 'paid');
  assert.equal(await balance(), 700);
  ctx.refundable = order._id;
});

test('refunding a top-up takes the money back out of the wallet, once', async () => {
  const first = await billing.markRefunded(ctx.refundable);
  assert.equal(first.status, 'refunded');
  await billing.markRefunded(ctx.refundable);
  assert.equal(await balance(), 500);
});

test('top-up amount limits and the on/off switch come from admin settings', async () => {
  await assert.rejects(() => billing.createWalletTopup(ctx.user, { amount: 5 }), (e) => e.code === 'TOPUP_AMOUNT_INVALID');
  await settings.setSetting('payments.walletTopup', { enabled: false, min: 100, max: 1000 });
  await assert.rejects(() => billing.createWalletTopup(ctx.user, { amount: 500 }), (e) => e.code === 'TOPUP_DISABLED');
  await settings.setSetting('payments.walletTopup', { enabled: true, min: 100, max: 1000 });
  await assert.rejects(() => billing.createWalletTopup(ctx.user, { amount: 5000 }), (e) => e.code === 'TOPUP_AMOUNT_INVALID');
});

test('when the gateway cannot take the payment the order is cancelled, not left open', async () => {
  await settings.setSetting('payments.methods', { razorpay: false });
  await assert.rejects(() => billing.createWalletTopup(ctx.user, { amount: 300 }), (e) => e.code === 'PAYMENTS_DISABLED');
  await settings.setSetting('payments.methods', { razorpay: true, upi: true, card: false, netbanking: false, wallet: false });
  await assert.rejects(() => billing.createWalletTopup(ctx.user, { amount: 300 }), (e) => e.code === 'PAYMENTS_DISABLED', 'no Razorpay key configured in this test');
  assert.equal(await m.Order.countDocuments({ kind: 'wallet_topup', status: 'created', amount: 300 }), 0);
  assert.equal(await m.Order.countDocuments({ kind: 'wallet_topup', status: 'cancelled', amount: 300 }), 2);
});

test('GST follows the buyer state: other state pays IGST, seller state pays CGST + SGST', async () => {
  const plan = await m.Plan.create({ code: 'boost-gst', name: 'Booster', audience: 'candidate', tier: 'booster', price: 1000, durationDays: 30 });
  const profile = await m.Candidate.findOne({ user: ctx.user._id });
  profile.currentLocation = { city: 'Bengaluru', state: 'Karnataka' };
  await profile.save();
  const inter = await billing.quote(ctx.user, { planId: plan._id });
  assert.deepEqual([inter.gst.igst, inter.gst.cgst, inter.stateCode], [180, 0, '29']);
  profile.currentLocation = { city: 'Jaipur', state: 'Rajasthan' };
  await profile.save();
  const intra = await billing.quote(ctx.user, { planId: plan._id });
  assert.deepEqual([intra.gst.igst, intra.gst.cgst, intra.gst.sgst], [0, 90, 90]);
  const typed = await billing.quote(ctx.user, { planId: plan._id, billing: { gstin: '27ABCDE1234F1Z5' } });
  assert.equal(typed.gst.igst, 180, 'a GSTIN typed at checkout wins');
});

test('checkout windows left unpaid for a day are closed', async () => {
  const old = await topupOrder(250, { gateway: 'razorpay', createdAt: new Date(Date.now() - 30 * 3600 * 1000) });
  const fresh = await topupOrder(260, { gateway: 'razorpay' });
  await billing.cancelStaleOrders();
  assert.equal((await m.Order.findById(old._id)).status, 'cancelled');
  assert.equal((await m.Order.findById(fresh._id)).status, 'created');
});

test('ads.enabled = false hides every ad', async () => {
  await m.Ad.create({ name: 'Top banner', type: 'banner', placement: 'home_top', platforms: ['web'], audience: 'all', image: { url: 'https://cdn.test/a.png' }, isActive: true });
  const on = await request(app).get('/api/v1/cms/ads').query({ placement: 'home_top' });
  assert.equal(on.body.data.length, 1);
  await settings.setSetting('ads.enabled', false);
  const off = await request(app).get('/api/v1/cms/ads').query({ placement: 'home_top' });
  assert.equal(off.status, 200);
  assert.deepEqual(off.body.data, []);
  await settings.setSetting('ads.enabled', true);
});

test('maintenance mode closes the API for visitors but leaves sign-in, public settings and admins working', async () => {
  await settings.setSetting('platform.maintenanceMode', true);
  const jobs = await request(app).get('/api/v1/jobs');
  assert.equal(jobs.status, 503);
  assert.equal(jobs.body.error.code, 'MAINTENANCE');
  assert.ok(jobs.headers['retry-after']);

  const pub = await request(app).get('/api/v1/settings/public');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data['platform.maintenanceMode'], true);

  const adminRoute = await request(app).get('/api/v1/admin/dashboard');
  assert.equal(adminRoute.status, 401, 'admin routes stay reachable and keep their own auth');

  const { signAccessToken } = await import('../src/modules/auth/token.service.js');
  const bearer = (user) => `Bearer ${signAccessToken(user, { _id: new mongoose.Types.ObjectId() })}`;
  const admin = await m.User.create({ role: 'super_admin', fullName: 'Root', email: 'root@p1.test', mobile: '9811100088', status: 'active' });
  const asAdmin = await request(app).get('/api/v1/jobs').set('Authorization', bearer(admin));
  assert.notEqual(asAdmin.status, 503, 'an admin can still browse the site during maintenance');
  const asCandidate = await request(app).get('/api/v1/jobs').set('Authorization', bearer(ctx.user));
  assert.equal(asCandidate.status, 503);

  await settings.setSetting('platform.maintenanceMode', false);
  const back = await request(app).get('/api/v1/jobs');
  assert.equal(back.status, 200);
});

test('admin settings are validated before they are saved, and masked secrets keep the stored value', async () => {
  const bad = (key, value) => assert.rejects(() => settings.saveSetting(key, value), (e) => e.statusCode === 422, `${key} should reject ${JSON.stringify(value)}`);
  await bad('payments.gstPercent', 'eighteen');
  await bad('payments.gstPercent', 40);
  await bad('platform.maintenanceMode', 'yes');
  await bad('payments.walletTopup', { enabled: true, min: 500, max: 100 });
  await bad('ai.matchWeights', { skills: 0.9, role: 0.9, location: 0, experience: 0, salary: 0, education: 0 });
  await bad('ads.adsenseClientId', 'pub-123');
  await bad('platform.supportEmail', 'not-an-email');
  await assert.rejects(() => settings.saveSetting('nope.key', 1), /unknown setting/i);

  await settings.saveSetting('payments.gstPercent', 12);
  assert.equal(await settings.getSetting('payments.gstPercent'), 12);
  await settings.saveSetting('payments.gstPercent', 18);

  await settings.saveSetting('integrations.arattai', { enabled: true, apiUrl: 'https://api.arattai.test/send', apiKey: 'secret-key-9876' });
  const [masked] = (await settings.listSettings({ group: 'integrations' })).filter((s) => s.key === 'integrations.arattai');
  assert.equal(masked.value.apiKey, '****9876');
  await settings.saveSetting('integrations.arattai', { ...masked.value, enabled: false });
  const stored = await settings.getSetting('integrations.arattai');
  assert.deepEqual([stored.enabled, stored.apiKey, stored.apiUrl], [false, 'secret-key-9876', 'https://api.arattai.test/send']);
});

test('data export holds the account and its records but no secrets or storage keys', async () => {
  const { exportMyData } = await import('../src/modules/users/dataExport.service.js');
  const data = await exportMyData(ctx.user._id);
  assert.equal(data.account.email, 'tina@p1.test');
  assert.equal(data.profile.resume.name, 'tina.pdf');
  assert.equal(data.wallet.balance, 500);
  assert.ok(data.orders.length >= 3);
  const json = JSON.stringify(data);
  for (const leak of ['password', 'private/resumes', 'tokenVersion', 'backupCodes']) assert.ok(!json.includes(leak), `export must not contain ${leak}`);
});
