const path = require('path');
const fs   = require('fs');
const { pool }            = require('../config/db');
const { sendNotification } = require('../utils/notify');

const userName = async (uid) =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

// ── Doctor: request to view a completed lab report ────────────────────────────
const createRequest = async (req, res, next) => {
  try {
    const { lab_request_id, message } = req.body;
    const doctorId = req.user.id;

    // Verify this lab request belongs to this doctor and is completed
    const { rows: [labReq] } = await pool.query(
      "SELECT * FROM lab_requests WHERE id=$1 AND doctor_id=$2 AND status='completed'",
      [lab_request_id, doctorId]
    );
    if (!labReq)
      return res.status(404).json({ message: 'Lab report not found or not yet completed.' });

    // Check existing request
    const { rows: existing } = await pool.query(
      'SELECT * FROM lab_view_requests WHERE lab_request_id=$1 AND doctor_id=$2 ORDER BY created_at DESC LIMIT 1',
      [lab_request_id, doctorId]
    );

    if (existing.length) {
      if (existing[0].status === 'pending')
        return res.status(409).json({ message: 'A request is already pending patient approval.' });
      if (existing[0].status === 'accepted')
        return res.status(409).json({ message: 'You already have access to this report.' });

      // Declined — re-activate as a fresh pending request
      const { rows: [updated] } = await pool.query(`
        UPDATE lab_view_requests
        SET status='pending', message=$1, responded_at=NULL, updated_at=NOW()
        WHERE id=$2 RETURNING *
      `, [message || null, existing[0].id]);

      await notifyPatient(labReq, doctorId, updated.id);
      return res.status(201).json(updated);
    }

    const { rows: [request] } = await pool.query(`
      INSERT INTO lab_view_requests (lab_request_id, doctor_id, patient_id, message)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [lab_request_id, doctorId, labReq.patient_id, message || null]);

    await notifyPatient(labReq, doctorId, request.id);
    res.status(201).json(request);
  } catch (err) { next(err); }
};

async function notifyPatient(labReq, doctorId, requestId) {
  const drName = await userName(doctorId);
  const { rows: [lp] } = await pool.query(
    'SELECT lab_name FROM laboratory_profiles WHERE user_id=$1', [labReq.laboratory_id]
  );
  const labName = lp?.lab_name || 'the laboratory';

  await sendNotification(
    labReq.patient_id,
    'lab_view_request',
    'Doctor Wants to View Your Lab Report',
    `Dr. ${drName} has requested permission to view your lab report from ${labName}. Please review and respond.`,
    { lab_view_request_id: requestId, lab_request_id: labReq.id }
  );
}

// ── Patient: respond to a view request ───────────────────────────────────────
const respond = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status))
      return res.status(400).json({ message: 'Status must be accepted or declined.' });

    const { rows: [existing] } = await pool.query(`
      SELECT lvr.*, lr.test_description, lr.laboratory_id
      FROM lab_view_requests lvr
      JOIN lab_requests lr ON lr.id = lvr.lab_request_id
      WHERE lvr.id=$1 AND lvr.patient_id=$2 AND lvr.status='pending'
    `, [req.params.id, req.user.id]);

    if (!existing)
      return res.status(404).json({ message: 'Request not found or already responded to.' });

    const { rows: [request] } = await pool.query(`
      UPDATE lab_view_requests
      SET status=$1, responded_at=NOW(), updated_at=NOW()
      WHERE id=$2 RETURNING *
    `, [status, req.params.id]);

    const ptName  = await userName(req.user.id);
    const { rows: [lp] } = await pool.query(
      'SELECT lab_name FROM laboratory_profiles WHERE user_id=$1', [existing.laboratory_id]
    );
    const labName = lp?.lab_name || 'the laboratory';

    await sendNotification(
      request.doctor_id,
      status === 'accepted' ? 'lab_view_accepted' : 'lab_view_declined',
      status === 'accepted'
        ? 'Lab Report Access Granted ✅'
        : 'Lab Report Access Declined',
      status === 'accepted'
        ? `${ptName} accepted your request — you can now view the lab report from ${labName}.`
        : `${ptName} declined your request to view the lab report from ${labName}.`,
      { lab_view_request_id: request.id, lab_request_id: request.lab_request_id }
    );

    res.json(request);
  } catch (err) { next(err); }
};

// ── Get all (role-based) ──────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { role, id } = req.user;
    let rows;

    if (role === 'doctor') {
      ({ rows } = await pool.query(`
        SELECT lvr.*,
          lr.test_description, lr.report_notes, lr.report_file, lr.report_mimetype,
          lr.notes AS lab_notes, lr.created_at AS lab_created_at,
          pt.name  AS patient_name,
          lp.lab_name
        FROM lab_view_requests lvr
        JOIN lab_requests lr ON lr.id = lvr.lab_request_id
        JOIN users pt         ON pt.id = lvr.patient_id
        LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
        WHERE lvr.doctor_id = $1
        ORDER BY lvr.created_at DESC
      `, [id]));
    } else if (role === 'patient') {
      ({ rows } = await pool.query(`
        SELECT lvr.*,
          lr.test_description, lr.report_notes,
          lp.lab_name,
          u.name  AS doctor_name,
          u.email AS doctor_email,
          dp.specialization AS doctor_specialization,
          dp.hospital_affiliation AS doctor_hospital
        FROM lab_view_requests lvr
        JOIN lab_requests lr    ON lr.id  = lvr.lab_request_id
        LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
        JOIN users u            ON u.id   = lvr.doctor_id
        LEFT JOIN doctor_profiles dp ON dp.user_id = lvr.doctor_id
        WHERE lvr.patient_id = $1
        ORDER BY lvr.created_at DESC
      `, [id]));
    } else {
      return res.json([]);
    }

    res.json(rows);
  } catch (err) { next(err); }
};

// ── Authenticated file serving for accepted requests (doctor) ─────────────────
const serveFile = async (req, res, next) => {
  try {
    const { rows: [viewReq] } = await pool.query(`
      SELECT lvr.*, lr.report_file, lr.report_mimetype
      FROM lab_view_requests lvr
      JOIN lab_requests lr ON lr.id = lvr.lab_request_id
      WHERE lvr.id=$1 AND lvr.doctor_id=$2 AND lvr.status='accepted'
    `, [req.params.id, req.user.id]);

    if (!viewReq)
      return res.status(403).json({ message: 'Access denied or request not accepted.' });
    if (!viewReq.report_file)
      return res.status(404).json({ message: 'Report file not yet available.' });

    const filePath = path.join(__dirname, '../uploads/lab-reports', viewReq.report_file);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: 'File not found on disk.' });

    res.setHeader('Content-Type', viewReq.report_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="lab-report-${viewReq.lab_request_id}${path.extname(viewReq.report_file)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

module.exports = { createRequest, respond, getAll, serveFile };
