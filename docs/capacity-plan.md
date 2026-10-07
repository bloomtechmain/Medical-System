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
