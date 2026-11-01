import type { Job } from 'pg-boss';
import { boss, DEFAULT_QUEUE_OPTIONS } from '../boss';
import { isEnabled } from '../../config/featureFlags';
import { queryAs } from '../../config/db';
import { logger } from '../../config/logger';
import { extractVitalsFromReport } from '../../utils/labVitalsParser';
import { saveVitalsFromPatientUpload } from '../../controllers/patientVitalsController';
import { readUploadToTempFile } from '../../utils/fileStorage';
import { sendNotification } from '../../utils/notify';

const JOB_NAME = 'extract-patient-report-vitals';

interface Payload {
  patientId: number;
  patientReportId: number;
  filename: string;
}

// Report types whose files are read for vitals. A discharge summary or an
// unlabelled report often carries the same numbers as a lab report;
// imaging, prescriptions and vaccination cards do not.
export const READABLE_REPORT_TYPES = ['lab_report', 'discharge_summary', 'other'];

const setStatus = (patientId: number, reportId: number, status: 'extracted' | 'none' | 'failed', found: number, confidence: number | null) =>
  queryAs({ id: patientId, role: 'patient' },
    `UPDATE patient_reports
        SET vitals_status=$1, vitals_found=$2, vitals_confidence=$3, vitals_checked_at=NOW(), updated_at=NOW()
      WHERE id=$4 AND patient_id=$5`,
    [status, found, confidence, reportId, patientId]
  );

// PERF-06: previously ran inline via setImmediate when a patient self-
// uploaded a report tagged `lab_report`. Safe to retry — saveVitalsFromPatientUpload
// upserts keyed by patient_report_id, so re-running after a transient
// failure converges to the same result, never a duplicate.
// pg-boss hands work() a batch of jobs (one, by default, with this app's
// settings) rather than a single job — see queue/boss.ts.
const processOne = async (data: Payload): Promise<void> => {
  const { patientId, patientReportId, filename } = data;

  let result;
  try {
    const { filePath, cleanup } = await readUploadToTempFile('patient-reports', filename);
    try {
      result = await extractVitalsFromReport(filePath);
    } finally {
      cleanup();
    }
  } catch (err) {
    logger.error({ err, patientReportId }, 'Could not read uploaded report for vitals');
    await setStatus(patientId, patientReportId, 'failed', 0, null);
    throw err; // let pg-boss retry a transient storage failure
  }

  const found = Object.values(result.vitals).filter(v => v !== undefined).length;
  if (found > 0) {
    await saveVitalsFromPatientUpload(patientId, result.vitals as Record<string, number | undefined>, patientReportId);
  }
  await setStatus(patientId, patientReportId, found > 0 ? 'extracted' : 'none', found,
    result.method === 'none' ? null : Math.round(result.confidence * 100) / 100);

  // Tell the patient what happened — before this, a report that yielded
  // nothing looked exactly like one still being processed, forever.
  await sendNotification(patientId,
    found > 0 ? 'report_vitals_extracted' : 'report_vitals_none',
    found > 0 ? 'Health values updated from your report' : 'We couldn\'t read values from your report',
    found > 0
      ? `We read ${found} value${found === 1 ? '' : 's'} from your report and added them to My Health. Please check they match the report.`
      : 'The report was saved, but no test values could be read from it. A clearer photo (flat, well lit, in focus) or a PDF from the lab usually works. You can also enter the values yourself in My Health.',
    { patient_report_id: patientReportId, found });
};

const handler = (jobs: Job<Payload>[]): Promise<void[]> => Promise.all(jobs.map(j => processOne(j.data)));

const register = async (): Promise<void> => {
  await boss.createQueue(JOB_NAME, DEFAULT_QUEUE_OPTIONS);
  await boss.work<Payload>(JOB_NAME, handler);
};
// CICD-12: see extractConsultationMedicines.ts — OCR/extraction can be
// disabled with a variable change and a restart. Off means the upload still
// succeeds and the extraction is skipped.
const enqueue = (payload: Payload): Promise<string | null> =>
  isEnabled('OCR_PROCESSING') ? boss.send(JOB_NAME, payload) : Promise.resolve(null);

export { JOB_NAME, register, enqueue };
