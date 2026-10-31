import config from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { startWorker, closeQueue } from './shared/services/queue.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import './jobs/handlers.js';

/**
 * Dedicated background worker (optional): run with RUN_WORKERS=false / RUN_SCHEDULER=false on the
 * API instances and scale this process independently for heavy e-mail / notification traffic.
 */
async function main() {
  if (!config.queue.enabled) {
    logger.fatal('REDIS_URL with REDIS_QUEUE_ENABLED=true is required for the standalone worker');
    process.exit(1);
  }
  await connectDatabase();
  startWorker();
  if (process.env.WORKER_RUN_SCHEDULER === 'true') startScheduler();
  const stop = async () => {
    stopScheduler();
    await closeQueue();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  logger.info('Worker started');
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
