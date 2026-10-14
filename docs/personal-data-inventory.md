# Personal data inventory (SEC-30)

What tables hold personal data or PHI, what's in them, why, and who can
reach them. Generated from `corehealth_database.sql` — the schema file is
the source of truth; re-check this doc whenever that file changes.

## Row-level security: now actually enforced (resolved — DB-02)

This section previously carried a caveat that the `RLS` markings below
provided **zero actual protection**, because the application connected as
`postgres` (`rolsuper = true`, `rolbypassrls = true`) and a superuser bypasses
row-level security entirely.

**That has been fixed.** The application now connects as `corehealth_app`, a
role that is neither a superuser nor `BYPASSRLS`, with a separate
`corehealth_migrator` role for migrations and tenant provisioning (see section
6 of `corehealth_database.sql`). The `RLS` markings below therefore mean what
they say, and the application-layer `WHERE` clauses and ownership checks are
defence in depth rather than the only line.

This is verified, not assumed: `server/controllers/__tests__/rls.integration.test.ts`
runs against a real database **as `corehealth_app`** and asserts that a doctor
with no accepted access request reads zero rows — which is exactly the test
DB-02 asked for, and it would pass vacuously if the connection were a
superuser.

One thing to preserve on any new deployment, including AWS RDS: `DATABASE_URL`
must point at `corehealth_app`, never at the instance's master user. Pointing
it at a superuser silently re-opens this hole with no error and no visible
symptom. See `docs/environments.md`.

## public schema — shared identity, not RLS-protected (app-layer checks only)

