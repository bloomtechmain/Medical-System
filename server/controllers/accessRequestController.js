const { pool }            = require('../config/db');
const { sendNotification } = require('../utils/notify');

const userName = async (uid) =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const ACCESS_LABELS = {
  lab_reports:      'Lab Reports',
  medical_history:  'Medical History',
  personal_reports: 'Personal Health Reports',
  contact_info:     'Contact Information',
};

// ── Doctor: create a request ──────────────────────────────────────────────────
const createRequest = async (req, res, next) => {
  try {
    const { patient_id, access_type, reason } = req.body;
    const doctorId = req.user.id;

    // Check patient exists and is a patient
    const { rows: pt } = await pool.query(
      "SELECT id, name FROM users WHERE id=$1 AND role='patient'", [patient_id]
    );
    if (!pt.length) return res.status(404).json({ message: 'Patient not found' });

    // If there's already a pending or accepted request for this type, block duplicate
    const { rows: existing } = await pool.query(`
      SELECT id, status FROM data_access_requests
      WHERE doctor_id=$1 AND patient_id=$2 AND access_type=$3
      ORDER BY created_at DESC LIMIT 1
    `, [doctorId, patient_id, access_type]);

    if (existing.length && existing[0].status === 'pending') {
      return res.status(409).json({ message: 'A pending request for this data type already exists.' });
    }
    if (existing.length && existing[0].status === 'accepted') {
      return res.status(409).json({ message: 'Access is already granted for this data type.' });
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

// ── Patient: respond to a request ─────────────────────────────────────────────
const respond = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status))
      return res.status(400).json({ message: 'Status must be accepted or declined' });

    const { rows: existing } = await pool.query(
      "SELECT * FROM data_access_requests WHERE id=$1 AND patient_id=$2 AND status='pending'",
      [req.params.id, req.user.id]
    );
    if (!existing.length)
      return res.status(404).json({ message: 'Request not found or already responded to' });

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

// ── Get all requests (role-based) ─────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { role, id } = req.user;
    let rows;

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
      return res.json([]);
    }

    res.json(rows);
  } catch (err) { next(err); }
};

// ── Doctor: view a patient's profile + access-gated data ─────────────────────
const getPatientView = async (req, res, next) => {
  try {
    const doctorId  = req.user.id;
    const patientId = parseInt(req.params.patientId, 10);

    // Basic patient profile (always visible — essential for treatment)
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

    if (!ptRows.length)
      return res.status(404).json({ message: 'Patient not found' });

    const patient = ptRows[0];

    // Access status per type (latest per type)
    const { rows: accessRows } = await pool.query(`
      SELECT DISTINCT ON (access_type)
        access_type, status, id AS request_id, created_at, responded_at
      FROM data_access_requests
      WHERE doctor_id = $1 AND patient_id = $2
      ORDER BY access_type, created_at DESC
    `, [doctorId, patientId]);

    const access = {};
    for (const r of accessRows) {
      access[r.access_type] = { status: r.status, request_id: r.request_id, created_at: r.created_at };
    }

    // Always-visible: active medicines (important for safe treatment)
    const { rows: activeMeds } = await pool.query(`
      SELECT cm.medicine_name, cm.dosage, cm.frequency, cm.duration, mc.diagnosis
      FROM consultation_medicines cm
      JOIN medical_consultations mc ON mc.id = cm.consultation_id
      WHERE mc.patient_id = $1 AND mc.status = 'active'
      ORDER BY mc.visit_date DESC
    `, [patientId]);

    const data = {};

    // Lab reports — if access granted
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

    // Medical history — if access granted
    if (access.medical_history?.status === 'accepted') {
      const { rows } = await pool.query(`
        SELECT c.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'medicine_name', m.medicine_name,
                'dosage',        m.dosage,
                'frequency',     m.frequency,
                'duration',      m.duration
              ) ORDER BY m.id
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'
          ) AS medicines
        FROM medical_consultations c
        LEFT JOIN consultation_medicines m ON m.consultation_id = c.id
        WHERE c.patient_id = $1
        GROUP BY c.id
        ORDER BY c.visit_date DESC
      `, [patientId]);
      data.consultations = rows;
    }

    // Personal uploaded reports — if access granted
    if (access.personal_reports?.status === 'accepted') {
      const { rows } = await pool.query(
        'SELECT * FROM patient_reports WHERE patient_id=$1 ORDER BY issued_date DESC',
        [patientId]
      );
      data.personal_reports = rows;
    }

    res.json({ patient, access, active_meds: activeMeds, data });
  } catch (err) { next(err); }
};

// ── Search patients (doctor) ───────────────────────────────────────────────────
const searchPatients = async (req, res, next) => {
  try {
    const q = `%${(req.query.q || '').trim()}%`;
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

module.exports = { createRequest, respond, getAll, getPatientView, searchPatients };
