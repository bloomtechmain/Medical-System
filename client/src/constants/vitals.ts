import type { TFunction } from 'i18next';

// Clinical reference ranges and the status rules that go with them.
//
// Extracted from VitalsOverview.tsx so the downloadable health report can use
// the same numbers. Having them in two places would mean a value flagged
// "high" on the dashboard could print as "normal" in a PDF the patient takes
// to a doctor — the kind of divergence this project has already been bitten
// by twice in its schema, and far more consequential here.
//
// `min`/`max` are the normal reference range. `critLow`/`critHigh` are the
// points at which a value stops being merely out of range and becomes
// clinically urgent; they are deliberately absent on the indices (MCV, MCH,
// MCHC, RDW, MPV) where a single out-of-range reading is not actionable on its
// own.
export interface VitalDef {
  key: string;
  unit: string;
  min: number;
  max: number;
  step: string;
  critLow?: number;
  critHigh?: number;
  group: string;
  inputType?: 'integer';
}

export const VITALS: VitalDef[] = [
  // CBC Panel
  { key: 'wbc',             unit: '10³/µL', min: 4.5,  max: 11.0, step: '0.1',  critLow: 2.0,  critHigh: 20.0,  group: 'CBC' },
  { key: 'rbc',             unit: '10⁶/µL', min: 4.5,  max: 6.0,  step: '0.01', critLow: 3.0,  critHigh: 7.0,   group: 'CBC' },
  { key: 'hemoglobin',      unit: 'g/dL',   min: 12.0, max: 18.0, step: '0.1',  critLow: 7.0,  critHigh: 20.0,  group: 'CBC' },
  { key: 'hematocrit',      unit: '%',      min: 37.0, max: 52.0, step: '0.1',  critLow: 20.0, critHigh: 60.0,  group: 'CBC' },
  { key: 'mcv',             unit: 'fL',     min: 80.0, max: 99.0, step: '0.1',  group: 'CBC' },
  { key: 'mch',             unit: 'pg',     min: 27.0, max: 34.5, step: '0.1',  group: 'CBC' },
  { key: 'mchc',            unit: 'g/dL',   min: 32.0, max: 36.5, step: '0.1',  group: 'CBC' },
  { key: 'rdw',             unit: '%',      min: 11.0, max: 15.0, step: '0.1',  group: 'CBC' },
  { key: 'platelets',       unit: '10³/µL', min: 150,  max: 450,  step: '1',    critLow: 50,   critHigh: 1000,  group: 'CBC', inputType: 'integer' },
  { key: 'mpv',             unit: 'fL',     min: 7.4,  max: 12.0, step: '0.1',  group: 'CBC' },
  // Metabolic
  { key: 'blood_glucose',   unit: 'mg/dL',  min: 70,   max: 100,  step: '0.1',  critLow: 40,   critHigh: 500,   group: 'Metabolic' },
  { key: 'hba1c',           unit: '%',      min: 4.0,  max: 5.6,  step: '0.1',  critHigh: 14,  group: 'Metabolic' },
  { key: 'creatinine',      unit: 'mg/dL',  min: 0.7,  max: 1.2,  step: '0.01', critHigh: 10,  group: 'Metabolic' },
  // Lipid Panel
  { key: 'cholesterol',     unit: 'mg/dL',  min: 125,  max: 200,  step: '1',    critHigh: 300, group: 'Lipid', inputType: 'integer' },
  { key: 'hdl',             unit: 'mg/dL',  min: 40,   max: 60,   step: '1',    group: 'Lipid', inputType: 'integer' },
  { key: 'ldl',             unit: 'mg/dL',  min: 0,    max: 100,  step: '1',    critHigh: 190, group: 'Lipid', inputType: 'integer' },
  { key: 'triglycerides',   unit: 'mg/dL',  min: 0,    max: 150,  step: '1',    critHigh: 500, group: 'Lipid', inputType: 'integer' },
  // Basic Vitals
  { key: 'bp_systolic',     unit: 'mmHg',   min: 90,   max: 120,  step: '1',    critLow: 70,   critHigh: 180,   group: 'Vitals', inputType: 'integer' },
  { key: 'bp_diastolic',    unit: 'mmHg',   min: 60,   max: 80,   step: '1',    critLow: 40,   critHigh: 120,   group: 'Vitals', inputType: 'integer' },
  { key: 'heart_rate',      unit: 'bpm',    min: 60,   max: 100,  step: '1',    critLow: 40,   critHigh: 150,   group: 'Vitals', inputType: 'integer' },
  { key: 'temperature',     unit: '°C',     min: 36.1, max: 37.2, step: '0.1',  critLow: 34,   critHigh: 41,    group: 'Vitals' },
  { key: 'oxygen_saturation', unit: '%',    min: 95,   max: 100,  step: '0.1',  critLow: 85,   group: 'Vitals' },
];

