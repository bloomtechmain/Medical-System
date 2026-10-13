-- Migration 004 — security fixes (02-security.md).
--
-- Additive only, same rule as every migration after 001: add columns/tables,
-- never drop or rename anything an already-deployed version of the code
-- might still read. Safe to run against a database with real data in it.
--
-- SEC-17 #4 is the one item here that isn't a pure column/table addition —
-- it moves medicines/suppliers from one shared public table into each
-- pharmacy's own tenant schema (any pharmacist could otherwise read/edit
-- any other pharmacy's stock and cost_price). Per the additive-only rule,
-- this migration does NOT drop public.medicines/public.suppliers — it
-- creates each existing pharmacy's own copy and backfills it, but leaves
-- the old shared tables in place and still working so a rolling deploy
-- where old and new code run side-by-side for a few minutes doesn't break.
-- Dropping them is a deliberate follow-up migration once nothing reads them.

-- Up Migration

-- SEC-14: TOTP MFA, admin accounts only (enforced in app code). mfa_secret
-- is written as soon as setup starts but mfa_enabled only flips to TRUE once
-- the admin proves they can generate a valid code with it.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_secret  VARCHAR(64);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- SEC-17 #4: medicines' admin-dashboard totals are cached the same way
-- sales/appointments already are (see userController.computePlatformStats) —
-- now that medicines is a cross-tenant UNION ALL instead of one table, it's
-- no longer cheap enough to compute live on every dashboard load.
ALTER TABLE public.platform_stats_cache ADD COLUMN IF NOT EXISTS total_medicines BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.platform_stats_cache ADD COLUMN IF NOT EXISTS low_stock       BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.platform_stats_cache ADD COLUMN IF NOT EXISTS expired        BIGINT NOT NULL DEFAULT 0;

-- SEC-17 (auth): the JWT access token is short-lived (15m) and carries no
-- server-side state, so there's nothing to revoke mid-flight — it just
-- expires fast. This table is what makes a *session* revocable: an opaque,
-- randomly-generated refresh token is handed to the client and only its
-- SHA-256 hash is stored here. /api/auth/refresh trades a valid one for a
-- new access token + a new refresh token (rotation — the old row is marked
-- revoked, not deleted, so reuse of an already-rotated token is detectable).
-- Deactivating a user revokes all of their outstanding refresh tokens.
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens(token_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens TO corehealth_app;
GRANT USAGE, SELECT ON SEQUENCE public.refresh_tokens_id_seq TO corehealth_app;

-- SEC-17 (auth): forgot-password flow. Same opaque-token-hashed-at-rest
-- pattern as refresh_tokens. used_at (not a DELETE) keeps a record that a
-- given token was already redeemed, so a replay of an old emailed link is
-- rejected rather than silently accepted.
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON public.password_reset_tokens(token_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_tokens TO corehealth_app;
GRANT USAGE, SELECT ON SEQUENCE public.password_reset_tokens_id_seq TO corehealth_app;

-- SEC-17 #7: impersonation_log (pre-existing) only recorded that a session
-- started — nothing taken during it. Mutating requests made while
-- impersonating are logged here (see middleware/auth.ts's protect()).
CREATE TABLE IF NOT EXISTS public.impersonation_action_log (
  id              SERIAL       PRIMARY KEY,
  admin_id        INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id  INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method          VARCHAR(10)  NOT NULL,
  path            VARCHAR(500) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_impersonation_action_log_admin  ON public.impersonation_action_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_action_log_target ON public.impersonation_action_log(target_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impersonation_action_log TO corehealth_app;
GRANT USAGE, SELECT ON SEQUENCE public.impersonation_action_log_id_seq TO corehealth_app;

-- SEC-17 #4: provision_tenant() redefined so every NEW pharmacy tenant gets
-- its own medicines/suppliers tables (same pattern a laboratory's own
-- test_catalog already uses), instead of sharing the one public table.
-- Everything else about this function is unchanged from 001_initial_schema.sql
-- — same SECURITY DEFINER / search_path / ownership story, see that file's
-- comments for why.
CREATE OR REPLACE FUNCTION public.provision_tenant(
    p_slug     text,
    p_name     text,
    p_type     text,
    p_owner_id int DEFAULT NULL
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

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', v_role);
    END IF;
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', v_schema, v_role);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
    -- medicines/suppliers moved into the tenant's own schema below — the
    -- unconditional GRANT ALL TABLES IN SCHEMA further down already covers
    -- them; public.users is the only shared-catalog table this role needs.
    EXECUTE format('GRANT SELECT ON public.users TO %I', v_role);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF p_type = 'hospital' THEN

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

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id              SERIAL        PRIMARY KEY,
        patient_id      INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        consultation_id INTEGER       REFERENCES clinical.medical_consultations(id) ON DELETE SET NULL,
        admission_id    INTEGER,
        amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
        description     TEXT,
        status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','cancelled')),
        issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at         TIMESTAMPTZ
      )$t$, v_schema);

  ELSIF p_type = 'pharmacy' THEN

    -- SEC-17 #4: each pharmacy's own catalog, not the shared public one.
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
        price          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
        cost_price     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
        stock_quantity INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        reorder_level  INTEGER       NOT NULL DEFAULT 10,
        expiry_date    DATE,
        supplier_id    INTEGER       REFERENCES %I.suppliers(id) ON DELETE SET NULL,
        is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
        deleted_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )$t$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_name       ON %I.medicines(name)',     v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_category   ON %I.medicines(category)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_supplier   ON %I.medicines(supplier_id)', v_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_medicines_deleted_at ON %I.medicines(deleted_at) WHERE deleted_at IS NOT NULL', v_schema);

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

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.inventory_adjustments (
        id              SERIAL       PRIMARY KEY,
        medicine_id     INTEGER      NOT NULL REFERENCES %I.medicines(id) ON DELETE CASCADE,
        quantity_change INTEGER      NOT NULL,
        reason          VARCHAR(200),
        adjusted_by     INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,
        adjusted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )$t$, v_schema, v_schema);

  ELSIF p_type = 'laboratory' THEN

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

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.sample_receipts (
        id               SERIAL       PRIMARY KEY,
        lab_request_id   INTEGER      NOT NULL,
        received_by      INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,
        received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        sample_type      VARCHAR(100),
        sample_condition VARCHAR(50)  DEFAULT 'good'
                         CHECK (sample_condition IN ('good','haemolysed','insufficient','contaminated')),
        notes            TEXT
      )$t$, v_schema);

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id             SERIAL        PRIMARY KEY,
        lab_request_id INTEGER       NOT NULL,
        patient_id     INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
        status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','paid','cancelled')),
        issued_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at        TIMESTAMPTZ
      )$t$, v_schema);

  ELSIF p_type = 'clinic' THEN

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

    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.invoices (
        id              SERIAL        PRIMARY KEY,
        patient_id      INTEGER       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        consultation_id INTEGER       REFERENCES clinical.medical_consultations(id) ON DELETE SET NULL,
        appointment_id  INTEGER,
        amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
        description     TEXT,
        status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','cancelled')),
        issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        paid_at         TIMESTAMPTZ
      )$t$, v_schema);

  END IF;

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA %I TO %I',            v_schema, v_role);
  EXECUTE format('GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA %I TO %I',            v_schema, v_role);
  EXECUTE format('GRANT USAGE                          ON SCHEMA %I TO corehealth_app',                 v_schema);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA %I TO corehealth_app',v_schema);
  EXECUTE format('GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA %I TO corehealth_app',v_schema);

  RETURN v_schema;
