import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, revokeRefreshTokens } from '../config/db';
import { sendMail } from '../config/mailer';
import { audit, AuditAction } from '../utils/auditLog';
import { DbUser } from '../types';

const MFA_PENDING_PURPOSE = 'mfa_pending';
const REFRESH_TOKEN_DAYS = 7;
const MIN_PASSWORD_LENGTH = 10;

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
    // SEC-17 (auth): the access token used to live 7 days with nothing able
    // to revoke it early. It's now short-lived — the refresh token below is
    // what actually controls session length, and that one IS revocable.
    { expiresIn: (opts?.expiresIn || process.env.JWT_EXPIRES_IN || '15m') as any }
  );

const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// Opaque (not JWT) random token — only its hash is ever stored, so a DB leak
// doesn't hand out working sessions. Not issued for impersonation sessions
// (those stay hard-capped at their own short expiresIn, by design — no
// silent renewal of a "View As" session).
const issueRefreshToken = async (userId: number): Promise<string> => {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, hashRefreshToken(token), expiresAt]
  );
  return token;
};

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
    // PRO-29: the existence check above races with a second concurrent
    // registration for the same email — both can pass it before either
    // commits. The unique constraint on users.email is what actually
    // prevents the duplicate; map its violation to the same 409 instead of
    // letting it fall through to errorHandler as a raw 500.
    let user: Pick<DbUser, 'id' | 'name' | 'email' | 'role'> & { is_active: boolean };
    try {
      ({ rows: [user] } = await client.query<Pick<DbUser, 'id' | 'name' | 'email' | 'role'> & { is_active: boolean }>(
        'INSERT INTO users (name, email, password, role, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, is_active',
        [name, email, hash, role, !requiresApproval]
      ));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        await client.query('ROLLBACK');
        res.status(409).json({ message: 'Email already in use' });
        return;
      }
      throw err;
    }

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
    res.status(201).json({ user, token: generateToken(user as DbUser), refreshToken: await issueRefreshToken(user.id) });
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
    if (!rows.length) {
      // MON-12/WARN-11: failed logins were not recorded anywhere, so neither
      // "this account is being brute-forced" nor "one address is trying
      // hundreds of accounts" was answerable. actorId is null here on purpose
      // — there is no user to point at, and that is itself the signal. The
      // attempted address goes in metadata so the pattern is still visible.
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'failure',
        actorId: null,
        actorEmail: email,
        metadata: { reason: 'unknown_email' },
      });
      res.status(401).json({ message: 'Invalid credentials' }); return;
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'failure',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: { reason: 'wrong_password' },
      });
      res.status(401).json({ message: 'Invalid credentials' }); return;
    }

    if (!user.is_active) {
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'denied',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: { reason: 'inactive_account' },
      });
      res.status(403).json({ message: 'This account is pending admin approval or has been deactivated. Please wait for approval or contact support.' });
      return;
    }

    // SEC-14: password alone isn't enough for an MFA-enrolled account — hand
    // back a short-lived pre-auth token (not a real session) that only proves
    // "this request already knows the password"; mfaLogin exchanges it + a
    // valid TOTP code for the actual session token.
    if (user.mfa_enabled) {
      const mfaToken = jwt.sign(
        { id: user.id, purpose: MFA_PENDING_PURPOSE },
        process.env.JWT_SECRET as string,
        { expiresIn: '5m' }
      );
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    const organization = await getOrgForUser(user.id);
    const { password: _, mfa_secret: __, ...safeUser } = user;
    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { mfa: false },
    });
    res.json({ user: { ...safeUser, organization }, token: generateToken(user), refreshToken: await issueRefreshToken(user.id) });
  } catch (err) {
    next(err);
  }
};

const mfaLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { mfaToken, code } = req.body as { mfaToken: string; code: string };
    let payload: { id: number; purpose: string };
    try {
      payload = jwt.verify(mfaToken, process.env.JWT_SECRET as string) as typeof payload;
    } catch {
      res.status(401).json({ message: 'MFA session expired, please log in again' });
      return;
    }
    if (payload.purpose !== MFA_PENDING_PURPOSE) {
      res.status(401).json({ message: 'Invalid MFA session' });
      return;
    }

    const { rows } = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.id]);
    const user = rows[0];
    if (!user || !user.is_active || !user.mfa_enabled || !user.mfa_secret) {
      res.status(401).json({ message: 'Invalid MFA session' });
      return;
    }

    if (!code || !authenticator.verify({ token: String(code), secret: user.mfa_secret })) {
      // Worth separating from a wrong password: this is someone who already
      // has the password and is failing only the second factor.
      audit(req, {
        action: AuditAction.MFA_CHALLENGE_FAILURE,
        outcome: 'failure',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
      });
      res.status(401).json({ message: 'Invalid authentication code' });
      return;
    }

    const organization = await getOrgForUser(user.id);
    const { password: _, mfa_secret: __, ...safeUser } = user;
    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { mfa: true },
    });
    res.json({ user: { ...safeUser, organization }, token: generateToken(user), refreshToken: await issueRefreshToken(user.id) });
  } catch (err) {
    next(err);
  }
};

// SEC-14 — admin-only TOTP MFA. Two-step enrollment: mfaSetup generates and
// stores a secret but leaves mfa_enabled false; mfaVerifySetup only flips it
// to true once the admin proves (by entering a live code) their authenticator
// app actually has that secret, so a setup call that's never completed can't
// accidentally lock an account out.
const mfaSetup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = authenticator.generateSecret();
    await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.id]);
    const uri = authenticator.keyuri(req.user.email, 'Core Health', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(uri);
    res.json({ secret, qrCodeDataUrl });
  } catch (err) { next(err); }
};

const mfaVerifySetup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code } = req.body as { code: string };
    const { rows } = await pool.query<DbUser>('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length || !rows[0].mfa_secret) {
      res.status(400).json({ message: 'Start MFA setup first' });
      return;
    }
    if (!code || !authenticator.verify({ token: String(code), secret: rows[0].mfa_secret })) {
      res.status(400).json({ message: 'Invalid authentication code' });
      return;
    }
    await pool.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [req.user.id]);
    res.json({ mfa_enabled: true });
  } catch (err) { next(err); }
};

const mfaDisable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code } = req.body as { code: string };
    const { rows } = await pool.query<DbUser>('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length || !rows[0].mfa_enabled || !rows[0].mfa_secret) {
      res.status(400).json({ message: 'MFA is not enabled' });
      return;
    }
    if (!code || !authenticator.verify({ token: String(code), secret: rows[0].mfa_secret })) {
      res.status(400).json({ message: 'Invalid authentication code' });
      return;
    }
    await pool.query('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [req.user.id]);
    res.json({ mfa_enabled: false });
  } catch (err) { next(err); }
};

