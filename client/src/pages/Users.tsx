import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
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

const PROFILE_FIELDS: Record<string, FieldDef[]> = {
  doctor: [
    { field: 'phone',                label: 'Phone',              type: 'tel', half: true },
    { field: 'specialization',       label: 'Specialization',     required: true, half: true },
    { field: 'license_number',       label: 'License Number',     half: true },
    { field: 'hospital_affiliation', label: 'Hospital / Clinic',  half: true },
    { field: 'consultation_fee',     label: 'Consultation Fee (LKR)', type: 'number', half: true },
    { field: 'years_experience',     label: 'Years of Experience', type: 'number', half: true },
    { field: 'medical_school',       label: 'Medical School',     half: false },
    { field: 'bio',                  label: 'Bio / Notes',        half: false },
  ],
  pharmacist: [
    { field: 'phone',               label: 'Phone',               type: 'tel', half: true },
    { field: 'license_number',      label: 'License Number',      half: true },
    { field: 'pharmacy_name',       label: 'Pharmacy Name',       half: true },
    { field: 'years_experience',    label: 'Years of Experience', type: 'number', half: true },
    { field: 'pharmacy_address',    label: 'Pharmacy Address',    half: false },
    { field: 'specialization_area', label: 'Specialization Area', half: false },
  ],
  patient: [
    { field: 'phone',           label: 'Phone',         type: 'tel',  half: true },
    { field: 'date_of_birth',   label: 'Date of Birth', type: 'date', half: true },
    {
      field: 'gender', label: 'Gender', half: true,
      options: [
        { value: '', label: 'Select gender' },
        { value: 'male',   label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: 'other',  label: 'Other' },
      ],
    },
    {
      field: 'blood_type', label: 'Blood Type', half: true,
      options: [
        { value: '', label: 'Select' },
        { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
        { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
        { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
        { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
      ],
    },
    { field: 'address',            label: 'Address',           half: false },
    { field: 'allergies',          label: 'Allergies',         half: true },
    { field: 'chronic_conditions', label: 'Chronic Conditions', half: true },
  ],
  laboratory: [
    { field: 'phone',            label: 'Phone',            type: 'tel', half: true },
    { field: 'lab_name',         label: 'Laboratory Name',  required: true, half: true },
    { field: 'lab_type',         label: 'Lab Type',         half: true },
    { field: 'license_number',   label: 'License Number',   half: true },
    { field: 'accreditation',    label: 'Accreditation',    half: true },
    { field: 'address',          label: 'Address',          half: false },
    { field: 'services_offered', label: 'Services Offered', half: false },
    { field: 'operating_hours',  label: 'Operating Hours',  half: true },
  ],
};

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
      toast.success('User created successfully');
      setCreateOpen(false);
      createForm.reset({ role: 'patient' });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create user'),
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
      toast.success('User updated');
      setEditTarget(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update user'),
  });

  // ── Toggle & delete ──────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: (id: number) => userApi.toggle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('User removed');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to remove user'),
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
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create, edit, and manage all system users</p>
        </div>
        <button
          onClick={() => { createForm.reset({ role: 'patient' }); setCreateOpen(true); }}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm w-44"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="patient">Patients</option>
          <option value="doctor">Doctors</option>
          <option value="pharmacist">Pharmacists</option>
          <option value="laboratory">Laboratories</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['User', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
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
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditOpen(u)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user"
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
                          title={u.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {u.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete user"
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
          Showing {filtered.length} of {(users as any[]).length} users
        </div>
      </div>

      {/* ── Create User Modal ──────────────────────────────────────────────────── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add New User" size="lg">
        <form
          onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-5"
        >
          {/* Base fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input
                className="input"
                placeholder="John Doe"
                {...createForm.register('name', { required: true })}
              />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                placeholder="john@example.com"
                {...createForm.register('email', { required: true })}
              />
            </div>
            <div>
              <label className="label">Password *</label>
              <input
                type="password"
                className="input"
                placeholder="Min. 6 characters"
                {...createForm.register('password', { required: true, minLength: 6 })}
              />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" {...createForm.register('role', { required: true })}>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="laboratory">Laboratory</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Role-specific profile fields */}
          {createProfileFields.length > 0 && (
            <div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Profile
                </p>
                <ProfileFields fields={createProfileFields} register={createForm.register} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit User Modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit — ${editTarget.name}` : 'Edit User'}
        size="lg"
      >
        <form
          onSubmit={editForm.handleSubmit((data) => updateMutation.mutate({ id: editTarget.id, data }))}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" {...editForm.register('name', { required: true })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input" {...editForm.register('email', { required: true })} />
            </div>
            <div>
              <label className="label">
                New Password
                <span className="text-gray-400 font-normal text-xs ml-1">(leave blank to keep)</span>
              </label>
              <input
                type="password"
                className="input"
                placeholder="Leave blank to keep current"
                {...editForm.register('password')}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" {...editForm.register('is_active')}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          {editProfileFields.length > 0 && (
            <div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {editRole.charAt(0).toUpperCase() + editRole.slice(1)} Profile
                </p>
                <ProfileFields fields={editProfileFields} register={editForm.register} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Remove User"
        message={`Are you sure you want to remove "${deleteTarget?.name}"? This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
