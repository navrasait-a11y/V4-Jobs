import { escapeRegex } from '../../shared/utils/helpers.js';
import { daysAgo } from '../../shared/utils/timespan.js';
import { ACTIVE_IN_DAYS } from '../../shared/constants/index.js';

const ci = (v) => new RegExp(`^${escapeRegex(String(v).trim())}$`, 'i');
const contains = (v) => new RegExp(escapeRegex(String(v).trim()), 'i');

/**
 * Builds the two-stage query used by employer resume search:
 *  - candidateFilter: matches the Candidate collection (skills, experience, salary, location ...)
 *  - userFilter: matches the User collection (gender, verification, activity, registration date)
 * Keyword logic: `keywords` (all/any) + `excludeKeywords`; scope over skills / titles / companies / resume text.
 */
export function buildTalentQuery(f) {
  const c = {};
  const and = [];
  const post = []; // conditions on user fields, applied after the users $lookup as `u.*`
  const u = { role: 'candidate', status: 'active', 'privacy.profileVisibility': { $ne: 'hidden' } };

  if (f.keywords?.length) {
    const terms = f.keywords.map((k) => `"${String(k).replace(/"/g, '')}"`);
    c.$text = { $search: f.keywordMode === 'any' ? f.keywords.join(' ') : terms.join(' ') };
  }
  if (f.excludeKeywords?.length) {
    const re = f.excludeKeywords.map(contains);
    and.push({ keySkills: { $nin: re } }, { currentJobTitle: { $nin: re } }, { resumeHeadline: { $nin: re } }, { currentEmployer: { $nin: re } });
  }
  // Starred and "must have" keywords: each one has to appear in skills, titles, roles, companies or headline.
  const mustHave = [...(f.mandatoryKeywords || []), ...(f.mustHaveKeywords || [])];
  for (const k of new Set(mustHave)) {
    const re = contains(k);
    and.push({
      $or: [
        { keySkills: re },
        { itSkills: re },
        { currentJobTitle: re },
        { roles: re },
        { currentEmployer: re },
        { 'employments.jobTitle': re },
        { 'employments.employerName': re },
        { resumeHeadline: re },
      ],
    });
  }
  if (f.skills?.length) c.keySkills = f.skillMode === 'all' ? { $all: f.skills.map(ci) } : { $in: f.skills.map(ci) };

  // Experience (years)
  if (f.experienceMin !== undefined || f.experienceMax !== undefined) {
    c.totalExperienceMonths = {};
    if (f.experienceMin !== undefined) c.totalExperienceMonths.$gte = f.experienceMin * 12;
    if (f.experienceMax !== undefined) c.totalExperienceMonths.$lte = f.experienceMax * 12 + 11;
  }

  // Monthly salary
  if (f.salaryMin !== undefined || f.salaryMax !== undefined) {
    const range = {};
    if (f.salaryMin !== undefined) range.$gte = f.salaryMin;
    if (f.salaryMax !== undefined) range.$lte = f.salaryMax;
    and.push(f.includeNoSalary ? { $or: [{ currentSalary: range }, { currentSalary: null }] } : { currentSalary: range });
  }

  // Locations (max 10) + relocation flags
  if (f.locations?.length) {
    const cities = (f.nearCities || f.locations).slice(0, 200).map(ci);
    const or = [{ 'currentLocation.city': { $in: cities } }, { 'currentLocation.district': { $in: cities } }];
    if (f.includeRelocate) or.push({ 'preferences.locations.city': { $in: cities } }, { 'preferences.willingToRelocate': true });
    if (!f.excludeAnywhere) or.push({ 'preferences.anywhereInIndia': true });
    and.push({ $or: or });
  }
  if (f.excludeAnywhere) c['preferences.anywhereInIndia'] = { $ne: true };
  // "Include / Exclude candidates who have mentioned" (Ready To Relocate options)
  if (f.relocateInclude?.length) and.push({ 'preferences.relocation': { $in: f.relocateInclude.map(ci) } });
  if (f.relocateExclude?.length) and.push({ 'preferences.relocation': { $nin: f.relocateExclude.map(ci) } });

  const inCI = (field, list) => {
    if (list?.length) c[field] = { $in: list.map(ci) };
  };
  inCI('industries', f.industries);
  inCI('subIndustries', f.subIndustries);
  inCI('departments', f.departments);
  inCI('functions', f.functions);
  inCI('roles', f.roles);
  inCI('noticePeriod', f.noticePeriods);
  inCI('preferences.shifts', f.shifts);
  inCI('assets', f.assets);
  inCI('documents', f.documents);
  inCI('certifications', f.certifications);
  inCI('maritalStatus', f.maritalStatuses);
  inCI('englishFluency', f.englishFluency);
  inCI('languages', f.languages);
  inCI('disability.status', f.disabilityStatuses);
  inCI('disability.type', f.disabilityTypes);
  inCI('military.status', f.militaryStatuses);
  inCI('military.serviceType', f.serviceTypes);
  inCI('preferences.employmentTypes', f.employmentTypes);
  inCI('preferences.jobModes', f.jobModes);
  inCI('category', f.categories);
  if (f.jobTypes?.length) c['preferences.jobTypes'] = { $in: f.jobTypes };

  // Companies (current / previous / either)
  if (f.companies?.length) {
    const re = f.companies.map(contains);
    if (f.companyScope === 'exclude') and.push({ currentEmployer: { $nin: re } }, { 'employments.employerName': { $nin: re } });
    else if (f.companyScope === 'current') c.currentEmployer = { $in: re };
    else if (f.companyScope === 'previous') and.push({ employments: { $elemMatch: { employerName: { $in: re }, isCurrent: { $ne: true } } } });
    else c['employments.employerName'] = { $in: re };
  }
  if (f.companyTypes?.length) c['employments.employerType'] = { $in: f.companyTypes.map(ci) };

  // Designations (current / previous / either)
  if (f.designations?.length) {
    const re = f.designations.map(contains);
    if (f.designationScope === 'current') c.currentJobTitle = { $in: re };
    else if (f.designationScope === 'previous') and.push({ employments: { $elemMatch: { jobTitle: { $in: re }, isCurrent: { $ne: true } } } });
    else and.push({ $or: [{ currentJobTitle: { $in: re } }, { 'employments.jobTitle': { $in: re } }] });
  }

  // Education
  const edu = {};
  if (f.educationLevels?.length) edu.level = { $in: f.educationLevels.map(ci) };
  if (f.degrees?.length) edu.degree = { $in: f.degrees.map(ci) };
  if (f.specialisations?.length) edu.specialisation = { $in: f.specialisations.map(ci) };
  if (f.educationTypes?.length) edu.educationType = { $in: f.educationTypes.map(ci) };
  if (f.educationStatuses?.length) edu.status = { $in: f.educationStatuses.map(ci) };
  if (f.institutions?.length) edu.institution = { $in: f.institutions.map(contains) };
  if (f.passingYearFrom || f.passingYearTo) {
    edu.endDate = {};
    if (f.passingYearFrom) edu.endDate.$gte = new Date(`${f.passingYearFrom}-01-01`);
    if (f.passingYearTo) edu.endDate.$lte = new Date(`${f.passingYearTo}-12-31`);
  }
  if (Object.keys(edu).length) c.educations = { $elemMatch: edu };

  // Diversity & additional
  if (f.disabledOnly) c['disability.status'] = { $in: [/have disability/i, /yes/i] };
  if (f.militaryOnly) c['military.status'] = { $in: [/currently serving/i, /previously served/i] };
  if (f.careerBreak) c.presentJobStatus = /not working/i;
  if (f.ageMin || f.ageMax) {
    c.dob = {};
    if (f.ageMax) c.dob.$gte = new Date(new Date().setFullYear(new Date().getFullYear() - f.ageMax - 1));
    if (f.ageMin) c.dob.$lte = new Date(new Date().setFullYear(new Date().getFullYear() - f.ageMin));
  }
  if (f.withResume) c['resume.key'] = { $exists: true };

  // Diversity hiring: each picked option widens the match (OR).
  const diversity = new Set((f.diversity || []).map((d) => d.toLowerCase()));
  const returning = { presentJobStatus: /not working/i };
  const divOr = [];
  if (diversity.has('man')) divOr.push({ 'u.gender': /^male$/i });
  if (diversity.has('woman')) divOr.push({ 'u.gender': /^female$/i });
  if (diversity.has('man returning to work')) divOr.push({ 'u.gender': /^male$/i, ...returning });
  if (diversity.has('woman returning to work')) divOr.push({ 'u.gender': /^female$/i, ...returning });
  if (diversity.has('ex-army personal')) divOr.push({ 'military.status': /previously served/i });
  if (diversity.has('differently-abled')) divOr.push({ 'disability.status': /have disability/i });
  if (divOr.length) post.push({ $or: divOr });
  if (f.experienceLevels?.length) inCI('experienceLevel', f.experienceLevels);

  // User-level filters
  if (f.genders?.length) u.gender = { $in: f.genders.map(ci) };
  if (f.verifiedMobile) u.mobileVerifiedAt = { $ne: null };
  if (f.verifiedEmail) u.emailVerifiedAt = { $ne: null };
  if (f.activeIn && ACTIVE_IN_DAYS[f.activeIn]) u.lastActiveAt = { $gte: daysAgo(ACTIVE_IN_DAYS[f.activeIn]) };
  if (f.lastActive === '365+') u.lastActiveAt = { $lt: daysAgo(365) };
  else if (f.lastActive) u.lastActiveAt = { $gte: daysAgo(Number(f.lastActive)) };
  if (f.show === 'new') u.createdAt = { $gte: daysAgo(15) };
  if (f.show === 'modified') c.updatedAt = { $gte: daysAgo(15) };

  // "Candidates with"
  const has = new Set(f.candidatesWith || []);
  if (has.has('verified_mobile') || has.has('whatsapp')) u.mobileVerifiedAt = { $ne: null };
  if (has.has('whatsapp')) u['notificationPrefs.whatsapp'] = { $ne: false };
  if (has.has('verified_email')) u.emailVerifiedAt = { $ne: null };
  if (has.has('resume')) c['resume.key'] = { $exists: true };

  // "Show candidates that are" (OR between the picked types)
  const types = new Set(f.candidateTypes || []);
  const typeOr = [];
  if (types.has('new')) typeOr.push({ 'u.createdAt': { $gte: daysAgo(15) } });
  if (types.has('modified')) typeOr.push({ updatedAt: { $gte: daysAgo(15) } });
  if (types.has('active')) typeOr.push({ journeyStatus: /actively/i }, { 'u.lastActiveAt': { $gte: daysAgo(7) }, 'stats.applications': { $gt: 0 } });
  if (types.has('trending')) typeOr.push({ 'stats.profileViews': { $gte: 25 } }, { 'u.labels': 'trending' });
  if (types.has('featured')) typeOr.push({ 'u.labels': 'featured' });
  if (types.has('premium')) typeOr.push({ boostUntil: { $gt: new Date() } }, { 'u.labels': 'premium' });
  if (typeOr.length) post.push({ $or: typeOr });

  if (and.length) c.$and = and;
  return { candidateFilter: c, userFilter: u, postFilter: post.length ? { $and: post } : null };
}

export function talentSort(sort, hasText) {
  switch (sort) {
    case 'freshness':
      return { updatedAt: -1 };
    case 'last_active':
      return { updatedAt: -1 }; // refined in memory with user.lastActiveAt
    case 'relevance':
    case 'ai':
    default:
      return hasText ? { score: { $meta: 'textScore' }, boostUntil: -1, profileCompletion: -1 } : { boostUntil: -1, profileCompletion: -1, updatedAt: -1 };
  }
}
