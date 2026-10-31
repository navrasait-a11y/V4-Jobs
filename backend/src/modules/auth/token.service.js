import jwt from 'jsonwebtoken';
import config from '../../config/env.js';
import { randomToken, sha256 } from '../../shared/utils/crypto.js';
import ApiError from '../../shared/errors/ApiError.js';
import { Session } from './auth.models.js';

export const REFRESH_COOKIE = 'fjw_rt';

export function signAccessToken(user, session, extra = {}) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      sid: String(session._id),
      tv: user.tokenVersion || 0,
      org: user.employer?.organization ? String(user.employer.organization) : undefined,
      ...extra,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires, issuer: config.jwt.issuer, algorithm: 'HS256' },
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
}

export function clientMeta(req) {
  const platformHeader = String(req.get('x-client-platform') || '').toLowerCase();
  const platform = ['android', 'ios', 'web'].includes(platformHeader) ? platformHeader : 'web';
  return {
    platform,
    deviceId: req.get('x-device-id') || req.body?.deviceId,
    deviceName: req.get('x-device-name') || req.body?.deviceName,
    fcmToken: req.body?.fcmToken,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

/** Creates a new session (device) and returns the token pair. */
export async function issueTokens(user, req, { impersonatedBy } = {}) {
  const meta = clientMeta(req);
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresDays * 24 * 3600 * 1000);

  // One active session per device id - logging in again on the same device replaces it.
  if (meta.deviceId && !impersonatedBy) {
    await Session.updateMany({ user: user._id, deviceId: meta.deviceId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'replaced' } });
  }

  const session = await Session.create({
    user: user._id,
    refreshTokenHash: sha256(refreshToken),
    family: randomToken(12),
    ...meta,
    impersonatedBy,
    expiresAt: impersonatedBy ? new Date(Date.now() + 2 * 3600 * 1000) : expiresAt,
  });

  const accessToken = signAccessToken(user, session, impersonatedBy ? { imp: String(impersonatedBy) } : {});
  return { accessToken, refreshToken, session, expiresAt: session.expiresAt };
}

/**
 * Rotates the refresh token. If an already-rotated token is presented again we assume it was
 * stolen and revoke the whole session (refresh token reuse detection).
 */
export async function rotateRefreshToken(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized('Refresh token missing', 'REFRESH_MISSING');
  const hash = sha256(refreshToken);
  const session = await Session.findOne({ refreshTokenHash: hash });

  if (!session) {
    const reused = await Session.findOne({ previousTokenHash: hash, revokedAt: null });
    if (reused) {
      reused.revokedAt = new Date();
      reused.revokedReason = 'refresh_token_reuse';
      await reused.save();
    }
    throw ApiError.unauthorized('Invalid refresh token', 'REFRESH_INVALID');
  }
  if (session.revokedAt) throw ApiError.unauthorized('Session has been revoked', 'SESSION_REVOKED');
  if (session.expiresAt < new Date()) throw ApiError.unauthorized('Session expired, please log in again', 'SESSION_EXPIRED');

  const newToken = randomToken(48);
  session.previousTokenHash = session.refreshTokenHash;
  session.refreshTokenHash = sha256(newToken);
  session.lastUsedAt = new Date();
  await session.save();
  return { session, refreshToken: newToken };
}

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.secure ? 'none' : 'lax',
    domain: config.cookie.domain,
    path: `${config.apiPrefix}/auth`,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: `${config.apiPrefix}/auth`, domain: config.cookie.domain });
}
