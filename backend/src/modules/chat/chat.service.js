import ApiError from '../../shared/errors/ApiError.js';
import { ROLES, ADMIN_ROLES } from '../../shared/constants/index.js';
import { isAdmin } from '../../shared/middleware/auth.js';
import { putFile, signedUrl } from '../../shared/services/storage.service.js';
import { emitToUser, emitToRoom, ADMIN_ROOM, isUserOnline } from '../../shared/realtime/socket.js';
import User from '../users/user.model.js';
import { Application } from '../applications/application.model.js';
import { JobInvite, ProfileAccess } from '../engagement/engagement.models.js';
import { isBlockedBetween } from '../moderation/blocklist.service.js';
import { notify } from '../notifications/notification.service.js';
import { Conversation, Message } from './chat.models.js';

const participantView = 'fullName displayName avatar role employer.organization';

/** Recruiter <-> candidate chat is allowed only when there is a hiring relationship. */
async function assertCanChat(candidateId, orgId) {
  if (await isBlockedBetween({ candidateUserId: candidateId, organizationId: orgId }))
    throw ApiError.forbidden('Messaging is blocked between you and this user', 'BLOCKED');
  const related = await Promise.any([
    Application.exists({ candidate: candidateId, organization: orgId }).then((x) => x || Promise.reject()),
    JobInvite.exists({ candidate: candidateId, organization: orgId }).then((x) => x || Promise.reject()),
    ProfileAccess.exists({ candidate: candidateId, organization: orgId, type: 'contact_unlock' }).then((x) => x || Promise.reject()),
  ]).catch(() => null);
  if (!related) throw ApiError.forbidden('You can message only employers you applied to / candidates in your pipeline', 'CHAT_NOT_ALLOWED');
}

async function decorate(conversation, viewerId) {
  const users = await User.find({ _id: { $in: conversation.participantIds } })
    .select(participantView)
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const me = conversation.participants.find((p) => String(p.user) === String(viewerId));
  return {
    ...conversation,
    participants: conversation.participants.map((p) => ({ ...p, profile: byId.get(String(p.user)) })),
    unread: me?.unread || 0,
  };
}

async function signAttachments(messages) {
  return Promise.all(
    messages.map(async (m) => ({
      ...m,
      attachments: await Promise.all((m.attachments || []).map(async (a) => ({ ...a, url: a.url || (await signedUrl(a.key, 3600, a.name)) }))),
    })),
  );
}

/* ---------------------------------------------------------------- start */

export async function startDirect(user, { candidateId, organizationId, jobId, message }) {
  let candidate;
  let orgId;
  if (user.role === ROLES.EMPLOYER) {
    candidate = candidateId;
    orgId = user.employer.organization;
  } else if (user.role === ROLES.CANDIDATE) {
    candidate = user._id;
    orgId = organizationId;
  } else throw ApiError.forbidden();
  if (!candidate || !orgId) throw ApiError.badRequest('candidateId (employer) or organizationId (candidate) is required');
  await assertCanChat(candidate, orgId);

  let conv = await Conversation.findOne({ type: 'direct', organization: orgId, candidate });
  if (!conv) {
    // Candidate-initiated chats go to the recruiter who owns the latest application.
    let employerMember = user.role === ROLES.EMPLOYER ? user._id : null;
    if (!employerMember) {
      const app = await Application.findOne({ candidate, organization: orgId }).sort({ createdAt: -1 }).select('jobPostedBy').lean();
      const inv = app ? null : await JobInvite.findOne({ candidate, organization: orgId }).sort({ createdAt: -1 }).select('invitedBy').lean();
      employerMember = app?.jobPostedBy || inv?.invitedBy;
    }
    if (!employerMember) throw ApiError.forbidden('No recruiter available for this employer', 'CHAT_NOT_ALLOWED');
    conv = await Conversation.create({
      type: 'direct',
      organization: orgId,
      candidate,
      job: jobId,
      participants: [
        { user: candidate, role: ROLES.CANDIDATE },
        { user: employerMember, role: ROLES.EMPLOYER, organization: orgId },
      ],
      participantIds: [candidate, employerMember],
    });
  } else if (user.role === ROLES.EMPLOYER && !conv.participantIds.some((p) => String(p) === String(user._id))) {
    // another team member joins the existing thread
    conv.participants.push({ user: user._id, role: ROLES.EMPLOYER, organization: orgId });
    conv.participantIds.push(user._id);
    await conv.save();
  }
  if (message) await sendMessage(user, conv._id, { body: message });
  return decorate(await Conversation.findById(conv._id).lean(), user._id);
}

