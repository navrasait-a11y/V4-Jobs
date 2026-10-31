import { OAuth2Client } from 'google-auth-library';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import config from '../../config/env.js';
import ApiError from '../../shared/errors/ApiError.js';
import { ROLES, USER_STATUS, ADMIN_ROLES } from '../../shared/constants/index.js';
import { encrypt, decrypt, randomToken, sha256 } from '../../shared/utils/crypto.js';
import { normalizeEmail, normalizeMobile } from '../../shared/utils/helpers.js';
import User from '../users/user.model.js';
import Organization from '../employers/organization.model.js';
import Candidate from '../candidates/candidate.model.js';
import { Session, ActionToken, LoginAttempt } from './auth.models.js';
import { issueTokens, rotateRefreshToken, signAccessToken } from './token.service.js';
import { sendOtp, verifyOtp } from './otp.service.js';
import { createCandidateAccount, createEmployerAccount, assertIdentityAvailable } from '../users/account.service.js';
import { sendEmail } from '../notifications/notification.service.js';
import { logActivity } from '../activity/activity.service.js';
import { invalidateSessionCache } from '../../shared/middleware/auth.js';
import { grantFreePlan } from '../billing/billing.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const googleClient = new OAuth2Client();

/* ---------------------------------------------------------------- helpers */

const isEmail = (v) => /@/.test(String(v));

function identifierQuery(identifier) {
  const id = String(identifier).trim();
  if (isEmail(id)) return { email: normalizeEmail(id) };
  if (/^\+?\d[\d\s-]{6,}$/.test(id)) return { mobile: normalizeMobile(id) };
  return { username: id };
}

async function recordAttempt(req, { identifier, user, success, reason, method }) {
  let employerType;
  if (user?.role === ROLES.EMPLOYER && user.employer?.organization) {
    employerType = (await Organization.findById(user.employer.organization).select('type').lean())?.type;
  }
  LoginAttempt.create({
    identifier,
    user: user?._id,
    role: user?.role,
    employerType,
    success,
    reason,
    method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => {});
}

function assertCanLogin(user) {
  if ([USER_STATUS.BLOCKED, USER_STATUS.SUSPENDED, USER_STATUS.TRASHED].includes(user.status)) {
    throw ApiError.forbidden(`Your account is ${user.status}. Please contact support.`, 'ACCOUNT_DISABLED');
  }
}

/** Builds the auth payload returned by every login / register / refresh endpoint. */
export async function buildAuthPayload(user, tokens) {
  const fresh = await User.findById(user._id);
  const out = {
    user: fresh.toSafeJSON(),
    tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenType: 'Bearer', refreshExpiresAt: tokens.expiresAt },
  };
  if (fresh.role === ROLES.EMPLOYER && fresh.employer?.organization) {
    out.organization = await Organization.findById(fresh.employer.organization).select('-documents -adminNotes -uid').lean();
  }
  if (fresh.role === ROLES.CANDIDATE) {
    out.profile = await Candidate.findOne({ user: fresh._id }).select('profileCompletion experienceLevel resume.name keySkills').lean();
  }
  return out;
}

async function completeLogin(req, user, method) {
  assertCanLogin(user);
  if (user.status === USER_STATUS.DEACTIVATED) {
    // Logging in again reactivates a self-deactivated account.
    await User.updateOne({ _id: user._id }, { $set: { status: USER_STATUS.ACTIVE }, $unset: { statusReason: 1 } });
  }
  const tokens = await issueTokens(user, req);
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastActiveAt: new Date(), failedLoginCount: 0 }, $unset: { lockUntil: 1 } });
  await recordAttempt(req, { identifier: user.email || user.mobile, user, success: true, method });
  logActivity(req, {
    user: user._id,
    organization: user.employer?.organization,
    type: 'login',
    description: `Logged in via ${method}`,
    meta: { platform: tokens.session.platform },
  });
  return { ...(await buildAuthPayload(user, tokens)), sessionId: tokens.session._id };
}

