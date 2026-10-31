import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const R2_ENV = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc123',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_PUBLIC_BUCKET: 'fjw-public',
  R2_PRIVATE_BUCKET: 'fjw-private',
  R2_PUBLIC_URL: 'https://media.example.com/',
};

let storage;
let calls = [];
const original = NodeHttpHandler.prototype.handle;

before(async () => {
  Object.assign(process.env, R2_ENV, {
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:1/x',
    JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'),
    ENCRYPTION_KEY: 'b'.repeat(64),
    REDIS_URL: '',
  });
  // Stops at the HTTP layer, so the real SDK request (host, path, headers) is what gets asserted.
  NodeHttpHandler.prototype.handle = async function handle(request) {
    calls.push(request);
    return { response: { statusCode: request.method === 'DELETE' ? 204 : 200, headers: { etag: '"x"' }, body: Readable.from([Buffer.from('file-bytes')]) } };
  };
  storage = await import('../src/shared/services/storage.service.js');
});

after(() => {
  NodeHttpHandler.prototype.handle = original;
});

const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf', originalname: 'मेरा resume (1).pdf', size: 1 };

test('public file goes to the public bucket and uses the custom domain', async () => {
  calls = [];
  const stored = await storage.putFile({ ...file, mimetype: 'image/png' }, { folder: 'logos' });
  const [req] = calls;
  assert.equal(req.method, 'PUT');
  assert.equal(req.hostname, 'fjw-public.acc123.r2.cloudflarestorage.com');
  assert.equal(req.path, `/${stored.key}`);
  assert.equal(req.headers['content-type'], 'image/png');
  assert.match(req.headers['cache-control'], /immutable/);
  assert.equal(stored.url, `https://media.example.com/${stored.key}`);
  assert.equal(await storage.signedUrl(stored.key), stored.url);
});

test('private file goes to the private bucket with no public URL', async () => {
  calls = [];
  const stored = await storage.putFile(file, { folder: 'resumes', isPrivate: true });
  const [req] = calls;
  assert.equal(req.hostname, 'fjw-private.acc123.r2.cloudflarestorage.com');
  assert.equal(stored.url, null);
  assert.match(req.headers['content-disposition'], /^attachment; filename\*=UTF-8''/);
  assert.ok(!/[()]/.test(req.headers['content-disposition'].split("''")[1]));
  assert.ok(!Object.keys(req.headers).some((h) => h.includes('checksum')), 'optional checksums stay off');
});

test('signed URL points at the private bucket and expires', async () => {
  const url = new URL(await storage.signedUrl('private/resumes/a.pdf', 900, 'My CV.pdf'));
  assert.equal(url.hostname, 'fjw-private.acc123.r2.cloudflarestorage.com');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
  assert.ok(url.searchParams.get('X-Amz-Signature'));
  assert.ok(url.searchParams.get('X-Amz-Credential').includes('/auto/s3/'));
  assert.equal(url.searchParams.get('response-content-disposition'), "attachment; filename*=UTF-8''My%20CV.pdf");
  assert.equal(url.searchParams.get('x-amz-checksum-mode'), null);
});

test('read and delete use the bucket of the key', async () => {
  calls = [];
  assert.equal((await storage.readFile('private/kyc/a.pdf')).toString(), 'file-bytes');
  await storage.deleteFile('public/logos/a.png');
  assert.equal(calls[0].hostname, 'fjw-private.acc123.r2.cloudflarestorage.com');
  assert.equal(calls[1].hostname, 'fjw-public.acc123.r2.cloudflarestorage.com');
  assert.equal(calls[1].method, 'DELETE');
});

test('migration copies files and rewrites stored URLs safely', async () => {
  const mem = await MongoMemoryServer.create();
  const client = await new mongoose.mongo.MongoClient(mem.getUri()).connect();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fjw-migrate-'));
  try {
    const logo = 'public/logos/2026/10/a.png';
    const resume = 'private/resumes/2026/10/b.pdf';
    for (const key of [logo, resume]) {
      await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
      await fs.writeFile(path.join(root, key), 'x');
    }
    const db = client.db('migrate_test');
    const id = new mongoose.mongo.ObjectId();
    const when = new Date('2026-01-01');
    await db.collection('organizations').insertOne({
      owner: id,
      updatedAt: when,
      logo: { key: logo, url: `http://localhost:5000/uploads/${logo}` },
      gone: { key: 'public/logos/gone.png', url: 'http://localhost:5000/uploads/public/logos/gone.png' },
      site: 'https://example.com/uploads/public/not-ours.png',
    });
    await db.collection('pages').insertOne({ html: `<img src="http://127.0.0.1:5000/uploads/${logo}" alt="">` });
    await db.collection('candidates').insertOne({ resume: { key: resume, url: null } });
    await fs.writeFile(path.join(root, 'public/logos/2026/10/orphan.png'), 'x');
    const { migrateUploads } = await import('../scripts/migrate-uploads-r2.js');
    const args = { db, root, publicUrl: 'https://media.example.com' };

    calls = [];
    const dry = await migrateUploads(args);
    assert.equal(dry.documents, 2);
    assert.equal(calls.length, 0);
    assert.match((await db.collection('pages').findOne()).html, /127\.0\.0\.1/);

    const done = await migrateUploads({ ...args, apply: true });
    assert.equal(done.copied, 2);
    assert.equal(done.skipped, 1, 'a file no record uses is not copied');
    assert.deepEqual(calls.map((c) => c.hostname).sort(), ['fjw-private.acc123.r2.cloudflarestorage.com', 'fjw-public.acc123.r2.cloudflarestorage.com']);
    const png = calls.find((c) => c.path.endsWith('.png'));
    assert.equal(png.headers['content-type'], 'image/png');

    const org = await db.collection('organizations').findOne();
    assert.equal(org.logo.url, `https://media.example.com/${logo}`);
    assert.equal(org.logo.key, logo);
    assert.equal(org.gone.url, 'http://localhost:5000/uploads/public/logos/gone.png', 'a file we cannot copy keeps its URL');
    assert.equal(org.site, 'https://example.com/uploads/public/not-ours.png');
    assert.ok(org.owner.equals(id));
    assert.deepEqual(org.updatedAt, when);
    assert.equal((await db.collection('pages').findOne()).html, `<img src="https://media.example.com/${logo}" alt="">`);
    assert.deepEqual(done.missing.sort(), ['public/logos/gone.png']);

    assert.equal((await migrateUploads({ ...args, apply: true })).documents, 0, 'second run changes nothing');
  } finally {
    await client.close();
    await mem.stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

const boot = (extra) =>
  spawnSync(process.execPath, ['-e', "import('./src/config/env.js')"], {
    env: { ...process.env, ...R2_ENV, NODE_ENV: 'test', ...extra },
    encoding: 'utf8',
  });

test('config refuses unsafe storage settings', () => {
  assert.equal(boot({}).status, 0);
  assert.match(boot({ R2_PRIVATE_BUCKET: 'fjw-public' }).stderr, /must be different buckets/);
  assert.match(boot({ R2_PUBLIC_URL: '' }).stderr, /R2_PUBLIC_URL is required/);
  assert.match(boot({ R2_PUBLIC_URL: 'http://media.example.com' }).stderr, /R2_PUBLIC_URL/);
  const prod = boot({ NODE_ENV: 'production', STORAGE_DRIVER: 'local', EMAIL_PROVIDER: 'console', SMS_PROVIDER: 'console' });
  assert.match(prod.stderr, /STORAGE_DRIVER must be r2 in production/);
});
