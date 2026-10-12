import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, serveFile, serveFileForDoctor, remove } from '../controllers/patientReportController';
import { uploadLimiter } from '../middleware/rateLimiter';
import { verifyUploadSignature } from '../utils/uploadSecurity';
import { createUploadStorage } from '../utils/fileStorage';

const router = Router();

const upload = multer({
  storage: createUploadStorage('patient-reports', 'pr'),
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
router.post('/',                  protect, authorize('patient'), uploadLimiter, upload.single('file'), verifyUploadSignature({ required: true }), create);
router.delete('/:id',             protect, authorize('patient'), remove);

export default router;
