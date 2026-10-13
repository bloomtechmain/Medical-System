import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

// MON-07: no business metrics existed, so nobody could answer "are sign-ups
// down today" or "did consultations stop being created an hour ago" — the
// questions that catch a broken feature faster than an error rate does.
// WARN-21 (sign-ups/consultations per hour against last week) and WARN-10/11
// (validation and login failures per hour) are all blocked on this existing.
//
// Deliberately a JSON endpoint on the existing API rather than a Prometheus
// exporter: there is no Prometheus here to scrape it, and the AWS target
// (CloudWatch) can poll a JSON endpoint or read these same numbers out of the
// audit log. If a scrape-based stack arrives later, the queries stay and only
// the serialisation changes.
//
// Every count is bounded by a time window and computed with one grouped query
// per source table, not a scan per metric — DB-08's "the query grows with the
// number of organisations" problem is exactly what to avoid repeating here.

interface Window {
  label: string;
  interval: string;
}

const WINDOWS: Window[] = [
  { label: 'last_hour', interval: '1 hour' },
  { label: 'last_24h', interval: '24 hours' },
  { label: 'last_7d', interval: '7 days' },
];

// One row per window for a given table/timestamp column. Parameterised on the
// interval only — the table and column are fixed literals chosen here, never
// taken from a request, so there is nothing injectable.
const countsByWindow = async (table: string, tsColumn: string, extraWhere = ''): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  const selects = WINDOWS.map(
    (w, i) =>
      `COUNT(*) FILTER (WHERE ${tsColumn} >= NOW() - $${i + 1}::interval) AS ${w.label}`
  ).join(', ');
  const { rows } = await pool.query(
    `SELECT ${selects} FROM ${table} WHERE TRUE ${extraWhere}`,
    WINDOWS.map(w => w.interval)
  );
  for (const w of WINDOWS) result[w.label] = Number(rows[0][w.label]);
  return result;
};

// Admin-only: these are whole-platform numbers, and the per-hour shape of
// sign-ups and failed logins is operational detail no tenant should see.
const getBusinessMetrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [signups, consultations, prescriptions, labReports, logins, loginFailures, recordViews] =
      await Promise.all([
        countsByWindow('public.users', 'created_at', 'AND deleted_at IS NULL'),
        countsByWindow('clinical.medical_consultations', 'created_at', 'AND deleted_at IS NULL'),
        countsByWindow('clinical.prescription_assignments', 'created_at'),
        countsByWindow('clinical.lab_requests', 'updated_at', "AND status = 'completed'"),
        countsByWindow('public.audit_log', 'occurred_at', "AND action = 'login.success'"),
        countsByWindow('public.audit_log', 'occurred_at', "AND action = 'login.failure'"),
        countsByWindow('public.audit_log', 'occurred_at', "AND action = 'patient_record.viewed'"),
      ]);

    // Current totals, for the handful of gauges where a rate is meaningless.
    const { rows: totals } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL)                      AS users,
        (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL AND is_active = FALSE) AS users_pending_or_disabled,
        (SELECT COUNT(*) FROM public.organizations)                                        AS organizations,
        (SELECT COUNT(*) FROM clinical.lab_requests WHERE status <> 'completed')            AS lab_requests_open
    `);

    res.json({
      generated_at: new Date().toISOString(),
      windows: WINDOWS.map(w => w.label),
      rates: {
        signups,
        consultations_created: consultations,
        prescriptions_sent: prescriptions,
        lab_reports_completed: labReports,
        logins: logins,
        login_failures: loginFailures,
        patient_records_viewed: recordViews,
      },
      totals: {
        users: Number(totals[0].users),
        users_pending_or_disabled: Number(totals[0].users_pending_or_disabled),
        organizations: Number(totals[0].organizations),
        lab_requests_open: Number(totals[0].lab_requests_open),
      },
    });
  } catch (err) {
    next(err);
  }
};

export { getBusinessMetrics };
