FROM node:22-slim

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

# PRO-15: OCR (tesseract.js) and PDF parsing run inside this same API
# process with no memory ceiling — a burst of large uploads could grow the
# process until the container OOMs. This doesn't fix the underlying issue
# (moving that work to a separate worker so it can't take the API down with
# it — see PRO-15's suggested fix), but it bounds the damage: Node is killed
# and restarted by the platform's health check instead of silently degrading
# the whole instance. Override via the platform's env config if a given
# deployment's container has a different memory limit than the 512 MB this
# assumes.
ENV NODE_OPTIONS="--max-old-space-size=512"

# Run pending migrations before starting the server — node-pg-migrate exits
# non-zero on failure, which fails the container's healthcheck and the
# deploy (unlike the old migrate*.ts scripts, which logged and still exited
# 0). DATABASE_MIGRATOR_URL (corehealth_migrator — has CREATE on the
# database + CREATEROLE) overrides DATABASE_URL only for this one command;
# node dist/server.js afterwards still runs with the real DATABASE_URL
# (corehealth_app). Falls back to DATABASE_URL if DATABASE_MIGRATOR_URL is
# unset. See server/migrations/BASELINE.md before pointing this at the
# existing production database for the first time.
CMD ["sh", "-c", "DATABASE_URL=\"${DATABASE_MIGRATOR_URL:-$DATABASE_URL}\" node_modules/.bin/node-pg-migrate up && node dist/server.js"]
