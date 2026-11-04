import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { FEATURE_CATALOG, PLAN_AUDIENCES, PlanAudience, isPlanAudience, validateFeatures } from '../config/planCatalog';
import { toPlan, planForOrganization, effectivePlanForUser, usageSummary, loadPlan, Plan, PlanSubject } from '../utils/plans';
import { parsePaging } from '../utils/pagination';
import { audit, AuditAction } from '../utils/auditLog';
import { sendNotification } from '../utils/notify';
import { billingStateFor, switchPlan, notifyAdmins, clearBillingCache } from '../utils/subscriptions';

// Subscription packages (migration 014).

const PLAN_SELECT = `SELECT p.id, p.audience, p.code, p.name, p.description,
  p.price_monthly::float AS price_monthly, p.price_yearly::float AS price_yearly,
  p.currency, p.features, p.is_default, p.is_active, p.sort_order, p.created_at, p.updated_at
  FROM public.plans p`;

// Every account that can hold a plan, with the plan it is effectively on.
//
// Users: doctors, plus pharmacist/laboratory accounts that belong to no
// organisation of their kind (anyone who does is covered by that
// organisation's plan, so listing them too would count the same dashboard
// twice). Organisations: all of them. Patients and admins never appear — the
// patient side is free and has nothing to assign.
const SUBJECTS_CTE = `
  WITH subjects AS (
    SELECT 'user'::text AS kind, u.id, u.name, u.email AS contact,
           CASE u.role WHEN 'doctor' THEN 'doctor' WHEN 'pharmacist' THEN 'pharmacy' ELSE 'laboratory' END AS audience,
           u.plan_id, u.is_active, u.approved_at, u.created_at,
           u.plan_expires_at, u.plan_suspended_at, u.next_plan_id
      FROM public.users u
     WHERE u.deleted_at IS NULL
       AND (u.role = 'doctor'
            OR (u.role IN ('pharmacist','laboratory') AND NOT EXISTS (
                  SELECT 1 FROM public.organization_members om
                    JOIN public.organizations o ON o.id = om.organization_id
                   WHERE om.user_id = u.id
                     AND o.org_type = CASE u.role WHEN 'pharmacist' THEN 'pharmacy' ELSE 'laboratory' END)))
    UNION ALL
    SELECT 'organization', o.id, o.name, ou.email, o.org_type, o.plan_id, o.is_active, o.approved_at, o.created_at,
           o.plan_expires_at, o.plan_suspended_at, o.next_plan_id
      FROM public.organizations o
      LEFT JOIN public.users ou ON ou.id = o.owner_user_id
  ),
  effective AS (
    SELECT s.*, COALESCE(s.plan_id, d.id) AS effective_plan_id, (s.plan_id IS NULL) AS on_default
      FROM subjects s
      LEFT JOIN public.plans d ON d.audience = s.audience AND d.is_default
  )`;

const catalogPayload = () =>
  PLAN_AUDIENCES.map(audience => ({ audience, features: FEATURE_CATALOG[audience] }));

const parseAudience = (v: unknown): PlanAudience | null => (isPlanAudience(v) ? v : null);

// ── Public ───────────────────────────────────────────────────────────────────

// For the registration pages: the packages a new account can choose. No
// session exists yet, so this is public — it is the same information a
// pricing page would show.
const listPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const audience = parseAudience(req.query.audience);
    if (!audience) { res.status(400).json({ message: 'audience must be one of ' + PLAN_AUDIENCES.join(', ') }); return; }
    const { rows } = await pool.query(
      `${PLAN_SELECT} WHERE p.audience = $1 AND p.is_active ORDER BY p.sort_order, p.price_monthly, p.id`,
      [audience]
    );
    res.json({ audience, features: FEATURE_CATALOG[audience], plans: rows.map(toPlan) });
  } catch (err) { next(err); }
};

// ── Signed-in account ────────────────────────────────────────────────────────

const openRequestFor = async (subject: PlanSubject) => {
  const { rows: [r] } = await pool.query(
    `SELECT r.id, r.status, r.direction, r.message, r.created_at, r.effective_at, r.decided_at,
            r.to_plan_id, tp.name AS to_plan_name, tp.price_monthly::float AS to_plan_price, tp.currency
       FROM public.plan_change_requests r
       JOIN public.plans tp ON tp.id = r.to_plan_id
      WHERE r.${subject.kind === 'user' ? 'user_id' : 'organization_id'} = $1 AND r.status IN ('pending','approved')
      ORDER BY r.created_at DESC LIMIT 1`,
    [subject.id]
  );
  return r ?? null;
};

