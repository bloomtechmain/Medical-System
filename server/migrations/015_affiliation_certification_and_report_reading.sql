-- Migration 015 — hospital certification of a doctor's registration, and
-- visible results for reading vitals out of uploaded reports.
--
-- 1. Affiliation certification at sign-up.
--
--    A doctor registering names the hospitals/clinics they work at. Until
--    now those were written straight into organization_members — the doctor
--    was "affiliated" the moment they typed the name, nobody at the hospital
--    was asked, and the admin approving the registration had nothing but
--    the doctor's word for it.
--
--    Now each one becomes an organization_membership_requests row (the
--    migration 013 approval layer) flagged is_registration = TRUE. The
--    hospital/clinic owner certifies or rejects it from their dashboard, and
--    the admin can only approve the doctor's account once every one of those
--    requests has been answered (userController.approveUser). The flag is
--    what lets both sides tell "a new doctor is asking you to vouch for
--    their registration" apart from an already-active doctor's ordinary
--    request to start channeling.
--
-- 2. Report reading status.
--
--    A patient uploading a lab report had vitals extracted in a background
--    job with no trace of the result: nothing told them whether it worked,
--    what was read, or that a blurred photo yielded nothing. These columns
--    record the outcome so the reports page can show "12 values read",
--    "couldn't read this photo", or "still reading".

-- Up Migration

ALTER TABLE public.organization_membership_requests
  ADD COLUMN IF NOT EXISTS is_registration BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.organization_membership_requests.is_registration IS
  'TRUE when the request was created by the doctor''s own sign-up: the org owner is certifying the registration, and the admin cannot approve the account until every such request is answered.';

CREATE INDEX IF NOT EXISTS idx_omr_registration_pending
  ON public.organization_membership_requests (doctor_id)
  WHERE is_registration = TRUE AND status = 'pending';

ALTER TABLE clinical.patient_reports
  ADD COLUMN IF NOT EXISTS vitals_status     VARCHAR(12)
    CHECK (vitals_status IN ('pending','extracted','none','failed')),
  ADD COLUMN IF NOT EXISTS vitals_found      INTEGER,
  ADD COLUMN IF NOT EXISTS vitals_confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vitals_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN clinical.patient_reports.vitals_status IS
  'Outcome of reading vitals from the uploaded file: pending (queued), extracted (vitals_found values saved), none (read, but no values recognised), failed (the file could not be read). NULL for report types that are not read.';

-- Down Migration

ALTER TABLE clinical.patient_reports
  DROP COLUMN IF EXISTS vitals_checked_at,
  DROP COLUMN IF EXISTS vitals_confidence,
  DROP COLUMN IF EXISTS vitals_found,
  DROP COLUMN IF EXISTS vitals_status;

DROP INDEX IF EXISTS public.idx_omr_registration_pending;
ALTER TABLE public.organization_membership_requests
  DROP COLUMN IF EXISTS is_registration;
