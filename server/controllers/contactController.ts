import { Request, Response, NextFunction } from 'express';
import { sendMail } from '../config/mailer';
import { logger } from '../config/logger';

// Every public website form (Help contact, Share your story, newsletter
// sign-up) lands in one inbox. CONTACT_INBOX overrides it per environment.
const inbox = (): string => process.env.CONTACT_INBOX || 'help@suwale.com';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Subject lines can't carry newlines (header injection) — collapse them.
const oneLine = (v: unknown): string => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

const table = (rows: [string, unknown][]): string =>
  `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(k)}</b></td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join('')}</table>`;

const deliver = async (res: Response, next: NextFunction, subject: string, html: string, replyTo?: string): Promise<void> => {
  try {
    await sendMail(inbox(), subject, html, { replyTo });
    res.json({ message: 'Sent' });
  } catch (err) {
    logger.error({ err, subject }, 'contact form email failed');
    next(err);
  }
};

const support = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name, email, subject, message } = req.body;
  await deliver(res, next,
    `[Help] ${oneLine(subject)} — ${oneLine(name)}`,
    table([['Form', 'Help — contact us'], ['Name', name], ['Email', email], ['Topic', subject], ['Message', message]]),
    email);
};

const story = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { name, email, role, city, title, story: text, rating, anonymous } = req.body;
  await deliver(res, next,
    `[Story] ${oneLine(title)} — ${oneLine(name)}`,
    table([
      ['Form', 'Share your story'], ['Name', name], ['Email', email], ['Role', role], ['City', city || '—'],
      ['Rating', rating ? `${rating} / 5` : '—'], ['Publish anonymously', anonymous ? 'Yes' : 'No'],
      ['Consent to publish', 'Yes'], ['Title', title], ['Story', text],
    ]),
    email);
};

const subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email } = req.body;
  await deliver(res, next,
    `[Newsletter] New subscriber — ${oneLine(email)}`,
    table([['Form', 'News — newsletter sign-up'], ['Email', email]]),
    email);
};

export { support, story, subscribe };
