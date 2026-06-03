import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { accessRequestApi, labViewRequestApi } from '../../services/api';
import { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Stethoscope, Activity, FlaskConical,
  FolderOpen, Users, Pill, Truck, ShoppingCart, Receipt, BarChart2,
  ClipboardList, Microscope, LogOut, Settings, UserSearch, ShieldCheck,
} from 'lucide-react';

// ── 4-dot logo mark ───────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none" className="w-6 h-6 shrink-0">
      <circle cx="9"  cy="9"  r="5.5" fill="white" opacity="0.95" />
      <circle cx="19" cy="9"  r="5.5" fill="white" opacity="0.95" />
      <circle cx="9"  cy="19" r="5.5" fill="white" opacity="0.95" />
      <circle cx="19" cy="19" r="5.5" fill="white" opacity="0.95" />
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
}

// ── Nav definitions ───────────────────────────────────────────────────────────
const NAV: Record<string, NavItem[]> = {
  admin: [
    { to: '/admin',           label: 'Dashboard',       icon: LayoutDashboard, exact: true },
    { to: '/admin/medicines', label: 'Medicines',        icon: Pill },
    { to: '/admin/suppliers', label: 'Suppliers',        icon: Truck },
    { to: '/admin/orders',    label: 'Orders',           icon: ShoppingCart },
    { to: '/admin/sales',     label: 'Sales',            icon: Receipt },
    { to: '/admin/inventory', label: 'Inventory',        icon: BarChart2 },
    { to: '/admin/users',     label: 'Users',            icon: Users },
  ],
  pharmacist: [
    { to: '/pharmacist',               label: 'Dashboard',     icon: LayoutDashboard, exact: true },
    { to: '/pharmacist/consultations', label: 'Prescriptions', icon: ClipboardList },
    { to: '/pharmacist/medicines',     label: 'Medicines',     icon: Pill },
    { to: '/pharmacist/suppliers',     label: 'Suppliers',     icon: Truck },
    { to: '/pharmacist/orders',        label: 'Orders',        icon: ShoppingCart },
    { to: '/pharmacist/sales',         label: 'Sales',         icon: Receipt },
    { to: '/pharmacist/inventory',     label: 'Inventory',     icon: BarChart2 },
  ],
  doctor: [
    { to: '/doctor',               label: 'Dashboard',       icon: LayoutDashboard, exact: true },
    { to: '/doctor/consultations', label: 'Consultations',   icon: Stethoscope },
    { to: '/doctor/lab-requests',  label: 'Lab Reports',     icon: Microscope },
    { to: '/doctor/patients',      label: 'Patients',        icon: UserSearch,  badge: 'patients'  },
    { to: '/doctor/requests',      label: 'Access Requests', icon: ShieldCheck, badge: 'drRequests' },
  ],
  patient: [
    { to: '/patient',               label: 'Dashboard',       icon: LayoutDashboard, exact: true },
    { to: '/patient/consultations', label: 'Consultations',   icon: Stethoscope },
    { to: '/patient/medical-flow',  label: 'Medical Flow',    icon: Activity },
    { to: '/patient/my-reports',    label: 'My Reports',      icon: FolderOpen },
    { to: '/patient/requests',      label: 'Doctor Requests', icon: ShieldCheck, badge: 'ptRequests' },
  ],
  laboratory: [
    { to: '/laboratory',         label: 'Dashboard',   icon: LayoutDashboard, exact: true },
    { to: '/laboratory/reports', label: 'Lab Reports', icon: ClipboardList },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin Panel', pharmacist: 'Pharmacist',
  doctor: 'Doctor Portal', patient: 'Patient Portal', laboratory: 'Laboratory',
};

const ROLE_DOTS: Record<string, string> = {
  admin: 'bg-red-400', pharmacist: 'bg-purple-400',
  doctor: 'bg-primary-400', patient: 'bg-blue-400', laboratory: 'bg-cyan-400',
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV[user?.role ?? ''] || [];

  // Fetch pending access-request counts for badge indicators
  const { data: accessRequests = [] } = useQuery({
    queryKey: ['access-requests'],
    queryFn:  accessRequestApi.getAll,
    enabled:  !!user && (user.role === 'patient' || user.role === 'doctor'),
  });

  // Fetch lab view requests for badge counts (patient pending + doctor new responses)
  const { data: labViewRequests = [] } = useQuery({
    queryKey: ['lab-view-requests'],
    queryFn:  labViewRequestApi.getAll,
    enabled:  !!user && (user.role === 'patient' || user.role === 'doctor'),
  });

  const accessPending    = (accessRequests as Array<{ status: string }>).filter(r => r.status === 'pending').length;
  // Patient: lab view requests waiting for their response
  const labViewPending   = (labViewRequests as Array<{ status: string }>).filter(r => r.status === 'pending').length;
  const getBadge = (badgeKey: string): number => {
    if (badgeKey === 'ptRequests') return accessPending + labViewPending;
    if (badgeKey === 'drRequests') return accessPending;
    return 0;
  };

  return (
    /*
     * fixed + group + overflow-hidden:
     *   • starts at 70 px, expands to 240 px on hover
     *   • transition-[width] gives the smooth slide
     *   • children use group-hover: to fade their labels in
     *   • z-40 keeps it above main content while expanded
     */
    <aside className="
      hidden md:flex
      fixed left-0 top-0 h-screen z-40
      w-[70px] hover:w-60
      bg-[#111827]
      flex-col
      overflow-hidden
      transition-[width] duration-300 ease-in-out
      group
      shadow-xl shadow-black/20
    ">

      {/* ── Logo ── */}
      <div className="h-16 flex items-center gap-3 px-[13px] border-b border-white/5 shrink-0">
        {/* icon always visible */}
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <LogoMark />
        </div>
        {/* text fades in on expand */}
        <div className="overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100">
          <p className="text-sm font-bold text-white whitespace-nowrap leading-tight">Core Health</p>
          <p className="text-[11px] text-slate-500 whitespace-nowrap">by BloomTech</p>
        </div>
      </div>

      {/* ── Role badge ── */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-2.5 py-2 overflow-hidden">
          <span className={`w-2 h-2 rounded-full shrink-0 ${ROLE_DOTS[user?.role ?? ''] || 'bg-gray-400'}`} />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100">
            {ROLE_LABELS[user?.role ?? ''] || ''}
          </span>
        </div>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 flex flex-col gap-0.5 py-3 px-3 overflow-y-auto overflow-x-hidden">
        {items.map(item => {
          const Icon      = item.icon;
          const badgeCount = item.badge ? getBadge(item.badge) : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl transition-all duration-150 overflow-hidden
                 ${isActive
                   ? 'bg-[#3B82F6] text-white shadow-lg shadow-blue-900/40'
                   : 'text-slate-500 hover:bg-white/[0.08] hover:text-slate-100'
                 }`
              }
            >
              {/* Icon slot with optional badge dot */}
              <span className="w-11 h-11 flex items-center justify-center shrink-0 relative">
                <Icon size={19} strokeWidth={1.8} />
                {badgeCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-1 ring-slate-900" />
                )}
              </span>

              {/* Label + badge count — fade in on hover */}
              <span className="flex-1 flex items-center justify-between whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-75 pr-2">
                <span className="text-sm font-medium">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {badgeCount}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* ── Bottom section ── */}
      <div className="flex flex-col gap-0.5 pb-4 px-3 border-t border-white/5 pt-3 shrink-0 overflow-hidden">

        {/* Settings */}
        <button className="flex items-center gap-3 rounded-2xl text-slate-500 hover:bg-white/[0.08] hover:text-slate-200 transition-all duration-150 overflow-hidden">
          <span className="w-11 h-11 flex items-center justify-center shrink-0">
            <Settings size={19} strokeWidth={1.8} />
          </span>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-75 pr-2">
            Settings
          </span>
        </button>

        {/* User row */}
        <div className="flex items-center gap-3 rounded-2xl px-0 py-1.5 hover:bg-white/[0.05] transition-colors overflow-hidden">
          {/* Avatar — sits inside the 44px icon slot */}
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xs font-bold text-white select-none">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
          </div>
          {/* User info — fades in */}
          <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-75 overflow-hidden">
            <p className="text-xs font-semibold text-white truncate whitespace-nowrap leading-tight">{user?.name}</p>
            <p className="text-[11px] text-slate-500 capitalize whitespace-nowrap">{user?.role}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="flex items-center gap-3 rounded-2xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 overflow-hidden"
        >
          <span className="w-11 h-11 flex items-center justify-center shrink-0">
            <LogOut size={19} strokeWidth={1.8} />
          </span>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-75 pr-2">
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}
