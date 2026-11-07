import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireEmployer } from '../../shared/middleware/auth.js';
import { heavyLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination, stringList, bulkIds, timespan } from '../../shared/validators/common.js';
import {
  ROLES,
  SCREENING_STATUS,
  CALLING_STATUS,
  MESSAGING_STATUS,
  FORWARD_CHANNELS,
  ACTIVE_IN_DAYS,
  DISTANCE_KM,
  LAST_ACTIVE_DAYS,
  CANDIDATE_TYPES,
  CANDIDATES_WITH,
  HIDE_CANDIDATES,
  PAGE_SIZES,
  BULK_LIMITS,
} from '../../shared/constants/index.js';
import * as s from './talent.service.js';

const list = (max = 20) => stringList(max, 150);

/** Advanced candidate search + side filters ("Other Forms" Excel). Experience is in years; 1 month = 1/12. */
export const searchFilters = Joi.object({
  clientHiringFor: Joi.string().max(150).allow(''),
  keywords: list(20),
  keywordMode: Joi.string().valid('all', 'any').default('any'),
  mandatoryKeywords: list(20), // starred keywords
  mustHaveKeywords: list(15),
  excludeKeywords: list(15),
  skills: list(30),
  skillMode: Joi.string().valid('all', 'any').default('any'),
  experienceMin: Joi.number().min(0).max(50),
  experienceMax: Joi.number().min(0).max(60),
  locations: list(10),
  distanceKm: Joi.number().valid(...DISTANCE_KM),
  includeRelocate: Joi.boolean().default(false),
  excludeAnywhere: Joi.boolean().default(false),
  relocateInclude: list(6),
  relocateExclude: list(6),
  salaryMin: Joi.number().min(0),
  salaryMax: Joi.number().min(0),
  includeNoSalary: Joi.boolean().default(false),
  industries: list(),
  subIndustries: list(),
  departments: list(),
  functions: list(),
  roles: list(),
  companyTypes: list(),
  companies: list(),
  companyScope: Joi.string().valid('current', 'previous', 'both', 'exclude').default('both'),
  designations: list(),
  designationScope: Joi.string().valid('current', 'previous', 'both').default('both'),
  noticePeriods: list(),
  shifts: list(),
  assets: list(30),
  documents: list(40),
  educationLevels: list(),
  degrees: list(50),
  specialisations: list(50),
  institutions: list(),
  educationTypes: list(5),
  educationStatuses: list(5),
  certifications: list(),
  passingYearFrom: Joi.number().integer().min(1950).max(2100),
  passingYearTo: Joi.number().integer().min(1950).max(2100),
  genders: list(5),
  maritalStatuses: list(5),
  englishFluency: list(5),
  languages: list(),
  diversity: list(10),
  disabilityStatuses: list(5),
  disabilityTypes: list(30),
  militaryStatuses: list(5),
  serviceTypes: list(10),
  careerBreak: Joi.boolean(),
  disabledOnly: Joi.boolean(),
  militaryOnly: Joi.boolean(),
  categories: list(10),
  ageMin: Joi.number().integer().min(14).max(80),
  ageMax: Joi.number().integer().min(14).max(80),
  jobTypes: Joi.array().items(Joi.string().valid('job', 'internship')),
  employmentTypes: list(),
  jobModes: list(),
  experienceLevels: list(5),
  show: Joi.string().valid('all', 'new', 'modified').default('all'),
  candidateTypes: Joi.array().items(Joi.string().valid(...CANDIDATE_TYPES)),
  candidatesWith: Joi.array().items(Joi.string().valid(...CANDIDATES_WITH)),
  hide: Joi.array().items(Joi.string().valid(...HIDE_CANDIDATES)),
  lastActive: Joi.string().valid(...LAST_ACTIVE_DAYS.map(String), '365+'),
  verifiedMobile: Joi.boolean(),
  verifiedEmail: Joi.boolean(),
  withResume: Joi.boolean(),
  activeIn: Joi.string().valid('all', ...Object.keys(ACTIVE_IN_DAYS)),
  sort: Joi.string().valid('relevance', 'freshness', 'last_active', 'email_optimized', 'ai').default('relevance'),
  jobId: objectId,
});

