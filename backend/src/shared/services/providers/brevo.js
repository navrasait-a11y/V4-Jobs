import config from '../../../config/env.js';
import { ProviderError, isRetryableStatus, request } from './http.js';

/**
 * Brevo (ex-Sendinblue) transactional e-mail API.
 * POST {BREVO_API_URL}/smtp/email   header: api-key
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */

/** "Name <a@b.com>" | "a@b.com" | {email,name} -> { email, name } */
function toAddress(v) {
  if (!v) return null;
  if (typeof v === 'object') return v.email ? { email: v.email, ...(v.name ? { name: v.name } : {}) } : null;
  const m = String(v).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { email: m[2].trim(), ...(m[1] ? { name: m[1].replace(/^"|"$/g, '') } : {}) } : { email: String(v).trim() };
}
const toList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map(toAddress).filter(Boolean);

/** Brevo accepts attachments as base64 `content` + `name`, or a public `url`. */
function toAttachments(list = []) {
  return list.map((a) => {
    if (a.url || a.path?.startsWith?.('http')) return { url: a.url || a.path, name: a.filename || a.name };
    const content = Buffer.isBuffer(a.content)
      ? a.content.toString('base64')
      : a.encoding === 'base64'
        ? a.content
        : Buffer.from(String(a.content || '')).toString('base64');
    return { content, name: a.filename || a.name || 'attachment' };
  });
}

/**
 * Sends one e-mail. Returns { messageId }.
 * Brevo returns 201 { messageId } on success, 4xx { code, message } on errors.
 */
export async function sendBrevoEmail({ to, cc, bcc, subject, html, text, attachments, tags, replyTo }) {
  const { brevo, fromEmail, fromName, replyTo: defaultReplyTo, timeoutMs } = config.email;
  if (!brevo.apiKey) throw new ProviderError('brevo', 'BREVO_API_KEY is not configured', { retryable: false });

  const payload = {
    sender: { email: fromEmail, name: fromName },
    to: toList(to),
    subject,
    htmlContent: html || `<p>${text || ''}</p>`,
    ...(text ? { textContent: text } : {}),
    ...(cc?.length ? { cc: toList(cc) } : {}),
    ...(bcc?.length ? { bcc: toList(bcc) } : {}),
    ...(replyTo || defaultReplyTo ? { replyTo: toAddress(replyTo || defaultReplyTo) } : {}),
    ...(attachments?.length ? { attachment: toAttachments(attachments) } : {}),
    ...(tags?.length ? { tags: tags.slice(0, 10).map(String) } : {}),
  };
  if (!payload.to.length) throw new ProviderError('brevo', 'no valid recipient', { retryable: false });

  const headers = { 'api-key': brevo.apiKey };
  if (brevo.sandbox) headers['X-Sib-Sandbox'] = 'drop'; // validates the request without delivering (staging)

  const res = await request('brevo', `${brevo.apiUrl}/smtp/email`, { headers, json: payload, timeoutMs });
  if (res.status === 201 || res.status === 202 || res.ok) {
    return { messageId: res.body?.messageId || res.body?.messageIds?.[0] || null };
  }
  const code = res.body?.code ? ` [${res.body.code}]` : '';
  throw new ProviderError('brevo', `HTTP ${res.status}${code} ${res.body?.message || ''}`.trim(), {
    status: res.status,
    // not_enough_credits / unauthorized / invalid params will not succeed on retry
    retryable: isRetryableStatus(res.status),
    body: res.body,
  });
}

/**
 * Maps Brevo webhook events to our EmailLog status.
 * https://developers.brevo.com/docs/transactional-webhooks
 */
export const BREVO_EVENT_STATUS = {
  request: 'sent',
  delivered: 'delivered',
  deferred: 'sent',
  soft_bounce: 'bounced',
  hard_bounce: 'bounced',
  invalid_email: 'bounced',
  blocked: 'blocked',
  error: 'failed',
  spam: 'spam',
  complaint: 'spam',
  unsubscribed: 'delivered',
  opened: 'opened',
  unique_opened: 'opened',
  click: 'clicked',
};
