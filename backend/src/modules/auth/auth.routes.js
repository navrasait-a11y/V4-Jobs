import { Router } from 'express';
import * as c from './auth.controller.js';
import * as v from './auth.validation.js';
import validate from '../../shared/middleware/validate.js';
import { authenticate, forbidImpersonation } from '../../shared/middleware/auth.js';
import { authLimiter, otpLimiter } from '../../shared/middleware/rateLimit.js';
import { csrfOriginCheck } from '../../shared/middleware/security.js';

const r = Router();

r.post('/register/candidate', authLimiter, validate(v.registerCandidate), c.registerCandidate);
r.post('/register/employer', authLimiter, validate(v.registerEmployer), c.registerEmployer);
r.get('/availability', validate(v.availability), c.availability);

r.post('/login', authLimiter, validate(v.login), c.login);
r.post('/otp/send', otpLimiter, validate(v.sendLoginOtp), c.sendLoginOtp);
r.post('/otp/login', authLimiter, validate(v.otpLogin), c.otpLogin);
r.post('/google', authLimiter, validate(v.google), c.google);
r.post('/2fa/verify', authLimiter, validate(v.twoFactorLogin), c.twoFactorLogin);

r.post('/refresh', csrfOriginCheck, validate(v.refresh), c.refresh);
r.post('/logout', authenticate, csrfOriginCheck, validate(v.logout), c.logout);

r.post('/password/forgot', otpLimiter, validate(v.forgotPassword), c.forgotPassword);
r.post('/password/reset', authLimiter, validate(v.resetPassword), c.resetPassword);
r.post('/password/change', authenticate, forbidImpersonation, validate(v.changePassword), c.changePassword);

r.post('/email/verify', validate(v.verifyEmail), c.verifyEmail);
r.post('/email/send-verification', authenticate, otpLimiter, c.sendEmailVerification);
r.post('/mobile/send-otp', authenticate, otpLimiter, validate(v.sendMobileOtp), c.sendMobileOtp);
r.post('/mobile/verify', authenticate, validate(v.verifyMobile), c.verifyMobile);
r.post('/contact/change', authenticate, forbidImpersonation, otpLimiter, validate(v.contactChangeRequest), c.requestContactChange);
r.post('/contact/confirm', authenticate, forbidImpersonation, validate(v.contactChangeConfirm), c.confirmContactChange);

r.get('/me', authenticate, c.me);
r.get('/sessions', authenticate, c.sessions);
r.delete('/sessions/:sessionId', authenticate, validate(v.sessionParam), c.revokeSession);
r.put('/device-token', authenticate, validate(v.deviceToken), c.deviceToken);

r.post('/2fa/setup', authenticate, c.setupTwoFactor);
r.post('/2fa/enable', authenticate, forbidImpersonation, validate(v.twoFactorEnable), c.enableTwoFactor);
r.post('/2fa/disable', authenticate, forbidImpersonation, validate(v.twoFactorDisable), c.disableTwoFactor);

export default r;
