import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Check, Building2, Stethoscope, Pill, FlaskConical, User as UserIcon, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dashboardContexts, setActiveContextKey } from '../../constants/dashboards';
import type { DashboardContext } from '../../constants/dashboards';

// Requirement 1: "after login there should be option to change dashboard
// (Hospital to doctor like wise)".
//
// Renders nothing when the account has only one dashboard, which is the normal
// case — a switcher with a single entry is just clutter.

const ICON: Record<string, typeof Stethoscope> = {
  '/doctor': Stethoscope,
  '/patient': UserIcon,
  '/pharmacist': Pill,
  '/laboratory': FlaskConical,
  '/hospital': Building2,
  '/clinic': Building2,
  '/admin': ShieldCheck,
};

export default function DashboardSwitcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const contexts = dashboardContexts(user);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (contexts.length < 2) return null;

  // Which one we are in now, matched on the first path segment so a nested
  // route like /hospital/consultations still resolves to the hospital.
  const base = '/' + (location.pathname.split('/')[1] ?? '');
  const current = contexts.find(c => c.path === base) ?? contexts[0];
  const CurrentIcon = ICON[current.path] ?? Building2;

  const switchTo = (c: DashboardContext) => {
    setOpen(false);
    if (c.path === current.path) return;
    // Remembered, so the next sign-in lands here rather than back at the
    // chooser.
    setActiveContextKey(c.key);
    navigate(c.path);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition ${
          open ? 'bg-gray-100' : 'hover:bg-gray-100'
        }`}
        title="Switch dashboard"
      >
        <CurrentIcon size={15} className="text-primary-600 shrink-0" />
        <span className="hidden sm:block max-w-[9rem] truncate font-medium text-gray-700">
          {current.label}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-100 bg-white shadow-lg z-50 overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Switch dashboard
          </p>
          {contexts.map(c => {
            const Icon = ICON[c.path] ?? Building2;
            const isCurrent = c.path === current.path;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => switchTo(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                  isCurrent ? 'bg-primary-50/60' : 'hover:bg-gray-50'
                }`}
              >
                <Icon size={16} className={isCurrent ? 'text-primary-600' : 'text-gray-400'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{c.label}</span>
                  <span className="block text-[11px] text-gray-500">{c.sublabel}</span>
                </span>
                {isCurrent && <Check size={14} className="text-primary-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
