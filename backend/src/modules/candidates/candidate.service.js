import ApiError from '../../shared/errors/ApiError.js';
import { putFile, deleteFile, signedUrl } from '../../shared/services/storage.service.js';
import { extractText, parseResume } from '../../shared/services/resumeParser.js';
import { getSetting } from '../settings/settings.service.js';
import { USER_STATUS } from '../../shared/constants/index.js';
import { pick } from '../../shared/utils/helpers.js';
import User from '../users/user.model.js';
import Candidate from './candidate.model.js';
import { Application } from '../applications/application.model.js';
import { SavedJob, Follow, JobInvite } from '../engagement/engagement.models.js';
import { JobAlert } from '../alerts/alert.model.js';
import { Session } from '../auth/auth.models.js';
import { computeCompletion } from './profileCompletion.js';
import { touchUsage } from '../masterdata/masterdata.service.js';
import { logActivity } from '../activity/activity.service.js';
import { validateUsername, assertIdentityAvailable } from '../users/account.service.js';

const USER_FIELDS = ['fullName', 'displayName', 'username', 'gender', 'about', 'socialLinks', 'firstName', 'lastName'];

/** Keeps the older relocation flags in step with the Excel "Ready To Relocate" options. */
export function withRelocationFlags(prefs) {
  if (!Array.isArray(prefs.relocation)) return prefs;
  const yes = prefs.relocation.filter((r) => /^yes/i.test(r));
  return { ...prefs, willingToRelocate: yes.length > 0, anywhereInIndia: yes.some((r) => /anywhere in india/i.test(r)) };
}

export async function getProfileDoc(userId) {
  let profile = await Candidate.findOne({ user: userId });
  if (!profile) profile = await Candidate.create({ user: userId });
  return profile;
}

/** Recomputes derived fields (experience totals, current job, highest education, completion). */
export async function refreshDerived(user, profile) {
  const current = profile.employments?.find((e) => e.isCurrent) || profile.employments?.[0];
  if (current) {
    profile.currentJobTitle = current.jobTitle;
    profile.currentEmployer = current.employerName;
    if (current.monthlySalary !== undefined) profile.currentSalary = current.monthlySalary;
    if (current.noticePeriod) profile.noticePeriod = current.noticePeriod;
  }
  const highest = profile.educations?.find((e) => e.isHighest) || profile.educations?.[profile.educations.length - 1];
  if (highest) profile.highestEducationLevel = highest.level;
  const agg = (k) => [...new Set((profile.employments || []).flatMap((e) => e[k] || []).concat(profile[k] || []))].slice(0, 30);
  profile.industries = agg('industries');
  profile.departments = agg('departments');
  profile.subIndustries = agg('subIndustries');
  profile.functions = agg('functions');
  profile.roles = agg('roles');
  const completion = computeCompletion(user, profile);
  profile.profileCompletion = completion.score;
  await profile.save();
  return completion;
}

export async function getMyProfile(userId) {
  const [user, profile] = await Promise.all([User.findById(userId), getProfileDoc(userId)]);
  const completion = computeCompletion(user, profile);
  const json = profile.toObject();
  if (json.resume?.key) json.resume.downloadUrl = await signedUrl(json.resume.key, 900, json.resume.name);
  return { user: user.toSafeJSON(), profile: json, completion };
}

/**
 * Section-wise update. `user` part updates identity fields, `profile` part the candidate document.
 * Array sections (employments / educations) have dedicated item endpoints too.
 */
export async function updateProfile(req, body) {
  const userId = req.user._id;
  const user = await User.findById(userId);
  const profile = await getProfileDoc(userId);

  const userPatch = pick(body, USER_FIELDS);
  if (userPatch.username && userPatch.username !== user.username) {
    validateUsername(userPatch.username);
    await assertIdentityAvailable({ username: userPatch.username }, userId);
  }
  Object.assign(user, userPatch);
  if (body.notificationPrefs) user.notificationPrefs = { ...user.notificationPrefs?.toObject?.(), ...body.notificationPrefs };
  if (body.privacy) user.privacy = { ...user.privacy?.toObject?.(), ...body.privacy };
  await user.save();

  const profilePatch = { ...body };
  for (const k of [...USER_FIELDS, 'notificationPrefs', 'privacy']) delete profilePatch[k];
  if (profilePatch.totalExperience) {
    profilePatch.totalExperienceMonths = (profilePatch.totalExperience.years || 0) * 12 + (profilePatch.totalExperience.months || 0);
    delete profilePatch.totalExperience;
  }
  if (profilePatch.preferences) profilePatch.preferences = withRelocationFlags({ ...profile.preferences?.toObject?.(), ...profilePatch.preferences });
  profile.set(profilePatch);

  touchUsage('key_skill', body.keySkills || []);
  touchUsage('it_skill', body.itSkills || []);
  const completion = await refreshDerived(user, profile);
  logActivity(req, { type: 'profile_updated', description: 'Profile updated', meta: { fields: Object.keys(body) } });
  return { user: user.toSafeJSON(), profile: profile.toObject(), completion };
}

