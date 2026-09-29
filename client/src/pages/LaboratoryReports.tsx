import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { labApi, userApi, authApi } from '../services/api';
import { formatDate } from '../utils/helpers';
import { FlaskConical, Upload, Eye, X, ChevronDown, ChevronUp, Search, Send, Plus, Stethoscope, Download, Beaker } from 'lucide-react';
import { SERVER_ORIGIN } from '../env';

const API_BASE = SERVER_ORIGIN || 'http://localhost:5000';

// ── Blood test field definitions ─────────────────────────────────────────────
interface BloodField {
  key: string; labelKey: string; unit: string; min: number; max: number; step: string;
}
const CBC_FIELDS: BloodField[] = [
  { key: 'wbc',        labelKey: 'reports.bloodFields.wbc',        unit: '10³/µL', min: 4.5,  max: 11.0, step: '0.01' },
  { key: 'rbc',        labelKey: 'reports.bloodFields.rbc',        unit: '10⁶/µL', min: 4.5,  max: 6.0,  step: '0.01' },
  { key: 'hemoglobin', labelKey: 'reports.bloodFields.hemoglobin', unit: 'g/dL',   min: 12.0, max: 18.0, step: '0.1'  },
  { key: 'hematocrit', labelKey: 'reports.bloodFields.hematocrit', unit: '%',      min: 37.0, max: 52.0, step: '0.1'  },
  { key: 'mcv',        labelKey: 'reports.bloodFields.mcv',        unit: 'fL',     min: 80.0, max: 99.0, step: '0.1'  },
  { key: 'mch',        labelKey: 'reports.bloodFields.mch',        unit: 'pg',     min: 27.0, max: 34.5, step: '0.1'  },
  { key: 'mchc',       labelKey: 'reports.bloodFields.mchc',       unit: 'g/dL',   min: 32.0, max: 36.5, step: '0.1'  },
  { key: 'rdw',        labelKey: 'reports.bloodFields.rdw',        unit: '%',      min: 11.0, max: 15.0, step: '0.1'  },
  { key: 'platelets',  labelKey: 'reports.bloodFields.platelets',  unit: '10³/µL', min: 150,  max: 450,  step: '1'    },
  { key: 'mpv',        labelKey: 'reports.bloodFields.mpv',        unit: 'fL',     min: 7.4,  max: 12.0, step: '0.1'  },
];
const METABOLIC_FIELDS: BloodField[] = [
  { key: 'blood_glucose', labelKey: 'reports.bloodFields.bloodGlucose', unit: 'mg/dL', min: 70,  max: 100,  step: '0.1' },
  { key: 'hba1c',         labelKey: 'reports.bloodFields.hba1c',        unit: '%',     min: 4.0, max: 5.6,  step: '0.1' },
  { key: 'creatinine',    labelKey: 'reports.bloodFields.creatinine',   unit: 'mg/dL', min: 0.7, max: 1.2,  step: '0.01'},
];
const LIPID_FIELDS: BloodField[] = [
  { key: 'cholesterol',   labelKey: 'reports.bloodFields.cholesterol',   unit: 'mg/dL', min: 125, max: 200, step: '1' },
  { key: 'hdl',           labelKey: 'reports.bloodFields.hdl',           unit: 'mg/dL', min: 40,  max: 60,  step: '1' },
  { key: 'ldl',           labelKey: 'reports.bloodFields.ldl',           unit: 'mg/dL', min: 0,   max: 100, step: '1' },
  { key: 'triglycerides', labelKey: 'reports.bloodFields.triglycerides', unit: 'mg/dL', min: 0,   max: 150, step: '1' },
];

function statusBadge(value: string, min: number, max: number): { statusKey: 'low' | 'high' | 'normal' | ''; color: string } {
  const v = parseFloat(value);
  if (isNaN(v)) return { statusKey: '', color: '' };
  if (v < min) return { statusKey: 'low',    color: 'text-blue-600 bg-blue-50' };
  if (v > max) return { statusKey: 'high',   color: 'text-amber-600 bg-amber-50' };
  return           { statusKey: 'normal', color: 'text-teal-600 bg-teal-50' };
}

function BloodValueField({ field, value, onChange }: {
  field: BloodField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const badge = value ? statusBadge(value, field.min, field.max) : null;
  return (
    <div>
      <label className="block text-[11px] font-bold text-gray-600 mb-1">
        {t(field.labelKey)}
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
        {badge && badge.statusKey && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}>
            {tc(`status.${badge.statusKey}`)}
          </span>
        )}
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5">{tc('status.normal')}: {field.min} – {field.max}</p>
    </div>
  );
}

