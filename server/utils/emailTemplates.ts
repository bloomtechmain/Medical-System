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
    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">If you didn't request this, you can safely ignore this email — your password stays the same until the link is used. Never forward this link; Suwela staff will never ask for it.</p>`);
  const text = `Hi ${opts.name},\n\nReset your Suwela password (expires in ${opts.minutes} minutes):\n${opts.link}\n\nIf you didn't request this, ignore this email.`;
  return { subject, html, text };
};

// ── Shared pieces ────────────────────────────────────────────────────────────

const appUrl = (path = ''): string =>
  `${(process.env.CLIENT_URL || 'https://app.suwela.com').trim().replace(/\/$/, '')}${path}`;

const greeting = (name: string) =>
  `<p style="margin:0 0 14px;font-size:16px;">Hi ${escapeHtml(name)},</p>`;

const para = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;

const small = (html: string) =>
  `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">${html}</p>`;

const heading = (text: string, color = '#0E2C52') =>
  `<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:${color};">${escapeHtml(text)}</p>`;

const button = (label: string, href: string, color = '#13A58F') => `
    <div style="text-align:center;margin:6px 0 22px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;border-radius:999px;padding:13px 28px;">${escapeHtml(label)}</a>
    </div>`;

type Tone = 'info' | 'warning' | 'danger' | 'success';
const TONES: Record<Tone, { bg: string; border: string; fg: string }> = {
  info:    { bg: '#EAF5FD', border: '#B9DDF7', fg: '#0E4A7A' },
  success: { bg: '#E8F6F2', border: '#B5E4D7', fg: '#0F5E50' },
  warning: { bg: '#FFF7E6', border: '#F8D9A0', fg: '#7A4B00' },
  danger:  { bg: '#FDECEC', border: '#F5C2C2', fg: '#8A1C1C' },
};

/** A highlighted box of label → value rows (package, amount, dates). */
const factBox = (rows: [string, string][], tone: Tone = 'info') => {
  const t = TONES[tone];
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${t.bg};border:1px solid ${t.border};border-radius:14px;">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#6B7280;width:42%;">${escapeHtml(k)}</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:bold;color:${t.fg};">${escapeHtml(v)}</td>
      </tr>`).join('')}
    </table>`;
};

/** Numbered steps. Items are trusted HTML written in this file. */
const steps = (items: string[]) => `
    <ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.7;color:#374151;">
      ${items.map(i => `<li style="margin-bottom:4px;">${i}</li>`).join('')}
    </ol>`;

const ROLE_LABEL: Record<string, string> = {
  patient: 'patient', doctor: 'doctor', pharmacist: 'pharmacy', laboratory: 'laboratory', admin: 'administrator',
};

// ── Welcome ──────────────────────────────────────────────────────────────────

// Sent once, when an account's email address is first confirmed (or a Google
// sign-up creates it). Professionals are told their registration is with the
// Suwela team; patients can start straight away.
const welcomeEmail = (opts: { name: string; role: string; awaitingApproval?: boolean }) => {
  const subject = 'Welcome to Suwela Medical Hub';
  const kind = ROLE_LABEL[opts.role] ? `${ROLE_LABEL[opts.role]} ` : '';
  const html = layout(subject, `
    ${greeting(opts.name)}
    ${para(`Welcome to <strong>Suwela Medical Hub</strong>! Your email address is confirmed${opts.awaitingApproval
      ? ` and your ${kind}registration is now with our team for review.`
      : ' and your account is ready to use.'}`)}
    ${heading(opts.awaitingApproval ? 'What happens next' : 'Get started')}
    ${steps(opts.awaitingApproval ? [
      'The Suwela team reviews your registration, usually within one working day.',
      'We email you the moment it is approved.',
      'Then sign in and set up your dashboard.',
    ] : [
      'Complete your health profile: blood group, allergies and an emergency contact.',
      'Find a doctor and book an appointment.',
      'Keep your prescriptions, lab reports and vitals together in one place.',
    ])}
    ${opts.awaitingApproval ? '' : button('Open my dashboard', appUrl('/login'))}
    ${small('Forgot your password at any time? Choose <strong>Forgot password</strong> on the sign-in page and we will email you a secure reset link.')}`);
  const text = `Hi ${opts.name},\n\nWelcome to Suwela Medical Hub! Your email address is confirmed${opts.awaitingApproval
    ? ' and your registration is with our team for review. We will email you as soon as it is approved.'
    : ` and your account is ready.\n\nSign in: ${appUrl('/login')}`}\n\nForgot your password? Use "Forgot password" on the sign-in page.`;
  return { subject, html, text };
};

