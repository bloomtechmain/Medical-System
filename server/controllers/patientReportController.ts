import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ message: 'Report file is required' }); return; }

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

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE patient_id=$1 ORDER BY issued_date DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const serveFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const report   = rows[0];
    const filePath = path.join(__dirname, '../uploads/patient-reports', report.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ message: 'File not found on disk' }); return; }

    res.setHeader('Content-Type', report.file_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.file_original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const filePath = path.join(__dirname, '../uploads/patient-reports', rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM patient_reports WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

// Doctor access: serve a personal report file when doctor has accepted `personal_reports` access
const serveFileForDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId = req.user.id;
    const reportId = req.params.id;

    // Get the report and its patient_id
    const { rows: reportRows } = await pool.query(
      'SELECT * FROM patient_reports WHERE id = $1',
      [reportId]
    );
    if (!reportRows.length) { res.status(404).json({ message: 'Report not found' }); return; }

    const report    = reportRows[0];
    const patientId = report.patient_id;

    // Verify the doctor has accepted personal_reports access for this patient
    const { rows: accessRows } = await pool.query(
      `SELECT status FROM data_access_requests
       WHERE doctor_id = $1 AND patient_id = $2 AND access_type = 'personal_reports' AND status = 'accepted'
       LIMIT 1`,
      [doctorId, patientId]
    );
    if (!accessRows.length) { res.status(403).json({ message: 'Access not granted for this patient\'s personal reports' }); return; }

    const filePath = path.join(__dirname, '../uploads/patient-reports', report.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ message: 'File not found on disk' }); return; }

    res.setHeader('Content-Type', report.file_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.file_original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

export { create, getAll, getOne, serveFile, serveFileForDoctor, remove };
