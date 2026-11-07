import ApiError from '../../shared/errors/ApiError.js';
import { hasEmployerPermission } from '../../shared/middleware/auth.js';
import { maskEmail, maskMobile } from '../../shared/utils/helpers.js';
import { signedUrl } from '../../shared/services/storage.service.js';
import config from '../../config/env.js';
import Candidate from '../candidates/candidate.model.js';
import User from '../users/user.model.js';
import Organization from '../employers/organization.model.js';
import Job from '../jobs/job.model.js';
import { CandidateTracking, Application } from '../applications/application.model.js';
import { ProfileAccess, SavedSearch, RecentSearch, CandidateFolder, JobInvite } from '../engagement/engagement.models.js';
import { UserBlock } from '../moderation/moderation.models.js';
import { hiddenCandidateIdsFor, isBlockedBetween } from '../moderation/blocklist.service.js';
import { consume } from '../billing/usage.service.js';
import { notify, sendEmail } from '../notifications/notification.service.js';
import { getWeights, scoreMatch } from '../matching/matching.service.js';
import { buildTalentQuery, talentSort } from './talent.query.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { citiesWithin } from '../masterdata/masterdata.service.js';

const MAX_RESULTS = 5000;
/** Sorts applied after the users $lookup (they can use `u.*`). "Email optimized" = verified, reachable e-mails first. */
const PIPELINE_SORTS = {
  freshness: { updatedAt: -1 },
  last_active: { 'u.lastActiveAt': -1 },
  email_optimized: { 'u.emailVerifiedAt': -1, profileCompletion: -1, updatedAt: -1 },
};
const CARD_FIELDS = {
  user: 1,
  experienceLevel: 1,
  journeyStatus: 1,
  currentJobTitle: 1,
  currentEmployer: 1,
  currentSalary: 1,
  totalExperienceMonths: 1,
  noticePeriod: 1,
  currentLocation: 1,
  keySkills: 1,
  itSkills: 1,
  resumeHeadline: 1,
  highestEducationLevel: 1,
  'employments.jobTitle': 1,
  'employments.employerName': 1,
  'employments.isCurrent': 1,
  profileCompletion: 1,
  boostUntil: 1,
  updatedAt: 1,
  'resume.key': 1,
  roles: 1,
  departments: 1,
  industries: 1,
  educations: 1,
  preferences: 1,
};

async function assertResumeAccess(orgId) {
  const org = await Organization.findById(orgId).select('planFeatures planExpiresAt credits status').lean();
  if (org.status !== 'active') throw ApiError.forbidden('Your employer account is pending approval', 'ORG_PENDING');
  const active = org.planFeatures?.resumeDbAccess && (!org.planExpiresAt || org.planExpiresAt > new Date());
  if (!active && !(org.credits?.resume_view > 0)) throw ApiError.paymentRequired('Resume database access requires an active plan', 'FEATURE_LOCKED');
  return org;
}

