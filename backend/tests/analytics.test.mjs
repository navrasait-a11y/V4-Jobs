/**
 * Admin numbers must be real and honest: job views count people (not reloads, bots or the
 * employer's own team) and revenue counts plan sales (not wallet deposits). In-memory MongoDB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
const m = {};
const ctx = {};
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: `${mongo.getUri()}freejobwala_analytics`, JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'), ENCRYPTION_KEY: 'c'.repeat(64), REDIS_URL: '', STORAGE_DRIVER: 'local' });
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/database.js')).connectDatabase();
  m.User = (await import('../src/modules/users/user.model.js')).default;
  m.Organization = (await import('../src/modules/employers/organization.model.js')).default;
  m.Job = (await import('../src/modules/jobs/job.model.js')).default;
  Object.assign(m, await import('../src/modules/billing/billing.models.js'));
  m.jobs = await import('../src/modules/jobs/job.service.js');
  m.analytics = await import('../src/modules/analytics/analytics.service.js');
  await m.Job.init();
  await (await import('../src/modules/jobs/jobView.model.js')).JobView.init();

  ctx.owner = await m.User.create({ role: 'employer', fullName: 'Owner', email: 'o@an.test', mobile: '9811188001', status: 'active' });
  ctx.org = await m.Organization.create({ uid: 'A-1', type: 'company', name: 'Acme', slug: 'acme', owner: ctx.owner._id, status: 'active' });
  ctx.owner.employer = { organization: ctx.org._id, isOwner: true };
  await ctx.owner.save();
  ctx.candidate = await m.User.create({ role: 'candidate', fullName: 'Seeker', email: 's@an.test', mobile: '9811188002', status: 'active' });
  ctx.admin = await m.User.create({ role: 'super_admin', fullName: 'Root', email: 'r@an.test', status: 'active' });
  ctx.job = await m.Job.create({ uid: 'JOBS-A1', title: 'Analyst', slug: 'analyst', organization: ctx.org._id, postedBy: ctx.owner._id, status: 'active', kind: 'job', publishedAt: new Date() });
});
after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const views = async () => (await m.Job.findById(ctx.job._id).lean()).stats?.views || 0;

test('a job view is counted once per person per day; bots, the employer and admins are not counted', async () => {
  const { countJobView } = m.jobs;
  assert.equal(await countJobView(ctx.job, ctx.candidate, { ip: '1.1.1.1', userAgent: CHROME }), true);
  assert.equal(await countJobView(ctx.job, ctx.candidate, { ip: '1.1.1.1', userAgent: CHROME }), false, 'reload');
  assert.equal(await countJobView(ctx.job, null, { ip: '2.2.2.2', userAgent: CHROME }), true, 'a guest');
  assert.equal(await countJobView(ctx.job, null, { ip: '2.2.2.2', userAgent: CHROME }), false, 'same guest again');
  assert.equal(await countJobView(ctx.job, null, { ip: '3.3.3.3', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), false, 'crawler');
  assert.equal(await countJobView(ctx.job, null, { ip: '4.4.4.4', userAgent: 'WhatsApp/2.23' }), false, 'link preview');
  assert.equal(await countJobView(ctx.job, null, { ip: '5.5.5.5' }), false, 'no user agent');
  assert.equal(await countJobView(ctx.job, ctx.owner, { ip: '6.6.6.6', userAgent: CHROME }), false, 'own employer');
  assert.equal(await countJobView(ctx.job, ctx.admin, { ip: '7.7.7.7', userAgent: CHROME }), false, 'admin');
  assert.equal(await views(), 2);
});

test('revenue counts plan sales incl. the wallet part, and leaves wallet top-ups out', async () => {
  const plan = await m.Plan.create({ code: 'pro', name: 'Pro', audience: 'employer', tier: 'professional', price: 1000, durationDays: 30 });
  const base = { buyer: ctx.owner._id, organization: ctx.org._id, status: 'paid', paidAt: new Date() };
  await m.Order.create({ ...base, orderNumber: 'O-1', plan: plan._id, planName: 'Pro', amount: 1000, total: 1180 });
  await m.Order.create({ ...base, orderNumber: 'O-2', plan: plan._id, planName: 'Pro', amount: 1000, total: 680, walletUsed: 500 });
  await m.Order.create({ ...base, orderNumber: 'O-3', kind: 'wallet_topup', planName: 'Wallet top-up', amount: 500, total: 500 });
  await m.Order.create({ ...base, orderNumber: 'O-4', plan: plan._id, planName: 'Pro', amount: 1000, total: 1180, status: 'created' });

  const dash = await m.analytics.adminDashboard({ timespan: '7d' });
  assert.deepEqual([dash.revenue.revenue, dash.revenue.orders], [2360, 2]);
  const a = await m.analytics.adminAnalytics({ timespan: '7d' });
  assert.equal(a.revenue.total, 2360);
  assert.deepEqual(a.revenue.byPlan.map((p) => p._id), ['Pro'], 'top-ups are not a plan');
  assert.equal(a.conversion.employersPaid, 1);
  assert.equal(dash.demoData, null, 'no demo data in this database');
});

test('the dashboard says when demo records are still in the database', async () => {
  await mongoose.connection.db.collection('demo_manifest').insertOne({ ids: { User: [1, 2, 3], Organization: [1], Job: [1, 2], Application: [] } });
  const dash = await m.analytics.adminDashboard({ timespan: '7d' });
  assert.deepEqual(dash.demoData, { accounts: 3, employers: 1, jobs: 2, applications: 0 });
  await mongoose.connection.db.collection('demo_manifest').deleteMany({});
});
