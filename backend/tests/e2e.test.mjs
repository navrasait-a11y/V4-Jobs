/**
 * End-to-end smoke test of the main business flows against an in-memory MongoDB replica set.
 * Run: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let rs;
let request;
let mongoose;
const api = '/api/v1';
const ctx = {};

before(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: rs.getUri('freejobwala_test'),
    JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
    ENCRYPTION_KEY: 'b'.repeat(64),
    OTP_DEV_BYPASS: 'true',
    REDIS_URL: '',
    LOCAL_UPLOAD_DIR: 'tests/.uploads',
    EMAIL_PROVIDER: 'console',
    STORAGE_DRIVER: 'local',
    SMS_PROVIDER: 'console',
  });
  const supertest = (await import('supertest')).default;
  const { connectDatabase } = await import('../src/config/database.js');
  const { createApp } = await import('../src/app.js');
  await import('../src/jobs/handlers.js');
  mongoose = (await import('mongoose')).default;
  await connectDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  request = supertest(createApp());
});

after(async () => {
  await mongoose?.disconnect();
  await rs?.stop();
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const expectOk = (res, status = 200) => {
  if (res.status !== status) console.error(res.status, JSON.stringify(res.body, null, 2));
  assert.equal(res.status, status);
  return res.body;
};

test('health', async () => {
  expectOk(await request.get('/health'));
  expectOk(await request.get('/ready'));
});

test('public settings & enums', async () => {
  const s = expectOk(await request.get(`${api}/settings/public`));
  assert.ok('platform.profileDeleteEnabled' in s.data);
  expectOk(await request.get(`${api}/enums`));
});

test('validation errors are 422 with details', async () => {
  const res = await request.post(`${api}/auth/register/candidate`).send({ email: 'bad' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.length > 0);
});

test('candidate registration + login + refresh rotation', async () => {
  const body = expectOk(
    await request.post(`${api}/auth/register/candidate`).set('X-Client-Platform', 'android').send({
      experienceLevel: 'I have Experience',
      fullName: 'Ravi Kumar',
      gender: 'Male',
      email: 'ravi@example.com',
      password: 'Secret123',
      mobile: '9876543210',
      heardFrom: 'Google Search',
      acceptTerms: true,
      consentCommunication: true,
      deviceId: 'device-1',
    }),
    201,
  );
  assert.ok(body.data.tokens.accessToken);
  assert.equal(body.data.user.uid, undefined, 'uid must be hidden from users');
  ctx.candidateToken = body.data.tokens.accessToken;
  ctx.candidateId = body.data.user._id;

  expectOk(await request.post(`${api}/auth/mobile/verify`).set(auth(ctx.candidateToken)).send({ otp: '123456' }));
  const login = expectOk(await request.post(`${api}/auth/login`).send({ identifier: 'ravi@example.com', password: 'Secret123' }));
  const refreshed = expectOk(await request.post(`${api}/auth/refresh`).send({ refreshToken: login.data.tokens.refreshToken }));
  assert.ok(refreshed.data.tokens.refreshToken !== login.data.tokens.refreshToken);
  // reuse of the old refresh token must fail
  const reuse = await request.post(`${api}/auth/refresh`).send({ refreshToken: login.data.tokens.refreshToken });
  assert.equal(reuse.status, 401);

  const wrong = await request.post(`${api}/auth/login`).send({ identifier: 'ravi@example.com', password: 'Wrong1234' });
  assert.equal(wrong.status, 401);
});

test('candidate profile update + employment', async () => {
  expectOk(
    await request
      .patch(`${api}/candidates/me`)
      .set(auth(ctx.candidateToken))
      .send({
        keySkills: ['Node.js', 'MongoDB', 'React'],
        currentLocation: { city: 'Jaipur', state: 'Rajasthan' },
        totalExperience: { years: 3, months: 2 },
        preferences: { locations: [{ city: 'Jaipur' }], expectedSalary: 60000, roles: ['Backend Developer'] },
        dob: '1996-05-10',
      }),
  );
  const emp = expectOk(
    await request
      .post(`${api}/candidates/me/employments`)
      .set(auth(ctx.candidateToken))
      .send({ jobTitle: 'Backend Developer', employerName: 'Acme', isCurrent: true, startDate: '2022-01-01', monthlySalary: 50000 }),
    201,
  );
  assert.ok(emp.data.completion.score > 0);
  const me = expectOk(await request.get(`${api}/candidates/me`).set(auth(ctx.candidateToken)));
  assert.equal(me.data.profile.currentJobTitle, 'Backend Developer');
  assert.equal(me.data.profile.totalExperienceMonths, 38);
});

test('employer registration (pending) + admin approval', async () => {
  const body = expectOk(
    await request.post(`${api}/auth/register/employer`).send({
      employerType: 'company',
      organizationName: 'Tech Corp',
      fullName: 'Anita Sharma',
      email: 'hr@techcorp.com',
      password: 'Secret123',
      mobile: '9876500001',
      declarations: { authorized: true, noCandidateFee: true },
      acceptTerms: true,
    }),
    201,
  );
  assert.equal(body.data.organizationStatus, 'pending');
  ctx.employerToken = body.data.tokens.accessToken;
  ctx.orgId = body.data.organization._id;

  // create super admin directly
  const User = mongoose.model('User');
  await User.create({ role: 'super_admin', fullName: 'Admin', email: 'admin@fjw.com', password: 'Admin1234', status: 'active', emailVerifiedAt: new Date() });
  const login = expectOk(await request.post(`${api}/auth/login`).send({ identifier: 'admin@fjw.com', password: 'Admin1234', role: 'admin' }));
  ctx.adminToken = login.data.tokens.accessToken;

  expectOk(
    await request
      .post(`${api}/admin/employers/bulk`)
      .set(auth(ctx.adminToken))
      .send({ ids: [ctx.orgId], action: 'approve' }),
  );
  const stats = expectOk(await request.get(`${api}/admin/stats/employers`).set(auth(ctx.adminToken)));
  assert.equal(stats.data.companies.active, 1);
});

test('admin plans + assign package', async () => {
  const plan = expectOk(
    await request
      .post(`${api}/admin/billing/plans`)
      .set(auth(ctx.adminToken))
      .send({
        code: 'emp_pro',
        name: 'Professional',
        audience: 'employer',
        tier: 'professional',
        price: 4999,
        durationDays: 30,
        credits: { job_post: 10, resume_view: 50, invite: 100, resume_download: 50 },
        features: { resumeDbAccess: true },
      }),
    201,
  );
  expectOk(await request.post(`${api}/admin/billing/assign-plan`).set(auth(ctx.adminToken)).send({ planId: plan.data._id, organizationId: ctx.orgId }), 201);
  const subs = expectOk(await request.get(`${api}/billing/subscriptions`).set(auth(ctx.employerToken)));
  assert.equal(subs.data.credits.job_post, 10);
  const plans = expectOk(await request.get(`${api}/billing/plans?audience=employer`));
  assert.equal(plans.data.length, 1);
});

test('employer posts job, public search finds it', async () => {
  const job = expectOk(
    await request
      .post(`${api}/employer/jobs`)
      .set(auth(ctx.employerToken))
      .send({
        title: 'Senior Node.js Developer',
        description: 'Build scalable APIs with Node.js and MongoDB for our job portal.',
        keySkills: ['Node.js', 'MongoDB', 'Express'],
        roles: ['Backend Developer'],
        locations: [{ city: 'Jaipur', state: 'Rajasthan' }],
        experience: { min: 2, max: 6 },
        salary: { min: 50000, max: 90000, period: 'monthly' },
        jobModes: ['Work From Office'],
        employmentTypes: ['Full Time, Permanent'],
        questions: [{ question: 'Are you okay with Jaipur?', type: 'yes_no', required: true }],
        publish: true,
      }),
    201,
  );
  assert.equal(job.data.status, 'active');
  ctx.jobId = job.data._id;
  ctx.jobSlug = job.data.slug;

  const search = expectOk(await request.get(`${api}/jobs?q=node&location=Jaipur&experience=3`));
  assert.equal(search.meta.total, 1);
  assert.equal(search.data[0].uid, undefined, 'job uid hidden publicly');
  const facets = expectOk(await request.get(`${api}/jobs/facets?location=Jaipur`));
  assert.ok(facets.data.location.length);
  const detail = expectOk(await request.get(`${api}/jobs/${ctx.jobSlug}`).set(auth(ctx.candidateToken)));
  assert.ok(detail.data.match.score > 0);
  expectOk(await request.get(`${api}/jobs/${ctx.jobId}/google-jobs`));
  const subs = expectOk(await request.get(`${api}/billing/subscriptions`).set(auth(ctx.employerToken)));
  assert.equal(subs.data.credits.job_post, 9, 'one job credit consumed');
});

test('candidate applies, employer manages ATS', async () => {
  const missing = await request.post(`${api}/jobs/${ctx.jobId}/apply`).set(auth(ctx.candidateToken)).send({});
  assert.equal(missing.status, 400, 'required screening question');
  const app = expectOk(
    await request
      .post(`${api}/jobs/${ctx.jobId}/apply`)
      .set(auth(ctx.candidateToken))
      .send({ answers: [{ question: 'Are you okay with Jaipur?', answer: 'Yes' }] }),
    201,
  );
  ctx.applicationId = app.data._id;
  assert.ok(app.data.matchScore > 0);
  const dup = await request
    .post(`${api}/jobs/${ctx.jobId}/apply`)
    .set(auth(ctx.candidateToken))
    .send({ answers: [{ question: 'Are you okay with Jaipur?', answer: 'Yes' }] });
  assert.equal(dup.status, 409);

  const list = expectOk(await request.get(`${api}/employer/responses?job=${ctx.jobId}&view=new`).set(auth(ctx.employerToken)));
  assert.equal(list.meta.total, 1);
  expectOk(await request.get(`${api}/employer/responses/${ctx.applicationId}`).set(auth(ctx.employerToken)));
  const upd = expectOk(
    await request
      .patch(`${api}/employer/responses/${ctx.applicationId}`)
      .set(auth(ctx.employerToken))
      .send({ screeningStatus: 'shortlisted', callingStatus: 'call_done', comment: 'Good fit' }),
  );
  assert.equal(upd.data.stage, 'screened');
  const when = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  expectOk(
    await request
      .post(`${api}/employer/responses/${ctx.applicationId}/interviews`)
      .set(auth(ctx.employerToken))
      .send({ scheduledAt: when, mode: 'video', meetingLink: 'https://meet.example.com/x' }),
    201,
  );
  const mine = expectOk(await request.get(`${api}/applications`).set(auth(ctx.candidateToken)));
  assert.equal(mine.data[0].stage, 'interview_scheduled');
  const exp = await request.get(`${api}/employer/responses/export?job=${ctx.jobId}`).set(auth(ctx.employerToken));
  assert.equal(exp.status, 200);
  assert.match(exp.headers['content-type'], /spreadsheetml/);
  const funnel = expectOk(await request.get(`${api}/employer/responses/funnel/${ctx.jobId}`).set(auth(ctx.employerToken)));
  assert.equal(funnel.data.stages.interview_scheduled, 1);
});

test('resume search + unlock contact + folders + invites', async () => {
  const res = expectOk(
    await request
      .post(`${api}/employer/talent/search`)
      .set(auth(ctx.employerToken))
      .send({ skills: ['node.js'], locations: ['Jaipur'], experienceMin: 1 }),
  );
  assert.equal(res.meta.total, 1);
  assert.notEqual(res.data[0].email, 'ravi@example.com', 'masked before unlock');
  const kw = expectOk(
    await request
      .post(`${api}/employer/talent/search`)
      .set(auth(ctx.employerToken))
      .send({ keywords: ['MongoDB'] }),
  );
  assert.equal(kw.meta.total, 1);
  const unlocked = expectOk(await request.post(`${api}/employer/talent/candidates/${ctx.candidateId}/unlock`).set(auth(ctx.employerToken)));
  assert.equal(unlocked.data.email, 'ravi@example.com');
  const folder = expectOk(await request.post(`${api}/employer/talent/folders`).set(auth(ctx.employerToken)).send({ name: 'Backend pool' }), 201);
  expectOk(
    await request
      .post(`${api}/employer/talent/folders/${folder.data._id}/candidates`)
      .set(auth(ctx.employerToken))
      .send({ candidateIds: [ctx.candidateId] }),
  );
  const folders = expectOk(await request.get(`${api}/employer/talent/folders`).set(auth(ctx.employerToken)));
  assert.equal(folders.data.folders[0].count, 1);
  const inv = expectOk(
    await request
      .post(`${api}/employer/talent/jobs/${ctx.jobId}/invites`)
      .set(auth(ctx.employerToken))
      .send({ candidateIds: [ctx.candidateId] }),
  );
  assert.equal(inv.data.invited, 0, 'already applied candidates are excluded');
  const prefill = expectOk(await request.get(`${api}/employer/talent/search/from-job/${ctx.jobId}`).set(auth(ctx.employerToken)));
  assert.ok(prefill.data.skills.includes('Node.js'));
});

test('chat between employer and candidate', async () => {
  const conv = expectOk(
    await request.post(`${api}/chat/conversations`).set(auth(ctx.employerToken)).send({ candidateId: ctx.candidateId, message: 'Hi Ravi!' }),
    201,
  );
  const msgs = expectOk(await request.get(`${api}/chat/conversations/${conv.data._id}/messages`).set(auth(ctx.candidateToken)));
  assert.equal(msgs.data.length, 1);
  const unread = expectOk(await request.get(`${api}/chat/unread`).set(auth(ctx.candidateToken)));
  assert.equal(unread.data.unread, 1);
  expectOk(await request.post(`${api}/chat/support`).set(auth(ctx.candidateToken)).send({ message: 'Need help' }), 201);
  const adminConvs = expectOk(await request.get(`${api}/admin/chat/conversations?type=support`).set(auth(ctx.adminToken)));
  assert.equal(adminConvs.meta.total, 1);
});

test('job alerts + guest apply with auto account', async () => {
  expectOk(
    await request
      .post(`${api}/job-alerts`)
      .set(auth(ctx.candidateToken))
      .send({ name: 'Node jobs', criteria: { keySkills: ['Node.js'], locations: [{ city: 'Jaipur' }] }, frequency: 'daily' }),
    201,
  );
  const { processDueAlerts } = await import('../src/modules/alerts/alert.service.js');
  const r = await processDueAlerts();
  assert.equal(r.processed, 1);

  expectOk(await request.post(`${api}/jobs/${ctx.jobId}/guest-apply/otp`).send({ mobile: '9123456780' }));
  const guest = expectOk(
    await request
      .post(`${api}/jobs/${ctx.jobId}/guest-apply`)
      .field('otp', '123456')
      .field('fullName', 'Guest User')
      .field('mobile', '9123456780')
      .field('email', 'guest@example.com')
      .field('acceptTerms', 'true')
      .field('keySkills', JSON.stringify(['Node.js']))
      .field('answers', JSON.stringify([{ question: 'Are you okay with Jaipur?', answer: 'Yes' }])),
    201,
  );
  assert.equal(guest.data.isNewUser, true);
  assert.ok(guest.data.tokens.accessToken);
});

test('notifications, reports, comments, mailbox', async () => {
  const n = expectOk(await request.get(`${api}/notifications`).set(auth(ctx.candidateToken)));
  assert.ok(n.meta.total > 0);
  expectOk(
    await request
      .post(`${api}/moderation/reports`)
      .send({ targetType: 'job', targetId: ctx.jobId, reason: 'asking_money', details: 'asked fee', contact: { name: 'X', email: 'x@y.com' } }),
    201,
  );
  expectOk(
    await request
      .post(`${api}/moderation/comments`)
      .set(auth(ctx.candidateToken))
      .send({ targetType: 'organization', targetId: ctx.orgId, body: 'Great process', rating: 5 }),
    201,
  );
  const reports = expectOk(await request.get(`${api}/admin/moderation/reports`).set(auth(ctx.adminToken)));
  assert.equal(reports.meta.total, 1);
  expectOk(
    await request
      .post(`${api}/mailbox`)
      .set(auth(ctx.employerToken))
      .send({ to: [ctx.candidateId], subject: 'Interview', body: '<p>See you</p>' }),
    201,
  );
  const inbox = expectOk(await request.get(`${api}/mailbox?folder=inbox`).set(auth(ctx.candidateToken)));
  assert.equal(inbox.meta.total, 1);
});

test('admin dashboards + exports + impersonation', async () => {
  expectOk(await request.get(`${api}/admin/dashboard?timespan=30d`).set(auth(ctx.adminToken)));
  expectOk(await request.get(`${api}/admin/analytics`).set(auth(ctx.adminToken)));
  const logins = expectOk(await request.get(`${api}/admin/stats/logins?timespan=24h`).set(auth(ctx.adminToken)));
  assert.ok(logins.data.totalAttempts >= 3);
  expectOk(await request.get(`${api}/admin/stats/candidates`).set(auth(ctx.adminToken)));
  expectOk(await request.get(`${api}/admin/stats/jobs`).set(auth(ctx.adminToken)));
  const list = expectOk(await request.get(`${api}/admin/candidates?q=ravi@example.com`).set(auth(ctx.adminToken)));
  assert.equal(list.meta.total, 1);
  assert.match(list.data[0].uid, /^CAND-\d{14}$/);
  const csv = await request.get(`${api}/admin/candidates/export?format=csv`).set(auth(ctx.adminToken));
  assert.equal(csv.status, 200);
  const imp = expectOk(await request.post(`${api}/admin/users/${ctx.candidateId}/impersonate`).set(auth(ctx.adminToken)));
  const meAs = expectOk(await request.get(`${api}/auth/me`).set(auth(imp.data.tokens.accessToken)));
  assert.ok(meAs.data.impersonatedBy);
  expectOk(await request.get(`${api}/analytics/employer`).set(auth(ctx.employerToken)));
  expectOk(await request.get(`${api}/analytics/candidate`).set(auth(ctx.candidateToken)));
  expectOk(await request.get(`${api}/admin/audit-logs`).set(auth(ctx.adminToken)));
});

test('master data + RBAC enforcement', async () => {
  expectOk(await request.post(`${api}/admin/master-data/key_skill`).set(auth(ctx.adminToken)).send({ name: 'Node.js' }), 201);
  const s = expectOk(await request.get(`${api}/master-data/key_skill?q=no`));
  assert.equal(s.data.length, 1);
  const forbidden = await request.get(`${api}/admin/dashboard`).set(auth(ctx.candidateToken));
  assert.equal(forbidden.status, 403);
  const noAuth = await request.get(`${api}/candidates/me`);
  assert.equal(noAuth.status, 401);
  const cross = await request.get(`${api}/employer/jobs`).set(auth(ctx.candidateToken));
  assert.equal(cross.status, 403);
});

test('resume upload (magic-byte checked) + fake file rejected', async () => {
  const pdf = Buffer.from(['%PDF-1.4', '1 0 obj<<>>endobj', 'trailer<<>>', '%%EOF'].join('\n'));
  const up = expectOk(
    await request
      .post(`${api}/candidates/me/resume`)
      .set(auth(ctx.candidateToken))
      .attach('resume', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' }),
    201,
  );
  assert.ok(up.data.resume.downloadUrl);
  const fake = await request
    .post(`${api}/candidates/me/resume`)
    .set(auth(ctx.candidateToken))
    .attach('resume', Buffer.from('MZ-not-a-pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' });
  assert.equal(fake.status, 400);
  const dl = expectOk(await request.get(`${api}/employer/talent/candidates/${ctx.candidateId}/resume`).set(auth(ctx.employerToken)));
  const url = new URL(dl.data.url);
  const file = await request.get(url.pathname + url.search);
  assert.equal(file.status, 200);
});

test('employer team member with restricted permissions + quota', async () => {
  const m = expectOk(
    await request
      .post(`${api}/employer/organization/team`)
      .set(auth(ctx.employerToken))
      .send({
        fullName: 'Recruiter One',
        email: 'rec1@techcorp.com',
        password: 'Secret123',
        memberRole: 'recruiter',
        quotas: { resume_search: { daily: 1 } },
      }),
    201,
  );
  assert.equal(m.data.employer.memberRole, 'recruiter');
  const login = expectOk(await request.post(`${api}/auth/login`).send({ identifier: 'rec1@techcorp.com', password: 'Secret123' }));
  const t = login.data.tokens.accessToken;
  const team = await request.post(`${api}/employer/organization/team`).set(auth(t)).send({ fullName: 'X Y', email: 'x@techcorp.com' });
  assert.equal(team.status, 403, 'recruiter cannot manage team');
  expectOk(
    await request
      .post(`${api}/employer/talent/search`)
      .set(auth(t))
      .send({ skills: ['node.js'] }),
  );
  const second = await request
    .post(`${api}/employer/talent/search`)
    .set(auth(t))
    .send({ skills: ['node.js'] });
  assert.equal(second.status, 403, 'daily quota enforced');
  const usage = expectOk(await request.get(`${api}/employer/organization/usage`).set(auth(ctx.employerToken)));
  assert.ok(usage.data.organization.resume_search.daily >= 2);
});

test('own account update for employer users', async () => {
  const me = expectOk(
    await request
      .patch(`${api}/me`)
      .set(auth(ctx.employerToken))
      .send({ designation: 'Head of HR', hiringAuthority: 'Authorized to hire', department: ['Human Resources'] }),
  );
  assert.equal(me.data.employer.designation, 'Head of HR');
});

test('logout revokes session', async () => {
  expectOk(await request.post(`${api}/auth/logout`).set(auth(ctx.candidateToken)).send({}));
  const after = await request.get(`${api}/auth/me`).set(auth(ctx.candidateToken));
  assert.equal(after.status, 401);
});
