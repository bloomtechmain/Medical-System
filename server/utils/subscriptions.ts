import { pool } from '../config/db';
import { logger } from '../config/logger';
import { PlanAudience } from '../config/planCatalog';
import { loadPlan, resolvePlanSubject, Plan, PlanSubject } from './plans';
import { sendNotification } from './notify';

// Monthly billing for paid packages (migration 016).
//
// The rules, in one place:
//   * Free package (price 0)  → no billing cycle, never suspended.
//   * Paid package            → covered until plan_expires_at. The first
//     period starts when the account is active on the package (approval,
//     or an admin moving it onto a paid package); each recorded payment
//     moves the date forward. Past it without a payment → suspended.
//   * Suspended               → can sign in, see what is owed, read
//     notifications and manage their package; everything else is refused
//     with 402 until an admin records a payment.
//   * Approved upgrade/downgrade → next_plan_id, switched in at
//     next_plan_effective_at (the end of the period already paid for).
//
// reconcileSubject() applies those rules to one account and is safe to run
// any number of times; the billing job runs it for everyone every few
// minutes, and the request-time check runs it for the caller when their
// period has just run out, so enforcement never waits on the job.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const REMINDER_WINDOW_DAYS = 7;

export type BillingStatus = 'free' | 'not_started' | 'active' | 'expiring' | 'suspended';

export interface BillingState {
  status: BillingStatus;
  expires_at: string | null;
  suspended_at: string | null;
  /** Whole days left (rounded up) in the covered period; null when there is no cycle. */
  days_left: number | null;
  next_plan: { id: number; name: string; price_monthly: number; currency: string } | null;
  next_plan_effective_at: string | null;
}

