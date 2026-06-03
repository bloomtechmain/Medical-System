import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stethoscope, Thermometer, CheckCircle2, Clock, Package, Pill,
  MapPin, Calendar, ChevronDown, Pencil, X, Plus, Building2,
  ArrowUpRight, Info, FlaskConical, Send, Search, FileImage,
  Eye, Download, ExternalLink, Microscope, Activity, FileText,
} from 'lucide-react';
import { consultationApi, labApi, userApi } from '../services/api';
import { formatDate } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const PALETTES = [
  { grad: 'from-violet-500 to-purple-700',  step: 'bg-violet-500', accent: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', light: 'bg-violet-50', line: 'border-violet-200' },
  { grad: 'from-blue-500 to-indigo-700',    step: 'bg-blue-500',   accent: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700',     light: 'bg-blue-50',   line: 'border-blue-200'   },
  { grad: 'from-teal-500 to-emerald-700',   step: 'bg-teal-500',   accent: 'text-teal-600',   badge: 'bg-teal-100 text-teal-700',     light: 'bg-teal-50',   line: 'border-teal-200'   },
  { grad: 'from-rose-500 to-pink-700',      step: 'bg-rose-500',   accent: 'text-rose-600',   badge: 'bg-rose-100 text-rose-700',     light: 'bg-rose-50',   line: 'border-rose-200'   },
  { grad: 'from-amber-500 to-orange-600',   step: 'bg-amber-500',  accent: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700',   light: 'bg-amber-50',  line: 'border-amber-200'  },
  { grad: 'from-cyan-500 to-sky-700',       step: 'bg-cyan-500',   accent: 'text-cyan-600',   badge: 'bg-cyan-100 text-cyan-700',     light: 'bg-cyan-50',   line: 'border-cyan-200'   },
];

const STATUS_STYLE: Record<string, any> = {
  active:    { label: 'Active',    cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400'    },
  dispensed: { label: 'Dispensed', cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-400'     },
  completed: { label: 'Resolved',  cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400'  },
};

const EMPTY_MED = { medicine_name: '', dosage: '', frequency: '', duration: '' };
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function useDebounce(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function LabSearchDropdown({ selected, onSelect }: { selected: any; onSelect: (item: any) => void }) {
  const [q, setQ]       = useState('');
  const dq              = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-labs-consult', dq],
    queryFn:  () => userApi.searchLaboratories(dq),
    enabled:  open && dq.length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (selected) return (
    <div className="flex items-center justify-between bg-cyan-50 border border-cyan-200 rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <FlaskConical size={14} strokeWidth={2} className="text-cyan-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-cyan-700">{selected.lab_name || selected.name}</p>
          <p className="text-xs text-gray-400">{selected.address || selected.email}</p>
        </div>
      </div>
      <button type="button" onClick={() => { onSelect(null); setQ(''); }}
        className="text-gray-400 hover:text-red-500 text-xs font-medium">Change</button>
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
          placeholder="Search laboratory by name…"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-cyan-400 rounded-full animate-spin" />}
      </div>
      {open && dq.length >= 1 && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto">
          {(results as any[]).length === 0 && !isFetching
            ? <li className="px-4 py-3 text-sm text-gray-400">No laboratories found</li>
            : (results as any[]).map((l: any) => (
              <li key={l.id} onClick={() => { onSelect(l); setOpen(false); setQ(''); }}
                className="px-4 py-2.5 hover:bg-cyan-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2">
                <div className="w-7 h-7 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
                  <FlaskConical size={12} strokeWidth={2} className="text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{l.lab_name || l.name}</p>
                  <p className="text-xs text-gray-400">{l.address || l.email}</p>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

interface SendToLabModalProps {
  consultation: any;
  onClose: () => void;
  onSent?: () => void;
}

function SendToLabModal({ consultation, onClose, onSent }: SendToLabModalProps) {
  const [selectedLab, setSelectedLab] = useState<any>(null);
  const [error, setError]             = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => labApi.create({ consultation_id: consultation.id, laboratory_id: selectedLab.id }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['patient-lab-reports'] }); onSent?.(); onClose(); },
    onError: (err: any) => setError(err.message || 'Failed to send request'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-cyan-500 to-teal-600 px-5 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <FlaskConical size={16} strokeWidth={2} />
              </div>
              <div>
                <p className="font-bold">Send to Laboratory</p>
                <p className="text-white/70 text-xs">Choose a lab to process your tests</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl px-3.5 py-2.5">
            <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-0.5">Tests Requested</p>
            <p className="text-sm text-gray-700 leading-relaxed">{consultation.lab_tests_requested}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Select Laboratory <span className="text-red-400">*</span>
            </label>
            <LabSearchDropdown selected={selectedLab} onSelect={setSelectedLab} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => { if (!selectedLab) { setError('Please select a laboratory'); return; } mutation.mutate(); }}
              disabled={mutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <Send size={14} strokeWidth={2.5} /> Send to Lab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SelfRecordModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function SelfRecordModal({ onClose, onSaved }: SelfRecordModalProps) {
  const [fields, setFields] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    doctor_name: '', hospital_clinic: '',
    sick_description: '', diagnosis: '', treatment_description: '',
  });
  const [meds,       setMeds]       = useState<any[]>([]);
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sf = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));
  const addMed    = () => setMeds((m: any[]) => [...m, { ...EMPTY_MED }]);
  const removeMed = (i: number) => setMeds((m: any[]) => m.filter((_: any, j: number) => j !== i));
  const updMed    = (i: number, k: string, v: string) => setMeds((m: any[]) => m.map((x: any, j: number) => j === i ? { ...x, [k]: v } : x));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.visit_date) return setError('Visit date is required');
    if (!fields.sick_description.trim()) return setError('Symptoms are required');
    setError(''); setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      fd.append('manual_medicines', JSON.stringify(meds.filter((m: any) => m.medicine_name.trim())));
      if (file) fd.append('prescription', file);
      await consultationApi.create(fd);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-6 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Record My Visit</h2>
            <p className="text-xs text-gray-400 mt-0.5">Log a doctor visit or self-observation</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Visit Date *</label>
              <input type="date" required value={fields.visit_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('visit_date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Doctor Name</label>
              <input type="text" placeholder="Dr. Perera" value={fields.doctor_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('doctor_name', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Hospital / Clinic</label>
            <input type="text" placeholder="e.g., Nawaloka Hospital" value={fields.hospital_clinic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('hospital_clinic', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          {[
            { key: 'sick_description',      label: 'Symptoms *',     ph: 'What symptoms did you have?', req: true  },
            { key: 'diagnosis',             label: 'Diagnosis',      ph: 'What did the doctor diagnose?', req: false },
            { key: 'treatment_description', label: 'Treatment Plan', ph: 'Prescribed medications, etc.', req: false },
          ].map(({ key, label, ph, req }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
              <textarea rows={2} required={req} placeholder={ph} value={(fields as any)[key]} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf(key, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          ))}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              Prescription <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            {!preview ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-primary-400 hover:bg-primary-50 transition-colors group">
                <div className="flex items-center justify-center gap-2 text-gray-400 group-hover:text-primary-600">
                  <FileImage size={18} strokeWidth={1.5} />
                  <p className="text-sm font-medium">Upload prescription image</p>
                </div>
              </button>
            ) : (
              <div className="relative">
                <img src={preview} alt="Preview" className="w-full max-h-40 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">Remove</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Medicines</label>
              <button type="button" onClick={addMed}
                className="flex items-center gap-1 text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1.5 rounded-xl hover:bg-primary-100">
                <Plus size={11} strokeWidth={2.5} /> Add
              </button>
            </div>
            {meds.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 border-2 border-dashed border-gray-100 rounded-xl">No medicines added</p>
            ) : meds.map((m: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 bg-gray-50 rounded-2xl p-2.5 border border-gray-100 mb-2">
                {[['col-span-4','medicine_name','Medicine *'],['col-span-2','dosage','Dosage'],['col-span-3','frequency','Frequency'],['col-span-2','duration','Duration']].map(([col, k, ph]) => (
                  <div key={k} className={col}>
                    <input type="text" placeholder={ph} value={m[k]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updMed(i, k, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400" />
                  </div>
                ))}
                <div className="col-span-1 flex items-center justify-center">
                  <button type="button" onClick={() => removeMed(i)} className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {submitting ? 'Saving…' : 'Save Visit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditModalProps {
  consultation: any;
  onClose: () => void;
  onSave: (data: any) => void;
  isPending: boolean;
}

function EditModal({ consultation, onClose, onSave, isPending }: EditModalProps) {
  const [form, setForm] = useState({
    visit_date:            consultation.visit_date?.split('T')[0] || '',
    doctor_name:           consultation.doctor_name || '',
    hospital_clinic:       consultation.hospital_clinic || '',
    sick_description:      consultation.sick_description || '',
    diagnosis:             consultation.diagnosis || '',
    treatment_description: consultation.treatment_description || '',
  });
  const [meds, setMeds] = useState(
    (consultation.medicines || []).map((m: any) => ({
      medicine_name: m.medicine_name || '', dosage: m.dosage || '',
      frequency: m.frequency || '', duration: m.duration || '',
    }))
  );
  const addMed    = () => setMeds((m: any[]) => [...m, { ...EMPTY_MED }]);
  const removeMed = (i: number) => setMeds((m: any[]) => m.filter((_: any, j: number) => j !== i));
  const updMed    = (i: number, f: string, v: string) => setMeds((m: any[]) => m.map((x: any, j: number) => j === i ? { ...x, [f]: v } : x));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Edit Consultation</h2>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(consultation.visit_date)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); onSave({ ...form, medicines: meds.filter((m: any) => m.medicine_name.trim()) }); }}
              className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Visit Date *</label>
              <input type="date" required value={form.visit_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, visit_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Doctor Name</label>
              <input type="text" value={form.doctor_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Hospital / Clinic</label>
            <input type="text" value={form.hospital_clinic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, hospital_clinic: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          {[
            { k: 'sick_description',      l: 'Symptoms',      ph: 'Describe symptoms…'    },
            { k: 'diagnosis',             l: 'Diagnosis',     ph: 'Medical diagnosis…'    },
            { k: 'treatment_description', l: 'Treatment Plan',ph: 'Treatment plan…'       },
          ].map(({ k, l, ph }) => (
            <div key={k}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{l}</label>
              <textarea rows={2} placeholder={ph} value={(form as any)[k]} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          ))}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Medicines</label>
              <button type="button" onClick={addMed}
                className="flex items-center gap-1 text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1.5 rounded-xl">
                <Plus size={11} strokeWidth={2.5} /> Add
              </button>
            </div>
            {meds.map((m: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 bg-gray-50 rounded-2xl p-2.5 border border-gray-100 mb-2">
                {[['col-span-4','medicine_name','Medicine *'],['col-span-2','dosage','Dosage'],['col-span-3','frequency','Frequency'],['col-span-2','duration','Duration']].map(([col, k, ph]) => (
                  <div key={k} className={col}>
                    <input type="text" placeholder={ph} value={m[k]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updMed(i, k, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400" />
                  </div>
                ))}
                <div className="col-span-1 flex items-center justify-center">
                  <button type="button" onClick={() => removeMed(i)} className="w-6 h-6 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pb-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface WFNodeProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  labelColor?: string;
  isLast?: boolean;
  children: React.ReactNode;
}

function WFNode({ icon, iconBg, label, labelColor = 'text-gray-500', isLast = false, children }: WFNodeProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: 16 }} />}
      </div>
      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-3'}`}>
        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${labelColor}`}>{label}</p>
        {children}
      </div>
    </div>
  );
}

interface ConsultationCommitProps {
  c: any;
  palette: any;
  labRequest: any;
  isLast: boolean;
  onEdit: (c: any) => void;
  onSendToLab: (c: any) => void;
}

function ConsultationCommit({ c, palette, labRequest, isLast, onEdit, onSendToLab }: ConsultationCommitProps) {
  const [open, setOpen] = useState(false);
  const st = STATUS_STYLE[c.status] || STATUS_STYLE.active;
  const meds = c.medicines || [];

  const hasSymptoms   = !!c.sick_description;
  const hasDx         = !!c.diagnosis;
  const hasTx         = !!c.treatment_description;
  const hasMeds       = meds.length > 0;
  const hasRx         = !!c.prescription_file;
  const hasLabReq     = !!c.lab_tests_requested;
  const labSent       = !!labRequest;
  const labDone       = labRequest?.status === 'completed';
  const labInProg     = labRequest?.status === 'in_progress';

  const subSteps = [
    hasSymptoms && 'symptoms',
    hasDx       && 'diagnosis',
    hasTx       && 'treatment',
    hasMeds     && 'medicines',
    hasRx       && 'prescription',
    hasLabReq   && 'lab',
  ].filter(Boolean);

  const fileUrl = (type: string, name: string) =>
    `${API_BASE}/uploads/${type === 'rx' ? 'prescriptions' : 'lab-reports'}/${name}`;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 z-10 ring-2 ring-white shadow-md ${
          c.status === 'completed' ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
          : c.status === 'dispensed' ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
          : `bg-gradient-to-br ${palette.grad}`
        }`}>
          <Stethoscope size={15} strokeWidth={2} className="text-white" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-5'}`}>
        <div className={`rounded-2xl border transition-all cursor-pointer select-none ${
          open ? 'border-gray-200 bg-white shadow-md' : 'border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-gray-200'
        }`}>
          <button type="button" className="w-full text-left px-4 py-3" onClick={() => setOpen(o => !o)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-snug truncate">
                  {c.diagnosis || c.sick_description || 'Medical Visit'}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar size={10} strokeWidth={2} /> {fmtDate(c.visit_date)}
                  </span>
                  {c.hospital_clinic && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin size={10} strokeWidth={2} /> {c.hospital_clinic}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                </span>
                {hasLabReq && !labSent && (
                  <span className="text-[9px] font-bold bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full">Lab Pending</span>
                )}
                {labDone && (
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Lab Done</span>
                )}
                {!c.doctor_id && (
                  <button type="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(c); }}
                    className={`w-6 h-6 flex items-center justify-center rounded-lg ${palette.light} ${palette.accent} hover:opacity-80`}>
                    <Pencil size={11} strokeWidth={2.5} />
                  </button>
                )}
                <ChevronDown size={14} strokeWidth={2.5} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </button>

          {open && (
            <div className="border-t border-gray-50 px-4 pb-4 pt-3">
              <div className="space-y-0">
                <WFNode
                  icon={<Calendar size={12} strokeWidth={2} className="text-white" />}
                  iconBg={`bg-gradient-to-br ${palette.grad}`}
                  label="Visit" labelColor={palette.accent}
                  isLast={subSteps.length === 0}
                >
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <p><span className="text-gray-400">Date:</span> {fmtDate(c.visit_date)}</p>
                    {c.hospital_clinic && <p><span className="text-gray-400">Location:</span> {c.hospital_clinic}</p>}
                    {c.pharmacy_name   && <p><span className="text-gray-400">Pharmacy:</span> {c.pharmacy_name}</p>}
                  </div>
                </WFNode>

                {hasSymptoms && (
                  <WFNode icon={<Thermometer size={12} strokeWidth={2} className="text-orange-600" />} iconBg="bg-orange-100"
                    label="Symptoms" labelColor="text-orange-600" isLast={subSteps[subSteps.length-1] === 'symptoms'}>
                    <p className="text-xs text-gray-700 leading-relaxed bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">{c.sick_description}</p>
                  </WFNode>
                )}

                {hasDx && (
                  <WFNode icon={<Microscope size={12} strokeWidth={2} className={palette.accent} />} iconBg={palette.light}
                    label="Diagnosis" labelColor={palette.accent} isLast={subSteps[subSteps.length-1] === 'diagnosis'}>
                    <p className={`text-xs text-gray-700 leading-relaxed rounded-xl px-3 py-2 border ${palette.light} border-gray-100`}>{c.diagnosis}</p>
                  </WFNode>
                )}

                {hasTx && (
                  <WFNode icon={<Activity size={12} strokeWidth={2} className="text-teal-600" />} iconBg="bg-teal-100"
                    label="Treatment Plan" labelColor="text-teal-600" isLast={subSteps[subSteps.length-1] === 'treatment'}>
                    <p className="text-xs text-gray-700 leading-relaxed bg-teal-50 rounded-xl px-3 py-2 border border-teal-100">{c.treatment_description}</p>
                  </WFNode>
                )}

                {hasMeds && (
                  <WFNode icon={<Pill size={12} strokeWidth={2} className="text-violet-600" />} iconBg="bg-violet-100"
                    label={`Medicines Prescribed (${meds.length})`} labelColor="text-violet-600" isLast={subSteps[subSteps.length-1] === 'medicines'}>
                    <div className="flex flex-wrap gap-1.5">
                      {meds.map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 bg-white border border-violet-100 rounded-xl pl-2.5 pr-3 py-1.5 text-xs shadow-sm">
                          <div className={`w-4 h-4 rounded-md ${palette.step} flex items-center justify-center shrink-0`}>
                            <Pill size={8} strokeWidth={2.5} className="text-white" />
                          </div>
                          <span className="font-semibold text-gray-800">{m.medicine_name}</span>
                          {m.dosage    && <span className="text-gray-400">· {m.dosage}</span>}
                          {m.frequency && <span className="text-gray-400">· {m.frequency}</span>}
                          {m.duration  && <span className="text-gray-400">· {m.duration}</span>}
                        </div>
                      ))}
                    </div>
                  </WFNode>
                )}

                {hasRx && (
                  <WFNode icon={<FileImage size={12} strokeWidth={2} className="text-violet-600" />} iconBg="bg-violet-100"
                    label="Prescription" labelColor="text-violet-700" isLast={subSteps[subSteps.length-1] === 'prescription'}>
                    <div className="space-y-2">
                      <img src={fileUrl('rx', c.prescription_file)} alt="Prescription"
                        className="w-full max-h-44 object-contain rounded-xl border border-violet-100 bg-white"
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }} />
                      <div className="flex gap-2">
                        <a href={fileUrl('rx', c.prescription_file)} download onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors">
                          <Download size={11} strokeWidth={2.5} /> Download
                        </a>
                        <a href={fileUrl('rx', c.prescription_file)} target="_blank" rel="noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                          <ExternalLink size={11} strokeWidth={2.5} /> View in Browser
                        </a>
                      </div>
                    </div>
                  </WFNode>
                )}

                {hasLabReq && (
                  <>
                    <WFNode icon={<FlaskConical size={12} strokeWidth={2} className="text-cyan-600" />} iconBg="bg-cyan-100"
                      label="Lab Tests Requested" labelColor="text-cyan-600" isLast={!labSent && subSteps[subSteps.length-1] === 'lab'}>
                      <div className="bg-cyan-50 rounded-xl px-3 py-2 border border-cyan-100 space-y-2">
                        <p className="text-xs text-gray-700 leading-relaxed">{c.lab_tests_requested}</p>
                        {!labSent && (
                          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSendToLab(c); }}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl hover:opacity-90 shadow-sm">
                            <Send size={11} strokeWidth={2.5} /> Send to Laboratory
                          </button>
                        )}
                      </div>
                    </WFNode>

                    {labSent && (
                      <WFNode icon={<Send size={12} strokeWidth={2} className="text-blue-600" />} iconBg="bg-blue-100"
                        label={`Sent to: ${labRequest.lab_name || 'Laboratory'}`} labelColor="text-blue-600" isLast={!labDone && !labInProg}>
                        <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                          <FlaskConical size={12} strokeWidth={2} className="text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800">{labRequest.lab_name}</p>
                            {labRequest.lab_address && <p className="text-[10px] text-gray-400 truncate">{labRequest.lab_address}</p>}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            labDone    ? 'bg-emerald-100 text-emerald-700' :
                            labInProg  ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {labDone ? 'Completed' : labInProg ? 'In Progress' : 'Pending'}
                          </span>
                        </div>
                      </WFNode>
                    )}

                    {labDone && (
                      <WFNode icon={<CheckCircle2 size={12} strokeWidth={2} className="text-white" />}
                        iconBg="bg-gradient-to-br from-emerald-500 to-teal-600" label="Lab Report Ready ✅" labelColor="text-emerald-600" isLast>
                        <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-sm">
                          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 border-b border-emerald-100">
                            <div className="flex items-center gap-2 mb-1">
                              <FlaskConical size={14} strokeWidth={2} className="text-emerald-600 shrink-0" />
                              <p className="text-sm font-bold text-gray-900">{labRequest.lab_name}</p>
                            </div>
                            {c.doctor_display_name && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Stethoscope size={10} strokeWidth={2} /> Ordered by Dr. {c.doctor_display_name}
                              </p>
                            )}
                          </div>
                          {labRequest.report_notes && (
                            <div className="px-4 py-3 border-b border-gray-50">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <FileText size={9} strokeWidth={2} /> Lab Notes / Results Summary
                              </p>
                              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{labRequest.report_notes}</p>
                            </div>
                          )}
                          {labRequest.report_file && (
                            <div className="px-4 py-3 flex gap-2">
                              <a href={fileUrl('lab', labRequest.report_file)} download onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors">
                                <Download size={12} strokeWidth={2.5} /> Download Report
                              </a>
                              <a href={fileUrl('lab', labRequest.report_file)} target="_blank" rel="noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                                <Eye size={12} strokeWidth={2.5} /> View in Browser
                              </a>
                            </div>
                          )}
                        </div>
                      </WFNode>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DoctorCardProps {
  group: any;
  palette: any;
  onEdit: (c: any) => void;
  onSendToLab: (c: any) => void;
  labRequestMap: Record<number, any>;
}

function DoctorCard({ group, palette, onEdit, onSendToLab, labRequestMap }: DoctorCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const initial = group.doctorKey.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase();

  return (
    <div className="ios-tile overflow-hidden">
      <div
        className={`relative bg-gradient-to-br ${palette.grad} px-5 pt-5 pb-4 cursor-pointer overflow-hidden`}
        onClick={() => setCollapsed((c: boolean) => !c)}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute top-8 -right-16 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center text-white text-lg font-bold shadow-lg shrink-0">
              {initial}
            </div>
            <div>
              <p className="text-white font-bold text-base leading-snug">
                {group.doctorKey === 'Self-Recorded' ? 'Self-Recorded' : `Dr. ${group.doctorKey}`}
              </p>
              {group.hospital && (
                <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                  <Building2 size={10} strokeWidth={2} /> {group.hospital}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-white font-bold text-sm leading-none">{group.consultations.length}</p>
              <p className="text-white/60 text-[10px]">visits</p>
            </div>
            {group.isSystemDoctor && (
              <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/20">Verified</span>
            )}
            {group.hasActive && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-400/30 text-amber-100 border border-amber-300/30 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse" /> Active
              </span>
            )}
            <ChevronDown size={16} strokeWidth={2.5} className={`text-white/80 transition-transform duration-200 ${collapsed ? '-rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="bg-slate-50/40 px-4 pt-4 pb-3">
          {group.consultations.map((c: any, i: number) => (
            <ConsultationCommit
              key={c.id}
              c={c}
              palette={palette}
              labRequest={labRequestMap[c.id]}
              isLast={i === group.consultations.length - 1}
              onEdit={onEdit}
              onSendToLab={onSendToLab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PatientConsultations() {
  const qc = useQueryClient();
  const [editConsultation,    setEditConsultation]   = useState<any>(null);
  const [sendLabConsultation, setSendLabConsultation] = useState<any>(null);
  const [showSelfRecord,      setShowSelfRecord]     = useState(false);
  const [toast,               setToast]              = useState<{ msg: string; type: string } | null>(null);

  const { data: consultations = [], isLoading } = useQuery({
    queryKey: ['consultations'],
    queryFn:  consultationApi.getAll,
  });

  const { data: labRequests = [] } = useQuery({
    queryKey: ['patient-lab-reports'],
    queryFn:  labApi.getAll,
  });

  const labRequestMap = useMemo(() => {
    const map: Record<number, any> = {};
    (labRequests as any[]).forEach((lr: any) => { if (lr.consultation_id) map[lr.consultation_id] = lr; });
    return map;
  }, [labRequests]);

  const doctorGroups = useMemo(() => {
    const groups: Record<string, any> = {};
    (consultations as any[]).forEach((c: any) => {
      const key = c.doctor_display_name || c.doctor_name || 'Self-Recorded';
      if (!groups[key]) groups[key] = { doctorKey: key, isSystemDoctor: !!c.doctor_display_name, hospital: '', hasActive: false, consultations: [] };
      groups[key].consultations.push(c);
      if (c.hospital_clinic) groups[key].hospital = c.hospital_clinic;
      if (c.status === 'active') groups[key].hasActive = true;
    });
    return Object.values(groups).sort((a: any, b: any) => {
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return new Date(b.consultations[0]?.visit_date || 0).getTime() - new Date(a.consultations[0]?.visit_date || 0).getTime();
    });
  }, [consultations]);

  const pendingLabs = (consultations as any[]).filter((c: any) => c.lab_tests_requested && !labRequestMap[c.id]).length;
  const stats = {
    total:   (consultations as any[]).length,
    doctors: doctorGroups.length,
    active:  (consultations as any[]).filter((c: any) => c.status === 'active').length,
  };

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => consultationApi.updateByPatient(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consultations'] }); setEditConsultation(null); showToast('Consultation updated!'); },
    onError:   (err: any) => showToast(err.message || 'Update failed', 'error'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      Loading consultations…
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border ${
          toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
        }`}>
          {toast.type === 'error' ? <X size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Consultations</h1>
          <p className="text-sm text-gray-400 mt-0.5">Full workflow history grouped by doctor — click any visit to expand</p>
        </div>
        <button
          onClick={() => setShowSelfRecord(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-sm hover:opacity-90"
        >
          <Plus size={14} strokeWidth={2.5} /> Record Visit
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Visits',      value:stats.total,   grad:'from-teal-500 to-emerald-600'  },
          { label:'Treating Doctors',  value:stats.doctors, grad:'from-blue-500 to-indigo-600'   },
          { label:'Active Treatments', value:stats.active,  grad:'from-amber-500 to-orange-600'  },
          { label:'Lab Tests Pending', value:pendingLabs,   grad:'from-cyan-500 to-teal-600'     },
        ].map(s => (
          <div key={s.label} className="ios-stat-tile relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-10`} />
            <div className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-3 shadow-md`}>
              <ArrowUpRight size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <p className="text-3xl font-bold text-gray-900 tracking-tight leading-none">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{s.label}</p>
          </div>
        ))}
      </div>

      {pendingLabs > 0 && (
        <div className="flex items-center gap-3 bg-cyan-50 border border-cyan-200 rounded-2xl px-4 py-3">
          <FlaskConical size={16} strokeWidth={2} className="text-cyan-600 shrink-0" />
          <p className="text-sm text-cyan-700">
            <strong>{pendingLabs} lab test{pendingLabs > 1 ? 's' : ''}</strong> requested by your doctor — expand the consultation and choose a laboratory to send them.
          </p>
        </div>
      )}

      {doctorGroups.length === 0 && (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={28} strokeWidth={1.5} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">No consultations yet</p>
          <p className="text-sm text-gray-400 mt-1">Tap "Record Visit" to log your own or wait for your doctor to add one</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {doctorGroups.map((group: any, idx: number) => (
          <DoctorCard
            key={group.doctorKey}
            group={group}
            palette={PALETTES[idx % PALETTES.length]}
            onEdit={setEditConsultation}
            onSendToLab={setSendLabConsultation}
            labRequestMap={labRequestMap}
          />
        ))}
      </div>

      {(consultations as any[]).some((c: any) => !!c.doctor_id) && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <Info size={16} strokeWidth={2} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-600">
            Consultations added by your doctor are <strong>read-only</strong>. Only your own self-recorded visits can be edited.
          </p>
        </div>
      )}

      {showSelfRecord && (
        <SelfRecordModal
          onClose={() => setShowSelfRecord(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['consultations'] }); showToast('Visit recorded successfully!'); }}
        />
      )}
      {sendLabConsultation && (
        <SendToLabModal
          consultation={sendLabConsultation}
          onClose={() => setSendLabConsultation(null)}
          onSent={() => showToast('Lab request sent! Laboratory has been notified.')}
        />
      )}
      {editConsultation && (
        <EditModal
          consultation={editConsultation}
          onClose={() => setEditConsultation(null)}
          onSave={(data: any) => updateMutation.mutate({ id: editConsultation.id, data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}
