// Shared allow-list for both the Express CORS middleware (server.ts) and the
// Socket.IO CORS config (config/socket.ts) — kept in one place so the two
// can't drift apart.
//
// Dev-server origins only apply outside production (ARCH-04) — previously
// these were active in every environment, including production.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

const ALLOWED_ORIGINS: string[] = [
  process.env.CLIENT_URL,
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS),
].filter((o): o is string => Boolean(o));

export { ALLOWED_ORIGINS };
