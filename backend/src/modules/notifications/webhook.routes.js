import { Router } from 'express';
import config from '../../config/env.js';
import logger from '../../config/logger.js';
import { safeEqual } from '../../shared/utils/crypto.js';
import { BREVO_EVENT_STATUS } from '../../shared/services/providers/brevo.js';
import { EmailLog } from './notification.model.js';

/**
 * Provider callbacks (no user auth - protected by a shared secret).
 *
 * Brevo transactional webhook -> POST /api/v1/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>
 * Updates EmailLog status (delivered / bounced / spam / blocked / opened / clicked) so the admin
 * e-mail statistics show real delivery, not just "accepted by provider".
 */
const r = Router();

// A later event never moves a log "backwards" (e.g. a late "request" after "delivered").
const RANK = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4 };
const TERMINAL = new Set(['bounced', 'blocked', 'spam', 'failed']);

r.post('/brevo', async (req, res) => {
  const token = req.query.token || req.get('x-webhook-token') || '';
  if (!config.email.brevo.webhookToken || !safeEqual(String(token), config.email.brevo.webhookToken)) {
    return res.status(401).json({ success: false });
  }
  const events = Array.isArray(req.body) ? req.body : [req.body];
  let updated = 0;
  for (const e of events.slice(0, 1000)) {
    const messageId = e['message-id'] || e.messageId || e.message_id;
    const status = BREVO_EVENT_STATUS[e.event];
    if (!messageId || !status) continue;
    const log = await EmailLog.findOne({ messageId });
    if (!log) continue;
    log.events.push({ event: e.event, at: e.date ? new Date(e.date) : new Date(), reason: e.reason?.slice?.(0, 300) });
    if (log.events.length > 50) log.events = log.events.slice(-50);
    const current = log.status;
    if (TERMINAL.has(status) || (!TERMINAL.has(current) && (RANK[status] ?? 0) > (RANK[current] ?? 0))) {
      log.status = status;
      if (TERMINAL.has(status) && e.reason) log.error = String(e.reason).slice(0, 500);
    }
    await log.save();
    updated += 1;
  }
  if (updated) logger.debug({ updated }, 'Brevo webhook processed');
  // Always 200 for authenticated calls so Brevo does not retry events we chose to ignore.
  return res.json({ success: true, updated });
});

export default r;
