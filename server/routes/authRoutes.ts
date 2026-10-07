import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, mfaLogin, mfaSetup, mfaVerifySetup, mfaDisable, getMe, impersonate, listImpersonations, listImpersonationActions } from '../controllers/authController';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register',
  registerLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['patient', 'doctor', 'pharmacist', 'laboratory']).withMessage('Invalid role'),
  ],
  validate,
  register
);

router.post('/login',
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  login
);

router.post('/mfa/login',
  loginLimiter,
  [body('mfaToken').notEmpty(), body('code').notEmpty()],
  validate,
  mfaLogin
);

router.get('/me', protect, getMe);

router.post('/mfa/setup',        protect, authorize('admin'), mfaSetup);
router.post('/mfa/verify-setup', protect, authorize('admin'), mfaVerifySetup);
router.post('/mfa/disable',      protect, authorize('admin'), mfaDisable);

router.post('/impersonate/:userId', protect, authorize('admin'), impersonate);
router.get('/impersonations',       protect, authorize('admin'), listImpersonations);
router.get('/impersonation-actions', protect, authorize('admin'), listImpersonationActions);

export default router;