/** Removes contact details unless this organization has unlocked the candidate. */
function toCard(profile, user, { unlocked, tracking }) {
  return {
    candidateId: user._id,
    name: user.fullName,
    avatar: user.avatar?.url,
    gender: user.gender,
    isVerified: user.isVerified,
    mobileVerified: Boolean(user.mobileVerifiedAt),
    emailVerified: Boolean(user.emailVerifiedAt),
    lastActiveAt: user.lastActiveAt,
    labels: user.labels,
    email: unlocked ? user.email : maskEmail(user.email || ''),
    mobile: unlocked ? user.mobile : maskMobile(user.mobile || ''),
    contactUnlocked: unlocked,
    hasResume: Boolean(profile.resume?.key),
    experienceLevel: profile.experienceLevel,
    totalExperienceMonths: profile.totalExperienceMonths,
    currentJobTitle: profile.currentJobTitle,
    currentEmployer: profile.currentEmployer,
    currentSalary: profile.currentSalary,
    expectedSalary: profile.preferences?.expectedSalary,
    noticePeriod: profile.noticePeriod,
    currentLocation: profile.currentLocation,
    preferredLocations: profile.preferences?.locations,
    keySkills: profile.keySkills,
    resumeHeadline: profile.resumeHeadline,
    highestEducation: profile.educations?.find((e) => e.level === profile.highestEducationLevel) || profile.educations?.[0],
    previousEmployers: (profile.employments || [])
      .filter((e) => !e.isCurrent)
      .slice(0, 3)
      .map((e) => ({ jobTitle: e.jobTitle, employerName: e.employerName })),
    profileCompletion: profile.profileCompletion,
    isBoosted: profile.boostUntil > new Date(),
    profileUpdatedAt: profile.updatedAt,
    tracking: tracking
      ? { stage: tracking.stage, screeningStatus: tracking.screeningStatus, callingStatus: tracking.callingStatus, messagingStatus: tracking.messagingStatus }
      : null,
  };
}

/* ----------------------------------------------------------------- search */

/** "Hide candidates that are": already unlocked / viewed / downloaded in Excel / invited / invited by WhatsApp. */
async function alreadyHandledIds(orgId, hide = []) {
  if (!hide?.length) return [];
  const types = { unlocked: 'contact_unlock', viewed: 'view', downloaded: 'excel_download' };
  const accessTypes = hide.map((h) => types[h]).filter(Boolean);
  const [access, invited, whatsapp] = await Promise.all([
    accessTypes.length ? ProfileAccess.distinct('candidate', { organization: orgId, type: { $in: accessTypes } }) : [],
    hide.includes('invited') ? JobInvite.distinct('candidate', { organization: orgId }) : [],
    hide.includes('invited_whatsapp') ? CandidateTracking.distinct('candidate', { organization: orgId, messagingStatus: 'whatsapp_done' }) : [],
  ]);
  return [...access, ...invited, ...whatsapp];
}

export async function search(member, filters, { page, limit }) {
  const orgId = member.employer.organization;
  await assertResumeAccess(orgId);
  await consume(member, 'resume_search', 1);

  const nearCities = filters.distanceKm && filters.locations?.length ? await citiesWithin(filters.locations, filters.distanceKm) : undefined;
  const { candidateFilter, userFilter, postFilter } = buildTalentQuery({ ...filters, nearCities });
  const hidden = [...(await hiddenCandidateIdsFor(orgId)), ...(await alreadyHandledIds(orgId, filters.hide))];
  if (hidden.length) candidateFilter.user = { $nin: hidden };
  const hasText = Boolean(candidateFilter.$text);
  delete userFilter.role;

  const pipeline = [
    { $match: candidateFilter },
    ...(hasText ? [{ $addFields: { _score: { $meta: 'textScore' } } }] : []),
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'u',
        pipeline: [
          { $match: { role: 'candidate', ...userFilter } },
          {
            $project: {
              fullName: 1,
              avatar: 1,
              gender: 1,
              isVerified: 1,
              mobileVerifiedAt: 1,
              emailVerifiedAt: 1,
              lastActiveAt: 1,
              labels: 1,
              email: 1,
              mobile: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    { $unwind: '$u' },
    ...(postFilter ? [{ $match: postFilter }] : []),
    {
      // Text relevance unless the employer picked another order.
      $sort: hasText && ['relevance', 'ai', undefined].includes(filters.sort) ? { _score: -1, boostUntil: -1, profileCompletion: -1 } : PIPELINE_SORTS[filters.sort] || talentSort(filters.sort, false),
    },
    { $limit: MAX_RESULTS },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { ...CARD_FIELDS, u: 1 } }], total: [{ $count: 'n' }] } },
  ];
  const [res] = await Candidate.aggregate(pipeline).allowDiskUse(true);
  const rows = res?.items || [];
  const total = res?.total?.[0]?.n || 0;

  const ids = rows.map((r) => r.user);
  const [unlocks, trackings] = await Promise.all([
    ProfileAccess.find({ organization: orgId, candidate: { $in: ids }, type: 'contact_unlock' })
      .select('candidate')
      .lean(),
    CandidateTracking.find({ organization: orgId, candidate: { $in: ids } }).lean(),
  ]);
  const unlocked = new Set(unlocks.map((u) => String(u.candidate)));
  const track = new Map(trackings.map((t) => [String(t.candidate), t]));

  let cards = rows.map((r) => toCard(r, r.u, { unlocked: unlocked.has(String(r.user)), tracking: track.get(String(r.user)) }));

  // "AI relevance": re-rank this page against the chosen job (or the search itself).
  if (filters.sort === 'ai' && filters.jobId) {
    const job = await Job.findById(filters.jobId).lean();
    if (job) {
      const weights = await getWeights();
      const scored = rows.map((r, i) => ({ card: cards[i], s: scoreMatch(r, job, weights).score }));
      cards = scored.sort((a, b) => b.s - a.s).map((x) => ({ ...x.card, matchScore: x.s }));
    }
  }

  Candidate.updateMany({ user: { $in: ids } }, { $inc: { 'stats.searchAppearances': 1 } }).catch(() => {});
  RecentSearch.create({
    owner: member._id,
    organization: orgId,
    scope: 'resume',
    filters,
    summary: (filters.keywords || []).join(', '),
    resultCount: total,
  }).catch(() => {});
  return { items: cards, total, page, limit, capped: total >= MAX_RESULTS };
}

