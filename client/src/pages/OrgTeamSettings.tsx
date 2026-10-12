import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { UserPlus, X, Shield, Mail } from 'lucide-react';
import { orgTeamApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/common/PageHeader';

function InviteMemberModal({ orgId, onClose }: { orgId: number; onClose: () => void }) {
  const { t } = useTranslation('orgTeam');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', is_owner: false });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => orgTeamApi.invite(orgId, form),
    onSuccess: () => {
      toast.success(t('toastInvited'));
      qc.invalidateQueries({ queryKey: ['org-team', orgId] });
      onClose();
    },
    onError: (err: any) => setError(err.message || t('toastInviteFailed')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setError(t('errors.formInvalid')); return;
    }
    setError('');
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900">{t('inviteModal.title')}</p>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><X size={14} strokeWidth={2.5} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2">{error}</p>}
          <div>
            <label className="label">{tc('fields.name')}</label>
            <input className="input" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{tc('fields.email')}</label>
            <input type="email" className="input" value={form.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('inviteModal.passwordLabel')}</label>
            <input type="password" className="input" placeholder={t('inviteModal.passwordPlaceholder') as string}
              value={form.password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_owner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, is_owner: e.target.checked }))} />
            {t('inviteModal.makeOwner')}
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">{tc('actions.cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-2xl disabled:opacity-50">
              {mutation.isPending ? tc('actions.saving') : t('inviteModal.submitBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrgTeamSettings() {
  const { t } = useTranslation('orgTeam');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const orgId = user?.organization?.id;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-team', orgId],
    queryFn:  () => orgTeamApi.getMembers(orgId as number),
    enabled:  !!orgId,
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => orgTeamApi.remove(orgId as number, userId),
    onSuccess: () => { toast.success(t('toastRemoved')); qc.invalidateQueries({ queryKey: ['org-team', orgId] }); },
    onError:   (err: any) => toast.error(err.message || t('toastRemoveFailed')),
  });

  if (!orgId) {
    return (
      <div>
        <PageHeader title={t('title')} description={t('subtitle')} />
        <p className="text-sm text-gray-400">{t('notOwner')}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        action={
          <button onClick={() => setInviting(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl shadow-sm hover:opacity-90">
            <UserPlus size={15} strokeWidth={2.5} /> {t('inviteBtn')}
          </button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-gray-400 mt-6">{tc('actions.loading')}</div>
      ) : (members as any[]).length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center mt-6">
          <p className="text-gray-600 font-medium">{t('emptyTitle')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 mt-6">
          {(members as any[]).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {m.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900 truncate">{m.name}</p>
                    {m.member_role === 'owner' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Shield size={9} /> {t('ownerBadge')}
                      </span>
                    )}
                    {!m.is_active && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t('inactiveBadge')}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Mail size={10} />{m.email}</p>
                </div>
              </div>
              {m.user_id !== user?.id && (
                <button
                  onClick={() => { if (window.confirm(t('removeConfirm', { name: m.name }))) removeMutation.mutate(m.user_id); }}
                  disabled={removeMutation.isPending}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {t('removeBtn')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {inviting && <InviteMemberModal orgId={orgId} onClose={() => setInviting(false)} />}
    </div>
  );
}
