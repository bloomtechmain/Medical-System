import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { orgApi, userApi } from '../services/api';
import { Organization, OrganizationMember } from '../types';
import { formatDate } from '../utils/helpers';
import {
  Building2, Hospital, FlaskConical, Pill, Stethoscope,
  ChevronDown, ChevronUp, Plus, Trash2, UserPlus, Power,
  PowerOff, X, Users, Hash, CheckCircle, Clock,
} from 'lucide-react';

function getOrgTypeMeta(t: TFunction): Record<string, { label: string; icon: React.ElementType; color: string }> {
  return {
    hospital:    { label: t('organizations.types.hospital'),    icon: Hospital,     color: 'bg-blue-50 text-blue-700 border-blue-200' },
    pharmacy:    { label: t('organizations.types.pharmacy'),    icon: Pill,         color: 'bg-purple-50 text-purple-700 border-purple-200' },
    laboratory:  { label: t('organizations.types.laboratory'),  icon: FlaskConical, color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    clinic:      { label: t('organizations.types.clinic'),      icon: Stethoscope,  color: 'bg-teal-50 text-teal-700 border-teal-200' },
  };
}

function OrgTypeBadge({ type }: { type: string }) {
  const { t } = useTranslation('admin');
  const ORG_TYPE_META = getOrgTypeMeta(t);
  const meta = ORG_TYPE_META[type] ?? { label: type, icon: Building2, color: 'bg-gray-50 text-gray-700 border-gray-200' };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${meta.color}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

// ── Provision modal ─────────────────────────────────────────────────────────
interface ProvisionForm {
  name: string;
  slug: string;
  org_type: 'hospital' | 'pharmacy' | 'laboratory' | 'clinic';
  owner_user_id: string;
}

function ProvisionModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ProvisionForm>({
    defaultValues: { org_type: 'hospital' },
  });
  const name = watch('name');

  // Auto-generate slug from name
  const onNameBlur = () => {
    const slug = name?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (slug) setValue('slug', slug);
  };

  const provision = useMutation({
    mutationFn: (data: ProvisionForm) => orgApi.provision({
      ...data,
      owner_user_id: data.owner_user_id ? parseInt(data.owner_user_id) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('organizations.toast.provisionSuccess'));
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || t('organizations.toast.provisionFailed')),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => userApi.getAll(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('organizations.provisionModal.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('organizations.provisionModal.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => provision.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.provisionModal.orgNameLabel')} *</label>
            <input
              {...register('name', { required: t('organizations.provisionModal.nameRequired') })}
              onBlur={onNameBlur}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder={t('organizations.provisionModal.orgNamePlaceholder')}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.provisionModal.slugLabel')} *</label>
            <input
              {...register('slug', {
                required: t('organizations.provisionModal.slugRequired'),
                pattern: { value: /^[a-z0-9_]+$/, message: t('organizations.provisionModal.slugPattern') },
              })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="e.g. city_general"
            />
            {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug.message}</p>}
            <p className="text-[11px] text-gray-400 mt-1">{t('organizations.provisionModal.slugHelper')}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.provisionModal.orgTypeLabel')} *</label>
            <select
              {...register('org_type', { required: true })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="hospital">{t('organizations.types.hospital')}</option>
              <option value="pharmacy">{t('organizations.types.pharmacy')}</option>
              <option value="laboratory">{t('organizations.types.laboratory')}</option>
              <option value="clinic">{t('organizations.types.clinic')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.provisionModal.ownerUserLabel')}</label>
            <select
              {...register('owner_user_id')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">{t('organizations.provisionModal.noneOption')}</option>
              {(users as any[]).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email}) [{u.role}]</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {tc('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={provision.isPending}
              className="flex-1 bg-primary-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {provision.isPending ? t('organizations.provisionModal.provisioning') : t('organizations.provisionModal.provision')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add member modal ─────────────────────────────────────────────────────────
function AddMemberModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<{ user_id: string; member_role: string }>();

  const { data: users = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => userApi.getAll(),
  });

  const addMember = useMutation({
    mutationFn: (data: { user_id: string; member_role: string }) =>
      orgApi.addMember(org.id, { user_id: parseInt(data.user_id), member_role: data.member_role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', org.id] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(t('organizations.toast.memberAdded'));
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || t('organizations.toast.addMemberFailed')),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{t('organizations.addMemberModal.title', { name: org.name })}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit((d) => addMember.mutate(d))} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.addMemberModal.userLabel')} *</label>
            <select
              {...register('user_id', { required: t('organizations.addMemberModal.userRequired') })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">{t('organizations.addMemberModal.selectUserOption')}</option>
              {(users as any[]).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} [{u.role}]</option>
              ))}
            </select>
            {errors.user_id && <p className="text-xs text-red-500 mt-1">{errors.user_id.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('organizations.addMemberModal.memberRoleLabel')} *</label>
            <select
              {...register('member_role', { required: true })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="owner">{t('organizations.memberRoles.owner')}</option>
              <option value="doctor">{t('organizations.memberRoles.doctor')}</option>
              <option value="pharmacist">{t('organizations.memberRoles.pharmacist')}</option>
              <option value="laboratory">{t('organizations.memberRoles.laboratory')}</option>
              <option value="staff">{t('organizations.memberRoles.staff')}</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">{tc('actions.cancel')}</button>
            <button type="submit" disabled={addMember.isPending} className="flex-1 bg-primary-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary-700 disabled:opacity-50">
              {addMember.isPending ? t('organizations.addMemberModal.adding') : t('organizations.addMemberModal.addMember')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Org row ──────────────────────────────────────────────────────────────────
function OrgRow({ org }: { org: Organization }) {
  const { t } = useTranslation('admin');
  const ORG_TYPE_META = getOrgTypeMeta(t);
  const MEMBER_ROLE_LABELS: Record<string, string> = {
    owner: t('organizations.memberRoles.owner'),
    doctor: t('organizations.memberRoles.doctor'),
    pharmacist: t('organizations.memberRoles.pharmacist'),
    laboratory: t('organizations.memberRoles.laboratory'),
    staff: t('organizations.memberRoles.staff'),
  };
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const isPending = !org.is_active && !org.approved_at;

  const { data: members = [], isLoading: membersLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['org-members', org.id],
    queryFn: () => orgApi.getMembers(org.id),
    enabled: expanded,
  });

  const toggle = useMutation({
    mutationFn: () => orgApi.toggle(org.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(isPending ? t('organizations.toast.approved') : org.is_active ? t('organizations.toast.deactivated') : t('organizations.toast.activated'));
    },
    onError: () => toast.error(t('organizations.toast.updateFailed')),
  });

  const removeMember = useMutation({
    mutationFn: (userId: number) => orgApi.removeMember(org.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', org.id] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(t('organizations.toast.memberRemoved'));
    },
    onError: () => toast.error(t('organizations.toast.removeMemberFailed')),
  });

  return (
    <>
      <div className={`bg-white rounded-xl border transition-all ${
        isPending ? 'border-amber-200 ring-1 ring-amber-100' : org.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'
      }`}>
        <div className="flex items-center gap-4 px-5 py-4">
          {/* Type icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${ORG_TYPE_META[org.org_type]?.color ?? 'bg-gray-50 border-gray-200'}`}>
            {(() => { const Icon = ORG_TYPE_META[org.org_type]?.icon ?? Building2; return <Icon size={16} />; })()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{org.name}</span>
              <OrgTypeBadge type={org.org_type} />
              {isPending && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Clock size={9} /> {t('organizations.pendingApprovalBadge')}
                </span>
              )}
              {!org.is_active && !isPending && (
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t('organizations.inactiveBadge')}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Hash size={10} />
                <span className="font-mono">{org.slug}</span>
              </span>
              {org.schema_name && (
                <span className="font-mono text-gray-300">{t('organizations.schemaLabel', { schema: org.schema_name })}</span>
              )}
              <span className="flex items-center gap-1">
                <Users size={10} />
                {t('organizations.membersCount', { count: org.member_count ?? 0 })}
              </span>
              {org.owner_name && (
                <span>{t('organizations.ownerLabel')} <span className="text-gray-600">{org.owner_name}</span></span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400 hidden sm:block">{formatDate(org.created_at)}</span>
            {isPending ? (
              <button
                onClick={() => toggle.mutate()}
                disabled={toggle.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                title={t('organizations.approveOrgTitle')}
              >
                <CheckCircle size={13} />
                {t('organizations.approve')}
              </button>
            ) : (
              <button
                onClick={() => toggle.mutate()}
                disabled={toggle.isPending}
                className={`p-2 rounded-lg transition-colors ${
                  org.is_active
                    ? 'text-yellow-500 hover:bg-yellow-50'
                    : 'text-green-500 hover:bg-green-50'
                }`}
                title={org.is_active ? t('organizations.deactivate') : t('organizations.activate')}
              >
                {org.is_active ? <PowerOff size={15} /> : <Power size={15} />}
              </button>
            )}
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* Expanded members panel */}
        {expanded && (
          <div className="border-t border-gray-50 px-5 pb-4">
            <div className="flex items-center justify-between pt-3 mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('organizations.members')}</p>
              <button
                onClick={() => setAddingMember(true)}
                className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                <UserPlus size={13} /> {t('organizations.addMemberModal.addMember')}
              </button>
            </div>

            {membersLoading ? (
              <p className="text-xs text-gray-400 py-2">{t('organizations.loadingMembers')}</p>
            ) : (members as OrganizationMember[]).length === 0 ? (
              <p className="text-xs text-gray-400 py-2">{t('organizations.noMembersYet')}</p>
            ) : (
              <div className="space-y-2">
                {(members as OrganizationMember[]).map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold">
                        {(m.name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-800">{m.name ?? t('organizations.userFallbackName', { id: m.user_id })}</p>
                        <p className="text-[10px] text-gray-400">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                        {MEMBER_ROLE_LABELS[m.member_role] ?? m.member_role}
                      </span>
                      <button
                        onClick={() => removeMember.mutate(m.user_id)}
                        disabled={removeMember.isPending}
                        className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {addingMember && <AddMemberModal org={org} onClose={() => setAddingMember(false)} />}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Organizations() {
  const { t } = useTranslation('admin');
  const [showProvision, setShowProvision] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: orgApi.getAll,
  });

  const filtered = (orgs as Organization[]).filter(o => {
    if (filterType === 'pending') return !o.is_active && !o.approved_at;
    if (filterType !== 'all' && o.org_type !== filterType) return false;
    if (search && !o.name.toLowerCase().includes(search.toLowerCase()) && !o.slug.includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = (orgs as Organization[]).filter(o => !o.is_active && !o.approved_at).length;

  const counts = {
    all:        (orgs as Organization[]).length,
    pending:    pendingCount,
    hospital:   (orgs as Organization[]).filter(o => o.org_type === 'hospital').length,
    pharmacy:   (orgs as Organization[]).filter(o => o.org_type === 'pharmacy').length,
    laboratory: (orgs as Organization[]).filter(o => o.org_type === 'laboratory').length,
    clinic:     (orgs as Organization[]).filter(o => o.org_type === 'clinic').length,
  };

  const FILTERS = [
    { key: 'all',        label: t('organizations.filters.all') },
    { key: 'pending',    label: t('organizations.filters.pending') },
    { key: 'hospital',   label: t('organizations.filters.hospitals') },
    { key: 'pharmacy',   label: t('organizations.filters.pharmacies') },
    { key: 'laboratory', label: t('organizations.filters.laboratories') },
    { key: 'clinic',     label: t('organizations.filters.clinics') },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('organizations.pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('organizations.pageSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowProvision(true)}
          className="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-colors self-start sm:self-auto"
        >
          <Plus size={16} />
          {t('organizations.newOrganization')}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {FILTERS.map(f => (
          <div
            key={f.key}
            onClick={() => setFilterType(f.key)}
            className={`rounded-xl border p-3 text-center cursor-pointer transition-all ${
              f.key === 'pending' && counts.pending > 0 && filterType !== 'pending'
                ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                : filterType === f.key
                  ? 'bg-primary-50 border-primary-200 ring-2 ring-primary-200'
                  : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <p className={`text-2xl font-bold ${f.key === 'pending' && counts.pending > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {counts[f.key as keyof typeof counts]}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{f.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or slug…"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 p-2">
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading organizations…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search ? 'No organizations match your search.' : 'No organizations yet. Provision one to get started.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(org => (
            <OrgRow key={org.id} org={org} />
          ))}
        </div>
      )}

      {showProvision && <ProvisionModal onClose={() => setShowProvision(false)} />}
    </div>
  );
}
