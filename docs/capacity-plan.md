# Capacity plan (preliminary)

Resolves ARCH-10 (`01-architecture-environments.md`) as a first pass. This is
explicitly **preliminary** — built from a local load test, not a real
staging/production environment, because no AWS access exists yet (see
ARCH-09 below for why that matters). Re-run the methodology here once AWS
staging exists and replace the numbers in this doc — don't just trust them
indefinitely.

## ARCH-09 — what was actually tested, and the honest limits of it

**Tool:** `scripts/loadtest/run.js` (uses `autocannon`), simulating a mix of
real authenticated read requests a patient dashboard makes:
`/api/consultations`, `/api/appointments`, `/api/lab-requests`,
`/api/patient-reports`, `/api/notifications`, plus the unauthenticated
`/api/health`.

**What it ran against:** the local `npm run dev` server (`nodemon` + `tsx`,
not the compiled production build) on this machine — **not** a production-
shaped environment. A `docker-compose.yml` was written alongside this
(builds the real `server/Dockerfile` and `client/Dockerfile`, runs
`NODE_ENV=production`, same CORS/env-validation paths as the real
deployment) specifically so a more representative run is just
`docker compose up --build` away. **That version has not been run** — this
sandbox has no Docker daemon available to run it in. Treat the numbers below
as directional, not a stand-in for the Docker Compose or real-AWS runs.

### Results

| Connections | Req/sec (avg) | Latency p50 | Latency p99 | Errors |
|---|---|---|---|---|
| 20 | 430 | 40 ms | 151 ms | 0 |
| 60 | 641 | 93 ms | 237 ms | 0 |

Zero errors, zero timeouts, zero non-2xx responses at either level — nothing
fell over, latency degraded smoothly (not a cliff) as load went from 20 to
60 concurrent connections, which is the expected, healthy shape of a
saturation curve, not a sign of a bottleneck.

### What this does and doesn't tell us

**Does tell us:** the API layer itself has no obvious pathological
bottleneck on these endpoints (no N+1 query explosion, no blocking call
that falls over under light concurrency). That's a real, useful signal even
from a dev server.

**Doesn't tell us:** real production numbers. A `tsx`-transpiled dev server
on a laptop is not a `t3.small` EC2 instance running compiled JS behind an
ALB with a real network path to RDS. It also didn't exercise the heaviest
code paths — OCR (`tesseract.js`), PDF parsing (`pdfjs-dist`), and the
`canvas` native module — which are exactly where a real bottleneck is most
likely to show up (CPU-bound, not I/O-bound like the endpoints tested here).

## Preliminary sizing recommendation

Given the honest limits above, this is a **starting point to size down from
caution, not a number to build SLAs on**:

- A clinic/hospital booking system's real traffic is almost certainly far
  below 400+ req/sec sustained — that figure is enormous for this kind of
  app relative to realistic concurrent user counts (dozens to low hundreds,
  not thousands, per organization). Even a single modest instance appears
  to have significant headroom for the read-heavy traffic tested here.
- This reinforces something already decided in the AWS architecture doc for
  an unrelated reason: **the 2-EC2-instance baseline is driven by
  redundancy, not raw capacity** — one instance can likely carry expected
  load on its own; the second exists so a single instance failure or AZ
  issue doesn't take the API down, not because load demands two.
- The real unknown is the **OCR/PDF-processing path** (prescription and lab
  report uploads), not the read endpoints tested here. That's CPU-bound work
  that could meaningfully affect sizing in a way this test didn't measure —
  worth a dedicated load test against the upload endpoints specifically,
  once staging exists.

## PERF-02 — load test at twice the peak, with writes

PERF-02 asks for "a load test at twice the expected peak … with realistic
data and write actions". The ARCH-09 run above was read-only at up to 60
connections, so it satisfied neither half. This run does both: **120
connections** (twice the 60 previously tested) against the **compiled
production build** (`node dist/server.js`, `NODE_ENV=production`), on a
database built from `corehealth_database.sql` + `corehealth_seed_data.sql`,
with the API connecting as `corehealth_app` — the non-superuser role, so
row-level security is actually enforced during the test.

Write actions added to the mix: `POST /api/patient-vitals` (a real write
through `queryAs` → `BEGIN`, `set_config`, `INSERT`, `COMMIT` against an
RLS-protected clinical table) and `PATCH /api/notifications/read-all`.
Deliberately **not** file uploads — those are rate-limited per user (20/min)
and quota'd, so hammering them measures the limiter, and the OCR path needs
its own soak test (still open, see below).

### Two things the test found before it produced a single number

**1. The rate limiter made the first run meaningless.** The initial attempt
reported 14,175 non-2xx out of 14,773 requests — all HTTP 429 from
`generalApiLimiter` (300/min per address). A single-source load test now hits
the PRO-08 rate limiting added since ARCH-09, so it was measuring the
middleware rather than the server.

