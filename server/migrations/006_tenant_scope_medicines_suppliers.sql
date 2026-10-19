-- Migration 006 — retire the shared public.medicines/suppliers (SEC-17 #4, final step).
--
-- CORRECTION TO AN EARLIER VERSION OF THIS FILE, which copied data it should
-- not have. The earlier version claimed SEC-17 #4 "never produced a
-- migration" and re-implemented it from scratch. That was wrong: the check
-- behind the claim looked at 001_initial_schema.sql's provision_tenant()
-- (which indeed has no per-tenant medicines) and never looked at
-- 004_security_fixes.sql, which implements SEC-17 #4 in full — it redefines
-- provision_tenant() with per-tenant medicines/suppliers, backfills every
-- existing pharmacy from the shared tables, and repoints that tenant's
-- order_items / sale_items / inventory_adjustments / orders foreign keys.
--
-- So the earlier version of this migration copied the catalogue a SECOND
-- time. On a fresh database that was invisible, because public.medicines is
-- empty there and both copies moved zero rows. On a database with real data
-- it would have given every pharmacy a duplicate of its entire catalogue —
-- 40 medicines instead of 20 — with the foreign keys repointed at the
-- duplicates. Caught by rehearsing this migration against a copy of a real
-- database, which is the only reason it never reached anyone's data.
--
-- What genuinely remains for this migration to do: 004 deliberately did NOT
-- drop public.medicines/public.suppliers, so that a rolling deploy running
-- old and new code side by side for a few minutes would not break. That
-- window closes once 004 is deployed everywhere, and leaving the shared
-- tables in place indefinitely means the cross-tenant exposure SEC-17 #4
-- exists to close is still one stray `FROM public.medicines` away.
--
-- Therefore, and nothing more:
--   1. Redefine provision_tenant() to the current version (which adds
--      defensive ALTERs for tenants provisioned before deleted_at existed).
--   2. Make sure every existing pharmacy tenant has its own tables.
--   3. Refuse to continue if any tenant foreign key still points at the
--      shared tables.
--   4. Drop public.medicines, public.suppliers, and the dead
--      public.v_low_stock view that selected from them.
--
-- No rows are copied here. 004 owns the data migration, and guards it on the
-- tenant's medicines table being empty so it is safe to re-run.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 0. Table grants for corehealth_migrator.
--
--    001 does `GRANT ALL ON SCHEMA public, clinical TO corehealth_migrator`,
--    which grants USAGE and CREATE on the *schemas* and nothing at all on the
--    tables inside them. provision_tenant() is SECURITY DEFINER owned by that
--    role, so its `INSERT INTO public.organizations` runs with the role's
--    privileges and fails with "permission denied for table organizations" —
--    breaking organisation self-registration, and step 2 below. REFERENCES is
--    included because the tenant tables' foreign keys to public.users need it.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public, clinical TO corehealth_migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, clinical TO corehealth_migrator;

-- ---------------------------------------------------------------------------
-- 1. provision_tenant(), verbatim from corehealth_database.sql.
--
--    The duplication between that file and this one is inherent to keeping a
--    single-file fresh-install script alongside incremental migrations
--    (DB-12's "two competing sources of truth").
--    server/controllers/__tests__/tenantProvisioning.integration.test.ts
--    asserts the two agree on what actually matters.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_tenant(
    p_slug     text,
    p_name     text,
    p_type     text,
    p_owner_id int DEFAULT NULL          -- doctor user_id, for clinic type only
)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, clinical, pg_temp AS
$fn$
DECLARE
  v_schema text := 'tenant_' || regexp_replace(lower(p_slug), '[^a-z0-9_]', '_', 'g');
  v_role   text := 'tn_' || regexp_replace(lower(p_slug), '[^a-z0-9_]', '_', 'g');
BEGIN
  IF p_type NOT IN ('hospital','pharmacy','laboratory','clinic') THEN
    RAISE EXCEPTION 'Unknown org type: %', p_type;
  END IF;

  IF p_type = 'clinic' AND p_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id is required when provisioning a clinic';
  END IF;

  INSERT INTO public.organizations (slug, name, org_type, schema_name, owner_user_id)
  VALUES (p_slug, p_name, p_type, v_schema, p_owner_id)
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, schema_name = EXCLUDED.schema_name,
        owner_user_id = EXCLUDED.owner_user_id;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  -- dedicated role, isolated to its own schema
  -- Wrapped in a sub-block so that permission errors on managed PostgreSQL
  -- (Railway, Supabase, etc.) don't abort the whole provisioning transaction.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', v_role);
    END IF;
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', v_schema, v_role);
    -- read shared catalog/identity it needs to operate
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
    -- medicines/suppliers moved into the tenant's own schema (SEC-17 #4) —
    -- line 1209 below already grants this role full access to everything in
    -- its own schema, which now includes those tables; public.users is the
    -- only shared-catalog table this role still needs read access to.
    EXECUTE format('GRANT SELECT ON public.users TO %I', v_role);
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- role-level isolation unavailable; schema isolation still applies
  END;

  -- ---------------------------------------------------------------
  -- Type-specific tables — every tenant gets its own suitable set
  -- ---------------------------------------------------------------

  IF p_type = 'hospital' THEN

    -- Scheduled outpatient visits
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.appointments (
        id           SERIAL       PRIMARY KEY,
        patient_id   INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        doctor_id    INTEGER               REFERENCES public.users(id) ON DELETE SET NULL,
        scheduled_at TIMESTAMPTZ  NOT NULL,
        reason       TEXT,
        status       VARCHAR(20)  NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','completed','cancelled','no_show')),
        notes        TEXT,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )$t$, v_schema);

    -- Inpatient admissions
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.admissions (
        id            SERIAL       PRIMARY KEY,
        patient_id    INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        doctor_id     INTEGER               REFERENCES public.users(id) ON DELETE SET NULL,
        admitted_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        discharged_at TIMESTAMPTZ,
        ward          VARCHAR(100),
        bed_number    VARCHAR(20),
        reason        TEXT,
        status        VARCHAR(20)  NOT NULL DEFAULT 'admitted'
                      CHECK (status IN ('admitted','discharged','transferred')),
        notes         TEXT
      )$t$, v_schema);

    -- Hospital billing — links to clinical consultation and/or local admission
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id              SERIAL        PRIMARY KEY,
        patient_id      INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        consultation_id INTEGER       REFERENCES clinical.medical_consultations(id) ON DELETE SET NULL,
        admission_id    INTEGER,      -- soft ref to local admissions(id)
        amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
        description     TEXT,
        status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','cancelled')),
        issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at         TIMESTAMPTZ
      )$t$, v_schema);

  ELSIF p_type = 'pharmacy' THEN

    -- SEC-17 #4: medicines/suppliers used to live in public, shared and
    -- writable by every pharmacy tenant (confirmed live: any pharmacist
    -- could read/edit any other pharmacy's stock and cost_price). Each
    -- pharmacy now gets its own copy, same pattern as a lab's test_catalog
    -- below. See docs/sec-17-4-tenant-scope-inventory-plan.md.
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.suppliers (
        id         SERIAL       PRIMARY KEY,
        name       VARCHAR(150) NOT NULL,
        contact    VARCHAR(100),
        phone      VARCHAR(20),
        email      VARCHAR(150),
        address    TEXT,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )$t$, v_schema);

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.medicines (
        id             SERIAL        PRIMARY KEY,
        name           VARCHAR(200)  NOT NULL,
        generic_name   VARCHAR(200),
        category       VARCHAR(100),
        description    TEXT,
        unit           VARCHAR(20)   NOT NULL DEFAULT 'tablet',
        price          NUMERIC(10,2) NOT NULL DEFAULT 0,
        cost_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock_quantity INTEGER       NOT NULL DEFAULT 0,
        reorder_level  INTEGER       NOT NULL DEFAULT 10,
        expiry_date    DATE,
        supplier_id    INTEGER       REFERENCES %I.suppliers(id) ON DELETE SET NULL,
        is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
        -- PRO-25 (soft delete) and PRO-29 (non-negative money/stock) were
        -- added to the then-shared public.medicines by migration 002, which
        -- landed *before* SEC-17 #4 moved medicines into each tenant's own
        -- schema. Without them here, the per-tenant copy is missing the
        -- deleted_at column every read in medicineController.ts filters on
        -- ("WHERE m.deleted_at IS NULL"), and loses the constraints that stop
        -- stock and prices going negative.
        deleted_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT medicines_price_nonneg      CHECK (price >= 0),
        CONSTRAINT medicines_cost_price_nonneg CHECK (cost_price >= 0),
        CONSTRAINT medicines_stock_nonneg      CHECK (stock_quantity >= 0)
      )$t$, v_schema, v_schema);
    -- A tenant provisioned by an OLDER version of this function already has a
    -- medicines table, so CREATE TABLE IF NOT EXISTS above is a no-op and the
    -- newer columns are simply absent. The index on deleted_at below then
    -- fails with "column deleted_at does not exist" — which is exactly what
    -- happens adopting migrations on a database whose tenant schemas were
    -- built from corehealth_database.sql before deleted_at existed. Verified
    -- against a copy of such a database: 004 aborts without these ALTERs and
    -- completes with them. They make the function idempotent against the
    -- older shape as well as the current one.
    EXECUTE format('ALTER TABLE %I.medicines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', v_schema);
    BEGIN
      EXECUTE format('ALTER TABLE %I.medicines ADD CONSTRAINT medicines_price_nonneg      CHECK (price >= 0)',          v_schema);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE %I.medicines ADD CONSTRAINT medicines_cost_price_nonneg CHECK (cost_price >= 0)',     v_schema);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE %I.medicines ADD CONSTRAINT medicines_stock_nonneg      CHECK (stock_quantity >= 0)', v_schema);
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_name     ON %I.medicines(name)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_category ON %I.medicines(category)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_supplier ON %I.medicines(supplier_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_deleted_at ON %I.medicines(deleted_at) WHERE deleted_at IS NOT NULL', v_schema);

    -- Stock purchase orders from suppliers
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.orders (
        id           SERIAL        PRIMARY KEY,
        supplier_id  INTEGER       REFERENCES %I.suppliers(id) ON DELETE SET NULL,
        ordered_by   INTEGER       REFERENCES public.users(id) ON DELETE SET NULL,
        status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','received','cancelled')),
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        notes        TEXT,
        ordered_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        received_at  TIMESTAMPTZ
      )$t$, v_schema, v_schema);

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.order_items (
        id          SERIAL        PRIMARY KEY,
        order_id    INTEGER       NOT NULL REFERENCES %I.orders(id)    ON DELETE CASCADE,
        medicine_id INTEGER       NOT NULL REFERENCES %I.medicines(id) ON DELETE CASCADE,
        quantity    INTEGER       NOT NULL CHECK (quantity > 0),
        unit_cost   NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0)
      )$t$, v_schema, v_schema, v_schema);

    -- Dispensing sales to customers / patients
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.sales (
        id             SERIAL        PRIMARY KEY,
        sold_by        INTEGER       REFERENCES public.users(id) ON DELETE SET NULL,
        customer_name  VARCHAR(150),
        total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(20)   DEFAULT 'cash'
                       CHECK (payment_method IN ('cash','card','online')),
        sold_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )$t$, v_schema);

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.sale_items (
        id          SERIAL        PRIMARY KEY,
        sale_id     INTEGER       NOT NULL REFERENCES %I.sales(id)     ON DELETE CASCADE,
        medicine_id INTEGER       NOT NULL REFERENCES %I.medicines(id) ON DELETE CASCADE,
        quantity    INTEGER       NOT NULL CHECK (quantity > 0),
        unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
      )$t$, v_schema, v_schema, v_schema);

    -- Manual stock corrections (damaged goods, expiry write-offs, etc.)
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.inventory_adjustments (
        id              SERIAL       PRIMARY KEY,
        medicine_id     INTEGER      NOT NULL REFERENCES %I.medicines(id) ON DELETE CASCADE,
        quantity_change INTEGER      NOT NULL,  -- positive = stock in, negative = write-off
        reason          VARCHAR(200),
        adjusted_by     INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,
        adjusted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )$t$, v_schema, v_schema);

  ELSIF p_type = 'laboratory' THEN

    -- NOTE: lab report files (report_file, report_mimetype, report_notes) live in
    -- clinical.lab_requests — not here — because the report is patient PHI that
    -- belongs to the patient, survives lab org changes, and is governed by the
    -- existing RLS + lab_view_requests permission system.
    -- The tables below are the lab's own OPERATIONAL data (not patient-owned).

    -- Tests this specific lab offers, with pricing and turnaround time
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.test_catalog (
        id               SERIAL        PRIMARY KEY,
        test_code        VARCHAR(50)   NOT NULL UNIQUE,
        test_name        VARCHAR(200)  NOT NULL,
        description      TEXT,
        price            NUMERIC(10,2) NOT NULL DEFAULT 0,
        turnaround_hours INTEGER,
        is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )$t$, v_schema);

    -- Record when a physical sample arrives at the lab for a request
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.sample_receipts (
        id               SERIAL       PRIMARY KEY,
        lab_request_id   INTEGER      NOT NULL,  -- soft ref: clinical.lab_requests(id)
        received_by      INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,
        received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        sample_type      VARCHAR(100),           -- blood, urine, tissue, swab, etc.
        sample_condition VARCHAR(50)  DEFAULT 'good'
                         CHECK (sample_condition IN ('good','haemolysed','insufficient','contaminated')),
        notes            TEXT
      )$t$, v_schema);

    -- Lab billing per test request
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id             SERIAL        PRIMARY KEY,
        lab_request_id INTEGER       NOT NULL,  -- soft ref: clinical.lab_requests(id)
        patient_id     INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
        status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','paid','cancelled')),
        issued_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at        TIMESTAMPTZ
      )$t$, v_schema);

  ELSIF p_type = 'clinic' THEN

    -- Patient bookings at the doctor's personal clinic
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.appointments (
        id           SERIAL       PRIMARY KEY,
        patient_id   INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        scheduled_at TIMESTAMPTZ  NOT NULL,
        reason       TEXT,
        status       VARCHAR(20)  NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','completed','cancelled','no_show')),
        notes        TEXT,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )$t$, v_schema);

    -- Clinic consultation billing
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id              SERIAL        PRIMARY KEY,
        patient_id      INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        consultation_id INTEGER       REFERENCES clinical.medical_consultations(id) ON DELETE SET NULL,
        appointment_id  INTEGER,      -- soft ref to local appointments(id)
        amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
        description     TEXT,
        status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','cancelled')),
        issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at         TIMESTAMPTZ
      )$t$, v_schema);

  END IF;

  -- Common grants for ALL types — runs after every branch above
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA %I TO %I',            v_schema, v_role);
  EXECUTE format('GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA %I TO %I',            v_schema, v_role);
  EXECUTE format('GRANT USAGE                          ON SCHEMA %I TO corehealth_app',                 v_schema);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA %I TO corehealth_app',v_schema);
  EXECUTE format('GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA %I TO corehealth_app',v_schema);

  RETURN v_schema;
