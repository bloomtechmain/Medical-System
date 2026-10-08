import { PgBoss } from 'pg-boss';
import { dbSsl } from '../config/db';

// PERF-06: OCR (tesseract.js) and PDF text extraction used to run inside
// the API process itself (via setImmediate — not a queue: no retry, no
// record of failure, and the work is simply lost if the process restarts
// mid-job). pg-boss runs on the existing PostgreSQL database — no new
// infrastructure service — and gives real retries plus a queryable failed
// ("dead-letter") state instead.
//
// Needs its own connection, separate from the app's query pool (config/db.ts),
// because pg-boss manages its own internal schema/tables and locking.
// `corehealth_app` needs CREATE on the `pgboss` schema for this to work —
// see migrations/003_job_queue_schema.sql.
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: dbSsl }
  : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: dbSsl,
    };

const boss = new PgBoss({
  ...connectionConfig,
  schema: 'pgboss',
});

// Retry/retention settings are per-queue in this version of pg-boss, not
// constructor-level — every job queue this app defines shares the same
// policy via this one options object (see queue/jobs/*.ts's createQueue calls).
const DEFAULT_QUEUE_OPTIONS = { retryLimit: 3, retryDelay: 30, retryBackoff: true };

boss.on('error', (err) => console.error('[pg-boss]', err.message));

let started = false;

const startQueue = async (): Promise<void> => {
  if (started) return;
  await boss.start();
  started = true;
};

const stopQueue = async (): Promise<void> => {
  if (!started) return;
  await boss.stop({ graceful: true, timeout: 10_000 });
  started = false;
};

export { boss, startQueue, stopQueue, DEFAULT_QUEUE_OPTIONS };
