/**
 * Profile Completion Matrix - weighted sections (sum = 100). Returned to clients so they can
 * render a checklist of what is missing.
 */
const SECTIONS = [
  { key: 'photo', label: 'Profile photo', weight: 5, done: (u) => Boolean(u.avatar?.url || u.avatar?.key) },
  { key: 'basic', label: 'Basic details', weight: 10, done: (u, c) => Boolean(u.fullName && u.gender && c.experienceLevel) },
  { key: 'contact', label: 'Verified e-mail & mobile', weight: 10, done: (u) => Boolean(u.emailVerifiedAt && u.mobileVerifiedAt) },
  { key: 'personal', label: 'Personal details', weight: 10, done: (u, c) => Boolean(c.dob && c.currentLocation?.city) },
  { key: 'resume', label: 'Resume', weight: 15, done: (u, c) => Boolean(c.resume?.key) },
  { key: 'headline', label: 'Resume headline / summary', weight: 5, done: (u, c) => Boolean(c.resumeHeadline || c.profileSummary) },
  { key: 'skills', label: 'Key skills', weight: 10, done: (u, c) => (c.keySkills?.length || 0) >= 3 },
  {
    key: 'employment',
    label: 'Employment history',
    weight: 10,
    done: (u, c) => c.experienceLevel?.toLowerCase().includes('fresher') || (c.employments?.length || 0) > 0,
  },
  { key: 'education', label: 'Education', weight: 10, done: (u, c) => (c.educations?.length || 0) > 0 },
  {
    key: 'preferences',
    label: 'Job preferences',
    weight: 10,
    done: (u, c) => Boolean(c.preferences?.locations?.length && (c.preferences?.roles?.length || c.preferences?.skills?.length)),
  },
  { key: 'languages', label: 'Languages', weight: 5, done: (u, c) => (c.languages?.length || 0) > 0 },
];

export function computeCompletion(user, candidate) {
  let score = 0;
  const sections = SECTIONS.map((s) => {
    const done = Boolean(s.done(user || {}, candidate || {}));
    if (done) score += s.weight;
    return { key: s.key, label: s.label, weight: s.weight, done };
  });
  return { score, sections, missing: sections.filter((s) => !s.done).map((s) => s.key) };
}
