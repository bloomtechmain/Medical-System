-- =============================================================================
-- Core Health – Seed Migration of existing sample data into the new layout
-- Run AFTER corehealth_multitenant.sql, in the same database.
-- Preserves all original IDs and cross-references.
-- =============================================================================
SET search_path = public, clinical;

-- 8.1 Users (same order -> ids 1..12, matching all downstream references)
INSERT INTO public.users (name, email, password, role) VALUES
  ('System Admin',        'admin@gmail.com',        '$2a$10$iRvGN/NlfdNmjgNU10wJNOYgd4nWE74bwQ11DuTzZR3bg5PZ5Vvee', 'admin'),
  ('Dr. Janaka Perera',   'dr.janaka@corehealth.lk','$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'doctor'),
  ('Dr. Nimal Fernando',  'dr.nimal@corehealth.lk', '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'doctor'),
  ('Dr. Kamani Silva',    'dr.kamani@corehealth.lk','$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'doctor'),
  ('Sunil Rathnayake',    'sunil@pharma.lk',        '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'pharmacist'),
  ('Dilani Wijesinghe',   'dilani@pharma.lk',       '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'pharmacist'),
  ('City Medical Lab',    'info@citylab.lk',        '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'laboratory'),
  ('National Diagnostics','lab@nationaldiag.lk',    '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'laboratory'),
  ('Saman Kumara',        'saman@gmail.com',        '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'patient'),
  ('Priya Wickramasinghe','priya@gmail.com',        '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'patient'),
  ('Ashan Dissanayake',   'ashan@gmail.com',        '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'patient'),
  ('Malini Jayawardena',  'malini@gmail.com',       '$2a$10$k0ySTFcD6IepYSDihy6OOuISQsBtIIhMwTeQ6w55DXomF7Qsit8GK', 'patient');

-- 8.2 Staff profiles
INSERT INTO public.doctor_profiles (user_id, phone, specialization, license_number, medical_school, years_experience, hospital_affiliation, consultation_fee, bio) VALUES
  (2, '+94771234567', 'General Physician', 'SLMC-2018-0452', 'University of Colombo Faculty of Medicine',   8,  'Nawaloka Hospital, Colombo',   2500.00, 'Experienced general physician specialising in preventive medicine and chronic disease management.'),
  (3, '+94772345678', 'Cardiologist',      'SLMC-2012-0211', 'University of Kelaniya Faculty of Medicine',  14, 'National Hospital Sri Lanka',  4500.00, 'Consultant cardiologist with expertise in interventional cardiology and heart failure management.'),
  (4, '+94773456789', 'Pediatrician',      'SLMC-2015-0387', 'University of Peradeniya Faculty of Medicine',10, 'Lady Ridgeway Hospital, Colombo',3500.00,'Dedicated pediatrician providing comprehensive child healthcare from newborns to adolescents.');

INSERT INTO public.pharmacist_profiles (user_id, phone, license_number, pharmacy_name, pharmacy_address, years_experience, specialization_area) VALUES
  (5, '+94760111222', 'SPC-2019-0089', 'HealthCare Pharmacy', '45 Galle Road, Colombo 03', 6, 'Clinical Pharmacy'),
  (6, '+94760222333', 'SPC-2020-0145', 'MedPlus Pharmacy',    '12 Kandy Road, Nugegoda',   5, 'Dispensing Pharmacy');

INSERT INTO public.laboratory_profiles (user_id, phone, lab_name, lab_type, license_number, accreditation, address, services_offered, operating_hours) VALUES
  (7, '+94112345678', 'City Medical Laboratory', 'Multi-Discipline', 'LAB-2016-0033', 'ISO 15189:2012', '78 Union Place, Colombo 02',   'Full Blood Count, Lipid Profile, Liver Function, Renal Function, Blood Glucose, HbA1c, Thyroid, Urine Analysis, PCR', 'Mon–Sat 07:00–18:00'),
  (8, '+94113456789', 'National Diagnostics',    'Pathology',        'LAB-2014-0019', 'ISO 15189:2012', '23 Baseline Road, Colombo 08', 'Histopathology, Cytology, Microbiology, Biochemistry, Haematology, Immunology, Hormone Assay',                       'Mon–Sun 06:00–20:00');

-- 8.3 Suppliers + shared medicine catalog
INSERT INTO public.suppliers (name, contact, phone, email, address) VALUES
  ('PharmaCo Lanka (Pvt) Ltd', 'Ruwan Senanayake',   '+94112223344', 'orders@pharmacolanka.lk',  '125 Sir James Pieris Mawatha, Colombo 02'),
  ('MediSupply Solutions',     'Tharanga Bandara',   '+94114455667', 'supply@medisupply.lk',     '67 Vauxhall Street, Colombo 02'),
  ('CeylonPharma Distributors','Lasantha Gunatilake','+94115566778', 'sales@ceylonpharma.lk',    '22 Havelock Road, Colombo 05'),
  ('HealthLine Imports Ltd',   'Nimasha Ratnasiri',  '+94116677889', 'info@healthlineimports.lk','90 D.R. Wijewardena Mawatha, Colombo 10');

INSERT INTO public.medicines (name, generic_name, category, description, unit, price, cost_price, stock_quantity, reorder_level, expiry_date, supplier_id) VALUES
  ('Panadol 500mg','Paracetamol','Analgesic','Pain reliever and fever reducer','tablet',8.50,4.00,500,50,'2026-12-31',1),
  ('Amoxicillin 500mg','Amoxicillin','Antibiotic','Broad-spectrum penicillin antibiotic','capsule',22.00,11.00,300,30,'2026-06-30',1),
  ('Metformin 500mg','Metformin HCl','Antidiabetic','First-line medication for type 2 diabetes','tablet',12.00,6.00,400,40,'2027-03-31',2),
  ('Amlodipine 5mg','Amlodipine Besylate','Antihypertensive','Calcium channel blocker for high blood pressure','tablet',18.00,9.00,350,35,'2027-01-31',2),
  ('Atorvastatin 10mg','Atorvastatin Calcium','Statin','Lowers cholesterol and reduces cardiovascular risk','tablet',25.00,12.00,250,25,'2026-09-30',3),
  ('Omeprazole 20mg','Omeprazole','PPI','Proton pump inhibitor for acid-related disorders','capsule',15.00,7.00,280,30,'2026-11-30',3),
  ('Cetirizine 10mg','Cetirizine HCl','Antihistamine','Non-drowsy antihistamine for allergies','tablet',10.00,4.50,320,30,'2027-02-28',1),
  ('Ibuprofen 400mg','Ibuprofen','NSAID','Anti-inflammatory pain reliever','tablet',9.00,4.00,420,40,'2027-04-30',2),
  ('Azithromycin 250mg','Azithromycin','Antibiotic','Macrolide antibiotic for respiratory infections','tablet',45.00,22.00,150,20,'2026-08-31',4),
  ('Salbutamol 2mg','Salbutamol Sulphate','Bronchodilator','Short-acting bronchodilator for asthma relief','tablet',14.00,6.50,180,20,'2026-10-31',4),
  ('Vitamin C 500mg','Ascorbic Acid','Vitamin','Vitamin C supplement for immune support','tablet',6.00,2.50,600,60,'2027-06-30',1),
  ('Metronidazole 400mg','Metronidazole','Antibiotic','Antibiotic for bacterial and protozoal infections','tablet',11.00,5.00,240,25,'2026-07-31',2),
  ('Losartan 50mg','Losartan Potassium','Antihypertensive','ARB for hypertension and diabetic nephropathy','tablet',22.00,10.00,200,25,'2027-05-31',3),
  ('Pantoprazole 40mg','Pantoprazole Sodium','PPI','Proton pump inhibitor for GERD treatment','tablet',20.00,9.00,260,30,'2027-01-31',3),
  ('Paracetamol Syrup 120mg','Paracetamol','Analgesic','Paracetamol suspension for children','bottle',65.00,30.00,80,10,'2026-05-31',1),
  ('Prednisolone 5mg','Prednisolone','Corticosteroid','Anti-inflammatory corticosteroid','tablet',16.00,7.50,120,15,'2026-12-31',4),
  ('Glibenclamide 5mg','Glibenclamide','Antidiabetic','Sulfonylurea for type 2 diabetes','tablet',13.00,6.00,170,20,'2027-02-28',2),
  ('Warfarin 1mg','Warfarin Sodium','Anticoagulant','Blood thinner to prevent clot formation','tablet',18.00,8.50,90,15,'2026-11-30',4),
  ('Ferrous Sulphate 200mg','Ferrous Sulphate','Iron Supplement','Iron supplement for iron-deficiency anaemia','tablet',7.00,3.00,350,40,'2027-03-31',1),
  ('Folic Acid 5mg','Folic Acid','Vitamin','B-vitamin for cell growth and anaemia prevention','tablet',5.00,2.00,400,40,'2027-04-30',1);

-- 8.4 Provision tenant organisations
-- Hospitals, pharmacies, and labs (no owner)
SELECT public.provision_tenant('nawaloka',            'Nawaloka Hospital, Colombo',     'hospital');
SELECT public.provision_tenant('nat_hospital',        'National Hospital Sri Lanka',    'hospital');
SELECT public.provision_tenant('lady_ridgeway',       'Lady Ridgeway Hospital, Colombo','hospital');
SELECT public.provision_tenant('healthcare_pharmacy', 'HealthCare Pharmacy',            'pharmacy');
SELECT public.provision_tenant('medplus_pharmacy',    'MedPlus Pharmacy',               'pharmacy');
SELECT public.provision_tenant('city_medical_lab',    'City Medical Laboratory',        'laboratory');
SELECT public.provision_tenant('national_diagnostics','National Diagnostics',           'laboratory');

-- Personal clinics — each owned by a specific doctor (p_owner_id = doctor user_id)
-- Dr. Janaka Perera (user_id=2): also runs his own clinic alongside hospital work
SELECT public.provision_tenant('janaka_clinic',  'Janaka Medical Centre, Colombo',  'clinic', 2);
-- Dr. Nimal Fernando (user_id=3): specialist heart clinic in addition to hospital
SELECT public.provision_tenant('nimal_clinic',   'Fernando Heart Clinic, Colombo',  'clinic', 3);
-- Dr. Kamani Silva (user_id=4): works only at Lady Ridgeway — NO personal clinic
-- (demonstrates that personal clinic is optional, not required)

-- 8.5 Org membership (which staff user belongs to which org)
--
-- Rules demonstrated here:
--   • Dr. Janaka  → member of Nawaloka Hospital (doctor)
--                   + owner of Janaka Medical Centre (personal clinic)
--   • Dr. Nimal   → member of National Hospital (doctor)
--                   + owner of Fernando Heart Clinic (personal clinic)
--   • Dr. Kamani  → member of Lady Ridgeway Hospital (doctor) ONLY
--                   (no personal clinic — membership is optional)
--   • Pharmacists → each belongs to one pharmacy (owner)
--   • Labs        → each belongs to one lab org (laboratory)
INSERT INTO public.organization_members (organization_id, user_id, member_role)
SELECT o.id, m.user_id, m.member_role
FROM (VALUES
  -- Hospital memberships
  ('nawaloka',           2, 'doctor'),
  ('nat_hospital',       3, 'doctor'),
  ('lady_ridgeway',      4, 'doctor'),
  -- Personal clinic ownership (same doctor, different org, role = owner)
  ('janaka_clinic',      2, 'owner'),
  ('nimal_clinic',       3, 'owner'),
  -- Pharmacist and lab memberships
  ('healthcare_pharmacy',5, 'pharmacist'),
  ('medplus_pharmacy',   6, 'pharmacist'),
  ('city_medical_lab',   7, 'laboratory'),
  ('national_diagnostics',8,'laboratory')
) AS m(slug, user_id, member_role)
JOIN public.organizations o ON o.slug = m.slug;

-- 8.6 Patient profiles (PHI -> clinical)
INSERT INTO clinical.patient_profiles (user_id, date_of_birth, gender, phone, address, emergency_contact_name, emergency_contact_phone, blood_type, allergies, chronic_conditions, insurance_provider, insurance_policy_number) VALUES
  (9, '1990-03-15','male',  '+94771111111','12 Temple Road, Maharagama',  'Kumara Silva',  '+94771111112','B+', 'Penicillin',        'Type 2 Diabetes, Hypertension','AIA Insurance',  'AIA-2022-009871'),
  (10,'1985-07-22','female','+94772222222','34 Lake View, Boralesgamuwa', 'Kamal Wickrama','+94772222223','O+', NULL,                'Asthma',                       'Union Assurance','UA-2021-003344'),
  (11,'1998-11-08','male',  '+94773333333','56 New Street, Kelaniya',     'Pradeep Dissa', '+94773333334','A-', NULL,                NULL,                           NULL,             NULL),
  (12,'1975-05-30','female','+94774444444','89 Lotus Road, Kotte',        'Roshan Jayaw',  '+94774444445','AB+','Sulfa drugs, Latex', 'Rheumatoid Arthritis',         'Ceylinco Life',  'CL-2020-007712');

-- 8.7 Consultations (PHI -> clinical). organization_id resolved by slug; NULL for patient self-record.
INSERT INTO clinical.medical_consultations
  (id, patient_id, doctor_id, assigned_pharmacist_id, organization_id, visit_date, doctor_name, hospital_clinic, sick_description, diagnosis, treatment_description, status, lab_tests_requested) VALUES
  (1, 9, 2, 5, (SELECT id FROM public.organizations WHERE slug='nawaloka'),      '2026-05-10','Janaka Perera','Nawaloka Hospital, Colombo',
     'Persistent high blood sugar readings, fatigue, increased thirst and frequent urination',
     'Type 2 Diabetes – poorly controlled. HbA1c likely elevated.',
     'Increased Metformin to 1000mg twice daily. Dietary counselling. Review in 4 weeks.',
     'dispensed','Full Blood Count, HbA1c, Fasting Blood Glucose, Lipid Profile, Renal Function Test'),
  (2, 10, 3, 5, (SELECT id FROM public.organizations WHERE slug='nat_hospital'),  '2026-05-20','Nimal Fernando','National Hospital Sri Lanka',
     'Chest tightness, shortness of breath on exertion, mild ankle oedema',
     'Suspected hypertensive heart disease. Requires ECG and echocardiogram.',
     'Started Amlodipine 5mg OD. Restricted sodium intake. Refer for cardiology workup.',
     'active','ECG, Echocardiogram, Full Blood Count, Renal Profile, Lipid Profile'),
  (3, 12, 4, 6, (SELECT id FROM public.organizations WHERE slug='lady_ridgeway'), '2026-05-25','Kamani Silva','Lady Ridgeway Hospital, Colombo',
     'Generalised joint pain, morning stiffness lasting more than 1 hour, bilateral wrist swelling',
     'Rheumatoid Arthritis – active disease. RF positive.',
     'Prednisolone 10mg OD for 2 weeks then taper. Methotrexate to be considered. Physio referral.',
     'active','ESR, CRP, Rheumatoid Factor, Anti-CCP Antibody, Full Blood Count, Liver Function Test'),
  (4, 11, NULL, NULL, NULL, '2026-04-15','Dr. Suresh (Private)','Sunshine Clinic, Kelaniya',
     'Fever, sore throat, body aches for 3 days','Viral pharyngitis',
     'Paracetamol 500mg TDS, plenty of fluids, rest for 3 days','completed',NULL),
  -- Consultation at Dr. Janaka's PERSONAL clinic (organization_id = janaka_clinic)
  -- Shows doctor working at his own medical centre, not a hospital
  (5, 11, 2, 5, (SELECT id FROM public.organizations WHERE slug='janaka_clinic'),  '2026-05-28','Janaka Perera','Janaka Medical Centre, Colombo',
     'Follow-up for chronic cough, productive with yellowish sputum, 5-day history',
     'Lower respiratory tract infection. Rule out pneumonia.',
     'Azithromycin 500mg OD × 5 days. Salbutamol inhaler PRN. Chest X-ray ordered.',
     'active','Full Blood Count, Sputum Culture and Sensitivity, CRP');
SELECT setval(pg_get_serial_sequence('clinical.medical_consultations','id'), 5, true);

INSERT INTO clinical.consultation_medicines (consultation_id, medicine_name, dosage, frequency, duration, source) VALUES
  (1,'Metformin 500mg','1000mg','Twice daily','90 days','manual'),
  (1,'Atorvastatin 10mg','10mg','Once at night','90 days','manual'),
  (1,'Vitamin C 500mg','500mg','Once daily','30 days','manual'),
  (2,'Amlodipine 5mg','5mg','Once daily','30 days','manual'),
  (3,'Prednisolone 5mg','10mg','Once daily','14 days','manual'),
  (3,'Omeprazole 20mg','20mg','Once daily','14 days','manual'),
  (4,'Paracetamol 500mg','500mg','Three times daily','3 days','manual'),
  (4,'Cetirizine 10mg','10mg','Once at night','5 days','manual'),
  (5,'Azithromycin 250mg','500mg','Once daily','5 days','manual'),
  (5,'Salbutamol 2mg','2mg','As needed','14 days','manual');

-- 8.8 Lab requests (PHI -> clinical).
-- The report file + notes for completed requests live HERE in clinical.lab_requests
-- because the report is patient PHI — it belongs to the patient, not to the lab org.
-- vitals_extracted=TRUE means the backend already ran OCR/PDF extraction and wrote
-- the results into clinical.patient_vitals.
INSERT INTO clinical.lab_requests
  (id, doctor_id, patient_id, laboratory_id, organization_id, consultation_id,
   test_description, status,
   report_file, report_mimetype, report_notes, vitals_extracted)
VALUES
  -- Completed: Saman, City Medical Lab
  (1, 2, 9, 7,
   (SELECT id FROM public.organizations WHERE slug='city_medical_lab'), 1,
   'Full Blood Count, HbA1c, Fasting Blood Glucose, Lipid Profile, Renal Function Test',
   'completed',
   'lab_report_1_saman_cbc_hba1c.pdf', 'application/pdf',
   'Full Blood Count: WBC 6.8, RBC 4.9, Hb 13.2 g/dL, Platelets 210. '
   'HbA1c: 8.4% — poorly controlled T2DM. FBG: 148 mg/dL. '
   'Lipid Profile: Total Chol 220, HDL 42, LDL 138, TG 195 mg/dL (borderline high LDL). '
   'Renal Function: Creatinine 0.9 mg/dL — normal.',
   TRUE),

  -- Pending: Priya, National Diagnostics (no report yet)
  (2, 3, 10, 8,
   (SELECT id FROM public.organizations WHERE slug='national_diagnostics'), 2,
   'ECG, Echocardiogram, Full Blood Count, Renal Profile, Lipid Profile',
   'pending',
   NULL, NULL, NULL, FALSE),

  -- In progress: Ashan, City Medical Lab (no report yet)
  (3, 2, 11, 7,
   (SELECT id FROM public.organizations WHERE slug='city_medical_lab'), 5,
   'Full Blood Count, Sputum Culture and Sensitivity, CRP',
   'in_progress',
   NULL, NULL, NULL, FALSE),

  -- Completed: Malini, National Diagnostics
  (4, 3, 12, 8,
   (SELECT id FROM public.organizations WHERE slug='national_diagnostics'), NULL,
   'ESR, CRP, Rheumatoid Factor, Anti-CCP Antibody, Full Blood Count, Liver Function Test',
   'completed',
   'lab_report_4_malini_ra_panel.pdf', 'application/pdf',
   'ESR: 68 mm/hr (elevated). CRP: 42 mg/L (elevated). '
   'Rheumatoid Factor: 96 IU/mL (positive). Anti-CCP Antibody: 210 U/mL (strongly positive). '
   'FBC: WBC 9.1, Hb 11.8 g/dL (mild anaemia of chronic disease), Platelets 320. '
   'Impression: Active Rheumatoid Arthritis. Strongly recommend DMARD therapy.',
   TRUE);

SELECT setval(pg_get_serial_sequence('clinical.lab_requests','id'), 4, true);

-- 8.8b Patient vitals (PHI -> clinical)
-- Rows with source='lab_report' are auto-extracted after a lab uploads a report.
-- lab_request_id is a soft ref linking vitals back to the request that generated them.
INSERT INTO clinical.patient_vitals
  (patient_id, wbc, rbc, hemoglobin, hematocrit, platelets,
   blood_glucose, hba1c, creatinine,
   cholesterol, hdl, ldl, triglycerides,
   bp_systolic, bp_diastolic, heart_rate, temperature, oxygen_saturation,
   source, lab_request_id, notes, recorded_at)
VALUES
  -- Saman (patient 9): extracted from lab_request 1 (City Medical Lab, completed)
  (9, 6.8, 4.9, 13.2, 40.1, 210,
   148.0, 8.4, 0.9,
   220.0, 42.0, 138.0, 195.0,
   138, 88, 78, 36.8, 98.0,
   'lab_report', 1,
   'HbA1c elevated — poorly controlled T2DM. LDL borderline high.',
   NOW() - INTERVAL '22 days'),

  -- Saman (patient 9): manual entry one week later (patient entered own basic vitals)
  (9, NULL, NULL, NULL, NULL, NULL,
   132.0, NULL, NULL,
   NULL, NULL, NULL, NULL,
   135, 86, 76, 36.7, 99.0,
   'manual', NULL,
   'Home monitoring — post medication adjustment.',
   NOW() - INTERVAL '14 days'),

  -- Malini (patient 12): extracted from lab_request 4 (National Diagnostics, completed)
  (12, 9.1, 4.3, 11.8, 36.5, 320,
   NULL, NULL, 0.7,
   NULL, NULL, NULL, NULL,
   120, 78, 82, 37.1, 97.0,
   'lab_report', 4,
   'Elevated WBC and platelets — consistent with active RA. Anaemia of chronic disease.',
   NOW() - INTERVAL '5 days');

INSERT INTO clinical.lab_view_requests (lab_request_id, doctor_id, patient_id, status, responded_at) VALUES
  (1, 2, 9, 'accepted', NOW() - INTERVAL '2 days'),
  (4, 3, 12,'pending',  NULL);

INSERT INTO clinical.data_access_requests (doctor_id, patient_id, access_type, reason, status, responded_at) VALUES
  (2, 9, 'medical_history','Required for continuity of care and treatment planning','accepted', NOW() - INTERVAL '10 days'),
  (2, 9, 'lab_reports',    'Needed to review previous test results','accepted', NOW() - INTERVAL '10 days'),
  (3,10, 'medical_history','Pre-surgery assessment','pending', NULL),
  (4,12, 'personal_reports','Review previous imaging reports','declined', NOW() - INTERVAL '5 days');

INSERT INTO clinical.notifications (user_id, type, title, message, data) VALUES
  (9,'new_consultation','New Consultation Added','Dr. Janaka Perera has created a consultation for you on Sat May 10 2026. Lab tests have been requested — please send them to a laboratory from your consultations page.','{"consultation_id": 1}'),
  (10,'new_consultation','New Consultation Added','Dr. Nimal Fernando has created a consultation for you on Wed May 20 2026. Lab tests have been requested.','{"consultation_id": 2}'),
  (9,'lab_report_ready','Your Lab Report is Ready','Your lab report from City Medical Laboratory is now available. View and download it from your portal.','{"lab_request_id": 1}'),
  (2,'lab_report_ready','Lab Report Ready','Lab report for patient Saman Kumara is ready. City Medical Laboratory has uploaded the results.','{"lab_request_id": 1}'),
  (9,'lab_view_request','Doctor Wants to View Your Lab Report','Dr. Janaka Perera has requested permission to view your lab report from City Medical Laboratory. Please review and respond.','{"lab_view_request_id": 1, "lab_request_id": 1}'),
  (2,'lab_view_accepted','Lab Report Access Granted','Saman Kumara accepted your request — you can now view the lab report from City Medical Laboratory.','{"lab_view_request_id": 1, "lab_request_id": 1}'),
  (9,'data_access_request','Doctor Requested Access to Your Data','Dr. Janaka Perera has requested access to your Medical History. Please review and respond.','{"access_request_id": 1}'),
  (5,'consultation_assigned','New Prescription Assigned','Dr. Janaka Perera has assigned a prescription for patient Saman Kumara. Please dispense the medicines.','{"consultation_id": 1}'),
  (7,'lab_request_assigned','New Lab Test Request','Saman Kumara has requested lab tests for patient Saman Kumara. Please process and upload the report.','{"lab_request_id": 1}');

-- =============================================================================
-- 8.9  TENANT-SPECIFIC OPERATIONAL DATA
--      Every schema gets data matching its table set.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- HOSPITALS
-- -----------------------------------------------------------------------------

-- tenant_nawaloka  (Dr. Janaka's hospital — patients 9, 10, 12)
INSERT INTO tenant_nawaloka.appointments (id, patient_id, doctor_id, scheduled_at, reason, status, notes) VALUES
  (1,  9, 2, NOW() - INTERVAL '26 days', 'Diabetes follow-up — blood sugar review',          'completed', 'HbA1c trending down. Repeat in 4 weeks.'),
  (2, 10, 3, NOW() - INTERVAL '11 days', 'Cardiology review — shortness of breath',           'completed', 'Referred for echocardiogram.'),
  (3, 12, 4, NOW() + INTERVAL '3 days',  'Rheumatology follow-up — joint pain assessment',    'scheduled',  NULL);
SELECT setval(pg_get_serial_sequence('tenant_nawaloka.appointments','id'), 3, true);

INSERT INTO tenant_nawaloka.admissions (id, patient_id, doctor_id, admitted_at, discharged_at, ward, bed_number, reason, status, notes) VALUES
  (1, 9, 2, NOW() - INTERVAL '40 days', NOW() - INTERVAL '37 days',
   'Endocrinology Ward', 'B-04',
   'Poorly controlled Type 2 Diabetes — IV insulin stabilisation required',
   'discharged', 'Blood glucose stabilised. Discharged on oral Metformin 1000mg BD.');
SELECT setval(pg_get_serial_sequence('tenant_nawaloka.admissions','id'), 1, true);

INSERT INTO tenant_nawaloka.invoices (id, patient_id, consultation_id, admission_id, amount, description, status, issued_at, paid_at) VALUES
  (1, 9,  1, 1, 12500.00, 'Consultation (Dr. Janaka) + 3-day admission + FBC / HbA1c / Lipid panel', 'paid',    NOW() - INTERVAL '36 days', NOW() - INTERVAL '35 days'),
  (2, 10, 2, NULL, 4500.00, 'Cardiology consultation (Dr. Nimal) + ECG',                              'pending', NOW() - INTERVAL '10 days', NULL),
  (3, 12, 3, NULL, 3500.00, 'Paediatric-rheumatology consultation (Dr. Kamani) + ESR/CRP panel',      'pending', NOW() - INTERVAL '5 days',  NULL);
SELECT setval(pg_get_serial_sequence('tenant_nawaloka.invoices','id'), 3, true);

-- tenant_nat_hospital  (Dr. Nimal's hospital)
INSERT INTO tenant_nat_hospital.appointments (id, patient_id, doctor_id, scheduled_at, reason, status) VALUES
  (1, 10, 3, NOW() - INTERVAL '15 days', 'Pre-op cardiac assessment', 'completed');
SELECT setval(pg_get_serial_sequence('tenant_nat_hospital.appointments','id'), 1, true);

INSERT INTO tenant_nat_hospital.invoices (id, patient_id, consultation_id, amount, description, status, issued_at) VALUES
  (1, 10, 2, 6500.00, 'Cardiology consult + Echo + Renal profile', 'paid', NOW() - INTERVAL '14 days');
SELECT setval(pg_get_serial_sequence('tenant_nat_hospital.invoices','id'), 1, true);

-- tenant_lady_ridgeway  (Dr. Kamani's hospital)
INSERT INTO tenant_lady_ridgeway.appointments (id, patient_id, doctor_id, scheduled_at, reason, status) VALUES
  (1, 12, 4, NOW() + INTERVAL '3 days', 'Rheumatoid Arthritis — steroid taper review', 'scheduled');
SELECT setval(pg_get_serial_sequence('tenant_lady_ridgeway.appointments','id'), 1, true);

INSERT INTO tenant_lady_ridgeway.invoices (id, patient_id, consultation_id, amount, description, status, issued_at) VALUES
  (1, 12, 3, 4200.00, 'Rheumatology consultation + RF / Anti-CCP antibody panel', 'pending', NOW() - INTERVAL '6 days');
SELECT setval(pg_get_serial_sequence('tenant_lady_ridgeway.invoices','id'), 1, true);

-- -----------------------------------------------------------------------------
-- PHARMACIES
-- -----------------------------------------------------------------------------

-- tenant_healthcare_pharmacy  (Sunil, user_id=5)
INSERT INTO tenant_healthcare_pharmacy.orders (id, supplier_id, ordered_by, status, total_amount, notes, received_at) VALUES
  (1,1,1,'received',45000.00,'Monthly stock replenishment',            NOW() - INTERVAL '25 days'),
  (2,2,1,'received',32000.00,'Antidiabetic and antihypertensive restock',NOW() - INTERVAL '18 days'),
  (3,3,1,'pending', 28500.00,'Quarterly order — awaiting delivery',    NULL),
  (4,4,1,'received',19000.00,'Antibiotics and bronchodilators',        NOW() - INTERVAL '10 days');
SELECT setval(pg_get_serial_sequence('tenant_healthcare_pharmacy.orders','id'), 4, true);

INSERT INTO tenant_healthcare_pharmacy.order_items (order_id, medicine_id, quantity, unit_cost) VALUES
  (1,1,200,4.00),(1,2,100,11.00),(1,7,150,4.50),(1,11,300,2.50),
  (2,3,200,6.00),(2,4,150,9.00),(2,5,100,12.00),(2,13,80,10.00),
  (3,6,100,7.00),(3,8,200,4.00),(3,14,80,9.00),(3,16,50,7.50),
  (4,9,60,22.00),(4,10,80,6.50),(4,12,100,5.00),(4,18,40,8.50);

INSERT INTO tenant_healthcare_pharmacy.sales (id, sold_by, customer_name, total_amount, payment_method) VALUES
  (1,5,'Saman Kumara',        145.00,'cash'),
  (2,5,'Priya Wickramasinghe', 88.50,'card'),
  (5,5,'Walk-in Patient',      42.50,'cash');
SELECT setval(pg_get_serial_sequence('tenant_healthcare_pharmacy.sales','id'), 5, true);

INSERT INTO tenant_healthcare_pharmacy.sale_items (sale_id, medicine_id, quantity, unit_price) VALUES
  (1,1,10,8.50),(1,3,5,12.00),(1,4,2,18.00),
  (2,7,5,10.00),(2,6,2,15.00),(2,11,3,6.00),
  (5,1,3,8.50),(5,11,3,6.00);

INSERT INTO tenant_healthcare_pharmacy.inventory_adjustments (medicine_id, quantity_change, reason, adjusted_by) VALUES
  (15, -12, 'Expired batch — Paracetamol Syrup written off',        5),
  (18,  -5, 'Damaged packaging — Warfarin 1mg disposed',            5),
  (2,   50, 'Emergency restock received from CeylonPharma',         5);

-- tenant_medplus_pharmacy  (Dilani, user_id=6)
INSERT INTO tenant_medplus_pharmacy.sales (id, sold_by, customer_name, total_amount, payment_method) VALUES
  (3,6,'Ashan Dissanayake',  72.00,'cash'),
  (4,6,'Malini Jayawardena',196.00,'online');
SELECT setval(pg_get_serial_sequence('tenant_medplus_pharmacy.sales','id'), 4, true);

INSERT INTO tenant_medplus_pharmacy.sale_items (sale_id, medicine_id, quantity, unit_price) VALUES
  (3,1,5,8.50),(3,8,4,9.00),
  (4,5,4,25.00),(4,13,3,22.00),(4,16,2,16.00);

INSERT INTO tenant_medplus_pharmacy.inventory_adjustments (medicine_id, quantity_change, reason, adjusted_by) VALUES
  (17, -8, 'Short-expiry Glibenclamide batch removed from shelf',   6),
  (4,  30, 'Top-up order received — Amlodipine 5mg',                6);

-- -----------------------------------------------------------------------------
-- LABORATORIES
-- -----------------------------------------------------------------------------

-- tenant_city_medical_lab  (user_id=7, lab_requests 1 and 3 belong here)
-- NOTE: lab report files are in clinical.lab_requests, not here.
-- This tenant schema holds the lab's operational data only.

INSERT INTO tenant_city_medical_lab.test_catalog (test_code, test_name, description, price, turnaround_hours) VALUES
  ('FBC',    'Full Blood Count',          'Complete haematology panel including WBC, RBC, Hb, platelets',  850.00,  4),
  ('HBA1C',  'HbA1c',                     'Glycated haemoglobin — 3-month average blood sugar control',    1200.00,  6),
  ('FBG',    'Fasting Blood Glucose',     'Plasma glucose after 8-hour fast',                              350.00,  2),
  ('LIPID',  'Lipid Profile',             'Total cholesterol, HDL, LDL, triglycerides',                   1500.00,  6),
  ('RFT',    'Renal Function Test',       'Creatinine, urea, electrolytes',                               1400.00,  8),
  ('LFT',    'Liver Function Test',       'ALT, AST, ALP, bilirubin, albumin',                            1600.00,  8),
  ('CRP',    'C-Reactive Protein',        'Marker of acute inflammation',                                  600.00,  4),
  ('SPUTUM', 'Sputum Culture & Sensitivity','Bacterial identification and antibiotic sensitivity',          2200.00, 72);

INSERT INTO tenant_city_medical_lab.sample_receipts (lab_request_id, received_by, received_at, sample_type, sample_condition, notes) VALUES
  (1, 7, NOW() - INTERVAL '24 days', 'blood',  'good',        '5 ml EDTA + 3 ml plain tubes received from Nawaloka courier.'),
  (3, 7, NOW() - INTERVAL '3 days',  'sputum', 'good',        'Early morning sputum collected at clinic. Gram stain started.');

INSERT INTO tenant_city_medical_lab.invoices (lab_request_id, patient_id, amount, status, issued_at, paid_at) VALUES
  (1, 9, 5300.00, 'paid',    NOW() - INTERVAL '23 days', NOW() - INTERVAL '22 days'),
  (3, 11, 3650.00, 'pending', NOW() - INTERVAL '2 days',  NULL);

-- tenant_national_diagnostics  (user_id=8, lab_requests 2 and 4 belong here)
-- NOTE: lab report files are in clinical.lab_requests, not here.
-- This tenant schema holds the lab's operational data only.

INSERT INTO tenant_national_diagnostics.test_catalog (test_code, test_name, description, price, turnaround_hours) VALUES
  ('ESR',     'Erythrocyte Sedimentation Rate','Non-specific inflammatory marker',                          400.00,  2),
  ('RF',      'Rheumatoid Factor',             'Autoantibody associated with rheumatoid arthritis',         900.00,  6),
  ('ANTICCP',  'Anti-CCP Antibody',            'Highly specific marker for rheumatoid arthritis',          2400.00, 12),
  ('ECG',     'Electrocardiogram',             '12-lead ECG resting trace',                                1200.00,  1),
  ('ECHO',    'Echocardiogram',                '2D transthoracic echocardiography',                        8500.00, 24),
  ('FBC',     'Full Blood Count',              'Haematology panel',                                         850.00,  4),
  ('RENALP',  'Renal Profile',                 'Creatinine, urea, electrolytes',                           1400.00,  8),
  ('HISTOPATH','Histopathology',               'Tissue biopsy microscopic examination',                    4500.00, 72);

INSERT INTO tenant_national_diagnostics.sample_receipts (lab_request_id, received_by, received_at, sample_type, sample_condition, notes) VALUES
  (4, 8, NOW() - INTERVAL '7 days', 'blood', 'good', '6 ml EDTA + 4 ml clotted blood. Labelled and bar-coded on receipt.');

INSERT INTO tenant_national_diagnostics.invoices (lab_request_id, patient_id, amount, status, issued_at, paid_at) VALUES
  (4, 12, 7100.00, 'paid',    NOW() - INTERVAL '6 days',  NOW() - INTERVAL '5 days'),
  (2, 10, 12400.00, 'pending', NOW() - INTERVAL '10 days', NULL);

-- -----------------------------------------------------------------------------
-- PERSONAL CLINICS
-- -----------------------------------------------------------------------------

-- tenant_janaka_clinic  (Dr. Janaka's personal clinic — consultation 5 is here)
INSERT INTO tenant_janaka_clinic.appointments (id, patient_id, scheduled_at, reason, status, notes) VALUES
  (1, 11, NOW() - INTERVAL '7 days',   'Respiratory follow-up — post-LRTI clearance check', 'completed', 'Chest clear. Inhaler discontinued.'),
  (2,  9, NOW() + INTERVAL '14 days',  'Diabetes annual review',                             'scheduled',  NULL);
SELECT setval(pg_get_serial_sequence('tenant_janaka_clinic.appointments','id'), 2, true);

INSERT INTO tenant_janaka_clinic.invoices (id, patient_id, consultation_id, appointment_id, amount, description, status, issued_at, paid_at) VALUES
  (1, 11, 5, 1, 2500.00, 'GP consultation — respiratory follow-up (Dr. Janaka, personal clinic)', 'paid',    NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
  (2,  9, NULL, 2, 2500.00, 'Diabetes annual review — pending visit',                              'pending', NOW() + INTERVAL '14 days', NULL);
SELECT setval(pg_get_serial_sequence('tenant_janaka_clinic.invoices','id'), 2, true);

-- tenant_nimal_clinic  (Dr. Nimal's personal heart clinic)
INSERT INTO tenant_nimal_clinic.appointments (id, patient_id, scheduled_at, reason, status, notes) VALUES
  (1, 10, NOW() + INTERVAL '7 days', 'Cardiology private follow-up — Echo results review', 'scheduled', NULL);
SELECT setval(pg_get_serial_sequence('tenant_nimal_clinic.appointments','id'), 1, true);

INSERT INTO tenant_nimal_clinic.invoices (id, patient_id, consultation_id, appointment_id, amount, description, status, issued_at) VALUES
  (1, 10, NULL, 1, 4500.00, 'Cardiology private consultation — Echo review (Dr. Nimal)', 'pending', NOW() + INTERVAL '7 days');
SELECT setval(pg_get_serial_sequence('tenant_nimal_clinic.invoices','id'), 1, true);

-- =============================================================================
-- 9. REPORTING VIEWS (schema-qualified)
-- =============================================================================
CREATE OR REPLACE VIEW public.v_low_stock AS
SELECT m.id, m.name, m.generic_name, m.category, m.stock_quantity, m.reorder_level,
       (m.reorder_level - m.stock_quantity) AS shortage, s.name AS supplier_name, m.expiry_date
FROM public.medicines m
LEFT JOIN public.suppliers s ON s.id = m.supplier_id
WHERE m.stock_quantity <= m.reorder_level AND m.is_active = TRUE
ORDER BY shortage DESC;

CREATE OR REPLACE VIEW clinical.v_active_prescriptions AS
SELECT u.id AS patient_id, u.name AS patient_name, mc.id AS consultation_id, mc.visit_date,
       cm.medicine_name, cm.dosage, cm.frequency, cm.duration, u2.name AS doctor_name
FROM clinical.medical_consultations mc
JOIN clinical.consultation_medicines cm ON cm.consultation_id = mc.id
JOIN public.users u  ON u.id  = mc.patient_id
LEFT JOIN public.users u2 ON u2.id = mc.doctor_id
WHERE mc.status = 'active';

-- Covers pending and in-progress requests only.
-- Completed requests (with report_file) are served directly from clinical.lab_requests
-- using the existing RLS + lab_view_requests permission system.
CREATE OR REPLACE VIEW clinical.v_pending_lab_requests AS
SELECT lr.id, lr.test_description, lr.status, lr.created_at,
       pt.name  AS patient_name,
       dr.name  AS doctor_name,
       lp.lab_name
FROM  clinical.lab_requests lr
JOIN  public.users pt               ON pt.id  = lr.patient_id
LEFT JOIN public.users dr           ON dr.id  = lr.doctor_id
LEFT JOIN public.laboratory_profiles lp ON lp.user_id = lr.laboratory_id
WHERE lr.status IN ('pending','in_progress')
ORDER BY lr.created_at;

-- IMPORTANT: views must NOT bypass RLS. By default a view reads base tables with
-- its owner's rights; if the owner is a superuser, RLS is skipped -> leak. We make
-- the app role the owner (it is not a superuser and cannot bypass RLS), and also
-- switch on security_invoker on PG15+ for defence-in-depth.
ALTER VIEW clinical.v_active_prescriptions OWNER TO corehealth_app;
ALTER VIEW clinical.v_pending_lab_requests OWNER TO corehealth_app;
ALTER VIEW public.v_low_stock              OWNER TO corehealth_app;
GRANT SELECT ON clinical.v_active_prescriptions, clinical.v_pending_lab_requests, public.v_low_stock TO corehealth_app;

DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW clinical.v_active_prescriptions SET (security_invoker = true)';
    EXECUTE 'ALTER VIEW clinical.v_pending_lab_requests SET (security_invoker = true)';
    EXECUTE 'ALTER VIEW public.v_low_stock              SET (security_invoker = true)';
  END IF;
END $$;
