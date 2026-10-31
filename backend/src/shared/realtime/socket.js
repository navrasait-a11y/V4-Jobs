import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import config from '../../config/env.js';
import logger from '../../config/logger.js';
import { createRedisConnection } from '../../config/redis.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import User from '../../modules/users/user.model.js';
import { ADMIN_ROLES } from '../constants/index.js';

let io = null;
const connectionHooks = [];

/** Modules (chat, notifications) register their socket event handlers here. */
export function onSocketConnection(fn) {
  connectionHooks.push(fn);
}

export const userRoom = (id) => `user:${id}`;
export const ADMIN_ROOM = 'admins';

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
  });

  if (Number(process.env.WEB_CONCURRENCY) > 1 && !config.redis.socketAdapter) {
    logger.warn('Multiple API instances without REDIS_SOCKET_ADAPTER=true: chat events will not reach users on other instances');
  }
  if (config.redis.socketAdapter) {
    const pub = createRedisConnection();
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO using Redis adapter');
  }

  // Handshake auth: { auth: { token: '<accessToken>' } } or "Authorization: Bearer" header.
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || '').replace(/^Bearer /, '');
      if (!raw) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(raw);
      const user = await User.findById(payload.sub).select('role status fullName displayName avatar employer.organization').lean();
      if (!user || ['blocked', 'suspended', 'trashed'].includes(user.status)) return next(new Error('UNAUTHORIZED'));
      socket.user = user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const uid = String(socket.user._id);
    socket.join(userRoom(uid));
    if (ADMIN_ROLES.includes(socket.user.role)) socket.join(ADMIN_ROOM);
    for (const hook of connectionHooks) {
      try {
        hook(socket, io);
      } catch (err) {
        logger.error({ err }, 'Socket hook failed');
      }
    }
  });

  return io;
}

export const getIO = () => io;

export function emitToUser(userId, event, payload) {
  if (io) io.to(userRoom(String(userId))).emit(event, payload);
}

export function emitToRoom(room, event, payload) {
  if (io) io.to(room).emit(event, payload);
}

export async function isUserOnline(userId) {
  if (!io) return false;
  const sockets = await io.in(userRoom(String(userId))).fetchSockets();
  return sockets.length > 0;
}

export async function closeSocket() {
  if (io) await new Promise((r) => io.close(() => r()));
}
