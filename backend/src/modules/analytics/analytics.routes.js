import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, authorize, requireEmployer } from '../../shared/middleware/auth.js';
import { ok } from '../../shared/http/response.js';
import { timespan } from '../../shared/validators/common.js';
import { ROLES } from '../../shared/constants/index.js';
import * as s from './analytics.service.js';

const q = { query: Joi.object(timespan) };
const r = Router();
r.use(authenticate);

r.get('/employer', authorize(ROLES.EMPLOYER), requireEmployer(), validate(q), async (req, res) => ok(res, await s.employerAnalytics(req.orgId, req.query)));
r.get('/candidate', authorize(ROLES.CANDIDATE), validate(q), async (req, res) => ok(res, await s.candidateAnalytics(req.user._id, req.query)));

export default r;
