import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, serveFile, serveFileForDoctor, remove } from '../controllers/patientReportController';

const router = Router();

// Memory storage: the controller persists the buffer via config/fileStorage
// (S3 if AWS_S3_BUCKET is set, local disk otherwise) — ARCH-06.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

router.get('/',                   protect, authorize('patient'), getAll);
router.get('/:id',                protect, authorize('patient'), getOne);
router.get('/:id/file',           protect, authorize('patient'), serveFile);
router.get('/:id/doctor-file',    protect, authorize('doctor'),  serveFileForDoctor);
router.post('/',                  protect, authorize('patient'), upload.single('file'), create);
router.delete('/:id',             protect, authorize('patient'), remove);

export default router;
