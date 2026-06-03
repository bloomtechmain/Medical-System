import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, getMe } from '../controllers/authController';
import { protect } from '../middleware/auth';
import validate from '../middleware/validate';

const router = Router();

router.post('/register',
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
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  login
);

router.get('/me', protect, getMe);

export default router;
