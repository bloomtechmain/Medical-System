import { Request, Response, NextFunction } from 'express';
import { pool, resolvePharmacySchema } from '../config/db';

// SEC-17 #4: see medicineController.ts — same move from one shared public
// table into each pharmacy's own tenant schema.
const requireSchema = async (req: Request, res: Response): Promise<string | null> => {
  const orgId = parseInt((req.query.organization_id as string) ?? (req.body?.organization_id as string), 10);
  const result = await resolvePharmacySchema(
    { id: req.user.id, role: req.user.role },
    Number.isNaN(orgId) ? undefined : orgId
  );
  if ('error' in result) { res.status(result.status).json({ message: result.error }); return null; }
  return result.schema;
};

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;
    const { rows } = await pool.query(`SELECT * FROM "${schema}".suppliers ORDER BY name`);
    res.json(rows);
  } catch (err) { next(err); }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;
    const { rows } = await pool.query(`SELECT * FROM "${schema}".suppliers WHERE id = $1`, [req.params.id]);
    if (!rows.length) { res.status(404).json({ message: 'Supplier not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;
    const { name, contact, phone, email, address } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO "${schema}".suppliers (name, contact, phone, email, address) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, contact, phone, email, address]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;
    const { name, contact, phone, email, address } = req.body;
    const { rows } = await pool.query(
      `UPDATE "${schema}".suppliers SET name=$1, contact=$2, phone=$3, email=$4, address=$5 WHERE id=$6 RETURNING *`,
      [name, contact, phone, email, address, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Supplier not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;
    const { rowCount } = await pool.query(`DELETE FROM "${schema}".suppliers WHERE id = $1`, [req.params.id]);
    if (!rowCount) { res.status(404).json({ message: 'Supplier not found' }); return; }
    res.status(204).end();
  } catch (err) { next(err); }
};

export { getAll, getOne, create, update, remove };
