import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Edit3, X, Save, RefreshCw, FlaskConical, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { patientVitalsApi } from '../../services/api';
import { formatDateTime } from '../../utils/helpers';

// ── Vital definitions with ranges ─────────────────────────────────────────────
interface VitalDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: string;
  critLow?: number;
  critHigh?: number;
  group: string;
  inputType?: 'integer';
}

const VITALS: VitalDef[] = [
  // CBC Panel
  { key: 'wbc',             label: 'White Blood Cells',   unit: '10³/µL', min: 4.5,  max: 11.0, step: '0.1',  critLow: 2.0,  critHigh: 20.0,  group: 'CBC' },
  { key: 'rbc',             label: 'Red Blood Cells',     unit: '10⁶/µL', min: 4.5,  max: 6.0,  step: '0.01', critLow: 3.0,  critHigh: 7.0,   group: 'CBC' },
  { key: 'hemoglobin',      label: 'Hemoglobin',          unit: 'g/dL',   min: 12.0, max: 18.0, step: '0.1',  critLow: 7.0,  critHigh: 20.0,  group: 'CBC' },
  { key: 'hematocrit',      label: 'Hematocrit',          unit: '%',      min: 37.0, max: 52.0, step: '0.1',  critLow: 20.0, critHigh: 60.0,  group: 'CBC' },
  { key: 'mcv',             label: 'MCV (Red Cell Size)',            unit: 'fL',     min: 80.0, max: 99.0, step: '0.1',  group: 'CBC' },
  { key: 'mch',             label: 'MCH (Hemoglobin per Cell)',      unit: 'pg',     min: 27.0, max: 34.5, step: '0.1',  group: 'CBC' },
  { key: 'mchc',            label: 'MCHC (Hemoglobin Concentration)',unit: 'g/dL',   min: 32.0, max: 36.5, step: '0.1',  group: 'CBC' },
  { key: 'rdw',             label: 'RDW (Red Cell Size Variation)',  unit: '%',      min: 11.0, max: 15.0, step: '0.1',  group: 'CBC' },
  { key: 'platelets',       label: 'Platelet Count',      unit: '10³/µL', min: 150,  max: 450,  step: '1',    critLow: 50,   critHigh: 1000,  group: 'CBC', inputType: 'integer' },
  { key: 'mpv',             label: 'MPV (Platelet Size)', unit: 'fL',     min: 7.4,  max: 12.0, step: '0.1',  group: 'CBC' },
  // Metabolic
  { key: 'blood_glucose',   label: 'Blood Glucose (Blood Sugar)', unit: 'mg/dL',  min: 70,   max: 100,  step: '0.1',  critLow: 40,   critHigh: 500,   group: 'Metabolic' },
  { key: 'hba1c',           label: 'HbA1c (Avg. Blood Sugar, 3 Months)', unit: '%',      min: 4.0,  max: 5.6,  step: '0.1',  critHigh: 14,  group: 'Metabolic' },
  { key: 'creatinine',      label: 'Creatinine (Kidney Function)',  unit: 'mg/dL',  min: 0.7,  max: 1.2,  step: '0.01', critHigh: 10,  group: 'Metabolic' },
  // Lipid Panel
  { key: 'cholesterol',     label: 'Total Cholesterol',   unit: 'mg/dL',  min: 125,  max: 200,  step: '1',    critHigh: 300, group: 'Lipid', inputType: 'integer' },
  { key: 'hdl',             label: 'HDL Cholesterol (Good)', unit: 'mg/dL',  min: 40,   max: 60,   step: '1',    group: 'Lipid', inputType: 'integer' },
  { key: 'ldl',             label: 'LDL Cholesterol (Bad)',  unit: 'mg/dL',  min: 0,    max: 100,  step: '1',    critHigh: 190, group: 'Lipid', inputType: 'integer' },
  { key: 'triglycerides',   label: 'Triglycerides (Blood Fat)', unit: 'mg/dL',  min: 0,    max: 150,  step: '1',    critHigh: 500, group: 'Lipid', inputType: 'integer' },
  // Basic Vitals
  { key: 'bp_systolic',     label: 'Blood Pressure (Systolic)',  unit: 'mmHg',   min: 90,   max: 120,  step: '1',    critLow: 70,   critHigh: 180,   group: 'Vitals', inputType: 'integer' },
  { key: 'bp_diastolic',    label: 'Blood Pressure (Diastolic)', unit: 'mmHg',   min: 60,   max: 80,   step: '1',    critLow: 40,   critHigh: 120,   group: 'Vitals', inputType: 'integer' },
  { key: 'heart_rate',      label: 'Heart Rate',          unit: 'bpm',    min: 60,   max: 100,  step: '1',    critLow: 40,   critHigh: 150,   group: 'Vitals', inputType: 'integer' },
  { key: 'temperature',     label: 'Temperature',         unit: '°C',     min: 36.1, max: 37.2, step: '0.1',  critLow: 34,   critHigh: 41,    group: 'Vitals' },
  { key: 'oxygen_saturation', label: 'O₂ Saturation',    unit: '%',      min: 95,   max: 100,  step: '0.1',  critLow: 85,   group: 'Vitals' },
];

