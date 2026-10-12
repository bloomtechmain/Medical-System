import { Router } from 'express';
import { body } from 'express-validator';
import { getAll, getOne, create, getAnalytics } from '../controllers/saleController';
import { protect } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

router.use(protect);

// PRO-06 / PRO-10: `items` was unvalidated — missing/non-array gave a raw
// 500, a negative quantity passed the stock check and produced a negative
// total while increasing stock. unit_price is still accepted here for shape
// validation only — saleController.create ignores it and prices from the
// database (see PRO-06 point 1).
const createValidators = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('items must be a non-empty array (max 100 lines)'),
  body('items.*.medicine_id').isInt({ min: 1 }).withMessage('Each item needs a valid medicine_id'),
  body('items.*.quantity').isInt({ min: 1, max: 100000 }).withMessage('Each item needs a positive quantity'),
  body('customer_name').optional({ nullable: true }).isString().isLength({ max: 150 }),
  body('payment_method').optional({ nullable: true }).isIn(['cash', 'card', 'online']),
];

router.get('/', getAll);
router.get('/analytics', getAnalytics);
router.get('/:id', getOne);
router.post('/', createValidators, validate, create);

export default router;
