import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, uploadReport, createDirect, updateStatus, remove } from '../controllers/labController';
import { Request } from 'express';

const router = Router();

const labReportsDir = path.join(__dirname, '../uploads/lab-reports');
if (!fs.existsSync(labReportsDir)) fs.mkdirSync(labReportsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: labReportsDir,
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `lab_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

// Optional doctor's prescription/referral slip, attached when a patient self-books a test
const labReferralsDir = path.join(__dirname, '../uploads/lab-referrals');
if (!fs.existsSync(labReferralsDir)) fs.mkdirSync(labReferralsDir, { recursive: true });

const referralStorage = multer.diskStorage({
  destination: labReferralsDir,
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `referral_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const uploadReferral = multer({
  storage: referralStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

router.get('/',    protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getAll);
router.get('/:id', protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getOne);
router.post('/',   protect, authorize('doctor', 'patient'), uploadReferral.single('referral'), create);
router.post('/direct', protect, authorize('laboratory'), upload.single('report'), createDirect);
router.patch('/:id/report',  protect, authorize('laboratory'), upload.single('report'), uploadReport);
router.patch('/:id/status',  protect, authorize('laboratory'), updateStatus);
router.delete('/:id',        protect, authorize('doctor'),     remove);

export default router;
