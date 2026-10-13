-- Migration 008 — record which terms/privacy version each user accepted (COMP-02).
--
-- The sign-up pages claimed "you agree to Core Health's Terms of Service and
-- Privacy Policy" as plain text. No such documents existed, nothing linked to
-- them, and nothing recorded what anyone had agreed to — so there was no way
-- to answer "which version did this patient accept", which is the question
-- that matters if the policy is ever disputed or has to change.
--
-- Additive only. Existing rows get NULL, which is accurate: those users
-- accepted a document that did not exist, and pretending otherwise by
-- backfilling a version would be worse than recording the gap. They should be
-- re-prompted to accept the published version — see the note at the bottom.

-- Up Migration

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS accepted_terms_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS accepted_terms_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.users.accepted_terms_version IS
  'Version string of the Terms/Privacy Policy accepted at sign-up (see client/src/legal/index.ts LEGAL_VERSION). NULL = signed up before the documents existed; re-acceptance required.';

-- Finding users who need to re-accept after a policy change is the only query
-- this column exists to serve, so index for it. Partial and tiny: once
-- everyone has accepted the current version this index holds almost nothing.
CREATE INDEX IF NOT EXISTS idx_users_accepted_terms_pending
  ON public.users (id)
  WHERE accepted_terms_version IS NULL AND deleted_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS public.idx_users_accepted_terms_pending;
ALTER TABLE public.users
  DROP COLUMN IF EXISTS accepted_terms_at,
  DROP COLUMN IF EXISTS accepted_terms_version;

-- Still open after this migration, and deliberately not done here because it
-- is a product decision rather than a schema one: existing users
-- (accepted_terms_version IS NULL) are not yet prompted to accept the
-- published documents. The data to find them is now available:
--
--   SELECT id, email, role FROM public.users
--   WHERE accepted_terms_version IS NULL AND deleted_at IS NULL;
--
-- A re-acceptance prompt on next login is the usual answer. COMP-02 is not
-- fully closed until that exists and a lawyer has approved the text.
