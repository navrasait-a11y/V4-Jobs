const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Same check as the API: shape + official mod-36 check digit. */
export function isValidGstin(value) {
  const g = String(value || '').trim().toUpperCase();
  if (!SHAPE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** Message for a GST field while typing: nothing until 15 characters, then valid / invalid. */
export const gstinHint = (value) => {
  const g = String(value || '').trim();
  if (!g) return { hint: '15 characters, e.g. 27AAPFU0939F1ZV' };
  if (g.length < 15) return { hint: `${g.length}/15 characters` };
  return isValidGstin(g) ? { hint: 'Valid GST number format ✓' } : { error: 'This GST number is not valid. Please check all 15 characters' };
};
