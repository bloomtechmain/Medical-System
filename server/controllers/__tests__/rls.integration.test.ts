// Integration test against a REAL Postgres database (not mocked) — proves the
// row-level security policies on clinical.* actually filter rows for the
// queryAs() code path, per the database audit (03-database.md, DB-02):
// "Add a test that proves a doctor without consent gets zero rows."
//
// Requires DATABASE_URL to point at a database that has run
// server/migrations/001_initial_schema.sql (CI does this — see
// .github/workflows/ci.yml). Skipped entirely when DATABASE_URL is unset, so
// `npm test` locally (no DB) is unaffected.
import { pool, queryAs } from '../../config/db';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('clinical schema RLS (patient_profiles)', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = { role: 'admin' };
  let patientId: number;
  let doctorWithConsentId: number;
  let doctorWithoutConsentId: number;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role) VALUES
         ('RLS Test Patient', $1, 'x', 'patient'),
         ('RLS Test Doctor With Consent', $2, 'x', 'doctor'),
         ('RLS Test Doctor Without Consent', $3, 'x', 'doctor')
       RETURNING id`,
      [`rls-patient-${suffix}@test.local`, `rls-doctor-consent-${suffix}@test.local`, `rls-doctor-noconsent-${suffix}@test.local`]
    );
    [patientId, doctorWithConsentId, doctorWithoutConsentId] = rows.map(r => r.id);

    await queryAs(admin,
      'INSERT INTO clinical.patient_profiles (user_id, blood_type) VALUES ($1, $2)',
      [patientId, 'O+']
    );
    await queryAs(admin,
      `INSERT INTO clinical.data_access_requests (doctor_id, patient_id, access_type, status)
       VALUES ($1, $2, 'medical_history', 'accepted')`,
      [doctorWithConsentId, patientId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.users WHERE id = ANY($1::int[])',
      [[patientId, doctorWithConsentId, doctorWithoutConsentId]]);
    await pool.end();
  });

  it('returns zero rows for a doctor with no accepted access request', async () => {
    const { rows } = await queryAs(
      { id: doctorWithoutConsentId, role: 'doctor' },
      'SELECT * FROM clinical.patient_profiles WHERE user_id = $1',
      [patientId]
    );
    expect(rows).toHaveLength(0);
  });

  it('returns the row for a doctor with an accepted access request', async () => {
    const { rows } = await queryAs(
      { id: doctorWithConsentId, role: 'doctor' },
      'SELECT * FROM clinical.patient_profiles WHERE user_id = $1',
      [patientId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(patientId);
  });

  it('returns the row for the patient themselves', async () => {
    const { rows } = await queryAs(
      { id: patientId, role: 'patient' },
      'SELECT * FROM clinical.patient_profiles WHERE user_id = $1',
      [patientId]
    );
    expect(rows).toHaveLength(1);
  });

  it('returns zero rows for a plain pool.query with no actor context set (RLS default-deny)', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM clinical.patient_profiles WHERE user_id = $1',
      [patientId]
    );
    expect(rows).toHaveLength(0);
  });
});
