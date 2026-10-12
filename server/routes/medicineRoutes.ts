import { Router } from 'express';
import { body } from 'express-validator';
import { getAll, getOne, create, update, adjustStock, remove } from '../controllers/medicineController';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

router.use(protect);

// PRO-06 / PRO-10: medicines were created/updated with no checks on type,
// range, or length at all.
const writeValidators = [
  body('name').trim().notEmpty().isLength({ max: 200 }),
  body('generic_name').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('category').optional({ nullable: true }).isString().isLength({ max: 100 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('unit').optional({ nullable: true }).isIn(['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops']),
  body('price').isFloat({ min: 0 }),
  body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('reorder_level').optional({ nullable: true }).isInt({ min: 0 }),
  body('expiry_date').optional({ nullable: true }).isISO8601(),
  body('supplier_id').optional({ nullable: true }).isInt({ min: 1 }),
];
const createValidators = [...writeValidators, body('stock_quantity').optional({ nullable: true }).isInt({ min: 0 })];
const updateValidators = [...writeValidators, body('is_active').optional().isBoolean()];

router.get('/', getAll);
router.get('/:id', getOne);
router.post('/', authorize('admin', 'pharmacist'), createValidators, validate, create);
router.put('/:id', authorize('admin', 'pharmacist'), updateValidators, validate, update);
router.patch('/:id/stock', authorize('admin', 'pharmacist'),
  [body('delta').isInt().withMessage('delta must be an integer')], validate, adjustStock);
router.delete('/:id', authorize('admin'), remove);

export default router;
