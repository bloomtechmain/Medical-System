# CoreHealth Multi-Tenant Database — Guide

> Reflects the exact current state of `corehealth_multitenant.sql` + `corehealth_seed.sql`.

---

## The Three Layers

```
+------------------------------------------------------------------------+
|  public schema                                                         |
|  Shared, low-risk data — identity, org registry, drug catalog         |
|  users · organizations · organization_members · *_profiles            |
|  medicines · suppliers                                                 |
+------------------------------------------------------------------------+
|  clinical schema                                                       |
|  ALL patient health information (PHI) — RLS-protected                 |
|  patient_profiles · medical_consultations · consultation_medicines    |
|  lab_requests (+ report_file, report_notes, vitals_extracted)         |
|  lab_view_requests · data_access_requests                             |
|  patient_reports · patient_vitals · notifications                     |
+------------------------------------------------------------------------+
|  tenant_<slug> schemas  (one per organisation)                         |
|  Data EXCLUSIVELY owned by one org — physically cannot cross           |
|  hospital    → appointments · admissions · invoices                   |
|  pharmacy    → orders · order_items · sales · sale_items ·            |
|                inventory_adjustments                                   |
|  laboratory  → test_catalog · sample_receipts · invoices              |
|  clinic      → appointments · invoices                                 |
+------------------------------------------------------------------------+
```

---

## Layer 1 — `public` Schema

No patient data here. Any authenticated user can read these tables.

| Table | What it stores |
|---|---|
| `public.users` | Every person's login — name, email, hashed password, role |
| `public.organizations` | Every hospital / pharmacy / lab / clinic in the system |
| `public.organization_members` | Which user belongs to which org and in what role |
| `public.doctor_profiles` | Specialisation, license, fee, hospital affiliation |
| `public.pharmacist_profiles` | Pharmacy name, address, license |
| `public.laboratory_profiles` | Lab name, services, accreditation, operating hours |
| `public.medicines` | Shared drug catalog used by all pharmacies |
| `public.suppliers` | Supplier contacts shared by all pharmacies |

---

## Layer 2 — `clinical` Schema

All patient health information lives here. **Row-Level Security (RLS)** enforces who can
see each row — the database engine does this automatically on every query.

| Table | What it stores | Who can see a row |
|---|---|---|
| `patient_profiles` | DOB, blood type, allergies, address, insurance | Patient (own) · Doctor (with consent) · Admin |
| `medical_consultations` | Doctor visits, diagnoses, prescription file, OCR text, status | Patient (own) · Doctor (own or same org) · Assigned pharmacist · Admin |
| `consultation_medicines` | Every medicine per consultation — manual or OCR-extracted | Cascades from parent consultation |
| `lab_requests` | Test request + **report file + vitals flag** (see below) | Patient (own) · Ordering doctor · The lab · Doctor with accepted view request · Admin |
| `lab_view_requests` | Doctor asks patient for permission to view a completed report | The doctor and patient on the request · Admin |
| `data_access_requests` | Doctor asks patient for permission to access a data category | The doctor and patient on the request · Admin |
| `patient_reports` | Files the patient uploaded themselves (PDFs, images) | Patient (own) · Doctor (with personal_reports consent) · Admin |
| `patient_vitals` | 23 vital fields — auto-extracted from lab reports or manually entered | Patient (own) · Doctor (with vitals or medical_history consent) · Lab (INSERT only) · Admin |
| `notifications` | In-app alerts for every workflow event | The recipient user only · Admin |

### `clinical.lab_requests` — request AND result in one place

The report file lives **here**, not in the lab's tenant schema, because the report is
**patient health data** — it belongs to the patient, survives lab org changes, and is
governed by the same RLS + permission system as every other clinical table.

```sql
clinical.lab_requests columns:
  id, doctor_id, patient_id, laboratory_id, organization_id,
  consultation_id, test_description, notes,
  status           VARCHAR(20)  -- 'pending' | 'in_progress' | 'completed'
  report_file      VARCHAR(500) -- filename set when lab uploads the PDF/image
  report_mimetype  VARCHAR(100) -- used for Content-Type header when serving
  report_notes     TEXT         -- lab's written summary of results
  vitals_extracted BOOLEAN      -- TRUE once backend ran OCR/PDF extraction
  created_at, updated_at
```

