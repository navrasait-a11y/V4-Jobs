import Setting from './settings.model.js';
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
  'platform.maintenanceMode': { value: false, group: 'platform', isPublic: true },
  'platform.supportEmail': { value: 'support@freejobwala.com', group: 'platform', isPublic: true },
  'platform.supportPhone': { value: '', group: 'platform', isPublic: true },
  'platform.minAppVersion': { value: { android: '1.0.0', ios: '1.0.0' }, group: 'platform', isPublic: true },
  'payments.methods': {
    value: { razorpay: true, upi: true, card: true, netbanking: true, wallet: true, paytm: true, phonepe: true },
    group: 'payments',
    isPublic: true,
  },
  'payments.gstPercent': { value: 18, group: 'payments', isPublic: true },
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
