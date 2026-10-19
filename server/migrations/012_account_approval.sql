-- Migration 012 — tell "waiting for approval" apart from "deactivated" (SEC-17 #2).
--
-- SEC-17 #2 made professional sign-ups inactive until an admin approves them,
-- which is correct. But `is_active = false` is the only state recording it, and
-- that same flag also means "an admin switched this account off". The two are
-- not the same thing and must not read the same way:
--
--   * waiting for approval — the person did nothing wrong, somebody just has
--     to look at their registration. Telling them "your account has been
--     deactivated" is both wrong and alarming.
--   * deactivated — a deliberate admin action. Telling them "waiting for
--     approval" implies it will resolve on its own, and it will not.
--
-- The login message conflated them ("pending admin approval or has been
-- deactivated"), and the admin UI could not list one without the other — a
-- newly registered doctor was indistinguishable from a suspended one in a
-- list of users, which is why nobody could find registrations to approve.
--
-- approved_at is the discriminator:
--   is_active = false, approved_at IS NULL      -> waiting for approval
--   is_active = false, approved_at IS NOT NULL  -> deactivated after approval
--   is_active = true                            -> usable

-- Up Migration

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.approved_at IS
  'When an admin approved this professional registration. NULL on an inactive account means it is still waiting for approval, not deactivated.';
COMMENT ON COLUMN public.users.approved_by IS
  'The admin who approved it. ON DELETE SET NULL so removing an admin never erases the record that an approval happened.';

-- The admin queue: inactive, never approved, not deleted. Partial so it stays
-- tiny — this is a worklist, not a growing table.
CREATE INDEX IF NOT EXISTS idx_users_pending_approval
  ON public.users (created_at)
  WHERE is_active = FALSE AND approved_at IS NULL AND deleted_at IS NULL;

-- Backfill.
--
-- Active accounts are working today, so they were approved at some point even
-- if nothing recorded it; created_at is the honest approximation and does not
-- claim they were approved just now.
UPDATE public.users
   SET approved_at = created_at
 WHERE is_active = TRUE AND approved_at IS NULL;

-- Inactive accounts are genuinely ambiguous: nothing distinguishes a sign-up
-- nobody got round to from an account an admin switched off. They are left
-- NULL, i.e. treated as waiting for approval, deliberately — the failure mode
-- is an admin seeing a previously-suspended account in the approvals queue and
-- declining it, which is visible and correctable. The alternative (marking them
-- all approved-then-deactivated) would hide real pending registrations
-- forever, which is the bug this migration exists to fix.
--
-- Patients are never subject to approval (SEC-17 #2 applies to professional
-- roles), so an inactive patient really was deactivated.
UPDATE public.users
   SET approved_at = created_at
 WHERE is_active = FALSE AND approved_at IS NULL AND role = 'patient';

-- Down Migration

DROP INDEX IF EXISTS public.idx_users_pending_approval;
ALTER TABLE public.users
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at;
