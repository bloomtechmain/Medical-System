-- Migration 003 — job queue schema grant (PERF-06).
--
-- pg-boss (server/queue/boss.ts) manages its own tables inside the `pgboss`
-- schema, migrating them itself on boss.start() — this migration only
-- creates that schema and grants corehealth_app (the role the running
-- server actually connects as, non-superuser, never BYPASSRLS — see
-- 001_initial_schema.sql section 6) the rights to create objects inside it.
-- Without this grant, boss.start() fails the first time with "permission
-- denied for database" the moment it tries to create its own tables.
-- Additive only, same rule as every migration after 001.

-- Up Migration

CREATE SCHEMA IF NOT EXISTS pgboss;
GRANT ALL ON SCHEMA pgboss TO corehealth_app;

-- Down Migration

DROP SCHEMA IF EXISTS pgboss CASCADE;
