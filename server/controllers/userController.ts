import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role } = req.query as { role?: string };
    let query = 'SELECT id, name, email, role, is_active, created_at FROM users';
    const params: string[] = [];
    if (role) { query += ' WHERE role = $1'; params.push(role); }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const getOneWithProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    const user = rows[0];
    let profile: Record<string, unknown> | null = null;
    if (user.role === 'patient') {
      const { rows: p } = await pool.query('SELECT * FROM clinical.patient_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'doctor') {
      const { rows: p } = await pool.query('SELECT * FROM public.doctor_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'pharmacist') {
      const { rows: p } = await pool.query('SELECT * FROM public.pharmacist_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'laboratory') {
      const { rows: p } = await pool.query('SELECT * FROM public.laboratory_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    }
    res.json({ ...user, profile });
  } catch (err) { next(err); }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, role, is_active } = req.body as {
      name: string; email: string; role: string; is_active: boolean;
    };
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, email=$2, role=$3, is_active=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id, name, email, role, is_active`,
      [name, email, role, is_active, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const updateWithProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { name, email, is_active, password, profile } = req.body as {
      name: string; email: string; is_active: boolean; password?: string;
      profile?: Record<string, string>;
    };

    const setClauses = ['name=$1', 'email=$2', 'is_active=$3', 'updated_at=NOW()'];
    const params: unknown[] = [name, email, is_active === true || (is_active as unknown as string) === 'true'];

    if (password && password.trim()) {
      const hash = await bcrypt.hash(password, 10);
      setClauses.push(`password=$${params.length + 1}`);
      params.push(hash);
    }
    params.push(req.params.id);

    const { rows } = await client.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id=$${params.length} RETURNING id, name, email, role, is_active`,
      params
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    const user = rows[0];

    if (profile && Object.keys(profile).length) {
      if (user.role === 'doctor') {
        await client.query(`
          INSERT INTO public.doctor_profiles (user_id, phone, specialization, license_number, medical_school, years_experience, hospital_affiliation, consultation_fee, bio)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (user_id) DO UPDATE SET
            phone=$2, specialization=$3, license_number=$4, medical_school=$5,
            years_experience=$6, hospital_affiliation=$7, consultation_fee=$8, bio=$9, updated_at=NOW()
        `, [user.id, profile.phone||null, profile.specialization||null, profile.license_number||null,
            profile.medical_school||null, parseInt(profile.years_experience)||0,
            profile.hospital_affiliation||null, parseFloat(profile.consultation_fee)||0, profile.bio||null]);
      } else if (user.role === 'pharmacist') {
        await client.query(`
          INSERT INTO public.pharmacist_profiles (user_id, phone, license_number, pharmacy_name, pharmacy_address, years_experience, specialization_area)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (user_id) DO UPDATE SET
            phone=$2, license_number=$3, pharmacy_name=$4, pharmacy_address=$5, years_experience=$6, specialization_area=$7, updated_at=NOW()
        `, [user.id, profile.phone||null, profile.license_number||null, profile.pharmacy_name||null,
            profile.pharmacy_address||null, parseInt(profile.years_experience)||0, profile.specialization_area||null]);
      } else if (user.role === 'patient') {
        await client.query(`
          INSERT INTO clinical.patient_profiles (user_id, date_of_birth, gender, phone, address, blood_type, allergies, chronic_conditions)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (user_id) DO UPDATE SET
            date_of_birth=$2, gender=$3, phone=$4, address=$5, blood_type=$6, allergies=$7, chronic_conditions=$8, updated_at=NOW()
        `, [user.id, profile.date_of_birth||null, profile.gender||null, profile.phone||null,
            profile.address||null, profile.blood_type||null, profile.allergies||null, profile.chronic_conditions||null]);
      } else if (user.role === 'laboratory') {
        await client.query(`
          INSERT INTO public.laboratory_profiles (user_id, phone, lab_name, lab_type, license_number, accreditation, address, services_offered, operating_hours)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (user_id) DO UPDATE SET
            phone=$2, lab_name=$3, lab_type=$4, license_number=$5, accreditation=$6, address=$7, services_offered=$8, operating_hours=$9, updated_at=NOW()
        `, [user.id, profile.phone||null, profile.lab_name||null, profile.lab_type||null,
            profile.license_number||null, profile.accreditation||null, profile.address||null,
            profile.services_offered||null, profile.operating_hours||null]);
      }
    }

    let updatedProfile: Record<string, unknown> | null = null;
    if (user.role === 'doctor') {
      const { rows: p } = await client.query('SELECT * FROM public.doctor_profiles WHERE user_id = $1', [user.id]);
      updatedProfile = p[0] || null;
    } else if (user.role === 'pharmacist') {
      const { rows: p } = await client.query('SELECT * FROM public.pharmacist_profiles WHERE user_id = $1', [user.id]);
      updatedProfile = p[0] || null;
    } else if (user.role === 'patient') {
      const { rows: p } = await client.query('SELECT * FROM clinical.patient_profiles WHERE user_id = $1', [user.id]);
      updatedProfile = p[0] || null;
    } else if (user.role === 'laboratory') {
      const { rows: p } = await client.query('SELECT * FROM public.laboratory_profiles WHERE user_id = $1', [user.id]);
      updatedProfile = p[0] || null;
    }

    res.json({ ...user, profile: updatedProfile });
  } catch (err) { next(err); } finally { client.release(); }
};

const toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, email, role, is_active`,
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) { res.status(404).json({ message: 'User not found' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

const getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Phase 1: get tenant schema names for dynamic cross-tenant queries
    const [pharmacyRes, hospitalRes] = await Promise.all([
      pool.query(
        "SELECT schema_name FROM public.organizations WHERE org_type='pharmacy' AND schema_name IS NOT NULL AND is_active=TRUE"
      ),
      pool.query(
        "SELECT schema_name FROM public.organizations WHERE org_type IN ('hospital','clinic') AND schema_name IS NOT NULL AND is_active=TRUE"
      ),
    ]);

    const pharmacySchemas: string[] = pharmacyRes.rows.map((r: any) => r.schema_name);
    const hospitalSchemas: string[] = hospitalRes.rows.map((r: any) => r.schema_name);

    // Build cross-tenant SQL (schema names come from DB, not user input)
    const salesSQL = pharmacySchemas.length
      ? `SELECT COUNT(*)::bigint AS total_sales,
                COALESCE(SUM(total_amount),0)::numeric AS total_revenue,
                COUNT(*) FILTER (WHERE sold_at >= NOW() - INTERVAL '30 days')::bigint AS sales_this_month
         FROM (${pharmacySchemas.map(s => `SELECT total_amount, sold_at FROM "${s}".sales`).join(' UNION ALL ')}) _s`
      : `SELECT 0::bigint AS total_sales, 0::numeric AS total_revenue, 0::bigint AS sales_this_month`;

    const apptSQL = hospitalSchemas.length
      ? `SELECT COUNT(*)::bigint AS total_appointments,
                COUNT(*) FILTER (WHERE status='scheduled')::bigint AS upcoming_appointments,
                COUNT(*) FILTER (WHERE status='completed')::bigint AS completed_appointments
         FROM (${hospitalSchemas.map(s => `SELECT status FROM "${s}".appointments`).join(' UNION ALL ')}) _a`
      : `SELECT 0::bigint AS total_appointments, 0::bigint AS upcoming_appointments, 0::bigint AS completed_appointments`;

    // Phase 2: run all stats in parallel
    const [userRes, orgRes, medRes, consultRes, labRes, salesRow, apptRow, recentRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE role='patient')    AS total_patients,
          COUNT(*) FILTER (WHERE role='doctor')     AS total_doctors,
          COUNT(*) FILTER (WHERE role='pharmacist') AS total_pharmacists,
          COUNT(*) FILTER (WHERE role='laboratory') AS total_laboratories,
          COUNT(*) FILTER (WHERE role='admin')      AS total_admins,
          COUNT(*)                                   AS total_users,
          COUNT(*) FILTER (WHERE is_active=TRUE)    AS active_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
        FROM public.users
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE org_type='hospital')   AS total_hospitals,
          COUNT(*) FILTER (WHERE org_type='pharmacy')   AS total_pharmacies,
          COUNT(*) FILTER (WHERE org_type='laboratory') AS total_laboratories,
          COUNT(*) FILTER (WHERE org_type='clinic')     AS total_clinics,
          COUNT(*)                                       AS total_organizations
        FROM public.organizations WHERE is_active=TRUE
      `),
      pool.query(`
        SELECT
          COUNT(*)                                             AS total_medicines,
          COUNT(*) FILTER (WHERE stock_quantity <= reorder_level) AS low_stock,
          COUNT(*) FILTER (WHERE expiry_date < NOW())         AS expired
        FROM public.medicines WHERE is_active=TRUE
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_consultations,
          COUNT(*) FILTER (WHERE status='active')           AS active_consultations,
          COUNT(*) FILTER (WHERE status='completed')        AS completed_consultations
        FROM clinical.medical_consultations
      `),
      pool.query(`
        SELECT
          COUNT(*)                                          AS total_lab_requests,
          COUNT(*) FILTER (WHERE status='pending')          AS pending_lab_requests,
          COUNT(*) FILTER (WHERE status='completed')        AS completed_lab_requests
        FROM clinical.lab_requests
      `),
      pool.query(salesSQL),
      pool.query(apptSQL),
      pool.query(`
        SELECT id, name, email, role, is_active, created_at
        FROM public.users ORDER BY created_at DESC LIMIT 8
      `),
    ]);

    res.json({
      users:         userRes.rows[0],
      organizations: orgRes.rows[0],
      medicines:     medRes.rows[0],
      consultations: consultRes.rows[0],
      labs:          labRes.rows[0],
      sales:         salesRow.rows[0],
      appointments:  apptRow.rows[0],
      recentUsers:   recentRes.rows,
    });
  } catch (err) { next(err); }
};

const searchPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.phone, p.date_of_birth, p.blood_type, p.gender
      FROM public.users u
      LEFT JOIN clinical.patient_profiles p ON p.user_id = u.id
      WHERE u.role = 'patient' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

const searchPharmacists = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.pharmacy_name, p.pharmacy_address, p.phone,
             p.license_number, p.specialization_area
      FROM public.users u
      LEFT JOIN public.pharmacist_profiles p ON p.user_id = u.id
      WHERE u.role = 'pharmacist' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR p.pharmacy_name ILIKE $1
             OR p.pharmacy_address ILIKE $1 OR u.email ILIKE $1)
      ORDER BY p.pharmacy_name NULLS LAST, u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

const searchLaboratories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q = '' } = req.query as { q?: string };
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active,
             p.lab_name, p.lab_type, p.address, p.phone,
             p.accreditation, p.operating_hours, p.services_offered, p.license_number
      FROM public.users u
      LEFT JOIN public.laboratory_profiles p ON p.user_id = u.id
      WHERE u.role = 'laboratory' AND u.is_active = TRUE
        AND (u.name ILIKE $1 OR p.lab_name ILIKE $1
             OR p.address ILIKE $1 OR p.lab_type ILIKE $1
             OR u.email ILIKE $1)
      ORDER BY p.lab_name NULLS LAST, u.name LIMIT 20
    `, [`%${q}%`]);
    res.json(rows);
  } catch (err) { next(err); }
};

export { getAll, getOne, getOneWithProfile, update, updateWithProfile, toggleActive, remove, getStats, searchPatients, searchPharmacists, searchLaboratories };
