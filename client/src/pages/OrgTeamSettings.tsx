import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { UserPlus, X, Shield, Mail, Hourglass, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { orgTeamApi, orgMembershipRequestApi } from '../services/api';
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
    if (!form.name.trim() || !form.email.trim() || form.password.length < 10) {
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

// Requirement 1: "hospital can remove doctor anytime but if the hospital
// want to remove doctor it should be accept by the doctor". Join requests
// from doctors land here too, with whatever hours they proposed — accepting
// creates the membership AND applies those hours in one step.
function ChannelingRequests({ orgId }: { orgId: number }) {
  const { t } = useTranslation('orgTeam');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const DAYS = tc('calendar.days', { returnObjects: true }) as string[];

  const { data: requests = [] } = useQuery({
    queryKey: ['org-membership-requests', orgId],
    queryFn:  () => orgMembershipRequestApi.forOrg(orgId),
  });
  const pending = (requests as any[]).filter(r => r.kind === 'join' && r.status === 'pending');

  const respondMutation = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'accept' | 'decline' }) => orgMembershipRequestApi.respond(id, decision),
    onSuccess: (_data, vars) => {
      toast.success(vars.decision === 'accept' ? t('channeling.toastAccepted') : t('channeling.toastDeclined'));
      qc.invalidateQueries({ queryKey: ['org-membership-requests', orgId] });
      qc.invalidateQueries({ queryKey: ['org-team', orgId] });
    },
    onError: (err: any) => toast.error(err.message || t('channeling.toastFailed')),
  });

  if (pending.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <p className="text-sm font-bold text-gray-900">{t('channeling.title')}</p>
      <p className="text-xs text-gray-400 mt-0.5">{t('channeling.subtitle')}</p>

      <div className="space-y-3 mt-4">
        {pending.map((r: any) => (
          <div key={r.id} className="rounded-xl border border-yellow-100 bg-yellow-50/60 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Hourglass size={13} strokeWidth={2} className="text-yellow-600 shrink-0" />
                  Dr. {r.doctor_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{r.doctor_email}</p>
                {r.doctor_specialization && (
                  <p className="text-xs text-gray-400 mt-0.5">{r.doctor_specialization}{r.doctor_license_number ? ` · ${r.doctor_license_number}` : ''}</p>
                )}
                {r.message && <p className="text-xs text-gray-600 italic mt-1.5">"{r.message}"</p>}
                {Array.isArray(r.proposed_schedule) && r.proposed_schedule.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <Clock size={12} strokeWidth={2} className="text-gray-400" />
                    {r.proposed_schedule.map((b: any, i: number) => (
                      <span key={i} className="text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                        {DAYS[b.day_of_week]} {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button disabled={respondMutation.isPending}
                  onClick={() => respondMutation.mutate({ id: r.id, decision: 'accept' })}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  <CheckCircle2 size={12} strokeWidth={2.5} /> {t('channeling.acceptBtn')}
                </button>
                <button disabled={respondMutation.isPending}
                  onClick={() => respondMutation.mutate({ id: r.id, decision: 'decline' })}
                  className="flex items-center gap-1 text-xs font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  <XCircle size={12} strokeWidth={2.5} /> {t('channeling.declineBtn')}
                </button>
              </div>
            </div>
          </div>
        ))}
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
    onSuccess: (data: any) => {
      toast.success(data?.pending ? t('removalRequestedToast') : t('toastRemoved'));
      qc.invalidateQueries({ queryKey: ['org-team', orgId] });
    },
    onError: (err: any) => toast.error(err.message || t('toastRemoveFailed')),
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

      <div className="mt-6">
        <ChannelingRequests orgId={orgId} />
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">{tc('actions.loading')}</div>
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
                  onClick={() => {
                    const confirmMsg = m.member_role === 'doctor' ? t('removeDoctorConfirm', { name: m.name }) : t('removeConfirm', { name: m.name });
                    if (window.confirm(confirmMsg)) removeMutation.mutate(m.user_id);
                  }}
                  disabled={removeMutation.isPending}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {m.member_role === 'doctor' ? t('requestRemovalBtn') : t('removeBtn')}
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
