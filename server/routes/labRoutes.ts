import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { body } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import { create, getAll, getOne, uploadReport, createDirect, updateStatus, reject, setPrice, remove } from '../controllers/labController';
import { getAll as getMessages, create as createMessage } from '../controllers/labRequestMessagesController';
import { Request } from 'express';
import { uploadLimiter } from '../middleware/rateLimiter';
import { randomUploadName, verifyUploadSignature } from '../utils/uploadSecurity';
import validate from '../middleware/validate';

const router = Router();

const labReportsDir = path.join(__dirname, '../uploads/lab-reports');
if (!fs.existsSync(labReportsDir)) fs.mkdirSync(labReportsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: labReportsDir,
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, randomUploadName('lab', req.user?.id || 'u', ext));
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
    cb(null, randomUploadName('referral', req.user?.id || 'u', ext));
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

// PRO-06 / PRO-10: lab request create had no field-length checks at all.
const createValidators = [
  body('laboratory_id').isInt({ min: 1 }).withMessage('Laboratory selection is required'),
  body('patient_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('consultation_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('test_description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('report_type').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('scheduled_at').optional({ nullable: true }).isISO8601(),
  body('test_catalog_id').optional({ nullable: true }).isInt({ min: 1 }),
];
const createDirectValidators = [
  body('patient_id').isInt({ min: 1 }).withMessage('Patient is required'),
  body('doctor_id').isInt({ min: 1 }).withMessage('Doctor is required'),
  body('test_description').notEmpty().isString().isLength({ max: 2000 }),
  body('report_type').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('report_notes').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('sample_id').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('sample_collected_at').optional({ nullable: true }).isISO8601(),
];

router.get('/',    protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getAll);
router.get('/:id', protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getOne);
router.post('/',   protect, authorize('doctor', 'patient'), uploadLimiter, uploadReferral.single('referral'), verifyUploadSignature(), createValidators, validate, create);
router.post('/direct', protect, authorize('laboratory'), uploadLimiter, upload.single('report'), verifyUploadSignature({ required: true }), createDirectValidators, validate, createDirect);
router.patch('/:id/report',  protect, authorize('laboratory'), uploadLimiter, upload.single('report'), verifyUploadSignature({ required: true }), uploadReport);
router.patch('/:id/status',  protect, authorize('laboratory'), updateStatus);
router.patch('/:id/reject',  protect, authorize('laboratory'), reject);
router.patch('/:id/price',   protect, authorize('laboratory'), setPrice);
router.delete('/:id',        protect, authorize('doctor'),     remove);

router.get('/:id/messages',  protect, authorize('doctor', 'patient', 'laboratory'), getMessages);
router.post('/:id/messages', protect, authorize('doctor', 'patient', 'laboratory'), createMessage);

export default router;
