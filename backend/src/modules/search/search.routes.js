import { Router } from 'express';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { ok } from '../../shared/http/response.js';
import { suggest } from './suggest.service.js';
import { recordPick, trending } from './searchStats.service.js';
import { optionalAuth } from '../../shared/middleware/auth.js';
import { forYou } from './forYou.service.js';

/** GET /search/suggest?q=jaip&scope=locations - grouped suggestions for every search box. */
const r = Router();
r.get(
  '/suggest',
  validate({
    query: Joi.object({
      q: Joi.string().trim().max(80).allow('').required(),
      scope: Joi.string().valid('jobs', 'candidates', 'companies', 'locations').default('jobs'),
      limit: Joi.number().integer().min(1).max(12).default(6),
    }),
  }),
  async (req, res) => {
    res.set('Cache-Control', 'public, max-age=120');
    return ok(res, await suggest(req.query));
  },
);
/** Trending searches (last 7 days, only terms that find results). */
r.get('/trending', validate({ query: Joi.object({ scope: Joi.string().valid('jobs', 'candidates').default('jobs'), limit: Joi.number().integer().min(1).max(20).default(8) }) }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  return ok(res, await trending(req.query));
});

/** A suggestion was picked: improves trending (anonymous daily counter). */
r.post('/track', validate({ body: Joi.object({ term: Joi.string().trim().min(2).max(80).required(), scope: Joi.string().valid('jobs', 'candidates').default('jobs') }) }), async (req, res) => {
  await recordPick(req.body);
  return ok(res, { ok: true });
});

/** Personal shortcuts for a signed-in job seeker: their titles, skills and preferred cities. */
r.get('/for-you', optionalAuth, async (req, res) => ok(res, await forYou(req.user)));

export default r;
