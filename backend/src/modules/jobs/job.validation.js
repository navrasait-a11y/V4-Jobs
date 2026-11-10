import Joi from 'joi';
import { objectId, place, shortText, stringList, email, mobile, otp, pagination, url } from '../../shared/validators/common.js';
import { PAGE_SIZES, JOB_STATUS, DISTANCE_KM, DATE_POSTED_DAYS, AGE_LIMITS, QUESTION_TYPES, LEGACY_QUESTION_TYPES, WEEKDAYS } from '../../shared/constants/index.js';

const s = shortText.allow('', null);

const time = Joi.string()
  .trim()
  .pattern(/^(0?[1-9]|1[0-2]):[0-5]\d ?(AM|PM)$/i)
  .message('Use a time like 09:30 AM')
  .allow('');
const day = Joi.string().valid(...WEEKDAYS, '');

/** Limits follow the "Other Forms" Excel (Post a Job / Post an Internship). */
export const jobFields = {
  kind: Joi.string().valid('job', 'internship'),
  title: shortText.min(2),
  designation: s,
  description: Joi.string().trim().max(30000).allow(''), // ~5000 words
  responsibilities: Joi.string().trim().max(20000).allow(''),
  keySkills: stringList(15),
  industries: stringList(5),
  subIndustries: stringList(20),
  departments: stringList(5),
  functions: stringList(20),
  roles: stringList(20),
  category: s,
  employmentTypes: stringList(12),
  jobModes: stringList(5),
  shifts: stringList(5),
  openings: Joi.number().integer().min(1).max(100000),
  experience: Joi.object({ min: Joi.number().min(0).max(50).default(0), max: Joi.number().min(Joi.ref('min')).max(60).allow(null) }),
  experienceLevels: stringList(5),
  salary: Joi.object({
    min: Joi.number().min(0),
    max: Joi.number().min(Joi.ref('min')),
    type: s,
    period: Joi.string().valid('monthly', 'yearly'),
    currency: Joi.string().length(3).uppercase(),
    hidden: Joi.boolean(),
  }),
  perks: stringList(10),
  internshipType: s,
  stipend: Joi.object({ paid: Joi.boolean(), min: Joi.number().min(0), max: Joi.number().min(Joi.ref('min')), type: s, hidden: Joi.boolean() }),
  duration: Joi.object({ value: Joi.number().integer().min(1).max(60), unit: Joi.string().valid('days', 'weeks', 'months'), noFixed: Joi.boolean() }),
  internshipStartDate: Joi.date(),
  education: Joi.object({
    levels: stringList(10),
    degrees: stringList(50),
    specialisations: stringList(50),
    institutions: stringList(50),
    types: stringList(5),
    statuses: stringList(5),
    mediums: stringList(50),
    marksType: s,
    marksValue: Joi.string().trim().max(20).allow(''),
  }),
  certifications: stringList(50),
  gender: Joi.string().valid('any', 'male', 'female', 'transgender', 'other'),
  genders: stringList(5),
  maritalStatuses: stringList(5),
  ageRange: Joi.object({
    min: Joi.number().integer().min(AGE_LIMITS.min).max(AGE_LIMITS.max),
    max: Joi.number().integer().min(Joi.ref('min')).max(AGE_LIMITS.max),
  }),
  englishFluency: stringList(5),
  languages: stringList(50),
  diversity: stringList(10),
  disabilityStatuses: stringList(5),
  disabilityTypes: stringList(30),
  assets: stringList(30),
  noticePeriod: s,
  noticePeriods: stringList(10),
  locations: Joi.array().items(place).max(4),
  distanceKm: Joi.number()
    .valid(...DISTANCE_KM)
    .allow(null),
  relocateOptions: stringList(6),
  address: Joi.string().trim().max(500).allow(''),
  isRemote: Joi.boolean(),
  consultancyClient: Joi.object({ name: s, hideName: Joi.boolean(), industry: s }),
  contact: Joi.object({
    name: s,
    email: email.allow(''),
    mobile: mobile.allow(''),
    showToCandidates: Joi.boolean(),
    timeFrom: time,
    timeTo: time,
    dayFrom: day,
    dayTo: day,
  }),
  interviewMode: s,
  walkIn: Joi.object({
    startDate: Joi.date().allow(null),
    endDate: Joi.date().min(Joi.ref('startDate')).allow(null),
    durationDays: Joi.number().integer().min(1).max(365),
    timing: Joi.string().trim().max(60).allow(''),
    contactName: s,
    contactMobile: mobile.allow(''),
    contactEmail: email.allow(''),
    venue: Joi.string().trim().max(500).allow(''),
    mapUrl: url.allow(''),
  }),
  responseAlerts: Joi.object({ daily: Joi.boolean(), everyResponse: Joi.boolean(), emails: Joi.array().items(email).max(10) }),
  questions: Joi.array()
    .items(
      Joi.object({
        question: Joi.string().trim().max(500).required(),
        type: Joi.string().valid(...QUESTION_TYPES, ...LEGACY_QUESTION_TYPES),
        options: stringList(10),
        required: Joi.boolean(),
      }),
    )
    .max(10),
  applyExternalUrl: url.allow(''),
  deadlineAt: Joi.date().greater('now'),
  expiresAt: Joi.date().greater('now'),
  googleJobsEnabled: Joi.boolean(),
};

