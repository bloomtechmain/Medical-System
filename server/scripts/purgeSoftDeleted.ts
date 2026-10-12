// PRO-25 ("Add deleted_at... and remove for real after a set period"): the
// soft-delete columns added for users/medicines/medical_consultations/
// patient_reports are only the first half of that fix — something still has
// to remove rows for real once the retention window has passed, or storage
// just grows forever with "deleted" data instead of none. There is no
// scheduled-job runner in this app (see PRO-20 — N/A, no queue/cron exists),
// so this is a plain script for ops to run on a schedule of their choosing
// (a Railway cron job, a manual monthly run, whatever fits), the same way
// the DB-01/DB-11 diagnostic scripts are run on demand rather than
// automatically. Also removes each purged consultation's/report's uploaded
// file (local disk or S3, via utils/fileStorage.ts, same backend the app
// itself is configured to use) — do this before the row is gone, since
// there's no record of which file belonged to which row afterwards.
//
// Run:  PURGE_RETENTION_DAYS=90 npx tsx server/scripts/purgeSoftDeleted.ts
// Or (after build):  node dist/scripts/purgeSoftDeleted.js
// Defaults to a dry run — pass --execute to actually delete.
import 'dotenv/config';
import { pool } from '../config/db';
import { deleteUpload } from '../utils/fileStorage';

const RETENTION_DAYS = parseInt(process.env.PURGE_RETENTION_DAYS || '90', 10);
const EXECUTE = process.argv.includes('--execute');

const TARGETS: Array<{ table: string; idCol: string; fileCol?: string; fileSubdir?: string }> = [
  { table: 'public.users', idCol: 'id' },
  { table: 'public.medicines', idCol: 'id' },
  { table: 'clinical.medical_consultations', idCol: 'id', fileCol: 'prescription_file', fileSubdir: 'prescriptions' },
  { table: 'clinical.patient_reports', idCol: 'id', fileCol: 'file_path', fileSubdir: 'patient-reports' },
];

const run = async (): Promise<void> => {
  console.log(`Retention window: ${RETENTION_DAYS} days. Mode: ${EXECUTE ? 'EXECUTE (will delete rows and files)' : 'DRY RUN (no changes — pass --execute to actually delete)'}\n`);

  for (const { table, idCol, fileCol, fileSubdir } of TARGETS) {
    const selectCols = fileCol ? `${idCol}, ${fileCol}` : idCol;
    const { rows: candidates } = await pool.query(
      `SELECT ${selectCols} FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - $1::interval`,
      [`${RETENTION_DAYS} days`]
    );
    console.log(`${table}: ${candidates.length} row(s) past retention`);

    if (EXECUTE && candidates.length) {
      if (fileCol && fileSubdir) {
        for (const row of candidates) {
          if (row[fileCol]) await deleteUpload(fileSubdir, row[fileCol]);
        }
      }
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - $1::interval`,
        [`${RETENTION_DAYS} days`]
      );
      console.log(`  -> deleted ${rowCount} row(s)${fileCol ? ' and their files' : ''}`);
    }
  }

  console.log('\nDone.');
  await pool.end();
};

run().catch(err => { console.error(err); process.exit(1); });