/** Builds resume-search filters from a job post ("Prefill Invite Search Results"). */
export async function filtersFromJob(member, jobId) {
  const job = await Job.findOne({ _id: jobId, organization: member.employer.organization }).lean();
  if (!job) throw ApiError.notFound('Job not found');
  return {
    jobId: String(job._id),
    skills: job.keySkills?.slice(0, 15),
    skillMode: 'any',
    designations: [job.designation || job.title].filter(Boolean),
    experienceMin: job.experience?.min,
    experienceMax: job.experience?.max,
    salaryMax: job.salary?.max,
    locations: (job.locations || []).map((l) => l.city).filter(Boolean),
    includeRelocate: true,
    industries: job.industries,
    departments: job.departments,
    roles: job.roles,
    educationLevels: job.education?.levels,
    sort: 'ai',
  };
}

/* ----------------------------------------------------- profile & contact */

async function assertVisible(orgId, candidateId) {
  if (await isBlockedBetween({ candidateUserId: candidateId, organizationId: orgId })) throw ApiError.notFound('Candidate not found');
  const user = await User.findOne({ _id: candidateId, role: 'candidate', status: 'active' }).lean();
  if (!user) throw ApiError.notFound('Candidate not found');
  return user;
}

export async function viewProfile(member, candidateId, { source = 'search' } = {}) {
  const orgId = member.employer.organization;
  const user = await assertVisible(orgId, candidateId);
  // Applicants to the org's jobs are always viewable; otherwise resume DB access is needed.
  const applied = await Application.exists({ organization: orgId, candidate: candidateId });
  if (!applied) await assertResumeAccess(orgId);

  const [profile, unlocked, tracking, applications] = await Promise.all([
    Candidate.findOne({ user: candidateId }).lean(),
    ProfileAccess.exists({ organization: orgId, candidate: candidateId, type: 'contact_unlock' }),
    CandidateTracking.findOne({ organization: orgId, candidate: candidateId }).populate('comments.by', 'fullName').lean(),
    Application.find({ organization: orgId, candidate: candidateId }).select('job stage screeningStatus createdAt').populate('job', 'title uid').lean(),
  ]);
  if (!profile) throw ApiError.notFound('Candidate profile not found');

  const fresh = !(await ProfileAccess.exists({
    organization: orgId,
    candidate: candidateId,
    type: 'view',
    createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
  }));
  if (fresh) {
    await ProfileAccess.create({ organization: orgId, member: member._id, candidate: candidateId, type: 'view', source });
    await Candidate.updateOne({ user: candidateId }, { $inc: { 'stats.profileViews': 1 } });
    notify(candidateId, {
      type: 'profile_viewed',
      title: 'A recruiter viewed your profile',
      body: (await Organization.findById(orgId).select('name').lean())?.name,
      channels: ['in_app'],
    });
  }

  const contactVisible = Boolean(unlocked) || Boolean(applied);
  const out = {
    ...toCard(profile, user, { unlocked: contactVisible, tracking }),
    about: user.about,
    profile: { ...profile, resume: undefined, resumeBuilder: undefined, guardianName: undefined },
    trackingDetail: tracking,
    applications,
  };
  return out;
}

