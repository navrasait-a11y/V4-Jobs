import config from '../../config/env.js';
import ApiError from '../../shared/errors/ApiError.js';
import { expandTerm } from '../search/synonyms.js';
import { recordSearch } from '../search/searchStats.service.js';
import { JOB_STATUS, JOB_KIND, ID_PREFIX, USER_STATUS, ROLES } from '../../shared/constants/index.js';
import { generateUid } from '../../shared/models/counter.model.js';
import { uniqueSlug, escapeRegex, omit, normalizeMobile, toArray } from '../../shared/utils/helpers.js';
import { sha256 } from '../../shared/utils/crypto.js';
import { JobView } from './jobView.model.js';
import { parseWorkbook } from '../../shared/utils/excel.js';
import { hasEmployerPermission, isAdmin } from '../../shared/middleware/auth.js';
import Job from './job.model.js';
import Organization from '../employers/organization.model.js';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import { Application } from '../applications/application.model.js';
import { SavedJob, SavedSearch, RecentSearch, CallbackRequest } from '../engagement/engagement.models.js';
import { notify } from '../notifications/notification.service.js';
import { sendOtp, verifyOtp } from '../auth/otp.service.js';
import { getSetting } from '../settings/settings.service.js';
import { consume, refundCredits } from '../billing/usage.service.js';
import { notifyFollowersOfJob } from '../employers/employer.service.js';
import { hiddenOrganizationIdsFor } from '../moderation/blocklist.service.js';
import { createEmployerAccount } from '../users/account.service.js';
import { sendActivation } from '../employers/employer.service.js';
import { getWeights, scoreMatch } from '../matching/matching.service.js';
import { buildJobSearch, jobSort, LIST_FIELDS } from './job.query.js';
import { correctQuery } from './job.spell.js';
import logger from '../../config/logger.js';
import { moneyRequestIn } from './job.screening.js';
import { logActivity } from '../activity/activity.service.js';
import { touchUsage, citiesWithin } from '../masterdata/masterdata.service.js';

const IMMUTABLE = [
  'uid',
  'organization',
  'postedBy',
  'status',
  'stats',
  'slug',
  'source',
  'labels',
  'isFeatured',
  'publishedAt',
  'orgSnapshot',
  'organizationType',
  'kind',
];

function orgSnapshot(org) {
  return { name: org.name, logo: org.logo?.url, isVerified: org.isVerified, slug: org.slug, username: org.username, employerType: org.employerType };
}

/**
 * Hides consultancy client names and private contact details from candidates / public.
 * Phone numbers and e-mails reach a candidate only through `contactActionFor` (Excel: "Call Now /
 * Request Call Back - only visible once the candidate fills the apply form or creates an account").
 */
export function publicJob(job) {
  if (!job) return job;
  const out = { ...job };
  if (out.consultancyClient?.hideName) out.consultancyClient = { hideName: true, industry: out.consultancyClient.industry };
  if (out.contact) {
    const { timeFrom, timeTo, dayFrom, dayTo } = out.contact;
    out.contact = { timeFrom, timeTo, dayFrom, dayTo };
  }
  if (out.walkIn) {
    const { contactName: _n, contactMobile: _m, contactEmail: _e, ...walkIn } = out.walkIn;
    out.walkIn = walkIn;
  }
  delete out.responseAlerts;
  delete out.callbackRequests;
  delete out.uid;
  delete out.collaborators;
  delete out.postedByAdmin;
  delete out.statusReason;
  return out;
}

async function loadOrg(orgId) {
  const org = await Organization.findById(orgId);
  if (!org) throw ApiError.notFound('Organization not found');
  if ([USER_STATUS.BLOCKED, USER_STATUS.SUSPENDED, USER_STATUS.TRASHED].includes(org.status))
    throw ApiError.forbidden(`Employer account is ${org.status}`, 'ORG_DISABLED');
  return org;
}

/** Decides the status a job gets when the employer clicks Publish. */
async function publishStatus(org) {
  if (org.status !== USER_STATUS.ACTIVE) return JOB_STATUS.PENDING; // employer awaiting approval
  return (await getSetting('platform.jobApprovalRequired', false)) ? JOB_STATUS.ADMIN_REVIEW : JOB_STATUS.ACTIVE;
}

async function expiryFrom(data, from = new Date()) {
  if (data.expiresAt) return new Date(data.expiresAt);
  const days = await getSetting('platform.defaultJobExpiryDays', 30);
  return new Date(from.getTime() + days * 24 * 3600 * 1000);
}

/** Employer can edit a job if they own it, or hold job.manage_all, or collaborate on it. */
export function canManageJob(user, job) {
  if (isAdmin(user)) return true;
  if (String(job.organization) !== String(user.employer?.organization)) return false;
  if (hasEmployerPermission(user, 'job.manage_all')) return true;
  return String(job.postedBy) === String(user._id) || (job.collaborators || []).some((c) => String(c) === String(user._id));
}

export async function getManageableJob(user, jobId) {
  const job = await Job.findById(jobId);
  if (!job || job.status === JOB_STATUS.TRASHED) throw ApiError.notFound('Job not found');
  if (!canManageJob(user, job)) throw ApiError.forbidden('You cannot manage this job');
  return job;
}

