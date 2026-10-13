-- Migration 005 — finish the pg-boss grant that 003 started (PERF-06).
--
-- 003_job_queue_schema.sql creates the `pgboss` schema and grants
-- corehealth_app rights *inside* it, and its own comment says this is what
-- stops boss.start() failing with "permission denied for database". It
-- doesn't: pg-boss still issues `CREATE SCHEMA IF NOT EXISTS pgboss` on
-- start, and PostgreSQL checks CREATE on the *database* for that statement
-- before it ever gets as far as noticing the schema already exists. So the
-- schema-level grant alone leaves boss.start() failing exactly as 003
-- predicted.
--
-- This was never caught because `npx tsx scripts/smokeTestQueue.ts` — the CI
-- step added specifically to prove pg-boss can migrate its own schema under
-- corehealth_app's limited privileges — only runs after lint, build, the
-- migrations and the test suite, and the pipeline had always failed earlier.
--
-- Reproduced on a fresh database with 001-004 applied: the smoke test fails
-- with "permission denied for database"; with the grant below it starts and
-- accepts a job.
--
-- current_database() rather than a hardcoded name so this works on CI's
-- corehealth_ci, a local dev database, and production alike. Additive only,
-- same rule as every migration after 001.

-- Up Migration

DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO corehealth_app', current_database());
END $$;

-- Down Migration

DO $$
BEGIN
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM corehealth_app', current_database());
END $$;
