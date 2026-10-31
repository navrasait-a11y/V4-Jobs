import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireAdminPermission } from '../../shared/middleware/auth.js';
import { formLimiter, otpLimiter } from '../../shared/middleware/rateLimit.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { exportRows } from '../../shared/utils/excel.js';
import { objectId, idParam, pagination, timespan, email, mobile, otp, place, stringList, bulkIds, exportFormat } from '../../shared/validators/common.js';
import { ROLES, BULK_LIMITS } from '../../shared/constants/index.js';
import { JobAlert } from './alert.model.js';
import * as s from './alert.service.js';

const str = Joi.string().trim().max(150).allow('');
export const criteria = Joi.object({
  keywords: str,
  jobTitle: str,
  keySkills: stringList(15),
  experienceLevel: str,
  totalExperienceMonths: Joi.number().integer().min(0).max(720),
  presentJobStatus: str,
  currentSalary: Joi.number().min(0),
  expectedSalary: Joi.object({ min: Joi.number().min(0), max: Joi.number().min(0) }),
  locations: Joi.array().items(place).max(3),
  industries: stringList(5),
  departments: stringList(5),
  roles: stringList(10),
  educationLevels: stringList(5),
  degrees: stringList(5),
  specialisations: stringList(5),
  jobModes: stringList(5),
  employmentTypes: stringList(10),
  kind: Joi.string().valid('job', 'internship', 'any'),
});
const alertBody = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: email.allow(''),
  mobile: mobile.allow(''),
  criteria: criteria.required(),
  frequency: Joi.string().valid('daily', 'weekly', 'monthly').default('daily'),
  channels: Joi.array()
    .items(Joi.string().valid('email', 'in_app', 'push', 'whatsapp', 'sms'))
    .default(['email', 'in_app', 'push']),
  heardFrom: str,
});

const jsonCriteria = Joi.alternatives(
  criteria,
  Joi.string().custom((v, h) => {
    try {
      const { error, value } = criteria.validate(JSON.parse(v));
      return error ? h.error('any.invalid') : value;
    } catch {
      return h.error('any.invalid');
    }
  }),
);

/* -------------------------------------------------------------- candidate */

export const router = Router();

router.post('/guest/otp', otpLimiter, validate({ body: Joi.object({ mobile: mobile.required() }) }), async (req, res) =>
  ok(res, await s.guestAlertOtp(req.body), 'OTP sent'),
);
router.post(
  '/guest',
  formLimiter,
  upload('resume', 'resume', { required: false }),
  validate({
    body: alertBody.keys({
      otp: otp.required(),
      fullName: Joi.string().trim().min(2).max(120),
      mobile: mobile.required(),
      email: email.required(),
      criteria: jsonCriteria.required(),
      consentCommunication: Joi.boolean(),
      acceptTerms: Joi.boolean().valid(true).required().messages({ 'any.only': 'Please accept the Privacy Policy and Terms' }),
    }),
  }),
  async (req, res) => created(res, await s.guestCreateAlert(req, req.body, req.file), 'Job alert created'),
);

router.use(authenticate, authorize(ROLES.CANDIDATE));
router.get('/', async (req, res) => ok(res, await s.listMyAlerts(req.user._id)));
router.get('/prefill', async (req, res) => ok(res, await s.prefill(req.user._id)));
router.get('/responses', validate({ query: Joi.object({ ...pagination, alertId: objectId }) }), async (req, res) =>
  paginated(res, await s.alertResponses(req.user._id, { ...req.query, ...parsePagination(req.query) })),
);
router.post('/', validate({ body: alertBody }), async (req, res) => created(res, await s.createAlert(req.user, req.body), 'Job alert created'));
router.patch(
  '/:id',
  validate({
    params: idParam,
    body: alertBody
      .fork(['name', 'criteria'], (x) => x.optional())
      .keys({ isActive: Joi.boolean(), criteria: criteria })
      .min(1),
  }),
  async (req, res) => ok(res, await s.updateAlert(req.user._id, req.params.id, req.body), 'Job alert updated'),
);
router.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await s.deleteAlert(req.user._id, req.params.id);
  return ok(res, null, 'Job alert deleted');
});

