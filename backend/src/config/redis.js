import { Redis } from 'ioredis';
import config from './env.js';
import logger from './logger.js';

/**
 * Redis (Upstash in production) is an optimisation, never a hard dependency:
 * rate limits fall back to memory and queue jobs run in-process when it is down or out of quota.
 * Use the TCP URL with TLS: rediss://default:<password>@<host>.upstash.io:6379
 */
let client = null;
let lastErrorLog = 0;

/** Repeated connection failures would flood the logs - report at most once a minute. */
function logRedisError(err) {
  if (Date.now() - lastErrorLog < 60 * 1000) return;
  lastErrorLog = Date.now();
  logger.error({ err: err.message }, 'Redis error');
}

const baseOptions = {
  connectTimeout: 10000,
  keepAlive: 30000,
  retryStrategy: (attempt) => Math.min(attempt * 500, 30000),
};

/** Shared client for rate limiting: fails fast so a Redis problem never delays a request. */
export function getRedis() {
  if (!config.redis.url) return null;
  if (!client) {
    client = new Redis(config.redis.url, { ...baseOptions, maxRetriesPerRequest: 1 });
    client.on('error', logRedisError);
    client.on('ready', () => logger.info('Redis connected'));
  }
  return client;
}

/**
 * Dedicated connections:
 *  - blocking: BullMQ worker / pub-sub (BullMQ requires maxRetriesPerRequest=null)
 *  - producer: queue.add() from API requests, fails immediately when Redis is unreachable
 */
export function createRedisConnection({ producer = false } = {}) {
  if (!config.redis.url) return null;
  const conn = new Redis(config.redis.url, {
    ...baseOptions,
    maxRetriesPerRequest: producer ? 1 : null,
    enableOfflineQueue: !producer,
  });
  conn.on('error', logRedisError);
  return conn;
}

export const redisStatus = () => (config.redis.url ? client?.status || 'idle' : 'disabled');

export async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}
