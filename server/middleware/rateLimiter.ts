import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';

// PRO-08: nothing in the app limited request rate at any layer. These are
// applied in server.ts / specific routes, in order from broadest to narrowest.
// All of them rely on `app.set('trust proxy', ...)` being set correctly
// (see server.ts) — without it every request behind a reverse proxy looks
// like it comes from the same address and one limiter bucket covers everyone.

const jsonLimitResponse = (message: string) => (_req: Request, res: Response) => {
  res.status(429).json({ message });
};

// Limits are read from the environment rather than hardcoded. Two reasons:
// a deployment behind a CDN or a shared corporate NAT sees a very different
// request shape per source address than a direct one, and tuning a ceiling
// should not require a code change and a deploy. Also lets a capacity test
// (PERF-02, scripts/loadtest/run.js) raise them deliberately — otherwise the
// test measures this middleware instead of the server, which is exactly what
// happened the first time it was run at 2x peak.
const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// General API-wide ceiling — generous, just stops outright abuse/scripted hammering.
const generalApiLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_GENERAL_WINDOW_MS', 60_000),
  limit: envInt('RATE_LIMIT_GENERAL_MAX', 300),
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many requests. Please slow down and try again shortly.'),
});

// PRO-09: login had no limit or lockout on attempts at all. Keyed on IP by
// default (express-rate-limit's standard keyGenerator), which also covers the
// "unknown email vs wrong password" case equally since both count the same way.
const authLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60_000),
  limit: envInt('RATE_LIMIT_AUTH_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonLimitResponse('Too many login attempts. Please wait 15 minutes and try again.'),
});

// PRO-11: public organization registration had no rate limit at all, and
// provisions real database objects — keep it tight.
const publicFormLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_PUBLIC_FORM_WINDOW_MS', 60 * 60_000),
  limit: envInt('RATE_LIMIT_PUBLIC_FORM_MAX', 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many submissions from this address. Please try again later.'),
});

// Public website forms (help contact, share a story, newsletter). Each
// submission sends an email, so cap it per address. Separate from
// publicFormLimiter so a visitor who wrote to support isn't then locked out
// of registering their organization.
const contactFormLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_CONTACT_FORM_WINDOW_MS', 60 * 60_000),
  limit: envInt('RATE_LIMIT_CONTACT_FORM_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many messages from this address. Please try again later.'),
});

// PRO-02: medicine/people search endpoints (including the two that need no
// login) had no rate limit, on top of having no query-length minimum.
const searchLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_SEARCH_WINDOW_MS', 60_000),
  limit: envInt('RATE_LIMIT_SEARCH_MAX', 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many searches. Please slow down.'),
});

// PRO-07: file uploads had no per-user rate limit. Keyed on the user when
// there is one, falling back to IP for anything unauthenticated — via
// express-rate-limit's own ipKeyGenerator, which normalises IPv6 to a /64
// subnet. Using req.ip raw here would let an IPv6 client hop addresses
// within its own prefix to get a fresh bucket per request (and v8+ refuses
// to start at all if a custom keyGenerator touches req.ip without it).
const uploadLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_UPLOAD_WINDOW_MS', 60_000),
  limit: envInt('RATE_LIMIT_UPLOAD_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip || 'unknown')),
  handler: jsonLimitResponse('Too many uploads. Please wait a moment and try again.'),
});

export { generalApiLimiter, authLimiter, publicFormLimiter, contactFormLimiter, searchLimiter, uploadLimiter };
