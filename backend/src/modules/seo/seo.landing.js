import Job from '../jobs/job.model.js';
import { Lookup, Location } from '../masterdata/masterdata.models.js';
import { searchJobs } from '../jobs/job.service.js';
import { buildJobSearch } from '../jobs/job.query.js';
import { JOB_STATUS } from '../../shared/constants/index.js';
import { slugify, escapeRegex } from '../../shared/utils/helpers.js';

/**
 * Naukri-style SEO landing pages:
 *   /jobs-in-jaipur          city
 *   /sales-executive-jobs    role / skill / title
 *   /sales-executive-jobs-in-jaipur
 * Each page lists live jobs and links to related cities / roles (internal linking for Google).
 */
export const LANDING_RE = /^(?:([a-z0-9][a-z0-9-]*?)-)?jobs(?:-in-([a-z0-9][a-z0-9-]*))?$/;

const TTL = 30 * 60 * 1000;
let names = { at: 0, roles: new Map(), cities: new Map() };

async function dictionaries() {
  if (Date.now() - names.at < TTL && names.roles.size) return names;
  const [lookups, cities] = await Promise.all([
    Lookup.find({ type: { $in: ['job_title', 'job_role', 'key_skill', 'it_skill'] }, isActive: true })
      .select('name')
      .limit(60000)
      .lean(),
    Location.distinct('city'),
  ]);
  const roles = new Map();
  for (const { name } of lookups) if (name && !roles.has(slugify(name))) roles.set(slugify(name), name);
  const cityMap = new Map();
  for (const c of cities) if (c && !cityMap.has(slugify(c))) cityMap.set(slugify(c), c);
  names = { at: Date.now(), roles, cities: cityMap };
  return names;
}

const humanize = (slug) =>
  String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length <= 3 && /^(it|hr|qa|ui|ux|bpo|sql|seo|aws|php|ca|cs|mba|bba|bca|mca)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');

export const landingPath = (role, city) => `/${[role && slugify(role), 'jobs'].filter(Boolean).join('-')}${city ? `-in-${slugify(city)}` : ''}`;

/** Resolves a landing slug to { role, city } names, or null when the slug is not a landing page. */
export async function resolveLanding(slug) {
  const m = LANDING_RE.exec(String(slug || '').toLowerCase());
  if (!m || (!m[1] && !m[2])) return null;
  const { roles, cities } = await dictionaries();
  const role = m[1] ? roles.get(m[1]) || humanize(m[1]) : '';
  const city = m[2] ? cities.get(m[2]) || humanize(m[2]) : '';
  return { role, city, known: (!m[1] || roles.has(m[1])) && (!m[2] || cities.has(m[2])) };
}

async function topValues(match, field, limit) {
  const unwind = field.startsWith('locations') ? '$locations' : `$${field}`;
  const rows = await Job.aggregate([
    { $match: match },
    ...(field === 'title' ? [] : [{ $unwind: unwind }]),
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { _id: { $nin: [null, ''] } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count }));
}

export async function landingPage(slug, viewer, { page = 1, limit = 20 } = {}) {
  const resolved = await resolveLanding(slug);
  if (!resolved) return null;
  const { role, city } = resolved;
  const query = { ...(role ? { keywords: [role] } : {}), ...(city ? { location: [city] } : {}), sort: 'relevance' };
  const result = await searchJobs({ ...query, exact: true }, viewer, { page, limit, skip: (page - 1) * limit });

  // Related links: other cities for this role, other roles in this city (or popular ones overall).
  const cityMatch = city ? { status: JOB_STATUS.ACTIVE, 'locations.city': new RegExp(`^${escapeRegex(city)}$`, 'i') } : { status: JOB_STATUS.ACTIVE };
  const roleMatch = role ? buildJobSearch({ keywords: [role] }) : { status: JOB_STATUS.ACTIVE };
  const [relatedRoles, relatedCities] = await Promise.all([topValues(cityMatch, 'title', 12), topValues(roleMatch, 'locations.city', 12)]);

  const what = role ? `${role} jobs` : 'Jobs';
  const where = city ? ` in ${city}` : '';
  const n = result.total;
  return {
    role,
    city,
    path: landingPath(role, city),
    title: `${what}${where}${n ? ` - ${n} ${role ? '' : 'latest '}vacancies` : ''}`.replace(/\s+/g, ' '),
    heading: `${what}${where}`,
    description: n
      ? `Apply to ${n} ${role ? `${role} ` : ''}job${n === 1 ? '' : 's'}${where} on Freejobwala. Verified employers, salary details, walk-ins and fresher jobs. Updated daily.`
      : `${what}${where} on Freejobwala. Create a free job alert to hear first when new openings are posted.`,
    noindex: n === 0,
    jobs: result.items,
    total: n,
    page: result.page,
    limit: result.limit,
    search: { keywords: role ? [role] : [], location: city ? [city] : [] },
    relatedRoles: relatedRoles.filter((r) => r.name.toLowerCase() !== role.toLowerCase()).map((r) => ({ ...r, path: landingPath(r.name, city) })),
    relatedCities: relatedCities.filter((c) => c.name.toLowerCase() !== city.toLowerCase()).map((c) => ({ ...c, path: landingPath(role, c.name) })),
  };
}

/** Landing URLs worth listing in the sitemap: every city, title and title+city that has live jobs. */
export async function landingSitemapPaths(max = 5000) {
  const active = { status: JOB_STATUS.ACTIVE };
  const [cities, titles, combos] = await Promise.all([
    topValues(active, 'locations.city', 500),
    topValues(active, 'title', 1000),
    Job.aggregate([
      { $match: active },
      { $unwind: '$locations' },
      { $group: { _id: { t: '$title', c: '$locations.city' }, n: { $sum: 1 } } },
      { $match: { '_id.t': { $nin: [null, ''] }, '_id.c': { $nin: [null, ''] } } },
      { $sort: { n: -1 } },
      { $limit: max },
    ]),
  ]);
  const paths = new Set([...cities.map((c) => landingPath('', c.name)), ...titles.map((t) => landingPath(t.name, '')), ...combos.map((r) => landingPath(r._id.t, r._id.c))]);
  return [...paths].slice(0, max);
}
