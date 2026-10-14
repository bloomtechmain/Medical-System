import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, RLSActor } from '../config/db';
import { audit, AuditAction } from '../utils/auditLog';

// COMP-03: "there is no export of a user's data, no self-service request, and
// no written process." This is the self-service export — a logged-in user can
// download everything the system holds about them, without asking anyone.
//
// Scope decision: this returns the requester's **own** data only. There is no
// admin "export anyone's data" endpoint, deliberately — that would be a
// single call that dumps a complete patient record, which is the most
// damaging thing an abused admin session could do. A subject access request
// made by email is handled by an operator following docs/data-retention.md,
// where the identity check happens before anything is produced.
//
// Access to the export is recorded like any other read of a patient record,
// so an export triggered by a stolen session is visible afterwards.

const actor = (req: Request): RLSActor => ({ id: req.user.id, role: req.user.role });

// Files are referenced by name, not embedded. A JSON document with several
// megabytes of base64 PDFs in it is unusable, and every file already has an
// authenticated endpoint the user can call. The reference tells them what
// exists and where to get it.
const fileRef = (
  present: unknown,
  endpoint: string
): { available: boolean; download?: string } =>
  present ? { available: true, download: endpoint } : { available: false };

const exportMyData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user.id;
    const a = actor(req);

    // Account + role profile. Password hash, MFA secret and token tables are
    // excluded: they are credentials, not personal data the subject needs,
    // and returning them would be a security problem rather than
    // transparency.
    const { rows: account } = await pool.query(
      `SELECT id, name, email, role, is_active, accepted_terms_version, accepted_terms_at,
              created_at, updated_at
       FROM public.users WHERE id = $1`,
      [userId]
    );
    if (!account.length) { res.status(404).json({ message: 'Account not found' }); return; }

    const profileTable: Record<string, string> = {
      patient: 'clinical.patient_profiles',
      doctor: 'public.doctor_profiles',
      pharmacist: 'public.pharmacist_profiles',
      laboratory: 'public.laboratory_profiles',
    };

    let profile: unknown = null;
    const table = profileTable[req.user.role];
    if (table) {
      // patient_profiles is behind row-level security, so it must be read
      // with the acting user's identity set; the others are in public.
      const read = table.startsWith('clinical.') ? queryAs(a, `SELECT * FROM ${table} WHERE user_id = $1`, [userId])
                                                 : pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
      const { rows } = await read;
      profile = rows[0] ?? null;
    }

    // Clinical data. Patients own all of this; for a clinician the same
    // endpoint returns the records *about them* (their own account and
    // profile) and not their patients' records, which belong to those
    // patients and would be exported by them.
    const isPatient = req.user.role === 'patient';

    const consultations = isPatient
      ? (await queryAs(a,
          `SELECT c.id, c.visit_date, c.doctor_name, c.hospital_clinic, c.sick_description,
                  c.diagnosis, c.treatment_description, c.lab_tests_requested, c.status,
                  c.prescription_file, c.created_at,
                  COALESCE(
                    (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                       'medicine_name', m.medicine_name, 'dosage', m.dosage,
                       'frequency', m.frequency, 'duration', m.duration, 'source', m.source
                     ) ORDER BY m.id)
                     FROM clinical.consultation_medicines m WHERE m.consultation_id = c.id),
                    '[]'
                  ) AS medicines
           FROM clinical.medical_consultations c
           WHERE c.patient_id = $1 AND c.deleted_at IS NULL
           ORDER BY c.visit_date DESC`, [userId])).rows
      : [];

    const labRequests = isPatient
      ? (await queryAs(a,
          `SELECT id, test_description, notes, status, report_notes, report_file,
                  referral_file, created_at, updated_at
           FROM clinical.lab_requests WHERE patient_id = $1 ORDER BY created_at DESC`, [userId])).rows
      : [];

    const patientReports = isPatient
      ? (await queryAs(a,
          `SELECT id, title, report_type, laboratory_name, doctor_name, hospital_clinic,
                  issued_date, description, file_path, file_original_name, created_at
           FROM clinical.patient_reports
           WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY issued_date DESC`, [userId])).rows
      : [];

    const vitals = isPatient
      ? (await queryAs(a,
          `SELECT * FROM clinical.patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC`,
          [userId])).rows
      : [];

    const accessGrants = isPatient
      ? (await queryAs(a,
          `SELECT dar.id, dar.access_type, dar.status, dar.reason, dar.responded_at, dar.created_at,
                  u.name AS doctor_name
           FROM clinical.data_access_requests dar
           JOIN public.users u ON u.id = dar.doctor_id
           WHERE dar.patient_id = $1 ORDER BY dar.created_at DESC`, [userId])).rows
      : [];

    const appointments = isPatient
      ? (await queryAs(a,
          `SELECT id, appointment_date, start_time, end_time, status, reason, doctor_notes, created_at
           FROM clinical.doctor_appointments WHERE patient_id = $1 ORDER BY appointment_date DESC`,
          [userId])).rows
      : [];

    // Who has accessed this person's record. COMP-03 lists an export as the
    // requirement; the Privacy Policy promises the subject can ask "who saw
    // my record", and this is where that promise is kept. Only entries about
    // them, and only the fact of the access — not the accessor's IP, which is
    // the accessor's personal data, not the subject's.
    const { rows: accessHistory } = await pool.query(
      `SELECT al.occurred_at, al.action, al.outcome, al.actor_role,
              actor.name AS accessed_by,
              admin.name AS acting_admin
       FROM public.audit_log al
       LEFT JOIN public.users actor ON actor.id = al.actor_id
       LEFT JOIN public.users admin ON admin.id = al.impersonated_by
       WHERE al.patient_user_id = $1
       ORDER BY al.occurred_at DESC
       LIMIT 1000`,
      [userId]
    );

    audit(req, {
      action: AuditAction.PATIENT_RECORD_VIEWED,
      targetType: 'data_export',
      targetId: userId,
      patientUserId: isPatient ? userId : null,
      metadata: { self_service_export: true },
    });

    const filename = `corehealth-data-export-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');

    res.json({
      export_generated_at: new Date().toISOString(),
      about: 'Everything Core Health holds about you. Files are listed with a download link rather than embedded — see docs/data-retention.md for how to request anything missing.',
      account: account[0],
      profile,
      consultations: consultations.map((c: Record<string, unknown>) => ({
        ...c,
        prescription_file: fileRef(c.prescription_file, `/api/consultations/${c.id}/prescription-file`),
      })),
      lab_requests: labRequests.map((l: Record<string, unknown>) => ({
        ...l,
        report_file: fileRef(l.report_file, `/api/lab-requests/${l.id}/report-file`),
        referral_file: fileRef(l.referral_file, `/api/lab-requests/${l.id}/referral-file`),
      })),
      patient_reports: patientReports.map((p: Record<string, unknown>) => ({
        ...p,
        file_path: fileRef(p.file_path, `/api/patient-reports/${p.id}/file`),
      })),
      vitals,
      access_grants: accessGrants,
      appointments,
      access_history: accessHistory,
    });
  } catch (err) {
    next(err);
  }
};

export { exportMyData };
