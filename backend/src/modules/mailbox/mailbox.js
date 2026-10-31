import mongoose from 'mongoose';
import { Router } from 'express';
import Joi from 'joi';
import sanitizeHtml from 'sanitize-html';
import validate from '../../shared/middleware/validate.js';
import { authenticate, hasEmployerPermission } from '../../shared/middleware/auth.js';
import { ok, created } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { objectId, idParam, pagination } from '../../shared/validators/common.js';
import { ROLES } from '../../shared/constants/index.js';
import ApiError from '../../shared/errors/ApiError.js';
import User from '../users/user.model.js';
import { Application } from '../applications/application.model.js';
import { ProfileAccess } from '../engagement/engagement.models.js';
import { isBlockedBetween } from '../moderation/blocklist.service.js';
import { notify, sendEmail } from '../notifications/notification.service.js';
import { logActivity } from '../activity/activity.service.js';

const { Schema } = mongoose;

/**
 * In-platform mailbox (Naukri-style "Emails Management"):
 *   Inbox, Sent, Drafts, Replied and Service mails (system mails from the portal).
 * A copy is also delivered to the recipient's real e-mail address.
 */
const mailSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User' }, // null for service mails
    senderOrganization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    subject: { type: String, maxlength: 300 },
    body: { type: String, maxlength: 50000 },
    category: { type: String, enum: ['personal', 'service'], default: 'personal', index: true },
    status: { type: String, enum: ['draft', 'sent'], default: 'sent', index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job' },
    parent: { type: Schema.Types.ObjectId, ref: 'Mail' },
    thread: { type: Schema.Types.ObjectId, ref: 'Mail', index: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    sentAt: Date,
  },
  { timestamps: true },
);
mailSchema.index({ sender: 1, status: 1, createdAt: -1 });
mailSchema.index({ recipients: 1, status: 1, createdAt: -1 });

export const Mail = mongoose.models.Mail || mongoose.model('Mail', mailSchema);

const clean = (html) =>
  sanitizeHtml(html || '', { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['span']), allowedAttributes: { a: ['href', 'target'], '*': ['style'] } });

/** Service (system) mail helper other modules can use. */
export async function sendServiceMail(userIds, { subject, body }) {
  const mail = await Mail.create({ recipients: userIds, subject, body: clean(body), category: 'service', status: 'sent', sentAt: new Date() });
  mail.thread = mail._id;
  await mail.save();
  return mail;
}

async function assertCanMail(sender, recipientIds) {
  if (sender.role === ROLES.EMPLOYER) {
    const orgId = sender.employer.organization;
    for (const rid of recipientIds) {
      if (await isBlockedBetween({ candidateUserId: rid, organizationId: orgId }))
        throw ApiError.forbidden('One or more recipients cannot be contacted', 'BLOCKED');
      const related =
        (await Application.exists({ organization: orgId, candidate: rid })) ||
        (await ProfileAccess.exists({ organization: orgId, candidate: rid, type: 'contact_unlock' }));
      if (!related) throw ApiError.forbidden('You can e-mail only applicants or candidates whose contact you unlocked', 'MAIL_NOT_ALLOWED');
    }
  } else if (sender.role === ROLES.CANDIDATE) {
    const recipients = await User.find({ _id: { $in: recipientIds } })
      .select('role employer')
      .lean();
    for (const r of recipients) {
      if (r.role !== ROLES.EMPLOYER) throw ApiError.forbidden('Candidates can e-mail recruiters only');
      const related = await Application.exists({ organization: r.employer.organization, candidate: sender._id });
      const replying = await Mail.exists({ sender: r._id, recipients: sender._id });
      if (!related && !replying) throw ApiError.forbidden('You can e-mail recruiters of jobs you applied to', 'MAIL_NOT_ALLOWED');
    }
  }
}

async function compose(user, { to = [], subject, body, jobId, parentId, draft = false, draftId }) {
  let parent = null;
  if (parentId) {
    parent = await Mail.findOne({ _id: parentId, $or: [{ recipients: user._id }, { sender: user._id }] }).lean();
    if (!parent) throw ApiError.notFound('Original mail not found');
    if (!to.length && parent.sender) to = [String(parent.sender)];
    subject = subject || `Re: ${parent.subject || ''}`;
  }
  if (!draft) {
    if (!to.length) throw ApiError.badRequest('Add at least one recipient');
    await assertCanMail(user, to);
  }
  const data = {
    sender: user._id,
    senderOrganization: user.employer?.organization,
    recipients: to,
    subject,
    body: clean(body),
    job: jobId,
    parent: parent?._id,
    thread: parent?.thread || parent?._id,
    status: draft ? 'draft' : 'sent',
    sentAt: draft ? undefined : new Date(),
  };
  let mail;
  if (draftId) {
    mail = await Mail.findOneAndUpdate({ _id: draftId, sender: user._id, status: 'draft' }, { $set: data }, { new: true });
    if (!mail) throw ApiError.notFound('Draft not found');
  } else mail = await Mail.create(data);
  if (!mail.thread) {
    mail.thread = mail._id;
    await mail.save();
  }
  if (!draft) {
    const recipients = await User.find({ _id: { $in: to } })
      .select('email fullName')
      .lean();
    for (const r of recipients) {
      notify(r._id, {
        type: 'mail',
        title: `New mail from ${user.fullName}`,
        body: subject,
        data: { screen: 'mailbox', mailId: String(mail._id) },
        channels: ['in_app', 'push'],
      });
      if (r.email) {
        sendEmail({
          to: r.email,
          subject: subject || `Message from ${user.fullName}`,
          html: `<p><b>${clean(user.fullName)}</b> sent you a message on Freejobwala:</p>${mail.body}`,
          category: 'transactional',
          user: r._id,
          sentBy: user._id,
        }).catch(() => {});
      }
    }
    logActivity({ user }, { user: user._id, type: 'email_sent', description: subject, meta: { mailId: mail._id, to } });
  }
  return mail;
}

