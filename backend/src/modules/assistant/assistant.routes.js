import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { optionalAuth } from '../../shared/middleware/auth.js';
import { assistantLimiter } from '../../shared/middleware/rateLimit.js';
import { ok } from '../../shared/http/response.js';
import { reply } from './assistant.service.js';

const router = Router();

router.post('/message', assistantLimiter, optionalAuth, validate({ body: Joi.object({ message: Joi.string().trim().min(1).max(500).required() }) }), async (req, res) =>
  ok(res, await reply(req.user, req.body.message)),
);

export default router;
