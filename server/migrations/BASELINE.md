# Adopting node-pg-migrate on the existing production database

This only matters once — the first time `npm run db:migrate` is pointed at the
*existing* production database. Any new environment (a fresh dev database, CI,
a brand-new production database) just runs `npm run db:migrate` normally,
which executes `001_initial_schema.sql` for real. Skip this file for those.

## Why this is needed

Production's schema was built by hand, over time, by running `migrate.ts` and
some subset of the eleven `migrateXxx.ts` scripts in `server/config/` — three
of which (`migrateAdditions.ts`, `migrateLabRequests.ts`, `migrateLabUser.ts`)
had no npm script, so it is genuinely uncertain whether all of them were run.
node-pg-migrate has no record of any of this. `001_initial_schema.sql` creates
the same end state from scratch, but it is **not idempotent against a
database that already has data** — most of its `CREATE TABLE` statements have
no `IF NOT EXISTS`, because it's designed to run once against a schema that
section 1 of `corehealth_database.sql` just dropped. Run it for real against
production and it fails on the first statement (or worse, if ever run as the
`corehealth_database.sql` original with its drop block — do not do that
either).

So adoption is: (1) make production's actual schema match what 001 produces,
then (2) tell node-pg-migrate "001 is already done" without executing it.

## Procedure

1. **Catch production up.** Run the one-time, fully additive script against
   production:
   ```bash
   psql "$DATABASE_URL" -f server/migrations/BASELINE_prod_catchup.sql
   ```
   This is safe to run even if some of it was already applied by hand — every
   statement in it is `IF NOT EXISTS` / `DROP+ADD CONSTRAINT` / `ALTER`, none
   of it drops anything or touches existing rows. It adds whatever DB-02,
   DB-06 and DB-08 (see `03-database.md`) need that production doesn't
   already have: the `corehealth_app` / `corehealth_migrator` roles, making
   `provision_tenant()` `SECURITY DEFINER`, the `pg_trgm` search indexes, and
   the admin-stats cache table.

2. **Point the app and migrations at the right roles.** Set production's
   `DATABASE_URL` to connect as `corehealth_app` (not the bootstrap/superuser
   role it likely uses today), and add `DATABASE_MIGRATOR_URL` for
   `corehealth_migrator`. See `server/.env.example`. Set real passwords for
   both roles first:
   ```sql
   ALTER ROLE corehealth_app       SET PASSWORD '...';
   ALTER ROLE corehealth_migrator  SET PASSWORD '...';
   ```

3. **Mark 001 as already applied, without running it**, using
   node-pg-migrate's built-in `--fake` flag (it records the migration as run
   in the `pgmigrations` table but does not execute its SQL):
   ```bash
   DATABASE_URL="$DATABASE_MIGRATOR_URL" npx node-pg-migrate up --fake
   ```
   This also creates the `pgmigrations` bookkeeping table if it doesn't exist
   yet. Verify it worked:
   ```sql
   SELECT * FROM public.pgmigrations;
   -- should show one row: 001_initial_schema, run_on = just now
   ```

4. **From then on**, `npm run db:migrate` (`node-pg-migrate up`, for real —
   see `package.json`) only ever runs migrations numbered after 001. Never
   re-run step 3, and never run `001_initial_schema.sql` directly against a
   database that has gone through this procedure.

## The legacy `migrateXxx.ts` scripts

They are kept, unchanged in behavior (just fixed to exit non-zero on
failure — see `03-database.md` DB-12), **only** so that if step 1's catch-up
script ever needs to be re-derived or audited against what those scripts
originally did, the history is still there. Do not run them again after
completing this procedure, and do not add new ones — new schema changes are
new files under `server/migrations/`.