const trackingBody = Joi.object({
  stage: Joi.string().trim().max(100).allow(''), // lookup candidate_stage ("Mark Candidate Status / Interview Stage")
  screeningStatus: Joi.string().valid(...SCREENING_STATUS),
  callingStatus: Joi.string().valid(...CALLING_STATUS),
  messagingStatus: Joi.array().items(Joi.string().valid(...MESSAGING_STATUS)),
  comment: Joi.string().trim().max(2000),
  forward: Joi.object({
    channel: Joi.string()
      .valid(...FORWARD_CHANNELS)
      .required(),
    to: Joi.string().max(200),
  }),
}).min(1);

const candidateParam = Joi.object({ candidateId: objectId.required() });

const r = Router();
r.use(authenticate, authorize(ROLES.EMPLOYER));

/* search */
r.post(
  '/search',
  requireEmployer('candidate.search'),
  heavyLimiter,
  validate({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number()
        .valid(...PAGE_SIZES)
        .default(20),
    }),
    body: searchFilters,
  }),
  async (req, res) => {
    const result = await s.search(req.user, req.body, parsePagination(req.query));
    return ok(res, result.items, 'OK', {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
      capped: result.capped,
    });
  },
);
r.get('/search/from-job/:id', requireEmployer('candidate.search'), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.filtersFromJob(req.user, req.params.id)),
);
r.get('/searches/recent', requireEmployer('candidate.search'), validate({ query: Joi.object(timespan) }), async (req, res) => ok(res, await s.recentSearches(req.user, 'resume', req.query)));
r.get(
  '/searches',
  requireEmployer(),
  validate({ query: Joi.object({ ...pagination, ...timespan, tab: Joi.string().valid('mine', 'shared', 'all').default('mine') }) }),
  async (req, res) => paginated(res, await s.listSavedSearches(req.user, { ...req.query, ...parsePagination(req.query) })),
);
r.post(
  '/searches',
  requireEmployer('saved_search.manage_own', 'saved_search.manage_all'),
  validate({
    body: Joi.object({
      name: Joi.string().trim().max(120).required(),
      filters: searchFilters.required(),
      sharedWith: Joi.array().items(objectId).max(50),
      alertEnabled: Joi.boolean(),
    }),
  }),
  async (req, res) => created(res, await s.saveSearch(req.user, req.body), 'Search saved'),
);
r.patch(
  '/searches/:id',
  requireEmployer('saved_search.manage_own', 'saved_search.manage_all'),
  validate({
    params: idParam,
    body: Joi.object({
      name: Joi.string().trim().max(120),
      filters: searchFilters,
      sharedWith: Joi.array().items(objectId).max(50),
      alertEnabled: Joi.boolean(),
    }).min(1),
  }),
  async (req, res) => ok(res, await s.updateSavedSearch(req.user, req.params.id, req.body), 'Saved search updated'),
);
r.delete('/searches/:id', requireEmployer('saved_search.manage_own', 'saved_search.manage_all'), validate({ params: idParam }), async (req, res) => {
  await s.deleteSavedSearch(req.user, req.params.id);
  return ok(res, null, 'Deleted');
});

