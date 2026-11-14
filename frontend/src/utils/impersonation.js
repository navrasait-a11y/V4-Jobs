/**
 * Admin "login as" runs in its own browser tab with its own session, kept in sessionStorage (per
 * tab, gone when the tab closes). The tab never reads or writes the admin's login cookie, so the
 * admin stays signed in to the panel in their other tabs and the two sessions cannot overwrite
 * each other.
 */
const KEY = 'fjw_impersonation';

export function getImpersonation() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const isImpersonationTab = () => Boolean(getImpersonation()?.refreshToken);

export function saveImpersonation(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...getImpersonation(), ...data }));
  } catch {
    /* storage blocked: the tab still works until the access token expires */
  }
}

export function clearImpersonation() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Tokens travel in the URL fragment (#), which browsers never send to any server or log. */
/** `sameTab`: opened in the admin's own tab (pop-ups blocked), so ending it returns to the panel instead of closing. */
export const impersonationUrl = ({ accessToken, refreshToken }, { sameTab = false } = {}) =>
  `/impersonate#${new URLSearchParams({ a: accessToken, r: refreshToken || '', ...(sameTab ? { m: 'same' } : {}) }).toString()}`;

export function readImpersonationHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (params.get('a')) return { accessToken: params.get('a'), refreshToken: params.get('r') || '', sameTab: params.get('m') === 'same' };
  // Links made before the refresh token was passed along carried only the access token.
  const legacy = decodeURIComponent(String(hash || '').replace(/^#/, ''));
  return legacy && !legacy.includes('=') ? { accessToken: legacy, refreshToken: '' } : null;
}
