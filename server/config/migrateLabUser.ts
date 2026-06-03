import 'dotenv/config';
import { pool } from './db';

const run = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','doctor','pharmacist','patient','laboratory'))
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS laboratory_profiles (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        phone             VARCHAR(20),
        lab_name          VARCHAR(200),
        lab_type          VARCHAR(100),
        license_number    VARCHAR(100),
        accreditation     VARCHAR(200),
        address           TEXT,
        services_offered  TEXT,
        operating_hours   VARCHAR(200),
        website           VARCHAR(300),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('Laboratory migration completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

run();
