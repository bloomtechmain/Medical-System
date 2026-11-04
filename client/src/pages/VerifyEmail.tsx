import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/landing/AuthShell';
import EmailCodeForm, { VerifyResult } from '../components/auth/EmailCodeForm';

// Migration 017: where the "open the verification screen" link in the code
// email lands — for someone who closed the registration tab before typing the
// code in. ?email= pre-fills the address; without it, they type it first.
const VerifyEmail = () => {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email')?.trim() || '');
  const [confirmed, setConfirmed] = useState(!!params.get('email'));
  const [done, setDone] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onVerified = (res: VerifyResult) => {
    if (res.token && res.user?.role) {
      login(res.user, res.token, res.refreshToken);
      toast.success('Email verified — welcome to Suwela!');
      navigate('/', { replace: true });
      return;
    }
    setDone(res.message || 'Email verified. You can now sign in.');
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    if (email.includes('@')) setConfirmed(true);
  };

  return (
    <AuthShell
      title={<>Verify your <em className="text-suwela-mint">email.</em></>}
      text="Enter the 6-digit code we emailed you to finish setting up your Suwela account.">
      <div className="w-full max-w-md">
        <div className="sw-rise bg-white rounded-[32px] shadow-[0_24px_60px_-34px_rgba(14,44,82,0.5)] p-7 sm:p-9">
          {done ? (
            <>
              <h1 className="font-display text-3xl text-suwela-navy">Email verified</h1>
              <p className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{done}</p>
              <Link to="/login" className="btn-primary w-full py-3 rounded-full text-base mt-6 inline-flex items-center justify-center"
                    style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                Go to sign in
              </Link>
            </>
          ) : confirmed ? (
            <EmailCodeForm
              email={email}
              initialCodeSent={!!params.get('email')}
              onVerified={onVerified}
              onBack={() => setConfirmed(false)}
              backLabel="Use a different email"
            />
          ) : (
            <form onSubmit={onEmail}>
              <h1 className="font-display text-3xl text-suwela-navy">Verify your email</h1>
              <p className="text-suwela-slate mt-2 mb-5 text-sm">Which email address did you register with?</p>
              <label className="label">Email address</label>
              <input type="email" required className="input" placeholder="you@example.com"
                     value={email} onChange={e => setEmail(e.target.value)} />
              <button type="submit" className="btn-primary w-full mt-5 py-3 rounded-full text-base"
                      style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}>
                Continue
              </button>
              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-5">&larr; Back to sign in</Link>
            </form>
          )}
        </div>
      </div>
    </AuthShell>
  );
};

export default VerifyEmail;
