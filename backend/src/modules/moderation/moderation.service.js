import ApiError from '../../shared/errors/ApiError.js';
import { ROLES, REPORT_REASONS } from '../../shared/constants/index.js';
import { escapeRegex } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { isAdmin } from '../../shared/middleware/auth.js';
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import Organization from '../employers/organization.model.js';
import { Report, Comment, UserBlock, Blocklist } from './moderation.models.js';
import { emitToRoom, ADMIN_ROOM } from '../../shared/realtime/socket.js';

/* ------------------------------------------------------------- reports */

export async function createReport(reporter, { targetType, targetId, reason, details, contact }) {
  if (!REPORT_REASONS[targetType]?.includes(reason)) throw ApiError.badRequest('Invalid reason for this report type', undefined, 'INVALID_REASON');
  if (reason === 'other' && !details) throw ApiError.badRequest('Please describe the issue', undefined, 'DETAILS_REQUIRED');
  const doc = {
    reporter: reporter?._id,
    reporterRole: reporter?.role || 'guest',
    reporterContact: reporter ? undefined : contact,
    targetType,
    reason,
    details,
  };
  if (targetType === 'job') {
    const job = await Job.findById(targetId).select('organization').lean();
    if (!job) throw ApiError.notFound('Job not found');
    Object.assign(doc, { job: targetId, organization: job.organization });
  } else if (targetType === 'organization') {
    if (!(await Organization.exists({ _id: targetId }))) throw ApiError.notFound('Employer not found');
    doc.organization = targetId;
  } else {
    if (!(await User.exists({ _id: targetId, role: ROLES.CANDIDATE }))) throw ApiError.notFound('Candidate not found');
    doc.candidate = targetId;
  }
  if (
    reporter &&
    (await Report.exists({
      reporter: reporter._id,
      targetType,
      job: doc.job,
      organization: doc.organization,
      candidate: doc.candidate,
      status: { $in: ['open', 'in_review'] },
    }))
  ) {
    throw ApiError.conflict('You have already reported this. Our team is reviewing it', 'ALREADY_REPORTED');
  }
  const report = await Report.create(doc);
  emitToRoom(ADMIN_ROOM, 'report:new', { reportId: report._id, targetType });
  return report;
}

export function reportFilter(q) {
  const f = { ...dateRangeFilter(q) };
  for (const k of ['targetType', 'status', 'reason']) if (q[k]) f[k] = q[k];
  if (q.organization) f.organization = q.organization;
  return f;
}

export async function listReports(q, { page, limit, skip, sort }) {
  const f = reportFilter(q);
  const [items, total] = await Promise.all([
    Report.find(f)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('reporter', 'fullName email role')
      .populate('job', 'title uid')
      .populate('organization', 'name uid type')
      .populate('candidate', 'fullName uid email')
      .lean(),
    Report.countDocuments(f),
  ]);
  return { items, total, page, limit };
}

export async function updateReport(admin, id, { status, adminNotes }) {
  const report = await Report.findByIdAndUpdate(
    id,
    { $set: { status, adminNotes, ...(['resolved', 'dismissed'].includes(status) ? { resolvedBy: admin._id, resolvedAt: new Date() } : {}) } },
    { new: true },
  );
  if (!report) throw ApiError.notFound('Report not found');
  return report;
}

/* ------------------------------------------------------------ comments */

export async function addComment(user, { targetType, targetId, body, rating }) {
  const doc = {
    author: user._id,
    authorRole: user.role,
    authorOrganization: user.employer?.organization,
    targetType,
    body,
    rating,
    isAdminComment: isAdmin(user),
    status: isAdmin(user) ? 'approved' : 'pending',
  };
  if (targetType === 'candidate') {
    if (user.role === ROLES.CANDIDATE) throw ApiError.forbidden('Candidates can comment on employers only');
    if (!(await User.exists({ _id: targetId, role: ROLES.CANDIDATE }))) throw ApiError.notFound('Candidate not found');
    doc.targetUser = targetId;
  } else {
    if (user.role === ROLES.EMPLOYER) throw ApiError.forbidden('Employers can comment on candidates only');
    const org = await Organization.findById(targetId).select('type').lean();
    if (!org) throw ApiError.notFound('Employer not found');
    doc.targetOrganization = targetId;
    doc.targetOrgType = org.type;
  }
  return Comment.create(doc);
}