END;
$fn$;

-- Ownership makes the SECURITY DEFINER above run as corehealth_migrator (which
-- has CREATE on the database + CREATEROLE), not as whoever created the
-- function. Only corehealth_app (the running server) and corehealth_migrator
-- itself may call it — no other role, and not PUBLIC.
ALTER FUNCTION public.provision_tenant(text, text, text, int) OWNER TO corehealth_migrator;
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, int) TO corehealth_app, corehealth_migrator;

-- ---------------------------------------------------------------------------
-- 2. Make sure every existing pharmacy tenant has its own tables, now that
--    provision_tenant() above is the current version.
--
--    Idempotent by construction: ON CONFLICT DO UPDATE on organizations,
--    CREATE SCHEMA / CREATE TABLE IF NOT EXISTS throughout, plus the
--    defensive ALTERs for a tenant whose medicines table predates
--    deleted_at. Re-running it with the organisation's own stored values adds
--    whatever is missing and changes nothing else.
--
--    Deliberately NOT copying any rows — 004 did that, guarded on the
--    tenant's medicines table being empty. Copying again here is precisely
--    the bug this migration was rewritten to remove.
-- ---------------------------------------------------------------------------

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT slug, name, org_type, owner_user_id
    FROM public.organizations
    WHERE org_type = 'pharmacy' AND schema_name IS NOT NULL
  LOOP
    PERFORM public.provision_tenant(r.slug, r.name, r.org_type, r.owner_user_id);
  END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 3. Refuse to drop the shared tables if any tenant still points at them.