export async function unlockContact(member, candidateId) {
  const orgId = member.employer.organization;
  const user = await assertVisible(orgId, candidateId);
  const already = await ProfileAccess.exists({ organization: orgId, candidate: candidateId, type: 'contact_unlock' });
  const applied = await Application.exists({ organization: orgId, candidate: candidateId });
  if (!already && !applied) {
    await assertResumeAccess(orgId);
    await consume(member, 'resume_view', 1, { ref: String(candidateId) });
    await ProfileAccess.create({ organization: orgId, member: member._id, candidate: candidateId, type: 'contact_unlock' });
    await CandidateTracking.updateOne(
      { organization: orgId, candidate: candidateId },
      { $set: { contactUnlockedAt: new Date(), updatedBy: member._id } },
      { upsert: true },
    );
  }
  return { email: user.email, mobile: user.mobile, countryCode: user.countryCode };
}

export async function resumeDownload(member, candidateId) {
  const orgId = member.employer.organization;
  await assertVisible(orgId, candidateId);
  const profile = await Candidate.findOne({ user: candidateId }).select('resume').lean();
  if (!profile?.resume?.key) throw ApiError.notFound('Candidate has not uploaded a resume');
  const applied = await Application.exists({ organization: orgId, candidate: candidateId });
  const already = await ProfileAccess.exists({ organization: orgId, candidate: candidateId, type: 'resume_download' });
  if (!applied && !already) {
    await assertResumeAccess(orgId);
    await consume(member, 'resume_download', 1, { ref: String(candidateId) });
  }
  await ProfileAccess.create({ organization: orgId, member: member._id, candidate: candidateId, type: 'resume_download' });
  await Candidate.updateOne({ user: candidateId }, { $inc: { 'stats.resumeDownloads': 1 } });
  return { url: await signedUrl(profile.resume.key, 600, profile.resume.name), name: profile.resume.name };
}

export async function updateTracking(member, candidateId, data) {
  const orgId = member.employer.organization;
  await assertVisible(orgId, candidateId);
  const update = { $set: { updatedBy: member._id } };
  for (const k of ['screeningStatus', 'callingStatus']) if (data[k]) update.$set[k] = data[k];
  if (data.stage !== undefined) update.$set.stage = data.stage || null;
  if (data.messagingStatus) update.$addToSet = { messagingStatus: { $each: data.messagingStatus } };
  const push = {};
  if (data.comment) push.comments = { body: data.comment, by: member._id, at: new Date() };
  if (data.forward) push.forwardedVia = { ...data.forward, by: member._id, at: new Date() };
  if (Object.keys(push).length) update.$push = push;
  if (data.callingStatus || data.messagingStatus) update.$set.lastContactedAt = new Date();
  return CandidateTracking.findOneAndUpdate({ organization: orgId, candidate: candidateId }, update, { upsert: true, new: true }).lean();
}

export async function blockCandidate(member, candidateId, reason) {
  await UserBlock.updateOne(
    { blockerUser: member._id, targetType: 'candidate', targetUser: candidateId },
    { $set: { blockerOrganization: member.employer.organization, reason } },
    { upsert: true },
  );
  return { blocked: true };
}

