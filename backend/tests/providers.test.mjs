/**
 * Brevo (e-mail) + APITxT (SMS) integration tests against a local mock of both provider APIs.
 * Verifies request format, success / error handling, retry classification, idempotency and webhooks.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let server;
let base;
const calls = [];
let nextResponse = null; // { status, body } override for the next provider call

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const call = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      calls.push(call);
      const r = nextResponse;
      nextResponse = null;
      let status = 200;
      let body = { status: 200, message: 'success', request_id: 'SMS_test123' };
      if (req.url.startsWith('/v3/smtp/email')) {
        status = 201;
        body = { messageId: '<202610291200.12345@smtp-relay.mailin.fr>' };
      }
      if (req.url.startsWith('/api/sendOTP')) body = { status: 'success', message: 'Sms OTP Sent Successfully', data: { request_id: 'SMS-OTP-1' } };
      if (r) ({ status, body } = r);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('providers'),
    JWT_ACCESS_SECRET: 'p'.repeat(48),
    ENCRYPTION_KEY: 'e'.repeat(64),
    REDIS_URL: '',
    EMAIL_PROVIDER: 'brevo',
    STORAGE_DRIVER: 'local',
    BREVO_API_KEY: 'xkeysib-test',
    BREVO_API_URL: `${base}/v3`,
    BREVO_WEBHOOK_TOKEN: 'hook-secret',
    MAIL_FROM_EMAIL: 'no-reply@freejobwala.com',
    MAIL_FROM_NAME: 'Freejobwala',
    MAIL_REPLY_TO: 'support@freejobwala.com',
    SMS_PROVIDER: 'apitxt',
    APITXT_BASE_URL: base,
    APITXT_AUTH_KEY: 'auth-key-1',
    APITXT_API_KEY: 'bearer-key-1',
    APITXT_SENDER_ID: 'FJWALA',
    APITXT_PE_ID: '1201160000000000000',
    APITXT_ROUTE: '4',
    APITXT_TEMPLATE_OTP: '1707160000000000001',
    APITXT_TEMPLATE_INTERVIEW: '',
  });
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();
});

after(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongo?.stop();
  server?.close();
});

test('Brevo: transactional e-mail request format + EmailLog sent', async () => {
  const { deliverEmail } = await import('../src/shared/services/channels.js');
  const { EmailLog } = await import('../src/modules/notifications/notification.model.js');
  calls.length = 0;
  await deliverEmail({ to: 'Ravi <ravi@example.com>', subject: 'Hello', html: '<p>Hi</p>', category: 'otp', template: 'otp' });
  const c = calls[0];
  assert.equal(c.url, '/v3/smtp/email');
  assert.equal(c.headers['api-key'], 'xkeysib-test');
  assert.deepEqual(c.body.sender, { email: 'no-reply@freejobwala.com', name: 'Freejobwala' });
  assert.deepEqual(c.body.to, [{ email: 'ravi@example.com', name: 'Ravi' }]);
  assert.equal(c.body.subject, 'Hello');
  assert.equal(c.body.htmlContent, '<p>Hi</p>');
  assert.deepEqual(c.body.replyTo, { email: 'support@freejobwala.com' });
  assert.deepEqual(c.body.tags, ['otp', 'otp']);
  const log = await EmailLog.findOne({ to: 'Ravi <ravi@example.com>' }).lean();
  assert.equal(log.status, 'sent');
  assert.equal(log.provider, 'brevo');
  assert.equal(log.messageId, '<202610291200.12345@smtp-relay.mailin.fr>');
});

test('Brevo: 400 is permanent (no retry), 5xx is retryable, sent log is never re-sent', async () => {
  const { deliverEmail } = await import('../src/shared/services/channels.js');
  const { EmailLog } = await import('../src/modules/notifications/notification.model.js');
  nextResponse = { status: 400, body: { code: 'invalid_parameter', message: 'sender is invalid' } };
  await assert.rejects(deliverEmail({ to: 'a@b.com', subject: 'x', html: 'x' }), (err) => err.retryable === false && /invalid_parameter/.test(err.message));
  nextResponse = { status: 503, body: { message: 'unavailable' } };
  await assert.rejects(deliverEmail({ to: 'c@d.com', subject: 'x', html: 'x' }), (err) => err.retryable === true);
  const failed = await EmailLog.findOne({ to: 'c@d.com' });
  assert.equal(failed.status, 'failed');
  // retry of the same job succeeds and updates the same log
  await deliverEmail({ to: 'c@d.com', subject: 'x', html: 'x', logId: String(failed._id) });
  assert.equal((await EmailLog.findById(failed._id)).status, 'sent');
  calls.length = 0;
  await deliverEmail({ to: 'c@d.com', subject: 'x', html: 'x', logId: String(failed._id) });
  assert.equal(calls.length, 0, 'already sent -> not sent again');
});

test('Brevo webhook: token check + delivery status update', async () => {
  const supertest = (await import('supertest')).default;
  const { createApp } = await import('../src/app.js');
  const { EmailLog } = await import('../src/modules/notifications/notification.model.js');
  const app = supertest(createApp());
  const bad = await app.post('/api/v1/webhooks/brevo?token=wrong').send({ event: 'delivered', 'message-id': 'x' });
  assert.equal(bad.status, 401);
  const id = '<202610291200.12345@smtp-relay.mailin.fr>';
  const ok = await app.post('/api/v1/webhooks/brevo?token=hook-secret').send([
    { event: 'delivered', 'message-id': id, date: '2026-10-29 12:00:01' },
    { event: 'request', 'message-id': id },
  ]);
  assert.equal(ok.status, 200);
  const log = await EmailLog.findOne({ messageId: id }).lean();
  assert.equal(log.status, 'delivered', 'late "request" event does not downgrade');
  await app.post('/api/v1/webhooks/brevo?token=hook-secret').send({ event: 'hard_bounce', 'message-id': id, reason: 'mailbox does not exist' });
  const bounced = await EmailLog.findOne({ messageId: id }).lean();
  assert.equal(bounced.status, 'bounced');
  assert.match(bounced.error, /mailbox/);
});

test('APITxT: OTP SMS uses DLT template + Bearer auth + MessageLog', async () => {
  const { sendSms } = await import('../src/modules/notifications/notification.service.js');
  const { deliverSms } = await import('../src/shared/services/channels.js');
  const { MessageLog } = await import('../src/modules/notifications/notification.model.js');
  calls.length = 0;
  await deliverSms({ to: '+91 98765 43210', template: 'otp', vars: { otp: '482913', minutes: 5 } });
  const c = calls[0];
  assert.equal(c.url, '/api/sendMsg');
  assert.equal(c.headers.authorization, 'Bearer bearer-key-1');
  assert.deepEqual(c.body, {
    authkey: 'auth-key-1',
    mobiles: '9876543210',
    message: '482913 is your Freejobwala verification code. Valid for 5 minutes. Do not share this code with anyone.',
    sender: 'FJWALA',
    route: '4',
    template_id: '1707160000000000001',
    pe_id: '1201160000000000000',
  });
  const log = await MessageLog.findOne({ to: '+91 98765 43210' }).lean();
  assert.equal(log.status, 'sent');
  assert.equal(log.providerId, 'SMS_test123');
  // queued path creates the log first and reuses it
  const queued = await sendSms('9876500000', { template: 'otp', vars: { otp: '111111', minutes: 5 } });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await MessageLog.findById(queued._id)).status, 'sent');
});

test('APITXT: business error and missing template are permanent failures', async () => {
  const { deliverSms } = await import('../src/shared/services/channels.js');
  const { MessageLog } = await import('../src/modules/notifications/notification.model.js');
  nextResponse = { status: 200, body: { status: 'error', message: 'Template ID does not match DLT' } };
  await assert.rejects(
    deliverSms({ to: '9876511111', template: 'otp', vars: { otp: '1', minutes: 5 } }),
    (err) => err.retryable === false && /DLT/.test(err.message),
  );
  calls.length = 0;
  await assert.rejects(
    deliverSms({ to: '9876522222', template: 'interview', vars: { jobTitle: 'Dev' } }),
    (err) => err.retryable === false && /template_id missing/.test(err.message),
  );
  assert.equal(calls.length, 0, 'nothing sent without an approved template');
  assert.equal((await MessageLog.findOne({ to: '9876522222' })).status, 'failed');
  nextResponse = { status: 502, body: 'Bad gateway' };
  await assert.rejects(deliverSms({ to: '9876533333', template: 'otp', vars: { otp: '1', minutes: 5 } }), (err) => err.retryable === true);
});

test('APITXT: managed OTP API client', async () => {
  const { sendApitxtOtp } = await import('../src/shared/services/providers/apitxt.js');
  calls.length = 0;
  const r = await sendApitxtOtp({ to: '9876543210', otp: '4521' });
  assert.equal(r.providerId, 'SMS-OTP-1');
  assert.deepEqual(calls[0].body, { authkey: 'auth-key-1', mobile: '919876543210', otp: '4521', channel: 'sms' });
});

test('SMS template text override from admin settings', async () => {
  const { setSetting } = await import('../src/modules/settings/settings.service.js');
  const { resolveSmsTemplate } = await import('../src/shared/services/smsTemplates.js');
  await setSetting('integrations.smsTemplates', { otp: { text: 'Dear user, {{otp}} is your OTP for Freejobwala.' } });
  const t = await resolveSmsTemplate('otp', { otp: '999000' });
  assert.equal(t.message, 'Dear user, 999000 is your OTP for Freejobwala.');
  assert.equal(t.templateId, '1707160000000000001');
});
