import mongoose from 'mongoose';

const { Schema } = mongoose;

/** One row per logged-in device. Refresh tokens are stored hashed and rotated on every refresh. */
const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    previousTokenHash: { type: String, index: true }, // for refresh-token reuse detection
    family: { type: String, required: true },
    deviceId: String,
    deviceName: String,
    platform: { type: String, enum: ['web', 'android', 'ios', 'other'], default: 'web' },
    ip: String,
    userAgent: String,
    fcmToken: String,
    impersonatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
sessionSchema.index({ user: 1, revokedAt: 1 });

const otpSchema = new Schema(
  {
    target: { type: String, required: true }, // email or mobile
    channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
    purpose: {
      type: String,
      enum: ['login', 'register', 'verify_email', 'verify_mobile', 'reset_password', 'change_mobile', 'change_email', 'guest_apply', 'job_alert', 'two_factor'],
      required: true,
    },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    meta: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true },
);
otpSchema.index({ target: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

/** Single-use tokens for e-mail links (verify e-mail, reset password, activation). */
const actionTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['verify_email', 'reset_password', 'activation', 'two_factor_challenge'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    meta: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
actionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Login attempts feed admin "All User Login Statistics". */
const loginAttemptSchema = new Schema(
  {
    identifier: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    role: String,
    employerType: String, // company | consultancy for employer logins
    method: { type: String, enum: ['password', 'otp', 'google', 'impersonation', 'two_factor'] },
    success: { type: Boolean, index: true },
    reason: String,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
loginAttemptSchema.index({ createdAt: -1, role: 1 });
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const Otp = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
export const ActionToken = mongoose.models.ActionToken || mongoose.model('ActionToken', actionTokenSchema);
export const LoginAttempt = mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);
