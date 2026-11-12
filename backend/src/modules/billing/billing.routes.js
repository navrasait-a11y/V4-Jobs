import { Router } from 'express';
import Joi from 'joi';
import { gstinSchema } from '../../shared/utils/gstin.js';
import validate from '../../shared/middleware/validate.js';
import { authenticate, optionalAuth, requireAdminPermission } from '../../shared/middleware/auth.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { objectId, idParam, pagination, timespan, exportFormat } from '../../shared/validators/common.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { exportRows } from '../../shared/utils/excel.js';
import ApiError from '../../shared/errors/ApiError.js';
import { audit } from '../activity/activity.service.js';
import * as c from './billing.controller.js';
import * as s from './billing.service.js';
import { Plan, Coupon, Order, Subscription, WalletTransaction } from './billing.models.js';

const billing = Joi.object({
  name: Joi.string().trim().max(200),
  gstin: gstinSchema('Invalid GSTIN. Please check all 15 characters'),
  address: Joi.string().trim().max(500),
  city: Joi.string().trim().max(100),
  state: Joi.string().trim().max(100),
  stateCode: Joi.string()
    .trim()
    .pattern(/^\d{2}$/),
  pincode: Joi.string().trim().max(10),
  email: Joi.string().email(),
  phone: Joi.string().max(15),
});
const checkoutBody = Joi.object({
  planId: objectId.required(),
  couponCode: Joi.string().trim().max(40),
  referralCode: Joi.string().trim().max(20),
  useWallet: Joi.boolean().default(false),
  billing: billing.default({}),
});

/* ------------------------------------------------------------------ users */

export const router = Router();
router.get('/plans', optionalAuth, validate({ query: Joi.object({ audience: Joi.string().valid('employer', 'candidate') }) }), c.plans);
router.use(authenticate);
router.post('/quote', validate({ body: checkoutBody }), c.quote);
router.post('/checkout', validate({ body: checkoutBody }), c.checkout);
router.post(
  '/verify',
  validate({
    body: Joi.object({
      orderId: objectId.required(),
      razorpayOrderId: Joi.string().required(),
      razorpayPaymentId: Joi.string().required(),
      razorpaySignature: Joi.string().required(),
    }),
  }),
  c.verify,
);
router.get('/subscriptions', c.subscriptions);
router.patch('/subscriptions/:id/auto-renew', validate({ params: idParam, body: Joi.object({ autoRenew: Joi.boolean().required() }) }), c.autoRenew);
router.get(
  '/orders',
  validate({ query: Joi.object({ ...pagination, status: Joi.string().valid('created', 'paid', 'failed', 'cancelled', 'refunded') }) }),
  c.orders,
);
router.get('/invoices/:id', validate({ params: idParam, query: Joi.object({ format: Joi.string().valid('json', 'html', 'pdf') }) }), c.invoice);
router.get('/wallet', validate({ query: Joi.object(pagination) }), c.wallet);
router.post('/wallet/topup', validate({ body: Joi.object({ amount: Joi.number().positive().precision(2).max(1000000).required() }) }), c.walletTopup);

/* ------------------------------------------------------------------ admin */

const planBody = Joi.object({
  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9_-]+$/)
    .max(60)
    .required(),
  name: Joi.string().trim().max(120).required(),
  audience: Joi.string().valid('employer', 'candidate').required(),
  tier: Joi.string().valid('free', 'starter', 'professional', 'enterprise', 'booster', 'addon', 'custom').default('starter'),
  description: Joi.string().max(2000).allow(''),
  highlights: Joi.array().items(Joi.string().max(200)).max(20),
  price: Joi.number().min(0).required(),
  mrp: Joi.number().min(0),
  gstPercent: Joi.number().min(0).max(28).default(18),
  durationDays: Joi.number().integer().min(1).max(3650).required(),
  credits: Joi.object(
    Object.fromEntries(
      ['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search'].map((k) => [
        k,
        Joi.number().integer().min(0),
      ]),
    ),
  ),
  features: Joi.object({
    resumeDbAccess: Joi.boolean(),
    unlimitedJobs: Joi.boolean(),
    featuredJobs: Joi.boolean(),
    contactUnlock: Joi.boolean(),
    advancedAnalytics: Joi.boolean(),
    bulkUpload: Joi.boolean(),
    profileBoost: Joi.boolean(),
    featuredProfile: Joi.boolean(),
    priorityApplication: Joi.boolean(),
    profileViewers: Joi.boolean(),
  }),
  maxMembers: Joi.number().integer().min(1).max(500),
  isActive: Joi.boolean().default(true),
  isPublic: Joi.boolean().default(true),
  customFor: Joi.object({ organization: objectId, user: objectId }),
  sortOrder: Joi.number().integer().default(0),
});
const couponBody = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9_-]+$/)
    .max(40)
    .required(),
  description: Joi.string().max(500).allow(''),
  type: Joi.string().valid('percent', 'flat').required(),
  value: Joi.number().min(0).required(),
  maxDiscount: Joi.number().min(0),
  minAmount: Joi.number().min(0).default(0),
  validFrom: Joi.date(),
  validTo: Joi.date(),
  usageLimit: Joi.number().integer().min(1),
  perUserLimit: Joi.number().integer().min(1).default(1),
  plans: Joi.array().items(objectId),
  audience: Joi.string().valid('employer', 'candidate', 'all').default('all'),
  isActive: Joi.boolean().default(true),
});

