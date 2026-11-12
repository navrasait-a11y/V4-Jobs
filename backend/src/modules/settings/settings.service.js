import Joi from 'joi';
import Setting from './settings.model.js';
import ApiError from '../../shared/errors/ApiError.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.js';

/**
 * Defaults are used until an admin overrides a key. Keep keys flat & namespaced.
 */
export const DEFAULT_SETTINGS = {
  'platform.profileDeleteEnabled': { value: true, group: 'platform', isPublic: true, description: 'Allow users to delete their own profile' },
  'platform.googleJobsEnabled': { value: true, group: 'platform', isPublic: true, description: 'Publish Google for Jobs structured data' },
  'platform.jobApprovalRequired': { value: false, group: 'platform', description: 'New jobs go to admin review before going live' },
  'platform.employerApprovalRequired': { value: true, group: 'platform', description: 'New employers stay pending until admin approval' },
  'platform.defaultJobExpiryDays': { value: 30, group: 'platform', description: 'Default validity of a job post' },
  'platform.maintenanceMode': { value: false, group: 'platform', isPublic: true, description: 'Close the website and app for everyone except admins' },
  'platform.maintenanceMessage': { value: '', group: 'platform', isPublic: true, description: 'Message shown to visitors during maintenance' },
  'platform.supportEmail': { value: 'support@freejobwala.com', group: 'platform', isPublic: true },
  'platform.supportPhone': { value: '', group: 'platform', isPublic: true },
  'platform.minAppVersion': { value: { android: '1.0.0', ios: '1.0.0' }, group: 'platform', isPublic: true },
  'payments.methods': {
    value: { razorpay: true, upi: true, card: true, netbanking: true, wallet: true, paytm: true, phonepe: true },
    group: 'payments',
    isPublic: true,
  },
  'payments.gstPercent': { value: 18, group: 'payments', isPublic: true },
  'payments.walletTopup': {
    value: { enabled: true, min: 100, max: 100000 },
    group: 'payments',
    isPublic: true,
    description: 'Wallet top-up: on/off and the smallest / largest amount (INR) a user can add at once',
  },
  'referral.rewardAmount': { value: 50, group: 'payments', description: 'Wallet credit (INR) for referrer when referee makes first purchase' },
  'ai.matchWeights': {
    value: { skills: 0.35, role: 0.15, location: 0.15, experience: 0.15, salary: 0.1, education: 0.1 },
    group: 'ai',
    description: 'Weights used by the job-candidate matching engine',
  },
  'ads.enabled': { value: true, group: 'ads', isPublic: true },
  'ads.adsenseClientId': { value: '', group: 'ads', isPublic: true },
  'ads.admobAppId': { value: { android: '', ios: '' }, group: 'ads', isPublic: true },
  'integrations.googleMapsKey': { value: '', group: 'integrations', isSecret: true },
  'integrations.arattai': { value: { enabled: false, apiUrl: '', apiKey: '' }, group: 'integrations', isSecret: true },
  'integrations.smsTemplates': {
    value: {},
    group: 'integrations',
    description:
      'DLT SMS template overrides: { otp|interview|interview_reminder|generic|bulk: { templateId, text } }. text uses {{var}} placeholders and must match the DLT approved wording',
  },
};

const bool = Joi.boolean().strict();
const version = Joi.string().trim().pattern(/^\d+(\.\d+){0,3}$/).message('Use a version like 1.2.0');
const weight = Joi.number().min(0).max(1).required();

/**
 * What each setting may hold. A wrong shape here would silently break the feature that reads it
 * (a text in "GST percent", a missing key in "payment methods"), so saves are checked first.
 */