/** If 2FA is enabled, issue a short-lived challenge instead of tokens. */
async function maybeTwoFactor(req, user, method) {
  if (!user.twoFactor?.enabled) return completeLogin(req, user, method);
  const challenge = randomToken(32);
  await ActionToken.create({
    user: user._id,
    type: 'two_factor_challenge',
    tokenHash: sha256(challenge),
    meta: { method },
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return { twoFactorRequired: true, challengeToken: challenge };
}

/* ----------------------------------------------------------- registration */

export async function registerCandidate(req, body) {
  const referredBy = body.referralCode ? (await User.findOne({ referralCode: body.referralCode }).select('_id').lean())?._id : undefined;
  const { user } = await createCandidateAccount({ ...body, referredBy }, { source: 'direct', ip: req.ip });
  if (user.mobile) await sendOtp({ target: user.mobile, channel: 'sms', purpose: 'verify_mobile' }).catch(() => {});
  if (user.email) await sendEmailVerification(user).catch(() => {});
  const result = await completeLogin(req, user, 'password');
  return { ...result, verification: { mobileOtpSent: Boolean(user.mobile), emailLinkSent: Boolean(user.email) } };
}

export async function registerEmployer(req, body) {
  const { user, organization } = await createEmployerAccount(body, { source: 'direct', ip: req.ip });
  await grantFreePlan(organization._id).catch(() => {});
  if (user.mobile) await sendOtp({ target: user.mobile, channel: 'sms', purpose: 'verify_mobile' }).catch(() => {});
  if (user.email) await sendEmailVerification(user).catch(() => {});
  const result = await completeLogin(req, user, 'password');
  return { ...result, organizationStatus: organization.status, verification: { mobileOtpSent: Boolean(user.mobile), emailLinkSent: Boolean(user.email) } };
}

/* ------------------------------------------------------------------ login */

export async function loginWithPassword(req, { identifier, password, role }) {
  const user = await User.findOne(identifierQuery(identifier)).select('+password +failedLoginCount +lockUntil +tokenVersion');
  if (!user || !user.password) {
    await recordAttempt(req, { identifier, success: false, reason: 'invalid_credentials', method: 'password' });
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }
  if (role && !(role === user.role || (role === ROLES.ADMIN && ADMIN_ROLES.includes(user.role)))) {
    await recordAttempt(req, { identifier, user, success: false, reason: 'wrong_portal', method: 'password' });
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw ApiError.tooMany(
      `Account temporarily locked due to failed attempts. Try again after ${Math.ceil((user.lockUntil - Date.now()) / 60000)} minutes`,
      'ACCOUNT_LOCKED',
    );
  }
  const okPassword = await user.comparePassword(password);
  if (!okPassword) {
    const failed = (user.failedLoginCount || 0) + 1;
    const update = { failedLoginCount: failed };
    if (failed >= MAX_FAILED_LOGINS) Object.assign(update, { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60000), failedLoginCount: 0 });
    await User.updateOne({ _id: user._id }, { $set: update });
    await recordAttempt(req, { identifier, user, success: false, reason: 'invalid_password', method: 'password' });
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }
  assertCanLogin(user);
  return maybeTwoFactor(req, user, 'password');
}

export async function sendLoginOtp({ mobile, email, channel }) {
  const target = mobile ? normalizeMobile(mobile) : normalizeEmail(email);
  const user = await User.findOne(mobile ? { mobile: target } : { email: target })
    .select('_id status')
    .lean();
  // Do not reveal whether an account exists - but only send when it does.
  if (user && ![USER_STATUS.BLOCKED, USER_STATUS.TRASHED].includes(user.status)) {
    await sendOtp({ target, channel: mobile ? channel || 'sms' : 'email', purpose: 'login' });
  }
  return { sent: true, expiresIn: config.otp.ttl };
}

export async function loginWithOtp(req, { mobile, email, otp, role }) {
  const target = mobile ? normalizeMobile(mobile) : normalizeEmail(email);
  await verifyOtp({ target, purpose: 'login', code: otp });
  const user = await User.findOne(mobile ? { mobile: target } : { email: target }).select('+tokenVersion');
  if (!user) throw ApiError.unauthorized('No account found for these details', 'ACCOUNT_NOT_FOUND');
  if (role && role !== user.role && !(role === ROLES.ADMIN && ADMIN_ROLES.includes(user.role)))
    throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  // OTP to the mobile/email proves ownership.
  const set = mobile ? { mobileVerifiedAt: user.mobileVerifiedAt || new Date() } : { emailVerifiedAt: user.emailVerifiedAt || new Date() };
  await User.updateOne({ _id: user._id }, { $set: set });
  return maybeTwoFactor(req, user, 'otp');
}

export async function loginWithGoogle(req, { idToken, role = ROLES.CANDIDATE, organizationName, employerType, mobile, acceptTerms, consentCommunication }) {
  if (!config.google.clientIds.length) throw ApiError.badRequest('Google login is not configured', undefined, 'GOOGLE_DISABLED');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: config.google.clientIds });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Invalid Google token', 'GOOGLE_TOKEN_INVALID');
  }
  if (!payload?.email || !payload.email_verified) throw ApiError.unauthorized('Google account e-mail is not verified', 'GOOGLE_EMAIL_UNVERIFIED');

  const email = normalizeEmail(payload.email);
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] }).select('+googleId +tokenVersion');

  if (user) {
    if (!user.googleId) user.googleId = payload.sub;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    if (!user.avatar?.url && payload.picture) user.avatar = { url: payload.picture };
    await user.save();
    return maybeTwoFactor(req, user, 'google');
  }

  const base = {
    fullName: payload.name,
    email,
    googleId: payload.sub,
    emailVerified: true,
    avatar: payload.picture ? { url: payload.picture } : undefined,
    mobile,
    acceptTerms,
    consentCommunication,
  };
  if (role === ROLES.EMPLOYER) {
    if (!organizationName) throw ApiError.badRequest('organizationName is required to sign up as an employer with Google', undefined, 'ORGANIZATION_REQUIRED');
    let organization;
    ({ user, organization } = await createEmployerAccount({ ...base, organizationName, employerType }, { source: 'google', ip: req.ip }));
    await grantFreePlan(organization._id).catch(() => {});
  } else {
    ({ user } = await createCandidateAccount(base, { source: 'google', ip: req.ip }));
  }
  const result = await completeLogin(req, user, 'google');
  return { ...result, isNewUser: true };
}

