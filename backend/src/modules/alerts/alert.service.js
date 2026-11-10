import config from '../../config/env.js';
import ApiError from '../../shared/errors/ApiError.js';
import { ROLES } from '../../shared/constants/index.js';
import { escapeRegex, normalizeEmail, normalizeMobile } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { parseWorkbook } from '../../shared/utils/excel.js';
import { putFile } from '../../shared/services/storage.service.js';
import { extractText } from '../../shared/services/resumeParser.js';
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import { JobAlert, AlertMatch } from './alert.model.js';
import { verifyOtp, sendOtp } from '../auth/otp.service.js';
import { issueTokens } from '../auth/token.service.js';
import { buildAuthPayload } from '../auth/auth.service.js';
import { createCandidateAccount } from '../users/account.service.js';
import { notify } from '../notifications/notification.service.js';
import { refreshDerived } from '../candidates/candidate.service.js';

const MAX_ALERTS_PER_USER = 10;
const FREQ_MS = { daily: 24 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000, monthly: 30 * 24 * 3600 * 1000 };
const nextRun = (frequency, from = new Date()) => new Date(from.getTime() + FREQ_MS[frequency]);

/* ------------------------------------------------------------- candidate */

export async function createAlert(user, data, { source = 'candidate', createdBy } = {}) {
  const count = await JobAlert.countDocuments({ user: user._id, status: { $ne: 'trashed' } });
  if (count >= MAX_ALERTS_PER_USER) throw ApiError.badRequest(`You can create up to ${MAX_ALERTS_PER_USER} job alerts`, undefined, 'ALERT_LIMIT');
  return JobAlert.create({
    user: user._id,
    name: data.name,
    email: data.email || user.email,
    mobile: data.mobile || user.mobile,
    criteria: data.criteria,
    frequency: data.frequency || 'daily',
    channels: data.channels,
    heardFrom: data.heardFrom,
    source,
    createdBy,
    nextRunAt: new Date(), // first digest on the next scheduler tick
  });
}

/** Pre-filled alert criteria from the registered user's profile (Excel: "Enable Pre Filled Options"). */
export async function prefill(userId) {
  const [user, p] = await Promise.all([User.findById(userId).lean(), Candidate.findOne({ user: userId }).lean()]);
  return {
    name: p?.currentJobTitle ? `${p.currentJobTitle} jobs` : 'My job alert',
    email: user?.email,
    mobile: user?.mobile,
    frequency: 'daily',
    criteria: {
      jobTitle: p?.currentJobTitle,
      keySkills: (p?.keySkills || []).slice(0, 15),
      experienceLevel: p?.experienceLevel,
      totalExperienceMonths: p?.totalExperienceMonths,
      presentJobStatus: p?.presentJobStatus,
      currentSalary: p?.currentSalary,
      locations: (p?.preferences?.locations || []).slice(0, 3),
      industries: (p?.industries || []).slice(0, 5),
      subIndustries: (p?.subIndustries || []).slice(0, 20),
      departments: (p?.departments || []).slice(0, 5),
      functions: (p?.functions || []).slice(0, 20),
      roles: (p?.roles || []).slice(0, 10),
      educationLevels: (p?.educations || [])
        .map((e) => e.level)
        .filter(Boolean)
        .slice(0, 5),
      degrees: (p?.educations || [])
        .map((e) => e.degree)
        .filter(Boolean)
        .slice(0, 5),
      specialisations: (p?.educations || [])
        .map((e) => e.specialisation)
        .filter(Boolean)
        .slice(0, 5),
    },
  };
}

