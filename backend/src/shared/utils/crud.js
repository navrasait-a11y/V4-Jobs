import ApiError from '../errors/ApiError.js';
import { ok, created, paginated } from '../http/response.js';
import { parsePagination } from './pagination.js';
import { escapeRegex } from './helpers.js';
import { dateRangeFilter } from './timespan.js';
import { audit } from '../../modules/activity/activity.service.js';

/**
 * Small admin CRUD controller factory for simple, admin-owned resources (FAQs, ads, pages ...).
 * Keeps those modules consistent (pagination, search, audit trail) without boilerplate.
 */
export function crudController(Model, { name, searchFields = [], filterFields = [], populate, transform = (d) => d, defaultSort = '-createdAt' }) {
  return {
    list: async (req, res) => {
      const p = parsePagination(req.query, { defaultSort });
      const filter = { ...dateRangeFilter(req.query) };
      for (const f of filterFields) if (req.query[f] !== undefined && req.query[f] !== '') filter[f] = req.query[f];
      if (req.query.q && searchFields.length) filter.$or = searchFields.map((f) => ({ [f]: new RegExp(escapeRegex(req.query.q), 'i') }));
      let q = Model.find(filter).sort(p.sort).skip(p.skip).limit(p.limit);
      if (populate) q = q.populate(populate);
      const [items, total] = await Promise.all([q.lean(), Model.countDocuments(filter)]);
      return paginated(res, { items, total, page: p.page, limit: p.limit });
    },
    get: async (req, res) => {
      const doc = await Model.findById(req.params.id).lean();
      if (!doc) throw ApiError.notFound(`${name} not found`);
      return ok(res, doc);
    },
    create: async (req, res) => {
      const doc = await Model.create(await transform(req.body, req));
      audit(req, { action: `${name.toLowerCase()}.create`, entity: name, entityId: doc._id });
      return created(res, doc);
    },
    update: async (req, res) => {
      const doc = await Model.findByIdAndUpdate(req.params.id, { $set: await transform(req.body, req, true) }, { new: true, runValidators: true });
      if (!doc) throw ApiError.notFound(`${name} not found`);
      audit(req, { action: `${name.toLowerCase()}.update`, entity: name, entityId: doc._id, changes: Object.keys(req.body) });
      return ok(res, doc, 'Updated');
    },
    remove: async (req, res) => {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound(`${name} not found`);
      audit(req, { action: `${name.toLowerCase()}.delete`, entity: name, entityId: req.params.id });
      return ok(res, null, 'Deleted');
    },
  };
}
