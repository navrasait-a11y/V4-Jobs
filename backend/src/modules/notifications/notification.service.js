import logger from '../../config/logger.js';
import config from '../../config/env.js';
import { enqueue, enqueueBulk, registerJob } from '../../shared/services/queue.service.js';
import { deliverEmail, deliverSms, deliverWhatsapp, deliverPush, deliverArattai } from '../../shared/services/channels.js';
import { escapeHtml, htmlToText, layout, renderEmail } from '../../shared/services/emailTemplates.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { Notification, EmailLog, MessageLog } from './notification.model.js';
import { Session } from '../auth/auth.models.js';
import User from '../users/user.model.js';

/* ------------------------------------------------------ queue job handlers */

registerJob('email.send', (data) => deliverEmail(data));
registerJob('sms.send', (data) => deliverSms(data));
registerJob('whatsapp.send', (data) => deliverWhatsapp(data));
registerJob('arattai.send', (data) => deliverArattai(data));
/** Website page a push opens (same mapping as the web app's notification list). */
export function webLink(data = {}, role) {
  const employer = role === 'employer';
  switch (data.screen) {
    case 'job':
      return `/jobs/${data.slug || data.jobId}`;
    case 'application':
      return employer ? `/employer/applications/${data.applicationId}` : '/candidate/applications';
    case 'interview':
      return employer ? '/employer/interviews' : '/candidate/interviews';
    case 'chat':
      return employer ? '/employer/messages' : '/candidate/messages';
    case 'profile_views':
      return '/candidate/profile-views';
    case 'job_alert':
      return '/candidate/job-alerts';
    case 'billing':
      return employer ? '/employer/packages-billing' : '/candidate/billing';
    case 'mailbox':
      return employer ? '/employer/mailbox' : '/candidate/mailbox';
    case 'employer_job':
    case 'job_callbacks':
      return data.jobId ? `/employer/jobs?callbacks=${data.jobId}` : '/employer/jobs';
    case 'kyc':
      return '/employer/settings?tab=verification';
    case 'enquiries':
      return '/employer/enquiries';
    default:
      return employer ? '/employer/notifications' : '/candidate/notifications';
  }
}

registerJob('push.send', async ({ userId, title, body, data, image }) => {
  const sessions = await Session.find({ user: userId, revokedAt: null, fcmToken: { $exists: true, $ne: null } })
    .select('fcmToken')
    .lean();
  const tokens = [...new Set(sessions.map((s) => s.fcmToken))];
  if (!tokens.length) return;
  const user = await User.findById(userId).select('role').lean();
  const link = `${config.urls.web}${webLink(data, user?.role)}`;
  const invalid = await deliverPush({ tokens, title, body, data: { ...data, link }, image, link });
  if (invalid.length) await Session.updateMany({ fcmToken: { $in: invalid } }, { $unset: { fcmToken: 1 } });
});

/* ------------------------------------------------------------- public API */

/**
 * Queue an e-mail. Either pass a built-in `template` + `vars`, or a raw `subject` + `html`.
 * A queued EmailLog row is created immediately so admin statistics stay accurate.
 */
export async function sendEmail({ to, template, vars = {}, subject, html, category = 'transactional', user, sentBy, cc, attachments }) {
  if (!to) return null;
  // Free-form mail (bulk, mailbox) gets the same branded shell as templates.
  const body = template ? null : /<html/i.test(html || '') ? html : layout(escapeHtml(subject), html || '');
  const rendered = template ? renderEmail(template, vars) : { subject, html: body, text: htmlToText(body) };
  const log = await EmailLog.create({ to, cc, subject: rendered.subject, template, category, user, sentBy, status: 'queued' });
  await enqueue('email.send', { to, cc, subject: rendered.subject, html: rendered.html, text: rendered.text, logId: String(log._id), attachments });
  return log;
}

/**
 * Queue a DLT template SMS. `template` = otp | interview | interview_reminder | generic | bulk,
 * `vars` fill its {{placeholders}} (see shared/services/smsTemplates.js).
 * The MessageLog row is created up-front so queue retries reuse it (no duplicate sends).
 */
export async function sendSms(to, { template = 'generic', vars = {}, user } = {}) {
  if (!to) return null;
  const log = await MessageLog.create({ channel: 'sms', to, user, template, status: 'queued' });
  await enqueue('sms.send', { to, template, vars, user: user ? String(user) : undefined, logId: String(log._id) });
  return log;
}
export const sendWhatsapp = (to, payload) => (to ? enqueue('whatsapp.send', { to, ...payload }) : null);
export const sendArattai = (to, text, user) => (to ? enqueue('arattai.send', { to, text, user }) : null);

/**
 * Multi-channel notification to one user:
 *  - always stored in-app + pushed over Socket.IO
 *  - e-mail / sms / whatsapp / push according to `channels` and the user's preferences
 */
export async function notify(userId, { type, title, body, data = {}, image, channels = ['in_app', 'push'], email, sms, whatsapp }) {
  try {
    const notification = await Notification.create({ user: userId, type, title, body, data, image });
    emitToUser(userId, 'notification:new', notification.toObject());

    const needsUser = channels.some((c) => ['email', 'sms', 'whatsapp', 'push'].includes(c));
    if (!needsUser) return notification;
    const user = await User.findById(userId).select('email mobile notificationPrefs fullName status').lean();
    if (!user || ['blocked', 'trashed'].includes(user.status)) return notification;
    const prefs = user.notificationPrefs || {};

    if (channels.includes('push') && prefs.push !== false) await enqueue('push.send', { userId: String(userId), title, body, data, image });
    if (channels.includes('email') && prefs.email !== false && user.email) {
      await sendEmail({
        to: user.email,
        user: userId,
        category: 'alert',
        ...(email || { template: 'generic', vars: { title, html: `<p>${body || ''}</p>` } }),
      });
    }
    if (channels.includes('sms') && prefs.sms !== false && user.mobile)
      await sendSms(user.mobile, { template: sms?.template || 'generic', vars: sms?.vars || { title, body: body || '' }, user: userId });
    if (channels.includes('whatsapp') && prefs.whatsapp !== false && user.mobile) {
      await sendWhatsapp(user.mobile, whatsapp || { text: `*${title}*\n${body || ''}` });
    }
    return notification;
  } catch (err) {
    logger.error({ err, userId, type }, 'notify failed');
    return null;
  }
}

/** Fan-out to many users (bulk alerts). Each user becomes its own job so failures are isolated. */
export async function notifyMany(userIds, payload) {
  await enqueueBulk(
    'notify.one',
    userIds.map((id) => ({ userId: String(id), payload })),
  );
}
registerJob('notify.one', ({ userId, payload }) => notify(userId, payload));

/* -------------------------------------------------------- in-app inbox API */

export async function listNotifications(userId, { page, limit, skip, unreadOnly }) {
  const filter = { user: userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { items, total, page, limit, unread };
}

export const markRead = (userId, ids) =>
  Notification.updateMany({ user: userId, ...(ids?.length ? { _id: { $in: ids } } : {}), readAt: null }, { $set: { readAt: new Date() } });

export const deleteNotification = (userId, id) => Notification.deleteOne({ _id: id, user: userId });
