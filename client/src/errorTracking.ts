import * as Sentry from '@sentry/react';

// MON-05: there was no error tracker on the client either — a React crash
// showed the ErrorBoundary's "Application Error" panel to the user and left
// no record anywhere, so nobody knew it had happened unless the user said so.
//
// Inert without VITE_SENTRY_DSN, so local dev and CI behave exactly as before
// rather than needing an account to run the app.
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const RELEASE = (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined) || 'unknown';

let enabled = false;

export const initErrorTracking = (): void => {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    release: RELEASE,
    environment: import.meta.env.MODE,
    // No session replay and no performance tracing: a replay of a clinical
    // screen would ship patient data to a third party, which is exactly what
    // the personal-data inventory (SEC-30) says must not happen.
    integrations: [],
    tracesSampleRate: 0,
    beforeSend(event) {
      // Belt and braces alongside the empty integrations list above: strip
      // anything that could carry PHI out of the event before it is sent.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      // URLs can carry record identifiers (/patients/123/consultations) —
      // the path shape is useful, the identifiers are not worth the risk.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/\/\d+/g, '/:id');
      }
      return event;
    },
  });
  enabled = true;
};

export const captureError = (err: unknown, context?: Record<string, unknown>): void => {
  if (!enabled) return;
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
};

export const isErrorTrackingEnabled = (): boolean => enabled;