export async function startSupport(user, { subject, message }) {
  let conv = await Conversation.findOne({ type: 'support', participantIds: user._id, status: 'open' });
  if (!conv) {
    conv = await Conversation.create({
      type: 'support',
      subject: subject || 'Support request',
      participants: [{ user: user._id, role: user.role, organization: user.employer?.organization }],
      participantIds: [user._id],
    });
    emitToRoom(ADMIN_ROOM, 'chat:conversation', { conversationId: conv._id, type: 'support', event: 'created' });
  }
  if (message) await sendMessage(user, conv._id, { body: message });
  return decorate(await Conversation.findById(conv._id).lean(), user._id);
}

/* ---------------------------------------------------------------- access */

export async function getConversationFor(user, conversationId) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) throw ApiError.notFound('Conversation not found');
  const isParticipant = conv.participantIds.some((p) => String(p) === String(user._id));
  const sameOrg = user.role === ROLES.EMPLOYER && conv.organization && String(conv.organization) === String(user.employer?.organization);
  if (!isParticipant && !isAdmin(user) && !sameOrg) throw ApiError.notFound('Conversation not found');
  return conv;
}

export async function listConversations(user, { type, status, q, page, limit, skip, adminView = false }) {
  const filter = {};
  if (isAdmin(user) && adminView) {
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (q) filter.subject = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  } else {
    filter.participantIds = user._id;
    if (type) filter.type = type;
  }
  const [rows, total] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean(),
    Conversation.countDocuments(filter),
  ]);
  const items = await Promise.all(rows.map((c) => decorate(c, user._id)));
  return { items, total, page, limit };
}

export async function listMessages(user, conversationId, { before, limit = 30 }) {
  await getConversationFor(user, conversationId);
  const filter = { conversation: conversationId, deletedAt: null };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).populate('sender', 'fullName displayName avatar role').lean();
  return signAttachments(messages.reverse());
}

/* ------------------------------------------------------------------ send */

export async function uploadAttachment(user, file) {
  const stored = await putFile(file, { folder: 'chat', isPrivate: true });
  return { key: stored.key, name: stored.name, mime: stored.mime, size: stored.size, url: await signedUrl(stored.key, 3600, stored.name) };
}

