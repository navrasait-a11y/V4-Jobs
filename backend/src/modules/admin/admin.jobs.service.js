import ApiError from '../../shared/errors/ApiError.js';
import { JOB_STATUS, ROLES } from '../../shared/constants/index.js';
import { escapeRegex, omit } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import Job from '../jobs/job.model.js';
import Organization from '../employers/organization.model.js';
import User from '../users/user.model.js';
import { Application } from '../applications/application.model.js';
import { JobInvite } from '../engagement/engagement.models.js';
import { createJob, publishJob, syncActiveJobCount, bulkImportJobs } from '../jobs/job.service.js';
import { notify, sendEmail } from '../notifications/notification.service.js';
import { notifyFollowersOfJob } from '../employers/employer.service.js';
import config from '../../config/env.js';

export function jobFilter(q) {
  const f = { ...dateRangeFilter(q) };
  f.status = q.status ? q.status : { $ne: JOB_STATUS.TRASHED };
  if (q.kind) f.kind = q.kind;
  if (q.organizationType) f.organizationType = q.organizationType;
  if (q.organization) f.organization = q.organization;
  if (q.source) f.source = q.source;
  if (q.label) f.labels = q.label;
  if (q.featured !== undefined) f.isFeatured = q.featured;
  if (q.city) f['locations.city'] = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
  if (q.department) f.departments = q.department;
  if (q.q) {
    const t = q.q.trim();
    f.$or = /^(JOBS|INTE)-/i.test(t)
      ? [{ uid: t.toUpperCase() }]
      : [
          { title: new RegExp(escapeRegex(t), 'i') },
          { 'orgSnapshot.name': new RegExp(escapeRegex(t), 'i') },
          { 'consultancyClient.name': new RegExp(escapeRegex(t), 'i') },
        ];
  }
  return f;
}

