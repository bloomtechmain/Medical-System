import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { sendNotification } from '../utils/notify';

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const ACCESS_LABELS: Record<string, string> = {
  lab_reports:      'Lab Reports',
  medical_history:  'Medical History',
  personal_reports: 'Personal Health Reports',
  contact_info:     'Contact Information',
};

const createRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { patient_id, access_type, reason } = req.body;
    const doctorId = req.user.id;

    const { rows: pt } = await pool.query(
      "SELECT id, name FROM users WHERE id=$1 AND role='patient'", [patient_id]
    );
    if (!pt.length) { res.status(404).json({ message: 'Patient not found' }); return; }

    const { rows: existing } = await pool.query(`
      SELECT id, status FROM data_access_requests
      WHERE doctor_id=$1 AND patient_id=$2 AND access_type=$3
      ORDER BY created_at DESC LIMIT 1
    `, [doctorId, patient_id, access_type]);

    if (existing.length && existing[0].status === 'pending') {
      res.status(409).json({ message: 'A pending request for this data type already exists.' }); return;
    }
    if (existing.length && existing[0].status === 'accepted') {
      res.status(409).json({ message: 'Access is already granted for this data type.' }); return;
    }

    const { rows: [request] } = await pool.query(`
      INSERT INTO data_access_requests (doctor_id, patient_id, access_type, reason)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [doctorId, patient_id, access_type, reason || null]);

    const drName = await userName(doctorId);

    await sendNotification(
      patient_id,
      'access_request',
      'New Data Access Request',
      `Dr. ${drName} has requested access to your ${ACCESS_LABELS[access_type] || access_type}. Please review and respond.`,
      { request_id: request.id, doctor_id: doctorId }
    );

    res.status(201).json(request);
  } catch (err) { next(err); }
};

const respond = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      res.status(400).json({ message: 'Status must be accepted or declined' }); return;
    }

    const { rows: existing } = await pool.query(
      "SELECT * FROM data_access_requests WHERE id=$1 AND patient_id=$2 AND status='pending'",
      [req.params.id, req.user.id]
    );
    if (!existing.length) {
      res.status(404).json({ message: 'Request not found or already responded to' }); return;
    }

    const { rows: [request] } = await pool.query(`
      UPDATE data_access_requests
      SET status=$1, responded_at=NOW(), updated_at=NOW()
      WHERE id=$2 RETURNING *
    `, [status, req.params.id]);

    const ptName = await userName(req.user.id);
    const label  = ACCESS_LABELS[request.access_type] || request.access_type;

    if (status === 'accepted') {
      await sendNotification(
        request.doctor_id,
        'access_accepted',
        'Access Request Accepted ✅',
        `${ptName} has accepted your request to view their ${label}. You can now access this data.`,
        { request_id: request.id, patient_id: request.patient_id }
      );
    } else {
      await sendNotification(
        request.doctor_id,
        'access_declined',
        'Access Request Declined',
        `${ptName} has declined your request to view their ${label}.`,
        { request_id: request.id, patient_id: request.patient_id }
      );
    }

    res.json(request);
  } catch (err) { next(err); }
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    let rows: unknown[];

    if (role === 'doctor') {
      ({ rows } = await pool.query(`
        SELECT r.*,
          u.name  AS patient_name,
          u.email AS patient_email
        FROM data_access_requests r
        JOIN users u ON u.id = r.patient_id
        WHERE r.doctor_id = $1
        ORDER BY r.created_at DESC
      `, [id]));
    } else if (role === 'patient') {
      ({ rows } = await pool.query(`
        SELECT r.*,
          u.name    AS doctor_name,
          u.email   AS doctor_email,
          dp.specialization AS doctor_specialization,
          dp.hospital_affiliation AS doctor_hospital
        FROM data_access_requests r
        JOIN users u ON u.id = r.doctor_id
        LEFT JOIN doctor_profiles dp ON dp.user_id = r.doctor_id
        WHERE r.patient_id = $1
        ORDER BY r.created_at DESC
      `, [id]));
    } else {
      res.json([]); return;
    }

    res.json(rows);
  } catch (err) { next(err); }
};

const getPatientView = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId  = req.user.id;
    const patientId = parseInt(req.params.patientId, 10);

    const { rows: ptRows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.created_at,
             pp.date_of_birth, pp.gender, pp.blood_type,
             pp.allergies, pp.chronic_conditions,
             pp.phone, pp.address,
             pp.emergency_contact_name, pp.emergency_contact_phone,
             pp.insurance_provider, pp.insurance_policy_number
      FROM users u
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE u.id = $1 AND u.role = 'patient'
    `, [patientId]);

    if (!ptRows.length) { res.status(404).json({ message: 'Patient not found' }); return; }

    const patient = ptRows[0];

    const { rows: accessRows } = await pool.query(`
      SELECT DISTINCT ON (access_type)
        access_type, status, id AS request_id, created_at, responded_at
      FROM data_access_requests
      WHERE doctor_id = $1 AND patient_id = $2
      ORDER BY access_type, created_at DESC
    `, [doctorId, patientId]);

    const access: Record<string, { status: string; request_id: number; created_at: string }> = {};
    for (const r of accessRows) {
      access[r.access_type] = { status: r.status, request_id: r.request_id, created_at: r.created_at };
    }

    const { rows: activeMeds } = await pool.query(`
      SELECT cm.medicine_name, cm.dosage, cm.frequency, cm.duration, mc.diagnosis
      FROM consultation_medicines cm
      JOIN medical_consultations mc ON mc.id = cm.consultation_id
      WHERE mc.patient_id = $1 AND mc.status = 'active'
      ORDER BY mc.visit_date DESC
    `, [patientId]);

    const data: Record<string, unknown> = {};

    if (access.lab_reports?.status === 'accepted') {
      const { rows } = await pool.query(`
        SELECT lr.*,
          lp.lab_name, lp.lab_type, lp.address AS lab_address
        FROM lab_requests lr
        LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
        WHERE lr.patient_id = $1
        ORDER BY lr.created_at DESC
      `, [patientId]);
      data.lab_reports = rows;
    }

    if (access.medical_history?.status === 'accepted') {
      const { rows } = await pool.query(`
        SELECT c.*,
          u.name AS doctor_name,
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
          ) AS medicines
        FROM medical_consultations c
        LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
        LEFT JOIN users u ON u.id = c.doctor_id
        WHERE c.patient_id = $1
        GROUP BY c.id, u.name
        ORDER BY c.visit_date DESC
      `, [patientId]);
      data.consultations = rows;
    }

    if (access.personal_reports?.status === 'accepted') {
      const { rows } = await pool.query(
        'SELECT * FROM patient_reports WHERE patient_id=$1 ORDER BY issued_date DESC',
        [patientId]
      );
      data.personal_reports = rows;
    }

    if (access.vitals?.status === 'accepted') {
      const { rows: vitalsHistory } = await pool.query(
        `SELECT * FROM patient_vitals WHERE patient_id=$1 ORDER BY recorded_at DESC`,
        [patientId]
      );
      data.vitals_history = vitalsHistory;
    }

    res.json({ patient, access, active_meds: activeMeds, data });
  } catch (err) { next(err); }
};

const searchPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = `%${((req.query.q as string) || '').trim()}%`;
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active, u.created_at,
             pp.date_of_birth, pp.gender, pp.blood_type, pp.phone, pp.allergies, pp.chronic_conditions
      FROM users u
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE u.role = 'patient'
        AND (u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.name
      LIMIT 20
    `, [q]);
    res.json(rows);
  } catch (err) { next(err); }
};

const serveLabReportFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId     = req.user.id;
    const patientId    = parseInt(req.params.patientId, 10);
    const labRequestId = parseInt(req.params.labRequestId, 10);

    const { rows: accessRows } = await pool.query(
      `SELECT id FROM data_access_requests
       WHERE doctor_id=$1 AND patient_id=$2 AND access_type='lab_reports' AND status='accepted'
       LIMIT 1`,
      [doctorId, patientId]
    );
    if (!accessRows.length) {
      res.status(403).json({ message: 'Lab reports access not granted for this patient.' }); return;
    }

    const { rows: labRows } = await pool.query(
      `SELECT * FROM lab_requests WHERE id=$1 AND patient_id=$2`,
      [labRequestId, patientId]
    );
    if (!labRows.length) {
      res.status(404).json({ message: 'Lab report not found.' }); return;
    }

    const labReq = labRows[0];
    if (!labReq.report_file) {
      res.status(404).json({ message: 'Report file not yet available.' }); return;
    }

    const filePath = path.join(__dirname, '../uploads/lab-reports', labReq.report_file);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'File not found on disk.' }); return;
    }

    res.setHeader('Content-Type', labReq.report_mimetype || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="lab-report-${labRequestId}${path.extname(labReq.report_file)}"`
    );
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

export { createRequest, respond, getAll, getPatientView, searchPatients, serveLabReportFile };