/* ------------------------------------------------------------ create/edit */

/**
 * Creates a job or internship. `publish=false` saves a draft (auto-save).
 * `prefillFrom` copies an existing job of the same organization ("Prefill from previous jobs").
 */
export async function createJob(user, data, { orgId, publish = false, source = 'direct', adminId } = {}) {
  const org = await loadOrg(orgId || user.employer?.organization);
  let base = {};
  if (data.prefillFrom) {
    const prev = await Job.findOne({ _id: data.prefillFrom, organization: org._id }).lean();
    if (!prev) throw ApiError.notFound('Job to prefill from was not found');
    base = omit(prev, ['_id', ...IMMUTABLE, 'createdAt', 'updatedAt', 'expiresAt', 'deadlineAt', 'closedAt', 'refreshedAt', 'events', '__v']);
  }
  const kind = data.kind || base.kind || JOB_KIND.JOB;
  const payload = { ...base, ...omit(data, [...IMMUTABLE, 'prefillFrom', 'featured']) };
  if (!payload.title) throw ApiError.badRequest('Job title is required');

  const job = new Job({
    ...payload,
    kind,
    uid: await generateUid(kind === JOB_KIND.INTERNSHIP ? ID_PREFIX.internship : ID_PREFIX.job),
    slug: uniqueSlug(`${payload.title}-${payload.locations?.[0]?.city || ''}-${org.name}`),
    organization: org._id,
    organizationType: org.type,
    postedBy: user._id,
    postedByAdmin: adminId,
    orgSnapshot: orgSnapshot(org),
    source: data.prefillFrom ? 'duplicate' : source,
    prefilledFrom: data.prefillFrom,
    status: JOB_STATUS.DRAFT,
  });
  await job.validate();
  await job.save();
  await Organization.updateOne({ _id: org._id }, { $inc: { 'stats.totalJobs': 1 } });
  touchUsage('key_skill', job.keySkills);
  if (publish) return publishJob(user, job._id, { featured: data.featured, skipCredits: Boolean(adminId) });
  return job.toObject();
}

export async function updateJob(user, jobId, data) {
  const job = await getManageableJob(user, jobId);
  job.set(omit(data, [...IMMUTABLE, 'prefillFrom', 'featured']));
  // Significant edits on a live job go back to review when moderation is on.
  if (job.status === JOB_STATUS.ACTIVE && !isAdmin(user) && (await getSetting('platform.jobApprovalRequired', false)) && (data.title || data.description)) {
    job.status = JOB_STATUS.ADMIN_REVIEW;
  }
  await job.save();
  return job.toObject();
}

export async function publishJob(user, jobId, { featured = false, skipCredits = false } = {}) {
  const job = await getManageableJob(user, jobId);
  if (![JOB_STATUS.DRAFT, JOB_STATUS.CLOSED, JOB_STATUS.EXPIRED, JOB_STATUS.REJECTED].includes(job.status)) {
    throw ApiError.badRequest(`Job is already ${job.status}`, undefined, 'INVALID_STATE');
  }
  if (!job.description || !job.locations?.length)
    throw ApiError.badRequest('Add a job description and at least one location before publishing', undefined, 'JOB_INCOMPLETE');
  const org = await loadOrg(job.organization);
  const member = user.role === ROLES.EMPLOYER ? user : await User.findById(job.postedBy);

  const firstPublish = !job.publishedAt;
  if (firstPublish && !skipCredits && !isAdmin(user)) await consume(member, 'job_post', 1, { ref: String(job._id) });
  try {
    if (featured && !job.isFeatured && !isAdmin(user)) await consume(member, 'featured_job', 1, { ref: String(job._id) });
  } catch (err) {
    if (firstPublish && !skipCredits) await refundCredits(org._id, 'job_post', 1, String(job._id));
    throw err;
  }
  const now = new Date();
  job.status = await publishStatus(org);
  const moneyPhrase = isAdmin(user) ? null : moneyRequestIn(job);
  if (moneyPhrase && job.status === JOB_STATUS.ACTIVE) {
    job.status = JOB_STATUS.ADMIN_REVIEW;
    job.statusReason = `Auto-flagged: mentions a fee to candidates ("${moneyPhrase.slice(0, 80)}")`;
  }
  if (featured) {
    job.isFeatured = true;
    job.featuredUntil = new Date(now.getTime() + BOOST_DAYS * 86400000);
    job.labels = [...new Set([...(job.labels || []), 'featured'])];
  }
  job.publishedAt = job.publishedAt || now;
  job.refreshedAt = now;
  job.expiresAt = await expiryFrom({ expiresAt: job.expiresAt && job.expiresAt > now ? job.expiresAt : undefined }, now);
  job.closedAt = undefined;
  await job.save();
  await syncActiveJobCount(org._id);
  if (job.status === JOB_STATUS.ACTIVE) {
    notifyFollowersOfJob(job).catch(() => {});
    logActivity({ user }, { user: user._id, organization: org._id, type: 'job_published', description: job.title, meta: { jobId: job._id } });
  }
  return job.toObject();
}

