import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import config from '../../config/env.js';
import logger from '../../config/logger.js';
import ApiError from '../../shared/errors/ApiError.js';
import { hmacSha256, safeEqual } from '../../shared/utils/crypto.js';
import { gstStateCode } from '../../shared/utils/gstin.js';
import { generateUid } from '../../shared/models/counter.model.js';
import { ID_PREFIX, ROLES } from '../../shared/constants/index.js';
import Organization from '../employers/organization.model.js';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import { getSetting } from '../settings/settings.service.js';
import { notify } from '../notifications/notification.service.js';
import { grantCredits } from './usage.service.js';
import { Plan, Subscription, Order, Invoice, Coupon, CouponRedemption, Wallet, WalletTransaction } from './billing.models.js';

const round2 = (n) => Math.round(n * 100) / 100;
let razorpay = null;
function rzp() {
  if (!config.razorpay.keyId) throw ApiError.badRequest('Online payments are not configured', undefined, 'PAYMENTS_DISABLED');
  if (!razorpay) razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return razorpay;
}

/* ------------------------------------------------------------------ owners */

/** Employers buy for their organization, candidates for themselves. */
export function ownerOf(user) {
  if (user.role === ROLES.EMPLOYER) return { organization: user.employer.organization, ownerKey: `org:${user.employer.organization}`, audience: 'employer' };
  return { user: user._id, ownerKey: `user:${user._id}`, audience: 'candidate' };
}

/* ------------------------------------------------------------------- plans */

export async function listPlans(user, audience) {
  const aud = audience || (user ? ownerOf(user).audience : 'employer');
  const or = [{ isPublic: true }];
  if (user) {
    const owner = ownerOf(user);
    if (owner.organization) or.push({ 'customFor.organization': owner.organization });
    if (owner.user) or.push({ 'customFor.user': owner.user });
  }
  return Plan.find({ audience: aud, isActive: true, $or: or }).sort({ sortOrder: 1, price: 1 }).lean();
}

/* ------------------------------------------------------------------ wallet */

export async function getWallet(ownerKey, ids = {}) {
  return Wallet.findOneAndUpdate({ ownerKey }, { $setOnInsert: { ownerKey, ...ids, balance: 0 } }, { upsert: true, new: true });
}

export async function walletCredit(ownerKey, amount, reason, { order, by, note, ids } = {}) {
  const wallet = await getWallet(ownerKey, ids);
  const updated = await Wallet.findByIdAndUpdate(wallet._id, { $inc: { balance: amount } }, { new: true });
  await WalletTransaction.create({ wallet: wallet._id, type: 'credit', amount, balanceAfter: updated.balance, reason, order, by, note });
  return updated;
}

