import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, optionalAuth, requireAdminPermission } from '../../shared/middleware/auth.js';
import { formLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { exportRows } from '../../shared/utils/excel.js';
import { objectId, idParam, pagination, timespan, email, mobile, bulkIds, exportFormat } from '../../shared/validators/common.js';
import { ROLES, BLOCKLIST_TYPES, REPORT_REASONS } from '../../shared/constants/index.js';
import { audit } from '../activity/activity.service.js';
import * as s from './moderation.service.js';

const allReasons = [...new Set(Object.values(REPORT_REASONS).flat())];

export const router = Router();

router.get('/report-reasons', (_req, res) => ok(res, REPORT_REASONS));
router.post(
  '/reports',
  formLimiter,
  optionalAuth,
  validate({
    body: Joi.object({
      targetType: Joi.string().valid('job', 'organization', 'candidate').required(),
      targetId: objectId.required(),
      reason: Joi.string()
        .valid(...allReasons)
        .required(),
      details: Joi.string().trim().max(2000).allow(''),
      contact: Joi.object({ name: Joi.string().max(120), email, mobile }),
    }),
  }),
  async (req, res) => created(res, await s.createReport(req.user, req.body), 'Thank you. Our team will review this report'),
);

router.get(
  '/comments/:targetType/:id',
  validate({
    params: Joi.object({ targetType: Joi.string().valid('candidate', 'organization').required(), id: objectId.required() }),
    query: Joi.object(pagination),
  }),
  async (req, res) => paginated(res, await s.publicComments(req.params.targetType, req.params.id, parsePagination(req.query))),
);
router.post(
  '/comments',
  authenticate,
  validate({
    body: Joi.object({
      targetType: Joi.string().valid('candidate', 'organization').required(),
      targetId: objectId.required(),
      body: Joi.string().trim().min(2).max(3000).required(),
      rating: Joi.number().integer().min(1).max(5),
    }),
  }),
  async (req, res) => created(res, await s.addComment(req.user, req.body), 'Comment submitted for review'),
);
router.get('/comments/mine', authenticate, validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.myComments(req.user, parsePagination(req.query))),
);
router.delete('/comments/:id', authenticate, validate({ params: idParam }), async (req, res) => {
  await s.deleteOwnComment(req.user, req.params.id);
  return ok(res, null, 'Comment deleted');
});

router.get('/blocks', authenticate, async (req, res) => ok(res, await s.myBlocks(req.user)));
router.post(
  '/blocks/organizations/:id',
  authenticate,
  authorize(ROLES.CANDIDATE),
  validate({ params: idParam, body: Joi.object({ reason: Joi.string().max(500).allow('') }) }),
  async (req, res) => ok(res, await s.candidateBlockOrg(req.user, req.params.id, req.body.reason), 'Employer blocked'),
);
router.delete('/blocks/organizations/:id', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.candidateUnblockOrg(req.user, req.params.id), 'Employer unblocked'),
);

/* ------------------------------------------------------------------ admin */

export const adminRouter = Router();

