import dns from 'node:dns/promises';
import config from '../../config/env.js';
import ApiError from '../../shared/errors/ApiError.js';
import { isValidGstin } from '../../shared/utils/gstin.js';
import { ROLES, USER_STATUS, DEFAULT_MEMBER_PERMISSIONS, EMPLOYER_PERMISSIONS } from '../../shared/constants/index.js';
import { putFile, deleteFile, signedUrl } from '../../shared/services/storage.service.js';
import { randomToken, sha256, randomPassword } from '../../shared/utils/crypto.js';
import { escapeRegex, normalizeEmail, normalizeMobile, pick, toArray, looseRegex } from '../../shared/utils/helpers.js';
import User from '../users/user.model.js';
import Organization from './organization.model.js';
import Job from '../jobs/job.model.js';
import { Follow } from '../engagement/engagement.models.js';
import { ActionToken, Session } from '../auth/auth.models.js';
import { assertIdentityAvailable, generateUsername, validateUsername } from '../users/account.service.js';
import { sendEmail, notifyMany } from '../notifications/notification.service.js';
import { usageReport, memberUsage } from '../billing/usage.service.js';
import { invalidateSessionCache } from '../../shared/middleware/auth.js';

const MAX_DOCUMENTS = 3;
const PUBLIC_ORG_FIELDS =
  'type name username slug logo coverPhoto employerType organizationType industries employeeCount foundedDate website about socialProfiles offices hiringStatus isVerified labels stats createdAt';

export async function getOrganization(orgId, { includePrivate = true } = {}) {
  const org = await Organization.findById(orgId)
    .select(includePrivate ? '-adminNotes -uid' : PUBLIC_ORG_FIELDS)
    .lean();
  if (!org) throw ApiError.notFound('Organization not found');
  if (includePrivate && org.documents) {
    org.documents = await Promise.all(
      org.documents.map(async (d) => ({ ...d, file: d.file ? { ...d.file, downloadUrl: await signedUrl(d.file.key, 900, d.file.name) } : undefined })),
    );
  }
  return org;
}

const ORG_EDITABLE = [
  'name',
  'legalName',
  'employerType',
  'organizationType',
  'industries',
  'subIndustries',
  'departments',
  'functions',
  'employeeCount',
  'foundedDate',
  'website',
  'about',
  'socialProfiles',
  'hiringStatus',
  'gstNumber',
  'panNumber',
  'email',
  'phone',
  'consultancyDeclaration',
];

export async function updateOrganization(req, body) {
  const org = await Organization.findById(req.orgId);
  if (body.username && body.username !== org.username) {
    validateUsername(body.username);
    if (await Organization.exists({ username: body.username, _id: { $ne: org._id } }))
      throw ApiError.conflict('This employer username is taken', 'USERNAME_TAKEN');
    org.username = body.username;
  }
  if (body.gstNumber && body.gstNumber !== org.gstNumber) {
    // A new GST number must pass the official check digit, so typos are caught before admin review.
    if (!isValidGstin(body.gstNumber)) throw ApiError.validation([{ field: 'gstNumber', message: 'This GST number is not valid. Please check all 15 characters', location: 'body' }]);
    org.verification.gst = false;
  }
  if (body.website && body.website !== org.website) org.verification.domain = false;
  org.set(pick(body, ORG_EDITABLE));
  if (body.consultancyDeclaration) org.consultancyDeclaration = { ...body.consultancyDeclaration, acceptedAt: new Date() };
  await org.save();
  await Job.updateMany({ organization: org._id }, { $set: { 'orgSnapshot.name': org.name, 'orgSnapshot.username': org.username } });
  return getOrganization(org._id);
}

export async function uploadBranding(req, file, field) {
  const org = await Organization.findById(req.orgId);
  const stored = await putFile(file, { folder: field === 'logo' ? 'logos' : 'covers' });
  const old = org[field]?.key;
  org[field] = stored;
  await org.save();
  if (old) await deleteFile(old);
  if (field === 'logo') await Job.updateMany({ organization: org._id }, { $set: { 'orgSnapshot.logo': stored.url } });
  return org[field];
}

