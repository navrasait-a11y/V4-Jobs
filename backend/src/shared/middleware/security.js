import crypto from 'node:crypto';
import config from '../../config/env.js';
import ApiError from '../errors/ApiError.js';

/** Correlation id: honours an incoming X-Request-Id (from a gateway) or generates one. */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Removes keys starting with "$" or containing "." from user input (NoSQL operator injection)
 * and drops prototype-pollution keys. Express 5 re-parses req.query on every access, so the
 * cleaned copy is pinned onto the request as an own property.
 */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function clean(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN.has(key)) {
      delete obj[key];
      continue;
    }
    clean(obj[key], depth + 1);
  }
}

export function sanitizeInput(req, _res, next) {
  clean(req.body);
  clean(req.params);
  const query = { ...(req.query || {}) };
  clean(query);
  Object.defineProperty(req, 'query', { value: query, writable: true, enumerable: true, configurable: true });
  next();
}

/**
 * CSRF guard for cookie-authenticated endpoints (refresh/logout via httpOnly cookie).
 * Bearer-token API calls are not CSRF-able, so only requests that rely on the cookie are checked.
 */
const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export function csrfOriginCheck(req, _res, next) {
  const usesCookie = req.cookies && Object.keys(req.cookies).length && !req.body?.refreshToken;
  if (!usesCookie || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const allowed = new Set([...config.corsOrigins, config.urls.web, config.urls.admin].map(originOf));
  // Exact origin match: a prefix check would accept https://site.com.evil.example.
  if (!allowed.has(originOf(req.get('origin') || req.get('referer')))) throw ApiError.forbidden('Cross-site request blocked', 'CSRF_BLOCKED');
  next();
}
