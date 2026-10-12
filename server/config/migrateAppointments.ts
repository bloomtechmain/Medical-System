// LEGACY — superseded by server/migrations/ (node-pg-migrate). Kept only for
// BASELINE.md's production adoption history; do not run this again once
// that procedure is complete, and do not add new scripts in this style.

import 'dotenv/config';
import { pool } from './db';

// Doctor-initiated appointment booking: a patient books a specific date/time slot
// directly with a doctor and the doctor accepts/declines. Distinct from the
// per-organization tenant_<slug>.appointments table (an org's own front-desk
// record) — this is patient-doctor-owned relationship data, so like
// data_access_requests it lives in `clinical`, schema-qualified explicitly here
// since this script must also be safe to run against an already-provisioned DB.
const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical.doctor_weekly_availability (
        id                    SERIAL      PRIMARY KEY,
        doctor_id             INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        day_of_week           SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time            TIME        NOT NULL,
        end_time              TIME        NOT NULL,
        slot_duration_minutes SMALLINT    NOT NULL DEFAULT 30 CHECK (slot_duration_minutes BETWEEN 5 AND 240),
        is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (end_time > start_time)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dwa_doctor ON clinical.doctor_weekly_availability(doctor_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical.doctor_availability_overrides (
        id            SERIAL      PRIMARY KEY,
        doctor_id     INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        override_date DATE        NOT NULL,
        is_available  BOOLEAN     NOT NULL,
        reason        VARCHAR(255),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (doctor_id, override_date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dao_doctor_date ON clinical.doctor_availability_overrides(doctor_id, override_date);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical.doctor_appointments (
        id               SERIAL      PRIMARY KEY,
        doctor_id        INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        patient_id       INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        appointment_date DATE        NOT NULL,
        start_time       TIME        NOT NULL,
        end_time         TIME        NOT NULL,
        reason           TEXT,
        status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','confirmed','declined','cancelled','completed')),
        doctor_notes     TEXT,
        responded_at     TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_da_doctor  ON clinical.doctor_appointments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_da_patient ON clinical.doctor_appointments(patient_id);
      CREATE INDEX IF NOT EXISTS idx_da_status  ON clinical.doctor_appointments(status);
      CREATE INDEX IF NOT EXISTS idx_da_date    ON clinical.doctor_appointments(appointment_date);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_da_slot_unique ON clinical.doctor_appointments(doctor_id, appointment_date, start_time)
        WHERE status IN ('pending','confirmed');
    `);

    // RLS: idempotent to run against an already-provisioned DB.
    await client.query(`
      ALTER TABLE clinical.doctor_weekly_availability   ENABLE ROW LEVEL SECURITY;
      ALTER TABLE clinical.doctor_weekly_availability   FORCE  ROW LEVEL SECURITY;
      ALTER TABLE clinical.doctor_availability_overrides ENABLE ROW LEVEL SECURITY;
      ALTER TABLE clinical.doctor_availability_overrides FORCE  ROW LEVEL SECURITY;
      ALTER TABLE clinical.doctor_appointments           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE clinical.doctor_appointments           FORCE  ROW LEVEL SECURITY;
    `);

    await client.query('DROP POLICY IF EXISTS dwa_sel ON clinical.doctor_weekly_availability');
    await client.query('DROP POLICY IF EXISTS dwa_mod ON clinical.doctor_weekly_availability');
    await client.query(`
      CREATE POLICY dwa_sel ON clinical.doctor_weekly_availability FOR SELECT USING (true);
    `);
    await client.query(`
      CREATE POLICY dwa_mod ON clinical.doctor_weekly_availability FOR ALL USING (
        public.app_role() = 'admin' OR doctor_id = public.app_uid()
      ) WITH CHECK (
        public.app_role() = 'admin' OR doctor_id = public.app_uid()
      );
    `);

    await client.query('DROP POLICY IF EXISTS dao_sel ON clinical.doctor_availability_overrides');
    await client.query('DROP POLICY IF EXISTS dao_mod ON clinical.doctor_availability_overrides');
    await client.query(`
      CREATE POLICY dao_sel ON clinical.doctor_availability_overrides FOR SELECT USING (true);
    `);
    await client.query(`
      CREATE POLICY dao_mod ON clinical.doctor_availability_overrides FOR ALL USING (
        public.app_role() = 'admin' OR doctor_id = public.app_uid()
      ) WITH CHECK (
        public.app_role() = 'admin' OR doctor_id = public.app_uid()
      );
    `);

    await client.query('DROP POLICY IF EXISTS da_all ON clinical.doctor_appointments');
    await client.query(`
      CREATE POLICY da_all ON clinical.doctor_appointments FOR ALL USING (
        public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
      ) WITH CHECK (
        public.app_role() = 'admin' OR doctor_id = public.app_uid() OR patient_id = public.app_uid()
      );
    `);

    await client.query('COMMIT');
    console.log('Appointment booking tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Appointments migration failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
