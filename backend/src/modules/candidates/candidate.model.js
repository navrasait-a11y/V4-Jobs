import mongoose from 'mongoose';

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

const employmentSchema = new Schema({
  jobTitle: { type: String, trim: true, maxlength: 150 },
  employerName: { type: String, trim: true, maxlength: 200 },
  employerType: String, // Indian MNC, Foreign MNC, Govt/PSU ...
  employmentType: String, // Full Time, Permanent ...
  jobModes: [String], // Work From Home / Office / Field / Hybrid / Remote (upto 3)
  location: placeSchema,
  shift: String,
  isCurrent: { type: Boolean, default: false },
  startDate: Date,
  endDate: Date,
  salaryType: String, // Fixed Only, Fixed + Variable ...
  monthlySalary: Number,
  perks: [String],
  noticePeriod: String,
  description: { type: String, maxlength: 30000 }, // "upto 4000 words"
  skills: [String],
  industries: [String],
  departments: [String],
  roles: [String],
});

const educationSchema = new Schema({
  level: String, // Below 10th ... Doctorate
  degree: String,
  specialisation: String,
  institution: String,
  status: String, // Pursuing / Pass Out
  startDate: Date,
  endDate: Date,
  educationType: String, // Full Time / Part Time / Correspondence
  medium: String,
  marksType: String, // Grade / Percentage / Division / CGPA
  marks: String,
  isHighest: { type: Boolean, default: false },
});

const fileSchema = new Schema({ key: String, url: String, name: String, size: Number, mime: String, uploadedAt: Date }, { _id: false });

const candidateSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    experienceLevel: { type: String, index: true }, // Experienced / Fresher / Internship / Apprenticeship
    journeyStatus: String, // Current Job Journey Status (Actively Applying ...)
    presentJobStatus: String, // Working / Not Working
    availabilityStatus: { type: String, default: 'open_to_work' }, // open_to_work | not_available | serving_notice

    // Personal
    dob: Date,
    maritalStatus: String,
    guardianRelation: String,
    guardianName: String,
    category: String, // SC / ST / OBC / General / EWS
    currentLocation: placeSchema,
    hometown: placeSchema,
    disability: { status: String, type: { type: String } },
    military: { status: String, serviceType: String },
    englishFluency: String,
    languages: [String],
    assets: [String], // Laptop, Smart Phone, Bike, Driving licences ...
    hasTwoWheeler: Boolean,
    hasFourWheeler: Boolean,
    drivingLicense: String,

    // Resume
    resume: fileSchema,
    resumeText: { type: String, select: false }, // parsed text (resume search)
    resumeHeadline: { type: String, maxlength: 500 },
    profileSummary: { type: String, maxlength: 5000 },
    itSkills: [String],
    keySkills: { type: [String], index: true },
    resumeBuilder: Schema.Types.Mixed, // structured data from the Resume Builder tool

    // Work
    totalExperienceMonths: { type: Number, default: 0, index: true },
    currentJobTitle: String,
    currentEmployer: String,
    currentSalary: Number, // monthly in-hand
    noticePeriod: String,
    employments: [employmentSchema],
    industries: [String],
    departments: [String],
    roles: [String],

    // Education
    educations: [educationSchema],
    highestEducationLevel: String,
    certifications: [String],

    // Preferences
    preferences: {
      jobModes: [String],
      locations: [placeSchema], // upto 4 (Excel shows 3 - API allows 4 per PRD)
      willingToRelocate: { type: Boolean, default: false },
      anywhereInIndia: { type: Boolean, default: false },
      expectedSalary: Number,
      employmentTypes: [String],
      shifts: [String],
      skills: [String],
      industries: [String],
      departments: [String],
      roles: [String],
      noticePeriod: String,
      jobTypes: [String], // job / internship
    },

    socialProfiles: [{ platform: String, url: String, _id: false }],
    portfolios: [{ name: String, url: String, _id: false }],

    profileCompletion: { type: Number, default: 0, index: true },
    boostUntil: Date, // Profile Booster package
    stats: {
      profileViews: { type: Number, default: 0 },
      resumeDownloads: { type: Number, default: 0 },
      searchAppearances: { type: Number, default: 0 },
      applications: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

candidateSchema.index(
  {
    keySkills: 'text',
    itSkills: 'text',
    resumeHeadline: 'text',
    currentJobTitle: 'text',
    currentEmployer: 'text',
    'employments.jobTitle': 'text',
    'employments.employerName': 'text',
    resumeText: 'text',
  },
  {
    name: 'candidate_text',
    weights: {
      keySkills: 10,
      currentJobTitle: 8,
      resumeHeadline: 6,
      itSkills: 5,
      'employments.jobTitle': 4,
      currentEmployer: 3,
      'employments.employerName': 2,
      resumeText: 1,
    },
  },
);
candidateSchema.index({ 'currentLocation.city': 1 });
candidateSchema.index({ 'preferences.locations.city': 1 });
candidateSchema.index({ currentSalary: 1 });
candidateSchema.index({ updatedAt: -1 });

const Candidate = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);
export default Candidate;
