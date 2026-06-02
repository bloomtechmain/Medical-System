-- =============================================================================
-- Core Health – Medical System  |  Complete Database Schema
-- =============================================================================
-- PostgreSQL 14+
-- Run:  psql -U postgres -f database.sql
-- Or:   \i database.sql   (inside psql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DATABASE
-- -----------------------------------------------------------------------------
-- Uncomment if you want this script to create the database automatically:
-- CREATE DATABASE corehealth
--   WITH ENCODING = 'UTF8'
--        LC_COLLATE = 'en_US.UTF-8'
--        LC_CTYPE   = 'en_US.UTF-8'
--        TEMPLATE   = template0;
-- \c corehealth

-- -----------------------------------------------------------------------------
-- 2. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy / ILIKE index support

-- -----------------------------------------------------------------------------
-- 3. DROP EXISTING TABLES (safe re-run)
-- Dropped in reverse-dependency order
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS notifications            CASCADE;
DROP TABLE IF EXISTS lab_view_requests        CASCADE;
DROP TABLE IF EXISTS data_access_requests     CASCADE;
DROP TABLE IF EXISTS patient_reports          CASCADE;
DROP TABLE IF EXISTS lab_requests             CASCADE;
DROP TABLE IF EXISTS consultation_medicines   CASCADE;
DROP TABLE IF EXISTS medical_consultations    CASCADE;
DROP TABLE IF EXISTS sale_items               CASCADE;
DROP TABLE IF EXISTS sales                    CASCADE;
DROP TABLE IF EXISTS order_items              CASCADE;
DROP TABLE IF EXISTS orders                   CASCADE;
DROP TABLE IF EXISTS medicines                CASCADE;
DROP TABLE IF EXISTS suppliers                CASCADE;
DROP TABLE IF EXISTS laboratory_profiles      CASCADE;
DROP TABLE IF EXISTS pharmacist_profiles      CASCADE;
DROP TABLE IF EXISTS doctor_profiles          CASCADE;
DROP TABLE IF EXISTS patient_profiles         CASCADE;
DROP TABLE IF EXISTS users                    CASCADE;

-- =============================================================================
-- 4. CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users  (all roles share this table)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,          -- bcrypt hash
  role       VARCHAR(20)  NOT NULL DEFAULT 'patient'
             CHECK (role IN ('admin','doctor','pharmacist','patient','laboratory')),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_role   ON users(role);

-- -----------------------------------------------------------------------------
-- patient_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE patient_profiles (
  id                      SERIAL      PRIMARY KEY,
  user_id                 INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth           DATE,
  gender                  VARCHAR(10) CHECK (gender IN ('male','female','other')),
  phone                   VARCHAR(20),
  address                 TEXT,
  emergency_contact_name  VARCHAR(150),
  emergency_contact_phone VARCHAR(20),
  blood_type              VARCHAR(5),
  allergies               TEXT,
  chronic_conditions      TEXT,
  insurance_provider      VARCHAR(150),
  insurance_policy_number VARCHAR(100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- doctor_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE doctor_profiles (
  id                   SERIAL        PRIMARY KEY,
  user_id              INTEGER       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone                VARCHAR(20),
  specialization       VARCHAR(150),
  license_number       VARCHAR(100),
  medical_school       VARCHAR(200),
  years_experience     INTEGER       DEFAULT 0,
  hospital_affiliation VARCHAR(200),
  consultation_fee     NUMERIC(10,2) DEFAULT 0,
  bio                  TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- pharmacist_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE pharmacist_profiles (
  id                  SERIAL      PRIMARY KEY,
  user_id             INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone               VARCHAR(20),
  license_number      VARCHAR(100),
  pharmacy_name       VARCHAR(200),
  pharmacy_address    TEXT,
  years_experience    INTEGER     DEFAULT 0,
  specialization_area VARCHAR(150),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- laboratory_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE laboratory_profiles (
  id               SERIAL      PRIMARY KEY,
  user_id          INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone            VARCHAR(20),
  lab_name         VARCHAR(200),
  lab_type         VARCHAR(100),
  license_number   VARCHAR(100),
  accreditation    VARCHAR(200),
  address          TEXT,
  services_offered TEXT,
  operating_hours  VARCHAR(200),
  website          VARCHAR(300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. PHARMACY / INVENTORY TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- suppliers
-- -----------------------------------------------------------------------------
CREATE TABLE suppliers (
  id         SERIAL      PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  contact    VARCHAR(100),
  phone      VARCHAR(20),
  email      VARCHAR(150),
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- medicines
-- -----------------------------------------------------------------------------
CREATE TABLE medicines (
  id             SERIAL        PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  generic_name   VARCHAR(200),
  category       VARCHAR(100),
  description    TEXT,
  unit           VARCHAR(20)   NOT NULL DEFAULT 'tablet',
  price          NUMERIC(10,2) NOT NULL DEFAULT 0,      -- selling price
  cost_price     NUMERIC(10,2) NOT NULL DEFAULT 0,      -- purchase price
  stock_quantity INTEGER       NOT NULL DEFAULT 0,
  reorder_level  INTEGER       NOT NULL DEFAULT 10,
  expiry_date    DATE,
  supplier_id    INTEGER       REFERENCES suppliers(id) ON DELETE SET NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medicines_name     ON medicines(name);
CREATE INDEX idx_medicines_category ON medicines(category);
CREATE INDEX idx_medicines_supplier ON medicines(supplier_id);

-- -----------------------------------------------------------------------------
-- orders  (purchase orders to suppliers)
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  id           SERIAL        PRIMARY KEY,
  supplier_id  INTEGER       REFERENCES suppliers(id) ON DELETE SET NULL,
  ordered_by   INTEGER       REFERENCES users(id)     ON DELETE SET NULL,
  status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','received','cancelled')),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  ordered_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  received_at  TIMESTAMPTZ
);

CREATE INDEX idx_orders_supplier ON orders(supplier_id);
CREATE INDEX idx_orders_status   ON orders(status);

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
  id          SERIAL        PRIMARY KEY,
  order_id    INTEGER       NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
  medicine_id INTEGER       NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  quantity    INTEGER       NOT NULL CHECK (quantity > 0),
  unit_cost   NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0)
);

CREATE INDEX idx_order_items_order    ON order_items(order_id);
CREATE INDEX idx_order_items_medicine ON order_items(medicine_id);

-- -----------------------------------------------------------------------------
-- sales  (dispensed medicines to patients)
-- -----------------------------------------------------------------------------
CREATE TABLE sales (
  id             SERIAL        PRIMARY KEY,
  sold_by        INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  customer_name  VARCHAR(150),
  total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20)   DEFAULT 'cash'
                 CHECK (payment_method IN ('cash','card','online')),
  sold_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_sold_by ON sales(sold_by);
CREATE INDEX idx_sales_sold_at ON sales(sold_at);

-- -----------------------------------------------------------------------------
-- sale_items
-- -----------------------------------------------------------------------------
CREATE TABLE sale_items (
  id          SERIAL        PRIMARY KEY,
  sale_id     INTEGER       NOT NULL REFERENCES sales(id)     ON DELETE CASCADE,
  medicine_id INTEGER       NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  quantity    INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_sale_items_sale     ON sale_items(sale_id);
CREATE INDEX idx_sale_items_medicine ON sale_items(medicine_id);

-- =============================================================================
-- 6. CONSULTATION & MEDICAL TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- medical_consultations
-- -----------------------------------------------------------------------------
CREATE TABLE medical_consultations (
  id                     SERIAL      PRIMARY KEY,
  patient_id             INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id              INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  assigned_pharmacist_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  visit_date             DATE        NOT NULL,
  doctor_name            VARCHAR(200),                   -- freetext for non-system doctors
  hospital_clinic        VARCHAR(200),
  sick_description       TEXT,
  diagnosis              TEXT,
  treatment_description  TEXT,
  prescription_file      VARCHAR(500),                   -- filename in uploads/prescriptions/
  ocr_text               TEXT,                           -- raw OCR output from prescription
  lab_tests_requested    TEXT,                           -- doctor-requested lab tests (patient chooses lab)
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','dispensed','completed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mc_patient    ON medical_consultations(patient_id);
CREATE INDEX idx_mc_doctor     ON medical_consultations(doctor_id);
CREATE INDEX idx_mc_pharmacist ON medical_consultations(assigned_pharmacist_id);
CREATE INDEX idx_mc_status     ON medical_consultations(status);
CREATE INDEX idx_mc_visit_date ON medical_consultations(visit_date);

-- -----------------------------------------------------------------------------
-- consultation_medicines  (medicines extracted from OCR or added manually)
-- -----------------------------------------------------------------------------
CREATE TABLE consultation_medicines (
  id              SERIAL      PRIMARY KEY,
  consultation_id INTEGER     NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
  medicine_name   VARCHAR(200) NOT NULL,
  dosage          VARCHAR(100),
  frequency       VARCHAR(100),
  duration        VARCHAR(100),
  notes           VARCHAR(300),
  source          VARCHAR(10)  NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','ocr'))
);

CREATE INDEX idx_cm_consultation ON consultation_medicines(consultation_id);

-- =============================================================================
-- 7. LAB TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lab_requests  (lab tests requested for a patient)
-- doctor_id is nullable — patients can also submit requests from a consultation
-- -----------------------------------------------------------------------------
CREATE TABLE lab_requests (
  id              SERIAL      PRIMARY KEY,
  doctor_id       INTEGER     REFERENCES users(id) ON DELETE SET NULL,   -- nullable
  patient_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laboratory_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consultation_id INTEGER     REFERENCES medical_consultations(id) ON DELETE SET NULL,
  test_description TEXT       NOT NULL,
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed')),
  report_file     VARCHAR(500),                -- filename in uploads/lab-reports/
  report_mimetype VARCHAR(100),
  report_notes    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lr_doctor       ON lab_requests(doctor_id);
CREATE INDEX idx_lr_patient      ON lab_requests(patient_id);
CREATE INDEX idx_lr_laboratory   ON lab_requests(laboratory_id);
CREATE INDEX idx_lr_consultation ON lab_requests(consultation_id);
CREATE INDEX idx_lr_status       ON lab_requests(status);

-- -----------------------------------------------------------------------------
-- lab_view_requests  (doctor requests permission from patient to view a report)
-- -----------------------------------------------------------------------------
CREATE TABLE lab_view_requests (
  id             SERIAL      PRIMARY KEY,
  lab_request_id INTEGER     NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  doctor_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message        TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined')),
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lvr_lab_request ON lab_view_requests(lab_request_id);
CREATE INDEX idx_lvr_doctor      ON lab_view_requests(doctor_id);
CREATE INDEX idx_lvr_patient     ON lab_view_requests(patient_id);
CREATE INDEX idx_lvr_status      ON lab_view_requests(status);

-- =============================================================================
-- 8. ACCESS CONTROL TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- data_access_requests  (doctor requests access to categories of patient data)
-- -----------------------------------------------------------------------------
CREATE TABLE data_access_requests (
  id           SERIAL      PRIMARY KEY,
  doctor_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type  VARCHAR(50) NOT NULL
               CHECK (access_type IN ('lab_reports','medical_history','personal_reports','contact_info')),
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','declined')),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dar_doctor  ON data_access_requests(doctor_id);
CREATE INDEX idx_dar_patient ON data_access_requests(patient_id);
CREATE INDEX idx_dar_status  ON data_access_requests(status);

-- =============================================================================
-- 9. REPORTS & NOTIFICATIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- patient_reports  (personal health documents uploaded by patients)
-- -----------------------------------------------------------------------------
CREATE TABLE patient_reports (
  id                 SERIAL       PRIMARY KEY,
  patient_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              VARCHAR(255) NOT NULL,
  report_type        VARCHAR(50)  NOT NULL
                     CHECK (report_type IN (
                       'lab_report','prescription','imaging',
                       'discharge_summary','vaccination','other'
                     )),
  laboratory_name    VARCHAR(255),
  doctor_name        VARCHAR(255),
  hospital_clinic    VARCHAR(255),
  issued_date        DATE         NOT NULL,
  description        TEXT,
  file_path          VARCHAR(500) NOT NULL,    -- path in uploads/patient-reports/
  file_mimetype      VARCHAR(100),
  file_original_name VARCHAR(255),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pr_patient     ON patient_reports(patient_id);
CREATE INDEX idx_pr_report_type ON patient_reports(report_type);
CREATE INDEX idx_pr_issued_date ON patient_reports(issued_date);

-- -----------------------------------------------------------------------------
-- notifications  (in-app notifications for all roles)
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(60)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  data       JSONB        NOT NULL DEFAULT '{}',
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user    ON notifications(user_id);
CREATE INDEX idx_notif_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notif_type    ON notifications(type);

-- =============================================================================
-- 10. SEED DATA
-- =============================================================================
-- All sample passwords are: Password@123
-- bcrypt hash (cost 10) for 'Password@123'
-- To regenerate:  node -e "const b=require('bcryptjs');console.log(b.hashSync('Password@123',10))"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 10.1  Users
-- -----------------------------------------------------------------------------
INSERT INTO users (name, email, password, role) VALUES
  -- Admin
  ('System Admin',      'admin@corehealth.lk',        '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'admin'),

  -- Doctors
  ('Dr. Janaka Perera',  'dr.janaka@corehealth.lk',   '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'doctor'),
  ('Dr. Nimal Fernando', 'dr.nimal@corehealth.lk',    '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'doctor'),
  ('Dr. Kamani Silva',   'dr.kamani@corehealth.lk',   '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'doctor'),

  -- Pharmacists
  ('Sunil Rathnayake',   'sunil@pharma.lk',           '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'pharmacist'),
  ('Dilani Wijesinghe',  'dilani@pharma.lk',          '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'pharmacist'),

  -- Laboratories
  ('City Medical Lab',   'info@citylab.lk',           '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'laboratory'),
  ('National Diagnostics','lab@nationaldiag.lk',      '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'laboratory'),

  -- Patients
  ('Saman Kumara',       'saman@gmail.com',           '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'patient'),
  ('Priya Wickramasinghe','priya@gmail.com',           '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'patient'),
  ('Ashan Dissanayake',  'ashan@gmail.com',           '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'patient'),
  ('Malini Jayawardena', 'malini@gmail.com',          '$2b$10$TlfFNKqiAqGr3sJJ5y2XBewCFbUwgU3TlhGiQ.uBV4eFEsWlAmXG6', 'patient');

-- -----------------------------------------------------------------------------
-- 10.2  Doctor Profiles
-- -----------------------------------------------------------------------------
INSERT INTO doctor_profiles (user_id, phone, specialization, license_number, medical_school, years_experience, hospital_affiliation, consultation_fee, bio) VALUES
  (2, '+94771234567', 'General Physician',    'SLMC-2018-0452', 'University of Colombo Faculty of Medicine', 8,  'Nawaloka Hospital, Colombo',        2500.00, 'Experienced general physician specialising in preventive medicine and chronic disease management.'),
  (3, '+94772345678', 'Cardiologist',         'SLMC-2012-0211', 'University of Kelaniya Faculty of Medicine',14, 'National Hospital Sri Lanka',        4500.00, 'Consultant cardiologist with expertise in interventional cardiology and heart failure management.'),
  (4, '+94773456789', 'Pediatrician',         'SLMC-2015-0387', 'University of Peradeniya Faculty of Medicine',10,'Lady Ridgeway Hospital, Colombo',   3500.00, 'Dedicated pediatrician providing comprehensive child healthcare from newborns to adolescents.');

-- -----------------------------------------------------------------------------
-- 10.3  Pharmacist Profiles
-- -----------------------------------------------------------------------------
INSERT INTO pharmacist_profiles (user_id, phone, license_number, pharmacy_name, pharmacy_address, years_experience, specialization_area) VALUES
  (5, '+94760111222', 'SPC-2019-0089', 'HealthCare Pharmacy',    '45 Galle Road, Colombo 03',       6, 'Clinical Pharmacy'),
  (6, '+94760222333', 'SPC-2020-0145', 'MedPlus Pharmacy',       '12 Kandy Road, Nugegoda',         5, 'Dispensing Pharmacy');

-- -----------------------------------------------------------------------------
-- 10.4  Laboratory Profiles
-- -----------------------------------------------------------------------------
INSERT INTO laboratory_profiles (user_id, phone, lab_name, lab_type, license_number, accreditation, address, services_offered, operating_hours) VALUES
  (7, '+94112345678', 'City Medical Laboratory',  'Multi-Discipline', 'LAB-2016-0033', 'ISO 15189:2012', '78 Union Place, Colombo 02',       'Full Blood Count, Lipid Profile, Liver Function, Renal Function, Blood Glucose, HbA1c, Thyroid, Urine Analysis, PCR', 'Mon–Sat 07:00–18:00'),
  (8, '+94113456789', 'National Diagnostics',     'Pathology',        'LAB-2014-0019', 'ISO 15189:2012', '23 Baseline Road, Colombo 08',     'Histopathology, Cytology, Microbiology, Biochemistry, Haematology, Immunology, Hormone Assay',                       'Mon–Sun 06:00–20:00');

-- -----------------------------------------------------------------------------
-- 10.5  Patient Profiles
-- -----------------------------------------------------------------------------
INSERT INTO patient_profiles (user_id, date_of_birth, gender, phone, address, emergency_contact_name, emergency_contact_phone, blood_type, allergies, chronic_conditions, insurance_provider, insurance_policy_number) VALUES
  (9,  '1990-03-15', 'male',   '+94771111111', '12 Temple Road, Maharagama',     'Kumara Silva',  '+94771111112', 'B+',  'Penicillin',          'Type 2 Diabetes, Hypertension', 'AIA Insurance',    'AIA-2022-009871'),
  (10, '1985-07-22', 'female', '+94772222222', '34 Lake View, Boralesgamuwa',    'Kamal Wickrama','+94772222223', 'O+',  NULL,                  'Asthma',                        'Union Assurance',  'UA-2021-003344'),
  (11, '1998-11-08', 'male',   '+94773333333', '56 New Street, Kelaniya',        'Pradeep Dissa', '+94773333334', 'A-',  NULL,                  NULL,                            NULL,               NULL),
  (12, '1975-05-30', 'female', '+94774444444', '89 Lotus Road, Kotte',           'Roshan Jayaw',  '+94774444445', 'AB+', 'Sulfa drugs, Latex',  'Rheumatoid Arthritis',          'Ceylinco Life',    'CL-2020-007712');

-- -----------------------------------------------------------------------------
-- 10.6  Suppliers
-- -----------------------------------------------------------------------------
INSERT INTO suppliers (name, contact, phone, email, address) VALUES
  ('PharmaCo Lanka (Pvt) Ltd',    'Ruwan Senanayake',  '+94112223344', 'orders@pharmacolanka.lk',  '125 Sir James Pieris Mawatha, Colombo 02'),
  ('MediSupply Solutions',         'Tharanga Bandara',  '+94114455667', 'supply@medisupply.lk',     '67 Vauxhall Street, Colombo 02'),
  ('CeylonPharma Distributors',    'Lasantha Gunatilake','+94115566778','sales@ceylonpharma.lk',   '22 Havelock Road, Colombo 05'),
  ('HealthLine Imports Ltd',       'Nimasha Ratnasiri', '+94116677889', 'info@healthlineimports.lk','90 D.R. Wijewardena Mawatha, Colombo 10');

-- -----------------------------------------------------------------------------
-- 10.7  Medicines
-- -----------------------------------------------------------------------------
INSERT INTO medicines (name, generic_name, category, description, unit, price, cost_price, stock_quantity, reorder_level, expiry_date, supplier_id) VALUES
  ('Panadol 500mg',           'Paracetamol',         'Analgesic',        'Pain reliever and fever reducer',                    'tablet',  8.50,  4.00,  500, 50, '2026-12-31', 1),
  ('Amoxicillin 500mg',       'Amoxicillin',         'Antibiotic',       'Broad-spectrum penicillin antibiotic',               'capsule', 22.00, 11.00, 300, 30, '2026-06-30', 1),
  ('Metformin 500mg',         'Metformin HCl',       'Antidiabetic',     'First-line medication for type 2 diabetes',         'tablet',  12.00,  6.00,  400, 40, '2027-03-31', 2),
  ('Amlodipine 5mg',          'Amlodipine Besylate', 'Antihypertensive', 'Calcium channel blocker for high blood pressure',   'tablet',  18.00,  9.00,  350, 35, '2027-01-31', 2),
  ('Atorvastatin 10mg',       'Atorvastatin Calcium','Statin',           'Lowers cholesterol and reduces cardiovascular risk','tablet',  25.00, 12.00,  250, 25, '2026-09-30', 3),
  ('Omeprazole 20mg',         'Omeprazole',          'PPI',              'Proton pump inhibitor for acid-related disorders',  'capsule', 15.00,  7.00,  280, 30, '2026-11-30', 3),
  ('Cetirizine 10mg',         'Cetirizine HCl',      'Antihistamine',    'Non-drowsy antihistamine for allergies',            'tablet',  10.00,  4.50,  320, 30, '2027-02-28', 1),
  ('Ibuprofen 400mg',         'Ibuprofen',           'NSAID',            'Anti-inflammatory pain reliever',                   'tablet',   9.00,  4.00,  420, 40, '2027-04-30', 2),
  ('Azithromycin 250mg',      'Azithromycin',        'Antibiotic',       'Macrolide antibiotic for respiratory infections',   'tablet',  45.00, 22.00,  150, 20, '2026-08-31', 4),
  ('Salbutamol 2mg',          'Salbutamol Sulphate', 'Bronchodilator',   'Short-acting bronchodilator for asthma relief',     'tablet',  14.00,  6.50,  180, 20, '2026-10-31', 4),
  ('Vitamin C 500mg',         'Ascorbic Acid',       'Vitamin',          'Vitamin C supplement for immune support',           'tablet',   6.00,  2.50,  600, 60, '2027-06-30', 1),
  ('Metronidazole 400mg',     'Metronidazole',       'Antibiotic',       'Antibiotic for bacterial and protozoal infections', 'tablet',  11.00,  5.00,  240, 25, '2026-07-31', 2),
  ('Losartan 50mg',           'Losartan Potassium',  'Antihypertensive', 'ARB for hypertension and diabetic nephropathy',     'tablet',  22.00, 10.00,  200, 25, '2027-05-31', 3),
  ('Pantoprazole 40mg',       'Pantoprazole Sodium', 'PPI',              'Proton pump inhibitor for GERD treatment',         'tablet',  20.00,  9.00,  260, 30, '2027-01-31', 3),
  ('Paracetamol Syrup 120mg', 'Paracetamol',         'Analgesic',        'Paracetamol suspension for children',              'bottle',  65.00, 30.00,   80, 10, '2026-05-31', 1),
  ('Prednisolone 5mg',        'Prednisolone',        'Corticosteroid',   'Anti-inflammatory corticosteroid',                 'tablet',  16.00,  7.50,  120, 15, '2026-12-31', 4),
  ('Glibenclamide 5mg',       'Glibenclamide',       'Antidiabetic',     'Sulfonylurea for type 2 diabetes',                 'tablet',  13.00,  6.00,  170, 20, '2027-02-28', 2),
  ('Warfarin 1mg',            'Warfarin Sodium',     'Anticoagulant',    'Blood thinner to prevent clot formation',          'tablet',  18.00,  8.50,   90, 15, '2026-11-30', 4),
  ('Ferrous Sulphate 200mg',  'Ferrous Sulphate',    'Iron Supplement',  'Iron supplement for iron-deficiency anaemia',      'tablet',   7.00,  3.00,  350, 40, '2027-03-31', 1),
  ('Folic Acid 5mg',          'Folic Acid',          'Vitamin',          'B-vitamin for cell growth and anaemia prevention', 'tablet',   5.00,  2.00,  400, 40, '2027-04-30', 1);

-- -----------------------------------------------------------------------------
-- 10.8  Purchase Orders
-- -----------------------------------------------------------------------------
INSERT INTO orders (supplier_id, ordered_by, status, total_amount, notes, received_at) VALUES
  (1, 1, 'received', 45000.00, 'Monthly stock replenishment', NOW() - INTERVAL '25 days'),
  (2, 1, 'received', 32000.00, 'Antidiabetic and antihypertensive restock', NOW() - INTERVAL '18 days'),
  (3, 1, 'pending',  28500.00, 'Quarterly order — awaiting delivery', NULL),
  (4, 1, 'received', 19000.00, 'Antibiotics and bronchodilators', NOW() - INTERVAL '10 days');

-- Order Items
INSERT INTO order_items (order_id, medicine_id, quantity, unit_cost) VALUES
  (1, 1, 200, 4.00), (1, 2, 100, 11.00), (1, 7, 150, 4.50), (1, 11, 300, 2.50),
  (2, 3, 200, 6.00), (2, 4, 150, 9.00), (2, 5, 100, 12.00), (2, 13, 80, 10.00),
  (3, 6, 100, 7.00), (3, 8, 200, 4.00), (3, 14, 80, 9.00),  (3, 16, 50, 7.50),
  (4, 9, 60, 22.00), (4, 10, 80, 6.50), (4, 12, 100, 5.00), (4, 18, 40, 8.50);

-- -----------------------------------------------------------------------------
-- 10.9  Sample Sales
-- -----------------------------------------------------------------------------
INSERT INTO sales (sold_by, customer_name, total_amount, payment_method) VALUES
  (5, 'Saman Kumara',        145.00, 'cash'),
  (5, 'Priya Wickramasinghe', 88.50, 'card'),
  (6, 'Ashan Dissanayake',    72.00, 'cash'),
  (6, 'Malini Jayawardena',  196.00, 'online'),
  (5, 'Walk-in Patient',      42.50, 'cash');

-- Sale Items
INSERT INTO sale_items (sale_id, medicine_id, quantity, unit_price) VALUES
  (1, 1, 10, 8.50), (1, 3, 5, 12.00), (1, 4, 2, 18.00),
  (2, 7, 5, 10.00), (2, 6, 2, 15.00), (2, 11, 3, 6.00),
  (3, 1, 5, 8.50),  (3, 8, 4,  9.00),
  (4, 5, 4, 25.00), (4, 13, 3, 22.00), (4, 16, 2, 16.00),
  (5, 1, 3, 8.50),  (5, 11, 3, 6.00);

-- -----------------------------------------------------------------------------
-- 10.10  Sample Consultations
-- -----------------------------------------------------------------------------
INSERT INTO medical_consultations
  (patient_id, doctor_id, assigned_pharmacist_id, visit_date, doctor_name, hospital_clinic,
   sick_description, diagnosis, treatment_description, status, lab_tests_requested) VALUES

  -- Doctor Janaka consulting Patient Saman
  (9, 2, 5, '2026-05-10', 'Janaka Perera', 'Nawaloka Hospital, Colombo',
   'Persistent high blood sugar readings, fatigue, increased thirst and frequent urination',
   'Type 2 Diabetes – poorly controlled. HbA1c likely elevated.',
   'Increased Metformin to 1000mg twice daily. Dietary counselling. Review in 4 weeks.',
   'dispensed',
   'Full Blood Count, HbA1c, Fasting Blood Glucose, Lipid Profile, Renal Function Test'),

  -- Doctor Nimal consulting Patient Priya
  (10, 3, 5, '2026-05-20', 'Nimal Fernando', 'National Hospital Sri Lanka',
   'Chest tightness, shortness of breath on exertion, mild ankle oedema',
   'Suspected hypertensive heart disease. Requires ECG and echocardiogram.',
   'Started Amlodipine 5mg OD. Restricted sodium intake. Refer for cardiology workup.',
   'active',
   'ECG, Echocardiogram, Full Blood Count, Renal Profile, Lipid Profile'),

  -- Doctor Kamani consulting Patient Malini
  (12, 4, 6, '2026-05-25', 'Kamani Silva', 'Lady Ridgeway Hospital, Colombo',
   'Generalised joint pain, morning stiffness lasting more than 1 hour, bilateral wrist swelling',
   'Rheumatoid Arthritis – active disease. RF positive.',
   'Prednisolone 10mg OD for 2 weeks then taper. Methotrexate to be considered. Physio referral.',
   'active',
   'ESR, CRP, Rheumatoid Factor, Anti-CCP Antibody, Full Blood Count, Liver Function Test'),

  -- Self-recorded by Patient Ashan
  (11, NULL, NULL, '2026-04-15', 'Dr. Suresh (Private)', 'Sunshine Clinic, Kelaniya',
   'Fever, sore throat, body aches for 3 days',
   'Viral pharyngitis',
   'Paracetamol 500mg TDS, plenty of fluids, rest for 3 days',
   'completed',
   NULL),

  -- Doctor Janaka consulting Patient Ashan
  (11, 2, 5, '2026-05-28', 'Janaka Perera', 'Nawaloka Hospital, Colombo',
   'Follow-up for chronic cough, productive with yellowish sputum, 5-day history',
   'Lower respiratory tract infection. Rule out pneumonia.',
   'Azithromycin 500mg OD × 5 days. Salbutamol inhaler PRN. Chest X-ray ordered.',
   'active',
   'Full Blood Count, Sputum Culture and Sensitivity, CRP');

-- -----------------------------------------------------------------------------
-- 10.11  Consultation Medicines
-- -----------------------------------------------------------------------------
INSERT INTO consultation_medicines (consultation_id, medicine_name, dosage, frequency, duration, source) VALUES
  -- Consultation 1 (Saman – Diabetes)
  (1, 'Metformin 500mg',   '1000mg', 'Twice daily', '90 days', 'manual'),
  (1, 'Atorvastatin 10mg', '10mg',   'Once at night','90 days', 'manual'),
  (1, 'Vitamin C 500mg',   '500mg',  'Once daily',   '30 days', 'manual'),

  -- Consultation 2 (Priya – Hypertension)
  (2, 'Amlodipine 5mg', '5mg', 'Once daily', '30 days', 'manual'),

  -- Consultation 3 (Malini – Rheumatoid Arthritis)
  (3, 'Prednisolone 5mg', '10mg', 'Once daily',   '14 days','manual'),
  (3, 'Omeprazole 20mg',  '20mg', 'Once daily',   '14 days','manual'),

  -- Consultation 4 (Ashan – Viral pharyngitis)
  (4, 'Paracetamol 500mg', '500mg', 'Three times daily', '3 days', 'manual'),
  (4, 'Cetirizine 10mg',   '10mg',  'Once at night',     '5 days', 'manual'),

  -- Consultation 5 (Ashan – LRTI)
  (5, 'Azithromycin 250mg', '500mg', 'Once daily', '5 days',  'manual'),
  (5, 'Salbutamol 2mg',     '2mg',   'As needed',  '14 days', 'manual');

-- -----------------------------------------------------------------------------
-- 10.12  Lab Requests
-- -----------------------------------------------------------------------------
INSERT INTO lab_requests (doctor_id, patient_id, laboratory_id, consultation_id, test_description, status) VALUES
  -- From consultation 1 — Saman to City Medical Lab (sent by patient)
  (2, 9, 7, 1,
   'Full Blood Count, HbA1c, Fasting Blood Glucose, Lipid Profile, Renal Function Test',
   'completed'),

  -- From consultation 2 — Priya to National Diagnostics (pending)
  (3, 10, 8, 2,
   'ECG, Echocardiogram, Full Blood Count, Renal Profile, Lipid Profile',
   'pending'),

  -- From consultation 5 — Ashan to City Medical Lab (in progress)
  (2, 11, 7, 5,
   'Full Blood Count, Sputum Culture and Sensitivity, CRP',
   'in_progress'),

  -- Standalone lab request from Doctor Nimal for Malini (not linked to a consultation)
  (3, 12, 8, NULL,
   'ESR, CRP, Rheumatoid Factor, Anti-CCP Antibody, Full Blood Count, Liver Function Test',
   'completed');

-- -----------------------------------------------------------------------------
-- 10.13  Lab View Requests
-- -----------------------------------------------------------------------------
INSERT INTO lab_view_requests (lab_request_id, doctor_id, patient_id, status, responded_at) VALUES
  -- Doctor Janaka wants to view Saman's completed report — patient accepted
  (1, 2, 9, 'accepted', NOW() - INTERVAL '2 days'),

  -- Doctor Nimal wants to view Malini's completed report — pending patient response
  (4, 3, 12, 'pending', NULL);

-- -----------------------------------------------------------------------------
-- 10.14  Data Access Requests
-- -----------------------------------------------------------------------------
INSERT INTO data_access_requests (doctor_id, patient_id, access_type, reason, status, responded_at) VALUES
  -- Dr. Janaka requesting Saman's medical history — accepted
  (2, 9,  'medical_history',  'Required for continuity of care and treatment planning', 'accepted', NOW() - INTERVAL '10 days'),
  -- Dr. Janaka requesting Saman's lab reports — accepted
  (2, 9,  'lab_reports',      'Needed to review previous test results', 'accepted', NOW() - INTERVAL '10 days'),
  -- Dr. Nimal requesting Priya's medical history — pending
  (3, 10, 'medical_history',  'Pre-surgery assessment', 'pending', NULL),
  -- Dr. Kamani requesting Malini's personal reports — declined
  (4, 12, 'personal_reports', 'Review previous imaging reports', 'declined', NOW() - INTERVAL '5 days');

-- -----------------------------------------------------------------------------
-- 10.15  Sample Notifications
-- -----------------------------------------------------------------------------
INSERT INTO notifications (user_id, type, title, message, data) VALUES
  -- Patient Saman: new consultation added
  (9,  'new_consultation',    'New Consultation Added',
   'Dr. Janaka Perera has created a consultation for you on Sat May 10 2026. Lab tests have been requested — please send them to a laboratory from your consultations page.',
   '{"consultation_id": 1}'),

  -- Patient Priya: new consultation added
  (10, 'new_consultation',    'New Consultation Added',
   'Dr. Nimal Fernando has created a consultation for you on Wed May 20 2026. Lab tests have been requested.',
   '{"consultation_id": 2}'),

  -- Patient Saman: lab report ready
  (9,  'lab_report_ready',    'Your Lab Report is Ready 🔬',
   'Your lab report from City Medical Laboratory is now available. View and download it from your portal.',
   '{"lab_request_id": 1}'),

  -- Doctor Janaka: lab report ready for Saman
  (2,  'lab_report_ready',    'Lab Report Ready 🔬',
   'Lab report for patient Saman Kumara is ready. City Medical Laboratory has uploaded the results.',
   '{"lab_request_id": 1}'),

  -- Patient Saman: doctor requesting to view lab report
  (9,  'lab_view_request',    'Doctor Wants to View Your Lab Report',
   'Dr. Janaka Perera has requested permission to view your lab report from City Medical Laboratory. Please review and respond.',
   '{"lab_view_request_id": 1, "lab_request_id": 1}'),

  -- Doctor Janaka: patient accepted lab view request
  (2,  'lab_view_accepted',   'Lab Report Access Granted ✅',
   'Saman Kumara accepted your request — you can now view the lab report from City Medical Laboratory.',
   '{"lab_view_request_id": 1, "lab_request_id": 1}'),

  -- Patient Saman: doctor requesting access to medical history
  (9,  'data_access_request', 'Doctor Requested Access to Your Data',
   'Dr. Janaka Perera has requested access to your Medical History. Please review and respond.',
   '{"access_request_id": 1}'),

  -- Pharmacist Sunil: new prescription assigned
  (5,  'consultation_assigned','New Prescription Assigned',
   'Dr. Janaka Perera has assigned a prescription for patient Saman Kumara. Please dispense the medicines.',
   '{"consultation_id": 1}'),

  -- Laboratory City Medical: new lab request
  (7,  'lab_request_assigned','New Lab Test Request',
   'Saman Kumara has requested lab tests for patient Saman Kumara. Please process and upload the report.',
   '{"lab_request_id": 1}');

-- =============================================================================
-- 11. HELPER VIEWS  (optional – useful for reporting)
-- =============================================================================

-- Active prescriptions per patient
CREATE OR REPLACE VIEW v_active_prescriptions AS
SELECT
  u.id         AS patient_id,
  u.name       AS patient_name,
  mc.id        AS consultation_id,
  mc.visit_date,
  cm.medicine_name,
  cm.dosage,
  cm.frequency,
  cm.duration,
  u2.name      AS doctor_name
FROM medical_consultations mc
JOIN consultation_medicines cm ON cm.consultation_id = mc.id
JOIN users u                   ON u.id  = mc.patient_id
LEFT JOIN users u2             ON u2.id = mc.doctor_id
WHERE mc.status = 'active';

-- Low stock medicines
CREATE OR REPLACE VIEW v_low_stock AS
SELECT
  m.id, m.name, m.generic_name, m.category,
  m.stock_quantity, m.reorder_level,
  (m.reorder_level - m.stock_quantity) AS shortage,
  s.name AS supplier_name,
  m.expiry_date
FROM medicines m
LEFT JOIN suppliers s ON s.id = m.supplier_id
WHERE m.stock_quantity <= m.reorder_level
  AND m.is_active = TRUE
ORDER BY shortage DESC;

-- Pending lab requests
CREATE OR REPLACE VIEW v_pending_lab_requests AS
SELECT
  lr.id,
  lr.test_description,
  lr.status,
  lr.created_at,
  pt.name  AS patient_name,
  dr.name  AS doctor_name,
  lp.lab_name
FROM lab_requests lr
JOIN users pt ON pt.id = lr.patient_id
LEFT JOIN users dr ON dr.id = lr.doctor_id
LEFT JOIN laboratory_profiles lp ON lp.user_id = lr.laboratory_id
WHERE lr.status IN ('pending','in_progress')
ORDER BY lr.created_at;

-- =============================================================================
-- 12. VERIFY
-- =============================================================================
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    RAISE NOTICE 'Table created: %', tbl.tablename;
  END LOOP;
END $$;

SELECT
  'users'               AS "table", COUNT(*) AS rows FROM users               UNION ALL
SELECT 'patient_profiles',          COUNT(*)        FROM patient_profiles      UNION ALL
SELECT 'doctor_profiles',           COUNT(*)        FROM doctor_profiles       UNION ALL
SELECT 'pharmacist_profiles',       COUNT(*)        FROM pharmacist_profiles   UNION ALL
SELECT 'laboratory_profiles',       COUNT(*)        FROM laboratory_profiles   UNION ALL
SELECT 'suppliers',                 COUNT(*)        FROM suppliers             UNION ALL
SELECT 'medicines',                 COUNT(*)        FROM medicines             UNION ALL
SELECT 'orders',                    COUNT(*)        FROM orders                UNION ALL
SELECT 'order_items',               COUNT(*)        FROM order_items           UNION ALL
SELECT 'sales',                     COUNT(*)        FROM sales                 UNION ALL
SELECT 'sale_items',                COUNT(*)        FROM sale_items            UNION ALL
SELECT 'medical_consultations',     COUNT(*)        FROM medical_consultations UNION ALL
SELECT 'consultation_medicines',    COUNT(*)        FROM consultation_medicines UNION ALL
SELECT 'lab_requests',              COUNT(*)        FROM lab_requests          UNION ALL
SELECT 'lab_view_requests',         COUNT(*)        FROM lab_view_requests     UNION ALL
SELECT 'data_access_requests',      COUNT(*)        FROM data_access_requests  UNION ALL
SELECT 'patient_reports',           COUNT(*)        FROM patient_reports       UNION ALL
SELECT 'notifications',             COUNT(*)        FROM notifications
ORDER BY 1;
