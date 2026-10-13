# Personal data inventory (SEC-30)

What tables hold personal data or PHI, what's in them, why, and who can
reach them. Generated from `corehealth_database.sql` — the schema file is
the source of truth; re-check this doc whenever that file changes.

## Important caveat: row-level security does not currently enforce anything

Several tables below are marked `RLS` — they have `FORCE ROW LEVEL SECURITY`
policies defined in the schema. **In the current deployment this provides
zero actual protection**, confirmed by querying `pg_roles` for the
connection the app uses: it connects as `postgres`, which has
`rolsuper = true` and `rolbypassrls = true`. Postgres superusers bypass RLS
entirely regardless of what policies exist. Every access control guarantee
below that says "RLS" is really enforced by application code (explicit
`WHERE` clauses, ownership checks in controllers) — RLS is defense-in-depth
that isn't currently defending anything. Fixing this means connecting as a
non-superuser role with `NOSUPERUSER` and `NOBYPASSRLS`, which is deployment
configuration, not a code change — flag this before AWS RDS is provisioned.

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

Not personal data, included for completeness: `medicines`, `suppliers`
(commercial catalog, SEC-17 #4's pending tenant-scoping work),
`organization_members`, `organization_specializations`.

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
