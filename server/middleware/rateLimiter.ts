import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// PRO-08: nothing in the app limited request rate at any layer. These are
// applied in server.ts / specific routes, in order from broadest to narrowest.
// All of them rely on `app.set('trust proxy', ...)` being set correctly
// (see server.ts) — without it every request behind a reverse proxy looks
// like it comes from the same address and one limiter bucket covers everyone.

const jsonLimitResponse = (message: string) => (_req: Request, res: Response) => {
  res.status(429).json({ message });
};

// General API-wide ceiling — generous, just stops outright abuse/scripted hammering.
const generalApiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many requests. Please slow down and try again shortly.'),
});

// PRO-09: login had no limit or lockout on attempts at all. Keyed on IP by
// default (express-rate-limit's standard keyGenerator), which also covers the
// "unknown email vs wrong password" case equally since both count the same way.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonLimitResponse('Too many login attempts. Please wait 15 minutes and try again.'),
});

// PRO-11: public organization registration had no rate limit at all, and
// provisions real database objects — keep it tight.
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many submissions from this address. Please try again later.'),
});

// PRO-02: medicine/people search endpoints (including the two that need no
// login) had no rate limit, on top of having no query-length minimum.
const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many searches. Please slow down.'),
});

// PRO-07: file uploads had no per-user rate limit.
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => (req.user ? `u${req.user.id}` : req.ip || 'unknown'),
  handler: jsonLimitResponse('Too many uploads. Please wait a moment and try again.'),
});

export { generalApiLimiter, authLimiter, publicFormLimiter, searchLimiter, uploadLimiter };
