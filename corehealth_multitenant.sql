-- =============================================================================
-- Core Health – Multi-Tenant Re-Architecture  |  public + clinical + tenant_*
-- =============================================================================
-- PostgreSQL 14+   (tested on 16)
--
-- WHAT THIS DOES
--   * public      : shared, lower-sensitivity data (identity, org registry,
--                   staff profiles, drug catalog, suppliers).
--   * clinical    : shared but HIGHLY PROTECTED patient PHI. Locked down with
--                   Row-Level Security (RLS) so each role sees only its rows.
--                   This is patient-centric data that legitimately crosses orgs.
--   * tenant_<x>  : one physical schema per ORGANISATION for data it exclusively
--                   owns and operates (pharmacy purchase orders & sales).
--
-- WHY NOT "everything per tenant":  your clinical data is patient-centric and
-- cross-organisational by design (self-recorded visits, cross-org consent).
-- Physically siloing it would orphan patient self-records and break continuity
-- of care + the consent workflow. RLS gives the same isolation guarantee for
-- that data without fragmenting the medical record.
--
-- WHY SCHEMAS ALONE ARE NOT ENOUGH:  a schema is only a namespace. Real leak
-- prevention here comes from (a) per-tenant DB roles with USAGE granted only on
-- their own schema, and (b) RLS policies on the clinical tables. Both are below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1. CLEAN SLATE (safe re-run) — drops tenant schemas + clinical, rebuilds public
-- -----------------------------------------------------------------------------
DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', s);
  END LOOP;
END $$;

DROP SCHEMA IF EXISTS clinical CASCADE;

-- public clinical/operational tables from a previous run
DROP TABLE IF EXISTS public.notifications          CASCADE;
DROP TABLE IF EXISTS public.lab_view_requests      CASCADE;
DROP TABLE IF EXISTS public.data_access_requests   CASCADE;
DROP TABLE IF EXISTS public.patient_reports        CASCADE;
DROP TABLE IF EXISTS public.lab_requests           CASCADE;
DROP TABLE IF EXISTS public.consultation_medicines CASCADE;
DROP TABLE IF EXISTS public.medical_consultations  CASCADE;
DROP TABLE IF EXISTS public.sale_items             CASCADE;
DROP TABLE IF EXISTS public.sales                  CASCADE;
DROP TABLE IF EXISTS public.order_items            CASCADE;
DROP TABLE IF EXISTS public.orders                 CASCADE;
DROP TABLE IF EXISTS public.medicines              CASCADE;
DROP TABLE IF EXISTS public.suppliers              CASCADE;
DROP TABLE IF EXISTS public.laboratory_profiles    CASCADE;
DROP TABLE IF EXISTS public.pharmacist_profiles    CASCADE;
DROP TABLE IF EXISTS public.doctor_profiles        CASCADE;
DROP TABLE IF EXISTS public.patient_profiles       CASCADE;
DROP TABLE IF EXISTS public.organization_members   CASCADE;
DROP TABLE IF EXISTS public.organizations          CASCADE;
DROP TABLE IF EXISTS public.users                  CASCADE;

CREATE SCHEMA clinical;

-- =============================================================================
-- 2. PUBLIC SCHEMA  — shared identity, org registry, catalog
-- =============================================================================

