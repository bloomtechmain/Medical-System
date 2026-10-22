#!/usr/bin/env bash
#
# CICD-09: post-deploy smoke test. The finding is literally "No smoke tests
# after a deploy", and the fix it asks for is "health endpoint, home page,
# login with a test account, one API read".
#
# This is not a test suite. It answers one question — "is the thing we just
# deployed actually serving real requests?" — in under a minute, and fails the
# deploy if not. Depth belongs in CI, which has already run by this point.
#
# Usage: scripts/deploy/smoke-test.sh
# Needs: SMOKE_BASE_URL, SMOKE_TEST_EMAIL, SMOKE_TEST_PASSWORD, curl, jq.
#
# The test account should be a dedicated, low-privilege one (a patient), not
# an admin and not a real person's login. It will appear in the audit log on
# every deploy, which is intended — a login you can account for is better than
# an unexplained one.

set -euo pipefail

BASE="${SMOKE_BASE_URL:?SMOKE_BASE_URL is required}"
BASE="${BASE%/}"   # strip a trailing slash so URLs below don't double up
EMAIL="${SMOKE_TEST_EMAIL:-}"
PASSWORD="${SMOKE_TEST_PASSWORD:-}"
TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-15}"

# Staging's ALB has no real domain yet (infra/terraform/staging.tfvars has
# domain_name = null), so its HTTPS listener is serving a self-signed
# placeholder cert (CN=corehealth-system.local) rather than anything a public
# CA signed. Every TLS-verifying client — this script included — fails the
# handshake before a single HTTP response comes back, which is why a broken
# deploy and a healthy one looked identical: both produced curl's connection
# code "000", never a real status.
#
# SMOKE_INSECURE_TLS=true skips certificate verification so the checks below
# can actually run against that placeholder cert. Set it ONLY on the staging
# job (.github/workflows/deploy.yml) — never on production, which must keep
# verifying TLS for real. Remove this once staging has a real domain_name and
# a DNS-validated ACM certificate (see infra/terraform/variables.tf) and point
# SMOKE_BASE_URL at that domain instead of the raw ALB hostname.
CURL_TLS_OPTS=()
if [ "${SMOKE_INSECURE_TLS:-false}" = "true" ]; then
  CURL_TLS_OPTS=(--insecure)
  echo "::warning::SMOKE_INSECURE_TLS=true — not verifying the TLS certificate. This must only be set for staging."
fi

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1" >&2; exit 1; }

echo "==> Smoke testing ${BASE}"

# ── 1. Readiness, with a retry window ──────────────────────────────────────
# A fresh instance may still be connecting to the database. /api/ready is the
# right endpoint precisely because it answers "can this serve traffic", not
# just "is the process alive" — so poll it rather than sleeping blindly.
echo "--> Readiness"
DEADLINE=$(( $(date +%s) + ${SMOKE_READY_WAIT_SECONDS:-120} ))
until [ "$(date +%s)" -ge "$DEADLINE" ]; do
  CODE=$(curl -fsS "${CURL_TLS_OPTS[@]}" -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "${BASE}/api/ready" 2>/dev/null || echo "000")
  [ "$CODE" = "200" ] && break
  echo "    not ready yet (HTTP ${CODE}) — retrying"
  sleep 5
done
[ "${CODE:-000}" = "200" ] || fail "/api/ready never returned 200 (last: ${CODE:-000}). The database is probably unreachable — see runbooks/database-unreachable.md"
pass "/api/ready returns 200 (process up AND database reachable)"

# ── 2. Liveness, and the headers that should be on every response ──────────
echo "--> Liveness and security headers"
HEADERS=$(curl -fsS "${CURL_TLS_OPTS[@]}" -D - -o /dev/null --max-time "$TIMEOUT" "${BASE}/api/health")
grep -qi '^x-request-id:' <<<"$HEADERS" \
  || fail "no x-request-id response header — the request logger (MON-06) is not mounted"
pass "x-request-id present"

# SEC-20/SEC-21. Cheap to check, and their absence means helmet or the
# x-powered-by setting got lost in a refactor.
grep -qi '^x-content-type-options: *nosniff' <<<"$HEADERS" \
  || fail "missing X-Content-Type-Options: nosniff (SEC-20)"
pass "X-Content-Type-Options: nosniff"
grep -qi '^x-powered-by:' <<<"$HEADERS" \
  && fail "X-Powered-By is being advertised (SEC-21)"
pass "X-Powered-By not advertised"

# ── 3. The client is being served ──────────────────────────────────────────
if [ -n "${SMOKE_CLIENT_URL:-}" ]; then
  echo "--> Client"
  CLIENT_BODY=$(curl -fsS --max-time "$TIMEOUT" "${SMOKE_CLIENT_URL%/}/")
  grep -qi '<div id="root"' <<<"$CLIENT_BODY" \
    || fail "the client did not serve an app shell — check the client service"
  pass "client serves the app shell"
else
  echo "    (SMOKE_CLIENT_URL not set — skipping the client check)"
fi

# ── 4. Login, then one authenticated read ──────────────────────────────────
# This is the check that catches the deploys that matter. A broken JWT_SECRET,
# a missing migration or a crashed auth path all pass a health check and fail
# here.
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "::warning::SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD not set — skipping the login"
  echo "::warning::and authenticated-read checks, which are the most valuable part (CICD-09)."
  echo "==> Smoke test passed (partial)"
  exit 0
fi

echo "--> Login"
LOGIN_BODY=$(curl -sS "${CURL_TLS_OPTS[@]}" --max-time "$TIMEOUT" \
  -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")

TOKEN=$(jq -r '.token // empty' <<<"$LOGIN_BODY")
if [ -z "$TOKEN" ]; then
  # Never echo the body unredacted — on failure it can contain a pre-auth
  # token. The message field is enough to diagnose.
  fail "login did not return a token (message: $(jq -r '.message // "none"' <<<"$LOGIN_BODY"))"
fi
pass "login returns a session token"

echo "--> Authenticated read"
ME=$(curl -fsS "${CURL_TLS_OPTS[@]}" --max-time "$TIMEOUT" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE}/api/auth/me")
ME_EMAIL=$(jq -r '.email // empty' <<<"$ME")
[ "$ME_EMAIL" = "$EMAIL" ] \
  || fail "/api/auth/me returned '${ME_EMAIL}', expected '${EMAIL}'"
pass "/api/auth/me returns the logged-in user"

# ── 5. Authorization is still enforced ─────────────────────────────────────
# A deploy that accidentally removed `protect` from a router would pass every
# check above. This one would catch it.
echo "--> Authorization"
UNAUTH_CODE=$(curl -sS "${CURL_TLS_OPTS[@]}" -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "${BASE}/api/users")
case "$UNAUTH_CODE" in
  401|403) pass "unauthenticated /api/users is rejected (${UNAUTH_CODE})" ;;
  *)       fail "unauthenticated /api/users returned ${UNAUTH_CODE} — authentication may not be enforced" ;;
esac

echo "==> Smoke test passed"
