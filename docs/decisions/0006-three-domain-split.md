# 0006 — One build, three subdomains, token handoff instead of a shared cookie

**Status:** Accepted
**Date:** 2026-10-27

## Context

The product moved onto its own domain, `suwela.com` (Cloudflare), and the
business wants three public faces instead of one:

- `www.suwela.com` — the marketing site and every auth page (login,
  register, forgot/reset password, email verification).
- `app.suwela.com` — the operational dashboards: doctor, patient, pharmacy,
  hospital, laboratory, clinic.
- `dashboard.suwela.com` — the admin console that administers the whole
  system.

The client is one React SPA with one Vite build (`client/`), already shipped
as a single Docker image configured at container start via
`window.__APP_CONFIG__` (ARCH-04 — see `client/docker-entrypoint.sh`). There
is no per-role or per-audience split in the codebase today; `App.tsx` mounts
every route (landing, auth, `/admin`, `/doctor`, `/hospital`, `/clinic`,
`/pharmacist`, `/patient`, `/laboratory`) in one router.

## Decision

**This is also what pulled [0002](0002-railway-then-aws.md)'s trigger.** The
decision to stay on Railway "until a real trigger" didn't survive contact
with needing three subdomains behind one Cloudflare-proxied domain: Railway
can serve multiple custom domains off one service, but getting Cloudflare and
Railway's own TLS to agree across three hostnames plus an apex redirect was
more moving parts than standing up the AWS side that already existed in
`infra/terraform/` (ECS + ALB + S3/CloudFront) — none of it applied to
production before this. So this ADR ended up deciding two things at once:
the subdomain architecture, and that production moves to AWS to get it.
Staging was already live on AWS before this change (deployed by hand,
2026-10-19); production was not.

**Keep one build.** Deploy the same client image, served at all three
hostnames — one CloudFront distribution in front of the client's S3 bucket,
with all three as aliases on one ACM certificate (`infra/terraform/modules/
edge`). Which hostname a given route *should* be on is a pure
function of the path (`client/src/utils/zones.ts`): `/admin*` → dashboard,
the six dashboard prefixes → app, everything else → site. `currentZone()`
compares that against the hostname actually serving the page and, on a
mismatch, the app redirects — see `App.tsx`'s `goTo()` / `CrossZoneRedirect`.

This was the option that didn't require three codebases, three CI pipelines,
or deciding ahead of time which shared components "belong" to which app —
the existing per-role route guards (`PrivateRoute` in `App.tsx`) already do
the access control; the subdomain split only adds "and is this the right
front door."

**Session handoff rides in a URL fragment, not a shared cookie.**
[0001](0001-jwt-in-local-storage.md) already put the access/refresh tokens in
`localStorage`, which does not cross an origin boundary — `app.suwela.com`
and `dashboard.suwela.com` each have their own, empty `localStorage` the
first time a session arrives there. Revisiting 0001's cookie question (a
cookie scoped to `.suwela.com` *would* cross subdomains for free) was in
scope, but reopening it over the few lines a fragment handoff takes wasn't a
good trade — 0001 is explicit that moving to cookies is a deliberate,
week-long change (CSRF tokens, Socket.IO handshake, file-download helpers),
not something to fold into a DNS change.

So: a cross-zone redirect that has a session to carry appends it as
`#sso=<base64 JSON>` to the target URL (`src/utils/authHandoff.ts`); the
receiving origin reads it, writes `localStorage`, and strips the fragment via
`history.replaceState` before the first paint that matters
(`AuthContext.tsx` does this at module load, ahead of its own `useState`
initializers, specifically to avoid a one-frame "logged out" flash). A
fragment is never sent to any server — not in the request line, not in
`Referer` — so it never reaches an access log; the only residual exposure is
that browser's own history for the instant before it's replaced, which is an
incremental addition to the risk 0001 already accepted (localStorage tokens,
15-minute access tokens, revocable rotating refresh tokens), not a new kind
of one.

**Zone domains are config, not code.** `SITE_URL` / `APP_URL` /
`DASHBOARD_URL` are three more optional entries in the same
`window.__APP_CONFIG__` mechanism `API_URL` already uses
(`client/docker-entrypoint.sh`, `scripts/deploy/write-client-config.sh`).
Unset — the default, and what `npm run dev`, Vitest, and any single-domain
deployment get — means `currentZone()` returns `null` and every redirect in
`App.tsx` is skipped. The split is additive: nothing about running this
locally or on a plain single domain changes.

**CORS gets an additive env var, not a behavior change.** `CLIENT_URL`
keeps its existing single-origin meaning everywhere else in the server
(`authController.ts` builds every email link from it — those links should
always point at the site zone, `www.suwela.com`, regardless of how many
origins CORS allows). `EXTRA_CORS_ORIGINS` (`server/config/corsOrigins.ts`)
is a new, optional, comma-separated list purely for the CORS allow-list, so
`app.suwela.com` and `dashboard.suwela.com` can call the API too.

## Consequences

**What we get:** three clean public URLs with no second codebase, no second
deploy pipeline, and no change to how authorization already works
server-side (every request is still authorized independently by the API;
the zone split only changes which screen the client shows for a given URL).

**Accepted cost:** a cross-zone login takes one extra hop (the browser
actually navigates to the other origin — this is not a client-side route
change), and the handoff fragment is briefly the current URL on the
destination origin before it's stripped. Both are visible in
`App.tsx`/`authHandoff.ts` if this ever needs auditing.

**The API gets `api.suwela.com` too**, once production is on AWS anyway —
not because Bearer-token auth requires the API and client to share a domain
(it doesn't; CORS plus a header works cross-origin regardless), but because
the ALB's auto-generated `*.elb.amazonaws.com` hostname is exactly the kind
of thing that changes if the load balancer is ever recreated, and nothing
should hard-code that into a client build or an email template. One more
ACM cert, requested alongside the CloudFront one, DNS-validated the same way
(see `docs/environments.md`).

## What would change this

- If 0001 is ever revisited and the project moves to httpOnly cookies, scope
  the cookie to `.suwela.com` and this entire handoff mechanism
  (`authHandoff.ts`, the module-load consumption in `AuthContext.tsx`)
  becomes dead code to delete, not something to keep running alongside
  cookies.
- A fourth audience needing its own subdomain is one more entry in
  `zones.ts`, one more CloudFront alias, and one more SAN on the ACM
  certificate — not a new mechanism.
