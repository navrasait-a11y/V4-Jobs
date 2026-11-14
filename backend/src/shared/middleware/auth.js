import ApiError from '../errors/ApiError.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { Session } from '../../modules/auth/auth.models.js';
import User from '../../modules/users/user.model.js';
import { ADMIN_ROLES, ROLES, USER_STATUS, DEFAULT_MEMBER_PERMISSIONS } from '../constants/index.js';

/**
 * Small per-instance cache so a burst of requests from one client does not hit Mongo for the
 * session check every time. Revocation becomes effective within SESSION_CACHE_MS.
 */
const SESSION_CACHE_MS = 30 * 1000;
const sessionCache = new Map();

async function isSessionActive(sid) {
  const hit = sessionCache.get(sid);
  if (hit && hit.exp > Date.now()) return hit.active;
  const active = Boolean(await Session.exists({ _id: sid, revokedAt: null, expiresAt: { $gt: new Date() } }));
  sessionCache.set(sid, { active, exp: Date.now() + SESSION_CACHE_MS });
  if (sessionCache.size > 50000) sessionCache.clear();
  return active;
}

export const invalidateSessionCache = (sid) => sessionCache.delete(String(sid));

function extractToken(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

const BLOCKED_STATUSES = [USER_STATUS.BLOCKED, USER_STATUS.SUSPENDED, USER_STATUS.TRASHED];

async function resolveUser(token) {
  const payload = verifyAccessToken(token);
  const [user, active] = await Promise.all([User.findById(payload.sub).select('+tokenVersion'), isSessionActive(payload.sid)]);
  if (!user) throw ApiError.unauthorized('User no longer exists', 'USER_NOT_FOUND');
  if (!active) throw ApiError.unauthorized('Session expired or revoked', 'SESSION_REVOKED');
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) throw ApiError.unauthorized('Please log in again', 'TOKEN_REVOKED');
  if (BLOCKED_STATUSES.includes(user.status)) throw ApiError.forbidden(`Your account is ${user.status}. Contact support.`, 'ACCOUNT_DISABLED');
  return { user, payload };
}

function attach(req, { user, payload }) {
  req.user = user;
  req.auth = { sessionId: payload.sid, role: payload.role, impersonatedBy: payload.imp };
  // Touch last-active at most once every 5 minutes to keep "Active in last N days" filters accurate.
  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000) {
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
  }
}

export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  attach(req, await resolveUser(token));
  next();
}

/** Attaches req.user when a valid token is present, otherwise continues anonymously. */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      attach(req, await resolveUser(token));
    } catch {
      /* anonymous */
    }
  }
  next();
}

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    const allowed = roles.flat();
    // super_admin passes any admin-gated route
    if (allowed.includes(ROLES.ADMIN) && req.user.role === ROLES.SUPER_ADMIN) return next();
    if (!allowed.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };

export const isAdmin = (user) => ADMIN_ROLES.includes(user?.role);

/**
 * Admin "login as" sessions can view and correct an account, but never change how the owner signs
 * in, pay with their money or delete the account.
 */
export function forbidImpersonation(req, _res, next) {
  if (req.auth?.impersonatedBy) throw ApiError.forbidden('Not allowed while logged in as this user from the admin panel', 'IMPERSONATION_FORBIDDEN');
  next();
}

/** Admin sub-permission check. Super admins and admins without an explicit list have full access. */
export const requireAdminPermission = (permission) => (req, _res, next) => {
  if (!isAdmin(req.user)) throw ApiError.forbidden();
  if (req.user.role === ROLES.SUPER_ADMIN) return next();
  const perms = req.user.admin?.permissions;
  if (perms && perms.length && !perms.includes(permission)) throw ApiError.forbidden(`Missing admin permission: ${permission}`);
  next();
};

export function employerPermissions(user) {
  if (!user?.employer) return [];
  if (user.employer.isOwner) return DEFAULT_MEMBER_PERMISSIONS.employer_admin;
  if (user.employer.permissions?.length) return user.employer.permissions;
  return DEFAULT_MEMBER_PERMISSIONS[user.employer.memberRole] || DEFAULT_MEMBER_PERMISSIONS.recruiter;
}

export function hasEmployerPermission(user, ...perms) {
  if (isAdmin(user)) return true;
  const granted = employerPermissions(user);
  return perms.some((p) => granted.includes(p));
}

/** Employer route guard: must be an employer member linked to an organization and hold ANY of the permissions. */
export const requireEmployer =
  (...perms) =>
  (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== ROLES.EMPLOYER || !req.user.employer?.organization) throw ApiError.forbidden('Employer account required');
    if (perms.length && !hasEmployerPermission(req.user, ...perms)) {
      throw ApiError.forbidden(`Your team role does not allow this action (${perms.join(' / ')})`, 'PERMISSION_DENIED');
    }
    req.orgId = req.user.employer.organization;
    next();
  };