export async function walletDebit(ownerKey, amount, reason, { order, by, note } = {}) {
  const updated = await Wallet.findOneAndUpdate({ ownerKey, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
  if (!updated) throw ApiError.paymentRequired('Insufficient wallet balance', 'WALLET_INSUFFICIENT');
  await WalletTransaction.create({ wallet: updated._id, type: 'debit', amount, balanceAfter: updated.balance, reason, order, by, note });
  return updated;
}

export async function walletSummary(user, { page, limit, skip }) {
  const owner = ownerOf(user);
  const wallet = await getWallet(owner.ownerKey, { organization: owner.organization, user: owner.user });
  const [items, total] = await Promise.all([
    WalletTransaction.find({ wallet: wallet._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments({ wallet: wallet._id }),
  ]);
  return { balance: wallet.balance, transactions: { items, total, page, limit } };
}

/* ----------------------------------------------------------------- pricing */

async function resolveCoupon(code, { plan, userId, audience }) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true }).lean();
  const now = new Date();
  if (!coupon) throw ApiError.badRequest('Invalid coupon code', undefined, 'COUPON_INVALID');
  if ((coupon.validFrom && coupon.validFrom > now) || (coupon.validTo && coupon.validTo < now))
    throw ApiError.badRequest('Coupon has expired', undefined, 'COUPON_EXPIRED');
  if (coupon.audience !== 'all' && coupon.audience !== audience) throw ApiError.badRequest('Coupon is not applicable', undefined, 'COUPON_NOT_APPLICABLE');
  if (coupon.plans?.length && !coupon.plans.some((p) => String(p) === String(plan._id)))
    throw ApiError.badRequest('Coupon is not valid for this plan', undefined, 'COUPON_NOT_APPLICABLE');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw ApiError.badRequest('Coupon usage limit reached', undefined, 'COUPON_EXHAUSTED');
  if (plan.price < (coupon.minAmount || 0)) throw ApiError.badRequest(`Minimum order of Rs ${coupon.minAmount} required`, undefined, 'COUPON_MIN_AMOUNT');
  const used = await CouponRedemption.countDocuments({ coupon: coupon._id, user: userId });
  if (coupon.perUserLimit && used >= coupon.perUserLimit) throw ApiError.badRequest('You have already used this coupon', undefined, 'COUPON_USED');
  let discount = coupon.type === 'percent' ? (plan.price * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return { coupon, discount: round2(Math.min(discount, plan.price)) };
}

/**
 * Place of supply for GST: what the buyer gave at checkout, else their GSTIN, else the state of
 * their office (employers) or current location (candidates). Unknown -> undefined, which is taxed
 * as the seller's own state.
 */
async function buyerStateCode(owner, billing = {}) {
  if (billing.stateCode) return billing.stateCode;
  if (billing.gstin) return billing.gstin.slice(0, 2);
  if (billing.state && gstStateCode(billing.state)) return gstStateCode(billing.state);
  if (owner.organization) {
    const org = await Organization.findById(owner.organization).select('gstNumber offices.state offices.isPrimary').lean();
    if (org?.gstNumber) return org.gstNumber.slice(0, 2);
    const office = org?.offices?.find((o) => o.isPrimary) || org?.offices?.[0];
    return gstStateCode(office?.state);
  }
  const profile = await Candidate.findOne({ user: owner.user }).select('currentLocation.state').lean();
  return gstStateCode(profile?.currentLocation?.state);
}

/**
 * Price breakdown with GST. Intra-state (same state code as the seller) -> CGST + SGST,
 * inter-state -> IGST.
 */
export async function quote(user, { planId, couponCode, referralCode, useWallet = false, billing = {} }) {
  const plan = await Plan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  const owner = ownerOf(user);
  if (plan.audience !== owner.audience) throw ApiError.badRequest('This plan is not available for your account type');

  let discount = 0;
  let coupon = null;
  if (couponCode) ({ coupon, discount } = await resolveCoupon(couponCode, { plan, userId: user._id, audience: owner.audience }));

  let referrer = null;
  if (referralCode && !coupon) {
    referrer = await User.findOne({ referralCode: referralCode.toUpperCase() }).select('_id').lean();
    if (!referrer || String(referrer._id) === String(user._id)) throw ApiError.badRequest('Invalid referral code', undefined, 'REFERRAL_INVALID');
    const hasPaid = await Order.exists({ buyer: user._id, status: 'paid', total: { $gt: 0 } });
    if (hasPaid) throw ApiError.badRequest('Referral codes are valid on the first purchase only', undefined, 'REFERRAL_NOT_ELIGIBLE');
    discount = round2(plan.price * 0.1);
  }

  const taxable = round2(plan.price - discount);
  const gstPercent = plan.gstPercent ?? (await getSetting('payments.gstPercent', 18));
  const gstTotal = round2((taxable * gstPercent) / 100);
  const stateCode = await buyerStateCode(owner, billing);
  const intra = !stateCode || stateCode === config.billing.stateCode;
  const gst = intra
    ? { percent: gstPercent, cgst: round2(gstTotal / 2), sgst: round2(gstTotal / 2), igst: 0, total: gstTotal }
    : { percent: gstPercent, cgst: 0, sgst: 0, igst: gstTotal, total: gstTotal };
  const gross = round2(taxable + gstTotal);

  let walletUsed = 0;
  if (useWallet && gross > 0) {
    const wallet = await getWallet(owner.ownerKey, { organization: owner.organization, user: owner.user });
    walletUsed = round2(Math.min(wallet.balance, gross));
  }
  return { plan, coupon, referrer, amount: plan.price, discount, taxable, gst, gross, walletUsed, total: round2(gross - walletUsed), stateCode };
}

/* ---------------------------------------------------------------- checkout */

export async function createOrder(user, body) {
  const q = await quote(user, body);
  const owner = ownerOf(user);
  const orderNumber = await generateUid(ID_PREFIX.order);
  const order = await Order.create({
    orderNumber,
    buyer: user._id,
    organization: owner.organization,
    plan: q.plan._id,
    planName: q.plan.name,
    amount: q.amount,
    discount: q.discount,
    couponCode: q.coupon?.code,
    referralCode: q.referrer ? body.referralCode.toUpperCase() : undefined,
    taxable: q.taxable,
    gst: q.gst,
    walletUsed: q.walletUsed,
    total: q.total,
    gateway: q.total === 0 ? (q.walletUsed ? 'wallet' : 'free') : 'razorpay',
    billing: { ...body.billing, ...(q.stateCode ? { stateCode: q.stateCode } : {}) },
    isRenewal: Boolean(body.isRenewal),
  });

  if (q.total === 0) {
    await fulfilOrder(order._id, { method: q.walletUsed ? 'wallet' : 'free' });
    return { order: await Order.findById(order._id).lean(), paymentRequired: false };
  }

  return openGatewayOrder(user, order, { description: q.plan.name, notes: { plan: q.plan.code } });
}

/**
 * Payment methods the admin left switched on (Settings > Payments), in Razorpay Checkout's
 * `method` shape. Paytm / PhonePe wallets are inside Razorpay's wallet method, so the wallet switch covers them.
 */
async function enabledMethods() {
  const m = await getSetting('payments.methods', {});
  if (m.razorpay === false) throw ApiError.badRequest('Online payments are switched off right now. Please try again later', undefined, 'PAYMENTS_DISABLED');
  const methods = { upi: m.upi !== false, card: m.card !== false, netbanking: m.netbanking !== false, wallet: m.wallet !== false };
  if (!Object.values(methods).some(Boolean)) throw ApiError.badRequest('No payment method is available right now', undefined, 'PAYMENTS_DISABLED');
  return methods;
}

/** Creates the Razorpay order for a saved Order and returns what Razorpay Checkout needs. */
async function openGatewayOrder(user, order, { description, notes = {} }) {
  let methods;
  let rzpOrder;
  try {
    methods = await enabledMethods();
    rzpOrder = await rzp().orders.create({
      amount: Math.round(order.total * 100),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: String(order._id), ...notes },
    });
  } catch (err) {
    // Nothing can be paid against this order, so it must not stay behind as "created".
    await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled', failureReason: 'gateway_unavailable' } });
    if (err instanceof ApiError) throw err;
    logger.error({ err: err?.error || err, orderId: order._id }, 'Razorpay order creation failed');
    throw new ApiError(502, 'Could not start the payment. Please try again in a moment', 'PAYMENT_GATEWAY_ERROR');
  }
  order.gatewayOrderId = rzpOrder.id;
  await order.save();
  return {
    order: order.toObject(),
    paymentRequired: true,
    razorpay: {
      keyId: config.razorpay.keyId,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      name: config.appName,
      description,
      prefill: { name: user.fullName, email: user.email, contact: user.mobile },
      methods,
    },
  };
}

/**
 * Wallet top-up: the user pays the amount as it is and it lands in the wallet. No GST is charged
 * here - tax is charged on the plan that the wallet balance later pays for.
 */
export async function createWalletTopup(user, { amount }) {
  const rule = { enabled: true, min: 100, max: 100000, ...(await getSetting('payments.walletTopup', {})) };
  if (!rule.enabled) throw ApiError.badRequest('Wallet top-up is not available right now', undefined, 'TOPUP_DISABLED');
  const value = round2(amount);
  if (value < rule.min || value > rule.max) throw ApiError.badRequest(`Enter an amount between Rs ${rule.min} and Rs ${rule.max}`, undefined, 'TOPUP_AMOUNT_INVALID');
  const owner = ownerOf(user);
  const order = await Order.create({
    orderNumber: await generateUid(ID_PREFIX.order),
    kind: 'wallet_topup',
    buyer: user._id,
    organization: owner.organization,
    planName: 'Wallet top-up',
    amount: value,
    discount: 0,
    taxable: 0,
    gst: { percent: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    total: value,
    gateway: 'razorpay',
  });
  return openGatewayOrder(user, order, { description: 'Wallet top-up', notes: { kind: 'wallet_topup' } });
}

/** Client-side confirmation after Razorpay Checkout success (webhook is the source of truth too). */
export async function verifyPayment(user, { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const order = await Order.findOne({ _id: orderId, buyer: user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'paid') return order;
  if (order.gatewayOrderId !== razorpayOrderId) throw ApiError.badRequest('Order mismatch', undefined, 'PAYMENT_MISMATCH');
  const expected = hmacSha256(config.razorpay.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  if (!safeEqual(expected, razorpaySignature)) {
    order.status = 'failed';
    order.failureReason = 'signature_mismatch';
    await order.save();
    throw ApiError.badRequest('Payment verification failed', undefined, 'PAYMENT_SIGNATURE_INVALID');
  }
  return fulfilOrder(order._id, { paymentId: razorpayPaymentId });
}

export async function handleWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret) throw ApiError.badRequest('Webhook not configured');
  const expected = hmacSha256(config.razorpay.webhookSecret, rawBody);
  if (!signature || !safeEqual(expected, signature)) throw ApiError.unauthorized('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
  const event = JSON.parse(rawBody.toString('utf8'));
  const payment = event.payload?.payment?.entity;
  const rzpOrderId = payment?.order_id || event.payload?.order?.entity?.id;
  if (!rzpOrderId) return { ignored: true };
  const order = await Order.findOne({ gatewayOrderId: rzpOrderId });
  if (!order) return { ignored: true };

  if (['payment.captured', 'order.paid'].includes(event.event)) {
    await fulfilOrder(order._id, { paymentId: payment?.id, method: payment?.method });
  } else if (event.event === 'payment.failed' && order.status === 'created') {
    order.status = 'failed';
    order.failureReason = payment?.error_description?.slice(0, 300);
    await order.save();
  } else if (event.event === 'refund.processed') {
    await markRefunded(order._id);
  }
  return { processed: true };
}

/**
 * Marks a paid order refunded (once). A refunded wallet top-up also takes the money back out of
 * the wallet - as much of it as is still there.
 */
export async function markRefunded(orderId, { note, by } = {}) {
  const order = await Order.findOneAndUpdate({ _id: orderId, status: 'paid' }, { $set: { status: 'refunded', ...(note ? { notes: note } : {}) } }, { new: true });
  if (!order) return Order.findById(orderId);
  if (order.kind === 'wallet_topup') {
    const ownerKey = order.organization ? `org:${order.organization}` : `user:${order.buyer}`;
    const wallet = await getWallet(ownerKey);
    const take = round2(Math.min(wallet.balance, order.amount));
    if (take > 0) {
      await walletDebit(ownerKey, take, 'refund', { order: order._id, by, note: 'Top-up refunded' }).catch((err) =>
        logger.error({ err, orderId }, 'Wallet reversal failed for refunded top-up'),
      );
    }
    if (take < order.amount) logger.warn({ orderId, refunded: order.amount, recovered: take }, 'Refunded top-up was already partly spent');
  }
  return order;
}

/**
 * Idempotent fulfilment: marks paid (once), debits wallet, creates subscription, grants credits /
 * features, records coupon redemption, rewards referrer, generates the GST invoice.
 */
export async function fulfilOrder(orderId, { paymentId, method } = {}) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: ['created', 'failed'] } },
    { $set: { status: 'paid', paidAt: new Date(), gatewayPaymentId: paymentId, paymentMethod: method } },
    { new: true },
  );
  if (!order) return Order.findById(orderId); // already fulfilled
  const ownerKey = order.organization ? `org:${order.organization}` : `user:${order.buyer}`;

  if (order.kind === 'wallet_topup') {
    await walletCredit(ownerKey, order.amount, 'topup', {
      order: order._id,
      note: 'Wallet top-up',
      ids: order.organization ? { organization: order.organization } : { user: order.buyer },
    });
    notify(order.buyer, {
      type: 'payment_success',
      title: 'Money added to wallet',
      body: `Rs ${order.amount} has been added to your wallet`,
      data: { screen: 'billing', orderId: String(order._id) },
      channels: ['in_app', 'push', 'email'],
    });
    return Order.findById(order._id).lean();
  }
  const plan = await Plan.findById(order.plan).lean();

  try {
    if (order.walletUsed > 0) await walletDebit(ownerKey, order.walletUsed, 'purchase', { order: order._id });
  } catch (err) {
    logger.error({ err, orderId }, 'Wallet debit failed during fulfilment');
  }

  await activateSubscription({ plan, organization: order.organization, user: order.organization ? undefined : order.buyer, order: order._id });

  if (order.couponCode) {
    const coupon = await Coupon.findOneAndUpdate({ code: order.couponCode }, { $inc: { usedCount: 1 } });
    if (coupon) await CouponRedemption.create({ coupon: coupon._id, user: order.buyer, order: order._id });
  }
  if (order.referralCode) {
    const referrer = await User.findOne({ referralCode: order.referralCode }).select('_id role employer').lean();
    const reward = await getSetting('referral.rewardAmount', 50);
    if (referrer && reward > 0) {
      const key = referrer.role === ROLES.EMPLOYER ? `org:${referrer.employer.organization}` : `user:${referrer._id}`;
      await walletCredit(key, reward, 'referral_reward', {
        order: order._id,
        ids: referrer.role === ROLES.EMPLOYER ? { organization: referrer.employer.organization } : { user: referrer._id },
      });
      notify(referrer._id, {
        type: 'referral_reward',
        title: 'Referral reward credited',
        body: `Rs ${reward} has been added to your wallet`,
        channels: ['in_app', 'push'],
      });
    }
  }

  await createInvoice(order);
  notify(order.buyer, {
    type: 'payment_success',
    title: 'Payment successful',
    body: `Your ${plan.name} plan is now active`,
    data: { screen: 'billing', orderId: String(order._id) },
    channels: ['in_app', 'push', 'email'],
  });
  return Order.findById(order._id).populate('invoice').lean();
}

