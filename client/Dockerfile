FROM node:22.12.0-slim AS builder

WORKDIR /app
COPY package*.json ./

# AUTO-03: npm ci rather than npm install, so the same commit always produces
# the same dependency tree (see server/Dockerfile for the full reasoning).
# --include=dev ensures vite, typescript, tailwindcss, postcss are installed
# even when NODE_ENV=production in the build environment.
RUN npm ci --include=dev

COPY . .

# MON-05: the release tag for client Sentry events. Unlike the API URL this
# genuinely is build-time — it identifies this exact bundle — and it is not a
# secret, so baking it in is safe. Never put a secret in a VITE_ variable:
# they are compiled into the bundle and readable in the browser.
ARG VITE_SENTRY_DSN=""
ARG VITE_GIT_COMMIT_SHA=unknown
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_GIT_COMMIT_SHA=${VITE_GIT_COMMIT_SHA}

# The backend URL is no longer baked in at build time (ARCH-04) — it's written
# to dist/config.js by docker-entrypoint.sh when the container starts, so this
# same image works in any environment. See client/src/env.ts.
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22.12.0-slim

# SEC: apt-get upgrade picks up Debian security patches (e.g. libgnutls30,
# perl-base) released after this base image tag was built — node:22.12.0-slim
# is a fixed snapshot and doesn't track them on its own.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install only production deps (includes serve).
COPY package*.json ./
RUN npm ci --omit=dev \
    # Global npm/npx are unused after this point — docker-entrypoint.sh calls
    # node_modules/.bin/serve directly — and npm bundles its own `tar`
    # dependency that's a separate CVE source, so drop it from the image.
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# --chown: dist/ must stay writable by the non-root "node" user below —
# docker-entrypoint.sh writes dist/config.js there at container start.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node

# Railway injects PORT at runtime. serve binds to 0.0.0.0 by default.
# The entrypoint writes dist/config.js from API_URL before starting serve.
CMD ["./docker-entrypoint.sh"]
