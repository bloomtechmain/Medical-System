import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Stethoscope, FlaskConical, ShieldCheck, ArrowUpRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi, consultationApi, labApi, accessRequestApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

export default function ClinicDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const org = user?.organization;

  const { data: me }                 = useQuery({ queryKey: ['me'],               queryFn: authApi.me });
  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],     queryFn: consultationApi.getAll });
  const { data: labRequests   = [] } = useQuery({ queryKey: ['lab-requests'],      queryFn: labApi.getAll });
  const { data: accessReqs    = [] } = useQuery({ queryKey: ['access-requests'],   queryFn: accessRequestApi.getAll });

  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Doctor';
  const profile   = me?.profile as any;

  const activeConsultations = (consultations as any[]).filter(c => c.status === 'active').length;
  const completedToday      = (consultations as any[]).filter(c =>
    c.status === 'completed' && new Date(c.updated_at).toDateString() === new Date().toDateString()
  ).length;
  const pendingLabs         = (labRequests as any[]).filter(l => l.status === 'pending').length;
  const pendingRequests     = (accessReqs  as any[]).filter(r => r.status === 'pending').length;

  const recentConsultations = (consultations as any[])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const statusColor = (s: string) =>
    s === 'completed' ? 'bg-emerald-100 text-emerald-700' :
    s === 'active'    ? 'bg-teal-100 text-teal-700' :
    'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">

      {/* Welcome banner */}
      <div className="relative bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-800 rounded-2xl p-6 overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-20 translate-x-20" />
        <div className="absolute bottom-0 left-32 w-48 h-48 bg-white/5 rounded-full translate-y-16" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold bg-white/15 border border-white/20 px-2.5 py-0.5 rounded-full">
                🩺 Clinic Portal
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-2">
              {org?.name || 'My Clinic'}
            </h1>
            <p className="text-teal-100 text-sm mt-1">
              Welcome back, Dr. {firstName} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {profile?.specialization && (
              <p className="text-teal-300 text-xs mt-1">{profile.specialization}</p>
            )}
          </div>
          <div className="hidden sm:flex flex-col items-center bg-white/10 rounded-xl p-4 shrink-0">
            <span className="text-4xl">🩺</span>
            <p className="text-xs mt-1 text-teal-200">Clinic</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="relative mt-5 flex flex-wrap gap-2">
          <Link
            to="/clinic/consultations"
            className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
          >
            <Stethoscope size={13} /> New Consultation
          </Link>
          <Link
            to="/clinic/lab-requests"
            className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
          >
            <FlaskConical size={13} /> Lab Requests
          </Link>
          <Link
            to="/clinic/requests"
            className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
          >
            <ShieldCheck size={13} /> Requests
            {pendingRequests > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingRequests}</span>
            )}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active Consultations', value: activeConsultations, icon: Stethoscope, bg: 'bg-teal-50',   text: 'text-teal-600'   },
          { label: 'Completed Today',      value: completedToday,      icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-600' },
          { label: 'Pending Lab Tests',    value: pendingLabs,         icon: FlaskConical, bg: 'bg-purple-50', text: 'text-purple-600' },
          { label: 'Access Requests',      value: pendingRequests,     icon: ShieldCheck,  bg: 'bg-amber-50',  text: 'text-amber-600'  },
        ].map(({ label, value, icon: Icon, bg, text }) => (
          <div key={label} className={`rounded-xl border p-5 ${bg}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${bg} border`}>
              <Icon size={16} className={text} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent consultations */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Consultations</h2>
            <Link to="/clinic/consultations" className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentConsultations.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No consultations yet</div>
            ) : recentConsultations.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/clinic/patients/${c.patient_id}`)}
              >
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center text-sm font-bold text-teal-700 shrink-0">
                  {c.patient_name?.[0]?.toUpperCase() || 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.patient_name || `Patient #${c.patient_id}`}</p>
                  <p className="text-xs text-gray-400 truncate">{c.diagnosis || c.sick_description || 'General consultation'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor(c.status)}`}>{c.status}</span>
                  <span className="text-xs text-gray-400">{formatDate(c.visit_date || c.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Clinic / org info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-lg">🩺</span> Clinic Info
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Name</span>
                <span className="font-medium text-gray-700 text-right max-w-[55%] truncate">{org?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <span className="font-medium text-gray-700 capitalize">{org?.org_type || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Slug</span>
                <span className="font-mono text-xs text-gray-500">{org?.slug || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status</span>
                {org?.is_active
                  ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 size={12} /> Active</span>
                  : <span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><AlertCircle size={12} /> Inactive</span>
                }
              </div>
            </div>
          </div>

          {/* Activity summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> Summary
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Total consultations', value: (consultations as any[]).length, color: 'bg-teal-500' },
                { label: 'Total lab requests',  value: (labRequests  as any[]).length, color: 'bg-purple-500' },
                { label: 'Completed cases',     value: (consultations as any[]).filter((c: any) => c.status === 'completed').length, color: 'bg-emerald-500' },
                { label: 'Dispensed',           value: (consultations as any[]).filter((c: any) => c.status === 'dispensed').length, color: 'bg-blue-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Doctor profile */}
          {profile && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-3">My Profile</h3>
              <div className="space-y-1.5 text-sm">
                {profile.specialization && <p className="text-gray-500">🩺 {profile.specialization}</p>}
                {profile.license_number  && <p className="text-gray-500">🪪 {profile.license_number}</p>}
                {profile.years_experience > 0 && <p className="text-gray-500">📅 {profile.years_experience} yrs experience</p>}
                {profile.consultation_fee > 0  && <p className="text-gray-500">💰 LKR {profile.consultation_fee.toLocaleString()} fee</p>}
                {profile.phone && <p className="text-gray-500">📞 {profile.phone}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
