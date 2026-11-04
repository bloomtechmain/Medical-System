-- Migration 016 — monthly billing for paid packages, and upgrade/downgrade
-- requests that the admin approves.
--
-- Migration 014 gave every professional dashboard a package, but a paid
-- package never ran out: once an admin set it, it stayed forever whether or
-- not anything was paid. This adds the billing cycle:
--
--   * A paid package runs month to month. plan_expires_at is the end of the
--     time the account has covered. When it passes without a payment the
--     account is suspended (plan_suspended_at) — it can still sign in, see
--     what is owed and read its notifications, but the dashboard is locked
--     until an admin records the payment.
--   * Free packages (price 0) have no cycle: plan_expires_at stays NULL and
--     they are never suspended. Patients have no package at all and are
--     never affected.
--   * Reminders go out 7, 3 and 1 day(s) before expiry and on expiry.
--     billing_notices records each one sent so a reminder is never repeated
--     for the same period, however often the billing job runs.
--   * An admin "marks payment received": a subscription_payments row, and
--     plan_expires_at moves one month (or more) forward — from the old end
--     date if the account was still covered, from now if it had lapsed.
--   * Upgrade/downgrade: the account holder asks (plan_change_requests), an
--     admin approves, and the change is scheduled for the start of the next
--     period (next_plan_id + next_plan_effective_at) so the month already
--     paid for is not cut short or re-priced.
--
-- The same columns go on users (a doctor's personal dashboard, or an
-- org-less pharmacist/laboratory) and organizations (pharmacy, laboratory,
-- hospital, clinic) — wherever plan_id already lives.

-- Up Migration

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_plan_id          INTEGER REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_plan_effective_at TIMESTAMPTZ;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_plan_id          INTEGER REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_plan_effective_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.plan_expires_at IS
  'End of the period a paid package is covered until. NULL = no billing cycle (free package, or not yet approved). Past this without a payment the account is suspended.';
COMMENT ON COLUMN public.users.plan_suspended_at IS
  'Set when a paid package expired unpaid: the dashboard is locked until an admin records a payment.';
COMMENT ON COLUMN public.users.next_plan_id IS
  'An approved upgrade/downgrade waiting for next_plan_effective_at (the start of the next billing period).';
COMMENT ON COLUMN public.organizations.plan_expires_at IS
  'End of the period a paid package is covered until. NULL = no billing cycle (free package, or not yet approved). Past this without a payment the organization is suspended.';
COMMENT ON COLUMN public.organizations.plan_suspended_at IS
  'Set when a paid package expired unpaid: the dashboard is locked until an admin records a payment.';
COMMENT ON COLUMN public.organizations.next_plan_id IS
  'An approved upgrade/downgrade waiting for next_plan_effective_at (the start of the next billing period).';

CREATE INDEX IF NOT EXISTS idx_users_plan_expires ON public.users (plan_expires_at) WHERE plan_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_plan_expires   ON public.organizations (plan_expires_at) WHERE plan_expires_at IS NOT NULL;

-- Payments an admin has recorded. There is no payment gateway: money arrives
-- by bank transfer, cash, etc., and this is the ledger of it.
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id               SERIAL        PRIMARY KEY,
  user_id          INTEGER       REFERENCES public.users(id)         ON DELETE CASCADE,
  organization_id  INTEGER       REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id          INTEGER       REFERENCES public.plans(id)         ON DELETE SET NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency         CHAR(3)       NOT NULL DEFAULT 'LKR',
  method           VARCHAR(20)   NOT NULL DEFAULT 'bank_transfer'
                   CHECK (method IN ('cash','bank_transfer','card','online','cheque','other')),
  reference        VARCHAR(120),
  note             TEXT,
  months           INTEGER       NOT NULL DEFAULT 1 CHECK (months BETWEEN 1 AND 12),
  period_start     TIMESTAMPTZ   NOT NULL,
  period_end       TIMESTAMPTZ   NOT NULL,
  recorded_by      INTEGER       REFERENCES public.users(id)         ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NULL) <> (organization_id IS NULL)),
  CHECK (period_end > period_start)
);
CREATE INDEX IF NOT EXISTS idx_sub_pay_user    ON public.subscription_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_pay_org     ON public.subscription_payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_pay_created ON public.subscription_payments (created_at DESC);

