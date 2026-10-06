import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, uploadReport, createDirect, updateStatus, reject, setPrice, remove } from '../controllers/labController';
import { getAll as getMessages, create as createMessage } from '../controllers/labRequestMessagesController';

const router = Router();

// Memory storage: the controller persists the buffer via config/fileStorage
// (S3 if AWS_S3_BUCKET is set, local disk otherwise) — ARCH-06.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

// Optional doctor's prescription/referral slip, attached when a patient self-books a test
const uploadReferral = multer({
  storage: multer.memoryStorage(),
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
router.patch('/:id/reject',  protect, authorize('laboratory'), reject);
router.patch('/:id/price',   protect, authorize('laboratory'), setPrice);
router.delete('/:id',        protect, authorize('doctor'),     remove);

router.get('/:id/messages',  protect, authorize('doctor', 'patient', 'laboratory'), getMessages);
router.post('/:id/messages', protect, authorize('doctor', 'patient', 'laboratory'), createMessage);

export default router;
