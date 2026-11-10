import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Candidate follows an employer (company / consultancy) for latest job updates. */
const followSchema = new Schema(
  {
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    notify: { type: Boolean, default: true },
  },
  { timestamps: true },
);
followSchema.index({ follower: 1, organization: 1 }, { unique: true });

/** Favourite / saved jobs. */
const savedJobSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true } },
  { timestamps: true },
);
savedJobSchema.index({ user: 1, job: 1 }, { unique: true });
savedJobSchema.index({ user: 1, createdAt: -1 });

/**
 * Saved searches: candidates save job searches; employers save resume searches
 * (shareable with internal team members).
 */
const savedSearchSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    scope: { type: String, enum: ['job', 'resume'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    filters: { type: Schema.Types.Mixed, required: true },
    sharedWith: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    alertEnabled: { type: Boolean, default: false },
    lastRunAt: Date,
    resultCount: Number,
  },
  { timestamps: true },
);
savedSearchSchema.index({ organization: 1, sharedWith: 1 });

/** Recent searches (auto-recorded, auto-expire after 90 days). */
const recentSearchSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    scope: { type: String, enum: ['job', 'resume'], required: true },
    filters: Schema.Types.Mixed,
    summary: String,
    resultCount: Number,
  },
  { timestamps: true },
);
recentSearchSchema.index({ owner: 1, scope: 1, createdAt: -1 });
recentSearchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

/**
 * Employer candidate folders. System folders (shortlisted / rejected / hold / contacted / accessed /
 * commented) are computed from tracking data; these are user-created folders.
 */
const folderSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: String,
    candidates: [
      {
        candidate: { type: Schema.Types.ObjectId, ref: 'User' },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    sharedWith: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);
folderSchema.index({ organization: 1, owner: 1, name: 1 }, { unique: true });
folderSchema.index({ 'candidates.candidate': 1 });

/** Profile views / contact unlocks / resume downloads by employers (candidate analytics + "accessed candidates"). */
const profileAccessSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['view', 'contact_unlock', 'resume_download', 'excel_download'], required: true },
    source: String, // view: search | application | invite | recommended | profile
    job: { type: Schema.Types.ObjectId, ref: 'Job' }, // view from an application: which job
    anonymous: { type: Boolean, default: false }, // recruiter browsed in private mode
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
profileAccessSchema.index({ organization: 1, candidate: 1, type: 1 });
profileAccessSchema.index({ organization: 1, createdAt: -1 });
profileAccessSchema.index({ candidate: 1, type: 1, createdAt: -1 });
profileAccessSchema.index({ candidate: 1, member: 1, type: 1, createdAt: -1 });

/** Job invites sent by employers to candidates (Invite to Apply). */
const jobInviteSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, maxlength: 2000 },
    status: { type: String, enum: ['sent', 'viewed', 'applied', 'declined'], default: 'sent', index: true },
    viewedAt: Date,
    respondedAt: Date,
  },
  { timestamps: true },
);
jobInviteSchema.index({ job: 1, candidate: 1 }, { unique: true });

/** "Request Call Back" on a job (Mode of Interview: I / other recruiter will contact candidates). */
const callbackRequestSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['pending', 'called'], default: 'pending' },
  },
  { timestamps: true },
);
callbackRequestSchema.index({ job: 1, candidate: 1 }, { unique: true });

export const Follow = mongoose.models.Follow || mongoose.model('Follow', followSchema);
export const SavedJob = mongoose.models.SavedJob || mongoose.model('SavedJob', savedJobSchema);
export const SavedSearch = mongoose.models.SavedSearch || mongoose.model('SavedSearch', savedSearchSchema);
export const RecentSearch = mongoose.models.RecentSearch || mongoose.model('RecentSearch', recentSearchSchema);
export const CandidateFolder = mongoose.models.CandidateFolder || mongoose.model('CandidateFolder', folderSchema);
export const ProfileAccess = mongoose.models.ProfileAccess || mongoose.model('ProfileAccess', profileAccessSchema);
export const JobInvite = mongoose.models.JobInvite || mongoose.model('JobInvite', jobInviteSchema);
export const CallbackRequest = mongoose.models.CallbackRequest || mongoose.model('CallbackRequest', callbackRequestSchema);
