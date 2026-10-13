# Restore the database from backup

**A restore loses every change made after the backup point.** On this system
that means consultations, prescriptions and lab reports created in that window
are gone. It is the right call for corruption or a destructive migration, and
the wrong call for "one record looks odd" — fix that with a targeted update.

Decide, and say out loud, before starting: *what is the acceptable data loss?*
That answer picks the restore point.

## 0. Before you touch anything

1. **Tell the communicator.** Users will lose work; someone has to tell them.
2. **Stop writes.** Scale the API to zero instances in Railway, or take it out
   of rotation. Restoring underneath a running application produces a database
   that disagrees with itself.
3. **Snapshot the current broken state first**, even though it is broken. It is
   the only copy of the data created since the last backup, and you may need to
   reconcile against it afterwards.
   ```bash
   pg_dump "$DATABASE_URL" -Fc -f broken-state-$(date +%Y%m%dT%H%M%S).dump
   ```

## 1. Pick the restore point

Railway → PostgreSQL service → **Backups**. Note the timestamp you choose and
write it down; you will need it for the reconciliation step.

If the cause was a bad migration, the right point is the snapshot taken
immediately *before* migrations ran — that is what BKP-09's pre-migration
snapshot step in `.github/workflows/deploy.yml` exists for. Find it by
timestamp against the deploy time.

## 2. Restore into a NEW database first

Never restore over the live database as the first move. Restore beside it, check
it, then switch.

```bash
# 1. Create an empty target.
createdb -h <host> -U <admin-user> corehealth_restore_$(date +%Y%m%d)

# 2. Restore into it. --no-owner because the dump's ownership (corehealth_app /
#    corehealth_migrator / the tn_* tenant roles) may not match this instance.
pg_restore -h <host> -U <admin-user> -d corehealth_restore_<date> \
  --no-owner --no-privileges -j 4 <the-backup-file>
```

## 3. Check the restore before trusting it

```bash
export RESTORED="postgresql://<admin-user>:<pw>@<host>:5432/corehealth_restore_<date>"

# Roles and grants (--no-privileges above dropped them) — the app cannot
# connect without corehealth_app, and RLS is meaningless if it is a superuser.
psql "$RESTORED" -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
                     WHERE rolname LIKE 'corehealth%'"

# Row counts against what you expect.
psql "$RESTORED" -c "
  SELECT 'users' t, count(*) FROM public.users WHERE deleted_at IS NULL
  UNION ALL SELECT 'consultations', count(*) FROM clinical.medical_consultations
  UNION ALL SELECT 'lab_requests',  count(*) FROM clinical.lab_requests
  UNION ALL SELECT 'organizations', count(*) FROM public.organizations"

# Tenant schemas came back — pharmacies are useless without theirs.
psql "$RESTORED" -c "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'"

# Migration state, so the next deploy does not try to re-run or skip.
psql "$RESTORED" -c "SELECT name, run_on FROM pgmigrations ORDER BY id DESC LIMIT 5"

# The newest clinical record — this is your real data-loss boundary.
psql "$RESTORED" -c "SELECT max(created_at) FROM clinical.medical_consultations"
```

If roles are missing, recreate them and re-apply grants — sections 6 of
`corehealth_database.sql` is the reference for what they should be. Then run
the test suite against the restored database, which checks RLS, tenant
provisioning and the audit log for real:

```bash
cd server && DATABASE_URL="$RESTORED" DB_SSL=false npx jest
```

## 4. Switch over

1. Point `DATABASE_URL` (and `DATABASE_MIGRATOR_URL`) at the restored database.
2. Bring the API back up. Confirm `GET /api/ready` returns 200.
3. Walk a real flow by hand: log in, open a patient, send a prescription,
   upload a lab report.
4. Keep the broken database. Do not drop it for at least a week.

## 5. Reconcile

Between the restore point and the incident, real work happened and is now
missing. Using the `broken-state` dump from step 0, list what was lost:

```bash
# Example: consultations created after the restore point.
psql "$BROKEN" -c "SELECT id, patient_id, visit_date, created_at
                   FROM clinical.medical_consultations
                   WHERE created_at > '<restore-point>' ORDER BY created_at"
```

Decide per table whether to re-enter by hand, re-import, or accept the loss.
Clinical records almost always need re-entering; notifications almost never do.

## Notes specific to this system

- **Uploaded files are not in the database.** A database restore does not
  restore prescriptions or lab reports — those are in S3 (`AWS_S3_BUCKET`), or
  on ephemeral container disk if `AWS_S3_BUCKET` is unset, in which case they
  were already gone. See [uploads-missing.md](uploads-missing.md).
- **`corehealth_database.sql` is not a backup.** Its first section drops every
  tenant schema, the clinical schema and the public tables. Running it against
  a populated database is data loss, not recovery.
- **Tenant schemas are per-organisation** (`tenant_<slug>`). A restore that
  misses them leaves pharmacies and labs with no operational data even though
  users and clinical records look fine. Always run the tenant-schema check in
  step 3.

## Afterwards

Record how long this took, end to end. That number is the real RTO, and BKP-01
(RPO/RTO in writing) is still open — this is the measurement that closes it.
BKP-05 asks for a tested restore; if this was the first one, you have now done
it, so write down the date.
