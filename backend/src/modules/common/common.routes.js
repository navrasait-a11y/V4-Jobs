import { Router } from 'express';
import Joi from 'joi';
import path from 'node:path';
import validate from '../../shared/middleware/validate.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { ok, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { pagination, timespan, username, shortText, stringList, socialLink } from '../../shared/validators/common.js';
import { resolveLocalSigned, putFile, deleteFile } from '../../shared/services/storage.service.js';
import { upload } from '../../shared/middleware/upload.js';
import { uploadLimiter } from '../../shared/middleware/rateLimit.js';
import User from '../users/user.model.js';
import { assertIdentityAvailable, validateUsername } from '../users/account.service.js';
import ApiError from '../../shared/errors/ApiError.js';
import * as C from '../../shared/constants/index.js';
import { publicSettings } from '../settings/settings.service.js';
import { Activity } from '../activity/activity.model.js';
import { LoginAttempt } from '../auth/auth.models.js';

const r = Router();

/** Bootstrap config for web & app (feature flags, payment methods, ads ids, support contacts, min app version). */
r.get('/settings/public', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=120');
  return ok(res, await publicSettings());
});

/** Fixed enums used across forms - lets clients render dropdowns without hard-coding. */
r.get('/enums', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  return ok(res, {
    roles: C.ROLES,
    userStatus: C.USER_STATUS,
    employerTypes: Object.values(C.EMPLOYER_TYPE),
    employerMemberRoles: C.EMPLOYER_MEMBER_ROLES,
    employerPermissions: C.EMPLOYER_PERMISSIONS,
    defaultMemberPermissions: C.DEFAULT_MEMBER_PERMISSIONS,
    usageMetrics: C.USAGE_METRICS,
    quotaPeriods: C.QUOTA_PERIODS,
    jobKinds: Object.values(C.JOB_KIND),
    jobStatus: C.JOB_STATUS,
    labels: C.LABELS,
    pipelineStages: C.PIPELINE_STAGES,
    screeningStatus: C.SCREENING_STATUS,
    callingStatus: C.CALLING_STATUS,
    messagingStatus: C.MESSAGING_STATUS,
    forwardChannels: C.FORWARD_CHANNELS,
    reportReasons: C.REPORT_REASONS,
    documentStatus: C.DOCUMENT_STATUS,
    blocklistTypes: C.BLOCKLIST_TYPES,
    pageSizes: C.PAGE_SIZES,
    timespans: C.TIMESPANS,
    activeIn: Object.keys(C.ACTIVE_IN_DAYS),
    bulkLimits: C.BULK_LIMITS,
    usernameRule: '3-30 chars, letters/numbers/underscore, cannot start or end with underscore',
  });
});

/** Local-storage signed download (R2 deployments use pre-signed R2 URLs instead). */
r.get(
  '/files/download',
  validate({ query: Joi.object({ key: Joi.string().max(500).required(), exp: Joi.number().required(), sig: Joi.string().hex().length(64).required() }) }),
  (req, res) => {
    const file = resolveLocalSigned(req.query);
    if (!file) throw ApiError.forbidden('Link expired or invalid', 'LINK_INVALID');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(file, { dotfiles: 'allow' }); // path already confined to the storage root
  },
);

/** User Activity History (login / logout / e-mails ... with exact date & time). */
r.get('/me/activity', authenticate, validate({ query: Joi.object({ ...pagination, ...timespan, type: Joi.string().max(60) }) }), async (req, res) => {
  const p = parsePagination(req.query);
  const f = { user: req.user._id, ...dateRangeFilter(req.query), ...(req.query.type ? { type: req.query.type } : {}) };
  const [items, total] = await Promise.all([
    Activity.find(f).select('-userAgent').sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Activity.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
});

/**
 * Own account basics for every role (employers & admins; candidates also have /candidates/me).
 * Employer members additionally set designation / department / hiring authority
 * (Excel: "Who will manage hiring on this account?").
 */
const meBody = Joi.object({
  fullName: Joi.string().trim().min(2).max(120),
  displayName: Joi.string().trim().max(80),
  username,
  gender: shortText.allow(''),
  about: Joi.string().trim().max(5000).allow(''),
  socialLinks: Joi.array().items(socialLink).max(15),
  designation: shortText.allow(''),
  department: stringList(25),
  hiringAuthority: shortText.allow(''),
  notificationPrefs: Joi.object({
    email: Joi.boolean(),
    sms: Joi.boolean(),
    whatsapp: Joi.boolean(),
    push: Joi.boolean(),
    jobAlerts: Joi.boolean(),
    recruiterMessages: Joi.boolean(),
    marketing: Joi.boolean(),
  }),
}).min(1);

r.patch('/me', authenticate, validate({ body: meBody }), async (req, res) => {
  const user = await User.findById(req.user._id);
  const { designation, department, hiringAuthority, notificationPrefs, ...basic } = req.body;
  if (basic.username && basic.username !== user.username) {
    validateUsername(basic.username);
    await assertIdentityAvailable({ username: basic.username }, user._id);
  }
  user.set(basic);
  if (notificationPrefs) user.notificationPrefs = { ...user.notificationPrefs?.toObject?.(), ...notificationPrefs };
  if (user.role === C.ROLES.EMPLOYER) {
    if (designation !== undefined) user.employer.designation = designation;
    if (department !== undefined) user.employer.department = department;
    if (hiringAuthority !== undefined) user.employer.hiringAuthority = hiringAuthority;
  }
  await user.save();
  return ok(res, user.toSafeJSON(), 'Profile updated');
});

r.post('/me/avatar', authenticate, uploadLimiter, upload('image', 'avatar'), async (req, res) => {
  const user = await User.findById(req.user._id);
  const stored = await putFile(req.file, { folder: 'avatars' });
  const old = user.avatar?.key;
  user.avatar = { url: stored.url, key: stored.key };
  await user.save();
  if (old) await deleteFile(old);
  return ok(res, user.avatar, 'Profile photo updated');
});

r.get('/me/login-history', authenticate, validate({ query: Joi.object(pagination) }), async (req, res) => {
  const p = parsePagination(req.query);
  const f = { user: req.user._id };
  const [items, total] = await Promise.all([
    LoginAttempt.find(f).select('method success reason ip userAgent createdAt').sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    LoginAttempt.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
});

export default r;
