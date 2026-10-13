# The database is unreachable or out of connections

Symptom: `/api/health` returns 200, `/api/ready` returns 503 with
`{"check":"db_pool"}` or `{"check":"db_query"}`.

## 1. Which of the two is it?

```bash
curl -s https://<api-host>/api/ready
```

- `"check":"db_pool"` — could not get a connection within
  `DB_POOL_CONNECTION_TIMEOUT_MS` (5s). Either the database is unreachable, or
  the pool is exhausted. These need different fixes — step 2 vs step 3.
- `"check":"db_query"` — got a connection, but `SELECT 1` failed or took more
  than 2s. The database is up but struggling, or something is holding locks.

## 2. Is the database up at all?

Railway dashboard → the PostgreSQL service. Check it is running and look at
its own logs and metrics.

```bash
# From a machine with access. If this hangs, it is reachability, not load.
psql "$DATABASE_URL" -c "SELECT 1"
```

- **Platform incident** → check Railway status. Nothing to do but communicate.
  Tell the communicator; do not keep restarting the API, which only adds
  connection churn.
- **Out of disk** → the most common cause of a database that is up but
  refusing writes. Check the database service's storage metric. WARN-04 (an
  alert at 80%) is still open, so nothing will have told you.
- **Credentials rejected** (`password authentication failed`) — did someone
  rotate the password, or recreate the role? `DATABASE_URL` must point at
  `corehealth_app`, not a superuser (DB-02).

## 3. Connections exhausted

```bash
psql "$DATABASE_URL" -c "
  SELECT count(*) AS total,
         count(*) FILTER (WHERE state = 'active')              AS active,
         count(*) FILTER (WHERE state = 'idle')                AS idle,
         count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx
  FROM pg_stat_activity WHERE datname = current_database()"
psql "$DATABASE_URL" -c "SHOW max_connections"
```

The arithmetic that should hold (DB-04):
`DB_POOL_MAX (default 10) × instances + headroom for psql/migrations < max_connections`.

- **`idle_in_tx` is high** — something opened a transaction and walked away.
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (10s) should kill these automatically;
  if they are surviving, that setting is not reaching the server. Check
  `SHOW idle_in_transaction_session_timeout` on a live connection.
- **`active` is high and queries are slow** — step 4.
- **`total` near `max_connections` with everything idle** — too many instances
  for `DB_POOL_MAX`, or leftover connections from a crashed process. Lower
  `DB_POOL_MAX` or raise the database plan; do not just restart.

Find and, if you must, stop the worst offender:

```bash
psql "$DATABASE_URL" -c "
  SELECT pid, state, now() - query_start AS runtime, left(query, 120) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND state <> 'idle'
  ORDER BY query_start LIMIT 20"

# Cancel one query (polite). Prefer this to pg_terminate_backend.
psql "$DATABASE_URL" -c "SELECT pg_cancel_backend(<pid>)"
```

## 4. Up but slow, or locked

```bash
# Blocked queries and what is blocking them.
psql "$DATABASE_URL" -c "
  SELECT blocked.pid AS blocked_pid, left(blocked.query,80) AS blocked_query,
         blocking.pid AS blocking_pid, left(blocking.query,80) AS blocking_query
  FROM pg_stat_activity blocked
  JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
  WHERE blocked.datname = current_database()"
```

A migration running `ALTER TABLE` on a large table is the usual culprit, and
it will be holding an `ACCESS EXCLUSIVE` lock that queues everything behind it.
`DB_LOCK_TIMEOUT_MS` (3s) bounds the application's waiting, not the
migration's. If a deploy is in progress, that is your answer — let it finish
if it is close, or [roll back](rollback.md) if it is not.

Diagnostics already in the repository:

```bash
npm run db:check:version   # server version and tuned settings (DB-01)
npm run db:check:bloat     # autovacuum state and table bloat (DB-11)
```

## 5. Recovery

Once the database is healthy, the API recovers on its own — `/api/ready` goes
green and the platform resumes sending traffic. No restart needed. If a restart
*is* needed, the pool reconnects with growing delay over eight attempts and
then exits deliberately rather than sitting there broken.

## Afterwards

- If this was connection exhaustion, write down the arithmetic you landed on
  and put it in [../docs/environments.md](../docs/environments.md) next to
  `DB_POOL_MAX`.
- A connections-at-80% alert (WARN-05) and database metrics (MON-04) are both
  still open. If you found this from a user report, that is the finding.
