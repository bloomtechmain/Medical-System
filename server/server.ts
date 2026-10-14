import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { body } from 'express-validator';
import { connectDB, pool } from './config/db';
import { initSocket } from './config/socket';
import { ALLOWED_ORIGINS } from './config/corsOrigins';
import { logger, httpLogger } from './config/logger';
import { isEnabled, logFlagState } from './config/featureFlags';
import { initErrorTracking } from './config/errorTracking';
import { registerLifecycle, isShuttingDown } from './config/lifecycle';
import { verifySchema } from './config/schemaCheck';
import errorHandler from './middleware/errorHandler';
import validate from './middleware/validate';
import { generalApiLimiter, publicFormLimiter, searchLimiter } from './middleware/rateLimiter';
import { isS3Enabled } from './utils/fileStorage';
import { startQueue, shouldRegisterWorkersHere, QUEUE_WORKER_MODE } from './queue/boss';
import { register as registerLabReportVitalsWorker } from './queue/jobs/extractLabReportVitals';
import { register as registerPatientReportVitalsWorker } from './queue/jobs/extractPatientReportVitals';
import { register as registerConsultationOcrWorker } from './queue/jobs/extractConsultationMedicines';

// Fail fast with a clear message instead of starting in a broken state
// (ARCH-04) — e.g. a missing JWT_SECRET would otherwise only surface later,
// confusingly, the first time someone tries to log in.
const requireEnv = (names: string[]): void => {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }
};
// SEC-21: an unset NODE_ENV previously meant stack traces and raw error
// detail went to the client by default (errorHandler.ts's check only hides
// them when NODE_ENV === 'production', so "unset" silently behaved like
// development in production). Require it explicitly instead of assuming.
const VALID_NODE_ENVS = ['development', 'production', 'test'];
if (!VALID_NODE_ENVS.includes(process.env.NODE_ENV || '')) {
  console.error(`NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')} (got: ${process.env.NODE_ENV || '<unset>'})`);
  process.exit(1);
}

requireEnv(['JWT_SECRET']);
requireEnv(process.env.DATABASE_URL ? [] : ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);
if (process.env.NODE_ENV === 'production') requireEnv(['CLIENT_URL']);

// MON-05: start the error tracker before anything else can throw.
initErrorTracking();

const app    = express();
app.disable('x-powered-by'); // SEC-21: don't advertise the framework/version
const server = http.createServer(app);
initSocket(server);

// INF-05: no timeouts were set anywhere on the HTTP server. A client that
// opens a connection and sends headers slowly (or never finishes a body) held
// a connection and a request slot indefinitely — the cheapest possible way to
// exhaust a small instance. These are the outermost timeouts: they must stay
// *longer* than the database statement timeout (5s) and the OCR job limit, so
// an inner operation fails with its own specific error rather than having the
// whole request yanked out from under it.
server.requestTimeout = parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS || '30000', 10);
server.headersTimeout = parseInt(process.env.HTTP_HEADERS_TIMEOUT_MS || '35000', 10);
server.keepAliveTimeout = parseInt(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || '65000', 10);

// PRO-08: with no `trust proxy`, a rate limiter (or anything else reading
// req.ip) sees the proxy's address for every request once this runs behind
// one (Railway, any load balancer) — one shared bucket for every real visitor
// instead of one per visitor. TRUST_PROXY_HOPS lets this be tuned per
// deployment (default 1 hop, the common single-reverse-proxy case).
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

// SEC-20: no security headers at all previously (HSTS, nosniff, frame
// options, CSP). This server is mostly a JSON API — CSP has no real effect
// there — but it also serves the built client as a fallback (see
// `clientDist` below), where it matters for real. The CSP intentionally
// stays broad on connect-src/img-src rather than pinning this build to one
// backend domain, matching the same "one image, any environment" goal as
// the runtime config.js (ARCH-04) — a stricter, environment-specific CSP
// is set on the client's own static hosting instead (client/public/serve.json).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
    },
  },
}));

