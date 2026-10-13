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

if (!hasSmtp) {
  console.log('[mailer] SMTP_HOST is not set — emails will be logged to the console instead of sent (ARCH-style optional-service fallback).');
}

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