export async function addItem(req, section, data) {
  const profile = await getProfileDoc(req.user._id);
  if (section === 'employments' && data.isCurrent) profile.employments.forEach((e) => (e.isCurrent = false));
  if (section === 'educations' && data.isHighest) profile.educations.forEach((e) => (e.isHighest = false));
  if (profile[section].length >= 30) throw ApiError.badRequest(`Maximum 30 ${section} allowed`);
  profile[section].push(data);
  const user = await User.findById(req.user._id);
  const completion = await refreshDerived(user, profile);
  return { item: profile[section][profile[section].length - 1], completion };
}

export async function updateItem(req, section, itemId, data) {
  const profile = await getProfileDoc(req.user._id);
  const item = profile[section].id(itemId);
  if (!item) throw ApiError.notFound('Item not found');
  if (section === 'employments' && data.isCurrent) profile.employments.forEach((e) => (e.isCurrent = false));
  if (section === 'educations' && data.isHighest) profile.educations.forEach((e) => (e.isHighest = false));
  item.set(data);
  const user = await User.findById(req.user._id);
  const completion = await refreshDerived(user, profile);
  return { item, completion };
}

export async function removeItem(req, section, itemId) {
  const profile = await getProfileDoc(req.user._id);
  const item = profile[section].id(itemId);
  if (!item) throw ApiError.notFound('Item not found');
  item.deleteOne();
  const user = await User.findById(req.user._id);
  return refreshDerived(user, profile);
}

export async function uploadResume(req, file) {
  const profile = await Candidate.findOne({ user: req.user._id }).select('+resumeText');
  const stored = await putFile(file, { folder: 'resumes', isPrivate: true });
  const oldKey = profile.resume?.key;
  const text = await extractText(file);
  profile.resume = stored;
  profile.resumeText = text;
  const user = await User.findById(req.user._id);
  const completion = await refreshDerived(user, profile);
  if (oldKey) await deleteFile(oldKey);
  logActivity(req, { type: 'resume_uploaded', description: `Uploaded resume ${stored.name}` });
  const parsed = await parseResume(text);
  return { resume: { ...stored, downloadUrl: await signedUrl(stored.key, 900, stored.name) }, parsed, completion };
}

export async function deleteResume(req) {
  const profile = await Candidate.findOne({ user: req.user._id }).select('+resumeText');
  if (!profile?.resume?.key) throw ApiError.notFound('No resume uploaded');
  await deleteFile(profile.resume.key);
  profile.resume = undefined;
  profile.resumeText = undefined;
  const user = await User.findById(req.user._id);
  return refreshDerived(user, profile);
}

export async function resumeDownloadUrl(userId) {
  const profile = await Candidate.findOne({ user: userId }).select('resume').lean();
  if (!profile?.resume?.key) throw ApiError.notFound('No resume uploaded');
  return { url: await signedUrl(profile.resume.key, 900, profile.resume.name), name: profile.resume.name };
}

export async function uploadAvatar(req, file) {
  const stored = await putFile(file, { folder: 'avatars' });
  const user = await User.findById(req.user._id);
  const old = user.avatar?.key;
  user.avatar = { url: stored.url, key: stored.key };
  await user.save();
  if (old) await deleteFile(old);
  const profile = await getProfileDoc(req.user._id);
  await refreshDerived(user, profile);
  return user.avatar;
}

export async function saveResumeBuilder(userId, data) {
  await Candidate.updateOne(
    { user: userId },
    { $set: { resumeBuilder: { ...data, updatedAt: new Date() } } },
    { upsert: true },
  );
  return data;
}