export async function activateSubscription({ plan, organization, user, order, assignedBy, startsAt }) {
  const ownerFilter = organization ? { organization } : { user };
  // Add-on packs (resume views, featured jobs, ...) only add credits: the current plan stays as it is.
  if (plan.tier === 'addon') return activateAddon({ plan, ownerFilter, organization, order, assignedBy });
  const current = await Subscription.findOne({ ...ownerFilter, status: 'active', endsAt: { $gt: new Date() }, 'planSnapshot.tier': { $ne: 'addon' } }).sort({ endsAt: -1 });
  // Renewing the same plan extends from the current end date; a new plan starts now.
  const start = startsAt || (current && String(current.plan) === String(plan._id) ? current.endsAt : new Date());
  const endsAt = new Date(start.getTime() + plan.durationDays * 24 * 3600 * 1000);
  if (current && String(current.plan) !== String(plan._id)) {
    current.status = 'cancelled';
    await current.save();
  }
  const sub = await Subscription.create({
    ...ownerFilter,
    plan: plan._id,
    planSnapshot: {
      code: plan.code,
      name: plan.name,
      tier: plan.tier,
      audience: plan.audience,
      price: plan.price,
      durationDays: plan.durationDays,
      credits: plan.credits,
      features: plan.features,
    },
    order,
    startsAt: start,
    endsAt,
    status: 'active',
    assignedBy,
  });

  if (organization) {
    await grantCredits(organization, plan.credits || {}, 'plan_purchase', String(sub._id));
    const set = { activeSubscription: sub._id, planExpiresAt: endsAt };
    for (const f of ['resumeDbAccess', 'unlimitedJobs', 'advancedAnalytics', 'bulkUpload']) set[`planFeatures.${f}`] = Boolean(plan.features?.[f]);
    if (plan.maxMembers) set.maxMembers = plan.maxMembers;
    await Organization.updateOne({ _id: organization }, { $set: set, ...(plan.tier !== 'free' ? { $addToSet: { labels: 'premium' } } : {}) });
  } else if (user && plan.features?.profileBoost) {
    await Candidate.updateOne({ user }, { $set: { boostUntil: endsAt } });
    await User.updateOne({ _id: user }, { $addToSet: { labels: 'profile_booster' } });
  }
  return sub;
}

