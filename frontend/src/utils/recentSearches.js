const KEY = 'fjw_recent_searches';
const MAX = 6;

/** Recent job searches stay in this browser. Storage can be blocked, so every call is guarded. */
export const readRecent = () => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked */
  }
  return list;
};

const same = (a, b) => (a.q || '').toLowerCase() === (b.q || '').toLowerCase() && (a.location || '').toLowerCase() === (b.location || '').toLowerCase();

export const rememberSearch = (entry) => write([entry, ...readRecent().filter((r) => !same(r, entry))].slice(0, MAX));
export const removeRecent = (entry) => write(readRecent().filter((r) => !same(r, entry)));
export const clearRecent = () => write([]);
export const recentLabel = (r) => [r.q, r.location].filter(Boolean).join(' in ');