Fixed properly rather than worked around: every limiter's window and ceiling
is now read from the environment (`RATE_LIMIT_GENERAL_MAX` and friends),
which is useful well beyond testing — a deployment behind a CDN or a shared
corporate NAT sees a completely different per-address request shape, and
tuning that ceiling should not require a code change and a deploy. The runs
below set `RATE_LIMIT_GENERAL_MAX` high deliberately, and say so.

**2. A real deadlock in `markAllRead`.** With writes enabled the server
produced 20 `deadlock detected` errors, 12 lock timeouts and 209 pool
connection timeouts in 30 seconds. Cause:

```sql
UPDATE notifications SET is_read = TRUE WHERE user_id = $1   -- before
```

No `is_read = FALSE` filter, so every call rewrote every notification the
user had ever received; and a bare `UPDATE` takes row locks in
plan-dependent order, so two concurrent calls for the same user could take
the same locks in opposite orders and deadlock. Two browser tabs, or a
double-tapped button, is enough. The deadlocked transactions then held pool
connections until they timed out, which is where the 209 pool timeouts and
the 500s came from — one bug, cascading.

Fixed in `notificationController.ts` with a deterministic lock order
(`ORDER BY id … FOR UPDATE`) and the missing `is_read = FALSE` filter.

### Results at 120 connections (2× peak), 30 seconds

| Run | Req/sec | p50 | p97.5 | p99 | max | non-2xx | errors |
|---|---|---|---|---|---|---|---|
| Read-only | 216 | 636 ms | 849 ms | 873 ms | 1109 ms | 0 | 0 |
| Reads + writes, **before** the deadlock fix | 104 | 793 ms | 5450 ms | 5540 ms | 9074 ms | 223 | 0 |
| Reads + writes, **after** the deadlock fix | **180** | 720 ms | 1256 ms | **1512 ms** | 1597 ms | **0** | **0** |

The fix is worth stating plainly: **+73% throughput, p99 down from 5.5 s to
1.5 s, and every 500 and 503 eliminated.** Zero server-side errors logged in
the post-fix run.

### What this says about sizing

- **Reads scale fine.** 216 req/sec sustained at 2× peak with a p99 under
  900 ms, no errors. The earlier conclusion holds: for a clinic/hospital
  booking system, the read path is not the constraint.
- **Writes are the constraint, and the pool is the knob.** Write throughput
  is bounded by `DB_POOL_MAX` (default 10). At 120 concurrent writers,
  requests queue for a connection; before the deadlock fix they queued past
  `DB_POOL_CONNECTION_TIMEOUT_MS` (5 s) and failed. After the fix they clear
  in time, but p99 of 1.5 s shows the queue is real.
  **If write concurrency per instance is expected above ~100, raise
  `DB_POOL_MAX` first** — and re-check the DB-04 arithmetic
  (`DB_POOL_MAX × instances + headroom < max_connections`) before doing so.
- **The "2 instances for redundancy, not capacity" conclusion survives.** One
  instance carried 2× peak on reads, and on writes with no errors.
- **Still untested:** the OCR/upload path, and a multi-hour soak (PERF-09).
  Both remain open. The worker is now a separate process
  (`server/worker.ts`, PRO-15), so an OCR soak test should measure that
  process's memory, not the API's.

### Reproducing it

```bash
# Build a database and start the compiled server as corehealth_app.
# Then, from the repo root:
TARGET_URL=http://localhost:5000 CONNECTIONS=120 DURATION=30 \
  node scripts/loadtest/run.js

# Read-only, for comparison:
INCLUDE_WRITES=false TARGET_URL=http://localhost:5000 CONNECTIONS=120 \
  DURATION=30 node scripts/loadtest/run.js
```

Raise `RATE_LIMIT_GENERAL_MAX` on the server being tested, or the run
measures the rate limiter. Results are written to
`scripts/loadtest/last-result.json`.

**Honest limit, unchanged:** this is still one machine, with the database on
the same machine, over loopback. It has no network latency to RDS, no ALB,
and no competing tenants. The *relative* findings (the deadlock, the pool
ceiling, reads-vs-writes) transfer; the absolute numbers do not.

## Before trusting this for real capacity decisions

1. Run `docker compose up --build`, then `TARGET_URL=http://localhost:5000
   node scripts/loadtest/run.js` — a more representative local number than
   the dev-server results above. (Seed the database first:
   `npm run db:seed` inside the `server` container, or the compose Postgres
   will have schema but no users to test against.)
2. Once AWS staging exists, re-run against it directly — real network path,
   real instance size, real RDS latency.
3. Add an upload-path load test (prescription/lab-report upload with OCR)
   — the untested, most-likely-to-matter case flagged above.
4. Revisit the "2 instances is enough" assumption only if real traffic data
   post-launch suggests otherwise — don't pre-optimize past what's known.

## ARCH-08 — note for completeness

Still `N/A`: the app doesn't call any outside service (email, SMS, payment
gateway) yet. Nothing to check until one is added — not blocked by, or
related to, AWS/staging access.
