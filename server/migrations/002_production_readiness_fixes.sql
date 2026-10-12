-- Migration 002 — production-readiness fixes (13-thinking-ahead.md, P0 + quick P1 items).
--
-- Additive only, same rule as BASELINE_prod_catchup.sql: add columns/tables,
-- never drop or rename anything an already-deployed version of the code
-- might still read. Safe to run against a database with real data in it.

-- Up Migration

-- PRO-29: no CHECK constraints on price/cost_price/stock_quantity — a
-- medicine's stock or price could go negative with nothing in the database
-- to stop it (tenant sales/order tables already had this via provision_tenant()).
ALTER TABLE public.medicines
  ADD CONSTRAINT medicines_price_nonneg CHECK (price >= 0),
  ADD CONSTRAINT medicines_cost_price_nonneg CHECK (cost_price >= 0),
  ADD CONSTRAINT medicines_stock_nonneg CHECK (stock_quantity >= 0);

-- PRO-12: idempotency keys for sale/order creation. One shared table (not
-- per-tenant) — the caller's (key, user, endpoint) triple is globally
-- unique, and the controller looks up/records the resulting row id here
-- inside the same transaction as the sale/order it protects. See
-- saleController.create / orderController.create.
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              BIGSERIAL    PRIMARY KEY,
  idempotency_key VARCHAR(200) NOT NULL,
  user_id         INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint        VARCHAR(100) NOT NULL,
  resource_id     INTEGER      NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key, user_id, endpoint)
);
-- Old keys are never read again once their window of usefulness (a client
-- retrying a specific in-flight request) has passed; this index lets a
-- periodic cleanup (not included — same "ops runs it" pattern as
-- purgeSoftDeleted.ts) find them by age without a full scan.
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at);

-- 001_initial_schema.sql's grants to corehealth_app were a one-time
-- "ALL TABLES IN SCHEMA public" snapshot, not a default-privileges rule —
-- a table created by a later migration (this one) needs its own explicit
-- grant or the running server (which connects as corehealth_app, never a
-- superuser) gets "permission denied" the first time it touches it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys TO corehealth_app;
GRANT USAGE, SELECT ON SEQUENCE public.idempotency_keys_id_seq TO corehealth_app;

-- PRO-25: users/medicines/medical_consultations/patient_reports were
-- hard-deleted. Soft-delete column added to each; the application now sets
-- it instead of issuing DELETE, and excludes deleted_at IS NOT NULL rows
-- from reads. server/scripts/purgeSoftDeleted.ts removes rows for real
-- after a retention window — this migration only adds the column.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clinical.medical_consultations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clinical.patient_reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medicines_deleted_at ON public.medicines(deleted_at) WHERE deleted_at IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS public.idx_medicines_deleted_at;
DROP INDEX IF EXISTS public.idx_users_deleted_at;
ALTER TABLE clinical.patient_reports DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE clinical.medical_consultations DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.medicines DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS deleted_at;
DROP TABLE IF EXISTS public.idempotency_keys;
ALTER TABLE public.medicines
  DROP CONSTRAINT IF EXISTS medicines_stock_nonneg,
  DROP CONSTRAINT IF EXISTS medicines_cost_price_nonneg,
  DROP CONSTRAINT IF EXISTS medicines_price_nonneg;
