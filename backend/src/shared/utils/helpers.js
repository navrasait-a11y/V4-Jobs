import slugifyLib from 'slugify';
import { randomToken } from './crypto.js';

export const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" regex built from untrusted input (escaped, length-capped). */
export const containsRegex = (s) => new RegExp(escapeRegex(String(s).slice(0, 100)), 'i');

export const slugify = (text) => slugifyLib(String(text || ''), { lower: true, strict: true, trim: true }).slice(0, 120);

export const uniqueSlug = (text) =>
  `${slugify(text)}-${randomToken(4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}`;

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}

export function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

export const toArray = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(','));

export const normalizeEmail = (e) => (e ? String(e).trim().toLowerCase() : e);

export function normalizeMobile(m) {
  if (!m) return m;
  const digits = String(m).replace(/\D/g, '');
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
}

export function maskEmail(email = '') {
  const [u, d] = email.split('@');
  if (!d) return email;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(u.length - 2, 1))}@${d}`;
}

export function maskMobile(m = '') {
  return m ? `${'*'.repeat(Math.max(m.length - 4, 0))}${m.slice(-4)}` : m;
}

export const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v));

export function renderTemplate(str = '', vars = {}) {
  return String(str).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o === null || o === undefined ? o : o[k]), vars);
    return val === undefined || val === null ? '' : String(val);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exact, case-insensitive match that ignores spaces around "/" ("Govt / PSU" = "Govt/PSU"). */
export const looseRegex = (v) =>
  new RegExp(
    `^${String(v)
      .trim()
      .split(/\s*\/\s*/)
      .map(escapeRegex)
      .join('\\s*/\\s*')}$`,
    'i',
  );
