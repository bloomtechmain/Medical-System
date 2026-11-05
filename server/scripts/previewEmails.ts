/* eslint-disable no-console */
// Renders every system email and sends each one through the configured SMTP
// server, so a mail setup can be checked end to end in one go.
//
//   npm run mail:preview -- you@example.com        send all of them to you
//   npm run mail:preview -- --out ./email-previews write .html files only
//
// Uses SMTP_* from the environment, exactly like the server.
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import {
  verificationCodeEmail, passwordResetEmail, welcomeEmail, accountApprovedEmail, passwordChangedEmail,
  packageReminderEmail, packageExpiredEmail, adminPackageAlertEmail,
} from '../utils/emailTemplates';

const pkg = {
  name: 'Nimal Perera', accountName: 'City Care Laboratory', isOrganization: true,
  planName: 'Standard', price: 'LKR 2,500', expiresOn: '13 Nov 2026',
  paymentInstructions: 'Pay by bank transfer or at the Suwela office, quoting the email address of this account.',
};

const samples = {
  '01-verification-code': verificationCodeEmail({ name: 'Nimal', code: '482915', minutes: 15, link: 'https://app.suwela.com/verify-email?email=nimal%40example.lk' }),
  '02-welcome-patient': welcomeEmail({ name: 'Nimal', role: 'patient' }),
  '03-welcome-professional': welcomeEmail({ name: 'Dr. Silva', role: 'doctor', awaitingApproval: true }),
  '04-account-approved': accountApprovedEmail({ name: 'Nimal', organizationName: 'City Care Laboratory' }),
  '05-password-reset': passwordResetEmail({ name: 'Nimal', link: 'https://app.suwela.com/reset-password?token=example', minutes: 60 }),
  '06-password-changed': passwordChangedEmail({ name: 'Nimal', how: 'reset', when: '6 Nov 2026, 10:30 GMT+5:30' }),
  '07-package-7-days': packageReminderEmail({ ...pkg, daysLeft: 7 }),
  '08-package-1-day': packageReminderEmail({ ...pkg, daysLeft: 1 }),
  '09-package-expired': packageExpiredEmail(pkg),
  '10-admin-expiring': adminPackageAlertEmail({ adminName: 'Tharusha', kind: 'expiring', accountName: 'City Care Laboratory', accountType: 'laboratory organisation', contact: 'owner@citycare.lk', planName: 'Standard', price: 'LKR 2,500', expiresOn: '13 Nov 2026', daysLeft: 7 }),
  '11-admin-expired': adminPackageAlertEmail({ adminName: 'Tharusha', kind: 'expired', accountName: 'City Care Laboratory', accountType: 'laboratory organisation', contact: 'owner@citycare.lk', planName: 'Standard', price: 'LKR 2,500', expiresOn: '13 Nov 2026', daysLeft: 0 }),
};

const main = async () => {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0) {
    const dir = path.resolve(args[outIdx + 1] || 'email-previews');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, m] of Object.entries(samples)) fs.writeFileSync(path.join(dir, `${name}.html`), m.html);
    console.log(`Wrote ${Object.keys(samples).length} previews to ${dir}`);
    return;
  }
  const to = args[0];
  if (!to) { console.error('Usage: npm run mail:preview -- you@example.com   (or --out <dir>)'); process.exit(1); }
  if (!process.env.SMTP_HOST) { console.error('SMTP_HOST is not set.'); process.exit(1); }
  const { sendMail } = await import('../config/mailer');
  for (const [name, m] of Object.entries(samples)) {
    try {
      await sendMail(to, `[preview] ${m.subject}`, m.html, { text: m.text });
      console.log(`sent  ${name}`);
    } catch (err) {
      console.log(`FAIL  ${name}: ${(err as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 1100)); // stay under 1 message/second
  }
};

main().catch(err => { console.error(err); process.exit(1); });
