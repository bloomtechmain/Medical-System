FROM node:20-slim AS builder

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
FROM node:20-slim

WORKDIR /app

# Copy package files and install only production deps (includes serve).
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Railway injects PORT at runtime. serve binds to 0.0.0.0 by default.
# The entrypoint writes dist/config.js from API_URL before starting serve.
CMD ["./docker-entrypoint.sh"]
