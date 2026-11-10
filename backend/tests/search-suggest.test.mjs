/**
 * Search suggestions: ranked keyword groups, location aliases ("bang"), typo fallback ("jaipru"),
 * city-before-locality ranking, "use my current location". In-memory MongoDB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let suggest;
let loc;

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: `${mongo.getUri()}freejobwala_suggest`,
    JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
    ENCRYPTION_KEY: 'd'.repeat(64),
    REDIS_URL: '',
    STORAGE_DRIVER: 'local',
  });
  mongoose = (await import('mongoose')).default;
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();
  const md = await import('../src/modules/masterdata/masterdata.service.js');
  const { Lookup } = await import('../src/modules/masterdata/masterdata.models.js');
  const Organization = (await import('../src/modules/employers/organization.model.js')).default;
  const User = (await import('../src/modules/users/user.model.js')).default;
  suggest = (await import('../src/modules/search/suggest.service.js')).suggest;
  loc = await import('../src/modules/masterdata/locationSearch.js');

  const place = (city, state, lat, lng, extra = {}) => md.createLocation({ city, state, country: 'India', geo: { lat, lng }, ...extra });
  await place('Jaipur', 'Rajasthan', 26.9124, 75.7873, { isPopular: true });
  await place('Jaipur', 'Rajasthan', 26.8173, 75.8659, { locality: 'Jagatpura' });
  await place('Bengaluru', 'Karnataka', 12.9716, 77.5946, { isPopular: true });
  await place('Gurugram', 'Haryana', 28.4595, 77.0266);
  await place('Ajmer', 'Rajasthan', 26.4499, 74.6399);

  const lk = (type, name, usageCount = 0) => Lookup.create({ type, name, slug: `${type}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), usageCount, isActive: true });
  await lk('job_title', 'Analytical Reasoning Trainer', 99);
  await lk('job_title', 'React Developer', 5);
  await lk('job_title', 'Real Estate Agent', 1);
  await lk('key_skill', 'React', 50);
  await lk('key_skill', 'React', 0).catch(() => {});
  const owner = await User.create({ role: 'employer', fullName: 'Owner', email: 'o@sg.test', mobile: '9811122233', status: 'active' });
  await Organization.create({ uid: 'SG-1', type: 'company', name: 'Reactor Labs', slug: 'reactor-labs', owner: owner._id, status: 'active', stats: { activeJobs: 3 } });
});

after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

test('keyword suggestions: grouped, starts-with first, companies with job counts', async () => {
  const r = await suggest({ q: 'rea', scope: 'jobs' });
  const titles = r.groups.find((g) => g.key === 'titles').items.map((i) => i.label);
  assert.deepEqual(titles.slice(0, 2).sort(), ['React Developer', 'Real Estate Agent']);
  assert.ok(titles.indexOf('Analytical Reasoning Trainer') > 1, 'word matches come after starts-with matches even when more popular');
  const company = r.groups.find((g) => g.key === 'companies').items[0];
  assert.equal(company.label, 'Reactor Labs');
  assert.equal(company.meta, '3 jobs');
  assert.equal(company.path, '/companies/reactor-labs');
});

test('candidate scope has no companies; empty query returns nothing', async () => {
  const r = await suggest({ q: 'rea', scope: 'candidates' });
  assert.ok(!r.groups.some((g) => g.key === 'companies'));
  assert.equal(r.groups[0].label, 'Designations');
  assert.deepEqual((await suggest({ q: '  ', scope: 'jobs' })).groups, []);
});

test('locations: city before its localities, old names and typos still match', async () => {
  const jaip = await loc.smartLocations({ q: 'jaip' });
  assert.equal(jaip.items[0].displayName.startsWith('Jaipur'), true);
  assert.equal(jaip.items[1].locality, 'Jagatpura');

  const bang = await loc.smartLocations({ q: 'bang' });
  assert.equal(bang.items[0].city, 'Bengaluru');
  const gurgaon = await loc.smartLocations({ q: 'gurgaon' });
  assert.equal(gurgaon.items[0].city, 'Gurugram');

  const typo = await loc.smartLocations({ q: 'jaipru' });
  assert.equal(typo.corrected, 'Jaipur');
  assert.ok(typo.items.length >= 1);

  const viaApi = await suggest({ q: 'bang', scope: 'locations' });
  assert.equal(viaApi.groups[0].items[0].label, 'Bengaluru, Karnataka');
});

test('nearest city for "use my current location"', async () => {
  const near = await loc.nearestCity(26.92, 75.8);
  assert.equal(near.place.city, 'Jaipur');
  assert.ok(near.distanceKm < 5);
  assert.equal(await loc.nearestCity(10.0, 60.0), null, 'nothing within 150 km');
});

test('short forms show their full form first ("sde")', async () => {
  const r = await suggest({ q: 'sde', scope: 'jobs' });
  assert.equal(r.groups[0].key, 'expanded');
  assert.deepEqual(
    r.groups[0].items.map((i) => i.label),
    ['Software Developer', 'Software Engineer'],
  );
});

test('title and skill suggestions carry live job counts', async () => {
  const Job = (await import('../src/modules/jobs/job.model.js')).default;
  await Job.collection.insertMany([
    { uid: 'JOB-SG-1', slug: 'sg-1', status: 'active', title: 'React Developer', keySkills: ['React'], locations: [{ city: 'Jaipur' }] },
    { uid: 'JOB-SG-2', slug: 'sg-2', status: 'active', title: 'React Developer', keySkills: ['React'], locations: [{ city: 'Jaipur' }] },
  ]);
  (await import('../src/modules/search/suggest.service.js')).resetSuggestCache();
  const r = await suggest({ q: 'reac', scope: 'jobs' });
  const title = r.groups.find((g) => g.key === 'titles').items.find((i) => i.label === 'React Developer');
  assert.equal(title.meta, '2 jobs');
});

test('search stats: trending, privacy and admin insights', async () => {
  const stats = await import('../src/modules/search/searchStats.service.js');
  const { SearchStat } = await import('../src/modules/search/searchStats.model.js');
  stats.recordSearch({ terms: ['React Developer', 'someone@mail.com', '9876543210'], scope: 'jobs', total: 4 });
  stats.recordSearch({ terms: ['React Developer'], scope: 'jobs', total: 2 });
  stats.recordSearch({ terms: ['Underwater Welder'], scope: 'jobs', total: 0 });
  // Employer searches: candidate names are never logged, known titles are.
  stats.recordSearch({ terms: ['Priya Sharma', 'React Developer'], scope: 'candidates', total: 1 });
  await stats.recordPick({ term: 'React Developer', scope: 'jobs' });
  await new Promise((r) => setTimeout(r, 300));

  const all = await SearchStat.find().lean();
  const terms = all.map((s) => `${s.scope}:${s.term}`);
  assert.ok(!terms.some((t) => t.includes('@') || /\d{5}/.test(t)), 'e-mails and phone numbers are not stored');
  assert.ok(!terms.includes('candidates:priya sharma'), 'names from candidate search are not stored');
  assert.ok(terms.includes('candidates:react developer'));

  const trend = await stats.trending({ scope: 'jobs' });
  assert.equal(trend[0].term, 'react developer');
  assert.ok(!trend.some((t) => t.term === 'underwater welder'), 'terms that never find jobs are not trending');

  const ins = await stats.insights({ scope: 'jobs', days: 7 });
  assert.equal(ins.totals.searches, 3);
  assert.equal(ins.zeroResults[0].term, 'underwater welder');
  assert.equal(ins.daily.length, 1);
});

test('"For you" uses the candidate profile only', async () => {
  const { forYou } = await import('../src/modules/search/forYou.service.js');
  const User = (await import('../src/modules/users/user.model.js')).default;
  const Candidate = (await import('../src/modules/candidates/candidate.model.js')).default;
  const u = await User.create({ role: 'candidate', fullName: 'Fy', email: 'fy@sg.test', mobile: '9811122299', status: 'active' });
  await Candidate.create({ user: u._id, keySkills: ['React', 'Node.js'], employments: [{ jobTitle: 'Frontend Developer', isCurrent: true }], preferences: { locations: [{ city: 'Jaipur' }] } });
  const r = await forYou(u);
  assert.equal(r.titles[0], 'Frontend Developer');
  assert.deepEqual(r.skills, ['React', 'Node.js']);
  assert.equal(r.cities[0].city, 'Jaipur');
  assert.deepEqual(await forYou({ role: 'employer' }), { titles: [], skills: [], cities: [] });
});
