import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';
import { parsePaging } from '../utils/pagination';

const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

// Same linear pipeline as the old consultation-level status, now scoped per (consultation, pharmacy) pair.
const ALLOWED_STATUS_TRANSITIONS: Record<string, string> = {
  active:    'preparing',
  preparing: 'dispensed',
  dispensed: 'delivered',
};

const STATUS_NOTIFICATIONS: Record<string, { title: string; patient: (phName: string) => string; doctor?: (ptName: string, phName: string) => string }> = {
  preparing: {
    title: 'Pharmacy Preparing Your Medicines',
    patient: (phName) => `${phName} has started preparing your medicines.`,
  },
  dispensed: {
    title: 'Medicines Ready ✅',
    patient: (phName) => `Your medicines are ready for pickup/delivery at ${phName}.`,
    doctor:  (ptName, phName) => `The prescription for patient ${ptName} is ready for pickup/delivery at ${phName}.`,
  },
  delivered: {
    title: 'Medicines Delivered ✅',
    patient: (phName) => `Your medicines from ${phName} have been delivered. Treatment complete!`,
    doctor:  (ptName, phName) => `Patient ${ptName} has received their medicines from ${phName}.`,
  },
};

// Create (or reactivate a previously-cancelled) pharmacy assignment for a consultation.
// Doctor or patient, as long as they own the parent consultation.
const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { consultation_id, pharmacist_id } = req.body as { consultation_id: number; pharmacist_id: number };
    if (!consultation_id || !pharmacist_id) {
      res.status(400).json({ message: 'consultation_id and pharmacist_id are required' }); return;
    }

    const { rows: cRows } = await queryAs(actor(req),
      'SELECT id, patient_id, doctor_id FROM medical_consultations WHERE id=$1 AND (patient_id=$2 OR doctor_id=$2)',
      [consultation_id, req.user.id]
    );
    if (!cRows.length) { res.status(404).json({ message: 'Consultation not found' }); return; }
    const consultation = cRows[0];

    const { rows: phRows } = await pool.query(
      "SELECT u.id, u.name, pp.pharmacy_name FROM users u LEFT JOIN pharmacist_profiles pp ON pp.user_id = u.id WHERE u.id=$1 AND u.role='pharmacist' AND u.is_active=TRUE",
      [pharmacist_id]
    );
    if (!phRows.length) { res.status(404).json({ message: 'Pharmacist not found' }); return; }
    const phName = phRows[0].pharmacy_name || phRows[0].name || 'Pharmacy';

    const { rows } = await queryAs(actor(req), `
      INSERT INTO prescription_assignments (consultation_id, pharmacist_id, assigned_by, status)
      VALUES ($1,$2,$3,'active')
      ON CONFLICT (consultation_id, pharmacist_id) DO UPDATE SET
        status='active', assigned_by=EXCLUDED.assigned_by, cancelled_by=NULL, cancelled_at=NULL, updated_at=NOW()
      WHERE prescription_assignments.status='cancelled'
      RETURNING *
    `, [consultation_id, pharmacist_id, req.user.id]);

    if (!rows.length) {
      res.status(409).json({ message: `Already sent to ${phName}` }); return;
    }

    const requesterRow = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0];
    const requesterName = requesterRow?.name || (req.user.role === 'doctor' ? 'Your doctor' : 'A patient');

    await sendNotification(
      pharmacist_id,
      'consultation_assigned',
      'New Prescription Forwarded',
      req.user.role === 'doctor'
        ? `Dr. ${requesterName} has forwarded a prescription to ${phName}. Please prepare the medicines.`
        : `Patient ${requesterName} has forwarded a prescription to ${phName}. Please prepare the medicines.`,
      { consultation_id: consultation.id }
    );

    res.status(201).json({ ...rows[0], pharmacy_name: phName, pharmacist_name: phRows[0].name });
  } catch (err) { next(err); }
};

