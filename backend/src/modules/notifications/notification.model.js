import mongoose from 'mongoose';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true }, // job_alert, application_update, interview_reminder, subscription_expiry, profile_reminder, recruiter_response, message, system ...
    title: { type: String, required: true },
    body: String,
    data: Schema.Types.Mixed, // deep-link payload for app/web: { screen, jobId, applicationId ... }
    image: String,
    readAt: Date,
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

/** Every outgoing e-mail - feeds the admin "SMTP statistics" dashboard. */
const emailLogSchema = new Schema(
  {
    to: { type: String, required: true },
    cc: [String],
    subject: String,
    template: String,
    category: { type: String, default: 'transactional' }, // transactional | bulk | alert | otp | marketing
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'blocked', 'spam', 'failed', 'draft', 'trashed'],
      default: 'queued',
      index: true,
    },
    provider: String,
    attempts: { type: Number, default: 0 },
    events: [{ event: String, at: Date, reason: String, _id: false }],
    error: String,
    messageId: { type: String, index: true, sparse: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date,
  },
  { timestamps: true },
);
emailLogSchema.index({ createdAt: -1, status: 1 });

/** WhatsApp / SMS / Arattai dispatch log. */
const messageLogSchema = new Schema(
  {
    channel: { type: String, enum: ['sms', 'whatsapp', 'push', 'arattai'], required: true },
    to: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    template: String,
    body: String,
    status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped'], default: 'queued' },
    route: String, // sms: otp_api | dlt
    error: String,
    providerId: String,
  },
  { timestamps: true },
);
messageLogSchema.index({ createdAt: -1, channel: 1, status: 1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const EmailLog = mongoose.models.EmailLog || mongoose.model('EmailLog', emailLogSchema);
export const MessageLog = mongoose.models.MessageLog || mongoose.model('MessageLog', messageLogSchema);
