import type { Job } from 'pg-boss';
import { boss, DEFAULT_QUEUE_OPTIONS } from '../boss';
import { extractVitalsFromText, extractReportText } from '../../utils/labVitalsParser';
import { saveVitalsFromPatientUpload } from '../../controllers/patientVitalsController';
import { readUploadToTempFile } from '../../utils/fileStorage';

const JOB_NAME = 'extract-patient-report-vitals';

interface Payload {
  patientId: number;
  patientReportId: number;
  filename: string;
}

// PERF-06: previously ran inline via setImmediate when a patient self-
// uploaded a report tagged `lab_report`. Safe to retry — saveVitalsFromPatientUpload
// upserts keyed by patient_report_id, so re-running after a transient
// failure converges to the same result, never a duplicate.
// pg-boss hands work() a batch of jobs (one, by default, with this app's
// settings) rather than a single job — see queue/boss.ts.
const processOne = async (data: Payload): Promise<void> => {
  const { patientId, patientReportId, filename } = data;

  const { filePath, cleanup } = await readUploadToTempFile('patient-reports', filename);
  let reportText: string;
  try {
    reportText = await extractReportText(filePath);
  } finally {
    cleanup();
  }

  if (reportText.trim().length > 20) {
    const extracted = extractVitalsFromText(reportText);
    if (Object.keys(extracted).length > 0) {
      await saveVitalsFromPatientUpload(patientId, extracted as Record<string, number | undefined>, patientReportId);
    }
  }
};

const handler = (jobs: Job<Payload>[]): Promise<void[]> => Promise.all(jobs.map(j => processOne(j.data)));

const register = async (): Promise<void> => {
  await boss.createQueue(JOB_NAME, DEFAULT_QUEUE_OPTIONS);
  await boss.work<Payload>(JOB_NAME, handler);
};
const enqueue = (payload: Payload): Promise<string | null> => boss.send(JOB_NAME, payload);

export { JOB_NAME, register, enqueue };
