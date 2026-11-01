import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Stethoscope, FlaskConical, ShieldCheck, ArrowUpRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi, consultationApi, labApi, accessRequestApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate, firstNameOf } from '../utils/helpers';
import OrgRequestsAlert from '../components/dashboard/OrgRequestsAlert';
import DashboardWelcome, { WelcomeStats, welcomeAction } from '../components/dashboard/DashboardWelcome';

export default function ClinicDashboard() {
  const { t } = useTranslation('doctorCore');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const org = user?.organization;

  const { data: me }                 = useQuery({ queryKey: ['me'],               queryFn: authApi.me });
  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],     queryFn: consultationApi.getAll });
  const { data: labRequests   = [] } = useQuery({ queryKey: ['lab-requests'],      queryFn: labApi.getAll });
  const { data: accessReqs    = [] } = useQuery({ queryKey: ['access-requests'],   queryFn: accessRequestApi.getAll });

  const firstName = firstNameOf(me?.name || user?.name, 'Doctor');
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
      <DashboardWelcome
        role="org"
        eyebrow={t('clinicDashboard.badge')}
        title={org?.name || t('clinicDashboard.defaultName')}
        subtitle={
          <>
            {t('dashboard.welcomeBack', { name: firstName })} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {profile?.specialization && <span className="block text-white/50 text-sm mt-1">{profile.specialization}</span>}
          </>
        }
        actions={
          <>
            <Link to="/clinic/consultations" className={welcomeAction}>
              <Stethoscope size={15} strokeWidth={2} /> {t('dashboard.actions.newConsultation')}
            </Link>
            <Link to="/clinic/lab-requests" className={welcomeAction}>
              <FlaskConical size={15} strokeWidth={2} /> {t('dashboard.actions.labRequests')}
            </Link>
            <Link to="/clinic/requests" className={welcomeAction}>
              <ShieldCheck size={15} strokeWidth={2} /> {t('clinicDashboard.actions.requests')}
              {pendingRequests > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingRequests}</span>
              )}
            </Link>
          </>
        }
      >
        <WelcomeStats
          items={[
            { label: t('clinicDashboard.stats.activeConsultations'), value: activeConsultations },
            { label: t('clinicDashboard.stats.completedToday'),      value: completedToday },
            { label: t('dashboard.stats.pendingLabTests'),           value: pendingLabs },
            { label: t('dashboard.stats.accessRequests'),            value: pendingRequests },
          ]}
        />
      </DashboardWelcome>

      <OrgRequestsAlert orgId={org?.id} basePath="/clinic" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent consultations */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('dashboard.recentConsultations.title')}</h2>
            <Link to="/clinic/consultations" className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
              {t('dashboard.recentConsultations.viewAll')} <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentConsultations.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">{t('dashboard.recentConsultations.empty')}</div>
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
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.patient_name || t('dashboard.recentConsultations.patientFallback', { id: c.patient_id })}</p>
                  <p className="text-xs text-gray-400 truncate">{c.diagnosis || c.sick_description || t('dashboard.recentConsultations.generalConsultation')}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor(c.status)}`}>{tc(`status.${c.status}`, { defaultValue: c.status })}</span>
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
              <span className="text-lg">🩺</span> {t('clinicDashboard.info.title')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('dashboard.info.name')}</span>
                <span className="font-medium text-gray-700 text-right max-w-[55%] truncate">{org?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('dashboard.info.type')}</span>
                <span className="font-medium text-gray-700 capitalize">{org?.org_type || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('dashboard.info.slug')}</span>
                <span className="font-mono text-xs text-gray-500">{org?.slug || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">{t('dashboard.info.status')}</span>
                {org?.is_active
                  ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 size={12} /> {t('dashboard.info.active')}</span>
                  : <span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><AlertCircle size={12} /> {t('dashboard.info.inactive')}</span>
                }
              </div>
            </div>
          </div>

          {/* Activity summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> {t('clinicDashboard.summary.title')}
            </h3>
            <div className="space-y-3">
              {[
                { label: t('clinicDashboard.summary.totalConsultations'), value: (consultations as any[]).length, color: 'bg-teal-500' },
                { label: t('clinicDashboard.summary.totalLabRequests'),  value: (labRequests  as any[]).length, color: 'bg-purple-500' },
                { label: t('clinicDashboard.summary.completedCases'),     value: (consultations as any[]).filter((c: any) => c.status === 'completed').length, color: 'bg-emerald-500' },
                { label: t('clinicDashboard.summary.dispensed'),           value: (consultations as any[]).filter((c: any) => c.status === 'dispensed').length, color: 'bg-blue-500' },
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
              <h3 className="font-semibold text-gray-900 mb-3">{t('dashboard.profile.title')}</h3>
              <div className="space-y-1.5 text-sm">
                {profile.specialization && <p className="text-gray-500">🩺 {profile.specialization}</p>}
                {profile.license_number  && <p className="text-gray-500">🪪 {profile.license_number}</p>}
                {profile.years_experience > 0 && <p className="text-gray-500">📅 {t('clinicDashboard.profile.yearsExpShort', { count: profile.years_experience })}</p>}
                {profile.consultation_fee > 0  && <p className="text-gray-500">💰 {t('clinicDashboard.profile.fee', { amount: profile.consultation_fee.toLocaleString() })}</p>}
                {profile.phone && <p className="text-gray-500">📞 {profile.phone}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
