import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Stethoscope, Activity, FolderOpen, Users, Pill,
  Truck, ShoppingCart, Receipt, BarChart2, ClipboardList, Microscope,
  ShieldCheck, MoreHorizontal, X, LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accessRequestApi, labViewRequestApi } from '../../services/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
}

interface TabConfig {
  primary: NavItem[];
  more: NavItem[];
}

// ── Primary tabs (max 4) + overflow items per role ────────────────────────────
const TABS: Record<string, TabConfig> = {
  patient: {
    primary: [
      { to: '/patient',               label: 'Home',     icon: LayoutDashboard, exact: true },
      { to: '/patient/consultations', label: 'Consult',  icon: Stethoscope },
      { to: '/patient/my-reports',    label: 'Reports',  icon: FolderOpen },
      { to: '/patient/requests',      label: 'Requests', icon: ShieldCheck, badge: 'ptRequests' },
    ],
    more: [
      { to: '/patient/medical-flow',  label: 'Medical Flow', icon: Activity },
    ],
  },
  doctor: {
    primary: [
      { to: '/doctor',               label: 'Home',       icon: LayoutDashboard, exact: true },
      { to: '/doctor/consultations', label: 'Consult',    icon: Stethoscope },
      { to: '/doctor/lab-requests',  label: 'Lab Reports',icon: Microscope },
      { to: '/doctor/requests',      label: 'Requests',   icon: ShieldCheck, badge: 'drRequests' },
    ],
    more: [],
  },
  admin: {
    primary: [
      { to: '/admin',           label: 'Home',      icon: LayoutDashboard, exact: true },
      { to: '/admin/medicines', label: 'Medicines', icon: Pill },
      { to: '/admin/orders',    label: 'Orders',    icon: ShoppingCart },
      { to: '/admin/users',     label: 'Users',     icon: Users },
    ],
    more: [
      { to: '/admin/suppliers', label: 'Suppliers', icon: Truck },
      { to: '/admin/sales',     label: 'Sales',     icon: Receipt },
      { to: '/admin/inventory', label: 'Inventory', icon: BarChart2 },
    ],
  },
  pharmacist: {
    primary: [
      { to: '/pharmacist',               label: 'Home',    icon: LayoutDashboard, exact: true },
      { to: '/pharmacist/consultations', label: 'Prescr.', icon: ClipboardList },
      { to: '/pharmacist/medicines',     label: 'Meds',    icon: Pill },
      { to: '/pharmacist/sales',         label: 'Sales',   icon: Receipt },
    ],
    more: [
      { to: '/pharmacist/suppliers', label: 'Suppliers', icon: Truck },
      { to: '/pharmacist/orders',    label: 'Orders',    icon: ShoppingCart },
      { to: '/pharmacist/inventory', label: 'Inventory', icon: BarChart2 },
    ],
  },
  laboratory: {
    primary: [
      { to: '/laboratory',         label: 'Home',    icon: LayoutDashboard, exact: true },
      { to: '/laboratory/reports', label: 'Reports', icon: ClipboardList },
    ],
    more: [],
  },
};

// ── More drawer (slide-up sheet) ──────────────────────────────────────────────
interface MoreDrawerProps {
  items: NavItem[];
  onClose: () => void;
}

function MoreDrawer({ items, onClose }: MoreDrawerProps) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative bg-white rounded-t-3xl shadow-2xl pb-8 animate-[slideUp_0.25s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3">
          <p className="text-base font-bold text-gray-900">More</p>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Nav items */}
        <div className="px-4 space-y-1">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-primary-100' : 'bg-gray-100'
                    }`}>
                      <Icon size={18} strokeWidth={1.8} className={isActive ? 'text-primary-600' : 'text-gray-500'} />
                    </div>
                    <span className="text-sm font-semibold">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Divider + account */}
        <div className="mx-4 my-3 border-t border-gray-100" />

        <div className="px-4 space-y-1">
          {/* User info row */}
          <div className="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <LogOut size={18} strokeWidth={1.8} />
            </div>
            <span className="text-sm font-semibold">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bottom navigation bar ─────────────────────────────────────────────────────
export default function MobileBottomNav() {
  const { user }       = useAuth();
  const [showMore, setShowMore] = useState(false);

  const role      = user?.role || 'patient';
  const tabConf   = TABS[role] || TABS.patient;
  const primary   = tabConf.primary;
  const moreItems = tabConf.more;
  const hasMore   = moreItems.length > 0;

  const isRequestsRole = role === 'patient' || role === 'doctor';

  const { data: accessRequests = [] } = useQuery({
    queryKey: ['access-requests'],
    queryFn:  accessRequestApi.getAll,
    enabled:  isRequestsRole,
  });

  const { data: labViewRequests = [] } = useQuery({
    queryKey: ['lab-view-requests'],
    queryFn:  labViewRequestApi.getAll,
    enabled:  isRequestsRole,
  });

  const accessPending  = (accessRequests as Array<{ status: string }>).filter(r => r.status === 'pending').length;
  const labViewPending = (labViewRequests as Array<{ status: string }>).filter(r => r.status === 'pending').length;

  const getBadge = (badgeKey: string): number => {
    if (badgeKey === 'ptRequests') return accessPending + labViewPending;
    if (badgeKey === 'drRequests') return accessPending;
    return 0;
  };

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-gray-100"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        <div className="flex items-center h-16">
          {primary.map(item => {
            const Icon       = item.icon;
            const badgeCount = item.badge ? getBadge(item.badge) : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${
                    isActive ? 'text-primary-600' : 'text-gray-400 active:text-gray-600'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`relative w-10 h-7 flex items-center justify-center rounded-xl transition-all ${
                      isActive ? 'bg-primary-50' : ''
                    }`}>
                      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                      {badgeCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold leading-none ${isActive ? 'text-primary-600' : ''}`}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}

          {/* More tab */}
          {hasMore && (
            <button
              onClick={() => setShowMore(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-gray-400 active:text-gray-600"
            >
              <div className="w-10 h-7 flex items-center justify-center">
                <MoreHorizontal size={20} strokeWidth={1.8} />
              </div>
              <span className="text-[10px] font-semibold leading-none">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* More drawer */}
      {showMore && (
        <MoreDrawer items={moreItems} onClose={() => setShowMore(false)} />
      )}
    </>
  );
}