export const SETTING_SCHEMAS = {
  'platform.profileDeleteEnabled': bool,
  'platform.googleJobsEnabled': bool,
  'platform.jobApprovalRequired': bool,
  'platform.employerApprovalRequired': bool,
  'platform.defaultJobExpiryDays': Joi.number().integer().min(1).max(365),
  'platform.maintenanceMode': bool,
  'platform.maintenanceMessage': Joi.string().trim().max(300).allow(''),
  'platform.supportEmail': Joi.string().trim().email().allow(''),
  'platform.supportPhone': Joi.string().trim().max(20).pattern(/^[0-9+ ()-]*$/).message('Use digits, spaces and + - ( ) only').allow(''),
  'platform.minAppVersion': Joi.object({ android: version.required(), ios: version.required() }),
  'payments.methods': Joi.object({ razorpay: bool, upi: bool, card: bool, netbanking: bool, wallet: bool, paytm: bool, phonepe: bool }),
  'payments.gstPercent': Joi.number().min(0).max(28),
  'payments.walletTopup': Joi.object({ enabled: bool.required(), min: Joi.number().integer().min(1).max(1000000).required(), max: Joi.number().integer().min(Joi.ref('min')).max(1000000).required() }).messages({
    'number.min': 'The largest amount cannot be smaller than the smallest amount',
  }),
  'referral.rewardAmount': Joi.number().min(0).max(100000),
  'ai.matchWeights': Joi.object({ skills: weight, role: weight, location: weight, experience: weight, salary: weight, education: weight }).custom((v, h) => {
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1) < 0.011 ? v : h.message('The six weights must add up to 100%');
  }),
  'ads.enabled': bool,
  'ads.adsenseClientId': Joi.string().trim().pattern(/^ca-pub-\d{10,20}$/).message('An AdSense publisher id looks like ca-pub-1234567890123456').allow(''),
  'ads.admobAppId': Joi.object({ android: Joi.string().trim().max(80).allow('').required(), ios: Joi.string().trim().max(80).allow('').required() }),
  'integrations.googleMapsKey': Joi.string().trim().max(200).allow(''),
  'integrations.arattai': Joi.object({ enabled: bool.required(), apiUrl: Joi.string().trim().uri({ scheme: ['https'] }).message('Use an https:// address').allow('').required(), apiKey: Joi.string().trim().max(500).allow('').required() }),
  'integrations.smsTemplates': Joi.object().pattern(
    Joi.string().valid('otp', 'interview', 'interview_reminder', 'generic', 'bulk'),
    Joi.object({ templateId: Joi.string().trim().max(40).allow(''), text: Joi.string().trim().max(500).allow('') }),
  ),
};

const MASK = /^\*{4}/;
/** Secret fields come back to the panel masked ("****ab12"). Saving that back must keep the stored secret. */
function keepMaskedSecrets(next, current) {
  if (typeof next === 'string') return MASK.test(next) ? (current ?? '') : next;
  if (next && typeof next === 'object') {
    return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, typeof v === 'string' && MASK.test(v) ? (current?.[k] ?? '') : v]));
  }
  return next;
}

/** Validates and saves a setting from the admin panel. Throws a 422 with the reason when the value is not usable. */
export async function saveSetting(key, raw, userId) {
  const def = DEFAULT_SETTINGS[key];
  if (!def) throw ApiError.notFound('Unknown setting');
  let value = raw;
  if (def.isSecret) value = keepMaskedSecrets(raw, await getSetting(key));
  const schema = SETTING_SCHEMAS[key];
  if (schema) {
    const res = schema.validate(value, { abortEarly: false, convert: false, errors: { wrap: { label: '' } } });
    if (res.error) throw ApiError.validation(res.error.details.map((d) => ({ field: d.path.join('.') || 'value', message: d.message, location: 'body' })), res.error.details[0].message);
    value = res.value;
  }
  return setSetting(key, value, userId);
}

const CACHE_MS = 60 * 1000;
const cache = new Map();

const decode = (doc) => (doc.isSecret && typeof doc.value === 'string' ? JSON.parse(decrypt(doc.value)) : doc.value);

export async function getSetting(key, fallback) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const doc = await Setting.findOne({ key }).lean();
  const value = doc ? decode(doc) : (DEFAULT_SETTINGS[key]?.value ?? fallback);
  cache.set(key, { value, exp: Date.now() + CACHE_MS });
  return value;
}

export async function setSetting(key, value, userId) {
  const def = DEFAULT_SETTINGS[key] || {};
  const isSecret = Boolean(def.isSecret);
  await Setting.findOneAndUpdate(
    { key },
    {
      $set: {
        value: isSecret ? encrypt(JSON.stringify(value)) : value,
        isSecret,
        group: def.group || key.split('.')[0],
        isPublic: Boolean(def.isPublic),
        description: def.description,
        updatedBy: userId,
      },
    },
    { upsert: true },
  );
  cache.delete(key);
  return value;
}

export async function listSettings({ group, maskSecrets = true } = {}) {
  const docs = await Setting.find(group ? { group } : {}).lean();
  const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
  const keys = new Set([...Object.keys(DEFAULT_SETTINGS), ...Object.keys(byKey)]);
  const out = [];
  for (const key of keys) {
    const def = DEFAULT_SETTINGS[key] || {};
    if (group && (byKey[key]?.group || def.group) !== group) continue;
    let value = byKey[key] ? decode(byKey[key]) : def.value;
    const isSecret = byKey[key]?.isSecret ?? def.isSecret ?? false;
    if (isSecret && maskSecrets) value = mask(value);
    out.push({ key, value, group: byKey[key]?.group || def.group, isSecret, isPublic: def.isPublic || false, description: def.description });
  }
  return out;
}

function mask(value) {
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'string' && v ? `****${v.slice(-4)}` : v]));
  return typeof value === 'string' && value ? `****${value.slice(-4)}` : value;
}

export async function publicSettings() {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (def.isPublic) out[key] = await getSetting(key);
  }
  return out;
}
