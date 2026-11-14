/**
 * Every import offers a sample file and a format guide built from one spec. These tests download
 * each sample exactly as a user would and import it back unchanged: it must go in with no errors.
 * Also covers CSV uploads (incl. the MIME type Windows browsers send) and old .xls files.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let app;
const ctx = {};
const m = {};
const api = '/api/v1';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: `${mongo.getUri()}freejobwala_imports`, JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'), ENCRYPTION_KEY: 'c'.repeat(64), REDIS_URL: '', STORAGE_DRIVER: 'local' });
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/database.js')).connectDatabase();
  app = (await import('../src/app.js')).createApp();
  m.User = (await import('../src/modules/users/user.model.js')).default;
  m.Organization = (await import('../src/modules/employers/organization.model.js')).default;
  m.Job = (await import('../src/modules/jobs/job.model.js')).default;
  Object.assign(m, await import('../src/modules/masterdata/masterdata.models.js'));
  m.excel = await import('../src/shared/utils/excel.js');
  m.templates = await import('../src/modules/imports/importTemplates.js');
  const { issueTokens } = await import('../src/modules/auth/token.service.js');
  const fakeReq = { get: () => undefined, headers: {}, ip: '127.0.0.1' };
  ctx.admin = await m.User.create({ role: 'super_admin', fullName: 'Root', email: 'root@imports.test', status: 'active' });
  ctx.adminToken = (await issueTokens(ctx.admin, fakeReq)).accessToken;
  ctx.owner = await m.User.create({ role: 'employer', fullName: 'Owner', email: 'owner@imports.test', mobile: '9811177001', status: 'active' });
  ctx.org = await m.Organization.create({ uid: 'IMP-1', type: 'company', name: 'Import Co', slug: 'import-co', owner: ctx.owner._id, status: 'active', planFeatures: { bulkUpload: true } });
  ctx.owner.employer = { organization: ctx.org._id, isOwner: true };
  await ctx.owner.save();
  ctx.ownerToken = (await issueTokens(ctx.owner, fakeReq)).accessToken;
  const level = await m.Lookup.create({ type: 'education_level', name: 'Graduate', slug: 'graduate', order: 7 });
  await m.Lookup.create({ type: 'degree', name: 'B.Com', slug: 'bcom', parent: level._id, order: 2 });
});
after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const asAdmin = (req) => req.set('authorization', `Bearer ${ctx.adminToken}`);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const download = async (path, token = ctx.adminToken) => {
  const res = await request(app).get(`${api}${path}`).set('authorization', `Bearer ${token}`).buffer(true).parse(binary);
  assert.equal(res.status, 200, `${path}: ${res.body?.toString?.().slice(0, 200)}`);
  return res;
};
const upload = (path, buffer, filename, contentType, token = ctx.adminToken) =>
  request(app).post(`${api}${path}`).set('authorization', `Bearer ${token}`).attach('file', buffer, { filename, contentType });

test('every sample heading is a column its importer reads', async () => {
  const { CANDIDATE_HEADERS, EMPLOYER_HEADERS } = await import('../src/modules/admin/admin.users.service.js');
  const { JOB_HEADERS } = await import('../src/modules/jobs/job.service.js');
  const { ALERT_HEADERS } = await import('../src/modules/alerts/alert.service.js');
  const known = { candidates: CANDIDATE_HEADERS, employers: EMPLOYER_HEADERS, jobs: JOB_HEADERS, 'job-alerts': ALERT_HEADERS, locations: Object.fromEntries(['locality', 'district', 'city', 'state', 'country', 'pincode', 'popular'].map((k) => [k, k])) };
  for (const [kind, map] of Object.entries(known)) {
    const spec = await m.templates.getTemplateSpec(kind);
    for (const c of spec.columns) assert.ok(map[m.excel.normalizeHeader(`${c.header}${c.required === true ? ' *' : ''}`)], `${kind}: "${c.header}" is not read by the importer`);
    assert.ok(spec.rows.length >= 2 && spec.notes.length >= 4, `${kind} has sample rows and notes`);
  }
});

test('the format guide is served as JSON for the import dialog', async () => {
  const res = await asAdmin(request(app).get(`${api}/admin/import-templates/candidates`));
  assert.equal(res.status, 200);
  const spec = res.body.data;
  assert.deepEqual(spec.formats, ['xlsx', 'csv']);
  assert.equal(spec.columns.find((c) => c.header === 'Full Name').required, true);
  assert.equal(spec.columns.find((c) => c.header === 'Mobile Number').required, 'either');
  const unknown = await asAdmin(request(app).get(`${api}/admin/import-templates/nope`));
  assert.equal(unknown.status, 422);
  const anon = await request(app).get(`${api}/admin/import-templates/candidates`);
  assert.equal(anon.status, 401);
});

test('candidate sample (.xlsx) imports with no errors; the CSV sample is read too, even as application/vnd.ms-excel', async () => {
  const file = await download('/admin/import-templates/candidates?format=xlsx');
  assert.match(file.headers['content-type'], /spreadsheetml/);
  assert.match(file.headers['content-disposition'], /freejobwala-candidates-sample\.xlsx/);
  const res = await upload('/admin/candidates/import', file.body, 'candidates.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.created, res.body.data.errors.length], [2, 0], JSON.stringify(res.body.data.errors));
  const asha = await m.User.findOne({ email: 'asha.verma@example.com' }).lean();
  assert.equal(asha.mobile, '9876500001', 'mobile kept as text');

  const csv = await download('/admin/import-templates/candidates?format=csv');
  assert.match(csv.headers['content-type'], /text\/csv/);
  const check = await upload('/admin/candidates/import?dryRun=true', csv.body, 'candidates.csv', 'application/vnd.ms-excel');
  assert.equal(check.status, 200, JSON.stringify(check.body));
  assert.deepEqual([check.body.data.total, check.body.data.existingInDatabase.length], [2, 2], 'CSV rows read and matched to the imported candidates');
});

test('job alert sample imports for the sample candidates', async () => {
  const file = await download('/admin/import-templates/job-alerts?format=xlsx');
  const res = await upload('/admin/job-alerts/import', file.body, 'alerts.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.created, res.body.data.errors.length], [2, 0], JSON.stringify(res.body.data.errors));
});

test('employer sample imports with no errors', async () => {
  const file = await download('/admin/import-templates/employers?format=xlsx');
  const res = await upload('/admin/employers/import', file.body, 'employers.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.created, res.body.data.errors.length], [2, 0], JSON.stringify(res.body.data.errors));
  const consultancy = await m.Organization.findOne({ name: 'Bright Path Placements' }).lean();
  assert.equal(consultancy.type, 'consultancy');
});

test('job sample imports for an employer (admin and employer side) and keeps "Full Time, Permanent" whole', async () => {
  const file = await download('/admin/import-templates/jobs?format=xlsx');
  const res = await upload(`/admin/jobs/import?organizationId=${ctx.org._id}`, file.body, 'jobs.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.created, res.body.data.errors.length], [2, 0], JSON.stringify(res.body.data.errors));
  const job = await m.Job.findOne({ organization: ctx.org._id, title: 'Sales Executive' }).lean();
  assert.deepEqual(job.employmentTypes, ['Full Time, Permanent']);
  assert.deepEqual([job.salary.min, job.salary.max, job.experience.min, job.openings], [18000, 30000, 1, 5]);
  assert.equal((await m.Job.findOne({ title: 'Graphic Design Intern' }).lean()).kind, 'internship');

  const guide = await request(app).get(`${api}/employer/jobs/bulk-import/template`).set('authorization', `Bearer ${ctx.ownerToken}`);
  assert.equal(guide.status, 200);
  assert.equal(guide.body.data.columns[0].header, 'Job Title');
  const csv = await download('/employer/jobs/bulk-import/template?format=csv', ctx.ownerToken);
  const mine = await upload('/employer/jobs/bulk-import', csv.body, 'jobs.csv', 'text/csv', ctx.ownerToken);
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.deepEqual([mine.body.data.created, mine.body.data.errors.length], [2, 0], JSON.stringify(mine.body.data.errors));
});

test('location sample imports with no errors', async () => {
  const file = await download('/admin/import-templates/locations?format=xlsx');
  const res = await upload('/admin/locations/import', file.body, 'locations.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.inserted, res.body.data.errors.length], [2, 0], JSON.stringify(res.body.data.errors));
});

test('master data sample uses real options, so importing it as it is changes nothing', async () => {
  const spec = await asAdmin(request(app).get(`${api}/admin/import-templates/master-data?type=degree`));
  assert.equal(spec.status, 200);
  assert.deepEqual(spec.body.data.columns.map((c) => c.header), ['Name', 'Parent', 'Order', 'Active']);
  assert.deepEqual(spec.body.data.rows[0], { Name: 'B.Com', Parent: 'Graduate', Order: '2', Active: 'Yes' });
  const file = await download('/admin/import-templates/master-data?type=degree&format=xlsx');
  const res = await upload('/admin/master-data/degree/import', file.body, 'degree.xlsx', XLSX);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.inserted, res.body.data.errors.length], [0, 0], JSON.stringify(res.body.data.errors));
  assert.equal(await m.Lookup.countDocuments({ type: 'degree' }), 1);
  const bad = await asAdmin(request(app).get(`${api}/admin/import-templates/master-data?type=nope`));
  assert.equal(bad.status, 400);
});

test('old .xls files and unsupported files get a clear message', async () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
  const xls = await upload('/admin/locations/import', ole, 'old.xls', 'application/vnd.ms-excel');
  assert.equal(xls.status, 400);
  assert.match(xls.body.error.message, /Save As/);
  const pdf = await upload('/admin/locations/import', Buffer.from('%PDF-1.4'), 'file.pdf', 'application/pdf');
  assert.equal(pdf.status, 400);
  const fake = await upload('/admin/locations/import', Buffer.from('MZ\u0000\u0000binary'), 'evil.csv', 'text/csv');
  assert.equal(fake.status, 400, 'binary content renamed to .csv is refused');
});

test('cell helpers: CSV quoting and delimiters, number formats, multi-value cells', () => {
  const { parseCsv, cellNumber, cellList, employmentTypeList, normalizeHeader } = m.excel;
  assert.deepEqual(parseCsv('﻿Name,Skills\r\n"Asha ""A"" V","Sales, Excel"\r\n'), [['Name', 'Skills'], ['Asha "A" V', 'Sales, Excel']]);
  assert.deepEqual(parseCsv('City;State\nIndore;MP'), [['City', 'State'], ['Indore', 'MP']]);
  assert.equal(cellNumber('5,00,000', 'Salary'), 500000);
  assert.equal(cellNumber('₹ 25000', 'Salary'), 25000);
  assert.equal(cellNumber('', 'Salary'), undefined);
  assert.throws(() => cellNumber('abc', 'Salary'), /Salary must be a number/);
  assert.deepEqual(cellList('a, b ,c'), ['a', 'b', 'c']);
  assert.deepEqual(cellList('UX, Design & Architecture; Sales'), ['UX, Design & Architecture', 'Sales']);
  assert.deepEqual(employmentTypeList('Full Time, Permanent, Part Time, Freelance'), ['Full Time, Permanent', 'Part Time, Freelance']);
  assert.deepEqual(employmentTypeList('Permanent'), ['Permanent']);
  assert.equal(normalizeHeader('  Full   Name * '), 'full name');
});
