import { pool } from '../../config/db';
import { recordPayment, approveChangeRequest } from '../billingController';
import { sendNotification } from '../../utils/notify';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

// Migration 016: recording a payment and approving a package change.

jest.mock('../../config/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() }, queryAs: jest.fn(), getTenantSchema: jest.fn() }));
jest.mock('../../utils/notify', () => ({ sendNotification: jest.fn() }));
jest.mock('../../utils/auditLog', () => ({ audit: jest.fn(), AuditAction: {} }));

const DAY = 24 * 60 * 60 * 1000;
const PRO = { id: 2, audience: 'doctor', code: 'professional', name: 'Professional', description: null, price_monthly: 2500, price_yearly: null, currency: 'LKR', features: {}, is_default: false, is_active: true, sort_order: 1 };
const PREMIUM = { ...PRO, id: 3, code: 'premium', name: 'Premium', price_monthly: 6000, sort_order: 2 };
const FREE = { ...PRO, id: 1, code: 'free', name: 'Free', price_monthly: 0, is_default: true, sort_order: 0 };
const PLANS: Record<number, typeof PRO> = { 1: FREE, 2: PRO, 3: PREMIUM };
const admin = { id: 99, email: 'admin@suwela.com', role: 'admin' } as any;

/**
 * A tiny fake database: `account` is the doctor's row, and every statement
 * the code runs is recorded so the test can check what was written.
 */
const fakeDb = (account: Record<string, any>, request?: Record<string, any>) => {
  const writes: { sql: string; params: unknown[] }[] = [];
  const run = async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
    if (s.startsWith('SELECT role FROM public.users')) return { rows: [{ role: 'doctor' }] };
    if (s.includes('FROM public.plans p WHERE p.id = $1 AND p.audience')) return { rows: PLANS[params[0] as number] ? [PLANS[params[0] as number]] : [] };
    if (s.includes('FROM public.plans p WHERE p.audience = $1 AND p.is_default')) return { rows: [FREE] };
    if (s.includes('FROM public.users WHERE id = $1 FOR UPDATE') || s.startsWith('SELECT plan_id, plan_expires_at')) return { rows: [account] };
    if (s.startsWith('SELECT * FROM public.plan_change_requests')) return { rows: request ? [request] : [] };
    if (s.startsWith('SELECT id, name FROM public.users')) return { rows: [{ id: 7, name: 'Dr Silva' }] };
    if (s.startsWith('INSERT INTO public.subscription_payments')) { writes.push({ sql: s, params }); return { rows: [{ id: 501 }] }; }
    writes.push({ sql: s, params });
    return { rows: [], rowCount: 1 };
  };
  const client = { query: jest.fn(run), release: jest.fn() };
  (pool.connect as jest.Mock).mockResolvedValue(client);
  (pool.query as jest.Mock).mockImplementation(run);
  return writes;
};

const next = jest.fn(err => { if (err) throw err; });