async function activateAddon({ plan, ownerFilter, organization, order, assignedBy }) {
  const now = new Date();
  const sub = await Subscription.create({
    ...ownerFilter,
    plan: plan._id,
    planSnapshot: { code: plan.code, name: plan.name, tier: plan.tier, audience: plan.audience, price: plan.price, durationDays: plan.durationDays, credits: plan.credits, features: plan.features },
    order,
    startsAt: now,
    endsAt: new Date(now.getTime() + plan.durationDays * 24 * 3600 * 1000),
    status: 'active',
    assignedBy,
  });
  if (organization) await grantCredits(organization, plan.credits || {}, 'addon_purchase', String(sub._id));
  return sub;
}

/** What the buyer typed at checkout, with blanks filled from their organization and account. */
async function billingDetails(billing, buyerId, organizationId) {
  const [buyer, org] = await Promise.all([
    User.findById(buyerId).select('fullName email mobile').lean(),
    organizationId ? Organization.findById(organizationId).select('name legalName gstNumber email phone offices').lean() : null,
  ]);
  const office = org?.offices?.[0];
  const known = {
    name: org?.legalName || org?.name || buyer?.fullName,
    gstin: org?.gstNumber,
    address: office?.address,
    city: office?.city,
    state: office?.state,
    pincode: office?.pincode,
    email: org?.email || buyer?.email,
    phone: org?.phone || buyer?.mobile,
  };
  const given = Object.fromEntries(Object.entries(billing || {}).filter(([, v]) => v));
  return { ...known, ...given };
}

