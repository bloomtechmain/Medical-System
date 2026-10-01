import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Search, UserRound, Stethoscope, ArrowUpRight, ChevronDown,
  FlaskConical, Pill, Clock, Activity, Plus, AlertTriangle, Send, Eye, Users,
} from 'lucide-react';
import { authApi, accessRequestApi, consultationApi, labApi, labViewRequestApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/helpers';
import { useDebounce } from '../hooks/useDebounce';

const daysSince = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
};

const waitColor = (days: number): string => {
  if (days >= 7) return 'bg-red-100 text-red-700';
  if (days >= 3) return 'bg-orange-100 text-orange-700';
  return 'bg-amber-100 text-amber-700';
};

const STAT_THEMES: Record<string, string> = {
  blue:   'from-blue-500 to-indigo-600',
  teal:   'from-teal-500 to-emerald-600',
  purple: 'from-violet-500 to-purple-600',
  green:  'from-emerald-500 to-green-600',
};

interface StatTileProps {
  label: string;
  value: string;
  color: string;
}

function StatTile({ label, value, color }: StatTileProps) {
  const grad = STAT_THEMES[color] || STAT_THEMES.teal;
  return (
    <div className="ios-stat-tile relative overflow-hidden">
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${grad} opacity-10`} />
      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center mb-3 shadow-lg`}>
        <ArrowUpRight size={16} strokeWidth={2.5} className="text-white" />
      </div>
      <p className="text-3xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{label}</p>
    </div>
  );
}

interface PatientHistoryPanelProps {
  patientId: number;
  patient: any;
  onViewProfile: () => void;
}

