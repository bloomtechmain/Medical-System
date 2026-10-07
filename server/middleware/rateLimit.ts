import rateLimit from 'express-rate-limit';

// SEC-22/SEC-15: nothing previously slowed down repeated attempts against
// login, registration, or the public org-registration/search endpoints —
// what makes password-guessing and account-creation spam cheap. Limits are
// per-IP (keyed on req.ip, which requires `trust proxy` to be set correctly
// — see server.ts — otherwise every request behind a proxy looks like the
// same IP and the limit bites real users instead of attackers).

// Login: the most sensitive target — a brute-force attempt is many requests
// against one or a few accounts in a short window.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

// Account creation — looser than login, but still bounded. Covers both
// patient/doctor/etc. self-registration and public org registration.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

// Public search (owner lookup, hospital/clinic search) — legitimate use is
// someone typing in an autocomplete box, so this stays generous; it exists
// to stop bulk scraping of the directory, not to limit normal typing.
const publicSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many search requests. Please slow down.' },
});

export { loginLimiter, registerLimiter, publicSearchLimiter };
