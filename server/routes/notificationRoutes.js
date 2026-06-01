const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getAll, markRead, markAllRead } = require('../controllers/notificationController');

router.use(protect);
router.get('/',              getAll);
router.patch('/read-all',   markAllRead);
router.patch('/:id/read',   markRead);

module.exports = router;
