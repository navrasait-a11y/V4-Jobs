import mongoose from 'mongoose';
import config, { configWarnings } from '../../config/env.js';
import { redisStatus } from '../../config/redis.js';
import { queueStats } from '../../shared/services/queue.service.js';
import { EmailLog, MessageLog } from '../notifications/notification.model.js';
import { LoginAttempt } from '../auth/auth.models.js';

const DAY = 24 * 3600 * 1000;

/**
 * PRD "Platform health monitoring" + "Monitoring & Threat Detection": service status, queue depth,
 * delivery failures, login abuse and missing configuration in one call.
 */
export async function systemHealth() {
  const since = new Date(Date.now() - DAY);
  const started = Date.now();
  const dbPingMs = await mongoose.connection.db
    .admin()
    .ping()
    .then(() => Date.now() - started)
    .catch(() => null);
  const [queue, emailByStatus, msgByChannel, logins, topFailedIps] = await Promise.all([
    queueStats().catch(() => null),
    EmailLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    MessageLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { channel: '$channel', status: '$status' }, n: { $sum: 1 } } }]),
    LoginAttempt.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$success', n: { $sum: 1 } } }]),
    LoginAttempt.aggregate([
      { $match: { createdAt: { $gte: since }, success: false, ip: { $ne: null } } },
      { $group: { _id: '$ip', n: { $sum: 1 } } },
      { $match: { n: { $gte: 10 } } },
      { $sort: { n: -1 } },
      { $limit: 5 },
    ]),
  ]);
  const mem = process.memoryUsage();
  const messages = {};
  for (const m of msgByChannel) {
    messages[m._id.channel] = messages[m._id.channel] || {};
    messages[m._id.channel][m._id.status || 'unknown'] = m.n;
  }
  return {
    checkedAt: new Date(),
    services: {
      database: { ok: dbPingMs !== null, pingMs: dbPingMs },
      redis: { status: redisStatus(), ok: ['ready', 'disabled'].includes(redisStatus()) },
      queue: queue ? { ok: true, ...queue } : { ok: true, mode: 'in-process (no Redis queue)' },
      storage: { ok: true, driver: config.storage.driver },
    },
    providers: {
      email: config.email?.provider || 'console',
      sms: config.sms.provider === 'apitxt' ? `apitxt (OTP: ${config.sms.apitxt.otpMode}, ${config.sms.apitxt.otpChannel})` : config.sms.provider,
      whatsapp: config.whatsapp.provider,
      push: config.firebaseServiceAccount ? 'firebase' : 'not configured',
      payments: config.razorpay?.keyId ? 'razorpay' : 'not configured',
    },
    last24h: {
      emails: Object.fromEntries(emailByStatus.map((e) => [e._id || 'unknown', e.n])),
      messages,
      logins: { success: logins.find((l) => l._id === true)?.n || 0, failed: logins.find((l) => l._id === false)?.n || 0 },
      suspiciousIps: topFailedIps.map((i) => ({ ip: i._id, failedLogins: i.n })),
    },
    process: {
      env: config.env,
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
    },
    warnings: configWarnings(),
  };
}
