import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { login } from '../authController';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const query = pool.query as jest.Mock;

describe('authController.login', () => {
  const next = jest.fn();

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('returns 401 when no active user matches the email', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'x@x.com', password: 'pass' } }), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns 401 when the password does not match', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, email: 'x@x.com', password: 'hashed', role: 'patient' }] });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'x@x.com', password: 'wrong' } }), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns the user (without password) and a token on success', async () => {
    const user = { id: 1, email: 'x@x.com', password: 'hashed', role: 'patient', is_active: true };
    query
      .mockResolvedValueOnce({ rows: [user] })  // SELECT * FROM users WHERE email = ?
      .mockResolvedValueOnce({ rows: [] });      // getOrgForUser → no org membership
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwt.sign as jest.Mock).mockReturnValue('fake-token');

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'x@x.com', password: 'correct' } }), res, next);

    expect(res.json).toHaveBeenCalledWith({
      user: { id: 1, email: 'x@x.com', role: 'patient', is_active: true, organization: null },
      token: 'fake-token',
    });
  });

  it('forwards database errors to next()', async () => {
    const error = new Error('DB connection failed');
    query.mockRejectedValue(error);

    await login(mockRequest({ body: { email: 'x@x.com', password: 'pass' } }), mockResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