interface BillingRow {
  plan_id: number | null;
  plan_expires_at: Date | null;
  plan_suspended_at: Date | null;
  next_plan_id: number | null;
  next_plan_effective_at: Date | null;
  is_active: boolean;
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

const tableFor = (subject: Pick<PlanSubject, 'kind'>): string =>
  subject.kind === 'user' ? 'public.users' : 'public.organizations';

const loadRow = async (db: Queryable, subject: PlanSubject, lock = false): Promise<BillingRow | null> => {
  const { rows } = await db.query(
    `SELECT plan_id, plan_expires_at, plan_suspended_at, next_plan_id, next_plan_effective_at, is_active
       FROM ${tableFor(subject)} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [subject.id]
  );
  return (rows[0] as BillingRow) ?? null;
};

export const isPaid = (plan: Pick<Plan, 'price_monthly'> | null | undefined): boolean =>
  !!plan && Number(plan.price_monthly) > 0;

/** Pure: the state an account is in, from its row and its current plan. */
export const computeBillingState = (
  row: Pick<BillingRow, 'plan_expires_at' | 'plan_suspended_at' | 'next_plan_effective_at'>,
  plan: Pick<Plan, 'price_monthly'> | null,
  nextPlan: Plan | null,
  now = new Date(),
): BillingState => {
  const expires = row.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const base = {
    expires_at: expires ? expires.toISOString() : null,
    suspended_at: row.plan_suspended_at ? new Date(row.plan_suspended_at).toISOString() : null,
    next_plan: nextPlan
      ? { id: nextPlan.id, name: nextPlan.name, price_monthly: nextPlan.price_monthly, currency: nextPlan.currency }
      : null,
    next_plan_effective_at: row.next_plan_effective_at ? new Date(row.next_plan_effective_at).toISOString() : null,
  };
  if (!isPaid(plan)) return { ...base, status: 'free', days_left: null };
  if (!expires) return { ...base, status: 'not_started', days_left: null };
  const msLeft = expires.getTime() - now.getTime();
  if (row.plan_suspended_at || msLeft <= 0) return { ...base, status: 'suspended', days_left: 0 };
  const days_left = Math.ceil(msLeft / DAY_MS);
  return { ...base, status: days_left <= REMINDER_WINDOW_DAYS ? 'expiring' : 'active', days_left };
};

/** The date one or more calendar months after `from` (Postgres-style month arithmetic). */
export const addMonths = (from: Date, months: number): Date => {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
};

// ── Who to tell ──────────────────────────────────────────────────────────────

/** The person who holds the account: the user, or the organisation's owner. */
export const accountHolder = async (subject: Pick<PlanSubject, 'kind' | 'id'>): Promise<{ userId: number | null; name: string }> => {
  if (subject.kind === 'user') {
    const { rows: [u] } = await pool.query('SELECT id, name FROM public.users WHERE id = $1', [subject.id]);
    return { userId: u?.id ?? null, name: u?.name ?? 'Account' };
  }
  const { rows: [o] } = await pool.query('SELECT owner_user_id, name FROM public.organizations WHERE id = $1', [subject.id]);
  return { userId: o?.owner_user_id ?? null, name: o?.name ?? 'Organization' };
};

export const notifyAdmins = async (type: string, title: string, message: string, data: Record<string, unknown> = {}): Promise<void> => {
  const { rows } = await pool.query("SELECT id FROM public.users WHERE role = 'admin' AND is_active AND deleted_at IS NULL");
  await Promise.all(rows.map(a => sendNotification(a.id, type, title, message, data)));
};

const fmtDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });

// ── Plan switching ───────────────────────────────────────────────────────────

/**
 * Moves an account onto another package and keeps the billing columns
 * consistent with it. Runs on the caller's transaction.
 *   → free package:        no cycle any more (dates and suspension cleared)
 *   → paid, no cycle yet:  first period starts now
 *   → paid, cycle running: the paid-up date is kept (prices change from the
 *                          next payment)
 */
export const switchPlan = async (
  client: Queryable,
  subject: PlanSubject,
  toPlan: Plan,
  opts: { assignedBy: number | null; reason: 'admin_change' | 'change_request'; note?: string | null; previousPlanId: number | null },
): Promise<void> => {
  const table = tableFor(subject);
  if (isPaid(toPlan)) {
    await client.query(
      `UPDATE ${table}
          SET plan_id = $2, next_plan_id = NULL, next_plan_effective_at = NULL,
              plan_expires_at = COALESCE(plan_expires_at, NOW() + INTERVAL '1 month')
        WHERE id = $1`,
      [subject.id, toPlan.id]
    );
  } else {
    await client.query(
      `UPDATE ${table}
          SET plan_id = $2, next_plan_id = NULL, next_plan_effective_at = NULL,
              plan_expires_at = NULL, plan_suspended_at = NULL
        WHERE id = $1`,
      [subject.id, toPlan.id]
    );
  }
  await client.query(
    `INSERT INTO public.plan_assignments (user_id, organization_id, previous_plan_id, plan_id, assigned_by, reason, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [subject.kind === 'user' ? subject.id : null, subject.kind === 'organization' ? subject.id : null,
      opts.previousPlanId, toPlan.id, opts.assignedBy, opts.reason, opts.note ?? null]
  );
};

// ── Reconcile ────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  state: BillingState;
  plan: Plan | null;
  /** True only on the run that actually suspended the account. */
  suspendedNow: boolean;
  switchedTo: Plan | null;
  started: boolean;
}

/**
 * Applies the billing rules to one account. Idempotent: every transition is
 * a conditional UPDATE, so two runs racing (the job and a request) cannot
 * both perform it.
 */
export const reconcileSubject = async (subject: PlanSubject, now = new Date()): Promise<ReconcileResult | null> => {
  const client = await pool.connect();
  let switchedTo: Plan | null = null;
  let suspendedNow = false;
  let started = false;
  try {
    await client.query('BEGIN');
    let row = await loadRow(client, subject, true);
    if (!row) { await client.query('ROLLBACK'); return null; }
    let plan = await loadPlan(subject.audience, row.plan_id);

    // 1. A scheduled upgrade/downgrade whose time has come.
    if (row.next_plan_id && row.next_plan_effective_at && new Date(row.next_plan_effective_at) <= now) {
      const next = await loadPlan(subject.audience, row.next_plan_id);
      if (next && next.id === row.next_plan_id) {
        const { rows: [req] } = await client.query(
          `UPDATE public.plan_change_requests SET status = 'applied', applied_at = NOW()
            WHERE ${subject.kind === 'user' ? 'user_id' : 'organization_id'} = $1 AND status = 'approved'
            RETURNING decided_by`,
          [subject.id]
        );
        await switchPlan(client, subject, next, {
          assignedBy: req?.decided_by ?? null, reason: 'change_request', previousPlanId: plan?.id ?? null,
          note: 'Scheduled package change took effect',
        });
        switchedTo = next;
      } else {
        await client.query(`UPDATE ${tableFor(subject)} SET next_plan_id = NULL, next_plan_effective_at = NULL WHERE id = $1`, [subject.id]);
      }
      row = (await loadRow(client, subject))!;
      plan = await loadPlan(subject.audience, row.plan_id);
    }

    if (isPaid(plan)) {
      // 2. A paid package with no cycle yet (approved since the last run, or
      //    put on a paid package directly in the database): start it.
      if (!row.plan_expires_at && row.is_active) {
        const r = await client.query(
          `UPDATE ${tableFor(subject)} SET plan_expires_at = NOW() + INTERVAL '1 month'
            WHERE id = $1 AND plan_expires_at IS NULL`, [subject.id]);
        started = (r.rowCount ?? 0) > 0;
      }
      // 3. The covered period ran out unpaid.
      if (row.plan_expires_at && new Date(row.plan_expires_at) <= now && !row.plan_suspended_at) {
        const r = await client.query(
          `UPDATE ${tableFor(subject)} SET plan_suspended_at = NOW()
            WHERE id = $1 AND plan_suspended_at IS NULL AND plan_expires_at <= NOW()`, [subject.id]);
        suspendedNow = (r.rowCount ?? 0) > 0;
      }
    } else if (row.plan_expires_at || row.plan_suspended_at) {
      // 4. Now on a free package: nothing to bill.
      await client.query(
        `UPDATE ${tableFor(subject)} SET plan_expires_at = NULL, plan_suspended_at = NULL WHERE id = $1`, [subject.id]);
    }

    await client.query('COMMIT');

    const fresh = (await loadRow(pool, subject))!;
    const nextPlan = fresh.next_plan_id ? await loadPlan(subject.audience, fresh.next_plan_id) : null;
    return { state: computeBillingState(fresh, plan, nextPlan, now), plan, suspendedNow, switchedTo, started };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

/** Read-only: the billing state of an account, without changing anything. */
export const billingStateFor = async (subject: PlanSubject, plan?: Plan | null): Promise<BillingState> => {
  const row = await loadRow(pool, subject);
  if (!row) return computeBillingState({ plan_expires_at: null, plan_suspended_at: null, next_plan_effective_at: null }, null, null);
  const current = plan === undefined ? await loadPlan(subject.audience, row.plan_id) : plan;
  const nextPlan = row.next_plan_id ? await loadPlan(subject.audience, row.next_plan_id) : null;
  return computeBillingState(row, current, nextPlan);
};

// ── Request-time enforcement ─────────────────────────────────────────────────

// Routes a suspended account can still use: signing in and out, its own
// package and billing (so it can see what is owed and request a change),
// notifications, its own profile/organisations (the app shell needs them),
// and exporting its own data.
const ALWAYS_ALLOWED = [
  '/api/auth', '/api/plans/me', '/api/plans/public', '/api/billing/me',
  '/api/notifications', '/api/users/me', '/api/data-export',
];

export const isAllowedWhileSuspended = (path: string): boolean =>
  ALWAYS_ALLOWED.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));

// A short per-user cache: this runs on every request from a professional
// account, and a payment being recorded clears it (clearBillingCache).
const CACHE_MS = 20_000;
const cache = new Map<number, { at: number; block: SubscriptionBlock | null }>();

export const clearBillingCache = (): void => cache.clear();

export interface SubscriptionBlock {
  code: 'SUBSCRIPTION_EXPIRED';
  message: string;
  subject: PlanSubject;
  expires_at: string | null;
}

const ROLES_WITH_PLANS = new Set(['doctor', 'pharmacist', 'laboratory']);

/**
 * Whether this user's dashboard is locked for non-payment. null = go ahead.
 * Patients and admins are never blocked.
 */
export const subscriptionBlockFor = async (user: { id: number; role: string }): Promise<SubscriptionBlock | null> => {
  if (!ROLES_WITH_PLANS.has(user.role)) return null;
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.block;

  const subject = await resolvePlanSubject(user);
  if (!subject) return null;
  const row = await loadRow(pool, subject);
  if (!row) return null;

  let suspended = !!row.plan_suspended_at;
  let expiresAt = row.plan_expires_at;
  const due = (row.plan_expires_at && new Date(row.plan_expires_at) <= new Date())
    || (row.next_plan_id && row.next_plan_effective_at && new Date(row.next_plan_effective_at) <= new Date());
  if (!suspended && due) {
    // The period has just ended (or a scheduled change is due) and the job
    // has not run yet — settle it now rather than letting it slide.
    const result = await reconcileSubject(subject);
    if (result?.suspendedNow) await sendSuspensionNotices(subject, row.plan_expires_at!).catch(() => {});
    suspended = result?.state.status === 'suspended';
    expiresAt = result?.state.expires_at ? new Date(result.state.expires_at) : null;
  }

  const block: SubscriptionBlock | null = suspended
    ? {
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your package has expired and payment is due. Your dashboard will open again as soon as the payment is recorded.',
        subject,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      }
    : null;
  cache.set(user.id, { at: Date.now(), block });
  return block;
};

/** Whether an organisation's dashboard is locked for non-payment. */
export const organizationSuspended = async (organizationId: number): Promise<boolean> => {
  const { rows: [o] } = await pool.query('SELECT org_type FROM public.organizations WHERE id = $1', [organizationId]);
  if (!o) return false;
  const subject: PlanSubject = { kind: 'organization', id: organizationId, audience: o.org_type };
  return (await billingStateFor(subject)).status === 'suspended';
};

// ── Notices ──────────────────────────────────────────────────────────────────

/** Records that a reminder stage was sent; false if it already had been. */
const claimNotice = async (subject: PlanSubject, periodEnd: Date, stage: '7d' | '3d' | '1d' | 'expired'): Promise<boolean> => {
  const col = subject.kind === 'user' ? 'user_id' : 'organization_id';
  const { rows } = await pool.query(
    `INSERT INTO public.billing_notices (${col}, period_end, stage) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING id`,
    [subject.id, periodEnd, stage]
  );
  return rows.length > 0;
};

export const sendSuspensionNotices = async (subject: PlanSubject, periodEnd: Date): Promise<void> => {
  if (!(await claimNotice(subject, new Date(periodEnd), 'expired'))) return;
  const holder = await accountHolder(subject);
  const data = { kind: subject.kind, id: subject.id, audience: subject.audience };
  if (holder.userId) {
    await sendNotification(holder.userId, 'billing_suspended', 'Package expired — payment due',
      subject.kind === 'organization'
        ? `${holder.name}'s package expired on ${fmtDate(periodEnd)}. The dashboard is locked until the payment is received.`
        : `Your package expired on ${fmtDate(periodEnd)}. Your dashboard is locked until the payment is received.`,
      data);
  }
  await notifyAdmins('billing_admin_suspended', 'Account suspended for payment',
    `${holder.name} (${subject.audience}) expired on ${fmtDate(periodEnd)} without a payment and is now locked.`, data);
};

const sendReminder = async (subject: PlanSubject, periodEnd: Date, daysLeft: number, planName: string, price: string): Promise<void> => {
  const stage = daysLeft <= 1 ? '1d' : daysLeft <= 3 ? '3d' : '7d';
  if (!(await claimNotice(subject, periodEnd, stage))) return;
  const holder = await accountHolder(subject);
  const data = { kind: subject.kind, id: subject.id, audience: subject.audience, days_left: daysLeft, expires_at: periodEnd };
  const when = daysLeft <= 1 ? 'within a day' : `in ${daysLeft} days`;
  if (holder.userId) {
    await sendNotification(holder.userId, 'billing_expiring', `Payment due ${when}`,
      `${subject.kind === 'organization' ? `${holder.name}'s` : 'Your'} ${planName} package (${price} / month) expires on ${fmtDate(periodEnd)}. ` +
      'Pay before then to keep the dashboard open.',
      data);
  }
  // Admins hear about it once per period — at the first reminder — and see
  // the live countdown on their dashboard from then on.
  if (stage === '7d' || daysLeft <= 1) {
    await notifyAdmins('billing_admin_expiring', `Payment due ${when}`,
      `${holder.name} (${subject.audience}, ${planName}) expires on ${fmtDate(periodEnd)}.`, data);
  }
};

// ── The job ──────────────────────────────────────────────────────────────────

// Every account that can hold a package, with its billing columns and the
// plan it is effectively on. Same population as planController's
// SUBJECTS_CTE: doctors, org-less pharmacist/laboratory accounts, and
// organisations.
export const BILLING_SUBJECTS_CTE = `
  WITH subjects AS (
    SELECT 'user'::text AS kind, u.id, u.name, u.email AS contact,
           CASE u.role WHEN 'doctor' THEN 'doctor' WHEN 'pharmacist' THEN 'pharmacy' ELSE 'laboratory' END AS audience,
           u.plan_id AS own_plan_id, u.is_active, u.approved_at, u.created_at, u.id AS holder_user_id,
           u.plan_expires_at, u.plan_suspended_at, u.next_plan_id, u.next_plan_effective_at
      FROM public.users u
     WHERE u.deleted_at IS NULL
       AND (u.role = 'doctor'
            OR (u.role IN ('pharmacist','laboratory') AND NOT EXISTS (
                  SELECT 1 FROM public.organization_members om
                    JOIN public.organizations o ON o.id = om.organization_id
                   WHERE om.user_id = u.id
                     AND o.org_type = CASE u.role WHEN 'pharmacist' THEN 'pharmacy' ELSE 'laboratory' END)))
    UNION ALL
    SELECT 'organization', o.id, o.name, ou.email, o.org_type, o.plan_id, o.is_active, o.approved_at, o.created_at, o.owner_user_id,
           o.plan_expires_at, o.plan_suspended_at, o.next_plan_id, o.next_plan_effective_at
      FROM public.organizations o
      LEFT JOIN public.users ou ON ou.id = o.owner_user_id
  ),
  billing AS (
    SELECT s.*, p.id AS plan_id, p.name AS plan_name, p.price_monthly::float AS price_monthly, p.currency,
           np.name AS next_plan_name, np.price_monthly::float AS next_plan_price
      FROM subjects s
      LEFT JOIN public.plans d  ON d.audience = s.audience AND d.is_default
      LEFT JOIN public.plans p  ON p.id = COALESCE(s.own_plan_id, d.id)
      LEFT JOIN public.plans np ON np.id = s.next_plan_id
  )`;

const money = (amount: number, currency: string): string =>
  `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * One pass over every account that has anything billing-related to do:
 * scheduled changes, periods to start, periods that ran out, reminders.
 */
export const runBillingCycle = async (now = new Date()): Promise<{ reconciled: number; reminders: number; suspended: number }> => {
  const { rows } = await pool.query(
    `${BILLING_SUBJECTS_CTE}
     SELECT kind, id, audience, plan_name, price_monthly, currency, is_active,
            plan_expires_at, plan_suspended_at, next_plan_id, next_plan_effective_at
       FROM billing
      WHERE (next_plan_id IS NOT NULL AND next_plan_effective_at <= NOW())
         OR (price_monthly > 0 AND is_active AND plan_expires_at IS NULL)
         OR (price_monthly > 0 AND plan_suspended_at IS NULL AND plan_expires_at <= NOW() + INTERVAL '${REMINDER_WINDOW_DAYS} days')
         OR (COALESCE(price_monthly, 0) = 0 AND (plan_expires_at IS NOT NULL OR plan_suspended_at IS NOT NULL))`
  );

  let reconciled = 0;
  let reminders = 0;
  let suspended = 0;
  for (const r of rows) {
    const subject: PlanSubject = { kind: r.kind, id: r.id, audience: r.audience as PlanAudience };
    try {
      const result = await reconcileSubject(subject, now);
      if (!result) continue;
      reconciled++;
      const { state, plan } = result;
      if (result.switchedTo) {
        const holder = await accountHolder(subject);
        if (holder.userId) {
          await sendNotification(holder.userId, 'plan_change_applied', 'Package changed',
            `${subject.kind === 'organization' ? `${holder.name} is` : 'You are'} now on the ${result.switchedTo.name} package.`,
            { kind: subject.kind, id: subject.id, plan_id: result.switchedTo.id });
        }
      }
      if (state.status === 'suspended' && state.expires_at) {
        await sendSuspensionNotices(subject, new Date(state.expires_at));
        if (result.suspendedNow) suspended++;
      } else if (state.status === 'expiring' && state.expires_at && plan && r.is_active) {
        await sendReminder(subject, new Date(state.expires_at), state.days_left ?? 0, plan.name, money(plan.price_monthly, plan.currency));
        reminders++;
      }
    } catch (err) {
      logger.error({ err, subject }, 'Billing cycle failed for one account; continuing with the rest');
    }
  }
  if (suspended || reminders) clearBillingCache();
  return { reconciled, reminders, suspended };
};

export const PAYMENT_INSTRUCTIONS = (): string =>
  process.env.BILLING_PAYMENT_INSTRUCTIONS?.trim() ||
  'Pay by bank transfer or at the Suwela office, quoting the email address of this account. ' +
  'As soon as the Suwela team records the payment, your package runs for another month.';
