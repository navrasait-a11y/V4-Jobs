import config from '../../config/env.js';
import logger from '../../config/logger.js';
import { EmailLog, MessageLog } from '../../modules/notifications/notification.model.js';
import { getSetting } from '../../modules/settings/settings.service.js';
import { sendBrevoEmail } from './providers/brevo.js';
import { sendApitxtSms, sendApitxtOtp } from './providers/apitxt.js';
import { resolveSmsTemplate } from './smsTemplates.js';

/* ------------------------------------------------------------------ e-mail */

/**
 * Sends an e-mail now (queue handler) via EMAIL_PROVIDER = brevo | console and records it in
 * EmailLog. Idempotent: a retried job whose log is already "sent" is not sent twice.
 */
export async function deliverEmail({ to, cc, subject, html, text, template, category, user, sentBy, logId, attachments }) {
  const log = logId ? await EmailLog.findById(logId) : await EmailLog.create({ to, cc, subject, template, category, user, sentBy, status: 'queued' });
  if (log && ['sent', 'delivered', 'opened', 'clicked'].includes(log.status)) return;
  const provider = config.email.provider;
  try {
    let messageId;
    if (provider === 'brevo') {
      ({ messageId } = await sendBrevoEmail({ to, cc, subject, html, text, attachments, tags: [category || 'transactional', template].filter(Boolean) }));
    } else {
      logger.info({ to, subject }, '[email:console] provider not configured - e-mail logged only');
      messageId = 'console';
    }
    if (log) Object.assign(log, { status: 'sent', sentAt: new Date(), messageId, provider, error: undefined });
  } catch (err) {
    if (log) Object.assign(log, { status: 'failed', provider, error: err.message?.slice(0, 500), attempts: (log.attempts || 0) + 1 });
    await log?.save();
    throw err;
  }
  await log?.save();
}

/* --------------------------------------------------------------------- SMS */

/**
 * Sends one SMS via SMS_PROVIDER = apitxt | console.
 * `template` is a DLT template key (otp, interview, interview_reminder, generic, bulk) with `vars`.
 * Idempotent per MessageLog (retries never double-send an already sent SMS).
 */
/** DLT SMS needs a registered header, entity id and the template's id. Without all three apitxt rejects it. */
export const dltReady = (templateId) => Boolean(templateId && config.sms.apitxt.senderId && config.sms.apitxt.peId);

/**
 * Which apitxt route an OTP takes. The Unified OTP API (/api/sendOTP) needs only the auth key, so it
 * is used unless DLT is chosen *and* fully set up - a half-finished DLT setup must never stop OTPs.
 */
export function otpRoute(resolvedTemplateId) {
  const c = config.sms.apitxt;
  return c.otpMode === 'dlt' && dltReady(resolvedTemplateId) ? 'dlt' : 'otp_api';
}

export async function deliverSms({ logId, to, template = 'generic', vars = {}, message, user }) {
  const log = logId ? await MessageLog.findById(logId) : await MessageLog.create({ channel: 'sms', to, user, template, status: 'queued' });
  if (log?.status === 'sent' || log?.status === 'skipped') return log;
  const { provider } = config.sms;
  try {
    const resolved = (await resolveSmsTemplate(template, vars)) || { templateId: '', message: message || '' };
    const text = resolved.message || message || '';
    if (log) Object.assign(log, { body: template === 'otp' && vars.otp ? text.split(String(vars.otp)).join('******') : text, template });
    let providerId;

    if (provider === 'apitxt') {
      if (template === 'otp') {
        const route = otpRoute(resolved.templateId);
        ({ providerId } = route === 'dlt' ? await sendApitxtSms({ to, message: text, templateId: resolved.templateId }) : await sendApitxtOtp({ to, otp: vars.otp }));
        if (log) log.route = route;
      } else if (!dltReady(resolved.templateId)) {
        // Alerts, interview and bulk SMS need a DLT-approved template. Until it is set up they are
        // recorded as skipped (not failed): retrying cannot help and the user still gets e-mail / in-app.
        if (log) Object.assign(log, { status: 'skipped', error: 'DLT template not set up for this SMS type (Admin > Settings > Integrations)' });
        await log?.save();
        return log;
      } else {
        ({ providerId } = await sendApitxtSms({ to, message: text, templateId: resolved.templateId }));
      }
    } else {
      logger.info({ to, template, text }, '[sms:console]');
    }
    if (log) Object.assign(log, { status: 'sent', providerId, error: undefined });
  } catch (err) {
    if (log) Object.assign(log, { status: 'failed', error: err.message?.slice(0, 500) });
    await log?.save();
    throw err;
  }
  await log?.save();
  return log;
}

