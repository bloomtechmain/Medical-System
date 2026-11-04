import { useEffect, useRef, useState, ClipboardEvent, KeyboardEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { authApi } from '../../services/api';

// Migration 017: the screen that finishes a registration (or unlocks an
// unverified sign-in). Six single-digit boxes, paste-friendly, with a resend
// button on a cooldown so a person cannot hammer the mail server.
export interface VerifyResult {
  verified?: boolean;
  awaitingApproval?: boolean;
  message?: string;
  user?: any;
  token?: string;
  refreshToken?: string;
}

interface Props {
  email: string;
  /** False when the server could not send the first code — show resend at once. */
  initialCodeSent?: boolean;
  /** Ask the server for a code as soon as this mounts (sign-in of an unverified account). */
  sendOnMount?: boolean;
  onVerified: (res: VerifyResult) => void;
  onBack?: () => void;
  backLabel?: string;
}

const RESEND_SECONDS = 60;
const LENGTH = 6;

export default function EmailCodeForm({ email, initialCodeSent = true, sendOnMount = false, onVerified, onBack, backLabel = 'Back' }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(initialCodeSent ? null : 'We could not send the code. Press "Send a new code".');
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(initialCodeSent && !sendOnMount ? RESEND_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const sentOnMount = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      await authApi.resendVerification(email);
      setNotice(`A new code is on its way to ${email}. Only the newest code works.`);
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } catch {
      // A fixed message, never the server's: the endpoint answers the same
      // whether or not the address exists, and its failures must not differ
      // either (account enumeration).
      setError('Could not send a new code just now. Please wait a minute and try again.');
    } finally {
      setSending(false);
      setCooldown(RESEND_SECONDS);
    }
  };

  useEffect(() => {
    // StrictMode runs effects twice in development; send once.
    if (sendOnMount && !sentOnMount.current) {
      sentOnMount.current = true;
      void resend();
    }
    inputs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (code: string) => {
    if (code.length !== LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await authApi.verifyEmail(email, code) as VerifyResult;
      onVerified(res);
    } catch (err: any) {
      setError(err?.message || 'That code is not correct.');
      if (err?.codeExpired) setCooldown(0);
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const setAt = (i: number, value: string) => {
    const v = value.replace(/\D/g, '');
    if (!v) {
      setDigits(d => d.map((x, j) => (j === i ? '' : x)));
      return;
    }
    // Typing (or autofill of the whole code) into one box spreads across the rest.
    const next = [...digits];
    v.slice(0, LENGTH - i).split('').forEach((ch, k) => { next[i + k] = ch; });
    setDigits(next);
    const last = Math.min(i + v.length, LENGTH - 1);
    inputs.current[last]?.focus();
    if (next.every(Boolean)) void submit(next.join(''));
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!text) return;
    e.preventDefault();
    setAt(0, text);
  };

  const code = digits.join('');

  return (
    <div>
      <div className="mb-6">
        <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4"
              style={{ backgroundImage: 'linear-gradient(135deg, #1598E9, #13A58F)' }}>
          <MailCheck className="w-6 h-6" />
        </span>
        <h1 className="font-display text-3xl text-suwela-navy">Check your email</h1>
        <p className="text-suwela-slate mt-2 text-sm leading-relaxed">
          We sent a 6-digit code to <span className="font-semibold text-gray-900 break-all">{email}</span>.
          Enter it below to verify your email. The code expires in 15 minutes.
        </p>
      </div>

      <form onSubmit={e => { e.preventDefault(); void submit(code); }}>
        <div className="flex justify-between gap-2" aria-label="Verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              value={d}
              onChange={e => setAt(i, e.target.value)}
              onKeyDown={e => onKeyDown(i, e)}
              onPaste={onPaste}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={LENGTH}
              aria-label={`Digit ${i + 1}`}
              disabled={verifying}
              className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl border border-gray-300 text-center text-2xl font-bold text-suwela-navy focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50"
            />
          ))}
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
        {notice && !error && <p className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-800">{notice}</p>}

        <button type="submit" disabled={code.length !== LENGTH || verifying}
                className="btn-primary w-full mt-5 py-3 rounded-full text-base disabled:opacity-60"
                style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
          {verifying ? 'Verifying...' : 'Verify email'}
        </button>
      </form>

      <div className="mt-5 text-center text-sm text-gray-500">
        Didn't get it? Check your spam folder, or{' '}
        <button type="button" onClick={resend} disabled={cooldown > 0 || sending}
                className="font-semibold text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed">
          {sending ? 'sending…' : cooldown > 0 ? `send a new code in ${cooldown}s` : 'send a new code'}
        </button>
      </div>

      {onBack && (
        <button type="button" onClick={onBack} className="w-full text-sm text-gray-500 hover:text-gray-700 text-center mt-5">
          &larr; {backLabel}
        </button>
      )}
    </div>
  );
}
