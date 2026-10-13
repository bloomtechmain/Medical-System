# Rollback: a deploy made things worse

Answers CICD-08. Read the migration section before you roll anything back —
on this system the code is the easy half.

**Decide first, in one sentence:** did the bad deploy include a database
migration? `git log --oneline -1 --name-only <bad-sha> -- server/migrations/`
answers it, or check `pgmigrations`:

```bash
psql "$DATABASE_URL" -c "SELECT name, run_on FROM pgmigrations ORDER BY run_on DESC LIMIT 5"
```

- **No migration** → plain code rollback, below. Minutes, low risk.
- **Migration** → read "If the deploy included a migration" first. Do not
  reflexively migrate down.

## Code-only rollback (Railway)

1. Railway dashboard → the affected service → **Deployments**.
2. Find the last deployment that was good. Check the commit message against
   `git log` if you are unsure.
3. **⋯ → Redeploy**. Railway redeploys that image; it does not rebuild.
4. Watch the health check go green, then confirm by hand:
   ```bash
   curl -fsS https://<api-host>/api/ready
   ```
   `/api/ready` not `/api/health` — the latter passes with a broken database.
5. Walk one real flow in the browser: log in, open a patient, send a
   prescription. A green health check is not proof the application works.
6. Say in the team channel what you rolled back and to which commit.

Roll back the **client and API separately** — they are separate services. If
only one is bad, only roll back that one. They are compatible across one
deploy in either direction as long as no migration is involved.

## If the deploy included a migration

Migrations here are written additive-first on purpose (DB-13): add columns and
tables, remove them only in a later migration once nothing reads them. The
payoff is exactly this situation — **the previous version of the code almost
always runs fine against the new schema**. So:

**Default: roll back the code and leave the schema alone.** Then fix forward.

Only migrate down if the migration itself is what is broken (it locked a table,
it is rewriting rows wrongly, it corrupted data):

```bash
# One step down. Check what it will do FIRST — some down migrations are
# deliberately destructive, and migration 006 refuses to reverse at all.
cat server/migrations/<the-migration>.sql   # read the "Down Migration" half
DATABASE_URL="$DATABASE_MIGRATOR_URL" npm run db:migrate:down
```

Before running that, know these:

- **Migration 006 is deliberately not reversible.** Reversing it would merge
  every pharmacy's private catalogue back into one shared table, re-creating
  the cross-tenant exposure it exists to close. If 006 has to be undone,
  restore from the pre-migration backup instead — see
  [restore-from-backup.md](restore-from-backup.md).
- **A down migration that drops a column destroys the data in it.** There is
  no undo for the undo.
- BKP-09 means a snapshot is taken immediately before migrations run in a
  deploy. Use it rather than improvising — that is what it is for.

## If you cannot roll back

Dropped data and reversed-but-destructive migrations are not recoverable by
redeploying. Go to [restore-from-backup.md](restore-from-backup.md) and accept
the data loss between the backup and now. Tell the communicator immediately —
a restore has a user-visible cost and is not a silent fix.

## Afterwards

- Note the time the bad deploy went out and the time it was rolled back.
  Everything created in that window may need checking.
- Write down what the check that should have caught this would look like, and
  whether it belongs in CI or in the post-deploy smoke test
  (`.github/workflows/deploy.yml`).
- Hold the post-incident review (INC-06). It is about the missing check, not
  about who deployed.
