// DB-01 diagnostic (03-database.md: "Version and tuned settings" — CANNOT
// VERIFY from the repo). Read-only: prints the connected database's actual
// Postgres version and the settings that matter for this app's workload, so
// someone with production access can see what's really running without
// having to hand-type a dozen SHOW commands.
//
// Run:  npx tsx server/scripts/checkDbVersionSettings.ts
// Or (after build):  node dist/scripts/checkDbVersionSettings.js
import 'dotenv/config';
import { pool } from '../config/db';

const SETTINGS = [
  'server_version',
  'max_connections',
  'shared_buffers',
  'effective_cache_size',
  'work_mem',
  'maintenance_work_mem',
  'wal_buffers',
  'random_page_cost',
  'statement_timeout',
  'idle_in_transaction_session_timeout',
  'lock_timeout',
  'autovacuum',
];

const run = async (): Promise<void> => {
  const { rows: versionRows } = await pool.query('SELECT version()');
  console.log('--- version() ---');
  console.log(versionRows[0].version);

  console.log('\n--- key settings (SHOW) ---');
  const { rows: settingRows } = await pool.query(
    `SELECT name, setting, unit FROM pg_settings WHERE name = ANY($1::text[]) ORDER BY name`,
    [SETTINGS]
  );
  for (const row of settingRows) {
    console.log(`${row.name.padEnd(38)} ${row.setting}${row.unit ? ' ' + row.unit : ''}`);
  }
  const missing = SETTINGS.filter(s => !settingRows.some(r => r.name === s));
  if (missing.length) console.log(`(not reported by this Postgres: ${missing.join(', ')})`);

  console.log('\n--- current connection usage vs max_connections ---');
  const { rows: connRows } = await pool.query(
    `SELECT COUNT(*)::int AS current_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
     FROM pg_stat_activity`
  );
  console.log(connRows[0]);

  console.log(`
Notes for whoever reads this output (not asserted by the script, since it
doesn't know the instance's actual RAM/CPU):
  - shared_buffers is conventionally ~25% of instance RAM; effective_cache_size
    ~50-75%. Compare the values above against the actual instance size.
  - max_connections here, times the number of running server instances
    (DB_POOL_MAX in server/.env.example), plus headroom for migrations/psql/
    seed scripts, must stay under max_connections above (DB-04).
  - statement_timeout / idle_in_transaction_session_timeout / lock_timeout
    shown above are this SESSION's (set by server/config/db.ts's \`options\`
    string, DB-07) — they reflect the app's own config, not necessarily a
    server-wide default for every other connection to this database.
`);
};

run()
  .catch(err => {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
