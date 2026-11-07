import ApiError from '../../shared/errors/ApiError.js';
import { ROLES, USER_STATUS, ADMIN_ROLES, EMPLOYER_TYPE } from '../../shared/constants/index.js';
import { escapeRegex, normalizeEmail, normalizeMobile, pick, isObjectId } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { parseWorkbook } from '../../shared/utils/excel.js';
import { randomToken, sha256, randomPassword } from '../../shared/utils/crypto.js';
import config from '../../config/env.js';
import { signedUrl, readFile } from '../../shared/services/storage.service.js';
import { ZipArchive } from 'archiver';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import Organization from '../employers/organization.model.js';
import Job from '../jobs/job.model.js';
import { Application } from '../applications/application.model.js';
import { ActionToken, Session } from '../auth/auth.models.js';
import { createCandidateAccount, createEmployerAccount, assertIdentityAvailable } from '../users/account.service.js';
import { sendEmail, sendSms, sendWhatsapp, sendArattai, notify } from '../notifications/notification.service.js';
import { sendActivation, reviewDocument } from '../employers/employer.service.js';
import { syncVerificationBadge } from '../auth/auth.service.js';
import { refreshDerived } from '../candidates/candidate.service.js';
import { syncActiveJobCount } from '../jobs/job.service.js';
import { grantCredits } from '../billing/usage.service.js';
import { grantFreePlan } from '../billing/billing.service.js';
import { invalidateSessionCache } from '../../shared/middleware/auth.js';
import { AdminTracking } from './admin.models.js';

/* ================================================================ helpers */

function searchOr(q) {
  const t = String(q).trim();
  if (/^(CAND|COMP|CONS)-/i.test(t)) return [{ uid: t.toUpperCase() }];
  if (/@/.test(t)) return [{ email: normalizeEmail(t) }];
  if (/^\+?\d{6,}$/.test(t.replace(/\s/g, ''))) return [{ mobile: normalizeMobile(t) }];
  return [{ fullName: new RegExp(escapeRegex(t), 'i') }, { username: new RegExp(`^${escapeRegex(t)}`, 'i') }];
}

async function revokeSessions(userIds) {
  const sessions = await Session.find({ user: { $in: userIds }, revokedAt: null })
    .select('_id')
    .lean();
  await Session.updateMany({ user: { $in: userIds }, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'admin_action' } });
  sessions.forEach((s) => invalidateSessionCache(s._id));
}

/* ============================================================ statistics */

export async function candidateStats(q) {
  const range = dateRangeFilter(q);
  const base = { role: ROLES.CANDIDATE, ...range };
  const [byStatus, bySource, eventApplied, applied] = await Promise.all([
    User.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: base }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Application.distinct('candidate', { source: 'event', ...range }).then((x) => x.length),
    Application.distinct('candidate', range).then((x) => x.length),
  ]);
  const s = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
  const src = Object.fromEntries(bySource.map((x) => [x._id, x.count]));
  return {
    all: Object.values(s).reduce((a, b) => a + b, 0) - (s.trashed || 0),
    active: s.active || 0,
    pending: s.pending || 0,
    adminReview: s.admin_review || 0,
    blocked: (s.blocked || 0) + (s.suspended || 0),
    trashed: s.trashed || 0,
    excelImported: src.excel_import || 0,
    jobAppliedRegistered: src.job_apply || 0,
    directRegistered: (src.direct || 0) + (src.google || 0),
    eventApplied,
    jobApplied: applied,
    jobAlertRegistered: src.job_alert || 0,
  };
}

export async function employerStats(q) {
  const range = dateRangeFilter(q);
  const rows = await Organization.aggregate([
    { $match: range },
    { $group: { _id: { type: '$type', status: '$status', source: '$source' }, count: { $sum: 1 } } },
  ]);
  const blank = () => ({ all: 0, active: 0, pending: 0, blocked: 0, adminReview: 0, trashed: 0, directRegistered: 0, jobPostRegistered: 0, excelImported: 0 });
  const out = { employers: blank(), companies: blank(), consultancies: blank() };
  for (const r of rows) {
    for (const bucket of ['employers', r._id.type === EMPLOYER_TYPE.CONSULTANCY ? 'consultancies' : 'companies']) {
      const b = out[bucket];
      if (r._id.status !== USER_STATUS.TRASHED) b.all += r.count;
      if (r._id.status === 'active') b.active += r.count;
      if (r._id.status === 'pending') b.pending += r.count;
      if (r._id.status === 'admin_review') b.adminReview += r.count;
      if (['blocked', 'suspended'].includes(r._id.status)) b.blocked += r.count;
      if (r._id.status === 'trashed') b.trashed += r.count;
      if (['direct', 'google'].includes(r._id.source)) b.directRegistered += r.count;
      if (r._id.source === 'job_post') b.jobPostRegistered += r.count;
      if (r._id.source === 'excel_import') b.excelImported += r.count;
    }
  }
  return out;
}

