import { pool, queryAs } from '../../config/db';
import { requireFeature, requireWithinLimit } from '../planGate';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  queryAs: jest.fn(),
  getTenantSchema: jest.fn(),
}));

const query = pool.query as jest.Mock;
const asActor = queryAs as jest.Mock;

const doctorFree = {
  id: 1, audience: 'doctor', code: 'free', name: 'Free', description: null,
  price_monthly: 0, price_yearly: 0, currency: 'LKR', is_default: true, is_active: true, sort_order: 0,
  features: { consultations_per_month: 30, lab_requests: false, online_booking: true },
};

// A doctor with no explicit package: users.plan_id lookup, then the default.
const mockDoctorOnFree = () => {
  query
    .mockResolvedValueOnce({ rows: [{ plan_id: null }] })
    .mockResolvedValueOnce({ rows: [doctorFree] });
};

describe('plan gates', () => {
  beforeEach(() => {
    query.mockReset();
    asActor.mockReset();
  });

  // The patient side is free. A gate on a route patients share with doctors
  // must let the patient through without even looking a plan up.
  it('never restricts a patient', async () => {
    const next = jest.fn();
    const res = mockResponse();
    await requireFeature('lab_requests')(mockRequest({ user: { id: 9, email: 'p@x', role: 'patient' } } as never), res, next);
    await requireWithinLimit('consultations_per_month')(mockRequest({ user: { id: 9, email: 'p@x', role: 'patient' } } as never), res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith();
    expect(query).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuses a feature the package does not include, with a machine-readable code', async () => {
    mockDoctorOnFree();
    const next = jest.fn();
    const res = mockResponse();
    await requireFeature('lab_requests')(mockRequest({ user: { id: 2, email: 'd@x', role: 'doctor' } } as never), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PLAN_FEATURE_LOCKED', feature: 'lab_requests', plan: { id: 1, code: 'free', name: 'Free' },
    }));
  });

  it('allows a feature the package includes', async () => {
    mockDoctorOnFree();
    const next = jest.fn();
    await requireFeature('online_booking')(mockRequest({ user: { id: 2, email: 'd@x', role: 'doctor' } } as never), mockResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows the last unit of a limit and refuses the one after it', async () => {
    mockDoctorOnFree();
    asActor.mockResolvedValueOnce({ rows: [{ n: 29 }] });
    const next = jest.fn();
    await requireWithinLimit('consultations_per_month')(mockRequest({ user: { id: 2, email: 'd@x', role: 'doctor' } } as never), mockResponse(), next);
    expect(next).toHaveBeenCalledWith();

    mockDoctorOnFree();
    asActor.mockResolvedValueOnce({ rows: [{ n: 30 }] });
    const res = mockResponse();
    const blocked = jest.fn();
    await requireWithinLimit('consultations_per_month')(mockRequest({ user: { id: 2, email: 'd@x', role: 'doctor' } } as never), res, blocked);
    expect(blocked).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PLAN_LIMIT_REACHED', limit: 30, used: 30 }));
    // Counted as the doctor, so row-level security scopes it to their own rows.
    expect(asActor).toHaveBeenLastCalledWith({ id: 2, role: 'doctor' }, expect.stringContaining('medical_consultations'), [2]);
  });

  it('does not count anything for an unlimited package', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ plan_id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ ...doctorFree, id: 3, code: 'premium', name: 'Premium', is_default: false, features: { consultations_per_month: null } }] });
    const next = jest.fn();
    await requireWithinLimit('consultations_per_month')(mockRequest({ user: { id: 2, email: 'd@x', role: 'doctor' } } as never), mockResponse(), next);
    expect(next).toHaveBeenCalledWith();
    expect(asActor).not.toHaveBeenCalled();
  });

  // A pharmacist acts for their pharmacy, so the pharmacy's package applies.
  it("applies a pharmacy's package to its pharmacist", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 40 }] })              // resolvePlanSubject: pharmacy membership
      .mockResolvedValueOnce({ rows: [{ plan_id: null }] })       // organizations.plan_id
      .mockResolvedValueOnce({ rows: [{ ...doctorFree, audience: 'pharmacy', features: { purchase_orders: false } }] });
    const res = mockResponse();
    const next = jest.fn();
    await requireFeature('purchase_orders')(mockRequest({ user: { id: 5, email: 'ph@x', role: 'pharmacist' } } as never), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(query.mock.calls[1][0]).toContain('public.organizations');
    expect(query.mock.calls[1][1]).toEqual([40]);
  });
});