export async function unblockCandidate(member, candidateId) {
  await UserBlock.deleteMany({ blockerOrganization: member.employer.organization, targetType: 'candidate', targetUser: candidateId });
  return { blocked: false };
}

/* --------------------------------------------------------- saved searches */

function ownScope(member, perm) {
  return hasEmployerPermission(member, perm) ? { organization: member.employer.organization } : { owner: member._id };
}

/** "Searched / Folders filters": Today, Yesterday, In last 2 / 5 / 7 days or a custom range (on last update). */
export async function listSavedSearches(member, { tab = 'mine', page, limit, skip, ...span }) {
  let filter;
  if (tab === 'shared') filter = { organization: member.employer.organization, scope: 'resume', sharedWith: member._id };
  else if (tab === 'all') filter = { ...ownScope(member, 'saved_search.manage_all'), scope: 'resume' };
  else filter = { owner: member._id, scope: 'resume' };
  Object.assign(filter, dateRangeFilter(span, 'updatedAt'));
  const [items, total] = await Promise.all([
    SavedSearch.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName').lean(),
    SavedSearch.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export const recentSearches = (member, scope = 'resume', span = {}) =>
  RecentSearch.find({ owner: member._id, scope, ...dateRangeFilter(span) })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

export async function saveSearch(member, { name, filters, sharedWith, alertEnabled }) {
  return SavedSearch.create({
    owner: member._id,
    organization: member.employer?.organization,
    scope: member.employer ? 'resume' : 'job',
    name,
    filters,
    sharedWith,
    alertEnabled,
  });
}

export async function updateSavedSearch(member, id, data) {
  const doc = await SavedSearch.findOneAndUpdate({ _id: id, ...ownScope(member, 'saved_search.manage_all') }, { $set: data }, { new: true });
  if (!doc) throw ApiError.notFound('Saved search not found');
  return doc;
}

export async function deleteSavedSearch(member, id) {
  const res = await SavedSearch.deleteOne({ _id: id, ...ownScope(member, 'saved_search.manage_all') });
  if (!res.deletedCount) throw ApiError.notFound('Saved search not found');
}

/* --------------------------------------------------------------- folders */

const SYSTEM_FOLDERS = ['accessed', 'commented', 'contacted', 'shortlisted', 'rejected', 'hold'];

export async function listFolders(member, { tab = 'mine', ...span }) {
  const orgId = member.employer.organization;
  const filter = {
    ...(tab === 'shared'
      ? { organization: orgId, sharedWith: member._id }
      : tab === 'all' && hasEmployerPermission(member, 'folder.manage_all')
        ? { organization: orgId }
        : { organization: orgId, owner: member._id }),
    ...dateRangeFilter(span, 'updatedAt'),
  };
  const folders = await CandidateFolder.aggregate([
    { $match: filter },
    { $project: { name: 1, description: 1, owner: 1, sharedWith: 1, createdAt: 1, updatedAt: 1, count: { $size: '$candidates' } } },
    { $sort: { updatedAt: -1 } },
  ]);
  const [accessed, commented, contacted, shortlisted, rejected, hold] = await Promise.all([
    ProfileAccess.distinct('candidate', { organization: orgId }).then((x) => x.length),
    CandidateTracking.countDocuments({ organization: orgId, 'comments.0': { $exists: true } }),
    CandidateTracking.countDocuments({ organization: orgId, lastContactedAt: { $ne: null } }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'shortlisted' }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'rejected' }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'on_hold' }),
  ]);
  return { system: { accessed, commented, contacted, shortlisted, rejected, hold }, folders };
}

