import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { createProfile } from './authController';

// Each org type's one "working" login role for a new team member — mirrors
// organizationController.ts's ORG_OWNER_ROLE used at self-registration time.
const ORG_WORKING_ROLE: Record<string, string> = {
  hospital: 'doctor', clinic: 'doctor', pharmacy: 'pharmacist', laboratory: 'laboratory',
};

const getMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT om.id, om.member_role, om.created_at,
             u.id AS user_id, u.name, u.email, u.role, u.is_active
      FROM public.organization_members om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = $1
      ORDER BY (om.member_role = 'owner') DESC, u.name
    `, [req.params.orgId]);
    res.json(rows);
  } catch (err) { next(err); }
};

// Creates a brand-new login (email + password) and attaches it to this org in
// one step — the org owner vouches for them directly, so unlike public
// self-registration this account is active immediately, no admin review.
const inviteMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const orgId = parseInt(req.params.orgId, 10);
    const { name, email, password, is_owner } = req.body as {
      name?: string; email?: string; password?: string; is_owner?: boolean;
    };
    if (!name || !email || !password) { res.status(400).json({ message: 'Name, email, and password are required' }); return; }
    if (password.length < 6) { res.status(400).json({ message: 'Password must be at least 6 characters' }); return; }

    const { rows: [org] } = await client.query('SELECT org_type FROM public.organizations WHERE id=$1', [orgId]);
    if (!org) { res.status(404).json({ message: 'Organization not found' }); return; }
    const workingRole = ORG_WORKING_ROLE[org.org_type];
    if (!workingRole) { res.status(400).json({ message: 'Unsupported organization type' }); return; }

    const existingEmail = await client.query('SELECT id FROM public.users WHERE email = $1', [email]);
    if (existingEmail.rows.length) { res.status(409).json({ message: 'Email already in use' }); return; }

    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await client.query(
      `INSERT INTO public.users (name, email, password, role, is_active)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING id, name, email, role`,
      [name, email, hash, workingRole]
    );

    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`,
      [String(user.id), workingRole]
    );
    await createProfile(client, workingRole, user.id, {});

    const { rows: [membership] } = await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, member_role)
       VALUES ($1, $2, $3) RETURNING *`,
      [orgId, user.id, is_owner ? 'owner' : workingRole]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...membership, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    const { rows: [target] } = await pool.query(
      'SELECT member_role FROM public.organization_members WHERE organization_id=$1 AND user_id=$2',
      [orgId, targetUserId]
    );
    if (!target) { res.status(404).json({ message: 'Member not found' }); return; }

    if (target.member_role === 'owner') {
      const { rows: owners } = await pool.query(
        "SELECT count(*)::int AS n FROM public.organization_members WHERE organization_id=$1 AND member_role='owner'",
        [orgId]
      );
      if (owners[0].n <= 1) { res.status(400).json({ message: 'Cannot remove the last owner' }); return; }
    }

    await pool.query(
      'DELETE FROM public.organization_members WHERE organization_id=$1 AND user_id=$2',
      [orgId, targetUserId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
};

export { getMembers, inviteMember, removeMember };
