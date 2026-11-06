// Carries a session across the subdomain split (zones.ts) when a redirect
// crosses from one zone's origin to another's — e.g. a doctor logging in on
// www.suwela.com needs their session on app.suwela.com, a different origin
// with its own, empty localStorage (ADR 0001: tokens live in localStorage,
// not a shared-domain cookie, so nothing crosses an origin boundary on its
// own).
//
// The handoff rides in the URL fragment, never the query string or path: a
// fragment is never sent to any server (not in the request line, not in
// Referer), so it never reaches an access log. It is still visible in this
// browser's history for a moment, which is why consumeAuthHandoff() strips
// it via replaceState as the very first thing it does on the receiving side.
// Given access tokens already live 15 minutes and refresh tokens are
// revocable (ADR 0001), this is an incremental, not a new, exposure.
const HANDOFF_KEY = 'sso';

interface HandoffPayload {
  token: string;
  refreshToken?: string;
  user: unknown;
  /** The administrator's own stashed session while they "View As" someone. */
  adminSession?: string;
}

// ── One live copy of a session ───────────────────────────────────────────────
// Each subdomain has its own localStorage. When a session is handed to
// another zone it MOVES (the sender forgets it) rather than being copied:
// two copies drift apart (each origin refreshes and rotates its own refresh
// token), and a sign-out on one left the other still signed in, which then
// handed the session straight back.
export const SESSION_KEYS = ['token', 'refreshToken', 'user', 'admin_session'] as const;

/** www only: which origin the session moved to, so "Sign in" and the landing
 *  page can send a signed-in person back to their dashboard. Holds no secret. */
export const SESSION_ORIGIN_KEY = 'session_origin';

export const clearStoredSession = (): void => {
  for (const k of SESSION_KEYS) localStorage.removeItem(k);
  localStorage.removeItem(SESSION_ORIGIN_KEY);
};

// "#signout" on a URL tells the receiving origin to forget any session it
// still holds. Sign-out (and a session that could not be renewed) always ends
// on www.suwela.com/login#signout, so no zone is left signed in.
export const SIGNOUT_HASH = 'signout';

export const consumeSignout = (): boolean => {
  if (typeof window === 'undefined' || window.location.hash !== `#${SIGNOUT_HASH}`) return false;
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.toString());
  return true;
};

// "#nosession=<origin>": app or dashboard had no session for a page and sent
// the person to www. www then forgets that it sent a session there (else its
// sign-in page would bounce straight back), but keeps any other: an admin
// signed in on dashboard who opens an app.suwela.com/admin link is still
// signed in.
const NOSESSION_KEY = 'nosession';

export const noSessionUrl = (url: string, fromOrigin: string): string =>
  `${url.split('#')[0]}#${NOSESSION_KEY}=${encodeURIComponent(fromOrigin)}`;

export const consumeNoSession = (): string | null => {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(new RegExp(`^#${NOSESSION_KEY}=([^&]+)$`));
  if (!m) return null;
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.toString());
  try { return decodeURIComponent(m[1]); } catch { return null; }
};

/** Issued-at time of a JWT, or 0 when it cannot be read. */
export const tokenIssuedAt = (jwt: string | null | undefined): number => {
  try {
    const part = (jwt ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(part)).iat) || 0;
  } catch {
    return 0;
  }
};

// Appends the handoff fragment to a same-shape URL (origin + path, already
// built by the caller) and returns it ready for window.location.replace().
export const withAuthHandoff = (targetUrl: string, payload: HandoffPayload): string => {
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  const separator = targetUrl.includes('#') ? '&' : '#';
  return `${targetUrl}${separator}${HANDOFF_KEY}=${encoded}`;
};

// Reads a handoff fragment left in the current URL by the page that
// redirected here, if any, and removes it from the visible URL immediately.
// Returns null when there is nothing to consume (the normal case — most
// loads are not the target of a cross-zone redirect).
export const consumeAuthHandoff = (): HandoffPayload | null => {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(new RegExp(`(?:^#|[#&])${HANDOFF_KEY}=([^&]+)`));
  if (!match) return null;

  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url.toString());

  try {
    return JSON.parse(atob(decodeURIComponent(match[1]))) as HandoffPayload;
  } catch {
    return null;
  }
};
