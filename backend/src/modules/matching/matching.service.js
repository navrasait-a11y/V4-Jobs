import { getSetting } from '../settings/settings.service.js';

/**
 * Explainable job <-> candidate relevance scoring (0-100) used for:
 *  - "Recommended jobs for you"
 *  - Application matchScore & "AI relevance" sort in ATS / resume search
 * Weights are configurable by admins (setting ai.matchWeights) - "Configure AI systems".
 */

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();
const set = (arr) => new Set((arr || []).map(norm).filter(Boolean));

function overlap(a, b) {
  const A = set(a);
  const B = set(b);
  if (!A.size || !B.size) return null;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit += 1;
  return hit / Math.min(A.size, B.size);
}

function locationScore(candidate, job) {
  if (job.isRemote || (job.jobModes || []).some((m) => /remote|home/i.test(m))) return 1;
  const jobCities = set((job.locations || []).map((l) => l.city));
  if (!jobCities.size) return null;
  const prefs = (candidate.preferences?.locations || []).map((l) => norm(l.city));
  if (candidate.currentLocation?.city) prefs.push(norm(candidate.currentLocation.city));
  if (prefs.some((c) => jobCities.has(c))) return 1;
  if (candidate.preferences?.anywhereInIndia || candidate.preferences?.willingToRelocate) return 0.6;
  const jobStates = set((job.locations || []).map((l) => l.state));
  if (candidate.currentLocation?.state && jobStates.has(norm(candidate.currentLocation.state))) return 0.4;
  return 0;
}

function experienceScore(candidate, job) {
  const years = (candidate.totalExperienceMonths || 0) / 12;
  const min = job.experience?.min ?? 0;
  const max = job.experience?.max ?? min + 30;
  if (years >= min && years <= max) return 1;
  const gap = years < min ? min - years : years - max;
  return Math.max(0, 1 - gap / 3);
}

function salaryScore(candidate, job) {
  const expected = candidate.preferences?.expectedSalary;
  const maxSal = job.salary?.max || job.salary?.min;
  if (!expected || !maxSal) return null;
  const monthlyMax = job.salary?.period === 'yearly' ? maxSal / 12 : maxSal;
  if (monthlyMax >= expected) return 1;
  return Math.max(0, monthlyMax / expected);
}

function educationScore(candidate, job) {
  const needed = job.education?.levels || [];
  if (!needed.length) return null;
  const has = set((candidate.educations || []).map((e) => e.level).concat(candidate.highestEducationLevel || []));
  return needed.some((l) => has.has(norm(l))) ? 1 : 0;
}

export function scoreMatch(candidate, job, weights) {
  const parts = {
    skills: overlap(candidate.keySkills?.concat(candidate.itSkills || [], candidate.preferences?.skills || []), job.keySkills),
    role: overlap(
      (candidate.roles || []).concat(candidate.preferences?.roles || [], [candidate.currentJobTitle]),
      (job.roles || []).concat([job.title, job.designation]),
    ),
    location: locationScore(candidate, job),
    experience: experienceScore(candidate, job),
    salary: salaryScore(candidate, job),
    education: educationScore(candidate, job),
  };
  let total = 0;
  let weightSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (parts[k] === null || parts[k] === undefined) continue; // unknown signal -> excluded, not penalised
    total += parts[k] * w;
    weightSum += w;
  }
  const score = weightSum ? Math.round((total / weightSum) * 100) : 0;
  // Which of the job's key skills the candidate has, so the job page can say what to add.
  const own = set(candidate.keySkills?.concat(candidate.itSkills || [], candidate.preferences?.skills || []));
  const jobSkills = [...new Map((job.keySkills || []).filter(Boolean).map((s) => [norm(s), s])).values()];
  return {
    score,
    breakdown: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === null ? null : Math.round(v * 100)])),
    matchedSkills: jobSkills.filter((s) => own.has(norm(s))),
    missingSkills: jobSkills.filter((s) => !own.has(norm(s))).slice(0, 12),
  };
}

export async function getWeights() {
  return getSetting('ai.matchWeights', { skills: 0.35, role: 0.15, location: 0.15, experience: 0.15, salary: 0.1, education: 0.1 });
}

export async function score(candidate, job) {
  return scoreMatch(candidate, job, await getWeights());
}