export async function verifyTwoFactorLogin(req, { challengeToken, code }) {
  const token = await ActionToken.findOne({ tokenHash: sha256(challengeToken), type: 'two_factor_challenge', usedAt: null });
  if (!token || token.expiresAt < new Date()) throw ApiError.unauthorized('2FA challenge expired. Please log in again', 'TWO_FACTOR_EXPIRED');
  const user = await User.findById(token.user).select('+twoFactor.secret +twoFactor.backupCodes +tokenVersion');
  if (!user) throw ApiError.unauthorized();
  const okCode = await checkTwoFactorCode(user, code);
  if (!okCode) {
    await recordAttempt(req, { identifier: user.email, user, success: false, reason: 'invalid_2fa', method: 'two_factor' });
    throw ApiError.unauthorized('Invalid authentication code', 'TWO_FACTOR_INVALID');
  }
  token.usedAt = new Date();
  await token.save();
  return completeLogin(req, user, token.meta?.method || 'password');
}

async function checkTwoFactorCode(user, code) {
  const clean = String(code || '').replace(/\s/g, '');
  if (/^\d{6}$/.test(clean)) {
    const secret = decrypt(user.twoFactor.secret);
    const res = await verifyTotp({ secret, token: clean, epochTolerance: 30 });
    return res.valid;
  }
  // backup code (single use)
  const hash = sha256(clean.toUpperCase());
  if (user.twoFactor.backupCodes?.includes(hash)) {
    await User.updateOne({ _id: user._id }, { $pull: { 'twoFactor.backupCodes': hash } });
    return true;
  }
  return false;
}

