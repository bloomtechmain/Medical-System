import '@testing-library/jest-dom/vitest';

// The app reads its backend origin from window.__APP_CONFIG__ at runtime
// (ARCH-04). jsdom has no entrypoint writing it, so give it a stable value
// rather than letting each test guess.
window.__APP_CONFIG__ = { API_URL: '' };
