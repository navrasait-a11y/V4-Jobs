import mongoose from 'mongoose';
import { EMPLOYER_TYPE, USER_STATUS, USER_SOURCE, DOCUMENT_STATUS, MAX_EMPLOYER_MEMBERS } from '../../shared/constants/index.js';

const { Schema } = mongoose;

const fileSchema = new Schema({ key: String, url: String, name: String, size: Number, mime: String, uploadedAt: Date }, { _id: false });

const locationSchema = new Schema(
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

const officeSchema = new Schema({
  type: { type: String, trim: true }, // Registered Office, Corporate Office, Branch Office, Head Office, Work Location, Other
  address: { type: String, trim: true, maxlength: 500 },
  ...locationSchema.obj,
  geo: { lat: Number, lng: Number },
  mapUrl: String,
  isPrimary: { type: Boolean, default: false },
});

const documentSchema = new Schema(
  {
    type: { type: String, required: true }, // GST Certificate, Company PAN, Certificate of Incorporation ...
    number: { type: String, trim: true },
    file: fileSchema,
    status: { type: String, enum: DOCUMENT_STATUS, default: 'under_review' },
    remarks: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true },
);

const creditsSchema = new Schema(
  {
    job_post: { type: Number, default: 0 },
    featured_job: { type: Number, default: 0 },
    resume_view: { type: Number, default: 0 }, // candidate contact unlocks
    resume_download: { type: Number, default: 0 },
    invite: { type: Number, default: 0 },
    excel_download: { type: Number, default: 0 },
    resume_search: { type: Number, default: 0 },
  },
  { _id: false },
);

const organizationSchema = new Schema(
  {
    uid: { type: String, unique: true, required: true }, // COMP-/CONS-DDMMYYYY000001 (admin only)
    type: { type: String, enum: Object.values(EMPLOYER_TYPE), required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    legalName: { type: String, trim: true, maxlength: 200 },
    username: { type: String, trim: true, unique: true, sparse: true }, // public page handle /employers/:username
    slug: { type: String, unique: true },
    logo: fileSchema,
    coverPhoto: fileSchema,
    employerType: String, // Indian MNC, Foreign MNC, Govt / PSU, Startup, Unicorn, Corporate, Consultancy
    organizationType: String, // Private Limited, Public Limited, LLP ...
    industries: [String],
    departments: [String],
    employeeCount: String, // 0-10, 11-25 ...
    foundedDate: Date,
    website: String,
    about: { type: String, maxlength: 10000 },
    socialProfiles: [{ platform: String, url: String, _id: false }],
    offices: [officeSchema],
    hiringStatus: String, // We are Hiring, Hiring Is Full ...
    gstNumber: { type: String, trim: true, uppercase: true, sparse: true, index: true },
    panNumber: { type: String, trim: true, uppercase: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    consultancyDeclaration: { authorized: Boolean, noCandidateFee: Boolean, acceptedAt: Date },
    termsDeclaration: {
      accurate: Boolean,
      authorized: Boolean,
      employerTerms: Boolean,
      privacy: Boolean,
      postingPolicy: Boolean,
      fraudWarning: Boolean,
      acceptedAt: Date,
    },

    documents: [documentSchema],
    kycStatus: { type: String, enum: DOCUMENT_STATUS, default: 'not_submitted', index: true },
    verification: {
      email: { type: Boolean, default: false },
      phone: { type: Boolean, default: false },
      gst: { type: Boolean, default: false },
      domain: { type: Boolean, default: false },
      business: { type: Boolean, default: false },
      domainToken: String,
    },
    isVerified: { type: Boolean, default: false, index: true }, // badge

    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.PENDING, index: true },
    statusReason: String,
    labels: { type: [String], default: [], index: true },
    situationTag: String,
    source: { type: String, enum: USER_SOURCE, default: 'direct', index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    maxMembers: { type: Number, default: MAX_EMPLOYER_MEMBERS },

    credits: { type: creditsSchema, default: () => ({}) },
    activeSubscription: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    planFeatures: {
      resumeDbAccess: { type: Boolean, default: false },
      unlimitedJobs: { type: Boolean, default: false },
      advancedAnalytics: { type: Boolean, default: false },
      bulkUpload: { type: Boolean, default: false },
    },
    planExpiresAt: Date,

    stats: {
      followers: { type: Number, default: 0 },
      activeJobs: { type: Number, default: 0 },
      totalJobs: { type: Number, default: 0 },
      profileViews: { type: Number, default: 0 },
    },
    adminNotes: [{ note: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
    deletedAt: Date,
  },
  { timestamps: true },
);

organizationSchema.index({ type: 1, status: 1, createdAt: -1 });
organizationSchema.index({ name: 'text', legalName: 'text', uid: 'text' }, { name: 'org_text' });
organizationSchema.index({ 'offices.city': 1 });

const Organization = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
export default Organization;
