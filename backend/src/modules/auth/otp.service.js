import config from '../../config/env.js';
import logger from '../../config/logger.js';
import ApiError from '../../shared/errors/ApiError.js';
import { randomOtp, sha256, safeEqual } from '../../shared/utils/crypto.js';
import { Otp } from './auth.models.js';
import { sendEmail, sendSms, sendWhatsapp } from '../notifications/notification.service.js';

const RESEND_COOLDOWN_MS = 30 * 1000;
const DEV_CODE = '123456';

const hashCode = (target, purpose, code) => sha256(`${target}:${purpose}:${code}:${config.encryptionKey}`);

/**
 * Creates & dispatches an OTP. Only the hash is stored. A resend cooldown protects SMS spend.
 * channel: 'sms' | 'whatsapp' | 'email'
 */
export async function sendOtp({ target, channel, purpose, meta }) {
  const last = await Otp.findOne({ target, purpose, consumedAt: null }).sort({ createdAt: -1 }).lean();
  if (last && Date.now() - new Date(last.createdAt).getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(last.createdAt).getTime())) / 1000);
    throw ApiError.tooMany(`Please wait ${wait}s before requesting a new OTP`, 'OTP_COOLDOWN');
  }

  const code = config.otp.devBypass ? DEV_CODE : randomOtp(6);
  await Otp.updateMany({ target, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } }); // invalidate older codes
  await Otp.create({
    target,
    channel,
    purpose,
    meta,
    codeHash: hashCode(target, purpose, code),
    expiresAt: new Date(Date.now() + config.otp.ttl * 1000),
  });

  const minutes = Math.round(config.otp.ttl / 60);
  if (channel === 'email') {
    await sendEmail({ to: target, template: 'otp', vars: { otp: code, minutes }, category: 'otp' });
  } else if (channel === 'whatsapp') {
    await sendWhatsapp(target, { template: 'otp_verification', params: [code], text: `*${code}* is your ${config.appName} verification code. Valid for ${minutes} minutes. Do not share this code with anyone.` });
  } else {
    await sendSms(target, { template: 'otp', vars: { otp: code, minutes, appName: config.appName } });
  }
  if (!config.isProd) logger.debug({ target, purpose, code }, 'OTP generated');
  return { expiresIn: config.otp.ttl, resendIn: RESEND_COOLDOWN_MS / 1000 };
}

/** Verifies and consumes an OTP. Returns the stored meta. */
export async function verifyOtp({ target, purpose, code }) {
  const otp = await Otp.findOne({ target, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw ApiError.badRequest('OTP expired or not found. Please request a new one', undefined, 'OTP_EXPIRED');
  if (otp.attempts >= config.otp.maxAttempts) throw ApiError.tooMany('Too many wrong attempts. Please request a new OTP', 'OTP_LOCKED');

  if (!safeEqual(otp.codeHash, hashCode(target, purpose, String(code)))) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest(`Invalid OTP. ${config.otp.maxAttempts - otp.attempts} attempts left`, undefined, 'OTP_INVALID');
  }
  otp.consumedAt = new Date();
  await otp.save();
  return otp.meta || {};
}
