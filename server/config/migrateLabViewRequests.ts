import 'dotenv/config';
import { pool } from './db';

const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_view_requests (
        id              SERIAL PRIMARY KEY,
        lab_request_id  INTEGER NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
        doctor_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message         TEXT,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','declined')),
        responded_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lvr_lab     ON lab_view_requests(lab_request_id);
      CREATE INDEX IF NOT EXISTS idx_lvr_doctor  ON lab_view_requests(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_lvr_patient ON lab_view_requests(patient_id);
      CREATE INDEX IF NOT EXISTS idx_lvr_status  ON lab_view_requests(status);
    `);

    await client.query('COMMIT');
    console.log('lab_view_requests table created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
