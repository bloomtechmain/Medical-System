const router = require('express').Router();
const path   = require('path');
const multer = require('multer');
const { create, update, getAll, getOne, updateStatus, getPatientHistory, remove } = require('../controllers/consultationController');
const { protect, authorize } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/prescriptions'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `rx_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only image files are accepted'));
  },
});

router.get('/patient/:patientId/history', protect, authorize('doctor', 'admin'), getPatientHistory);
router.get('/',        protect, authorize('patient', 'doctor', 'pharmacist'), getAll);
router.get('/:id',     protect, authorize('patient', 'doctor', 'pharmacist'), getOne);
router.post('/',       protect, authorize('patient', 'doctor'), upload.single('prescription'), create);
router.put('/:id',          protect, authorize('doctor'), upload.single('prescription'), update);
router.patch('/:id/status', protect, authorize('pharmacist'), updateStatus);
router.delete('/:id',       protect, authorize('patient', 'doctor'), remove);

module.exports = router;
