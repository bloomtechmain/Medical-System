require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('./db');

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(150) NOT NULL,
        email      VARCHAR(150) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        role       VARCHAR(20) NOT NULL DEFAULT 'patient'
                   CHECK (role IN ('admin','doctor','pharmacist','patient')),
        is_active  BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
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
    `);

    await client.query(`
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
    `);

    await client.query(`
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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(150) NOT NULL,
        contact    VARCHAR(100),
        phone      VARCHAR(20),
        email      VARCHAR(150),
        address    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
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
    `);

    await client.query(`
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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        quantity    INTEGER NOT NULL,
        unit_cost   NUMERIC(10,2) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id             SERIAL PRIMARY KEY,
        sold_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
        customer_name  VARCHAR(150),
        total_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(20) DEFAULT 'cash'
                       CHECK (payment_method IN ('cash','card','online')),
        sold_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id          SERIAL PRIMARY KEY,
        sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
        quantity    INTEGER NOT NULL,
        unit_price  NUMERIC(10,2) NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_consultations (
        id                    SERIAL PRIMARY KEY,
        patient_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        visit_date            DATE NOT NULL,
        doctor_name           VARCHAR(200),
        hospital_clinic       VARCHAR(200),
        sick_description      TEXT,
        diagnosis             TEXT,
        treatment_description TEXT,
        prescription_file     VARCHAR(500),
        ocr_text              TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS consultation_medicines (
        id               SERIAL PRIMARY KEY,
        consultation_id  INTEGER NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
        medicine_name    VARCHAR(200) NOT NULL,
        dosage           VARCHAR(100),
        frequency        VARCHAR(100),
        duration         VARCHAR(100),
        notes            VARCHAR(300),
        source           VARCHAR(10) NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('manual','ocr'))
      );
    `);

    await client.query('COMMIT');
    console.log('All tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

createTables();
