import { Pool, QueryResultRow } from 'pg';

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

// Tables in the `clinical` schema (medical_consultations, lab_requests,
// patient_vitals, notifications, etc.) have row-level security enabled.
// Their policies check public.app_uid()/app_role(), which read the
// session-local settings `app.user_id` / `app.role` / `app.org_id`. Those
// settings only exist if something sets them — plain pool.query() never
// does, so a non-superuser DB role would have every clinical write rejected
// with "new row violates row-level security policy". queryAs() runs a
// query on a dedicated client with those settings applied via SET LOCAL
// (scoped to one transaction, so it can never leak onto a pooled
// connection reused by an unrelated request afterwards).
interface RLSActor {
  id?: number | null;
  role?: string | null;
  organizationId?: number | null;
}

const queryAs = async <T extends QueryResultRow = any>(
  actor: RLSActor | null | undefined,
  text: string,
  values?: unknown[]
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_id', $1, true),
              set_config('app.role',    $2, true),
              set_config('app.org_id',  $3, true)`,
      [
        actor?.id != null ? String(actor.id) : '',
        actor?.role || '',
        actor?.organizationId != null ? String(actor.organizationId) : '',
      ]
    );
    const result = await client.query<T>(text, values);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

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

export { pool, connectDB, queryAs };
export type { RLSActor };
