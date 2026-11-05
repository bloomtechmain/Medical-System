import { pool } from '../../config/db';
import { sendMail } from '../../config/mailer';
import {
  sendWelcomeEmail, sendPasswordChangedEmail, sendPackageReminderEmails, sendPackageExpiredEmails, PackageEmailFacts,
} from '../accountEmails';
import { welcomeEmail, packageReminderEmail, adminPackageAlertEmail } from '../emailTemplates';

jest.mock('../../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../config/mailer', () => ({ sendMail: jest.fn() }));

const query = pool.query as jest.Mock;
const mail = sendMail as jest.Mock;

const facts: PackageEmailFacts = {
  holderUserId: 5,
  accountName: 'City Lab',
  accountType: 'laboratory organisation',
  isOrganization: true,
  planName: 'Standard',
  price: 'LKR 2,500',
  expiresOn: '13 Nov 2026',
  daysLeft: 7,
  paymentInstructions: 'Pay by bank transfer.',
};

const holder = { name: 'Owner', email: 'owner@lab.lk' };
const admins = [
  { id: 1, name: 'Admin One', email: 'admin1@suwela.com' },
  { id: 2, name: 'Admin Two', email: 'admin2@gmail.com' },
];

beforeEach(() => { query.mockReset(); mail.mockReset().mockResolvedValue(undefined); });

describe('package expiry emails', () => {
  it('reminds the holder and every system admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [holder] })   // holder for the reminder
      .mockResolvedValueOnce({ rows: [holder] })   // holder contact in the admin alert
      .mockResolvedValueOnce({ rows: admins });

    await sendPackageReminderEmails(facts, { alsoAdmins: true });

    const to = mail.mock.calls.map(c => c[0]);
    expect(to).toEqual(['owner@lab.lk', 'admin1@suwela.com', 'admin2@gmail.com']);
    expect(mail.mock.calls[0][1]).toBe('Your Suwela package expires in 7 days');
    expect(mail.mock.calls[1][1]).toContain('[Suwela admin] City Lab');
    // The admin email names who to chase.
    expect(mail.mock.calls[1][2]).toContain('owner@lab.lk');
  });

  it('only reminds the holder when admins are not due a notice', async () => {
    query.mockResolvedValueOnce({ rows: [holder] });
    await sendPackageReminderEmails({ ...facts, daysLeft: 3 }, { alsoAdmins: false });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0]).toBe('owner@lab.lk');
  });

  it('tells the holder and the admins when the account is locked', async () => {
    query
      .mockResolvedValueOnce({ rows: [holder] })
      .mockResolvedValueOnce({ rows: [holder] })
      .mockResolvedValueOnce({ rows: [admins[0]] });

    await sendPackageExpiredEmails({ ...facts, daysLeft: 0 });

    expect(mail.mock.calls.map(c => c[1])).toEqual([
      'Your Suwela package has expired',
      '[Suwela admin] City Lab: package expired, account locked',
    ]);
  });

  it('still alerts the admins when one address fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [holder] })
      .mockResolvedValueOnce({ rows: [holder] })
      .mockResolvedValueOnce({ rows: admins });
    mail.mockRejectedValueOnce(new Error('SMTP down')); // the holder's

    await expect(sendPackageReminderEmails(facts, { alsoAdmins: true })).resolves.toBeUndefined();
    expect(mail).toHaveBeenCalledTimes(3);
  });
});

describe('account emails never throw', () => {
  it('swallows a mail failure on the welcome email', async () => {
    mail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(sendWelcomeEmail({ name: 'P', email: 'p@x.lk', role: 'patient' })).resolves.toBe(false);
  });

  it('sends a password-changed notice', async () => {
    await expect(sendPasswordChangedEmail({ name: 'P', email: 'p@x.lk' }, 'reset')).resolves.toBe(true);
    expect(mail.mock.calls[0][1]).toBe('Your Suwela password was changed');
    expect(mail.mock.calls[0][2]).toContain('/forgot-password');
  });
});

describe('templates', () => {
  it('escapes names so an account name cannot inject HTML', () => {
    const { html } = welcomeEmail({ name: '<script>x</script>', role: 'patient' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('tells a professional the registration is under review', () => {
    const { html } = welcomeEmail({ name: 'Dr A', role: 'doctor', awaitingApproval: true });
    expect(html).toContain('What happens next');
    expect(html).not.toContain('Open my dashboard');
  });

  it('marks the last-day reminder as urgent', () => {
    expect(packageReminderEmail({ ...facts, name: 'O', daysLeft: 1 }).subject).toBe('Your Suwela package expires tomorrow');
    const admin = adminPackageAlertEmail({
      adminName: 'A', kind: 'expiring', accountName: 'X', accountType: 'doctor', contact: null,
      planName: 'Pro', price: 'LKR 1', expiresOn: 'today', daysLeft: 2,
    });
    expect(admin.subject).toBe('[Suwela admin] X: package expires in 2 days');
  });
});
