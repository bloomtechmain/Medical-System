import { pool } from '../../config/db';
import { approveUser } from '../userController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

// Migration 015: a doctor's hospitals/clinics certify them before the admin
// can approve the account.

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
  queryAs: jest.fn(),
  revokeRefreshTokens: jest.fn(),
}));
jest.mock('../../utils/notify', () => ({ sendNotification: jest.fn() }));
jest.mock('../../utils/auditLog', () => ({ audit: jest.fn(), AuditAction: { USER_APPROVED: 'user.approved' } }));
jest.mock('../authController', () => ({ sendVerificationEmail: jest.fn() }));
jest.mock('../../config/featureFlags', () => ({ isEnabled: () => false }));

const query = pool.query as jest.Mock;
const admin = { id: 1, email: 'admin@suwela.com', role: 'admin' } as any;

describe('userController.approveUser — hospital certification gate', () => {
  const next = jest.fn();
  beforeEach(() => query.mockReset());

  it('refuses while a named hospital has not certified the doctor', async () => {
    query.mockResolvedValueOnce({ rows: [{ name: 'Nawaloka Hospital' }] }); // pending certifications

    const res = mockResponse();
    await approveUser(mockRequest({ params: { id: '7' }, body: {}, user: admin }), res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'AFFILIATION_PENDING', pending: ['Nawaloka Hospital'],
    }));
    // The account itself was never touched.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('approves once every hospital has responded', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // nothing pending
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'Dr A', email: 'a@x.lk', role: 'doctor', is_active: true, email_verified_at: null }] });

    const res = mockResponse();
    await approveUser(mockRequest({ params: { id: '7' }, body: {}, user: admin }), res, next);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 7, is_active: true }));
  });

  it('lets an admin explicitly override a hospital that never answers', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ name: 'Silent Clinic' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'Dr A', email: 'a@x.lk', role: 'doctor', is_active: true, email_verified_at: null }] });

    const res = mockResponse();
    await approveUser(mockRequest({ params: { id: '7' }, body: { override: true }, user: admin }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });
});