// consultation_id query param -> doctor/patient history (incl. cancelled) for one visit.
// No query param -> pharmacist's own assignment list across all consultations.
const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const consultationId = req.query.consultation_id ? parseInt(req.query.consultation_id as string, 10) : null;

    if (consultationId) {
      const { rows } = await queryAs(actor(req), `
        SELECT pa.*, COALESCE(pp.pharmacy_name, u.name) AS pharmacy_name, u.name AS pharmacist_name
        FROM prescription_assignments pa
        JOIN medical_consultations c ON c.id = pa.consultation_id
        JOIN users u ON u.id = pa.pharmacist_id
        LEFT JOIN pharmacist_profiles pp ON pp.user_id = pa.pharmacist_id
        WHERE pa.consultation_id = $1 AND (c.patient_id = $2 OR c.doctor_id = $2)
        ORDER BY pa.created_at ASC
      `, [consultationId, req.user.id]);
      res.json(rows);
      return;
    }

    if (req.user.role !== 'pharmacist') { res.json([]); return; }

    // PERF-04: the pharmacist's own assignment list (across every
    // consultation ever sent to them) was never paginated. See
    // utils/pagination.ts for why the default is generous rather than "a
    // page." The consultation-scoped branch above stays unpaginated — it's
    // one visit's pharmacy assignments, inherently small.
    const { limit, offset } = parsePaging(req.query as Record<string, string | undefined>);
    const { rows } = await queryAs(actor(req), `
      SELECT pa.*, c.visit_date, c.diagnosis, c.sick_description, c.treatment_description,
             c.prescription_file, c.lab_tests_requested,
             pt.name AS patient_name, pt.email AS patient_email,
             dr.name AS doctor_display_name
      FROM prescription_assignments pa
      JOIN medical_consultations c ON c.id = pa.consultation_id
      JOIN users pt ON pt.id = c.patient_id
      LEFT JOIN users dr ON dr.id = c.doctor_id
      WHERE pa.pharmacist_id = $1
      ORDER BY pa.status ASC, c.visit_date DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const ids = rows.map((r: any) => r.consultation_id);
    const medsByConsultation: Record<number, any[]> = {};
    if (ids.length) {
      const { rows: meds } = await queryAs(actor(req),
        'SELECT * FROM consultation_medicines WHERE consultation_id = ANY($1) ORDER BY source DESC, id',
        [ids]
      );
      for (const m of meds) {
        (medsByConsultation[m.consultation_id] ||= []).push(m);
      }
    }

    res.json(rows.map((r: any) => ({ ...r, medicines: medsByConsultation[r.consultation_id] || [] })));
  } catch (err) { next(err); }
};

// Pharmacist advances their own assignment through the fulfilment pipeline.
const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body as { status: string };

    const { rows: currentRows } = await queryAs(actor(req),
      'SELECT * FROM prescription_assignments WHERE id=$1 AND pharmacist_id=$2',
      [req.params.id, req.user.id]
    );
    if (!currentRows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const previousStatus = currentRows[0].status;
    if (ALLOWED_STATUS_TRANSITIONS[previousStatus] !== status) {
      res.status(400).json({ message: `Cannot move from "${previousStatus}" to "${status}"` });
      return;
    }

    // PRO-29: status was read, then updated in a separate statement with no
    // lock — a concurrent update from the same pharmacist (two tabs, a
    // retried request) could both pass the check above and both apply,
    // skipping a step in the pipeline. The expected previous status goes in
    // the WHERE clause so only the request that's still looking at the
    // current state can win; the other gets 0 rows back and a 409.
    const { rows } = await queryAs(actor(req),
      `UPDATE prescription_assignments SET status=$1, updated_at=NOW()
       WHERE id=$2 AND pharmacist_id=$3 AND status=$4
       RETURNING *`,
      [status, req.params.id, req.user.id, previousStatus]
    );
    if (!rows.length) {
      res.status(409).json({ message: 'This assignment was already updated by another request. Please refresh and try again.' });
      return;
    }
    const assignment = rows[0];

    const { rows: cRows } = await queryAs(actor(req),
      'SELECT patient_id, doctor_id FROM medical_consultations WHERE id=$1', [assignment.consultation_id]
    );
    const consultation = cRows[0];

    const notif = STATUS_NOTIFICATIONS[status];
    if (notif && consultation) {
      const phRow  = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0];
      const phName = phRow?.name || 'the pharmacy';

      await sendNotification(consultation.patient_id, `prescription_${status}`, notif.title, notif.patient(phName), { consultation_id: assignment.consultation_id, assignment_id: assignment.id });

      if (consultation.doctor_id && notif.doctor) {
        const ptRow  = (await pool.query('SELECT name FROM users WHERE id=$1', [consultation.patient_id])).rows[0];
        const ptName = ptRow?.name || 'the patient';
        await sendNotification(consultation.doctor_id, `prescription_${status}`, notif.title, notif.doctor(ptName, phName), { consultation_id: assignment.consultation_id, assignment_id: assignment.id });
      }
    }

    res.json(assignment);
  } catch (err) { next(err); }
};

// Doctor or patient withdraws a pharmacy assignment they own — only before the
// pharmacy has actually dispensed anything (mirrors the old "cannot reassign
// after dispensing" rule).
const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows: existing } = await queryAs(actor(req), `
      SELECT pa.*, c.patient_id, c.doctor_id
      FROM prescription_assignments pa
      JOIN medical_consultations c ON c.id = pa.consultation_id
      WHERE pa.id=$1 AND (c.patient_id=$2 OR c.doctor_id=$2)
    `, [req.params.id, req.user.id]);
    if (!existing.length) { res.status(404).json({ message: 'Not found' }); return; }

    const current = existing[0];
    if (!['active', 'preparing'].includes(current.status)) {
      res.status(400).json({ message: 'Cannot cancel after the pharmacy has dispensed the medicines' });
      return;
    }

    const { rows } = await queryAs(actor(req),
      `UPDATE prescription_assignments SET status='cancelled', cancelled_by=$1, cancelled_at=NOW(), updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    const assignment = rows[0];

    const requesterRow = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0];
    const requesterName = requesterRow?.name || 'The patient/doctor';

    await sendNotification(
      assignment.pharmacist_id,
      'prescription_cancelled',
      'Prescription Withdrawn',
      `${requesterName} has withdrawn this prescription — no further action needed.`,
      { consultation_id: assignment.consultation_id, assignment_id: assignment.id }
    );

    res.json(assignment);
  } catch (err) { next(err); }
};

export { create, getAll, updateStatus, cancel };
