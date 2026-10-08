import { Request, Response, NextFunction } from 'express';
import { queryAs, RLSActor } from '../config/db';
import { sendNotification } from '../utils/notify';

// patient_vitals lives in the `clinical` schema behind row-level security —
// every query against it must carry the acting user's identity. See
// config/db.ts (queryAs) for why plain pool.query() isn't enough.
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const VITAL_FIELDS = [
  'wbc','rbc','hemoglobin','hematocrit','mcv','mch','mchc','rdw','platelets','mpv',
  'blood_glucose','hba1c','creatinine',
  'cholesterol','hdl','ldl','triglycerides',
  'bp_systolic','bp_diastolic','heart_rate','temperature','oxygen_saturation',
];

interface FieldMeta {
  source: string;
  recorded_at: unknown;
  lab_request_id: number | null;
  patient_report_id: number | null;
  previous?: number | null;
  previous_recorded_at?: unknown;
  delta?: number;
  direction?: 'up' | 'down' | 'same';
}

// Display labels/units for building human-readable change summaries (notifications).
// Kept intentionally minimal — full clinical ranges live client-side in VitalsOverview.
const VITAL_LABELS: Record<string, { label: string; unit: string }> = {
  wbc: { label: 'WBC', unit: '10³/µL' }, rbc: { label: 'RBC', unit: '10⁶/µL' },
  hemoglobin: { label: 'Hemoglobin', unit: 'g/dL' }, hematocrit: { label: 'Hematocrit', unit: '%' },
  mcv: { label: 'MCV', unit: 'fL' }, mch: { label: 'MCH', unit: 'pg' }, mchc: { label: 'MCHC', unit: 'g/dL' },
  rdw: { label: 'RDW', unit: '%' }, platelets: { label: 'Platelets', unit: '10³/µL' }, mpv: { label: 'MPV', unit: 'fL' },
  blood_glucose: { label: 'Blood Glucose', unit: 'mg/dL' }, hba1c: { label: 'HbA1c', unit: '%' },
  creatinine: { label: 'Creatinine', unit: 'mg/dL' }, cholesterol: { label: 'Cholesterol', unit: 'mg/dL' },
  hdl: { label: 'HDL', unit: 'mg/dL' }, ldl: { label: 'LDL', unit: 'mg/dL' }, triglycerides: { label: 'Triglycerides', unit: 'mg/dL' },
  bp_systolic: { label: 'BP Systolic', unit: 'mmHg' }, bp_diastolic: { label: 'BP Diastolic', unit: 'mmHg' },
  heart_rate: { label: 'Heart Rate', unit: 'bpm' }, temperature: { label: 'Temperature', unit: '°C' },
  oxygen_saturation: { label: 'O₂ Saturation', unit: '%' },
};

// Merge the latest non-null value per field across recent records, newest first.
// A newer record that only carries a couple of fields (e.g. a manual heart-rate
// entry) must not hide older fields (e.g. a CBC panel from a lab report) that
// are still the most current values for those fields. Also tracks each field's
// previous reading + delta, so the dashboard/notifications can show a trend.
function mergeLatestPerField(rows: Record<string, any>[]): Record<string, any> | null {
  if (rows.length === 0) return null;

  const merged: Record<string, any> = {};
  const fieldMeta: Record<string, FieldMeta> = {};

  for (const field of VITAL_FIELDS) {
    const occurrences = rows.filter(r => r[field] !== null && r[field] !== undefined);
    if (occurrences.length === 0) continue;

    const hit = occurrences[0];
    merged[field] = hit[field];
    const meta: FieldMeta = {
      source:            hit.source,
      recorded_at:       hit.recorded_at,
      lab_request_id:    hit.lab_request_id ?? null,
      patient_report_id: hit.patient_report_id ?? null,
    };

    if (occurrences.length > 1) {
      const prev = occurrences[1];
      const curNum  = Number(hit[field]);
      const prevNum = Number(prev[field]);
      meta.previous             = prev[field];
      meta.previous_recorded_at = prev.recorded_at;
      meta.delta                = Math.round((curNum - prevNum) * 100) / 100;
      meta.direction             = meta.delta > 0 ? 'up' : meta.delta < 0 ? 'down' : 'same';
    }

    fieldMeta[field] = meta;
  }

  const notesHit = rows.find(r => r.notes);
  if (notesHit) merged.notes = notesHit.notes;

  merged.patient_id  = rows[0].patient_id;
  merged.recorded_at = rows[0].recorded_at;
  merged.updated_at  = rows.reduce(
    (latest, r) => (new Date(r.updated_at) > new Date(latest) ? r.updated_at : latest),
    rows[0].updated_at
  );
  merged.field_meta = fieldMeta;

  return merged;
}

