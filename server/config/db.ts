import { Pool } from 'pg';

// search_path=public,clinical is set at connection level via the options parameter.
// This means every query — pool.query() or client.query() — resolves unqualified
// table names against both schemas automatically:
//   public  → users, organizations, *_profiles, medicines, suppliers
//   clinical→ patient_profiles, medical_consultations, lab_requests,
//              patient_vitals, notifications, data_access_requests, etc.
const searchPathOption = '-c search_path=public,clinical';

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        options: searchPathOption,
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options:  searchPathOption,
      }
);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const connectDB = async (retries = 8, baseDelay = 3000): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      const { rows } = await client.query('SHOW search_path');
      const target = process.env.DATABASE_URL
        ? 'Railway PostgreSQL'
        : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
      console.log(`PostgreSQL connected: ${target}  search_path=${rows[0]?.search_path}`);
      client.release();
      return;
    } catch (err) {
      console.error(`DB connection attempt ${attempt}/${retries} failed: ${(err as Error).message}`);
      if (attempt === retries) {
        console.error('All DB connection attempts exhausted. Exiting.');
        process.exit(1);
      }
      await sleep(baseDelay * attempt);
    }
  }
};

export { pool, connectDB };
