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

# Build context is the server/ directory (Railway Root Directory = /server).
# Do NOT reference ../client here — the client is a separate Railway service.
COPY package*.json ./
RUN npm install --include=dev

COPY . .

RUN npm run build

RUN npm prune --omit=dev

EXPOSE 5000

CMD ["node", "dist/server.js"]
