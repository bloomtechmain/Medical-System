import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { extractMedicines } from '../utils/ocrParser';
import { sendNotification } from '../utils/notify';

const runOCR = async (filePath: string): Promise<string> => {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    const { data: { text } } = await worker.recognize(filePath);
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
      manual_medicines, patient_id, assigned_pharmacist_id,
      lab_tests_requested,
    } = req.body;

    const isDoctor  = req.user.role === 'doctor';
    const patientId = isDoctor ? patient_id : req.user.id;
    const doctorId  = isDoctor ? req.user.id : null;

    if (!patientId) { res.status(400).json({ message: 'Patient is required' }); return; }

    const prescriptionFile = req.file ? req.file.filename : null;
    const prescriptionPath = req.file ? req.file.path : null;

    let ocrText = '', ocrMedicines: ReturnType<typeof extractMedicines> = [];
    if (prescriptionPath) {
      ocrText      = await runOCR(prescriptionPath);
      ocrMedicines = extractMedicines(ocrText);
    }

    await client.query('BEGIN');

    const { rows: [consultation] } = await client.query(`
      INSERT INTO medical_consultations
        (patient_id, doctor_id, assigned_pharmacist_id,
         visit_date, doctor_name, hospital_clinic,
         sick_description, diagnosis, treatment_description,
         prescription_file, ocr_text, lab_tests_requested, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
      RETURNING *
    `, [
      patientId,
      doctorId,
      assigned_pharmacist_id || null,
      visit_date,
      doctor_name   || null,
      hospital_clinic || null,
      sick_description || null,
      diagnosis     || null,
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

    await client.query('COMMIT');

    // ── Notifications ─────────────────────────────────────────────
    if (isDoctor) {
      const [drRow, ptRow] = await Promise.all([
        pool.query('SELECT name FROM users WHERE id=$1', [doctorId]),
        pool.query('SELECT name FROM users WHERE id=$1', [patientId]),
      ]);
      const drName = drRow.rows[0]?.name || 'Your doctor';
      const ptName = ptRow.rows[0]?.name || 'A patient';

      const labNote = lab_tests_requested ? ' Lab tests have been requested — please send them to a laboratory from your consultations page.' : '';
      await sendNotification(
        patientId,
        'new_consultation',
        'New Consultation Added',
        `Dr. ${drName} has created a consultation for you on ${new Date(visit_date).toDateString()}.${labNote}`,
        { consultation_id: consultation.id }
      );

      if (assigned_pharmacist_id) {
        await sendNotification(
          assigned_pharmacist_id,
          'consultation_assigned',
          'New Prescription Assigned',
          `Dr. ${drName} has assigned a prescription for patient ${ptName}. Please dispense the medicines.`,
          { consultation_id: consultation.id }
        );
      }
    }

    const { rows: medicines } = await pool.query(
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
                  u.name AS doctor_display_name,
                  ph.name AS pharmacist_name,
                  pp.pharmacy_name
                FROM medical_consultations c
                LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
                LEFT JOIN users u  ON u.id  = c.doctor_id
                LEFT JOIN users ph ON ph.id = c.assigned_pharmacist_id
                LEFT JOIN pharmacist_profiles pp ON pp.user_id = c.assigned_pharmacist_id
                WHERE c.patient_id = $1
                GROUP BY c.id, u.name, ph.name, pp.pharmacy_name
                ORDER BY c.visit_date DESC, c.created_at DESC`;
      params = [id];
    } else if (role === 'doctor') {
      query  = `SELECT c.*,
                  COUNT(m.id)::int AS medicine_count,
                  pt.name AS patient_name, pt.email AS patient_email,
                  ph.name AS pharmacist_name,
                  pp.pharmacy_name
                FROM medical_consultations c
                LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
                LEFT JOIN users pt ON pt.id = c.patient_id
                LEFT JOIN users ph ON ph.id = c.assigned_pharmacist_id
                LEFT JOIN pharmacist_profiles pp ON pp.user_id = c.assigned_pharmacist_id
                WHERE c.doctor_id = $1
                GROUP BY c.id, pt.name, pt.email, ph.name, pp.pharmacy_name
                ORDER BY c.visit_date DESC, c.created_at DESC`;
      params = [id];
    } else if (role === 'pharmacist') {
      query  = `SELECT c.*,
                  COUNT(m.id)::int AS medicine_count,
                  pt.name AS patient_name, pt.email AS patient_email,
                  u.name AS doctor_display_name
                FROM medical_consultations c
                LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
                LEFT JOIN users pt ON pt.id = c.patient_id
                LEFT JOIN users u  ON u.id  = c.doctor_id
                WHERE c.assigned_pharmacist_id = $1
                GROUP BY c.id, pt.name, pt.email, u.name
                ORDER BY c.status ASC, c.visit_date DESC`;
      params = [id];
    } else {
      res.json([]); return;
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    let condition: string;
    if (role === 'patient')    condition = 'c.patient_id = $2';
    else if (role === 'doctor')condition = 'c.doctor_id  = $2';
    else                       condition = 'c.assigned_pharmacist_id = $2';

    const { rows } = await pool.query(`
      SELECT c.*,
        pt.name AS patient_name, pt.email AS patient_email,
        u.name  AS doctor_display_name,
        ph.name AS pharmacist_name,
        pp.pharmacy_name, pp.pharmacy_address, pp.phone AS pharmacy_phone,
        pat.phone AS patient_phone, pat.blood_type, pat.allergies
      FROM medical_consultations c
      LEFT JOIN users pt  ON pt.id  = c.patient_id
      LEFT JOIN users u   ON u.id   = c.doctor_id
      LEFT JOIN users ph  ON ph.id  = c.assigned_pharmacist_id
      LEFT JOIN pharmacist_profiles pp  ON pp.user_id  = c.assigned_pharmacist_id
      LEFT JOIN patient_profiles    pat ON pat.user_id = c.patient_id
      WHERE c.id = $1 AND ${condition}
    `, [req.params.id, id]);

    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const { rows: medicines } = await pool.query(
      'SELECT * FROM consultation_medicines WHERE consultation_id=$1 ORDER BY source DESC, id',
      [req.params.id]
    );

    res.json({ ...rows[0], medicines });
  } catch (err) { next(err); }
};

const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE medical_consultations SET status=$1, updated_at=NOW()
       WHERE id=$2 AND assigned_pharmacist_id=$3
       RETURNING *`,
      [status, req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    if (status === 'dispensed') {
      const c = rows[0];

      const phRow = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0];
      const phName = phRow?.name || 'the pharmacy';

      const ptRow = (await pool.query('SELECT name FROM users WHERE id=$1', [c.patient_id])).rows[0];
      const ptName = ptRow?.name || 'the patient';

      await sendNotification(
        c.patient_id,
        'prescription_dispensed',
        'Prescription Dispensed ✅',
        `Your prescription has been dispensed by ${phName}. Please collect your medicines.`,
        { consultation_id: c.id }
      );

      if (c.doctor_id) {
        await sendNotification(
          c.doctor_id,
          'prescription_dispensed',
          'Prescription Dispensed ✅',
          `The prescription for patient ${ptName} has been dispensed by ${phName}.`,
          { consultation_id: c.id }
        );
      }
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows: existing } = await pool.query(
      'SELECT * FROM medical_consultations WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!existing.length) { res.status(404).json({ message: 'Consultation not found or not authorised' }); return; }

    const prev = existing[0];
    const {
      visit_date, hospital_clinic, sick_description,
      diagnosis, treatment_description, assigned_pharmacist_id,
      manual_medicines,
    } = req.body;

    let prescriptionFile = prev.prescription_file;
    let ocrText          = prev.ocr_text;
    let ocrMedicines: ReturnType<typeof extractMedicines> = [];

    if (req.file) {
      if (prev.prescription_file) {
        const oldPath = path.join(__dirname, '../uploads/prescriptions', prev.prescription_file);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      prescriptionFile = req.file.filename;
      ocrText          = await runOCR(req.file.path);
      ocrMedicines     = extractMedicines(ocrText);
    }

    await client.query('BEGIN');

    const { rows: [consultation] } = await client.query(`
      UPDATE medical_consultations SET
        visit_date=$1, hospital_clinic=$2,
        sick_description=$3, diagnosis=$4, treatment_description=$5,
        assigned_pharmacist_id=$6, prescription_file=$7, ocr_text=$8,
        updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [
      visit_date,
      hospital_clinic          || null,
      sick_description         || null,
      diagnosis                || null,
      treatment_description    || null,
      assigned_pharmacist_id   || null,
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

    const { rows: medicines } = await pool.query(
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

    const { rows: patRows } = await pool.query(`
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

    const { rows: consultations } = await pool.query(`
      SELECT c.*,
        u.name  AS doctor_display_name,
        dp.specialization AS doctor_specialization,
        ph.name AS pharmacist_name,
        pp.pharmacy_name,
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
        ) AS medicines
      FROM medical_consultations c
      LEFT JOIN users u            ON u.id  = c.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = c.doctor_id
      LEFT JOIN users ph           ON ph.id = c.assigned_pharmacist_id
      LEFT JOIN pharmacist_profiles pp ON pp.user_id = c.assigned_pharmacist_id
      LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
      WHERE c.patient_id = $1
      GROUP BY c.id, u.name, dp.specialization, ph.name, pp.pharmacy_name
      ORDER BY c.visit_date DESC, c.created_at DESC
    `, [patientId]);

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
    const { rows } = await pool.query(
      `SELECT prescription_file FROM medical_consultations WHERE id=$1 AND ${condition}`,
      [req.params.id, id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    if (rows[0].prescription_file) {
      const fp = path.join(__dirname, '../uploads/prescriptions', rows[0].prescription_file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await pool.query('DELETE FROM medical_consultations WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

const updateByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows: existing } = await pool.query(
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

    const { rows: updatedMeds } = await pool.query(
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

export { create, update, updateByPatient, getAll, getOne, updateStatus, getPatientHistory, remove };