function folderFilter(userId, folder) {
  switch (folder) {
    case 'sent':
      return { sender: userId, status: 'sent', parent: null };
    case 'drafts':
      return { sender: userId, status: 'draft' };
    case 'replied':
      return { sender: userId, status: 'sent', parent: { $ne: null } };
    case 'service':
      return { recipients: userId, category: 'service', status: 'sent' };
    case 'inbox':
    default:
      return { recipients: userId, category: 'personal', status: 'sent' };
  }
}

export const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate({
    query: Joi.object({ ...pagination, folder: Joi.string().valid('inbox', 'sent', 'drafts', 'replied', 'service').default('inbox'), unread: Joi.boolean() }),
  }),
  async (req, res) => {
    if (
      req.user.role === ROLES.EMPLOYER &&
      req.query.folder !== 'inbox' &&
      !hasEmployerPermission(req.user, 'email.own_only', 'response.manage_all', 'response.manage_own')
    ) {
      throw ApiError.forbidden();
    }
    const p = parsePagination(req.query);
    const f = { ...folderFilter(req.user._id, req.query.folder), deletedFor: { $ne: req.user._id } };
    if (req.query.unread) f.readBy = { $ne: req.user._id };
    const [items, total, unread] = await Promise.all([
      Mail.find(f)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .select('-body')
        .populate('sender', 'fullName avatar role')
        .populate('recipients', 'fullName avatar')
        .lean(),
      Mail.countDocuments(f),
      Mail.countDocuments({ recipients: req.user._id, status: 'sent', readBy: { $ne: req.user._id }, deletedFor: { $ne: req.user._id } }),
    ]);
    return ok(
      res,
      items.map((m) => ({ ...m, isRead: (m.readBy || []).some((x) => String(x) === String(req.user._id)), readBy: undefined })),
      'OK',
      {
        page: p.page,
        limit: p.limit,
        total,
        totalPages: Math.ceil(total / p.limit),
        unread,
      },
    );
  },
);

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const mail = await Mail.findOne({ _id: req.params.id, $or: [{ sender: req.user._id }, { recipients: req.user._id }], deletedFor: { $ne: req.user._id } })
    .populate('sender', 'fullName avatar role')
    .populate('recipients', 'fullName avatar')
    .populate('job', 'title slug')
    .lean();
  if (!mail) throw ApiError.notFound('Mail not found');
  await Mail.updateOne({ _id: mail._id }, { $addToSet: { readBy: req.user._id } });
  const thread = await Mail.find({ thread: mail.thread, status: 'sent', _id: { $ne: mail._id } })
    .sort({ createdAt: 1 })
    .populate('sender', 'fullName avatar')
    .lean();
  return ok(res, { ...mail, readBy: undefined, thread });
});

const composeBody = Joi.object({
  to: Joi.array().items(objectId).max(50).default([]),
  subject: Joi.string().trim().max(300).allow(''),
  body: Joi.string().max(50000).allow(''),
  jobId: objectId,
  parentId: objectId,
  draft: Joi.boolean().default(false),
  draftId: objectId,
});
router.post('/', validate({ body: composeBody }), async (req, res) =>
  created(res, await compose(req.user, req.body), req.body.draft ? 'Draft saved' : 'Mail sent'),
);
router.post('/:id/reply', validate({ params: idParam, body: composeBody }), async (req, res) =>
  created(res, await compose(req.user, { ...req.body, parentId: req.params.id }), 'Reply sent'),
);
router.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const mail = await Mail.findOne({ _id: req.params.id, $or: [{ sender: req.user._id }, { recipients: req.user._id }] });
  if (!mail) throw ApiError.notFound('Mail not found');
  if (mail.status === 'draft') await mail.deleteOne();
  else await Mail.updateOne({ _id: mail._id }, { $addToSet: { deletedFor: req.user._id } });
  return ok(res, null, 'Deleted');
});
