// Checks the SMTP configuration without going near the application.
//
// Written because the alternative — register a user, then guess whether the
// email left the building — conflates three different failures: SMTP is
// misconfigured, the mail was accepted but filed as spam, or the app never
// tried to send at all (which is what `SMTP_HOST` being unset does, silently,
// by design). This separates them: it reports what is configured, proves the
// connection and credentials independently of sending, then sends one real
// message.
//
// Run:
//   cd server
//   npx tsx scripts/testMail.ts you@example.com
//
// Prints no secret values — only which variables are set.
import 'dotenv/config';
import nodemailer from 'nodemailer';

const to = process.argv[2] || process.env.SMTP_FROM || process.env.SEED_ADMIN_EMAIL;

const present = (name: string): string => (process.env[name] ? 'set' : 'NOT SET');

const main = async (): Promise<void> => {
  console.log('\nSMTP configuration');
  console.log('------------------');
  console.log(`  SMTP_HOST      ${present('SMTP_HOST')}${process.env.SMTP_HOST ? `  (${process.env.SMTP_HOST})` : ''}`);
  console.log(`  SMTP_PORT      ${process.env.SMTP_PORT || '587 (default)'}`);
  console.log(`  SMTP_SECURE    ${process.env.SMTP_SECURE || 'false (default)'}`);
  console.log(`  SMTP_USER      ${present('SMTP_USER')}${process.env.SMTP_USER ? `  (${process.env.SMTP_USER})` : ''}`);
  console.log(`  SMTP_PASSWORD  ${present('SMTP_PASSWORD')}`);
  console.log(`  SMTP_FROM      ${process.env.SMTP_FROM || 'Core Health <no-reply@corehealth.local> (default)'}`);
  console.log(`  CLIENT_URL     ${process.env.CLIENT_URL || 'NOT SET'}`);

  if (!process.env.SMTP_HOST) {
    console.log('\nSMTP_HOST is not set, so the application does NOT send email.');
    console.log('It logs the message to the server console instead — look for a line');
    console.log('starting "[mailer] (no SMTP configured) would send to ...".');
    console.log('\nThat is a deliberate fallback, not a fault: it keeps password reset');
    console.log('and email verification testable without a mail account. But in any');
    console.log('deployed environment it means nobody can reset a password or confirm');
    console.log('an address, because the link only ever reaches the server log.\n');
    process.exit(1);
  }

  // CLIENT_URL is what the links in those emails are built from. A perfectly
  // delivered email with a broken link is still a broken flow, and the reset
  // email would literally read "undefined/reset-password?token=...".
  if (!process.env.CLIENT_URL) {
    console.log('\nWARNING: CLIENT_URL is not set. Mail may send fine, but the links');
    console.log('inside it will be malformed — set it to the client\'s public origin.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  // Separated from sending on purpose: this proves host, port, TLS and
  // credentials. If it passes and the send then fails, the problem is the
  // message (a rejected From address, a recipient policy), not the connection.
  console.log('\nVerifying connection and credentials...');
  try {
    await transporter.verify();
    console.log('  OK — the server accepted the connection and the credentials.');
  } catch (err) {
    const message = (err as Error).message;
    console.error(`  FAILED — ${message}`);
    console.error('\nCommon causes:');
    console.error('  "Invalid login" / 535     Wrong username or password. For Gmail or');
    console.error('                            Google Workspace this must be a 16-character');
    console.error('                            App Password, not the account password.');
    console.error('  ETIMEDOUT / ECONNREFUSED  Wrong host or port, or the port is blocked.');
    console.error('                            Try 587 with SMTP_SECURE=false, or 465 with');
    console.error('                            SMTP_SECURE=true.');
    console.error('  "wrong version number"    SMTP_SECURE does not match the port. 465 is');
    console.error('                            secure=true; 587 is secure=false (STARTTLS).');
    console.error('  "self signed certificate" A proxy is intercepting TLS, common on');
    console.error('                            corporate networks.\n');
    process.exit(1);
  }

  if (!to) {
    console.log('\nNo recipient given and SMTP_FROM/SEED_ADMIN_EMAIL are unset.');
    console.log('Connection is good. To send a test message:');
    console.log('  npx tsx scripts/testMail.ts you@example.com\n');
    return;
  }

  console.log(`\nSending a test message to ${to}...`);
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Core Health <no-reply@corehealth.local>',
    to,
    subject: 'Core Health — SMTP test',
    html: `<p>If you are reading this, Core Health can send email.</p>
           <p>Password reset and email verification links will be delivered to
           real inboxes rather than written to the server log.</p>
           <p>Links in those emails are built from
           <code>CLIENT_URL</code>, currently
           <code>${process.env.CLIENT_URL || '(not set)'}</code> — confirm that
           is reachable from wherever people read their email.</p>`,
  });

  console.log(`  Accepted by the server. Message id: ${info.messageId}`);
  if (info.rejected?.length) {
    console.log(`  REJECTED recipients: ${info.rejected.join(', ')}`);
  }
  console.log('\nAccepted is not the same as delivered — check the inbox, and the');
  console.log('spam folder. A brand-new sending domain with no SPF/DKIM records is');
  console.log('very likely to be filed as spam.\n');
};

main().catch(err => {
  console.error('\nSend failed:', (err as Error).message);
  console.error('The connection verified, so this is about the message itself —');
  console.error('usually a From address the provider will not allow you to use.\n');
  process.exit(1);
});
