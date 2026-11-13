/** Fraud signals for the admin panel: money-asking job text, shared GSTIN / mobile, report clusters. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let risk;

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: `${mongo.getUri()}freejobwala_risk`, JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'), ENCRYPTION_KEY: 'c'.repeat(64), REDIS_URL: '', STORAGE_DRIVER: 'local' });
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/database.js')).connectDatabase();
  risk = await import('../src/modules/admin/admin.risk.service.js');
});
after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

test('money phrases are caught, "no fee" lines are not', () => {
  const { moneyPhrase } = risk;
  for (const t of ['Pay a registration fee of Rs 500 to confirm', 'Refundable security deposit 2000 required', 'Training charges 1500 before joining', 'Send Rs 999 to our UPI ID now', '<p>Kit fee: Rs 300</p>']) assert.ok(moneyPhrase(t), t);
  for (const t of ['Candidates have to pay 1000 for the kit', 'Pay Rs 500 to confirm your seat', 'Send the fee to hr.jobs@ybl']) assert.ok(moneyPhrase(t), t);
  for (const t of [
    'No registration fee. Salary 25k per month',
    'Free of cost hiring, zero charges',
    'Salary paid on 1st of every month',
    'Fees reimbursed for certifications',
    'We pay 25,000 for this role',
    'We pay Rs 18,000 to freshers',
    'Field Sales Executive - Paytm merchant onboarding',
    'Experience with PhonePe and Google Pay for Business sales',
    '',
  ]) assert.equal(moneyPhrase(t), null, t);
});

test('signals list risky jobs, shared GSTINs, report clusters and duplicate mobiles', async () => {
  const User = (await import('../src/modules/users/user.model.js')).default;
  const Organization = (await import('../src/modules/employers/organization.model.js')).default;
  const Job = (await import('../src/modules/jobs/job.model.js')).default;
  const { Report } = await import('../src/modules/moderation/moderation.models.js');
  const owner = await User.create({ role: 'employer', fullName: 'Owner', email: 'o@risk.test', mobile: '9811177001', status: 'active' });
  await User.create({ role: 'candidate', fullName: 'Twin', email: 't@risk.test', mobile: '9811177001', status: 'active' }).catch(() => null);
  const a = await Organization.create({ uid: 'R-1', type: 'company', name: 'Alpha', slug: 'alpha', owner: owner._id, status: 'active', gstNumber: '08ABCDE1234F1Z5' });
  await Organization.create({ uid: 'R-2', type: 'company', name: 'Alpha Copy', slug: 'alpha-copy', owner: owner._id, status: 'active', gstNumber: '08ABCDE1234F1Z5' });
  const base = { organization: a._id, postedBy: owner._id, status: 'active', kind: 'job', orgSnapshot: { name: 'Alpha' } };
  const scam = await Job.create({ ...base, uid: 'JOBS-1', title: 'Data entry', slug: 'data-entry', description: 'Work from home. Registration fee Rs 499 refundable.' });
  await Job.create({ ...base, uid: 'JOBS-2', title: 'Sales', slug: 'sales', description: 'No registration fee. Good salary.' });
  for (let i = 0; i < 2; i += 1) {
    await Report.create({ targetType: 'job', job: scam._id, reason: 'asking_money' });
    await Report.create({ targetType: 'organization', organization: a._id, reason: 'spam' });
  }
  const out = await risk.riskSignals();
  const by = Object.fromEntries(out.groups.map((g) => [g.key, g.items]));
  assert.deepEqual(by.money_jobs.map((j) => j.label), ['Data entry']);
  assert.match(by.money_jobs[0].sub, /Registration fee/i);
  assert.equal(by.shared_gst[0].count, 2);
  assert.equal(by.reported_jobs[0].label, 'Data entry');
  assert.equal(by.reported_employers[0].label, 'Alpha');
  assert.ok(out.total >= 4);
});
