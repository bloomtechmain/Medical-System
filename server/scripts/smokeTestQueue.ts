// PERF-06 smoke test: nothing else in CI actually calls boss.start() as
// corehealth_app (the non-superuser role the running server connects as) —
// the unit tests mock pg-boss entirely, and the migration step that grants
// corehealth_app rights on the `pgboss` schema (003_job_queue_schema.sql)
// runs as the migrator role, which has no trouble with permissions anyway.
// This is the one thing that actually proves the grant works: pg-boss's own
// schema migration (CREATE TABLE inside `pgboss`, on first start()) must
// succeed under corehealth_app's more limited privileges, or the real app
// would fail the same way in production the first time it boots.
//
// Run:  npx tsx server/scripts/smokeTestQueue.ts
import 'dotenv/config';
import { startQueue, stopQueue, boss } from '../queue/boss';

const run = async (): Promise<void> => {
  await startQueue();
  await boss.createQueue('smoke-test', { retryLimit: 0 });
  const id = await boss.send('smoke-test', { ok: true });
  console.log(`pg-boss started and accepted a job under its own schema permissions (job id: ${id}).`);
  await boss.deleteQueue('smoke-test');
  await stopQueue();
};

run().catch(err => {
  console.error('[smokeTestQueue] FAILED —', err.message);
  process.exit(1);
});
