// Branded HTML for the emails the system sends. Kept to inline styles and a
// single table layout, because that is what renders the same in Gmail,
// Outlook and phone mail apps — no external CSS, no web fonts, no images that
// a client may block.

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const layout = (title: string, inner: string): string => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F6F4;font-family:Arial,Helvetica,sans-serif;color:#1F2A37;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6F4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#0E2C52;padding:22px 32px;">
          <span style="font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:0.3px;">Suwela</span>
          <span style="font-size:13px;color:#9FE3D2;padding-left:6px;">Medical Hub</span>
        </td></tr>
        <tr><td style="padding:32px;">${inner}</td></tr>
        <tr><td style="padding:18px 32px;background:#F8FAF9;font-size:12px;color:#6B7280;line-height:1.5;">
          This is an automated message from Suwela Medical Hub. Please do not reply to it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

// The registration / sign-in confirmation code. The code is the whole point of
// the message, so it is large, spaced and alone on its line; the link only
// pre-fills the address on the code screen for someone who closed the tab.
const verificationCodeEmail = (opts: { name: string; code: string; minutes: number; link?: string }) => {
  const subject = `${opts.code} is your Suwela verification code`;
  const html = layout('Verify your email', `
    <p style="margin:0 0 14px;font-size:16px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">
      Use this code to confirm your email address and finish creating your Suwela account.
    </p>
    <div style="text-align:center;margin:0 0 22px;">
      <span style="display:inline-block;font-size:34px;font-weight:bold;letter-spacing:10px;color:#0E2C52;background:#E8F6F2;border-radius:14px;padding:14px 22px 14px 32px;">${escapeHtml(opts.code)}</span>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;">
      The code expires in <strong>${opts.minutes} minutes</strong> and can be used once.
    </p>
    ${opts.link ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;">Closed the page? <a href="${escapeHtml(opts.link)}" style="color:#1598E9;">Open the verification screen</a> and enter the code there.</p>` : ''}
    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">
      If you did not try to create a Suwela account, ignore this email — nobody can use the account without this code. Never share this code with anyone; Suwela staff will never ask for it.
    </p>`);
  const text = `Hi ${opts.name},\n\nYour Suwela verification code is: ${opts.code}\n\nIt expires in ${opts.minutes} minutes and can be used once.\n${opts.link ? `\nVerification screen: ${opts.link}\n` : ''}\nIf you did not try to create a Suwela account, ignore this email. Never share this code with anyone.`;
  return { subject, html, text };
};

const passwordResetEmail = (opts: { name: string; link: string; minutes: number }) => {
  const subject = 'Reset your Suwela password';
  const html = layout(subject, `
    <p style="margin:0 0 14px;font-size:16px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">
      We received a request to reset your password. The link below expires in ${opts.minutes} minutes and can only be used once.
    </p>
    <div style="text-align:center;margin:0 0 22px;">
      <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#13A58F;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;border-radius:999px;padding:13px 28px;">Reset password</a>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6B7280;word-break:break-all;">Or paste this into your browser: ${escapeHtml(opts.link)}</p>
    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">If you didn't request this, you can safely ignore this email.</p>`);
  const text = `Hi ${opts.name},\n\nReset your Suwela password (expires in ${opts.minutes} minutes):\n${opts.link}\n\nIf you didn't request this, ignore this email.`;
  return { subject, html, text };
};

export { verificationCodeEmail, passwordResetEmail, escapeHtml };
