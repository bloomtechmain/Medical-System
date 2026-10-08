// PRO-25 ("Add deleted_at... and remove for real after a set period"): the
// soft-delete columns added for users/medicines/medical_consultations/
// patient_reports are only the first half of that fix — something still has
// to remove rows for real once the retention window has passed, or storage
// just grows forever with "deleted" data instead of none. There is no
// scheduled-job runner in this app (see PRO-20 — N/A, no queue/cron exists),
// so this is a plain script for ops to run on a schedule of their choosing
// (a Railway cron job, a manual monthly run, whatever fits), the same way
// the DB-01/DB-11 diagnostic scripts are run on demand rather than
// automatically. Deliberately does NOT delete the on-disk files for purged
// consultations/reports — do that by hand after confirming the retention
// policy, since this script has no record of which rows it purged once done.
//
// Run:  PURGE_RETENTION_DAYS=90 npx tsx server/scripts/purgeSoftDeleted.ts
// Or (after build):  node dist/scripts/purgeSoftDeleted.js
// Defaults to a dry run — pass --execute to actually delete.
import 'dotenv/config';
import { pool } from '../config/db';

const RETENTION_DAYS = parseInt(process.env.PURGE_RETENTION_DAYS || '90', 10);
const EXECUTE = process.argv.includes('--execute');

const TARGETS: Array<{ table: string; idCol: string }> = [
  { table: 'public.users', idCol: 'id' },
  { table: 'public.medicines', idCol: 'id' },
  { table: 'clinical.medical_consultations', idCol: 'id' },
  { table: 'clinical.patient_reports', idCol: 'id' },
];

const run = async (): Promise<void> => {
  console.log(`Retention window: ${RETENTION_DAYS} days. Mode: ${EXECUTE ? 'EXECUTE (will delete rows)' : 'DRY RUN (no changes — pass --execute to actually delete)'}\n`);

  for (const { table, idCol } of TARGETS) {
    const { rows: candidates } = await pool.query(
      `SELECT ${idCol} FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - $1::interval`,
      [`${RETENTION_DAYS} days`]
    );
    console.log(`${table}: ${candidates.length} row(s) past retention`);

    if (EXECUTE && candidates.length) {
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - $1::interval`,
        [`${RETENTION_DAYS} days`]
      );
      console.log(`  -> deleted ${rowCount} row(s)`);
    }
  }

  console.log('\nDone. Remember: on-disk files for purged consultations/patient reports are not removed by this script.');
  await pool.end();
};

run().catch(err => { console.error(err); process.exit(1); });
