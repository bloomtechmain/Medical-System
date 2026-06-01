const router = require('express').Router();
const { getAll, getOne, create, receive } = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), create);
router.patch('/:id/receive', authorize('admin', 'pharmacist'), receive);

module.exports = router;
