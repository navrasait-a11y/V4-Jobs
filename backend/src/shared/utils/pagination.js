import { MAX_PAGE_SIZE } from '../constants/index.js';

/**
 * Normalises ?page=&limit=&sort= into Mongo-friendly values.
 * sort accepts "field" / "-field" / "a,-b"; only whitelisted fields are honoured.
 */
export function parsePagination(query = {}, { defaultLimit = 20, allowedSort = [], defaultSort = '-createdAt' } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  const sort = {};
  const raw = String(query.sort || defaultSort);
  for (const part of raw.split(',')) {
    const field = part.replace(/^-/, '').trim();
    if (!field) continue;
    if (allowedSort.length && !allowedSort.includes(field) && field !== 'createdAt') continue;
    sort[field] = part.startsWith('-') ? -1 : 1;
  }
  if (!Object.keys(sort).length) sort.createdAt = -1;
  if (!sort._id) sort._id = sort[Object.keys(sort)[0]]; // stable ordering for equal keys

  return { page, limit, skip, sort };
}

export async function paginateQuery(Model, filter, { page, limit, skip, sort }, { select, populate, lean = true } = {}) {
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  if (lean) q = q.lean();
  const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
  return { items, total, page, limit };
}