const subjectPayload = async (subject: PlanSubject, plan: Plan | null) => ({
  subject,
  plan,
  features: FEATURE_CATALOG[subject.audience],
  usage: await usageSummary(subject, plan),
  // Migration 016: where the account is in its billing cycle, and any
  // upgrade/downgrade it is waiting on.
  billing: await billingStateFor(subject, plan),
  open_request: await openRequestFor(subject),
});

/**
 * The plan behind the dashboard the caller is looking at. With
 * ?organization_id= it is that organisation's plan (caller must belong to
 * it); without, the caller's own. Patients and admins get `plan: null` —
 * meaning no restrictions, not an error.
 */
const getMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id ? Number(req.query.organization_id) : null;
    if (orgId) {
      if (!Number.isInteger(orgId)) { res.status(400).json({ message: 'Invalid organization_id' }); return; }
      const { rows } = await pool.query(
        'SELECT 1 FROM public.organization_members WHERE organization_id = $1 AND user_id = $2',
        [orgId, req.user.id]
      );
      if (!rows.length) { res.status(403).json({ message: 'You are not a member of this organization' }); return; }
      const found = await planForOrganization(orgId);
      if (!found) { res.json({ subject: null, plan: null, features: [], usage: {} }); return; }
      res.json(await subjectPayload(found.subject, found.plan));
      return;
    }
    const effective = await effectivePlanForUser(req.user);
    if (!effective) { res.json({ subject: null, plan: null, features: [], usage: {} }); return; }
    res.json(await subjectPayload(effective.subject, effective.plan));
  } catch (err) { next(err); }
};

/**
 * The account holder asks to move to another package (upgrade or downgrade).
 * There is no payment integration, so this changes nothing by itself: it
 * opens a plan_change_requests row and tells every administrator. An admin
 * approves it from the Billing tab, and it takes effect from the next
 * billing period (billingController.approveChangeRequest).
 */
const requestChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { plan_id, organization_id, message } = req.body as { plan_id?: number; organization_id?: number | null; message?: string };
    let found: { plan: Plan | null; subject: PlanSubject } | null;
    let label: string;
    if (organization_id) {
      const { rows } = await pool.query(
        `SELECT o.name FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id
          WHERE om.organization_id = $1 AND om.user_id = $2 AND om.member_role = 'owner'`,
        [organization_id, req.user.id]
      );
      if (!rows.length) { res.status(403).json({ message: 'Only the organization owner can change its package' }); return; }
      found = await planForOrganization(organization_id);
      label = rows[0].name;
    } else {
      found = await effectivePlanForUser(req.user);
      const { rows: [me] } = await pool.query('SELECT name FROM public.users WHERE id = $1', [req.user.id]);
      label = me?.name ?? 'An account';
    }
    if (!found) { res.status(400).json({ message: 'This account is not on a package' }); return; }
    const { subject, plan: current } = found;

    const { rows: [target] } = await pool.query(
      'SELECT id, name, price_monthly::float AS price_monthly, currency, sort_order FROM public.plans WHERE id = $1 AND audience = $2 AND is_active',
      [plan_id, subject.audience]
    );
    if (!target) { res.status(404).json({ message: 'That package is not available' }); return; }
    if (current?.id === target.id) { res.status(400).json({ message: `You are already on the ${target.name} package` }); return; }

    const open = await openRequestFor(subject);
    if (open) {
      res.status(409).json({
        message: open.status === 'approved'
          ? `A change to ${open.to_plan_name} is already scheduled. Cancel it first to ask for a different package.`
          : `You already asked to move to ${open.to_plan_name}. Cancel that request first to ask for a different package.`,
        request: open,
      });
      return;
    }

    const currentPrice = current?.price_monthly ?? 0;
    const direction = target.price_monthly > currentPrice
      || (target.price_monthly === currentPrice && target.sort_order > (current?.sort_order ?? 0)) ? 'upgrade' : 'downgrade';
    const note = typeof message === 'string' && message.trim() ? message.trim().slice(0, 300) : null;

    let created;
    try {
      ({ rows: [created] } = await pool.query(
        `INSERT INTO public.plan_change_requests (user_id, organization_id, requested_by, from_plan_id, to_plan_id, direction, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, status, direction, created_at`,
        [subject.kind === 'user' ? subject.id : null, subject.kind === 'organization' ? subject.id : null,
          req.user.id, current?.id ?? null, target.id, direction, note]
      ));
    } catch (err) {
      // Two clicks racing past the check above hit the one-open-request index.
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ message: 'You already have a package change waiting. Cancel it first to ask for a different one.' });
        return;
      }
      throw err;
    }

    await notifyAdmins('plan_change_requested', `Package ${direction} requested`,
      `${label} asked to ${direction} from ${current?.name ?? 'the default package'} to ${target.name}.${note ? ` Note: ${note}` : ''}`,
      { subject, plan_id: target.id, request_id: created.id });
    res.status(201).json({
      message: `Request sent. Once an administrator approves it, you move to ${target.name} from your next billing period.`,
      request: created,
    });
  } catch (err) { next(err); }
};

