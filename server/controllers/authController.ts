import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { pool, queryAs, revokeRefreshTokens } from '../config/db';
import { sendMail } from '../config/mailer';
import { audit, AuditAction } from '../utils/auditLog';
import { isEnabled } from '../config/featureFlags';
import { logger } from '../config/logger';
import { DbUser } from '../types';
import { audienceForRole } from '../config/planCatalog';
import { resolveRegistrationPlan, effectivePlanForUser, toPlan, Plan } from '../utils/plans';
import { recordRegistrationPlan } from './planController';
import { sendNotification } from '../utils/notify';
import { verificationCodeEmail, passwordResetEmail } from '../utils/emailTemplates';
import { sendWelcomeEmail, sendPasswordChangedEmail } from '../utils/accountEmails';

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

// Requirement 1: a user can hold more than one context at once. The obvious
// case is a doctor who is also registered as the owner of a hospital — they
// have their own doctor dashboard AND the hospital's.
//
// This used to be a single LIMIT 1 lookup, and RoleHome then preferred the
// organisation over the user's own role. The effect was that picking an
// existing doctor as a hospital owner silently took away that doctor's
// dashboard: their credentials only ever reached /hospital from then on, with
// no route back to /doctor and no indication anything had been lost.
//
// Returned as a list so the client can offer a choice and a switcher. Kept as
// `organization` (the first owned org) as well, for the existing callers that
// read user.organization — removing that is a separate change.
//
// Migration 014: each membership carries its organisation's package (or the
// default one when none is set), so the client can decide which sections of
// that dashboard to show without a request per screen. The server still
// enforces the package on every gated request; this is only for display.
const getMembershipsForUser = async (userId: number) => {
  const { rows } = await pool.query(`
    SELECT o.id, o.name, o.org_type, o.slug, o.is_active, om.member_role,
           to_jsonb(p) AS plan_row
    FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id
    LEFT JOIN public.plans d ON d.audience = o.org_type AND d.is_default
    LEFT JOIN public.plans p ON p.id = COALESCE(o.plan_id, d.id)
    WHERE om.user_id = $1
      -- A suspended organisation must not appear as somewhere to log in to.
      AND o.is_active = TRUE
    ORDER BY
      -- Ownership first: if someone both owns one org and is a member of
      -- another, the one they own is the more likely default.
      CASE WHEN om.member_role = 'owner' THEN 0 ELSE 1 END,
      o.name
  `, [userId]);
  return rows.map(({ plan_row, ...m }) => ({ ...m, plan: plan_row ? toPlan(plan_row) : null }));
};

// The package for the user's own (role) dashboard. null for patients and
// admins, who are never on a package.
const personalPlan = async (user: { id: number; role: string }): Promise<Plan | null> =>
  (await effectivePlanForUser(user))?.plan ?? null;

