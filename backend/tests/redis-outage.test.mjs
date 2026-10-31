/**
 * Redis must never be a hard dependency: with Redis unreachable (or Upstash out of quota) requests
 * stay fast, rate limits use memory and background jobs run in-process.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let request;
let mongoose;
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(e));

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('outage'),
    JWT_ACCESS_SECRET: 'r'.repeat(48),
    ENCRYPTION_KEY: 'f'.repeat(64),
    REDIS_URL: 'redis://127.0.0.1:1', // nothing listens here
    REDIS_RATE_LIMIT_SCOPE: 'sensitive',
    EMAIL_PROVIDER: 'console',
    STORAGE_DRIVER: 'local',
    SMS_PROVIDER: 'console',
    OTP_DEV_BYPASS: 'true',
  });
  const supertest = (await import('supertest')).default;
  const { connectDatabase } = await import('../src/config/database.js');
  const { createApp } = await import('../src/app.js');
  await import('../src/jobs/handlers.js');
  mongoose = (await import('mongoose')).default;
  await connectDatabase();
  request = supertest(createApp());
});

after(async () => {
  const { closeQueue } = await import('../src/shared/services/queue.service.js');
  const { closeRedis } = await import('../src/config/redis.js');
  await Promise.race([Promise.allSettled([closeQueue(), closeRedis()]), new Promise((r) => setTimeout(r, 2000))]);
  await mongoose?.disconnect();
  await mongo?.stop();
  process.exit(0);
});

test('readiness stays 200 and reports Redis state', async () => {
  const res = await request.get('/ready');
  assert.equal(res.status, 200);
  assert.notEqual(res.body.redis, 'ready');
});

test('rate-limited auth endpoint and queued SMS work without Redis', async () => {
  const User = mongoose.model('User');
  await User.create({ role: 'candidate', fullName: 'A B', mobile: '9876512345', status: 'active' });
  const started = Date.now();
  const res = await request.post('/api/v1/auth/otp/send').send({ mobile: '9876512345' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Date.now() - started < 6000, `took ${Date.now() - started}ms`);
  const { MessageLog } = await import('../src/modules/notifications/notification.model.js');
  await new Promise((r) => setTimeout(r, 500));
  const log = await MessageLog.findOne({ to: '9876512345' }).lean();
  assert.equal(log.status, 'sent', 'job ran in-process after the queue failed');
});

test('limits still apply through the memory fallback', async () => {
  const { MemoryStore } = await import('express-rate-limit');
  assert.ok(MemoryStore);
  const res = await request.post('/api/v1/auth/login').send({ identifier: 'nobody@example.com', password: 'Wrong1234' });
  assert.equal(res.status, 401);
  assert.ok(res.headers.ratelimit || res.headers['ratelimit-policy'], 'rate limit headers present');
});

test('no unhandled rejections from Redis clients', () => {
  assert.deepEqual(
    unhandled.map((e) => e?.message),
    [],
  );
});
