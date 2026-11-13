import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import config from './config/env.js';
import logger from './config/logger.js';
import { redisStatus } from './config/redis.js';
import { requestId, sanitizeInput } from './shared/middleware/security.js';
import { apiLimiter } from './shared/middleware/rateLimit.js';
import { notFound, errorHandler } from './shared/middleware/error.js';
import { maintenanceGate } from './shared/middleware/maintenance.js';
import { storageRoot } from './shared/services/storage.service.js';
import routes from './routes.js';
import { paymentWebhook } from './modules/billing/billing.controller.js';

const brandDir = fileURLToPath(new URL('./shared/assets/', import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'extended');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
      customProps: (req) => ({ userId: req.user?._id }),
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { 'img-src': ["'self'", 'data:', 'https:'] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const allowed = new Set(config.corsOrigins);
  app.use(
    cors({
      origin: (origin, cb) => {
        // Mobile apps & server-to-server calls send no Origin header.
        if (!origin || allowed.has(origin) || (!config.isProd && /^http:\/\/localhost:\d+$/.test(origin))) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 86400,
    }),
  );

  // Razorpay webhook needs the raw body for signature verification - must be before express.json().
  app.post(`${config.apiPrefix}/billing/webhooks/razorpay`, express.raw({ type: 'application/json', limit: '1mb' }), paymentWebhook);

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
  app.get('/ready', (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ status: db ? 'ready' : 'not_ready', db, redis: redisStatus() }); // Redis is optional, so it never fails readiness
  });

  // Brand logo for e-mails and invoices: the same file the website shows, served by the API so mail
  // clients always get the right image from a public address (https://<api>/brand/logo.png).
  app.get('/brand/logo.png', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(path.join(brandDir, 'freejobwala-logo.png'));
  });

  // Local storage driver: only the public/ prefix is served statically. Private files use signed URLs.
  if (config.storage.driver === 'local') {
    app.use('/uploads/public', express.static(path.join(storageRoot, 'public'), { maxAge: '30d', index: false, dotfiles: 'deny' }));
  }

  app.use(config.apiPrefix, apiLimiter, maintenanceGate, routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp;
