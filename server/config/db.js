const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const connectDB = async () => {
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
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };
