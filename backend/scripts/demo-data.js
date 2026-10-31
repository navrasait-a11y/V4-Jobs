/**
 * Pre-launch demo data. Every inserted _id is recorded in the `demo_manifest` collection,
 * so removal deletes exactly those records and nothing created by real users.
 *
 *   DEMO_PASSWORD=... npm run demo:seed     adds the data (refuses to run twice)
 *   npm run demo:remove                     removes all of it, including its media files
 *   npm run demo:remove -- --dry-run        reports what would be removed, changes nothing
 *
 * A media file is deleted only when no record left in the database still uses it.
 * If a file delete fails, run demo:remove again: the pending files stay in the manifest.
 *
 * Writes directly through models, so no e-mail, SMS or push is ever sent.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { removeFile, storageRoot } from '../src/shared/services/storage.service.js';
import { collectKeys, findReferencedKeys } from './lib/media-keys.js';
import User from '../src/modules/users/user.model.js';
import Organization from '../src/modules/employers/organization.model.js';
import Job from '../src/modules/jobs/job.model.js';
import Candidate from '../src/modules/candidates/candidate.model.js';
import { Application, Interview } from '../src/modules/applications/application.model.js';
import { Follow, SavedJob } from '../src/modules/engagement/engagement.models.js';
import { JobAlert } from '../src/modules/alerts/alert.model.js';
import JobEvent from '../src/modules/events/event.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Conversation, Message } from '../src/modules/chat/chat.models.js';
import { Comment } from '../src/modules/moderation/moderation.models.js';
import { Blog, Faq } from '../src/modules/cms/cms.models.js';

const MODELS = { User, Organization, Job, Candidate, Application, Interview, Follow, SavedJob, JobAlert, JobEvent, Notification, Conversation, Message, Comment, Blog, Faq };
const DOMAIN = 'demo.freejobwala.test';
const DAY = 24 * 3600 * 1000;
const now = Date.now();
const DEMO_CREDITS = { job_post: 20, featured_job: 2, resume_view: 100, resume_download: 100, invite: 200, excel_download: 20, resume_search: 200 };
const pick = (arr, i) => arr[i % arr.length];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const CITIES = [
  ['Bengaluru', 'Karnataka'],
  ['Mumbai', 'Maharashtra'],
  ['Delhi', 'Delhi'],
  ['Hyderabad', 'Telangana'],
  ['Pune', 'Maharashtra'],
  ['Jaipur', 'Rajasthan'],
  ['Chennai', 'Tamil Nadu'],
  ['Gurugram', 'Haryana'],
].map(([city, state]) => ({ city, state, country: 'India' }));

// Fictional employers: names are invented so no real company is represented.
const ORGS = [
  ['Nimbus Softworks', 'company', 'IT Services', 'Private Limited'],
  ['Saffron Retail Labs', 'company', 'Retail', 'Private Limited'],
  ['Bluepeak Fintech', 'company', 'Banking', 'Startup'],
  ['Kaveri Health Systems', 'company', 'Healthcare', 'Private Limited'],
  ['Orbitra Logistics', 'company', 'Logistics', 'Private Limited'],
  ['Pixel Mango Studios', 'company', 'Media', 'Startup'],
  ['Trident Talent Partners', 'consultancy', 'Staffing', 'Partnership'],
  ['Northstar HR Consulting', 'consultancy', 'Staffing', 'Partnership'],
];

const ROLES = [
  ['Backend Developer', ['Node.js', 'MongoDB', 'REST APIs', 'AWS'], 'Engineering', 2, 5, 60000, 110000],
  ['Frontend Developer', ['React', 'JavaScript', 'CSS', 'TypeScript'], 'Engineering', 1, 4, 50000, 95000],
  ['Data Analyst', ['SQL', 'Excel', 'Power BI', 'Python'], 'Data', 1, 3, 40000, 75000],
  ['Digital Marketing Executive', ['SEO', 'Google Ads', 'Content'], 'Marketing', 1, 3, 25000, 45000],
  ['Inside Sales Executive', ['Lead Generation', 'CRM', 'Communication'], 'Sales', 0, 2, 20000, 35000],
  ['HR Recruiter', ['Sourcing', 'Screening', 'Communication'], 'Human Resources', 1, 4, 25000, 45000],
  ['QA Engineer', ['Selenium', 'Manual Testing', 'API Testing'], 'Engineering', 2, 5, 45000, 80000],
  ['Customer Support Associate', ['Communication', 'Ticketing', 'English'], 'Customer Success', 0, 2, 18000, 30000],
  ['Product Manager', ['Roadmapping', 'Analytics', 'Agile'], 'Product', 4, 8, 120000, 220000],
  ['Accountant', ['Tally', 'GST', 'Excel'], 'Finance', 2, 5, 30000, 55000],
];

const PEOPLE = ['Aditi Verma', 'Rohan Mehta', 'Sneha Iyer', 'Karan Singh', 'Pooja Nair', 'Vikram Rao', 'Neha Joshi', 'Arjun Das', 'Meera Pillai', 'Siddharth Jain', 'Ananya Ghosh', 'Rahul Bansal'];

const BLOGS = [
  ['How to write a resume recruiters actually read', 'Resume', 'Keep it to two pages, lead with results, and match the words used in the job post.'],
  ['Ten interview questions and how to answer them', 'Interview', 'Prepare short stories about real work. Structure each one as situation, action and result.'],
  ['How to negotiate your first salary offer', 'Career Growth', 'Research the range for your role and city, then ask with a number and a reason.'],
];

const FAQS = [
  ['Is Freejobwala free for job seekers?', 'Yes. Searching and applying for jobs is free.', 'candidate'],
  ['How do I track my applications?', 'Open My Applications or the ATS Tracker in your dashboard.', 'candidate'],
  ['How do I post a job?', 'Register as an employer, complete verification and choose Post a job.', 'employer'],
  ['How does employer verification work?', 'Upload your KYC documents. Our team reviews them and adds the verified badge.', 'employer'],
];

async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (min 8 chars)');
  const manifest = mongoose.connection.db.collection('demo_manifest');
  if (await manifest.findOne({})) throw new Error('Demo data already exists. Run demo:remove first.');

  const ids = Object.fromEntries(Object.keys(MODELS).map((k) => [k, []]));
  const track = (key, doc) => {
    ids[key].push(doc._id);
    return doc;
  };

  try {
    await populate(password, track);
  } finally {
    await manifest.insertOne({ createdAt: new Date(), ids });
  }
  console.log(Object.entries(ids).map(([k, v]) => `${k}: ${v.length}`).join(', '));
}

async function populate(password, track) {
  const orgs = [];
  for (const [i, [name, type, industry, organizationType]] of ORGS.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const owner = track('User', await User.create({ role: 'employer', fullName: `${pick(PEOPLE, i + 3)}`, email: `employer${n}@${DOMAIN}`, mobile: `90000100${n}`, password, status: 'active', emailVerifiedAt: new Date(), mobileVerifiedAt: new Date() }));
    const org = track(
      'Organization',
      await Organization.create({
        uid: `DEMO-ORG-${n}`,
        type,
        name,
        slug: `${slug(name)}-demo`,
        owner: owner._id,
        status: 'active',
        kycStatus: i % 3 === 2 ? 'under_review' : 'verified',
        isVerified: i % 3 !== 2,
        organizationType,
        industries: [industry],
        employeeCount: pick(['11-50', '51-200', '201-500'], i),
        website: `https://${slug(name)}.example.com`,
        about: `${name} is a demo employer used to preview Freejobwala before launch.`,
        offices: [{ type: 'Head Office', address: 'Demo Business Park', ...pick(CITIES, i), isPrimary: true }],
        stats: { activeJobs: 0 },
        credits: DEMO_CREDITS,
        planFeatures: { resumeDbAccess: true, contactUnlock: true, featuredJobs: true },
        planExpiresAt: new Date(now + 90 * DAY),
      }),
    );
    await User.updateOne({ _id: owner._id }, { $set: { 'employer.organization': org._id, 'employer.isOwner': true, 'employer.memberRole': 'employer_admin', 'employer.designation': 'Talent Lead' } });
    orgs.push({ org, owner });
  }

  const jobs = [];
  for (let i = 0; i < 64; i += 1) {
    const { org, owner } = pick(orgs, i);
    const [title, keySkills, department, min, max, sMin, sMax] = pick(ROLES, i);
    const city = pick(CITIES, i + 2);
    const posted = new Date(now - (i % 12) * DAY - 3600 * 1000);
    const internship = i % 9 === 8;
    const job = track(
      'Job',
      await Job.create({
        uid: `DEMO-JOB-${String(i + 1).padStart(3, '0')}`,
        kind: internship ? 'internship' : 'job',
        slug: `${slug(title)}-${slug(city.city)}-demo-${i + 1}`,
        organization: org._id,
        organizationType: org.type,
        postedBy: owner._id,
        title: internship ? `${title} Intern` : title,
        description: `Join ${org.name} as a ${title}. You will work with a small team, own your work end to end and learn quickly.`,
        responsibilities: 'Deliver your work on time.\nCollaborate with your team.\nKeep improving how things are done.',
        keySkills,
        industries: org.industries,
        departments: [department],
        roles: [title],
        employmentTypes: [internship ? 'Internship' : 'Full Time'],
        jobModes: [pick(['Work from Office', 'Hybrid', 'Remote'], i)],
        isRemote: i % 3 === 2,
        openings: (i % 4) + 1,
        experience: internship ? { min: 0, max: 0 } : { min, max },
        salary: { min: sMin, max: sMax, period: 'monthly', currency: 'INR', hidden: i % 7 === 6 },
        stipend: internship ? { min: 10000, max: 20000 } : undefined,
        duration: internship ? { value: 6, unit: 'months' } : undefined,
        locations: [city],
        status: 'active',
        labels: i % 5 === 0 ? ['urgent'] : [],
        isFeatured: i % 6 === 0,
        publishedAt: posted,
        refreshedAt: posted,
        expiresAt: new Date(now + 30 * DAY),
        orgSnapshot: { name: org.name, isVerified: org.isVerified, slug: org.slug, employerType: org.organizationType },
        stats: { views: 20 + i * 3, applications: 0 },
      }),
    );
    jobs.push(job);
  }
  for (const { org } of orgs) await Organization.updateOne({ _id: org._id }, { $set: { 'stats.activeJobs': jobs.filter((j) => String(j.organization) === String(org._id)).length } });

  const candidates = [];
  const applications = [];
  for (const [i, fullName] of PEOPLE.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const [title, keySkills] = pick(ROLES, i);
    const city = pick(CITIES, i);
    const years = i % 7;
    const user = track('User', await User.create({ role: 'candidate', fullName, email: `candidate${n}@${DOMAIN}`, mobile: `90000200${n}`, password, status: 'active', gender: i % 2 ? 'Male' : 'Female', emailVerifiedAt: new Date(), mobileVerifiedAt: new Date(), isVerified: i % 2 === 0, lastLoginAt: new Date(now - i * DAY) }));
    track(
      'Candidate',
      await Candidate.create({
        user: user._id,
        experienceLevel: years ? 'I have Experience' : 'I am a Fresher',
        resumeHeadline: `${title} open to new opportunities`,
        profileSummary: `${fullName} is a demo candidate profile used to preview search and hiring flows.`,
        keySkills,
        totalExperience: { years, months: 0 },
        currentLocation: city,
        currentSalary: years ? 25000 + years * 12000 : undefined,
        noticePeriod: pick(['Immediate Joining', '15 Days', '1 Month'], i),
        preferences: { locations: [city], expectedSalary: 35000 + years * 15000, jobTypes: ['job'], jobModes: ['Hybrid'] },
        employments: years
          ? [{ jobTitle: title, employerName: pick(['Lotus Infotech', 'Harbor Commerce', 'Vertex Systems'], i), isCurrent: true, startDate: new Date(now - years * 365 * DAY), monthlySalary: 25000 + years * 12000, skills: keySkills, description: 'Worked across delivery and day-to-day operations of the team.' }]
          : [],
        educations: [{ level: 'Graduate', degree: pick(['B.Tech', 'B.Com', 'BBA', 'B.Sc'], i), specialisation: pick(['Computer Science', 'Finance', 'Marketing', 'Mathematics'], i), institution: pick(['Rajasthan University', 'Pune University', 'Delhi University'], i), status: 'Pass Out', isHighest: true }],
        profileCompletion: 60 + (i % 4) * 10,
      }),
    );
    candidates.push({ user, title, city, keySkills });
    // Each candidate applies to two matching jobs at varied pipeline stages.
    for (const job of jobs.filter((j) => j.title.startsWith(title)).slice(0, 2)) {
      const stage = pick(['applied', 'screened', 'interview_scheduled', 'offered', 'applied', 'rejected'], i);
      const application = track(
        'Application',
        await Application.create({
          job: job._id,
          organization: job.organization,
          candidate: user._id,
          jobPostedBy: job.postedBy,
          jobKind: job.kind,
          source: 'direct',
          snapshot: { fullName, email: user.email, mobile: user.mobile, totalExperienceMonths: years * 12, currentLocation: city.city, keySkills },
          stage,
          matchScore: 55 + (i % 8) * 6,
          createdAt: new Date(now - (i % 10) * DAY),
        }),
      );
      applications.push({ application, job, user, fullName });
      await Job.updateOne({ _id: job._id }, { $inc: { 'stats.applications': 1 } });
      track('Notification', await Notification.create({ user: job.postedBy, type: 'new_application', title: `New application for ${job.title}`, body: `${fullName} applied`, data: { screen: 'application', applicationId: application._id }, createdAt: new Date(now - (i % 10) * DAY) }));
      if (stage === 'interview_scheduled') {
        track('Interview', await Interview.create({ application: application._id, job: job._id, organization: job.organization, candidate: user._id, scheduledBy: job.postedBy, scheduledAt: new Date(now + ((i % 6) + 1) * DAY), durationMinutes: 30, mode: 'video', meetingLink: 'https://meet.example.com/demo', round: 'First round', status: 'scheduled' }));
      }
    }
  }

  // Candidate activity, so dashboards and lists are populated.
  for (const [i, c] of candidates.entries()) {
    for (const job of jobs.filter((j) => !j.title.startsWith(c.title)).slice(i, i + 3)) track('SavedJob', await SavedJob.create({ user: c.user._id, job: job._id }));
    for (const { org } of [pick(orgs, i), pick(orgs, i + 1)]) track('Follow', await Follow.create({ follower: c.user._id, organization: org._id }));
    track('JobAlert', await JobAlert.create({ user: c.user._id, name: `${c.title} in ${c.city.city}`, email: c.user.email, mobile: c.user.mobile, frequency: pick(['daily', 'weekly'], i), isActive: true, channels: ['email', 'in_app'], criteria: { jobTitle: c.title, keySkills: c.keySkills, locations: [c.city], kind: 'any' } }));
    track('Notification', await Notification.create({ user: c.user._id, type: 'job_alert', title: `New ${c.title} jobs for you`, body: `Matching jobs in ${c.city.city}`, data: { screen: 'job_alert' } }));
  }
  for (const [i, { org, owner }] of orgs.slice(0, 3).entries()) {
    const start = new Date(now + (i + 4) * DAY);
    track('JobEvent', await JobEvent.create({ uid: `DEMO-EVT-0${i + 1}`, organization: org._id, createdBy: owner._id, title: `${org.name} walk-in drive`, slug: `${slug(org.name)}-walk-in-demo`, description: 'Meet the hiring team in person and interview on the same day.', mode: i === 1 ? 'virtual' : 'walk_in', venue: { address: 'Demo Business Park', city: pick(CITIES, i).city, state: pick(CITIES, i).state }, startAt: start, endAt: new Date(start.getTime() + 6 * 3600 * 1000), jobs: jobs.filter((j) => String(j.organization) === String(org._id)).slice(0, 3).map((j) => j._id), status: 'published' }));
  }
  for (const [i, { application, job, user, fullName }] of applications.slice(0, 6).entries()) {
    const employer = job.postedBy;
    const conv = track('Conversation', await Conversation.create({ type: 'direct', participants: [{ user: employer, role: 'employer', organization: job.organization }, { user: user._id, role: 'candidate', unread: 1 }], participantIds: [employer, user._id], organization: job.organization, candidate: user._id, job: job._id, lastMessage: { body: 'Are you available for a quick call this week?', type: 'text', sender: employer, at: new Date(now - i * 3600 * 1000) }, lastMessageAt: new Date(now - i * 3600 * 1000) }));
    track('Message', await Message.create({ conversation: conv._id, sender: employer, senderRole: 'employer', body: `Hi ${fullName.split(' ')[0]}, thanks for applying to ${job.title}.` }));
    track('Message', await Message.create({ conversation: conv._id, sender: employer, senderRole: 'employer', body: 'Are you available for a quick call this week?' }));
    if (i < 4) track('Comment', await Comment.create({ author: user._id, authorRole: 'candidate', targetType: 'organization', targetOrganization: job.organization, direction: 'candidate_to_employer', body: pick(['Clear process and quick responses.', 'The team was friendly and kept me informed.', 'Good interview experience overall.', 'Well organised hiring process.'], i), rating: 4 + (i % 2), status: 'approved' }));
    void application;
  }

  const author = await User.findOne({ role: { $in: ['admin', 'super_admin'] } }).select('_id').lean();
  if (!author) console.log('No admin found, skipping demo blogs. Run npm run seed:admin first.');
  for (const [i, [title, category, excerpt]] of author ? BLOGS.entries() : []) {
    track('Blog', await Blog.create({ author: author._id, title, slug: `${slug(title)}-demo`, excerpt, content: `<p>${excerpt}</p><p>This is a demo article shown before launch.</p>`, category, tags: ['career'], status: 'published', publishedAt: new Date(now - (i + 1) * 3 * DAY) }));
  }
  for (const [i, [question, answer, audience]] of FAQS.entries()) track('Faq', await Faq.create({ question, answer, audience, order: i, isActive: true }));

}

const LINKED_COLLECTIONS = ['applications', 'savedjobs', 'follows', 'notifications', 'sessions', 'interviews', 'jobalerts', 'activities', 'emaillogs', 'messagelogs', 'profileaccesses', 'jobevents', 'conversations', 'messages', 'comments', 'reports', 'jobinvites', 'mails', 'subscriptions', 'orders'];

async function remove({ dryRun }) {
  const { db } = mongoose.connection;
  const manifest = db.collection('demo_manifest');
  const doc = await manifest.findOne({});
  if (!doc) return console.log('No demo data found.');

  // Records created while testing with demo accounts are not in the manifest, so follow ownership too.
  const users = [...doc.ids.User, ...(await User.find({ email: new RegExp(`@${DOMAIN.replaceAll('.', '\\.')}$`) }).distinct('_id'))];
  const orgIds = [...doc.ids.Organization, ...(await Organization.find({ owner: { $in: users } }).distinct('_id'))];
  const jobIds = [...doc.ids.Job, ...(await Job.find({ organization: { $in: orgIds } }).distinct('_id'))];
  const conversationIds = [...doc.ids.Conversation, ...(await Conversation.find({ participantIds: { $in: users } }).distinct('_id'))];
  const linked = {
    $or: [
      { job: { $in: jobIds } },
      { organization: { $in: orgIds } },
      { candidate: { $in: users } },
      { user: { $in: users } },
      { follower: { $in: users } },
      { author: { $in: users } },
      { reporter: { $in: users } },
      { buyer: { $in: users } },
      { sender: { $in: users } },
      { conversation: { $in: conversationIds } },
      { _id: { $in: conversationIds } },
    ],
  };
  const targets = [
    ...Object.entries(doc.ids).map(([key, list]) => [MODELS[key].collection.name, { _id: { $in: list } }]),
    ['jobs', { _id: { $in: jobIds } }],
    ['organizations', { _id: { $in: orgIds } }],
    ['users', { _id: { $in: users } }],
    [Candidate.collection.name, { user: { $in: users } }],
    ...LINKED_COLLECTIONS.map((name) => [name, linked]),
  ];

  // Read the media keys before the records that hold them are gone.
  const media = new Set(doc.pendingMedia || []);
  for (const [name, filter] of targets) {
    for await (const record of db.collection(name).find(filter)) collectKeys(record, media);
  }

  if (dryRun) {
    const records = await Promise.all(targets.map(async ([name, filter]) => [name, await db.collection(name).countDocuments(filter)]));
    const counts = {};
    for (const [name, n] of records) counts[name] = Math.max(counts[name] || 0, n);
    console.log('DRY RUN - nothing was changed\nRecords:', counts);
    const keep = await keepers(db, targets);
    const files = [...media].filter((key) => !keep.has(key));
    console.log(`Media files to delete: ${files.length}, kept because real records use them: ${media.size - files.length}`);
    files.forEach((key) => console.log(`  ${key}`));
    return undefined;
  }

  await manifest.updateOne({ _id: doc._id }, { $set: { pendingMedia: [...media] } });
  for (const [name, filter] of targets) {
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    if (deletedCount) console.log(`${name}: removed ${deletedCount}`);
  }

  const stillUsed = await findReferencedKeys(db, ['demo_manifest']);
  const files = [...media].filter((key) => !stillUsed.has(key));
  const failed = [];
  for (const key of files) {
    try {
      await removeFile(key);
      await fs.unlink(path.join(storageRoot, key)).catch(() => {}); // local copy kept by r2:migrate
    } catch (err) {
      failed.push(key);
      console.error(`Could not delete ${key}: ${err.message}`);
    }
  }
  console.log(`Media files deleted from ${config.storage.driver}: ${files.length - failed.length}, kept because real records use them: ${media.size - files.length}`);
  if (config.storage.driver !== 'r2' && files.length) console.log('Note: STORAGE_DRIVER is local, so nothing was deleted from Cloudflare R2.');
  if (failed.length) {
    await manifest.updateOne({ _id: doc._id }, { $set: { pendingMedia: failed } });
    process.exitCode = 1;
    return console.error(`${failed.length} file(s) were not deleted. Fix the problem and run demo:remove again.`);
  }
  await manifest.deleteMany({});
  return console.log('Demo data removed.');
}

/** Dry-run view of what stays: keys held by every record that the removal would not touch. */
async function keepers(db, targets) {
  const out = new Set();
  const byName = {};
  for (const [name, filter] of targets) (byName[name] ||= []).push(filter);
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.') || name === 'demo_manifest') continue;
    const query = byName[name] ? { $nor: byName[name] } : {};
    for await (const record of db.collection(name).find(query)) collectKeys(record, out);
  }
  return out;
}

const command = process.argv[2];
await connectDatabase();
try {
  if (command === 'seed') await seed();
  else if (command === 'remove') await remove({ dryRun: process.argv.includes('--dry-run') });
  else console.log('Usage: node scripts/demo-data.js seed|remove');
} finally {
  await disconnectDatabase();
}
