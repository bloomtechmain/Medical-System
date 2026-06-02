require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS data_access_requests (
        id           SERIAL PRIMARY KEY,
        doctor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        access_type  VARCHAR(50) NOT NULL
                     CHECK (access_type IN ('lab_reports','medical_history','personal_reports','contact_info')),
        reason       TEXT,
        status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined')),
        responded_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dar_doctor   ON data_access_requests(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_dar_patient  ON data_access_requests(patient_id);
      CREATE INDEX IF NOT EXISTS idx_dar_status   ON data_access_requests(status);
    `);

    await client.query('COMMIT');
    console.log('data_access_requests table created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
