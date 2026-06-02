const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { protect, authorize } = require('../middleware/auth');
const {
  create, getAll, getOne, serveFile, remove,
} = require('../controllers/patientReportController');

const uploadDir = path.join(__dirname, '../uploads/patient-reports');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `pr_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

router.get('/',          protect, authorize('patient'), getAll);
router.get('/:id',       protect, authorize('patient'), getOne);
router.get('/:id/file',  protect, authorize('patient'), serveFile);
router.post('/',         protect, authorize('patient'), upload.single('file'), create);
router.delete('/:id',    protect, authorize('patient'), remove);

module.exports = router;
