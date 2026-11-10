import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import User from '../users/user.model.js';
import { authenticate, authorize, optionalAuth, requireEmployer } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { uploadLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import {
  objectId,
  idParam,
  email,
  mobile,
  password,
  username,
  shortText,
  stringList,
  url,
  socialLink,
  pagination,
  bulkIds,
} from '../../shared/validators/common.js';
import { ROLES, EMPLOYER_MEMBER_ROLES, EMPLOYER_PERMISSIONS, USAGE_METRICS, QUOTA_PERIODS, USER_STATUS, DATE_POSTED_DAYS } from '../../shared/constants/index.js';
import * as s from './employer.service.js';

const quotaSchema = Joi.object(
  Object.fromEntries(USAGE_METRICS.map((m) => [m, Joi.object(Object.fromEntries(QUOTA_PERIODS.map((p) => [p, Joi.number().integer().min(0).allow(null)])))])),
);

const orgBody = Joi.object({
  name: shortText.min(2),
  legalName: shortText.allow(''),
  username,
  employerType: shortText.allow(''),
  organizationType: shortText.allow(''),
  industries: stringList(5),
  subIndustries: stringList(20),
  departments: stringList(5),
  functions: stringList(20),
  employeeCount: shortText.allow(''),
  foundedDate: Joi.date().max('now'),
  website: url.allow(''),
  about: Joi.string().trim().max(10000).allow(''),
  socialProfiles: Joi.array().items(socialLink).max(15),
  hiringStatus: shortText.allow(''),
  gstNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .message('Invalid GST number')
    .allow(''),
  panNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .message('Invalid PAN')
    .allow(''),
  email: email.allow(''),
  phone: mobile.allow(''),
  consultancyDeclaration: Joi.object({ authorized: Joi.boolean(), noCandidateFee: Joi.boolean() }),
}).min(1);

const officeBody = Joi.object({
  type: shortText.required(),
  address: Joi.string().trim().max(500).required(),
  locality: shortText.allow(''),
  district: shortText.allow(''),
  city: shortText.required(),
  state: shortText.required(),
  country: shortText.default('India'),
  pincode: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .message('Invalid pincode')
    .allow(''),
  location: objectId,
  geo: Joi.object({ lat: Joi.number().min(-90).max(90), lng: Joi.number().min(-180).max(180) }),
  mapUrl: url.allow(''),
  isPrimary: Joi.boolean(),
});

const memberBody = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  email: email.required(),
  mobile,
  username,
  password,
  gender: shortText,
  designation: shortText,
  department: stringList(5),
  functions: stringList(20),
  hiringAuthority: shortText,
  memberRole: Joi.string()
    .valid(...EMPLOYER_MEMBER_ROLES.filter((r) => r !== 'employer_admin'), 'employer_admin')
    .default('recruiter'),
  permissions: Joi.array()
    .items(Joi.string().valid(...EMPLOYER_PERMISSIONS))
    .unique(),
  quotas: quotaSchema,
});

/* ---------------------------------------------------- employer (private) */

const me = Router();
me.use(authenticate, authorize(ROLES.EMPLOYER));

me.get('/', requireEmployer(), async (req, res) => ok(res, await s.getOrganization(req.orgId)));
/** Recruiter's own setting: in private mode candidates see "a recruiter" instead of name and company. */
me.patch('/viewing-mode', requireEmployer(), validate({ body: Joi.object({ private: Joi.boolean().required() }) }), async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { 'employer.privateBrowsing': req.body.private } });
  return ok(res, { private: req.body.private }, req.body.private ? 'Private mode on' : 'Private mode off');
});
me.patch('/', requireEmployer('company.manage'), validate({ body: orgBody }), async (req, res) =>
  ok(res, await s.updateOrganization(req, req.body), 'Profile updated'),
);
me.post('/logo', requireEmployer('company.manage'), uploadLimiter, upload('image', 'logo'), async (req, res) =>
  ok(res, await s.uploadBranding(req, req.file, 'logo'), 'Logo updated'),
);
me.post('/cover', requireEmployer('company.manage'), uploadLimiter, upload('image', 'cover'), async (req, res) =>
  ok(res, await s.uploadBranding(req, req.file, 'coverPhoto'), 'Cover photo updated'),
);

me.post('/offices', requireEmployer('company.manage'), validate({ body: officeBody }), async (req, res) => created(res, await s.addOffice(req, req.body)));
me.patch(
  '/offices/:id',
  requireEmployer('company.manage'),
  validate({ params: idParam, body: officeBody.fork(['type', 'address', 'city', 'state'], (x) => x.optional()) }),
  async (req, res) => ok(res, await s.updateOffice(req, req.params.id, req.body), 'Updated'),
);
me.delete('/offices/:id', requireEmployer('company.manage'), validate({ params: idParam }), async (req, res) => {
  await s.removeOffice(req, req.params.id);
  return ok(res, null, 'Removed');
});