--
--    004's backfill is what makes the drop below safe, and it skips any
--    tenant whose medicines table already had rows. If that skip ever left a
--    tenant's foreign keys aimed at public.medicines, dropping it with
--    CASCADE would silently delete those constraints and leave that tenant's
--    data referentially broken with no error. Far better to fail the
--    migration and say why.
-- ---------------------------------------------------------------------------

DO $mig$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(format('%s -> %s', c.conrelid::regclass, c.confrelid::regclass), ', ')
    INTO bad
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.contype = 'f'
    AND n.nspname LIKE 'tenant_%'
    AND c.confrelid IN ('public.medicines'::regclass, 'public.suppliers'::regclass);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Refusing to drop the shared catalogue: these tenant foreign keys still reference it: %. Migration 004 should have repointed them — check whether its backfill skipped a tenant that already had rows.', bad;
  END IF;
END $mig$;

-- ---------------------------------------------------------------------------
-- 4. Remove the shared tables and the dead view.
--
--    public.v_low_stock selected from public.medicines and nothing in the
--    application ever queried it — inventoryController.getLowStock() already
--    did the equivalent per pharmacy. It has to go regardless, because the
--    table it depends on is going.
--
--    The trigram indexes on public.medicines (001, DB-06) go with the table.
--    Their per-tenant equivalents are the plain btree indexes
--    provision_tenant() creates; a single pharmacy's catalogue is small
--    enough that the ILIKE searches DB-06 worried about are no longer the
--    same problem they were against one shared table holding every
--    pharmacy's stock.
-- ---------------------------------------------------------------------------

DROP VIEW  IF EXISTS public.v_low_stock;
DROP TABLE IF EXISTS public.medicines CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- Down Migration

-- Deliberately not reversible. Reversing this would mean merging every
-- pharmacy's private catalogue back into one shared table — re-introducing
-- the cross-tenant exposure SEC-17 #4 exists to close, and with no correct
-- answer for which pharmacy's row wins on a collision. Roll forward instead;
-- restore from a backup if the data itself has to come back (BKP-09 takes one
-- immediately before migrations run).
SELECT 1;
