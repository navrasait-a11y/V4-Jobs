import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import http from '../services/api';

/**
 * Browser (web) push through Firebase Cloud Messaging. Needs the VITE_FIREBASE_* keys; without them
 * the feature stays hidden. The token is saved on the current session (PUT /auth/device-token), so
 * logging out stops pushes to this browser.
 */
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const vapidKey = env.VITE_FIREBASE_VAPID_KEY;

export const webPushConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey);

export async function webPushSupported() {
  if (!webPushConfigured || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export const pushPermission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

let foregroundBound = false;

/** Registers the worker, gets the FCM token and stores it. `ask` shows the browser permission prompt. */
export async function enableWebPush({ ask = false, onForeground } = {}) {
  if (!(await webPushSupported())) return { ok: false, reason: 'unsupported' };
  let permission = Notification.permission;
  if (permission === 'default' && ask) permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const app = getApps()[0] || initializeApp(firebaseConfig);
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(firebaseConfig))}`);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return { ok: false, reason: 'no_token' };
  await http.put('/auth/device-token', { fcmToken: token });
  if (onForeground && !foregroundBound) {
    foregroundBound = true;
    onMessage(messaging, (payload) => onForeground(payload.notification || payload.data || {}, payload.data || {}));
  }
  return { ok: true };
}
