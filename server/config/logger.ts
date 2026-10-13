import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import pinoHttp from 'pino-http';

// MON-10: logs were plain `console.log`/`console.error` lines with no request
// log at all and no request ID, so a user-reported error could not be tied to
// the requests around it. pino emits one JSON object per line — the shape
// CloudWatch Logs Insights (the AWS target) can actually query on, instead of
// substring-matching free text.
//
// MON-05: every log line carries the release (the commit ID) so a spike can be
// attributed to a specific deploy. Same value Sentry is tagged with.
const RELEASE = process.env.GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.owner_password',
  'req.body.refreshToken',
  'req.body.token',
  'req.body.totp',
  'res.headers["set-cookie"]',
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { release: RELEASE, service: 'corehealth-api' },
  // Health/readiness probes hit every few seconds; logging them at info would
  // bury real traffic. They are still logged at debug outside production.
  redact: { paths: redactPaths, censor: '[redacted]' },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

const REQUEST_ID_HEADER = 'x-request-id';

// MON-06: a request ID that the client can read off the response and quote in
// a bug report. An inbound value is honoured (so a future ALB/CloudFront trace
// ID survives), otherwise one is generated.
const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const existing = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  // Probe endpoints are noise at info level — the platform calls them
  // continuously. Everything else keeps its normal level.
  customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (req.url === '/api/health' || req.url === '/api/ready') return 'debug';
    return 'info';
  },
  customProps: (req: IncomingMessage) => {
    // The authenticated user, when `protect` has already run. Makes "what did
    // this user do" answerable without joining against the audit log.
    const user = (req as IncomingMessage & { user?: { id?: number; role?: string } }).user;
    return user ? { userId: user.id, userRole: user.role } : {};
  },
  redact: { paths: redactPaths, censor: '[redacted]' },
});

export { logger, httpLogger, RELEASE, REQUEST_ID_HEADER };
