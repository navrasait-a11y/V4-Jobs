import jwt from 'jsonwebtoken';
import config from '../../config/env.js';
import ApiError from '../errors/ApiError.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { getSetting } from '../../modules/settings/settings.service.js';

/** Paths that must keep working so admins can sign in and switch maintenance off again. */
const OPEN = [/^\/auth(\/|$)/, /^\/settings\/public$/, /^\/enums$/, /^\/webhooks(\/|$)/, /^\/admin(\/|$)/];

function isAdminRequest(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  try {
    // An expired admin token still passes here: the route's own auth answers TOKEN_EXPIRED, which
    // makes the panel refresh its session instead of showing the maintenance screen.
    const payload = jwt.verify(header.slice(7).trim(), config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithms: ['HS256'], ignoreExpiration: true });
    return ADMIN_ROLES.includes(payload.role);
  } catch {
    return false;
  }
}

/**
 * Admin setting `platform.maintenanceMode`: the API answers 503 MAINTENANCE for everyone except
 * admins. /admin routes still run their own authentication, so opening them here grants nothing.
 */
export async function maintenanceGate(req, res, next) {
  if (!(await getSetting('platform.maintenanceMode', false))) return next();
  if (OPEN.some((rx) => rx.test(req.path)) || isAdminRequest(req)) return next();
  res.set('Retry-After', '600');
  throw new ApiError(503, 'Freejobwala is under scheduled maintenance. Please try again in a little while.', 'MAINTENANCE');
}

export default maintenanceGate;
