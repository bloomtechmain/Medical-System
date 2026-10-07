// Single source of truth for the backend origin URL.
//
// Resolved at RUNTIME from window.__APP_CONFIG__ (written by docker-entrypoint.sh
// from the API_URL env var when the container starts — see client/public/config.js
// and client/index.html). This means one built Docker image can run against any
// backend just by changing an env var at deploy time, no rebuild needed (ARCH-04).
//
// Falls back to Vite's build-time VITE_API_URL for local dev (`npm run dev`),
// where there's no container/entrypoint writing config.js.
//
// Railway (or any operator) may accidentally include leading/trailing whitespace
// in the env-var value, which breaks WebSocket URLs (space → %20). Always trim.
declare global {
  interface Window {
    __APP_CONFIG__?: { API_URL?: string };
  }
}

const runtimeUrl = typeof window !== 'undefined' ? window.__APP_CONFIG__?.API_URL : undefined;
const rawUrl = runtimeUrl || import.meta.env.VITE_API_URL || '';

export const SERVER_ORIGIN = rawUrl.trim().replace(/\/$/, '');
