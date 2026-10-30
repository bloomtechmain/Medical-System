import { Router } from 'express';
import { body } from 'express-validator';
import validate, { rejectUnknownFields } from '../middleware/validate';
import { contactFormLimiter } from '../middleware/rateLimiter';
import { support, story, subscribe } from '../controllers/contactController';

// Public, unauthenticated — the website's forms. All of them email CONTACT_INBOX.
const router = Router();
router.use(contactFormLimiter);

const email = body('email').isEmail().isLength({ max: 254 });

router.post('/support',
  rejectUnknownFields(['name', 'email', 'subject', 'message']),
  body('name').isString().trim().isLength({ min: 1, max: 120 }),
  email,
  body('subject').isString().trim().isLength({ min: 1, max: 120 }),
  body('message').isString().trim().isLength({ min: 1, max: 5000 }),
  validate,
  support
);

router.post('/story',
  rejectUnknownFields(['name', 'email', 'role', 'city', 'title', 'story', 'rating', 'anonymous', 'consent']),
  body('name').isString().trim().isLength({ min: 1, max: 120 }),
  email,
  body('role').isString().trim().isLength({ min: 1, max: 80 }),
  body('city').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
  body('title').isString().trim().isLength({ min: 1, max: 200 }),
  body('story').isString().trim().isLength({ min: 1, max: 1000 }),
  body('rating').optional().isInt({ min: 0, max: 5 }),
  body('anonymous').optional().isBoolean(),
  body('consent').equals('true'),
  validate,
  story
);

router.post('/subscribe',
  rejectUnknownFields(['email']),
  email,
  validate,
  subscribe
);

export default router;
