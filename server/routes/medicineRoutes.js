const router = require('express').Router();
const { getAll, getOne, create, update, remove } = require('../controllers/medicineController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), create);
router.put('/:id', authorize('admin', 'pharmacist'), update);
router.delete('/:id', authorize('admin'), remove);

module.exports = router;
