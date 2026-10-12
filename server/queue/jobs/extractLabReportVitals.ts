import type { Job } from 'pg-boss';
import { boss, DEFAULT_QUEUE_OPTIONS } from '../boss';
import { queryAs } from '../../config/db';
import { extractVitalsFromText, extractReportText } from '../../utils/labVitalsParser';
import { saveVitalsFromLab } from '../../controllers/patientVitalsController';
import { readUploadToTempFile } from '../../utils/fileStorage';

const JOB_NAME = 'extract-lab-report-vitals';

interface Payload {
  labRequestId: number;
  laboratoryId: number;
  patientId: number;
  reportFilename: string;
  reportNotes?: string;
  vitalsData?: string;
}

// PERF-06: this is the vitals-extraction half of what was labController's
// finalizeReport — notifications were split out and now fire immediately
// from the controller (they don't depend on OCR succeeding, and unlike this
// job they must NOT run twice on a retry). Everything here IS safe to
// retry: saveVitalsFromLab / the vitals_extracted flag both upsert keyed by
// lab_request_id, so re-running this job with the same payload after a
// transient failure converges to the same result, never a duplicate.
// pg-boss hands work() a batch of jobs (one, by default, with this app's
// settings) rather than a single job — see queue/boss.ts.
const processOne = async (data: Payload): Promise<void> => {
  const { labRequestId, laboratoryId, patientId, reportFilename, reportNotes, vitalsData } = data;

  // Priority 1: manually entered values from the lab upload form
  let vitalsToSave: Record<string, number | undefined | null> = {};

  if (vitalsData) {
    try {
      const parsed = JSON.parse(vitalsData) as Record<string, number>;
      const valid = Object.entries(parsed).filter(([, v]) => typeof v === 'number' && isFinite(v) && v > 0);
      if (valid.length > 0) vitalsToSave = Object.fromEntries(valid);
    } catch { /* ignore bad JSON */ }
  }

  // Priority 2: PDF text extraction (pdfjs) OR image OCR (tesseract)
  if (Object.keys(vitalsToSave).length === 0) {
    const { filePath, cleanup } = await readUploadToTempFile('lab-reports', reportFilename);
    let reportText: string;
    try {
      reportText = await extractReportText(filePath);
    } finally {
      cleanup();
    }
    if (reportText.trim().length > 20) {
      const extracted = extractVitalsFromText(reportText);
      if (Object.keys(extracted).length > 0) vitalsToSave = extracted as Record<string, number | undefined>;
    }
  }

  // Priority 3: parse report_notes text
  if (Object.keys(vitalsToSave).length === 0 && reportNotes) {
    const extracted = extractVitalsFromText(reportNotes);
    if (Object.keys(extracted).length > 0) vitalsToSave = extracted as Record<string, number | undefined>;
  }

  if (Object.keys(vitalsToSave).length > 0) {
    await saveVitalsFromLab(patientId, vitalsToSave, labRequestId);
    await queryAs({ id: laboratoryId, role: 'laboratory' }, `UPDATE lab_requests SET vitals_extracted=true WHERE id=$1`, [labRequestId]);
  }
};

const handler = (jobs: Job<Payload>[]): Promise<void[]> => Promise.all(jobs.map(j => processOne(j.data)));

const register = async (): Promise<void> => {
  await boss.createQueue(JOB_NAME, DEFAULT_QUEUE_OPTIONS);
  await boss.work<Payload>(JOB_NAME, handler);
};
const enqueue = (payload: Payload): Promise<string | null> => boss.send(JOB_NAME, payload);

export { JOB_NAME, register, enqueue };
