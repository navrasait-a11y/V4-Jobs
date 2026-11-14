/**
 * Admin "login as": the user's session lives on its own (refresh token in the body), never touches
 * the admin's login cookie, survives refreshes, and cannot change how the owner signs in or pay.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let mongoose;
let app;
const ctx = {};
const api = '/api/v1';
const WEB = 'http://localhost:3000';

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: `${mongo.getUri()}freejobwala_imp`, JWT_ACCESS_SECRET: 'test-secret-'.padEnd(48, 'x'), ENCRYPTION_KEY: 'c'.repeat(64), REDIS_URL: '', STORAGE_DRIVER: 'local', WEB_URL: WEB, CORS_ORIGINS: WEB });
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/database.js')).connectDatabase();
  app = (await import('../src/app.js')).createApp();
  const User = (await import('../src/modules/users/user.model.js')).default;
  const Candidate = (await import('../src/modules/candidates/candidate.model.js')).default;
  const { issueTokens } = await import('../src/modules/auth/token.service.js');
  const fakeReq = { get: () => undefined, headers: {}, ip: '127.0.0.1' };
  ctx.admin = await User.create({ role: 'super_admin', fullName: 'Root', email: 'root@imp.test', status: 'active' });
  ctx.candidate = await User.create({ role: 'candidate', fullName: 'Asha', email: 'asha@imp.test', mobile: '9811199001', status: 'active' });
  await Candidate.create({ user: ctx.candidate._id });
  ctx.adminTokens = await issueTokens(ctx.admin, fakeReq);
});
after(async () => {
  await mongoose?.disconnect();
  await mongo?.stop();
});

const bearer = (t) => ({ authorization: `Bearer ${t}` });

test('login as returns a separate 2-hour session for the user', async () => {
  const res = await request(app).post(`${api}/admin/users/${ctx.candidate._id}/impersonate`).set(bearer(ctx.adminTokens.accessToken));
  assert.equal(res.status, 200);
  assert.equal(res.headers['set-cookie'], undefined, 'the admin login cookie is left alone');
  ctx.imp = res.body.data.tokens;
  assert.ok(ctx.imp.accessToken && ctx.imp.refreshToken);
  const me = await request(app).get(`${api}/auth/me`).set(bearer(ctx.imp.accessToken));
  assert.equal(me.body.data.user.email, 'asha@imp.test');
  assert.equal(String(me.body.data.impersonatedBy), String(ctx.admin._id));
  const hours = (new Date(ctx.imp.refreshExpiresAt) - Date.now()) / 3600000;
  assert.ok(hours > 1.9 && hours <= 2, 'ends after 2 hours');
});

test('refreshing with the token in the body keeps the admin cookie and keeps the admin marker', async () => {
  const res = await request(app).post(`${api}/auth/refresh`).set('origin', WEB).send({ refreshToken: ctx.imp.refreshToken });
  assert.equal(res.status, 200);
  assert.equal(res.headers['set-cookie'], undefined, 'no cookie for body-token clients');
  ctx.imp = { ...ctx.imp, ...res.body.data.tokens };
  const me = await request(app).get(`${api}/auth/me`).set(bearer(ctx.imp.accessToken));
  assert.equal(me.body.data.user.email, 'asha@imp.test');
  assert.ok(me.body.data.impersonatedBy, 'still marked as an admin session after a refresh');
});

test('sensitive actions are blocked while logged in as the user', async () => {
  const t = bearer(ctx.imp.accessToken);
  const blocked = [
    request(app).post(`${api}/auth/password/change`).set(t).send({ currentPassword: 'x', newPassword: 'Newpass123' }),
    request(app).post(`${api}/auth/2fa/disable`).set(t).send({ code: '123456' }),
    request(app).post(`${api}/candidates/me/deactivate`).set(t).send({}),
    request(app).delete(`${api}/candidates/me`).set(t).send({}),
    request(app).post(`${api}/billing/wallet/topup`).set(t).send({ amount: 500 }),
  ];
  for (const res of await Promise.all(blocked)) {
    assert.equal(res.status, 403, res.req.path);
    assert.equal(res.body.error.code, 'IMPERSONATION_FORBIDDEN');
  }
  const profile = await request(app).patch(`${api}/candidates/me`).set(t).send({ displayName: 'Asha R' });
  assert.equal(profile.status, 200, 'normal profile edits are allowed');
});

test('ending the session does not sign the admin out', async () => {
  const res = await request(app).post(`${api}/auth/logout`).set(bearer(ctx.imp.accessToken)).set('origin', WEB).set('cookie', `fjw_rt=${ctx.adminTokens.refreshToken}`).send({});
  assert.equal(res.status, 200);
  assert.ok(!(res.headers['set-cookie'] || []).some((c) => /^fjw_rt=;/.test(c)), 'admin cookie not cleared');
  const after = await request(app).post(`${api}/auth/refresh`).set('origin', WEB).send({ refreshToken: ctx.imp.refreshToken });
  assert.equal(after.status, 401, 'the user session is gone');
  const admin = await request(app).post(`${api}/auth/refresh`).set('origin', WEB).set('cookie', `fjw_rt=${ctx.adminTokens.refreshToken}`).send({});
  assert.equal(admin.status, 200, 'the admin is still signed in');
});

test('login as a candidate imported from Excel survives a refresh', async () => {
  const { importCandidates } = await import('../src/modules/admin/admin.users.service.js');
  const { buildTemplateFile } = await import('../src/modules/imports/importTemplates.js');
  const { buffer } = await buildTemplateFile('candidates');
  const r = await importCandidates(ctx.admin, buffer, { mode: 'create' });
  assert.equal(r.created, 2, JSON.stringify(r.errors));
  const User = (await import('../src/modules/users/user.model.js')).default;
  const imported = await User.findOne({ email: 'asha.verma@example.com' });
  const res = await request(app).post(`${api}/admin/users/${imported._id}/impersonate`).set(bearer(ctx.adminTokens.accessToken));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const tokens = res.body.data.tokens;
  const refreshed = await request(app).post(`${api}/auth/refresh`).set('origin', WEB).send({ refreshToken: tokens.refreshToken });
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
  const me = await request(app).get(`${api}/auth/me`).set(bearer(refreshed.body.data.tokens.accessToken));
  assert.equal(me.status, 200, JSON.stringify(me.body));
});