/* ------------------------------------------------------------------ admin */

export const adminRouter = Router();
adminRouter.use(requireAdminPermission('notifications.send'));

const adminQuery = Joi.object({
  ...pagination,
  ...timespan,
  status: Joi.string().valid('active', 'paused', 'pending', 'trashed'),
  frequency: Joi.string().valid('daily', 'weekly', 'monthly'),
  source: Joi.string().valid('candidate', 'admin', 'guest'),
  q: Joi.string().allow(''),
  format: exportFormat,
});
adminRouter.get('/', validate({ query: adminQuery }), async (req, res) => paginated(res, await s.adminList(req.query, parsePagination(req.query))));
adminRouter.get('/export', validate({ query: adminQuery }), async (req, res) => {
  const { items } = await s.adminList(req.query, { page: 1, limit: 50000, skip: 0, sort: { createdAt: -1 } });
  return exportRows(res, {
    format: req.query.format,
    filename: 'job-alerts',
    columns: [
      { header: 'Alert Name', key: 'name' },
      { header: 'Candidate', key: 'user.fullName' },
      { header: 'Candidate ID', key: 'user.uid' },
      { header: 'E-mail ID', key: 'email' },
      { header: 'Mobile Number', key: 'mobile' },
      { header: 'Job Title', key: 'criteria.jobTitle' },
      { header: 'Key Skills', key: 'criteria.keySkills' },
      { header: 'Locations', key: 'loc', get: (r) => (r.criteria?.locations || []).map((l) => l.city).join(', ') },
      { header: 'Frequency', key: 'frequency' },
      { header: 'Status', key: 'status' },
      { header: 'Source', key: 'source' },
      { header: 'Last Sent', key: 'lastSentAt' },
      { header: 'Created', key: 'createdAt' },
    ],
    rows: items,
  });
});
adminRouter.post('/import', upload('excel', 'file'), async (req, res) => ok(res, await s.importAlerts(req.user, req.file.buffer), 'Import completed'));
adminRouter.post(
  '/bulk-create',
  validate({ body: Joi.object({ candidateIds: bulkIds(BULK_LIMITS.jobAlertCandidates), alert: alertBody.fork(['name'], (x) => x.required()).required() }) }),
  async (req, res) => created(res, await s.adminCreateForCandidates(req.user, req.body), 'Job alerts created'),
);
adminRouter.post(
  '/bulk',
  validate({
    body: Joi.object({
      ids: bulkIds(BULK_LIMITS.jobAlertCandidates),
      action: Joi.string().valid('start', 'stop', 'approve', 'unapprove', 'trash', 'edit').required(),
      data: Joi.object({ frequency: Joi.string().valid('daily', 'weekly', 'monthly'), criteria }),
    }),
  }),
  async (req, res) => ok(res, await s.adminBulk(req.body.ids, req.body.action, req.body.data), 'Updated'),
);
adminRouter.post('/send-jobs', validate({ body: Joi.object({ alertIds: bulkIds(BULK_LIMITS.jobAlertCandidates), jobIds: bulkIds(50) }) }), async (req, res) =>
  ok(res, await s.adminSendJobs(req.body.alertIds, req.body.jobIds), 'Jobs sent'),
);
adminRouter.get('/:id', validate({ params: idParam }), async (req, res) =>
  ok(res, await JobAlert.findById(req.params.id).populate('user', 'fullName email mobile uid').lean()),
);
adminRouter.patch(
  '/:id',
  validate({
    params: idParam,
    body: alertBody
      .fork(['name', 'criteria'], (x) => x.optional())
      .keys({ isActive: Joi.boolean(), status: Joi.string().valid('active', 'paused', 'pending', 'trashed') }),
  }),
  async (req, res) => ok(res, await s.adminUpdate(req.params.id, req.body), 'Updated'),
);
