import ApiError from '../../shared/errors/ApiError.js';
import { escapeRegex, slugify } from '../../shared/utils/helpers.js';
import { parseWorkbook } from '../../shared/utils/excel.js';
import { Lookup, Location, LOOKUP_TYPES, PARENT_TYPE, USER_ADDABLE_TYPES } from './masterdata.models.js';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const clearCache = () => cache.clear();

export function assertType(type) {
  if (!LOOKUP_TYPES[type]) throw ApiError.badRequest(`Unknown master data type "${type}"`, undefined, 'INVALID_LOOKUP_TYPE');
}

export const listTypes = () => Object.entries(LOOKUP_TYPES).map(([key, label]) => ({ key, label, userAddable: USER_ADDABLE_TYPES.includes(key) }));

/**
 * Parent ids from parent names, e.g. industries for sub industries. A specialisation parent can be
 * "Graduate>B.Com" because the same degree name exists under more than one education level.
 */
async function resolveParents(type, names) {
  const parentType = PARENT_TYPE[type];
  if (!parentType) throw ApiError.badRequest(`"${type}" has no parent options`, undefined, 'INVALID_LOOKUP_PARENT');
  const ids = new Map();
  const plain = names.filter((n) => !n.includes('>'));
  if (plain.length) {
    const rows = await Lookup.find({ type: parentType, slug: { $in: plain.map(slugify) } }).select('name').lean();
    for (const r of rows) ids.set(String(r._id), r.name);
  }
  for (const path of names.filter((n) => n.includes('>'))) {
    const [grand, name] = path.split('>').map((x) => x.trim());
    const grandType = PARENT_TYPE[parentType];
    const g = grandType && (await Lookup.findOne({ type: grandType, slug: slugify(grand) }).select('_id').lean());
    const row = g && (await Lookup.findOne({ type: parentType, slug: slugify(name), parent: g._id }).select('name').lean());
    if (row) ids.set(String(row._id), row.name);
  }
  return ids;
}

