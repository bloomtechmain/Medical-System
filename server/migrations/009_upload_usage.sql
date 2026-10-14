-- Migration 009 — per-user upload accounting (COST-04, PRO-07).
--
-- COST-04: "nothing caps the cost of abuse: no rate limits, uploads of up to
-- 20 MB each with no limit on count or per-user quota, and each upload can
-- start CPU-heavy OCR." The rate limit half is done (uploadLimiter, 20/min
-- per user). The *quota* half needs somewhere to add up what a user has
-- already stored, which is this table.
--
-- Why a separate table rather than a file_size column on each of the four
-- tables that reference an upload: the quota question is "how many bytes has
-- this user sent", which spans all of them, and answering it from four
-- clinical tables means four scans plus a UNION that grows every time another
-- upload path is added. One row per upload, indexed by (user, time), answers
-- it with a single bounded index scan.
--
-- It also gives something the clinical tables cannot: a record of uploads
-- whose owning row was never created (the request failed validation after the
-- file was written) and of deleted records' storage, which is what makes
-- orphaned-file cleanup possible at all.

-- Up Migration

CREATE TABLE IF NOT EXISTS public.upload_usage (
  id          BIGSERIAL    PRIMARY KEY,
  -- ON DELETE CASCADE here is correct and differs from audit_log on purpose:
  -- this is accounting, not an audit trail. Once the user is really gone
  -- their quota is meaningless, and the audit log holds the record of what
  -- happened.
  user_id     INTEGER      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Which upload directory/prefix: 'prescriptions', 'lab-reports',
  -- 'lab-referrals', 'patient-reports'. Lets a quota be set per category
  -- later without another migration.
  subdir      VARCHAR(40)  NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  bytes       BIGINT       NOT NULL CHECK (bytes >= 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Set when the file is deleted, so the row can stay as a record while
  -- stopping it counting against the live storage quota.
  deleted_at  TIMESTAMPTZ
);

-- The quota query: this user's live bytes, optionally within a time window.
CREATE INDEX IF NOT EXISTS idx_upload_usage_user_time
  ON public.upload_usage (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Finding a specific file's accounting row when it is deleted.
CREATE INDEX IF NOT EXISTS idx_upload_usage_filename
  ON public.upload_usage (subdir, filename);

-- 001's grants to corehealth_app were a one-time "ALL TABLES IN SCHEMA"
-- snapshot, not a default-privileges rule, so a table created by a later
-- migration needs its own grant or the running server gets "permission
-- denied" the first time it touches it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_usage TO corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.upload_usage_id_seq TO corehealth_app;
  END IF;
END $$;

-- Down Migration

DROP TABLE IF EXISTS public.upload_usage;