const getOrgForUser = async (userId: number) => {
  const memberships = await getMembershipsForUser(userId);
  return memberships.find(m => m.member_role === 'owner') ?? memberships[0] ?? null;
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
    const { name, email, password, role, profile, hospital_organization_ids, accepted_terms_version, plan_id } = req.body as {
      name: string; email: string; password: string; role: string; profile?: Record<string, any>;
      hospital_organization_ids?: number[]; accepted_terms_version?: string; plan_id?: number;
    };

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }

    // Migration 014: a professional picks a package at sign-up (none chosen =
    // the free default). Patients have no package — everything is free for
    // them — so plan_id is ignored for a patient rather than rejected.
    const audience = audienceForRole(role);
    let plan: Plan | null = null;
    if (audience) {
      const chosen = await resolveRegistrationPlan(audience, plan_id);
      if ('error' in chosen) { res.status(400).json({ message: chosen.error }); return; }
      plan = chosen.plan;
      const affiliationLimit = plan?.features.hospital_affiliations;
      if (role === 'doctor' && typeof affiliationLimit === 'number'
          && Array.isArray(hospital_organization_ids) && hospital_organization_ids.length > affiliationLimit) {
        res.status(400).json({
          code: 'PLAN_LIMIT_REACHED',
          feature: 'hospital_affiliations',
          message: `The ${plan?.name} package allows ${affiliationLimit} hospital/clinic affiliation(s). Remove some, or choose a bigger package.`,
        });
        return;
      }
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
      // COMP-02: record which version of the terms/privacy policy was on
      // screen when they agreed. The timestamp comes from the database,
      // not the client, so it cannot be backdated. NULL is left as NULL
      // rather than defaulted to the current version — "we don't know what
      // they agreed to" is the truth for anyone who registered before the
      // documents existed, and inventing a value would destroy that.
      ({ rows: [user] } = await client.query<Pick<DbUser, 'id' | 'name' | 'email' | 'role'> & { is_active: boolean }>(
        `INSERT INTO users (name, email, password, role, is_active, accepted_terms_version, accepted_terms_at, plan_id)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6::varchar IS NULL THEN NULL ELSE NOW() END, $7)
         RETURNING id, name, email, role, is_active`,
        [name, email, hash, role, !requiresApproval, accepted_terms_version || null, plan?.id ?? null]
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
    if (plan) await recordRegistrationPlan(client, { userId: user.id }, plan.id);

    // Migration 015: a doctor names the hospitals/clinics they work at, and
    // each one has to vouch for that. These used to be written straight into
    // organization_members — affiliated on the doctor's say-so, with nobody
    // at the hospital asked. Now each becomes a registration request the
    // owner certifies or rejects from their dashboard; the membership row is
    // only created when they certify (orgMembershipRequestController.respond),
    // and the admin cannot approve the account until all are answered.
    let certifyingOrgs: { id: number; name: string }[] = [];
    if (role === 'doctor' && Array.isArray(hospital_organization_ids) && hospital_organization_ids.length) {
      const ids = [...new Set(hospital_organization_ids.map(Number).filter(Number.isInteger))];
      ({ rows: certifyingOrgs } = await client.query(
        "SELECT id, name FROM public.organizations WHERE id = ANY($1) AND is_active = TRUE AND org_type IN ('hospital','clinic')",
        [ids]
      ));
      for (const org of certifyingOrgs) {
        await client.query(
          `INSERT INTO public.organization_membership_requests
             (organization_id, doctor_id, kind, requested_by, is_registration, message)
           VALUES ($1, $2, 'join', $2, TRUE, $3)
           ON CONFLICT DO NOTHING`,
          [org.id, user.id, 'Registered on Suwela and listed this organisation as a place they work.']
        );
      }
    }

    await client.query('COMMIT');

    // Ask each organisation to certify. After COMMIT so a notification can
    // never point at a request that was rolled back.
    for (const org of certifyingOrgs) {
      try {
        const { rows: [owner] } = await pool.query(
          "SELECT user_id FROM public.organization_members WHERE organization_id=$1 AND member_role='owner' LIMIT 1",
          [org.id]
        );
        if (owner) {
          await sendNotification(owner.user_id, 'org_registration_certification', 'Certify a new doctor',
            `Dr. ${user.name} has registered on Suwela and says they work at ${org.name}. Please confirm or reject this from your Team page.`,
            { organization_id: org.id, doctor_id: user.id });
        }
      } catch (notifyErr) {
        logger.error({ err: notifyErr, orgId: org.id }, 'Could not notify organisation owner about a registration to certify');
      }
    }

    // PRO-11 / migration 017: email the 6-digit code. After COMMIT,
    // deliberately — the account must exist before a code pointing at it goes
    // out, and a mail failure must not roll back a successfully created
    // account (the screen that asks for the code has a "send a new code"
    // button). Every role gets it now, professionals included: confirming the
    // address up front means the admin only ever reviews registrations with a
    // working inbox, and nobody is left holding a dead link for days while
    // their registration waits in the queue.
    const verificationRequired = isEnabled('REQUIRE_EMAIL_VERIFICATION');
    let codeSent = false;
    if (verificationRequired) {
      try {
        await sendVerificationEmail({ id: user.id, name: user.name, email: user.email });
        codeSent = true;
      } catch (mailErr) {
        logger.error({ err: mailErr, userId: user.id }, 'Could not send verification code at registration');
      }
    }

    if (verificationRequired) {
      res.status(201).json({
        user,
        email: user.email,
        emailVerificationRequired: true,
        codeSent,
        pending: !user.is_active,
        awaitingApproval: !user.is_active,
        message: codeSent
          ? `We sent a 6-digit code to ${user.email}. Enter it to finish creating your account.`
          : 'Your account was created, but we could not send the code just now. Press "Send a new code" to try again.',
      });
      return;
    }

    // No code step in this environment, so the welcome goes out now.
    void sendWelcomeEmail(user, !user.is_active);

    if (!user.is_active) {
      res.status(201).json({
        user,
        pending: true,
        awaitingApproval: true,
        emailVerificationRequired: false,
        message: 'Your registration has been received and is waiting for an administrator to approve it. You will be able to log in once it is approved.',
      });
      return;
    }

    res.status(201).json({ ...(await sessionPayload(user as DbUser)) });
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
      // Migration 012: approved_at is what tells these two apart. The old
      // message said "pending admin approval or has been deactivated", which
      // is wrong for both readers — a waiting applicant is told they were
      // switched off, and a suspended account is told to wait for something
      // that will never come.
      const awaitingApproval = !user.approved_at;
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'denied',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: { reason: awaitingApproval ? 'awaiting_approval' : 'deactivated' },
      });
      // Migration 015: the password has been verified, so the applicant can
      // be shown where their registration stands — which hospitals have
      // certified them and what is still outstanding — instead of a
      // featureless "please wait".
      const { rows: certifications } = awaitingApproval
        ? await pool.query(
            `SELECT o.name AS organization_name, r.status
               FROM public.organization_membership_requests r
               JOIN public.organizations o ON o.id = r.organization_id
              WHERE r.doctor_id = $1 AND r.is_registration = TRUE AND r.status <> 'cancelled'
              ORDER BY r.created_at`,
            [user.id]
          )
        : { rows: [] };
      res.status(403).json(
        awaitingApproval
          ? {
              awaitingApproval: true,
              registrationProgress: { certifications },
              message: 'Your registration is still waiting for an administrator to approve it. You will be emailed once it is approved — there is nothing you need to do in the meantime.',
            }
          : {
              accountDeactivated: true,
              message: 'This account has been deactivated. Please contact support if you think this is a mistake.',
            }
      );
      return;
    }

    // PRO-11: "the account can act at once" — an unverified address meant
    // anyone could register as a patient against someone else's email, or a
    // typo'd one, and immediately use the account. Checked after the password
    // so this reveals nothing to someone who does not already hold the
    // credentials. `emailUnverified` lets the client offer a resend button
    // rather than leaving the user at a dead end.
    if (!user.email_verified_at && isEnabled('REQUIRE_EMAIL_VERIFICATION')) {
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'denied',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: { reason: 'email_unverified' },
      });
      res.status(403).json({
        message: 'Please confirm your email address before signing in. Enter the 6-digit code we email you.',
        emailUnverified: true,
      });
      return;
    }

    // SEC-14: password alone isn't enough for an MFA-enrolled account — hand
    // back a short-lived pre-auth token (not a real session) that only proves
    // "this request already knows the password"; mfaLogin exchanges it + a
    // valid TOTP code for the actual session token.
    // CICD-12/SEC-14: lets MFA be made mandatory for admins without a deploy
    // — useful during an incident (see runbooks/suspected-data-exposure.md).
    // Default off, so behaviour is unchanged until someone turns it on.
    if (user.role === 'admin' && !user.mfa_enabled && isEnabled('REQUIRE_ADMIN_MFA')) {
      audit(req, {
        action: AuditAction.LOGIN_FAILURE,
        outcome: 'denied',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        metadata: { reason: 'admin_mfa_required' },
      });
      res.status(403).json({
        message: 'Multi-factor authentication is required for admin accounts. Contact another administrator to enrol.',
      });
      return;
    }

    if (user.mfa_enabled) {
      const mfaToken = jwt.sign(
        { id: user.id, purpose: MFA_PENDING_PURPOSE },
        process.env.JWT_SECRET as string,
        { expiresIn: '5m' }
      );
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    const memberships = await getMembershipsForUser(user.id);
    const organization = memberships.find(m => m.member_role === 'owner') ?? memberships[0] ?? null;
    const plan = await personalPlan(user);
    const { password: _, mfa_secret: __, ...safeUser } = user;
    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { mfa: false },
    });
    res.json({ user: { ...safeUser, organization, memberships, plan }, token: generateToken(user), refreshToken: await issueRefreshToken(user.id) });
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

    const memberships = await getMembershipsForUser(user.id);
    const organization = memberships.find(m => m.member_role === 'owner') ?? memberships[0] ?? null;
    const plan = await personalPlan(user);
    const { password: _, mfa_secret: __, ...safeUser } = user;
    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { mfa: true },
    });
    res.json({ user: { ...safeUser, organization, memberships, plan }, token: generateToken(user), refreshToken: await issueRefreshToken(user.id) });
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
      // COMP-02: accepted_terms_version is returned so the client can tell
      // whether this person is on the current policy version and prompt if
      // not. email_verified_at goes with it as the same kind of
      // account-standing fact the UI may need to surface.
      'SELECT id, name, email, role, is_active, mfa_enabled, created_at, accepted_terms_version, email_verified_at FROM users WHERE id = $1',
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

    // Must match what login returns, or refreshing the page would lose the
    // dashboard switcher until the next sign-in.
    const memberships = await getMembershipsForUser(req.user.id);
    const organization = memberships.find(m => m.member_role === 'owner') ?? memberships[0] ?? null;
    res.json({ ...user, profile, organization, memberships, plan: await personalPlan(user) });
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
    void sendPasswordChangedEmail(user, 'changed');

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

