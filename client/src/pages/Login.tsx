import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import AuthShell from '../components/landing/AuthShell';
import RegistrationProgress, { Certification } from '../components/registration/RegistrationProgress';
import EmailCodeForm, { VerifyResult } from '../components/auth/EmailCodeForm';
import GoogleSignInButton, { OrDivider } from '../components/auth/GoogleSignInButton';
import { LEGAL_VERSION } from '../legal';
import { GOOGLE_CLIENT_ID } from '../env';

interface LoginFormData {
  email: string;
  password: string;
}

export default function Login() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>();
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  // PRO-11: the address whose login was refused for being unverified. The
  // server answers that case with emailUnverified:true precisely so this page
  // can offer a way out — without it the user is told to check an inbox that
  // may have nothing in it, and has no action available anywhere in the UI.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  // Migration 012 split "waiting for approval" from "deactivated". They need
  // different screens: one is a wait with nothing to do, the other is a dead
  // end that needs support. Neither should offer the resend button — the
  // account cannot verify until it is approved.
  const [blocked, setBlocked] = useState<{ kind: 'approval' | 'deactivated'; message: string; certifications?: Certification[] } | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // '/' always renders <RoleHome>, now the single place that knows both
  // which dashboard a role/org-context combination resolves to AND, under
  // the three-subdomain split, which zone that dashboard actually lives on
  // (src/utils/zones.ts) — so login no longer needs its own copy of the
  // role-to-path table, which only ever pointed at a role's default
  // dashboard and ignored organisation ownership (see App.tsx RoleHome).
  const goToRoleHome = (_user: User) => navigate('/', { replace: true });

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const res = await authApi.login(data) as unknown as { user: User; token: string; refreshToken: string; mfaRequired?: boolean; mfaToken?: string };
      if (res.mfaRequired && res.mfaToken) {
        setMfaToken(res.mfaToken);
        return;
      }
      if (!res?.user?.role) throw new Error('Invalid response from server');
      login(res.user, res.token, res.refreshToken);
      goToRoleHome(res.user);
    } catch (err: any) {
      // A 403 carrying emailUnverified is not a failed login in the usual
      // sense — the password was right. Surface it as an actionable panel
      // rather than a toast that disappears.
      if (err?.emailUnverified) {
        setUnverifiedEmail(data.email);
        return;
      }
      if (err?.awaitingApproval) {
        setBlocked({ kind: 'approval', message: err.message, certifications: err.registrationProgress?.certifications ?? [] });
        return;
      }
      if (err?.accountDeactivated) {
        setBlocked({ kind: 'deactivated', message: err.message });
        return;
      }
      toast.error(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Migration 017: the code screen shown after a refused unverified sign-in.
  const onEmailVerified = (res: VerifyResult) => {
    setUnverifiedEmail(null);
    if (res.token && res.user?.role) {
      login(res.user, res.token, res.refreshToken);
      toast.success('Email verified — welcome!');
      goToRoleHome(res.user);
      return;
    }
    if (res.awaitingApproval) {
      setBlocked({ kind: 'approval', message: res.message || 'Your registration is waiting for approval.', certifications: [] });
      return;
    }
    toast.success(res.message || 'Email verified. Please sign in.');
  };

  // Google sign-in — patients only (the server refuses everyone else with a
  // message telling them to use their password).
  const onGoogleCredential = async (credential: string) => {
    setLoading(true);
    try {
      const res = await authApi.googleAuth(credential, LEGAL_VERSION) as { user: User; token: string; refreshToken: string; mfaRequired?: boolean; mfaToken?: string; created?: boolean };
      if (res.mfaRequired && res.mfaToken) { setMfaToken(res.mfaToken); return; }
      if (!res?.user?.role) throw new Error('Invalid response from server');
      login(res.user, res.token, res.refreshToken);
      if (res.created) toast.success('Your patient account has been created. Welcome to Suwela!');
      goToRoleHome(res.user);
    } catch (err: any) {
      if (err?.accountDeactivated) { setBlocked({ kind: 'deactivated', message: err.message }); return; }
      toast.error(err?.message || 'Google sign-in failed. Please try again.', { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  const onSubmitMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setLoading(true);
    try {
      const res = await authApi.mfaLogin({ mfaToken, code: mfaCode }) as unknown as { user: User; token: string; refreshToken: string };
      if (!res?.user?.role) throw new Error('Invalid response from server');
      login(res.user, res.token, res.refreshToken);
      goToRoleHome(res.user);
    } catch (err: any) {
      toast.error(err.message || 'Invalid authentication code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={<>Your health, <em className="text-suwela-mint">one sign-in away.</em></>}
      text="Patients, doctors, pharmacies, laboratories, hospitals and clinics all sign in here — Suwela opens the right dashboard for you.">
        <div className="w-full max-w-md">
          <div className="sw-rise bg-white rounded-[32px] shadow-[0_24px_60px_-34px_rgba(14,44,82,0.5)] p-7 sm:p-9">
            {blocked ? (
              <>
                <div className="mb-6">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                    blocked.kind === 'approval' ? 'bg-blue-100' : 'bg-red-100'}`}>
                    {blocked.kind === 'approval' ? (
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {blocked.kind === 'approval' ? 'Waiting for approval' : 'Account deactivated'}
                  </h1>
                </div>

                <div className={`rounded-xl px-4 py-3 text-sm ${
                  blocked.kind === 'approval'
                    ? 'border border-blue-200 bg-blue-50 text-blue-900'
                    : 'border border-red-200 bg-red-50 text-red-900'}`}>
                  {blocked.message}
                </div>

                {blocked.kind === 'approval' && (
                  /* Deliberately no resend button: the confirmation link is
                     sent when an admin approves, so there is nothing to
                     resend yet and offering it would imply otherwise. */
                  <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                    <RegistrationProgress certifications={blocked.certifications ?? []} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setBlocked(null)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 text-center mt-5"
                >
                  &larr; Back to sign in
                </button>
              </>
            ) : unverifiedEmail ? (
              /* PRO-11 / migration 017: the password was right but the
                 address is unconfirmed. A fresh code is sent as this opens,
                 so there is always something in the inbox to type in. */
              <EmailCodeForm
                email={unverifiedEmail}
                sendOnMount
                onVerified={onEmailVerified}
                onBack={() => setUnverifiedEmail(null)}
                backLabel="Back to sign in"
              />
            ) : mfaToken ? (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Two-factor authentication</h1>
                  <p className="text-gray-500 text-sm mt-1">Enter the 6-digit code from your authenticator app</p>
                </div>
                <form onSubmit={onSubmitMfa} className="space-y-4">
                  <div>
                    <label className="label">Authentication code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      maxLength={6}
                      className="input text-center text-lg tracking-widest"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full mt-2 py-2.5" disabled={loading || mfaCode.length !== 6}>
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMfaToken(null); setMfaCode(''); }}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 text-center"
                  >
                    ← Back to sign in
                  </button>
                </form>
              </>
            ) : (
            <>
            <div className="mb-6">
              <h1 className="font-display text-4xl text-suwela-navy">Welcome back</h1>
              <p className="text-suwela-slate mt-2">Sign in to your Suwela account</p>
            </div>

            <GoogleSignInButton onCredential={onGoogleCredential} text="signin_with" />
            <OrDivider label="or sign in with email" />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  {...register('email', { required: 'Email is required' })}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Password</label>
                  <Link to="/forgot-password" className="text-xs text-primary-600 font-medium hover:text-primary-700">Forgot password?</Link>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="••••••••"
                    {...register('password', { required: 'Password is required' })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                className="btn-primary w-full mt-2 py-3 rounded-full text-base"
                style={{ backgroundImage: 'linear-gradient(90deg, #1598E9, #13A58F)' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            {GOOGLE_CLIENT_ID && <GoogleNote />}

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 font-medium hover:text-primary-700">
                Create account
              </Link>
            </p>
            <p className="text-center text-sm text-gray-500 mt-2">
              Registering an organization?{' '}
              <Link to="/org-register" className="text-primary-600 font-medium hover:text-primary-700">
                Register here
              </Link>
            </p>
            </>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Suwela Medical Hub · Built by BloomTech
          </p>
        </div>
    </AuthShell>
  );
}

// Shown only when Google sign-in is configured (the button itself hides
// otherwise). Patients-only is a rule people should learn before they press
// the button, not from an error after it.
function GoogleNote() {
  return (
    <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed" data-google-note>
      Google sign-in is for patients. New patients signing in with Google agree to Suwela's{' '}
      <Link to="/terms" target="_blank" className="underline hover:text-gray-600">Terms</Link> and{' '}
      <Link to="/privacy" target="_blank" className="underline hover:text-gray-600">Privacy Policy</Link>.
    </p>
  );
}
