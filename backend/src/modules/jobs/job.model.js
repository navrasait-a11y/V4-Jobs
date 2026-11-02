import mongoose from 'mongoose';
import { JOB_KIND, JOB_STATUS, QUESTION_TYPES, LEGACY_QUESTION_TYPES } from '../../shared/constants/index.js';

const { Schema } = mongoose;

const placeSchema = new Schema(
  {
    locality: String,
    district: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,
    location: { type: Schema.Types.ObjectId, ref: 'Location' },
  },
  { _id: false },
);

const questionSchema = new Schema({
  question: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: [...QUESTION_TYPES, ...LEGACY_QUESTION_TYPES], default: 'short_answer' },
  options: [String],
  required: Boolean,
});

const jobSchema = new Schema(
  {
    uid: { type: String, unique: true, required: true }, // JOBS-/INTE-DDMMYYYY000001 (admin only)
    kind: { type: String, enum: Object.values(JOB_KIND), default: JOB_KIND.JOB, index: true },
    slug: { type: String, unique: true, required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    organizationType: { type: String, index: true }, // company | consultancy (denormalised for filters)
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    postedByAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    title: { type: String, required: true, trim: true, maxlength: 200 },
    designation: { type: String, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 30000 },
    responsibilities: { type: String, maxlength: 20000 },
    keySkills: { type: [String], index: true },
    industries: [String],
    subIndustries: [String],
    departments: [String],
    functions: [String],
    roles: [String],
    category: { type: String, index: true }, // IT / Non IT ...
    employmentTypes: [String],
    jobModes: { type: [String], index: true }, // Work From Home / Office / Field / Hybrid / Remote
    shifts: [String],
    openings: { type: Number, default: 1, min: 1 },

    experience: { min: { type: Number, default: 0 }, max: Number }, // years
    experienceLevels: [String], // Fresher, Experienced ... (years may be fractional: 1 month = 1/12)
    salary: {
      min: Number,
      max: Number,
      type: { type: String }, // Fixed Only / Fixed + Variable ...
      period: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      currency: { type: String, default: 'INR' },
      hidden: { type: Boolean, default: false },
    },
    perks: [String],
    // Internship-only
    internshipType: String, // Full Time / Part Time
    stipend: { paid: { type: Boolean, default: true }, min: Number, max: Number, type: { type: String }, hidden: { type: Boolean, default: false } },
    duration: { value: Number, unit: { type: String, enum: ['days', 'weeks', 'months'] }, noFixed: Boolean },
    internshipStartDate: Date,

    education: {
      levels: [String],
      degrees: [String],
      specialisations: [String],
      institutions: [String],
      types: [String],
      statuses: [String],
      mediums: [String],
      marksType: String,
      marksValue: String, // grade, % or CGPA as typed
    },
    certifications: [String],
    // Candidate diversity & other criteria (empty = any)
    gender: { type: String, default: 'any' }, // legacy single value; `genders` wins
    genders: [String],
    maritalStatuses: [String],
    ageRange: { min: Number, max: Number }, // max 61 = 60+ (no upper limit)
    englishFluency: [String],
    languages: [String],
    diversity: [String],
    disabilityStatuses: [String],
    disabilityTypes: [String],
    assets: [String],
    noticePeriod: String, // legacy single value
    noticePeriods: [String],

    locations: [placeSchema],
    distanceKm: Number, // show candidates within N km of the job locations
    relocateOptions: [String],
    address: String,
    isRemote: { type: Boolean, default: false },

    consultancyClient: { name: String, hideName: { type: Boolean, default: true }, industry: String }, // for consultancies hiring for a client
    contact: {
      name: String,
      email: String,
      mobile: String,
      showToCandidates: { type: Boolean, default: false },
      timeFrom: String, // 09:30 AM
      timeTo: String,
      dayFrom: String, // Monday
      dayTo: String,
    },
    interviewMode: String, // Walk-in / Candidates Can Call Me Directly / ... (lookup interview_mode)
    walkIn: {
      startDate: Date,
      endDate: Date,
      durationDays: Number,
      timing: String,
      contactName: String,
      contactMobile: String,
      contactEmail: String,
      venue: String,
      mapUrl: String,
    },
    responseAlerts: {
      daily: { type: Boolean, default: false }, // daily response summary to the poster
      everyResponse: { type: Boolean, default: false }, // e-mail on every new response
      emails: [String], // extra recipients
    },
    callbackRequests: { type: Number, default: 0 },
    questions: [questionSchema],
    applyExternalUrl: String,

    status: { type: String, enum: Object.values(JOB_STATUS), default: JOB_STATUS.DRAFT, index: true },
    statusReason: String,
    labels: { type: [String], default: [], index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    publishedAt: Date,
    deadlineAt: Date,
    expiresAt: { type: Date, index: true },
    refreshedAt: Date,
    closedAt: Date,
    source: { type: String, enum: ['direct', 'excel_import', 'admin', 'without_login', 'duplicate'], default: 'direct', index: true },
    prefilledFrom: { type: Schema.Types.ObjectId, ref: 'Job' },
    events: [{ type: Schema.Types.ObjectId, ref: 'JobEvent' }],
    googleJobsEnabled: { type: Boolean, default: true },

    stats: {
      views: { type: Number, default: 0 },
      applications: { type: Number, default: 0 },
      newApplications: { type: Number, default: 0 },
      shortlisted: { type: Number, default: 0 },
      hired: { type: Number, default: 0 },
      invites: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
    },
    // denormalised for fast listing without populate
    orgSnapshot: { name: String, logo: String, isVerified: Boolean, slug: String, username: String, employerType: String },
    deletedAt: Date,
  },
  { timestamps: true },
);

jobSchema.index({ status: 1, publishedAt: -1 });
jobSchema.index({ status: 1, kind: 1, 'locations.city': 1, publishedAt: -1 });
jobSchema.index({ organization: 1, status: 1, createdAt: -1 });
jobSchema.index({ status: 1, isFeatured: -1, refreshedAt: -1 });
jobSchema.index({ 'salary.min': 1, 'salary.max': 1 });
jobSchema.index({ 'experience.min': 1, 'experience.max': 1 });
jobSchema.index(
  { title: 'text', designation: 'text', keySkills: 'text', roles: 'text', 'orgSnapshot.name': 'text', description: 'text' },
  { name: 'job_text', weights: { title: 10, designation: 8, keySkills: 8, roles: 5, 'orgSnapshot.name': 4, description: 1 } },
);

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
export default Job;