export async function syncActiveJobCount(orgId) {
  const count = await Job.countDocuments({ organization: orgId, status: JOB_STATUS.ACTIVE });
  await Organization.updateOne({ _id: orgId }, { $set: { 'stats.activeJobs': count } });
}

export async function changeJobState(user, jobId, action) {
  const job = await getManageableJob(user, jobId);
  const now = new Date();
  switch (action) {
    case 'close':
      if (job.status !== JOB_STATUS.ACTIVE) throw ApiError.badRequest('Only active jobs can be closed');
      job.status = JOB_STATUS.CLOSED;
      job.closedAt = now;
      break;
    case 'refresh':
      if (job.status !== JOB_STATUS.ACTIVE) throw ApiError.badRequest('Only active jobs can be refreshed');
      if (job.refreshedAt && now - job.refreshedAt < 24 * 3600 * 1000 && !isAdmin(user))
        throw ApiError.tooMany('A job can be refreshed once every 24 hours', 'REFRESH_LIMIT');
      job.refreshedAt = now;
      break;
    case 'trash':
      job.status = JOB_STATUS.TRASHED;
      job.deletedAt = now;
      break;
    default:
      throw ApiError.badRequest('Unknown action');
  }
  await job.save();
  await syncActiveJobCount(job.organization);
  return job.toObject();
}

export async function duplicateJob(user, jobId) {
  const job = await getManageableJob(user, jobId);
  return createJob(user, { prefillFrom: job._id, title: `${job.title}` }, { orgId: job.organization });
}

export async function setCollaborators(user, jobId, memberIds) {
  const job = await getManageableJob(user, jobId);
  const members = await User.find({ _id: { $in: memberIds }, 'employer.organization': job.organization })
    .select('_id')
    .lean();
  job.collaborators = members.map((m) => m._id);
  await job.save();
  return job.collaborators;
}

/* ---------------------------------------------------------- employer list */

