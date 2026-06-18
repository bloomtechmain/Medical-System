import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { createProfile } from './authController';

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.slug, o.name, o.org_type, o.schema_name, o.is_active, o.approved_at, o.created_at,
             u.name  AS owner_name,
             u.email AS owner_email,
             COUNT(DISTINCT m.user_id)::int AS member_count
      FROM public.organizations o
      LEFT JOIN public.users u ON u.id = o.owner_user_id
      LEFT JOIN public.organization_members m ON m.organization_id = o.id
      GROUP BY o.id, u.name, u.email
      ORDER BY o.org_type, o.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
};

const getMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT om.id, om.member_role, om.created_at,
             u.id AS user_id, u.name, u.email, u.role, u.is_active
      FROM public.organization_members om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = $1
      ORDER BY u.name
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
};

const addMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user_id, member_role } = req.body as { user_id: number; member_role: string };
    const { rows } = await pool.query(`
      INSERT INTO public.organization_members (organization_id, user_id, member_role)
      VALUES ($1, $2, $3)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role
      RETURNING *
    `, [req.params.id, user_id, member_role]);
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    if (!rowCount) { res.status(404).json({ message: 'Member not found' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

const provision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slug, name, org_type, owner_user_id } = req.body as {
      slug: string; name: string; org_type: string; owner_user_id?: number;
    };
    await pool.query(
      `SELECT public.provision_tenant($1, $2, $3, $4)`,
      [slug, name, org_type, owner_user_id || null]
    );
    // Admin-created orgs are implicitly trusted — stamp approved_at immediately
    // so they never show up as "Pending Approval" in the admin UI.
    const { rows } = await pool.query(
      `UPDATE public.organizations SET approved_at = NOW() WHERE slug = $1 AND approved_at IS NULL RETURNING *`,
      [slug]
    );
    if (!rows.length) {
      const existing = await pool.query('SELECT * FROM public.organizations WHERE slug = $1', [slug]);
      if (!existing.rows.length) { res.status(404).json({ message: 'Organization not found after provision' }); return; }
      res.status(201).json(existing.rows[0]);
      return;
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

const toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // SET expressions evaluate against the OLD row, so `NOT is_active` flips it,
    // and the CASE checks the OLD value to detect a false->true transition (i.e.
    // an approval) and stamps approved_at the first time that happens.
    const { rows } = await pool.query(`
      UPDATE public.organizations
      SET is_active   = NOT is_active,
          approved_at = CASE WHEN NOT is_active AND approved_at IS NULL THEN NOW() ELSE approved_at END
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    if (!rows.length) { res.status(404).json({ message: 'Organization not found' }); return; }

    const org = rows[0];
    // Mirror the org's active state onto its owner's login so approving an
    // organization also unblocks the owner, and suspending one blocks them again.
    if (org.owner_user_id) {
      await pool.query('UPDATE public.users SET is_active = $1 WHERE id = $2', [org.is_active, org.owner_user_id]);
    }
    res.json(org);
  } catch (err) { next(err); }
};

// ── Public self-registration ──────────────────────────────────────────────
// Lets a hospital/pharmacy/laboratory/clinic register itself from the landing
// page. Creates a login-capable "owner" user, the matching profile row, and
// provisions the tenant schema — but leaves both the org and the owner
// INACTIVE pending admin review (see toggleActive above for the approval step).
const ORG_OWNER_ROLE: Record<string, string> = {
  hospital:   'doctor',
  clinic:     'doctor',
  pharmacy:   'pharmacist',
  laboratory: 'laboratory',
};

const registerOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { org_name, slug, org_type, owner_name, owner_email, owner_password, profile } = req.body as {
      org_name: string; slug: string; org_type: string;
      owner_name: string; owner_email: string; owner_password: string;
      profile?: Record<string, any>;
    };

    const role = ORG_OWNER_ROLE[org_type];
    if (!role) { res.status(400).json({ message: 'Invalid organization type' }); return; }

    const existingEmail = await client.query('SELECT id FROM public.users WHERE email = $1', [owner_email]);
    if (existingEmail.rows.length) { res.status(409).json({ message: 'Email already in use' }); return; }

    const existingSlug = await client.query('SELECT id FROM public.organizations WHERE slug = $1', [slug]);
    if (existingSlug.rows.length) { res.status(409).json({ message: 'That organization slug is already taken' }); return; }

    await client.query('BEGIN');

    const hash = await bcrypt.hash(owner_password, 10);
    const { rows: [owner] } = await client.query(
      `INSERT INTO public.users (name, email, password, role, is_active)
       VALUES ($1,$2,$3,$4, FALSE) RETURNING id, name, email, role`,
      [owner_name, owner_email, hash, role]
    );

    if (profile) await createProfile(client, role, owner.id, profile);

    await client.query('SELECT public.provision_tenant($1, $2, $3, $4)', [slug, org_name, org_type, owner.id]);

    // provision_tenant() always creates the org with is_active = TRUE (the
    // column default) — force it back to FALSE since this org is pending review.
    await client.query('UPDATE public.organizations SET is_active = FALSE WHERE slug = $1', [slug]);

    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, member_role)
       SELECT id, $2, 'owner' FROM public.organizations WHERE slug = $1`,
      [slug, owner.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Registration submitted. An administrator will review your organization and you’ll be able to sign in once it’s approved.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export { getAll, getMembers, addMember, removeMember, provision, toggleActive, registerOrganization };
