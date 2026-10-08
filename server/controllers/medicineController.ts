import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

// PRO-03: nothing was paginated — a list query grew as large as the table,
// forever. The default is deliberately generous (not the same as "a page" in
// the UI sense) so it doesn't silently truncate any list this app realistically
// has today — the client has no page-through controls yet, so a hard cap at
// a small number would just look like data went missing. It still bounds the
// actual failure mode (unbounded growth over months/years), and the limit/
// offset params are there for whenever paging controls are added client-side.
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const parsePaging = (q: Record<string, string | undefined>): { limit: number; offset: number } => {
  const limit  = Math.min(Math.max(parseInt(q.limit as string, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(q.offset as string, 10) || 0, 0);
  return { limit, offset };
};

// PRO-25: medicines were hard-deleted. remove() below now soft-deletes
// (deleted_at) instead; every read here excludes rows with deleted_at set.
// A separate, ops-run purge script removes them for real after a retention
// window (see server/scripts/purgeSoftDeleted.ts).
const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, category, low_stock } = req.query as Record<string, string | undefined>;
    const { limit, offset } = parsePaging(req.query as Record<string, string | undefined>);
    let query = `SELECT m.*, s.name AS supplier_name FROM medicines m
                 LEFT JOIN suppliers s ON m.supplier_id = s.id WHERE m.deleted_at IS NULL`;
    const params: unknown[] = [];

    // PRO-02: medicine search had no minimum length — a 1-character query
    // (or an empty string sent explicitly) forced an unanchored ILIKE scan
    // of every row with no benefit over just listing them.
    if (search && search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
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
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

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
       LEFT JOIN suppliers s ON m.supplier_id = s.id WHERE m.id = $1 AND m.deleted_at IS NULL`,
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
    if ((err as { code?: string }).code === '23514') {
      res.status(400).json({ message: 'price, cost_price and stock_quantity must not be negative' }); return;
    }
    next(err);
  }
};

// PRO-29: an edit used to overwrite stock_quantity with whatever absolute
// value the client had loaded, silently losing any sales recorded in
// between. stock_quantity is no longer accepted here at all — only
// adjustStock (below) can change it, via a relative delta applied atomically
// in the database, never a client-supplied absolute number.
const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name, generic_name, category, description,
      unit, price, cost_price,
      reorder_level, expiry_date, supplier_id, is_active,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE medicines SET name=$1, generic_name=$2, category=$3, description=$4,
        unit=$5, price=$6, cost_price=$7, reorder_level=$8,
        expiry_date=$9, supplier_id=$10, is_active=$11, updated_at=NOW()
       WHERE id=$12 AND deleted_at IS NULL RETURNING *`,
      [name, generic_name, category, description, unit, price, cost_price,
       reorder_level, expiry_date, supplier_id, is_active, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23514') {
      res.status(400).json({ message: 'price and cost_price must not be negative' }); return;
    }
    next(err);
  }
};

// PRO-29: the one and only way to change stock_quantity post-creation.
// `delta` is relative (+received stock, -write-off/correction) and applied
// inside the database with the existing CHECK(stock_quantity >= 0) deciding
// whether it's allowed — never computed from a stale value read earlier by
// the client.
const adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { delta } = req.body as { delta?: number };
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
      res.status(400).json({ message: 'delta must be a non-zero integer' }); return;
    }
    const { rows } = await pool.query(
      `UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [delta, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23514') {
      res.status(409).json({ message: 'That adjustment would take stock below zero' }); return;
    }
    next(err);
  }
};

const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE medicines SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!rowCount) { res.status(404).json({ message: 'Medicine not found' }); return; }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export { getAll, getOne, create, update, adjustStock, remove };
