import { pool } from './db';
import { logger } from './logger';

// Guards against the failure this was written to fix: a database that has not
// run the migrations the running code depends on.
//
// The symptom was much worse than the cause. `login` reads
// `user.email_verified_at` from `SELECT * FROM users`. On a database without
// migration 011 that property is simply `undefined` — not an error — so the
// unverified-account branch fired for *every* user, and every login on the
// system was refused with "Please confirm your email address", with no way
// out through the UI and nothing in the logs pointing at the real cause.
//
// The same shape of bug is available to any future column: a missing column
// reads as a falsy value rather than throwing, so "the migration did not run"
// silently becomes "the feature says no". That is the whole reason this file
// exists — not to check one column, but to make that class of mistake loud.
//
// Fails fast and exits, matching how a missing environment variable is
// already handled (ARCH-04). A server that refuses to start saying "run your
// migrations" is far kinder than one that starts and locks everyone out.
interface Requirement {
  // Human-readable, used in the error message.
  what: string;
  // The migration that introduces it, so the message says what to run.
  migration: string;
  sql: string;
  params: string[];
}

const COLUMN_SQL = `SELECT 1 FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`;
const TABLE_SQL = `SELECT 1 FROM information_schema.tables
                   WHERE table_schema = $1 AND table_name = $2`;

const column = (schema: string, table: string, col: string, migration: string): Requirement => ({
  what: `column ${schema}.${table}.${col}`,
  migration,
  sql: COLUMN_SQL,
  params: [schema, table, col],
});

const table = (schema: string, name: string, migration: string): Requirement => ({
  what: `table ${schema}.${name}`,
  migration,
  sql: TABLE_SQL,
  params: [schema, name],
});

// Only things the application reads or writes unconditionally on a normal
// request path. Deliberately not an exhaustive schema diff — this is a
// tripwire for "migrations were not run", not a substitute for the migration
// history table.
const REQUIREMENTS: Requirement[] = [
  // 002 — soft delete. Every user/medicine read filters on these.
  column('public', 'users', 'deleted_at', '002_production_readiness_fixes'),
  table('public', 'idempotency_keys', '002_production_readiness_fixes'),

  // 007 — audit log. Written on every login, success or failure.
  table('public', 'audit_log', '007_audit_log'),

  // 008 — terms acceptance. Read by /auth/me on every session.
  column('public', 'users', 'accepted_terms_version', '008_accepted_terms'),

  // 009 — upload accounting. Read before every upload.
  table('public', 'upload_usage', '009_upload_usage'),

  // 011 — email verification. THE one that caused the silent lockout.
  column('public', 'users', 'email_verified_at', '011_email_verification'),
  table('public', 'email_verification_tokens', '011_email_verification'),

  // 014 — subscription packages. Read on every gated professional request
  // and by /auth/me.
  table('public', 'plans', '014_subscription_plans'),
  column('public', 'users', 'plan_id', '014_subscription_plans'),
  column('public', 'organizations', 'plan_id', '014_subscription_plans'),
];

const verifySchema = async (): Promise<void> => {
  const missing: Requirement[] = [];

  for (const req of REQUIREMENTS) {
    const { rows } = await pool.query(req.sql, req.params);
    if (!rows.length) missing.push(req);
  }

  if (!missing.length) {
    logger.info({ checked: REQUIREMENTS.length }, 'Database schema check passed');
    return;
  }

  const byMigration = new Map<string, string[]>();
  for (const m of missing) {
    byMigration.set(m.migration, [...(byMigration.get(m.migration) ?? []), m.what]);
  }

  // console.error as well as the logger: this has to be readable by someone
  // who is not set up to read JSON logs, because the person hitting it is
  // usually a developer whose database is behind.
  console.error('\n=============================================================');
  console.error(' DATABASE SCHEMA IS BEHIND THE CODE — refusing to start.');
  console.error('=============================================================');
  console.error('\nMissing, grouped by the migration that adds it:\n');
  for (const [migration, items] of byMigration) {
    console.error(`  ${migration}`);
    for (const item of items) console.error(`      - ${item}`);
  }
  console.error('\nWhy this is fatal rather than a warning: a missing column reads');
  console.error('as a NULL/undefined value instead of raising an error, so the app');
  console.error('would start and then behave as though every account were');
  console.error('unverified — refusing every login with no useful message.');
  console.error('\nTo fix:');
  console.error('  cd server && npm run db:migrate');
  console.error('\nIf this database was built by hand or from corehealth_database.sql');
  console.error('and has never run node-pg-migrate, read this FIRST — migration 001');
  console.error('is not idempotent and will fail against an existing schema:');
  console.error('  server/migrations/BASELINE.md\n');

  logger.fatal(
    { missing: missing.map(m => m.what), migrations: [...byMigration.keys()] },
    'Database schema is behind the code — refusing to start'
  );

  process.exit(1);
};

export { verifySchema, REQUIREMENTS };
