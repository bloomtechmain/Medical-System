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
        email_verified_at: user.email_verified_at,
        organization: null,
        // Requirement 1: login now returns every dashboard context the
        // account holds, so the client can offer a choice and a switcher.
        // Empty here because this user belongs to no organisation.
        memberships: [],
        // Migration 014: patients are never on a package — everything is
        // free for them — so there is no plan, and no plan query was made.
        plan: null,
      },
      token: 'fake-token',
      refreshToken: expect.any(String),
    });
  });

  // Requirement 1: the bug was that picking an existing doctor as a hospital
  // owner silently removed that doctor's own dashboard, because login
  // returned one organisation and routing preferred it over the user's role.
  // Login must now hand back BOTH so nothing can be hidden.
  it('returns every organisation the user belongs to, not just the first', async () => {
    const user = {
      id: 2, email: 'dr@x.com', password: 'hashed', role: 'doctor',
      is_active: true, email_verified_at: new Date('2026-01-01'),
    };
    const memberships = [
      { id: 10, name: 'Nawaloka Hospital', org_type: 'hospital', slug: 'nawaloka', is_active: true, member_role: 'owner' },
      { id: 11, name: 'City Medical Lab', org_type: 'laboratory', slug: 'citylab', is_active: true, member_role: 'owner' },
    ];
    const freePlan = {
      id: 1, audience: 'doctor', code: 'free', name: 'Free', description: null,
      price_monthly: 0, price_yearly: 0, currency: 'LKR', is_default: true, is_active: true, sort_order: 0,
      features: { consultations_per_month: 30, lab_requests: false },
    };
    query
      .mockResolvedValueOnce({ rows: [user] })        // SELECT * FROM users
      .mockResolvedValueOnce({ rows: memberships })   // getMembershipsForUser
      .mockResolvedValueOnce({ rows: [{ plan_id: null }] }) // personal plan: users.plan_id
      .mockResolvedValueOnce({ rows: [freePlan] })    // → the doctor audience's default plan
      .mockResolvedValueOnce({ rows: [] });           // issueRefreshToken
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwt.sign as jest.Mock).mockReturnValue('fake-token');

    const res = mockResponse();
    await login(mockRequest({ body: { email: 'dr@x.com', password: 'correct' } }), res, next);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.user.memberships).toHaveLength(2);
    expect(payload.user.memberships.map((m: { name: string }) => m.name))
      .toEqual(['Nawaloka Hospital', 'City Medical Lab']);
    // `organization` is kept for existing callers and resolves to the owned
    // org, but it must no longer be the only thing returned.
    expect(payload.user.organization).toMatchObject({ name: 'Nawaloka Hospital' });
    // Migration 014: a doctor with no explicit package is on the default one,
    // and every catalogue feature comes back with a definite value.
    expect(payload.user.plan).toMatchObject({ code: 'free', audience: 'doctor' });
    expect(payload.user.plan.features.lab_requests).toBe(false);
    expect(payload.user.plan.features.e_prescriptions).toBe(false);
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
