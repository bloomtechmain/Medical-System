import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { queryAs, RLSActor } from '../config/db';
import { extractVitalsFromText, extractReportText } from '../utils/labVitalsParser';
import { saveVitalsFromPatientUpload } from './patientVitalsController';
import { generateStoredFilename, persistUploadedFile, sendStoredFile, deleteStoredFile } from '../config/fileStorage';

const PATIENT_REPORTS_DIR = 'patient-reports';

// patient_reports / data_access_requests live in the `clinical` schema
// behind row-level security — every query against them must carry the
// acting user's identity. See config/db.ts (queryAs).
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ message: 'Report file is required' }); return; }

    const {
      title, report_type, laboratory_name,
      doctor_name, hospital_clinic, issued_date, description,
    } = req.body;

    const storedName = generateStoredFilename('pr', req.user.id, req.file.originalname);
    await persistUploadedFile(PATIENT_REPORTS_DIR, storedName, req.file.buffer, req.file.mimetype);

    const { rows: [report] } = await queryAs(actor(req), `
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
      storedName, req.file.mimetype, req.file.originalname,
    ]);

    // ── Respond right away — don't block the upload on OCR/PDF extraction ──
    res.status(201).json(report);

    // ── Background: extract vitals from a self-uploaded lab report ─────────
    if (report_type === 'lab_report') {
      const patientId    = req.user.id;
      const reportBuffer = req.file.buffer;
      const reportExt    = path.extname(req.file.originalname).toLowerCase();
      setImmediate(async () => {
        try {
          const reportText = await extractReportText(reportBuffer, reportExt);
          if (reportText.trim().length > 20) {
            const extracted = extractVitalsFromText(reportText);
            if (Object.keys(extracted).length > 0) {
              await saveVitalsFromPatientUpload(patientId, extracted as Record<string, number | undefined>, report.id);
            }
          }
        } catch (bgErr) {
          console.error('[patientReport background]', (bgErr as Error).message);
        }
      });
    }
  } catch (err) { next(err); }
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE patient_id=$1 ORDER BY issued_date DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const serveFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const report = rows[0];
    await sendStoredFile(res, PATIENT_REPORTS_DIR, report.file_path, {
      contentType: report.file_mimetype || 'application/octet-stream',
      inlineFilename: encodeURIComponent(report.file_original_name),
    });
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    await deleteStoredFile(PATIENT_REPORTS_DIR, rows[0].file_path);

    await queryAs(actor(req), 'DELETE FROM patient_reports WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

// Doctor access: serve a personal report file when doctor has accepted `personal_reports` access
const serveFileForDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId = req.user.id;
    const reportId = req.params.id;

    // Get the report and its patient_id
    const { rows: reportRows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id = $1',
      [reportId]
    );
    if (!reportRows.length) { res.status(404).json({ message: 'Report not found' }); return; }

    const report    = reportRows[0];
    const patientId = report.patient_id;

    // Verify the doctor has accepted personal_reports access for this patient
    const { rows: accessRows } = await queryAs(actor(req),
      `SELECT status FROM data_access_requests
       WHERE doctor_id = $1 AND patient_id = $2 AND access_type = 'personal_reports' AND status = 'accepted'
       LIMIT 1`,
      [doctorId, patientId]
    );
    if (!accessRows.length) { res.status(403).json({ message: 'Access not granted for this patient\'s personal reports' }); return; }

    await sendStoredFile(res, PATIENT_REPORTS_DIR, report.file_path, {
      contentType: report.file_mimetype || 'application/octet-stream',
      inlineFilename: encodeURIComponent(report.file_original_name),
    });
  } catch (err) { next(err); }
};

export { create, getAll, getOne, serveFile, serveFileForDoctor, remove };
