/**
 * Web push (Firebase Cloud Messaging). The page registers this worker with its Firebase web config
 * in the query string, because a service worker cannot read Vite env variables.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const readConfig = () => {
  try {
    return JSON.parse(params.get('config') || 'null');
  } catch {
    return null;
  }
};
const config = readConfig();

if (config && config.apiKey) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // Background messages that carry a `notification` block are shown by FCM itself; data-only ones here.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    self.registration.showNotification(d.title || 'Freejobwala', {
      body: d.body || '',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { link: d.link || '/' },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const fcm = event.notification.data && (event.notification.data.FCM_MSG || event.notification.data);
  const link = (fcm && (fcm.data?.link || fcm.link || fcm.fcmOptions?.link)) || '/';
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => w.url.startsWith(self.location.origin));
      if (same) {
        same.focus();
        return same.navigate(url);
      }
      return clients.openWindow(url);
    }),
  );
});