// GET /patient-vitals — latest value per field, merged across all sources
// (manual entries, lab-uploaded reports, patient-uploaded reports)
const getVitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(mergeLatestPerField(rows));
  } catch (err) { next(err); }
};

// GET /patient-vitals/history
const getVitalsHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await queryAs(actor(req),
      `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// GET /patient-vitals/history/:field — every recorded reading for one field,
// oldest → newest, so the client can chart how it changed over time and show
// which readings came from a lab report vs a manual entry.
const getFieldHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const field = req.params.field;
    if (!VITAL_FIELDS.includes(field)) {
      res.status(400).json({ message: 'Unknown vital field' });
      return;
    }
    const { rows } = await queryAs(actor(req),
      `SELECT id, ${field} AS value, source, lab_request_id, patient_report_id, recorded_at
       FROM patient_vitals
       WHERE patient_id = $1 AND ${field} IS NOT NULL
       ORDER BY recorded_at ASC
       LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// POST /patient-vitals — upserts today's manual record
const saveVitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.user.id;
    const body      = req.body as Record<string, any>;

    // Collect which vital fields have valid values
    const fields:  string[]  = [];
    const vals:    unknown[] = [];

    for (const field of VITAL_FIELDS) {
      const v = body[field];
      if (v !== undefined && v !== '' && v !== null) {
        fields.push(field);
        vals.push(v);
      }
    }
    if (body.notes !== undefined && body.notes !== '') {
      fields.push('notes');
      vals.push(body.notes);
    }

    if (fields.length === 0) {
      res.status(400).json({ message: 'No vitals data provided' });
      return;
    }

    // Check for an existing manual record today to upsert into
    const today = new Date().toISOString().split('T')[0];
    const { rows: existing } = await queryAs(actor(req),
      `SELECT id FROM patient_vitals
       WHERE patient_id = $1 AND source = 'manual' AND recorded_at::date = $2
       ORDER BY recorded_at DESC LIMIT 1`,
      [patientId, today]
    );

    let result;

    if (existing.length > 0) {
      // ── UPDATE existing record ──────────────────────────────────────────
      // $1 = record id, $2...$N = field values
      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const { rows } = await queryAs(actor(req),
        `UPDATE patient_vitals
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing[0].id, ...vals]
      );
      result = rows[0];
    } else {
      // ── INSERT new record ───────────────────────────────────────────────
      // $1 = patient_id, $2...$N = field values (source is hardcoded)
      const colList     = ['patient_id', 'source', ...fields];
      const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await queryAs(actor(req),
        `INSERT INTO patient_vitals (${colList.join(', ')})
         VALUES ($1, 'manual', ${placeholders})
         RETURNING *`,
        [patientId, ...vals]
      );
      result = rows[0];
    }

    res.json(result);
  } catch (err) { next(err); }
};

// Shared by saveVitalsFromLab / saveVitalsFromPatientUpload — both extract
// vitals from an uploaded report in a background job and upsert into the one
// record tied to that source document (looked up via refColumn = refId).
const upsertExtractedVitals = async (
  actorForWrite: RLSActor,
  patientId:     number,
  vitalsData:    Record<string, number | undefined | null>,
  source:        'lab_report' | 'patient_upload',
  refColumn:     'lab_request_id' | 'patient_report_id',
  refId:         number
): Promise<void> => {
  const fields = Object.keys(vitalsData).filter(
    k => VITAL_FIELDS.includes(k) && vitalsData[k] !== undefined
  );
  if (fields.length === 0) return;

  const vals = fields.map(f => vitalsData[f]);

  const { rows: existing } = await queryAs(actorForWrite,
    `SELECT id FROM patient_vitals WHERE ${refColumn} = $1 LIMIT 1`,
    [refId]
  );

  if (existing.length > 0) {
    // UPDATE — $1 = record id, $2...$N = vitals values
    const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    await queryAs(actorForWrite,
      `UPDATE patient_vitals SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
      [existing[0].id, ...vals]
    );
  } else {
    // INSERT — $1=patient_id, $2=ref id, $3...$N=vitals values
    const colList      = ['patient_id', refColumn, 'source', ...fields];
    const placeholders = fields.map((_, i) => `$${i + 3}`).join(', ');
    await queryAs(actorForWrite,
      `INSERT INTO patient_vitals (${colList.join(', ')})
       VALUES ($1, $2, '${source}', ${placeholders})`,
      [patientId, refId, ...vals]
    );
  }

  await notifyVitalsChanged(actorForWrite, patientId, fields, source, refColumn, refId);
};

