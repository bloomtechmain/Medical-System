// Single source of truth for the backend origin URL.
// Vite bakes VITE_API_URL into the bundle at build time. Railway (or any
// operator) may accidentally include leading/trailing whitespace in the
// env-var value, which breaks WebSocket URLs (space → %20). Always trim.
export const SERVER_ORIGIN = (import.meta.env.VITE_API_URL?.trim() ?? '').replace(/\/$/, '');
