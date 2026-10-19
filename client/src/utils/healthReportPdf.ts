import { jsPDF } from 'jspdf';
import type { TFunction } from 'i18next';
import { formatDate } from './helpers';
import { VITALS, GROUPS, groupLabel, vitalLabel, getStatus } from '../constants/vitals';
import type { VitalDef, VitalStatus } from '../constants/vitals';

// The patient's downloadable health report.
//
// Moved out of PatientDashboard.tsx when the vitals section was added — at
// that point it was a 240-line document generator living inside a page
// component, and it is now also called from the vitals page.
//
// Data comes from GET /api/health-report/me, which assembles the complete
// record server-side and audits the download (MON-12). The clinical ranges
// used to classify each value come from src/constants/vitals.ts, shared with
// VitalsOverview, so the dashboard and this PDF can never disagree about what
// is abnormal.

export interface HealthReportData {
  generated_at: string;
  patient: {
    id: number;
    name: string;
    email: string;
    created_at: string;
    profile: Record<string, any> | null;
  };
  vitals_records: Record<string, any>[];
  consultations: Record<string, any>[];
  lab_requests: Record<string, any>[];
  patient_reports: Record<string, any>[];
  appointments: Record<string, any>[];
}

// Latest non-null value per field across the recent records, newest first.
// Mirrors mergeLatestPerField in patientVitalsController.ts: a newer record
// carrying only a heart rate must not hide an older full CBC panel that is
// still the most current reading for those fields.
interface MergedVital {
  def: VitalDef;
  value: number;
  status: VitalStatus;
  source: string;
  recordedAt: string;
  previous?: number;
}

function mergeVitals(rows: Record<string, any>[]): MergedVital[] {
  const out: MergedVital[] = [];
  for (const def of VITALS) {
    const hits = rows.filter(r => r[def.key] !== null && r[def.key] !== undefined);
    if (!hits.length) continue;
    const value = Number(hits[0][def.key]);
    if (!Number.isFinite(value)) continue;
    out.push({
      def,
      value,
      status: getStatus(value, def),
      source: hits[0].source,
      recordedAt: hits[0].recorded_at,
      previous: hits.length > 1 ? Number(hits[1][def.key]) : undefined,
    });
  }
  return out;
}

const STATUS_RGB: Record<VitalStatus, [number, number, number]> = {
  'normal':        [20, 184, 166],
  'low':           [59, 130, 246],
  'high':          [245, 158, 11],
  'critical-low':  [220, 38, 38],
  'critical-high': [220, 38, 38],
};

const statusWord = (s: VitalStatus, t: TFunction): string => {
  if (s === 'normal') return t('pdf.vitalStatus.normal');
  if (s === 'low') return t('pdf.vitalStatus.low');
  if (s === 'high') return t('pdf.vitalStatus.high');
  return t('pdf.vitalStatus.critical');
};

const sourceWord = (src: string, t: TFunction): string => {
  if (src === 'lab_report') return t('pdf.vitalSource.labReport');
  if (src === 'patient_upload') return t('pdf.vitalSource.yourUpload');
  return t('pdf.vitalSource.manualEntry');
};

// Trims a float to the precision its `step` implies, so a stored 7.00 prints
// as "7" and a 36.60 as "36.6" rather than as raw database output.
const formatValue = (value: number, def: VitalDef): string => {
  if (def.inputType === 'integer' || def.step === '1') return String(Math.round(value));
  const decimals = (def.step.split('.')[1] || '').length;
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0';
};

