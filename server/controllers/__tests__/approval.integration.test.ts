// Integration test against a REAL Postgres database.
//
// SEC-17 #2 made professional sign-ups inactive pending review, but nothing
// listed them and `is_active = false` could not say why an account was off.
// Migration 012's approved_at is the discriminator, and these cover the three
// states it creates plus the queue query the admin UI runs.
import { pool } from '../../config/db';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('account approval states', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let pendingDoctorId: number;
  let deactivatedDoctorId: number;
  let activeDoctorId: number;
  let pendingPatientId: number;
  let adminId: number;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role, is_active, approved_at, email_verified_at) VALUES
         -- waiting for approval: inactive, never approved
         ('Pending Doctor',     $1, 'x', 'doctor',  FALSE, NULL,  NULL),
         -- deactivated: inactive, but WAS approved once
         ('Deactivated Doctor', $2, 'x', 'doctor',  FALSE, NOW(), NOW()),
         ('Active Doctor',      $3, 'x', 'doctor',  TRUE,  NOW(), NOW()),
         -- a patient is never subject to approval, so an inactive one was
         -- deactivated and must not appear in the queue
         ('Pending Patient',    $4, 'x', 'patient', FALSE, NULL,  NULL),
         ('Approving Admin',    $5, 'x', 'admin',   TRUE,  NOW(), NOW())
       RETURNING id`,
      [`pend-${suffix}@test.local`, `deact-${suffix}@test.local`, `active-${suffix}@test.local`,
       `patient-${suffix}@test.local`, `admin-${suffix}@test.local`]
    );
    [pendingDoctorId, deactivatedDoctorId, activeDoctorId, pendingPatientId, adminId] = rows.map(r => r.id);

    await pool.query(
      `INSERT INTO public.doctor_profiles (user_id, specialization, license_number)
       VALUES ($1, 'Cardiology', 'SLMC-TEST-1')`, [pendingDoctorId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.users WHERE id = ANY($1::int[])',
      [[pendingDoctorId, deactivatedDoctorId, activeDoctorId, pendingPatientId, adminId]]);
    await pool.end();
  });

  // The exact predicate listPendingApprovals uses.
  const queue = async () => {
    const { rows } = await pool.query(
      `SELECT u.id, u.role, dp.license_number
         FROM public.users u
         LEFT JOIN public.doctor_profiles dp ON dp.user_id = u.id
        WHERE u.is_active = FALSE AND u.approved_at IS NULL
          AND u.deleted_at IS NULL AND u.role <> 'patient'
        ORDER BY u.created_at ASC`);
    return rows;
  };

  it('lists an unapproved professional in the queue, with their licence', async () => {
    const rows = await queue();
    const found = rows.find(r => r.id === pendingDoctorId);
    expect(found).toBeDefined();
    // The licence is the one claim nothing verifies automatically, so it has
    // to reach the admin making the decision.
    expect(found.license_number).toBe('SLMC-TEST-1');
  });

  it('does NOT list an account that was approved and later deactivated', async () => {
    // The bug this column exists to fix: before approved_at, this account was
    // indistinguishable from a new registration.
    const rows = await queue();
    expect(rows.map(r => r.id)).not.toContain(deactivatedDoctorId);
  });

  it('does not list an active account', async () => {
    const rows = await queue();
    expect(rows.map(r => r.id)).not.toContain(activeDoctorId);
  });

  it('does not list patients, who are never subject to approval', async () => {
    const rows = await queue();
    expect(rows.map(r => r.id)).not.toContain(pendingPatientId);
  });

  it('distinguishes waiting-for-approval from deactivated, which login depends on', async () => {
    const { rows } = await pool.query(
      'SELECT id, is_active, approved_at FROM public.users WHERE id = ANY($1::int[])',
      [[pendingDoctorId, deactivatedDoctorId]]
    );
    const pending = rows.find(r => r.id === pendingDoctorId);
    const deact = rows.find(r => r.id === deactivatedDoctorId);

    // These two booleans are what produce two different login messages.
    expect(pending.is_active).toBe(false);
    expect(pending.approved_at).toBeNull();
    expect(deact.is_active).toBe(false);
    expect(deact.approved_at).not.toBeNull();
  });

  it('approves only an account that is actually pending, and records who did it', async () => {
    const approve = (id: number) => pool.query(
      `UPDATE public.users
          SET is_active = TRUE, approved_at = NOW(), approved_by = $1
        WHERE id = $2 AND approved_at IS NULL AND deleted_at IS NULL
        RETURNING id, is_active, approved_by`,
      [adminId, id]
    );

    const first = await approve(pendingDoctorId);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].is_active).toBe(true);
    expect(first.rows[0].approved_by).toBe(adminId);

    // Guarded on approved_at IS NULL, so a double-click cannot re-approve and
    // re-send the confirmation email.
    const second = await approve(pendingDoctorId);
    expect(second.rows).toHaveLength(0);

    // And it must refuse to "approve" an account that was deactivated — that
    // is a reactivation decision, not an approval, and goes through the
    // existing toggle.
    const onDeactivated = await approve(deactivatedDoctorId);
    expect(onDeactivated.rows).toHaveLength(0);
  });

  it('keeps a declined registration as a soft delete, not a hard one', async () => {
    const { rows: fresh } = await pool.query(
      `INSERT INTO public.users (name, email, password, role, is_active)
       VALUES ('Decline Me', $1, 'x', 'doctor', FALSE) RETURNING id`,
      [`decline-${suffix}@test.local`]
    );
    const id = fresh[0].id;

    const { rows: declined } = await pool.query(
      `UPDATE public.users SET deleted_at = NOW(), is_active = FALSE
        WHERE id = $1 AND approved_at IS NULL AND deleted_at IS NULL
        RETURNING id`, [id]);
    expect(declined).toHaveLength(1);

    // The row survives — somebody applied, and that is a record worth keeping
    // under the same retention rules as any other user (PRO-25).
    const { rows: still } = await pool.query('SELECT deleted_at, approved_at FROM public.users WHERE id = $1', [id]);
    expect(still).toHaveLength(1);
    expect(still[0].deleted_at).not.toBeNull();
    // approved_at stays NULL so a declined account can never be mistaken for
    // an approved-then-deactivated one.
    expect(still[0].approved_at).toBeNull();

    // And it leaves the queue.
    const rows = await queue();
    expect(rows.map(r => r.id)).not.toContain(id);

    await pool.query('DELETE FROM public.users WHERE id = $1', [id]);
  });
});
