/**
 * Candidate folders: private / whole team / selected people, view-only vs "can add and remove",
 * copy and move between folders, search, sorting, duplicate names and who may change what.
 * In-memory MongoDB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let svc;
let m;
const ctx = { candidates: [] };
const page = { page: 1, limit: 20, skip: 0 };

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: `${mongo.getUri()}freejobwala_folders`,
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
  svc = await import('../src/modules/talent/talent.service.js');
  m = {
    User: (await import('../src/modules/users/user.model.js')).default,
    Organization: (await import('../src/modules/employers/organization.model.js')).default,
    Candidate: (await import('../src/modules/candidates/candidate.model.js')).default,
    ...(await import('../src/modules/engagement/engagement.models.js')),
    Notification: (await import('../src/modules/notifications/notification.model.js')).Notification,
  };
  const { User, Organization, Candidate } = m;

  const member = async (name, n, employer) => User.create({ role: 'employer', fullName: name, email: `${name.toLowerCase()}@fold.test`, mobile: `98333000${n}`, status: 'active', employer });
  ctx.owner = await member('Olivia', 10, {});
  const org = await Organization.create({ uid: 'F-1', type: 'company', name: 'Fold Corp', slug: 'fold-corp', owner: ctx.owner._id, status: 'active' });
  ctx.owner.employer = { organization: org._id, isOwner: true };
  await ctx.owner.save();
  ctx.lead = await member('Leena', 11, { organization: org._id, memberRole: 'team_lead' });
  ctx.rec = await member('Ravi', 12, { organization: org._id, memberRole: 'recruiter' });
  ctx.rec2 = await member('Rhea', 13, { organization: org._id, memberRole: 'recruiter' });

  const other = await member('Outsider', 14, {});
  const org2 = await Organization.create({ uid: 'F-2', type: 'company', name: 'Other Corp', slug: 'other-corp', owner: other._id, status: 'active' });
  other.employer = { organization: org2._id, isOwner: true };
  await other.save();
  ctx.outsider = other;

  for (let i = 0; i < 4; i += 1) {
    const c = await User.create({ role: 'candidate', fullName: ['Asha Rao', 'Bharat Jain', 'Chitra Nair', 'Dev Malik'][i], email: `c${i}@fold.test`, mobile: `98444000${10 + i}`, status: 'active' });
    await Candidate.create({ user: c._id, currentJobTitle: 'Sales Executive' });
    ctx.candidates.push(c._id);
  }
});

after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const code = (c) => (e) => e.code === c;

test('create: private by default, candidates can be filed right away, names are unique per owner', async () => {
  const f = await svc.createFolder(ctx.rec, { name: 'Sales shortlist', description: 'Q4 hiring', candidateIds: ctx.candidates.slice(0, 3) });
  assert.deepEqual([f.visibility, f.sharedAccess, f.count, f.access], ['private', 'view', 3, 'owner']);
  assert.equal(f.owner.fullName, 'Ravi');
  ctx.folder = f._id;
  await assert.rejects(() => svc.createFolder(ctx.rec, { name: 'sales SHORTLIST' }), code('FOLDER_EXISTS'));
  const sameNameOtherOwner = await svc.createFolder(ctx.lead, { name: 'Sales shortlist' });
  assert.ok(sameNameOtherOwner._id, 'another user may use the same name');
  ctx.leadFolder = sameNameOtherOwner._id;
});

test('a private folder is invisible to other recruiters, but "manage all folders" roles see it', async () => {
  await assert.rejects(() => svc.folderDetails(ctx.rec2, ctx.folder), code('FOLDER_FORBIDDEN'));
  await assert.rejects(() => svc.folderDetails(ctx.outsider, ctx.folder), /not found/i);
  assert.equal((await svc.folderDetails(ctx.lead, ctx.folder)).access, 'owner');
  const shared = await svc.listFolders(ctx.rec2, { tab: 'shared' });
  assert.equal(shared.folders.length, 0);
});

test('a recruiter role cannot share; a role with the share permission can', async () => {
  await assert.rejects(() => svc.updateFolder(ctx.rec, ctx.folder, { visibility: 'team' }), code('PERMISSION_DENIED'));
  await assert.rejects(() => svc.updateFolder(ctx.lead, ctx.folder, { visibility: 'selected', sharedWith: [] }), code('SHARE_NEEDS_MEMBERS'));
  await assert.rejects(() => svc.updateFolder(ctx.lead, ctx.folder, { visibility: 'selected', sharedWith: [ctx.outsider._id] }), code('SHARE_NEEDS_MEMBERS'), 'people outside the account are dropped');
});

test('shared with selected people as view only: they can open and copy out, not change', async () => {
  const f = await svc.updateFolder(ctx.lead, ctx.folder, { visibility: 'selected', sharedWith: [ctx.rec2._id, ctx.outsider._id], sharedAccess: 'view' });
  assert.deepEqual(f.sharedWith.map((u) => u.fullName), ['Rhea']);
  // The notification is written in the background, so give it a moment.
  let note = null;
  for (let i = 0; i < 40 && !note; i += 1) {
    note = await m.Notification.findOne({ user: ctx.rec2._id, type: 'folder_shared' }).lean();
    if (!note) await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(note, 'the person a folder is shared with gets a notification');
  assert.match(note.body, /Leena shared the folder "Sales shortlist"/);

  const list = await svc.listFolders(ctx.rec2, { tab: 'shared' });
  assert.deepEqual(list.folders.map((x) => [x.name, x.access, x.count, x.owner.fullName]), [['Sales shortlist', 'view', 3, 'Ravi']]);
  assert.equal(list.counts.shared, 1);

  const cards = await svc.folderCandidates(ctx.rec2, ctx.folder, page);
  assert.deepEqual(cards.items.map((c) => c.name), ['Chitra Nair', 'Bharat Jain', 'Asha Rao'], 'newest filed first');
  assert.equal(cards.items[0].addedBy, 'Ravi');
  assert.ok(cards.items[0].addedAt);

  await assert.rejects(() => svc.addToFolder(ctx.rec2, ctx.folder, [ctx.candidates[3]]), code('FOLDER_READ_ONLY'));
  await assert.rejects(() => svc.removeFromFolder(ctx.rec2, ctx.folder, [ctx.candidates[0]]), code('FOLDER_READ_ONLY'));
  await assert.rejects(() => svc.updateFolder(ctx.rec2, ctx.folder, { name: 'Mine now' }), code('FOLDER_READ_ONLY'));
  await assert.rejects(() => svc.deleteFolder(ctx.rec2, ctx.folder), code('FOLDER_READ_ONLY'));

  const own = await svc.createFolder(ctx.rec2, { name: 'Rhea picks' });
  ctx.rheaFolder = own._id;
  const copied = await svc.transferCandidates(ctx.rec2, ctx.folder, { candidateIds: [ctx.candidates[0], ctx.candidates[1]], targetFolderId: own._id });
  assert.deepEqual([copied.added, copied.moved, copied.target.count], [2, 0, 2]);
  await assert.rejects(() => svc.transferCandidates(ctx.rec2, ctx.folder, { candidateIds: [ctx.candidates[0]], targetFolderId: own._id, move: true }), code('FOLDER_READ_ONLY'), 'moving takes candidates out, so it needs edit rights');
  assert.equal((await svc.folderDetails(ctx.rec, ctx.folder)).count, 3);
});

test('"can add and remove" lets shared people file and remove candidates, still not rename or delete', async () => {
  await svc.updateFolder(ctx.lead, ctx.folder, { sharedAccess: 'edit' });
  const added = await svc.addToFolder(ctx.rec2, ctx.folder, [ctx.candidates[3], ctx.candidates[0]]);
  assert.deepEqual([added.added, added.alreadyThere, added.count], [1, 1, 4]);
  const removed = await svc.removeFromFolder(ctx.rec2, ctx.folder, [ctx.candidates[3]]);
  assert.deepEqual([removed.removed, removed.count], [1, 3]);
  await assert.rejects(() => svc.deleteFolder(ctx.rec2, ctx.folder), code('FOLDER_READ_ONLY'));
});

test('move between two folders the member can edit', async () => {
  const second = await svc.createFolder(ctx.rec, { name: 'Round two' });
  const res = await svc.transferCandidates(ctx.rec, ctx.folder, { candidateIds: [ctx.candidates[2], ctx.candidates[3]], targetFolderId: second._id, move: true });
  assert.deepEqual([res.added, res.moved, res.target.count], [1, 1, 1], 'candidate 3 is not in the source, so only one moves');
  assert.equal((await svc.folderDetails(ctx.rec, ctx.folder)).count, 2);
  await assert.rejects(() => svc.transferCandidates(ctx.rec, ctx.folder, { candidateIds: [ctx.candidates[0]], targetFolderId: ctx.folder }), code('SAME_FOLDER'));
  await assert.rejects(() => svc.transferCandidates(ctx.rec, ctx.folder, { candidateIds: [ctx.candidates[0]], targetFolderId: ctx.rheaFolder }), code('FOLDER_FORBIDDEN'), 'cannot drop candidates into a folder that is not shared with you');
});

test('whole-team sharing shows the folder to every member; making it private hides it again', async () => {
  await svc.updateFolder(ctx.lead, ctx.leadFolder, { visibility: 'team' });
  for (const who of [ctx.rec, ctx.rec2]) assert.equal((await svc.folderDetails(who, ctx.leadFolder)).access, 'view');
  await assert.rejects(() => svc.folderDetails(ctx.outsider, ctx.leadFolder), /not found/i);
  const back = await svc.updateFolder(ctx.lead, ctx.leadFolder, { visibility: 'private' });
  assert.deepEqual([back.visibility, back.sharedWith.length], ['private', 0]);
  await assert.rejects(() => svc.folderDetails(ctx.rec2, ctx.leadFolder), code('FOLDER_FORBIDDEN'));
});

test('list: search, sort, paging and tab counts', async () => {
  for (const name of ['Alpha pool', 'Zeta pool']) await svc.createFolder(ctx.rec, { name });
  const byName = await svc.listFolders(ctx.rec, { tab: 'mine', sort: 'name' });
  assert.deepEqual(byName.folders.map((f) => f.name), ['Alpha pool', 'Round two', 'Sales shortlist', 'Zeta pool']);
  assert.equal(byName.counts.mine, 4);
  const found = await svc.listFolders(ctx.rec, { tab: 'mine', q: 'pool' });
  assert.equal(found.total, 2);
  const paged = await svc.listFolders(ctx.rec, { tab: 'mine', sort: 'name', page: 2, limit: 3 });
  assert.deepEqual([paged.folders.length, paged.total, paged.folders[0].name], [1, 4, 'Zeta pool']);
  const biggest = await svc.listFolders(ctx.rec, { tab: 'mine', sort: '-count' });
  assert.equal(biggest.folders[0].name, 'Sales shortlist');
  const everything = await svc.listFolders(ctx.lead, { tab: 'all' });
  assert.equal(everything.total, 6, 'a "manage all folders" role sees every folder of the account');
});

test('search inside a folder by candidate name, and only candidate accounts can be filed', async () => {
  const hit = await svc.folderCandidates(ctx.rec, ctx.folder, { ...page, q: 'bharat' });
  assert.deepEqual(hit.items.map((c) => c.name), ['Bharat Jain']);
  const res = await svc.addToFolder(ctx.rec, ctx.folder, [ctx.lead._id, ctx.candidates[3]]);
  assert.equal(res.added, 1, 'a recruiter account is not a candidate');
});

test('folders saved before sharing modes existed keep working (share list = selected, view only)', async () => {
  const legacy = await m.CandidateFolder.collection.insertOne({ organization: ctx.owner.employer.organization, owner: ctx.rec._id, name: 'Old folder', candidates: [], sharedWith: [ctx.rec2._id], createdAt: new Date(), updatedAt: new Date() });
  const d = await svc.folderDetails(ctx.rec2, legacy.insertedId);
  assert.deepEqual([d.visibility, d.access], ['selected', 'view']);
  const list = await svc.listFolders(ctx.rec2, { tab: 'shared' });
  assert.ok(list.folders.some((f) => f.name === 'Old folder'));
});

test('saved searches can only be shared inside the account', async () => {
  const s = await svc.saveSearch(ctx.lead, { name: 'Sales in Jaipur', filters: { keywords: ['sales'] }, sharedWith: [ctx.rec._id, ctx.outsider._id] });
  assert.deepEqual(s.sharedWith.map(String), [String(ctx.rec._id)]);
});
