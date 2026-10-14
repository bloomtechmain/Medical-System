# 0005 — pg-boss on the existing database, not a separate broker

**Status:** Accepted
**Date:** 2026-10-14 (recording a decision made earlier)

## Context

Uploading a prescription or a lab report triggers OCR and PDF text extraction
— slow, CPU- and memory-hungry work. It ran inside the request handler via
`setImmediate`, which the audit correctly refused to call a queue (PERF-06):
*"the work is lost on restart, is never retried, and competes with user
requests for CPU and memory."*

Three real consequences: a redeploy mid-extraction lost the work silently with
no record it had been attempted; a failure was never retried, so a patient's
vitals simply never appeared; and a burst of large uploads could starve or OOM
the API (PRO-15).

## Decision

**pg-boss**, which implements a job queue inside the PostgreSQL database the
application already has, in its own `pgboss` schema.

The worker currently runs **in the same process as the API**. That is a
deliberate first step, not an oversight: the jobs already get real retries,
durability across restarts and a queryable failed state, and pg-boss does not
care which process calls `boss.work()` — so moving the worker out later
requires no changes to the job code itself.

## Why not Redis/BullMQ, SQS, or similar

- **No new infrastructure to provision, secure, back up or pay for.** The
  database is already there, already backed up, already on a private network.
  A broker is one more thing that can be down, and one more thing to leave
  misconfigured.
- **Transactional honesty.** A job enqueued in the same database can be
  enqueued in the same transaction as the row it refers to, so there is no
  window where the record exists and the job does not.
- **The volume does not justify a broker.** This is OCR on human-paced
  uploads, not a high-throughput pipeline.
- Redis is already an optional dependency, but for the Socket.IO adapter
  (`REDIS_URL`) and it is optional precisely so single-instance deployments
  need not run it. Making the queue depend on it would make Redis mandatory.

## Consequences

**Good:** durable jobs with retries and a dead state; one less service; jobs
and data share a backup and a restore point; the worker can move out of the
API process without touching job code.

**Costs:**

- **Queue load lands on the application database.** pg-boss polls, and job
  rows are writes. Small at this volume, but it is the same database serving
  patient requests. Worth watching if job volume grows.
- **It needed a privilege grant that was not obvious.** pg-boss creates and
  migrates its own tables, so `corehealth_app` needs `CREATE` on the `pgboss`
  schema (migration 003). Getting this wrong fails at `boss.start()` with
  "permission denied for database", which is why
  `scripts/smokeTestQueue.ts` runs in CI as the app's own non-superuser role —
  the unit tests mock pg-boss entirely and would never catch it.
- **The worker still shares the API's memory limit.** PRO-15 is therefore only
  partly addressed: `NODE_OPTIONS=--max-old-space-size=512` bounds the damage
  to a restart rather than a degraded instance, and the `OCR_PROCESSING`
  feature flag can turn extraction off entirely without a deploy. Neither is a
  substitute for a separate worker.

## What would change this

- Job volume high enough that queue polling competes with user queries — move
  the worker to its own process first (cheap, no code change), and only then
  consider a real broker.
- Needing fan-out, scheduling or delayed jobs well beyond what pg-boss offers.
- OCR being moved to a managed service (Textract or similar), which changes
  the shape of the problem entirely: the job becomes an API call plus a
  callback rather than local CPU work.
