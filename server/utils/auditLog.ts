import type { Request } from 'express';
import { pool } from '../config/db';
import { logger } from '../config/logger';

// MON-12: append-only record of the security- and privacy-relevant things
// that happen. Writes go to public.audit_log, which the application role can
// only SELECT and INSERT (migration 007 revokes UPDATE/DELETE), so nothing
// reachable from a request can rewrite history.

// The fixed vocabulary. A free-form string column with a known set of values
// used by the code, rather than a database enum, so adding an action is a
// code change and not a migration — but kept in one place so the set stays
// greppable and the dashboards/alerts have something stable to match on.
export const AuditAction = {
  LOGIN_SUCCESS: 'login.success',
  LOGIN_FAILURE: 'login.failure',
  LOGOUT: 'logout',
  MFA_CHALLENGE_FAILURE: 'login.mfa_failure',
  PASSWORD_CHANGED_SELF: 'password.changed_self',
  PASSWORD_RESET_REQUESTED: 'password.reset_requested',
  PASSWORD_RESET_COMPLETED: 'password.reset_completed',
  PASSWORD_CHANGED_BY_ADMIN: 'password.changed_by_admin',
  USER_CREATED: 'user.created',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_ACTIVE_CHANGED: 'user.active_changed',
  USER_DELETED: 'user.deleted',
  USER_APPROVED: 'user.approved',
  IMPERSONATION_STARTED: 'impersonation.started',
  PATIENT_RECORD_VIEWED: 'patient_record.viewed',
  PATIENT_FILE_DOWNLOADED: 'patient_file.downloaded',
  ACCESS_REQUEST_DECIDED: 'access_request.decided',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
type Outcome = 'success' | 'failure' | 'denied';

interface AuditEntry {
  action: AuditActionName;
  outcome?: Outcome;
  // Who did it. Normally taken from the request's authenticated user; passed
  // explicitly for the cases where there isn't one (a failed login) or where
  // the actor is not the requester.
  actorId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  patientUserId?: number | null;
  metadata?: Record<string, unknown>;
}

// Anything that could carry credentials or clinical content is refused rather
// than redacted, so a careless caller fails loudly in development instead of
// quietly writing PHI into a table that is deliberately hard to delete from.
const FORBIDDEN_METADATA_KEYS = new Set([
  'password', 'newpassword', 'currentpassword', 'token', 'refreshtoken',
  'secret', 'mfa_secret', 'totp', 'diagnosis', 'notes', 'ocr_text',
  'sick_description', 'treatment_description', 'prescription_file',
]);

const assertSafeMetadata = (metadata: Record<string, unknown>): void => {
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `audit metadata must not contain "${key}" — the audit log records identifiers and changed field names, never credentials or clinical content`
      );
    }
  }
};

// Pull the request-scoped bits (IP, user agent, request id, impersonator) off
// the request so every call site doesn't have to.
const writeAudit = async (req: Request | null, entry: AuditEntry): Promise<void> => {
  const metadata = entry.metadata ?? {};
  try {
    assertSafeMetadata(metadata);
  } catch (err) {
    // A programming error, not a runtime condition: surface it loudly in
    // development/test, and in production drop the metadata rather than
    // either losing the entry or writing something that must not be stored.
    if (process.env.NODE_ENV !== 'production') throw err;
    logger.error({ err, action: entry.action }, 'Unsafe audit metadata dropped');
  }

  const actor = entry.actorId !== undefined ? { id: entry.actorId } : { id: req?.user?.id ?? null };
  const impersonatedBy = req?.user?.impersonatedBy ?? null;

  try {
    await pool.query(
      `INSERT INTO public.audit_log
         (actor_id, actor_email, actor_role, impersonated_by, action, target_type,
          target_id, patient_user_id, outcome, ip_address, user_agent, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        actor.id,
        entry.actorEmail ?? req?.user?.email ?? null,
        entry.actorRole ?? req?.user?.role ?? null,
        impersonatedBy,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.patientUserId ?? null,
        entry.outcome ?? 'success',
        req?.ip ?? null,
        req?.get?.('user-agent')?.slice(0, 1000) ?? null,
        typeof req?.id === 'string' ? req.id : null,
        JSON.stringify(metadata),
      ]
    );
  } catch (err) {
    // An audit write must never turn a working request into a failed one — a
    // patient should not be unable to see their own record because the log
    // table is full. It is logged at error level so the gap is visible, which
    // is what the "audit writes failing" alert watches for.
    logger.error({ err, action: entry.action }, 'Failed to write audit log entry');
  }
};

// Fire-and-forget wrapper for call sites on the request's happy path, where
// waiting on an extra INSERT before responding is not worth the latency.
// writeAudit never rejects, so this cannot produce an unhandled rejection.
const audit = (req: Request | null, entry: AuditEntry): void => {
  void writeAudit(req, entry);
};

export { audit, writeAudit };
