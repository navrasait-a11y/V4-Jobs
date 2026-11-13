import Job from '../jobs/job.model.js';
import Organization from '../employers/organization.model.js';
import { Report } from '../moderation/moderation.models.js';

const DAY = 24 * 3600 * 1000;

/**
 * Phrases that, in Indian job-scam reports, almost always mean the candidate is asked to pay.
 * Kept specific on purpose: "salary", "fees reimbursed" or "no fee" must not trip it.
 */
export const MONEY_PATTERNS = [
  /registration\s*(fee|charges?|amount)/i,
  /security\s*(deposit|amount|money)/i,
  /(processing|training|joining|interview|document(ation)?|form|kit|uniform|verification|id\s*card)\s*(fee|charges?)/i,
  /refundable\s*(deposit|amount|fee)/i,
  // "pay / deposit Rs 500 to get / to confirm / before joining" - the candidate is the one paying.
  /(candidates?|you|applicants?)\s+(have\s+to|must|need\s+to|should|will\s+have\s+to)\s+(pay|deposit|transfer|send)\b/i,
  /(pay|deposit|transfer)\s+(rs\.?|inr|₹)\s*\d[\d,]*\s*(to\s+(get|confirm|book|reserve|join|apply)|before\s+(joining|the\s+interview|interview)|as\s+(fee|deposit))/i,
  /advance\s*(payment|amount)\s*(of|rs|inr|₹|\d)/i,
  // A payment handle given to the candidate, not a brand name in the job text.
  /(send|pay|transfer)\b[^.]{0,40}\b(upi\s*id|paytm\s*(no|number)|phone\s*pe\s*(no|number)|gpay\s*(no|number)|google\s*pay\s*(no|number))/i,
  /\b[\w.-]{3,}@(ok(axis|hdfcbank|icici|sbi)|ybl|paytm|ibl|axl|upi)\b/i,
];
/** Cheap pre-filter run inside MongoDB: any of these words makes a job worth a closer look. */
const MONEY_HINT = /fee|charge|deposit|pay|transfer|upi|advance|@ok|@ybl|@paytm/i;

const FREE_HINTS = /\b(no|zero|nil|without)\s+(registration\s+)?(fee|charges?|deposit)\b|\bfree\s+of\s+cost\b/i;

/** The first money-asking phrase in a text, or null. "No registration fee" style lines are ignored. */
export function moneyPhrase(text) {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (!plain) return null;
  for (const rx of MONEY_PATTERNS) {
    const m = plain.match(rx);
    if (!m) continue;
    const around = plain.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
    if (FREE_HINTS.test(around)) continue;
    return around.trim();
  }
  return null;
}

/**
 * PRD "Fraud detection": things an admin should look at today, each with the record to open.
 *  - live or pending jobs that ask candidates for money
 *  - one GST number used by several employer accounts
 *  - employers and jobs with several open reports
 *  - accounts that posted an unusual number of jobs in the last 24 hours
 */