### The five `data_access_request` types

| access_type | What the doctor gets access to |
|---|---|
| `lab_reports` | Patient's lab request records + report files from `clinical.lab_requests` |
| `medical_history` | All consultations and prescribed medicines |
| `personal_reports` | Files the patient uploaded themselves |
| `contact_info` | Phone, address, emergency contact, insurance |
| `vitals` | Full vitals history from `clinical.patient_vitals` |

---

## Layer 3 — `tenant_<slug>` Schemas

One physical schema per organisation — created automatically by `provision_tenant()`.

### Hospital tenant

Schemas: `tenant_nawaloka` · `tenant_nat_hospital` · `tenant_lady_ridgeway`

| Table | What it stores |
|---|---|
| `appointments` | Scheduled outpatient visits (patient_id, doctor_id, scheduled_at, reason, status) |
| `admissions` | Inpatient records (patient_id, doctor_id, ward, bed_number, admitted_at, discharged_at, status) |
| `invoices` | Hospital billing (patient_id, consultation_id soft ref, admission_id soft ref, amount, status) |

### Pharmacy tenant

Schemas: `tenant_healthcare_pharmacy` · `tenant_medplus_pharmacy`

| Table | What it stores |
|---|---|
| `orders` | Purchase orders from suppliers (supplier_id, ordered_by, status, total_amount) |
| `order_items` | Line items on each order (order_id, medicine_id, quantity, unit_cost) |
| `sales` | Dispensing transactions (sold_by, customer_name, total_amount, payment_method) |
| `sale_items` | Medicines on each sale (sale_id, medicine_id, quantity, unit_price) |
| `inventory_adjustments` | Manual stock corrections (medicine_id, quantity_change, reason, adjusted_by) |

### Laboratory tenant

Schemas: `tenant_city_medical_lab` · `tenant_national_diagnostics`

| Table | What it stores |
|---|---|
| `test_catalog` | Tests this lab offers (test_code, test_name, price, turnaround_hours) |
| `sample_receipts` | Physical sample arrivals (lab_request_id soft ref, received_by, sample_type, condition) |
| `invoices` | Lab billing per request (lab_request_id soft ref, patient_id, amount, status) |

> **Lab report files are NOT in the lab tenant schema.**
> `report_file`, `report_mimetype`, `report_notes`, and `vitals_extracted` are columns on
> `clinical.lab_requests` — the report is patient PHI that belongs to the patient.

### Clinic tenant

Schemas: `tenant_janaka_clinic` · `tenant_nimal_clinic`

| Table | What it stores |
|---|---|
| `appointments` | Patient bookings at this clinic (patient_id, scheduled_at, reason, status) |
| `invoices` | Consultation billing (patient_id, consultation_id soft ref, appointment_id soft ref, amount, status) |

---

## `public.organizations` — The Tenant Registry

```
id | slug                   | name                        | org_type   | schema_name                   | owner_user_id
---+------------------------+-----------------------------+------------+-------------------------------+---------------
 1 | nawaloka               | Nawaloka Hospital           | hospital   | tenant_nawaloka               | NULL
 2 | nat_hospital           | National Hospital           | hospital   | tenant_nat_hospital           | NULL
 3 | lady_ridgeway          | Lady Ridgeway Hospital      | hospital   | tenant_lady_ridgeway          | NULL
 4 | healthcare_pharmacy    | HealthCare Pharmacy         | pharmacy   | tenant_healthcare_pharmacy    | NULL
 5 | medplus_pharmacy       | MedPlus Pharmacy            | pharmacy   | tenant_medplus_pharmacy       | NULL
 6 | city_medical_lab       | City Medical Laboratory     | laboratory | tenant_city_medical_lab       | NULL
 7 | national_diagnostics   | National Diagnostics        | laboratory | tenant_national_diagnostics   | NULL
 8 | janaka_clinic          | Janaka Medical Centre       | clinic     | tenant_janaka_clinic          | 2 (Dr. Janaka)
 9 | nimal_clinic           | Fernando Heart Clinic       | clinic     | tenant_nimal_clinic           | 3 (Dr. Nimal)
```