/* folders */
r.get('/folders', requireEmployer(), validate({ query: Joi.object({ ...timespan, tab: Joi.string().valid('mine', 'shared', 'all').default('mine') }) }), async (req, res) =>
  ok(res, await s.listFolders(req.user, req.query)),
);
r.get(
  '/folders/system/:key',
  requireEmployer(),
  validate({ params: Joi.object({ key: Joi.string().required() }), query: Joi.object(pagination) }),
  async (req, res) => paginated(res, await s.systemFolderCandidates(req.user, req.params.key, parsePagination(req.query))),
);
r.post(
  '/folders',
  requireEmployer('folder.manage_own', 'folder.manage_all'),
  validate({ body: Joi.object({ name: Joi.string().trim().max(120).required(), description: Joi.string().max(500).allow('') }) }),
  async (req, res) => created(res, await s.createFolder(req.user, req.body), 'Folder created'),
);
r.get('/folders/:id', requireEmployer(), validate({ params: idParam, query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.folderCandidates(req.user, req.params.id, parsePagination(req.query))),
);
r.patch(
  '/folders/:id',
  requireEmployer('folder.manage_own', 'folder.manage_all'),
  validate({
    params: idParam,
    body: Joi.object({ name: Joi.string().trim().max(120), description: Joi.string().max(500).allow(''), sharedWith: Joi.array().items(objectId).max(50) }).min(
      1,
    ),
  }),
  async (req, res) => ok(res, await s.updateFolder(req.user, req.params.id, req.body), 'Folder updated'),
);
r.delete('/folders/:id', requireEmployer('folder.manage_own', 'folder.manage_all'), validate({ params: idParam }), async (req, res) => {
  await s.deleteFolder(req.user, req.params.id);
  return ok(res, null, 'Folder deleted');
});
r.post('/folders/:id/candidates', requireEmployer(), validate({ params: idParam, body: Joi.object({ candidateIds: bulkIds(500) }) }), async (req, res) =>
  ok(res, await s.addToFolder(req.user, req.params.id, req.body.candidateIds), 'Added to folder'),
);
r.delete('/folders/:id/candidates', requireEmployer(), validate({ params: idParam, body: Joi.object({ candidateIds: bulkIds(500) }) }), async (req, res) =>
  ok(res, await s.removeFromFolder(req.user, req.params.id, req.body.candidateIds), 'Removed from folder'),
);

/* invites */
r.post(
  '/jobs/:id/invites',
  requireEmployer('candidate.invite'),
  validate({ params: idParam, body: Joi.object({ candidateIds: bulkIds(BULK_LIMITS.invite), message: Joi.string().trim().max(2000).allow('') }) }),
  async (req, res) => ok(res, await s.inviteCandidates(req.user, req.params.id, req.body), 'Invites sent'),
);
r.get(
  '/jobs/:id/invites',
  requireEmployer(),
  validate({ params: idParam, query: Joi.object({ ...pagination, status: Joi.string().valid('sent', 'viewed', 'applied', 'declined') }) }),
  async (req, res) => paginated(res, await s.jobInvites(req.user, req.params.id, { ...req.query, ...parsePagination(req.query) })),
);

/* candidate profile actions */
r.get(
  '/candidates/:candidateId',
  requireEmployer('candidate.search', 'response.manage_own', 'response.manage_all'),
  validate({ params: candidateParam }),
  async (req, res) => ok(res, await s.viewProfile(req.user, req.params.candidateId, { source: req.query.source })),
);
r.post('/candidates/:candidateId/unlock', requireEmployer('candidate.search'), validate({ params: candidateParam }), async (req, res) =>
  ok(res, await s.unlockContact(req.user, req.params.candidateId), 'Contact details unlocked'),
);
r.get(
  '/candidates/:candidateId/resume',
  requireEmployer('candidate.search', 'response.manage_own', 'response.manage_all'),
  validate({ params: candidateParam }),
  async (req, res) => ok(res, await s.resumeDownload(req.user, req.params.candidateId)),
);
r.patch('/candidates/:candidateId/tracking', requireEmployer(), validate({ params: candidateParam, body: trackingBody }), async (req, res) =>
  ok(res, await s.updateTracking(req.user, req.params.candidateId, req.body), 'Updated'),
);
r.post(
  '/candidates/:candidateId/block',
  requireEmployer(),
  validate({ params: candidateParam, body: Joi.object({ reason: Joi.string().max(500).allow('') }) }),
  async (req, res) => ok(res, await s.blockCandidate(req.user, req.params.candidateId, req.body.reason), 'Candidate blocked'),
);
r.delete('/candidates/:candidateId/block', requireEmployer(), validate({ params: candidateParam }), async (req, res) =>
  ok(res, await s.unblockCandidate(req.user, req.params.candidateId), 'Candidate unblocked'),
);

export default r;

/* candidate-side invites */
export const candidateInvites = Router();
candidateInvites.use(authenticate, authorize(ROLES.CANDIDATE));
candidateInvites.get(
  '/',
  validate({ query: Joi.object({ ...pagination, status: Joi.string().valid('sent', 'viewed', 'applied', 'declined') }) }),
  async (req, res) => paginated(res, await s.myInvites(req.user._id, { ...req.query, ...parsePagination(req.query) })),
);
candidateInvites.post('/:id/decline', validate({ params: idParam }), async (req, res) =>
  ok(res, await s.declineInvite(req.user._id, req.params.id), 'Invite declined'),
);
