FROM node:20-slim

# System libs for the canvas native addon (Tesseract OCR fallback build).
# These are skipped automatically if prebuilt binaries are downloaded.
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

# Cache layer: install deps before copying full source so this layer
# is reused when only source files change (not package files).
COPY package*.json ./
RUN npm install

# Copy all server source (build context is the server/ directory)
COPY . .

# Compile TypeScript → dist/
RUN npm run build

# Strip devDependencies from the final image
RUN npm prune --omit=dev

EXPOSE 5000

CMD ["node", "dist/server.js"]