-- Upgrade / downgrade requests from the account holder.
--   pending   → waiting for an admin
--   approved  → scheduled for effective_at (next billing period)
--   applied   → the account is now on to_plan_id
--   rejected / cancelled → closed without a change
CREATE TABLE IF NOT EXISTS public.plan_change_requests (
  id               SERIAL       PRIMARY KEY,
  user_id          INTEGER      REFERENCES public.users(id)         ON DELETE CASCADE,
  organization_id  INTEGER      REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by     INTEGER      REFERENCES public.users(id)         ON DELETE SET NULL,
  from_plan_id     INTEGER      REFERENCES public.plans(id)         ON DELETE SET NULL,
  to_plan_id       INTEGER      NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  direction        VARCHAR(10)  NOT NULL CHECK (direction IN ('upgrade','downgrade')),
  message          TEXT,
  status           VARCHAR(12)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','applied','rejected','cancelled')),
  decided_by       INTEGER      REFERENCES public.users(id)         ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  effective_at     TIMESTAMPTZ,
  applied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);
-- One open (pending or scheduled) request per account at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcr_one_open_user ON public.plan_change_requests (user_id)
  WHERE user_id IS NOT NULL AND status IN ('pending','approved');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcr_one_open_org  ON public.plan_change_requests (organization_id)
  WHERE organization_id IS NOT NULL AND status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS idx_pcr_status ON public.plan_change_requests (status, created_at DESC);

-- Reminders already sent, so the billing job can run as often as it likes.
CREATE TABLE IF NOT EXISTS public.billing_notices (
  id               SERIAL      PRIMARY KEY,
  user_id          INTEGER     REFERENCES public.users(id)         ON DELETE CASCADE,
  organization_id  INTEGER     REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_end       TIMESTAMPTZ NOT NULL,
  stage            VARCHAR(10) NOT NULL CHECK (stage IN ('7d','3d','1d','expired')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_notice_user ON public.billing_notices (user_id, period_end, stage) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_notice_org  ON public.billing_notices (organization_id, period_end, stage) WHERE organization_id IS NOT NULL;

-- Plan history now also records changes that came from an approved request.
ALTER TABLE public.plan_assignments DROP CONSTRAINT IF EXISTS plan_assignments_reason_check;
ALTER TABLE public.plan_assignments ADD CONSTRAINT plan_assignments_reason_check
  CHECK (reason IN ('registration','admin_change','change_request'));

-- Accounts already on a paid package get their first month from today, so
-- turning billing on does not suspend anyone on the spot.
UPDATE public.users u
   SET plan_expires_at = NOW() + INTERVAL '1 month'
  FROM public.plans p
 WHERE p.id = u.plan_id AND p.price_monthly > 0
   AND u.plan_expires_at IS NULL AND u.is_active AND u.deleted_at IS NULL;

UPDATE public.organizations o
   SET plan_expires_at = NOW() + INTERVAL '1 month'
  FROM public.plans p
 WHERE p.id = COALESCE(o.plan_id, (SELECT d.id FROM public.plans d WHERE d.audience = o.org_type AND d.is_default))
   AND p.price_monthly > 0
   AND o.plan_expires_at IS NULL AND o.is_active;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.subscription_payments TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.subscription_payments_id_seq TO corehealth_app;
    GRANT SELECT, INSERT, UPDATE ON public.plan_change_requests TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.plan_change_requests_id_seq TO corehealth_app;
    GRANT SELECT, INSERT, DELETE ON public.billing_notices TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.billing_notices_id_seq TO corehealth_app;
  END IF;
END $$;

-- Down Migration

ALTER TABLE public.plan_assignments DROP CONSTRAINT IF EXISTS plan_assignments_reason_check;
ALTER TABLE public.plan_assignments ADD CONSTRAINT plan_assignments_reason_check
  CHECK (reason IN ('registration','admin_change'));

DROP TABLE IF EXISTS public.billing_notices;
DROP TABLE IF EXISTS public.plan_change_requests;
DROP TABLE IF EXISTS public.subscription_payments;

DROP INDEX IF EXISTS public.idx_org_plan_expires;
DROP INDEX IF EXISTS public.idx_users_plan_expires;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS next_plan_effective_at,
  DROP COLUMN IF EXISTS next_plan_id,
  DROP COLUMN IF EXISTS plan_suspended_at,
  DROP COLUMN IF EXISTS plan_expires_at;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS next_plan_effective_at,
  DROP COLUMN IF EXISTS next_plan_id,
  DROP COLUMN IF EXISTS plan_suspended_at,
  DROP COLUMN IF EXISTS plan_expires_at;
