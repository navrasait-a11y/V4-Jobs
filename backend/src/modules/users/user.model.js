import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  ROLES,
  USER_STATUS,
  USER_SOURCE,
  EMPLOYER_MEMBER_ROLES,
  EMPLOYER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  USAGE_METRICS,
  QUOTA_PERIODS,
} from '../../shared/constants/index.js';

const { Schema } = mongoose;

/** quota: { resume_view: { daily: 50, monthly: 500 }, job_post: { monthly: 10 } } (null/absent = unlimited) */
const quotaSchema = new Schema(
  Object.fromEntries(USAGE_METRICS.map((m) => [m, new Schema(Object.fromEntries(QUOTA_PERIODS.map((p) => [p, { type: Number, min: 0 }])), { _id: false })])),
  { _id: false },
);

const userSchema = new Schema(
  {
    uid: { type: String, unique: true, sparse: true }, // CAND-DDMMYYYY000001 for candidates (admin-only visibility)
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    username: { type: String, trim: true, unique: true, sparse: true },
    displayName: { type: String, trim: true, maxlength: 80 },
    firstName: { type: String, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60 },
    fullName: { type: String, trim: true, maxlength: 120 },
    gender: { type: String, trim: true },
    avatar: { url: String, key: String },

    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    emailVerifiedAt: Date,
    countryCode: { type: String, default: '+91' },
    mobile: { type: String, trim: true, unique: true, sparse: true },
    mobileVerifiedAt: Date,
    password: { type: String, select: false },
    passwordChangedAt: Date,
    googleId: { type: String, unique: true, sparse: true, select: false },

    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE, index: true },
    statusReason: String,
    isVerified: { type: Boolean, default: false, index: true }, // "Verified" badge (email+mobile verified + admin approved)
    labels: { type: [String], default: [], index: true },
    situationTag: { type: String, trim: true }, // admin assigned (e.g. "Actively Applying", "Hidden Talent")
    source: { type: String, enum: USER_SOURCE, default: 'direct', index: true },
    heardFrom: String,
    consents: {
      communication: { type: Boolean, default: false },
      terms: { type: Boolean, default: false },
      acceptedAt: Date,
      ip: String,
    },

    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false }, // encrypted
      backupCodes: { type: [String], select: false }, // sha256 hashes
    },
    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },

    lastLoginAt: Date,
    lastActiveAt: { type: Date, index: true },
    deletedAt: Date,

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Employer team member data (every employer user belongs to exactly one organization)
    employer: {
      organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
      isOwner: { type: Boolean, default: false },
      memberRole: { type: String, enum: EMPLOYER_MEMBER_ROLES },
      designation: String,
      department: [String],
      hiringAuthority: String,
      permissions: { type: [String], enum: EMPLOYER_PERMISSIONS, default: undefined },
      quotas: quotaSchema,
      addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },

    // Portal admin profile
    admin: {
      nickname: String,
      designation: String,
      bio: String,
      logo: { url: String, key: String },
      socialLinks: [{ platform: String, url: String, _id: false }],
      permissions: { type: [String], enum: ADMIN_PERMISSIONS, default: undefined },
    },

    notificationPrefs: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      jobAlerts: { type: Boolean, default: true },
      recruiterMessages: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },
    privacy: {
      profileVisibility: { type: String, enum: ['public', 'recruiters', 'hidden'], default: 'recruiters' },
      showContact: { type: Boolean, default: true },
    },
    about: { type: String, maxlength: 5000 },
    socialLinks: [{ platform: String, url: String, _id: false }],
    followersCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ fullName: 'text', email: 'text', mobile: 'text', username: 'text', uid: 'text' }, { name: 'user_text' });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

userSchema.virtual('isEmailVerified').get(function isEmailVerified() {
  return Boolean(this.emailVerifiedAt);
});
userSchema.virtual('isMobileVerified').get(function isMobileVerified() {
  return Boolean(this.mobileVerifiedAt);
});

/** Public-safe representation. Admin-only fields (uid) are removed unless includeAdminFields. */
userSchema.methods.toSafeJSON = function toSafeJSON({ includeAdminFields = false } = {}) {
  const o = this.toObject({ virtuals: true });
  delete o.password;
  delete o.googleId;
  delete o.tokenVersion;
  delete o.failedLoginCount;
  delete o.lockUntil;
  delete o.id;
  if (o.twoFactor) o.twoFactor = { enabled: o.twoFactor.enabled };
  if (!includeAdminFields) {
    delete o.uid;
    delete o.statusReason;
  }
  return o;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
