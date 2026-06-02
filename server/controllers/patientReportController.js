const path = require('path');
const fs   = require('fs');
const { pool } = require('../config/db');

const create = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Report file is required' });

    const {
      title, report_type, laboratory_name,
      doctor_name, hospital_clinic, issued_date, description,
    } = req.body;

    const { rows: [report] } = await pool.query(`
      INSERT INTO patient_reports
        (patient_id, title, report_type, laboratory_name, doctor_name,
         hospital_clinic, issued_date, description,
         file_path, file_mimetype, file_original_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      req.user.id, title, report_type,
      laboratory_name || null, doctor_name || null, hospital_clinic || null,
      issued_date, description || null,
      req.file.filename, req.file.mimetype, req.file.originalname,
    ]);

    res.status(201).json(report);
  } catch (err) { next(err); }
};

const getAll = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE patient_id=$1 ORDER BY issued_date DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const serveFile = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const report   = rows[0];
    const filePath = path.join(__dirname, '../uploads/patient-reports', report.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on disk' });

    res.setHeader('Content-Type', report.file_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.file_original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const filePath = path.join(__dirname, '../uploads/patient-reports', rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM patient_reports WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

module.exports = { create, getAll, getOne, serveFile, remove };
