-- Migration 017 — email verification by 6-digit code, and Google sign-in for
-- patients.
--
-- 1. Verification moves from an emailed link to an emailed 6-digit code that
--    the person types in on the registration / sign-in screen. The table from
--    migration 011 is reused; a code is far smaller than the old 64-hex token,
--    so:
--      * attempts — a wrong guess is counted, and the code is burned after 5,
--        so the 1-in-a-million space cannot be brute-forced within its
--        15-minute life;
--      * token_hash is no longer UNIQUE — the hash is SHA-256("<user id>:<code>")
--        and the same user can, rarely, be issued the same 6 digits twice.
--        Lookups go by user_id (the newest unused row), never by hash alone.
--
-- 2. users.google_sub — the stable Google account id ("sub" claim of a Google
--    ID token). Set the first time a patient signs in with Google; later
--    sign-ins match on it, so a changed Gmail address still finds the account.
--    Only patients may use Google sign-in (enforced in authController).

-- Up Migration

ALTER TABLE public.email_verification_tokens
  ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.email_verification_tokens
  DROP CONSTRAINT IF EXISTS email_verification_tokens_token_hash_key;

COMMENT ON COLUMN public.email_verification_tokens.token_hash IS
  'SHA-256 of "<user_id>:<6-digit code>" — never the code itself. Not unique: look up by user_id.';
COMMENT ON COLUMN public.email_verification_tokens.attempts IS
  'Wrong guesses against this code. Burned (used_at set) at 5.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub
  ON public.users (google_sub) WHERE google_sub IS NOT NULL;

COMMENT ON COLUMN public.users.google_sub IS
  'Google account id (ID-token "sub") for patients who sign in with Google. NULL = never used Google sign-in.';

-- Down Migration

DROP INDEX IF EXISTS public.uq_users_google_sub;
ALTER TABLE public.users DROP COLUMN IF EXISTS google_sub;
ALTER TABLE public.email_verification_tokens DROP COLUMN IF EXISTS attempts;
-- The UNIQUE constraint on token_hash is not restored: codes issued while 017
-- was live may legitimately share a hash.
