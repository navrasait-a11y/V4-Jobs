import Candidate from '../candidates/candidate.model.js';
import { activeJobsByCity } from '../masterdata/locationSearch.js';

/**
 * "For you" shortcuts in an empty search box for a signed-in job seeker: their current / preferred
 * titles, top skills and preferred cities. Anyone else gets empty lists.
 */
export async function forYou(user) {
  if (user?.role !== 'candidate') return { titles: [], skills: [], cities: [] };
  const p = await Candidate.findOne({ user: user._id }).select('employments roles keySkills preferences currentLocation').lean();
  if (!p) return { titles: [], skills: [], cities: [] };
  const current = (p.employments || []).find((e) => e.isCurrent) || (p.employments || [])[0];
  const uniq = (list, n) => [...new Map(list.filter(Boolean).map((v) => [String(v).toLowerCase(), v])).values()].slice(0, n);
  const counts = await activeJobsByCity();
  const cities = uniq([...(p.preferences?.locations || []).map((l) => l.city), p.currentLocation?.city], 4).map((c) => ({ city: c, activeJobs: counts.get(String(c).toLowerCase()) || 0 }));
  return {
    titles: uniq([current?.jobTitle, ...(p.preferences?.roles || []), ...(p.roles || [])], 4),
    skills: uniq([...(p.preferences?.skills || []), ...(p.keySkills || [])], 5),
    cities,
  };
}
