-- Migration 013 — doctor/hospital channeling affiliation requires approval.
--
-- Before this, `organization_members` rows for a doctor were inserted or
-- deleted unconditionally from three different places (self-registration,
-- the doctor's own "join a hospital" button, an org owner's "remove member"
-- button) with no review step at all. A doctor could add themselves to any
-- hospital and start offering channeling slots there with nobody at that
-- hospital ever having agreed to it, and an owner could cut a doctor off
-- mid-affiliation with no warning.
--
-- This table is the request/approval layer sitting in front of that table
-- for the doctor<->hospital/clinic relationship specifically (not
-- pharmacist/laboratory/staff members, who are unaffected):
--   kind='join'   doctor requests to start channeling at an org; the org
--                 owner accepts or declines. Optionally carries the weekly
--                 hours the doctor is proposing, applied atomically on accept.
--   kind='remove' the org owner wants to end an existing doctor's
--                 affiliation; the doctor must accept before the membership
--                 row is actually deleted. A doctor leaving on their own
--                 initiative is NOT this flow — that stays an immediate,
--                 unilateral delete (see userController.leaveOrganization),
--                 just now with a notification to the owner.
--
-- Same pending/accepted/declined shape as the existing
-- clinical.data_access_requests / clinical.lab_view_requests precedent, but
-- this one lives in `public` alongside organization_members — it is not
-- patient data and does not need RLS.

-- Up Migration

CREATE TABLE IF NOT EXISTS public.organization_membership_requests (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doctor_id        INTEGER     NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  kind             VARCHAR(10) NOT NULL CHECK (kind IN ('join','remove')),
  status           VARCHAR(10) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','declined','cancelled')),
  -- 'join': the doctor. 'remove': the owner who asked for the removal.
  requested_by     INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message          TEXT,
  -- 'join' only: the weekly hours the doctor is proposing for this org, same
  -- shape as the body setWeeklyAvailability already accepts — applied via
  -- the same replace logic the moment the owner accepts, so approval and
  -- going live happen as one step, not two.
  proposed_schedule JSONB,
  responded_by     INTEGER     REFERENCES public.users(id) ON DELETE SET NULL,
  responded_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one open request of a given kind per doctor+org at a time — a
-- second "join" tap while one is already pending would otherwise queue up
-- duplicate requests the owner has to sort through.
CREATE UNIQUE INDEX IF NOT EXISTS idx_omr_one_pending
  ON public.organization_membership_requests (organization_id, doctor_id, kind)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_omr_org    ON public.organization_membership_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_omr_doctor ON public.organization_membership_requests(doctor_id, status);

COMMENT ON TABLE public.organization_membership_requests IS
  'Approval layer in front of organization_members for the doctor<->hospital/clinic channeling relationship. kind=join is doctor-initiated and owner-approved; kind=remove is owner-initiated and doctor-approved.';

-- A real migration run creates this table owned by corehealth_migrator;
-- corehealth_app (the non-superuser role the app runs as, DB-02) needs an
-- explicit grant to use it — same reason migration 007 does this for
-- audit_log. Guarded for environments where the role doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.organization_membership_requests TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.organization_membership_requests_id_seq TO corehealth_app;
  END IF;
END $$;

-- Down Migration

DROP TABLE IF EXISTS public.organization_membership_requests;