`schema_name` is how the backend knows which tenant schema to query.
Set automatically by `provision_tenant()` from the slug.

---

## Organisation Types — Tables Per Type

| org_type | owner_user_id | Tenant tables |
|---|---|---|
| `hospital` | NULL | `appointments` · `admissions` · `invoices` |
| `pharmacy` | NULL | `orders` · `order_items` · `sales` · `sale_items` · `inventory_adjustments` |
| `laboratory` | NULL | `test_catalog` · `sample_receipts` · `invoices` |
| `clinic` | Doctor's user_id | `appointments` · `invoices` |

---

## Doctor and Organisation — The Rules

Doctors are **not required** to belong to any organisation. The relationship is flexible:

| Scenario | Rows in `organization_members` |
|---|---|
| Works at one hospital | 1 row (role = doctor) |
| Works at two hospitals | 2 rows |
| Has personal clinic only | 1 row (role = owner) |
| Hospital + personal clinic | 2 rows |
| Fully independent | 0 rows |

From the seed data:
- **Dr. Janaka** — Nawaloka Hospital (doctor) + Janaka Medical Centre (owner)
- **Dr. Nimal** — National Hospital (doctor) + Fernando Heart Clinic (owner)
- **Dr. Kamani** — Lady Ridgeway Hospital (doctor) only — **no personal clinic, showing it is optional**

---

## Lab Report Workflow — Step by Step

All data stays inside the `clinical` schema — no cross-schema work needed.

```
Step 1  Doctor creates a lab request
        INSERT INTO clinical.lab_requests
          (doctor_id=2, patient_id=9, laboratory_id=7,
           organization_id=6, consultation_id=1,
           test_description='FBC, HbA1c, Lipid Profile',
           status='pending')

Step 2  Lab marks it in progress
        UPDATE clinical.lab_requests SET status='in_progress' WHERE id=1

Step 3  Lab uploads the report — result stored directly on the same row
        UPDATE clinical.lab_requests
        SET report_file     = 'lab_report_1_saman_cbc_hba1c.pdf',
            report_mimetype = 'application/pdf',
            report_notes    = 'FBC: WBC 6.8, Hb 13.2... HbA1c: 8.4%...',
            status          = 'completed',
            updated_at      = NOW()
        WHERE id=1

        Backend extracts vitals from the PDF → saves to clinical.patient_vitals
        INSERT INTO clinical.patient_vitals
          (patient_id=9, hba1c=8.4, blood_glucose=148, hemoglobin=13.2, ...,
           source='lab_report', lab_request_id=1)

        UPDATE clinical.lab_requests SET vitals_extracted=TRUE WHERE id=1

Step 4  Patient views their own report
        SELECT report_file, report_notes FROM clinical.lab_requests WHERE id=1
        RLS enforces patient_id = app_uid() — no extra WHERE needed

Step 5  Doctor requests permission to view the report
        INSERT INTO clinical.lab_view_requests
          (lab_request_id=1, doctor_id=2, patient_id=9, status='pending')
        Patient receives a notification.

Step 6  Patient approves
        UPDATE clinical.lab_view_requests SET status='accepted' WHERE id=1
        Doctor receives a notification.

Step 7  Doctor downloads the file — one JOIN, all in clinical
        SELECT lr.report_file, lr.report_mimetype
        FROM   clinical.lab_view_requests lvr
        JOIN   clinical.lab_requests lr ON lr.id = lvr.lab_request_id
        WHERE  lvr.id=1 AND lvr.doctor_id=2 AND lvr.status='accepted'
```

---

## Patient Vitals Workflow

`clinical.patient_vitals` holds 23 vital fields and is populated two ways:

**Auto-extracted — `source = 'lab_report'`**
After the lab uploads a report the backend runs OCR (image) or PDF text extraction,
regex-matches vital patterns, and inserts a row linked via `lab_request_id`.

**Manually entered — `source = 'manual'`**
Patient enters their own readings. The backend upserts today's manual record.

RLS policy (`pv_sel`):

```sql
app_role() = 'admin'
OR patient_id = app_uid()
OR (app_role() = 'doctor'
    AND has_consent(patient_id, ARRAY['vitals','medical_history']))
```