// Sent when an admin approves a professional account or an organisation.
const accountApprovedEmail = (opts: { name: string; organizationName?: string | null }) => {
  const subject = opts.organizationName ? `${opts.organizationName} is approved on Suwela` : 'Your Suwela account is approved';
  const html = layout(subject, `
    ${greeting(opts.name)}
    ${para(`Good news! ${opts.organizationName ? `<strong>${escapeHtml(opts.organizationName)}</strong> has` : 'Your account has'} been approved by the Suwela team. You can sign in and start using your dashboard now.`)}
    ${button('Sign in to Suwela', appUrl('/login'))}
    ${small('Can&#39;t remember your password? Choose <strong>Forgot password</strong> on the sign-in page to get a reset link.')}`);
  const text = `Hi ${opts.name},\n\n${opts.organizationName ? `${opts.organizationName} has` : 'Your account has'} been approved by the Suwela team.\n\nSign in: ${appUrl('/login')}`;
  return { subject, html, text };
};

// ── Security ─────────────────────────────────────────────────────────────────

// After every password change, so a change the owner did not make is noticed.
const passwordChangedEmail = (opts: { name: string; how: 'reset' | 'changed'; when: string }) => {
  const subject = 'Your Suwela password was changed';
  const recover = appUrl('/forgot-password');
  const html = layout(subject, `
    ${greeting(opts.name)}
    ${para(`The password for your Suwela account was ${opts.how === 'reset' ? 'reset with a password-reset link' : 'changed from your account settings'}. For your safety, every device that was signed in has been signed out.`)}
    ${factBox([['When', opts.when], ['How', opts.how === 'reset' ? 'Forgot-password reset link' : 'Settings → Change password']], 'success')}
    ${heading('Wasn’t you?', '#8A1C1C')}
    ${steps([
      `Reset your password straight away: <a href="${escapeHtml(recover)}" style="color:#1598E9;">${escapeHtml(recover)}</a>`,
      'Make sure your email account itself is secure, because whoever controls it can reset your Suwela password.',
      'Contact the Suwela team so we can review recent activity on your account.',
    ])}`);
  const text = `Hi ${opts.name},\n\nYour Suwela password was ${opts.how === 'reset' ? 'reset with a reset link' : 'changed'} on ${opts.when}. All devices were signed out.\n\nIf this wasn't you, reset it now: ${recover} and contact the Suwela team.`;
  return { subject, html, text };
};

// ── Packages / billing ───────────────────────────────────────────────────────

interface PackageFacts {
  name: string;           // the person greeted
  accountName: string;    // the account (user or organisation) the package belongs to
  isOrganization: boolean;
  planName: string;
  price: string;          // "LKR 2,500"
  expiresOn: string;      // formatted date
  daysLeft: number;
  paymentInstructions: string;
}

const whenText = (daysLeft: number) => (daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`);

const packageReminderEmail = (o: PackageFacts) => {
  const when = whenText(o.daysLeft);
  const subject = `Your Suwela package expires ${when}`;
  const whose = o.isOrganization ? `<strong>${escapeHtml(o.accountName)}</strong>&#39;s` : 'Your';
  const html = layout(subject, `
    ${greeting(o.name)}
    ${para(`${whose} <strong>${escapeHtml(o.planName)}</strong> package expires <strong>${when}</strong>. Renew before then to keep the dashboard open without interruption.`)}
    ${factBox([
      ['Account', o.accountName],
      ['Package', o.planName],
      ['Monthly price', o.price],
      ['Expires on', o.expiresOn],
      ['Days left', String(o.daysLeft)],
    ], o.daysLeft <= 1 ? 'danger' : o.daysLeft <= 3 ? 'warning' : 'info')}
    ${heading('How to renew')}
    ${para(escapeHtml(o.paymentInstructions))}
    ${button('View my package', appUrl('/login'), '#1598E9')}
    ${small('Already paid? Thank you, no action is needed. It can take a little while for the Suwela team to record a payment.')}`);
  const text = `Hi ${o.name},\n\n${o.isOrganization ? `${o.accountName}'s` : 'Your'} ${o.planName} package (${o.price} / month) expires ${when}, on ${o.expiresOn}.\n\nHow to renew: ${o.paymentInstructions}\n\nSign in: ${appUrl('/login')}`;
  return { subject, html, text };
};

