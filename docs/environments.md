# Environments

Answers DOC-02: which environments exist, where they are, who can reach them,
and where the secrets live. Keep this current — it is the page someone reads at
2am, and a stale entry here is worse than no entry.

> **Nothing in this file is a secret.** Variable *names* and the *location* a
> value is stored in are documented; values never are. If you find a value in
> here, treat it as leaked and rotate it.

## The environments

| | Development | Staging | Production |
|---|---|---|---|
| Purpose | Local work | Pre-production verification | Live service |
| Runs on | Your machine (`npm run dev`) or `docker-compose up` | *Not created yet* — see below | Railway today; AWS ECS is the target (`infra/terraform/`) |
| Database | Local PostgreSQL, or the compose `db` service | Own database, never shared with production | Managed PostgreSQL, private network only |
| Data | Seed data (`corehealth_seed_data.sql`) | Anonymised or synthetic only — **never a copy of production**, it holds real patient records | Real patient data |
| Who can deploy | n/a | Anyone, via CI on merge | Requires review (CICD-10) |
| Who can read the database | You | The team | Named individuals only, via the platform console; see DB-05 |
| Client URL | `http://localhost:5173` | TBC | Set as `CLIENT_URL` on the API service |
| API URL | `http://localhost:5000` | TBC | Set as `API_URL` on the client service |

**Staging does not exist yet.** This is CICD-06, still open. Until it does,
`main` deploys straight to production after CI, which means CI is the only gate.
Creating it is a platform task (a second Railway environment, or a second ECS
service + database from the Terraform in `infra/terraform/` with
`staging.tfvars`), not a code change.

## Where secrets live

| Environment | Store | Who has access |
|---|---|---|
| Development | `server/.env`, git-ignored. Copy `server/.env.example` and fill it in. | You, locally. Never commit it — CI runs gitleaks over the full history (SEC-07). |
| Staging / Production (Railway) | Railway service variables, per service, per environment | Railway project members |
| Production (AWS target) | AWS Secrets Manager; see `infra/terraform/secrets.tf`. ECS task definitions reference secrets by ARN so values never appear in the task definition, the repository, or CI logs. | The ECS task execution role, plus named IAM users |

Rules that apply everywhere:

- **Different values per environment** (SEC-09). Staging and production must
  never share a `JWT_SECRET` — a staging token would otherwise be a valid
  production session.
- Rotating `JWT_SECRET` logs every user out, because there is no support for
  two valid keys at once (SEC-10). Plan it, don't do it casually.
- Secrets are never passed as Docker build arguments. The client reads its API
  URL at *runtime* from `config.js` (ARCH-04), which is why one image works in
  every environment.

## Environment variables — API service

The server refuses to start if a required variable is missing, rather than
failing later in a confusing way (ARCH-04, `server/server.ts`).

### Required

| Variable | Notes |
|---|---|
| `NODE_ENV` | `development` \| `production` \| `test`. Must be set explicitly — an unset value used to mean stack traces leaked to clients (SEC-21). |
| `JWT_SECRET` | Signs access and pre-auth tokens. |
| `DATABASE_URL` | Connection string for `corehealth_app` — the non-superuser, non-`BYPASSRLS` role (DB-02). **Not** a superuser: row-level security is the patient-data protection, and a superuser bypasses it entirely. |
| `CLIENT_URL` | Required in production only. The client's public origin, used for CORS and for links in emails. |

### Required where the feature is used

