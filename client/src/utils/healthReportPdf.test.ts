import { describe, it, expect } from 'vitest';
import { buildHealthReportPdf, healthReportFilename } from './healthReportPdf';
import type { HealthReportData } from './healthReportPdf';
import { getStatus, VITALS } from '../constants/vitals';

// The report is a clinical document a patient may hand to a doctor, so the
// parts that can be wrong in a *dangerous* way are what these cover: whether a
// value is classified normal/abnormal, and whether the newest reading for each
// field is the one that gets printed.
//
// The PDF layout itself is not asserted — pixel positions are not a
// correctness property, and testing them would just pin the design in place.

// i18n is irrelevant to the logic; return the key so output stays inspectable.
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key) as any;

const baseData = (over: Partial<HealthReportData> = {}): HealthReportData => ({
  generated_at: '2026-10-14T10:00:00.000Z',
  patient: {
    id: 9, name: 'Saman Kumara', email: 'saman@example.lk',
    created_at: '2026-01-01T00:00:00.000Z',
    profile: { phone: '0771234567', blood_type: 'O+', allergies: 'Penicillin' },
  },
  vitals_records: [],
  consultations: [],
  lab_requests: [],
  patient_reports: [],
  appointments: [],
  ...over,
});

describe('vital classification shared with the dashboard', () => {
  // The whole reason src/constants/vitals.ts exists. If the PDF ever got its
  // own copy of these ranges, a value could read "High" on screen and
  // "Normal" on the printout.
  it('flags critical before merely out-of-range', () => {
    const hb = VITALS.find(v => v.key === 'hemoglobin')!;
    // 6.0 is below both min (12.0) and critLow (7.0) — "critical" is the
    // answer that matters.
    expect(getStatus(6.0, hb)).toBe('critical-low');
    expect(getStatus(10.0, hb)).toBe('low');
    expect(getStatus(14.0, hb)).toBe('normal');
    expect(getStatus(19.0, hb)).toBe('high');
    expect(getStatus(21.0, hb)).toBe('critical-high');
  });

  it('treats the range boundaries as normal, not abnormal', () => {
    const hr = VITALS.find(v => v.key === 'heart_rate')!;
    expect(getStatus(60, hr)).toBe('normal');
    expect(getStatus(100, hr)).toBe('normal');
    expect(getStatus(59, hr)).toBe('low');
    expect(getStatus(101, hr)).toBe('high');
  });

  // The indices deliberately have no critical thresholds — a single
  // out-of-range MCV is not actionable on its own.
  it('never reports critical for a vital with no critical threshold', () => {
    const mcv = VITALS.find(v => v.key === 'mcv')!;
    expect(mcv.critLow).toBeUndefined();
    expect(mcv.critHigh).toBeUndefined();
    expect(getStatus(1, mcv)).toBe('low');
    expect(getStatus(9999, mcv)).toBe('high');
  });
});

describe('buildHealthReportPdf', () => {
  it('produces a PDF for a patient with no clinical data at all', () => {
    // A brand-new patient must still get a readable report rather than a
    // crash or an empty file.
    const doc = buildHealthReportPdf(baseData(), t);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });

  it('prints the newest reading per field, not the newest record', () => {
    // The case mergeLatestPerField exists for: a later manual heart-rate
    // entry must not hide the hemoglobin from an earlier full CBC panel.
    const data = baseData({
      vitals_records: [
        { recorded_at: '2026-10-10T00:00:00Z', source: 'manual', heart_rate: 72, hemoglobin: null },
        { recorded_at: '2026-10-01T00:00:00Z', source: 'lab_report', heart_rate: null, hemoglobin: 13.5 },
      ],
    });
    const text = buildHealthReportPdf(data, t).output();
    // Both fields present means neither record shadowed the other.
    expect(text).toContain('72');
    expect(text).toContain('13.5');
  });

  it('prefers the most recent value when one field appears twice', () => {
    const data = baseData({
      vitals_records: [
        { recorded_at: '2026-10-10T00:00:00Z', source: 'manual', hemoglobin: 9.1 },
        { recorded_at: '2026-10-01T00:00:00Z', source: 'lab_report', hemoglobin: 13.5 },
      ],
    });
    const text = buildHealthReportPdf(data, t).output();
    expect(text).toContain('9.1');
    expect(text).not.toContain('13.5');
  });

  it('ignores null and non-numeric readings rather than printing them', () => {
    const data = baseData({
      vitals_records: [
        { recorded_at: '2026-10-10T00:00:00Z', source: 'manual',
          heart_rate: null, hemoglobin: undefined, wbc: 'not a number', platelets: 250 },
      ],
    });
    const doc = buildHealthReportPdf(data, t);
    const text = doc.output();
    expect(text).toContain('250');
    expect(text).not.toContain('not a number');
    expect(text).not.toContain('NaN');
  });

  it('paginates a long history instead of overflowing one page', () => {
    const consultations = Array.from({ length: 40 }, (_, i) => ({
      id: i, visit_date: `2026-0${(i % 9) + 1}-15`, diagnosis: `Condition number ${i}`,
      treatment_description: 'A reasonably long treatment description that wraps across lines.',
      medicines: [{ medicine_name: `Medicine ${i}`, dosage: '500mg', frequency: 'twice daily' }],
    }));
    const doc = buildHealthReportPdf(baseData({ consultations }), t);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('never prints a stored upload filename', () => {
    // The server reduces report_file to a boolean on purpose; a filename in a
    // document the patient may forward is exposure with no benefit.
    const data = baseData({
      lab_requests: [{
        id: 1, test_description: 'Full Blood Count', status: 'completed',
        created_at: '2026-10-01T00:00:00Z', has_report: true,
        laboratory_name: 'City Medical Laboratory',
        report_notes: 'Within normal limits.',
      }],
      patient_reports: [{
        id: 1, title: 'Chest X-Ray', report_type: 'imaging',
        issued_date: '2026-09-01', hospital_clinic: 'Nawaloka',
      }],
    });
    const text = buildHealthReportPdf(data, t).output();
    expect(text).not.toMatch(/\.pdf|\.jpg|\.jpeg|\.png/i);
    expect(text).not.toMatch(/rx_|lab_|pr_/);
  });

  it('does not throw when the profile is missing entirely', () => {
    // A patient who has never filled in their profile.
    const data = baseData({ patient: { ...baseData().patient, profile: null } });
    expect(() => buildHealthReportPdf(data, t)).not.toThrow();
  });
});

describe('healthReportFilename', () => {
  it('is dated and carries the patient name without spaces', () => {
    expect(healthReportFilename(baseData()))
      .toBe('CoreHealth_Report_Saman_Kumara_2026-10-14.pdf');
  });

  it('falls back to a generic name rather than producing a broken filename', () => {
    const data = baseData({ patient: { ...baseData().patient, name: '' } });
    expect(healthReportFilename(data)).toBe('CoreHealth_Report_Patient_2026-10-14.pdf');
  });

  it('collapses runs of whitespace so the name is always one token', () => {
    const data = baseData({ patient: { ...baseData().patient, name: '  Nimal   Perera  ' } });
    expect(healthReportFilename(data)).toBe('CoreHealth_Report_Nimal_Perera_2026-10-14.pdf');
  });
});