// Links in emails are built from CLIENT_URL. Unset, the old code produced
// either a relative URL (useless in an email client) or the literal string
// "undefined/reset-password?token=..." — a delivered email containing a
// broken link, which is harder to diagnose than no email at all. Production
// already requires CLIENT_URL at boot (ARCH-04); this covers development,
// where it is optional, by refusing to send rather than sending nonsense.
const buildClientLink = (path: string): string => {
  const base = process.env.CLIENT_URL?.trim().replace(/\/$/, '');
  if (!base) {
    throw Object.assign(
      new Error('CLIENT_URL is not set, so the link in this email would be broken. Set CLIENT_URL to the client origin (e.g. http://localhost:5173).'),
      { status: 500 }
    );
  }
  return `${base}${path}`;
};

// PRO-11 / migration 017 — email verification by a 6-digit code.
//
// The code is emailed at registration (every role — a professional proves the
// address up front, before the registration goes into the admin queue) and
// typed into the registration or sign-in screen. Only SHA-256("<id>:<code>")
// is stored. A code lives 15 minutes, is single-use, and is burned after 5
// wrong guesses — together with authLimiter that keeps the 10^6 space out of
// brute-force reach. Issuing a new code invalidates every older one, so only
// the newest email in someone's inbox works.
const EMAIL_CODE_MINUTES = 15;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const EMAIL_CODES_PER_HOUR = 5;

