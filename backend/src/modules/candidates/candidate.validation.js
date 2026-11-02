import Joi from 'joi';
import { objectId, place, shortText, longText, stringList, url, socialLink, username } from '../../shared/validators/common.js';
import { DISTANCE_KM } from '../../shared/constants/index.js';

const s = shortText.allow('', null);

export const employment = Joi.object({
  jobTitle: shortText.required(),
  employerName: shortText.required(),
  employerType: s,
  employmentType: s,
  jobModes: stringList(3),
  location: place,
  shift: s,
  isCurrent: Joi.boolean().default(false),
  startDate: Joi.date(),
  endDate: Joi.date().when('isCurrent', { is: true, then: Joi.forbidden(), otherwise: Joi.date().min(Joi.ref('startDate')) }),
  salaryType: s,
  monthlySalary: Joi.number().min(0).max(100000000),
  perks: stringList(40),
  noticePeriod: s,
  description: longText.allow(''),
  skills: stringList(15),
  industries: stringList(5),
  subIndustries: stringList(20),
  departments: stringList(5),
  functions: stringList(20),
  roles: stringList(10),
});

export const education = Joi.object({
  level: shortText.required(),
  degree: s,
  specialisation: s,
  institution: s,
  status: s,
  startDate: Joi.date(),
  endDate: Joi.date(),
  educationType: s,
  medium: s,
  marksType: s,
  marks: Joi.string().trim().max(20).allow(''),
  isHighest: Joi.boolean().default(false),
});

const preferences = Joi.object({
  jobModes: stringList(3),
  locations: Joi.array().items(place).max(4),
  relocation: stringList(4),
  distanceKm: Joi.number().valid(...DISTANCE_KM).allow(null),
  willingToRelocate: Joi.boolean(),
  anywhereInIndia: Joi.boolean(),
  expectedSalary: Joi.number().min(0).max(100000000),
  employmentTypes: stringList(12),
  shifts: stringList(3),
  skills: stringList(15),
  industries: stringList(5),
  subIndustries: stringList(20),
  departments: stringList(5),
  functions: stringList(20),
  roles: stringList(15),
  noticePeriod: s,
  jobTypes: Joi.array().items(Joi.string().valid('job', 'internship')),
});

export const updateProfile = {
  body: Joi.object({
    // identity
    fullName: Joi.string().trim().min(2).max(120),
    displayName: Joi.string().trim().max(80),
    firstName: s,
    lastName: s,
    username,
    gender: s,
    about: Joi.string().trim().max(5000).allow(''),
    socialLinks: Joi.array().items(socialLink).max(15),
    notificationPrefs: Joi.object({
      email: Joi.boolean(),
      sms: Joi.boolean(),
      whatsapp: Joi.boolean(),
      push: Joi.boolean(),
      jobAlerts: Joi.boolean(),
      recruiterMessages: Joi.boolean(),
      marketing: Joi.boolean(),
    }),
    privacy: Joi.object({ profileVisibility: Joi.string().valid('public', 'recruiters', 'hidden'), showContact: Joi.boolean() }),
    // candidate
    experienceLevel: s,
    journeyStatus: s,
    presentJobStatus: s,
    availabilityStatus: Joi.string().valid('open_to_work', 'not_available', 'serving_notice'),
    dob: Joi.date().max('now'),
    maritalStatus: s,
    guardianRelation: s,
    guardianName: s,
    category: s,
    currentLocation: place,
    hometown: place,
    disability: Joi.object({ status: s, type: s }),
    military: Joi.object({ status: s, serviceType: s }),
    englishFluency: s,
    languages: stringList(10),
    assets: stringList(25),
    documents: stringList(35),
    hasTwoWheeler: Joi.boolean(),
    hasFourWheeler: Joi.boolean(),
    drivingLicense: s,
    resumeHeadline: Joi.string().trim().max(500).allow(''),
    profileSummary: Joi.string().trim().max(5000).allow(''),
    itSkills: stringList(15),
    keySkills: stringList(20),
    totalExperience: Joi.object({ years: Joi.number().integer().min(0).max(60), months: Joi.number().integer().min(0).max(11) }),
    currentSalary: Joi.number().min(0).max(100000000),
    noticePeriod: s,
    industries: stringList(5),
    subIndustries: stringList(20),
    departments: stringList(5),
    functions: stringList(20),
    roles: stringList(15),
    certifications: stringList(10),
    preferences,
    socialProfiles: Joi.array().items(socialLink).max(15),
    portfolios: Joi.array()
      .items(Joi.object({ name: shortText.required(), url: url.required() }))
      .max(20),
  }).min(1),
};

export const sectionParam = Joi.object({ section: Joi.string().valid('employments', 'educations').required(), itemId: objectId });

export const resumeBuilder = { body: Joi.object().unknown(true).max(60) };

export const deleteAccount = { body: Joi.object({ reason: Joi.string().trim().max(500).allow('') }) };