export async function sendMessage(user, conversationId, { body, attachments = [], clientId }) {
  const conv = await getConversationFor(user, conversationId);
  if (conv.status === 'closed' && conv.type === 'support' && !isAdmin(user)) {
    conv.status = 'open'; // user writing again reopens the ticket
  }
  if (
    conv.type === 'direct' &&
    conv.candidate &&
    conv.organization &&
    (await isBlockedBetween({ candidateUserId: conv.candidate, organizationId: conv.organization }))
  ) {
    throw ApiError.forbidden('Messaging is blocked', 'BLOCKED');
  }
  if (!body?.trim() && !attachments.length) throw ApiError.badRequest('Message cannot be empty');
  // Attachments must be files uploaded through /chat/attachments (private chat folder).
  const safeAttachments = attachments
    .filter((a) => typeof a.key === 'string' && a.key.startsWith('private/chat/'))
    .map(({ key, name, mime, size }) => ({ key, name, mime, size }));

  // Admin replying in a support thread joins it.
  if (isAdmin(user) && !conv.participantIds.some((p) => String(p) === String(user._id))) {
    conv.participants.push({ user: user._id, role: user.role });
    conv.participantIds.push(user._id);
    if (!conv.assignedAdmin) conv.assignedAdmin = user._id;
  }
  // Employer team member replying in the org thread joins it.
  if (user.role === ROLES.EMPLOYER && !conv.participantIds.some((p) => String(p) === String(user._id))) {
    conv.participants.push({ user: user._id, role: ROLES.EMPLOYER, organization: user.employer.organization });
    conv.participantIds.push(user._id);
  }

  let message;
  try {
    message = await Message.create({
      conversation: conv._id,
      sender: user._id,
      senderRole: user.role,
      type: safeAttachments.length ? (safeAttachments.every((a) => a.mime?.startsWith('image/')) ? 'image' : 'file') : 'text',
      body: body?.trim(),
      attachments: safeAttachments,
      clientId,
      readBy: [{ user: user._id, at: new Date() }],
    });
  } catch (err) {
    if (err.code === 11000 && clientId) return Message.findOne({ conversation: conv._id, clientId }).lean(); // duplicate send
    throw err;
  }

  const now = new Date();
  conv.lastMessage = { body: body?.slice(0, 200) || (safeAttachments.length ? 'Attachment' : ''), type: message.type, sender: user._id, at: now };
  conv.lastMessageAt = now;
  for (const p of conv.participants) {
    if (String(p.user) === String(user._id)) {
      p.unread = 0;
      p.lastReadAt = now;
    } else p.unread += 1;
  }
  await conv.save();

  const payload = (
    await signAttachments([{ ...message.toObject(), sender: { _id: user._id, fullName: user.fullName, avatar: user.avatar, role: user.role } }])
  )[0];
  for (const p of conv.participants) {
    emitToUser(p.user, 'chat:message', { conversationId: conv._id, message: payload });
    if (String(p.user) !== String(user._id) && !(await isUserOnline(p.user))) {
      notify(p.user, {
        type: 'message',
        title: `New message from ${user.fullName || 'a user'}`,
        body: body?.slice(0, 120) || 'Attachment',
        data: { screen: 'chat', conversationId: String(conv._id) },
        channels: ['push'],
      });
    }
  }
  if (conv.type === 'support' && !ADMIN_ROLES.includes(user.role)) emitToRoom(ADMIN_ROOM, 'chat:message', { conversationId: conv._id, message: payload });
  return payload;
}

export async function markRead(user, conversationId) {
  const conv = await getConversationFor(user, conversationId);
  const now = new Date();
  await Conversation.updateOne({ _id: conv._id, 'participants.user': user._id }, { $set: { 'participants.$.unread': 0, 'participants.$.lastReadAt': now } });
  await Message.updateMany({ conversation: conv._id, 'readBy.user': { $ne: user._id } }, { $push: { readBy: { user: user._id, at: now } } });
  for (const p of conv.participantIds) emitToUser(p, 'chat:read', { conversationId: conv._id, userId: user._id, at: now });
}

export async function deleteMessage(user, messageId) {
  const msg = await Message.findById(messageId);
  if (!msg) throw ApiError.notFound('Message not found');
  if (String(msg.sender) !== String(user._id) && !isAdmin(user)) throw ApiError.forbidden();
  msg.deletedAt = new Date();
  msg.body = undefined;
  msg.attachments = [];
  await msg.save();
  const conv = await Conversation.findById(msg.conversation).select('participantIds').lean();
  for (const p of conv?.participantIds || []) emitToUser(p, 'chat:deleted', { conversationId: msg.conversation, messageId });
}

export async function unreadCount(userId) {
  const [res] = await Conversation.aggregate([
    { $match: { participantIds: userId } },
    { $unwind: '$participants' },
    { $match: { 'participants.user': userId } },
    { $group: { _id: null, total: { $sum: '$participants.unread' }, conversations: { $sum: { $cond: [{ $gt: ['$participants.unread', 0] }, 1, 0] } } } },
  ]);
  return { unread: res?.total || 0, conversations: res?.conversations || 0 };
}

/* ---------------------------------------------------------------- admin */

export async function adminUpdateConversation(admin, id, { status, assignedAdmin }) {
  const conv = await Conversation.findById(id);
  if (!conv) throw ApiError.notFound('Conversation not found');
  if (status) conv.status = status;
  if (assignedAdmin !== undefined) conv.assignedAdmin = assignedAdmin || undefined;
  await conv.save();
  return conv;
}

export async function adminStats() {
  const [byType, openSupport, unassigned] = await Promise.all([
    Conversation.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    Conversation.countDocuments({ type: 'support', status: 'open' }),
    Conversation.countDocuments({ type: 'support', status: 'open', assignedAdmin: null }),
  ]);
  return { byType: Object.fromEntries(byType.map((x) => [x._id, x.count])), openSupport, unassigned };
}
