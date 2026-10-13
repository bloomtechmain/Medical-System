import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// SEC-17 (auth): self-service "change my own password" — the audit flagged
// that only an admin could change someone else's password; there was no
// way for a user to change their own. Changing the password revokes every
// refresh token server-side (see authController.changePassword), so this
// logs the user out everywhere, including here — same as GitHub/Google.
export default function ChangePasswordPanel() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password changed. Please log in again.');
      logout();
      window.location.href = '/login';
    },
    onError: (err: any) => toast.error(err.message || 'Failed to change password'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10) { toast.error('New password must be at least 10 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    mutation.mutate();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-3xl mt-6">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Change Password</h3>
      <form onSubmit={onSubmit} className="space-y-4 max-w-xs">
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" placeholder="Min. 10 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary px-4 py-2" disabled={mutation.isPending || !currentPassword || !newPassword}>
          {mutation.isPending ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