/* ------------------------------------------------------------------ offices */

export async function addOffice(req, data) {
  const org = await Organization.findById(req.orgId);
  if (org.offices.length >= 50) throw ApiError.badRequest('Maximum 50 office locations allowed');
  if (data.isPrimary) org.offices.forEach((o) => (o.isPrimary = false));
  org.offices.push(data);
  await org.save();
  return org.offices[org.offices.length - 1];
}

export async function updateOffice(req, officeId, data) {
  const org = await Organization.findById(req.orgId);
  const office = org.offices.id(officeId);
  if (!office) throw ApiError.notFound('Office not found');
  if (data.isPrimary) org.offices.forEach((o) => (o.isPrimary = false));
  office.set(data);
  await org.save();
  return office;
}

export async function removeOffice(req, officeId) {
  const org = await Organization.findById(req.orgId);
  const office = org.offices.id(officeId);
  if (!office) throw ApiError.notFound('Office not found');
  office.deleteOne();
  await org.save();
}

/* ---------------------------------------------------------------- documents */

export async function uploadDocument(req, file, { type, number }) {
  const org = await Organization.findById(req.orgId);
  const existing = org.documents.find((d) => d.type === type);
  if (!existing && org.documents.length >= MAX_DOCUMENTS)
    throw ApiError.badRequest(`Maximum ${MAX_DOCUMENTS} documents allowed. Replace an existing one`, undefined, 'MAX_DOCUMENTS');
  const stored = await putFile(file, { folder: 'kyc', isPrivate: true });
  if (existing) {
    if (existing.file?.key) await deleteFile(existing.file.key);
    existing.set({ number, file: stored, status: 'under_review', remarks: undefined, reviewedAt: undefined, reviewedBy: undefined });
  } else {
    org.documents.push({ type, number, file: stored, status: 'under_review' });
  }
  if (org.kycStatus === 'not_submitted' || org.kycStatus === 'rejected' || org.kycStatus === 'resubmission_required') org.kycStatus = 'under_review';
  org.isVerified = false;
  await org.save();
  return org.documents.find((d) => d.type === type);
}

export async function removeDocument(req, documentId) {
  const org = await Organization.findById(req.orgId);
  const doc = org.documents.id(documentId);
  if (!doc) throw ApiError.notFound('Document not found');
  if (doc.status === 'verified') throw ApiError.badRequest('Verified documents cannot be removed. Contact support.');
  if (doc.file?.key) await deleteFile(doc.file.key);
  doc.deleteOne();
  if (!org.documents.length) org.kycStatus = 'not_submitted';
  await org.save();
}

/** "Submit For Verification" with the Terms & Declaration checkboxes. */
export async function submitVerification(req, declaration) {
  const org = await Organization.findById(req.orgId);
  if (!org.documents.length) throw ApiError.badRequest('Upload at least one document before submitting', undefined, 'NO_DOCUMENTS');
  org.termsDeclaration = { ...declaration, acceptedAt: new Date() };
  org.kycStatus = 'under_review';
  await org.save();
  return { kycStatus: org.kycStatus };
}

/** Admin reviews a document; recomputes overall KYC status and the Verified badge. */
export async function reviewDocument(admin, orgId, documentId, { status, remarks }) {
  const org = await Organization.findById(orgId);
  if (!org) throw ApiError.notFound('Organization not found');
  const doc = org.documents.id(documentId);
  if (!doc) throw ApiError.notFound('Document not found');
  doc.set({ status, remarks, reviewedBy: admin._id, reviewedAt: new Date() });
  const statuses = org.documents.map((d) => d.status);
  if (statuses.every((x) => x === 'verified')) org.kycStatus = 'verified';
  else if (statuses.includes('resubmission_required')) org.kycStatus = 'resubmission_required';
  else if (statuses.includes('rejected')) org.kycStatus = 'rejected';
  else org.kycStatus = 'under_review';
  if (doc.type?.toLowerCase().includes('gst') && status === 'verified') org.verification.gst = true;
  org.verification.business = org.kycStatus === 'verified';
  const owner = await User.findById(org.owner).select('emailVerifiedAt mobileVerifiedAt').lean();
  org.isVerified = org.kycStatus === 'verified' && Boolean(owner?.emailVerifiedAt && owner?.mobileVerifiedAt);
  await org.save();
  await Job.updateMany({ organization: org._id }, { $set: { 'orgSnapshot.isVerified': org.isVerified } });
  return org;
}