/** Suggestions for a dropdown / type-ahead. Results are cached per (type,parent,parents,q). */
export async function search(type, { q, parent, parents, limit = 50, includeInactive = false } = {}) {
  assertType(type);
  const key = `${type}|${parent || ''}|${parents || ''}|${q || ''}|${limit}|${includeInactive}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;

  const filter = { type };
  if (!includeInactive) filter.isActive = true;
  if (parent) filter.parent = parent;
  let parentNames = null;
  if (parents) {
    parentNames = await resolveParents(
      type,
      parents
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 10),
    );
    filter.parent = { $in: [...parentNames.keys()] };
  }
  if (q) filter.name = new RegExp(`(^|[\\s(/-])${escapeRegex(q.slice(0, 60))}`, 'i');
  let value = await Lookup.find(filter)
    .select('name slug parent order isUserAdded')
    .sort(q ? { usageCount: -1, order: 1, name: 1 } : { order: 1, name: 1 })
    .limit(Math.min(limit, 500))
    .lean();
  if (parentNames) value = value.map((v) => ({ ...v, parentName: parentNames.get(String(v.parent)) }));
  cache.set(key, { value, exp: Date.now() + CACHE_MS });
  if (cache.size > 5000) clearCache();
  return value;
}

export async function bulk(types) {
  const out = {};
  await Promise.all(
    types.map(async (t) => {
      if (LOOKUP_TYPES[t]) out[t] = await search(t, { limit: 500 });
    }),
  );
  return out;
}

export async function create(type, { name, parent, order, isActive = true, meta }, { userId, isUserAdded = false } = {}) {
  assertType(type);
  const slug = slugify(name);
  if (!slug) throw ApiError.badRequest('Invalid name');
  const existing = await Lookup.findOne({ type, slug, parent: parent || null });
  if (existing) {
    if (isUserAdded) return existing; // user typing an existing option - idempotent
    throw ApiError.conflict(`"${name}" already exists`);
  }
  const doc = await Lookup.create({ type, name: name.trim(), slug, parent: parent || undefined, order, isActive, meta, isUserAdded, createdBy: userId });
  clearCache();
  return doc;
}

export async function suggestByUser(type, name, userId) {
  if (!USER_ADDABLE_TYPES.includes(type)) throw ApiError.forbidden('New options for this field can only be added by admin');
  return create(type, { name }, { userId, isUserAdded: true });
}

export async function update(id, data) {
  if (data.name) data.slug = slugify(data.name);
  const doc = await Lookup.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!doc) throw ApiError.notFound('Option not found');
  clearCache();
  return doc;
}

export async function remove(id) {
  const children = await Lookup.countDocuments({ parent: id });
  if (children) throw ApiError.badRequest('Remove or move the child options first', undefined, 'HAS_CHILDREN');
  await Lookup.deleteOne({ _id: id });
  clearCache();
}

export async function adminList(type, { q, parent, page, limit, skip, isUserAdded }) {
  assertType(type);
  const filter = { type };
  if (parent) filter.parent = parent;
  if (q) filter.name = new RegExp(escapeRegex(q), 'i');
  if (isUserAdded !== undefined) filter.isUserAdded = isUserAdded;
  const [items, total] = await Promise.all([
    Lookup.find(filter)
      .populate({ path: 'parent', select: 'name type parent', populate: { path: 'parent', select: 'name' } })
      .sort({ order: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lookup.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/**
 * Excel import: columns Name | Parent | Order | Active. Parent is matched by name within the parent
 * type; for specialisations it may be "Level>Degree" because degree names repeat across levels.
 */
export async function importLookups(type, buffer, { parentType, userId }) {
  assertType(type);
  const rows = await parseWorkbook(buffer, { name: 'name', parent: 'parent', order: 'order', active: 'active' });
  const ofType = parentType || PARENT_TYPE[type];
  const parents = ofType ? await Lookup.find({ type: ofType }).select('name slug').lean() : [];
  const parentBySlug = new Map(parents.map((p) => [p.slug, p._id]));
  const byPath = new Map();
  for (const path of new Set(rows.map((r) => String(r.parent || '')).filter((p) => p.includes('>')))) {
    const [id] = (await resolveParents(type, [path])).keys();
    if (id) byPath.set(path, id);
  }
  const ops = [];
  const errors = [];
  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name) {
      errors.push({ row: row.__row, message: 'Name is required' });
      continue;
    }
    const parent = row.parent ? (String(row.parent).includes('>') ? byPath.get(String(row.parent)) : parentBySlug.get(slugify(row.parent))) : undefined;
    if (row.parent && !parent) {
      errors.push({ row: row.__row, message: `Parent "${row.parent}" not found` });
      continue;
    }
    const slug = slugify(name);
    ops.push({
      updateOne: {
        filter: { type, slug, parent: parent || null },
        update: {
          $set: { name, order: Number(row.order) || 0, isActive: !['no', 'false', '0'].includes(String(row.active ?? 'yes').toLowerCase()) },
          $setOnInsert: { type, slug, parent, createdBy: userId },
        },
        upsert: true,
      },
    });
  }
  const res = ops.length ? await Lookup.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
  clearCache();
  return { total: rows.length, inserted: res.upsertedCount, updated: res.modifiedCount, errors };
}

export async function exportLookups(type) {
  assertType(type);
  const rows = await Lookup.find({ type }).populate({ path: 'parent', select: 'name parent', populate: { path: 'parent', select: 'name' } }).sort({ order: 1, name: 1 }).lean();
  // Specialisations export their parent as "Level>Degree" so the file imports back unchanged.
  return rows.map((r) => ({ ...r, parentLabel: r.parent ? (type === 'specialisation' && r.parent.parent?.name ? `${r.parent.parent.name}>${r.parent.name}` : r.parent.name) : '' }));
}

/* --------------------------------------------------------------- Locations */

const display = (l) =>
  [l.locality, l.district, l.city, l.state, l.country]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

function normalizeLocation(data) {
  const doc = {
    locality: data.locality?.trim() || undefined,
    district: data.district?.trim() || undefined,
    city: data.city?.trim(),
    state: data.state?.trim(),
    country: data.country?.trim() || 'India',
    pincode: data.pincode ? String(data.pincode).trim() : undefined,
    isPopular: data.isPopular,
    isActive: data.isActive,
    geo: data.geo,
  };
  doc.displayName = display(doc);
  doc.searchKey = doc.displayName.toLowerCase();
  return doc;
}

export async function searchLocations({ q, state, city, limit = 20, popular }) {
  const filter = { isActive: true };
  if (state) filter.state = new RegExp(`^${escapeRegex(state)}$`, 'i');
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
  if (popular) filter.isPopular = true;
  if (q) filter.searchKey = new RegExp(`(^|, )${escapeRegex(q.toLowerCase().slice(0, 60))}`);
  return Location.find(filter).select('-searchKey -__v').sort({ isPopular: -1, city: 1 }).limit(Math.min(limit, 100)).lean();
}

export const listStates = (country = 'India') => Location.distinct('state', { country, isActive: true });
export const listCities = (state) => Location.distinct('city', { ...(state ? { state } : {}), isActive: true });

export async function createLocation(data) {
  return Location.create(normalizeLocation(data));
}

export async function updateLocation(id, data) {
  const current = await Location.findById(id).lean();
  if (!current) throw ApiError.notFound('Location not found');
  const doc = await Location.findByIdAndUpdate(id, { $set: normalizeLocation({ ...current, ...data }) }, { new: true });
  return doc;
}

export const deleteLocation = (id) => Location.deleteOne({ _id: id });

/** Columns: Locality | District | City | State | Country | Pincode | Popular */
export async function importLocations(buffer) {
  const rows = await parseWorkbook(buffer, {}, { maxRows: 50000 });
  const ops = [];
  const errors = [];
  for (const row of rows) {
    if (!row.city || !row.state) {
      errors.push({ row: row.__row, message: 'City and State are required' });
      continue;
    }
    const doc = normalizeLocation({ ...row, isPopular: ['yes', 'true', '1'].includes(String(row.popular || '').toLowerCase()), isActive: true });
    ops.push({
      updateOne: {
        filter: { country: doc.country, state: doc.state, city: doc.city, district: doc.district ?? null, locality: doc.locality ?? null },
        update: { $set: doc },
        upsert: true,
      },
    });
  }
  const res = ops.length ? await Location.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
  return { total: rows.length, inserted: res.upsertedCount, updated: res.modifiedCount, errors };
}

/** Increments popularity of used options so type-ahead ranks them higher. */
export function touchUsage(type, names = []) {
  if (!names.length) return;
  Lookup.updateMany({ type, slug: { $in: names.map(slugify) } }, { $inc: { usageCount: 1 } }).catch(() => {});
}

const EARTH_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;
function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * "Show jobs / candidates within N km": the picked cities plus every city whose centre lies
 * within `km` of one of them. Cities without coordinates match only themselves.
 */
export async function citiesWithin(names = [], km) {
  const picked = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  if (!picked.length || !km) return picked;
  const centres = await Location.find({ city: { $in: picked.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) }, 'geo.lat': { $ne: null } })
    .select('city geo')
    .lean();
  const out = new Set(picked);
  for (const c of centres) {
    const dLat = km / 111;
    const dLng = km / (111 * Math.max(Math.cos(rad(c.geo.lat)), 0.01));
    const near = await Location.find({
      isActive: true,
      'geo.lat': { $gte: c.geo.lat - dLat, $lte: c.geo.lat + dLat },
      'geo.lng': { $gte: c.geo.lng - dLng, $lte: c.geo.lng + dLng },
    })
      .select('city geo')
      .lean();
    for (const n of near) if (distanceKm(c.geo, n.geo) <= km) out.add(n.city);
  }
  return [...out].slice(0, 200);
}
