import mongoose from 'mongoose';
import config from '../../config/env.js';
import { escapeHtml } from '../../shared/services/emailTemplates.js';
import { ZipArchive } from 'archiver';
import ApiError from '../../shared/errors/ApiError.js';
import { JOB_STATUS, ROLES } from '../../shared/constants/index.js';
import { escapeRegex, normalizeEmail, normalizeMobile } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { hasEmployerPermission, isAdmin } from '../../shared/middleware/auth.js';
import { putFile, readFile, signedUrl } from '../../shared/services/storage.service.js';
import { extractText } from '../../shared/services/resumeParser.js';
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import Candidate from '../candidates/candidate.model.js';
import Organization from '../employers/organization.model.js';
import { Application, Interview } from './application.model.js';
import { JobInvite, ProfileAccess } from '../engagement/engagement.models.js';
import { isBlockedBetween } from '../moderation/blocklist.service.js';
import { verifyOtp, sendOtp } from '../auth/otp.service.js';
import { issueTokens } from '../auth/token.service.js';
import { buildAuthPayload } from '../auth/auth.service.js';
import { createCandidateAccount } from '../users/account.service.js';
import { notify, sendEmail } from '../notifications/notification.service.js';
import { score } from '../matching/matching.service.js';
import { trackUsage } from '../billing/usage.service.js';
import { logActivity } from '../activity/activity.service.js';
import { refreshDerived, withRelocationFlags } from '../candidates/candidate.service.js';
import { recordProfileView } from '../candidates/profileViews.service.js';

const STAGE_LABEL = {
  applied: 'Applied',
  screened: 'Screened',
  interview_scheduled: 'Interview Scheduled',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

/* ------------------------------------------------------------- applying */

async function assertJobOpen(jobId) {
  const job = await Job.findById(jobId);
  if (!job || job.status !== JOB_STATUS.ACTIVE) throw ApiError.badRequest('This job is no longer accepting applications', undefined, 'JOB_CLOSED');
  if (job.deadlineAt && job.deadlineAt < new Date()) throw ApiError.badRequest('The application deadline has passed', undefined, 'JOB_CLOSED');
  return job;
}

/** Screening answers by question type ("Other Forms" Excel: single / multiple choice, short answer, text only, numbers only). */
function validateAnswers(job, answers = []) {
  const map = new Map(answers.map((a) => [a.question, a.answer]));
  return (job.questions || []).map((q) => {
    const raw = map.get(q.question);
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => String(x).trim()).filter(Boolean);
    const answer = list.join(', ');
    if (q.required && !answer) throw ApiError.badRequest(`Please answer: ${q.question}`, undefined, 'ANSWER_REQUIRED');
    if (answer) {
      const invalid = (msg) => ApiError.badRequest(`${q.question}: ${msg}`, undefined, 'ANSWER_INVALID');
      if (q.type === 'number' && !/^-?\d+(\.\d+)?$/.test(answer)) throw invalid('please enter numbers only');
      if (q.type === 'text' && /\d/.test(answer)) throw invalid('please answer in text only');
      if (['single_choice', 'multiple_choice', 'choice', 'yes_no'].includes(q.type)) {
        const options = q.type === 'yes_no' ? ['Yes', 'No'] : q.options || [];
        if (q.type !== 'multiple_choice' && list.length > 1) throw invalid('pick one option');
        if (options.length && list.some((a) => !options.includes(a))) throw invalid('pick from the given options');
      }
    }
    return { question: q.question, answer: answer.slice(0, 2000) };
  });
}

/** Poster + extra "receive responses" e-mails of a job (Collaborate With Other Users). */
async function responseRecipients(job) {
  const poster = await User.findById(job.postedBy).select('email').lean();
  return [...new Set([poster?.email, ...(job.responseAlerts?.emails || [])].filter(Boolean).map((e) => e.toLowerCase()))];
}