export const adminRouter = Router();
adminRouter.use(requireAdminPermission('payments.manage'));

adminRouter.get('/plans', async (req, res) =>
  ok(
    res,
    await Plan.find(req.query.audience ? { audience: req.query.audience } : {})
      .sort({ audience: 1, sortOrder: 1 })
      .lean(),
  ),
);
adminRouter.post('/plans', validate({ body: planBody }), async (req, res) => {
  const plan = await Plan.create(req.body);
  audit(req, { action: 'plan.create', entity: 'Plan', entityId: plan._id, changes: req.body });
  return created(res, plan);
});
adminRouter.patch(
  '/plans/:id',
  validate({ params: idParam, body: planBody.fork(['code', 'name', 'audience', 'price', 'durationDays'], (x) => x.optional()) }),
  async (req, res) => {
    const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!plan) throw ApiError.notFound('Plan not found');
    audit(req, { action: 'plan.update', entity: 'Plan', entityId: plan._id, changes: req.body });
    return ok(res, plan, 'Updated');
  },
);
adminRouter.delete('/plans/:id', validate({ params: idParam }), async (req, res) => {
  await Plan.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
  audit(req, { action: 'plan.deactivate', entity: 'Plan', entityId: req.params.id });
  return ok(res, null, 'Plan deactivated');
});

adminRouter.get('/coupons', validate({ query: Joi.object({ ...pagination, q: Joi.string().allow('') }) }), async (req, res) => {
  const p = parsePagination(req.query);
  const filter = req.query.q ? { code: new RegExp(`^${req.query.q.toUpperCase().replace(/[^A-Z0-9_-]/g, '')}`) } : {};
  const [items, total] = await Promise.all([Coupon.find(filter).sort(p.sort).skip(p.skip).limit(p.limit).lean(), Coupon.countDocuments(filter)]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
});
adminRouter.post('/coupons', validate({ body: couponBody }), async (req, res) => created(res, await Coupon.create(req.body)));
adminRouter.patch('/coupons/:id', validate({ params: idParam, body: couponBody.fork(['code', 'type', 'value'], (x) => x.optional()) }), async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return ok(res, coupon, 'Updated');
});
adminRouter.delete('/coupons/:id', validate({ params: idParam }), async (req, res) => {
  await Coupon.deleteOne({ _id: req.params.id });
  return ok(res, null, 'Deleted');
});

const orderQuery = Joi.object({
  ...pagination,
  ...timespan,
  status: Joi.string().valid('created', 'paid', 'failed', 'cancelled', 'refunded'),
  gateway: Joi.string().valid('razorpay', 'wallet', 'free', 'manual'),
  organization: objectId,
  buyer: objectId,
  q: Joi.string().allow(''),
  format: exportFormat,
});
function orderFilter(q) {
  const f = { ...dateRangeFilter(q) };
  for (const k of ['status', 'gateway', 'organization', 'buyer']) if (q[k]) f[k] = q[k];
  if (q.q) f.orderNumber = q.q.trim();
  return f;
}
adminRouter.get('/orders', validate({ query: orderQuery }), async (req, res) => {
  const p = parsePagination(req.query);
  const f = orderFilter(req.query);
  const [items, total, totals] = await Promise.all([
    Order.find(f)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('buyer', 'fullName email mobile')
      .populate('organization', 'name type uid')
      .populate('invoice', 'number')
      .lean(),
    Order.countDocuments(f),
    Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      { $group: { _id: null, revenue: { $sum: '$total' }, gst: { $sum: '$gst.total' }, count: { $sum: 1 } } },
    ]),
  ]);
  return ok(res, items, 'OK', {
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.ceil(total / p.limit),
    summary: totals[0] || { revenue: 0, gst: 0, count: 0 },
  });
});
adminRouter.get('/orders/export', validate({ query: orderQuery }), async (req, res) => {
  const rows = await Order.find(orderFilter(req.query))
    .sort({ createdAt: -1 })
    .limit(50000)
    .populate('buyer', 'fullName email mobile')
    .populate('organization', 'name uid')
    .populate('invoice', 'number')
    .lean();
  return exportRows(res, {
    format: req.query.format,
    filename: 'transactions',
    columns: [
      { header: 'Order No', key: 'orderNumber' },
      { header: 'Invoice No', key: 'invoice.number' },
      { header: 'Date', key: 'createdAt' },
      { header: 'Buyer', key: 'buyer.fullName' },
      { header: 'Email', key: 'buyer.email' },
      { header: 'Organization', key: 'organization.name' },
      { header: 'Plan', key: 'planName' },
      { header: 'Amount', key: 'amount' },
      { header: 'Discount', key: 'discount' },
      { header: 'GST', key: 'gst.total' },
      { header: 'Wallet Used', key: 'walletUsed' },
      { header: 'Total', key: 'total' },
      { header: 'Gateway', key: 'gateway' },
      { header: 'Method', key: 'paymentMethod' },
      { header: 'Status', key: 'status' },
    ],
    rows,
  });
});
adminRouter.patch(
  '/orders/:id/status',
  validate({
    params: idParam,
    body: Joi.object({ status: Joi.string().valid('paid', 'failed', 'cancelled', 'refunded').required(), note: Joi.string().max(500) }),
  }),
  async (req, res) => {
    if (req.body.status === 'paid') {
      const order = await s.fulfilOrder(req.params.id, { method: 'manual' });
      audit(req, { action: 'order.mark_paid', entity: 'Order', entityId: req.params.id });
      return ok(res, order, 'Order marked paid');
    }
    if (req.body.status === 'refunded') {
      const refunded = await s.markRefunded(req.params.id, { note: req.body.note, by: req.user._id });
      if (!refunded) throw ApiError.notFound('Order not found');
      if (refunded.status !== 'refunded') throw ApiError.badRequest('Only a paid order can be refunded', undefined, 'ORDER_NOT_PAID');
      audit(req, { action: 'order.refunded', entity: 'Order', entityId: req.params.id, changes: req.body });
      return ok(res, refunded, 'Order marked refunded');
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status, notes: req.body.note } }, { new: true });
    audit(req, { action: `order.${req.body.status}`, entity: 'Order', entityId: req.params.id, changes: req.body });
    return ok(res, order, 'Updated');
  },
);
adminRouter.get('/invoices/:id', validate({ params: idParam, query: Joi.object({ format: Joi.string().valid('json', 'html', 'pdf') }) }), c.invoice);

