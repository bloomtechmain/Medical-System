import { extractVitalsFromText, normalizeOcrText, convertUnit, voteVitals } from '../labVitalsParser';

describe('normalizeOcrText', () => {
  it('fixes letter/digit confusions inside numbers and words', () => {
    expect(normalizeOcrText('Haemoglobin 1O.5 g/dL')).toContain('10.5');
    expect(normalizeOcrText('Haemoglobin l4.5 g/dL')).toContain('14.5');
    expect(normalizeOcrText('Creatinine O.9 mg/dL')).toContain('0.9');
    expect(normalizeOcrText('Haem0globin 14.5')).toContain('Haemoglobin');
  });

  it('treats a 1–2 digit comma as a decimal and a 3 digit one as thousands', () => {
    expect(normalizeOcrText('Hb 14,5')).toContain('14.5');
    expect(normalizeOcrText('Platelets 250,000')).toContain('250000');
  });

  it('leaves HbA1c and SpO2 labels alone', () => {
    const t = normalizeOcrText('HbA1c 6.2 % SpO2 98 %');
    expect(t).toContain('HbA1c');
    expect(t).toContain('SpO2');
  });
});

describe('convertUnit', () => {
  it('converts mmol/L glucose and lipids to mg/dL', () => {
    expect(convertUnit('blood_glucose', 5.5, 'mmol/L')).toBeCloseTo(99.09, 1);
    expect(convertUnit('blood_glucose', 5.5, '')).toBeCloseTo(99.09, 1);
    expect(convertUnit('blood_glucose', 95, 'mg/dL')).toBe(95);
    expect(convertUnit('cholesterol', 5.2, 'mmol/L')).toBeCloseTo(201.08, 1);
    expect(convertUnit('triglycerides', 1.7, '')).toBeCloseTo(150.57, 1);
  });

  it('converts µmol/L creatinine, g/L haemoglobin, per-µL counts', () => {
    expect(convertUnit('creatinine', 88.4, 'umol/L')).toBe(1);
    expect(convertUnit('hemoglobin', 145, 'g/L')).toBe(14.5);
    expect(convertUnit('wbc', 8300, '/cumm')).toBe(8.3);
    expect(convertUnit('platelets', 250000, '/uL')).toBe(250);
    expect(convertUnit('platelets', 2.5, 'lakhs/cumm')).toBe(250);
  });

  it('converts IFCC HbA1c and Fahrenheit', () => {
    expect(convertUnit('hba1c', 48, 'mmol/mol')).toBeCloseTo(6.54, 1);
    expect(convertUnit('hba1c', 40, '')).toBe(40);
    expect(convertUnit('hba1c', 6.5, '%')).toBe(6.5);
    expect(convertUnit('temperature', 98.6, '°F')).toBeCloseTo(37, 1);
  });
});