/** "Receive Every New Response": one e-mail per application. */
async function sendResponseAlert(job, candidate, org) {
  const to = await responseRecipients(job);
  const url = `${config.urls.web}/employer/applications?job=${job._id}`;
  const html = `<p><b>${escapeHtml(candidate.fullName || 'A candidate')}</b> applied for <b>${escapeHtml(job.title)}</b>${org?.name ? ` at ${escapeHtml(org.name)}` : ''}.</p>`;
  await Promise.all(to.map((email) => sendEmail({ to: email, template: 'generic', vars: { title: `New response: ${job.title}`, html, url, label: 'View response' } })));
}

/** "Receive A Daily Response Summary": yesterday's response count for each active job that asked for it. */
export async function sendDailyResponseSummaries() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const jobs = await Job.find({ status: JOB_STATUS.ACTIVE, 'responseAlerts.daily': true }).select('title postedBy responseAlerts').lean();
  let sent = 0;
  for (const job of jobs) {
    const count = await Application.countDocuments({ job: job._id, createdAt: { $gte: since } });
    if (!count) continue;
    const to = await responseRecipients(job);
    const url = `${config.urls.web}/employer/applications?job=${job._id}`;
    const html = `<p>Your job <b>${escapeHtml(job.title)}</b> received <b>${count}</b> new response${count > 1 ? 's' : ''} in the last 24 hours.</p>`;
    await Promise.all(to.map((email) => sendEmail({ to: email, template: 'generic', vars: { title: `Daily responses: ${job.title}`, html, url, label: 'View responses' } })));
    sent += to.length;
  }
  return { jobs: jobs.length, sent };
}

/** Core apply used by logged-in apply, guest apply, invites, events and admin assignment. */
export async function createApplication({ job, user, profile, source = 'direct', answers, coverLetter, resume, event, assignedBy }) {
  if (await isBlockedBetween({ candidateUserId: user._id, organizationId: job.organization })) {
    throw ApiError.forbidden('You cannot apply to this employer', 'BLOCKED');
  }
  if (await Application.exists({ job: job._id, candidate: user._id })) throw ApiError.conflict('You have already applied to this job', 'ALREADY_APPLIED');

  const match = await score(profile || {}, job);
  const loc = profile?.currentLocation;
  const application = await Application.create({
    job: job._id,
    organization: job.organization,
    candidate: user._id,
    jobPostedBy: job.postedBy,
    jobKind: job.kind,
    source,
    event,
    assignedBy,
    snapshot: {
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      currentJobTitle: profile?.currentJobTitle,
      currentSalary: profile?.currentSalary,
      totalExperienceMonths: profile?.totalExperienceMonths,
      currentLocation: [loc?.city, loc?.state].filter(Boolean).join(', '),
      keySkills: profile?.keySkills,
      resume:
        resume ||
        (profile?.resume?.key ? { key: profile.resume.key, name: profile.resume.name, mime: profile.resume.mime, size: profile.resume.size } : undefined),
    },
    answers: validateAnswers(job, answers),
    coverLetter,
    matchScore: match.score,
    history: [{ field: 'stage', to: 'applied', by: assignedBy || user._id }],
  });

  await Promise.all([
    Job.updateOne({ _id: job._id }, { $inc: { 'stats.applications': 1, 'stats.newApplications': 1 } }),
    Candidate.updateOne({ user: user._id }, { $inc: { 'stats.applications': 1 } }),
    JobInvite.updateOne({ job: job._id, candidate: user._id }, { $set: { status: 'applied', respondedAt: new Date() } }),
  ]);

  const org = await Organization.findById(job.organization).select('name').lean();
  const recipients = [job.postedBy, ...(job.collaborators || [])];
  for (const r of recipients) {
    notify(r, {
      type: 'new_application',
      title: `New application for ${job.title}`,
      body: `${user.fullName || 'A candidate'} applied`,
      data: { screen: 'application', applicationId: String(application._id), jobId: String(job._id) },
      channels: ['in_app', 'push'],
    });
  }
  if (job.responseAlerts?.everyResponse) sendResponseAlert(job, user, org).catch(() => {});
  if (user.email)
    sendEmail({
      to: user.email,
      template: 'applicationReceived',
      vars: { name: user.fullName, jobTitle: job.title, company: org?.name },
      user: user._id,
    }).catch(() => {});
  notify(user._id, {
    type: 'application_submitted',
    title: 'Application submitted',
    body: `${job.title} at ${org?.name}`,
    data: { screen: 'application', applicationId: String(application._id) },
    channels: ['in_app'],
  });
  return application;
}

