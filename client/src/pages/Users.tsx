import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { userApi, authApi } from '../services/api';
import { useModal } from '../hooks/useModal';
import { formatDate } from '../utils/helpers';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Users() {
  const qc = useQueryClient();
  const formModal = useModal<any>();
  const deleteModal = useModal<any>();

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: userApi.getAll });
  const { register, handleSubmit, reset } = useForm();

  const addMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); formModal.close(); reset(); },
    onError: (err: any) => toast.error(err.message || 'Failed to create user'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => userApi.remove(deleteModal.data.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); deleteModal.close(); },
    onError: (err: any) => toast.error(err.message || 'Failed to delete user'),
  });

  const ROLE_COLORS: Record<string, string> = { admin: 'bg-purple-100 text-purple-700', pharmacist: 'bg-blue-100 text-blue-700', staff: 'bg-gray-100 text-gray-700' };

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r: any) => <span className={`badge ${ROLE_COLORS[r.role]}`}>{r.role}</span> },
    { key: 'is_active', header: 'Status', render: (r: any) => (
      <span className={`badge ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {r.is_active ? 'Active' : 'Inactive'}
      </span>
    )},
    { key: 'created_at', header: 'Joined', render: (r: any) => formatDate(r.created_at) },
    { key: 'actions', header: '', render: (r: any) => (
      <button className="btn-danger text-xs py-1 px-2" onClick={() => deleteModal.open(r)}>Delete</button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage system users and roles"
        action={<button className="btn-primary" onClick={() => { reset({}); formModal.open(null); }}>+ Add User</button>}
      />
      <Table columns={columns} data={users} loading={isLoading} />

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="Add User">
        <form onSubmit={handleSubmit((d: any) => addMutation.mutate(d))} className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input" {...register('name', { required: true })} /></div>
          <div><label className="label">Email *</label><input type="email" className="input" {...register('email', { required: true })} /></div>
          <div><label className="label">Password *</label><input type="password" className="input" {...register('password', { required: true, minLength: 6 })} /></div>
          <div>
            <label className="label">Role</label>
            <select className="input" {...register('role')}>
              <option value="staff">Staff</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={formModal.close}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteModal.isOpen} onClose={deleteModal.close}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete User" message={`Delete user "${deleteModal.data?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
