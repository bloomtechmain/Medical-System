import { pool, queryAs, getTenantSchema } from '../config/db';
import { logger } from '../config/logger';
import {
  PlanAudience, FeatureValues, audienceForRole, resolveFeatures, findFeature, isPlanAudience,
} from '../config/planCatalog';

// Subscription packages (migration 014) — which plan applies to whom, and how
// much of a limited feature has been used.

export interface Plan {
  id: number;
  audience: PlanAudience;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  features: FeatureValues;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

// Whose plan it is. A doctor's personal dashboard is a user; a pharmacy,
// laboratory, hospital or clinic is an organisation.
export interface PlanSubject {
  kind: 'user' | 'organization';
  id: number;
  audience: PlanAudience;
}

const PLAN_COLUMNS = `p.id, p.audience, p.code, p.name, p.description,
  p.price_monthly::float AS price_monthly, p.price_yearly::float AS price_yearly,
  p.currency, p.features, p.is_default, p.is_active, p.sort_order`;

export const toPlan = (row: Record<string, any>): Plan => ({
  id: row.id,
  audience: row.audience,
  code: row.code,
  name: row.name,
  description: row.description ?? null,
  price_monthly: Number(row.price_monthly ?? 0),
  price_yearly: row.price_yearly == null ? null : Number(row.price_yearly),
  currency: row.currency,
  features: resolveFeatures(row.audience, row.features),
  is_default: row.is_default,
  is_active: row.is_active,
  sort_order: row.sort_order,
});

const getDefaultPlan = async (audience: PlanAudience): Promise<Plan | null> => {
  const { rows } = await pool.query(
    `SELECT ${PLAN_COLUMNS} FROM public.plans p WHERE p.audience = $1 AND p.is_default LIMIT 1`,
    [audience]
  );
  if (!rows.length) {
    // Should be impossible — the admin API refuses to leave an audience with
    // no default. Logged loudly because the effect (no limits at all) would
    // otherwise go unnoticed.
    logger.error({ audience }, 'No default plan for audience; plan limits are not being applied');
    return null;
  }
  return toPlan(rows[0]);
};

/** The plan with this id if it belongs to the audience, else the audience's default. */
export const loadPlan = async (audience: PlanAudience, planId: number | null | undefined): Promise<Plan | null> => {
  if (planId) {
    const { rows } = await pool.query(
      `SELECT ${PLAN_COLUMNS} FROM public.plans p WHERE p.id = $1 AND p.audience = $2`,
      [planId, audience]
    );
    if (rows.length) return toPlan(rows[0]);
  }
  return getDefaultPlan(audience);
};

/**
 * Validates a plan chosen at registration. Only active plans can be picked by
 * the account holder; an omitted plan means the default (free) one.
 */
export const resolveRegistrationPlan = async (
  audience: PlanAudience,
  planId: unknown,
): Promise<{ plan: Plan | null } | { error: string }> => {
  if (planId === undefined || planId === null || planId === '') return { plan: await getDefaultPlan(audience) };
  const id = Number(planId);
  if (!Number.isInteger(id)) return { error: 'Invalid package' };
  const { rows } = await pool.query(
    `SELECT ${PLAN_COLUMNS} FROM public.plans p WHERE p.id = $1 AND p.audience = $2 AND p.is_active`,
    [id, audience]
  );
  if (!rows.length) return { error: 'The selected package is not available' };
  return { plan: toPlan(rows[0]) };
};

export const planForOrganization = async (organizationId: number): Promise<{ plan: Plan | null; subject: PlanSubject } | null> => {
  const { rows } = await pool.query('SELECT id, org_type, plan_id FROM public.organizations WHERE id = $1', [organizationId]);
  if (!rows.length || !isPlanAudience(rows[0].org_type)) return null;
  const subject: PlanSubject = { kind: 'organization', id: rows[0].id, audience: rows[0].org_type };
  return { plan: await loadPlan(subject.audience, rows[0].plan_id), subject };
};

/**
 * Whose plan governs a request made by this user. null = not subject to plans
 * at all (patients, admins).
 *
 * A pharmacist or laboratory user acts for their organisation — the server
 * already scopes their data to it (getTenantSchema) — so it is the
 * organisation's plan that applies, not a personal one. Only a pharmacist or
 * lab account with no organisation falls back to its own users.plan_id.
 */
export const resolvePlanSubject = async (user: { id: number; role: string }): Promise<PlanSubject | null> => {
  const audience = audienceForRole(user.role);
  if (!audience) return null;
  if (audience === 'doctor') return { kind: 'user', id: user.id, audience };

  const { rows } = await pool.query(
    `SELECT o.id
       FROM public.organizations o
       JOIN public.organization_members om ON om.organization_id = o.id
      WHERE om.user_id = $1 AND o.org_type = $2
      ORDER BY (om.member_role = 'owner') DESC, o.id
      LIMIT 1`,
    [user.id, audience]
  );
  if (rows.length) return { kind: 'organization', id: rows[0].id, audience };
  return { kind: 'user', id: user.id, audience };
};

export const planForSubject = async (subject: PlanSubject): Promise<Plan | null> => {
  const table = subject.kind === 'user' ? 'public.users' : 'public.organizations';
  const { rows } = await pool.query(`SELECT plan_id FROM ${table} WHERE id = $1`, [subject.id]);
  return loadPlan(subject.audience, rows[0]?.plan_id ?? null);
};

export const effectivePlanForUser = async (
  user: { id: number; role: string },
): Promise<{ plan: Plan | null; subject: PlanSubject } | null> => {
  const subject = await resolvePlanSubject(user);
  if (!subject) return null;
  return { plan: await planForSubject(subject), subject };
};

// ── Usage ────────────────────────────────────────────────────────────────────
//
// How much of a limit has been used. One function per limited feature, keyed
// "<audience>.<feature>". A limit with no counter here is not enforced, and
// usageFor() says so by returning null rather than pretending it is zero.

const MONTH_START = `date_trunc('month', NOW())`;

const tenantSchemaFor = async (subject: PlanSubject): Promise<string | null> => {
  if (subject.kind === 'organization') {
    const { rows } = await pool.query('SELECT schema_name FROM public.organizations WHERE id = $1', [subject.id]);
    const schema = rows[0]?.schema_name as string | undefined;
    return schema && /^[a-z_][a-z0-9_]*$/.test(schema) ? schema : null;
  }
  return getTenantSchema(subject.id);
};

const countTenantRows = async (subject: PlanSubject, table: string, where = 'TRUE'): Promise<number> => {
  const schema = await tenantSchemaFor(subject);
  if (!schema) return 0;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM "${schema}".${table} WHERE ${where}`);
  return rows[0].n;
};

// Non-owner members of an organisation.
const countOrgMembers = async (organizationId: number): Promise<number> => {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM public.organization_members WHERE organization_id = $1 AND member_role <> 'owner'",
    [organizationId]
  );
  return rows[0].n;
};

const COUNTERS: Record<string, (s: PlanSubject) => Promise<number>> = {
  // clinical.* is behind row-level security, so these run as the doctor —
  // exactly the rows that doctor can already see.
  'doctor.consultations_per_month': async s => {
    const { rows } = await queryAs({ id: s.id, role: 'doctor' },
      `SELECT COUNT(*)::int AS n FROM medical_consultations WHERE doctor_id = $1 AND created_at >= ${MONTH_START}`, [s.id]);
    return rows[0].n;
  },
  'doctor.appointments_per_month': async s => {
    const { rows } = await queryAs({ id: s.id, role: 'doctor' },
      `SELECT COUNT(*)::int AS n FROM doctor_appointments
        WHERE doctor_id = $1 AND status IN ('confirmed','completed') AND responded_at >= ${MONTH_START}`, [s.id]);
    return rows[0].n;
  },
  // Pending join requests count too — otherwise a free-plan doctor could
  // queue requests to every hospital at once and have them all accepted.
  'doctor.hospital_affiliations': async s => {
    const { rows } = await pool.query(
      `SELECT (
         SELECT COUNT(*) FROM public.organization_members om
           JOIN public.organizations o ON o.id = om.organization_id
          WHERE om.user_id = $1 AND om.member_role = 'doctor' AND o.org_type IN ('hospital','clinic')
       ) + (
         SELECT COUNT(*) FROM public.organization_membership_requests
          WHERE doctor_id = $1 AND kind = 'join' AND status = 'pending'
       ) AS n`,
      [s.id]
    );
    return Number(rows[0].n);
  },

  'pharmacy.medicines': s => countTenantRows(s, 'medicines', 'deleted_at IS NULL'),
  'pharmacy.suppliers': s => countTenantRows(s, 'suppliers'),
  'pharmacy.team_members': s => (s.kind === 'organization' ? countOrgMembers(s.id) : Promise.resolve(0)),

  'laboratory.test_catalog': s => countTenantRows(s, 'test_catalog'),
  'laboratory.team_members': s => (s.kind === 'organization' ? countOrgMembers(s.id) : Promise.resolve(0)),
  // Counted from upload accounting (public, no RLS) across everyone in the
  // lab, so adding staff does not multiply the monthly allowance.
  'laboratory.reports_per_month': async s => {
    const { rows } = s.kind === 'organization'
      ? await pool.query(
        `SELECT COUNT(*)::int AS n FROM public.upload_usage
          WHERE subdir = 'lab-reports' AND created_at >= ${MONTH_START}
            AND user_id IN (SELECT user_id FROM public.organization_members WHERE organization_id = $1)`, [s.id])
      : await pool.query(
        `SELECT COUNT(*)::int AS n FROM public.upload_usage
          WHERE subdir = 'lab-reports' AND created_at >= ${MONTH_START} AND user_id = $1`, [s.id]);
    return rows[0].n;
  },

  'hospital.affiliated_doctors': s => countOrgMembers(s.id),
  'clinic.affiliated_doctors': s => countOrgMembers(s.id),
};

export const usageFor = async (subject: PlanSubject, key: string): Promise<number | null> => {
  const counter = COUNTERS[`${subject.audience}.${key}`];
  return counter ? counter(subject) : null;
};

/** Current usage of every limited feature that has a counter. */
export const usageSummary = async (subject: PlanSubject, plan: Plan | null): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  if (!plan) return out;
  for (const key of Object.keys(plan.features)) {
    if (findFeature(subject.audience, key)?.type !== 'limit') continue;
    const used = await usageFor(subject, key);
    if (used !== null) out[key] = used;
  }
  return out;
};

// ── Checks ───────────────────────────────────────────────────────────────────

export type PlanDenial = {
  status: 403;
  body: {
    code: 'PLAN_FEATURE_LOCKED' | 'PLAN_LIMIT_REACHED';
    message: string;
    feature: string;
    plan: { id: number; code: string; name: string } | null;
    limit?: number;
    used?: number;
  };
};

const planRef = (plan: Plan) => ({ id: plan.id, code: plan.code, name: plan.name });

export const checkFeatureEnabled = (subject: PlanSubject, plan: Plan | null, key: string): PlanDenial | null => {
  const def = findFeature(subject.audience, key);
  // A key that does not apply to this audience is not a restriction on it.
  if (!def || !plan) return null;
  if (plan.features[key] === true) return null;
  return {
    status: 403,
    body: {
      code: 'PLAN_FEATURE_LOCKED',
      feature: key,
      plan: planRef(plan),
      message: `${def.label} is not included in the ${plan.name} package. Upgrade your package to use it.`,
    },
  };
};

/**
 * Refuses when using one more would exceed the limit. `adding` is how many the
 * caller is about to add (default 1).
 */
export const checkWithinLimit = async (
  subject: PlanSubject, plan: Plan | null, key: string, adding = 1,
): Promise<PlanDenial | null> => {
  const def = findFeature(subject.audience, key);
  if (!def || def.type !== 'limit' || !plan) return null;
  const limit = plan.features[key];
  if (limit === null || limit === undefined) return null; // unlimited
  const used = await usageFor(subject, key);
  if (used === null) return null;
  if (used + adding <= (limit as number)) return null;
  return {
    status: 403,
    body: {
      code: 'PLAN_LIMIT_REACHED',
      feature: key,
      plan: planRef(plan),
      limit: limit as number,
      used,
      message: `${def.label}: your ${plan.name} package allows ${limit} and ${used} ${used === 1 ? 'is' : 'are'} already used. Upgrade your package to add more.`,
    },
  };
};
