import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { userApi } from '../services/api';
import { formatDate, formatCurrency } from '../utils/helpers';
import {
  Users, Stethoscope, FlaskConical, Pill, Truck,
  ShoppingCart, BarChart2, Receipt, Activity, TrendingUp,
  AlertTriangle, Shield, UserCheck, Package, Building2,
  Hospital, CalendarCheck,
} from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  patient:    'bg-blue-100 text-blue-700',
  doctor:     'bg-teal-100 text-teal-700',
  pharmacist: 'bg-purple-100 text-purple-700',
  laboratory: 'bg-cyan-100 text-cyan-700',
  admin:      'bg-red-100 text-red-700',
};

const ROLE_ICONS: Record<string, string> = {
  patient: '🏥', doctor: '🩺', pharmacist: '💊', laboratory: '🔬', admin: '🛡️',
};

export default function AdminDashboard() {
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: userApi.getStats,
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => userApi.toggle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('User status updated');
    },
    onError: () => toast.error('Failed to update user status'),
  });

  const u = stats?.users;
  const org = stats?.organizations;
  const m = stats?.medicines;
  const c = stats?.consultations;
  const l = stats?.labs;
  const s = stats?.sales;
  const a = stats?.appointments;
  const recent: any[] = stats?.recentUsers || [];

  const userCards = [
    { label: 'Total Users',   value: u?.total_users    ?? '—', icon: Users,       bg: 'bg-slate-50',  fg: 'text-slate-700',  border: 'border-slate-200' },
    { label: 'Patients',      value: u?.total_patients ?? '—', icon: Activity,    bg: 'bg-blue-50',   fg: 'text-blue-700',   border: 'border-blue-200' },
    { label: 'Doctors',       value: u?.total_doctors  ?? '—', icon: Stethoscope, bg: 'bg-teal-50',   fg: 'text-teal-700',   border: 'border-teal-200' },
    { label: 'Pharmacists',   value: u?.total_pharmacists ?? '—', icon: Pill,     bg: 'bg-purple-50', fg: 'text-purple-700', border: 'border-purple-200' },
    { label: 'Laboratories',  value: u?.total_laboratories ?? '—', icon: FlaskConical, bg: 'bg-cyan-50', fg: 'text-cyan-700', border: 'border-cyan-200' },
    { label: 'Admins',        value: u?.total_admins   ?? '—', icon: Shield,      bg: 'bg-red-50',    fg: 'text-red-700',    border: 'border-red-200' },
    { label: 'Active Users',  value: u?.active_users   ?? '—', icon: UserCheck,   bg: 'bg-green-50',  fg: 'text-green-700',  border: 'border-green-200' },
    { label: 'New This Week', value: u?.new_this_week  ?? '—', icon: TrendingUp,  bg: 'bg-orange-50', fg: 'text-orange-700', border: 'border-orange-200' },
  ];

  const orgCards = [
    { label: 'Hospitals',     value: org?.total_hospitals   ?? '—', emoji: '🏥', color: 'text-blue-700   bg-blue-50' },
    { label: 'Pharmacies',    value: org?.total_pharmacies  ?? '—', emoji: '💊', color: 'text-purple-700 bg-purple-50' },
    { label: 'Laboratories',  value: org?.total_laboratories?? '—', emoji: '🔬', color: 'text-cyan-700   bg-cyan-50' },
    { label: 'Clinics',       value: org?.total_clinics     ?? '—', emoji: '🩺', color: 'text-teal-700   bg-teal-50' },
    { label: 'Total Orgs',    value: org?.total_organizations ?? '—', emoji: '🏢', color: 'text-gray-700  bg-gray-50' },
  ];

  const quickLinks = [
    { to: '/admin/organizations', label: 'Organizations', icon: Building2,   color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100' },
    { to: '/admin/users',         label: 'Users',          icon: Users,        color: 'text-red-600    bg-red-50    hover:bg-red-100    border-red-100' },
    { to: '/admin/medicines',     label: 'Medicines',      icon: Pill,         color: 'text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-100' },
    { to: '/admin/suppliers',     label: 'Suppliers',      icon: Truck,        color: 'text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-100' },
    { to: '/admin/orders',        label: 'Orders',         icon: ShoppingCart, color: 'text-teal-600   bg-teal-50   hover:bg-teal-100   border-teal-100' },
    { to: '/admin/sales',         label: 'Sales',          icon: Receipt,      color: 'text-green-600  bg-green-50  hover:bg-green-100  border-green-100' },
    { to: '/admin/inventory',     label: 'Inventory',      icon: BarChart2,    color: 'text-blue-600   bg-blue-50   hover:bg-blue-100   border-blue-100' },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Core Health — multi-tenant system overview</p>
        </div>
        <span className="inline-flex items-center gap-2 bg-red-50 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200 self-start sm:self-auto">
          🛡️ System Administrator
        </span>
      </div>

      {/* User stats */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">User Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {userCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`rounded-xl border p-4 ${card.bg} ${card.border}`}>
                <Icon size={15} className={`${card.fg} opacity-50 mb-3`} />
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Organizations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tenant Organizations</h2>
          <Link to="/admin/organizations" className="text-xs text-primary-600 hover:text-primary-700 font-medium">Manage →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {orgCards.map((card) => (
            <div key={card.label} className={`rounded-xl p-4 ${card.color} border border-white/50`}>
              <span className="text-xl mb-2 block">{card.emoji}</span>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* System activity row */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">System Activity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Consultations */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center shrink-0">
                <Stethoscope size={16} className="text-teal-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Consultations</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-3">{c?.total_consultations ?? '—'}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Active</span>
                <span className="font-semibold text-teal-600">{c?.active_consultations ?? '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold text-green-600">{c?.completed_consultations ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Lab Requests */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center shrink-0">
                <FlaskConical size={16} className="text-cyan-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Lab Requests</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-3">{l?.total_lab_requests ?? '—'}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Pending</span>
                <span className="font-semibold text-yellow-600">{l?.pending_lab_requests ?? '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold text-green-600">{l?.completed_lab_requests ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Appointments (cross-tenant) */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <CalendarCheck size={16} className="text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Appointments</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-3">{a?.total_appointments ?? '—'}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Upcoming</span>
                <span className="font-semibold text-blue-600">{a?.upcoming_appointments ?? '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold text-green-600">{a?.completed_appointments ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Pharmacy Sales (cross-tenant) */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp size={16} className="text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Pharmacy Sales</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-3">{s?.total_sales ?? '—'}</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Revenue</span>
                <span className="font-semibold text-green-600">
                  {s ? formatCurrency(Number(s.total_revenue)) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">This Month</span>
                <span className="font-semibold text-blue-600">{s?.sales_this_month ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pharmacy inventory health */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-5">Pharmacy Inventory Health</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Package size={20} className="text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{m?.total_medicines ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Total Medicines</p>
          </div>
          <div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${Number(m?.low_stock) > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
              <AlertTriangle size={20} className={Number(m?.low_stock) > 0 ? 'text-yellow-500' : 'text-gray-300'} />
            </div>
            <p className={`text-2xl font-bold ${Number(m?.low_stock) > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>{m?.low_stock ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Low Stock</p>
          </div>
          <div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${Number(m?.expired) > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <AlertTriangle size={20} className={Number(m?.expired) > 0 ? 'text-red-500' : 'text-gray-300'} />
            </div>
            <p className={`text-2xl font-bold ${Number(m?.expired) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{m?.expired ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Expired</p>
          </div>
        </div>
      </div>

      {/* Quick navigation */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150 ${link.color}`}
              >
                <Icon size={20} />
                <span className="text-xs font-semibold text-center leading-tight">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent registrations */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent Registrations</h2>
          <Link to="/admin/users" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  {['Name', 'Email', 'Role', 'Status', 'Joined', 'Action'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map((usr) => (
                  <tr key={usr.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {usr.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{usr.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{usr.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[usr.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_ICONS[usr.role]} {usr.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${usr.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {usr.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(usr.created_at)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleMutation.mutate(usr.id)}
                        disabled={toggleMutation.isPending}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          usr.is_active
                            ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {usr.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
