# Core Health

A multi-tenant medical records and pharmacy platform. Patients hold their own
record; doctors write consultations and prescriptions against it; pharmacies
dispense those prescriptions; laboratories receive test requests and return
reports.

Built with PostgreSQL, Express and React (TypeScript throughout).

> This README was retitled and rewritten to answer DOC-01. It previously said
> "Pharmacy Management System", described a `server/config/db.js` layout that
> no longer exists, listed a `staff` role the application has never had, and
> had no section on running the tests, rolling back a deploy, or finding the
> logs.

## How it fits together

| Layer | Technology |
|---|---|
| Client | React 18, Vite, TypeScript, Tailwind, React Query, i18n (English/Sinhala) |
| API | Node 22, Express 5, TypeScript (strict), Socket.IO |
| Database | PostgreSQL 16+, row-level security on clinical data, schema-per-tenant |
| Auth | Short-lived JWT access tokens + revocable refresh tokens, TOTP MFA for admins |
| Jobs | pg-boss on the same PostgreSQL (OCR and PDF extraction) |
| Files | S3 when `AWS_S3_BUCKET` is set, local disk otherwise |
| Logs | pino, JSON, one object per line, request-ID correlated |
| Errors | Sentry, when `SENTRY_DSN` is set |

The database has three layers, and the distinction matters for almost every
change:

- **`public`** — shared identity: users, organisations, professional profiles,
  the audit log.
- **`clinical`** — patient data (consultations, prescriptions, lab requests,
  vitals), protected by row-level security. The application connects as
  `corehealth_app`, which is *not* a superuser and *not* `BYPASSRLS`, so those
  policies actually apply.
- **`tenant_<slug>`** — one schema per organisation for its own operational
  data: a pharmacy's medicines, suppliers, stock, orders and sales; a lab's
  test catalogue. This is what stops one pharmacy reading another's stock and
  cost prices.

See `MULTITENANT_GUIDE.md` for the full design and `docs/architecture.md` for a
component diagram.

## Running it locally

### 1. Database

```bash
createdb corehealth
```

Then either path — they produce the same schema, and CI verifies that:

```bash
# Preferred: incremental migrations. This is what CI and production use.
cd server && npm ci && npm run db:migrate

# Or, for a throwaway local database with sample data:
psql -d corehealth -f corehealth_database.sql      # DEVELOPMENT ONLY — drops everything first
psql -d corehealth -f corehealth_seed_data.sql
```

`corehealth_database.sql` begins by dropping every tenant schema, the clinical
schema and the public tables. **Never run it against a database with real data
in it.** Against an existing production database, read
`server/migrations/BASELINE.md` first.

### 2. API

```bash
cd server
cp .env.example .env     # fill in DATABASE_URL (or DB_*) and JWT_SECRET
npm ci
npm run dev              # http://localhost:5000
```

`docs/environments.md` documents every environment variable. The server
refuses to start if a required one is missing, rather than failing later in a
confusing way.

### 3. Client

```bash
cd client
npm ci
npm run dev              # http://localhost:5173
```

### 4. An admin account

No default admin exists, and no password is hard-coded anywhere (SEC-07). Set
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `server/.env`, then:

```bash
cd server && npm run db:seed
```

It creates exactly that one account, and refuses to run if those variables are
unset.

## Running the tests

```bash
# Server — unit tests only (no database needed; integration tests self-skip)
cd server && npm test

# Server — including the real-database integration tests. These are the ones
# that matter most: row-level security, tenant provisioning and the audit log
# can only be verified against a real PostgreSQL.
cd server
DATABASE_URL="postgresql://corehealth_app:<pw>@localhost:5432/corehealth" \
DB_SSL=false npm test

# Client
cd client && npm test
```

Run the integration tests as **`corehealth_app`**, not as a superuser. As a
superuser the row-level-security tests pass vacuously — a superuser bypasses
RLS entirely, so a test proving "a doctor without consent reads zero rows"
would prove nothing. CI does this deliberately; see `.github/workflows/ci.yml`.

Database diagnostics, run on demand:

```bash
cd server
npm run db:check:version      # server version and tuned settings (DB-01)
npm run db:check:bloat        # autovacuum state and table bloat (DB-11)
npm run queue:smoke-test      # pg-boss can create its own schema as the app role
npx tsx scripts/purgeSoftDeleted.ts   # dry run; --execute to actually delete
```

## Deploying, and rolling back

Currently deployed on Railway as two services (API and client), each with its
own Root Directory and `railway.toml`. AWS ECS is the target; the Terraform
skeleton is in `infra/terraform/`.

- **Deploy procedure:** `RAILWAY_DEPLOY.md`
- **Environments, URLs, who has access, where secrets live:** `docs/environments.md`
- **Rolling back:** `runbooks/rollback.md`

