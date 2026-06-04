FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./

# --include=dev ensures vite, typescript, tailwindcss, postcss are installed
# even when Railway sets NODE_ENV=production in the build environment.
RUN npm install --include=dev

COPY . .

# VITE_API_URL must be set as a Railway build-time variable.
# Vite bakes this into the compiled JS bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install serve locally (avoids PATH/global-install issues)
RUN npm install serve

COPY --from=builder /app/dist ./dist

# Railway injects PORT at runtime; default to 3000 for local runs.
CMD ["sh", "-c", "node_modules/.bin/serve dist --single --listen ${PORT:-3000} --no-clipboard"]
