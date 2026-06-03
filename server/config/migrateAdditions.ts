import 'dotenv/config';
import { pool } from './db';

const run = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE medical_consultations ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE medical_consultations ADD COLUMN IF NOT EXISTS assigned_pharmacist_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE medical_consultations ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','dispensed','completed'))`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       VARCHAR(60) NOT NULL,
        title      VARCHAR(200) NOT NULL,
        message    TEXT NOT NULL,
        data       JSONB DEFAULT '{}',
        is_read    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('Addendum migration completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Addendum migration failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

run();
