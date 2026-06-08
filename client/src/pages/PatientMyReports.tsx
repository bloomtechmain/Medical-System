import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical, Pill, ScanLine, ClipboardList, Syringe, FileText,
  Building2, Stethoscope, MapPin, Eye, Trash2, Upload, X,
  Search, FolderOpen, Plus, Calendar, Clock, Filter,
} from 'lucide-react';
import { patientReportApi, labApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { SERVER_ORIGIN } from '../env';

const API_BASE = SERVER_ORIGIN || 'http://localhost:5000';

// ── Report type definitions ───────────────────────────────────────────────────
const PERSONAL_TYPES = [
  { value: 'lab_report',        label: 'Lab Report',        icon: FlaskConical, grad: 'from-blue-500 to-indigo-600',   badge: 'bg-blue-100 text-blue-700',       light: 'bg-blue-50',    accent: 'text-blue-600'   },
  { value: 'prescription',      label: 'Prescription',      icon: Pill,         grad: 'from-emerald-500 to-teal-600',  badge: 'bg-emerald-100 text-emerald-700', light: 'bg-emerald-50', accent: 'text-emerald-600'},
  { value: 'imaging',           label: 'Imaging / X-Ray',   icon: ScanLine,     grad: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-700',   light: 'bg-violet-50',  accent: 'text-violet-600' },
  { value: 'discharge_summary', label: 'Discharge Summary', icon: ClipboardList,grad: 'from-orange-500 to-amber-600',  badge: 'bg-orange-100 text-orange-700',   light: 'bg-orange-50',  accent: 'text-orange-600' },
  { value: 'vaccination',       label: 'Vaccination',       icon: Syringe,      grad: 'from-teal-500 to-cyan-600',    badge: 'bg-teal-100 text-teal-700',       light: 'bg-teal-50',    accent: 'text-teal-600'   },
  { value: 'other',             label: 'Other',             icon: FileText,     grad: 'from-gray-500 to-slate-600',   badge: 'bg-gray-100 text-gray-700',       light: 'bg-gray-50',    accent: 'text-gray-600'   },
];

const typeInfo = (v: string) => PERSONAL_TYPES.find(t => t.value === v) || PERSONAL_TYPES[5];
const fmtDate  = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = { title: '', report_type: '', laboratory_name: '', doctor_name: '', hospital_clinic: '', issued_date: '', description: '' };

// ── Lab Report detail modal ───────────────────────────────────────────────────
function LabReportModal({ r, onClose }: { r: any; onClose: () => void }) {
  const isPDF = r.report_mimetype?.includes('pdf');
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Lab Report'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.created_at)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><X size={15}/></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Doctor',    value: r.doctor_name ? `Dr. ${r.doctor_name}` : '—' },
              { label: 'Lab',       value: r.lab_name || '—' },
              { label: 'Date',      value: formatDate(r.created_at) },
              { label: 'Status',    value: r.status === 'completed' ? '✅ Ready' : r.status === 'in_progress' ? '🔄 Processing' : '⏳ Pending' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
            <p className="text-[10px] font-bold text-cyan-600 uppercase mb-1">Tests Requested</p>
            <p className="text-sm text-gray-800">{r.test_description}</p>
          </div>
          {r.report_notes && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
              <p className="text-[10px] font-bold text-teal-600 uppercase mb-1">Lab Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.report_notes}</p>
            </div>
          )}
          {r.report_file && (
            <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3.5 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors">
              <span className="text-2xl">{isPDF ? '📄' : '🖼️'}</span>
              <div>
                <p className="text-sm font-bold text-primary-700">{isPDF ? 'Open PDF Report' : 'View Report Image'}</p>
                <p className="text-xs text-gray-500">Click to open in new tab</p>
              </div>
            </a>
          )}
          {!r.report_file && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-700">
              <Clock size={14}/> Waiting for the laboratory to upload the report file
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [file, setFile]     = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string,string>>({});

  const mutation = useMutation({
    mutationFn: (fd: FormData) => patientReportApi.create(fd),
    onSuccess,
    onError: (e: any) => setErrors({ submit: e.message || 'Upload failed' }),
  });

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.title.trim())   e.title       = 'Title is required';
    if (!form.report_type)    e.report_type  = 'Report type is required';
    if (!form.issued_date)    e.issued_date  = 'Date is required';
    if (!file)                e.file         = 'Select a file to upload';
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    fd.append('file', file!);
    mutation.mutate(fd);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-100 rounded-xl flex items-center justify-center">
              <Upload size={14} className="text-primary-600"/>
            </div>
            <p className="text-sm font-bold text-gray-900">Upload Health Report</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"><X size={15}/></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 p-5 space-y-4">
          {errors.submit && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errors.submit}</p>}

          <div>
            <label className="label">Report Title *</label>
            <input className={`input ${errors.title ? 'border-red-400' : ''}`} placeholder="e.g. Blood Test – January 2025"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Report Type *</label>
              <select className={`input ${errors.report_type ? 'border-red-400' : ''}`}
                value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}>
                <option value="">Select type…</option>
                {PERSONAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {errors.report_type && <p className="text-xs text-red-500 mt-1">{errors.report_type}</p>}
            </div>
            <div>
              <label className="label">Issued Date *</label>
              <input type="date" className={`input ${errors.issued_date ? 'border-red-400' : ''}`}
                max={today()} value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} />
              {errors.issued_date && <p className="text-xs text-red-500 mt-1">{errors.issued_date}</p>}
            </div>
          </div>

          {form.report_type === 'lab_report' && (
            <div>
              <label className="label">Laboratory Name</label>
              <input className="input" placeholder="e.g. City Medical Laboratory"
                value={form.laboratory_name} onChange={e => setForm(f => ({ ...f, laboratory_name: e.target.value }))} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Doctor Name</label>
              <input className="input" placeholder="Dr. Smith" value={form.doctor_name}
                onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Hospital / Clinic</label>
              <input className="input" placeholder="National Hospital" value={form.hospital_clinic}
                onChange={e => setForm(f => ({ ...f, hospital_clinic: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input resize-none" placeholder="What does this report include?"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <label className="label">Report File *</label>
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
                ${errors.file ? 'border-red-400 bg-red-50' : file ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-400 hover:bg-gray-50'}`}>
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                  <span className="text-2xl">{file.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                  <div className="text-left">
                    <p className="font-medium truncate max-w-[240px]">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size/1024/1024).toFixed(2)} MB</p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">
                  <Upload size={22} className="mx-auto mb-1.5 opacity-40"/>
                  <p className="text-sm"><span className="text-primary-600 font-medium">Click to upload</span></p>
                  <p className="text-xs mt-0.5">PDF, JPG, PNG, TIFF — max 20 MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif"
              onChange={e => { setFile(e.target.files?.[0] || null); setErrors(er => ({...er,file:''})); }} />
            {errors.file && <p className="text-xs text-red-500 mt-1">{errors.file}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button type="submit" disabled={mutation.isPending}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
              {mutation.isPending ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Uploading…</> : <><Upload size={14}/>Upload Report</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PatientMyReports() {
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [typeFilter,setTypeFilter]= useState('all');  // 'all' | 'personal' | 'lab' | personal type value
  const [showUpload,setShowUpload]= useState(false);
  const [viewingLab,setViewingLab]= useState<any>(null);
  const [viewingId, setViewingId] = useState<number|null>(null);
  const [deleteId,  setDeleteId]  = useState<number|null>(null);
  const [toast,     setToast]     = useState<{msg:string;type:string}|null>(null);

  const { data: personal = [] } = useQuery({ queryKey: ['patient-reports'],     queryFn: patientReportApi.getAll });
  const { data: lab      = [] } = useQuery({ queryKey: ['patient-lab-reports'], queryFn: labApi.getAll });

  const showToast = (msg: string, type = 'success') => { setToast({msg,type}); setTimeout(() => setToast(null), 3000); };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => patientReportApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patient-reports'] }); setDeleteId(null); showToast('Report deleted.'); },
    onError:   (e: any) => showToast(e.message || 'Delete failed', 'error'),
  });

  const handleView = async (id: number) => {
    setViewingId(id);
    try {
      const blob = await patientReportApi.getFile(id);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { showToast('Could not open file', 'error'); }
    finally { setViewingId(null); }
  };

  // ── Merge all reports into one flat list ──────────────────────────────────
  const allItems = useMemo(() => {
    const personalItems = (personal as any[]).map((r: any) => ({
      id:        `p-${r.id}`,
      _id:       r.id,
      source:    'personal' as const,
      title:     r.title,
      subtitle:  [r.laboratory_name, r.doctor_name ? `Dr. ${r.doctor_name}` : null, r.hospital_clinic].filter(Boolean).join(' · '),
      date:      r.issued_date || r.created_at,
      typeValue: r.report_type,
      typeLabel: typeInfo(r.report_type).label,
      status:    null,
      raw:       r,
    }));

    const labItems = (lab as any[]).map((r: any) => ({
      id:        `l-${r.id}`,
      _id:       r.id,
      source:    'lab' as const,
      title:     r.test_description || 'Lab Test',
      subtitle:  [r.lab_name, r.doctor_name ? `Dr. ${r.doctor_name}` : null].filter(Boolean).join(' · '),
      date:      r.created_at,
      typeValue: 'lab_system',
      typeLabel: 'Lab Request',
      status:    r.status,
      raw:       r,
    }));

    return [...personalItems, ...labItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [personal, lab]);

  // ── Search + filter ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allItems.filter(item => {
      // Type filter
      if (typeFilter === 'personal' && item.source !== 'personal') return false;
      if (typeFilter === 'lab'      && item.source !== 'lab')      return false;
      if (!['all','personal','lab'].includes(typeFilter) && item.typeValue !== typeFilter) return false;
      // Search
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q)     ||
        item.subtitle.toLowerCase().includes(q)  ||
        item.typeLabel.toLowerCase().includes(q) ||
        (item.raw.description || '').toLowerCase().includes(q) ||
        (item.raw.report_notes || '').toLowerCase().includes(q)
      );
    });
  }, [allItems, typeFilter, search]);

  const total       = allItems.length;
  const labReady    = (lab as any[]).filter((r: any) => r.status === 'completed').length;
  const pending     = (lab as any[]).filter((r: any) => r.status !== 'completed').length;

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">All your health reports — uploaded and from labs</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
          <Plus size={14} strokeWidth={2.5}/> Upload Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Reports', value:total,   color:'bg-primary-50 border-primary-100 text-primary-700', icon:'📁' },
          { label:'Lab Ready',     value:labReady, color:'bg-green-50  border-green-100  text-green-700',    icon:'✅' },
          { label:'Pending Tests', value:pending,  color:'bg-amber-50  border-amber-100  text-amber-700',    icon:'⏳' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <span className="text-xl">{s.icon}</span>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-70">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter bar */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2}/>
          <input
            type="text"
            placeholder="Search by report name, doctor, lab, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14}/>
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={13} className="text-gray-400 shrink-0" strokeWidth={2}/>
          {[
            { v: 'all',      label: `All (${allItems.length})` },
            { v: 'personal', label: `Personal (${(personal as any[]).length})` },
            { v: 'lab',      label: `Lab System (${(lab as any[]).length})` },
            ...(PERSONAL_TYPES.map(t => {
              const cnt = (personal as any[]).filter((r: any) => r.report_type === t.value).length;
              return cnt > 0 ? { v: t.value, label: `${t.label} (${cnt})` } : null;
            }).filter(Boolean) as { v: string; label: string }[]),
          ].map(chip => (
            <button key={chip.v} onClick={() => setTypeFilter(chip.v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                typeFilter === chip.v
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
              }`}>
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-20 text-center">
          <FolderOpen size={36} className="mx-auto text-gray-200 mb-3" strokeWidth={1.5}/>
          <p className="text-gray-600 font-semibold">
            {search ? `No results for "${search}"` : 'No reports yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {search ? 'Try a different search term or clear the filter.' : 'Upload your first report to keep health records organised.'}
          </p>
          {!search && (
            <button onClick={() => setShowUpload(true)}
              className="btn-primary mt-4 text-sm px-5 py-2 inline-flex items-center gap-2">
              <Plus size={13}/> Upload Report
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => {
            // ── Lab system card ────────────────────────────────────────────
            if (item.source === 'lab') {
              const r  = item.raw;
              const done = r.status === 'completed';
              const statusStyle = done
                ? { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50 border-green-200', label: 'Report Ready' }
                : r.status === 'in_progress'
                ? { dot: 'bg-blue-500',  text: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200',   label: 'Processing'   }
                : { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Pending'      };

              return (
                <div key={item.id}
                  onClick={() => setViewingLab(r)}
                  className={`bg-white rounded-2xl border cursor-pointer hover:shadow-md transition-all overflow-hidden
                    ${done ? 'border-green-200' : 'border-gray-100 hover:border-cyan-200'}`}>
                  {/* Status bar */}
                  <div className={`h-1 ${done ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : r.status === 'in_progress' ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : 'bg-gradient-to-r from-amber-300 to-orange-400'}`}/>

                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${done ? 'bg-green-100' : 'bg-cyan-100'}`}>
                        🔬
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.lab_name || 'Laboratory'}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusStyle.bg} ${statusStyle.text} flex items-center gap-1`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}/>
                            {statusStyle.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Calendar size={10}/> {fmtDate(r.created_at)}
                          {r.doctor_name && <span className="ml-1">· Dr. {r.doctor_name}</span>}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full shrink-0">Lab</span>
                    </div>

                    <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Tests</p>
                      <p className="text-xs text-gray-700 line-clamp-2">{r.test_description}</p>
                    </div>

                    {!done && (
                      <div className="flex items-center gap-2 text-xs text-amber-600">
                        <Clock size={11}/> Waiting for lab to upload report
                      </div>
                    )}
                    {done && (
                      <div className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200`}>
                        <Eye size={12}/> Click to view report
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // ── Personal report card ───────────────────────────────────────
            const r    = item.raw;
            const t    = typeInfo(r.report_type);
            const Icon = t.icon;
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all flex flex-col">
                {/* Coloured header */}
                <div className={`bg-gradient-to-br ${t.grad} px-4 pt-4 pb-7 relative overflow-hidden`}>
                  <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10"/>
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center">
                      <Icon size={16} strokeWidth={1.8} className="text-white"/>
                    </div>
                    <div className="flex items-center gap-1 text-white/80 text-[11px] font-semibold">
                      <Calendar size={10}/> {fmtDate(r.issued_date)}
                    </div>
                  </div>
                  <p className="text-white font-bold text-sm leading-snug mt-2.5 relative">{r.title}</p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-white/80 bg-white/15 px-2 py-0.5 rounded-full">
                    {t.label}
                  </span>
                </div>

                <div className="bg-slate-50/60 -mt-3 pt-4 px-4 pb-4 rounded-b-2xl flex flex-col gap-2.5 flex-1">
                  {r.description && <p className="text-xs text-gray-500 line-clamp-2">{r.description}</p>}

                  <div className="space-y-1">
                    {r.laboratory_name && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Building2 size={11} className={t.accent}/> {r.laboratory_name}
                      </div>
                    )}
                    {r.doctor_name && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Stethoscope size={11} className="text-gray-400"/> Dr. {r.doctor_name}
                      </div>
                    )}
                    {r.hospital_clinic && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin size={11} className="text-gray-400"/> {r.hospital_clinic}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                    <span>{r.file_original_name?.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
                    <span className="truncate">{r.file_original_name}</span>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => handleView(r.id)}
                      disabled={viewingId === r.id}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl ${t.light} ${t.accent} hover:opacity-80 disabled:opacity-50 transition-all`}
                    >
                      {viewingId === r.id
                        ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin"/>
                        : <Eye size={12} strokeWidth={2.5}/>
                      }
                      {viewingId === r.id ? 'Opening…' : 'View'}
                    </button>
                    <button
                      onClick={() => setDeleteId(r.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={12} strokeWidth={2.5}/>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lab detail modal */}
      {viewingLab && <LabReportModal r={viewingLab} onClose={() => setViewingLab(null)}/>}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['patient-reports'] });
            setShowUpload(false);
            showToast('Report uploaded successfully!');
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-3 mx-auto">
              <Trash2 size={18} className="text-red-600"/>
            </div>
            <h3 className="font-bold text-gray-900 text-center mb-1">Delete Report?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">This will permanently remove the report and its file.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1 py-2">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