async function createInvoice(order) {
  if (order.invoice) return;
  const number = await generateUid(ID_PREFIX.invoice);
  const invoice = await Invoice.create({
    number,
    order: order._id,
    buyer: order.buyer,
    organization: order.organization,
    seller: { name: config.billing.legalName, gstin: config.billing.gstin, address: config.billing.address, stateCode: config.billing.stateCode },
    billing: await billingDetails(order.billing, order.buyer, order.organization),
    lines: [{ description: order.planName, sac: '998365', quantity: 1, rate: order.amount, amount: order.amount }],
    subtotal: order.amount,
    discount: order.discount,
    taxable: order.taxable,
    cgst: order.gst?.cgst,
    sgst: order.gst?.sgst,
    igst: order.gst?.igst,
    walletUsed: order.walletUsed,
    total: round2((order.taxable || 0) + (order.gst?.total || 0)),
  });
  await Order.updateOne({ _id: order._id }, { $set: { invoice: invoice._id } });
}

/** Admin "Assign Packages" - grants a plan without payment (recorded as a manual order). */
export async function assignPlan(admin, { planId, organizationId, userId, note, startsAt }) {
  const plan = await Plan.findById(planId).lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  let buyer = userId;
  if (organizationId) buyer = (await Organization.findById(organizationId).select('owner').lean())?.owner;
  if (!buyer) throw ApiError.notFound('Account not found');
  const order = await Order.create({
    orderNumber: await generateUid(ID_PREFIX.order),
    buyer,
    organization: organizationId,
    plan: plan._id,
    planName: plan.name,
    amount: plan.price,
    discount: plan.price,
    taxable: 0,
    gst: { percent: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    total: 0,
    gateway: 'manual',
    status: 'paid',
    paidAt: new Date(),
    createdByAdmin: admin._id,
    notes: note,
  });
  const sub = await activateSubscription({
    plan,
    organization: organizationId,
    user: organizationId ? undefined : userId,
    order: order._id,
    assignedBy: admin._id,
    startsAt: startsAt ? new Date(startsAt) : undefined,
  });
  return { order, subscription: sub };
}

export async function grantFreePlan(organizationId) {
  const plan = await Plan.findOne({ audience: 'employer', tier: 'free', isActive: true }).sort({ sortOrder: 1 }).lean();
  if (!plan) return null;
  return activateSubscription({ plan, organization: organizationId });
}

/* -------------------------------------------------------------- read APIs */

export async function mySubscriptions(user) {
  const owner = ownerOf(user);
  const filter = owner.organization ? { organization: owner.organization } : { user: owner.user };
  const [subscriptions, org] = await Promise.all([
    Subscription.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
    owner.organization ? Organization.findById(owner.organization).select('credits planFeatures planExpiresAt').lean() : null,
  ]);
  return {
    active: subscriptions.find((s) => s.status === 'active' && s.endsAt > new Date() && s.planSnapshot?.tier !== 'addon') || null,
    addons: subscriptions.filter((s) => s.status === 'active' && s.endsAt > new Date() && s.planSnapshot?.tier === 'addon'),
    subscriptions,
    credits: org?.credits,
    features: org?.planFeatures,
    planExpiresAt: org?.planExpiresAt,
  };
}

export async function setAutoRenew(user, subscriptionId, autoRenew) {
  const owner = ownerOf(user);
  const res = await Subscription.findOneAndUpdate(
    { _id: subscriptionId, ...(owner.organization ? { organization: owner.organization } : { user: owner.user }) },
    { $set: { autoRenew } },
    { new: true },
  );
  if (!res) throw ApiError.notFound('Subscription not found');
  return res;
}

export async function myOrders(user, { page, limit, skip, status }) {
  const owner = ownerOf(user);
  const filter = owner.organization ? { organization: owner.organization } : { buyer: user._id };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('invoice', 'number total issuedAt').lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function getInvoice(user, invoiceId, { isAdmin = false } = {}) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (!isAdmin) {
    const owner = ownerOf(user);
    const mine = owner.organization ? String(invoice.organization) === String(owner.organization) : String(invoice.buyer) === String(user._id);
    if (!mine) throw ApiError.notFound('Invoice not found');
  }
  // Invoices issued before these details existed are completed for display, not rewritten.
  return {
    ...invoice,
    seller: { ...invoice.seller, gstin: invoice.seller?.gstin || config.billing.gstin, address: invoice.seller?.address || config.billing.address },
    billing: await billingDetails(invoice.billing, invoice.buyer, invoice.organization),
  };
}

/* ------------------------------------------------------- scheduled tasks */

/** Checkout windows that were opened and never paid: closed after a day so they stop looking pending. */
export async function cancelStaleOrders(olderThanHours = 24) {
  const res = await Order.updateMany(
    { status: 'created', gateway: 'razorpay', createdAt: { $lt: new Date(Date.now() - olderThanHours * 3600 * 1000) } },
    { $set: { status: 'cancelled', failureReason: 'not_paid' } },
  );
  return res.modifiedCount;
}

export async function processSubscriptionLifecycle() {
  const now = new Date();
  await cancelStaleOrders().catch((err) => logger.warn({ err }, 'Stale order cleanup failed'));
  // 1) expire
  const expired = await Subscription.find({ status: 'active', endsAt: { $lte: now } }).limit(1000);
  for (const sub of expired) {
    sub.status = 'expired';
    await sub.save();
    if (sub.organization) {
      const stillActive = await Subscription.exists({ organization: sub.organization, status: 'active', endsAt: { $gt: now }, 'planSnapshot.tier': { $ne: 'addon' } }); // add-on packs never keep plan features on
      if (!stillActive) {
        await Organization.updateOne(
          { _id: sub.organization },
          {
            $set: {
              'planFeatures.resumeDbAccess': false,
              'planFeatures.unlimitedJobs': false,
              'planFeatures.advancedAnalytics': false,
              'planFeatures.bulkUpload': false,
            },
            $unset: { activeSubscription: 1 },
            $pull: { labels: 'premium' },
          },
        );
      }
    } else if (sub.user) {
      await User.updateOne({ _id: sub.user }, { $pull: { labels: 'profile_booster' } });
    }
  }

  // 2) reminders 3 days before expiry + auto-renew from wallet
  const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const expiring = await Subscription.find({ status: 'active', endsAt: { $gt: now, $lte: soon }, expiryReminderSentAt: null })
    .populate('plan')
    .limit(1000);
  for (const sub of expiring) {
    const buyerId = sub.organization ? (await Organization.findById(sub.organization).select('owner').lean())?.owner : sub.user;
    if (!buyerId) continue;
    if (sub.autoRenew && sub.plan?.isActive) {
      try {
        const buyer = await User.findById(buyerId);
        const q = await quote(buyer, { planId: sub.plan._id, useWallet: true });
        if (q.total > 0) throw new Error('Wallet balance does not cover renewal');
        await createOrder(buyer, { planId: sub.plan._id, useWallet: true, isRenewal: true });
        sub.expiryReminderSentAt = now;
        await sub.save();
        continue;
      } catch (err) {
        logger.info({ err: err.message, sub: sub._id }, 'Auto-renew from wallet not possible, sending reminder');
      }
    }
    notify(buyerId, {
      type: 'subscription_expiry',
      title: 'Your plan is expiring soon',
      body: `${sub.planSnapshot?.name} expires on ${sub.endsAt.toDateString()}`,
      data: { screen: 'billing' },
      channels: ['in_app', 'push', 'email'],
      email: { template: 'subscriptionExpiry', vars: { planName: sub.planSnapshot?.name, date: sub.endsAt.toDateString(), url: `${config.urls.web}/${sub.organization ? 'employer/packages-billing' : 'candidate/billing'}` } },
    });
    sub.expiryReminderSentAt = now;
    await sub.save();
  }
  return { expired: expired.length, reminded: expiring.length };
}

export const isValidObjectId = (id) => mongoose.isValidObjectId(id);
