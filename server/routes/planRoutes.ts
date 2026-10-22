import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';
import { searchLimiter } from '../middleware/rateLimiter';
import {
  listPublic, getMine, requestChange, getCatalog, listAll, getSummary, create, update, makeDefault, remove,
  listSubscribers, assign, history, subscriberUsage,
} from '../controllers/planController';

const router = Router();

// Public: the registration pages list packages before any session exists.
router.get('/public', searchLimiter, listPublic);

// Any signed-in account: the package behind the dashboard being viewed.
router.get('/me', protect, getMine);
router.post('/me/request-change',
  protect,
  body('plan_id').isInt().toInt(),
  body('organization_id').optional({ nullable: true }).isInt().toInt(),
  body('message').optional({ nullable: true }).isString().isLength({ max: 300 }),
  validate,
  requestChange
);

router.use(protect, authorize('admin'));

const planFields = [
  body('name').optional().trim().notEmpty().isLength({ max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('price_monthly').optional().isFloat({ min: 0, max: 100_000_000 }).toFloat(),
  body('price_yearly').optional({ nullable: true }).isFloat({ min: 0, max: 1_000_000_000 }).toFloat(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }).isAlpha(),
  body('features').optional().isObject(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('sort_order').optional().isInt({ min: 0, max: 1000 }).toInt(),
];

router.get('/catalog', getCatalog);
router.get('/summary', getSummary);
router.get('/subscribers', listSubscribers);
router.get('/subscribers/:kind/:id/history', param('id').isInt(), validate, history);
router.get('/subscribers/:kind/:id/usage', param('id').isInt(), validate, subscriberUsage);
router.put('/subscribers/:kind/:id',
  param('kind').isIn(['user', 'organization']),
  param('id').isInt(),
  body('plan_id').isInt().toInt(),
  body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
  validate,
  assign
);

router.get('/', listAll);
router.post('/',
  body('audience').isIn(['doctor', 'pharmacy', 'laboratory', 'hospital', 'clinic']),
  body('code').trim().matches(/^[a-z0-9_-]{2,40}$/).withMessage('Code must be 2-40 lowercase letters, numbers, - or _'),
  body('name').trim().notEmpty().isLength({ max: 80 }),
  ...planFields,
  validate,
  create
);
router.put('/:id', param('id').isInt(), ...planFields, validate, update);
router.post('/:id/default', param('id').isInt(), validate, makeDefault);
router.delete('/:id', param('id').isInt(), validate, remove);

export default router;
