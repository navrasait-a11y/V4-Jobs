import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { ok } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination } from '../../shared/validators/common.js';
import * as s from './notification.service.js';

const r = Router();
r.use(authenticate);

r.get('/', validate({ query: Joi.object({ ...pagination, unreadOnly: Joi.boolean().default(false) }) }), async (req, res) => {
  const result = await s.listNotifications(req.user._id, { ...parsePagination(req.query), unreadOnly: req.query.unreadOnly });
  return ok(res, result.items, 'OK', {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.ceil(result.total / result.limit),
    unread: result.unread,
  });
});
r.post('/read', validate({ body: Joi.object({ ids: Joi.array().items(objectId).max(500) }) }), async (req, res) => {
  await s.markRead(req.user._id, req.body.ids);
  return ok(res, null, 'Marked as read');
});
r.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await s.deleteNotification(req.user._id, req.params.id);
  return ok(res, null, 'Deleted');
});

export default r;
