import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { body } from 'express-validator';
import { create, update, updateByPatient, getAll, getOne, getPatientHistory, remove } from '../controllers/consultationController';
import { protect, authorize } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
import { verifyUploadSignature } from '../utils/uploadSecurity';
import { createUploadStorage } from '../utils/fileStorage';
import validate from '../middleware/validate';

const router = Router();

const upload = multer({
  storage: createUploadStorage('prescriptions', 'rx'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only image files are accepted'));
  },
});

// PRO-06 / PRO-10: consultation create had no field-length checks at all.
const createValidators = [
  body('visit_date').notEmpty().isISO8601().withMessage('A valid visit date is required'),
  body('patient_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('doctor_name').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('hospital_clinic').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('sick_description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('diagnosis').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('treatment_description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('lab_tests_requested').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('manual_medicines').optional({ nullable: true }).isString().isLength({ max: 20000 }),
];

router.get('/patient/:patientId/history', protect, authorize('doctor', 'admin'), getPatientHistory);
router.get('/',        protect, authorize('patient', 'doctor'), getAll);
router.get('/:id',     protect, authorize('patient', 'doctor'), getOne);
router.post('/',       protect, authorize('patient', 'doctor'), uploadLimiter, upload.single('prescription'), verifyUploadSignature(), createValidators, validate, create);
router.put('/:id',                  protect, authorize('doctor'),      uploadLimiter, upload.single('prescription'), verifyUploadSignature(), update);
router.put('/:id/patient',          protect, authorize('patient'),     updateByPatient);
router.delete('/:id',               protect, authorize('patient', 'doctor'), remove);

export default router;
