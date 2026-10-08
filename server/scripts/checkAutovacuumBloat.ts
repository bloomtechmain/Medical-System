// DB-11 diagnostic (03-database.md: "Autovacuum and bloat" — CANNOT VERIFY
// from the repo). Read-only: reports whether autovacuum is actually running,
// and which tables (across public, clinical, and every tenant_<slug> schema
// — pg_stat_user_tables already covers all of them) have a dead-tuple ratio
// worth a second look, from the database's own stats, no extension required.
//
// Run:  npx tsx server/scripts/checkAutovacuumBloat.ts
// Or (after build):  node dist/scripts/checkAutovacuumBloat.js
import 'dotenv/config';
import { pool } from '../config/db';

const DEAD_RATIO_FLAG = 0.2; // flag tables where >20% of rows are dead tuples

const run = async (): Promise<void> => {
  const { rows: settingRows } = await pool.query(
    `SELECT name, setting FROM pg_settings
     WHERE name IN ('autovacuum', 'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_threshold', 'autovacuum_naptime')
     ORDER BY name`
  );
  console.log('--- autovacuum settings ---');
  for (const row of settingRows) console.log(`${row.name.padEnd(32)} ${row.setting}`);
  const autovacuumOn = settingRows.find(r => r.name === 'autovacuum')?.setting === 'on';
  if (!autovacuumOn) {
    console.log('\n*** autovacuum is OFF for this connection\'s view of server settings — this is almost always wrong. ***');
  }

  console.log('\n--- per-table dead-tuple ratio (all schemas, including every tenant_<slug>) ---');
  const { rows: tableRows } = await pool.query(`
    SELECT schemaname, relname,
           n_live_tup, n_dead_tup,
           CASE WHEN n_live_tup + n_dead_tup = 0 THEN 0
                ELSE round(n_dead_tup::numeric / (n_live_tup + n_dead_tup), 3) END AS dead_ratio,
           last_vacuum, last_autovacuum, last_analyze, last_autoanalyze,
           autovacuum_count
    FROM pg_stat_user_tables
    ORDER BY dead_ratio DESC, n_dead_tup DESC
  `);

  const flagged = tableRows.filter(r => Number(r.dead_ratio) > DEAD_RATIO_FLAG);
  for (const row of tableRows) {
    const marker = Number(row.dead_ratio) > DEAD_RATIO_FLAG ? '** ' : '   ';
    console.log(
      `${marker}${row.schemaname}.${row.relname.padEnd(30)} live=${row.n_live_tup} dead=${row.n_dead_tup} ` +
      `ratio=${row.dead_ratio} last_autovacuum=${row.last_autovacuum ?? 'never'} autovacuum_count=${row.autovacuum_count}`
    );
  }

  console.log(`
${flagged.length} table(s) above a ${DEAD_RATIO_FLAG * 100}% dead-tuple ratio (marked **).
A table that has never autovacuumed (last_autovacuum = never) despite having
dead tuples, or a consistently high dead_ratio on a frequently-updated table
(sales, medical_consultations, notifications are the most written-to here),
is worth investigating — either autovacuum isn't keeping up or it's disabled
for that table (check pg_class.reloptions for a per-table override).

This uses live/dead tuple counts already tracked by Postgres — no extension
required. For an exact bloat percentage (not just a ratio) someone with
production access could additionally install pgstattuple and run
pgstattuple() on the flagged tables, but that needs CREATE EXTENSION rights
this script deliberately doesn't assume.
`);
};

run()
  .catch(err => {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
