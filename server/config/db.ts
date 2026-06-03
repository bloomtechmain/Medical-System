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

const connectDB = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    // Idempotent schema additions
    await client.query(`
      ALTER TABLE medical_consultations
        ADD COLUMN IF NOT EXISTS lab_tests_requested TEXT;
    `);
    console.log(`PostgreSQL connected: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    client.release();
  } catch (err) {
    console.error('Database connection failed:', (err as Error).message);
    process.exit(1);
  }
};

export { pool, connectDB };
