import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, category, low_stock } = req.query as Record<string, string | undefined>;
    let query = `SELECT m.*, s.name AS supplier_name FROM medicines m
                 LEFT JOIN suppliers s ON m.supplier_id = s.id WHERE 1=1`;
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (m.name ILIKE $${params.length} OR m.generic_name ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      query += ` AND m.category = $${params.length}`;
    }
    if (low_stock === 'true') {
      query += ` AND m.stock_quantity <= m.reorder_level`;
    }
    query += ' ORDER BY m.name';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, s.name AS supplier_name FROM medicines m
       LEFT JOIN suppliers s ON m.supplier_id = s.id WHERE m.id = $1`,
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name, generic_name, category, description,
      unit, price, cost_price, stock_quantity,
      reorder_level, expiry_date, supplier_id,
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO medicines
         (name, generic_name, category, description, unit, price, cost_price,
          stock_quantity, reorder_level, expiry_date, supplier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, generic_name, category, description, unit, price, cost_price,
       stock_quantity, reorder_level, expiry_date, supplier_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name, generic_name, category, description,
      unit, price, cost_price, stock_quantity,
      reorder_level, expiry_date, supplier_id, is_active,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE medicines SET name=$1, generic_name=$2, category=$3, description=$4,
        unit=$5, price=$6, cost_price=$7, stock_quantity=$8, reorder_level=$9,
        expiry_date=$10, supplier_id=$11, is_active=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, generic_name, category, description, unit, price, cost_price,
       stock_quantity, reorder_level, expiry_date, supplier_id, is_active, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query('DELETE FROM medicines WHERE id = $1', [req.params.id]);
    if (!rowCount) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export { getAll, getOne, create, update, remove };
