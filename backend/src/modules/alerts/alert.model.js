import mongoose from 'mongoose';

const { Schema } = mongoose;

const placeSchema = new Schema({ district: String, city: String, state: String, country: String, locality: String }, { _id: false });

/**
 * Job Alert (Excel sheet "Set Job Alert"). Registered and unregistered job seekers can create
 * alerts - unregistered users get a candidate account auto-created.
 */
const jobAlertSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true },
    mobile: String,
    criteria: {
      keywords: String,
      jobTitle: String,
      keySkills: [String], // upto 15
      experienceLevel: String,
      totalExperienceMonths: Number,
      presentJobStatus: String,
      currentSalary: Number,
      expectedSalary: { min: Number, max: Number },
      locations: [placeSchema], // upto 3
      industries: [String], // upto 5
      departments: [String], // upto 5
      roles: [String], // upto 10
      educationLevels: [String],
      degrees: [String],
      specialisations: [String],
      jobModes: [String],
      employmentTypes: [String],
      kind: { type: String, enum: ['job', 'internship', 'any'], default: 'any' },
    },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily', index: true },
    channels: { type: [String], default: ['email', 'in_app'] },
    isActive: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ['active', 'paused', 'pending', 'trashed'], default: 'active' },
    lastSentAt: Date,
    nextRunAt: { type: Date, index: true },
    sentCount: { type: Number, default: 0 },
    lastJobIds: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
    source: { type: String, enum: ['candidate', 'admin', 'guest'], default: 'candidate' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    heardFrom: String,
  },
  { timestamps: true },
);
jobAlertSchema.index({ isActive: 1, nextRunAt: 1 });

/** Every job sent through an alert (shown as "Job Alert Responses" on the candidate dashboard). */
const alertMatchSchema = new Schema(
  {
    alert: { type: Schema.Types.ObjectId, ref: 'JobAlert', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    sentAt: { type: Date, default: Date.now },
    clicked: { type: Boolean, default: false },
  },
  { timestamps: false },
);
alertMatchSchema.index({ alert: 1, job: 1 }, { unique: true });
alertMatchSchema.index({ sentAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const JobAlert = mongoose.models.JobAlert || mongoose.model('JobAlert', jobAlertSchema);
export const AlertMatch = mongoose.models.AlertMatch || mongoose.model('AlertMatch', alertMatchSchema);
