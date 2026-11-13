import { Router } from 'express';
import mongoose from 'mongoose';
import { insights as searchInsights } from '../search/searchStats.service.js';
import ApiError from '../../shared/errors/ApiError.js';
import { riskSignals } from './admin.risk.service.js';
import config from '../../config/env.js';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireAdminPermission } from '../../shared/middleware/auth.js';
import { heavyLimiter } from '../../shared/middleware/rateLimit.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { exportRows } from '../../shared/utils/excel.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import {
  objectId,
  idParam,
  pagination,
  timespan,
  email,
  mobile,
  password,
  bulkIds,
  exportFormat,
  socialLink,
  stringList,
} from '../../shared/validators/common.js';
import {
  ROLES,
  USER_STATUS,
  USER_SOURCE,
  ADMIN_PERMISSIONS,
  PAGE_SIZES,
  BULK_LIMITS,
  SCREENING_STATUS,
  CALLING_STATUS,
  MESSAGING_STATUS,
  FORWARD_CHANNELS,
  EMPLOYER_MEMBER_ROLES,
  EMPLOYER_PERMISSIONS,
  USAGE_METRICS,
  QUOTA_PERIODS,
  DOCUMENT_STATUS,
  PIPELINE_STAGES,
} from '../../shared/constants/index.js';
import { audit } from '../activity/activity.service.js';
import { Activity, AuditLog } from '../activity/activity.model.js';
import { EmailLog, MessageLog } from '../notifications/notification.model.js';
import { LoginAttempt } from '../auth/auth.models.js';
import { containsRegex } from '../../shared/utils/helpers.js';
import User from '../users/user.model.js';
import { impersonate } from '../auth/auth.service.js';
import { listSettings, saveSetting, DEFAULT_SETTINGS } from '../settings/settings.service.js';
import * as analytics from '../analytics/analytics.service.js';
import * as users from './admin.users.service.js';
import * as jobs from './admin.jobs.service.js';
import * as apps from '../applications/application.service.js';
import { jobFields } from '../jobs/job.validation.js';
import { updateMember, addMember } from '../employers/employer.service.js';
import { deliverEmail, deliverSms } from '../../shared/services/channels.js';
import { renderEmail } from '../../shared/services/emailTemplates.js';
import { systemHealth } from './admin.health.service.js';
import { profileRouter } from '../candidates/candidate.routes.js';

const r = Router();
r.use(authenticate, authorize(ROLES.ADMIN));

const listBase = {
  ...pagination,
  ...timespan,
  limit: Joi.number()
    .valid(...PAGE_SIZES)
    .default(20),
  q: Joi.string().trim().max(120).allow(''),
  format: exportFormat,
};
const bulkAction = Joi.string().valid(
  'approve',
  'activate',
  'restore',
  'unapprove',
  'pending',
  'admin_review',
  'block',
  'suspend',
  'trash',
  'verify',
  'unverify',
  'label_add',
  'label_remove',
  'tag',
  'delete',
);
const trackingBody = Joi.object({
  screeningStatus: Joi.string().valid(...SCREENING_STATUS),
  callingStatus: Joi.string().valid(...CALLING_STATUS),
  messagingStatus: Joi.array().items(Joi.string().valid(...MESSAGING_STATUS)),
  comment: Joi.string().max(2000),
  forward: Joi.object({
    channel: Joi.string()
      .valid(...FORWARD_CHANNELS)
      .required(),
    to: Joi.string().max(200),
  }),
}).min(1);

/* ============================================================ dashboard */

r.get('/system/health', requireAdminPermission('dashboard.view'), async (_req, res) => ok(res, await systemHealth()));
r.get('/risk-signals', requireAdminPermission('reports.manage'), async (_req, res) => ok(res, await riskSignals()));
// Count only, for the overview card: cached for 5 minutes so a busy dashboard does not repeat the scan.
let riskCache = { at: 0, total: 0 };
r.get('/risk-signals/count', requireAdminPermission('dashboard.view'), async (_req, res) => {
  if (Date.now() - riskCache.at > 5 * 60 * 1000) riskCache = { at: Date.now(), total: (await riskSignals()).total };
  return ok(res, { total: riskCache.total });
});
r.get(
  '/search/insights',
  requireAdminPermission('dashboard.view'),
  validate({ query: Joi.object({ scope: Joi.string().valid('jobs', 'candidates').default('jobs'), days: Joi.number().integer().valid(7, 30, 90, 180).default(30) }) }),
  async (req, res) => ok(res, await searchInsights(req.query)),
);
r.get('/dashboard', requireAdminPermission('dashboard.view'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await analytics.adminDashboard(req.query)),
);
r.get('/analytics', requireAdminPermission('dashboard.view'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await analytics.adminAnalytics(req.query)),
);
r.get('/stats/logins', requireAdminPermission('dashboard.view'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await analytics.loginStats(req.query)),
);
r.get('/stats/messaging', requireAdminPermission('dashboard.view'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await analytics.messagingStats(req.query)),
);
r.get('/stats/candidates', requireAdminPermission('candidates.manage'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await users.candidateStats(req.query)),
);
r.get('/stats/employers', requireAdminPermission('employers.manage'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await users.employerStats(req.query)),
);
r.get('/stats/jobs', requireAdminPermission('jobs.manage'), validate({ query: Joi.object(timespan) }), async (req, res) =>
  ok(res, await jobs.jobStats(req.query)),
);

