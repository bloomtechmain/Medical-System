import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Search, Users, UserRound, ChevronDown, Stethoscope, ShieldCheck, Clock, CalendarClock, Plus, ArrowUpRight, UserPlus,
} from 'lucide-react';
import { accessRequestApi, consultationApi, appointmentApi } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate } from '../utils/helpers';
import PatientHistoryPanel from '../components/doctor/PatientHistoryPanel';

// The doctor's patient list — everyone they have treated, been granted access
// to or have an appointment with — built from the doctor's own records. The
// dashboard overview used to be reused here verbatim; this page is about
// patients only: find one, see where they stand, act on them.

type Filter = 'all' | 'active' | 'recent' | 'granted' | 'awaiting';

interface PatientRow {
  id: number;
  name: string;
  email?: string;
  visits: number;
  activeVisits: number;
  lastVisit: string | null;
  lastDiagnosis: string | null;
  grantedTypes: string[];
  pendingTypes: string[];
  nextAppointment: { date: string; time: string; status: string } | null;
}

const DAY = 86_400_000;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('') || '?';

export default function DoctorPatients() {
  const { t } = useTranslation('doctorCore');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lookup, setLookup] = useState('');
  const debouncedLookup = useDebounce(lookup, 350);

  const { data: consultations = [], isLoading: loadingC } = useQuery<any[]>({ queryKey: ['doctor-consultations'], queryFn: consultationApi.getAll });
  const { data: requests = [], isLoading: loadingR } = useQuery<any[]>({ queryKey: ['access-requests'], queryFn: accessRequestApi.getAll });
  const { data: appointments = [] } = useQuery<any[]>({ queryKey: ['appointments'], queryFn: appointmentApi.getAll });
  const { data: searchResults = [], isFetching: searching } = useQuery<any[]>({
    queryKey: ['patient-search', debouncedLookup],
    queryFn: () => accessRequestApi.searchPatients(debouncedLookup),
    enabled: debouncedLookup.length >= 2,
  });

  // One row per patient, merged from every place they appear.
  const patients = useMemo<PatientRow[]>(() => {
    const map = new Map<number, PatientRow>();
    const row = (id: number, name: string, email?: string): PatientRow => {
      let r = map.get(id);
      if (!r) {
        r = { id, name, email, visits: 0, activeVisits: 0, lastVisit: null, lastDiagnosis: null, grantedTypes: [], pendingTypes: [], nextAppointment: null };
        map.set(id, r);
      }
      if (!r.email && email) r.email = email;
      return r;
    };
    for (const c of consultations) {
      if (!c.patient_id) continue;
      const r = row(c.patient_id, c.patient_name ?? '—', c.patient_email);
      r.visits++;
      if (c.status === 'active') r.activeVisits++;
      if (!r.lastVisit || new Date(c.visit_date) > new Date(r.lastVisit)) { r.lastVisit = c.visit_date; r.lastDiagnosis = c.diagnosis ?? null; }
    }
    for (const q of requests) {
      if (!q.patient_id) continue;
      const r = row(q.patient_id, q.patient_name ?? '—', q.patient_email);
      if (q.status === 'accepted' && !r.grantedTypes.includes(q.access_type)) r.grantedTypes.push(q.access_type);
      if (q.status === 'pending' && !r.pendingTypes.includes(q.access_type)) r.pendingTypes.push(q.access_type);
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const a of appointments) {
      if (!a.patient_id || !['pending', 'confirmed'].includes(a.status)) continue;
      const date = String(a.appointment_date).slice(0, 10);
      if (date < today) continue;
      const r = row(a.patient_id, a.patient_name ?? '—', a.patient_email);
      if (!r.nextAppointment || date < r.nextAppointment.date) r.nextAppointment = { date, time: String(a.start_time).slice(0, 5), status: a.status };
    }
    return [...map.values()].sort((a, b) =>
      (b.lastVisit ? new Date(b.lastVisit).getTime() : 0) - (a.lastVisit ? new Date(a.lastVisit).getTime() : 0) || a.name.localeCompare(b.name));
  }, [consultations, requests, appointments]);

  const counts = useMemo(() => ({
    all: patients.length,
    active: patients.filter(p => p.activeVisits > 0).length,
    recent: patients.filter(p => p.lastVisit && Date.now() - new Date(p.lastVisit).getTime() <= 30 * DAY).length,
    granted: patients.filter(p => p.grantedTypes.length > 0).length,
    awaiting: patients.filter(p => p.pendingTypes.length > 0).length,
  }), [patients]);

  const q = query.trim().toLowerCase();
  const visible = patients.filter(p => {
    if (filter === 'active' && !p.activeVisits) return false;
    if (filter === 'recent' && !(p.lastVisit && Date.now() - new Date(p.lastVisit).getTime() <= 30 * DAY)) return false;
    if (filter === 'granted' && !p.grantedTypes.length) return false;
    if (filter === 'awaiting' && !p.pendingTypes.length) return false;
    return !q || p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q) || (p.lastDiagnosis ?? '').toLowerCase().includes(q);
  });
  const myIds = new Set(patients.map(p => p.id));
  const loading = loadingC || loadingR;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('patientsPage.filters.all') },
    { key: 'active', label: t('patientsPage.filters.active') },
    { key: 'recent', label: t('patientsPage.filters.recent') },
    { key: 'granted', label: t('patientsPage.filters.granted') },
    { key: 'awaiting', label: t('patientsPage.filters.awaiting') },
  ];

  return (
    <div className="space-y-5 p-4 md:p-0 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
            <Users className="text-primary-600" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('patientsPage.title')}</h1>
            <p className="text-sm text-gray-500">{t('patientsPage.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/doctor/consultations', { state: { autoOpen: true } })}
          className="btn-primary"
        >
          <Plus size={16} /> {t('doctorDashboard.quickActions.newConsultation')}
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: t('patientsPage.stats.total'), value: counts.all, cls: 'text-primary-700 bg-primary-50' },
          { icon: Stethoscope, label: t('patientsPage.stats.active'), value: counts.active, cls: 'text-amber-700 bg-amber-50' },
          { icon: ShieldCheck, label: t('patientsPage.stats.granted'), value: counts.granted, cls: 'text-emerald-700 bg-emerald-50' },
          { icon: Clock, label: t('patientsPage.stats.awaiting'), value: counts.awaiting, cls: 'text-sky-700 bg-sky-50' },
        ].map(({ icon: Icon, label, value, cls }) => (
          <div key={label} className="ios-tile p-4 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls}`}><Icon size={18} /></span>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{loading ? '—' : value}</p>
              <p className="text-[11px] font-semibold text-gray-500 mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* My patients */}
      <div className="ios-tile p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.label} <span className="opacity-60">{counts[f.key]}</span>
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 !py-2 text-sm" placeholder={t('patientsPage.filterPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
            <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" /> {t('patientsPage.loading')}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10">
            <UserRound size={30} strokeWidth={1.3} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-500">{patients.length === 0 ? t('patientsPage.emptyAll') : t('patientsPage.emptyFilter')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map(p => {
              const open = expanded === p.id;
              return (
                <li key={p.id} className={`border rounded-2xl overflow-hidden transition-colors ${open ? 'border-primary-200 bg-primary-50/20' : 'border-gray-100 bg-white hover:border-primary-200'}`}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setExpanded(open ? null : p.id)} className="flex items-center gap-3 flex-1 min-w-[220px] text-left">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {initials(p.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {p.lastVisit
                            ? t('patientsPage.lastVisit', { date: formatDate(p.lastVisit), count: p.visits })
                            : t('patientsPage.noVisits')}
                          {p.lastDiagnosis ? ` · ${p.lastDiagnosis}` : ''}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.activeVisits > 0 && <span className="badge-yellow">{t('patientsPage.badges.active', { count: p.activeVisits })}</span>}
                      {p.grantedTypes.length > 0 && <span className="badge-green">{t('patientsPage.badges.granted')}</span>}
                      {p.pendingTypes.length > 0 && <span className="badge-blue">{t('patientsPage.badges.awaiting')}</span>}
                      {p.nextAppointment && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
                          <CalendarClock size={11} /> {formatDate(p.nextAppointment.date)} {p.nextAppointment.time}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="btn-secondary !px-3 !py-1.5 text-xs"
                        onClick={() => navigate('/doctor/consultations', { state: { autoOpen: true, patient: { id: p.id, name: p.name, email: p.email } } })}>
                        <Plus size={13} /> {t('patientsPage.consult')}
                      </button>
                      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => navigate(`/doctor/patients/${p.id}`)} title={t('patientsPage.openProfile')}>
                        <ArrowUpRight size={15} />
                      </button>
                      <button className="btn-ghost !px-2 !py-1.5" onClick={() => setExpanded(open ? null : p.id)} aria-label={t('patientsPage.toggleHistory')}>
                        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180 text-primary-500' : 'text-gray-400'}`} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="px-4 pb-4 border-t border-primary-100/60">
                      <PatientHistoryPanel patientId={p.id} patient={p} onViewProfile={() => navigate(`/doctor/patients/${p.id}`)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Find any patient */}
      <div className="ios-tile p-4 md:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0"><UserPlus size={17} /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('patientsPage.findTitle')}</p>
            <p className="text-xs text-gray-500">{t('patientsPage.findSubtitle')}</p>
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            placeholder={t('dashboard.search.placeholder')}
            value={lookup}
            onChange={e => setLookup(e.target.value)}
          />
        </div>
        {debouncedLookup.length >= 2 && (
          searching ? (
            <p className="text-sm text-gray-400 text-center py-3">{t('dashboard.search.searching')}</p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">{t('dashboard.search.noResults', { query: debouncedLookup })}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {searchResults.map((pt: any) => (
                <li key={pt.id} className="py-2.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">{initials(pt.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{pt.name}</p>
                    <p className="text-xs text-gray-500 truncate">{pt.email}{pt.blood_type ? ` · 🩸 ${pt.blood_type}` : ''}</p>
                  </div>
                  {myIds.has(pt.id) && <span className="badge-green">{t('patientsPage.alreadyYours')}</span>}
                  <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => navigate(`/doctor/patients/${pt.id}`)}>
                    {t('patientsPage.openProfile')}
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
