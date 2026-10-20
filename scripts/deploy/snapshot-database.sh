#!/usr/bin/env bash
#
# BKP-09: take a database snapshot and WAIT for it, before any migration runs.
#
# The finding: "Nothing takes a backup before a schema change. Migrations are
# run by hand from a laptop or the Railway shell." The fix it asks for is
# exactly this — a deploy step that snapshots and waits for it to finish.
#
# Waiting is the whole point. A snapshot that is still being written when the
# migration starts is not a restore point, and the one time it matters is the
# one time nobody will check.
#
# Usage: scripts/deploy/snapshot-database.sh <environment>
# Needs: either RDS_INSTANCE_IDENTIFIER (AWS target — calls the RDS snapshot
# API directly, see below), or DATABASE_MIGRATOR_URL + pg_dump on PATH
# (Railway/production target — the rest of this file).
#
# Where the pg_dump path's snapshot goes, in order of preference:
#   1. BACKUP_S3_BUCKET set  → pg_dump piped to S3 (durable, versioned)
#   2. otherwise             → a CI artifact path, which is better than
#                              nothing but expires with the run

set -euo pipefail

ENVIRONMENT="${1:?usage: snapshot-database.sh <environment>}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LABEL="pre-migration-${ENVIRONMENT}-${TIMESTAMP}"

# RDS-native path (the AWS target): used whenever RDS_INSTANCE_IDENTIFIER is
# set, which is also the only option that works there — the instance has no
# route from a GitHub-hosted runner, so pg_dump below can't reach it anyway.
# This calls AWS's own snapshot API instead of moving data through CI, and
# WAITS for it, which is the part that actually satisfies BKP-09.
if [ -n "${RDS_INSTANCE_IDENTIFIER:-}" ]; then
  echo "==> Taking an RDS snapshot of ${RDS_INSTANCE_IDENTIFIER} (${LABEL})"
  aws rds create-db-snapshot \
    --db-instance-identifier "$RDS_INSTANCE_IDENTIFIER" \
    --db-snapshot-identifier "$LABEL" >/dev/null

  echo "==> Waiting for it to finish (this is what makes it a real restore point)"
  aws rds wait db-snapshot-available \
    --db-instance-identifier "$RDS_INSTANCE_IDENTIFIER" \
    --db-snapshot-identifier "$LABEL"

  echo "==> Snapshot complete: ${LABEL}"
  echo "SNAPSHOT_LOCATION=rds-snapshot:${LABEL}" >> "${GITHUB_ENV:-/dev/null}"
  exit 0
fi

if [ -z "${DATABASE_MIGRATOR_URL:-}" ]; then
  echo "ERROR: DATABASE_MIGRATOR_URL is not set. Refusing to migrate without a backup." >&2
  exit 1
fi

# Fail loudly rather than "succeeding" with an empty file. An apparently-green
# backup step that produced nothing is the worst possible outcome here.
command -v pg_dump >/dev/null 2>&1 || {
  echo "ERROR: pg_dump not found on PATH." >&2
  exit 1
}

echo "==> Checking the database is reachable before dumping"
psql "$DATABASE_MIGRATOR_URL" -Atc 'SELECT 1' >/dev/null

echo "==> Recording current migration state (so the restore point is identifiable)"
psql "$DATABASE_MIGRATOR_URL" -Atc \
  'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1' \
  > "migration-state-${TIMESTAMP}.txt" || echo "(no pgmigrations table yet)" > "migration-state-${TIMESTAMP}.txt"
echo "    last applied migration: $(cat "migration-state-${TIMESTAMP}.txt")"

DUMP_FILE="${LABEL}.dump"

echo "==> Dumping (custom format, compressed)"
# -Fc: restorable with pg_restore, selectively and in parallel.
# --no-owner/--no-privileges are deliberately NOT passed: the roles and grants
# are part of what has to come back (corehealth_app must not be a superuser —
# DB-02 — and the RLS policies are meaningless if it is).
pg_dump "$DATABASE_MIGRATOR_URL" -Fc --verbose -f "$DUMP_FILE" 2> "dump-${TIMESTAMP}.log" || {
  echo "ERROR: pg_dump failed. Last 20 lines:" >&2
  tail -20 "dump-${TIMESTAMP}.log" >&2
  exit 1
}

# A dump smaller than this is not a real database — treat it as a failure
# rather than shipping a useless restore point.
MIN_BYTES=10240
SIZE=$(wc -c < "$DUMP_FILE")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "ERROR: dump is only ${SIZE} bytes (expected > ${MIN_BYTES}). Refusing to continue." >&2
  exit 1
fi
echo "    wrote ${DUMP_FILE} (${SIZE} bytes)"

echo "==> Verifying the dump is readable"
# Reads the archive's table of contents. Catches a truncated or corrupt file
# now, rather than during an incident.
pg_restore --list "$DUMP_FILE" > "toc-${TIMESTAMP}.txt"
TOC_LINES=$(wc -l < "toc-${TIMESTAMP}.txt")
if [ "$TOC_LINES" -lt 10 ]; then
  echo "ERROR: dump table-of-contents has only ${TOC_LINES} entries — the dump looks wrong." >&2
  exit 1
fi
echo "    table of contents lists ${TOC_LINES} entries"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  echo "==> Uploading to s3://${BACKUP_S3_BUCKET}/pre-migration/"
  aws s3 cp "$DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/pre-migration/${DUMP_FILE}"
  # Confirm it landed. `aws s3 cp` exiting 0 is necessary but not sufficient
  # proof that the object is readable.
  aws s3api head-object \
    --bucket "$BACKUP_S3_BUCKET" \
    --key "pre-migration/${DUMP_FILE}" >/dev/null
  echo "    verified s3://${BACKUP_S3_BUCKET}/pre-migration/${DUMP_FILE}"
  echo "SNAPSHOT_LOCATION=s3://${BACKUP_S3_BUCKET}/pre-migration/${DUMP_FILE}" >> "${GITHUB_ENV:-/dev/null}"
else
  echo "::warning::BACKUP_S3_BUCKET is not set — the snapshot stays in the workflow"
  echo "::warning::workspace and expires with this run. Set it so the restore point outlives CI."
  echo "SNAPSHOT_LOCATION=${PWD}/${DUMP_FILE}" >> "${GITHUB_ENV:-/dev/null}"
fi

echo "==> Snapshot complete: ${LABEL}"
echo "    Restoring from it: see runbooks/restore-from-backup.md"
