# Build context is the server/ directory (Railway Root Directory = /server,
# same context works unchanged for ECR/ECS). Do NOT reference ../client here —
# the client is a separate deploy (S3/CloudFront).

FROM node:20.18.1-slim AS builder

# Canvas build toolchain + headers (fallback if prebuilt binaries unavailable
# for this platform/arch) — stays in this stage only, not in the final image.
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
COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime image: same canvas libs, but shared runtime .so's only ----
FROM node:20.18.1-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpng16-16 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# --chown: the "node" user (uid 1000, built into the official image) owns
# these from the start — SEC-19, don't run the container as root.
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

EXPOSE 5000

# Matches the existing GET /api/health route — used by the ALB target group
# and/or ECS container health check once this runs on EC2.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
