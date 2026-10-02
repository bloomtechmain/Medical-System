import { Request, Response, NextFunction } from 'express';
import { pool, getTenantSchema } from '../config/db';

const requireSchema = async (req: Request, res: Response): Promise<string | null> => {
  const schema = await getTenantSchema(req.user.id);
  if (!schema) {
    res.status(400).json({ message: 'No laboratory organization is linked to this account.' });
    return null;
  }
  return schema;
};

// Laboratory's own catalog, including inactive entries — for self-management.
const getMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { rows } = await pool.query(`SELECT * FROM "${schema}".test_catalog ORDER BY test_name`);
    res.json(rows);
  } catch (err) { next(err); }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { test_code, test_name, description, price, turnaround_hours } = req.body as {
      test_code: string; test_name: string; description?: string; price: number; turnaround_hours?: number;
    };
    if (!test_code || !test_name || price == null) {
      res.status(400).json({ message: 'Test code, test name and price are required.' }); return;
    }

    const { rows } = await pool.query(
      `INSERT INTO "${schema}".test_catalog (test_code, test_name, description, price, turnaround_hours)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [test_code, test_name, description || null, price, turnaround_hours || null]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ message: 'A test with this code already exists.' }); return; }
    next(err);
  }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { test_code, test_name, description, price, turnaround_hours } = req.body as {
      test_code: string; test_name: string; description?: string; price: number; turnaround_hours?: number;
    };
    const { rows } = await pool.query(
      `UPDATE "${schema}".test_catalog
       SET test_code=$1, test_name=$2, description=$3, price=$4, turnaround_hours=$5
       WHERE id=$6 RETURNING *`,
      [test_code, test_name, description || null, price, turnaround_hours || null, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Test not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') { res.status(409).json({ message: 'A test with this code already exists.' }); return; }
    next(err);
  }
};

const toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const schema = await requireSchema(req, res);
    if (!schema) return;

    const { rows } = await pool.query(
      `UPDATE "${schema}".test_catalog SET is_active = NOT is_active WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Test not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// Public (patient/doctor) read of one specific lab's active catalog — used
// to show tests + prices when a patient is booking with that lab.
const getForLab = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const labId = parseInt(req.params.laboratoryId, 10);
    const schema = await getTenantSchema(labId);
    if (!schema) { res.json([]); return; }

    const { rows } = await pool.query(
      `SELECT id, test_code, test_name, description, price, turnaround_hours
       FROM "${schema}".test_catalog WHERE is_active = true ORDER BY test_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

export { getMine, create, update, toggleActive, getForLab };