/* ============================================================= candidates */

export function candidateFilter(q) {
  const f = { role: ROLES.CANDIDATE, ...dateRangeFilter(q) };
  f.status = q.status ? q.status : { $ne: USER_STATUS.TRASHED };
  if (q.status === 'blocked') f.status = { $in: ['blocked', 'suspended'] };
  if (q.source) f.source = q.source;
  if (q.label) f.labels = q.label;
  if (q.situationTag) f.situationTag = q.situationTag;
  if (q.verified !== undefined) f.isVerified = q.verified;
  if (q.q) f.$or = searchOr(q.q);
  return f;
}

export async function listCandidates(q, { page, limit, skip, sort }) {
  const f = candidateFilter(q);
  if (q.hasResume !== undefined || q.city || q.skill || q.experienceLevel || q.jobApplied) {
    const pf = {};
    if (q.hasResume !== undefined) pf['resume.key'] = { $exists: q.hasResume };
    if (q.city) pf['currentLocation.city'] = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
    if (q.skill) pf.keySkills = new RegExp(`^${escapeRegex(q.skill)}$`, 'i');
    if (q.experienceLevel) pf.experienceLevel = q.experienceLevel;
    if (q.jobApplied) pf['stats.applications'] = { $gt: 0 };
    f._id = { $in: await Candidate.distinct('user', pf) };
  }
  const [users, total] = await Promise.all([
    User.find(f)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select(
        'uid fullName username email mobile gender avatar status isVerified labels situationTag source emailVerifiedAt mobileVerifiedAt lastLoginAt lastActiveAt createdAt',
      )
      .lean(),
    User.countDocuments(f),
  ]);
  const profiles = await Candidate.find({ user: { $in: users.map((u) => u._id) } })
    .select('user experienceLevel currentJobTitle currentLocation totalExperienceMonths keySkills profileCompletion resume.key stats')
    .lean();
  const pMap = new Map(profiles.map((p) => [String(p.user), p]));
  return { items: users.map((u) => ({ ...u, profile: pMap.get(String(u._id)) || null })), total, page, limit };
}

