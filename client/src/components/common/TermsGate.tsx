import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api';
import { LEGAL_VERSION } from '../../legal';

// COMP-02: migration 008 records which Terms/Privacy version each person
// accepted at sign-up, and deliberately left existing users NULL — they
// agreed to documents that did not exist. This is what closes that gap, and
// what handles anyone left on a superseded version after a policy change.
//
// Blocking rather than a dismissible banner, on purpose: the record of
// acceptance is the point, and a banner people scroll past produces a column
// full of NULLs that looks like consent was never sought. It appears over the
// app rather than replacing it, so nothing is lost if someone reloads.
const TermsGate = () => {
  const [needed, setNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Read from the server, not from the cached user in localStorage — that
    // copy predates the policy change in exactly the case this exists for.
    authApi.me()
      .then((me: { accepted_terms_version?: string | null }) => {
        if (!cancelled) setNeeded(me?.accepted_terms_version !== LEGAL_VERSION);
      })
      // A failure here must not block the app. The prompt will appear on the
      // next load; being unable to reach /auth/me is its own problem and the
      // interceptor already handles a 401.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      await authApi.acceptTerms(LEGAL_VERSION);
      setNeeded(false);
    } catch (err) {
      setError((err as { message?: string })?.message || 'Could not record your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 id="terms-gate-title" className="text-lg font-semibold text-gray-900">
          Please review our Terms and Privacy Policy
        </h2>

        <p className="mt-3 text-sm text-gray-600">
          We have published our Terms of Service and Privacy Policy (version{' '}
          {LEGAL_VERSION}). Because this service holds health data, we keep a
          record of which version each person has agreed to. Please read them
          and confirm to continue.
        </p>

        <div className="mt-4 flex gap-4 text-sm">
          <Link to="/terms" target="_blank" className="text-blue-600 underline hover:text-blue-700">
            Read the Terms of Service
          </Link>
          <Link to="/privacy" target="_blank" className="text-blue-600 underline hover:text-blue-700">
            Read the Privacy Policy
          </Link>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void accept()}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'I have read and agree'}
        </button>

        <p className="mt-3 text-center text-xs text-gray-400">
          Agreeing records the version and the time, against your account.
        </p>
      </div>
    </div>
  );
};

export default TermsGate;
