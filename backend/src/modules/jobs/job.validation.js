import Joi from 'joi';
import { objectId, place, shortText, stringList, email, mobile, pagination, url } from '../../shared/validators/common.js';
import { PAGE_SIZES, JOB_STATUS } from '../../shared/constants/index.js';

const s = shortText.allow('', null);

export const jobFields = {
  kind: Joi.string().valid('job', 'internship'),
  title: shortText.min(2),
  designation: s,
  description: Joi.string().trim().max(30000).allow(''),
  responsibilities: Joi.string().trim().max(20000).allow(''),
  keySkills: stringList(30),
  industries: stringList(5),
  departments: stringList(25),
  roles: stringList(10),
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
  perks: stringList(40),
  stipend: Joi.object({ min: Joi.number().min(0), max: Joi.number().min(Joi.ref('min')), type: s }),
  duration: Joi.object({ value: Joi.number().integer().min(1).max(60), unit: Joi.string().valid('days', 'weeks', 'months') }),
  internshipStartDate: Joi.date(),
  education: Joi.object({ levels: stringList(10), degrees: stringList(20), specialisations: stringList(20) }),
  gender: Joi.string().valid('any', 'male', 'female', 'transgender', 'other'),
  ageRange: Joi.object({ min: Joi.number().integer().min(14).max(80), max: Joi.number().integer().min(Joi.ref('min')).max(80) }),
  languages: stringList(20),
  assets: stringList(30),
  noticePeriod: s,
  locations: Joi.array().items(place).max(15),
  address: Joi.string().trim().max(500).allow(''),
  isRemote: Joi.boolean(),
  consultancyClient: Joi.object({ name: s, hideName: Joi.boolean(), industry: s }),
  contact: Joi.object({ name: s, email: email.allow(''), mobile: mobile.allow(''), showToCandidates: Joi.boolean() }),
  questions: Joi.array()
    .items(
      Joi.object({
        question: Joi.string().trim().max(500).required(),
        type: Joi.string().valid('text', 'yes_no', 'number', 'choice'),
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
    kind: Joi.string().valid('job', 'internship', 'any'),
    location: csv,
    includeRemote: Joi.boolean(),
    remoteOnly: Joi.boolean(),
    experience: Joi.number().min(0).max(50),
    salaryMin: Joi.number().min(0),
    salaryMax: Joi.number().min(0),
    stipendMin: Joi.number().min(0),
    durationMax: Joi.number().min(1),
    workMode: csv,
    department: csv,
    role: csv,
    industry: csv,
    employmentType: csv,
    education: csv,
    skills: csv,
    shift: csv,
    label: csv,
    category: Joi.string().max(60),
    companyType: Joi.string().max(60),
    postedBy: Joi.string().valid('company', 'consultancy'),
    organization: objectId,
    topCompanies: Joi.boolean(),
    verifiedOnly: Joi.boolean(),
    freshness: Joi.number().integer().valid(1, 3, 7, 15, 30),
    sort: Joi.string().valid('relevance', 'date', 'salary').default('relevance'),
  }),
};

export const guestPost = {
  body: Joi.object({
    employer: Joi.object({
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
      locations: Joi.array().items(place).min(1).max(15).required(),
    }).required(),
  }),
};
