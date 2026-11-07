/**
 * "Other Forms" Excel (20-Oct-2026): job post fields, job / company / candidate search filters,
 * Call Now / Request Call Back, OTP on the no-login job post, screening answer types.
 * In-memory MongoDB. Run: npm test
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
    MONGODB_URI: rs.getUri('freejobwala_other_forms'),
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

  const { Location } = await import('../src/modules/masterdata/masterdata.models.js');
  const loc = (city, state, lat, lng) => ({ city, state, country: 'India', displayName: `${city}, ${state}`, searchKey: city.toLowerCase(), geo: { lat, lng } });
  await Location.insertMany([loc('Noida', 'Uttar Pradesh', 28.5355, 77.391), loc('Ghaziabad', 'Uttar Pradesh', 28.6692, 77.4538), loc('Jaipur', 'Rajasthan', 26.9124, 75.7873)]);
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

test('setup: approved employer with credits, candidate with Excel profile fields', async () => {
  const emp = expectOk(
    await request.post(`${api}/auth/register/employer`).send({
      employerType: 'company',
      organizationName: 'Tata Motors',
      fullName: 'Hiring Manager',
      email: 'hr@tatamotors.test',
      password: 'Secret123',
      mobile: '9876500011',
      declarations: { authorized: true, noCandidateFee: true },
      acceptTerms: true,
    }),
    201,
  );
  ctx.employerToken = emp.data.tokens.accessToken;
  ctx.orgId = emp.data.organization._id;
  const User = mongoose.model('User');
  await User.create({ role: 'super_admin', fullName: 'Admin', email: 'admin@fjw.test', password: 'Admin1234', status: 'active', emailVerifiedAt: new Date() });
  const admin = expectOk(await request.post(`${api}/auth/login`).send({ identifier: 'admin@fjw.test', password: 'Admin1234', role: 'admin' }));
  ctx.adminToken = admin.data.tokens.accessToken;
  expectOk(await request.post(`${api}/admin/employers/bulk`).set(auth(ctx.adminToken)).send({ ids: [ctx.orgId], action: 'approve' }));
  const plan = expectOk(
    await request
      .post(`${api}/admin/billing/plans`)
      .set(auth(ctx.adminToken))
      .send({ code: 'p1', name: 'Pro', audience: 'employer', tier: 'professional', price: 1, durationDays: 30, credits: { job_post: 10, resume_view: 10, invite: 10 }, features: { resumeDbAccess: true } }),
    201,
  );
  expectOk(await request.post(`${api}/admin/billing/assign-plan`).set(auth(ctx.adminToken)).send({ planId: plan.data._id, organizationId: ctx.orgId }), 201);
  await mongoose.model('Organization').updateOne({ _id: ctx.orgId }, { $set: { employeeCount: '1001-2000', employerType: 'Indian MNC' } });

  const cand = expectOk(
    await request.post(`${api}/auth/register/candidate`).send({
      experienceLevel: 'Experienced',
      fullName: 'Priya Singh',
      gender: 'Female',
      email: 'priya@example.test',
      password: 'Secret123',
      mobile: '9876543211',
      acceptTerms: true,
    }),
    201,
  );
  ctx.candidateToken = cand.data.tokens.accessToken;
  ctx.candidateId = cand.data.user._id;
  const me = expectOk(
    await request
      .patch(`${api}/candidates/me`)
      .set(auth(ctx.candidateToken))
      .send({
        keySkills: ['Welding', 'Forklift'],
        currentLocation: { city: 'Ghaziabad', state: 'Uttar Pradesh' },
        totalExperience: { years: 0, months: 6 },
        documents: ['Aadhar Card', 'Forklift Operator License'],
        assets: ['Bike'],
        preferences: { locations: [{ city: 'Noida' }], relocation: ['Yes- Ready To Relocate', 'Yes- Anywhere in India'], distanceKm: 25 },
      }),
  );
  assert.equal(me.data.profile.preferences.willingToRelocate, true, 'relocation flags follow the Excel options');
  assert.equal(me.data.profile.preferences.anywhereInIndia, true);
});

test('post a job with every Excel field', async () => {
  const job = expectOk(
    await request
      .post(`${api}/employer/jobs`)
      .set(auth(ctx.employerToken))
      .send({
        title: 'Forklift Operator',
        description: 'Operate forklifts safely in our Noida plant warehouse, daily checks and loading.',
        keySkills: ['Forklift', 'Warehouse'],
        employmentTypes: ['Full Time, Permanent'],
        salary: { type: 'Commission Based', min: 18000, max: 25000, period: 'monthly' },
        perks: ['PF'],
        experienceLevels: ['Experienced'],
        experience: { min: 0.5, max: 3 },
        jobModes: ['Work From Field'],
        locations: [{ city: 'Noida', state: 'Uttar Pradesh' }],
        distanceKm: 25,
        relocateOptions: ['Yes- Ready To Relocate'],
        openings: 5,
        shifts: ['Day Shift', 'Night Shift'],
        noticePeriods: ['Immediate Joiner', '7 Days'],
        assets: ['Bike'],
        education: { levels: ['10th Pass'], marksType: 'Percentage', marksValue: '50' },
        genders: ['Male', 'Female'],
        ageRange: { min: 18, max: 61 },
        diversity: ['Woman'],
        interviewMode: 'Walk-in',
        walkIn: { startDate: '2027-01-10', endDate: '2027-01-12', durationDays: 3, timing: '10:00 AM - 04:00 PM', contactName: 'Ramesh', contactMobile: '9876500099', venue: 'Plot 5, Sector 63, Noida' },
        contact: { name: 'HR Desk', mobile: '9876500088', timeFrom: '09:30 AM', timeTo: '06:30 PM', dayFrom: 'Monday', dayTo: 'Saturday' },
        questions: [
          { question: 'Years of forklift driving?', type: 'number', required: true },
          { question: 'Which shifts suit you?', type: 'multiple_choice', options: ['Day', 'Night'], required: true },
        ],
        responseAlerts: { daily: true, everyResponse: true, emails: ['ops@tatamotors.test'] },
        publish: true,
      }),
    201,
  );
  assert.equal(job.data.status, 'active');
  ctx.jobId = job.data._id;
  ctx.jobSlug = job.data.slug;

  const bad = await request.post(`${api}/employer/jobs`).set(auth(ctx.employerToken)).send({ title: 'X job', locations: Array(5).fill({ city: 'Noida' }) });
  assert.equal(bad.status, 422, 'more than 4 locations is rejected');
  const badTime = await request.post(`${api}/employer/jobs`).set(auth(ctx.employerToken)).send({ title: 'Y job', contact: { timeFrom: '25:00' } });
  assert.equal(badTime.status, 422);
});

test('job detail hides contacts publicly, shows Call Now to a signed-in candidate', async () => {
  const pub = expectOk(await request.get(`${api}/jobs/${ctx.jobSlug}`));
  assert.equal(pub.data.contact.mobile, undefined);
  assert.equal(pub.data.walkIn.contactMobile, undefined);
  assert.equal(pub.data.walkIn.venue, 'Plot 5, Sector 63, Noida');
  assert.equal(pub.data.responseAlerts, undefined);
  assert.equal(pub.data.contactAction, undefined);
  const mine = expectOk(await request.get(`${api}/jobs/${ctx.jobSlug}`).set(auth(ctx.candidateToken)));
  assert.equal(mine.data.contactAction.type, 'call');
  assert.equal(mine.data.contactAction.mobile, '9876500099', 'walk-in contact first');
  assert.equal(mine.data.contactAction.timeFrom, '09:30 AM');
});

test('job search: keywords, starred, months, km radius, company size, top company, sort', async () => {
  const q = (s) => request.get(`${api}/jobs?${s}`);
  assert.equal(expectOk(await q('keywords[]=forklift&keywords[]=plumber')).meta.total, 1, 'chips are OR-ed');
  assert.equal(expectOk(await q('keywords[]=forklift&keywords[]=plumber&mandatory[]=plumber')).meta.total, 0, 'starred must match');
  assert.equal(expectOk(await q('keywords[]=forklift&keywords[]=warehouse&allMandatory=true')).meta.total, 1);
  assert.equal(expectOk(await q('experienceMin=0.25&experienceMax=1')).meta.total, 1, 'month ranges overlap');
  assert.equal(expectOk(await q('experienceMin=4')).meta.total, 0);
  assert.equal(expectOk(await q('location[]=Ghaziabad')).meta.total, 0);
  assert.equal(expectOk(await q('location[]=Ghaziabad&distanceKm=25')).meta.total, 1, 'Noida is within 25 km of Ghaziabad');
  assert.equal(expectOk(await q('location[]=Jaipur&distanceKm=50')).meta.total, 0);
  assert.equal(expectOk(await q('companySize[]=1001-2000')).meta.total, 1);
  assert.equal(expectOk(await q('companySize[]=0-10')).meta.total, 0);
  assert.equal(expectOk(await q('topCompany[]=TATA')).meta.total, 1);
  assert.equal(expectOk(await q('companyType[]=Indian MNC&postedBy[]=company')).meta.total, 1);
  assert.equal(expectOk(await q('joiningPeriod[]=Immediate Joiner&experienceLevel[]=Experienced&shift[]=Night Shift')).meta.total, 1);
  assert.equal(expectOk(await q('freshness=2&sort=salary_asc')).meta.total, 1);
  assert.equal((await q('freshness=5')).status, 422);
});

test('companies directory filters', async () => {
  const q = (s) => request.get(`${api}/employers?${s}`);
  assert.equal(expectOk(await q('companySize[]=1001-2000&companyType[]=Indian MNC')).meta.total, 1);
  assert.equal(expectOk(await q('datePosted=1&experienceLevel[]=Experienced')).meta.total, 1, 'has a fresh job with that level');
  assert.equal(expectOk(await q('experienceLevel[]=Fresher')).meta.total, 0);
  assert.equal(expectOk(await q('topCompany[]=TATA')).meta.total, 1);
});

test('screening answers follow the question type', async () => {
  const wrong = await request
    .post(`${api}/jobs/${ctx.jobId}/apply`)
    .set(auth(ctx.candidateToken))
    .send({ answers: [{ question: 'Years of forklift driving?', answer: 'two' }, { question: 'Which shifts suit you?', answer: ['Day'] }] });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'ANSWER_INVALID');
  const notOption = await request
    .post(`${api}/jobs/${ctx.jobId}/apply`)
    .set(auth(ctx.candidateToken))
    .send({ answers: [{ question: 'Years of forklift driving?', answer: '2' }, { question: 'Which shifts suit you?', answer: ['Evening'] }] });
  assert.equal(notOption.status, 400);
  expectOk(
    await request
      .post(`${api}/jobs/${ctx.jobId}/apply`)
      .set(auth(ctx.candidateToken))
      .send({ answers: [{ question: 'Years of forklift driving?', answer: '2' }, { question: 'Which shifts suit you?', answer: ['Day', 'Night'] }] }),
    201,
  );
  const app = await mongoose.model('Application').findOne({ job: ctx.jobId }).lean();
  assert.equal(app.answers[1].answer, 'Day, Night');
  const { sendDailyResponseSummaries } = await import('../src/modules/applications/application.service.js');
  const r = await sendDailyResponseSummaries();
  assert.equal(r.sent, 2, 'poster + extra e-mail');
});

test('Request Call Back once per candidate', async () => {
  const job = expectOk(
    await request
      .post(`${api}/employer/jobs`)
      .set(auth(ctx.employerToken))
      .send({ title: 'Store Helper', description: 'Help in the store with stock and billing.', locations: [{ city: 'Noida' }], interviewMode: 'I will Contact Candidates', publish: true }),
    201,
  );
  const detail = expectOk(await request.get(`${api}/jobs/${job.data.slug}`).set(auth(ctx.candidateToken)));
  assert.equal(detail.data.contactAction.type, 'callback');
  assert.equal(detail.data.contactAction.requested, false);
  expectOk(await request.post(`${api}/jobs/${job.data._id}/callback`).set(auth(ctx.candidateToken)));
  const again = expectOk(await request.post(`${api}/jobs/${job.data._id}/callback`).set(auth(ctx.candidateToken)));
  assert.equal(again.data.duplicate, true);
  const list = expectOk(await request.get(`${api}/employer/jobs/${job.data._id}/callbacks`).set(auth(ctx.employerToken)));
  assert.equal(list.meta.total, 1);
  assert.equal(list.data[0].candidate.fullName, 'Priya Singh');
  const after = expectOk(await request.get(`${api}/jobs/${job.data.slug}`).set(auth(ctx.candidateToken)));
  assert.equal(after.data.contactAction.requested, true);
});

test('advanced candidate search filters', async () => {
  const s = (body) => request.post(`${api}/employer/talent/search`).set(auth(ctx.employerToken)).send(body);
  assert.equal(expectOk(await s({ relocateInclude: ['Yes- Ready To Relocate'] })).meta.total, 1);
  assert.equal(expectOk(await s({ relocateExclude: ['Yes- Anywhere in India'] })).meta.total, 0);
  assert.equal(expectOk(await s({ documents: ['forklift operator license'] })).meta.total, 1);
  assert.equal(expectOk(await s({ experienceMin: 0.25, experienceMax: 1 })).meta.total, 1, '6 months is within 3-12 months');
  assert.equal(expectOk(await s({ diversity: ['Woman'] })).meta.total, 1);
  assert.equal(expectOk(await s({ diversity: ['Man'] })).meta.total, 0);
  assert.equal(expectOk(await s({ keywords: ['Welding', 'Plumbing'], mandatoryKeywords: ['Plumbing'] })).meta.total, 0);
  assert.equal(expectOk(await s({ mustHaveKeywords: ['forklift'] })).meta.total, 1);
  assert.equal(expectOk(await s({ candidateTypes: ['new'] })).meta.total, 1);
  assert.equal(expectOk(await s({ candidateTypes: ['premium'] })).meta.total, 0);
  assert.equal(expectOk(await s({ lastActive: '365+' })).meta.total, 0);

  expectOk(await request.get(`${api}/employer/talent/candidates/${ctx.candidateId}`).set(auth(ctx.employerToken)));
  assert.equal(expectOk(await s({ hide: ['viewed'] })).meta.total, 0, 'already viewed is hidden');
  assert.equal(expectOk(await s({ hide: ['unlocked'] })).meta.total, 1);

  const tracked = expectOk(await request.patch(`${api}/employer/talent/candidates/${ctx.candidateId}/tracking`).set(auth(ctx.employerToken)).send({ stage: 'Shortlisted For Interview' }));
  assert.equal(tracked.data.stage, 'Shortlisted For Interview');
});

test('post a job without login needs the mobile OTP', async () => {
  const body = (otp) => ({
    employer: {
      otp,
      employerType: 'consultancy',
      organizationName: 'Quick Hire Consultants',
      fullName: 'Sunil',
      email: 'sunil@quickhire.test',
      mobile: '9876500077',
      declarations: { authorized: true, noCandidateFee: true },
      acceptTerms: true,
    },
    job: { title: 'Delivery Executive', description: 'Deliver parcels across the city on time.', locations: [{ city: 'Jaipur' }], kind: 'internship', internshipType: 'Part Time', duration: { noFixed: true }, stipend: { paid: false } },
  });
  assert.equal((await request.post(`${api}/jobs/guest-post`).send(body(undefined))).status, 422);
  assert.equal((await request.post(`${api}/jobs/guest-post`).send(body('123456'))).status, 400, 'no OTP was sent yet');
  expectOk(await request.post(`${api}/jobs/guest-post/otp`).send({ mobile: '9876500077' }));
  const done = expectOk(await request.post(`${api}/jobs/guest-post`).send(body('123456')), 201);
  const user = await mongoose.model('User').findOne({ mobile: '9876500077' }).lean();
  assert.ok(user.mobileVerifiedAt, 'mobile verified by the OTP');
  const job = await mongoose.model('Job').findById(done.data.jobId).lean();
  assert.equal(job.stipend.paid, false);
  assert.equal(job.duration.noFixed, true);
});

test('PRD quick gaps: page size, sorts, date filters, admin labels and post on behalf', async () => {
  const s = (body, q = '') => request.post(`${api}/employer/talent/search${q}`).set(auth(ctx.employerToken)).send(body);
  assert.equal(expectOk(await s({ sort: 'email_optimized' }, '?limit=10')).meta.limit, 10);
  assert.equal(expectOk(await s({ keywords: ['Welding'], sort: 'last_active' })).meta.total, 1);
  assert.equal((await s({}, '?limit=25')).status, 422, 'page sizes follow the PRD list');

  expectOk(await request.post(`${api}/employer/talent/searches`).set(auth(ctx.employerToken)).send({ name: 'Forklift pool', filters: { keywords: ['forklift'] } }), 201);
  const today = expectOk(await request.get(`${api}/employer/talent/searches?timespan=today`).set(auth(ctx.employerToken)));
  assert.equal(today.meta.total, 1);
  const old = expectOk(await request.get(`${api}/employer/talent/searches?timespan=custom&from=2020-01-01T00:00:00.000Z&to=2020-01-31T00:00:00.000Z`).set(auth(ctx.employerToken)));
  assert.equal(old.meta.total, 0);
  expectOk(await request.get(`${api}/employer/talent/folders?timespan=7d`).set(auth(ctx.employerToken)));

  const mine = expectOk(await request.get(`${api}/employer/jobs?kind=internship&postedBy=me&sort=title&limit=10`).set(auth(ctx.employerToken)));
  assert.equal(mine.meta.total, 0);

  expectOk(await request.post(`${api}/admin/candidates/bulk`).set(auth(ctx.adminToken)).send({ ids: [ctx.candidateId], action: 'label_add', value: 'starred' }));
  expectOk(await request.post(`${api}/admin/candidates/bulk`).set(auth(ctx.adminToken)).send({ ids: [ctx.candidateId], action: 'tag', value: 'Hidden Talent' }));
  const u = await mongoose.model('User').findById(ctx.candidateId).lean();
  assert.ok(u.labels.includes('starred'));
  assert.equal(u.situationTag, 'Hidden Talent');

  const posted = expectOk(
    await request
      .post(`${api}/admin/jobs`)
      .set(auth(ctx.adminToken))
      .send({ organizationId: ctx.orgId, prefillFrom: ctx.jobId, title: 'Forklift Operator (Night)', publish: true }),
    201,
  );
  const job = await mongoose.model('Job').findById(posted.data._id).lean();
  assert.equal(String(job.organization), String(ctx.orgId));
  assert.equal(job.interviewMode, 'Walk-in', 'prefilled from the previous job');
  assert.ok(job.postedByAdmin);
});

test('SEO sitemap, link-preview meta and push links', async () => {
  const map = await request.get(`${api}/seo/sitemap.xml`);
  assert.equal(map.status, 200);
  assert.match(map.headers['content-type'], /xml/);
  assert.match(map.text, new RegExp(`/jobs/${ctx.jobSlug}<`));
  assert.match(map.text, /\/companies\//);
  const meta = expectOk(await request.get(`${api}/seo/meta?path=/jobs/${ctx.jobSlug}`));
  assert.match(meta.data.title, /Forklift Operator at Tata Motors, Noida/);
  assert.ok(meta.data.description.length <= 160);
  const fallback = expectOk(await request.get(`${api}/seo/meta?path=/jobs/does-not-exist`));
  assert.match(fallback.data.title, /Freejobwala/);
  assert.equal((await request.get(`${api}/seo/meta?path=jobs`)).status, 422);

  const { webLink } = await import('../src/modules/notifications/notification.service.js');
  assert.equal(webLink({ screen: 'application', applicationId: 'a1' }, 'employer'), '/employer/applications/a1');
  assert.equal(webLink({ screen: 'application' }, 'candidate'), '/candidate/applications');
  assert.equal(webLink({ screen: 'job_callbacks', jobId: 'j1' }, 'employer'), '/employer/jobs?callbacks=j1');
});

test('final review: fee scam flag, candidate saved searches, platform health', async () => {
  const scam = expectOk(
    await request
      .post(`${api}/employer/jobs`)
      .set(auth(ctx.employerToken))
      .send({ title: 'Data Entry Work', description: 'Work from home. Registration fee of Rs 999 to be paid before joining.', locations: [{ city: 'Noida' }], publish: true }),
    201,
  );
  assert.equal(scam.data.status, 'admin_review');
  assert.match(scam.data.statusReason, /Registration fee/);
  const honest = expectOk(
    await request
      .post(`${api}/employer/jobs`)
      .set(auth(ctx.employerToken))
      .send({ title: 'Store Keeper', description: 'No registration fee. Maintain stock registers and dispatch.', locations: [{ city: 'Noida' }], publish: true }),
    201,
  );
  assert.equal(honest.data.status, 'active');

  const saved = expectOk(await request.post(`${api}/jobs/searches`).set(auth(ctx.candidateToken)).send({ name: 'Forklift Noida', query: 'keywords=forklift&location=Noida&page=3' }), 201);
  assert.equal(saved.data.filters.query, 'keywords=forklift&location=Noida');
  expectOk(await request.post(`${api}/jobs/searches`).set(auth(ctx.candidateToken)).send({ name: 'Renamed', query: 'keywords=forklift&location=Noida' }), 201);
  const list = expectOk(await request.get(`${api}/jobs/searches`).set(auth(ctx.candidateToken)));
  assert.equal(list.data.length, 1, 'same search is updated, not duplicated');
  assert.equal(list.data[0].name, 'Renamed');
  expectOk(await request.delete(`${api}/jobs/searches/${saved.data._id}`).set(auth(ctx.candidateToken)));
  assert.equal((await request.get(`${api}/jobs/searches`).set(auth(ctx.employerToken))).status, 403);

  const health = expectOk(await request.get(`${api}/admin/system/health`).set(auth(ctx.adminToken)));
  assert.equal(health.data.services.database.ok, true);
  assert.ok(health.data.last24h.logins.success >= 1);
  assert.ok(Array.isArray(health.data.warnings));
  assert.equal((await request.get(`${api}/admin/system/health`).set(auth(ctx.employerToken))).status, 403);
});

test('admin edits any candidate profile, employer branding and sees dashboard trends', async () => {
  const A = (r) => r.set(auth(ctx.adminToken));
  const prof = expectOk(await A(request.get(`${api}/admin/candidates/${ctx.candidateId}/profile`)));
  assert.equal(prof.data.user.fullName, 'Priya Singh');
  const upd = expectOk(await A(request.patch(`${api}/admin/candidates/${ctx.candidateId}/profile`)).send({ resumeHeadline: 'Certified forklift operator', keySkills: ['Forklift', 'Safety'] }));
  assert.equal(upd.data.profile.resumeHeadline, 'Certified forklift operator');
  const emp = expectOk(
    await A(request.post(`${api}/admin/candidates/${ctx.candidateId}/profile/employments`)).send({ jobTitle: 'Operator', employerName: 'Acme Logistics', isCurrent: true, startDate: '2024-01-01' }),
    201,
  );
  const itemId = emp.data.item?.employerName === 'Acme Logistics' ? emp.data.item._id : null;
  assert.ok(itemId, 'employment added for the candidate');
  expectOk(await A(request.delete(`${api}/admin/candidates/${ctx.candidateId}/profile/employments/${itemId}`)));
  assert.equal((await A(request.patch(`${api}/admin/candidates/${ctx.orgId}/profile`)).send({ resumeHeadline: 'x' })).status, 404, 'only candidates');
  assert.equal((await request.patch(`${api}/admin/candidates/${ctx.candidateId}/profile`).set(auth(ctx.employerToken)).send({ resumeHeadline: 'x' })).status, 403);

  const u = expectOk(await A(request.get(`${api}/admin/users/${ctx.candidateId}`)));
  assert.equal(u.data.user.email, 'priya@example.test');

  expectOk(await A(request.patch(`${api}/admin/employers/${ctx.orgId}`)).send({ logo: { key: 'public/logos/x.png', url: 'https://cdn.example.test/x.png' }, verification: { gst: true } }));
  const org = await mongoose.model('Organization').findById(ctx.orgId).lean();
  assert.equal(org.logo.url, 'https://cdn.example.test/x.png');
  assert.equal(org.verification.gst, true);

  const dash = expectOk(await A(request.get(`${api}/admin/dashboard?timespan=30d`)));
  assert.ok(Array.isArray(dash.data.trend) && dash.data.trend.length > 0);
  assert.ok(dash.data.recent.candidates.length >= 1);
  assert.ok('employers' in dash.data.pending);
});

test('CMS content from the visual editor is sanitised (FAQ answers too)', async () => {
  const A = (r) => r.set(auth(ctx.adminToken));
  const faq = expectOk(
    await A(request.post(`${api}/admin/cms/faqs`)).send({ question: 'Is it free?', answer: '<p style="text-align: center">Yes<script>alert(1)</script><img src="x" onerror="alert(1)"></p>' }),
    201,
  );
  assert.doesNotMatch(faq.data.answer, /<script|onerror/);
  assert.match(faq.data.answer, /text-align: ?center/);
  const blog = expectOk(
    await A(request.post(`${api}/admin/cms/blogs`)).send({ title: 'Table post', status: 'published', content: '<table><tbody><tr><th colspan="2">Head</th></tr></tbody></table><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>' }),
    201,
  );
  assert.match(blog.data.content, /<th colspan="2">/);
  assert.match(blog.data.content, /youtube-nocookie\.com\/embed/, 'YouTube embeds from the editor are kept');
});