adminRouter.get(
  '/subscriptions',
  validate({ query: Joi.object({ ...pagination, status: Joi.string(), organization: objectId, user: objectId }) }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = {};
    for (const k of ['status', 'organization', 'user']) if (req.query[k]) f[k] = req.query[k];
    const [items, total] = await Promise.all([
      Subscription.find(f).sort(p.sort).skip(p.skip).limit(p.limit).populate('organization', 'name uid type').populate('user', 'fullName email uid').lean(),
      Subscription.countDocuments(f),
    ]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);
adminRouter.post(
  '/assign-plan',
  validate({
    body: Joi.object({ planId: objectId.required(), organizationId: objectId, userId: objectId, note: Joi.string().max(500), startsAt: Joi.date() }).xor(
      'organizationId',
      'userId',
    ),
  }),
  async (req, res) => {
    const result = await s.assignPlan(req.user, req.body);
    audit(req, { action: 'plan.assign', entity: 'Subscription', entityId: result.subscription._id, changes: req.body });
    return created(res, result, 'Package assigned');
  },
);
adminRouter.post(
  '/wallet/adjust',
  validate({
    body: Joi.object({
      organizationId: objectId,
      userId: objectId,
      type: Joi.string().valid('credit', 'debit').required(),
      amount: Joi.number().positive().required(),
      note: Joi.string().max(500),
    }).xor('organizationId', 'userId'),
  }),
  async (req, res) => {
    const key = req.body.organizationId ? `org:${req.body.organizationId}` : `user:${req.body.userId}`;
    const fn = req.body.type === 'credit' ? s.walletCredit : s.walletDebit;
    const wallet = await fn(key, req.body.amount, 'admin_adjustment', {
      by: req.user._id,
      note: req.body.note,
      ids: req.body.organizationId ? { organization: req.body.organizationId } : { user: req.body.userId },
    });
    audit(req, { action: 'wallet.adjust', entity: 'Wallet', entityId: wallet._id, changes: req.body });
    return ok(res, wallet, 'Wallet updated');
  },
);
const walletTxnQuery = Joi.object({
  ...pagination,
  ...timespan,
  type: Joi.string().valid('credit', 'debit'),
  reason: Joi.string().valid('topup', 'purchase', 'refund', 'referral_reward', 'admin_adjustment', 'auto_renew'),
});
adminRouter.get('/wallet/transactions', validate({ query: walletTxnQuery }), async (req, res) => {
  const p = parsePagination(req.query);
  const f = { ...dateRangeFilter(req.query) };
  for (const k of ['type', 'reason']) if (req.query[k]) f[k] = req.query[k];
  const [items, total] = await Promise.all([
    WalletTransaction.find(f)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate({ path: 'wallet', select: 'ownerKey balance organization user', populate: [{ path: 'organization', select: 'name uid' }, { path: 'user', select: 'fullName email uid' }] })
      .populate('by', 'fullName')
      .populate('order', 'orderNumber')
      .lean(),
    WalletTransaction.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
});
