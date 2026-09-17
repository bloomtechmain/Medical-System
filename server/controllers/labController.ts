import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';
import { extractVitalsFromText, extractTextFromPDF } from '../utils/labVitalsParser';
import { saveVitalsFromLab } from './patientVitalsController';

// lab_requests lives in the `clinical` schema behind row-level security —
// every query against it must carry the acting user's identity. See
// config/db.ts (queryAs) for why plain pool.query() isn't enough.
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

/** Run OCR on an image file; skip PDFs (handled by pdfjs separately). */
const runOCROnLabFile = async (filePath: string): Promise<string> => {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'].includes(ext)) return '';
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    return text || '';
  } catch { return ''; }
};

/** Extract text from any file: pdfjs for PDFs, OCR for images. */
const extractReportText = async (filePath: string): Promise<string> => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractTextFromPDF(filePath);
  return runOCROnLabFile(filePath);
};

const labName = async (labId: number): Promise<string> => {
  const { rows } = await pool.query(
    `SELECT u.name, p.lab_name FROM users u
     LEFT JOIN laboratory_profiles p ON p.user_id = u.id
     WHERE u.id = $1`, [labId]
  );
  return rows[0]?.lab_name || rows[0]?.name || 'Laboratory';
};

const userName = async (uid: number): Promise<string> =>
  (await pool.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'User';

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      patient_id, laboratory_id, consultation_id, test_description, notes,
      report_type, scheduled_at,
    } = req.body;
    const isDoctor  = req.user.role === 'doctor';
    const isPatient = req.user.role === 'patient';

    if (!laboratory_id) { res.status(400).json({ message: 'Laboratory selection is required' }); return; }

    let doctorId  = isDoctor ? req.user.id : null;
    const patientId = isDoctor ? patient_id  : req.user.id;
    let testDesc  = test_description;

    if (isPatient && consultation_id) {
      const { rows: [cons] } = await queryAs(actor(req),
        'SELECT doctor_id, lab_tests_requested FROM medical_consultations WHERE id=$1 AND patient_id=$2',
        [consultation_id, patientId]
      );
      if (!cons) { res.status(404).json({ message: 'Consultation not found' }); return; }
      doctorId = cons.doctor_id;
      if (!testDesc) testDesc = cons.lab_tests_requested;
    }

    if (!patientId) { res.status(400).json({ message: 'Patient is required' }); return; }
    if (!testDesc)  { res.status(400).json({ message: 'Test description is required' }); return; }

    if (consultation_id && isPatient) {
      const { rows: dup } = await queryAs(actor(req),
        'SELECT id FROM lab_requests WHERE consultation_id=$1 AND patient_id=$2',
        [consultation_id, patientId]
      );
      if (dup.length) { res.status(409).json({ message: 'Lab request already sent for this consultation' }); return; }
    }

    const { rows: [request] } = await queryAs(actor(req), `
      INSERT INTO lab_requests
        (doctor_id, patient_id, laboratory_id, consultation_id, test_description, notes,
         report_type, scheduled_at, referral_file, referral_mimetype)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [doctorId, patientId, laboratory_id, consultation_id || null, testDesc, notes || null,
        report_type || null, scheduled_at || null,
        req.file?.filename || null, req.file?.mimetype || null]);

    const lName  = await labName(laboratory_id);
    const ptName = await userName(patientId);

    const senderDesc = isDoctor ? `Dr. ${await userName(doctorId!)}` : ptName;
    await sendNotification(
      laboratory_id,
      'lab_request_assigned',
      'New Lab Test Request',
      `${senderDesc} has requested lab tests for patient ${ptName}. Please process and upload the report.`,
      { lab_request_id: request.id }
    );

    if (isPatient && doctorId) {
      await sendNotification(
        doctorId,
        'lab_request_sent',
        'Patient Sent Lab Request',
        `${ptName} has forwarded your prescribed lab tests to ${lName}.`,
        { lab_request_id: request.id }
      );
    }

    res.status(201).json(request);
  } catch (err) { next(err); }
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    const condMap: Record<string, string> = {
      doctor:     'lr.doctor_id     = $1',
      patient:    'lr.patient_id    = $1',
      laboratory: 'lr.laboratory_id = $1',
    };
    const cond = condMap[role];
    if (!cond) { res.json([]); return; }

    const { rows } = await queryAs(actor(req), `
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

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, id } = req.user;
    const condMap: Record<string, string> = {
      doctor:     'lr.doctor_id     = $2',
      patient:    'lr.patient_id    = $2',
      laboratory: 'lr.laboratory_id = $2',
    };
    const cond = condMap[role];
    if (!cond) { res.status(403).json({ message: 'Forbidden' }); return; }

    const { rows } = await queryAs(actor(req), `
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

    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/**
 * Runs after the HTTP response is sent so OCR/PDF parsing never blocks the
 * upload: extracts vitals (manual entry > PDF/OCR text > notes text) and
 * notifies the doctor and patient at the same time.
 */
const finalizeReport = (
  labId: number,
  request: { id: number; patient_id: number; doctor_id: number | null },
  reportFilename: string,
  report_notes: string | undefined,
  vitals_data: string | undefined
): void => {
  setImmediate(async () => {
    try {
      const lName  = await labName(labId);
      const ptName = await userName(request.patient_id);

      // Priority 1: manually entered values from the lab upload form
      let vitalsToSave: Record<string, number | undefined | null> = {};

      if (vitals_data) {
        try {
          const parsed = JSON.parse(vitals_data) as Record<string, number>;
          const valid  = Object.entries(parsed).filter(([, v]) => typeof v === 'number' && isFinite(v) && v > 0);
          if (valid.length > 0) {
            vitalsToSave = Object.fromEntries(valid);
            console.log(`[Vitals] ${valid.length} manual values saved for report #${request.id}`);
          }
        } catch { /* ignore bad JSON */ }
      }

      // Priority 2: PDF text extraction (pdfjs) OR image OCR (tesseract)
      if (Object.keys(vitalsToSave).length === 0) {
        const filePath   = path.join(__dirname, '../uploads/lab-reports', reportFilename);
        const reportText = await extractReportText(filePath);
        if (reportText.trim().length > 20) {
          const extracted = extractVitalsFromText(reportText);
          if (Object.keys(extracted).length > 0) {
            vitalsToSave = extracted as Record<string, number | undefined>;
            console.log(`[Vitals] ${Object.keys(extracted).length} auto-extracted values for report #${request.id}`);
          }
        }
      }

      // Priority 3: parse report_notes text
      if (Object.keys(vitalsToSave).length === 0 && report_notes) {
        const extracted = extractVitalsFromText(report_notes);
        if (Object.keys(extracted).length > 0) {
          vitalsToSave = extracted as Record<string, number | undefined>;
          console.log(`[Vitals] ${Object.keys(extracted).length} notes values for report #${request.id}`);
        }
      }

      if (Object.keys(vitalsToSave).length > 0) {
        await saveVitalsFromLab(request.patient_id, vitalsToSave, request.id);
      }

      // Notify doctor and patient at the same time
      await Promise.all([
        request.doctor_id && sendNotification(
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
    } catch (bgErr) {
      console.error('[finalizeReport]', (bgErr as Error).message);
    }
  });
};

const uploadReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { report_notes, vitals_data } = req.body as {
      report_notes?: string;
      vitals_data?: string;
    };
    const labId = req.user.id;

    const { rows: existing } = await queryAs(actor(req),
      'SELECT * FROM lab_requests WHERE id=$1 AND laboratory_id=$2',
      [req.params.id, labId]
    );
    if (!existing.length) { res.status(404).json({ message: 'Not found' }); return; }
    if (!req.file)        { res.status(400).json({ message: 'Report file is required' }); return; }

    // Delete previous file if replacing
    if (existing[0].report_file) {
      const oldPath = path.join(__dirname, '../uploads/lab-reports', existing[0].report_file);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Save the report record immediately
    const { rows: [request] } = await queryAs(actor(req), `
      UPDATE lab_requests
      SET report_file=$1, report_mimetype=$2, report_notes=$3,
          status='completed', updated_at=NOW()
      WHERE id=$4
      RETURNING *
    `, [req.file.filename, req.file.mimetype, report_notes || null, req.params.id]);

    // Respond right away — don't block on OCR
    res.json(request);

    finalizeReport(labId, request, req.file.filename, report_notes, vitals_data);
  } catch (err) { next(err); }
};

/**
 * Lab-initiated report: the lab picks a patient + a doctor directly (no
 * prior request from either) and uploads the report in one step. Creates
 * the lab_requests record already completed and notifies both parties.
 */
const createDirect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      patient_id, doctor_id, test_description, report_type, notes, report_notes, vitals_data,
      sample_id, sample_collected_at,
    } = req.body as {
      patient_id?: string; doctor_id?: string; test_description?: string; report_type?: string;
      notes?: string; report_notes?: string; vitals_data?: string;
      sample_id?: string; sample_collected_at?: string;
    };
    const labId = req.user.id;

    if (!patient_id)       { res.status(400).json({ message: 'Patient is required' }); return; }
    if (!doctor_id)        { res.status(400).json({ message: 'Doctor is required' }); return; }
    if (!test_description) { res.status(400).json({ message: 'Test description is required' }); return; }
    if (!req.file)         { res.status(400).json({ message: 'Report file is required' }); return; }

    const { rows: [request] } = await queryAs(actor(req), `
      INSERT INTO lab_requests
        (doctor_id, patient_id, laboratory_id, test_description, report_type, notes,
         report_file, report_mimetype, report_notes, status,
         sample_id, sample_collected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11)
      RETURNING *
    `, [doctor_id, patient_id, labId, test_description, report_type || null, notes || null,
        req.file.filename, req.file.mimetype, report_notes || null,
        sample_id || null, sample_collected_at || null]);

    res.status(201).json(request);

    finalizeReport(labId, request, req.file.filename, report_notes, vitals_data);
  } catch (err) { next(err); }
};

const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, sample_id, sample_collected_at } = req.body as {
      status: string; sample_id?: string; sample_collected_at?: string;
    };
    const { rows } = await queryAs(actor(req),
      `UPDATE lab_requests
       SET status=$1, updated_at=NOW(),
           sample_id           = COALESCE($2, sample_id),
           sample_collected_at = COALESCE($3, sample_collected_at)
       WHERE id=$4 AND laboratory_id=$5 RETURNING *`,
      [status, sample_id || null, sample_collected_at || null,
       req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      'SELECT report_file FROM lab_requests WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    if (rows[0].report_file) {
      const fp = path.join(__dirname, '../uploads/lab-reports', rows[0].report_file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await queryAs(actor(req), 'DELETE FROM lab_requests WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

export { create, getAll, getOne, uploadReport, createDirect, updateStatus, remove };
