import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Stethoscope, ArrowUpRight, ChevronDown, FlaskConical, Pill, Clock, Activity } from 'lucide-react';
import { consultationApi } from '../../services/api';
import { formatDate } from '../../utils/helpers';

// A patient's vitals summary, visit stats and consultation timeline, shown
// inline under a patient row (My Patients page and patient search).

interface PatientHistoryPanelProps {
  patientId: number;
  patient: any;
  onViewProfile: () => void;
}

// ── Inline patient history panel ──────────────────────────────────────────────
export default function PatientHistoryPanel({ patientId, patient, onViewProfile }: PatientHistoryPanelProps) {
  const { t } = useTranslation('doctorCore');
  const { data, isLoading } = useQuery({
    queryKey: ['patient-history', patientId],
    queryFn:  () => consultationApi.getPatientHistory(patientId),
    enabled:  !!patientId,
  });

  // The history response carries the full profile; a row from the doctor's
  // own patient list only has a name, so prefer the fetched one.
  patient = { ...patient, ...((data as any)?.patient || {}) };
  const consultations: any[] = (data as any)?.consultations || [];
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
                            {c.medicines.map((m: any) => (
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
