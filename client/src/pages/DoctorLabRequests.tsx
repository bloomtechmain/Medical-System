import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Search, FlaskConical, CheckCircle2, Clock, XCircle,
  Eye, Lock, Send, ArrowUpRight, Microscope, FileText,
} from 'lucide-react';
import { labApi, userApi, labViewRequestApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

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
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl px-3.5 py-2.5">
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
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            placeholder={placeholder} value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin" />}
          {open && dq.length >= 1 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-52 overflow-y-auto">
              {(results as any[]).length === 0 && !isFetching
                ? <li className="px-4 py-3 text-sm text-gray-400">No results for "{dq}"</li>
                : (results as any[]).map((item: any) => (
                  <li key={item.id}
                    onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                    className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0">
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

interface NewRequestModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewRequestModal({ onClose, onSaved }: NewRequestModalProps) {
  const [patient,    setPatient]    = useState<any>(null);
  const [lab,        setLab]        = useState<any>(null);
  const [testDesc,   setTestDesc]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient)         return setError('Please select a patient');
    if (!lab)             return setError('Please select a laboratory');
    if (!testDesc.trim()) return setError('Test description is required');
    setError('');
    setSubmitting(true);
    try {
      await labApi.create({ patient_id: patient.id, laboratory_id: lab.id, test_description: testDesc, notes });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create request');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                <Microscope size={18} strokeWidth={1.8} />
              </div>
              <div>
                <p className="font-bold text-base">New Lab Request</p>
                <p className="text-white/70 text-xs">Assign a lab test for your patient</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors">
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <SearchDropdown
            label="Patient *"
            placeholder="Search by name or email…"
            fetchFn={userApi.searchPatients}
            queryKey="lab-search-patients"
            selected={patient}
            onSelect={setPatient}
            renderItem={(p: any) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-xl flex items-center justify-center text-xs font-bold shrink-0">{p.name.charAt(0)}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.email}{p.blood_type ? ` · ${p.blood_type}` : ''}</p>
                </div>
              </div>
            )}
            renderSelected={(p: any) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-xl flex items-center justify-center text-xs font-bold shrink-0">{p.name.charAt(0)}</div>
                <div><p className="text-sm font-semibold text-primary-700">{p.name}</p><p className="text-xs text-gray-500">{p.email}</p></div>
              </div>
            )}
          />

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Tests Required <span className="text-red-400">*</span>
            </label>
            <textarea rows={3}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
              placeholder="e.g. Full Blood Count, Liver Function Tests, Blood Glucose…"
              value={testDesc} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestDesc(e.target.value)} />
          </div>

          <SearchDropdown
            label="Assign Laboratory *"
            placeholder="Search by lab name or address…"
            fetchFn={userApi.searchLaboratories}
            queryKey="lab-search-labs"
            selected={lab}
            onSelect={setLab}
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
                <FlaskConical size={14} strokeWidth={2} className="text-primary-600" />
                <div><p className="text-sm font-semibold text-primary-700">{l.lab_name || l.name}</p></div>
              </div>
            )}
          />

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Clinical Notes <span className="text-gray-300 font-normal">(optional)</span>
            </label>
            <textarea rows={2}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
              placeholder="Notes for the lab technician…"
              value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <Send size={14} strokeWidth={2.5} />
              Send to Lab
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ViewRequestModalProps {
  labRequestId: number;
  onClose: () => void;
  onRequested?: () => void;
}

function ViewRequestModal({ labRequestId, onClose, onRequested }: ViewRequestModalProps) {
  const [message, setMessage] = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => labViewRequestApi.create({ lab_request_id: labRequestId, message: message.trim() || undefined }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['lab-view-requests'] }); setMessage(''); onRequested?.(); onClose(); },
  });

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-5 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Eye size={16} strokeWidth={2} />
              </div>
              <div>
                <p className="font-bold">Request Report Access</p>
                <p className="text-white/70 text-xs">Patient must approve before you can view</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            The patient will be notified and must accept your request before you can view this lab report.
          </p>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Reason <span className="text-gray-300 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Required for treatment plan review…"
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              {mutation.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              Send Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ViewRequestStripProps {
  labRequestId: number;
  viewRequest: any;
  onOpenModal: (id: number) => void;
}

function ViewRequestStrip({ labRequestId, viewRequest, onOpenModal }: ViewRequestStripProps) {
  const [viewing, setViewing] = useState(false);

  const openFile = async () => {
    setViewing(true);
    try {
      const token = localStorage.getItem('token');
      const base  = import.meta.env.VITE_API_URL || '/api';
      const res   = await fetch(`${base}/lab-view-requests/${viewRequest.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not fetch file');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { alert('Could not open file.'); }
    finally { setViewing(false); }
  };

  const status = viewRequest?.status || null;

  return (
    <div className="border-t border-gray-100 mt-3 pt-3">
      {!status && (
        <button
          onClick={() => onOpenModal(labRequestId)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl hover:opacity-90 transition-opacity shadow-sm"
        >
          <Lock size={14} strokeWidth={2.5} />
          Request to View Report
        </button>
      )}

      {status === 'pending' && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5">
          <Clock size={14} strokeWidth={2.5} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-700">Awaiting Patient Approval</p>
            <p className="text-[10px] text-amber-500">Patient has been notified — waiting for response</p>
          </div>
        </div>
      )}

      {status === 'accepted' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5">
            <CheckCircle2 size={13} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-emerald-700">Access Granted</span>
          </div>
          <button
            onClick={openFile}
            disabled={viewing}
            className="flex items-center gap-1.5 bg-primary-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            {viewing
              ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Eye size={13} strokeWidth={2.5} />
            }
            View Report
          </button>
        </div>
      )}

      {status === 'declined' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 bg-red-50 border border-red-100 rounded-xl px-3 py-1.5">
            <XCircle size={13} strokeWidth={2.5} className="text-red-500 shrink-0" />
            <span className="text-xs font-bold text-red-600">Patient Declined</span>
          </div>
          <button
            onClick={() => onOpenModal(labRequestId)}
            className="text-xs font-bold text-primary-600 bg-primary-50 border border-primary-100 px-3 py-2 rounded-xl hover:bg-primary-100 transition-colors"
          >
            Re-request
          </button>
        </div>
      )}
    </div>
  );
}

export default function DoctorLabRequests() {
  const [showForm,         setShowForm]         = useState(false);
  const [filter,           setFilter]           = useState('all');
  const [toast,            setToast]            = useState<string | null>(null);
  const [viewModalLabId,   setViewModalLabId]   = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: labRequests  = [], isLoading: loadingLab  } = useQuery({ queryKey: ['lab-requests'],      queryFn: labApi.getAll });
  const { data: viewRequests = [], isLoading: loadingView } = useQuery({ queryKey: ['lab-view-requests'], queryFn: labViewRequestApi.getAll });

  const viewMap = useMemo(() => {
    const map: Record<number, any> = {};
    (viewRequests as any[]).forEach((vr: any) => { map[vr.lab_request_id] = vr; });
    return map;
  }, [viewRequests]);

  const filtered = filter === 'all' ? labRequests : (labRequests as any[]).filter((r: any) => r.status === filter);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const counts = {
    total:     (labRequests as any[]).length,
    pending:   (labRequests as any[]).filter((r: any) => r.status === 'pending').length,
    progress:  (labRequests as any[]).filter((r: any) => r.status === 'in_progress').length,
    completed: (labRequests as any[]).filter((r: any) => r.status === 'completed').length,
    granted:   (viewRequests as any[]).filter((vr: any) => vr.status === 'accepted').length,
  };

  const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
    pending:     { cls:'bg-amber-100 text-amber-700',   label:'Pending'     },
    in_progress: { cls:'bg-blue-100 text-blue-700',     label:'In Progress' },
    completed:   { cls:'bg-emerald-100 text-emerald-700', label:'Completed'  },
  };

  const isLoading = loadingLab || loadingView;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
          <CheckCircle2 size={15} strokeWidth={2.5} /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Received Lab Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track lab tests you've sent and request access to view completed reports</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={15} strokeWidth={2.5} />
          New Lab Request
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Sent',    value:counts.total,     grad:'from-cyan-500 to-sky-600'      },
          { label:'Completed',     value:counts.completed, grad:'from-emerald-500 to-teal-600'  },
          { label:'Pending',       value:counts.pending,   grad:'from-amber-500 to-orange-500'  },
          { label:'View Granted',  value:counts.granted,   grad:'from-violet-500 to-purple-600' },
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

      <div className="flex gap-2 flex-wrap">
        {['all','completed','pending','in_progress'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'
            }`}>
            {f === 'all' ? `All (${counts.total})` : `${f.replace('_',' ')} (${(labRequests as any[]).filter((r: any) => r.status===f).length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
          Loading…
        </div>
      ) : (filtered as any[]).length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <FlaskConical size={28} strokeWidth={1.3} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">No lab requests found</p>
          <p className="text-sm text-gray-400 mt-1">Create a new lab request to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(filtered as any[]).map((r: any) => {
            const st        = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
            const viewReq   = viewMap[r.id];
            const isComplete = r.status === 'completed';

            return (
              <div key={r.id} className="ios-tile overflow-hidden">
                <div className={`h-1 w-full ${
                  isComplete ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
                  r.status === 'in_progress' ? 'bg-gradient-to-r from-blue-400 to-cyan-500' :
                  'bg-gradient-to-r from-amber-300 to-orange-400'
                }`} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-base shrink-0 ${
                      isComplete
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-200/50'
                        : 'bg-gradient-to-br from-cyan-500 to-sky-600 shadow-md shadow-cyan-200/50'
                    }`}>
                      {r.patient_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{r.patient_name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                        {isComplete && viewReq?.status === 'accepted' && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Eye size={9} strokeWidth={2.5} /> View Access
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                        <FlaskConical size={10} strokeWidth={2} />
                        {r.lab_name || 'Laboratory'} · {formatDate(r.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Tests Requested</p>
                    <p className="text-sm text-gray-700 line-clamp-2">{r.test_description}</p>
                  </div>

                  {r.report_notes && (
                    <div className="mt-2 bg-teal-50 rounded-xl px-3.5 py-2.5 border border-teal-100">
                      <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-0.5">Lab Notes</p>
                      <p className="text-xs text-gray-700 line-clamp-2">{r.report_notes}</p>
                    </div>
                  )}

                  {!isComplete && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                      <Clock size={12} strokeWidth={2} className="text-amber-400" />
                      Waiting for laboratory to complete and upload the report
                    </div>
                  )}

                  {isComplete && (
                    <ViewRequestStrip
                      labRequestId={r.id}
                      viewRequest={viewReq}
                      onOpenModal={setViewModalLabId}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewModalLabId !== null && (
        <ViewRequestModal
          labRequestId={viewModalLabId}
          onClose={() => setViewModalLabId(null)}
          onRequested={() => showToast('Request sent! Patient has been notified.')}
        />
      )}

      {showForm && (
        <NewRequestModal
          onClose={() => setShowForm(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['lab-requests'] }); showToast('Lab request sent to laboratory!'); }}
        />
      )}
    </div>
  );
}
