import 'dotenv/config';
import http from 'http';
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

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000');

const start = async (): Promise<void> => {
  await connectDB();
  server.listen(PORT, () =>
    console.log(`Core Health API + Socket.IO running on port ${PORT} [${process.env.NODE_ENV}]`)
  );
};

start();
