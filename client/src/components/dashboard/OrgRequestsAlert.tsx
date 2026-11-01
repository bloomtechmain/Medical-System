import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, ArrowRight } from 'lucide-react';
import { orgMembershipRequestApi } from '../../services/api';

// Hospital/clinic dashboards: the decisions waiting on the owner. Doctor
// certifications (migration 015) are time-sensitive — a new doctor cannot be
// approved until the owner answers — so they are surfaced on the home page,
// not only on the Team page where nobody would look unprompted.
export default function OrgRequestsAlert({ orgId, basePath }: { orgId?: number; basePath: '/hospital' | '/clinic' }) {
  const { data: requests = [] } = useQuery({
    queryKey: ['org-membership-requests', orgId],
    queryFn: () => orgMembershipRequestApi.forOrg(orgId as number),
    enabled: !!orgId,
    // Only the owner may list these; for other members it is simply absent.
    retry: false,
  });

  const pending = (requests as any[]).filter(r => r.kind === 'join' && r.status === 'pending');
  const certify = pending.filter(r => r.is_registration);
  const channeling = pending.filter(r => !r.is_registration);
  if (!certify.length && !channeling.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {certify.length > 0 && (
        <Link to={`${basePath}/team#certify`}
          className="group flex items-center gap-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-4 hover:shadow-md transition-shadow">
          <span className="w-11 h-11 shrink-0 rounded-xl bg-sky-600 text-white flex items-center justify-center">
            <BadgeCheck size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-gray-900">
              {certify.length} doctor{certify.length === 1 ? '' : 's'} waiting for your certification
            </span>
            <span className="block text-xs text-gray-500 truncate">
              {certify.slice(0, 3).map(r => `Dr. ${r.doctor_name}`).join(', ')}{certify.length > 3 ? '…' : ''} — their registration is on hold until you respond.
            </span>
          </span>
          <ArrowRight size={16} className="text-sky-600 shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
      {channeling.length > 0 && (
        <Link to={`${basePath}/team`}
          className="group flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 hover:shadow-md transition-shadow">
          <span className="w-11 h-11 shrink-0 rounded-xl bg-amber-500 text-white flex items-center justify-center">
            <CalendarClock size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-gray-900">
              {channeling.length} channeling request{channeling.length === 1 ? '' : 's'}
            </span>
            <span className="block text-xs text-gray-500">Doctors asking to start channeling here.</span>
          </span>
          <ArrowRight size={16} className="text-amber-600 shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}
