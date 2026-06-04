FROM node:20-slim

# Canvas system libs (fallback if prebuilt binaries unavailable for this platform)
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

# ── Server ────────────────────────────────────────────────────────────────────
# Build context is the REPO ROOT (set dockerfilePath in railway.toml).
# Server source lands at /app/, client source at /app/client/.
COPY server/package*.json ./
RUN npm install --include=dev

COPY server/ .

RUN npm run build

# ── Client ────────────────────────────────────────────────────────────────────
COPY client/package*.json ./client/
RUN npm install --prefix client --include=dev

COPY client/ ./client/

RUN npm run build --prefix client

# ── Prune server devDeps ──────────────────────────────────────────────────────
RUN npm prune --omit=dev

EXPOSE 5000

# __dirname = /app/dist  →  client/dist = /app/client/dist
CMD ["node", "dist/server.js"]
