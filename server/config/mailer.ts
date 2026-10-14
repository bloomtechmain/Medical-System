import nodemailer from 'nodemailer';

// SEC-17 (auth): forgot-password needs to actually deliver a link somewhere.
// No mail provider exists yet in this codebase, so this is intentionally
// pluggable — same "optional service, graceful fallback" shape as
// REDIS_URL in config/socket.ts. With SMTP_HOST set, it sends real email;
// without it (local dev, or before SMTP is configured in whatever
// environment this deploys to), it logs the content to the console instead
// of silently failing, so the feature is still testable end-to-end.
const hasSmtp = !!process.env.SMTP_HOST;

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    })
  : null;

// PRO-11: email verification is on by default, so an environment with no
// mail path cannot confirm any new address — every registration becomes an
// account that can never log in, and the only clue is a console line nobody
// reads. In development that is fine and deliberate (read the link out of the
// server log). In production it is a silent, total lockout of new users.
//
// Treated the same way as a missing environment variable (ARCH-04) and a
// database behind the code (schemaCheck.ts): refuse to start and say exactly
// what to do, rather than coming up and failing every user quietly.
const assertMailPath = (): void => {
  if (hasSmtp) return;

  const verificationRequired = process.env.FEATURE_REQUIRE_EMAIL_VERIFICATION !== 'false';

  if (process.env.NODE_ENV === 'production' && verificationRequired) {
    const lines = [
      '',
      '=============================================================',
      ' NO MAIL PATH, BUT EMAIL VERIFICATION IS REQUIRED.',
      '=============================================================',
      '',
      'SMTP_HOST is not set, so no confirmation email can be sent — and',
      'FEATURE_REQUIRE_EMAIL_VERIFICATION is on, so no new account can log in',
      'without one. Every registration would become an account nobody can get',
      'into, and password reset would be equally unusable.',
      '',
      'Pick one:',
      '  - Configure SMTP (see server/.env.example, then',
      '    `npm run mail:test you@example.com` to check it), or',
      '  - Set FEATURE_REQUIRE_EMAIL_VERIFICATION=false to accept unverified',
      '    addresses deliberately.',
      '',
    ];
    console.error(lines.join('\n'));
    process.exit(1);
  }

  console.warn(
    '[mailer] SMTP_HOST is not set — confirmation and password-reset emails are ' +
    'logged to the console instead of sent. Fine locally (grep the log for ' +
    '"verify-email?token="); never acceptable in a deployed environment.'
  );
};

assertMailPath();

const sendMail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!transporter) {
    console.log(`[mailer] (no SMTP configured) would send to ${to}: ${subject}\n${html}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Core Health <no-reply@corehealth.local>',
    to,
    subject,
    html,
  });
};

export { sendMail };
