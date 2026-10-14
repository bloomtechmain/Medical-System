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

  it('returns the user (without password), an access token, and a refresh token on success', async () => {
    // PRO-11: email_verified_at must be set, or login is refused before it
    // ever reaches the token-issuing path. A verified account is now part of
    // what "success" means.
    const user = {
      id: 1, email: 'x@x.com', password: 'hashed', role: 'patient',
      is_active: true, email_verified_at: new Date('2026-01-01'),
    };
    query
      .mockResolvedValueOnce({ rows: [user] })  // SELECT * FROM users WHERE email = ?
      .mockResolvedValueOnce({ rows: [] })      // getOrgForUser → no org membership
      .mockResolvedValueOnce({ rows: [] });     // issueRefreshToken → INSERT INTO refresh_tokens
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwt.sign as jest.Mock).mockReturnValue('fake-token');

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'x@x.com', password: 'correct' } }), res, next);

    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 1, email: 'x@x.com', role: 'patient', is_active: true,
        email_verified_at: user.email_verified_at, organization: null,
      },
      token: 'fake-token',
      refreshToken: expect.any(String),
    });
  });

  // PRO-11: "Sign-up needs no email verification ... and the account can act
  // at once." Checked AFTER the password, so it reveals nothing to someone
  // who does not already hold the credentials — and it must hand back
  // emailUnverified so the client can offer a resend rather than leaving the
  // user at a dead end.
  it('refuses an unverified account, after the password has been accepted', async () => {
    const user = {
      id: 1, email: 'x@x.com', password: 'hashed', role: 'patient',
      is_active: true, email_verified_at: null,
    };
    query.mockResolvedValueOnce({ rows: [user] });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'x@x.com', password: 'correct' } }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ emailUnverified: true })
    );
    // No session may be issued on this path.
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.anything() })
    );
  });

  it('forwards database errors to next()', async () => {
    const error = new Error('DB connection failed');
    query.mockRejectedValue(error);

    await login(mockRequest({ body: { email: 'x@x.com', password: 'pass' } }), mockResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
