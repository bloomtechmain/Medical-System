import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, getMe, impersonate, listImpersonations } from '../controllers/authController';
import { protect, authorize } from '../middleware/auth';
import validate from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// PRO-10: no maximum length on password/name, and no limit on
// hospital_organization_ids' size. PRO-09: no rate limit/lockout on
// register or login — authLimiter below covers both.
router.post('/register',
  authLimiter,
  [
    body('name').trim().notEmpty().isLength({ max: 150 }).withMessage('Name is required (max 150 characters)'),
    body('email').isEmail().isLength({ max: 254 }).normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
    body('role').isIn(['patient', 'doctor', 'pharmacist', 'laboratory']).withMessage('Invalid role'),
    body('hospital_organization_ids').optional().isArray({ max: 20 }).withMessage('Too many organizations'),
    body('hospital_organization_ids.*').optional().isInt(),
  ],
  validate,
  register
);

router.post('/login',
  authLimiter,
  [
    body('email').isEmail().isLength({ max: 254 }).normalizeEmail(),
    body('password').notEmpty().isLength({ max: 128 }),
  ],
  validate,
  login
);

router.get('/me', protect, getMe);

router.post('/impersonate/:userId', protect, authorize('admin'), impersonate);
router.get('/impersonations',       protect, authorize('admin'), listImpersonations);

export default router;