export const createJob = {
  body: Joi.object({
    ...jobFields,
    title: shortText.min(2).required(),
    prefillFrom: objectId,
    publish: Joi.boolean().default(false),
    featured: Joi.boolean().default(false),
  }),
};

export const updateJob = { body: Joi.object(jobFields).min(1) };
export const publishJob = { body: Joi.object({ featured: Joi.boolean().default(false) }) };
export const jobAction = { params: Joi.object({ id: objectId.required(), action: Joi.string().valid('close', 'refresh', 'trash').required() }) };

export const employerJobsQuery = {
  query: Joi.object({
    ...pagination,
    limit: Joi.number()
      .valid(...PAGE_SIZES)
      .default(20),
    status: Joi.string().valid(...Object.values(JOB_STATUS).filter((x) => x !== 'trashed')),
    kind: Joi.string().valid('job', 'internship'),
    postedBy: Joi.alternatives(Joi.string().valid('me'), objectId),
    q: Joi.string().trim().max(100).allow(''),
    sort: Joi.string().valid('-createdAt', 'createdAt', 'title', '-title', '-publishedAt', '-stats.applications').default('-createdAt'),
  }),
};

const csv = Joi.alternatives(Joi.array().items(Joi.string().max(150)).max(20), Joi.string().max(2000));

export const searchJobs = {
  query: Joi.object({
    ...pagination,
    q: Joi.string().trim().max(200).allow(''),
    exact: Joi.boolean(),
    keywords: csv, // up to 20 chips
    mandatory: csv, // starred keywords that must match
    allMandatory: Joi.boolean(),
    kind: Joi.string().valid('job', 'internship', 'any'),
    location: csv,
    includeRemote: Joi.boolean(),
    remoteOnly: Joi.boolean(),
    experience: Joi.number().min(0).max(50),
    experienceMin: Joi.number().min(0).max(50),
    experienceMax: Joi.number().min(0).max(60),
    experienceLevel: csv,
    distanceKm: Joi.number().valid(...DISTANCE_KM),
    joiningPeriod: csv,
    stipend: csv, // Paid / Unpaid
    stipendMax: Joi.number().min(0),
    degree: csv,
    specialisation: csv,
    topCompany: csv,
    companySize: csv,
    salaryMin: Joi.number().min(0),
    salaryMax: Joi.number().min(0),
    stipendMin: Joi.number().min(0),
    durationMax: Joi.number().min(1),
    workMode: csv,
    department: csv,
    function: csv,
    subIndustry: csv,
    role: csv,
    industry: csv,
    employmentType: csv,
    education: csv,
    skills: csv,
    shift: csv,
    label: csv,
    category: Joi.string().max(60),
    companyType: csv,
    postedBy: Joi.alternatives(Joi.array().items(Joi.string().valid('company', 'consultancy')).max(2), Joi.string().max(30)),
    organization: objectId,
    topCompanies: Joi.boolean(),
    verifiedOnly: Joi.boolean(),
    freshness: Joi.number()
      .integer()
      .valid(...new Set([...DATE_POSTED_DAYS, 3, 30])),
    sort: Joi.string().valid('relevance', 'date', 'salary', 'salary_asc').default('relevance'),
  }),
};

export const guestPost = {
  body: Joi.object({
    employer: Joi.object({
      otp: otp.required(),
      employerType: Joi.string().valid('company', 'consultancy').required(),
      organizationName: shortText.min(2).required(),
      fullName: shortText.min(2).required(),
      email: email.required(),
      mobile: mobile.required(),
      designation: s,
      heardFrom: s,
      declarations: Joi.object({ authorized: Joi.boolean().valid(true).required(), noCandidateFee: Joi.boolean().valid(true).required() }).required(),
      consentCommunication: Joi.boolean(),
      acceptTerms: Joi.boolean().valid(true).required(),
    }).required(),
    job: Joi.object({
      ...jobFields,
      title: shortText.min(2).required(),
      description: Joi.string().trim().min(20).max(30000).required(),
      locations: Joi.array().items(place).min(1).max(4).required(),
    }).required(),
  }),
};
