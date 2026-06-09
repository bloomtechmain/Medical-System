/**
 * Creates the Medical_System_tenant database and applies
 * corehealth_multitenant.sql + corehealth_seed.sql.
 *
 * Run once:  npx tsx server/scripts/createTenantDb.ts
 */
import 'dotenv/config';
import path from 'path';
import fs   from 'fs';
import { Client } from 'pg';

const HOST     = process.env.DB_HOST     || 'localhost';
const PORT     = parseInt(process.env.DB_PORT || '5432');
const USER     = process.env.DB_USER     || 'postgres';
const PASSWORD = process.env.DB_PASSWORD || '';
const NEW_DB   = 'Medical_System_tenant';

async function run(): Promise<void> {
  // ── Step 1: create the database (connect to postgres first) ────────────
  const admin = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: 'postgres' });
  await admin.connect();

  const { rows } = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [NEW_DB]
  );

  if (rows.length) {
    console.log(`Database "${NEW_DB}" already exists — skipping creation.`);
  } else {
    await admin.query(`CREATE DATABASE "${NEW_DB}"`);
    console.log(`Database "${NEW_DB}" created.`);
  }
  await admin.end();

  // ── Step 2: connect to the new database ────────────────────────────────
  const db = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: NEW_DB });
  await db.connect();
  console.log(`Connected to "${NEW_DB}".`);

  // ── Step 3: apply schema file ──────────────────────────────────────────
  const schemaPath = path.join(__dirname, '../../corehealth_multitenant.sql');
  const schemaSql  = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying corehealth_multitenant.sql …');
  try {
    await db.query(schemaSql);
    console.log('Schema applied.');
  } catch (err: any) {
    // Some statements may already exist on re-run; log and continue
    console.error('Schema error (may be safe to ignore on re-run):', err.message);
  }

  // ── Step 4: apply seed file ────────────────────────────────────────────
  const seedPath = path.join(__dirname, '../../corehealth_seed.sql');
  const seedSql  = fs.readFileSync(seedPath, 'utf8');

  console.log('Applying corehealth_seed.sql …');
  try {
    await db.query(seedSql);
    console.log('Seed data applied.');
  } catch (err: any) {
    console.error('Seed error (duplicate data on re-run is normal):', err.message);
  }

  await db.end();
  console.log('\nDone. New database is ready.');
  console.log(`\nUpdate your .env:\n  DB_NAME=Medical_System_tenant\n`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