/* --------------------------------------------------------------- sessions */

export async function refresh(req, refreshToken) {
  const { session, refreshToken: newRefresh } = await rotateRefreshToken(refreshToken);
  const user = await User.findById(session.user).select('+tokenVersion');
  if (!user) throw ApiError.unauthorized('User not found', 'USER_NOT_FOUND');
  assertCanLogin(user);
  if (req.body?.fcmToken) await Session.updateOne({ _id: session._id }, { $set: { fcmToken: req.body.fcmToken } });
  const accessToken = signAccessToken(user, session, session.impersonatedBy ? { imp: String(session.impersonatedBy) } : {});
  return { accessToken, refreshToken: newRefresh, tokenType: 'Bearer', refreshExpiresAt: session.expiresAt };
}

export async function logout(req, { allDevices = false } = {}) {
  const filter = allDevices ? { user: req.user._id, revokedAt: null } : { _id: req.auth.sessionId };
  const sessions = await Session.find(filter).select('_id').lean();
  await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: allDevices ? 'logout_all' : 'logout' } });
  sessions.forEach((s) => invalidateSessionCache(s._id));
  if (allDevices) await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  logActivity(req, { type: 'logout', description: allDevices ? 'Logged out from all devices' : 'Logged out' });
}

export async function listSessions(req) {
  const sessions = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('platform deviceId deviceName ip userAgent lastUsedAt createdAt impersonatedBy')
    .sort({ lastUsedAt: -1 })
    .lean();
  return sessions.map((s) => ({ ...s, isCurrent: String(s._id) === String(req.auth.sessionId) }));
}

export async function revokeSession(req, sessionId) {
  const res = await Session.updateOne(
    { _id: sessionId, user: req.user._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'revoked_by_user' } },
  );
  if (!res.matchedCount) throw ApiError.notFound('Session not found');
  invalidateSessionCache(sessionId);
}

export async function updateDeviceToken(req, { fcmToken }) {
  await Session.updateOne({ _id: req.auth.sessionId }, { $set: { fcmToken } });
}

/* ------------------------------------------------------- verification flows */

export async function sendEmailVerification(user) {
  if (!user.email) throw ApiError.badRequest('No e-mail on account');
  const token = randomToken(32);
  await ActionToken.create({
    user: user._id,
    type: 'verify_email',
    tokenHash: sha256(token),
    meta: { email: user.email },
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });
  await sendEmail({
    to: user.email,
    template: 'verifyEmail',
    vars: { name: user.fullName, url: `${config.urls.web}/verify-email?token=${token}` },
    user: user._id,
  });
}

export async function verifyEmailToken(token) {
  const doc = await ActionToken.findOne({ tokenHash: sha256(token), type: 'verify_email', usedAt: null });
  if (!doc || doc.expiresAt < new Date()) throw ApiError.badRequest('Verification link is invalid or expired', undefined, 'TOKEN_INVALID');
  const user = await User.findById(doc.user);
  if (!user || user.email !== doc.meta?.email) throw ApiError.badRequest('Verification link is no longer valid', undefined, 'TOKEN_INVALID');
  user.emailVerifiedAt = new Date();
  await user.save();
  doc.usedAt = new Date();
  await doc.save();
  await syncVerificationBadge(user._id);
  return user.toSafeJSON();
}

export async function sendMobileVerification(user, channel = 'sms') {
  if (!user.mobile) throw ApiError.badRequest('No mobile number on account');
  return sendOtp({ target: user.mobile, channel, purpose: 'verify_mobile' });
}

