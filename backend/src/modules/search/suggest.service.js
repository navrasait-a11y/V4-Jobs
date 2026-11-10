import { Lookup } from '../masterdata/masterdata.models.js';
import Organization from '../employers/organization.model.js';
import Job from '../jobs/job.model.js';
import { expandTerm } from './synonyms.js';
import { correctQuery } from '../jobs/job.spell.js';
import { escapeRegex } from '../../shared/utils/helpers.js';
import { smartLocations } from '../masterdata/locationSearch.js';

/**
 * One call for every search box: grouped, ranked suggestions for what is typed.
 *  scope "jobs"       job titles, skills, companies (with live job counts)
 *  scope "candidates" job titles / designations and skills (employer candidate search)
 *  scope "companies"  companies only
 *  scope "locations"  places (city first, then localities; aliases and typos handled)
 * Ranking: starts-with before word-match, then how often the option is used.
 */
const cache = new Map();
const TTL = 5 * 60 * 1000;
const MAX_CACHE = 2000;

/** Live jobs per title and per skill (lower-case), refreshed every 10 minutes. */
let counts = { at: 0, titles: new Map(), skills: new Map() };
async function jobCounts() {
  if (Date.now() - counts.at < 10 * 60 * 1000) return counts;
  const [titles, skills] = await Promise.all([
    Job.aggregate([{ $match: { status: 'active' } }, { $group: { _id: { $toLower: '$title' }, n: { $sum: 1 } } }]),
    Job.aggregate([{ $match: { status: 'active' } }, { $unwind: '$keySkills' }, { $group: { _id: { $toLower: '$keySkills' }, n: { $sum: 1 } } }]),
  ]);
  counts = { at: Date.now(), titles: new Map(titles.map((r) => [r._id, r.n])), skills: new Map(skills.map((r) => [r._id, r.n])) };
  return counts;
}
const withCount = (items, map) =>
  items.map((i) => {
    const n = map.get(i.label.toLowerCase()) || 0;
    return n ? { ...i, meta: `${n} job${n > 1 ? 's' : ''}` } : i;
  });

const rank = (name, term) => {
  const n = name.toLowerCase();
  if (n === term) return 0;
  if (n.startsWith(term)) return 1;
  if (n.split(/[\s(/,.-]+/).some((w) => w.startsWith(term))) return 2;
  return 3;
};

async function lookups(types, term, limit) {
  // Starts-with matches get their own query, so many word matches cannot crowd them out.
  const find = (re, n) =>
    Lookup.find({ type: { $in: types }, isActive: true, name: re })
      .select('name usageCount')
      .sort({ usageCount: -1 })
      .limit(n)
      .lean();
  const [starts, words] = await Promise.all([find(new RegExp(`^${escapeRegex(term)}`, 'i'), 40), find(new RegExp(`[\\s(/,.-]${escapeRegex(term)}`, 'i'), 30)]);
  const rows = [...starts, ...words];
  const seen = new Set();
  return rows
    .sort((a, b) => rank(a.name, term) - rank(b.name, term) || (b.usageCount || 0) - (a.usageCount || 0) || a.name.length - b.name.length)
    .filter((r) => (seen.has(r.name.toLowerCase()) ? false : seen.add(r.name.toLowerCase())))
    .slice(0, limit)
    .map((r) => ({ label: r.name }));
}

async function companies(term, limit) {
  const rows = await Organization.find({ status: 'active', name: new RegExp(`(^|\\s)${escapeRegex(term)}`, 'i') })
    .select('name slug username type logo stats.activeJobs isVerified')
    .sort({ 'stats.activeJobs': -1 })
    .limit(30)
    .lean();
  return rows
    .sort((a, b) => rank(a.name, term) - rank(b.name, term) || (b.stats?.activeJobs || 0) - (a.stats?.activeJobs || 0))
    .slice(0, limit)
    .map((o) => ({
      label: o.name,
      meta: o.stats?.activeJobs ? `${o.stats.activeJobs} job${o.stats.activeJobs > 1 ? 's' : ''}` : '',
      logo: o.logo?.url || '',
      verified: Boolean(o.isVerified),
      path: `/${o.type === 'consultancy' ? 'recruiters' : 'companies'}/${o.slug || o.username}`,
    }));
}

export async function suggest({ q = '', scope = 'jobs', limit = 6 } = {}) {
  const term = String(q).trim().toLowerCase().slice(0, 80);
  if (term.length < 1) return { q: term, groups: [], didYouMean: null };
  const key = `${scope}|${term}|${limit}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;

  const groups = [];
  if (scope === 'locations') {
    const { items, corrected } = await smartLocations({ q: term, limit: limit * 2, withJobs: true });
    groups.push({
      key: 'locations',
      label: 'Locations',
      icon: 'location_on',
      items: items.map((l) => ({ label: String(l.displayName || '').replace(/, India$/, ''), value: l.locality || l.district || l.city, city: l.city, meta: l.activeJobs ? `${l.activeJobs} jobs` : '', place: l })),
    });
    const value = { q: term, groups, didYouMean: corrected };
    remember(key, value);
    return value;
  }
  const [titles, skills, orgs] = await Promise.all([
    scope === 'companies' ? [] : lookups(['job_title', 'job_role'], term, limit),
    scope === 'companies' ? [] : lookups(['key_skill', 'it_skill'], term, limit),
    scope === 'jobs' || scope === 'companies' ? companies(term, scope === 'companies' ? limit * 2 : Math.ceil(limit / 2)) : [],
  ]);
  const fullForms = scope === 'companies' ? [] : expandTerm(term);
  if (fullForms.length)
    groups.push({
      key: 'expanded',
      label: `“${term.toUpperCase()}” means`,
      icon: 'auto_awesome',
      items: fullForms.map((f) => ({
        label: f
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      })),
    });
  const live = scope === 'jobs' ? await jobCounts() : null;
  if (titles.length) groups.push({ key: 'titles', label: scope === 'candidates' ? 'Designations' : 'Job titles', icon: 'work', items: live ? withCount(titles, live.titles) : titles });
  const skillItems = skills.filter((s) => !titles.some((t) => t.label.toLowerCase() === s.label.toLowerCase()));
  if (skillItems.length) groups.push({ key: 'skills', label: 'Skills', icon: 'psychology', items: live ? withCount(skillItems, live.skills) : skillItems });
  if (orgs.length) groups.push({ key: 'companies', label: 'Companies', icon: 'apartment', items: orgs });
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const didYouMean = total < 2 && term.length >= 4 ? await correctQuery(term, { allowPrefix: true }).catch(() => null) : null;
  const value = { q: term, groups: groups.filter((g) => g.items.length), didYouMean };
  remember(key, value);
  return value;
}

function remember(key, value) {
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { value, exp: Date.now() + TTL });
}

/** Clears cached suggestions and job counts (tests, and after bulk imports). */
export function resetSuggestCache() {
  cache.clear();
  counts = { at: 0, titles: new Map(), skills: new Map() };
}
