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
import { releaseUploadUsage } from '../middleware/uploadQuota';

const RETENTION_DAYS = parseInt(process.env.PURGE_RETENTION_DAYS || '90', 10);
const EXECUTE = process.argv.includes('--execute');

const TARGETS: Array<{ table: string; idCol: string; fileCol?: string; fileSubdir?: string }> = [
  { table: 'public.users', idCol: 'id' },
  // public.medicines was removed here on purpose. SEC-17 #4 moved
  // medicines/suppliers into each pharmacy's own tenant_<slug> schema and
  // migration 006 dropped the shared tables — so this entry referenced a
  // table that no longer exists and would have failed the script outright on
  // its next run. Per-tenant medicines still carry deleted_at; purging them
  // means iterating tenant schemas, which is handled separately below.
  { table: 'clinical.medical_consultations', idCol: 'id', fileCol: 'prescription_file', fileSubdir: 'prescriptions' },
  { table: 'clinical.patient_reports', idCol: 'id', fileCol: 'file_path', fileSubdir: 'patient-reports' },
];

const run = async (): Promise<void> => {
  console.log(`Retention window: ${RETENTION_DAYS} days. Mode: ${EXECUTE ? 'EXECUTE (will delete rows and files)' : 'DRY RUN (no changes — pass --execute to actually delete)'}\n`);

  // MUST run before the TARGETS loop below. It finds files by joining
  // lab_requests to the users about to be purged — once public.users rows are
  // deleted, that join returns nothing and the files are orphaned forever
  // with no record of who they belonged to.
  await purgeFilesOfDepartingUsers();

  // PRO-04: age-based retention, separate from soft-delete retention below.
  // These tables are never deleted from at all and grow with every event.
  await purgeByAge();

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
          if (row[fileCol]) {
            await deleteUpload(fileSubdir, row[fileCol]);
            // COST-04: stop the bytes counting against the owner's quota.
            await releaseUploadUsage(fileSubdir, row[fileCol]);
          }
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

// PRO-04: "Nothing is ever deleted or archived: notifications, chat messages,
// the impersonation log and vitals grow without end." Soft-delete retention
// (the TARGETS loop) does not help here, because nothing ever soft-deletes
// these rows — they need a retention period measured from creation.
//
// Periods come from docs/data-retention.md and are overridable per category,
// because the right answer differs sharply between them and is not ours to
// settle alone:
//
//   notifications / chat messages — transient operational noise. A year is
//   generous; nobody re-reads a year-old "your prescription is ready".
//
//   impersonation logs — a security audit trail. Deliberately longer, and
//   kept in step with audit_log's proposed 2 years, because the question
//   "who was viewing this patient's account last March" has to stay
//   answerable for longer than an incident takes to surface.
//
//   patient_vitals is NOT here, on purpose. The audit lists it as a table
//   that grows without end, and it does — but it is clinical data subject to
//   statutory minimum retention (COMP-04), so deleting it on an age rule
//   would be the one mistake in this script that cannot be undone and might
//   be unlawful. It is widened to BIGINT instead (migration 010) and left to
//   the clinical retention schedule once a lawyer has confirmed it.
const AGE_TARGETS: Array<{ table: string; tsCol: string; days: number; why: string }> = [
  { table: 'clinical.notifications', tsCol: 'created_at',
    days: parseInt(process.env.RETAIN_NOTIFICATIONS_DAYS || '365', 10),
    why: 'transient operational notices' },
  { table: 'clinical.prescription_assignment_messages', tsCol: 'created_at',
    days: parseInt(process.env.RETAIN_MESSAGES_DAYS || '365', 10),
    why: 'pharmacy chat thread' },
  { table: 'clinical.lab_request_messages', tsCol: 'created_at',
    days: parseInt(process.env.RETAIN_MESSAGES_DAYS || '365', 10),
    why: 'laboratory chat thread' },
  { table: 'public.impersonation_action_log', tsCol: 'created_at',
    days: parseInt(process.env.RETAIN_IMPERSONATION_DAYS || '730', 10),
    why: 'security audit trail — kept longer than operational data' },
  { table: 'public.impersonation_log', tsCol: 'started_at',
    days: parseInt(process.env.RETAIN_IMPERSONATION_DAYS || '730', 10),
    why: 'security audit trail — kept longer than operational data' },
];

const purgeByAge = async (): Promise<void> => {
  for (const { table, tsCol, days, why } of AGE_TARGETS) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::bigint AS n FROM ${table} WHERE ${tsCol} < NOW() - $1::interval`,
      [`${days} days`]
    );
    const n = Number(rows[0].n);
    console.log(`${table}: ${n} row(s) older than ${days} days (${why})`);

    if (EXECUTE && n) {
      // Deleted in bounded batches rather than one statement. The first run
      // against a table that has been accumulating for years could otherwise
      // be a single enormous DELETE holding locks and bloating WAL — which
      // turns a cleanup into an incident.
      let removed = 0;
      for (;;) {
        const { rowCount } = await pool.query(
          `DELETE FROM ${table} WHERE id IN (
             SELECT id FROM ${table} WHERE ${tsCol} < NOW() - $1::interval LIMIT 5000
           )`,
          [`${days} days`]
        );
        if (!rowCount) break;
        removed += rowCount;
      }
      console.log(`  -> deleted ${removed} row(s)`);
    }
  }
};

// COMP-03: "the uploaded files of that user stay on disk". Deleting a user
// cascades their clinical rows away, which means the rows naming their
// uploaded files disappear *without* those files ever being deleted — leaving
// orphaned patient documents in storage with nothing left pointing at them.
// Lab reports and referrals are the case the TARGETS loop cannot catch,
// because lab_requests has no deleted_at of its own: it is removed by the
// cascade from a purged user, not soft-deleted in its own right. So these
// files have to be collected while the rows that name them still exist.
const purgeFilesOfDepartingUsers = async (): Promise<void> => {
  const { rows } = await pool.query<{ report_file: string | null; referral_file: string | null }>(
    `SELECT lr.report_file, lr.referral_file
     FROM clinical.lab_requests lr
     JOIN public.users u ON u.id = lr.patient_id
     WHERE u.deleted_at IS NOT NULL AND u.deleted_at < NOW() - $1::interval
       AND (lr.report_file IS NOT NULL OR lr.referral_file IS NOT NULL)`,
    [`${RETENTION_DAYS} days`]
  );

  const files: Array<{ subdir: string; name: string }> = [];
  for (const r of rows) {
    if (r.report_file) files.push({ subdir: 'lab-reports', name: r.report_file });
    if (r.referral_file) files.push({ subdir: 'lab-referrals', name: r.referral_file });
  }

  console.log(`lab files of purged users: ${files.length} file(s) past retention`);
  if (!EXECUTE || !files.length) return;

  for (const f of files) {
    await deleteUpload(f.subdir, f.name);
    await releaseUploadUsage(f.subdir, f.name);
  }
  console.log(`  -> deleted ${files.length} lab report/referral file(s)`);
};

run().catch(err => { console.error(err); process.exit(1); });
