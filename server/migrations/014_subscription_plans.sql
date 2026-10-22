-- Migration 014 — subscription packages (plans) per dashboard type.
--
-- Until now every professional account had every feature. This introduces
-- packages: a free tier with limited features, and paid tiers above it, for
-- each kind of dashboard that can be sold — doctor, pharmacy, laboratory,
-- hospital and clinic. Patients are deliberately NOT part of this: the
-- patient side of the system stays entirely free, so there is no 'patient'
-- audience and nothing here ever restricts a patient.
--
-- Where a plan attaches:
--   * a doctor's personal dashboard          -> users.plan_id        (audience 'doctor')
--   * a pharmacy / laboratory / hospital /
--     clinic organisation                    -> organizations.plan_id (audience = org_type)
--   * a pharmacist / laboratory user with no
--     organisation (admin-created legacy)    -> users.plan_id        (audience 'pharmacy' / 'laboratory')
--
-- plan_id NULL means "the audience's default plan" (is_default = TRUE), which
-- is the free tier. That keeps every existing account working with no
-- backfill: they are on Free until an administrator moves them.
--
-- features is a JSONB object keyed by the feature keys defined in
-- server/config/planCatalog.ts. A boolean feature holds true/false; a limit
-- holds a non-negative integer, or null for unlimited. The catalogue lives in
-- code because enforcement lives in code — a key the code does not check
-- would be a switch connected to nothing — while the VALUES live here so an
-- administrator can change them from the admin dashboard without a deploy.

-- Up Migration

