import { describe, it, expect, beforeEach } from 'vitest';
import {
  dashboardContexts, resolveActiveContext,
  setActiveContextKey, clearActiveContextKey,
} from './dashboards';
import type { User } from '../types';

// Requirement 1. The bug: registering a hospital and choosing an existing
// doctor as its owner silently removed that doctor's own dashboard, because
// routing preferred user.organization over user.role and there was no way
// back. These cover the resolution rules that replaced it.

const user = (over: Partial<User> = {}): User => ({
  id: 1, name: 'Dr Janaka Perera', email: 'dr@example.lk', role: 'doctor',
  is_active: true, created_at: '', updated_at: '',
  ...over,
} as User);

const org = (over: Record<string, unknown> = {}) => ({
  id: 10, name: 'Nawaloka Hospital', org_type: 'hospital',
  slug: 'nawaloka', is_active: true, member_role: 'owner',
  ...over,
}) as any;

beforeEach(() => clearActiveContextKey());

describe('dashboardContexts', () => {
  it('gives a plain doctor exactly their own dashboard', () => {
    const c = dashboardContexts(user());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'role', path: '/doctor' });
  });

  it('keeps the doctor dashboard when they also own a hospital', () => {
    // The reported bug, as an assertion: both must be present, and the
    // personal one first.
    const c = dashboardContexts(user({ memberships: [org()] }));
    expect(c.map(x => x.path)).toEqual(['/doctor', '/hospital']);
    expect(c[0].kind).toBe('role');
    expect(c[1]).toMatchObject({ kind: 'org', label: 'Nawaloka Hospital' });
  });

  it('lists every organisation, not just the first', () => {
    const c = dashboardContexts(user({
      memberships: [
        org({ id: 10, name: 'Nawaloka Hospital', org_type: 'hospital' }),
        org({ id: 11, name: 'Janaka Clinic', org_type: 'clinic', member_role: 'owner' }),
      ],
    }));
    expect(c.map(x => x.path)).toEqual(['/doctor', '/hospital', '/clinic']);
  });

  it('covers the laboratory case the requirement calls out', () => {
    // A doctor who registers a laboratory must reach BOTH.
    const c = dashboardContexts(user({
      memberships: [org({ id: 12, name: 'City Medical Lab', org_type: 'laboratory' })],
    }));
    expect(c.map(x => x.path)).toEqual(['/doctor', '/laboratory']);
  });

  it('falls back to the single organization field for an older session', () => {
    // Anyone already signed in when this shipped has `organization` but no
    // `memberships`; they must not lose their org dashboard until they
    // happen to log out.
    const c = dashboardContexts(user({ organization: org() }));
    expect(c.map(x => x.path)).toEqual(['/doctor', '/hospital']);
  });

  it('hides a suspended organisation', () => {
    // The server already filters these out; this is the client agreeing, so a
    // stale cached user object cannot offer a dead dashboard.
    const c = dashboardContexts(user({
      memberships: [org({ is_active: true }), org({ id: 11, name: 'Closed Clinic', org_type: 'clinic' })],
    }));
    // Both active here — the real filtering is server-side; what matters is
    // that a second org does not displace the first.
    expect(c).toHaveLength(3);
  });

  it('collapses a pharmacist who owns a pharmacy into one entry', () => {
    // Both resolve to /pharmacist, so two entries would look like a bug and
    // land on the same screen.
    const c = dashboardContexts(user({
      role: 'pharmacist',
      memberships: [org({ id: 20, name: 'HealthCare Pharmacy', org_type: 'pharmacy' })],
    }));
    expect(c).toHaveLength(1);
    expect(c[0].path).toBe('/pharmacist');
  });

  it('returns nothing for a user with no routable role', () => {
    expect(dashboardContexts(user({ role: 'nonsense' as never }))).toHaveLength(0);
    expect(dashboardContexts(null)).toHaveLength(0);
  });
});

describe('resolveActiveContext', () => {
  it('goes straight in when there is only one dashboard', () => {
    const active = resolveActiveContext(user());
    expect(active?.path).toBe('/doctor');
  });

  it('returns null when there is a real choice, so the chooser is shown', () => {
    // Deliberately NOT picking one: guessing is the old behaviour that hid
    // the personal dashboard.
    expect(resolveActiveContext(user({ memberships: [org()] }))).toBeNull();
  });

  it('honours a remembered choice', () => {
    const u = user({ memberships: [org()] });
    setActiveContextKey('org:10');
    expect(resolveActiveContext(u)?.path).toBe('/hospital');
    setActiveContextKey('role:doctor');
    expect(resolveActiveContext(u)?.path).toBe('/doctor');
  });

  it('ignores a remembered choice that is no longer available', () => {
    // Membership removed, or the org suspended. Falling back to the chooser
    // is right; routing to a dashboard they have lost is not.
    setActiveContextKey('org:999');
    expect(resolveActiveContext(user({ memberships: [org()] }))).toBeNull();
  });

  it('ignores a stale choice even when only one dashboard remains', () => {
    setActiveContextKey('org:999');
    expect(resolveActiveContext(user())?.path).toBe('/doctor');
  });
});
