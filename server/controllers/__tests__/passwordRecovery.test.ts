import { pool, revokeRefreshTokens } from '../../config/db';
import { forgotPassword, resetPassword } from '../authController';
import { sendMail } from '../../config/mailer';
import { mockRequest, mockResponse } from '../../test-utils/mockExpress';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  queryAs: jest.fn(),
  revokeRefreshTokens: jest.fn(),
}));
jest.mock('../../config/mailer', () => ({ sendMail: jest.fn() }));

const query = pool.query as jest.Mock;
const mail = sendMail as jest.Mock;
const flush = () => new Promise(r => setImmediate(r));

const generic = { message: 'If an account with that email exists, a password reset link has been sent.' };

beforeEach(() => {
  query.mockReset();
  mail.mockReset().mockResolvedValue(undefined);
  (revokeRefreshTokens as jest.Mock).mockReset();
  process.env.CLIENT_URL = 'https://app.suwela.com';
});

describe('forgot password', () => {
  it('finds the account whatever the letter case and emails a single-use link', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'Nimal', email: 'nimal@x.lk', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ n: '0' }] })   // resets in the last hour
      .mockResolvedValueOnce({ rows: [] })             // cancel older links
      .mockResolvedValueOnce({ rows: [] });            // insert the new one

    const res = mockResponse();
    await forgotPassword(mockRequest({ body: { email: '  Nimal@X.lk ' } }), res, jest.fn());

    expect(query.mock.calls[0][0]).toContain('LOWER(email) = LOWER($1)');
    expect(query.mock.calls[0][1]).toEqual(['Nimal@X.lk']);
    expect(query.mock.calls[2][0]).toContain('SET used_at = NOW()');
    expect(mail).toHaveBeenCalledWith('nimal@x.lk', 'Reset your Suwela password', expect.stringContaining('https://app.suwela.com/reset-password?token='), expect.anything());
    expect(res.json).toHaveBeenCalledWith(generic);
  });

  it('answers the same for an unknown address and sends nothing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockResponse();
    await forgotPassword(mockRequest({ body: { email: 'nobody@x.lk' } }), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(generic);
    expect(mail).not.toHaveBeenCalled();
  });

  it('gives the same answer when the mail server refuses (no account enumeration)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'N', email: 'n@x.lk', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ n: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mail.mockRejectedValueOnce(new Error('Email address is not verified'));
    const res = mockResponse();
    const next = jest.fn();
    await forgotPassword(mockRequest({ body: { email: 'n@x.lk' } }), res, next);
    expect(res.json).toHaveBeenCalledWith(generic);
    expect(next).not.toHaveBeenCalled();
  });

  it('stops sending after 5 links in an hour, with the same answer', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'N', email: 'n@x.lk', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ n: '5' }] });
    const res = mockResponse();
    await forgotPassword(mockRequest({ body: { email: 'n@x.lk' } }), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(generic);
    expect(mail).not.toHaveBeenCalled();
  });
});

describe('reset password', () => {
  it('sets the password, confirms the email, signs out everywhere and sends a notice', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 9, user_id: 3 }] })                         // live token
      .mockResolvedValueOnce({ rowCount: 1 })                                           // claim it
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'Nimal', email: 'nimal@x.lk' }] }); // update user

    const res = mockResponse();
    await resetPassword(mockRequest({ body: { token: 'abc', newPassword: 'a-new-long-password' } }), res, jest.fn());
    await flush();

    expect(query.mock.calls[2][0]).toContain('email_verified_at = COALESCE(email_verified_at, NOW())');
    expect(revokeRefreshTokens).toHaveBeenCalledWith(3);
    expect(mail).toHaveBeenCalledWith('nimal@x.lk', 'Your Suwela password was changed', expect.any(String), expect.anything());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Password reset') }));
  });

  it('refuses a link that another request has just used', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 9, user_id: 3 }] })
      .mockResolvedValueOnce({ rowCount: 0 });

    const res = mockResponse();
    await resetPassword(mockRequest({ body: { token: 'abc', newPassword: 'a-new-long-password' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });
});
