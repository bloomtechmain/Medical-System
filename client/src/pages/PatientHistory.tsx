import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { consultationApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';

function useDebounce(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

interface StatProps {
  icon: string;
  label: string;
  value: number;
  color: string;
}

function Stat({ icon, label, value, color }: StatProps) {
  const bg: Record<string, string> = { teal:'bg-teal-50 border-teal-100', blue:'bg-blue-50 border-blue-100', purple:'bg-purple-50 border-purple-100', orange:'bg-orange-50 border-orange-100' };
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <span className="text-2xl">{icon}</span>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

interface MedPillProps {
  m: any;
}

function MedPill({ m }: MedPillProps) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1 text-xs shadow-sm">
      <span className="text-sm">💊</span>
      <span className="font-semibold text-gray-800">{m.medicine_name}</span>
      {m.dosage    && <span className="text-gray-400">·&nbsp;{m.dosage}</span>}
      {m.frequency && <span className="text-gray-400">·&nbsp;{m.frequency}</span>}
      {m.duration  && <span className="text-gray-400">·&nbsp;{m.duration}</span>}
    </div>
  );
}

interface TimelineEntryProps {
  c: any;
  index: number;
}

function TimelineEntry({ c, index }: TimelineEntryProps) {
  const [expanded, setExpanded] = useState(index === 0);

  const STATUS_COLOR: Record<string, string> = { active:'bg-yellow-100 text-yellow-700', dispensed:'bg-green-100 text-green-700', completed:'bg-gray-100 text-gray-500' };
  const isDoctorCreated = !!c.doctor_id;

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 z-10
          ${isDoctorCreated ? 'bg-teal-100 border-teal-400 text-teal-700' : 'bg-blue-100 border-blue-300 text-blue-600'}`}>
          <span className="text-sm">{isDoctorCreated ? '🩺' : '📝'}</span>
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1" />
      </div>

      {/* Card */}
      <div className="flex-1 pb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header — always visible */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-gray-900">{formatDate(c.visit_date)}</p>
                  {c.status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status]}`}>
                      {c.status}
                    </span>
                  )}
                  {isDoctorCreated && (
                    <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                      By Doctor
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                  {c.doctor_display_name && (
                    <span>🩺 Dr. {c.doctor_display_name}{c.doctor_specialization ? ` — ${c.doctor_specialization}` : ''}</span>
                  )}
                  {c.hospital_clinic && <span>· 🏥 {c.hospital_clinic}</span>}
                  {c.pharmacy_name   && <span>· 💊 {c.pharmacy_name}</span>}
                </div>
                {c.diagnosis && (
                  <p className="text-xs text-blue-700 font-semibold mt-1">Dx: {c.diagnosis}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.medicines?.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    💊 {c.medicines.length}
                  </span>
                )}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>

          {/* Expanded body */}
          {expanded && (
            <div className="px-4 pb-4 border-t border-gray-50 space-y-3 pt-3">
              {[
                { label: 'Symptoms',  value: c.sick_description,      icon: '🤒', color: 'bg-orange-50 border-orange-100 text-orange-900' },
                { label: 'Diagnosis', value: c.diagnosis,             icon: '🔬', color: 'bg-blue-50   border-blue-100   text-blue-900'   },
                { label: 'Treatment', value: c.treatment_description, icon: '💉', color: 'bg-teal-50   border-teal-100   text-teal-900'   },
              ].filter(r => r.value).map(({ label, value, icon, color }) => (
                <div key={label} className={`rounded-lg border px-3 py-2.5 ${color}`}>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-60 mb-0.5">{icon} {label}</p>
                  <p className="text-sm">{value}</p>
                </div>
              ))}

              {c.medicines?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Prescribed Medicines</p>
                  <div className="flex flex-wrap gap-2">
                    {c.medicines.map((m: any) => <MedPill key={m.id} m={m} />)}
                  </div>
                </div>
              )}

              {!c.doctor_display_name && !c.sick_description && !c.medicines?.length && (
                <p className="text-xs text-gray-400 italic">No additional details recorded.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PatientSearchProps {
  onSelect: (patient: any) => void;
}

function PatientSearch({ onSelect }: PatientSearchProps) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-patients-history', dq],
    queryFn:  () => userApi.searchPatients(dq),
    enabled:  dq.length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          className="input pl-11 pr-4 py-3 text-base shadow-sm"
          placeholder="Search patient by name or email..."
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && (
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {open && dq.length >= 1 && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-60 overflow-y-auto">
          {(results as any[]).length === 0 && !isFetching ? (
            <li className="px-4 py-3 text-sm text-gray-400">No patients found for "{dq}"</li>
          ) : (results as any[]).map((p: any) => (
            <li key={p.id}
              onClick={() => { onSelect(p); setOpen(false); setQ(''); }}
              className="px-4 py-3 hover:bg-primary-50 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.email}
                  {p.blood_type ? ` · Blood: ${p.blood_type}` : ''}
                  {p.gender     ? ` · ${p.gender.charAt(0).toUpperCase() + p.gender.slice(1)}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PatientHistory() {
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-history', selectedPatient?.id],
    queryFn:  () => consultationApi.getPatientHistory(selectedPatient.id),
    enabled:  !!selectedPatient,
  });

  const patient       = data?.patient;
  const consultations: any[] = data?.consultations || [];
  const stats         = data?.stats || {};

  // Group diagnoses for the sickness summary
  const sicknessLog = consultations
    .filter((c: any) => c.diagnosis || c.sick_description)
    .map((c: any) => ({ date: c.visit_date, diagnosis: c.diagnosis, symptoms: c.sick_description, doctor: c.doctor_display_name }));

  // Unique medicines the patient has received
  const allMedNames = [...new Set(
    consultations.flatMap((c: any) => (c.medicines || []).map((m: any) => m.medicine_name))
  )];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patient History</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Search any registered patient to view their full medical history, diagnoses, and prescriptions
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Find Patient</p>
        <PatientSearch onSelect={setSelectedPatient} />

        {selectedPatient && (
          <div className="mt-3 flex items-center justify-between bg-primary-50 rounded-xl px-4 py-2.5 border border-primary-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary-200 text-primary-800 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedPatient.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-800">{selectedPatient.name}</p>
                <p className="text-xs text-primary-600">{selectedPatient.email}</p>
              </div>
            </div>
            <button onClick={() => setSelectedPatient(null)}
              className="text-xs text-primary-600 hover:text-red-500 font-medium px-2 py-1 rounded-lg hover:bg-white transition-colors">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="animate-spin h-7 w-7 mx-auto mb-3 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading patient history...
        </div>
      )}

      {/* No patient selected */}
      {!selectedPatient && !isLoading && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-14 text-center">
          <span className="text-5xl block mb-4">🔍</span>
          <p className="text-gray-600 font-semibold">Search for a patient above</p>
          <p className="text-sm text-gray-400 mt-1">
            View complete medical history, all past diagnoses, and medicines received from any doctor.
          </p>
        </div>
      )}

      {/* Patient data */}
      {data && patient && (
        <>
          {/* Patient info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold">
                    {patient.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{patient.name}</h2>
                    <p className="text-primary-200 text-sm">{patient.email}</p>
                    <p className="text-primary-200 text-xs mt-0.5">
                      {patient.phone && `📞 ${patient.phone}`}
                      {patient.date_of_birth && ` · DOB: ${formatDate(patient.date_of_birth)}`}
                      {patient.gender && ` · ${patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Health flags */}
            <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-gray-100">
              {[
                { label: 'Blood Type',  value: patient.blood_type || 'Unknown',    icon: '🩸', alert: false },
                { label: 'Allergies',   value: patient.allergies  || 'None known', icon: '⚠️', alert: !!(patient.allergies && patient.allergies.toLowerCase() !== 'none') },
                { label: 'Conditions',  value: patient.chronic_conditions || 'None', icon: '📋', alert: false },
                { label: 'Insurance',   value: patient.insurance_provider  || 'None', icon: '🛡️', alert: false },
              ].map(({ label, value, icon, alert }) => (
                <div key={label} className={`rounded-lg p-3 ${alert ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                  <p className={`text-xs font-semibold mb-1 ${alert ? 'text-red-600' : 'text-gray-400'}`}>{icon} {label}</p>
                  <p className={`text-sm font-bold truncate ${alert ? 'text-red-800' : 'text-gray-900'}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Emergency contact */}
            {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
              <div className="px-6 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2 text-sm">
                <span className="text-orange-500 font-semibold text-xs">🆘 EMERGENCY:</span>
                <span className="text-orange-800 font-medium">{patient.emergency_contact_name}</span>
                {patient.emergency_contact_phone && (
                  <span className="text-orange-600">· {patient.emergency_contact_phone}</span>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat icon="🏥" label="Total Visits"      value={stats.total_visits    || 0} color="teal"   />
            <Stat icon="💊" label="Unique Medicines"  value={stats.total_medicines || 0} color="blue"   />
            <Stat icon="🩺" label="Doctors Consulted" value={stats.total_doctors   || 0} color="purple" />
            <Stat icon="🔬" label="Diagnoses Logged"  value={stats.total_diagnoses || 0} color="orange" />
          </div>

          {/* Sickness / diagnosis summary */}
          {sicknessLog.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Past Sicknesses & Diagnoses</h3>
              <div className="space-y-2">
                {sicknessLog.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-base mt-0.5">🔬</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{s.diagnosis || s.symptoms}</p>
                        <span className="text-xs text-gray-400">{formatDate(s.date)}</span>
                      </div>
                      {s.diagnosis && s.symptoms && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">Symptoms: {s.symptoms}</p>
                      )}
                      {s.doctor && (
                        <p className="text-xs text-primary-600 mt-0.5">Dr. {s.doctor}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All medicines ever received */}
          {allMedNames.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">
                All Medicines Received
                <span className="ml-2 text-gray-400 font-normal">({allMedNames.length} unique)</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {allMedNames.map((name: any) => (
                  <span key={name} className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-800 border border-teal-100 rounded-full px-3 py-1 text-xs font-semibold">
                    💊 {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Medical timeline */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              Medical Timeline
              <span className="text-gray-400 font-normal">— {consultations.length} visit{consultations.length !== 1 ? 's' : ''}</span>
            </h3>

            {consultations.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
                <span className="text-3xl block mb-2">📋</span>
                <p className="text-sm text-gray-400">No consultation records found for this patient.</p>
              </div>
            ) : (
              <div>
                {consultations.map((c: any, i: number) => (
                  <TimelineEntry key={c.id} c={c} index={i} />
                ))}
                {/* End of timeline */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                      ✓
                    </div>
                  </div>
                  <div className="pb-2 pt-2">
                    <p className="text-xs text-gray-400 italic">End of medical history</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