// ── Admin: plans ─────────────────────────────────────────────────────────────

const getCatalog = (_req: Request, res: Response): void => {
  res.json(catalogPayload());
};

const listAll = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows: plans } = await pool.query(`${PLAN_SELECT} ORDER BY p.audience, p.sort_order, p.price_monthly, p.id`);
    const { rows: counts } = await pool.query(
      `${SUBJECTS_CTE}
       SELECT effective_plan_id AS plan_id, COUNT(*)::int AS subscribers,
              COUNT(*) FILTER (WHERE is_active)::int AS active_subscribers
         FROM effective GROUP BY effective_plan_id`
    );
    const byPlan = new Map(counts.map(c => [c.plan_id, c]));
    res.json(plans.map(p => ({
      ...toPlan(p),
      created_at: p.created_at,
      updated_at: p.updated_at,
      subscribers: byPlan.get(p.id)?.subscribers ?? 0,
      active_subscribers: byPlan.get(p.id)?.active_subscribers ?? 0,
    })));
  } catch (err) { next(err); }
};

/**
 * Subscriber counts by audience and plan, plus patients (always free), for
 * the main admin dashboard.
 */
const getSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `${SUBJECTS_CTE},
       counts AS (
         SELECT effective_plan_id, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_active)::int AS active
           FROM effective GROUP BY effective_plan_id
       )
       SELECT p.id AS plan_id, p.audience, p.code, p.name, p.price_monthly::float AS price_monthly,
              p.currency, p.is_default, p.is_active,
              COALESCE(c.n, 0) AS subscribers, COALESCE(c.active, 0) AS active_subscribers
         FROM public.plans p
         LEFT JOIN counts c ON c.effective_plan_id = p.id
        ORDER BY p.audience, p.sort_order, p.price_monthly, p.id`
    );
    const { rows: [patients] } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM public.users WHERE role = 'patient' AND deleted_at IS NULL"
    );
    const audiences = PLAN_AUDIENCES.map(audience => {
      const plans = rows.filter(r => r.audience === audience);
      return {
        audience,
        total: plans.reduce((sum, p) => sum + p.subscribers, 0),
        // Indicative only: list price x active accounts. There is no billing
        // integration, so this is what the packages would bring in, not
        // what has been collected.
        estimated_monthly_revenue: plans.reduce((sum, p) => sum + p.price_monthly * p.active_subscribers, 0),
        plans,
      };
    });
    res.json({ patients: { total: patients.n }, audiences });
  } catch (err) { next(err); }
};

