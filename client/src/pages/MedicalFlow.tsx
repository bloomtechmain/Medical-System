import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi, consultationApi, labApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { SERVER_ORIGIN } from '../env';

const SERVER_BASE = SERVER_ORIGIN || 'http://localhost:5000';

const EV: Record<string, any> = {
  sick: { label: 'Reported Sick', icon: '🤒', dot: 'bg-orange-500 ring-orange-100', card: 'border-orange-200 bg-orange-50/40', badge: 'bg-orange-100 text-orange-700', heading: 'text-orange-700', group: 'visits' },
  doctor_visit: { label: 'Doctor Visit', icon: '🏥', dot: 'bg-teal-500 ring-teal-100', card: 'border-teal-200 bg-teal-50/40', badge: 'bg-teal-100 text-teal-700', heading: 'text-teal-700', group: 'visits' },
  diagnosis: { label: 'Diagnosis', icon: '🔍', dot: 'bg-blue-500 ring-blue-100', card: 'border-blue-200 bg-blue-50/40', badge: 'bg-blue-100 text-blue-700', heading: 'text-blue-700', group: 'visits' },
  prescription_dispensed: { label: 'Prescription Dispensed', icon: '🏪', dot: 'bg-indigo-500 ring-indigo-100', card: 'border-indigo-200 bg-indigo-50/40', badge: 'bg-indigo-100 text-indigo-700', heading: 'text-indigo-700', group: 'medicines' },
  treatment_completed: { label: 'Treatment Completed', icon: '✅', dot: 'bg-green-500 ring-green-100', card: 'border-green-200 bg-green-50/40', badge: 'bg-green-100 text-green-700', heading: 'text-green-700', group: 'visits' },
  lab_requested: { label: 'Lab Test Requested', icon: '🔬', dot: 'bg-cyan-500 ring-cyan-100', card: 'border-cyan-200 bg-cyan-50/40', badge: 'bg-cyan-100 text-cyan-700', heading: 'text-cyan-700', group: 'lab' },
  lab_in_progress: { label: 'Lab Test In Progress', icon: '⚗️', dot: 'bg-sky-500 ring-sky-100', card: 'border-sky-200 bg-sky-50/40', badge: 'bg-sky-100 text-sky-700', heading: 'text-sky-700', group: 'lab' },
  lab_report_ready: { label: 'Lab Report Ready', icon: '📋', dot: 'bg-emerald-500 ring-emerald-100', card: 'border-emerald-200 bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-700', heading: 'text-emerald-700', group: 'lab' },
};

function buildEvents(consultations: any[], labReports: any[]) {
  const events: any[] = [];

  consultations.forEach((c) => {
    const base = c.visit_date || c.created_at;
    const baseTs = new Date(base).getTime();

    events.push({
      id: `c-${c.id}-visit`, type: 'doctor_visit', ts: baseTs, dateStr: base, timeStr: c.created_at, consultation: c,
      searchText: [c.diagnosis, c.sick_description, c.doctor_display_name, c.hospital_clinic, c.treatment_description, ...(c.medicines || []).map((m: any) => m.medicine_name)].filter(Boolean).join(' ').toLowerCase(),
    });

    if (c.status === 'dispensed' || c.status === 'completed') {
      events.push({
        id: `c-${c.id}-dispensed`, type: 'prescription_dispensed', ts: baseTs + 7_200_000, dateStr: base, timeStr: null, consultation: c,
        searchText: [c.doctor_display_name, c.hospital_clinic, ...(c.medicines || []).map((m: any) => m.medicine_name)].filter(Boolean).join(' ').toLowerCase(),
      });
    }

    if (c.status === 'completed') {
      events.push({
        id: `c-${c.id}-completed`, type: 'treatment_completed', ts: baseTs + 10_800_000, dateStr: base, timeStr: null, consultation: c,
        searchText: [c.diagnosis, c.doctor_display_name].filter(Boolean).join(' ').toLowerCase(),
      });
    }
  });

  labReports.forEach((r) => {
    const ts = new Date(r.created_at).getTime();

    events.push({
      id: `l-${r.id}-request`, type: 'lab_requested', ts, dateStr: r.created_at, timeStr: r.created_at, lab: r,
      searchText: [r.test_description, r.doctor_name, r.lab_name, r.notes].filter(Boolean).join(' ').toLowerCase(),
    });

    if (r.status === 'in_progress' || r.status === 'completed') {
      events.push({
        id: `l-${r.id}-progress`, type: 'lab_in_progress', ts: ts + 3_600_000, dateStr: r.created_at, timeStr: null, lab: r,
        searchText: [r.test_description, r.lab_name].filter(Boolean).join(' ').toLowerCase(),
      });
    }

    if (r.status === 'completed' && r.report_file) {
      events.push({
        id: `l-${r.id}-report`, type: 'lab_report_ready', ts: ts + 14_400_000, dateStr: r.created_at, timeStr: null, lab: r,
        searchText: [r.test_description, r.lab_name, r.report_notes].filter(Boolean).join(' ').toLowerCase(),
      });
    }
  });

  return events.sort((a, b) => b.ts - a.ts);
}

