/**
 * Isolated stack for the browser end-to-end tests (frontend/e2e):
 *   in-memory MongoDB -> master data seed -> demo data -> API on E2E_API_PORT (default 5055)
 * Nothing touches a real database. OTPs are fixed (OTP_DEV_BYPASS) and SMS / e-mail are only logged.
 * Usage: node scripts/e2e-stack.js   (Playwright starts it automatically)
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env.E2E_API_PORT || '5055';
const webOrigin = process.env.E2E_WEB_ORIGIN || 'http://localhost:3055';

const mongo = await MongoMemoryServer.create();
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: apiPort,
  MONGODB_URI: `${mongo.getUri()}freejobwala_e2e`,
  WEB_URL: webOrigin,
  CORS_ORIGINS: webOrigin,
  OTP_DEV_BYPASS: 'true',
  STORAGE_DRIVER: 'local',
  SMS_PROVIDER: 'console',
  EMAIL_PROVIDER: 'console',
  WHATSAPP_PROVIDER: 'console',
  REDIS_URL: '',
  REDIS_QUEUE_ENABLED: 'false',
  RUN_SCHEDULER: 'false',
  SENTRY_DSN: '',
  ATLAS_SEARCH_INDEX: '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
  DEMO_PASSWORD: process.env.DEMO_PASSWORD || `E2e-${crypto.randomBytes(9).toString('base64url')}`,
  // Throwaway admin for the admin-panel tests; it only ever exists in this in-memory database.
  SEED_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'e2e.admin@example.test',
  SEED_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Local-1',
};

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited with ${code}`))));
  });

const proc = { api: null };
const stop = async () => {
  proc.api?.kill();
  await mongo.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  await run(['scripts/seed.js']);
  await run(['scripts/demo-data.js', 'seed']);
  await run(['scripts/create-admin.js']);
} catch (err) {
  console.error('[e2e] seeding failed:', err.message);
  await mongo.stop();
  process.exit(1);
}
proc.api = spawn(process.execPath, ['src/server.js'], { cwd: root, env, stdio: 'inherit' });
proc.api.on('exit', async (code) => {
  await mongo.stop().catch(() => {});
  process.exit(code ?? 0);
});
console.log(`[e2e] API on http://localhost:${apiPort} (in-memory MongoDB)`);
