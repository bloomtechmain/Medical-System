import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { connectDB } from './config/db';
import { initSocket } from './config/socket';
import { ALLOWED_ORIGINS } from './config/corsOrigins';
import { sendStoredFile } from './config/fileStorage';
import { registerLimiter, publicSearchLimiter } from './middleware/rateLimit';
import errorHandler from './middleware/errorHandler';

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
// SEC-22: trust the first hop's X-Forwarded-For (Railway today, the ALB on
// AWS later) so rate limiting below counts the real client IP, not the
// proxy's — without this every request looks like it comes from one IP.
app.set('trust proxy', 1);
const server = http.createServer(app);
initSocket(server);

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serves uploaded files from S3 (redirect to a short-lived signed URL) or
// local disk, whichever config/fileStorage is currently configured for
// (ARCH-06) — same URL shape as the old express.static mounts this replaces,
// so none of the client's existing /uploads/<subdir>/<file> links needed to
// change.
app.get('/uploads/:subdir/:filename', (req, res) => {
  sendStoredFile(res, req.params.subdir, req.params.filename);
});

import { registerOrganization, searchOwnerCandidates, searchHospitalsClinics } from './controllers/organizationController';
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
app.post('/api/organizations/register', registerLimiter, registerOrganization);
app.get('/api/organizations/search-owner', publicSearchLimiter, searchOwnerCandidates);
app.get('/api/organizations/search-hospitals-clinics', publicSearchLimiter, searchHospitalsClinics);
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
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000');

const start = async (): Promise<void> => {
  // Listen first — Railway health check can reach /api/health while DB connects
  await new Promise<void>(resolve => server.listen(PORT, resolve));
  console.log(`Core Health API + Socket.IO running on port ${PORT} [${process.env.NODE_ENV}]`);
  await connectDB();
};

start();
