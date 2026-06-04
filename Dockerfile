FROM node:20-slim

# System libs for the 'canvas' native addon used by Tesseract OCR.
# These are only needed as a fallback if prebuilt binaries aren't available
# for the target platform; installing them is harmless if prebuilds are used.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2-dev \
    libpango1.0-dev \
    libpng-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Server dependencies ──────────────────────────────────────────────────────
# --include=dev overrides NODE_ENV=production so build tools (tsc, tsx)
# are always installed even when Railway sets NODE_ENV=production at build time.
COPY server/package*.json ./server/
RUN npm install --prefix server --include=dev

# ── Client dependencies ───────────────────────────────────────────────────────
COPY client/package*.json ./client/
RUN npm install --prefix client --include=dev

# ── Source files ─────────────────────────────────────────────────────────────
COPY server/ ./server/
COPY client/ ./client/

# ── Build ─────────────────────────────────────────────────────────────────────
RUN npm run build --prefix server
RUN npm run build --prefix client

# ── Prune server devDependencies for a leaner image ──────────────────────────
RUN npm prune --omit=dev --prefix server

# Railway injects PORT at runtime; fall back to 5000 for local docker runs.
EXPOSE 5000

# server/dist/server.js serves the React build from ../../client/dist
CMD ["node", "server/dist/server.js"]
