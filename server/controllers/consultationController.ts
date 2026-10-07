import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { extractMedicines } from '../utils/ocrParser';
import { sendNotification } from '../utils/notify';
import { generateStoredFilename, persistUploadedFile, deleteStoredFile } from '../config/fileStorage';

const PRESCRIPTIONS_DIR = 'prescriptions';

// medical_consultations / consultation_medicines / patient_profiles live in
// the `clinical` schema and are gated by row-level security — every query
// against them must run with the acting user's identity set via queryAs()
// (or, inside an already-open transaction, a SELECT set_config(...) call
// right after BEGIN). See config/db.ts for why.
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });
const setRLSContext = (client: { query: (t: string, v?: unknown[]) => Promise<unknown> }, a: RLSActor) =>
  client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`,
    [a.id != null ? String(a.id) : '', a.role || '']
  );

const runOCR = async (input: string | Buffer): Promise<string> => {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    const { data: { text } } = await worker.recognize(input as any);
    await worker.terminate();
    return text || '';
  } catch (err) {
    console.error('OCR error:', (err as Error).message);
    return '';
  }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const {
      visit_date, doctor_name, hospital_clinic,
      sick_description, diagnosis, treatment_description,
      manual_medicines, patient_id,
      lab_tests_requested, assigned_laboratory_id,
    } = req.body;

    const isDoctor  = req.user.role === 'doctor';
    const patientId = isDoctor ? patient_id : req.user.id;
    const doctorId  = isDoctor ? req.user.id : null;

    if (!patientId) { res.status(400).json({ message: 'Patient is required' }); return; }

    let prescriptionFile: string | null = null;
    let ocrText = '', ocrMedicines: ReturnType<typeof extractMedicines> = [];
    if (req.file) {
      prescriptionFile = generateStoredFilename('rx', req.user.id, req.file.originalname);
      await persistUploadedFile(PRESCRIPTIONS_DIR, prescriptionFile, req.file.buffer, req.file.mimetype);
      ocrText      = await runOCR(req.file.buffer);
      ocrMedicines = extractMedicines(ocrText);
    }

    await client.query('BEGIN');
    await setRLSContext(client, actor(req));

    const labId = isDoctor ? (assigned_laboratory_id || null) : null;

    const { rows: [consultation] } = await client.query(`
      INSERT INTO medical_consultations
        (patient_id, doctor_id,
         visit_date, doctor_name, hospital_clinic,
         sick_description, diagnosis, treatment_description,
         prescription_file, ocr_text, lab_tests_requested, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
      RETURNING *
    `, [
      patientId,
      doctorId,
      visit_date,
      doctor_name           || null,
      hospital_clinic       || null,
      sick_description      || null,
      diagnosis             || null,
      treatment_description || null,
      prescriptionFile,
      ocrText || null,
      lab_tests_requested || null,
    ]);

    let manualMeds: any[] = [];
    try { manualMeds = manual_medicines ? JSON.parse(manual_medicines) : []; } catch {}

    const allMedicines = [
      ...ocrMedicines,
      ...manualMeds.filter((m: any) => m.medicine_name?.trim()).map((m: any) => ({ ...m, source: 'manual' })),
    ];

    for (const med of allMedicines) {
      await client.query(`
        INSERT INTO consultation_medicines
          (consultation_id, medicine_name, dosage, frequency, duration, notes, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        consultation.id,
        med.medicine_name.trim(),
        med.dosage    || null,
        med.frequency || null,
        med.duration  || null,
        med.notes     || null,
        med.source    || 'manual',
      ]);
    }

    // If doctor assigned a lab and provided test details, create lab_request immediately
    let directLabRequest: any = null;
    if (isDoctor && labId && lab_tests_requested) {
      const { rows: [lr] } = await client.query(`
        INSERT INTO lab_requests
          (doctor_id, patient_id, laboratory_id, consultation_id, test_description)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
      `, [doctorId, patientId, labId, consultation.id, lab_tests_requested]);
      directLabRequest = lr;
    }

    await client.query('COMMIT');

    // ── Notifications ─────────────────────────────────────────────
    if (isDoctor) {
      const [drRow, ptRow] = await Promise.all([
        pool.query('SELECT name FROM users WHERE id=$1', [doctorId]),
        pool.query('SELECT name FROM users WHERE id=$1', [patientId]),
      ]);
      const drName = drRow.rows[0]?.name || 'Your doctor';
      const ptName = ptRow.rows[0]?.name || 'A patient';

      let labNote = '';
      if (directLabRequest) {
        const { rows: [labRow] } = await pool.query(
          `SELECT COALESCE(lp.lab_name, u.name) AS lab_name
           FROM users u LEFT JOIN laboratory_profiles lp ON lp.user_id = u.id
           WHERE u.id = $1`, [labId]
        );
        const lName = labRow?.lab_name || 'a laboratory';
        labNote = ` Lab tests have been sent directly to ${lName}.`;
      } else if (lab_tests_requested) {
        labNote = ' Lab tests have been requested — please send them to a laboratory from your consultations page.';
      }

      await sendNotification(
        patientId,
        'new_consultation',
        'New Consultation Added',
        `Dr. ${drName} has created a consultation for you on ${new Date(visit_date).toDateString()}.${labNote}`,
        { consultation_id: consultation.id }
      );

      if (directLabRequest) {
        await sendNotification(
          labId!,
          'lab_request_created',
          'New Lab Request',
          `Dr. ${drName} has sent a lab request for patient ${ptName}. Please process the tests.`,
          { lab_request_id: directLabRequest.id, consultation_id: consultation.id }
        );
      }
    }

    const { rows: medicines } = await queryAs(actor(req),
      'SELECT * FROM consultation_medicines WHERE consultation_id=$1 ORDER BY source DESC, id',
      [consultation.id]
    );

    res.status(201).json({ ...consultation, medicines, ocr_medicines_found: ocrMedicines.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    let query: string, params: unknown[];

    // Correlated subquery (not a JOIN) so it never fans out against the medicines
    // JSON_AGG above it — a consultation with 3 medicines and 2 pharmacy
    // assignments would otherwise multiply into 6 rows before aggregation.
    const pharmacyAssignmentsSelect = `
      COALESCE(
        (SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'id', pa.id, 'pharmacist_id', pa.pharmacist_id,
           'pharmacy_name', COALESCE(pp2.pharmacy_name, phu.name),
           'status', pa.status, 'created_at', pa.created_at
         ) ORDER BY pa.created_at)
         FROM prescription_assignments pa
         JOIN users phu ON phu.id = pa.pharmacist_id
         LEFT JOIN pharmacist_profiles pp2 ON pp2.user_id = pa.pharmacist_id
         WHERE pa.consultation_id = c.id),
        '[]'
      ) AS pharmacy_assignments`;

    if (role === 'patient') {
      query  = `SELECT c.*,
                  COALESCE(
                    JSON_AGG(
                      JSON_BUILD_OBJECT(
                        'id',            m.id,
                        'medicine_name', m.medicine_name,
                        'dosage',        m.dosage,
                        'frequency',     m.frequency,
                        'duration',      m.duration,
                        'notes',         m.notes,
                        'source',        m.source
                      ) ORDER BY m.id
                    ) FILTER (WHERE m.id IS NOT NULL),
                    '[]'
                  ) AS medicines,
                  COUNT(m.id)::int AS medicine_count,
                  u.name  AS doctor_display_name,
                  ${pharmacyAssignmentsSelect}
                FROM medical_consultations c
                LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
                LEFT JOIN users u   ON u.id  = c.doctor_id
                WHERE c.patient_id = $1
                GROUP BY c.id, u.name
                ORDER BY c.visit_date DESC, c.created_at DESC`;
      params = [id];
    } else if (role === 'doctor') {
      query  = `SELECT c.*,
                  COUNT(m.id)::int AS medicine_count,
                  pt.name AS patient_name, pt.email AS patient_email,
                  ${pharmacyAssignmentsSelect}
                FROM medical_consultations c
                LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
                LEFT JOIN users pt ON pt.id = c.patient_id
                WHERE c.doctor_id = $1
                GROUP BY c.id, pt.name, pt.email
                ORDER BY c.visit_date DESC, c.created_at DESC`;
      params = [id];
    } else {
      res.json([]); return;
    }

    const { rows } = await queryAs(actor(req), query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    const condition = role === 'patient' ? 'c.patient_id = $2' : 'c.doctor_id = $2';

    const { rows } = await queryAs(actor(req), `
      SELECT c.*,
        pt.name AS patient_name, pt.email AS patient_email,
        u.name  AS doctor_display_name,
        pat.phone AS patient_phone, pat.blood_type, pat.allergies,
        COALESCE(
          (SELECT JSON_AGG(JSON_BUILD_OBJECT(
             'id', pa.id, 'pharmacist_id', pa.pharmacist_id,
             'pharmacy_name', COALESCE(pp.pharmacy_name, phu.name),
             'status', pa.status, 'created_at', pa.created_at
           ) ORDER BY pa.created_at)
           FROM prescription_assignments pa
           JOIN users phu ON phu.id = pa.pharmacist_id
           LEFT JOIN pharmacist_profiles pp ON pp.user_id = pa.pharmacist_id
           WHERE pa.consultation_id = c.id),
          '[]'
        ) AS pharmacy_assignments
      FROM medical_consultations c
      LEFT JOIN users pt  ON pt.id  = c.patient_id
      LEFT JOIN users u   ON u.id   = c.doctor_id
      LEFT JOIN patient_profiles pat ON pat.user_id = c.patient_id
      WHERE c.id = $1 AND ${condition}
    `, [req.params.id, id]);

    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const { rows: medicines } = await queryAs(actor(req),
      'SELECT * FROM consultation_medicines WHERE consultation_id=$1 ORDER BY source DESC, id',
      [req.params.id]
    );

    res.json({ ...rows[0], medicines });
  } catch (err) { next(err); }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows: existing } = await queryAs(actor(req),
      'SELECT * FROM medical_consultations WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!existing.length) { res.status(404).json({ message: 'Consultation not found or not authorised' }); return; }

    const prev = existing[0];
    const {
      visit_date, hospital_clinic, sick_description,
      diagnosis, treatment_description,
      manual_medicines,
    } = req.body;

    let prescriptionFile = prev.prescription_file;
    let ocrText          = prev.ocr_text;
    let ocrMedicines: ReturnType<typeof extractMedicines> = [];

    if (req.file) {
      if (prev.prescription_file) {
        await deleteStoredFile(PRESCRIPTIONS_DIR, prev.prescription_file);
      }
      prescriptionFile = generateStoredFilename('rx', req.user.id, req.file.originalname);
      await persistUploadedFile(PRESCRIPTIONS_DIR, prescriptionFile, req.file.buffer, req.file.mimetype);
      ocrText          = await runOCR(req.file.buffer);
      ocrMedicines     = extractMedicines(ocrText);
    }

    await client.query('BEGIN');
    await setRLSContext(client, actor(req));

    const { rows: [consultation] } = await client.query(`
      UPDATE medical_consultations SET
        visit_date=$1, hospital_clinic=$2,
        sick_description=$3, diagnosis=$4, treatment_description=$5,
        prescription_file=$6, ocr_text=$7,
        updated_at=NOW()
      WHERE id=$8
      RETURNING *
    `, [
      visit_date,
      hospital_clinic          || null,
      sick_description         || null,
      diagnosis                || null,
      treatment_description    || null,
      prescriptionFile,
      ocrText                  || null,
      req.params.id,
    ]);

    await client.query('DELETE FROM consultation_medicines WHERE consultation_id=$1', [req.params.id]);

    let manualMeds: any[] = [];
    try { manualMeds = manual_medicines ? JSON.parse(manual_medicines) : []; } catch {}

    const allMedicines = [
      ...ocrMedicines,
      ...manualMeds.filter((m: any) => m.medicine_name?.trim()).map((m: any) => ({ ...m, source: 'manual' })),
    ];

    for (const med of allMedicines) {
      await client.query(`
        INSERT INTO consultation_medicines
          (consultation_id, medicine_name, dosage, frequency, duration, notes, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        req.params.id,
        med.medicine_name.trim(),
        med.dosage    || null,
        med.frequency || null,
        med.duration  || null,
        med.notes     || null,
        med.source    || 'manual',
      ]);
    }

    await client.query('COMMIT');

    const { rows: medicines } = await queryAs(actor(req),
      'SELECT * FROM consultation_medicines WHERE consultation_id=$1 ORDER BY source DESC, id',
      [req.params.id]
    );

    res.json({ ...consultation, medicines, ocr_medicines_found: ocrMedicines.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const getPatientHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId;

    const { rows: patRows } = await queryAs(actor(req), `
      SELECT u.id, u.name, u.email, u.created_at,
             p.phone, p.date_of_birth, p.gender,
             p.blood_type, p.allergies, p.chronic_conditions,
             p.emergency_contact_name, p.emergency_contact_phone,
             p.address, p.insurance_provider, p.insurance_policy_number
      FROM users u
      LEFT JOIN patient_profiles p ON p.user_id = u.id
      WHERE u.id = $1 AND u.role = 'patient'
    `, [patientId]);

    if (!patRows.length) { res.status(404).json({ message: 'Patient not found' }); return; }

    // SEC-17 #6: this WHERE clause is the actual enforcement, not a backstop
    // — the app connects to Postgres as a superuser (confirmed: rolbypassrls
    // = true), so clinical.medical_consultations' RLS policy is silently
    // bypassed and filters nothing in practice (see the database-security
    // guideline's DB-02 finding). A non-admin doctor only ever sees
    // consultations where they're literally the treating doctor.
    const isAdmin = req.user.role === 'admin';
    const { rows: consultations } = await queryAs(actor(req), `
      SELECT c.*,
        u.name  AS doctor_display_name,
        dp.specialization AS doctor_specialization,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',            m.id,
              'medicine_name', m.medicine_name,
              'dosage',        m.dosage,
              'frequency',     m.frequency,
              'duration',      m.duration,
              'source',        m.source
            ) ORDER BY m.id
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'
        ) AS medicines,
        COALESCE(
          (SELECT JSON_AGG(JSON_BUILD_OBJECT(
             'id', pa.id, 'pharmacist_id', pa.pharmacist_id,
             'pharmacy_name', COALESCE(pp.pharmacy_name, phu.name),
             'status', pa.status, 'created_at', pa.created_at
           ) ORDER BY pa.created_at)
           FROM prescription_assignments pa
           JOIN users phu ON phu.id = pa.pharmacist_id
           LEFT JOIN pharmacist_profiles pp ON pp.user_id = pa.pharmacist_id
           WHERE pa.consultation_id = c.id),
          '[]'
        ) AS pharmacy_assignments
      FROM medical_consultations c
      LEFT JOIN users u            ON u.id  = c.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = c.doctor_id
      LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
      WHERE c.patient_id = $1 ${isAdmin ? '' : 'AND c.doctor_id = $2'}
      GROUP BY c.id, u.name, dp.specialization
      ORDER BY c.visit_date DESC, c.created_at DESC
    `, isAdmin ? [patientId] : [patientId, req.user.id]);

    // An empty result now means "this doctor has never treated this
    // patient" (the WHERE clause above enforces that directly), so the
    // patient's name/email/demographics fetched earlier shouldn't be
    // returned either — previously they were, unconditionally, regardless
    // of any relationship. Same 404 message as "patient not found" so the
    // two cases aren't distinguishable from the outside (no enumeration
    // signal).
    if (!isAdmin && consultations.length === 0) {
      res.status(404).json({ message: 'Patient not found' });
      return;
    }

    const allMedicines  = consultations.flatMap((c: any) => c.medicines || []);
    const uniqueMeds    = [...new Set(allMedicines.map((m: any) => m.medicine_name.toLowerCase()))];
    const uniqueDoctors = [...new Set(consultations.map((c: any) => c.doctor_display_name).filter(Boolean))];
    const diagnoses     = consultations.map((c: any) => c.diagnosis).filter(Boolean);

    res.json({
      patient: patRows[0],
      consultations,
      stats: {
        total_visits:    consultations.length,
        total_medicines: uniqueMeds.length,
        total_doctors:   uniqueDoctors.length,
        total_diagnoses: diagnoses.length,
      },
    });
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, role } = req.user;
    const condition = role === 'doctor' ? 'doctor_id=$2' : 'patient_id=$2 AND doctor_id IS NULL';
    const { rows } = await queryAs(actor(req),
      `SELECT prescription_file FROM medical_consultations WHERE id=$1 AND ${condition}`,
      [req.params.id, id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    if (rows[0].prescription_file) {
      await deleteStoredFile(PRESCRIPTIONS_DIR, rows[0].prescription_file);
    }

    await queryAs(actor(req), 'DELETE FROM medical_consultations WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

const updateByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows: existing } = await queryAs(actor(req),
      'SELECT * FROM medical_consultations WHERE id=$1 AND patient_id=$2 AND doctor_id IS NULL',
      [req.params.id, req.user.id]
    );
    if (!existing.length) {
      res.status(404).json({ message: 'Consultation not found or cannot be edited' }); return;
    }

    const {
      visit_date, doctor_name, hospital_clinic,
      sick_description, diagnosis, treatment_description, medicines,
    } = req.body;

    await client.query('BEGIN');
    await setRLSContext(client, actor(req));

    const { rows: [consultation] } = await client.query(`
      UPDATE medical_consultations SET
        visit_date=$1, doctor_name=$2, hospital_clinic=$3,
        sick_description=$4, diagnosis=$5, treatment_description=$6,
        updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [
      visit_date,
      doctor_name           || null,
      hospital_clinic       || null,
      sick_description      || null,
      diagnosis             || null,
      treatment_description || null,
      req.params.id,
    ]);

    await client.query('DELETE FROM consultation_medicines WHERE consultation_id=$1', [req.params.id]);

    const medList = Array.isArray(medicines) ? medicines : [];
    for (const med of medList.filter((m: any) => m.medicine_name?.trim())) {
      await client.query(`
        INSERT INTO consultation_medicines
          (consultation_id, medicine_name, dosage, frequency, duration, notes, source)
        VALUES ($1,$2,$3,$4,$5,$6,'manual')
      `, [
        req.params.id,
        med.medicine_name.trim(),
        med.dosage    || null,
        med.frequency || null,
        med.duration  || null,
        med.notes     || null,
      ]);
    }

    await client.query('COMMIT');

    const { rows: updatedMeds } = await queryAs(actor(req),
      'SELECT * FROM consultation_medicines WHERE consultation_id=$1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...consultation, medicines: updatedMeds });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export { create, update, updateByPatient, getAll, getOne, getPatientHistory, remove };
