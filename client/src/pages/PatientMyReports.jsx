import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical, Pill, ScanLine, ClipboardList, Syringe, FileText,
  Building2, Stethoscope, MapPin, Eye, Trash2, Upload, X, Plus,
  FolderOpen, ArrowUpRight, Calendar, Clock,
} from 'lucide-react';
import { patientReportApi, labApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const REPORT_TYPES = [
  { value: 'lab_report',        label: 'Lab Report',         grad: 'from-blue-500 to-indigo-600',    light: 'bg-blue-50',    accent: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700',    LucideIcon: FlaskConical  },
  { value: 'prescription',      label: 'Prescription',       grad: 'from-emerald-500 to-teal-600',   light: 'bg-emerald-50', accent: 'text-emerald-600',badge: 'bg-emerald-100 text-emerald-700',LucideIcon: Pill          },
  { value: 'imaging',           label: 'Imaging / X-Ray',    grad: 'from-violet-500 to-purple-600',  light: 'bg-violet-50',  accent: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', LucideIcon: ScanLine      },
  { value: 'discharge_summary', label: 'Discharge Summary',  grad: 'from-orange-500 to-amber-600',   light: 'bg-orange-50',  accent: 'text-orange-600', badge: 'bg-orange-100 text-orange-700', LucideIcon: ClipboardList },
  { value: 'vaccination',       label: 'Vaccination Record', grad: 'from-teal-500 to-cyan-600',      light: 'bg-teal-50',    accent: 'text-teal-600',   badge: 'bg-teal-100 text-teal-700',    LucideIcon: Syringe       },
  { value: 'other',             label: 'Other',              grad: 'from-gray-500 to-slate-600',     light: 'bg-gray-50',    accent: 'text-gray-600',   badge: 'bg-gray-100 text-gray-700',    LucideIcon: FileText      },
];

const EMPTY_FORM = {
  title: '',
  report_type: '',
  laboratory_name: '',
  doctor_name: '',
  hospital_clinic: '',
  issued_date: '',
  description: '',
};

const typeInfo = (v) => REPORT_TYPES.find(t => t.value === v) || REPORT_TYPES[5];
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today     = () => new Date().toISOString().split('T')[0];

export default function PatientMyReports() {
  const qc      = useQueryClient();
  const fileRef = useRef(null);

  const [activeTab, setActiveTab] = useState('personal');
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [file,      setFile]      = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [viewingId, setViewingId] = useState(null);
  const [deleteId,  setDeleteId]  = useState(null);
  const [errors,    setErrors]    = useState({});
  const [toast,     setToast]     = useState(null);
  const [selectedLabReport, setSelectedLabReport] = useState(null);

  // ── data ─────────────────────────────────────────────────────────────────
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['patient-reports'],
    queryFn: patientReportApi.getAll,
  });

  const { data: labReports = [], isLoading: labLoading } = useQuery({
    queryKey: ['patient-lab-reports'],
    queryFn:  labApi.getAll,
  });

  const filtered = filter === 'all' ? reports : reports.filter(r => r.report_type === filter);

  const stats = {
    total:    reports.length,
    labTests: labReports.length,
    latest:   reports.length ? fmtDate(reports[0].issued_date) : '—',
  };

  // ── helpers ───────────────────────────────────────────────────────────────
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setFile(null);
    setErrors({});
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim())    errs.title       = 'Title is required';
    if (!form.report_type)     errs.report_type  = 'Report type is required';
    if (!form.issued_date)     errs.issued_date  = 'Issued date is required';
    if (form.report_type === 'lab_report' && !form.laboratory_name.trim())
                               errs.laboratory_name = 'Laboratory name is required for lab reports';
    if (!file)                 errs.file         = 'Please select a file to upload';
    return errs;
  };

  // ── mutations ─────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (fd) => patientReportApi.create(fd),
    onSuccess: () => {
      qc.invalidateQueries(['patient-reports']);
      closeModal();
      showToast('Report uploaded successfully!');
    },
    onError: (err) => showToast(err.message || 'Upload failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => patientReportApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries(['patient-reports']);
      setDeleteId(null);
      showToast('Report deleted.');
    },
    onError: (err) => showToast(err.message || 'Delete failed', 'error'),
  });

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    fd.append('file', file);
    uploadMutation.mutate(fd);
  };

  const handleView = async (id) => {
    setViewingId(id);
    try {
      const blob = await patientReportApi.getFile(id);
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      showToast('Could not open the file', 'error');
    } finally {
      setViewingId(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'error'
            ? 'bg-red-50 text-red-800 border border-red-200'
            : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">All your health reports — personal uploads and lab results</p>
        </div>
        {activeTab === 'personal' && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Upload size={14} strokeWidth={2} />
            Upload Report
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-gray-100 rounded-2xl p-1">
        <button
          onClick={() => setActiveTab('personal')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'personal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderOpen size={14} strokeWidth={2} />
          Personal Reports
          {reports.length > 0 && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{reports.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('lab')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
            activeTab === 'lab' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FlaskConical size={14} strokeWidth={2} />
          Lab Reports
          {labReports.filter(r => r.status === 'completed').length > 0 && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              {labReports.filter(r => r.status === 'completed').length} ready
            </span>
          )}
        </button>
      </div>

      {/* iOS Stat tiles */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label:'My Reports',   value:stats.total,    grad:'from-blue-500 to-indigo-600',   shadow:'shadow-blue-200/60'   },
          { label:'Lab Tests',    value:stats.labTests, grad:'from-teal-500 to-emerald-600',  shadow:'shadow-teal-200/60'   },
          { label:'Latest',       value:stats.latest,   grad:'from-violet-500 to-purple-600', shadow:'shadow-violet-200/60' },
        ].map(s => (
          <div key={s.label} className="ios-stat-tile relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3 shadow-lg ${s.shadow}`}>
              <ArrowUpRight size={16} strokeWidth={2.5} className="text-white" />
            </div>
            <p className="text-3xl font-bold text-gray-900 tracking-tight leading-none relative">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 relative">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Personal Reports tab ── */}
      {activeTab === 'personal' && <>
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            filter === 'all'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
          }`}
        >
          All ({reports.length})
        </button>
        {REPORT_TYPES.map(t => {
          const cnt = reports.filter(r => r.report_type === t.value).length;
          if (!cnt) return null;
          return (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === t.value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              {t.label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Reports grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading reports…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-3">📂</div>
          <p className="font-semibold text-gray-600">No reports found</p>
          <p className="text-sm text-gray-400 mt-1">
            {filter !== 'all'
              ? 'No reports in this category yet.'
              : 'Upload your first report to keep your health records organised.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(report => {
            const t    = typeInfo(report.report_type);
            const Icon = t.LucideIcon || FileText;
            return (
              <div key={report.id} className="ios-tile flex flex-col">

                {/* Gradient header */}
                <div className={`relative bg-gradient-to-br ${t.grad} px-4 pt-4 pb-8 overflow-hidden`}>
                  <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10" />
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shadow-md">
                      <Icon size={18} strokeWidth={1.8} className="text-white" />
                    </div>
                    <span className="text-white/80 text-[11px] font-semibold flex items-center gap-1">
                      <Calendar size={10} strokeWidth={2} />
                      {fmtDate(report.issued_date)}
                    </span>
                  </div>
                  <p className="text-white font-bold text-sm leading-snug mt-3 relative">{report.title}</p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-white/70 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">
                    {t.label}
                  </span>
                </div>

                {/* White body */}
                <div className="bg-slate-50/60 -mt-4 pt-5 px-4 pb-4 rounded-b-3xl flex flex-col gap-3 flex-1">

                  {report.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{report.description}</p>
                  )}

                  {/* Meta */}
                  <div className="space-y-1.5">
                    {report.laboratory_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Building2 size={11} strokeWidth={2} className={t.accent} />
                        <span className="font-semibold">{report.laboratory_name}</span>
                      </div>
                    )}
                    {report.doctor_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Stethoscope size={11} strokeWidth={2} className="text-gray-400" />
                        <span>Dr. {report.doctor_name}</span>
                      </div>
                    )}
                    {report.hospital_clinic && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MapPin size={11} strokeWidth={2} className="text-gray-400" />
                        <span>{report.hospital_clinic}</span>
                      </div>
                    )}
                </div>

                {/* File badge */}
                <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                  <span>{report.file_original_name?.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
                  <span className="truncate">{report.file_original_name}</span>
                </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleView(report.id)}
                      disabled={viewingId === report.id}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl ${t.light} ${t.accent} hover:opacity-80 disabled:opacity-50 transition-all`}
                    >
                      {viewingId === report.id
                        ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        : <Eye size={13} strokeWidth={2.5} />
                      }
                      {viewingId === report.id ? 'Opening…' : 'View'}
                    </button>
                    <button
                      onClick={() => setDeleteId(report.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </> /* end personal tab */}

      {/* ── Lab Reports tab ── */}
      {activeTab === 'lab' && (
        <div className="space-y-4">
          {labLoading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
              Loading lab reports…
            </div>
          ) : labReports.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-3">🔬</div>
              <p className="font-semibold text-gray-600">No lab reports yet</p>
              <p className="text-sm text-gray-400 mt-1">When your doctor requests lab tests and the laboratory uploads results, they will appear here.</p>
            </div>
          ) : (
            <>
              {/* Lab stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:'Total Tests',   value:labReports.length,                                        grad:'from-cyan-500 to-sky-600'     },
                  { label:'In Progress',   value:labReports.filter(r=>r.status!=='completed').length,       grad:'from-amber-500 to-orange-500'  },
                  { label:'Reports Ready', value:labReports.filter(r=>r.status==='completed').length,       grad:'from-emerald-500 to-teal-600'  },
                ].map(s => (
                  <div key={s.label} className="ios-stat-tile relative overflow-hidden">
                    <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
                    <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3`}>
                      <ArrowUpRight size={14} strokeWidth={2.5} className="text-white" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{s.value}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {labReports.map(r => {
                  const isComplete = r.status === 'completed';
                  const statusCls = isComplete ? 'bg-emerald-100 text-emerald-700' :
                                    r.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                    'bg-amber-100 text-amber-700';
                  const statusLabel = isComplete ? '✅ Report Ready' : r.status === 'in_progress' ? '🔄 In Progress' : '⏳ Pending';
                  return (
                    <div key={r.id} className={`ios-tile overflow-hidden ${isComplete ? 'border-emerald-200' : ''}`}>
                      <div className={`h-1 w-full ${isComplete ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : r.status === 'in_progress' ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : 'bg-gradient-to-r from-amber-300 to-orange-400'}`} />
                      <div className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-base shrink-0 ${isComplete ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-cyan-500 to-sky-600'}`}>
                            {r.lab_name?.charAt(0)?.toUpperCase() || '🔬'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900">{r.lab_name || 'Laboratory'}</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {r.doctor_name ? `Dr. ${r.doctor_name} · ` : ''}{formatDate(r.created_at)}
                            </p>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Tests</p>
                          <p className="text-sm text-gray-700 line-clamp-2">{r.test_description}</p>
                        </div>

                        {r.report_notes && (
                          <div className="bg-teal-50 rounded-xl px-3.5 py-2.5 border border-teal-100">
                            <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-0.5">Lab Notes</p>
                            <p className="text-xs text-gray-700 line-clamp-2">{r.report_notes}</p>
                          </div>
                        )}

                        {isComplete && r.report_file && (
                          <a
                            href={`${(import.meta.env.VITE_API_URL?.replace('/api','') || 'http://localhost:5000')}/uploads/lab-reports/${r.report_file}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl hover:opacity-90 transition-opacity"
                          >
                            <Eye size={14} strokeWidth={2.5} />
                            View Lab Report
                          </a>
                        )}

                        {!isComplete && (
                          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                            <Clock size={12} strokeWidth={2} className="text-amber-400 shrink-0" />
                            Waiting for laboratory to complete and upload the report
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Delete Report?</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently remove the report and its file. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">Upload Health Report</h2>
                <p className="text-xs text-gray-400 mt-0.5">All fields marked * are required</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable form body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Report title */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Report Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Blood Test – January 2025"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.title ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
              </div>

              {/* Report type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Report Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.report_type}
                  onChange={e => setForm(f => ({ ...f, report_type: e.target.value, laboratory_name: '' }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.report_type ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select report type…</option>
                  {REPORT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.icon}  {t.label}</option>
                  ))}
                </select>
                {errors.report_type && <p className="text-xs text-red-500 mt-1">{errors.report_type}</p>}
              </div>

              {/* Laboratory name — only if lab_report */}
              {form.report_type === 'lab_report' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Laboratory Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. City Medical Laboratory"
                    value={form.laboratory_name}
                    onChange={e => setForm(f => ({ ...f, laboratory_name: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.laboratory_name ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                  {errors.laboratory_name && <p className="text-xs text-red-500 mt-1">{errors.laboratory_name}</p>}
                </div>
              )}

              {/* Issued date */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Issued Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.issued_date}
                  max={today()}
                  onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.issued_date ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.issued_date && <p className="text-xs text-red-500 mt-1">{errors.issued_date}</p>}
              </div>

              {/* Doctor name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Issuing Doctor <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. John Smith"
                  value={form.doctor_name}
                  onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Hospital / Clinic */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hospital / Clinic <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. National Hospital Colombo"
                  value={form.hospital_clinic}
                  onChange={e => setForm(f => ({ ...f, hospital_clinic: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Report Contents <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="What does this report include? e.g. Full Blood Count, Lipid Panel, Blood Glucose…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Report File <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    errors.file
                      ? 'border-red-400 bg-red-50'
                      : file
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
                  }`}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                      <span className="text-xl">{file.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                      <div className="text-left min-w-0">
                        <p className="font-medium truncate max-w-[260px]">{file.name}</p>
                        <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      <svg className="w-7 h-7 mx-auto mb-1.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="font-medium text-primary-600">Click to upload</span>
                      <p className="text-xs text-gray-400 mt-0.5">PDF, JPG, PNG, TIFF — up to 20 MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif"
                  onChange={e => {
                    setFile(e.target.files?.[0] || null);
                    setErrors(er => ({ ...er, file: undefined }));
                  }}
                />
                {errors.file && <p className="text-xs text-red-500 mt-1">{errors.file}</p>}
              </div>

              {/* Submit buttons */}
              <div className="flex gap-3 pt-1 pb-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadMutation.isPending}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Uploading…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload Report
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
