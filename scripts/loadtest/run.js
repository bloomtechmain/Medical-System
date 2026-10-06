// ARCH-09 load test — no AWS/staging required. Points at a running instance
// of the server (default: this machine's local dev server) and simulates a
// handful of real, authenticated read-heavy flows a patient dashboard
// actually makes. Results are directional (see docs/capacity-plan.md for the
// caveats), not a substitute for testing against a real staging environment
// once one exists.
//
// Usage:
//   node scripts/loadtest/run.js
//   TARGET_URL=http://localhost:5000 CONNECTIONS=20 DURATION=15 node scripts/loadtest/run.js
//
// Needs a real login, so it temporarily resets one test user's password
// (backed up first, restored in a `finally` — same discipline used
// throughout this project for any test that needs real credentials).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../server/.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const autocannon = require('autocannon');

const TARGET_URL  = process.env.TARGET_URL  || 'http://localhost:5000';
const CONNECTIONS = parseInt(process.env.CONNECTIONS || '20', 10);
const DURATION    = parseInt(process.env.DURATION    || '15', 10);
const TEST_USER_ID    = 9; // saman@gmail.com, patient — read-only endpoints below
const TEST_USER_EMAIL = 'saman@gmail.com';
const TEMP_PASSWORD   = 'LoadTest123!';

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});

const login = async () => {
  const r = await fetch(`${TARGET_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEMP_PASSWORD }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.token;
};

const runAutocannon = (token) => new Promise((resolve, reject) => {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const instance = autocannon({
    url: TARGET_URL,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: [
      { method: 'GET', path: '/api/health' },                          // unauthenticated baseline
      { method: 'GET', path: '/api/consultations',   headers: authHeaders },
      { method: 'GET', path: '/api/appointments',     headers: authHeaders },
      { method: 'GET', path: '/api/lab-requests',     headers: authHeaders },
      { method: 'GET', path: '/api/patient-reports',  headers: authHeaders },
      { method: 'GET', path: '/api/notifications',    headers: authHeaders },
    ],
  }, (err, result) => (err ? reject(err) : resolve(result)));
  autocannon.track(instance, { renderProgressBar: true });
});

(async () => {
  const { rows: [backup] } = await pool.query('SELECT password FROM public.users WHERE id=$1', [TEST_USER_ID]);
  if (!backup) throw new Error(`test user id=${TEST_USER_ID} not found`);

  try {
    const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
    await pool.query('UPDATE public.users SET password=$1 WHERE id=$2', [hash, TEST_USER_ID]);

    console.log(`\nTarget: ${TARGET_URL}  |  Connections: ${CONNECTIONS}  |  Duration: ${DURATION}s\n`);
    const token  = await login();
    const result = await runAutocannon(token);

    const summary = {
      target: TARGET_URL,
      connections: CONNECTIONS,
      durationSec: DURATION,
      requestsPerSec: result.requests.average,
      latencyMs: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99, max: result.latency.max },
      throughputMB: result.throughput.average / 1024 / 1024,
      totalRequests: result.requests.total,
      errors: result.errors,
      non2xx: result.non2xx,
      timeouts: result.timeouts,
    };
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, 'last-result.json'), JSON.stringify(summary, null, 2));
  } finally {
    await pool.query('UPDATE public.users SET password=$1 WHERE id=$2', [backup.password, TEST_USER_ID]);
    await pool.end();
  }
})().catch(e => { console.error('LOAD TEST FAILED:', e.message); process.exit(1); });
