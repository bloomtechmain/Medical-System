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
      // PRO-11: email_verified_at is set explicitly. Login is refused for an
      // unverified address, and this account is created by an operator who
      // supplied the address deliberately — there is no inbox round-trip to
      // make, and leaving it NULL would create an admin account that cannot
      // log in, which is a confusing dead end rather than a safety measure.
      await client.query(`
        INSERT INTO users (name, email, password, role, email_verified_at)
        VALUES ('Admin', $1, $2, 'admin', NOW())
        ON CONFLICT (email) DO NOTHING;
      `, [adminEmail, adminHash]);
      console.log(`Admin account ensured for ${adminEmail}.`);
    } else {
      console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed. Set both to create one.');
    }

    // The supplier row that used to be inserted here is gone. SEC-17 #4 moved
    // medicines/suppliers out of `public` and into each pharmacy's own
    // tenant_<slug> schema, and migration 006 dropped the shared tables — so
    // this INSERT referenced a table that no longer exists and would have
    // failed the whole seed. There is no sensible shared replacement: a
    // supplier belongs to one pharmacy now, and which pharmacy is not
    // something this script can know. Sample suppliers for local development
    // come from corehealth_seed_data.sql, which creates the tenants first.

    console.log('Seed data inserted successfully.');
  } catch (err) {
    console.error('Seed failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    pool.end();
  }
};

seed();
