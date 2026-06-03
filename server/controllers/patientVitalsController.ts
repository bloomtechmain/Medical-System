import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const VITAL_FIELDS = [
  'wbc','rbc','hemoglobin','hematocrit','mcv','mch','mchc','rdw','platelets','mpv',
  'blood_glucose','hba1c','creatinine',
  'cholesterol','hdl','ldl','triglycerides',
  'bp_systolic','bp_diastolic','heart_rate','temperature','oxygen_saturation',
];

// GET /patient-vitals — latest vitals record for the current patient
const getVitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
};

// GET /patient-vitals/history
const getVitalsHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// POST /patient-vitals — upserts today's manual record
const saveVitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.user.id;
    const body      = req.body as Record<string, any>;

    // Collect which vital fields have valid values
    const fields:  string[]  = [];
    const vals:    unknown[] = [];

    for (const field of VITAL_FIELDS) {
      const v = body[field];
      if (v !== undefined && v !== '' && v !== null) {
        fields.push(field);
        vals.push(v);
      }
    }
    if (body.notes !== undefined && body.notes !== '') {
      fields.push('notes');
      vals.push(body.notes);
    }

    if (fields.length === 0) {
      res.status(400).json({ message: 'No vitals data provided' });
      return;
    }

    // Check for an existing manual record today to upsert into
    const today = new Date().toISOString().split('T')[0];
    const { rows: existing } = await pool.query(
      `SELECT id FROM patient_vitals
       WHERE patient_id = $1 AND source = 'manual' AND recorded_at::date = $2
       ORDER BY recorded_at DESC LIMIT 1`,
      [patientId, today]
    );

    let result;

    if (existing.length > 0) {
      // ── UPDATE existing record ──────────────────────────────────────────
      // $1 = record id, $2...$N = field values
      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE patient_vitals
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing[0].id, ...vals]
      );
      result = rows[0];
    } else {
      // ── INSERT new record ───────────────────────────────────────────────
      // $1 = patient_id, $2...$N = field values (source is hardcoded)
      const colList     = ['patient_id', 'source', ...fields];
      const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO patient_vitals (${colList.join(', ')})
         VALUES ($1, 'manual', ${placeholders})
         RETURNING *`,
        [patientId, ...vals]
      );
      result = rows[0];
    }

    res.json(result);
  } catch (err) { next(err); }
};

// Internal — called by labController when a report is uploaded
export const saveVitalsFromLab = async (
  patientId:    number,
  vitalsData:   Record<string, number | undefined | null>,
  labRequestId: number
): Promise<void> => {
  try {
    const fields = Object.keys(vitalsData).filter(
      k => VITAL_FIELDS.includes(k) && vitalsData[k] !== undefined
    );
    if (fields.length === 0) return;

    const vals = fields.map(f => vitalsData[f]);

    // Check for existing record tied to this lab request
    const { rows: existing } = await pool.query(
      `SELECT id FROM patient_vitals WHERE lab_request_id = $1 LIMIT 1`,
      [labRequestId]
    );

    if (existing.length > 0) {
      // UPDATE — $1 = record id, $2...$N = vitals values
      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      await pool.query(
        `UPDATE patient_vitals SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
        [existing[0].id, ...vals]
      );
    } else {
      // INSERT — $1=patient_id, $2=lab_request_id, $3...$N=vitals values
      const colList      = ['patient_id', 'lab_request_id', 'source', ...fields];
      const placeholders = fields.map((_, i) => `$${i + 3}`).join(', ');
      await pool.query(
        `INSERT INTO patient_vitals (${colList.join(', ')})
         VALUES ($1, $2, 'lab_report', ${placeholders})`,
        [patientId, labRequestId, ...vals]
      );
    }
  } catch (err) {
    console.error('saveVitalsFromLab error:', (err as Error).message);
  }
};

export { getVitals, getVitalsHistory, saveVitals };
