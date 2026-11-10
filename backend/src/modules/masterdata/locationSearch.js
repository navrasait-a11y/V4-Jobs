import { Location } from './masterdata.models.js';
import Job from '../jobs/job.model.js';
import { escapeRegex } from '../../shared/utils/helpers.js';
import { editDistance } from '../jobs/job.spell.js';

/** Old and common names people still type (Naukri / Google accept these too). */
const ALIASES = {
  bangalore: 'bengaluru',
  bengalore: 'bengaluru',
  bombay: 'mumbai',
  gurgaon: 'gurugram',
  calcutta: 'kolkata',
  madras: 'chennai',
  poona: 'pune',
  baroda: 'vadodara',
  cochin: 'kochi',
  trivandrum: 'thiruvananthapuram',
  vizag: 'visakhapatnam',
  mysore: 'mysuru',
  mangalore: 'mangaluru',
  pondicherry: 'puducherry',
  benares: 'varanasi',
  banaras: 'varanasi',
  allahabad: 'prayagraj',
  ncr: 'delhi',
  'new bombay': 'navi mumbai',
  'greater noida': 'greater noida',
};

const TTL = 10 * 60 * 1000;
let cityCache = { at: 0, cities: [] };
let jobCounts = { at: 0, map: new Map() };

async function allCities() {
  if (Date.now() - cityCache.at < TTL && cityCache.cities.length) return cityCache.cities;
  cityCache = { at: Date.now(), cities: (await Location.distinct('city', { isActive: true })).filter(Boolean) };
  return cityCache.cities;
}

/** Live jobs per city (lower-case), refreshed every 10 minutes. */
export async function activeJobsByCity() {
  if (Date.now() - jobCounts.at < TTL && jobCounts.map.size) return jobCounts.map;
  const rows = await Job.aggregate([{ $match: { status: 'active' } }, { $unwind: '$locations' }, { $group: { _id: { $toLower: '$locations.city' }, n: { $sum: 1 } } }]);
  jobCounts = { at: Date.now(), map: new Map(rows.filter((r) => r._id).map((r) => [r._id, r.n])) };
  return jobCounts.map;
}

/** Expands an alias prefix: "banga" -> also search "bengaluru". */
function expand(q) {
  const out = new Set([q]);
  for (const [alias, real] of Object.entries(ALIASES)) if (alias.startsWith(q) || q.startsWith(alias)) out.add(real);
  return [...out];
}

const allowedEdits = (len) => (len < 4 ? 0 : len <= 6 ? 1 : 2);

/**
 * Location suggestions, ranked like Naukri: the city itself first ("Jaipur"), then its localities
 * ("Jagatpura, Jaipur"), then districts / states, popular places before others.
 * Falls back to the closest city name when nothing matches a typo ("jaipru" -> Jaipur).
 * Returns { items, corrected } where corrected is the city used for a typo.
 */
export async function smartLocations({ q = '', limit = 15, withJobs = false, popular, state, city } = {}) {
  const base = { isActive: true };
  if (state) base.state = new RegExp(`^${escapeRegex(state)}$`, 'i');
  if (city) base.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
  const term = String(q).trim().toLowerCase().slice(0, 60);
  let corrected = null;

  let rows;
  if (!term) {
    rows = await Location.find({ ...base, ...(popular ? { isPopular: true } : {}) })
      .select('-searchKey -__v')
      .sort({ isPopular: -1, city: 1 })
      .limit(Math.min(limit, 100))
      .lean();
  } else {
    const terms = expand(term);
    const re = new RegExp(`(^|, )(${terms.map(escapeRegex).join('|')})`);
    rows = await Location.find({ ...base, searchKey: re }).select('-searchKey -__v').limit(200).lean();
    if (!rows.length && allowedEdits(term.length)) {
      const max = allowedEdits(term.length);
      let best = null;
      let bestD = max + 1;
      for (const c of await allCities()) {
        const name = c.toLowerCase().slice(0, Math.max(term.length, c.length));
        const d = Math.min(editDistance(term, name, max), editDistance(term, name.slice(0, term.length), max));
        if (d < bestD) {
          best = c;
          bestD = d;
        }
      }
      if (best) {
        corrected = best;
        rows = await Location.find({ ...base, city: best }).select('-searchKey -__v').limit(200).lean();
      }
    }
    const starts = (v) => Boolean(v) && terms.some((t) => v.toLowerCase().startsWith(t));
    const rank = (l) => {
      if (!l.locality && !l.district && starts(l.city)) return 0; // the city itself
      if (starts(l.city)) return 1; // places in that city
      if (starts(l.locality) || starts(l.district)) return 2;
      if (starts(l.state)) return 3;
      return 4;
    };
    rows.sort((a, b) => rank(a) - rank(b) || Number(b.isPopular) - Number(a.isPopular) || (a.locality ? 1 : 0) - (b.locality ? 1 : 0) || a.displayName.localeCompare(b.displayName));
    rows = rows.slice(0, Math.min(limit, 100));
  }

  if (withJobs) {
    const counts = await activeJobsByCity();
    rows = rows.map((l) => ({ ...l, activeJobs: counts.get(String(l.city || '').toLowerCase()) || 0 }));
  }
  return { items: rows, corrected };
}

/**
 * Nearest known city to a point ("Use my current location"). Coordinates are only used for this
 * lookup, never stored. Returns { place, distanceKm } or null when nothing is within 150 km.
 */
export async function nearestCity(lat, lng) {
  const box = 1.5; // ~165 km
  const rows = await Location.find({ isActive: true, locality: { $in: [null, ''] }, district: { $in: [null, ''] }, 'geo.lat': { $gte: lat - box, $lte: lat + box }, 'geo.lng': { $gte: lng - box, $lte: lng + box } })
    .select('-searchKey -__v')
    .limit(500)
    .lean();
  const rad = (d) => (d * Math.PI) / 180;
  const km = (a) => {
    const dLat = rad(a.geo.lat - lat);
    const dLng = rad(a.geo.lng - lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(a.geo.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  };
  let best = null;
  for (const r of rows) {
    if (!Number.isFinite(r.geo?.lat) || !Number.isFinite(r.geo?.lng)) continue;
    const d = km(r);
    if (d <= 150 && (!best || d < best.distanceKm)) best = { place: r, distanceKm: Math.round(d) };
  }
  return best;
}