me.post(
  '/documents',
  requireEmployer('company.manage'),
  uploadLimiter,
  upload('document', 'file'),
  validate({ body: Joi.object({ type: shortText.required(), number: Joi.string().trim().max(60).allow('') }) }),
  async (req, res) => created(res, await s.uploadDocument(req, req.file, req.body), 'Document uploaded for verification'),
);
me.delete('/documents/:id', requireEmployer('company.manage'), validate({ params: idParam }), async (req, res) => {
  await s.removeDocument(req, req.params.id);
  return ok(res, null, 'Document removed');
});
me.post(
  '/verification/submit',
  requireEmployer('company.manage'),
  validate({
    body: Joi.object({
      accurate: Joi.boolean().valid(true).required(),
      authorized: Joi.boolean().valid(true).required(),
      employerTerms: Joi.boolean().valid(true).required(),
      privacy: Joi.boolean().valid(true).required(),
      postingPolicy: Joi.boolean().valid(true).required(),
      fraudWarning: Joi.boolean().valid(true).required(),
    }),
  }),
  async (req, res) => ok(res, await s.submitVerification(req, req.body), 'Submitted for verification'),
);
me.post('/verification/domain/start', requireEmployer('company.manage'), async (req, res) => ok(res, await s.startDomainVerification(req)));
me.post('/verification/domain/check', requireEmployer('company.manage'), async (req, res) => ok(res, await s.checkDomainVerification(req), 'Domain verified'));

me.get(
  '/team',
  requireEmployer(),
  validate({ query: Joi.object({ q: Joi.string().allow(''), status: Joi.string().valid(...Object.values(USER_STATUS)) }) }),
  async (req, res) => ok(res, await s.listMembers(req.orgId, req.query)),
);
me.post('/team', requireEmployer('team.manage'), validate({ body: memberBody }), async (req, res) =>
  created(res, await s.addMember(req, req.body), 'Team member added'),
);
me.patch(
  '/team/:id',
  requireEmployer('team.manage', 'quota.manage'),
  validate({
    params: idParam,
    body: memberBody
      .fork(['fullName', 'email'], (x) => x.optional())
      .keys({ email: Joi.forbidden(), mobile: Joi.forbidden(), password: Joi.forbidden(), status: Joi.string().valid('active', 'suspended') }),
  }),
  async (req, res) => ok(res, await s.updateMember(req, req.params.id, req.body), 'Team member updated'),
);
me.post('/team/:id/reset-password', requireEmployer('team.manage'), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.memberPasswordReset(req, req.params.id), 'Password reset link sent'),
);
me.post('/team/remove', requireEmployer('team.manage'), validate({ body: Joi.object({ ids: bulkIds(50) }) }), async (req, res) =>
  ok(res, await s.removeMembers(req, req.body.ids), 'Removed'),
);

me.get(
  '/usage',
  requireEmployer(),
  validate({
    query: Joi.object({
      memberId: objectId,
      period: Joi.string()
        .valid(...QUOTA_PERIODS)
        .default('monthly'),
    }),
  }),
  async (req, res) => ok(res, await s.usage(req, req.query)),
);
me.get('/followers', requireEmployer(), validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.followers(req.orgId, parsePagination(req.query))),
);

/* ------------------------------------------------------------ public */

const csvList = (max = 20) => Joi.alternatives(Joi.array().items(Joi.string().max(150)).max(max), Joi.string().max(3000));

const pub = Router();
pub.get(
  '/',
  validate({
    query: Joi.object({
      ...pagination,
      q: Joi.string().trim().max(100).allow(''),
      type: csvList(2),
      industry: csvList(),
      city: csvList(),
      verified: Joi.boolean(),
      label: Joi.string().max(40),
      // "Side Filters- Companies Search" (Other Forms Excel)
      datePosted: Joi.number().valid(...DATE_POSTED_DAYS),
      companyType: csvList(),
      companySize: csvList(),
      role: csvList(),
      department: csvList(),
      experienceLevel: csvList(),
      topCompany: csvList(),
    }),
  }),
  async (req, res) =>
    paginated(
      res,
      await s.listPublicEmployers({
        ...req.query,
        ...parsePagination(req.query, { allowedSort: ['name', 'stats.followers', 'stats.activeJobs'], defaultSort: '-stats.activeJobs' }),
      }),
    ),
);
pub.get('/following', authenticate, authorize(ROLES.CANDIDATE), validate({ query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.myFollowing(req.user._id, parsePagination(req.query))),
);
pub.get('/:slug', optionalAuth, validate({ params: Joi.object({ slug: Joi.string().max(150).required() }) }), async (req, res) =>
  ok(res, await s.publicProfile(req.params.slug, req.user)),
);
pub.post('/:id/follow', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.follow(req.user, req.params.id), 'Following'),
);
pub.delete('/:id/follow', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.unfollow(req.user, req.params.id), 'Unfollowed'),
);

export { me as employerMeRouter, pub as employerPublicRouter };
