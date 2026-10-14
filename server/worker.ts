import 'dotenv/config';
import http from 'http';
import { connectDB, pool } from './config/db';
import { logger } from './config/logger';
import { initErrorTracking, captureError, flushErrorTracking } from './config/errorTracking';
import { logFlagState } from './config/featureFlags';
import { verifySchema } from './config/schemaCheck';
import { startQueue, stopQueue, shouldRegisterWorkersHere, QUEUE_WORKER_MODE } from './queue/boss';
import { register as registerLabReportVitalsWorker } from './queue/jobs/extractLabReportVitals';
import { register as registerPatientReportVitalsWorker } from './queue/jobs/extractPatientReportVitals';
import { register as registerConsultationOcrWorker } from './queue/jobs/extractConsultationMedicines';

// PRO-15/PERF-06: the OCR and PDF-extraction workers ran inside the API
// process. The queue (pg-boss) already gave them retries and durability, but
// they still shared the API's CPU and — the part that actually bites — its
// memory ceiling. tesseract.js and pdfjs-dist are the memory-hungry paths in
// this codebase, so a burst of large uploads could push the API process to an
// OOM kill and take every in-flight clinical request down with it.
//
// This is the separate worker entrypoint. Same code, same jobs, same
// database; its own process, its own memory limit, its own restart. Nothing
// in queue/jobs/* changed — pg-boss does not care which process calls
// boss.work(), which is exactly why that design was chosen (see
// docs/decisions/0005-pgboss-for-background-work.md).
//
// Run it with QUEUE_WORKER_MODE=separate on BOTH processes:
//   API    → does not register workers, only enqueues
//   worker → registers workers, serves no HTTP traffic
//
// Left as 'inline' (the default) everything behaves exactly as before, so a
// single-service deployment keeps working.

const requireEnv = (names: string[]): void => {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }
};

const VALID_NODE_ENVS = ['development', 'production', 'test'];
if (!VALID_NODE_ENVS.includes(process.env.NODE_ENV || '')) {
  console.error(`NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')} (got: ${process.env.NODE_ENV || '<unset>'})`);
  process.exit(1);
}
requireEnv(process.env.DATABASE_URL ? [] : ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);

initErrorTracking();

// A worker has no HTTP traffic, but a platform health check still needs
// something to probe or it will kill the task as unhealthy. This serves
// exactly two endpoints and nothing else — deliberately not the API's router,
// so there is no chance of a worker accidentally serving clinical data.
const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || '5001', 10);

let ready = false;
let shuttingDown = false;

const healthServer = http.createServer((req, res) => {
  const send = (code: number, body: Record<string, unknown>): void => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.url === '/health') { send(200, { status: 'ok' }); return; }

  if (req.url === '/ready') {
    if (shuttingDown) { send(503, { status: 'shutting_down' }); return; }
    if (!ready) { send(503, { status: 'starting' }); return; }
    send(200, { status: 'ready' });
    return;
  }

  send(404, { message: 'Not found' });
});

const start = async (): Promise<void> => {
  await new Promise<void>(resolve => healthServer.listen(HEALTH_PORT, resolve));
  logger.info({ healthPort: HEALTH_PORT, env: process.env.NODE_ENV }, 'Queue worker starting');
  logFlagState();

  await connectDB();
  await verifySchema();
  await startQueue();

  // Refuses to run as a no-op. Starting a worker process with
  // QUEUE_WORKER_MODE left at 'inline' would sit there processing nothing
  // while the API quietly kept doing the work — a misconfiguration that
  // looks like success. Fail loudly instead.
  if (!shouldRegisterWorkersHere('worker')) {
    logger.fatal(
      { queueWorkerMode: QUEUE_WORKER_MODE },
      'Worker started but QUEUE_WORKER_MODE is not "separate" — it would process nothing. Set QUEUE_WORKER_MODE=separate on both the API and this process.'
    );
    process.exit(1);
  }

  await registerLabReportVitalsWorker();
  await registerPatientReportVitalsWorker();
  await registerConsultationOcrWorker();

  ready = true;
  logger.info('Queue worker ready — OCR and extraction jobs are being processed here');
};

// Same ordered-drain discipline as the API (INF-04): stop taking new work,
// let in-flight jobs finish, then release the database. A job killed halfway
// is retried by pg-boss, but finishing cleanly is better than relying on that.
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    logger.warn({ signal }, 'Worker shutdown already in progress — ignoring repeat signal');
    return;
  }
  shuttingDown = true;
  logger.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Queue worker shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Worker shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Longer grace than the API's 10s on purpose: an OCR job in progress can
    // legitimately take tens of seconds, and letting it finish is cheaper
    // than the retry.
    await stopQueue();
    logger.info('Queue stopped, in-flight jobs finished');
    await new Promise<void>(resolve => healthServer.close(() => resolve()));
    await pool.end();
    await flushErrorTracking();
    clearTimeout(forceExit);
    logger.info('Queue worker shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    captureError(err, { phase: 'worker_shutdown', signal });
    await flushErrorTracking();
    clearTimeout(forceExit);
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection in worker — shutting down');
  captureError(reason, { fatal: true, kind: 'unhandledRejection', process: 'worker' });
  void flushErrorTracking().then(() => process.exit(1));
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception in worker — shutting down');
  captureError(err, { fatal: true, kind: 'uncaughtException', process: 'worker' });
  void flushErrorTracking().then(() => process.exit(1));
});

start().catch(err => {
  logger.fatal({ err }, 'Queue worker failed to start');
  captureError(err, { phase: 'worker_start' });
  void flushErrorTracking().then(() => process.exit(1));
});