export async function verifyMobile(user, otp) {
  await verifyOtp({ target: user.mobile, purpose: 'verify_mobile', code: otp });
  await User.updateOne({ _id: user._id }, { $set: { mobileVerifiedAt: new Date() } });
  await syncVerificationBadge(user._id);
}

/**
 * Candidate badge: e-mail + mobile verified AND approved (active) by admin.
 * Employer badge: owner e-mail + mobile verified AND all KYC documents verified.
 */
export async function syncVerificationBadge(userId) {
  const user = await User.findById(userId);
  if (!user) return;
  const contactVerified = Boolean(user.emailVerifiedAt && user.mobileVerifiedAt);
  if (user.role === ROLES.CANDIDATE) {
    user.isVerified = contactVerified && user.status === USER_STATUS.ACTIVE;
    await user.save();
  } else if (user.role === ROLES.EMPLOYER && user.employer?.isOwner) {
    const org = await Organization.findById(user.employer.organization);
    if (!org) return;
    org.verification.email = Boolean(user.emailVerifiedAt);
    org.verification.phone = Boolean(user.mobileVerifiedAt);
    org.isVerified = contactVerified && org.kycStatus === 'verified';
    await org.save();
  }
}

/* -------------------------------------------------------- password flows */

export async function forgotPassword({ email, mobile }) {
  if (email) {
    const user = await User.findOne({ email: normalizeEmail(email) })
      .select('_id email fullName')
      .lean();
    if (user) {
      const token = randomToken(32);
      await ActionToken.create({ user: user._id, type: 'reset_password', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
      await sendEmail({
        to: user.email,
        template: 'resetPassword',
        vars: { name: user.fullName, url: `${config.urls.web}/reset-password?token=${token}` },
        user: user._id,
      });
    }
    return { method: 'email' };
  }
  const target = normalizeMobile(mobile);
  const user = await User.exists({ mobile: target });
  if (user) await sendOtp({ target, channel: 'sms', purpose: 'reset_password' });
  return { method: 'otp', expiresIn: config.otp.ttl };
}

export async function resetPassword({ token, mobile, otp, password }) {
  let userId;
  if (token) {
    const doc = await ActionToken.findOne({ tokenHash: sha256(token), type: { $in: ['reset_password', 'activation'] }, usedAt: null });
    if (!doc || doc.expiresAt < new Date()) throw ApiError.badRequest('Reset link is invalid or expired', undefined, 'TOKEN_INVALID');
    doc.usedAt = new Date();
    await doc.save();
    userId = doc.user;
  } else {
    const target = normalizeMobile(mobile);
    await verifyOtp({ target, purpose: 'reset_password', code: otp });
    userId = (await User.findOne({ mobile: target }).select('_id').lean())?._id;
  }
  const user = await User.findById(userId).select('+password +tokenVersion');
  if (!user) throw ApiError.notFound('Account not found');
  user.password = password;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // log out everywhere
  if (token && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_reset' } });
}

export async function changePassword(req, { currentPassword, newPassword }) {
  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (user.password && !(await user.comparePassword(currentPassword || '')))
    throw ApiError.badRequest('Current password is incorrect', undefined, 'INVALID_PASSWORD');
  user.password = newPassword;
  await user.save();
  // keep current session, revoke others
  await Session.updateMany(
    { user: user._id, revokedAt: null, _id: { $ne: req.auth.sessionId } },
    { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } },
  );
  logActivity(req, { type: 'password_changed', description: 'Password changed' });
}

/* ------------------------------------------------------ change e-mail/mobile */

export async function requestContactChange(req, { email, mobile }) {
  await assertIdentityAvailable({ email, mobile }, req.user._id);
  if (email) return sendOtp({ target: normalizeEmail(email), channel: 'email', purpose: 'change_email', meta: { userId: String(req.user._id) } });
  return sendOtp({ target: normalizeMobile(mobile), channel: 'sms', purpose: 'change_mobile', meta: { userId: String(req.user._id) } });
}

export async function confirmContactChange(req, { email, mobile, otp }) {
  const target = email ? normalizeEmail(email) : normalizeMobile(mobile);
  const meta = await verifyOtp({ target, purpose: email ? 'change_email' : 'change_mobile', code: otp });
  if (meta.userId !== String(req.user._id)) throw ApiError.forbidden('OTP does not belong to this account');
  await assertIdentityAvailable({ email, mobile }, req.user._id);
  const set = email ? { email: target, emailVerifiedAt: new Date() } : { mobile: target, mobileVerifiedAt: new Date() };
  await User.updateOne({ _id: req.user._id }, { $set: set });
  logActivity(req, { type: email ? 'email_changed' : 'mobile_changed', description: `${email ? 'E-mail' : 'Mobile'} updated` });
  await syncVerificationBadge(req.user._id);
}

/* ----------------------------------------------------------- two factor */

export async function setupTwoFactor(user) {
  const secret = generateSecret();
  await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.secret': encrypt(secret), 'twoFactor.enabled': false } });
  const otpauthUrl = generateURI({ issuer: config.appName, label: user.email || user.mobile || user.username, secret });
  return { secret, otpauthUrl, qrCode: await QRCode.toDataURL(otpauthUrl) };
}

export async function enableTwoFactor(user, code) {
  const fresh = await User.findById(user._id).select('+twoFactor.secret');
  if (!fresh.twoFactor?.secret) throw ApiError.badRequest('Start 2FA setup first');
  const res = await verifyTotp({ secret: decrypt(fresh.twoFactor.secret), token: String(code), epochTolerance: 30 });
  if (!res.valid) throw ApiError.badRequest('Invalid authentication code', undefined, 'TWO_FACTOR_INVALID');
  const backupCodes = Array.from({ length: 8 }, () =>
    randomToken(6)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase(),
  );
  await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.enabled': true, 'twoFactor.backupCodes': backupCodes.map((c) => sha256(c)) } });
  return { enabled: true, backupCodes };
}

export async function disableTwoFactor(user, { password, code }) {
  const fresh = await User.findById(user._id).select('+password +twoFactor.secret +twoFactor.backupCodes');
  if (fresh.password && !(await fresh.comparePassword(password || ''))) throw ApiError.badRequest('Password is incorrect', undefined, 'INVALID_PASSWORD');
  if (!(await checkTwoFactorCode(fresh, code))) throw ApiError.badRequest('Invalid authentication code', undefined, 'TWO_FACTOR_INVALID');
  await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.enabled': false }, $unset: { 'twoFactor.secret': 1, 'twoFactor.backupCodes': 1 } });
}

/* --------------------------------------------------------- impersonation */

/** Admin "Login as user": short-lived session tagged with the admin id (audited). */
export async function impersonate(req, targetUserId) {
  const target = await User.findById(targetUserId).select('+tokenVersion');
  if (!target) throw ApiError.notFound('User not found');
  if (ADMIN_ROLES.includes(target.role)) throw ApiError.forbidden('Cannot impersonate an admin');
  const tokens = await issueTokens(target, req, { impersonatedBy: req.user._id });
  await recordAttempt(req, { identifier: target.email, user: target, success: true, method: 'impersonation' });
  return { ...(await buildAuthPayload(target, tokens)), impersonation: { by: req.user._id, expiresAt: tokens.expiresAt } };
}

export async function checkAvailability({ username, email, mobile }) {
  const result = {};
  if (username) result.username = !(await User.exists({ username }));
  if (email) result.email = !(await User.exists({ email: normalizeEmail(email) }));
  if (mobile) result.mobile = !(await User.exists({ mobile: normalizeMobile(mobile) }));
  return result;
}
