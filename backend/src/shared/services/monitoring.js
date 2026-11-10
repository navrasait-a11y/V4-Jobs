import config from '../../config/env.js';
import logger from '../../config/logger.js';

/**
 * Error monitoring (Sentry). Off unless SENTRY_DSN is set, and the SDK is only loaded then.
 * Request bodies, cookies and auth headers are never sent.
 */
let sentry = null;

export async function initMonitoring() {
  if (!config.sentry.dsn) return false;
  try {
    sentry = await import('@sentry/node');
    sentry.init({
      dsn: config.sentry.dsn,
      environment: config.sentry.environment || config.env,
      release: config.sentry.release || undefined,
      tracesSampleRate: config.sentry.tracesSampleRate,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            for (const h of ['authorization', 'cookie', 'x-api-key']) delete event.request.headers[h];
          }
        }
        return event;
      },
    });
    logger.info('Error monitoring enabled (Sentry)');
    return true;
  } catch (err) {
    sentry = null;
    logger.warn({ err: err.message }, 'Sentry could not start; errors are only logged');
    return false;
  }
}

/** Reports an unexpected error with safe request context. No-op when monitoring is off. */
export function captureError(err, context = {}) {
  if (!sentry) return;
  try {
    sentry.withScope((scope) => {
      if (context.requestId) scope.setTag('request_id', context.requestId);
      if (context.path) scope.setTag('path', context.path);
      if (context.method) scope.setTag('method', context.method);
      if (context.userId) scope.setUser({ id: String(context.userId) });
      if (context.role) scope.setTag('role', context.role);
      sentry.captureException(err);
    });
  } catch {
    /* monitoring must never break a request */
  }
}

export async function flushMonitoring(timeoutMs = 2000) {
  if (!sentry) return;
  await sentry.flush(timeoutMs).catch(() => {});
}

export const monitoringEnabled = () => Boolean(sentry);
