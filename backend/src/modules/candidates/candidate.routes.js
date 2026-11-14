import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, forbidImpersonation } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { uploadLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created } from '../../shared/http/response.js';
import { ROLES } from '../../shared/constants/index.js';
import ApiError from '../../shared/errors/ApiError.js';
import * as s from './candidate.service.js';
import * as v from './candidate.validation.js';
import { listProfileViews } from './profileViews.service.js';

const itemSchema = (section) => (section === 'employments' ? v.employment : v.education);

/**
 * Profile editing routes, shared by the candidate (/candidates/me) and the admin panel
 * (/admin/candidates/:id/profile). `subject(req)` returns the request to act as: the candidate
 * themself, or the admin's request re-targeted at the candidate being edited.
 */
export function profileRouter(subject = (req) => req) {
  const p = Router({ mergeParams: true });
  p.get('/', async (req, res) => ok(res, await s.getMyProfile(subject(req).user._id)));
  p.patch('/', validate(v.updateProfile), async (req, res) => ok(res, await s.updateProfile(subject(req), req.body), 'Profile updated'));
  // Specific paths first - otherwise /resume would be captured by /:section.
  p.post('/resume', uploadLimiter, upload('resume', 'resume'), async (req, res) => created(res, await s.uploadResume(subject(req), req.file), 'Resume uploaded'));
  p.delete('/resume', async (req, res) => ok(res, await s.deleteResume(subject(req)), 'Resume deleted'));
  p.get('/resume/download', async (req, res) => ok(res, await s.resumeDownloadUrl(subject(req).user._id)));
  p.post('/avatar', uploadLimiter, upload('image', 'avatar'), async (req, res) => ok(res, await s.uploadAvatar(subject(req), req.file), 'Profile photo updated'));
  p.post('/:section', validate({ params: v.sectionParam }), async (req, res) => {
    const { value, error } = itemSchema(req.params.section).validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) throw ApiError.validation(error.details.map((d) => ({ field: d.path.join('.'), message: d.message })));
    return created(res, await s.addItem(subject(req), req.params.section, value), 'Added');
  });
  p.patch('/:section/:itemId', validate({ params: v.sectionParam }), async (req, res) => {
    const { value, error } = itemSchema(req.params.section)
      .fork(['jobTitle', 'employerName', 'level'], (x) => x.optional())
      .validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) throw ApiError.validation(error.details.map((d) => ({ field: d.path.join('.'), message: d.message })));
    return ok(res, await s.updateItem(subject(req), req.params.section, req.params.itemId, value), 'Updated');
  });
  p.delete('/:section/:itemId', validate({ params: v.sectionParam }), async (req, res) =>
    ok(res, await s.removeItem(subject(req), req.params.section, req.params.itemId), 'Removed'),
  );
  return p;
}

const r = Router();
r.use(authenticate, authorize(ROLES.CANDIDATE));

r.get('/me/dashboard', async (req, res) => ok(res, await s.dashboard(req.user._id)));
r.get(
  '/me/profile-views',
  validate({ query: Joi.object({ days: Joi.number().integer().valid(7, 30, 90, 180, 365), type: Joi.string().valid('all', 'company', 'consultancy'), page: Joi.number().integer().min(1).max(100), limit: Joi.number().integer().min(1).max(50) }) }),
  async (req, res) => ok(res, await listProfileViews(req.user._id, req.query)),
);
r.get('/me/resume-builder', async (req, res) => ok(res, await s.getResumeBuilder(req.user._id)));
r.put('/me/resume-builder', validate(v.resumeBuilder), async (req, res) => ok(res, await s.saveResumeBuilder(req.user._id, req.body), 'Resume saved'));
r.post('/me/deactivate', forbidImpersonation, validate({ body: Joi.object({ reason: Joi.string().max(500).allow('') }) }), async (req, res) => {
  await s.deactivate(req, req.body);
  return ok(res, null, 'Account deactivated. Log in again any time to reactivate');
});
r.delete('/me', forbidImpersonation, validate(v.deleteAccount), async (req, res) => {
  await s.deleteAccount(req, req.body);
  return ok(res, null, 'Account deleted');
});
r.use('/me', profileRouter());

export default r;
