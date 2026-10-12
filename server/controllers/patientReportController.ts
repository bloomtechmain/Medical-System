import { Request, Response, NextFunction } from 'express';
import { queryAs, RLSActor } from '../config/db';
import { streamUploadToResponse } from '../utils/fileStorage';
import { parsePaging } from '../utils/pagination';
import { enqueue as enqueuePatientReportVitals } from '../queue/jobs/extractPatientReportVitals';

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
      req.file.filename, req.file.mimetype, req.file.originalname,
    ]);

    // ── Respond right away — don't block the upload on OCR/PDF extraction ──
    res.status(201).json(report);

    // PERF-06: queue vitals extraction instead of running OCR/PDF parsing
    // inline (setImmediate — no retry, lost on restart). See
    // queue/jobs/extractPatientReportVitals.ts.
    if (report_type === 'lab_report') {
      await enqueuePatientReportVitals({
        patientId: req.user.id,
        patientReportId: report.id,
        filename: req.file.filename,
      });
    }
  } catch (err) { next(err); }
};

// PERF-04: never paginated. See utils/pagination.ts for why the default is
// generous rather than "a page."
const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit, offset } = parsePaging(req.query as Record<string, string | undefined>);
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE patient_id=$1 AND deleted_at IS NULL ORDER BY issued_date DESC, created_at DESC LIMIT $2 OFFSET $3',
      [req.user.id, limit, offset]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const serveFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT * FROM patient_reports WHERE id=$1 AND patient_id=$2 AND deleted_at IS NULL',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    const report = rows[0];
    const found = await streamUploadToResponse(res, 'patient-reports', report.file_path, {
      mimetype: report.file_mimetype || 'application/octet-stream',
      originalName: report.file_original_name,
    });
    if (!found) res.status(404).json({ message: 'File not found' });
  } catch (err) { next(err); }
};

// PRO-25: patient reports were hard-deleted (file removed immediately with
// them). Soft-delete instead — the file is kept until the retention-window
// purge script (server/scripts/purgeSoftDeleted.ts) removes both for real.
const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      `UPDATE patient_reports SET deleted_at = NOW()
       WHERE id=$1 AND patient_id=$2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
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
      'SELECT * FROM patient_reports WHERE id = $1 AND deleted_at IS NULL',
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

    const found = await streamUploadToResponse(res, 'patient-reports', report.file_path, {
      mimetype: report.file_mimetype || 'application/octet-stream',
      originalName: report.file_original_name,
    });
    if (!found) res.status(404).json({ message: 'File not found' });
  } catch (err) { next(err); }
};

export { create, getAll, getOne, serveFile, serveFileForDoctor, remove };