const GROUPS = ['CBC', 'Metabolic', 'Lipid', 'Vitals'];

const GROUP_META: Record<string, { label: string; icon: string; color: string }> = {
  CBC:       { label: 'Complete Blood Count',  icon: '🩸', color: 'text-rose-600'   },
  Metabolic: { label: 'Metabolic Panel',       icon: '⚗️', color: 'text-amber-600'  },
  Lipid:     { label: 'Lipid Panel',           icon: '💧', color: 'text-blue-600'   },
  Vitals:    { label: 'Basic Vitals',          icon: '❤️', color: 'text-teal-600'   },
};

// ── Status calculation ────────────────────────────────────────────────────────
function getStatus(value: number, def: VitalDef): 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high' {
  if (def.critLow  !== undefined && value < def.critLow)  return 'critical-low';
  if (def.critHigh !== undefined && value > def.critHigh) return 'critical-high';
  if (value < def.min) return 'low';
  if (value > def.max) return 'high';
  return 'normal';
}

const STATUS_STYLE: Record<string, { badge: string; color: string; label: string; pulse?: boolean }> = {
  'normal':        { badge: 'bg-teal-500  text-white', color: '#14b8a6', label: 'Normal'   },
  'low':           { badge: 'bg-blue-500  text-white', color: '#3b82f6', label: 'Low'      },
  'high':          { badge: 'bg-amber-500 text-white', color: '#f59e0b', label: 'High'     },
  'critical-low':  { badge: 'bg-red-600   text-white', color: '#dc2626', label: 'Critical', pulse: true },
  'critical-high': { badge: 'bg-red-600   text-white', color: '#dc2626', label: 'Critical', pulse: true },
};

// ── Source badge (per-field provenance) ────────────────────────────────────────
const SOURCE_META: Record<string, { icon: string; label: string; className: string }> = {
  lab_report:     { icon: '🧪', label: 'Lab report',   className: 'bg-primary-50 text-primary-700' },
  patient_upload: { icon: '📄', label: 'Your upload',  className: 'bg-violet-50 text-violet-700' },
  manual:         { icon: '✍️', label: 'Manual entry', className: 'bg-gray-100 text-gray-600' },
};

interface VitalFieldMeta {
  source: string;
  recorded_at: string;
  previous?: number | null;
  delta?: number | null;
  direction?: 'up' | 'down' | 'same' | null;
}

