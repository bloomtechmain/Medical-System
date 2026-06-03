import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { consultationApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

interface MedicineEntry {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface MedicineRowProps {
  med: MedicineEntry;
  index: number;
  onChange: (index: number, key: string, val: string) => void;
  onRemove: (index: number) => void;
}

function MedicineRow({ med, index, onChange, onRemove }: MedicineRowProps) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="col-span-12 sm:col-span-4">
        <input
          className="input text-sm py-1.5"
          placeholder="Medicine name *"
          value={med.medicine_name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(index, 'medicine_name', e.target.value)}
          required
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <input
          className="input text-sm py-1.5"
          placeholder="Dosage"
          value={med.dosage}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(index, 'dosage', e.target.value)}
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <input
          className="input text-sm py-1.5"
          placeholder="Frequency"
          value={med.frequency}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(index, 'frequency', e.target.value)}
        />
      </div>
      <div className="col-span-8 sm:col-span-2">
        <input
          className="input text-sm py-1.5"
          placeholder="Duration"
          value={med.duration}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(index, 'duration', e.target.value)}
        />
      </div>
      <div className="col-span-4 sm:col-span-2 flex justify-end">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const emptyMed = (): MedicineEntry => ({ medicine_name: '', dosage: '', frequency: '', duration: '' });

interface ConsultationFormProps {
  onClose: () => void;
  onSaved: () => void;
}

