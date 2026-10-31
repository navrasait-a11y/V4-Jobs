import logger from '../../config/logger.js';
import { Activity, AuditLog } from './activity.model.js';

/** Fire-and-forget: activity logging must never break the request that triggered it. */
export function logActivity(req, { user, organization, type, description, meta } = {}) {
  Activity.create({
    user: user || req?.user?._id,
    organization: organization || req?.user?.employer?.organization,
    type,
    description,
    meta,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent'),
  }).catch((err) => logger.warn({ err }, 'Failed to write activity log'));
}

export function audit(req, { action, entity, entityId, changes }) {
  AuditLog.create({
    actor: req?.user?._id,
    actorRole: req?.user?.role,
    impersonatedBy: req?.auth?.impersonatedBy,
    action,
    entity,
    entityId: entityId ? String(entityId) : undefined,
    changes,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent'),
    requestId: req?.id,
  }).catch((err) => logger.warn({ err }, 'Failed to write audit log'));
}
