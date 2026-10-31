import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireEmployer } from '../../shared/middleware/auth.js';
import { formLimiter, heavyLimiter, otpLimiter } from '../../shared/middleware/rateLimit.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { exportRows } from '../../shared/utils/excel.js';
import {
  objectId,
  idParam,
  pagination,
  timespan,
  email,
  mobile,
  otp,
  place,
  shortText,
  stringList,
  bulkIds,
  exportFormat,
} from '../../shared/validators/common.js';
import { ROLES, PIPELINE_STAGES, SCREENING_STATUS, CALLING_STATUS, MESSAGING_STATUS, FORWARD_CHANNELS, PAGE_SIZES } from '../../shared/constants/index.js';
import * as s from './application.service.js';

const answers = Joi.array()
  .items(Joi.object({ question: Joi.string().max(500).required(), answer: Joi.string().max(2000).allow('') }))
  .max(10);
const jsonField = (schema) =>
  Joi.alternatives(
    schema,
    Joi.string().custom((v, h) => {
      try {
        const parsed = JSON.parse(v);
        const { error, value } = schema.validate(parsed);
        return error ? h.error('any.invalid') : value;
      } catch {
        return h.error('any.invalid');
      }
    }),
  );

const applyBody = Joi.object({
  answers: jsonField(answers),
  coverLetter: Joi.string().max(5000).allow(''),
  eventId: objectId,
  source: Joi.string().valid('direct', 'invite', 'job_alert', 'event', 'recommendation'),
});

const s_ = shortText.allow('');
/** Candidate Job Apply form (PRD 4.3) - used for apply without login. Multipart: fields + optional "resume" file. */
const guestApplyBody = Joi.object({
  otp: otp.required(),
  fullName: shortText.min(2).required(),
  mobile: mobile.required(),
  email: email.required(),
  gender: s_,
  dob: Joi.date().max('now'),
  maritalStatus: s_,
  disability: jsonField(Joi.object({ status: s_, type: s_ })),
  military: jsonField(Joi.object({ status: s_, serviceType: s_ })),
  hasTwoWheeler: Joi.boolean(),
  hasFourWheeler: Joi.boolean(),
  drivingLicense: s_,
  assets: jsonField(stringList(40)),
  education: jsonField(Joi.object({ level: s_, degree: s_, specialisation: s_, institution: s_ })),
  presentJobStatus: s_,
  experienceLevel: s_,
  totalExperienceMonths: Joi.number().integer().min(0).max(720),
  currentJobTitle: s_,
  currentSalary: Joi.number().min(0),
  keySkills: jsonField(stringList(15)),
  roles: jsonField(stringList(10)),
  departments: jsonField(stringList(25)),
  industries: jsonField(stringList(5)),
  currentCompany: s_,
  currentCompanyType: s_,
  employmentType: s_,
  currentlyWorking: Joi.boolean(),
  workLocation: jsonField(place),
  noticePeriod: s_,
  currentLocation: jsonField(place),
  languages: jsonField(stringList(30)),
  englishFluency: s_,
  preferredLocations: jsonField(Joi.array().items(place).max(4)),
  heardFrom: s_,
  consentCommunication: Joi.boolean(),
  acceptTerms: Joi.boolean().valid(true).required(),
  answers: jsonField(answers),
  eventId: objectId,
});

const responseQuery = Joi.object({
  ...pagination,
  ...timespan,
  limit: Joi.number()
    .valid(...PAGE_SIZES)
    .default(20),
  job: objectId,
  stage: Joi.string().valid(...PIPELINE_STAGES),
  screeningStatus: Joi.string().valid(...SCREENING_STATUS),
  callingStatus: Joi.string().valid(...CALLING_STATUS),
  messagingStatus: Joi.string().valid(...MESSAGING_STATUS),
  kind: Joi.string().valid('job', 'internship'),
  category: Joi.string().valid('job', 'internship', 'invite'),
  source: Joi.string(),
  view: Joi.string().valid('all', 'new', 'viewed', 'pending'),
  minScore: Joi.number().min(0).max(100),
  q: Joi.string().trim().max(100).allow(''),
  sort: Joi.string().valid('-createdAt', 'createdAt', '-matchScore', 'snapshot.fullName').default('-createdAt'),
  format: exportFormat,
  organization: objectId,
});

const updateBody = Joi.object({
  stage: Joi.string().valid(...PIPELINE_STAGES.filter((x) => x !== 'withdrawn')),
  screeningStatus: Joi.string().valid(...SCREENING_STATUS),
  callingStatus: Joi.string().valid(...CALLING_STATUS),
  messagingStatus: Joi.array().items(Joi.string().valid(...MESSAGING_STATUS)),
  forward: Joi.object({
    channel: Joi.string()
      .valid(...FORWARD_CHANNELS)
      .required(),
    to: Joi.string().max(200),
  }),
  comment: Joi.string().trim().max(2000),
  note: Joi.string().trim().max(500),
  rating: Joi.number().integer().min(1).max(5),
  tags: stringList(20, 40),
  assignedTo: objectId.allow(null),
}).min(1);

const interviewBody = Joi.object({
  round: Joi.string().max(60).default('Round 1'),
  scheduledAt: Joi.date().greater('now').required(),
  durationMinutes: Joi.number().integer().min(5).max(480).default(30),
  mode: Joi.string().valid('in_person', 'video', 'phone').default('video'),
  location: Joi.string().max(500).allow(''),
  meetingLink: Joi.string().uri().max(500).allow(''),
  notes: Joi.string().max(2000).allow(''),
  interviewers: Joi.array().items(objectId).max(10),
});

