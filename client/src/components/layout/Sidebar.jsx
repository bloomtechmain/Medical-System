import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV = {
  admin: [
    { to: '/admin',           label: 'Dashboard',  icon: '🏠', exact: true },
    { to: '/admin/medicines', label: 'Medicines',  icon: '💊' },
    { to: '/admin/suppliers', label: 'Suppliers',  icon: '🏭' },
    { to: '/admin/orders',    label: 'Orders',     icon: '📦' },
    { to: '/admin/sales',     label: 'Sales',      icon: '🧾' },
    { to: '/admin/inventory', label: 'Inventory',  icon: '📊' },
    { to: '/admin/users',     label: 'Users',      icon: '👥' },
  ],
  pharmacist: [
    { to: '/pharmacist',                label: 'Dashboard',     icon: '🏠', exact: true },
    { to: '/pharmacist/consultations',  label: 'Prescriptions', icon: '📋' },
    { to: '/pharmacist/medicines',      label: 'Medicines',     icon: '💊' },
    { to: '/pharmacist/suppliers',      label: 'Suppliers',     icon: '🏭' },
    { to: '/pharmacist/orders',         label: 'Orders',        icon: '📦' },
    { to: '/pharmacist/sales',          label: 'Sales',         icon: '🧾' },
    { to: '/pharmacist/inventory',      label: 'Inventory',     icon: '📊' },
  ],
  doctor: [
    { to: '/doctor',               label: 'Dashboard',      icon: '🏠', exact: true },
    { to: '/doctor/consultations', label: 'Consultations',  icon: '🩺' },
    { to: '/doctor/lab-requests',  label: 'Lab Requests',   icon: '🔬' },
    { to: '/doctor/history',       label: 'Patient History', icon: '📋' },
  ],
  patient: [
    { to: '/patient',              label: 'Dashboard',          icon: '🏠', exact: true },
    { to: '/patient/medical-flow', label: 'Medical Flow',       icon: '🧬' },
    { to: '/patient/medical',      label: 'Medical Description', icon: '🩺' },
    { to: '/patient/lab-reports',  label: 'Lab Reports',         icon: '🔬' },
  ],
  laboratory: [
    { to: '/laboratory',         label: 'Dashboard',   icon: '🏠', exact: true },
    { to: '/laboratory/reports', label: 'Lab Reports', icon: '📋' },
  ],
};

const BRAND_COLORS = {
  admin:      'text-red-600',
  pharmacist: 'text-purple-600',
  doctor:     'text-primary-600',
  patient:    'text-blue-600',
  laboratory: 'text-cyan-600',
};

const ROLE_LABELS = {
  admin:      '🛡️ Admin Panel',
  pharmacist: '💊 Pharmacist',
  doctor:     '🩺 Doctor Portal',
  patient:    '🏥 Patient Portal',
  laboratory: '🔬 Laboratory Portal',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV[user?.role] || [];

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-600 text-white shadow-sm'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-gray-200">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">Core Health</p>
          <p className="text-xs text-gray-400">by BloomTech</p>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-5 py-3 border-b border-gray-100">
        <span className={`text-xs font-semibold ${BRAND_COLORS[user?.role]}`}>
          {ROLE_LABELS[user?.role] || ''}
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={linkClass}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
            {user?.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
