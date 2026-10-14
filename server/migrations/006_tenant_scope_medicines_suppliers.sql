-- Migration 006 — tenant-scope medicines/suppliers in the migration path (SEC-17 #4).
--
-- WHY THIS EXISTS AT ALL — this is the DB-12 finding happening for real.
--
-- SEC-17 #4 moved medicines/suppliers out of the shared `public` schema and
-- into each pharmacy's own tenant schema, because any pharmacist could read
-- and write every other pharmacy's stock levels and cost_price. That change
-- edited `corehealth_database.sql` only. It never produced a migration, so
-- `server/migrations/` — the path that actually builds CI, any fresh
-- developer database, and the new AWS production database — still created the
-- old shared public.medicines/public.suppliers and a provision_tenant() whose
-- pharmacy branch never made the per-tenant copies.
--
-- The application code was updated in that same commit and now resolves a
-- pharmacy's own schema (resolvePharmacySchema in config/db.ts) and queries
-- "<tenant>".medicines. So on any database built from the migrations, every
-- medicine, supplier and inventory endpoint hits a table that does not exist.
--
-- There is a second, independent break of the same kind. Migration 002 added
-- PRO-25's `deleted_at` and PRO-29's non-negative CHECK constraints to
-- public.medicines, and landed *before* SEC-17 #4. The per-tenant medicines
-- table SEC-17 #4 introduced never got either. Every read in
-- medicineController.ts filters on `WHERE m.deleted_at IS NULL`, so the
-- medicines list is broken even against a database built from
-- corehealth_database.sql. Both are fixed here.
--
-- Additive-then-destructive, in that order, and the destructive part only
-- touches tables this migration has just finished copying out of.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 0. Table grants for corehealth_migrator.
--
--    Migration 001 does `GRANT ALL ON SCHEMA public, clinical TO
--    corehealth_migrator`, which grants USAGE and CREATE on the *schemas* and
--    nothing at all on the tables inside them. provision_tenant() is
--    SECURITY DEFINER owned by that role, so its `INSERT INTO
--    public.organizations` runs with the role's privileges rather than the
--    caller's — and fails with "permission denied for table organizations".
--
--    That breaks public organisation self-registration outright on any
--    database built from the migrations, and it would break step 2 of this
--    migration too. Verified by running the full chain against a scratch
--    database: provision_tenant() errors before this grant and succeeds after.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public, clinical TO corehealth_migrator;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public, clinical TO corehealth_migrator;

-- ---------------------------------------------------------------------------
-- 1. Redefine provision_tenant() so the pharmacy branch creates the tenant's
--    own suppliers/medicines (with deleted_at and the CHECK constraints), and
--    orders/order_items/sale_items/inventory_adjustments reference those
--    instead of the public ones.
--
--    This is a verbatim copy of the function in corehealth_database.sql. The
--    duplication is inherent to keeping a single-file fresh-install script
--    alongside incremental migrations (DB-12's "two competing sources of
--    truth"); the integration test added with this migration asserts the two
--    agree on the thing that actually matters, rather than trusting a comment.
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
-- 2. Give every existing pharmacy tenant its new tables.
--
--    provision_tenant() is idempotent by construction (ON CONFLICT DO UPDATE
--    on organizations, CREATE SCHEMA/TABLE IF NOT EXISTS throughout), so
--    re-running it with the organisation's own stored values adds exactly the
--    tables the redefined pharmacy branch introduces and changes nothing else.
--    This is the same approach the original SEC-17 #4 rollout used by hand
--    against the dev database.
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
-- 3. Copy each pharmacy's rows out of the shared tables, then repoint that
--    tenant's foreign keys at its own copies.
--
--    Guarded on public.medicines still existing: on a brand-new database
--    (CI, a fresh dev database, new production) migration 001 created the
--    shared tables and they are empty, and on a database where this has
--    somehow already been done there is nothing to copy. Either way this
--    block is a no-op rather than an error.
--
--    Row identity: ids cannot be preserved, because two pharmacies' rows
--    would collide in a single tenant sequence. Each tenant's copy gets fresh
--    ids and a mapping table translates the old public id to the new one, so
--    the tenant's existing order_items/sale_items/inventory_adjustments keep
--    pointing at the same medicine they always did.
-- ---------------------------------------------------------------------------

DO $mig$
DECLARE
  r      RECORD;
  v_from text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'medicines'
  ) THEN
    RAISE NOTICE 'public.medicines does not exist — nothing to migrate';
    RETURN;
  END IF;

  FOR r IN
    SELECT schema_name
    FROM public.organizations
    WHERE org_type = 'pharmacy' AND schema_name IS NOT NULL
  LOOP
    v_from := r.schema_name;

    -- 3a. Suppliers, keeping a map from the old public id to the new local one.
    EXECUTE format($t$
      CREATE TEMP TABLE _supplier_map AS
      WITH inserted AS (
        INSERT INTO %I.suppliers (name, contact, phone, email, address, created_at)
        SELECT s.name, s.contact, s.phone, s.email, s.address, s.created_at
        FROM public.suppliers s
        ORDER BY s.id
        RETURNING id
      )
      SELECT old.id AS old_id, new.id AS new_id
      FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM public.suppliers) old
      JOIN (SELECT id, row_number() OVER (ORDER BY id) rn FROM inserted)        new
        ON old.rn = new.rn
    $t$, v_from);

    -- 3b. Medicines, same mapping approach, with supplier_id translated
    --     through the map built above.
    EXECUTE format($t$
      CREATE TEMP TABLE _medicine_map AS
      WITH inserted AS (
        INSERT INTO %I.medicines (
          name, generic_name, category, description, unit, price, cost_price,
          stock_quantity, reorder_level, expiry_date, supplier_id, is_active,
          deleted_at, created_at, updated_at
        )
        SELECT m.name, m.generic_name, m.category, m.description, m.unit,
               m.price, m.cost_price, m.stock_quantity, m.reorder_level,
               m.expiry_date, sm.new_id, m.is_active,
               m.deleted_at, m.created_at, m.updated_at
        FROM public.medicines m
        LEFT JOIN _supplier_map sm ON sm.old_id = m.supplier_id
        ORDER BY m.id
        RETURNING id
      )
      SELECT old.id AS old_id, new.id AS new_id
      FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM public.medicines) old
      JOIN (SELECT id, row_number() OVER (ORDER BY id) rn FROM inserted)         new
        ON old.rn = new.rn
    $t$, v_from);

    -- 3c. Repoint this tenant's own rows. The FK constraints created by
    --     migration 001's provision_tenant() pointed at public.medicines /
    --     public.suppliers; drop those, remap the values, then let the
    --     redefined function's constraints (already created in step 2 for the
    --     new tables) stand. Constraint names come from 001, hence IF EXISTS.
    EXECUTE format('ALTER TABLE %I.order_items DROP CONSTRAINT IF EXISTS order_items_medicine_id_fkey', v_from);
    EXECUTE format('ALTER TABLE %I.sale_items  DROP CONSTRAINT IF EXISTS sale_items_medicine_id_fkey',  v_from);
    EXECUTE format('ALTER TABLE %I.inventory_adjustments DROP CONSTRAINT IF EXISTS inventory_adjustments_medicine_id_fkey', v_from);
    EXECUTE format('ALTER TABLE %I.orders DROP CONSTRAINT IF EXISTS orders_supplier_id_fkey', v_from);

    EXECUTE format('UPDATE %I.order_items oi SET medicine_id = mm.new_id FROM _medicine_map mm WHERE mm.old_id = oi.medicine_id', v_from);
    EXECUTE format('UPDATE %I.sale_items  si SET medicine_id = mm.new_id FROM _medicine_map mm WHERE mm.old_id = si.medicine_id', v_from);
    EXECUTE format('UPDATE %I.inventory_adjustments ia SET medicine_id = mm.new_id FROM _medicine_map mm WHERE mm.old_id = ia.medicine_id', v_from);
    EXECUTE format('UPDATE %I.orders o SET supplier_id = sm.new_id FROM _supplier_map sm WHERE sm.old_id = o.supplier_id', v_from);

    EXECUTE format('ALTER TABLE %I.order_items ADD CONSTRAINT order_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', v_from, v_from);
    EXECUTE format('ALTER TABLE %I.sale_items  ADD CONSTRAINT sale_items_medicine_id_fkey  FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', v_from, v_from);
    EXECUTE format('ALTER TABLE %I.inventory_adjustments ADD CONSTRAINT inventory_adjustments_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', v_from, v_from);
    EXECUTE format('ALTER TABLE %I.orders ADD CONSTRAINT orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES %I.suppliers(id) ON DELETE SET NULL', v_from, v_from);

    DROP TABLE _medicine_map;
    DROP TABLE _supplier_map;
  END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 4. Remove the shared tables and the view that read from them.
--
--    public.v_low_stock selected from public.medicines and nothing in the
--    application ever queried it — inventoryController.getLowStock() already
--    did the equivalent per-pharmacy. It has to go regardless, because the
--    table it depends on is going.
--
--    The trigram indexes on public.medicines (migration 001, DB-06) go with
--    the table. Their per-tenant equivalents are plain btree indexes created
--    by provision_tenant(); a tenant's catalogue is small enough that the
--    ILIKE searches DB-06 was worried about are no longer the same problem
--    they were against one shared table holding every pharmacy's stock.
-- ---------------------------------------------------------------------------

DROP VIEW  IF EXISTS public.v_low_stock;
DROP TABLE IF EXISTS public.medicines CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- Down Migration

-- Deliberately not reversible. Reversing this would mean merging every
-- pharmacy's private catalogue back into one shared table — re-introducing
-- the cross-tenant data exposure SEC-17 #4 exists to close, and with no
-- correct answer for which pharmacy's row wins on a collision. Roll forward
-- instead; restore from a backup if the data itself needs to come back
-- (BKP-09 takes one immediately before migrations run).
SELECT 1;
