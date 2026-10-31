import mongoose from 'mongoose';
import { USAGE_METRICS, QUOTA_PERIODS } from '../../shared/constants/index.js';

const { Schema } = mongoose;

const creditsShape = Object.fromEntries(
  ['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search'].map((k) => [k, { type: Number, default: 0 }]),
);

const planSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    audience: { type: String, enum: ['employer', 'candidate'], required: true, index: true },
    tier: { type: String, enum: ['free', 'starter', 'professional', 'enterprise', 'booster', 'custom'], default: 'starter' },
    description: String,
    highlights: [String],
    price: { type: Number, required: true, min: 0 }, // INR, exclusive of GST
    mrp: Number,
    currency: { type: String, default: 'INR' },
    gstPercent: { type: Number, default: 18 },
    durationDays: { type: Number, required: true, min: 1 },
    credits: creditsShape,
    features: {
      resumeDbAccess: { type: Boolean, default: false },
      unlimitedJobs: { type: Boolean, default: false },
      featuredJobs: { type: Boolean, default: false },
      contactUnlock: { type: Boolean, default: false },
      advancedAnalytics: { type: Boolean, default: false },
      bulkUpload: { type: Boolean, default: false },
      profileBoost: { type: Boolean, default: false }, // candidate
      featuredProfile: { type: Boolean, default: false }, // candidate
      priorityApplication: { type: Boolean, default: false }, // candidate
    },
    maxMembers: Number,
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true }, // false = custom plan only visible to customFor
    customFor: { organization: { type: Schema.Types.ObjectId, ref: 'Organization' }, user: { type: Schema.Types.ObjectId, ref: 'User' } },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const subscriptionSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    planSnapshot: {
      code: String,
      name: String,
      tier: String,
      audience: String,
      price: Number,
      durationDays: Number,
      credits: Schema.Types.Mixed,
      features: Schema.Types.Mixed,
    },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled', 'scheduled'], default: 'active', index: true },
    autoRenew: { type: Boolean, default: false },
    expiryReminderSentAt: Date,
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // admin assigned package
  },
  { timestamps: true },
);

const billingInfo = {
  name: String,
  gstin: String,
  address: String,
  city: String,
  state: String,
  stateCode: String,
  pincode: String,
  email: String,
  phone: String,
};

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    planName: String,
    amount: { type: Number, required: true }, // plan price (pre-tax)
    discount: { type: Number, default: 0 },
    couponCode: String,
    referralCode: String,
    taxable: Number,
    gst: { percent: Number, cgst: Number, sgst: Number, igst: Number, total: Number },
    walletUsed: { type: Number, default: 0 },
    total: { type: Number, required: true }, // payable incl. GST (after wallet)
    currency: { type: String, default: 'INR' },
    gateway: { type: String, enum: ['razorpay', 'wallet', 'free', 'manual'], default: 'razorpay' },
    gatewayOrderId: { type: String, index: true, sparse: true },
    gatewayPaymentId: String,
    paymentMethod: String, // upi / card / netbanking / wallet ...
    status: { type: String, enum: ['created', 'paid', 'failed', 'cancelled', 'refunded'], default: 'created', index: true },
    paidAt: Date,
    failureReason: String,
    billing: billingInfo,
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    isRenewal: { type: Boolean, default: false },
    createdByAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: String,
  },
  { timestamps: true },
);
orderSchema.index({ createdAt: -1, status: 1 });

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    seller: { name: String, gstin: String, address: String, stateCode: String },
    billing: billingInfo,
    lines: [{ description: String, sac: String, quantity: Number, rate: Number, amount: Number, _id: false }],
    subtotal: Number,
    discount: Number,
    taxable: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    walletUsed: Number,
    total: Number,
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: Number,
    minAmount: { type: Number, default: 0 },
    validFrom: Date,
    validTo: Date,
    usageLimit: Number,
    perUserLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    plans: [{ type: Schema.Types.ObjectId, ref: 'Plan' }],
    audience: { type: String, enum: ['employer', 'candidate', 'all'], default: 'all' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const couponRedemptionSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true },
);
couponRedemptionSchema.index({ coupon: 1, user: 1 });

const walletSchema = new Schema(
  {
    ownerKey: { type: String, required: true, unique: true }, // org:<id> | user:<id>
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

const walletTxnSchema = new Schema(
  {
    wallet: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: Number,
    reason: { type: String, required: true }, // topup, purchase, refund, referral_reward, admin_adjustment, auto_renew
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true },
);
walletTxnSchema.index({ wallet: 1, createdAt: -1 });

/** Per-member + per-org usage counters for quota enforcement and usage analytics. */
const usageCounterSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    member: { type: Schema.Types.ObjectId, ref: 'User' }, // null = organization total
    metric: { type: String, enum: USAGE_METRICS, required: true },
    period: { type: String, enum: QUOTA_PERIODS, required: true },
    key: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: false },
);
usageCounterSchema.index({ organization: 1, member: 1, metric: 1, period: 1, key: 1 }, { unique: true });

/** Credit ledger: every grant / consumption of organization credits. */
const creditLedgerSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User' },
    metric: String,
    change: Number,
    reason: String, // plan_purchase, consumed, admin_adjustment, expired
    ref: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
creditLedgerSchema.index({ organization: 1, createdAt: -1 });

export const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
export const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
export const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
export const CouponRedemption = mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', couponRedemptionSchema);
export const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
export const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTxnSchema);
export const UsageCounter = mongoose.models.UsageCounter || mongoose.model('UsageCounter', usageCounterSchema);
export const CreditLedger = mongoose.models.CreditLedger || mongoose.model('CreditLedger', creditLedgerSchema);