export async function riskSignals() {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since1 = new Date(Date.now() - DAY);

  const [recentJobs, sharedGst, reportedOrgs, reportedJobs, burst] = await Promise.all([
    // Mongo pre-filters on the cheap fee words; only those few jobs are checked in detail here.
    Job.find({
      status: { $in: ['active', 'pending', 'admin_review'] },
      updatedAt: { $gte: since30 },
      $or: ['title', 'description', 'responsibilities'].map((f) => ({ [f]: MONEY_HINT })),
    })
      .select('title description responsibilities orgSnapshot.name status slug')
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean(),
    Organization.aggregate([
      { $match: { gstNumber: { $nin: [null, ''] }, status: { $ne: 'trashed' } } },
      { $group: { _id: '$gstNumber', count: { $sum: 1 }, orgs: { $push: { _id: '$_id', name: '$name', uid: '$uid', status: '$status' } } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    Report.aggregate([
      { $match: { status: { $in: ['open', 'in_review'] }, targetType: 'organization', organization: { $ne: null } } },
      { $group: { _id: '$organization', reports: { $sum: 1 }, reasons: { $addToSet: '$reason' }, last: { $max: '$createdAt' } } },
      { $match: { reports: { $gte: 2 } } },
      { $sort: { reports: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org', pipeline: [{ $project: { name: 1, uid: 1, status: 1 } }] } },
      { $unwind: '$org' },
    ]),
    Report.aggregate([
      { $match: { status: { $in: ['open', 'in_review'] }, targetType: 'job', job: { $ne: null } } },
      { $group: { _id: '$job', reports: { $sum: 1 }, reasons: { $addToSet: '$reason' }, last: { $max: '$createdAt' } } },
      { $match: { reports: { $gte: 2 } } },
      { $sort: { reports: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'job', pipeline: [{ $project: { title: 1, status: 1, slug: 1, 'orgSnapshot.name': 1 } }] } },
      { $unwind: '$job' },
    ]),
    Job.aggregate([
      { $match: { createdAt: { $gte: since1 } } },
      { $group: { _id: '$organization', jobs: { $sum: 1 } } },
      { $match: { jobs: { $gte: 15 } } },
      { $sort: { jobs: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org', pipeline: [{ $project: { name: 1, uid: 1, status: 1, createdAt: 1 } }] } },
      { $unwind: '$org' },
    ]),
  ]);

  const moneyJobs = [];
  for (const j of recentJobs) {
    const phrase = moneyPhrase(`${j.title} ${j.description || ''} ${j.responsibilities || ''}`);
    if (phrase) moneyJobs.push({ _id: j._id, title: j.title, company: j.orgSnapshot?.name, status: j.status, slug: j.slug, phrase });
    if (moneyJobs.length >= 25) break;
  }

  const groups = [
    { key: 'money_jobs', severity: 'high', title: 'Jobs that may ask candidates for money', hint: 'Fees or deposits mentioned in the job text. Check and reject if it is a scam.', items: moneyJobs.map((j) => ({ id: String(j._id), label: j.title, sub: `${j.company || 'Unknown employer'} · "${j.phrase}"`, link: `/admin/jobs/${j._id}/edit`, status: j.status })) },
    { key: 'reported_jobs', severity: 'high', title: 'Jobs with several open reports', hint: 'Two or more candidates reported the same job.', items: reportedJobs.map((r) => ({ id: String(r._id), label: r.job.title, sub: `${r.reports} reports · ${r.reasons.slice(0, 3).join(', ').replace(/_/g, ' ')}`, link: `/admin/jobs/${r._id}/edit`, status: r.job.status })) },
    { key: 'reported_employers', severity: 'high', title: 'Employers with several open reports', hint: 'Look at the reports, then block or clear the employer.', items: reportedOrgs.map((r) => ({ id: String(r._id), label: r.org.name, sub: `${r.org.uid || ''} · ${r.reports} reports · ${r.reasons.slice(0, 3).join(', ').replace(/_/g, ' ')}`, link: `/admin/employers/${r._id}`, status: r.org.status })) },
    { key: 'shared_gst', severity: 'medium', title: 'One GST number on several employer accounts', hint: 'Often a duplicate sign-up; sometimes someone using another company\'s GSTIN.', items: sharedGst.map((g) => ({ id: g._id, label: g._id, sub: g.orgs.map((o) => o.name).join(', '), link: `/admin/employers/${g.orgs[0]._id}`, count: g.count })) },
    { key: 'job_burst', severity: 'medium', title: 'Unusually many jobs in the last 24 hours', hint: '15 or more jobs from one employer in a day. Fine for big hiring drives, common for spam.', items: burst.map((b) => ({ id: String(b._id), label: b.org.name, sub: `${b.jobs} jobs in 24 hours · ${b.org.uid || ''}`, link: `/admin/employers/${b._id}`, status: b.org.status })) },
  ];
  return { generatedAt: new Date(), total: groups.reduce((a, g) => a + g.items.length, 0), groups };
}