describe('billingController.recordPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a lapsed (suspended) account gets a full month from today, and is unlocked', async () => {
    const writes = fakeDb({ plan_id: 2, plan_expires_at: new Date(Date.now() - 3 * DAY), plan_suspended_at: new Date(Date.now() - 3 * DAY), next_plan_id: null, next_plan_effective_at: null });
    const res = mockResponse();
    await recordPayment(mockRequest({ params: { kind: 'user', id: '7' }, body: { method: 'cash' }, user: admin }), res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    const update = writes.find(w => w.sql.startsWith('UPDATE public.users SET plan_expires_at'))!;
    const newEnd = update.params[1] as Date;
    expect(newEnd.getTime() - Date.now()).toBeGreaterThan(27 * DAY);
    expect(newEnd.getTime() - Date.now()).toBeLessThan(32 * DAY);
    expect(update.sql).toContain('plan_suspended_at = NULL');
    const payment = writes.find(w => w.sql.startsWith('INSERT INTO public.subscription_payments'))!;
    expect(payment.params[3]).toBe(2500); // the package price by default
    expect(sendNotification).toHaveBeenCalledWith(7, 'billing_payment_recorded', 'Payment received', expect.stringContaining('LKR 2,500'), expect.anything());
  });

  it('an account paying early keeps its remaining days: the new month starts at the old end date', async () => {
    const end = new Date(Date.now() + 5 * DAY);
    const writes = fakeDb({ plan_id: 2, plan_expires_at: end, plan_suspended_at: null, next_plan_id: null, next_plan_effective_at: null });
    await recordPayment(mockRequest({ params: { kind: 'user', id: '7' }, body: { months: 2 }, user: admin }), mockResponse(), next);

    const payment = writes.find(w => w.sql.startsWith('INSERT INTO public.subscription_payments'))!;
    expect((payment.params[9] as Date).getTime()).toBe(end.getTime());
    expect(payment.params[3]).toBe(5000); // two months
  });

  it('charges the new price when an approved upgrade starts with the period being paid for', async () => {
    const end = new Date(Date.now() + 2 * DAY);
    const writes = fakeDb({ plan_id: 2, plan_expires_at: end, plan_suspended_at: null, next_plan_id: 3, next_plan_effective_at: end });
    await recordPayment(mockRequest({ params: { kind: 'user', id: '7' }, body: {}, user: admin }), mockResponse(), next);

    const payment = writes.find(w => w.sql.startsWith('INSERT INTO public.subscription_payments'))!;
    expect(payment.params[2]).toBe(3);
    expect(payment.params[3]).toBe(6000);
  });

  it('refuses a payment for a free package', async () => {
    fakeDb({ plan_id: 1, plan_expires_at: null, plan_suspended_at: null, next_plan_id: null, next_plan_effective_at: null });
    const res = mockResponse();
    await recordPayment(mockRequest({ params: { kind: 'user', id: '7' }, body: {}, user: admin }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('billingController.approveChangeRequest', () => {
  beforeEach(() => jest.clearAllMocks());
  const request = { id: 31, user_id: 7, organization_id: null, status: 'pending', to_plan_id: 3, direction: 'upgrade' };

  it('schedules the change for the end of the period already paid for', async () => {
    const end = new Date(Date.now() + 12 * DAY);
    const writes = fakeDb({ plan_id: 2, plan_expires_at: end, plan_suspended_at: null }, request);
    const res = mockResponse();
    await approveChangeRequest(mockRequest({ params: { id: '31' }, body: {}, user: admin }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scheduled: true }));
    const sched = writes.find(w => w.sql.startsWith('UPDATE public.users SET next_plan_id'))!;
    expect(sched.params).toEqual([7, 3, end]);
    expect(writes.some(w => w.sql.includes("SET plan_id"))).toBe(false); // nothing switched yet
  });

  it('switches straight away for a free account (there is no paid period to wait for)', async () => {
    const writes = fakeDb({ plan_id: 1, plan_expires_at: null, plan_suspended_at: null }, request);
    const res = mockResponse();
    await approveChangeRequest(mockRequest({ params: { id: '31' }, body: {}, user: admin }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scheduled: false }));
    const sw = writes.find(w => w.sql.includes('SET plan_id = $2'))!;
    expect(sw.params).toEqual([7, 3]);
    // Onto a paid package: a first month starts.
    expect(sw.sql).toContain("COALESCE(plan_expires_at, NOW() + INTERVAL '1 month')");
  });

  it('switches now when the admin asks for it', async () => {
    const writes = fakeDb({ plan_id: 2, plan_expires_at: new Date(Date.now() + 12 * DAY), plan_suspended_at: null }, request);
    const res = mockResponse();
    await approveChangeRequest(mockRequest({ params: { id: '31' }, body: { timing: 'now' }, user: admin }), res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scheduled: false }));
    expect(writes.some(w => w.sql.includes('SET plan_id = $2'))).toBe(true);
  });
});