const hashEmailCode = (userId: number, code: string): string =>
  crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

// Issues a code and emails it. Called on registration, by the resend endpoint
// and when an admin approves an account that somehow is still unverified.
// Deliberately swallows nothing — a mail failure must surface, or a user
// waits forever for an email that was never sent.
const sendVerificationEmail = async (user: { id: number; name: string; email: string }): Promise<void> => {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + EMAIL_CODE_MINUTES * 60 * 1000);
  await pool.query(
    'UPDATE public.email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [user.id]
  );
  await pool.query(
    'INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [user.id, hashEmailCode(user.id, code), expiresAt]
  );

  let link: string | undefined;
  try { link = buildClientLink(`/verify-email?email=${encodeURIComponent(user.email)}`); } catch { link = undefined; }
  const mail = verificationCodeEmail({ name: user.name, code, minutes: EMAIL_CODE_MINUTES, link });
  await sendMail(user.email, mail.subject, mail.html, { text: mail.text });
};

// Everything the client needs to start a session — the same shape login
// returns, so every way in (password, MFA, email code, Google) ends in the
// same place on the client.
const sessionPayload = async (user: DbUser) => {
  const memberships = await getMembershipsForUser(user.id);
  const organization = memberships.find(m => m.member_role === 'owner') ?? memberships[0] ?? null;
  const plan = await personalPlan(user);
  const { password: _, mfa_secret: __, ...safeUser } = user;
  return {
    user: { ...safeUser, organization, memberships, plan },
    token: generateToken(user),
    refreshToken: await issueRefreshToken(user.id),
  };
};