/* ----------------------------------------------------- domain verification */

export async function startDomainVerification(req) {
  const org = await Organization.findById(req.orgId);
  if (!org.website) throw ApiError.badRequest('Add your company website first');
  const token = `freejobwala-verify=${randomToken(12)}`;
  org.verification.domainToken = token;
  await org.save();
  const host = new URL(org.website).hostname.replace(/^www\./, '');
  return { domain: host, recordType: 'TXT', recordValue: token, alternative: `Or log in with an official e-mail on @${host}` };
}

export async function checkDomainVerification(req) {
  const org = await Organization.findById(req.orgId);
  if (!org.website) throw ApiError.badRequest('Add your company website first');
  const host = new URL(org.website).hostname.replace(/^www\./, '');
  const owner = await User.findById(org.owner).select('email emailVerifiedAt').lean();
  let verified = Boolean(owner?.emailVerifiedAt && owner.email?.endsWith(`@${host}`));
  if (!verified && org.verification.domainToken) {
    try {
      const records = (await dns.resolveTxt(host)).flat();
      verified = records.includes(org.verification.domainToken);
    } catch {
      verified = false;
    }
  }
  org.verification.domain = verified;
  await org.save();
  if (!verified) throw ApiError.badRequest('Domain could not be verified yet. DNS changes can take up to 24 hours', undefined, 'DOMAIN_NOT_VERIFIED');
  return { verified };
}

/* ---------------------------------------------------------------- team */

export async function listMembers(orgId, { q, status } = {}) {
  const filter = { 'employer.organization': orgId, role: ROLES.EMPLOYER };
  if (status) filter.status = status;
  if (q) filter.$or = [{ fullName: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }];
  const members = await User.find(filter)
    .select('fullName displayName username email mobile avatar status employer lastLoginAt createdAt')
    .sort({ 'employer.isOwner': -1, createdAt: 1 })
    .lean();
  return members;
}

function resolvePermissions(memberRole, permissions) {
  if (permissions?.length) return permissions.filter((p) => EMPLOYER_PERMISSIONS.includes(p));
  return DEFAULT_MEMBER_PERMISSIONS[memberRole] || DEFAULT_MEMBER_PERMISSIONS.recruiter;
}

export async function addMember(req, data) {
  const org = await Organization.findById(req.orgId).select('maxMembers name').lean();
  const count = await User.countDocuments({ 'employer.organization': req.orgId, status: { $ne: USER_STATUS.TRASHED } });
  if (count >= (org.maxMembers || 50)) throw ApiError.badRequest(`Maximum ${org.maxMembers || 50} users allowed on this account`, undefined, 'MEMBER_LIMIT');
  await assertIdentityAvailable({ email: data.email, mobile: data.mobile, username: data.username });
  if (data.username) validateUsername(data.username);
  const sendInvite = !data.password;
  const member = await User.create({
    role: ROLES.EMPLOYER,
    fullName: data.fullName,
    displayName: data.fullName,
    username: data.username || (await generateUsername(data.fullName)),
    email: normalizeEmail(data.email),
    mobile: normalizeMobile(data.mobile),
    gender: data.gender,
    password: data.password || randomPassword(),
    status: USER_STATUS.ACTIVE,
    source: 'admin',
    employer: {
      organization: req.orgId,
      isOwner: false,
      memberRole: data.memberRole,
      designation: data.designation,
      department: data.department,
      functions: data.functions,
      hiringAuthority: data.hiringAuthority,
      permissions: resolvePermissions(data.memberRole, data.permissions),
      quotas: data.quotas,
      addedBy: req.user._id,
    },
  });
  if (sendInvite) await sendActivation(member, org.name);
  return member.toSafeJSON();
}