// MON-10/MON-06: structured request log + a request ID echoed back in the
// x-request-id response header. Mounted before the routes so every request is
// logged even if it never matches one.
app.use(httpLogger);

app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
    cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
// PERF-03: the API had no response compression at all — every JSON payload
// (a sales/consultations/lab-requests list, especially once PERF-04's
// generous pagination defaults are in play) went over the wire uncompressed.
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PRO-08: app-wide ceiling against outright abuse. Narrower, endpoint-specific
// limiters (login lockout, search, uploads, public registration) are applied
// in their own routers on top of this.
app.use('/api', generalApiLimiter);

// PRO-17: every /api response can carry patient data — make sure no
// intermediary (browser back/forward cache, a shared proxy) ever caches it.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// PRO-05: on AWS (ECS Fargate, the actual deploy target), each task has its
// own ephemeral filesystem — a file written to local disk by one task is
// invisible to every other task and gone on the next deploy. When
// AWS_S3_BUCKET is set, uploads go to S3 instead (see utils/fileStorage.ts)
// and there is no local uploads directory to serve or create. When it's
// unset (local dev, CI), behaviour is exactly what it was before.
if (!isS3Enabled()) {
  ['uploads', 'uploads/prescriptions', 'uploads/lab-reports', 'uploads/lab-referrals', 'uploads/patient-reports'].forEach(dir => {
    const p = path.join(__dirname, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

// SEC-28: the old /uploads/:subdir/:filename route (both the S3 streaming
// variant and the local express.static mount) served any file — prescriptions,
// lab reports, patient reports, all potentially PHI — to anyone with no login
// check at all, with guessable-ish filenames. Removed entirely. Files are now
// only reachable through authenticated, ownership-checked routes: GET
// /api/consultations/:id/prescription-file, GET /api/lab-requests/:id/report-file,
// GET /api/lab-requests/:id/referral-file, GET /api/patient-reports/:id/file,
// plus the pre-existing access-requests/lab-view-requests equivalents.

import { registerOrganization, searchOwnerCandidates, searchHospitalsClinics } from './controllers/organizationController';

const registerOrgValidators = [
  body('org_name').trim().notEmpty().isLength({ max: 200 }),
  body('slug').trim().matches(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/).withMessage('Slug must be lowercase letters, numbers and hyphens'),
  body('org_type').isIn(['hospital', 'pharmacy', 'laboratory', 'clinic']),
  body('owner_user_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('owner_name').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('owner_email').optional({ nullable: true }).isEmail().isLength({ max: 254 }).normalizeEmail(),
  body('owner_password').optional({ nullable: true }).isLength({ min: 10, max: 128 }),
  body('specializations').optional({ nullable: true }).isArray({ max: 30 }),
  body('specializations.*').optional().isString().isLength({ max: 100 }),
  // COMP-02: a version string, not free text — bounded so it cannot be used
  // to write arbitrary content into the users table.
  body('accepted_terms_version').optional({ nullable: true }).isString().isLength({ max: 40 }),
];
import organizationTeamRoutes from './routes/organizationTeamRoutes';
import authRoutes            from './routes/authRoutes';
import userRoutes            from './routes/userRoutes';
import consultationRoutes    from './routes/consultationRoutes';
import labRoutes             from './routes/labRoutes';
import notificationRoutes    from './routes/notificationRoutes';
import medicineRoutes        from './routes/medicineRoutes';
import supplierRoutes        from './routes/supplierRoutes';
import orderRoutes           from './routes/orderRoutes';
import saleRoutes            from './routes/saleRoutes';
import inventoryRoutes       from './routes/inventoryRoutes';
import patientReportRoutes   from './routes/patientReportRoutes';
import accessRequestRoutes   from './routes/accessRequestRoutes';
import labViewRequestRoutes  from './routes/labViewRequestRoutes';
import patientVitalsRoutes   from './routes/patientVitalsRoutes';
import organizationRoutes    from './routes/organizationRoutes';
import appointmentRoutes     from './routes/appointmentRoutes';
import labCatalogRoutes      from './routes/labCatalogRoutes';
import metricsRoutes         from './routes/metricsRoutes';
import dataExportRoutes     from './routes/dataExportRoutes';
import prescriptionAssignmentRoutes from './routes/prescriptionAssignmentRoutes';

app.use('/api/auth',              authRoutes);
app.use('/api/users',             userRoutes);
app.use('/api/consultations',     consultationRoutes);
app.use('/api/lab-requests',      labRoutes);
app.use('/api/notifications',     notificationRoutes);
app.use('/api/medicines',         medicineRoutes);
app.use('/api/suppliers',         supplierRoutes);
app.use('/api/orders',            orderRoutes);
app.use('/api/sales',             saleRoutes);
app.use('/api/inventory',         inventoryRoutes);
app.use('/api/patient-reports',   patientReportRoutes);
app.use('/api/access-requests',   accessRequestRoutes);
app.use('/api/lab-view-requests', labViewRequestRoutes);
app.use('/api/patient-vitals',    patientVitalsRoutes);
app.use('/api/appointments',      appointmentRoutes);
app.use('/api/lab-catalog',       labCatalogRoutes);
app.use('/api/metrics',           metricsRoutes);
app.use('/api/data-export',       dataExportRoutes);
app.use('/api/prescription-assignments', prescriptionAssignmentRoutes);
// Public self-registration — mounted before the admin-gated organizations router
// so it is never touched by the protect/authorize middleware.
// PRO-06 point 5 / PRO-10: public self-registration had no checks on email
// format, password length, or slug format at all. PRO-11 / PRO-08: this and
// the two public search endpoints below needed no login and had no rate
// limit — publicFormLimiter/searchLimiter close that.
// CICD-12: the most expensive unauthenticated endpoint in the system — it
// creates a database schema and a role per request (PRO-11). Rate-limited,
// but this flag is the one that closes it outright under abuse, without a
// deploy. 503 rather than 404: the endpoint exists and is temporarily off.
app.post('/api/organizations/register', publicFormLimiter, (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!isEnabled('PUBLIC_ORG_REGISTRATION')) {
    res.status(503).json({ message: 'Organisation self-registration is temporarily unavailable. Please contact support.' });
    return;
  }
  next();
}, registerOrgValidators, validate, registerOrganization);
app.get('/api/organizations/search-owner', searchLimiter, searchOwnerCandidates);
app.get('/api/organizations/search-hospitals-clinics', searchLimiter, searchHospitalsClinics);
app.use('/api/org-team', organizationTeamRoutes);
app.use('/api/organizations',     organizationRoutes);

// Liveness: "this process is running and the event loop is not wedged." It
// must NOT touch the database — a liveness probe that fails on a database
// blip would make the platform restart a perfectly healthy process, which
// never fixes a database problem and turns a brief outage into a crash loop.
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// INF-02/INF-03: previously there was only the liveness endpoint above, and
// the platform health check pointed at it — so an instance whose database
// connection was broken reported healthy and kept receiving traffic, and
// (because the server listens before connecting, deliberately, so a slow
// database doesn't fail the deploy) a brand-new instance passed its check
// before it could serve a single real request.
//
// Readiness answers the different question "should this instance receive
// traffic right now": it checks the database with a short, explicit timeout
// and returns 503 when the answer is no. During shutdown it reports 503
// immediately, which is what lets a load balancer take the instance out of
// rotation before the graceful-shutdown drain begins.
app.get('/api/ready', async (_req, res) => {
  if (isShuttingDown()) {
    res.status(503).json({ status: 'shutting_down' });
    return;
  }
  const client = await pool.connect().catch(() => null);
  if (!client) {
    res.status(503).json({ status: 'unavailable', check: 'db_pool' });
    return;
  }
  try {
    // Deliberately shorter than the pool-wide statement timeout: a readiness
    // probe should fail fast rather than queue behind a struggling database.
    // Wrapped in a transaction because SET LOCAL only applies inside one —
    // outside, it is silently a no-op, and a plain SET would follow this
    // connection back into the pool and shorten an unrelated request's budget.
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 2000');
    await client.query('SELECT 1');
    await client.query('COMMIT');
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.warn({ err }, 'Readiness check failed');
    res.status(503).json({ status: 'unavailable', check: 'db_query' });
  } finally {
    client.release();
  }
});

app.get('/', (_req, res) =>
  res.json({ status: 'ok', service: 'BloomRx API', health: '/api/health' })
);

// Serve the built React app. Candidate paths cover both Dockerfile layouts.
const clientDist = [
  path.join(process.cwd(), 'client', 'dist'),   // /app/client/dist  (primary)
  path.join(__dirname, '../client', 'dist'),      // /app/dist → /app/client/dist
  path.join(__dirname, '../../client', 'dist'),   // /app/server/dist → /app/client/dist
].find(p => fs.existsSync(path.join(p, 'index.html')));

logger.info({ clientDist: clientDist ?? null }, 'Resolved client/dist path');

if (clientDist) {
  app.use(express.static(clientDist));
  // Express 5 (path-to-regexp v8) rejects a bare '*' path — it has to be a
  // *named* wildcard. Same SPA fallback as before, new spelling.
  //
  // generalApiLimiter: this is an unauthenticated handler that touches the
  // filesystem on every request, and unlike /api it had no limit at all
  // (flagged by CodeQL as js/missing-rate-limiting). It only ever serves one
  // fixed file, so the ceiling is generous enough to be invisible to real
  // navigation — static assets are served by express.static above and never
  // reach here.
  app.get('/*splat', generalApiLimiter, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000');

const start = async (): Promise<void> => {
  // Listen first — the liveness check can reach /api/health while the DB
  // connects. /api/ready stays 503 until the connection is actually up
  // (INF-02), which is what the platform health check now watches.
  await new Promise<void>(resolve => server.listen(PORT, resolve));
  logger.info(
    { port: PORT, env: process.env.NODE_ENV },
    'Core Health API + Socket.IO listening'
  );
  // So a log line always answers "which flags were on for this deploy" — a
  // flag-dependent bug is otherwise unreproducible after the fact.
  logFlagState();
  await connectDB();

  // Before anything serves a request: confirm the database actually has the
  // columns and tables this build reads. A missing column reads as undefined
  // rather than throwing, so without this check a database that is behind the
  // code starts up and then refuses every login with a misleading message.
  await verifySchema();

  // PERF-06: start the job queue and register this process as a worker for
  // the OCR/PDF-extraction jobs. Running the worker in the same process as
  // the API is a reasonable first step — it already gets real retries and a
  // queryable failed state instead of setImmediate's "lost on restart, no
  // retry" — and can move to a separate worker process later with no job
  // code changes, since pg-boss doesn't care which process calls boss.work().
  // Always started: enqueueing needs pg-boss even when nothing is processed
  // here.
  await startQueue();

  // PRO-15: with QUEUE_WORKER_MODE=separate the OCR/extraction jobs are
  // handled by server/worker.ts in its own process, so this one must NOT
  // register for them — otherwise both compete for the same jobs and the
  // memory isolation the split exists for is lost.
  if (shouldRegisterWorkersHere('api')) {
    await registerLabReportVitalsWorker();
    await registerPatientReportVitalsWorker();
    await registerConsultationOcrWorker();
    logger.info({ queueWorkerMode: QUEUE_WORKER_MODE }, 'Queue workers registered in the API process');
  } else {
    logger.info(
      { queueWorkerMode: QUEUE_WORKER_MODE },
      'Queue workers NOT registered here — expecting a separate worker process (server/worker.ts)'
    );
  }
};

// INF-04/INF-06: graceful shutdown (drain HTTP, close sockets, stop the
// queue, end the pool, hard deadline) and process-level crash handlers now
// live in config/lifecycle.ts. Registered before start() so a crash during
// startup is still reported rather than vanishing.
registerLifecycle(server);

start();
