import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db';

// SEC-07/21/29: no hardcoded fallback password. If SEED_ADMIN_PASSWORD isn't
// set, skip creating an admin account entirely rather than silently using a
// known value — a missing admin is a visible, safe failure; a guessable one
// is not. Never logged, by design.
const seed = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('Admin', $1, $2, 'admin')
        ON CONFLICT (email) DO NOTHING;
      `, [adminEmail, adminHash]);
      console.log(`Admin account ensured for ${adminEmail}.`);
    } else {
      console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed. Set both to create one.');
    }

    await client.query(`
      INSERT INTO suppliers (name, contact, phone, email)
      VALUES ('MedSupply Co.', 'John Doe', '0771234567', 'supplier@medsupply.com')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Seed data inserted successfully.');
  } catch (err) {
    console.error('Seed failed:', (err as Error).message);
  } finally {
    client.release();
    pool.end();
  }
};

seed();