const countFilled = (values: Record<string, string>): number =>
  Object.values(values).filter(v => v !== '' && v !== undefined).length;

// Services like "Full Blood Count", "Lipid Profile", "HbA1c" have numeric panel
// values worth entering; imaging/other services (X-Ray, Ultrasound, PCR, Urine
// Analysis...) don't — this only sets the *default* visibility, the lab can
// still toggle the panel open manually for anything.
// Only keywords for tests whose values actually appear in the panel below
// (CBC, Metabolic = glucose/HbA1c/creatinine, Lipid). Liver/Thyroid/Renal/etc.
// are real blood draws too, but this form has no fields for them, so they're
// deliberately excluded — matching them would default-check an empty panel.
const BLOOD_PANEL_KEYWORDS = [
  'blood', 'cbc', 'complete blood count', 'lipid', 'cholesterol', 'gluc',
  'hba1c', 'metabolic', 'hemoglobin', 'haemoglobin', 'creatinine', 'platelet',
];
const looksLikeBloodPanel = (reportType: string): boolean => {
  const t = reportType.toLowerCase();
  return BLOOD_PANEL_KEYWORDS.some(k => t.includes(k));
};

// ── Shared blood test value entry panel (Upload + Direct Send modals) ────────
function BloodValuesSection({ values, setVal }: {
  values: Record<string, string>;
  setVal: (key: string, v: string) => void;
}) {
  const { t } = useTranslation('laboratory');
  const [showCBC,       setShowCBC]       = useState(true);
  const [showMetabolic, setShowMetabolic] = useState(false);
  const [showLipid,     setShowLipid]     = useState(false);
  const filledCount = countFilled(values);

  return (
    <div className="border border-teal-200 rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} className="text-white" strokeWidth={2} />
          <p className="text-sm font-bold text-white">{t('reports.bloodPanel.title')}</p>
          <span className="text-[10px] bg-white/25 text-white px-2 py-0.5 rounded-full font-semibold">
            {t('reports.bloodPanel.recommended')}
          </span>
        </div>
        {filledCount > 0 && (
          <span className="text-[10px] bg-white text-teal-700 font-bold px-2 py-0.5 rounded-full">
            {t('reports.bloodPanel.valuesEntered', { count: filledCount })}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 px-4 py-2 bg-teal-50 border-b border-teal-100">
        {t('reports.bloodPanel.hint')}
      </p>

      <div className="divide-y divide-gray-100">

        {/* CBC */}
        <div>
          <button type="button" onClick={() => setShowCBC(!showCBC)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
              {t('reports.bloodPanel.cbcHeading')}
              {CBC_FIELDS.filter(f => values[f.key]).length > 0 && (
                <span className="text-[10px] bg-teal-100 text-teal-700 font-bold px-1.5 py-0.5 rounded-full">
                  {t('reports.bloodPanel.filledCount', { count: CBC_FIELDS.filter(f => values[f.key]).length })}
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
              {t('reports.bloodPanel.metabolicHeading')}
              {METABOLIC_FIELDS.filter(f => values[f.key]).length > 0 && (
                <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                  {t('reports.bloodPanel.filledCount', { count: METABOLIC_FIELDS.filter(f => values[f.key]).length })}
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
              {t('reports.bloodPanel.lipidHeading')}
              {LIPID_FIELDS.filter(f => values[f.key]).length > 0 && (
                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">
                  {t('reports.bloodPanel.filledCount', { count: LIPID_FIELDS.filter(f => values[f.key]).length })}
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
  );
}

// ── Search dropdown (patient / doctor picker for direct lab-initiated reports) ──
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

function useDebounce(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function SearchDropdown({ label, placeholder, fetchFn, queryKey, selected, onSelect, renderItem, renderSelected }: SearchDropdownProps) {
  const { t } = useTranslation('laboratory');
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
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2.5">
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
            className="input pl-9 text-sm py-2.5"
            placeholder={placeholder} value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {isFetching && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-teal-400 rounded-full animate-spin" />}
          {open && dq.length >= 1 && (
            <ul className="absolute z-40 mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 max-h-52 overflow-y-auto">
              {(results as any[]).length === 0 && !isFetching
                ? <li className="px-4 py-3 text-sm text-gray-400">{t('reports.searchDropdown.noResults', { query: dq })}</li>
                : (results as any[]).map((item: any) => (
                  <li key={item.id}
                    onClick={() => { onSelect(item); setOpen(false); setQ(''); }}
                    className="px-4 py-2.5 hover:bg-teal-50 cursor-pointer border-b border-gray-50 last:border-0">
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

// ── Send Report Modal (lab picks patient + doctor, uploads report to both) ───
interface SendReportModalProps { onClose: () => void; onSent: () => void; }

function SendReportModal({ onClose, onSent }: SendReportModalProps) {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const [patient,    setPatient]    = useState<any>(null);
  const [doctor,     setDoctor]     = useState<any>(null);
  const [reportType, setReportType] = useState('');
  const [testDesc,   setTestDesc]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [reportNotes,setReportNotes]= useState('');
  const [values,     setValues]     = useState<Record<string, string>>({});
  const [showBloodPanel, setShowBloodPanel] = useState(false);
  const [sampleId,   setSampleId]   = useState('');
  const [error,      setError]      = useState('');
  const [sending,    setSending]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const services: string[] = (me as any)?.profile?.services_offered
    ? (me as any).profile.services_offered.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const selectReportType = (type: string) => {
    setReportType(type);
    setShowBloodPanel(looksLikeBloodPanel(type));
  };

  const setVal = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));
  const filledCount = countFilled(values);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient)          return setError(t('reports.sendModal.errors.patient'));
    if (!doctor)           return setError(t('reports.sendModal.errors.doctor'));
    if (!reportType)       return setError(t('reports.sendModal.errors.reportType'));
    if (!testDesc.trim())  return setError(t('reports.sendModal.errors.testDescription'));
    if (!file)             return setError(t('reports.errors.reportFileRequired'));
    setError('');
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('patient_id', String(patient.id));
      fd.append('doctor_id', String(doctor.id));
      fd.append('report_type', reportType);
      fd.append('test_description', testDesc.trim());
      if (notes.trim())       fd.append('notes', notes.trim());
      if (reportNotes.trim()) fd.append('report_notes', reportNotes.trim());
      if (sampleId.trim())    fd.append('sample_id', sampleId.trim());
      fd.append('report', file);

      const vitalsPayload: Record<string, number> = {};
      const allFields = [...CBC_FIELDS, ...METABOLIC_FIELDS, ...LIPID_FIELDS];
      allFields.forEach(f => {
        const raw = values[f.key];
        if (raw !== undefined && raw !== '') {
          const num = parseFloat(raw);
          if (!isNaN(num) && num > 0) vitalsPayload[f.key] = num;
        }
      });
      if (Object.keys(vitalsPayload).length > 0) fd.append('vitals_data', JSON.stringify(vitalsPayload));

      await labApi.createDirect(fd);
      toast.success(t('reports.sendModal.successToast', { patientName: patient.name, doctorName: doctor.name }));
      onSent(); onClose();
    } catch (err: any) {
      setError(err.message || t('reports.sendModal.errors.generic'));
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-500 to-emerald-600">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Send size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{t('reports.sendModal.title')}</p>
              <p className="text-xs text-white/70">{t('reports.sendModal.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchDropdown
              label={t('reports.sendModal.fields.patientLabel')}
              placeholder={t('reports.sendModal.fields.patientPlaceholder')}
              fetchFn={userApi.searchPatients}
              queryKey="lab-direct-search-patients"
              selected={patient}
              onSelect={setPatient}
              renderItem={(p: any) => (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-xs font-bold shrink-0">{p.name.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.email}</p>
                  </div>
                </div>
              )}
              renderSelected={(p: any) => (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-xs font-bold shrink-0">{p.name.charAt(0)}</div>
                  <div><p className="text-sm font-semibold text-teal-700">{p.name}</p><p className="text-xs text-gray-500">{p.email}</p></div>
                </div>
              )}
            />

            <SearchDropdown
              label={t('reports.sendModal.fields.doctorLabel')}
              placeholder={t('reports.sendModal.fields.doctorPlaceholder')}
              fetchFn={userApi.searchDoctors}
              queryKey="lab-direct-search-doctors"
              selected={doctor}
              onSelect={setDoctor}
              renderItem={(d: any) => (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                    <Stethoscope size={13} strokeWidth={2} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t('shared.doctorPrefix', { name: d.name })}</p>
                    <p className="text-xs text-gray-400">{d.specialization || d.email}</p>
                  </div>
                </div>
              )}
              renderSelected={(d: any) => (
                <div className="flex items-center gap-2">
                  <Stethoscope size={14} strokeWidth={2} className="text-teal-600" />
                  <div><p className="text-sm font-semibold text-teal-700">{t('shared.doctorPrefix', { name: d.name })}</p></div>
                </div>
              )}
            />
          </div>

          <div>
            <label className="label">{t('reports.sendModal.fields.reportTypeLabel')} <span className="text-red-400">*</span></label>
            {services.length > 0 ? (
              <select className="input text-sm" value={reportType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => selectReportType(e.target.value)}>
                <option value="">{t('reports.sendModal.fields.selectServicePlaceholder')}</option>
                {services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <>
                <input type="text" className="input text-sm" placeholder={t('reports.sendModal.fields.reportTypeFreeformPlaceholder')}
                  value={reportType} onChange={(e: React.ChangeEvent<HTMLInputElement>) => selectReportType(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t('reports.sendModal.fields.noServicesHint')}
                </p>
              </>
            )}
          </div>

          <div>
            <label className="label">{t('reports.sendModal.fields.testsSummaryLabel')} <span className="text-red-400">*</span></label>
            <textarea rows={2} className="input resize-none text-sm"
              placeholder={t('reports.sendModal.fields.testsSummaryPlaceholder')}
              value={testDesc} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestDesc(e.target.value)} />
          </div>

          <div>
            <label className="label">{t('reports.fields.sampleIdLabel')} <span className="text-gray-400 font-normal">{t('reports.fields.optional')}</span></label>
            <input type="text" className="input text-sm" placeholder={t('reports.fields.sampleIdPlaceholder')}
              value={sampleId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSampleId(e.target.value)} />
          </div>

          <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={showBloodPanel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowBloodPanel(e.target.checked)}
                className="w-4 h-4 accent-teal-600" />
              {t('reports.bloodPanel.checkboxLabel')}
            </label>
            <span className="text-[11px] text-gray-400">{t('reports.bloodPanel.checkboxHint')}</span>
          </div>

          {showBloodPanel && <BloodValuesSection values={values} setVal={setVal} />}

          <div>
            <label className="label">
              {t('reports.fields.reportFileLabel')} <span className="text-red-400">*</span>
              <span className="text-gray-400 font-normal ml-1">{t('reports.fields.reportFileHint')}</span>
            </label>

            {!file ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-teal-400 hover:bg-teal-50 transition-colors group">
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-teal-600">
                  <Upload size={24} strokeWidth={1.5} />
                  <p className="text-sm font-medium">{t('reports.fields.clickToSelect')}</p>
                  <p className="text-xs">{t('reports.fields.fileTypesList')}</p>
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
                    {tc('actions.change')}
                  </button>
                </div>
                {preview && (
                  <img src={preview} alt="Preview" className="mt-3 w-full max-h-40 object-contain rounded-lg border border-gray-200" />
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif" className="hidden" onChange={handleFile} />
          </div>

          <div>
            <label className="label">
              {t('reports.fields.reportNotesLabel')} <span className="text-gray-400 font-normal">{t('reports.fields.optional')}</span>
            </label>
            <textarea rows={2} className="input resize-none text-sm"
              placeholder={t('reports.fields.reportNotesPlaceholder')}
              value={reportNotes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReportNotes(e.target.value)} />
          </div>

          <div>
            <label className="label">
              {t('reports.sendModal.fields.notesForDoctorLabel')} <span className="text-gray-400 font-normal">{t('reports.fields.optional')}</span>
            </label>
            <textarea rows={2} className="input resize-none text-sm"
              placeholder={t('reports.sendModal.fields.notesForDoctorPlaceholder')}
              value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
          </div>

          {filledCount > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
              <FlaskConical size={18} className="text-teal-600 shrink-0" />
              <p className="text-sm text-teal-800 font-medium">
                <span className="font-bold">{t('reports.bloodPanel.summaryCount', { count: filledCount })}</span> {t('reports.bloodPanel.summarySuffix')}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button type="submit" disabled={sending}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {t('reports.sendModal.sendingLabel')}
                </>
              ) : (
                <>
                  <Send size={15} strokeWidth={2} />
                  {t('reports.sendModal.submitLabel')}
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">{tc('actions.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
interface UploadModalProps { req: any; onClose: () => void; onUploaded: () => void; }

function UploadModal({ req: r, onClose, onUploaded }: UploadModalProps) {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const [file,      setFile]      = useState<File | null>(null);
  const [preview,   setPreview]   = useState<string | null>(null);
  const [notes,     setNotes]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [values,    setValues]    = useState<Record<string, string>>({});
  const [showBloodPanel, setShowBloodPanel] = useState(() => looksLikeBloodPanel(r.report_type || r.test_description || ''));
  const fileRef = useRef<HTMLInputElement>(null);

  const setVal = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));

  const filledCount = countFilled(values);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error(t('reports.errors.reportFileRequired'));
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
      const vitalsCount = Object.keys(vitalsPayload).length;
      toast.success(`${t('reports.uploadModal.toastBase')}${vitalsCount > 0 ? t('reports.uploadModal.toastVitalsSuffix', { count: vitalsCount }) : ''}${t('reports.uploadModal.toastNotifiedSuffix')}`);
      onUploaded(); onClose();
    } catch (err: any) {
      toast.error(err.message || t('reports.uploadModal.toastError'));
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
              <p className="text-sm font-bold text-gray-900">{t('reports.uploadModal.title')}</p>
              <p className="text-xs text-gray-500">
                {t('reports.uploadModal.patientLabel')} <span className="font-semibold text-gray-700">{r.patient_name}</span>
                {r.doctor_name && <> · {t('reports.uploadModal.doctorLabel')} <span className="font-semibold text-gray-700">{t('shared.doctorPrefix', { name: r.doctor_name })}</span></>}
              </p>
              <p className="text-[11px] text-teal-600 font-medium mt-0.5">
                {r.doctor_name ? t('reports.uploadModal.notifyBoth') : t('reports.uploadModal.notifyPatientOnly')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">

          {/* Tests info */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">{t('reports.uploadModal.testsRequestedHeading')}</p>
            <p className="text-sm text-gray-800 font-medium">{r.test_description}</p>
            {r.notes && <p className="text-xs text-gray-500 mt-1">{t('reports.uploadModal.notesLabel')} {r.notes}</p>}
          </div>

          <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={showBloodPanel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowBloodPanel(e.target.checked)}
                className="w-4 h-4 accent-teal-600" />
              {t('reports.bloodPanel.checkboxLabel')}
            </label>
            <span className="text-[11px] text-gray-400">{t('reports.bloodPanel.checkboxHint')}</span>
          </div>

          {showBloodPanel && <BloodValuesSection values={values} setVal={setVal} />}

          {/* File upload */}
          <div>
            <label className="label">
              {t('reports.fields.reportFileLabel')} <span className="text-red-400">*</span>
              <span className="text-gray-400 font-normal ml-1">{t('reports.fields.reportFileHint')}</span>
            </label>

            {!file ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-teal-400 hover:bg-teal-50 transition-colors group">
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-teal-600">
                  <Upload size={24} strokeWidth={1.5} />
                  <p className="text-sm font-medium">{t('reports.fields.clickToSelect')}</p>
                  <p className="text-xs">{t('reports.fields.fileTypesList')}</p>
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
                    {tc('actions.change')}
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
              {t('reports.fields.reportNotesLabel')}
              <span className="text-gray-400 font-normal ml-1">{t('reports.fields.optional')}</span>
            </label>
            <textarea rows={2} className="input resize-none text-sm"
              placeholder={t('reports.fields.reportNotesPlaceholder')}
              value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
          </div>

          {/* Summary */}
          {filledCount > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
              <FlaskConical size={18} className="text-teal-600 shrink-0" />
              <p className="text-sm text-teal-800 font-medium">
                <span className="font-bold">{t('reports.bloodPanel.summaryCount', { count: filledCount })}</span> {t('reports.bloodPanel.summarySuffix')}
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
                  {t('reports.uploadModal.uploadingLabel')}
                </>
              ) : (
                <>
                  <Upload size={15} strokeWidth={2} />
                  {filledCount > 0 ? t('reports.uploadModal.uploadAndSave', { count: filledCount }) : t('reports.uploadModal.uploadAndNotify')}
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-5">{tc('actions.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── View Modal ────────────────────────────────────────────────────────────────
interface ViewModalProps { req: any; onClose: () => void; }

function ViewModal({ req: r, onClose }: ViewModalProps) {
  const { t } = useTranslation('laboratory');
  const isPDF = r.report_mimetype?.includes('pdf');
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-100 rounded-xl flex items-center justify-center">
              <Eye size={14} className="text-cyan-700" />
            </div>
            <h2 className="text-base font-bold text-gray-900">{t('reports.viewModal.title', { patientName: r.patient_name })}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            <X size={15} />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t('reports.viewModal.fields.patient'),     value: r.patient_name },
              { label: t('reports.viewModal.fields.doctor'),      value: r.doctor_name ? t('shared.doctorPrefix', { name: r.doctor_name }) : '—' },
              { label: t('reports.viewModal.fields.reportType'),  value: r.report_type || '—' },
              { label: t('reports.viewModal.fields.requested'),   value: formatDate(r.created_at) },
              { label: t('reports.viewModal.fields.email'),       value: r.patient_email || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
            <p className="text-xs font-bold text-cyan-700 mb-1">{t('reports.viewModal.testsHeading')}</p>
            <p className="text-sm text-gray-800">{r.test_description}</p>
          </div>
          {(r.sample_id || r.sample_collected_at) && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-700 mb-1.5">{t('reports.viewModal.sampleInfoHeading')}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                {r.sample_id           && <p><span className="text-gray-400">{t('reports.viewModal.sampleIdLabel')}</span> {r.sample_id}</p>}
                {r.sample_collected_at && <p className="col-span-2"><span className="text-gray-400">{t('reports.viewModal.collectedLabel')}</span> {formatDate(r.sample_collected_at)}</p>}
              </div>
            </div>
          )}
          {r.report_notes && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
              <p className="text-xs font-bold text-teal-700 mb-1">{t('reports.viewModal.reportNotesHeading')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.report_notes}</p>
            </div>
          )}
          {r.report_file && (
            <a href={`${API_BASE}/uploads/lab-reports/${r.report_file}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors">
              <span className="text-2xl">{isPDF ? '📄' : '🖼️'}</span>
              <div>
                <p className="text-sm font-semibold text-primary-700">{t('reports.viewModal.openReport')}</p>
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

// ── Sample Info Modal (captured when starting processing) ────────────────────
interface SampleInfoModalProps { req: any; onClose: () => void; onStarted: () => void; }

function SampleInfoModal({ req: r, onClose, onStarted }: SampleInfoModalProps) {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [sampleId,   setSampleId]   = useState('');
  const [collectedAt,setCollectedAt]= useState(nowLocal);

  const mutation = useMutation({
    mutationFn: () => labApi.updateStatus(r.id, 'in_progress', {
      sample_id: sampleId.trim() || undefined,
      sample_collected_at: collectedAt ? new Date(collectedAt).toISOString() : undefined,
    }),
    onSuccess: () => { toast.success(t('reports.sampleModal.toastSuccess')); onStarted(); onClose(); },
    onError: (err: any) => toast.error(err.message || t('reports.sampleModal.toastError')),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-cyan-600">
          <div>
            <p className="text-sm font-bold text-white">{t('reports.sampleModal.title')}</p>
            <p className="text-xs text-white/70">{t('reports.sampleModal.patientLabel')} {r.patient_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">{t('reports.fields.sampleIdLabel')} <span className="text-gray-400 font-normal">{t('reports.fields.optional')}</span></label>
            <input type="text" className="input text-sm" placeholder={t('reports.fields.sampleIdPlaceholder')}
              value={sampleId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSampleId(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('reports.sampleModal.collectedAtLabel')}</label>
            <input type="datetime-local" className="input text-sm"
              value={collectedAt} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCollectedAt(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="btn-primary flex-1 py-2.5 disabled:opacity-60">
              {mutation.isPending ? t('reports.sampleModal.startingLabel') : t('reports.sampleModal.submitLabel')}
            </button>
            <button onClick={onClose} className="btn-secondary px-5">{tc('actions.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function exportReportsCSV(rows: any[], headers: string[], doctorLabel: (name: string) => string): void {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.patient_name, r.doctor_name ? doctorLabel(r.doctor_name) : '', r.report_type || '', r.status,
      r.sample_id || '',
      r.sample_collected_at ? formatDate(r.sample_collected_at) : '',
      formatDate(r.created_at), r.test_description,
    ].map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `lab-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function LaboratoryReports() {
  const { t } = useTranslation('laboratory');
  const { t: tc } = useTranslation('common');
  const [uploading, setUploading] = useState<any>(null);
  const [viewing,   setViewing]   = useState<any>(null);
  const [starting,  setStarting]  = useState<any>(null);
  const [sending,   setSending]   = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
    pending:     { badge: 'bg-yellow-100 text-yellow-700', label: tc('status.pending')     },
    in_progress: { badge: 'bg-blue-100   text-blue-700',   label: tc('status.inProgress') },
    completed:   { badge: 'bg-green-100  text-green-700',  label: tc('status.completed')   },
  };

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['lab-assigned-requests'],
    queryFn:  labApi.getAll,
  });

  // Dashboard "New Report" quick action navigates here with this flag
  useEffect(() => {
    if ((location.state as any)?.openNewReport) {
      setSending(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const openUpload = async (id: number) => {
    try { setUploading(await labApi.getOne(id)); }
    catch { toast.error('Failed to load request'); }
  };

  const openView = async (id: number) => {
    try { setViewing(await labApi.getOne(id)); }
    catch { toast.error('Failed to load report'); }
  };

  const byStatus = filter === 'all' ? requests : (requests as any[]).filter((r: any) => r.status === filter);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? (byStatus as any[]).filter((r: any) =>
        r.patient_name?.toLowerCase().includes(q) || r.doctor_name?.toLowerCase().includes(q))
    : byStatus;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('reports.page.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('reports.page.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setSending(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-sm hover:opacity-90 transition-opacity">
            <Plus size={15} strokeWidth={2.5} />
            {t('reports.page.newReportButton')}
          </button>
          <button onClick={() => exportReportsCSV(
              filtered as any[],
              [t('reports.csv.patient'), t('reports.csv.doctor'), t('reports.csv.reportType'), tc('fields.status'), t('reports.csv.sampleId'), t('reports.csv.sampleCollected'), t('reports.csv.requested'), t('reports.csv.tests')],
              (name: string) => t('shared.doctorPrefix', { name }),
            )}
            disabled={(filtered as any[]).length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50">
            <Download size={14} strokeWidth={2.5} />
            {t('reports.page.exportCsv')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder={t('reports.page.searchPlaceholder')}
            className="input pl-9 text-sm py-1.5 w-full" />
        </div>
        <select value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)}
          className="input text-sm py-1.5 w-36">
          <option value="all">{t('reports.page.filterAll')}</option>
          <option value="pending">{tc('status.pending')}</option>
          <option value="in_progress">{tc('status.inProgress')}</option>
          <option value="completed">{tc('status.completed')}</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('reports.page.stats.total'), value: (requests as any[]).length,                                                   icon: '📋', bg: 'bg-cyan-50   border-cyan-100'   },
          { label: tc('status.pending'),          value: (requests as any[]).filter((r: any) => r.status === 'pending').length,   icon: '⏳', bg: 'bg-yellow-50 border-yellow-100' },
          { label: tc('status.completed'),        value: (requests as any[]).filter((r: any) => r.status === 'completed').length, icon: '✅', bg: 'bg-green-50  border-green-100'  },
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
          {tc('actions.loading')}
        </div>
      ) : (filtered as any[]).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔬</span>
          <p className="text-gray-600 font-medium">{search ? t('reports.page.emptyMatching') : t('reports.page.emptyNone')}</p>
          <p className="text-sm text-gray-400 mt-1">{search ? t('reports.page.emptyMatchingHint') : t('reports.page.emptyNoneHint')}</p>
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
                        {r.report_type && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700">{r.report_type}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t('shared.doctorPrefix', { name: r.doctor_name })} · {formatDate(r.created_at)}
                        {r.sample_id && <span className="ml-1.5 text-amber-600 font-medium">· {t('reports.page.sampleLabel')} {r.sample_id}</span>}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-1">{r.test_description}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {r.status === 'pending' && (
                      <>
                        <button onClick={() => setStarting(r)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 justify-center">
                          <Beaker size={11} /> Start Processing
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
      {sending && (
        <SendReportModal
          onClose={() => setSending(false)}
          onSent={() => qc.invalidateQueries({ queryKey: ['lab-assigned-requests'] })}
        />
      )}
      {starting && (
        <SampleInfoModal
          req={starting}
          onClose={() => setStarting(null)}
          onStarted={() => qc.invalidateQueries({ queryKey: ['lab-assigned-requests'] })}
        />
      )}
    </div>
  );
}