The short version of rollback: Railway dashboard → service → Deployments →
pick the last good one → Redeploy. If the bad deploy included a database
migration, **read the runbook first** — migrations are written additive-first
precisely so the previous code runs against the new schema, and the right
default is to roll back the code and leave the schema alone.

`.github/workflows/deploy.yml` implements the full build-once-promote pipeline
with a pre-migration snapshot, staging, an approval gate and post-deploy smoke
tests. It is **inactive until configured** — see the header of that file.

## When something is wrong

| What | Where |
|---|---|
| Runbooks | `runbooks/` — app down, rollback, database unreachable, restore from backup, missing uploads, suspected data exposure |
| Logs | Railway service logs. JSON, one object per line. Filter by `requestId` to follow a single request end to end. |
| A user's error report | The error response includes a `requestId`; it is also in the `x-request-id` response header. Search the logs for it. |
| Errors, grouped and released-tagged | Sentry, when `SENTRY_DSN` is set |
| Is it alive / can it serve? | `GET /api/health` (liveness, no database check) / `GET /api/ready` (also checks the database) |
| Business metrics | `GET /api/metrics/business` with an admin token — sign-ups, consultations, prescriptions, logins and failures over 1h/24h/7d |
| Who did what | `public.audit_log` — sign-ins, failed sign-ins, permission changes, deletions, and who viewed which patient record |

There is no dashboard or alerting yet: an external uptime check (MON-01), a
golden-signals dashboard (MON-02) and an alert channel that wakes someone
(MON-13) are all still open. Today a problem is found by a person noticing.

## Repository layout

```
client/                    React + Vite frontend (TypeScript)
  src/pages/               One file per screen, lazy-loaded by route
  src/components/          common/ (Modal, Table, StatCard…) and layout/
  src/context/             AuthContext, SocketContext
  src/services/api.ts      Axios instance: auth header, refresh-on-401, timeouts
  src/legal/               Terms/Privacy version constant
  src/locales/             en/ and si/ translations

server/                    Express API (TypeScript, strict)
  config/                  db, socket, logger, errorTracking, lifecycle, featureFlags
  controllers/             One per resource; __tests__/ alongside
  middleware/              auth, errorHandler, validate, rateLimiter, uploadQuota
  migrations/              Numbered SQL, applied by node-pg-migrate
  queue/                   pg-boss setup and the OCR/extraction jobs
  routes/                  One file per resource
  scripts/                 Operational scripts (purge, diagnostics, smoke tests)
  utils/                   fileStorage, auditLog, pagination, ocrParser

docs/                      Architecture, environments, retention, data inventory
runbooks/                  What to do when something is broken
infra/terraform/           AWS target infrastructure (not yet applied)
scripts/deploy/            Pre-migration snapshot, post-deploy smoke test
corehealth_database.sql    Full fresh-install schema (development only)
```

## Roles

| Role | What they can do |
|---|---|
| `patient` | Own record: consultations, prescriptions, lab reports, vitals, appointments. Grants and revokes doctor access. |
| `doctor` | Writes consultations and prescriptions for patients they treat; requests lab tests; sees a patient's history only where a treating relationship or granted access exists. |
| `pharmacist` | Their own pharmacy's catalogue, stock, orders and sales; dispenses prescriptions sent to that pharmacy. |
| `laboratory` | Test requests addressed to them; uploads reports. |
| `admin` | User and organisation management, approval of professional sign-ups, platform statistics. Can view the application as another user; every action in such a session is logged. |

Professional sign-ups (doctor, pharmacist, laboratory) are inactive until an
admin approves them — the role is chosen by the registrant and nothing
verifies a licence automatically.

## API

The API is large enough that an endpoint table in a README goes stale
immediately — the previous one listed endpoints that no longer exist and
omitted most of the application. Routes are grouped one file per resource in
`server/routes/`, each listing its own paths, middleware and authorisation in
a dozen lines. Start there.

Conventions that hold everywhere:

- `Authorization: Bearer <access token>`, 15-minute lifetime; the client
  refreshes automatically on a 401.
- List endpoints take `limit` and `offset`.
- Every `/api` response carries `Cache-Control: no-store` — responses can
  contain patient data.
- Errors return `{ message, requestId }`; the message is generic for a 500.
- Uploaded files are never static URLs. Each is served by an authenticated,
  ownership-checked endpoint, and a 404 deliberately does not distinguish
  "missing" from "not yours".

## Contributing

- **New to the project?** `docs/onboarding.md`.
- **Schema changes:** a new numbered file in `server/migrations/`, additive
  first (add, then remove in a later migration once nothing reads the old
  shape), mirrored into `corehealth_database.sql`. Both paths are tested in
  CI, and they have silently diverged before — see
  `server/controllers/__tests__/tenantProvisioning.integration.test.ts` for
  what that cost.
- **Decisions:** short records in `docs/decisions/`.
- **Pull requests:** `.github/pull_request_template.md`.
