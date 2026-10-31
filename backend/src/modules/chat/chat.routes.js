import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, requireAdminPermission } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { uploadLimiter } from '../../shared/middleware/rateLimit.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination } from '../../shared/validators/common.js';
import * as s from './chat.service.js';

const attachment = Joi.object({ key: Joi.string().max(500).required(), name: Joi.string().max(200), mime: Joi.string().max(100), size: Joi.number() });
const messageBody = Joi.object({
  body: Joi.string().max(5000).allow(''),
  attachments: Joi.array().items(attachment).max(5).default([]),
  clientId: Joi.string().max(64),
});

export const router = Router();
router.use(authenticate);

router.get('/conversations', validate({ query: Joi.object({ ...pagination, type: Joi.string().valid('direct', 'support') }) }), async (req, res) =>
  paginated(res, await s.listConversations(req.user, { ...req.query, ...parsePagination(req.query) })),
);
router.get('/unread', async (req, res) => ok(res, await s.unreadCount(req.user._id)));
router.post(
  '/conversations',
  validate({
    body: Joi.object({ candidateId: objectId, organizationId: objectId, jobId: objectId, message: Joi.string().max(5000) }).or('candidateId', 'organizationId'),
  }),
  async (req, res) => created(res, await s.startDirect(req.user, req.body)),
);
router.post('/support', validate({ body: Joi.object({ subject: Joi.string().max(200), message: Joi.string().max(5000) }) }), async (req, res) =>
  created(res, await s.startSupport(req.user, req.body)),
);
router.get('/conversations/:id', validate({ params: idParam }), async (req, res) => ok(res, (await s.getConversationFor(req.user, req.params.id)).toObject()));
router.get(
  '/conversations/:id/messages',
  validate({ params: idParam, query: Joi.object({ before: Joi.date(), limit: Joi.number().integer().min(1).max(100).default(30) }) }),
  async (req, res) => ok(res, await s.listMessages(req.user, req.params.id, req.query)),
);
router.post('/conversations/:id/messages', validate({ params: idParam, body: messageBody }), async (req, res) =>
  created(res, await s.sendMessage(req.user, req.params.id, req.body)),
);
router.post('/conversations/:id/read', validate({ params: idParam }), async (req, res) => {
  await s.markRead(req.user, req.params.id);
  return ok(res, null, 'Marked as read');
});
router.post('/attachments', uploadLimiter, upload('chat', 'file'), async (req, res) => created(res, await s.uploadAttachment(req.user, req.file), 'Uploaded'));
router.delete('/messages/:id', validate({ params: idParam }), async (req, res) => {
  await s.deleteMessage(req.user, req.params.id);
  return ok(res, null, 'Message deleted');
});

/* Admin chat dashboard: monitor candidate-employer chats & handle support. */
export const adminRouter = Router();
adminRouter.use(requireAdminPermission('chat.manage'));
adminRouter.get('/stats', async (_req, res) => ok(res, await s.adminStats()));
adminRouter.get(
  '/conversations',
  validate({
    query: Joi.object({
      ...pagination,
      type: Joi.string().valid('direct', 'support'),
      status: Joi.string().valid('open', 'closed'),
      q: Joi.string().allow(''),
    }),
  }),
  async (req, res) => paginated(res, await s.listConversations(req.user, { ...req.query, ...parsePagination(req.query), adminView: true })),
);
adminRouter.get(
  '/conversations/:id/messages',
  validate({ params: idParam, query: Joi.object({ before: Joi.date(), limit: Joi.number().integer().min(1).max(100).default(50) }) }),
  async (req, res) => ok(res, await s.listMessages(req.user, req.params.id, req.query)),
);
adminRouter.post('/conversations/:id/messages', validate({ params: idParam, body: messageBody }), async (req, res) =>
  created(res, await s.sendMessage(req.user, req.params.id, req.body)),
);
adminRouter.patch(
  '/conversations/:id',
  validate({ params: idParam, body: Joi.object({ status: Joi.string().valid('open', 'closed'), assignedAdmin: objectId.allow(null) }).min(1) }),
  async (req, res) => ok(res, await s.adminUpdateConversation(req.user, req.params.id, req.body), 'Updated'),
);