const packageExpiredEmail = (o: Omit<PackageFacts, 'daysLeft'>) => {
  const subject = 'Your Suwela package has expired';
  const whose = o.isOrganization ? `<strong>${escapeHtml(o.accountName)}</strong>&#39;s` : 'Your';
  const html = layout(subject, `
    ${greeting(o.name)}
    ${para(`${whose} <strong>${escapeHtml(o.planName)}</strong> package expired on <strong>${escapeHtml(o.expiresOn)}</strong>. The dashboard is locked until the payment is recorded. Your data is safe and nothing has been deleted.`)}
    ${factBox([['Account', o.accountName], ['Package', o.planName], ['Amount due', o.price], ['Expired on', o.expiresOn]], 'danger')}
    ${heading('How to pay')}
    ${para(escapeHtml(o.paymentInstructions))}
    ${button('Sign in to see what is owed', appUrl('/login'), '#1598E9')}
    ${small('While the account is locked you can still sign in, view your package and read your notifications.')}`);
  const text = `Hi ${o.name},\n\n${o.isOrganization ? `${o.accountName}'s` : 'Your'} ${o.planName} package expired on ${o.expiresOn}. The dashboard is locked until the payment (${o.price}) is recorded.\n\nHow to pay: ${o.paymentInstructions}`;
  return { subject, html, text };
};

// To the system administrators: one account about to expire, or now locked.
const adminPackageAlertEmail = (o: {
  adminName: string; kind: 'expiring' | 'expired';
  accountName: string; accountType: string; contact: string | null;
  planName: string; price: string; expiresOn: string; daysLeft: number;
}) => {
  const subject = o.kind === 'expired'
    ? `[Suwela admin] ${o.accountName}: package expired, account locked`
    : `[Suwela admin] ${o.accountName}: package expires ${whenText(o.daysLeft)}`;
  const rows: [string, string][] = [
    ['Account', o.accountName],
    ['Type', o.accountType],
    ['Contact email', o.contact || '—'],
    ['Package', `${o.planName} (${o.price} / month)`],
    [o.kind === 'expired' ? 'Expired on' : 'Expires on', o.expiresOn],
  ];
  if (o.kind === 'expiring') rows.push(['Days left', String(o.daysLeft)]);
  const html = layout(subject, `
    ${greeting(o.adminName)}
    ${para(o.kind === 'expired'
      ? `<strong>${escapeHtml(o.accountName)}</strong> did not renew. Its package has expired and the account is now <strong>locked</strong> until a payment is recorded.`
      : `<strong>${escapeHtml(o.accountName)}</strong>&#39;s package is about to expire. The account holder has also been reminded by email.`)}
    ${factBox(rows, o.kind === 'expired' ? 'danger' : 'warning')}
    ${para('When the payment arrives, record it in the admin dashboard under <strong>Billing</strong> and the account opens again straight away.')}
    ${button('Open the admin dashboard', appUrl('/login'), '#0E2C52')}`);
  const text = `${o.accountName} (${o.accountType}, ${o.contact || 'no email'}): ${o.planName}, ${o.price} / month, ${o.kind === 'expired' ? `expired on ${o.expiresOn}; the account is locked.` : `expires on ${o.expiresOn} (${o.daysLeft} days left).`}\nRecord payments in the admin dashboard → Billing.`;
  return { subject, html, text };
};

export {
  verificationCodeEmail, passwordResetEmail, welcomeEmail, accountApprovedEmail, passwordChangedEmail,
  packageReminderEmail, packageExpiredEmail, adminPackageAlertEmail, escapeHtml,
};
