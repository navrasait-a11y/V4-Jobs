import ApiError from '../../shared/errors/ApiError.js';
import { hasEmployerPermission } from '../../shared/middleware/auth.js';
import { recordSearch } from '../search/searchStats.service.js';
import { maskEmail, maskMobile, escapeRegex } from '../../shared/utils/helpers.js';
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
import { recordProfileView } from '../candidates/profileViews.service.js';

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
  if (page === 1) recordSearch({ terms: [...(filters.keywords || []), filters.q].filter((t) => typeof t === 'string'), scope: 'candidates', total });
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

  await recordProfileView({ candidateId, member, source });

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
    sharedWith: member.employer ? await teamOnly(member, sharedWith) : undefined,
    alertEnabled,
  });
}

export async function updateSavedSearch(member, id, data) {
  if (data.sharedWith) data = { ...data, sharedWith: await teamOnly(member, data.sharedWith) };
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
const FOLDER_CAPACITY = 5000;
const FOLDER_SORTS = { '-updatedAt': { updatedAt: -1 }, updatedAt: { updatedAt: 1 }, name: { nameLower: 1 }, '-name': { nameLower: -1 }, '-count': { count: -1, updatedAt: -1 }, '-createdAt': { createdAt: -1 } };

/** Folders saved before sharing modes existed have no `visibility`: a share list means "selected". */
const visibilityOf = (folder) => folder.visibility || (folder.sharedWith?.length ? 'selected' : 'private');

/**
 * What a member may do with a folder:
 *   owner - everything (the creator, or anyone with "manage all folders")
 *   edit  - open it, add and remove candidates (shared with "can add and remove")
 *   view  - open it only
 *   null  - not visible at all
 */
function folderAccess(folder, member) {
  if (String(folder.owner?._id || folder.owner) === String(member._id) || hasEmployerPermission(member, 'folder.manage_all')) return 'owner';
  const visibility = visibilityOf(folder);
  const shared = visibility === 'team' || (visibility === 'selected' && (folder.sharedWith || []).some((x) => String(x?._id || x) === String(member._id)));
  if (!shared) return null;
  return folder.sharedAccess === 'edit' ? 'edit' : 'view';
}

const sharedWithMe = (member) => ({
  owner: { $ne: member._id },
  $or: [{ visibility: 'team' }, { visibility: { $in: ['selected', null] }, sharedWith: member._id }],
});

/**
 * Folder list. tab: mine | shared (other people's folders I can open) | all (everything I can open;
 * the whole account for "manage all folders"). Supports name search, sorting, paging and the
 * "Folders filters" date range (on last update).
 */
export async function listFolders(member, { tab = 'mine', q, sort = '-updatedAt', page = 1, limit = 200, ...span } = {}) {
  const orgId = member.employer.organization;
  const manageAll = hasEmployerPermission(member, 'folder.manage_all');
  const scope =
    tab === 'shared' ? sharedWithMe(member) : tab === 'all' ? (manageAll ? {} : { $or: [{ owner: member._id }, sharedWithMe(member)] }) : { owner: member._id };
  const match = { organization: orgId, ...scope, ...dateRangeFilter(span, 'updatedAt') };
  if (q?.trim()) match.name = new RegExp(escapeRegex(q.trim()), 'i');

  const [rows, total, mine, shared, system] = await Promise.all([
    CandidateFolder.aggregate([
      { $match: match },
      { $project: { name: 1, nameLower: { $toLower: '$name' }, description: 1, owner: 1, visibility: 1, sharedAccess: 1, sharedWith: 1, createdAt: 1, updatedAt: 1, count: { $size: '$candidates' } } },
      { $sort: FOLDER_SORTS[sort] || FOLDER_SORTS['-updatedAt'] },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    CandidateFolder.countDocuments(match),
    CandidateFolder.countDocuments({ organization: orgId, owner: member._id }),
    CandidateFolder.countDocuments({ organization: orgId, ...sharedWithMe(member) }),
    systemFolderCounts(orgId),
  ]);

  const people = await User.find({ _id: { $in: [...new Set(rows.flatMap((f) => [f.owner, ...(f.sharedWith || [])]).map(String))] } })
    .select('fullName avatar employer.designation')
    .lean();
  const byId = new Map(people.map((u) => [String(u._id), { _id: u._id, fullName: u.fullName, avatar: u.avatar?.url, designation: u.employer?.designation }]));
  const folders = rows.map(({ nameLower: _n, ...f }) => ({
    ...f,
    visibility: visibilityOf(f),
    sharedAccess: f.sharedAccess || 'view',
    owner: byId.get(String(f.owner)) || { _id: f.owner },
    sharedWith: (f.sharedWith || []).map((id) => byId.get(String(id))).filter(Boolean),
    access: folderAccess(f, member),
  }));
  return { system, folders, total, page, limit, counts: { mine, shared }, capacity: FOLDER_CAPACITY };
}

async function systemFolderCounts(orgId) {
  const [accessed, commented, contacted, shortlisted, rejected, hold] = await Promise.all([
    ProfileAccess.distinct('candidate', { organization: orgId }).then((x) => x.length),
    CandidateTracking.countDocuments({ organization: orgId, 'comments.0': { $exists: true } }),
    CandidateTracking.countDocuments({ organization: orgId, lastContactedAt: { $ne: null } }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'shortlisted' }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'rejected' }),
    CandidateTracking.countDocuments({ organization: orgId, screeningStatus: 'on_hold' }),
  ]);
  return { accessed, commented, contacted, shortlisted, rejected, hold };
}

export async function systemFolderCandidates(member, key, { page, limit, skip }) {
  if (!SYSTEM_FOLDERS.includes(key)) throw ApiError.badRequest('Unknown folder');
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

/** Candidate cards for a list of ids, in the order given. `extra` adds per-candidate fields (who filed them, when). */
async function candidatesByIds(orgId, ids, { page, limit, skip }, extra = new Map()) {
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
  const pMap = new Map(profiles.map((p) => [String(p.user), p]));
  const unlocked = new Set(unlocks.map((x) => String(x.candidate)));
  const tMap = new Map(tracks.map((t) => [String(t.candidate), t]));
  const items = slice
    .map(String)
    .filter((id) => uMap.has(id) && pMap.has(id))
    .map((id) => ({ ...toCard(pMap.get(id), uMap.get(id), { unlocked: unlocked.has(id), tracking: tMap.get(id) }), ...(extra.get(id) || {}) }));
  return { items, total: ids.length, page, limit };
}

async function getFolder(member, id, need = 'view') {
  const folder = await CandidateFolder.findOne({ _id: id, organization: member.employer.organization });
  if (!folder) throw ApiError.notFound('Folder not found');
  const access = folderAccess(folder, member);
  const rank = { view: 1, edit: 2, owner: 3 };
  if (!access) throw ApiError.forbidden('You cannot open this folder', 'FOLDER_FORBIDDEN');
  if (rank[access] < rank[need]) {
    throw ApiError.forbidden(need === 'owner' ? 'Only the folder owner can change this folder' : 'This folder is shared with you as view only', 'FOLDER_READ_ONLY');
  }
  folder.$locals.access = access;
  return folder;
}

/** Only people of the same organization can be shared with - ids from anywhere else are dropped. */
async function teamOnly(member, ids = []) {
  if (!ids.length) return [];
  const valid = await User.find({ _id: { $in: ids, $ne: member._id }, 'employer.organization': member.employer.organization, status: { $ne: 'trashed' } })
    .select('_id')
    .lean();
  return valid.map((v) => v._id);
}

/** Validates the sharing fields of a create / update and returns what to store. */
async function resolveSharing(member, { visibility, sharedWith, sharedAccess }, current = {}) {
  const out = {};
  const next = visibility ?? (sharedWith ? (sharedWith.length ? 'selected' : 'private') : undefined);
  if (next === undefined && sharedAccess === undefined) return out;
  const target = next ?? visibilityOf(current);
  if (target !== 'private' && !hasEmployerPermission(member, 'saved_candidates.share')) {
    throw ApiError.forbidden('Your team role does not allow sharing folders', 'PERMISSION_DENIED');
  }
  if (next !== undefined) out.visibility = next;
  if (target === 'selected') {
    if (sharedWith) out.sharedWith = await teamOnly(member, sharedWith);
    const list = out.sharedWith ?? current.sharedWith ?? [];
    if (!list.length) throw ApiError.badRequest('Choose at least one team member to share with', undefined, 'SHARE_NEEDS_MEMBERS');
  } else if (next !== undefined) out.sharedWith = [];
  if (sharedAccess) out.sharedAccess = sharedAccess;
  return out;
}

async function assertNameFree(member, name, exceptId) {
  const clash = await CandidateFolder.exists({
    organization: member.employer.organization,
    owner: member._id,
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (clash) throw ApiError.conflict(`You already have a folder named "${name}"`, 'FOLDER_EXISTS');
}

function notifyShared(member, folder, userIds) {
  for (const id of userIds) {
    notify(id, {
      type: 'folder_shared',
      title: 'A folder was shared with you',
      body: `${member.fullName} shared the folder "${folder.name}" with you`,
      data: { screen: 'folders', folderId: String(folder._id) },
      channels: ['in_app', 'push'],
    });
  }
}

async function describeFolder(folder, member) {
  const people = await User.find({ _id: { $in: [folder.owner, ...folder.sharedWith] } })
    .select('fullName avatar employer.designation')
    .lean();
  const byId = new Map(people.map((u) => [String(u._id), { _id: u._id, fullName: u.fullName, avatar: u.avatar?.url, designation: u.employer?.designation }]));
  return {
    _id: folder._id,
    name: folder.name,
    description: folder.description || '',
    visibility: visibilityOf(folder),
    sharedAccess: folder.sharedAccess || 'view',
    owner: byId.get(String(folder.owner)) || { _id: folder.owner },
    sharedWith: folder.sharedWith.map((id) => byId.get(String(id))).filter(Boolean),
    count: folder.candidates.length,
    capacity: FOLDER_CAPACITY,
    access: folder.$locals.access || folderAccess(folder, member),
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export async function folderDetails(member, id) {
  return describeFolder(await getFolder(member, id), member);
}

/** Candidates of a folder, newest filed first, with who filed each one and when. `q` searches by name. */
export async function folderCandidates(member, id, { page, limit, skip, q }) {
  const folder = await getFolder(member, id);
  const orgId = member.employer.organization;
  const hidden = new Set((await hiddenCandidateIdsFor(orgId)).map(String));
  let entries = [...folder.candidates].reverse().filter((c) => !hidden.has(String(c.candidate)));
  if (q?.trim()) {
    const hits = await User.find({ _id: { $in: entries.map((c) => c.candidate) }, fullName: new RegExp(escapeRegex(q.trim()), 'i') }).distinct('_id');
    const keep = new Set(hits.map(String));
    entries = entries.filter((c) => keep.has(String(c.candidate)));
  }
  const pageEntries = entries.slice(skip, skip + limit);
  const adders = await User.find({ _id: { $in: pageEntries.map((c) => c.addedBy).filter(Boolean) } })
    .select('fullName')
    .lean();
  const names = new Map(adders.map((u) => [String(u._id), u.fullName]));
  const extra = new Map(pageEntries.map((c) => [String(c.candidate), { addedAt: c.addedAt, addedBy: names.get(String(c.addedBy)) || null }]));
  return candidatesByIds(orgId, entries.map((c) => c.candidate), { page, limit, skip }, extra);
}

function fileCandidates(folder, candidateIds, memberId) {
  const existing = new Set(folder.candidates.map((c) => String(c.candidate)));
  let added = 0;
  for (const cid of [...new Set(candidateIds.map(String))]) {
    if (existing.has(cid)) continue;
    folder.candidates.push({ candidate: cid, addedBy: memberId });
    added += 1;
  }
  if (folder.candidates.length > FOLDER_CAPACITY) throw ApiError.badRequest(`A folder can hold up to ${FOLDER_CAPACITY} candidates`, undefined, 'FOLDER_FULL');
  return added;
}

/** Only real candidate accounts can be filed. */
const candidatesOnly = (ids) => User.find({ _id: { $in: ids }, role: 'candidate' }).distinct('_id');

export async function createFolder(member, { name, description, candidateIds = [], ...sharing }) {
  await assertNameFree(member, name);
  const share = await resolveSharing(member, sharing);
  const folder = new CandidateFolder({ organization: member.employer.organization, owner: member._id, name, description, visibility: 'private', sharedAccess: 'view', ...share });
  if (candidateIds.length) fileCandidates(folder, await candidatesOnly(candidateIds), member._id);
  try {
    await folder.save();
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict(`You already have a folder named "${name}"`, 'FOLDER_EXISTS');
    throw err;
  }
  notifyShared(member, folder, folder.sharedWith);
  return describeFolder(folder, member);
}

export async function updateFolder(member, id, { name, description, ...sharing }) {
  const folder = await getFolder(member, id, 'owner');
  if (name && name !== folder.name) {
    if (String(folder.owner) === String(member._id)) await assertNameFree(member, name, folder._id);
    folder.name = name;
  }
  if (description !== undefined) folder.description = description;
  const before = new Set(folder.sharedWith.map(String));
  const share = await resolveSharing(member, sharing, folder);
  Object.assign(folder, share);
  try {
    await folder.save();
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict(`A folder named "${folder.name}" already exists`, 'FOLDER_EXISTS');
    throw err;
  }
  notifyShared(member, folder, folder.sharedWith.filter((x) => !before.has(String(x))));
  return describeFolder(folder, member);
}

export async function deleteFolder(member, id) {
  const folder = await getFolder(member, id, 'owner');
  await folder.deleteOne();
}

export async function addToFolder(member, id, candidateIds) {
  const folder = await getFolder(member, id, 'edit');
  const added = fileCandidates(folder, await candidatesOnly(candidateIds), member._id);
  await folder.save();
  return { count: folder.candidates.length, added, alreadyThere: candidateIds.length - added };
}

export async function removeFromFolder(member, id, candidateIds) {
  const folder = await getFolder(member, id, 'edit');
  const remove = new Set(candidateIds.map(String));
  const before = folder.candidates.length;
  folder.candidates = folder.candidates.filter((c) => !remove.has(String(c.candidate)));
  await folder.save();
  return { count: folder.candidates.length, removed: before - folder.candidates.length };
}

/** Copy candidates to another folder, or move them (copy, then take them out of this one). */
export async function transferCandidates(member, id, { candidateIds, targetFolderId, move = false }) {
  if (String(id) === String(targetFolderId)) throw ApiError.badRequest('Choose a different folder', undefined, 'SAME_FOLDER');
  const source = await getFolder(member, id, move ? 'edit' : 'view');
  const target = await getFolder(member, targetFolderId, 'edit');
  const inSource = new Set(source.candidates.map((c) => String(c.candidate)));
  const ids = [...new Set(candidateIds.map(String))].filter((cid) => inSource.has(cid));
  const added = fileCandidates(target, ids, member._id);
  await target.save();
  if (move) {
    const gone = new Set(ids);
    source.candidates = source.candidates.filter((c) => !gone.has(String(c.candidate)));
    await source.save();
  }
  return { added, alreadyThere: ids.length - added, moved: move ? ids.length : 0, target: { _id: target._id, name: target.name, count: target.candidates.length } };
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
