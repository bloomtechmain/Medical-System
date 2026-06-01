const router = require('express').Router();
const { getAll, getOne, create } = require('../controllers/saleController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', create);

module.exports = router;
