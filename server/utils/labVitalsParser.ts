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

// ── Main extraction ───────────────────────────────────────────────────────────
export function extractVitalsFromText(rawText: string): ParsedVitals {
  if (!rawText || rawText.trim().length < 5) return {};

  const text = rawText.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ');
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
    label('Total', 'Le[uc][uc]ocyte', 'Count'),
    label('Le[uc][uc]ocyte(?:s|\\s+Count)?'),
    label('T\\.?L\\.?C'),
    label('T\\.?W\\.?B\\.?C'),
  ]);

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
  ]);

  // Haemoglobin / Hemoglobin — aka Hb, Hgb, HGB, Blood Hemoglobin
  v.hemoglobin = findValue(text, [
    label('H(?:a)?emoglobin\\s+Level'),
    label('Blood\\s+H(?:a)?emoglobin'),
    label('H(?:a)?emoglobin'),
    label('Hgb\\s+Level'),
    label('Hgb'),
    label('HGB'),
    label('(?<![A-Za-z])Hb(?!A)'),
  ]);

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
  ]);

  // MCV — aka Mean Corpuscular/Cell Volume
  v.mcv = findValue(text, [
    label('MCV'),
    label('Mean\\s+Corpuscular\\s+Volume'),
    label('Mean\\s+Cell\\s+Volume'),
    label('Average\\s+Red\\s+Cell\\s+Volume'),
  ]);

  // MCH (not MCHC) — aka Mean Corpuscular/Cell Hemoglobin
  v.mch = findValue(text, [
    label('MCH(?!C)'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin(?!\\s*[\\s,\\-()]*Conc)'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin(?!\\s*[\\s,\\-()]*Conc)'),
  ]);

  // MCHC — aka Mean Corpuscular/Cell Hemoglobin Concentration
  v.mchc = findValue(text, [
    label('MCHC'),
    label('Mean\\s+Corpuscular\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
    label('Mean\\s+Cell\\s+H(?:a)?emoglobin\\s+Conc(?:entration)?'),
  ]);

  // RDW — aka Red (Blood) Cell Distribution Width, RDW-CV/SD
  v.rdw = findValue(text, [
    label('RDW(?:-CV|-SD)?'),
    label('Red\\s+(?:Cell|Blood\\s+Cell)\\s+Distribution\\s+Width'),
    label('Red\\s+Cell\\s+Size\\s+Distribution'),
  ]);

  // Platelets — aka Platelet Count, PLT, Thrombocyte(s)/Count
  v.platelets = findValue(text, [
    label('Total\\s+Platelet\\s+Count'),
    label('Platelet\\s+Count'),
    label('PLT\\s+Count'),
    label('PLT'),
    label('Platelets?'),
    label('Platelet\\s+Estimate'),
    label('Thrombocyte(?:s|\\s+Count)?'),
  ]);

  // MPV — aka Mean Platelet Volume
  v.mpv = findValue(text, [
    label('MPV'),
    label('Mean\\s+Platelet\\s+Volume'),
  ]);

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
  ]);

  // HbA1c — aka Glycated/Glycosylated Hemoglobin, Glycohemoglobin, A1C
  v.hba1c = findValue(text, [
    label('H(?:a)?emoglobin\\s+A1C?'),
    label('HbA1[Cc]'),
    label('HBA1C'),
    label('Glyc(?:ated|osylated)\\s+H(?:a)?emoglobin'),
    label('Glycoh(?:a)?emoglobin'),
    label('A1C'),
  ]);

  // Creatinine — aka Serum/Plasma Creatinine, Cr, Creat
  v.creatinine = findValue(text, [
    label('Serum\\s+Creatinine'),
    label('Plasma\\s+Creatinine'),
    label('S\\.?\\s*Creatinine'),
    label('Creatinine'),
    label('CREAT'),
    label('(?<![A-Za-z])Cr(?![A-Za-z])'),
  ]);

  // Total Cholesterol — aka Cholesterol Total, Serum Cholesterol, TC
  v.cholesterol = findValue(text, [
    label('Total\\s+Cholesterol'),
    label('Cholesterol\\s*[,/]?\\s*Total'),
    label('T\\.?\\s*Cholesterol'),
    label('Cholesterol\\s+Level'),
    label('Serum\\s+Cholesterol'),
    label('Cholesterol'),
  ]);

  // HDL — aka HDL-C, High Density Lipoprotein, "Good" Cholesterol
  v.hdl = findValue(text, [
    label('HDL(?:[\\s-]?Cholesterol)?(?:[\\s-]?C)?'),
    label('H\\.?D\\.?L'),
    label('High\\s+Density\\s+Lipoprotein'),
    label('Good\\s+Cholesterol'),
  ]);

  // LDL — aka LDL-C, Low Density Lipoprotein, "Bad" Cholesterol, LDL Calculated/Direct
  v.ldl = findValue(text, [
    label('LDL\\s+Calculated'),
    label('Calculated\\s+LDL'),
    label('LDL\\s+Direct'),
    label('LDL(?:[\\s-]?Cholesterol)?(?:[\\s-]?C)?'),
    label('L\\.?D\\.?L'),
    label('Low\\s+Density\\s+Lipoprotein'),
    label('Bad\\s+Cholesterol'),
  ]);

  // Triglycerides — aka TG, TRIG, Trigs
  v.triglycerides = findValue(text, [
    label('Serum\\s+Triglyceride(?:s)?'),
    label('Triglyceride(?:s|\\s+Level)?'),
    label('Trigs'),
    label('TRIG'),
    label('TG(?:\\s+Level)?'),
  ]);

  // Blood Pressure — "120/80" format, aka B.P., Sys/Dia, SBP/DBP
  const bpM = text.match(/(?:B\.?P\.?|Blood\s+Pressure)\s*[:\-–]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bpM) {
    v.bp_systolic  = parseInt(bpM[1]);
    v.bp_diastolic = parseInt(bpM[2]);
  } else {
    v.bp_systolic  = findValue(text, [label('Systolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('SBP')]);
    v.bp_diastolic = findValue(text, [label('Diastolic(?:\\s+(?:BP|Blood\\s+Pressure))?'), label('DBP')]);
  }

  // Heart Rate — aka Pulse (Rate), Cardiac Rate, HR
  v.heart_rate = findValue(text, [
    label('Heart\\s+Rate'), label('Pulse\\s+Rate'), label('Cardiac\\s+Rate'),
    label('H\\.?R'), label('P\\.?R'), label('Radial\\s+Pulse'), label('Pulse'),
  ]);

  // Temperature — aka Body/Oral/Axillary/Core/Tympanic Temp(erature)
  v.temperature = findValue(text, [
    label('(?:Body|Oral|Axillary|Core|Rectal|Tympanic)\\s+Temp(?:erature)?'),
    label('Temp(?:erature)?'), label('Temp\\.'),
  ]);

  // SpO2 — aka O2 Sat(uration), Oxygen Saturation, SaO2, Pulse Ox(imetry)
  v.oxygen_saturation = findValue(text, [
    label('Peripheral\\s+Capillary\\s+Oxygen\\s+Saturation'),
    label('Sp[O0]2'), label('SaO2'),
    label('O2\\s+Sat(?:uration)?'), label('Oxygen\\s+Sat(?:uration)?'),
    label('Pulse\\s+Ox(?:imetry)?'),
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

/** Runs tesseract OCR on an image file path or an in-memory image buffer. */
async function ocrRecognize(input: string | Buffer): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    const { data: { text } } = await worker.recognize(input as any);
    await worker.terminate();
    return text || '';
  } catch { return ''; }
}

/** Run OCR on an image file; returns '' for non-image extensions. */
async function runOCROnImage(filePath: string): Promise<string> {
  const path = await import('path');
  const ext  = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'].includes(ext)) return '';
  return ocrRecognize(filePath);
}

// A scanned PDF (e.g. a phone/scanner-app export) has no text layer at all —
// pdfjs correctly returns empty text for it, that isn't a parsing failure.
// Cap OCR'd pages so a long multi-page scan can't stall a single upload request.
const MAX_OCR_PDF_PAGES = 5;

/**
 * Rasterizes one PDF page to a PNG buffer, for OCR fallback. Uses the
 * @napi-rs/canvas copy bundled *inside* pdfjs-dist's own node_modules,
 * not the top-level one: pdfjs's internal image compositing creates
 * objects from its own nested copy, and drawing them onto a canvas from a
 * different @napi-rs/canvas version (even the "same" package at a
 * different resolved version) crashes the native addon (segfault) — the
 * two builds aren't binary-compatible across versions.
 */
async function renderPdfPageToPNG(doc: any, pageNum: number, scale = 2.0): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('pdfjs-dist/node_modules/@napi-rs/canvas');
    const page     = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas   = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx      = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    return canvas.toBuffer('image/png');
  } catch {
    return null;
  }
}

/** Fallback for scanned (image-only) PDFs: rasterize each page and OCR it. */
async function extractTextFromScannedPDF(filePath: string): Promise<string> {
  try {
    const fs  = await import('fs');
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    const buf = fs.readFileSync(filePath);

    const doc = await pdf.getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    const pageCount = Math.min(doc.numPages, MAX_OCR_PDF_PAGES);
    const pages: string[] = [];
    for (let p = 1; p <= pageCount; p++) {
      const png = await renderPdfPageToPNG(doc, p);
      if (!png) continue;
      const text = await ocrRecognize(png);
      if (text.trim()) pages.push(text);
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

/**
 * Extract text from any report file: pdfjs for text-based PDFs, falling back
 * to rendering + OCR for scanned/image-only PDFs, and direct OCR for images.
 */
export async function extractReportText(filePath: string): Promise<string> {
  const path = await import('path');
  const ext  = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const text = await extractTextFromPDF(filePath);
    if (text.trim().length >= 20) return text;
    return extractTextFromScannedPDF(filePath);
  }
  return runOCROnImage(filePath);
}
