-- One-time catch-up script for the EXISTING production database, run BEFORE
-- adopting node-pg-migrate (see BASELINE.md for the full procedure). It is
-- NOT a numbered migration and node-pg-migrate never runs it.
--
-- Brings production's actual schema (built by hand over time, via migrate.ts
-- plus whichever of the migrateXxx.ts scripts were actually run — three of
-- them had no npm script, so this is genuinely uncertain) up to exactly what
-- server/migrations/001_initial_schema.sql would create, WITHOUT touching any
-- existing data: every statement below is additive and safe to run more than
-- once (IF NOT EXISTS / DROP+ADD CONSTRAINT / CREATE OR REPLACE / ALTER —
-- nothing here drops a table or deletes rows).
--
-- Run this with a role that has CREATE ROLE and CREATE on the database (the
-- DATABASE_URL bootstrap/owner role Railway gives you — the same role the
-- "HOW TO RUN ON RAILWAY" section of corehealth_database.sql assumes):
--   psql "$DATABASE_URL" -f server/migrations/BASELINE_prod_catchup.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Known drift between corehealth_database.sql and the original migrate.ts
-- (DB-13 in the database audit): 'laboratory' may or may not already be a
-- valid role.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','doctor','pharmacist','patient','laboratory'));

-- pg_trgm GIN indexes for the ILIKE '%text%' searches in userController.ts /
-- medicineController.ts (DB-06). CONCURRENTLY avoids locking these
-- (already-busy) tables for writes while the index builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_trgm       ON public.users USING GIN (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm      ON public.users USING GIN (email gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medicines_name_trgm         ON public.medicines USING GIN (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medicines_generic_name_trgm ON public.medicines USING GIN (generic_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doctor_profiles_specialization_trgm       ON public.doctor_profiles USING GIN (specialization gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doctor_profiles_hospital_affiliation_trgm ON public.doctor_profiles USING GIN (hospital_affiliation gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacist_profiles_pharmacy_name_trgm    ON public.pharmacist_profiles USING GIN (pharmacy_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacist_profiles_pharmacy_address_trgm ON public.pharmacist_profiles USING GIN (pharmacy_address gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_laboratory_profiles_lab_name_trgm ON public.laboratory_profiles USING GIN (lab_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_laboratory_profiles_address_trgm  ON public.laboratory_profiles USING GIN (address gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_laboratory_profiles_lab_type_trgm ON public.laboratory_profiles USING GIN (lab_type gin_trgm_ops);

-- Admin dashboard stats cache (DB-08).
CREATE TABLE IF NOT EXISTS public.platform_stats_cache (
  id                      INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_sales             BIGINT       NOT NULL DEFAULT 0,
  total_revenue           NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales_this_month        BIGINT       NOT NULL DEFAULT 0,
  total_appointments      BIGINT       NOT NULL DEFAULT 0,
  upcoming_appointments   BIGINT       NOT NULL DEFAULT 0,
  completed_appointments  BIGINT       NOT NULL DEFAULT 0,
  computed_at             TIMESTAMPTZ  NOT NULL DEFAULT '-infinity'
);

-- =============================================================================
-- 6. APPLICATION ROLE + GRANTS
-- =============================================================================
-- One login role the app uses for clinical + shared access. RLS does the row
-- filtering; this role is deliberately NOT a superuser (superusers bypass RLS)
-- and is never granted BYPASSRLS. This is the role the running server (and
-- DATABASE_URL in production) should connect as — never the bootstrap/owner
-- role used to run this file, and never a superuser.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    CREATE ROLE corehealth_app LOGIN PASSWORD 'change_me_in_prod';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, clinical TO corehealth_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public   TO corehealth_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA clinical TO corehealth_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public   TO corehealth_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA clinical TO corehealth_app;
GRANT EXECUTE ON FUNCTION clinical.set_context(int,int,text) TO corehealth_app;
-- Unqualified table names keep working because clinical is on the search_path:
ALTER ROLE corehealth_app SET search_path = public, clinical;

-- Second login role, used ONLY to run migrations (this file and anything under
-- server/migrations/) and as the owner of public.provision_tenant() below. It
-- is deliberately kept separate from corehealth_app: it is the one role allowed
-- to CREATE SCHEMA / CREATE ROLE (needed for tenant_<slug> provisioning and for
-- future migrations), while corehealth_app — what the running server actually
-- connects as — never gets those rights. It is still NOT a superuser and is
-- never granted BYPASSRLS, so it remains subject to clinical's RLS policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_migrator') THEN
    CREATE ROLE corehealth_migrator LOGIN PASSWORD 'change_me_in_prod' CREATEROLE;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO corehealth_migrator', current_database());
END $$;
GRANT ALL ON SCHEMA public, clinical TO corehealth_migrator;
ALTER ROLE corehealth_migrator SET search_path = public, clinical;


-- provision_tenant() needs CREATE SCHEMA / CREATE ROLE rights (it provisions
-- a tenant_<slug> schema and role per organisation). Rather than grant those
-- to corehealth_app directly (DB-02: the app's day-to-day role must stay
-- least-privilege and must never be the role that can create schemas/roles),
-- make it SECURITY DEFINER so it runs as its owner (corehealth_migrator,
-- which has those rights) regardless of which low-privilege role calls it.
-- This only changes the function's privilege/ownership metadata — it does
-- NOT redefine its body, so it is safe to run against the existing function.
ALTER FUNCTION public.provision_tenant(text, text, text, int) SECURITY DEFINER;
ALTER FUNCTION public.provision_tenant(text, text, text, int) SET search_path = public, clinical, pg_temp;
ALTER FUNCTION public.provision_tenant(text, text, text, int) OWNER TO corehealth_migrator;
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, int) TO corehealth_app, corehealth_migrator;

-- Finally: point DATABASE_URL (or DB_USER) at corehealth_app, and
-- DATABASE_MIGRATOR_URL at corehealth_migrator, before relying on this — see
-- server/.env.example. Set each role's real password with:
--   ALTER ROLE corehealth_app SET PASSWORD '...';
--   ALTER ROLE corehealth_migrator SET PASSWORD '...';
