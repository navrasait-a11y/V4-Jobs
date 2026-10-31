import mongoose from 'mongoose';
import { PIPELINE_STAGES, SCREENING_STATUS, CALLING_STATUS, MESSAGING_STATUS, FORWARD_CHANNELS } from '../../shared/constants/index.js';

const { Schema } = mongoose;

const historySchema = new Schema(
  { field: String, from: String, to: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, note: String, at: { type: Date, default: Date.now } },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobPostedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // for "manage own responses only"
    jobKind: String,
    source: {
      type: String,
      enum: ['direct', 'without_login', 'invite', 'job_alert', 'event', 'admin_assign', 'recommendation'],
      default: 'direct',
      index: true,
    },
    event: { type: Schema.Types.ObjectId, ref: 'JobEvent' },

    // Snapshot of what the candidate submitted (Candidate Job Apply form) - immutable record
    snapshot: {
      fullName: String,
      email: String,
      mobile: String,
      currentJobTitle: String,
      currentSalary: Number,
      totalExperienceMonths: Number,
      currentLocation: String,
      keySkills: [String],
      resume: { key: String, name: String, mime: String, size: Number },
      extra: Schema.Types.Mixed,
    },
    answers: [{ question: String, answer: String, _id: false }],
    coverLetter: { type: String, maxlength: 5000 },

    stage: { type: String, enum: PIPELINE_STAGES, default: 'applied', index: true },
    screeningStatus: { type: String, enum: SCREENING_STATUS },
    callingStatus: { type: String, enum: CALLING_STATUS },
    messagingStatus: [{ type: String, enum: MESSAGING_STATUS }],
    forwardedVia: [
      {
        channel: { type: String, enum: FORWARD_CHANNELS },
        to: String,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    comments: [{ body: { type: String, maxlength: 2000 }, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
    tags: [String],
    rating: { type: Number, min: 1, max: 5 },
    matchScore: { type: Number, default: 0, index: true }, // AI relevance 0-100

    isViewed: { type: Boolean, default: false, index: true },
    viewedAt: Date,
    actionTaken: { type: Boolean, default: false, index: true }, // false = "Action pending"
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // admin assign
    withdrawnAt: Date,
    history: [historySchema],
  },
  { timestamps: true },
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
applicationSchema.index({ job: 1, stage: 1, createdAt: -1 });
applicationSchema.index({ organization: 1, createdAt: -1 });
applicationSchema.index({ candidate: 1, createdAt: -1 });

/** Interview scheduling (ATS). */
const interviewSchema = new Schema(
  {
    application: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    interviewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    round: { type: String, default: 'Round 1' },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 30 },
    mode: { type: String, enum: ['in_person', 'video', 'phone'], default: 'video' },
    location: String,
    meetingLink: String,
    notes: String,
    status: { type: String, enum: ['scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'], default: 'scheduled', index: true },
    feedback: { rating: Number, comments: String, result: { type: String, enum: ['selected', 'rejected', 'on_hold', 'next_round'] } },
    candidateResponse: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    reminderSentAt: Date,
  },
  { timestamps: true },
);

/** Employer-side tracking of a candidate outside a specific application (resume search / database). */
const candidateTrackingSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    screeningStatus: { type: String, enum: SCREENING_STATUS },
    callingStatus: { type: String, enum: CALLING_STATUS },
    messagingStatus: [{ type: String, enum: MESSAGING_STATUS }],
    forwardedVia: [
      {
        channel: { type: String, enum: FORWARD_CHANNELS },
        to: String,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    comments: [{ body: { type: String, maxlength: 2000 }, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
    contactUnlockedAt: Date,
    lastContactedAt: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
candidateTrackingSchema.index({ organization: 1, candidate: 1 }, { unique: true });

export const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
export const Interview = mongoose.models.Interview || mongoose.model('Interview', interviewSchema);
export const CandidateTracking = mongoose.models.CandidateTracking || mongoose.model('CandidateTracking', candidateTrackingSchema);
