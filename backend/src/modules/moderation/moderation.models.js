import mongoose from 'mongoose';
import { BLOCKLIST_TYPES } from '../../shared/constants/index.js';

const { Schema } = mongoose;

/** Platform-level blocklist managed by admins (e-mail, mobile, name, GST, country, URL, domain, IP). */
const blocklistSchema = new Schema(
  {
    type: { type: String, enum: BLOCKLIST_TYPES, required: true },
    value: { type: String, required: true, trim: true, lowercase: true },
    reason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
blocklistSchema.index({ type: 1, value: 1 }, { unique: true });

/** User-level blocks: candidate blocks an employer / employer blocks a candidate. */
const userBlockSchema = new Schema(
  {
    blockerUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockerOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' }, // set when an employer blocks
    targetType: { type: String, enum: ['candidate', 'organization'], required: true },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    targetOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    reason: String,
  },
  { timestamps: true },
);
userBlockSchema.index({ blockerUser: 1, targetType: 1, targetUser: 1, targetOrganization: 1 }, { unique: true });
userBlockSchema.index({ blockerOrganization: 1, targetUser: 1 });
userBlockSchema.index({ targetUser: 1 });
userBlockSchema.index({ targetOrganization: 1 });

/** Report Issue / Fraud: job, employer (organization) or candidate. Reporter may be anonymous. */
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User' },
    reporterRole: String,
    reporterContact: { name: String, email: String, mobile: String },
    targetType: { type: String, enum: ['job', 'organization', 'candidate'], required: true, index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    candidate: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    details: { type: String, maxlength: 2000 },
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'dismissed'], default: 'open', index: true },
    adminNotes: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true },
);
reportSchema.index({ createdAt: -1 });

/**
 * Comments between employers & job seekers (moderated by admin):
 *  - employer -> candidate  (targetType candidate)
 *  - candidate -> employer  (targetType organization)
 */
const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true },
    authorOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    targetType: { type: String, enum: ['candidate', 'organization'], required: true },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    targetOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    targetOrgType: String, // company | consultancy - admin filter "Comments to Companies / Consultancies"
    body: { type: String, required: true, maxlength: 3000 },
    rating: { type: Number, min: 1, max: 5 },
    status: { type: String, enum: ['pending', 'approved', 'spam', 'trashed'], default: 'pending', index: true },
    isAdminComment: { type: Boolean, default: false },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
commentSchema.index({ targetType: 1, targetUser: 1, targetOrganization: 1, status: 1, createdAt: -1 });

export const Blocklist = mongoose.models.Blocklist || mongoose.model('Blocklist', blocklistSchema);
export const UserBlock = mongoose.models.UserBlock || mongoose.model('UserBlock', userBlockSchema);
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
