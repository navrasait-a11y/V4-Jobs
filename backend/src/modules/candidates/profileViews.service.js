import crypto from 'node:crypto';
import { ProfileAccess } from '../engagement/engagement.models.js';
import { Plan, Subscription } from '../billing/billing.models.js';
import Organization from '../employers/organization.model.js';
import User from '../users/user.model.js';
import Candidate from './candidate.model.js';
import { notify } from '../notifications/notification.service.js';

/**
 * "Who viewed your profile" (LinkedIn style).
 *  - Every recruiter view is logged once per recruiter per 24 h (ProfileAccess type "view").
 *  - Free: counts, trends and breakdowns for 90 days, the 3 most recent viewers by name; the rest locked.
 *  - Paid (plan feature profileViewers, or Profile Booster): every viewer for 365 days, recruiter names,
 *    filters. Locked rows never carry the company id or name, so nothing leaks through the API.
 *  - Recruiters in private mode always show as "A recruiter" with only industry / city hints.
 */
export const FREE_VISIBLE = 3;
const FREE_DAYS = 90;
const PAID_DAYS = 365;
const DAY = 86400000;
const SOURCES = ['search', 'application', 'invite', 'recommended', 'profile'];

/** Whether the candidate can see every viewer, and until when. */
export async function viewerAccess(userId) {
  const now = new Date();
  const sub = await Subscription.findOne({
    user: userId,
    status: 'active',
    endsAt: { $gt: now },
    $or: [{ 'planSnapshot.features.profileViewers': true }, { 'planSnapshot.features.profileBoost': true }],
  })
    .sort({ endsAt: -1 })
    .select('endsAt planSnapshot.name')
    .lean();
  return sub ? { premium: true, plan: sub.planSnapshot?.name, until: sub.endsAt } : { premium: false };
}

/**
 * Logs one recruiter view (deduped per recruiter per 24 h) and tells the candidate once per company per day.
 * Never throws: a failed log must not break opening a profile.
 */
export async function recordProfileView({ candidateId, member, source = 'search', jobId } = {}) {
  try {
    const orgId = member?.employer?.organization;
    if (!orgId || !candidateId || String(member._id) === String(candidateId)) return false;
    const since = new Date(Date.now() - DAY);
    const seen = await ProfileAccess.exists({ candidate: candidateId, member: member._id, type: 'view', createdAt: { $gte: since } });
    if (seen) return false;
    const companySeenToday = await ProfileAccess.exists({ candidate: candidateId, organization: orgId, type: 'view', createdAt: { $gte: since } });
    const anonymous = Boolean(member.employer?.privateBrowsing);
    await ProfileAccess.create({ organization: orgId, member: member._id, candidate: candidateId, type: 'view', source: SOURCES.includes(source) ? source : 'search', job: jobId, anonymous });
    await Candidate.updateOne({ user: candidateId }, { $inc: { 'stats.profileViews': 1 } });

    if (!companySeenToday) {
      const [org, access] = await Promise.all([Organization.findById(orgId).select('name type industries').lean(), viewerAccess(candidateId)]);
      const named = access.premium && !anonymous && org?.name;
      const kind = org?.type === 'consultancy' ? 'a consultancy' : org?.industries?.[0] ? `a ${org.industries[0]} company` : 'a company';
      notify(candidateId, {
        type: 'profile_viewed',
        title: named ? `${org.name} viewed your profile` : `A recruiter from ${kind} viewed your profile`,
        body: named ? 'See who else is looking at your profile' : 'See who viewed your profile and how often',
        data: { screen: 'profile_views', link: '/candidate/profile-views' },
        channels: ['in_app', 'push'],
      });
    }
    return true;
  } catch {
    return false;
  }
}

const key = (userId, org, member) => crypto.createHash('sha1').update(`${userId}:${org}:${member}`).digest('hex').slice(0, 16);
const cityOf = (org) => (org?.offices || []).find((o) => o.isPrimary)?.city || org?.offices?.[0]?.city || '';

function series(rows, from, days) {
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  const step = days > 120 ? 7 : 1;
  const out = [];
  for (let t = from.getTime(); t <= Date.now(); t += step * DAY) {
    let count = 0;
    for (let d = 0; d < step; d += 1) count += byDay.get(new Date(t + d * DAY).toISOString().slice(0, 10)) || 0;
    out.push({ date: new Date(t).toISOString().slice(0, 10), count });
  }
  return { points: out, bucket: step === 7 ? 'week' : 'day' };
}

/** The cheapest candidate plan that unlocks every viewer (shown in the upsell). */
async function upgradePlan() {
  const p = await Plan.findOne({ audience: 'candidate', isActive: true, price: { $gt: 0 }, $or: [{ 'features.profileViewers': true }, { 'features.profileBoost': true }] })
    .sort({ price: 1 })
    .select('code name price durationDays')
    .lean();
  return p || null;
}

/**
 * Viewer list + insights for the signed-in candidate.
 * q: { days = 30, type = all|company|consultancy, page = 1, limit = 20 }
 */
