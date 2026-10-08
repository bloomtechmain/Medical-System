# Production-Readiness Fixes — Summary

Branch: `fix/database-audit-p0-p1`
Source: `13-thinking-ahead.md`

This covers every P0 ("must fix") finding in `13-thinking-ahead.md`, plus every P1 ("should fix") finding that could be fixed in code without new third-party infrastructure (an email provider, a CAPTCHA service, S3, a job queue). Items that genuinely need one of those are listed at the bottom, not silently skipped.

---

## 1. P0 — Must fix

### PRO-06 — No request validation on almost every endpoint
- **Prices from the client (point 1):** `saleController.create` now prices every sale line from `medicines.price` in the database. The request's `unit_price` is accepted for shape validation only and otherwise ignored.
- **Negative quantities (point 2) / bad input → 500 (point 3):** `items` is now validated (`saleRoutes.ts`, `orderRoutes.ts`) as a non-empty array of positive integers before the controller ever sees it — a malformed request gets a 422, not a crash.
- **Medicines created/updated with no checks (point 4):** full field validation added in `medicineRoutes.ts` (name required, price/cost_price non-negative, unit from a fixed list, expiry date ISO8601, etc.).
- **Public org registration unchecked (point 5):** `registerOrgValidators` in `server.ts` — slug format, email, password length, org_type, bounded specializations list.
- **Admin role update unchecked (point 6):** `userRoutes.ts` now validates `role` against the same fixed list the database CHECK already enforced, so a bad value is a 422, not a raw 500.
- **No DB constraints on money/stock (point 7):** see PRO-29.
- Consultation and lab-request creation also got the same field-length/type validation treatment (`consultationRoutes.ts`, `labRoutes.ts`), since the audit named them explicitly as next in line after sales/medicines/org-registration.
- Added `rejectUnknownFields()` to `middleware/validate.ts` as a reusable building block (not wired onto every route — see "Known gaps" below).

### PRO-12 — No idempotency; receiving an order twice double-counts stock
- `Idempotency-Key` header support added to `saleController.create` and `orderController.create`, backed by a new `public.idempotency_keys` table. The check-and-record happens inside the same transaction as the sale/order it protects, so two identical concurrent requests are decided by a unique index, not a check-then-act race.
- `orderController.receive` now guards its UPDATE with `WHERE status <> 'received'` and only touches stock when a row actually changed — calling it twice is a no-op the second time, not double stock.

### PRO-29 — Races around stock and money
- `CHECK (price >= 0)`, `CHECK (cost_price >= 0)`, `CHECK (stock_quantity >= 0)` added to `public.medicines` (migration `002`).
- `medicineController.update` no longer accepts `stock_quantity` at all — editing a medicine can't silently overwrite stock sold in between anymore. A new `PATCH /medicines/:id/stock` (`adjustStock`) applies a relative delta inside the database instead; the client's edit form (`Medicines.tsx`) now shows current stock read-only plus a separate "+/-" adjustment field.
- `authController.register` and `organizationController.registerOrganization` both now map a `23505` (unique violation) on the email/slug insert to a 409 instead of letting the race fall through as a raw 500.
- `prescriptionAssignmentController.updateStatus` now carries the expected previous status in the UPDATE's `WHERE` clause (optimistic lock) — a second concurrent request against the same assignment gets a 409 instead of silently skipping a pipeline step.

---

## 2. P1 — quick wins, fixed in code

