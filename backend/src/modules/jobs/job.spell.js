import { Lookup } from '../masterdata/masterdata.models.js';
import Organization from '../employers/organization.model.js';

/**
 * Spelling help for job search ("devloper" -> "developer"). The vocabulary is every job title, role,
 * skill and company word on the platform, cached for 10 minutes. Pure JS, so it works on any MongoDB.
 */
const TTL = 10 * 60 * 1000;
let cache = { at: 0, words: new Map(), phrases: [] };

const tokenize = (s) =>
  String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1);

async function vocabulary() {
  if (Date.now() - cache.at < TTL && cache.phrases.length) return cache;
  const [lookups, orgs] = await Promise.all([
    Lookup.find({ type: { $in: ['job_title', 'key_skill', 'it_skill', 'job_role'] }, isActive: true })
      .select('name')
      .limit(50000)
      .lean(),
    Organization.find({ status: 'active' }).select('name').limit(20000).lean(),
  ]);
  const words = new Map();
  const phrases = [];
  for (const { name } of [...lookups, ...orgs]) {
    if (!name) continue;
    phrases.push(name);
    for (const w of tokenize(name)) words.set(w, (words.get(w) || 0) + 1);
  }
  cache = { at: Date.now(), words, phrases };
  return cache;
}

/** Damerau-Levenshtein distance with an early exit once it passes `max`. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    for (let j = 0; j <= b.length; j += 1) prev2[j] = prev[j];
    prev = cur;
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

const allowed = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/**
 * Corrects each unknown word of a search to the closest known word (ties go to the more common one).
 * Returns null when nothing changes.
 */
export async function correctQuery(text, { allowPrefix = false } = {}) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 120) return null;
  const { words } = await vocabulary();
  if (!words.size) return null;
  let changed = false;
  const out = raw.split(/\s+/).map((orig) => {
    const w = orig.toLowerCase().replace(/[^a-z0-9+#.]/g, '');
    if (!w || words.has(w) || /\d/.test(w)) return orig;
    // While typing, a word that starts a known word ("nimb" -> "nimbus") is not a mistake.
    if (allowPrefix && [...words.keys()].some((k) => k.startsWith(w))) return orig;
    const max = allowed(w.length);
    if (!max) return orig;
    let best = null;
    let bestD = max + 1;
    let bestF = 0;
    for (const [cand, freq] of words) {
      if (Math.abs(cand.length - w.length) > max || cand[0] !== w[0]) continue;
      const d = editDistance(w, cand, max);
      if (d > max) continue;
      if (d < bestD || (d === bestD && freq > bestF)) {
        best = cand;
        bestD = d;
        bestF = freq;
      }
    }
    if (!best) return orig;
    changed = true;
    return best;
  });
  return changed ? out.join(' ') : null;
}

/** Company names for the search box autocomplete. */
export async function suggestCompanies(q, limit = 5) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const orgs = await Organization.find({ status: 'active', name: { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } })
    .select('name')
    .sort({ 'stats.activeJobs': -1 })
    .limit(limit)
    .lean();
  return [...new Set(orgs.map((o) => o.name))];
}

export function resetSpellCache() {
  cache = { at: 0, words: new Map(), phrases: [] };
}

/** True when every word of the term is a known title / role / skill / company word (safe to log). */
export async function isKnownTerm(text) {
  const words = tokenize(text);
  if (!words.length) return false;
  const { words: vocab } = await vocabulary();
  return words.every((w) => vocab.has(w));
}