export async function sendActivation(user, orgName) {
  const token = randomToken(32);
  await ActionToken.create({ user: user._id, type: 'activation', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) });
  await sendEmail({
    to: user.email,
    template: 'activation',
    vars: { name: `${user.fullName}${orgName ? ` (${orgName})` : ''}`, url: `${config.urls.web}/set-password?token=${token}` },
    user: user._id,
  });
}

async function findMember(orgId, memberId) {
  const member = await User.findOne({ _id: memberId, 'employer.organization': orgId }).select('+tokenVersion');
  if (!member) throw ApiError.notFound('Team member not found');
  return member;
}

export async function updateMember(req, memberId, data) {
  const member = await findMember(req.orgId, memberId);
  if (member.employer.isOwner && (data.memberRole || data.permissions || data.status)) throw ApiError.forbidden('The account owner role cannot be changed');
  for (const k of ['fullName', 'gender']) if (data[k] !== undefined) member[k] = data[k];
  for (const k of ['designation', 'department', 'functions', 'hiringAuthority']) if (data[k] !== undefined) member.employer[k] = data[k];
  if (data.memberRole) member.employer.memberRole = data.memberRole;
  if (data.permissions || data.memberRole) member.employer.permissions = resolvePermissions(member.employer.memberRole, data.permissions);
  if (data.quotas) member.employer.quotas = data.quotas;
  if (data.status) {
    member.status = data.status;
    if (data.status !== USER_STATUS.ACTIVE) member.tokenVersion = (member.tokenVersion || 0) + 1;
  }
  await member.save();
  if (data.status && data.status !== USER_STATUS.ACTIVE) await revokeAllSessions(member._id);
  return member.toSafeJSON();
}

async function revokeAllSessions(userId) {
  const sessions = await Session.find({ user: userId, revokedAt: null }).select('_id').lean();
  await Session.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'admin_action' } });
  sessions.forEach((s) => invalidateSessionCache(s._id));
}

export async function removeMembers(req, ids) {
  const members = await User.find({ _id: { $in: ids }, 'employer.organization': req.orgId, 'employer.isOwner': { $ne: true } }).select('_id');
  const memberIds = members.map((m) => m._id);
  await User.updateMany({ _id: { $in: memberIds } }, { $set: { status: USER_STATUS.TRASHED, deletedAt: new Date() }, $inc: { tokenVersion: 1 } });
  await Promise.all(memberIds.map(revokeAllSessions));
  // Reassign their jobs to the owner so nothing is orphaned.
  const org = await Organization.findById(req.orgId).select('owner').lean();
  await Job.updateMany({ organization: req.orgId, postedBy: { $in: memberIds } }, { $set: { postedBy: org.owner } });
  return { removed: memberIds.length };
}

export async function memberPasswordReset(req, memberId) {
  const member = await findMember(req.orgId, memberId);
  await sendActivation(member);
  return { sent: true };
}

export async function usage(req, { memberId, period }) {
  const [org, members] = await Promise.all([usageReport(req.orgId, memberId || null), memberUsage(req.orgId, period)]);
  const credits = await Organization.findById(req.orgId).select('credits planFeatures planExpiresAt').lean();
  return { organization: org, members, credits: credits.credits, features: credits.planFeatures, planExpiresAt: credits.planExpiresAt };
}

/* ------------------------------------------------------- public / social */

export async function publicProfile(slugOrUsername, viewer) {
  const org = await Organization.findOne({ $or: [{ slug: slugOrUsername }, { username: slugOrUsername }], status: USER_STATUS.ACTIVE })
    .select(PUBLIC_ORG_FIELDS)
    .lean();
  if (!org) throw ApiError.notFound('Employer not found');
  Organization.updateOne({ _id: org._id }, { $inc: { 'stats.profileViews': 1 } }).catch(() => {});
  const [activeJobs, isFollowing] = await Promise.all([
    Job.countDocuments({ organization: org._id, status: 'active' }),
    viewer ? Follow.exists({ follower: viewer._id, organization: org._id }) : null,
  ]);
  return { ...org, activeJobs, isFollowing: Boolean(isFollowing) };
}