Lab users can INSERT vitals (`pv_mod` allows `app_role() = 'laboratory'` to write)
but cannot SELECT other patients' records.

---

## RLS — How It Works Per Request

The backend calls **one function** right after JWT verification:

```sql
SELECT clinical.set_context(
  9,         -- logged-in user id
  NULL,      -- org id (NULL for patients)
  'patient'  -- role
);
```

Every subsequent query on any `clinical` table is automatically filtered by the policies.
No manual `WHERE` clauses are needed in application code.

Helper functions used inside policies:

```sql
public.app_uid()                                  -- current user id
public.app_org()                                  -- current org id
public.app_role()                                 -- current role string
clinical.has_consent(patient_id, ARRAY['vitals']) -- TRUE if doctor holds accepted access
```

---

## Provisioning a New Tenant

```sql
-- Hospital, pharmacy, or lab
SELECT public.provision_tenant('sunrise_hospital', 'Sunrise Hospital',     'hospital');
SELECT public.provision_tenant('sunrise_pharmacy', 'Sunrise Pharmacy',     'pharmacy');
SELECT public.provision_tenant('sunrise_lab',      'Sunrise Diagnostics',  'laboratory');

-- Doctor's personal clinic (4th arg = the doctor's user_id)
SELECT public.provision_tenant('perera_clinic', 'Perera Medical Centre', 'clinic', 42);
```

What `provision_tenant()` does:
1. `INSERT INTO public.organizations` (sets `owner_user_id` for clinic type)
2. `CREATE SCHEMA tenant_<slug>`
3. `CREATE ROLE tn_<slug> NOLOGIN` (isolated DB role)
4. Creates the type-specific tables inside the schema
5. Grants `corehealth_app` role full access to the new schema

Then add the membership row:

```sql
INSERT INTO public.organization_members (organization_id, user_id, member_role)
SELECT id, 42, 'owner' FROM public.organizations WHERE slug = 'perera_clinic';
```

---

## Backend Code Patterns

### Set context per request

```typescript
const member = await pool.query(
  'SELECT organization_id FROM public.organization_members WHERE user_id=$1 LIMIT 1',
  [req.user.id]
);
const orgId = member.rows[0]?.organization_id ?? null;
await pool.query('SELECT clinical.set_context($1,$2,$3)', [req.user.id, orgId, req.user.role]);
```

### Get a tenant schema name

```typescript
// Always read from DB — never build from user input
const { rows } = await pool.query(
  'SELECT schema_name FROM public.organizations WHERE id=$1', [orgId]
);
const schema = rows[0].schema_name; // e.g. 'tenant_healthcare_pharmacy'
```

### Lab uploads a report

```typescript
// 1. Update the clinical row with file + mark completed
await pool.query(
  `UPDATE clinical.lab_requests
   SET report_file=$1, report_mimetype=$2, report_notes=$3,
       status='completed', updated_at=NOW()
   WHERE id=$4`,
  [filename, mimetype, notes, labRequestId]
);

// 2. Extract vitals and save into clinical
await pool.query(
  `INSERT INTO clinical.patient_vitals
     (patient_id, hemoglobin, hba1c, blood_glucose, ..., source, lab_request_id)
   VALUES ($1, $2, $3, $4, ..., 'lab_report', $5)`,
  [patientId, hb, hba1c, glucose, labRequestId]
);

// 3. Mark extraction done
await pool.query(
  'UPDATE clinical.lab_requests SET vitals_extracted=TRUE WHERE id=$1', [labRequestId]
);
```

### Patient downloads their own report

```typescript
// RLS enforces patient_id = app_uid() automatically — no extra WHERE
const { rows } = await pool.query(
  'SELECT report_file, report_mimetype FROM clinical.lab_requests WHERE id=$1',
  [labRequestId]
);
if (!rows.length || !rows[0].report_file)
  return res.status(404).json({ message: 'Report not available' });

res.setHeader('Content-Type', rows[0].report_mimetype || 'application/octet-stream');
res.sendFile(path.join(uploadsDir, rows[0].report_file));
```

### Doctor downloads a report (requires accepted `lab_view_request`)

