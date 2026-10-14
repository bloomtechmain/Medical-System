-- Migration 011 — email verification before an account can act (PRO-11).
--
-- PRO-11: "Sign-up needs no email verification and no CAPTCHA, and the
-- account can act at once." Suggested fix: "Verify the email before the
-- account can do anything."
--
-- The schema-per-request half of PRO-11 is already fixed — a tenant schema is
-- now created when an admin approves the organisation, not on the public
-- registration call. This is the other half.
--
-- Token design copies public.password_reset_tokens exactly, because the
-- threat model is identical: an opaque random token is emailed, and only its
-- SHA-256 hash is stored, so a database leak hands out nothing usable. One
-- row per issued token rather than a column on users, so re-sending is
-- auditable and an old token can be invalidated independently.

-- Up Migration

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.email_verified_at IS
  'When the registration email address was confirmed. NULL = unverified; login is refused while FEATURE_REQUIRE_EMAIL_VERIFICATION is on.';

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- SHA-256 of the token, never the token itself.
  token_hash CHAR(64)     NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_user ON public.email_verification_tokens (user_id);
-- Rate-limiting resends needs "how many have I issued to this user recently".
CREATE INDEX IF NOT EXISTS idx_evt_user_created
  ON public.email_verification_tokens (user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verification_tokens TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.email_verification_tokens_id_seq TO corehealth_app;
  END IF;
END $$;

-- Grandfather every account that already exists.
--
-- This is the one place where the obvious implementation would be actively
-- harmful: leaving existing rows NULL means that the moment verification is
-- enforced, every current user — including the admin who would have to fix it
-- — is locked out of a system holding live patient records. Their addresses
-- are not *proven*, but they have been in use, and a self-inflicted total
-- lockout is far worse than that residual risk.
--
-- created_at, not NOW(), so the timestamp does not falsely claim they
-- verified today. Anyone genuinely needing re-verification can be found with
--   SELECT id, email FROM public.users WHERE email_verified_at = created_at;
UPDATE public.users
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS public.email_verification_tokens;
ALTER TABLE public.users DROP COLUMN IF EXISTS email_verified_at;