export async function getCandidate(id) {
  const user = await User.findOne({ _id: id, role: ROLES.CANDIDATE });
  if (!user) throw ApiError.notFound('Candidate not found');
  const [profile, applications, tracking] = await Promise.all([
    Candidate.findOne({ user: id }).select('+resumeText').lean(),
    Application.find({ candidate: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('job', 'title uid orgSnapshot.name')
      .select('job stage screeningStatus source createdAt')
      .lean(),
    AdminTracking.findOne({ targetType: 'candidate', user: id }).populate('comments.by', 'fullName admin.nickname').lean(),
  ]);
  return { user: user.toSafeJSON({ includeAdminFields: true }), profile, applications, adminTracking: tracking };
}

const ADMIN_USER_FIELDS = [
  'fullName',
  'displayName',
  'username',
  'gender',
  'email',
  'mobile',
  'about',
  'socialLinks',
  'labels',
  'situationTag',
  'status',
  'statusReason',
  'isVerified',
  'notificationPrefs',
  'privacy',
  'heardFrom',
];

export async function updateUser(admin, id, { user: userPatch = {}, profile: profilePatch }) {
  const user = await User.findById(id).select('+tokenVersion');
  if (!user) throw ApiError.notFound('User not found');
  if (ADMIN_ROLES.includes(user.role) && admin.role !== ROLES.SUPER_ADMIN) throw ApiError.forbidden('Only a super admin can edit admins');
  const patch = pick(userPatch, ADMIN_USER_FIELDS);
  if (patch.email || patch.mobile || patch.username) await assertIdentityAvailable({ email: patch.email, mobile: patch.mobile, username: patch.username }, id);
  if (patch.email && patch.email !== user.email) user.emailVerifiedAt = undefined;
  if (patch.mobile && patch.mobile !== user.mobile) user.mobileVerifiedAt = undefined;
  if (patch.email) patch.email = normalizeEmail(patch.email);
  if (patch.mobile) patch.mobile = normalizeMobile(patch.mobile);
  if (userPatch.emailVerified !== undefined) user.emailVerifiedAt = userPatch.emailVerified ? user.emailVerifiedAt || new Date() : undefined;
  if (userPatch.mobileVerified !== undefined) user.mobileVerifiedAt = userPatch.mobileVerified ? user.mobileVerifiedAt || new Date() : undefined;
  if (userPatch.password) user.password = userPatch.password;
  const statusChanged = patch.status && patch.status !== user.status;
  user.set(patch);
  if (statusChanged && patch.status !== USER_STATUS.ACTIVE) user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  if (statusChanged && patch.status !== USER_STATUS.ACTIVE) await revokeSessions([user._id]);

  if (profilePatch && user.role === ROLES.CANDIDATE) {
    const profile = await Candidate.findOne({ user: id });
    profile.set(profilePatch);
    await refreshDerived(user, profile);
  }
  await syncVerificationBadge(user._id);
  return user.toSafeJSON({ includeAdminFields: true });
}

export async function adminCreateCandidate(admin, data) {
  const password = data.password || randomPassword();
  const { user } = await createCandidateAccount({ ...data, password, acceptTerms: true }, { source: 'admin' });
  if (data.sendActivation !== false && user.email) await sendActivation(user);
  return user.toSafeJSON({ includeAdminFields: true });
}

/** Bulk actions shared by candidates & employer users. */
export async function bulkUserAction(admin, ids, action, value) {
  const filter = { _id: { $in: ids }, role: { $nin: ADMIN_ROLES } };
  const statusMap = {
    approve: 'active',
    activate: 'active',
    restore: 'active',
    unapprove: 'pending',
    pending: 'pending',
    admin_review: 'admin_review',
    block: 'blocked',
    suspend: 'suspended',
    trash: 'trashed',
  };
  let update;
  if (statusMap[action]) {
    update = { $set: { status: statusMap[action], ...(action === 'trash' ? { deletedAt: new Date() } : {}) } };
    if (!['approve', 'activate', 'restore'].includes(action)) update.$inc = { tokenVersion: 1 };
  } else if (action === 'verify') update = { $set: { isVerified: true } };
  else if (action === 'unverify') update = { $set: { isVerified: false } };
  else if (action === 'label_add') update = { $addToSet: { labels: value } };
  else if (action === 'label_remove') update = { $pull: { labels: value } };
  else if (action === 'tag') update = { $set: { situationTag: value } };
  else if (action === 'delete') {
    // hard delete is restricted to already-trashed users
    const victims = await User.find({ ...filter, status: USER_STATUS.TRASHED })
      .select('_id role')
      .lean();
    const vIds = victims.map((v) => v._id);
    await Promise.all([User.deleteMany({ _id: { $in: vIds } }), Candidate.deleteMany({ user: { $in: vIds } }), Session.deleteMany({ user: { $in: vIds } })]);
    return { updated: vIds.length };
  } else throw ApiError.badRequest('Unknown action');
  const res = await User.updateMany(filter, update);
  if (update.$inc) await revokeSessions(ids);
  if (['approve', 'activate', 'restore', 'verify'].includes(action)) for (const id of ids) await syncVerificationBadge(id);
  return { updated: res.modifiedCount };
}

/* ------------------------------------------------------------ import */

const CANDIDATE_HEADERS = {
  'full name': 'fullName',
  'candidate name': 'fullName',
  name: 'fullName',
  'email id': 'email',
  email: 'email',
  'mobile number': 'mobile',
  mobile: 'mobile',
  gender: 'gender',
  'experience level': 'experienceLevel',
  'current job title': 'currentJobTitle',
  'key skills': 'keySkills',
  'current city': 'city',
  city: 'city',
  state: 'state',
  'total experience (months)': 'totalExperienceMonths',
  'current salary': 'currentSalary',
  'level of education': 'educationLevel',
  degree: 'degree',
};

/**
 * Bulk candidate import. mode:
 *  - create   : add new candidates, skip duplicates (detected by mobile / e-mail)
 *  - update   : add new + rewrite existing excel-imported candidates matched by mobile / e-mail
 *  - replace  : delete previously excel-imported candidates (never logged in) first, then create
 */
export async function importCandidates(admin, buffer, { mode = 'create', dryRun = false }) {
  const rows = await parseWorkbook(buffer, CANDIDATE_HEADERS, { maxRows: 20000 });
  const seen = new Map();
  const duplicatesInFile = [];
  for (const r of rows) {
    r.email = normalizeEmail(r.email);
    r.mobile = normalizeMobile(r.mobile);
    for (const key of [r.email, r.mobile].filter(Boolean)) {
      if (seen.has(key)) duplicatesInFile.push({ row: r.__row, duplicateOf: seen.get(key), value: key });
      else seen.set(key, r.__row);
    }
  }
  const existing = await User.find({
    $or: [{ email: { $in: rows.map((r) => r.email).filter(Boolean) } }, { mobile: { $in: rows.map((r) => r.mobile).filter(Boolean) } }],
  })
    .select('email mobile role source lastLoginAt')
    .lean();
  const existingKeys = new Map();
  existing.forEach((u) => [u.email, u.mobile].filter(Boolean).forEach((k) => existingKeys.set(k, u)));
  if (dryRun)
    return {
      total: rows.length,
      duplicatesInFile,
      existingInDatabase: rows
        .filter((r) => existingKeys.has(r.email) || existingKeys.has(r.mobile))
        .map((r) => ({ row: r.__row, email: r.email, mobile: r.mobile })),
    };

  if (mode === 'replace') {
    const old = await User.find({ role: ROLES.CANDIDATE, source: 'excel_import', lastLoginAt: null }).select('_id').lean();
    const oldIds = old.map((o) => o._id);
    await Promise.all([User.deleteMany({ _id: { $in: oldIds } }), Candidate.deleteMany({ user: { $in: oldIds } })]);
    existing.splice(0, existing.length, ...existing.filter((u) => !oldIds.some((id) => String(id) === String(u._id))));
    existingKeys.clear();
    existing.forEach((u) => [u.email, u.mobile].filter(Boolean).forEach((k) => existingKeys.set(k, u)));
  }

  const result = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], duplicatesInFile: duplicatesInFile.length };
  const dupRows = new Set(duplicatesInFile.map((d) => d.row));
  const list = (v) =>
    v
      ? String(v)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  for (const r of rows) {
    try {
      if (dupRows.has(r.__row)) {
        result.skipped += 1;
        continue;
      }
      if (!r.fullName || (!r.email && !r.mobile)) throw new Error('Name and e-mail or mobile are required');
      const profile = {
        currentJobTitle: r.currentJobTitle,
        keySkills: list(r.keySkills).slice(0, 15),
        currentLocation: r.city ? { city: String(r.city), state: r.state ? String(r.state) : undefined } : undefined,
        totalExperienceMonths: Number(r.totalExperienceMonths) || 0,
        currentSalary: r.currentSalary ? Number(r.currentSalary) : undefined,
        educations: r.educationLevel ? [{ level: String(r.educationLevel), degree: r.degree ? String(r.degree) : undefined, isHighest: true }] : undefined,
      };
      const match = existingKeys.get(r.email) || existingKeys.get(r.mobile);
      if (match) {
        if (mode === 'update' && match.role === ROLES.CANDIDATE) {
          await User.updateOne({ _id: match._id }, { $set: { fullName: r.fullName, gender: r.gender } });
          await Candidate.updateOne(
            { user: match._id },
            { $set: Object.fromEntries(Object.entries({ ...profile, experienceLevel: r.experienceLevel }).filter(([, v]) => v !== undefined)) },
          );
          result.updated += 1;
        } else result.skipped += 1;
        continue;
      }
      await createCandidateAccount(
        { fullName: String(r.fullName), email: r.email, mobile: r.mobile, gender: r.gender, experienceLevel: r.experienceLevel, acceptTerms: true, profile },
        { source: 'excel_import' },
      );
      result.created += 1;
    } catch (err) {
      result.errors.push({ row: r.__row, message: err.message });
    }
  }
  return result;
}

