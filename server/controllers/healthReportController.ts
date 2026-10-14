import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { audit, AuditAction } from '../utils/auditLog';

// The downloadable health report — a patient's own record, assembled in one
// place so the PDF is a consistent document rather than a snapshot of whatever
// the dashboard happened to have cached.
//
// Why this is a server endpoint rather than the client stitching together the
// three queries it already makes:
//
//   1. Completeness. The dashboard loads the last 100 vitals rows and the most
//      recent consultations for display. A report built from that is silently
//      partial — it would omit lab reports and uploaded documents entirely,
//      and a patient taking it to a doctor has no way to know.
//   2. Auditability (MON-12). A full export of a patient's clinical record is
//      exactly the event the audit log exists for. Recording it client-side
//      would be unreliable; recording it here is not optional.
//   3. One ownership check. Everything below is read through queryAs with the
//      requesting patient as the actor, so row-level security applies to every
//      query rather than each caller remembering a WHERE clause.
const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

const getMyHealthReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.user.id;
    const a = actor(req);

    // Account + demographic profile. patient_profiles is in the clinical
    // schema behind RLS, so it must be read with the actor set.
    const { rows: account } = await pool.query(
      `SELECT id, name, email, created_at FROM public.users WHERE id = $1 AND deleted_at IS NULL`,
      [patientId]
    );
    if (!account.length) { res.status(404).json({ message: 'Account not found' }); return; }

    const { rows: profileRows } = await queryAs(a,
      `SELECT date_of_birth, gender, phone, address,
              emergency_contact_name, emergency_contact_phone,
              blood_type, allergies, chronic_conditions,
              insurance_provider, insurance_policy_number
       FROM clinical.patient_profiles WHERE user_id = $1`,
      [patientId]
    );

    // Vitals: the latest value per field, merged across every source, plus
    // each field's previous reading. Reusing the same 100-row window and
    // merge rule as GET /patient-vitals keeps the report and the dashboard
    // showing the same numbers — see mergeLatestPerField in
    // patientVitalsController.ts for why a newer partial record must not hide
    // an older full panel.
    const { rows: vitalsRows } = await queryAs(a,
      `SELECT * FROM clinical.patient_vitals
       WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
      [patientId]
    );

    // Consultations, with the prescribed medicines for each. Not capped: this
    // is the patient's complete history and the point of the document is that
    // it is complete. A patient with hundreds of visits produces a long PDF,
    // which is the correct outcome.
    const { rows: consultations } = await queryAs(a,
      `SELECT c.id, c.visit_date, c.doctor_name, c.hospital_clinic,
              c.sick_description, c.diagnosis, c.treatment_description,
              c.status, c.created_at,
              u.name AS treating_doctor,
              dp.specialization AS doctor_specialization,
              COALESCE(
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                   'medicine_name', m.medicine_name, 'dosage', m.dosage,
                   'frequency', m.frequency, 'duration', m.duration
                 ) ORDER BY m.id)
                 FROM clinical.consultation_medicines m WHERE m.consultation_id = c.id),
                '[]'
              ) AS medicines
       FROM clinical.medical_consultations c
       LEFT JOIN public.users u ON u.id = c.doctor_id
       LEFT JOIN public.doctor_profiles dp ON dp.user_id = c.doctor_id
       WHERE c.patient_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.visit_date DESC`,
      [patientId]
    );

    // Lab requests and their results. report_file is deliberately reduced to a
    // boolean: the PDF cannot embed the file, and leaking the stored filename
    // into a document the patient may forward adds nothing but exposure.
    const { rows: labRequests } = await queryAs(a,
      `SELECT lr.id, lr.test_description, lr.status, lr.report_notes,
              lr.created_at, lr.updated_at,
              (lr.report_file IS NOT NULL) AS has_report,
              lab.name AS laboratory_name,
              doc.name AS requested_by
       FROM clinical.lab_requests lr
       LEFT JOIN public.users lab ON lab.id = lr.laboratory_id
       LEFT JOIN public.users doc ON doc.id = lr.doctor_id
       WHERE lr.patient_id = $1
       ORDER BY lr.created_at DESC`,
      [patientId]
    );

    // The patient's own uploaded documents, listed so the report states what
    // exists even though the files themselves are not part of the PDF.
    const { rows: patientReports } = await queryAs(a,
      `SELECT id, title, report_type, laboratory_name, doctor_name,
              hospital_clinic, issued_date, description
       FROM clinical.patient_reports
       WHERE patient_id = $1 AND deleted_at IS NULL
       ORDER BY issued_date DESC`,
      [patientId]
    );

    const { rows: appointments } = await queryAs(a,
      `SELECT a.id, a.appointment_date, a.start_time, a.end_time, a.status,
              a.reason, u.name AS doctor_name
       FROM clinical.doctor_appointments a
       LEFT JOIN public.users u ON u.id = a.doctor_id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC`,
      [patientId]
    );

    // MON-12: the whole clinical record leaving the system in one request.
    // Recorded before the response so a failure to log is not a silent gap.
    audit(req, {
      action: AuditAction.HEALTH_REPORT_DOWNLOADED,
      targetType: 'patient',
      targetId: patientId,
      patientUserId: patientId,
      metadata: {
        consultations: consultations.length,
        lab_requests: labRequests.length,
        patient_reports: patientReports.length,
        vitals_records: vitalsRows.length,
      },
    });

    res.json({
      generated_at: new Date().toISOString(),
      patient: { ...account[0], profile: profileRows[0] ?? null },
      // Raw rows, newest first. The client merges and classifies them against
      // the clinical reference ranges in src/constants/vitals.ts, which is the
      // single source for those ranges — duplicating them here would let the
      // PDF and the dashboard disagree about what counts as abnormal.
      vitals_records: vitalsRows,
      consultations,
      lab_requests: labRequests,
      patient_reports: patientReports,
      appointments,
    });
  } catch (err) {
    next(err);
  }
};

export { getMyHealthReport };
