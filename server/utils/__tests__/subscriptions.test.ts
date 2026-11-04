import { computeBillingState, addMonths, isAllowedWhileSuspended, DAY_MS } from '../subscriptions';

// Migration 016: the billing rules for paid packages.

jest.mock('../../config/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() }, queryAs: jest.fn(), getTenantSchema: jest.fn() }));
jest.mock('../notify', () => ({ sendNotification: jest.fn() }));

const now = new Date('2026-11-02T10:00:00Z');
const paid = { price_monthly: 2500 };
const free = { price_monthly: 0 };
const row = (expires: Date | null, suspended: Date | null = null) =>
  ({ plan_expires_at: expires, plan_suspended_at: suspended, next_plan_effective_at: null });

describe('computeBillingState', () => {
  it('a free package has no billing cycle, whatever the dates say', () => {
    expect(computeBillingState(row(new Date(now.getTime() - DAY_MS)), free, null, now).status).toBe('free');
  });

  it('a paid package with no period yet has not started', () => {
    expect(computeBillingState(row(null), paid, null, now).status).toBe('not_started');
  });

  it('is active with more than 7 days left, and counts the days', () => {
    const s = computeBillingState(row(new Date(now.getTime() + 20 * DAY_MS)), paid, null, now);
    expect(s).toMatchObject({ status: 'active', days_left: 20 });
  });

  it('is expiring inside the 7-day window, rounding part-days up', () => {
    const s = computeBillingState(row(new Date(now.getTime() + 2.5 * DAY_MS)), paid, null, now);
    expect(s).toMatchObject({ status: 'expiring', days_left: 3 });
  });

  it('is suspended once the period has passed, even before the job marks it', () => {
    expect(computeBillingState(row(new Date(now.getTime() - 1000)), paid, null, now).status).toBe('suspended');
  });

  it('stays suspended when marked, even if a date is somehow in the future', () => {
    expect(computeBillingState(row(new Date(now.getTime() + 5 * DAY_MS), now), paid, null, now).status).toBe('suspended');
  });
});

describe('addMonths', () => {
  it('moves to the same day next month', () => {
    expect(addMonths(new Date('2026-11-02T10:00:00Z'), 1).toISOString()).toBe('2026-12-02T10:00:00.000Z');
  });
  it('clamps to the last day of a shorter month', () => {
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
  it('handles several months across a year end', () => {
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });
});

describe('isAllowedWhileSuspended', () => {
  it.each([
    '/api/auth/me', '/api/plans/me', '/api/plans/me/request-change', '/api/billing/me',
    '/api/billing/me/requests/4', '/api/notifications', '/api/users/me/organizations',
  ])('lets a locked account reach %s', path => {
    expect(isAllowedWhileSuspended(path)).toBe(true);
  });

  it.each([
    '/api/consultations', '/api/lab-requests', '/api/medicines', '/api/plans', '/api/billing/overview', '/api/users/me2',
  ])('blocks %s', path => {
    expect(isAllowedWhileSuspended(path)).toBe(false);
  });
});
