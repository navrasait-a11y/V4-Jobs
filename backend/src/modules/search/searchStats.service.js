import { SearchStat } from './searchStats.model.js';
import { isKnownTerm } from '../jobs/job.spell.js';
import logger from '../../config/logger.js';

const normalize = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/** Never log anything that may identify a person: e-mails, phone numbers, IDs, long free text. */
const looksPersonal = (t) => /@|\d{5,}|^[a-z]{2,6}-\d/i.test(t) || t.length < 2 || t.split(' ').length > 6;

async function bump(terms, scope, inc) {
  const day = new Date().toISOString().slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  const ops = [];
  for (const raw of new Set(terms.map(normalize))) {
    if (!raw || looksPersonal(raw)) continue;
    // Employer searches can contain candidate names: only well-known titles / skills are counted there.
    if (scope === 'candidates' && !(await isKnownTerm(raw))) continue;
    ops.push({ updateOne: { filter: { term: raw, scope, day }, update: { $inc: inc, $setOnInsert: { date } }, upsert: true } });
  }
  if (ops.length) await SearchStat.bulkWrite(ops, { ordered: false });
}

/** Fire-and-forget: a search ran with these terms and found `total` results. */
export function recordSearch({ terms = [], scope = 'jobs', total = 0 }) {
  bump(terms.filter(Boolean), scope, { searches: 1, zero: total ? 0 : 1 }).catch((err) => logger.debug({ err: err.message }, 'search stat skipped'));
}

/** A suggestion was picked (counts as a stronger signal for trending). */
export function recordPick({ term, scope = 'jobs' }) {
  return bump([term], scope, { picks: 1 }).catch(() => {});
}

const cache = new Map();

/** Most searched terms that actually find results, over the last `days` days. */
export async function trending({ scope = 'jobs', days = 7, limit = 8 } = {}) {
  const key = `${scope}|${days}|${limit}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const rows = await SearchStat.aggregate([
    { $match: { scope, date: { $gte: new Date(Date.now() - days * 86400000) } } },
    { $group: { _id: '$term', searches: { $sum: '$searches' }, zero: { $sum: '$zero' }, picks: { $sum: '$picks' } } },
    { $match: { $expr: { $lt: ['$zero', { $multiply: ['$searches', 0.6] }] } } },
    { $addFields: { score: { $add: ['$searches', { $multiply: ['$picks', 2] }] } } },
    { $match: { score: { $gte: 2 } } },
    { $sort: { score: -1 } },
    { $limit: limit },
  ]);
  const value = rows.map((r) => ({ term: r._id, searches: r.searches }));
  cache.set(key, { value, exp: Date.now() + 10 * 60 * 1000 });
  return value;
}

/** Admin insights: top searches, searches that found nothing, daily volume. */
export async function insights({ scope = 'jobs', days = 30, limit = 25 } = {}) {
  const match = { scope, date: { $gte: new Date(Date.now() - days * 86400000) } };
  const group = { _id: '$term', searches: { $sum: '$searches' }, zero: { $sum: '$zero' }, picks: { $sum: '$picks' }, last: { $max: '$date' } };
  const [top, zero, daily, totals] = await Promise.all([
    SearchStat.aggregate([{ $match: match }, { $group: group }, { $sort: { searches: -1 } }, { $limit: limit }]),
    SearchStat.aggregate([{ $match: match }, { $group: group }, { $match: { zero: { $gt: 0 } } }, { $sort: { zero: -1 } }, { $limit: limit }]),
    SearchStat.aggregate([{ $match: match }, { $group: { _id: '$day', searches: { $sum: '$searches' }, zero: { $sum: '$zero' } } }, { $sort: { _id: 1 } }]),
    SearchStat.aggregate([{ $match: match }, { $group: { _id: null, searches: { $sum: '$searches' }, zero: { $sum: '$zero' }, picks: { $sum: '$picks' }, terms: { $addToSet: '$term' } } }]),
  ]);
  const t = totals[0] || { searches: 0, zero: 0, picks: 0, terms: [] };
  const row = (r) => ({ term: r._id, searches: r.searches, zero: r.zero, picks: r.picks, zeroRate: r.searches ? Math.round((r.zero / r.searches) * 100) : 0, last: r.last });
  return {
    days,
    scope,
    totals: { searches: t.searches, zero: t.zero, picks: t.picks, uniqueTerms: t.terms.length, zeroRate: t.searches ? Math.round((t.zero / t.searches) * 100) : 0 },
    top: top.map(row),
    zeroResults: zero.map(row),
    daily: daily.map((d) => ({ day: d._id, searches: d.searches, zero: d.zero })),
  };
}
