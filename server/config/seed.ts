import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db';

const seed = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const adminHash = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (name, email, password, role)
      VALUES ('Admin', 'admin@gmail.com', $1, 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [adminHash]);

    await client.query(`
      INSERT INTO suppliers (name, contact, phone, email)
      VALUES ('MedSupply Co.', 'John Doe', '0771234567', 'supplier@medsupply.com')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Seed data inserted successfully.');
    console.log('Admin credentials: admin@gmail.com / admin123');
  } catch (err) {
    console.error('Seed failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

seed();
