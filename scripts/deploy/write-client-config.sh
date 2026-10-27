#!/usr/bin/env bash
#
# Writes the runtime config the static frontend reads at load time —
# client/src/env.ts reads window.__APP_CONFIG__.API_URL from this file.
#
# client/docker-entrypoint.sh writes the same thing, with the same env var
# name, for the Railway/container target — it just does it at container
# START, since that target has a running process to do it in. The S3/
# CloudFront target (AWS) has no such process, so this does the equivalent
# at deploy time, right before the build gets synced to S3.
#
# Usage: scripts/deploy/write-client-config.sh <dist-dir>
# Needs: API_URL.
# Optional: SITE_URL / APP_URL / DASHBOARD_URL — the three-subdomain split
# (docs/decisions/0006-three-domain-split.md). Unset means no zone redirects.

set -euo pipefail

DIST_DIR="${1:?usage: write-client-config.sh <dist-dir>}"
: "${API_URL:?API_URL must be set}"

cat > "${DIST_DIR}/config.js" <<EOF
window.__APP_CONFIG__ = { API_URL: "${API_URL}", SITE_URL: "${SITE_URL:-}", APP_URL: "${APP_URL:-}", DASHBOARD_URL: "${DASHBOARD_URL:-}" };
EOF

echo "==> Wrote ${DIST_DIR}/config.js with API_URL=${API_URL}"
