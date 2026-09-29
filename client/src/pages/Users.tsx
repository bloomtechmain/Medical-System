import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { userApi, authApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

// ── Profile field definitions per role ────────────────────────────────────────

type FieldDef = {
  field: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  half?: boolean;
};

function getProfileFields(t: TFunction, tc: TFunction): Record<string, FieldDef[]> {
  return {
    doctor: [
      { field: 'phone',                label: tc('fields.phone'),              type: 'tel', half: true },
      { field: 'specialization',       label: t('users.fields.specialization'),     required: true, half: true },
      { field: 'license_number',       label: t('users.fields.licenseNumber'),     half: true },
      { field: 'hospital_affiliation', label: t('users.fields.hospitalClinic'),  half: true },
      { field: 'consultation_fee',     label: t('users.fields.consultationFee'), type: 'number', half: true },
      { field: 'years_experience',     label: t('users.fields.yearsExperience'), type: 'number', half: true },
      { field: 'medical_school',       label: t('users.fields.medicalSchool'),     half: false },
      { field: 'bio',                  label: t('users.fields.bioNotes'),        half: false },
    ],
    pharmacist: [
      { field: 'phone',               label: tc('fields.phone'),               type: 'tel', half: true },
      { field: 'license_number',      label: t('users.fields.licenseNumber'),      half: true },
      { field: 'pharmacy_name',       label: t('users.fields.pharmacyName'),       half: true },
      { field: 'years_experience',    label: t('users.fields.yearsExperience'), type: 'number', half: true },
      { field: 'pharmacy_address',    label: t('users.fields.pharmacyAddress'),    half: false },
      { field: 'specialization_area', label: t('users.fields.specializationArea'), half: false },
    ],
    patient: [
      { field: 'phone',           label: tc('fields.phone'),         type: 'tel',  half: true },
      { field: 'date_of_birth',   label: t('users.fields.dateOfBirth'), type: 'date', half: true },
      {
        field: 'gender', label: tc('fields.gender'), half: true,
        options: [
          { value: '', label: t('users.fields.selectGender') },
          { value: 'male',   label: tc('fields.male') },
          { value: 'female', label: tc('fields.female') },
          { value: 'other',  label: tc('fields.other') },
        ],
      },
      {
        field: 'blood_type', label: t('users.fields.bloodType'), half: true,
        options: [
          { value: '', label: t('users.fields.select') },
          { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
          { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
          { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
          { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
        ],
      },
      { field: 'address',            label: tc('fields.address'),           half: false },
      { field: 'allergies',          label: t('users.fields.allergies'),         half: true },
      { field: 'chronic_conditions', label: t('users.fields.chronicConditions'), half: true },
    ],
    laboratory: [
      { field: 'phone',            label: tc('fields.phone'),            type: 'tel', half: true },
      { field: 'lab_name',         label: t('users.fields.laboratoryName'),  required: true, half: true },
      { field: 'lab_type',         label: t('users.fields.labType'),         half: true },
      { field: 'license_number',   label: t('users.fields.licenseNumber'),   half: true },
      { field: 'accreditation',    label: t('users.fields.accreditation'),   half: true },
      { field: 'address',          label: tc('fields.address'),          half: false },
      { field: 'services_offered', label: t('users.fields.servicesOffered'), half: false },
      { field: 'operating_hours',  label: t('users.fields.operatingHours'),  half: true },
    ],
  };
}

const BASE_KEYS = new Set(['name', 'email', 'password', 'role', 'is_active', 'id', 'created_at', 'updated_at', 'profile']);

const ROLE_COLORS: Record<string, string> = {
  patient:    'bg-blue-100 text-blue-700',
  doctor:     'bg-teal-100 text-teal-700',
  pharmacist: 'bg-purple-100 text-purple-700',
  laboratory: 'bg-cyan-100 text-cyan-700',
  admin:      'bg-red-100 text-red-700',
};

function buildProfile(data: Record<string, any>): Record<string, string> | undefined {
  const profile: Record<string, string> = {};
  Object.entries(data).forEach(([key, val]) => {
    if (!BASE_KEYS.has(key) && val !== '' && val != null) {
      profile[key] = String(val);
    }
  });
  return Object.keys(profile).length ? profile : undefined;
}

// ── Profile field renderer ─────────────────────────────────────────────────────

function ProfileFields({ fields, register }: { fields: FieldDef[]; register: any }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map(f => (
        <div key={f.field} className={f.half === false ? 'col-span-2' : ''}>
          <label className="label">{f.label}{f.required ? ' *' : ''}</label>
          {f.options ? (
            <select className="input text-sm" {...register(f.field, { required: f.required })}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={f.type || 'text'}
              className="input text-sm"
              {...register(f.field, { required: f.required })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Users() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => userApi.getAll(roleFilter ? { role: roleFilter } : {}),
  });

  const PROFILE_FIELDS = getProfileFields(t, tc);
  const ROLE_LABELS: Record<string, string> = {
    patient: t('users.roles.patient'),
    doctor: t('users.roles.doctor'),
    pharmacist: t('users.roles.pharmacist'),
    laboratory: t('users.roles.laboratory'),
    admin: t('users.roles.admin'),
  };

  // ── Create form ──────────────────────────────────────────────────────────────
  const createForm = useForm<any>({ defaultValues: { role: 'patient' } });
  const selectedRole: string = createForm.watch('role') || 'patient';
  const createProfileFields = PROFILE_FIELDS[selectedRole] || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      const { name, email, password, role } = data;
      return authApi.register({ name, email, password, role, profile: buildProfile(data) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('users.toast.createSuccess'));
      setCreateOpen(false);
      createForm.reset({ role: 'patient' });
    },
    onError: (err: any) => toast.error(err.message || t('users.toast.createFailed')),
  });

  // ── Edit form ────────────────────────────────────────────────────────────────
  const editForm = useForm<any>();
  const editRole: string = editTarget?.role || '';
  const editProfileFields = PROFILE_FIELDS[editRole] || [];

  const handleEditOpen = async (user: any) => {
    try {
      const full = await userApi.getProfile(user.id);
      const { profile, ...base } = full;
      editForm.reset({
        ...base,
        ...(profile || {}),
        is_active: String(base.is_active),
        password: '',
      });
      setEditTarget(full);
    } catch {
      editForm.reset({ ...user, is_active: String(user.is_active), password: '' });
      setEditTarget(user);
    }
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => {
      const { name, email, is_active, password } = data;
      return userApi.updateProfile(id, {
        name,
        email,
        is_active: is_active === 'true' || is_active === true,
        password: password || undefined,
        profile: buildProfile(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('users.toast.updateSuccess'));
      setEditTarget(null);
    },
    onError: (err: any) => toast.error(err.message || t('users.toast.updateFailed')),
  });

  // ── Toggle & delete ──────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: (id: number) => userApi.toggle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: () => toast.error(t('users.toast.statusUpdateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('users.toast.removeSuccess'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('users.toast.removeFailed')),
  });

  const filtered = (users as any[]).filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('users.pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('users.pageSubtitle')}</p>
        </div>
        <button
          onClick={() => { createForm.reset({ role: 'patient' }); setCreateOpen(true); }}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={15} /> {t('users.addUser')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder={t('users.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm w-44"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">{t('users.allRoles')}</option>
          <option value="patient">{t('users.rolesPlural.patient')}</option>
          <option value="doctor">{t('users.rolesPlural.doctor')}</option>
          <option value="pharmacist">{t('users.rolesPlural.pharmacist')}</option>
          <option value="laboratory">{t('users.rolesPlural.laboratory')}</option>
          <option value="admin">{t('users.rolesPlural.admin')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('users.loadingUsers')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('users.noUsersFound')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[t('users.table.user'), t('users.table.role'), tc('fields.status'), t('users.table.joined'), t('users.table.actions')].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 leading-tight">{u.name}</p>
                          <p className="text-xs text-gray-400 leading-tight">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? tc('status.active') : t('users.inactive')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditOpen(u)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t('users.editUser')}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(u.id)}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.is_active
                              ? 'text-gray-400 hover:text-yellow-600 hover:bg-yellow-50'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={u.is_active ? t('users.deactivate') : t('users.activate')}
                        >
                          {u.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('users.deleteUser')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-gray-50 text-xs text-gray-400">
          {t('users.showingCount', { count: filtered.length, total: (users as any[]).length })}
        </div>
      </div>

      {/* ── Create User Modal ──────────────────────────────────────────────────── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('users.addNewUser')} size="lg">
        <form
          onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-5"
        >
          {/* Base fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('users.fields.fullName')} *</label>
              <input
                className="input"
                placeholder="John Doe"
                {...createForm.register('name', { required: true })}
              />
            </div>
            <div>
              <label className="label">{tc('fields.email')} *</label>
              <input
                type="email"
                className="input"
                placeholder="john@example.com"
                {...createForm.register('email', { required: true })}
              />
            </div>
            <div>
              <label className="label">{t('users.fields.password')} *</label>
              <input
                type="password"
                className="input"
                placeholder={t('users.fields.minCharacters')}
                {...createForm.register('password', { required: true, minLength: 6 })}
              />
            </div>
            <div>
              <label className="label">{t('users.fields.role')} *</label>
              <select className="input" {...createForm.register('role', { required: true })}>
                <option value="patient">{t('users.roles.patient')}</option>
                <option value="doctor">{t('users.roles.doctor')}</option>
                <option value="pharmacist">{t('users.roles.pharmacist')}</option>
                <option value="laboratory">{t('users.roles.laboratory')}</option>
                <option value="admin">{t('users.roles.admin')}</option>
              </select>
            </div>
          </div>

          {/* Role-specific profile fields */}
          {createProfileFields.length > 0 && (
            <div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {t('users.profileHeading', { role: ROLE_LABELS[selectedRole] ?? selectedRole })}
                </p>
                <ProfileFields fields={createProfileFields} register={createForm.register} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>{tc('actions.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('users.creating') : t('users.createUser')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit User Modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget ? t('users.editUserTitle', { name: editTarget.name }) : t('users.editUser')}
        size="lg"
      >
        <form
          onSubmit={editForm.handleSubmit((data) => updateMutation.mutate({ id: editTarget.id, data }))}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('users.fields.fullName')} *</label>
              <input className="input" {...editForm.register('name', { required: true })} />
            </div>
            <div>
              <label className="label">{tc('fields.email')} *</label>
              <input type="email" className="input" {...editForm.register('email', { required: true })} />
            </div>
            <div>
              <label className="label">
                {t('users.fields.newPassword')}
                <span className="text-gray-400 font-normal text-xs ml-1">{t('users.fields.leaveBlankToKeep')}</span>
              </label>
              <input
                type="password"
                className="input"
                placeholder={t('users.fields.leaveBlankToKeepCurrent')}
                {...editForm.register('password')}
              />
            </div>
            <div>
              <label className="label">{tc('fields.status')}</label>
              <select className="input" {...editForm.register('is_active')}>
                <option value="true">{tc('status.active')}</option>
                <option value="false">{t('users.inactive')}</option>
              </select>
            </div>
          </div>

          {editProfileFields.length > 0 && (
            <div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {t('users.profileHeading', { role: ROLE_LABELS[editRole] ?? editRole })}
                </p>
                <ProfileFields fields={editProfileFields} register={editForm.register} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>{tc('actions.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('users.saving') : t('users.saveChanges')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title={t('users.removeUser')}
        message={t('users.removeUserConfirm', { name: deleteTarget?.name })}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
