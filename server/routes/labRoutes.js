const router  = require('express').Router();
const path    = require('path');
const multer  = require('multer');
const { protect, authorize } = require('../middleware/auth');
const { create, getAll, getOne, uploadReport, updateStatus, remove } = require('../controllers/labController');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/lab-reports'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `lab_${req.user?.id || 'u'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Only PDF and image files are accepted'));
  },
});

router.get('/',    protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getAll);
router.get('/:id', protect, authorize('doctor', 'patient', 'laboratory', 'admin'), getOne);
router.post('/',   protect, authorize('doctor'), create);
router.patch('/:id/report',  protect, authorize('laboratory'), upload.single('report'), uploadReport);
router.patch('/:id/status',  protect, authorize('laboratory'), updateStatus);
router.delete('/:id',        protect, authorize('doctor'),     remove);

module.exports = router;