export async function apply(req, jobId, body, file) {
  const job = await assertJobOpen(jobId);
  if (job.applyExternalUrl) throw ApiError.badRequest('This job accepts applications on the employer website', { url: job.applyExternalUrl }, 'EXTERNAL_APPLY');
  const profile = await Candidate.findOne({ user: req.user._id }).lean();
  let resume;
  if (file) {
    const stored = await putFile(file, { folder: 'resumes', isPrivate: true });
    resume = { key: stored.key, name: stored.name, mime: stored.mime, size: stored.size };
  }
  const application = await createApplication({
    job,
    user: req.user,
    profile,
    source: body.source || 'direct',
    answers: body.answers,
    coverLetter: body.coverLetter,
    resume,
    event: body.eventId,
  });
  logActivity(req, { type: 'job_applied', description: job.title, meta: { jobId: job._id } });
  return application;
}

/**
 * Apply without login (Candidate Job Apply form). The mobile OTP proves ownership; an account is
 * auto-created (or the existing one is used) and the candidate is logged in.
 */
export async function guestApplyOtp(jobId, { mobile }) {
  await assertJobOpen(jobId);
  return sendOtp({ target: normalizeMobile(mobile), channel: 'sms', purpose: 'guest_apply', meta: { jobId: String(jobId) } });
}

export async function guestApply(req, jobId, body, file) {
  const job = await assertJobOpen(jobId);
  const mobile = normalizeMobile(body.mobile);
  await verifyOtp({ target: mobile, purpose: 'guest_apply', code: body.otp });

  let user = await User.findOne({ mobile }).select('+tokenVersion');
  let isNewUser = false;
  if (user && user.role !== ROLES.CANDIDATE) throw ApiError.conflict('This mobile number belongs to an employer account', 'MOBILE_TAKEN');
  if (!user && body.email && (await User.exists({ email: normalizeEmail(body.email) }))) {
    throw ApiError.conflict('An account with this e-mail exists. Please log in to apply', 'EMAIL_TAKEN');
  }

  const profileData = {
    experienceLevel: body.experienceLevel,
    presentJobStatus: body.presentJobStatus,
    currentJobTitle: body.currentJobTitle,
    currentEmployer: body.currentCompany,
    currentSalary: body.currentSalary,
    dob: body.dob,
    maritalStatus: body.maritalStatus,
    disability: body.disability,
    military: body.military,
    hasTwoWheeler: body.hasTwoWheeler,
    hasFourWheeler: body.hasFourWheeler,
    drivingLicense: body.drivingLicense,
    assets: body.assets,
    documents: body.documents,
    keySkills: body.keySkills,
    roles: body.roles,
    departments: body.departments,
    functions: body.functions,
    industries: body.industries,
    subIndustries: body.subIndustries,
    noticePeriod: body.noticePeriod,
    currentLocation: body.currentLocation,
    languages: body.languages,
    englishFluency: body.englishFluency,
    totalExperienceMonths: body.totalExperienceMonths,
    educations: body.education ? [{ ...body.education, isHighest: true }] : undefined,
    employments: body.currentJobTitle
      ? [
          {
            jobTitle: body.currentJobTitle,
            employerName: body.currentCompany,
            employerType: body.currentCompanyType,
            employmentType: body.employmentType,
            isCurrent: body.currentlyWorking !== false,
            location: body.workLocation,
            monthlySalary: body.currentSalary,
            noticePeriod: body.noticePeriod,
          },
        ]
      : undefined,
    preferences: withRelocationFlags({
      locations: body.preferredLocations,
      relocation: body.relocation,
      distanceKm: body.distanceKm,
      skills: body.keySkills,
      industries: body.industries,
      subIndustries: body.subIndustries,
      departments: body.departments,
      functions: body.functions,
      roles: body.roles,
    }),
  };

  if (!user) {
    ({ user } = await createCandidateAccount(
      {
        fullName: body.fullName,
        email: body.email,
        mobile,
        gender: body.gender,
        mobileVerified: true,
        heardFrom: body.heardFrom,
        acceptTerms: true,
        consentCommunication: body.consentCommunication,
        experienceLevel: body.experienceLevel,
        profile: profileData,
      },
      { source: 'job_apply', ip: req.ip },
    ));
    isNewUser = true;
  } else if (!user.mobileVerifiedAt) {
    user.mobileVerifiedAt = new Date();
    await user.save();
  }

  const profile = await Candidate.findOne({ user: user._id }).select('+resumeText');
  let resume;
  if (file) {
    const stored = await putFile(file, { folder: 'resumes', isPrivate: true });
    resume = { key: stored.key, name: stored.name, mime: stored.mime, size: stored.size };
    if (!profile.resume?.key) {
      profile.resume = stored;
      profile.resumeText = await extractText(file);
    }
  }
  await refreshDerived(user, profile);

  const application = await createApplication({
    job,
    user,
    profile: profile.toObject(),
    source: body.eventId ? 'event' : 'without_login',
    event: body.eventId,
    answers: body.answers,
    resume,
  });
  const tokens = await issueTokens(user, req);
  if (isNewUser && user.email) {
    sendEmail({
      to: user.email,
      template: 'generic',
      vars: {
        title: 'Your Freejobwala account is ready',
        html: '<p>We created a job seeker account for you while you applied. Set a password from "Forgot password" to log in with e-mail.</p>',
      },
    }).catch(() => {});
  }
  return { application, isNewUser, ...(await buildAuthPayload(user, tokens)) };
}

