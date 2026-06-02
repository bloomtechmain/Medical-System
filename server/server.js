require('dotenv').config();

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { connectDB }   = require('./config/db');
const { initSocket }  = require('./config/socket');
const errorHandler    = require('./middleware/errorHandler');

const app    = express();
const server = http.createServer(app);
initSocket(server);

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Explicit route for lab reports so PDFs are served with correct content-type
app.use('/uploads/lab-reports', express.static(path.join(__dirname, 'uploads/lab-reports')));

app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/users',         require('./routes/userRoutes'));
app.use('/api/consultations', require('./routes/consultationRoutes'));
app.use('/api/lab-requests',  require('./routes/labRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/medicines',     require('./routes/medicineRoutes'));
app.use('/api/suppliers',     require('./routes/supplierRoutes'));
app.use('/api/orders',        require('./routes/orderRoutes'));
app.use('/api/sales',         require('./routes/saleRoutes'));
app.use('/api/inventory',       require('./routes/inventoryRoutes'));
app.use('/api/patient-reports',   require('./routes/patientReportRoutes'));
app.use('/api/access-requests',     require('./routes/accessRequestRoutes'));
app.use('/api/lab-view-requests',   require('./routes/labViewRequestRoutes'));

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  server.listen(PORT, () =>
    console.log(`Core Health API + Socket.IO running on port ${PORT} [${process.env.NODE_ENV}]`)
  );
};

start();
