import { User, UserOrganization } from '../types';

// Requirement 1: a user can hold more than one dashboard at once.
//
// The case that broke: register a hospital, pick an already-registered doctor
// as its owner, and that doctor's own dashboard disappeared. RoleHome
// preferred `user.organization` over `user.role`, so their credentials only
// ever reached /hospital from then on — no route back to /doctor and no
// indication anything had been taken away.
//
// A "context" is one dashboard the signed-in user may enter. It is either
// their personal role, or one organisation they belong to. Everything that
// needs to route, offer a choice, or switch reads from here, so the three
// cannot disagree about what is available.

export type DashboardContext =
  | { kind: 'role'; key: string; label: string; sublabel: string; path: string; role: string }
  | { kind: 'org'; key: string; label: string; sublabel: string; path: string; orgId: number; orgType: string; memberRole: string };

const ROLE_ROUTES: Record<string, string> = {
  admin: '/admin', doctor: '/doctor', pharmacist: '/pharmacist',
  patient: '/patient', laboratory: '/laboratory',
};

const ORG_ROUTES: Record<string, string> = {
  hospital: '/hospital', clinic: '/clinic',
  pharmacy: '/pharmacist', laboratory: '/laboratory',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator', doctor: 'Doctor', pharmacist: 'Pharmacist',
  patient: 'Patient', laboratory: 'Laboratory',
};

const ORG_TYPE_LABEL: Record<string, string> = {
  hospital: 'Hospital', clinic: 'Clinic', pharmacy: 'Pharmacy', laboratory: 'Laboratory',
};

export interface Membership extends UserOrganization {
  member_role: string;
}

/**
 * Every dashboard this user may enter, personal role first.
 *
 * Personal role comes first deliberately: it is the identity they registered
 * with and the one they are likely to think of as "their" account. An
 * organisation is something they also belong to.
 */
export const dashboardContexts = (user: User | null): DashboardContext[] => {
  if (!user?.role) return [];

  const out: DashboardContext[] = [];

  const rolePath = ROLE_ROUTES[user.role];
  if (rolePath) {
    out.push({
      kind: 'role',
      key: `role:${user.role}`,
      label: `${ROLE_LABEL[user.role] ?? user.role} dashboard`,
      sublabel: 'Your personal account',
      path: rolePath,
      role: user.role,
    });
  }

  // `memberships` is what login/getMe now return. Fall back to the single
  // `organization` field for a session that predates the change — otherwise
  // anyone already signed in would lose their org dashboard until they
  // logged out and back in.
  const memberships: Membership[] =
    (user as User & { memberships?: Membership[] }).memberships
    ?? (user.organization ? [{ ...user.organization, member_role: 'owner' }] : []);

  for (const m of memberships) {
    const path = ORG_ROUTES[m.org_type];
    if (!path) continue;
    out.push({
      kind: 'org',
      key: `org:${m.id}`,
      label: m.name,
      sublabel: `${ORG_TYPE_LABEL[m.org_type] ?? m.org_type}${m.member_role === 'owner' ? ' · Owner' : ''}`,
      path,
      orgId: m.id,
      orgType: m.org_type,
      memberRole: m.member_role,
    });
  }

  // A pharmacy owner is a pharmacist whose org route is also /pharmacist, so
  // the two contexts would land on the same screen and look like a bug. Keep
  // the first, which is the personal one.
  const seen = new Set<string>();
  return out.filter(c => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
};

const ACTIVE_KEY = 'active_dashboard';

export const getActiveContextKey = (): string | null => localStorage.getItem(ACTIVE_KEY);
export const setActiveContextKey = (key: string): void => localStorage.setItem(ACTIVE_KEY, key);
export const clearActiveContextKey = (): void => localStorage.removeItem(ACTIVE_KEY);

/**
 * The context to land in. The stored choice if it is still valid, otherwise
 * null when there is a genuine choice to make, otherwise the only option.
 *
 * Returning null rather than guessing is the point: silently picking one is
 * exactly the old behaviour that hid the doctor dashboard.
 */
export const resolveActiveContext = (user: User | null): DashboardContext | null => {
  const contexts = dashboardContexts(user);
  if (contexts.length === 0) return null;
  if (contexts.length === 1) return contexts[0];

  const stored = getActiveContextKey();
  // A stored key can go stale — an org suspended, or membership removed — so
  // it is only honoured if it still appears in the current list.
  return contexts.find(c => c.key === stored) ?? null;
};