// Compares the just-written fields against the patient's prior readings and
// sends a "Your Vitals Updated" notification summarizing what changed —
// e.g. "Hemoglobin ▲ 14.8 g/dL (was 13.2)". Fields with no prior reading are
// reported as new values rather than a trend.
const notifyVitalsChanged = async (
  actorForRead:  RLSActor,
  patientId:     number,
  touchedFields: string[],
  source:        'lab_report' | 'patient_upload',
  refColumn:     'lab_request_id' | 'patient_report_id',
  refId:         number
): Promise<void> => {
  const { rows } = await queryAs(actorForRead,
    `SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
    [patientId]
  );
  const merged = mergeLatestPerField(rows);
  if (!merged) return;

  const changes = touchedFields
    .filter(f => VITAL_LABELS[f] && merged.field_meta[f])
    .map(f => {
      const meta = merged.field_meta[f] as FieldMeta;
      return {
        field:     f,
        label:     VITAL_LABELS[f].label,
        unit:      VITAL_LABELS[f].unit,
        current:   merged[f],
        previous:  meta.previous ?? null,
        delta:     meta.delta ?? null,
        direction: meta.direction ?? null,
      };
    });
  if (changes.length === 0) return;

  const withTrend = changes.filter(c => c.previous != null);
  const highlights = (withTrend.length > 0 ? withTrend : changes)
    .slice(0, 3)
    .map(c => {
      if (c.previous == null) return `${c.label} ${c.current} ${c.unit}`;
      const arrow = c.direction === 'up' ? '▲' : c.direction === 'down' ? '▼' : '≈';
      return `${c.label} ${arrow} ${c.current} ${c.unit} (was ${c.previous})`;
    })
    .join(', ');
  const more = changes.length > 3 ? `, and ${changes.length - 3} more` : '';

  const sourceLabel = source === 'lab_report' ? 'your latest lab report' : 'the report you uploaded';
  const message = `${changes.length} value${changes.length > 1 ? 's' : ''} updated from ${sourceLabel}: ${highlights}${more}.`;

  await sendNotification(
    patientId,
    'vitals_updated',
    'Your Vitals Updated 📊',
    message,
    { source, [refColumn]: refId, changes }
  );
};

// Internal — called by labController when a laboratory uploads a report.
// Runs from a background job — there's no req.user here, but the pv_mod RLS
// policy explicitly allows role 'laboratory' regardless of patient_id, so a
// fixed lab actor is correct.
export const saveVitalsFromLab = async (
  patientId:    number,
  vitalsData:   Record<string, number | undefined | null>,
  labRequestId: number
): Promise<void> => {
  try {
    const labActor: RLSActor = { role: 'laboratory' };
    await upsertExtractedVitals(labActor, patientId, vitalsData, 'lab_report', 'lab_request_id', labRequestId);
  } catch (err) {
    console.error('saveVitalsFromLab error:', (err as Error).message);
  }
};

// Internal — called by patientReportController when a patient self-uploads a
// report tagged report_type='lab_report'. Unlike the lab case, the pv_mod
// policy for a 'patient' actor requires patient_id = app_uid(), so the
// actor's id must be the uploading patient themselves.
export const saveVitalsFromPatientUpload = async (
  patientId:       number,
  vitalsData:      Record<string, number | undefined | null>,
  patientReportId: number
): Promise<void> => {
  try {
    const patientActor: RLSActor = { id: patientId, role: 'patient' };
    await upsertExtractedVitals(patientActor, patientId, vitalsData, 'patient_upload', 'patient_report_id', patientReportId);
  } catch (err) {
    console.error('saveVitalsFromPatientUpload error:', (err as Error).message);
  }
};

export { getVitals, getVitalsHistory, getFieldHistory, saveVitals };
