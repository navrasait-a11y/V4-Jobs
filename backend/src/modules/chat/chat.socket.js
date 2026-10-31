import logger from '../../config/logger.js';
import { onSocketConnection } from '../../shared/realtime/socket.js';
import User from '../users/user.model.js';
import * as chat from './chat.service.js';

/**
 * Socket.IO chat protocol (namespace "/"):
 *  client -> server
 *    chat:send   { conversationId, body?, attachments?, clientId? }  (ack: { ok, message } | { ok:false, error })
 *    chat:read   { conversationId }
 *    chat:typing { conversationId, isTyping }
 *  server -> client
 *    chat:message { conversationId, message }   chat:read { conversationId, userId, at }
 *    chat:typing  { conversationId, userId, isTyping }   chat:deleted { conversationId, messageId }
 *    notification:new <Notification>
 */
export function registerChatSocket() {
  onSocketConnection((socket) => {
    const loadUser = () => User.findById(socket.user._id);

    socket.on('chat:send', async (payload = {}, ack) => {
      try {
        const user = await loadUser();
        const message = await chat.sendMessage(user, payload.conversationId, payload);
        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: { code: err.code || 'ERROR', message: err.message } });
        else logger.debug({ err: err.message }, 'chat:send failed');
      }
    });

    socket.on('chat:read', async ({ conversationId } = {}) => {
      try {
        await chat.markRead(await loadUser(), conversationId);
      } catch {
        /* ignore */
      }
    });

    socket.on('chat:typing', async ({ conversationId, isTyping } = {}) => {
      try {
        const conv = await chat.getConversationFor(socket.user, conversationId);
        for (const p of conv.participantIds) {
          if (String(p) !== String(socket.user._id))
            socket.to(`user:${p}`).emit('chat:typing', { conversationId, userId: socket.user._id, isTyping: Boolean(isTyping) });
        }
      } catch {
        /* ignore */
      }
    });
  });
}
