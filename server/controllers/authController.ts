import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { DbUser, JwtUser } from '../types';

const generateToken = (user: Pick<DbUser, 'id' | 'email' | 'role'>): string =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );

const getOrgForUser = async (userId: number) => {
  const { rows } = await pool.query(`
    SELECT o.id, o.name, o.org_type, o.slug, o.is_active
    FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id
    WHERE om.user_id = $1 AND om.member_role = 'owner'
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
};

/**
 * Inserts the role-specific profile row for a freshly-created user. Shared by
 * the individual registration flow (register, below) and the organization
 * self-registration flow (organizationController.registerOrganization) so the
 * per-role column mapping only lives in one place.
 */
const createProfile = async (
  client: { query: typeof pool.query },
  role: string,
  userId: number,
  profile: Record<string, any>
): Promise<void> => {
  if (role === 'patient') {
    await client.query(`
      INSERT INTO patient_profiles (
        user_id, date_of_birth, gender, phone, address,
        emergency_contact_name, emergency_contact_phone,
        blood_type, allergies, chronic_conditions,
        insurance_provider, insurance_policy_number
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      userId,
      profile.date_of_birth            || null,
      profile.gender                   || null,
      profile.phone                    || null,
      profile.address                  || null,
      profile.emergency_contact_name   || null,
      profile.emergency_contact_phone  || null,
      profile.blood_type               || null,
      profile.allergies                || null,
      profile.chronic_conditions       || null,
      profile.insurance_provider       || null,
      profile.insurance_policy_number  || null,
    ]);
  } else if (role === 'doctor') {
    await client.query(`
      INSERT INTO doctor_profiles (
        user_id, phone, specialization, license_number, medical_school,
        years_experience, hospital_affiliation, consultation_fee, bio
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      userId,
      profile.phone                || null,
      profile.specialization       || null,
      profile.license_number       || null,
      profile.medical_school       || null,
      parseInt(profile.years_experience) || 0,
      profile.hospital_affiliation || null,
      parseFloat(profile.consultation_fee) || 0,
      profile.bio                  || null,
    ]);
  } else if (role === 'pharmacist') {
    await client.query(`
      INSERT INTO pharmacist_profiles (
        user_id, phone, license_number, pharmacy_name, pharmacy_address,
        years_experience, specialization_area
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      userId,
      profile.phone               || null,
      profile.license_number      || null,
      profile.pharmacy_name       || null,
      profile.pharmacy_address    || null,
      parseInt(profile.years_experience) || 0,
      profile.specialization_area || null,
    ]);
  } else if (role === 'laboratory') {
    await client.query(`
      INSERT INTO laboratory_profiles (
        user_id, phone, lab_name, lab_type, license_number,
        accreditation, address, services_offered, operating_hours, website
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      userId,
      profile.phone            || null,
      profile.lab_name         || null,
      profile.lab_type         || null,
      profile.license_number   || null,
      profile.accreditation    || null,
      profile.address          || null,
      profile.services_offered || null,
      profile.operating_hours  || null,
      profile.website          || null,
    ]);
  }
};

const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { name, email, password, role, profile } = req.body as {
      name: string; email: string; password: string; role: string; profile?: Record<string, any>;
    };

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }

    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await client.query<Pick<DbUser, 'id' | 'name' | 'email' | 'role'>>(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hash, role]
    );

    if (profile) await createProfile(client, role, user.id, profile);

    await client.query('COMMIT');
    res.status(201).json({ user, token: generateToken(user as DbUser) });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const { rows } = await pool.query<DbUser>('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length) { res.status(401).json({ message: 'Invalid credentials' }); return; }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) { res.status(401).json({ message: 'Invalid credentials' }); return; }

    if (!user.is_active) {
      res.status(403).json({ message: 'This account is pending admin approval or has been deactivated. Please wait for approval or contact support.' });
      return;
    }

    const organization = await getOrgForUser(user.id);
    const { password: _, ...safeUser } = user;
    res.json({ user: { ...safeUser, organization }, token: generateToken(user) });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query<Omit<DbUser, 'password'>>(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }

    const user = rows[0];
    let profile: Record<string, unknown> | null = null;

    if (user.role === 'patient') {
      const { rows: p } = await pool.query('SELECT * FROM patient_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'doctor') {
      const { rows: p } = await pool.query('SELECT * FROM doctor_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'pharmacist') {
      const { rows: p } = await pool.query('SELECT * FROM pharmacist_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    } else if (user.role === 'laboratory') {
      const { rows: p } = await pool.query('SELECT * FROM laboratory_profiles WHERE user_id = $1', [user.id]);
      profile = p[0] || null;
    }

    const organization = await getOrgForUser(req.user.id);
    res.json({ ...user, profile, organization });
  } catch (err) {
    next(err);
  }
};

export { register, login, getMe, createProfile, generateToken };
