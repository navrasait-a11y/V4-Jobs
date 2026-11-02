import { escapeRegex, looseRegex, toArray } from '../../shared/utils/helpers.js';
import { daysAgo } from '../../shared/utils/timespan.js';

const ci = (v) => new RegExp(`^${escapeRegex(String(v).trim())}$`, 'i');
const word = (v) => new RegExp(`(^|[^a-z0-9])${escapeRegex(String(v).trim())}`, 'i');
const KEYWORD_FIELDS = ['title', 'designation', 'keySkills', 'roles', 'orgSnapshot.name'];

/**
 * Translates public job-search filters (Naukri-style side filters, "Other Forms" Excel) into a Mongo query.
 * All values are already validated by Joi. `q.nearCities` / `q.organizationIn` are resolved by the
 * service before this runs (distance radius, company size).
 */
export function buildJobSearch(q) {
  const filter = { status: 'active' };
  const and = [];

  // Keywords: chips are OR-ed through the text index; starred (or "all mandatory") ones must each match.
  const keywords = toArray(q.keywords).map((k) => k.trim()).filter(Boolean).slice(0, 20);
  const text = [q.q, ...keywords].filter(Boolean).join(' ');
  if (text) filter.$text = { $search: text.slice(0, 500) };
  const mandatory = (q.allMandatory ? keywords : toArray(q.mandatory)).map((k) => k.trim()).filter(Boolean).slice(0, 20);
  for (const k of mandatory) and.push({ $or: KEYWORD_FIELDS.map((f) => ({ [f]: word(k) })) });

  if (q.kind && q.kind !== 'any') filter.kind = q.kind;

  const cities = (q.nearCities || toArray(q.location || q.locations)).slice(0, 200);
  if (cities.length) {
    const re = cities.map(ci);
    and.push({
      $or: [
        { 'locations.city': { $in: re } },
        { 'locations.district': { $in: re } },
        { 'locations.state': { $in: re } },
        ...(q.includeRemote ? [{ isRemote: true }] : []),
      ],
    });
  }

  if (q.remoteOnly) and.push({ $or: [{ isRemote: true }, { jobModes: /remote|work from home/i }] });
  if (q.experience !== undefined) {
    and.push({ 'experience.min': { $lte: q.experience } });
    and.push({ $or: [{ 'experience.max': { $gte: q.experience } }, { 'experience.max': null }] });
  }
  // Min / max experience: the job's range overlaps the searched range.
  if (q.experienceMax !== undefined) and.push({ 'experience.min': { $lte: q.experienceMax } });
  if (q.experienceMin !== undefined) and.push({ $or: [{ 'experience.max': { $gte: q.experienceMin } }, { 'experience.max': null }] });
  if (q.salaryMin !== undefined) and.push({ $or: [{ 'salary.max': { $gte: q.salaryMin } }, { 'salary.min': { $gte: q.salaryMin } }] });
  if (q.salaryMax !== undefined) and.push({ 'salary.min': { $lte: q.salaryMax } });
  if (q.stipendMin !== undefined) and.push({ 'stipend.max': { $gte: q.stipendMin } });
  if (q.stipendMax !== undefined) and.push({ 'stipend.min': { $lte: q.stipendMax } });
  if (q.durationMax !== undefined) and.push({ 'duration.value': { $lte: q.durationMax } });
  const stipend = toArray(q.stipend).map((x) => x.toLowerCase());
  if (stipend.length === 1) filter['stipend.paid'] = stipend[0] === 'unpaid' ? false : { $ne: false };

  const inList = (field, value) => {
    const list = toArray(value);
    if (list.length) filter[field] = { $in: list };
  };
  inList('jobModes', q.workMode);
  inList('departments', q.department);
  inList('functions', q.function);
  inList('subIndustries', q.subIndustry);
  inList('roles', q.role);
  inList('industries', q.industry);
  inList('employmentTypes', q.employmentType);
  inList('education.levels', q.education);
  inList('education.degrees', q.degree);
  inList('education.specialisations', q.specialisation);
  inList('keySkills', q.skills);
  inList('shifts', q.shift);
  inList('labels', q.label);
  inList('experienceLevels', q.experienceLevel);
  const joining = toArray(q.joiningPeriod);
  if (joining.length) and.push({ $or: [{ noticePeriods: { $in: joining } }, { noticePeriod: { $in: joining } }] });
  if (q.category) filter.category = q.category;
  const companyTypes = toArray(q.companyType);
  if (companyTypes.length) filter['orgSnapshot.employerType'] = { $in: companyTypes.map(looseRegex) };
  const postedBy = toArray(q.postedBy);
  if (postedBy.length === 1) filter.organizationType = postedBy[0]; // company | consultancy
  const top = toArray(q.topCompany);
  if (top.length) filter['orgSnapshot.name'] = { $in: top.map(word) };
  if (q.organization) filter.organization = q.organization;
  else if (q.organizationIn) filter.organization = { $in: q.organizationIn };
  if (q.topCompanies) filter.labels = { $in: ['premium', 'featured'] };
  if (q.freshness) filter.publishedAt = { $gte: daysAgo(q.freshness) };
  if (q.verifiedOnly) filter['orgSnapshot.isVerified'] = true;
  if (q.excludeOrganizations?.length) {
    const excluded = q.excludeOrganizations.map(String);
    if (!filter.organization) filter.organization = { $nin: q.excludeOrganizations };
    else if (filter.organization.$in) filter.organization.$in = filter.organization.$in.filter((id) => !excluded.includes(String(id)));
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
    case 'salary_asc':
      return { 'salary.min': 1, _id: -1 };
    case 'relevance':
    default:
      return hasText ? { score: { $meta: 'textScore' }, isFeatured: -1, refreshedAt: -1 } : { isFeatured: -1, refreshedAt: -1, publishedAt: -1, _id: -1 };
  }
}

export const LIST_FIELDS =
  'uid kind slug title designation organization organizationType orgSnapshot locations isRemote experience salary stipend duration jobModes employmentTypes keySkills labels isFeatured publishedAt refreshedAt deadlineAt openings consultancyClient.name consultancyClient.hideName stats.applications';
