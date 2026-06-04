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

# Build context is server/ (Root Dir = server/ in Railway).
# --include=dev installs typescript, tsx etc. even when NODE_ENV=production.
COPY package*.json ./
RUN npm install --include=dev

COPY . .

# Compile TypeScript → dist/
RUN npm run build

# Strip dev dependencies from the final image
RUN npm prune --omit=dev

EXPOSE 5000

CMD ["node", "dist/server.js"]