const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query<Omit<DbUser, 'password'>>(
      'SELECT id, name, email, role, is_active, mfa_enabled, created_at FROM users WHERE id = $1',
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
    const targetId = parseInt(String(req.params.userId), 10);
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
    // Also recorded in the central audit log, so "everything that touched
    // this user" is one query rather than a union across two tables.
    audit(req, {
      action: AuditAction.IMPERSONATION_STARTED,
      targetType: 'user',
      targetId: target.id,
      patientUserId: target.role === 'patient' ? target.id : null,
      metadata: { targetRole: target.role },
    });

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

// SEC-17 (auth): exchanges a still-valid refresh token for a new access
// token. Rotates the refresh token too (old row marked revoked, new one
// issued) rather than reusing it — a refresh token that's presented twice
// after being rotated is a sign of theft, not just normal renewal.
const refreshAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) { res.status(401).json({ message: 'Refresh token required' }); return; }

    const hash = hashRefreshToken(refreshToken);
    const { rows } = await pool.query(
      `SELECT id, user_id FROM public.refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [hash]
    );
    if (!rows.length) { res.status(401).json({ message: 'Invalid or expired refresh token' }); return; }

    const { rows: userRows } = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [rows[0].user_id]);
    if (!userRows.length || !userRows[0].is_active) {
      res.status(401).json({ message: 'Invalid or expired refresh token' });
      return;
    }
    const user = userRows[0];

    await pool.query('UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE id = $1', [rows[0].id]);
    res.json({ token: generateToken(user), refreshToken: await issueRefreshToken(user.id) });
  } catch (err) { next(err); }
};

// Best-effort session kill: revokes one refresh token (the one this device
// holds). Not authenticated by Bearer token on purpose — by the time a user
// hits logout their access token may already be near expiry or gone from
// memory; the refresh token itself is the credential being revoked.
const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await pool.query(
        'UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [hashRefreshToken(refreshToken)]
      );
    }
    res.status(204).end();
  } catch (err) { next(err); }
};

// SEC-17 (auth): self-service password change — any logged-in user, not
// just admin-edits-someone-else (userController.updateWithProfile already
// covered that path). Requires the current password so a hijacked but
// still-live access token can't silently lock the real owner out by
// changing it to something only the attacker knows. Revokes every refresh
// token for the account afterward — including the one this session is
// using — same as GitHub/Google's "change password → signed out
// everywhere" behavior, so the new password is required to get back in.
const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new password are required' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    const { rows } = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) { res.status(404).json({ message: 'User not found' }); return; }
    const user = rows[0];

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) { res.status(401).json({ message: 'Current password is incorrect' }); return; }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
    await revokeRefreshTokens(user.id);

    audit(req, {
      action: AuditAction.PASSWORD_CHANGED_SELF,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetType: 'user',
      targetId: user.id,
    });
    res.json({ message: 'Password changed. Please log in again.' });
  } catch (err) { next(err); }
};

const PASSWORD_RESET_MINUTES = 60;

// SEC-17 (auth): forgot-password, step 1 — always responds the same way
// whether or not the email matches an account, so this can't be used to
// enumerate registered emails. If it does match an active account, a
// one-hour opaque token is generated (same hashed-at-rest pattern as
// refresh tokens) and emailed via config/mailer (logs to console if SMTP
// isn't configured, see that file).
const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    const generic = { message: 'If an account with that email exists, a password reset link has been sent.' };

    const { rows } = await pool.query<DbUser>('SELECT id, name, email, is_active FROM users WHERE email = $1', [email]);
    if (!rows.length || !rows[0].is_active) { res.json(generic); return; }
    const user = rows[0];

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000);
    await pool.query(
      'INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [user.id, hashRefreshToken(token), expiresAt]
    );

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      'Reset your Core Health password',
      `<p>Hi ${user.name},</p>
       <p>Click the link below to reset your password. This link expires in ${PASSWORD_RESET_MINUTES} minutes and can only be used once.</p>
       <p><a href="${resetUrl}">${resetUrl}</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    );

    res.json(generic);
  } catch (err) { next(err); }
};

// SEC-17 (auth), step 2 — redeems a reset token. used_at is checked (not
// just expires_at) so an already-redeemed link can't be replayed even
// within its validity window. Revokes every refresh token for the account,
// same as changePassword — a password reset is exactly the scenario where
// you want every existing session killed, not just this one.
const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    if (!token || !newPassword) { res.status(400).json({ message: 'Token and new password are required' }); return; }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, user_id FROM public.password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [hashRefreshToken(token)]
    );
    if (!rows.length) { res.status(400).json({ message: 'Invalid or expired reset link' }); return; }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, rows[0].user_id]);
    await pool.query('UPDATE public.password_reset_tokens SET used_at = NOW() WHERE id = $1', [rows[0].id]);
    await revokeRefreshTokens(rows[0].user_id);

    // An unauthenticated path: the actor is the account being reset, proven
    // only by possession of the emailed token. Worth recording precisely
    // because it is the one way to take over an account without the password.
    audit(req, {
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      actorId: rows[0].user_id,
      targetType: 'user',
      targetId: rows[0].user_id,
    });
    res.json({ message: 'Password reset. Please log in with your new password.' });
  } catch (err) { next(err); }
};

export { register, login, mfaLogin, mfaSetup, mfaVerifySetup, mfaDisable, getMe, createProfile, generateToken, impersonate, listImpersonations, listImpersonationActions, refreshAccessToken, logout, changePassword, forgotPassword, resetPassword };
