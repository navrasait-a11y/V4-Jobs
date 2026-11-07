import config from '../../../config/env.js';
import { ProviderError, isRetryableStatus, request } from './http.js';

/**
 * APITxT SMS gateway (https://apitxt.com).
 *  - DLT SMS : POST {base}/api/sendMsg  { authkey, mobiles, message, sender, route, template_id, pe_id }
 *  - OTP API : POST {base}/api/sendOTP  form-urlencoded { authkey, mobile, otp, channel, template_id?, template_name? }
 *              "Unified OTP API": without template_id the apitxt system default config is used, so no DLT
 *              template is needed. Max 3 OTPs per mobile per minute (our resend cooldown stays below that).
 * sendMsg uses JSON + "Authorization: Bearer <api key>".
 * Success: sendMsg -> { status: 200, message: "success", request_id }
 *          sendOTP -> { status: "success", message, data: { request_id } }
 */

const tenDigits = (m) =>
  String(m || '')
    .replace(/\D/g, '')
    .slice(-10);

function isSuccess(res) {
  if (!res.ok) return false;
  const b = res.body;
  if (!b || typeof b !== 'object') return /success/i.test(String(b));
  const status = String(b.status ?? '').toLowerCase();
  if (status === 'error' || status === 'failed' || status === 'fail' || b.error) return false;
  return status === '200' || status === 'success' || /success/i.test(String(b.message || ''));
}

function requestId(body) {
  return body?.request_id || body?.data?.request_id || body?.requestId || body?.data?.requestId || null;
}

function fail(res, what) {
  const msg = typeof res.body === 'object' ? res.body?.message || res.body?.error || JSON.stringify(res.body) : String(res.body).slice(0, 300);
  // A 200 response with a business error (invalid template / DLT mismatch / low balance) is permanent.
  const retryable = !res.ok && isRetryableStatus(res.status);
  return new ProviderError('apitxt', `${what} failed (HTTP ${res.status}): ${msg}`, { status: res.status, retryable, body: res.body });
}

function assertConfigured() {
  const c = config.sms.apitxt;
  if (!c.authKey) throw new ProviderError('apitxt', 'APITXT_AUTH_KEY is not configured', { retryable: false });
  return c;
}

/**
 * Sends a DLT-registered transactional SMS. `message` must match the approved template
 * text exactly (variables substituted), and `templateId` must be that template's DLT id.
 * `to` can be one number or an array (sent comma-separated in one request).
 */
export async function sendApitxtSms({ to, message, templateId }) {
  const c = assertConfigured();
  if (!templateId) throw new ProviderError('apitxt', 'DLT template_id missing for this message', { retryable: false });
  if (!c.senderId || !c.peId) throw new ProviderError('apitxt', 'APITXT_SENDER_ID / APITXT_PE_ID not configured', { retryable: false });
  const mobiles = (Array.isArray(to) ? to : [to]).map(tenDigits).filter((m) => m.length === 10);
  if (!mobiles.length) throw new ProviderError('apitxt', 'invalid mobile number', { retryable: false });

  const res = await request('apitxt', `${c.baseUrl}/api/sendMsg`, {
    headers: { authorization: `Bearer ${c.apiKey}` },
    json: {
      authkey: c.authKey,
      mobiles: mobiles.join(','),
      message,
      sender: c.senderId,
      route: String(c.route),
      template_id: String(templateId),
      pe_id: String(c.peId),
    },
    timeoutMs: config.sms.timeoutMs,
  });
  if (!isSuccess(res)) throw fail(res, 'sendMsg');
  return { providerId: requestId(res.body) };
}

/**
 * OTP through the Unified OTP API (APITXT_OTP_MODE=otp_api). `template_id` (SMS) / `template_name`
 * (WhatsApp) are sent only when configured; otherwise apitxt uses its default OTP configuration.
 */
export async function sendApitxtOtp({ to, otp, channel }) {
  const c = assertConfigured();
  const mobile = tenDigits(to);
  if (mobile.length !== 10) throw new ProviderError('apitxt', 'invalid mobile number', { retryable: false });
  const ch = channel || c.otpChannel || 'sms';
  const form = { authkey: c.authKey, mobile: `91${mobile}`, otp: String(otp), channel: ch };
  if (ch === 'sms' && c.otpTemplateId) form.template_id = String(c.otpTemplateId);
  if (ch === 'whatsapp' && c.otpTemplateName) form.template_name = c.otpTemplateName;
  const res = await request('apitxt', `${c.baseUrl}/api/sendOTP`, { form, timeoutMs: config.sms.timeoutMs });
  if (!isSuccess(res)) throw fail(res, 'sendOTP');
  return { providerId: requestId(res.body) };
}
