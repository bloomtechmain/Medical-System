# Performance & Responsiveness Fixes — Summary

Branch: `fix/database-audit-p0-p1`
Source: `06-performance.md`

Covers both P0 items and both P1 items in that document. `CANNOT VERIFY`/`N/A` items (load/soak testing, written targets, quarterly profiling) aren't addressed — they need production access or a decision this repo can't make for you.

---

## P0

### PERF-03 — No compression, no long-lived cache headers
- `compression` middleware added to the API (`server/server.ts`) — every JSON response is now gzipped.
- `client/public/serve.json` (copied into `dist/` by Vite automatically) sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/**` (Vite already content-hashes those filenames, so this is safe — a changed file gets a new name) and `no-cache` on `index.html` itself, so a deploy is never masked by a stale cached shell pointing at deleted hashed asset files.

### PERF-04 — Nothing paginated
`limit`/`offset` support added to every list endpoint the audit named, plus a few more with the same shape: medicines, users, sales, orders, suppliers, inventory's low-stock/expiring lists, patient reports, consultations (both the patient's and the doctor's view), lab requests, and a pharmacist's own prescription-assignment list. Shared helper: `server/utils/pagination.ts`.

**One deliberate deviation from the audit's suggested number:** it says "maximum 100." The default here is 500 (max 1000) instead. Reason: there's no page-through UI anywhere in the client yet — a cap of 100 would silently truncate any list that already has more than 100 rows today, which would look like data went missing rather than like a performance fix. 500 still bounds the real failure mode (a list growing forever as the business grows over months/years) without a visible regression right now. Tightening this to 100 is a one-line change in `utils/pagination.ts` once there's actual paging UI to go with it — tracked, not done blind.

---

## P1

### PERF-10 — One ~2 MB client bundle, no code-splitting
- Every route in `client/src/App.tsx` is now `React.lazy()`-loaded instead of statically imported, wrapped in one `<Suspense>`. A patient's browser no longer downloads the pharmacist's recharts-based dashboard or the admin's export code.
- `vite.config.ts` adds a manual vendor chunk for `react`/`react-dom`/`react-router-dom`, so a routine app-code deploy doesn't invalidate the browser cache for code that didn't change.
- Verified, not assumed: before, the build produced one 1,999.61 kB chunk (triggering Vite's own size warning). After, the largest chunk is 434.67 kB (`PatientDashboard`, which pulls in jspdf), and the main shared chunk is 402.68 kB — no size warning at all.

### PERF-06 — OCR/PDF extraction ran inside the API process, no queue
All three places slow OCR/PDF work ran — lab report uploads, patient self-uploaded reports, and prescription scanning on a consultation — now run as real background jobs via **pg-boss** (runs on the existing PostgreSQL; no new infrastructure service), with real retries and a queryable failed/dead-letter state instead of `setImmediate`'s "lost on restart, no retry, no record of failure."

- **Lab report & patient report vitals extraction** (`server/queue/jobs/extractLabReportVitals.ts`, `extractPatientReportVitals.ts`): both were already fire-and-forget after responding, so moving them to the queue is a pure internal improvement — **no visible behavior change**. Notifications for the lab-report case were split out to run immediately and only once (they don't depend on OCR succeeding, and unlike the extraction work they must never fire twice on a retry).
- **Consultation prescription OCR** (`server/queue/jobs/extractConsultationMedicines.ts`): this one *did* change behavior, by request — it used to run synchronously, blocking the response, so OCR-extracted medicines appeared in the same API call. Doctors now see the consultation save immediately with just the manually-entered medicines; OCR-extracted ones land a few seconds later via the background job, visible on the consultation's next fetch (same pattern as the other two — no live push notification for job completion in any of the three). Every job is idempotent by construction (replaces its own OCR-sourced rows / upserts by a stable key rather than appending), so a retry converges to the same result instead of duplicating data.
- `server/server.ts` starts the queue and registers this process as the worker for all three jobs at boot, and stops it gracefully on `SIGTERM`/`SIGINT` so in-flight jobs aren't killed mid-run on every deploy. Running the worker in the same process as the API is a reasonable first step; it can move to a separate worker process later with zero job-code changes, since pg-boss doesn't care which process calls `.work()`.

#### The one grant this needed, and how it's verified
pg-boss manages its own tables inside a `pgboss` schema, migrating them itself the first time it starts — which needs `corehealth_app` (the non-superuser role the server actually runs as) to have `CREATE` rights on that schema. Migration `003_job_queue_schema.sql` creates the schema and grants it (same pattern as `002`'s `idempotency_keys` grant).

This is also the one part of this round of work that genuinely couldn't be verified locally — there's no live Postgres in the environment this was written in. Unlike the DB-level grant checks that are implicitly covered by existing CI steps, nothing in CI previously exercised pg-boss's own schema migration under `corehealth_app`'s real (limited) privileges. A new CI step, **"Smoke-test the job queue as the app's own (non-superuser) role"** (`server/scripts/smokeTestQueue.ts`, run against the same `corehealth_app` connection the RLS integration tests already use), was added specifically to catch a missing/wrong grant before production does, rather than assuming the grant is correct.
