// Integration test against a REAL Postgres database — the audit log is only
// worth having if the writes actually land and cannot be erased, and both of
// those are database-level properties that a mock would assert nothing about.
//
// Requires DATABASE_URL (CI sets it). Skipped without one.
import type { Request } from 'express';
import { pool } from '../../config/db';
import { writeAudit, AuditAction } from '../auditLog';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('audit log', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let actorId: number;
  let patientId: number;

  // A minimal stand-in for the request-scoped fields writeAudit reads.
  const fakeReq = (over: Partial<Record<string, unknown>> = {}): Request =>
    ({
      ip: '203.0.113.7',
      id: '11111111-2222-3333-4444-555555555555',
      get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'jest/testing' : undefined),
      user: { id: actorId, email: `audit-actor-${suffix}@test.local`, role: 'doctor' },
      ...over,
    }) as unknown as Request;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role) VALUES
         ('Audit Actor', $1, 'x', 'doctor'),
         ('Audit Patient', $2, 'x', 'patient')
       RETURNING id`,
      [`audit-actor-${suffix}@test.local`, `audit-patient-${suffix}@test.local`]
    );
    [actorId, patientId] = rows.map(r => r.id);
  });

  afterAll(async () => {
    // The audit rows are deliberately NOT cleaned up: the application role
    // has no DELETE on that table, which is the behaviour the append-only
    // test asserts. They point at users that are about to disappear, and the
    // FKs are ON DELETE SET NULL precisely so the record of what happened
    // outlives the accounts involved.
    await pool.query('DELETE FROM public.users WHERE id = ANY($1::int[])', [[actorId, patientId]]);
    await pool.end();
  });

  it('records who viewed which patient record, with request context', async () => {
    await writeAudit(fakeReq(), {
      action: AuditAction.PATIENT_RECORD_VIEWED,
      targetType: 'patient',
      targetId: patientId,
      patientUserId: patientId,
      metadata: { consultationCount: 3 },
    });

    const { rows } = await pool.query(
      `SELECT actor_id, actor_role, action, patient_user_id, outcome,
              host(ip_address) AS ip, user_agent, request_id, metadata
       FROM public.audit_log
       WHERE patient_user_id = $1 AND action = $2`,
      [patientId, AuditAction.PATIENT_RECORD_VIEWED]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(actorId);
    expect(rows[0].actor_role).toBe('doctor');
    expect(rows[0].outcome).toBe('success');
    expect(rows[0].ip).toBe('203.0.113.7');
    expect(rows[0].user_agent).toBe('jest/testing');
    expect(rows[0].request_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(rows[0].metadata).toEqual({ consultationCount: 3 });
  });

  it('records a failed login with no actor, keeping the attempted address', async () => {
    // Suffixed so repeated runs against the same database each match exactly
    // one row — the rows cannot be cleaned up afterwards, by design (see the
    // append-only test below).
    const attempted = `nobody-${suffix}@test.local`;
    await writeAudit(fakeReq({ user: undefined }), {
      action: AuditAction.LOGIN_FAILURE,
      outcome: 'failure',
      actorId: null,
      actorEmail: attempted,
      metadata: { reason: 'unknown_email' },
    });

    const { rows } = await pool.query(
      `SELECT actor_id, actor_email, outcome FROM public.audit_log
       WHERE action = $1 AND actor_email = $2`,
      [AuditAction.LOGIN_FAILURE, attempted]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBeNull();
    expect(rows[0].outcome).toBe('failure');
  });

  // The point of the table. Enforced by privilege in migration 007, so this
  // holds against anything reachable from a request — including a SQL
  // injection or stolen application credentials — not just against code that
  // remembers to behave.
  it('is append-only for the application role', async () => {
    await writeAudit(fakeReq(), { action: AuditAction.LOGIN_SUCCESS });

    await expect(
      pool.query('DELETE FROM public.audit_log WHERE actor_id = $1', [actorId])
    ).rejects.toThrow(/permission denied/i);

    await expect(
      pool.query('UPDATE public.audit_log SET action = $1 WHERE actor_id = $2', ['tampered', actorId])
    ).rejects.toThrow(/permission denied/i);
  });

  it('attributes an impersonated action to the admin behind it', async () => {
    await writeAudit(
      fakeReq({ user: { id: actorId, email: 'x@test.local', role: 'doctor', impersonatedBy: patientId } }),
      { action: AuditAction.PATIENT_RECORD_VIEWED, targetType: 'patient', targetId: patientId }
    );
    const { rows } = await pool.query(
      `SELECT impersonated_by FROM public.audit_log
       WHERE actor_id = $1 AND impersonated_by IS NOT NULL`,
      [actorId]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].impersonated_by).toBe(patientId);
  });

  it('refuses metadata that could carry credentials or clinical content', async () => {
    // Guards the one thing that would make this table a liability instead of
    // an asset. Throws outside production so a careless call site fails loudly.
    await expect(
      writeAudit(fakeReq(), {
        action: AuditAction.LOGIN_SUCCESS,
        metadata: { password: 'hunter2' },
      })
    ).rejects.toThrow(/must not contain/);

    await expect(
      writeAudit(fakeReq(), {
        action: AuditAction.PATIENT_RECORD_VIEWED,
        metadata: { diagnosis: 'something clinical' },
      })
    ).rejects.toThrow(/must not contain/);
  });

  it('never lets an audit failure break the calling request', async () => {
    // A bad foreign key is the realistic version of "the write fails". The
    // caller must still see it resolve — a patient should not be unable to
    // read their own record because the log rejected a row.
    await expect(
      writeAudit(fakeReq(), {
        action: AuditAction.PATIENT_RECORD_VIEWED,
        actorId: 2147483000, // no such user
        targetType: 'patient',
      })
    ).resolves.toBeUndefined();
  });
});
