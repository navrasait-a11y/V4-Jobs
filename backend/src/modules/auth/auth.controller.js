import * as service from './auth.service.js';
import { ok, created } from '../../shared/http/response.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from './token.service.js';
import ApiError from '../../shared/errors/ApiError.js';

/**
 * Web clients receive the refresh token as an httpOnly cookie (and in the body).
 * Mobile apps (X-Client-Platform: android|ios) store the body token in secure storage.
 */
function respondWithSession(req, res, result, message, status = 200) {
  if (result?.tokens?.refreshToken) setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshExpiresAt);
  return status === 201 ? created(res, result, message) : ok(res, result, message);
}

const readRefresh = (req) => req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];

export const registerCandidate = async (req, res) =>
  respondWithSession(req, res, await service.registerCandidate(req, req.body), 'Registration successful. Please verify your mobile number', 201);
export const registerEmployer = async (req, res) =>
  respondWithSession(req, res, await service.registerEmployer(req, req.body), 'Employer registration successful', 201);

export const login = async (req, res) => {
  const result = await service.loginWithPassword(req, req.body);
  return respondWithSession(req, res, result, result.twoFactorRequired ? 'Two-factor authentication required' : 'Login successful');
};

export const sendLoginOtp = async (req, res) => ok(res, await service.sendLoginOtp(req.body), 'If an account exists, an OTP has been sent');

export const otpLogin = async (req, res) => {
  const result = await service.loginWithOtp(req, req.body);
  return respondWithSession(req, res, result, result.twoFactorRequired ? 'Two-factor authentication required' : 'Login successful');
};

export const google = async (req, res) => {
  const result = await service.loginWithGoogle(req, req.body);
  return respondWithSession(req, res, result, 'Login successful');
};

export const twoFactorLogin = async (req, res) => respondWithSession(req, res, await service.verifyTwoFactorLogin(req, req.body), 'Login successful');

export const refresh = async (req, res) => {
  const tokens = await service.refresh(req, readRefresh(req));
  // Only cookie sessions get a new cookie. A client that sent its refresh token in the body (mobile
  // app, admin "login as" tab) keeps it itself and must not replace the browser's own login cookie.
  if (!req.body?.refreshToken) setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  return ok(res, { tokens }, 'Token refreshed');
};

export const logout = async (req, res) => {
  await service.logout(req, req.body);
  // Ending a "login as" session must not sign the admin out of their own panel in the same browser.
  if (!req.auth?.impersonatedBy && !req.body?.refreshToken) clearRefreshCookie(res);
  return ok(res, null, 'Logged out');
};

export const me = async (req, res) => {
  const payload = await service.buildAuthPayload(req.user, {});
  delete payload.tokens;
  return ok(res, { ...payload, impersonatedBy: req.auth.impersonatedBy || null });
};

export const sessions = async (req, res) => ok(res, await service.listSessions(req));
export const revokeSession = async (req, res) => {
  await service.revokeSession(req, req.params.sessionId);
  return ok(res, null, 'Device logged out');
};
export const deviceToken = async (req, res) => {
  await service.updateDeviceToken(req, req.body);
  return ok(res, null, 'Device token saved');
};

export const forgotPassword = async (req, res) => ok(res, await service.forgotPassword(req.body), 'If an account exists, reset instructions have been sent');
export const resetPassword = async (req, res) => {
  await service.resetPassword(req.body);
  clearRefreshCookie(res);
  return ok(res, null, 'Password has been reset. Please log in');
};
export const changePassword = async (req, res) => {
  await service.changePassword(req, req.body);
  return ok(res, null, 'Password changed');
};

export const sendEmailVerification = async (req, res) => {
  if (req.user.emailVerifiedAt) throw ApiError.badRequest('E-mail already verified', undefined, 'ALREADY_VERIFIED');
  await service.sendEmailVerification(req.user);
  return ok(res, null, 'Verification e-mail sent');
};
export const verifyEmail = async (req, res) => ok(res, await service.verifyEmailToken(req.body.token), 'E-mail verified');
export const sendMobileOtp = async (req, res) => ok(res, await service.sendMobileVerification(req.user, req.body.channel), 'OTP sent');
export const verifyMobile = async (req, res) => {
  await service.verifyMobile(req.user, req.body.otp);
  return ok(res, null, 'Mobile number verified');
};

export const requestContactChange = async (req, res) => ok(res, await service.requestContactChange(req, req.body), 'OTP sent to the new contact');
export const confirmContactChange = async (req, res) => {
  await service.confirmContactChange(req, req.body);
  return ok(res, null, 'Contact details updated');
};

export const setupTwoFactor = async (req, res) => ok(res, await service.setupTwoFactor(req.user), 'Scan the QR code with your authenticator app');
export const enableTwoFactor = async (req, res) =>
  ok(res, await service.enableTwoFactor(req.user, req.body.code), 'Two-factor authentication enabled. Save your backup codes');
export const disableTwoFactor = async (req, res) => {
  await service.disableTwoFactor(req.user, req.body);
  return ok(res, null, 'Two-factor authentication disabled');
};

export const availability = async (req, res) => ok(res, await service.checkAvailability(req.query));
