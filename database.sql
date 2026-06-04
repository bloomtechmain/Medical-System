-- =============================================================================
-- Core Health — Complete Database Schema
-- Run this file once on a fresh PostgreSQL database to set up all tables.
-- Equivalent to running every migration script in order.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USERS
-- Role includes 'laboratory' (added by migrateLabUser)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(20) NOT NULL DEFAULT 'patient'
             CHECK (role IN ('admin','doctor','pharmacist','patient','laboratory')),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PROFILE TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_profiles (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth            DATE,
  gender                   VARCHAR(10) CHECK (gender IN ('male','female','other')),
  phone                    VARCHAR(20),
  address                  TEXT,
  emergency_contact_name   VARCHAR(150),
  emergency_contact_phone  VARCHAR(20),
  blood_type               VARCHAR(5),
  allergies                TEXT,
  chronic_conditions       TEXT,
  insurance_provider       VARCHAR(150),
  insurance_policy_number  VARCHAR(100),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone                VARCHAR(20),
  specialization       VARCHAR(150),
  license_number       VARCHAR(100),
  medical_school       VARCHAR(200),
  years_experience     INTEGER DEFAULT 0,
  hospital_affiliation VARCHAR(200),
  consultation_fee     NUMERIC(10,2) DEFAULT 0,
  bio                  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pharmacist_profiles (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone               VARCHAR(20),
  license_number      VARCHAR(100),
  pharmacy_name       VARCHAR(200),
  pharmacy_address    TEXT,
  years_experience    INTEGER DEFAULT 0,
  specialization_area VARCHAR(150),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS laboratory_profiles (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- ---------------------------------------------------------------------------
-- PHARMACY — SUPPLIERS, MEDICINES, ORDERS, SALES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  contact    VARCHAR(100),
  phone      VARCHAR(20),
  email      VARCHAR(150),
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicines (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  generic_name   VARCHAR(200),
  category       VARCHAR(100),
  description    TEXT,
  unit           VARCHAR(20) NOT NULL DEFAULT 'tablet',
  price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level  INTEGER NOT NULL DEFAULT 10,
  expiry_date    DATE,
  supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  ordered_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','received','cancelled')),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL,
  unit_cost   NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  sold_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name  VARCHAR(150),
  total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT 'cash'
                 CHECK (payment_method IN ('cash','card','online')),
  sold_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL
);

-- ---------------------------------------------------------------------------
-- MEDICAL CONSULTATIONS
-- Consolidates all columns added across migrateAdditions and db.ts connectDB
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_consultations (
  id                     SERIAL PRIMARY KEY,
  patient_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_pharmacist_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visit_date             DATE NOT NULL,
  doctor_name            VARCHAR(200),
  hospital_clinic        VARCHAR(200),
  sick_description       TEXT,
  diagnosis              TEXT,
  treatment_description  TEXT,
  lab_tests_requested    TEXT,
  prescription_file      VARCHAR(500),
  ocr_text               TEXT,
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','dispensed','completed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultation_medicines (
  id              SERIAL PRIMARY KEY,
  consultation_id INTEGER NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
  medicine_name   VARCHAR(200) NOT NULL,
  dosage          VARCHAR(100),
  frequency       VARCHAR(100),
  duration        VARCHAR(100),
  notes           VARCHAR(300),
  source          VARCHAR(10) NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','ocr'))
);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(60) NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- LAB REQUESTS & LAB VIEW REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_requests (
  id               SERIAL PRIMARY KEY,
  doctor_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laboratory_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consultation_id  INTEGER REFERENCES medical_consultations(id) ON DELETE SET NULL,
  test_description TEXT NOT NULL,
  notes            TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','completed')),
  report_file      VARCHAR(500),
  report_mimetype  VARCHAR(100),
  report_notes     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_view_requests (
  id             SERIAL PRIMARY KEY,
  lab_request_id INTEGER NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  doctor_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message        TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined')),
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lvr_lab     ON lab_view_requests(lab_request_id);
CREATE INDEX IF NOT EXISTS idx_lvr_doctor  ON lab_view_requests(doctor_id);
CREATE INDEX IF NOT EXISTS idx_lvr_patient ON lab_view_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_lvr_status  ON lab_view_requests(status);

-- ---------------------------------------------------------------------------
-- DATA ACCESS REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_access_requests (
  id           SERIAL PRIMARY KEY,
  doctor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type  VARCHAR(50) NOT NULL
               CHECK (access_type IN ('lab_reports','medical_history','personal_reports','contact_info','vitals')),
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','declined')),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dar_doctor  ON data_access_requests(doctor_id);
CREATE INDEX IF NOT EXISTS idx_dar_patient ON data_access_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_dar_status  ON data_access_requests(status);

-- ---------------------------------------------------------------------------
-- PATIENT REPORTS (uploaded files)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_reports (
  id                 SERIAL PRIMARY KEY,
  patient_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              VARCHAR(255) NOT NULL,
  report_type        VARCHAR(50) NOT NULL
                     CHECK (report_type IN ('lab_report','prescription','imaging','discharge_summary','vaccination','other')),
  laboratory_name    VARCHAR(255),
  doctor_name        VARCHAR(255),
  hospital_clinic    VARCHAR(255),
  issued_date        DATE NOT NULL,
  description        TEXT,
  file_path          VARCHAR(500) NOT NULL,
  file_mimetype      VARCHAR(100),
  file_original_name VARCHAR(255),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PATIENT VITALS (auto-populated from lab report OCR + manual entry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_vitals (
  id                SERIAL PRIMARY KEY,
  patient_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- CBC Panel
  wbc               NUMERIC(7,2),
  rbc               NUMERIC(7,2),
  hemoglobin        NUMERIC(7,2),
  hematocrit        NUMERIC(7,2),
  mcv               NUMERIC(7,2),
  mch               NUMERIC(7,2),
  mchc              NUMERIC(7,2),
  rdw               NUMERIC(7,2),
  platelets         NUMERIC(8,2),
  mpv               NUMERIC(7,2),
  -- Metabolic Panel
  blood_glucose     NUMERIC(7,2),
  hba1c             NUMERIC(6,2),
  creatinine        NUMERIC(6,2),
  -- Lipid Panel
  cholesterol       NUMERIC(7,2),
  hdl               NUMERIC(7,2),
  ldl               NUMERIC(7,2),
  triglycerides     NUMERIC(7,2),
  -- Basic Vitals
  bp_systolic       INTEGER,
  bp_diastolic      INTEGER,
  heart_rate        INTEGER,
  temperature       NUMERIC(5,2),
  oxygen_saturation NUMERIC(5,2),
  -- Metadata
  source            VARCHAR(20) NOT NULL DEFAULT 'manual',
  lab_request_id    INTEGER REFERENCES lab_requests(id) ON DELETE SET NULL,
  notes             TEXT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_patient  ON patient_vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_pv_recorded ON patient_vitals(recorded_at DESC);

-- =============================================================================
-- SEED DATA
-- Default admin account + one sample supplier.
-- Admin login: admin@gmail.com / admin123
-- =============================================================================
INSERT INTO users (name, email, password, role)
VALUES (
  'Admin',
  'admin@gmail.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO suppliers (name, contact, phone, email)
VALUES ('MedSupply Co.', 'John Doe', '0771234567', 'supplier@medsupply.com')
ON CONFLICT DO NOTHING;
