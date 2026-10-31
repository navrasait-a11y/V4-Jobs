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
  const u = { role: 'candidate', status: 'active', 'privacy.profileVisibility': { $ne: 'hidden' } };

  if (f.keywords?.length) {
    const terms = f.keywords.map((k) => `"${String(k).replace(/"/g, '')}"`);
    c.$text = { $search: f.keywordMode === 'any' ? f.keywords.join(' ') : terms.join(' ') };
  }
  if (f.excludeKeywords?.length) {
    const re = f.excludeKeywords.map(contains);
    and.push({ keySkills: { $nin: re } }, { currentJobTitle: { $nin: re } }, { resumeHeadline: { $nin: re } });
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
    const cities = f.locations.slice(0, 10).map(ci);
    const or = [{ 'currentLocation.city': { $in: cities } }, { 'currentLocation.district': { $in: cities } }];
    if (f.includeRelocate) or.push({ 'preferences.locations.city': { $in: cities } }, { 'preferences.willingToRelocate': true });
    if (!f.excludeAnywhere) or.push({ 'preferences.anywhereInIndia': true });
    and.push({ $or: or });
  }
  if (f.excludeAnywhere) c['preferences.anywhereInIndia'] = { $ne: true };

  const inCI = (field, list) => {
    if (list?.length) c[field] = { $in: list.map(ci) };
  };
  inCI('industries', f.industries);
  inCI('departments', f.departments);
  inCI('roles', f.roles);
  inCI('noticePeriod', f.noticePeriods);
  inCI('preferences.employmentTypes', f.employmentTypes);
  inCI('preferences.jobModes', f.jobModes);
  inCI('category', f.categories);
  if (f.jobTypes?.length) c['preferences.jobTypes'] = { $in: f.jobTypes };

  // Companies (current / previous / either)
  if (f.companies?.length) {
    const re = f.companies.map(contains);
    if (f.companyScope === 'current') c.currentEmployer = { $in: re };
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
  if (f.experienceLevels?.length) inCI('experienceLevel', f.experienceLevels);

  // User-level filters
  if (f.genders?.length) u.gender = { $in: f.genders.map(ci) };
  if (f.verifiedMobile) u.mobileVerifiedAt = { $ne: null };
  if (f.verifiedEmail) u.emailVerifiedAt = { $ne: null };
  if (f.activeIn && ACTIVE_IN_DAYS[f.activeIn]) u.lastActiveAt = { $gte: daysAgo(ACTIVE_IN_DAYS[f.activeIn]) };
  if (f.show === 'new') u.createdAt = { $gte: daysAgo(15) };
  if (f.show === 'modified') c.updatedAt = { $gte: daysAgo(15) };

  if (and.length) c.$and = and;
  return { candidateFilter: c, userFilter: u };
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
