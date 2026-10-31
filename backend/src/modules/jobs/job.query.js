import { escapeRegex, toArray } from '../../shared/utils/helpers.js';
import { daysAgo } from '../../shared/utils/timespan.js';

/**
 * Translates public job-search filters (Naukri-style side filters) into a Mongo query.
 * All values are already validated by Joi.
 */
export function buildJobSearch(q) {
  const filter = { status: 'active' };
  const and = [];

  if (q.q) filter.$text = { $search: q.q.slice(0, 200) };
  if (q.kind && q.kind !== 'any') filter.kind = q.kind;

  const cities = toArray(q.location || q.locations).slice(0, 10);
  if (cities.length) {
    and.push({
      $or: [
        { 'locations.city': { $in: cities.map((c) => new RegExp(`^${escapeRegex(c.trim())}$`, 'i')) } },
        { 'locations.state': { $in: cities.map((c) => new RegExp(`^${escapeRegex(c.trim())}$`, 'i')) } },
        ...(q.includeRemote ? [{ isRemote: true }] : []),
      ],
    });
  }

  if (q.remoteOnly) and.push({ $or: [{ isRemote: true }, { jobModes: /remote|work from home/i }] });
  if (q.experience !== undefined) {
    and.push({ 'experience.min': { $lte: q.experience } });
    and.push({ $or: [{ 'experience.max': { $gte: q.experience } }, { 'experience.max': null }] });
  }
  if (q.salaryMin !== undefined) and.push({ $or: [{ 'salary.max': { $gte: q.salaryMin } }, { 'salary.min': { $gte: q.salaryMin } }] });
  if (q.salaryMax !== undefined) and.push({ 'salary.min': { $lte: q.salaryMax } });
  if (q.stipendMin !== undefined) and.push({ 'stipend.max': { $gte: q.stipendMin } });
  if (q.durationMax !== undefined) and.push({ 'duration.value': { $lte: q.durationMax } });

  const inList = (field, value) => {
    const list = toArray(value);
    if (list.length) filter[field] = { $in: list };
  };
  inList('jobModes', q.workMode);
  inList('departments', q.department);
  inList('roles', q.role);
  inList('industries', q.industry);
  inList('employmentTypes', q.employmentType);
  inList('education.levels', q.education);
  inList('keySkills', q.skills);
  inList('shifts', q.shift);
  inList('labels', q.label);
  if (q.category) filter.category = q.category;
  if (q.companyType) filter['orgSnapshot.employerType'] = q.companyType;
  if (q.postedBy) filter.organizationType = q.postedBy; // company | consultancy
  if (q.organization) filter.organization = q.organization;
  if (q.topCompanies) filter.labels = { $in: ['premium', 'featured'] };
  if (q.freshness) filter.publishedAt = { $gte: daysAgo(q.freshness) };
  if (q.verifiedOnly) filter['orgSnapshot.isVerified'] = true;
  if (q.excludeOrganizations?.length) {
    const excluded = q.excludeOrganizations.map(String);
    if (!filter.organization) filter.organization = { $nin: q.excludeOrganizations };
    else if (excluded.includes(String(filter.organization))) filter._id = null; // blocked employer -> no results
  }

  if (and.length) filter.$and = and;
  return filter;
}

export function jobSort(sort, hasText) {
  switch (sort) {
    case 'date':
      return { publishedAt: -1, _id: -1 };
    case 'salary':
      return { 'salary.max': -1, _id: -1 };
    case 'relevance':
    default:
      return hasText ? { score: { $meta: 'textScore' }, isFeatured: -1, refreshedAt: -1 } : { isFeatured: -1, refreshedAt: -1, publishedAt: -1, _id: -1 };
  }
}

export const LIST_FIELDS =
  'uid kind slug title designation organization organizationType orgSnapshot locations isRemote experience salary stipend duration jobModes employmentTypes keySkills labels isFeatured publishedAt refreshedAt deadlineAt openings consultancyClient.name consultancyClient.hideName stats.applications';