const exact = (v) => new RegExp(`^${escapeRegex(String(v).trim())}$`, 'i');

/** Public companies / recruiters directory with the Excel side filters. Job-based filters match employers with such an active job. */
export async function listPublicEmployers(q) {
  const { page, limit, skip, sort } = q;
  const filter = { status: USER_STATUS.ACTIVE };
  const types = toArray(q.type);
  if (types.length === 1) filter.type = types[0];
  const industries = toArray(q.industry);
  if (industries.length) filter.industries = { $in: industries.map(exact) };
  const cities = toArray(q.city).slice(0, 20);
  if (cities.length) filter['offices.city'] = { $in: cities.map(exact) };
  const companyTypes = toArray(q.companyType);
  if (companyTypes.length) filter.employerType = { $in: companyTypes.map(looseRegex) };
  const sizes = toArray(q.companySize);
  if (sizes.length) filter.employeeCount = { $in: sizes };
  const top = toArray(q.topCompany);
  if (top.length) filter.name = { $in: top.map((t) => new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}`, 'i')) };
  if (q.verified) filter.isVerified = true;
  if (q.label) filter.labels = q.label;
  if (q.q) filter.$and = [{ name: new RegExp(escapeRegex(q.q), 'i') }];

  const jobFilter = { status: 'active' };
  if (q.datePosted) jobFilter.publishedAt = { $gte: new Date(Date.now() - q.datePosted * 86400000) };
  const roles = toArray(q.role);
  if (roles.length) jobFilter.roles = { $in: roles };
  const departments = toArray(q.department);
  if (departments.length) jobFilter.departments = { $in: departments };
  const levels = toArray(q.experienceLevel);
  if (levels.length) jobFilter.experienceLevels = { $in: levels };
  if (Object.keys(jobFilter).length > 1) filter._id = { $in: await Job.distinct('organization', jobFilter) };

  const [items, total] = await Promise.all([
    Organization.find(filter)
      .select('type name username slug logo employerType industries employeeCount isVerified labels stats offices.city')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Organization.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function follow(user, orgId) {
  const org = await Organization.findOne({ _id: orgId, status: USER_STATUS.ACTIVE }).select('_id').lean();
  if (!org) throw ApiError.notFound('Employer not found');
  const res = await Follow.updateOne(
    { follower: user._id, organization: orgId },
    { $setOnInsert: { follower: user._id, organization: orgId } },
    { upsert: true },
  );
  if (res.upsertedCount) await Organization.updateOne({ _id: orgId }, { $inc: { 'stats.followers': 1 } });
  return { following: true };
}

export async function unfollow(user, orgId) {
  const res = await Follow.deleteOne({ follower: user._id, organization: orgId });
  if (res.deletedCount) await Organization.updateOne({ _id: orgId, 'stats.followers': { $gt: 0 } }, { $inc: { 'stats.followers': -1 } });
  return { following: false };
}

export async function myFollowing(userId, { page, limit, skip }) {
  const [items, total] = await Promise.all([
    Follow.find({ follower: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('organization', 'name slug username logo type isVerified stats')
      .lean(),
    Follow.countDocuments({ follower: userId }),
  ]);
  return { items, total, page, limit };
}

export async function followers(orgId, { page, limit, skip }) {
  const [items, total] = await Promise.all([
    Follow.find({ organization: orgId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('follower', 'fullName displayName avatar username').lean(),
    Follow.countDocuments({ organization: orgId }),
  ]);
  return { items, total, page, limit };
}

/** Notifies followers when a new job is published (called by jobs service). */
export async function notifyFollowersOfJob(job) {
  const rows = await Follow.find({ organization: job.organization, notify: true }).select('follower').limit(20000).lean();
  if (!rows.length) return;
  await notifyMany(
    rows.map((r) => r.follower),
    {
      type: 'followed_employer_job',
      title: `${job.orgSnapshot?.name} posted a new job`,
      body: job.title,
      data: { screen: 'job', jobId: String(job._id), slug: job.slug },
      channels: ['in_app', 'push'],
    },
  );
}
