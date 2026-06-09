import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.slug, o.name, o.org_type, o.schema_name, o.is_active, o.created_at,
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
    const { rows } = await pool.query(
      'SELECT * FROM public.organizations WHERE slug = $1',
      [slug]
    );
    if (!rows.length) { res.status(404).json({ message: 'Organization not found after provision' }); return; }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

const toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'UPDATE public.organizations SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Organization not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

export { getAll, getMembers, addMember, removeMember, provision, toggleActive };
