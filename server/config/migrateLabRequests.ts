import 'dotenv/config';
import { pool } from './db';

const run = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_requests (
        id               SERIAL PRIMARY KEY,
        doctor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        laboratory_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consultation_id  INTEGER REFERENCES medical_consultations(id) ON DELETE SET NULL,
        test_description TEXT NOT NULL,
        notes            TEXT,
        status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','in_progress','completed')),
        report_file      VARCHAR(500),
        report_mimetype  VARCHAR(100),
        report_notes     TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query('COMMIT');
    console.log('Lab requests table created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

run();