| Table | Personal data | Purpose | Who can access |
|---|---|---|---|
| `users` | name, email, password (bcrypt hash), role, mfa_secret | Core identity + auth for every person in the system (patient, doctor, pharmacist, laboratory, admin). | Self (own row via `/me`), admin (full), anyone with a valid session for name+email only via role-scoped search endpoints (`/users/doctors`, `/users/pharmacists`, etc. — SEC-17 #5 already narrowed these to name+email, no license numbers). |
| `refresh_tokens` | hashed session tokens, tied to `user_id` | Session revocation (SEC-17 auth). | Server-side only, never returned to any client. |
| `password_reset_tokens` | hashed reset tokens, tied to `user_id` | Password recovery. | Server-side only. |
| `impersonation_log` / `impersonation_action_log` | admin_id, target_user_id, target_name, target_role, method/path of actions taken | Audit trail for admin "View As" sessions (SEC-17 #7). | Admin-only (`/auth/impersonations`, `/auth/impersonation-actions`). |
| `doctor_profiles` | phone, license_number, medical_school, hospital_affiliation, consultation_fee, bio | Doctor's professional profile. | Self, admin, and (name/specialization/affiliation only, via search) any authenticated user — license_number is not exposed by any search endpoint. |
| `pharmacist_profiles` | phone, license_number, pharmacy_name, pharmacy_address | Pharmacist's professional profile. | Self, admin, limited public search (name/pharmacy only). |
| `laboratory_profiles` | phone, license_number, address, accreditation, website | Laboratory's professional profile. | Self, admin, limited public search. |
| `organizations` | owner_user_id, org registration details | Hospital/clinic/pharmacy/laboratory tenant registry — not personal data itself, but links an org to its owner's user row. | Admin (full), public (name/type only, for the hospital-affiliation search box). |

| `audit_log` | actor id/email/role, the admin behind an impersonated session, the patient whose record was involved, IP address, user agent | MON-12 — append-only record of sign-ins and failed sign-ins, permission changes, deletions, and who viewed which patient record. Also the source for answering a patient's "who accessed my data" request. | Admin only. **Append-only by privilege**: `corehealth_app` has `SELECT`/`INSERT` and no `UPDATE`/`DELETE`, so nothing reachable from a request can rewrite it. Metadata is validated on write to refuse credentials and clinical content (`server/utils/auditLog.ts`). |

Not personal data, included for completeness: `organization_members`,
`organization_specializations`, `idempotency_keys`, `platform_stats_cache`.

`medicines` and `suppliers` no longer appear in `public` at all — SEC-17 #4
moved them into each organisation's own `tenant_<slug>` schema, so one
pharmacy's stock and cost prices are not readable by another. They remain
commercial data, not personal data.

## clinical schema — PHI, RLS-defined (see caveat above) + app-layer checks

| Table | Personal data | Purpose | Who can access |
|---|---|---|---|
| `patient_profiles` | date_of_birth, gender, phone, address, emergency contact name/phone, blood_type, allergies, chronic_conditions, insurance provider/policy number | Patient medical profile — the most sensitive personal data in the system. | Self (patient), their treating doctor(s) via an active consultation, admin. Enforced today by explicit `queryAs`/ownership checks in controllers, not RLS (see caveat). |
| `medical_consultations` | patient_id, doctor_id, visit notes, diagnosis, treatment_description, prescription_file path, OCR'd text from uploaded prescriptions | The core clinical record — a visit. | Patient (own), assigned doctor, assigned pharmacist (for the prescription), admin. `getPatientHistory` explicitly checks `doctor_id = requester` for non-admins (SEC-17 #6 fix this session) rather than relying on RLS. |
| `consultation_medicines` | medicine name/dosage tied to a specific patient's consultation | Prescription line items. | Same access as the parent consultation. |
| `prescription_assignments` / `prescription_assignment_messages` | links a consultation's prescription to a specific pharmacy + free-text chat messages between pharmacist/patient/doctor | Pharmacy fulfillment workflow + its messaging thread. | Patient, assigned doctor, assigned pharmacist only. |
| `lab_requests` / `lab_request_messages` | patient_id, requested tests, report_file (PHI document), report_notes, messaging thread | Lab test ordering + results. | Patient, requesting doctor, assigned laboratory. Files served via ownership-checked endpoints, not a public static route (SEC-28 fix this session). |
| `lab_view_requests` / `data_access_requests` | which doctor/lab requested access to which patient's data, and why | Consent/access-request audit trail — this IS the access-control mechanism for cross-provider PHI sharing. | Patient (approve/deny), requesting party, admin. |
| `doctor_weekly_availability` / `doctor_availability_overrides` / `doctor_appointments` | appointment times tied to patient_id + doctor_id, booking notes | Scheduling. | Patient (own appointments), doctor (their schedule), admin. |
| `patient_reports` | patient-uploaded documents (not lab-originated), notes | Patient's own supplementary health records. | Patient (own), any doctor/lab the patient has an active data-access grant with. |
| `patient_vitals` | blood pressure, weight, glucose, etc., tied to patient_id | Vitals tracking. | Patient (own), treating doctor. |
| `notifications` | user_id, free-text message (may reference patient names/events) | In-app notification feed. | Recipient only. |

## Per-tenant schemas (`tenant_<slug>`) — operational data, patient_id is a soft link back to `clinical`

| Table | Personal data | Purpose | Who can access |
|---|---|---|---|
| `appointments` (hospital/clinic) | patient_id, notes | Tenant-local appointment records. | Org staff (doctor/admin of that org), the patient. |
| `admissions` (hospital/clinic) | patient_id, notes | Inpatient admission records. | Org staff, the patient. |
| `invoices` (hospital/clinic, pharmacy, laboratory) | patient_id, amount, status | Billing. | Org staff, the patient (their own invoices). |
| `sales` / `sale_items` (pharmacy) | customer_name (free text, not linked to a `users` row), medicine_id, quantity | Point-of-sale dispensing records — can include walk-in customers who aren't system users at all. | Pharmacy staff of that tenant only. **Currently NOT tenant-isolated for the `medicines` side of the join** — see SEC-17 #4 plan (`docs/sec-17-4-tenant-scope-inventory-plan.md`), the one confirmed-live gap in this inventory. |
| `orders` / `order_items` (pharmacy) | supplier_id, ordered_by (user_id) | Stock purchasing — not patient data, but ties to a staff user_id. | Pharmacy staff of that tenant only. |
| `sample_receipts` (laboratory) | lab_request_id (soft ref to a patient's request), received_by | Physical sample intake log. | Lab staff of that tenant only. |

## What this doc does NOT cover

- Infrastructure-level personal data (server logs, CDN/WAF logs, backups) —
  not visible from the schema, needs to be answered wherever those actually
  run (Railway today; AWS CloudWatch/S3 once deployed — SEC-27/SEC-34).
- Third-party processors (email/SMTP provider once SEC-17's password-reset
  mailer is configured with real SMTP credentials; any future payment
  processor) — add here once one is actually wired up.