```typescript
// One JOIN — both tables are in clinical, no tenant schema needed
const { rows } = await pool.query(
  `SELECT lr.report_file, lr.report_mimetype
   FROM   clinical.lab_view_requests lvr
   JOIN   clinical.lab_requests lr ON lr.id = lvr.lab_request_id
   WHERE  lvr.id=$1 AND lvr.doctor_id=$2 AND lvr.status='accepted'`,
  [viewRequestId, req.user.id]
);
if (!rows.length) return res.status(403).json({ message: 'Access denied' });

res.setHeader('Content-Type', rows[0].report_mimetype || 'application/octet-stream');
res.sendFile(path.join(uploadsDir, rows[0].report_file));
```

---

## Key Rules

1. **Lab report files belong in `clinical.lab_requests`** — `report_file`, `report_mimetype`, `report_notes`, `vitals_extracted` are all columns there. The report is patient PHI, not lab-owned data.

2. **Lab tenant schema = lab OPERATIONS only** — `test_catalog`, `sample_receipts`, `invoices`. Nothing patient-owned goes here.

3. **`clinical.patient_vitals` is PHI** — auto-populated after lab upload via OCR/PDF extraction, also manually entered by patients. `lab_request_id` links a vitals row back to the report that generated it.

4. **`data_access_requests` has 5 types** — `lab_reports`, `medical_history`, `personal_reports`, `contact_info`, `vitals`. Each approved separately by the patient.

5. **Serving a lab file needs one query, no cross-schema work** — `SELECT report_file FROM clinical.lab_requests WHERE id=$1`. RLS handles the access check.

6. **Doctors need an accepted `lab_view_request`** to read a report. Join `lab_view_requests` to `lab_requests` — both are in clinical.

7. **Always call `set_context` before any clinical query** — without it RLS sees NULL and blocks everything (safe-fail by design).

8. **Never build a schema name from user input** — always read `schema_name` from `public.organizations`.

9. **Doctors do not need an org** — org membership is zero to many.

10. **Patients and admins have no org** — pass NULL for `org_id` in their `set_context` call.

---

## Tenant Schema Summary

```
+-------------------------------+----------+----------------------------------------------+-------------------------------------+
| Tenant Schema                 | Org type | Tables                                       | Seed data (section 8.9)             |
+-------------------------------+----------+----------------------------------------------+-------------------------------------+
| tenant_nawaloka               | hospital | appointments · admissions · invoices         | 3 appts · 1 admission · 3 invoices  |
| tenant_nat_hospital           | hospital | appointments · admissions · invoices         | 1 appt · 1 invoice                  |
| tenant_lady_ridgeway          | hospital | appointments · admissions · invoices         | 1 appt · 1 invoice                  |
| tenant_healthcare_pharmacy    | pharmacy | orders · order_items · sales · sale_items    | 4 orders · 3 sales · 3 adjustments  |
|                               |          | · inventory_adjustments                      |                                     |
| tenant_medplus_pharmacy       | pharmacy | orders · order_items · sales · sale_items    | 2 sales · 2 adjustments             |
|                               |          | · inventory_adjustments                      |                                     |
| tenant_city_medical_lab       | lab      | test_catalog · sample_receipts · invoices    | 8 tests · 2 samples · 2 invoices    |
| tenant_national_diagnostics   | lab      | test_catalog · sample_receipts · invoices    | 8 tests · 1 sample · 2 invoices     |
| tenant_janaka_clinic          | clinic   | appointments · invoices                      | 2 appts · 2 invoices                |
| tenant_nimal_clinic           | clinic   | appointments · invoices                      | 1 appt · 1 invoice                  |
+-------------------------------+----------+----------------------------------------------+-------------------------------------+
```

No tenant schema for patients, individual doctors, pharmacists, or lab users — they are
people, not organisations.

---

## Seed Data — All Users

Password for every account: **admin123**

