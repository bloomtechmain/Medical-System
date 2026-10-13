import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { body } from 'express-validator';
import { connectDB } from './config/db';
import { initSocket } from './config/socket';
import { ALLOWED_ORIGINS } from './config/corsOrigins';
import errorHandler from './middleware/errorHandler';
import validate from './middleware/validate';
import { generalApiLimiter, publicFormLimiter, searchLimiter } from './middleware/rateLimiter';
import { isS3Enabled, streamUploadToResponse } from './utils/fileStorage';
import { startQueue, stopQueue } from './queue/boss';
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

const app    = express();
app.disable('x-powered-by'); // SEC-21: don't advertise the framework/version
const server = http.createServer(app);
initSocket(server);

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
app.use('/api/prescription-assignments', prescriptionAssignmentRoutes);
// Public self-registration — mounted before the admin-gated organizations router
// so it is never touched by the protect/authorize middleware.
// PRO-06 point 5 / PRO-10: public self-registration had no checks on email
// format, password length, or slug format at all. PRO-11 / PRO-08: this and
// the two public search endpoints below needed no login and had no rate
// limit — publicFormLimiter/searchLimiter close that.
app.post('/api/organizations/register', publicFormLimiter, registerOrgValidators, validate, registerOrganization);
app.get('/api/organizations/search-owner', searchLimiter, searchOwnerCandidates);
app.get('/api/organizations/search-hospitals-clinics', searchLimiter, searchHospitalsClinics);
app.use('/api/org-team', organizationTeamRoutes);
app.use('/api/organizations',     organizationRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.get('/', (_req, res) =>
  res.json({ status: 'ok', service: 'BloomRx API', health: '/api/health' })
);

// Serve the built React app. Candidate paths cover both Dockerfile layouts.
const clientDist = [
  path.join(process.cwd(), 'client', 'dist'),   // /app/client/dist  (primary)
  path.join(__dirname, '../client', 'dist'),      // /app/dist → /app/client/dist
  path.join(__dirname, '../../client', 'dist'),   // /app/server/dist → /app/client/dist
].find(p => fs.existsSync(path.join(p, 'index.html')));

console.log(`[boot] client/dist: ${clientDist ?? 'NOT FOUND'}`);

if (clientDist) {
  app.use(express.static(clientDist));
  // Express 5 (path-to-regexp v8) rejects a bare '*' path — it has to be a
  // *named* wildcard. Same SPA fallback as before, new spelling.
  app.get('/*splat', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000');

const start = async (): Promise<void> => {
  // Listen first — Railway health check can reach /api/health while DB connects
  await new Promise<void>(resolve => server.listen(PORT, resolve));
  console.log(`Core Health API + Socket.IO running on port ${PORT} [${process.env.NODE_ENV}]`);
  await connectDB();

  // PERF-06: start the job queue and register this process as a worker for
  // the OCR/PDF-extraction jobs. Running the worker in the same process as
  // the API is a reasonable first step — it already gets real retries and a
  // queryable failed state instead of setImmediate's "lost on restart, no
  // retry" — and can move to a separate worker process later with no job
  // code changes, since pg-boss doesn't care which process calls boss.work().
  await startQueue();
  await registerLabReportVitalsWorker();
  await registerPatientReportVitalsWorker();
  await registerConsultationOcrWorker();
};

start();

// Let in-flight jobs finish and the queue disconnect cleanly instead of
// being killed mid-job on every deploy/restart.
const shutdown = async (): Promise<void> => {
  await stopQueue();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
