import { Router } from 'express';
import { nearestCity } from './locationSearch.js';
import Joi from 'joi';
import validate from '../../shared/middleware/validate.js';
import { authenticate, requireAdminPermission } from '../../shared/middleware/auth.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { objectId, pagination, idParam, exportFormat } from '../../shared/validators/common.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { exportRows } from '../../shared/utils/excel.js';
import { audit } from '../activity/activity.service.js';
import * as s from './masterdata.service.js';
import { LOOKUP_TYPES, Location } from './masterdata.models.js';
import { escapeRegex } from '../../shared/utils/helpers.js';

const typeParam = Joi.object({
  type: Joi.string()
    .valid(...Object.keys(LOOKUP_TYPES))
    .required(),
});
const lookupBody = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  parent: objectId.allow(null),
  order: Joi.number().integer().default(0),
  isActive: Joi.boolean().default(true),
  meta: Joi.object().unknown(true),
});
const locationBody = Joi.object({
  locality: Joi.string().trim().max(120).allow(''),
  district: Joi.string().trim().max(120).allow(''),
  city: Joi.string().trim().max(120).required(),
  state: Joi.string().trim().max(120).required(),
  country: Joi.string().trim().max(120).default('India'),
  pincode: Joi.string().trim().max(12).allow(''),
  isPopular: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
  geo: Joi.object({ lat: Joi.number(), lng: Joi.number() }),
});

/* ------------------------------------------------------------------ public */

export const publicRouter = Router();

publicRouter.get('/master-data/types', (_req, res) => ok(res, s.listTypes()));

publicRouter.get('/master-data/bulk', validate({ query: Joi.object({ types: Joi.string().max(1000).required() }) }), async (req, res) =>
  ok(
    res,
    await s.bulk(
      req.query.types
        .split(',')
        .map((t) => t.trim())
        .slice(0, 30),
    ),
  ),
);

publicRouter.get(
  '/master-data/:type',
  validate({
    params: typeParam,
    query: Joi.object({ q: Joi.string().trim().max(60).allow(''), parent: objectId, parents: Joi.string().trim().max(2000), limit: Joi.number().integer().min(1).max(500).default(50) }),
  }),
  async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    return ok(res, await s.search(req.params.type, req.query));
  },
);

publicRouter.post(
  '/master-data/:type/suggest',
  authenticate,
  validate({ params: typeParam, body: Joi.object({ name: Joi.string().trim().min(1).max(150).required() }) }),
  async (req, res) => created(res, await s.suggestByUser(req.params.type, req.body.name, req.user._id), 'Option added'),
);

