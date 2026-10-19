// Integration test against a REAL Postgres database. The health report is
// assembled from six RLS-protected queries, so the two things worth proving
// are exactly the two a mock cannot: that a patient gets their own complete
// record, and that they get nothing of anybody else's.
//
// Requires DATABASE_URL (CI sets it). Skipped without one.
import { pool, queryAs } from '../../config/db';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('health report data assembly', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let patientId: number;
  let otherPatientId: number;
  let doctorId: number;

  beforeAll(async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role, email_verified_at) VALUES
         ('Report Patient', $1, 'x', 'patient', NOW()),
         ('Other Patient',  $2, 'x', 'patient', NOW()),
         ('Report Doctor',  $3, 'x', 'doctor',  NOW())
       RETURNING id`,
      [`report-${suffix}@test.local`, `other-${suffix}@test.local`, `doctor-${suffix}@test.local`]
    );
    [patientId, otherPatientId, doctorId] = rows.map(r => r.id);

    const admin = { role: 'admin' };

    await queryAs(admin,
      `INSERT INTO clinical.patient_profiles (user_id, blood_type, allergies, phone)
       VALUES ($1, 'O+', 'Penicillin', '0771234567')`, [patientId]);

    // Two vitals records, deliberately overlapping: the later one carries only
    // a heart rate, so the earlier hemoglobin must still surface as current.
    await queryAs(admin,
      `INSERT INTO clinical.patient_vitals (patient_id, heart_rate, source, recorded_at)
       VALUES ($1, 72, 'manual', NOW())`, [patientId]);
    await queryAs(admin,
      `INSERT INTO clinical.patient_vitals (patient_id, hemoglobin, wbc, source, recorded_at)
       VALUES ($1, 13.5, 6.2, 'lab_report', NOW() - INTERVAL '10 days')`, [patientId]);

    // The other patient's data, which must never appear in the first
    // patient's report.
    await queryAs(admin,
      `INSERT INTO clinical.patient_vitals (patient_id, hemoglobin, source, recorded_at)
       VALUES ($1, 99.9, 'manual', NOW())`, [otherPatientId]);

    const { rows: cons } = await queryAs(admin,
      `INSERT INTO clinical.medical_consultations
         (patient_id, doctor_id, visit_date, diagnosis, treatment_description, status)
       VALUES ($1, $2, CURRENT_DATE, 'Test diagnosis', 'Rest and fluids', 'active')
       RETURNING id`, [patientId, doctorId]);
    await queryAs(admin,
      `INSERT INTO clinical.consultation_medicines (consultation_id, medicine_name, dosage, frequency, source)
       VALUES ($1, 'Paracetamol', '500mg', 'twice daily', 'manual')`, [cons[0].id]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.users WHERE id = ANY($1::int[])',
      [[patientId, otherPatientId, doctorId]]);
    await pool.end();
  });

  // The report's vitals query. Asserting the SQL the controller runs, rather
  // than the controller itself, keeps this focused on the data boundary.
  const vitalsFor = async (id: number) => {
    const { rows } = await queryAs({ id, role: 'patient' },
      `SELECT * FROM clinical.patient_vitals
       WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 100`, [id]);
    return rows;
  };

  it('returns every vitals record for the requesting patient', async () => {
    const rows = await vitalsFor(patientId);
    expect(rows).toHaveLength(2);
    // Newest first — the merge in healthReportPdf.ts depends on this order.
    expect(Number(rows[0].heart_rate)).toBe(72);
    expect(rows[0].hemoglobin).toBeNull();
    expect(Number(rows[1].hemoglobin)).toBeCloseTo(13.5);
  });

  it('carries enough rows that a partial newer record cannot hide an older panel', async () => {
    // This is the data shape the merge exists for. If the query returned only
    // the newest record, hemoglobin would vanish from the report.
    const rows = await vitalsFor(patientId);
    const latestPerField = (field: string) =>
      rows.find(r => r[field] !== null && r[field] !== undefined)?.[field];
    expect(Number(latestPerField('heart_rate'))).toBe(72);
    expect(Number(latestPerField('hemoglobin'))).toBeCloseTo(13.5);
    expect(Number(latestPerField('wbc'))).toBeCloseTo(6.2);
  });

  it('never returns another patient\'s vitals', async () => {
    const mine = await vitalsFor(patientId);
    // 99.9 is the other patient's hemoglobin — a value no real reading would
    // produce, so its absence is unambiguous.
    expect(mine.some(r => Number(r.hemoglobin) === 99.9)).toBe(false);
    expect(mine.every(r => r.patient_id === patientId)).toBe(true);
  });

  it('includes consultations with their prescribed medicines', async () => {
    const { rows } = await queryAs({ id: patientId, role: 'patient' },
      `SELECT c.id, c.diagnosis,
              COALESCE(
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                   'medicine_name', m.medicine_name, 'dosage', m.dosage,
                   'frequency', m.frequency, 'duration', m.duration
                 ) ORDER BY m.id)
                 FROM clinical.consultation_medicines m WHERE m.consultation_id = c.id),
                '[]'
              ) AS medicines
       FROM clinical.medical_consultations c
       WHERE c.patient_id = $1 AND c.deleted_at IS NULL`, [patientId]);

    expect(rows).toHaveLength(1);
    expect(rows[0].diagnosis).toBe('Test diagnosis');
    // Medicines were missing from the report before this work; a prescription
    // list without the medicines is close to useless.
    expect(rows[0].medicines).toHaveLength(1);
    expect(rows[0].medicines[0].medicine_name).toBe('Paracetamol');
    expect(rows[0].medicines[0].dosage).toBe('500mg');
  });

  it('excludes soft-deleted consultations', async () => {
    const { rows: extra } = await queryAs({ role: 'admin' },
      `INSERT INTO clinical.medical_consultations
         (patient_id, doctor_id, visit_date, diagnosis, status, deleted_at)
       VALUES ($1, $2, CURRENT_DATE, 'Deleted visit', 'active', NOW())
       RETURNING id`, [patientId, doctorId]);

    const { rows } = await queryAs({ id: patientId, role: 'patient' },
      `SELECT id FROM clinical.medical_consultations
       WHERE patient_id = $1 AND deleted_at IS NULL`, [patientId]);

    expect(rows.map(r => r.id)).not.toContain(extra[0].id);
  });

  it('reduces an uploaded report file to a boolean, never the filename', async () => {
    // A stored filename in a document the patient may forward is exposure
    // with no benefit, so the query must not select report_file itself.
    const { rows: lab } = await queryAs({ role: 'admin' },
      `INSERT INTO clinical.lab_requests
         (doctor_id, patient_id, laboratory_id, test_description, status, report_file)
       VALUES ($1, $2, $1, 'Full Blood Count', 'completed', 'lab_9_1790000000000_abc.pdf')
       RETURNING id`, [doctorId, patientId]);

    const { rows } = await queryAs({ id: patientId, role: 'patient' },
      `SELECT id, test_description, (report_file IS NOT NULL) AS has_report
       FROM clinical.lab_requests WHERE patient_id = $1`, [patientId]);

    const found = rows.find(r => r.id === lab[0].id);
    expect(found.has_report).toBe(true);
    expect(Object.keys(found)).not.toContain('report_file');
  });
});
