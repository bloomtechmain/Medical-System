import { pool } from '../config/db';
import { logger } from '../config/logger';
import { sendMail } from '../config/mailer';
import {
  welcomeEmail, accountApprovedEmail, passwordChangedEmail,
  packageReminderEmail, packageExpiredEmail, adminPackageAlertEmail,
} from './emailTemplates';

// The "nice to have" emails: welcome, approval, password changed, package
// reminders. Each is sent after the thing it reports has already happened
// (and committed), so a mail failure is logged and swallowed. It must never
// undo a registration, an approval or a password change.

type Mail = { subject: string; html: string; text: string };

const deliver = async (to: string | null | undefined, mail: Mail, what: string, meta: Record<string, unknown> = {}): Promise<boolean> => {
  if (!to) return false;
  try {
    await sendMail(to, mail.subject, mail.html, { text: mail.text });
    // Which email, for whom (ids only, no address or content).
    logger.info({ what, ...meta }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, what, ...meta }, 'Could not send email');
    return false;
  }
};

const colomboDateTime = (d = new Date()): string =>
  d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Colombo', timeZoneName: 'short',
  });

export const sendWelcomeEmail = (user: { id?: number; name: string; email: string; role: string }, awaitingApproval = false) =>
  deliver(user.email, welcomeEmail({ name: user.name, role: user.role, awaitingApproval }), 'welcome', { userId: user.id });

export const sendAccountApprovedEmail = (user: { id?: number; name: string; email: string }, organizationName?: string | null) =>
  deliver(user.email, accountApprovedEmail({ name: user.name, organizationName }), 'account_approved', { userId: user.id });

export const sendPasswordChangedEmail = (user: { id?: number; name: string; email: string }, how: 'reset' | 'changed') =>
  deliver(user.email, passwordChangedEmail({ name: user.name, how, when: colomboDateTime() }), 'password_changed', { userId: user.id });

// ── Packages ─────────────────────────────────────────────────────────────────

export interface PackageEmailFacts {
  holderUserId: number | null;
  accountName: string;
  accountType: string;     // doctor / pharmacy / laboratory / hospital …
  isOrganization: boolean;
  planName: string;
  price: string;
  expiresOn: string;
  daysLeft: number;
  paymentInstructions: string;
}

const holderContact = async (userId: number | null): Promise<{ name: string; email: string } | null> => {
  if (!userId) return null;
  const { rows: [u] } = await pool.query(
    'SELECT name, email FROM public.users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  return u ?? null;
};

/** Active system administrators who can receive email. */
export const adminRecipients = async (): Promise<{ id: number; name: string; email: string }[]> => {
  const { rows } = await pool.query(
    `SELECT id, name, email FROM public.users
      WHERE role = 'admin' AND is_active AND deleted_at IS NULL AND email IS NOT NULL
      ORDER BY id`);
  return rows;
};

const alertAdmins = async (kind: 'expiring' | 'expired', f: PackageEmailFacts): Promise<number> => {
  const holder = await holderContact(f.holderUserId);
  const admins = await adminRecipients();
  // One at a time: mail providers cap the send rate (Amazon SES starts at one
  // message a second), and a burst to every admin at once would be throttled.
  let sent = 0;
  for (const a of admins) {
    const ok = await deliver(a.email, adminPackageAlertEmail({
      adminName: a.name, kind, accountName: f.accountName, accountType: f.accountType,
      contact: holder?.email ?? null, planName: f.planName, price: f.price,
      expiresOn: f.expiresOn, daysLeft: f.daysLeft,
    }), `admin_package_${kind}`, { adminId: a.id, account: f.accountName });
    if (ok) sent++;
  }
  return sent;
};

export const sendPackageReminderEmails = async (f: PackageEmailFacts, opts: { alsoAdmins: boolean }): Promise<void> => {
  const holder = await holderContact(f.holderUserId);
  if (holder) {
    await deliver(holder.email, packageReminderEmail({
      name: holder.name, accountName: f.accountName, isOrganization: f.isOrganization,
      planName: f.planName, price: f.price, expiresOn: f.expiresOn, daysLeft: f.daysLeft,
      paymentInstructions: f.paymentInstructions,
    }), 'package_reminder', { userId: f.holderUserId });
  }
  if (opts.alsoAdmins) await alertAdmins('expiring', f);
};

export const sendPackageExpiredEmails = async (f: PackageEmailFacts): Promise<void> => {
  const holder = await holderContact(f.holderUserId);
  if (holder) {
    await deliver(holder.email, packageExpiredEmail({
      name: holder.name, accountName: f.accountName, isOrganization: f.isOrganization,
      planName: f.planName, price: f.price, expiresOn: f.expiresOn,
      paymentInstructions: f.paymentInstructions,
    }), 'package_expired', { userId: f.holderUserId });
  }
  await alertAdmins('expired', f);
};
