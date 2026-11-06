import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import AuthShell from '../components/landing/AuthShell';
import { authApi } from '../services/api';

// Account recovery, step 1: ask for the address and email a reset link.
// The server answers the same whether or not the address has an account, so
// this page does too (no account enumeration).
const RECOVERY_STEPS = [
  'Enter the email address you registered with.',
  'Open the email from Suwela and choose "Reset password". The link works once, for 1 hour.',
  'Choose a new password. Every device is signed out and we email you to confirm the change.',
];

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch {
      setError('We could not send the link just now. Please wait a minute and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={<>Get back into <em className="text-suwela-mint">your account.</em></>}
      text="Forgotten your password? We will email you a secure link to choose a new one. Works for every Suwela account: patients, doctors, pharmacies, laboratories and organisations.">
      <div className="w-full max-w-md">
        <div className="sw-rise bg-white rounded-[32px] shadow-[0_24px_60px_-34px_rgba(14,44,82,0.5)] p-7 sm:p-9">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4"
                style={{ backgroundImage: 'linear-gradient(135deg, #1598E9, #13A58F)' }}>
            {sent ? <MailCheck className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </span>

          {sent ? (
            <>
              <h1 className="font-display text-3xl text-suwela-navy">Check your email</h1>
              <p className="text-suwela-slate mt-2 text-sm leading-relaxed">
                If <span className="font-semibold text-gray-900 break-all">{email.trim()}</span> belongs to a Suwela account,
                a password reset link is on its way. It expires in 1 hour.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-gray-600 list-disc pl-5">
                <li>Not there after a few minutes? Check your spam or promotions folder.</li>
                <li>Only the newest link works. Requesting another cancels the earlier ones.</li>
              </ul>
              <button type="button" onClick={() => setSent(false)}
                      className="btn-secondary w-full mt-6 py-3 rounded-full text-base">
                Send another link
              </button>
              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-5">&larr; Back to sign in</Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl text-suwela-navy">Forgot password</h1>
              <p className="text-suwela-slate mt-2 mb-5 text-sm">Recover your account in three steps:</p>
              <ol className="space-y-2.5 mb-6">
                {RECOVERY_STEPS.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-600">
                    <span className="flex-none w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="recover-email">Email address</label>
                  <input id="recover-email" type="email" required autoComplete="email" className="input" placeholder="you@example.com"
                         value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
                <button type="submit" className="btn-primary w-full py-3 rounded-full text-base" disabled={loading}
                        style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-5 leading-relaxed">
                Signed up with Google? You can sign in with Google any time, or use this page to set a password as well.
              </p>
              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-5">&larr; Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