export function buildHealthReportPdf(data: HealthReportData, t: TFunction): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const colW = pageW - margin * 2;
  let y = 0;

  const me = data.patient;
  const profile = me.profile;
  const val = (v: any) => (v === null || v === undefined || v === '' ? t('pdf.notProvided') : String(v));
  const now = new Date(data.generated_at);

  // Every section advances `y` and may add a page, so the page break lives in
  // one helper rather than being re-checked at each call site.
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 22) { doc.addPage(); y = 20; }
  };

  const header = () => {
    doc.setFillColor(13, 148, 136);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Core Health', margin, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('by BloomTech', margin, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(t('pdf.title'), margin, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      t('pdf.generatedLabel', {
        date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        time: now.toLocaleTimeString(),
      }),
      pageW - margin, 32, { align: 'right' }
    );
    y = 48;
  };

  const section = (title: string) => {
    ensureSpace(20);
    doc.setFillColor(240, 253, 250);
    doc.roundedRect(margin, y, colW, 7, 1, 1, 'F');
    doc.setTextColor(15, 118, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    y += 12;
  };

  const row = (label: string, value: any, highlight = false) => {
    ensureSpace(10);
    if (highlight) { doc.setFillColor(254, 226, 226); doc.rect(margin, y - 1, colW, 7, 'F'); }
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(label, margin + 3, y + 4);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(val(value), colW - 60);
    doc.text(lines[0], margin + 55, y + 4);
    y += 8;
  };

  const divider = () => {
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, margin + colW, y);
    y += 5;
  };

  header();

  // ── Patient banner ────────────────────────────────────────────────────────
  doc.setFillColor(204, 251, 241);
  doc.roundedRect(margin, y, colW, 14, 2, 2, 'F');
  doc.setTextColor(13, 148, 136);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(me.name || t('pdf.patientRole'), margin + 6, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 118, 110);
  doc.text(
    t('pdf.patientRole') + '  ·  ' + t('pdf.idLine', { id: me.id ?? '—' }),
    pageW - margin - 3, y + 9.5, { align: 'right' }
  );
  y += 20;

  section(t('pdf.sections.personal'));
  row(t('pdf.fields.fullName'), me.name);
  row(t('pdf.fields.email'), me.email);
  row(t('pdf.fields.phone'), profile?.phone);
  row(t('pdf.fields.dob'), profile?.date_of_birth ? formatDate(profile.date_of_birth) : null);
  row(t('pdf.fields.gender'), profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null);
  row(t('pdf.fields.address'), profile?.address);
  divider();

  section(t('pdf.sections.health'));
  row(t('pdf.fields.bloodType'), profile?.blood_type);
  // Allergies are highlighted when present: this is the line a clinician
  // reading the report in a hurry most needs to catch.
  row(t('pdf.fields.allergies'), profile?.allergies, !!(profile?.allergies && profile.allergies !== 'None'));
  row(t('pdf.fields.chronicConditions'), profile?.chronic_conditions);
  divider();

  section(t('pdf.sections.emergency'));
  row(t('pdf.fields.contactName'), profile?.emergency_contact_name);
  row(t('pdf.fields.contactPhone'), profile?.emergency_contact_phone);
  divider();

  // ── Vitals and lab values ────────────────────────────────────────────────
  // The reason this function was extended. Grouped by panel, each value shown
  // against its reference range with an explicit normal/low/high/critical
  // word — not just a colour, because the report is routinely printed in
  // black and white and colour alone is also unreadable to anyone with a
  // colour vision deficiency.
  const merged = mergeVitals(data.vitals_records);

  if (merged.length) {
    section(t('pdf.sections.vitals'));

    const abnormal = merged.filter(m => m.status !== 'normal');
    const critical = merged.filter(m => m.status === 'critical-low' || m.status === 'critical-high');

    // Summary line first, so a reader knows whether to study the table.
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      t('pdf.vitalsSummary', { total: merged.length, abnormal: abnormal.length }),
      margin + 3, y + 3
    );
    y += 7;

    if (critical.length) {
      ensureSpace(12);
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(margin, y, colW, 8, 1, 1, 'F');
      doc.setTextColor(185, 28, 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(
        t('pdf.vitalsCritical', {
          count: critical.length,
          names: critical.map(m => vitalLabel(m.def, t)).join(', '),
        }),
        margin + 3, y + 5.5
      );
      y += 12;
    }

    // Column layout, fixed so the header and every row stay aligned.
    const cx = {
      name: margin + 3,
      value: margin + 58,
      unit: margin + 82,
      range: margin + 104,
      status: margin + 136,
      source: margin + 158,
    };

    const tableHeader = () => {
      ensureSpace(10);
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, colW, 6, 'F');
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.text(t('pdf.vitalsTable.measurement').toUpperCase(), cx.name, y + 4);
      doc.text(t('pdf.vitalsTable.result').toUpperCase(), cx.value, y + 4);
      doc.text(t('pdf.vitalsTable.unit').toUpperCase(), cx.unit, y + 4);
      doc.text(t('pdf.vitalsTable.range').toUpperCase(), cx.range, y + 4);
      doc.text(t('pdf.vitalsTable.status').toUpperCase(), cx.status, y + 4);
      doc.text(t('pdf.vitalsTable.source').toUpperCase(), cx.source, y + 4);
      y += 8;
    };

    for (const group of GROUPS) {
      const inGroup = merged.filter(m => m.def.group === group);
      if (!inGroup.length) continue;

      ensureSpace(22);
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(groupLabel(group, t), margin + 3, y + 3);
      y += 6;
      tableHeader();

      for (const m of inGroup) {
        ensureSpace(9);
        const abnormalRow = m.status !== 'normal';
        if (abnormalRow) {
          const [r, g, b] = STATUS_RGB[m.status];
          // Tinted band rather than coloured text, so the row stays legible
          // when printed in greyscale.
          doc.setFillColor(m.status.startsWith('critical') ? 254 : 255,
                           m.status.startsWith('critical') ? 242 : 251,
                           m.status.startsWith('critical') ? 242 : 235);
          doc.rect(margin, y - 1.5, colW, 7, 'F');
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(0.8);
          doc.line(margin, y - 1.5, margin, y + 5.5);
          doc.setLineWidth(0.2);
        }

        doc.setTextColor(17, 24, 39);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(doc.splitTextToSize(vitalLabel(m.def, t), 52)[0], cx.name, y + 3);

        doc.setFont('helvetica', 'bold');
        doc.text(formatValue(m.value, m.def), cx.value, y + 3);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(7);
        doc.text(m.def.unit, cx.unit, y + 3);
        doc.text(`${formatValue(m.def.min, m.def)}–${formatValue(m.def.max, m.def)}`, cx.range, y + 3);

        const [r, g, b] = STATUS_RGB[m.status];
        doc.setTextColor(r, g, b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(statusWord(m.status, t), cx.status, y + 3);

        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(sourceWord(m.source, t), cx.source, y + 3);

        y += 7;
      }
      y += 3;
    }

    // Provenance: a clinician needs to know how old these numbers are before
    // acting on them.
    const newest = merged.reduce<string | null>(
      (acc, m) => (!acc || new Date(m.recordedAt) > new Date(acc) ? m.recordedAt : acc), null
    );
    if (newest) {
      ensureSpace(8);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.text(t('pdf.vitalsRecorded', { date: formatDate(newest) }), margin + 3, y + 3);
      y += 7;
    }
    divider();
  }

  // ── Consultation history ─────────────────────────────────────────────────
  if (data.consultations?.length) {
    section(t('pdf.sections.history'));
    for (const c of data.consultations) {
      ensureSpace(14);
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(
        `${formatDate(c.visit_date)} — ${c.diagnosis || c.sick_description || t('pdf.visitFallback')}`,
        margin + 3, y + 4
      );
      y += 7;

      const doctor = c.treating_doctor || c.doctor_name;
      if (doctor) {
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const spec = c.doctor_specialization ? ` (${c.doctor_specialization})` : '';
        doc.text(`${doctor}${spec}${c.hospital_clinic ? ' · ' + c.hospital_clinic : ''}`, margin + 6, y + 3);
        y += 5;
      }

      if (c.treatment_description) {
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        for (const line of doc.splitTextToSize(t('pdf.treatmentLine', { text: c.treatment_description }), colW - 10)) {
          ensureSpace(6);
          doc.text(line, margin + 6, y + 3);
          y += 5;
        }
      }

      // Prescribed medicines: previously absent from the report entirely,
      // which made the history far less useful than it looks.
      const meds = Array.isArray(c.medicines) ? c.medicines : [];
      for (const med of meds) {
        ensureSpace(6);
        doc.setTextColor(75, 85, 99);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const parts = [med.dosage, med.frequency, med.duration].filter(Boolean).join(', ');
        doc.text(`•  ${med.medicine_name}${parts ? ' — ' + parts : ''}`, margin + 8, y + 3);
        y += 5;
      }
      y += 2;
    }
    divider();
  }

  // ── Laboratory tests ─────────────────────────────────────────────────────
  if (data.lab_requests?.length) {
    section(t('pdf.sections.labTests'));
    for (const l of data.lab_requests) {
      ensureSpace(12);
      doc.setTextColor(15, 118, 110);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${formatDate(l.created_at)} — ${l.test_description}`, margin + 3, y + 4);
      y += 6;
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const bits = [
        l.laboratory_name,
        t(`pdf.labStatus.${l.status}`, { defaultValue: l.status }),
        l.has_report ? t('pdf.labReportAvailable') : null,
      ].filter(Boolean).join('  ·  ');
      doc.text(bits, margin + 6, y + 3);
      y += 5;
      if (l.report_notes) {
        for (const line of doc.splitTextToSize(l.report_notes, colW - 12)) {
          ensureSpace(6);
          doc.text(line, margin + 6, y + 3);
          y += 4.5;
        }
      }
      y += 2;
    }
    divider();
  }

  // ── Uploaded documents ───────────────────────────────────────────────────
  if (data.patient_reports?.length) {
    section(t('pdf.sections.documents'));
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text(t('pdf.documentsNote'), margin + 3, y + 3);
    y += 7;
    for (const r of data.patient_reports) {
      ensureSpace(8);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const meta = [r.report_type, r.laboratory_name || r.hospital_clinic].filter(Boolean).join(' · ');
      doc.text(`•  ${formatDate(r.issued_date)} — ${r.title}${meta ? '  (' + meta + ')' : ''}`, margin + 5, y + 3);
      y += 6;
    }
    divider();
  }

  // ── Footer and watermark on every page ───────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);

    doc.setTextColor(200, 200, 200);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(52);
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
    doc.text('CORE HEALTH', pageW / 2, pageH / 2, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    doc.setFillColor(13, 148, 136);
    doc.rect(0, pageH - 14, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Core Health by BloomTech  ·  ${t('pdf.footerConfidential')}  ·  ${t('pdf.footerAuthorized')}`,
      pageW / 2, pageH - 8.5, { align: 'center' }
    );
    doc.setFontSize(6.5);
    doc.text(t('pdf.pageOf', { page: p, total: pages }), pageW - margin, pageH - 3.5, { align: 'right' });
  }

  return doc;
}

// Separated from the download so it can be asserted directly — the filename
// is what a patient sees in their downloads folder and may email on, so the
// date and the name both matter.
export function healthReportFilename(data: HealthReportData): string {
  const name = (data.patient.name || 'Patient').trim().replace(/\s+/g, '_');
  const date = new Date(data.generated_at).toISOString().slice(0, 10);
  return `CoreHealth_Report_${name}_${date}.pdf`;
}

export function downloadHealthReport(data: HealthReportData, t: TFunction): void {
  buildHealthReportPdf(data, t).save(healthReportFilename(data));
}
