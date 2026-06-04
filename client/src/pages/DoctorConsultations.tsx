import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { consultationApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

function useDebounce(value: string, delay = 400) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
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
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: [queryKey, dq],
    queryFn: () => fetchFn(dq),
    enabled: open && dq.length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="label">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2.5">
          <div>{renderSelected(selected)}</div>
          <button type="button" onClick={() => { onSelect(null); setQ(''); }}
            className="text-gray-400 hover:text-red-500 ml-2 text-xs">✕ Change</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              className="input pl-8"
              placeholder={placeholder}
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
            />
            {isFetching && (
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </div>
          {open && (results as any[]).length > 0 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-52 overflow-y-auto">
              {(results as any[]).map((item: any) => (
                <li
                  key={item.id}
                  onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                  className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0"
                >
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          )}
          {open && dq.length >= 1 && (results as any[]).length === 0 && !isFetching && (
            <div className="absolute z-40 mt-1 w-full bg-white rounded-xl shadow border border-gray-100 px-4 py-3 text-sm text-gray-400">
              No results for "{dq}"
            </div>
          )}
        </>
      )}
    </div>
  );
}

const emptyMed = () => ({ medicine_name: '', dosage: '', frequency: '', duration: '' });

interface NewConsultationModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewConsultationModal({ onClose, onSaved }: NewConsultationModalProps) {
  const [fields, setFields] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    doctor_name: '', hospital_clinic: '',
    sick_description: '', diagnosis: '', treatment_description: '',
    lab_tests_requested: '',
  });
  const [selectedPatient,     setSelectedPatient]     = useState<any>(null);
  const [selectedPharmacist,  setSelectedPharmacist]  = useState<any>(null);
  const [selectedLaboratory,  setSelectedLaboratory]  = useState<any>(null);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sf = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));

  const addMed    = () => setMedicines(prev => [...prev, emptyMed()]);
  const removeMed = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i));
  const changeMed = (i: number, k: string, v: string) => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [k]: v } : m));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return toast.error('Please select a patient');
    if (!fields.visit_date) return toast.error('Visit date is required');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('patient_id', selectedPatient.id);
      if (selectedPharmacist)  fd.append('assigned_pharmacist_id',  selectedPharmacist.id);
      if (selectedLaboratory)  fd.append('assigned_laboratory_id',  selectedLaboratory.id);
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      fd.append('manual_medicines', JSON.stringify(medicines.filter(m => m.medicine_name.trim())));
      if (file) fd.append('prescription', file);

      const result = await consultationApi.create(fd);
      const found = result.ocr_medicines_found || 0;

      const labMsg = selectedLaboratory && fields.lab_tests_requested
        ? ` · Lab sent to ${selectedLaboratory.lab_name || selectedLaboratory.name}`
        : fields.lab_tests_requested ? ' · Patient to choose lab' : '';

      toast.success(
        `Consultation saved${found > 0 ? ` · ${found} medicine${found > 1 ? 's' : ''} auto-extracted` : ''}` +
        (selectedPharmacist ? ' · Pharmacy notified' : '') +
        labMsg +
        ' · Patient notified'
      );
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Patient Consultation</h2>
            <p className="text-xs text-gray-400 mt-0.5">Add prescription, assign pharmacy &amp; laboratory, and notify patient</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">

          {/* Patient selection */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Select Patient</h3>
            <SearchDropdown
              label="Search Patient *"
              placeholder="Type patient name or email..."
              fetchFn={userApi.searchPatients}
              queryKey="search-patients"
              selected={selectedPatient}
              onSelect={setSelectedPatient}
              renderItem={(p) => (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.email} {p.blood_type ? `· Blood: ${p.blood_type}` : ''}</p>
                  </div>
                </div>
              )}
              renderSelected={(p) => (
                <div className="flex items-center gap-2">
                  <span className="text-lg">👤</span>
                  <div>
                    <p className="text-sm font-semibold text-primary-700">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.email} {p.blood_type ? `· ${p.blood_type}` : ''}</p>
                  </div>
                </div>
              )}
            />
          </div>

          {/* Visit details */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Visit Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Visit Date <span className="text-red-400">*</span></label>
                <input type="date" className="input" value={fields.visit_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('visit_date', e.target.value)} required />
              </div>
              <div>
                <label className="label">Hospital / Clinic</label>
                <input className="input" placeholder="e.g., Nawaloka Hospital" value={fields.hospital_clinic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('hospital_clinic', e.target.value)} />
              </div>
              <div>
                <label className="label">Symptoms</label>
                <textarea rows={2} className="input resize-none" placeholder="Patient's symptoms..."
                  value={fields.sick_description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('sick_description', e.target.value)} />
              </div>
              <div>
                <label className="label">Diagnosis</label>
                <textarea rows={2} className="input resize-none" placeholder="Medical diagnosis..."
                  value={fields.diagnosis} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('diagnosis', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Treatment / Notes</label>
                <textarea rows={2} className="input resize-none" placeholder="Treatment plan, instructions..."
                  value={fields.treatment_description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('treatment_description', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Lab Test Request */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Lab Test Request
              <span className="ml-2 text-gray-400 normal-case font-normal">— optional, assign a lab or let the patient choose</span>
            </h3>
            <textarea rows={2} className="input resize-none mb-3"
              placeholder="e.g. Full Blood Count, Liver Function Tests, Blood Glucose, HbA1c…"
              value={fields.lab_tests_requested}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('lab_tests_requested', e.target.value)} />

            {fields.lab_tests_requested && (
              <div className="mt-1 mb-3">
                <SearchDropdown
                  label="Assign Laboratory (optional)"
                  placeholder="Search by lab name or address to send directly…"
                  fetchFn={userApi.searchLaboratories}
                  queryKey="search-labs-new"
                  selected={selectedLaboratory}
                  onSelect={setSelectedLaboratory}
                  renderItem={(l: any) => (
                    <div className="flex items-start gap-2">
                      <span className="text-lg">🔬</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{l.lab_name || l.name}</p>
                        <p className="text-xs text-gray-400">{l.address || l.email}</p>
                        {l.lab_type && <p className="text-xs text-cyan-600 capitalize">{l.lab_type.replace('_', ' ')}</p>}
                      </div>
                    </div>
                  )}
                  renderSelected={(l: any) => (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔬</span>
                      <div>
                        <p className="text-sm font-semibold text-cyan-700">{l.lab_name || l.name}</p>
                        <p className="text-xs text-gray-500">{l.address || l.email}</p>
                      </div>
                    </div>
                  )}
                />
                <p className="text-xs mt-2">
                  {selectedLaboratory
                    ? <span className="text-cyan-600">✓ Lab request will be sent directly to <strong>{selectedLaboratory.lab_name || selectedLaboratory.name}</strong> when you save.</span>
                    : <span className="text-gray-400">No lab assigned — patient will choose a laboratory from their consultations page.</span>
                  }
                </p>
              </div>
            )}
          </div>

          {/* Prescription upload */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Prescription
              <span className="ml-2 text-primary-600 normal-case font-normal">— upload image for auto OCR or add manually below</span>
            </h3>
            {!preview ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-primary-400 hover:bg-primary-50 transition-colors group">
                <div className="flex items-center justify-center gap-3 text-gray-400 group-hover:text-primary-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="text-left">
                    <p className="text-sm font-medium">Upload prescription image</p>
                    <p className="text-xs">JPG, PNG, WebP · Max 10MB · Auto-detects medicines via OCR</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="relative">
                <img src={preview} alt="Prescription" className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                <div className="absolute top-2 right-2 flex gap-2">
                  <span className="bg-primary-600 text-white text-xs px-2 py-1 rounded-full">🔍 OCR on save</span>
                  <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">✕</button>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {/* Medicines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Medicines</h3>
              <button type="button" onClick={addMed} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Medicine</button>
            </div>
            {medicines.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Upload prescription above for auto-detection, or add manually.</p>
            ) : (
              <div className="space-y-2">
                {medicines.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                    <input className="input text-sm py-1.5 col-span-12 sm:col-span-4" placeholder="Medicine name *" value={m.medicine_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'medicine_name', e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-4 sm:col-span-2" placeholder="Dosage" value={m.dosage} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'dosage', e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-4 sm:col-span-2" placeholder="Frequency" value={m.frequency} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'frequency', e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-3 sm:col-span-2" placeholder="Duration" value={m.duration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'duration', e.target.value)} />
                    <div className="col-span-1 sm:col-span-2 flex justify-end">
                      <button type="button" onClick={() => removeMed(i)} className="text-red-400 hover:text-red-600 p-1 rounded">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pharmacy assignment */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Assign Pharmacy
              <span className="ml-2 text-gray-400 normal-case font-normal">— optional, pharmacy will be notified</span>
            </h3>
            <SearchDropdown
              label="Search Pharmacy"
              placeholder="Search by pharmacy name, address, or pharmacist..."
              fetchFn={userApi.searchPharmacists}
              queryKey="search-pharmacists"
              selected={selectedPharmacist}
              onSelect={setSelectedPharmacist}
              renderItem={(p) => (
                <div className="flex items-start gap-2">
                  <span className="text-lg">💊</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.pharmacy_name || p.name}</p>
                    <p className="text-xs text-gray-400">{p.pharmacy_address || p.email}</p>
                    {p.specialization_area && <p className="text-xs text-primary-600">{p.specialization_area}</p>}
                  </div>
                </div>
              )}
              renderSelected={(p) => (
                <div className="flex items-center gap-2">
                  <span className="text-lg">💊</span>
                  <div>
                    <p className="text-sm font-semibold text-primary-700">{p.pharmacy_name || p.name}</p>
                    <p className="text-xs text-gray-500">{p.pharmacy_address || p.email}</p>
                  </div>
                </div>
              )}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {file ? 'Saving & reading prescription...' : 'Saving & notifying...'}
                </span>
              ) : '💾 Save & Notify Patient'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditConsultationModalProps {
  consultation: any;
  onClose: () => void;
  onSaved: () => void;
}

function EditConsultationModal({ consultation: c, onClose, onSaved }: EditConsultationModalProps) {
  const [fields, setFields] = useState({
    visit_date:            c.visit_date?.slice(0, 10) || '',
    hospital_clinic:       c.hospital_clinic        || '',
    sick_description:      c.sick_description       || '',
    diagnosis:             c.diagnosis              || '',
    treatment_description: c.treatment_description  || '',
  });
  const [medicines, setMedicines] = useState(
    (c.medicines || []).map((m: any) => ({
      medicine_name: m.medicine_name || '',
      dosage:        m.dosage        || '',
      frequency:     m.frequency     || '',
      duration:      m.duration      || '',
    }))
  );
  const [selectedPharmacist, setSelectedPharmacist] = useState<any>(
    c.assigned_pharmacist_id
      ? { id: c.assigned_pharmacist_id, pharmacy_name: c.pharmacy_name, pharmacy_address: c.pharmacy_address, name: c.pharmacist_name }
      : null
  );
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sf = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));
  const addMed    = () => setMedicines((p: any[]) => [...p, { medicine_name:'', dosage:'', frequency:'', duration:'' }]);
  const removeMed = (i: number) => setMedicines((p: any[]) => p.filter((_: any, idx: number) => idx !== i));
  const changeMed = (i: number, k: string, v: string) => setMedicines((p: any[]) => p.map((m: any, idx: number) => idx === i ? { ...m, [k]: v } : m));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.visit_date) return toast.error('Visit date is required');
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (selectedPharmacist) fd.append('assigned_pharmacist_id', selectedPharmacist.id);
      fd.append('manual_medicines', JSON.stringify(medicines.filter((m: any) => m.medicine_name.trim())));
      if (file) fd.append('prescription', file);

      await consultationApi.update(c.id, fd);
      toast.success('Consultation updated successfully');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Consultation</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Patient: <span className="font-semibold text-gray-700">{c.patient_name}</span>
              &nbsp;·&nbsp;Original date: {formatDate(c.visit_date)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Visit Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Visit Date <span className="text-red-400">*</span></label>
                <input type="date" className="input" value={fields.visit_date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('visit_date', e.target.value)} required />
              </div>
              <div>
                <label className="label">Hospital / Clinic</label>
                <input className="input" placeholder="e.g., Nawaloka Hospital"
                  value={fields.hospital_clinic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('hospital_clinic', e.target.value)} />
              </div>
              <div>
                <label className="label">Symptoms</label>
                <textarea rows={2} className="input resize-none" value={fields.sick_description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('sick_description', e.target.value)} />
              </div>
              <div>
                <label className="label">Diagnosis</label>
                <textarea rows={2} className="input resize-none" value={fields.diagnosis}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('diagnosis', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Treatment / Notes</label>
                <textarea rows={2} className="input resize-none" value={fields.treatment_description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf('treatment_description', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Medicines</h3>
              <button type="button" onClick={addMed} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Medicine</button>
            </div>
            {medicines.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No medicines. Add manually or upload a new prescription above.</p>
            ) : (
              <div className="space-y-2">
                {medicines.map((m: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                    <input className="input text-sm py-1.5 col-span-12 sm:col-span-4" placeholder="Medicine name *"
                      value={m.medicine_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'medicine_name', e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-4 sm:col-span-2" placeholder="Dosage"
                      value={m.dosage}    onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'dosage',    e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-4 sm:col-span-2" placeholder="Frequency"
                      value={m.frequency} onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'frequency', e.target.value)} />
                    <input className="input text-sm py-1.5 col-span-3 sm:col-span-2" placeholder="Duration"
                      value={m.duration}  onChange={(e: React.ChangeEvent<HTMLInputElement>) => changeMed(i, 'duration',  e.target.value)} />
                    <div className="col-span-1 sm:col-span-2 flex justify-end">
                      <button type="button" onClick={() => removeMed(i)} className="text-red-400 hover:text-red-600 p-1 rounded">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {file ? 'Saving & reading prescription...' : 'Saving changes...'}
                </span>
              ) : '✏️ Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DetailModalProps {
  consultation: any;
  onClose: () => void;
  onEdit: (c: any) => void;
}

function DetailModal({ consultation: c, onClose, onEdit }: DetailModalProps) {
  const [showOCR, setShowOCR] = useState(false);

  const STATUS_COLOR: Record<string, string> = { active: 'bg-yellow-100 text-yellow-700', dispensed: 'bg-green-100 text-green-700', completed: 'bg-gray-100 text-gray-600' };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Consultation — {formatDate(c.visit_date)}</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[c.status]}`}>{c.status}</span>
          </div>
          <div className="flex items-center gap-2">
            {c.status === 'active' && (
              <button
                onClick={() => { onClose(); onEdit(c); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Patient',  value: c.patient_name },
              { label: 'Pharmacy', value: c.pharmacy_name || c.pharmacist_name || '—' },
              { label: 'Date',     value: formatDate(c.visit_date) },
              { label: 'Hospital', value: c.hospital_clinic || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {[
            { label: 'Symptoms',  value: c.sick_description,      color: 'bg-orange-50 border-orange-100 text-orange-800' },
            { label: 'Diagnosis', value: c.diagnosis,             color: 'bg-blue-50   border-blue-100   text-blue-800'   },
            { label: 'Treatment', value: c.treatment_description, color: 'bg-teal-50   border-teal-100   text-teal-800'   },
          ].filter(r => r.value).map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <p className="text-xs font-bold uppercase opacity-60 mb-1">{label}</p>
              <p className="text-sm">{value}</p>
            </div>
          ))}

          {c.prescription_file && (
            <a href={`${API_BASE}/uploads/prescriptions/${c.prescription_file}`} target="_blank" rel="noreferrer">
              <img src={`${API_BASE}/uploads/prescriptions/${c.prescription_file}`} alt="Prescription"
                className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50 hover:opacity-90 cursor-zoom-in" />
            </a>
          )}

          {c.medicines?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Medicines ({c.medicines.length})</p>
              <div className="space-y-2">
                {c.medicines.map((m: any) => (
                  <div key={m.id} className="flex items-start gap-2 p-2.5 bg-white rounded-lg border border-gray-100">
                    <span className="text-base">💊</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{m.medicine_name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {m.dosage    && <span className="text-xs bg-blue-50   text-blue-700   px-2 py-0.5 rounded-full">{m.dosage}</span>}
                        {m.frequency && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{m.frequency}</span>}
                        {m.duration  && <span className="text-xs bg-green-50  text-green-700  px-2 py-0.5 rounded-full">{m.duration}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.source === 'ocr' ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                          {m.source === 'ocr' ? '🔍 OCR' : '✏️ Manual'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.ocr_text && (
            <div>
              <button onClick={() => setShowOCR(!showOCR)} className="text-xs text-gray-400 hover:text-gray-600">
                {showOCR ? '▲ Hide' : '▼ Show'} raw OCR text
              </button>
              {showOCR && (
                <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                  {c.ocr_text}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DoctorConsultations() {
  const [showForm, setShowForm]   = useState(false);
  const [selected, setSelected]   = useState<any>(null);
  const [editing,  setEditing]    = useState<any>(null);
  const qc = useQueryClient();

  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ['doctor-consultations'],
    queryFn: consultationApi.getAll,
  });

  const openDetail = async (id: number) => {
    try {
      const d = await consultationApi.getOne(id);
      setSelected(d);
    } catch { toast.error('Failed to load'); }
  };

  const STATUS_COLOR: Record<string, string> = {
    active:    'bg-yellow-100 text-yellow-700',
    dispensed: 'bg-green-100  text-green-700',
    completed: 'bg-gray-100   text-gray-500',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Consultations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create prescriptions for patients and assign pharmacies</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Consultation
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Consultations', value: (consultations as any[]).length,                                                              icon: '🩺', bg: 'bg-teal-50   border-teal-100'   },
          { label: 'Pending Dispense',    value: (consultations as any[]).filter((c: any) => c.status === 'active').length,    icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'Dispensed',           value: (consultations as any[]).filter((c: any) => c.status === 'dispensed').length, icon: '✅', bg: 'bg-green-50  border-green-100'  },
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
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading consultations...
        </div>
      ) : (consultations as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🩺</span>
          <p className="text-gray-600 font-medium">No consultations yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Consultation" to create your first prescription.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(consultations as any[]).map((c: any) => (
            <div key={c.id} onClick={() => openDetail(c.id)}
              className="bg-white rounded-xl border border-gray-100 p-5 hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">
                    {c.patient_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{c.patient_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(c.visit_date)}{c.hospital_clinic ? ` · ${c.hospital_clinic}` : ''}</p>
                    {c.diagnosis && <p className="text-sm text-gray-600 mt-1 line-clamp-1">Dx: {c.diagnosis}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {c.medicine_count > 0 && (
                        <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                          💊 {c.medicine_count} medicine{c.medicine_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {c.pharmacy_name && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                          🏪 {c.pharmacy_name}
                        </span>
                      )}
                      {c.prescription_file && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">📄 Rx</span>
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

      {showForm && (
        <NewConsultationModal
          onClose={() => setShowForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['doctor-consultations'] })}
        />
      )}
      {selected && (
        <DetailModal
          consultation={selected}
          onClose={() => setSelected(null)}
          onEdit={(c) => setEditing(c)}
        />
      )}
      {editing && (
        <EditConsultationModal
          consultation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['doctor-consultations'] })}
        />
      )}
    </div>
  );
}
