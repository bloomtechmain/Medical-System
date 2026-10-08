import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { body } from 'express-validator';
import { connectDB } from './config/db';
import { initSocket } from './config/socket';
import errorHandler from './middleware/errorHandler';
import validate from './middleware/validate';
import { generalApiLimiter, publicFormLimiter, searchLimiter } from './middleware/rateLimiter';

const app    = express();
const server = http.createServer(app);
initSocket(server);

// PRO-08: with no `trust proxy`, a rate limiter (or anything else reading
// req.ip) sees the proxy's address for every request once this runs behind
// one (Railway, any load balancer) — one shared bucket for every real visitor
// instead of one per visitor. TRUST_PROXY_HOPS lets this be tuned per
// deployment (default 1 hop, the common single-reverse-proxy case).
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

const ALLOWED_ORIGINS: (string | undefined)[] = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
    cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
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

// Ensure upload directories exist (Railway has ephemeral FS)
['uploads', 'uploads/prescriptions', 'uploads/lab-reports', 'uploads/lab-referrals', 'uploads/patient-reports'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// PRO-17: uploaded files (prescriptions, lab reports, patient reports — all
// potentially patient PHI) are public static content with no auth check and
// were served with no cache header at all. no-store is a safe, no-risk
// improvement; replacing direct static serving with an authenticated
// per-file endpoint is the real fix and is a larger change (every client
// page linking straight to `/uploads/...` would need to switch to an API
// call) — tracked as follow-up, not done here.
const noStoreUploads = express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
});
app.use('/uploads', noStoreUploads);
app.use('/uploads/lab-reports', noStoreUploads);

import { registerOrganization, searchOwnerCandidates, searchHospitalsClinics } from './controllers/organizationController';

const registerOrgValidators = [
  body('org_name').trim().notEmpty().isLength({ max: 200 }),
  body('slug').trim().matches(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/).withMessage('Slug must be lowercase letters, numbers and hyphens'),
  body('org_type').isIn(['hospital', 'pharmacy', 'laboratory', 'clinic']),
  body('owner_user_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('owner_name').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('owner_email').optional({ nullable: true }).isEmail().isLength({ max: 254 }).normalizeEmail(),
  body('owner_password').optional({ nullable: true }).isLength({ min: 6, max: 128 }),
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