-- 2.1 users (one global identity per person; auth lives here)
CREATE TABLE public.users (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'patient'
             CHECK (role IN ('admin','doctor','pharmacist','patient','laboratory')),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role  ON public.users(role);

-- 2.2 organizations  (the TENANT REGISTRY — the thing leaks must not cross)
CREATE TABLE public.organizations (
  id          SERIAL       PRIMARY KEY,
  slug        VARCHAR(60)  NOT NULL UNIQUE,          -- used to build schema name
  name        VARCHAR(200) NOT NULL,
  org_type    VARCHAR(20)  NOT NULL
              CHECK (org_type IN ('hospital','pharmacy','laboratory')),
  schema_name VARCHAR(80),                           -- physical schema, if any
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_type ON public.organizations(org_type);

-- 2.3 organization_members  (which users belong to which org, in what role)
CREATE TABLE public.organization_members (
  id              SERIAL      PRIMARY KEY,
  organization_id INTEGER     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         INTEGER     NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  member_role     VARCHAR(20) NOT NULL
                  CHECK (member_role IN ('doctor','pharmacist','laboratory','staff','owner')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_orgmem_user ON public.organization_members(user_id);
CREATE INDEX idx_orgmem_org  ON public.organization_members(organization_id);

-- 2.4 staff profiles (professional info — not patient PHI -> public)
CREATE TABLE public.doctor_profiles (
  id                   SERIAL        PRIMARY KEY,
  user_id              INTEGER       NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  phone                VARCHAR(20),
  specialization       VARCHAR(150),
  license_number       VARCHAR(100),
  medical_school       VARCHAR(200),
  years_experience     INTEGER       DEFAULT 0,
  hospital_affiliation VARCHAR(200),
  consultation_fee     NUMERIC(10,2) DEFAULT 0,
  bio                  TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE public.pharmacist_profiles (
  id                  SERIAL      PRIMARY KEY,
  user_id             INTEGER     NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  phone               VARCHAR(20),
  license_number      VARCHAR(100),
  pharmacy_name       VARCHAR(200),
  pharmacy_address    TEXT,
  years_experience    INTEGER     DEFAULT 0,
  specialization_area VARCHAR(150),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.laboratory_profiles (
  id               SERIAL      PRIMARY KEY,
  user_id          INTEGER     NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  phone            VARCHAR(20),
  lab_name         VARCHAR(200),
  lab_type         VARCHAR(100),
  license_number   VARCHAR(100),
  accreditation    VARCHAR(200),
  address          TEXT,
  services_offered TEXT,
  operating_hours  VARCHAR(200),
  website          VARCHAR(300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 shared drug catalog + suppliers (commercial reference data, not PHI)
CREATE TABLE public.suppliers (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  contact    VARCHAR(100),
  phone      VARCHAR(20),
  email      VARCHAR(150),
  address    TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE public.medicines (
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
  supplier_id    INTEGER       REFERENCES public.suppliers(id) ON DELETE SET NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medicines_name     ON public.medicines(name);
CREATE INDEX idx_medicines_category ON public.medicines(category);
CREATE INDEX idx_medicines_supplier ON public.medicines(supplier_id);

-- =============================================================================
-- 3. CLINICAL SCHEMA — patient PHI, shared but RLS-protected
-- =============================================================================

CREATE TABLE clinical.patient_profiles (
  id                      SERIAL      PRIMARY KEY,
  user_id                 INTEGER     NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  date_of_birth           DATE,
  gender                  VARCHAR(10) CHECK (gender IN ('male','female','other')),
  phone                   VARCHAR(20),
  address                 TEXT,
  emergency_contact_name  VARCHAR(150),
  emergency_contact_phone VARCHAR(20),
  blood_type              VARCHAR(5),
  allergies               TEXT,
  chronic_conditions      TEXT,
  insurance_provider      VARCHAR(150),
  insurance_policy_number VARCHAR(100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clinical.medical_consultations (
  id                     SERIAL      PRIMARY KEY,
  patient_id             INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  doctor_id              INTEGER     REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_pharmacist_id INTEGER     REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id        INTEGER     REFERENCES public.organizations(id) ON DELETE SET NULL, -- owning hospital; NULL = patient self-record
  visit_date             DATE        NOT NULL,
  doctor_name            VARCHAR(200),
  hospital_clinic        VARCHAR(200),
  sick_description       TEXT,
  diagnosis              TEXT,
  treatment_description  TEXT,
  prescription_file      VARCHAR(500),
  ocr_text               TEXT,
  lab_tests_requested    TEXT,
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','dispensed','completed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mc_patient    ON clinical.medical_consultations(patient_id);
CREATE INDEX idx_mc_doctor     ON clinical.medical_consultations(doctor_id);
CREATE INDEX idx_mc_pharmacist ON clinical.medical_consultations(assigned_pharmacist_id);
CREATE INDEX idx_mc_org        ON clinical.medical_consultations(organization_id);
CREATE INDEX idx_mc_status     ON clinical.medical_consultations(status);
CREATE INDEX idx_mc_visit_date ON clinical.medical_consultations(visit_date);

CREATE TABLE clinical.consultation_medicines (
  id              SERIAL       PRIMARY KEY,
  consultation_id INTEGER      NOT NULL REFERENCES clinical.medical_consultations(id) ON DELETE CASCADE,
  medicine_name   VARCHAR(200) NOT NULL,
  dosage          VARCHAR(100),
  frequency       VARCHAR(100),
  duration        VARCHAR(100),
  notes           VARCHAR(300),
  source          VARCHAR(10)  NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','ocr'))
);
CREATE INDEX idx_cm_consultation ON clinical.consultation_medicines(consultation_id);

CREATE TABLE clinical.lab_requests (
  id               SERIAL      PRIMARY KEY,
  doctor_id        INTEGER     REFERENCES public.users(id) ON DELETE SET NULL,
  patient_id       INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  laboratory_id    INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  -- the lab (user)
  organization_id  INTEGER     REFERENCES public.organizations(id) ON DELETE SET NULL,  -- the lab org
  consultation_id  INTEGER,     -- SOFT ref into clinical.medical_consultations (kept; same schema so FK is safe)
  test_description TEXT        NOT NULL,
  notes            TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','completed')),
  report_file      VARCHAR(500),
  report_mimetype  VARCHAR(100),
  report_notes     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_lr_consultation FOREIGN KEY (consultation_id)
      REFERENCES clinical.medical_consultations(id) ON DELETE SET NULL
);
CREATE INDEX idx_lr_doctor       ON clinical.lab_requests(doctor_id);
CREATE INDEX idx_lr_patient      ON clinical.lab_requests(patient_id);
CREATE INDEX idx_lr_laboratory   ON clinical.lab_requests(laboratory_id);
CREATE INDEX idx_lr_org          ON clinical.lab_requests(organization_id);
CREATE INDEX idx_lr_consultation ON clinical.lab_requests(consultation_id);
CREATE INDEX idx_lr_status       ON clinical.lab_requests(status);

CREATE TABLE clinical.lab_view_requests (
  id             SERIAL      PRIMARY KEY,
  lab_request_id INTEGER     NOT NULL REFERENCES clinical.lab_requests(id) ON DELETE CASCADE,
  doctor_id      INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  patient_id     INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message        TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined')),
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lvr_lab_request ON clinical.lab_view_requests(lab_request_id);
CREATE INDEX idx_lvr_doctor      ON clinical.lab_view_requests(doctor_id);
CREATE INDEX idx_lvr_patient     ON clinical.lab_view_requests(patient_id);
CREATE INDEX idx_lvr_status      ON clinical.lab_view_requests(status);

CREATE TABLE clinical.data_access_requests (
  id           SERIAL      PRIMARY KEY,
  doctor_id    INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  patient_id   INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_type  VARCHAR(50) NOT NULL
               CHECK (access_type IN ('lab_reports','medical_history','personal_reports','contact_info')),
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','declined')),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dar_doctor  ON clinical.data_access_requests(doctor_id);
CREATE INDEX idx_dar_patient ON clinical.data_access_requests(patient_id);
CREATE INDEX idx_dar_status  ON clinical.data_access_requests(status);

CREATE TABLE clinical.patient_reports (
  id                 SERIAL       PRIMARY KEY,
  patient_id         INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title              VARCHAR(255) NOT NULL,
  report_type        VARCHAR(50)  NOT NULL
                     CHECK (report_type IN ('lab_report','prescription','imaging','discharge_summary','vaccination','other')),
  laboratory_name    VARCHAR(255),
  doctor_name        VARCHAR(255),
  hospital_clinic    VARCHAR(255),
  issued_date        DATE         NOT NULL,
  description        TEXT,
  file_path          VARCHAR(500) NOT NULL,
  file_mimetype      VARCHAR(100),
  file_original_name VARCHAR(255),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pr_patient     ON clinical.patient_reports(patient_id);
CREATE INDEX idx_pr_report_type ON clinical.patient_reports(report_type);
CREATE INDEX idx_pr_issued_date ON clinical.patient_reports(issued_date);

CREATE TABLE clinical.notifications (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       VARCHAR(60)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  data       JSONB        NOT NULL DEFAULT '{}',
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user    ON clinical.notifications(user_id);
CREATE INDEX idx_notif_is_read ON clinical.notifications(user_id, is_read);
CREATE INDEX idx_notif_type    ON clinical.notifications(type);

-- =============================================================================
-- 4. SESSION-CONTEXT HELPERS  (the app sets these once per request/connection)
-- =============================================================================
-- The application calls clinical.set_context(user_id, org_id, role) right after
-- it authenticates a request. RLS policies read these to decide row visibility.

CREATE OR REPLACE FUNCTION public.app_uid() RETURNS integer
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::int $$;

CREATE OR REPLACE FUNCTION public.app_org() RETURNS integer
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.org_id', true), '')::int $$;

CREATE OR REPLACE FUNCTION public.app_role() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.role', true), '') $$;

CREATE OR REPLACE FUNCTION clinical.set_context(p_user_id int, p_org_id int, p_role text)
  RETURNS void LANGUAGE sql AS
$$
  SELECT set_config('app.user_id', COALESCE(p_user_id::text,''), false),
         set_config('app.org_id',  COALESCE(p_org_id::text,''),  false),
         set_config('app.role',    COALESCE(p_role,''),          false);
  SELECT NULL::void;
$$;

-- =============================================================================
-- 5. ROW-LEVEL SECURITY ON CLINICAL  (the real leak prevention)
-- =============================================================================
-- Lock the schema down: nobody gets in by default.
REVOKE ALL ON SCHEMA clinical FROM PUBLIC;

-- Helper: does the current doctor have an accepted access request of a type?
CREATE OR REPLACE FUNCTION clinical.has_consent(p_patient int, p_types text[])
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = clinical, public AS
$$
  SELECT EXISTS (
    SELECT 1 FROM clinical.data_access_requests d
    WHERE d.patient_id = p_patient
      AND d.doctor_id  = public.app_uid()
      AND d.status     = 'accepted'
      AND d.access_type = ANY(p_types)
  );
$$;

-- Turn RLS on (FORCE so even the table owner is filtered — important for testing)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
      'patient_profiles','medical_consultations','consultation_medicines',
      'lab_requests','lab_view_requests','data_access_requests',
      'patient_reports','notifications'])
  LOOP
    EXECUTE format('ALTER TABLE clinical.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE clinical.%I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- patient_profiles: patient sees own; doctor with consent; admin all
CREATE POLICY pp_sel ON clinical.patient_profiles FOR SELECT USING (
  public.app_role() = 'admin'
  OR user_id = public.app_uid()
  OR (public.app_role() = 'doctor' AND clinical.has_consent(user_id, ARRAY['medical_history','contact_info']))
);
CREATE POLICY pp_mod ON clinical.patient_profiles FOR ALL USING (
  public.app_role() = 'admin' OR user_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin' OR user_id = public.app_uid()
);

-- medical_consultations: patient own; doctor (theirs or same org); assigned pharmacist; admin
CREATE POLICY mc_sel ON clinical.medical_consultations FOR SELECT USING (
  public.app_role() = 'admin'
  OR patient_id = public.app_uid()
  OR doctor_id  = public.app_uid()
  OR assigned_pharmacist_id = public.app_uid()
  OR (organization_id IS NOT NULL AND organization_id = public.app_org())
);
CREATE POLICY mc_mod ON clinical.medical_consultations FOR ALL USING (
  public.app_role() IN ('admin','doctor','patient')
  AND (public.app_role() = 'admin' OR patient_id = public.app_uid() OR doctor_id = public.app_uid())
) WITH CHECK (
  public.app_role() = 'admin' OR patient_id = public.app_uid() OR doctor_id = public.app_uid()
);

-- consultation_medicines: visible iff its parent consultation is visible (RLS cascades through the subquery)
CREATE POLICY cm_all ON clinical.consultation_medicines FOR ALL USING (
  EXISTS (SELECT 1 FROM clinical.medical_consultations mc WHERE mc.id = consultation_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM clinical.medical_consultations mc WHERE mc.id = consultation_id)
);

-- lab_requests: patient own; ordering doctor; the lab itself (by user id or org); doctor with accepted lab view; admin
CREATE POLICY lr_sel ON clinical.lab_requests FOR SELECT USING (
  public.app_role() = 'admin'
  OR patient_id    = public.app_uid()
  OR doctor_id     = public.app_uid()
  OR laboratory_id = public.app_uid()
  OR (organization_id IS NOT NULL AND organization_id = public.app_org())
  OR EXISTS (SELECT 1 FROM clinical.lab_view_requests v
             WHERE v.lab_request_id = lab_requests.id
               AND v.doctor_id = public.app_uid() AND v.status = 'accepted')
);
CREATE POLICY lr_mod ON clinical.lab_requests FOR ALL USING (
  public.app_role() = 'admin'
  OR patient_id    = public.app_uid()
  OR doctor_id     = public.app_uid()
  OR laboratory_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin'
  OR patient_id    = public.app_uid()
  OR doctor_id     = public.app_uid()
  OR laboratory_id = public.app_uid()
);

-- lab_view_requests: the doctor or patient party; admin
CREATE POLICY lvr_all ON clinical.lab_view_requests FOR ALL USING (
  public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
);

-- data_access_requests: the doctor or patient party; admin
CREATE POLICY dar_all ON clinical.data_access_requests FOR ALL USING (
  public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
);

-- patient_reports: patient own; doctor with relevant consent; admin
CREATE POLICY prpt_sel ON clinical.patient_reports FOR SELECT USING (
  public.app_role() = 'admin'
  OR patient_id = public.app_uid()
  OR (public.app_role() = 'doctor'
      AND clinical.has_consent(patient_id, ARRAY['lab_reports','personal_reports','medical_history']))
);
CREATE POLICY prpt_mod ON clinical.patient_reports FOR ALL USING (
  public.app_role() = 'admin' OR patient_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin' OR patient_id = public.app_uid()
);

-- notifications: owner only; admin
CREATE POLICY notif_all ON clinical.notifications FOR ALL USING (
  public.app_role() = 'admin' OR user_id = public.app_uid()
) WITH CHECK (
  public.app_role() = 'admin' OR user_id = public.app_uid()
);

-- =============================================================================
-- 6. APPLICATION ROLE + GRANTS
-- =============================================================================
-- One login role the app uses for clinical + shared access. RLS does the row
-- filtering; this role is deliberately NOT a superuser (superusers bypass RLS).
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

-- =============================================================================
-- 7. TENANT PROVISIONING  (physical schema-per-tenant for org-owned operations)
-- =============================================================================
-- Creates: a schema tenant_<slug>, a dedicated DB role that can touch ONLY that
-- schema, and (for pharmacies) the operational tables. Hospitals/labs get a
-- reserved schema + role for any future org-local non-clinical data.
CREATE OR REPLACE FUNCTION public.provision_tenant(p_slug text, p_name text, p_type text)
  RETURNS text LANGUAGE plpgsql AS
$fn$
DECLARE
  v_schema text := 'tenant_' || regexp_replace(lower(p_slug), '[^a-z0-9_]', '_', 'g');
  v_role   text := 'tn_' || regexp_replace(lower(p_slug), '[^a-z0-9_]', '_', 'g');
BEGIN
  IF p_type NOT IN ('hospital','pharmacy','laboratory') THEN
    RAISE EXCEPTION 'Unknown org type: %', p_type;
  END IF;

  INSERT INTO public.organizations (slug, name, org_type, schema_name)
  VALUES (p_slug, p_name, p_type, v_schema)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, schema_name = EXCLUDED.schema_name;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  -- dedicated role, isolated to its own schema
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN', v_role);
  END IF;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', v_schema);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', v_schema, v_role);
  -- read shared catalog/identity it needs to operate
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
  EXECUTE format('GRANT SELECT ON public.medicines, public.suppliers, public.users TO %I', v_role);

  IF p_type = 'pharmacy' THEN
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.orders (
        id           SERIAL        PRIMARY KEY,
        supplier_id  INTEGER       REFERENCES public.suppliers(id) ON DELETE SET NULL,
        ordered_by   INTEGER       REFERENCES public.users(id)     ON DELETE SET NULL,
        status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','received','cancelled')),
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        notes        TEXT,
        ordered_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        received_at  TIMESTAMPTZ
      )$t$, v_schema);
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.order_items (
        id          SERIAL        PRIMARY KEY,
        order_id    INTEGER       NOT NULL REFERENCES %I.orders(id) ON DELETE CASCADE,
        medicine_id INTEGER       NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
        quantity    INTEGER       NOT NULL CHECK (quantity > 0),
        unit_cost   NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0)
      )$t$, v_schema, v_schema);
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
        sale_id     INTEGER       NOT NULL REFERENCES %I.sales(id) ON DELETE CASCADE,
        medicine_id INTEGER       NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
        quantity    INTEGER       NOT NULL CHECK (quantity > 0),
        unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
      )$t$, v_schema, v_schema);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', v_schema, v_role);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', v_schema, v_role);
    -- app role can also reach tenant schemas (it sets search_path per request)
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO corehealth_app', v_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO corehealth_app', v_schema);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO corehealth_app', v_schema);
  END IF;

  RETURN v_schema;
END;
$fn$;
