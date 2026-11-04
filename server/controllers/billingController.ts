import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { isPlanAudience } from '../config/planCatalog';
import { loadPlan, planForOrganization, effectivePlanForUser, PlanSubject } from '../utils/plans';
import {
  BILLING_SUBJECTS_CTE, REMINDER_WINDOW_DAYS, PAYMENT_INSTRUCTIONS,
  addMonths, isPaid, switchPlan, accountHolder, clearBillingCache, billingStateFor,
} from '../utils/subscriptions';
import { sendNotification } from '../utils/notify';
import { audit, AuditAction } from '../utils/auditLog';
import { parsePaging } from '../utils/pagination';

// Billing for paid packages (migration 016): payments an admin records, the
// admin's overview of who is due, and upgrade/downgrade approvals. The rules
// themselves live in utils/subscriptions.ts.

const fmtDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
const money = (amount: number, currency: string): string =>
  `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const subjectCol = (kind: PlanSubject['kind']): 'user_id' | 'organization_id' =>
  kind === 'user' ? 'user_id' : 'organization_id';
const subjectTable = (kind: PlanSubject['kind']): string =>
  kind === 'user' ? 'public.users' : 'public.organizations';

/** The account an admin URL (/:kind/:id) refers to, if it can hold a package. */
const subjectFromParams = async (kind: string, id: number): Promise<PlanSubject | null> => {
  if (!Number.isInteger(id)) return null;
  if (kind === 'user') {
    const { rows: [u] } = await pool.query('SELECT role FROM public.users WHERE id = $1 AND deleted_at IS NULL', [id]);
    const audience = u?.role === 'doctor' ? 'doctor' : u?.role === 'pharmacist' ? 'pharmacy' : u?.role === 'laboratory' ? 'laboratory' : null;
    return audience ? { kind: 'user', id, audience } : null;
  }
  if (kind === 'organization') {
    const { rows: [o] } = await pool.query('SELECT org_type FROM public.organizations WHERE id = $1', [id]);
    return o && isPlanAudience(o.org_type) ? { kind: 'organization', id, audience: o.org_type } : null;
  }
  return null;
};

/** The caller's own account (or an organisation they belong to). */
const callerSubject = async (req: Request): Promise<{ subject: PlanSubject; isHolder: boolean } | { error: number; message: string }> => {
  const orgId = req.query.organization_id ? Number(req.query.organization_id) : null;
  if (orgId) {
    if (!Number.isInteger(orgId)) return { error: 400, message: 'Invalid organization_id' };
    const { rows } = await pool.query(
      'SELECT member_role FROM public.organization_members WHERE organization_id = $1 AND user_id = $2', [orgId, req.user.id]);
    if (!rows.length) return { error: 403, message: 'You are not a member of this organization' };
    const found = await planForOrganization(orgId);
    if (!found) return { error: 404, message: 'This organization is not on a package' };
    return { subject: found.subject, isHolder: rows[0].member_role === 'owner' };
  }
  const effective = await effectivePlanForUser(req.user);
  if (!effective) return { error: 400, message: 'This account is not on a package' };
  // A pharmacist/lab account acting for its organisation is not the one who pays.
  let isHolder = effective.subject.kind === 'user';
  if (!isHolder) {
    const { rows } = await pool.query(
      "SELECT 1 FROM public.organization_members WHERE organization_id = $1 AND user_id = $2 AND member_role = 'owner'",
      [effective.subject.id, req.user.id]);
    isHolder = rows.length > 0;
  }
  return { subject: effective.subject, isHolder };
};

const PAYMENT_SELECT = `
  SELECT sp.id, sp.user_id, sp.organization_id, sp.amount::float AS amount, sp.currency, sp.method, sp.reference,
         sp.note, sp.months, sp.period_start, sp.period_end, sp.created_at,
         p.name AS plan_name, rb.name AS recorded_by_name,
         COALESCE(u.name, o.name) AS account_name
    FROM public.subscription_payments sp
    LEFT JOIN public.plans p          ON p.id = sp.plan_id
    LEFT JOIN public.users rb         ON rb.id = sp.recorded_by
    LEFT JOIN public.users u          ON u.id = sp.user_id
    LEFT JOIN public.organizations o  ON o.id = sp.organization_id`;

const REQUEST_SELECT = `
  SELECT r.id, r.user_id, r.organization_id, r.status, r.direction, r.message, r.decision_note,
         r.created_at, r.decided_at, r.effective_at, r.applied_at,
         r.from_plan_id, fp.name AS from_plan_name, fp.price_monthly::float AS from_plan_price,
         r.to_plan_id, tp.name AS to_plan_name, tp.price_monthly::float AS to_plan_price, tp.currency,
         COALESCE(u.name, o.name) AS account_name, COALESCE(u.email, ou.email) AS contact,
         CASE WHEN r.user_id IS NOT NULL THEN 'user' ELSE 'organization' END AS kind,
         COALESCE(r.user_id, r.organization_id) AS account_id,
         tp.audience, rq.name AS requested_by_name, db.name AS decided_by_name,
         COALESCE(u.plan_expires_at, o.plan_expires_at) AS plan_expires_at,
         COALESCE(u.plan_suspended_at, o.plan_suspended_at) AS plan_suspended_at
    FROM public.plan_change_requests r
    JOIN public.plans tp              ON tp.id = r.to_plan_id
    LEFT JOIN public.plans fp         ON fp.id = r.from_plan_id
    LEFT JOIN public.users u          ON u.id = r.user_id
    LEFT JOIN public.organizations o  ON o.id = r.organization_id
    LEFT JOIN public.users ou         ON ou.id = o.owner_user_id
    LEFT JOIN public.users rq         ON rq.id = r.requested_by
    LEFT JOIN public.users db         ON db.id = r.decided_by`;

// ── Account holder ───────────────────────────────────────────────────────────

/** The caller's payments, package-change requests and how to pay. */
const getMyBilling = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const found = await callerSubject(req);
    if ('error' in found) { res.status(found.error).json({ message: found.message }); return; }
    const { subject, isHolder } = found;
    const col = subjectCol(subject.kind);
    const { rows: [own] } = await pool.query(`SELECT plan_id FROM ${subjectTable(subject.kind)} WHERE id = $1`, [subject.id]);
    const plan = await loadPlan(subject.audience, own?.plan_id ?? null);
    const [{ rows: payments }, { rows: requests }, billing] = await Promise.all([
      pool.query(`${PAYMENT_SELECT} WHERE sp.${col} = $1 ORDER BY sp.created_at DESC LIMIT 24`, [subject.id]),
      pool.query(`${REQUEST_SELECT} WHERE r.${col} = $1 ORDER BY r.created_at DESC LIMIT 12`, [subject.id]),
      billingStateFor(subject, plan),
    ]);
    res.json({ subject, is_holder: isHolder, plan, billing, payments, requests, instructions: PAYMENT_INSTRUCTIONS() });
  } catch (err) { next(err); }
};

/** The account holder withdraws a package change that has not happened yet. */
const cancelMyRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [r] } = await client.query(
      `SELECT r.*, o.owner_user_id FROM public.plan_change_requests r
         LEFT JOIN public.organizations o ON o.id = r.organization_id
        WHERE r.id = $1 FOR UPDATE OF r`, [req.params.id]);
    const mine = r && (r.user_id === req.user.id || r.owner_user_id === req.user.id);
    if (!mine) { await client.query('ROLLBACK'); res.status(404).json({ message: 'Request not found' }); return; }
    if (!['pending', 'approved'].includes(r.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'This request has already been closed' });
      return;
    }
    await client.query(
      `UPDATE public.plan_change_requests SET status = 'cancelled', decided_at = COALESCE(decided_at, NOW()) WHERE id = $1`, [r.id]);
    if (r.status === 'approved') {
      const kind: PlanSubject['kind'] = r.user_id ? 'user' : 'organization';
      await client.query(
        `UPDATE ${subjectTable(kind)} SET next_plan_id = NULL, next_plan_effective_at = NULL WHERE id = $1 AND next_plan_id = $2`,
        [r.user_id ?? r.organization_id, r.to_plan_id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Package change cancelled' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// ── Admin: overview & accounts ───────────────────────────────────────────────

const STATUS_SQL = `
  CASE
    WHEN COALESCE(price_monthly, 0) = 0 THEN 'free'
    WHEN plan_expires_at IS NULL THEN 'not_started'
    WHEN plan_suspended_at IS NOT NULL OR plan_expires_at <= NOW() THEN 'suspended'
    WHEN plan_expires_at <= NOW() + INTERVAL '${REMINDER_WINDOW_DAYS} days' THEN 'expiring'
    ELSE 'active'
  END`;

const ACCOUNT_COLUMNS = `
  kind, id, name, contact, audience, is_active, plan_id, plan_name, price_monthly, currency,
  plan_expires_at, plan_suspended_at, next_plan_id, next_plan_name, next_plan_price, next_plan_effective_at,
  ${STATUS_SQL} AS billing_status,
  (SELECT MAX(sp.created_at) FROM public.subscription_payments sp
    WHERE (kind = 'user' AND sp.user_id = billing.id) OR (kind = 'organization' AND sp.organization_id = billing.id)) AS last_payment_at`;

/** Everything the admin dashboard needs to see who is due, at a glance. */
const overview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [counts, expiring, suspended, payments, collected, expected, requests] = await Promise.all([
      pool.query(`${BILLING_SUBJECTS_CTE}
        SELECT ${STATUS_SQL} AS status, COUNT(*)::int AS n FROM billing GROUP BY 1`),
      pool.query(`${BILLING_SUBJECTS_CTE}
        SELECT ${ACCOUNT_COLUMNS} FROM billing
         WHERE price_monthly > 0 AND plan_suspended_at IS NULL
           AND plan_expires_at > NOW() AND plan_expires_at <= NOW() + INTERVAL '${REMINDER_WINDOW_DAYS} days'
         ORDER BY plan_expires_at ASC LIMIT 50`),
      pool.query(`${BILLING_SUBJECTS_CTE}
        SELECT ${ACCOUNT_COLUMNS} FROM billing
         WHERE price_monthly > 0 AND (plan_suspended_at IS NOT NULL OR plan_expires_at <= NOW())
         ORDER BY COALESCE(plan_suspended_at, plan_expires_at) ASC LIMIT 50`),
      pool.query(`${PAYMENT_SELECT} ORDER BY sp.created_at DESC LIMIT 10`),
      pool.query(`SELECT currency, SUM(amount)::float AS amount, COUNT(*)::int AS payments
                    FROM public.subscription_payments WHERE created_at >= date_trunc('month', NOW())
                   GROUP BY currency`),
      pool.query(`${BILLING_SUBJECTS_CTE}
        SELECT currency, SUM(COALESCE(next_plan_price, price_monthly))::float AS amount, COUNT(*)::int AS accounts
          FROM billing
         WHERE price_monthly > 0 AND is_active AND plan_expires_at <= NOW() + INTERVAL '30 days'
         GROUP BY currency`),
      pool.query(`SELECT status, COUNT(*)::int AS n FROM public.plan_change_requests
                   WHERE status IN ('pending','approved') GROUP BY status`),
    ]);
    const byStatus = Object.fromEntries(counts.rows.map(r => [r.status, r.n]));
    const byReq = Object.fromEntries(requests.rows.map(r => [r.status, r.n]));
    res.json({
      counts: {
        free: byStatus.free ?? 0,
        not_started: byStatus.not_started ?? 0,
        active: byStatus.active ?? 0,
        expiring: byStatus.expiring ?? 0,
        suspended: byStatus.suspended ?? 0,
        paid: (byStatus.active ?? 0) + (byStatus.expiring ?? 0) + (byStatus.suspended ?? 0) + (byStatus.not_started ?? 0),
        pending_requests: byReq.pending ?? 0,
        scheduled_changes: byReq.approved ?? 0,
      },
      collected_this_month: collected.rows,
      due_next_30_days: expected.rows,
      expiring: expiring.rows,
      suspended: suspended.rows,
      recent_payments: payments.rows,
    });
  } catch (err) { next(err); }
};

const listAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePaging(q, { defaultLimit: 50, maxLimit: 200 });
    const where: string[] = [];
    const params: unknown[] = [];
    const status = q.status || 'paid';
    if (status === 'paid') where.push('price_monthly > 0');
    else if (['free', 'not_started', 'active', 'expiring', 'suspended'].includes(status)) {
      params.push(status); where.push(`${STATUS_SQL} = $${params.length}`);
    } else if (status !== 'all') { res.status(400).json({ message: 'Invalid status' }); return; }
    if (q.audience) {
      if (!isPlanAudience(q.audience)) { res.status(400).json({ message: 'Invalid audience' }); return; }
      params.push(q.audience); where.push(`audience = $${params.length}`);
    }
    if (q.q && q.q.trim()) { params.push(`%${q.q.trim()}%`); where.push(`(name ILIKE $${params.length} OR contact ILIKE $${params.length})`); }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query(`${BILLING_SUBJECTS_CTE} SELECT COUNT(*)::int AS total FROM billing ${filter}`, params);
    params.push(limit, offset);
    const { rows } = await pool.query(
      `${BILLING_SUBJECTS_CTE}
       SELECT ${ACCOUNT_COLUMNS} FROM billing ${filter}
        ORDER BY (plan_expires_at IS NULL), plan_expires_at ASC, name
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total, limit, offset, rows });
  } catch (err) { next(err); }
};

const accountPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const subject = await subjectFromParams(String(req.params.kind), Number(req.params.id));
    if (!subject) { res.status(404).json({ message: 'Account not found' }); return; }
    const { rows } = await pool.query(
      `${PAYMENT_SELECT} WHERE sp.${subjectCol(subject.kind)} = $1 ORDER BY sp.created_at DESC LIMIT 50`, [subject.id]);
    res.json({ subject, billing: await billingStateFor(subject), payments: rows });
  } catch (err) { next(err); }
};

// ── Admin: record a payment ──────────────────────────────────────────────────

/**
 * "Payment received". Extends the account by `months` (default 1): from the
 * end of the period already covered if it is still running, or from now if
 * it had lapsed — so a late payer gets a full month from the day they pay,
 * and an early payer loses nothing. Lifts a suspension immediately.
 */
const recordPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const subject = await subjectFromParams(String(req.params.kind), Number(req.params.id));
    if (!subject) { res.status(404).json({ message: 'Account not found' }); return; }
    const b = req.body as { amount?: number; months?: number; method?: string; reference?: string; note?: string };
    const months = b.months ?? 1;

    await client.query('BEGIN');
    const { rows: [row] } = await client.query(
      `SELECT plan_id, plan_expires_at, plan_suspended_at, next_plan_id, next_plan_effective_at
         FROM ${subjectTable(subject.kind)} WHERE id = $1 FOR UPDATE`, [subject.id]);
    let plan = await loadPlan(subject.audience, row.plan_id);
    const now = new Date();
    const expires = row.plan_expires_at ? new Date(row.plan_expires_at) : null;
    const lapsed = !!row.plan_suspended_at || !expires || expires <= now;

    // A scheduled change already due (the account lapsed across its start
    // date) is applied first, so the payment is for the right package.
    if (row.next_plan_id && row.next_plan_effective_at && new Date(row.next_plan_effective_at) <= now) {
      const next = await loadPlan(subject.audience, row.next_plan_id);
      if (next) {
        await switchPlan(client, subject, next, {
          assignedBy: req.user.id, reason: 'change_request', previousPlanId: plan?.id ?? null,
          note: 'Scheduled package change applied when payment was recorded',
        });
        await client.query(
          `UPDATE public.plan_change_requests SET status = 'applied', applied_at = NOW()
            WHERE ${subjectCol(subject.kind)} = $1 AND status = 'approved'`, [subject.id]);
        plan = next;
      }
    }
    if (!isPaid(plan)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'This account is on a free package — there is nothing to pay.' });
      return;
    }

    const periodStart = lapsed ? now : expires!;
    // The package this payment pays for: a change scheduled to start by then.
    let paidPlan = plan!;
    if (row.next_plan_id && row.next_plan_effective_at && new Date(row.next_plan_effective_at) <= periodStart) {
      paidPlan = (await loadPlan(subject.audience, row.next_plan_id)) ?? plan!;
    }
    const periodEnd = addMonths(periodStart, months);
    const amount = b.amount ?? Math.round(paidPlan.price_monthly * months * 100) / 100;

    await client.query(
      `UPDATE ${subjectTable(subject.kind)} SET plan_expires_at = $2, plan_suspended_at = NULL WHERE id = $1`,
      [subject.id, periodEnd]);
    const { rows: [payment] } = await client.query(
      `INSERT INTO public.subscription_payments
         (user_id, organization_id, plan_id, amount, currency, method, reference, note, months, period_start, period_end, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [subject.kind === 'user' ? subject.id : null, subject.kind === 'organization' ? subject.id : null,
        paidPlan.id, amount, paidPlan.currency, b.method || 'bank_transfer', b.reference?.trim() || null,
        b.note?.trim() || null, months, periodStart, periodEnd, req.user.id]);
    await client.query('COMMIT');
    clearBillingCache();

    audit(req, {
      action: AuditAction.BILLING_PAYMENT_RECORDED, targetType: subject.kind, targetId: subject.id,
      metadata: { payment_id: payment.id, amount, currency: paidPlan.currency, months, period_end: periodEnd, was_suspended: !!row.plan_suspended_at },
    });
    const holder = await accountHolder(subject);
    if (holder.userId) {
      await sendNotification(holder.userId, 'billing_payment_recorded', 'Payment received',
        `${money(amount, paidPlan.currency)} received for the ${paidPlan.name} package. ` +
        `${subject.kind === 'organization' ? `${holder.name} is` : 'Your dashboard is'} active until ${fmtDate(periodEnd)}.`,
        { kind: subject.kind, id: subject.id, payment_id: payment.id, period_end: periodEnd });
    }
    res.status(201).json({
      message: `Payment recorded. ${holder.name} is active until ${fmtDate(periodEnd)}.`,
      payment_id: payment.id, period_start: periodStart, period_end: periodEnd, amount, currency: paidPlan.currency,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// ── Admin: package change requests ───────────────────────────────────────────

const listChangeRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = String(req.query.status || 'open');
    const filter = status === 'open' ? "WHERE r.status IN ('pending','approved')"
      : status === 'all' ? ''
      : ['pending', 'approved', 'applied', 'rejected', 'cancelled'].includes(status) ? 'WHERE r.status = $1' : null;
    if (filter === null) { res.status(400).json({ message: 'Invalid status' }); return; }
    const { rows } = await pool.query(
      `${REQUEST_SELECT} ${filter} ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 100`,
      filter.includes('$1') ? [status] : []);
    res.json(rows);
  } catch (err) { next(err); }
};

/**
 * Approves an upgrade/downgrade. By default it starts with the next billing
 * period, so the month already paid for runs out on the package it was paid
 * for. An account with no running paid period (free, or lapsed) has no
 * "next period" to wait for, so it switches straight away — as does an
 * explicit timing: 'now'.
 */
const approveChangeRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { timing = 'next_period', note } = req.body as { timing?: 'next_period' | 'now'; note?: string };
    await client.query('BEGIN');
    const { rows: [r] } = await client.query(
      `SELECT * FROM public.plan_change_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!r) { await client.query('ROLLBACK'); res.status(404).json({ message: 'Request not found' }); return; }
    if (r.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `This request is already ${r.status}` });
      return;
    }
    const kind: PlanSubject['kind'] = r.user_id ? 'user' : 'organization';
    const subject = await subjectFromParams(kind, r.user_id ?? r.organization_id);
    if (!subject) { await client.query('ROLLBACK'); res.status(404).json({ message: 'Account not found' }); return; }

    const { rows: [row] } = await client.query(
      `SELECT plan_id, plan_expires_at, plan_suspended_at FROM ${subjectTable(kind)} WHERE id = $1 FOR UPDATE`, [subject.id]);
    const current = await loadPlan(subject.audience, row.plan_id);
    const target = await loadPlan(subject.audience, r.to_plan_id);
    if (!target || target.id !== r.to_plan_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'The requested package no longer exists' });
      return;
    }
    const now = new Date();
    const running = isPaid(current) && !row.plan_suspended_at && row.plan_expires_at && new Date(row.plan_expires_at) > now;
    const scheduled = timing !== 'now' && running;
    const decisionNote = note?.trim() || null;

    if (scheduled) {
      const effective = new Date(row.plan_expires_at);
      await client.query(
        `UPDATE ${subjectTable(kind)} SET next_plan_id = $2, next_plan_effective_at = $3 WHERE id = $1`,
        [subject.id, target.id, effective]);
      await client.query(
        `UPDATE public.plan_change_requests
            SET status = 'approved', decided_by = $2, decided_at = NOW(), decision_note = $3, effective_at = $4
          WHERE id = $1`, [r.id, req.user.id, decisionNote, effective]);
    } else {
      await switchPlan(client, subject, target, {
        assignedBy: req.user.id, reason: 'change_request', previousPlanId: current?.id ?? null, note: decisionNote,
      });
      await client.query(
        `UPDATE public.plan_change_requests
            SET status = 'applied', decided_by = $2, decided_at = NOW(), decision_note = $3, effective_at = NOW(), applied_at = NOW()
          WHERE id = $1`, [r.id, req.user.id, decisionNote]);
    }
    await client.query('COMMIT');
    clearBillingCache();

    audit(req, {
      action: AuditAction.PLAN_CHANGE_APPROVED, targetType: kind, targetId: subject.id,
      metadata: { request_id: r.id, to_plan_id: target.id, scheduled, effective_at: scheduled ? row.plan_expires_at : now },
    });
    const holder = await accountHolder(subject);
    const whose = kind === 'organization' ? `${holder.name}'s` : 'Your';
    if (holder.userId) {
      await sendNotification(holder.userId, 'plan_change_approved', `Package ${r.direction} approved`,
        scheduled
          ? `${whose} move to ${target.name} is approved and starts on ${fmtDate(row.plan_expires_at)}, when the current period ends.`
          : `${whose} package is now ${target.name}.` +
            (isPaid(target) && !isPaid(current) ? ` It runs for a month; pay ${money(target.price_monthly, target.currency)} before it ends to keep it.` : ''),
        { kind, id: subject.id, request_id: r.id, plan_id: target.id });
    }
    res.json({
      message: scheduled
        ? `Approved. ${holder.name} moves to ${target.name} on ${fmtDate(row.plan_expires_at)}.`
        : `Approved. ${holder.name} is now on ${target.name}.`,
      scheduled,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

const rejectChangeRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const note = (req.body as { note?: string }).note?.trim() || null;
    const { rows: [r] } = await pool.query(
      `UPDATE public.plan_change_requests
          SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_note = $3
        WHERE id = $1 AND status = 'pending'
        RETURNING id, user_id, organization_id, to_plan_id, direction`,
      [req.params.id, req.user.id, note]);
    if (!r) { res.status(400).json({ message: 'Only a pending request can be rejected' }); return; }
    const kind: PlanSubject['kind'] = r.user_id ? 'user' : 'organization';
    const { rows: [target] } = await pool.query('SELECT name FROM public.plans WHERE id = $1', [r.to_plan_id]);
    audit(req, { action: AuditAction.PLAN_CHANGE_REJECTED, targetType: kind, targetId: r.user_id ?? r.organization_id, metadata: { request_id: r.id } });
    const holder = await accountHolder({ kind, id: r.user_id ?? r.organization_id });
    if (holder.userId) {
      await sendNotification(holder.userId, 'plan_change_rejected', `Package ${r.direction} not approved`,
        `The request to move to ${target?.name ?? 'another package'} was not approved.${note ? ` Reason: ${note}` : ''}`,
        { kind, id: r.user_id ?? r.organization_id, request_id: r.id });
    }
    res.json({ message: 'Request rejected' });
  } catch (err) { next(err); }
};

export {
  getMyBilling, cancelMyRequest,
  overview, listAccounts, accountPayments, recordPayment,
  listChangeRequests, approveChangeRequest, rejectChangeRequest,
};