/* ----------------------------------------------------------- candidate */

export async function myApplications(userId, { stage, kind, page, limit, skip }) {
  const filter = { candidate: userId };
  if (stage) filter.stage = stage;
  if (kind) filter.jobKind = kind;
  const [items, total, counts] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('job stage isViewed viewedAt createdAt updatedAt source matchScore withdrawnAt')
      .populate('job', 'title slug kind orgSnapshot locations salary stipend status experience')
      .lean(),
    Application.countDocuments(filter),
    Application.aggregate([{ $match: { candidate: userId } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
  ]);
  return { items, total, page, limit, counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) };
}

export async function myApplication(userId, id) {
  const app = await Application.findOne({ _id: id, candidate: userId })
    .select('-comments -callingStatus -messagingStatus -forwardedVia -screeningStatus -rating -tags -assignedTo')
    .populate('job', 'title slug kind orgSnapshot locations salary status')
    .lean();
  if (!app) throw ApiError.notFound('Application not found');
  // Candidates see stage history only (internal notes stay private).
  app.history = (app.history || []).filter((h) => h.field === 'stage').map((h) => ({ stage: h.to, at: h.at }));
  app.interviews = await Interview.find({ application: id }).select('-feedback -interviewers -scheduledBy').sort({ scheduledAt: -1 }).lean();
  return app;
}

export async function withdraw(userId, id) {
  const app = await Application.findOne({ _id: id, candidate: userId });
  if (!app) throw ApiError.notFound('Application not found');
  if (['hired', 'withdrawn'].includes(app.stage)) throw ApiError.badRequest(`Application is already ${app.stage}`);
  app.history.push({ field: 'stage', from: app.stage, to: 'withdrawn', by: userId });
  app.stage = 'withdrawn';
  app.withdrawnAt = new Date();
  await app.save();
  return app;
}

/* ------------------------------------------------------------ employer */

function scopeFilter(user) {
  if (isAdmin(user)) return {};
  const base = { organization: user.employer.organization };
  if (!hasEmployerPermission(user, 'response.manage_all')) base.jobPostedBy = user._id;
  return base;
}

