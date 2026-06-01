import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const STATUS_STYLE = {
  pending:     { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending'     },
  in_progress: { badge: 'bg-blue-100   text-blue-700',   label: 'In Progress' },
  completed:   { badge: 'bg-green-100  text-green-700',  label: 'Completed'   },
};

// ── Upload report modal ─────────────────────────────────────────
function UploadModal({ req: r, onClose, onUploaded }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [notes, setNotes]     = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error('Please select a report file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('report', file);
      if (notes) fd.append('report_notes', notes);
      await labApi.uploadReport(r.id, fd);
      toast.success('Report uploaded — doctor and patient notified!');
      onUploaded(); onClose();
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upload Lab Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">Patient: {r.patient_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Tests info */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
            <p className="text-xs font-bold text-cyan-700 mb-1">🧪 Tests Requested</p>
            <p className="text-sm text-gray-800">{r.test_description}</p>
            {r.notes && <p className="text-xs text-gray-500 mt-1.5">Notes: {r.notes}</p>}
          </div>

          {/* File upload */}
          <div>
            <label className="label">Report File <span className="text-red-400">*</span></label>
            <p className="text-xs text-gray-400 mb-2">Upload PDF, JPG, PNG, or any image format · Max 20 MB</p>

            {!file ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-cyan-400 hover:bg-cyan-50 transition-colors group">
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-cyan-600">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium">Click to upload report</p>
                  <p className="text-xs">PDF · JPG · PNG · WebP · TIFF · BMP</p>
                </div>
              </button>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{file.type.includes('pdf') ? '📄' : '🖼️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}</p>
                  </div>
                  <button type="button" onClick={() => { setFile(null); setPreview(null); fileRef.current.value = ''; }}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">Change</button>
                </div>
                {preview && (
                  <img src={preview} alt="Preview" className="mt-3 w-full max-h-40 object-contain rounded-lg border border-gray-200" />
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif" className="hidden" onChange={handleFile} />
          </div>

          {/* Report notes */}
          <div>
            <label className="label">Report Notes / Findings <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} className="input resize-none"
              placeholder="Summarize key findings, abnormal values, or recommendations..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
            ℹ️ Uploading will automatically notify the requesting doctor and patient.
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={uploading || !file} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Uploading & notifying...
                </span>
              ) : '📤 Upload Report & Notify'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── View report modal ───────────────────────────────────────────
function ViewModal({ req: r, onClose }) {
  const isPDF = r.report_mimetype?.includes('pdf');
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Report — {r.patient_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Patient',      value: r.patient_name },
              { label: 'Doctor',       value: r.doctor_name ? `Dr. ${r.doctor_name}` : '—' },
              { label: 'Requested',    value: formatDate(r.created_at) },
              { label: 'Patient Email',value: r.patient_email || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
            <p className="text-xs font-bold text-cyan-700 mb-1">🧪 Tests</p>
            <p className="text-sm text-gray-800">{r.test_description}</p>
          </div>
          {r.report_notes && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
              <p className="text-xs font-bold text-teal-700 mb-1">📝 Report Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.report_notes}</p>
            </div>
          )}
          {r.report_file && (
            <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors">
              <span className="text-2xl">{isPDF ? '📄' : '🖼️'}</span>
              <div>
                <p className="text-sm font-semibold text-primary-700">Open Uploaded Report</p>
                <p className="text-xs text-gray-500">{r.report_mimetype}</p>
              </div>
            </a>
          )}
          {!isPDF && r.report_file && (
            <img src={`${API_BASE}/uploads/lab-reports/${r.report_file}`} alt="Report"
              className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────
export default function LaboratoryReports() {
  const [uploading, setUploading] = useState(null);
  const [viewing,   setViewing]   = useState(null);
  const [filter, setFilter]       = useState('all');
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['lab-assigned-requests'],
    queryFn:  labApi.getAll,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => labApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries(['lab-assigned-requests']); toast.success('Status updated'); },
  });

  const openUpload = async (id) => {
    try { setUploading(await labApi.getOne(id)); }
    catch { toast.error('Failed to load'); }
  };

  const openView = async (id) => {
    try { setViewing(await labApi.getOne(id)); }
    catch { toast.error('Failed to load'); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lab Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Process assigned test requests and upload reports</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input text-sm py-1.5 w-36">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Requests', value: requests.length,                                      icon: '📋', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: 'Pending',        value: requests.filter(r => r.status === 'pending').length,    icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Completed',      value: requests.filter(r => r.status === 'completed').length,  icon: '✅', bg: 'bg-green-50  border-green-100'  },
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
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">No requests assigned yet</p>
          <p className="text-sm text-gray-400 mt-1">Doctors will send lab test requests here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const st = STATUS_STYLE[r.status];
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">
                      {r.patient_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{r.patient_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Dr. {r.doctor_name} · {formatDate(r.created_at)}</p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {r.status === 'pending' && (
                      <>
                        <button onClick={() => statusMutation.mutate({ id: r.id, status: 'in_progress' })}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">
                          Start Processing
                        </button>
                        <button onClick={() => openUpload(r.id)}
                          className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg font-medium">
                          📤 Upload Report
                        </button>
                      </>
                    )}
                    {r.status === 'in_progress' && (
                      <button onClick={() => openUpload(r.id)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium">
                        📤 Upload Report
                      </button>
                    )}
                    {r.status === 'completed' && (
                      <button onClick={() => openView(r.id)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium">
                        View Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploading && <UploadModal req={uploading} onClose={() => setUploading(null)} onUploaded={() => qc.invalidateQueries(['lab-assigned-requests'])} />}
      {viewing   && <ViewModal   req={viewing}   onClose={() => setViewing(null)} />}
    </div>
  );
}
