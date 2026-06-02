require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_reports (
        id                 SERIAL PRIMARY KEY,
        patient_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title              VARCHAR(255) NOT NULL,
        report_type        VARCHAR(50) NOT NULL
                           CHECK (report_type IN ('lab_report','prescription','imaging','discharge_summary','vaccination','other')),
        laboratory_name    VARCHAR(255),
        doctor_name        VARCHAR(255),
        hospital_clinic    VARCHAR(255),
        issued_date        DATE NOT NULL,
        description        TEXT,
        file_path          VARCHAR(500) NOT NULL,
        file_mimetype      VARCHAR(100),
        file_original_name VARCHAR(255),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('patient_reports table created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
