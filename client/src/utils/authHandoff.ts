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
}

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
