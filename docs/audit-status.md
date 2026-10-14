# Production-readiness audit: status

Tracks the 234 checks in the audit series (`README.md` … `14-early-warning-routine-features.md`)
against what is now in the repository.

**Scope of this pass:** everything that could be fixed *in the project*. AWS
account work, platform configuration, team agreements and legal advice are
listed as outstanding with what specifically is needed — they are not marked
done, and nothing here claims an unverifiable result.

Original verdict: of 115 P0 checks, 1 passed, 24 failed, 27 partly failed, 59
could not be verified from the repository.

## P0 failures and partials: where each one stands

| ID | Was | Now | Note |
|---|---|---|---|
| ARCH-01 | FAIL | **Done** | `docs/architecture.md` |
| ARCH-04 | PARTIAL | **Done** | Runtime `config.js`, no production localhost origins, fail-fast on missing vars |
| ARCH-05 | PARTIAL | **Done** | Socket.IO Redis adapter when `REDIS_URL` is set |
| ARCH-06 | FAIL | **Done** | S3 when `AWS_S3_BUCKET` is set — must be set in any deployed environment |
| SEC-07 | PARTIAL | **Done** | Seed reads env vars and prints no password; gitleaks in CI with `fetch-depth: 0` |
| SEC-14 | FAIL | **Done** | TOTP MFA for admins; `REQUIRE_ADMIN_MFA` flag can make it mandatory |
| SEC-17 | PARTIAL | **Done** | All seven access-control sub-points; see note below |
| SEC-18 | FAIL | **Done** | `npm audit` in CI, both workspaces |
| SEC-19 | FAIL | **Done** | Non-root, multi-stage, pinned base, Trivy |
| SEC-20 | PARTIAL | **Done** | helmet + CSP on the API, `serve.json` on the client |
| SEC-21 | PARTIAL | **Done** | Generic 500s, `x-powered-by` off, `NODE_ENV` required |
| SEC-22 | FAIL | **Done** | `express-rate-limit` on login/registration/search/uploads, `trust proxy` set |
| SEC-28 | FAIL | **Done** | Static `/uploads` gone; authenticated ownership-checked endpoints |
| SEC-29 | PARTIAL | **Done** | No credential printing |
| SEC-32 | PARTIAL | **Done** | Node 22 LTS |
| DB-02 | FAIL | **Done** | `corehealth_app` is non-superuser, non-`BYPASSRLS`; proven by `rls.integration.test.ts` run as that role |
| DB-03 | PARTIAL | **Done** | `rejectUnauthorized: true` by default, CA pinning available |
| DB-04 | PARTIAL | **Done** | Pool max/idle/connection timeouts; arithmetic in `docs/environments.md` |
| DB-06 | PARTIAL | **Done** | `pg_trgm` GIN indexes |
| DB-07 | FAIL | **Done** | statement / idle-in-transaction / lock timeouts |
| DB-08 | PARTIAL | **Done** | Batched sale statements, `platform_stats_cache` |
| DB-12 | FAIL | **Done** | node-pg-migrate, numbered files, history table, run as a deploy step, fails the deploy |
| DB-13 | PARTIAL | **Done** | Destructive file labelled dev-only; additive-first rule written down |
| BKP-08 | PARTIAL | **Partly** | Depends on ARCH-06 (done). **Bucket versioning or replication is an AWS task.** |
| BKP-09 | FAIL | **Done** | `scripts/deploy/snapshot-database.sh`, snapshots and verifies before migrating |
| INF-02 | PARTIAL | **Done** | `GET /api/ready` checks the database |
| INF-03 | PARTIAL | **Done** | Health check points at readiness |
| INF-04 | FAIL | **Done** | Ordered graceful shutdown with a hard deadline |
| INF-05 | FAIL | **Done** | Timeouts on the HTTP server, the pool, statements and the client |
| INF-06 | PARTIAL | **Done** | `restartPolicyType = "always"`, crash handlers. **Container memory limit is a platform setting.** |
| PERF-03 | PARTIAL | **Done** | compression + cache headers |
| PERF-04 | PARTIAL | **Done** | `limit`/`offset` on every list endpoint |
| CICD-01 | PARTIAL | **Written** | `deploy.yml` waits on CI — **needs enabling** |
| CICD-03 | PARTIAL | **Done** | Lint gates, client tests, gitleaks, audit, Trivy, licences |
| CICD-04 | FAIL | **Written** | Build once, promote by SHA — **needs enabling** |
| CICD-05 | PARTIAL | **Written** | Deploy by image tag — **needs enabling** |
| CICD-06 | FAIL | **Blocked** | Staging job exists; **creating the environment is a platform task** |
| CICD-07 | PARTIAL | **Done** | Its four dependencies (INF-02/04, DB-12) are done |
| CICD-08 | FAIL | **Done** | `runbooks/rollback.md` |
| CICD-09 | FAIL | **Done** | `scripts/deploy/smoke-test.sh` |
| AUTO-01 | FAIL | **Partly** | Terraform written for the AWS target; **Railway dashboard config stays prose** |
| AUTO-03 | PARTIAL | **Done** | `npm ci`, pinned bases, unused root build files deleted |
| MON-05 | FAIL | **Done** | Sentry both sides, release-tagged. **Needs a DSN to do anything.** |
| MON-10 | FAIL | **Done** | pino JSON + request ID in a response header |
| COMP-02 | FAIL | **Partly** | Documents published and the accepted version recorded. **Needs legal review; existing users need re-acceptance.** |
| DOC-01 | PARTIAL | **Done** | README rewritten |
| DOC-02 | FAIL | **Done** | `docs/environments.md` |
| PRO-06 | FAIL | **Done** | Server-side validation; prices from the database |
| PRO-12 | PARTIAL | **Done** | `Idempotency-Key`; receive-once guarded |
| PRO-29 | PARTIAL | **Done** | CHECK constraints, relative stock updates, 23505 → 409 |
| WARN-19 | FAIL | **Done** | `npm audit` + Dependabot. **Dependabot *alerts* need a repo admin toggle.** |

