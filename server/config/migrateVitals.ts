import 'dotenv/config';
import { pool } from './db';

const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_vitals (
        id                  SERIAL PRIMARY KEY,
        patient_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        -- CBC Panel
        wbc                 NUMERIC(7,2),
        rbc                 NUMERIC(7,2),
        hemoglobin          NUMERIC(7,2),
        hematocrit          NUMERIC(7,2),
        mcv                 NUMERIC(7,2),
        mch                 NUMERIC(7,2),
        mchc                NUMERIC(7,2),
        rdw                 NUMERIC(7,2),
        platelets           NUMERIC(8,2),
        mpv                 NUMERIC(7,2),
        -- Metabolic Panel
        blood_glucose       NUMERIC(7,2),
        hba1c               NUMERIC(6,2),
        creatinine          NUMERIC(6,2),
        -- Lipid Panel
        cholesterol         NUMERIC(7,2),
        hdl                 NUMERIC(7,2),
        ldl                 NUMERIC(7,2),
        triglycerides       NUMERIC(7,2),
        -- Basic Vitals
        bp_systolic         INTEGER,
        bp_diastolic        INTEGER,
        heart_rate          INTEGER,
        temperature         NUMERIC(5,2),
        oxygen_saturation   NUMERIC(5,2),
        -- Metadata
        source              VARCHAR(20) NOT NULL DEFAULT 'manual',
        lab_request_id      INTEGER REFERENCES lab_requests(id) ON DELETE SET NULL,
        notes               TEXT,
        recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pv_patient ON patient_vitals(patient_id);
      CREATE INDEX IF NOT EXISTS idx_pv_recorded ON patient_vitals(recorded_at DESC);
    `);

    await client.query('COMMIT');
    console.log('patient_vitals table created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vitals migration failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
