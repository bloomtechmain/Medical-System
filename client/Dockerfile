FROM node:22.12.0-slim AS builder

WORKDIR /app
COPY package*.json ./

# --include=dev ensures vite, typescript, tailwindcss, postcss are installed
# even when NODE_ENV=production in the build environment.
RUN npm install --include=dev

COPY . .

# The backend URL is no longer baked in at build time (ARCH-04) — it's written
# to dist/config.js by docker-entrypoint.sh when the container starts, so this
# same image works in any environment. See client/src/env.ts.
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22.12.0-slim

WORKDIR /app

# Copy package files and install only production deps (includes serve).
COPY package*.json ./
RUN npm install --omit=dev

# --chown: dist/ must stay writable by the non-root "node" user below —
# docker-entrypoint.sh writes dist/config.js there at container start.
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node

# Railway injects PORT at runtime. serve binds to 0.0.0.0 by default.
# The entrypoint writes dist/config.js from API_URL before starting serve.
CMD ["./docker-entrypoint.sh"]
