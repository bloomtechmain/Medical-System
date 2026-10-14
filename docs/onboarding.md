# Onboarding

Answers DOC-03. For someone joining the project: what to install, what to
read, and the handful of things about this codebase that are not obvious and
will cost you a day if nobody says them.

Target: a working local environment and a real feature walked end to end,
inside a day.

## Day one: get it running

You need Node 22 (the version CI and the Dockerfiles use — a different major
will produce lockfile churn), PostgreSQL 16+, and git.

```bash
git clone <repo> && cd Medical-System

createdb corehealth
cd server && npm ci && npm run db:migrate

cp .env.example .env     # set DATABASE_URL (or DB_*) and JWT_SECRET
# Add SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, then:
npm run db:seed

# Sample doctors, patients, pharmacies, lab results — local only
psql -d corehealth -f ../corehealth_seed_data.sql

npm run dev              # API on :5000

# second terminal
cd client && npm ci && npm run dev    # client on :5173
```

Log in as the admin you seeded. If the API refuses to start, read the message:
it fails fast on a missing required variable on purpose, and the message names
the variable. `docs/environments.md` lists them all.

## Then walk the main flow

Do this before writing any code. It is the fastest way to understand the
domain, and most bugs here are about who may see what rather than about
rendering.

1. Register a patient. Note it is active immediately.
2. Register a doctor. Note it is **not** — an admin has to approve it, because
   nothing verifies a medical licence automatically.
3. Approve the doctor as admin.
4. As the doctor, write a consultation for the patient with a prescription.
5. Send the prescription to a pharmacy. Log in as that pharmacist and see it
   arrive — and see that the pharmacist can see *the prescription* and not the
   patient's wider history.
6. As the doctor, request a lab test. As the laboratory, upload a report.
   Watch vitals appear on the patient's record automatically (OCR).
7. Try to open a different patient's record as that doctor. You should get a
   404 that is deliberately indistinguishable from "no such patient".

Step 7 is the heart of the system. If you understand why it is a 404 and not a
403, you understand the access model.

## What to read, in this order

| | Why |
|---|---|
| `README.md` | Layout, commands, where things live |
| `docs/architecture.md` | What talks to what |
| `MULTITENANT_GUIDE.md` | The three-layer database design. **The most important document here.** |
| `docs/personal-data-inventory.md` | Which table holds which personal data and who can reach it |
| `docs/environments.md` | Environments, variables, where secrets live |
| `runbooks/README.md` | Skim now so you know it exists before you need it |
| `docs/decisions/` | Why things are the way they are |

## Six things that will catch you out

**1. There are three database layers, and picking the wrong one is the most
common mistake.** `public` for identity, `clinical` for patient data (row-level
security), `tenant_<slug>` for an organisation's own operational data. A new
table holding patient data goes in `clinical`. A new pharmacy feature goes in
the tenant schema, created inside `provision_tenant()`.

**2. Clinical tables need `queryAs`, not `pool.query`.** `clinical.*` has
row-level security, and the policies read session variables that only
`queryAs(actor, …)` sets. A plain `pool.query` against a clinical table
returns zero rows or fails on write — and it will look like your data vanished
rather than like a permissions error. In an open transaction, `SET LOCAL` the
same variables right after `BEGIN`.

**3. Never connect as a superuser.** `DATABASE_URL` must point at
`corehealth_app`, which is not a superuser and not `BYPASSRLS`. If you point it
at `postgres`, everything still works — and every row-level-security test
passes while protecting nothing, because a superuser bypasses RLS entirely.
This was a real finding (DB-02). Migrations are the exception: they use
`DATABASE_MIGRATOR_URL` (`corehealth_migrator`).

**4. Schema changes go in two places.** A new numbered file in
`server/migrations/` **and** mirrored into `corehealth_database.sql`. Both
build real databases — migrations build CI and production, the single file
builds fresh local installs — and they have silently diverged before, badly
enough to break every medicines endpoint and organisation registration on a
fresh database. CI now tests both. If you change one and not the other, the
build will tell you, but understand why it matters:
`server/controllers/__tests__/tenantProvisioning.integration.test.ts`.

Migrations are additive-first: add the new shape, remove the old one in a later
migration once nothing reads it. That is what makes a code-only rollback safe.

**5. Uploaded files are never static URLs.** Each goes through an
authenticated, ownership-checked endpoint. On the client, use
`openAuthedFile`/`downloadAuthedFile` from `src/utils/authedFiles.ts` — a plain
`<img src>` cannot send the auth header and will 401. Filenames are random, and
a 404 does not distinguish "missing" from "not yours".

**6. Validation lives in the route, not the controller.** Each route declares
its `express-validator` chain and `validate` runs before the controller. Prices
come from the database, never the request. Add validation with the route.

## Running the tests properly

```bash
cd server && npm test                   # unit only; integration tests self-skip
cd client && npm test
```

For the integration tests — RLS, tenant provisioning, the audit log — pass a
`DATABASE_URL` **as `corehealth_app`**, per point 3 above:

```bash
cd server
DATABASE_URL="postgresql://corehealth_app:<pw>@localhost:5432/corehealth" \
DB_SSL=false npm test
```

Use a throwaway database. Some tests write rows they deliberately cannot clean
up — the audit log is append-only by privilege, which is the behaviour one of
them asserts.

## Where the project is

This repository has been through a 234-check production-readiness audit, and
much of the recent work is closing those findings. Commit messages carry the
IDs (`SEC-`, `ARCH-`, `DB-`, `PRO-`, `INF-`, `MON-`, `CICD-`, `COMP-`…), so
`git log --grep=MON-12` is the fastest way to find why something exists.

Still open, so you know what you are walking into: no monitoring dashboard or
alerting (anything breaking is noticed by a person), no staging environment,
the deploy pipeline exists but is not switched on, retention periods are
proposed but not confirmed by a lawyer, and the Terraform has never been
applied. `docs/` and `runbooks/` say so where relevant rather than implying
otherwise.

## Getting help

Ask early. The access model and the three-layer schema are the two things
worth asking about rather than guessing — a wrong guess there is a data
exposure, not a bug.
