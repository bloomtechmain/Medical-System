# Early-Warning, Routine & Feature-Checklist Fixes — Summary

Branch: `fix/database-audit-p0-p1`
Source: `14-early-warning-routine-features.md`

This document is almost entirely `CANNOT VERIFY`/`N/A` by its own admission — it audits live monitoring, alerting, backups, and team habits, none of which a code change can produce. There's exactly one P0 code fix (WARN-19) and one actionable suggestion buried in an otherwise-unverifiable item (FEAT-01). Both are done; everything else is explained below, not silently skipped.

---

## Done

### WARN-19 (P0) — No vulnerability scanning, no update bot
- **`npm audit --audit-level=high`** added to CI for both server and client (`.github/workflows/ci.yml`), `continue-on-error: true` — same reasoning as the existing lint step: this repo's dependency tree already carries pre-existing findings (28 in the server, 33 in the client, as of this writing — mostly transitive, e.g. `ws`/`socket.io-parser` memory-exhaustion advisories) that a hard gate would block every PR on, rather than just surfacing new ones for review.
- **The update-bot half was already done** — `.github/dependabot.yml` (added during the `13-thinking-ahead.md` pass, PRO-22) covers weekly, grouped dependency-update PRs for server, client, and GitHub Actions.
- **Flagged, needs a human with admin access:** GitHub's *Dependabot alerts* (the vulnerability-scanning toggle itself, separate from both of the above) couldn't be enabled via the API — `PUT /repos/.../vulnerability-alerts` returned 404 even after the attempt, meaning the token used here doesn't carry admin rights on repo security settings. Someone with admin access needs to flip it on at **Settings → Code security and analysis → Dependabot alerts**. Two clicks, not a code change.

### FEAT-01 — No PR template / checklist
The audit names "the eight questions for every new feature" as something a PR template should capture — but never actually lists what those eight questions are, anywhere in the repo. A full search (every markdown file, both PDFs, the `.github/` directory) turned up nothing; the finding is pointing out that they were never written down, not referencing content that exists elsewhere.

Rather than invent a plausible-sounding list and present it as the original, `.github/pull_request_template.md` was built from the issues that actually kept recurring across this repo's own audit series (validation, concurrency/idempotency, RLS-enforced authorization, unbounded growth, migration safety, tests, observability, blast radius) — and says so explicitly in an HTML comment at the top, so nobody mistakes it for a recovered original. Replace it if the real eight questions turn up somewhere.

---

## Not fixable in code

Everything else in this document — `CANNOT VERIFY` or `N/A` in the audit itself:

- **WARN-01 to WARN-18, WARN-20, WARN-21** — response-time/error-rate/validation-failure alerting, DB connection/disk/memory thresholds, backup age and restore-time checks, certificate expiry, cloud spend alerts. All need actual monitoring/alerting infrastructure (a request-timing/error tracker, a metrics system, a paging tool) that doesn't exist in this codebase. Several explicitly depend on other unfinished items (MON-05, MON-07, MON-10, MON-12 — not covered by this document).
- **ROUT-01 to ROUT-07** — daily/weekly/monthly/quarterly/yearly team habits (dashboard checks, restore drills, access reviews, incident retros, game days). These are process, not code.