publicRouter.get(
  '/locations',
  validate({
    query: Joi.object({
      q: Joi.string().trim().max(60).allow(''),
      state: Joi.string().max(120),
      city: Joi.string().max(120),
      popular: Joi.boolean(),
      withJobs: Joi.boolean(),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => ok(res, await s.searchLocations(req.query)),
);
/** "Use my current location": nearest city to the browser's coordinates (POST so they never reach URL logs). */
publicRouter.post(
  '/locations/nearest',
  validate({ body: Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }) }),
  async (req, res) => ok(res, await nearestCity(req.body.lat, req.body.lng)),
);
publicRouter.get('/locations/states', async (req, res) => ok(res, (await s.listStates(req.query.country)).sort()));
publicRouter.get('/locations/cities', async (req, res) => ok(res, (await s.listCities(req.query.state)).sort()));

/* ------------------------------------------------------------------- admin */

export const adminRouter = Router();
// Mounted at the admin root, so the guard is scoped to this router's own prefixes only.
adminRouter.use(['/master-data', '/locations'], requireAdminPermission('masterdata.manage'));

adminRouter.get(
  '/master-data/:type',
  validate({ params: typeParam, query: Joi.object({ ...pagination, q: Joi.string().allow(''), parent: objectId, isUserAdded: Joi.boolean() }) }),
  async (req, res) => paginated(res, await s.adminList(req.params.type, { ...req.query, ...parsePagination(req.query) })),
);
adminRouter.post('/master-data/:type', validate({ params: typeParam, body: lookupBody }), async (req, res) => {
  const doc = await s.create(req.params.type, req.body, { userId: req.user._id });
  audit(req, { action: 'lookup.create', entity: 'Lookup', entityId: doc._id, changes: req.body });
  return created(res, doc);
});
adminRouter.patch('/master-data/item/:id', validate({ params: idParam, body: lookupBody.fork(['name'], (x) => x.optional()) }), async (req, res) => {
  const doc = await s.update(req.params.id, req.body);
  audit(req, { action: 'lookup.update', entity: 'Lookup', entityId: doc._id, changes: req.body });
  return ok(res, doc, 'Updated');
});
adminRouter.delete('/master-data/item/:id', validate({ params: idParam }), async (req, res) => {
  await s.remove(req.params.id);
  audit(req, { action: 'lookup.delete', entity: 'Lookup', entityId: req.params.id });
  return ok(res, null, 'Deleted');
});
adminRouter.post(
  '/master-data/:type/import',
  upload('excel', 'file'),
  validate({ params: typeParam, query: Joi.object({ parentType: Joi.string().valid(...Object.keys(LOOKUP_TYPES)) }) }),
  async (req, res) =>
    ok(res, await s.importLookups(req.params.type, req.file.buffer, { parentType: req.query.parentType, userId: req.user._id }), 'Import completed'),
);
adminRouter.get('/master-data/:type/export', validate({ params: typeParam, query: Joi.object({ format: exportFormat }) }), async (req, res) => {
  const rows = await s.exportLookups(req.params.type);
  return exportRows(res, {
    format: req.query.format,
    filename: `${req.params.type}-options`,
    columns: [
      { header: 'Name', key: 'name' },
      { header: 'Parent', key: 'parentLabel' },
      { header: 'Order', key: 'order' },
      { header: 'Active', key: 'isActive', get: (r) => (r.isActive ? 'Yes' : 'No') },
      { header: 'User Added', key: 'isUserAdded', get: (r) => (r.isUserAdded ? 'Yes' : 'No') },
    ],
    rows,
  });
});

adminRouter.get(
  '/locations',
  validate({ query: Joi.object({ ...pagination, q: Joi.string().allow(''), state: Joi.string(), city: Joi.string() }) }),
  async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.q) filter.searchKey = new RegExp(escapeRegex(req.query.q.toLowerCase()));
    if (req.query.state) filter.state = req.query.state;
    if (req.query.city) filter.city = req.query.city;
    const [items, total] = await Promise.all([
      Location.find(filter).sort({ state: 1, city: 1 }).skip(skip).limit(limit).lean(),
      Location.countDocuments(filter),
    ]);
    return paginated(res, { items, total, page, limit });
  },
);
adminRouter.post('/locations', validate({ body: locationBody }), async (req, res) => created(res, await s.createLocation(req.body)));
adminRouter.patch('/locations/:id', validate({ params: idParam, body: locationBody.fork(['city', 'state'], (x) => x.optional()) }), async (req, res) =>
  ok(res, await s.updateLocation(req.params.id, req.body), 'Updated'),
);
adminRouter.delete('/locations/:id', validate({ params: idParam }), async (req, res) => {
  await s.deleteLocation(req.params.id);
  return ok(res, null, 'Deleted');
});
adminRouter.post('/locations/import', upload('excel', 'file'), async (req, res) => ok(res, await s.importLocations(req.file.buffer), 'Import completed'));
adminRouter.get('/locations/export', validate({ query: Joi.object({ format: exportFormat }) }), async (req, res) => {
  const rows = await Location.find().sort({ state: 1, city: 1 }).lean();
  return exportRows(res, {
    format: req.query.format,
    filename: 'locations',
    columns: ['locality', 'district', 'city', 'state', 'country', 'pincode']
      .map((k) => ({ header: k[0].toUpperCase() + k.slice(1), key: k }))
      .concat([{ header: 'Popular', key: 'isPopular', get: (r) => (r.isPopular ? 'Yes' : 'No') }]),
    rows,
  });
});