function ConsultationForm({ onClose, onSaved }: ConsultationFormProps) {
  const [fields, setFields] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    doctor_name: '',
    hospital_clinic: '',
    sick_description: '',
    diagnosis: '',
    treatment_description: '',
  });
  const [medicines, setMedicines] = useState<MedicineEntry[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const addMed = () => setMedicines(prev => [...prev, emptyMed()]);
  const removeMed = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i));
  const changeMed = (i: number, key: string, val: string) =>
    setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: val } : m));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.visit_date) return toast.error('Visit date is required');

    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      fd.append('manual_medicines', JSON.stringify(medicines.filter(m => m.medicine_name.trim())));
      if (file) fd.append('prescription', file);

      const result = await consultationApi.create(fd);
      const found = result.ocr_medicines_found || 0;
      toast.success(
        found > 0
          ? `Consultation saved — ${found} medicine${found > 1 ? 's' : ''} extracted from prescription`
          : 'Consultation saved successfully'
      );
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save consultation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Medical Consultation</h2>
            <p className="text-xs text-gray-400 mt-0.5">Record your doctor visit and prescription</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Visit info */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Visit Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Visit Date <span className="text-red-400">*</span></label>
                <input type="date" className="input" value={fields.visit_date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFields(p => ({ ...p, visit_date: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Doctor Name</label>
                <input className="input" placeholder="Dr. Perera" value={fields.doctor_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFields(p => ({ ...p, doctor_name: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Hospital / Clinic</label>
                <input className="input" placeholder="e.g., Nawaloka Hospital, Colombo"
                  value={fields.hospital_clinic}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFields(p => ({ ...p, hospital_clinic: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Medical details */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Medical Details</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Symptoms / Sick Description <span className="text-red-400">*</span></label>
                <textarea rows={2} className="input resize-none"
                  placeholder="What symptoms did you have? (e.g., fever, headache, cough...)"
                  value={fields.sick_description} required
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFields(p => ({ ...p, sick_description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Doctor's Diagnosis</label>
                <textarea rows={2} className="input resize-none"
                  placeholder="What did the doctor diagnose? (e.g., Dengue fever, Viral infection...)"
                  value={fields.diagnosis}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFields(p => ({ ...p, diagnosis: e.target.value }))} />
              </div>
              <div>
                <label className="label">Treatment / How Doctor Treated You</label>
                <textarea rows={2} className="input resize-none"
                  placeholder="e.g., Prescribed medications, advised bed rest, recommended blood test..."
                  value={fields.treatment_description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFields(p => ({ ...p, treatment_description: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Prescription upload */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Prescription Upload
              <span className="ml-2 text-primary-600 normal-case font-normal">— system will auto-read medicines</span>
            </h3>

            {!preview ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-primary-400 hover:bg-primary-50 transition-colors group"
              >
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-primary-600">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium">Click to upload prescription image</p>
                  <p className="text-xs">JPG, PNG, WebP, BMP, TIFF · Max 10 MB</p>
                </div>
              </button>
            ) : (
              <div className="relative">
                <img src={preview} alt="Prescription preview" className="w-full max-h-56 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                <div className="absolute top-2 right-2 flex gap-2">
                  <span className="bg-primary-600 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                    🔍 Will be OCR-analyzed on save
                  </span>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="bg-red-500 text-white text-xs px-2 py-1 rounded-full hover:bg-red-600"
                  >✕ Remove</button>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">{file?.name}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {/* Manual medicines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Medicines
                <span className="ml-2 text-gray-400 normal-case font-normal">— add manually or upload prescription above</span>
              </h3>
              <button
                type="button"
                onClick={addMed}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                + Add Medicine
              </button>
            </div>

            {medicines.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                No medicines added yet. Upload prescription to auto-detect, or add manually above.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3">
                  {['Medicine Name', 'Dosage', 'Frequency', 'Duration', ''].map((h, i) => (
                    <p key={i} className={`text-xs text-gray-400 font-medium ${i === 0 ? 'col-span-4' : i === 4 ? 'col-span-2' : 'col-span-2'}`}>{h}</p>
                  ))}
                </div>
                {medicines.map((m, i) => (
                  <MedicineRow key={i} med={m} index={i} onChange={changeMed} onRemove={removeMed} />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1 py-2.5"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {file ? 'Saving & reading prescription...' : 'Saving...'}
                </span>
              ) : 'Save Consultation'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2.5">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MedicineCardProps {
  med: any;
}

function MedicineCard({ med }: MedicineCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
      <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-sm">💊</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{med.medicine_name}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {med.dosage    && <span className="text-xs bg-blue-50   text-blue-700   px-2 py-0.5 rounded-full">{med.dosage}</span>}
          {med.frequency && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{med.frequency}</span>}
          {med.duration  && <span className="text-xs bg-green-50  text-green-700  px-2 py-0.5 rounded-full">{med.duration}</span>}
          {med.notes     && <span className="text-xs bg-gray-100  text-gray-600   px-2 py-0.5 rounded-full">{med.notes}</span>}
        </div>
      </div>
    </div>
  );
}

interface ConsultationDetailProps {
  consultation: any;
  onClose: () => void;
  onDelete: (id: number) => void;
}

function ConsultationDetail({ consultation, onClose, onDelete }: ConsultationDetailProps) {
  const [showOCR, setShowOCR] = useState(false);
  const ocrMeds = consultation.medicines?.filter((m: any) => m.source === 'ocr') || [];
  const manualMeds = consultation.medicines?.filter((m: any) => m.source === 'manual') || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Consultation Details</h2>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(consultation.visit_date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {/* Visit info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Visit Date',       value: formatDate(consultation.visit_date) },
              { label: 'Doctor',           value: consultation.doctor_name },
              { label: 'Hospital/Clinic',  value: consultation.hospital_clinic },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value || <span className="text-gray-300">—</span>}</p>
              </div>
            ))}
          </div>

          {/* Medical details */}
          {[
            { label: 'Symptoms / Sick Description', value: consultation.sick_description, color: 'bg-orange-50 border-orange-100 text-orange-800' },
            { label: "Doctor's Diagnosis",           value: consultation.diagnosis,        color: 'bg-blue-50  border-blue-100  text-blue-800'   },
            { label: 'Treatment',                    value: consultation.treatment_description, color: 'bg-teal-50  border-teal-100  text-teal-800' },
          ].map(({ label, value, color }) => value ? (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1 opacity-70">{label}</p>
              <p className="text-sm">{value}</p>
            </div>
          ) : null)}

          {/* Prescription image */}
          {consultation.prescription_file && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Prescription Image</p>
              <a
                href={`${API_BASE}/uploads/prescriptions/${consultation.prescription_file}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`${API_BASE}/uploads/prescriptions/${consultation.prescription_file}`}
                  alt="Prescription"
                  className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50 hover:opacity-90 transition-opacity cursor-zoom-in"
                />
                <p className="text-xs text-primary-600 mt-1 text-center">Click to open full size</p>
              </a>
            </div>
          )}

          {/* Medicines */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Medicines Prescribed
              <span className="ml-2 text-gray-300 normal-case font-normal">
                ({consultation.medicines?.length || 0} total)
              </span>
            </p>

            {consultation.medicines?.length === 0 && (
              <p className="text-sm text-gray-400 italic">No medicines recorded.</p>
            )}

            {ocrMeds.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-primary-600 mb-2 flex items-center gap-1">
                  <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded text-xs">🔍 OCR</span>
                  Extracted from prescription ({ocrMeds.length})
                </p>
                <div className="space-y-2">
                  {ocrMeds.map((m: any) => (
                    <MedicineCard key={m.id} med={m} />
                  ))}
                </div>
              </div>
            )}

            {manualMeds.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">✏️ Manual</span>
                  Manually entered ({manualMeds.length})
                </p>
                <div className="space-y-2">
                  {manualMeds.map((m: any) => (
                    <MedicineCard key={m.id} med={m} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* OCR raw text toggle */}
          {consultation.ocr_text && (
            <div>
              <button
                onClick={() => setShowOCR(!showOCR)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                {showOCR ? '▲' : '▼'} {showOCR ? 'Hide' : 'Show'} raw OCR text
              </button>
              {showOCR && (
                <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                  {consultation.ocr_text}
                </pre>
              )}
            </div>
          )}

          {/* Delete */}
          <div className="pt-2 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => {
                if (window.confirm('Delete this consultation?')) { onDelete(consultation.id); onClose(); }
              }}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Consultation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MedicalDescription() {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const qc = useQueryClient();

  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ['consultations'],
    queryFn: consultationApi.getAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => consultationApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consultations'] }); toast.success('Consultation deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const openDetail = async (id: number) => {
    try {
      const detail = await consultationApi.getOne(id);
      setSelected(detail);
    } catch {
      toast.error('Failed to load consultation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medical Description</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your doctor visits, prescriptions, and medicines</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Consultation
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Visits',   value: (consultations as any[]).length,                                                                             icon: '🏥', bg: 'bg-blue-50   border-blue-100'   },
          { label: 'Total Medicines',value: (consultations as any[]).reduce((s: number, c: any) => s + (c.medicine_count || 0), 0), icon: '💊', bg: 'bg-teal-50   border-teal-100'   },
          { label: 'With Prescription', value: (consultations as any[]).filter((c: any) => c.prescription_file).length,              icon: '📄', bg: 'bg-purple-50 border-purple-100' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <span className="text-2xl">{s.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Consultations list */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading consultations...
        </div>
      ) : (consultations as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🩺</span>
          <p className="text-gray-600 font-medium">No consultations recorded yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Consultation" to log your first doctor visit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(consultations as any[]).map((c: any) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-gray-100 p-5 hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => openDetail(c.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-lg">🩺</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{formatDate(c.visit_date)}</p>
                      {c.doctor_name && (
                        <span className="text-xs text-gray-500">· Dr. {c.doctor_name.replace(/^Dr\.?\s*/i, '')}</span>
                      )}
                      {c.hospital_clinic && (
                        <span className="text-xs text-gray-400 truncate">· {c.hospital_clinic}</span>
                      )}
                    </div>
                    {c.sick_description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{c.sick_description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {c.medicine_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full font-medium">
                          💊 {c.medicine_count} medicine{c.medicine_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {c.prescription_file && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium">
                          📄 Prescription
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ConsultationForm
          onClose={() => setShowForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['consultations'] })}
        />
      )}
      {selected && (
        <ConsultationDetail
          consultation={selected}
          onClose={() => setSelected(null)}
          onDelete={(id: number) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}
