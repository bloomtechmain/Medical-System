import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, mfaLogin, mfaSetup, mfaVerifySetup, mfaDisable, getMe, impersonate, listImpersonations, listImpersonationActions, refreshAccessToken, logout, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification, acceptTerms } from '../controllers/authController';
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
    body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be 10-128 characters'),
    body('role').isIn(['patient', 'doctor', 'pharmacist', 'laboratory']).withMessage('Invalid role'),
    body('hospital_organization_ids').optional().isArray({ max: 20 }).withMessage('Too many organizations'),
    body('hospital_organization_ids.*').optional().isInt(),
    // COMP-02: a version string, not free text — bounded so it cannot be used
    // to write arbitrary content into the users table.
    body('accepted_terms_version').optional({ nullable: true }).isString().isLength({ max: 40 }),
  ],
  validate,
  register
);

// PRO-11: email verification. Both are public — the user has no session yet,
// that being the point — and both sit behind authLimiter, because an
// unthrottled resend lets this server be used to send mail at a third party's
// inbox. resendVerification adds a per-account hourly cap on top.
router.post('/verify-email',
  authLimiter,
  [body('token').isString().isLength({ min: 32, max: 128 })],
  validate,
  verifyEmail
);

router.post('/resend-verification',
  authLimiter,
  [body('email').isEmail().isLength({ max: 254 }).normalizeEmail()],
  validate,
  resendVerification
);

// COMP-02: lets a logged-in user accept the current Terms/Privacy version.
// Needed for the users migration 008 deliberately left NULL (they signed up
// before the documents existed) and for anyone on a superseded version.
router.post('/accept-terms',
  protect,
  [body('version').isString().isLength({ min: 1, max: 40 })],
  validate,
  acceptTerms
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

router.post('/mfa/login',
  authLimiter,
  [body('mfaToken').notEmpty(), body('code').notEmpty()],
  validate,
  mfaLogin
);

router.post('/refresh',
  authLimiter,
  [body('refreshToken').notEmpty()],
  validate,
  refreshAccessToken
);
router.post('/logout', logout);

router.post('/forgot-password',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  validate,
  forgotPassword
);
router.post('/reset-password',
  authLimiter,
  [body('token').notEmpty(), body('newPassword').isLength({ min: 10, max: 128 }).withMessage('Password must be 10-128 characters')],
  validate,
  resetPassword
);

router.get('/me', protect, getMe);

router.post('/change-password',
  protect, authLimiter,
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 10, max: 128 }).withMessage('Password must be 10-128 characters')],
  validate,
  changePassword
);

router.post('/mfa/setup',        protect, authorize('admin'), mfaSetup);
router.post('/mfa/verify-setup', protect, authorize('admin'), mfaVerifySetup);
router.post('/mfa/disable',      protect, authorize('admin'), mfaDisable);

router.post('/impersonate/:userId', protect, authorize('admin'), impersonate);
router.get('/impersonations',       protect, authorize('admin'), listImpersonations);
router.get('/impersonation-actions', protect, authorize('admin'), listImpersonationActions);

export default router;
