import http from 'node:http';
import config from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { getRedis, closeRedis } from './config/redis.js';
import { createApp } from './app.js';
import { initSocket, closeSocket } from './shared/realtime/socket.js';
import { startWorker, closeQueue } from './shared/services/queue.service.js';
import { registerChatSocket } from './modules/chat/chat.socket.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import './jobs/handlers.js';
import { captureError, flushMonitoring, initMonitoring } from './shared/services/monitoring.js';

async function bootstrap() {
  await initMonitoring();
  await connectDatabase();
  getRedis();

  const app = createApp();
  const server = http.createServer(app);
  server.keepAliveTimeout = 65000; // > typical load balancer idle timeout
  server.headersTimeout = 66000;

  initSocket(server);
  registerChatSocket();
  if (config.runWorkers) startWorker();
  if (config.runScheduler) startScheduler();

  server.listen(config.port, () => logger.info(`${config.appName} API listening on :${config.port} (${config.env}) - prefix ${config.apiPrefix}`));

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');
    const force = setTimeout(() => process.exit(1), 25000).unref();
    server.close();
    stopScheduler();
    await Promise.allSettled([closeSocket(), closeQueue()]);
    await Promise.allSettled([disconnectDatabase(), closeRedis(), flushMonitoring()]);
    clearTimeout(force);
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled promise rejection');
    captureError(err);
  });
  process.on('uncaughtException', (err) => {
    captureError(err);
    logger.fatal({ err }, 'Uncaught exception - shutting down');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