const reportQuery = Joi.object({
  ...pagination,
  ...timespan,
  targetType: Joi.string().valid('job', 'organization', 'candidate'),
  status: Joi.string().valid('open', 'in_review', 'resolved', 'dismissed'),
  reason: Joi.string(),
  organization: objectId,
  format: exportFormat,
});
adminRouter.get('/reports', requireAdminPermission('reports.manage'), validate({ query: reportQuery }), async (req, res) =>
  paginated(res, await s.listReports(req.query, parsePagination(req.query))),
);
adminRouter.get('/reports/export', requireAdminPermission('reports.manage'), validate({ query: reportQuery }), async (req, res) => {
  const { items } = await s.listReports(req.query, { page: 1, limit: 50000, skip: 0, sort: { createdAt: -1 } });
  return exportRows(res, {
    format: req.query.format,
    filename: 'reported-issues',
    columns: [
      { header: 'Date', key: 'createdAt' },
      { header: 'Type', key: 'targetType' },
      { header: 'Job', key: 'job.title' },
      { header: 'Job ID', key: 'job.uid' },
      { header: 'Employer', key: 'organization.name' },
      { header: 'Employer ID', key: 'organization.uid' },
      { header: 'Candidate', key: 'candidate.fullName' },
      { header: 'Candidate ID', key: 'candidate.uid' },
      { header: 'Reason', key: 'reason' },
      { header: 'Details', key: 'details' },
      { header: 'Reported By', key: 'reporter.fullName' },
      { header: 'Reporter Role', key: 'reporterRole' },
      { header: 'Status', key: 'status' },
      { header: 'Admin Notes', key: 'adminNotes' },
    ],
    rows: items,
  });
});
adminRouter.patch(
  '/reports/:id',
  requireAdminPermission('reports.manage'),
  validate({
    params: idParam,
    body: Joi.object({ status: Joi.string().valid('open', 'in_review', 'resolved', 'dismissed').required(), adminNotes: Joi.string().max(2000).allow('') }),
  }),
  async (req, res) => {
    const r = await s.updateReport(req.user, req.params.id, req.body);
    audit(req, { action: 'report.update', entity: 'Report', entityId: r._id, changes: req.body });
    return ok(res, r, 'Updated');
  },
);

adminRouter.get(
  '/comments',
  requireAdminPermission('comments.moderate'),
  validate({
    query: Joi.object({
      ...pagination,
      ...timespan,
      direction: Joi.string().valid('employer_to_candidate', 'candidate_to_employer'),
      status: Joi.string().valid('pending', 'approved', 'spam', 'trashed'),
      mine: Joi.boolean(),
      adminOnly: Joi.boolean(),
      targetOrgType: Joi.string().valid('company', 'consultancy'),
      q: Joi.string().allow(''),
    }),
  }),
  async (req, res) => {
    const r = await s.adminComments(req.user, req.query, parsePagination(req.query));
    return ok(res, r.items, 'OK', { page: r.page, limit: r.limit, total: r.total, totalPages: Math.ceil(r.total / r.limit), counts: r.counts });
  },
);
adminRouter.post(
  '/comments/moderate',
  requireAdminPermission('comments.moderate'),
  validate({ body: Joi.object({ ids: bulkIds(1000), status: Joi.string().valid('pending', 'approved', 'spam', 'trashed').required() }) }),
  async (req, res) => ok(res, await s.moderateComments(req.user, req.body.ids, req.body.status), 'Updated'),
);
adminRouter.post(
  '/comments',
  requireAdminPermission('comments.moderate'),
  validate({
    body: Joi.object({
      targetType: Joi.string().valid('candidate', 'organization').required(),
      targetId: objectId.required(),
      body: Joi.string().trim().min(2).max(3000).required(),
    }),
  }),
  async (req, res) => created(res, await s.addComment(req.user, req.body)),
);

adminRouter.get(
  '/blocklist',
  requireAdminPermission('users.manage'),
  validate({ query: Joi.object({ ...pagination, type: Joi.string().valid(...BLOCKLIST_TYPES), q: Joi.string().allow('') }) }),
  async (req, res) => paginated(res, await s.listBlocklist({ ...req.query, ...parsePagination(req.query) })),
);
adminRouter.post(
  '/blocklist',
  requireAdminPermission('users.manage'),
  validate({
    body: Joi.object({
      entries: Joi.array()
        .items(
          Joi.object({
            type: Joi.string()
              .valid(...BLOCKLIST_TYPES)
              .required(),
            value: Joi.string().trim().max(300).required(),
            reason: Joi.string().max(500),
          }),
        )
        .min(1)
        .max(1000)
        .required(),
    }),
  }),
  async (req, res) => {
    const r = await s.addBlocklist(req.user, req.body.entries);
    audit(req, { action: 'blocklist.add', entity: 'Blocklist', changes: req.body.entries });
    return ok(res, r, 'Blocklist updated');
  },
);
adminRouter.delete('/blocklist/:id', requireAdminPermission('users.manage'), validate({ params: idParam }), async (req, res) => {
  await s.removeBlocklist(req.params.id);
  audit(req, { action: 'blocklist.remove', entity: 'Blocklist', entityId: req.params.id });
  return ok(res, null, 'Removed');
});