// ── VitalCard ─────────────────────────────────────────────────────────────────
function VitalCard({ def, value, meta, onClick }: { def: VitalDef; value: number; meta?: VitalFieldMeta; onClick?: () => void }) {
  const status = getStatus(value, def);
  const style  = STATUS_STYLE[status];
  const src    = meta ? SOURCE_META[meta.source] : undefined;
  const trend  = meta?.previous != null ? meta : undefined;

  // Bar geometry — show 20% padding outside normal range
  const range   = def.max - def.min;
  const barMin  = def.min - range * 0.2;
  const barMax  = def.max + range * 0.2;
  const barSpan = barMax - barMin;
  const pct     = Math.max(2, Math.min(98, ((value - barMin) / barSpan) * 100));
  const normalL = ((def.min - barMin) / barSpan) * 100;
  const normalW = (range / barSpan) * 100;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`View ${def.label} history`}
      className={`group text-left w-full bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md hover:border-primary-200 transition-shadow ${
      style.pulse ? 'border-red-200' : 'border-gray-100'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-gray-800 leading-tight">{def.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {def.min} – {def.max} {def.unit}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${style.badge} ${style.pulse ? 'animate-pulse' : ''}`}>
          {style.label}
        </span>
      </div>

      {/* Value badge */}
      <div className="flex justify-center my-3">
        <div
          className={`inline-flex items-center justify-center min-w-[54px] h-9 px-3 rounded-full text-white text-base font-bold shadow-md ${style.pulse ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: style.color }}
        >
          {value}
        </div>
      </div>

      {/* Trend vs. previous reading */}
      {trend && (
        <p className={`text-center text-[10px] font-semibold mb-1 ${
          trend.direction === 'up' ? 'text-amber-600' : trend.direction === 'down' ? 'text-blue-600' : 'text-gray-400'
        }`}>
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '≈'}{' '}
          {trend.delta != null && trend.delta !== 0 ? `${trend.delta > 0 ? '+' : ''}${trend.delta}` : 'no change'}
          {' '}since last ({trend.previous})
        </p>
      )}

      {/* Range bar */}
      <div className="relative mt-1">
        <div className="h-2 bg-gray-100 rounded-full relative overflow-hidden">
          {/* Normal zone */}
          <div
            className="absolute top-0 h-full rounded-full opacity-30"
            style={{ left: `${normalL}%`, width: `${normalW}%`, backgroundColor: style.color }}
          />
          {/* Filled bar up to value */}
          <div
            className="absolute top-0 left-0 h-full rounded-full opacity-70"
            style={{ width: `${pct}%`, backgroundColor: style.color }}
          />
        </div>
        {/* Marker dot */}
        <div
          className="absolute top-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md -mt-1"
          style={{ left: `${pct}%`, backgroundColor: style.color }}
        />
        {/* Min / Max labels */}
        <div className="flex justify-between mt-3">
          <span className="text-[9px] text-gray-400 font-medium">{def.min}</span>
          <span className="text-[9px] text-gray-400 font-medium">{def.max}</span>
        </div>
      </div>

      {/* Provenance — where this value came from */}
      {src && (
        <div
          className={`mt-3 flex items-center justify-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg ${src.className}`}
          title={meta ? formatDateTime(meta.recorded_at) : undefined}
        >
          <span>{src.icon}</span> {src.label}
        </div>
      )}

      {/* Affordance — this whole card is clickable */}
      <p className="text-center text-[9px] font-semibold text-gray-300 mt-2 group-hover:text-primary-500 transition-colors">
        Click for history →
      </p>
    </button>
  );
}

// ── Vital History Modal ─────────────────────────────────────────────────────
const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

interface HistoryPoint {
  id: number;
  value: string | number;
  source: string;
  lab_request_id: number | null;
  patient_report_id: number | null;
  recorded_at: string;
}

function VitalTrendChart({ def, points }: { def: VitalDef; points: HistoryPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 640, H = 220;
  const padL = 38, padR = 12, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const values = points.map(p => Number(p.value));
  const domainMin = Math.min(...values, def.min);
  const domainMax = Math.max(...values, def.max);
  const pad = (domainMax - domainMin || 1) * 0.15;
  const yMin = domainMin - pad, yMax = domainMax + pad;

  const xAt = (i: number) => padL + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)},${yAt(Number(p.value))}`).join(' ');
  const normalTop    = Math.max(padT, yAt(def.max));
  const normalBottom = Math.min(padT + plotH, yAt(def.min));

  // Y-axis ticks: min / mid / max of the visible domain
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0, best = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xAt(i) - px);
      if (d < best) { best = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const usedStatuses = Array.from(new Set(values.map(v => getStatus(v, def))));

  return (
    <div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none select-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Normal-range band */}
          <rect x={padL} y={normalTop} width={plotW} height={Math.max(0, normalBottom - normalTop)}
                fill="#14b8a6" opacity={0.08} />
          {/* Gridlines + y labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={padL - 6} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#9ca3af">
                {Math.round(t * 100) / 100}
              </text>
            </g>
          ))}
          {/* Trend line */}
          {points.length > 1 && (
            <path d={linePath} fill="none" stroke="#0d9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Crosshair */}
          {hovered && (
            <line x1={xAt(hoverIdx!)} x2={xAt(hoverIdx!)} y1={padT} y2={padT + plotH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,3" />
          )}
          {/* Dots, colored by status */}
          {points.map((p, i) => {
            const status = getStatus(Number(p.value), def);
            const color  = STATUS_STYLE[status].color;
            const isHover = hoverIdx === i;
            return (
              <circle
                key={p.id}
                cx={xAt(i)} cy={yAt(Number(p.value))}
                r={isHover ? 7 : 5}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
                tabIndex={0}
                onFocus={() => setHoverIdx(i)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          {/* X labels: first, last, and middle only (avoid crowding) */}
          {points.length > 0 && [0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map(i => (
              <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {shortDate(points[i].recorded_at)}
              </text>
            ))}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="absolute z-10 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full"
            style={{ left: `${(xAt(hoverIdx!) / W) * 100}%`, top: `${(yAt(Number(hovered.value)) / H) * 100}%`, marginTop: -10 }}
          >
            <p className="font-bold">{hovered.value} {def.unit}</p>
            <p className="text-gray-300">{formatDateTime(hovered.recorded_at)}</p>
            <p className="text-gray-300 flex items-center gap-1 mt-0.5">
              {SOURCE_META[hovered.source]?.icon} {SOURCE_META[hovered.source]?.label || hovered.source}
            </p>
          </div>
        )}
      </div>

      {/* Legend — status colors used for the dots */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {usedStatuses.map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: STATUS_STYLE[s].color }} />
            {STATUS_STYLE[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-teal-500/10 border border-teal-500/30" />
          Normal range ({def.min}–{def.max} {def.unit})
        </span>
      </div>
    </div>
  );
}

function VitalHistoryModal({ def, onClose }: { def: VitalDef; onClose: () => void }) {
  const { data: points, isLoading } = useQuery<HistoryPoint[]>({
    queryKey: ['vital-field-history', def.key],
    queryFn:  () => patientVitalsApi.fieldHistory(def.key),
  });

  const ordered = points ? [...points].reverse() : []; // newest first, for the list

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-cyan-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-md">
              <TrendingUp size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{def.label} History</p>
              <p className="text-xs text-gray-500">
                {isLoading ? 'Loading…' : `${points?.length || 0} reading${points?.length === 1 ? '' : 's'} recorded`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading history…</p>}

          {!isLoading && (!points || points.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-10">No readings recorded yet for {def.label}.</p>
          )}

          {!isLoading && points && points.length > 0 && (
            <>
              <VitalTrendChart def={def} points={points} />

              {/* Reachable-without-hover list — also shows source per reading */}
              <div className="mt-5 divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                {ordered.map((p, i) => {
                  const prev   = ordered[i + 1];
                  const delta  = prev ? Math.round((Number(p.value) - Number(prev.value)) * 100) / 100 : null;
                  const status = getStatus(Number(p.value), def);
                  const style  = STATUS_STYLE[status];
                  const src    = SOURCE_META[p.source];
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${style.badge}`}>
                          {p.value} {def.unit}
                        </span>
                        <span className="text-xs text-gray-500 truncate">{formatDateTime(p.recorded_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {delta != null && delta !== 0 && (
                          <span className={`text-[10px] font-bold ${delta > 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                            {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                        {src && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${src.className}`}>
                            {src.icon} {src.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditVitalsModal({ vitals, onClose, onSaved }: {
  vitals: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    VITALS.forEach(v => {
      init[v.key] = vitals?.[v.key] != null ? String(vitals[v.key]) : '';
    });
    init.notes = vitals?.notes || '';
    return init;
  });
  const [activeGroup, setActiveGroup] = useState('CBC');

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {};
      VITALS.forEach(v => {
        const raw = form[v.key];
        if (raw !== '' && raw !== null && raw !== undefined) {
          payload[v.key] = v.inputType === 'integer' ? parseInt(raw) : parseFloat(raw);
        }
      });
      if (form.notes) payload.notes = form.notes;
      return patientVitalsApi.save(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-vitals'] });
      onSaved();
      onClose();
    },
  });

  const groupVitals = VITALS.filter(v => v.group === activeGroup);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-cyan-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-md">
              <Activity size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Update Vitals</p>
              <p className="text-xs text-gray-500">Enter your latest test results</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Group tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-1 border-b border-gray-100 shrink-0 overflow-x-auto">
          {GROUPS.map(g => {
            const meta = GROUP_META[g];
            return (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeGroup === g
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <span>{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Fields */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {groupVitals.map(v => (
              <div key={v.key}>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  {v.label}
                  <span className="text-gray-400 font-normal ml-1">({v.unit})</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={v.step}
                    min={0}
                    placeholder={`${v.min}–${v.max}`}
                    value={form[v.key]}
                    onChange={e => setForm(f => ({ ...f, [v.key]: e.target.value }))}
                    className="input text-sm py-2 pr-1 w-full"
                  />
                </div>
                {form[v.key] && !isNaN(parseFloat(form[v.key])) && (() => {
                  const val    = parseFloat(form[v.key]);
                  const status = getStatus(val, v);
                  const style  = STATUS_STYLE[status];
                  return (
                    <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${style.badge}`}>
                      {style.label}
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>

          {activeGroup === 'Vitals' && (
            <div className="mt-4">
              <label className="block text-[11px] font-bold text-gray-600 mb-1">Notes (optional)</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g., Fasting blood test, morning reading..."
                className="input text-sm resize-none w-full"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center shrink-0 bg-gray-50">
          <p className="text-[11px] text-gray-400">Fields left blank won't be updated</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
            >
              {mutation.isPending
                ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Save size={13} strokeWidth={2.5} />
              }
              {mutation.isPending ? 'Saving…' : 'Save Vitals'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main VitalsOverview component ─────────────────────────────────────────────
export default function VitalsOverview() {
  const [showEdit,     setShowEdit]     = useState(false);
  const [historyField, setHistoryField] = useState<VitalDef | null>(null);
  const [expanded,      setExpanded]     = useState<Record<string, boolean>>({ CBC: true, Metabolic: false, Lipid: false, Vitals: false });

  const { data: vitals, isLoading, refetch } = useQuery({
    queryKey: ['patient-vitals'],
    queryFn:  patientVitalsApi.get,
  });

  const toggle = (group: string) => setExpanded(e => ({ ...e, [group]: !e[group] }));

  // Count how many vitals have values
  const filledCount = vitals
    ? VITALS.filter(v => vitals[v.key] != null).length
    : 0;

  // Summary stats
  const statusCounts = vitals
    ? VITALS.reduce((acc, v) => {
        if (vitals[v.key] == null) return acc;
        const s = getStatus(Number(vitals[v.key]), v);
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : {};

  // How many fields came from each source (lab report / patient upload / manual entry)
  const sourceCounts: Record<string, number> = vitals?.field_meta
    ? VITALS.reduce((acc, v) => {
        const src = vitals.field_meta[v.key]?.source;
        if (src) acc[src] = (acc[src] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : {};

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-primary-600 to-teal-600 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30">
              <Activity size={18} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Vitals Overview</p>
              <p className="text-primary-200 text-xs mt-0.5">
                {isLoading ? 'Loading…' : vitals
                  ? `${filledCount} vitals recorded · Last updated ${formatDateTime(vitals.updated_at || vitals.recorded_at)}`
                  : 'No vitals recorded yet'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-xl flex items-center justify-center border border-white/20 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} className="text-white" strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 bg-white text-primary-700 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-primary-50 transition-colors shadow-sm"
            >
              <Edit3 size={12} strokeWidth={2.5} />
              Update Vitals
            </button>
          </div>
        </div>

        {/* Summary badges */}
        {vitals && filledCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {statusCounts['normal']        > 0 && <span className="bg-teal-500/30 text-teal-100 border border-teal-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">✓ {statusCounts['normal']} Normal</span>}
            {statusCounts['high']          > 0 && <span className="bg-amber-500/30 text-amber-100 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">↑ {statusCounts['high']} High</span>}
            {statusCounts['low']           > 0 && <span className="bg-blue-500/30 text-blue-100 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">↓ {statusCounts['low']} Low</span>}
            {(statusCounts['critical-high'] || 0) + (statusCounts['critical-low'] || 0) > 0 &&
              <span className="bg-red-500/40 text-red-100 border border-red-400/40 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                ⚠ {(statusCounts['critical-high'] || 0) + (statusCounts['critical-low'] || 0)} Critical
              </span>
            }
            {sourceCounts.lab_report > 0 && (
              <span className="bg-white/20 text-white border border-white/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <FlaskConical size={9} strokeWidth={2.5} /> {sourceCounts.lab_report} from lab report
              </span>
            )}
            {sourceCounts.patient_upload > 0 && (
              <span className="bg-white/20 text-white border border-white/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                📄 {sourceCounts.patient_upload} from your uploads
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {!isLoading && !vitals && (
        <div className="p-10 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Activity size={28} className="text-primary-400" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-bold text-gray-700">No vitals recorded yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Manually enter your lab results, or they'll update automatically when a lab uploads a report — or when you upload one yourself.
          </p>
          <button
            onClick={() => setShowEdit(true)}
            className="mt-4 btn-primary text-sm px-5 py-2 inline-flex items-center gap-2"
          >
            <Edit3 size={13} strokeWidth={2.5} /> Enter Vitals
          </button>
        </div>
      )}

      {/* ── Vitals groups ── */}
      {vitals && (
        <div className="divide-y divide-gray-50">
          {GROUPS.map(group => {
            const meta        = GROUP_META[group];
            const defs        = VITALS.filter(v => v.group === group);
            const withValues  = defs.filter(v => vitals[v.key] != null);
            if (withValues.length === 0) return null;

            const isOpen = expanded[group];
            const critical = withValues.filter(v => {
              const s = getStatus(Number(vitals[v.key]), v);
              return s === 'critical-high' || s === 'critical-low';
            }).length;
            const abnormal = withValues.filter(v => {
              const s = getStatus(Number(vitals[v.key]), v);
              return s !== 'normal';
            }).length;

            return (
              <div key={group}>
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggle(group)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{meta.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{meta.label}</p>
                      <p className="text-xs text-gray-400">{withValues.length} of {defs.length} values recorded</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {critical > 0 && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full animate-pulse">
                        {critical} Critical
                      </span>
                    )}
                    {abnormal > 0 && critical === 0 && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {abnormal} Abnormal
                      </span>
                    )}
                    {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                  </div>
                </button>

                {/* Vitals grid */}
                {isOpen && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-5 pb-5">
                    {withValues.map(v => (
                      <VitalCard
                        key={v.key}
                        def={v}
                        value={Number(vitals[v.key])}
                        meta={vitals.field_meta?.[v.key]}
                        onClick={() => setHistoryField(v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <EditVitalsModal
          vitals={vitals}
          onClose={() => setShowEdit(false)}
          onSaved={() => {}}
        />
      )}

      {/* Per-vital history modal */}
      {historyField && (
        <VitalHistoryModal def={historyField} onClose={() => setHistoryField(null)} />
      )}
    </div>
  );
}
