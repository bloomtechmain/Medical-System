/**
 * Extracts blood test values from OCR or text-extracted lab report text.
 * Handles Sri Lankan / international lab report formats.
 *
 * Examples handled:
 *   "Haemoglobin         14.5 g/dL     13.0 - 17.0"
 *   "WBC : 8.30 x10^3/uL"
 *   "Total RBC Count     5.01          4.50 - 6.00"
 *   "Platelet Count  250 x10^3/uL"
 *   "HbA1c  6.2 %"
 */

interface ParsedVitals {
  wbc?: number; rbc?: number; hemoglobin?: number; hematocrit?: number;
  mcv?: number; mch?: number; mchc?: number; rdw?: number;
  platelets?: number; mpv?: number; blood_glucose?: number; hba1c?: number;
  creatinine?: number; cholesterol?: number; hdl?: number; ldl?: number;
  triglycerides?: number; bp_systolic?: number; bp_diastolic?: number;
  heart_rate?: number; temperature?: number; oxygen_saturation?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findValue(text: string, patterns: RegExp[]): number | undefined {
  const NUM_RE = /(\d{1,4}(?:\.\d{1,3})?)/;
  for (const p of patterns) {
    const full = new RegExp(
      p.source + '[^\\n]{0,80}?' + NUM_RE.source, 'i'
    );
    const m = text.match(full);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return undefined;
}

function label(...words: string[]): RegExp {
  const joined = words.map(w => w.replace(/\s+/g, '\\s+')).join('\\s+');
  return new RegExp(`(?:^|\\b)${joined}(?:\\s*[:/.-]?\\s*)`, 'im');
}

// ── Main extraction ───────────────────────────────────────────────────────────
export function extractVitalsFromText(rawText: string): ParsedVitals {
  if (!rawText || rawText.trim().length < 5) return {};

  const text = rawText.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ');
  const v: ParsedVitals = {};

  // WBC
  v.wbc = findValue(text, [
    label('Total', 'WBC', 'Count'),
    label('WBC'),
    label('W\\.?B\\.?C'),
    label('White', 'Blood', 'Cell(?:s|\\s+Count)?'),
    label('Total', 'White', 'Cell', 'Count'),
    label('Leukocyte(?:s|\\s+Count)?'),
  ]);

  // RBC
  v.rbc = findValue(text, [
    label('Total', 'RBC', 'Count'),
    label('RBC'),
    label('R\\.?B\\.?C'),
    label('Red', 'Blood', 'Cell(?:s|\\s+Count)?'),
    label('Red', 'Cell', 'Count'),
    label('Erythrocyte(?:s|\\s+Count)?'),
  ]);

  // Haemoglobin / Hemoglobin
  v.hemoglobin = findValue(text, [
    label('H(?:a)?emoglobin\\s+Level'),
    label('H(?:a)?emoglobin'),
    label('Hgb'),
    label('HGB'),
    label('(?<![A-Za-z])Hb(?!A)'),
  ]);

  // Hematocrit / PCV
  v.hematocrit = findValue(text, [
    label('P\\.?C\\.?V'),
    label('Packed\\s+Cell\\s+Volume'),
    label('H(?:a)?ematocrit'),
    label('HCT'),
    label('Hct'),
  ]);

  // MCV
  v.mcv = findValue(text, [
    label('MCV'),
    label('Mean\\s+Corpuscular\\s+Volume'),
    label('Mean\\s+Cell\\s+Volume'),
  ]);

  // MCH (not MCHC)
  v.mch = findValue(text, [
    label('MCH(?!C)'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin(?!\\s+Conc)'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin(?!\\s+Conc)'),
  ]);

  // MCHC
  v.mchc = findValue(text, [
    label('MCHC'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
  ]);

  // RDW
  v.rdw = findValue(text, [
    label('RDW(?:-CV|-SD)?'),
    label('Red\\s+(?:Cell|Blood\\s+Cell)\\s+Distribution\\s+Width'),
    label('Red\\s+Cell\\s+Size\\s+Distribution'),
  ]);

  // Platelets
  v.platelets = findValue(text, [
    label('Platelet\\s+Count'),
    label('Total\\s+Platelet\\s+Count'),
    label('PLT'),
    label('Platelets?'),
    label('Thrombocyte(?:s|\\s+Count)?'),
  ]);

  // MPV
  v.mpv = findValue(text, [
    label('MPV'),
    label('Mean\\s+Platelet\\s+Volume'),
  ]);

  // Blood Glucose
  v.blood_glucose = findValue(text, [
    label('Fasting\\s+(?:Blood\\s+)?(?:Sugar|Glucose)'),
    label('F\\.?B\\.?S'),
    label('F\\.?B\\.?G'),
    label('Blood\\s+Glucose\\s+(?:Fasting|Level|Result)?'),
    label('Random\\s+Blood\\s+(?:Sugar|Glucose)'),
    label('Glucose\\s+(?:Level|Result)?'),
  ]);

  // HbA1c
  v.hba1c = findValue(text, [
    label('H(?:a)?emoglobin\\s+A1C?'),
    label('HbA1[Cc]'),
    label('HBA1C'),
    label('Glycated\\s+H(?:a)?emoglobin'),
    label('Glyco(?:s|a)ylated\\s+H(?:a)?emoglobin'),
    label('A1C'),
  ]);

  // Creatinine
  v.creatinine = findValue(text, [
    label('Serum\\s+Creatinine'),
    label('S\\.?\\s*Creatinine'),
    label('Creatinine'),
    label('CREAT'),
  ]);

  // Cholesterol
  v.cholesterol = findValue(text, [
    label('Total\\s+Cholesterol'),
    label('T\\.?\\s*Cholesterol'),
    label('Cholesterol\\s*[,/]?\\s*Total'),
    label('Cholesterol\\s+Level'),
    label('Serum\\s+Cholesterol'),
  ]);

  // HDL
  v.hdl = findValue(text, [
    label('HDL(?:[\\s-]?Cholesterol)?'),
    label('H\\.?D\\.?L'),
    label('High\\s+Density\\s+Lipoprotein'),
    label('Good\\s+Cholesterol'),
  ]);

  // LDL
  v.ldl = findValue(text, [
    label('LDL(?:[\\s-]?Cholesterol)?'),
    label('L\\.?D\\.?L'),
    label('Low\\s+Density\\s+Lipoprotein'),
    label('Bad\\s+Cholesterol'),
    label('LDL\\s+Calculated'),
  ]);

  // Triglycerides
  v.triglycerides = findValue(text, [
    label('Triglyceride(?:s|\\s+Level)?'),
    label('TRIG'),
    label('TG(?:\\s+Level)?'),
  ]);

  // Blood Pressure — "120/80" format
  const bpM = text.match(/(?:B\.?P\.?|Blood\s+Pressure)\s*[:\-–]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bpM) {
    v.bp_systolic  = parseInt(bpM[1]);
    v.bp_diastolic = parseInt(bpM[2]);
  } else {
    v.bp_systolic  = findValue(text, [label('Systolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('SBP')]);
    v.bp_diastolic = findValue(text, [label('Diastolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('DBP')]);
  }

  // Heart Rate
  v.heart_rate = findValue(text, [
    label('Heart\\s+Rate'), label('Pulse\\s+Rate'), label('H\\.?R'), label('P\\.?R'), label('Pulse'),
  ]);

  // Temperature
  v.temperature = findValue(text, [
    label('Body\\s+Temp(?:erature)?'), label('Temp(?:erature)?'), label('Temp\\.'),
  ]);

  // SpO2
  v.oxygen_saturation = findValue(text, [
    label('SpO2'), label('Spo2'), label('O2\\s+Sat(?:uration)?'), label('Oxygen\\s+Sat(?:uration)?'),
  ]);

  // ── Sanity filter: remove physiologically impossible values ───────────────
  const RANGES: Partial<Record<keyof ParsedVitals, [number, number]>> = {
    wbc: [0.5, 100], rbc: [1, 10], hemoglobin: [3, 25], hematocrit: [5, 75],
    mcv: [50, 150], mch: [10, 60], mchc: [20, 50], rdw: [5, 30],
    platelets: [5, 2000], mpv: [2, 25], blood_glucose: [20, 800],
    hba1c: [3, 20], creatinine: [0.2, 20], cholesterol: [50, 600],
    hdl: [5, 150], ldl: [10, 500], triglycerides: [10, 2000],
    bp_systolic: [50, 250], bp_diastolic: [20, 180],
    heart_rate: [20, 250], temperature: [30, 45], oxygen_saturation: [50, 100],
  };

  for (const [key, [lo, hi]] of Object.entries(RANGES) as [keyof ParsedVitals, [number, number]][]) {
    const val = v[key];
    if (val !== undefined && (val < lo || val > hi)) delete v[key];
  }

  return v;
}

/** Extract text from a PDF using pdfjs-dist (handles text-based PDFs). */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const fs  = await import('fs');
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    const buf = fs.readFileSync(filePath);

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