export async function publicComments(targetType, targetId, { page, limit, skip }) {
  const f = { targetType, status: 'approved', ...(targetType === 'candidate' ? { targetUser: targetId } : { targetOrganization: targetId }) };
  const [items, total] = await Promise.all([
    Comment.find(f)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'fullName displayName avatar')
      .populate('authorOrganization', 'name logo')
      .select('-moderatedBy')
      .lean(),
    Comment.countDocuments(f),
  ]);
  return { items, total, page, limit };
}

export async function myComments(user, { page, limit, skip }) {
  const f = { author: user._id, status: { $ne: 'trashed' } };
  const [items, total] = await Promise.all([Comment.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Comment.countDocuments(f)]);
  return { items, total, page, limit };
}

export async function deleteOwnComment(user, id) {
  const res = await Comment.updateOne({ _id: id, author: user._id }, { $set: { status: 'trashed' } });
  if (!res.matchedCount) throw ApiError.notFound('Comment not found');
}

/**
 * Admin filters: direction=employer_to_candidate | candidate_to_employer, status, mine (admin comments),
 * targetOrgType=company|consultancy, timespan.
 */
export async function adminComments(admin, q, { page, limit, skip, sort }) {
  const f = { ...dateRangeFilter(q) };
  if (q.direction === 'employer_to_candidate') f.targetType = 'candidate';
  if (q.direction === 'candidate_to_employer') f.targetType = 'organization';
  if (q.status) f.status = q.status;
  if (q.mine) f.author = admin._id;
  if (q.adminOnly) f.isAdminComment = true;
  if (q.targetOrgType) f.targetOrgType = q.targetOrgType;
  if (q.q) f.body = new RegExp(escapeRegex(q.q), 'i');
  const [items, total, counts] = await Promise.all([
    Comment.find(f)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('author', 'fullName email role')
      .populate('targetUser', 'fullName uid')
      .populate('targetOrganization', 'name uid type')
      .lean(),
    Comment.countDocuments(f),
    Comment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return { items, total, page, limit, counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) };
}

export async function moderateComments(admin, ids, status) {
  const res = await Comment.updateMany({ _id: { $in: ids } }, { $set: { status, moderatedBy: admin._id } });
  return { updated: res.modifiedCount };
}

/* -------------------------------------------------------------- blocks */

/** Candidate blocks an employer (their profile & jobs become invisible to each other). */
export async function candidateBlockOrg(user, organizationId, reason) {
  if (!(await Organization.exists({ _id: organizationId }))) throw ApiError.notFound('Employer not found');
  await UserBlock.updateOne({ blockerUser: user._id, targetType: 'organization', targetOrganization: organizationId }, { $set: { reason } }, { upsert: true });
  return { blocked: true };
}

export async function candidateUnblockOrg(user, organizationId) {
  await UserBlock.deleteOne({ blockerUser: user._id, targetType: 'organization', targetOrganization: organizationId });
  return { blocked: false };
}

export async function myBlocks(user) {
  const filter = user.role === ROLES.EMPLOYER ? { blockerOrganization: user.employer.organization } : { blockerUser: user._id };
  return UserBlock.find(filter).populate('targetOrganization', 'name logo slug').populate('targetUser', 'fullName avatar').sort({ createdAt: -1 }).lean();
}

/* ----------------------------------------------------------- blocklist */

export const listBlocklist = async ({ type, q, page, limit, skip }) => {
  const f = { ...(type ? { type } : {}), ...(q ? { value: new RegExp(escapeRegex(q.toLowerCase())) } : {}) };
  const [items, total] = await Promise.all([
    Blocklist.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('createdBy', 'fullName').lean(),
    Blocklist.countDocuments(f),
  ]);
  return { items, total, page, limit };
};

export async function addBlocklist(admin, entries) {
  const ops = entries.map((e) => ({
    updateOne: { filter: { type: e.type, value: e.value.trim().toLowerCase() }, update: { $set: { reason: e.reason, createdBy: admin._id } }, upsert: true },
  }));
  const res = await Blocklist.bulkWrite(ops, { ordered: false });
  return { added: res.upsertedCount, updated: res.modifiedCount };
}

export const removeBlocklist = (id) => Blocklist.deleteOne({ _id: id });
