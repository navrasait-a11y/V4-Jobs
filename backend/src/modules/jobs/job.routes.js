import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, optionalAuth, requireEmployer } from '../../shared/middleware/auth.js';
import { formLimiter, heavyLimiter, otpLimiter } from '../../shared/middleware/rateLimit.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination, mobile } from '../../shared/validators/common.js';
import { ROLES } from '../../shared/constants/index.js';
import ApiError from '../../shared/errors/ApiError.js';
import Job from './job.model.js';
import Organization from '../employers/organization.model.js';
import * as s from './job.service.js';
import * as v from './job.validation.js';
import { correctQuery, suggestCompanies } from './job.spell.js';

/* ----------------------------------------------------------------- public */

export const publicJobs = Router();

publicJobs.get('/', optionalAuth, validate(v.searchJobs), async (req, res) =>
  paginated(res, await s.searchJobs(req.query, req.user, parsePagination(req.query))),
);
publicJobs.get('/facets', validate(v.searchJobs), async (req, res) => ok(res, await s.searchFacets(req.query)));
/** Search box helper: matching companies and a spelling suggestion for what is typed. */
publicJobs.get('/suggest', validate({ query: Joi.object({ q: Joi.string().trim().max(100).allow('').required() }) }), async (req, res) => {
  const [companies, didYouMean] = await Promise.all([suggestCompanies(req.query.q, 5), req.query.q.length >= 4 ? correctQuery(req.query.q, { allowPrefix: true }) : null]);
  res.set('Cache-Control', 'public, max-age=300');
  return ok(res, { companies, didYouMean });
});
publicJobs.get('/sitemap.xml', async (_req, res) => {
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600');
  res.send(await s.jobsSitemap());
});
publicJobs.get('/recommended', authenticate, authorize(ROLES.CANDIDATE), validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.recommendedJobs(req.user._id, parsePagination(req.query))),
);
publicJobs.get('/saved', authenticate, authorize(ROLES.CANDIDATE), validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.listSavedJobs(req.user._id, parsePagination(req.query))),
);
/* candidate "Save Job Search": the search page URL query, re-run from the saved list */
const savedSearchBody = Joi.object({ name: Joi.string().trim().min(2).max(120).required(), query: Joi.string().max(2000).allow('').required() });
publicJobs.get('/searches', authenticate, authorize(ROLES.CANDIDATE), async (req, res) => ok(res, await s.listJobSearches(req.user)));
publicJobs.post('/searches', authenticate, authorize(ROLES.CANDIDATE), validate({ body: savedSearchBody }), async (req, res) =>
  created(res, await s.saveJobSearch(req.user, req.body), 'Search saved'),
);
publicJobs.delete('/searches/:id', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.removeJobSearch(req.user, req.params.id), 'Search removed'),
);
publicJobs.post('/guest-post/otp', otpLimiter, validate({ body: Joi.object({ mobile: mobile.required() }) }), async (req, res) =>
  ok(res, await s.guestPostOtp(req.body), 'OTP sent'),
);
publicJobs.post('/guest-post', formLimiter, validate(v.guestPost), async (req, res) => created(res, await s.guestPostJob(req, req.body), 'Job submitted'));
publicJobs.get('/:idOrSlug', optionalAuth, validate({ params: Joi.object({ idOrSlug: Joi.string().max(200).required() }) }), async (req, res) =>
  ok(res, await s.getPublicJob(req.params.idOrSlug, req.user)),
);
publicJobs.get('/:idOrSlug/google-jobs', validate({ params: Joi.object({ idOrSlug: Joi.string().max(200).required() }) }), async (req, res) =>
  ok(res, await s.googleJobPosting(req.params.idOrSlug)),
);
publicJobs.get('/:id/similar', validate({ params: idParam }), async (req, res) => ok(res, await s.similarJobs(req.params.id)));
publicJobs.get('/:id/share', validate({ params: idParam }), async (req, res) => {
  const job = await Job.findById(req.params.id).select('slug title orgSnapshot').lean();
  if (!job) throw ApiError.notFound('Job not found');
  Job.updateOne({ _id: job._id }, { $inc: { 'stats.shares': 1 } }).catch(() => {});
  return ok(res, s.shareLinks(job));
});
publicJobs.post('/:id/save', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.saveJob(req.user._id, req.params.id), 'Job saved'),
);
publicJobs.post('/:id/callback', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.requestCallback(req.user, req.params.id), 'Call back requested'),
);
publicJobs.delete('/:id/save', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.unsaveJob(req.user._id, req.params.id), 'Removed from saved'),
);

