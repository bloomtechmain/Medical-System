import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { create, update, updateByPatient, getAll, getOne, getPatientHistory, remove } from '../controllers/consultationController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

// Memory storage: the controller persists the buffer via config/fileStorage
// (S3 if AWS_S3_BUCKET is set, local disk otherwise) — ARCH-06.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only image files are accepted'));
  },
});

router.get('/patient/:patientId/history', protect, authorize('doctor', 'admin'), getPatientHistory);
router.get('/',        protect, authorize('patient', 'doctor'), getAll);
router.get('/:id',     protect, authorize('patient', 'doctor'), getOne);
router.post('/',       protect, authorize('patient', 'doctor'), upload.single('prescription'), create);
router.put('/:id',                  protect, authorize('doctor'),      upload.single('prescription'), update);
router.put('/:id/patient',          protect, authorize('patient'),     updateByPatient);
router.delete('/:id',               protect, authorize('patient', 'doctor'), remove);

export default router;