export const GROUPS = ['CBC', 'Metabolic', 'Lipid', 'Vitals'];

export const GROUP_META: Record<string, { icon: string; color: string }> = {
  CBC:       { icon: '🩸', color: 'text-rose-600'   },
  Metabolic: { icon: '⚗️', color: 'text-amber-600'  },
  Lipid:     { icon: '💧', color: 'text-blue-600'   },
  Vitals:    { icon: '❤️', color: 'text-teal-600'   },
};

export const GROUP_I18N_KEY: Record<string, string> = {
  CBC: 'cbc', Metabolic: 'metabolic', Lipid: 'lipid', Vitals: 'vitals',
};

export const groupLabel = (g: string, t: TFunction): string =>
  t(`vitalsOverview.groups.${GROUP_I18N_KEY[g]}`);

// Maps a VitalDef.key to its camelCase suffix under vitalsOverview.vitalsDef.*
export const VITAL_I18N_KEY: Record<string, string> = {
  wbc: 'wbc', rbc: 'rbc', hemoglobin: 'hemoglobin', hematocrit: 'hematocrit',
  mcv: 'mcv', mch: 'mch', mchc: 'mchc', rdw: 'rdw', platelets: 'platelets', mpv: 'mpv',
  blood_glucose: 'bloodGlucose', hba1c: 'hba1c', creatinine: 'creatinine',
  cholesterol: 'cholesterol', hdl: 'hdl', ldl: 'ldl', triglycerides: 'triglycerides',
  bp_systolic: 'bpSystolic', bp_diastolic: 'bpDiastolic', heart_rate: 'heartRate',
  temperature: 'temperature', oxygen_saturation: 'oxygenSaturation',
};

export const vitalLabel = (def: VitalDef, t: TFunction): string =>
  t(`vitalsOverview.vitalsDef.${VITAL_I18N_KEY[def.key]}`);

export type VitalStatus = 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high';

// Critical thresholds are checked before the normal range, because a value can
// be both below `min` and below `critLow` — and "critical" is the answer that
// matters.
export function getStatus(value: number, def: VitalDef): VitalStatus {
  if (def.critLow  !== undefined && value < def.critLow)  return 'critical-low';
  if (def.critHigh !== undefined && value > def.critHigh) return 'critical-high';
  if (value < def.min) return 'low';
  if (value > def.max) return 'high';
  return 'normal';
}

export const STATUS_STYLE: Record<string, { badge: string; color: string; pulse?: boolean }> = {
  'normal':        { badge: 'bg-teal-500  text-white', color: '#14b8a6' },
  'low':           { badge: 'bg-blue-500  text-white', color: '#3b82f6' },
  'high':          { badge: 'bg-amber-500 text-white', color: '#f59e0b' },
  'critical-low':  { badge: 'bg-red-600   text-white', color: '#dc2626', pulse: true },
  'critical-high': { badge: 'bg-red-600   text-white', color: '#dc2626', pulse: true },
};

export const statusLabel = (status: string, tc: TFunction): string => {
  if (status === 'normal') return tc('status.normal');
  if (status === 'low') return tc('status.low');
  if (status === 'high') return tc('status.high');
  return tc('status.critical');
};

export const SOURCE_META: Record<string, { icon: string; className: string }> = {
  lab_report:     { icon: '🧪', className: 'bg-primary-50 text-primary-700' },
  patient_upload: { icon: '📄', className: 'bg-violet-50 text-violet-700' },
  manual:         { icon: '✍️', className: 'bg-gray-100 text-gray-600' },
};

export const SOURCE_I18N_KEY: Record<string, string> = {
  lab_report: 'labReport', patient_upload: 'yourUpload', manual: 'manualEntry',
};

export const sourceLabel = (src: string, t: TFunction): string =>
  t(`vitalsOverview.source.${SOURCE_I18N_KEY[src]}`);

export interface VitalFieldMeta {
  source: string;
  recorded_at: string;
  previous?: number | null;
  delta?: number | null;
  direction?: 'up' | 'down' | 'same' | null;
}