export async function systemFolderCandidates(member, key, { page, limit, skip }) {
  if (!SYSTEM_FOLDERS.includes(key)) throw ApiError.notFound('Folder not found');
  const orgId = member.employer.organization;
  let ids;
  if (key === 'accessed') ids = await ProfileAccess.distinct('candidate', { organization: orgId });
  else {
    const filter = { organization: orgId };
    if (key === 'commented') filter['comments.0'] = { $exists: true };
    if (key === 'contacted') filter.lastContactedAt = { $ne: null };
    if (key === 'shortlisted') filter.screeningStatus = 'shortlisted';
    if (key === 'rejected') filter.screeningStatus = 'rejected';
    if (key === 'hold') filter.screeningStatus = 'on_hold';
    ids = await CandidateTracking.distinct('candidate', filter);
  }
  return candidatesByIds(orgId, ids, { page, limit, skip });
}

async function candidatesByIds(orgId, ids, { page, limit, skip }) {
  const slice = ids.slice(skip, skip + limit);
  const [profiles, users, unlocks, tracks] = await Promise.all([
    Candidate.find({ user: { $in: slice } })
      .select(Object.keys(CARD_FIELDS).join(' '))
      .lean(),
    User.find({ _id: { $in: slice } })
      .select('fullName avatar gender isVerified mobileVerifiedAt emailVerifiedAt lastActiveAt labels email mobile')
      .lean(),
    ProfileAccess.find({ organization: orgId, candidate: { $in: slice }, type: 'contact_unlock' })
      .select('candidate')
      .lean(),
    CandidateTracking.find({ organization: orgId, candidate: { $in: slice } }).lean(),
  ]);
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const unlocked = new Set(unlocks.map((x) => String(x.candidate)));
  const tMap = new Map(tracks.map((t) => [String(t.candidate), t]));
  const items = profiles
    .filter((p) => uMap.has(String(p.user)))
    .map((p) => toCard(p, uMap.get(String(p.user)), { unlocked: unlocked.has(String(p.user)), tracking: tMap.get(String(p.user)) }));
  return { items, total: ids.length, page, limit };
}

async function getFolder(member, id, { write = false } = {}) {
  const orgId = member.employer.organization;
  const folder = await CandidateFolder.findOne({ _id: id, organization: orgId });
  if (!folder) throw ApiError.notFound('Folder not found');
  const isOwner = String(folder.owner) === String(member._id);
  const shared = folder.sharedWith.some((x) => String(x) === String(member._id));
  const all = hasEmployerPermission(member, 'folder.manage_all');
  if (!(isOwner || all || (!write && shared))) throw ApiError.forbidden('You cannot access this folder');
  return folder;
}

export async function folderCandidates(member, id, pg) {
  const folder = await getFolder(member, id);
  return candidatesByIds(member.employer.organization, folder.candidates.map((c) => c.candidate).reverse(), pg);
}

export async function createFolder(member, { name, description }) {
  return CandidateFolder.create({ organization: member.employer.organization, owner: member._id, name, description });
}

export async function updateFolder(member, id, { name, description, sharedWith }) {
  const folder = await getFolder(member, id, { write: true });
  if (name) folder.name = name;
  if (description !== undefined) folder.description = description;
  if (sharedWith) {
    const valid = await User.find({ _id: { $in: sharedWith }, 'employer.organization': member.employer.organization })
      .select('_id')
      .lean();
    folder.sharedWith = valid.map((v) => v._id);
  }
  await folder.save();
  return folder;
}

export async function deleteFolder(member, id) {
  const folder = await getFolder(member, id, { write: true });
  await folder.deleteOne();
}

export async function addToFolder(member, id, candidateIds) {
  const folder = await getFolder(member, id);
  const existing = new Set(folder.candidates.map((c) => String(c.candidate)));
  for (const cid of candidateIds) if (!existing.has(String(cid))) folder.candidates.push({ candidate: cid, addedBy: member._id });
  if (folder.candidates.length > 5000) throw ApiError.badRequest('A folder can hold up to 5000 candidates');
  await folder.save();
  return { count: folder.candidates.length };
}