export async function exportCandidates(q) {
  const users = await User.find(candidateFilter(q)).sort({ createdAt: -1 }).limit(100000).lean();
  const profiles = await Candidate.find({ user: { $in: users.map((u) => u._id) } }).lean();
  const pMap = new Map(profiles.map((p) => [String(p.user), p]));
  return users.map((u) => ({ ...u, profile: pMap.get(String(u._id)) || {} }));
}

export const CANDIDATE_EXPORT_COLUMNS = [
  { header: 'Candidate ID', key: 'uid' },
  { header: 'Full Name', key: 'fullName' },
  { header: 'Username', key: 'username' },
  { header: 'E-mail ID', key: 'email' },
  { header: 'Mobile Number', key: 'mobile' },
  { header: 'Gender', key: 'gender' },
  { header: 'Experience Level', key: 'profile.experienceLevel' },
  { header: 'Current Job Title', key: 'profile.currentJobTitle' },
  { header: 'Current Employer', key: 'profile.currentEmployer' },
  { header: 'Total Experience (Months)', key: 'profile.totalExperienceMonths' },
  { header: 'Current Salary', key: 'profile.currentSalary' },
  { header: 'Key Skills', key: 'profile.keySkills' },
  { header: 'Current City', key: 'profile.currentLocation.city' },
  { header: 'Current State', key: 'profile.currentLocation.state' },
  { header: 'Highest Education', key: 'profile.highestEducationLevel' },
  { header: 'Notice Period', key: 'profile.noticePeriod' },
  { header: 'Resume Uploaded', key: 'hasResume', get: (r) => (r.profile?.resume?.key ? 'Yes' : 'No') },
  { header: 'Profile Completion %', key: 'profile.profileCompletion' },
  { header: 'Status', key: 'status' },
  { header: 'Verified', key: 'isVerified', get: (r) => (r.isVerified ? 'Yes' : 'No') },
  { header: 'Labels', key: 'labels' },
  { header: 'Situation Tag', key: 'situationTag' },
  { header: 'Source', key: 'source' },
  { header: 'Heard From', key: 'heardFrom' },
  { header: 'Registered On', key: 'createdAt' },
  { header: 'Last Login', key: 'lastLoginAt' },
];

