import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle, FlaskConical, ClipboardList, FolderOpen, Phone, ArrowUpRight, ExternalLink, Search, UserRound } from 'lucide-react';
import { accessRequestApi } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

const TYPE_META: Record<string, { labelKey: string; Icon: any; grad: string }> = {
  lab_reports:      { labelKey:'accessRequests.typeMeta.labReports',      Icon: FlaskConical,  grad:'from-blue-500 to-indigo-600'   },
  medical_history:  { labelKey:'accessRequests.typeMeta.medicalHistory',  Icon: ClipboardList, grad:'from-teal-500 to-emerald-600'  },
  personal_reports: { labelKey:'accessRequests.typeMeta.personalReports', Icon: FolderOpen,    grad:'from-violet-500 to-purple-600' },
  contact_info:     { labelKey:'accessRequests.typeMeta.contactInfo',     Icon: Phone,         grad:'from-rose-500 to-pink-600'     },
};

const STATUS_META: Record<string, { labelKey: string; cls: string; dot: string; Icon: any }> = {
  pending:  { labelKey:'accessRequests.statusMeta.pending',  cls:'bg-amber-100 text-amber-700',     dot:'bg-amber-400',   Icon: Clock         },
  accepted: { labelKey:'accessRequests.statusMeta.accepted', cls:'bg-emerald-100 text-emerald-700',  dot:'bg-emerald-400', Icon: CheckCircle2  },
  declined: { labelKey:'accessRequests.statusMeta.declined', cls:'bg-red-100 text-red-600',          dot:'bg-red-400',     Icon: XCircle       },
};

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function DoctorAccessRequests() {
  const { t } = useTranslation('doctorCore');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debouncedQ = useDebounce(query, 350);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['access-requests'],
    queryFn:  accessRequestApi.getAll,
  });

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['patient-search', debouncedQ],
    queryFn:  () => accessRequestApi.searchPatients(debouncedQ),
    enabled:  debouncedQ.length >= 1,
  });

  const pending  = (requests as any[]).filter((r: any) => r.status === 'pending').length;
  const accepted = (requests as any[]).filter((r: any) => r.status === 'accepted').length;
  const declined = (requests as any[]).filter((r: any) => r.status === 'declined').length;

  if (isLoading) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      {t('dashboard.loading')}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('accessRequests.pageTitle')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('accessRequests.pageSubtitle')}</p>
      </div>

      {/* Patient search */}
      <div className="ios-tile p-4 space-y-3">
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search size={16} strokeWidth={2} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t('dashboard.search.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              ×
            </button>
          )}
        </div>

        {debouncedQ.length >= 1 && (
          <div className="space-y-2">
            {searching ? (
              <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />
                {t('dashboard.search.searching')}
              </div>
            ) : (searchResults as any[]).length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <UserRound size={28} strokeWidth={1.3} className="mx-auto mb-2 text-gray-200" />
                <p className="text-sm">{t('dashboard.search.noResults', { query: debouncedQ })}</p>
              </div>
            ) : (
              (searchResults as any[]).map(pt => {
                const age = calcAge(pt.date_of_birth);
                return (
                  <button
                    key={pt.id}
                    onClick={() => navigate(`/doctor/patients/${pt.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl hover:border-primary-200 hover:bg-primary-50/30 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {pt.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{pt.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{pt.email}</span>
                        {age != null && <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">{t('dashboard.search.yrs', { age })}</span>}
                        {pt.blood_type && <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md">🩸 {pt.blood_type}</span>}
                        {pt.allergies && <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md">⚠️ {t('dashboard.search.allergiesTag')}</span>}
                      </div>
                    </div>
                    <ArrowUpRight size={14} strokeWidth={2.5} className="text-gray-300 shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        )}

        {debouncedQ.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-1">
            {t('accessRequests.searchHint')}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:t('accessRequests.stats.pending'),  value:pending,  grad:'from-amber-500 to-orange-500'   },
          { label:t('accessRequests.stats.accepted'), value:accepted, grad:'from-emerald-500 to-teal-500'   },
          { label:t('accessRequests.stats.declined'), value:declined, grad:'from-red-500 to-rose-500'       },
        ].map(s => (
          <div key={s.label} className="ios-stat-tile relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
            <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3 shadow-sm`}>
              <ArrowUpRight size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Request list */}
      {(requests as any[]).length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} strokeWidth={1.3} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">{t('accessRequests.empty.title')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('accessRequests.empty.subtitle')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as any[]).map((r: any) => {
            const tm = TYPE_META[r.access_type] || TYPE_META.lab_reports;
            const sm = STATUS_META[r.status]    || STATUS_META.pending;
            const Icon = tm.Icon;
            const StatusIcon = sm.Icon;
            return (
              <div key={r.id} className="ios-tile p-4 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tm.grad} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon size={18} strokeWidth={1.8} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{t(tm.labelKey)}</p>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.cls}`}>
                      <StatusIcon size={9} strokeWidth={2.5} />
                      {t(sm.labelKey)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('accessRequests.listItem.patientLabel')} <span className="font-semibold text-gray-700">{r.patient_name}</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t('accessRequests.listItem.sent', { date: fmtDate(r.created_at) })}
                    {r.responded_at ? ` · ${t('accessRequests.listItem.responded', { date: fmtDate(r.responded_at) })}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/doctor/patients/${r.patient_id}`)}
                  className="flex items-center gap-1 text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1.5 rounded-xl hover:bg-primary-100 transition-colors shrink-0"
                >
                  {t('accessRequests.listItem.view')} <ExternalLink size={11} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
