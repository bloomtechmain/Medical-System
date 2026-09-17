import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { SERVER_ORIGIN } from '../env';
import { Plus, Search, X, FlaskConical, Send, Upload } from 'lucide-react';

const API_BASE = SERVER_ORIGIN || 'http://localhost:5000';

function useDebounce(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

interface SearchDropdownProps {
  label: string;
  placeholder: string;
  fetchFn: (q: string) => Promise<any>;
  queryKey: string;
  selected: any;
  onSelect: (item: any) => void;
  renderItem: (item: any) => React.ReactNode;
  renderSelected: (item: any) => React.ReactNode;
}

function SearchDropdown({ label, placeholder, fetchFn, queryKey, selected, onSelect, renderItem, renderSelected }: SearchDropdownProps) {
  const [q, setQ]       = useState('');
  const dq              = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: [queryKey, dq],
    queryFn:  () => fetchFn(dq),
    enabled:  open && dq.length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-cyan-50 border border-cyan-200 rounded-xl px-3.5 py-2.5">
          {renderSelected(selected)}
          <button type="button" onClick={() => { onSelect(null); setQ(''); }}
            className="text-gray-400 hover:text-red-500 ml-2 text-xs font-semibold">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            placeholder={placeholder} value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-cyan-400 rounded-full animate-spin" />}
          {open && dq.length >= 1 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-52 overflow-y-auto">
              {(results as any[]).length === 0 && !isFetching
                ? <li className="px-4 py-3 text-sm text-gray-400">No results for "{dq}"</li>
                : (results as any[]).map((item: any) => (
                  <li key={item.id}
                    onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                    className="px-4 py-2.5 hover:bg-cyan-50 cursor-pointer border-b border-gray-50 last:border-0">
                    {renderItem(item)}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Book a Lab Test Modal ────────────────────────────────────────────────────
interface BookTestModalProps { onClose: () => void; onBooked: () => void; }

function BookTestModal({ onClose, onBooked }: BookTestModalProps) {
  const [lab,          setLab]          = useState<any>(null);
  const [reportType,   setReportType]   = useState('');
  const [notes,        setNotes]        = useState('');
  const [scheduledAt,  setScheduledAt]  = useState('');
  const [referral,     setReferral]     = useState<File | null>(null);
  const [error,        setError]        = useState('');
  const referralRef = useRef<HTMLInputElement>(null);
  const minScheduleValue = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const services: string[] = lab?.services_offered
    ? lab.services_offered.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('laboratory_id', String(lab.id));
      fd.append('test_description', reportType);
      fd.append('report_type', reportType);
      if (scheduledAt)     fd.append('scheduled_at', new Date(scheduledAt).toISOString());
      if (notes.trim())    fd.append('notes', notes.trim());
      if (referral)        fd.append('referral', referral);
      return labApi.create(fd);
    },
    onSuccess: () => { toast.success(`Test booked with ${lab.lab_name || lab.name}!`); onBooked(); onClose(); },
    onError: (err: any) => setError(err.message || 'Failed to book test'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lab)             return setError('Please select a laboratory');
    if (!reportType)      return setError('Please select a test');
    setError('');
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-cyan-600 to-cyan-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <FlaskConical size={16} className="text-white" />
            </div>
            <p className="text-sm font-bold text-white">Book a Lab Test</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <SearchDropdown
            label="Laboratory *"
            placeholder="Search by lab name or address…"
            fetchFn={userApi.searchLaboratories}
            queryKey="patient-search-labs"
            selected={lab}
            onSelect={(l: any) => { setLab(l); setReportType(''); }}
            renderItem={(l: any) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
                  <FlaskConical size={13} strokeWidth={2} className="text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{l.lab_name || l.name}</p>
                  <p className="text-xs text-gray-400">{l.address || l.email}</p>
                </div>
              </div>
            )}
            renderSelected={(l: any) => (
              <div className="flex items-center gap-2">
                <FlaskConical size={14} strokeWidth={2} className="text-cyan-700" />
                <div><p className="text-sm font-semibold text-cyan-700">{l.lab_name || l.name}</p></div>
              </div>
            )}
          />

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Test *</label>
            {!lab ? (
              <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl px-3.5 py-2.5">
                Select a laboratory first to see its available tests
              </div>
            ) : services.length > 0 ? (
              <select className="input text-sm" value={reportType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportType(e.target.value)}>
                <option value="">Select a test…</option>
                {services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input type="text" className="input text-sm" placeholder="e.g. Full Blood Count"
                value={reportType} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReportType(e.target.value)} />
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Preferred Date &amp; Time <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <input type="datetime-local" className="input text-sm" min={minScheduleValue}
              value={scheduledAt} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScheduledAt(e.target.value)} />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Doctor's Referral / Prescription <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            {!referral ? (
              <button type="button" onClick={() => referralRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-3.5 hover:border-cyan-400 hover:bg-cyan-50 transition-colors flex items-center justify-center gap-2 text-gray-400 hover:text-cyan-600">
                <Upload size={15} strokeWidth={2} />
                <span className="text-sm font-medium">Attach referral (PDF/image)</span>
              </button>
            ) : (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-3.5 py-2.5">
                <p className="text-sm text-gray-700 truncate">{referral.name}</p>
                <button type="button" onClick={() => { setReferral(null); if (referralRef.current) referralRef.current.value = ''; }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium ml-2 shrink-0">Remove</button>
              </div>
            )}
            <input ref={referralRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif" className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReferral(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Notes for the Lab <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea rows={2} className="input text-sm resize-none" placeholder="Any symptoms or details worth mentioning…"
              value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-cyan-600 to-cyan-800 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <Send size={14} strokeWidth={2.5} />
              Book Test
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, { badge: string; label: string; icon: string }> = {
  pending:     { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending',     icon: '⏳' },
  in_progress: { badge: 'bg-blue-100   text-blue-700',   label: 'In Progress', icon: '🔄' },
  completed:   { badge: 'bg-green-100  text-green-700',  label: 'Report Ready', icon: '✅' },
};

interface ReportModalProps {
  req: any;
  onClose: () => void;
}

function ReportModal({ req: r, onClose }: ReportModalProps) {
  const isPDF = r.report_mimetype?.includes('pdf');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Lab Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">{r.lab_name} · {formatDate(r.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Requesting Doctor', value: r.doctor_name ? `Dr. ${r.doctor_name}` : '—' },
              { label: 'Laboratory',        value: r.lab_name || '—' },
              { label: 'Requested On',      value: formatDate(r.created_at) },
              { label: 'Lab Type',          value: r.lab_type?.split(',')[0] || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Tests */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
            <p className="text-xs font-bold text-cyan-700 mb-1">🧪 Tests Performed</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.test_description}</p>
          </div>

          {/* Report */}
          {r.report_notes && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs font-bold text-teal-700 mb-1">🔬 Lab Report Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.report_notes}</p>
            </div>
          )}

          {r.report_file && (
            <div>
              <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-4 bg-primary-50 border-2 border-primary-200 rounded-xl hover:bg-primary-100 transition-colors group">
                <span className="text-3xl">{isPDF ? '📄' : '🖼️'}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-primary-700">{isPDF ? 'Open Lab Report (PDF)' : 'View Lab Report Image'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Click to view or download your report</p>
                </div>
                <svg className="w-5 h-5 text-primary-500 group-hover:text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              {!isPDF && (
                <img src={`${API_BASE}/uploads/lab-reports/${r.report_file}`} alt="Lab Report"
                  className="mt-3 w-full max-h-72 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PatientLabReports() {
  const [selected, setSelected] = useState<any>(null);
  const [booking,  setBooking]  = useState(false);
  const [filter, setFilter]     = useState('all');
  const qc = useQueryClient();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['patient-lab-reports'],
    queryFn:  labApi.getAll,
  });

  const openDetail = async (id: number) => {
    try { setSelected(await labApi.getOne(id)); }
    catch { toast.error('Failed to load'); }
  };

  const filtered = filter === 'all' ? reports : (reports as any[]).filter((r: any) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lab Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Book a test with a lab, and view your test requests and results</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setBooking(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-br from-cyan-600 to-cyan-800 rounded-xl shadow-sm hover:opacity-90 transition-opacity">
            <Plus size={15} strokeWidth={2.5} />
            Book a Lab Test
          </button>
          <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)} className="input text-sm py-1.5 w-36">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Reports Ready</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tests',    value: (reports as any[]).length,                                                            icon: '🔬', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: 'In Progress',    value: (reports as any[]).filter((r: any) => r.status !== 'completed').length, icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Reports Ready',  value: (reports as any[]).filter((r: any) => r.status === 'completed').length, icon: '📋', bg: 'bg-green-50  border-green-100'  },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading lab reports...
        </div>
      ) : (filtered as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">No lab reports yet</p>
          <p className="text-sm text-gray-400 mt-1">Book a test yourself, or your doctor will assign one when needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(filtered as any[]).map((r: any) => {
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.id} onClick={() => openDetail(r.id)}
                className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all cursor-pointer
                  ${r.status === 'completed' ? 'border-green-200 hover:border-green-300' : 'border-gray-100 hover:border-cyan-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0
                      ${r.status === 'completed' ? 'bg-green-100' : 'bg-cyan-100'}`}>
                      {st.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.doctor_name ? `Dr. ${r.doctor_name}` : 'Self-booked'} · {formatDate(r.created_at)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                    </div>
                  </div>
                  {r.status === 'completed' && (
                    <button className="shrink-0 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                      View Report →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <ReportModal req={selected} onClose={() => setSelected(null)} />}
      {booking && (
        <BookTestModal
          onClose={() => setBooking(false)}
          onBooked={() => qc.invalidateQueries({ queryKey: ['patient-lab-reports'] })}
        />
      )}
    </div>
  );
}
