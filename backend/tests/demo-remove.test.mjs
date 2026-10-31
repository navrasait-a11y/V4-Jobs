import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let rs;
let client;
let db;
let root;

const run = (...args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/demo-data.js', ...args], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MONGODB_URI: rs.getUri('demo_test'),
        MONGODB_DB_NAME: 'demo_test',
        JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
        ENCRYPTION_KEY: 'b'.repeat(64),
        REDIS_URL: '',
        STORAGE_DRIVER: 'local',
        LOCAL_UPLOAD_DIR: root,
        DEMO_PASSWORD: 'Verify1234',
      },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => resolve({ code, out }));
  });

const file = async (key) => {
  await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
  await fs.writeFile(path.join(root, key), 'x');
  return key;
};
const exists = (key) => fs.access(path.join(root, key)).then(() => true, () => false);

before(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  client = await new mongoose.mongo.MongoClient(rs.getUri()).connect();
  db = client.db('demo_test');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'fjw-demo-'));
});

after(async () => {
  await client?.close();
  await rs?.stop();
  await fs.rm(root, { recursive: true, force: true });
});

test('demo:remove deletes demo records and their media, never files real records use', { timeout: 120000 }, async () => {
  assert.equal((await run('seed')).code, 0);

  const avatar = await file('public/avatars/demo.png');
  const resume = await file('private/resumes/demo.pdf');
  const snapshot = await file('private/resumes/snapshot.pdf');
  const kyc = await file('private/kyc/demo.pdf');
  const logo = await file('public/logos/demo.png');
  const chat = await file('private/chat/demo.pdf');
  const shared = await file('public/cms/shared.png');
  const real = await file('private/resumes/real.pdf');

  const demoUser = await db.collection('users').findOne({ role: 'candidate' });
  await db.collection('users').updateOne({ _id: demoUser._id }, { $set: { avatar: { key: avatar, url: `https://media.example.com/${avatar}` } } });
  await db.collection('candidates').updateOne({ user: demoUser._id }, { $set: { resume: { key: resume, name: 'cv.pdf' } } });
  await db.collection('applications').updateOne({}, { $set: { 'snapshot.resume.key': snapshot } });
  await db.collection('organizations').updateOne({}, { $set: { logo: { key: logo, url: `https://media.example.com/${logo}` }, documents: [{ file: { key: kyc } }] } });
  await db.collection('messages').updateOne({}, { $set: { attachments: [{ key: chat }] } });
  // Seeding skips blogs without an admin, so a demo blog is added by hand.
  const { insertedId: blogId } = await db.collection('blogs').insertOne({ title: 'demo', coverImage: { key: shared, url: `https://media.example.com/${shared}` } });
  await db.collection('demo_manifest').updateOne({}, { $push: { 'ids.Blog': blogId } });

  const realId = new mongoose.mongo.ObjectId();
  await db.collection('users').insertOne({ _id: realId, role: 'candidate', email: 'real@example.com', avatar: { key: real } });
  await db.collection('candidates').insertOne({ user: realId, resume: { key: real } });
  await db.collection('pages').insertOne({ slug: 'home', html: `<img src="https://media.example.com/${shared}">` });

  // A chat a demo account had with a real user goes, with its messages.
  const conv = new mongoose.mongo.ObjectId();
  await db.collection('conversations').insertOne({ _id: conv, participantIds: [demoUser._id, realId] });
  await db.collection('messages').insertOne({ conversation: conv, sender: realId, body: 'hi' });

  const before = await db.collection('users').countDocuments();
  const dry = await run('remove', '--dry-run');
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /DRY RUN/);
  assert.match(dry.out, /Media files to delete: 6, kept because real records use them: 1/);
  assert.equal(await db.collection('users').countDocuments(), before);
  assert.ok(await exists(avatar));
  assert.ok(await db.collection('demo_manifest').findOne({}));

  const done = await run('remove');
  assert.equal(done.code, 0, done.out);
  assert.match(done.out, /Demo data removed/);

  for (const key of [avatar, resume, snapshot, kyc, logo, chat]) assert.equal(await exists(key), false, `${key} should be deleted`);
  assert.ok(await exists(shared), 'file a live page still uses stays');
  assert.ok(await exists(real), 'real user file stays');

  assert.equal(await db.collection('users').countDocuments({}), 1);
  assert.ok(await db.collection('users').findOne({ _id: realId }));
  assert.ok(await db.collection('candidates').findOne({ user: realId }));
  assert.equal(await db.collection('messages').countDocuments(), 0);
  assert.equal(await db.collection('conversations').countDocuments(), 0);
  assert.equal(await db.collection('demo_manifest').countDocuments(), 0);

  assert.match((await run('remove')).out, /No demo data found/);
});
