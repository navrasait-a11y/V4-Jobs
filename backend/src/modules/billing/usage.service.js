import ApiError from '../../shared/errors/ApiError.js';
import { QUOTA_PERIODS } from '../../shared/constants/index.js';
import { periodKey } from '../../shared/utils/timespan.js';
import Organization from '../employers/organization.model.js';
import { UsageCounter, CreditLedger } from './billing.models.js';

/**
 * Two layers of limits for employer actions:
 *  1. Organization credits (bought through plans) - e.g. job_post, resume_view, invite.
 *  2. Member quotas set by the Employer Admin (or portal admin) - daily/weekly/monthly/... caps.
 * Both are enforced atomically; quota counters double as usage analytics.
 */

const UNLIMITED_FEATURE = { job_post: 'unlimitedJobs' };
const CREDIT_METRICS = new Set(['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search']);

/** Metrics that only count usage (no credit is deducted) but still respect member quotas. */
const FREE_METRICS = new Set(['resume_search', 'hiring', 'excel_download']);

export async function assertMemberQuota(member, metric, qty = 1) {
  const quotas = member?.employer?.quotas?.[metric];
  if (!quotas) return;
  const now = new Date();
  for (const period of QUOTA_PERIODS) {
    const limit = quotas[period];
    if (limit === undefined || limit === null) continue;
    const row = await UsageCounter.findOne({
      organization: member.employer.organization,
      member: member._id,
      metric,
      period,
      key: periodKey(period, now),
    }).lean();
    if ((row?.count || 0) + qty > limit) {
      throw ApiError.forbidden(
        `Your ${period} ${metric.replace('_', ' ')} limit (${limit}) has been reached. Contact your account admin.`,
        'MEMBER_QUOTA_EXCEEDED',
      );
    }
  }
}

export async function trackUsage(organizationId, memberId, metric, qty = 1) {
  const now = new Date();
  const ops = [];
  for (const period of QUOTA_PERIODS) {
    const key = periodKey(period, now);
    for (const member of [memberId || null, null]) {
      ops.push({ updateOne: { filter: { organization: organizationId, member, metric, period, key }, update: { $inc: { count: qty } }, upsert: true } });
      if (!memberId) break;
    }
  }
  await UsageCounter.bulkWrite(ops, { ordered: false });
}

/**
 * Consume organization credits + check member quota. Throws 402 when credits are exhausted.
 * Returns the remaining credit balance.
 */
export async function consume(member, metric, qty = 1, { ref, skipCredits = false } = {}) {
  const orgId = member.employer?.organization || member.organization;
  await assertMemberQuota(member, metric, qty);

  let remaining = null;
  const org = await Organization.findById(orgId).select('credits planFeatures planExpiresAt').lean();
  if (!org) throw ApiError.notFound('Organization not found');

  const unlimited = UNLIMITED_FEATURE[metric] && org.planFeatures?.[UNLIMITED_FEATURE[metric]] && (!org.planExpiresAt || org.planExpiresAt > new Date());
  if (!skipCredits && !unlimited && !FREE_METRICS.has(metric) && CREDIT_METRICS.has(metric)) {
    const updated = await Organization.findOneAndUpdate(
      { _id: orgId, [`credits.${metric}`]: { $gte: qty } },
      { $inc: { [`credits.${metric}`]: -qty } },
      { new: true, projection: { credits: 1 } },
    ).lean();
    if (!updated) {
      throw ApiError.paymentRequired(`You have no ${metric.replace(/_/g, ' ')} credits left. Please purchase a plan to continue.`, 'INSUFFICIENT_CREDITS');
    }
    remaining = updated.credits[metric];
    CreditLedger.create({ organization: orgId, member: member._id, metric, change: -qty, reason: 'consumed', ref }).catch(() => {});
  }
  await trackUsage(orgId, member._id, metric, qty);
  return { remaining };
}

/** Refund credits when an action fails after consumption. */
export async function refundCredits(organizationId, metric, qty = 1, ref) {
  await Organization.updateOne({ _id: organizationId }, { $inc: { [`credits.${metric}`]: qty } });
  await CreditLedger.create({ organization: organizationId, metric, change: qty, reason: 'refund', ref });
}

export async function grantCredits(organizationId, credits = {}, reason = 'plan_purchase', ref) {
  const inc = {};
  for (const [k, v] of Object.entries(credits)) if (v) inc[`credits.${k}`] = v;
  if (!Object.keys(inc).length) return;
  await Organization.updateOne({ _id: organizationId }, { $inc: inc });
  await CreditLedger.insertMany(
    Object.entries(credits)
      .filter(([, v]) => v)
      .map(([metric, change]) => ({ organization: organizationId, metric, change, reason, ref })),
  );
}

/** Usage report: { metric: { daily, weekly, monthly, quarterly, yearly } } for a member or the org. */
export async function usageReport(organizationId, memberId = null) {
  const now = new Date();
  const or = QUOTA_PERIODS.map((p) => ({ period: p, key: periodKey(p, now) }));
  const rows = await UsageCounter.find({ organization: organizationId, member: memberId, $or: or }).lean();
  const out = {};
  for (const r of rows) {
    out[r.metric] = out[r.metric] || {};
    out[r.metric][r.period] = r.count;
  }
  return out;
}

/** Per-member usage table for the Employer Admin "Account Member Usage Analytics". */
export async function memberUsage(organizationId, period = 'monthly') {
  const key = periodKey(period, new Date());
  return UsageCounter.aggregate([
    { $match: { organization: organizationId, member: { $ne: null }, period, key } },
    { $group: { _id: '$member', usage: { $push: { k: '$metric', v: '$count' } } } },
    { $project: { member: '$_id', usage: { $arrayToObject: '$usage' }, _id: 0 } },
    {
      $lookup: {
        from: 'users',
        localField: 'member',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { fullName: 1, email: 1, 'employer.memberRole': 1 } }],
      },
    },
    { $unwind: '$user' },
  ]);
}