/* ============================================================ candidates */

const candidateQuery = Joi.object({
  ...listBase,
  status: Joi.string().valid(...Object.values(USER_STATUS)),
  source: Joi.string().valid(...USER_SOURCE),
  label: Joi.string(),
  situationTag: Joi.string(),
  verified: Joi.boolean(),
  hasResume: Joi.boolean(),
  city: Joi.string(),
  skill: Joi.string(),
  experienceLevel: Joi.string(),
  jobApplied: Joi.boolean(),
  sort: Joi.string().valid('-createdAt', 'createdAt', 'fullName', '-lastActiveAt', '-lastLoginAt').default('-createdAt'),
});
const cand = Router();
cand.use(requireAdminPermission('candidates.manage'));

/* Full profile editing for any candidate: the candidate's own profile routes, acting as that candidate. */
cand.use(
  '/:id/profile',
  validate({ params: Joi.object({ id: objectId.required() }).unknown(true) }),
  async (req, _res, next) => {
    const target = await User.findOne({ _id: req.params.id, role: ROLES.CANDIDATE });
    if (!target) return next(ApiError.notFound('Candidate not found'));
    req.subject = Object.assign(Object.create(req), { user: target });
    if (req.method !== 'GET') audit(req, { action: 'candidate.profile_edit', entity: 'User', entityId: target._id, changes: { path: req.path } });
    return next();
  },
  profileRouter((req) => req.subject),
);
cand.get('/', validate({ query: candidateQuery }), async (req, res) =>
  paginated(res, await users.listCandidates(req.query, parsePagination(req.query, { allowedSort: ['createdAt', 'fullName', 'lastActiveAt', 'lastLoginAt'] }))),
);
cand.get('/export', heavyLimiter, validate({ query: candidateQuery }), async (req, res) => {
  audit(req, { action: 'candidates.export', entity: 'User', changes: req.query });
  return exportRows(res, {
    format: req.query.format,
    filename: 'candidates',
    sheet: 'Candidates',
    columns: users.CANDIDATE_EXPORT_COLUMNS,
    rows: await users.exportCandidates(req.query),
  });
});
cand.post(
  '/import',
  heavyLimiter,
  upload('excel', 'file'),
  validate({ query: Joi.object({ mode: Joi.string().valid('create', 'update', 'replace').default('create'), dryRun: Joi.boolean().default(false) }) }),
  async (req, res) => {
    const result = await users.importCandidates(req.user, req.file.buffer, req.query);
    audit(req, { action: 'candidates.import', entity: 'User', changes: { mode: req.query.mode, ...result, errors: undefined } });
    return ok(res, result, req.query.dryRun ? 'Duplicate check completed' : 'Import completed');
  },
);
cand.post(
  '/',
  validate({
    body: Joi.object({
      fullName: Joi.string().trim().min(2).max(120).required(),
      email: email.required(),
      mobile: mobile.required(),
      password,
      gender: Joi.string().max(30),
      experienceLevel: Joi.string().max(60),
      sendActivation: Joi.boolean().default(true),
    }),
  }),
  async (req, res) => created(res, await users.adminCreateCandidate(req.user, req.body), 'Candidate created'),
);
cand.post(
  '/bulk',
  validate({ body: Joi.object({ ids: bulkIds(BULK_LIMITS.bulkAction), action: bulkAction.required(), value: Joi.string().max(100) }) }),
  async (req, res) => {
    const result = await users.bulkUserAction(req.user, req.body.ids, req.body.action, req.body.value);
    audit(req, { action: `candidates.bulk.${req.body.action}`, entity: 'User', changes: { ids: req.body.ids, value: req.body.value } });
    return ok(res, result, 'Updated');
  },
);
cand.post('/export-resumes', heavyLimiter, validate({ body: Joi.object({ ids: bulkIds(500) }) }), async (req, res) =>
  users.streamCandidateResumes(req.body.ids, res),
);
cand.get('/:id', validate({ params: idParam }), async (req, res) => ok(res, await users.getCandidate(req.params.id)));
cand.patch(
  '/:id',
  validate({ params: idParam, body: Joi.object({ user: Joi.object().unknown(true), profile: Joi.object().unknown(true) }).min(1) }),
  async (req, res) => {
    const result = await users.updateUser(req.user, req.params.id, req.body);
    audit(req, { action: 'candidate.update', entity: 'User', entityId: req.params.id, changes: req.body });
    return ok(res, result, 'Candidate updated');
  },
);
cand.patch('/:id/tracking', validate({ params: idParam, body: trackingBody }), async (req, res) =>
  ok(res, await users.adminTracking(req.user, 'candidate', req.params.id, req.body), 'Updated'),
);
cand.get('/:id/applications', validate({ params: idParam, query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await apps.myApplications(new mongoose.Types.ObjectId(req.params.id), parsePagination(req.query))),
);
r.use('/candidates', cand);

/* ============================================================ employers */

const employerQuery = Joi.object({
  ...listBase,
  type: Joi.string().valid('company', 'consultancy'),
  status: Joi.string().valid(...Object.values(USER_STATUS)),
  source: Joi.string().valid(...USER_SOURCE),
  label: Joi.string(),
  kycStatus: Joi.string().valid(...DOCUMENT_STATUS),
  verified: Joi.boolean(),
  situationTag: Joi.string(),
  city: Joi.string(),
  industry: Joi.string(),
  sort: Joi.string().valid('-createdAt', 'createdAt', 'name', '-stats.activeJobs').default('-createdAt'),
});
const quotaSchema = Joi.object(
  Object.fromEntries(USAGE_METRICS.map((m) => [m, Joi.object(Object.fromEntries(QUOTA_PERIODS.map((p) => [p, Joi.number().integer().min(0).allow(null)])))])),
);

const emp = Router();
emp.use(requireAdminPermission('employers.manage'));
emp.get('/', validate({ query: employerQuery }), async (req, res) =>
  paginated(res, await users.listEmployers(req.query, parsePagination(req.query, { allowedSort: ['createdAt', 'name', 'stats.activeJobs'] }))),
);
emp.get('/export', heavyLimiter, validate({ query: employerQuery }), async (req, res) => {
  const { items } = await users.listEmployers(req.query, { page: 1, limit: 100000, skip: 0, sort: { createdAt: -1 } });
  return exportRows(res, { format: req.query.format, filename: 'employers', sheet: 'Employers', columns: users.EMPLOYER_EXPORT_COLUMNS, rows: items });
});
emp.post('/import', heavyLimiter, upload('excel', 'file'), async (req, res) =>
  ok(res, await users.importEmployers(req.user, req.file.buffer), 'Import completed'),
);
emp.get('/kyc-queue', requireAdminPermission('documents.verify'), validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await users.kycQueue(parsePagination(req.query))),
);
emp.post(
  '/kyc-reminders',
  requireAdminPermission('documents.verify'),
  validate({ body: Joi.object({ ids: bulkIds(BULK_LIMITS.bulkMessage) }) }),
  async (req, res) => ok(res, await users.documentReminder(req.body.ids), 'Reminders sent'),
);
emp.post(
  '/',
  validate({
    body: Joi.object({
      employerType: Joi.string().valid('company', 'consultancy').required(),
      organizationName: Joi.string().trim().min(2).max(200).required(),
      fullName: Joi.string().trim().min(2).max(120).required(),
      email: email.required(),
      mobile: mobile.required(),
      password,
      website: Joi.string().uri().allow(''),
      status: Joi.string().valid('active', 'pending'),
      sendActivation: Joi.boolean().default(true),
    }),
  }),
  async (req, res) => created(res, await users.adminCreateEmployer(req.user, req.body), 'Employer created'),
);
emp.post(
  '/bulk',
  validate({ body: Joi.object({ ids: bulkIds(BULK_LIMITS.bulkAction), action: bulkAction.required(), value: Joi.string().max(100) }) }),
  async (req, res) => {
    const result = await users.bulkEmployerAction(req.user, req.body.ids, req.body.action, req.body.value);
    audit(req, { action: `employers.bulk.${req.body.action}`, entity: 'Organization', changes: { ids: req.body.ids, value: req.body.value } });
    return ok(res, result, 'Updated');
  },
);
emp.get('/:id', validate({ params: idParam }), async (req, res) => ok(res, await users.getEmployer(req.params.id)));
emp.patch('/:id', validate({ params: idParam, body: Joi.object().unknown(true).min(1) }), async (req, res) => {
  const org = await users.updateEmployer(req.user, req.params.id, req.body);
  audit(req, { action: 'employer.update', entity: 'Organization', entityId: req.params.id, changes: req.body });
  return ok(res, org, 'Employer updated');
});
emp.post(
  '/:id/duplicate',
  validate({
    params: idParam,
    body: Joi.object({
      organizationName: Joi.string().max(200),
      fullName: Joi.string().min(2).max(120).required(),
      email: email.required(),
      mobile: mobile.required(),
    }),
  }),
  async (req, res) => created(res, await users.duplicateEmployer(req.user, req.params.id, req.body), 'Employer duplicated'),
);
emp.post(
  '/:id/credits',
  requireAdminPermission('payments.manage'),
  validate({
    params: idParam,
    body: Joi.object({
      credits: Joi.object(
        Object.fromEntries(
          ['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search'].map((k) => [k, Joi.number().integer()]),
        ),
      )
        .min(1)
        .required(),
      note: Joi.string().max(300),
    }),
  }),
  async (req, res) => {
    const result = await users.adjustCredits(req.user, req.params.id, req.body.credits, req.body.note);
    audit(req, { action: 'employer.credits', entity: 'Organization', entityId: req.params.id, changes: req.body });
    return ok(res, result, 'Credits updated');
  },
);
emp.patch(
  '/:id/documents/:docId',
  requireAdminPermission('documents.verify'),
  validate({
    params: Joi.object({ id: objectId.required(), docId: objectId.required() }),
    body: Joi.object({
      status: Joi.string()
        .valid(...DOCUMENT_STATUS)
        .required(),
      remarks: Joi.string().max(1000).allow(''),
    }),
  }),
  async (req, res) => {
    const org = await users.verifyDocument(req.user, req.params.id, req.params.docId, req.body);
    audit(req, { action: 'employer.document_review', entity: 'Organization', entityId: req.params.id, changes: req.body });
    return ok(res, { kycStatus: org.kycStatus, isVerified: org.isVerified, documents: org.documents }, 'Document reviewed');
  },
);
emp.patch('/:id/tracking', validate({ params: idParam, body: trackingBody }), async (req, res) =>
  ok(res, await users.adminTracking(req.user, 'organization', req.params.id, req.body), 'Updated'),
);
emp.post(
  '/:id/members',
  validate({
    params: idParam,
    body: Joi.object({
      fullName: Joi.string().min(2).max(120).required(),
      email: email.required(),
      mobile,
      password,
      designation: Joi.string().max(120),
      memberRole: Joi.string()
        .valid(...EMPLOYER_MEMBER_ROLES)
        .default('recruiter'),
      permissions: Joi.array().items(Joi.string().valid(...EMPLOYER_PERMISSIONS)),
      quotas: quotaSchema,
    }),
  }),
  async (req, res) => created(res, await addMember({ ...req, orgId: req.params.id }, req.body), 'Member added'),
);
emp.patch(
  '/:id/members/:memberId',
  validate({
    params: Joi.object({ id: objectId.required(), memberId: objectId.required() }),
    body: Joi.object({
      fullName: Joi.string().max(120),
      designation: Joi.string().max(120),
      memberRole: Joi.string().valid(...EMPLOYER_MEMBER_ROLES),
      permissions: Joi.array().items(Joi.string().valid(...EMPLOYER_PERMISSIONS)),
      quotas: quotaSchema,
      status: Joi.string().valid('active', 'suspended'),
    }).min(1),
  }),
  async (req, res) => {
    const result = await updateMember({ ...req, orgId: req.params.id }, req.params.memberId, req.body);
    audit(req, { action: 'employer.member_update', entity: 'User', entityId: req.params.memberId, changes: req.body });
    return ok(res, result, 'Member updated');
  },
);
r.use('/employers', emp);

