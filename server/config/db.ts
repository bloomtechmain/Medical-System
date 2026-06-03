import { Pool } from 'pg';

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const connectDB = async (retries = 8, baseDelay = 3000): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query(`
        ALTER TABLE medical_consultations
          ADD COLUMN IF NOT EXISTS lab_tests_requested TEXT;
      `);
      const target = process.env.DATABASE_URL
        ? 'Railway PostgreSQL'
        : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
      console.log(`PostgreSQL connected: ${target}`);
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