| Variable | Needed for |
|---|---|
| `DATABASE_MIGRATOR_URL` | Connection string for `corehealth_migrator` (has `CREATE` on the database + `CREATEROLE`). Used **only** by the migration step in the Dockerfile `CMD`; the server itself runs as `corehealth_app`. Falls back to `DATABASE_URL` if unset. See `server/migrations/BASELINE.md` before first use against an existing database. |
| `AWS_S3_BUCKET`, `AWS_REGION` | Uploads go to S3 instead of local disk (ARCH-06, PRO-05). Without these, files are written to the container's ephemeral disk and lost on every redeploy — acceptable locally, **not** in production. |
| `REDIS_URL` | Socket.IO Redis adapter (ARCH-05). Without it, a notification only reaches users connected to the same instance, so the API cannot correctly run more than one instance (INF-09). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` | Password-reset emails. Without them, `config/mailer.ts` logs the message instead of sending it — fine in development, means nobody can reset a password in production. |
| `SENTRY_DSN` | Error tracking (MON-05). Inert without it: errors are logged but not reported anywhere. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `npm run db:seed` only. No default exists any more (SEC-07) — the seed refuses to run without them. Never set these in production. |

### Optional, with defaults

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | |
| `LOG_LEVEL` | `info` in production, `debug` otherwise | pino level (MON-10) |
| `GIT_COMMIT_SHA` | `unknown` | Tags every log line and Sentry event with the release. Railway provides `RAILWAY_GIT_COMMIT_SHA`, which is read as a fallback. Set it in CI so a spike can be tied to a deploy. |
| `JWT_EXPIRES_IN` | `15m` | Access-token lifetime. Short by design; refresh tokens are revocable. |
| `TRUST_PROXY_HOPS` | `1` | Number of reverse proxies in front. Wrong value = rate limits count the proxy's address instead of the visitor's (PRO-08). |
| `HTTP_REQUEST_TIMEOUT_MS` | `30000` | INF-05. Must stay longer than the database statement timeout. |
| `HTTP_HEADERS_TIMEOUT_MS` | `35000` | INF-05 |
| `HTTP_KEEPALIVE_TIMEOUT_MS` | `65000` | INF-05. Keep above the load balancer's idle timeout to avoid races on connection reuse. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful-shutdown deadline (INF-04). Keep below the platform's SIGKILL grace period. |
| `DB_POOL_MAX` | `10` | DB-04. The arithmetic that matters: `DB_POOL_MAX × instances + headroom for psql/migrations < the database's max_connections`. |
| `DB_POOL_IDLE_TIMEOUT_MS` | `30000` | DB-04 |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | `5000` | DB-04 |
| `DB_STATEMENT_TIMEOUT_MS` | `5000` | DB-07 |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `10000` | DB-07 |
| `DB_LOCK_TIMEOUT_MS` | `3000` | DB-07 |
| `DB_SSL` | on when `DATABASE_URL` is set | DB-03 |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | DB-03. Set `false` **only** for a local database with a self-signed certificate. |
| `DB_SSL_CA` | — | PEM contents of the provider's CA, to pin it instead of trusting the system store. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Performance tracing off by default — this is an error tracker first. |
| `PLATFORM_STATS_TTL_MS` | see `userController.ts` | Admin-dashboard stats cache staleness window (DB-08) |
| `PURGE_RETENTION_DAYS` | see `scripts/purgeSoftDeleted.ts` | How long soft-deleted rows survive before a real delete (PRO-25, COMP-04) |

### Local-only alternative to `DATABASE_URL`

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — used when
`DATABASE_URL` is unset. Convenient locally; prefer `DATABASE_URL` everywhere
else, since only that path enables TLS by default.

## Environment variables — client service

The client is a static bundle. Only `API_URL` is read at runtime; the rest are
build-time and are compiled into the bundle, so **never put a secret in a
`VITE_` variable** — anyone can read it in the browser.

| Variable | When | Notes |
|---|---|---|
| `API_URL` | Container start | Written into `dist/config.js` by `docker-entrypoint.sh`. This is what lets one image run in any environment (ARCH-04). Set it to the API service's public URL. |
| `VITE_API_URL` | Build | Fallback for `npm run dev`, where no entrypoint writes `config.js`. Still read during the transition; prefer `API_URL`. |
| `VITE_SENTRY_DSN` | Build | Client error tracking (MON-05). Inert without it. |
| `VITE_GIT_COMMIT_SHA` | Build | Release tag for client Sentry events. |

## Platform configuration not in code

AUTO-01: the services, database, domains and variables are created by hand in
the Railway dashboard. `server/railway.toml` and `client/railway.toml` hold
everything Railway reads from the repository — builder, health check path and
restart policy — and nothing else can live there.

Each service has its **Root Directory** set in the dashboard (`/server` and
`/client`), which is what makes each read its own `railway.toml` and restricts
its build context. There is deliberately no root-level `railway.toml` or
`nixpacks.toml`: neither service ever read them, and their presence suggested
otherwise (AUTO-03).

For the AWS target, the equivalent configuration *is* in code —
`infra/terraform/`, with `staging.tfvars` and `production.tfvars`.

## See also

- `RAILWAY_DEPLOY.md` — the current manual deploy procedure
- `runbooks/` — what to do when something is wrong, including rollback
- `docs/architecture.md` — what talks to what
- `server/migrations/BASELINE.md` — first-time migration adoption
- `server/.env.example` — copy this to start locally
