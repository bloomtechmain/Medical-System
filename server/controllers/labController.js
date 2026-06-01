const path = require('path');
const fs   = require('fs');
const { pool }            = require('../config/db');
const { sendNotification } = require('../utils/notify');

// ── helpers ────────────────────────────────────────────────────
const labName = async (labId) => {
  const { rows } = await pool.query(
    `SELECT u.name, p.lab_name FROM users u
     LEFT JOIN laboratory_profiles p ON p.user_id = u.id
     WHERE u.id = $1`, [labId]
  );
  return rows[0]?.lab_name || rows[0]?.name || 'Laboratory';
};

const userName = async (uid) =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

// ── create (doctor) ────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { patient_id, laboratory_id, consultation_id, test_description, notes } = req.body;
    const doctorId = req.user.id;

    const { rows: [request] } = await pool.query(`
      INSERT INTO lab_requests
        (doctor_id, patient_id, laboratory_id, consultation_id, test_description, notes)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [doctorId, patient_id, laboratory_id, consultation_id || null,
        test_description, notes || null]);

    const [drName, ptName, lName] = await Promise.all([
      userName(doctorId), userName(patient_id), labName(laboratory_id),
    ]);

    await sendNotification(
      laboratory_id,
      'lab_request_assigned',
      'New Lab Test Request',
      `Dr. ${drName} has requested lab tests for patient ${ptName}. Please process and upload the report.`,
      { lab_request_id: request.id }
    );

    res.status(201).json(request);
  } catch (err) { next(err); }
};

// ── getAll (role-based) ────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { role, id } = req.user;
    const condMap = {
      doctor:     'lr.doctor_id     = $1',
      patient:    'lr.patient_id    = $1',
      laboratory: 'lr.laboratory_id = $1',
    };
    const cond = condMap[role];
    if (!cond) return res.json([]);

    const { rows } = await pool.query(`
      SELECT lr.*,
        dr.name  AS doctor_name,
        pt.name  AS patient_name,
        lp.lab_name,
        lp.lab_type,
        lp.phone AS lab_phone,
        lp.address AS lab_address
      FROM lab_requests lr
      LEFT JOIN users dr ON dr.id = lr.doctor_id
      LEFT JOIN users pt ON pt.id = lr.patient_id
      LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
      WHERE ${cond}
      ORDER BY lr.created_at DESC
    `, [id]);

    res.json(rows);
  } catch (err) { next(err); }
};

// ── getOne ─────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const { role, id } = req.user;
    const condMap = {
      doctor:     'lr.doctor_id     = $2',
      patient:    'lr.patient_id    = $2',
      laboratory: 'lr.laboratory_id = $2',
    };
    const cond = condMap[role];
    if (!cond) return res.status(403).json({ message: 'Forbidden' });

    const { rows } = await pool.query(`
      SELECT lr.*,
        dr.name  AS doctor_name,
        pt.name  AS patient_name,
        pt.email AS patient_email,
        lp.lab_name, lp.lab_type, lp.phone AS lab_phone, lp.address AS lab_address,
        lp.accreditation
      FROM lab_requests lr
      LEFT JOIN users dr ON dr.id = lr.doctor_id
      LEFT JOIN users pt ON pt.id = lr.patient_id
      LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
      WHERE lr.id = $1 AND ${cond}
    `, [req.params.id, id]);

    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── uploadReport (laboratory) ──────────────────────────────────
const uploadReport = async (req, res, next) => {
  try {
    const { report_notes } = req.body;
    const labId = req.user.id;

    const { rows: existing } = await pool.query(
      'SELECT * FROM lab_requests WHERE id=$1 AND laboratory_id=$2',
      [req.params.id, labId]
    );
    if (!existing.length) return res.status(404).json({ message: 'Not found' });
    if (!req.file)         return res.status(400).json({ message: 'Report file is required' });

    // Delete old report if replacing
    if (existing[0].report_file) {
      const oldPath = path.join(__dirname, '../uploads/lab-reports', existing[0].report_file);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const { rows: [request] } = await pool.query(`
      UPDATE lab_requests
      SET report_file=$1, report_mimetype=$2, report_notes=$3,
          status='completed', updated_at=NOW()
      WHERE id=$4
      RETURNING *
    `, [req.file.filename, req.file.mimetype, report_notes || null, req.params.id]);

    const lName  = await labName(labId);
    const ptName = await userName(request.patient_id);

    await Promise.all([
      sendNotification(
        request.doctor_id,
        'lab_report_ready',
        'Lab Report Ready 🔬',
        `Lab report for patient ${ptName} is ready. ${lName} has uploaded the results.`,
        { lab_request_id: request.id }
      ),
      sendNotification(
        request.patient_id,
        'lab_report_ready',
        'Your Lab Report is Ready 🔬',
        `Your lab report from ${lName} is now available. View and download it from your portal.`,
        { lab_request_id: request.id }
      ),
    ]);

    res.json(request);
  } catch (err) { next(err); }
};

// ── updateStatus (laboratory) ──────────────────────────────────
const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE lab_requests SET status=$1, updated_at=NOW()
       WHERE id=$2 AND laboratory_id=$3 RETURNING *`,
      [status, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── remove (doctor) ────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT report_file FROM lab_requests WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    if (rows[0].report_file) {
      const fp = path.join(__dirname, '../uploads/lab-reports', rows[0].report_file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await pool.query('DELETE FROM lab_requests WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

module.exports = { create, getAll, getOne, uploadReport, updateStatus, remove };
