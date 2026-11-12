import Joi from 'joi';

/** GST state codes (first two digits of a GSTIN). */
export const GST_STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam',
  19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra',
  28: 'Andhra Pradesh', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana',
  37: 'Andhra Pradesh', 38: 'Ladakh', 97: 'Other Territory', 99: 'Centre Jurisdiction',
};

const STATE_ALIASES = { orissa: '21', pondicherry: '34', uttaranchal: '05', 'new delhi': '07', 'nct of delhi': '07', 'jammu kashmir': '01', 'daman and diu': '26', 'dadra and nagar haveli': '26' };
const stateKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const CODE_BY_STATE = Object.fromEntries(
  Object.entries(GST_STATES)
    .filter(([code]) => code !== '37') // 28 is the current Andhra Pradesh code
    .map(([code, name]) => [stateKey(name), String(code).padStart(2, '0')]),
);

/** GST state code ("08") for a state name as users type it ("Rajasthan", "Jammu & Kashmir"), or undefined. */
export const gstStateCode = (name) => CODE_BY_STATE[stateKey(name)] || STATE_ALIASES[stateKey(name)];

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The 15th character of a GSTIN: the official mod-36 check digit over the first 14. */
export function gstinCheckDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Shape + state code + check digit. Catches almost every typo in a GST number. */
export function isValidGstin(value) {
  const g = String(value || '').trim().toUpperCase();
  if (!SHAPE.test(g) || !GST_STATES[g.slice(0, 2)] && !GST_STATES[Number(g.slice(0, 2))]) return false;
  return gstinCheckDigit(g.slice(0, 14)) === g[14];
}

/** Details read from a GSTIN: state and the PAN it embeds. */
export const gstinInfo = (g) => ({ state: GST_STATES[g.slice(0, 2)] || GST_STATES[Number(g.slice(0, 2))] || '', pan: g.slice(2, 12) });

/** Joi rule for a GSTIN field ("" allowed when `optional`). */
export const gstinSchema = (message = 'Enter a valid 15-character GST number') =>
  Joi.string()
    .trim()
    .uppercase()
    .custom((v, h) => (isValidGstin(v) ? v : h.error('any.invalid')))
    .messages({ 'any.invalid': message, 'string.base': message });