export async function jobStats(q) {
  const range = dateRangeFilter(q);
  const [byStatus, bySource, byOrgType] = await Promise.all([
    Job.aggregate([{ $match: range }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Job.aggregate([{ $match: range }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Job.aggregate([
      { $match: { ...range, status: { $ne: 'trashed' } } },
      { $group: { _id: { type: '$organizationType', kind: '$kind' }, count: { $sum: 1 } } },
    ]),
  ]);
  const s = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
  return {
    all: Object.values(s).reduce((a, b) => a + b, 0) - (s.trashed || 0),
    active: s.active || 0,
    pending: s.pending || 0,
    adminReview: s.admin_review || 0,
    expired: s.expired || 0,
    closed: s.closed || 0,
    draft: s.draft || 0,
    rejected: s.rejected || 0,
    trashed: s.trashed || 0,
    excelImported: bySource.find((x) => x._id === 'excel_import')?.count || 0,
    byEmployerType: byOrgType.map((x) => ({ organizationType: x._id.type, kind: x._id.kind, count: x.count })),
  };
}

export async function listJobs(q, { page, limit, skip, sort }) {
  const f = jobFilter(q);
  const [items, total] = await Promise.all([
    Job.find(f).sort(sort).skip(skip).limit(limit).select('-description -responsibilities -questions').populate('postedBy', 'fullName email').lean(),
    Job.countDocuments(f),
  ]);
  return { items, total, page, limit };
}

export async function getJob(id) {
  const job = await Job.findById(id).populate('postedBy', 'fullName email mobile').populate('organization', 'name uid type status').lean();
  if (!job) throw ApiError.notFound('Job not found');
  return job;
}

/** Post a job / internship on behalf of an employer (no credits consumed). */
export async function postOnBehalf(admin, { organizationId, publish, ...data }) {
  const org = await Organization.findById(organizationId).select('owner').lean();
  if (!org) throw ApiError.notFound('Employer not found');
  const owner = await User.findById(org.owner);
  const job = await createJob(owner, data, { orgId: organizationId, source: 'admin', adminId: admin._id });
  return publish ? publishJob(admin, job._id, { featured: data.featured, skipCredits: true }) : job;
}

export async function updateJob(admin, id, data) {
  const job = await Job.findById(id);
  if (!job) throw ApiError.notFound('Job not found');
  const prev = job.status;
  job.set(omit(data, ['uid', 'organization', 'stats', 'slug', 'orgSnapshot']));
  if (data.status === JOB_STATUS.ACTIVE && !job.publishedAt) job.publishedAt = new Date();
  if (data.labels) job.isFeatured = data.labels.includes('featured');
  await job.save();
  if (prev !== job.status) await onJobStatusChange(job, prev, data.statusReason);
  return job;
}

async function onJobStatusChange(job, prev, reason) {
  await syncActiveJobCount(job.organization);
  if (job.status === JOB_STATUS.ACTIVE && [JOB_STATUS.PENDING, JOB_STATUS.ADMIN_REVIEW].includes(prev)) {
    notify(job.postedBy, {
      type: 'job_approved',
      title: 'Your job is live',
      body: job.title,
      data: { screen: 'employer_job', jobId: String(job._id) },
      channels: ['in_app', 'push', 'email'],
    });
    notifyFollowersOfJob(job).catch(() => {});
  }
  if (job.status === JOB_STATUS.REJECTED) {
    notify(job.postedBy, {
      type: 'job_rejected',
      title: 'Your job post was not approved',
      body: reason || job.title,
      data: { screen: 'employer_job', jobId: String(job._id) },
      channels: ['in_app', 'push', 'email'],
    });
  }
}

export async function bulkJobAction(admin, ids, action, value) {
  const map = {
    approve: { status: JOB_STATUS.ACTIVE },
    unapprove: { status: JOB_STATUS.PENDING },
    admin_review: { status: JOB_STATUS.ADMIN_REVIEW },
    reject: { status: JOB_STATUS.REJECTED },
    close: { status: JOB_STATUS.CLOSED, closedAt: new Date() },
    expire: { status: JOB_STATUS.EXPIRED },
    trash: { status: JOB_STATUS.TRASHED, deletedAt: new Date() },
    restore: { status: JOB_STATUS.DRAFT },
  };
  let updated = 0;
  for (const id of ids) {
    const job = await Job.findById(id);
    if (!job) continue;
    const prev = job.status;
    if (map[action]) job.set(map[action]);
    else if (action === 'feature') {
      job.isFeatured = true;
      job.labels = [...new Set([...(job.labels || []), 'featured'])];
    } else if (action === 'unfeature') {
      job.isFeatured = false;
      job.labels = (job.labels || []).filter((l) => l !== 'featured');
    } else if (action === 'label_add') job.labels = [...new Set([...(job.labels || []), value])];
    else if (action === 'label_remove') job.labels = (job.labels || []).filter((l) => l !== value);
    else if (action === 'edit') job.set(omit(value || {}, ['uid', 'organization', 'stats', 'slug', 'status']));
    else if (action === 'delete') {
      if (job.status !== JOB_STATUS.TRASHED) continue;
      await job.deleteOne();
      updated += 1;
      continue;
    } else throw ApiError.badRequest('Unknown action');
    if (job.status === JOB_STATUS.ACTIVE && !job.publishedAt) job.publishedAt = new Date();
    if (action === 'approve') job.refreshedAt = new Date();
    await job.save();
    if (prev !== job.status) await onJobStatusChange(job, prev);
    updated += 1;
  }
  return { updated };
}

export async function duplicateJob(admin, id) {
  const job = await Job.findById(id).lean();
  if (!job) throw ApiError.notFound('Job not found');
  const owner = await User.findById(job.postedBy);
  return createJob(owner, { prefillFrom: job._id, title: job.title }, { orgId: job.organization, source: 'admin', adminId: admin._id });
}

export async function importJobs(admin, organizationId, buffer, publish) {
  const org = await Organization.findById(organizationId).select('owner').lean();
  if (!org) throw ApiError.notFound('Employer not found');
  const owner = await User.findById(org.owner);
  return bulkImportJobs(owner, buffer, { orgId: organizationId, publish, adminId: admin._id });
}

/** Admin bulk invite (no credits) excluding already invited / applied candidates. */
export async function adminInvite(admin, jobId, candidateIds, message) {
  const job = await Job.findOne({ _id: jobId, status: JOB_STATUS.ACTIVE }).lean();
  if (!job) throw ApiError.badRequest('Invites can only be sent for active jobs');
  const [invited, applied] = await Promise.all([JobInvite.distinct('candidate', { job: jobId }), Application.distinct('candidate', { job: jobId })]);
  const exclude = new Set([...invited, ...applied].map(String));
  const users = await User.find({ _id: { $in: candidateIds.filter((c) => !exclude.has(String(c))) }, role: ROLES.CANDIDATE, status: 'active' })
    .select('fullName email')
    .lean();
  if (users.length) {
    await JobInvite.insertMany(
      users.map((u) => ({ job: jobId, organization: job.organization, candidate: u._id, invitedBy: admin._id, message })),
      { ordered: false },
    ).catch(() => {});
    await Job.updateOne({ _id: jobId }, { $inc: { 'stats.invites': users.length } });
  }
  for (const u of users) {
    notify(u._id, {
      type: 'job_invite',
      title: `You are invited to apply: ${job.title}`,
      body: job.orgSnapshot?.name,
      data: { screen: 'job', jobId: String(job._id), slug: job.slug },
      channels: ['in_app', 'push'],
    });
    if (u.email)
      sendEmail({
        to: u.email,
        template: 'jobInvite',
        vars: { name: u.fullName, jobTitle: job.title, company: job.orgSnapshot?.name, url: `${config.urls.web}/jobs/${job.slug}`, message },
        category: 'bulk',
        user: u._id,
      }).catch(() => {});
  }
  return { invited: users.length, skipped: candidateIds.length - users.length };
}

export const JOB_EXPORT_COLUMNS = [
  { header: 'Job ID', key: 'uid' },
  { header: 'Type', key: 'kind' },
  { header: 'Title', key: 'title' },
  { header: 'Employer', key: 'orgSnapshot.name' },
  { header: 'Employer Type', key: 'organizationType' },
  { header: 'Client Name', key: 'consultancyClient.name' },
  { header: 'Posted By', key: 'postedBy.fullName' },
  { header: 'Locations', key: 'loc', get: (r) => (r.locations || []).map((l) => l.city).join(', ') },
  { header: 'Experience', key: 'exp', get: (r) => `${r.experience?.min ?? 0}-${r.experience?.max ?? ''}` },
  { header: 'Salary', key: 'sal', get: (r) => `${r.salary?.min ?? ''}-${r.salary?.max ?? ''}` },
  { header: 'Openings', key: 'openings' },
  { header: 'Key Skills', key: 'keySkills' },
  { header: 'Departments', key: 'departments' },
  { header: 'Status', key: 'status' },
  { header: 'Labels', key: 'labels' },
  { header: 'Views', key: 'stats.views' },
  { header: 'Applications', key: 'stats.applications' },
  { header: 'Source', key: 'source' },
  { header: 'Published', key: 'publishedAt' },
  { header: 'Deadline', key: 'deadlineAt' },
  { header: 'Expires', key: 'expiresAt' },
];
