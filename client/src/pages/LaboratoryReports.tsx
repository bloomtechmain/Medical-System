import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { FlaskConical, Upload, Eye, X, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  pending:     { badge: 'bg-yellow-100 text-yellow-700', label: 'Pending'     },
  in_progress: { badge: 'bg-blue-100   text-blue-700',   label: 'In Progress' },
  completed:   { badge: 'bg-green-100  text-green-700',  label: 'Completed'   },
};

// ── Blood test field definitions ─────────────────────────────────────────────
interface BloodField {
  key: string; label: string; unit: string; min: number; max: number; step: string;
}
const CBC_FIELDS: BloodField[] = [
  { key: 'wbc',        label: 'WBC (White Blood Cells)', unit: '10³/µL', min: 4.5,  max: 11.0, step: '0.01' },
  { key: 'rbc',        label: 'RBC (Red Blood Cells)',   unit: '10⁶/µL', min: 4.5,  max: 6.0,  step: '0.01' },
  { key: 'hemoglobin', label: 'Hemoglobin (Hgb)',        unit: 'g/dL',   min: 12.0, max: 18.0, step: '0.1'  },
  { key: 'hematocrit', label: 'Hematocrit (Hct)',        unit: '%',      min: 37.0, max: 52.0, step: '0.1'  },
  { key: 'mcv',        label: 'MCV',                     unit: 'fL',     min: 80.0, max: 99.0, step: '0.1'  },
  { key: 'mch',        label: 'MCH',                     unit: 'pg',     min: 27.0, max: 34.5, step: '0.1'  },
  { key: 'mchc',       label: 'MCHC',                    unit: 'g/dL',   min: 32.0, max: 36.5, step: '0.1'  },
  { key: 'rdw',        label: 'RDW',                     unit: '%',      min: 11.0, max: 15.0, step: '0.1'  },
  { key: 'platelets',  label: 'Platelet Count',          unit: '10³/µL', min: 150,  max: 450,  step: '1'    },
  { key: 'mpv',        label: 'MPV',                     unit: 'fL',     min: 7.4,  max: 12.0, step: '0.1'  },
];
const METABOLIC_FIELDS: BloodField[] = [
  { key: 'blood_glucose', label: 'Blood Glucose (Fasting)', unit: 'mg/dL', min: 70,  max: 100,  step: '0.1' },
  { key: 'hba1c',         label: 'HbA1c',                   unit: '%',     min: 4.0, max: 5.6,  step: '0.1' },
  { key: 'creatinine',    label: 'Creatinine',               unit: 'mg/dL', min: 0.7, max: 1.2,  step: '0.01'},
];
const LIPID_FIELDS: BloodField[] = [
  { key: 'cholesterol',   label: 'Total Cholesterol', unit: 'mg/dL', min: 125, max: 200, step: '1' },
  { key: 'hdl',           label: 'HDL Cholesterol',   unit: 'mg/dL', min: 40,  max: 60,  step: '1' },
  { key: 'ldl',           label: 'LDL Cholesterol',   unit: 'mg/dL', min: 0,   max: 100, step: '1' },
  { key: 'triglycerides', label: 'Triglycerides',     unit: 'mg/dL', min: 0,   max: 150, step: '1' },
];

function statusBadge(value: string, min: number, max: number): { label: string; color: string } {
  const v = parseFloat(value);
  if (isNaN(v)) return { label: '', color: '' };
  if (v < min) return { label: 'Low',    color: 'text-blue-600 bg-blue-50' };
  if (v > max) return { label: 'High',   color: 'text-amber-600 bg-amber-50' };
  return           { label: 'Normal', color: 'text-teal-600 bg-teal-50' };
}

