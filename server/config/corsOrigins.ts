// Shared allow-list for both the Express CORS middleware (server.ts) and the
// Socket.IO CORS config (config/socket.ts) — kept in one place so the two
// can't drift apart.
//
// Dev-server origins only apply outside production (ARCH-04) — previously
// these were active in every environment, including production.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

// CLIENT_URL stays the one origin everything else (email links — see
// authController.ts buildClientLink — and ARCH-04's requireEnv check) is
// built from: the "site" zone, www.suwela.com. The three-subdomain split
// (docs/decisions/0006-three-domain-split.md) needs app.suwela.com and
// dashboard.suwela.com to call this API too, which is the only thing
// EXTRA_CORS_ORIGINS is for — comma-separated, additive, optional.
const EXTRA_ORIGINS = (process.env.EXTRA_CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS: string[] = [
  process.env.CLIENT_URL,
  ...EXTRA_ORIGINS,
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS),
].filter((o): o is string => Boolean(o));

export { ALLOWED_ORIGINS };
