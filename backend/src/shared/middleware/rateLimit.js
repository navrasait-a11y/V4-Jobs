import { rateLimit, ipKeyGenerator, MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../../config/redis.js';
import config from '../../config/env.js';
import ApiError from '../errors/ApiError.js';

const REDIS_TIMEOUT_MS = 1500;
const SENSITIVE = new Set(['auth', 'otp', 'form']);

const withTimeout = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), REDIS_TIMEOUT_MS).unref())]);

/** Redis-backed counter that falls back to in-process memory when Redis is down or out of quota. */
class ResilientStore {
  constructor(redisStore, prefix, client) {
    this.redis = redisStore;
    this.client = client;
    this.memory = new MemoryStore();
    this.prefix = `rl:${prefix}:`;
    this.localKeys = false;
  }

  init(options) {
    this.memory.init(options);
    // Script loading fails while Redis is down; the store reloads scripts itself on the next increment.
    Promise.resolve(this.redis.init?.(options)).catch(() => {});
  }

  get available() {
    return this.client.status === 'ready'; // skip the timeout entirely during an outage
  }

  async increment(key) {
    if (!this.available) return this.memory.increment(key);
    try {
      return await withTimeout(this.redis.increment(key));
    } catch {
      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    if (!this.available) return this.memory.decrement(key);
    await withTimeout(this.redis.decrement(key)).catch(() => this.memory.decrement(key));
  }

  async resetKey(key) {
    if (!this.available) return this.memory.resetKey(key);
    await withTimeout(this.redis.resetKey(key)).catch(() => this.memory.resetKey(key));
  }
}

/**
 * Every Redis-backed request costs a command, and Upstash free allows 500K a month. By default only
 * abuse-sensitive limits are shared across instances; the rest are per-instance memory counters.
 */
function store(prefix) {
  const { rateLimitScope } = config.redis;
  if (rateLimitScope === 'none' || (rateLimitScope === 'sensitive' && !SENSITIVE.has(prefix))) return undefined;
  const redis = getRedis();
  if (!redis) return undefined; // in-memory store (single instance / dev)
  return new ResilientStore(new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => redis.call(...args) }), prefix, redis);
}

function limiter(prefix, { windowMs, limit, keyByUser = false, message }) {
  return rateLimit({
    windowMs,
    limit: config.isTest ? 10000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: store(prefix),
    keyGenerator: (req) => (keyByUser && req.user ? `u:${req.user._id}` : ipKeyGenerator(req.ip)),
    handler: (_req, _res, next) => next(ApiError.tooMany(message)),
  });
}

/** Global API limiter - generous, protects against floods / scraping. */
export const apiLimiter = limiter('api', { windowMs: 60 * 1000, limit: 300 });

/** Help assistant - each message runs job search or matching. */
export const assistantLimiter = limiter('assistant', { windowMs: 60 * 1000, limit: 20, keyByUser: true });

/** Credential endpoints - slows brute force / credential stuffing. */
export const authLimiter = limiter('auth', {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: 'Too many authentication attempts. Please try again after 15 minutes',
});

/** OTP sending - protects SMS/WhatsApp spend. */
export const otpLimiter = limiter('otp', { windowMs: 60 * 60 * 1000, limit: 10, message: 'OTP request limit reached. Try again later' });

/** Public forms (contact, enquiry, guest apply, reports). */
export const formLimiter = limiter('form', { windowMs: 60 * 60 * 1000, limit: 30 });

/** Heavy endpoints (exports, bulk operations, resume search) keyed by user. */
export const heavyLimiter = limiter('heavy', { windowMs: 60 * 1000, limit: 30, keyByUser: true });

export const uploadLimiter = limiter('upload', { windowMs: 60 * 60 * 1000, limit: 100, keyByUser: true });
