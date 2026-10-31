import { resolveTimespan, daysAgo } from '../../shared/utils/timespan.js';
import { ROLES, USER_STATUS } from '../../shared/constants/index.js';
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import Organization from '../employers/organization.model.js';
import { Application, Interview } from '../applications/application.model.js';
import { ProfileAccess } from '../engagement/engagement.models.js';
import { Order } from '../billing/billing.models.js';
import { LoginAttempt } from '../auth/auth.models.js';
import { EmailLog, MessageLog } from '../notifications/notification.model.js';
import { Report } from '../moderation/moderation.models.js';
import { Conversation } from '../chat/chat.models.js';

const TZ = 'Asia/Kolkata';
const range = (q, defaultDays = 30) => resolveTimespan(q) || { from: daysAgo(defaultDays), to: new Date() };
const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.count]));
const dailySeries = (Model, match, field = 'createdAt', valueExpr = { $sum: 1 }) =>
  Model.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ } }, count: valueExpr } },
    { $sort: { _id: 1 } },
  ]);

/* ---------------------------------------------------------------- employer */

export async function employerAnalytics(orgId, q) {
  const { from, to } = range(q);
  const created = { $gte: from, $lte: to };
  const [jobs, trend, funnel, sources, productivity, interviews, topJobs] = await Promise.all([
    Job.aggregate([
      { $match: { organization: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 }, views: { $sum: '$stats.views' }, applications: { $sum: '$stats.applications' } } },
    ]),
    dailySeries(Application, { organization: orgId, createdAt: created }),
    Application.aggregate([{ $match: { organization: orgId, createdAt: created } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { organization: orgId, createdAt: created } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Application.aggregate([
      { $match: { organization: orgId, updatedAt: created } },
      { $unwind: '$history' },
      { $match: { 'history.at': created, 'history.by': { $ne: null } } },
      {
        $group: {
          _id: '$history.by',
          actions: { $sum: 1 },
          hires: { $sum: { $cond: [{ $eq: ['$history.to', 'hired'] }, 1, 0] } },
          shortlists: { $sum: { $cond: [{ $eq: ['$history.to', 'screened'] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'u',
          pipeline: [{ $match: { role: ROLES.EMPLOYER } }, { $project: { fullName: 1, email: 1 } }],
        },
      },
      { $unwind: '$u' },
      { $project: { member: '$u', actions: 1, hires: 1, shortlists: 1, _id: 0 } },
      { $sort: { actions: -1 } },
    ]),
    Interview.aggregate([{ $match: { organization: orgId, scheduledAt: created } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Job.find({ organization: orgId, status: { $in: ['active', 'closed', 'expired'] } })
      .select('title uid kind status stats publishedAt')
      .sort({ 'stats.applications': -1 })
      .limit(10)
      .lean(),
  ]);
  const jobsPosted = await Job.aggregate([{ $match: { organization: orgId, createdAt: created } }, { $group: { _id: '$postedBy', count: { $sum: 1 } } }]);
  const postedMap = new Map(jobsPosted.map((j) => [String(j._id), j.count]));
  const totalViews = jobs.reduce((a, j) => a + j.views, 0);
  const totalApps = jobs.reduce((a, j) => a + j.applications, 0);
  return {
    range: { from, to },
    jobs: { byStatus: toMap(jobs), totalViews, totalApplications: totalApps, viewToApplyRate: totalViews ? +((totalApps / totalViews) * 100).toFixed(2) : 0 },
    applicationTrend: trend,
    hiringFunnel: toMap(funnel),
    sourceTracking: toMap(sources),
    interviews: toMap(interviews),
    recruiterProductivity: productivity.map((p) => ({ ...p, jobsPosted: postedMap.get(String(p.member._id)) || 0 })),
    jobPerformance: topJobs.map((j) => ({ ...j, conversion: j.stats.views ? +((j.stats.applications / j.stats.views) * 100).toFixed(2) : 0 })),
  };
}

/* --------------------------------------------------------------- candidate */

export async function candidateAnalytics(userId, q) {
  const { from, to } = range(q);
  const created = { $gte: from, $lte: to };
  const [profile, views, downloads, apps, viewedByEmployer, viewers, skillDemand] = await Promise.all([
    Candidate.findOne({ user: userId }).select('stats keySkills profileCompletion').lean(),
    dailySeries(ProfileAccess, { candidate: userId, type: 'view', createdAt: created }),
    ProfileAccess.countDocuments({ candidate: userId, type: 'resume_download', createdAt: created }),
    Application.aggregate([{ $match: { candidate: userId, createdAt: created } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Application.countDocuments({ candidate: userId, createdAt: created, isViewed: true }),
    ProfileAccess.aggregate([
      { $match: { candidate: userId, type: 'view', createdAt: created } },
      { $group: { _id: '$organization', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      { $sort: { last: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org', pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }] } },
      { $unwind: '$org' },
    ]),
    // Skill trends: demand for the candidate's skills in currently active jobs
    Job.aggregate([
      { $match: { status: 'active', publishedAt: { $gte: daysAgo(90) } } },
      { $unwind: '$keySkills' },
      { $group: { _id: '$keySkills', jobs: { $sum: 1 } } },
      { $sort: { jobs: -1 } },
      { $limit: 25 },
    ]),
  ]);
  const totalApps = apps.reduce((a, s) => a + s.count, 0);
  const mySkills = new Set((profile?.keySkills || []).map((s) => s.toLowerCase()));
  return {
    range: { from, to },
    profileViews: { total: views.reduce((a, d) => a + d.count, 0), daily: views, lifetime: profile?.stats?.profileViews || 0 },
    resumeDownloads: { total: downloads, lifetime: profile?.stats?.resumeDownloads || 0 },
    searchAppearances: profile?.stats?.searchAppearances || 0,
    applicationPerformance: {
      total: totalApps,
      byStage: toMap(apps),
      viewedByRecruiters: viewedByEmployer,
      viewRate: totalApps ? +((viewedByEmployer / totalApps) * 100).toFixed(2) : 0,
    },
    recentViewers: viewers.map((v) => ({ organization: v.org, views: v.count, lastViewedAt: v.last })),
    skillTrends: skillDemand.map((s) => ({ skill: s._id, activeJobs: s.jobs, youHaveIt: mySkills.has(String(s._id).toLowerCase()) })),
    profileCompletion: profile?.profileCompletion || 0,
  };
}

/* ------------------------------------------------------------------- admin */

export async function adminDashboard(q) {
  const { from, to } = range(q);
  const created = { $gte: from, $lte: to };
  const [usersByRole, orgs, jobs, applications, revenue, newUsers, openReports, openSupport, pendingKyc, pendingJobs] = await Promise.all([
    User.aggregate([{ $match: { status: { $ne: USER_STATUS.TRASHED } } }, { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } }]),
    Organization.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 } } }]),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.countDocuments({ createdAt: created }),
    Order.aggregate([{ $match: { status: 'paid', paidAt: created } }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
    User.aggregate([{ $match: { createdAt: created } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    Report.countDocuments({ status: { $in: ['open', 'in_review'] } }),
    Conversation.countDocuments({ type: 'support', status: 'open' }),
    Organization.countDocuments({ kycStatus: 'under_review' }),
    Job.countDocuments({ status: { $in: ['pending', 'admin_review'] } }),
  ]);
  const roleStatus = {};
  for (const r of usersByRole) {
    roleStatus[r._id.role] = roleStatus[r._id.role] || { total: 0 };
    roleStatus[r._id.role][r._id.status] = r.count;
    roleStatus[r._id.role].total += r.count;
  }
  const orgStats = { company: { total: 0 }, consultancy: { total: 0 } };
  for (const o of orgs) {
    orgStats[o._id.type][o._id.status] = o.count;
    orgStats[o._id.type].total += o.count;
  }
  return {
    range: { from, to },
    users: roleStatus,
    employers: orgStats,
    jobs: toMap(jobs),
    applicationsInRange: applications,
    revenue: revenue[0] || { revenue: 0, orders: 0 },
    newUsers: toMap(newUsers),
    pending: { reports: openReports, supportChats: openSupport, kycReviews: pendingKyc, jobReviews: pendingJobs },
  };
}

/** "All User Login Statistics" with timespan. */
export async function loginStats(q) {
  const { from, to } = range(q, 1);
  const created = { $gte: from, $lte: to };
  const [rows, daily] = await Promise.all([
    LoginAttempt.aggregate([
      { $match: { createdAt: created } },
      { $group: { _id: { role: '$role', employerType: '$employerType', success: '$success' }, count: { $sum: 1 } } },
    ]),
    dailySeries(LoginAttempt, { createdAt: created }),
  ]);
  const out = { totalAttempts: 0, successful: 0, failed: 0, admin: 0, candidates: 0, companies: 0, consultancies: 0, unknown: 0, daily };
  for (const r of rows) {
    out.totalAttempts += r.count;
    if (r._id.success) out.successful += r.count;
    else out.failed += r.count;
    const role = r._id.role;
    if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) out.admin += r.count;
    else if (role === ROLES.CANDIDATE) out.candidates += r.count;
    else if (role === ROLES.EMPLOYER) out[r._id.employerType === 'consultancy' ? 'consultancies' : 'companies'] += r.count;
    else out.unknown += r.count;
  }
  return out;
}

/** Admin analytics: revenue, growth, conversion, traffic, category performance. */
export async function adminAnalytics(q) {
  const { from, to } = range(q, 90);
  const created = { $gte: from, $lte: to };
  const [revenueDaily, revenueByPlan, growth, categoryPerf, jobViews, candidatesTotal, candidatesApplied, employersTotal, employersPaid, topSkills, topCities] =
    await Promise.all([
      dailySeries(Order, { status: 'paid', paidAt: created }, 'paidAt', { $sum: '$total' }),
      Order.aggregate([
        { $match: { status: 'paid', paidAt: created } },
        { $group: { _id: '$planName', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: created } },
        { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, role: '$role' }, count: { $sum: 1 } } },
        { $sort: { '_id.d': 1 } },
      ]),
      Job.aggregate([
        { $match: { publishedAt: created } },
        { $unwind: { path: '$departments', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$departments', 'Other'] },
            jobs: { $sum: 1 },
            applications: { $sum: '$stats.applications' },
            views: { $sum: '$stats.views' },
          },
        },
        { $sort: { applications: -1 } },
        { $limit: 25 },
      ]),
      Job.aggregate([
        { $group: { _id: null, views: { $sum: '$stats.views' }, applications: { $sum: '$stats.applications' }, shares: { $sum: '$stats.shares' } } },
      ]),
      User.countDocuments({ role: ROLES.CANDIDATE, createdAt: created }),
      Application.distinct('candidate', { createdAt: created }).then((x) => x.length),
      Organization.countDocuments({ createdAt: created }),
      Order.distinct('organization', { status: 'paid', paidAt: created, total: { $gt: 0 }, organization: { $ne: null } }).then((x) => x.length),
      Job.aggregate([
        { $match: { status: 'active' } },
        { $unwind: '$keySkills' },
        { $group: { _id: '$keySkills', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      Job.aggregate([
        { $match: { status: 'active' } },
        { $unwind: '$locations' },
        { $group: { _id: '$locations.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);
  return {
    range: { from, to },
    revenue: { daily: revenueDaily, byPlan: revenueByPlan, total: revenueDaily.reduce((a, d) => a + d.count, 0) },
    userGrowth: growth.map((g) => ({ date: g._id.d, role: g._id.role, count: g.count })),
    conversion: {
      candidatesRegistered: candidatesTotal,
      candidatesApplied,
      employersRegistered: employersTotal,
      employersPaid,
      employerPaidRate: employersTotal ? +((employersPaid / employersTotal) * 100).toFixed(2) : 0,
    },
    traffic: jobViews[0] || { views: 0, applications: 0, shares: 0 },
    jobCategoryPerformance: categoryPerf,
    topSkills,
    topCities,
  };
}

/** "Postman SMTP statistics": all / sent / failed / draft / trash e-mails + SMS/WhatsApp. */
export async function messagingStats(q) {
  const { from, to } = range(q);
  const created = { $gte: from, $lte: to };
  const [emails, messages, daily] = await Promise.all([
    EmailLog.aggregate([{ $match: { createdAt: created } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    MessageLog.aggregate([{ $match: { createdAt: created } }, { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } }]),
    dailySeries(EmailLog, { createdAt: created }),
  ]);
  const e = toMap(emails);
  const channels = {};
  for (const m of messages) {
    channels[m._id.channel] = channels[m._id.channel] || {};
    channels[m._id.channel][m._id.status] = m.count;
  }
  return {
    emails: {
      all: Object.values(e).reduce((a, b) => a + b, 0),
      sent: (e.sent || 0) + (e.delivered || 0) + (e.opened || 0) + (e.clicked || 0),
      delivered: (e.delivered || 0) + (e.opened || 0) + (e.clicked || 0),
      opened: (e.opened || 0) + (e.clicked || 0),
      bounced: e.bounced || 0,
      blocked: e.blocked || 0,
      spam: e.spam || 0,
      failed: e.failed || 0,
      queued: e.queued || 0,
      draft: e.draft || 0,
      trash: e.trashed || 0,
      daily,
    },
    channels,
  };
}

/** Usage report for one employer / candidate (admin "User Usage Reports"). */
export async function userUsage(userId) {
  const user = await User.findById(userId).select('role employer').lean();
  if (!user) return null;
  if (user.role === ROLES.CANDIDATE) return candidateAnalytics(user._id, { timespan: '12m' });
  return employerAnalytics(user.employer.organization, { timespan: '12m' });
}