CREATE TABLE IF NOT EXISTS public.plans (
  id             SERIAL        PRIMARY KEY,
  audience       VARCHAR(20)   NOT NULL
                 CHECK (audience IN ('doctor','pharmacy','laboratory','hospital','clinic')),
  code           VARCHAR(40)   NOT NULL,
  name           VARCHAR(80)   NOT NULL,
  description    TEXT,
  price_monthly  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
  price_yearly   NUMERIC(12,2)          CHECK (price_yearly IS NULL OR price_yearly >= 0),
  currency       CHAR(3)       NOT NULL DEFAULT 'LKR',
  features       JSONB         NOT NULL DEFAULT '{}'::jsonb,
  -- The plan an account is on when it has no explicit plan_id. Exactly one
  -- per audience (partial unique index below).
  is_default     BOOLEAN       NOT NULL DEFAULT FALSE,
  -- FALSE = archived: no longer offered at registration, but accounts already
  -- on it keep it. A plan in use is never deleted (ON DELETE RESTRICT below).
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order     INTEGER       NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (audience, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_one_default
  ON public.plans (audience) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_plans_audience ON public.plans (audience, sort_order);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES public.plans(id) ON DELETE RESTRICT;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES public.plans(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users (plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_plan   ON public.organizations (plan_id) WHERE plan_id IS NOT NULL;

COMMENT ON COLUMN public.users.plan_id IS
  'Package for a doctor''s personal dashboard (or an org-less pharmacist/laboratory). NULL = the audience''s default (free) plan. Always NULL for patients and admins.';
COMMENT ON COLUMN public.organizations.plan_id IS
  'Package for this organisation''s dashboard; audience = org_type. NULL = the default (free) plan.';

-- Every plan change, by whom and from what — the "who moved this hospital to
-- Enterprise" question has to be answerable. Not an audit_log replacement
-- (that is written too); this is the per-account plan history the admin
-- dashboard shows.
CREATE TABLE IF NOT EXISTS public.plan_assignments (
  id               SERIAL      PRIMARY KEY,
  user_id          INTEGER     REFERENCES public.users(id)         ON DELETE CASCADE,
  organization_id  INTEGER     REFERENCES public.organizations(id) ON DELETE CASCADE,
  previous_plan_id INTEGER     REFERENCES public.plans(id)         ON DELETE SET NULL,
  plan_id          INTEGER     REFERENCES public.plans(id)         ON DELETE SET NULL,
  -- NULL = chosen by the account holder at registration.
  assigned_by      INTEGER     REFERENCES public.users(id)         ON DELETE SET NULL,
  reason           VARCHAR(40) NOT NULL DEFAULT 'admin_change'
                   CHECK (reason IN ('registration','admin_change')),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_plan_assign_user ON public.plan_assignments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_assign_org  ON public.plan_assignments (organization_id, created_at DESC);

-- Seed packages. Prices are starting points in LKR for an administrator to
-- adjust from the admin dashboard — nothing in the code depends on them.
-- Limits: an integer is a cap, null is unlimited.
INSERT INTO public.plans (audience, code, name, description, price_monthly, price_yearly, is_default, sort_order, features) VALUES
  ('doctor', 'free', 'Free', 'Get started with the essentials for an independent practice.', 0, 0, TRUE, 0,
   '{"consultations_per_month":30,"appointments_per_month":20,"online_booking":true,"patient_records_access":true,"lab_requests":false,"lab_report_access":false,"e_prescriptions":false,"hospital_affiliations":1}'),
  ('doctor', 'professional', 'Professional', 'For busy doctors: lab orders, e-prescriptions and more patients.', 2500, 25000, FALSE, 1,
   '{"consultations_per_month":300,"appointments_per_month":200,"online_booking":true,"patient_records_access":true,"lab_requests":true,"lab_report_access":true,"e_prescriptions":true,"hospital_affiliations":3}'),
  ('doctor', 'premium', 'Premium', 'Unlimited consultations, bookings and affiliations.', 6000, 60000, FALSE, 2,
   '{"consultations_per_month":null,"appointments_per_month":null,"online_booking":true,"patient_records_access":true,"lab_requests":true,"lab_report_access":true,"e_prescriptions":true,"hospital_affiliations":null}'),

  ('pharmacy', 'free', 'Free', 'Dispense prescriptions and run a small catalogue.', 0, 0, TRUE, 0,
   '{"medicines":100,"suppliers":5,"purchase_orders":false,"sales_analytics":false,"inventory_reports":false,"team_members":1}'),
  ('pharmacy', 'standard', 'Standard', 'Purchase orders, sales analytics and inventory reports.', 4000, 40000, FALSE, 1,
   '{"medicines":1000,"suppliers":50,"purchase_orders":true,"sales_analytics":true,"inventory_reports":true,"team_members":5}'),
  ('pharmacy', 'premium', 'Premium', 'Unlimited catalogue, suppliers and staff.', 9000, 90000, FALSE, 2,
   '{"medicines":null,"suppliers":null,"purchase_orders":true,"sales_analytics":true,"inventory_reports":true,"team_members":null}'),

  ('laboratory', 'free', 'Free', 'Receive test requests and publish a limited number of reports.', 0, 0, TRUE, 0,
   '{"reports_per_month":50,"test_catalog":20,"direct_reports":false,"team_members":1}'),
  ('laboratory', 'standard', 'Standard', 'More reports, walk-in report uploads and a bigger test catalogue.', 4000, 40000, FALSE, 1,
   '{"reports_per_month":500,"test_catalog":200,"direct_reports":true,"team_members":5}'),
  ('laboratory', 'premium', 'Premium', 'Unlimited reports, tests and staff.', 9000, 90000, FALSE, 2,
   '{"reports_per_month":null,"test_catalog":null,"direct_reports":true,"team_members":null}'),

  ('hospital', 'starter', 'Starter', 'Channeling for a small hospital.', 0, 0, TRUE, 0,
   '{"affiliated_doctors":5,"channeling":true,"lab_requests":false,"access_requests":false}'),
  ('hospital', 'business', 'Business', 'Lab requests, patient record access and a larger doctor panel.', 15000, 150000, FALSE, 1,
   '{"affiliated_doctors":50,"channeling":true,"lab_requests":true,"access_requests":true}'),
  ('hospital', 'enterprise', 'Enterprise', 'Unlimited doctors and staff.', 40000, 400000, FALSE, 2,
   '{"affiliated_doctors":null,"channeling":true,"lab_requests":true,"access_requests":true}'),

  ('clinic', 'free', 'Free', 'A single-doctor private practice.', 0, 0, TRUE, 0,
   '{"affiliated_doctors":2,"channeling":true,"lab_requests":false,"access_requests":false}'),
  ('clinic', 'standard', 'Standard', 'Lab requests, patient record access and a few more doctors.', 3500, 35000, FALSE, 1,
   '{"affiliated_doctors":10,"channeling":true,"lab_requests":true,"access_requests":true}'),
  ('clinic', 'premium', 'Premium', 'Unlimited doctors and staff.', 8000, 80000, FALSE, 2,
   '{"affiliated_doctors":null,"channeling":true,"lab_requests":true,"access_requests":true}')
ON CONFLICT (audience, code) DO NOTHING;

-- Same reason as migrations 007/013: a real run creates these owned by
-- corehealth_migrator, and the app role needs explicit grants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.plans_id_seq TO corehealth_app;
    GRANT SELECT, INSERT ON public.plan_assignments TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.plan_assignments_id_seq TO corehealth_app;
  END IF;
END $$;

-- Down Migration

DROP TABLE IF EXISTS public.plan_assignments;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS plan_id;
ALTER TABLE public.users         DROP COLUMN IF EXISTS plan_id;
DROP TABLE IF EXISTS public.plans;
