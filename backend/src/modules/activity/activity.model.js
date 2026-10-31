import mongoose from 'mongoose';

const { Schema } = mongoose;

/** User Activity History (login, logout, e-mails, profile updates ...) with exact timestamps. */
const activitySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    type: { type: String, required: true }, // login, logout, email_sent, password_changed, profile_updated, job_posted, applied ...
    description: String,
    ip: String,
    userAgent: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 3600 });

/** Admin audit trail - who changed what, from where. */
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    impersonatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, index: true },
    entity: { type: String, index: true },
    entityId: { type: String, index: true },
    changes: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    requestId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });

export const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
