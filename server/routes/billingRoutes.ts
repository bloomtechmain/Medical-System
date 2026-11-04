import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';
import {
  getMyBilling, cancelMyRequest,
  overview, listAccounts, accountPayments, recordPayment,
  listChangeRequests, approveChangeRequest, rejectChangeRequest,
} from '../controllers/billingController';

// Monthly billing for paid packages (migration 016). The /me routes stay
// reachable while an account is suspended for non-payment (see
// utils/subscriptions.ts ALWAYS_ALLOWED) — that is how a locked account sees
// what it owes.

const router = Router();

router.get('/me', protect, query('organization_id').optional().isInt(), validate, getMyBilling);
router.delete('/me/requests/:id', protect, param('id').isInt(), validate, cancelMyRequest);

router.use(protect, authorize('admin'));

router.get('/overview', overview);
router.get('/accounts', listAccounts);
router.get('/accounts/:kind/:id/payments',
  param('kind').isIn(['user', 'organization']), param('id').isInt(), validate, accountPayments);
router.post('/accounts/:kind/:id/payments',
  param('kind').isIn(['user', 'organization']),
  param('id').isInt(),
  body('months').optional().isInt({ min: 1, max: 12 }).toInt(),
  body('amount').optional({ nullable: true }).isFloat({ min: 0, max: 1_000_000_000 }).toFloat(),
  body('method').optional().isIn(['cash', 'bank_transfer', 'card', 'online', 'cheque', 'other']),
  body('reference').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
  validate,
  recordPayment
);

router.get('/change-requests', listChangeRequests);
router.post('/change-requests/:id/approve',
  param('id').isInt(),
  body('timing').optional().isIn(['next_period', 'now']),
  body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
  validate,
  approveChangeRequest
);
router.post('/change-requests/:id/reject',
  param('id').isInt(),
  body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
  validate,
  rejectChangeRequest
);

export default router;