// ── Inline patient history panel ──────────────────────────────────────────────
function PatientHistoryPanel({ patientId, patient, onViewProfile }: PatientHistoryPanelProps) {
  const { t } = useTranslation('doctorCore');
  const { data, isLoading } = useQuery({
    queryKey: ['patient-history', patientId],
    queryFn:  () => consultationApi.getPatientHistory(patientId),
    enabled:  !!patientId,
  });

  const consultations = (data as any)?.consultations || [];
  const stats         = (data as any)?.stats || {};

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
      <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />
      <span className="text-sm">{t('doctorDashboard.history.loading')}</span>
    </div>
  );

  return (
    <div className="space-y-4 pt-1">

      {/* Patient vitals row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: '🩸', label: t('doctorDashboard.history.bloodType'),  value: patient.blood_type || '—' },
          { icon: '⚠️', label: t('doctorDashboard.history.allergies'),   value: patient.allergies  || t('doctorDashboard.history.none') },
          { icon: '📋', label: t('doctorDashboard.history.conditions'),  value: patient.chronic_conditions || t('doctorDashboard.history.none') },
          { icon: '🛡️', label: t('doctorDashboard.history.insurance'),   value: patient.insurance_provider || t('doctorDashboard.history.none') },
        ].map(({ icon, label, value }) => (
          <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{icon} {label}</p>
            <p className="text-xs font-bold text-gray-800 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: Activity,    label: t('doctorDashboard.history.visits'),    value: stats.total_visits    || 0, color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-100'   },
          { icon: Pill,        label: t('doctorDashboard.history.medicines'), value: stats.total_medicines || 0, color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100'   },
          { icon: Stethoscope, label: t('doctorDashboard.history.doctors'),   value: stats.total_doctors   || 0, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100'},
          { icon: FlaskConical,label: t('doctorDashboard.history.diagnoses'), value: stats.total_diagnoses || 0, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100'},
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className={`rounded-xl border px-3 py-2.5 ${bg} text-center`}>
            <Icon size={14} strokeWidth={2} className={`${color} mx-auto mb-1`} />
            <p className={`text-lg font-bold ${color} leading-none`}>{value}</p>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Consultation timeline */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          {t('doctorDashboard.history.timelineTitle', { count: consultations.length })}
        </p>
        {consultations.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <Clock size={22} strokeWidth={1.3} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">{t('doctorDashboard.history.timelineEmpty')}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {consultations.map((c, i) => {
              const isExp = expandedIdx === i;
              const isDr  = !!c.doctor_id;
              return (
                <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(isExp ? null : i)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-white/70 transition-colors flex items-start justify-between gap-2"
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs mt-0.5 ${
                        isDr ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isDr ? '🩺' : '📝'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-gray-800">{formatDate(c.visit_date)}</p>
                          {c.status && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              c.status === 'dispensed' ? 'bg-green-100 text-green-700' :
                              c.status === 'active'    ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{c.status}</span>
                          )}
                        </div>
                        {c.diagnosis && (
                          <p className="text-[10px] text-blue-600 font-semibold mt-0.5 truncate">{t('doctorDashboard.history.dxPrefix', { diagnosis: c.diagnosis })}</p>
                        )}
                        {c.doctor_display_name && (
                          <p className="text-[10px] text-gray-400 truncate">{t('doctorDashboard.history.doctorPrefix', { name: c.doctor_display_name })}</p>
                        )}
                      </div>
                    </div>
                    <ChevronDown size={13} strokeWidth={2.5} className={`text-gray-400 shrink-0 mt-1 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                  </button>

                  {isExp && (
                    <div className="px-3.5 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
                      {[
                        { label: t('doctorDashboard.history.symptoms'),  value: c.sick_description,      cls: 'bg-orange-50 border-orange-100 text-orange-800' },
                        { label: t('doctorDashboard.history.diagnosis'), value: c.diagnosis,             cls: 'bg-blue-50 border-blue-100 text-blue-800'       },
                        { label: t('doctorDashboard.history.treatment'), value: c.treatment_description, cls: 'bg-teal-50 border-teal-100 text-teal-800'       },
                      ].filter(r => r.value).map(({ label, value, cls }) => (
                        <div key={label} className={`rounded-xl border px-3 py-2 ${cls}`}>
                          <p className="text-[9px] font-bold uppercase tracking-wide opacity-60 mb-0.5">{label}</p>
                          <p className="text-xs leading-relaxed">{value}</p>
                        </div>
                      ))}
                      {c.medicines && c.medicines.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{t('doctorDashboard.history.medicines')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.medicines.map(m => (
                              <span key={m.id} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full pl-2 pr-2.5 py-0.5 text-[10px] font-semibold text-gray-700">
                                💊 {m.medicine_name}{m.dosage ? ` · ${m.dosage}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View full profile button */}
      <button
        onClick={onViewProfile}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-primary-600 border border-primary-200 bg-primary-50 rounded-2xl hover:bg-primary-100 transition-colors"
      >
        {t('doctorDashboard.history.viewFullProfile')} <ArrowUpRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DoctorDashboard() {
  const { t } = useTranslation('doctorCore');
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [query, setQuery] = useState('');
  const [expandedPatientId, setExpandedPatientId] = useState<number | null>(null);
  const debouncedQ = useDebounce(query, 350);

  const { data: me }      = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: requests = [] } = useQuery({ queryKey: ['access-requests'], queryFn: accessRequestApi.getAll });
  const { data: labRequests = [] } = useQuery({ queryKey: ['lab-requests'], queryFn: labApi.getAll });
  const { data: labViewRequests = [] } = useQuery({ queryKey: ['lab-view-requests'], queryFn: labViewRequestApi.getAll });
  const { data: consultations = [] } = useQuery({ queryKey: ['doctor-consultations'], queryFn: consultationApi.getAll });

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['patient-search', debouncedQ],
    queryFn:  () => accessRequestApi.searchPatients(debouncedQ),
    enabled:  debouncedQ.length >= 1,
  });

  const profile   = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Doctor';

  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const accepted        = requests.filter(r => r.status === 'accepted').length;

  const pendingLabResults = (labRequests as any[])
    .filter((r: any) => r.status !== 'completed')
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const agingConsultations = (consultations as any[])
    .filter((c: any) => c.status === 'active')
    .sort((a: any, b: any) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime());

  const pendingAccessRequests = (requests as any[]).filter((r: any) => r.status === 'pending');
  const pendingViewRequests   = (labViewRequests as any[]).filter((r: any) => r.status === 'pending');

  const recentActivity = [
    ...(labRequests as any[]).filter((r: any) => r.status === 'completed').map((r: any) => ({
      at: r.updated_at || r.created_at, icon: '🧪',
      title: t('doctorDashboard.recent.labResultReady', { name: r.patient_name }), sub: r.test_description,
    })),
    ...(consultations as any[]).filter((c: any) => c.status === 'dispensed').map((c: any) => ({
      at: c.updated_at || c.visit_date, icon: '💊',
      title: t('doctorDashboard.recent.prescriptionDispensed', { name: c.patient_name }), sub: c.pharmacy_name,
    })),
    ...(requests as any[]).filter((r: any) => r.status !== 'pending' && r.responded_at).map((r: any) => ({
      at: r.responded_at, icon: r.status === 'accepted' ? '✅' : '❌',
      title: t('doctorDashboard.recent.accessRequestResponse', { name: r.patient_name, status: r.status }), sub: r.access_type?.replace('_', ' '),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  const recentPatients = Object.values(
    (consultations as any[]).reduce((acc: Record<number, any>, c: any) => {
      if (!acc[c.patient_id] || new Date(c.visit_date) > new Date(acc[c.patient_id].visit_date)) {
        acc[c.patient_id] = c;
      }
      return acc;
    }, {})
  )
    .sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
    .slice(0, 6);

  function calcAge(dob: string | null | undefined): number | null {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  const handlePatientClick = (patientId: number) => {
    setExpandedPatientId(prev => prev === patientId ? null : patientId);
  };

  return (
    <div className="space-y-6 p-4 md:p-0">

      {/* Welcome banner */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 rounded-2xl p-5 md:p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-primary-200 text-sm font-medium">{t('doctorDashboard.welcome.greeting')}</p>
            <h1 className="text-2xl font-bold mt-0.5">{t('doctorDashboard.welcome.namePrefix', { name: firstName })}</h1>
            <p className="text-primary-300 text-sm mt-1">
              {profile?.specialization || t('doctorDashboard.welcome.defaultSpecialization')} · Core Health
            </p>
          </div>
          <div className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 border border-white/20 shrink-0">
            <Stethoscope size={28} strokeWidth={1.5} className="text-white" />
          </div>
        </div>
        <div className="relative flex gap-6 mt-4">
          <div>
            <p className="text-2xl font-bold">{pendingRequests}</p>
            <p className="text-xs text-primary-300">{t('doctorDashboard.welcome.pendingRequests')}</p>
          </div>
          <div className="w-px bg-white/15" />
          <div>
            <p className="text-2xl font-bold">{accepted}</p>
            <p className="text-xs text-primary-300">{t('doctorDashboard.welcome.accessGranted')}</p>
          </div>
          {profile?.years_experience && (
            <>
              <div className="w-px bg-white/15" />
              <div>
                <p className="text-2xl font-bold">{profile.years_experience}</p>
                <p className="text-xs text-primary-300">{t('doctorDashboard.welcome.yearsExp')}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t('doctorDashboard.stats.specialization')} value={profile?.specialization || '—'} color="teal"   />
        <StatTile label={t('doctorDashboard.stats.licenseNo')}   value={profile?.license_number  || '—'} color="blue"   />
        <StatTile label={t('doctorDashboard.stats.consultationFee')}  value={profile?.consultation_fee ? `LKR ${Number(profile.consultation_fee).toLocaleString()}` : '—'} color="green"  />
        <StatTile label={t('doctorDashboard.stats.affiliation')}   value={profile?.hospital_affiliation ? profile.hospital_affiliation.split(' ').slice(0,2).join(' ') + '…' : '—'} color="purple" />
      </div>

      {/* ── Quick Actions ── */}
      <div className="ios-tile p-4 flex flex-wrap gap-2">
        <button
          onClick={() => navigate('/doctor/consultations', { state: { autoOpen: true } })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.newConsultation')}
        </button>
        <button
          onClick={() => navigate('/doctor/lab-requests', { state: { autoOpen: true } })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-2xl hover:bg-primary-100 transition-colors"
        >
          <FlaskConical size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.newLabRequest')}
        </button>
        <button
          onClick={() => navigate('/doctor/requests')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-gray-100 transition-colors"
        >
          <Send size={15} strokeWidth={2.5} /> {t('doctorDashboard.quickActions.viewRequests')}
        </button>
      </div>

      {/* ── Operational Alerts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <FlaskConical size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.pendingLabResults')}
          </p>
          {pendingLabResults.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingLabResults')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingLabResults.slice(0, 6).map((r: any) => {
                const d = daysSince(r.created_at);
                return (
                  <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.test_description} · {r.lab_name || t('doctorDashboard.alerts.labFallback')}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${waitColor(d)}`}>{t('doctorDashboard.alerts.waitingDays', { count: d })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.activeConsultationsAging')}
          </p>
          {agingConsultations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noAgingConsultations')}</p>
          ) : (
            <ul className="space-y-2">
              {agingConsultations.slice(0, 6).map((c: any) => {
                const d = daysSince(c.visit_date);
                return (
                  <li key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{c.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.diagnosis || t('doctorDashboard.alerts.noDiagnosisRecorded')}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${waitColor(d)}`}>{t('doctorDashboard.alerts.activeDays', { count: d })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Send size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.accessRequestsAwaitingPatient')}
          </p>
          {pendingAccessRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingAccessRequests')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingAccessRequests.slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 truncate capitalize">{r.access_type?.replace('_', ' ')}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('doctorDashboard.alerts.daysAgo', { count: daysSince(r.created_at) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Eye size={12} strokeWidth={2.5} /> {t('doctorDashboard.alerts.reportViewRequestsAwaitingPatient')}
          </p>
          {pendingViewRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.alerts.noPendingViewRequests')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingViewRequests.slice(0, 6).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 truncate">{r.test_description} · {r.lab_name || t('doctorDashboard.alerts.labFallback')}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('doctorDashboard.alerts.daysAgo', { count: daysSince(r.created_at) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Patient Search ── */}
      <div className="ios-tile p-5 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{t('doctorDashboard.search.title')}</p>
          <p className="text-base font-bold text-gray-900">{t('doctorDashboard.search.subtitle')}</p>
        </div>

        {/* Search input */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search size={16} strokeWidth={2} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t('dashboard.search.placeholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setExpandedPatientId(null); }}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
          />
          {query && (
            <button onClick={() => { setQuery(''); setExpandedPatientId(null); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              ×
            </button>
          )}
        </div>

        {/* Results */}
        {debouncedQ.length >= 1 && (
          <div className="space-y-2">
            {searching ? (
              <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />
                {t('dashboard.search.searching')}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <UserRound size={28} strokeWidth={1.3} className="mx-auto mb-2 text-gray-200" />
                <p className="text-sm">{t('dashboard.search.noResults', { query: debouncedQ })}</p>
              </div>
            ) : (
              searchResults.map(pt => {
                const age        = calcAge(pt.date_of_birth);
                const isExpanded = expandedPatientId === pt.id;
                return (
                  <div key={pt.id} className={`border rounded-2xl transition-all overflow-hidden ${
                    isExpanded
                      ? 'border-primary-200 bg-primary-50/20'
                      : 'border-gray-100 bg-gray-50 hover:border-primary-200 hover:bg-primary-50/30'
                  }`}>
                    {/* Patient row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => handlePatientClick(pt.id)}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {pt.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{pt.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-400">{pt.email}</span>
                          {age && <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">{t('dashboard.search.yrs', { age })}</span>}
                          {pt.blood_type && <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md">🩸 {pt.blood_type}</span>}
                          {pt.allergies && <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md">⚠️ {t('dashboard.search.allergiesTag')}</span>}
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <ChevronDown
                        size={16}
                        strokeWidth={2.5}
                        className={`text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-primary-500' : ''}`}
                      />
                    </div>

                    {/* Expanded history panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-primary-100/60">
                        <PatientHistoryPanel
                          patientId={pt.id}
                          patient={pt}
                          onViewProfile={() => navigate(`/doctor/patients/${pt.id}`)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {debouncedQ.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">
            {t('doctorDashboard.search.hint')}
          </p>
        )}
      </div>

      {/* ── Recently Seen Patients + Activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Users size={12} strokeWidth={2.5} /> {t('doctorDashboard.recent.seenPatients')}
          </p>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.recent.noConsultations')}</p>
          ) : (
            <ul className="space-y-2">
              {recentPatients.map((c: any) => (
                <li key={c.patient_id}>
                  <button
                    onClick={() => navigate(`/doctor/patients/${c.patient_id}`)}
                    className="w-full flex items-center gap-3 text-left py-1.5 hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {c.patient_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{c.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate">{formatDate(c.visit_date)}{c.diagnosis ? ` · ${c.diagnosis}` : ''}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ios-tile p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Activity size={12} strokeWidth={2.5} /> {t('doctorDashboard.recent.activity')}
          </p>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('doctorDashboard.recent.noActivity')}</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-base shrink-0">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 truncate">{a.sub}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400">{formatDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Doctor profile */}
      <div className="ios-tile p-5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">{t('doctorDashboard.profile.title')}</p>
        <div className="divide-y divide-gray-100">
          {(() => {
            const fields = [
              { label: t('doctorDashboard.profile.fullName'),      value: me?.name },
              { label: t('doctorDashboard.profile.email'),          value: me?.email },
              { label: t('doctorDashboard.profile.phone'),          value: profile?.phone },
              { label: t('doctorDashboard.profile.licenseNo'),    value: profile?.license_number },
              { label: t('doctorDashboard.profile.medicalSchool'), value: profile?.medical_school },
              { label: t('doctorDashboard.profile.affiliation'),    value: profile?.hospital_affiliation },
            ];
            const rows = [];
            for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
            return rows.map((row, i) => (
              <div key={i} className={`grid gap-x-6 divide-x divide-gray-100 py-2.5 first:pt-0 last:pb-0 ${row.length === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                {row.map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm gap-3 min-w-0 pl-3 first:pl-0">
                    <span className="text-gray-400 shrink-0">{label}</span>
                    <span className="text-gray-900 font-semibold text-right truncate">{value || <span className="text-gray-300">—</span>}</span>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
        {profile?.bio && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('doctorDashboard.profile.bio')}</p>
            <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}
