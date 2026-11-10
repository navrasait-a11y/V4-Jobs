import { captureError } from './monitoring.js';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import config from '../../config/env.js';
import logger from '../../config/logger.js';
import { createRedisConnection } from '../../config/redis.js';

/**
 * Background job queue.
 *  - With REDIS_URL: BullMQ (durable, retried with exponential back-off).
 *  - Without Redis, or if it is unreachable / out of quota: jobs run in-process on the next tick,
 *    so OTPs and notifications keep flowing (without queue retries).
 * Tuned for Upstash free (500K commands a month): the worker long-polls instead of spinning. New
 * jobs still wake it immediately, so a long drain delay does not delay delivery.
 * Producers only call enqueue(name, data); handlers are registered once at boot.
 */
const QUEUE_NAME = 'freejobwala';
const ADD_TIMEOUT_MS = 2500;
const handlers = new Map();
let queue = null;
let producer = null;
let worker = null;

export function registerJob(name, handler) {
  handlers.set(name, handler);
}

function getQueue() {
  if (!config.queue.enabled) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: (producer = createRedisConnection({ producer: true })),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true, // EmailLog / MessageLog in Mongo are the delivery record
        removeOnFail: { age: 3 * 24 * 3600, count: 500 },
      },
    });
    queue.on('error', (err) => logger.warn({ err: err.message }, 'Queue connection error'));
  }
  return queue;
}

function withTimeout(promise) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('queue add timed out')), ADD_TIMEOUT_MS).unref())]);
}

async function runInline(name, data) {
  const handler = handlers.get(name);
  if (!handler) return logger.warn({ name }, 'No handler registered for job');
  try {
    await handler(data);
  } catch (err) {
    logger.error({ err, name }, 'Inline job failed');
  }
}

export async function enqueue(name, data = {}, opts = {}) {
  const q = getQueue();
  if (q && producer.status === 'ready') {
    try {
      return await withTimeout(q.add(name, data, opts));
    } catch (err) {
      logger.warn({ err: err.message, name }, 'Queue unavailable - running job in-process');
    }
  }
  setImmediate(() => runInline(name, data));
  return null;
}

export async function enqueueBulk(name, items = [], opts = {}) {
  const q = getQueue();
  if (q && producer.status === 'ready') {
    try {
      await withTimeout(q.addBulk(items.map((data) => ({ name, data, opts }))));
      return;
    } catch (err) {
      logger.warn({ err: err.message, name, count: items.length }, 'Queue unavailable - running jobs in-process');
    }
  }
  for (const data of items) setImmediate(() => runInline(name, data));
}

export function startWorker() {
  if (!config.queue.enabled || worker) return null;
  const { concurrency, drainDelaySeconds, stalledIntervalMs } = config.queue;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      try {
        return await handler(job.data);
      } catch (err) {
        // Permanent provider errors (bad request, auth, DLT mismatch) are not retried.
        if (err?.retryable === false) throw new UnrecoverableError(err.message);
        throw err;
      }
    },
    { connection: createRedisConnection(), concurrency, drainDelay: drainDelaySeconds, stalledInterval: stalledIntervalMs, maxStalledCount: 1 },
  );
  worker.on('failed', (job, err) => {
    logger.error({ err, job: job?.name, id: job?.id }, 'Background job failed');
    if (job && job.attemptsMade >= (job.opts?.attempts || 1)) captureError(err, { path: `job:${job.name}` });
  });
  worker.on('error', (err) => logger.warn({ err: err.message }, 'Queue worker error'));
  logger.info({ concurrency }, 'Queue worker started');
  return worker;
}

export async function closeQueue() {
  await Promise.allSettled([worker?.close(), queue?.close()]);
}

/** Queue depth for the admin health panel (null when the in-process fallback is used). */
export async function queueStats() {
  const q = getQueue();
  if (!q || producer?.status !== 'ready') return null;
  return q.getJobCounts('waiting', 'active', 'delayed', 'failed');
}