// Checks a code. On success the address is confirmed and:
//   - an active account (a patient) is signed straight in — registration is
//     complete, there is nothing left to wait for;
//   - an account awaiting approval (doctor, organisation owner) is told so.
// Errors are deliberately generic about whether the address exists.
const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, code } = req.body as { email: string; code: string };
    const invalid = { message: 'That code is not correct or has expired. Check the latest email, or request a new code.' };

    const { rows: users } = await pool.query<DbUser>(
      'SELECT * FROM public.users WHERE email = $1 AND deleted_at IS NULL', [email]
    );
    if (!users.length) { res.status(400).json(invalid); return; }
    let user = users[0];

    if (user.email_verified_at) {
      // Already confirmed (a second tab, a double submit). Not a session:
      // without a fresh code this proves nothing, so send them to sign in.
      res.json({ verified: true, message: 'Your email is already confirmed. Please sign in.' });
      return;
    }

    const { rows: tokens } = await pool.query<{ id: number; token_hash: string; attempts: number }>(
      `SELECT id, token_hash, attempts FROM public.email_verification_tokens
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    if (!tokens.length) {
      res.status(400).json({ ...invalid, codeExpired: true });
      return;
    }
    const token = tokens[0];
    const expected = Buffer.from(token.token_hash.trim(), 'hex');
    const given = Buffer.from(hashEmailCode(user.id, String(code)), 'hex');
    const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);

    if (!matches) {
      const attempts = token.attempts + 1;
      const burned = attempts >= EMAIL_CODE_MAX_ATTEMPTS;
      await pool.query(
        `UPDATE public.email_verification_tokens
            SET attempts = $2, used_at = CASE WHEN $3::boolean THEN NOW() ELSE used_at END
          WHERE id = $1`,
        [token.id, attempts, burned]
      );
      res.status(400).json(burned
        ? { message: 'Too many wrong attempts. Request a new code and try again.', codeExpired: true }
        : { message: 'That code is not correct. Please check it and try again.', attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts });
      return;
    }

    await pool.query('UPDATE public.email_verification_tokens SET used_at = NOW() WHERE id = $1', [token.id]);
    const { rows: [updated] } = await pool.query<DbUser>(
      'UPDATE public.users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1 RETURNING *',
      [user.id]
    );
    user = updated ?? user;
    // First confirmation of this address: the account really exists now, so
    // this is when the welcome goes out (professionals: "under review").
    if (user.is_active || !user.approved_at) void sendWelcomeEmail(user, !user.is_active);
    audit(req, {
      action: AuditAction.EMAIL_VERIFIED,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetType: 'user',
      targetId: user.id,
    });

    if (!user.is_active) {
      res.json({
        verified: true,
        awaitingApproval: !user.approved_at,
        message: user.approved_at
          ? 'Email confirmed, but this account has been deactivated. Please contact support.'
          : 'Email confirmed. Your registration is now waiting for an administrator to approve it — we will let you know by email once it is approved.',
      });
      return;
    }

    // An MFA-enrolled account still has to pass MFA — a code proves the inbox,
    // not the second factor.
    if (user.mfa_enabled) {
      res.json({ verified: true, message: 'Email confirmed. Please sign in.' });
      return;
    }

    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { method: 'email_code' },
    });
    res.json({ verified: true, message: 'Email confirmed. Welcome to Suwela!', ...(await sessionPayload(user)) });
  } catch (err) { next(err); }
};

// Resend. Always the same generic response whether or not the address exists
// or is already verified — this endpoint needs no login, so a distinguishing
// response would make it an account-enumeration oracle, exactly as
// forgotPassword avoids.
const resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    const generic = { message: 'If that address needs confirming, a new code has been sent.' };

    const { rows } = await pool.query<{ id: number; name: string; email: string; email_verified_at: Date | null }>(
      'SELECT id, name, email, email_verified_at FROM public.users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    if (!rows.length || rows[0].email_verified_at) { res.json(generic); return; }

    // Per-account ceiling on top of authLimiter's per-IP one: an unthrottled
    // resend is a way to use this server to spam a third party's inbox.
    const { rows: recent } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::bigint AS n FROM public.email_verification_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [rows[0].id]
    );
    if (Number(recent[0].n) >= EMAIL_CODES_PER_HOUR) { res.json(generic); return; }

    await sendVerificationEmail(rows[0]);
    res.json(generic);
  } catch (err) { next(err); }
};

// Google sign-in — patients only.
//
// The browser gets an ID token from Google Identity Services and posts it
// here; it is verified against Google's keys and this app's client id
// (GOOGLE_CLIENT_ID), so a token minted for another site is refused.
//   - An existing patient (matched on google_sub, then on the address) is
//     signed in, and the Google id is linked on first use.
//   - An existing NON-patient is refused: doctors, pharmacies, labs,
//     hospitals and admins sign in with their password (+ MFA) only.
//   - No account yet: a patient account is created. Google has already
//     confirmed the address, so no code is needed.
const GOOGLE_PATIENTS_ONLY = {
  code: 'GOOGLE_PATIENTS_ONLY',
  message: 'Google sign-in is only for patient accounts. Please sign in with your email and password.',
};

let googleClient: OAuth2Client | null = null;
const googleClientId = (): string => (process.env.GOOGLE_CLIENT_ID || '').trim();

const verifyGoogleCredential = async (credential: string): Promise<TokenPayload | null> => {
  const audience = googleClientId();
  googleClient ??= new OAuth2Client(audience);
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    return ticket.getPayload() ?? null;
  } catch {
    return null;
  }
};

const googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!googleClientId()) {
      res.status(503).json({ message: 'Google sign-in is not available right now. Please use your email and password.' });
      return;
    }
    const { credential, accepted_terms_version } = req.body as { credential: string; accepted_terms_version?: string };

    const payload = await verifyGoogleCredential(credential);
    if (!payload?.sub || !payload.email) {
      res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' });
      return;
    }
    if (!payload.email_verified) {
      res.status(400).json({ message: 'This Google account has no verified email address. Please register with your email instead.' });
      return;
    }
    const email = payload.email.trim().toLowerCase();

    const { rows } = await pool.query<DbUser & { google_sub: string | null }>(
      `SELECT * FROM public.users
        WHERE deleted_at IS NULL AND (google_sub = $1 OR LOWER(email) = $2)
        ORDER BY (google_sub = $1) DESC NULLS LAST LIMIT 1`,
      [payload.sub, email]
    );

    let user: DbUser;
    let created = false;
    if (rows.length) {
      user = rows[0];
      if (user.role !== 'patient') {
        audit(req, {
          action: AuditAction.LOGIN_FAILURE, outcome: 'denied',
          actorId: user.id, actorEmail: user.email, actorRole: user.role,
          metadata: { reason: 'google_not_patient', method: 'google' },
        });
        res.status(403).json(GOOGLE_PATIENTS_ONLY);
        return;
      }
      if (!user.is_active) {
        audit(req, {
          action: AuditAction.LOGIN_FAILURE, outcome: 'denied',
          actorId: user.id, actorEmail: user.email, actorRole: user.role,
          metadata: { reason: 'deactivated', method: 'google' },
        });
        res.status(403).json({ accountDeactivated: true, message: 'This account has been deactivated. Please contact support if you think this is a mistake.' });
        return;
      }
      // A different Google account already claimed this address's patient
      // account — refuse rather than silently re-pointing it.
      if (rows[0].google_sub && rows[0].google_sub !== payload.sub) {
        res.status(409).json({ message: 'This email is linked to a different Google account. Please sign in with your email and password.' });
        return;
      }
      const { rows: [linked] } = await pool.query<DbUser>(
        `UPDATE public.users
            SET google_sub = COALESCE(google_sub, $2),
                email_verified_at = COALESCE(email_verified_at, NOW())
          WHERE id = $1 RETURNING *`,
        [user.id, payload.sub]
      );
      user = linked ?? user;
    } else {
      // New patient. They never chose a password, so store a random one
      // nobody knows — "Forgot password" sets a real one if they ever want it.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const name = (payload.name || email.split('@')[0]).slice(0, 150);
        const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        let inserted: DbUser;
        try {
          ({ rows: [inserted] } = await client.query<DbUser>(
            `INSERT INTO public.users
               (name, email, password, role, is_active, email_verified_at, google_sub,
                accepted_terms_version, accepted_terms_at)
             VALUES ($1,$2,$3,'patient',TRUE,NOW(),$4,$5, CASE WHEN $5::varchar IS NULL THEN NULL ELSE NOW() END)
             RETURNING *`,
            [name, email, randomPassword, payload.sub, accepted_terms_version || null]
          ));
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            await client.query('ROLLBACK');
            res.status(409).json({ message: 'An account with this email was just created. Please try signing in again.' });
            return;
          }
          throw err;
        }
        await client.query(
          `SELECT set_config('app.user_id', $1, true), set_config('app.role', 'patient', true)`,
          [String(inserted.id)]
        );
        await createProfile(client, 'patient', inserted.id, {});
        await client.query('COMMIT');
        user = inserted;
        created = true;
        void sendWelcomeEmail(user);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (user.mfa_enabled) {
      const mfaToken = jwt.sign({ id: user.id, purpose: MFA_PENDING_PURPOSE }, process.env.JWT_SECRET as string, { expiresIn: '5m' });
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    audit(req, {
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      metadata: { method: 'google', created },
    });
    res.status(created ? 201 : 200).json({ created, ...(await sessionPayload(user)) });
  } catch (err) { next(err); }
};

// COMP-02: migration 008 recorded which version of the Terms/Privacy Policy
// each person accepted at sign-up, and left existing users NULL on purpose —
// they agreed to documents that did not exist yet. This is how they, and
// anyone on a superseded version after a policy change, accept the current
// one. Without it the column records a gap that can never be closed.
//
// Authenticated: the point is to tie an acceptance to a known person. The
// version is checked against a bounded string and stored as sent; the
// timestamp is the database's, so it cannot be backdated by a client.
const acceptTerms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { version } = req.body as { version: string };
    if (!version) { res.status(400).json({ message: 'A version is required' }); return; }

    const { rows } = await pool.query(
      `UPDATE public.users
          SET accepted_terms_version = $1, accepted_terms_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING accepted_terms_version, accepted_terms_at`,
      [version, req.user.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Account not found' }); return; }

    audit(req, {
      action: AuditAction.TERMS_ACCEPTED,
      targetType: 'user',
      targetId: req.user.id,
      metadata: { version },
    });

    res.json(rows[0]);
  } catch (err) { next(err); }
};

const PASSWORD_RESET_MINUTES = 60;
const PASSWORD_RESETS_PER_HOUR = 5;

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

    const { rows } = await pool.query<DbUser>(
      'SELECT id, name, email, is_active FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [String(email || '').trim()]
    );
    if (!rows.length || !rows[0].is_active) { res.json(generic); return; }
    const user = rows[0];

    // Per-account ceiling on top of authLimiter's per-IP one, so this can't be
    // used to flood someone's inbox. Same generic answer either way.
    const { rows: recent } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::bigint AS n FROM public.password_reset_tokens
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [user.id]
    );
    if (Number(recent[0]?.n ?? 0) >= PASSWORD_RESETS_PER_HOUR) { res.json(generic); return; }

    // Only the newest link works: requesting another cancels older ones.
    await pool.query(
      'UPDATE public.password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000);
    await pool.query(
      'INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [user.id, hashRefreshToken(token), expiresAt]
    );

    const resetUrl = buildClientLink(`/reset-password?token=${token}`);
    const mail = passwordResetEmail({ name: user.name, link: resetUrl, minutes: PASSWORD_RESET_MINUTES });
    try {
      await sendMail(user.email, mail.subject, mail.html, { text: mail.text });
    } catch (mailErr) {
      // Logged, not surfaced: an error only for real accounts would tell a
      // stranger which addresses are registered (the generic answer exists
      // precisely to avoid that).
      logger.error({ err: mailErr, userId: user.id }, 'Could not send the password-reset email');
    }

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

    // Claim the link first, so two simultaneous submissions can't both use it.
    const claimed = await pool.query(
      'UPDATE public.password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [rows[0].id]);
    if (!claimed.rowCount) { res.status(400).json({ message: 'Invalid or expired reset link' }); return; }

    const hash = await bcrypt.hash(newPassword, 10);
    // Opening the emailed link proves the inbox, so an unconfirmed address is
    // confirmed too — a reset is a full account recovery, not a half one.
    const { rows: [owner] } = await pool.query<DbUser>(
      `UPDATE users SET password = $1, updated_at = NOW(), email_verified_at = COALESCE(email_verified_at, NOW())
        WHERE id = $2 RETURNING id, name, email`,
      [hash, rows[0].user_id]
    );
    await revokeRefreshTokens(rows[0].user_id);
    if (owner) void sendPasswordChangedEmail(owner, 'reset');

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

export { register, login, verifyEmail, resendVerification, googleAuth, acceptTerms, sendVerificationEmail, mfaLogin, mfaSetup, mfaVerifySetup, mfaDisable, getMe, createProfile, generateToken, impersonate, listImpersonations, listImpersonationActions, refreshAccessToken, logout, changePassword, forgotPassword, resetPassword };
