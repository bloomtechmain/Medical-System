import { Link, useNavigate } from 'react-router-dom';
import { Stethoscope, Building2, Pill, FlaskConical, User as UserIcon, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dashboardContexts, setActiveContextKey } from '../constants/dashboards';
import type { DashboardContext } from '../constants/dashboards';

// Requirement 1: shown after login when the account has more than one
// dashboard — typically a doctor who also owns a hospital, or a lab owner who
// is also a registered laboratory user.
//
// Before this, login silently preferred the organisation and the personal
// dashboard became unreachable. Asking is the fix: the user's own role is
// listed first because that is the identity they registered with.

const ICON: Record<string, typeof Stethoscope> = {
  '/doctor': Stethoscope,
  '/patient': UserIcon,
  '/pharmacist': Pill,
  '/laboratory': FlaskConical,
  '/hospital': Building2,
  '/clinic': Building2,
  '/admin': ShieldCheck,
};

// Per-kind accent so a hospital tile doesn't look identical to a doctor tile
// at a glance — purely cosmetic, reuses the same teal family as the rest of
// the product plus a couple of complementary accents.
const ACCENT: Record<string, { bg: string; icon: string; ring: string }> = {
  '/doctor':      { bg: 'bg-primary-50',  icon: 'text-primary-600', ring: 'group-hover:ring-primary-200' },
  '/patient':     { bg: 'bg-primary-50',  icon: 'text-primary-600', ring: 'group-hover:ring-primary-200' },
  '/admin':       { bg: 'bg-primary-50',  icon: 'text-primary-600', ring: 'group-hover:ring-primary-200' },
  '/pharmacist':  { bg: 'bg-purple-50',   icon: 'text-purple-600',  ring: 'group-hover:ring-purple-200' },
  '/laboratory':  { bg: 'bg-cyan-50',     icon: 'text-cyan-600',    ring: 'group-hover:ring-cyan-200' },
  '/hospital':    { bg: 'bg-blue-50',     icon: 'text-blue-600',    ring: 'group-hover:ring-blue-200' },
  '/clinic':      { bg: 'bg-teal-50',     icon: 'text-teal-600',    ring: 'group-hover:ring-teal-200' },
};

export default function ChooseDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const contexts = dashboardContexts(user);

  const choose = (c: DashboardContext) => {
    // Remembered so the next sign-in goes straight there — the chooser should
    // not become a toll gate on every login.
    setActiveContextKey(c.key);
    navigate(c.path, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50/60 via-gray-50 to-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Link to="/welcome" className="flex flex-col items-center gap-2 mb-10">
          <div className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm shadow-primary-600/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12h15m-7.5-7.5v15M9 7.5H6a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 006 19.5h12a1.5 1.5 0 001.5-1.5V9A1.5 1.5 0 0018 7.5h-3" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-900 leading-none">Core Health</p>
            <p className="text-xs text-gray-400">by BloomTech</p>
          </div>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="text-gray-500 text-sm mt-1.5 max-w-sm mx-auto">
            This account has access to more than one dashboard. Which would you like to open?
          </p>
        </div>

        <div className="space-y-3">
          {contexts.map((c, i) => {
            const Icon = ICON[c.path] ?? Building2;
            const accent = ACCENT[c.path] ?? ACCENT['/hospital'];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => choose(c)}
                style={{ animationDelay: `${i * 60}ms` }}
                className="animate-[fadeInUp_0.35s_ease-out_both] group w-full flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg"
              >
                <div className={`w-12 h-12 rounded-xl ${accent.bg} flex items-center justify-center shrink-0 ring-4 ring-transparent transition-all duration-200 ${accent.ring}`}>
                  <Icon className={`w-6 h-6 ${accent.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{c.label}</p>
                  <p className="text-xs text-gray-500">{c.sublabel}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-primary-600 group-hover:translate-x-0.5">
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          You can switch at any time from the menu in the top-right.
        </p>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
