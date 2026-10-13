import { Request, Response, NextFunction } from 'express';
import { captureError } from '../config/errorTracking';

interface AppError extends Error {
  status?: number;
}

// SEC-21: a 500 means something unexpected happened — the error message at
// that point is whatever the underlying library/driver produced (often raw
// database error text), never written for a client to see. Log it fully
// server-side, return a generic message instead. A deliberately-set status
// (4xx, thrown by the app's own code with an intentional message) is a
// different case — those messages are safe and meant to reach the client.
const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const status = err.status || 500;

  // MON-10: pino-http attaches a per-request logger carrying the request ID,
  // method, path and (once `protect` has run) the user — so the error line
  // can be joined to the request log instead of being a free-floating string.
  // req.log is always present because httpLogger is mounted before the routes.
  const log = req.log;
  if (status >= 500) {
    log.error({ err, status }, 'Unhandled request error');
  } else {
    log.warn({ err: { message: err.message }, status }, 'Request rejected');
  }

  // MON-05: only genuine 500s go to the error tracker. Reporting deliberate
  // 4xx responses (a failed login, a validation error) would bury the real
  // failures under thousands of working-as-intended events.
  if (status >= 500) {
    captureError(err, {
      requestId: req.id,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
  }

  const clientMessage = status === 500 ? 'Internal server error' : (err.message || 'Internal server error');

  res.status(status).json({
    message: clientMessage,
    // Gives a user something to quote in a bug report, and us something to
    // grep the logs for. Safe to expose: it is a random UUID, not a secret.
    requestId: req.id,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
