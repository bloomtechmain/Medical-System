import { Router } from 'express';
import { body } from 'express-validator';
import { getAll, getOne, create, receive } from '../controllers/orderController';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

router.use(protect);

const createValidators = [
  body('supplier_id').isInt({ min: 1 }).withMessage('supplier_id is required'),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('items').isArray({ min: 1, max: 100 }).withMessage('items must be a non-empty array (max 100 lines)'),
  body('items.*.medicine_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1, max: 1000000 }),
  body('items.*.unit_cost').isFloat({ min: 0 }),
];

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), createValidators, validate, create);
router.patch('/:id/receive', authorize('admin', 'pharmacist'), receive);

export default router;
