const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { createRequest, respond, getAll, serveFile } = require('../controllers/labViewRequestController');

router.get('/',                protect, authorize('doctor', 'patient'), getAll);
router.post('/',               protect, authorize('doctor'),            createRequest);
router.patch('/:id/respond',   protect, authorize('patient'),           respond);
router.get('/:id/file',        protect, authorize('doctor'),            serveFile);

module.exports = router;