function groupByDate(events: any[]) {
  const map = new Map<string, any>();
  events.forEach((e) => {
    const key = new Date(e.dateStr).toLocaleDateString('en-CA');
    if (!map.has(key)) map.set(key, { key, dateStr: e.dateStr, events: [] });
    map.get(key).events.push(e);
  });
  return [...map.values()];
}

function humanDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function humanTime(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  if (!dateStr.includes('T') && !dateStr.includes(' ')) return null;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function downloadReport(reportFile: string, labName: string) {
  try {
    const token = localStorage.getItem('token');
    const url   = `${SERVER_BASE}/uploads/lab-reports/${reportFile}`;
    const res   = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Fetch failed');
    const blob  = await res.blob();
    const href  = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = href;
    a.download  = `${(labName || 'lab-report').replace(/\s+/g, '_')}_${reportFile}`;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    window.open(`${SERVER_BASE}/uploads/lab-reports/${reportFile}`, '_blank');
  }
}

const COLOR_CLASSES: Record<string, string> = {
  orange:  'bg-orange-50  border-orange-100  text-orange-700  text-orange-600',
  blue:    'bg-blue-50    border-blue-100    text-blue-700    text-blue-600',
  teal:    'bg-teal-50    border-teal-100    text-teal-700    text-teal-600',
  cyan:    'bg-cyan-50    border-cyan-100    text-cyan-700    text-cyan-600',
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700 text-emerald-600',
  gray:    'bg-gray-50    border-gray-100    text-gray-700    text-gray-600',
};

interface InfoBlockProps {
  icon: string;
  label: string;
  color: string;
  children: React.ReactNode;
}

function InfoBlock({ icon, label, color, children }: InfoBlockProps) {
  const cls = COLOR_CLASSES[color] || COLOR_CLASSES.gray;
  const [bg, border, labelColor] = cls.split(' ');
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${bg} ${border}`}>
      <p className={`text-xs font-bold mb-0.5 ${labelColor}`}>{icon} {label}</p>
      <p className="text-sm text-gray-700">{children}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{children}</span>;
}

function StatusRow({ status }: { status: string }) {
  const map: Record<string, any> = {
    active:    { icon: '⚕️', label: 'Treatment Active',   cls: 'bg-yellow-100 text-yellow-700' },
    dispensed: { icon: '💊', label: 'Prescription Given',  cls: 'bg-indigo-100 text-indigo-700' },
    completed: { icon: '✅', label: 'Treatment Complete',  cls: 'bg-green-100  text-green-700'  },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>
        {s.icon} {s.label}
      </span>
    </div>
  );
}

interface FilterBtnProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterBtn({ active, onClick, children }: FilterBtnProps) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}>
      {children}
    </button>
  );
}

interface EventCardProps {
  event: any;
  expanded: boolean;
  onToggle: () => void;
}

function EventCard({ event, expanded, onToggle }: EventCardProps) {
  const cfg = EV[event.type];
  const time = humanTime(event.timeStr);
  const c = event.consultation;
  const r = event.lab;

  return (
    <div className={`relative ml-10 rounded-xl border transition-all shadow-sm ${cfg.card}`}>
      <div className={`absolute -left-[2.85rem] top-4 w-5 h-5 rounded-full ring-4 flex items-center justify-center text-white text-xs z-10 ${cfg.dot}`}>
        <span>{cfg.icon}</span>
      </div>

      <button type="button" className="w-full text-left px-4 pt-3 pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-0.5">
              <span className={`text-xs font-bold uppercase tracking-wide ${cfg.heading}`}>{cfg.label}</span>
              {time && <span className="text-xs text-gray-400 font-mono">{time}</span>}
            </div>

            {event.type === 'doctor_visit' && (
              <p className="text-sm font-semibold text-gray-900">{c.diagnosis || c.sick_description || 'Medical Consultation'}</p>
            )}
            {event.type === 'prescription_dispensed' && (
              <p className="text-sm font-semibold text-gray-900">
                {(c.medicines || []).slice(0, 3).map((m: any) => m.medicine_name).join(' · ') || 'Prescription dispensed'}
                {(c.medicines || []).length > 3 && ` +${(c.medicines || []).length - 3} more`}
              </p>
            )}
            {event.type === 'treatment_completed' && (
              <p className="text-sm font-semibold text-gray-900">{c.diagnosis || c.sick_description || 'Treatment'} — resolved</p>
            )}
            {(event.type === 'lab_requested' || event.type === 'lab_in_progress' || event.type === 'lab_report_ready') && (
              <p className="text-sm font-semibold text-gray-900">{r.test_description || 'Laboratory Test'}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-1">
              {c?.doctor_display_name && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">🩺 Dr. {c.doctor_display_name}</span>
              )}
              {c?.hospital_clinic && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">🏢 {c.hospital_clinic}</span>
              )}
              {r?.doctor_name && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">🩺 Dr. {r.doctor_name}</span>
              )}
              {r?.lab_name && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">🔬 {r.lab_name}</span>
              )}
            </div>
          </div>

          <svg className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200/60 px-4 pb-4 pt-3 space-y-3">
          {event.type === 'doctor_visit' && c && (
            <>
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                  {(c.doctor_display_name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Dr. {c.doctor_display_name || '—'}</p>
                  {c.hospital_clinic && <p className="text-xs text-gray-500">🏢 {c.hospital_clinic}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">Visited {formatDate(c.visit_date)}</p>
                </div>
              </div>
              {c.sick_description && <InfoBlock icon="🤒" label="Symptoms Reported" color="orange">{c.sick_description}</InfoBlock>}
              {c.diagnosis && <InfoBlock icon="🔍" label="Diagnosis" color="blue">{c.diagnosis}</InfoBlock>}
              {c.treatment_description && <InfoBlock icon="💉" label="Treatment Plan" color="teal">{c.treatment_description}</InfoBlock>}
              {(c.medicines || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">💊 Medicines Prescribed</p>
                  <div className="space-y-1.5">
                    {(c.medicines || []).map((m: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2 shadow-sm">
                        <span className="text-base mt-0.5">💊</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{m.medicine_name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {m.dosage    && <Tag>{m.dosage}</Tag>}
                            {m.frequency && <Tag>{m.frequency}</Tag>}
                            {m.duration  && <Tag>{m.duration}</Tag>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <StatusRow status={c.status} />
            </>
          )}

          {event.type === 'prescription_dispensed' && c && (
            <>
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xl shrink-0">🏪</div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Prescription Dispensed by Pharmacist</p>
                  <p className="text-xs text-gray-500">For: {c.diagnosis || c.sick_description || 'consultation'}</p>
                  {c.doctor_display_name && <p className="text-xs text-gray-400 mt-0.5">Prescribed by Dr. {c.doctor_display_name}</p>}
                </div>
              </div>
              {(c.medicines || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">💊 Medicines Dispensed</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(c.medicines || []).map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2 shadow-sm">
                        <span>💊</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{m.medicine_name}</p>
                          {m.dosage && <p className="text-xs text-gray-400">{m.dosage}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {event.type === 'treatment_completed' && c && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-sm font-bold text-green-800">Treatment Successfully Completed</p>
                <p className="text-xs text-green-700 mt-0.5">Condition: {c.diagnosis || c.sick_description || '—'}</p>
                {c.doctor_display_name && <p className="text-xs text-green-600 mt-0.5">Treating doctor: Dr. {c.doctor_display_name}</p>}
              </div>
            </div>
          )}

          {event.type === 'lab_requested' && r && (
            <>
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-cyan-100 text-cyan-700 rounded-full flex items-center justify-center text-xl shrink-0">🔬</div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                  {r.doctor_name && <p className="text-xs text-gray-500">🩺 Requested by Dr. {r.doctor_name}</p>}
                  <p className="text-xs text-gray-400">Requested {formatDate(r.created_at)}</p>
                </div>
              </div>
              <InfoBlock icon="🧪" label="Test Description" color="cyan">{r.test_description || 'Not specified'}</InfoBlock>
              {r.notes && <InfoBlock icon="📝" label="Notes" color="gray">{r.notes}</InfoBlock>}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  r.status === 'completed'   ? 'bg-green-100 text-green-700' :
                  r.status === 'in_progress' ? 'bg-blue-100  text-blue-700'  :
                                               'bg-yellow-100 text-yellow-700'
                }`}>
                  {r.status === 'completed' ? '✅ Completed' : r.status === 'in_progress' ? '⚗️ In Progress' : '⏳ Pending'}
                </span>
              </div>
            </>
          )}

          {event.type === 'lab_in_progress' && r && (
            <div className="flex items-center gap-3 p-3 bg-sky-50 rounded-xl border border-sky-200">
              <span className="text-2xl">⚗️</span>
              <div>
                <p className="text-sm font-bold text-sky-800">Lab is Processing Your Test</p>
                <p className="text-xs text-sky-700 mt-0.5">{r.test_description}</p>
                {r.lab_name && <p className="text-xs text-sky-600 mt-0.5">🔬 {r.lab_name}</p>}
              </div>
            </div>
          )}

          {event.type === 'lab_report_ready' && r && (
            <>
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xl shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                  <p className="text-xs text-gray-500 truncate">{r.test_description}</p>
                  {r.doctor_name && <p className="text-xs text-gray-400">Ordered by Dr. {r.doctor_name}</p>}
                </div>
              </div>
              {r.report_notes && <InfoBlock icon="📝" label="Lab Notes / Results Summary" color="emerald">{r.report_notes}</InfoBlock>}
              <div className="flex flex-wrap gap-2">
                {r.report_file && (
                  <button type="button" onClick={() => downloadReport(r.report_file, r.lab_name)}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Report
                  </button>
                )}
                {r.report_file && (
                  <a href={`${SERVER_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 transition-colors shadow-sm">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View in Browser
                  </a>
                )}
                {!r.report_file && <span className="text-xs text-gray-400 italic">Report file not yet attached</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const FILTER_GROUPS: Record<string, string | null> = {
  all: null, visits: 'visits', medicines: 'medicines', lab: 'lab',
};

export default function MedicalFlow() {
  const [expanded, setExpanded]  = useState<string | null>(null);
  const [search,   setSearch]    = useState('');
  const [filter,   setFilter]    = useState('all');
  const [sortAsc,  setSortAsc]   = useState(false);

  const { data: consultations = [] } = useQuery({ queryKey: ['consultations'],       queryFn: consultationApi.getAll });
  const { data: labReports    = [] } = useQuery({ queryKey: ['patient-lab-reports'], queryFn: labApi.getAll });
  const { data: me }                 = useQuery({ queryKey: ['me'],                  queryFn: authApi.me });

  const allEvents = useMemo(() => buildEvents(consultations as any[], labReports as any[]), [consultations, labReports]);

  const displayed = useMemo(() => {
    let ev = allEvents;
    const group = FILTER_GROUPS[filter];
    if (group) ev = ev.filter((e: any) => EV[e.type]?.group === group);
    const q = search.trim().toLowerCase();
    if (q) ev = ev.filter((e: any) => e.searchText?.includes(q));
    if (sortAsc) ev = [...ev].reverse();
    return ev;
  }, [allEvents, filter, search, sortAsc]);

  const groups = useMemo(() => groupByDate(displayed), [displayed]);

  const firstDate = allEvents.length ? new Date(allEvents[allEvents.length - 1].dateStr) : null;
  const lastDate  = allEvents.length ? new Date(allEvents[0].dateStr) : null;

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

  const filterCounts = useMemo(() => ({
    all:       allEvents.length,
    visits:    allEvents.filter((e: any) => EV[e.type]?.group === 'visits').length,
    medicines: allEvents.filter((e: any) => EV[e.type]?.group === 'medicines').length,
    lab:       allEvents.filter((e: any) => EV[e.type]?.group === 'lab').length,
  }), [allEvents]);

  return (
    <div className="space-y-6">

      <div className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🧬</span>
              <h1 className="text-2xl font-bold">Medical Flow</h1>
            </div>
            <p className="text-gray-300 text-sm">
              Your complete health journey — every visit, prescription, and lab result in chronological order.
            </p>
            {firstDate && lastDate && (
              <p className="text-gray-400 text-xs mt-2">
                {firstDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}→{' '}
                {lastDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{allEvents.length} events
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[60px]">
              <p className="text-lg font-bold">{(consultations as any[]).length}</p>
              <p className="text-xs text-gray-400">Visits</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[60px]">
              <p className="text-lg font-bold">{(labReports as any[]).length}</p>
              <p className="text-xs text-gray-400">Lab Tests</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[60px]">
              <p className="text-lg font-bold">
                {[...new Set((consultations as any[]).flatMap((c: any) => (c.medicines || []).map((m: any) => m.medicine_name.toLowerCase())))].length}
              </p>
              <p className="text-xs text-gray-400">Medicines</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search doctors, medicines, conditions…"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterBtn active={filter === 'all'}       onClick={() => setFilter('all')}>All ({filterCounts.all})</FilterBtn>
            <FilterBtn active={filter === 'visits'}    onClick={() => setFilter('visits')}>🏥 Visits ({filterCounts.visits})</FilterBtn>
            <FilterBtn active={filter === 'medicines'} onClick={() => setFilter('medicines')}>💊 Medicines ({filterCounts.medicines})</FilterBtn>
            <FilterBtn active={filter === 'lab'}       onClick={() => setFilter('lab')}>🔬 Lab Tests ({filterCounts.lab})</FilterBtn>
          </div>

          <button
            type="button"
            onClick={() => setSortAsc(p => !p)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            {sortAsc ? (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M3 8h14M3 12h10" /></svg> Oldest First</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M3 8h14M3 12h10" /></svg> Newest First</>
            )}
          </button>
        </div>

        {displayed.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            Showing {displayed.length} event{displayed.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : ''}
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <span className="text-5xl block mb-4">🧬</span>
          <p className="text-gray-700 font-semibold">No medical events found</p>
          <p className="text-sm text-gray-400 mt-1">
            {search
              ? `No events match "${search}". Try a different search term.`
              : 'Your medical timeline will appear here as events are recorded.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group: any) => (
            <div key={group.key}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm z-10">
                  {new Date(group.dateStr).getDate()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{humanDate(group.dateStr)}</p>
                  <p className="text-xs text-gray-400">{group.events.length} event{group.events.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex-1 h-px bg-gray-200 ml-2" />
              </div>

              <div className="relative ml-4 pl-0">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200 rounded-full" />
                <div className="space-y-3 pl-0">
                  {group.events.map((event: any) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      expanded={expanded === event.id}
                      onToggle={() => toggle(event.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Event Legend</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(EV).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${cfg.dot.split(' ')[0]}`} />
                <span className="text-xs text-gray-500">{cfg.icon} {cfg.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