export async function listMyAlerts(userId) {
  return JobAlert.find({ user: userId, status: { $ne: 'trashed' } })
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateAlert(userId, id, data) {
  const alert = await JobAlert.findOne({ _id: id, user: userId, status: { $ne: 'trashed' } });
  if (!alert) throw ApiError.notFound('Job alert not found');
  if (data.criteria) alert.criteria = { ...alert.criteria.toObject(), ...data.criteria };
  for (const k of ['name', 'frequency', 'channels', 'email', 'mobile']) if (data[k] !== undefined) alert[k] = data[k];
  if (data.isActive !== undefined) {
    alert.isActive = data.isActive;
    alert.status = data.isActive ? 'active' : 'paused';
    if (data.isActive) alert.nextRunAt = nextRun(alert.frequency, alert.lastSentAt || new Date(Date.now() - FREQ_MS[alert.frequency]));
  }
  await alert.save();
  return alert;
}

export async function deleteAlert(userId, id) {
  const res = await JobAlert.updateOne({ _id: id, user: userId }, { $set: { status: 'trashed', isActive: false } });
  if (!res.matchedCount) throw ApiError.notFound('Job alert not found');
}

export async function alertResponses(userId, { alertId, page, limit, skip }) {
  const filter = { user: userId, ...(alertId ? { alert: alertId } : {}) };
  const [items, total] = await Promise.all([
    AlertMatch.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('job', 'title slug kind orgSnapshot locations salary status')
      .populate('alert', 'name')
      .lean(),
    AlertMatch.countDocuments(filter),
  ]);
  return { items: items.filter((i) => i.job), total, page, limit };
}

/* --------------------------------------------------------- guest (no login) */

export async function guestAlertOtp({ mobile }) {
  return sendOtp({ target: normalizeMobile(mobile), channel: 'sms', purpose: 'job_alert' });
}

/**
 * Unregistered job seeker creates a job alert: OTP-verified mobile -> candidate account is created
 * automatically (or the existing one is reused) -> alert saved -> user is logged in.
 */
export async function guestCreateAlert(req, body, file) {
  const mobile = normalizeMobile(body.mobile);
  await verifyOtp({ target: mobile, purpose: 'job_alert', code: body.otp });
  let user = await User.findOne({ mobile });
  let isNewUser = false;
  if (user && user.role !== ROLES.CANDIDATE) throw ApiError.conflict('This mobile number belongs to an employer account', 'MOBILE_TAKEN');
  if (!user) {
    if (body.email && (await User.exists({ email: normalizeEmail(body.email) })))
      throw ApiError.conflict('An account with this e-mail exists. Please log in', 'EMAIL_TAKEN');
    const c = body.criteria || {};
    ({ user } = await createCandidateAccount(
      {
        fullName: body.fullName || body.name,
        email: body.email,
        mobile,
        mobileVerified: true,
        heardFrom: body.heardFrom,
        acceptTerms: true,
        consentCommunication: body.consentCommunication,
        experienceLevel: c.experienceLevel,
        profile: {
          currentJobTitle: c.jobTitle,
          keySkills: c.keySkills,
          presentJobStatus: c.presentJobStatus,
          currentSalary: c.currentSalary,
          totalExperienceMonths: c.totalExperienceMonths,
          industries: c.industries,
          subIndustries: c.subIndustries,
          departments: c.departments,
          functions: c.functions,
          roles: c.roles,
          preferences: { locations: c.locations, skills: c.keySkills, roles: c.roles },
        },
      },
      { source: 'job_alert', ip: req.ip },
    ));
    isNewUser = true;
  }
  if (file) {
    const profile = await Candidate.findOne({ user: user._id }).select('+resumeText');
    if (!profile.resume?.key) {
      profile.resume = await putFile(file, { folder: 'resumes', isPrivate: true });
      profile.resumeText = await extractText(file);
      await refreshDerived(user, profile);
    }
  }
  const alert = await createAlert(user, body, { source: 'guest' });
  const tokens = await issueTokens(user, req);
  return { alert, isNewUser, ...(await buildAuthPayload(user, tokens)) };
}

/* ------------------------------------------------------------------ admin */

export async function adminList(q, { page, limit, skip, sort }) {
  const filter = { ...dateRangeFilter(q) };
  // Alerts a job seeker deleted stay in the Trash view only.
  filter.status = q.status || { $ne: 'trashed' };
  if (q.frequency) filter.frequency = q.frequency;
  if (q.source) filter.source = q.source;
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }, { mobile: q.q }];
  const [items, total] = await Promise.all([
    JobAlert.find(filter).sort(sort).skip(skip).limit(limit).populate('user', 'fullName email mobile uid').lean(),
    JobAlert.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/** Admin creates the same alert for up to 1000 selected candidates. */
export async function adminCreateForCandidates(admin, { candidateIds, alert }) {
  const users = await User.find({ _id: { $in: candidateIds }, role: ROLES.CANDIDATE })
    .select('email mobile')
    .lean();
  const docs = users.map((u) => ({ ...alert, user: u._id, email: u.email, mobile: u.mobile, source: 'admin', createdBy: admin._id, nextRunAt: new Date() }));
  const res = await JobAlert.insertMany(docs, { ordered: false });
  return { created: res.length };
}

export async function adminBulk(ids, action, data = {}) {
  const map = {
    start: { isActive: true, status: 'active', nextRunAt: new Date() },
    stop: { isActive: false, status: 'paused' },
    approve: { isActive: true, status: 'active' },
    unapprove: { isActive: false, status: 'pending' },
    trash: { isActive: false, status: 'trashed' },
    edit: data,
  };
  const res = await JobAlert.updateMany({ _id: { $in: ids } }, { $set: map[action] });
  return { updated: res.modifiedCount };
}

export async function adminUpdate(id, data) {
  const alert = await JobAlert.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!alert) throw ApiError.notFound('Job alert not found');
  return alert;
}

/** Push specific jobs to the users behind selected alerts ("Assign relevant jobs to candidates"). */
export async function adminSendJobs(alertIds, jobIds) {
  const [alerts, jobs] = await Promise.all([JobAlert.find({ _id: { $in: alertIds } }).lean(), Job.find({ _id: { $in: jobIds }, status: 'active' }).lean()]);
  let sent = 0;
  for (const a of alerts) {
    if (await deliverDigest(a, jobs)) sent += 1;
  }
  return { sent };
}

export async function importAlerts(admin, buffer) {
  const rows = await parseWorkbook(buffer, {
    'alert name': 'name',
    'email id': 'email',
    'mobile number': 'mobile',
    'key skills': 'keySkills',
    'job title': 'jobTitle',
    locations: 'locations',
    frequency: 'frequency',
  });
  const list = (v) =>
    v
      ? String(v)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  const result = { total: rows.length, created: 0, errors: [] };
  for (const row of rows) {
    try {
      const mobile = normalizeMobile(row.mobile);
      const email = normalizeEmail(row.email);
      const user = await User.findOne({ $or: [mobile ? { mobile } : null, email ? { email } : null].filter(Boolean) });
      if (!user) throw new Error('No candidate found for this e-mail / mobile');
      await JobAlert.create({
        user: user._id,
        name: row.name || 'Job alert',
        email: user.email,
        mobile: user.mobile,
        frequency: ['daily', 'weekly', 'monthly'].includes(String(row.frequency).toLowerCase()) ? String(row.frequency).toLowerCase() : 'daily',
        criteria: {
          jobTitle: row.jobTitle,
          keySkills: list(row.keySkills).slice(0, 15),
          locations: list(row.locations)
            .slice(0, 3)
            .map((city) => ({ city })),
        },
        source: 'admin',
        createdBy: admin._id,
        nextRunAt: new Date(),
      });
      result.created += 1;
    } catch (err) {
      result.errors.push({ row: row.__row, message: err.message });
    }
  }
  return result;
}

/* -------------------------------------------------------------- scheduler */

function alertJobFilter(alert, since) {
  const c = alert.criteria || {};
  const filter = { status: 'active', publishedAt: { $gt: since } };
  if (c.kind && c.kind !== 'any') filter.kind = c.kind;
  const or = [];
  if (c.keySkills?.length) or.push({ keySkills: { $in: c.keySkills } });
  if (c.roles?.length) or.push({ roles: { $in: c.roles } });
  if (c.jobTitle) or.push({ title: new RegExp(escapeRegex(c.jobTitle), 'i') });
  if (c.keywords) or.push({ title: new RegExp(escapeRegex(c.keywords), 'i') });
  if (c.departments?.length && !or.length) or.push({ departments: { $in: c.departments } });
  if (or.length) filter.$or = or;
  const and = [];
  if (c.locations?.length) {
    const cities = c.locations.map((l) => l.city).filter(Boolean);
    if (cities.length) and.push({ $or: [{ 'locations.city': { $in: cities.map((x) => new RegExp(`^${escapeRegex(x)}$`, 'i')) } }, { isRemote: true }] });
  }
  if (c.industries?.length) filter.industries = { $in: c.industries };
  if (c.totalExperienceMonths !== undefined) and.push({ 'experience.min': { $lte: Math.floor(c.totalExperienceMonths / 12) } });
  if (c.expectedSalary?.min) and.push({ $or: [{ 'salary.max': { $gte: c.expectedSalary.min } }, { 'salary.max': null }] });
  if (c.jobModes?.length) filter.jobModes = { $in: c.jobModes };
  if (and.length) filter.$and = and;
  return filter;
}

async function deliverDigest(alert, jobs) {
  if (!jobs.length || !alert.user) return false;
  const fresh = [];
  for (const j of jobs) {
    const res = await AlertMatch.updateOne(
      { alert: alert._id, job: j._id },
      { $setOnInsert: { alert: alert._id, user: alert.user, job: j._id, sentAt: new Date() } },
      { upsert: true },
    );
    if (res.upsertedCount) fresh.push(j);
  }
  if (!fresh.length) return false;
  const user = await User.findById(alert.user).select('fullName notificationPrefs status').lean();
  if (!user || user.status !== 'active' || user.notificationPrefs?.jobAlerts === false) return false;
  // The candidate picks the channels; older alerts (saved before push / SMS could be chosen) keep push on.
  const picked = alert.channels || [];
  const legacy = !picked.some((c) => ['push', 'sms', 'whatsapp'].includes(c));
  const channels = ['in_app', ...['push', 'email', 'whatsapp', 'sms'].filter((c) => picked.includes(c) || (c === 'push' && legacy))];
  await notify(alert.user, {
    type: 'job_alert',
    title: `${fresh.length} new job${fresh.length > 1 ? 's' : ''} for "${alert.name}"`,
    body: fresh
      .slice(0, 3)
      .map((j) => j.title)
      .join(', '),
    data: { screen: 'job_alert', alertId: String(alert._id) },
    channels,
    whatsapp: {
      text: [`*${fresh.length} new job${fresh.length > 1 ? 's' : ''} for "${alert.name}"*`, ...fresh.slice(0, 5).map((job) => `• ${job.title}${job.orgSnapshot?.name ? ` - ${job.orgSnapshot.name}` : ''}${job.locations?.[0]?.city ? `, ${job.locations[0].city}` : ''}\n${config.urls.web}/jobs/${job.slug}`)].join('\n'),
    },
    email: {
      template: 'jobAlert',
      vars: {
        name: user.fullName,
        alertName: alert.name,
        jobs: fresh.slice(0, 20).map((j) => ({ title: j.title, slug: j.slug, company: j.orgSnapshot?.name, location: j.locations?.[0]?.city })),
      },
    },
  });
  return true;
}

export async function processDueAlerts({ batch = 500 } = {}) {
  const now = new Date();
  const due = await JobAlert.find({ isActive: true, status: 'active', nextRunAt: { $lte: now } })
    .limit(batch)
    .lean();
  let delivered = 0;
  for (const alert of due) {
    const since = alert.lastSentAt || new Date(now.getTime() - FREQ_MS[alert.frequency]);
    const jobs = await Job.find(alertJobFilter(alert, since)).select('title slug orgSnapshot locations').sort({ publishedAt: -1 }).limit(25).lean();
    if (await deliverDigest(alert, jobs)) delivered += 1;
    await JobAlert.updateOne(
      { _id: alert._id },
      { $set: { lastSentAt: now, nextRunAt: nextRun(alert.frequency, now), lastJobIds: jobs.map((j) => j._id) }, $inc: { sentCount: jobs.length ? 1 : 0 } },
    );
  }
  return { processed: due.length, delivered };
}
