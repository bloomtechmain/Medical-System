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
| Runs on | Your machine (`npm run dev`) or `docker-compose up` | AWS — ECS + RDS + S3/CloudFront, applied 2026-10-19 (`infra/terraform/`, `staging.tfvars`) | AWS, as of the suwela.com cutover ([0006](decisions/0006-three-domain-split.md)) — same shape, `production.tfvars` |
| Database | Local PostgreSQL, or the compose `db` service | Own RDS instance, never shared with production | Managed PostgreSQL (RDS), private network only |
| Data | Seed data (`corehealth_seed_data.sql`) | Anonymised or synthetic only — **never a copy of production** | Test/demo data only as of 2026-10-27 — pre-launch, no real patients yet. Update this row the day that stops being true; everything above it (deploy review, who-can-read-the-DB) starts mattering for real at that point, not before. |
| Who can deploy | n/a | Anyone, via CI on merge, once `DEPLOY_ENABLED=true` is set (currently unset — see `deploy.yml`'s header; staging so far was applied by hand, not through this pipeline) | Requires review (CICD-10) |
| Who can read the database | You | The team | Named individuals only, via the platform console; see DB-05 |
| Client URL | `http://localhost:5173` | CloudFront's own `*.cloudfront.net` domain (no custom domain on staging) | `https://www.suwela.com` |
| API URL | `http://localhost:5000` | The ALB's own `*.elb.amazonaws.com` domain | `https://api.suwela.com` |

**CICD-06 (staging didn't exist) is resolved** — staging has run on AWS since
2026-10-19. It was applied directly, outside `deploy.yml` (`DEPLOY_ENABLED` is
still unset), so `main` still deploys straight to production once that flag
flips; flipping it is what actually closes the loop this row used to
describe as open.

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
| `CLIENT_URL` | Required in production only. The client's public origin, used for CORS and for links in emails — under the three-subdomain split ([0006](decisions/0006-three-domain-split.md)) this is always the site zone, `https://www.suwela.com`, never `app.` or `dashboard.`. |
| `EXTRA_CORS_ORIGINS` | Optional, comma-separated. Additional origins allowed to call the API — `https://app.suwela.com,https://dashboard.suwela.com` — without changing what `CLIENT_URL` means for email links. |

### Required where the feature is used

| Variable | Needed for |
|---|---|
| `DATABASE_MIGRATOR_URL` | Connection string for `corehealth_migrator` (has `CREATE` on the database + `CREATEROLE`). Used **only** by the migration step in the Dockerfile `CMD`; the server itself runs as `corehealth_app`. Falls back to `DATABASE_URL` if unset. See `server/migrations/BASELINE.md` before first use against an existing database. |
| `AWS_S3_BUCKET`, `AWS_REGION` | Uploads go to S3 instead of local disk (ARCH-06, PRO-05). Without these, files are written to the container's ephemeral disk and lost on every redeploy — acceptable locally, **not** in production. |
| `REDIS_URL` | Socket.IO Redis adapter (ARCH-05). Without it, a notification only reaches users connected to the same instance, so the API cannot correctly run more than one instance (INF-09). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` | Password-reset emails. Without them, `config/mailer.ts` logs the message instead of sending it — fine in development, means nobody can reset a password in production. |
| `SENTRY_DSN` | Error tracking (MON-05). Inert without it: errors are logged but not reported anywhere. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `npm run db:seed` only. No default exists any more (SEC-07) — the seed refuses to run without them. Never set these in production. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Virus scanning on upload (PRO-07). Without `CLAMAV_HOST` every upload is accepted unscanned and a warning is logged per upload. Port defaults to 3310. |

### Queue worker placement (PRO-15)

| Variable | Default | Purpose |
|---|---|---|
| `QUEUE_WORKER_MODE` | `inline` | `inline` = the API process runs the OCR/extraction workers itself (unchanged behaviour). `separate` = the API only enqueues and `server/worker.ts` processes, in its own process with its own memory limit. **Must be set to the same value on both processes** — the worker refuses to start if it would process nothing. |
| `WORKER_HEALTH_PORT` | `5001` | The worker serves only `/health` and `/ready` on this port, so a platform health check has something to probe. It serves no API routes, deliberately. |

Run `separate` in any environment where upload volume is real: tesseract.js
and pdfjs-dist are the memory-hungry paths, and `inline` means a burst of
large uploads can OOM the API and take in-flight clinical requests with it.
See `docker-compose.yml` for a working two-process setup.

### Rate limits (PRO-08) — all optional

Window and ceiling for each limiter, so a deployment behind a CDN or a shared
corporate NAT can be tuned without a code change. Defaults are the values
that were previously hardcoded.

| Variable | Default | Applies to |
|---|---|---|
| `RATE_LIMIT_GENERAL_MAX` / `_WINDOW_MS` | 300 / 60 s | Everything under `/api` |
| `RATE_LIMIT_AUTH_MAX` / `_WINDOW_MS` | 10 / 15 min | Login, registration, verification, password reset |
| `RATE_LIMIT_PUBLIC_FORM_MAX` / `_WINDOW_MS` | 5 / 60 min | Public organisation registration |
| `RATE_LIMIT_SEARCH_MAX` / `_WINDOW_MS` | 60 / 60 s | Search endpoints, including the two needing no login |
| `RATE_LIMIT_UPLOAD_MAX` / `_WINDOW_MS` | 20 / 60 s | File uploads, keyed per user |

A load test from a single address will hit `RATE_LIMIT_GENERAL_MAX` and
measure the limiter rather than the server — raise it deliberately for the
run (see `docs/capacity-plan.md`).

### Upload quota (COST-04) and retention (PRO-04) — all optional

| Variable | Default | Purpose |
|---|---|---|
| `UPLOAD_QUOTA_DAILY_BYTES` | 500 MB | Rolling 24h upload budget per user |
| `UPLOAD_QUOTA_TOTAL_BYTES` | 2 GB | Lifetime stored-bytes budget per user |
| `RETAIN_NOTIFICATIONS_DAYS` | 365 | Age-based purge, `purgeSoftDeleted.ts` |
| `RETAIN_MESSAGES_DAYS` | 365 | Chat threads |
| `RETAIN_IMPERSONATION_DAYS` | 730 | Security audit trail — longer on purpose |
| `CLAMAV_FAIL_OPEN` | unset (closed) | `true` accepts an upload when scanning cannot be completed. Default rejects, so a clamd outage cannot silently become "no scanning". |

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
| `FEATURE_REQUIRE_EMAIL_VERIFICATION` | `true` | PRO-11. Refuses login until the registration address is confirmed. Needs a mail path: without `SMTP_HOST` the link is logged to the console (fine locally, **not** in production). Set `false` only if an environment has no mail path at all. |
| `FEATURE_OCR_PROCESSING` | `true` | CICD-12. `false` keeps uploads working and skips extraction. |
| `FEATURE_PUBLIC_ORG_REGISTRATION` | `true` | CICD-12. `false` returns 503 on the public registration endpoint. |
| `FEATURE_REQUIRE_ADMIN_MFA` | `false` | CICD-12. `true` refuses admin logins that have not enrolled in MFA. |
| `CLAMAV_TIMEOUT_MS` | `30000` | How long to wait for clamd before treating the scan as incomplete. |
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
| `SITE_URL` / `APP_URL` / `DASHBOARD_URL` | Container start | The three-subdomain split ([0006](decisions/0006-three-domain-split.md)): `https://www.suwela.com`, `https://app.suwela.com`, `https://dashboard.suwela.com`. All three or none — leave unset for a single-domain deployment (dev, a preview URL), which disables every zone redirect in `src/utils/zones.ts`. |
| `VITE_SENTRY_DSN` | Build | Client error tracking (MON-05). Inert without it. |
| `VITE_GIT_COMMIT_SHA` | Build | Release tag for client Sentry events. |

## Domains (suwela.com)

[0006](decisions/0006-three-domain-split.md) covers the design. This is the
checklist to point `suwela.com` (Cloudflare) at AWS production — ECS/ALB for
the API, S3/CloudFront for the client (`infra/terraform/`), no Railway
involved. `AWS_PROFILE=corehealth-prod` is the project's AWS account
(`336246706489`) — always verify with `aws sts get-caller-identity` before
running Terraform here; the CLI's `default` profile is a different,
unrelated account.

1. **Request ACM certificates** (done — 2026-10-27, pending DNS validation):
   - CloudFront cert, **us-east-1** (required regardless of `aws_region` —
     a CloudFront-specific rule), covering `www.suwela.com` +
     SANs `app.suwela.com`, `dashboard.suwela.com`:
     `arn:aws:acm:us-east-1:336246706489:certificate/f27c1385-b906-4dff-b0e3-e874e243e6a8`
   - ALB/API cert, **ap-south-1**, covering `api.suwela.com`:
     `arn:aws:acm:ap-south-1:336246706489:certificate/1962d059-7aa9-428f-ae9f-e4525afbadfd`

2. **Add the ACM validation CNAMEs in Cloudflare** (DNS-only / grey cloud —
   these are validation records, not traffic). Whoever has Cloudflare
   dashboard access adds these directly; no `wrangler login` needed for just
   four records:

   | Name | Type | Value |
   |---|---|---|
   | `_833e81f6d577b1a8ed03381eee6098da.www` | CNAME | `_f01c975c93c53a29da5a9704fab0a186.wzccmgtwzk.acm-validations.aws.` |
   | `_20f493c2f3bee831f2ab2f808bd3b076.app` | CNAME | `_0d42aaea8927841ddcaf8af2206efa8b.wzccmgtwzk.acm-validations.aws.` |
   | `_3ebeb8d17ac8d08f7f7677b3ccfdb060.dashboard` | CNAME | `_3937d534397e8913d2e9f377f6f005fa.wzccmgtwzk.acm-validations.aws.` |
   | `_6cb21207e4dd8834e2d31b8680bcefa4.api` | CNAME | `_8f374b870ff410b5e8eeec2b159018e2.wzccmgtwzk.acm-validations.aws.` |

   ACM issues both certs automatically within minutes to ~30 min of these
   resolving. Poll with:
   `aws acm describe-certificate --region <region> --certificate-arn <arn> --query Certificate.Status`
   — `ISSUED` means done.

3. **Fill in the real cert ARNs** in `infra/terraform/production.tfvars`
   (currently placeholders — `alb_acm_certificate_arn` and
   `cloudfront_acm_certificate_arn`) once both show `ISSUED`, then
   `terraform plan`/`apply` the `production` workspace. This is a from-
   scratch apply — no production AWS infra exists yet (verified directly:
   no ECS cluster, RDS instance, S3 bucket or CloudFront distribution named
   `production-corehealth-*` exists in the account as of 2026-10-27).
   Staging already exists and is unaffected.

4. **Add the final traffic CNAMEs in Cloudflare**, all proxied (orange
   cloud — Cloudflare's TLS/DDoS/caching in front; the origin only needs to
   accept HTTPS from Cloudflare, which CloudFront and the ALB both do):

   | Type | Name | Target | Proxy |
   |---|---|---|---|
   | CNAME | `www` | `terraform output cloudfront_domain_name` | Proxied |
   | CNAME | `app` | same CloudFront domain — one distribution, three aliases | Proxied |
   | CNAME | `dashboard` | same CloudFront domain again | Proxied |
   | CNAME | `api` | `terraform output alb_dns_name` | Proxied |
   | Redirect Rule (not DNS) | `suwela.com/*` (apex) | → `https://www.suwela.com/$1`, 301 | — |

   The apex redirect is a Cloudflare **Redirect Rule** (Rules → Redirect
   Rules), not a DNS record — simpler than CNAME-flattening the zone root
   onto CloudFront, and `zones.ts` never needs to know the bare apex exists.

5. **Set env vars from the Terraform outputs** — on the `production` ECS
   task (via `infra/terraform/production.tfvars`'s `site_domain_name` /
   `extra_cors_origins`, already set to the suwela.com values, so this is
   automatic on apply) and on the GitHub Actions `production` environment
   (`.github/workflows/deploy.yml`'s header lists exactly which repo
   variables, including `SITE_URL`/`APP_URL`/`DASHBOARD_URL`, now that
   production deploys to AWS like staging does).

6. **Verify**, in order: both certs `ISSUED`; `dig www.suwela.com` /
   `app.suwela.com` / `dashboard.suwela.com` / `api.suwela.com` resolve;
   each loads over HTTPS with a valid (not self-signed) cert; logging in at
   `www.suwela.com/login` as a non-admin role lands on `app.suwela.com` at
   that role's dashboard with the URL fragment gone; logging in as `admin`
   lands on `dashboard.suwela.com/admin`; a direct, unauthenticated visit to
   `app.suwela.com/doctor` or `dashboard.suwela.com` bounces to
   `www.suwela.com/login`.

## Platform configuration not in code

**Railway is retired as of the suwela.com cutover (2026-10-27)** — both
staging and production now run on AWS (previous section). `server/
railway.toml` and `client/railway.toml` are left in the repo as a reference
for what Railway's dashboard had configured (builder, health check path,
restart policy) in case a rollback is ever needed, not because anything
still deploys there. The Railway services themselves have not been deleted —
that's a separate, deliberate decommissioning step for whoever holds the
Railway account, not something to do silently as part of a domain change.

AUTO-01 (historical): the services, database, domains and variables were
created by hand in the Railway dashboard; nothing about that process could
live in code, which was the original finding this section documented.

For the AWS target, the equivalent configuration *is* in code —
`infra/terraform/`, with `staging.tfvars` and `production.tfvars`.

## See also

- `RAILWAY_DEPLOY.md` — the current manual deploy procedure
- `runbooks/` — what to do when something is wrong, including rollback
- `docs/architecture.md` — what talks to what
- `server/migrations/BASELINE.md` — first-time migration adoption
- `server/.env.example` — copy this to start locally