export async function listEmployerJobs(user, q, { page, limit, skip, sort }) {
  const filter = { organization: user.employer.organization, status: { $ne: JOB_STATUS.TRASHED } };
  if (!hasEmployerPermission(user, 'job.manage_all')) filter.$or = [{ postedBy: user._id }, { collaborators: user._id }];
  if (q.status) filter.status = q.status;
  if (q.kind) filter.kind = q.kind;
  if (q.postedBy === 'me') filter.postedBy = user._id;
  else if (q.postedBy) filter.postedBy = q.postedBy;
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$and = [{ $or: [{ title: re }, { uid: q.q.trim().toUpperCase() }, { 'consultancyClient.name': re }] }];
  }
  const [items, total, counts] = await Promise.all([
    Job.find(filter).sort(sort).skip(skip).limit(limit).populate('postedBy', 'fullName email').select('-description -responsibilities').lean(),
    Job.countDocuments(filter),
    Job.aggregate([
      { $match: { organization: user.employer.organization, status: { $ne: JOB_STATUS.TRASHED } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  return { items, total, page, limit, counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) };
}

/* ----------------------------------------------------------- public side */

/** Filters that need a lookup first: "within N km" (nearby cities) and company size (organizations). */
async function resolveSearch(query) {
  const q = { ...query };
  const cities = toArray(q.location || q.locations);
  if (q.distanceKm && cities.length) q.nearCities = await citiesWithin(cities, q.distanceKm);
  const sizes = toArray(q.companySize);
  if (sizes.length && !q.organization) {
    q.organizationIn = await Organization.find({ employeeCount: { $in: sizes } }).distinct('_id');
  }
  return q;
}

const LIST_PROJECTION = Object.fromEntries(LIST_FIELDS.split(/\s+/).filter(Boolean).map((f) => [f, 1]));

/**
 * Typo-tolerant search through an Atlas Search index (ATLAS_SEARCH_INDEX). Returns null when the
 * index is not configured or the query fails, so the caller falls back to the text index.
 */
async function atlasSearch(filter, sort, skip, limit) {
  const index = config.search.atlasIndex;
  const text = filter.$text?.$search;
  if (!index || !text) return null;
  const { $text: _t, ...rest } = filter;
  const fuzzy = { maxEdits: 1, prefixLength: 1 };
  const relevance = Boolean(sort.score);
  try {
    const [res] = await Job.aggregate([
      {
        $search: {
          index,
          compound: {
            should: [
              { text: { query: text, path: ['title', 'designation'], fuzzy, score: { boost: { value: 6 } } } },
              { text: { query: text, path: ['keySkills', 'roles'], fuzzy, score: { boost: { value: 4 } } } },
              { text: { query: text, path: 'orgSnapshot.name', fuzzy, score: { boost: { value: 2 } } } },
              { text: { query: text, path: 'description', fuzzy: { maxEdits: 1, prefixLength: 2 } } },
            ],
            minimumShouldMatch: 1,
          },
        },
      },
      { $match: rest },
      {
        $facet: {
          items: [...(relevance ? [] : [{ $sort: sort }]), { $skip: skip }, { $limit: limit }, { $project: LIST_PROJECTION }],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    return { items: res?.items || [], total: res?.total?.[0]?.n || 0 };
  } catch (err) {
    logger.warn({ err: err.message }, 'Atlas Search failed, using the text index');
    return null;
  }
}

async function runJobSearch(q, sortKey, skip, limit) {
  const filter = buildJobSearch(q);
  const hasText = Boolean(filter.$text);
  const sort = jobSort(sortKey, hasText);
  const atlas = await atlasSearch(filter, sort, skip, limit);
  if (atlas) return atlas;
  const projection = hasText ? { score: { $meta: 'textScore' } } : {};
  const [items, total] = await Promise.all([Job.find(filter, projection).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(), Job.countDocuments(filter)]);
  return { items, total };
}

export async function searchJobs(query, viewer, { page, limit, skip }) {
  const q = await resolveSearch(query);
  if (viewer?.role === ROLES.CANDIDATE) q.excludeOrganizations = await hiddenOrganizationIdsFor(viewer._id);
  // Short forms ("sde", "hr", "ca") also match their full forms in job posts.
  const extra = [query.q, ...toArray(query.keywords)].filter(Boolean).flatMap((t) => expandTerm(t));
  if (extra.length) q.q = [q.q, ...extra].filter(Boolean).join(' ');
  let { items, total } = await runJobSearch(q, query.sort, skip, limit);

  // Spelling help (search text and keyword chips): no results -> show the corrected search instead;
  // only a few results -> offer the correction as "Did you mean".
  const meta = {};
  const keywords = toArray(query.keywords).filter(Boolean);
  const terms = [query.q, ...keywords].filter(Boolean);
  if (terms.length && total < 3 && !query.exact) {
    const fixed = await Promise.all(terms.map((t) => correctQuery(t).catch(() => null)));
    if (fixed.some(Boolean)) {
      const off = query.q ? 1 : 0;
      const fixedQ = query.q ? fixed[0] || query.q : query.q;
      const fixedKeywords = keywords.map((k, i) => fixed[i + off] || k);
      const label = [fixedQ, ...fixedKeywords].filter(Boolean).join(', ');
      if (total === 0) {
        const retry = await runJobSearch({ ...q, q: fixedQ, keywords: fixedKeywords }, query.sort, skip, limit);
        if (retry.total) {
          ({ items, total } = retry);
          Object.assign(meta, { correctedQuery: label, originalQuery: terms.join(', '), correctedKeywords: fixedKeywords, correctedQ: fixedQ || '' });
        }
      } else Object.assign(meta, { didYouMean: label, correctedKeywords: fixedKeywords, correctedQ: fixedQ || '' });
    }
  }

  let enriched = items.map(publicJob);
  if (viewer?.role === ROLES.CANDIDATE && items.length) {
    const ids = items.map((j) => j._id);
    const [applied, saved] = await Promise.all([
      Application.find({ candidate: viewer._id, job: { $in: ids } })
        .select('job')
        .lean(),
      SavedJob.find({ user: viewer._id, job: { $in: ids } })
        .select('job')
        .lean(),
    ]);
    const a = new Set(applied.map((x) => String(x.job)));
    const s = new Set(saved.map((x) => String(x.job)));
    enriched = enriched.map((j) => ({ ...j, hasApplied: a.has(String(j._id)), isSaved: s.has(String(j._id)) }));
    if (query.q || query.keywords || query.location) {
      RecentSearch.create({
        owner: viewer._id,
        scope: 'job',
        filters: query,
        summary: [[query.q, ...toArray(query.keywords)].filter(Boolean).join(', '), toArray(query.location).join(', ')].filter(Boolean).join(' in '),
        resultCount: total,
      }).catch(() => {});
    }
  }
  if (page === 1 && !query.exact) recordSearch({ terms: [meta.correctedQuery ? meta.correctedQuery : query.q, ...(meta.correctedKeywords || keywords)], scope: 'jobs', total });
  return { items: enriched, total, page, limit, meta };
}

const FACETS = {
  workMode: [{ $unwind: '$jobModes' }, { $group: { _id: '$jobModes', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
  department: [{ $unwind: '$departments' }, { $group: { _id: '$departments', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
  industry: [{ $unwind: '$industries' }, { $group: { _id: '$industries', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
  location: [{ $unwind: '$locations' }, { $group: { _id: '$locations.city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
  role: [{ $unwind: '$roles' }, { $group: { _id: '$roles', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
  postedBy: [{ $group: { _id: '$organizationType', count: { $sum: 1 } } }],
  companyType: [{ $group: { _id: '$orgSnapshot.employerType', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
  employmentType: [{ $unwind: '$employmentTypes' }, { $group: { _id: '$employmentTypes', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
  kind: [{ $group: { _id: '$kind', count: { $sum: 1 } } }],
};
const present = (v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);

/**
 * Facet counts for the search side-filters. Disjunctive (Naukri style): a group's counts ignore that
 * group's own filter, so ticking "Data" still lists the other departments to add.
 */
export async function searchFacets(query) {
  const own = Object.keys(FACETS).filter((k) => present(query[k]));
  const shared = Object.fromEntries(Object.entries(FACETS).filter(([k]) => !own.includes(k)));
  const run = async (q, facets) => {
    if (!Object.keys(facets).length) return {};
    const [res] = await Job.aggregate([{ $match: buildJobSearch(await resolveSearch(q)) }, { $facet: facets }]);
    return res || {};
  };
  const parts = await Promise.all([
    run(query, shared),
    ...own.map((k) => {
      const { [k]: _drop, ...rest } = query;
      return run(rest, { [k]: FACETS[k] });
    }),
  ]);
  const res = Object.assign({}, ...parts);
  const clean = (arr) => (arr || []).filter((x) => x._id).map((x) => ({ value: x._id, count: x.count }));
  return Object.fromEntries(Object.keys(FACETS).map((k) => [k, clean(res[k])]));
}

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|curl|wget|python|axios|node-fetch|postman/i;
const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Counts a job view at most once per visitor per day and never for bots, link previews, the
 * employer's own team or admins - so "views" and the apply rate reflect real job seekers.
 */
export async function countJobView(job, viewer, { ip, userAgent } = {}) {
  if (!userAgent || BOT_UA.test(userAgent)) return false;
  if (viewer && (isAdmin(viewer) || String(viewer.employer?.organization) === String(job.organization))) return false;
  const visitor = viewer ? `u:${viewer._id}` : `g:${sha256(`${ip}|${userAgent}`).slice(0, 32)}`;
  try {
    await JobView.create({ job: job._id, visitor, day: istDay() });
  } catch (err) {
    if (err?.code === 11000) return false; // already counted today
    throw err;
  }
  await Job.updateOne({ _id: job._id }, { $inc: { 'stats.views': 1 } });
  return true;
}

export async function getPublicJob(idOrSlug, viewer, client = {}) {
  const isId = /^[a-f\d]{24}$/i.test(idOrSlug);
  const job = await Job.findOne(isId ? { _id: idOrSlug } : { slug: idOrSlug }).lean();
  const canSeeUnpublished = viewer && (isAdmin(viewer) || String(viewer.employer?.organization) === String(job?.organization));
  if (!job || (job.status !== JOB_STATUS.ACTIVE && !canSeeUnpublished && job.status !== JOB_STATUS.EXPIRED && job.status !== JOB_STATUS.CLOSED)) {
    throw ApiError.notFound('Job not found');
  }
  countJobView(job, viewer, client).catch(() => {});

  const org = await Organization.findById(job.organization)
    .select('name slug username logo about employerType industries employeeCount website isVerified stats offices')
    .lean();
  const out = { ...(canSeeUnpublished ? job : publicJob(job)), organizationProfile: org, isOpen: job.status === JOB_STATUS.ACTIVE };

  if (viewer?.role === ROLES.CANDIDATE) {
    const [application, saved, profile] = await Promise.all([
      Application.findOne({ job: job._id, candidate: viewer._id }).select('stage createdAt').lean(),
      SavedJob.exists({ user: viewer._id, job: job._id }),
      Candidate.findOne({ user: viewer._id }).lean(),
    ]);
    out.hasApplied = Boolean(application);
    out.application = application;
    out.isSaved = Boolean(saved);
    out.contactAction = await contactActionFor(job, { requested: Boolean(await CallbackRequest.exists({ job: job._id, candidate: viewer._id })) });
    if (profile) out.match = scoreMatch(profile, job, await getWeights());
  }
  return out;
}

export const CALL_MODES = ['Walk-in', 'Candidates Can Call Me Directly', 'Candidates Can Call Other Recruiter'];
export const CALLBACK_MODES = ['I will Contact Candidates', 'Other Recruiter will Contact Candidates', 'Will Confirm Later'];

/** What a signed-in candidate sees under "Mode of Interview": a number to call, or a call-back request. */
export async function contactActionFor(job, { requested = false } = {}) {
  const mode = job.interviewMode;
  const hours = { timeFrom: job.contact?.timeFrom, timeTo: job.contact?.timeTo, dayFrom: job.contact?.dayFrom, dayTo: job.contact?.dayTo };
  if (CALL_MODES.includes(mode)) {
    let name = job.contact?.name;
    let mobile = job.contact?.mobile;
    let email = job.contact?.email;
    if (mode === 'Walk-in') {
      name = job.walkIn?.contactName || name;
      mobile = job.walkIn?.contactMobile || mobile;
      email = job.walkIn?.contactEmail || email;
    }
    if (!mobile && mode === 'Candidates Can Call Me Directly') {
      const poster = await User.findById(job.postedBy).select('fullName mobile').lean();
      name = name || poster?.fullName;
      mobile = poster?.mobile;
    }
    if (mobile) return { type: 'call', mode, name, mobile, email, ...hours };
  }
  if (CALLBACK_MODES.includes(mode) || CALL_MODES.includes(mode)) return { type: 'callback', mode, requested, ...hours };
  return null;
}

/** "Request Call Back": one request per candidate per job, sent to the poster and collaborators. */
export async function requestCallback(user, jobId) {
  const job = await Job.findOne({ _id: jobId, status: JOB_STATUS.ACTIVE }).lean();
  if (!job) throw ApiError.notFound('Job not found');
  const res = await CallbackRequest.updateOne(
    { job: job._id, candidate: user._id },
    { $setOnInsert: { job: job._id, organization: job.organization, candidate: user._id } },
    { upsert: true },
  );
  if (!res.upsertedCount) return { requested: true, duplicate: true };
  await Job.updateOne({ _id: job._id }, { $inc: { callbackRequests: 1 } });
  for (const to of [job.postedBy, ...(job.collaborators || [])]) {
    notify(to, {
      type: 'callback_request',
      title: `${user.fullName || 'A candidate'} asked for a call back`,
      body: `${job.title}${user.mobile ? ` - ${user.mobile}` : ''}`,
      data: { screen: 'job_callbacks', jobId: String(job._id) },
      channels: ['in_app', 'push', 'email'],
    });
  }
  return { requested: true };
}

export async function listCallbacks(user, jobId, { page, limit, skip }) {
  const job = await getManageableJob(user, jobId);
  const filter = { job: job._id };
  const [items, total] = await Promise.all([
    CallbackRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('candidate', 'fullName mobile email avatar').lean(),
    CallbackRequest.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function similarJobs(jobId, limit = 10) {
  const job = await Job.findById(jobId).select('keySkills roles departments locations kind').lean();
  if (!job) return [];
  const or = [];
  if (job.keySkills?.length) or.push({ keySkills: { $in: job.keySkills } });
  if (job.roles?.length) or.push({ roles: { $in: job.roles } });
  if (job.departments?.length) or.push({ departments: { $in: job.departments } });
  if (!or.length) return [];
  const items = await Job.find({ _id: { $ne: job._id }, status: JOB_STATUS.ACTIVE, kind: job.kind, $or: or })
    .select(LIST_FIELDS)
    .sort({ refreshedAt: -1 })
    .limit(limit)
    .lean();
  return items.map(publicJob);
}

/**
 * Recommended jobs: candidate-preference driven pre-filter (indexed) + in-memory relevance
 * ranking by the matching engine. Already-applied & blocked employers are excluded.
 */
export async function recommendedJobs(userId, { limit = 20, page = 1 } = {}) {
  const profile = await Candidate.findOne({ user: userId }).lean();
  if (!profile) return { items: [], total: 0, page, limit };
  const skills = [...new Set([...(profile.keySkills || []), ...(profile.itSkills || []), ...(profile.preferences?.skills || [])])];
  const roles = [...new Set([...(profile.roles || []), ...(profile.preferences?.roles || [])])];
  const departments = [...new Set([...(profile.departments || []), ...(profile.preferences?.departments || [])])];
  const or = [];
  if (skills.length) or.push({ keySkills: { $in: skills } });
  if (roles.length) or.push({ roles: { $in: roles } });
  if (departments.length) or.push({ departments: { $in: departments } });
  if (profile.currentJobTitle) or.push({ title: new RegExp(escapeRegex(profile.currentJobTitle.split(' ')[0]), 'i') });

  const [applied, hidden] = await Promise.all([Application.find({ candidate: userId }).select('job').lean(), hiddenOrganizationIdsFor(userId)]);
  const filter = { status: JOB_STATUS.ACTIVE, _id: { $nin: applied.map((a) => a.job) }, ...(hidden.length ? { organization: { $nin: hidden } } : {}) };
  if (or.length) filter.$or = or;
  const kinds = profile.preferences?.jobTypes;
  if (kinds?.length === 1) filter.kind = kinds[0];

  const pool = await Job.find(filter).select(`${LIST_FIELDS} roles departments education`).sort({ refreshedAt: -1 }).limit(300).lean();
  const weights = await getWeights();
  const ranked = pool
    .map((job) => ({ job, match: scoreMatch(profile, job, weights) }))
    .sort((a, b) => b.match.score - a.match.score || (b.job.isFeatured ? 1 : 0) - (a.job.isFeatured ? 1 : 0));
  const slice = ranked.slice((page - 1) * limit, page * limit).map(({ job, match }) => ({ ...publicJob(job), matchScore: match.score }));
  return { items: slice, total: ranked.length, page, limit };
}

/* --------------------------------------------------------- saved jobs */

export async function saveJob(userId, jobId) {
  const job = await Job.exists({ _id: jobId });
  if (!job) throw ApiError.notFound('Job not found');
  const res = await SavedJob.updateOne({ user: userId, job: jobId }, { $setOnInsert: { user: userId, job: jobId } }, { upsert: true });
  if (res.upsertedCount) await Job.updateOne({ _id: jobId }, { $inc: { 'stats.saves': 1 } });
  return { saved: true };
}

export async function unsaveJob(userId, jobId) {
  const res = await SavedJob.deleteOne({ user: userId, job: jobId });
  if (res.deletedCount) await Job.updateOne({ _id: jobId }, { $inc: { 'stats.saves': -1 } });
  return { saved: false };
}

export async function listSavedJobs(userId, { page, limit, skip }) {
  const [rows, total] = await Promise.all([
    SavedJob.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'job', select: LIST_FIELDS + ' status' })
      .lean(),
    SavedJob.countDocuments({ user: userId }),
  ]);
  return { items: rows.filter((r) => r.job).map((r) => ({ ...publicJob(r.job), savedAt: r.createdAt })), total, page, limit };
}

/* ---------------------------------------------- post a job without login */

/**
 * "Post Job Vacancy or Internship Without Login and Create Employer Account Automatically".
 * Creates employer + org (pending) + the job (pending review) and e-mails a set-password link.
 */
/** "Post a Job" without login: OTP on the employer's mobile first ("Enter OTP & Verify"). */
export async function guestPostOtp({ mobile }) {
  return sendOtp({ target: normalizeMobile(mobile), channel: 'sms', purpose: 'guest_post' });
}

export async function guestPostJob(req, { employer: { otp, ...employer }, job }) {
  await verifyOtp({ target: normalizeMobile(employer.mobile), purpose: 'guest_post', code: otp });
  const { user, organization } = await createEmployerAccount(
    { ...employer, password: undefined, acceptTerms: true, mobileVerified: true, consentCommunication: employer.consentCommunication },
    { source: 'job_post', ip: req.ip, status: USER_STATUS.PENDING },
  );
  user.password = `${Math.random().toString(36).slice(2)}Aa1!${Date.now()}`;
  await user.save();
  const created = await createJob(user, job, { orgId: organization._id, source: 'without_login' });
  await Job.updateOne(
    { _id: created._id },
    { $set: { status: JOB_STATUS.PENDING, publishedAt: new Date(), refreshedAt: new Date(), expiresAt: await expiryFrom(job) } },
  );
  await sendActivation(user, organization.name);
  return { jobId: created._id, organizationId: organization._id, message: 'Job submitted for review. Check your e-mail to activate your employer account.' };
}

/* -------------------------------------------------------- bulk Excel post */

const JOB_HEADERS = {
  'job title': 'title',
  title: 'title',
  designation: 'designation',
  description: 'description',
  'key skills': 'keySkills',
  city: 'city',
  state: 'state',
  'min experience': 'expMin',
  'max experience': 'expMax',
  'min salary': 'salaryMin',
  'max salary': 'salaryMax',
  openings: 'openings',
  'employment type': 'employmentTypes',
  'work mode': 'jobModes',
  industry: 'industries',
  department: 'departments',
  role: 'roles',
  kind: 'kind',
  'client name': 'clientName',
};

export async function bulkImportJobs(user, buffer, { orgId, publish = false, adminId } = {}) {
  const rows = await parseWorkbook(buffer, JOB_HEADERS, { maxRows: 500 });
  const list = (v) =>
    v
      ? String(v)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  const results = { total: rows.length, created: 0, errors: [] };
  for (const row of rows) {
    try {
      if (!row.title || !row.city) throw new Error('Job Title and City are required');
      await createJob(
        user,
        {
          kind: String(row.kind || '')
            .toLowerCase()
            .startsWith('intern')
            ? JOB_KIND.INTERNSHIP
            : JOB_KIND.JOB,
          title: String(row.title),
          designation: row.designation,
          description: row.description || String(row.title),
          keySkills: list(row.keySkills),
          locations: [{ city: String(row.city), state: row.state ? String(row.state) : undefined }],
          experience: { min: Number(row.expMin) || 0, max: row.expMax ? Number(row.expMax) : undefined },
          salary: { min: row.salaryMin ? Number(row.salaryMin) : undefined, max: row.salaryMax ? Number(row.salaryMax) : undefined },
          openings: Number(row.openings) || 1,
          employmentTypes: list(row.employmentTypes),
          jobModes: list(row.jobModes),
          industries: list(row.industries),
          departments: list(row.departments),
          roles: list(row.roles),
          consultancyClient: row.clientName ? { name: String(row.clientName), hideName: true } : undefined,
        },
        { orgId, publish, source: 'excel_import', adminId },
      );
      results.created += 1;
    } catch (err) {
      results.errors.push({ row: row.__row, message: err.message });
    }
  }
  return results;
}

/* ------------------------------------------------------- Google for Jobs */

/** schema.org JobPosting JSON-LD for Google Jobs (toggle: platform.googleJobsEnabled). */
export async function googleJobPosting(idOrSlug) {
  if (!(await getSetting('platform.googleJobsEnabled', true))) throw ApiError.notFound('Disabled');
  const isId = /^[a-f\d]{24}$/i.test(idOrSlug);
  const job = await Job.findOne({ ...(isId ? { _id: idOrSlug } : { slug: idOrSlug }), status: JOB_STATUS.ACTIVE, googleJobsEnabled: true }).lean();
  if (!job) throw ApiError.notFound('Job not found');
  const org = await Organization.findById(job.organization).select('name website logo').lean();
  const useClientName = job.consultancyClient?.hideName === false && job.consultancyClient?.name;
  const empType = (job.employmentTypes || []).map((t) =>
    /part/i.test(t) ? 'PART_TIME' : /intern/i.test(t) ? 'INTERN' : /contract|temporary/i.test(t) ? 'CONTRACTOR' : 'FULL_TIME',
  );
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    identifier: { '@type': 'PropertyValue', name: org?.name, value: String(job._id) },
    datePosted: job.publishedAt?.toISOString(),
    validThrough: job.expiresAt?.toISOString(),
    employmentType: job.kind === 'internship' ? 'INTERN' : [...new Set(empType)].length ? [...new Set(empType)] : 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: useClientName ? job.consultancyClient.name : org?.name, sameAs: org?.website, logo: org?.logo?.url },
    jobLocation: (job.locations || []).map((l) => ({
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: l.city, addressRegion: l.state, postalCode: l.pincode, addressCountry: 'IN' },
    })),
    ...(job.isRemote ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'India' } } : {}),
    ...(job.salary?.min && !job.salary?.hidden
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency || 'INR',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salary.min,
              maxValue: job.salary.max || job.salary.min,
              unitText: job.salary.period === 'yearly' ? 'YEAR' : 'MONTH',
            },
          },
        }
      : {}),
    directApply: true,
    url: `${config.urls.web}/jobs/${job.slug}`,
  };
}

export async function jobsSitemap() {
  const jobs = await Job.find({ status: JOB_STATUS.ACTIVE }).select('slug refreshedAt updatedAt').sort({ refreshedAt: -1 }).limit(50000).lean();
  const urls = jobs
    .map(
      (j) =>
        `<url><loc>${config.urls.web}/jobs/${j.slug}</loc><lastmod>${(j.refreshedAt || j.updatedAt).toISOString()}</lastmod><changefreq>daily</changefreq></url>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/* ------------------------------------------------- candidate saved searches */

const MAX_SAVED_JOB_SEARCHES = 20;
export const listJobSearches = (user) => SavedSearch.find({ owner: user._id, scope: 'job' }).sort({ updatedAt: -1 }).lean();

export async function saveJobSearch(user, { name, query }) {
  const clean = new URLSearchParams(query);
  ['page', 'limit'].forEach((k) => clean.delete(k));
  const filters = { query: clean.toString() };
  const existing = await SavedSearch.findOne({ owner: user._id, scope: 'job', 'filters.query': filters.query });
  if (existing) {
    existing.name = name;
    await existing.save();
    return existing.toObject();
  }
  if ((await SavedSearch.countDocuments({ owner: user._id, scope: 'job' })) >= MAX_SAVED_JOB_SEARCHES) {
    throw ApiError.badRequest(`You can save up to ${MAX_SAVED_JOB_SEARCHES} searches. Remove one first`, undefined, 'LIMIT_REACHED');
  }
  return (await SavedSearch.create({ owner: user._id, scope: 'job', name, filters })).toObject();
}

export async function removeJobSearch(user, id) {
  await SavedSearch.deleteOne({ _id: id, owner: user._id, scope: 'job' });
  return { removed: true };
}

/* -------------------------------------------------------------- scheduler */

export const BOOST_DAYS = 15;

/**
 * Boost a live job: uses 1 featured-job credit, pins it to the featured slots and moves it to the top
 * of search for BOOST_DAYS days. Boosting again while a boost runs is refused (no double charge).
 */
export async function boostJob(user, jobId) {
  const job = await getManageableJob(user, jobId);
  if (job.status !== JOB_STATUS.ACTIVE) throw ApiError.badRequest('Only live jobs can be boosted', undefined, 'INVALID_STATE');
  const now = new Date();
  if (job.isFeatured && (!job.featuredUntil || job.featuredUntil > now)) throw ApiError.conflict('This job is already boosted', 'ALREADY_BOOSTED');
  const member = user.role === ROLES.EMPLOYER ? user : await User.findById(job.postedBy);
  if (!isAdmin(user)) await consume(member, 'featured_job', 1, { ref: String(job._id) });
  job.isFeatured = true;
  job.featuredUntil = new Date(now.getTime() + BOOST_DAYS * 86400000);
  job.refreshedAt = now;
  job.labels = [...new Set([...(job.labels || []), 'featured'])];
  await job.save();
  logActivity({ user }, { user: user._id, organization: job.organization, type: 'job_boosted', description: job.title, meta: { jobId: job._id, until: job.featuredUntil } });
  return job.toObject();
}

export async function expireJobs() {
  const now = new Date();
  // Boosts that ran out go back to normal listing.
  await Job.updateMany({ isFeatured: true, featuredUntil: { $lte: now } }, { $set: { isFeatured: false }, $pull: { labels: 'featured' }, $unset: { featuredUntil: 1 } });
  const toExpire = await Job.find({ status: JOB_STATUS.ACTIVE, $or: [{ expiresAt: { $lte: now } }, { deadlineAt: { $lte: now } }] })
    .select('organization')
    .lean();
  if (!toExpire.length) return 0;
  await Job.updateMany({ _id: { $in: toExpire.map((j) => j._id) } }, { $set: { status: JOB_STATUS.EXPIRED } });
  await Promise.all([...new Set(toExpire.map((j) => String(j.organization)))].map(syncActiveJobCount));
  return toExpire.length;
}

export function shareLinks(job) {
  const url = encodeURIComponent(`${config.urls.web}/jobs/${job.slug}`);
  const text = encodeURIComponent(`${job.title} at ${job.orgSnapshot?.name || ''}`);
  return buildShareLinks(url, text);
}

export function buildShareLinks(url, text) {
  return {
    url: decodeURIComponent(url),
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    whatsapp: `https://wa.me/?text=${text}%20${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    sms: `sms:?body=${text}%20${url}`,
    instagram: decodeURIComponent(url), // Instagram has no web share intent - clients copy the link
    arattai: decodeURIComponent(url),
  };
}