export function buildResponseFilter(user, q) {
  const filter = { ...scopeFilter(user), ...dateRangeFilter(q) };
  // cast ids explicitly - this filter is also used in aggregation pipelines (no auto-casting there)
  if (q.job) filter.job = new mongoose.Types.ObjectId(String(q.job));
  if (q.organization && isAdmin(user)) filter.organization = new mongoose.Types.ObjectId(String(q.organization));
  if (q.stage) filter.stage = q.stage;
  if (q.screeningStatus) filter.screeningStatus = q.screeningStatus;
  if (q.callingStatus) filter.callingStatus = q.callingStatus;
  if (q.messagingStatus) filter.messagingStatus = q.messagingStatus;
  if (q.kind) filter.jobKind = q.kind;
  if (q.source) filter.source = q.source;
  if (q.category === 'invite') filter.source = 'invite';
  else if (q.category) filter.jobKind = q.category; // job | internship
  if (q.view === 'new') filter.isViewed = false;
  if (q.view === 'viewed') filter.isViewed = true;
  if (q.view === 'pending') filter.actionTaken = false;
  if (q.minScore) filter.matchScore = { $gte: q.minScore };
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ 'snapshot.fullName': re }, { 'snapshot.email': re }, { 'snapshot.mobile': re }, { 'snapshot.currentJobTitle': re }];
  }
  return filter;
}