## P1 and P2

Done: SEC-15, SEC-24, SEC-25, DB-15, INF-11, PERF-06, PERF-10, CICD-12,
CICD-13 (wired), AUTO-08, MON-06, MON-07, MON-12, COMP-03, COMP-05, COST-04,
DOC-03, DOC-04, PRO-01…PRO-05, PRO-07…PRO-11, PRO-14, PRO-15, PRO-17, PRO-22,
PRO-25, PRO-30, FEAT-01.

Deliberately not done:

| ID | Why |
|---|---|
| DB-10 | Read replica. The audit itself says "acceptable at launch; add one when reports start to slow down normal use." |
| CICD-10 | Manual approval. The workflow uses a GitHub environment — **adding required reviewers is a Settings change.** |
| CICD-15, AUTO-09 | P2, explicitly "plan for later" |
| COMP-04 | Retention schedule written; **periods need legal confirmation (COMP-01) before automating an irreversible delete.** |
| INF-09 | Every code prerequisite is done (S3, Redis adapter, WebSocket-only, graceful shutdown). **Actually running two instances is a platform change.** |

## Outstanding, grouped by who can do it

### AWS / platform
- Set `AWS_S3_BUCKET`, `AWS_REGION`, `REDIS_URL`, `SENTRY_DSN`, SMTP (`docs/environments.md`)
- Bucket versioning or cross-region replication (BKP-08)
- Backups + point-in-time recovery, then **one tested restore, timed** (BKP-02, BKP-05) — `runbooks/restore-from-backup.md` is the procedure
- Create staging (CICD-06); enable `deploy.yml` (its header lists the five steps)
- Container memory limits (INF-06, PRO-15); run two instances (INF-09)
- Database in a private network, encryption at rest (SEC-11, SEC-27)
- Uptime check, dashboard, alert channel (MON-01, MON-02, MON-13, MON-14)
- Certificate and domain expiry alerts (MON-15, WARN-15)
- Budget and spending alerts (COST-01, WARN-20)
- Apply the Terraform in `infra/terraform/` — never run, no AWS credentials used

### GitHub settings
- Branch protection on `main` (CICD-02)
- Required reviewers on the `production` environment (CICD-10)
- Dependabot **alerts** (WARN-19's remaining half) — Settings → Code security

### Legal
- Which statutes apply, and the breach-notification deadline (COMP-01). Two
  blanks in `runbooks/suspected-data-exposure.md` wait on this.
- Review the Terms and Privacy Policy, then flip `LEGAL_REVIEWED` in
  `client/src/legal/index.ts`
- Confirm retention periods in `docs/data-retention.md`

### Team agreements
- On-call owner, escalation, severity levels, named communicator, two people
  per critical task (INC-01, INC-02, INC-04, INC-05) — gaps marked in
  `runbooks/README.md`
- Availability target (INF-01), RPO/RTO (BKP-01), performance targets (PERF-01)
- Access review, offboarding, rotation (SEC-05, SEC-06, SEC-10)

### Still genuine product work
- Re-acceptance prompt for users with `accepted_terms_version IS NULL` (COMP-02)
- Email verification before an account can act (PRO-11's remaining half)
- Retention for notifications, messages and vitals — nothing deletes them (PRO-04)
- Virus scanning on upload (PRO-07)
- A load test at twice peak (PERF-02); a penetration test (SEC-26)
- Move the OCR worker to its own process (PRO-15, PERF-06's remaining half)

## Found while fixing, not in the audit

Four bugs that would each have broken a fresh AWS deployment on day one. All
four came from the same root cause the audit named in DB-12 — two sources of
schema truth that had silently diverged.

1. SEC-17 #4 (tenant-scoped medicines) only ever updated
   `corehealth_database.sql`. The migration path still built the old shared
   tables, so every medicine, supplier and inventory endpoint queried a table
   that did not exist.
2. Migration 002's `deleted_at` and CHECK constraints never reached the
   per-tenant medicines table, so the medicines list was broken even on a
   db.sql-built database.
3. `provision_tenant()` is `SECURITY DEFINER` owned by `corehealth_migrator`,
   which had schema grants but no table grants — organisation self-registration
   failed with "permission denied for table organizations".
4. SEC-17 #4 dropped `public.medicines` but left two trigram indexes on it, so
   `corehealth_database.sql` had failed on a fresh install ever since.

Also: `purgeSoftDeleted.ts` still targeted `public.medicines` and would have
crashed on its next run.

Fixed in migration 006 and guarded by
`server/controllers/__tests__/tenantProvisioning.integration.test.ts`, which
asserts the end state against a real database rather than trusting a
keep-these-in-step comment. CI now runs the full suite against both install
paths.

## How this was verified

- 76 server tests, 12 suites, against databases rebuilt from scratch by
  **both** install paths — migrations and `corehealth_database.sql`
- 10 client tests
- Both workspaces build and lint; all workflow files parse; shell scripts pass
  `bash -n`
- The purge script dry-runs clean

Not verified, and not claimed: `deploy.yml` and the two deploy scripts have
never run — they need platform credentials. The Terraform has never been
applied.
