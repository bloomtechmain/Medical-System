import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import AuthShell from '../components/landing/AuthShell';
import { authApi } from '../services/api';

// Account recovery, step 2: the page the emailed link opens.
const MIN_LENGTH = 10;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < MIN_LENGTH) { setError(`Your password must be at least ${MIN_LENGTH} characters.`); return; }
    if (newPassword !== confirmPassword) { setError('The two passwords do not match.'); return; }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      toast.success('Password reset. Please sign in with your new password.', { duration: 6000 });
      navigate('/login');
    } catch (err: any) {
      if (/invalid|expired/i.test(err?.message || '')) setExpired(true);
      else setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const badLink = !token || expired;
  const strength = newPassword.length === 0 ? 0 : newPassword.length < MIN_LENGTH ? 1 : newPassword.length < 14 ? 2 : 3;

  return (
    <AuthShell
      title={<>Choose a new <em className="text-suwela-mint">password.</em></>}
      text="Almost done. Pick a password you have not used before. You will be signed out everywhere, and we will email you to confirm the change.">
      <div className="w-full max-w-md">
        <div className="sw-rise bg-white rounded-[32px] shadow-[0_24px_60px_-34px_rgba(14,44,82,0.5)] p-7 sm:p-9">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4"
                style={{ backgroundImage: 'linear-gradient(135deg, #1598E9, #13A58F)' }}>
            <LockKeyhole className="w-6 h-6" />
          </span>

          {badLink ? (
            <>
              <h1 className="font-display text-3xl text-suwela-navy">Link expired</h1>
              <p className="text-suwela-slate mt-2 text-sm leading-relaxed">
                This reset link is invalid, has already been used, or is more than 1 hour old. Request a new one; it only takes a moment.
              </p>
              <Link to="/forgot-password" className="btn-primary w-full py-3 rounded-full text-base mt-6 inline-flex items-center justify-center"
                    style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                Request a new link
              </Link>
              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-5">&larr; Back to sign in</Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl text-suwela-navy">Reset password</h1>
              <p className="text-suwela-slate mt-2 mb-6 text-sm">Choose a new password for your Suwela account.</p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="new-password">New password</label>
                  <div className="relative">
                    <input id="new-password" type={show ? 'text' : 'password'} required autoComplete="new-password" className="input pr-10"
                           placeholder={`At least ${MIN_LENGTH} characters`} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                            className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1.5" aria-hidden="true">
                    {[1, 2, 3].map(i => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${strength >= i ? (strength === 1 ? 'bg-amber-400' : 'bg-teal-500') : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {strength === 1 ? `${MIN_LENGTH - newPassword.length} more characters needed` : strength >= 2 ? 'Good length. A short phrase is easiest to remember.' : `At least ${MIN_LENGTH} characters`}
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="confirm-password">Confirm new password</label>
                  <input id="confirm-password" type={show ? 'text' : 'password'} required autoComplete="new-password" className="input"
                         value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
                <button type="submit" className="btn-primary w-full py-3 rounded-full text-base" disabled={loading}
                        style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                  {loading ? 'Resetting...' : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
