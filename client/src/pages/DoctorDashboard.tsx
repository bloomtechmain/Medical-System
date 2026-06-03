import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, UserRound, Stethoscope, ArrowUpRight, ChevronDown,
  FlaskConical, Pill, Clock, Activity,
} from 'lucide-react';
import { authApi, accessRequestApi, consultationApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import { useDebounce } from '../hooks/useDebounce';
import { DoctorProfile } from '../types';

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
      <span className="text-sm">Loading history…</span>
    </div>
  );

  return (
    <div className="space-y-4 pt-1">

      {/* Patient vitals row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: '🩸', label: 'Blood Type',  value: patient.blood_type || '—' },
          { icon: '⚠️', label: 'Allergies',   value: patient.allergies  || 'None' },
          { icon: '📋', label: 'Conditions',  value: patient.chronic_conditions || 'None' },
          { icon: '🛡️', label: 'Insurance',   value: patient.insurance_provider || 'None' },
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
          { icon: Activity,    label: 'Visits',    value: stats.total_visits    || 0, color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-100'   },
          { icon: Pill,        label: 'Medicines', value: stats.total_medicines || 0, color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100'   },
          { icon: Stethoscope, label: 'Doctors',   value: stats.total_doctors   || 0, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100'},
          { icon: FlaskConical,label: 'Diagnoses', value: stats.total_diagnoses || 0, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100'},
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
          Consultation History ({consultations.length})
        </p>
        {consultations.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <Clock size={22} strokeWidth={1.3} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">No consultation records found</p>
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
                          <p className="text-[10px] text-blue-600 font-semibold mt-0.5 truncate">Dx: {c.diagnosis}</p>
                        )}
                        {c.doctor_display_name && (
                          <p className="text-[10px] text-gray-400 truncate">Dr. {c.doctor_display_name}</p>
                        )}
                      </div>
                    </div>
                    <ChevronDown size={13} strokeWidth={2.5} className={`text-gray-400 shrink-0 mt-1 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                  </button>

                  {isExp && (
                    <div className="px-3.5 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
                      {[
                        { label: 'Symptoms',  value: c.sick_description,      cls: 'bg-orange-50 border-orange-100 text-orange-800' },
                        { label: 'Diagnosis', value: c.diagnosis,             cls: 'bg-blue-50 border-blue-100 text-blue-800'       },
                        { label: 'Treatment', value: c.treatment_description, cls: 'bg-teal-50 border-teal-100 text-teal-800'       },
                      ].filter(r => r.value).map(({ label, value, cls }) => (
                        <div key={label} className={`rounded-xl border px-3 py-2 ${cls}`}>
                          <p className="text-[9px] font-bold uppercase tracking-wide opacity-60 mb-0.5">{label}</p>
                          <p className="text-xs leading-relaxed">{value}</p>
                        </div>
                      ))}
                      {c.medicines && c.medicines.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Medicines</p>
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
        View Full Profile <ArrowUpRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [query, setQuery] = useState('');
  const [expandedPatientId, setExpandedPatientId] = useState<number | null>(null);
  const debouncedQ = useDebounce(query, 350);

  const { data: me }      = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const { data: requests = [] } = useQuery({ queryKey: ['access-requests'], queryFn: accessRequestApi.getAll });

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['patient-search', debouncedQ],
    queryFn:  () => accessRequestApi.searchPatients(debouncedQ),
    enabled:  debouncedQ.length >= 1,
  });

  const profile   = me?.profile;
  const firstName = me?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Doctor';

  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const accepted        = requests.filter(r => r.status === 'accepted').length;

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
            <p className="text-primary-200 text-sm font-medium">Welcome back,</p>
            <h1 className="text-2xl font-bold mt-0.5">Dr. {firstName}</h1>
            <p className="text-primary-300 text-sm mt-1">
              {profile?.specialization || 'Medical Professional'} · Core Health
            </p>
          </div>
          <div className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 border border-white/20 shrink-0">
            <Stethoscope size={28} strokeWidth={1.5} className="text-white" />
          </div>
        </div>
        <div className="relative flex gap-6 mt-4">
          <div>
            <p className="text-2xl font-bold">{pendingRequests}</p>
            <p className="text-xs text-primary-300">Pending Requests</p>
          </div>
          <div className="w-px bg-white/15" />
          <div>
            <p className="text-2xl font-bold">{accepted}</p>
            <p className="text-xs text-primary-300">Access Granted</p>
          </div>
          {profile?.years_experience && (
            <>
              <div className="w-px bg-white/15" />
              <div>
                <p className="text-2xl font-bold">{profile.years_experience}</p>
                <p className="text-xs text-primary-300">Years Exp.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Specialization" value={profile?.specialization || '—'} color="teal"   />
        <StatTile label="License No."   value={profile?.license_number  || '—'} color="blue"   />
        <StatTile label="Consultation"  value={profile?.consultation_fee ? `LKR ${Number(profile.consultation_fee).toLocaleString()}` : '—'} color="green"  />
        <StatTile label="Affiliation"   value={profile?.hospital_affiliation ? profile.hospital_affiliation.split(' ').slice(0,2).join(' ') + '…' : '—'} color="purple" />
      </div>

      {/* ── Patient Search ── */}
      <div className="ios-tile p-5 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Patient Search</p>
          <p className="text-base font-bold text-gray-900">Find &amp; View Patient Profiles</p>
        </div>

        {/* Search input */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search size={16} strokeWidth={2} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by patient name or email…"
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
                Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <UserRound size={28} strokeWidth={1.3} className="mx-auto mb-2 text-gray-200" />
                <p className="text-sm">No patients found for "<span className="font-medium">{debouncedQ}</span>"</p>
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
                          {age && <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">{age} yrs</span>}
                          {pt.blood_type && <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md">🩸 {pt.blood_type}</span>}
                          {pt.allergies && <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md">⚠️ Allergies</span>}
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
            Start typing to search across all registered patients — click a result to view their history
          </p>
        )}
      </div>

      {/* Doctor profile */}
      <div className="ios-tile p-5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Professional Profile</p>
        <div className="space-y-3">
          {[
            { label: 'Full Name',     value: me?.name },
            { label: 'Email',         value: me?.email },
            { label: 'Phone',         value: profile?.phone },
            { label: 'License No.',  value: profile?.license_number },
            { label: 'Medical School',value: profile?.medical_school },
            { label: 'Affiliation',  value: profile?.hospital_affiliation },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-400 w-36 shrink-0">{label}</span>
              <span className="text-gray-900 font-semibold text-right">{value || <span className="text-gray-300">—</span>}</span>
            </div>
          ))}
        </div>
        {profile?.bio && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Bio</p>
            <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}