export async function getResumeBuilder(userId) {
  const [user, profile] = await Promise.all([User.findById(userId).lean(), Candidate.findOne({ user: userId }).lean()]);
  if (!user) throw ApiError.notFound('User not found');

  const formatLoc = (loc) => {
    if (!loc) return '';
    if (typeof loc === 'string') return loc;
    return [loc.city, loc.state].filter(Boolean).join(', ') || loc.city || loc.district || loc.state || '';
  };

  // If already saved resume builder data exists, sanitize and return
  if (profile?.resumeBuilder) {
    const rb = { ...profile.resumeBuilder };
    if (rb.personal) {
      rb.personal = {
        ...rb.personal,
        fullName: rb.personal.fullName || user.fullName || '',
        email: rb.personal.email || user.email || '',
        mobile: rb.personal.mobile || user.mobile || '',
        location: formatLoc(rb.personal.location),
      };
    }
    return rb;
  }

  // Pre-fill the builder from the profile when nothing was saved yet.
  const locationStr = formatLoc(profile?.currentLocation);
  const allSkills = Array.from(new Set([...(profile?.keySkills || []), ...(profile?.itSkills || [])])).filter(Boolean);

  return {
    template: 'modern',
    personal: {
      fullName: user.fullName || '',
      email: user.email || '',
      mobile: user.mobile || '',
      location: locationStr,
      headline: profile?.resumeHeadline || '',
      website: '',
      linkedin: profile?.socialProfiles?.find((s) => /linkedin/i.test(s.platform || s.url))?.url || '',
      github: profile?.socialProfiles?.find((s) => /github/i.test(s.platform || s.url))?.url || '',
    },
    headline: profile?.resumeHeadline || '',
    summary: profile?.profileSummary || '',
    skills: allSkills,
    languages: profile?.languages || [],
    certifications: profile?.certifications || [],
    experiences: (profile?.employments || []).map((e) => ({
      id: String(e._id || Math.random().toString(36).slice(2, 9)),
      jobTitle: e.jobTitle || '',
      company: e.employerName || '',
      location: formatLoc(e.location),
      startDate: e.startDate ? new Date(e.startDate).toISOString().slice(0, 7) : '',
      endDate: e.endDate ? new Date(e.endDate).toISOString().slice(0, 7) : '',
      current: Boolean(e.isCurrent),
      description: e.description || '',
    })),
    educations: (profile?.educations || []).map((e) => ({
      id: String(e._id || Math.random().toString(36).slice(2, 9)),
      degree: [e.degree, e.specialisation].filter(Boolean).join(' - ') || e.level || '',
      institution: e.institution || '',
      startDate: e.startDate ? new Date(e.startDate).toISOString().slice(0, 7) : '',
      endDate: e.endDate ? new Date(e.endDate).toISOString().slice(0, 7) : '',
      current: Boolean(e.status === 'Pursuing'),
      grade: e.marks || '',
      description: '',
    })),
    projects: (profile?.portfolios || []).map((p) => ({
      id: String(Math.random().toString(36).slice(2, 9)),
      name: p.name || '',
      url: p.url || '',
      tech: '',
      description: '',
    })),
    achievements: [],
  };
}

export async function dashboard(userId) {
  const [applied, saved, following, alerts, invites, stages, profile, recentApplications] = await Promise.all([
    Application.countDocuments({ candidate: userId }),
    SavedJob.countDocuments({ user: userId }),
    Follow.countDocuments({ follower: userId }),
    JobAlert.countDocuments({ user: userId, isActive: true }),
    JobInvite.countDocuments({ candidate: userId, status: { $in: ['sent', 'viewed'] } }),
    Application.aggregate([{ $match: { candidate: userId } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Candidate.findOne({ user: userId }).select('profileCompletion stats boostUntil').lean(),
    Application.find({ candidate: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('job', 'title slug orgSnapshot locations kind status')
      .select('job stage createdAt isViewed')
      .lean(),
  ]);
  return {
    counts: { applied, saved, following, activeAlerts: alerts, pendingInvites: invites },
    applicationStages: Object.fromEntries(stages.map((s) => [s._id, s.count])),
    profile: profile || {},
    recentApplications,
  };
}

export async function deleteAccount(req, { reason }) {
  const enabled = await getSetting('platform.profileDeleteEnabled', true);
  if (!enabled) throw ApiError.forbidden('Profile deletion is currently disabled. Contact support.', 'DELETE_DISABLED');
  const user = await User.findById(req.user._id).select('+tokenVersion');
  // Soft delete + PII scrub (GDPR "right to erasure") while keeping referential integrity.
  const suffix = `deleted_${user._id}`;
  user.status = USER_STATUS.TRASHED;
  user.statusReason = reason || 'self_deleted';
  user.deletedAt = new Date();
  user.email = undefined;
  user.mobile = undefined;
  user.username = undefined;
  user.fullName = 'Deleted User';
  user.displayName = 'Deleted User';
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.googleId = undefined;
  await user.save();
  const profile = await Candidate.findOne({ user: user._id });
  if (profile?.resume?.key) await deleteFile(profile.resume.key);
  await Candidate.deleteOne({ user: user._id });
  await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'account_deleted' } });
  await JobAlert.updateMany({ user: user._id }, { $set: { isActive: false } });
  logActivity(req, { type: 'account_deleted', description: suffix });
}

export async function deactivate(req, { reason }) {
  await User.updateOne({ _id: req.user._id }, { $set: { status: USER_STATUS.DEACTIVATED, statusReason: reason } });
}

export async function reactivate(userId) {
  await User.updateOne({ _id: userId, status: USER_STATUS.DEACTIVATED }, { $set: { status: USER_STATUS.ACTIVE }, $unset: { statusReason: 1 } });
}
