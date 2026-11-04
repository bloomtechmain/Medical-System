import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { protect } from '../auth';
import { subscriptionBlockFor } from '../../utils/subscriptions';
import { mockResponse } from '../../test-utils/mockExpress';

// Migration 016: a paid package that ran out unpaid locks the dashboard.

jest.mock('../../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../utils/subscriptions', () => ({
  subscriptionBlockFor: jest.fn(),
  isAllowedWhileSuspended: jest.requireActual('../../utils/subscriptions').isAllowedWhileSuspended,
}));

process.env.JWT_SECRET = 'test-secret';
const token = jwt.sign({ id: 7, email: 'dr@x.lk', role: 'doctor' }, 'test-secret');
const block = { code: 'SUBSCRIPTION_EXPIRED', message: 'Payment due', subject: { kind: 'user', id: 7, audience: 'doctor' }, expires_at: null };

const call = async (url: string) => {
  const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: url, method: 'GET' } as any;
  const res = mockResponse();
  const next = jest.fn();
  await protect(req, res, next);
  return { res, next };
};

describe('protect — subscription lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (pool.query as jest.Mock).mockResolvedValue({ rows: [{ is_active: true }] });
  });

  it('refuses a locked account with 402 and the reason', async () => {
    (subscriptionBlockFor as jest.Mock).mockResolvedValue(block);
    const { res, next } = await call('/api/consultations');
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SUBSCRIPTION_EXPIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('still lets a locked account see its package, billing and notifications', async () => {
    (subscriptionBlockFor as jest.Mock).mockResolvedValue(block);
    for (const url of ['/api/plans/me', '/api/billing/me?organization_id=3', '/api/notifications']) {
      const { next } = await call(url);
      expect(next).toHaveBeenCalled();
    }
    expect(subscriptionBlockFor).not.toHaveBeenCalled();
  });

  it('lets a paid-up account through', async () => {
    (subscriptionBlockFor as jest.Mock).mockResolvedValue(null);
    const { next } = await call('/api/consultations');
    expect(next).toHaveBeenCalled();
  });

  it('fails open: a billing lookup error never blocks clinical work', async () => {
    (subscriptionBlockFor as jest.Mock).mockRejectedValue(new Error('db hiccup'));
    const { res, next } = await call('/api/consultations');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
