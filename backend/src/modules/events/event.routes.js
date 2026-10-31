import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireEmployer } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination, email, mobile, url } from '../../shared/validators/common.js';
import { ROLES } from '../../shared/constants/index.js';
import * as s from './event.service.js';

const eventBody = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().max(10000).allow(''),
  mode: Joi.string().valid('walk_in', 'virtual', 'hybrid').default('walk_in'),
  venue: Joi.object({
    address: Joi.string().max(500).allow(''),
    city: Joi.string().max(100).allow(''),
    state: Joi.string().max(100).allow(''),
    pincode: Joi.string().max(10).allow(''),
    mapUrl: url.allow(''),
  }),
  meetingLink: url.allow(''),
  startAt: Joi.date().required(),
  endAt: Joi.date().min(Joi.ref('startAt')).required(),
  jobs: Joi.array().items(objectId).max(100).default([]),
  contact: Joi.object({ name: Joi.string().max(120).allow(''), email: email.allow(''), mobile: mobile.allow('') }),
  status: Joi.string().valid('draft', 'published', 'closed', 'cancelled').default('draft'),
});

export const employerEvents = Router();
employerEvents.use(authenticate, authorize(ROLES.EMPLOYER), requireEmployer('event.manage', 'job.post'));
employerEvents.get(
  '/',
  validate({ query: Joi.object({ ...pagination, status: Joi.string().valid('draft', 'published', 'closed', 'cancelled') }) }),
  async (req, res) => paginated(res, await s.listOrgEvents(req.user, { ...req.query, ...parsePagination(req.query) })),
);
employerEvents.post('/', validate({ body: eventBody }), async (req, res) => created(res, await s.createEvent(req.user, req.body), 'Event created'));
employerEvents.patch('/:id', validate({ params: idParam, body: eventBody.fork(['title', 'startAt', 'endAt'], (x) => x.optional()) }), async (req, res) =>
  ok(res, await s.updateEvent(req.user, req.params.id, req.body), 'Event updated'),
);
employerEvents.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await s.deleteEvent(req.user, req.params.id);
  return ok(res, null, 'Event deleted');
});
employerEvents.post('/:id/banner', upload('image', 'banner'), validate({ params: idParam }), async (req, res) =>
  ok(res, await s.uploadBanner(req.user, req.params.id, req.file), 'Banner uploaded'),
);
employerEvents.get('/:id/share', validate({ params: idParam }), async (req, res) => ok(res, await s.shareEvent(req.user, req.params.id)));
employerEvents.get('/:id/applications', validate({ params: idParam, query: Joi.object(pagination) }), async (req, res) =>
  paginated(res, await s.eventApplications(req.user, req.params.id, parsePagination(req.query))),
);

export const publicEvents = Router();
publicEvents.get('/', validate({ query: Joi.object({ ...pagination, city: Joi.string().max(100) }) }), async (req, res) =>
  paginated(res, await s.listPublicEvents({ ...req.query, ...parsePagination(req.query) })),
);
publicEvents.get('/:slug', validate({ params: Joi.object({ slug: Joi.string().max(200).required() }) }), async (req, res) =>
  ok(res, await s.publicEvent(req.params.slug)),
);
publicEvents.post(
  '/:slug/apply',
  authenticate,
  authorize(ROLES.CANDIDATE),
  validate({
    params: Joi.object({ slug: Joi.string().max(200).required() }),
    body: Joi.object({ jobIds: Joi.array().items(objectId).min(1).max(100).required() }),
  }),
  async (req, res) => ok(res, await s.applyToEvent(req.user, req.params.slug, req.body.jobIds), 'Applied'),
);
