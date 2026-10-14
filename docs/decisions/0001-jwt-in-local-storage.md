# 0001 — JWT in `localStorage` rather than an httpOnly cookie

**Status:** Accepted, with a known and accepted cost
**Date:** 2026-10-14 (recording a decision made earlier)

## Context

The client stores its access and refresh tokens in `localStorage` and sends
the access token as an `Authorization: Bearer` header.

The security audit flagged the consequence directly (SEC-17, cross-site
scripting): *"the JWT is kept in localStorage, so any future XSS steals a
7-day token."* JavaScript can read `localStorage`, so any successful XSS reads
the token and can use it from anywhere. An httpOnly cookie cannot be read by
JavaScript at all.

## Decision

Keep `localStorage` + Bearer header. Reduce the blast radius instead of
changing the mechanism:

- Access tokens live **15 minutes**, not 7 days.
- Refresh tokens are **opaque and revocable** — only a SHA-256 hash is stored
  server-side, they rotate on every use, and reuse of an already-rotated token
  is detectable.
- Deactivating a user revokes every outstanding refresh token immediately.
- `helmet` sets a CSP, and `client/public/serve.json` sets a stricter one on
  the static host. No `dangerouslySetInnerHTML` anywhere in `client/src`.
- Admin accounts can be required to use TOTP MFA.

## Why not cookies

Honestly: because the Bearer header is what the application already does
everywhere, and switching is not a small change.

- The API is cross-origin from the client (separate services, separate
  hostnames), so cookies need `SameSite=None; Secure` plus CORS credentials —
  which works, but gives up the CSRF protection that makes cookies attractive
  in the first place. CSRF is currently **N/A** precisely because there are no
  cookies (audit's own assessment); cookies would make it a live concern
  needing tokens on every mutating request.
- Socket.IO authenticates with the token in its handshake `auth` payload. That
  would need reworking too.
- Several file downloads fetch with an explicit `Authorization` header and
  hand back a blob URL (`src/utils/authedFiles.ts`), because SEC-28 moved
  uploads behind authenticated endpoints.

## Consequences

**Accepted cost:** an XSS vulnerability becomes an account takeover. The 15-minute
window and revocable refresh tokens limit it; they do not remove it, because
an attacker with script execution can simply use the token immediately.

**What we get:** no CSRF surface, a straightforward cross-origin story, one
auth mechanism for HTTP and WebSocket alike.

## What would change this

- A real XSS finding, in which case the mitigation is not "tighten the CSP"
  but move the session to an httpOnly cookie.
- Collapsing client and API onto one origin, which removes the main argument
  against cookies.
- A penetration test (SEC-26, not yet done) recommending it.

If it changes, the work is: set the cookie on login/refresh, add CSRF tokens to
mutating requests, move the Socket.IO handshake to cookie auth, and change the
file helpers to plain URLs. Call it a week, including testing.