/* --------------------------------------------------------------- employer */

export const employerJobs = Router();
employerJobs.use(authenticate, authorize(ROLES.EMPLOYER));

employerJobs.get('/', requireEmployer(), validate(v.employerJobsQuery), async (req, res) => {
  const p = parsePagination(req.query, { allowedSort: ['createdAt', 'title', 'publishedAt', 'stats.applications'] });
  const result = await s.listEmployerJobs(req.user, req.query, p);
  return ok(res, result.items, 'OK', {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / result.limit),
    counts: result.counts,
  });
});
employerJobs.post('/', requireEmployer('job.post'), validate(v.createJob), async (req, res) => {
  const { publish, ...data } = req.body;
  return created(res, await s.createJob(req.user, data, { publish }), publish ? 'Job published' : 'Draft saved');
});
employerJobs.post(
  '/bulk-import',
  requireEmployer('job.post'),
  heavyLimiter,
  upload('excel', 'file'),
  validate({ query: Joi.object({ publish: Joi.boolean().default(false) }) }),
  async (req, res) => {
    const org = await Organization.findById(req.orgId).select('planFeatures').lean();
    if (!org.planFeatures?.bulkUpload) throw ApiError.paymentRequired('Bulk job posting is available on paid plans', 'FEATURE_LOCKED');
    return ok(res, await s.bulkImportJobs(req.user, req.file.buffer, { orgId: req.orgId, publish: req.query.publish }), 'Import completed');
  },
);
employerJobs.get('/:id', requireEmployer(), validate({ params: idParam }), async (req, res) =>
  ok(res, (await s.getManageableJob(req.user, req.params.id)).toObject()),
);
employerJobs.patch('/:id', requireEmployer('job.post', 'job.manage_own', 'job.manage_all'), validate({ params: idParam, ...v.updateJob }), async (req, res) =>
  ok(res, await s.updateJob(req.user, req.params.id, req.body), 'Job updated'),
);
employerJobs.post('/:id/publish', requireEmployer('job.post'), validate({ params: idParam, ...v.publishJob }), async (req, res) =>
  ok(res, await s.publishJob(req.user, req.params.id, req.body), 'Job published'),
);
employerJobs.post('/:id/duplicate', requireEmployer('job.post'), validate({ params: idParam }), async (req, res) =>
  created(res, await s.duplicateJob(req.user, req.params.id), 'Job duplicated as draft'),
);
employerJobs.put(
  '/:id/collaborators',
  requireEmployer('job.share_internal', 'job.manage_all'),
  validate({ params: idParam, body: Joi.object({ memberIds: Joi.array().items(objectId).max(50).required() }) }),
  async (req, res) => ok(res, await s.setCollaborators(req.user, req.params.id, req.body.memberIds), 'Collaborators updated'),
);
employerJobs.get('/:id/callbacks', requireEmployer(), validate({ params: idParam, query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.listCallbacks(req.user, req.params.id, parsePagination(req.query))),
);
employerJobs.get('/:id/share', requireEmployer(), validate({ params: idParam }), async (req, res) =>
  ok(res, s.shareLinks(await s.getManageableJob(req.user, req.params.id))),
);
employerJobs.post('/:id/boost', requireEmployer('job.manage_own', 'job.manage_all'), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.boostJob(req.user, req.params.id), `Job boosted for ${s.BOOST_DAYS} days`),
);
employerJobs.post('/:id/:action', requireEmployer('job.manage_own', 'job.manage_all'), validate(v.jobAction), async (req, res) =>
  ok(res, await s.changeJobState(req.user, req.params.id, req.params.action), 'Job updated'),
);