END;
$fn$;

ALTER FUNCTION public.provision_tenant(text, text, text, int) OWNER TO corehealth_migrator;
REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, int) TO corehealth_app, corehealth_migrator;

-- SEC-17 #4 backfill: every pharmacy tenant provisioned before this
-- migration only has order_items/sale_items/inventory_adjustments/orders
-- referencing the shared public.medicines/suppliers. This block (a) makes
-- sure each one's own medicines/suppliers tables exist (re-running
-- provision_tenant is idempotent — CREATE TABLE IF NOT EXISTS, and the
-- organizations UPSERT preserves the existing owner_user_id), (b) copies
-- every non-deleted public.medicines/suppliers row into that tenant's own
-- copy exactly once (skipped if the tenant's medicines table already has
-- rows — safe to re-run this migration), and (c) repoints that tenant's own
-- order_items/sale_items/inventory_adjustments/orders to the new copy.
-- public.medicines/suppliers themselves are left in place — see the header.
DO $$
DECLARE
  org         RECORD;
  supplier    RECORD;
  medicine    RECORD;
  med_count   INTEGER;
  v_new_id    INTEGER;
  v_new_supplier_id INTEGER;
BEGIN
  FOR org IN
    SELECT id, slug, name, schema_name, owner_user_id
    FROM public.organizations
    WHERE org_type = 'pharmacy' AND schema_name IS NOT NULL
  LOOP
    PERFORM public.provision_tenant(org.slug, org.name, 'pharmacy', org.owner_user_id);

    EXECUTE format('SELECT COUNT(*) FROM %I.medicines', org.schema_name) INTO med_count;
    IF med_count > 0 THEN
      CONTINUE; -- already backfilled (or genuinely has its own data already)
    END IF;

    -- Row-by-row, not set-based: Postgres doesn't allow a data-modifying
    -- statement (INSERT ... RETURNING) inside a LATERAL join, which is what
    -- a set-based "copy and remember the new id" would need here. Fine at
    -- this scale — one pharmacy's catalog, not a bulk ETL job.
    CREATE TEMP TABLE _supplier_map (old_id int PRIMARY KEY, new_id int) ON COMMIT DROP;
    CREATE TEMP TABLE _medicine_map (old_id int PRIMARY KEY, new_id int) ON COMMIT DROP;

    FOR supplier IN SELECT * FROM public.suppliers LOOP
      EXECUTE format(
        'INSERT INTO %I.suppliers (name, contact, phone, email, address, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        org.schema_name
      ) INTO v_new_id USING supplier.name, supplier.contact, supplier.phone, supplier.email, supplier.address, supplier.created_at;
      INSERT INTO _supplier_map (old_id, new_id) VALUES (supplier.id, v_new_id);
    END LOOP;

    FOR medicine IN SELECT * FROM public.medicines WHERE deleted_at IS NULL LOOP
      SELECT new_id INTO v_new_supplier_id FROM _supplier_map WHERE old_id = medicine.supplier_id;
      EXECUTE format(
        'INSERT INTO %I.medicines
           (name, generic_name, category, description, unit, price, cost_price,
            stock_quantity, reorder_level, expiry_date, supplier_id, is_active,
            deleted_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
        org.schema_name
      ) INTO v_new_id USING medicine.name, medicine.generic_name, medicine.category, medicine.description,
        medicine.unit, medicine.price, medicine.cost_price, medicine.stock_quantity, medicine.reorder_level,
        medicine.expiry_date, v_new_supplier_id, medicine.is_active, medicine.deleted_at,
        medicine.created_at, medicine.updated_at;
      INSERT INTO _medicine_map (old_id, new_id) VALUES (medicine.id, v_new_id);
    END LOOP;

    EXECUTE format($f$
      UPDATE %I.order_items oi SET medicine_id = mm.new_id
      FROM _medicine_map mm WHERE mm.old_id = oi.medicine_id
    $f$, org.schema_name);

    EXECUTE format($f$
      UPDATE %I.sale_items si SET medicine_id = mm.new_id
      FROM _medicine_map mm WHERE mm.old_id = si.medicine_id
    $f$, org.schema_name);

    EXECUTE format($f$
      UPDATE %I.inventory_adjustments ia SET medicine_id = mm.new_id
      FROM _medicine_map mm WHERE mm.old_id = ia.medicine_id
    $f$, org.schema_name);

    EXECUTE format($f$
      UPDATE %I.orders o SET supplier_id = sm.new_id
      FROM _supplier_map sm WHERE sm.old_id = o.supplier_id
    $f$, org.schema_name);

    EXECUTE format('ALTER TABLE %I.order_items DROP CONSTRAINT IF EXISTS order_items_medicine_id_fkey', org.schema_name);
    EXECUTE format('ALTER TABLE %I.order_items ADD CONSTRAINT order_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', org.schema_name, org.schema_name);

    EXECUTE format('ALTER TABLE %I.sale_items DROP CONSTRAINT IF EXISTS sale_items_medicine_id_fkey', org.schema_name);
    EXECUTE format('ALTER TABLE %I.sale_items ADD CONSTRAINT sale_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', org.schema_name, org.schema_name);

    EXECUTE format('ALTER TABLE %I.inventory_adjustments DROP CONSTRAINT IF EXISTS inventory_adjustments_medicine_id_fkey', org.schema_name);
    EXECUTE format('ALTER TABLE %I.inventory_adjustments ADD CONSTRAINT inventory_adjustments_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES %I.medicines(id) ON DELETE CASCADE', org.schema_name, org.schema_name);

    EXECUTE format('ALTER TABLE %I.orders DROP CONSTRAINT IF EXISTS orders_supplier_id_fkey', org.schema_name);
    EXECUTE format('ALTER TABLE %I.orders ADD CONSTRAINT orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES %I.suppliers(id) ON DELETE SET NULL', org.schema_name, org.schema_name);

    DROP TABLE _supplier_map;
    DROP TABLE _medicine_map;
  END LOOP;
END $$;

-- Down Migration

DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, int);
DROP TABLE IF EXISTS public.impersonation_action_log;
DROP TABLE IF EXISTS public.password_reset_tokens;
DROP TABLE IF EXISTS public.refresh_tokens;
ALTER TABLE public.platform_stats_cache DROP COLUMN IF EXISTS expired;
ALTER TABLE public.platform_stats_cache DROP COLUMN IF EXISTS low_stock;
ALTER TABLE public.platform_stats_cache DROP COLUMN IF EXISTS total_medicines;
ALTER TABLE public.users DROP COLUMN IF EXISTS mfa_enabled;
ALTER TABLE public.users DROP COLUMN IF EXISTS mfa_secret;
-- Note: this down-migration does NOT restore the pre-004 provision_tenant()
-- (the one without per-tenant medicines/suppliers) — re-apply 001's version
-- by hand if a rollback genuinely needs that, and note that any pharmacy
-- tenant backfilled by this migration keeps its per-tenant medicines/
-- suppliers tables and data either way (not dropped by this rollback).
