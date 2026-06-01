import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

function useDebounce(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function SearchDropdown({ label, placeholder, fetchFn, queryKey, selected, onSelect, renderItem, renderSelected }) {
  const [q, setQ]     = useState('');
  const dq            = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const { data: results = [], isFetching } = useQuery({
    queryKey: [queryKey, dq],
    queryFn:  () => fetchFn(dq),
    enabled:  open && dq.length >= 1,
  });

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="label">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2.5">
          {renderSelected(selected)}
          <button type="button" onClick={() => { onSelect(null); setQ(''); }}
            className="text-gray-400 hover:text-red-500 ml-2 text-xs font-medium">✕ Change</button>
        </div>
      ) : (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input className="input pl-8" placeholder={placeholder} value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} />
          {isFetching && (
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {open && dq.length >= 1 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-52 overflow-y-auto">
              {results.length === 0 && !isFetching
                ? <li className="px-4 py-3 text-sm text-gray-400">No results for "{dq}"</li>
                : results.map(item => (
                  <li key={item.id} onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                    className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0">
                    {renderItem(item)}
                  </li>
                ))
              }
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── New request modal ───────────────────────────────────────────
function NewRequestModal({ onClose, onSaved }) {
  const [patient, setPatient]   = useState(null);
  const [lab, setLab]           = useState(null);
  const [testDesc, setTestDesc] = useState('');
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient)    return toast.error('Select a patient');
    if (!lab)        return toast.error('Select a laboratory');
    if (!testDesc.trim()) return toast.error('Test description is required');

    setSubmitting(true);
    try {
      await labApi.create({ patient_id: patient.id, laboratory_id: lab.id, test_description: testDesc, notes });
      toast.success('Lab request sent — laboratory notified');
      onSaved(); onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create request');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Lab Request</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign a lab and notify the patient</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <SearchDropdown
            label="Patient *"
            placeholder="Search patient by name or email..."
            fetchFn={userApi.searchPatients}
            queryKey="lab-search-patients"
            selected={patient}
            onSelect={setPatient}
            renderItem={p => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">{p.name.charAt(0)}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.email}{p.blood_type ? ` · ${p.blood_type}` : ''}</p>
                </div>
              </div>
            )}
            renderSelected={p => (
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <div><p className="text-sm font-semibold text-primary-700">{p.name}</p><p className="text-xs text-gray-500">{p.email}</p></div>
              </div>
            )}
          />

          <div>
            <label className="label">Tests Required <span className="text-red-400">*</span></label>
            <textarea rows={3} className="input resize-none"
              placeholder="e.g., Complete Blood Count (CBC), Liver Function Tests, X-Ray Chest PA view..."
              value={testDesc} onChange={e => setTestDesc(e.target.value)} required />
          </div>

          <div>
            <label className="label">Doctor's Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} className="input resize-none"
              placeholder="Clinical notes for the lab technician..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <SearchDropdown
            label="Assign Laboratory *"
            placeholder="Search by lab name, address or type..."
            fetchFn={userApi.searchLaboratories}
            queryKey="lab-search-labs"
            selected={lab}
            onSelect={setLab}
            renderItem={l => (
              <div className="flex items-start gap-2">
                <span className="text-xl">🔬</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{l.lab_name || l.name}</p>
                  <p className="text-xs text-gray-400">{l.address || l.email}</p>
                  {l.lab_type && <p className="text-xs text-cyan-600 mt-0.5">{l.lab_type.split(',')[0]}</p>}
                  {l.services_offered && (
                    <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">Services: {l.services_offered}</p>
                  )}
                </div>
              </div>
            )}
            renderSelected={l => (
              <div className="flex items-center gap-2">
                <span className="text-xl">🔬</span>
                <div>
                  <p className="text-sm font-semibold text-primary-700">{l.lab_name || l.name}</p>
                  <p className="text-xs text-gray-500">{l.address || l.email}</p>
                </div>
              </div>
            )}
          />

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5">
              {submitting
                ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sending...</span>
                : '🔬 Send Lab Request'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail modal ────────────────────────────────────────────────
function DetailModal({ req: r, onClose }) {
  const isPDF = r.report_mimetype?.includes('pdf');
  const STATUS_STYLE = {
    pending:     'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100   text-blue-700',
    completed:   'bg-green-100  text-green-700',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Lab Request</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Patient',   value: r.patient_name },
              { label: 'Laboratory',value: r.lab_name || '—' },
              { label: 'Requested', value: formatDate(r.created_at) },
              { label: 'Lab Type',  value: r.lab_type?.split(',')[0] || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
            <p className="text-xs font-bold text-cyan-700 mb-1">🧪 Tests Requested</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.test_description}</p>
          </div>

          {r.notes && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 mb-1">📝 Doctor's Notes</p>
              <p className="text-sm text-gray-700">{r.notes}</p>
            </div>
          )}

          {r.status === 'completed' && r.report_file && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lab Report</p>
              {r.report_notes && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
                  <p className="text-xs font-bold text-green-700 mb-1">🔬 Lab Notes</p>
                  <p className="text-sm text-gray-700">{r.report_notes}</p>
                </div>
              )}
              <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors group">
                <span className="text-2xl">{isPDF ? '📄' : '🖼️'}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-primary-700">
                    {isPDF ? 'View Lab Report PDF' : 'View Lab Report Image'}
                  </p>
                  <p className="text-xs text-gray-500">Click to open · {r.report_mimetype}</p>
                </div>
                <svg className="w-4 h-4 text-primary-400 group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              {!isPDF && (
                <img src={`${API_BASE}/uploads/lab-reports/${r.report_file}`} alt="Lab Report"
                  className="mt-3 w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              )}
            </div>
          )}

          {r.status !== 'completed' && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
              <p className="text-sm text-yellow-700">⏳ Waiting for laboratory to upload the report</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────
export default function DoctorLabRequests() {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all');
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['lab-requests'],
    queryFn:  labApi.getAll,
  });

  const openDetail = async (id) => {
    try { setSelected(await labApi.getOne(id)); }
    catch { toast.error('Failed to load'); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const STATUS_STYLE = {
    pending:     'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100   text-blue-700',
    completed:   'bg-green-100  text-green-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lab Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign laboratory tests for patients and track reports</p>
        </div>
        <div className="flex gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="input text-sm py-1.5 w-36">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Request
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Requests', value: requests.length,                                      icon: '🔬', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: 'Pending',        value: requests.filter(r => r.status === 'pending').length,    icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Reports Ready',  value: requests.filter(r => r.status === 'completed').length, icon: '📋', bg: 'bg-green-50  border-green-100'  },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">No lab requests yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Request" to send a lab test request.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} onClick={() => openDetail(r.id)}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-cyan-200 hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-cyan-100 text-cyan-700 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">
                    {r.patient_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{r.patient_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[r.status]}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">🔬 {r.lab_name || 'Lab'} · {formatDate(r.created_at)}</p>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                  </div>
                </div>
                {r.status === 'completed' && (
                  <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium shrink-0">📋 Report Ready</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm  && <NewRequestModal onClose={() => setShowForm(false)} onSaved={() => qc.invalidateQueries(['lab-requests'])} />}
      {selected  && <DetailModal req={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
