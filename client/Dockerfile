FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./

# --include=dev ensures vite, typescript, tailwindcss, postcss are installed
# even when NODE_ENV=production in the build environment.
RUN npm install --include=dev

COPY . .

# Railway passes service env vars as Docker build args automatically.
# VITE_API_URL must be the server's public URL (no trailing slash).
# Vite bakes this into the compiled JS bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy package files and install only production deps (includes serve).
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Railway injects PORT at runtime. serve binds to 0.0.0.0 by default.
CMD ["sh", "-c", "node_modules/.bin/serve dist -s -l ${PORT:-3000}"]
