import { useNavigate } from 'react-router-dom';
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="text-gray-500 text-sm mt-1">
            This account has access to more than one dashboard. Which would you like to open?
          </p>
        </div>

        <div className="space-y-3">
          {contexts.map(c => {
            const Icon = ICON[c.path] ?? Building2;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => choose(c)}
                className="w-full flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-primary-400 hover:shadow-sm"
              >
                <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{c.label}</p>
                  <p className="text-xs text-gray-500">{c.sublabel}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          You can switch at any time from the menu in the top-right.
        </p>
      </div>
    </div>
  );
}