export async function listResponses(user, q, { page, limit, skip, sort }) {
  const filter = buildResponseFilter(user, q);
  const [items, total, stages] = await Promise.all([
    Application.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-history -answers')
      .populate('job', 'title uid kind slug')
      .populate('candidate', 'fullName avatar isVerified emailVerifiedAt mobileVerifiedAt lastActiveAt labels')
      .lean(),
    Application.countDocuments(filter),
    Application.aggregate([{ $match: { ...filter, stage: { $exists: true } } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
  ]);
  return { items, total, page, limit, stages: Object.fromEntries(stages.map((s) => [s._id, s.count])) };
}

async function getScopedApplication(user, id) {
  const app = await Application.findOne({ _id: id, ...scopeFilter(user) });
  if (!app) throw ApiError.notFound('Application not found');
  return app;
}

export async function getResponse(user, id) {
  const app = await getScopedApplication(user, id);
  if (user.role === 'employer') recordProfileView({ candidateId: app.candidate, member: user, source: 'application', jobId: app.job });
  if (!app.isViewed && !isAdmin(user)) {
    app.isViewed = true;
    app.viewedAt = new Date();
    await app.save();
    await Job.updateOne({ _id: app.job, 'stats.newApplications': { $gt: 0 } }, { $inc: { 'stats.newApplications': -1 } });
  }
  const [job, profile, candidate, interviews] = await Promise.all([
    Job.findById(app.job).select('title uid kind slug questions').lean(),
    Candidate.findOne({ user: app.candidate }).lean(),
    User.findById(app.candidate)
      .select('fullName displayName avatar email mobile gender isVerified emailVerifiedAt mobileVerifiedAt lastActiveAt labels situationTag')
      .lean(),
    Interview.find({ application: app._id }).sort({ scheduledAt: -1 }).lean(),
  ]);
  const resumeKey = app.snapshot?.resume?.key || profile?.resume?.key;
  return {
    application: app.toObject(),
    job,
    candidate,
    profile,
    interviews,
    resumeUrl: resumeKey ? await signedUrl(resumeKey, 900, app.snapshot?.resume?.name || profile?.resume?.name) : null,
  };
}

const TRACKED = ['stage', 'screeningStatus', 'callingStatus'];

export async function updateResponse(user, id, data) {
  const app = await getScopedApplication(user, id);
  const prevStage = app.stage;
  for (const field of TRACKED) {
    if (data[field] !== undefined && data[field] !== app[field]) {
      app.history.push({ field, from: app[field], to: data[field], by: user._id, note: data.note });
      app[field] = data[field];
    }
  }
  if (data.screeningStatus === 'rejected' && app.stage !== 'rejected') {
    app.history.push({ field: 'stage', from: app.stage, to: 'rejected', by: user._id });
    app.stage = 'rejected';
  }
  if (data.screeningStatus === 'shortlisted' && app.stage === 'applied') {
    app.history.push({ field: 'stage', from: app.stage, to: 'screened', by: user._id });
    app.stage = 'screened';
  }
  if (data.messagingStatus) app.messagingStatus = [...new Set([...(app.messagingStatus || []), ...data.messagingStatus])];
  if (data.forward) app.forwardedVia.push({ ...data.forward, by: user._id });
  if (data.comment) app.comments.push({ body: data.comment, by: user._id });
  if (data.rating !== undefined) app.rating = data.rating;
  if (data.tags) app.tags = data.tags;
  if (data.assignedTo !== undefined) app.assignedTo = data.assignedTo || undefined;
  app.actionTaken = true;
  await app.save();

  if (app.stage !== prevStage) await onStageChange(app, prevStage);
  return app.toObject();
}

async function onStageChange(app, prevStage) {
  const [job, candidate] = await Promise.all([
    Job.findById(app.job).select('title orgSnapshot organization').lean(),
    User.findById(app.candidate).select('fullName email').lean(),
  ]);
  const label = STAGE_LABEL[app.stage] || app.stage;
  if (app.stage === 'hired') {
    await Job.updateOne({ _id: app.job }, { $inc: { 'stats.hired': 1 } });
    await trackUsage(app.organization, null, 'hiring', 1);
  }
  if (app.stage === 'screened' && prevStage === 'applied') await Job.updateOne({ _id: app.job }, { $inc: { 'stats.shortlisted': 1 } });
  notify(app.candidate, {
    type: 'application_update',
    title: `Application update: ${job.title}`,
    body: `Status: ${label}`,
    data: { screen: 'application', applicationId: String(app._id) },
    channels: ['in_app', 'push', 'email'],
    email: { template: 'applicationStatus', vars: { name: candidate?.fullName, jobTitle: job.title, company: job.orgSnapshot?.name, status: label } },
  });
}

export async function bulkUpdate(user, ids, data) {
  const apps = await Application.find({ _id: { $in: ids }, ...scopeFilter(user) }).select('_id');
  for (const a of apps) await updateResponse(user, a._id, data);
  return { updated: apps.length };
}

/* -------------------------------------------------------------- interviews */

export async function scheduleInterview(user, applicationId, data) {
  const app = await getScopedApplication(user, applicationId);
  const interview = await Interview.create({
    ...data,
    application: app._id,
    job: app.job,
    organization: app.organization,
    candidate: app.candidate,
    scheduledBy: user._id,
  });
  if (app.stage !== 'interview_scheduled') await updateResponse(user, app._id, { stage: 'interview_scheduled', note: `Interview ${interview.round}` });
  const [job, candidate] = await Promise.all([
    Job.findById(app.job).select('title orgSnapshot').lean(),
    User.findById(app.candidate).select('fullName').lean(),
  ]);
  const when = new Date(data.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  notify(app.candidate, {
    type: 'interview_scheduled',
    title: `Interview scheduled: ${job.title}`,
    body: when,
    data: { screen: 'interview', interviewId: String(interview._id), applicationId: String(app._id) },
    channels: ['in_app', 'push', 'email', 'sms'],
    email: {
      template: 'interview',
      vars: {
        name: candidate?.fullName,
        jobTitle: job.title,
        company: job.orgSnapshot?.name,
        when,
        mode: data.mode,
        location: data.meetingLink || data.location,
      },
    },
    sms: { template: 'interview', vars: { jobTitle: job.title, company: job.orgSnapshot?.name, when } },
  });
  return interview;
}

export async function updateInterview(user, interviewId, data) {
  const interview = await Interview.findOne({ _id: interviewId, ...(isAdmin(user) ? {} : { organization: user.employer.organization }) });
  if (!interview) throw ApiError.notFound('Interview not found');
  const rescheduled = data.scheduledAt && new Date(data.scheduledAt).getTime() !== interview.scheduledAt.getTime();
  interview.set(data);
  if (rescheduled) {
    interview.status = 'rescheduled';
    interview.reminderSentAt = undefined;
    interview.candidateResponse = 'pending';
  }
  await interview.save();
  if (rescheduled || data.status === 'cancelled') {
    notify(interview.candidate, {
      type: 'interview_update',
      title: data.status === 'cancelled' ? 'Interview cancelled' : 'Interview rescheduled',
      body:
        data.status === 'cancelled'
          ? 'Your interview was cancelled by the employer'
          : new Date(interview.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      data: { screen: 'interview', interviewId: String(interview._id) },
      channels: ['in_app', 'push', 'email'],
    });
  }
  return interview;
}

export async function listInterviews(user, { from, to, status, job, page, limit, skip }) {
  const filter = user.role === ROLES.CANDIDATE ? { candidate: user._id } : isAdmin(user) ? {} : { organization: user.employer.organization };
  if (user.role === ROLES.EMPLOYER && !hasEmployerPermission(user, 'meeting.manage_all')) filter.$or = [{ scheduledBy: user._id }, { interviewers: user._id }];
  if (status) filter.status = status;
  if (job) filter.job = job;
  if (from || to) filter.scheduledAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
  const projection = user.role === ROLES.CANDIDATE ? '-feedback -interviewers -scheduledBy' : '';
  const [items, total] = await Promise.all([
    Interview.find(filter)
      .select(projection)
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('job', 'title orgSnapshot.name slug')
      .populate('candidate', 'fullName avatar')
      .lean(),
    Interview.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function respondInterview(userId, interviewId, response) {
  const interview = await Interview.findOneAndUpdate({ _id: interviewId, candidate: userId }, { $set: { candidateResponse: response } }, { new: true });
  if (!interview) throw ApiError.notFound('Interview not found');
  notify(interview.scheduledBy, {
    type: 'interview_response',
    title: `Candidate ${response} the interview`,
    data: { screen: 'interview', interviewId: String(interview._id) },
    channels: ['in_app', 'push'],
  });
  return interview;
}

/** Cron: reminders ~1 hour (and 24h for e-mail) before interviews. */
export async function sendInterviewReminders() {
  const now = Date.now();
  const due = await Interview.find({
    status: { $in: ['scheduled', 'rescheduled'] },
    reminderSentAt: null,
    scheduledAt: { $gt: new Date(now), $lte: new Date(now + 24 * 3600 * 1000) },
  })
    .populate('job', 'title orgSnapshot.name')
    .limit(500);
  for (const i of due) {
    const when = i.scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    notify(i.candidate, {
      type: 'interview_reminder',
      title: `Reminder: interview for ${i.job?.title}`,
      body: when,
      data: { screen: 'interview', interviewId: String(i._id) },
      channels: ['in_app', 'push', 'sms', 'whatsapp'],
      sms: { template: 'interview_reminder', vars: { jobTitle: i.job?.title, when } },
    });
    notify(i.scheduledBy, {
      type: 'interview_reminder',
      title: `Upcoming interview: ${i.job?.title}`,
      body: when,
      data: { screen: 'interview', interviewId: String(i._id) },
      channels: ['in_app', 'push'],
    });
    i.reminderSentAt = new Date();
    await i.save();
  }
  return due.length;
}

/* ----------------------------------------------------------------- export */

export const RESPONSE_COLUMNS = [
  { header: 'Application ID', key: '_id', get: (r) => String(r._id) },
  { header: 'Job Title', key: 'job.title' },
  { header: 'Job ID', key: 'job.uid' },
  { header: 'Candidate Name', key: 'snapshot.fullName' },
  { header: 'E-mail', key: 'snapshot.email' },
  { header: 'Mobile', key: 'snapshot.mobile' },
  { header: 'Current Title', key: 'snapshot.currentJobTitle' },
  { header: 'Experience (Years)', key: 'exp', get: (r) => (r.snapshot?.totalExperienceMonths ? (r.snapshot.totalExperienceMonths / 12).toFixed(1) : '') },
  { header: 'Current Salary', key: 'snapshot.currentSalary' },
  { header: 'Location', key: 'snapshot.currentLocation' },
  { header: 'Key Skills', key: 'snapshot.keySkills' },
  { header: 'Stage', key: 'stage' },
  { header: 'Screening Status', key: 'screeningStatus' },
  { header: 'Calling Status', key: 'callingStatus' },
  { header: 'Messaging Status', key: 'messagingStatus' },
  { header: 'Match Score', key: 'matchScore' },
  { header: 'Source', key: 'source' },
  { header: 'Viewed', key: 'isViewed', get: (r) => (r.isViewed ? 'Yes' : 'No') },
  { header: 'Applied On', key: 'createdAt' },
];

export async function exportResponses(user, q) {
  if (!isAdmin(user) && !hasEmployerPermission(user, 'response.export_all', 'response.export_own'))
    throw ApiError.forbidden('You are not allowed to export responses');
  const filter = buildResponseFilter(user, q);
  const ownOnly = !isAdmin(user) && !hasEmployerPermission(user, 'response.export_all');
  if (ownOnly) filter.jobPostedBy = user._id;
  const rows = await Application.find(filter).sort({ createdAt: -1 }).limit(50000).populate('job', 'title uid').lean();
  if (user.role === ROLES.EMPLOYER) {
    const org = user.employer.organization;
    await Promise.all([trackUsage(org, user._id, 'excel_download', 1), rows.length && trackUsage(org, user._id, ownOnly ? 'response_download_own' : 'response_download_all', rows.length)]);
    // Feeds the resume-search filter "Hide candidates already downloaded in Excel".
    const candidates = [...new Set(rows.map((r) => String(r.candidate)))];
    if (candidates.length) {
      ProfileAccess.insertMany(
        candidates.map((candidate) => ({ organization: org, member: user._id, candidate, type: 'excel_download', source: 'responses_export' })),
        { ordered: false },
      ).catch(() => {});
    }
  }
  return rows;
}

/** Streams a ZIP of resumes for the filtered responses (max 500 per download). */
export async function streamResumesZip(user, q, res) {
  if (!isAdmin(user) && !hasEmployerPermission(user, 'resume.bulk_download')) throw ApiError.forbidden('Bulk resume download is not allowed for your role');
  const filter = { ...buildResponseFilter(user, q), 'snapshot.resume.key': { $exists: true } };
  const rows = await Application.find(filter).select('snapshot').sort({ createdAt: -1 }).limit(500).lean();
  if (!rows.length) throw ApiError.notFound('No resumes found for this selection');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="resumes-${Date.now()}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => res.destroy(err));
  archive.pipe(res);
  const used = new Set();
  for (const r of rows) {
    try {
      const buf = await readFile(r.snapshot.resume.key);
      const ext = (r.snapshot.resume.name || '').split('.').pop() || 'pdf';
      let name = `${(r.snapshot.fullName || 'candidate').replace(/[^\w-]+/g, '_')}.${ext}`;
      while (used.has(name)) name = `${name.replace(/(\.\w+)$/, '')}_${used.size}.${ext}`;
      used.add(name);
      archive.append(buf, { name });
    } catch {
      /* skip missing file */
    }
  }
  if (user.role === ROLES.EMPLOYER) await trackUsage(user.employer.organization, user._id, 'resume_download', rows.length);
  await archive.finalize();
}

/* ------------------------------------------------------------ analytics */

export async function jobFunnel(user, jobId) {
  const job = await Job.findById(jobId).select('organization title stats').lean();
  if (!job || (!isAdmin(user) && String(job.organization) !== String(user.employer?.organization))) throw ApiError.notFound('Job not found');
  const [stages, sources, daily] = await Promise.all([
    Application.aggregate([{ $match: { job: job._id } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { job: job._id } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Application.aggregate([
      { $match: { job: job._id } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return {
    job: { _id: job._id, title: job.title, stats: job.stats },
    stages: Object.fromEntries(stages.map((s) => [s._id, s.count])),
    sources: Object.fromEntries(sources.map((s) => [s._id, s.count])),
    daily,
  };
}

/** Admin: assign up to 500 candidates to a job (creates applications with source admin_assign). */
export async function adminAssign(admin, jobId, candidateIds) {
  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');
  const users = await User.find({ _id: { $in: candidateIds }, role: ROLES.CANDIDATE }).lean();
  const profiles = await Candidate.find({ user: { $in: users.map((u) => u._id) } }).lean();
  const byUser = new Map(profiles.map((p) => [String(p.user), p]));
  const result = { assigned: 0, skipped: 0, errors: [] };
  for (const u of users) {
    try {
      await createApplication({ job, user: u, profile: byUser.get(String(u._id)), source: 'admin_assign', assignedBy: admin._id });
      result.assigned += 1;
    } catch (err) {
      result.skipped += 1;
      if (result.errors.length < 50) result.errors.push({ candidate: u._id, message: err.message });
    }
  }
  return result;
}
