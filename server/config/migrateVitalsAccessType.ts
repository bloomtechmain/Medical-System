import 'dotenv/config';
import { pool } from './db';

const migrate = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE data_access_requests
        DROP CONSTRAINT IF EXISTS data_access_requests_access_type_check;
    `);

    await client.query(`
      ALTER TABLE data_access_requests
        ADD CONSTRAINT data_access_requests_access_type_check
        CHECK (access_type IN (
          'lab_reports','medical_history','personal_reports','contact_info','vitals'
        ));
    `);

    await client.query('COMMIT');
    console.log('Vitals access type added to data_access_requests successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', (err as Error).message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