export async function listProfileViews(userId, q = {}) {
  const access = await viewerAccess(userId);
  const maxDays = access.premium ? PAID_DAYS : FREE_DAYS;
  const days = Math.min(Math.max(Number(q.days) || 30, 7), maxDays);
  const from = new Date(Date.now() - days * DAY);
  from.setUTCHours(0, 0, 0, 0);
  const prevFrom = new Date(from.getTime() - days * DAY);
  const match = { candidate: userId, type: 'view', createdAt: { $gte: from } };

  const [groups, prevTotal, daily, profile] = await Promise.all([
    ProfileAccess.aggregate([
      { $match: match },
      {
        $group: {
          _id: { org: '$organization', member: '$member' },
          count: { $sum: 1 },
          last: { $max: '$createdAt' },
          first: { $min: '$createdAt' },
          sources: { $addToSet: '$source' },
          jobs: { $addToSet: '$job' },
          anonymous: { $max: '$anonymous' },
        },
      },
      { $sort: { last: -1 } },
      { $limit: 2000 },
    ]),
    ProfileAccess.countDocuments({ candidate: userId, type: 'view', createdAt: { $gte: prevFrom, $lt: from } }),
    ProfileAccess.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }]),
    Candidate.findOne({ user: userId }).select('stats').lean(),
  ]);

  const orgIds = [...new Set(groups.map((g) => String(g._id.org)))];
  const memberIds = [...new Set(groups.map((g) => String(g._id.member)))];
  const [orgs, members] = await Promise.all([
    Organization.find({ _id: { $in: orgIds } }).select('name logo slug username type employerType industries offices isVerified employeeCount').lean(),
    User.find({ _id: { $in: memberIds } }).select('fullName avatar employer.designation').lean(),
  ]);
  const orgMap = new Map(orgs.map((o) => [String(o._id), o]));
  const memberMap = new Map(members.map((m) => [String(m._id), m]));

  // Insights for everyone (no identities): totals, change, company types, industries, sources.
  const total = groups.reduce((a, g) => a + g.count, 0);
  const byType = { company: 0, consultancy: 0 };
  const industries = new Map();
  const bySource = {};
  for (const g of groups) {
    const o = orgMap.get(String(g._id.org));
    byType[o?.type === 'consultancy' ? 'consultancy' : 'company'] += g.count;
    if (o?.industries?.[0]) industries.set(o.industries[0], (industries.get(o.industries[0]) || 0) + g.count);
    for (const s of g.sources.filter(Boolean)) bySource[s] = (bySource[s] || 0) + 1;
  }

  const wanted = q.type === 'company' || q.type === 'consultancy' ? q.type : 'all';
  // Free visibility counts only named viewers (private-mode recruiters are always shown as anonymous).
  let named = 0;
  const all = groups
    .map((g) => ({ g, i: g.anonymous ? -1 : named++ })).filter(({ g }) => wanted === 'all' || (orgMap.get(String(g._id.org))?.type === 'consultancy' ? 'consultancy' : 'company') === wanted);
  const page = Math.max(Number(q.page) || 1, 1);
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50);
  const pageRows = all.slice((page - 1) * limit, page * limit);

  const viewers = pageRows.map(({ g, i }) => {
    const o = orgMap.get(String(g._id.org)) || {};
    const m = memberMap.get(String(g._id.member)) || {};
    const base = {
      key: key(userId, g._id.org, g._id.member),
      lastViewedAt: g.last,
      firstViewedAt: g.first,
      count: g.count,
      sources: g.sources.filter(Boolean),
      hint: { type: o.type === 'consultancy' ? 'consultancy' : 'company', industry: o.industries?.[0] || '', city: cityOf(o), size: o.employeeCount || '' },
    };
    if (g.anonymous) return { ...base, anonymous: true, locked: false };
    if (!access.premium && i >= FREE_VISIBLE) return { ...base, locked: true };
    return {
      ...base,
      locked: false,
      organization: { name: o.name, logo: o.logo?.url || '', slug: o.slug || o.username, type: o.type, employerType: o.employerType, isVerified: Boolean(o.isVerified) },
      // Recruiter names are a paid detail, like LinkedIn Premium.
      recruiter: access.premium ? { name: m.fullName, designation: m.employer?.designation || '', avatar: m.avatar?.url || '' } : null,
    };
  });

  const locked = access.premium ? 0 : Math.max(0, groups.filter((g) => !g.anonymous).length - FREE_VISIBLE);
  return {
    access: { ...access, visibleLimit: access.premium ? null : FREE_VISIBLE, days, maxDays, upgrade: access.premium ? null : await upgradePlan() },
    summary: {
      total,
      previousTotal: prevTotal,
      change: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
      viewers: groups.length,
      companies: orgIds.length,
      lifetime: profile?.stats?.profileViews || 0,
      searchAppearances: profile?.stats?.searchAppearances || 0,
      byType,
      bySource,
      industries: [...industries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      trend: series(daily, from, days),
      locked,
    },
    viewers,
    meta: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
  };
}