/* ---------------------------------------------------------------- WhatsApp */

/**
 * Meta WhatsApp Cloud API. Business-initiated messages must use approved templates;
 * `template` + `params` are used when provided, otherwise a plain text session message.
 */
export async function deliverWhatsapp({ to, template, params = [], text, user }) {
  const log = await MessageLog.create({ channel: 'whatsapp', to, user, template, body: text });
  try {
    const { provider, token, phoneNumberId, lang } = config.whatsapp;
    if (provider === 'meta') {
      const payload = template
        ? {
            messaging_product: 'whatsapp',
            to: `91${to}`,
            type: 'template',
            template: {
              name: template,
              language: { code: lang },
              components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [],
            },
          }
        : { messaging_product: 'whatsapp', to: `91${to}`, type: 'text', text: { body: text } };
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${JSON.stringify(body.error || body)}`);
      log.providerId = body.messages?.[0]?.id;
    } else {
      logger.info({ to, template, params, text }, '[whatsapp:console]');
    }
    log.status = 'sent';
  } catch (err) {
    log.status = 'failed';
    log.error = err.message?.slice(0, 500);
    await log.save();
    throw err;
  }
  await log.save();
}

/* ----------------------------------------------------------------- Arattai */

/** Arattai has no public API yet - configurable HTTP webhook so it can be wired once available. */
export async function deliverArattai({ to, text, user }) {
  const cfg = await getSetting('integrations.arattai');
  const log = await MessageLog.create({ channel: 'arattai', to, user, body: text });
  if (!cfg?.enabled || !cfg.apiUrl) {
    logger.info({ to }, '[arattai] integration disabled - message logged only');
    log.status = 'sent';
    return log.save();
  }
  const res = await fetch(cfg.apiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to, text }),
  });
  log.status = res.ok ? 'sent' : 'failed';
  if (!res.ok) log.error = `HTTP ${res.status}`;
  await log.save();
  if (!res.ok) throw new Error(`Arattai ${res.status}`);
}

/* -------------------------------------------------------------------- Push */

let messaging = null;
async function getMessaging() {
  if (!config.firebaseServiceAccount) return null;
  if (!messaging) {
    const admin = (await import('firebase-admin')).default;
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(config.firebaseServiceAccount)) });
    messaging = admin.messaging(app);
  }
  return messaging;
}

/** Sends FCM push to Android / iOS / Web tokens. Returns tokens that FCM reports as invalid. */
export async function deliverPush({ tokens = [], title, body, data = {}, image, link }) {
  if (!tokens.length) return [];
  const m = await getMessaging();
  if (!m) {
    logger.info({ count: tokens.length, title }, '[push:console] Firebase not configured');
    return [];
  }
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const res = await m.sendEachForMulticast({
    tokens,
    notification: { title, body, imageUrl: image },
    data: stringData,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
    // Browser push: opens the page on click (FCM requires an https link).
    webpush: { notification: { icon: '/favicon.png', badge: '/favicon.png' }, ...(link?.startsWith('https://') ? { fcmOptions: { link } } : {}) },
  });
  const invalid = [];
  res.responses.forEach((r, i) => {
    if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) {
      invalid.push(tokens[i]);
    }
  });
  return invalid;
}
