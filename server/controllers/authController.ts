import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { pool, queryAs } from '../config/db';
import { DbUser } from '../types';

const generateToken = (
  user: Pick<DbUser, 'id' | 'email' | 'role'>,
  opts?: { expiresIn?: string; impersonatedBy?: number }
): string =>
  jwt.sign(
    {
      id: user.id, email: user.email, role: user.role,
      ...(opts?.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}),
    },
    process.env.JWT_SECRET as string,
    { expiresIn: (opts?.expiresIn || process.env.JWT_EXPIRES_IN || '7d') as any }
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
    const { name, email, password, role, profile, hospital_organization_ids } = req.body as {
      name: string; email: string; password: string; role: string; profile?: Record<string, any>;
      hospital_organization_ids?: number[];
    };

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }

    await client.query('BEGIN');

    // SEC-17 #2: patients have no credentials to verify, so they're active
    // immediately. Doctor/pharmacist/laboratory self-registration claims a
    // professional license/affiliation nothing here checks — same gap the
    // org-registration flow (organizationController.registerOrganization)
    // already closes by registering owners inactive pending admin review.
    // This mirrors that for the individual (no-org) registration path.
    const requiresApproval = role !== 'patient';
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await client.query<Pick<DbUser, 'id' | 'name' | 'email' | 'role'> & { is_active: boolean }>(
      'INSERT INTO users (name, email, password, role, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, is_active',
      [name, email, hash, role, !requiresApproval]
    );

    // patient_profiles lives in the `clinical` schema behind row-level
    // security. There's no authenticated session during registration, but
    // the user we just created *is* the actor for their own profile row,
    // so set the RLS context to them before inserting it.
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`,
      [String(user.id), role]
    );

    if (profile) await createProfile(client, role, user.id, profile);

    // A doctor can self-register already affiliated with 0+ existing hospitals/
    // clinics (more can be added later from Settings) — just membership rows,
    // same as the admin-driven addMember flow, no approval needed.
    if (role === 'doctor' && Array.isArray(hospital_organization_ids) && hospital_organization_ids.length) {
      const { rows: validOrgs } = await client.query(
        "SELECT id FROM public.organizations WHERE id = ANY($1) AND is_active = TRUE AND org_type IN ('hospital','clinic')",
        [hospital_organization_ids]
      );
      for (const org of validOrgs) {
        await client.query(
          `INSERT INTO public.organization_members (organization_id, user_id, member_role)
           VALUES ($1, $2, 'doctor') ON CONFLICT (organization_id, user_id) DO NOTHING`,
          [org.id, user.id]
        );
      }
    }

    await client.query('COMMIT');
    if (!user.is_active) {
      res.status(201).json({
        user,
        pending: true,
        message: 'Your account has been created and is pending admin approval. You will be able to log in once an admin approves it.',
      });
      return;
    }
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
      const { rows: p } = await queryAs({ id: req.user.id, role: req.user.role }, 'SELECT * FROM patient_profiles WHERE user_id = $1', [user.id]);
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

/**
 * Admin "View As" — mints a short-lived token for the target user so the
 * admin's browser session becomes that user for every subsequent request
 * (REST, RLS actor context, and socket room — see server/middleware/auth.ts
 * and server/config/socket.ts, both of which just trust whatever identity
 * is in the JWT). Logged to impersonation_log for "who viewed as whom and
 * when"; per-action logging (SEC-17 #7) happens separately in
 * middleware/auth.ts's protect(), the one place that sees every request.
 */
const impersonate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    const { rows } = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [targetId]);
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }

    const target = rows[0];
    if (!target.is_active) { res.status(400).json({ message: 'Cannot view as an inactive account.' }); return; }
    if (target.role === 'admin') { res.status(403).json({ message: 'Cannot view as another admin.' }); return; }

    const organization = await getOrgForUser(target.id);
    const { password: _, ...safeUser } = target;

    await pool.query(
      `INSERT INTO impersonation_log (admin_id, target_user_id, target_name, target_role) VALUES ($1,$2,$3,$4)`,
      [req.user.id, target.id, target.name, target.role]
    );

    res.json({
      user: { ...safeUser, organization },
      token: generateToken(target, { expiresIn: '4h', impersonatedBy: req.user.id }),
    });
  } catch (err) { next(err); }
};

const listImpersonations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT il.*, a.name AS admin_name
      FROM impersonation_log il
      JOIN users a ON a.id = il.admin_id
      ORDER BY il.started_at DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const listImpersonationActions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT ial.*, a.name AS admin_name, t.name AS target_name
      FROM impersonation_action_log ial
      JOIN users a ON a.id = ial.admin_id
      JOIN users t ON t.id = ial.target_user_id
      WHERE ($1::int IS NULL OR ial.admin_id = $1)
      ORDER BY ial.created_at DESC
      LIMIT 100
    `, [req.query.admin_id ? parseInt(req.query.admin_id as string, 10) : null]);
    res.json(rows);
  } catch (err) { next(err); }
};

export { register, login, getMe, createProfile, generateToken, impersonate, listImpersonations, listImpersonationActions };
