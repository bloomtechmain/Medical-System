import * as Sentry from '@sentry/node';
import { logger, RELEASE } from './logger';

// MON-05: there was no error tracker on the server at all — an exception went
// to the console and, unless someone happened to be tailing logs for that one
// service at that moment, was never seen again. Nothing carried a release, so
// "did the deploy at 14:00 cause this" was unanswerable.
//
// Deliberately inert without SENTRY_DSN: local dev, CI and anyone running this
// without an account get exactly the previous behaviour (log and move on)
// rather than a hard dependency on a third-party service being reachable.
let enabled = false;

const initErrorTracking = (): void => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn(
      'SENTRY_DSN is not set — server errors are logged but not reported to an error tracker (MON-05).'
    );
    return;
  }

  Sentry.init({
    dsn,
    release: RELEASE,
    environment: process.env.NODE_ENV,
    // Traces are off by default: this is an error tracker first, and
    // performance sampling on every request costs money and request time.
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
    // PHI must never leave the system in a crash report. Request bodies can
    // hold prescriptions, diagnoses and patient names, so they are dropped
    // wholesale rather than filtered field by field. (PII attachment is off
    // by default in the SDK; beforeSend is what actually guarantees it.)
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
  enabled = true;
  logger.info({ release: RELEASE }, 'Sentry error tracking initialised');
};

// Report an error that was handled (so it never reaches an uncaught handler)
// but still needs to be seen — e.g. a 500 from the error middleware.
const captureError = (err: unknown, context?: Record<string, unknown>): void => {
  if (!enabled) return;
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
};

const flushErrorTracking = async (timeoutMs = 2000): Promise<void> => {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Shutdown is already in progress — a failed flush must not block it.
  }
};

const isErrorTrackingEnabled = (): boolean => enabled;

export { initErrorTracking, captureError, flushErrorTracking, isErrorTrackingEnabled };
