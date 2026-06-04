import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { connectDB } from './config/db';
import { initSocket } from './config/socket';
import errorHandler from './middleware/errorHandler';

const app    = express();
const server = http.createServer(app);
initSocket(server);

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

// Ensure upload directories exist (Railway has ephemeral FS)
['uploads', 'uploads/prescriptions', 'uploads/lab-reports', 'uploads/patient-reports'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/lab-reports', express.static(path.join(__dirname, 'uploads/lab-reports')));

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

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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
