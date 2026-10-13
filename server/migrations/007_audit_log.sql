-- Migration 006 — append-only audit log (MON-12, 09-monitoring-logging-alerting.md).
--
-- Additive only: creates one new table plus its indexes and grants. Safe to
-- run against a database with real data in it.
--
-- Before this, the only thing recorded anywhere was the *start* of an admin
-- impersonation (public.impersonation_log). Not recorded at all: logins and
-- failed logins, password changes made by an admin, role and active-state
-- changes, user and record deletion, and — the one the audit calls out as
-- important for a health application — who viewed which patient's record.

-- Up Migration

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              BIGSERIAL    PRIMARY KEY,
  -- When, as recorded by the database rather than the application, so a
  -- wrong clock on an instance cannot backdate an entry.
  occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Who. NULL actor_id is meaningful and must stay allowed: a failed login
  -- for an address that does not exist has no user to point at, and that is
  -- exactly the event worth keeping. ON DELETE SET NULL rather than CASCADE —
  -- deleting a user must never erase the record of what they did.
  actor_id        INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email     VARCHAR(254),
  actor_role      VARCHAR(30),
  -- The admin behind an impersonated session, read from the token's
  -- impersonatedBy claim, so "the doctor did it" and "an admin did it while
  -- impersonating the doctor" are distinguishable after the fact.
  impersonated_by INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,

  -- What. Free-form but conventional: see server/utils/auditLog.ts for the
  -- fixed set of action names the application actually writes.
  action          VARCHAR(60)  NOT NULL,
  -- Which thing it happened to: ('user', 42), ('consultation', 17), ...
  target_type     VARCHAR(40),
  target_id       INTEGER,
  -- The patient whose data was involved, when that is not the target itself.
  -- Indexed separately because "everything that touched this patient" is the
  -- question a data-subject access request actually asks.
  patient_user_id INTEGER      REFERENCES public.users(id) ON DELETE SET NULL,

  outcome         VARCHAR(20)  NOT NULL DEFAULT 'success'
                  CHECK (outcome IN ('success', 'failure', 'denied')),

  -- Where from. Useful for "failed logins per hour from one address"
  -- (WARN-11) and for an access review.
  ip_address      INET,
  user_agent      TEXT,
  request_id      UUID,

  -- Anything action-specific. Must never hold clinical content or
  -- credentials — only identifiers and changed field names (see
  -- auditLog.ts, which enforces this on the way in).
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb
);

-- "What did this user do", the access-review and incident question.
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time
  ON public.audit_log (actor_id, occurred_at DESC);

-- "Who touched this patient's data", the data-subject question.
CREATE INDEX IF NOT EXISTS idx_audit_log_patient_time
  ON public.audit_log (patient_user_id, occurred_at DESC)
  WHERE patient_user_id IS NOT NULL;

-- "Show me every failed login in the last hour", the alerting question
-- (WARN-11). Partial, so the index stays small — failures are the minority.
CREATE INDEX IF NOT EXISTS idx_audit_log_action_time
  ON public.audit_log (action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_failures
  ON public.audit_log (occurred_at DESC)
  WHERE outcome <> 'success';

-- Append-only, enforced by privilege rather than by convention. corehealth_app
-- is the non-superuser role the application runs as (DB-02), so revoking
-- UPDATE/DELETE here means a bug — or someone who has taken over the
-- application's credentials — cannot rewrite history. Retention trimming is a
-- separate, deliberate act performed by the migrator role (COMP-04).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corehealth_app') THEN
    GRANT SELECT, INSERT ON public.audit_log TO corehealth_app;
    REVOKE UPDATE, DELETE ON public.audit_log FROM corehealth_app;
    GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO corehealth_app;
  END IF;
END $$;

-- Down Migration

DROP TABLE IF EXISTS public.audit_log;
