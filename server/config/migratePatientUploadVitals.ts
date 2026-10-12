// LEGACY — superseded by server/migrations/ (node-pg-migrate). Kept only for
// BASELINE.md's production adoption history; do not run this again once
// that procedure is complete, and do not add new scripts in this style.

import 'dotenv/config';
import { pool } from './db';

const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE clinical.patient_vitals
        ADD COLUMN IF NOT EXISTS patient_report_id INTEGER;
    `);

    await client.query(`
      ALTER TABLE clinical.patient_vitals
        DROP CONSTRAINT IF EXISTS patient_vitals_source_check;
    `);

    await client.query(`
      ALTER TABLE clinical.patient_vitals
        ADD CONSTRAINT patient_vitals_source_check
        CHECK (source IN ('manual','lab_report','patient_upload'));
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pv_patient_rept
        ON clinical.patient_vitals(patient_report_id);
    `);

    await client.query('COMMIT');
    console.log('patient_upload source + patient_report_id added to patient_vitals successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', (err as Error).message);
    process.exitCode = 1;
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
