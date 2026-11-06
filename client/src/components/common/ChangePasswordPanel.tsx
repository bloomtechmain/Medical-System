import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound, LifeBuoy, Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react';
import { authApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Password & account recovery, on every dashboard's settings page.
//
// Left: change the password (needs the current one). Changing it revokes
// every refresh token server-side, so this signs the user out everywhere,
// including here. Right: the recovery path for someone who no longer knows
// their current password (or signed up with Google and never had one): a
// one-hour, single-use reset link sent to the account's own email address,
// plus the same steps written out for when they are locked out entirely.
const MIN_LENGTH = 10;

function PasswordInput({ label, value, onChange, placeholder, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} className="input pr-10" value={value} placeholder={placeholder}
               autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordPanel() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [linkSent, setLinkSent] = useState(false);

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password changed. Please sign in again.');
      logout(); // goes to the sign-in page itself
    },
    onError: (err: any) => toast.error(err.message || 'Failed to change password'),
  });

  const sendLink = useMutation({
    mutationFn: () => authApi.forgotPassword(user!.email),
    onSuccess: () => setLinkSent(true),
    onError: () => toast.error('Could not send the reset link just now. Please try again in a minute.'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_LENGTH) { toast.error(`New password must be at least ${MIN_LENGTH} characters`); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    if (newPassword === currentPassword) { toast.error('Choose a password different from your current one'); return; }
    change.mutate();
  };

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-3xl mt-6 overflow-hidden" aria-labelledby="pw-recovery-title">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[#1598E9] to-[#13A58F]">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h3 id="pw-recovery-title" className="text-sm font-bold text-gray-800">Password &amp; account recovery</h3>
          <p className="text-xs text-gray-500">Change your password, or get back in if you have forgotten it.</p>
        </div>
      </header>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Change password */}
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <KeyRound size={14} /> Change password
          </h4>
          <PasswordInput label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordInput label="New password" value={newPassword} onChange={setNewPassword} placeholder={`At least ${MIN_LENGTH} characters`} autoComplete="new-password" />
          {tooShort && <p className="text-xs text-amber-600 -mt-2">{MIN_LENGTH - newPassword.length} more characters needed.</p>}
          <PasswordInput label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          {mismatch && <p className="text-xs text-red-600 -mt-2">The passwords do not match.</p>}
          <button type="submit" className="btn-primary px-4 py-2" disabled={change.isPending || !currentPassword || !newPassword || !confirmPassword}>
            {change.isPending ? 'Changing...' : 'Change password'}
          </button>
          <p className="text-xs text-gray-400">You will be signed out on every device and asked to sign in with the new password.</p>
        </form>

        {/* Recovery */}
        <div className="p-6 bg-gray-50/60">
          <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            <LifeBuoy size={14} /> Forgot your password?
          </h4>
          <ol className="space-y-2.5 text-sm text-gray-600 mb-5">
            {[
              <>We email a secure reset link to <span className="font-semibold text-gray-800 break-all">{user?.email}</span>.</>,
              <>Open the email (check spam too) and choose <span className="font-semibold">Reset password</span>. The link works once, for 1 hour.</>,
              <>Pick a new password. Every device is signed out and we email you to confirm the change.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          {linkSent ? (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-800">
              <MailCheck size={16} className="flex-none mt-0.5" />
              Reset link sent. Check your inbox; only the newest link works.
            </p>
          ) : (
            <button type="button" onClick={() => sendLink.mutate()} disabled={!user?.email || sendLink.isPending}
                    className="btn-secondary w-full py-2.5">
              {sendLink.isPending ? 'Sending...' : 'Email me a reset link'}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            Signed out and can&apos;t get in? Choose <span className="font-semibold">Forgot password</span> on the sign-in page and enter this email address.
          </p>
        </div>
      </div>
    </section>
  );
}
