import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Stethoscope, Thermometer, CheckCircle2, Package, Pill,
  MapPin, Calendar, ChevronDown, Pencil, X, Plus,
  ArrowUpRight, Info, FlaskConical, Send, Search, FileImage,
  Eye, Download, ExternalLink, Microscope, Activity, FileText,
} from 'lucide-react';
import { consultationApi, labApi, userApi } from '../services/api';
import { SERVER_ORIGIN } from '../env';
import PharmacyAssignmentsPanel from '../components/common/PharmacyAssignmentsPanel';

const API_BASE = SERVER_ORIGIN || 'http://localhost:5000';

const PALETTES = [
  { grad: 'from-violet-500 to-purple-700',  step: 'bg-violet-500', accent: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', light: 'bg-violet-50', line: 'border-violet-200' },
  { grad: 'from-blue-500 to-indigo-700',    step: 'bg-blue-500',   accent: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700',     light: 'bg-blue-50',   line: 'border-blue-200'   },
  { grad: 'from-teal-500 to-emerald-700',   step: 'bg-teal-500',   accent: 'text-teal-600',   badge: 'bg-teal-100 text-teal-700',     light: 'bg-teal-50',   line: 'border-teal-200'   },
  { grad: 'from-rose-500 to-pink-700',      step: 'bg-rose-500',   accent: 'text-rose-600',   badge: 'bg-rose-100 text-rose-700',     light: 'bg-rose-50',   line: 'border-rose-200'   },
  { grad: 'from-amber-500 to-orange-600',   step: 'bg-amber-500',  accent: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700',   light: 'bg-amber-50',  line: 'border-amber-200'  },
  { grad: 'from-cyan-500 to-sky-700',       step: 'bg-cyan-500',   accent: 'text-cyan-600',   badge: 'bg-cyan-100 text-cyan-700',     light: 'bg-cyan-50',   line: 'border-cyan-200'   },
];

const STATUS_STYLE: Record<string, any> = {
  active:    { cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400'    },
  preparing: { cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-400'     },
  dispensed: { cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-400'   },
  delivered: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400'  },
  completed: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400'  },
};

const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Doctor names (registered or free-typed) sometimes already include a "Dr." prefix —
// strip it before re-applying any "Dr. {{name}}" translation template so it's never doubled.
const stripDrPrefix = (name: string): string => name.trim().replace(/^dr\.?\s+/i, '');
const fmtDoctorLabel = (t: (key: string, opts?: any) => string, name: string): string =>
  t('page.doctorCard.doctorPrefix', { name: stripDrPrefix(name) });

function useDebounce(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function LabSearchDropdown({ selected, onSelect }: { selected: any; onSelect: (item: any) => void }) {
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [q, setQ]       = useState('');
  const dq              = useDebounce(q);
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-labs-consult', dq],
    queryFn:  () => userApi.searchLaboratories(dq),
    enabled:  open,
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
        className="text-gray-400 hover:text-red-500 text-xs font-medium">{tc('actions.change')}</button>
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
          placeholder={t('labSearch.placeholder')}
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-cyan-400 rounded-full animate-spin" />}
      </div>
      {open && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto">
          {isFetching
            ? <li className="px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
                <span className="w-3.5 h-3.5 border-2 border-gray-200 border-t-cyan-400 rounded-full animate-spin shrink-0" />
                {t('labSearch.loading')}
              </li>
            : (results as any[]).length === 0
              ? <li className="px-4 py-3 text-sm text-gray-400">{t('labSearch.noResults')}</li>
              : (results as any[]).map((l: any) => (
                <li key={l.id} onClick={() => { onSelect(l); setOpen(false); setQ(''); }}
                  className="px-4 py-2.5 hover:bg-cyan-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2">
                  <div className="w-7 h-7 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
                    <FlaskConical size={12} strokeWidth={2} className="text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{l.lab_name || l.name}</p>
                    <p className="text-xs text-gray-400">{l.address || l.email}</p>
                    {l.lab_type && <p className="text-xs text-cyan-600 capitalize">{l.lab_type.replace('_', ' ')}</p>}
                  </div>
                </li>
              ))
          }
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
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [selectedLab, setSelectedLab] = useState<any>(null);
  const [error, setError]             = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => labApi.create({ consultation_id: consultation.id, laboratory_id: selectedLab.id }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['patient-lab-reports'] }); onSent?.(); onClose(); },
    onError: (err: any) => setError(err.message || t('sendToLabModal.errorGeneric')),
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
                <p className="font-bold">{t('sendToLabModal.title')}</p>
                <p className="text-white/70 text-xs">{t('sendToLabModal.subtitle')}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl px-3.5 py-2.5">
            <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-0.5">{t('sendToLabModal.testsRequested')}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{consultation.lab_tests_requested}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              {t('sendToLabModal.selectLaboratory')} <span className="text-red-400">*</span>
            </label>
            <LabSearchDropdown selected={selectedLab} onSelect={setSelectedLab} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">{tc('actions.cancel')}</button>
            <button
              onClick={() => { if (!selectedLab) { setError(t('sendToLabModal.errorSelect')); return; } mutation.mutate(); }}
              disabled={mutation.isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              <Send size={14} strokeWidth={2.5} /> {t('sendToLabModal.sendBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorNameAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('patientConsultations');
  const dq              = useDebounce(value);
  const [open, setOpen] = useState(false);
  const ref              = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-doctors-consult', dq],
    queryFn:  () => userApi.searchDoctors(dq),
    enabled:  open && dq.trim().length >= 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        placeholder={t('selfRecordModal.fields.doctorNamePlaceholder')}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      />
      {open && dq.trim().length >= 1 && (results as any[]).length > 0 && (
        <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto">
          {isFetching
            ? <li className="px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
                <span className="w-3.5 h-3.5 border-2 border-gray-200 border-t-primary-400 rounded-full animate-spin shrink-0" />
                {t('doctorSearch.loading')}
              </li>
            : (results as any[]).map((d: any) => (
              <li key={d.id} onClick={() => { onChange(d.name); setOpen(false); }}
                className="px-4 py-2.5 hover:bg-primary-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2">
                <div className="w-7 h-7 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                  <Stethoscope size={12} strokeWidth={2} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t('doctorSearch.namePrefix', { name: d.name })}</p>
                  {d.specialization && <p className="text-xs text-gray-400">{d.specialization}</p>}
                </div>
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}

interface SelfRecordModalProps {
  onClose: () => void;
  onSaved: () => void;
}

interface MedicineRow { medicine_name: string; dosage: string; frequency: string; duration: string; }
const emptyMedicineRow = (): MedicineRow => ({ medicine_name: '', dosage: '', frequency: '', duration: '' });

function SelfRecordModal({ onClose, onSaved }: SelfRecordModalProps) {
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [fields, setFields] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    doctor_name: '', sick_description: '', diagnosis: '',
  });
  const [prescriptionFile,    setPrescriptionFile]    = useState<File | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<string | null>(null);
  const [medicines,           setMedicines]           = useState<MedicineRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const sf = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));

  const onPickPrescription = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPrescriptionFile(file);
    setPrescriptionPreview(file ? URL.createObjectURL(file) : null);
  };

  const updateMedRow = (i: number, k: keyof MedicineRow, v: string) =>
    setMedicines(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addMedRow    = () => setMedicines(rows => [...rows, emptyMedicineRow()]);
  const removeMedRow = (i: number) => setMedicines(rows => rows.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.sick_description.trim()) return setError(t('selfRecordModal.errors.symptomsRequired'));
    setError(''); setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v || ''));
      if (!fields.visit_date) fd.set('visit_date', new Date().toISOString().slice(0, 10));
      if (prescriptionFile) fd.append('prescription', prescriptionFile);
      const validMeds = medicines.filter(m => m.medicine_name.trim());
      if (validMeds.length) fd.append('manual_medicines', JSON.stringify(validMeds));
      await consultationApi.create(fd);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message || t('selfRecordModal.errors.saveFailed'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-6 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{t('selfRecordModal.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('selfRecordModal.subtitle')}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('selfRecordModal.fields.doctorName')}</label>
            <DoctorNameAutocomplete value={fields.doctor_name} onChange={(v: string) => sf('doctor_name', v)} />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              {t('selfRecordModal.fields.visitDate')} <span className="text-gray-300 font-normal normal-case">{t('selfRecordModal.prescription.optional')}</span>
            </label>
            <input type="date" value={fields.visit_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => sf('visit_date', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>

          {[
            { key: 'sick_description', label: t('selfRecordModal.fields.symptoms'),  ph: t('selfRecordModal.fields.symptomsPlaceholder'),  req: true  },
            { key: 'diagnosis',        label: t('selfRecordModal.fields.diagnosis'), ph: t('selfRecordModal.fields.diagnosisPlaceholder'), req: false },
          ].map(({ key, label, ph, req }) => (
            <div key={key}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
              <textarea rows={3} required={req} placeholder={ph} value={(fields as any)[key]} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => sf(key, e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          ))}

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
              {t('selfRecordModal.prescription.label')} <span className="text-gray-300 font-normal normal-case">{t('selfRecordModal.prescription.optional')}</span>
            </label>
            {prescriptionPreview ? (
              <div className="relative">
                <img src={prescriptionPreview} alt="Prescription preview" className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                <button type="button" onClick={() => { setPrescriptionFile(null); setPrescriptionPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center shadow-sm text-gray-500 hover:text-red-500">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 text-sm text-gray-500 cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                <FileImage size={16} strokeWidth={2} className="text-gray-400" />
                {t('selfRecordModal.prescription.uploadBtn')}
                <input type="file" accept="image/*" className="hidden" onChange={onPickPrescription} />
              </label>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('selfRecordModal.medicines.label')}</label>
              <button type="button" onClick={addMedRow} className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Plus size={12} strokeWidth={2.5} /> {tc('actions.add')}
              </button>
            </div>
            {medicines.length === 0 ? (
              <p className="text-xs text-gray-400 italic">{t('selfRecordModal.medicines.none')}</p>
            ) : (
              <div className="space-y-2">
                {medicines.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                    <div className="flex-1 grid grid-cols-2 gap-1.5">
                      <input className="col-span-2 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('selfRecordModal.medicines.medicine')} value={m.medicine_name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'medicine_name', e.target.value)} />
                      <input className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('selfRecordModal.medicines.dosage')} value={m.dosage}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'dosage', e.target.value)} />
                      <input className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('selfRecordModal.medicines.frequency')} value={m.frequency}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'frequency', e.target.value)} />
                      <input className="col-span-2 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('selfRecordModal.medicines.duration')} value={m.duration}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'duration', e.target.value)} />
                    </div>
                    <button type="button" onClick={() => removeMedRow(i)} className="text-gray-300 hover:text-red-500 shrink-0 mt-1.5">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">{tc('actions.cancel')}</button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {submitting ? tc('actions.saving') : t('selfRecordModal.saveBtn')}
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
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const [form, setForm] = useState({
    visit_date:       consultation.visit_date?.split('T')[0] || '',
    doctor_name:      consultation.doctor_name || '',
    sick_description: consultation.sick_description || '',
    diagnosis:        consultation.diagnosis || '',
  });
  const [medicines, setMedicines] = useState<MedicineRow[]>(
    (consultation.medicines || []).map((m: any) => ({
      medicine_name: m.medicine_name || '', dosage: m.dosage || '', frequency: m.frequency || '', duration: m.duration || '',
    }))
  );
  const updateMedRow = (i: number, k: keyof MedicineRow, v: string) =>
    setMedicines(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addMedRow    = () => setMedicines(rows => [...rows, emptyMedicineRow()]);
  const removeMedRow = (i: number) => setMedicines(rows => rows.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">{t('editModal.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(consultation.visit_date)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); onSave({ ...form, medicines: medicines.filter(m => m.medicine_name.trim()) }); }}
              className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('editModal.fields.doctorName')}</label>
            <DoctorNameAutocomplete value={form.doctor_name} onChange={(v: string) => setForm(f => ({ ...f, doctor_name: v }))} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t('editModal.fields.visitDate')}</label>
            <input type="date" required value={form.visit_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, visit_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          {[
            { k: 'sick_description', l: t('editModal.fields.symptoms'),  ph: t('editModal.fields.symptomsPlaceholder')  },
            { k: 'diagnosis',        l: t('editModal.fields.diagnosis'), ph: t('editModal.fields.diagnosisPlaceholder') },
          ].map(({ k, l, ph }) => (
            <div key={k}>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{l}</label>
              <textarea rows={3} placeholder={ph} value={(form as any)[k]} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          ))}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('editModal.medicines.label')}</label>
              <button type="button" onClick={addMedRow} className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Plus size={12} strokeWidth={2.5} /> {tc('actions.add')}
              </button>
            </div>
            {medicines.length === 0 ? (
              <p className="text-xs text-gray-400 italic">{t('selfRecordModal.medicines.none')}</p>
            ) : (
              <div className="space-y-2">
                {medicines.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                    <div className="flex-1 grid grid-cols-2 gap-1.5">
                      <input className="col-span-2 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('editModal.medicines.medicine')} value={m.medicine_name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'medicine_name', e.target.value)} />
                      <input className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('editModal.medicines.dosage')} value={m.dosage}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'dosage', e.target.value)} />
                      <input className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('editModal.medicines.frequency')} value={m.frequency}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'frequency', e.target.value)} />
                      <input className="col-span-2 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        placeholder={t('editModal.medicines.duration')} value={m.duration}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMedRow(i, 'duration', e.target.value)} />
                    </div>
                    <button type="button" onClick={() => removeMedRow(i)} className="text-gray-300 hover:text-red-500 shrink-0 mt-1.5">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pb-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-2xl hover:bg-gray-50">{tc('actions.cancel')}</button>
            <button type="submit" disabled={isPending}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2">
              {isPending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isPending ? tc('actions.saving') : t('editModal.saveBtn')}
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
  const { t } = useTranslation('patientConsultations');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const statusKey = STATUS_STYLE[c.status] ? c.status : 'active';
  const st = STATUS_STYLE[statusKey];
  const stLabel = t(`page.commit.status.${statusKey}`);
  const meds = c.medicines || [];

  const hasSymptoms      = !!c.sick_description;
  const hasDx            = !!c.diagnosis;
  const hasTx            = !!c.treatment_description;
  const hasMeds          = meds.length > 0;
  const hasRx            = !!c.prescription_file;
  const hasLabReq        = !!c.lab_tests_requested;
  const labSent          = !!labRequest;
  const labDone          = labRequest?.status === 'completed';
  const labInProg        = labRequest?.status === 'in_progress';
  const pharmacyAssignments: any[] = c.pharmacy_assignments || [];

  const subSteps = [
    hasSymptoms && 'symptoms',
    hasDx       && 'diagnosis',
    hasTx       && 'treatment',
    hasMeds     && 'medicines',
    hasRx       && 'prescription',
    (hasMeds || hasRx || pharmacyAssignments.length > 0) && 'pharmacy',
    hasLabReq   && 'lab',
  ].filter(Boolean);

  const fileUrl = (type: string, name: string) =>
    `${API_BASE}/uploads/${type === 'rx' ? 'prescriptions' : 'lab-reports'}/${name}`;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 z-10 ring-2 ring-white shadow-md ${
          c.status === 'completed' || c.status === 'delivered' ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
          : c.status === 'dispensed' ? 'bg-gradient-to-br from-violet-500 to-purple-600'
          : c.status === 'preparing' ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
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
                  {c.diagnosis || c.sick_description || t('page.commit.medicalVisit')}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Stethoscope size={10} strokeWidth={2} />
                    {c.doctor_display_name || c.doctor_name
                      ? fmtDoctorLabel(t, c.doctor_display_name || c.doctor_name)
                      : t('page.doctorCard.selfRecorded')}
                  </span>
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
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{stLabel}
                </span>
                {hasLabReq && !labSent && (
                  <span className="text-[9px] font-bold bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full">{t('page.commit.labPending')}</span>
                )}
                {labDone && (
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{t('page.commit.labDone')}</span>
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
                  label={t('page.wf.visit')} labelColor={palette.accent}
                  isLast={subSteps.length === 0}
                >
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <p>
                      <span className="text-gray-400">{t('page.wf.body.doctor')}</span>{' '}
                      {c.doctor_display_name || c.doctor_name
                        ? fmtDoctorLabel(t, c.doctor_display_name || c.doctor_name)
                        : t('page.doctorCard.selfRecorded')}
                    </p>
                    <p><span className="text-gray-400">{t('page.wf.body.date')}</span> {fmtDate(c.visit_date)}</p>
                    {c.hospital_clinic && <p><span className="text-gray-400">{t('page.wf.body.location')}</span> {c.hospital_clinic}</p>}
                    {c.pharmacy_name   && <p><span className="text-gray-400">{t('page.wf.body.pharmacy')}</span> {c.pharmacy_name}</p>}
                  </div>
                </WFNode>

                {hasSymptoms && (
                  <WFNode icon={<Thermometer size={12} strokeWidth={2} className="text-orange-600" />} iconBg="bg-orange-100"
                    label={t('page.wf.symptoms')} labelColor="text-orange-600" isLast={subSteps[subSteps.length-1] === 'symptoms'}>
                    <p className="text-xs text-gray-700 leading-relaxed bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">{c.sick_description}</p>
                  </WFNode>
                )}

                {hasDx && (
                  <WFNode icon={<Microscope size={12} strokeWidth={2} className={palette.accent} />} iconBg={palette.light}
                    label={t('page.wf.diagnosis')} labelColor={palette.accent} isLast={subSteps[subSteps.length-1] === 'diagnosis'}>
                    <p className={`text-xs text-gray-700 leading-relaxed rounded-xl px-3 py-2 border ${palette.light} border-gray-100`}>{c.diagnosis}</p>
                  </WFNode>
                )}

                {hasTx && (
                  <WFNode icon={<Activity size={12} strokeWidth={2} className="text-teal-600" />} iconBg="bg-teal-100"
                    label={t('page.wf.treatmentPlan')} labelColor="text-teal-600" isLast={subSteps[subSteps.length-1] === 'treatment'}>
                    <p className="text-xs text-gray-700 leading-relaxed bg-teal-50 rounded-xl px-3 py-2 border border-teal-100">{c.treatment_description}</p>
                  </WFNode>
                )}

                {hasMeds && (
                  <WFNode icon={<Pill size={12} strokeWidth={2} className="text-violet-600" />} iconBg="bg-violet-100"
                    label={t('page.wf.medicinesPrescribed', { count: meds.length })} labelColor="text-violet-600" isLast={subSteps[subSteps.length-1] === 'medicines'}>
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
                    label={t('page.wf.prescription')} labelColor="text-violet-700" isLast={subSteps[subSteps.length-1] === 'prescription'}>
                    <div className="space-y-2">
                      <img src={fileUrl('rx', c.prescription_file)} alt="Prescription"
                        className="w-full max-h-44 object-contain rounded-xl border border-violet-100 bg-white"
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }} />
                      <div className="flex gap-2">
                        <a href={fileUrl('rx', c.prescription_file)} download onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors">
                          <Download size={11} strokeWidth={2.5} /> {tc('actions.download')}
                        </a>
                        <a href={fileUrl('rx', c.prescription_file)} target="_blank" rel="noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                          <ExternalLink size={11} strokeWidth={2.5} /> {tc('actions.viewInBrowser')}
                        </a>
                      </div>
                    </div>
                  </WFNode>
                )}

                {/* Pharmacy workflow node — a prescription can go to several pharmacies at once */}
                {(hasMeds || hasRx || pharmacyAssignments.length > 0) && (
                  <WFNode
                    icon={<Package size={12} strokeWidth={2} className="text-violet-600" />}
                    iconBg="bg-violet-100"
                    label={t('page.wf.pharmacy')}
                    labelColor="text-violet-600"
                    isLast={subSteps[subSteps.length-1] === 'pharmacy' && !hasLabReq}
                  >
                    <PharmacyAssignmentsPanel
                      consultationId={c.id}
                      assignments={pharmacyAssignments}
                      canManage
                      hasMedicines={hasMeds || hasRx}
                      onChanged={() => qc.invalidateQueries({ queryKey: ['consultations'] })}
                    />
                  </WFNode>
                )}

                {hasLabReq && (
                  <>
                    <WFNode icon={<FlaskConical size={12} strokeWidth={2} className="text-cyan-600" />} iconBg="bg-cyan-100"
                      label={t('page.wf.labTestsRequested')} labelColor="text-cyan-600" isLast={!labSent && subSteps[subSteps.length-1] === 'lab'}>
                      <div className="bg-cyan-50 rounded-xl px-3 py-2 border border-cyan-100 space-y-2">
                        <p className="text-xs text-gray-700 leading-relaxed">{c.lab_tests_requested}</p>
                        {!labSent && (
                          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSendToLab(c); }}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl hover:opacity-90 shadow-sm">
                            <Send size={11} strokeWidth={2.5} /> {t('page.wf.sendToLaboratoryBtn')}
                          </button>
                        )}
                      </div>
                    </WFNode>

                    {labSent && (
                      <WFNode icon={<Send size={12} strokeWidth={2} className="text-blue-600" />} iconBg="bg-blue-100"
                        label={t('page.wf.sentTo', { name: labRequest.lab_name || t('page.wf.laboratoryFallback') })} labelColor="text-blue-600" isLast={!labDone && !labInProg}>
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
                            {labDone ? tc('status.completed') : labInProg ? tc('status.inProgress') : tc('status.pending')}
                          </span>
                        </div>
                      </WFNode>
                    )}

                    {labDone && (
                      <WFNode icon={<CheckCircle2 size={12} strokeWidth={2} className="text-white" />}
                        iconBg="bg-gradient-to-br from-emerald-500 to-teal-600" label={t('page.wf.labReportReady')} labelColor="text-emerald-600" isLast>
                        <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-sm">
                          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 border-b border-emerald-100">
                            <div className="flex items-center gap-2 mb-1">
                              <FlaskConical size={14} strokeWidth={2} className="text-emerald-600 shrink-0" />
                              <p className="text-sm font-bold text-gray-900">{labRequest.lab_name}</p>
                            </div>
                            {c.doctor_display_name && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Stethoscope size={10} strokeWidth={2} /> {t('page.wf.orderedByDoctor', { name: stripDrPrefix(c.doctor_display_name) })}
                              </p>
                            )}
                          </div>
                          {labRequest.report_notes && (
                            <div className="px-4 py-3 border-b border-gray-50">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <FileText size={9} strokeWidth={2} /> {t('page.wf.labNotesSummary')}
                              </p>
                              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{labRequest.report_notes}</p>
                            </div>
                          )}
                          {labRequest.report_file && (
                            <div className="px-4 py-3 flex gap-2">
                              <a href={fileUrl('lab', labRequest.report_file)} download onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors">
                                <Download size={12} strokeWidth={2.5} /> {t('page.wf.downloadReport')}
                              </a>
                              <a href={fileUrl('lab', labRequest.report_file)} target="_blank" rel="noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                                <Eye size={12} strokeWidth={2.5} /> {tc('actions.viewInBrowser')}
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

export default function PatientConsultations() {
  const { t } = useTranslation('patientConsultations');
  const qc = useQueryClient();
  const [editConsultation,      setEditConsultation]      = useState<any>(null);
  const [sendLabConsultation,   setSendLabConsultation]   = useState<any>(null);
  const [showSelfRecord,        setShowSelfRecord]        = useState(false);
  const [toast,                 setToast]                 = useState<{ msg: string; type: string } | null>(null);
  const [doctorFilter,          setDoctorFilter]          = useState('all');

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

  // Newest visit first, flat across all doctors (no per-doctor grouping).
  const sortedConsultations = useMemo(() =>
    [...(consultations as any[])].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()),
    [consultations]
  );

  const doctorNames = useMemo(() =>
    [...new Set(sortedConsultations.map((c: any) => c.doctor_display_name || c.doctor_name || t('page.doctorCard.selfRecorded')))],
    [sortedConsultations, t]
  );

  // Stable color per doctor so the same doctor's visits always share a palette, even though they're no longer spatially grouped.
  const doctorPalette = useMemo(() => {
    const map: Record<string, any> = {};
    doctorNames.forEach((name, i) => { map[name] = PALETTES[i % PALETTES.length]; });
    return map;
  }, [doctorNames]);

  const filteredConsultations = useMemo(() => {
    if (doctorFilter === 'all') return sortedConsultations;
    return sortedConsultations.filter((c: any) => (c.doctor_display_name || c.doctor_name || t('page.doctorCard.selfRecorded')) === doctorFilter);
  }, [sortedConsultations, doctorFilter, t]);

  const pendingLabs = (consultations as any[]).filter((c: any) => c.lab_tests_requested && !labRequestMap[c.id]).length;
  const stats = {
    total:   (consultations as any[]).length,
    doctors: doctorNames.length,
    active:  (consultations as any[]).filter((c: any) => c.status === 'active').length,
  };

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => consultationApi.updateByPatient(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consultations'] }); setEditConsultation(null); showToast(t('page.toast.updated')); },
    onError:   (err: any) => showToast(err.message || t('page.toast.updateFailed'), 'error'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-32 text-gray-400">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mr-3" />
      {t('page.loading')}
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('page.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t('page.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowSelfRecord(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-sm hover:opacity-90"
        >
          <Plus size={14} strokeWidth={2.5} /> {t('page.recordVisit')}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:t('page.stats.totalVisits'),      value:stats.total,   grad:'from-teal-500 to-emerald-600'  },
          { label:t('page.stats.treatingDoctors'),  value:stats.doctors, grad:'from-blue-500 to-indigo-600'   },
          { label:t('page.stats.activeTreatments'), value:stats.active,  grad:'from-amber-500 to-orange-600'  },
          { label:t('page.stats.labTestsPending'), value:pendingLabs,   grad:'from-cyan-500 to-teal-600'     },
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
            <strong>{t('page.pendingLabsBanner.count', { count: pendingLabs })}{pendingLabs > 1 ? 's' : ''}</strong> {t('page.pendingLabsBanner.text')}
          </p>
        </div>
      )}

      {sortedConsultations.length === 0 && (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={28} strokeWidth={1.5} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-500">{t('page.emptyState.title')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('page.emptyState.subtitle')}</p>
        </div>
      )}

      {doctorNames.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setDoctorFilter('all')}
            className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
              doctorFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t('page.doctorFilter.all', { count: sortedConsultations.length })}
          </button>
          {doctorNames.map((name) => (
            <button
              key={name}
              onClick={() => setDoctorFilter(name)}
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                doctorFilter === name ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {name === t('page.doctorCard.selfRecorded') ? name : fmtDoctorLabel(t, name)}
            </button>
          ))}
        </div>
      )}

      {filteredConsultations.length > 0 && (
        <div className="ios-tile p-5">
          {filteredConsultations.map((c: any, i: number) => (
            <ConsultationCommit
              key={c.id}
              c={c}
              palette={doctorPalette[c.doctor_display_name || c.doctor_name || t('page.doctorCard.selfRecorded')]}
              labRequest={labRequestMap[c.id]}
              isLast={i === filteredConsultations.length - 1}
              onEdit={setEditConsultation}
              onSendToLab={setSendLabConsultation}
            />
          ))}
        </div>
      )}

      {(consultations as any[]).some((c: any) => !!c.doctor_id) && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <Info size={16} strokeWidth={2} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-600">
            {t('page.readOnlyNotice.prefix')} <strong>{t('page.readOnlyNotice.readOnly')}</strong>. {t('page.readOnlyNotice.suffix')}
          </p>
        </div>
      )}

      {showSelfRecord && (
        <SelfRecordModal
          onClose={() => setShowSelfRecord(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['consultations'] }); showToast(t('page.toast.visitRecorded')); }}
        />
      )}
      {sendLabConsultation && (
        <SendToLabModal
          consultation={sendLabConsultation}
          onClose={() => setSendLabConsultation(null)}
          onSent={() => showToast(t('page.toast.labSent'))}
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