/* ================================================================= users */

r.post('/users/:id/impersonate', requireAdminPermission('users.impersonate'), validate({ params: idParam }), async (req, res) => {
  const result = await impersonate(req, req.params.id);
  audit(req, { action: 'user.impersonate', entity: 'User', entityId: req.params.id });
  return ok(res, result, 'Logged in as user. Session expires in 2 hours');
});
r.post(
  '/users/:id/send-link',
  requireAdminPermission('users.manage'),
  validate({ params: idParam, body: Joi.object({ type: Joi.string().valid('activation', 'password_reset').required() }) }),
  async (req, res) => ok(res, await users.sendAccountLink(req.user, req.params.id, req.body.type), 'E-mail sent'),
);
r.get('/users/:id', requireAdminPermission('users.manage'), validate({ params: idParam }), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, { user: user.toSafeJSON({ includeAdminFields: true }) });
});
r.patch(
  '/users/:id',
  requireAdminPermission('users.manage'),
  validate({ params: idParam, body: Joi.object({ user: Joi.object().unknown(true), profile: Joi.object().unknown(true) }).min(1) }),
  async (req, res) => {
    const result = await users.updateUser(req.user, req.params.id, req.body);
    audit(req, { action: 'user.update', entity: 'User', entityId: req.params.id, changes: req.body });
    return ok(res, result, 'User updated');
  },
);
r.post(
  '/users/bulk',
  requireAdminPermission('users.manage'),
  validate({ body: Joi.object({ ids: bulkIds(BULK_LIMITS.bulkAction), action: bulkAction.required(), value: Joi.string().max(100) }) }),
  async (req, res) => {
    const result = await users.bulkUserAction(req.user, req.body.ids, req.body.action, req.body.value);
    audit(req, { action: `users.bulk.${req.body.action}`, entity: 'User', changes: req.body });
    return ok(res, result, 'Updated');
  },
);
r.get(
  '/users/:id/activity',
  requireAdminPermission('users.manage'),
  validate({ params: idParam, query: Joi.object({ ...pagination, ...timespan, type: Joi.string() }) }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = { user: req.params.id, ...dateRangeFilter(req.query), ...(req.query.type ? { type: req.query.type } : {}) };
    const [items, total] = await Promise.all([Activity.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(), Activity.countDocuments(f)]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);
r.get('/users/:id/usage', requireAdminPermission('users.manage'), validate({ params: idParam }), async (req, res) =>
  ok(res, await analytics.userUsage(req.params.id)),
);

r.post(
  '/messages/bulk',
  requireAdminPermission('notifications.send'),
  heavyLimiter,
  validate({
    body: Joi.object({
      userIds: Joi.array().items(objectId).max(BULK_LIMITS.bulkMessage),
      audience: Joi.string().valid('candidates', 'employers', 'companies', 'consultancies'),
      filters: Joi.object().unknown(true).default({}),
      channels: Joi.array()
        .items(Joi.string().valid('email', 'sms', 'whatsapp', 'arattai', 'in_app', 'push'))
        .min(1)
        .required(),
      subject: Joi.string().max(300).required(),
      message: Joi.string().max(5000).required(),
      html: Joi.string().max(200000),
    }).or('userIds', 'audience'),
  }),
  async (req, res) => {
    const result = await users.bulkMessage(req.user, req.body);
    audit(req, { action: 'messages.bulk', entity: 'User', changes: { audience: req.body.audience, channels: req.body.channels, count: result.recipients } });
    return ok(res, result, 'Messages queued');
  },
);

/* ================================================================== jobs */

const jobQuery = Joi.object({
  ...listBase,
  status: Joi.string().valid('draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected', 'trashed'),
  kind: Joi.string().valid('job', 'internship'),
  organizationType: Joi.string().valid('company', 'consultancy'),
  organization: objectId,
  source: Joi.string(),
  label: Joi.string(),
  featured: Joi.boolean(),
  city: Joi.string(),
  department: Joi.string(),
  sort: Joi.string().valid('-createdAt', 'createdAt', 'title', '-publishedAt', '-stats.applications', '-stats.views').default('-createdAt'),
});
const jb = Router();
jb.use(requireAdminPermission('jobs.manage'));
jb.get('/', validate({ query: jobQuery }), async (req, res) =>
  paginated(
    res,
    await jobs.listJobs(req.query, parsePagination(req.query, { allowedSort: ['createdAt', 'title', 'publishedAt', 'stats.applications', 'stats.views'] })),
  ),
);
jb.get('/export', heavyLimiter, validate({ query: jobQuery }), async (req, res) => {
  const { items } = await jobs.listJobs(req.query, { page: 1, limit: 100000, skip: 0, sort: { createdAt: -1 } });
  return exportRows(res, { format: req.query.format, filename: 'jobs', sheet: 'Jobs', columns: jobs.JOB_EXPORT_COLUMNS, rows: items });
});
jb.post(
  '/',
  validate({
    body: Joi.object({
      ...jobFields,
      title: Joi.string().min(2).max(200).required(),
      organizationId: objectId.required(),
      publish: Joi.boolean().default(false),
      featured: Joi.boolean(),
      prefillFrom: objectId,
    }),
  }),
  async (req, res) => {
    const job = await jobs.postOnBehalf(req.user, req.body);
    audit(req, { action: 'job.post_on_behalf', entity: 'Job', entityId: job._id });
    return created(res, job, 'Job created');
  },
);
jb.post(
  '/import',
  heavyLimiter,
  upload('excel', 'file'),
  validate({ query: Joi.object({ organizationId: objectId.required(), publish: Joi.boolean().default(false) }) }),
  async (req, res) => ok(res, await jobs.importJobs(req.user, req.query.organizationId, req.file.buffer, req.query.publish), 'Import completed'),
);
jb.post(
  '/bulk',
  validate({
    body: Joi.object({
      ids: bulkIds(BULK_LIMITS.bulkAction),
      action: Joi.string()
        .valid(
          'approve',
          'unapprove',
          'admin_review',
          'reject',
          'close',
          'expire',
          'trash',
          'restore',
          'delete',
          'feature',
          'unfeature',
          'label_add',
          'label_remove',
          'edit',
        )
        .required(),
      value: Joi.alternatives(Joi.string().max(100), Joi.object(jobFields)),
    }),
  }),
  async (req, res) => {
    const result = await jobs.bulkJobAction(req.user, req.body.ids, req.body.action, req.body.value);
    audit(req, { action: `jobs.bulk.${req.body.action}`, entity: 'Job', changes: { ids: req.body.ids } });
    return ok(res, result, 'Updated');
  },
);
jb.get('/:id', validate({ params: idParam }), async (req, res) => ok(res, await jobs.getJob(req.params.id)));
jb.patch(
  '/:id',
  validate({
    params: idParam,
    body: Joi.object({
      ...jobFields,
      status: Joi.string().valid('draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected', 'trashed'),
      statusReason: Joi.string().max(500),
      labels: stringList(10, 40),
      publishedAt: Joi.date(),
      deadlineAt: Joi.date(),
      expiresAt: Joi.date(),
    }).min(1),
  }),
  async (req, res) => {
    const job = await jobs.updateJob(req.user, req.params.id, req.body);
    audit(req, { action: 'job.update', entity: 'Job', entityId: req.params.id, changes: Object.keys(req.body) });
    return ok(res, job, 'Job updated');
  },
);
jb.post('/:id/duplicate', validate({ params: idParam }), async (req, res) => created(res, await jobs.duplicateJob(req.user, req.params.id), 'Job duplicated'));
jb.post(
  '/:id/assign-applicants',
  requireAdminPermission('applications.manage'),
  validate({ params: idParam, body: Joi.object({ candidateIds: bulkIds(BULK_LIMITS.assignApplicants) }) }),
  async (req, res) => {
    const result = await apps.adminAssign(req.user, req.params.id, req.body.candidateIds);
    audit(req, { action: 'job.assign_applicants', entity: 'Job', entityId: req.params.id, changes: { count: req.body.candidateIds.length } });
    return ok(res, result, 'Applicants assigned');
  },
);
jb.post(
  '/:id/invites',
  validate({ params: idParam, body: Joi.object({ candidateIds: bulkIds(BULK_LIMITS.jobAlertCandidates), message: Joi.string().max(2000).allow('') }) }),
  async (req, res) => ok(res, await jobs.adminInvite(req.user, req.params.id, req.body.candidateIds, req.body.message), 'Invites sent'),
);
r.use('/jobs', jb);

/* ======================================================== responses (ATS) */

const responseQuery = Joi.object({
  ...listBase,
  organization: objectId,
  job: objectId,
  stage: Joi.string().valid(...PIPELINE_STAGES),
  screeningStatus: Joi.string().valid(...SCREENING_STATUS),
  callingStatus: Joi.string().valid(...CALLING_STATUS),
  view: Joi.string().valid('all', 'new', 'viewed', 'pending'),
  kind: Joi.string().valid('job', 'internship'),
  source: Joi.string(),
  sort: Joi.string().valid('-createdAt', 'createdAt', '-matchScore').default('-createdAt'),
});
const rs = Router();
rs.use(requireAdminPermission('applications.manage'));
rs.get('/', validate({ query: responseQuery }), async (req, res) => {
  const result = await apps.listResponses(req.user, req.query, parsePagination(req.query, { allowedSort: ['createdAt', 'matchScore'] }));
  return ok(res, result.items, 'OK', {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / result.limit),
    stages: result.stages,
  });
});
rs.get('/export', heavyLimiter, validate({ query: responseQuery }), async (req, res) =>
  exportRows(res, {
    format: req.query.format,
    filename: 'applicant-responses',
    sheet: 'Responses',
    columns: apps.RESPONSE_COLUMNS,
    rows: await apps.exportResponses(req.user, req.query),
  }),
);
rs.get('/export-resumes', heavyLimiter, validate({ query: responseQuery }), async (req, res) => apps.streamResumesZip(req.user, req.query, res));
rs.get('/:id', validate({ params: idParam }), async (req, res) => ok(res, await apps.getResponse(req.user, req.params.id)));
rs.patch(
  '/:id',
  validate({
    params: idParam,
    body: Joi.object({
      stage: Joi.string().valid(...PIPELINE_STAGES),
      screeningStatus: Joi.string().valid(...SCREENING_STATUS),
      callingStatus: Joi.string().valid(...CALLING_STATUS),
      messagingStatus: Joi.array().items(Joi.string().valid(...MESSAGING_STATUS)),
      comment: Joi.string().max(2000),
      note: Joi.string().max(500),
    }).min(1),
  }),
  async (req, res) => ok(res, await apps.updateResponse(req.user, req.params.id, req.body), 'Updated'),
);
r.use('/responses', rs);

/* =============================================================== admins */

const adm = Router();
adm.use(requireAdminPermission('admins.manage'));
adm.get('/', async (_req, res) => ok(res, await users.listAdmins()));
adm.get('/permissions', (_req, res) => ok(res, ADMIN_PERMISSIONS));
adm.post(
  '/',
  validate({
    body: Joi.object({
      fullName: Joi.string().min(2).max(120).required(),
      email: email.required(),
      mobile,
      password: password.required(),
      role: Joi.string().valid(ROLES.ADMIN, ROLES.SUPER_ADMIN).default(ROLES.ADMIN),
      nickname: Joi.string().max(80),
      designation: Joi.string().max(120),
      permissions: Joi.array().items(Joi.string().valid(...ADMIN_PERMISSIONS)),
    }),
  }),
  async (req, res) => {
    if (req.body.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) throw ApiError.forbidden('Only super admins can create super admins');
    const admin = await users.createAdmin(req.body);
    audit(req, { action: 'admin.create', entity: 'User', entityId: admin._id });
    return created(res, admin, 'Admin created');
  },
);
adm.patch(
  '/:id',
  validate({
    params: idParam,
    body: Joi.object({
      fullName: Joi.string().max(120),
      role: Joi.string().valid(ROLES.ADMIN, ROLES.SUPER_ADMIN),
      status: Joi.string().valid('active', 'suspended', 'blocked'),
      permissions: Joi.array().items(Joi.string().valid(...ADMIN_PERMISSIONS)),
      password,
    }).min(1),
  }),
  async (req, res) => {
    const admin = await users.updateAdmin(req.params.id, req.body);
    audit(req, { action: 'admin.update', entity: 'User', entityId: req.params.id, changes: { ...req.body, password: req.body.password ? '***' : undefined } });
    return ok(res, admin, 'Admin updated');
  },
);
r.use('/admins', adm);

/** Admin's own public profile (nickname / designation shown on blogs, social links, logo). */
r.get('/profile', async (req, res) => ok(res, (await User.findById(req.user._id)).toSafeJSON()));
r.patch(
  '/profile',
  validate({
    body: Joi.object({
      fullName: Joi.string().max(120),
      displayName: Joi.string().max(80),
      nickname: Joi.string().max(80),
      designation: Joi.string().max(120),
      bio: Joi.string().max(5000).allow(''),
      socialLinks: Joi.array().items(socialLink).max(15),
      avatar: Joi.object({ key: Joi.string(), url: Joi.string() }),
      logo: Joi.object({ key: Joi.string(), url: Joi.string() }),
    }).min(1),
  }),
  async (req, res) => ok(res, await users.updateAdminProfile(req.user, req.body), 'Profile updated'),
);

/* ============================================================= settings */

/**
 * Provider health checks - send one real message synchronously and return the provider result,
 * so a wrong key / sender / DLT template shows up immediately instead of in queue logs.
 */
r.post('/settings/test-email', requireAdminPermission('settings.manage'), validate({ body: Joi.object({ to: email.required() }) }), async (req, res) => {
  const { subject, html } = renderEmail('generic', { title: 'Freejobwala test e-mail', html: '<p>E-mail delivery is configured correctly.</p>' });
  try {
    await deliverEmail({ to: req.body.to, subject, html, category: 'test', sentBy: req.user._id });
    return ok(res, { delivered: true }, 'Test e-mail sent');
  } catch (err) {
    throw ApiError.badRequest(`E-mail provider error: ${err.message}`, undefined, 'PROVIDER_ERROR');
  }
});
r.post(
  '/settings/test-sms',
  requireAdminPermission('settings.manage'),
  validate({
    body: Joi.object({ mobile: mobile.required(), template: Joi.string().valid('otp', 'interview', 'interview_reminder', 'generic', 'bulk').default('otp') }),
  }),
  async (req, res) => {
    const vars = {
      otp: '123456',
      minutes: 5,
      jobTitle: 'Test Job',
      company: 'Freejobwala',
      when: 'today',
      title: 'Test',
      body: 'SMS configured',
      message: 'Test SMS',
    };
    try {
      const log = await deliverSms({ to: String(req.body.mobile).replace(/\D/g, '').slice(-10), template: req.body.template, vars, user: req.user._id });
      if (log?.status === 'skipped') throw ApiError.badRequest(log.error, undefined, 'SMS_NOT_SET_UP');
      const via = log?.route === 'otp_api' ? 'apitxt Unified OTP API' : log?.route === 'dlt' ? 'DLT template' : config.sms.provider;
      return ok(res, { delivered: true, route: log?.route, providerId: log?.providerId }, `Test SMS accepted by ${via}${log?.providerId ? ` (request ${log.providerId})` : ''}`);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(`SMS provider error: ${err.message}`, undefined, 'PROVIDER_ERROR');
    }
  },
);

r.get('/settings', requireAdminPermission('settings.manage'), validate({ query: Joi.object({ group: Joi.string() }) }), async (req, res) =>
  ok(res, await listSettings({ group: req.query.group })),
);
r.put(
  '/settings/:key',
  requireAdminPermission('settings.manage'),
  validate({
    params: Joi.object({
      key: Joi.string()
        .valid(...Object.keys(DEFAULT_SETTINGS))
        .required(),
    }),
    body: Joi.object({ value: Joi.any().required() }),
  }),
  async (req, res) => {
    await saveSetting(req.params.key, req.body.value, req.user._id);
    audit(req, {
      action: 'setting.update',
      entity: 'Setting',
      entityId: req.params.key,
      changes: DEFAULT_SETTINGS[req.params.key]?.isSecret ? '***' : req.body.value,
    });
    return ok(res, { key: req.params.key }, 'Setting saved');
  },
);

/* ============================================================ user and delivery logs */

r.get(
  '/users',
  requireAdminPermission('users.manage'),
  validate({
    query: Joi.object({
      ...pagination,
      ...timespan,
      q: Joi.string().max(100).allow(''),
      role: Joi.string().valid(...Object.values(ROLES)),
      status: Joi.string().valid(...Object.values(USER_STATUS)),
      organization: objectId,
    }),
  }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = { ...dateRangeFilter(req.query) };
    if (req.query.role) f.role = req.query.role;
    if (req.query.status) f.status = req.query.status;
    if (req.query.organization) f['employer.organization'] = req.query.organization;
    if (req.query.q) {
      const rx = containsRegex(req.query.q);
      f.$or = [{ fullName: rx }, { email: rx }, { mobile: rx }, { username: rx }, { uid: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(f)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .select('uid fullName email mobile role status isVerified lastLoginAt createdAt employer.organization employer.memberRole employer.isOwner')
        .populate('employer.organization', 'name employerType')
        .lean(),
      User.countDocuments(f),
    ]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);

const deliveryLogRoute = (Model, filterKeys) => async (req, res) => {
  const p = parsePagination(req.query);
  const f = { ...dateRangeFilter(req.query) };
  for (const k of filterKeys) if (req.query[k]) f[k] = req.query[k];
  if (req.query.q) f.to = containsRegex(req.query.q);
  const [items, total] = await Promise.all([
    Model.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('user', 'fullName email').select('-body -html -events').lean(),
    Model.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
};

r.get(
  '/email-logs',
  requireAdminPermission('audit.view'),
  validate({ query: Joi.object({ ...pagination, ...timespan, q: Joi.string().max(100).allow(''), status: Joi.string().max(30), category: Joi.string().max(30) }) }),
  deliveryLogRoute(EmailLog, ['status', 'category']),
);

r.get(
  '/message-logs',
  requireAdminPermission('audit.view'),
  validate({ query: Joi.object({ ...pagination, ...timespan, q: Joi.string().max(100).allow(''), status: Joi.string().max(30), channel: Joi.string().valid('sms', 'whatsapp', 'push', 'arattai') }) }),
  deliveryLogRoute(MessageLog, ['status', 'channel']),
);

r.get(
  '/login-attempts',
  requireAdminPermission('audit.view'),
  validate({ query: Joi.object({ ...pagination, ...timespan, q: Joi.string().max(100).allow(''), role: Joi.string().max(30), success: Joi.boolean() }) }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = { ...dateRangeFilter(req.query) };
    if (req.query.role) f.role = req.query.role;
    if (req.query.success !== undefined) f.success = req.query.success;
    if (req.query.q) f.identifier = containsRegex(req.query.q);
    const [items, total] = await Promise.all([LoginAttempt.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(), LoginAttempt.countDocuments(f)]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);

/* ============================================================ audit logs */

r.get(
  '/audit-logs',
  requireAdminPermission('audit.view'),
  validate({
    query: Joi.object({
      ...pagination,
      ...timespan,
      actor: objectId,
      action: Joi.string(),
      entity: Joi.string(),
      entityId: Joi.string(),
      format: exportFormat,
    }),
  }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = { ...dateRangeFilter(req.query) };
    for (const k of ['actor', 'entity', 'entityId']) if (req.query[k]) f[k] = req.query[k];
    if (req.query.action) f.action = new RegExp(`^${req.query.action.replace(/[^\w.]/g, '')}`);
    const [items, total] = await Promise.all([
      AuditLog.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('actor', 'fullName email role').lean(),
      AuditLog.countDocuments(f),
    ]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);

export default r;