export async function removeFromFolder(member, id, candidateIds) {
  const folder = await getFolder(member, id);
  const remove = new Set(candidateIds.map(String));
  folder.candidates = folder.candidates.filter((c) => !remove.has(String(c.candidate)));
  await folder.save();
  return { count: folder.candidates.length };
}

/* ----------------------------------------------------------------- invites */

/**
 * Bulk "Invite to Apply" - excludes candidates already invited to (or applied for) the job.
 * Each new invite consumes one invite credit.
 */
export async function inviteCandidates(member, jobId, { candidateIds, message }) {
  const orgId = member.employer.organization;
  const job = await Job.findOne({ _id: jobId, organization: orgId, status: 'active' }).lean();
  if (!job) throw ApiError.badRequest('Invites can only be sent for active jobs', undefined, 'JOB_NOT_ACTIVE');
  const [invited, applied, hidden] = await Promise.all([
    JobInvite.distinct('candidate', { job: jobId, candidate: { $in: candidateIds } }),
    Application.distinct('candidate', { job: jobId, candidate: { $in: candidateIds } }),
    hiddenCandidateIdsFor(orgId),
  ]);
  const exclude = new Set([...invited, ...applied, ...hidden].map(String));
  const fresh = [...new Set(candidateIds.map(String))].filter((id) => !exclude.has(id));
  if (!fresh.length) return { invited: 0, skipped: candidateIds.length, message: 'All selected candidates were already invited or applied' };

  await consume(member, 'invite', fresh.length, { ref: String(jobId) });
  const users = await User.find({ _id: { $in: fresh }, role: 'candidate', status: 'active' })
    .select('fullName email')
    .lean();
  await JobInvite.insertMany(
    users.map((u) => ({ job: jobId, organization: orgId, candidate: u._id, invitedBy: member._id, message })),
    { ordered: false },
  ).catch(() => {});
  await Job.updateOne({ _id: jobId }, { $inc: { 'stats.invites': users.length } });

  const url = `${config.urls.web}/jobs/${job.slug}?invite=1`;
  for (const u of users) {
    notify(u._id, {
      type: 'job_invite',
      title: `${job.orgSnapshot?.name} invited you to apply`,
      body: job.title,
      data: { screen: 'job', jobId: String(job._id), slug: job.slug },
      channels: ['in_app', 'push'],
    });
    if (u.email)
      sendEmail({
        to: u.email,
        template: 'jobInvite',
        vars: { name: u.fullName, jobTitle: job.title, company: job.orgSnapshot?.name, url, message },
        category: 'bulk',
        user: u._id,
        sentBy: member._id,
      }).catch(() => {});
  }
  return { invited: users.length, skipped: candidateIds.length - users.length };
}

export async function jobInvites(member, jobId, { page, limit, skip, status }) {
  const filter = { job: jobId, organization: member.employer.organization, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    JobInvite.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('candidate', 'fullName avatar').populate('invitedBy', 'fullName').lean(),
    JobInvite.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/* Candidate side */
export async function myInvites(userId, { page, limit, skip, status }) {
  const filter = { candidate: userId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    JobInvite.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('job', 'title slug kind orgSnapshot locations salary status')
      .select('-invitedBy')
      .lean(),
    JobInvite.countDocuments(filter),
  ]);
  await JobInvite.updateMany(
    { _id: { $in: items.filter((i) => i.status === 'sent').map((i) => i._id) } },
    { $set: { status: 'viewed', viewedAt: new Date() } },
  );
  return { items, total, page, limit };
}

export async function declineInvite(userId, id) {
  const res = await JobInvite.findOneAndUpdate(
    { _id: id, candidate: userId, status: { $in: ['sent', 'viewed'] } },
    { $set: { status: 'declined', respondedAt: new Date() } },
    { new: true },
  );
  if (!res) throw ApiError.notFound('Invite not found');
  return res;
}