describe('extractVitalsFromText', () => {
  it('reads a typical full blood count', () => {
    const v = extractVitalsFromText([
      'FULL BLOOD COUNT',
      'Test Result Unit Reference Range',
      'Haemoglobin 14.5 g/dL 13.0 - 17.0',
      'WBC (x10^3/uL) 8.30 4.0 - 11.0',
      'Total RBC Count 5.01 x10^6/uL 4.50 - 6.00',
      'PCV 43.2 % 40 - 50',
      'MCV 86.2 fL 80 - 100',
      'MCH 28.9 pg 27 - 32',
      'MCHC 33.5 g/dL 32 - 36',
      'Platelet Count 250 x10^3/uL 150 - 450',
    ].join('\n'));
    expect(v).toMatchObject({
      hemoglobin: 14.5, wbc: 8.3, rbc: 5.01, hematocrit: 43.2,
      mcv: 86.2, mch: 28.9, mchc: 33.5, platelets: 250,
    });
  });

  it('skips the power-of-ten in a unit printed before the result', () => {
    expect(extractVitalsFromText('WBC x10^3/uL 7.2').wbc).toBe(7.2);
    expect(extractVitalsFromText('Platelets 10*9/L 310').platelets).toBe(310);
  });

  it('reads counts printed per cubic millimetre', () => {
    const v = extractVitalsFromText('Total Leucocyte Count 8,300 /cumm\nPlatelet Count 2,50,000 /cumm');
    expect(v.wbc).toBe(8.3);
    expect(v.platelets).toBe(250);
  });

  it('reads a lipid profile without mixing HDL/LDL into total cholesterol', () => {
    const v = extractVitalsFromText([
      'LIPID PROFILE',
      'HDL Cholesterol 45 mg/dL',
      'LDL Cholesterol 130 mg/dL',
      'Total Cholesterol 210 mg/dL',
      'Triglycerides 160 mg/dL',
      'Cholesterol/HDL Ratio 4.6',
    ].join('\n'));
    expect(v).toMatchObject({ hdl: 45, ldl: 130, cholesterol: 210, triglycerides: 160 });
  });

  it('does not read Non-HDL cholesterol as HDL', () => {
    const v = extractVitalsFromText('Non-HDL Cholesterol 165 mg/dL\nHDL 48 mg/dL');
    expect(v.hdl).toBe(48);
  });

  it('reads SI-unit reports and converts them', () => {
    const v = extractVitalsFromText([
      'Fasting Plasma Glucose 5.6 mmol/L',
      'Serum Creatinine 90 umol/L',
      'Haemoglobin 138 g/L',
      'HbA1c 48 mmol/mol',
    ].join('\n'));
    expect(v.blood_glucose).toBeCloseTo(100.9, 0);
    expect(v.creatinine).toBeCloseTo(1.02, 1);
    expect(v.hemoglobin).toBe(13.8);
    expect(v.hba1c).toBeCloseTo(6.54, 1);
  });

  it('survives typical OCR noise from a blurred photo', () => {
    const v = extractVitalsFromText([
      'Haem0globin : l3,8 g/dL',
      'F.B.S 1O2 mg/dl',
      'HbA1c 6,1 %',
      'S. Creatinine O.9 mg/dL',
    ].join('\n'));
    expect(v).toMatchObject({ hemoglobin: 13.8, blood_glucose: 102, hba1c: 6.1, creatinine: 0.9 });
  });

  it('restores a decimal point lost to blur', () => {
    const v = extractVitalsFromText('MCV 856 fL 80 - 100\nMCH 284 pg 27-32\nTotal WBC Count 740 x10^3/uL 4.0-11.0');
    expect(v).toMatchObject({ mcv: 85.6, mch: 28.4, wbc: 7.4 });
  });

  it('matches row names garbled by OCR', () => {
    const v = extractVitalsFromText([
      'Hesmogiabin 13.8 g/dL 13.0-17.0',
      'Pistelet Count 223 x10^3 150-450',
      'HOL Cholesterol 44 mg/dL >40',
      'LOL Cholesterol 138 mg/dL <130',
      'Trglycendes 168 mg/dL <150',
    ].join('\n'));
    expect(v).toMatchObject({ hemoglobin: 13.8, platelets: 223, hdl: 44, ldl: 138, triglycerides: 168 });
  });

  it('does not fuzzy-match unrelated rows', () => {
    expect(extractVitalsFromText('Patient K Perera Age 45\nReceipt Number 20231\nCollected Date 12 10 2026')).toEqual({});
  });

  it('reads a value that OCR pushed onto the next line', () => {
    expect(extractVitalsFromText('Haemoglobin\n14.1 g/dL').hemoglobin).toBe(14.1);
  });

  it('does not take the reference range when the result is missing', () => {
    expect(extractVitalsFromText('Haemoglobin g/dL 13.0 - 17.0').hemoglobin).toBeUndefined();
    expect(extractVitalsFromText('HbA1c % 40-60').hba1c).toBeUndefined();
    expect(extractVitalsFromText('Total Cholesterol mg/dL < 200').cholesterol).toBeUndefined();
    expect(extractVitalsFromText('MCV 8.0 - 10.0').mcv).toBeUndefined();
  });

  it('reads vitals from a clinic note', () => {
    const v = extractVitalsFromText('BP: 128/84 mmHg\nPulse 76 bpm\nTemp 98.6 F\nSpO2 97 %');
    expect(v).toMatchObject({ bp_systolic: 128, bp_diastolic: 84, heart_rate: 76, oxygen_saturation: 97 });
    expect(v.temperature).toBeCloseTo(37, 1);
  });

  it('returns nothing for unrelated text', () => {
    expect(extractVitalsFromText('Thank you for choosing our laboratory.')).toEqual({});
  });
});

describe('voteVitals', () => {
  it('takes the value most passes agree on', () => {
    const v = voteVitals([
      { vitals: { hemoglobin: 14.5, wbc: 8.3 }, confidence: 70 },
      { vitals: { hemoglobin: 14.6 }, confidence: 90 },
      { vitals: { hemoglobin: 14.5, platelets: 250 }, confidence: 60 },
    ]);
    expect(v).toEqual({ hemoglobin: 14.5, wbc: 8.3, platelets: 250 });
  });

  it('breaks a tie with confidence', () => {
    const v = voteVitals([
      { vitals: { hemoglobin: 14.5 }, confidence: 50 },
      { vitals: { hemoglobin: 14.6 }, confidence: 90 },
    ]);
    expect(v.hemoglobin).toBe(14.6);
  });
});
