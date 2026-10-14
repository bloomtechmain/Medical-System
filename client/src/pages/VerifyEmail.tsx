import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/api';

// PRO-11: the landing page for the confirmation link emailed at registration.
type State = { status: 'working' | 'ok' | 'failed'; message: string };

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ status: 'working', message: '' });
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);
  // React 18 StrictMode runs effects twice in development. The token is
  // single-use, so without this guard the second call reports "invalid or
  // expired" over a verification that actually succeeded.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token) {
      setState({ status: 'failed', message: 'This link is missing its verification token.' });
      return;
    }
    if (attempted.current) return;
    attempted.current = true;

    authApi.verifyEmail(token)
      .then((res: { message?: string }) =>
        setState({ status: 'ok', message: res?.message || 'Email confirmed. You can now log in.' }))
      .catch((err: { message?: string }) =>
        setState({
          status: 'failed',
          message: err?.message || 'This verification link is invalid or has expired.',
        }));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Confirm your email</h1>

        {state.status === 'working' && (
          <p className="mt-4 text-sm text-gray-600">Confirming your email address…</p>
        )}

        {state.status === 'ok' && (
          <>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.message}</p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to login
            </Link>
          </>
        )}

        {state.status === 'failed' && (
          <>
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>

            {/* A dead end here means an account nobody can get into, so always
                offer a new link rather than only a "contact support" line. */}
            <div className="mt-6 border-t border-gray-100 pt-5">
              <label className="block text-sm font-medium text-gray-700">
                Send a new confirmation link
              </label>
              <input
                type="email"
                className="input mt-2"
                placeholder="you@example.com"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
              />
              <button
                type="button"
                disabled={!resendEmail || resent}
                onClick={() => { void authApi.resendVerification(resendEmail).finally(() => setResent(true)); }}
                className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {resent ? 'Link sent — check your inbox' : 'Send new link'}
              </button>
              {/* Deliberately the same message whether or not the address
                  exists: this endpoint needs no login, so a distinguishing
                  response would confirm which emails have accounts. */}
              {resent && (
                <p className="mt-2 text-xs text-gray-500">
                  If that address needs confirming, a new link is on its way.
                </p>
              )}
            </div>

            <Link to="/login" className="mt-5 inline-block text-sm text-blue-600 hover:underline">
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
