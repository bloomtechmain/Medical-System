import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { planApi } from '../services/api';
import { getActiveContextKey } from '../constants/dashboards';
import { MyPlan, Plan, User } from '../types';

// Migration 014: which package governs the dashboard on screen, and what it
// allows.
//
// The dashboard is taken from the URL (/doctor, /hospital, ...) unless one is
// named, because the same doctor can be looking at their own dashboard on
// their own package and at their hospital's on the hospital's package.
//
// This only decides what the client SHOWS. Every gated request is checked
// again by the server, so a stale answer here costs a confusing screen, never
// a bypass.

const ORG_DASHBOARDS = ['hospital', 'clinic'] as const;

/** The organisation behind a hospital/clinic dashboard for this user. */
const orgFor = (user: User | null, dashboard: string): { id: number; plan?: Plan | null } | null => {
  if (!user) return null;
  const memberships = user.memberships ?? (user.organization ? [{ ...user.organization, member_role: 'owner' }] : []);
  const ofType = memberships.filter(m => m.org_type === dashboard);
  if (!ofType.length) return null;
  // Prefer the one the user picked in the dashboard chooser, if it is this type.
  const active = getActiveContextKey();
  return ofType.find(m => active === `org:${m.id}`)
    ?? ofType.find(m => m.id === user.organization?.id)
    ?? ofType[0];
};

export function useDashboardPlan(dashboard?: string) {
  const { user } = useAuth();
  const location = useLocation();
  const dash = dashboard ?? location.pathname.split('/')[1] ?? '';

  const isOrgDashboard = (ORG_DASHBOARDS as readonly string[]).includes(dash);
  const org = isOrgDashboard ? orgFor(user, dash) : null;
  // Patients and admins have no package; nothing to fetch.
  const applies = !!user && user.role !== 'patient' && user.role !== 'admin' && (!isOrgDashboard || !!org);

  // The sign-in snapshot shows the right sections immediately; the query
  // replaces it with the live package (an admin may have changed it since).
  const snapshot: Plan | null = (isOrgDashboard ? org?.plan : user?.plan) ?? null;

  const { data, isLoading, refetch } = useQuery<MyPlan>({
    queryKey: ['my-plan', org?.id ?? 'personal', user?.id],
    queryFn: () => planApi.mine(org?.id ?? null),
    enabled: applies,
    staleTime: 60_000,
  });

  const plan = applies ? (data?.plan ?? snapshot) : null;

  /** Whether a feature is available. Anything not on a package is. */
  const has = (key: string): boolean => {
    if (!plan || !(key in plan.features)) return true;
    return plan.features[key] !== false;
  };

  /** A limit's cap: a number, or null for unlimited / not limited. */
  const limit = (key: string): number | null => {
    const v = plan?.features[key];
    return typeof v === 'number' ? v : null;
  };

  return {
    plan,
    applies,
    loading: applies && isLoading && !snapshot,
    organizationId: org?.id ?? null,
    features: data?.features ?? [],
    usage: data?.usage ?? {},
    subject: data?.subject ?? null,
    has,
    limit,
    refetch,
  };
}
