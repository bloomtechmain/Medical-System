import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, uploadReport, updateStatus, remove } from '../controllers/labController';
import { Request } from 'express';

const router = Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/lab-reports'),
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

router.get('/',    protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getAll);
router.get('/:id', protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getOne);
router.post('/',   protect, authorize('doctor', 'patient'), create);
router.patch('/:id/report',  protect, authorize('laboratory'), upload.single('report'), uploadReport);
router.patch('/:id/status',  protect, authorize('laboratory'), updateStatus);
router.delete('/:id',        protect, authorize('doctor'),     remove);

export default router;
