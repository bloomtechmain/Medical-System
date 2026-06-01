const router = require('express').Router();
const { getSummary, getLowStock, getExpiring } = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/summary', getSummary);
router.get('/low-stock', getLowStock);
router.get('/expiring', getExpiring);

module.exports = router;