| ID | Fix |
|---|---|
| PRO-02 | Server-side minimum search length (2 chars) added to every user/medicine search, closing the gap where only the client was enforcing it. Rate limiting added to all search endpoints, including the two public ones (`search-owner`, `search-hospitals-clinics`). (Trigram indexes already existed from the prior DB-06 fix on this branch.) |
| PRO-03 | `limit`/`offset` pagination added to medicines, users, and sales lists. Default is a generous 500 (not "a page") — there's no page-through UI client-side yet, so a small default would just look like data went missing; this bounds the real failure mode (unbounded growth over time) without a visible regression today. |
| PRO-07 | Upload filenames now include a random component (`crypto.randomBytes`), not just user id + timestamp. Uploaded file content is checked against known magic bytes (PDF/JPEG/PNG/WEBP/BMP/TIFF) after upload — a mismatch deletes the file and 400s, catching a relabeled file extension. Per-user upload rate limit added. |
| PRO-08 | `express-rate-limit` added app-wide (`generalApiLimiter`), plus `app.set('trust proxy', ...)` so it (and anything else reading `req.ip`) sees the real visitor once this runs behind Railway's proxy, not one shared bucket for everyone. |
| PRO-09 | Login and registration now rate-limited (10 attempts / 15 min per IP) — the "lockout" half of this finding. Password reset and MFA are **not** implemented — both need an email provider, which this app doesn't have configured anywhere (see PRO-11/PRO-09 below). |
| PRO-10 | Covered by the PRO-06 validators above (max lengths on names/emails/text fields, bounded array sizes for `items`, `hospital_organization_ids`, `specializations`). |
| PRO-11 | `registerOrganization` no longer calls `provision_tenant()` (which does real `CREATE SCHEMA`/`CREATE ROLE` DDL) at public, unauthenticated submission time — it now only inserts a plain pending-review row. The schema is provisioned in `toggleActive` the moment an admin actually approves it. Rate limiting and field validation added to the public registration endpoint. CAPTCHA and email verification are **not** implemented (need a third-party service / email provider). |
| PRO-15 | Not a real fix (that's moving OCR to a worker, which needs a queue — infra decision), but `NODE_OPTIONS=--max-old-space-size=512` added to the Dockerfile so a memory spike restarts the container instead of degrading it silently. |
| PRO-17 | `Cache-Control: no-store` added to every `/api` response and to the `/uploads` static file server. |
| PRO-22 | Node bumped from 20 (past end-of-life) to 22 in both the Dockerfile and CI. `.github/dependabot.yml` added (weekly, grouped PRs for server/client/actions) as the missing "update bot." A few targeted tests added alongside the riskiest new logic (timezone boundary, stock CHECK/adjustment mapping) — the broader "tests are too thin" issue is not resolved by this alone. |
| PRO-25 | `deleted_at` added to `users`, `medicines`, `medical_consultations`, `patient_reports`; their `remove()`/list/get endpoints now soft-delete and filter accordingly instead of hard `DELETE`. `server/scripts/purgeSoftDeleted.ts` (ops-run, same pattern as the existing `db:check:*` scripts) removes rows for real after a configurable retention window (`--execute`, defaults to a dry run). |
| PRO-30 | Appointment "today"/"past date" logic now anchors to `Asia/Colombo` (`businessTodayStr()` in `appointmentController.ts`) instead of the server process's own timezone. Added a test that fails without the fix (mocks the system clock to a UTC instant that's already "tomorrow" in Colombo). |

---

## 3. Known gaps in what was fixed above

- **`rejectUnknownFields`** was added as a utility but not wired onto every route — doing that safely means auditing each endpoint's exact accepted field set, which risks breaking a field the client still sends that I didn't account for. Left as a building block for a follow-up pass.
- **Soft delete is not applied to every read path** for the four tables above — `consultationController.update`/`updateByPatient` still look up a consultation by id without excluding a soft-deleted one. The list/get endpoints (the ones a user actually sees) do exclude them.
- **A soft-deleted user's email stays taken** — `users.email` is still globally unique, so someone can't re-register with the same email as a deleted account. Not addressed; would need a partial unique index scoped to `deleted_at IS NULL`, which I didn't want to apply blind without a live database to verify against (see below).
- **Client-side request cancellation** (PRO-02's "earlier requests are not cancelled") is not implemented — would need an `AbortController` added to the shared search hook and every page using it.
- **Pagination has no UI** — the backend accepts `limit`/`offset`, but no list page has "next page" controls yet. The generous default avoids a visible regression today, but a client update is needed before this is a complete fix.

## 4. Not implemented — needs an infrastructure/business decision

These need something this repo doesn't have today (a credential, a service, a product decision) and weren't guessed at:

- **PRO-09 / PRO-11:** password reset, MFA, CAPTCHA, email verification — all need an email provider (and CAPTCHA needs a third-party key) that isn't configured anywhere in this app.
- **PRO-04:** converting `notifications`/chat messages/`impersonation_log`/`patient_vitals` to `BIGINT` ids, and deciding a retention policy for each — the ID type change touches live sequences and foreign keys on tables that may already hold data; not something to apply without a real database to verify the migration against first (none was available while writing this, same caveat the prior DB-audit PR noted for its own biggest migration). Retention is also partly a business decision (how long to keep what), not purely technical.
- **PRO-05:** moving uploads to S3 — needs an AWS account/bucket decision.
- **PRO-15:** moving OCR/PDF parsing to a separate worker — needs a queue (Redis/Bull or similar) and a decision on where that worker runs.
- **PRO-01, PRO-13, PRO-16, PRO-18, PRO-19, PRO-20, PRO-21, PRO-23, PRO-24, PRO-26, PRO-27, PRO-28:** marked `CANNOT VERIFY` or `N/A` in the audit itself — these are facts about the live production deployment (traffic plan, backup health, deployment habits, hosting limits, bus-factor), not something a code change can answer.

## 5. Migration

One new file: `server/migrations/002_production_readiness_fixes.sql` — additive only (new columns, new table, new CHECK constraints), same rule as `BASELINE_prod_catchup.sql`. Runs automatically via `npm run db:migrate` on the next deploy, on top of migration `001` (including for a database that adopted `001` via `--fake` per `BASELINE.md` — this one still runs for real there).

One explicit grant was needed and easy to miss: `001`'s grants to `corehealth_app` were a one-time snapshot (`GRANT ... ON ALL TABLES IN SCHEMA public`), not a default-privileges rule, so the new `idempotency_keys` table needed its own `GRANT` in `002` or the running server (which never connects as a superuser) would get "permission denied" on it the first time a sale or order was created.
