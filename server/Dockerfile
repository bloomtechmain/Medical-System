# Build context is the server/ directory (Railway Root Directory = /server,
# same context works unchanged for ECR/ECS). Do NOT reference ../client here —
# the client is a separate deploy (S3/CloudFront).

FROM node:22.12.0-slim AS builder

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
# AUTO-03: npm ci, not npm install. `install` is free to resolve a newer
# matching version than package-lock.json records, so two builds of the same
# commit could ship different dependency trees — which defeats the point of
# building an image once and promoting it (CICD-04). `ci` installs exactly
# the lockfile and fails if the two have drifted.
# --include=dev because vite/typescript/tsc are needed to build, and this
# stage is discarded anyway (npm prune below, then a fresh runtime stage).
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime image: same canvas libs, but shared runtime .so's only ----
FROM node:22.12.0-slim

# SEC: apt-get upgrade picks up Debian security patches (e.g. libgnutls30,
# perl-base) released after this base image tag was built — node:22.12.0-slim
# is a fixed snapshot and doesn't track them on its own. Removing the global
# npm/npx afterward drops its bundled `tar` dependency (a separate CVE
# source) along with it; nothing in this image's CMD invokes npm — migrations
# run via node_modules/.bin/node-pg-migrate and the server via `node
# dist/server.js` directly.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpng16-16 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app
# --chown: the "node" user (uid 1000, built into the official image) owns
# these from the start — SEC-19, don't run the container as root.
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
# node-pg-migrate (run by the CMD below) reads .sql files directly, not the
# compiled dist/ output — never hit on Railway, where deploy.yml runs
# migrations as a separate CI step against the full checkout before the
# image is even built; ECS runs them from inside this container instead, so
# the folder actually has to be here.
COPY --from=builder --chown=node:node /app/migrations ./migrations

USER node

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

# MON-05/MON-10: baked in at build time so every log line and every Sentry
# event carries the release, which is what makes "did the 14:00 deploy cause
# this" answerable. Passed by .github/workflows/deploy.yml; defaults to
# "unknown" for a local build, same as the code's own fallback.
ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

# Matches the existing GET /api/health route — used by the ALB target group
# and/or ECS container health check once this runs on EC2.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Run pending migrations before starting the server — node-pg-migrate exits
# non-zero on failure, which fails the container's healthcheck and the
# deploy (unlike the old migrate*.ts scripts, which logged and still exited
# 0). DATABASE_MIGRATOR_URL (corehealth_migrator — has CREATE on the
# database + CREATEROLE) overrides DATABASE_URL only for this one command;
# node dist/server.js afterwards still runs with the real DATABASE_URL
# (corehealth_app). Falls back to DATABASE_URL if DATABASE_MIGRATOR_URL is
# unset, and further falls back to building one from the discrete DB_HOST/
# DB_PORT/DB_NAME/DB_USER/DB_PASSWORD vars (same fallback db.ts already
# supports, see docs/environments.md) when neither URL var is set — this is
# what ECS uses, since it injects DB_USER/DB_PASSWORD from Secrets Manager
# as discrete values rather than a pre-built connection string. See
# server/migrations/BASELINE.md before pointing this at the existing
# production database for the first time.
CMD ["sh", "-c", "DATABASE_URL=\"${DATABASE_MIGRATOR_URL:-${DATABASE_URL:-postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=no-verify}}\" node_modules/.bin/node-pg-migrate up --ignore-pattern \"BASELINE.*\" && node dist/server.js"]
