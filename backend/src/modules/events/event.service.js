import QRCode from 'qrcode';
import config from '../../config/env.js';
import ApiError from '../../shared/errors/ApiError.js';
import { ID_PREFIX } from '../../shared/constants/index.js';
import { generateUid } from '../../shared/models/counter.model.js';
import { uniqueSlug } from '../../shared/utils/helpers.js';
import { putFile, deleteFile } from '../../shared/services/storage.service.js';
import JobEvent from './event.model.js';
import Job from '../jobs/job.model.js';
import Candidate from '../candidates/candidate.model.js';
import { Application } from '../applications/application.model.js';
import { createApplication } from '../applications/application.service.js';
import { publicJob, buildShareLinks } from '../jobs/job.service.js';
import { LIST_FIELDS } from '../jobs/job.query.js';

async function validJobs(orgId, jobIds = []) {
  if (!jobIds.length) return [];
  const jobs = await Job.find({ _id: { $in: jobIds }, organization: orgId, status: { $in: ['active', 'draft', 'pending', 'admin_review'] } })
    .select('_id')
    .lean();
  if (jobs.length !== new Set(jobIds.map(String)).size) throw ApiError.badRequest('Some jobs are invalid or do not belong to your organization');
  return jobs.map((j) => j._id);
}

export async function createEvent(member, data) {
  const orgId = member.employer.organization;
  const jobs = await validJobs(orgId, data.jobs);
  const event = await JobEvent.create({
    ...data,
    jobs,
    organization: orgId,
    createdBy: member._id,
    uid: await generateUid(ID_PREFIX.event),
    slug: uniqueSlug(data.title),
  });
  if (jobs.length) await Job.updateMany({ _id: { $in: jobs } }, { $addToSet: { events: event._id } });
  return event;
}

async function ownEvent(member, id) {
  const event = await JobEvent.findOne({ _id: id, organization: member.employer.organization });
  if (!event) throw ApiError.notFound('Event not found');
  return event;
}

export async function updateEvent(member, id, data) {
  const event = await ownEvent(member, id);
  if (data.jobs) {
    const jobs = await validJobs(event.organization, data.jobs);
    await Job.updateMany({ events: event._id }, { $pull: { events: event._id } });
    await Job.updateMany({ _id: { $in: jobs } }, { $addToSet: { events: event._id } });
    data.jobs = jobs;
  }
  event.set(data);
  await event.save();
  return event;
}

export async function uploadBanner(member, id, file) {
  const event = await ownEvent(member, id);
  const stored = await putFile(file, { folder: 'events' });
  if (event.banner?.key) await deleteFile(event.banner.key);
  event.banner = { key: stored.key, url: stored.url };
  await event.save();
  return event.banner;
}

export async function deleteEvent(member, id) {
  const event = await ownEvent(member, id);
  await Job.updateMany({ events: event._id }, { $pull: { events: event._id } });
  await event.deleteOne();
}

export async function listOrgEvents(member, { status, page, limit, skip }) {
  const filter = { organization: member.employer.organization, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([JobEvent.find(filter).sort({ startAt: -1 }).skip(skip).limit(limit).lean(), JobEvent.countDocuments(filter)]);
  return { items, total, page, limit };
}

export async function shareEvent(member, id) {
  const event = await ownEvent(member, id);
  const link = `${config.urls.web}/events/${event.slug}`;
  return {
    link,
    qrCode: await QRCode.toDataURL(link, { width: 512, margin: 2 }),
    share: buildShareLinks(encodeURIComponent(link), encodeURIComponent(event.title)),
  };
}

export async function eventApplications(member, id, { page, limit, skip }) {
  const event = await ownEvent(member, id);
  const filter = { event: event._id };
  const [items, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('job', 'title uid').select('-history').lean(),
    Application.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/* public */

export async function publicEvent(slug) {
  const event = await JobEvent.findOne({ slug, status: { $in: ['published', 'closed'] } })
    .populate('organization', 'name slug username logo isVerified')
    .lean();
  if (!event) throw ApiError.notFound('Event not found');
  JobEvent.updateOne({ _id: event._id }, { $inc: { 'stats.views': 1 } }).catch(() => {});
  const jobs = await Job.find({ _id: { $in: event.jobs }, status: 'active' })
    .select(LIST_FIELDS)
    .lean();
  return { ...event, uid: undefined, jobs: jobs.map(publicJob), isOpen: event.status === 'published' && event.endAt > new Date() };
}

export async function listPublicEvents({ city, page, limit, skip }) {
  const filter = { status: 'published', endAt: { $gte: new Date() }, ...(city ? { 'venue.city': city } : {}) };
  const [items, total] = await Promise.all([
    JobEvent.find(filter).select('-uid').sort({ startAt: 1 }).skip(skip).limit(limit).populate('organization', 'name slug logo isVerified').lean(),
    JobEvent.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/** Candidate applies to one or more jobs of the event in a single request. */
export async function applyToEvent(user, slug, jobIds) {
  const event = await JobEvent.findOne({ slug, status: 'published' }).lean();
  if (!event || event.endAt < new Date()) throw ApiError.badRequest('This event is not accepting applications', undefined, 'EVENT_CLOSED');
  const allowed = new Set(event.jobs.map(String));
  const ids = jobIds.filter((id) => allowed.has(String(id)));
  if (!ids.length) throw ApiError.badRequest('Select at least one job from this event');
  const [jobs, profile] = await Promise.all([Job.find({ _id: { $in: ids }, status: 'active' }), Candidate.findOne({ user: user._id }).lean()]);
  const results = [];
  for (const job of jobs) {
    try {
      const app = await createApplication({ job, user, profile, source: 'event', event: event._id });
      results.push({ jobId: job._id, applicationId: app._id, status: 'applied' });
    } catch (err) {
      results.push({ jobId: job._id, status: 'skipped', reason: err.message });
    }
  }
  const appliedCount = results.filter((r) => r.status === 'applied').length;
  if (appliedCount) await JobEvent.updateOne({ _id: event._id }, { $inc: { 'stats.applications': appliedCount } });
  return { results };
}
