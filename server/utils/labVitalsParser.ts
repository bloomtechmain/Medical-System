/**
 * Extracts blood test values from OCR or text-extracted lab report text.
 * Handles Sri Lankan / international lab report formats.
 *
 * Different labs (and different countries) label the exact same test in
 * many different ways — e.g. a fasting glucose result might be printed as
 * "Blood Glucose", "Plasma Glucose Fasting", "FBS", "Fasting Blood Sugar",
 * "Glucose, Fasting", or "F.B.S". Each vital below is matched against a
 * broad list of real-world aliases (see the comment above each block) so
 * that a report is recognized no matter which naming convention it uses.
 *
 * Examples handled:
 *   "Haemoglobin         14.5 g/dL     13.0 - 17.0"
 *   "WBC : 8.30 x10^3/uL"
 *   "Total RBC Count     5.01          4.50 - 6.00"
 *   "Platelet Count  250 x10^3/uL"
 *   "HbA1c  6.2 %"
 *   "Plasma Glucose Fasting   95   mg/dL   70 - 100"
 */

import { ocrImageMultiPass, asJpegOrPng } from './reportOcr';
import { isTextractEnabled, textractImage } from './textractOcr';

export interface ParsedVitals {
  wbc?: number; rbc?: number; hemoglobin?: number; hematocrit?: number;
  mcv?: number; mch?: number; mchc?: number; rdw?: number;
  platelets?: number; mpv?: number; blood_glucose?: number; hba1c?: number;
  creatinine?: number; cholesterol?: number; hdl?: number; ldl?: number;
  triglycerides?: number; bp_systolic?: number; bp_diastolic?: number;
  heart_rate?: number; temperature?: number; oxygen_saturation?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type VitalField = keyof ParsedVitals;

// Physiologically possible values, in the units the app stores (mg/dL,
// x10^3/uL, g/dL, %, °C…). A candidate outside this is either a misread or a
// different unit — convertUnit() gets a chance to fix the latter first.
const RANGES: Record<VitalField, [number, number]> = {
  wbc: [0.5, 100], rbc: [1, 10], hemoglobin: [3, 25], hematocrit: [5, 75],
  mcv: [50, 150], mch: [10, 60], mchc: [20, 50], rdw: [5, 30],
  platelets: [5, 2000], mpv: [2, 25], blood_glucose: [20, 800],
  hba1c: [3, 20], creatinine: [0.2, 20], cholesterol: [50, 600],
  hdl: [5, 150], ldl: [10, 500], triglycerides: [10, 2000],
  bp_systolic: [50, 250], bp_diastolic: [20, 180],
  heart_rate: [20, 250], temperature: [30, 45], oxygen_saturation: [50, 100],
};

const inRange = (field: VitalField, v: number): boolean => {
  const [lo, hi] = RANGES[field];
  return v >= lo && v <= hi;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

// Where nearly all real results fall (normal ± a wide pathological margin).
// Only used to choose between two readings that are both possible — never
// to reject a value.
const TYPICAL: Partial<Record<VitalField, [number, number]>> = {
  wbc: [1.5, 40], rbc: [2, 8], hemoglobin: [5, 20], hematocrit: [15, 65],
  mcv: [60, 120], mch: [18, 40], mchc: [26, 40], rdw: [9, 25],
  platelets: [20, 1000], mpv: [5, 15], blood_glucose: [40, 500],
  hba1c: [4, 15], creatinine: [0.3, 10], cholesterol: [80, 400],
  hdl: [15, 120], ldl: [30, 300], triglycerides: [30, 1000],
};
const isTypical = (field: VitalField, v: number): boolean => {
  const r = TYPICAL[field];
  return !r || (v >= r[0] && v <= r[1]);
};

/**
 * Convert a reading printed in another common unit into the stored unit.
 * `unitText` is the text right after the number (may be empty — many reports
 * put units in a column header). With no unit, the magnitude decides: a
 * fasting glucose of "5.4" can only be mmol/L, a creatinine of "88" can only
 * be µmol/L, a platelet count of "250000" is per µL, and so on.
 */
export function convertUnit(field: VitalField, v: number, unitText: string): number {
  const u = unitText.replace(/\s+/g, '').toLowerCase();
  const mmol = /^mmol\/?l/.test(u);
  const mmolMol = /^mmol\/?mol/.test(u);
  const umol = /^(?:µ|μ|u|micro)mol/.test(u);
  const mg = /^mg/.test(u);
  switch (field) {
    case 'blood_glucose':
      return mmol || (!mg && v >= 1.5 && v < 20) ? round2(v * 18.016) : v;
    case 'cholesterol':
      return mmol || (!mg && v < 15) ? round2(v * 38.67) : v;
    case 'ldl':
      return mmol || (!mg && v < 10) ? round2(v * 38.67) : v;
    case 'hdl':
      return mmol || (!mg && v < 5) ? round2(v * 38.67) : v;
    case 'triglycerides':
      return mmol || (!mg && v < 10) ? round2(v * 88.57) : v;
    case 'creatinine':
      return umol || (!mg && v > 20 && v < 2000) ? round2(v / 88.4) : v;
    case 'hemoglobin':
      return /^g\/?l/.test(u) || (!/^g\/?dl/.test(u) && v > 25 && v <= 250) ? round2(v / 10) : v;
    case 'wbc':
      // Per-µL counts are in the thousands. 100–999 is far more likely a
      // blurred "7.40" read as "740" — left for the decimal fix in
      // pickNumber rather than turned into 0.74 here.
      return v >= 1000 && v < 100000 ? round2(v / 1000) : v;
    case 'platelets':
      if (/^lakh/.test(u)) return round2(v * 100);
      return v > 2000 && v < 2000000 ? round2(v / 1000) : v;
    case 'rbc':
      return v > 100000 ? round2(v / 1e6) : v;
    case 'hematocrit':
      return v > 0 && v < 1 ? round2(v * 100) : v;
    case 'hba1c':
      // Only on an explicit unit: a bare "40" next to HbA1c is far more
      // often a blurred reference range ("4.0-6.0") than an IFCC result.
      return mmolMol ? round2(v / 10.929 + 2.15) : v;
    case 'temperature':
      return /^°?f(?![a-z])/.test(u) || (v >= 90 && v <= 110) ? round2((v - 32) * 5 / 9) : v;
    default:
      return v;
  }
}

// A number glued to a power-of-ten unit ("x10^3/uL", "10³/µL", "10*9/L") is
// part of the unit, not the result.
const isUnitExponent = (s: string, start: number, end: number): boolean => {
  const before = s.slice(Math.max(0, start - 2), start);
  const after = s.slice(end, end + 1);
  return /[x×X*^]\s?$/.test(before) || /^[\^*³⁹⁶]/.test(after) || /[eE]$/.test(before);
};

/** First plausible value in `rest` (the text following a test's label). */
function pickNumber(rest: string, field?: VitalField): number | undefined {
  const NUM = /(\d{1,7}(?:\.\d{1,3})?)/g;
  for (const m of rest.matchAll(NUM)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // A "ratio" between the label and the number means this is a different
    // test ("Cholesterol/HDL Ratio 4.2" is not a cholesterol of 4.2).
    if (/ratio|\/\s*hdl|\/\s*ldl/i.test(rest.slice(0, start))) return undefined;
    if (isUnitExponent(rest, start, end)) continue;
    // Reference ranges are never results: "13.0 - 17.0", "< 200", "> 40",
    // "up to 150". Reaching one means the result itself was not read —
    // returning its bound would put a fake "normal" value in the record.
    if (/^\s*[-–~]\s*\d/.test(rest.slice(end)) || /(?:[<>≤≥]|up\s*to)\s*=?\s*$/i.test(rest.slice(0, start))) return undefined;
    const raw = parseFloat(m[1]);
    // A zero result is a damaged one ("5000" blurred to "0000"); reading on
    // would take the reference range's lower bound as the result.
    if (isNaN(raw) || raw <= 0) { if (field) return undefined; continue; }
    if (!field) return raw;
    const unit = rest.slice(end, end + 14).trim();
    const v = convertUnit(field, raw, unit);
    if (inRange(field, v)) return v;
    // Blur's most common damage to a result is a lost decimal point:
    // "13.8" read as "138", "85.6" as "856". If the bare integer is
    // impossible for this test but putting the point back makes it
    // plausible, that is what was printed.
    if (!m[1].includes('.') && m[1].length >= 2) {
      const options = [10, 100].map(div => round2(convertUnit(field, raw / div, unit))).filter(x => inRange(field, x));
      // Prefer the reading that lands in the usual clinical range: a WBC
      // "740" is 7.40, not 74.0.
      const pick = options.find(x => isTypical(field, x)) ?? options[0];
      if (pick !== undefined) return pick;
    }
    // The first number was implausible. If a unit column follows it, the
    // real result may still come later on the line ("(x10^3) 8.3"); if it
    // is bare, it is most likely the start of a reference range for a
    // missing result, and reading on would return the range's upper bound.
    if (!/^[a-zµμ%/°]/i.test(unit)) return undefined;
  }
  return undefined;
}

function findValue(text: string, patterns: RegExp[], field?: VitalField): number | undefined {
  for (const p of patterns) {
    const flags = p.flags.includes('g') ? p.flags : p.flags + 'g';
    const re = new RegExp(p.source, flags);
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      const start = (m.index ?? 0) + m[0].length;
      const lineEnd = text.indexOf('\n', start);
      const rest = text.slice(start, lineEnd === -1 ? undefined : lineEnd).slice(0, 110);
      let val = pickNumber(rest, field);
      // Column layouts (tesseract's auto mode on a table) can put the value
      // on the next line on its own. Accept that only when the label's line
      // had no number at all and the next line starts with one.
      if (val === undefined && lineEnd !== -1 && !/\d/.test(rest)) {
        const nextEnd = text.indexOf('\n', lineEnd + 1);
        const next = text.slice(lineEnd + 1, nextEnd === -1 ? undefined : nextEnd);
        if (/^\s*[<>]?\s*\d/.test(next)) val = pickNumber(next.slice(0, 60), field);
      }
      if (val !== undefined) return val;
    }
  }
  return undefined;
}

/**
 * Undo the systematic character confusions OCR makes on printed reports so
 * the label/number regexes below see clean text. Only rewrites characters
 * whose context makes the intent unambiguous (a letter O wedged between
 * digits is a zero; a zero wedged between letters is an O).
 */
export function normalizeOcrText(raw: string): string {
  let t = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  t = t.replace(/[‒-―−]/g, '-').replace(/[·•]/g, '.').replace(/[‘’]/g, "'");
  // Letter-for-digit inside numbers: "1O.5" "l4.5" "1S.2" "O.9"
  t = t.replace(/(?<=\d)[Oo](?=[\d.,])/g, '0');
  t = t.replace(/(?<=\d[.,])[Oo]/g, '0');
  t = t.replace(/(?<=^|[\s:=(])[Oo](?=[.,]\d)/gm, '0');
  t = t.replace(/(?<=\d)[lI|](?=\d)/g, '1');
  t = t.replace(/(?<=^|[\s:=(])[lI|](?=\d)/gm, '1');
  t = t.replace(/(?<=\d)S(?=\d|\.\d)/g, '5');
  t = t.replace(/(?<=\d)B(?=\d|\.\d)/g, '8');
  // Digit-for-letter inside words: "Haem0globin" "Ch0lesterol"
  t = t.replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, 'o');
  // Decimal comma ("14,5") vs thousands separator ("250,000"), including
  // the lakh grouping Sri Lankan/Indian labs print counts in ("2,50,000").
  t = t.replace(/(?<![\d,])(\d{1,2}),(\d{2}),(\d{3})(?![\d,])/g, '$1$2$3');
  t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  t = t.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  // A space dropped into a decimal: "14 .5" / "14. 5"
  t = t.replace(/(?<![\d.])(\d{1,3}) ?\. (\d{1,2})(?![\d.])/g, '$1.$2');
  t = t.replace(/(?<![\d.])(\d{1,3}) \.(\d{1,2})(?![\d.])/g, '$1.$2');
  return t.replace(/[ ]{2,}/g, ' ');
}

// Words are joined with a permissive separator — zero or more of
// space/comma/hyphen/parentheses — so "Glucose Fasting", "Glucose, Fasting",
// "Glucose-Fasting" and "Glucose (Fasting)" all match the same pattern.
// (Each individual word may itself contain literal spaces, e.g. 'Blood Cell',
// which are normalized to \s+ before joining.)
const SEP = '[\\s,\\-()]*';

function label(...words: string[]): RegExp {
  const joined = words.map(w => w.replace(/\s+/g, '\\s+')).join(SEP);
  return new RegExp(`(?:^|\\b)${joined}(?:\\s*[:/.-]?\\s*)`, 'im');
}

// ── Fuzzy row matching (fallback for garbled labels) ──────────────────────────
//
// A blurred photo damages the test *names* as much as the numbers —
// "Haemoglobin" comes back as "Hesmogiabin", "HDL Cholesterol" as "HOL
// Cholesterol", "Triglycerides" as "Trglycendes" — and the exact patterns
// above then miss the row entirely. This pass reads the report row by row
// ("<name> <value> <unit> <range>"), compares the name with known spellings by
// edit distance, and only fills fields the exact pass did not find.

const FUZZY_ALIASES: Record<string, VitalField> = {
  'haemoglobin': 'hemoglobin', 'hemoglobin': 'hemoglobin', 'blood haemoglobin': 'hemoglobin',
  'total wbc count': 'wbc', 'wbc count': 'wbc', 'white blood cell count': 'wbc', 'white cell count': 'wbc',
  'total leucocyte count': 'wbc', 'total leukocyte count': 'wbc', 'leucocyte count': 'wbc',
  'rbc count': 'rbc', 'total rbc count': 'rbc', 'red blood cell count': 'rbc', 'red cell count': 'rbc', 'erythrocyte count': 'rbc',
  'packed cell volume': 'hematocrit', 'haematocrit': 'hematocrit', 'hematocrit': 'hematocrit',
  'mean corpuscular volume': 'mcv', 'mean cell volume': 'mcv',
  'mean corpuscular haemoglobin': 'mch', 'mean corpuscular hemoglobin': 'mch',
  'mean corpuscular haemoglobin concentration': 'mchc', 'mean corpuscular hemoglobin concentration': 'mchc',
  'red cell distribution width': 'rdw',
  'platelet count': 'platelets', 'platelets': 'platelets', 'total platelet count': 'platelets', 'thrombocyte count': 'platelets',
  'mean platelet volume': 'mpv',
  'fasting blood sugar': 'blood_glucose', 'fasting blood glucose': 'blood_glucose', 'fasting plasma glucose': 'blood_glucose',
  'random blood sugar': 'blood_glucose', 'random blood glucose': 'blood_glucose', 'random plasma glucose': 'blood_glucose',
  'plasma glucose fasting': 'blood_glucose', 'blood glucose': 'blood_glucose', 'blood sugar': 'blood_glucose',
  'post prandial blood sugar': 'blood_glucose',
  'glycated haemoglobin': 'hba1c', 'glycated hemoglobin': 'hba1c', 'glycosylated haemoglobin': 'hba1c', 'hba1c': 'hba1c',
  'serum creatinine': 'creatinine', 'creatinine': 'creatinine', 'plasma creatinine': 'creatinine',
  'total cholesterol': 'cholesterol', 'serum cholesterol': 'cholesterol', 'cholesterol total': 'cholesterol',
  'hdl cholesterol': 'hdl', 'hdl cholesterol direct': 'hdl',
  'ldl cholesterol': 'ldl', 'ldl cholesterol calculated': 'ldl', 'ldl cholesterol direct': 'ldl',
  'triglycerides': 'triglycerides', 'serum triglycerides': 'triglycerides', 'triglyceride': 'triglycerides',
};

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

/** Best-matching field for a garbled row label, or undefined if unsure. */
function fuzzyField(labelText: string): VitalField | undefined {
  const norm = labelText.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\b(level|result|test)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Short names (MCV/MCH/HDL…) are one letter apart from each other; edit
  // distance can't tell a misread from a different test, so they are left
  // to the exact patterns.
  if (norm.length < 7) return undefined;
  const bestByField = new Map<VitalField, number>();
  for (const [alias, field] of Object.entries(FUZZY_ALIASES)) {
    const sim = 1 - levenshtein(norm, alias) / Math.max(norm.length, alias.length);
    if (sim > (bestByField.get(field) ?? -1)) bestByField.set(field, sim);
  }
  const ranked = [...bestByField.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (!top) return undefined;
  const threshold = norm.length >= 10 ? 0.62 : 0.72;
  // Must be clearly closer to one test than to any other.
  if (top[1] < threshold || (second && top[1] - second[1] < 0.05)) return undefined;
  return top[0];
}

function fuzzyRowVitals(text: string): ParsedVitals {
  const out: ParsedVitals = {};
  for (const line of text.split('\n')) {
    // "<label> <value…>": the label is the leading run of non-digit text.
    const m = line.match(/^\s*([A-Za-z][A-Za-z .,'()/-]{4,60}?)\s*[:=]?\s+([<>]?\s*\d.*)$/);
    if (!m) continue;
    const field = fuzzyField(m[1]);
    if (!field || out[field] !== undefined) continue;
    const v = pickNumber(m[2], field);
    if (v !== undefined) out[field] = v;
  }
  return out;
}

// ── Main extraction ───────────────────────────────────────────────────────────
export function extractVitalsFromText(rawText: string): ParsedVitals {
  if (!rawText || rawText.trim().length < 5) return {};

  const text = normalizeOcrText(rawText);
  const v: ParsedVitals = {};

  // WBC — aka White Blood Cell(s)/Count, Total Leucocyte/Leukocyte Count (TLC/TWBC), Leukocytes
  v.wbc = findValue(text, [
    label('Total', 'WBC', 'Count'),
    label('WBC', 'Count'),
    label('WBC'),
    label('W\\.?B\\.?C'),
    label('White', 'Blood', 'Cell(?:s|\\s+Count)?'),
    label('White', 'Cell', 'Count'),
    label('Total', 'White', 'Cell', 'Count'),
    // Leucocyte / Leukocyte (with a k). Not the "Differential" or "Absolute"
    // leucocyte count headings: those carry no WBC value, and reading on
    // took the neutrophil % or the absolute neutrophil count instead.
    label('Total', 'Le[uck]{2}ocyte', 'Count'),
    label('(?<!(?:Differential|Absolute)\\s+)Le[uck]{2}ocyte(?:s|\\s+Count)?'),
    label('T\\.?L\\.?C'),
    label('T\\.?W\\.?B\\.?C'),
  ], 'wbc');

  // RBC — aka Red Blood Cell(s)/Count, Red Cell Count (RCC), Erythrocyte Count
  v.rbc = findValue(text, [
    label('Total', 'RBC', 'Count'),
    label('RBC', 'Count'),
    label('RBC'),
    label('R\\.?B\\.?C'),
    label('Red', 'Blood', 'Cell(?:s|\\s+Count)?'),
    label('Red', 'Cell', 'Count'),
    label('R\\.?C\\.?C'),
    label('Erythrocyte(?:s|\\s+Count)?'),
  ], 'rbc');

  // Haemoglobin / Hemoglobin — aka Hb, Hgb, HGB, Blood Hemoglobin
  v.hemoglobin = findValue(text, [
    label('H(?:a)?emoglobin\\s+Level'),
    label('Blood\\s+H(?:a)?emoglobin'),
    label('H(?:a)?emoglobin'),
    label('Hgb\\s+Level'),
    label('Hgb'),
    label('HGB'),
    label('(?<![A-Za-z])Hb(?!A)'),
  ], 'hemoglobin');

  // Hematocrit / PCV — aka Haematocrit, HCT, Packed (Red) Cell Volume, VPRC, Crit
  v.hematocrit = findValue(text, [
    label('P\\.?C\\.?V'),
    label('Packed\\s+(?:Red\\s+)?Cell\\s+Volume'),
    label('Volume\\s+of\\s+Packed\\s+Red\\s+Cells'),
    label('V\\.?P\\.?R\\.?C'),
    label('H(?:a)?ematocrit'),
    label('HCT'),
    label('Hct'),
    label('Crit'),
  ], 'hematocrit');

  // MCV — aka Mean Corpuscular/Cell Volume
  v.mcv = findValue(text, [
    label('MCV'),
    label('Mean\\s+Corpuscular\\s+Volume'),
    label('Mean\\s+Cell\\s+Volume'),
    label('Average\\s+Red\\s+Cell\\s+Volume'),
  ], 'mcv');

  // MCH (not MCHC) — aka Mean Corpuscular/Cell Hemoglobin
  v.mch = findValue(text, [
    label('MCH(?!C)'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin(?!\\s*[\\s,\\-()]*Conc)'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin(?!\\s*[\\s,\\-()]*Conc)'),
  ], 'mch');

  // MCHC — aka Mean Corpuscular/Cell Hemoglobin Concentration
  v.mchc = findValue(text, [
    label('MCHC'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
  ], 'mchc');

  // RDW — aka Red (Blood) Cell Distribution Width, RDW-CV/SD
  v.rdw = findValue(text, [
    // RDW-CV (%) only. RDW-SD is in fL, and OCR's "RDW-5D" read as RDW 5.
    label('RDW(?:[-\\s]?CV)?(?![-\\s]?[S5]D)'),
    label('Red\\s+(?:Cell|Blood\\s+Cell)\\s+Distribution\\s+Width'),
    label('Red\\s+Cell\\s+Size\\s+Distribution'),
  ], 'rdw');

  // Platelets — aka Platelet Count, PLT, Thrombocyte(s)/Count
  v.platelets = findValue(text, [
    label('Total\\s+Platelet\\s+Count'),
    label('Platelet\\s+Count'),
    label('PLT\\s+Count'),
    label('PLT'),
    label('Platelets?'),
    label('Platelet\\s+Estimate'),
    label('Thrombocyte(?:s|\\s+Count)?'),
  ], 'platelets');

  // MPV — aka Mean Platelet Volume
  v.mpv = findValue(text, [
    label('MPV'),
    label('Mean\\s+Platelet\\s+Volume'),
  ], 'mpv');

  // Blood Glucose — the widest-varying name in the panel. Real-world aliases
  // include (fasting): Blood Glucose, Blood Sugar, Plasma/Serum Glucose,
  // Fasting Blood Sugar/Glucose (FBS/FBG), Fasting Plasma Glucose (FPG),
  // "Glucose, Fasting" / "Plasma Glucose Fasting" (modifier can come before
  // OR after the noun — both orders are matched); (random): Random Blood
  // Sugar/Glucose (RBS/RBG), Random Plasma Glucose (RPG), GRBS; (post-meal):
  // Postprandial Blood Sugar (PPBS), Post-Prandial Glucose (PPG), 2-Hour PP;
  // (point-of-care): Capillary Blood Glucose (CBG). SEP already makes
  // "Sugar (F)" / "Sugar, F" / "Sugar-F" equivalent to "Sugar F".
  v.blood_glucose = findValue(text, [
    // Fasting — modifier before noun
    label('Fasting', 'Plasma', 'Glucose'),
    label('Fasting', 'Serum', 'Glucose'),
    label('Fasting', 'Blood', 'Sugar'),
    label('Fasting', 'Blood', 'Glucose'),
    label('Fasting', 'Glucose'),
    label('Fasting', 'Sugar'),
    // Fasting — modifier after noun (e.g. "Plasma Glucose Fasting")
    label('Plasma', 'Glucose', 'Fasting'),
    label('Serum', 'Glucose', 'Fasting'),
    label('Blood', 'Glucose', 'Fasting'),
    label('Blood', 'Sugar', 'Fasting'),
    label('Glucose', 'Fasting'),
    label('Sugar', 'Fasting'),
    label('Sugar', 'F'),
    label('Glucose', 'F'),
    label('F\\.?B\\.?S'),
    label('F\\.?B\\.?G'),
    label('F\\.?P\\.?G'),
    // Random — either order
    label('Random', 'Plasma', 'Glucose'),
    label('Random', 'Blood', 'Sugar'),
    label('Random', 'Blood', 'Glucose'),
    label('Random', 'Glucose'),
    label('Random', 'Sugar'),
    label('Plasma', 'Glucose', 'Random'),
    label('Blood', 'Glucose', 'Random'),
    label('Blood', 'Sugar', 'Random'),
    label('Glucose', 'Random'),
    label('Sugar', 'Random'),
    label('Sugar', 'R'),
    label('Glucose', 'R'),
    label('R\\.?B\\.?S'),
    label('R\\.?B\\.?G'),
    label('R\\.?P\\.?G'),
    label('G\\.?R\\.?B\\.?S'),
    // Postprandial / post-meal
    label('Post[\\s-]?Prandial', 'Blood', 'Sugar'),
    label('Post[\\s-]?Prandial', 'Blood', 'Glucose'),
    label('Post[\\s-]?Prandial', 'Glucose'),
    label('Blood', 'Sugar', 'Post[\\s-]?Prandial'),
    label('P\\.?P\\.?B\\.?S'),
    label('P\\.?P\\.?2\\.?B\\.?S'),
    label('P\\.?P\\.?G'),
    label('2\\.?H\\.?P\\.?P'),
    // Point-of-care / capillary
    label('Capillary', 'Blood', 'Glucose'),
    label('C\\.?B\\.?G'),
    // Generic — no fasting/random qualifier stated
    label('Plasma', 'Glucose'),
    label('Serum', 'Glucose'),
    label('Blood', 'Glucose\\s+(?:Level|Result)?'),
    label('Blood', 'Sugar\\s+(?:Level|Result)?'),
    label('Glucose\\s+(?:Level|Result)?'),
    label('Sugar\\s+(?:Level|Result)?'),
  ], 'blood_glucose');

  // HbA1c — aka Glycated/Glycosylated Hemoglobin, Glycohemoglobin, A1C
  v.hba1c = findValue(text, [
    label('H(?:a)?emoglobin\\s+A1C?'),
    label('HbA1[Cc]'),
    label('HBA1C'),
    label('Glyc(?:ated|osylated)\\s+H(?:a)?emoglobin'),
    label('Glycoh(?:a)?emoglobin'),
    label('A1C'),
  ], 'hba1c');

  // Creatinine — aka Serum/Plasma Creatinine, Cr, Creat
  v.creatinine = findValue(text, [
    label('Serum\\s+Creatinine'),
    label('Plasma\\s+Creatinine'),
    label('S\\.?\\s*Creatinine'),
    label('Creatinine'),
    label('CREAT'),
    label('(?<![A-Za-z])Cr(?![A-Za-z])'),
  ], 'creatinine');

  // Total Cholesterol — aka Cholesterol Total, Serum Cholesterol, TC
  v.cholesterol = findValue(text, [
    label('Total\\s+Cholesterol'),
    label('Cholesterol\\s*[,/]?\\s*Total'),
    label('T\\.?\\s*Cholesterol'),
    label('Cholesterol\\s+Level'),
    label('Serum\\s+Cholesterol'),
    // Bare "Cholesterol" only when it isn't the tail of "HDL Cholesterol",
    // "LDL Cholesterol", "VLDL Cholesterol" or "Non-HDL Cholesterol", nor the
    // head of "Cholesterol/HDL Ratio".
    label('(?<!(?:[HL][DOQ0]L|H\\.D\\.L|L\\.D\\.L|Good|Bad)[\\s-]*)Cholesterol(?!\\s*[,/-]?\\s*(?:HDL|LDL|Ratio))'),
  ], 'cholesterol');

  // HDL — aka HDL-C, High Density Lipoprotein, "Good" Cholesterol
  v.hdl = findValue(text, [
    label('(?<!Non[\\s-]?)HDL(?:[\\s-]?Cholesterol)?(?:[\\s-]?C)?'),
    label('(?<!Non[\\s-]?)H\\.?D\\.?L'),
    label('High\\s+Density\\s+Lipoprotein'),
    label('Good\\s+Cholesterol'),
  ], 'hdl');

  // LDL — aka LDL-C, Low Density Lipoprotein, "Bad" Cholesterol, LDL Calculated/Direct
  v.ldl = findValue(text, [
    label('LDL\\s+Calculated'),
    label('Calculated\\s+LDL'),
    label('LDL\\s+Direct'),
    label('LDL(?:[\\s-]?Cholesterol)?(?:[\\s-]?C)?'),
    label('L\\.?D\\.?L'),
    label('Low\\s+Density\\s+Lipoprotein'),
    label('Bad\\s+Cholesterol'),
  ], 'ldl');

  // Triglycerides — aka TG, TRIG, Trigs
  v.triglycerides = findValue(text, [
    label('Serum\\s+Triglyceride(?:s)?'),
    label('Triglyceride(?:s|\\s+Level)?'),
    label('Trigs'),
    label('TRIG'),
    label('TG(?:\\s+Level)?'),
  ], 'triglycerides');

  // Blood Pressure — "120/80" format, aka B.P., Sys/Dia, SBP/DBP
  const bpM = text.match(/(?:B\.?P\.?|Blood\s+Pressure)\s*[:\-–]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bpM) {
    v.bp_systolic  = parseInt(bpM[1]);
    v.bp_diastolic = parseInt(bpM[2]);
  } else {
    v.bp_systolic = findValue(text, [label('Systolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('SBP')], 'bp_systolic');
    v.bp_diastolic = findValue(text, [label('Diastolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('DBP')], 'bp_diastolic');
  }

  // Heart Rate — aka Pulse (Rate), Cardiac Rate, HR
  v.heart_rate = findValue(text, [
    label('Heart\\s+Rate'), label('Pulse\\s+Rate'), label('Cardiac\\s+Rate'),
    label('H\\.?R'), label('P\\.?R'), label('Radial\\s+Pulse'), label('Pulse'),
  ], 'heart_rate');

  // Temperature — aka Body/Oral/Axillary/Core/Tympanic Temp(erature)
  v.temperature = findValue(text, [
    label('(?:Body|Oral|Axillary|Core|Rectal|Tympanic)\\s+Temp(?:erature)?'),
    label('Temp(?:erature)?'), label('Temp\\.'),
  ], 'temperature');

  // SpO2 — aka O2 Sat(uration), Oxygen Saturation, SaO2, Pulse Ox(imetry)
  v.oxygen_saturation = findValue(text, [
    label('Peripheral\\s+Capillary\\s+Oxygen\\s+Saturation'),
    label('Sp[O0]2'), label('SaO2'),
    label('O2\\s+Sat(?:uration)?'), label('Oxygen\\s+Sat(?:uration)?'),
    label('Pulse\\s+Ox(?:imetry)?'),
  ], 'oxygen_saturation');

  // Rows whose names were too garbled for the exact patterns.
  const fuzzy = fuzzyRowVitals(text);
  for (const k of Object.keys(fuzzy) as VitalField[]) {
    if (v[k] === undefined) v[k] = fuzzy[k];
  }

  // ── Sanity filter: remove physiologically impossible values ───────────────
  for (const key of Object.keys(v) as VitalField[]) {
    const val = v[key];
    if (val === undefined || !inRange(key, val)) delete v[key];
  }

  return v;
}

/** Accepts either a file path or an already-in-memory buffer (ARCH-06: uploads
 *  may come straight from a multer memory buffer, not a local-disk path). */
async function resolveBuffer(input: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  const fs = await import('fs');
  return fs.readFileSync(input);
}

/** Extract text from a PDF using pdfjs-dist (handles text-based PDFs). */
export async function extractTextFromPDF(input: string | Buffer): Promise<string> {
  try {
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    const buf = await resolveBuffer(input);

    const doc = await pdf.getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page    = await doc.getPage(p);
      const content = await page.getTextContent();
      const txt = content.items.map((i: any) => i.str ?? '').join(' ');
      if (txt.trim()) pages.push(txt);
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.gif'];

// A scanned PDF (e.g. a phone/scanner-app export) has no text layer at all —
// pdfjs correctly returns empty text for it, that isn't a parsing failure.
// Cap OCR'd pages so a long multi-page scan can't stall the queue.
const MAX_OCR_PDF_PAGES = 5;

/**
 * Rasterizes one PDF page to a PNG buffer, for OCR fallback. Uses the
 * @napi-rs/canvas copy bundled *inside* pdfjs-dist's own node_modules,
 * not the top-level one: pdfjs's internal image compositing creates
 * objects from its own nested copy, and drawing them onto a canvas from a
 * different @napi-rs/canvas version (even the "same" package at a
 * different resolved version) crashes the native addon (segfault) — the
 * two builds aren't binary-compatible across versions.
 *
 * Scale 3 ≈ 216 dpi for an A4 page: scanned PDFs are often low-resolution
 * already, and rendering them small throws away what detail is left.
 */
async function renderPdfPageToPNG(doc: any, pageNum: number, scale = 3.0): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('pdfjs-dist/node_modules/@napi-rs/canvas');
    const page     = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas   = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx      = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    return canvas.toBuffer('image/png');
  } catch {
    return null;
  }
}

const countFields = (v: ParsedVitals): number => Object.values(v).filter(x => x !== undefined).length;

/**
 * Combine the vitals read by several OCR passes over the same page. Each
 * field takes the value most passes agree on, weighted by each pass's
 * confidence, so a single pass misreading a blurred "14.5" as "14.6" or
 * "1.45" is out-voted. A value found by only one pass is still kept — the
 * other passes simply failed to read that row — but loses any tie.
 */
export function voteVitals(
  results: { vitals: ParsedVitals; confidence: number }[],
  opts: { corroborate?: boolean } = {},
): ParsedVitals {
  const out: ParsedVitals = {};
  const fields = new Set<VitalField>();
  for (const r of results) for (const k of Object.keys(r.vitals) as VitalField[]) if (r.vitals[k] !== undefined) fields.add(k);
  for (const f of fields) {
    const tally = new Map<number, { score: number; passes: number; topConf: number }>();
    for (const r of results) {
      const v = r.vitals[f];
      if (v === undefined) continue;
      const key = round2(v);
      const t = tally.get(key) ?? { score: 0, passes: 0, topConf: 0 };
      // Every reading counts for at least something even at very low
      // confidence, and agreement between passes is what matters most.
      t.score += 1 + Math.max(0, r.confidence) / 100;
      t.passes += 1;
      t.topConf = Math.max(t.topConf, r.confidence);
      tally.set(key, t);
    }
    let best: number | undefined; let bestT: { score: number; passes: number; topConf: number } | undefined;
    for (const [val, t] of tally) if (!bestT || t.score > bestT.score) { best = val; bestT = t; }
    if (best === undefined || !bestT) continue;
    // Medical values: a wrong number is worse than a missing one. On a
    // blurred photo a single low-confidence pass "reads" values that are not
    // on the page (Hb 8 for 15, creatinine 12 on a blood count). Keep a value
    // only when two passes agree on it, or one pass read it with high
    // confidence (a clean page, where the others simply missed the row).
    if (opts.corroborate && bestT.passes < 2 && bestT.topConf < SINGLE_PASS_MIN_CONFIDENCE) continue;
    out[f] = best;
  }
  return out;
}

/** A value only one OCR pass read is kept only above this confidence. */
const SINGLE_PASS_MIN_CONFIDENCE = 75;

export interface ReportExtraction {
  vitals: ParsedVitals;
  /** Text of the best pass — kept for logging/debugging, never shown raw. */
  text: string;
  method: 'pdf_text' | 'ocr' | 'none';
  /** Best OCR pass confidence (0–100); 100 for a PDF text layer. */
  confidence: number;
}

/**
 * Read one image (or rendered page). Amazon Textract when enabled
 * (OCR_ENGINE=textract): far better on blurred, small and tilted photos.
 * Otherwise — or when the Textract call fails — tesseract with every pass,
 * then a vote.
 */
async function readImage(buf: Buffer): Promise<{ vitals: ParsedVitals; text: string; confidence: number }> {
  if (isTextractEnabled()) {
    const img = await asJpegOrPng(buf);
    const tx = img ? await textractImage(img) : null;
    // Textract read the page: trust its answer even when it found no values.
    // On a page that bad, tesseract only "finds" wrong ones (measured on
    // blurred samples: Textract 0 wrong, tesseract 6). Tesseract is used
    // only when Textract itself failed.
    if (tx) return { vitals: extractVitalsFromText(tx.text), text: tx.text, confidence: tx.confidence };
  }
  const passes = await ocrImageMultiPass(buf);
  if (!passes.length) return { vitals: {}, text: '', confidence: 0 };
  const parsed = passes.map(p => ({ vitals: extractVitalsFromText(p.text), confidence: p.confidence, text: p.text, fallback: !!p.fallback }));
  const regular = parsed.filter(p => !p.fallback);
  // Best single pass = most fields read, then highest confidence — its text
  // is what gets reported back.
  const best = [...regular].sort((a, b) => countFields(b.vitals) - countFields(a.vitals) || b.confidence - a.confidence)[0] ?? parsed[0];
  const vitals = voteVitals(regular, { corroborate: true });
  // Fallback passes may only add fields the regular passes didn't read.
  const extra = voteVitals(parsed.filter(p => p.fallback), { corroborate: true });
  for (const k of Object.keys(extra) as VitalField[]) if (vitals[k] === undefined) vitals[k] = extra[k];
  return { vitals, text: best.text, confidence: Math.max(...regular.map(p => p.confidence), 0) };
}

/**
 * Read the vitals out of an uploaded report: the PDF text layer when there
 * is one, otherwise the multi-pass, pre-processed OCR in reportOcr.ts (for
 * photos and for scanned PDFs page by page).
 *
 * `input` can be a local file path or an in-memory buffer (ARCH-06 — uploads
 * may come straight from a multer memory buffer, never touching disk). When
 * passing a buffer, `extHint` (e.g. ".pdf") must be supplied since there's no
 * path to infer it from.
 */
export async function extractVitalsFromReport(input: string | Buffer, extHint?: string): Promise<ReportExtraction> {
  const ext = (extHint ?? (typeof input === 'string' ? (await import('path')).extname(input) : '')).toLowerCase();
  const empty: ReportExtraction = { vitals: {}, text: '', method: 'none', confidence: 0 };

  if (ext === '.pdf') {
    const text = await extractTextFromPDF(input);
    if (text.trim().length >= 20) {
      const vitals = extractVitalsFromText(text);
      if (countFields(vitals) > 0) return { vitals, text, method: 'pdf_text', confidence: 100 };
      // A text layer with no recognisable values can still be a scan with a
      // useless OCR layer baked in by a scanner app — fall through to OCR.
    }
    try {
      const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
      const doc = await pdf.getDocument({ data: new Uint8Array(await resolveBuffer(input)), useWorkerFetch: false, isEvalSupported: false }).promise;
      const merged: ParsedVitals = {};
      const texts: string[] = [];
      let confidence = 0;
      for (let p = 1; p <= Math.min(doc.numPages, MAX_OCR_PDF_PAGES); p++) {
        const png = await renderPdfPageToPNG(doc, p);
        if (!png) continue;
        const page = await readImage(png);
        texts.push(page.text);
        confidence = Math.max(confidence, page.confidence);
        // First page that reports a field wins; later pages usually repeat
        // the header block, not the results.
        for (const [k, v] of Object.entries(page.vitals) as [VitalField, number][]) if (merged[k] === undefined) merged[k] = v;
      }
      return { vitals: merged, text: texts.join('\n'), method: 'ocr', confidence };
    } catch {
      return { ...empty, text };
    }
  }

  if (!IMAGE_EXTS.includes(ext)) return empty;
  const page = await readImage(await resolveBuffer(input));
  return { vitals: page.vitals, text: page.text, method: 'ocr', confidence: page.confidence };
}

/**
 * Text-only variant kept for callers that only need the words (and for
 * backwards compatibility). Prefer extractVitalsFromReport for vitals — it
 * votes across OCR passes instead of trusting one.
 */
export async function extractReportText(input: string | Buffer, extHint?: string): Promise<string> {
  return (await extractVitalsFromReport(input, extHint)).text;
}
