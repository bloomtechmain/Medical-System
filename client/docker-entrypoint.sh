#!/bin/sh
# Writes dist/config.js from the API_URL env var at container START (not build
# time), so this one image can be deployed to any environment just by changing
# an env var — no rebuild (ARCH-04). Falls back to VITE_API_URL for anyone
# still setting the old build-time variable name during the transition.
set -e

RESOLVED_API_URL="${API_URL:-${VITE_API_URL:-}}"

cat > /app/dist/config.js <<EOF
window.__APP_CONFIG__ = { API_URL: "${RESOLVED_API_URL}" };
EOF

exec node_modules/.bin/serve dist -s -l "${PORT:-3000}"