function BloodValueField({ field, value, onChange }: {
  field: BloodField;
  value: string;
  onChange: (v: string) => void;
}) {
  const badge = value ? statusBadge(value, field.min, field.max) : null;
  return (
    <div>
      <label className="block text-[11px] font-bold text-gray-600 mb-1">
        {field.label}
        <span className="text-gray-400 font-normal ml-1">({field.unit})</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={field.step}
          min={0}
          placeholder={`${field.min}–${field.max}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input text-sm py-2 flex-1"
        />
        {badge && badge.label && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5">Normal: {field.min} – {field.max}</p>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
interface UploadModalProps { req: any; onClose: () => void; onUploaded: () => void; }

function UploadModal({ req: r, onClose, onUploaded }: UploadModalProps) {
  const [file,      setFile]      = useState<File | null>(null);
  const [preview,   setPreview]   = useState<string | null>(null);
  const [notes,     setNotes]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [showCBC,      setShowCBC]      = useState(true);
  const [showMetabolic,setShowMetabolic]= useState(false);
  const [showLipid,    setShowLipid]    = useState(false);
  const [values,    setValues]    = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const setVal = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));

  const filledCount = Object.values(values).filter(v => v !== '' && v !== undefined).length;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Please select a report file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('report', file);
      if (notes.trim()) fd.append('report_notes', notes.trim());

      // Attach entered blood values as JSON
      const vitalsPayload: Record<string, number> = {};
      const allFields = [...CBC_FIELDS, ...METABOLIC_FIELDS, ...LIPID_FIELDS];
      allFields.forEach(f => {
        const raw = values[f.key];
        if (raw !== undefined && raw !== '') {
          const num = parseFloat(raw);
          if (!isNaN(num) && num > 0) vitalsPayload[f.key] = num;
        }
      });
      if (Object.keys(vitalsPayload).length > 0) {
        fd.append('vitals_data', JSON.stringify(vitalsPayload));
      }

      await labApi.uploadReport(r.id, fd);
      toast.success(`Report uploaded${Object.keys(vitalsPayload).length > 0 ? ` — ${Object.keys(vitalsPayload).length} vitals saved` : ''} · Doctor and patient notified!`);
      onUploaded(); onClose();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-teal-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center shadow">
              <Upload size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Upload Lab Report</p>
              <p className="text-xs text-gray-500">Patient: <span className="font-semibold text-gray-700">{r.patient_name}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">

          {/* Tests info */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">Tests Requested</p>
            <p className="text-sm text-gray-800 font-medium">{r.test_description}</p>
            {r.notes && <p className="text-xs text-gray-500 mt-1">Notes: {r.notes}</p>}
          </div>

          {/* ── Blood Test Values Section ────────────────────────────────── */}
          <div className="border border-teal-200 rounded-xl overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical size={15} className="text-white" strokeWidth={2} />
                <p className="text-sm font-bold text-white">Enter Test Results</p>
                <span className="text-[10px] bg-white/25 text-white px-2 py-0.5 rounded-full font-semibold">
                  Recommended
                </span>
              </div>
              {filledCount > 0 && (
                <span className="text-[10px] bg-white text-teal-700 font-bold px-2 py-0.5 rounded-full">
                  {filledCount} value{filledCount !== 1 ? 's' : ''} entered
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 px-4 py-2 bg-teal-50 border-b border-teal-100">
              Directly entering values ensures the patient's vitals update instantly and accurately — no OCR needed.
            </p>

            <div className="divide-y divide-gray-100">

              {/* CBC */}
              <div>
                <button type="button" onClick={() => setShowCBC(!showCBC)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    🩸 Complete Blood Count (CBC)
                    {CBC_FIELDS.filter(f => values[f.key]).length > 0 && (
                      <span className="text-[10px] bg-teal-100 text-teal-700 font-bold px-1.5 py-0.5 rounded-full">
                        {CBC_FIELDS.filter(f => values[f.key]).length} filled
                      </span>
                    )}
                  </span>
                  {showCBC ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>
                {showCBC && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-white">
                    {CBC_FIELDS.map(f => (
                      <BloodValueField key={f.key} field={f} value={values[f.key] || ''} onChange={v => setVal(f.key, v)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Metabolic */}
              <div>
                <button type="button" onClick={() => setShowMetabolic(!showMetabolic)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    ⚗️ Metabolic Panel
                    {METABOLIC_FIELDS.filter(f => values[f.key]).length > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                        {METABOLIC_FIELDS.filter(f => values[f.key]).length} filled
                      </span>
                    )}
                  </span>
                  {showMetabolic ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>
                {showMetabolic && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-white">
                    {METABOLIC_FIELDS.map(f => (
                      <BloodValueField key={f.key} field={f} value={values[f.key] || ''} onChange={v => setVal(f.key, v)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Lipid */}
              <div>
                <button type="button" onClick={() => setShowLipid(!showLipid)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    💧 Lipid Panel
                    {LIPID_FIELDS.filter(f => values[f.key]).length > 0 && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">
                        {LIPID_FIELDS.filter(f => values[f.key]).length} filled
                      </span>
                    )}
                  </span>
                  {showLipid ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>
                {showLipid && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-white">
                    {LIPID_FIELDS.map(f => (
                      <BloodValueField key={f.key} field={f} value={values[f.key] || ''} onChange={v => setVal(f.key, v)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="label">
              Report File <span className="text-red-400">*</span>
              <span className="text-gray-400 font-normal ml-1">— PDF, JPG, PNG, TIFF · Max 20 MB</span>
            </label>

            {!file ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-teal-400 hover:bg-teal-50 transition-colors group">
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-teal-600">
                  <Upload size={24} strokeWidth={1.5} />
                  <p className="text-sm font-medium">Click to select report file</p>
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
                  <button type="button"
                    onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 font-medium">
                    Change
                  </button>
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
            <label className="label">
              Report Notes / Findings
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <textarea rows={2} className="input resize-none text-sm"
              placeholder="Summarize key findings, abnormal values, recommendations..."
              value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
          </div>

          {/* Summary */}
          {filledCount > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
              <FlaskConical size={18} className="text-teal-600 shrink-0" />
              <p className="text-sm text-teal-800 font-medium">
                <span className="font-bold">{filledCount} blood value{filledCount !== 1 ? 's' : ''}</span> will be saved to the patient's vitals automatically.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button type="submit" disabled={uploading || !file}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Uploading & saving vitals...
                </>
              ) : (
                <>
                  <Upload size={15} strokeWidth={2} />
                  Upload Report {filledCount > 0 ? `& Save ${filledCount} Vitals` : '& Notify'}
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── View Modal ────────────────────────────────────────────────────────────────
interface ViewModalProps { req: any; onClose: () => void; }

function ViewModal({ req: r, onClose }: ViewModalProps) {
  const isPDF = r.report_mimetype?.includes('pdf');
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-100 rounded-xl flex items-center justify-center">
              <Eye size={14} className="text-cyan-700" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Report — {r.patient_name}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            <X size={15} />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Patient',   value: r.patient_name },
              { label: 'Doctor',    value: r.doctor_name ? `Dr. ${r.doctor_name}` : '—' },
              { label: 'Requested', value: formatDate(r.created_at) },
              { label: 'Email',     value: r.patient_email || '—' },
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LaboratoryReports() {
  const [uploading, setUploading] = useState<any>(null);
  const [viewing,   setViewing]   = useState<any>(null);
  const [filter,    setFilter]    = useState('all');
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['lab-assigned-requests'],
    queryFn:  labApi.getAll,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => labApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lab-assigned-requests'] }); toast.success('Status updated'); },
  });

  const openUpload = async (id: number) => {
    try { setUploading(await labApi.getOne(id)); }
    catch { toast.error('Failed to load request'); }
  };

  const openView = async (id: number) => {
    try { setViewing(await labApi.getOne(id)); }
    catch { toast.error('Failed to load report'); }
  };

  const filtered = filter === 'all' ? requests : (requests as any[]).filter((r: any) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lab Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Process test requests, enter results, and upload reports</p>
        </div>
        <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
          className="input text-sm py-1.5 w-36">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Requests', value: (requests as any[]).length,                                                   icon: '📋', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: 'Pending',        value: (requests as any[]).filter((r: any) => r.status === 'pending').length,   icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Completed',      value: (requests as any[]).filter((r: any) => r.status === 'completed').length, icon: '✅', bg: 'bg-green-50  border-green-100'  },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <span className="w-6 h-6 border-2 border-gray-200 border-t-cyan-400 rounded-full animate-spin block mx-auto mb-2" />
          Loading...
        </div>
      ) : (filtered as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">No requests assigned yet</p>
          <p className="text-sm text-gray-400 mt-1">Doctors will send lab test requests here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(filtered as any[]).map((r: any) => {
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
                      <p className="text-xs text-gray-400 mt-0.5">
                        Dr. {r.doctor_name} · {formatDate(r.created_at)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {r.status === 'pending' && (
                      <>
                        <button onClick={() => statusMutation.mutate({ id: r.id, status: 'in_progress' })}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                          Start Processing
                        </button>
                        <button onClick={() => openUpload(r.id)}
                          className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 justify-center">
                          <Upload size={11} /> Upload Report
                        </button>
                      </>
                    )}
                    {r.status === 'in_progress' && (
                      <button onClick={() => openUpload(r.id)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 justify-center">
                        <Upload size={11} /> Upload Report
                      </button>
                    )}
                    {r.status === 'completed' && (
                      <button onClick={() => openView(r.id)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 justify-center">
                        <Eye size={11} /> View Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {uploading && (
        <UploadModal
          req={uploading}
          onClose={() => setUploading(null)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ['lab-assigned-requests'] })}
        />
      )}
      {viewing && <ViewModal req={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