| Role | Name | Email | Org memberships |
|---|---|---|---|
| admin | System Admin | admin@corehealth.lk | None |
| doctor | Dr. Janaka Perera | dr.janaka@corehealth.lk | Nawaloka Hospital (doctor) + Janaka Medical Centre (owner) |
| doctor | Dr. Nimal Fernando | dr.nimal@corehealth.lk | National Hospital (doctor) + Fernando Heart Clinic (owner) |
| doctor | Dr. Kamani Silva | dr.kamani@corehealth.lk | Lady Ridgeway Hospital (doctor) only |
| pharmacist | Sunil Rathnayake | sunil@pharma.lk | HealthCare Pharmacy |
| pharmacist | Dilani Wijesinghe | dilani@pharma.lk | MedPlus Pharmacy |
| laboratory | City Medical Lab | info@citylab.lk | City Medical Laboratory |
| laboratory | National Diagnostics | lab@nationaldiag.lk | National Diagnostics |
| patient | Saman Kumara | saman@gmail.com | None |
| patient | Priya Wickramasinghe | priya@gmail.com | None |
| patient | Ashan Dissanayake | ashan@gmail.com | None |
| patient | Malini Jayawardena | malini@gmail.com | None |

## Seed Data — Clinical Records

| Table | Rows | Detail |
|---|---|---|
| `clinical.patient_profiles` | 4 | Patients 9–12 with allergies, blood type, insurance |
| `clinical.medical_consultations` | 5 | 3 hospitals + 1 personal clinic + 1 self-recorded |
| `clinical.consultation_medicines` | 10 | Linked to consultations 1–5 |
| `clinical.lab_requests` | 4 | 2 completed (with report_file + report_notes + vitals_extracted=TRUE) · 1 in_progress · 1 pending |
| `clinical.lab_view_requests` | 2 | 1 accepted (lab_req 1, Dr. Janaka ↔ Saman) · 1 pending (lab_req 4) |
| `clinical.data_access_requests` | 4 | accepted · pending · pending · declined across 3 doctor-patient pairs |
| `clinical.patient_vitals` | 3 | 2 lab-extracted (lab_req 1 for Saman, lab_req 4 for Malini) · 1 manual (Saman) |
| `clinical.notifications` | 9 | All workflow events covered |

## Seed Data — Tenant Records

| Tenant | Table | Rows | What they represent |
|---|---|---|---|
| tenant_city_medical_lab | `test_catalog` | 8 | FBC · HbA1c · FBG · Lipid · RFT · LFT · CRP · Sputum Culture |
| tenant_city_medical_lab | `sample_receipts` | 2 | Samples for lab_req 1 (blood) and lab_req 3 (sputum) |
| tenant_city_medical_lab | `invoices` | 2 | lab_req 1 paid · lab_req 3 pending |
| tenant_national_diagnostics | `test_catalog` | 8 | ESR · RF · Anti-CCP · ECG · Echo · FBC · Renal · Histopath |
| tenant_national_diagnostics | `sample_receipts` | 1 | Sample for lab_req 4 (blood) |
| tenant_national_diagnostics | `invoices` | 2 | lab_req 4 paid · lab_req 2 pending |
| tenant_nawaloka | `appointments` | 3 | Patients 9 · 10 · 12 |
| tenant_nawaloka | `admissions` | 1 | Saman admitted then discharged |
| tenant_nawaloka | `invoices` | 3 | Saman paid · Priya pending · Malini pending |
| tenant_nat_hospital | `appointments` | 1 | Priya pre-op cardiac |
| tenant_nat_hospital | `invoices` | 1 | Priya paid |
| tenant_lady_ridgeway | `appointments` | 1 | Malini rheumatology follow-up |
| tenant_lady_ridgeway | `invoices` | 1 | Malini pending |
| tenant_healthcare_pharmacy | `orders` | 4 | 3 received · 1 pending |
| tenant_healthcare_pharmacy | `sales` | 3 | Saman · Priya · walk-in |
| tenant_healthcare_pharmacy | `inventory_adjustments` | 3 | 2 write-offs · 1 restock |
| tenant_medplus_pharmacy | `sales` | 2 | Ashan · Malini |
| tenant_medplus_pharmacy | `inventory_adjustments` | 2 | 1 write-off · 1 restock |
| tenant_janaka_clinic | `appointments` | 2 | Ashan follow-up · Saman annual review |
| tenant_janaka_clinic | `invoices` | 2 | Ashan paid · Saman pending |
| tenant_nimal_clinic | `appointments` | 1 | Priya Echo review |
| tenant_nimal_clinic | `invoices` | 1 | Priya pending |