export async function adminTracking(admin, targetType, id, data) {
  const key = targetType === 'candidate' ? { targetType, user: id } : { targetType, organization: id };
  const update = { $set: { updatedBy: admin._id, ...pick(data, ['screeningStatus', 'callingStatus']) } };
  if (data.messagingStatus) update.$addToSet = { messagingStatus: { $each: data.messagingStatus } };
  const push = {};
  if (data.comment) push.comments = { body: data.comment, by: admin._id, at: new Date() };
  if (data.forward) push.forwardedVia = { ...data.forward, by: admin._id, at: new Date() };
  if (Object.keys(push).length) update.$push = push;
  return AdminTracking.findOneAndUpdate(key, update, { upsert: true, new: true }).lean();
}

/* ============================================================== employers */

export function employerFilter(q) {
  const f = { ...dateRangeFilter(q) };
  f.status = q.status ? q.status : { $ne: USER_STATUS.TRASHED };
  if (q.status === 'blocked') f.status = { $in: ['blocked', 'suspended'] };
  if (q.type) f.type = q.type;
  if (q.source) f.source = q.source;
  if (q.label) f.labels = q.label;
  if (q.kycStatus) f.kycStatus = q.kycStatus;
  if (q.verified !== undefined) f.isVerified = q.verified;
  if (q.situationTag) f.situationTag = q.situationTag;
  if (q.city) f['offices.city'] = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
  if (q.industry) f.industries = q.industry;
  return f;
}

export async function listEmployers(q, { page, limit, skip, sort }) {
  const f = employerFilter(q);
  if (q.q) {
    const t = q.q.trim();
    if (/^(COMP|CONS)-/i.test(t)) f.uid = t.toUpperCase();
    else {
      const owners = await User.find({ role: ROLES.EMPLOYER, $or: searchOr(t) })
        .select('employer.organization')
        .limit(500)
        .lean();
      f.$or = [
        { name: new RegExp(escapeRegex(t), 'i') },
        { gstNumber: t.toUpperCase() },
        { _id: { $in: owners.map((o) => o.employer?.organization).filter(Boolean) } },
      ];
    }
  }
  const [items, total] = await Promise.all([
    Organization.find(f)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-documents.file -adminNotes')
      .populate('owner', 'fullName email mobile emailVerifiedAt mobileVerifiedAt lastLoginAt')
      .lean(),
    Organization.countDocuments(f),
  ]);
  return { items, total, page, limit };
}

