import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { sendNotification } from '../utils/notify';
import { extractVitalsFromText, extractTextFromPDF } from '../utils/labVitalsParser';
import { saveVitalsFromLab } from './patientVitalsController';

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
    const { patient_id, laboratory_id, consultation_id, test_description, notes } = req.body;
    const isDoctor  = req.user.role === 'doctor';
    const isPatient = req.user.role === 'patient';

    if (!laboratory_id) { res.status(400).json({ message: 'Laboratory selection is required' }); return; }

    let doctorId  = isDoctor ? req.user.id : null;
    let patientId = isDoctor ? patient_id  : req.user.id;
    let testDesc  = test_description;

    if (isPatient && consultation_id) {
      const { rows: [cons] } = await pool.query(
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
      const { rows: dup } = await pool.query(
        'SELECT id FROM lab_requests WHERE consultation_id=$1 AND patient_id=$2',
        [consultation_id, patientId]
      );
      if (dup.length) { res.status(409).json({ message: 'Lab request already sent for this consultation' }); return; }
    }

    const { rows: [request] } = await pool.query(`
      INSERT INTO lab_requests
        (doctor_id, patient_id, laboratory_id, consultation_id, test_description, notes)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [doctorId, patientId, laboratory_id, consultation_id || null, testDesc, notes || null]);

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

    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const uploadReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { report_notes, vitals_data } = req.body as {
      report_notes?: string;
      vitals_data?: string;
    };
    const labId = req.user.id;

    const { rows: existing } = await pool.query(
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
    const { rows: [request] } = await pool.query(`
      UPDATE lab_requests
      SET report_file=$1, report_mimetype=$2, report_notes=$3,
          status='completed', updated_at=NOW()
      WHERE id=$4
      RETURNING *
    `, [req.file.filename, req.file.mimetype, report_notes || null, req.params.id]);

    // ── Respond to client right away — don't block on OCR ──────────────
    res.json(request);

    // ── Background: vitals extraction + notifications ───────────────────
    // Runs after response is sent so it never blocks the upload
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
          const filePath   = path.join(__dirname, '../uploads/lab-reports', req.file!.filename);
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

        // Notifications
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
        console.error('[uploadReport background]', (bgErr as Error).message);
      }
    });

  } catch (err) { next(err); }
};

const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE lab_requests SET status=$1, updated_at=NOW()
       WHERE id=$2 AND laboratory_id=$3 RETURNING *`,
      [status, req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT report_file FROM lab_requests WHERE id=$1 AND doctor_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Not found' }); return; }

    if (rows[0].report_file) {
      const fp = path.join(__dirname, '../uploads/lab-reports', rows[0].report_file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await pool.query('DELETE FROM lab_requests WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
};

export { create, getAll, getOne, uploadReport, updateStatus, remove };
