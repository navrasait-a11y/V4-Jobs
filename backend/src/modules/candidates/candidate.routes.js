import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { uploadLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created } from '../../shared/http/response.js';
import { ROLES } from '../../shared/constants/index.js';
import ApiError from '../../shared/errors/ApiError.js';
import * as s from './candidate.service.js';
import * as v from './candidate.validation.js';

const r = Router();
r.use(authenticate, authorize(ROLES.CANDIDATE));

r.get('/me', async (req, res) => ok(res, await s.getMyProfile(req.user._id)));
r.patch('/me', validate(v.updateProfile), async (req, res) => ok(res, await s.updateProfile(req, req.body), 'Profile updated'));
r.get('/me/dashboard', async (req, res) => ok(res, await s.dashboard(req.user._id)));

// Specific paths first - otherwise /me/resume would be captured by /me/:section.
r.post('/me/resume', uploadLimiter, upload('resume', 'resume'), async (req, res) => created(res, await s.uploadResume(req, req.file), 'Resume uploaded'));
r.delete('/me/resume', async (req, res) => ok(res, await s.deleteResume(req), 'Resume deleted'));
r.get('/me/resume/download', async (req, res) => ok(res, await s.resumeDownloadUrl(req.user._id)));
r.post('/me/avatar', uploadLimiter, upload('image', 'avatar'), async (req, res) => ok(res, await s.uploadAvatar(req, req.file), 'Profile photo updated'));

r.get('/me/resume-builder', async (req, res) => ok(res, await s.getResumeBuilder(req.user._id)));
r.put('/me/resume-builder', validate(v.resumeBuilder), async (req, res) => ok(res, await s.saveResumeBuilder(req.user._id, req.body), 'Resume saved'));

r.post('/me/deactivate', validate({ body: Joi.object({ reason: Joi.string().max(500).allow('') }) }), async (req, res) => {
  await s.deactivate(req, req.body);
  return ok(res, null, 'Account deactivated. Log in again any time to reactivate');
});
const itemSchema = (section) => (section === 'employments' ? v.employment : v.education);

r.post('/me/:section', validate({ params: v.sectionParam }), async (req, res) => {
  const { value, error } = itemSchema(req.params.section).validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw ApiError.validation(error.details.map((d) => ({ field: d.path.join('.'), message: d.message })));
  return created(res, await s.addItem(req, req.params.section, value), 'Added');
});
r.patch('/me/:section/:itemId', validate({ params: v.sectionParam }), async (req, res) => {
  const { value, error } = itemSchema(req.params.section)
    .fork(['jobTitle', 'employerName', 'level'], (x) => x.optional())
    .validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) throw ApiError.validation(error.details.map((d) => ({ field: d.path.join('.'), message: d.message })));
  return ok(res, await s.updateItem(req, req.params.section, req.params.itemId, value), 'Updated');
});
r.delete('/me/:section/:itemId', validate({ params: v.sectionParam }), async (req, res) =>
  ok(res, await s.removeItem(req, req.params.section, req.params.itemId), 'Removed'),
);

r.delete('/me', validate(v.deleteAccount), async (req, res) => {
  await s.deleteAccount(req, req.body);
  return ok(res, null, 'Account deleted');
});

export default r;
