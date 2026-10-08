import type { Job } from 'pg-boss';
import { boss, DEFAULT_QUEUE_OPTIONS } from '../boss';
import { queryAs, RLSActor } from '../../config/db';
import { extractMedicines, runOCR } from '../../utils/ocrParser';
import { readUploadToTempFile } from '../../utils/fileStorage';

const JOB_NAME = 'extract-consultation-medicines';

interface Payload {
  consultationId: number;
  prescriptionFilename: string;
  actorId: number;
  actorRole: string;
}

// PERF-06: prescription OCR used to run synchronously inside create()/
// update(), blocking the HTTP response on tesseract — slow, uncancellable
// work with no retry and no record of failure if the process restarted
// mid-request. The consultation now saves immediately with just its
// manually-entered medicines; this job fills in the OCR-extracted ones once
// it's done (consistent with the already-async lab-report/patient-report
// vitals jobs — no separate "scanning" push notification, same as those).
//
// Idempotent by construction: always replaces this consultation's 'ocr'-
// sourced rows and overwrites ocr_text, rather than appending — a retry (or
// update() re-queuing after a second prescription replacement) converges to
// the same end state instead of duplicating rows.
const processOne = async (data: Payload): Promise<void> => {
  const { consultationId, prescriptionFilename, actorId, actorRole } = data;
  const actor: RLSActor = { id: actorId, role: actorRole };

  const { filePath, cleanup } = await readUploadToTempFile('prescriptions', prescriptionFilename);
  let ocrText: string;
  try {
    ocrText = await runOCR(filePath);
  } finally {
    cleanup();
  }
  const ocrMedicines = extractMedicines(ocrText);

  await queryAs(actor, 'DELETE FROM consultation_medicines WHERE consultation_id=$1 AND source=$2', [consultationId, 'ocr']);

  for (const med of ocrMedicines) {
    await queryAs(actor, `
      INSERT INTO consultation_medicines
        (consultation_id, medicine_name, dosage, frequency, duration, notes, source)
      VALUES ($1,$2,$3,$4,$5,$6,'ocr')
    `, [consultationId, med.medicine_name.trim(), med.dosage || null, med.frequency || null, med.duration || null, med.notes || null]);
  }

  await queryAs(actor, 'UPDATE medical_consultations SET ocr_text=$1 WHERE id=$2', [ocrText || null, consultationId]);
};

const handler = (jobs: Job<Payload>[]): Promise<void[]> => Promise.all(jobs.map(j => processOne(j.data)));

const register = async (): Promise<void> => {
  await boss.createQueue(JOB_NAME, DEFAULT_QUEUE_OPTIONS);
  await boss.work<Payload>(JOB_NAME, handler);
};
const enqueue = (payload: Payload): Promise<string | null> => boss.send(JOB_NAME, payload);

export { JOB_NAME, register, enqueue };