interface PlanBody {
  audience?: string; code?: string; name?: string; description?: string | null;
  price_monthly?: number; price_yearly?: number | null; currency?: string;
  features?: unknown; is_active?: boolean; sort_order?: number;
}

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const b = req.body as PlanBody;
    const audience = parseAudience(b.audience);
    if (!audience) { res.status(400).json({ message: 'Invalid audience' }); return; }
    const checked = validateFeatures(audience, b.features ?? {});
    if (!checked.ok) { res.status(400).json({ message: checked.error }); return; }

    let row;
    try {
      ({ rows: [row] } = await pool.query(
        `INSERT INTO public.plans (audience, code, name, description, price_monthly, price_yearly, currency, features, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [audience, b.code, b.name, b.description ?? null, b.price_monthly ?? 0, b.price_yearly ?? null,
          (b.currency || 'LKR').toUpperCase(), JSON.stringify(checked.features), b.is_active ?? true, b.sort_order ?? 0]
      ));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ message: `A ${audience} package with the code "${b.code}" already exists` });
        return;
      }
      throw err;
    }
    audit(req, { action: AuditAction.PLAN_CREATED, targetType: 'plan', targetId: row.id, metadata: { audience, code: b.code } });
    const { rows: [created] } = await pool.query(`${PLAN_SELECT} WHERE p.id = $1`, [row.id]);
    res.status(201).json(toPlan(created));
  } catch (err) { next(err); }
};

// audience and code are fixed once created: code is the stable identifier
// (and moving a plan to another audience would strand everyone on it).
const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows: [existing] } = await pool.query(`${PLAN_SELECT} WHERE p.id = $1`, [req.params.id]);
    if (!existing) { res.status(404).json({ message: 'Package not found' }); return; }
    const b = req.body as PlanBody;

    let features = existing.features;
    if (b.features !== undefined) {
      const checked = validateFeatures(existing.audience, b.features);
      if (!checked.ok) { res.status(400).json({ message: checked.error }); return; }
      features = checked.features;
    }
    if (b.is_active === false && existing.is_default) {
      res.status(400).json({ message: 'The default package cannot be archived. Make another package the default first.' });
      return;
    }

    await pool.query(
      `UPDATE public.plans SET
         name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         price_monthly = COALESCE($5, price_monthly),
         price_yearly = CASE WHEN $6::boolean THEN $7::numeric ELSE price_yearly END,
         currency = COALESCE($8, currency),
         features = $9,
         is_active = COALESCE($10, is_active),
         sort_order = COALESCE($11, sort_order),
         updated_at = NOW()
       WHERE id = $1`,
      [existing.id, b.name ?? null,
        b.description !== undefined, b.description ?? null,
        b.price_monthly ?? null,
        b.price_yearly !== undefined, b.price_yearly ?? null,
        b.currency ? b.currency.toUpperCase() : null,
        JSON.stringify(features), b.is_active ?? null, b.sort_order ?? null]
    );
    audit(req, {
      action: AuditAction.PLAN_UPDATED, targetType: 'plan', targetId: existing.id,
      metadata: { audience: existing.audience, code: existing.code, fields: Object.keys(b) },
    });
    const { rows: [updated] } = await pool.query(`${PLAN_SELECT} WHERE p.id = $1`, [existing.id]);
    res.json(toPlan(updated));
  } catch (err) { next(err); }
};

/**
 * Makes this the audience's default package — the one new sign-ups get when
 * they do not choose, and the one accounts with no explicit package are on.
 *
 * Accounts that were following the OLD default are pinned to it first, so
 * changing the default never silently moves existing customers to a
 * different package (which, for a paid default, would be giving it away).
 */
const makeDefault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows: [plan] } = await client.query('SELECT id, audience, is_default FROM public.plans WHERE id = $1', [req.params.id]);
    if (!plan) { res.status(404).json({ message: 'Package not found' }); return; }
    if (plan.is_default) { res.json({ message: 'Already the default package' }); return; }

    await client.query('BEGIN');
    const { rows: [old] } = await client.query(
      'SELECT id FROM public.plans WHERE audience = $1 AND is_default FOR UPDATE', [plan.audience]
    );
    if (old) {
      if (plan.audience === 'doctor' || plan.audience === 'pharmacy' || plan.audience === 'laboratory') {
        const role = plan.audience === 'doctor' ? 'doctor' : plan.audience === 'pharmacy' ? 'pharmacist' : 'laboratory';
        await client.query('UPDATE public.users SET plan_id = $1 WHERE plan_id IS NULL AND role = $2', [old.id, role]);
      }
      await client.query('UPDATE public.organizations SET plan_id = $1 WHERE plan_id IS NULL AND org_type = $2', [old.id, plan.audience]);
      await client.query('UPDATE public.plans SET is_default = FALSE, updated_at = NOW() WHERE id = $1', [old.id]);
    }
    await client.query('UPDATE public.plans SET is_default = TRUE, is_active = TRUE, updated_at = NOW() WHERE id = $1', [plan.id]);
    await client.query('COMMIT');

    audit(req, { action: AuditAction.PLAN_UPDATED, targetType: 'plan', targetId: plan.id, metadata: { made_default: true, previous_default: old?.id ?? null } });
    res.json({ message: 'Default package updated' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// Only an unused, non-default package can be deleted. Anything else is
// archived instead (is_active = false), which keeps its subscribers on it.
const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows: [plan] } = await pool.query('SELECT id, audience, code, is_default FROM public.plans WHERE id = $1', [req.params.id]);
    if (!plan) { res.status(404).json({ message: 'Package not found' }); return; }
    if (plan.is_default) { res.status(400).json({ message: 'The default package cannot be deleted' }); return; }
    const { rows: [used] } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM public.users WHERE plan_id = $1) + (SELECT COUNT(*) FROM public.organizations WHERE plan_id = $1) AS n`,
      [plan.id]
    );
    if (Number(used.n) > 0) {
      res.status(409).json({ message: `${used.n} account(s) are on this package. Move them to another package, or archive it instead.` });
      return;
    }
    await pool.query('DELETE FROM public.plans WHERE id = $1', [plan.id]);
    audit(req, { action: AuditAction.PLAN_DELETED, targetType: 'plan', targetId: plan.id, metadata: { audience: plan.audience, code: plan.code } });
    res.status(204).end();
  } catch (err) { next(err); }
};

