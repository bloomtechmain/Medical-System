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
      ORDER BY o.created_at DESC, o.id DESC
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
    // An owner can now be an existing user shared across organizations (picked
    // via the owner-search flow in registerOrganization below), so suspending
    // this org must not lock them out of a different org they're still active on.
    if (org.owner_user_id) {
      if (org.is_active) {
        await pool.query('UPDATE public.users SET is_active = TRUE WHERE id = $1', [org.owner_user_id]);
      } else {
        const { rows: otherActive } = await pool.query(
          `SELECT 1 FROM public.organization_members om
           JOIN public.organizations o ON o.id = om.organization_id
           WHERE om.user_id = $1 AND o.id != $2 AND o.is_active = TRUE
           LIMIT 1`,
          [org.owner_user_id, org.id]
        );
        if (!otherActive.length) {
          await pool.query('UPDATE public.users SET is_active = FALSE WHERE id = $1', [org.owner_user_id]);
        }
      }
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

// ── Public owner lookup ───────────────────────────────────────────────────
// Lets the org-register page search for an existing, already-approved user
// to reuse as the new organization's owner instead of creating a fresh login.
// Unauthenticated (registration happens before any session exists), so the
// query is deliberately narrow: requires org_type + a 2+ char query, returns
// only active users whose role matches that org type's owner role, and
// (SEC-17 #5) only name + email — license numbers, specialization, pharmacy/
// lab name were being returned too even though the UI never displays them
// (confirmed by checking client/src/pages/OrgRegister.tsx before removing
// them: it only ever reads .name and .email from these results).
const searchOwnerCandidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { org_type, q } = req.query as { org_type?: string; q?: string };
    const role = ORG_OWNER_ROLE[org_type || ''];
    if (!role) { res.status(400).json({ message: 'Invalid organization type' }); return; }
    if (!q || q.trim().length < 2) { res.json([]); return; }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM public.users u
       WHERE u.role = $1 AND u.is_active = TRUE
         AND (u.name ILIKE $2 OR u.email ILIKE $2)
       ORDER BY u.name LIMIT 10`,
      [role, `%${q.trim()}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// Lets a doctor (at self-registration, or later from Settings) search existing
// hospital/clinic organizations to affiliate with. Public (no session at
// registration time) but deliberately narrow: active orgs only, 2+ char query.
const searchHospitalsClinics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) { res.json([]); return; }

    const { rows } = await pool.query(
      `SELECT id, name, org_type, slug
       FROM public.organizations
       WHERE org_type IN ('hospital','clinic') AND is_active = TRUE
         AND name ILIKE $1
       ORDER BY name LIMIT 10`,
      [`%${q.trim()}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const registerOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let client;
  try {
    client = await pool.connect();
    const {
      org_name, slug, org_type, owner_user_id,
      owner_name, owner_email, owner_password, profile, specializations,
    } = req.body as {
      org_name: string; slug: string; org_type: string;
      owner_user_id?: number;
      owner_name?: string; owner_email?: string; owner_password?: string;
      profile?: Record<string, any>;
      specializations?: string[];
    };

    const role = ORG_OWNER_ROLE[org_type];
    if (!role) { res.status(400).json({ message: 'Invalid organization type' }); return; }

    const existingSlug = await client.query('SELECT id FROM public.organizations WHERE slug = $1', [slug]);
    if (existingSlug.rows.length) { res.status(409).json({ message: 'That organization slug is already taken' }); return; }

    // Owner is either an existing, already-approved user picked via the
    // search box (reused as-is, no new login created) or a brand-new account
    // entered manually — same two paths the form offers.
    let existingOwner: { id: number; name: string; email: string } | null = null;
    if (owner_user_id) {
      const { rows } = await client.query(
        'SELECT id, name, email, role, is_active FROM public.users WHERE id = $1',
        [owner_user_id]
      );
      if (!rows.length) { res.status(404).json({ message: 'Selected owner account not found' }); return; }
      if (rows[0].role !== role) { res.status(400).json({ message: `Selected owner must be a registered ${role}` }); return; }
      if (!rows[0].is_active) { res.status(400).json({ message: 'Selected owner account is not active' }); return; }
      existingOwner = rows[0];
    } else {
      if (!owner_name || !owner_email || !owner_password) {
        res.status(400).json({ message: 'Owner name, email, and password are required' });
        return;
      }
      const existingEmail = await client.query('SELECT id FROM public.users WHERE email = $1', [owner_email]);
      if (existingEmail.rows.length) { res.status(409).json({ message: 'Email already in use' }); return; }
    }

    await client.query('BEGIN');

    let owner: { id: number; name: string; email: string };
    if (existingOwner) {
      owner = existingOwner;
    } else {
      const hash = await bcrypt.hash(owner_password as string, 10);
      const { rows: [newUser] } = await client.query(
        `INSERT INTO public.users (name, email, password, role, is_active)
         VALUES ($1,$2,$3,$4, FALSE) RETURNING id, name, email, role`,
        [owner_name, owner_email, hash, role]
      );
      if (profile) await createProfile(client, role, newUser.id, profile);
      owner = newUser;
    }

    await client.query('SELECT public.provision_tenant($1, $2, $3, $4)', [slug, org_name, org_type, owner.id]);

    // provision_tenant() always creates the org with is_active = TRUE (the
    // column default) — force it back to FALSE since this org is pending review.
    await client.query('UPDATE public.organizations SET is_active = FALSE WHERE slug = $1', [slug]);

    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, member_role)
       SELECT id, $2, 'owner' FROM public.organizations WHERE slug = $1`,
      [slug, owner.id]
    );

    const cleanSpecs = (specializations || []).map(s => s.trim()).filter(Boolean);
    if (cleanSpecs.length) {
      const { rows: [{ id: orgId }] } = await client.query('SELECT id FROM public.organizations WHERE slug = $1', [slug]);
      const values: string[] = [];
      const params: unknown[] = [];
      cleanSpecs.forEach((name, i) => {
        values.push(`($${i * 2 + 1},$${i * 2 + 2})`);
        params.push(orgId, name);
      });
      await client.query(
        `INSERT INTO public.organization_specializations (organization_id, name) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`,
        params
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: existingOwner
        ? 'Registration submitted. An administrator will review your organization — your existing account will gain access to it once approved.'
        : 'Registration submitted. An administrator will review your organization and you’ll be able to sign in once it’s approved.',
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
};

export { getAll, getMembers, addMember, removeMember, provision, toggleActive, registerOrganization, searchOwnerCandidates, searchHospitalsClinics };