export async function getEmployer(id) {
  const org = await Organization.findById(id)
    .populate('owner', 'fullName email mobile emailVerifiedAt mobileVerifiedAt lastLoginAt status')
    .populate('adminNotes.by', 'fullName admin.nickname')
    .lean();
  if (!org) throw ApiError.notFound('Employer not found');
  org.documents = await Promise.all(
    (org.documents || []).map(async (d) => ({ ...d, file: d.file ? { ...d.file, downloadUrl: await signedUrl(d.file.key, 900, d.file.name) } : undefined })),
  );
  const [members, jobs, tracking] = await Promise.all([
    User.find({ 'employer.organization': id }).select('fullName email mobile status employer lastLoginAt createdAt').lean(),
    Job.aggregate([{ $match: { organization: org._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    AdminTracking.findOne({ targetType: 'organization', organization: id }).lean(),
  ]);
  return { organization: org, members, jobs: Object.fromEntries(jobs.map((j) => [j._id, j.count])), adminTracking: tracking };
}

const ORG_ADMIN_FIELDS = [
  'logo',
  'coverPhoto',
  'subIndustries',
  'functions',
  'verification',
  'name',
  'legalName',
  'username',
  'employerType',
  'organizationType',
  'industries',
  'departments',
  'employeeCount',
  'foundedDate',
  'website',
  'about',
  'socialProfiles',
  'offices',
  'hiringStatus',
  'gstNumber',
  'panNumber',
  'email',
  'phone',
  'labels',
  'situationTag',
  'status',
  'statusReason',
  'isVerified',
  'maxMembers',
  'kycStatus',
  'type',
];

export async function updateEmployer(admin, id, data) {
  const org = await Organization.findById(id);
  if (!org) throw ApiError.notFound('Employer not found');
  const prevStatus = org.status;
  org.set(pick(data, ORG_ADMIN_FIELDS));
  if (data.note) org.adminNotes.push({ note: data.note, by: admin._id });
  await org.save();
  if (data.status && data.status !== prevStatus) await onOrgStatusChange(org, prevStatus);
  await Job.updateMany(
    { organization: org._id },
    {
      $set: {
        orgSnapshot: {
          name: org.name,
          logo: org.logo?.url,
          isVerified: org.isVerified,
          slug: org.slug,
          username: org.username,
          employerType: org.employerType,
        },
      },
    },
  );
  return org;
}

/** Approving an employer releases its pending jobs; blocking pauses them and logs members out. */
async function onOrgStatusChange(org, prevStatus) {
  const members = await User.find({ 'employer.organization': org._id }).select('_id').lean();
  const ids = members.map((m) => m._id);
  if (org.status === USER_STATUS.ACTIVE) {
    await Job.updateMany({ organization: org._id, status: 'pending' }, { $set: { status: 'active', refreshedAt: new Date() } });
    if (prevStatus === 'pending')
      notify(org.owner, {
        type: 'account_approved',
        title: 'Your employer account is approved',
        body: 'You can now publish jobs and search candidates',
        channels: ['in_app', 'push', 'email'],
      });
  } else if (['blocked', 'suspended', 'trashed'].includes(org.status)) {
    await Job.updateMany(
      { organization: org._id, status: 'active' },
      { $set: { status: 'closed', closedAt: new Date(), statusReason: `employer_${org.status}` } },
    );
    await User.updateMany({ _id: { $in: ids } }, { $inc: { tokenVersion: 1 } });
    await revokeSessions(ids);
  }
  await syncActiveJobCount(org._id);
}

export async function bulkEmployerAction(admin, ids, action, value) {
  const statusMap = {
    approve: 'active',
    restore: 'active',
    unapprove: 'pending',
    pending: 'pending',
    admin_review: 'admin_review',
    block: 'blocked',
    suspend: 'suspended',
    trash: 'trashed',
  };
  let updated = 0;
  for (const id of ids) {
    const org = await Organization.findById(id);
    if (!org) continue;
    const prev = org.status;
    if (statusMap[action]) org.status = statusMap[action];
    else if (action === 'verify') org.isVerified = true;
    else if (action === 'unverify') org.isVerified = false;
    else if (action === 'label_add') org.labels = [...new Set([...(org.labels || []), value])];
    else if (action === 'label_remove') org.labels = (org.labels || []).filter((l) => l !== value);
    else if (action === 'tag') org.situationTag = value;
    else throw ApiError.badRequest('Unknown action');
    await org.save();
    if (org.status !== prev) await onOrgStatusChange(org, prev);
    updated += 1;
  }
  return { updated };
}

export async function adminCreateEmployer(admin, data) {
  const password = data.password || randomPassword();
  const { user, organization } = await createEmployerAccount(
    { ...data, password, acceptTerms: true },
    { source: 'admin', status: data.status || USER_STATUS.ACTIVE },
  );
  await grantFreePlan(organization._id).catch(() => {});
  if (data.sendActivation !== false) await sendActivation(user, organization.name);
  return { user: user.toSafeJSON({ includeAdminFields: true }), organization };
}

/** "Duplicate Company" - copies the profile into a new organization with a new owner account. */
export async function duplicateEmployer(admin, id, owner) {
  const src = await Organization.findById(id).lean();
  if (!src) throw ApiError.notFound('Employer not found');
  const { organization, user } = await adminCreateEmployer(admin, {
    ...owner,
    employerType: src.type,
    organizationName: owner.organizationName || `${src.name} (Copy)`,
  });
  await Organization.updateOne(
    { _id: organization._id },
    {
      $set: pick(src, [
        'legalName',
        'employerType',
        'organizationType',
        'industries',
        'departments',
        'employeeCount',
        'foundedDate',
        'website',
        'about',
        'socialProfiles',
        'offices',
        'logo',
        'coverPhoto',
      ]),
    },
  );
  return { organization: await Organization.findById(organization._id).lean(), user };
}

export async function adjustCredits(admin, id, credits, note) {
  await grantCredits(id, credits, 'admin_adjustment', `${admin._id}${note ? `:${note}` : ''}`);
  return Organization.findById(id).select('credits').lean();
}

export async function kycQueue({ page, limit, skip }) {
  const f = { kycStatus: 'under_review' };
  const [items, total] = await Promise.all([
    Organization.find(f)
      .sort({ updatedAt: 1 })
      .skip(skip)
      .limit(limit)
      .select('uid name type kycStatus documents.type documents.status documents.number documents.createdAt owner')
      .populate('owner', 'fullName email mobile')
      .lean(),
    Organization.countDocuments(f),
  ]);
  return { items, total, page, limit };
}

export const verifyDocument = (admin, orgId, docId, body) => reviewDocument(admin, orgId, docId, body);

export async function documentReminder(ids) {
  const orgs = await Organization.find({ _id: { $in: ids }, kycStatus: { $in: ['not_submitted', 'rejected', 'resubmission_required'] } })
    .select('owner name')
    .lean();
  for (const o of orgs) {
    notify(o.owner, {
      type: 'kyc_reminder',
      title: 'Complete your employer verification',
      body: 'Upload your business documents to get the Verified Employer badge',
      data: { screen: 'kyc' },
      channels: ['in_app', 'push', 'email', 'whatsapp'],
    });
  }
  return { reminded: orgs.length };
}

const EMPLOYER_HEADERS = {
  'employer type': 'employerType',
  'we are a': 'employerType',
  'company name': 'organizationName',
  'consultancy name': 'organizationName',
  'organization name': 'organizationName',
  'full name': 'fullName',
  'official email id': 'email',
  'email id': 'email',
  'mobile number': 'mobile',
  website: 'website',
  'gst number': 'gstNumber',
  industry: 'industry',
  city: 'city',
  state: 'state',
};

export async function importEmployers(admin, buffer) {
  const rows = await parseWorkbook(buffer, EMPLOYER_HEADERS, { maxRows: 5000 });
  const result = { total: rows.length, created: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    try {
      if (!r.organizationName || !r.email) throw new Error('Organization name and e-mail are required');
      const email = normalizeEmail(r.email);
      if (await User.exists({ $or: [{ email }, ...(r.mobile ? [{ mobile: normalizeMobile(r.mobile) }] : [])] })) {
        result.skipped += 1;
        continue;
      }
      const { organization } = await createEmployerAccount(
        {
          employerType: String(r.employerType || '')
            .toLowerCase()
            .includes('consult')
            ? 'consultancy'
            : 'company',
          organizationName: String(r.organizationName),
          fullName: String(r.fullName || r.organizationName),
          email,
          mobile: r.mobile,
          website: r.website,
          gstNumber: r.gstNumber,
          industries: r.industry ? [String(r.industry)] : undefined,
          password: randomPassword(),
          acceptTerms: true,
        },
        { source: 'excel_import', status: USER_STATUS.ACTIVE },
      );
      if (r.city)
        await Organization.updateOne(
          { _id: organization._id },
          {
            $push: {
              offices: { type: 'Head Office', address: String(r.city), city: String(r.city), state: r.state ? String(r.state) : undefined, isPrimary: true },
            },
          },
        );
      await grantFreePlan(organization._id).catch(() => {});
      result.created += 1;
    } catch (err) {
      result.errors.push({ row: r.__row, message: err.message });
    }
  }
  return result;
}

export const EMPLOYER_EXPORT_COLUMNS = [
  { header: 'Employer ID', key: 'uid' },
  { header: 'Type', key: 'type' },
  { header: 'Name', key: 'name' },
  { header: 'Legal Name', key: 'legalName' },
  { header: 'Owner', key: 'owner.fullName' },
  { header: 'Owner E-mail', key: 'owner.email' },
  { header: 'Owner Mobile', key: 'owner.mobile' },
  { header: 'Employer Type', key: 'employerType' },
  { header: 'Organization Type', key: 'organizationType' },
  { header: 'Industries', key: 'industries' },
  { header: 'Employees', key: 'employeeCount' },
  { header: 'Website', key: 'website' },
  { header: 'GST Number', key: 'gstNumber' },
  { header: 'City', key: 'city', get: (r) => r.offices?.[0]?.city || '' },
  { header: 'Status', key: 'status' },
  { header: 'KYC Status', key: 'kycStatus' },
  { header: 'Verified', key: 'isVerified', get: (r) => (r.isVerified ? 'Yes' : 'No') },
  { header: 'Labels', key: 'labels' },
  { header: 'Active Jobs', key: 'stats.activeJobs' },
  { header: 'Total Jobs', key: 'stats.totalJobs' },
  { header: 'Followers', key: 'stats.followers' },
  { header: 'Source', key: 'source' },
  { header: 'Registered On', key: 'createdAt' },
];

/* ============================================================ messaging */

/** Send account e-mails directly from the admin panel. */
export async function sendAccountLink(admin, userId, type) {
  const user = await User.findById(userId).lean();
  if (!user?.email) throw ApiError.badRequest('User has no e-mail address');
  const token = randomToken(32);
  if (type === 'activation') {
    await ActionToken.create({ user: user._id, type: 'activation', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) });
    await sendEmail({
      to: user.email,
      template: 'activation',
      vars: { name: user.fullName, url: `${config.urls.web}/set-password?token=${token}` },
      user: user._id,
      sentBy: admin._id,
    });
  } else {
    await ActionToken.create({ user: user._id, type: 'reset_password', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600 * 1000) });
    await sendEmail({
      to: user.email,
      template: 'resetPassword',
      vars: { name: user.fullName, url: `${config.urls.web}/reset-password?token=${token}` },
      user: user._id,
      sentBy: admin._id,
    });
  }
  return { sent: true };
}

/**
 * Bulk alerts (max 500 recipients) over e-mail / SMS / WhatsApp / Arattai / in-app / push.
 * Recipients: explicit userIds or an audience + filters.
 */
export async function bulkMessage(admin, { userIds, audience, filters = {}, channels, subject, message, html }) {
  let recipients;
  if (userIds?.length)
    recipients = await User.find({ _id: { $in: userIds }, status: { $ne: 'trashed' } })
      .select('email mobile fullName')
      .limit(500)
      .lean();
  else {
    let f;
    if (audience === 'candidates') f = candidateFilter(filters);
    else {
      const orgFilter = employerFilter({
        ...filters,
        ...(audience === 'companies' ? { type: 'company' } : audience === 'consultancies' ? { type: 'consultancy' } : {}),
      });
      const orgs = await Organization.find(orgFilter).select('owner').limit(500).lean();
      f = { _id: { $in: orgs.map((o) => o.owner) } };
    }
    recipients = await User.find(f).select('email mobile fullName').limit(500).lean();
  }
  const body =
    html ||
    `<p>${String(message || '')
      .replace(/</g, '&lt;')
      .replace(/\n/g, '<br/>')}</p>`;
  for (const u of recipients) {
    if (channels.includes('email') && u.email) await sendEmail({ to: u.email, subject, html: body, category: 'bulk', user: u._id, sentBy: admin._id });
    if (channels.includes('sms') && u.mobile) await sendSms(u.mobile, { template: 'bulk', vars: { message }, user: u._id });
    if (channels.includes('whatsapp') && u.mobile) await sendWhatsapp(u.mobile, { text: `*${subject}*\n${message}`, user: u._id });
    if (channels.includes('arattai') && u.mobile) await sendArattai(u.mobile, `${subject}\n${message}`, u._id);
    if (channels.includes('in_app') || channels.includes('push')) {
      notify(u._id, {
        type: 'admin_alert',
        title: subject,
        body: message?.slice(0, 300),
        channels: channels.filter((c) => ['in_app', 'push'].includes(c)).concat('in_app'),
      });
    }
  }
  return { recipients: recipients.length };
}

/* ============================================================ admins */

export async function listAdmins() {
  return User.find({ role: { $in: ADMIN_ROLES } })
    .select('fullName email mobile role status admin lastLoginAt createdAt avatar')
    .lean();
}

export async function createAdmin(data) {
  await assertIdentityAvailable({ email: data.email, mobile: data.mobile });
  const user = await User.create({
    role: data.role || ROLES.ADMIN,
    fullName: data.fullName,
    email: normalizeEmail(data.email),
    mobile: normalizeMobile(data.mobile),
    password: data.password,
    emailVerifiedAt: new Date(),
    status: USER_STATUS.ACTIVE,
    admin: { nickname: data.nickname, designation: data.designation, permissions: data.permissions },
  });
  return user.toSafeJSON({ includeAdminFields: true });
}

export async function updateAdmin(id, data) {
  const user = await User.findOne({ _id: id, role: { $in: ADMIN_ROLES } }).select('+tokenVersion');
  if (!user) throw ApiError.notFound('Admin not found');
  if (data.fullName) user.fullName = data.fullName;
  if (data.role) user.role = data.role;
  if (data.status) {
    user.status = data.status;
    if (data.status !== USER_STATUS.ACTIVE) user.tokenVersion = (user.tokenVersion || 0) + 1;
  }
  if (data.permissions) user.admin = { ...(user.admin?.toObject?.() || {}), permissions: data.permissions };
  if (data.password) user.password = data.password;
  await user.save();
  if (data.status && data.status !== USER_STATUS.ACTIVE) await revokeSessions([user._id]);
  return user.toSafeJSON({ includeAdminFields: true });
}

export async function updateAdminProfile(admin, data) {
  const user = await User.findById(admin._id);
  if (data.fullName) user.fullName = data.fullName;
  if (data.displayName) user.displayName = data.displayName;
  user.admin = { ...(user.admin?.toObject?.() || {}), ...pick(data, ['nickname', 'designation', 'bio', 'socialLinks', 'logo']) };
  if (data.avatar) user.avatar = data.avatar;
  await user.save();
  return user.toSafeJSON();
}

export const isValidId = isObjectId;

/** "Bulk User Resume Export" - ZIP of the selected candidates' profile resumes. */
export async function streamCandidateResumes(ids, res) {
  const profiles = await Candidate.find({ user: { $in: ids }, 'resume.key': { $exists: true } })
    .select('user resume')
    .lean();
  if (!profiles.length) throw ApiError.notFound('No resumes found for the selected candidates');
  const usersById = new Map(
    (
      await User.find({ _id: { $in: profiles.map((p) => p.user) } })
        .select('fullName uid')
        .lean()
    ).map((u) => [String(u._id), u]),
  );
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="candidate-resumes-${Date.now()}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => res.destroy(err));
  archive.pipe(res);
  for (const p of profiles) {
    try {
      const u = usersById.get(String(p.user));
      const ext = (p.resume.name || '').split('.').pop() || 'pdf';
      archive.append(await readFile(p.resume.key), { name: `${u?.uid || p.user}_${(u?.fullName || 'candidate').replace(/[^\w-]+/g, '_')}.${ext}` });
    } catch {
      /* skip missing */
    }
  }
  await archive.finalize();
}
