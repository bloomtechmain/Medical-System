# Runbooks

Short, specific procedures for when something is wrong. Answers INC-03 (no
runbooks existed anywhere) and the "suggested minimum before go-live" list in
`10-incident-response.md`.

A runbook is for someone who is tired, possibly woken up, and not necessarily
the person who wrote the code. So: numbered steps, exact commands, and the
decision stated before the detail. If you follow one and it was wrong or
incomplete, fix it in the same hour — that is the only way these stay true.

| Runbook | Use when |
|---|---|
| [app-down.md](app-down.md) | The application is unreachable or not answering |
| [rollback.md](rollback.md) | A deploy made things worse (**CICD-08**) |
| [database-unreachable.md](database-unreachable.md) | The database is down, or connections are exhausted |
| [restore-from-backup.md](restore-from-backup.md) | Data needs to come back |
| [uploads-missing.md](uploads-missing.md) | Prescriptions or lab reports have disappeared |
| [suspected-data-exposure.md](suspected-data-exposure.md) | Patient data may have been exposed — **has a legal clock** |

## Before you need these

Fill in the gaps, which cannot be answered from the repository (INC-01,
INC-02, INC-04, MON-13):

- **On-call owner and escalation path** — who is called first, who second.
- **Severity levels** — what counts as Sev1 vs Sev2 here.
- **Who communicates** — one named person talks to users; everyone else works.
- **Two people per critical task** — deploy, roll back, restore, DNS, cloud
  account. INC-05 is about not having a single point of failure that is a
  person. Today much of this is one person; write down who the second is.

## Severity, as a starting point

Adjust once there is real operating experience, then delete this paragraph and
replace it with what the team actually agreed.

| | Meaning | Examples | Response |
|---|---|---|---|
| **Sev1** | Patient data exposed, or nobody can work | Data exposure; total outage; database down | Immediately, any hour |
| **Sev2** | A core flow is broken for many users | Prescriptions cannot be sent; uploads failing | Within the working day |
| **Sev3** | Degraded or cosmetic | A slow page; one report wrong | Next working day |

A suspected data exposure is **always Sev1**, even if only one record is
involved, because the reporting clock starts whether or not anyone has noticed.

## Where to look

| What | Where |
|---|---|
| Logs | Railway service logs. JSON, one object per line (MON-10). Filter by `requestId` to follow one request. |
| A user's error report | They have a request ID from the error message. `requestId` matches the `x-request-id` response header. |
| Errors | Sentry, if `SENTRY_DSN` is set — grouped, and tagged with the release (MON-05) |
| Is it up | `GET /api/health` — process alive; `GET /api/ready` — alive *and* the database is reachable |
| Business metrics | `GET /api/metrics/business` (admin token). Sign-ups, consultations, logins, failures over 1h/24h/7d (MON-07) |
| Who did what | `public.audit_log` (MON-12) |
| Environment and variable reference | [../docs/environments.md](../docs/environments.md) |