// ── Admin: subscribers ───────────────────────────────────────────────────────

const listSubscribers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePaging(q, { defaultLimit: 50, maxLimit: 200 });
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.audience) {
      if (!isPlanAudience(q.audience)) { res.status(400).json({ message: 'Invalid audience' }); return; }
      params.push(q.audience); where.push(`e.audience = $${params.length}`);
    }
    if (q.plan_id) { params.push(Number(q.plan_id)); where.push(`e.effective_plan_id = $${params.length}`); }
    if (q.kind === 'user' || q.kind === 'organization') { params.push(q.kind); where.push(`e.kind = $${params.length}`); }
    if (q.q && q.q.trim()) { params.push(`%${q.q.trim()}%`); where.push(`(e.name ILIKE $${params.length} OR e.contact ILIKE $${params.length})`); }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query(`${SUBJECTS_CTE} SELECT COUNT(*)::int AS total FROM effective e ${filter}`, params);
    params.push(limit, offset);
    const { rows } = await pool.query(
      `${SUBJECTS_CTE}
       SELECT e.kind, e.id, e.name, e.contact, e.audience, e.is_active, e.approved_at, e.created_at,
              e.plan_expires_at, e.plan_suspended_at, np.name AS next_plan_name,
              e.on_default, p.id AS plan_id, p.code AS plan_code, p.name AS plan_name,
              p.price_monthly::float AS price_monthly, p.currency,
              (SELECT pa.created_at FROM public.plan_assignments pa
                WHERE (e.kind = 'user' AND pa.user_id = e.id) OR (e.kind = 'organization' AND pa.organization_id = e.id)
                ORDER BY pa.created_at DESC LIMIT 1) AS plan_changed_at
         FROM effective e
         LEFT JOIN public.plans p ON p.id = e.effective_plan_id
         LEFT JOIN public.plans np ON np.id = e.next_plan_id
         ${filter}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total, limit, offset, rows });
  } catch (err) { next(err); }
};

const subjectFromParams = async (kind: string, id: number): Promise<{ audience: PlanAudience; planId: number | null; name: string; notifyUserId: number | null } | null> => {
  if (kind === 'user') {
    const { rows: [u] } = await pool.query('SELECT id, name, role, plan_id FROM public.users WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!u) return null;
    const audience = u.role === 'doctor' ? 'doctor' : u.role === 'pharmacist' ? 'pharmacy' : u.role === 'laboratory' ? 'laboratory' : null;
    if (!audience) return null;
    return { audience, planId: u.plan_id, name: u.name, notifyUserId: u.id };
  }
  if (kind === 'organization') {
    const { rows: [o] } = await pool.query('SELECT id, name, org_type, plan_id, owner_user_id FROM public.organizations WHERE id = $1', [id]);
    if (!o || !isPlanAudience(o.org_type)) return null;
    return { audience: o.org_type, planId: o.plan_id, name: o.name, notifyUserId: o.owner_user_id };
  }
  return null;
};

const assign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const kind = String(req.params.kind);
    const id = Number(req.params.id);
    const { plan_id, note } = req.body as { plan_id?: number; note?: string };
    const subject = await subjectFromParams(kind, id);
    if (!subject) { res.status(404).json({ message: 'No account that can hold a package was found' }); return; }

    // Admins may assign an archived package (e.g. honouring a legacy deal);
    // only the account holder's own choice at registration is limited to
    // active ones.
    const { rows: [plan] } = await client.query('SELECT id, audience, name FROM public.plans WHERE id = $1', [plan_id]);
    if (!plan) { res.status(404).json({ message: 'Package not found' }); return; }
    if (plan.audience !== subject.audience) {
      res.status(400).json({ message: `That is a ${plan.audience} package; this account needs a ${subject.audience} package` });
      return;
    }

    const fullPlan = await loadPlan(subject.audience, plan.id);
    const planSubject: PlanSubject = { kind: kind as PlanSubject['kind'], id, audience: subject.audience };

    await client.query('BEGIN');
    // Migration 016: switchPlan also keeps the billing cycle consistent —
    // onto a paid package starts a month, onto a free one ends billing.
    await switchPlan(client, planSubject, fullPlan!, {
      assignedBy: req.user.id, reason: 'admin_change', note: note?.trim() || null, previousPlanId: subject.planId,
    });
    // A direct change replaces anything that was scheduled; a request for
    // exactly this package has now been met.
    const reqCol = kind === 'user' ? 'user_id' : 'organization_id';
    await client.query(
      `UPDATE public.plan_change_requests
          SET status = CASE WHEN to_plan_id = $2 THEN 'applied' ELSE 'cancelled' END,
              applied_at = CASE WHEN to_plan_id = $2 THEN NOW() ELSE applied_at END,
              decided_by = COALESCE(decided_by, $3), decided_at = COALESCE(decided_at, NOW()),
              decision_note = COALESCE(decision_note, 'Superseded by an administrator changing the package directly')
        WHERE ${reqCol} = $1 AND status IN ('pending','approved')`,
      [id, plan.id, req.user.id]
    );
    await client.query('COMMIT');
    clearBillingCache();

    audit(req, {
      action: AuditAction.PLAN_ASSIGNED,
      targetType: kind,
      targetId: id,
      metadata: { audience: subject.audience, plan_id: plan.id, previous_plan_id: subject.planId },
    });
    if (subject.notifyUserId) {
      await sendNotification(subject.notifyUserId, 'plan_changed', 'Package updated',
        kind === 'organization'
          ? `${subject.name} is now on the ${plan.name} package.`
          : `Your account is now on the ${plan.name} package.`,
        { plan_id: plan.id, kind, id });
    }
    res.json({ message: `${subject.name} moved to ${plan.name}`, plan_id: plan.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

const history = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kind = String(req.params.kind);
    if (kind !== 'user' && kind !== 'organization') { res.status(400).json({ message: 'Invalid kind' }); return; }
    const column = kind === 'user' ? 'user_id' : 'organization_id';
    const { rows } = await pool.query(
      `SELECT pa.id, pa.reason, pa.note, pa.created_at,
              prev.name AS previous_plan_name, p.name AS plan_name, a.name AS assigned_by_name
         FROM public.plan_assignments pa
         LEFT JOIN public.plans prev ON prev.id = pa.previous_plan_id
         LEFT JOIN public.plans p    ON p.id = pa.plan_id
         LEFT JOIN public.users a    ON a.id = pa.assigned_by
        WHERE pa.${column} = $1
        ORDER BY pa.created_at DESC
        LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

/** Exposed for the admin "view usage" drawer: what this account has used against its limits. */
const subscriberUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kind = String(req.params.kind);
    const id = Number(req.params.id);
    if (kind === 'organization') {
      const found = await planForOrganization(id);
      if (!found) { res.status(404).json({ message: 'Organization not found' }); return; }
      res.json(await subjectPayload(found.subject, found.plan));
      return;
    }
    const { rows: [u] } = await pool.query('SELECT id, role FROM public.users WHERE id = $1', [id]);
    if (!u) { res.status(404).json({ message: 'User not found' }); return; }
    const effective = await effectivePlanForUser(u);
    if (!effective) { res.json({ subject: null, plan: null, features: [], usage: {} }); return; }
    res.json(await subjectPayload(effective.subject, effective.plan));
  } catch (err) { next(err); }
};

// Used by a registration path: records which package the account holder
// picked. Runs on the caller's transaction client.
const recordRegistrationPlan = async (
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  target: { userId?: number; organizationId?: number },
  planId: number,
): Promise<void> => {
  await client.query(
    `INSERT INTO public.plan_assignments (user_id, organization_id, previous_plan_id, plan_id, assigned_by, reason)
     VALUES ($1,$2,NULL,$3,NULL,'registration')`,
    [target.userId ?? null, target.organizationId ?? null, planId]
  );
};

export {
  listPublic, getMine, requestChange, getCatalog, listAll, getSummary, create, update, makeDefault, remove,
  listSubscribers, assign, history, subscriberUsage, recordRegistrationPlan, subjectFromParams,
};
