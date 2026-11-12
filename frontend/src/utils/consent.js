import { useSyncExternalStore } from 'react';

const KEY = 'fjw_cookie_consent';
const listeners = new Set();

/** null = not answered yet, 'all' = optional cookies allowed, 'essential' = only what the site needs to work. */
export function getConsent() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'all' || value === 'essential' ? value : null;
  } catch {
    return 'essential'; // storage blocked: nothing optional can be remembered, so do not ask on every page
  }
}

export function setConsent(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  const onStorage = (e) => e.key === KEY && fn(); // answer given in another tab
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

export const useConsent = () => useSyncExternalStore(subscribe, getConsent, () => null);
