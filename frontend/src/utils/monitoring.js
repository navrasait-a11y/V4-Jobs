/**
 * Browser error monitoring (Sentry). Off unless VITE_SENTRY_DSN is set; the SDK is loaded lazily so
 * it never weighs on the first page load. No form values, cookies or auth headers are sent.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN;
let sdk = null;
const queue = [];

export function initMonitoring() {
  if (!DSN || typeof window === 'undefined') return;
  const start = () =>
    import('@sentry/react')
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
          release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', /Loading chunk \d+ failed/, 'Failed to fetch dynamically imported module'],
          beforeBreadcrumb: (b) => (b.category === 'ui.input' ? null : b),
          beforeSend(event) {
            if (event.request) {
              delete event.request.cookies;
              if (event.request.headers) delete event.request.headers.Authorization;
            }
            return event;
          },
        });
        sdk = Sentry;
        queue.splice(0).forEach(([err, ctx]) => captureError(err, ctx));
      })
      .catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 2000);
}

export function captureError(err, context = {}) {
  if (!DSN) return;
  if (!sdk) {
    if (queue.length < 20) queue.push([err, context]);
    return;
  }
  sdk.withScope((scope) => {
    Object.entries(context).forEach(([k, v]) => v !== undefined && scope.setExtra(k, v));
    sdk.captureException(err);
  });
}

export function setMonitoringUser(user) {
  if (!sdk) return;
  sdk.setUser(user ? { id: String(user._id), role: user.role } : null);
}
