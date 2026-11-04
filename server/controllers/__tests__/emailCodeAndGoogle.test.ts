import crypto from 'crypto';
import { pool } from '../../config/db';
import { verifyEmail, googleAuth } from '../authController';
import { sendMail } from '../../config/mailer';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../config/mailer', () => ({ sendMail: jest.fn() }));

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

const query = pool.query as jest.Mock;
const hash = (id: number, code: string) => crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');

describe('verifyEmail (6-digit code, migration 017)', () => {
  const next = jest.fn();
  beforeEach(() => { query.mockReset(); process.env.JWT_SECRET = 'test-secret'; });

  const unverified = { id: 7, name: 'P', email: 'p@x.com', role: 'patient', is_active: true, email_verified_at: null, approved_at: null };

  it('counts a wrong code and tells the user how many tries are left', async () => {
    query
      .mockResolvedValueOnce({ rows: [unverified] })
      .mockResolvedValueOnce({ rows: [{ id: 1, token_hash: hash(7, '123456'), attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = mockResponse();
    await verifyEmail(mockRequest({ body: { email: 'p@x.com', code: '000000' } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ attemptsLeft: 3 }));
    expect(query.mock.calls[2][1]).toEqual([1, 2, false]);
  });

  it('burns the code on the fifth wrong guess', async () => {
    query
      .mockResolvedValueOnce({ rows: [unverified] })
      .mockResolvedValueOnce({ rows: [{ id: 1, token_hash: hash(7, '123456'), attempts: 4 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = mockResponse();
    await verifyEmail(mockRequest({ body: { email: 'p@x.com', code: '000000' } }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codeExpired: true }));
    expect(query.mock.calls[2][1]).toEqual([1, 5, true]);
  });

  it('reports an expired code when there is no live one', async () => {
    query
      .mockResolvedValueOnce({ rows: [unverified] })
      .mockResolvedValueOnce({ rows: [] });

    const res = mockResponse();
    await verifyEmail(mockRequest({ body: { email: 'p@x.com', code: '123456' } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codeExpired: true }));
  });

  it('confirms an account awaiting approval without starting a session', async () => {
    const doctor = { ...unverified, role: 'doctor', is_active: false };
    query
      .mockResolvedValueOnce({ rows: [doctor] })
      .mockResolvedValueOnce({ rows: [{ id: 1, token_hash: hash(7, '123456'), attempts: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...doctor, email_verified_at: new Date() }] })
      .mockResolvedValue({ rows: [] });

    const res = mockResponse();
    await verifyEmail(mockRequest({ body: { email: 'p@x.com', code: '123456' } }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verified: true, awaitingApproval: true }));
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ token: expect.anything() }));
  });

  it('never starts a session for an address that was already confirmed', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...unverified, email_verified_at: new Date() }] });

    const res = mockResponse();
    await verifyEmail(mockRequest({ body: { email: 'p@x.com', code: '123456' } }), res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verified: true }));
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ token: expect.anything() }));
  });
});

describe('googleAuth (patients only)', () => {
  const next = jest.fn();
  beforeEach(() => {
    query.mockReset();
    verifyIdToken.mockReset();
    process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.JWT_SECRET = 'test-secret';
  });

  const googleToken = (claims: Record<string, unknown>) =>
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g-1', email: 'a@gmail.com', email_verified: true, name: 'A', ...claims }) });

  it('refuses a doctor, pharmacist, lab, hospital or admin account', async () => {
    googleToken({});
    query.mockResolvedValueOnce({ rows: [{ id: 3, email: 'a@gmail.com', role: 'doctor', is_active: true, google_sub: null }] });

    const res = mockResponse();
    await googleAuth(mockRequest({ body: { credential: 'x'.repeat(40) } }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'GOOGLE_PATIENTS_ONLY' }));
  });

  it('refuses a token Google could not verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad signature'));

    const res = mockResponse();
    await googleAuth(mockRequest({ body: { credential: 'x'.repeat(40) } }), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a Google account whose email is not verified', async () => {
    googleToken({ email_verified: false });

    const res = mockResponse();
    await googleAuth(mockRequest({ body: { credential: 'x'.repeat(40) } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refuses to re-point a patient already linked to another Google account', async () => {
    googleToken({ sub: 'g-2' });
    query.mockResolvedValueOnce({ rows: [{ id: 4, email: 'a@gmail.com', role: 'patient', is_active: true, google_sub: 'g-1' }] });

    const res = mockResponse();
    await googleAuth(mockRequest({ body: { credential: 'x'.repeat(40) } }), res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('answers 503 when Google sign-in is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const res = mockResponse();
    await googleAuth(mockRequest({ body: { credential: 'x'.repeat(40) } }), res, next);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});

// Keeps the mailer mock referenced so an accidental real send fails loudly.
afterAll(() => { expect(sendMail).not.toHaveBeenCalled(); });
