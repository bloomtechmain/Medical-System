import { Pool, QueryResultRow } from 'pg';

// search_path=public,clinical is set at connection level via the options parameter.
// This means every query — pool.query() or client.query() — resolves unqualified
// table names against both schemas automatically:
//   public  → users, organizations, *_profiles, medicines, suppliers
//   clinical→ patient_profiles, medical_consultations, lab_requests,
//              patient_vitals, notifications, data_access_requests, etc.
//
// statement_timeout / idle_in_transaction_session_timeout / lock_timeout are set
// here (not just hoped for on the server) so a runaway query or a client that
// opens a transaction and goes away can never hold a connection, or a row lock,
// indefinitely — both starve the small pool below.
const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '5000', 10);
const IDLE_IN_TX_TIMEOUT_MS = parseInt(process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS || '10000', 10);
const LOCK_TIMEOUT_MS = parseInt(process.env.DB_LOCK_TIMEOUT_MS || '3000', 10);

const sessionOptions =
  `-c search_path=public,clinical` +
  ` -c statement_timeout=${STATEMENT_TIMEOUT_MS}` +
  ` -c idle_in_transaction_session_timeout=${IDLE_IN_TX_TIMEOUT_MS}` +
  ` -c lock_timeout=${LOCK_TIMEOUT_MS}`;

// TLS: verify the server's certificate by default. Set DB_SSL_REJECT_UNAUTHORIZED=false
// only for local/dev connections to a database with a self-signed cert you trust by
// other means (e.g. localhost). DB_SSL_CA lets you pin the provider's CA certificate
// (PEM contents) instead of trusting the system store.
const parseBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === 'true';

const sslEnabled = parseBool(process.env.DB_SSL, !!process.env.DATABASE_URL);
const ssl = sslEnabled
  ? {
      rejectUnauthorized: parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
      ca: process.env.DB_SSL_CA || undefined,
    }
  : undefined;

// Pool sizing: this value times the number of running server instances, plus
// headroom for psql/one-off scripts, must stay under the database's max_connections.
// Default of 10 assumes a single instance against Railway's default (100) limit
// with room to spare for migrations, seed scripts and manual psql sessions.
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10);
const CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '5000', 10);

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl,
        options: sessionOptions,
        max: POOL_MAX,
        idleTimeoutMillis: IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl,
        options:  sessionOptions,
        max: POOL_MAX,
        idleTimeoutMillis: IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
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

// Pharmacy/hospital/lab/clinic operational data (orders, sales, appointments, ...)
// lives in a per-organization `tenant_<slug>` schema — never in `public`/`clinical`,
// so it's outside the fixed search_path above. Callers must resolve the schema for
// the current user and qualify table names with it explicitly.
const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

const getTenantSchema = async (userId: number): Promise<string | null> => {
  const { rows } = await pool.query(
    `SELECT o.schema_name
     FROM public.organizations o
     JOIN public.organization_members om ON om.organization_id = o.id
     WHERE om.user_id = $1 AND o.schema_name IS NOT NULL
     LIMIT 1`,
    [userId]
  );
  const schema = rows[0]?.schema_name as string | undefined;
  if (!schema || !SCHEMA_NAME_RE.test(schema)) return null;
  return schema;
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

export { pool, connectDB, queryAs, getTenantSchema };
export type { RLSActor };
