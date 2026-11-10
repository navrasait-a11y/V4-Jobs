/**
 * "Who viewed your profile": recording, 24 h dedupe, private mode, free vs paid visibility
 * (locked rows must not leak the company), and the notification wording. In-memory MongoDB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let svc;
let models;
const ctx = {};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: `${mongo.getUri()}freejobwala_profile_views`,
    JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
    ENCRYPTION_KEY: 'c'.repeat(64),
    REDIS_URL: '',
    STORAGE_DRIVER: 'local',
    EMAIL_PROVIDER: 'console',
    SMS_PROVIDER: 'console',
  });
  mongoose = (await import('mongoose')).default;
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();
  svc = await import('../src/modules/candidates/profileViews.service.js');
  models = {
    User: (await import('../src/modules/users/user.model.js')).default,
    Organization: (await import('../src/modules/employers/organization.model.js')).default,
    Candidate: (await import('../src/modules/candidates/candidate.model.js')).default,
    ...(await import('../src/modules/engagement/engagement.models.js')),
    ...(await import('../src/modules/billing/billing.models.js')),
    Notification: (await import('../src/modules/notifications/notification.model.js')).Notification,
  };

  const { User, Organization, Candidate } = models;
  ctx.candidate = await User.create({ role: 'candidate', fullName: 'Asha Rao', email: 'asha@pv.test', mobile: '9811100001', status: 'active' });
  await Candidate.create({ user: ctx.candidate._id });
  ctx.recruiters = [];
  for (let i = 0; i < 5; i += 1) {
    const owner = await User.create({ role: 'employer', fullName: `Recruiter ${i}`, email: `r${i}@pv.test`, mobile: `98222000${10 + i}`, status: 'active' });
    const org = await Organization.create({ uid: `PV-${i}`, type: i === 4 ? 'consultancy' : 'company', name: `Secret Corp ${i}`, slug: `secret-corp-${i}`, owner: owner._id, status: 'active', industries: ['IT Services'], offices: [{ city: 'Pune', isPrimary: true }] });
    owner.employer = { organization: org._id, isOwner: true, designation: 'Talent Lead' };
    await owner.save();
    ctx.recruiters.push(owner);
  }
});

after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const view = (member, source = 'search') => svc.recordProfileView({ candidateId: ctx.candidate._id, member, source });

test('a view is logged once per recruiter per 24 hours and counted on the profile', async () => {
  assert.equal(await view(ctx.recruiters[0]), true);
  assert.equal(await view(ctx.recruiters[0]), false, 'same recruiter again today is not a new view');
  for (const r of ctx.recruiters.slice(1)) assert.equal(await view(r, 'application'), true);
  const profile = await models.Candidate.findOne({ user: ctx.candidate._id }).lean();
  assert.equal(profile.stats.profileViews, 5);
});

test('free account: 3 newest viewers by name, the rest locked without any company data', async () => {
  const out = await svc.listProfileViews(ctx.candidate._id, { days: 30 });
  assert.equal(out.access.premium, false);
  assert.equal(out.summary.total, 5);
  assert.equal(out.summary.locked, 2);
  const open = out.viewers.filter((v) => !v.locked);
  const locked = out.viewers.filter((v) => v.locked);
  assert.equal(open.length, 3);
  assert.equal(locked.length, 2);
  for (const v of open) assert.equal(v.recruiter, null, 'recruiter names are a paid detail');
  const leaked = JSON.stringify(locked);
  for (let i = 0; i < 5; i += 1) assert.ok(!leaked.includes(`Secret Corp ${i}`) && !leaked.includes(`secret-corp-${i}`), 'locked rows never carry the company');
  assert.ok(locked.every((v) => !v.organization && v.hint.industry === 'IT Services'));
  assert.equal(out.summary.byType.consultancy, 1);
  assert.ok(out.access.maxDays <= 90);
});

test('the notification never names the company for a free account', async () => {
  const n = await models.Notification.find({ user: ctx.candidate._id, type: 'profile_viewed' }).lean();
  assert.ok(n.length >= 1);
  assert.ok(n.every((x) => !/Secret Corp/.test(x.title)), n.map((x) => x.title).join(' | '));
});

test('paid plan (Profile Booster): every viewer with recruiter name and 12 months', async () => {
  const { Subscription } = models;
  await Subscription.create({ user: ctx.candidate._id, plan: new mongoose.Types.ObjectId(), planSnapshot: { code: 'candidate_booster_30', name: 'Profile Booster', tier: 'booster', audience: 'candidate', features: { profileBoost: true } }, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000), status: 'active' });
  const out = await svc.listProfileViews(ctx.candidate._id, { days: 365 });
  assert.equal(out.access.premium, true);
  assert.equal(out.access.days, 365);
  assert.equal(out.summary.locked, 0);
  assert.ok(out.viewers.every((v) => !v.locked && v.organization?.name && v.recruiter?.name));
  const consult = await svc.listProfileViews(ctx.candidate._id, { days: 30, type: 'consultancy' });
  assert.deepEqual(
    consult.viewers.map((v) => v.organization.name),
    ['Secret Corp 4'],
  );
});

test('private mode hides the recruiter even from paid accounts', async () => {
  const { ProfileAccess, User } = models;
  const r = ctx.recruiters[2];
  await ProfileAccess.deleteMany({ member: r._id });
  await User.updateOne({ _id: r._id }, { 'employer.privateBrowsing': true });
  const fresh = await User.findById(r._id);
  assert.equal(await view(fresh), true);
  const out = await svc.listProfileViews(ctx.candidate._id, { days: 30 });
  const anon = out.viewers.find((v) => v.anonymous);
  assert.ok(anon, 'private view listed as anonymous');
  assert.equal(anon.organization, undefined);
  assert.equal(anon.recruiter, undefined);
  assert.ok(!JSON.stringify(anon).includes('Secret Corp 2'));
});

test('free limit counts only named viewers, so the locked count matches the list', async () => {
  const { Subscription } = models;
  await Subscription.updateMany({ user: ctx.candidate._id }, { status: 'cancelled' });
  const out = await svc.listProfileViews(ctx.candidate._id, { days: 30 });
  const open = out.viewers.filter((v) => !v.locked && !v.anonymous);
  const locked = out.viewers.filter((v) => v.locked);
  assert.equal(open.length, 3);
  assert.equal(locked.length, out.summary.locked);
});
