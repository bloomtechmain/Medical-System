import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { create, update, updateByPatient, getAll, getOne, updateStatus, getPatientHistory, remove } from '../controllers/consultationController';
import { protect, authorize } from '../middleware/auth';
import { Request } from 'express';

const router = Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/prescriptions'),
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `rx_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only image files are accepted'));
  },
});

router.get('/patient/:patientId/history', protect, authorize('doctor', 'admin'), getPatientHistory);
router.get('/',        protect, authorize('patient', 'doctor', 'pharmacist'), getAll);
router.get('/:id',     protect, authorize('patient', 'doctor', 'pharmacist'), getOne);
router.post('/',       protect, authorize('patient', 'doctor'), upload.single('prescription'), create);
router.put('/:id',          protect, authorize('doctor'),  upload.single('prescription'), update);
router.put('/:id/patient',  protect, authorize('patient'), updateByPatient);
router.patch('/:id/status', protect, authorize('pharmacist'), updateStatus);
router.delete('/:id',       protect, authorize('patient', 'doctor'), remove);

export default router;