/* ---------------------------------------------------------------- candidate */

export const candidateApplications = Router();
candidateApplications.post(
  '/jobs/:id/apply',
  authenticate,
  authorize(ROLES.CANDIDATE),
  upload('resume', 'resume', { required: false }),
  validate({ params: idParam, body: applyBody }),
  async (req, res) => created(res, await s.apply(req, req.params.id, req.body, req.file), 'Application submitted'),
);
candidateApplications.post(
  '/jobs/:id/guest-apply/otp',
  otpLimiter,
  validate({ params: idParam, body: Joi.object({ mobile: mobile.required() }) }),
  async (req, res) => ok(res, await s.guestApplyOtp(req.params.id, req.body), 'OTP sent'),
);
candidateApplications.post(
  '/jobs/:id/guest-apply',
  formLimiter,
  upload('resume', 'resume', { required: false }),
  validate({ params: idParam, body: guestApplyBody }),
  async (req, res) => created(res, await s.guestApply(req, req.params.id, req.body, req.file), 'Application submitted'),
);

candidateApplications.get(
  '/applications',
  authenticate,
  authorize(ROLES.CANDIDATE),
  validate({ query: Joi.object({ ...pagination, stage: Joi.string().valid(...PIPELINE_STAGES), kind: Joi.string().valid('job', 'internship') }) }),
  async (req, res) => {
    const r = await s.myApplications(req.user._id, { ...req.query, ...parsePagination(req.query) });
    return ok(res, r.items, 'OK', { page: r.page, limit: r.limit, total: r.total, totalPages: Math.ceil(r.total / r.limit), counts: r.counts });
  },
);
candidateApplications.get('/applications/:id', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.myApplication(req.user._id, req.params.id)),
);
candidateApplications.post('/applications/:id/withdraw', authenticate, authorize(ROLES.CANDIDATE), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.withdraw(req.user._id, req.params.id), 'Application withdrawn'),
);

/* -------------------------------------------------------------- interviews */

export const interviewRouter = Router();
interviewRouter.use(authenticate);
interviewRouter.get(
  '/',
  validate({
    query: Joi.object({
      ...pagination,
      from: Joi.date(),
      to: Joi.date(),
      status: Joi.string().valid('scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'),
      job: objectId,
    }),
  }),
  async (req, res) => paginated(res, await s.listInterviews(req.user, { ...req.query, ...parsePagination(req.query) })),
);
interviewRouter.post(
  '/:id/respond',
  authorize(ROLES.CANDIDATE),
  validate({ params: idParam, body: Joi.object({ response: Joi.string().valid('accepted', 'declined').required() }) }),
  async (req, res) => ok(res, await s.respondInterview(req.user._id, req.params.id, req.body.response), 'Response sent'),
);
interviewRouter.patch(
  '/:id',
  authorize(ROLES.EMPLOYER, ROLES.ADMIN),
  validate({
    params: idParam,
    body: interviewBody
      .fork(['scheduledAt'], (x) => x.optional())
      .keys({
        status: Joi.string().valid('scheduled', 'completed', 'cancelled', 'no_show'),
        feedback: Joi.object({
          rating: Joi.number().min(1).max(5),
          comments: Joi.string().max(2000),
          result: Joi.string().valid('selected', 'rejected', 'on_hold', 'next_round'),
        }),
      }),
  }),
  async (req, res) => ok(res, await s.updateInterview(req.user, req.params.id, req.body), 'Interview updated'),
);

/* ---------------------------------------------------------- employer (ATS) */

export const employerResponses = Router();
employerResponses.use(authenticate, authorize(ROLES.EMPLOYER), requireEmployer('response.manage_all', 'response.manage_own'));

employerResponses.get('/', validate({ query: responseQuery }), async (req, res) => {
  const r = await s.listResponses(req.user, req.query, parsePagination(req.query, { allowedSort: ['createdAt', 'matchScore', 'snapshot.fullName'] }));
  return ok(res, r.items, 'OK', { page: r.page, limit: r.limit, total: r.total, totalPages: Math.ceil(r.total / r.limit), stages: r.stages });
});
employerResponses.get('/export', heavyLimiter, validate({ query: responseQuery }), async (req, res) =>
  exportRows(res, {
    format: req.query.format,
    filename: 'applicant-responses',
    sheet: 'Responses',
    columns: s.RESPONSE_COLUMNS,
    rows: await s.exportResponses(req.user, req.query),
  }),
);
employerResponses.get('/export-resumes', heavyLimiter, validate({ query: responseQuery }), async (req, res) => s.streamResumesZip(req.user, req.query, res));
employerResponses.get('/funnel/:id', validate({ params: idParam }), async (req, res) => ok(res, await s.jobFunnel(req.user, req.params.id)));
employerResponses.post('/bulk', validate({ body: Joi.object({ ids: bulkIds(500), update: updateBody.required() }) }), async (req, res) =>
  ok(res, await s.bulkUpdate(req.user, req.body.ids, req.body.update), 'Applications updated'),
);
employerResponses.get('/:id', validate({ params: idParam }), async (req, res) => ok(res, await s.getResponse(req.user, req.params.id)));
employerResponses.patch('/:id', validate({ params: idParam, body: updateBody }), async (req, res) =>
  ok(res, await s.updateResponse(req.user, req.params.id, req.body), 'Application updated'),
);
employerResponses.post('/:id/interviews', validate({ params: idParam, body: interviewBody }), async (req, res) =>
  created(res, await s.scheduleInterview(req.user, req.params.id, req.body), 'Interview scheduled'),
);
