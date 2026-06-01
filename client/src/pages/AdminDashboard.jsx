import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { userApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const ROLE_COLORS = {
  patient:    'bg-blue-100   text-blue-700',
  doctor:     'bg-teal-100   text-teal-700',
  pharmacist: 'bg-purple-100 text-purple-700',
  laboratory: 'bg-cyan-100   text-cyan-700',
  admin:      'bg-red-100    text-red-700',
};

const ROLE_ICONS = { patient: '🏥', doctor: '🩺', pharmacist: '💊', laboratory: '🔬', admin: '🛡️' };

export default function AdminDashboard() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const qc = useQueryClient();

  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: userApi.getStats });
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => userApi.getAll(roleFilter ? { role: roleFilter } : {}),
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => userApi.toggle(id),
    onSuccess: () => { qc.invalidateQueries(['users']); qc.invalidateQueries(['admin-stats']); },
    onError: () => toast.error('Failed to update user status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => userApi.remove(id),
    onSuccess: () => { qc.invalidateQueries(['users']); qc.invalidateQueries(['admin-stats']); toast.success('User removed'); },
    onError: () => toast.error('Failed to remove user'),
  });

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const statCards = [
    { label: 'Total Patients',    value: stats?.users?.total_patients    ?? '—', icon: '🏥', color: 'blue'   },
    { label: 'Total Doctors',     value: stats?.users?.total_doctors     ?? '—', icon: '🩺', color: 'teal'   },
    { label: 'Pharmacists',       value: stats?.users?.total_pharmacists ?? '—', icon: '💊', color: 'purple' },
    { label: 'Laboratories',      value: stats?.users?.total_laboratories?? '—', icon: '🔬', color: 'cyan'   },
  ];

  const statCards2 = [
    { label: 'New This Week',     value: stats?.users?.new_this_week     ?? '—', icon: '✨', color: 'green'  },
    { label: 'Active Users',      value: stats?.users?.active_users      ?? '—', icon: '👥', color: 'blue'   },
  ];

  const colorMap = {
    blue:   'bg-blue-50   text-blue-600   border-blue-100',
    teal:   'bg-teal-50   text-teal-600   border-teal-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    green:  'bg-green-50  text-green-600  border-green-100',
    cyan:   'bg-cyan-50   text-cyan-600   border-cyan-100',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Core Health system overview and user management</p>
        </div>
        <span className="inline-flex items-center gap-2 bg-red-50 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-red-100">
          🛡️ System Administrator
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-5 ${colorMap[c.color]}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{c.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* System health */}
      {stats?.medicines && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Pharmacy Inventory Health</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.medicines.total_medicines}</p>
              <p className="text-xs text-gray-500 mt-1">Total Medicines</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.medicines.low_stock}</p>
              <p className="text-xs text-gray-500 mt-1">Low Stock</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{stats.medicines.expired}</p>
              <p className="text-xs text-gray-500 mt-1">Expired Items</p>
            </div>
          </div>
        </div>
      )}

      {/* User management */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700 flex-1">User Management</h2>
            <div className="flex gap-2">
              <input
                className="input text-sm py-1.5 w-48"
                placeholder="Search name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select className="input text-sm py-1.5 w-36" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                <option value="patient">Patients</option>
                <option value="doctor">Doctors</option>
                <option value="pharmacist">Pharmacists</option>
                <option value="laboratory">Laboratories</option>
                <option value="admin">Admins</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                        {ROLE_ICONS[u.role]} {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMutation.mutate(u.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            u.is_active
                              ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove ${u.name}?`)) deleteMutation.mutate(u.id);
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Remove
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

        <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
          Showing {filtered.length} of {users.length} users
        </div>
      </div>
    </div>
  );
}
